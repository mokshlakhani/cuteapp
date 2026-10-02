import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { clamp, matIdentity, matMul, rand, type Mat, type Vec } from '../../core/math';
import { resampleClosed, segIntersect } from '../../core/geometry';
import { Face } from '../../render/face';
import type { Fruit } from './fruits';

/**
 * A soft jelly body: a ring of point masses pulled toward a "goal" shape by
 * springs (meshless shape matching, Müller et al. 2005). Partly rigid,
 * partly affine — so it can stretch, squash and wobble but always remembers
 * what it wants to be. Area is preserved, so stretching makes it thinner.
 */

const BETA = 0.3; // how much affine (stretchy) vs rigid the goal shape is
const BETA_HELD = 0.6; // while held, the jelly is allowed to stretch much more
const STIFFNESS = 720; // goal-spring strength (1/s²): sets the wobble frequency
const HELD_SOFTEN = 0.42; // while held, the far side lags behind → real stretch
const PRESSURE = 42000; // internal pressure: resists losing volume (like a filled balloon)
const SMOOTH = 2600; // irons out wrinkles in the outline
const VISCOSITY = 30; // damps neighbour-to-neighbour ripples

const scratchBufs: Float64Array[] = [];
/** Shared temporary arrays (one set is plenty: bodies step one at a time). */
function scratch(n: number, slot: number) {
  let b = scratchBufs[slot];
  if (!b || b.length < n) b = scratchBufs[slot] = new Float64Array(Math.max(n, 64));
  return b;
}

let nextId = 1;

export interface Grab {
  w: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  fx: number;
  fy: number;
}

export interface Crossing {
  edge: number;
  /** param along the edge */
  t: number;
  /** param along the knife segment */
  s: number;
}

export class SoftBody {
  readonly id = nextId++;
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Rest shape, centred on its vertex average. */
  readonly qx: Float64Array;
  readonly qy: Float64Array;
  /** skin[i]: edge i → i+1 is original fruit skin (not a cut face). */
  readonly skin: boolean[];
  private aqqInv: [number, number, number];

  /** Size: radius of a circle with the same rest area. */
  readonly R: number;
  /** Rest area (px²) — internal pressure keeps the jelly full. */
  readonly restArea: number;
  /** Signed area last step. */
  area = 0;
  /** Rest-space → fruit texture-space transform (identity for a whole fruit). */
  tex: Mat;
  /** Fruit base radius in px (texture space scale). */
  readonly fruitR: number;
  readonly fruit: Fruit;
  face: Face | null = null;
  /** Face centre in rest space. */
  faceX = 0;
  faceY = 0;
  faceSize = 0;
  attach = -1;
  stiffness: number;

  // Derived each step
  cx = 0;
  cy = 0;
  vcx = 0;
  vcy = 0;
  omega = 0;
  angle = 0;
  /** Goal transform (world ← rest), without translation. */
  G = { a: 1, b: 0, c: 0, d: 1 };
  /** Stretch ratio (largest/smallest principal stretch). */
  stretch = 1;
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;

  readonly grabs = new Map<number, Grab>();
  readonly squish = new Spring(0, springs.wobbly);
  squishNx = 0;
  squishNy = 1;
  /** Upright preference (only for bodies with faces). */
  upright = true;
  /** Fades out when > 0 (removed at 1). */
  dying = 0;
  spawnPop = new Spring(1, springs.wobbly);
  /** Strongest floor/wall impact this frame (for sounds/faces). */
  impact = 0;
  impactX = 0;
  touchingFloor = false;
  age = 0;

