import { describe, expect, it } from 'vitest';
import { Glass, PERFECT, SETTLE, type Verdict } from '../src/rooms/pour/Glass';
import { DRINKS } from '../src/rooms/pour/drinks';

const [MILK, SODA] = DRINKS;

function run(g: Glass, seconds: number) {
  const h = 1 / 120;
  for (let t = 0; t < seconds; t += h) g.step(h);
}

/** Pour `amount` steadily over `seconds`, like a held jug. */
function pour(g: Glass, amount: number, seconds = 2) {
  const h = 1 / 120;
  const n = Math.round(seconds / h);
  for (let i = 0; i < n; i++) {
    g.add(amount / n, 0.5, 600);
    g.step(h);
  }
}

describe('a glass being poured', () => {
  it('fills by what goes in, and milk barely froths', () => {
    const g = new Glass(MILK.foamy, 0.7);
    pour(g, 0.4);
    expect(g.level).toBeCloseTo(0.4, 5);
    expect(g.foam).toBeLessThan(0.05);
  });

  it('soda foams up past the drink, then settles back down', () => {
    const g = new Glass(SODA.foamy, 0.7);
    pour(g, 0.3, 1);
    expect(g.foam).toBeGreaterThan(0.15);
    expect(g.top).toBeGreaterThan(g.level + 0.15);
    run(g, 8);
    expect(g.foam).toBe(0);
    expect(g.level).toBeCloseTo(0.3, 5);
  });

  it('runs over the rim instead of overfilling', () => {
    const g = new Glass(MILK.foamy, 0.7);
    let spilled = 0;
    g.events.spill = (x) => (spilled += x);
    pour(g, 1.3);
    run(g, 2);
    expect(g.level).toBe(1);
    expect(g.top).toBeLessThanOrEqual(1 + 1e-6);
    expect(spilled).toBeGreaterThan(0.25);
  });

  it('judges a pour once it has settled', () => {
    const cases: [number, Verdict][] = [
      [0.7, 'perfect'],
      [0.7 - PERFECT * 0.8, 'perfect'],
      [0.5, 'under'],
      [0.85, 'over'],
      [1.2, 'spilled'],
    ];
    for (const [amount, want] of cases) {
      const g = new Glass(MILK.foamy, 0.7);
      const got: Verdict[] = [];
      g.events.verdict = (v) => got.push(v);
      pour(g, amount, 1);
      run(g, SETTLE * 0.5);
      expect(got).toEqual([]);
      run(g, SETTLE + 0.2);
      expect(got, `poured ${amount}`).toEqual([want]);
    }
  });

  it('waits for the foam before judging soda, and pouring more starts again', () => {
    const g = new Glass(SODA.foamy, 0.6);
    const got: Verdict[] = [];
    g.events.verdict = (v) => got.push(v);
    pour(g, 0.25, 1);
    run(g, SETTLE + 0.2);
    expect(got).toEqual([]);
    run(g, 8);
    expect(got).toEqual(['under']);
    // Topping it up in little bursts, letting the foam settle in between.
    while (g.level < 0.59) {
      pour(g, 0.05, 0.3);
      expect(g.verdict).toBe(null);
      run(g, 0.4);
    }
    run(g, 8);
    expect(got).toEqual(['under', 'perfect']);
  });

  it('foams over the rim if soda is poured all at once', () => {
    const g = new Glass(SODA.foamy, 0.6);
    let spilled = 0;
    g.events.spill = (x) => (spilled += x);
    pour(g, 0.5, 1);
    expect(spilled).toBeGreaterThan(0);
    expect(g.level).toBeLessThan(0.6);
  });

  it('ripples where a drop lands, and calms down again', () => {
    const g = new Glass(MILK.foamy, 0.7);
    pour(g, 0.3, 0.5);
    const rough = Math.max(...g.h.map(Math.abs));
    expect(rough).toBeGreaterThan(0.001);
    run(g, 6);
    expect(Math.max(...g.h.map(Math.abs))).toBeLessThan(rough * 0.1);
  });
});
