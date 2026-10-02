import { springs } from './tokens';

/** Easing curves. All take t in [0,1]. */
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t: number, s = 1.7) => (s + 1) * t * t * t - s * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
};

export interface SpringConfig {
  stiffness: number;
  damping: number;
}

/**
 * A damped spring on one number. The workhorse of every wobble, squash and
 * settle in the app — so everything shares the same organic feel.
 */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  stiffness: number;
  damping: number;

  constructor(value = 0, config: SpringConfig = springs.soft) {
    this.value = value;
    this.target = value;
    this.stiffness = config.stiffness;
    this.damping = config.damping;
  }

  set config(c: SpringConfig) {
    this.stiffness = c.stiffness;
    this.damping = c.damping;
  }

  impulse(v: number) {
    this.velocity += v;
  }

  snap(v: number) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  update(dt: number) {
    // Sub-step for stability under frame hitches.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  get settled() {
    return Math.abs(this.value - this.target) < 1e-3 && Math.abs(this.velocity) < 1e-3;
  }
}

/** Simple time-based tween driven by the caller's clock. */
export class Tween {
  t = 0;
  constructor(
    public duration: number,
    public curve: (t: number) => number = ease.inOutCubic,
  ) {}
  update(dt: number) {
    this.t = Math.min(1, this.t + dt / this.duration);
    return this.value;
  }
  get value() {
    return this.curve(this.t);
  }
  get done() {
    return this.t >= 1;
  }
}
