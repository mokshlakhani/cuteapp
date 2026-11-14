import { describe, expect, it } from 'vitest';
import { corners, cutAll, ellipsoid, faceNormal, massProps, most, onSkin, outside, repeatsCut, revolve, shell, snapPlane, split, type Plane, type Poly } from '../src/rooms/slice/polyhedron';
import { SLICE_FRUITS } from '../src/rooms/slice/fruits';
import { orderFor } from '../src/rooms/slice/game';

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
});

describe('cuts through a common point', () => {
  const whole = ellipsoid(1, 1, 1, 24, 36);
  const V = massProps(whole).volume;
  /** A plane holding the line through (px, 0, pz) along y, turned `deg` round it, then nudged `miss` off it. */
  const through = (px: number, pz: number, deg: number, miss = 0): Plane => {
    const a = (deg * Math.PI) / 180;
    const n: [number, number, number] = [Math.cos(a), 0, Math.sin(a)];
    return { n, d: n[0] * px + n[2] * pz + miss };
  };
  /** Cut as the room does: line each cut up with the ones before, then throw away only real slivers. */
  const slice = (planes: Plane[], min: number, snap: boolean) => {
    let pieces: Poly[] = [whole];
    const made: Plane[] = [];
    for (const raw of planes) {
      const pl = snap ? snapPlane(raw, made, 1, 0.12) : raw;
      const res = cutAll(pieces, pl, V * min, made.length);
      if (!res.split) continue;
      pieces = res.pieces;
      made.push(pl);
    }
    return pieces;
  };

  it('three cuts through one line make six pieces', () => {
    for (const [px, pz] of [
      [0, 0],
      [0.3, 0.2],
      [0.55, -0.35],
    ])
      expect(slice([through(px, pz, 10), through(px, pz, 70), through(px, pz, 130)], 0.0006, true)).toHaveLength(6);
  });

  it('a third cut that just misses the crossing still makes six, wherever the crossing is', () => {
    for (const [px, pz] of [
      [0, 0],
      [0.3, 0.2],
      [0.55, -0.35],
      [-0.6, 0.4],
      [0.75, 0.35],
      [0.85, 0.2],
    ])
      for (const miss of [-0.1, -0.06, -0.03, -0.01, 0.01, 0.03, 0.06, 0.1]) {
        const pieces = slice([through(px, pz, 10), through(px, pz, 70), through(px, pz, 130, miss)], 0.0006, true);
        expect(pieces, `at ${px},${pz} missing by ${miss}`).toHaveLength(6);
        expect(pieces.reduce((s, p) => s + massProps(p).volume, 0) / V).toBeCloseTo(1, 5);
      }
  });

  it('four cuts through one line make eight', () => {
    expect(slice([through(0.2, 0.1, 0), through(0.2, 0.1, 45, 0.02), through(0.2, 0.1, 90, -0.03), through(0.2, 0.1, 135, 0.04)], 0.0006, true)).toHaveLength(8);
  });

  it('a cut that clearly misses the crossing is left as drawn, and makes its seventh piece', () => {
    const third = through(0, 0, 130, 0.3);
    expect(snapPlane(third, [through(0, 0, 10), through(0, 0, 70)], 1, 0.12)).toBe(third);
    expect(slice([through(0, 0, 10), through(0, 0, 70), third], 0.0006, true)).toHaveLength(7);
  });

  it('a cut on top of one already made is a repeat; one beside it is not', () => {
    const made = [through(0, 0, 10)];
    expect(repeatsCut(through(0, 0, 11, 0.01), made, 1, 0.06)).toBe(true);
    expect(repeatsCut(through(0, 0, 190, -0.01), made, 1, 0.06)).toBe(true);
    expect(repeatsCut(through(0, 0, 10, 0.2), made, 1, 0.06)).toBe(false);
    expect(repeatsCut(through(0, 0, 40), made, 1, 0.06)).toBe(false);
  });

  it('(the old sliver rule alone lost a piece when the crossing sat off to one side)', () => {
    // Out near the skin the outer wedges are small: at 0.4% of the fruit they were thrown away, leaving five.
    expect(slice([through(0.75, 0.35, 10), through(0.75, 0.35, 70), through(0.75, 0.35, 130)], 0.004, false)).toHaveLength(5);
    expect(slice([through(0.75, 0.35, 10), through(0.75, 0.35, 70), through(0.75, 0.35, 130)], 0.0006, true)).toHaveLength(6);
  });
});

describe('cuts aimed at a crossing on a fruit that has turned', () => {
  const whole = ellipsoid(1, 1, 1, 24, 36);
  const V = massProps(whole).volume;
  it('a cut through the crossing on the near side, tilted off the line behind it, still makes six', () => {
    // Two cuts meeting along the y axis; the third passes through where that
    // line comes out at the top (0, 1, 0) but leans away from it further in.
    const made: Plane[] = [];
    let pieces: Poly[] = [whole];
    for (const raw of [plane([1, 0, 0.2]), plane([0.3, 0, 1])]) {
      pieces = cutAll(pieces, raw, V * 0.0006, made.length).pieces;
      made.push(raw);
    }
    for (const lean of [-0.25, -0.1, 0.1, 0.25]) {
      const n = plane([1, lean, -1]).n;
      const raw: Plane = { n, d: n[1] * 1 + 0.03 };
      const pl = snapPlane(raw, made, 1, 0.12);
      expect(pl).not.toBe(raw);
      expect(cutAll(pieces, pl, V * 0.0006, 2).pieces, `leaning ${lean}`).toHaveLength(6);
    }
  });

  it('a cut right across the line (the fruit turned a long way) is left alone', () => {
    const made = [plane([1, 0, 0.2]), plane([0.3, 0, 1])];
    const across = plane([0.2, 1, 0.1], 0.02);
    expect(snapPlane(across, made, 1, 0.12)).toBe(across);
  });
});
