import { describe, expect, it } from 'vitest';
import { flashFor, MEMORY_MAX, MEMORY_MIN, memoryVerdict, nextSize, pickPattern, scoreMemory } from '../src/rooms/wrap/memory';

describe('the bubble memory game', () => {
  it('picks a pattern of different bubbles', () => {
    for (let k = 0; k < 50; k++) {
      const p = pickPattern(40, 7);
      expect(p).toHaveLength(7);
      expect(new Set(p).size).toBe(7);
      for (const i of p) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(40);
    }
    expect(pickPattern(3, 9)).toHaveLength(3);
    for (const v of [0, 0.5, 0.9999]) expect(new Set(pickPattern(20, 5, () => v)).size).toBe(5);
  });

  it('scores a perfect match as perfect', () => {
    const s = scoreMemory([1, 4, 9], [9, 1, 4]);
    expect(s).toMatchObject({ matched: 3, missed: 0, wrong: 0, accuracy: 1, grade: 'perfect' });
  });

  it('counts misses and mistakes against you', () => {
    const missedOne = scoreMemory([1, 2, 3, 4, 5], [1, 2, 3, 4]);
    expect(missedOne).toMatchObject({ matched: 4, missed: 1, wrong: 0, grade: 'close' });
    expect(missedOne.accuracy).toBeCloseTo(0.8, 9);
    const extra = scoreMemory([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6]);
    expect(extra).toMatchObject({ matched: 5, missed: 0, wrong: 1, grade: 'close' });
    expect(extra.accuracy).toBeCloseTo(5 / 6, 9);
    // Popping everything isn't a way round it.
    const all = scoreMemory([1, 2, 3], Array.from({ length: 30 }, (_, i) => i));
    expect(all.grade).toBe('fuzzy');
    expect(scoreMemory([1, 2, 3], [7, 8]).grade).toBe('fuzzy');
  });

  it('grows after a perfect round and shrinks after a rough one, within bounds', () => {
    expect(nextSize(5, 'perfect')).toBe(6);
    expect(nextSize(5, 'close')).toBe(5);
    expect(nextSize(5, 'fuzzy')).toBe(4);
    expect(nextSize(MEMORY_MIN, 'fuzzy')).toBe(MEMORY_MIN);
    expect(nextSize(MEMORY_MAX, 'perfect')).toBe(MEMORY_MAX);
  });

  it('shows bigger patterns a little longer', () => {
    expect(flashFor(8)).toBeGreaterThan(flashFor(4));
    expect(flashFor(MEMORY_MIN)).toBeGreaterThan(1.5);
    expect(flashFor(MEMORY_MIN)).toBeLessThan(2);
    expect(MEMORY_MIN).toBe(4);
  });

  it('says how well it matched', () => {
    const [, sub] = memoryVerdict(scoreMemory([1, 2, 3, 4], [1, 2, 3]), 4);
    expect(sub).toContain('3 of 4');
    expect(sub).not.toContain('%');
    const [, extra] = memoryVerdict(scoreMemory([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 9]), 6);
    expect(extra).toContain('5 of 6');
    expect(extra).not.toContain('extra');
    expect(extra).not.toContain('%');
    expect(memoryVerdict(scoreMemory([1, 2], [1, 2]), 2)[0]).toBeTruthy();
  });
});
