/**
 * How far what's painted on a toy's canvas sits from the canvas's middle (CSS
 * px). It reads pixels back, so a toy measures itself once for each size and
 * moves its camera: a toy's shape and its framing change where it lands, so
 * no fixed numbers would centre it on every phone.
 */
export function offCentre(view: HTMLCanvasElement, w: number, h: number) {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(view, 0, 0, W, H);
  const a = g.getImageData(0, 0, W, H).data;
  let l = W;
  let r = -1;
  let t = H;
  let b = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Soft shadows don't count: only the toy itself.
      if (a[(y * W + x) * 4 + 3] < 100) continue;
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
  }
  return r < 0 ? { x: 0, y: 0 } : { x: (l + r + 1 - W) / 2, y: (t + b + 1 - H) / 2 };
}
