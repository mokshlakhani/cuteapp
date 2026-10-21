import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, rand } from '../../core/math';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { Face, drawFace } from '../../render/face';
import { SLICE_FRUITS, type SliceFruit } from './fruits';
import { MAX_CUTS, dressSlice, makeSliceMaterial, type SliceUniforms } from './material';
import { corners, cutAll, cutMask, faceNormal, massProps, onSkin, outside, revolve, skinNormal, type Poly, type Shape, type V3 } from './polyhedron';
import { buildExtras, disposeExtra, type Extra } from './extras';

/**
 * The slice table: a fruit floating over a wooden board, seen from a calm,
 * low three-quarter view and lit like the rest of soft spot (one soft key
 * light from the upper left, warm cocoa shadows). It turns slowly, so a
 * stroke across the screen cuts it along a different plane each time.
 *
 * Whole, it's one smooth mesh. From the first cut it's drawn as the pieces
 * it really is — each with seams only for the cuts that went through it — so
 * what you see always matches the count. At the end those same pieces fall
 * apart, tumble onto the board and settle in a little heap.
 */

const FACE_PX = 256;
/** The board: width, thickness, depth (scene units). */
const BOARD = { w: 6.4, h: 0.34, d: 4.3 };
/** How high the fruit's middle floats. */
const FLOAT_Y = BOARD.h + 3.2;
/** Camera: low three-quarter view. */
const ELEV = 13;
const LOOK_Y = 2.4;
const GRAVITY = 26;

/** One fallen piece: a small rigid body with corners that touch the board. */
interface Chunk {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  q: THREE.Quaternion;
  vel: THREE.Vector3;
  w: THREE.Vector3;
  /** Corners relative to its centre of mass. */
  pts: THREE.Vector3[];
  /** Radius of gyration (for its spin) and of its bounding sphere. */
  gyr: number;
  reach: number;
  size: number;
  landed: boolean;
  settled: boolean;
  calm: number;
  /** Seconds it's been on the board: past a few, it's put to rest whatever it's doing. */
  ground: number;
  /** Shrinks away when it's cleared (1 → 0). */
  scale: number;
  delay: number;
}

interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: number;
}

export interface SliceEvents {
  /** A piece hit the board (first touch, or a hard bounce). */
  land?(size: number, speed: number, at: THREE.Vector3): void;
  /** A piece shrank away while clearing. */
  gone?(at: THREE.Vector3, size: number, i: number): void;
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const tmpE = new THREE.Euler();
const tmpRay = new THREE.Ray();
const tmpS = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
/** The smallest piece that counts, as a share of the whole fruit. */
const MIN_PIECE = 0.015;
/** The whole fruit's mesh (smooth), and the faceted solid the knife cuts (finer is smoother pieces, slower cuts). */
const WHOLE = { lat: 64, lon: 96 };
const SOLID = { lat: 30, lon: 52 };

export class SliceScene {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  readonly face = new Face();
  readonly squash = new Spring(0, springs.wobbly);
  readonly sway = new Spring(0, springs.wobbly);
  /** Is the room on screen (so the home card leaves it alone)? */
  active = false;
  fruit: SliceFruit = SLICE_FRUITS[0];
  /** The fruit as it is now: the pieces it's been cut into, still together. */
  pieces: Poly[] = [];
  /** Height above its floating place (for the drop-in). */
  lift = 0;
  /** Shiver before it falls apart (0..1). */
  tremble = 0;
  events: SliceEvents = {};

  private root = new THREE.Group();
  private whole: THREE.Mesh;
  private wholeGeo: THREE.BufferGeometry | null = null;
  private skin: { mat: THREE.MeshPhysicalMaterial; uniforms: SliceUniforms };
  /** The pieces it's been cut into, still together, each as a mesh in the fruit's frame. */
  private parts = new Map<Poly, THREE.Mesh>();
  /** It has fallen apart onto the board. */
  private fallen = false;
  private faceCanvas = document.createElement('canvas');
  private faceTex: THREE.CanvasTexture;
  private faceSig = '';
  /** Stems, leaves, tips and scales: on the whole fruit, then on whichever piece they sit on. */
  private extras: Extra[] = [];
  private cuts = 0;
  private chunks: Chunk[] = [];
  private chunkGroup = new THREE.Group();
  private drops: Drop[] = [];
  private dropMesh: THREE.InstancedMesh;
  private dropMat: THREE.MeshStandardMaterial;
  private ray = new THREE.Raycaster();
  private time = rand(0, 20);
  /** How the fruit is turned: by your finger, plus a slow drift while it's left alone. */
  private turnQ = new THREE.Quaternion();
  /** Spin left over from a turning drag (rad/s about world y, and about the camera's right). */
  private spin = { yaw: 0, pitch: 0 };
  /** Seconds since you last turned it (the idle drift fades back in after a while). */
  private idle = 10;
  /** The smallest piece that counts: a cut that would shave off less leaves that piece whole. */
  private minVolume = 0;
  /** A soft blob shadow under the floating fruit (no shadow-map pass needed while it floats). */
  private blob: THREE.Mesh;
  private dist = 30;
  private viewOffset = 0;
  private w = 1;
  private h = 1;
  private shadowsDirty = true;
  private clearing = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    // Redrawn only while something moves (see render).
    this.renderer.shadowMap.autoUpdate = false;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;

