import { clamp, rand } from '../../core/math';

/** Columns in the little wave simulation across the drink's surface. */
export const WAVE_N = 24;
/** How close to the line counts as spot on (fraction of the glass's height). */
export const PERFECT = 0.04;
/** Quiet this long (s) after the last drop, with the foam gone, and it's judged. */
export const SETTLE = 0.6;
/** A trace of froth this thin doesn't hold up the verdict. */
const FOAM_OK = 0.03;
/** Foam that settles away each second, as a fraction of what's there. */
const FOAM_DECAY = 0.95;

/**
 * How a pour turned out once it's settled: right on the line, short of it,
 * past it, or so far past it that it ran over the rim.
 */
export type Verdict = 'perfect' | 'under' | 'over' | 'spilled';

export interface GlassEvents {
  /** Some ran over the rim. `foam` says whether it was froth or the drink. */
  spill?(amount: number, foam: boolean): void;
  verdict?(v: Verdict): void;
}

/**
 * The drink in a glass, in units of the glass's inside height: 0 is empty,
 * 1 is level with the rim. The liquid and the foam on it are tracked apart,
 * so fizzy drinks rise faster than they fill and settle back down.
 */
export class Glass {
  level = 0;
  foam = 0;
  /** Where the fill line is drawn. */
  line: number;
  /** Surface height offsets and their speeds (same units), left to right. */
  readonly h = new Float32Array(WAVE_N);
  readonly v = new Float32Array(WAVE_N);
  /** Seconds since the last drop landed. */
  quiet = 0;
  verdict: Verdict | null = null;
  events: GlassEvents = {};
  private spilledThisPour = false;

  constructor(
    /** Foam per unit poured (see Drink.foamy). */
    public foamy: number,
    line = Math.round(rand(0.5, 0.82) * 100) / 100,
  ) {
    this.line = line;
  }

  /** The very top of what's in the glass, foam included. */
  get top() {
    return this.level + this.foam;
  }

  /**
   * A drop of `vol` lands at `u` across the surface (0 = left wall, 1 = right)
   * moving at `speed` px/s. Faster pours make more foam and bigger ripples.
   */
  add(vol: number, u: number, speed: number) {
    this.level += vol;
    this.foam += vol * this.foamy * clamp(speed / 600, 0.4, 1.6);
    const i = Math.round(clamp(u, 0, 1) * (WAVE_N - 1));
    const kick = vol * speed * 0.3;
    this.v[i] -= kick;
    if (i > 0) this.v[i - 1] -= kick * 0.5;
    if (i < WAVE_N - 1) this.v[i + 1] -= kick * 0.5;
    this.quiet = 0;
    this.verdict = null;
  }

  /** A shove from the side (the glass sliding, a poke): the surface tips. */
  slosh(amount: number) {
    for (let i = 0; i < WAVE_N; i++) this.v[i] += amount * (i / (WAVE_N - 1) - 0.5);
  }

  /** Surface offset at `u` (0..1 across). */
  surface(u: number) {
    const x = clamp(u, 0, 1) * (WAVE_N - 1);
    const i = Math.min(WAVE_N - 2, Math.floor(x));
    const f = x - i;
    return this.h[i] * (1 - f) + this.h[i + 1] * f;
  }

  empty() {
    this.level = 0;
    this.foam = 0;
    this.h.fill(0);
    this.v.fill(0);
    this.quiet = 0;
    this.verdict = null;
    this.spilledThisPour = false;
  }

  step(dt: number) {
    // Foam pops away; a thin last bit goes quickly so it does finish.
    if (this.foam > 0) this.foam = Math.max(0, this.foam - this.foam * FOAM_DECAY * dt - 0.004 * dt);

    // Over the rim.
    if (this.level > 1) {
      const x = this.level - 1;
      this.level = 1;
      this.spilledThisPour = true;
      this.events.spill?.(x, false);
    }
    if (this.top > 1) {
      const x = this.top - 1;
      this.foam = Math.max(0, this.foam - x);
      this.spilledThisPour = true;
      this.events.spill?.(x, true);
    }

    // Ripples: a string of little springs, walls at both ends.
    const steps = Math.max(1, Math.ceil(dt * 240));
    const k = dt / steps;
    const { h, v } = this;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < WAVE_N; i++) {
        const l = h[i > 0 ? i - 1 : i];
        const r = h[i < WAVE_N - 1 ? i + 1 : i];
        v[i] += (2600 * (l + r - 2 * h[i]) - 30 * h[i]) * k;
        v[i] *= Math.exp(-2.6 * k);
      }
      for (let i = 0; i < WAVE_N; i++) h[i] = clamp(h[i] + v[i] * k, -0.06, 0.06);
    }

    // Settled: how did it go?
    this.quiet += dt;
    if (this.verdict === null && this.level > 0.04 && this.quiet > SETTLE && this.foam < FOAM_OK) {
      const d = this.level - this.line;
      this.verdict = this.spilledThisPour ? 'spilled' : Math.abs(d) <= PERFECT ? 'perfect' : d < 0 ? 'under' : 'over';
      this.spilledThisPour = false;
      this.events.verdict?.(this.verdict);
    }
  }
}
