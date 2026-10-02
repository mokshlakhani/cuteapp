import { clipHalfPlane, polyArea, polyCentroid, type Poly } from '../../core/geometry';
import type { Face } from '../../render/face';
import { extractRotation, m3, m3Det, m3Inverse, m3Mul, quatToM3, type M3, type Q4 } from './math3';

/**
 * One piece of melon jelly: a soft, rounded prism.
 *
 * Shape: a convex footprint polygon (in the fruit's rest x/z plane) extruded
 * between two heights, with every edge rounded by radius `b` — i.e. the
 * Minkowski sum of an inset prism and a sphere. Cuts are planes, so every
 * piece stays a convex rounded prism and can be cut again.
 *
 * Physics: a few particles sit on the inset prism's corners (each acts as a
 * sphere of radius `b`). They're pulled toward a goal shape by meshless
 * shape matching (rotation + some area-preserving affine stretch), which
 * gives the wobble. The render mesh is skinned to the particles, so the whole
 * surface jiggles smoothly.
 *
 * All rest coordinates live in the *original fruit's* space, so a solid
 * texture (flesh, rind, skin, seeds) follows each piece through any cut.
 */

/** The starting watermelon wedge, in cm. */
export const WEDGE = {
  radius: 7.6,
  halfAngle: (31 * Math.PI) / 180,
  height: 2.8,
  arcSegments: 9,
  bevel: 0.5,
};

export interface PhysicsParams {
  stiffness: number;
  damping: number;
  beta: number;
  gravity: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Grab {
  w: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  tz: Float32Array;
  /** grab point in rest space */
  hx: number;
  hy: number;
  hz: number;
  /** orientation captured at grab time (rest→world) */
  R0: M3;
  twist: number;
}

interface Plane {
  nx: number;
  ny: number;
  nz: number;
  d: number;
}

let nextId = 1;
const MAX_FOOT_PARTICLES = 12;
const K_WEIGHTS = 6;
const PRESSURE = 2500;

export function wedgeFootprint(R: number = WEDGE.radius): Poly {
  const { halfAngle: h, arcSegments: s } = WEDGE;
  const pts: Poly = [{ x: 0, y: 0 }];
  for (let i = 0; i <= s; i++) {
    const a = Math.PI / 2 - h + (2 * h * i) / s;
    pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
  }
  return pts;
}

function insetPolygon(foot: Poly, b: number): Poly {
  let poly = { pts: foot, skin: foot.map(() => false) };
  const n = foot.length;
  for (let i = 0; i < n; i++) {
    const a = foot[i];
    const c = foot[(i + 1) % n];
    const dx = c.x - a.x;
    const dz = c.y - a.y;
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const nx = dz / l;
    const nz = -dx / l;
    poly = clipHalfPlane(poly, nx, nz, nx * a.x + nz * a.y - b);
  }
  // Drop near-duplicate vertices.
  const out: Poly = [];
  for (const p of poly.pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 0.02) out.push(p);
  }
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 0.02) out.pop();
  return out;
}

/** Distance from the centroid to the nearest edge — a cheap inradius. */
function inradius(foot: Poly) {
  const c = polyCentroid(foot);
  let m = Infinity;
  for (let i = 0; i < foot.length; i++) {
    const a = foot[i];
    const b = foot[(i + 1) % foot.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) continue;
    m = Math.min(m, Math.abs((b.x - a.x) * (a.y - c.y) - (a.x - c.x) * (b.y - a.y)) / l);
  }
  return m;
}

function outwardNormals(poly: Poly) {
  const n = poly.length;
  const out: { nx: number; nz: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % n];
    const dx = c.x - a.x;
    const dz = c.y - a.y;
    const l = Math.hypot(dx, dz) || 1;
    const nx = dz / l;
    const nz = -dx / l;
    out.push({ nx, nz, d: nx * a.x + nz * a.y });
  }
  return out;
}

export class Piece {
  readonly id = nextId++;
  readonly foot: Poly;
  readonly y0: number;
  readonly y1: number;
  readonly b: number;
  readonly inset: Poly;
  readonly restVolume: number;
  readonly inradius: number;

  // Particles
  readonly n: number;
  readonly px: Float64Array; // rest (fruit space)
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly qx: Float64Array; // rest relative to rest centre
  readonly qy: Float64Array;
  readonly qz: Float64Array;
  readonly crx: number;
  readonly cry: number;
  readonly crz: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly vz: Float64Array;
  private aqqInv: M3;

  // Frame (updated by frame())
  q: Q4 = [0, 0, 0, 1];
  readonly R: M3 = m3();
  readonly G: M3 = m3();
  cx = 0;
  cy = 0;
  cz = 0;
  vcx = 0;
  vcy = 0;
  vcz = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  radius = 0;
  volumeRatio = 1;
  /** How far the surface is from its goal shape (cm, mean). */
  wobble = 0;

