import type { Preview } from '../../app/scene';
import { rand, TAU } from '../../core/math';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { reducedMotion } from '../../render/camera';
import { drawFace, Face } from '../../render/face';
import { gloss } from '../../render/paint';

/** Seconds between its slow little swells. */
const EVERY: [number, number] = [4.5, 7];

/**
 * The home card: one soap bubble resting on its wand, breathing slowly, with
 * now and then a slow swell and a smile. It's painted on the 2D stage from a
 * sprite: the shelf can't afford more live 3D, and a bubble's easy to paint.
 */
export function soapPreview(): Preview {
  const face = new Face();
  const wob = new Spring(0, springs.gentle);
  let time = rand(0, 20);
  let next = rand(2, 3.5);
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
      next -= dt;
      if (next <= 0 && !reducedMotion) {
        next = rand(...EVERY);
        wob.impulse(1.1);
        face.set('happy', 1.6);
      }
    },
    draw(ctx, x, y, w, h) {
      const R = Math.min(w * 0.3, h * 0.25);
      const breathe = reducedMotion ? 0 : Math.sin(time * 1.1) * 0.012;
      const q = breathe + wob.value * 0.06;
      const cx = x + w / 2;
      const ringY = y + h * 0.56;
      const r = R * (1 + q);
      const cy = ringY - r * 0.92;
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
      ctx.drawImage(s, cx - d / 2, cy - d / 2, d, d);
      ctx.save();
      ctx.translate(cx, cy + r * 0.02);
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
