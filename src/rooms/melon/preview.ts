import type { Preview } from '../../app/scene';
import { theme } from '../../design/theme';
import { rand } from '../../core/math';
import { BAND_COLORS, Melon } from './Melon';

/** A little live melon for the home card, wearing a few bands. */
export function melonPreview(): Preview {
  const m = new Melon();
  m.breakAt = 999;
  for (let i = 0; i < 3; i++) {
    const b = m.addBand(0.08 + i * 0.12, 0.08 + i * 0.12, BAND_COLORS[i * 2]);
    b.loose.snap(0);
    b.y.snap(b.y.target);
  }
  m.squash.snap(0);
  m.sway.snap(0);
  return {
    update(dt) {
      m.update(dt);
    },
    draw(ctx, x, y, w, h) {
      m.R = Math.min(w * 0.3, h * 0.27);
      m.cx = x + w / 2;
      m.floorY = y + h * 0.74;
      m.draw(ctx, theme.current);
    },
    poke() {
      m.squash.impulse(rand(5, 7));
      m.sway.impulse(rand(-2, 2));
      m.face.set('happy', 1.4);
    },
  };
}