    this.scene.add(new THREE.HemisphereLight('#fff8ef', '#d9cfc3', 0.95));
    const key = new THREE.DirectionalLight('#fff4e6', 2.3);
    key.position.set(-9, 16, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const sc = key.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 8;
    sc.bottom = -8;
    sc.near = 1;
    sc.far = 60;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 6;
    key.shadow.blurSamples = 8;
    this.scene.add(key, key.target);

    // The app's warm shadow tone, on an invisible table.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: new THREE.Color('rgb(128, 84, 62)'), opacity: 0.3 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // The cutting board: soft-cornered pale wood.
    const board = new THREE.Mesh(
      new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.13),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.72, metalness: 0, envMapIntensity: 0.5 }),
    );
    board.position.y = BOARD.h / 2;
    board.receiveShadow = true;
    board.castShadow = true;
    this.scene.add(board);

    this.skin = makeSliceMaterial();
    this.faceCanvas.width = this.faceCanvas.height = FACE_PX;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.skin.uniforms.uFace.value = this.faceTex;
    this.skin.uniforms.uFaceOn.value = 1;
    this.whole = new THREE.Mesh(new THREE.BufferGeometry(), this.skin.mat);
    this.root.add(this.whole);
    this.scene.add(this.root, this.chunkGroup);

    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = BOARD.h + 0.005;
    this.scene.add(this.blob);

    this.dropMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, envMapIntensity: 0.9 });
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.dropMat, 48);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    this.setFruit(this.fruit);

    // Compile the shaders now (pieces, and their shadows), not on the frame of the first cut.
    const warm = new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 3), makeSliceMaterial(this.skin.uniforms).mat);
    warm.castShadow = true;
    warm.geometry.setAttribute('aRest', warm.geometry.attributes.position.clone());
    this.scene.add(warm);
    this.renderer.compile(this.scene, this.camera);
    this.scene.remove(warm);
    warm.geometry.dispose();
    (warm.material as THREE.Material).dispose();
  }

  // ——— the fruit ———

  /** A fresh, whole fruit (held `lift` above its floating place). */
  setFruit(fruit: SliceFruit, lift = 0) {
    this.fruit = fruit;
    dressSlice(this.skin.mat, this.skin.uniforms, fruit);
    this.clearParts();
    this.fallen = false;
    this.dropMat.color.set(fruit.juice);
    const [rx, ry, rz] = fruit.radii;
    const g = wholeGeometry(fruit.shape, fruit.radii);
    this.wholeGeo?.dispose();
    this.wholeGeo = g;
    this.whole.geometry = g;
    this.pieces = [revolve(fruit.shape, rx, ry, rz, SOLID.lat, SOLID.lon)];
    this.minVolume = massProps(this.pieces[0]).volume * MIN_PIECE;
    this.cuts = 0;
    // Each fruit arrives facing you, a little turned.
    this.turnQ.setFromEuler(new THREE.Euler(rand(-0.2, 0.2), rand(-0.5, 0.5), rand(-0.15, 0.15)));
    this.spin.yaw = this.spin.pitch = 0;
    this.skin.uniforms.uCutCount.value = 0;
    this.whole.visible = true;
    this.root.scale.set(1, 1, 1);
    this.lift = lift;
    this.tremble = 0;
    this.squash.snap(0);
    this.sway.snap(0);
    this.clearChunks();
    for (const e of this.extras) {
      e.obj.removeFromParent();
      disposeExtra(e);
    }
    this.extras = buildExtras(fruit);
    for (const e of this.extras) {
      // Floating, the blob is its only shadow; extras cast once they fall.
      e.obj.traverse((o) => (o.castShadow = false));
      this.root.add(e.obj);
    }
    this.faceSig = '';
    this.shadowsDirty = true;
    // Compile anything new (a fruit's leaves and scales) now, while it drops
    // in, rather than on the frame of the first cut. Cheap when nothing is new.
    this.renderer.compile(this.scene, this.camera);
  }

  get radius() {
    return Math.max(...this.fruit.radii);
  }

  get cutCount() {
    return this.cuts;
  }

  /**
   * Cut along the screen line through (ax, ay) and (bx, by): the plane
   * through the camera and that line. Returns how many pieces it added, or
   * null if it missed the fruit.
   */
  cut(ax: number, ay: number, bx: number, by: number): { added: number; at: THREE.Vector3; dir: THREE.Vector3 } | null {
    if (this.fallen || this.cuts >= MAX_CUTS) return null;
    if (Math.hypot(bx - ax, by - ay) < 8) return null;
    const ra = this.rayFrom(ax, ay).ray.direction.clone();
    const rb = this.rayFrom(bx, by).ray.direction.clone();
    const c = this.root.position.clone();
    // The plane through your eye and the line you drew.
    const n = new THREE.Vector3().crossVectors(ra, rb).normalize();
    const world = new THREE.Plane().setFromNormalAndCoplanarPoint(n, this.camera.position);
    this.root.updateMatrixWorld(true);
    const local = world.clone().applyMatrix4(tmpM.copy(this.root.matrixWorld).invert());
    const added = this.cutLocal([local.normal.x, local.normal.y, local.normal.z], -local.constant);
    if (added === null) return null;

    // Where it went in, for juice and sound: the fruit's middle, moved onto the cut.
    const at = c.clone().addScaledVector(n, -world.distanceToPoint(c));
    const along = rb.clone().sub(ra);
    const dir = along.addScaledVector(n, -along.dot(n)).normalize();
    this.splash(at, n, dir);
    this.squash.impulse(-2.2);
    this.sway.impulse(rand(-1, 1) * 1.6);
    return { added, at, dir };
  }

  /** Cut along a plane n·p = d in the fruit's own space. Returns how many pieces it added, or null if it missed. */
  cutLocal(n: V3, d: number) {
    if (this.fallen || this.cuts >= MAX_CUTS) return null;
    const res = cutAll(this.pieces, { n, d }, this.minVolume, this.cuts);
    if (!res.split) return null;
    const added = res.pieces.length - this.pieces.length;
    this.pieces = res.pieces;
    this.syncParts();
    const u = this.skin.uniforms;
    u.uCuts.value[this.cuts].set(n[0], n[1], n[2], d);
    u.uGlow.value[this.cuts] = 1;
    this.cuts++;
    u.uCutCount.value = this.cuts;
    return added;
  }

  /** Draw the fruit as its pieces: keep the meshes of pieces that weren't cut, make ones for the new. */
  private syncParts() {
    this.whole.visible = false;
    const keep = new Set(this.pieces);
    for (const [p, m] of this.parts) {
      if (keep.has(p)) continue;
      this.root.remove(m);
      disposeMesh(m);
      this.parts.delete(p);
    }
    for (const p of this.pieces) if (!this.parts.has(p)) this.parts.set(p, this.makePart(p));
  }

  private makePart(p: Poly) {
    const { centre, volume } = massProps(p);
    const { mat, uniforms } = makeSliceMaterial(this.skin.uniforms);
    mat.roughness = this.skin.mat.roughness;
    mat.clearcoat = this.skin.mat.clearcoat;
    uniforms.uFaceOn.value = 1;
    uniforms.uCutMask.value = cutMask(p);
    const mesh = new THREE.Mesh(pieceGeometry(p, centre, this.fruit), mat);
    mesh.position.set(...centre);
    mesh.userData = { centre, volume, u: uniforms };
    this.root.add(mesh);
    return mesh;
  }

  private clearParts() {
    for (const m of this.parts.values()) {
      this.root.remove(m);
      disposeMesh(m);
    }
    this.parts.clear();
  }

  /**
   * Turn the fruit by a finger drag of (dx, dy) px: sideways spins it about
   * the vertical, up and down tips it toward or away from you. `dt` is the
   * time the drag took, so letting go leaves it spinning on a little.
   */
  turn(dx: number, dy: number, dt: number) {
    const k = (Math.PI * 1.1) / Math.max(320, this.w);
    const yaw = dx * k;
    const pitch = dy * k;
    this.rotateBy(yaw, pitch);
    if (dt > 0) {
      // A flick carries on a little, not round and round.
      this.spin.yaw = lerp(this.spin.yaw, (yaw / dt) * 0.6, 0.5);
      this.spin.pitch = lerp(this.spin.pitch, (pitch / dt) * 0.6, 0.5);
    }
    this.idle = 0;
    return Math.hypot(yaw, pitch);
  }

  /** Hold it still (a finger came down to turn it). */
  grab() {
    this.spin.yaw = this.spin.pitch = 0;
    this.idle = 0;
  }

  private rotateBy(yaw: number, pitch: number) {
    // About the world's vertical, and about the camera's right-hand axis.
    tmpQ.setFromAxisAngle(UP, yaw);
    this.turnQ.premultiply(tmpQ);
    tmpV.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    tmpQ.setFromAxisAngle(tmpV, pitch);
    this.turnQ.premultiply(tmpQ).normalize();
  }

  /** A few drops of juice fly off along the cut. */
  private splash(at: THREE.Vector3, n: THREE.Vector3, dir: THREE.Vector3) {
    const R = this.radius;
    for (let i = 0; i < 14; i++) {
      if (this.drops.length >= 48) this.drops.shift();
      const along = rand(-0.9, 0.9) * R;
      const side = Math.random() < 0.5 ? -1 : 1;
      const pos = at.clone().addScaledVector(dir, along);
      const vel = n
        .clone()
        .multiplyScalar(side * rand(1.5, 4))
        .addScaledVector(dir, rand(1, 4))
        .add(new THREE.Vector3(0, rand(1, 4), 0));
      this.drops.push({ pos, vel, life: rand(0.5, 0.9), size: rand(0.035, 0.08) });
    }
  }

  /** It falls apart: every piece becomes a body that drops onto the board (the same meshes, no rebuilding). */
  fallApart() {
    if (!this.parts.size) this.syncParts();
    this.root.updateMatrixWorld(true);
    const m = this.root.matrixWorld;
    const wq = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), wq, new THREE.Vector3());
    const total = this.pieces.reduce((s, p) => s + this.parts.get(p)!.userData.volume, 0);
    this.clearChunks();
    // Each stem, leaf or scale goes with the piece it's sitting on.
    const home = this.extras.map((e) => {
      let best = 0;
      let bestD = Infinity;
      this.pieces.forEach((p, i) => {
        const d = outside(p, e.at);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    });
    this.pieces.forEach((p, pi) => {
      const mesh = this.parts.get(p)!;
      const { centre, volume, u } = mesh.userData as { centre: V3; volume: number; u: SliceUniforms };
      // Fallen pieces: no face, no seams.
      u.uFaceOn.value = 0;
      u.uCutMask.value = 0;
      const c = new THREE.Vector3(...centre);
      const pos = c.clone().applyMatrix4(m);
      const pts = contactCorners(p).map((v) => new THREE.Vector3(v[0] - centre[0], v[1] - centre[1], v[2] - centre[2]));
      let gyr = 0;
      let reach = 0;
      const all = corners(p);
      for (const v of all) {
        const l2 = (v[0] - centre[0]) ** 2 + (v[1] - centre[1]) ** 2 + (v[2] - centre[2]) ** 2;
        gyr += l2 / all.length;
        reach = Math.max(reach, Math.sqrt(l2));
      }
      // Apart, gently: outward from the middle, a little up, a slow tumble.
      const out = c.clone().applyQuaternion(wq).setY(0).normalize();
      const vel = out.multiplyScalar(rand(0.3, 0.9)).add(new THREE.Vector3(0, rand(0.2, 1), 0));
      const w = new THREE.Vector3(rand(-1.5, 1.5), rand(-0.8, 0.8), rand(-1.5, 1.5));
      this.root.remove(mesh);
      mesh.position.copy(pos);
      mesh.quaternion.copy(wq);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.extras.forEach((e, ei) => {
        if (home[ei] !== pi) return;
        // Same axes as the fruit, so only its place shifts: relative to this piece's middle.
        e.obj.position.sub(c);
        e.obj.traverse((o) => (o.castShadow = true));
        mesh.add(e.obj);
      });
      this.chunkGroup.add(mesh);
      this.chunks.push({
        mesh,
        pos,
        q: wq.clone(),
        vel,
        w,
        pts,
        gyr: Math.sqrt(gyr),
        reach,
        size: clamp(Math.cbrt(volume / total), 0.15, 1),
        landed: false,
        settled: false,
        calm: 0,
        ground: 0,
        scale: 1,
        delay: 0,
      });
    });
    this.parts.clear();
    this.whole.visible = false;
    this.fallen = true;
    this.shadowsDirty = true;
  }

  /** Everything has landed and stopped. */
  get settled() {
    return this.chunks.length > 0 && this.chunks.every((c) => c.settled);
  }

  /** Clear the fallen pieces away, one after another. */
  beginClear() {
    this.clearing = true;
    const order = [...this.chunks].sort((a, b) => a.pos.x - b.pos.x);
    order.forEach((c, i) => (c.delay = 0.05 + i * Math.min(0.06, 1.1 / order.length)));
  }

  /** Clearing done? */
  get cleared() {
    return this.chunks.length === 0;
  }

  private clearChunks() {
    for (const c of this.chunks) {
      this.chunkGroup.remove(c.mesh);
      disposeMesh(c.mesh);
    }
    // Their extras went with them.
    for (const e of this.extras) if (e.obj.parent !== this.root) e.obj.removeFromParent();
    this.chunks = [];
    this.clearing = false;
  }

  /** The piece under a screen point, if any (to poke it). */
  pokeAt(sx: number, sy: number) {
    const hit = this.rayFrom(sx, sy).intersectObjects(
      this.chunks.map((c) => c.mesh),
      false,
    )[0];
    const c = hit && this.chunks.find((k) => k.mesh === hit.object);
    if (!c) return false;
    c.settled = false;
    c.calm = 0;
    c.vel.set(rand(-1.5, 1.5), rand(4, 6), rand(-1.5, 1.5));
    c.w.set(rand(-8, 8), rand(-4, 4), rand(-8, 8));
    this.shadowsDirty = true;
    return true;
  }

  // ——— layout ———

  /** Fit the camera so the board and fruit sit between `top` and `bottom` (px), with `room` to spare. */
  resize(w: number, h: number, dpr: number, top: number, bottom: number, room = 1.12) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const band = Math.max(40, bottom - top);
    const needW = BOARD.w * room;
    const needH = (FLOAT_Y + 1.9) * room;
    this.dist = clamp(Math.max(needW / 2 / (tanV * cam.aspect), ((needH / 2) * (h / band)) / tanV), 10, 90);
    this.viewOffset = h / 2 - (top + bottom) / 2;
    this.placeCamera();
  }

  private placeCamera() {
    const elev = THREE.MathUtils.degToRad(ELEV + Math.sin(this.time * 0.23) * 0.6);
    const az = Math.sin(this.time * 0.17) * 0.03;
    const d = this.dist;
    const cam = this.camera;
    cam.position.set(Math.sin(az) * Math.cos(elev) * d, LOOK_Y + Math.sin(elev) * d, Math.cos(az) * Math.cos(elev) * d);
    cam.lookAt(0, LOOK_Y, 0);
    cam.setViewOffset(this.w, this.h, 0, this.viewOffset, this.w, this.h);
    cam.updateProjectionMatrix();
  }

  // ——— simulation ———

  /** `held`: a finger is down (cutting or turning), so it doesn't drift. */
  update(dt: number, held = false) {
    this.time += dt;
    this.idle += dt;
    // Spin left from a flick slows to a stop; left alone a while, it drifts slowly round.
    const decay = Math.exp(-dt * 5);
    this.spin.yaw *= decay;
    this.spin.pitch *= decay;
    const drift = held ? 0 : smooth01((this.idle - 4) / 3) * 0.22;
    if (!held) this.rotateBy((this.spin.yaw + drift) * dt, this.spin.pitch * dt);
    this.face.update(dt);
    this.squash.update(dt);
    this.sway.update(dt);

    // Float, bob and turn: a slow rock left and right and a gentle nod, so
    // the same stroke cuts a different way each time.
    const q = clamp(this.squash.value * 0.03, -0.16, 0.2);
    const shiver = this.tremble ? Math.sin(this.time * 63) * this.tremble * 0.035 : 0;
    const y = FLOAT_Y + Math.sin(this.time * 1.3) * 0.08 + this.lift;
    this.root.position.set(shiver, y, 0);
    // A gentle living wobble on top of how it's turned.
    tmpE.set(this.sway.value * 0.03 + Math.sin(this.time * 0.9) * 0.03, 0, this.sway.value * 0.02);
    this.root.quaternion.setFromEuler(tmpE).premultiply(this.turnQ);
    this.root.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5);
    // The blob shadow: softer and wider the higher it floats.
    const hgt = Math.max(0, y - BOARD.h);
    const sz = this.radius * (1.9 + hgt * 0.12);
    this.blob.visible = !this.fallen;
    this.blob.scale.set(sz * 1.15, sz * 0.8, 1);
    this.blob.position.set(shiver + 0.55, BOARD.h + 0.005, -0.25);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = clamp(0.62 - hgt * 0.035, 0.15, 0.6);

    const glow = this.skin.uniforms.uGlow.value;
    for (let i = 0; i < this.cuts; i++) glow[i] = Math.max(0.12 + this.tremble * 0.9, glow[i] - dt * 1.6);

    this.stepDrops(dt);
    if (this.chunks.length) {
      const n = Math.max(1, Math.ceil(dt / (1 / 180)));
      for (let i = 0; i < n; i++) this.stepChunks(dt / n);
      if (this.clearing) this.clearStep(dt);
    }
    this.placeCamera();
  }

  private stepDrops(dt: number) {
    const d = this.drops;
    for (const p of d) {
      p.life -= dt;
      p.vel.y -= GRAVITY * 0.6 * dt;
      p.pos.addScaledVector(p.vel, dt);
    }
    this.drops = d.filter((p) => p.life > 0 && p.pos.y > this.groundAt(p.pos.x, p.pos.z));
    const m = this.dropMesh;
    this.drops.forEach((p, i) => {
      const s = p.size * clamp(p.life * 3, 0, 1);
      tmpM.makeScale(s, s, s).setPosition(p.pos);
      m.setMatrixAt(i, tmpM);
    });
    m.count = this.drops.length;
    m.instanceMatrix.needsUpdate = true;
  }

  private groundAt(x: number, z: number) {
    return Math.abs(x) < BOARD.w / 2 && Math.abs(z) < BOARD.d / 2 ? BOARD.h : 0;
  }

  private stepChunks(dt: number) {
    const chunks = this.chunks;
    for (const c of chunks) {
      if (c.settled) continue;
      c.vel.y -= GRAVITY * dt;
      c.pos.addScaledVector(c.vel, dt);
      const wl = c.w.length();
      if (wl > 1e-5) {
        tmpQ.setFromAxisAngle(tmpW.copy(c.w).divideScalar(wl), wl * dt);
        c.q.premultiply(tmpQ).normalize();
      }
      c.w.multiplyScalar(Math.exp(-0.4 * dt));

      // Corners below the board push back: an impulse at each, with friction.
      let deepest = 0;
      let touching = false;
      const invI = 1 / (0.45 * c.gyr * c.gyr);
      for (const v of c.pts) {
        tmpR.copy(v).applyQuaternion(c.q);
        const px = c.pos.x + tmpR.x;
        const py = c.pos.y + tmpR.y;
        const pz = c.pos.z + tmpR.z;
        const pen = this.groundAt(px, pz) - py;
        if (pen <= 0) continue;
        touching = true;
        deepest = Math.max(deepest, pen);
        // Velocity of that corner.
        tmpV.crossVectors(c.w, tmpR).add(c.vel);
        const vn = tmpV.y;
        if (vn >= 0) continue;
        const rxn = tmpW.crossVectors(tmpR, UP);
        const k = 1 + invI * rxn.lengthSq();
        const e = -vn > 3 ? 0.22 : 0;
        const j = (-(1 + e) * vn) / k;
        c.vel.y += j;
        c.w.addScaledVector(rxn, j * invI);
        // Friction against sliding.
        const tx = tmpV.x;
        const tz = tmpV.z;
        const tl = Math.hypot(tx, tz);
        if (tl > 1e-5) {
          const jt = Math.min(tl / k, 0.7 * j);
          const fx = (-tx / tl) * jt;
          const fz = (-tz / tl) * jt;
          c.vel.x += fx;
          c.vel.z += fz;
          tmpV.set(fx, 0, fz);
          c.w.addScaledVector(tmpW.crossVectors(tmpR, tmpV), invI);
        }
        if (!c.landed || -vn > 4) this.events.land?.(c.size, -vn, c.pos);
        c.landed = true;
      }
      if (deepest > 0) c.pos.y += deepest * 0.9;
      // A soft rim round the board, so the pieces stay on it: outward drift just stops.
      const mx = BOARD.w / 2 - c.reach * 0.7;
      const mz = BOARD.d / 2 - c.reach * 0.7;
      if (Math.abs(c.pos.x) > mx) {
        c.pos.x = Math.sign(c.pos.x) * mx;
        if (c.vel.x * c.pos.x > 0) c.vel.x = 0;
      }
      if (Math.abs(c.pos.z) > mz) {
        c.pos.z = Math.sign(c.pos.z) * mz;
        if (c.vel.z * c.pos.z > 0) c.vel.z = 0;
      }
      if (touching) {
        c.vel.x *= Math.exp(-2.2 * dt);
        c.vel.z *= Math.exp(-2.2 * dt);
        c.w.multiplyScalar(Math.exp(-1.6 * dt));
      }
      if (c.landed) c.ground += dt;
      const slow = c.vel.lengthSq() < 0.03 && c.w.lengthSq() < 0.06;
      c.calm = touching && slow ? c.calm + dt : 0;
      if (c.calm > 0.3 || (touching && c.ground > 2.4)) {
        c.settled = true;
        c.vel.set(0, 0, 0);
        c.w.set(0, 0, 0);
      }
    }
    // Pieces nudge each other apart sideways, so they spread into a heap
    // instead of passing through. A piece at rest stays put (it's a wall to
    // the others, never pushed or woken), so nothing jitters in the pile.
    for (let i = 0; i < chunks.length; i++) {
      const a = chunks[i];
      for (let j = i + 1; j < chunks.length; j++) {
        const b = chunks[j];
        if (a.settled && b.settled) continue;
        const rr = (a.reach + b.reach) * 0.42;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        // Only part of the overlap per step: a soft, steady push, not a jolt.
        const push = (rr - d) * 0.25;
        const wa = a.settled ? 0 : b.settled ? 1 : 0.5;
        const wb = 1 - wa;
        a.pos.x -= nx * push * wa;
        a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * wb;
        b.pos.z += nz * push * wb;
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) {
          a.vel.x += nx * rel * wa;
          a.vel.z += nz * rel * wa;
          b.vel.x -= nx * rel * wb;
          b.vel.z -= nz * rel * wb;
        }
      }
    }
    for (const c of chunks) {
      c.mesh.position.copy(c.pos);
      c.mesh.quaternion.copy(c.q);
    }
  }

  private clearStep(dt: number) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.delay -= dt;
      if (c.delay > 0) continue;
      const before = c.scale;
      c.scale = Math.max(0, c.scale - dt * 4.5);
      // A tiny swell before it goes, like a soap bubble.
      const s = c.scale > 0.75 ? 1 + (1 - c.scale) * 0.6 : c.scale * 1.53;
      c.mesh.scale.setScalar(Math.max(0.001, s));
      if (before > 0.5 && c.scale <= 0.5) this.events.gone?.(c.pos, c.size, i);
      if (c.scale <= 0) {
        this.chunkGroup.remove(c.mesh);
        disposeMesh(c.mesh);
        this.chunks.splice(i, 1);
      }
    }
    this.shadowsDirty = true;
  }

  // ——— picking ———

  private rayFrom(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray;
  }

  /** Is this screen point over the whole fruit? (Exact, against its ellipsoid.) */
  overFruit(sx: number, sy: number, slack = 1.04) {
    if (this.fallen) return false;
    this.root.updateMatrixWorld(true);
    const inv = tmpM.copy(this.root.matrixWorld).invert();
    const r = tmpRay.copy(this.rayFrom(sx, sy).ray).applyMatrix4(inv);
    const [rx, ry, rz] = this.fruit.radii;
    const s = tmpS.set(1 / (rx * slack), 1 / (ry * slack), 1 / (rz * slack));
    const o = tmpO.copy(r.origin).multiply(s);
    const d = tmpD.copy(r.direction).multiply(s);
    const a = d.dot(d);
    const b = 2 * o.dot(d);
    const c = o.dot(o) - 1;
    return b * b - 4 * a * c >= 0;
  }

  /** Screen position of a world point. */
  toScreen(v: THREE.Vector3) {
    this.camera.updateMatrixWorld();
    tmpV.copy(v).project(this.camera);
    return { x: ((tmpV.x + 1) / 2) * this.w, y: ((1 - tmpV.y) / 2) * this.h };
  }

  /** The fruit's middle on screen, and its on-screen radius. */
  get screenFruit() {
    const c = this.root.position.clone();
    const a = this.toScreen(c);
    const b = this.toScreen(c.clone().add(new THREE.Vector3(0, this.fruit.radii[1], 0)));
    return { x: a.x, y: a.y, r: Math.abs(b.y - a.y) };
  }

  /** The top of the board's front edge on screen (for the fruit's name). */
  get boardFront() {
    return this.toScreen(new THREE.Vector3(0, 0, BOARD.d / 2));
  }

  // ——— rendering ———

  private drawFace() {
    const sig = this.face.signature;
    if (sig === this.faceSig) return;
    this.faceSig = sig;
    const ctx = this.faceCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, FACE_PX, FACE_PX);
    ctx.save();
    ctx.translate(FACE_PX / 2, FACE_PX / 2);
    drawFace(ctx, this.face, FACE_PX * 0.72, { ink: '#2A1C17', blush: this.fruit.blush });
    ctx.restore();
    this.faceTex.needsUpdate = true;
  }

  render() {
    if (!this.fallen) this.drawFace();
    // Once the pieces have come to rest their shadows stay put: each piece
    // is a draw call, and Safari makes those costly.
    const moving = this.chunks.some((c) => !c.settled);
    this.renderer.shadowMap.needsUpdate = moving || this.shadowsDirty;
    this.shadowsDirty = false;
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}

