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

describe('lying flat', () => {
  it('a piece dropped on its side rolls back to lie flat', () => {
    for (const tilt of [Math.PI / 2, 2.6]) {
      const p = new Piece(wedgeFootprint(5.4), 0, 2.2);
      p.placeRest(0.3, 0, 6, 0);
      // Tip it over around the x axis.
      const c = Math.cos(tilt);
      const s = Math.sin(tilt);
      for (let i = 0; i < p.n; i++) {
        const y = p.y[i] - p.cy;
        const z = p.z[i] - p.cz;
        p.y[i] = p.cy + c * y - s * z;
        p.z[i] = p.cz + s * y + c * z;
      }
      p.frame(P.beta);
      simulate([p], 4);
      expect(p.R[4]).toBeGreaterThan(0.95);
    }
  });

  it('thin cut slices tipped on their side roll back flat too', async () => {
    const { JELLY_FRUITS } = await import('../src/rooms/jelly/fruits');
    for (const f of JELLY_FRUITS.filter((f) => f.code !== 0)) {
      for (const w of [0.8, 1.2, 1.8]) {
        const p = new Piece(f.footprint(), 0, f.height);
        p.placeRest(0, 0, f.height / 2 + 0.3, 0);
        simulate([p], 0.3);
        const parts = p.split(1, 0, 0, p.cx + f.radius - w, 0.35);
        expect(parts).not.toBeNull();
        const s = parts!.reduce((a, b) => (a.restVolume < b.restVolume ? a : b));
        // Roll it onto its side, a little above the table.
        for (let i = 0; i < s.n; i++) {
          const y = s.y[i] - s.cy;
          const x = s.x[i] - s.cx;
          s.x[i] = s.cx - y;
          s.y[i] = s.cy + x + 1;
        }
        s.frame(P.beta);
        simulate([s], 4);
        expect(s.R[4]).toBeGreaterThan(0.95);
      }
    }
  });
});

describe('knife', () => {
  it('cuts every fruit wherever the stroke crosses it', async () => {
    const { JELLY_FRUITS } = await import('../src/rooms/jelly/fruits');
    const { strokeHits, strokePlane } = await import('../src/rooms/jelly/cutting');
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const f of JELLY_FRUITS) {
      let hits = 0;
      let splits = 0;
      for (let k = 0; k < 30; k++) {
        const p = new Piece(f.footprint(), 0, f.height);
        p.placeRest(rnd() * 6, 0, f.height / 2 + 0.5, 0);
        simulate([p], 0.6);
        const a = rnd() * Math.PI;
        const off = (rnd() - 0.5) * f.radius * 0.9;
        const cx = p.cx + Math.cos(a + Math.PI / 2) * off;
        const cz = p.cz + Math.sin(a + Math.PI / 2) * off;
        const L = f.radius * 3;
        const s = {
          ax: cx - (Math.cos(a) * L) / 2,
          az: cz - (Math.sin(a) * L) / 2,
          bx: cx + (Math.cos(a) * L) / 2,
          bz: cz + (Math.sin(a) * L) / 2,
        };
        if (!strokeHits(p, s)) continue;
        hits++;
        const pl = strokePlane(s);
        if (p.split(pl.nx, 0, pl.nz, pl.d, 0.35)) splits++;
      }
      expect(hits).toBeGreaterThan(15);
      expect(splits / hits).toBeGreaterThan(0.97);
    }
  });
});
