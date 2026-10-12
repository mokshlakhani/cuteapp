import type { Preview } from '../../app/scene';
import { rand } from '../../core/math';
import { getMelonScene } from './MelonScene';

/**
 * The home card shows your actual melon (or the mess, if you left it
 * mid-pop), photographed a few times a second while it breathes and blinks.
 */
export function melonPreview(): Preview {
  const shot = document.createElement('canvas');
  let since = Infinity;
  return {
    update(dt) {
      since += dt;
      getMelonScene().idle(dt);
    },
    draw(ctx, x, y, w, h) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const sw = Math.round(w * dpr);
      const sh = Math.round(h * 0.8 * dpr);
      if (since > 0.12 || shot.width !== sw || shot.height !== sh) {
        since = 0;
        shot.width = sw;
        shot.height = sh;
        getMelonScene().snapshot(shot);
      }
      ctx.drawImage(shot, x, y, w, h * 0.8);
    },
    poke() {
      const s = getMelonScene();
      if (s.melonVisible) {
        s.shape.squash.impulse(rand(5, 7));
        s.shape.sway.impulse(rand(-2, 2));
        s.shape.face.set('happy', 1.4);
      } else s.explosion.hop(s.centre, 8);
    },
  };
}
