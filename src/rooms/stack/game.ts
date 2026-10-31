/**
 * The rules of the stack room, kept free of three.js so they can be tested.
 * Stones are stacked one at a time, each with a flat seat on top and under it.
 * A stone stays where it lands so long as, at every join in the tower, the
 * weight of everything above sits over the part of the join that touches.
 * Otherwise what's above that join tips off. There's no physics engine here:
 * the tower is always exactly what these rules say, so it can't jitter, and
 * tumbling stones just leave. There's no goal: stack as high as you can until
 * a stone tips, and try to beat your own high score.
 */

import { bestStore } from '../../core/best';

export interface Stone {
  /** Half its width and half its height. */
  a: number;
  b: number;
  /** How far its flat seat reaches from its middle. */
  seat: number;
  /** How far its weight sits from its middle (a lopsided stone). */
  bias: number;
  /** How boxy its outline is (2 an ellipse, more a flatter pebble). */
  round: number;
  /** A colour, by index. */
  tone: number;
  seed: number;
}

export interface Placed {
  stone: Stone;
  /** Its middle, on the unswayed tower. */
  x: number;
  y: number;
  /** A slight lean as it nestles (radians). */
  lean: number;
}

export interface Landing {
  /** All of it stayed. */
  stable: boolean;
  /** The lowest stone that tips off (the tower's length if none does). */
  from: number;
  /** How safely it stands, at its weakest join: 1 dead centre, 0 on the edge. */
  margin: number;
  /** Which way what tips goes. */
  side: number;
}

/** The table's top, and how far from the middle a stone can be set. */
export const TABLE_Y = 0.34;
export const REACH = 1.7;
const MAX_LEAN = 0.05;

/** Mass of a stone: as its volume. */
const mass = (s: Stone) => s.a * s.a * s.b;

/** How far a seat of this roundness reaches: where its outline has dropped 3% of its height. */
export const seatOf = (a: number, round: number) => a * Math.pow(1 - Math.pow(0.97, round), 1 / round);

/** A stone of this breadth and height. `lump` makes it lopsided. */
export function makeStone(a: number, b: number, round: number, lump: number, rnd = Math.random): Stone {
  const seat = seatOf(a, round);
  return { a, b, round, seat, bias: lump * seat * (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), tone: Math.floor(rnd() * 6) % 6, seed: rnd() * 100 };
}

/** The most lopsided a stone gets, as a share of its seat. */
const LUMP = 0.28;
/** No seat is narrower than this, so a tower of any stones can stand. */
const NARROWEST = 0.3;

/** Stones slowly get smaller and rounder over this many, and stay that way. */
const SETTLES = 30;

/** The stone at this height of a tower: a broad one first, then ever a little harder. */
export function stoneFor(n: number, rnd = Math.random): Stone {
  if (n === 0) return { ...makeStone(1.2, 0.36, 3.2, 0, rnd), bias: 0 };
  const k = Math.min(1, n / SETTLES);
  const r = rnd();
  const pebble = r < 0.2 + k * 0.25;
  const a = (pebble ? 0.72 + rnd() * 0.3 : 0.74 + rnd() * 0.56) * (1 - k * 0.14);
  const s = pebble ? makeStone(a, 0.34 + rnd() * 0.08, 2.5, LUMP, rnd) : makeStone(a, 0.28 + rnd() * 0.14, 2.7 + rnd() * 1.2, LUMP * 0.7, rnd);
  if (s.seat < NARROWEST) {
    s.a *= NARROWEST / s.seat;
    s.seat = NARROWEST;
  }
  return s;
}

/** How much the tower sways in a run (0 still, 1 breezy). */
export const swayFor = (rnd = Math.random) => 0.42 + rnd() * 0.24;

/** Where a stone rests on the tower, set down at x (its middle's height). */
export function restY(tower: Placed[], stone: Stone) {
  const top = tower[tower.length - 1];
  return top ? top.y + top.stone.b + stone.b - 0.012 : TABLE_Y + stone.b - 0.012;
}

/** The weight of the stones from `from` up: where it sits. */
function loadOver(tower: Placed[], from: number) {
  let m = 0;
  let mx = 0;
  for (let i = from; i < tower.length; i++) {
    const w = mass(tower[i].stone);
    m += w;
    mx += w * (tower[i].x + tower[i].stone.bias);
  }
  return mx / m;
}

/** Does the tower stand, with a stone just set on top? */
export function landing(tower: Placed[]): Landing {
  let margin = 1;
  for (let j = 1; j < tower.length; j++) {
    const lo = tower[j - 1];
    const up = tower[j];
    const left = Math.max(lo.x - lo.stone.seat, up.x - up.stone.seat);
    const right = Math.min(lo.x + lo.stone.seat, up.x + up.stone.seat);
    const com = loadOver(tower, j);
    if (right <= left || com < left || com > right) {
      // The touching part's middle, or the stone under it: what's above goes away from it.
      const mid = right > left ? (left + right) / 2 : lo.x;
      return { stable: false, from: j, margin: 0, side: com >= mid ? 1 : -1 };
    }
    const half = (right - left) / 2;
    margin = Math.min(margin, 1 - Math.abs(com - (left + right) / 2) / half);
  }
  return { stable: true, from: tower.length, margin, side: 0 };
}

/** The slight lean of a stone set at x on what's under it. */
export function leanOf(tower: Placed[], stone: Stone, x: number) {
  const top = tower[tower.length - 1];
  if (!top) return 0;
  const k = (x - top.x) / (top.stone.seat + stone.seat);
  return Math.max(-MAX_LEAN, Math.min(MAX_LEAN, -k * MAX_LEAN * 1.4));
}

/**
 * How far the stone at this level is pushed sideways by the sway, `t` seconds
 * in. It grows with the height at first, then holds, so a tall tower never
 * swings further than a hand can follow.
 */
export function swayAt(level: number, t: number, sway: number) {
  const h = level / 9;
  return sway * 0.9 * (1 - Math.exp(-h * h)) * Math.sin(t * 0.95) * (0.7 + 0.3 * Math.sin(t * 0.37));
}

/** What the room says when a run ends. */
export function verdict(height: number, best: number, beaten: boolean): [string, string] {
  const n = `${height} stone${height === 1 ? '' : 's'}`;
  if (beaten) return ['new high score', n];
  if (height === best) return ['just matched your best', n];
  return [n, `your best is ${best}`];
}

export const { load: loadBest, save: saveBest } = bestStore('softspot.stack.v1');
