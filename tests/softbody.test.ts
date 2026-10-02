import { describe, expect, it } from 'vitest';
import { SoftBody } from '../src/rooms/jelly/SoftBody';
import { JellyWorld } from '../src/rooms/jelly/JellyWorld';
import { FRUITS, fruitById } from '../src/rooms/jelly/fruits';

function box() {
  const w = new JellyWorld();
  w.left = 0;
  w.right = 400;
  w.top = 0;
  w.floor = 700;
  return w;
}

const run = (w: JellyWorld, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) w.step(1 / 60);
};

describe('SoftBody', () => {
  it('keeps its shape resting on the floor (gentle sag, no collapse)', () => {
    for (const R of [18, 28, 60, 90]) {
      const w = box();
      const b = w.add(SoftBody.fromFruit(FRUITS[1], R, 200, 700 - R - 40));
      run(w, 3);
      const h = b.maxY - b.minY;
      expect(Number.isFinite(h)).toBe(true);
      expect(h / (2 * R)).toBeGreaterThan(0.82);
      expect((b.maxX - b.minX) / (2 * R)).toBeLessThan(1.2);
    }
  });

  it('springs back after being squished', () => {
    const w = box();
    const b = w.add(SoftBody.fromFruit(FRUITS[0], 70, 200, 600));
    run(w, 1);
    b.squish.target = 0.34;
    run(w, 0.6);
    const squashed = b.maxY - b.minY;
    b.squish.target = 0;
    run(w, 2);
    expect(b.maxY - b.minY).toBeGreaterThan(squashed * 1.15);
  });

  it('does not let a fast jelly tunnel into another', () => {
    const w = box();
    const bottom = w.add(SoftBody.fromFruit(fruitById('orange'), 70, 200, 620));
    const top = w.add(SoftBody.fromFruit(fruitById('kiwi'), 70, 205, 300));
    for (let i = 0; i < top.n; i++) top.vy[i] = 2200;
    run(w, 3);
    const d = Math.hypot(top.cx - bottom.cx, top.cy - bottom.cy);
    expect(d).toBeGreaterThan(0.75 * (top.R + bottom.R));
    for (const b of [top, bottom]) expect(Math.abs(b.area) / b.restArea).toBeGreaterThan(0.8);
  });

  it('cuts into two pieces that keep the total area', () => {
    const w = box();
    const b = w.add(SoftBody.fromFruit(fruitById('orange'), 70, 200, 400));
    w.gravity = 0;
    run(w, 0.2);
    const cs = b.crossings(100, 380, 300, 420);
    expect(cs.length).toBe(2);
    const pieces = b.split(cs[0], cs[1], 9);
    expect(pieces).not.toBeNull();
    const total = pieces!.reduce((s, p) => s + p.restArea, 0);
    expect(total / b.restArea).toBeGreaterThan(0.9);
    expect(total / b.restArea).toBeLessThan(1.1);
    expect(pieces!.every((p) => p.skin.some((f) => !f))).toBe(true);
  });
});

describe('slicing stress', () => {
  it('stays finite through many random cuts in a crowded box', () => {
    for (let trial = 0; trial < 5; trial++) {
      const w = new JellyWorld();
      w.right = 390;
      w.floor = 650;
      w.top = 40;
      for (let i = 0; i < 6; i++) w.add(SoftBody.fromFruit(FRUITS[i], 58, 60 + i * 55, 500));
      run(w, 1);
      let seed = trial + 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 30; k++) {
        const y = 480 + rnd() * 170;
        const y2 = y + (rnd() - 0.5) * 120;
        for (const b of [...w.bodies]) {
          const cs = b.crossings(0, y, 390, y2);
          if (cs.length < 2) continue;
          const pieces = b.split(cs[0], cs[1], 12);
          if (pieces) w.bodies.splice(w.bodies.indexOf(b), 1, ...pieces);
        }
        while (w.bodies.length > 24) w.bodies.shift();
        run(w, 0.1);
        for (const b of w.bodies) {
          expect(Number.isFinite(b.cx) && Number.isFinite(b.cy)).toBe(true);
          expect(Math.abs(b.area)).toBeLessThan(b.restArea * 3);
        }
      }
    }
  }, 30000);
});
