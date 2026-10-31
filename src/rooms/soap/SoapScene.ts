import * as THREE from 'three';
import { clamp, damp, lerp, noise1, rand, TAU } from '../../core/math';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { Face, drawFace } from '../../render/face';
import { blobTexture, lightTable, tableRenderer } from '../../render/table';
import { filmFor, RADIUS, radiusOf, type Film } from './game';
import { thingsSheet } from './things';

/**
 * The soap table: a wand standing in a little dish, seen from a low, calm
 * view. A bubble is a real thin film: its colours are the interference of
 * light at three wavelengths through a film that's thin at the crown, thick
 * below and stirred, seen on the near wall and through it on the far one, and
 * it catches a reflection of two little things (things.ts), a different pair
 * in each bubble. Every bubble's film is its own (game.ts `filmFor`), and it
 * thins as it stretches.
 * It swells out of the wand's ring as a dome (the sphere through the ring, cut
 * off below it), pinches free when you let go and floats up off the screen. A
 * burst bubble doesn't fade: a hole opens from one point and races round it.
 */

const FACE_PX = 320;
/** The wand's ring: its radius and its height over the table. */
const RING = { r: 0.62, y: 2.05 };
const LOOK_Y = 3.1;
const ELEV = 8;
const POOL = 7;
const DROPS = 72;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uWob;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying float vWorldY;
void main() {
  vec3 p = position;
  // A slow living ripple, more of it the harder it's strained.
  float w = sin(p.y * 1.9 + uTime * 1.7 + uSeed) * sin(p.x * 1.6 - uTime * 1.3) + 0.6 * sin(p.z * 2.1 + uTime * 1.1 + uSeed);
  p *= 1.0 + uWob * w * 0.022;
  vObj = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldY = wp.y;
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
#define TAU 6.2831853
uniform float uTime;
uniform float uSeed;
uniform float uClip;
uniform float uPop;
uniform vec3 uPopDir;
uniform float uFaceOn;
uniform float uAlpha;
uniform vec2 uThick;
uniform float uFreq;
uniform float uWarp;
uniform vec3 uUp;
uniform float uStretch;
uniform sampler2D uFace;
uniform sampler2D uThings;
uniform vec2 uThing;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying float vWorldY;

// The film's thickness here (nm): draining down, and stirred into marbled bands.
float thickness(vec3 p) {
  vec3 q = p * uFreq + uSeed;
  float t = uTime * 0.16;
  q += uWarp * 0.55 * sin(q.yzx * 1.3 + vec3(t, -t * 0.8, t * 0.6));
  q += uWarp * 0.3 * sin(q.zxy * 2.7 - vec3(t * 1.4, t, -t));
  float swirl = sin(q.x + q.y * 0.8 + sin(q.z * 1.4));
  float h = clamp(dot(p, uUp) * 0.5 + 0.5, 0.0, 1.0);
  return (mix(uThick.y, uThick.x, h) + swirl * (uThick.y - uThick.x) * 0.3) * uStretch;
}

// What a film that thick reflects, per colour, seen at this angle.
vec3 interfere(float d, float nv) {
  float cosT = sqrt(1.0 - (1.0 - nv * nv) / 1.77);
  vec3 s = sin(TAU * 1.33 * d * cosT / vec3(640.0, 535.0, 455.0));
  return s * s;
}

// A little thing from the sheet, seen along a reflected ray.
vec4 thingIn(vec3 r, vec2 at, float size, float index) {
  if (index < 0.0) return vec4(0.0);
  vec2 p = (r.xy / (max(r.z, 0.0) + 0.45) - at) / size;
  if (max(abs(p.x), abs(p.y)) > 1.0) return vec4(0.0);
  vec2 cell = vec2(mod(index, 5.0), 1.0 - floor(index / 5.0));
  return texture2D(uThings, (cell + p * 0.5 + 0.5) / vec2(5.0, 2.0));
}

void main() {
  if (vWorldY < uClip) discard;
  if (uPop > 0.0 && dot(normalize(vObj), uPopDir) > 1.0 - 2.0 * uPop) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  // The near wall, and the far wall seen through it.
  vec3 near = interfere(thickness(vObj), nv);
  vec3 far = interfere(thickness(vec3(vObj.xy, -vObj.z)), nv);
  // Reflections: the room's soft light, stronger toward the rim, as glass goes.
  vec3 r = reflect(-v, n);
  float sky = 0.5 + 0.5 * r.y;
  vec3 rgb = near * (0.045 + 0.05 * sky + 0.82 * rim) + far * (0.025 + 0.2 * rim);
  float a = 0.012 + 0.2 * rim;
  // A little thing caught on the near wall, and another, smaller, on the far one.
  vec4 one = thingIn(r, vec2(-0.5, 0.62), 0.34, uThing.x);
  vec4 two = thingIn(vec3(-r.xy, r.z), vec2(-0.74, 0.62), -0.24, uThing.y);
  rgb += mix(one.rgb, one.rgb * (0.5 + near), 0.3) * one.a * 0.72;
  rgb += mix(two.rgb, two.rgb * (0.5 + far), 0.4) * two.a * 0.5;
  a = max(a, max(one.a * 0.55, two.a * 0.34));
  // A pin of sun on the rim's far side.
  float pin = pow(max(dot(r, normalize(vec3(0.62, 0.46, 0.64))), 0.0), 420.0);
  rgb += vec3(1.0) * pin;
  a = max(a, pin * 0.9);
  if (uFaceOn > 0.5 && vObj.z > 0.15) {
    vec4 ft = texture2D(uFace, vec2(vObj.x, vObj.y + 0.02) / 1.34 + 0.5);
    float k = ft.a * smoothstep(0.15, 0.5, vObj.z);
    rgb = mix(rgb, ft.rgb, k);
    a = mix(a, 1.0, k);
  }
  gl_FragColor = vec4(rgb * uAlpha, a * uAlpha);
}
`;

export interface Bubble {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  r: number;
  wob: Spring;
  seed: number;
  age: number;
  /** Bursting: the hole's progress (0 while whole). */
  pop: number;
  free: boolean;
  /** How far under the ring it's cut off, once let go. */
  clip: number;
}

interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: number;
}

export interface SoapEvents {
  /** A bubble burst: where, and how big it was (0..1). */
  burst?(at: THREE.Vector3, size: number): void;
}

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

export class SoapScene {
  readonly canvas = document.createElement('canvas');
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 200);
  readonly face = new Face();
  events: SoapEvents = {};
  /** 0..1: how near the bubble on the wand is to giving way. */
  strain = 0;

  private film: THREE.Mesh;
  private filmMat: THREE.ShaderMaterial;
  private filmK = new Spring(1, springs.soft);
  private pool: Bubble[] = [];
  private live: Bubble | null = null;
  private lastFilm: Film | undefined;
  private sheet = thingsSheet();
  /** The bubble on the wand rising out of it: 0 flat, 1 a full dome. */
  private dome = 0;
  private domeTarget = 0;
  private blown = 0;
  private drops: Drop[] = [];
  private dropMesh: THREE.InstancedMesh;
  private time = rand(0, 20);
  private faceCanvas = document.createElement('canvas');
  private faceTex: THREE.CanvasTexture;
  private restTex: THREE.CanvasTexture;
  private faceSig = '';
  private dist = 30;
  private viewOffset = 0;
  private w = 1;
  private h = 1;

  constructor() {
    this.renderer = tableRenderer(this.canvas);
    lightTable(this.renderer, this.scene);
    this.faceCanvas.width = this.faceCanvas.height = FACE_PX;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.NoColorSpace;
    this.restTex = restingFace();

    this.buildWand();

    const sphere = new THREE.SphereGeometry(1, 56, 40);
    const base = bubbleMaterial();
    base.uniforms.uFace.value = this.restTex;
    for (let i = 0; i < POOL; i++) {
      const mat = i ? base.clone() : base;
      mat.uniforms.uFace.value = this.restTex;
      mat.uniforms.uThings.value = this.sheet;
      const mesh = new THREE.Mesh(sphere, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.pool.push({ mesh, mat, pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 1, wob: new Spring(0, springs.wobbly), seed: rand(0, 20), age: 0, pop: 0, free: false, clip: 0 });
    }

    // The film across the ring, waiting: the same soap, flat.
    this.filmMat = bubbleMaterial();
    this.filmMat.uniforms.uClip.value = -99;
    this.filmMat.uniforms.uThings.value = this.sheet;
    this.film = new THREE.Mesh(new THREE.SphereGeometry(RING.r * 0.97, 28, 10), this.filmMat);
    this.film.position.y = RING.y;
    this.film.scale.y = 0.03;
    this.film.renderOrder = 1;
    this.scene.add(this.film);

    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.7, depthWrite: false }), DROPS);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    // Compile now, not on the first press.
    this.pool[0].mesh.visible = true;
    this.renderer.compile(this.scene, this.camera);
    this.pool[0].mesh.visible = false;
  }

  private buildWand() {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.75 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(5, 2.6, 1);
    shadow.position.set(0.35, 0.002, -0.15);
    this.scene.add(shadow);

    // A soft little dish of soapy water.
    const pts = [
      [0.0, 0.05],
      [0.9, 0.05],
      [1.28, 0.16],
      [1.46, 0.42],
      [1.5, 0.52],
      [1.42, 0.54],
      [1.3, 0.42],
      [0.9, 0.3],
      [0.0, 0.28],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const dish = new THREE.Mesh(
      new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(40), 56),
      new THREE.MeshPhysicalMaterial({ color: '#F6E2E6', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.8 }),
    );
    this.scene.add(dish);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(1.36, 48),
      new THREE.MeshPhysicalMaterial({ color: '#CDEBF0', roughness: 0.18, clearcoat: 1, envMapIntensity: 1.1 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.4;
    this.scene.add(water);

    // The wand: a soft ring on a curved stem, in one candy colour.
    const plastic = new THREE.MeshPhysicalMaterial({ color: '#F2A9BC', roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING.r, 0.065, 16, 64), plastic);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = RING.y;
    this.scene.add(ring);
    const stem = new THREE.CatmullRomCurve3([
      new THREE.Vector3(RING.r + 0.04, RING.y, 0),
      new THREE.Vector3(RING.r + 0.32, RING.y - 0.3, 0),
      new THREE.Vector3(RING.r + 0.28, 1.05, 0),
      new THREE.Vector3(0.62, 0.34, 0.1),
    ]);
    this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(stem, 36, 0.058, 12, false), plastic));
  }

  // ——— the bubble on the wand ———

  /** Where a bubble of this size sits while it's on the wand (the sphere through the ring). */
  private seat(r: number) {
    return RING.y + Math.sqrt(Math.max(0, r * r - RING.r * RING.r));
  }

  /** A breath begins: a dome starts up out of the film. */
  startBlow() {
    // Still sinking back from a puff: it goes now.
    if (this.live) this.live.mesh.visible = false;
    const b = this.free() ?? this.pool[0];
    this.live = b;
    b.free = false;
    b.pop = 0;
    b.age = 0;
    b.seed = rand(0, 20);
    this.dress(b);
    b.wob.snap(0);
    b.vel.set(0, 0, 0);
    b.mat.uniforms.uClip.value = RING.y;
    b.mat.uniforms.uPop.value = 0;
    b.mat.uniforms.uFaceOn.value = 1;
    b.mat.uniforms.uAlpha.value = 1;
    b.mat.uniforms.uFace.value = this.faceTex;
    b.mesh.visible = true;
    this.dome = 0;
    this.domeTarget = 1;
    this.blown = 0;
    this.film.visible = false;
    this.faceSig = '';
  }

  /** Every bubble's film is its own. */
  private dress(b: Bubble) {
    const film = (this.lastFilm = filmFor(Math.random, this.lastFilm));
    const u = b.mat.uniforms;
    u.uSeed.value = b.seed;
    (u.uThick.value as THREE.Vector2).set(film.thin, film.thick);
    u.uFreq.value = film.freq;
    u.uWarp.value = film.warp;
    (u.uThing.value as THREE.Vector2).fromArray(film.things);
    (u.uUp.value as THREE.Vector3).set(Math.sin(film.lean) * Math.cos(film.turn), Math.cos(film.lean), Math.sin(film.lean) * Math.sin(film.turn));
  }

  /** How big the bubble on the wand is now. */
  blow(size: number) {
    this.blown = size;
  }

  /** It didn't come to anything: the dome sinks back into the film. */
  deflate() {
    this.domeTarget = 0;
    this.strain = 0;
  }

  /** It pinches off and floats away; this is the bubble to `track`. */
  release() {
    const b = this.live;
    if (!b) return null;
    this.live = null;
    b.free = true;
    b.clip = 0;
    b.vel.set(rand(-0.12, 0.12), 2.1, rand(-0.05, 0.05));
    b.wob.impulse(rand(7, 9) * (Math.random() < 0.5 ? -1 : 1));
    b.mat.uniforms.uFace.value = this.restTex;
    this.strain = 0;
    this.refill();
    return b;
  }

  /** Too much: the bubble on the wand goes. */
  burstLive() {
    const b = this.live;
    if (!b) return;
    this.live = null;
    this.strain = 0;
    this.burst(b);
    this.refill();
  }

  private refill() {
    this.film.visible = true;
    this.filmK.snap(0.05);
    this.filmK.target = 1;
  }

  // ——— free bubbles ———

  private free() {
    const idle = this.pool.find((b) => !b.mesh.visible);
    if (idle) return idle;
    // All afloat: the oldest makes way.
    const old = this.pool.filter((b) => b.free && !b.pop).sort((a, b) => b.age - a.age)[0];
    if (old) {
      old.mesh.visible = false;
      old.free = false;
    }
    return old ?? null;
  }

  private burst(b: Bubble) {
    b.pop = 0.001;
    b.free = true;
    b.vel.set(0, 0, 0);
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(0.2, 1)).normalize();
    (b.mat.uniforms.uPopDir.value as THREE.Vector3).copy(dir);
    const n = Math.round(10 + b.r * 7);
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= DROPS) this.drops.shift();
      const d = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      this.drops.push({
        pos: b.pos.clone().addScaledVector(d, b.r),
        vel: d.multiplyScalar(rand(0.4, 1.4)).add(new THREE.Vector3(0, -0.4, 0)),
        life: rand(0.35, 0.7),
        size: rand(0.018, 0.04),
      });
    }
    this.events.burst?.(b.pos, clamp((b.r - RADIUS.min) / (RADIUS.max - RADIUS.min), 0, 1));
  }

  /** Burst the floating bubble under a screen point, if there is one. */
  popAt(sx: number, sy: number) {
    for (const b of this.pool) {
      if (!b.mesh.visible || !b.free || b.pop) continue;
      const c = this.toScreen(b.pos);
      if (Math.hypot(sx - c.x, sy - c.y) < Math.max(36, this.pxPerUnit(b.pos) * b.r * 1.08)) {
        this.burst(b);
        return true;
      }
    }
    return false;
  }

  /** Let every bubble go at once (leaving the room). */
  clearAll() {
    for (const b of this.pool) {
      b.mesh.visible = false;
      b.free = false;
      b.pop = 0;
    }
    this.live = null;
    this.drops = [];
    this.dropMesh.count = 0;
    this.strain = 0;
    this.dome = this.domeTarget = 0;
    this.film.visible = true;
    this.filmK.snap(1);
  }

  // ——— layout ———

  resize(w: number, h: number, dpr: number, top: number, bottom: number, room = 1.08) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const band = Math.max(40, bottom - top);
    const needW = 2 * RADIUS.max * 1.16 * room;
    // From under the dish to the top of the biggest bubble.
    const needH = 6.3 * room;
    this.dist = clamp(Math.max(needW / 2 / (tanV * cam.aspect), ((needH / 2) * (h / band)) / tanV), 10, 90);
    this.viewOffset = h / 2 - (top + bottom) / 2;
    const e = THREE.MathUtils.degToRad(ELEV);
    cam.position.set(0, LOOK_Y + Math.sin(e) * this.dist, Math.cos(e) * this.dist);
    cam.lookAt(0, LOOK_Y, 0);
    cam.setViewOffset(w, h, 0, this.viewOffset, w, h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ——— simulation ———

  update(dt: number) {
    this.time += dt;
    this.face.update(dt);
    this.filmK.update(dt);
    const t = this.time;
    this.film.scale.x = this.film.scale.z = Math.max(0.02, this.filmK.value);
    this.filmMat.uniforms.uTime.value = t;

    const live = this.live;
    if (live) {
      this.dome = damp(this.dome, this.domeTarget, 16, dt);
      if (this.domeTarget === 0 && this.dome < 0.03) {
        live.mesh.visible = false;
        this.live = null;
        this.film.visible = true;
        this.filmK.snap(1);
      } else {
        const r = radiusOf(this.blown);
        const shiver = this.strain > 0.3 ? Math.sin(t * 47) * 0.012 * this.strain : 0;
        live.r = r;
        live.pos.set(shiver, RING.y + (this.seat(r) - RING.y) * this.dome, 0);
        live.mesh.position.copy(live.pos);
        live.mesh.scale.set(r, r * this.dome, r);
        const u = live.mat.uniforms;
        u.uTime.value = t;
        u.uWob.value = 0.35 + this.strain * 1.5;
        // Stretching thins the film, so its colours move as it grows.
        u.uStretch.value = lerp(1.24, 0.88, clamp(this.blown, 0, 1));
      }
    }

    for (const b of this.pool) {
      if (!b.mesh.visible || !b.free) continue;
      b.age += dt;
      b.wob.update(dt);
      const u = b.mat.uniforms;
      u.uTime.value = t;
      if (b.pop) {
        b.pop += dt / 0.11;
        u.uPop.value = b.pop;
        if (b.pop >= 1) {
          b.mesh.visible = false;
          b.free = false;
          b.pop = 0;
        }
        continue;
      }
      // The neck closes under it.
      b.clip += dt * 7;
      u.uClip.value = RING.y - b.clip;
      // It rises quickly off the wand, then drifts up and away.
      b.vel.y = damp(b.vel.y, 1.05 + 0.3 / b.r, 1.8, dt);
      b.vel.x = damp(b.vel.x, noise1(t * 0.3 + b.seed, 1) * 0.3, 1.2, dt);
      b.pos.addScaledVector(b.vel, dt);
      const q = clamp(b.wob.value * 0.018, -0.14, 0.14);
      b.mesh.position.copy(b.pos);
      b.mesh.scale.set(b.r * (1 - q * 0.5), b.r * (1 + q), b.r * (1 - q * 0.5));
      u.uWob.value = 0.35;
      // Draining as it goes, so its colours creep upward.
      u.uStretch.value *= Math.exp(-dt * 0.05);
      // Off the top of the screen, it's gone.
      if (b.age > 30 || this.toScreen(b.pos).y + this.pxPerUnit(b.pos) * b.r < -8) {
        b.mesh.visible = false;
        b.free = false;
      }
    }

    this.stepDrops(dt);
  }

  private stepDrops(dt: number) {
    for (const p of this.drops) {
      p.life -= dt;
      p.vel.y -= 5 * dt;
      p.pos.addScaledVector(p.vel, dt);
    }
    this.drops = this.drops.filter((p) => p.life > 0);
    const m = this.dropMesh;
    this.drops.forEach((p, i) => {
      const s = p.size * clamp(p.life * 4, 0, 1);
      tmpM.makeScale(s, s, s).setPosition(p.pos);
      m.setMatrixAt(i, tmpM);
    });
    m.count = this.drops.length;
    m.instanceMatrix.needsUpdate = true;
  }

  // ——— picking ———

  toScreen(v: THREE.Vector3) {
    tmpV.copy(v).project(this.camera);
    return { x: ((tmpV.x + 1) / 2) * this.w, y: ((1 - tmpV.y) / 2) * this.h };
  }

  private pxPerUnit(at: THREE.Vector3) {
    const a = this.toScreen(at);
    const b = this.toScreen(tmpV.copy(at).setX(at.x + 1).clone());
    return Math.abs(b.x - a.x);
  }

  /** Where a bubble of this size would sit on the wand, on screen: the ring to blow to. */
  ghost(size: number) {
    const r = radiusOf(size);
    const c = new THREE.Vector3(0, this.seat(r), 0);
    const p = this.toScreen(c);
    return { x: p.x, y: p.y, r: this.pxPerUnit(c) * r };
  }

  /** The bubble on the wand, on screen. */
  get liveAt() {
    return this.toScreen(this.live ? this.live.pos : new THREE.Vector3(0, RING.y, 0));
  }

  /** Just beside the bubble on the wand: to its side if there's room, otherwise over it. */
  get besideLive() {
    const c = this.liveAt;
    if (!this.live) return c;
    const r = this.pxPerUnit(this.live.pos) * this.live.r;
    const x = c.x + r * 0.78 + 62;
    if (x + 60 < this.w) return { x, y: c.y - r * 0.5 };
    return { x: c.x, y: c.y - r - 22 };
  }

  /** A floating bubble, on screen; null once it's popped or gone. */
  track(b: Bubble) {
    return b.free && b.mesh.visible && !b.pop ? this.toScreen(b.pos) : null;
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
    drawFace(ctx, this.face, FACE_PX * 0.72, FACE_STYLE);
    ctx.restore();
    this.faceTex.needsUpdate = true;
  }

  render() {
    if (this.live) this.drawFace();
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}

const FACE_STYLE = { ink: '#4A3560', blush: '#FF9AAE' };

/** The contented face a bubble floats away with. */
function restingFace() {
  const c = document.createElement('canvas');
  c.width = c.height = FACE_PX;
  const ctx = c.getContext('2d')!;
  ctx.translate(FACE_PX / 2, FACE_PX / 2);
  const f = new Face();
  f.base = 'happy';
  f.update(1);
  drawFace(ctx, f, FACE_PX * 0.72, FACE_STYLE);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: rand(0, TAU) },
      uWob: { value: 0.35 },
      uClip: { value: 0 },
      uPop: { value: 0 },
      uPopDir: { value: new THREE.Vector3(0, 1, 0) },
      uFaceOn: { value: 0 },
      uAlpha: { value: 1 },
      uThick: { value: new THREE.Vector2(240, 620) },
      uFreq: { value: 2.2 },
      uWarp: { value: 1 },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uStretch: { value: 1 },
      uFace: { value: null },
      uThings: { value: null },
      uThing: { value: new THREE.Vector2(-1, -1) },
    },
  });
}

let instance: SoapScene | null = null;
export function getSoapScene() {
  return (instance ??= new SoapScene());
}
