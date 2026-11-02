/**
 * A frame meter for tuning, off unless the page is opened with `?perf` (or
 * `softspot.meter()` is called): the rate the screen is actually delivering,
 * the worst recent frame, and how much of each frame our own code takes.
 */
export class Meter {
  private box: HTMLDivElement | null = null;
  private gaps: number[] = [];
  private work: number[] = [];
  private last = 0;
  private shown = 0;
  private parts = new Map<string, number>();
  private frames = 0;
  private notes: string[] = [];
  /** The longest single go at each part since it was last shown. */
  private worst = new Map<string, number>();

  get on() {
    return this.box !== null;
  }

  show() {
    if (this.box) return;
    const b = document.createElement('div');
    b.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:8px;' +
      'font:600 11px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);pointer-events:none;white-space:pre-wrap';
    document.body.append(b);
    this.box = b;
  }

  /** A line kept on screen (when the meter is on). */
  note(text: string) {
    this.notes.push(text);
  }

  /** Start timing a part of the frame (0 when the meter is off). */
  start() {
    return this.box ? performance.now() : 0;
  }

  /** Add the time since `start` to a named part, averaged over frames on screen. */
  stop(name: string, since: number) {
    if (!this.box) return;
    const ms = performance.now() - since;
    this.parts.set(name, (this.parts.get(name) ?? 0) + ms);
    this.worst.set(name, Math.max(this.worst.get(name) ?? 0, ms));
  }

  /** One frame: its timestamp, and the ms our code took inside it. */
  frame(now: number, ms: number) {
    if (!this.box) return;
    if (this.last) this.gaps.push(now - this.last);
    this.last = now;
    this.work.push(ms);
    this.frames++;
    if (now - this.shown < 1000 || this.gaps.length < 8) return;
    this.shown = now;
    const g = [...this.gaps].sort((a, b) => a - b);
    const w = [...this.work].sort((a, b) => a - b);
    const avg = g.reduce((a, b) => a + b, 0) / g.length;
    const late = g.filter((x) => x > avg * 1.5).length;
    this.box.textContent = this.notes.map((n) => n + '\n').join('') +
      `${(1000 / avg).toFixed(0)} fps  gap ${avg.toFixed(1)}ms  worst ${g[g.length - 1].toFixed(0)}ms  late ${late}\n` +
      `js ${(w.reduce((a, b) => a + b, 0) / w.length).toFixed(1)}ms  p95 ${w[Math.floor(w.length * 0.95)].toFixed(1)}  max ${w[w.length - 1].toFixed(1)}`;
    const n = Math.max(1, this.frames);
    for (const k of this.worst.keys()) if (k.startsWith('w') && !this.parts.has(k)) this.parts.set(k, 0);
    const parts = [...this.parts].filter(([k]) => !k.startsWith('w:') || (this.worst.get(k) ?? 0) >= 6).map(([k, v]) => `${k} ${(v / n).toFixed(1)}/${(this.worst.get(k) ?? 0).toFixed(0)}`).join(' ');
    if (parts) this.box.textContent += `\n${parts}`;
    this.parts.clear();
    // How slow the slowest slice of building ahead ever got stays on screen.
    for (const k of [...this.worst.keys()]) if (!k.startsWith('w')) this.worst.delete(k);
    this.frames = 0;
    this.gaps = [];
    this.work = [];
  }
}

export const meter = new Meter();
// Also on in a build made with VITE_PERF=1, which is how to read it in the phone app.
if (new URLSearchParams(location.search).has('perf') || import.meta.env.VITE_PERF) meter.show();
