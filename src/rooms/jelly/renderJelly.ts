import type { Theme } from '../../design/tokens';
import { lighten, mix, rgba } from '../../core/color';
import { clamp, matInvert, TAU } from '../../core/math';
import { contactShadow, gloss, shade, smoothPath } from '../../render/paint';
import { drawFace } from '../../render/face';
import type { SoftBody } from './SoftBody';
import type { Fruit } from './fruits';

/**
 * Jelly material, layer by layer:
 *   translucent body → fruit interior (seeds, segments…) → light scattering
 *   glow → skin ring / fresh-cut sheen → tiny bubbles → face (inside the
 *   jelly, under its surface) → ball shading → gloss → stem/leaf.
 * Lit by the same top-left light and gloss as every other toy.
 */

/** Interior textures cover ±TEX_EXTENT·R so skin-side details are included. */
const TEX_EXTENT = 1.25;
const texCache = new Map<string, HTMLCanvasElement>();

function interior(f: Fruit, R: number) {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const key = `${f.id}|${Math.round(R)}|${scale}`;
  let c = texCache.get(key);
  if (c) return c;
  const size = Math.ceil(R * TEX_EXTENT * 2 * scale);
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.translate(R * TEX_EXTENT, R * TEX_EXTENT);
  f.paint(g, R);
  if (texCache.size > 32) texCache.delete(texCache.keys().next().value!);
  texCache.set(key, c);
  return c;
}

const BUBBLES = [
  [-0.35, 0.35, 0.06],
  [0.42, 0.3, 0.045],
  [0.25, 0.55, 0.035],
  [-0.12, 0.62, 0.028],
  [0.55, -0.1, 0.03],
  [-0.58, 0.05, 0.035],
] as const;

export function drawJellyShadow(ctx: CanvasRenderingContext2D, t: Theme, b: SoftBody, floorY: number) {
  const width = (b.maxX - b.minX) / 2;
  const hgt = clamp((floorY - b.maxY) / 260, 0, 1);
  const fade = 1 - b.dying;
  contactShadow(
    ctx,
    t,
    (b.minX + b.maxX) / 2,
    floorY + 1,
    width * (1.05 - hgt * 0.35),
    Math.max(4, b.R * 0.18),
    0.24 * (1 - hgt * 0.85) * fade,
  );
}

