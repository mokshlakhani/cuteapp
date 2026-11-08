import type { Verdict } from './Glass';
import type { Drink } from './drinks';
import {
  CLOSE_SUBS,
  CLOSE_TITLES,
  deal,
  OVER_SUBS,
  OVER_TITLES,
  PERFECT_SUBS,
  PERFECT_TITLES,
  SHORT_SUBS,
  SHORT_TITLES,
  SPILL_SUBS,
  SPILL_TITLES,
  STREAK_SUBS,
} from './words';

/** Each perfect pour in a row speeds the next one up by this much… */
const SPEED_STEP = 0.05;
/** …up to this many steps. */
const SPEED_STEPS = 12;

/**
 * The rules of the pour room: one pour per glass, and only a pour that
 * stops right on the line keeps the streak going. The best streak is kept.
 */
export class PourGame {
  streak = 0;
  /** Glasses of each drink poured so far this visit. */
  private served = new Map<string, number>();

  constructor(public best = 0) {}

  /** Score one glass. Returns whether the best streak just went up. */
  record(v: Verdict) {
    if (v !== 'perfect') {
      this.streak = 0;
      return false;
    }
    this.streak++;
    if (this.streak <= this.best) return false;
    this.best = this.streak;
    return true;
  }

  /** A glass of `id` is coming: how many came before it this visit. */
  serve(id: string) {
    const n = this.served.get(id) ?? 0;
    this.served.set(id, n + 1);
    return n;
  }

  /** How fast the jug pours, relative to the first glass. */
  get speed() {
    return 1 + Math.min(this.streak, SPEED_STEPS) * SPEED_STEP;
  }
}

/** Between glugs the pitcher still trickles this much (× its usual flow). */
export const GLUG_TRICKLE = 0.22;

/**
 * How hard a drink is coming out, × its usual flow, `held` seconds into a pour.
 * Thick drinks build up; drinks with glugs surge and ease. Over a pour each
 * still comes at about its usual flow, so no drink is just faster than another.
 */
export function flowFactor(d: Pick<Drink, 'flow' | 'ramp' | 'glug'>, held: number): number {
  let k = d.flow;
  if (d.ramp) k *= 0.3 + 1.0 * Math.min(1, held / d.ramp) ** 1.5;
  if (d.glug) {
    // A gulp, then a thin trickle while the pitcher catches its breath. The
    // trickle never stops, so the level always creeps on between gulps and
    // any line can be reached: wait out a glug, then let the trickle finish it.
    const s = Math.sin((held / d.glug) * Math.PI);
    k *= GLUG_TRICKLE + 2 * (1 - GLUG_TRICKLE) * s * s;
  }
  return k;
}

/** A random drink, never the same one twice in a row. */
export function nextDrink(pool: readonly Drink[], prev: Drink | null, rnd = Math.random): Drink {
  const options = prev && pool.length > 1 ? pool.filter((d) => d.id !== prev.id) : pool;
  return options[Math.min(options.length - 1, Math.floor(rnd() * options.length))];
}

/** What the room says once a glass is judged: a headline and a quieter line, different each time (see words). */
export function feedback(v: Verdict, level: number, line: number, streak: number, rnd = Math.random): [string, string] {
  const pct = Math.round(Math.abs(level - line) * 100);
  switch (v) {
    case 'perfect':
      return [deal(PERFECT_TITLES, rnd), streak >= 2 ? deal(STREAK_SUBS, rnd).replace('#', String(streak)) : deal(PERFECT_SUBS, rnd)];
    case 'under':
      return pct <= 8 ? [deal(CLOSE_TITLES, rnd), deal(CLOSE_SUBS, rnd)] : [deal(SHORT_TITLES, rnd), deal(SHORT_SUBS, rnd)];
    case 'over':
      return [deal(OVER_TITLES, rnd), deal(OVER_SUBS, rnd)];
    case 'spilled':
      return [deal(SPILL_TITLES, rnd), deal(SPILL_SUBS, rnd)];
  }
}
