import { describe, expect, it } from 'vitest';
import { corners, cutAll, ellipsoid, faceNormal, massProps, most, onSkin, outside, revolve, shell, split, type Plane, type Poly } from '../src/rooms/slice/polyhedron';
import { SLICE_FRUITS } from '../src/rooms/slice/fruits';
import { orderFor, starsFor } from '../src/rooms/slice/game';

const plane = (n: [number, number, number], d = 0): Plane => {
  const l = Math.hypot(...n);
  return { n: [n[0] / l, n[1] / l, n[2] / l], d };
};

describe('slicing', () => {
  const whole = ellipsoid(1, 1, 1, 24, 36);
  const V = massProps(whole).volume;

  it('a tessellated sphere has nearly the sphere volume', () => {
    expect(V / ((4 / 3) * Math.PI)).toBeGreaterThan(0.97);
    expect(V / ((4 / 3) * Math.PI)).toBeLessThan(1.001);
  });

  it('a cut keeps all the fruit and marks one cap on each half', () => {
    const parts = split(whole, plane([0.3, 1, 0.2], 0.25))!;
    expect(parts).not.toBeNull();
    const sum = parts.reduce((s, p) => s + massProps(p).volume, 0);
    expect(sum / V).toBeCloseTo(1, 6);
    for (const p of parts) expect(p.faces.filter((f) => f.cut)).toHaveLength(1);
  });

  it('every face of every piece faces outward', () => {
    let pieces: Poly[] = [whole];
    for (const pl of [plane([1, 0.2, 0], 0.1), plane([0, 1, 0.3], -0.2), plane([0.3, 0.1, 1], 0.05), plane([1, 1, 0], 0.3)]) pieces = cutAll(pieces, pl).pieces;
    for (const p of pieces) {
      const cs = corners(p);
      const c = cs.reduce((a, v) => [a[0] + v[0] / cs.length, a[1] + v[1] / cs.length, a[2] + v[2] / cs.length], [0, 0, 0]);
      for (const f of p.faces) {
        const n = faceNormal(f.pts);
        const m = f.pts.reduce((a, v) => [a[0] + v[0] / f.pts.length, a[1] + v[1] / f.pts.length, a[2] + v[2] / f.pts.length], [0, 0, 0]);
        expect(n[0] * (m[0] - c[0]) + n[1] * (m[1] - c[1]) + n[2] * (m[2] - c[2])).toBeGreaterThan(0);
      }
    }
  });

  it('a plane that misses leaves it whole', () => {
    expect(split(whole, plane([0, 1, 0], 1.2))).toBeNull();
  });

  it('three crossing cuts make eight pieces; three parallel ones make four', () => {
    let crossed: Poly[] = [whole];
    for (const n of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const)
      crossed = cutAll(crossed, plane([n[0], n[1], n[2]])).pieces;
    expect(crossed).toHaveLength(8);

    let parallel: Poly[] = [whole];
    for (const d of [-0.4, 0, 0.4]) parallel = cutAll(parallel, plane([1, 0, 0], d)).pieces;
    expect(parallel).toHaveLength(4);
  });

  it('four cuts in general position reach the most there can be', () => {
    let pieces: Poly[] = [whole];
    const planes = [plane([1, 0.1, 0], 0.05), plane([0, 1, 0.15], -0.05), plane([0.1, 0, 1], 0.08), plane([1, 1, 1], 0.02)];
    for (const p of planes) pieces = cutAll(pieces, p).pieces;
    expect(pieces).toHaveLength(most(4));
    const sum = pieces.reduce((s, p) => s + massProps(p).volume, 0);
    expect(sum / V).toBeCloseTo(1, 5);
  });
});

describe('fruit outlines', () => {
  it('each fruit skin sits at shell depth 1, and its pieces add back up to it', () => {
    for (const f of SLICE_FRUITS) {
      const [rx, ry, rz] = f.radii;
      for (const [th, ph] of [
        [0.4, 0.3],
        [1.5, 2],
        [2.7, 4.4],
      ]) {
        const p = onSkin(f.shape, f.radii, th, ph);
        expect(shell(f.shape, p[0] / rx, p[1] / ry, p[2] / rz)).toBeCloseTo(1, 4);
      }
      const whole = revolve(f.shape, rx, ry, rz, 20, 32);
      const V = massProps(whole).volume;
      let pieces: Poly[] = [whole];
      for (const pl of [plane([1, 0.2, 0], 0.1), plane([0, 1, 0.3], -0.2), plane([0.3, 0.1, 1], 0.05)]) pieces = cutAll(pieces, pl).pieces;
      expect(pieces).toHaveLength(8);
      expect(pieces.reduce((s, p) => s + massProps(p).volume, 0) / V).toBeCloseTo(1, 5);
    }
  });

  it('knows which piece a point on the fruit belongs to', () => {
    const [a, b] = split(ellipsoid(1, 1, 1, 20, 32), plane([1, 0, 0], 0))!;
    const right = outside(a, [0.9, 0, 0]) < outside(b, [0.9, 0, 0]) ? a : b;
    expect(outside(right, [0.5, 0.1, 0])).toBeLessThan(0);
    expect(outside(right, [-0.5, 0.1, 0])).toBeGreaterThan(0);
  });
});

describe('slice orders', () => {
  it('random orders: 2–6 cuts, a count the cuts can make, more than half the most', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const o = orderFor();
      seen.add(o.cuts);
      expect(o.cuts).toBeGreaterThanOrEqual(2);
      expect(o.cuts).toBeLessThanOrEqual(6);
      expect(o.target).toBeLessThanOrEqual(most(o.cuts));
      expect(o.target).toBeGreaterThan(Math.max(o.cuts, most(o.cuts) * 0.45));
    }
    expect(seen.size).toBe(5);
  });

  it('never repeats the last cut count, or a recent order', () => {
    const recent: ReturnType<typeof orderFor>[] = [];
    for (let i = 0; i < 300; i++) {
      const o = orderFor(Math.random, recent);
      if (recent.length) expect(o.cuts).not.toBe(recent[recent.length - 1].cuts);
      expect(recent.slice(-5).some((p) => p.cuts === o.cuts && p.target === o.target)).toBe(false);
      recent.push(o);
    }
  });

  it('stars: three for exactly the order, two for one off, one otherwise', () => {
    expect(starsFor(12, 12)).toBe(3);
    expect(starsFor(13, 12)).toBe(2);
    expect(starsFor(11, 12)).toBe(2);
    expect(starsFor(14, 12)).toBe(1);
    expect(starsFor(6, 12)).toBe(1);
  });
});
