import { deal } from '../../core/deck';
import { PEEL_CLOSE, PEEL_MESSY, PEEL_PERFECT, PEEL_PERFECT_SUBS, PEEL_TIPS } from './words';
/**
 * The rules of the peel room, kept free of three.js so they can be tested.
 * The peel comes off a fruit along one spiral from its crown to its base.
 * Your finger circling turns the fruit with it, a little further than the
 * finger goes (see GEAR). The strip wants a pace: a green zone on the pace meter, with red
 * either side. Too fast and it pulls tight; too slow and it sags under its
 * own weight. The green zone wanders as you go — quicker here, gentler there
 * — and narrows as the strip grows long, so you have to keep adjusting. Stay
 * in the red too long and the strip snaps, and a new one starts where it
 * stopped. A thinner strip wants a gentler pace. Lift your finger and the
 * peel waits for you. The whole fruit always comes clean, so nothing can be
 * failed: the fewer strips it took, the better.
 */

export interface Order {
  /** How many times the spiral goes round: more turns, a thinner strip. */
  turns: number;
  /** Where the green zone's wandering starts (two phases, radians); no two fruits wander alike. */
  wave?: [number, number];
}

/** How fast a strip can come away before it pulls tight (radians a second): thinner is weaker. */
export const limitFor = (turns: number) => 6.8 - 0.48 * turns;

/** The pace the green zone wanders round (radians a second): about a circle every two seconds or so. */
export const paceFor = (turns: number) => limitFor(turns) * 0.6;

/** The pace meter runs from standing still to this many times the strip's pace. */
export const METER_TOP = 2.2;

/**
 * The green zone, `s` of the way along the strip: the paces it's happy at.
 * Its middle wanders slowly between gentler and brisker as the peel goes
 * round, and it narrows from wide to snug as the strip grows long.
 */
export function windowAt(order: Order, s: number): { lo: number; hi: number } {
  const base = paceFor(order.turns);
  const [a, b] = order.wave ?? [0, 0];
  const mid = base * (1 + 0.18 * Math.sin(Math.PI * 2 * 1.1 * s + a) + 0.05 * Math.sin(Math.PI * 2 * 2.3 * s + b));
  const half = base * (0.5 - 0.13 * Math.min(1, Math.max(0, s)));
  return { lo: mid - half, hi: mid + half };
}

/** Where a pace sits against the green zone. */
export type Zone = 'slow' | 'good' | 'fast';

/** Where the spiral starts and ends, as angles down from the crown. */
export const SPIRAL = { from: 0.26, to: Math.PI - 0.24 };
/** Its longitude at the very start. */
export const START_LON = 0.72;

/**
 * In the red, the strip strains this much a second just past the edge, and
 * this much more the further into the red (per green zone's half-width): just
 * over the edge it snaps in about 2 s, well into the red in about 1 s.
 */
const RISE_EDGE = 0.5;
const RISE = 0.55;
/** Back in the green, the strain lets go this much a second. */
const EASE = 1.3;
/** After a snap, or putting your finger back down, this long before the strip can strain. */
const GRACE = 0.8;
/** The first bit of the strip is free: a moment to get going. */
const FREE = 0.05;
/**
 * The fruit turns this much further than the finger: each circle of the
 * finger is 1.25 turns of the fruit, so a whole peel takes 20% less finger
 * travel. The pace meter still reads the finger, so it feels the same.
 */
export const GEAR = 1.25;
/** How quickly the pace follows the finger (seconds): smooth enough that touch's jitter doesn't count. */
const LAG = 0.3;
/** The most turn a single frame counts, so a stall in input can't lurch. */
const MOST = 0.7;

/** Polar angle and longitude of the spiral, `s` of the way along it (0..1); `spin` is the way it winds (±1). */
export function spiralAt(s: number, turns: number, spin = 1) {
  return { th: SPIRAL.from + (SPIRAL.to - SPIRAL.from) * s, ph: START_LON + spin * Math.PI * 2 * turns * s };
}

/** A fresh order: never the same width of strip twice running. */
export function orderFor(rnd = Math.random, recent: Order[] = []): Order {
  for (let tries = 0; ; tries++) {
    const turns = 3 + Math.floor(rnd() * 4) % 4;
    const last = recent[recent.length - 1];
    if (!last || last.turns !== turns || tries > 30) return { turns, wave: [rnd() * Math.PI * 2, rnd() * Math.PI * 2] };
  }
}

/** A step of the peeling. */
export type Peeled = 'tore' | 'done' | null;

export class Peeler {
  /** How far along the spiral (0..1). */
  s = 0;
  /** How tight the strip is (0 slack, 1 snaps). */
  tension = 0;
  /** How fast it's going (radians a second), smoothed. */
  pace = 0;
  /** How many times it's snapped. */
  breaks = 0;
  private grace = 0;
  private holding = false;

  constructor(readonly order: Order) {}

  get limit() {
    return limitFor(this.order.turns);
  }

  /** The green zone right here. */
  get window() {
    return windowAt(this.order, this.s);
  }

  /** Where the pace is against the green zone. */
  get zone(): Zone {
    const { lo, hi } = this.window;
    return this.pace < lo ? 'slow' : this.pace > hi ? 'fast' : 'good';
  }

  /** Whether the strip can strain just now (not in a grace moment, nor at the very start). */
  get counting() {
    return this.holding && this.grace === 0 && this.s >= FREE;
  }

  get done() {
    return this.s >= 1;
  }

  /**
   * `turned`: radians the finger went round since the last step. `holding`:
   * whether a finger is on the fruit; without one, the peel waits (nothing
   * strains), and putting it back down gives a moment to get going again.
   */
  step(turned: number, dt: number, holding = true): Peeled {
    if (this.done || dt <= 0) return null;
    if (holding && !this.holding) this.grace = Math.max(this.grace, GRACE);
    this.holding = holding;
    const a = Math.min(MOST, Math.max(0, turned));
    this.pace += (a / dt - this.pace) * Math.min(1, dt / LAG);
    this.grace = Math.max(0, this.grace - dt);
    const { lo, hi } = this.window;
    const out = this.pace < lo ? lo - this.pace : this.pace > hi ? this.pace - hi : 0;
    if (out > 0 && this.counting) this.tension += (RISE_EDGE + (RISE * out) / ((hi - lo) / 2)) * dt;
    else this.tension = Math.max(0, this.tension - EASE * dt);
    this.s = Math.min(1, this.s + (a * GEAR) / (Math.PI * 2 * this.order.turns));
    if (this.s >= 1) {
      this.tension = 0;
      return 'done';
    }
    if (this.tension >= 1) {
      this.tension = 0;
      this.breaks++;
      this.grace = GRACE;
      return 'tore';
    }
    return null;
  }
}

/** Radians from `b` to `a`, the short way round. */
export function angleDelta(a: number, b: number) {
  const d = (a - b) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
}

/** What the room says once the fruit is clean: a headline that changes every time (see words), and how many strips. */
export function verdict(breaks: number, rnd = Math.random): [string, string] {
  if (breaks === 0) return [deal(PEEL_PERFECT, rnd), deal(PEEL_PERFECT_SUBS, rnd)];
  if (breaks === 1) return [deal(PEEL_CLOSE, rnd), 'two strips'];
  return [deal(PEEL_MESSY, rnd), `${breaks + 1} strips · ${deal(PEEL_TIPS, rnd)}`];
}
