import { describe, expect, it } from 'vitest';
import { Piece, WEDGE, collidePieces, wedgeFootprint, type Bounds, type PhysicsParams } from '../src/rooms/jelly/Piece';

const P: PhysicsParams = { stiffness: 1800, damping: 7, beta: 0.3, gravity: 700 };
const B: Bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

function simulate(pieces: Piece[], seconds: number) {
  const h = 1 / 240;
  for (let t = 0; t < seconds; t += h) {
    for (const p of pieces) {
      p.step(h, P);
      p.collideBounds(B, 0.96);
    }
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) collidePieces(pieces[i], pieces[j]);
  }
  for (const p of pieces) p.frame(P.beta);
}

describe('melon jelly piece', () => {
  it('rests on the floor without collapsing or drifting', () => {
    const w = new Piece(wedgeFootprint(), 0, WEDGE.height);
    w.placeRest(0.6, 0, 3, 0);
    simulate([w], 3);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < w.n; i++) {
      minY = Math.min(minY, w.y[i] - w.b);
      maxY = Math.max(maxY, w.y[i] + w.b);
    }
    expect(minY).toBeGreaterThan(-0.05);
    expect(maxY - minY).toBeGreaterThan(WEDGE.height * 0.85);
    expect(maxY - minY).toBeLessThan(WEDGE.height * 1.15);
    expect(Math.abs(w.volumeRatio - 1)).toBeLessThan(0.15);
    expect(Math.hypot(w.vcx, w.vcy, w.vcz)).toBeLessThan(1);
  });

  it('cuts into two pieces that conserve volume and can be cut again', () => {
    const w = new Piece(wedgeFootprint(), 0, WEDGE.height);
    w.placeRest(0, 0, 3, 0);
    simulate([w], 1);
    const parts = w.split(1, 0, 0, w.cx, 0.5);
    expect(parts).not.toBeNull();
    const total = parts!.reduce((s, p) => s + p.restVolume, 0);
    expect(total / w.restVolume).toBeCloseTo(1, 3);
    simulate(parts!, 1.5);
    for (const p of parts!) expect(Number.isFinite(p.cx)).toBe(true);
    const again = parts![0].split(0, 0, 1, parts![0].cz, 0.5);
    expect(again).not.toBeNull();
  });

  it('survives being thrown into another piece', () => {
    const a = new Piece(wedgeFootprint(), 0, WEDGE.height);
    a.placeRest(0, -8, 3, 0);
    const b = new Piece(wedgeFootprint(), 0, WEDGE.height);
    b.placeRest(1, 8, 3, 0);
    for (let i = 0; i < a.n; i++) {
      a.vx[i] = 900;
      a.vy[i] = 300;
    }
    simulate([a, b], 3);
    for (const p of [a, b]) {
      expect(Number.isFinite(p.cx)).toBe(true);
      expect(Math.abs(p.volumeRatio - 1)).toBeLessThan(0.3);
    }
    expect(Math.hypot(a.cx - b.cx, a.cz - b.cz)).toBeGreaterThan(3);
  });
});
