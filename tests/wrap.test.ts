import { describe, expect, it } from 'vitest';
import { HOLD_MAX, Sheet, type BubbleSize } from '../src/rooms/wrap/Sheet';
import { POPPED_LOOKS } from '../src/rooms/wrap/popped';

function run(s: Sheet, seconds: number) {
  const h = 1 / 240;
  for (let t = 0; t < seconds; t += h) {
    s.step(h);
    s.frame();
    s.update(h);
  }
}

const SIZES: BubbleSize[] = ['small', 'regular', 'jumbo'];

describe('bubble wrap sheet', () => {
  it('lays every bubble fully on the film', () => {
    for (const size of SIZES) {
      const s = new Sheet(350, 560, size, 20, 100, false);
      expect(s.H).toBeLessThanOrEqual(560);
      expect(s.bubbles.length).toBeGreaterThan(10);
      for (const b of s.bubbles) {
        expect(b.u - b.r).toBeGreaterThan(0);
        expect(b.u + b.r).toBeLessThan(s.W);
        expect(b.v - b.r).toBeGreaterThan(0);
        expect(b.v + b.r).toBeLessThan(s.H);
        expect(s.bubbleAt(b.x, b.y)).toBe(b);
      }
    }
  });

  it('pops a bubble held down long enough, and only that one', () => {
    const s = new Sheet(350, 560, 'regular', 0, 0, false);
    const popped: number[] = [];
    s.events.pop = (b) => popped.push(s.bubbles.indexOf(b));
    const b = s.bubbles[8];
    b.pressing = true;
    run(s, b.toughness * 0.5);
    expect(b.popped).toBe(false);
    run(s, b.toughness * 0.6 + 0.02);
    expect(popped).toEqual([8]);
  });

  it('holds out up to four seconds, never longer', () => {
    const s = new Sheet(350, 560, 'regular', 0, 0, false);
    for (const b of s.bubbles) expect(b.toughness).toBeLessThanOrEqual(HOLD_MAX);
    const b = s.bubbles[5];
    b.pressing = true;
    run(s, HOLD_MAX * 0.75);
    expect(b.popped).toBe(false);
    run(s, HOLD_MAX * 0.25 + 0.05);
    expect(b.popped).toBe(true);
  });

  it('feels three steps of resistance, and a full squeeze pops hardest', () => {
    const s = new Sheet(350, 560, 'regular', 0, 0, false);
    const steps: number[] = [];
    const power = new Map<number, number>();
    s.events.strain = (_b, step) => steps.push(step);
    s.events.pop = (b) => power.set(s.bubbles.indexOf(b), b.power);
    s.bubbles[3].pressing = true;
    run(s, HOLD_MAX + 0.1);
    expect(steps).toEqual([1, 2, 3]);
    expect(power.get(3)).toBe(1);
    // A quick tap: pressed for a moment, then let go.
    const tap = s.bubbles[4];
    tap.pressing = true;
    run(s, 0.03);
    tap.pressing = false;
    s.pop(tap, 'press');
    expect(power.get(4)).toBeGreaterThanOrEqual(0.3);
    expect(power.get(4)).toBeLessThan(0.5);
  });

  it('has at least 25 popped looks, all different', () => {
    expect(POPPED_LOOKS.length).toBeGreaterThanOrEqual(25);
    const keys = POPPED_LOOKS.map((l) => `${l.outline}|${l.creases.join('+')}|${l.extra}`);
    expect(new Set(keys).size).toBe(POPPED_LOOKS.length);
  });

  it('gives popped bubbles random looks, never matching a popped neighbour', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 4; k++) {
      const s = new Sheet(350, 560, 'small', 0, 0, false);
      for (const b of s.bubbles) s.pop(b, 'press');
      for (const b of s.bubbles) {
        expect(b.crumple).toBeGreaterThanOrEqual(0);
        expect(b.crumple).toBeLessThan(POPPED_LOOKS.length);
        seen.add(b.crumple);
        for (const o of s.bubbles) {
          if (o !== b && Math.hypot(o.u - b.u, o.v - b.v) < s.pitch * 1.6) expect(o.crumple).not.toBe(b.crumple);
        }
      }
    }
    // Over a few sheets, every look turns up.
    expect(seen.size).toBe(POPPED_LOOKS.length);
  });

  it('knows its rows', () => {
    const s = new Sheet(350, 560, 'regular', 0, 0, false);
    const rows = new Set(s.bubbles.map((b) => b.row));
    let total = 0;
    for (const r of rows) {
      const row = s.rowOf(r);
      expect(row.length).toBeGreaterThanOrEqual(5);
      expect(new Set(row.map((b) => b.v)).size).toBe(1);
      total += row.length;
    }
    expect(total).toBe(s.bubbles.length);
  });

  it('finds every bubble a finger rolls across, in order', () => {
    const s = new Sheet(350, 560, 'regular', 0, 0, false);
    const row = s.bubbles.filter((b) => b.v === s.bubbles[0].v);
    const first = row[0];
    const last = row[row.length - 1];
    const hit = s.bubblesAlong(first.x - first.r * 0.5, first.y, last.x + last.r * 0.5, last.y);
    expect(hit).toEqual(row);
  });

  it('stretches when pulled and snaps back when let go', () => {
    for (const size of SIZES) {
      const s = new Sheet(350, 560, size, 20, 100, false);
      const x = 20 + s.W - 8;
      const y = 100 + s.H / 2;
      expect(s.grab(1, x, y)).toBe(true);
      s.drag(1, x + 90, y);
      run(s, 0.6);
      const most = Math.max(...s.bubbles.map((b) => b.stretch));
      expect(most).toBeGreaterThan(1.12);
      expect(s.bubbles.every((b) => !b.popped)).toBe(true);
      s.release(1);
      run(s, 2.5);
      for (let k = 0; k < s.px.length; k++) {
        expect(Math.hypot(s.px[k] - 20 - s.hx[k], s.py[k] - 100 - s.hy[k])).toBeLessThan(1.5);
      }
    }
  });

  it('pulled hard with two hands, bubbles give way on their own', () => {
    const s = new Sheet(350, 560, 'regular', 20, 100, false);
    const causes = new Set<string>();
    s.events.pop = (_b, cause) => causes.add(cause);
    const y = 100 + s.H / 2;
    s.grab(1, 30, y);
    s.grab(2, 20 + s.W - 10, y);
    s.drag(1, 30 - 220, y);
    s.drag(2, 20 + s.W - 10 + 220, y);
    run(s, 1);
    expect(s.remaining).toBeLessThan(s.bubbles.length);
    expect([...causes]).toEqual(['strain']);
    for (let k = 0; k < s.px.length; k++) expect(Number.isFinite(s.px[k])).toBe(true);
  });
});
