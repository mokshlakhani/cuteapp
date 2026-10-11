import type { Theme } from '../../design/tokens';
import { world } from '../../design/tokens';
import { clamp, rand, TAU, type Vec } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { polyArea, polyCentroid, voronoiCells, pointInPoly } from '../../core/geometry';
import { contactShadow } from '../../render/paint';
import { drawSeed } from '../../render/particles';
import { Face, drawFace } from '../../render/face';
import { MELON } from './Melon';

/**
 * The aftermath of a pop. The waist gives way and the melon blows apart:
 *
 *  - shells: curved pieces of rind that tumble end over end, showing the
 *    striped skin on one side and juicy flesh on the other,
 *  - lumps: chunks of flesh from the inside,
 *  - juice: fat drops that land as pink splats on the floor,
 *  - bands: most snap into wriggly strands, a few fly off whole.
 *
 * Everything is 2D with a little depth faked on top: pieces fly toward the
 * camera (and grow) for a moment, and land at different depths on the
 * floor, so the mess scatters across the table instead of along one line.
 * A few pieces land with a dizzy smile (it's a toy — everyone is fine).
 */

interface Chunk {
  local: Vec[]; // polygon relative to centre of mass
  skin: boolean[];
  seeds: { x: number; y: number; r: number; rot: number }[];
  /** True for rind pieces (they have a striped skin side). */
  shell: boolean;
  /** Where this piece sat across the melon (for its stripes), px from centre. */
  ox: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  /** Tumble about the vertical axis: cos > 0 shows the flesh, < 0 the skin. */
  flip: number;
  vflip: number;
  /** Depth on the floor (px below the floor line). */
  lane: number;
  /** How far it flies toward the camera (extra scale at the peak). */
  pop: number;
  mass: number;
  inertia: number;
  radius: number;
  sleep: number;
  face: Face | null;
  scale: number;
}

interface Ring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  flip: number;
  vflip: number;
  rx: number;
  th: number;
  color: string;
  lane: number;
  rest: boolean;
}

/** A snapped band: an open, wriggling strip of rubber. */
interface Strand {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  len: number;
  th: number;
  color: string;
  /** Wiggle: amplitude (px), waves along the strip, phase, and its speed. */
  amp: number;
  waves: number;
  phase: number;
  vphase: number;
  /** Bend of the whole strip (curl). */
  curl: number;
  /** Vertical squash: 1 in the air, flat once it lies on the floor. */
  flat: number;
  lane: number;
  pop: number;
  rest: boolean;
}

/** Juice: fat drops that become splats where they land. */
interface Splat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  lane: number;
  landed: boolean;
  /** Spread 0..1 once landed. */
  grow: number;
  alpha: number;
  rot: number;
  dots: { dx: number; r: number }[];
}

const CHUNK_SCALE = 0.86;
/** How hard it blows: scales every launch speed. */
const POWER = 1.4;
/** Stripe longitudes, matching the whole melon's. */
const STRIPES = [-1.22, -0.62, 0, 0.62, 1.22];

export interface BurstEvents {
  onImpact?(x: number, strength: number, size: number): void;
}

export interface BurstBand {
  color: string;
  /** Where the band sat (screen y). */
  y: number;
  th: number;
  /** Half-width of the melon where the band sat (px). */
  rx: number;
}

export class Burst {
  chunks: Chunk[] = [];
  rings: Ring[] = [];
  strands: Strand[] = [];
  splats: Splat[] = [];
  floorY = 0;
  width = 0;
  private R = 100;
  private clock = 0;
  private order: (Chunk | Ring | Strand)[] = [];

  constructor(private events: BurstEvents = {}) {}

  get active() {
    return this.chunks.length > 0 || this.rings.length > 0 || this.strands.length > 0;
  }

  /** Seconds since the pop. */
  get age() {
    return this.clock;
  }

