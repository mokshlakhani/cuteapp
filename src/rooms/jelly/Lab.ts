import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Face, drawFace } from '../../render/face';
import { clamp, rand } from '../../core/math';
import { polyCentroid } from '../../core/geometry';
import { Piece, WEDGE, collidePieces, wedgeFootprint, type Bounds, type PhysicsParams } from './Piece';
import { applyVariety, createShared, makeJellyMaterial, type SharedUniforms } from './material';
import { Knife } from './Knife';
import { VARIETIES, type Variety } from './varieties';

/**
 * The melon-jelly specimen table: a small three.js world with the soft
 * pieces, the cleaver, one warm key light (upper left, like the rest of the
 * app), an environment for glossy reflections, and soft tinted shadows.
 */

interface Entry {
  piece: Piece;
  mesh: THREE.Mesh;
  wire: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshPhysicalMaterial;
  local: { uFace: { value: THREE.Texture }; uFaceRect: { value: THREE.Vector4 } };
  faceCanvas: HTMLCanvasElement | null;
  faceTex: THREE.CanvasTexture | null;
}

export interface LabEvents {
  impact?(p: Piece, speed: number): void;
  bump?(a: Piece, b: Piece, speed: number): void;
  cut?(count: number): void;
  land?(): void;
}

export interface Stats {
  mass: number;
  volume: number;
  kinetic: number;
  pieces: number;
}

const MAX_PIECES = 40;
const MIN_VOLUME = 1.2;
const FACE_PX = 128;

export class Lab {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  readonly knife = new Knife();
  readonly shared: SharedUniforms;
  variety: Variety = VARIETIES[0];
  entries: Entry[] = [];
  bounds: Bounds = { minX: -8, maxX: 8, minZ: -9, maxZ: 9 };
  firmness = 0.4;
  dampingAmt = 0.45;
  timeScale = 1;
  paused = false;
  private showMesh = false;
  private shadowMat: THREE.ShadowMaterial;
  private key: THREE.DirectionalLight;
  private w = 1;
  private h = 1;
  private ray = new THREE.Raycaster();
  private grabPlanes = new Map<number, { piece: Piece; plane: THREE.Plane }>();
  private bumpCool = new Map<string, number>();
  private smoothVolume = 100;
  private idleT = 3;
  private pendingCut: { nx: number; nz: number; d: number; ax: number; az: number; bx: number; bz: number } | null = null;
  events: LabEvents = {};

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

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38;

    this.scene.add(new THREE.HemisphereLight('#fff8ef', '#d9cfc3', 0.9));
    this.key = new THREE.DirectionalLight('#fff4e6', 2.4);
    this.key.position.set(-7, 16, 9);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 60;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 12;
    this.key.shadow.blurSamples = 16;
    this.scene.add(this.key, this.key.target);

    this.shadowMat = new THREE.ShadowMaterial({ color: new THREE.Color(this.variety.shadow), opacity: 0.3 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), this.shadowMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.scene.add(this.knife.group);
    this.knife.onCut = () => this.applyCut();
    this.knife.onLand = () => this.events.land?.();

    this.shared = createShared(this.variety);
    this.reset();
  }

  // ——— layout ———

