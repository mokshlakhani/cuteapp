import { world } from '../../design/tokens';
import { SoftBody, collidePair } from './SoftBody';

export interface JellyEvents {
  /** A body hit the floor/walls. speed in px/s. */
  impact?(b: SoftBody, speed: number, x: number): void;
  /** Two bodies bumped into each other. */
  bump?(a: SoftBody, b: SoftBody, speed: number): void;
}

/**
 * A small box of jellies: integration, bounds, and soft-soft collisions.
 * Used by the jelly room and (tiny, silent) by its home-screen preview.
 */
export class JellyWorld {
  bodies: SoftBody[] = [];
  left = 0;
  top = 0;
  right = 400;
  floor = 600;
  gravity: number = world.gravity;
  substeps = 3;
  private bumpCooldown = new Map<string, number>();

  constructor(public events: JellyEvents = {}) {}

  add(b: SoftBody) {
    this.bodies.push(b);
    return b;
  }

  remove(b: SoftBody) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  bringToFront(b: SoftBody) {
    const i = this.bodies.indexOf(b);
    if (i >= 0 && i !== this.bodies.length - 1) {
      this.bodies.splice(i, 1);
      this.bodies.push(b);
    }
  }

  /** Topmost body under a point (with a little forgiveness around edges). */
  pick(x: number, y: number, slop = 14) {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.dying > 0) continue;
      if (b.contains(x, y)) return b;
    }
    let best: SoftBody | null = null;
    let bd = Infinity;
    for (const b of this.bodies) {
      if (b.dying > 0) continue;
      const d = Math.hypot(x - b.cx, y - b.cy) - b.R;
      if (d < slop && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  step(dt: number) {
    // A crowded room trades one sub-step for a steady frame rate.
    const steps = this.bodies.length > 14 ? Math.min(2, this.substeps) : this.substeps;
    const h = dt / steps;
    const bs = this.bodies;
    for (const b of bs) b.impact = 0;
    for (let s = 0; s < steps; s++) {
      for (const b of bs) {
        b.step(h, this.gravity);
        b.collideBounds(this.left, this.top, this.right, this.floor);
      }
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const sp = collidePair(bs[i], bs[j]);
          if (sp > 160 && this.events.bump) this.maybeBump(bs[i], bs[j], sp);
        }
      }
    }
    for (const b of bs) {
      b.computeFrame();
      b.age += dt;
      b.squish.update(dt);
      b.spawnPop.update(dt);
      b.face?.update(dt);
      if (b.impact > 0) this.events.impact?.(b, b.impact, b.impactX);
      if (b.dying > 0) b.dying = Math.min(1, b.dying + dt * 3.2);
    }
    // Defensive: a body that ever went non-finite is quietly removed.
    this.bodies = bs.filter((b) => b.dying < 1 && Number.isFinite(b.cx) && Number.isFinite(b.cy));
    for (const [k, v] of this.bumpCooldown) {
      if (v - dt <= 0) this.bumpCooldown.delete(k);
      else this.bumpCooldown.set(k, v - dt);
    }
  }

  private maybeBump(a: SoftBody, b: SoftBody, speed: number) {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (this.bumpCooldown.has(key)) return;
    this.bumpCooldown.set(key, 0.18);
    this.events.bump?.(a, b, speed);
  }
}
