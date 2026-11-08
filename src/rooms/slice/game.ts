import { deal } from '../../core/deck';
import { SLICE_CLOSE, SLICE_OVER, SLICE_PERFECT, SLICE_SHORT, SLICE_TIPS } from './words';
import { most } from './polyhedron';

/**
 * The rules of the slice room. Each fruit is an order: exactly so many
 * pieces, in at most so many knife strokes. Land on the number, or don't:
 * either way it falls apart and says how close you came. Nothing can be failed.
 */

export interface Order {
  cuts: number;
  target: number;
}

/** How many cuts an order gives, weighted toward the middle: 2 sometimes, 3–4 mostly, 6 now and then. */
const CUTS: [number, number][] = [
  [2, 1],
  [3, 3],
  [4, 3],
  [5, 2],
  [6, 1],
];

/**
 * A fresh order, every fruit: no levels, just a random number of cuts and a
 * count somewhere between easy and the most they could make, weighted toward
 * a fair challenge. It never repeats the last fruit's number of cuts, nor any
 * of the last few orders, so it keeps changing.
 */
export function orderFor(rnd = Math.random, recent: Order[] = []): Order {
  for (let tries = 0; ; tries++) {
    const total = CUTS.reduce((a, [, w]) => a + w, 0);
    let r = rnd() * total;
    let cuts = CUTS[CUTS.length - 1][0];
    for (const [c, w] of CUTS) {
      if ((r -= w) < 0) {
        cuts = c;
        break;
      }
    }
    // Anywhere from a little over half to all of the most, leaning to the middle.
    const k = 0.5 + ((rnd() + rnd()) / 2) * 0.5;
    const target = Math.min(most(cuts), Math.max(cuts + 1, Math.round(most(cuts) * k)));
    const o = { cuts, target };
    const last = recent[recent.length - 1];
    const stale = (last && last.cuts === cuts) || recent.slice(-5).some((p) => p.cuts === cuts && p.target === target);
    if (!stale || tries > 30) return o;
  }
}

/**
 * What the room says once it falls apart: a headline that changes every
 * time (see words), and a quieter line with how it went.
 */
export function verdict(pieces: number, target: number, rnd = Math.random): [string, string] {
  if (pieces === target) return [deal(SLICE_PERFECT, rnd), `${pieces} pieces`];
  const off = Math.abs(pieces - target);
  if (pieces > target) return [deal(SLICE_OVER, rnd), `${pieces} pieces · ${target} was the plan`];
  if (off === 1) return [deal(SLICE_CLOSE, rnd), `${pieces} of ${target} pieces`];
  return [deal(SLICE_SHORT, rnd), deal(SLICE_TIPS, rnd)];
}
