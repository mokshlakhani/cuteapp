import { finish } from '../../core/stages';
import type { Preview } from '../../app/scene';
import { rand } from '../../core/math';
import { reducedMotion } from '../../render/camera';
import { offCentre } from '../../render/centre';
import { MelonScene } from './MelonScene';
import { anyPopFruit } from './fruits';

/** Seconds between its little contented moments. */
const EVERY: [number, number] = [2.6, 3.6];

/**
 * The home card: a fruit of its own (a different one each time the app
 * opens), resting on the table. It breathes and
 * blinks, and every so often gives a slow, soft squish and a contented smile.
 * Nothing more: the home screen is a calm place.
 */
export function melonPreview(): Preview {
  const scene = new MelonScene();
  finish(scene.build());
  scene.setFruit(anyPopFruit());
  scene.resetMelon(0);
  let size = '';
  let centred = false;
  let next = rand(2, 3.5);
  const fit = (w: number, h: number) => {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (key === size) return;
    size = key;
    // Framed as if the free band were a strip above the label, which pulls
    // the camera back so the melon sits comfortably inside the card.
    scene.resize(w, h, Math.min(2, window.devicePixelRatio || 1), h * 0.41, h * 0.65);
    scene.shift(0, 0);
    centred = false;
  };

  /** Its picture at this size, in the middle of the card. */
  const show = (w: number, h: number) => {
    fit(w, h);
    const view = scene.render();
    if (centred) return view;
    centred = true;
    const o = offCentre(view, w, h);
    scene.shift(o.x, o.y);
    return scene.render();
  };

  return {
    canvas: scene.canvas,
    update(dt) {
      // Not until the card has sized its scene.
      if (!size) return;
      next -= dt;
      if (next <= 0 && !reducedMotion) {
        next = rand(...EVERY);
        scene.shape.squash.impulse(rand(2.4, 3));
        scene.shape.sway.impulse(rand(-0.4, 0.4));
        scene.shape.face.set('happy', 1.8);
      }
      scene.update(dt);
    },
    render(w, h) {
      show(w, h);
    },
    draw(ctx, x, y, w, h) {
      ctx.drawImage(show(w, h), x, y, w, h);
    },
    poke() {
      scene.shape.squash.impulse(rand(4, 5));
      scene.shape.sway.impulse(rand(-1, 1));
      scene.shape.face.set('happy', 1.4);
    },
  };
}
