import type { Preview } from '../../app/scene';
import { getLab } from './Lab';

/**
 * The home card shows your actual jelly — whatever state you left it in —
 * re-photographed a few times a second, with a soft idle jiggle.
 */
export function jellyPreview(): Preview {
  const shot = document.createElement('canvas');
  let since = Infinity;
  let jiggle = 0;
  let jv = 0;
  let t = 0;
  return {
    update(dt) {
      since += dt;
      t += dt;
      jv += (-jiggle * 220 - jv * 9) * dt;
      jiggle += jv * dt;
    },
    draw(ctx, x, y, w, h) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const sw = Math.round(w * dpr);
      const sh = Math.round(h * 0.78 * dpr);
      if (since > 0.4 || shot.width !== sw || shot.height !== sh) {
        since = 0;
        shot.width = sw;
        shot.height = sh;
        getLab().snapshot(shot);
      }
      const breathe = Math.sin(t * 1.8) * 0.01 + jiggle;
      const cx = x + w / 2;
      const by = y + h * 0.74;
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(1 + breathe, 1 - breathe);
      ctx.translate(-cx, -by);
      ctx.drawImage(shot, x, y, w, h * 0.78);
      ctx.restore();
    },
    poke() {
      jv += 1.6;
      getLab().nudge();
    },
  };
}