  // Collision planes (rest space): inset prism, and the outer prism for picking.
  readonly insetPlanes: Plane[];
  readonly outerPlanes: Plane[];

  // Mesh
  readonly restPos: Float32Array;
  readonly cap: Float32Array;
  readonly index: Uint32Array;
  readonly pos: Float32Array;
  private wIdx: Uint16Array;
  private wVal: Float32Array;

  // Interaction & character
  readonly grabs = new Map<number, Grab>();
  face: Face | null = null;
  faceX = 0;
  faceZ = 0;
  faceSize = 0;
  /** Strongest floor/wall impact this frame (cm/s). */
  impact = 0;
  onFloor = false;
  age = 0;
  /** Which fruit this jelly is (see fruits.ts). Kept through cuts. */
  fruit = 'watermelon';
  /** Size of the original fruit's cross-section texture (kept through cuts). */
  texR = WEDGE.radius;
  texH = WEDGE.height;

  constructor(foot: Poly, y0: number, y1: number, bevel = WEDGE.bevel) {
    this.foot = polyArea(foot) < 0 ? [...foot].reverse() : foot;
    this.y0 = y0;
    this.y1 = y1;
    this.inradius = inradius(this.foot);
    this.b = Math.max(0.12, Math.min(bevel, (y1 - y0) * 0.32, this.inradius * 0.45));
    this.inset = insetPolygon(this.foot, this.b);
    if (this.inset.length < 3) this.inset = insetPolygon(this.foot, this.b * 0.5);
    this.restVolume = Math.abs(polyArea(this.foot)) * (y1 - y0);

    // Particles: inset corners at two heights + the two cap centres.
    const Q = this.inset;
    const pick: number[] = [];
    if (Q.length <= MAX_FOOT_PARTICLES) for (let i = 0; i < Q.length; i++) pick.push(i);
    else for (let k = 0; k < MAX_FOOT_PARTICLES; k++) pick.push(Math.round((k * Q.length) / MAX_FOOT_PARTICLES) % Q.length);
    const lo = y0 + this.b;
    const hi = y1 - this.b;
    const cen = polyCentroid(Q);
    const pts: [number, number, number][] = [];
    for (const i of pick) pts.push([Q[i].x, lo, Q[i].y]);
    for (const i of pick) pts.push([Q[i].x, hi, Q[i].y]);
    pts.push([cen.x, lo, cen.y], [cen.x, hi, cen.y]);
    const n = pts.length;
    this.n = n;
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.pz = new Float64Array(n);
    this.qx = new Float64Array(n);
    this.qy = new Float64Array(n);
    this.qz = new Float64Array(n);
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.z = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.vz = new Float64Array(n);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    pts.forEach(([a, b, c], i) => {
      this.px[i] = a;
      this.py[i] = b;
      this.pz[i] = c;
      sx += a;
      sy += b;
      sz += c;
    });
    this.crx = sx / n;
    this.cry = sy / n;
    this.crz = sz / n;
    const Aqq = m3();
    for (let i = 0; i < n; i++) {
      const qx = (this.qx[i] = this.px[i] - this.crx);
      const qy = (this.qy[i] = this.py[i] - this.cry);
      const qz = (this.qz[i] = this.pz[i] - this.crz);
      Aqq[0] += qx * qx;
      Aqq[1] += qx * qy;
      Aqq[2] += qx * qz;
      Aqq[3] += qy * qx;
      Aqq[4] += qy * qy;
      Aqq[5] += qy * qz;
      Aqq[6] += qz * qx;
      Aqq[7] += qz * qy;
      Aqq[8] += qz * qz;
    }
    this.aqqInv = m3Inverse(Aqq);

    this.insetPlanes = [
      ...outwardNormals(Q).map((p) => ({ nx: p.nx, ny: 0, nz: p.nz, d: p.d })),
      { nx: 0, ny: 1, nz: 0, d: hi },
      { nx: 0, ny: -1, nz: 0, d: -lo },
    ];
    this.outerPlanes = [
      ...outwardNormals(this.foot).map((p) => ({ nx: p.nx, ny: 0, nz: p.nz, d: p.d })),
      { nx: 0, ny: 1, nz: 0, d: y1 },
      { nx: 0, ny: -1, nz: 0, d: -y0 },
    ];

    const mesh = buildMesh(Q, y0, y1, this.b);
    this.restPos = mesh.pos;
    this.cap = mesh.cap;
    this.index = mesh.index;
    this.pos = new Float32Array(mesh.pos.length);

    // Skin each vertex to its nearest particles (gaussian in rest space).
    const nv = mesh.pos.length / 3;
    this.wIdx = new Uint16Array(nv * K_WEIGHTS);
    this.wVal = new Float32Array(nv * K_WEIGHTS);
    let ext = 0;
    for (const p of this.foot) ext = Math.max(ext, Math.hypot(p.x - cen.x, p.y - cen.y));
    const sigma = Math.max(0.8, ext * 0.55);
    const ws = new Float64Array(n);
    const order = new Array<number>(n);
    for (let v = 0; v < nv; v++) {
      const vx = mesh.pos[v * 3];
      const vy = mesh.pos[v * 3 + 1];
      const vz = mesh.pos[v * 3 + 2];
      for (let j = 0; j < n; j++) {
        const d2 = (vx - this.px[j]) ** 2 + (vy - this.py[j]) ** 2 + (vz - this.pz[j]) ** 2;
        ws[j] = Math.exp(-d2 / (2 * sigma * sigma));
        order[j] = j;
      }
      order.sort((a, b) => ws[b] - ws[a]);
      let sum = 0;
      for (let k = 0; k < K_WEIGHTS; k++) sum += ws[order[k % n]];
      for (let k = 0; k < K_WEIGHTS; k++) {
        const j = order[k % n];
        this.wIdx[v * K_WEIGHTS + k] = j;
        this.wVal[v * K_WEIGHTS + k] = k < n ? ws[j] / (sum || 1) : 0;
      }
    }

    // Default placement: rest pose.
    for (let i = 0; i < n; i++) {
      this.x[i] = this.px[i];
      this.y[i] = this.py[i];
      this.z[i] = this.pz[i];
    }
    this.frame(0.3);
  }

