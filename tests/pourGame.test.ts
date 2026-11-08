import { describe, expect, it } from 'vitest';
import { feedback, flowFactor, nextDrink, PourGame } from '../src/rooms/pour/game';
import { drink } from '../src/rooms/pour/drinks';
import { Glass, PERFECT } from '../src/rooms/pour/Glass';
import {
  CLOSE_SUBS,
  CLOSE_TITLES,
  deal,
  OVER_TITLES,
  PERFECT_SUBS,
  PERFECT_TITLES,
  resetWords,
  SHORT_TITLES,
  SPILL_TITLES,
  WORD_COUNT,
} from '../src/rooms/pour/words';
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
    expect([...seen].sort()).toEqual(['boba', 'cocoa', 'cola', 'lemonade', 'milk']);
  });

  it('counts how many glasses of each drink came before', () => {
    const g = new PourGame();
    expect(g.serve('boba')).toBe(0);
    expect(g.serve('milk')).toBe(0);
    expect(g.serve('boba')).toBe(1);
    expect(g.serve('boba')).toBe(2);
  });

  it('says kindly how it went, from the right list', () => {
    const [ct, cs] = feedback('under', 0.6, 0.65, 0);
    expect(CLOSE_TITLES).toContain(ct);
    expect(CLOSE_SUBS).toContain(cs);
    expect(SHORT_TITLES).toContain(feedback('under', 0.4, 0.65, 0)[0]);
    expect(OVER_TITLES).toContain(feedback('over', 0.75, 0.65, 0)[0]);
    expect(SPILL_TITLES).toContain(feedback('spilled', 1, 0.65, 0)[0]);
    const [pt, ps] = feedback('perfect', 0.65, 0.65, 4);
    expect(PERFECT_TITLES).toContain(pt);
    expect(ps).toContain('4');
    expect(PERFECT_SUBS).toContain(feedback('perfect', 0.65, 0.65, 0)[1]);
  });

  it('has about a hundred things to say', () => {
    expect(WORD_COUNT).toBeGreaterThanOrEqual(100);
  });

  it('never says the same thing twice running, and says it all before repeating', () => {
    resetWords();
    const seen: string[] = [];
    for (let i = 0; i < PERFECT_TITLES.length * 3; i++) seen.push(deal(PERFECT_TITLES));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen.slice(0, PERFECT_TITLES.length)).size).toBe(PERFECT_TITLES.length);
  });

  it('gives every drink its own way of pouring', () => {
    const ways = DRINKS.map((d) => [d.ramp, d.glug, d.steam, d.foamFade, d.window].join('|'));
    expect(new Set(ways).size).toBe(DRINKS.length);
  });

  it('pours milk steadily, and with the most room either side of the line', () => {
    const milk = drink('milk');
    expect(flowFactor(milk, 0)).toBe(flowFactor(milk, 3));
    for (const d of DRINKS) expect(milk.window).toBeGreaterThanOrEqual(d.window);
  });

  it('starts bubble tea slow and builds it up', () => {
    const boba = drink('boba');
    expect(flowFactor(boba, 0)).toBeLessThan(0.5);
    expect(flowFactor(boba, 0.8)).toBeLessThan(flowFactor(boba, 1.6));
    expect(flowFactor(boba, 3)).toBeGreaterThan(1);
  });

  it('pours lemonade in glugs that come to about its usual flow', () => {
    const lem = drink('lemonade');
    const g = lem.glug!;
    expect(flowFactor(lem, g * 0.5)).toBeGreaterThan(1.5);
    expect(flowFactor(lem, g)).toBeLessThan(0.5);
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += flowFactor(lem, (i / 1000) * g * 4);
    expect(sum / 1000).toBeCloseTo(lem.flow, 1);
  });

  it('never stops lemonade between glugs, so any line can be reached', () => {
    const lem = drink('lemonade');
    // Pour it a step at a time: the level climbs without a jump bigger than
    // the window, so letting go at the right moment always lands on the line.
    let level = 0;
    let biggestStep = 0;
    const dt = 1 / 60;
    for (let t = 0; t < 4; t += dt) {
      const k = flowFactor(lem, t);
      expect(k).toBeGreaterThanOrEqual(0.2 * lem.flow);
      const step = 0.24 * 1.6 * k * dt;
      biggestStep = Math.max(biggestStep, step);
      level += step;
    }
    expect(biggestStep).toBeLessThan(lem.window);
    // One glug's worth is smaller than before (it was ~0.17 of the glass).
    let glug = 0;
    for (let t = 0; t < lem.glug!; t += dt) glug += 0.24 * flowFactor(lem, t) * dt;
    expect(glug).toBeLessThan(0.13);
  });

  it('steams up hot cocoa, and lets cola foam settle slowly', () => {
    expect(drink('cocoa').steam).toBe(true);
    const fizzy = new Glass(1, 0.5);
    fizzy.foamFade = drink('cola').foamFade!;
    const quick = new Glass(1, 0.5);
    for (const g of [fizzy, quick]) g.add(0.2, 0.5, 600);
    fizzy.step(0.5);
    quick.step(0.5);
    expect(fizzy.foam).toBeGreaterThan(quick.foam);
  });

  it('judges each drink by its own window', () => {
    const g = new Glass(0, 0.6);
    g.window = 0.065;
    g.add(0.66, 0.5, 300);
    for (let i = 0; i < 60; i++) g.step(1 / 30);
    expect(g.verdict).toBe('perfect');
  });

  it('counts 1% further either side of the line than it used to', () => {
    expect(PERFECT).toBe(0.05);
    expect(drink('milk').window).toBe(0.065);
    for (const d of DRINKS) expect(d.window).toBeGreaterThanOrEqual(0.05);
  });
});
