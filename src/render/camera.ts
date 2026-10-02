import { noise1 } from '../core/math';

const reducedMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

/** Very subtle screen shake: smooth noise, quick decay, never jarring. */
export class Shake {
  private amp = 0;
  private t = 0;
  x = 0;
  y = 0;
  rot = 0;

  kick(amount: number) {
    if (reducedMotion) return;
    this.amp = Math.min(10, Math.max(this.amp, amount));
  }

  update(dt: number) {
    this.t += dt;
    this.amp *= Math.exp(-dt * 7);
    if (this.amp < 0.05) this.amp = 0;
    const f = 22;
    this.x = noise1(this.t * f, 1) * this.amp;
    this.y = noise1(this.t * f, 2) * this.amp;
    this.rot = noise1(this.t * f * 0.7, 3) * this.amp * 0.0016;
  }

  apply(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    if (!this.amp) return;
    ctx.translate(cx + this.x, cy + this.y);
    ctx.rotate(this.rot);
    ctx.translate(-cx, -cy);
  }
}
