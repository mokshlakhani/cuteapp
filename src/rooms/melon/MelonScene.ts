import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, lerp, noise1 } from '../../core/math';
import { ease } from '../../design/motion';
import { drawFace } from '../../render/face';
import { fruitPalette } from '../../design/fruitPalette';
import { MELON_A, MELON_R, MelonShape } from './shape';
import { makeMelonMaterial, type MelonUniforms } from './melonMaterial';
import { BandMesh } from './bands3d';
import { Explosion, type ExplosionEvents } from './explosion';

/**
 * The pop table: a watermelon lying on its side, seen from a calm raised
 * three-quarter view, lit like the rest of soft spot (one soft key light
 * from the upper left, warm cocoa shadows). Bands snap on and pinch its
 * middle; when it bursts, the camera swoops down low over the mess.
 */

/** Profile samples along the melon (for the surface and its slope). */
const PROFILE = 129;
const FACE_PX = 256;
/** The melon lies turned a little, so you see it in three-quarter view. */
const YAW = -0.3;
/** Camera: raised three-quarter view, and low and close after the pop. */
const HOME = { elev: 23, az: 0, distK: 1, ty: 1.45 };
const LOW = { elev: 14, az: 0.18, distK: 0.82, ty: 0.5 };

const tmpV = new THREE.Vector3();
const tmpSize = new THREE.Vector2();
const previewCam = new THREE.PerspectiveCamera(30, 1, 1, 400);

export class MelonScene {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  readonly shape = new MelonShape();
  readonly root = new THREE.Group();
  readonly explosion: Explosion;
  /** Height the melon is held above its resting place (the drop-in). */
  lift = 0;
  /** After the pop there's no melon until a fresh one drops in. */
  melonVisible = true;
  /** Is the pop room on screen (so the home card leaves it alone)? */
  active = false;

  private body: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private rest: Float32Array;
  private pos: Float32Array;
  private nrm: Float32Array;
  private uniforms: MelonUniforms;
  private bands: BandMesh[] = [];
  private bandMats = new Map<string, THREE.Material>();
  private stem = new THREE.Group();
  private faceCanvas = document.createElement('canvas');
  private faceTex: THREE.CanvasTexture;
  private faceFrame = 0;
  private surf = new Float32Array(PROFILE);
  private slope = new Float32Array(PROFILE);
  private ray = new THREE.Raycaster();
  private dist = 30;
  private camK = 0;
  private camFrom = 0;
  private camTo = 0;
  private camT = 1;
  private camDur = 1;
  private shakeAmp = 0;
  private time = 0;
  private viewOffset = 0;
  private w = 1;
  private h = 1;

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
    this.scene.environmentIntensity = 0.42;