  constructor(fruit: Fruit, fruitR: number, rest: Vec[], skin: boolean[], tex: Mat = matIdentity(), at?: { x: number; y: number }) {
    this.fruit = fruit;
    this.fruitR = fruitR;
    this.tex = tex;
    const n = rest.length;
    this.n = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.qx = new Float64Array(n);
    this.qy = new Float64Array(n);
    this.skin = skin.slice();
    let mx = 0;
    let my = 0;
    for (const p of rest) {
      mx += p.x;
      my += p.y;
    }
    mx /= n;
    my /= n;
    let a00 = 0;
    let a01 = 0;
    let a11 = 0;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const qx = rest[i].x - mx;
      const qy = rest[i].y - my;
      this.qx[i] = qx;
      this.qy[i] = qy;
      a00 += qx * qx;
      a01 += qx * qy;
      a11 += qy * qy;
      const j = (i + 1) % n;
      area += rest[i].x * rest[j].y - rest[j].x * rest[i].y;
    }
    const det = a00 * a11 - a01 * a01 || 1e-9;
    this.aqqInv = [a11 / det, -a01 / det, a00 / det];
    this.restArea = Math.abs(area / 2);
    this.R = Math.sqrt(this.restArea / Math.PI);
    // Smaller jellies are relatively firmer and jiggle faster, like real ones.
    this.stiffness = clamp(STIFFNESS * Math.pow(70 / Math.max(8, this.R), 0.75), 640, 2400);
    // The rest offset (mx, my) is where this piece sat in its parent's frame.
    this.tex = matMul(tex, { a: 1, b: 0, c: 0, d: 1, e: mx, f: my });
    const ox = at ? at.x : 0;
    const oy = at ? at.y : 0;
    for (let i = 0; i < n; i++) {
      this.x[i] = ox + this.qx[i];
      this.y[i] = oy + this.qy[i];
    }
    this.computeFrame();
  }

  /** Build a whole fruit at (x, y). */
  static fromFruit(fruit: Fruit, baseR: number, x: number, y: number) {
    const R = baseR * fruit.size;
    const n = clamp(Math.round((Math.PI * 2 * R) / 7.5), 26, 44);
    const pts: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const p = fruit.shape(th);
      pts.push({ x: p.x * R, y: p.y * R });
    }
    // Resample evenly so every edge is about the same length.
    const even = resampleClosed(
      pts,
      pts.map(() => true),
      n,
    );
    const b = new SoftBody(fruit, R, even.pts, even.flags, matIdentity(), { x, y });
    // Attachment sits at the top-most vertex.
    let top = 0;
    for (let i = 1; i < n; i++) if (b.qy[i] < b.qy[top]) top = i;
    b.attach = fruit.attach ? top : -1;
    b.face = new Face();
    b.faceX = 0;
    b.faceY = fruit.faceY * R;
    b.faceSize = R * 0.95;
    return b;
  }

  /** Centre of mass, rotation, and the shape-matching goal transform. */
  computeFrame() {
    const { n, x, y, vx, vy, qx, qy } = this;
    let cx = 0;
    let cy = 0;
    let vcx = 0;
    let vcy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      cx += x[i];
      cy += y[i];
      vcx += vx[i];
      vcy += vy[i];
      if (x[i] < minX) minX = x[i];
      if (x[i] > maxX) maxX = x[i];
      if (y[i] < minY) minY = y[i];
      if (y[i] > maxY) maxY = y[i];
    }
    cx /= n;
    cy /= n;
    this.cx = cx;
    this.cy = cy;
    this.vcx = vcx / n;
    this.vcy = vcy / n;
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;

    let p00 = 0;
    let p01 = 0;
    let p10 = 0;
    let p11 = 0;
    let L = 0;
    let I = 0;
    for (let i = 0; i < n; i++) {
      const px = x[i] - cx;
      const py = y[i] - cy;
      p00 += px * qx[i];
      p01 += px * qy[i];
      p10 += py * qx[i];
      p11 += py * qy[i];
      L += px * (vy[i] - this.vcy) - py * (vx[i] - this.vcx);
      I += px * px + py * py;
    }
    this.omega = I > 0 ? L / I : 0;
    this.angle = Math.atan2(p10 - p01, p00 + p11);

    // Affine part A = Apq · Aqq⁻¹, normalised to preserve area.
    const [i00, i01, i11] = this.aqqInv;
    let a = p00 * i00 + p01 * i01;
    let c = p00 * i01 + p01 * i11;
    let b = p10 * i00 + p11 * i01;
    let d = p10 * i01 + p11 * i11;
    const det = a * d - b * c;
    if (det > 1e-6) {
      const s = 1 / Math.sqrt(det);
      a *= s;
      b *= s;
      c *= s;
      d *= s;
      // Principal stretch ratio from AᵀA.
      const t = a * a + b * b + c * c + d * d;
      const disc = Math.sqrt(Math.max(0, t * t - 4));
      this.stretch = Math.sqrt((t + disc) / Math.max(1e-6, t - disc));
    } else {
      a = d = 1;
      b = c = 0;
      this.stretch = 1;
    }

    // Rigid rotation, gently nudged upright when the body has a face.
    let th = this.angle;
    if (this.upright && this.face && this.grabs.size === 0) {
      const wrapped = Math.atan2(Math.sin(th), Math.cos(th));
      th -= clamp(wrapped, -0.3, 0.3) * (this.touchingFloor ? 0.5 : 0.12);
    }
    const cr = Math.cos(th);
    const sr = Math.sin(th);
    const beta = this.grabs.size ? BETA_HELD : BETA;
    let ga = beta * a + (1 - beta) * cr;
    let gb = beta * b + (1 - beta) * sr;
    let gc = beta * c - (1 - beta) * sr;
    let gd = beta * d + (1 - beta) * cr;

    // Squish: flatten along the press direction, widen across it.
    const s = this.squish.value;
    if (Math.abs(s) > 1e-4) {
      const k1 = 1 / (1 + s);
      const k2 = 1 + s;
      const nx = this.squishNx;
      const ny = this.squishNy;
      // S = k2·I + (k1 − k2)·n nᵀ
      const s00 = k2 + (k1 - k2) * nx * nx;
      const s01 = (k1 - k2) * nx * ny;
      const s11 = k2 + (k1 - k2) * ny * ny;
      const na = s00 * ga + s01 * gb;
      const nb = s01 * ga + s11 * gb;
      const nc = s00 * gc + s01 * gd;
      const nd = s01 * gc + s11 * gd;
      ga = na;
      gb = nb;
      gc = nc;
      gd = nd;
    }
    this.G.a = ga;
    this.G.b = gb;
    this.G.c = gc;
    this.G.d = gd;
  }

  /** One sub-step of internal forces + integration (no collisions). */
  step(h: number, gravity: number) {
    this.computeFrame();
    const { n, x, y, vx, vy, qx, qy, G } = this;
    const k = this.stiffness * (this.grabs.size ? HELD_SOFTEN : 1);
    const damp = Math.exp(-3.2 * h);
    const air = Math.exp(-0.08 * h);
    const cx = this.cx;
    const cy = this.cy;
    const om = this.omega;
    const dx = scratch(n, 0);
    const dy = scratch(n, 1);
    const lvx = scratch(n, 2);
    const lvy = scratch(n, 3);
    for (let i = 0; i < n; i++) {
      // Deviation from the goal shape.
      dx[i] = cx + G.a * qx[i] + G.c * qy[i] - x[i];
      dy[i] = cy + G.b * qx[i] + G.d * qy[i] - y[i];
    }
    for (let i = 0; i < n; i++) {
      const p = i === 0 ? n - 1 : i - 1;
      const q = i + 1 === n ? 0 : i + 1;
      // Goal springs, plus a smoothing term that irons out local wrinkles in
      // the deviation (big wobbles pass through untouched).
      const sx = dx[p] + dx[q] - 2 * dx[i];
      const sy = dy[p] + dy[q] - 2 * dy[i];
      vx[i] += (dx[i] * k - sx * SMOOTH) * h;
      vy[i] += (dy[i] * k - sy * SMOOTH) * h + gravity * h;
    }
    for (let i = 0; i < n; i++) {
      const p = i === 0 ? n - 1 : i - 1;
      const q = i + 1 === n ? 0 : i + 1;
      lvx[i] = vx[p] + vx[q] - 2 * vx[i];
      lvy[i] = vy[p] + vy[q] - 2 * vy[i];
    }
    const visc = Math.min(0.24, VISCOSITY * h);
    for (let i = 0; i < n; i++) {
      // Neighbour viscosity: damps zig-zag ripples, not the jiggle.
      vx[i] += lvx[i] * visc;
      vy[i] += lvy[i] * visc;
      // Damp only the wobble, not the flight or spin.
      const rx = this.vcx - om * (y[i] - cy);
      const ry = this.vcy + om * (x[i] - cx);
      vx[i] = (rx + (vx[i] - rx) * damp) * air;
      vy[i] = (ry + (vy[i] - ry) * damp) * air;
    }
    // Internal pressure along edge normals (vertices run clockwise on screen).
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      area += x[i] * y[j] - x[j] * y[i];
    }
    area *= 0.5;
    this.area = area;
    if (area < this.restArea * 0.3) {
      // Crushed flat or turned inside-out (rare, e.g. a tiny crumb caught
      // between big jellies): pop gently back into shape instead of glitching.
      this.recover();
      return;
    }
    const squeeze = clamp((this.restArea - area) / this.restArea, -0.5, 0.5);
    const pk = PRESSURE * squeeze * (n / (Math.PI * 2 * this.R)) * 0.5 * h;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const ex = x[j] - x[i];
      const ey = y[j] - y[i];
      vx[i] += ey * pk;
      vy[i] -= ex * pk;
      vx[j] += ey * pk;
      vy[j] -= ex * pk;
    }
    for (const g of this.grabs.values()) {
      for (let i = 0; i < n; i++) {
        const w = g.w[i];
        if (w < 0.01) continue;
        const tx = g.fx + g.ox[i];
        const ty = g.fy + g.oy[i];
        vx[i] += ((tx - x[i]) * 900 - vx[i] * 22) * w * h;
        vy[i] += ((ty - y[i]) * 900 - vy[i] * 22) * w * h;
      }
    }
    for (let i = 0; i < n; i++) {
      x[i] += vx[i] * h;
      y[i] += vy[i] * h;
    }
  }

  /** Snap back to the (rigid) rest shape around the current centre. */
  private recover() {
    const { n, x, y, vx, vy, qx, qy } = this;
    const cr = Math.cos(this.angle);
    const sr = Math.sin(this.angle);
    const vcx = Number.isFinite(this.vcx) ? clamp(this.vcx, -2000, 2000) : 0;
    const vcy = Number.isFinite(this.vcy) ? clamp(this.vcy, -2000, 2000) : 0;
    const cx = Number.isFinite(this.cx) ? this.cx : 0;
    const cy = Number.isFinite(this.cy) ? this.cy : 0;
    for (let i = 0; i < n; i++) {
      x[i] = cx + cr * qx[i] - sr * qy[i];
      y[i] = cy + sr * qx[i] + cr * qy[i];
      vx[i] = vcx;
      vy[i] = vcy;
    }
    this.spawnPop.value = 0.85;
    this.computeFrame();
  }

  /** Floor + walls. Records the strongest impact for sounds and faces. */
  collideBounds(left: number, top: number, right: number, floor: number) {
    const { n, x, y, vx, vy } = this;
    this.touchingFloor = false;
    // While held, the floor is grippy: the planted side stays put and the
    // jelly stretches toward your finger instead of sliding after it.
    const grip = this.grabs.size ? 0.55 : 0.94;
    for (let i = 0; i < n; i++) {
      if (y[i] > floor) {
        y[i] = floor;
        this.touchingFloor = true;
        if (vy[i] > 0) {
          if (vy[i] > this.impact) {
            this.impact = vy[i];
            this.impactX = x[i];
          }
          vy[i] = vy[i] > 380 ? -vy[i] * 0.28 : 0;
          vx[i] *= grip;
        }
      } else if (y[i] < top) {
        y[i] = top;
        if (vy[i] < 0) {
          this.impact = Math.max(this.impact, -vy[i] * 0.7);
          this.impactX = x[i];
          vy[i] = -vy[i] * 0.3;
        }
      }
      if (x[i] < left) {
        x[i] = left;
        if (vx[i] < 0) {
          if (-vx[i] * 0.8 > this.impact) {
            this.impact = -vx[i] * 0.8;
            this.impactX = x[i];
          }
          vx[i] = -vx[i] * 0.35;
        }
      } else if (x[i] > right) {
        x[i] = right;
        if (vx[i] > 0) {
          if (vx[i] * 0.8 > this.impact) {
            this.impact = vx[i] * 0.8;
            this.impactX = x[i];
          }
          vx[i] = -vx[i] * 0.35;
        }
      }
    }
  }

  contains(px: number, py: number) {
    if (px < this.minX || px > this.maxX || py < this.minY || py > this.maxY) return false;
    const { n, x, y } = this;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (y[i] > py !== y[j] > py && px < ((x[j] - x[i]) * (py - y[i])) / (y[j] - y[i]) + x[i]) inside = !inside;
    }
    return inside;
  }

  /** Start dragging from (fx, fy). Nearby vertices follow the finger most. */
  grab(id: number, fx: number, fy: number) {
    const { n, x, y } = this;
    const w = new Float32Array(n);
    const ox = new Float32Array(n);
    const oy = new Float32Array(n);
    const sigma = this.R * 0.55;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const d2 = (x[i] - fx) ** 2 + (y[i] - fy) ** 2;
      w[i] = Math.exp(-d2 / (2 * sigma * sigma));
      if (w[i] > max) max = w[i];
      ox[i] = x[i] - fx;
      oy[i] = y[i] - fy;
    }
    for (let i = 0; i < n; i++) w[i] = (w[i] / (max || 1)) * 0.9;
    this.grabs.set(id, { w, ox, oy, fx, fy });
  }

  /** Segment crossings with this body's outline. */
  crossings(ax: number, ay: number, bx: number, by: number): Crossing[] {
    const out: Crossing[] = [];
    const { n, x, y } = this;
    if (Math.max(ax, bx) < this.minX || Math.min(ax, bx) > this.maxX || Math.max(ay, by) < this.minY || Math.min(ay, by) > this.maxY)
      return out;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const r = segIntersect(ax, ay, bx, by, x[i], y[i], x[j], y[j]);
      if (r) out.push({ edge: i, t: r.u, s: r.t });
    }
    out.sort((p, q) => p.s - q.s);
    return out;
  }

  /**
   * Split along the chord from crossing `e1` to crossing `e2`.
   * Returns the new bodies, or null if a piece would be too tiny.
   */
  split(e1: Crossing, e2: Crossing, minR: number): SoftBody[] | null {
    if (e1.edge === e2.edge) return null;
    const { n, x, y, qx, qy } = this;
    this.computeFrame();
    const at = (c: Crossing, ax: ArrayLike<number>, ay: ArrayLike<number>) => {
      const j = (c.edge + 1) % n;
      return { x: ax[c.edge] + (ax[j] - ax[c.edge]) * c.t, y: ay[c.edge] + (ay[j] - ay[c.edge]) * c.t };
    };
    // World-space cut points (for pushing apart and faces)…
    const A = at(e1, x, y);
    const B = at(e2, x, y);
    // …but the pieces themselves are built from the parent's smooth REST
    // outline, so dents from whatever it was touching never get baked in.
    const build = (from: Crossing, to: Crossing) => {
      const pts: Vec[] = [at(from, qx, qy)];
      const flags: boolean[] = [this.skin[from.edge]];
      let i = (from.edge + 1) % n;
      for (let guard = 0; guard <= n; guard++) {
        pts.push({ x: qx[i], y: qy[i] });
        flags.push(this.skin[i]);
        if (i === to.edge) break;
        i = (i + 1) % n;
      }
      pts.push(at(to, qx, qy));
      flags.push(false); // the fresh cut face
      return { pts, flags };
    };
    const halves = [build(e1, e2), build(e2, e1)];

    const G = this.G;
    const cr = Math.cos(this.angle);
    const sr = Math.sin(this.angle);
    const pieces: SoftBody[] = [];
    for (const half of halves) {
      let area = 0;
      let per = 0;
      const m = half.pts.length;
      for (let i = 0; i < m; i++) {
        const a = half.pts[i];
        const b = half.pts[(i + 1) % m];
        area += a.x * b.y - b.x * a.y;
        per += Math.hypot(b.x - a.x, b.y - a.y);
      }
      // A chord that wanders outside a tangled outline: just don't cut.
      if (area <= 0) return null;
      const R = Math.sqrt(area / 2 / Math.PI);
      if (R < minR) return null;
      const count = clamp(Math.round(per / 9), 12, 36);
      const rs = resampleClosed(half.pts, half.flags, count);
      // Rest shape = parent rest piece, turned to the parent's current angle.
      const rest = rs.pts.map((p) => ({ x: cr * p.x - sr * p.y, y: sr * p.x + cr * p.y }));
      // tex maps piece-rest → parent-rest → fruit texture.
      const unrot: Mat = { a: cr, b: -sr, c: sr, d: cr, e: 0, f: 0 };
      const body = new SoftBody(this.fruit, this.fruitR, rest, rs.flags, matMul(this.tex, unrot));
      for (let i = 0; i < body.n; i++) {
        // Start exactly where the parent's goal shape has this bit of jelly…
        const p = rs.pts[i];
        const wx = this.cx + G.a * p.x + G.c * p.y;
        const wy = this.cy + G.b * p.x + G.d * p.y;
        body.x[i] = wx;
        body.y[i] = wy;
        // …moving with the parent's rigid motion at that point.
        body.vx[i] = this.vcx - this.omega * (wy - this.cy);
        body.vy[i] = this.vcy + this.omega * (wx - this.cx);
      }
      body.computeFrame();
      pieces.push(body);
    }

    // Push the halves apart, perpendicular to the cut.
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl;
    const ny = dx / dl;
    for (const p of pieces) {
      const side = Math.sign((p.cx - A.x) * nx + (p.cy - A.y) * ny) || 1;
      const push = rand(70, 110) * Math.min(1.6, this.fruitR / Math.max(14, p.R));
      for (let i = 0; i < p.n; i++) {
        p.vx[i] += nx * side * push;
        p.vy[i] += ny * side * push - 40;
      }
    }

    // Faces: the parent's face stays with the piece holding it; other
    // big-enough pieces wake up with a little face of their own.
    const faceW = { x: this.cx + G.a * this.faceX + G.c * this.faceY, y: this.cy + G.b * this.faceX + G.d * this.faceY };
    let faceOwner: SoftBody | null = null;
    if (this.face) {
      faceOwner = pieces.find((p) => p.contains(faceW.x, faceW.y)) ?? null;
      if (!faceOwner) faceOwner = pieces.reduce((a, b) => (a.R > b.R ? a : b));
    }
    for (const p of pieces) {
      if (p.R < this.fruitR * 0.3) continue;
      p.face = p === faceOwner && this.face ? this.face : new Face();
      p.faceSize = clamp(p.R * 0.95, 18, this.fruitR * 0.95);
      p.faceX = 0;
      p.faceY = -p.R * 0.08;
      p.face.set('surprised', 0.7);
      p.face.base = 'calm';
    }

    // Keep the stem/leaf on the piece that still has that bit of skin.
    if (this.attach >= 0) {
      const ax = x[this.attach];
      const ay = y[this.attach];
      for (const p of pieces) {
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < p.n; i++) {
          const d = (p.x[i] - ax) ** 2 + (p.y[i] - ay) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best >= 0 && bd < 18 * 18 && p.skin[best]) {
          p.attach = best;
          break;
        }
      }
    }
    return pieces;
  }

  /** Vertex position transformed by the current goal (for anchoring art). */
  goalPoint(rx: number, ry: number) {
    const G = this.G;
    return { x: this.cx + G.a * rx + G.c * ry, y: this.cy + G.b * rx + G.d * ry };
  }
}

