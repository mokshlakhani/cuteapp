import { Face } from '../../render/face';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { clamp, rand } from '../../core/math';
import { POPPED_LOOKS } from './popped';

/**
 * A sheet of bubble wrap lying on the table, seen from above.
 *
 * The film is a small grid of nodes joined by springs (edges + diagonals),
 * each node tethered softly to where it lies, like plastic gripping the
 * table. Grab it and pull: the film stretches, the bubbles stretch with it,
 * and when you let go it snaps back. Bubbles sit on the film at fixed rest
 * coordinates and read their position and stretch from the grid around them.
 */

export type BubbleSize = 'small' | 'regular' | 'jumbo';

/** Bubble columns across the sheet for each size. */
const COLUMNS: Record<BubbleSize, number> = { small: 8, regular: 6, jumbo: 4 };

/** Rest spacing of the film grid (px). */
const NODE_SPACING = 26;

const K_EDGE = 1600;
const K_DIAG = 700;
const K_HOME = 26;
const K_GRAB = 2600;
/** How quickly a held point catches up with the finger (1/s). */
const GRAB_FOLLOW = 22;

/** The longest a held bubble lasts before it gives (s); each one differs a little below it. */
export const HOLD_MAX = 4;

const STRAIN_STEPS: [number, number][] = [
  [1, 0.35],
  [2, 0.62],
  [3, 0.84],
];
const DAMP_SPRING = 9;
const DAMP_TABLE = 3.2;

export type PopCause = 'press' | 'roll' | 'strain';

export interface Bubble {
  /** Rest position on the sheet (px from its top-left). */
  u: number;
  v: number;
  r: number;
  popped: boolean;
  /** How far it's pushed in (0..1). Pops at 1. */
  press: number;
  /** Seconds of steady pressing it takes to pop (each bubble differs). */
  toughness: number;
  pressing: boolean;
  /** Stretch beyond which it gives way, and how long it has been over it. */
  limit: number;
  strainT: number;
  /** Seconds since popping (drives the burst animation). */
  popT: number;
  /** Which popped look it got (picked at random as it pops). */
  crumple: number;
  /** How hard it went: 0.3 for a quick tap … 1 for a full squeeze. */
  power: number;
  /** Which row it sits in (rows run across the sheet). */
  row: number;
  /** Its own little note offset, so lone pops never sound identical. */
  voice: number;
  /** Seconds until it wakes from a doze (a wake ripple sets these). */
  wakeIn: number;
  wobble: Spring;
  face: Face | null;
  // Current frame, refreshed by `frame()`.
  x: number;
  y: number;
  /** Local stretch: columns of the 2×2 map from rest to screen. */
  ja: number;
  jb: number;
  jc: number;
  jd: number;
  stretch: number;
}

export interface SheetGrab {
  id: number;
  w: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** Where the held point actually is: it follows (tx, ty) smoothly. */
  cx: number;
  cy: number;
}

export interface SheetEvents {
  pop?(b: Bubble, cause: PopCause, order: number): void;
  /** A pressed bubble crossed another step of resistance (1, 2, 3). */
  strain?(b: Bubble, step: number): void;
}

export class Sheet {
  readonly W: number;
  readonly H: number;
  readonly size: BubbleSize;
  readonly pitch: number;
  readonly radius: number;
  readonly nx: number;
  readonly ny: number;
  readonly dx: number;
  readonly dy: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly hx: Float32Array;
  readonly hy: Float32Array;
  private sa: Int32Array;
  private sb: Int32Array;
  private sl: Float32Array;
  private sk: Float32Array;
  private fx: Float32Array;
  private fy: Float32Array;
  readonly bubbles: Bubble[] = [];
  readonly grabs = new Map<number, SheetGrab>();
  events: SheetEvents = {};
  /** Screen position of the sheet's top-left at rest. */
  x0: number;
  y0: number;
  private popOrder = 0;

