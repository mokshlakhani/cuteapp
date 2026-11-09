import { describe, expect, it, beforeEach } from 'vitest';
import { CATALOG } from '../src/app/catalog';
import { HOWTO } from '../src/app/howto';
import { tile } from '../src/design/tokens';
import { icons } from '../src/design/icons';
import { TOYS, playUrl, toy } from '../src/site/toys';
import { readShelf } from '../src/site/shelf';

describe('the website’s shelf', () => {
  it('shows every game in the catalog, in order', () => {
    expect(TOYS.map((t) => t.id)).toEqual(CATALOG.map((c) => c.id));
  });

  it('has a how-to, tile colours, a screenshot and a gesture icon for every toy', () => {
    for (const t of TOYS) {
      expect(HOWTO.find((h) => h.id === t.id), t.id).toBeTruthy();
      expect(tile[t.id], t.id).toBeTruthy();
      expect(t.shot, t.id).toMatch(/\.webp/);
      expect(icons[t.gesture], t.id).toBeTruthy();
      expect(t.howto.steps.length, t.id).toBeGreaterThan(0);
    }
  });

  it('never promises stars: no toy keeps them any more', () => {
    for (const t of TOYS) expect(t.keeps).not.toMatch(/star/);
  });

  it('links into the game, straight to a room when asked', () => {
    // The website is in site/; the game is one folder up, at the root.
    expect(playUrl()).toBe('../');
    expect(playUrl('soap')).toBe('../?room=soap');
    expect(toy('pour')?.name).toBe('pour');
    expect(toy('nope')).toBeNull();
  });
});

describe('your shelf', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it('is empty before anything is played', () => {
    expect(readShelf()).toEqual([]);
  });

  it('reads what the rooms keep, with kind words', () => {
    store.set('softspot.pour.v2', JSON.stringify({ best: 3, drink: 'milk' }));
    store.set('softspot.soap.v1', JSON.stringify({ best: 1 }));
    store.set('softspot.stack.v1', JSON.stringify({ best: 9 }));
    const rows = readShelf();
    expect(rows.map((r) => [r.id, r.value])).toEqual([
      ['pour', 3],
      ['soap', 1],
      ['stack', 9],
    ]);
    expect(rows[1].unit(1)).toBe('bubble held in a row');
    expect(rows[2].unit(9)).toBe('stones tall');
  });

  it('leaves out zeros, junk and the starting bubble pattern', () => {
    store.set('softspot.pour.v2', JSON.stringify({ best: 0 }));
    store.set('softspot.soap.v1', '{not json');
    store.set('softspot.stack.v1', JSON.stringify({ best: 'tall' }));
    store.set('softspot.wrap.memory.v1', JSON.stringify({ size: 5 }));
    expect(readShelf()).toEqual([]);
    store.set('softspot.wrap.memory.v1', JSON.stringify({ size: 7 }));
    expect(readShelf().map((r) => r.id)).toEqual(['wrap']);
  });

  it('never throws when storage is unavailable', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('private mode');
      },
    };
    expect(readShelf()).toEqual([]);
  });
});
