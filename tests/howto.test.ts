import { describe, expect, it } from 'vitest';
import { HOWTO } from '../src/app/howto';

describe('how to play', () => {
  it('explains every game, in a few steps and tips', () => {
    // The room ids in src/app/rooms.ts (importing it needs a browser).
    const ids = ['melon', 'jelly', 'wrap', 'pour', 'slice', 'peel', 'soap', 'stack'];
    for (const id of ids) {
      const h = HOWTO.find((x) => x.id === id);
      expect(h, id).toBeTruthy();
      expect(h!.goal.length).toBeGreaterThan(10);
      expect(h!.steps.length).toBeGreaterThanOrEqual(3);
      expect(h!.tips.length).toBeGreaterThanOrEqual(1);
    }
    expect(HOWTO.length).toBe(ids.length);
  });
});