  /** Fit the camera to the screen; `top`/`bottom` are the UI-free band (px). */
  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    // Frame the table like the reference: the wedge fills most of the
    // width on a phone, with room around it to toss pieces.
    const fov = 30;
    cam.fov = fov;
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const band = Math.max(160, bottom - top);
    const needW = 13.5; // cm visible across
    const needH = 12; // cm visible down the free band
    const dist = clamp(Math.max(needW / 2 / (tanV * cam.aspect), (needH / 2) * (h / band) / tanV), 22, 140);
    const elev = THREE.MathUtils.degToRad(52);
    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    cam.lookAt(0, 0, 0);
    // Shift the picture so the table is centred in the free band.
    const freeMid = (top + bottom) / 2;
    cam.setViewOffset(w, h, 0, h / 2 - freeMid, w, h);
    cam.updateProjectionMatrix();
    // Invisible walls: what's visible of the floor inside the free band.
    const margin = 14;
    const near = this.floorAt(w / 2, bottom - margin);
    const far = this.floorAt(w / 2, top + margin);
    const nearL = this.floorAt(margin, bottom - margin);
    if (near && far && nearL) {
      const halfW = Math.abs(nearL.x - near.x);
      this.bounds = { minX: -halfW, maxX: halfW, minZ: far.z, maxZ: near.z };
    }
  }

  private ndc(sx: number, sy: number) {
    return new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
  }

  /** Where a screen point hits a horizontal plane at height y. */
  floorAt(sx: number, sy: number, y = 0) {
    this.ray.setFromCamera(this.ndc(sx, sy), this.camera);
    const p = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return this.ray.ray.intersectPlane(plane, p) ? p : null;
  }

  // ——— pieces ———

  reset() {
    for (const e of this.entries) this.disposeEntry(e);
    this.entries = [];
    this.grabPlanes.clear();
    const w = new Piece(wedgeFootprint(), 0, WEDGE.height);
    // Apex points back-right, rind faces the viewer-left, like the reference.
    w.placeRest(-0.75, 0, WEDGE.height / 2 + 0.02, 0);
    // Recentre so the wedge sits in the middle of the table.
    const dx = -w.cx;
    const dz = 0.4 - w.cz;
    for (let i = 0; i < w.n; i++) {
      w.x[i] += dx;
      w.z[i] += dz;
    }
    w.frame(0.3);
    this.add(w);
    this.giveFace(w, new Face());
  }

  private add(p: Piece) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
    geo.setAttribute('aRest', new THREE.BufferAttribute(p.restPos, 3));
    geo.setAttribute('aCap', new THREE.BufferAttribute(p.cap, 1));
    geo.setIndex(new THREE.BufferAttribute(p.index, 1));
    p.updateMesh();
    geo.computeVertexNormals();
    const { mat, local } = makeJellyMaterial(this.shared);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.35 }));
    wire.visible = this.showMesh;
    wire.frustumCulled = false;
    this.scene.add(mesh, wire);
    const e: Entry = { piece: p, mesh, wire, geo, mat, local, faceCanvas: null, faceTex: null };
    this.entries.push(e);
    return e;
  }

  private disposeEntry(e: Entry) {
    this.scene.remove(e.mesh, e.wire);
    e.geo.dispose();
    e.mat.dispose();
    (e.wire.material as THREE.Material).dispose();
    e.faceTex?.dispose();
  }

  private giveFace(p: Piece, face: Face) {
    const e = this.entries.find((x) => x.piece === p);
    if (!e) return;
    p.face = face;
    // Centre on the area centroid; size from the true inradius.
    const c = polyCentroid(p.foot);
    const r = p.inradius;
    p.faceX = c.x;
    p.faceZ = c.y;
    p.faceSize = clamp(r * 2.0, 1.4, 4.8);
    if (!e.faceCanvas) {
      e.faceCanvas = document.createElement('canvas');
      e.faceCanvas.width = e.faceCanvas.height = FACE_PX;
      e.faceTex = new THREE.CanvasTexture(e.faceCanvas);
      e.faceTex.colorSpace = THREE.SRGBColorSpace;
      e.local.uFace.value = e.faceTex;
    }
    e.local.uFaceRect.value.set(p.faceX, p.faceZ, p.faceSize, 1);
  }

  setVariety(v: Variety) {
    this.variety = v;
    applyVariety(this.shared, v);
    this.shadowMat.color.set(v.shadow);
  }

  setShowMesh(on: boolean) {
    this.showMesh = on;
    for (const e of this.entries) e.wire.visible = on;
  }

  get pieceCount() {
    return this.entries.length;
  }

  private params(): PhysicsParams {
    return {
      stiffness: 1000 + this.firmness * 2600,
      damping: 1 + this.dampingAmt * 9,
      beta: 0.32 - this.firmness * 0.12,
      gravity: 700,
    };
  }

  // ——— interaction ———

  pick(sx: number, sy: number) {
    this.ray.setFromCamera(this.ndc(sx, sy), this.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    let best: { piece: Piece; t: number } | null = null;
    for (const e of this.entries) {
      const t = e.piece.raycast(o.x, o.y, o.z, d.x, d.y, d.z);
      if (t >= 0 && (!best || t < best.t)) best = { piece: e.piece, t };
    }
    if (!best) return null;
    const hit = o.clone().addScaledVector(d, best.t);
    return { piece: best.piece, point: hit };
  }

  grab(id: number, sx: number, sy: number) {
    const hit = this.pick(sx, sy);
    if (!hit) return null;
    const [hx, hy, hz] = hit.piece.toRest(hit.point.x, hit.point.y, hit.point.z);
    hit.piece.grab(id, hx, hy, hz);
    hit.piece.moveGrab(id, hit.point.x, hit.point.y, hit.point.z);
    // Drag in a plane facing the camera, through the grabbed point.
    const n = new THREE.Vector3();
    this.camera.getWorldDirection(n).negate();
    this.grabPlanes.set(id, { piece: hit.piece, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point) });
    return hit.piece;
  }

  drag(id: number, sx: number, sy: number) {
    const g = this.grabPlanes.get(id);
    if (!g) return;
    this.ray.setFromCamera(this.ndc(sx, sy), this.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(g.plane, p)) return;
    p.x = clamp(p.x, this.bounds.minX, this.bounds.maxX);
    p.z = clamp(p.z, this.bounds.minZ, this.bounds.maxZ);
    p.y = clamp(p.y, 0.4, 16);
    g.piece.moveGrab(id, p.x, p.y, p.z);
  }

  twist(id: number, delta: number) {
    const g = this.grabPlanes.get(id);
    if (!g) return;
    const gr = g.piece.grabs.get(id);
    if (gr) gr.twist += delta;
  }

  release(id: number) {
    const g = this.grabPlanes.get(id);
    this.grabPlanes.delete(id);
    g?.piece.grabs.delete(id);
    return g?.piece ?? null;
  }

  isGrabbing(id: number) {
    return this.grabPlanes.has(id);
  }

  /** A quick tap: a little squish where you poked. */
  poke(p: Piece, sx: number, sy: number) {
    const hit = this.pick(sx, sy);
    const at = hit?.point ?? new THREE.Vector3(p.cx, p.cy, p.cz);
    for (let i = 0; i < p.n; i++) {
      const d = Math.hypot(p.x[i] - at.x, p.y[i] - at.y, p.z[i] - at.z);
      const w = Math.exp(-(d * d) / 8);
      p.vy[i] -= 60 * w;
      p.vy[i] += 25;
    }
  }

  nudge() {
    for (const e of this.entries) {
      const p = e.piece;
      const kx = rand(-60, 60);
      const kz = rand(-60, 60);
      for (let i = 0; i < p.n; i++) {
        p.vx[i] += kx + rand(-25, 25);
        p.vy[i] += rand(140, 220);
        p.vz[i] += kz + rand(-25, 25);
      }
      p.face?.set('happy', 1.2);
    }
  }

  /** Line the knife up over a stroke from screen a → b. */
  aimKnife(ax: number, ay: number, bx: number, by: number) {
    const A = this.floorAt(ax, ay, 1.4);
    const B = this.floorAt(bx, by, 1.4);
    if (!A || !B) return false;
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.6) return false;
    this.knife.aim((A.x + B.x) / 2, (A.z + B.z) / 2, dx / l, dz / l);
    const nx = -dz / l;
    const nz = dx / l;
    this.pendingCut = { nx, nz, d: nx * A.x + nz * A.z, ax: A.x, az: A.z, bx: B.x, bz: B.z };
    return true;
  }

  chop() {
    if (!this.pendingCut) {
      this.knife.cancel();
      return;
    }
    this.knife.chop();
  }

  cancelKnife() {
    this.pendingCut = null;
    this.knife.cancel();
  }

  private applyCut() {
    const c = this.pendingCut;
    this.pendingCut = null;
    if (!c) return;
    const dirx = c.bx - c.ax;
    const dirz = c.bz - c.az;
    const len = Math.hypot(dirx, dirz) || 1;
    const ux = dirx / len;
    const uz = dirz / len;
    let cuts = 0;
    for (const e of [...this.entries]) {
      if (this.entries.length >= MAX_PIECES) break;
      const p = e.piece;
      // Only pieces that straddle the blade and lie along the stroke.
      let pos = 0;
      let neg = 0;
      let along = Infinity;
      let alongMax = -Infinity;
      for (let i = 0; i < p.n; i++) {
        const s = c.nx * p.x[i] + c.nz * p.z[i] - c.d;
        if (s > 0.15) pos++;
        else if (s < -0.15) neg++;
        const a = (p.x[i] - c.ax) * ux + (p.z[i] - c.az) * uz;
        along = Math.min(along, a);
        alongMax = Math.max(alongMax, a);
      }
      if (!pos || !neg || alongMax < -1.5 || along > len + 1.5) continue;
      const parts = p.split(c.nx, 0, c.nz, c.d, MIN_VOLUME);
      if (!parts) continue;
      cuts++;
      const idx = this.entries.indexOf(e);
      this.disposeEntry(e);
      this.entries.splice(idx, 1);
      for (const g of [...this.grabPlanes]) if (g[1].piece === p) this.grabPlanes.delete(g[0]);
      // Faces: the bigger half keeps the old face; the other wakes up.
      const [a, b] = parts[0].restVolume >= parts[1].restVolume ? parts : [parts[1], parts[0]];
      for (const q of [a, b]) this.add(q);
      if (p.face) this.giveFace(a, p.face);
      else if (a.inradius > 0.75) this.giveFace(a, new Face());
      if (b.inradius > 0.75) this.giveFace(b, new Face());
      for (const q of [a, b]) {
        if (q.face) {
          q.face.set('surprised', 0.8);
          q.face.base = 'calm';
        }
      }
    }
    this.events.cut?.(cuts);
  }

  // ——— simulation ———

  update(realDt: number) {
    this.knife.update(realDt);
    if (this.paused) return;
    const dt = Math.min(realDt, 1 / 30) * this.timeScale;
    const steps = Math.max(1, Math.round((dt * 240) / Math.max(1, this.entries.length > 16 ? 2 : 1)));
    const h = dt / steps;
    const P = this.params();
    const ps = this.entries.map((e) => e.piece);
    for (const p of ps) p.impact = 0;
    for (let s = 0; s < steps; s++) {
      for (const p of ps) {
        p.step(h, P);
        p.collideBounds(this.bounds, 0.95);
      }
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const v = collidePieces(ps[i], ps[j]);
          if (v > 40) this.maybeBump(ps[i], ps[j], v);
        }
      }
    }
    for (const [k, v] of this.bumpCool) {
      if (v - realDt <= 0) this.bumpCool.delete(k);
      else this.bumpCool.set(k, v - realDt);
    }
    // Idle life: now and then a resting piece gives a little wobble.
    this.idleT -= dt;
    if (this.idleT <= 0 && ps.length) {
      this.idleT = rand(2.2, 4.5);
      const p = ps[Math.floor(Math.random() * ps.length)];
      if (p.onFloor && !p.grabs.size) {
        for (let i = 0; i < p.n; i++) if (p.y[i] > p.cy) p.vy[i] -= rand(10, 18);
        if (Math.random() < 0.4) p.face?.set('happy', 1.1);
      }
    }
    for (const p of ps) {
      p.age += dt;
      p.frame(P.beta);
      if (p.impact > 30) this.events.impact?.(p, p.impact);
      this.expressions(p);
      p.face?.update(realDt);
    }
  }

  private maybeBump(a: Piece, b: Piece, v: number) {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (this.bumpCool.has(key)) return;
    this.bumpCool.set(key, 0.15);
    this.events.bump?.(a, b, v);
  }

  private expressions(p: Piece) {
    const f = p.face;
    if (!f) return;
    const speed = Math.hypot(p.vcx, p.vcy, p.vcz);
    if (p.grabs.size) f.set(p.wobble > 0.32 ? 'wide' : 'happy', 0.3);
    else if (p.impact > 260) f.set('dizzy', 1.5);
    else if (!p.onFloor && speed > 220) f.set('surprised', 0.3);
    else if (p.wobble > 0.45) f.set('squeeze', 0.25);
    f.look(clamp(p.vcx / 200, -1, 1), clamp(-p.vcz / 200, -1, 1));
  }

  stats(): Stats {
    let mass = 0;
    let rest = 0;
    let cur = 0;
    let kin = 0;
    for (const e of this.entries) {
      const p = e.piece;
      mass += p.mass;
      rest += p.restVolume;
      cur += p.restVolume * clamp(p.volumeRatio, 0, 2);
      kin += p.kinetic();
    }
    this.smoothVolume += ((cur / (rest || 1)) * 100 - this.smoothVolume) * 0.15;
    return { mass, volume: this.smoothVolume, kinetic: kin, pieces: this.entries.length };
  }

  // ——— render ———

  private faceFrame = 0;
  render() {
    this.faceFrame++;
    for (const e of this.entries) {
      const p = e.piece;
      p.updateMesh();
      e.geo.attributes.position.needsUpdate = true;
      e.geo.computeVertexNormals();
      // Faces animate (blinks, pops, spirals) — refresh at ~30 fps.
      if (p.face && e.faceCanvas && e.faceTex && (this.faceFrame + p.id) % 2 === 0) {
        const ctx = e.faceCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, FACE_PX, FACE_PX);
        ctx.save();
        ctx.translate(FACE_PX / 2, FACE_PX / 2);
        drawFace(ctx, p.face, FACE_PX * 0.8, { ink: '#2B1712', blush: this.variety.blush });
        ctx.restore();
        e.faceTex.needsUpdate = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  /** Photograph the current specimen into a 2D canvas (for the home card). */
  snapshot(target: HTMLCanvasElement) {
    if (!target.width || !target.height) return;
    // Frame all pieces from the same angle as the room camera.
    let cx = 0;
    let cz = 0;
    for (const e of this.entries) {
      cx += e.piece.cx / this.entries.length;
      cz += e.piece.cz / this.entries.length;
    }
    let r = 4;
    for (const e of this.entries) r = Math.max(r, Math.hypot(e.piece.cx - cx, e.piece.cz - cz) + e.piece.radius);
    previewCam.aspect = target.width / target.height;
    const tanH = Math.tan(THREE.MathUtils.degToRad(previewCam.fov / 2)) * Math.min(1, previewCam.aspect);
    const dist = (r * 1.55) / tanH;
    const elev = THREE.MathUtils.degToRad(48);
    previewCam.position.set(cx, Math.sin(elev) * dist, cz + Math.cos(elev) * dist);
    previewCam.lookAt(cx, 0.6, cz + 0.4);
    previewCam.updateProjectionMatrix();
    this.renderer.getSize(tmpSize);
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(target.width, target.height, false);
    this.renderFor(previewCam);
    const ctx = target.getContext('2d')!;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(this.canvas, 0, 0, target.width, target.height);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(tmpSize.x, tmpSize.y, false);
  }

  /** Update meshes/faces and render from any camera. */
  renderFor(cam: THREE.Camera) {
    const knife = this.knife.group.visible;
    this.knife.group.visible = false;
    for (const e of this.entries) {
      e.piece.updateMesh();
      e.geo.attributes.position.needsUpdate = true;
      e.geo.computeVertexNormals();
    }
    this.renderer.render(this.scene, cam);
    this.knife.group.visible = knife;
  }
}

const previewCam = new THREE.PerspectiveCamera(26, 1, 1, 400);
const tmpSize = new THREE.Vector2();

let shared: Lab | null = null;
/** One WebGL context for the whole app (room + home preview). */
export function getLab() {
  if (!shared) shared = new Lab();
  return shared;
}
