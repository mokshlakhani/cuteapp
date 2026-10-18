import { describe, expect, it } from 'vitest';
import { nextPopFruit, PATTERNS, POP_FRUITS } from '../src/rooms/melon/fruits';
import { MELON_R, MelonShape } from '../src/rooms/melon/shape';

describe('pop fruits', () => {
  it('has plenty of fruits, each with its own skin and insides', () => {
    expect(POP_FRUITS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(POP_FRUITS.map((f) => f.id)).size).toBe(POP_FRUITS.length);
    for (const f of POP_FRUITS) {
      expect(PATTERNS).toContain(f.skin.pattern);
      expect(f.shards[0]).toBeGreaterThan(0);
      expect(f.shards[1]).toBeGreaterThanOrEqual(f.shards[0]);
      expect(f.rind.thick).toBeGreaterThan(0);
    }
  });

  it('brings a different fruit each time, and every fruit comes round', () => {
    const seen = new Set<string>();
    let prev = null;
    for (let i = 0; i < 500; i++) {
      const f = nextPopFruit(prev);
      if (prev) expect(f.id).not.toBe(prev.id);
      seen.add(f.id);
      prev = f;
    }
    expect(seen.size).toBe(POP_FRUITS.length);
  });

  it('round fruits are shorter, and a lemon tapers to points', () => {
    const melon = new MelonShape();
    const orange = new MelonShape();
    orange.setFruit(0.74, 'ellipse');
    expect(orange.lengthScale).toBeLessThan(melon.lengthScale);
    expect(orange.surfaceAt(0)).toBeCloseTo(MELON_R, 2);
    const lemon = new MelonShape();
    lemon.setFruit(0.86, 'lemon');
    // Fuller than an ellipse in the middle, and pointed toward the ends.
    expect(lemon.surfaceAt(0.5)).toBeGreaterThan(melon.surfaceAt(0.5));
    expect(lemon.surfaceAt(0.98)).toBeLessThan(lemon.surfaceAt(0.9) * 0.6);
  });
});
