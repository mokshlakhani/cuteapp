import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, rand, smoothstep } from '../../core/math';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { reducedMotion } from '../../render/camera';
import { Face, drawFace } from '../../render/face';
import { Staged, type Build } from '../../core/stages';
import { blobTexture, gpuReady, lightTable, tableRenderer, woodTexture } from '../../render/table';
import { wholeGeometry } from '../slice/SliceScene';
import { buildExtras, disposeExtra, type Extra } from '../slice/extras';
import { onSkin, skinNormal, type V3 } from '../slice/polyhedron';
import type { SliceFruit } from '../slice/fruits';
import { spiralAt, SPIRAL, START_LON } from './game';
import { dressPeel, makePeelMaterial } from './material';

/**
 * The peel table: a fruit floating over a wooden board, turning the way your
 * finger goes round. A small knife stays in one place the whole way: the fruit
 * rolls slowly over as it turns, crown toward the knife to begin with, base at
 * the end, so the cut never wanders and the strip always leaves from the same
 * spot. The strip is a ribbon cut from that spiral, so its pattern is exactly
 * the skin it came from: it lifts off the fruit, keeps its curl, and hangs in
 * a loose spring that winds down onto the board in a coil. Juice flicks from
 * the cut as it goes.
 */

const FACE_PX = 256;
const BOARD = { w: 6.4, h: 0.34, d: 4.3 };
const FLOAT_Y = BOARD.h + 3.3;
const ELEV = 13;
const LOOK_Y = 2.5;
/** The knife's place on the fruit, as an angle down from the top: the cut stays here. */
const CUT_TH = 1.0;
/** The fruit rolls over about this axis to keep the cut there. */
const ROLL_AXIS = new THREE.Vector3(-Math.sin(START_LON), 0, Math.cos(START_LON));
/** Ribbon sections per turn of the spiral. */
const PER_TURN = 44;
/** Over this much strip it lifts from the fruit into its hanging curl. */
const LIFT = 1.5;
/** The hanging curl: its radius, and the gap between its coils, as a share of the strip's width. */
const CURL = 0.34;
const GAP = 0.55;
const MOST_STRIPS = 7;
/** The way the strip faces as it leaves the fruit: toward you, so it's never seen edge-on. */
const HEADING = 1.1;
const DROPS = 48;
/** A flick of juice for every so much of a turn. */
const DROP_EVERY = 0.42;

interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: number;
}

interface Strip {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  nrm: THREE.BufferAttribute;
  /** Sections it covers. */
  from: number;
  to: number;
  /** The cut's end of it, once it's let go: where it was, and how far it's dropped. */
  free: number;
  fall: number;
  vel: number;
  at: THREE.Vector3;
  /** Its hanging place, along the outward line. */
  out: number;
  width: number;
  still: boolean;
  /** Too many on the board: this one's thinning away. */
  going: boolean;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpM = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpX = new THREE.Quaternion();
const AX_Y = new THREE.Vector3(0, 1, 0);

export class PeelScene {
  readonly canvas = document.createElement('canvas');
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 300);
  readonly face = new Face();
  readonly squash = new Spring(0, springs.wobbly);
  /** Height above its floating place (arriving, leaving). */
  lift = 0;
  /** A shiver as the strip pulls tight (0..1). */
  tight = 0;
  /** The knife's gone away (0 at work, 1 gone). */
  rest = 1;

  private root = new THREE.Group();
  private fruit!: SliceFruit;
  private turns = 4;
  private s = 0;
  /** Which way the fruit turns (±1). */
  private spin = 1;
  /** Extra yaw past where the spiral has it (the finished fruit turning to face you). */
  private yaw = 0;
  /** How far the finished fruit has rolled back upright (0..1). */
  private upright = 0;
  private drops: Drop[] = [];
  private dropMesh!: THREE.InstancedMesh;
  private dropMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  private dropDue = 0;
  private body!: THREE.Mesh;
  private bodyMat!: { mat: THREE.MeshPhysicalMaterial; uniforms: Record<string, THREE.IUniform> };
  private stripMat!: { mat: THREE.MeshPhysicalMaterial; uniforms: Record<string, THREE.IUniform> };
  private bodyGeo: THREE.BufferGeometry | null = null;
  private extras: Extra[] = [];
  private strips: Strip[] = [];
  private clearing = false;
  private rest0: Float32Array = new Float32Array(0);
  private index: number[] = [];
  private sections = 0;
  /** Half the strip's width, and how long it is end to end. */
  private half = 0.2;
  private length = 30;
  private knife = new THREE.Group();
  private blob!: THREE.Mesh;
  private faceCanvas = document.createElement('canvas');
  private faceTex!: THREE.CanvasTexture;
  private faceSig = '';
  private time = rand(0, 20);
  private w = 1;
  private h = 1;
  private dist = 30;
  private viewOffset = 0;

