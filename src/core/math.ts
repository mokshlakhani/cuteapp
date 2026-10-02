export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (a: number, b: number, c: number, d: number, v: number) => lerp(c, d, clamp(invLerp(a, b, v), 0, 1));

export function smoothstep(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const sign = (v: number) => (v < 0 ? -1 : 1);

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) => lerp(current, target, 1 - Math.exp(-lambda * dt));

export const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const dist = (a: Vec, b: Vec) => len(a.x - b.x, a.y - b.y);

/** Gaussian bump, 1 at 0. */
export const gauss = (x: number, sigma: number) => Math.exp(-(x * x) / (2 * sigma * sigma));

/** Smooth 1D value noise in [-1, 1], cheap and deterministic per seed. */
export function noise1(t: number, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

/** Linear 2x2 matrix + translation, column-major like canvas setTransform. */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const matIdentity = (): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function matMul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function matInvert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c || 1e-9;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

export const matApply = (m: Mat, x: number, y: number): Vec => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f,
});
