import type { Vec } from './math';

/** Polygon helpers shared by the melon burst and the jelly knife. */

export type Poly = Vec[];

export function polyArea(p: Poly) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return a / 2;
}

export function polyCentroid(p: Poly): Vec {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const j = (i + 1) % n;
    const cr = p[i].x * p[j].y - p[j].x * p[i].y;
    a += cr;
    cx += (p[i].x + p[j].x) * cr;
    cy += (p[i].y + p[j].y) * cr;
  }
  if (Math.abs(a) < 1e-9) {
    // Degenerate: fall back to the vertex average.
    let x = 0;
    let y = 0;
    for (const v of p) {
      x += v.x;
      y += v.y;
    }
    return { x: x / p.length, y: y / p.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function pointInPoly(x: number, y: number, xs: ArrayLike<number>, ys: ArrayLike<number>, n: number) {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ys[i];
    const yj = ys[j];
    if (yi > y !== yj > y) {
      const xi = xs[i];
      const xj = xs[j];
      if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Segment–segment intersection. Returns params (t along AB, u along CD)
 * or null when they don't cross.
 */
export function segIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** A polygon whose edges remember whether they lie on the original skin. */
export interface FlaggedPoly {
  pts: Poly;
  /** skin[i] — is the edge from pts[i] to pts[i+1] part of the outer skin? */
  skin: boolean[];
}

/**
 * Sutherland–Hodgman clip of a flagged polygon against the half-plane
 * n·p <= c. New edges created along the clip line are marked as not-skin.
 */
export function clipHalfPlane(poly: FlaggedPoly, nx: number, ny: number, c: number): FlaggedPoly {
  const { pts, skin } = poly;
  const outPts: Poly = [];
  const inFlag: boolean[] = []; // flag of the edge arriving at each output vertex
  const n = pts.length;
  if (!n) return { pts: [], skin: [] };
  const inside = (p: Vec) => nx * p.x + ny * p.y <= c;
  for (let i = 0; i < n; i++) {
    const S = pts[i];
    const E = pts[(i + 1) % n];
    const f = skin[i];
    const sIn = inside(S);
    const eIn = inside(E);
    if (sIn && eIn) {
      outPts.push(E);
      inFlag.push(f);
    } else if (sIn && !eIn) {
      outPts.push(lerpTo(S, E, nx, ny, c));
      inFlag.push(f);
    } else if (!sIn && eIn) {
      outPts.push(lerpTo(S, E, nx, ny, c));
      inFlag.push(false);
      outPts.push(E);
      inFlag.push(f);
    }
  }
  const m = outPts.length;
  const outSkin: boolean[] = new Array(m);
  for (let k = 0; k < m; k++) outSkin[k] = inFlag[(k + 1) % m];
  return { pts: outPts, skin: outSkin };
}

function lerpTo(S: Vec, E: Vec, nx: number, ny: number, c: number): Vec {
  const ds = nx * S.x + ny * S.y - c;
  const de = nx * E.x + ny * E.y - c;
  const t = ds / (ds - de);
  return { x: S.x + (E.x - S.x) * t, y: S.y + (E.y - S.y) * t };
}

/** Voronoi cells of `seeds`, clipped to `shape`. Skin edges are tracked. */
export function voronoiCells(shape: Poly, seeds: Vec[]): FlaggedPoly[] {
  const base: FlaggedPoly = { pts: shape, skin: shape.map(() => true) };
  return seeds.map((s, i) => {
    let cell = base;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j || cell.pts.length < 3) continue;
      const o = seeds[j];
      // Keep points closer to s than to o: (o - s)·p <= (|o|² - |s|²)/2
      const nx = o.x - s.x;
      const ny = o.y - s.y;
      const c = (o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y) / 2;
      cell = clipHalfPlane(cell, nx, ny, c);
    }
    return cell;
  });
}

/**
 * Resample a closed polyline to `n` points evenly spaced along its perimeter.
 * Per-edge flags are carried to the new points (flag of the edge they sit on).
 */
export function resampleClosed(pts: Poly, flags: boolean[], n: number) {
  const m = pts.length;
  const segLen: number[] = new Array(m);
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    segLen[i] = Math.hypot(b.x - a.x, b.y - a.y);
    total += segLen[i];
  }
  const out: Poly = [];
  const outFlags: boolean[] = [];
  const step = total / n;
  let seg = 0;
  let acc = 0; // length consumed before current seg
  for (let k = 0; k < n; k++) {
    const d = k * step;
    while (seg < m - 1 && acc + segLen[seg] < d) {
      acc += segLen[seg];
      seg++;
    }
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    const t = segLen[seg] > 0 ? (d - acc) / segLen[seg] : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    outFlags.push(flags[seg]);
  }
  return { pts: out, flags: outFlags, perimeter: total };
}
