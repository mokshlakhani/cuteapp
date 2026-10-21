import * as THREE from 'three';
import { clamp, pick, rand, randInt, TAU } from '../../core/math';
import { Face, drawFace, type Expression } from '../../render/face';
import { Debris, type Body } from './debris';
import { MELON_A, MELON_R, type MelonShape } from './shape';
import { makeFleshMaterial } from './melonMaterial';
import { POP_FRUITS, type PopFruit, type SeedKind } from './fruits';

/**
 * The pop. The squeezed fruit fractures the way its skin really would: a
 * watermelon's brittle rind into many irregular pieces, small where it split
 * and big end caps that tumble open; an orange's peel tears in a few big
 * flaps; a coconut's shell cracks into a handful of hard pieces. Out comes
 * what's really inside — wet lumps of flesh (some with seeds still in), citrus
 * segments, clusters of pomegranate arils, curls of coconut meat — with juice
 * that stretches into streaks as it flies and lands in shaded puddles, seeds,
 * stringy pulp, and the bands snapping into wriggly strands. A soft puff of
 * mist and a ring across the table mark the bang. No two bursts are alike:
 * each picks its own direction, strength and amount of mess. A few bigger
 * chunks keep little dizzy faces.
 */

/** Fracture grid on the rind: along the melon, and around it. */
const GX = 84;
const GY = 112;
const MAX_DROPS = 420;
const MAX_SEEDS = 170;
const MAX_PULP = 60;
const MAX_NOODLES = 65;
const MAX_SPLATS = 480;
/** How far a sliding piece goes between juicy smears (scene units). */
const SMEAR_EVERY = 0.34;
/** How far the mess can spread from where it burst (scene units). */
export const RIM = 15;
const FACES = 3;
const FACE_PX = 96;

interface Piece {
  body: Body;
  mesh: THREE.Object3D;
  /** Scale while it pops away at the end. */
  scale: number;
  /** When it starts to pop away during the clear-up (s). */
  goneAt: number;
  popped: boolean;
  /** Its own size (a pooled shape is scaled to it), which the pop-away scales from. */
  base: THREE.Vector3;
}

interface FaceSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  face: Face;
  piece: Piece;
  r: number;
  /** The face last drawn (see Face.signature). */
  sig: string;
}

interface Splat {
  x: number;
  z: number;
  r: number;
  t: number;
  tint: number;
  ang: number;
  stretch: number;
}

export interface ExplosionEvents {
  land?(b: Body, speed: number, at: THREE.Vector3): void;
  gone?(at: THREE.Vector3, size: number, index: number): void;
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color('#ffffff');
const hasDom = typeof document !== 'undefined';

/**
 * How a burst goes: `force` scales how hard everything flies, `rim` is how far
 * the mess may spread (so it stays where the camera can see it), and `depth`
 * how much of it heads toward or away from the camera.
 */
export interface BurstOptions {
  force?: number;
  rim?: number;
  depth?: number;
}

export class Explosion {
  readonly group = new THREE.Group();
  readonly debris = new Debris();
  events: ExplosionEvents = {};
  active = false;
  /** How the bands came off: snapped strands and whole loops. */
  strands = 0;
  rings = 0;
  /** How many rind pieces the last burst made. */
  shards = 0;

  private pieces: Piece[] = [];
  private faces: FaceSprite[] = [];
  /**
   * Ready-made shapes, built once and reused at any size (scaled): flesh
   * lumps, citrus segments, band strands and loops. Building them fresh at
   * the moment of the pop was its hitch.
   */
  private pool: { lumps: THREE.BufferGeometry[]; segments: THREE.BufferGeometry[]; strands: THREE.BufferGeometry[]; loops: { r: number; geo: THREE.BufferGeometry }[] } | null = null;
  private drops: Body[] = [];
  private seeds: Body[] = [];
  private pulp: Body[] = [];
  private splats: Splat[] = [];
  private smear = new Map<Body, { x: number; z: number }>();
  private squirt: { t: number; left: number; total: number; dur: number; from: () => { pos: THREE.Vector3; vel: THREE.Vector3 } } | null =
    null;
  private dropMesh: THREE.InstancedMesh;
  private seedMesh: THREE.InstancedMesh;
  private pulpMesh: THREE.InstancedMesh;
  private splatMesh: THREE.InstancedMesh;
  private fleshMat = makeFleshMaterial();
  private chunkMats: THREE.MeshPhysicalMaterial[];
  private seedGeo: THREE.BufferGeometry;
  private seedMat: THREE.MeshPhysicalMaterial;
  private dropMat: THREE.MeshPhysicalMaterial;
  private pulpMat: THREE.MeshPhysicalMaterial;
  private liningMat: THREE.MeshPhysicalMaterial;
  private fruit: PopFruit = POP_FRUITS[0];
  /** The rind, being broken ahead of the pop (a few pieces each frame). */
  private prep: { steps: Generator<void, Fragment[], void>; g: number; frags: Fragment[] | null } | null = null;
  private pulpSacs = false;
  private juice = new THREE.Color();
  /** The bang: a soft puff of mist and a ring running out across the table. */
  private puffs: THREE.Sprite[] = [];
  private ring: THREE.Mesh | null = null;
  private bangT = 1;
  private bangAt = new THREE.Vector3();
  private clearT = -1;

  /** Nothing in the mess is moving or fading: its shadows needn't be redrawn. */
  get resting() {
    return this.active && this.clearT < 0 && this.debris.still;
  }

