import type { Preview } from '../../app/scene';
import { rand } from '../../core/math';
import { reducedMotion } from '../../render/camera';
import { SliceScene } from './SliceScene';
import { SLICE_FRUITS } from './fruits';
import { norm, type V3 } from './polyhedron';

/** Seconds between its quiet cuts. */
const EVERY: [number, number] = [5.5, 8];

/**
 * The home card: a fruit of its own floating over the board and turning
 * slowly. Every so often a seam glows across it, as if a knife had passed;
 * after a few it's swapped for a fresh fruit. Nothing falls apart here: the
 * home screen is a calm place.
 */
export function slicePreview(): Preview {
  const scene = new SliceScene();
  let fruit = Math.floor(Math.random() * SLICE_FRUITS.length);
  scene.setFruit(SLICE_FRUITS[fruit]);
  const seam = () => {
    const n = norm([rand(-1, 1), rand(-1, 1), rand(-1, 1)] as V3);
    scene.cutLocal(n, rand(-0.25, 0.25));
  };
  seam();
  seam();
  let size = '';
  let next = rand(2, 3.5);
  const fit = (w: number, h: number) => {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (key === size) return;
    size = key;
    // Above the label, with room round it so the fruit never touches the card's edge.
    scene.resize(w, h, Math.min(2, window.devicePixelRatio || 1), 0, h * 0.7, 1.2);
  };

  return {
    canvas: scene.canvas,
    update(dt) {
      if (!size) return;
      next -= dt;
      if (next <= 0 && !reducedMotion) {
        next = rand(...EVERY);
        if (scene.cutCount >= 4) {
          fruit = (fruit + 1) % SLICE_FRUITS.length;
          scene.setFruit(SLICE_FRUITS[fruit]);
          seam();
        } else seam();
        scene.squash.impulse(-1.6);
        scene.face.set('surprised', 1);
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
      scene.squash.impulse(rand(-4, -3));
      scene.sway.impulse(rand(-1.5, 1.5));
      scene.face.set('happy', 1.4);
    },
  };
}