    this.scene.add(new THREE.HemisphereLight('#fff8ef', '#d9cfc3', 0.95));
    const key = new THREE.DirectionalLight('#fff4e6', 2.3);
    key.position.set(-9, 16, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.near = 1;
    sc.far = 60;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 14;
    key.shadow.blurSamples = 16;
    this.scene.add(key, key.target);

    // The app's warm shadow tone, on an invisible table.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: new THREE.Color('rgb(128, 84, 62)'), opacity: 0.34 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ——— the melon ———
    const sphere = new THREE.SphereGeometry(1, 128, 72);
    sphere.rotateZ(-Math.PI / 2); // poles along x: the melon lies on its side
    this.rest = Float32Array.from(sphere.attributes.position.array as Float32Array);
    this.pos = new Float32Array(this.rest.length);
    this.nrm = new Float32Array(this.rest.length);
    this.geo.setIndex(sphere.index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    this.geo.setAttribute('aRest', new THREE.BufferAttribute(this.rest, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    sphere.dispose();

    const skin = makeMelonMaterial(true);
    this.uniforms = skin.uniforms;
    this.faceCanvas.width = this.faceCanvas.height = FACE_PX;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.uniforms.uFace.value = this.faceTex;
    this.placeFace();
    this.body = new THREE.Mesh(this.geo, skin.mat);
    this.body.castShadow = true;
    this.root.add(this.body);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = YAW;
    this.buildStem();
    this.scene.add(this.root);

    const shardSkin = makeMelonMaterial(false);
    this.explosion = new Explosion(shardSkin.mat, (c) => this.bandMat(c));
    this.scene.add(this.explosion.group);

    this.refresh();
  }

  set events(e: ExplosionEvents) {
    this.explosion.events = e;
  }

  /** The face sits in the middle of the melon's front, the right way up, looking at you. */
  private placeFace() {
    const u = this.uniforms;
    // Middle of the front, tipped up toward the camera.
    const c = new THREE.Vector3(0, 0.34, 0.94).normalize();
    u.uFaceC.value.copy(c);
    u.uShape.value.set(MELON_A, MELON_R);
    const q = new THREE.Vector3(c.x * MELON_A, c.y * MELON_R, c.z * MELON_R);
    const n = new THREE.Vector3(q.x / MELON_A ** 2, q.y / MELON_R ** 2, q.z / MELON_R ** 2).normalize();
    const U = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
    u.uFaceU.value.copy(U);
    // The face canvas is flipped on upload (flipY), so its "down" points up the melon.
    u.uFaceV.value.copy(new THREE.Vector3().crossVectors(n, U));
    u.uFaceSize.value = 1.9;
  }

  private buildStem() {
    const brown = new THREE.MeshStandardMaterial({ color: '#8C7051', roughness: 0.6 });
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.28, 0.02, 0),
      new THREE.Vector3(0.34, 0.24, 0.05),
    );
    const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.055, 8, false), brown);
    const leafGeo = new THREE.SphereGeometry(1, 16, 10);
    leafGeo.scale(0.32, 0.05, 0.16);
    const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: '#7CC86E', roughness: 0.5 }));
    leaf.position.set(0.22, 0.1, -0.16);
    leaf.rotation.set(0.4, 0.6, 0.2);
    for (const m of [stalk, leaf]) m.castShadow = true;
    this.stem.add(stalk, leaf);
    this.root.add(this.stem);
  }

  bandMat(color: string) {
    let m = this.bandMats.get(color);
    if (!m) {
      const c = new THREE.Color(color);
      m = new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.45,
        metalness: 0,
        emissive: c,
        emissiveIntensity: 0.12,
        envMapIntensity: 0.6,
      });
      this.bandMats.set(color, m);
    }
    return m;
  }

  // ——— layout ———

  /** Fit the camera so the melon sits nicely between `top` and `bottom` (px). */
  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const band = Math.max(200, bottom - top);
    // A squeezed melon gets long: leave room for it, and for the face.
    const needW = MELON_A * 2 * 1.55;
    const needH = MELON_R * 2 * 1.7;
    this.dist = clamp(Math.max(needW / 2 / (tanV * cam.aspect), ((needH / 2) * (h / band)) / tanV), 10, 90);
    this.viewOffset = h / 2 - (top + bottom) / 2;
    this.placeCamera();
  }

  private placeCamera() {
    const k = this.camK;
    const elev = THREE.MathUtils.degToRad(lerp(HOME.elev, LOW.elev, k));
    const az = lerp(HOME.az, LOW.az, k);
    const d = this.dist * lerp(HOME.distK, LOW.distK, k);
    const ty = lerp(HOME.ty, LOW.ty, k);
    const cam = this.camera;
    const sx = this.shakeAmp ? noise1(this.time * 24, 1) * this.shakeAmp : 0;
    const sy = this.shakeAmp ? noise1(this.time * 24, 2) * this.shakeAmp : 0;
    cam.position.set(Math.sin(az) * Math.cos(elev) * d + sx, Math.sin(elev) * d + sy, Math.cos(az) * Math.cos(elev) * d);
    cam.lookAt(sx * 0.5, ty + sy * 0.5, 0);
    cam.setViewOffset(this.w, this.h, 0, this.viewOffset * (1 - k * 0.6), this.w, this.h);
    cam.updateProjectionMatrix();
  }

  /** Swoop the camera: 0 = calm three-quarter view, 1 = low over the table. */
  swoop(to: number, seconds: number) {
    this.camFrom = this.camK;
    this.camTo = to;
    this.camT = 0;
    this.camDur = seconds;
  }

  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  // ——— the melon ———

  /** Distance from the axis to the surface at `xn`, from this frame's profile. */
  surfaceAt = (xn: number) => {
    const f = clamp((xn + 1) / 2, 0, 1) * (PROFILE - 1);
    const i = Math.min(PROFILE - 2, Math.floor(f));
    const t = f - i;
    return this.surf[i] * (1 - t) + this.surf[i + 1] * t;
  };

  private slopeAt(xn: number) {
    const f = clamp((xn + 1) / 2, 0, 1) * (PROFILE - 1);
    const i = Math.min(PROFILE - 2, Math.floor(f));
    const t = f - i;
    return this.slope[i] * (1 - t) + this.slope[i + 1] * t;
  }

  addBand(xn: number, color: string) {
    const b = this.shape.addBand(xn, color);
    const bm = new BandMesh(b, this.bandMat(color));
    this.bands.push(bm);
    this.root.add(bm.mesh);
    return b;
  }

  /** A fresh, unbanded melon (held `lift` above the table). */
  resetMelon(lift = 0) {
    for (const b of this.bands) {
      this.root.remove(b.mesh);
      b.dispose();
    }
    this.bands = [];
    this.shape.reset();
    this.lift = lift;
    this.melonVisible = true;
    this.root.visible = true;
    this.refresh();
  }

  /** Pop! The melon becomes flying pieces. */
  burst() {
    this.refresh();
    this.explosion.start(
      this.shape,
      this.root,
      this.shape.bands.map((b) => b.color),
    );
    this.melonVisible = false;
    this.root.visible = false;
  }

  /** Rebuild the melon's surface and bands from its current shape. */
  private refresh() {
    const s = this.shape;
    const step = 2 / (PROFILE - 1);
    for (let i = 0; i < PROFILE; i++) this.surf[i] = s.surfaceAt(-1 + i * step);
    for (let i = 0; i < PROFILE; i++) {
      const a = this.surf[Math.max(0, i - 1)];
      const b = this.surf[Math.min(PROFILE - 1, i + 1)];
      this.slope[i] = (b - a) / ((Math.min(PROFILE - 1, i + 1) - Math.max(0, i - 1)) * step);
    }
    const L = MELON_A * s.lengthScale;
    const { rest, pos, nrm } = this;
    for (let k = 0; k < rest.length; k += 3) {
      const xn = rest[k];
      let dy = rest[k + 1];
      let dz = rest[k + 2];
      const l = Math.hypot(dy, dz);
      if (l > 1e-6) {
        dy /= l;
        dz /= l;
      } else {
        dy = 1;
        dz = 0;
      }
      const r = this.surfaceAt(xn);
      pos[k] = xn * L;
      pos[k + 1] = dy * r;
      pos[k + 2] = dz * r;
      if (Math.abs(xn) > 0.997) {
        nrm[k] = Math.sign(xn);
        nrm[k + 1] = 0;
        nrm[k + 2] = 0;
      } else {
        const g = -this.slopeAt(xn) / L;
        const n = Math.hypot(g, 1);
        nrm[k] = g / n;
        nrm[k + 1] = dy / n;
        nrm[k + 2] = dz / n;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    for (const b of this.bands) b.update(s, this.surfaceAt);

    // Rest on the table (on the lobes, once it's a peanut), squash and roll.
    const q = s.squashAmount;
    const H = s.supportHeight;
    const shiver = s.shiver ? noise1(s.time * 38, 7) * s.shiver * 0.03 : 0;
    this.root.position.set(shiver, H * (1 - q) + this.lift, 0);
    this.root.scale.set(1 + q * 0.45, 1 - q, 1 + q * 0.45);
    this.root.rotation.x = s.sway.value * 0.035;
    this.stem.position.set(L * 0.985, 0, 0);
  }

  update(dt: number) {
    this.time += dt;
    this.shape.update(dt);
    if (this.melonVisible) this.refresh();
    this.explosion.update(dt, this.camera);
    if (this.camT < 1) {
      this.camT = Math.min(1, this.camT + dt / this.camDur);
      this.camK = lerp(this.camFrom, this.camTo, ease.inOutCubic(this.camT));
    }
    this.shakeAmp *= Math.exp(-dt * 6);
    if (this.shakeAmp < 0.002) this.shakeAmp = 0;
    this.placeCamera();
  }

  /** Let the melon breathe and blink when only the home card is showing it. */
  idle(dt: number) {
    if (this.active) return;
    this.time += dt;
    this.shape.update(dt);
    if (this.melonVisible) this.refresh();
  }

  // ——— picking ———

  private rayFrom(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray;
  }

  /** Where along the melon (normalised) a screen point lands, if on it. */
  pickMelon(sx: number, sy: number): number | null {
    if (!this.melonVisible) return null;
    this.root.updateMatrixWorld(true);
    const hit = this.rayFrom(sx, sy).intersectObject(this.body, false)[0];
    if (!hit) return null;
    const p = this.body.worldToLocal(hit.point.clone());
    return clamp(p.x / (MELON_A * this.shape.lengthScale), -1, 1);
  }

  /** The flying piece under a screen point (after the pop). */
  pickPiece(sx: number, sy: number) {
    return this.explosion.pick(this.rayFrom(sx, sy).ray);
  }

  /** Screen position of a world point. */
  toScreen(v: THREE.Vector3) {
    tmpV.copy(v).project(this.camera);
    return { x: ((tmpV.x + 1) / 2) * this.w, y: ((1 - tmpV.y) / 2) * this.h };
  }

  /** The melon's on-screen size (px), to judge a swipe across it. */
  get screenHeight() {
    const H = this.root.position.y;
    const a = this.toScreen(new THREE.Vector3(0, H + MELON_R, 0));
    const b = this.toScreen(new THREE.Vector3(0, H - MELON_R, 0));
    return Math.abs(b.y - a.y);
  }

  /** Screen point of somewhere on the melon (local, normalised). */
  melonPoint(xn: number, phi: number) {
    const r = this.surfaceAt(xn);
    const p = new THREE.Vector3(xn * MELON_A * this.shape.lengthScale, Math.cos(phi) * r, Math.sin(phi) * r);
    this.root.updateMatrixWorld(true);
    return this.toScreen(p.applyMatrix4(this.root.matrixWorld));
  }

  /** World position of the melon's middle. */
  get centre() {
    return this.root.position.clone();
  }

  // ——— rendering ———

  private drawFace() {
    this.faceFrame++;
    if (this.faceFrame % 2) return;
    const ctx = this.faceCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, FACE_PX, FACE_PX);
    ctx.save();
    ctx.translate(FACE_PX / 2, FACE_PX / 2);
    drawFace(ctx, this.shape.face, FACE_PX * 0.7, { ink: '#2A1C17', blush: '#FF9AAE' });
    ctx.restore();
    this.faceTex.needsUpdate = true;
  }

  render() {
    if (this.melonVisible) this.drawFace();
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  /** Photograph the melon (or the mess) into a 2D canvas, for the home card. */
  snapshot(target: HTMLCanvasElement) {
    if (!target.width || !target.height) return;
    if (this.melonVisible) this.drawFace();
    previewCam.aspect = target.width / target.height;
    const tanV = Math.tan(THREE.MathUtils.degToRad(previewCam.fov / 2));
    const reach = this.melonVisible ? MELON_A * 1.7 : 7;
    const dist = Math.max(reach / (tanV * previewCam.aspect), (MELON_R * 1.6) / tanV);
    const elev = THREE.MathUtils.degToRad(HOME.elev);
    const ty = this.melonVisible ? this.root.position.y : 0.4;
    previewCam.position.set(0, Math.sin(elev) * dist + ty * 0.3, Math.cos(elev) * dist);
    previewCam.lookAt(0, ty, 0);
    previewCam.updateProjectionMatrix();
    this.renderer.getSize(tmpSize);
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(target.width, target.height, false);
    this.renderer.render(this.scene, previewCam);
    const ctx = target.getContext('2d')!;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(this.canvas, 0, 0, target.width, target.height);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(tmpSize.x, tmpSize.y, false);
  }
}

let instance: MelonScene | null = null;
/** One melon table for the whole app (the room and its home card share it). */
export function getMelonScene() {
  return (instance ??= new MelonScene());
}

export const MELON_COLORS = fruitPalette.watermelon;