  /** Mass in grams (jelly ≈ 1.05 g/cm³). */
  get mass() {
    return this.restVolume * 1.05;
  }

  /** Place this piece where `parent`'s goal shape has this bit of jelly. */
  placeFrom(parent: Piece) {
    const G = parent.G;
    this.q = [...parent.q] as Q4;
    for (let i = 0; i < this.n; i++) {
      const rx = this.px[i] - parent.crx;
      const ry = this.py[i] - parent.cry;
      const rz = this.pz[i] - parent.crz;
      const wx = parent.cx + G[0] * rx + G[1] * ry + G[2] * rz;
      const wy = parent.cy + G[3] * rx + G[4] * ry + G[5] * rz;
      const wz = parent.cz + G[6] * rx + G[7] * ry + G[8] * rz;
      this.x[i] = wx;
      this.y[i] = wy;
      this.z[i] = wz;
      const ox = wx - parent.cx;
      const oy = wy - parent.cy;
      const oz = wz - parent.cz;
      this.vx[i] = parent.vcx + parent.wy * oz - parent.wz * oy;
      this.vy[i] = parent.vcy + parent.wz * ox - parent.wx * oz;
      this.vz[i] = parent.vcz + parent.wx * oy - parent.wy * ox;
    }
    this.frame(0.3);
  }

