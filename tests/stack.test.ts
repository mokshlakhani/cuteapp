import { describe, expect, it } from 'vitest';
import { STACK_BEST, STACK_ENDED, STACK_MATCHED } from '../src/rooms/stack/words';
import { landing, leanOf, loadBest, makeStone, REACH, restY, saveBest, seatOf, stoneFor, swayAt, swayFor, TABLE_Y, verdict, type Placed, type Stone } from '../src/rooms/stack/game';

const flat = (a: number, seat = a * 0.5): Stone => ({ a, b: 0.3, seat, bias: 0, round: 3, tone: 0, seed: 1 });
/** Set stones at these places, one on another. */
const tower = (...at: [Stone, number][]) => {
  const t: Placed[] = [];
  for (const [s, x] of at) t.push({ stone: s, x, y: restY(t, s), lean: 0 });
  return t;
};

describe('standing', () => {
  it('a stone centred on another stands, dead steady', () => {
    const r = landing(tower([flat(1), 0], [flat(1), 0]));
    expect(r).toMatchObject({ stable: true, margin: 1 });
  });

  it('a single stone on the table always stands', () => {
    expect(landing(tower([flat(1), REACH])).stable).toBe(true);
  });

  it('stands off-centre while its weight is over the touching part, with less margin', () => {
    const r = landing(tower([flat(1), 0], [flat(1), 0.5]));
    expect(r.stable).toBe(true);
    expect(r.margin).toBeLessThan(0.5);
    expect(r.margin).toBeGreaterThanOrEqual(0);
  });

  it('tips off when its weight is past the edge of the seat below, to that side', () => {
    const right = landing(tower([flat(1), 0], [flat(1), 0.75]));
    expect(right).toMatchObject({ stable: false, from: 1, side: 1 });
    const left = landing(tower([flat(1), 0], [flat(1), -0.75]));
    expect(left).toMatchObject({ stable: false, from: 1, side: -1 });
  });

  it('a stone that misses the tower entirely tips off', () => {
    const r = landing(tower([flat(1), 0], [flat(0.5), 1.6]));
    expect(r).toMatchObject({ stable: false, from: 1 });
    expect(r.side).toBe(1);
  });

  it('a heavy stone on top can bring down a join lower in the tower', () => {
    const r = landing(tower([flat(1.3), 0], [flat(0.6, 0.3), 0.55], [flat(0.8, 0.7), 0.55], [flat(1.3, 1), 1.3]));
    expect(r.stable).toBe(false);
    expect(r.from).toBeLessThan(3);
  });

  it('counterweights: a lopsided stone can be balanced by the one above', () => {
    const lop: Stone = { ...flat(1), bias: 0.42 };
    expect(landing(tower([flat(1), 0], [lop, 0.2])).stable).toBe(false);
    expect(landing(tower([flat(1), 0], [lop, -0.1])).stable).toBe(true);
  });

  it('sits each stone exactly on the one below', () => {
    const a = flat(1);
    const t = tower([a, 0], [a, 0.1], [a, 0.2]);
    expect(t[0].y).toBeCloseTo(TABLE_Y + 0.3, 1);
    expect(t[1].y - t[0].y).toBeCloseTo(0.6, 1);
    expect(t[2].y - t[1].y).toBeCloseTo(0.6, 1);
  });

  it('leans only a little, toward what holds it', () => {
    const t = tower([flat(1), 0]);
    expect(Math.abs(leanOf(t, flat(1), 2))).toBeLessThanOrEqual(0.05);
    expect(leanOf([], flat(1), 1)).toBe(0);
    expect(Math.sign(leanOf(t, flat(1), 0.5))).toBe(-1);
  });
});

describe('stones', () => {
  it('a rounder outline has a smaller seat', () => {
    expect(seatOf(1, 2.5)).toBeLessThan(seatOf(1, 4));
    expect(seatOf(1, 3)).toBeGreaterThan(0.2);
    expect(seatOf(1, 3)).toBeLessThan(1);
  });

  it('lopsided stones stay within reason', () => {
    for (let i = 0; i < 300; i++) {
      const s = makeStone(1, 0.3, 3, 0.28);
      expect(Math.abs(s.bias)).toBeLessThanOrEqual(0.28 * s.seat + 1e-9);
      expect(s.tone).toBeGreaterThanOrEqual(0);
      expect(s.tone).toBeLessThan(6);
    }
  });
});