/** Soft-soft collisions: vertices of one body pushed out of the other. */
export function collidePair(A: SoftBody, B: SoftBody): number {
  if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) return 0;
  const surface = Math.max(pushOut(A, B), pushOut(B, A));
  return Math.max(surface, cores(A, B));
}

/**
 * Each jelly has a firm invisible core. Surfaces can squish into each other,
 * but cores never overlap — so fast jellies can't tunnel through and tangle.
 */
function cores(A: SoftBody, B: SoftBody) {
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  let avx = 0;
  let avy = 0;
  let bvx = 0;
  let bvy = 0;
  for (let i = 0; i < A.n; i++) {
    ax += A.x[i];
    ay += A.y[i];
    avx += A.vx[i];
    avy += A.vy[i];
  }
  for (let i = 0; i < B.n; i++) {
    bx += B.x[i];
    by += B.y[i];
    bvx += B.vx[i];
    bvy += B.vy[i];
  }
  ax /= A.n;
  ay /= A.n;
  bx /= B.n;
  by /= B.n;
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const r = 0.8 * (A.R + B.R);
  if (d >= r || d < 1e-6) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const pen = r - d;
  const wa = B.restArea / (A.restArea + B.restArea);
  const wb = 1 - wa;
  const rv = (bvx / B.n - avx / A.n) * nx + (bvy / B.n - avy / A.n) * ny;
  const imp = rv < 0 ? -rv * 0.9 : 0;
  for (let i = 0; i < A.n; i++) {
    A.x[i] -= nx * pen * wa;
    A.y[i] -= ny * pen * wa;
    A.vx[i] -= nx * imp * wa;
    A.vy[i] -= ny * imp * wa;
  }
  for (let i = 0; i < B.n; i++) {
    B.x[i] += nx * pen * wb;
    B.y[i] += ny * pen * wb;
    B.vx[i] += nx * imp * wb;
    B.vy[i] += ny * imp * wb;
  }
  return imp;
}

