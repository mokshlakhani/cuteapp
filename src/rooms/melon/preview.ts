import type { Preview } from '../../app/scene';
import { rand } from '../../core/math';
import { reducedMotion } from '../../render/camera';
import { MelonScene } from './MelonScene';
import { anyPopFruit } from './fruits';

/** Seconds between its little contented moments. */
const EVERY: [number, number] = [5, 7.5];

/**
 * The home card: a fruit of its own (a different one each time the app
 * opens), resting on the table. It breathes and
 * blinks, and every so often gives a slow, soft squish and a contented smile.
 * Nothing more: the home screen is a calm place.
 */
export function melonPreview(): Preview {
  const scene = new MelonScene();
  scene.setFruit(anyPopFruit());
  scene.resetMelon(0);
  let size = '';
  let next = rand(2, 3.5);
  const fit = (w: number, h: number) => {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (key === size) return;
    size = key;
    // Framed as if the free band were a strip above the label, which pulls
    // the camera back so the melon sits comfortably inside the card.
    scene.resize(w, h, Math.min(2, window.devicePixelRatio || 1), h * 0.3, h * 0.54);
  };

  return {
    canvas: scene.canvas,
    update(dt) {
      // Not until the card has sized its scene.
      if (!size) return;
      next -= dt;
      if (next <= 0 && !reducedMotion) {
        next = rand(...EVERY);
        scene.shape.squash.impulse(rand(1.6, 2.2));
        scene.shape.sway.impulse(rand(-0.4, 0.4));
        scene.shape.face.set('happy', 1.8);
      }
      scene.update(dt);
    },
    render(w, h) {
      fit(w, h);
      scene.render();
    },
    draw(ctx, x, y, w, h) {
      fit(w, h);
      ctx.drawImage(scene.render(), x, y, w, h);
    },
    poke() {
      scene.shape.squash.impulse(rand(4, 5));
      scene.shape.sway.impulse(rand(-1, 1));
      scene.shape.face.set('happy', 1.4);
    },
  };
}
