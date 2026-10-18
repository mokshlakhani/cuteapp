import { clamp, lerp, rand, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { glassShape, halfAt, yAt, type GlassShape } from './draw';
import type { Glass } from './Glass';
import type { Drink } from './drinks';

interface Pearl {
  u: number;
  row: number;
  phase: number;
}

interface Cube {
  u: number;
  /** 0 on the bottom, 1 stacked on the others. */
  layer: number;
  rot: number;
  phase: number;
}

/** Pearls across each row, from the bottom up, and the most there can be. */
const PEARL_ROWS = [6, 5, 5, 4, 4];
const PEARLS_MAX = PEARL_ROWS.reduce((a, b) => a + b, 0);
/** Ice cubes for 2, 3, 4 and 5: where each sits (0..1 across) on the bottom, and stacked. */
const ICE: { bottom: number[]; stacked: number[] }[] = [
  { bottom: [0.3, 0.7], stacked: [] },
  { bottom: [0.3, 0.7], stacked: [0.5] },
  { bottom: [0.05, 0.5, 0.95], stacked: [0.5] },
  { bottom: [0.05, 0.5, 0.95], stacked: [0.28, 0.72] },
];
/** However full, solids never take up more of the glass's width than this. */
const SOLID_MAX = 0.8;
/** A glass one unit wide: solids are measured on it, so the volume they take doesn't depend on screen size. */
const UNIT = glassShape(0, 0, 1);
const PEARL_R = UNIT.wb * 0.15;
const CUBE = UNIT.wt * 0.46;
/** A floating cube rides with this much of its height under the surface. */
const SUNK = 0.65;

const PEARL = '#4B2E25';
const PEARL_HI = '#8A5A44';

/**
 * What waits in the glass before you pour: tapioca pearls for bubble tea,
 * ice and a lemon wheel for lemonade. Pearls jostle when the stream hits
 * them; ice sits on the bottom until the drink lifts it, then floats.
 *
 * They take up room, so the drink rises faster while it's among them, and
 * each time the drink comes round again there are a few more: `round` is how
 * many glasses of it came before this one.
 */
export class GlassExtras {
  private pearls: Pearl[] = [];
  private cubes: Cube[] = [];
  private kick = 0;
  readonly lemon: boolean;

  constructor(
    readonly kind: Drink['extra'],
    round = 0,
  ) {
    if (kind === 'pearls') {
      let left = pearlCount(round);
      PEARL_ROWS.forEach((cap, row) => {
        const n = Math.min(cap, left);
        left -= n;
        for (let i = 0; i < n; i++)
          this.pearls.push({ u: (i + 0.5 + rand(-0.12, 0.12) + (row % 2) * 0.25) / (cap + (row % 2) * 0.5), row, phase: rand(0, TAU) });
      });
    } else if (kind === 'ice') {
      const plan = ICE[iceCount(round) - 2];
      const cube = (u: number, layer: number) => ({ u, layer, rot: rand(-0.25, 0.25) * (1 + layer * 0.2), phase: rand(0, TAU) });
      this.cubes = [...plan.bottom.map((u) => cube(u, 0)), ...plan.stacked.map((u) => cube(u, 1))];
    }
    this.lemon = kind === 'ice';
  }

  get count() {
    return this.pearls.length + this.cubes.length;
  }

  /** How high the pearls reach (fill height), so the face can sit above them. */
  get top() {
    let top = 0;
    for (const p of this.pearls) top = Math.max(top, pearlAt(p.row) + PEARL_R / UNIT.H);
    return top;
  }

  /**
   * How much of the glass's width is taken up by solids at fill height `f`:
   * pearls where they sit, and ice until it floats (then it rides up with the
   * drink, taking up no more room).
   */
  solidAt(f: number) {
    let w = 0;
    const r = PEARL_R / UNIT.H;
    for (const p of this.pearls) {
      const d = Math.abs(f - pearlAt(p.row));
      if (d < r) w += 2 * Math.sqrt(r * r - d * d) * UNIT.H;
    }
    const sf = CUBE / UNIT.H;
    for (const c of this.cubes) {
      const bottom = restAt(c.layer) - sf / 2;
      if (f >= bottom && f < bottom + sf * SUNK) w += CUBE;
    }
    return Math.min(SOLID_MAX, w / (2 * halfAt(UNIT, f)));
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
      const f0 = pearlAt(p.row);
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
      const rest = restAt(c.layer);
      // Floats with about two thirds of it under the surface; stacked ones ride on the others.
      const float = glass.level - sf * (SUNK - 0.5) + c.layer * sf * 0.6 + glass.surface(c.u);
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

/** Pearls in a glass of bubble tea, the `round`th time it comes up (0 = first). */
export const pearlCount = (round: number) => Math.min(PEARLS_MAX, 8 + 4 * round);
/** Ice cubes in a glass of lemonade, the `round`th time. */
export const iceCount = (round: number) => Math.min(ICE.length + 1, 2 + round);

/** Fill height of a row of pearls' centres. */
const pearlAt = (row: number) => (PEARL_R * (1 + row * 1.6)) / UNIT.H;
/** Fill height of a resting cube's centre. */
const restAt = (layer: number) => (CUBE / UNIT.H) * (0.55 + layer * 0.95);