  constructor(
    private shardMat: THREE.Material,
    private bandMat: (color: string) => THREE.Material,
  ) {
    this.fleshMat.side = THREE.DoubleSide;
    const glossy = (c: string) =>
      new THREE.MeshPhysicalMaterial({
        color: c,
        roughness: 0.42,
        clearcoat: 0.8,
        clearcoatRoughness: 0.18,
        sheen: 0.3,
        sheenColor: new THREE.Color('#ffffff'),
        envMapIntensity: 0.7,
      });
    this.chunkMats = [0, 1, 2, 3].map(() => glossy('#ffffff'));
    this.liningMat = glossy('#ffffff');
    // Juice: glossy, a touch deeper than the flesh, stretched along its flight.
    this.dropMat = new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1 });
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), this.dropMat, MAX_DROPS);
    // Drops, seeds and pulp are too small to see a shadow under (they leave splats instead).
    this.seedGeo = seedGeometry('teardrop');
    this.seedMat = new THREE.MeshPhysicalMaterial({ roughness: 0.22, envMapIntensity: 1 });
    this.seedMesh = new THREE.InstancedMesh(this.seedGeo, this.seedMat, MAX_SEEDS);

    this.pulpMat = glossy('#ffffff');
    this.pulpMesh = new THREE.InstancedMesh(lumpGeometry(1, 0), this.pulpMat, MAX_PULP);

    this.splatMesh = new THREE.InstancedMesh(
      blobGeometry(),
      new THREE.MeshBasicMaterial({
        map: hasDom ? splatTexture() : null,
        color: '#ffffff',
        transparent: true,
        opacity: 0.9,
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
    if (hasDom) {
      const soft = softTexture();
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: soft, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0 }),
        );
        s.visible = false;
        this.puffs.push(s);
        this.group.add(s);
      }
      const ringGeo = new THREE.PlaneGeometry(2, 2);
      ringGeo.rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0 }),
      );
      this.ring.visible = false;
      this.ring.renderOrder = -1;
      this.group.add(this.ring);
    }
    this.debris.events.land = (b, speed) => this.onLand(b, speed);
    this.setFruit(this.fruit);
  }

  /** The shape pool, built on first need (warmUp builds it ahead of time). */
  private shapes() {
    if (this.pool) return this.pool;
    const keep = (g: THREE.BufferGeometry) => {
      g.userData.pooled = true;
      return g;
    };
    const many = (n: number, make: () => THREE.BufferGeometry) => Array.from({ length: n }, () => keep(make()));
    this.pool = {
      lumps: many(8, () => lumpGeometry(1, 1)),
      segments: many(4, () => segmentGeometry(1)),
      // Strands 2 long, stretched to length along x (their thickness stays).
      strands: many(8, () => strandGeometry(2)),
      // Loops in a few sizes, so scaling one never makes it thick or thin.
      loops: [0.45, 0.55, 0.65, 0.75, 0.85].flatMap((r) => [0, 1].map(() => ({ r, geo: keep(noodleGeometry(r)) }))),
    };
    return this.pool;
  }

  /**
   * Get ready for a pop ahead of time, at a calm moment: build the shape pool
   * and hand back stand-ins for everything a burst draws, so the room can
   * compile their shaders before the moment (the first pop used to stall on it).
   */
  warmUp(): THREE.Object3D[] {
    const pool = this.shapes();
    const seedHolder = new THREE.Mesh(pool.lumps[0], this.chunkMats[0]);
    seedHolder.add(new THREE.Mesh(this.seedGeo, this.seedMat));
    const shardGeo = new THREE.BufferGeometry();
    const tri = new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]);
    shardGeo.setAttribute('position', new THREE.BufferAttribute(tri, 3));
    shardGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    shardGeo.setAttribute('aRest', new THREE.BufferAttribute(tri.slice(), 3));
    shardGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
    shardGeo.addGroup(0, 3, 0);
    shardGeo.addGroup(0, 3, 1);
    const objs: THREE.Object3D[] = [
      new THREE.Mesh(shardGeo, [this.shardMat, this.fleshMat]),
      seedHolder,
      new THREE.Mesh(pool.lumps[0], this.liningMat),
      new THREE.Mesh(pool.strands[0], this.pulpMat),
      new THREE.Mesh(pool.strands[0], this.bandMat('#ffffff')),
      new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })),
    ];
    // Every pooled shape once, so it's uploaded to the GPU before it's needed.
    for (const g of [...pool.lumps, ...pool.segments, ...pool.strands, ...pool.loops.map((l) => l.geo)]) objs.push(new THREE.Mesh(g, this.chunkMats[0]));
    // The instanced kinds (drops, seeds, pulp), which shadow with their own shaders.
    for (const [geo, mat] of [
      [this.dropMesh.geometry, this.dropMat],
      [this.seedGeo, this.seedMat],
      [this.pulpMesh.geometry, this.pulpMat],
    ] as const) {
      const im = new THREE.InstancedMesh(geo, mat, 1);
      im.setMatrixAt(0, new THREE.Matrix4());
      objs.push(im);
    }
    for (const o of objs) if (!(o instanceof THREE.InstancedMesh)) o.traverse((m) => (m.castShadow = true));
    return objs;
  }

  /** Dress the burst as `fruit`: its flesh, juice, seeds and pulp. */
  setFruit(fruit: PopFruit) {
    this.fruit = fruit;
    const flesh = new THREE.Color(fruit.flesh);
    const light = new THREE.Color(fruit.fleshLight);
    // Four tones of flesh, so the lumps aren't all one colour.
    [0, 1, 0.35, 0.6].forEach((k, i) => this.chunkMats[i].color.copy(flesh).lerp(light, k));
    for (const m of this.chunkMats) m.sheenColor.copy(light).lerp(new THREE.Color('#ffffff'), 0.5);
    this.liningMat.color.set(fruit.lining);
    this.juice.set(fruit.juice.color);
    this.dropMat.color.copy(this.juice);
    this.pulpMat.color.set(fruit.pulp.color);
    // Citrus pulp is little teardrop juice sacs; everything else, soft lumps.
    const sacs = fruit.inside === 'segments';
    if (sacs !== this.pulpSacs) {
      this.pulpSacs = sacs;
      this.pulpMesh.geometry.dispose();
      this.pulpMesh.geometry = sacs ? sacGeometry() : lumpGeometry(1, 0);
    }
    this.pulpMat.transparent = sacs;
    this.pulpMat.opacity = sacs ? 0.85 : 1;
    // Seeds: a new shape for each kind.
    this.seedGeo.dispose();
    this.seedGeo = seedGeometry(fruit.seeds.kind);
    this.seedMesh.geometry = this.seedGeo;
    this.seedMat.color.set(fruit.seeds.color);
    const aril = fruit.seeds.kind === 'aril';
    this.seedMat.roughness = aril ? 0.08 : 0.22;
    this.seedMat.clearcoat = aril ? 1 : 0;
    this.seedMat.emissive.set(aril ? fruit.seeds.color : '#000000');
    this.seedMat.emissiveIntensity = aril ? 0.25 : 0;
    // The bang's puff takes a little of the juice's colour.
    this.puffs.forEach((p, i) => (p.material as THREE.SpriteMaterial).color.set(i ? '#ffffff' : '#ffffff').lerp(this.juice, i ? 0.25 : 0));
  }

  // ——— building the burst ———

  /**
   * Burst `shape` as it stands, placed in the world by `melon` (its root
   * object: position, yaw, squash).
   */
  start(shape: MelonShape, melon: THREE.Object3D, bandColors: string[], opts: BurstOptions = {}) {
    const { force = 1, rim = RIM, depth = 1 } = opts;
    const prep = this.prep;
    this.prep = null;
    this.reset();
    this.active = true;
    melon.updateMatrixWorld(true);
    const M = melon.matrixWorld;
    const rot = new THREE.Quaternion();
    melon.getWorldQuaternion(rot);
    const centre = new THREE.Vector3().setFromMatrixPosition(M);
    this.debris.rim = { x: centre.x, z: centre.z, r: rim };
    const Ls = shape.lengthScale;
    const L = MELON_A * Ls;
    const local = (xn: number, phi: number, inset = 0) => {
      const r = shape.surfaceAt(xn) * (1 - inset);
      return new THREE.Vector3(xn * L, Math.cos(phi) * r, Math.sin(phi) * r);
    };

    // Every burst has its own personality.
    const power = rand(0.9, 1.15) * force;
    const mess = rand(0.75, 1.15);
    // A gentle lean, so it spreads round the middle rather than off to one side.
    const blast = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(rand(0, 0.2));
    // It gives way at its tightest groove: the split, where juice squirts from.
    const g = prep ? prep.g : clamp(shape.grooveX, -0.7, 0.7);
    const origin = new THREE.Vector3(g * L, rand(-0.2, 0.3), rand(-0.2, 0.2));
    const split = (xn: number) => clamp(g + (xn - g) * 0.35, -0.95, 0.95);
    /** World velocity flying away from the split, with this burst's lean. */
    const away = (p: THREE.Vector3, speed: number, up: number) => {
      const d = new THREE.Vector3().copy(p).sub(origin);
      d.x *= 0.6;
      d.normalize().applyQuaternion(rot).add(blast);
      d.z *= depth;
      d.normalize();
      return d.multiplyScalar(speed * power).add(new THREE.Vector3(0, up * power, 0));
    };
    this.bangAt.copy(origin).applyMatrix4(M);
    this.bangT = 0;

    // ——— the rind fractures ———
    const scale = melon.getWorldScale(new THREE.Vector3());
    // Broken ahead of time if we had the chance; whatever's left is finished now.
    let frags: Fragment[];
    if (prep) {
      let r = prep.frags ? null : prep.steps.next();
      while (r && !r.done) r = prep.steps.next();
      frags = prep.frags ?? (r && r.done ? r.value : fracture(shape, g, this.fruit));
    } else frags = fracture(shape, g, this.fruit);
    const meanArea = frags.reduce((a, f) => a + f.area, 0) / frags.length;
    for (const f of frags) {
      const k = f.area / meanArea;
      const mesh = new THREE.Mesh(f.geo, [this.shardMat, this.fleshMat]);
      mesh.castShadow = true;
      mesh.scale.copy(scale);
      // Big end caps lumber away and tumble open; small bits fly.
      const sp = rand(5, 12) / Math.pow(k, 0.38);
      const vel = away(f.centre, clamp(sp, 3, 19), rand(5, 11) / Math.pow(k, 0.22));
      const outward = f.normal.clone().applyQuaternion(rot);
      const tumble = new THREE.Vector3().crossVectors(UP, outward).normalize();
      const w = tumble.multiplyScalar(rand(4, 11) / Math.sqrt(k)).add(new THREE.Vector3(rand(-2, 2), rand(-3, 3), rand(-2, 2)));
      const body = this.debris.add({
        kind: 'shard',
        pos: f.centre.clone().applyMatrix4(M),
        vel,
        q: rot.clone(),
        w,
        rest: 0.18 + Math.min(0.25, f.sag),
        up: f.normal,
        bounce: rand(0.22, 0.38),
        size: clamp(Math.sqrt(k) * 0.7, 0.25, 1.4),
        grip: rand(2.4, 4.2),
      });
      this.addPiece(body, mesh);
    }
    this.shards = frags.length;

    // ——— what's inside: lumps of flesh (seeds and all), segments, arils, meat ———
    const F = this.fruit;
    const chunks = Math.max(FACES, Math.round(randInt(20, 32) * mess * F.chunks));
    for (let i = 0; i < chunks; i++) {
      const big = i < FACES || Math.random() < 0.3;
      const r = (i < FACES ? 1.25 : 1) * (big ? rand(0.36, 0.58) : rand(0.14, 0.32));
      const mesh = this.insideChunk(r, i);
      mesh.castShadow = true;
      const c = local(split(rand(-0.9, 0.9)), rand(0, TAU), rand(0.25, 0.8));
      const body = this.debris.add({
        kind: 'chunk',
        pos: c.clone().applyMatrix4(M),
        vel: away(c, rand(6, 17) / (0.6 + r), rand(6, 15)),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU))),
        w: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(rand(5, 16)),
        rest: r * (F.inside === 'meat' ? 0.3 : F.inside === 'segments' ? 0.45 : 0.7),
        bounce: rand(0.3, 0.5),
        size: r,
        grip: rand(2, 3.6),
      });
      const piece = this.addPiece(body, mesh);
      if (i < FACES && hasDom) this.addFace(piece, r);
    }

    // ——— juice, a burst of mist, seeds and pulp ———
    const drops = Math.min(MAX_DROPS - 40, Math.round(randInt(170, 230) * mess * F.juice.amount));
    for (let i = 0; i < drops; i++) {
      const mist = Math.random() < F.juice.mist;
      const c = local(split(rand(-1, 1)), rand(0, TAU), rand(0, 0.5));
      this.drops.push(
        this.debris.add({
          kind: 'drop',
          pos: c.clone().applyMatrix4(M),
          vel: mist ? away(c, rand(14, 26), rand(3, 12)) : away(c, rand(5, 22), rand(3, 17)),
          rest: 0.03,
          size: mist ? rand(0.025, 0.045) : rand(0.045, 0.12),
        }),
      );
    }
    const seeds = Math.min(MAX_SEEDS, Math.round(randInt(45, 70) * mess * F.seeds.count));
    const seedSize = F.seeds.size / 0.1;
    for (let i = 0; i < seeds; i++) {
      const c = local(split(rand(-1, 1)), rand(0, TAU), rand(0.25, 0.6));
      this.seeds.push(
        this.debris.add({
          kind: 'seed',
          pos: c.clone().applyMatrix4(M),
          vel: away(c, rand(6, 18), rand(4, 14)),
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), 0)),
          w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
          rest: 0.04,
          up: new THREE.Vector3(0, 1, 0),
          bounce: 0.35,
          size: rand(0.085, 0.12) * seedSize,
        }),
      );
    }
    const pulp = Math.min(MAX_PULP, Math.round(randInt(35, 55) * mess * F.pulp.count));
    for (let i = 0; i < pulp; i++) {
      const c = local(split(rand(-1, 1)), rand(0, TAU), rand(0.2, 0.7));
      this.pulp.push(
        this.debris.add({
          kind: 'chunk',
          pos: c.clone().applyMatrix4(M),
          vel: away(c, rand(6, 20), rand(4, 15)),
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU))),
          w: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)),
          rest: 0.04,
          bounce: 0.4,
          size: rand(0.05, 0.1),
          grip: 3,
        }),
      );
    }
    // Stringy pulp from round the seeds (melons, pumpkins), flung out in wet strands.
    if (F.pulp.strings) {
      for (let i = 0, n = randInt(8, 14); i < n; i++) {
        const mesh = new THREE.Mesh(pick(this.shapes().strands), this.pulpMat);
        mesh.scale.x = rand(0.6, 1.4) / 2;
        mesh.castShadow = true;
        const c = local(split(rand(-0.5, 0.5)), rand(0, TAU), rand(0.5, 0.85));
        const body = this.debris.add({
          kind: 'band',
          pos: c.clone().applyMatrix4(M),
          vel: away(c, rand(4, 12), rand(5, 12)),
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), 0)),
          w: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
          rest: 0.035,
          up: new THREE.Vector3(0, 0, 1),
          bounce: 0.1,
          size: 0.5,
        });
        this.addPiece(body, mesh);
      }
    }

    // Juice keeps spurting out of the split for a moment.
    const total = Math.min(MAX_DROPS - this.drops.length, Math.round(rand(60, 110) * mess * F.juice.amount));
    this.squirt = {
      t: 0,
      left: total,
      total,
      dur: rand(0.4, 0.7),
      from: () => {
        const c = local(clamp(g + rand(-0.12, 0.12), -0.95, 0.95), rand(0, TAU), 0.05);
        return { pos: c.clone().applyMatrix4(M), vel: away(c, rand(4, 14), rand(4, 13)) };
      },
    };

    // ——— the bands snap: mostly wriggly strands, some still loops ———
    const colors = bandColors.slice(-MAX_NOODLES);
    colors.forEach((color, i) => {
      const loop = Math.random() < 0.28;
      const r = rand(0.42, 0.85);
      const mesh = loop ? this.loopMesh(r, this.bandMat(color)) : new THREE.Mesh(pick(this.shapes().strands), this.bandMat(color));
      if (!loop) mesh.scale.x = (r * rand(2, 2.8)) / 2;
      mesh.castShadow = true;
      const xn = (i / Math.max(1, colors.length - 1) - 0.5) * 0.5 + g;
      const c = local(clamp(xn, -0.9, 0.9), rand(0, TAU), 0);
      const body = this.debris.add({
        kind: 'band',
        pos: c.clone().applyMatrix4(M),
        vel: away(c, rand(4, 15), rand(6, 15)),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), 0)),
        w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        rest: 0.035,
        up: new THREE.Vector3(0, 0, 1),
        bounce: 0.2,
        size: r,
      });
      this.addPiece(body, mesh);
      if (loop) this.rings++;
      else this.strands++;
    });

    // A splash right where it burst, spraying out the way the blast leans.
    const lean = Math.atan2(blast.z, blast.x);
    for (let i = 0; i < 16; i++) {
      const a = lean + rand(-1.6, 1.6);
      const d = rand(0.2, 2.6) * Math.min(1, rim / RIM + 0.3);
      this.addSplat(centre.x + Math.cos(a) * d, centre.z + Math.sin(a) * d, rand(0.3, 0.95), 0.12 + i * 0.025, a, rand(1, 2.4));
    }
    this.syncAll();
  }

  /** A loose band loop of about radius r, from the pool (the nearest size, scaled the rest of the way). */
  private loopMesh(r: number, mat: THREE.Material) {
    const loops = this.shapes().loops;
    let best = loops[0];
    for (const l of loops) if (Math.abs(l.r - r) < Math.abs(best.r - r) || (l.r === best.r && Math.random() < 0.5)) best = l;
    const mesh = new THREE.Mesh(best.geo, mat);
    mesh.scale.setScalar(r / best.r);
    return mesh;
  }

  /** A piece of what's inside, for this fruit (pooled unit shapes, scaled to r). */
  private insideChunk(r: number, i: number): THREE.Mesh {
    const F = this.fruit;
    const mat = this.chunkMats[i % this.chunkMats.length];
    const pool = this.shapes();
    // Seeds sit in the chunk's own (unit) space, so they're sized against r.
    const seed = (n: number, depth: number, size: number) => {
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(this.seedGeo, this.seedMat);
        const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        s.position.copy(dir).multiplyScalar(depth);
        s.quaternion.setFromUnitVectors(UP, dir);
        s.scale.setScalar(size / r);
        mesh.add(s);
      }
    };
    const unit = (geo: THREE.BufferGeometry, m: THREE.Material, k = 1) => {
      const u = new THREE.Mesh(geo, m);
      u.scale.setScalar(r * k);
      return u;
    };
    let mesh: THREE.Mesh;
    switch (F.inside) {
      case 'segments':
        // A citrus segment: a plump half-moon, its inner edge flat.
        mesh = unit(pick(pool.segments), mat);
        if (F.seeds.kind === 'pip' && Math.random() < 0.3) seed(1, 0.4, 0.08);
        return mesh;
      case 'arils':
        // A lump of pale pith, crowded with glossy arils.
        mesh = unit(pick(pool.lumps), this.liningMat, 0.8);
        seed(Math.round(6 + r * 16), 0.72, 0.14 + r * 0.05);
        return mesh;
      case 'meat': {
        // A curl of coconut meat: a thick, bent flake of white.
        const g = lumpGeometry(r, 1);
        g.scale(1.2, 0.34, 0.9);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + p.getX(k) ** 2 * 0.35);
        g.computeVertexNormals();
        return new THREE.Mesh(g, this.liningMat);
      }
      default:
        mesh = unit(pick(pool.lumps), mat);
        if (r > 0.25) {
          const kind = F.seeds.kind;
          if (kind === 'tiny') seed(randInt(6, 12), 0.92, 0.06);
          else if (kind === 'teardrop' || kind === 'flat') seed(randInt(1, 3), 0.78, 0.1);
        }
        return mesh;
    }
  }

  private addPiece(body: Body, mesh: THREE.Object3D) {
    const piece: Piece = { body, mesh, scale: 1, goneAt: 0, popped: false, base: mesh.scale.clone() };
    this.pieces.push(piece);
    this.group.add(mesh);
    mesh.position.copy(body.pos);
    mesh.quaternion.copy(body.q);
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
    this.faces.push({ sprite, canvas, tex, face, piece, r, sig: '' });
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
    }
    // Juice still spurting out of the split.
    const sq = this.squirt;
    if (sq && sq.left > 0) {
      sq.t += dt;
      const due = Math.min(sq.left, Math.round(sq.total * Math.min(1, sq.t / sq.dur)) - (sq.total - sq.left));
      for (let i = 0; i < due; i++) {
        const { pos, vel } = sq.from();
        this.drops.push(this.debris.add({ kind: 'drop', pos, vel, rest: 0.03, size: rand(0.04, 0.1) }));
        sq.left--;
      }
    }
    // Pieces skidding across the table leave juicy smears behind them.
    for (const p of this.pieces) {
      const b = p.body;
      if (b.kind === 'band' || b.settled || b.pos.y > b.rest + 0.02) continue;
      if (Math.hypot(b.vel.x, b.vel.z) < 1.2) continue;
      const last = this.smear.get(b);
      if (!last) {
        this.smear.set(b, { x: b.pos.x, z: b.pos.z });
        continue;
      }
      if (Math.hypot(b.pos.x - last.x, b.pos.z - last.z) > SMEAR_EVERY) {
        this.addSplat(b.pos.x, b.pos.z, b.size * rand(0.3, 0.55), 0, Math.atan2(b.vel.z, b.vel.x), 2.4);
        last.x = b.pos.x;
        last.z = b.pos.z;
      }
    }
    for (const s of this.splats) s.t += dt;
    this.syncAll();
    this.updateBang(dt);
    // Faces stay on the camera side of their chunk.
    for (const f of this.faces) {
      f.face.update(dt);
      const p = f.piece.body.pos;
      tmpV.copy(camera.position).sub(p).normalize();
      f.sprite.position.copy(p).addScaledVector(tmpV, f.r * 0.95);
      f.sprite.scale.setScalar(f.r * 1.25 * f.piece.scale);
      f.sprite.visible = f.piece.scale > 0.02;
      // Redrawn only when it changes: re-uploading the texture is slow on iPhones.
      const sig = f.face.signature;
      if (sig === f.sig) continue;
      f.sig = sig;
      const ctx = f.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, FACE_PX, FACE_PX);
      ctx.save();
      ctx.translate(FACE_PX / 2, FACE_PX / 2);
      drawFace(ctx, f.face, FACE_PX * 0.62, { ink: '#3A2621', blush: this.fruit.blush });
      ctx.restore();
      f.tex.needsUpdate = true;
    }
  }

  /** The puff of mist and the ring on the table, right at the bang. */
  private updateBang(dt: number) {
    if (this.bangT >= 1) return;
    this.bangT = Math.min(1, this.bangT + dt / 0.6);
    const k = 1 - Math.pow(1 - this.bangT, 3);
    this.puffs.forEach((s, i) => {
      s.visible = this.bangT < 1;
      s.position.copy(this.bangAt).add(tmpV.set(0, i * 0.15, 0));
      s.scale.setScalar(MELON_R * (1.2 + k * (3.2 + i * 1.3)));
      (s.material as THREE.SpriteMaterial).opacity = (1 - this.bangT) * (i ? 0.45 : 0.7);
    });
    if (this.ring) {
      this.ring.visible = this.bangT < 1;
      this.ring.position.set(this.bangAt.x, 0.01, this.bangAt.z);
      this.ring.scale.setScalar(MELON_R * (1 + k * 6));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - this.bangT, 1.4) * 0.8;
    }
  }

  private syncAll() {
    const fade = this.clearT >= 0 ? clamp(1 - this.clearT * 1.5, 0, 1) : 1;
    // Drops stretch along their flight, like real juice.
    this.drops.forEach((b, i) => {
      const sp = b.vel.length();
      const s = b.dead ? 0.0001 : b.size * fade;
      tmpQ.setFromUnitVectors(UP, sp > 0.01 ? tmpV.copy(b.vel).divideScalar(sp) : UP);
      tmpS.set(s / (1 + sp * 0.012), s * (1 + Math.min(2.4, sp * 0.07)), s / (1 + sp * 0.012));
      tmpM.compose(b.pos, tmpQ, tmpS);
      this.dropMesh.setMatrixAt(i, tmpM);
    });
    this.dropMesh.count = this.drops.length;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    this.syncInstances(this.seeds, this.seedMesh, (b) => b.size * fade);
    this.syncInstances(this.pulp, this.pulpMesh, (b) => b.size * fade);
    this.syncSplats();
  }

  private syncInstances(list: Body[], mesh: THREE.InstancedMesh, size: (b: Body) => number) {
    list.forEach((b, i) => {
      tmpS.setScalar(Math.max(0.0001, size(b)));
      tmpM.compose(b.pos, b.q, tmpS);
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private syncSplats() {
    const fade = this.clearT >= 0 ? clamp(1 - this.clearT * 1.1, 0, 1) : 1;
    const color = new THREE.Color();
    this.splats.forEach((s, i) => {
      // Puddles spread out quickly, then creep a little further.
      const grow = s.t <= 0 ? 0 : 1 - Math.pow(1 - clamp(s.t / 0.2, 0, 1), 3) + Math.min(0.12, s.t * 0.02);
      const k = Math.max(0.0001, s.r * grow * fade);
      tmpS.set(k * s.stretch, 1, k / Math.sqrt(s.stretch));
      tmpV.set(s.x, 0.004 + (i % 9) * 0.0005, s.z);
      tmpQ.setFromAxisAngle(UP, -s.ang);
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.splatMesh.setMatrixAt(i, tmpM);
      // Puddles in the juice's colour, each a slightly different strength.
      this.splatMesh.setColorAt(i, color.copy(this.juice).lerp(WHITE, 0.18 + s.tint * 0.2));
    });
    this.splatMesh.count = this.splats.length;
    this.splatMesh.instanceMatrix.needsUpdate = true;
    if (this.splatMesh.instanceColor) this.splatMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Start breaking the rind now, ahead of the pop (call when it's about to
   * go); `pump` then does a little of it each frame.
   */
  prepare(shape: MelonShape) {
    const g = clamp(shape.grooveX, -0.7, 0.7);
    this.prep = { steps: fractureSteps(shape, g, this.fruit), g, frags: null };
  }

  /**
   * Spend up to `ms` breaking the rind ahead of the pop. Once it's broken,
   * returns the pieces once, as stand-ins to draw for a frame (tiny, out of
   * sight) so they're on the GPU before the pop, not uploaded during it.
   */
  pump(ms = 3): THREE.Object3D[] | null {
    const p = this.prep;
    if (!p || p.frags) return null;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const r = p.steps.next();
      if (r.done) {
        p.frags = r.value;
        return p.frags.map((f) => new THREE.Mesh(f.geo, [this.shardMat, this.fleshMat]));
      }
    }
    return null;
  }

  /** Has everything come to rest? */
  get settled() {
    return this.debris.still && (!this.squirt || this.squirt.left === 0);
  }

  /** Begin tidying up: pieces pop away in a ripple from the middle, splats fade. */
  beginClear() {
    this.clearT = 0;
    const c = this.bangAt;
    const order = [...this.pieces].sort((a, b) => a.body.pos.distanceTo(c) - b.body.pos.distanceTo(c));
    order.forEach((p, i) => (p.goneAt = 0.05 + (i / order.length) * 1.05 + rand(0, 0.08)));
  }

  /** Advance the tidy-up; true once everything has gone. */
  clear(dt: number) {
    if (this.clearT < 0) return true;
    this.clearT += dt;
    let left = 0;
    this.pieces.forEach((p, i) => {
      const t = this.clearT - p.goneAt;
      if (t > 0) {
        if (!p.popped) {
          p.popped = true;
          this.events.gone?.(p.body.pos.clone(), p.body.size, i);
        }
        // A little swell, then gone: like a soap bubble popping.
        p.scale = t < 0.08 ? 1 + (t / 0.08) * 0.18 : Math.max(0, 1.18 * (1 - (t - 0.08) / 0.16));
        p.mesh.scale.copy(p.base).multiplyScalar(Math.max(0.0001, p.scale));
      }
      if (p.scale > 0) left++;
    });
    this.syncAll();
    return left === 0 && this.clearT > 1.3;
  }

  /** The piece nearest a ray, if it passes close by (for pokes). */
  pick(ray: THREE.Ray) {
    let best: Body | null = null;
    let bestD = Infinity;
    for (const p of this.pieces) {
      if (p.popped) continue;
      const d = ray.distanceToPoint(p.body.pos);
      const reach = p.body.kind === 'shard' ? 0.5 + p.body.size * 0.6 : p.body.size + 0.3;
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
      const g = (p.mesh as THREE.Mesh).geometry;
      if (g && !g.userData.pooled) g.dispose();
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
    this.splats = [];
    this.squirt = null;
    this.smear.clear();
    this.debris.clear();
    for (const m of [this.dropMesh, this.seedMesh, this.pulpMesh, this.splatMesh]) m.count = 0;
    for (const s of this.puffs) s.visible = false;
    if (this.ring) this.ring.visible = false;
    this.bangT = 1;
    this.clearT = -1;
    this.strands = 0;
    this.rings = 0;
    this.shards = 0;
    this.active = false;
  }

  /** Faces on the chunks follow the room's mood. */
  setFaces(expr: Expression, hold: number) {
    for (const f of this.faces) f.face.set(expr, hold);
  }
}

// ——— the fracture ———

interface Fragment {
  geo: THREE.BufferGeometry;
  /** Middle of the piece (melon space) and its outward direction. */
  centre: THREE.Vector3;
  normal: THREE.Vector3;
  /** Rough area, and how much it curves (for how high it sits when lying). */
  area: number;
  sag: number;
}

/**
 * Break the rind into irregular pieces: random points scattered over it
 * (crowded round the split, sparse toward the ends) each claim the patch of
 * rind nearest them. The fracture lines run along a jittered grid, so edges
 * are ragged and neighbouring pieces still fit together.
 */
export function fracture(shape: MelonShape, g: number, fruit: PopFruit = POP_FRUITS[0]): Fragment[] {
  const it = fractureSteps(shape, g, fruit);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/**
 * The fracture, a piece at a time: it yields after each piece so the work can
 * be spread over the frames before the pop instead of landing on one.
 */
export function* fractureSteps(shape: MelonShape, g: number, fruit: PopFruit = POP_FRUITS[0]): Generator<void, Fragment[], void> {
  const L = MELON_A * shape.lengthScale;
  const n = randInt(fruit.shards[0], fruit.shards[1]);
  const sites: { x: number; p: number }[] = [];
  for (let i = 0; i < n; i++) {
    const near = Math.random() < 0.6;
    const x = near ? clamp(g + (Math.random() + Math.random() + Math.random() - 1.5) * 0.45, -0.97, 0.97) : rand(-0.97, 0.97);
    sites.push({ x, p: rand(0, TAU) });
  }
  // The grid nodes, nudged so the cracks wander.
  const nodeX = new Float32Array((GX + 1) * GY);
  const nodeP = new Float32Array((GX + 1) * GY);
  for (let i = 0; i <= GX; i++) {
    for (let j = 0; j < GY; j++) {
      const k = i * GY + j;
      const inner = i > 0 && i < GX;
      nodeX[k] = -1 + (2 * (i + (inner ? rand(-0.38, 0.38) : 0))) / GX;
      nodeP[k] = (TAU * (j + rand(-0.38, 0.38))) / GY;
    }
  }
  const node = (i: number, j: number) => i * GY + (((j % GY) + GY) % GY);
  // Which piece each cell of rind belongs to.
  const owner = new Int32Array(GX * GY);
  for (let i = 0; i < GX; i++) {
    for (let j = 0; j < GY; j++) {
      const x = -1 + (2 * (i + 0.5)) / GX;
      const p = (TAU * (j + 0.5)) / GY;
      const r = Math.sqrt(Math.max(0.02, 1 - x * x)) * MELON_R;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < n; k++) {
        const st = sites[k];
        let dp = Math.abs(p - st.p) % TAU;
        if (dp > Math.PI) dp = TAU - dp;
        const dx = (x - st.x) * L;
        const dy = dp * r;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      owner[i * GY + j] = best;
    }
  }

  const skin = new THREE.Color(fruit.skin.base);
  // The inside face of the rind, and the layers you see at a torn edge.
  const flesh = new THREE.Color(fruit.lining);
  const fleshLight = new THREE.Color(fruit.fleshLight);
  const thick = fruit.rind.thick;
  // The torn edge, from just under the skin to the inside face, layer by layer.
  const stops: [number, THREE.Color][] = [
    ...fruit.rind.layers.map(([at, c]) => [at, new THREE.Color(c)] as [number, THREE.Color]),
    [1, flesh],
  ];
  const speck = fruit.speckle;
  const speckColor = speck ? new THREE.Color(speck.color) : null;
  // Each piece's cells, gathered once (rather than every piece scanning the whole rind).
  const cellsOf: number[][] = Array.from({ length: n }, () => []);
  for (let c = 0; c < GX * GY; c++) cellsOf[owner[c]].push(c);
  const out: Fragment[] = [];
  for (let s = 0; s < n; s++) {
    const pos: number[] = [];
    const rest: number[] = [];
    const colors: number[] = [];
    const idx0: number[] = [];
    const idx1: number[] = [];
    const outerIdx = new Map<number, number>();
    const innerIdx = new Map<number, number>();
    const vert = (k: number, inset: number, c: THREE.Color) => {
      const xn = clamp(nodeX[k], -0.999, 0.999);
      const phi = nodeP[k];
      const r = shape.surfaceAt(xn) * (1 - inset);
      const sx = Math.sqrt(Math.max(0, 1 - xn * xn));
      pos.push(xn * L, Math.cos(phi) * r, Math.sin(phi) * r);
      rest.push(xn, Math.cos(phi) * sx, Math.sin(phi) * sx);
      colors.push(c.r, c.g, c.b);
      return pos.length / 3 - 1;
    };
    const outer = (k: number) => {
      let v = outerIdx.get(k);
      if (v === undefined) outerIdx.set(k, (v = vert(k, 0, skin)));
      return v;
    };
    const inner = (k: number) => {
      let v = innerIdx.get(k);
      if (v === undefined) {
        // Juicy, uneven flesh inside, with seeds showing here and there.
        const h = hash(k);
        const c = speck && speckColor && hash(k * 7.13 + 1.7) < speck.density ? speckColor : flesh.clone().lerp(fleshLight, 0.1 + 0.35 * h);
        innerIdx.set(k, (v = vert(k, thick, c)));
      }
      return v;
    };
    let cells = 0;
    let area = 0;
    const nrm = new THREE.Vector3();
    for (const cell of cellsOf[s]) {
      {
        const i = Math.floor(cell / GY);
        const j = cell - i * GY;
        cells++;
        const a = node(i, j);
        const b = node(i + 1, j);
        const c = node(i + 1, j + 1);
        const d = node(i, j + 1);
        idx0.push(outer(a), outer(d), outer(b), outer(b), outer(d), outer(c));
        idx1.push(inner(a), inner(b), inner(d), inner(b), inner(c), inner(d));
        const x = -1 + (2 * (i + 0.5)) / GX;
        const p = (TAU * (j + 0.5)) / GY;
        const sx = Math.sqrt(Math.max(0, 1 - x * x));
        area += sx;
        nrm.add(tmpV.set(x * 0.3, Math.cos(p) * sx, Math.sin(p) * sx));
        // Torn edges where a neighbour belongs to another piece.
        const edges: [number, number, number, number][] = [
          [i - 1, j, a, d],
          [i + 1, j, c, b],
          [i, j - 1, b, a],
          [i, j + 1, d, c],
        ];
        for (const [ni, nj, k0, k1] of edges) {
          if (ni < 0 || ni >= GX) continue;
          if (owner[ni * GY + (((nj % GY) + GY) % GY)] === s) continue;
          let p0 = -1;
          let p1 = -1;
          for (const [at, c] of stops) {
            const depth = Math.max(0.005, at * thick);
            const a0 = vert(k0, depth, c);
            const a1 = vert(k1, depth, c);
            if (p0 >= 0) idx1.push(p0, p1, a1, p0, a1, a0);
            p0 = a0;
            p1 = a1;
          }
        }
      }
    }
    if (cells === 0) continue;
    // Centre it on its middle.
    const centre = new THREE.Vector3();
    const nv = pos.length / 3;
    for (let k = 0; k < nv; k++) centre.add(tmpV.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
    centre.divideScalar(nv);
    let sag = 0;
    for (let k = 0; k < nv; k++) {
      pos[k * 3] -= centre.x;
      pos[k * 3 + 1] -= centre.y;
      pos[k * 3 + 2] -= centre.z;
      sag = Math.max(sag, Math.hypot(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aRest', new THREE.Float32BufferAttribute(rest, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex([...idx0, ...idx1]);
    geo.addGroup(0, idx0.length, 0);
    geo.addGroup(idx0.length, idx1.length, 1);
    geo.computeVertexNormals();
    out.push({ geo, centre, normal: nrm.normalize(), area: area / (GX * GY), sag: sag * 0.12 });
    yield;
  }
  return out;
}

/** A steady pseudo-random number in [0, 1) for an integer. */
function hash(k: number) {
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ——— geometry ———

/** A soft, wet lump of flesh: a rounded, slightly squashed, uneven blob. */
export function lumpGeometry(r: number, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const p = geo.attributes.position;
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = rand(0.84, 1.1)));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.82, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A seed of each kind, about 1 unit long (scaled down where it's used). */
export function seedGeometry(kind: SeedKind) {
  if (kind === 'aril') {
    // A juicy aril: a plump, slightly faceted kernel.
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(0.78, 1, 0.78);
    return g;
  }
  const g = new THREE.SphereGeometry(1, 14, 10);
  if (kind === 'tiny') return g;
  const sp = g.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    if (kind === 'flat') {
      // A flat melon or pumpkin seed: an oval, pointed at one end.
      sp.setXYZ(i, x * (x > 0 ? 1.2 : 0.9), sp.getY(i) * 0.2, sp.getZ(i) * 0.6 * (1 - x * 0.3));
    } else {
      // A teardrop (watermelon) or a little citrus pip: rounder at one end.
      sp.setXYZ(i, x * (x > 0 ? 1.15 : 0.85), sp.getY(i) * (kind === 'pip' ? 0.55 : 0.42), sp.getZ(i) * 0.62 * (1 - x * 0.25));
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A citrus juice sac: a plump, elongated teardrop about 1 unit across. */
export function sacGeometry() {
  const g = new THREE.SphereGeometry(1, 12, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y > 0 ? 1 - y * 0.55 : 1;
    p.setXYZ(i, p.getX(i) * 0.55 * k, y * 1.35, p.getZ(i) * 0.55 * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A citrus segment: a plump half-moon with a flat inner edge (radius ≈ r). */
export function segmentGeometry(r: number) {
  const g = new THREE.SphereGeometry(r, 18, 10, 0, Math.PI);
  g.scale(1.25, 0.7, 0.62);
  // Close the flat side so it isn't hollow.
  // (The half-sphere bulges toward +z; its open face is the whole x-y cross-section, facing -z.)
  const cap = new THREE.CircleGeometry(r, 24);
  cap.rotateY(Math.PI);
  cap.scale(1.25, 0.7, 1);
  const merged = new THREE.BufferGeometry();
  const a = g.toNonIndexed();
  const b = cap.toNonIndexed();
  const pos = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
  pos.set(a.attributes.position.array as Float32Array, 0);
  pos.set(b.attributes.position.array as Float32Array, a.attributes.position.array.length);
  // Bent along its length into a crescent, like a real segment.
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] -= (pos[i] / (r * 1.25)) ** 2 * r * 0.45;
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  g.dispose();
  cap.dispose();
  return merged;
}

/** A juice puddle's outline: a lumpy blob with satellite droplets (radius ≈ 1). */
export function blobGeometry() {
  const shapes: THREE.Shape[] = [];
  const shape = new THREE.Shape();
  const n = 48;
  const ph = [rand(0, TAU), rand(0, TAU), rand(0, TAU)];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + 0.15 * Math.sin(a * 3 + ph[0]) + 0.09 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 11 + ph[2]);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shapes.push(shape);
  for (let k = 0; k < 6; k++) {
    const a = rand(0, TAU);
    const d = rand(1.28, 1.65);
    const dot = new THREE.Shape();
    dot.absarc(Math.cos(a) * d, Math.sin(a) * d, rand(0.06, 0.15), 0, TAU, false);
    shapes.push(dot);
  }
  const geo = new THREE.ShapeGeometry(shapes, 6);
  // Texture coordinates centred on the blob (the texture spans ±1.8).
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3.6 + 0.5, pos.getY(i) / 3.6 + 0.5);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** A snapped rubber band: a wriggly open strand, lying in its own XY plane. */
export function strandGeometry(len: number) {
  const pts: THREE.Vector3[] = [];
  const n = 10;
  const ph = rand(0, TAU);
  const freq = rand(1, 2.2);
  const curl = rand(0.1, 0.3) * len;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Snapped ends curl up a little more.
    const end = Math.pow(Math.abs(t - 0.5) * 2, 3) * curl * 0.8;
    pts.push(new THREE.Vector3((t - 0.5) * len, Math.sin(t * TAU * freq + ph) * curl + end, rand(-0.03, 0.03)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, 56, rand(0.026, 0.036), 6, false);
}

/** A loose rubber band: a wobbly closed loop, lying in its own XY plane. */
export function noodleGeometry(r: number) {
  const pts: THREE.Vector3[] = [];
  const n = 12;
  const ph = rand(0, TAU);
  const squash = rand(0.55, 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.8 + 0.28 * Math.sin(a * 2 + ph) + rand(-0.1, 0.1));
    pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr * squash, rand(-0.04, 0.04)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 72, rand(0.026, 0.036), 6, true);
}

// ——— textures ———

/** A juice puddle: deeper at the rim where it dries, a glossy light in it. */
function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const m = 64;
  const R = m / 1.8; // radius 1 of the blob
  const grad = g.createRadialGradient(m, m, 0, m, m, R * 1.7);
  // Neutral tones: each puddle is tinted with its juice's colour.
  grad.addColorStop(0, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.42, 'rgba(238,238,238,0.8)');
  grad.addColorStop(0.58, 'rgba(206,206,206,0.92)');
  grad.addColorStop(0.62, 'rgba(228,228,228,0.85)');
  grad.addColorStop(1, 'rgba(228,228,228,0.85)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const hi = g.createRadialGradient(m - R * 0.3, m - R * 0.35, 0, m - R * 0.3, m - R * 0.35, R * 0.5);
  hi.addColorStop(0, 'rgba(255,255,255,0.45)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round puff (white in the middle, fading out). */
function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A thin soft ring, for the bang running out across the table. */
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 40, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.88, 'rgba(255,240,240,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
