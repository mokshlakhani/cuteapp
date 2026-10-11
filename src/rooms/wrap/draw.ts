import { pastel, type Theme } from '../../design/tokens';
import { mix, rgba } from '../../core/color';
import { clamp, TAU } from '../../core/math';
import { gloss, roundRect, smoothPath } from '../../render/paint';
import { drawFace, Face } from '../../render/face';
import type { Bubble, Sheet } from './Sheet';

/**
 * How bubble wrap looks: a translucent pastel film with soft domes on it,
 * lit by the app's one lamp (upper left) and casting the app's warm shadows.
 * Bubbles are cached as small sprites and drawn through each bubble's local
 * stretch, so a pulled sheet pulls its bubbles into ovals.
 */

export interface Film {
  id: string;
  name: string;
  tint: string;
  blush: string;
}

export const FILMS: Film[] = [
  { id: 'clear', name: 'clear', tint: '#CFE2F1', blush: '#F6AFC0' },
  { id: 'blush', name: 'blush', tint: pastel.pink, blush: '#F59AAE' },
  { id: 'mint', name: 'mint', tint: pastel.mint, blush: '#F5A8B0' },
  { id: 'lilac', name: 'lilac', tint: pastel.lilac, blush: '#F2A2C2' },
  { id: 'butter', name: 'butter', tint: pastel.butter, blush: '#F7A08F' },
];

export const film = (id: string) => FILMS.find((f) => f.id === id) ?? FILMS[0];

/** The deeper colour bubbles take on: pastels alone vanish on cream. */
const deep = (tint: string) => mix(tint, '#7E9DBA', 0.28);

// ——— sprites ———

const cache = new Map<string, HTMLCanvasElement>();
const dprNow = () => Math.min(2, window.devicePixelRatio || 1);

function sprite(key: string, r: number, paint: (g: CanvasRenderingContext2D, R: number) => void) {
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  const dpr = dprNow();
  const R = r * dpr;
  const S = Math.ceil(R * 2.8);
  c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  paint(g, R);
  cache.set(key, c);
  return c;
}

/** A full, round bubble: shadow, dome, caustic, rim, gloss, cheeks. */
function fullSprite(t: Theme, f: Film, r: number, cheeks: boolean) {
  const key = `full|${t.name}|${f.id}|${r.toFixed(1)}|${cheeks ? 1 : 0}|${dprNow()}`;
  return sprite(key, r, (g, R) => {
    const d = deep(f.tint);
    // Soft shadow down and to the right of the lamp.
    const sx = R * 0.16;
    const sy = R * 0.22;
    const sh = g.createRadialGradient(sx, sy, R * 0.5, sx, sy, R * 1.18);
    sh.addColorStop(0, `rgba(${t.shadowRgb},${0.2 * t.shadowStrength})`);
    sh.addColorStop(1, `rgba(${t.shadowRgb},0)`);
    g.fillStyle = sh;
    g.beginPath();
    g.arc(sx, sy, R * 1.18, 0, TAU);
    g.fill();

    // The dome: bright where the lamp hits, deeper toward the rim.
    const body = g.createRadialGradient(-R * 0.32, -R * 0.36, R * 0.05, 0, 0, R);
    body.addColorStop(0, rgba(mix(f.tint, '#ffffff', 0.85), 0.92));
    body.addColorStop(0.55, rgba(f.tint, 0.78));
    body.addColorStop(1, rgba(d, 0.85));
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();

    // Light gathering inside the far rim, like real clear plastic.
    g.strokeStyle = rgba('#ffffff', 0.4);
    g.lineCap = 'round';
    g.lineWidth = R * 0.07;
    g.beginPath();
    g.arc(0, 0, R * 0.84, 0.02 * Math.PI, 0.3 * Math.PI);
    g.stroke();

    g.strokeStyle = rgba(mix(d, '#5E4B42', 0.35), 0.45);
    g.lineWidth = Math.max(1, R * 0.055);
    g.beginPath();
    g.arc(0, 0, R * 0.98, 0, TAU);
    g.stroke();

    if (cheeks) {
      const s = R * 1.15;
      for (const side of [-1, 1]) {
        const bx = side * s * 0.4;
        const by = s * 0.18;
        const bg = g.createRadialGradient(bx, by, 0, bx, by, s * 0.14);
        bg.addColorStop(0, rgba(f.blush, 0.5));
        bg.addColorStop(1, rgba(f.blush, 0));
        g.fillStyle = bg;
        g.beginPath();
        g.ellipse(bx, by, s * 0.14, s * 0.09, 0, 0, TAU);
        g.fill();
      }
    }

    gloss(g, -R * 0.42, -R * 0.44, R * 0.3, R * 0.17, 0.9);
  });
}

