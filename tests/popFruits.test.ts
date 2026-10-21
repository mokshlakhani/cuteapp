import { describe, expect, it } from 'vitest';
import { nextPopFruit, POP_FRUITS } from '../src/rooms/melon/fruits';
import { SLICE_FRUITS } from '../src/rooms/slice/fruits';
import { MELON_R, MelonShape } from '../src/rooms/melon/shape';

describe('pop fruits', () => {
  it('are the same fruits as in slice, each with its own insides', () => {
    expect(POP_FRUITS.map((f) => f.id).sort()).toEqual(SLICE_FRUITS.map((f) => f.id).sort());
    for (const f of POP_FRUITS) {
      expect(f.look.id).toBe(f.id);
      expect(f.aspect).toBeGreaterThan(0.4);
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

  it('deals every fruit once before any comes round again', () => {
    let prev = null;
    // Finish whatever round an earlier test left part dealt.
    for (let i = 0; i < (POP_FRUITS.length - (500 % POP_FRUITS.length)) % POP_FRUITS.length; i++) prev = nextPopFruit(prev);
    for (let round = 0; round < 20; round++) {
      const seen = new Set<string>();
      for (let i = 0; i < POP_FRUITS.length; i++) {
        const f = nextPopFruit(prev);
        if (prev) expect(f.id).not.toBe(prev.id);
        seen.add(f.id);
        prev = f;
      }
      expect(seen.size).toBe(POP_FRUITS.length);
    }
  });

  it('round fruits are shorter, and a lemon tapers to points', () => {
    const melon = new MelonShape();
    const orange = new MelonShape();
    orange.setFruit(0.74, { e: 2, taper: 0 });
    expect(orange.lengthScale).toBeLessThan(melon.lengthScale);
    expect(orange.surfaceAt(0)).toBeCloseTo(MELON_R, 2);
    const lemon = new MelonShape();
    lemon.setFruit(0.86, { e: 1.6, taper: 0 });
    // Narrowing toward its ends faster than an ellipse, to a point.
    expect(lemon.surfaceAt(0.9) / lemon.surfaceAt(0)).toBeLessThan(melon.surfaceAt(0.9) / melon.surfaceAt(0));
    expect(lemon.surfaceAt(0.98)).toBeLessThan(lemon.surfaceAt(0.9) * 0.6);
  });
});
