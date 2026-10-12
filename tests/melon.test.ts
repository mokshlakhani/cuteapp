import { describe, expect, it } from 'vitest';
import { Object3D, Quaternion, Vector3 } from 'three';
import { BAND_COLORS, BREAK_RANGE, MELON_A, MELON_R, MelonShape, nextBandColor } from '../src/rooms/melon/shape';
import { Debris } from '../src/rooms/melon/debris';

function settle(m: MelonShape, seconds: number) {
  const h = 1 / 120;
  for (let t = 0; t < seconds; t += h) m.update(h);
}

function wrap(m: MelonShape, n: number, x = 0.05) {
  let color: string | undefined;
  for (let i = 0; i < n; i++) {
    color = nextBandColor(color);
    m.addBand(x, color);
    settle(m, 0.05);
  }
  settle(m, 2);
}

describe('melon shape', () => {
  it('starts as a plain melon resting on its belly', () => {
    const m = new MelonShape();
    settle(m, 1);
    expect(m.surfaceAt(0)).toBeCloseTo(MELON_R, 2);
    expect(m.supportHeight).toBeCloseTo(MELON_R, 2);
    expect(m.lengthScale).toBeCloseTo(1, 2);
  });

  it('pops somewhere between 40 and 65 bands', () => {
    const seen = new Set<number>();
    const m = new MelonShape();
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
    const m = new MelonShape();
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
    for (const x of [-0.5, 0.1, 0.55]) {
      const m = new MelonShape();
      m.breakAt = 99;
      settle(m, 1);
      const probes = [-0.6, -0.3, 0, 0.3, 0.6];
      const before = probes.map((p) => m.surfaceAt(p));
      const at = m.surfaceAt(x);
      wrap(m, 6, x);
      for (const b of m.bands) expect(Math.abs(b.x.value - x)).toBeLessThan(0.1);
      // Squeezed at the band…
      expect(m.surfaceAt(x)).toBeLessThan(at * 0.9);
      expect(Math.abs(m.grooveX - x)).toBeLessThan(0.06);
      // …and the volume it pushed out bulges the rest of the melon.
      probes.forEach((p, i) => {
        if (Math.abs(p - x) > 0.3) expect(m.surfaceAt(p)).toBeGreaterThanOrEqual(before[i] * 0.999);
      });
    }
  });

  it('squeezes into a peanut that rests on its lobes', () => {
    const m = new MelonShape();
    m.breakAt = 60;
    settle(m, 1);
    const plainWaist = m.surfaceAt(0.05);
    wrap(m, 55);
    const waist = m.surfaceAt(m.grooveX);
    const left = Math.max(...[-0.7, -0.6, -0.5, -0.4].map((x) => m.surfaceAt(x)));
    const right = Math.max(...[0.5, 0.6, 0.7].map((x) => m.surfaceAt(x)));
    // A deep waist, with round lobes either side that are wider than it.
    expect(Math.abs(m.grooveX - 0.05)).toBeLessThan(0.1);
    expect(waist).toBeLessThan(plainWaist * 0.6);
    expect(left).toBeGreaterThan(waist * 1.5);
    expect(right).toBeGreaterThan(waist * 1.5);
    // It rests on its lobes, and the squeezed-out volume makes it longer.
    expect(m.supportHeight).toBeGreaterThan(waist * 1.4);
    expect(m.lengthScale).toBeGreaterThan(1.05);
    for (let x = -1; x <= 1; x += 0.01) expect(Number.isFinite(m.surfaceAt(x))).toBe(true);
  });
});

describe('debris', () => {
  it('flies, lands, slides to a stop and lies flat', () => {
    const d = new Debris();
    const lands: string[] = [];
    d.events.land = (b) => lands.push(b.kind);
    for (let i = 0; i < 20; i++) {
      d.add({
        kind: i % 2 ? 'shard' : 'band',
        pos: new Vector3(0, 2, 0),
        vel: new Vector3(Math.random() * 10 - 5, Math.random() * 8 + 3, Math.random() * 10 - 5),
        q: new Quaternion().setFromAxisAngle(new Vector3(1, 0.3, 0).normalize(), Math.random() * 6),
        w: new Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        up: new Vector3(0, 0, 1),
        rest: 0.1,
      });
    }
    for (let t = 0; t < 8; t += 1 / 120) d.step(1 / 120);
    expect(d.still).toBe(true);
    expect(lands.length).toBeGreaterThanOrEqual(20);
    for (const b of d.bodies) {
      expect(b.pos.y).toBeCloseTo(0.1, 5);
      expect(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.z)).toBe(true);
      const up = b.up!.clone().applyQuaternion(b.q);
      expect(Math.abs(up.y)).toBeGreaterThan(0.98);
    }
  });

  it('juice drops vanish into the table when they land', () => {
    const d = new Debris();
    const drop = d.add({ kind: 'drop', pos: new Vector3(0, 1, 0), vel: new Vector3(2, 4, 0), rest: 0.03 });
    for (let t = 0; t < 2; t += 1 / 120) d.step(1 / 120);
    expect(drop.dead).toBe(true);
    expect(d.still).toBe(true);
  });
});

describe('burst', () => {
  it('turns every band into a strand or a loop, and everything settles on the table', async () => {
    const { Explosion } = await import('../src/rooms/melon/explosion');
    const { MeshBasicMaterial } = await import('three');
    const m = new MelonShape();
    m.breakAt = 60;
    wrap(m, 60);
    const melon = new Object3D();
    melon.position.set(0, m.supportHeight, 0);
    const mat = new MeshBasicMaterial();
    const e = new Explosion(mat, () => mat);
    e.start(
      m,
      melon,
      m.bands.map((b) => b.color),
    );
    expect(e.strands + e.rings).toBe(60);
    expect(e.strands).toBeGreaterThan(e.rings);
    const kinds = new Set(e.debris.bodies.map((b) => b.kind));
    for (const k of ['shard', 'chunk', 'drop', 'seed', 'band']) expect(kinds.has(k as never)).toBe(true);

    const cam = new Object3D();
    cam.position.set(0, 10, 25);
    for (let t = 0; t < 12 && !e.settled; t += 1 / 60) e.update(1 / 60, cam as never);
    expect(e.settled).toBe(true);
    for (const b of e.debris.bodies) {
      if (b.dead) continue;
      expect(b.pos.y).toBeGreaterThanOrEqual(b.rest - 1e-6);
      expect(Math.hypot(b.pos.x, b.pos.z)).toBeLessThan(MELON_A * 12);
    }
    e.beginClear();
    for (let t = 0; t < 4 && !e.clear(1 / 60); t += 1 / 60);
    expect(e.clear(0)).toBe(true);
  });
});
