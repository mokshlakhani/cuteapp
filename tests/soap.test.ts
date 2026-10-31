import { describe, expect, it } from 'vitest';
import { burstAt, callFor, filmFor, loadBest, NEAR, offBy, orderFor, OVER, PUFF, radiusOf, rateAt, Run, saveBest, SIZE, THINGS, type Film, type Order, type Pace } from '../src/rooms/soap/game';

const PACES: Pace[] = ['slow', 'steady', 'brisk', 'gusty'];

/** How big a bubble is after holding this long (as the room steps it). */
function blown(pace: Pace, seconds: number, dt = 1 / 60) {
  let s = 0;
  for (let t = 0; t < seconds; t += dt) s += rateAt(pace, t, s) * dt;
  return s;
}

/** How long a bubble spends between its ring and popping by itself. */
function window(pace: Pace, target: number, dt = 1 / 120) {
  let s = 0;
  let t = 0;
  while (s < target) s += rateAt(pace, (t += dt), s) * dt;
  const on = t;
  while (s < burstAt(target)) s += rateAt(pace, (t += dt), s) * dt;
  return t - on;
}

describe('soap orders', () => {
  it('sizes all within reach', () => {
    for (let i = 0; i < 1000; i++) {
      const o = orderFor();
      expect(o.size).toBeGreaterThanOrEqual(SIZE.min - 0.01);
      expect(o.size).toBeLessThanOrEqual(SIZE.max + 0.01);
      expect(o.size).toBeGreaterThan(PUFF);
      expect(PACES).toContain(o.pace);
    }
  });

  it('survives a generator that always gives the same number', () => {
    for (const v of [0, 0.5, 0.9999]) {
      const o = orderFor(() => v, orderFor(() => v));
      expect(o.size).toBeGreaterThan(0);
      expect(o.pace).toBeDefined();
    }
  });

  it('keeps changing: each size moves on from the last', () => {
    let last: Order | undefined;
    for (let i = 0; i < 400; i++) {
      const o = orderFor(Math.random, last);
      if (last) expect(Math.abs(last.size - o.size)).toBeGreaterThanOrEqual(0.12);
      last = o;
    }
  });
});

describe('the breath', () => {
  it('always grows, whatever the pace', () => {
    for (const p of PACES) for (let t = 0; t < 30; t += 0.03) for (const s of [0, 0.5, 1.1]) expect(rateAt(p, t, s)).toBeGreaterThan(0);
  });

  it('gives time to react: reaching any ring takes more than a second', () => {
    for (const p of PACES) expect(blown(p, 1)).toBeLessThan(0.75);
    expect(blown('brisk', 1.6)).toBeGreaterThan(SIZE.min);
  });

  it('comes out the same at 60 and 120 Hz', () => {
    for (const p of PACES) expect(Math.abs(blown(p, 2, 1 / 60) - blown(p, 2, 1 / 120))).toBeLessThan(0.02);
  });
});

describe('popping by itself', () => {
  it('goes exactly 8% past the ring, at every size', () => {
    expect(OVER).toBe(0.08);
    for (let s = SIZE.min; s <= SIZE.max; s += 0.01) expect(radiusOf(burstAt(s)) / radiusOf(s)).toBeCloseTo(1 + OVER, 9);
  });

  it('leaves a fair moment to let go, big bubble or small, at a steady breath', () => {
    for (const target of [SIZE.min, 0.5, SIZE.max]) {
      expect(window('steady', target)).toBeGreaterThan(0.3);
      expect(window('brisk', target)).toBeGreaterThan(0.2);
    }
  });

  it('the biggest pop still fits on the screen the room frames', () => {
    expect(radiusOf(burstAt(SIZE.max))).toBeLessThan(2.05);
  });
});

