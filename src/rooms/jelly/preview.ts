import type { Preview } from '../../app/scene';
import { Lab } from './Lab';

/**
 * The home card: a jelly wedge of its own, resting on the table. It does
 * what a resting jelly does — now and then a soft wobble, a blink, a smile —
 * and nothing more: the home screen is a calm place.
 */
export function jellyPreview(): Preview {
  const lab = new Lab();
  let size = '';
  const fit = (w: number, h: number) => {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (key === size) return;
    size = key;
    // The free band a little narrower than the card, above the label: the
    // camera pulls back and the wedge sits comfortably in the middle.
    lab.resize(w, h, Math.min(2, window.devicePixelRatio || 1), h * 0.06, h * 0.76);
  };

  return {
    canvas: lab.canvas,
    update(dt) {
      // Not until the card has sized its table.
      if (size) lab.update(dt);
    },
    render(w, h) {
      fit(w, h);
      lab.render();
    },
    draw(ctx, x, y, w, h) {
      fit(w, h);
      ctx.drawImage(lab.render(), x, y, w, h);
    },
    poke() {
      lab.hop();
    },
  };
}
