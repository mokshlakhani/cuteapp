import type { Preview } from '../../app/scene';
import { Lab } from './Lab';

/**
 * The home card: a jelly wedge of its own, resting on the table. It does
 * what a resting jelly does — now and then a soft wobble, a blink, a smile —
 * and nothing more: the home screen is a calm place.
 */
export function jellyPreview(): Preview {
  let lab: Lab | null = null;
  let size = '';

  return {
    update(dt) {
      lab?.update(dt);
    },
    draw(ctx, x, y, w, h) {
      if (!lab) lab = new Lab();
      const key = `${Math.round(w)}x${Math.round(h)}`;
      if (key !== size) {
        size = key;
        // The free band a little narrower than the card, above the label: the
        // camera pulls back and the wedge sits comfortably in the middle.
        lab.resize(w, h, Math.min(2, window.devicePixelRatio || 1), h * 0.06, h * 0.76);
      }
      ctx.drawImage(lab.render(), x, y, w, h);
    },
    poke() {
      lab?.hop();
    },
  };
}