describe('the word beside the bubble', () => {
  it('says perfect on the ring, either side', () => {
    expect(callFor(0.5, 0.5)).toBe('perfect');
    expect(Math.abs(offBy(0.51, 0.5))).toBeLessThan(NEAR.exact);
    expect(callFor(0.51, 0.5)).toBe('perfect');
    expect(callFor(0.49, 0.5)).toBe('perfect');
  });

  it('says so close nearby, the same either side', () => {
    expect(callFor(0.56, 0.5)).toBe('so close');
    expect(callFor(0.44, 0.5)).toBe('so close');
  });

  it('otherwise says which way it missed', () => {
    expect(callFor(0.3, 0.5)).toBe('a bit small');
    expect(callFor(0.58, 0.5)).toBe('a bit big');
    expect(0.58).toBeLessThan(burstAt(0.5));
  });

  it('a bit big never reaches the size that would have popped', () => {
    for (let s = SIZE.min; s <= SIZE.max; s += 0.01) expect(offBy(burstAt(s), s)).toBeGreaterThan(NEAR.close);
  });
});

describe('every film its own', () => {
  it('never the same family twice running, and all of them turn up', () => {
    const seen = new Set<number>();
    let last: Film | undefined;
    for (let i = 0; i < 600; i++) {
      const f = filmFor(Math.random, last);
      if (last) expect(f.kind).not.toBe(last.kind);
      seen.add(f.kind);
      last = f;
    }
    expect(seen.size).toBe(6);
  });

  it('stays in the range real films show colour, and thins toward the crown', () => {
    for (let i = 0; i < 600; i++) {
      const f = filmFor();
      expect(f.thin).toBeGreaterThan(100);
      expect(f.thick).toBeLessThan(1200);
      expect(f.thin).toBeLessThan(f.thick);
    }
  });

  it('catches two different little things, neither from the last bubble, and in time all ten', () => {
    const seen = new Set<number>();
    let last: Film | undefined;
    for (let i = 0; i < 600; i++) {
      const f = filmFor(Math.random, last);
      const [a, b] = f.things;
      expect(a).not.toBe(b);
      for (const t of f.things) {
        expect(Number.isInteger(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(THINGS);
        if (last) expect(last.things).not.toContain(t);
        seen.add(t);
      }
      last = f;
    }
    expect(seen.size).toBe(THINGS);
  });

  it('survives a generator that always gives the same number', () => {
    for (const v of [0, 0.5, 0.9999]) {
      const a = filmFor(() => v);
      const b = filmFor(() => v, a);
      expect(b.kind).not.toBe(a.kind);
      expect(b.things[0]).not.toBe(b.things[1]);
    }
  });
});

describe('a run of bubbles', () => {
  it('counts every bubble, and a first run sets the high score quietly', () => {
    const r = new Run();
    expect([r.add(), r.add(), r.add()]).toEqual([false, false, false]);
    expect(r).toMatchObject({ count: 3, best: 3 });
  });

  it('a pop starts the count again and leaves the high score standing', () => {
    const r = new Run(5);
    r.add();
    r.add();
    r.end();
    expect(r).toMatchObject({ count: 0, best: 5 });
  });

  it('matching the high score is not beating it, and it only says so once a run', () => {
    const r = new Run(2);
    expect([r.add(), r.add(), r.add(), r.add()]).toEqual([false, false, true, false]);
    expect(r.best).toBe(4);
    r.end();
    for (let i = 0; i < 4; i++) expect(r.add()).toBe(false);
    expect(r.add()).toBe(true);
  });

  it('keeps the high score, and comes up clean from anything odd', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadBest()).toBe(0);
    saveBest(9);
    expect(loadBest()).toBe(9);
    for (const bad of ['{', '{"best":-3}', '{"best":"x"}', 'null']) {
      store.set('softspot.soap.v1', bad);
      expect(loadBest()).toBe(0);
    }
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadBest()).toBe(0);
    expect(() => saveBest(3)).not.toThrow();
  });
});

describe('the sheet of little things', () => {
  it('has exactly as many drawings as the rules pick from', async () => {
    const src = (await import('node:fs')).readFileSync('src/rooms/soap/things.ts', 'utf8');
    const body = src.slice(src.indexOf('DRAWINGS: Draw[] = ['), src.indexOf('/** The sheet'));
    expect(body.match(/^  \(c\) => \{/gm)).toHaveLength(THINGS);
  });
});
