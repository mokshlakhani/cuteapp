import { clipHalfPlane, polyArea, segIntersect } from '../../core/geometry';
import type { Piece } from './Piece';

/**
 * Knife logic, kept free of three.js so it can be tested.
 *
 * A stroke from A to B on the table defines a vertical cutting plane. A piece
 * is cut when the stroke (stretched a little at both ends, like a real blade)
 * actually passes through its outline as seen from above, and the plane
 * leaves a real amount of jelly on both sides.
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

/** Does the (slightly extended) stroke pass through this piece? */
export function strokeHits(p: Piece, s: Stroke) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const ax = s.ax - ux * BLADE_OVERHANG;
  const az = s.az - uz * BLADE_OVERHANG;
  const bx = s.bx + ux * BLADE_OVERHANG;
  const bz = s.bz + uz * BLADE_OVERHANG;
  const o = worldOutline(p);
  let crossings = 0;
  for (let i = 0; i < o.length; i++) {
    const a = o[i];
    const b = o[(i + 1) % o.length];
    if (segIntersect(ax, az, bx, bz, a.x, a.z, b.x, b.z)) crossings++;
  }
  // The (extended) blade must cross the outline, or lie inside it.
  if (crossings === 0 && !insideOutline(o, (ax + bx) / 2, (az + bz) / 2)) return false;
  // Ignore pure grazes of a rounded corner: there must be real jelly on
  // both sides of the blade.
  const pl = strokePlane(s);
  const poly = { pts: o.map((q) => ({ x: q.x, y: q.z })), skin: o.map(() => false) };
  const A = clipHalfPlane(poly, pl.nx, pl.nz, pl.d).pts;
  const B = clipHalfPlane(poly, -pl.nx, -pl.nz, -pl.d).pts;
  return A.length > 2 && B.length > 2 && Math.abs(polyArea(A)) > MIN_SIDE_AREA && Math.abs(polyArea(B)) > MIN_SIDE_AREA;
}

/** Below this much footprint (cm²) on one side, the blade only grazed it. */
const MIN_SIDE_AREA = 0.45;

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
