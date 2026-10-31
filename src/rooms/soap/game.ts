/**
 * The rules of the soap room, kept free of three.js so they can be tested.
 * Bubble after bubble, each with a size to blow it to. Sizes run from 0 (a
 * bubble just out of the wand) to 1 (as big as they come). Hold to blow, let
 * go at the ring. Grow it more than 8% past the ring and it pops by itself;
 * let go more than 7% short of it and it pops too. A word beside the bubble
 * says how it went. Every bubble that holds adds to a run, and a pop ends the
 * run: your longest is your high score.
 */

import { bestStore } from '../../core/best';

export type Pace = 'slow' | 'steady' | 'brisk' | 'gusty';

export interface Order {
  /** The size to blow to. */
  size: number;
  /** How the breath comes. */
  pace: Pace;
}

/** Smallest and largest sizes asked for. */
export const SIZE = { min: 0.25, max: 0.92 };
/** A bubble's radius (scene units), at size 0 and size 1. */
export const RADIUS = { min: 0.68, max: 1.86 };
/** Let go before this and it's only a puff. */
export const PUFF = 0.05;
/** Grown this far past the ring (a share of its radius), it pops by itself. */
export const OVER = 0.08;
/** Let go this far short of the ring (a share of its radius), it pops. */
export const UNDER = 0.07;
/** How near the ring counts as perfect, and as close: shares of its radius. */
export const NEAR = { exact: 0.025, close: 0.07 };

const PACES: Pace[] = ['slow', 'steady', 'steady', 'brisk', 'gusty'];

export const radiusOf = (size: number) => RADIUS.min + (RADIUS.max - RADIUS.min) * size;
const sizeOf = (radius: number) => (radius - RADIUS.min) / (RADIUS.max - RADIUS.min);

/**
 * How fast a bubble grows (size per second), `t` seconds into a breath. Bigger
 * bubbles grow faster, so the margin past the ring is about as long a moment at any size.
 */
export function rateAt(pace: Pace, t: number, size: number) {
  const k = radiusOf(size) / radiusOf(0.6);
  switch (pace) {
    case 'slow':
      return 0.2 * k;
    case 'steady':
      return 0.28 * k;
    case 'brisk':
      return 0.38 * k;
    case 'gusty':
      // Swells and eases, but never stops or goes backward.
      return 0.28 * k * (1 + 0.72 * Math.sin(t * 2.6 + 0.8));
  }
}

/** The size at which a bubble meant for `target` pops by itself. */
export const burstAt = (target: number) => sizeOf(radiusOf(target) * (1 + OVER));

/** How far past the ring it is, as a share of the ring's radius (negative: short of it). */
export const offBy = (size: number, target: number) => radiusOf(size) / radiusOf(target) - 1;

/** Let go at this size, is it too small to hold? */
export const tooSmall = (size: number, target: number) => offBy(size, target) < -UNDER;

/** A fresh bubble, never much like the last one. */
export function orderFor(rnd = Math.random, last?: Order): Order {
  for (let tries = 0; ; tries++) {
    const size = Math.round((SIZE.min + rnd() * (SIZE.max - SIZE.min)) * 100) / 100;
    const o: Order = { size, pace: PACES[Math.floor(rnd() * PACES.length) % PACES.length] };
    if (!last || Math.abs(last.size - size) >= 0.12 || tries > 30) return o;
  }
}

/** The word beside a bubble let go at `size`. */
export function callFor(size: number, target: number) {
  const off = offBy(size, target);
  if (Math.abs(off) <= NEAR.exact) return 'perfect';
  if (Math.abs(off) <= NEAR.close) return 'so close';
  return off < 0 ? 'too small' : 'a bit big';
}

/** Bubbles in a row, and the high score they're after. */
export class Run {
  count = 0;
  private from: number;
  private beaten = false;

  constructor(public best = 0) {
    this.from = best;
  }

  /** One more bubble. True the moment it beats a high score that was there to beat. */
  add() {
    this.count++;
    if (this.count <= this.best) return false;
    this.best = this.count;
    const first = !this.beaten && this.from > 0;
    this.beaten = true;
    return first;
  }

  /** It popped: back to nothing, and the high score stands. */
  end() {
    this.count = 0;
    this.from = this.best;
    this.beaten = false;
  }
}

export const { load: loadBest, save: saveBest } = bestStore('softspot.soap.v1');

/** How one bubble's film is laid down: no two look alike. */
export interface Film {
  /** Which family of colours it came from. */
  kind: number;
  /** Film thickness at its crown and its base, in nanometres: this sets the colours. */
  thin: number;
  thick: number;
  /** How fine its bands are, and how far they're stirred. */
  freq: number;
  warp: number;
  /** Which way is down for it: its bands lean over by this much, this way round. */
  lean: number;
  turn: number;
  /** The two little things reflected in it, on its near wall and its far one. */
  things: [number, number];
}

/** How many little things there are to reflect (see things.ts). */
export const THINGS = 10;

/**
 * Real films run through the same colours as they thicken, so the thickness a
 * bubble spans is what sets it apart: silver and gold when it's thin, magenta
 * and green in the middle, pale pink and mint when it's thick.
 */
const FILMS: [number, number][] = [
  [130, 480],
  [240, 620],
  [300, 800],
  [430, 760],
  [520, 1050],
  [160, 1000],
];

/** Two different little things, neither one seen in the last bubble. */
function thingsFor(rnd: () => number, last?: Film): [number, number] {
  const left = Array.from({ length: THINGS }, (_, i) => i).filter((i) => !last?.things.includes(i));
  const a = left.splice(Math.floor(rnd() * left.length) % left.length, 1)[0];
  return [a, left[Math.floor(rnd() * left.length) % left.length]];
}

/** A fresh film, never of the same family as the last. */
export function filmFor(rnd = Math.random, last?: Film): Film {
  let kind = Math.floor(rnd() * FILMS.length) % FILMS.length;
  if (last && kind === last.kind) kind = (kind + 1 + (Math.floor(rnd() * (FILMS.length - 1)) % (FILMS.length - 1))) % FILMS.length;
  const [thin, thick] = FILMS[kind];
  return { kind, thin: thin * (0.92 + rnd() * 0.16), thick: thick * (0.92 + rnd() * 0.16), freq: 1.5 + rnd() * 1.9, warp: 0.6 + rnd() * 1.1, lean: rnd() * 0.5, turn: rnd() * Math.PI * 2, things: thingsFor(rnd, last) };
}
