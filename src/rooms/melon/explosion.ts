import * as THREE from 'three';
import { fruitPalette } from '../../design/fruitPalette';
import { clamp, rand, TAU } from '../../core/math';
import { Face, drawFace, type Expression } from '../../render/face';
import { Debris, type Body } from './debris';
import { MELON_A, type MelonShape } from './shape';
import { makeFleshMaterial } from './melonMaterial';

/**
 * The pop: the squeezed melon bursts into curved rind shards (striped on the
 * outside, pink flesh and pale rind inside), chunky low-poly flesh, juice
 * drops that leave splats on the table, seeds, and the bands — now loose,
 * curly noodles. Everything tumbles, bounces and settles. A few of the
 * bigger chunks keep a little dizzy face.
 */

const W = fruitPalette.watermelon;

const SHARD_X = 6;
const SHARD_PHI = 7;
const CHUNKS = 34;
const DROPS = 220;
const MIST = 120;
/** Juice that keeps spurting out of the split for a moment after the bang. */
const SQUIRT = 110;
const SQUIRT_FOR = 0.55;
const SEEDS = 70;
/** Tiny crumbs of flesh. */
const PULP = 90;
/** How far a sliding piece goes between juicy smears (scene units). */
const SMEAR_EVERY = 0.32;
const MAX_NOODLES = 65;
const MAX_SPLATS = 520;
/** How far the mess can spread from where it burst (scene units). */
export const RIM = 15;
const FACES = 3;
const FACE_PX = 96;

interface Piece {
  body: Body;
  mesh: THREE.Object3D;
  /** Scale while it pops away at the end. */
  scale: number;
  /** When it disappears during the clear-up (s). */
  goneAt: number;
}

interface FaceSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  face: Face;
  piece: Piece;
  r: number;
}

export interface ExplosionEvents {
  land?(b: Body, speed: number, at: THREE.Vector3): void;
  gone?(at: THREE.Vector3, size: number, index: number): void;
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

export class Explosion {
  readonly group = new THREE.Group();
  readonly debris = new Debris();
  events: ExplosionEvents = {};
  active = false;
  private pieces: Piece[] = [];
  private faces: FaceSprite[] = [];
  private drops: Body[] = [];
  private seeds: Body[] = [];
  private pulp: Body[] = [];
  private pulpMesh: THREE.InstancedMesh;
  /** Juice still to come out of the split: where from, and how. */
  private squirt: { t: number; left: number; from: () => { pos: THREE.Vector3; vel: THREE.Vector3 } } | null = null;
  private smear = new Map<Body, { x: number; z: number }>();
  private dropMesh: THREE.InstancedMesh;
  private seedMesh: THREE.InstancedMesh;
  private splatMesh: THREE.InstancedMesh;
  private splats: { x: number; z: number; r: number; t: number; tint: number; ang: number; stretch: number }[] = [];
  private fleshMat = makeFleshMaterial();
  private chunkMats: THREE.MeshStandardMaterial[];
  private clearT = -1;
  /** How the bands came off: snapped strands and whole loops. */
  strands = 0;
  rings = 0;

