/**
 * Convex polyhedra, cut by planes: the maths behind the slice room, kept
 * free of three.js so it can be tested.
 *
 * A whole fruit starts as an ellipsoid tessellated into flat faces (a UV
 * sphere stretched to the fruit's radii, whose quads stay planar). Every
 * plane splits each piece it passes through in two, and the flat cap it
 * leaves is marked as a cut face. All points stay in the fruit's own space,
 * so a piece always knows where in the fruit it came from.
 */

export type V3 = [number, number, number];

export interface Facet {
  pts: V3[];
  /** A flat cut face (flesh), not the fruit's skin. */
  cut: boolean;
  /** Which cut made it (0, 1, 2…), for a cut face. */
  plane?: number;
}

export interface Poly {
  faces: Facet[];
}

export interface Plane {
  n: V3;
  d: number;
}

const EPS = 1e-7;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * A fruit's outline, turned round its core (y): `e` rounds or squares it
 * (2 is an ellipse, more gives an apple's shoulders, less a lemon's points)
 * and `taper` makes it wider at the top (+) or the bottom (−).
 */
export interface Shape {
  e: number;
  taper: number;
}

export const ROUND: Shape = { e: 2, taper: 0 };

/** Distance from the core at height t (−1 bottom … 1 top), in units of the radius. */
export function profile(s: Shape, t: number) {
  const a = Math.min(1, Math.abs(t));
  return Math.pow(1 - Math.pow(a, s.e), 1 / s.e) * (1 + s.taper * t);
}

/**
 * How far out a point (in units of the radii) sits: 1 on the skin, less
 * inside. The same measure the material uses to lay skin, pith and flesh.
 */
export function shell(s: Shape, x: number, y: number, z: number) {
  const ax = Math.hypot(x, z) / Math.max(0.05, 1 + s.taper * y);
  return Math.pow(Math.pow(ax, s.e) + Math.pow(Math.abs(y), s.e), 1 / s.e);
}

/**
 * The skin's outward normal at a point (scene units): the slope of the shell
 * measure there, worked out in closed form (it's called for every corner of
 * every new piece, so it has to be quick).
 */
export function skinNormal(s: Shape, radii: V3, p: V3): V3 {
  const [rx, ry, rz] = radii;
  const x = p[0] / rx;
  const y = p[1] / ry;
  const z = p[2] / rz;
  const w = Math.max(0.05, 1 + s.taper * y);
  const ax = Math.hypot(x, z);
  const ay = Math.abs(y);
  // shell^e = (ax / w)^e + |y|^e; differentiate and drop the common factors.
  const ae = ax > 1e-9 ? Math.pow(ax / w, s.e - 1) : 0;
  const gx = ax > 1e-9 ? (ae * x) / ax / w : 0;
  const gz = ax > 1e-9 ? (ae * z) / ax / w : 0;
  const gy = (-ae * ax * s.taper) / (w * w) + (ay > 1e-9 ? Math.pow(ay, s.e - 1) * Math.sign(y) : 0);
  const n = norm([gx / rx, gy / ry, gz / rz]);
  // Right at a tip the slope can vanish: point straight along the core.
  return Math.hypot(gx, gy, gz) > 1e-9 ? n : [0, Math.sign(p[1]) || 1, 0];
}

/** A point on the skin at polar angle th (0 top … π bottom) and turn ph. */
export function onSkin(s: Shape, radii: V3, th: number, ph: number): V3 {
  const t = Math.cos(th);
  const r = profile(s, t);
  return [r * Math.cos(ph) * radii[0], t * radii[1], r * Math.sin(ph) * radii[2]];
}

/** A fruit turned from its outline, as `lat` × `lon` flat faces (each a planar ring quad). */
export function revolve(s: Shape, rx: number, ry: number, rz: number, lat = 18, lon = 28): Poly {
  const radii: V3 = [rx, ry, rz];
  const at = (i: number, j: number) => onSkin(s, radii, (i / lat) * Math.PI, (j / lon) * Math.PI * 2);
  const faces: Facet[] = [];
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      // The rows at the poles close to a point: drop the repeated corner.
      const pts = q.filter((p, k) => k === 0 || Math.hypot(...sub(p, q[k - 1])) > 1e-9);
      if (Math.hypot(...sub(pts[0], pts[pts.length - 1])) < 1e-9) pts.pop();
      if (pts.length >= 3) faces.push({ pts, cut: false });
    }
  }
  return orient({ faces });
}

/** An ellipsoid with radii (rx, ry, rz), its axis along y, as `lat` × `lon` flat faces. */
export function ellipsoid(rx: number, ry: number, rz: number, lat = 18, lon = 28): Poly {
  return revolve(ROUND, rx, ry, rz, lat, lon);
}

/** How far a point lies outside a piece (≤ 0 inside): its largest distance past any face. */
export function outside(p: Poly, v: V3) {
  let d = -Infinity;
  for (const f of p.faces) d = Math.max(d, dot(faceNormal(f.pts), sub(v, f.pts[0])));
  return d;
}

