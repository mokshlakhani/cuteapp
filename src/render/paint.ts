import { mix, rgba } from '../core/color';
import { light } from '../design/tokens';
import type { Theme } from '../design/tokens';

/**
 * Shared material & lighting helpers. Every toy uses these, which is how a
 * solid vinyl watermelon and a translucent jelly end up looking lit by the
 * same lamp, resting on the same floor, casting the same warm shadows.
 */

// ——— paths ———

/** Smooth closed curve through points (quadratic through midpoints). */
export function smoothPath(ctx: CanvasRenderingContext2D, xs: ArrayLike<number>, ys: ArrayLike<number>, n: number) {
  ctx.beginPath();
  const mx0 = (xs[n - 1] + xs[0]) / 2;
  const my0 = (ys[n - 1] + ys[0]) / 2;
  ctx.moveTo(mx0, my0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
  }
  ctx.closePath();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ——— environment ———

let grainPattern: CanvasPattern | null = null;
let grainCtx: CanvasRenderingContext2D | null = null;

function grain(ctx: CanvasRenderingContext2D) {
  if (grainPattern && grainCtx === ctx) return grainPattern;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 255;
  }
  g.putImageData(img, 0, 0);
  grainPattern = ctx.createPattern(c, 'repeat');
  grainCtx = ctx;
  return grainPattern!;
}

export interface RoomBackdrop {
  tint: string;
  /** y of the floor line, or null for no floor (home). */
  floorY: number | null;
}

/** The one background treatment used by home and every room. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: Theme, b: RoomBackdrop) {
  const tintAmt = t.name === 'day' ? 1 : 0.35;
  const top = mix(t.bg, b.tint, 0.1 * tintAmt);
  const bottom = mix(t.bgDeep, b.tint, 0.22 * tintAmt);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A soft pool of light from the upper left, like a window nearby.
  const pool = ctx.createRadialGradient(w * 0.25, h * 0.12, 0, w * 0.25, h * 0.12, Math.max(w, h) * 0.75);
  pool.addColorStop(0, rgba('#ffffff', t.name === 'day' ? 0.5 : 0.06));
  pool.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);

  if (b.floorY != null) {
    const fy = b.floorY;
    const floor = ctx.createLinearGradient(0, fy, 0, h);
    floor.addColorStop(0, mix(t.bgDeep, b.tint, 0.38 * tintAmt));
    floor.addColorStop(1, mix(t.bgDeep, b.tint, 0.22 * tintAmt));
    ctx.fillStyle = floor;
    ctx.fillRect(0, fy, w, h - fy);
    // Soft ambient occlusion just under the edge gives the floor depth.
    const ao = ctx.createLinearGradient(0, fy, 0, fy + 26);
    ao.addColorStop(0, `rgba(${t.shadowRgb},${0.06 * t.shadowStrength})`);
    ao.addColorStop(1, `rgba(${t.shadowRgb},0)`);
    ctx.fillStyle = ao;
    ctx.fillRect(0, fy, w, 26);
    ctx.fillStyle = t.floorEdge;
    ctx.fillRect(0, fy - 1, w, 1.5);
  }
}

export function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: Theme) {
  ctx.save();
  ctx.globalAlpha = t.grain;
  ctx.fillStyle = grain(ctx);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ——— lighting ———

/** Warm, soft contact shadow on the floor. */
export function contactShadow(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, rx: number, ry: number, alpha = 0.22) {
  if (rx <= 0.5 || ry <= 0.2 || alpha <= 0.002) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  const a = Math.min(0.6, alpha * t.shadowStrength);
  g.addColorStop(0, `rgba(${t.shadowRgb},${a})`);
  g.addColorStop(0.55, `rgba(${t.shadowRgb},${a * 0.45})`);
  g.addColorStop(1, `rgba(${t.shadowRgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Ball shading for any rounded object. Call while clipped to the object.
 * `hi` = strength of the lit side, `lo` = strength of the far-side shade.
 */
export function shade(
  ctx: CanvasRenderingContext2D,
  t: Theme,
  cx: number,
  cy: number,
  r: number,
  hi = 0.35,
  lo = 0.22,
  shadeColor?: string,
) {
  const lx = cx + light.x * r * 0.45;
  const ly = cy + light.y * r * 0.45;
  const g1 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.9);
  g1.addColorStop(0, rgba('#ffffff', hi));
  g1.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = g1;
  ctx.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2);
  const g2 = ctx.createRadialGradient(lx, ly, r * 0.55, lx, ly, r * 1.55);
  const sc = shadeColor ? rgba(shadeColor, 0) : `rgba(${t.shadowRgb},0)`;
  const sc2 = shadeColor ? rgba(shadeColor, lo) : `rgba(${t.shadowRgb},${lo})`;
  g2.addColorStop(0, sc);
  g2.addColorStop(1, sc2);
  ctx.fillStyle = g2;
  ctx.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2);
}

/** The signature glossy highlight: a soft lozenge plus a tiny sparkle dot. */
export function gloss(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.75, angle = -0.6) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, rgba('#ffffff', alpha));
  g.addColorStop(0.45, rgba('#ffffff', alpha * 0.55));
  g.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = rgba('#ffffff', Math.min(1, alpha * 1.1));
  ctx.beginPath();
  ctx.ellipse(x + w * 0.85, y + h * 1.4, w * 0.14, w * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
}
