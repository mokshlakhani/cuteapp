/**
 * Tiny allocation-light 3D helpers for the jelly physics.
 * Matrices are row-major Float64Array(9); quaternions are [x, y, z, w].
 */

export type V3 = [number, number, number];
export type M3 = Float64Array;
export type Q4 = [number, number, number, number];

export const m3 = (): M3 => new Float64Array(9);

export function m3Identity(m: M3 = m3()) {
  m.fill(0);
  m[0] = m[4] = m[8] = 1;
  return m;
}

export function m3Det(m: M3) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

export function m3Inverse(m: M3, out: M3 = m3()) {
  const d = m3Det(m);
  if (Math.abs(d) < 1e-12) return m3Identity(out);
  const i = 1 / d;
  out[0] = (m[4] * m[8] - m[5] * m[7]) * i;
  out[1] = (m[2] * m[7] - m[1] * m[8]) * i;
  out[2] = (m[1] * m[5] - m[2] * m[4]) * i;
  out[3] = (m[5] * m[6] - m[3] * m[8]) * i;
  out[4] = (m[0] * m[8] - m[2] * m[6]) * i;
  out[5] = (m[2] * m[3] - m[0] * m[5]) * i;
  out[6] = (m[3] * m[7] - m[4] * m[6]) * i;
  out[7] = (m[1] * m[6] - m[0] * m[7]) * i;
  out[8] = (m[0] * m[4] - m[1] * m[3]) * i;
  return out;
}

export function m3Mul(a: M3, b: M3, out: M3 = m3()) {
  const r = out === a || out === b ? m3() : out;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  if (r !== out) out.set(r);
  return out;
}

export function quatToM3(q: Q4, out: M3 = m3()) {
  const [x, y, z, w] = q;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y - z * w);
  out[2] = 2 * (x * z + y * w);
  out[3] = 2 * (x * y + z * w);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z - x * w);
  out[6] = 2 * (x * z - y * w);
  out[7] = 2 * (y * z + x * w);
  out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

export function quatMul(a: Q4, b: Q4): Q4 {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatAxisAngle(ax: number, ay: number, az: number, angle: number): Q4 {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

export function quatNormalize(q: Q4) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l;
  q[1] /= l;
  q[2] /= l;
  q[3] /= l;
  return q;
}

const tmpR = m3();
/**
 * Rotation part of a 3×3 matrix (Müller et al. 2016, "A Robust Method to
 * Extract the Rotational Part of Deformations"), warm-started from `q`.
 */
export function extractRotation(A: M3, q: Q4, iterations = 8): Q4 {
  for (let k = 0; k < iterations; k++) {
    const R = quatToM3(q, tmpR);
    // ω = Σ r_i × a_i / |Σ r_i · a_i|  (columns)
    let wx = 0;
    let wy = 0;
    let wz = 0;
    let dot = 0;
    for (let c = 0; c < 3; c++) {
      const rx = R[c];
      const ry = R[3 + c];
      const rz = R[6 + c];
      const ax = A[c];
      const ay = A[3 + c];
      const az = A[6 + c];
      wx += ry * az - rz * ay;
      wy += rz * ax - rx * az;
      wz += rx * ay - ry * ax;
      dot += rx * ax + ry * ay + rz * az;
    }
    const inv = 1 / (Math.abs(dot) + 1e-9);
    wx *= inv;
    wy *= inv;
    wz *= inv;
    const w = Math.hypot(wx, wy, wz);
    if (w < 1e-9) break;
    q = quatNormalize(quatMul(quatAxisAngle(wx / w, wy / w, wz / w, w), q));
  }
  return q;
}