export function drawJelly(ctx: CanvasRenderingContext2D, t: Theme, b: SoftBody, time: number) {
  const f = b.fruit;
  const { x, y, n, G } = b;
  const R = b.R;
  const pop = b.spawnPop.value;
  const alpha = 1 - b.dying;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (Math.abs(pop - 1) > 0.001) {
    ctx.translate(b.cx, b.cy);
    ctx.scale(pop, pop);
    ctx.translate(-b.cx, -b.cy);
  }

  // 1 — translucent body
  smoothPath(ctx, x, y, n);
  const lg = ctx.createRadialGradient(b.cx - R * 0.25, b.cy - R * 0.35, R * 0.1, b.cx, b.cy, R * 1.25);
  lg.addColorStop(0, rgba(lighten(f.body, 0.25), 0.66));
  lg.addColorStop(0.62, rgba(f.body, 0.76));
  lg.addColorStop(1, rgba(f.dark, 0.88));
  ctx.fillStyle = lg;
  ctx.fill();

  ctx.save();
  smoothPath(ctx, x, y, n);
  ctx.clip();

  // 2 — fruit interior, in texture space so it deforms and gets cut with
  // the jelly. Pre-rendered once per fruit; drawn with one affine blit.
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.transform(G.a, G.b, G.c, G.d, 0, 0);
  const ti = matInvert(b.tex);
  ctx.transform(ti.a, ti.b, ti.c, ti.d, ti.e, ti.f);
  ctx.globalAlpha = alpha * 0.9;
  const tex = interior(f, b.fruitR);
  const half = b.fruitR * TEX_EXTENT;
  ctx.drawImage(tex, -half, -half, half * 2, half * 2);
  ctx.restore();

  // 3 — light scattering through the jelly: a warm glow opposite the light.
  const small = R < 22; // tiny crumbs skip the subtle layers
  if (!small) {
    const gx = b.cx + R * 0.22;
    const gy = b.cy + R * 0.42;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.85);
    glow.addColorStop(0, rgba(f.light, 0.55));
    glow.addColorStop(1, rgba(f.light, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(b.minX - 4, b.minY - 4, b.maxX - b.minX + 8, b.maxY - b.minY + 8);
  }

  // 4 — skin ring on original skin edges; a soft sheen on fresh cuts.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const skinW = f.skin.width * b.fruitR;
  if (f.skin.inner) {
    // Pale pith just inside the skin: drawn wider first, skin on top.
    ctx.strokeStyle = rgba(f.skin.inner, 0.85);
    ctx.lineWidth = skinW * 2.9;
    strokeEdges(ctx, b, true);
  }
  ctx.strokeStyle = rgba(f.skin.outer, 0.95);
  ctx.lineWidth = skinW * 2;
  strokeEdges(ctx, b, true);
  ctx.strokeStyle = rgba('#ffffff', 0.38);
  ctx.lineWidth = Math.max(2, R * 0.06);
  strokeEdges(ctx, b, false);

  // 5 — tiny bubbles suspended inside.
  if (!small) {
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.transform(G.a, G.b, G.c, G.d, 0, 0);
    for (let i = 0; i < BUBBLES.length; i++) {
      const [bx, by, br] = BUBBLES[i];
      const drift = Math.sin(time * 0.8 + i * 1.7) * R * 0.02;
      const cx = bx * R + drift;
      const cy = by * R - drift * 0.6;
      const r = Math.max(1.2, br * R);
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.45);
      ctx.lineWidth = Math.max(0.8, r * 0.22);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.8);
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // 6 — the face lives inside the jelly, deforming with it.
  if (b.face) {
    const p = b.goalPoint(b.faceX, b.faceY);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.transform(G.a, G.b, G.c, G.d, 0, 0);
    drawFace(ctx, b.face, b.faceSize, { ink: mix(t.faceInk, f.dark, 0.18), blush: f.blush, alpha: 0.95 });
    ctx.restore();
  }

  // 7 — shading over everything inside.
  shade(ctx, t, b.cx, b.cy, R * 1.1, 0.26, 0.22, f.dark);
  ctx.restore(); // clip

  // 8 — rim: a thin darker edge plus a bright inner line on the lit side.
  smoothPath(ctx, x, y, n);
  ctx.strokeStyle = rgba(f.dark, 0.55);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 9 — gloss, riding the deformation.
  const gp = b.goalPoint(-0.4 * R, -0.48 * R);
  const sx = Math.hypot(G.a, G.b);
  const sy = Math.hypot(G.c, G.d);
  gloss(ctx, gp.x, gp.y, R * 0.3 * sx, R * 0.13 * sy, 0.75, -0.65 + Math.atan2(G.b, G.a) * 0.6);

  // 10 — stem / leaf / calyx at its skin vertex.
  if (b.attach >= 0 && f.attach) {
    const i = b.attach;
    const p = (i - 1 + n) % n;
    const q = (i + 1) % n;
    const tx = x[q] - x[p];
    const ty = y[q] - y[p];
    const ang = Math.atan2(-tx, ty) + Math.PI / 2;
    ctx.save();
    ctx.translate(x[i], y[i]);
    ctx.rotate(ang + Math.sin(time * 1.4 + b.id) * 0.05);
    f.attach(ctx, b.fruitR, time);
    ctx.restore();
  }
  ctx.restore();
}

/** Stroke runs of edges whose skin flag matches, following the smooth outline. */
function strokeEdges(ctx: CanvasRenderingContext2D, b: SoftBody, skin: boolean) {
  const { x, y, n } = b;
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (b.skin[i] !== skin) {
      drawing = false;
      continue;
    }
    // Follow the same quadratic midpoint curve as the body outline.
    const h = (i - 1 + n) % n;
    const m0x = (x[h] + x[i]) / 2;
    const m0y = (y[h] + y[i]) / 2;
    const m1x = (x[i] + x[j]) / 2;
    const m1y = (y[i] + y[j]) / 2;
    if (!drawing) {
      ctx.moveTo(m0x, m0y);
      drawing = true;
    }
    ctx.quadraticCurveTo(x[i], y[i], m1x, m1y);
  }
  ctx.stroke();
}