  constructor(
    private shardMat: THREE.Material,
    private bandMat: (color: string) => THREE.Material,
  ) {
    this.chunkMats = [W.flesh, W.fleshLight, '#FF5A6B'].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, flatShading: true, envMapIntensity: 0.6 }),
    );
    const dropGeo = new THREE.SphereGeometry(1, 12, 8);
    this.dropMesh = new THREE.InstancedMesh(
      dropGeo,
      new THREE.MeshStandardMaterial({ color: W.fleshLight, roughness: 0.2, envMapIntensity: 0.8 }),
      DROPS + MIST + SQUIRT,
    );
    this.dropMesh.castShadow = true;
    const pulpGeo = new THREE.IcosahedronGeometry(1, 0);
    this.pulpMesh = new THREE.InstancedMesh(
      pulpGeo,
      new THREE.MeshStandardMaterial({ color: W.flesh, roughness: 0.45, flatShading: true, envMapIntensity: 0.6 }),
      PULP,
    );
    this.pulpMesh.castShadow = true;
    const seedGeo = new THREE.SphereGeometry(1, 12, 8);
    seedGeo.scale(1, 0.45, 0.62);
    this.seedMesh = new THREE.InstancedMesh(
      seedGeo,
      new THREE.MeshStandardMaterial({ color: W.seed, roughness: 0.25, envMapIntensity: 0.9 }),
      SEEDS,
    );
    this.seedMesh.castShadow = true;
    const splatGeo = blobGeometry();
    this.splatMesh = new THREE.InstancedMesh(
      splatGeo,
      new THREE.MeshBasicMaterial({
        color: W.fleshLight,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      MAX_SPLATS,
    );
    this.splatMesh.renderOrder = -1;
    for (const m of [this.dropMesh, this.seedMesh, this.pulpMesh, this.splatMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.debris.events.land = (b, speed) => this.onLand(b, speed);
  }

  // ——— building the burst ———

  /**
   * Burst `shape` as it stands, placed in the world by `melon` (its root
   * object: position, yaw, squash).
   */
  start(shape: MelonShape, melon: THREE.Object3D, bandColors: string[]) {
    this.reset();
    this.active = true;
    melon.updateMatrixWorld(true);
    const M = melon.matrixWorld;
    const rot = new THREE.Quaternion();
    melon.getWorldQuaternion(rot);
    const centre = new THREE.Vector3().setFromMatrixPosition(M);
    this.debris.rim = { x: centre.x, z: centre.z, r: RIM };
    const Ls = shape.lengthScale;
    const local = (xn: number, phi: number, inset = 0) => {
      const r = shape.surfaceAt(xn) * (1 - inset);
      return new THREE.Vector3(xn * MELON_A * Ls, Math.cos(phi) * r, Math.sin(phi) * r);
    };
    const outward = (p: THREE.Vector3, speed: number, up: number) => {
      // Away from the axis (and a little along it), plus a lift.
      const d = new THREE.Vector3(p.x * 0.35, p.y, p.z).normalize().applyQuaternion(rot);
      return d.multiplyScalar(speed).add(new THREE.Vector3(0, up, 0));
    };

    // It gives way at its tightest groove: that's where the rind splits,
    // and where the juice squirts out from.
    const g = clamp(shape.grooveX, -0.7, 0.7);
    // Uneven cuts, so shards come in all sizes; one always lies on the groove.
    const cuts = [-1];
    const left = Math.floor(SHARD_X / 2);
    for (let i = 1; i < left; i++) cuts.push(-1 + ((g + 1) * (i + rand(-0.3, 0.3))) / left);
    cuts.push(g);
    for (let i = 1; i < SHARD_X - left; i++) cuts.push(g + ((1 - g) * (i + rand(-0.3, 0.3))) / (SHARD_X - left));
    cuts.push(1);
    const split = (xn: number) => clamp(g + (xn - g) * 0.35, -0.95, 0.95);

    // Rind shards: the melon's own surface, torn into curved pieces.
    const phi0 = rand(0, TAU);
    for (let i = 0; i < SHARD_X; i++) {
      for (let j = 0; j < SHARD_PHI; j++) {
        const x0 = cuts[i];
        const x1 = cuts[i + 1];
        const jit = (k: number) => (k % SHARD_PHI === 0 ? 0 : rand(-0.28, 0.28));
        const p0 = phi0 + (TAU * (j + jit(j))) / SHARD_PHI;
        const p1 = phi0 + (TAU * (j + 1 + jit(j + 1))) / SHARD_PHI;
        const { geo, centre: c, normal } = shardGeometry(shape, x0, x1, p0, p1);
        const mesh = new THREE.Mesh(geo, [this.shardMat, this.fleshMat]);
        mesh.castShadow = true;
        const pos = c.clone().applyMatrix4(M);
        const body = this.debris.add({
          kind: 'shard',
          pos,
          vel: outward(c, rand(9, 21), rand(7, 17)),
          q: rot.clone(),
          w: new THREE.Vector3(rand(-11, 11), rand(-7, 7), rand(-11, 11)),
          rest: 0.2,
          up: normal,
          bounce: 0.3,
          size: 0.75,
          grip: rand(2.6, 4),
        });
        mesh.scale.copy(melon.getWorldScale(tmpS));
        this.addPiece(body, mesh);
      }
    }

    // Flesh: chunky, faceted bits from the inside.
    for (let i = 0; i < CHUNKS; i++) {
      const r = (i < FACES ? 1.3 : 1) * (Math.random() < 0.35 ? rand(0.4, 0.62) : rand(0.16, 0.38));
      const geo = chunkGeometry(r);
      const mesh = new THREE.Mesh(geo, this.chunkMats[i % this.chunkMats.length]);
      mesh.castShadow = true;
      const c = local(split(rand(-0.9, 0.9)), rand(0, TAU), rand(0.3, 0.8));
      const body = this.debris.add({
        kind: 'chunk',
        pos: c.clone().applyMatrix4(M),
        vel: outward(c, rand(7, 20), rand(7, 17)),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU))),
        w: new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15)),
        rest: r * 0.72,
        bounce: 0.45,
        size: r,
        grip: rand(2, 3.4),
      });
      const piece = this.addPiece(body, mesh);
      if (i < FACES && typeof document !== 'undefined') this.addFace(piece, r);
    }

    // Juice and seeds, flung everywhere.
    for (let i = 0; i < DROPS + MIST; i++) {
      // Juice squirts out of the split; a fine mist outruns everything.
      const mist = i >= DROPS;
      const c = local(split(rand(-1, 1)), rand(0, TAU), rand(0, 0.5));
      this.drops.push(
        this.debris.add({
          kind: 'drop',
          pos: c.clone().applyMatrix4(M),
          vel: mist ? outward(c, rand(16, 28), rand(3, 13)) : outward(c, rand(7, 24), rand(3, 18)),
          rest: 0.03,
          size: mist ? rand(0.025, 0.045) : rand(0.05, 0.12),
        }),
      );
    }
    for (let i = 0; i < SEEDS; i++) {
      const c = local(split(rand(-1, 1)), rand(0, TAU), rand(0.25, 0.6));
      this.seeds.push(
        this.debris.add({
          kind: 'seed',
          pos: c.clone().applyMatrix4(M),
          vel: outward(c, rand(7, 20), rand(4, 15)),
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), 0)),
          w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
          rest: 0.045,
          up: new THREE.Vector3(0, 1, 0),
          bounce: 0.35,
          size: 0.1,
        }),
      );
    }
    for (let i = 0; i < PULP; i++) {
      const c = local(split(rand(-1, 1)), rand(0, TAU), rand(0.2, 0.7));
      this.pulp.push(
        this.debris.add({
          kind: 'chunk',
          pos: c.clone().applyMatrix4(M),
          vel: outward(c, rand(6, 22), rand(4, 16)),
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU))),
          w: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)),
          rest: 0.04,
          bounce: 0.4,
          size: rand(0.05, 0.11),
          grip: 3,
        }),
      );
    }
    // Juice keeps spurting out of the split for a moment.
    this.squirt = {
      t: 0,
      left: SQUIRT,
      from: () => {
        const c = local(clamp(g + rand(-0.12, 0.12), -0.95, 0.95), rand(0, TAU), 0.05);
        return { pos: c.clone().applyMatrix4(M), vel: outward(c, rand(5, 16), rand(4, 14)) };
      },
    };
    this.dropMesh.count = this.drops.length;
    this.seedMesh.count = this.seeds.length;
    this.pulpMesh.count = this.pulp.length;

    // The bands snap: most fly off as wriggly strands, a few stay loops.
    const colors = bandColors.slice(-MAX_NOODLES);
    colors.forEach((color, i) => {
      const ring = Math.random() < 0.28;
      const r = rand(0.45, 0.85);
      const mesh = new THREE.Mesh(ring ? noodleGeometry(r) : strandGeometry(r * 2.4), this.bandMat(color));
      mesh.castShadow = true;
      const xn = (i / Math.max(1, colors.length - 1) - 0.5) * 0.5 + g;
      const c = local(clamp(xn, -0.9, 0.9), rand(0, TAU), 0);
      const body = this.debris.add({
        kind: 'band',
        pos: c.clone().applyMatrix4(M),
        vel: outward(c, rand(6, 17), rand(6, 15)),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), 0)),
        w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        rest: 0.035,
        up: new THREE.Vector3(0, 0, 1),
        bounce: 0.2,
        size: r,
      });
      this.addPiece(body, mesh);
      if (ring) this.rings++;
      else this.strands++;
    });

    // A big splash right where it burst.
    for (let i = 0; i < 22; i++) {
      const a = rand(0, TAU);
      const d = rand(0, 2.6);
      this.addSplat(centre.x + Math.cos(a) * d, centre.z + Math.sin(a) * d, rand(0.35, 1.1), 0.12 + i * 0.02, a, rand(1, 2.2));
    }
  }

  private addPiece(body: Body, mesh: THREE.Object3D) {
    const piece: Piece = { body, mesh, scale: 1, goneAt: 0 };
    this.pieces.push(piece);
    this.group.add(mesh);
    return piece;
  }

  private addFace(piece: Piece, r: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FACE_PX;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.setScalar(r * 1.25);
    const face = new Face();
    face.set('dizzy', rand(2.2, 3.2));
    face.base = 'happy';
    this.faces.push({ sprite, canvas, tex, face, piece, r });
    this.group.add(sprite);
  }

  private addSplat(x: number, z: number, r: number, delay = 0, ang = rand(0, TAU), stretch = 1) {
    if (this.splats.length >= MAX_SPLATS) return;
    this.splats.push({ x, z, r, t: -delay, tint: Math.random(), ang, stretch });
  }

  private onLand(b: Body, speed: number) {
    const at = b.pos;
    // Fast drops streak along the way they were going.
    const hs = Math.hypot(b.vel.x, b.vel.z);
    const ang = Math.atan2(b.vel.z, b.vel.x);
    if (b.kind === 'drop') this.addSplat(at.x, at.z, b.size * rand(2.2, 4.2), 0, ang, 1 + Math.min(2.6, hs / 5));
    else if ((b.kind === 'chunk' || b.kind === 'shard') && speed > 4 && b.size > 0.12)
      this.addSplat(at.x, at.z, b.size * rand(0.6, 1.1), 0, ang, 1 + Math.min(1.5, hs / 8));
    this.events.land?.(b, speed, at);
  }

  // ——— running ———

  update(dt: number, camera: THREE.Camera) {
    if (!this.active) return;
    this.debris.step(dt);
    for (const p of this.pieces) {
      p.mesh.position.copy(p.body.pos);
      p.mesh.quaternion.copy(p.body.q);
      if (p.scale < 1) p.mesh.scale.setScalar(Math.max(0.0001, p.scale));
    }
    this.syncInstances(this.drops, this.dropMesh, (b) => (b.dead ? 0 : b.size));
    this.syncInstances(this.seeds, this.seedMesh, (b) => b.size * 1.3);
    this.syncInstances(this.pulp, this.pulpMesh, (b) => b.size);
    // Juice still spurting out of the split.
    const sq = this.squirt;
    if (sq && sq.left > 0) {
      sq.t += dt;
      const due = Math.min(sq.left, Math.round(SQUIRT * Math.min(1, sq.t / SQUIRT_FOR)) - (SQUIRT - sq.left));
      for (let i = 0; i < due; i++) {
        const { pos, vel } = sq.from();
        this.drops.push(this.debris.add({ kind: 'drop', pos, vel, rest: 0.03, size: rand(0.04, 0.1) }));
        sq.left--;
      }
      this.dropMesh.count = this.drops.length;
    }
    // Pieces skidding across the table leave juicy smears behind them.
    for (const p of this.pieces) {
      const b = p.body;
      if (b.kind === 'band' || b.settled || b.pos.y > b.rest + 0.02) continue;
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs < 1.2) continue;
      const last = this.smear.get(b);
      if (!last) {
        this.smear.set(b, { x: b.pos.x, z: b.pos.z });
        continue;
      }
      if (Math.hypot(b.pos.x - last.x, b.pos.z - last.z) > SMEAR_EVERY) {
        this.addSplat(b.pos.x, b.pos.z, b.size * rand(0.35, 0.6), 0, Math.atan2(b.vel.z, b.vel.x), 2.2);
        last.x = b.pos.x;
        last.z = b.pos.z;
      }
    }
    for (const s of this.splats) s.t += dt;
    this.syncSplats();
    // Faces stay on the camera side of their chunk.
    for (const f of this.faces) {
      f.face.update(dt);
      const p = f.piece.body.pos;
      tmpV.copy(camera.position).sub(p).normalize();
      f.sprite.position.copy(p).addScaledVector(tmpV, f.r * 0.95);
      f.sprite.scale.setScalar(f.r * 1.25 * f.piece.scale);
      f.sprite.visible = f.piece.scale > 0.02;
      const ctx = f.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, FACE_PX, FACE_PX);
      ctx.save();
      ctx.translate(FACE_PX / 2, FACE_PX / 2);
      drawFace(ctx, f.face, FACE_PX * 0.62, { ink: '#3A2621', blush: '#FF9AAE' });
      ctx.restore();
      f.tex.needsUpdate = true;
    }
  }

  private syncInstances(list: Body[], mesh: THREE.InstancedMesh, size: (b: Body) => number) {
    list.forEach((b, i) => {
      const s = size(b) * (this.clearT >= 0 ? clamp(1 - this.clearT * 1.5, 0, 1) : 1);
      tmpS.setScalar(Math.max(0.0001, s));
      tmpM.compose(b.pos, b.q, tmpS);
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private syncSplats() {
    const fade = this.clearT >= 0 ? clamp(1 - this.clearT * 1.2, 0, 1) : 1;
    const color = new THREE.Color();
    this.splats.forEach((s, i) => {
      const grow = s.t <= 0 ? 0 : 1 - Math.pow(1 - clamp(s.t / 0.18, 0, 1), 3);
      const k = Math.max(0.0001, s.r * grow * fade);
      tmpS.set(k * s.stretch, 1, k / Math.sqrt(s.stretch));
      tmpV.set(s.x, 0.004 + (i % 9) * 0.0005, s.z);
      tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -s.ang);
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.splatMesh.setMatrixAt(i, tmpM);
      this.splatMesh.setColorAt(i, color.set(s.tint < 0.5 ? W.fleshLight : W.flesh));
    });
    this.splatMesh.count = this.splats.length;
    this.splatMesh.instanceMatrix.needsUpdate = true;
    if (this.splatMesh.instanceColor) this.splatMesh.instanceColor.needsUpdate = true;
  }

  /** Has everything come to rest? */
  get settled() {
    return this.debris.still;
  }

  /** Begin tidying up: pieces pop away one by one, splats fade. */
  beginClear() {
    this.clearT = 0;
    const order = [...this.pieces].sort((a, b) => a.body.pos.x - b.body.pos.x);
    order.forEach((p, i) => (p.goneAt = 0.1 + i * (1.1 / order.length)));
  }

  /** Advance the tidy-up; true once everything has gone. */
  clear(dt: number) {
    if (this.clearT < 0) return true;
    this.clearT += dt;
    let left = 0;
    this.pieces.forEach((p, i) => {
      if (p.scale <= 0) return;
      if (this.clearT >= p.goneAt) {
        const before = p.scale;
        p.scale = Math.max(0, p.scale - dt * 6);
        if (before === 1) this.events.gone?.(p.body.pos.clone(), p.body.size, i);
      }
      if (p.scale > 0) left++;
    });
    return left === 0 && this.clearT > 1.4;
  }

  /** The piece nearest a ray, if it passes close by (for pokes). */
  pick(ray: THREE.Ray) {
    let best: Body | null = null;
    let bestD = Infinity;
    for (const p of this.pieces) {
      if (p.scale < 1) continue;
      const d = ray.distanceToPoint(p.body.pos);
      const reach = p.body.kind === 'shard' ? 0.9 : p.body.size + 0.3;
      if (d < reach && d < bestD) {
        bestD = d;
        best = p.body;
      }
    }
    return best;
  }

  /** Give everything near a point a little hop. */
  hop(at: THREE.Vector3, radius: number) {
    for (const p of this.pieces) {
      const d = p.body.pos.distanceTo(at);
      if (d < radius) this.debris.poke(p.body, 0.6 * (1 - d / radius));
    }
  }

  reset() {
    for (const p of this.pieces) {
      this.group.remove(p.mesh);
      const m = p.mesh as THREE.Mesh;
      m.geometry?.dispose();
    }
    for (const f of this.faces) {
      this.group.remove(f.sprite);
      f.tex.dispose();
      f.sprite.material.dispose();
    }
    this.pieces = [];
    this.faces = [];
    this.drops = [];
    this.seeds = [];
    this.pulp = [];
    this.squirt = null;
    this.smear.clear();
    this.splats = [];
    this.debris.clear();
    this.dropMesh.count = 0;
    this.seedMesh.count = 0;
    this.pulpMesh.count = 0;
    this.splatMesh.count = 0;
    this.clearT = -1;
    this.strands = 0;
    this.rings = 0;
    this.active = false;
  }

  /** Faces on the chunks follow the room's mood. */
  setFaces(expr: Expression, hold: number) {
    for (const f of this.faces) f.face.set(expr, hold);
  }
}

// ——— geometry ———

/**
 * A curved piece of rind cut from the melon's current (squeezed) shape:
 * striped skin outside, pink flesh inside, pale rind along the torn edges.
 * Returned centred on its own middle, with the outward normal there.
 */
export function shardGeometry(shape: MelonShape, x0: number, x1: number, p0: number, p1: number) {
  const NU = 8;
  const NV = 8;
  const thick = 0.17;
  const Ls = shape.lengthScale;
  const seed = rand(0, 100);
  // Torn edges: the outline wobbles.
  const jitter = (k: number, edge: number) => Math.sin(k * 9.1 + seed + edge * 3.7) * 0.5 + Math.sin(k * 23.3 + seed * 1.7) * 0.25;
  const grid = (i: number, j: number) => {
    let u = i / (NU - 1);
    let v = j / (NV - 1);
    if (i === 0 || i === NU - 1) u += jitter(v, i) * 0.12 * (i === 0 ? 1 : -1);
    if (j === 0 || j === NV - 1) v += jitter(u, j + 2) * 0.12 * (j === 0 ? 1 : -1);
    const xn = clamp(x0 + (x1 - x0) * u, -0.995, 0.995);
    const phi = p0 + (p1 - p0) * v;
    return { xn, phi };
  };
  const pos: number[] = [];
  const rest: number[] = [];
  const colors: number[] = [];
  const index0: number[] = [];
  const index1: number[] = [];
  const skin = new THREE.Color(W.skin);
  const flesh = new THREE.Color(W.flesh);
  const fleshLight = new THREE.Color(W.fleshLight);
  const rind = new THREE.Color(W.rind);
  const vert = (xn: number, phi: number, inset: number, c: THREE.Color) => {
    const r = shape.surfaceAt(xn) * (1 - inset);
    const s = Math.sqrt(Math.max(0, 1 - xn * xn));
    pos.push(xn * MELON_A * Ls, Math.cos(phi) * r, Math.sin(phi) * r);
    rest.push(xn, Math.cos(phi) * s, Math.sin(phi) * s);
    colors.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };
  const outer: number[][] = [];
  const inner: number[][] = [];
  for (let i = 0; i < NU; i++) {
    outer.push([]);
    inner.push([]);
    for (let j = 0; j < NV; j++) {
      const { xn, phi } = grid(i, j);
      outer[i].push(vert(xn, phi, 0, skin));
      // The inside is flesh, paler toward the middle of the piece.
      const mid = 1 - Math.abs(i / (NU - 1) - 0.5) - Math.abs(j / (NV - 1) - 0.5);
      inner[i].push(vert(xn, phi, thick, flesh.clone().lerp(fleshLight, clamp(mid, 0, 1) * 0.6)));
    }
  }
  for (let i = 0; i < NU - 1; i++) {
    for (let j = 0; j < NV - 1; j++) {
      const a = outer[i][j];
      const b = outer[i + 1][j];
      const c = outer[i + 1][j + 1];
      const d = outer[i][j + 1];
      index0.push(a, d, b, b, d, c);
      const e = inner[i][j];
      const f = inner[i + 1][j];
      const g = inner[i + 1][j + 1];
      const h = inner[i][j + 1];
      index1.push(e, f, h, f, g, h);
    }
  }
  // Torn edges: pale rind on the outside, flesh on the inside.
  const edge: [number, number][] = [];
  for (let i = 0; i < NU; i++) edge.push([i, 0]);
  for (let j = 1; j < NV; j++) edge.push([NU - 1, j]);
  for (let i = NU - 2; i >= 0; i--) edge.push([i, NV - 1]);
  for (let j = NV - 2; j > 0; j--) edge.push([0, j]);
  for (let k = 0; k < edge.length; k++) {
    const [i0, j0] = edge[k];
    const [i1, j1] = edge[(k + 1) % edge.length];
    const g0 = grid(i0, j0);
    const g1 = grid(i1, j1);
    const a = vert(g0.xn, g0.phi, 0.01, rind);
    const b = vert(g1.xn, g1.phi, 0.01, rind);
    const c = vert(g1.xn, g1.phi, thick * 0.55, rind);
    const d = vert(g0.xn, g0.phi, thick * 0.55, rind);
    const e = vert(g1.xn, g1.phi, thick, flesh);
    const f = vert(g0.xn, g0.phi, thick, flesh);
    index1.push(a, c, b, a, d, c, d, e, c, d, f, e);
  }
  // Centre it.
  const centre = new THREE.Vector3();
  const n = pos.length / 3;
  for (let k = 0; k < n; k++) centre.add(tmpV.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
  centre.divideScalar(n);
  for (let k = 0; k < n; k++) {
    pos[k * 3] -= centre.x;
    pos[k * 3 + 1] -= centre.y;
    pos[k * 3 + 2] -= centre.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aRest', new THREE.Float32BufferAttribute(rest, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex([...index0, ...index1]);
  geo.addGroup(0, index0.length, 0);
  geo.addGroup(index0.length, index1.length, 1);
  geo.computeVertexNormals();
  const mid = grid((NU - 1) / 2, (NV - 1) / 2);
  const normal = new THREE.Vector3(0, Math.cos(mid.phi), Math.sin(mid.phi));
  return { geo, centre, normal };
}

/** A chunky, faceted lump of flesh. */
export function chunkGeometry(r: number) {
  const geo = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
  const p = geo.attributes.position;
  // Nudge corners (consistently, so faces stay closed).
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = rand(0.78, 1.12)));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A juice splat: a soft, lumpy blob lying on the table (radius ≈ 1). */
export function blobGeometry() {
  const shapes: THREE.Shape[] = [];
  const shape = new THREE.Shape();
  const n = 40;
  const lobes = [rand(0, TAU), rand(0, TAU), rand(0, TAU)];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + 0.16 * Math.sin(a * 3 + lobes[0]) + 0.1 * Math.sin(a * 5 + lobes[1]) + 0.06 * Math.sin(a * 9 + lobes[2]);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  // Little satellite droplets round the edge.
  for (let k = 0; k < 5; k++) {
    const a = rand(0, TAU);
    const d = rand(1.25, 1.6);
    const r = rand(0.08, 0.16);
    const dot = new THREE.Shape();
    dot.absarc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU, false);
    shapes.push(dot);
  }
  shapes.push(shape);
  const geo = new THREE.ShapeGeometry(shapes, 6);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** A snapped rubber band: a wriggly open strand, lying in its own XY plane. */
export function strandGeometry(len: number) {
  const pts: THREE.Vector3[] = [];
  const n = 9;
  const ph = rand(0, TAU);
  const curl = rand(0.12, 0.3) * len;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(new THREE.Vector3((t - 0.5) * len, Math.sin(t * TAU * rand(1, 1.6) + ph) * curl + rand(-0.05, 0.05), rand(-0.03, 0.03)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, 48, 0.032, 6, false);
}

/** A loose rubber band: a wobbly closed loop, lying in its own XY plane. */
export function noodleGeometry(r: number) {
  const pts: THREE.Vector3[] = [];
  const n = 11;
  const ph = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.75 + 0.35 * Math.sin(a * 2 + ph) + rand(-0.12, 0.12));
    pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, rand(-0.04, 0.04)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 72, 0.032, 6, true);
}
