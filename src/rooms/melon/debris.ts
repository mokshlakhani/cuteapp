import { Quaternion, Vector3 } from 'three';

/**
 * Flying bits after the melon bursts: rind shards, flesh chunks, juice
 * drops, seeds and loose bands. Each is a small rigid body that tumbles
 * through the air, bounces on the table, slides to a stop and settles
 * lying flat. No three.js scene here (only its maths), so it can be tested.
 */

export type BodyKind = 'shard' | 'chunk' | 'drop' | 'seed' | 'band';

export interface Body {
  kind: BodyKind;
  pos: Vector3;
  vel: Vector3;
  q: Quaternion;
  /** Angular velocity (rad/s, world axes). */
  w: Vector3;
  /** Height of its centre when lying on the table. */
  rest: number;
  /** Which local axis should point up (or down) once it lies still. */
  up: Vector3 | null;
  bounce: number;
  /** Has it touched the table yet, and has it stopped for good. */
  landed: boolean;
  settled: boolean;
  /** Drops vanish into a splat when they land. */
  dead: boolean;
  /** Size, for sounds and splats. */
  size: number;
  /** Table friction: low slides far, high stops quickly. */
  grip: number;
}

export interface DebrisEvents {
  /** First touch of the table (and later hard bounces). */
  land?(b: Body, speed: number): void;
}

const tmpQ = new Quaternion();
const tmpV = new Vector3();
const tmpU = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const IDENTITY = new Quaternion();

export class Debris {
  bodies: Body[] = [];
  gravity = 28;
  events: DebrisEvents = {};
  /** A soft rim round the mess (centre and radius on the table), so nothing flies off for good. */
  rim = { x: 0, z: 0, r: Infinity };

  add(b: Partial<Body> & { kind: BodyKind; pos: Vector3 }): Body {
    const body: Body = {
      vel: new Vector3(),
      q: new Quaternion(),
      w: new Vector3(),
      rest: 0.05,
      up: null,
      bounce: 0.3,
      landed: false,
      settled: false,
      dead: false,
      size: 0.2,
      grip: 4.5,
      ...b,
    };
    this.bodies.push(body);
    return body;
  }

  clear() {
    this.bodies = [];
  }

  /** Everything has stopped (or vanished). */
  get still() {
    return this.bodies.every((b) => b.settled || b.dead);
  }

  /** Give one body a nudge (a poke from a finger). */
  poke(b: Body, strength = 1) {
    b.settled = false;
    b.vel.y += 6 * strength;
    b.vel.x += (Math.random() - 0.5) * 3 * strength;
    b.vel.z += (Math.random() - 0.5) * 3 * strength;
    b.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14).multiplyScalar(strength);
  }

  step(dt: number) {
    for (const b of this.bodies) {
      if (b.settled || b.dead) continue;
      b.vel.y -= this.gravity * dt;
      // A little air drag keeps the flight soft.
      const drag = Math.exp(-0.25 * dt);
      b.vel.multiplyScalar(drag);
      b.pos.addScaledVector(b.vel, dt);
      const ox = b.pos.x - this.rim.x;
      const oz = b.pos.z - this.rim.z;
      const d = Math.hypot(ox, oz);
      if (d > this.rim.r) {
        // Back inside, with the outward part of its speed turned round softly.
        const nx = ox / d;
        const nz = oz / d;
        b.pos.x = this.rim.x + nx * this.rim.r;
        b.pos.z = this.rim.z + nz * this.rim.r;
        const vn = b.vel.x * nx + b.vel.z * nz;
        if (vn > 0) {
          b.vel.x -= 1.35 * vn * nx;
          b.vel.z -= 1.35 * vn * nz;
        }
      }
      // Spin: q ← q + ½ ω q dt
      const wl = b.w.length();
      if (wl > 1e-5) {
        tmpQ.setFromAxisAngle(tmpV.copy(b.w).divideScalar(wl), wl * dt);
        b.q.premultiply(tmpQ).normalize();
      }

      if (b.pos.y <= b.rest) {
        b.pos.y = b.rest;
        const impact = -b.vel.y;
        if (impact > 0) {
          if (!b.landed || impact > 3) this.events.land?.(b, impact);
          b.landed = true;
          if (b.kind === 'drop') {
            b.dead = true;
            continue;
          }
          b.vel.y = impact > 2.5 ? impact * b.bounce : 0;
          // Scuff against the table: slide less, spin less.
          b.vel.x *= 0.72;
          b.vel.z *= 0.72;
          b.w.multiplyScalar(0.6);
        }
        // Rolling and sliding friction while in contact.
        const k = Math.exp(-b.grip * dt);
        b.vel.x *= k;
        b.vel.z *= k;
        b.w.multiplyScalar(Math.exp(-5 * dt));
        // Lie down: turn toward resting flat on the table.
        let flat = true;
        if (b.up) {
          tmpU.copy(b.up).applyQuaternion(b.q);
          const target = tmpU.y >= 0 ? WORLD_UP : DOWN;
          tmpQ.setFromUnitVectors(tmpU, target);
          b.q.premultiply(IDENTITY.clone().slerp(tmpQ, 1 - Math.exp(-8 * dt))).normalize();
          flat = Math.abs(tmpU.y) > 0.985;
        }
        const slow = flat && Math.hypot(b.vel.x, b.vel.y, b.vel.z) < 0.08 && b.w.length() < 0.15;
        if (slow && b.vel.y === 0) {
          b.vel.set(0, 0, 0);
          b.w.set(0, 0, 0);
          b.settled = true;
        }
      }
    }
  }
}
