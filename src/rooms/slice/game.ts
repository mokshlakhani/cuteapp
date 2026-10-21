import { most } from './polyhedron';

/**
 * The rules of the slice room. Each fruit is an order: exactly so many
 * pieces, in at most so many knife strokes. Land on the number and it falls
 * apart with three stars; one over or under is two; anything else, one.
 * Nothing can be failed, and the next fruit is a little harder. Your level
 * and stars are kept.
 */

export interface Order {
  level: number;
  cuts: number;
  target: number;
}

/** The first orders, gently harder; after these they're drawn at random. */
const LADDER: [number, number][] = [
  [2, 3],
  [2, 4],
  [3, 5],
  [3, 6],
  [3, 6],
  [4, 7],
  [4, 8],
  [5, 10],
  [4, 9],
  [5, 11],
];

export function orderFor(level: number, rnd = Math.random): Order {
  if (level <= LADDER.length) {
    const [cuts, target] = LADDER[level - 1];
    return { level, cuts, target };
  }
  const cuts = 3 + Math.floor(rnd() * 3);
  // About half the most there could be: crossing most cuts, not every one.
  const target = Math.round(most(cuts) * (0.48 + rnd() * 0.1));
  return { level, cuts, target };
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
  level: number;
  stars: number;
}

const KEY = 'softspot.slice.v1';

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const level = Number.isFinite(p.level) && p.level >= 1 ? Math.floor(p.level) : 1;
    const stars = Number.isFinite(p.stars) && p.stars >= 0 ? Math.floor(p.stars) : 0;
    return { level, stars };
  } catch {
    return { level: 1, stars: 0 };
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. */
  }
}
