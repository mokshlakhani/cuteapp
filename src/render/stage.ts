/**
 * The single full-screen canvas every room draws into, plus safe-area
 * insets so layouts respect notches and home indicators on any phone.
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;
  safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private probe: HTMLDivElement;
  private listeners = new Set<() => void>();

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage';
    host.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;

    this.probe = document.createElement('div');
    this.probe.style.cssText =
      'position:fixed;inset:0;pointer-events:none;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(this.probe);

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    this.resize();
  }

  onResize(fn: () => void) {
    this.listeners.add(fn);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap DPR: 2x is visually lossless for soft shapes and saves fill-rate.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const cs = getComputedStyle(this.probe);
    this.safe = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    this.listeners.forEach((l) => l());
  }

  /** Reset to CSS-pixel space. */
  begin() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
