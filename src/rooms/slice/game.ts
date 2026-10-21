import { most } from './polyhedron';

/**
 * The rules of the slice room. Each fruit is an order: exactly so many
 * pieces, in at most so many knife strokes. Land on the number and it falls
 * apart with three stars; one over or under is two; anything else, one.
 * Nothing can be failed. Your stars are kept.
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
 * count well over half the most they could make (you'll need to cross most
 * of your cuts, and turn it between them).
 */
export function orderFor(rnd = Math.random): Order {
  const total = CUTS.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  let cuts = CUTS[CUTS.length - 1][0];
  for (const [c, w] of CUTS) {
    if ((r -= w) < 0) {
      cuts = c;
      break;
    }
  }
  const target = Math.min(most(cuts), Math.max(cuts + 1, Math.round(most(cuts) * (0.6 + rnd() * 0.2))));
  return { cuts, target };
}

/** Three for exactly the order, two for one piece off either way, one for trying. */
export function starsFor(pieces: number, target: number) {
  const off = Math.abs(pieces - target);
  return off === 0 ? 3 : off === 1 ? 2 : 1;
}

/** What the room says once it falls apart: a headline and a quieter line. */
export function verdict(pieces: number, target: number, rnd = Math.random): [string, string] {
  if (pieces === target) {
    const titles = ['exactly right', 'perfect slices', 'spot on'];
    return [titles[Math.floor(rnd() * titles.length)], `${pieces} pieces`];
  }
  const off = Math.abs(pieces - target);
  const n = `${off} piece${off === 1 ? '' : 's'}`;
  if (pieces > target) return [off === 1 ? 'one too many' : `${off} too many`, `aim for exactly ${target}`];
  if (off === 1) return ['so close', `${n} short`];
  return ['a good start', 'turn it, and cross the other cuts'];
}

export interface Progress {
  stars: number;
}

const KEY = 'softspot.slice.v1';

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const stars = Number.isFinite(p.stars) && p.stars >= 0 ? Math.floor(p.stars) : 0;
    return { stars };
  } catch {
    return { stars: 0 };
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. */
  }
}
