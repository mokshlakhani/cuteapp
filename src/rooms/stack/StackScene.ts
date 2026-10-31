import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, rand } from '../../core/math';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { Face, drawFace } from '../../render/face';
import { blobTexture, lightTable, tableRenderer, woodTexture } from '../../render/table';
import { swayAt, TABLE_Y, type Placed, type Stone } from './game';

/**
 * The stack table: smooth river stones on a low wooden board, seen from a
 * calm, slightly raised view. The view stays the same size: once the tower
 * nears the top of the screen it climbs, a stone at a time, with only the top
 * of the tower in frame, and glides back down when the run ends. The stones
 * are soft lumpy superellipsoids with mottled, speckled colour running
 * through them. The one in your hand has a live face; set down, they doze.
 * Tumbling stones aren't a physics pile: each rolls off on its own arc and
 * shrinks away, so the table always stays clean.
 */

const FACE_PX = 196;
const BOARD = { w: 5.6, h: TABLE_Y, d: 3.6 };
const ELEV = 11;
const GRAVITY = 16;
/** How much height the view is framed around at rest. */
const HOME = 6.2;
/** Over the tower's top, what must stay in frame: the stone in hand and a little air. */
const HEADROOM = 2.7;

/** River stone colours, muted to sit on the orchid ground. */
const TONES = ['#CDBFC6', '#DCC6A9', '#BAC6BB', '#E0B9A6', '#AEB6C8', '#EADFCD'];

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uFace;
uniform float uFaceOn;
uniform float uSeed;
varying vec3 vObj;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 q = vObj * 2.6 + uSeed;
  float m = vnoise(q) * 0.6 + vnoise(q * 2.3) * 0.3 + vnoise(q * 5.1) * 0.1;
  diffuseColor.rgb *= 0.86 + m * 0.26;
  // A pale vein or two, and fine dark grit.
  float vein = 1.0 - smoothstep(0.0, 0.035, abs(sin(vObj.y * 5.0 + vObj.x * 2.0 + uSeed + vnoise(q) * 3.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.94, 0.9), vein * 0.28);
  float grit = smoothstep(0.76, 0.84, vnoise(vObj * 34.0 + uSeed));
  diffuseColor.rgb *= 1.0 - grit * 0.22;
  if (uFaceOn > 0.5 && vObj.z > 0.1) {
    vec4 ft = texture2D(uFace, vec2(vObj.x, vObj.y * 1.7) / 1.5 + 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, ft.rgb, ft.a * smoothstep(0.1, 0.3, vObj.z));
  }
}
`;

interface Piece {
  stone: Stone;
  mesh: THREE.Mesh;
  u: { uFace: { value: THREE.Texture }; uFaceOn: { value: number }; uSeed: { value: number } };
  /** Placed in the tower, at this level. */
  level: number;
  /** Tumbling away, or shrinking where it stood. */
  sink: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  gone: number;
  bounced: boolean;
  scale: number;
}

const blobMat = () => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false });
const tmpV = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class StackScene {
  readonly canvas = document.createElement('canvas');
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 300);
  readonly face = new Face();
  /** A shiver through the tower (springs back): set by how shakily a stone landed. */
  readonly shake = new Spring(0, springs.wobbly);
  sway = 0;
  /** Called when a tumbling stone hits the table, or shrinks away. */
  onTumble?: (speed: number, at: THREE.Vector3) => void;

  private tower: Piece[] = [];
  private held: Piece | null = null;
  private falling: Piece[] = [];
  private shadow: THREE.Mesh;
  private heldShadow: THREE.Mesh;
  private faceCanvas = document.createElement('canvas');
  private faceTex: THREE.CanvasTexture;
  private restTex: THREE.CanvasTexture;
  private faceSig = '';
  private time = rand(0, 20);
  private look = 3;
  private lookTarget = 3;
  /** Where the view rests with the board in frame. */
  private lookHome = 3;
  /** How much of the world fits between the screen's chrome, at the tower. */
  private span = 8;
  private dist = 30;
  private viewOffset = 0;
  private w = 1;
  private h = 1;

  constructor() {
    this.renderer = tableRenderer(this.canvas);
    lightTable(this.renderer, this.scene);
    this.faceCanvas.width = this.faceCanvas.height = FACE_PX;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.restTex = dozingFace();

    const board = new THREE.Mesh(
      new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.13),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.72, metalness: 0, envMapIntensity: 0.5 }),
    );
    board.position.y = BOARD.h / 2;
    this.scene.add(board);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat());
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = BOARD.h + 0.006;
    this.scene.add(this.shadow);
    this.heldShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat());
    this.heldShadow.rotation.x = -Math.PI / 2;
    this.heldShadow.position.y = BOARD.h + 0.008;
    this.heldShadow.visible = false;
    this.scene.add(this.heldShadow);

    // Compile the stone's program now, not on the first stone.
    const warm = this.makePiece({ a: 1, b: 0.4, seat: 0.5, bias: 0, round: 3, tone: 0, seed: 1 });
    this.scene.add(warm.mesh);
    this.renderer.compile(this.scene, this.camera);
    this.free(warm);
  }

  private makePiece(stone: Stone): Piece {
    const u = { uFace: { value: this.restTex as THREE.Texture }, uFaceOn: { value: 0 }, uSeed: { value: stone.seed } };
    const mat = new THREE.MeshPhysicalMaterial({ color: TONES[stone.tone], roughness: 0.46, clearcoat: 0.32, clearcoatRoughness: 0.4, envMapIntensity: 0.7 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_HEAD}`).replace('#include <color_fragment>', FRAG_COLOR);
    };
    mat.customProgramCacheKey = () => 'soft-stone-v1';
    return { stone, mesh: new THREE.Mesh(stoneGeometry(stone), mat), u, level: -1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), sink: false, gone: 0, bounced: false, scale: 1 };
  }

  private free(p: Piece) {
    this.scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
  }

  /** Start a fresh tower: the old one shrinks away where it stands. */
  reset() {
    for (const p of this.tower) this.sinkAway(p);
    for (const p of this.falling) if (p.bounced) p.scale = Math.min(p.scale, 0.3);
    if (this.held) this.free(this.held);
    this.tower = [];
    this.placedAt = [];
    this.held = null;
    this.lookTarget = this.lookHome;
    this.shake.snap(0);
  }

  private sinkAway(p: Piece) {
    p.sink = true;
    p.scale = 1;
    this.falling.push(p);
  }

  /** The run's over: glide back down to the foot of the tower. */
  rewind() {
    this.lookTarget = this.lookHome;
  }

  /** A new stone in hand, at this place over the tower. */
  hold(stone: Stone, x: number, y: number) {
    const p = this.makePiece(stone);
    p.u.uFace.value = this.faceTex;
    p.u.uFaceOn.value = 1;
    p.pos.set(x, y, 0);
    p.mesh.position.copy(p.pos);
    this.scene.add(p.mesh);
    this.held = p;
    p.scale = 0.05;
    this.faceSig = '';
  }

  /** Move the stone in hand; `tilt` from how it's swinging. */
  moveHeld(x: number, y: number, tilt: number) {
    const p = this.held;
    if (!p) return;
    p.pos.set(x, y, 0);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.set(0, 0, tilt);
  }

  /** The stone in hand settles onto the tower. */
  place(placed: Placed, level: number, impact: number) {
    const p = this.held;
    if (!p) return;
    this.held = null;
    p.level = level;
    p.u.uFace.value = this.restTex;
    p.scale = 1;
    p.mesh.scale.setScalar(1);
    this.tower[level] = p;
    this.shake.impulse((Math.random() < 0.5 ? -1 : 1) * impact);
    p.mesh.position.set(placed.x, placed.y, 0);
    this.faceSig = '';
  }

  private placedAt: Placed[] = [];
  /** The tower as the rules have it. */
  sync(tower: Placed[]) {
    this.placedAt = tower;
    this.follow();
  }

  /** The stones from `from` up tip off, to this side, from the top down. */
  tumble(from: number, side: number) {
    for (let i = this.tower.length - 1; i >= from; i--) {
      const p = this.tower[i];
      this.launch(p, side, (this.tower.length - 1 - i) * 0.07);
    }
    this.tower.length = Math.min(this.tower.length, from);
  }

  private launch(p: Piece, side: number, delay: number) {
    p.pos.copy(p.mesh.position);
    p.vel.set(side * rand(1.5, 2.3), rand(0.6, 1.6), rand(-0.3, 0.5));
    p.spin.set(rand(-1, 1), rand(-0.6, 0.6), -side * rand(2.5, 4));
    p.gone = -delay;
    p.bounced = false;
    p.u.uFace.value = this.faceTex;
    this.falling.push(p);
  }

  /** The stone in hand fell off the side of the tower. */
  dropHeld(side: number) {
    const p = this.held;
    if (!p) return;
    this.held = null;
    p.scale = 1;
    p.mesh.scale.setScalar(1);
    this.launch(p, side, 0);
  }

  get busy() {
    return this.falling.length > 0;
  }

  // ——— layout ———

  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.viewOffset = h / 2 - (top + bottom) / 2;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const band = Math.max(40, bottom - top);
    this.dist = clamp(Math.max((BOARD.w * 1.06) / 2 / (tanV * this.camera.aspect), ((HOME / 2) * (h / band)) / tanV), 10, 120);
    this.span = (2 * this.dist * tanV * band) / h;
    this.lookHome = HOME / 2 - 0.1;
    this.lookTarget = this.lookHome;
    this.follow();
    this.look = this.lookTarget;
    this.placeCamera();
  }

  /** Keep the stone hanging over the tower in frame: the view climbs as the tower does. */
  private follow() {
    const t = this.placedAt;
    const top = t.length ? t[t.length - 1].y + t[t.length - 1].stone.b : 0;
    this.lookTarget = Math.max(this.lookHome, top + HEADROOM - this.span / 2);
  }

  private placeCamera() {
    const e = THREE.MathUtils.degToRad(ELEV + Math.sin(this.time * 0.21) * 0.4);
    const cam = this.camera;
    cam.position.set(Math.sin(this.time * 0.15) * 0.25, this.look + Math.sin(e) * this.dist, Math.cos(e) * this.dist);
    cam.lookAt(0, this.look, 0);
    cam.setViewOffset(this.w, this.h, 0, this.viewOffset, this.w, this.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ——— simulation ———

  update(dt: number) {
    this.time += dt;
    this.face.update(dt);
    this.shake.update(dt);
    this.look = damp(this.look, this.lookTarget, 2.2, dt);

    // Each stone rides the tower's sway, more the higher it is, plus any shiver.
    const t = this.towerTime;
    this.tower.forEach((p, i) => {
      const q = this.placedAt[i];
      if (!q) return;
      const k = i / 8;
      const x = q.x + swayAt(i, t, this.sway) + this.shake.value * 0.012 * k * (1 + k * 2);
      p.mesh.position.set(x, q.y, 0);
      p.mesh.rotation.set(0, (p.stone.seed % 1) * 0.5 - 0.25, q.lean - this.shake.value * 0.003 * k);
    });

    const h = this.held;
    if (h) {
      h.scale = damp(h.scale, 1, 12, dt);
      h.mesh.scale.setScalar(h.scale);
    }

    for (let i = this.falling.length - 1; i >= 0; i--) {
      const p = this.falling[i];
      if (p.sink) {
        p.scale -= dt * 3.4;
        p.mesh.scale.setScalar(Math.max(0.001, p.scale));
        if (p.scale <= 0) {
          this.free(p);
          this.falling.splice(i, 1);
        }
        continue;
      }
      p.gone += dt;
      if (p.gone < 0) continue;
      p.vel.y -= GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      const w = p.spin.length();
      if (w > 0.01) {
        tmpQ.setFromAxisAngle(tmpV.copy(p.spin).divideScalar(w), w * dt);
        p.mesh.quaternion.premultiply(tmpQ);
      }
      const onBoard = Math.abs(p.pos.x) < BOARD.w / 2 && Math.abs(p.pos.z) < BOARD.d / 2;
      const floor = (onBoard ? BOARD.h : 0) + p.stone.b;
      if (p.pos.y < floor) {
        p.pos.y = floor;
        if (p.vel.y < -1) this.onTumble?.(-p.vel.y, p.pos);
        p.vel.y = Math.max(0, -p.vel.y * 0.34);
        p.vel.x *= 0.78;
        p.spin.multiplyScalar(0.75);
        p.bounced = true;
      }
      p.mesh.position.copy(p.pos);
      // Fallen past the bottom of the screen: gone.
      if (p.pos.y < this.look - this.span) {
        this.free(p);
        this.falling.splice(i, 1);
        continue;
      }
      // Soon after it lands, it shrinks away: no piles.
      if (p.bounced) {
        p.scale -= dt * 1.5;
        p.mesh.scale.setScalar(Math.max(0.001, Math.min(1, p.scale * 1.6)));
        if (p.scale <= 0) {
          this.free(p);
          this.falling.splice(i, 1);
        }
      }
    }

    // A soft shadow under the tower's foot, and under the stone in hand.
    const base = this.placedAt[0];
    this.shadow.visible = this.tower.length > 0;
    if (base) {
      const a = base.stone.a;
      this.shadow.position.x = base.x + 0.08;
      this.shadow.scale.set(a * 3.1, a * 1.9, 1);
    }
    this.heldShadow.visible = !!h;
    if (h) {
      const hgt = Math.max(0, h.pos.y - BOARD.h);
      const onBoard = Math.abs(h.pos.x) < BOARD.w / 2;
      this.heldShadow.visible = onBoard && !this.tower.length;
      this.heldShadow.position.x = h.pos.x + 0.2;
      this.heldShadow.scale.set(h.stone.a * 3, h.stone.a * 1.8, 1);
      (this.heldShadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.7 - hgt * 0.06, 0.2, 0.7);
    }
    this.placeCamera();
  }

  /** The tower's clock, so the sway can be read by the room. */
  get towerTime() {
    return this.time;
  }

  // ——— picking ———

  /** Scene units per screen pixel, across the tower. */
  get unitsPerPx() {
    return (2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect) / this.w;
  }

  /** A point on the tower's plane, on screen. */
  at(x: number, y: number) {
    return this.toScreen(tmpP.set(x, y, 0));
  }

  toScreen(v: THREE.Vector3) {
    tmpV.copy(v).project(this.camera);
    return { x: ((tmpV.x + 1) / 2) * this.w, y: ((1 - tmpV.y) / 2) * this.h };
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
    if (this.held || this.falling.length) this.drawFace();
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}

const FACE_STYLE = { ink: '#3A2B33', blush: '#F2A08C' };

/** Set down, a stone dozes. */
function dozingFace() {
  const c = document.createElement('canvas');
  c.width = c.height = FACE_PX;
  const ctx = c.getContext('2d')!;
  ctx.translate(FACE_PX / 2, FACE_PX / 2);
  const f = new Face();
  f.base = 'sleepy';
  f.update(1);
  drawFace(ctx, f, FACE_PX * 0.72, FACE_STYLE);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A stone: a superellipse turned round, with a soft lump or two; flat where its seat is. */
function stoneGeometry(s: Stone) {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 44, 30);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const e = 2 / s.round;
  const pw = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const seed = s.seed;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const c = Math.hypot(x, z);
    const ring = pw(c);
    const k = c > 1e-6 ? ring / c : 0;
    // Lumps, gone where it sits so stones meet flat.
    const lump = 1 + 0.045 * Math.sin(x * 2.1 + seed) * Math.cos(z * 2.4 + seed * 1.7) + 0.03 * Math.sin(z * 3.3 + x * 1.4 + seed * 0.6);
    p.setXYZ(i, x * k * s.a * lump, pw(y) * s.b, z * k * s.a * 0.82 * lump);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

let instance: StackScene | null = null;
export function getStackScene() {
  return (instance ??= new StackScene());
}
