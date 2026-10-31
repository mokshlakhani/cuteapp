import { afterEach, describe, expect, it } from 'vitest';
import { ROOM_ROWS } from '../src/design/tokens';
import { bestFor } from '../src/rooms/home/scores';

const stored = (kept: Record<string, string>) => {
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => kept[k] ?? null, setItem: () => {} };
};

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('bests on the shelf', () => {
  it('reads what each room keeps', () => {
    stored({ 'softspot.soap.v1': '{"best":12}', 'softspot.stack.v1': '{"best":9}', 'softspot.pour.v2': '{"best":6}' });
    expect(bestFor('soap')).toBe(12);
    expect(bestFor('stack')).toBe(9);
    expect(bestFor('pour')).toBe(6);
  });

  it('shows nothing for a room with no best, or none yet, and never stars', () => {
    stored({ 'softspot.soap.v1': '{"best":0}', 'softspot.slice.v1': '{"stars":21}', 'softspot.peel.v1': '{"stars":14}' });
    for (const id of ['melon', 'soap', 'stack', 'slice', 'peel']) expect(bestFor(id)).toBeNull();
  });

  it('comes up clean from anything odd', () => {
    for (const bad of ['{', 'null', '{"best":"x"}', '{"best":-3}', '{"best":null}']) {
      stored({ 'softspot.soap.v1': bad });
      expect(bestFor('soap')).toBeNull();
    }
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(bestFor('soap')).toBeNull();
  });
});

describe('the shelf', () => {
  it('has a place for every game, all the same size', () => {
    expect(ROOM_ROWS * 2).toBe(8);
  });
});
