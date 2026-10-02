import { Spring } from '../../design/motion';
import { pastel, springs } from '../../design/tokens';
import type { Theme } from '../../design/tokens';
import { clamp, gauss, lerp, noise1, rand, smoothstep, TAU } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { contactShadow, gloss, shade, smoothPath } from '../../render/paint';
import { Face, drawFace } from '../../render/face';

/**
 * The watermelon: a round vinyl-toy melon that sits on the floor.
 *
 * Its silhouette is computed every frame from a few soft parameters:
 * how many bands squeeze its waist, how much the trapped volume bulges
 * the rest of it, plus spring-driven squash, sway and swell. Bands live in
 * the melon's normalised space (v: -1 top … 1 bottom) so they always sit
 * on the surface no matter how the melon deforms.
 */

export const MELON = {
  skin: '#9DCB86',
  skinLight: '#BCDDA6',
  skinDark: '#6FA862',
  stripe: '#5F9A57',
  rim: '#4E8448',
  flesh: '#F2858D',
  fleshDeep: '#EA6F7B',
  fleshLight: '#F8B3B6',
  rindInner: '#EAF4D8',
  seed: '#4A3530',
  stem: '#8C7051',
  leaf: '#8FC27A',
  blush: '#F59AA2',
};

export const BAND_COLORS = [pastel.pink, pastel.sky, pastel.butter, pastel.lilac, pastel.peach, pastel.mint, pastel.berry];

/** Where bands like to sit (normalised v). The face lives above this. */
export const BAND_ZONE = { min: 0.0, max: 0.4 };
const FACE_V = -0.36;
const ASPECT = 1.07;
const N = 84;

export interface Band {
  /** Normalised vertical position on the melon (animated). */
  y: Spring;
  /** 1 = loose ring flying on, 0 = snug. Overshoots below 0 when it snaps. */
  loose: Spring;
  tilt: number;
  color: string;
  thick: number;
  wob: number;
}

export class Melon {
  R = 120;
  cx = 0;
  floorY = 0;
  /** Extra vertical offset (used for the drop-in). */
  lift = 0;
  bands: Band[] = [];
  breakAt = 20;
  /** Smoothed visual tension 0..1 (what the player sees). */
  tension = 0;
  readonly squash = new Spring(0, springs.wobbly);
  readonly sway = new Spring(0, springs.wobbly);
  readonly swell = new Spring(0, springs.soft);
  readonly face = new Face();
  shiver = 0;
  time = rand(0, 100);
  private nextIdle = rand(3, 6);

