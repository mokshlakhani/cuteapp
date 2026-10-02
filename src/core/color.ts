/** Tiny colour utilities for procedural materials. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const cache = new Map<string, RGB>();

export function hex(c: string): RGB {
  let v = cache.get(c);
  if (v) return v;
  const s = c.replace('#', '');
  const full =
    s.length === 3
      ? s
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : s;
  const n = parseInt(full, 16);
  v = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  cache.set(c, v);
  return v;
}

export const rgba = (c: string | RGB, a = 1) => {
  const { r, g, b } = typeof c === 'string' ? hex(c) : c;
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
};

export function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  const h = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${h(A.r + (B.r - A.r) * t)}${h(A.g + (B.g - A.g) * t)}${h(A.b + (B.b - A.b) * t)}`;
}

export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
export const darken = (c: string, t: number) => mix(c, '#2a1a14', t);