function pushOut(A: SoftBody, B: SoftBody) {
  let strongest = 0;
  const { n: nb, x: bx, y: by, vx: bvx, vy: bvy } = B;
  for (let i = 0; i < A.n; i++) {
    const px = A.x[i];
    const py = A.y[i];
    if (px < B.minX || px > B.maxX || py < B.minY || py > B.maxY) continue;
    if (!B.contains(px, py)) continue;
    // Nearest edge of B.
    let best = -1;
    let bd = Infinity;
    let bt = 0;
    let qx = 0;
    let qy = 0;
    for (let j = 0; j < nb; j++) {
      const k = (j + 1) % nb;
      const ex = bx[k] - bx[j];
      const ey = by[k] - by[j];
      const l2 = ex * ex + ey * ey || 1e-9;
      const t = clamp(((px - bx[j]) * ex + (py - by[j]) * ey) / l2, 0, 1);
      const cx = bx[j] + ex * t;
      const cy = by[j] + ey * t;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = j;
        bt = t;
        qx = cx;
        qy = cy;
      }
    }
    if (best < 0) continue;
    const d = Math.sqrt(bd);
    if (d < 1e-6) continue;
    const nx = (qx - px) / d;
    const ny = (qy - py) / d;
    const k = (best + 1) % nb;
    // Resolve most (not all) of the overlap each sub-step: contacts stay soft
    // and the wrinkle smoothing keeps the shared edge clean.
    const half = d * 0.32;
    A.x[i] += nx * half;
    A.y[i] += ny * half;
    bx[best] -= nx * half * (1 - bt);
    by[best] -= ny * half * (1 - bt);
    bx[k] -= nx * half * bt;
    by[k] -= ny * half * bt;
    // Remove approaching velocity (soft, slightly bouncy).
    const evx = bvx[best] * (1 - bt) + bvx[k] * bt;
    const evy = bvy[best] * (1 - bt) + bvy[k] * bt;
    const rvn = (A.vx[i] - evx) * nx + (A.vy[i] - evy) * ny;
    if (rvn < 0) {
      const imp = -rvn * 0.55;
      A.vx[i] += nx * imp;
      A.vy[i] += ny * imp;
      bvx[best] -= nx * imp * (1 - bt);
      bvy[best] -= ny * imp * (1 - bt);
      bvx[k] -= nx * imp * bt;
      bvy[k] -= ny * imp * bt;
      if (-rvn > strongest) strongest = -rvn;
    }
  }
  return strongest;
}
