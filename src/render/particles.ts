import { rgba } from '../core/color';
import { rand, TAU } from '../core/math';
import { world } from '../design/tokens';

/**
 * One particle language for the whole app:
 *  drop    – round juicy droplet, falls, leaves a small fading splat
 *  sparkle – soft four-point twinkle, floats
 *  puff    – soft expanding circle of air
 *  seed    – little teardrop that tumbles and settles
 *  bubble  – a floating bubble that rises gently
 */
export type ParticleKind = 'drop' | 'sparkle' | 'puff' | 'seed' | 'bubble';

interface P {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  maxLife: number;
  color: string;
  landed: boolean;
  alpha: number;
}

const MAX = 420;

export interface EmitOpts {
  kind: ParticleKind;
  x: number;
  y: number;
  count?: number;
  speed?: [number, number];
  /** Direction (radians) and spread; default all around. */
  angle?: number;
  spread?: number;
  size?: [number, number];
  life?: [number, number];
  color: string;
  vx?: number;
  vy?: number;
}

export class Particles {
  private list: P[] = [];
  floorY = Infinity;
  width = 0;

  emit(o: EmitOpts) {
    const n = o.count ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX) this.list.shift();
      const a = (o.angle ?? 0) + (o.spread == null ? rand(0, TAU) : rand(-o.spread / 2, o.spread / 2));
      const s = rand(...(o.speed ?? [50, 200]));
      const life = rand(...(o.life ?? [0.6, 1.2]));
      this.list.push({
        kind: o.kind,
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * s + (o.vx ?? 0),
        vy: Math.sin(a) * s + (o.vy ?? 0),
        r: rand(...(o.size ?? [3, 6])),
        rot: rand(0, TAU),
        vr: rand(-8, 8),
        life,
        maxLife: life,
        color: o.color,
        landed: false,
        alpha: 1,
      });
    }
  }

  get count() {
    return this.list.length;
  }

  clear() {
    this.list.length = 0;
  }

  update(dt: number) {
    const g = world.gravity;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      switch (p.kind) {
        case 'drop':
          if (!p.landed) {
            p.vy += g * 0.8 * dt;
            p.vx *= Math.exp(-0.6 * dt);
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.y > this.floorY - p.r * 0.3) {
              // Become a tiny splat that melts away.
              p.landed = true;
              p.y = this.floorY;
              p.life = Math.min(p.life + 0.6, 1.6);
              p.maxLife = p.life;
            }
          }
          break;
        case 'seed':
          p.vy += g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > this.floorY - p.r * 0.5) {
            p.y = this.floorY - p.r * 0.5;
            if (Math.abs(p.vy) > 60) {
              p.vy *= -0.35;
              p.vx *= 0.6;
              p.vr *= 0.5;
            } else {
              p.vy = 0;
              p.vx *= Math.exp(-10 * dt);
              p.vr *= Math.exp(-10 * dt);
              p.rot += (Math.round(p.rot / Math.PI) * Math.PI - p.rot) * Math.min(1, dt * 8);
            }
          }
          break;
        case 'sparkle':
          p.vx *= Math.exp(-3 * dt);
          p.vy *= Math.exp(-3 * dt);
          p.vy -= 20 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'puff':
          p.vx *= Math.exp(-5 * dt);
          p.vy *= Math.exp(-5 * dt);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'bubble':
          p.vy -= 30 * dt;
          p.vx += Math.sin(p.life * 6 + p.rot) * 20 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
      if (this.width) {
        if (p.x < p.r) {
          p.x = p.r;
          p.vx = Math.abs(p.vx) * 0.4;
        } else if (p.x > this.width - p.r) {
          p.x = this.width - p.r;
          p.vx = -Math.abs(p.vx) * 0.4;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const k = p.life / p.maxLife;
      switch (p.kind) {
        case 'drop': {
          if (p.landed) {
            const a = Math.min(1, k * 1.5) * 0.55;
            ctx.fillStyle = rgba(p.color, a);
            ctx.beginPath();
            ctx.ellipse(p.x, p.y + 1, p.r * (1.6 - k * 0.3), p.r * 0.45, 0, 0, TAU);
            ctx.fill();
          } else {
            const a = Math.min(1, k * 3) * 0.9;
            const sp = Math.hypot(p.vx, p.vy);
            const st = Math.min(1.8, 1 + sp / 900);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.fillStyle = rgba(p.color, a);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r * st, p.r / Math.sqrt(st), 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = rgba('#ffffff', a * 0.7);
            ctx.beginPath();
            ctx.arc(-p.r * 0.2, -p.r * 0.35, p.r * 0.32, 0, TAU);
            ctx.fill();
            ctx.restore();
          }
          break;
        }
        case 'seed': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 4);
          drawSeed(ctx, 0, 0, p.r, p.color);
          ctx.restore();
          break;
        }
        case 'sparkle': {
          const s = p.r * Math.sin(Math.PI * Math.min(1, (1 - k) * 1.2 + 0.05));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * 0.2);
          ctx.fillStyle = rgba(p.color, 0.9 * Math.min(1, k * 2));
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const rr = i % 2 === 0 ? s : s * 0.32;
            const a = (i / 8) * TAU;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'puff': {
          const r = p.r * (1 + (1 - k) * 1.6);
          ctx.fillStyle = rgba(p.color, 0.4 * k);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();
          break;
        }
        case 'bubble': {
          const a = Math.min(1, k * 2);
          ctx.strokeStyle = rgba('#ffffff', 0.7 * a);
          ctx.lineWidth = 1.2;
          ctx.fillStyle = rgba(p.color, 0.25 * a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = rgba('#ffffff', 0.8 * a);
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, TAU);
          ctx.fill();
          break;
        }
      }
    }
  }
}

/** A small teardrop seed with a highlight; shared by melon + jelly. */
export function drawSeed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 0.3, x + r * 0.8, y + r, x, y + r);
  ctx.bezierCurveTo(x - r * 0.8, y + r, x - r * 0.95, y - r * 0.3, x, y - r * 1.25);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.25, y - r * 0.15, r * 0.18, r * 0.32, 0.3, 0, TAU);
  ctx.fill();
}