/** A popped bubble: a flat, crinkled little disc. */
function flatSprite(t: Theme, f: Film, r: number, variant: number) {
  const key = `flat|${t.name}|${f.id}|${r.toFixed(1)}|${variant}|${dprNow()}`;
  return sprite(key, r, (g, R) => {
    let seed = variant * 7919 + 13;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = 11;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.3;
      const rr = R * (0.88 + rnd() * 0.2);
      xs.push(Math.cos(a) * rr);
      ys.push(Math.sin(a) * rr);
    }
    smoothPath(g, xs, ys, n);
    g.fillStyle = rgba(mix(f.tint, '#ffffff', 0.35), 0.5);
    g.fill();
    g.strokeStyle = rgba(mix(deep(f.tint), '#5E4B42', 0.3), 0.3);
    g.lineWidth = Math.max(1, R * 0.045);
    g.stroke();
    // Creases: a light edge with a soft dark side, like folded plastic.
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = rnd() * TAU;
      const r0 = R * (0.05 + rnd() * 0.25);
      const r1 = R * (0.55 + rnd() * 0.3);
      const bend = (rnd() - 0.5) * 0.6;
      const path = () => {
        g.beginPath();
        g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        g.quadraticCurveTo(Math.cos(a + bend) * (r0 + r1) * 0.5, Math.sin(a + bend) * (r0 + r1) * 0.5, Math.cos(a) * r1, Math.sin(a) * r1);
      };
      g.save();
      g.translate(R * 0.03, R * 0.04);
      path();
      g.strokeStyle = `rgba(${t.shadowRgb},${0.14 * t.shadowStrength})`;
      g.lineWidth = R * 0.07;
      g.stroke();
      g.restore();
      path();
      g.strokeStyle = rgba('#ffffff', 0.6);
      g.lineWidth = R * 0.05;
      g.stroke();
    }
  });
}

function blit(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, scale: number, alpha = 1) {
  if (alpha <= 0.01) return;
  const s = (c.width / dprNow()) * scale;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(c, -s / 2, -s / 2, s, s);
  ctx.globalAlpha = a;
}

// ——— bubbles ———

/** How long a pop takes to flatten (s). */
const BURST = 0.11;