  /**
   * Shatter a melon outline into pieces flying out from `c`. `waistY` is
   * where the bands were (screen y): that's where it gives way, so the two
   * lobes fly apart from there.
   */
  explode(outline: Vec[], c: Vec, R: number, bands: BurstBand[], waistY = c.y) {
    this.clock = 0;
    this.R = R;
    this.chunks = [];
    this.rings = [];
    this.strands = [];
    this.splats = [];
    const laneMax = R * 0.62;

    // ——— shells: the rind tears open along the tightest groove ———
    let top = Infinity;
    let bot = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of outline) {
      top = Math.min(top, p.y);
      bot = Math.max(bot, p.y);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    const W = (maxX - minX) / 2;
    const hu = waistY - top;
    const hl = bot - waistY;
    // The first row on each side mirrors the other at the same distance, so
    // the crack between them runs exactly along the groove under the bands.
    const d1 = clamp(Math.min(hu, hl) * 0.45, R * 0.06, R * 0.32);
    const row1 = [-0.62, 0, 0.62].map((k) => c.x + (k + rand(-0.08, 0.08)) * W);
    const seeds: Vec[] = [];
    for (const side of [-1, 1]) {
      const H = side < 0 ? hu : hl;
      if (H < R * 0.08) continue;
      for (const x of row1) seeds.push({ x, y: waistY + side * d1 });
      const rest = H - d1;
      if (rest > R * 0.35) {
        const y2 = waistY + side * (d1 + rest * rand(0.5, 0.6));
        seeds.push({ x: c.x - W * rand(0.3, 0.5), y: y2 }, { x: c.x + W * rand(0.3, 0.5), y: y2 });
      }
      if (rest > R * 1.0) seeds.push({ x: c.x + rand(-0.2, 0.2) * W, y: waistY + side * (H - R * 0.15) });
    }
    const cells = voronoiCells(outline, seeds);

    // Melon seeds scattered through the flesh (screen space, then assigned).
    const flesh: { x: number; y: number; r: number; rot: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const d = Math.sqrt(rand(0.12, 0.62)) * R;
      flesh.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.95, r: R * 0.045, rot: a + Math.PI / 2 });
    }

    const areas = cells.map((cell) => (cell.pts.length >= 3 ? Math.abs(polyArea(cell.pts)) : 0));
    const sorted = [...areas].sort((a, b) => b - a);
    const faceCut = sorted[Math.min(2, sorted.length - 1)] ?? Infinity;

    cells.forEach((cell, idx) => {
      if (cell.pts.length < 3) return;
      const area = areas[idx];
      if (area < R * R * 0.01) return;
      const cen = polyCentroid(cell.pts);
      // Pieces shrink a touch so the aftermath stays tidy, not a heap.
      const local = cell.pts.map((p) => ({ x: (p.x - cen.x) * CHUNK_SCALE, y: (p.y - cen.y) * CHUNK_SCALE }));
      const xs = cell.pts.map((p) => p.x);
      const ys = cell.pts.map((p) => p.y);
      const mySeeds = flesh
        .filter((s) => pointInPoly(s.x, s.y, xs, ys, xs.length))
        .map((s) => ({ x: (s.x - cen.x) * CHUNK_SCALE, y: (s.y - cen.y) * CHUNK_SCALE, r: s.r, rot: s.rot }));
      const shell = cell.skin.some(Boolean);
      const dx = cen.x - c.x;
      const dy = cen.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      // It gives way at the groove: pieces nearest it go fastest, and the
      // two sides fly apart from it.
      const away = Math.sign(cen.y - waistY) || -1;
      const near = 1 - clamp(Math.abs(cen.y - waistY) / R, 0, 1);
      const speed = rand(380, 700) * (0.75 + 0.55 * near);
      const face = area >= faceCut && area > R * R * 0.12 ? new Face() : null;
      if (face) {
        face.base = 'happy';
        face.set('dizzy', rand(1.2, 1.8));
      }
      const ch = this.makeChunk(local, cell.skin, mySeeds, cen.x, cen.y, shell, cen.x - c.x, face);
      // Scatter across the whole table, not straight up and back down.
      const side = Math.abs(dx) > R * 0.15 ? Math.sign(dx) : Math.random() < 0.5 ? -1 : 1;
      ch.vx = POWER * (side * (Math.abs(dx) / d) * speed * (away > 0 ? 1.4 : 1) + side * rand(120, 380));
      ch.vy = POWER * (away * speed * 0.55 - rand(380, 620));
      ch.va = rand(-7, 7);
      // Shells start skin-out, as they were on the melon, then tumble open.
      ch.flip = shell ? Math.PI + rand(-0.3, 0.3) : 0;
      // Faces tumble gently, so they're mostly seen smiling.
      ch.vflip = face ? rand(3, 5) * (Math.random() < 0.5 ? -1 : 1) : rand(-16, 16);
      ch.pop = face ? rand(0.15, 0.4) : rand(-0.12, 0.8);
      ch.lane = rand(0, laneMax);
      this.chunks.push(ch);
    });

    // ——— lumps: flesh from inside, squirting out of the burst groove ———
    const nLumps = 14;
    for (let i = 0; i < nLumps; i++) {
      const r = R * rand(0.09, 0.17);
      const sides = 5 + Math.floor(rand(0, 3));
      const local: Vec[] = [];
      const off = rand(0, TAU);
      for (let k = 0; k < sides; k++) {
        const a = off + (k / sides) * TAU + rand(-0.25, 0.25);
        const rr = r * rand(0.75, 1.15);
        local.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      }
      const lumpSeeds = Math.random() < 0.5 ? [{ x: rand(-r, r) * 0.3, y: rand(-r, r) * 0.3, r: R * 0.04, rot: rand(0, TAU) }] : [];
      const ch = this.makeChunk(
        local,
        local.map(() => false),
        lumpSeeds,
        c.x + rand(-0.5, 0.5) * W,
        waistY + rand(-0.08, 0.08) * R,
        false,
        0,
        null,
      );
      // Squeezed out sideways through the split, fanning up and down a little.
      const side = ch.x < c.x ? -1 : 1;
      ch.vx = POWER * side * rand(380, 1050);
      ch.vy = POWER * (rand(-1, 1) * 260 - rand(250, 650));
      ch.va = rand(-12, 12);
      ch.vflip = rand(-16, 16);
      ch.pop = rand(-0.1, 1.0);
      ch.lane = rand(0, laneMax);
      this.chunks.push(ch);
    }

    // ——— juice ———
    for (let i = 0; i < 30; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const dots = [];
      const nd = Math.floor(rand(0, 3.5));
      for (let k = 0; k < nd; k++) dots.push({ dx: rand(1.6, 3) * (Math.random() < 0.5 ? -1 : 1), r: rand(0.2, 0.45) });
      this.splats.push({
        x: c.x + side * rand(0.2, 0.7) * W,
        y: waistY + rand(-0.06, 0.06) * R,
        vx: POWER * side * rand(250, 950),
        vy: POWER * (rand(-1, 1) * 220 - rand(200, 600)),
        r: R * rand(0.035, 0.09),
        lane: rand(0, laneMax * 1.1),
        landed: false,
        grow: 0,
        alpha: 1,
        rot: rand(-0.12, 0.12),
        dots,
      });
    }

    // ——— bands: most snap into strands, a few slip off whole ———
    for (const b of bands) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = c.x + side * b.rx * rand(0.6, 1);
      const y = b.y + rand(-6, 6);
      if (Math.random() < 0.22) {
        this.rings.push({
          x,
          y,
          vx: POWER * side * rand(220, 680),
          vy: -POWER * rand(500, 1000),
          rot: rand(-0.3, 0.3),
          vrot: rand(-6, 6),
          flip: rand(0, TAU),
          vflip: rand(-14, 14),
          rx: clamp(b.rx * rand(0.22, 0.32), 14, 36),
          th: b.th,
          color: b.color,
          lane: rand(0, laneMax),
          rest: false,
        });
      } else {
        this.strands.push({
          x,
          y,
          vx: POWER * side * rand(260, 1000),
          vy: -POWER * rand(350, 1100),
          rot: rand(0, TAU),
          vrot: rand(-14, 14),
          len: clamp(b.rx * rand(0.7, 1.5), 24, R * 1.4),
          th: b.th,
          color: b.color,
          amp: rand(3, 9),
          waves: rand(0.8, 2.2),
          phase: rand(0, TAU),
          vphase: rand(14, 26) * (Math.random() < 0.5 ? -1 : 1),
          curl: rand(-0.5, 0.5),
          flat: 1,
          lane: rand(0, laneMax),
          pop: rand(-0.1, 0.6),
          rest: false,
        });
      }
    }
  }

  private makeChunk(
    local: Vec[],
    skin: boolean[],
    seeds: Chunk['seeds'],
    x: number,
    y: number,
    shell: boolean,
    ox: number,
    face: Face | null,
  ): Chunk {
    const area = Math.abs(polyArea(local));
    let I = 0;
    for (const p of local) I += p.x * p.x + p.y * p.y;
    const mass = area;
    return {
      local,
      skin,
      seeds,
      shell,
      ox,
      x,
      y,
      vx: 0,
      vy: 0,
      a: 0,
      va: 0,
      flip: 0,
      vflip: 0,
      lane: 0,
      pop: 0,
      mass,
      inertia: (mass * I) / local.length / 2,
      radius: Math.sqrt(mass / Math.PI),
      sleep: 0,
      face,
      scale: 1,
    };
  }

  /** Flick a chunk the player touched. Returns true if one was hit. */
  poke(x: number, y: number) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      if (Math.hypot(x - ch.x, y - ch.y) < ch.radius * 1.2) {
        ch.vy = -rand(520, 760);
        ch.vx += (ch.x - x) * 6 + rand(-80, 80);
        ch.va += rand(-8, 8);
        ch.vflip += ch.face ? rand(-4, 4) : rand(-12, 12);
        ch.sleep = 0;
        if (ch.face) ch.face.set('happy', 1.2);
        return true;
      }
    }
    return false;
  }

  get settled() {
    return (
      this.chunks.every((c) => c.sleep > 0.4) &&
      this.rings.every((r) => r.rest) &&
      this.strands.every((s) => s.rest) &&
      this.splats.every((s) => s.landed)
    );
  }

  /** Shrink everything away (staggered); returns true when gone. */
  shrink(dt: number) {
    let any = false;
    this.chunks.forEach((c, i) => {
      c.scale = Math.max(0, c.scale - dt * (2.2 + i * 0.09));
      if (c.scale > 0) any = true;
    });
    this.rings.forEach((r) => {
      r.th = Math.max(0, r.th - dt * 12);
      r.rx = Math.max(0, r.rx - dt * 60);
      if (r.rx > 0) any = true;
    });
    this.strands.forEach((s) => {
      s.th = Math.max(0, s.th - dt * 12);
      s.len = Math.max(0, s.len - dt * 240);
      if (s.len > 0) any = true;
    });
    this.splats.forEach((s) => {
      s.alpha = Math.max(0, s.alpha - dt * 2.4);
      if (s.alpha > 0) any = true;
    });
    if (!any) {
      this.chunks = [];
      this.rings = [];
      this.strands = [];
      this.splats = [];
    }
    return !any;
  }

  /** 0 → 1 → 0 over the first moments of flight: how close to the camera. */
  private hump() {
    return Math.sin(Math.PI * clamp(this.clock / 0.85, 0, 1));
  }

  update(dt: number) {
    this.clock += dt;
    const g = world.gravity;
    const steps = 3;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const ch of this.chunks) this.stepChunk(ch, h, g);
      this.separate();
      for (const ch of this.chunks) this.keepInside(ch);
    }
    for (const ch of this.chunks) {
      ch.face?.update(dt);
      this.settleFlip(ch, dt);
    }
    for (const r of this.rings) this.stepRing(r, dt, g);
    for (const s of this.strands) this.stepStrand(s, dt, g);
    for (const s of this.splats) this.stepSplat(s, dt, g);
  }

  private stepChunk(ch: Chunk, h: number, g: number) {
    if (ch.sleep > 0.6) return;
    ch.vy += g * h;
    // Once the show is over, the pile quiets down instead of jostling forever.
    const calm = 0.15 + 8 * clamp((this.clock - 2.2) / 2, 0, 1);
    ch.vx *= Math.exp(-calm * h);
    ch.va *= Math.exp(-calm * 0.8 * h);
    ch.x += ch.vx * h;
    ch.y += ch.vy * h;
    ch.a += ch.va * h;
    const cos = Math.cos(ch.a);
    const sin = Math.sin(ch.a);
    const floor = this.floorY + ch.lane;
    let impact = 0;
    // Contacts: every vertex below the floor or outside the walls.
    for (const p of ch.local) {
      const rx = p.x * cos - p.y * sin;
      const ry = p.x * sin + p.y * cos;
      const wx = ch.x + rx;
      const wy = ch.y + ry;
      if (wy > floor) impact = Math.max(impact, this.contact(ch, rx, ry, 0, -1, wy - floor));
      if (wx < 0) this.contact(ch, rx, ry, 1, 0, -wx);
      if (wx > this.width) this.contact(ch, rx, ry, -1, 0, wx - this.width);
    }
    if (impact > 120) {
      this.events.onImpact?.(ch.x, clamp(impact / 900, 0, 1), ch.radius);
      ch.vflip *= 0.55;
    }
    const energy = Math.abs(ch.vx) + Math.abs(ch.vy) + Math.abs(ch.va) * ch.radius;
    // Resting on the floor or on top of the pile (nothing hangs still in mid-air for long).
    if (energy < 24) ch.sleep += h;
    else ch.sleep = 0;
    if (ch.sleep > 0.6) {
      ch.vx = ch.vy = ch.va = 0;
    }
  }

  /** Jostling in a pile must never push a piece through the floor or walls. */
  private keepInside(ch: Chunk) {
    const cos = Math.cos(ch.a);
    const sin = Math.sin(ch.a);
    let low = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const p of ch.local) {
      const rx = p.x * cos - p.y * sin;
      low = Math.max(low, p.x * sin + p.y * cos);
      left = Math.min(left, rx);
      right = Math.max(right, rx);
    }
    const over = ch.y + low - (this.floorY + ch.lane);
    if (over > 0) {
      ch.y -= over;
      if (ch.vy > 0) ch.vy = 0;
    }
    if (ch.x + left < 0) {
      ch.x = -left;
      if (ch.vx < 0) ch.vx = 0;
    } else if (this.width && ch.x + right > this.width) {
      ch.x = this.width - right;
      if (ch.vx > 0) ch.vx = 0;
    }
  }

  /** Tumble in the air; on the floor, fall flat onto one side. */
  private settleFlip(ch: Chunk, dt: number) {
    const grounded = ch.y > this.floorY + ch.lane - ch.radius * 1.6 && Math.abs(ch.vy) < 260;
    if (!grounded) {
      ch.flip += ch.vflip * dt;
      return;
    }
    ch.vflip *= Math.exp(-9 * dt);
    ch.flip += ch.vflip * dt;
    // Faces land smiling up; everything else lands on whichever side is nearer.
    const period = ch.face ? TAU : Math.PI;
    const rest = Math.round(ch.flip / period) * period;
    ch.flip += (rest - ch.flip) * Math.min(1, dt * 7);
  }

  /** Impulse-based contact with a static plane. Returns impact speed. */
  private contact(ch: Chunk, rx: number, ry: number, nx: number, ny: number, depth: number) {
    // Positional correction
    ch.x += nx * depth;
    ch.y += ny * depth;
    const vx = ch.vx - ch.va * ry;
    const vy = ch.vy + ch.va * rx;
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return 0;
    const invM = 1 / ch.mass;
    const invI = 1 / ch.inertia;
    const rn = rx * ny - ry * nx;
    const e = -vn > 260 ? 0.32 : 0;
    const j = (-(1 + e) * vn) / (invM + rn * rn * invI);
    ch.vx += j * nx * invM;
    ch.vy += j * ny * invM;
    ch.va += rn * j * invI;
    // Friction
    const tx = -ny;
    const ty = nx;
    const vt = (ch.vx - ch.va * ry) * tx + (ch.vy + ch.va * rx) * ty;
    const rt = rx * ty - ry * tx;
    let jt = -vt / (invM + rt * rt * invI);
    const mu = 0.6;
    jt = clamp(jt, -mu * j, mu * j);
    ch.vx += jt * tx * invM;
    ch.vy += jt * ty * invM;
    ch.va += rt * jt * invI;
    return -vn;
  }

  /** Soft circle separation so pieces at the same depth jostle instead of overlapping. */
  private separate() {
    const cs = this.chunks;
    const depth = this.R * 0.18;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i];
        const b = cs[j];
        if (Math.abs(a.lane - b.lane) > depth) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r = (a.radius + b.radius) * 0.82;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const pen = (r - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        const wa = b.mass / (a.mass + b.mass);
        const wb = 1 - wa;
        a.x -= nx * pen * wa;
        a.y -= ny * pen * wa;
        b.x += nx * pen * wb;
        b.y += ny * pen * wb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          // A piece asleep in the pile is solid ground: it takes no impulse,
          // unless something lands on it hard enough to wake it.
          const sa = a.sleep > 0.6;
          const sb = b.sleep > 0.6;
          if (-rv > 140) {
            a.sleep = 0;
            b.sleep = 0;
          }
          const ia = sa && !(-rv > 140) ? 0 : sb && !(-rv > 140) ? 1 : wa;
          const ib = 1 - ia;
          const imp = -rv;
          a.vx -= nx * imp * ia;
          a.vy -= ny * imp * ia;
          b.vx += nx * imp * ib;
          b.vy += ny * imp * ib;
        }
      }
    }
  }

  private stepRing(r: Ring, dt: number, g: number) {
    if (r.rest) return;
    r.vy += g * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.rot += r.vrot * dt;
    r.flip += r.vflip * dt;
    const floor = this.floorY + r.lane - r.th * 0.6;
    if (r.y > floor) {
      r.y = floor;
      if (r.vy > 160) {
        r.vy *= -0.42;
        r.vx *= 0.7;
        r.vflip *= 0.6;
        this.events.onImpact?.(r.x, 0.15, 10);
      } else {
        r.vy = 0;
        r.vx *= Math.exp(-8 * dt);
        r.vrot *= Math.exp(-8 * dt);
        // Settle flat on the floor.
        r.rot += (0 - r.rot) * Math.min(1, dt * 8);
        const flat = Math.round(r.flip / Math.PI) * Math.PI + Math.PI / 2;
        r.flip += (flat - r.flip) * Math.min(1, dt * 8);
        r.vflip *= Math.exp(-10 * dt);
        if (Math.abs(r.vx) < 4) r.rest = true;
      }
    }
    if (r.x < r.rx) {
      r.x = r.rx;
      r.vx = Math.abs(r.vx) * 0.5;
    } else if (r.x > this.width - r.rx) {
      r.x = this.width - r.rx;
      r.vx = -Math.abs(r.vx) * 0.5;
    }
  }

  private stepStrand(s: Strand, dt: number, g: number) {
    if (s.rest) return;
    // Rubber whips through the air: it slows quickly and wriggles as it goes.
    s.vy += g * 0.9 * dt;
    s.vx *= Math.exp(-0.9 * dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.vrot * dt;
    s.phase += s.vphase * dt;
    const floor = this.floorY + s.lane - s.th * 0.5;
    if (s.y > floor) {
      s.y = floor;
      if (s.vy > 200) {
        s.vy *= -0.3;
        s.vx *= 0.6;
        s.vrot *= 0.5;
        s.vphase *= 0.5;
      } else {
        // Lie down on the floor in a lazy squiggle.
        s.vy = 0;
        s.vx *= Math.exp(-9 * dt);
        s.vrot *= Math.exp(-9 * dt);
        s.vphase *= Math.exp(-6 * dt);
        const flat = Math.round(s.rot / Math.PI) * Math.PI;
        s.rot += (flat - s.rot) * Math.min(1, dt * 6);
        s.flat += (0.38 - s.flat) * Math.min(1, dt * 8);
        if (Math.abs(s.vx) < 4 && Math.abs(s.vphase) < 0.5) s.rest = true;
      }
    }
    const half = s.len * 0.5;
    if (s.x < half * 0.5) {
      s.x = half * 0.5;
      s.vx = Math.abs(s.vx) * 0.4;
    } else if (s.x > this.width - half * 0.5) {
      s.x = this.width - half * 0.5;
      s.vx = -Math.abs(s.vx) * 0.4;
    }
  }

  private stepSplat(s: Splat, dt: number, g: number) {
    if (s.landed) {
      s.grow = Math.min(1, s.grow + dt * 7);
      return;
    }
    s.vy += g * 0.85 * dt;
    s.vx *= Math.exp(-0.5 * dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x < s.r || s.x > this.width - s.r) {
      s.x = clamp(s.x, s.r, this.width - s.r);
      s.vx *= -0.3;
    }
    if (s.y > this.floorY + s.lane) {
      s.y = this.floorY + s.lane;
      s.landed = true;
    }
  }

  // ——— drawing ———

  /** Floor layer: splats of juice and soft contact shadows. */
  drawShadows(ctx: CanvasRenderingContext2D, t: Theme) {
    for (const s of this.splats) this.drawSplat(ctx, s);
    for (const ch of this.chunks) {
      const floor = this.floorY + ch.lane;
      const hgt = clamp((floor - ch.y) / 300, 0, 1);
      contactShadow(
        ctx,
        t,
        ch.x,
        floor,
        ch.radius * 1.1 * ch.scale * (1 - hgt * 0.4),
        ch.radius * 0.2 * ch.scale,
        0.22 * (1 - hgt) * ch.scale,
      );
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: Theme) {
    // Far to near; things flying at the camera come out on top.
    const near = this.hump() * this.R * 3;
    const key = (o: Chunk | Ring | Strand) => o.lane + ('pop' in o ? o.pop * near : 0);
    const order = this.order;
    order.length = 0;
    for (const r of this.rings) order.push(r);
    for (const s of this.strands) order.push(s);
    for (const c of this.chunks) order.push(c);
    order.sort((a, b) => key(a) - key(b));
    for (const o of order) {
      if ('local' in o) this.drawChunk(ctx, o, t);
      else if ('len' in o) this.drawStrand(ctx, o);
      else this.drawRing(ctx, o);
    }
  }

  private drawSplat(ctx: CanvasRenderingContext2D, s: Splat) {
    if (s.alpha <= 0) return;
    if (!s.landed) {
      // A fat juicy drop, stretched along its flight.
      const sp = Math.hypot(s.vx, s.vy);
      const st = Math.min(1.9, 1 + sp / 800);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = MELON.flesh;
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r * st, s.r / Math.sqrt(st), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.55);
      ctx.beginPath();
      ctx.arc(-s.r * 0.15, -s.r * 0.35, s.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    // A flat puddle on the floor (squashed by the floor's perspective).
    const k = 0.35 + 0.65 * s.grow;
    const rx = s.r * 2.3 * k;
    const ry = rx * 0.34;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = rgba(MELON.fleshLight, 0.5 * s.alpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    for (const d of s.dots) {
      const dx = d.dx * s.r * k;
      ctx.moveTo(dx + d.r * rx, 0);
      ctx.ellipse(dx, 0, d.r * rx, d.r * ry, 0, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.35 * s.alpha);
    ctx.beginPath();
    ctx.ellipse(-rx * 0.3, -ry * 0.3, rx * 0.25, ry * 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawRing(ctx: CanvasRenderingContext2D, r: Ring) {
    if (r.rx <= 0.5) return;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    const ry = Math.max(1.5, Math.abs(Math.cos(r.flip)) * r.rx);
    ctx.strokeStyle = mix(r.color, '#5a3a35', 0.28);
    ctx.lineWidth = r.th + 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r.rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = mix(r.color, '#ffffff', 0.15);
    ctx.lineWidth = r.th;
    ctx.stroke();
    ctx.restore();
  }

  private drawStrand(ctx: CanvasRenderingContext2D, s: Strand) {
    if (s.len <= 1 || s.th <= 0.2) return;
    const near = 1 + s.pop * this.hump();
    const n = 14;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(near, near * s.flat);
    ctx.rotate(s.rot);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const x = u * s.len;
      // Wriggle that fades toward the free ends, plus a lazy curl.
      const y = s.amp * Math.sin(u * s.waves * TAU + s.phase) * (1 - u * u * 1.5) + s.curl * u * u * s.len;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = mix(s.color, '#5a3a35', 0.28);
    ctx.lineWidth = s.th + 1.4;
    ctx.stroke();
    ctx.strokeStyle = mix(s.color, '#ffffff', 0.12);
    ctx.lineWidth = s.th;
    ctx.stroke();
    ctx.restore();
  }

  private drawChunk(ctx: CanvasRenderingContext2D, ch: Chunk, t: Theme) {
    if (ch.scale <= 0.01) return;
    const R = Math.max(10, ch.radius * 1.6);
    const near = 1 + ch.pop * this.hump();
    const cf = Math.cos(ch.flip);
    const fleshSide = !ch.shell || cf >= 0;
    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.rotate(ch.a);
    ctx.scale(ch.scale * near * Math.max(0.2, Math.abs(cf)), ch.scale * near);
    const pts = ch.local;
    // Softly rounded corners: cartoon chunks, never shards. Each corner is
    // trimmed by at most half of its shorter edge, so sharp angles can't spike.
    const corner = Math.max(3, R * 0.14);
    const path = () => {
      const n = pts.length;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pts[(i - 1 + n) % n];
        const a = pts[i];
        const q = pts[(i + 1) % n];
        const lp = Math.hypot(p.x - a.x, p.y - a.y) || 1;
        const lq = Math.hypot(q.x - a.x, q.y - a.y) || 1;
        const tp = Math.min(0.5, corner / lp);
        const tq = Math.min(0.5, corner / lq);
        const ax = a.x + (p.x - a.x) * tp;
        const ay = a.y + (p.y - a.y) * tp;
        if (i === 0) ctx.moveTo(ax, ay);
        else ctx.lineTo(ax, ay);
        ctx.quadraticCurveTo(a.x, a.y, a.x + (q.x - a.x) * tq, a.y + (q.y - a.y) * tq);
      }
      ctx.closePath();
    };
    const edges = (want: boolean) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (ch.skin[i] !== want) continue;
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (fleshSide) {
      // Flesh
      path();
      const g = ctx.createRadialGradient(-R * 0.2, -R * 0.25, 0, 0, 0, R);
      g.addColorStop(0, mix(MELON.flesh, '#ffffff', 0.18));
      g.addColorStop(0.7, MELON.flesh);
      g.addColorStop(1, MELON.fleshDeep);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      path();
      ctx.clip();
      // Rind along the edges that used to be the outside of the melon.
      const rindW = Math.max(6, R * 0.32);
      for (const [col, w] of [
        [MELON.fleshLight, rindW * 1.5],
        [MELON.rindInner, rindW],
        [MELON.skinDark, rindW * 0.48],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        edges(true);
        ctx.stroke();
      }
      for (const s of ch.seeds) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        drawSeed(ctx, 0, 0, s.r, MELON.seed);
        ctx.restore();
      }
      // Juicy sheen on the cut flesh
      ctx.fillStyle = rgba('#ffffff', 0.22);
      ctx.beginPath();
      ctx.ellipse(-R * 0.25, -R * 0.3, R * 0.28, R * 0.12, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
      path();
      ctx.strokeStyle = rgba(MELON.fleshDeep, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // The outside of a shell: striped skin, with a sliver of pale rind
      // and flesh showing along the cracked edges.
      path();
      const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, 0, 0, 0, R * 1.1);
      g.addColorStop(0, mix(MELON.skin, '#ffffff', 0.22));
      g.addColorStop(0.65, MELON.skin);
      g.addColorStop(1, MELON.skinDark);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      path();
      ctx.clip();
      this.drawShellStripes(ctx, ch, R);
      ctx.strokeStyle = MELON.fleshLight;
      ctx.lineWidth = Math.max(3, R * 0.1);
      edges(false);
      ctx.stroke();
      ctx.strokeStyle = MELON.rindInner;
      ctx.lineWidth = Math.max(2, R * 0.06);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.28);
      ctx.beginPath();
      ctx.ellipse(-R * 0.25, -R * 0.3, R * 0.3, R * 0.11, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
      path();
      ctx.strokeStyle = rgba(MELON.rim, 0.45);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Edge-on pieces read darker, like they're turning away from the lamp.
    const edgeOn = 1 - Math.abs(cf);
    if (edgeOn > 0.05) {
      path();
      ctx.fillStyle = `rgba(${t.shadowRgb},${0.22 * edgeOn})`;
      ctx.fill();
    }
    ctx.restore();
    if (ch.face && fleshSide && cf > 0.35) {
      ctx.save();
      ctx.translate(ch.x, ch.y);
      ctx.rotate(ch.a);
      ctx.scale(ch.scale * near * cf, ch.scale * near);
      ctx.translate(0, R * 0.05);
      drawFace(ctx, ch.face, R * 0.5, { ink: t.faceInk, blush: '#FFD0D4' });
      ctx.restore();
    }
  }

  /** The melon's wavy stripes, where this piece used to sit on it. */
  private drawShellStripes(ctx: CanvasRenderingContext2D, ch: Chunk, R: number) {
    const MR = this.R;
    ctx.fillStyle = rgba(MELON.stripe, 0.82);
    const span = R * 2.4;
    const S = 18;
    for (let k = 0; k < STRIPES.length; k++) {
      const phi = STRIPES[k];
      const cx = Math.sin(phi) * MR * 1.07 * CHUNK_SCALE - ch.ox * CHUNK_SCALE;
      const hw = Math.cos(phi) * MR * 0.15 * CHUNK_SCALE;
      if (Math.abs(cx) > span) continue;
      ctx.beginPath();
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i <= S; i++) {
          const j = pass === 0 ? i : S - i;
          const y = -span + (2 * span * j) / S;
          const wv = Math.sin((y / MR) * 10 + k * 1.7) * hw * 0.35;
          const x = cx + wv + (pass === 0 ? -hw : hw);
          if (i === 0 && pass === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}
