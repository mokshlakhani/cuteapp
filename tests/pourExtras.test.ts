import { describe, expect, it } from 'vitest';
import { GlassExtras, iceCount, pearlCount } from '../src/rooms/pour/extras';
import { Glass } from '../src/rooms/pour/Glass';

/** Pour steadily until the surface reaches `f`; returns how much went in. */
function pourTo(glass: Glass, f: number) {
  let vol = 0;
  while (glass.level < f) {
    glass.add(0.001, 0.5, 300);
    vol += 0.001;
  }
  return vol;
}

describe('pearls and ice', () => {
  it('come in greater numbers each time the drink comes round, up to a cap', () => {
    for (const count of [pearlCount, iceCount]) {
      expect(count(1)).toBeGreaterThan(count(0));
      expect(count(2)).toBeGreaterThan(count(1));
      expect(count(50)).toBe(count(99));
    }
    expect(new GlassExtras('pearls', 0).count).toBe(pearlCount(0));
    expect(new GlassExtras('ice', 3).count).toBe(iceCount(3));
  });

  it('take up room, so less drink reaches the same line, and less again with more of them', () => {
    const plain = new Glass(0, 0.6);
    const used = [pourTo(plain, 0.6)];
    for (const kind of ['pearls', 'ice'] as const) {
      let prev = used[0];
      for (const round of [0, 2, 5]) {
        const extras = new GlassExtras(kind, round);
        const glass = new Glass(0, 0.6);
        glass.solidAt = (f) => extras.solidAt(f);
        const vol = pourTo(glass, 0.6);
        expect(vol).toBeLessThan(prev);
        prev = vol;
      }
    }
  });

  it('never fill the glass solid, and take up no room above where they sit', () => {
    const extras = new GlassExtras('pearls', 99);
    for (let f = 0; f <= 1; f += 0.01) expect(extras.solidAt(f)).toBeLessThanOrEqual(0.8);
    expect(extras.solidAt(extras.top + 0.01)).toBe(0);
    expect(extras.top).toBeLessThan(0.45);
  });
});