/** Draw one bubble at its place on the film, stretched with it. */
export function drawBubble(ctx: CanvasRenderingContext2D, t: Theme, f: Film, b: Bubble) {
  ctx.save();
  ctx.transform(b.ja, b.jb, b.jc, b.jd, b.x, b.y);
  if (b.popped) {
    const k = clamp(b.popT / BURST, 0, 1);
    if (k < 1) blit(ctx, fullSprite(t, f, b.r, !!b.face), 1 + k * 0.22, 1 - k);
    blit(ctx, flatSprite(t, f, b.r, b.crumple), 1.04 + b.wobble.value * 0.05, k);
    if (b.face) {
      ctx.translate(0, b.r * 0.06);
      drawFace(ctx, b.face, b.r * 1.05, { ink: t.faceInk, blush: f.blush, alpha: 0.42 * k, blushScale: 0 });
    }
    ctx.restore();
    return;
  }
  const p = b.press;
  const s = 1 + p * 0.1 + b.wobble.value * 0.06;
  blit(ctx, fullSprite(t, f, b.r, !!b.face), s);
  if (p > 0.02) {
    // Pushed in: the top caves into a soft dimple.
    const g = ctx.createRadialGradient(b.r * 0.05, b.r * 0.08, 0, 0, 0, b.r * 0.75 * s);
    g.addColorStop(0, `rgba(${t.shadowRgb},${0.2 * p * t.shadowStrength})`);
    g.addColorStop(1, `rgba(${t.shadowRgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.75 * s, 0, TAU);
    ctx.fill();
  }
  if (b.face) {
    ctx.translate(0, b.r * 0.08);
    ctx.scale(s, s * (1 - p * 0.12));
    drawFace(ctx, b.face, b.r * 1.15, { ink: t.faceInk, blush: f.blush, blushScale: 0 });
  }
  ctx.restore();
}

// ——— film ———

function ring(sheet: Sheet) {
  const { nx, ny } = sheet;
  const ids: number[] = [];
  for (let i = 0; i < nx; i++) ids.push(i);
  for (let j = 1; j < ny; j++) ids.push(j * nx + nx - 1);
  for (let i = nx - 2; i >= 0; i--) ids.push((ny - 1) * nx + i);
  for (let j = ny - 2; j > 0; j--) ids.push(j * nx);
  return ids;
}

const ringCache = new WeakMap<Sheet, number[]>();

function filmPath(ctx: CanvasRenderingContext2D, sheet: Sheet) {
  let ids = ringCache.get(sheet);
  if (!ids) ringCache.set(sheet, (ids = ring(sheet)));
  const xs = ids.map((k) => sheet.px[k]);
  const ys = ids.map((k) => sheet.py[k]);
  smoothPath(ctx, xs, ys, ids.length);
}

/** Room around the film in the cached shadow (px). */
const SHADOW_PAD = 44;

/**
 * The film's soft shadow, blurred once at rest and then stretched with the
 * sheet: a live blur of a big shape every frame is costly on phones.
 */
function filmShadow(t: Theme, sheet: Sheet) {
  const key = `shadow|${t.name}|${sheet.W.toFixed(0)}|${sheet.H.toFixed(0)}|${dprNow()}`;
  let c = cache.get(key);
  if (c) return c;
  const dpr = dprNow();
  c = document.createElement('canvas');
  c.width = Math.ceil((sheet.W + SHADOW_PAD * 2) * dpr);
  c.height = Math.ceil((sheet.H + SHADOW_PAD * 2) * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  // Draw the shape far off-canvas so only its shadow lands.
  const off = 10000;
  g.shadowColor = `rgba(${t.shadowRgb},${0.24 * t.shadowStrength})`;
  g.shadowBlur = 22 * dpr;
  g.shadowOffsetX = (off + 4) * dpr;
  g.shadowOffsetY = 8 * dpr;
  roundRect(g, SHADOW_PAD - off, SHADOW_PAD, sheet.W, sheet.H, 14);
  g.fillStyle = '#000';
  g.fill();
  cache.set(key, c);
  return c;
}

/** The film itself, then its bubbles (flat ones first). */
export function drawSheet(ctx: CanvasRenderingContext2D, t: Theme, f: Film, sheet: Sheet) {
  // Stretch the cached shadow over where the film is now.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < sheet.px.length; k++) {
    minX = Math.min(minX, sheet.px[k]);
    maxX = Math.max(maxX, sheet.px[k]);
    minY = Math.min(minY, sheet.py[k]);
    maxY = Math.max(maxY, sheet.py[k]);
  }
  const sx = (maxX - minX) / sheet.W;
  const sy = (maxY - minY) / sheet.H;
  ctx.drawImage(
    filmShadow(t, sheet),
    minX - SHADOW_PAD * sx,
    minY - SHADOW_PAD * sy,
    (sheet.W + SHADOW_PAD * 2) * sx,
    (sheet.H + SHADOW_PAD * 2) * sy,
  );

  ctx.save();
  filmPath(ctx, sheet);
  ctx.fillStyle = rgba(mix(f.tint, '#ffffff', t.name === 'day' ? 0.45 : 0.15), t.name === 'day' ? 0.62 : 0.4);
  ctx.fill();
  ctx.restore();

  ctx.save();
  filmPath(ctx, sheet);
  ctx.clip();
  // A long soft sheen across the plastic.
  const x0 = sheet.x0;
  const y0 = sheet.y0;
  const sheen = ctx.createLinearGradient(x0, y0, x0 + sheet.W, y0 + sheet.H);
  sheen.addColorStop(0, rgba('#ffffff', 0));
  sheen.addColorStop(0.3, rgba('#ffffff', 0.22));
  sheen.addColorStop(0.42, rgba('#ffffff', 0));
  sheen.addColorStop(0.7, rgba('#ffffff', 0.1));
  sheen.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(x0 - sheet.W, y0 - sheet.H, sheet.W * 3, sheet.H * 3);
  ctx.restore();

  ctx.save();
  filmPath(ctx, sheet);
  ctx.strokeStyle = rgba('#ffffff', t.name === 'day' ? 0.75 : 0.25);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  for (const b of sheet.bubbles) if (b.popped) drawBubble(ctx, t, f, b);
  for (const b of sheet.bubbles) if (!b.popped) drawBubble(ctx, t, f, b);
}

/** The roll a fresh sheet unrolls from (y = its centre line). */
export function drawRoll(ctx: CanvasRenderingContext2D, t: Theme, f: Film, x: number, y: number, w: number, r: number) {
  const pad = 6;
  // A soft offset shadow (no live blur), then the roll itself.
  ctx.fillStyle = `rgba(${t.shadowRgb},${0.1 * t.shadowStrength})`;
  roundRect(ctx, x - pad + 2, y - r + 5, w + pad * 2 + 2, r * 2 + 4, r + 2);
  ctx.fill();
  roundRect(ctx, x - pad + 1, y - r + 3, w + pad * 2, r * 2, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, mix(f.tint, '#ffffff', 0.75));
  g.addColorStop(0.45, mix(f.tint, '#ffffff', 0.25));
  g.addColorStop(1, deep(f.tint));
  ctx.fillStyle = g;
  roundRect(ctx, x - pad, y - r, w + pad * 2, r * 2, r);
  ctx.fill();
  // Rows of bubbles wrapped round the roll, seen edge-on.
  ctx.save();
  roundRect(ctx, x - pad, y - r, w + pad * 2, r * 2, r);
  ctx.clip();
  const step = Math.max(10, r * 1.2);
  for (let bx = x + step / 2; bx < x + w; bx += step) {
    ctx.fillStyle = rgba('#ffffff', 0.35);
    ctx.beginPath();
    ctx.ellipse(bx, y - r * 0.15, step * 0.32, r * 0.55, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = rgba('#ffffff', 0.6);
  ctx.fillRect(x, y - r * 0.62, w, Math.max(1.5, r * 0.14));
  ctx.restore();
}

/** A little patch of film for the sheet picker: three bubbles, one face. */
export function drawSwatch(ctx: CanvasRenderingContext2D, t: Theme, f: Film, size: number) {
  const pad = size * 0.1;
  ctx.save();
  roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, size * 0.2);
  ctx.shadowColor = `rgba(${t.shadowRgb},${0.18 * t.shadowStrength})`;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = rgba(mix(f.tint, '#ffffff', 0.45), 0.85);
  ctx.fill();
  ctx.restore();
  const r = size * 0.16;
  const spots = [
    [0.33, 0.34, false],
    [0.67, 0.34, false],
    [0.5, 0.64, true],
  ] as const;
  for (const [u, v, face] of spots) {
    const b = {
      x: u * size,
      y: v * size,
      r: face ? r * 1.18 : r,
      ja: 1,
      jb: 0,
      jc: 0,
      jd: 1,
      popped: false,
      press: 0,
      popT: 0,
      crumple: 0,
      wobble: { value: 0 },
      face: face ? new Face() : null,
    } as unknown as Bubble;
    drawBubble(ctx, t, f, b);
  }
}
