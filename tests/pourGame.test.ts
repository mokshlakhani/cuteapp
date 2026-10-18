import { describe, expect, it } from 'vitest';
import { feedback, nextDrink, PourGame } from '../src/rooms/pour/game';
import { DRINKS } from '../src/rooms/pour/drinks';

describe('the pour game', () => {
  it('counts perfect pours in a row, and any miss starts it over', () => {
    const g = new PourGame();
    g.record('perfect');
    g.record('perfect');
    expect(g.streak).toBe(2);
    for (const miss of ['under', 'over', 'spilled'] as const) {
      g.record('perfect');
      g.record(miss);
      expect(g.streak).toBe(0);
    }
  });

  it('keeps the best streak, and says when it goes up', () => {
    const g = new PourGame(2);
    expect(g.record('perfect')).toBe(false);
    expect(g.record('perfect')).toBe(false);
    expect(g.record('perfect')).toBe(true);
    expect(g.best).toBe(3);
    g.record('under');
    expect(g.best).toBe(3);
    expect(g.record('perfect')).toBe(false);
  });

  it('pours a little faster with the streak, up to a cap', () => {
    const g = new PourGame();
    expect(g.speed).toBe(1);
    g.record('perfect');
    expect(g.speed).toBeGreaterThan(1);
    for (let i = 0; i < 50; i++) g.record('perfect');
    const top = g.speed;
    g.record('perfect');
    expect(g.speed).toBe(top);
    expect(top).toBeLessThan(2);
    g.record('over');
    expect(g.speed).toBe(1);
  });

  it('picks every drink, never the same one twice in a row', () => {
    const seen = new Set<string>();
    let prev = null;
    for (let i = 0; i < 400; i++) {
      const d = nextDrink(DRINKS, prev);
      if (prev) expect(d.id).not.toBe(prev.id);
      seen.add(d.id);
      prev = d;
    }
    expect([...seen].sort()).toEqual(['boba', 'cola', 'lemonade', 'milk']);
  });

  it('counts how many glasses of each drink came before', () => {
    const g = new PourGame();
    expect(g.serve('boba')).toBe(0);
    expect(g.serve('milk')).toBe(0);
    expect(g.serve('boba')).toBe(1);
    expect(g.serve('boba')).toBe(2);
  });

  it('says how far off a miss was', () => {
    expect(feedback('under', 0.6, 0.65, 0)).toEqual(['so close', '5% under the line']);
    expect(feedback('under', 0.4, 0.65, 0)[0]).toBe('a bit short');
    expect(feedback('over', 0.75, 0.65, 0)).toEqual(['a little too much', '10% over the line']);
    expect(feedback('perfect', 0.65, 0.65, 4, () => 0)).toEqual(['perfect', '4 in a row']);
  });
});