  /** Rigidly move the rest pose to a world transform (yaw about y, then translate). */
  placeRest(yaw: number, tx: number, ty: number, tz: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let i = 0; i < this.n; i++) {
      const rx = this.px[i] - this.crx;
      const rz = this.pz[i] - this.crz;
      this.x[i] = tx + c * rx + s * rz;
      this.y[i] = ty + (this.py[i] - this.cry);
      this.z[i] = tz - s * rx + c * rz;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
    }
    this.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    this.frame(0.3);
  }

  private Apq = m3();
  private Aff = m3();
  /** Centre, rotation, goal transform G, rigid velocity. */
  frame(beta: number) {
    const { n, x, y, z, vx, vy, vz, qx, qy, qz } = this;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let vcx = 0;
    let vcy = 0;
    let vcz = 0;
    for (let i = 0; i < n; i++) {
      cx += x[i];
      cy += y[i];
      cz += z[i];
      vcx += vx[i];
      vcy += vy[i];
      vcz += vz[i];
    }
    cx /= n;
    cy /= n;
    cz /= n;
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.vcx = vcx / n;
    this.vcy = vcy / n;
    this.vcz = vcz / n;
    const A = this.Apq.fill(0);
    let rad = 0;
    // Angular momentum + inertia for the rigid part of the velocity.
    let Lx = 0;
    let Ly = 0;
    let Lz = 0;
    let i00 = 0;
    let i01 = 0;
    let i02 = 0;
    let i11 = 0;
    let i12 = 0;
    let i22 = 0;
    for (let i = 0; i < n; i++) {
      const rx = x[i] - cx;
      const ry = y[i] - cy;
      const rz = z[i] - cz;
      A[0] += rx * qx[i];
      A[1] += rx * qy[i];
      A[2] += rx * qz[i];
      A[3] += ry * qx[i];
      A[4] += ry * qy[i];
      A[5] += ry * qz[i];
      A[6] += rz * qx[i];
      A[7] += rz * qy[i];
      A[8] += rz * qz[i];
      rad = Math.max(rad, rx * rx + ry * ry + rz * rz);
      const ux = vx[i] - this.vcx;
      const uy = vy[i] - this.vcy;
      const uz = vz[i] - this.vcz;
      Lx += ry * uz - rz * uy;
      Ly += rz * ux - rx * uz;
      Lz += rx * uy - ry * ux;
      const r2 = rx * rx + ry * ry + rz * rz;
      i00 += r2 - rx * rx;
      i11 += r2 - ry * ry;
      i22 += r2 - rz * rz;
      i01 -= rx * ry;
      i02 -= rx * rz;
      i12 -= ry * rz;
    }
    this.radius = Math.sqrt(rad) + this.b;
    const I = this.Aff;
    I[0] = i00;
    I[1] = i01;
    I[2] = i02;
    I[3] = i01;
    I[4] = i11;
    I[5] = i12;
    I[6] = i02;
    I[7] = i12;
    I[8] = i22;
    const Ii = m3Inverse(I, tmpInv);
    this.wx = Ii[0] * Lx + Ii[1] * Ly + Ii[2] * Lz;
    this.wy = Ii[3] * Lx + Ii[4] * Ly + Ii[5] * Lz;
    this.wz = Ii[6] * Lx + Ii[7] * Ly + Ii[8] * Lz;

    this.q = extractRotation(A, this.q, 6);
    const R = quatToM3(this.q, this.R);
    const Af = m3Mul(A, this.aqqInv, this.Aff);
    const det = m3Det(Af);
    this.volumeRatio = det;
    const G = this.G;
    if (det > 0.05) {
      const s = 1 / Math.cbrt(det);
      for (let k = 0; k < 9; k++) G[k] = beta * Af[k] * s + (1 - beta) * R[k];
    } else {
      G.set(R);
    }
  }

  /** One sub-step of internal forces + integration. */
  step(h: number, p: PhysicsParams) {
    const held = this.grabs.size > 0;
    // While held, the jelly stays a bit firmer and settles faster, so it
    // follows your finger with a gentle wobble rather than a big slosh.
    this.frame(held ? Math.min(0.5, p.beta + 0.08) : p.beta);
    if (this.volumeRatio < 0.3) this.recover();
    const { n, x, y, z, vx, vy, vz, qx, qy, qz, G } = this;
    const k = p.stiffness * (held ? 0.9 : 1);
    const damp = Math.exp(-p.damping * (held ? 2.2 : 1) * h);
    const air = Math.exp(-0.05 * h);
    // Internal pressure: a squashed jelly pushes back out (keeps its volume).
    const press = this.volumeRatio > 0.3 ? PRESSURE * Math.max(-0.25, Math.min(0.3, 1 - this.volumeRatio)) * h : 0;
    let wob = 0;
    for (let i = 0; i < n; i++) {
      const gx = this.cx + G[0] * qx[i] + G[1] * qy[i] + G[2] * qz[i];
      const gy = this.cy + G[3] * qx[i] + G[4] * qy[i] + G[5] * qz[i];
      const gz = this.cz + G[6] * qx[i] + G[7] * qy[i] + G[8] * qz[i];
      const dx = gx - x[i];
      const dy = gy - y[i];
      const dz = gz - z[i];
      wob += Math.sqrt(dx * dx + dy * dy + dz * dz);
      vx[i] += dx * k * h + (x[i] - this.cx) * press;
      vy[i] += dy * k * h + (y[i] - this.cy) * press - p.gravity * h;
      vz[i] += dz * k * h + (z[i] - this.cz) * press;
      // Damp only the wobble — never the flight or the spin.
      const rx = x[i] - this.cx;
      const ry = y[i] - this.cy;
      const rz = z[i] - this.cz;
      const ux = this.vcx + this.wy * rz - this.wz * ry;
      const uy = this.vcy + this.wz * rx - this.wx * rz;
      const uz = this.vcz + this.wx * ry - this.wy * rx;
      vx[i] = (ux + (vx[i] - ux) * damp) * air;
      vy[i] = (uy + (vy[i] - uy) * damp) * air;
      vz[i] = (uz + (vz[i] - uz) * damp) * air;
    }
    this.wobble = wob / n;
    if (this.onFloor && this.volumeRatio > 0.6) {
      // Resting on the floor, the jelly carries its own weight internally
      // (upper particles held up, lower ones pressed down; net force zero),
      // so it keeps its shape instead of slumping. Off in flight.
      let a = 0;
      for (let i = 0; i < n; i++) a += Math.abs(y[i] - this.cy);
      a = Math.max(0.2, a / n);
      const gs = (p.gravity * h) / a;
      for (let i = 0; i < n; i++) vy[i] += (y[i] - this.cy) * gs;
    }
    for (const g of this.grabs.values()) {
      for (let i = 0; i < n; i++) {
        const w = g.w[i];
        if (w < 0.02) continue;
        vx[i] += ((g.tx[i] - x[i]) * 1300 - vx[i] * 42) * w * h;
        vy[i] += ((g.ty[i] - y[i]) * 1300 - vy[i] * 42) * w * h;
        vz[i] += ((g.tz[i] - z[i]) * 1300 - vz[i] * 42) * w * h;
      }
    }
    for (let i = 0; i < n; i++) {
      x[i] += vx[i] * h;
      y[i] += vy[i] * h;
      z[i] += vz[i] * h;
    }
  }

  /** Crushed flat or turned inside-out: pop back into shape around the centre. */
  private recover() {
    const R = this.R;
    for (let i = 0; i < this.n; i++) {
      const qx = this.qx[i];
      const qy = this.qy[i];
      const qz = this.qz[i];
      this.x[i] = this.cx + R[0] * qx + R[1] * qy + R[2] * qz;
      this.y[i] = Math.max(this.b, this.cy + R[3] * qx + R[4] * qy + R[5] * qz);
      this.z[i] = this.cz + R[6] * qx + R[7] * qy + R[8] * qz;
      this.vx[i] = this.vcx;
      this.vy[i] = Math.max(0, this.vcy);
      this.vz[i] = this.vcz;
    }
    this.frame(0);
  }

  /** Floor (y = 0) and invisible walls. Each particle is a sphere of radius b. */
  collideBounds(bd: Bounds, friction: number) {
    const { n, x, y, z, vx, vy, vz, b } = this;
    this.onFloor = false;
    for (let i = 0; i < n; i++) {
      if (y[i] < b) {
        y[i] = b;
        this.onFloor = true;
        if (vy[i] < 0) {
          if (-vy[i] > this.impact) this.impact = -vy[i];
          vy[i] = vy[i] < -60 ? -vy[i] * 0.25 : 0;
          vx[i] *= friction;
          vz[i] *= friction;
        }
      }
      if (x[i] < bd.minX + b) {
        x[i] = bd.minX + b;
        if (vx[i] < 0) {
          this.impact = Math.max(this.impact, -vx[i] * 0.6);
          vx[i] = -vx[i] * 0.4;
        }
      } else if (x[i] > bd.maxX - b) {
        x[i] = bd.maxX - b;
        if (vx[i] > 0) {
          this.impact = Math.max(this.impact, vx[i] * 0.6);
          vx[i] = -vx[i] * 0.4;
        }
      }
      if (z[i] < bd.minZ + b) {
        z[i] = bd.minZ + b;
        if (vz[i] < 0) {
          this.impact = Math.max(this.impact, -vz[i] * 0.6);
          vz[i] = -vz[i] * 0.4;
        }
      } else if (z[i] > bd.maxZ - b) {
        z[i] = bd.maxZ - b;
        if (vz[i] > 0) {
          this.impact = Math.max(this.impact, vz[i] * 0.6);
          vz[i] = -vz[i] * 0.4;
        }
      }
    }
  }

  /** World → rest (rigid approximation). */
  toRest(wx: number, wy: number, wz: number): [number, number, number] {
    const R = this.R;
    const dx = wx - this.cx;
    const dy = wy - this.cy;
    const dz = wz - this.cz;
    return [
      R[0] * dx + R[3] * dy + R[6] * dz + this.crx,
      R[1] * dx + R[4] * dy + R[7] * dz + this.cry,
      R[2] * dx + R[5] * dy + R[8] * dz + this.crz,
    ];
  }

  /** Rest → world via the current goal transform. */
  toWorld(rx: number, ry: number, rz: number): [number, number, number] {
    const G = this.G;
    const ax = rx - this.crx;
    const ay = ry - this.cry;
    const az = rz - this.crz;
    return [
      this.cx + G[0] * ax + G[1] * ay + G[2] * az,
      this.cy + G[3] * ax + G[4] * ay + G[5] * az,
      this.cz + G[6] * ax + G[7] * ay + G[8] * az,
    ];
  }

  /** Ray (world) vs the outer rounded-ish prism. Returns distance or -1. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const R = this.R;
    const [lx, ly, lz] = this.toRest(ox, oy, oz);
    const ddx = R[0] * dx + R[3] * dy + R[6] * dz;
    const ddy = R[1] * dx + R[4] * dy + R[7] * dz;
    const ddz = R[2] * dx + R[5] * dy + R[8] * dz;
    let t0 = 0;
    let t1 = Infinity;
    for (const p of this.outerPlanes) {
      const num = p.d + 0.3 - (p.nx * lx + p.ny * ly + p.nz * lz);
      const den = p.nx * ddx + p.ny * ddy + p.nz * ddz;
      if (Math.abs(den) < 1e-9) {
        if (num < 0) return -1;
        continue;
      }
      const t = num / den;
      if (den < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return -1;
    }
    return t0;
  }

  /** Begin dragging by rest-space point (hx,hy,hz). */
  grab(id: number, hx: number, hy: number, hz: number) {
    const n = this.n;
    const w = new Float32Array(n);
    let ext = 0;
    for (const p of this.foot) ext = Math.max(ext, Math.hypot(p.x - this.crx, p.y - this.crz));
    const sigma = Math.max(0.9, ext * 0.45);
    let max = 0;
    for (let i = 0; i < n; i++) {
      const d2 = (this.px[i] - hx) ** 2 + (this.py[i] - hy) ** 2 + (this.pz[i] - hz) ** 2;
      w[i] = Math.exp(-d2 / (2 * sigma * sigma));
      max = Math.max(max, w[i]);
    }
    for (let i = 0; i < n; i++) w[i] = (w[i] / (max || 1)) * 0.95;
    const g: Grab = {
      w,
      tx: new Float32Array(n),
      ty: new Float32Array(n),
      tz: new Float32Array(n),
      hx,
      hy,
      hz,
      R0: new Float64Array(this.R),
      twist: 0,
    };
    this.grabs.set(id, g);
    return g;
  }

  /** Move a grab's finger point (world) — targets keep the grabbed pose. */
  moveGrab(id: number, fx: number, fy: number, fz: number) {
    const g = this.grabs.get(id);
    if (!g) return;
    const c = Math.cos(g.twist);
    const s = Math.sin(g.twist);
    const R = g.R0;
    for (let i = 0; i < this.n; i++) {
      const ax = this.px[i] - g.hx;
      const ay = this.py[i] - g.hy;
      const az = this.pz[i] - g.hz;
      const wx = R[0] * ax + R[1] * ay + R[2] * az;
      const wy = R[3] * ax + R[4] * ay + R[5] * az;
      const wz = R[6] * ax + R[7] * ay + R[8] * az;
      // twist about the world up axis
      g.tx[i] = fx + c * wx + s * wz;
      g.ty[i] = Math.max(this.b, fy + wy);
      g.tz[i] = fz - s * wx + c * wz;
    }
  }

  /** Cut by a world plane n·p = d (n horizontal). Returns two new pieces or null. */
  split(nx: number, ny: number, nz: number, d: number, minVolume: number): Piece[] | null {
    const R = this.R;
    // Plane in rest space: (Rᵀn)·q = d − n·c + (Rᵀn)·cr
    const rnx = R[0] * nx + R[3] * ny + R[6] * nz;
    const rny = R[1] * nx + R[4] * ny + R[7] * nz;
    const rnz = R[2] * nx + R[5] * ny + R[8] * nz;
    const dr = d - (nx * this.cx + ny * this.cy + nz * this.cz) + rnx * this.crx + rny * this.cry + rnz * this.crz;
    let a: Piece;
    let b: Piece;
    if (Math.abs(rny) < 0.7) {
      // A vertical cut through the prism: split the footprint.
      const l = Math.hypot(rnx, rnz);
      const ymid = (this.y0 + this.y1) / 2;
      const lx = rnx / l;
      const lz = rnz / l;
      const ld = (dr - rny * ymid) / l;
      const base = { pts: this.foot, skin: this.foot.map(() => false) };
      const A = clipHalfPlane(base, lx, lz, ld).pts;
      const B = clipHalfPlane(base, -lx, -lz, -ld).pts;
      if (A.length < 3 || B.length < 3) return null;
      const h = this.y1 - this.y0;
      if (Math.abs(polyArea(A)) * h < minVolume || Math.abs(polyArea(B)) * h < minVolume) return null;
      if (inradius(A) < 0.35 || inradius(B) < 0.35) return null;
      a = new Piece(A, this.y0, this.y1);
      b = new Piece(B, this.y0, this.y1);
    } else {
      // The piece is lying on its side: the cut slices it into two layers.
      const c = polyCentroid(this.foot);
      const yc = (dr - rnx * c.x - rnz * c.y) / rny;
      if (yc < this.y0 + 0.5 || yc > this.y1 - 0.5) return null;
      const area = Math.abs(polyArea(this.foot));
      if (area * (yc - this.y0) < minVolume || area * (this.y1 - yc) < minVolume) return null;
      a = new Piece(this.foot, this.y0, yc);
      b = new Piece(this.foot, yc, this.y1);
    }
    a.fruit = b.fruit = this.fruit;
    a.texR = b.texR = this.texR;
    a.texH = b.texH = this.texH;
    a.placeFrom(this);
    b.placeFrom(this);
    // Nudge the halves apart along the cut normal.
    for (const p of [a, b]) {
      const side = Math.sign(nx * p.cx + ny * p.cy + nz * p.cz - d) || 1;
      for (let i = 0; i < p.n; i++) {
        p.vx[i] += nx * side * 6;
        p.vy[i] += 10;
        p.vz[i] += nz * side * 6;
      }
    }
    return [a, b];
  }

  /** Deform the render mesh: goal transform + smoothly skinned wobble. */
  updateMesh() {
    const { n, G, restPos, pos, wIdx, wVal } = this;
    const devx = scratch(n, 0);
    const devy = scratch(n, 1);
    const devz = scratch(n, 2);
    for (let i = 0; i < n; i++) {
      const [gx, gy, gz] = this.toWorld(this.px[i], this.py[i], this.pz[i]);
      devx[i] = this.x[i] - gx;
      devy[i] = this.y[i] - gy;
      devz[i] = this.z[i] - gz;
    }
    const nv = restPos.length / 3;
    for (let v = 0; v < nv; v++) {
      const ax = restPos[v * 3] - this.crx;
      const ay = restPos[v * 3 + 1] - this.cry;
      const az = restPos[v * 3 + 2] - this.crz;
      let ox = this.cx + G[0] * ax + G[1] * ay + G[2] * az;
      let oy = this.cy + G[3] * ax + G[4] * ay + G[5] * az;
      let oz = this.cz + G[6] * ax + G[7] * ay + G[8] * az;
      for (let k = 0; k < K_WEIGHTS; k++) {
        const j = wIdx[v * K_WEIGHTS + k];
        const w = wVal[v * K_WEIGHTS + k];
        ox += devx[j] * w;
        oy += devy[j] * w;
        oz += devz[j] * w;
      }
      pos[v * 3] = ox;
      pos[v * 3 + 1] = oy;
      pos[v * 3 + 2] = oz;
    }
  }

  /** Kinetic energy in µJ (velocities in cm/s, mass in g). */
  kinetic() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2;
    const m = this.mass / 1000 / this.n; // kg per particle
    return 0.5 * m * s * 1e-4 * 1e6;
  }
}

