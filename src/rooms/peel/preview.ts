import type { Preview } from '../../app/scene';
import { rand, TAU } from '../../core/math';
import { Spring } from '../../design/motion';
import { fruitPalette as F } from '../../design/fruitPalette';
import { springs } from '../../design/tokens';
import { theme } from '../../design/theme';
import { reducedMotion } from '../../render/camera';
import { drawFace, Face } from '../../render/face';
import { contactShadow, gloss, shade } from '../../render/paint';

const EVERY: [number, number] = [5, 8];

/**
 * The home card: an orange with its top peeled and a curl of peel hanging
 * from it, breathing. Painted once to a sprite: the shelf can't afford more
 * live 3D. Now and then the curl sways a little.
 */
export function peelPreview(): Preview {
  const face = new Face();
  const swing = new Spring(0, springs.gentle);
  let time = rand(0, 20);
  let next = rand(2, 4);
  let sprite: HTMLCanvasElement | null = null;
  let key = '';

  const paint = (R: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = `${R}@${dpr}|${theme.current.name}`;
    if (sprite && k === key) return sprite;
    key = k;
    const c = (sprite ??= document.createElement('canvas'));
    const size = Math.ceil(R * 2.2);
    c.width = c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fillStyle = F.orange.peel;
    g.fill();
    g.clip();
    // The peeled band across its crown, pale as pith, sloping as the spiral does.
    g.rotate(-0.22);
    g.fillStyle = F.orange.pith;
    g.fillRect(-R * 1.3, -R * 1.2, R * 2.6, R * 0.74);
    g.fillRect(-R * 1.3, -R * 0.1 - R * 0.34, R * 2.6, 0);
    g.strokeStyle = 'rgba(190,110,40,0.4)';
    g.lineWidth = Math.max(1, R * 0.03);
    g.beginPath();
    g.moveTo(-R * 1.3, -R * 0.46);
    g.lineTo(R * 1.3, -R * 0.46);
    g.stroke();
    g.rotate(0.22);
    shade(g, theme.current, 0, 0, R, 0.3, 0.2, F.orange.peel);
    g.restore();
    gloss(g, -R * 0.42, R * 0.02, R * 0.24, R * 0.1, 0.55);
    return c;
  };

  return {
    update(dt) {
      time += dt;
      face.update(dt);
      swing.update(dt);
      next -= dt;
      if (next <= 0 && !reducedMotion) {
        next = rand(...EVERY);
        swing.impulse(rand(0.8, 1.2));
        face.set('happy', 1.5);
      }
    },
    draw(ctx, x, y, w, h) {
      const R = Math.min(w * 0.27, h * 0.25);
      const cx = x + w / 2 - R * 0.14;
      const bob = reducedMotion ? 0 : Math.sin(time * 1.1) * R * 0.02;
      const cy = y + h * 0.38 + bob;
      contactShadow(ctx, theme.current, cx + R * 0.1, y + h * 0.72, R * 1.1, R * 0.17, 0.26);
      // The curl of peel, hanging from the cut.
      const sway = swing.value * R * 0.07;
      const px = cx + R * 0.86;
      const py = cy - R * 0.22;
      ctx.lineCap = 'round';
      for (const [col, wd] of [
        [F.orange.peel, 0.17],
        [F.orange.pith, 0.08],
      ] as [string, number][]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(2, R * wd);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.bezierCurveTo(px + R * 0.6, py + R * 0.1, px + R * 0.46 + sway, py + R * 0.55, px + R * 0.08 + sway, py + R * 0.56);
        ctx.bezierCurveTo(px - R * 0.2 + sway, py + R * 0.58, px - R * 0.06 + sway, py + R * 0.96, px + R * 0.26 + sway * 1.4, py + R * 0.98);
        ctx.bezierCurveTo(px + R * 0.46 + sway * 1.4, py + R * 1, px + R * 0.3 + sway * 1.5, py + R * 1.28, px + R * 0.14 + sway * 1.6, py + R * 1.3);
        ctx.stroke();
      }
      const s = paint(Math.round(R));
      const d = R * 2.2 * (Math.ceil(Math.round(R) * 2.2) / (Math.round(R) * 2.2));
      ctx.drawImage(s, cx - d / 2, cy - d / 2, d, d);
      ctx.save();
      ctx.translate(cx, cy + R * 0.12);
      drawFace(ctx, face, R * 0.9, { ink: '#2A1C17', blush: '#FF8C6B' });
      ctx.restore();
    },
    poke() {
      swing.impulse(2);
      face.set('happy', 1.4);
    },
  };
}
