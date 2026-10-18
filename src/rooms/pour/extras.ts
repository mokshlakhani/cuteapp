import { clamp, lerp, rand, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { halfAt, yAt, type GlassShape } from './draw';
import type { Glass } from './Glass';
import type { Drink } from './drinks';

interface Pearl {
  u: number;
  row: number;
  phase: number;
}

interface Cube {
  u: number;
  /** Stacked on another cube when the glass is dry. */
  stacked: boolean;
  rot: number;
  phase: number;
}

const PEARL = '#4B2E25';
const PEARL_HI = '#8A5A44';

/**
 * What waits in the glass before you pour: tapioca pearls for bubble tea,
 * ice and a lemon wheel for lemonade. Pearls jostle when the stream hits
 * them; ice sits on the bottom until the drink lifts it, then floats.
 */
export class GlassExtras {
  private pearls: Pearl[] = [];
  private cubes: Cube[] = [];
  private kick = 0;
  readonly lemon: boolean;

  constructor(readonly kind: Drink['extra']) {
    if (kind === 'pearls') {
      const rows = [6, 5, 3];
      rows.forEach((n, row) => {
        for (let i = 0; i < n; i++)
          this.pearls.push({ u: (i + 0.5 + rand(-0.12, 0.12) + (row % 2) * 0.25) / (n + (row % 2) * 0.5), row, phase: rand(0, TAU) });
      });
    } else if (kind === 'ice') {
      this.cubes = [
        { u: 0.3, stacked: false, rot: rand(-0.25, 0.25), phase: rand(0, TAU) },
        { u: 0.68, stacked: false, rot: rand(-0.25, 0.25), phase: rand(0, TAU) },
        { u: 0.48, stacked: true, rot: rand(-0.3, 0.3), phase: rand(0, TAU) },
      ];
    }
    this.lemon = kind === 'ice';
  }

  /** `landing` 0..1: how hard the stream is hitting the drink right now. */
  update(dt: number, landing: number) {
    this.kick = Math.max(this.kick * Math.exp(-4 * dt), landing);
  }

  draw(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, time: number) {
    if (this.pearls.length) this.drawPearls(ctx, g, glass, time);
    if (this.cubes.length) this.drawIce(ctx, g, glass, time);
  }

  private drawPearls(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, time: number) {
    const r = g.wb * 0.15;
    for (const p of this.pearls) {
      const f0 = (r * (1 + p.row * 1.6)) / g.H;
      const wet = clamp((glass.level - f0) / 0.08, 0, 1);
      const half = halfAt(g, f0) - r * 1.1;
      const sway = Math.sin(time * 1.4 + p.phase) * r * 0.18 * wet;
      const hop = this.kick * wet * r * 0.5 * (0.5 + 0.5 * Math.sin(time * 11 + p.phase));
      const x = g.cx - half + p.u * half * 2 + sway;
      const y = yAt(g, f0) - hop;
      const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      grad.addColorStop(0, PEARL_HI);
      grad.addColorStop(1, PEARL);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.55);
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.38, r * 0.22, 0, TAU);
      ctx.fill();
    }
  }

  private drawIce(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, time: number) {
    const s = g.wt * 0.46;
    const sf = s / g.H;
    for (const c of this.cubes) {
      const rest = sf * 0.55 + (c.stacked ? sf * 0.95 : 0);
      // Floats with about two thirds of it under the surface.
      const float = glass.level - sf * 0.15 + glass.surface(c.u);
      const floating = float > rest;
      const f = floating ? float + Math.sin(time * 2 + c.phase) * 0.006 : rest;
      const half = halfAt(g, f) - s * 0.62;
      const x = g.cx - half + c.u * half * 2;
      const y = yAt(g, f);
      const rot = c.rot + (floating ? Math.sin(time * 1.6 + c.phase) * 0.08 : 0);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const k = s * 0.22;
      ctx.beginPath();
      ctx.roundRect(-s / 2, -s / 2, s, s, k);
      ctx.fillStyle = rgba('#ffffff', 0.38);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.85);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.9);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, -s * 0.3);
      ctx.lineTo(s * 0.05, -s * 0.3);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A lemon wheel slotted onto the rim (drawn over the glass). */
  drawRim(ctx: CanvasRenderingContext2D, g: GlassShape) {
    if (!this.lemon) return;
    const r = g.wt * 0.36;
    const x = g.cx - g.wt * 0.78;
    const y = yAt(g, 1) - r * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#EFC94C';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFF6CF';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#F8E27D';
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU + 0.06;
      const a1 = ((i + 1) / 8) * TAU - 0.06;
      ctx.beginPath();
      ctx.moveTo(Math.cos((a0 + a1) / 2) * r * 0.1, Math.sin((a0 + a1) / 2) * r * 0.1);
      ctx.arc(0, 0, r * 0.76, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = rgba('#ffffff', 0.5);
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.4, lerp(r * 0.1, r * 0.16, 0.5), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
