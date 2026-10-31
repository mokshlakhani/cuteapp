import { describe, expect, it } from 'vitest';
import { angleDelta, limitFor, orderFor, Peeler, SPIRAL, spiralAt, starsFor, START_LON, verdict, type Order } from '../src/rooms/peel/game';
import { SLICE_FRUITS } from '../src/rooms/slice/fruits';
import { onSkin, shell } from '../src/rooms/slice/polyhedron';

const ORDER: Order = { turns: 4 };
const LIMIT = limitFor(ORDER.turns);
/** Circle at this rate (rad/s) until done or `most` seconds; returns the peeler. */
function circle(rate: number, order = ORDER, dt = 1 / 60, most = 200) {
  const p = new Peeler(order);
  for (let t = 0; t < most && !p.done; t += dt) p.step(rate * dt, dt);
  return p;
}

describe('peeling', () => {
  it('one circle of the finger is one turn of the spiral', () => {
    const p = new Peeler(ORDER);
    for (let i = 0; i < 60; i++) p.step((Math.PI * 2) / 60, 1 / 30);
    expect(p.s).toBeCloseTo(1 / ORDER.turns, 5);
  });

  it('under the limit it comes off in one strip, at any frame rate', () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 30, 1 / 20]) {
      const p = circle(LIMIT * 0.9, ORDER, dt);
      expect(p.done).toBe(true);
      expect(p.breaks).toBe(0);
    }
  });

  it('rushing snaps it, more the longer you rush, but it always finishes', () => {
    const p = circle(LIMIT * 2);
    expect(p.done).toBe(true);
    expect(p.breaks).toBeGreaterThan(0);
    const worse = circle(LIMIT * 3, { turns: 6 });
    expect(worse.done).toBe(true);
    expect(worse.breaks).toBeGreaterThan(p.breaks - 1);
  });

  it('a short burst of speed is forgiven', () => {
    const p = new Peeler(ORDER);
    for (let i = 0; i < 12; i++) p.step((LIMIT * 1.5) / 60, 1 / 60);
    expect(p.breaks).toBe(0);
    for (let i = 0; i < 120; i++) p.step((LIMIT * 0.5) / 60, 1 / 60);
    expect(p.tension).toBe(0);
  });

  it('resting does no harm, and nothing moves while you rest', () => {
    const p = new Peeler(ORDER);
    p.step(0.5, 1 / 60);
    const s = p.s;
    for (let i = 0; i < 600; i++) expect(p.step(0, 1 / 60)).toBeNull();
    expect(p.s).toBe(s);
    expect(p.tension).toBe(0);
    expect(p.pace).toBeLessThan(0.01);
  });

  it('never snaps below the pace, however long the strip gets', () => {
    for (const turns of [3, 4, 5, 6]) {
      const p = circle(limitFor(turns) * 0.98, { turns });
      expect(p.done).toBe(true);
      expect(p.breaks).toBe(0);
    }
  });

  it('a thinner strip snaps at a gentler pace, and a finger can keep under both', () => {
    for (const turns of [3, 4, 5]) expect(limitFor(turns + 1)).toBeLessThan(limitFor(turns));
    expect(limitFor(6)).toBeGreaterThan(Math.PI);
    expect(limitFor(3)).toBeLessThan(6);
  });

  it('the same pace does the same to every fruit of a width: the rule has nothing random', () => {
    const a = circle(LIMIT * 1.8);
    const b = circle(LIMIT * 1.8);
    expect(a.breaks).toBe(b.breaks);
  });

  it('a stall in input cannot lurch it: one frame counts for only so much', () => {
    const p = new Peeler(ORDER);
    p.step(50, 1 / 60);
    expect(p.s).toBeLessThan(0.05);
    expect(p.breaks).toBe(0);
  });

  it('ignores backward movement and empty frames', () => {
    const p = new Peeler(ORDER);
    p.step(-1, 1 / 60);
    expect(p.s).toBe(0);
    expect(p.step(1, 0)).toBeNull();
    expect(p.s).toBe(0);
  });

  it('a snap gives a moment before the next can tighten', () => {
    const p = new Peeler(ORDER);
    let at = -1;
    for (let i = 0; i < 400 && p.breaks < 2 && !p.done; i++) {
      const was = p.breaks;
      p.step((LIMIT * 3) / 60, 1 / 60);
      if (p.breaks > was) {
        if (at >= 0) expect(i - at).toBeGreaterThan(30);
        at = i;
      }
    }
    expect(p.breaks).toBeGreaterThan(0);
  });

  it('finishes exactly once', () => {
    const p = new Peeler({ turns: 3 });
    let dones = 0;
    for (let i = 0; i < 2000; i++) if (p.step(0.3, 1 / 60) === 'done') dones++;
    expect(dones).toBe(1);
    expect(p.s).toBe(1);
  });
});

describe('the spiral', () => {
  it('runs from crown to base, winding once per turn', () => {
    const a = spiralAt(0, 5);
    const b = spiralAt(1, 5);
    expect(a.th).toBe(SPIRAL.from);
    expect(b.th).toBeCloseTo(SPIRAL.to, 9);
    expect(a.ph).toBe(START_LON);
    expect(b.ph - a.ph).toBeCloseTo(Math.PI * 10, 9);
  });

  it('winds the other way for a fruit turned the other way', () => {
    const a = spiralAt(0.3, 4, 1);
    const b = spiralAt(0.3, 4, -1);
    expect(b.th).toBe(a.th);
    expect(b.ph - START_LON).toBeCloseTo(-(a.ph - START_LON), 9);
  });

  it('stays clear of the poles even with the widest strip', () => {
    const half = (SPIRAL.to - SPIRAL.from) / 3 / 2;
    expect(SPIRAL.from).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(Math.PI / 2);
  });

  it('lies on the skin of every fruit', () => {
    for (const f of SLICE_FRUITS)
      for (const s of [0, 0.3, 0.77, 1]) {
        const { th, ph } = spiralAt(s, 4);
        const p = onSkin(f.shape, f.radii, th, ph);
        expect(shell(f.shape, p[0] / f.radii[0], p[1] / f.radii[1], p[2] / f.radii[2])).toBeCloseTo(1, 3);
      }
  });
});

describe('finger angles', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(0.2, 9);
    expect(angleDelta(-3.1, 3.1)).toBeCloseTo(2 * Math.PI - 6.2, 9);
    expect(angleDelta(3.1, -3.1)).toBeCloseTo(6.2 - 2 * Math.PI, 9);
    expect(angleDelta(1, 1)).toBe(0);
  });
});

describe('peel orders', () => {
  it('three to six turns', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(orderFor().turns);
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('never the same width twice running', () => {
    const recent: Order[] = [];
    for (let i = 0; i < 300; i++) {
      const o = orderFor(Math.random, recent);
      if (recent.length) expect(o.turns).not.toBe(recent[recent.length - 1].turns);
      recent.push(o);
    }
  });

  it('survives a generator that always gives the same number', () => {
    for (const v of [0, 0.5, 0.9999]) expect(orderFor(() => v).turns).toBeGreaterThanOrEqual(3);
  });
});

describe('peel stars', () => {
  it('counts snaps', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(2)).toBe(1);
    expect(starsFor(9)).toBe(1);
    for (const b of [0, 1, 5]) for (const r of [0, 0.9999]) expect(verdict(b, () => r)[0]).toBeTruthy();
  });
});
