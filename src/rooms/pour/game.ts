import type { Verdict } from './Glass';
import type { Drink } from './drinks';

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

  /** How fast the jug pours, relative to the first glass. */
  get speed() {
    return 1 + Math.min(this.streak, SPEED_STEPS) * SPEED_STEP;
  }
}

/** A random drink, never the same one twice in a row. */
export function nextDrink(pool: readonly Drink[], prev: Drink | null, rnd = Math.random): Drink {
  const options = prev && pool.length > 1 ? pool.filter((d) => d.id !== prev.id) : pool;
  return options[Math.min(options.length - 1, Math.floor(rnd() * options.length))];
}

/** What the room says once a glass is judged: a headline and a quieter line. */
export function feedback(v: Verdict, level: number, line: number, streak: number, rnd = Math.random): [string, string] {
  const pct = Math.round(Math.abs(level - line) * 100);
  switch (v) {
    case 'perfect': {
      const titles = ['perfect!', 'spot on!', 'right on the line!'];
      const title = titles[Math.floor(rnd() * titles.length)];
      return [title, streak >= 2 ? `${streak} in a row` : 'nice and steady'];
    }
    case 'under':
      return [pct <= 8 ? 'so close!' : 'a bit short', `${pct}% under the line`];
    case 'over':
      return ['a little too much', `${pct}% over the line`];
    case 'spilled':
      return ['whoops, it spilled', 'stop a little sooner'];
  }
}
