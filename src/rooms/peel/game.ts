/**
 * The rules of the peel room, kept free of three.js so they can be tested.
 * The peel comes off a fruit along one spiral from its crown to its base.
 * Your finger circling turns the fruit with it; each circle is one turn of
 * the spiral. There's one rule for what breaks a strip, and it's the same for
 * every fruit but for the strip's width: keep going faster than the strip can
 * take and it pulls tight, narrows at the knife, and snaps there. A wider
 * strip takes a brisker pace. Below that pace it never breaks, however long
 * it gets; a quick moment past it is forgiven. When it snaps, that strip drops
 * and a new one starts where it stopped. The whole fruit always comes clean,
 * so nothing can be failed. Stars for how few strips it took. Your stars are kept.
 */

export interface Order {
  /** How many times the spiral goes round: more turns, a thinner strip. */
  turns: number;
}

/** How fast a strip can come away before it pulls tight (radians a second): thinner is weaker. */
export const limitFor = (turns: number) => 6.8 - 0.48 * turns;

/** Where the spiral starts and ends, as angles down from the crown. */
export const SPIRAL = { from: 0.26, to: Math.PI - 0.24 };
/** Its longitude at the very start. */
export const START_LON = 0.72;

/** How fast tightness builds, per unit over the limit: half as fast again snaps in about 3/4 s. */
const RISE = 2.6;
const EASE = 1.2;
/** After a snap, this long before a new strip can tighten. */
const GRACE = 0.6;
/** How quickly the pace follows the finger (seconds). */
const LAG = 0.1;
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
    if (!last || last.turns !== turns || tries > 30) return { turns };
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

  constructor(readonly order: Order) {}

  get limit() {
    return limitFor(this.order.turns);
  }

  get done() {
    return this.s >= 1;
  }

  /** `turned`: radians the finger went round since the last step. */
  step(turned: number, dt: number): Peeled {
    if (this.done || dt <= 0) return null;
    const a = Math.min(MOST, Math.max(0, turned));
    this.pace += (a / dt - this.pace) * Math.min(1, dt / LAG);
    this.grace = Math.max(0, this.grace - dt);
    const over = this.pace / this.limit - 1;
    if (over > 0 && this.grace === 0) this.tension += over * RISE * dt;
    else this.tension = Math.max(0, this.tension - EASE * dt);
    this.s = Math.min(1, this.s + a / (Math.PI * 2 * this.order.turns));
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

/** Three for one unbroken strip, two for one snap, one otherwise. */
export function starsFor(breaks: number) {
  return breaks === 0 ? 3 : breaks === 1 ? 2 : 1;
}

export function verdict(breaks: number, rnd = Math.random): [string, string] {
  if (breaks === 0) return [['one long strip', 'not a single snap', 'beautifully peeled'][Math.floor(rnd() * 3) % 3], 'all in one piece'];
  if (breaks === 1) return ['nearly', 'two strips'];
  return ['all peeled', `${breaks + 1} strips, slow and steady next time`];
}