/** Every distinct corner of a piece. */
export function corners(p: Poly): V3[] {
  const out: V3[] = [];
  const seen = new Set<string>();
  for (const f of p.faces) {
    for (const v of f.pts) {
      const k = `${v[0].toFixed(5)},${v[1].toFixed(5)},${v[2].toFixed(5)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Volume and centre of mass (by summing tetrahedra from the origin; faces wound outward). */
export function massProps(p: Poly) {
  let vol = 0;
  const c: V3 = [0, 0, 0];
  for (const f of p.faces) {
    const a = f.pts[0];
    for (let i = 1; i + 1 < f.pts.length; i++) {
      const b = f.pts[i];
      const d = f.pts[i + 1];
      const v = dot(a, cross(b, d)) / 6;
      vol += v;
      c[0] += (v * (a[0] + b[0] + d[0])) / 4;
      c[1] += (v * (a[1] + b[1] + d[1])) / 4;
      c[2] += (v * (a[2] + b[2] + d[2])) / 4;
    }
  }
  const s = vol || 1;
  return { volume: Math.abs(vol), centre: [c[0] / s, c[1] / s, c[2] / s] as V3 };
}

/** Wind every face outward (counter-clockwise seen from outside). */
export function orient(p: Poly): Poly {
  const inside = average(corners(p));
  for (const f of p.faces) {
    const n = faceNormal(f.pts);
    if (dot(n, sub(f.pts[0], inside)) < 0) f.pts.reverse();
  }
  return p;
}

export function faceNormal(pts: V3[]): V3 {
  // Newell's method: robust for any planar polygon.
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([x, y, z]);
}

function average(pts: V3[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0] / pts.length;
    c[1] += p[1] / pts.length;
    c[2] += p[2] / pts.length;
  }
  return c;
}

/** One polygon clipped to the side of the plane where n·p − d ≥ 0 (`sign` = 1) or ≤ 0 (−1). */
function clipFace(pts: V3[], pl: Plane, sign: number, onPlane: V3[]): V3[] {
  // Most faces are nowhere near the cut: keep them as they are (shared, never
  // changed afterwards) or drop them, without building anything.
  const ds = new Array<number>(pts.length);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = sign * (dot(pl.n, pts[i]) - pl.d);
    ds[i] = d;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  if (lo > EPS) return pts;
  if (hi < -EPS) return [];
  const out: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = ds[i];
    const db = ds[(i + 1) % pts.length];
    if (da >= -EPS) out.push(a);
    if (Math.abs(da) <= EPS) onPlane.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const q = lerp3(a, b, da / (da - db));
      out.push(q);
      onPlane.push(q);
    }
  }
  return out;
}

/** The convex cap through a set of points on the plane, in order round it. */
function capOf(points: V3[], pl: Plane): V3[] {
  if (points.length < 3) return [];
  const c = average(points);
  const u = norm(Math.abs(pl.n[0]) < 0.9 ? cross(pl.n, [1, 0, 0]) : cross(pl.n, [0, 1, 0]));
  const v = cross(pl.n, u);
  const withAngle = points.map((p) => {
    const q = sub(p, c);
    return { p, a: Math.atan2(dot(q, v), dot(q, u)) };
  });
  withAngle.sort((x, y) => x.a - y.a);
  const out: V3[] = [];
  for (const { p } of withAngle) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(...sub(p, last)) > 1e-6) out.push(p);
  }
  if (out.length > 2 && Math.hypot(...sub(out[0], out[out.length - 1])) <= 1e-6) out.pop();
  return out.length >= 3 ? out : [];
}

function half(p: Poly, pl: Plane, sign: number, id: number): Poly | null {
  const faces: Facet[] = [];
  const onPlane: V3[] = [];
  for (const f of p.faces) {
    const pts = clipFace(f.pts, pl, sign, onPlane);
    if (pts.length >= 3) faces.push({ pts, cut: f.cut, plane: f.plane });
  }
  // Clipping keeps every face's winding, so only the new cap needs facing
  // out: it's wound round +n, and this half's outside is −n (sign 1) or +n.
  const cap = capOf(onPlane, pl);
  if (cap.length) faces.push({ pts: sign > 0 ? cap.reverse() : cap, cut: true, plane: id });
  return faces.length >= 4 ? { faces } : null;
}

/**
 * Split a piece by a plane. Returns both halves, or null if the plane
 * misses it (or would only shave off less than `minVolume`).
 */
export function split(p: Poly, pl: Plane, minVolume = 1e-6, id = -1): [Poly, Poly] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of p.faces) {
    for (const v of f.pts) {
      const s = dot(pl.n, v) - pl.d;
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
  }
  if (lo > -1e-5 || hi < 1e-5) return null;
  const a = half(p, pl, 1, id);
  const b = half(p, pl, -1, id);
  if (!a || !b) return null;
  if (massProps(a).volume < minVolume || massProps(b).volume < minVolume) return null;
  return [a, b];
}

/**
 * Cut every piece the plane passes through (`id` names the cut, so its faces
 * know where they came from). Returns the new set and how many were split.
 */
export function cutAll(pieces: Poly[], pl: Plane, minVolume = 1e-6, id = -1) {
  const out: Poly[] = [];
  let split_ = 0;
  for (const p of pieces) {
    const parts = split(p, pl, minVolume, id);
    if (parts) {
      out.push(...parts);
      split_++;
    } else out.push(p);
  }
  return { pieces: out, split: split_ };
}

/** The cuts that really pass through a piece (it has a face on them), as bits: cut i is bit i. */
export function cutMask(p: Poly) {
  let m = 0;
  for (const f of p.faces) if (f.cut && f.plane !== undefined && f.plane >= 0) m |= 1 << f.plane;
  return m;
}

/** The most pieces k flat cuts can make of a round fruit (the "cake numbers"). */
export const most = (k: number) => (k * k * k + 5 * k + 6) / 6;
