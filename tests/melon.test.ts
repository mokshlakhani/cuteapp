import { describe, expect, it } from 'vitest';
import { BAND_COLORS, BREAK_RANGE, Melon, nextBandColor } from '../src/rooms/melon/Melon';
import { Burst } from '../src/rooms/melon/Burst';

function settle(m: Melon, seconds: number) {
  const h = 1 / 120;
  for (let t = 0; t < seconds; t += h) m.update(h);
}

function wrap(m: Melon, n: number, v = 0.12) {
  let color: string | undefined;
  for (let i = 0; i < n; i++) {
    color = nextBandColor(color);
    m.addBand(v, v, color);
    settle(m, 0.05);
  }
  settle(m, 2);
}

function place(): Melon {
  const m = new Melon();
  m.R = 100;
  m.cx = 200;
  m.floorY = 500;
  return m;
}

describe('melon', () => {
  it('pops somewhere between 40 and 65 bands', () => {
    const seen = new Set<number>();
    const m = new Melon();
    for (let i = 0; i < 2000; i++) {
      m.reset();
      expect(m.breakAt).toBeGreaterThanOrEqual(BREAK_RANGE.min);
      expect(m.breakAt).toBeLessThanOrEqual(BREAK_RANGE.max);
      seen.add(m.breakAt);
    }
    expect(BREAK_RANGE).toEqual({ min: 40, max: 65 });
    expect(seen.has(40)).toBe(true);
    expect(seen.has(65)).toBe(true);
  });

  it('is only ready once it reaches its break point', () => {
    const m = place();
    m.breakAt = 52;
    wrap(m, 51);
    expect(m.ready).toBe(false);
    wrap(m, 1);
    expect(m.ready).toBe(true);
  });

  it('never puts two bands of the same colour next to each other', () => {
    expect(new Set(BAND_COLORS).size).toBe(BAND_COLORS.length);
    expect(BAND_COLORS.length).toBeGreaterThanOrEqual(12);
    let prev: string | undefined;
    for (let i = 0; i < 500; i++) {
      const c = nextBandColor(prev);
      expect(c).not.toBe(prev);
      prev = c;
    }
  });

  it('compresses right where a band is placed', () => {
    for (const v of [-0.5, 0.1, 0.55]) {
      const m = place();
      m.breakAt = 99;
      settle(m, 1);
      const before = [-0.6, -0.3, 0, 0.3, 0.6, v].map((y) => m.halfWidth(y));
      wrap(m, 6, v);
      for (const b of m.bands) expect(Math.abs(b.y.value - v)).toBeLessThan(0.1);
      // Squeezed at the band…
      expect(m.halfWidth(v)).toBeLessThan(before[5] * 0.9);
      expect(Math.abs(m.grooveV - v)).toBeLessThan(0.06);
      // …and the volume it pushed out bulges the rest of the melon.
      [-0.6, -0.3, 0, 0.3, 0.6].forEach((y, i) => {
        if (Math.abs(y - v) > 0.3) expect(m.halfWidth(y)).toBeGreaterThanOrEqual(before[i] * 0.999);
      });
    }
  });

  it('squeezes into an hourglass as the bands pile up', () => {
    const m = place();
    m.breakAt = 60;
    settle(m, 1);
    const plainWaist = m.halfWidth(0.12);
    const plainHeight = m.floorY - m.project(0, -1).y;

    wrap(m, 55);
    const waist = m.halfWidth(m.grooveV);
    const upper = Math.max(...[-0.7, -0.6, -0.5, -0.4].map((v) => m.halfWidth(v)));
    const lower = Math.max(...[0.5, 0.6, 0.7].map((v) => m.halfWidth(v)));

    // A deep waist, with round lobes either side that are wider than it.
    expect(Math.abs(m.grooveV - 0.12)).toBeLessThan(0.1);
    expect(waist).toBeLessThan(plainWaist * 0.6);
    expect(upper).toBeGreaterThan(waist * 1.5);
    expect(lower).toBeGreaterThan(waist * 1.5);
    // The squeezed-out volume makes it taller.
    expect(m.floorY - m.project(0, -1).y).toBeGreaterThan(plainHeight * 1.05);
    for (let i = 0; i < m.xs.length; i++) {
      expect(Number.isFinite(m.xs[i])).toBe(true);
      expect(Number.isFinite(m.ys[i])).toBe(true);
    }
  });
});

describe('burst', () => {
  it('turns every band into a strand or a ring and settles on the floor', () => {
    const m = place();
    m.breakAt = 60;
    wrap(m, 60);
    const b = new Burst();
    b.floorY = m.floorY;
    b.width = 400;
    const bands = m.bands.map((band) => ({ color: band.color, y: m.project(0, band.y.value).y, th: 4, rx: m.halfWidth(band.y.value) }));
    b.explode(m.outline(), m.center(), m.R, bands, m.project(0, m.grooveV).y);

    expect(b.strands.length + b.rings.length).toBe(60);
    expect(b.strands.length).toBeGreaterThan(b.rings.length);
    expect(new Set([...b.strands, ...b.rings].map((s) => s.color)).size).toBeGreaterThan(8);
    expect(b.chunks.some((c) => c.shell)).toBe(true);
    expect(b.chunks.some((c) => !c.shell)).toBe(true);

    const h = 1 / 60;
    for (let t = 0; t < 12 && !b.settled; t += h) b.update(h);
    expect(b.settled).toBe(true);
    for (const c of b.chunks) {
      expect(c.y).toBeLessThanOrEqual(b.floorY + c.lane + 1);
      expect(c.x).toBeGreaterThanOrEqual(-1);
      expect(c.x).toBeLessThanOrEqual(401);
    }
    for (const s of b.splats) expect(s.landed).toBe(true);

    for (let t = 0; t < 4 && !b.shrink(h); t += h);
    expect(b.active).toBe(false);
  });
});
