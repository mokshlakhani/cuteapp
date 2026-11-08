import type { Preview } from '../../app/scene';
import { clamp, lerp, rand, TAU } from '../../core/math';
import { ease, Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { reducedMotion } from '../../render/camera';
import { drawFace, Face } from '../../render/face';
import { gloss } from '../../render/paint';

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
    const body = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
    body.addColorStop(0, 'rgba(255,255,255,0.05)');
    body.addColorStop(0.72, 'rgba(255,255,255,0.1)');
    body.addColorStop(1, 'rgba(255,255,255,0.5)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    // Film colours gathered round the rim.
    const film: [string, number, number][] = [
      ['rgba(255,150,205,0.55)', -2.3, 1.5],
      ['rgba(130,225,235,0.55)', -0.5, 1.4],
      ['rgba(255,232,150,0.5)', 1.0, 1.2],
      ['rgba(175,160,255,0.5)', 2.2, 1.3],
    ];
    g.lineCap = 'round';
    for (const [col, a, len] of film) {
      g.strokeStyle = col;
      g.lineWidth = R * 0.075;
      g.beginPath();
      g.arc(0, 0, R * 0.95, a, a + len);
      g.stroke();
    }
    gloss(g, -R * 0.42, -R * 0.5, R * 0.3, R * 0.14, 0.9);
    gloss(g, R * 0.46, R * 0.5, R * 0.15, R * 0.06, 0.45);
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
      // The wand: its stem and the ring's far side, under the bubble.
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#F2A9BC';
      ctx.lineWidth = Math.max(3, R * 0.11);
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
      ctx.globalAlpha = clamp(clock / 0.5, 0, 1) * clamp((0.65 - up) / 0.4, 0, 1);
      ctx.drawImage(s, bx - d / 2, cy - d / 2, d, d);
      ctx.translate(bx, cy + r * 0.02);
      drawFace(ctx, face, r * 0.98, { ink: '#3A2340', blush: '#FF9AAE' });
      ctx.restore();
      // The ring's near side, over it.
      ctx.strokeStyle = '#F2A9BC';
      ctx.lineWidth = Math.max(3, R * 0.11);
      ctx.beginPath();
      ctx.ellipse(cx, ringY, R * 0.42, R * 0.1, 0, 0, Math.PI);
      ctx.stroke();
    },
    poke() {
      wob.impulse(2.4);
      face.set('happy', 1.4);
    },
  };
}
