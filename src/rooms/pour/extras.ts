import { clamp, lerp, rand, TAU } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { glassShape, halfAt, yAt, type GlassShape } from './draw';
import type { Glass } from './Glass';
import type { Drink } from './drinks';

interface Pearl {
  u: number;
  row: number;
  phase: number;
  /** Which pearls get caught in the pour's swirl eddy (0..1). */
  swirlK: number;
  lift: number;
}

interface Cube {
  u: number;
  /** 0 on the bottom, 1 stacked on the others. */
  layer: number;
  rot: number;
  phase: number;
  wasFloating: boolean;
  bobY: number;
  bobVy: number;
  clinkRot: number;
  clinkVr: number;
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
  private swirl = 0;
  private clinkCooldown = 0;
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
          this.pearls.push({
            u: (i + 0.5 + rand(-0.12, 0.12) + (row % 2) * 0.25) / (cap + (row % 2) * 0.5),
            row,
            phase: rand(0, TAU),
            // A handful of pearls (especially in the upper rows) lift high and swirl with the pour.
            swirlK: row >= 1 && (i + row) % 2 === 0 ? rand(0.65, 1.0) : rand(0.15, 0.4),
            lift: 0,
          });
      });
    } else if (kind === 'ice') {
      const plan = ICE[iceCount(round) - 2];
      const cube = (u: number, layer: number): Cube => ({
        u,
        layer,
        rot: rand(-0.25, 0.25) * (1 + layer * 0.2),
        phase: rand(0, TAU),
        wasFloating: false,
        bobY: 0,
        bobVy: 0,
        clinkRot: 0,
        clinkVr: 0,
      });
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

  /**
   * `landing` 0..1: how hard the stream is hitting the drink right now.
   * Returns true if ice cubes just clinked together as the level rose.
   */
  update(dt: number, landing: number, level = 0): boolean {
    this.kick = Math.max(this.kick * Math.exp(-4 * dt), landing);
    this.swirl = Math.max(this.swirl * Math.exp(-2.2 * dt), landing);
    this.clinkCooldown = Math.max(0, this.clinkCooldown - dt);
    for (const p of this.pearls) {
      const f0 = pearlAt(p.row);
      const roomAbove = Math.max(0, level - f0 - 0.04);
      const targetLift = this.swirl * p.swirlK * Math.min(0.28, roomAbove * 0.85);
      p.lift = lerp(p.lift, targetLift, 1 - Math.exp(-dt * (targetLift > p.lift ? 7 : 3.2)));
    }
    let clinked = false;
    const sf = CUBE / UNIT.H;
    for (const c of this.cubes) {
      const rest = restAt(c.layer);
      const float = level - sf * (SUNK - 0.5) + c.layer * sf * 0.6;
      const floating = float > rest;
      if (floating && !c.wasFloating) {
        c.wasFloating = true;
        // Bob down and up as the drink lifts the cube off the floor/stack, and clink!
        c.bobVy = -0.14 - c.layer * 0.05;
        c.clinkVr = (c.u < 0.5 ? 1 : -1) * rand(1.6, 2.6);
        if (this.clinkCooldown <= 0) {
          clinked = true;
          this.clinkCooldown = 0.24;
        }
      } else if (!floating) {
        c.wasFloating = false;
      }
      if (floating && landing > 0.25 && Math.random() < dt * 2.8) {
        c.bobVy -= landing * rand(0.05, 0.1);
        c.clinkVr += rand(-1.4, 1.4) * landing;
        if (this.clinkCooldown <= 0 && Math.random() < 0.45) {
          clinked = true;
          this.clinkCooldown = 0.32;
        }
      }
      // Spring-damper for vertical bob and rotational clink.
      c.bobVy += (-38 * c.bobY - 6.5 * c.bobVy) * dt;
      c.bobY += c.bobVy * dt;
      c.clinkVr += (-28 * c.clinkRot - 5.5 * c.clinkVr) * dt;
      c.clinkRot += c.clinkVr * dt;
    }
    return clinked;
  }

  draw(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, time: number, drink?: Drink) {
    if (this.pearls.length) this.drawPearls(ctx, g, glass, time, drink);
    if (this.cubes.length) this.drawIce(ctx, g, glass, time, drink);
  }

  private drawPearls(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, time: number, drink?: Drink) {
    const r = g.wb * 0.15;
    const teaColor = drink?.color ?? '#D99B66';
    const teaDeep = drink?.deep ?? '#A96E3E';
    for (const p of this.pearls) {
      const f0 = pearlAt(p.row);
      const wet = clamp((glass.level - f0) / 0.08, 0, 1);
      // Swirling pearls rise into the tea and trace a soft looping eddy.
      const eddyA = time * (3.2 + p.swirlK * 2.4) + p.phase;
      const liftF = p.lift * (0.7 + 0.3 * Math.sin(eddyA));
      const f = clamp(f0 + liftF, f0, Math.max(f0, glass.level - 0.035));
      const half = halfAt(g, f) - r * 1.15;
      const sway = Math.sin(time * 1.5 + p.phase) * r * 0.22 * wet + Math.cos(eddyA) * r * 1.45 * p.lift * 4;
      const hop = this.kick * wet * r * (0.35 + p.row * 0.65) * (0.5 + 0.5 * Math.sin(time * (8 - p.row * 1.5) + p.phase));
      const x = g.cx - half + p.u * half * 2 + sway;
      const y = yAt(g, f) - hop;
      // Soft outer halo tinted by the milk tea so pearls sit inside the drink rather than pasted on top.
      const submerge = clamp((glass.level - f) / 0.12, 0, 1);
      const outerR = r * 1.08;
      const grad = ctx.createRadialGradient(x - r * 0.28, y - r * 0.32, r * 0.08, x, y, outerR);
      grad.addColorStop(0, mix(PEARL_HI, teaColor, submerge * 0.22));
      grad.addColorStop(0.58, mix(PEARL, teaDeep, submerge * 0.28));
      grad.addColorStop(0.84, rgba(mix(PEARL, teaDeep, 0.55), 0.82 - submerge * 0.18));
      grad.addColorStop(1, rgba(mix(PEARL, teaColor, 0.7), 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, outerR, 0, TAU);
      ctx.fill();
      // Soft diffused specular glint (dimmed slightly when deep under the tea).
      ctx.fillStyle = rgba('#FFF6EB', 0.48 - submerge * 0.16);
      ctx.beginPath();
      ctx.arc(x - r * 0.32, y - r * 0.35, r * 0.2, 0, TAU);
      ctx.fill();
    }
  }

  private drawIce(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, time: number, drink?: Drink) {
    const s = g.wt * 0.46;
    const sf = s / g.H;
    const drinkCol = drink?.color ?? '#FCE668';
    const drinkDeep = drink?.deep ?? '#E5BC2E';
    for (const c of this.cubes) {
      const rest = restAt(c.layer);
      // Floats with about two thirds of it under the surface; stacked ones ride on the others.
      const float = glass.level - sf * (SUNK - 0.5) + c.layer * sf * 0.6 + glass.surface(c.u);
      const floating = float > rest;
      const wet = clamp((glass.level - (rest - sf * 0.4)) / (sf * 0.9), 0, 1);
      // It bobs, clinks, and rides the stir of the pour.
      const f = floating
        ? float + c.bobY + Math.sin(time * 2.3 + c.phase) * 0.008 + this.kick * 0.015 * Math.sin(time * 9.5 + c.phase)
        : rest;
      const half = halfAt(g, f) - s * 0.62;
      const clinkShift = floating ? Math.sin(c.clinkRot * 2) * s * 0.08 : 0;
      const x = g.cx - half + c.u * half * 2 + clinkShift;
      const y = yAt(g, f);
      const rot =
        c.rot +
        c.clinkRot +
        (floating ? Math.sin(time * 1.8 + c.phase) * 0.095 + this.kick * 0.12 * Math.sin(time * 7.5 + c.phase) : 0);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const k = s * 0.22;
      const h = s / 2;
      const inner = s * 0.31;

      // 1. Base refracted body: tinted by the drink where submerged, cool crystal above.
      const bodyGrad = ctx.createLinearGradient(-h, -h, h, h);
      bodyGrad.addColorStop(0, rgba('#ffffff', 0.46));
      bodyGrad.addColorStop(0.45, rgba(mix('#ffffff', drinkCol, 0.28 * wet), 0.38));
      bodyGrad.addColorStop(1, rgba(mix('#E8F7FF', drinkDeep, 0.52 * wet), 0.48));
      ctx.beginPath();
      ctx.roundRect(-h, -h, s, s, k);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // 2. 3D bevel facets around the cube (top-left lit bevel, right & bottom refracted bevels).
      // Top bevel facet (catches the overhead lamp):
      ctx.fillStyle = rgba('#ffffff', 0.42);
      ctx.beginPath();
      ctx.moveTo(-h + k * 0.5, -h);
      ctx.lineTo(h - k * 0.5, -h);
      ctx.lineTo(inner, -inner);
      ctx.lineTo(-inner, -inner);
      ctx.closePath();
      ctx.fill();

      // Left bevel facet:
      ctx.fillStyle = rgba('#ffffff', 0.26);
      ctx.beginPath();
      ctx.moveTo(-h, -h + k * 0.5);
      ctx.lineTo(-inner, -inner);
      ctx.lineTo(-inner, inner);
      ctx.lineTo(-h, h - k * 0.5);
      ctx.closePath();
      ctx.fill();

      // Bottom & right bevel facets (tinted with refracted drink colour):
      ctx.fillStyle = rgba(mix('#CBEAF8', drinkDeep, 0.65 * wet), 0.36);
      ctx.beginPath();
      ctx.moveTo(h, -h + k * 0.5);
      ctx.lineTo(h, h - k * 0.5);
      ctx.lineTo(-h + k * 0.5, h);
      ctx.lineTo(-inner, inner);
      ctx.lineTo(inner, inner);
      ctx.lineTo(inner, -inner);
      ctx.closePath();
      ctx.fill();

      // 3. Cloudy frosted core in the heart of the ice cube.
      const frost = ctx.createRadialGradient(s * 0.02, s * 0.03, s * 0.02, s * 0.02, s * 0.04, s * 0.38);
      frost.addColorStop(0, rgba('#ffffff', 0.82));
      frost.addColorStop(0.45, rgba(mix('#ffffff', drinkCol, 0.18 * wet), 0.52));
      frost.addColorStop(0.78, rgba(mix('#ffffff', drinkCol, 0.3 * wet), 0.16));
      frost.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = frost;
      ctx.beginPath();
      ctx.roundRect(-h, -h, s, s, k);
      ctx.fill();

      // 4. Inner facet ridges & internal frost fracture lines.
      ctx.strokeStyle = rgba('#ffffff', 0.58);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(-inner, -inner, inner * 2, inner * 2, k * 0.55);
      // Corner bevel miter lines:
      ctx.moveTo(-h + k * 0.35, -h + k * 0.35);
      ctx.lineTo(-inner, -inner);
      ctx.moveTo(h - k * 0.35, -h + k * 0.35);
      ctx.lineTo(inner, -inner);
      ctx.moveTo(h - k * 0.35, h - k * 0.35);
      ctx.lineTo(inner, inner);
      ctx.moveTo(-h + k * 0.35, h - k * 0.35);
      ctx.lineTo(-inner, inner);
      // Internal ice crystal crack:
      ctx.moveTo(-s * 0.14, s * 0.12);
      ctx.lineTo(s * 0.06, -s * 0.05);
      ctx.lineTo(s * 0.2, s * 0.09);
      ctx.moveTo(s * 0.06, -s * 0.05);
      ctx.lineTo(-s * 0.04, -s * 0.19);
      ctx.stroke();

      // 5. Outer rim outline and wet specular highlights.
      ctx.strokeStyle = rgba('#ffffff', 0.92);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-h, -h, s, s, k);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.31, -s * 0.35);
      ctx.lineTo(s * 0.12, -s * 0.35);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.96);
      ctx.beginPath();
      ctx.arc(-s * 0.31, -s * 0.18, s * 0.048, 0, TAU);
      ctx.arc(s * 0.24, s * 0.24, s * 0.032, 0, TAU);
      ctx.fill();
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
