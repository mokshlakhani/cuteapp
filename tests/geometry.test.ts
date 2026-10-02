import { describe, expect, it } from 'vitest';
import { clipHalfPlane, polyArea, resampleClosed, voronoiCells, type Poly } from '../src/core/geometry';

const circle = (n: number, r: number): Poly =>
  Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2) * r, y: Math.sin((i / n) * Math.PI * 2) * r }));

describe('geometry', () => {
  it('voronoi cells tile the shape exactly', () => {
    const shape = circle(48, 100);
    const seeds = [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: -40, y: 30 },
      { x: 10, y: -60 },
      { x: -30, y: -40 },
    ];
    const cells = voronoiCells(shape, seeds);
    const total = cells.reduce((s, c) => s + Math.abs(polyArea(c.pts)), 0);
    expect(total / Math.abs(polyArea(shape))).toBeCloseTo(1, 5);
    // Only the outer edges are skin; the centre cell never touches the skin.
    expect(cells[0].skin.every((f) => !f)).toBe(true);
    expect(cells.slice(1).every((c) => c.skin.some((f) => f))).toBe(true);
  });

  it('half-plane clip marks the new edge as not-skin', () => {
    const sq = {
      pts: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      skin: [true, true, true, true],
    };
    const half = clipHalfPlane(sq, 1, 0, 5); // keep x <= 5
    expect(Math.abs(polyArea(half.pts))).toBeCloseTo(50);
    expect(half.skin.filter((f) => !f).length).toBe(1);
  });

  it('resampling keeps the perimeter and spreads points evenly', () => {
    const r = resampleClosed(circle(12, 50), new Array(12).fill(true), 30);
    expect(r.pts.length).toBe(30);
    const d = r.pts.map((p, i) => Math.hypot(r.pts[(i + 1) % 30].x - p.x, r.pts[(i + 1) % 30].y - p.y));
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(2);
  });
});