describe('an endless tower', () => {
  it('starts on a good broad stone, and every stone can sit', () => {
    for (let i = 0; i < 300; i++) {
      const first = stoneFor(0);
      expect(first.seat).toBeGreaterThan(0.5);
      expect(first.bias).toBe(0);
      for (const n of [1, 5, 20, 80, 500]) {
        const s = stoneFor(n);
        expect(s.seat).toBeGreaterThanOrEqual(0.219);
        expect(s.a).toBeGreaterThan(s.seat);
        expect(Number.isFinite(s.b)).toBe(true);
      }
    }
  });

  it('gets a little harder, then holds', () => {
    const avg = (n: number) => Array.from({ length: 3000 }, () => stoneFor(n).seat).reduce((a, b) => a + b, 0) / 3000;
    expect(avg(40)).toBeLessThan(avg(2));
    expect(Math.abs(avg(40) - avg(400))).toBeLessThan(0.02);
  });

  it('can always go on: stones set with care stand, 200 towers of 120', () => {
    for (let i = 0; i < 200; i++) {
      const t: Placed[] = [];
      for (let n = 0; n < 120; n++) {
        const s = stoneFor(n);
        // Set each on the same line, shifted a little against its lopsidedness, as a careful hand would.
        t.push({ stone: s, x: -s.bias * 0.5, y: restY(t, s), lean: 0 });
        if (!landing(t).stable) throw new Error(`fell at ${n}`);
      }
    }
  });

  it('survives a generator that always gives the same number', () => {
    for (const v of [0, 0.5, 0.9999]) for (const n of [0, 1, 50]) expect(stoneFor(n, () => v).seat).toBeGreaterThan(0.21);
  });
});

describe('the sway', () => {
  it('the foot stays still and higher stones move more', () => {
    const big = (level: number) => Math.max(...Array.from({ length: 300 }, (_, i) => Math.abs(swayAt(level, i * 0.1, 1))));
    expect(big(0)).toBe(0);
    expect(big(4)).toBeGreaterThan(big(2));
    expect(big(8)).toBeGreaterThan(big(4));
  });

  it('never swings further than a hand can follow, however tall', () => {
    for (let i = 0; i < 500; i++) expect(Math.abs(swayAt(10 + i * 7, i * 0.13, swayFor()))).toBeLessThan(0.62);
  });

  it('none in a still run', () => {
    expect(swayAt(8, 3, 0)).toBeCloseTo(0, 10);
  });
});

describe('the high score', () => {
  it('says how the run went', () => {
    expect(STACK_BEST).toContain(verdict(12, 12, true)[0]);
    expect(verdict(12, 12, true)[1]).toBe('12 stones');
    expect(STACK_MATCHED).toContain(verdict(12, 12, false)[0]);
    const [title, sub] = verdict(7, 12, false);
    expect(STACK_ENDED).toContain(title);
    expect(sub).toBe('7 stones · your best is 12');
    expect(verdict(1, 3, false)[1]).toBe('1 stone · your best is 3');
  });

  it('keeps it, and comes up clean from anything odd', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadBest()).toBe(0);
    saveBest(9);
    expect(loadBest()).toBe(9);
    for (const bad of ['{', '{"best":-3}', '{"best":"x"}', 'null']) {
      store.set('softspot.stack.v1', bad);
      expect(loadBest()).toBe(0);
    }
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadBest()).toBe(0);
    expect(() => saveBest(3)).not.toThrow();
  });
});

describe('dropping roughly', () => {
  it('a sloppy hand falls well short of a tall tower', () => {
    const run = () => {
      const tower: Placed[] = [];
      for (let n = 0; n < 60; n++) {
        const stone = stoneFor(tower.length);
        tower.push({ stone, x: tower.length ? (Math.random() - 0.5) * 0.3 : 0, y: restY(tower, stone), lean: 0 });
        if (!landing(tower).stable) return tower.length - 1;
      }
      return 60;
    };
    const runs = Array.from({ length: 400 }, run).sort((a, b) => a - b);
    expect(runs[200]).toBeLessThan(25);
  });
});
