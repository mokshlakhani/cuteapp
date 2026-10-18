import type { Preview } from '../../app/scene';
import { rand } from '../../core/math';
import { reducedMotion } from '../../render/camera';
import { MelonScene } from './MelonScene';

/** Seconds between its little contented moments. */
const EVERY: [number, number] = [5, 7.5];

/**
 * The home card: a melon of its own, resting on the table. It breathes and
 * blinks, and every so often gives a slow, soft squish and a contented smile.
 * Nothing more: the home screen is a calm place.
 */
export function melonPreview(): Preview {
  let scene: MelonScene | null = null;
  let size = '';
  let next = rand(2, 3.5);

  return {
    update(dt) {
      const s = scene;
      if (!s) return;
      next -= dt;
      if (next <= 0 && !reducedMotion) {
        next = rand(...EVERY);
        s.shape.squash.impulse(rand(1.6, 2.2));
        s.shape.sway.impulse(rand(-0.4, 0.4));
        s.shape.face.set('happy', 1.8);
      }
      s.update(dt);
    },
    draw(ctx, x, y, w, h) {
      if (!scene) {
        scene = new MelonScene();
        scene.resetMelon(0);
      }
      const key = `${Math.round(w)}x${Math.round(h)}`;
      if (key !== size) {
        size = key;
        // Framed as if the free band were a strip above the label, which pulls
        // the camera back so the melon sits comfortably inside the card.
        scene.resize(w, h, Math.min(2, window.devicePixelRatio || 1), h * 0.3, h * 0.54);
      }
      ctx.drawImage(scene.render(), x, y, w, h);
    },
    poke() {
      const s = scene;
      if (!s) return;
      s.shape.squash.impulse(rand(4, 5));
      s.shape.sway.impulse(rand(-1, 1));
      s.shape.face.set('happy', 1.4);
    },
  };
}