  constructor(maxW: number, maxH: number, size: BubbleSize, x0 = 0, y0 = 0, faces = true) {
    this.size = size;
    const cols = COLUMNS[size];
    // Bubble centres sit `m` in from the edges; odd rows shift by half a pitch.
    const pitch = maxW / (cols - 0.5 + 1.1);
    const m = pitch * 0.55;
    const rowStep = pitch * 0.866;
    const rows = Math.max(2, Math.floor((maxH - 2 * m) / rowStep) + 1);
    this.pitch = pitch;
    this.radius = pitch * 0.41;
    this.W = maxW;
    this.H = 2 * m + (rows - 1) * rowStep;
    this.x0 = x0;
    this.y0 = y0;

    this.nx = Math.max(3, Math.round(this.W / NODE_SPACING) + 1);
    this.ny = Math.max(3, Math.round(this.H / NODE_SPACING) + 1);
    this.dx = this.W / (this.nx - 1);
    this.dy = this.H / (this.ny - 1);
    const n = this.nx * this.ny;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.hx = new Float32Array(n);
    this.hy = new Float32Array(n);
    this.fx = new Float32Array(n);
    this.fy = new Float32Array(n);
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        this.hx[k] = i * this.dx;
        this.hy[k] = j * this.dy;
      }
    }

    // Springs: edges keep the size, diagonals keep it from shearing.
    const a: number[] = [];
    const b: number[] = [];
    const kk: number[] = [];
    const add = (p: number, q: number, k: number) => {
      a.push(p);
      b.push(q);
      kk.push(k);
    };
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        if (i + 1 < this.nx) add(k, k + 1, K_EDGE);
        if (j + 1 < this.ny) add(k, k + this.nx, K_EDGE);
        if (i + 1 < this.nx && j + 1 < this.ny) {
          add(k, k + this.nx + 1, K_DIAG);
          add(k + 1, k + this.nx, K_DIAG);
        }
      }
    }
    this.sa = Int32Array.from(a);
    this.sb = Int32Array.from(b);
    this.sk = Float32Array.from(kk);
    this.sl = new Float32Array(a.length);
    for (let s = 0; s < a.length; s++) {
      this.sl[s] = Math.hypot(this.hx[b[s]] - this.hx[a[s]], this.hy[b[s]] - this.hy[a[s]]);
    }
    this.settle();

    for (let row = 0; row < rows; row++) {
      const odd = row % 2 === 1;
      for (let c = 0; c < cols; c++) {
        const u = m + c * pitch + (odd ? pitch / 2 : 0);
        if (u > this.W - m + 0.5) continue;
        const face = faces ? new Face() : null;
        this.bubbles.push({
          u,
          v: m + row * rowStep,
          r: this.radius * rand(0.95, 1.04),
          popped: false,
          press: 0,
          toughness: rand(HOLD_MAX * 0.8, HOLD_MAX),
          pressing: false,
          limit: rand(1.46, 1.7),
          strainT: 0,
          popT: 0,
          crumple: 0,
          power: 0,
          row,
          voice: Math.floor(rand(0, 3)),
          wakeIn: -1,
          wobble: new Spring(0, springs.wobbly),
          face,
          x: 0,
          y: 0,
          ja: 1,
          jb: 0,
          jc: 0,
          jd: 1,
          stretch: 1,
        });
      }
    }
    this.frame();
  }

  /** Put every node back where it rests, still. */
  settle() {
    for (let k = 0; k < this.px.length; k++) {
      this.px[k] = this.x0 + this.hx[k];
      this.py[k] = this.y0 + this.hy[k];
      this.vx[k] = 0;
      this.vy[k] = 0;
    }
  }

  /** Move the resting place (layout changes). */
  moveTo(x0: number, y0: number) {
    const ddx = x0 - this.x0;
    const ddy = y0 - this.y0;
    this.x0 = x0;
    this.y0 = y0;
    for (let k = 0; k < this.px.length; k++) {
      this.px[k] += ddx;
      this.py[k] += ddy;
    }
    for (const g of this.grabs.values()) {
      g.tx += ddx;
      g.ty += ddy;
      g.sx += ddx;
      g.sy += ddy;
      g.cx += ddx;
      g.cy += ddy;
    }
    this.frame();
  }

  get remaining() {
    let n = 0;
    for (const b of this.bubbles) if (!b.popped) n++;
    return n;
  }

  // ——— the film ———

  step(h: number) {
    const { px, py, vx, vy, hx, hy, x0, y0 } = this;
    const n = px.length;
    const { fx, fy } = this;
    for (let k = 0; k < n; k++) {
      fx[k] = (x0 + hx[k] - px[k]) * K_HOME - vx[k] * DAMP_TABLE;
      fy[k] = (y0 + hy[k] - py[k]) * K_HOME - vy[k] * DAMP_TABLE;
    }
    const { sa, sb, sl, sk } = this;
    for (let s = 0; s < sa.length; s++) {
      const a = sa[s];
      const b = sb[s];
      const ex = px[b] - px[a];
      const ey = py[b] - py[a];
      const L = Math.sqrt(ex * ex + ey * ey) || 1e-6;
      const ux = ex / L;
      const uy = ey / L;
      // Spring per unit rest length, so the film feels the same at any density.
      const rel = (vx[b] - vx[a]) * ux + (vy[b] - vy[a]) * uy;
      const f = ((sk[s] * (L - sl[s])) / sl[s]) * NODE_SPACING + rel * DAMP_SPRING;
      fx[a] += f * ux;
      fy[a] += f * uy;
      fx[b] -= f * ux;
      fy[b] -= f * uy;
    }
    const follow = 1 - Math.exp(-h * GRAB_FOLLOW);
    for (const g of this.grabs.values()) {
      g.cx += (g.tx - g.cx) * follow;
      g.cy += (g.ty - g.cy) * follow;
      for (let k = 0; k < n; k++) {
        const w = g.w[k];
        if (w < 0.02) continue;
        fx[k] += ((g.cx + g.ox[k] - px[k]) * K_GRAB - vx[k] * 70) * w;
        fy[k] += ((g.cy + g.oy[k] - py[k]) * K_GRAB - vy[k] * 70) * w;
      }
    }
    for (let k = 0; k < n; k++) {
      vx[k] += fx[k] * h;
      vy[k] += fy[k] * h;
      px[k] += vx[k] * h;
      py[k] += vy[k] * h;
    }
  }

  /** A gentle kick to the film around a point (a pop makes it jump). */
  kick(x: number, y: number, strength: number, radius: number) {
    for (let k = 0; k < this.px.length; k++) {
      const ex = this.px[k] - x;
      const ey = this.py[k] - y;
      const d = Math.hypot(ex, ey);
      if (d > radius) continue;
      const w = (1 - d / radius) * strength;
      this.vx[k] += (ex / (d || 1)) * w;
      this.vy[k] += (ey / (d || 1)) * w;
    }
  }

  /** Is a screen point on the film? */
  contains(x: number, y: number, pad = 0) {
    // The film's outline, walked around its edge nodes.
    const { nx, ny } = this;
    const ring: number[] = [];
    for (let i = 0; i < nx; i++) ring.push(i);
    for (let j = 1; j < ny; j++) ring.push(j * nx + nx - 1);
    for (let i = nx - 2; i >= 0; i--) ring.push((ny - 1) * nx + i);
    for (let j = ny - 2; j > 0; j--) ring.push(j * nx);
    let inside = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const xa = this.px[ring[a]];
      const ya = this.py[ring[a]];
      const xb = this.px[ring[b]];
      const yb = this.py[ring[b]];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    if (inside || pad <= 0) return inside;
    for (const k of ring) if (Math.hypot(this.px[k] - x, this.py[k] - y) < pad) return true;
    return false;
  }

  // ——— grabbing (stretch) ———

  grab(id: number, x: number, y: number) {
    if (!this.contains(x, y, 18)) return false;
    const n = this.px.length;
    const g: SheetGrab = {
      id,
      w: new Float32Array(n),
      ox: new Float32Array(n),
      oy: new Float32Array(n),
      sx: x,
      sy: y,
      tx: x,
      ty: y,
      cx: x,
      cy: y,
    };
    const sigma = NODE_SPACING * 0.95;
    for (let k = 0; k < n; k++) {
      const ex = this.px[k] - x;
      const ey = this.py[k] - y;
      const w = Math.exp(-(ex * ex + ey * ey) / (2 * sigma * sigma));
      if (w < 0.02) continue;
      g.w[k] = w;
      g.ox[k] = ex;
      g.oy[k] = ey;
    }
    this.grabs.set(id, g);
    return true;
  }

  /**
   * Follow the finger. The pull gets heavier the further you go (it's a
   * soft limit, not a wall); returns how far you've pulled, 0..1+.
   */
  drag(id: number, x: number, y: number) {
    const g = this.grabs.get(id);
    if (!g) return 0;
    const reach = this.reach;
    const ex = x - g.sx;
    const ey = y - g.sy;
    const d = Math.hypot(ex, ey);
    const k = d > 0 ? (reach * Math.tanh(d / reach)) / d : 0;
    g.tx = g.sx + ex * k;
    g.ty = g.sy + ey * k;
    return d / reach;
  }

  /** How far the film will follow a finger before it gets heavy (px). */
  get reach() {
    return Math.min(this.W, this.H) * 0.36;
  }

  release(id: number) {
    return this.grabs.delete(id);
  }

  // ——— bubbles ———

  /** Refresh each bubble's position and local stretch from the film. */
  frame() {
    const { nx, dx, dy, px, py } = this;
    for (const b of this.bubbles) {
      const fi = clamp(b.u / dx, 0, this.nx - 1.0001);
      const fj = clamp(b.v / dy, 0, this.ny - 1.0001);
      const i = Math.floor(fi);
      const j = Math.floor(fj);
      const s = fi - i;
      const t = fj - j;
      const k00 = j * nx + i;
      const k10 = k00 + 1;
      const k01 = k00 + nx;
      const k11 = k01 + 1;
      b.x = (px[k00] * (1 - s) + px[k10] * s) * (1 - t) + (px[k01] * (1 - s) + px[k11] * s) * t;
      b.y = (py[k00] * (1 - s) + py[k10] * s) * (1 - t) + (py[k01] * (1 - s) + py[k11] * s) * t;
      b.ja = ((px[k10] - px[k00]) * (1 - t) + (px[k11] - px[k01]) * t) / dx;
      b.jb = ((py[k10] - py[k00]) * (1 - t) + (py[k11] - py[k01]) * t) / dx;
      b.jc = ((px[k01] - px[k00]) * (1 - s) + (px[k11] - px[k10]) * s) / dy;
      b.jd = ((py[k01] - py[k00]) * (1 - s) + (py[k11] - py[k10]) * s) / dy;
      // Largest principal stretch of the local map.
      const e = b.ja * b.ja + b.jb * b.jb;
      const f = b.ja * b.jc + b.jb * b.jd;
      const g = b.jc * b.jc + b.jd * b.jd;
      const tr = (e + g) / 2;
      const det = e * g - f * f;
      b.stretch = Math.sqrt(tr + Math.sqrt(Math.max(0, tr * tr - det)));
    }
  }

  /** The unpopped bubble under a screen point, if any. */
  bubbleAt(x: number, y: number, slack = 1.08): Bubble | null {
    let best: Bubble | null = null;
    let bestD = Infinity;
    for (const b of this.bubbles) {
      if (b.popped) continue;
      // Back into the bubble's rest frame.
      const det = b.ja * b.jd - b.jc * b.jb;
      if (Math.abs(det) < 1e-4) continue;
      const ex = x - b.x;
      const ey = y - b.y;
      const lx = (b.jd * ex - b.jc * ey) / det;
      const ly = (-b.jb * ex + b.ja * ey) / det;
      const d = Math.hypot(lx, ly) / b.r;
      if (d < slack && d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Every unpopped bubble a finger passed over between two points, in order. */
  bubblesAlong(x0: number, y0: number, x1: number, y1: number): Bubble[] {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (this.radius * 0.4)));
    const out: Bubble[] = [];
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const b = this.bubbleAt(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0.92);
      if (b && !out.includes(b)) out.push(b);
    }
    return out;
  }

  /**
   * Pop a bubble. `power` is how hard it went (a full squeeze is 1, a quick
   * tap about 0.3); by default it's read from how far it was pushed in.
   */
  pop(b: Bubble, cause: PopCause, power?: number) {
    if (b.popped) return;
    b.power = clamp(power ?? Math.max(0.3, b.press), 0, 1);
    b.crumple = this.pickLook(b);
    b.popped = true;
    b.pressing = false;
    b.popT = 0;
    b.press = 1;
    this.kick(b.x, b.y, cause === 'strain' ? 40 : 50 + b.power * 60, this.pitch * 1.3);
    this.events.pop?.(b, cause, this.popOrder++);
  }

  /** A random popped look, never the same as a popped neighbour's. */
  private pickLook(b: Bubble) {
    const near = this.pitch * 1.6;
    const taken = new Set<number>();
    for (const o of this.bubbles) {
      if (o.popped && o !== b && Math.hypot(o.u - b.u, o.v - b.v) < near) taken.add(o.crumple);
    }
    const n = POPPED_LOOKS.length;
    let look = Math.floor(Math.random() * n);
    for (let tries = 0; tries < n && taken.has(look); tries++) look = (look + 1 + Math.floor(Math.random() * 3)) % n;
    return look;
  }

  /** Bubbles in a row (for "you popped the whole row" moments). */
  rowOf(row: number) {
    return this.bubbles.filter((b) => b.row === row);
  }

  /** Called when a run of pops has paused, so the next run starts low again. */
  resetOrder() {
    this.popOrder = 0;
  }

  update(dt: number) {
    for (const b of this.bubbles) {
      b.wobble.update(dt);
      b.face?.update(dt);
      if (b.popped) {
        b.popT += dt;
        continue;
      }
      if (b.pressing) {
        const before = b.press;
        b.press += dt / b.toughness;
        // Resistance you can feel: three little steps, then it gives.
        for (const [step, at] of STRAIN_STEPS) if (before < at && b.press >= at) this.events.strain?.(b, step);
        if (b.press >= 1) this.pop(b, 'press', 1);
      } else if (b.press > 0) {
        b.press = Math.max(0, b.press - dt * 6);
      }
      // Stretched too far, it gives way on its own.
      if (b.stretch > b.limit) {
        b.strainT += dt;
        if (b.strainT > 0.06) this.pop(b, 'strain');
      } else b.strainT = Math.max(0, b.strainT - dt);
    }
  }
}
