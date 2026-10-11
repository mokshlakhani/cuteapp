import { pastel, type Theme } from '../../design/tokens';
import { mix, rgba } from '../../core/color';
import { clamp, TAU } from '../../core/math';
import { gloss, roundRect } from '../../render/paint';
import { ease } from '../../design/motion';
import { drawFace, Face } from '../../render/face';
import type { Bubble, Sheet } from './Sheet';
import { paintPopped, POPPED_LOOKS } from './popped';

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
  if (cache.size > 240) cache.delete(cache.keys().next().value!);
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

/** A popped bubble: one of many flattened, crinkled looks (see popped.ts). */
function flatSprite(t: Theme, f: Film, r: number, look: number) {
  const key = `flat|${t.name}|${f.id}|${r}|${look}|${dprNow()}`;
  return sprite(key, r, (g, R) =>
    paintPopped(g, R, look, {
      fill: rgba(mix(f.tint, '#ffffff', 0.35), 0.5),
      rim: rgba(mix(deep(f.tint), '#5E4B42', 0.3), 0.3),
      shadowRgb: t.shadowRgb,
      shadowStrength: t.shadowStrength,
      tint: f.tint,
    }),
  );
}

/** Popped sprites are shared across nearby sizes: radius in 2px steps. */
const flatR = (r: number) => Math.max(4, Math.round(r / 2) * 2);

/**
 * Paint popped looks ahead of time, a few per call, so the first pops of a
 * fresh sheet never wait on drawing. Returns true once they're all ready.
 */