/** The whole fruit, smooth: its outline turned round the core, shaded by the skin's true normals. */
function wholeGeometry(shape: Shape, radii: V3) {
  const { lat, lon } = WHOLE;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= lat; i++) {
    for (let j = 0; j <= lon; j++) {
      const v = onSkin(shape, radii, (i / lat) * Math.PI, (j / lon) * Math.PI * 2);
      pos.push(...v);
      nrm.push(...skinNormal(shape, radii, v));
    }
  }
  const row = lon + 1;
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * row + j;
      // Wound counter-clockwise seen from outside.
      if (i > 0) idx.push(a, a + 1, a + row);
      if (i < lat - 1) idx.push(a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aRest', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** One piece as a mesh: skin faces shaded round, cut faces flat; positions about its centre of mass. */
function pieceGeometry(p: Poly, centre: V3, fruit: SliceFruit) {
  let tris = 0;
  for (const f of p.faces) tris += f.pts.length - 2;
  const pos = new Float32Array(tris * 9);
  const rest = new Float32Array(tris * 9);
  const nrm = new Float32Array(tris * 9);
  let k = 0;
  for (const f of p.faces) {
    const fn = f.cut ? faceNormal(f.pts) : null;
    // Each corner's normal once per face, not once per triangle.
    const ns = f.cut ? null : f.pts.map((v) => skinNormal(fruit.shape, fruit.radii, v));
    for (let i = 1; i + 1 < f.pts.length; i++) {
      for (const j of [0, i, i + 1]) {
        const v = f.pts[j];
        const n = fn ?? ns![j];
        pos[k] = v[0] - centre[0];
        pos[k + 1] = v[1] - centre[1];
        pos[k + 2] = v[2] - centre[2];
        rest[k] = v[0];
        rest[k + 1] = v[1];
        rest[k + 2] = v[2];
        nrm[k] = n[0];
        nrm[k + 1] = n[1];
        nrm[k + 2] = n[2];
        k += 3;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/** Free a piece's mesh: its geometry and its own material (its extras keep theirs). */
function disposeMesh(m: THREE.Mesh) {
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}

/**
 * The corners a piece touches the board with: every corner of its cut faces
 * (its edges), and a thinned-out sample of its rounded skin, so a big piece
 * isn't hundreds of contact points.
 */
function contactCorners(p: Poly): V3[] {
  const cut = corners({ faces: p.faces.filter((f) => f.cut) });
  const skin = corners({ faces: p.faces.filter((f) => !f.cut) });
  const step = Math.max(1, Math.ceil(skin.length / 36));
  return [...cut, ...skin.filter((_, i) => i % step === 0)];
}

/** A soft round shadow, warm like every shadow in the app. */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(110, 66, 40, 0.55)');
  grad.addColorStop(0.45, 'rgba(110, 66, 40, 0.3)');
  grad.addColorStop(1, 'rgba(110, 66, 40, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const smooth01 = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pale, soft wood: long grain and a few darker streaks. */
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 344;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#E2B886';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * c.height;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '170,112,62' : '250,214,168'},${rand(0.08, 0.22)})`;
    ctx.lineWidth = rand(0.6, 2.6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= c.width; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * rand(1, 4));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let instance: SliceScene | null = null;
/** The room's table (the home card runs a small one of its own). */
export function getSliceScene() {
  return (instance ??= new SliceScene());
}

