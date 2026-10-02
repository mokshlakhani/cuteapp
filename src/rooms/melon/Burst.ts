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
 * The aftermath of a pop: rigid watermelon chunks with real-ish impulse
 * physics, rubber bands flipping through the air, and a few little slices
 * that land with a dizzy smile (it's a toy — everyone is fine).
 */

interface Chunk {
  local: Vec[]; // polygon relative to centre of mass
  skin: boolean[];
  seeds: { x: number; y: number; r: number; rot: number }[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  mass: number;
  inertia: number;
  radius: number;
  sleep: number;
  face: Face | null;
  scale: number;
  hue: number;
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
  rest: boolean;
}

const CHUNK_SCALE = 0.86;

export interface BurstEvents {
  onImpact?(x: number, strength: number, size: number): void;
}

export class Burst {
  chunks: Chunk[] = [];
  rings: Ring[] = [];
  floorY = 0;
  width = 0;
  private clock = 0;

  constructor(private events: BurstEvents = {}) {}

  get active() {
    return this.chunks.length > 0 || this.rings.length > 0;
  }

  /** Seconds since the pop. */
  get age() {
    return this.clock;
  }

  /** Shatter a melon outline into chunks flying out from `c`. */
  explode(outline: Vec[], c: Vec, R: number, bands: { color: string; y: number; th: number; rx: number }[]) {
    this.clock = 0;
    // Seeds for the Voronoi: a jittered centre + two rings.
    const seeds: Vec[] = [{ x: c.x + rand(-R, R) * 0.1, y: c.y + rand(-R, R) * 0.1 }];
    const ring1 = 5;
    const off1 = rand(0, TAU);
    for (let i = 0; i < ring1; i++) {
      const a = off1 + (i / ring1) * TAU + rand(-0.25, 0.25);
      seeds.push({ x: c.x + Math.cos(a) * R * 0.5, y: c.y + Math.sin(a) * R * 0.5 });
    }
    const ring2 = 7;
    const off2 = rand(0, TAU);
    for (let i = 0; i < ring2; i++) {
      const a = off2 + (i / ring2) * TAU + rand(-0.2, 0.2);
      seeds.push({ x: c.x + Math.cos(a) * R * 0.95, y: c.y + Math.sin(a) * R * 0.9 });
    }
    const cells = voronoiCells(outline, seeds);

    // Melon seeds scattered through the flesh (screen space, then assigned).
    const flesh: { x: number; y: number; r: number; rot: number }[] = [];
    for (let i = 0; i < 22; i++) {
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
      // Chunks shrink a touch so the aftermath stays tidy, not a heap.
      const local = cell.pts.map((p) => ({ x: (p.x - cen.x) * CHUNK_SCALE, y: (p.y - cen.y) * CHUNK_SCALE }));
      const xs = cell.pts.map((p) => p.x);
      const ys = cell.pts.map((p) => p.y);
      const mySeeds = flesh
        .filter((s) => pointInPoly(s.x, s.y, xs, ys, xs.length))
        .map((s) => ({ x: (s.x - cen.x) * CHUNK_SCALE, y: (s.y - cen.y) * CHUNK_SCALE, r: s.r, rot: s.rot }));
      let I = 0;
      for (const p of local) I += p.x * p.x + p.y * p.y;
      const mass = area * CHUNK_SCALE * CHUNK_SCALE;
      const inertia = (mass * I) / local.length / 2;
      const dx = cen.x - c.x;
      const dy = cen.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = rand(380, 720) * (0.7 + (d / R) * 0.5);
      const face = area >= faceCut && area > R * R * 0.12 ? new Face() : null;
      if (face) {
        face.base = 'happy';
        face.set('dizzy', rand(1.2, 1.8));
      }
      this.chunks.push({
        local,
        skin: cell.skin,
        seeds: mySeeds,
        x: cen.x,
        y: cen.y,
        vx: (dx / d) * speed + rand(-40, 40),
        vy: (dy / d) * speed * 0.8 - rand(380, 620),
        a: 0,
        va: rand(-7, 7),
        mass,
        inertia,
        radius: Math.sqrt(mass / Math.PI),
        sleep: 0,
        face,
        scale: 1,
        hue: rand(-0.04, 0.04),
      });
    });

    for (const b of bands) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.rings.push({
        x: c.x + rand(-0.2, 0.2) * R,
        y: c.y + b.y * R,
        vx: side * rand(220, 640),
        vy: -rand(500, 950),
        rot: rand(-0.3, 0.3),
        vrot: rand(-6, 6),
        flip: rand(0, TAU),
        vflip: rand(-14, 14),
        rx: clamp(b.rx * rand(0.22, 0.32), 14, 36),
        th: b.th,
        color: b.color,
        rest: false,
      });
    }
  }

  /** Flick a chunk the player touched. Returns true if one was hit. */
  poke(x: number, y: number) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      if (Math.hypot(x - ch.x, y - ch.y) < ch.radius * 1.2) {
        ch.vy = -rand(520, 760);
        ch.vx += (ch.x - x) * 6 + rand(-80, 80);
        ch.va += rand(-8, 8);
        ch.sleep = 0;
        if (ch.face) ch.face.set('happy', 1.2);
        return true;
      }
    }
    return false;
  }

  get settled() {
    return this.chunks.every((c) => c.sleep > 0.4) && this.rings.every((r) => r.rest);
  }

  /** Shrink everything away (staggered); returns true when gone. */
  shrink(dt: number) {
    let any = false;
    this.chunks.forEach((c, i) => {
      c.scale = Math.max(0, c.scale - dt * (2.2 + i * 0.12));
      if (c.scale > 0) any = true;
    });
    this.rings.forEach((r) => {
      r.th = Math.max(0, r.th - dt * 12);
      r.rx = Math.max(0, r.rx - dt * 60);
      if (r.rx > 0) any = true;
    });
    if (!any) {
      this.chunks = [];
      this.rings = [];
    }
    return !any;
  }

  update(dt: number) {
    this.clock += dt;
    const g = world.gravity;
    const steps = 3;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const ch of this.chunks) this.stepChunk(ch, h, g);
      this.separate();
    }
    for (const ch of this.chunks) ch.face?.update(dt);
    for (const r of this.rings) this.stepRing(r, dt, g);
  }

  private stepChunk(ch: Chunk, h: number, g: number) {
    if (ch.sleep > 0.6) return;
    ch.vy += g * h;
    ch.vx *= Math.exp(-0.15 * h);
    ch.x += ch.vx * h;
    ch.y += ch.vy * h;
    ch.a += ch.va * h;
    const cos = Math.cos(ch.a);
    const sin = Math.sin(ch.a);
    let impact = 0;
    // Contacts: every vertex below the floor or outside the walls.
    for (const p of ch.local) {
      const rx = p.x * cos - p.y * sin;
      const ry = p.x * sin + p.y * cos;
      const wx = ch.x + rx;
      const wy = ch.y + ry;
      if (wy > this.floorY) impact = Math.max(impact, this.contact(ch, rx, ry, 0, -1, wy - this.floorY));
      if (wx < 0) this.contact(ch, rx, ry, 1, 0, -wx);
      if (wx > this.width) this.contact(ch, rx, ry, -1, 0, wx - this.width);
    }
    if (impact > 120) this.events.onImpact?.(ch.x, clamp(impact / 900, 0, 1), ch.radius);
    const energy = Math.abs(ch.vx) + Math.abs(ch.vy) + Math.abs(ch.va) * ch.radius;
    if (energy < 24 && ch.y > this.floorY - ch.radius * 2) ch.sleep += h;
    else ch.sleep = 0;
    if (ch.sleep > 0.6) {
      ch.vx = ch.vy = ch.va = 0;
    }
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

  /** Soft circle separation so chunks jostle instead of overlapping. */
  private separate() {
    const cs = this.chunks;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i];
        const b = cs[j];
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
          const imp = -rv * 0.5;
          a.vx -= nx * imp * wa;
          a.vy -= ny * imp * wa;
          b.vx += nx * imp * wb;
          b.vy += ny * imp * wb;
          if (-rv > 60) {
            a.sleep = 0;
            b.sleep = 0;
          }
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
    const floor = this.floorY - r.th * 0.6;
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

  drawShadows(ctx: CanvasRenderingContext2D, t: Theme) {
    for (const ch of this.chunks) {
      const hgt = clamp((this.floorY - ch.y) / 300, 0, 1);
      contactShadow(
        ctx,
        t,
        ch.x,
        this.floorY,
        ch.radius * 1.1 * ch.scale * (1 - hgt * 0.4),
        ch.radius * 0.2 * ch.scale,
        0.22 * (1 - hgt) * ch.scale,
      );
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: Theme) {
    for (const r of this.rings) this.drawRing(ctx, r);
    for (const ch of this.chunks) this.drawChunk(ctx, ch, t);
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

  private drawChunk(ctx: CanvasRenderingContext2D, ch: Chunk, t: Theme) {
    if (ch.scale <= 0.01) return;
    const R = Math.max(10, ch.radius * 1.6);
    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.rotate(ch.a);
    ctx.scale(ch.scale, ch.scale);
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
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const rindW = Math.max(6, R * 0.32);
    for (const [col, w] of [
      [MELON.fleshLight, rindW * 1.5],
      [MELON.rindInner, rindW],
      [MELON.skinDark, rindW * 0.48],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (!ch.skin[i]) continue;
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
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
    if (ch.face) {
      ctx.save();
      ctx.translate(0, R * 0.05);
      drawFace(ctx, ch.face, R * 0.5, { ink: t.faceInk, blush: '#FFD0D4' });
      ctx.restore();
    }
    ctx.restore();
  }
}
