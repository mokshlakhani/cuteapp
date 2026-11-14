import type { Preview } from '../../app/scene';
import { clamp, lerp, rand, TAU } from '../../core/math';
import { ease, Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { theme } from '../../design/theme';
import { reducedMotion } from '../../render/camera';
import { drawFace, Face } from '../../render/face';
import { contactShadow, gloss } from '../../render/paint';

/** Seconds: blowing up, resting on the ring, floating off, and the pause before the next. */
const GROW = 3.4;
const HOLD = 1.4;
const RISE = 3.2;
const PAUSE = 0.8;
const LOOP = GROW + HOLD + RISE + PAUSE;
/** The size it starts at, as a share of its full size. */
const SMALL = 0.34;

/**
 * The home card: a soap bubble slowly blowing up on its wand, smiling, then
 * floating away so the next can begin. It's painted on the 2D stage from a
 * sprite: the shelf can't afford more live 3D, and a bubble's easy to paint.
 */
export function soapPreview(): Preview {
  const face = new Face();
  const wob = new Spring(0, springs.gentle);
  let time = rand(0, 20);
  let clock = reducedMotion ? GROW : rand(0, GROW);
  let sprite: HTMLCanvasElement | null = null;
  let key = '';

  const paint = (R: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = `${Math.round(R)}@${dpr}`;
    if (sprite && k === key) return sprite;
    key = k;
    const c = (sprite ??= document.createElement('canvas'));
    const size = Math.ceil(R * 2.3);
    c.width = c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    const body = g.createRadialGradient(-R * 0.22, -R * 0.24, R * 0.12, 0, 0, R);
    body.addColorStop(0, 'rgba(255,255,255,0.16)');
    body.addColorStop(0.62, 'rgba(245,235,255,0.14)');
    body.addColorStop(0.88, 'rgba(195,170,220,0.34)');
    body.addColorStop(1, 'rgba(255,255,255,0.68)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    // Subtle outer contrast rim so the bubble separates crisply from the card.
    g.strokeStyle = 'rgba(110, 82, 130, 0.26)';
    g.lineWidth = Math.max(1, R * 0.035);
    g.beginPath();
    g.arc(0, 0, R * 0.985, 0, TAU);
    g.stroke();
    // Film colours gathered round the rim.
    const film: [string, number, number][] = [
      ['rgba(255,140,202,0.72)', -2.3, 1.55],
      ['rgba(115,222,238,0.72)', -0.5, 1.45],
      ['rgba(255,228,135,0.68)', 1.0, 1.25],
      ['rgba(170,152,255,0.68)', 2.2, 1.35],
    ];
    g.lineCap = 'round';
    for (const [col, a, len] of film) {
      g.strokeStyle = col;
      g.lineWidth = R * 0.088;
      g.beginPath();
      g.arc(0, 0, R * 0.94, a, a + len);
      g.stroke();
    }
    gloss(g, -R * 0.42, -R * 0.48, R * 0.34, R * 0.16, 0.96);
    gloss(g, -R * 0.14, -R * 0.62, R * 0.12, R * 0.065, 0.82);
    gloss(g, R * 0.46, R * 0.5, R * 0.18, R * 0.075, 0.62);
    return c;
  };

  return {
    update(dt) {
      time += dt;
      face.update(dt);
      wob.update(dt);
      if (reducedMotion) return;
      const was = clock;
      clock = (clock + dt) % LOOP;
      if (was < GROW && clock >= GROW) {
        wob.impulse(1.1);
        face.set('happy', 1.6);
      }
    },
    draw(ctx, x, y, w, h) {
      const R = Math.min(w * 0.3, h * 0.25);
      const breathe = reducedMotion ? 0 : Math.sin(time * 1.1) * 0.012;
      const q = breathe + wob.value * 0.06;
      const cx = x + w / 2;
      // The full bubble and the wand under it, together in the middle of the card.
      const ringY = y + h / 2 + R * 0.68;
      const r = R * lerp(SMALL, 1, ease.inOutSine(clamp(clock / GROW, 0, 1))) * (1 + q);
      const up = clamp((clock - GROW - HOLD) / RISE, 0, 1);
      const cy = ringY - r * 0.92 - ease.inOutSine(up) * h * 0.4;
      const bx = cx + Math.sin(up * TAU) * R * 0.12;
      const bubbleAlpha = clamp(clock / 0.5, 0, 1) * clamp((0.65 - up) / 0.4, 0, 1);
      // Grounded shadow beneath the wand & floating bubble on the card.
      contactShadow(ctx, theme.current, cx + R * 0.12, ringY + R * 0.62, R * 0.92, R * 0.16, 0.34);
      contactShadow(ctx, theme.current, bx + R * 0.08, ringY + R * 0.58, r * 0.72, R * 0.11, 0.22 * bubbleAlpha);
      // The wand: its stem and the ring's far side, under the bubble, with 3D shading and specular highlight.
      const ww = Math.max(3.2, R * 0.115);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(110, 62, 85, 0.26)';
      ctx.lineWidth = ww * 1.15;
      ctx.beginPath();
      ctx.moveTo(cx + R * 0.42, ringY + 2.5);
      ctx.quadraticCurveTo(cx + R * 0.72, ringY + R * 0.2 + 2.5, cx + R * 0.34, ringY + R * 0.56 + 2.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, ringY + 2, R * 0.42, R * 0.1, 0, Math.PI, TAU);
      ctx.stroke();

      ctx.strokeStyle = '#DF8CA5';
      ctx.lineWidth = ww;
      ctx.beginPath();
      ctx.moveTo(cx + R * 0.42, ringY + 1);
      ctx.quadraticCurveTo(cx + R * 0.72, ringY + R * 0.2 + 1, cx + R * 0.34, ringY + R * 0.56 + 1);
      ctx.stroke();
      ctx.strokeStyle = '#F4B0C3';
      ctx.lineWidth = ww * 0.88;
      ctx.beginPath();
      ctx.moveTo(cx + R * 0.42, ringY);
      ctx.quadraticCurveTo(cx + R * 0.72, ringY + R * 0.2, cx + R * 0.34, ringY + R * 0.56);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, ringY, R * 0.42, R * 0.1, 0, Math.PI, TAU);
      ctx.stroke();

      const s = paint(Math.round(R));
      const d = r * 2.3;
      ctx.save();
      // Faded away well before the card's edge, so it never looks cut off.
      ctx.globalAlpha = bubbleAlpha;
      ctx.drawImage(s, bx - d / 2, cy - d / 2, d, d);
      ctx.translate(bx, cy + r * 0.02);
      drawFace(ctx, face, r * 0.98, { ink: '#3A2340', blush: '#FF9AAE' });
      ctx.restore();
      // The ring's near side, over it, with a glossy plastic highlight ridge.
      ctx.strokeStyle = '#DF8CA5';
      ctx.lineWidth = ww;
      ctx.beginPath();
      ctx.ellipse(cx, ringY + 1, R * 0.42, R * 0.1, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = '#F4B0C3';
      ctx.lineWidth = ww * 0.88;
      ctx.beginPath();
      ctx.ellipse(cx, ringY, R * 0.42, R * 0.1, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = Math.max(1.2, ww * 0.28);
      ctx.beginPath();
      ctx.ellipse(cx, ringY - 0.8, R * 0.38, R * 0.09, 0, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + R * 0.44, ringY + R * 0.02);
      ctx.quadraticCurveTo(cx + R * 0.66, ringY + R * 0.19, cx + R * 0.37, ringY + R * 0.5);
      ctx.stroke();
    },
    poke() {
      wob.impulse(2.4);
      face.set('happy', 1.4);
    },
  };
}