export function warmPopped(t: Theme, f: Film, r: number, budget = 3) {
  const R = flatR(r);
  for (let i = 0; i < POPPED_LOOKS.length; i++) {
    const key = `flat|${t.name}|${f.id}|${R}|${i}|${dprNow()}`;
    if (cache.has(key)) continue;
    if (budget-- <= 0) return false;
    flatSprite(t, f, R, i);
  }
  return true;
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

/** How long a pop takes to flatten, and the ring of air to fade (s). */
const BURST = 0.1;
const RING = 0.28;

/**
 * Draw one bubble at its place on the film, stretched with it. `time` (s)
 * drives the little tremble of a bubble about to give way.
 */
export function drawBubble(ctx: CanvasRenderingContext2D, t: Theme, f: Film, b: Bubble, time = 0) {
  // Sprites are cached per whole-pixel radius; the rest is a scale.
  const R = Math.max(4, Math.round(b.r));
  const k0 = b.r / R;
  ctx.save();
  ctx.transform(b.ja, b.jb, b.jc, b.jd, b.x, b.y);
  if (b.popped) {
    const k = clamp(b.popT / BURST, 0, 1);
    if (k < 1) blit(ctx, fullSprite(t, f, R, !!b.face), k0 * (1 + k * 0.25), 1 - k);
    const FR = flatR(b.r);
    blit(ctx, flatSprite(t, f, FR, b.crumple), (b.r / FR) * (1.04 + b.wobble.value * 0.05), k);
    if (b.popT < RING) {
      // The puff of air leaving, as a soft ring.
      const q = b.popT / RING;
      ctx.strokeStyle = rgba('#ffffff', 0.6 * (1 - q) * (0.45 + b.power * 0.55));
      ctx.lineWidth = b.r * 0.14 * (1 - q) + 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * (1 + ease.outCubic(q) * (0.5 + b.power * 0.6)), 0, TAU);
      ctx.stroke();
    }
    if (b.face) {
      ctx.translate(0, b.r * 0.06);
      drawFace(ctx, b.face, b.r * 1.05, { ink: t.faceInk, blush: f.blush, alpha: 0.42 * k, blushScale: 0 });
    }
    ctx.restore();
    return;
  }
  const p = b.press;
  if (p > 0.55) {
    // About to give: a tiny tremble.
    const q = (p - 0.55) / 0.45;
    ctx.translate(Math.sin(time * 95 + b.u) * b.r * 0.035 * q, Math.cos(time * 87 + b.v) * b.r * 0.03 * q);
  }
  // Pulled taut, the plastic thins and lets more light through.
  const taut = clamp((b.stretch - 1.12) / 0.45, 0, 1);
  const grow = 1 + p * 0.12 + b.wobble.value * 0.06;
  blit(ctx, fullSprite(t, f, R, !!b.face), k0 * grow, 1 - taut * 0.35);
  if (p > 0.02) {
    // Pushed in: the top caves into a soft dimple.
    const rr = b.r * 0.8 * grow;
    const g = ctx.createRadialGradient(b.r * 0.06, b.r * 0.1, 0, 0, 0, rr);
    g.addColorStop(0, `rgba(${t.shadowRgb},${0.3 * p * t.shadowStrength})`);
    g.addColorStop(0.7, `rgba(${t.shadowRgb},${0.1 * p * t.shadowStrength})`);
    g.addColorStop(1, `rgba(${t.shadowRgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.fill();
  }
  if (b.face) {
    ctx.translate(0, b.r * 0.08);
    ctx.scale(grow, grow * (1 - p * 0.14));
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

/** The film's outline: a smooth curve through its edge nodes. */
function filmPath(sheet: Sheet) {
  let ids = ringCache.get(sheet);
  if (!ids) ringCache.set(sheet, (ids = ring(sheet)));
  const { px, py } = sheet;
  const n = ids.length;
  const path = new Path2D();
  const last = ids[n - 1];
  path.moveTo((px[last] + px[ids[0]]) / 2, (py[last] + py[ids[0]]) / 2);
  for (let i = 0; i < n; i++) {
    const a = ids[i];
    const b = ids[(i + 1) % n];
    path.quadraticCurveTo(px[a], py[a], (px[a] + px[b]) / 2, (py[a] + py[b]) / 2);
  }
  path.closePath();
  return path;
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
export function drawSheet(ctx: CanvasRenderingContext2D, t: Theme, f: Film, sheet: Sheet, time = 0) {
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

  const path = filmPath(sheet);
  ctx.fillStyle = rgba(mix(f.tint, '#ffffff', t.name === 'day' ? 0.45 : 0.15), t.name === 'day' ? 0.62 : 0.4);
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  // A long soft sheen across the plastic.
  const sheen = ctx.createLinearGradient(minX, minY, maxX, maxY);
  sheen.addColorStop(0, rgba('#ffffff', 0));
  sheen.addColorStop(0.3, rgba('#ffffff', 0.22));
  sheen.addColorStop(0.42, rgba('#ffffff', 0));
  sheen.addColorStop(0.7, rgba('#ffffff', 0.1));
  sheen.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();

  ctx.strokeStyle = rgba('#ffffff', t.name === 'day' ? 0.75 : 0.25);
  ctx.lineWidth = 1.5;
  ctx.stroke(path);

  for (const b of sheet.bubbles) if (b.popped) drawBubble(ctx, t, f, b, time);
  for (const b of sheet.bubbles) if (!b.popped) drawBubble(ctx, t, f, b, time);
}

/**
 * The roll a sheet unrolls from or rolls up into, lying across the table
 * (y = its centre line, r = its radius).
 */
export function drawRoll(ctx: CanvasRenderingContext2D, t: Theme, f: Film, x: number, y: number, w: number, r: number) {
  if (r < 0.5) return;
  const pad = Math.min(8, r * 0.6);
  const L = x - pad;
  const W = w + pad * 2;
  // A soft offset shadow (no live blur).
  ctx.fillStyle = `rgba(${t.shadowRgb},${0.09 * t.shadowStrength})`;
  roundRect(ctx, L + 2, y - r + r * 0.5, W + 2, r * 2 + 4, r + 2);
  ctx.fill();
  roundRect(ctx, L + 1, y - r + r * 0.25, W, r * 2, r);
  ctx.fill();
  // The cylinder: lit on top, deeper underneath.
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, mix(f.tint, '#ffffff', 0.8));
  g.addColorStop(0.4, mix(f.tint, '#ffffff', 0.35));
  g.addColorStop(1, deep(f.tint));
  ctx.fillStyle = g;
  roundRect(ctx, L, y - r, W, r * 2, r);
  ctx.fill();
  // Bubbles wrapped round it: two staggered rows of little domes.
  ctx.save();
  roundRect(ctx, L, y - r, W, r * 2, r);
  ctx.clip();
  const d = Math.max(5, r * 0.55);
  for (let row = 0; row < 2; row++) {
    const cy = y - r * 0.45 + row * r * 0.75;
    for (let bx = x + d * (row ? 1 : 0.5); bx < x + w; bx += d * 1.25) {
      ctx.fillStyle = rgba('#ffffff', row ? 0.22 : 0.4);
      ctx.beginPath();
      ctx.ellipse(bx, cy, d * 0.45, d * 0.32, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  // The rolled ends: a little spiral of plastic.
  ctx.strokeStyle = rgba(mix(deep(f.tint), '#5E4B42', 0.3), 0.35);
  ctx.lineWidth = 1.2;
  for (const ex of [L + r * 0.55, L + W - r * 0.55]) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU * 1.6;
      const rr = r * 0.12 + (i / 24) * r * 0.55;
      const px = ex + Math.cos(a) * rr * 0.45;
      const py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = rgba('#ffffff', 0.55);
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L + r, y - r * 0.62);
  ctx.lineTo(L + W - r, y - r * 0.62);
  ctx.stroke();
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
      stretch: 1,
      u: 0,
      v: 0,
      wobble: { value: 0 },
      face: face ? new Face() : null,
    } as unknown as Bubble;
    drawBubble(ctx, t, f, b);
  }
}