const tmpInv = m3();
const scratchBufs: Float64Array[] = [];
function scratch(n: number, slot: number) {
  let b = scratchBufs[slot];
  if (!b || b.length < n) b = scratchBufs[slot] = new Float64Array(Math.max(64, n));
  return b;
}

/** Soft piece–piece contact: particles of A pushed out of B's rounded hull. */
export function collidePieces(A: Piece, B: Piece): number {
  const dx = A.cx - B.cx;
  const dy = A.cy - B.cy;
  const dz = A.cz - B.cz;
  const rr = A.radius + B.radius;
  if (dx * dx + dy * dy + dz * dz > rr * rr) return 0;
  return Math.max(pushOut(A, B), pushOut(B, A));
}

function pushOut(A: Piece, B: Piece) {
  let strongest = 0;
  // A little slack: soft jellies can press into each other slightly.
  const margin = (A.b + B.b) * 0.6;
  const R = B.R;
  const mp = A.mass / A.n;
  const kA = B.mass / (mp + B.mass);
  const kB = mp / (mp + B.mass);
  for (let i = 0; i < A.n; i++) {
    const [qx, qy, qz] = B.toRest(A.x[i], A.y[i], A.z[i]);
    let best = -Infinity;
    let bp: Plane | null = null;
    let inside = true;
    for (const p of B.insetPlanes) {
      const s = p.nx * qx + p.ny * qy + p.nz * qz - p.d - margin;
      if (s > 0) {
        inside = false;
        break;
      }
      if (s > best) {
        best = s;
        bp = p;
      }
    }
    if (!inside || !bp) continue;
    const depth = -best;
    const nx = R[0] * bp.nx + R[1] * bp.ny + R[2] * bp.nz;
    const ny = R[3] * bp.nx + R[4] * bp.ny + R[5] * bp.nz;
    const nz = R[6] * bp.nx + R[7] * bp.ny + R[8] * bp.nz;
    // A's particle vs B as a whole, shared by mass.
    const ka = depth * kA * 0.8;
    A.x[i] += nx * ka;
    A.y[i] += ny * ka;
    A.z[i] += nz * ka;
    const kb = depth * kB * 0.8;
    for (let j = 0; j < B.n; j++) {
      B.x[j] -= nx * kb;
      B.y[j] -= ny * kb;
      B.z[j] -= nz * kb;
    }
    const vn = (A.vx[i] - B.vcx) * nx + (A.vy[i] - B.vcy) * ny + (A.vz[i] - B.vcz) * nz;
    if (vn < 0) {
      const imp = -vn * 1.1;
      A.vx[i] += nx * imp * kA;
      A.vy[i] += ny * imp * kA;
      A.vz[i] += nz * imp * kA;
      for (let j = 0; j < B.n; j++) {
        B.vx[j] -= nx * imp * kB;
        B.vy[j] -= ny * imp * kB;
        B.vz[j] -= nz * imp * kB;
      }
      strongest = Math.max(strongest, -vn);
    }
  }
  return strongest;
}

