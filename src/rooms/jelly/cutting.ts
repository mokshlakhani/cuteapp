import { segIntersect } from '../../core/geometry';
import type { Piece } from './Piece';

/**
 * Knife logic, kept free of three.js so it can be tested.
 *
 * A stroke from A to B on the table defines a vertical cutting plane. The
 * blade is what cuts: the stroke stretched a little past both ends, and never
 * shorter than the knife's own edge, which is centred on the stroke. So
 * whatever the blade visibly comes down on is cut.
 *
 * If the line would leave too little jelly on one side (a graze of an edge,
 * the very tip), the cut slides inward to the thinnest slice that's still a
 * real piece. Only a piece too small to split anywhere along that line is
 * left whole — the knife bounces off it.
 */

export interface Stroke {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Extra blade length past each end of the drawn line (cm). */
export const BLADE_OVERHANG = 1.2;

/** The piece's outline on the table (world x/z), from its current goal shape. */
export function worldOutline(p: Piece) {
  const ym = (p.y0 + p.y1) / 2;
  return p.foot.map((q) => {
    const [x, , z] = p.toWorld(q.x, ym, q.y);
    return { x, z };
  });
}

/**
 * The part of the line the blade actually covers: the stroke plus overhang,
 * and at least `edgeHalf` either side of the stroke's middle.
 */
export function bladeSpan(s: Stroke, edgeHalf = 0): Stroke {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const half = Math.max(l / 2 + BLADE_OVERHANG, edgeHalf);
  const mx = (s.ax + s.bx) / 2;
  const mz = (s.az + s.bz) / 2;
  return { ax: mx - ux * half, az: mz - uz * half, bx: mx + ux * half, bz: mz + uz * half };
}

/** Does the blade (already spanned) pass through this piece seen from above? */
export function bladeTouches(p: Piece, blade: Stroke) {
  const o = worldOutline(p);
  for (let i = 0; i < o.length; i++) {
    const a = o[i];
    const b = o[(i + 1) % o.length];
    if (segIntersect(blade.ax, blade.az, blade.bx, blade.bz, a.x, a.z, b.x, b.z)) return true;
  }
  // Entirely inside a big piece.
  return insideOutline(o, (blade.ax + blade.bx) / 2, (blade.az + blade.bz) / 2);
}

/** Does the (slightly extended) stroke pass through this piece? */
export function strokeHits(p: Piece, s: Stroke, edgeHalf = 0) {
  return bladeTouches(p, bladeSpan(s, edgeHalf));
}

/**
 * Split a piece along a vertical plane n·p = d, sliding the plane inward if
 * the exact line would leave a crumb too small to be a piece. Returns the two
 * halves, or null if the piece is too small to split along this direction.
 */
export function cutPiece(p: Piece, plane: { nx: number; nz: number; d: number }, minVolume: number) {
  const exact = p.split(plane.nx, 0, plane.nz, plane.d, minVolume);
  if (exact) return exact;
  // Where the piece starts and ends along the cut normal.
  const o = worldOutline(p);
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of o) {
    const t = plane.nx * q.x + plane.nz * q.z;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  if (!(hi > lo)) return null;
  const mid = (lo + hi) / 2;
  // Start from the stroke's own position (clamped onto the piece) and step
  // toward the middle; the first line that works is the thinnest real slice.
  const from = Math.min(hi, Math.max(lo, plane.d));
  const STEPS = 12;
  for (let k = 1; k <= STEPS; k++) {
    const d = from + (mid - from) * (k / STEPS);
    const parts = p.split(plane.nx, 0, plane.nz, d, minVolume);
    if (parts) return parts;
  }
  return null;
}

function insideOutline(o: { x: number; z: number }[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    if (o[i].z > z !== o[j].z > z && x < ((o[j].x - o[i].x) * (z - o[i].z)) / (o[j].z - o[i].z) + o[i].x) inside = !inside;
  }
  return inside;
}

/** The cutting plane n·p = d for a stroke (n horizontal). */
export function strokePlane(s: Stroke) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l;
  const nz = dx / l;
  return { nx, nz, d: nx * s.ax + nz * s.az };
}
