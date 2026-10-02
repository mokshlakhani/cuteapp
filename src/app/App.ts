import { Stage } from '../render/stage';
import { InputRouter, type Pointer } from '../core/input';
import { audio } from '../core/audio';
import { music } from '../core/music';
import { ui as uiSound } from '../core/sounds';
import { haptics } from '../core/haptics';
import { theme } from '../design/theme';
import { duration } from '../design/tokens';
import { ease } from '../design/motion';
import { lighten, rgba } from '../core/color';
import { TopBar, el } from '../ui/components';
import type { RoomInfo, RoomNav, Scene } from './scene';

interface Transition {
  from: Scene;
  to: Scene;
  t: number;
  ox: number;
  oy: number;
  forward: boolean;
}

/**
 * The parent "world". Owns the canvas, the frame loop, the persistent top bar
 * and the room-to-room transition: the new room blooms out of the spot you
 * touched as a growing soft circle — one transition for every room, forever.
 */
export class App implements RoomNav {
  readonly stage: Stage;
  private input: InputRouter;
  private layer: HTMLDivElement;
  private topbar: TopBar;
  private scenes = new Map<string, Scene>();
  private current!: Scene;
  private transition: Transition | null = null;
  private last = 0;

  constructor(
    host: HTMLElement,
    private rooms: RoomInfo[],
    private makeHome: (nav: RoomNav) => Scene,
  ) {
    theme.init();
    this.stage = new Stage(host);
    this.layer = el('div', 'ui-layer');
    host.append(this.layer);
    this.topbar = new TopBar(() => this.home());
    host.append(this.topbar.root);

    this.input = new InputRouter(this.stage.canvas);
    const unlock = () => {
      audio.unlock();
      music.start();
    };
    this.input.onAnyDown = unlock;
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current.id !== 'home') this.home();
    });

    this.stage.onResize(() => this.layoutAll());

    const home = this.makeHome(this);
    this.scenes.set('home', home);
    this.mount(home);
    this.current = home;
    home.enter();
    home.ui.classList.add('is-active');
    this.topbar.showBack(false);
    this.layoutAll();
    this.input.handler = this.handler;
  }

  /** Pointer events go to the active scene, never during transitions. */
  private handler = {
    pointerDown: (p: Pointer) => !this.transition && this.current.pointerDown(p),
    pointerMove: (p: Pointer) => !this.transition && this.current.pointerMove(p),
    pointerUp: (p: Pointer, c: boolean) => this.current.pointerUp(p, c),
  };

  private layoutAll() {
    const { width, height, safe } = this.stage;
    for (const s of this.scenes.values()) s.layout(width, height, safe);
  }

  private mount(s: Scene) {
    s.ui.classList.add('scene-ui');
    if (!s.ui.isConnected) this.layer.append(s.ui);
  }

  private scene(id: string): Scene | null {
    let s = this.scenes.get(id);
    if (s) return s;
    const info = this.rooms.find((r) => r.id === id);
    if (!info?.create || !info.awake) return null;
    s = info.create(this);
    this.scenes.set(id, s);
    const { width, height, safe } = this.stage;
    s.layout(width, height, safe);
    return s;
  }

  go(id: string, origin?: { x: number; y: number }) {
    if (this.transition || id === this.current.id) return;
    const to = this.scene(id);
    if (!to) return;
    this.switchTo(to, origin ?? { x: this.stage.width / 2, y: this.stage.height / 2 }, id !== 'home');
  }

  home(origin?: { x: number; y: number }) {
    if (this.current.id === 'home') return;
    const b = this.topbar.back.getBoundingClientRect();
    this.go('home', origin ?? { x: b.left + b.width / 2, y: b.top + b.height / 2 });
  }

  private switchTo(to: Scene, origin: { x: number; y: number }, forward: boolean) {
    const from = this.current;
    this.input.reset();
    from.leave();
    from.ui.classList.remove('is-active');
    this.mount(to);
    to.enter();
    // Let the old chrome fade before the new chrome rises in.
    requestAnimationFrame(() => to.ui.classList.add('is-active'));
    this.topbar.showBack(to.id !== 'home');
    this.topbar.menu.toggle(false);
    this.current = to;
    this.transition = { from, to, t: 0, ox: origin.x, oy: origin.y, forward };
    uiSound.whoosh(forward);
    haptics.play('tick');
  }

  start() {
    const frame = (now: number) => {
      const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 20) : 1 / 60;
      this.last = now;
      try {
        this.tick(dt);
      } catch (e) {
        // Never let one bad frame wedge the canvas (e.g. a leaked save/clip).
        console.error(e);
        const ctx = this.stage.ctx as CanvasRenderingContext2D & { reset?: () => void };
        if (ctx.reset) ctx.reset();
        else this.stage.resize();
        this.transition = null;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private tick(dt: number) {
    const ctx = this.stage.ctx;
    const tr = this.transition;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / (duration.room / 1000));
      tr.from.update(dt);
    }
    this.current.update(dt);

    this.stage.begin();
    if (!tr) {
      this.current.draw(ctx);
      return;
    }
    const { width: w, height: h } = this.stage;
    const k = ease.inOutCubic(tr.t);
    const maxR = Math.hypot(Math.max(tr.ox, w - tr.ox), Math.max(tr.oy, h - tr.oy)) + 24;
    const r = Math.max(0.01, maxR * k);

    // Outgoing room drifts back a touch as the new one blooms over it.
    ctx.save();
    const s = 1 + 0.035 * k;
    ctx.translate(tr.ox, tr.oy);
    ctx.scale(s, s);
    ctx.translate(-tr.ox, -tr.oy);
    tr.from.draw(ctx);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(tr.ox, tr.oy, r, 0, Math.PI * 2);
    ctx.clip();
    const s2 = 0.96 + 0.04 * ease.outCubic(tr.t);
    ctx.translate(tr.ox, tr.oy);
    ctx.scale(s2, s2);
    ctx.translate(-tr.ox, -tr.oy);
    tr.to.draw(ctx);
    ctx.restore();

    // Soft glowing rim on the growing circle.
    const rimA = Math.sin(Math.PI * tr.t) * 0.55;
    ctx.strokeStyle = rgba(lighten(tr.to.tint, 0.4), rimA);
    ctx.lineWidth = 14 * (1 - tr.t) + 2;
    ctx.beginPath();
    ctx.arc(tr.ox, tr.oy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (tr.t >= 1) this.transition = null;
  }
}