/**
 * Rounded prism mesh: Minkowski sum of the inset prism and a sphere of radius
 * b, with subdivided flat faces so the surface can bend smoothly.
 */
function buildMesh(Q: Poly, y0: number, y1: number, b: number) {
  const m = Q.length;
  const norms = outwardNormals(Q);
  // Ring entries around the outline: base point + horizontal direction.
  const ring: { px: number; pz: number; nx: number; nz: number }[] = [];
  for (let i = 0; i < m; i++) {
    const prev = norms[(i - 1 + m) % m];
    const cur = norms[i];
    const a0 = Math.atan2(prev.nz, prev.nx);
    let da = Math.atan2(cur.nz, cur.nx) - a0;
    while (da < 0) da += Math.PI * 2;
    while (da >= Math.PI * 2) da -= Math.PI * 2;
    const steps = Math.max(1, Math.ceil(da / 0.32));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (da * s) / steps;
      ring.push({ px: Q[i].x, pz: Q[i].y, nx: Math.cos(a), nz: Math.sin(a) });
    }
    const nxt = Q[(i + 1) % m];
    const len = Math.hypot(nxt.x - Q[i].x, nxt.y - Q[i].y);
    const E = Math.max(1, Math.round(len / 0.75));
    for (let k = 1; k < E; k++) {
      const t = k / E;
      ring.push({ px: Q[i].x + (nxt.x - Q[i].x) * t, pz: Q[i].y + (nxt.y - Q[i].y) * t, nx: cur.nx, nz: cur.nz });
    }
  }
  const N = ring.length;
  const lo = y0 + b;
  const hi = y1 - b;
  const lats: { base: number; phi: number }[] = [];
  for (const phi of [-90, -60, -30, 0]) lats.push({ base: lo, phi: (phi * Math.PI) / 180 });
  const band = hi - lo;
  const bandSteps = Math.max(0, Math.round(band / 0.8) - 1);
  for (let k = 1; k <= bandSteps; k++) lats.push({ base: lo + (band * k) / (bandSteps + 1), phi: 0 });
  for (const phi of [0, 30, 60, 90]) lats.push({ base: hi, phi: (phi * Math.PI) / 180 });

  const pos: number[] = [];
  const cap: number[] = [];
  for (const { base, phi } of lats) {
    const cr = Math.cos(phi) * b;
    for (const e of ring) {
      pos.push(e.px + e.nx * cr, base + Math.sin(phi) * b, e.pz + e.nz * cr);
      cap.push(Math.sin(phi));
    }
  }
  const idx: number[] = [];
  const L = lats.length;
  for (let r = 0; r < L - 1; r++) {
    for (let j = 0; j < N; j++) {
      const a = r * N + j;
      const bq = r * N + ((j + 1) % N);
      const c = (r + 1) * N + j;
      const d = (r + 1) * N + ((j + 1) % N);
      idx.push(a, bq, d, a, d, c);
    }
  }
  // Caps: concentric rings toward the centroid, so they bend too.
  const cen = polyCentroid(Q);
  const addCap = (y: number, firstRing: number, sign: number) => {
    let prevStart = firstRing;
    for (const s of [0.68, 0.36]) {
      const start = pos.length / 3;
      for (const e of ring) {
        pos.push(cen.x + (e.px - cen.x) * s, y, cen.y + (e.pz - cen.y) * s);
        cap.push(sign);
      }
      for (let j = 0; j < N; j++) {
        const a = prevStart + j;
        const bq = prevStart + ((j + 1) % N);
        const c = start + j;
        const d = start + ((j + 1) % N);
        idx.push(a, bq, d, a, d, c);
      }
      prevStart = start;
    }
    const centre = pos.length / 3;
    pos.push(cen.x, y, cen.y);
    cap.push(sign);
    for (let j = 0; j < N; j++) idx.push(prevStart + j, prevStart + ((j + 1) % N), centre);
  };
  addCap(y1, (L - 1) * N, 1);
  addCap(y0, 0, -1);

  // Orient every triangle outward; drop degenerate ones (collapsed pole rings).
  const cx = cen.x;
  const cy = (y0 + y1) / 2;
  const cz = cen.y;
  const out: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t] * 3;
    const i1 = idx[t + 1] * 3;
    const i2 = idx[t + 2] * 3;
    const ux = pos[i1] - pos[i0];
    const uy = pos[i1 + 1] - pos[i0 + 1];
    const uz = pos[i1 + 2] - pos[i0 + 2];
    const vx = pos[i2] - pos[i0];
    const vy = pos[i2 + 1] - pos[i0 + 1];
    const vz = pos[i2 + 2] - pos[i0 + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz);
    if (area < 1e-7) continue;
    const mx = (pos[i0] + pos[i1] + pos[i2]) / 3 - cx;
    const my = (pos[i0 + 1] + pos[i1 + 1] + pos[i2 + 1]) / 3 - cy;
    const mz = (pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz >= 0) out.push(idx[t], idx[t + 1], idx[t + 2]);
    else out.push(idx[t], idx[t + 2], idx[t + 1]);
  }
  return { pos: new Float32Array(pos), cap: new Float32Array(cap), index: new Uint32Array(out) };
}
