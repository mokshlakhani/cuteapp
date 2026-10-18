import { segIntersect } from '../../core/geometry';
import type { Piece } from './Piece';

/**
 * Knife logic, kept free of three.js so it can be tested.
 *
 * A stroke from A to B on the table defines a vertical cutting plane, and the
 * cut lands exactly on it. Only pieces the stroke itself crosses are cut (with
 * a fingertip's slack past each end), never neighbours that merely sit under
 * the length of the blade.
 *
 * If the exact line would leave too little jelly on one side (a graze of an
 * edge), the cut may slide inward a little — at most `MAX_SLIDE` — to the
 * thinnest slice that's still a real piece. Past that the piece is left whole
 * rather than cut somewhere you didn't draw; a piece too small to split at
 * all makes the knife bounce off.
 */

export interface Stroke {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface CutPlane {
  nx: number;
  nz: number;
  d: number;
}

/** Slack past each end of the drawn line (cm): a finger stops a little short. */
export const BLADE_OVERHANG = 0.45;
/** Furthest a cut may slide in from the drawn line to avoid a sliver (cm). */
export const MAX_SLIDE = 0.5;

/** The piece's outline on the table (world x/z) at height `atY` of its rest shape (default: half way up). */
export function worldOutline(p: Piece, atY = (p.y0 + p.y1) / 2) {
  return p.foot.map((q) => {
    const [x, , z] = p.toWorld(q.x, atY, q.y);
    return { x, z };
  });
}

/** The world height of a piece's top face — what you see from above and draw across. */
export function topHeight(p: Piece) {
  let top = -Infinity;
  for (let i = 0; i < p.n; i++) top = Math.max(top, p.y[i]);
  return top + p.b;
}

/** The stroke stretched by `overhang` past both ends. */
export function bladeSpan(s: Stroke, overhang = BLADE_OVERHANG): Stroke {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l = Math.hypot(dx, dz) || 1;
  const ux = (dx / l) * overhang;
  const uz = (dz / l) * overhang;
  return { ax: s.ax - ux, az: s.az - uz, bx: s.bx + ux, bz: s.bz + uz };
}

/** Does this (already spanned) segment pass through the piece seen from above? */
export function bladeTouches(p: Piece, blade: Stroke) {
  const o = worldOutline(p);
  for (let i = 0; i < o.length; i++) {
    const a = o[i];
    const b = o[(i + 1) % o.length];
    if (segIntersect(blade.ax, blade.az, blade.bx, blade.bz, a.x, a.z, b.x, b.z)) return true;
  }
  // Drawn entirely inside a big piece.
  return insideOutline(o, (blade.ax + blade.bx) / 2, (blade.az + blade.bz) / 2);
}

/** Does the stroke (with a fingertip's slack) pass through this piece? */
export function strokeHits(p: Piece, s: Stroke) {
  return bladeTouches(p, bladeSpan(s));
}

/**
 * Split a piece along a vertical plane n·p = d. If the exact line would leave
 * a crumb too small to be a piece, the plane slides inward in small steps, up
 * to `maxSlide`. Returns the two halves, or null if it can't be cut near here.
 */
export function cutPiece(p: Piece, plane: CutPlane, minVolume: number, maxSlide = MAX_SLIDE) {
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
  // Step from the drawn line toward the piece's middle; the first line that
  // works is the thinnest real slice. Never further than `maxSlide`.
  const dir = Math.sign((lo + hi) / 2 - plane.d) || 1;
  const STEP = 0.05;
  for (let s = STEP; s <= maxSlide + 1e-9; s += STEP) {
    const parts = p.split(plane.nx, 0, plane.nz, plane.d + dir * s, minVolume);
    if (parts) return parts;
  }
  return null;
}

/** Could this piece be cut in this direction at all (through its middle)? */
function splitsAcross(p: Piece, plane: CutPlane, minVolume: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of worldOutline(p)) {
    const t = plane.nx * q.x + plane.nz * q.z;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return hi > lo && p.split(plane.nx, 0, plane.nz, (lo + hi) / 2, minVolume) !== null;
}

function insideOutline(o: { x: number; z: number }[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    if (o[i].z > z !== o[j].z > z && x < ((o[j].x - o[i].x) * (z - o[i].z)) / (o[j].z - o[i].z) + o[i].x) inside = !inside;
  }
  return inside;
}

/** The cutting plane n·p = d for a stroke (n horizontal). */
export function strokePlane(s: Stroke): CutPlane {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l;
  const nz = dx / l;
  return { nx, nz, d: nx * s.ax + nz * s.az };
}

export interface TableCut {
  /** Each piece that was cut, with its two halves. */
  cut: { piece: Piece; parts: Piece[] }[];
  /** Pieces too small to split along this line anywhere — the knife bounces off. */
  tooSmall: Piece[];
  /** Pieces the line only grazed, too near an edge to make a slice there. */
  grazed: Piece[];
  /** Pieces left whole only because the table is full. */
  full: Piece[];
}

/**
 * One chop across the table. `strokeFor` gives the stroke as drawn over each
 * piece (each piece's own top face, so the cut lands under the line you saw),
 * or null to leave that piece out. `room` is how many more pieces fit.
 */
export function cutTable(pieces: readonly Piece[], strokeFor: (p: Piece) => Stroke | null, minVolume: number, room: number): TableCut {
  const out: TableCut = { cut: [], tooSmall: [], grazed: [], full: [] };
  for (const p of pieces) {
    const s = strokeFor(p);
    if (!s || !strokeHits(p, s)) continue;
    if (room <= 0) {
      out.full.push(p);
      continue;
    }
    const plane = strokePlane(s);
    const parts = cutPiece(p, plane, minVolume);
    if (!parts) {
      (splitsAcross(p, plane, minVolume) ? out.grazed : out.tooSmall).push(p);
      continue;
    }
    out.cut.push({ piece: p, parts });
    room--;
  }
  return out;
}