  // Derived per frame
  readonly xs = new Float32Array(N);
  readonly ys = new Float32Array(N);
  cy = 0;
  private vStretch = 0;
  private q = 0;
  private offX = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.bands = [];
    this.tension = 0;
    // Somewhere between 16 and 30 bands. Never shown, never the same.
    this.breakAt = Math.round(rand(16, 30));
    this.squash.snap(0);
    this.sway.snap(0);
    this.swell.snap(0);
    this.face.base = 'calm';
  }

  /** Raw fullness 0..1 (hidden from the player). */
  get fullness() {
    return clamp(this.bands.length / this.breakAt, 0, 1);
  }

  get ready() {
    return this.bands.length >= this.breakAt;
  }

  addBand(v: number, fromV: number, color: string) {
    const b: Band = {
      y: new Spring(fromV, { stiffness: 160, damping: 15 }),
      loose: new Spring(1, springs.snap),
      tilt: rand(-0.07, 0.07),
      color,
      thick: rand(0.9, 1.12),
      wob: rand(0, TAU),
    };
    b.y.target = clamp(v + rand(-0.025, 0.025), BAND_ZONE.min, BAND_ZONE.max);
    b.loose.target = 0;
    this.bands.push(b);
    const t = this.fullness;
    // The melon flinches: squash down, sway a little.
    this.squash.impulse(1.6 + t * 1.2);
    this.sway.impulse(rand(-1, 1) * (1.2 + t));
    return b;
  }

  update(dt: number) {
    this.time += dt;
    for (const b of this.bands) {
      b.y.update(dt);
      b.loose.update(dt);
    }
    this.squash.update(dt);
    this.sway.update(dt);
    this.swell.update(dt);
    this.face.update(dt);

    // Visual tension eases toward a saturating curve of fullness: early bands
    // read clearly, the last stretch all looks "very tight" — so you never
    // quite know how many more it can take.
    const f = this.fullness;
    const target = 1 - Math.exp(-f * 2.4);
    this.tension = lerp(this.tension, target / (1 - Math.exp(-2.4)), 1 - Math.exp(-dt * 4));

    // Idle life: a tiny wiggle now and then.
    this.nextIdle -= dt;
    if (this.nextIdle <= 0) {
      this.nextIdle = rand(3.5, 7);
      if (this.tension < 0.5) this.sway.impulse(rand(-0.9, 0.9));
    }
    this.computeOutline();
  }

  /** Width multiplier at normalised height v (pinch + bulge). */
  private widthAt(v: number) {
    const T = this.tension;
    let sum = 0;
    let notch = 0;
    for (const b of this.bands) {
      const tight = clamp(1 - b.loose.value, -0.35, 1);
      const y = b.y.value;
      sum += (0.03 + 0.05 * T) * tight * gauss(v - y, 0.2);
      notch += (0.01 + 0.016 * T) * tight * gauss(v - y, 0.04);
    }
    const PMAX = 0.3;
    const pinch = PMAX * (1 - Math.exp(-sum / PMAX)) + Math.min(notch, 0.06);
    const bulge = 0.085 * T + this.swell.value;
    return 1 - pinch + bulge;
  }

  private computeOutline() {
    const T = this.tension;
    this.vStretch = 0.1 * T + this.swell.value * 0.6;
    const breathe = Math.sin(this.time * 1.7) * 0.008 * (1 - T * 0.5);
    this.q = clamp(this.squash.value * 0.02 + breathe, -0.18, 0.22);
    const sh = this.shiver + smoothstep(0.62, 1, T) * 0.7;
    this.offX = sh ? noise1(this.time * 38, 7) * sh : 0;
    const bottom = (1 + this.vStretch) * (1 - this.q);
    this.cy = this.floorY - bottom * this.R - this.lift;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const v0 = Math.sin(th);
      const u0 = Math.cos(th) * ASPECT;
      const p = this.project(u0 * this.widthAt(v0), v0);
      this.xs[i] = p.x;
      this.ys[i] = p.y;
    }
  }

  /** Map normalised (u, v) on the melon to screen space, with all deformation. */
  project(u: number, v: number) {
    const q = this.q;
    const vv = v * (1 + this.vStretch) * (1 - q);
    const uu = u * (1 + q * 0.9);
    const bottom = (1 + this.vStretch) * (1 - q);
    const lean = this.sway.value * 0.018 * (bottom - vv);
    return { x: this.cx + (uu + lean) * this.R + this.offX, y: this.cy + vv * this.R };
  }

  /** Half-width (px) of the deformed melon at normalised height v. */
  halfWidth(v: number) {
    return Math.sqrt(Math.max(0, 1 - v * v)) * ASPECT * this.widthAt(v) * (1 + this.q * 0.9) * this.R;
  }

  /** Normalised v for a screen y (inverse of project, ignoring lean). */
  vAt(y: number) {
    return (y - this.cy) / (this.R * (1 + this.vStretch) * (1 - this.q));
  }

  contains(x: number, y: number, pad = 0) {
    const v = this.vAt(y);
    if (v < -1.05 || v > 1.05) return false;
    return Math.abs(x - this.cx) < this.halfWidth(clamp(v, -0.999, 0.999)) + pad;
  }

  // ——— drawing ———

  drawShadow(ctx: CanvasRenderingContext2D, t: Theme) {
    const w = this.halfWidth(0.6);
    const lift = clamp(1 - this.lift / (this.R * 3), 0, 1);
    contactShadow(ctx, t, this.cx, this.floorY, w * 1.08 * (0.6 + 0.4 * lift), this.R * 0.17, 0.3 * lift);
  }

  /** Back halves of loose bands (hidden behind the body once snug). */
  drawBandsBack(ctx: CanvasRenderingContext2D) {
    for (const b of this.bands) this.drawBand(ctx, b, Math.PI, TAU);
  }

  drawBody(ctx: CanvasRenderingContext2D, t: Theme) {
    const { xs, ys } = this;
    const R = this.R;
    const T = this.tension;
    const c = this.project(0, 0);

    // Body
    smoothPath(ctx, xs, ys, N);
    const skin = mix(MELON.skin, '#A9C77A', T * 0.25);
    const g = ctx.createRadialGradient(c.x - R * 0.35, c.y - R * 0.45, R * 0.1, c.x, c.y, R * 1.25);
    g.addColorStop(0, mix(skin, '#ffffff', 0.25));
    g.addColorStop(0.6, skin);
    g.addColorStop(1, MELON.skinDark);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    smoothPath(ctx, xs, ys, N);
    ctx.clip();
    this.drawStripes(ctx);
    shade(ctx, t, c.x, c.y, R * 1.08, 0.3, 0.26, MELON.rim);
    ctx.restore();

    // Soft rim
    smoothPath(ctx, xs, ys, N);
    ctx.strokeStyle = rgba(MELON.rim, 0.45);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gloss — always top-left, like every toy in the world.
    const gp = this.project(-0.48, -0.6);
    gloss(ctx, gp.x, gp.y, R * 0.24, R * 0.11, 0.55, -0.7);

    this.drawStem(ctx);
  }

  private drawStripes(ctx: CanvasRenderingContext2D) {
    const longs = [-1.22, -0.62, 0, 0.62, 1.22];
    ctx.fillStyle = rgba(MELON.stripe, 0.82);
    const S = 44;
    for (let k = 0; k < longs.length; k++) {
      const phi = longs[k];
      ctx.beginPath();
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i <= S; i++) {
          const j = pass === 0 ? i : S - i;
          const v = -1 + (2 * j) / S;
          const d = 0.13 + 0.045 * Math.sin(v * 10 + k * 1.7) + 0.018 * Math.sin(v * 17 + k * 2.3);
          const a = pass === 0 ? phi - d : phi + d;
          const hw = this.halfWidth(clamp(v, -0.999, 0.999)) / this.R;
          const p = this.project(Math.sin(clamp(a, -Math.PI / 2, Math.PI / 2)) * hw, v);
          if (i === 0 && pass === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawStem(ctx: CanvasRenderingContext2D) {
    const top = this.project(0, -1);
    const R = this.R;
    const rot = this.sway.value * 0.05 + Math.sin(this.time * 1.3) * 0.04;
    ctx.save();
    ctx.translate(top.x, top.y + R * 0.03);
    ctx.rotate(rot);
    ctx.strokeStyle = MELON.stem;
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.06;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-R * 0.02, -R * 0.12, R * 0.07, -R * 0.17);
    ctx.stroke();
    // little leaf
    ctx.fillStyle = MELON.leaf;
    ctx.beginPath();
    ctx.moveTo(R * 0.02, -R * 0.1);
    ctx.quadraticCurveTo(-R * 0.1, -R * 0.24, -R * 0.24, -R * 0.15);
    ctx.quadraticCurveTo(-R * 0.12, -R * 0.04, R * 0.02, -R * 0.1);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.4);
    ctx.lineWidth = R * 0.012;
    ctx.beginPath();
    ctx.moveTo(-R * 0.01, -R * 0.11);
    ctx.quadraticCurveTo(-R * 0.1, -R * 0.16, -R * 0.2, -R * 0.15);
    ctx.stroke();
    ctx.restore();
  }

  drawFace(ctx: CanvasRenderingContext2D, ink: string) {
    const p = this.project(0, FACE_V);
    const sx = this.halfWidth(FACE_V) / (Math.sqrt(1 - FACE_V * FACE_V) * ASPECT * this.R);
    const sy = (1 + this.vStretch) * (1 - this.q);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sx, sy);
    drawFace(ctx, this.face, this.R * 0.62, { ink, blush: MELON.blush });
    ctx.restore();
  }

  /** Front halves of all bands (drawn over the body). */
  drawBandsFront(ctx: CanvasRenderingContext2D) {
    for (const b of this.bands) this.drawBand(ctx, b, 0, Math.PI);
  }

  private drawBand(ctx: CanvasRenderingContext2D, b: Band, a0: number, a1: number) {
    const L = b.loose.value;
    const T = this.tension;
    const v = b.y.value;
    const hw = this.halfWidth(clamp(v, -0.98, 0.98));
    const p = this.project(0, v);
    const th = Math.max(2, this.R * 0.05 * b.thick * (1 - T * 0.28));
    const Lp = Math.max(0, L);
    const rx = hw + th * 0.25 + Lp * this.R * 0.55;
    const ry = hw * 0.15 + Lp * this.R * 0.3 + Math.sin(this.time * 2 + b.wob) * 0.6;
    // Stretched rubber turns paler.
    const col = mix(b.color, '#ffffff', 0.12 + T * 0.22);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, Math.max(1, ry), b.tilt * (1 + Lp), a0, a1);
    ctx.strokeStyle = mix(b.color, '#5a3a35', 0.28);
    ctx.lineWidth = th + 1.6;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = th;
    ctx.stroke();
    if (a0 === 0) {
      // Highlight along the band: it's shiny rubber.
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - th * 0.22, rx, Math.max(1, ry), b.tilt * (1 + Lp), 0.35, Math.PI - 0.35);
      ctx.strokeStyle = rgba('#ffffff', 0.5);
      ctx.lineWidth = th * 0.28;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Full draw in correct layer order. */
  draw(ctx: CanvasRenderingContext2D, t: Theme) {
    this.drawShadow(ctx, t);
    this.drawBandsBack(ctx);
    this.drawBody(ctx, t);
    this.drawFace(ctx, t.faceInk);
    this.drawBandsFront(ctx);
  }

  /** Outline as a polygon (world space) — used to shatter it. */
  outline() {
    const pts = [];
    for (let i = 0; i < N; i += 2) pts.push({ x: this.xs[i], y: this.ys[i] });
    return pts;
  }

  /** Approximate visual center of the body. */
  center() {
    return this.project(0, 0);
  }
}

/** Ensure a colour differs from the previous band's. */
export function nextBandColor(prev?: string) {
  let c = BAND_COLORS[Math.floor(Math.random() * BAND_COLORS.length)];
  if (c === prev) c = BAND_COLORS[(BAND_COLORS.indexOf(c) + 1) % BAND_COLORS.length];
  return c;
}
