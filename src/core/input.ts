/**
 * Multi-touch pointer tracking with smoothed velocities.
 * Works identically for touch, pen and mouse.
 */

export interface Pointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  prevX: number;
  prevY: number;
  /** Smoothed velocity in px/s. */
  vx: number;
  vy: number;
  startTime: number;
  /** Total path length travelled. */
  travel: number;
  /** Arbitrary per-gesture data a scene can attach. */
  data: Record<string, unknown>;
}

export interface PointerHandler {
  pointerDown(p: Pointer): void;
  pointerMove(p: Pointer): void;
  pointerUp(p: Pointer, cancelled: boolean): void;
}

export class InputRouter {
  readonly pointers = new Map<number, Pointer>();
  handler: PointerHandler | null = null;
  /** Called on every first touch — used to unlock audio. */
  onAnyDown: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('lostpointercapture', this.cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    this.onAnyDown?.();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    const { x, y } = this.local(e);
    const p: Pointer = {
      id: e.pointerId,
      x,
      y,
      startX: x,
      startY: y,
      prevX: x,
      prevY: y,
      vx: 0,
      vy: 0,
      startTime: e.timeStamp || performance.now(),
      travel: 0,
      data: {},
    };
    (p.data as { _t: number })._t = p.startTime;
    this.pointers.set(e.pointerId, p);
    this.handler?.pointerDown(p);
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    // Coalesced events give us the full-resolution path on fast swipes.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    for (const ev of list) {
      const { x, y } = this.local(ev);
      const t = ev.timeStamp || performance.now();
      const last = (p.data as { _t: number })._t;
      const dt = Math.max(1, t - last) / 1000;
      const ivx = (x - p.x) / dt;
      const ivy = (y - p.y) / dt;
      const k = Math.min(1, dt * 18);
      p.vx += (ivx - p.vx) * k;
      p.vy += (ivy - p.vy) * k;
      p.prevX = p.x;
      p.prevY = p.y;
      p.travel += Math.hypot(x - p.x, y - p.y);
      p.x = x;
      p.y = y;
      (p.data as { _t: number })._t = t;
      this.handler?.pointerMove(p);
    }
  };

  private finish(e: PointerEvent, cancelled: boolean) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    // If the finger paused before lifting, it isn't a flick.
    const idle = (e.timeStamp || performance.now()) - (p.data as { _t: number })._t;
    if (idle > 60) {
      const k = Math.max(0, 1 - (idle - 60) / 120);
      p.vx *= k;
      p.vy *= k;
    }
    this.handler?.pointerUp(p, cancelled);
  }

  private up = (e: PointerEvent) => this.finish(e, false);
  private cancel = (e: PointerEvent) => this.finish(e, true);

  /** Drop all active gestures (used when switching rooms). */
  reset() {
    for (const p of this.pointers.values()) this.handler?.pointerUp(p, true);
    this.pointers.clear();
  }
}