  constructor() {
    this.renderer = tableRenderer(this.canvas);
  }

  /** The rest of the room, in slices (see core/stages). */
  *build(): Build {
    lightTable(this.renderer, this.scene);
    yield;

    const board = new THREE.Mesh(
      new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.13),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.72, metalness: 0, envMapIntensity: 0.5 }),
    );
    board.position.y = BOARD.h / 2;
    this.scene.add(board);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.5 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.set(0.5, BOARD.h + 0.005, -0.2);
    this.scene.add(this.blob);
    yield;

    this.faceCanvas.width = this.faceCanvas.height = FACE_PX;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.bodyMat = makePeelMaterial(false);
    this.bodyMat.uniforms.uFace.value = this.faceTex;
    this.stripMat = makePeelMaterial(true, this.bodyMat.uniforms);
    this.stripMat.uniforms.uFaceOn = { value: 0 };
    this.body = new THREE.Mesh(new THREE.BufferGeometry(), this.bodyMat.mat);
    this.root.add(this.body);
    this.scene.add(this.root);
    yield;
    this.buildKnife();
    yield;

    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.dropMat, DROPS);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    yield;

    // Compile and draw the strip's program now, not on the first turn.
    const warm = new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 3), this.stripMat.mat);
    warm.geometry.setAttribute('aRest', warm.geometry.attributes.position.clone());
    this.scene.add(warm);
    this.body.geometry.setAttribute('position', warm.geometry.attributes.position);
    this.body.geometry.setAttribute('aRest', warm.geometry.attributes.position);
    this.body.geometry.setAttribute('normal', warm.geometry.attributes.normal);
    yield* gpuReady(this.renderer, this.scene, this.camera);
    this.scene.remove(warm);
    warm.geometry.dispose();
  }

  private buildKnife() {
    const blade = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.17, 0.035, 3, 0.016), new THREE.MeshPhysicalMaterial({ color: '#E9E6EE', metalness: 0.75, roughness: 0.26, envMapIntensity: 1.3 }));
    blade.position.x = 0.38;
    const handle = new THREE.Mesh(new RoundedBoxGeometry(1.06, 0.25, 0.17, 5, 0.08), new THREE.MeshPhysicalMaterial({ color: '#E7A4C4', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
    handle.position.x = 1.28;
    this.knife.add(blade, handle);
    this.scene.add(this.knife);
  }

  // ——— the fruit ———

  /** A fresh whole fruit, peeled along this many turns. */
  setFruit(fruit: SliceFruit, turns: number, lift = 0) {
    this.fruit = fruit;
    this.turns = turns;
    this.s = 0;
    this.spin = 1;
    this.yaw = 0;
    this.upright = 0;
    this.dropDue = 0;
    this.dropMat.color.set(fruit.juice);
    this.bodyMat.uniforms.uSpin.value = 1;
    this.lift = lift;
    this.rest = 1;
    this.tight = 0;
    this.squash.snap(0);
    for (const st of this.strips) this.freeStrip(st);
    this.strips = [];
    this.clearing = false;
    dressPeel(this.bodyMat.mat, this.bodyMat.uniforms, fruit, turns);
    this.stripMat.mat.roughness = this.bodyMat.mat.roughness;
    this.stripMat.mat.clearcoat = this.bodyMat.mat.clearcoat;
    const g = wholeGeometry(fruit.shape, fruit.radii);
    this.bodyGeo?.dispose();
    this.bodyGeo = g;
    this.body.geometry = g;
    for (const e of this.extras) {
      e.obj.removeFromParent();
      disposeExtra(e);
    }
    this.extras = buildExtras(fruit);
    for (const e of this.extras) this.root.add(e.obj);
    this.faceSig = '';
    this.buildSpiral();
    this.renderer.compile(this.scene, this.camera);
    this.startStrip(0);
  }

  /** The first stroke decides which way this fruit turns: the spiral winds to suit. */
  setSpin(spin: number) {
    if (spin === this.spin || this.s > 0) return;
    this.spin = spin;
    this.bodyMat.uniforms.uSpin.value = spin;
    for (const st of this.strips) this.freeStrip(st);
    this.strips = [];
    this.buildSpiral();
    this.startStrip(0);
  }

  /** The whole spiral as a ribbon on the skin: each strip shows part of it. */
  private buildSpiral() {
    const n = (this.sections = Math.ceil(this.turns * PER_TURN));
    const f = this.fruit;
    const radii = f.radii as V3;
    const halfTh = (SPIRAL.to - SPIRAL.from) / this.turns / 2;
    const rest = (this.rest0 = new Float32Array((n + 1) * 6));
    let len = 0;
    let last: V3 | null = null;
    for (let i = 0; i <= n; i++) {
      const { th, ph } = spiralAt(i / n, this.turns, this.spin);
      rest.set(onSkin(f.shape, radii, th - halfTh, ph), i * 6);
      rest.set(onSkin(f.shape, radii, th + halfTh, ph), i * 6 + 3);
      const mid = onSkin(f.shape, radii, th, ph);
      if (last) len += Math.hypot(mid[0] - last[0], mid[1] - last[1], mid[2] - last[2]);
      last = mid;
    }
    this.length = len;
    const [ax, ay, az] = onSkin(f.shape, radii, Math.PI / 2 - halfTh, 0);
    const [bx, by, bz] = onSkin(f.shape, radii, Math.PI / 2 + halfTh, 0);
    this.half = Math.hypot(ax - bx, ay - by, az - bz) / 2;
    const idx: number[] = [];
    // Wound so the skin's side always faces out, whichever way it spirals.
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      if (this.spin > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.index = idx;
  }

  private startStrip(sFrom: number) {
    const count = (this.sections + 1) * 2;
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const nrm = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    nrm.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pos);
    g.setAttribute('normal', nrm);
    g.setAttribute('aRest', new THREE.BufferAttribute(this.rest0, 3));
    g.setIndex(this.index);
    const mesh = new THREE.Mesh(g, this.stripMat.mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const from = Math.floor(sFrom * this.sections);
    this.strips.push({ mesh, pos, nrm, from, to: from, free: 0, fall: 0, vel: 0, at: new THREE.Vector3(), out: 0.72 + (this.strips.length % 4) * 0.3, width: 1, still: false, going: false });
    const kept = this.strips.filter((s) => !s.going);
    if (kept.length > MOST_STRIPS) {
      kept[0].going = true;
      kept[0].still = false;
    }
  }

  private freeStrip(st: Strip) {
    this.scene.remove(st.mesh);
    st.mesh.geometry.dispose();
  }

  /** How far along the peel has come. */
  setProgress(s: number) {
    this.s = s;
    this.bodyMat.uniforms.uS.value = s;
  }

  /** The strip snaps where it is: it drops, and a new one starts. */
  tear() {
    const st = this.strips[this.strips.length - 1];
    if (st) this.letGo(st);
    this.startStrip(this.s);
  }

  /** The last of it comes away. */
  finish() {
    const st = this.strips[this.strips.length - 1];
    if (st) this.letGo(st);
  }

  private letGo(st: Strip) {
    // Right up to the cut, so no skin goes missing between this strip and the next.
    st.to = this.cutSection;
    this.cutPoint(tmpA);
    st.at.copy(tmpA);
    st.free = 0.001;
  }

  /** Clear the strips away: they thin out and go. */
  clearStrips() {
    for (const st of this.strips) st.still = false;
    this.clearing = true;
  }

  get cleared() {
    return this.strips.every((st) => st.width <= 0);
  }

  // ——— layout ———

  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const band = Math.max(40, bottom - top);
    const needW = BOARD.w * 1.12;
    const needH = (FLOAT_Y + 2) * 1.12;
    this.dist = clamp(Math.max(needW / 2 / (tanV * cam.aspect), ((needH / 2) * (h / band)) / tanV), 10, 90);
    this.viewOffset = h / 2 - (top + bottom) / 2;
    this.placeCamera();
  }

  private placeCamera() {
    const e = THREE.MathUtils.degToRad(ELEV + (reducedMotion ? 0 : Math.sin(this.time * 0.23) * 0.5));
    const cam = this.camera;
    cam.position.set(0, LOOK_Y + Math.sin(e) * this.dist, Math.cos(e) * this.dist);
    cam.lookAt(0, LOOK_Y, 0);
    cam.setViewOffset(this.w, this.h, 0, this.viewOffset, this.w, this.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ——— simulation ———

  /** Roll the finished fruit upright and round to face you, the short way forward. */
  faceForward(dt: number) {
    const whole = this.spin * Math.PI * 2 * this.turns * this.s + this.yaw;
    const to = this.spin * Math.ceil((this.spin * whole) / (Math.PI * 2) - 0.02) * Math.PI * 2;
    this.yaw += (to - whole) * (1 - Math.exp(-dt * 4));
    this.upright = damp(this.upright, 1, 3.4, dt);
  }

  /** A little juice flicks from the cut, for this much turned. */
  flick(turned: number) {
    this.dropDue += turned;
    if (this.dropDue < DROP_EVERY) return;
    this.dropDue = 0;
    this.cutPoint(tmpA);
    for (let i = 0; i < 2; i++) {
      if (this.drops.length >= DROPS) this.drops.shift();
      this.drops.push({
        pos: tmpA.clone(),
        vel: new THREE.Vector3(rand(0.3, 1.2), rand(0.5, 1.5), rand(-0.1, 0.7)),
        life: rand(0.45, 0.8),
        size: rand(0.022, 0.045),
      });
    }
  }

  private stepDrops(dt: number) {
    if (!this.drops.length && !this.dropMesh.count) return;
    for (const p of this.drops) {
      p.life -= dt;
      p.vel.y -= 6.5 * dt;
      p.pos.addScaledVector(p.vel, dt);
    }
    this.drops = this.drops.filter((p) => p.life > 0);
    const m = this.dropMesh;
    this.drops.forEach((p, i) => {
      const r = p.size * clamp(p.life * 5, 0, 1);
      tmpMat.makeScale(r, r * 1.25, r).setPosition(p.pos);
      m.setMatrixAt(i, tmpMat);
    });
    m.count = this.drops.length;
    m.instanceMatrix.needsUpdate = true;
  }

  /** The point on the fruit under the knife, in the world. */
  private cutPoint(out: THREE.Vector3) {
    const { th, ph } = spiralAt(this.s, this.turns, this.spin);
    const v = onSkin(this.fruit.shape, this.fruit.radii as V3, th, ph);
    return out.set(v[0], v[1], v[2]).applyMatrix4(this.root.matrixWorld);
  }

  update(dt: number) {
    this.time += dt;
    this.face.update(dt);
    this.squash.update(dt);
    const t = this.time;
    const q = clamp(this.squash.value * 0.03, -0.14, 0.18);
    const shake = this.tight > 0.25 ? Math.sin(t * 58) * 0.02 * this.tight : 0;
    const y = FLOAT_Y + Math.sin(t * 1.2) * 0.06 + this.lift;
    this.root.position.set(shake, y, 0);
    tmpQ.setFromAxisAngle(AX_Y, this.spin * Math.PI * 2 * this.turns * this.s + this.yaw);
    // Rolled over just enough that the cut stays where the knife is.
    tmpX.setFromAxisAngle(ROLL_AXIS, (spiralAt(this.s, this.turns).th - CUT_TH) * (1 - this.upright));
    this.root.quaternion.copy(tmpX).multiply(tmpQ);
    this.root.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5);
    this.root.updateMatrixWorld(true);
    const R = Math.max(...this.fruit.radii);
    this.blob.scale.set(R * 2.5, R * 1.6, 1);
    // No fruit over the board, no shadow on it.
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - clamp(this.lift / 5, 0, 1));

    // The knife rests against the cut.
    this.cutPoint(tmpA);
    const away = this.rest * this.rest;
    this.knife.position.set(tmpA.x + away * 3.4 + shake, tmpA.y + 0.06 + away * 0.9, tmpA.z);
    this.knife.rotation.set(0.2, -0.5, 0.42 + Math.sin(t * 2.2) * 0.012);
    this.knife.visible = this.rest < 0.995;

    const cut = this.cutSection;
    for (const st of this.strips) {
      if (st.free === 0) st.to = cut;
      this.stepStrip(st, dt);
    }
    const spent = this.strips.findIndex((st) => st.going && st.width <= 0);
    if (spent >= 0) this.freeStrip(this.strips.splice(spent, 1)[0]);
    this.stepDrops(dt);
    this.placeCamera();
  }

  private get cutSection() {
    return Math.min(this.sections, Math.ceil(this.s * this.sections));
  }

  private stepStrip(st: Strip, dt: number) {
    if (this.clearing || st.going) st.width = Math.max(0, st.width - dt * 2.4);
    if (st.to <= st.from) {
      st.mesh.visible = false;
      return;
    }
    st.mesh.visible = true;
    if (st.free > 0) {
      st.free = Math.min(1, st.free + dt / 0.4);
      st.vel += 13 * dt;
      st.fall += st.vel * dt;
    }
    if (st.still) return;

    const n = this.sections;
    const per = this.length / n;
    const f = this.fruit;
    const radii = f.radii as V3;
    const m = this.root.matrixWorld;
    const c = st.free > 0 ? st.at : this.cutPoint(tmpC);
    // Outward from the fruit's core, flat: the way the strip hangs away.
    const ox = c.x - this.root.position.x;
    const oz = c.z;
    const ol = Math.hypot(ox, oz) || 1;
    const dx = Math.max(0.35, ox / ol);
    const dz = oz / ol;
    const floorY = BOARD.h + this.half * 0.64 + 0.03;
    const pos = st.pos.array as Float32Array;
    const nrm = st.nrm.array as Float32Array;
    const half = this.half * st.width;
    const pitch = (this.half * 2 * (1 + GAP)) / (Math.PI * 2 * CURL);
    const wind = this.half * 0.45;
    const rad0 = Math.sqrt(CURL * CURL + (LIFT * 0.7 * wind) / Math.PI);
    const sEnd = st.free > 0 ? st.to : this.s * n;
    let settled = st.free >= 1;
    for (let i = st.from; i <= st.to; i++) {
      const l = Math.max(0, sEnd - i) * per;
      const k = Math.max(smoothstep(0, LIFT, l), st.free);
      // An even spiral: each coil a little wider than the last, so it lands as a rose.
      const rad = Math.sqrt(CURL * CURL + (l * wind) / Math.PI);
      // Still lifting it keeps one heading, so it can't twist; the curl starts after.
      const ang = HEADING - (Math.max(rad, rad0) - rad0) * (Math.PI * 2) / wind;
      const axis = -CURL + (st.out + CURL) * Math.min(1, k * 1.3);
      const ax = c.x + dx * axis + Math.sin(this.time * 0.8 + l * 0.2) * 0.02 * Math.min(1, l);
      const az = c.z + dz * axis * 0.4;
      const hang = c.y - st.fall - Math.min(l, LIFT) * 0.28 - Math.max(0, l - LIFT) * pitch;
      if (hang > floorY) settled = false;
      const hy = Math.max(floorY, hang);
      const cx = Math.cos(ang);
      // Mirrored for a fruit turned the other way, so the skin stays on the outside.
      const sz = Math.sin(ang) * this.spin;
      // Down on the board its upper edge falls open, like a petal.
      const open = (1 - smoothstep(floorY, floorY + 0.9, hang)) * (0.72 + 0.28 * Math.sin(l * 2.6));
      const wy = half * (1 - open * 0.36);
      const wr = half * open * 0.66;
      const hx = Math.min(ax, BOARD.w / 2 - 0.15 - rad) + cx * rad;
      const hz = az + sz * rad * 0.82;
      tmpN.set(cx * (1 - open * 0.36), -open * 0.66, sz * (1 - open * 0.36));
      if (k < 1) {
        // Still lifting: from where it was on the skin.
        tmpA.fromArray(this.rest0, i * 6).applyMatrix4(m);
        tmpB.fromArray(this.rest0, i * 6 + 3).applyMatrix4(m);
        tmpM.addVectors(tmpA, tmpB).multiplyScalar(0.5);
        const sn = skinNormal(f.shape, radii, [this.rest0[i * 6], this.rest0[i * 6 + 1], this.rest0[i * 6 + 2]]);
        tmpP.set(sn[0], sn[1], sn[2]).transformDirection(m);
        tmpN.lerp(tmpP, 1 - k).normalize();
        tmpA.lerp(tmpB.set(hx + cx * wr, hy + wy, hz + sz * wr), k);
        tmpB.fromArray(this.rest0, i * 6 + 3).applyMatrix4(m).lerp(tmpM.set(hx - cx * wr, hy - wy, hz - sz * wr), k);
        // Never into the fruit.
        tmpA.addScaledVector(tmpN, 0.012 + k * (1 - k) * 0.5);
        tmpB.addScaledVector(tmpN, 0.012 + k * (1 - k) * 0.5);
      } else {
        tmpA.set(hx + cx * wr, hy + wy, hz + sz * wr);
        tmpB.set(hx - cx * wr, hy - wy, hz - sz * wr);
      }
      if (st.width < 1) tmpA.lerp(tmpB, 0.5 * (1 - st.width));
      // Pulled tight, it narrows at the knife, where it'll give.
      if (st.free === 0 && this.tight > 0) {
        const neck = this.tight * 0.36 * (1 - smoothstep(0, LIFT * 0.8, l));
        tmpM.copy(tmpA);
        tmpA.lerp(tmpB, neck);
        tmpB.lerp(tmpM, neck);
      }
      const j = (i * 2) * 3;
      pos[j] = tmpA.x;
      pos[j + 1] = tmpA.y;
      pos[j + 2] = tmpA.z;
      pos[j + 3] = tmpB.x;
      pos[j + 4] = tmpB.y;
      pos[j + 5] = tmpB.z;
      // Skin from under the fruit still faces down: tip it up so it stays lit.
      tmpN.y = Math.max(tmpN.y, -0.22);
      tmpN.normalize();
      nrm[j] = nrm[j + 3] = tmpN.x;
      nrm[j + 1] = nrm[j + 4] = tmpN.y;
      nrm[j + 2] = nrm[j + 5] = tmpN.z;
    }
    st.pos.needsUpdate = true;
    st.nrm.needsUpdate = true;
    st.mesh.geometry.setDrawRange(st.from * 6, (st.to - st.from) * 6);
    // Down in its coil and thin no more: nothing left to move or upload.
    if (settled && !this.clearing && !st.going) st.still = true;
  }

  // ——— picking ———

  toScreen(v: THREE.Vector3) {
    tmpA.copy(v).project(this.camera);
    return { x: ((tmpA.x + 1) / 2) * this.w, y: ((1 - tmpA.y) / 2) * this.h };
  }

  /** The fruit's middle on screen, and its on-screen radius. */
  get screenFruit() {
    const c = new THREE.Vector3(0, FLOAT_Y, 0);
    const a = this.toScreen(c);
    const b = this.toScreen(c.clone().add(new THREE.Vector3(0, this.fruit.radii[1], 0)));
    return { x: a.x, y: a.y, r: Math.abs(b.y - a.y) };
  }

  /** Under the board's front edge, on screen. */
  get boardFront() {
    return this.toScreen(new THREE.Vector3(0, 0, BOARD.d / 2));
  }

  /** The cut, on screen. */
  get cutAt() {
    return this.toScreen(this.cutPoint(new THREE.Vector3()));
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
    this.drawFace();
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}

export const peelScene = new Staged(
  () => new PeelScene(),
  (s) => s.build(),
);
export function getPeelScene() {
  return peelScene.get();
}
