import type { RoomNav, Scene } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { clamp, damp } from '../../core/math';
import { panFor } from '../../core/audio';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop } from '../../render/paint';
import { reducedMotion } from '../../render/camera';
import { el, Hint } from '../../ui/components';
import { OrderHud, OrderToast, Rising } from '../../ui/order';
import { getStackScene, type StackScene } from './StackScene';
import { landing, leanOf, loadBest, REACH, restY, saveBest, stoneFor, swayAt, swayFor, verdict, type Placed, type Stone } from './game';

type Phase = 'ready' | 'drop' | 'settle' | 'over';

/** How far over the tower a stone hangs. */
const HANG = 1.5;
const GRAVITY = 13;
/** How long a landing settles. */
const SETTLE = 0.42;
/** When a run ends: when the view glides back down the tower, when it clears, and when the next begins. */
const OVER = { rewind: 1, clear: 2.8, next: 5 };

/**
 * Room: stack. A stone hangs over a wooden board. Drag anywhere to move it,
 * let go and it drops. The tower stands so long as each stone's weight sits
 * over what's under it, and it sways more as it grows, so a high stone wants
 * a little lead: let go early, or wait for it to come back. There's no goal:
 * the only number on screen is your high score. Once the tower nears the top
 * of the screen the view climbs with it, one stone for every stone set, so
 * only the top of the tower is in frame. When a stone tips the run ends, the
 * view glides back down what you built, and a new tower begins.
 */
export class StackRoom implements Scene {
  readonly id = 'stack';
  readonly tint = roomTint.stack;
  readonly ui: HTMLElement;
  readonly view: HTMLCanvasElement;
  live = false;

  private s: StackScene;
  private w = 0;
  private h = 0;
  private hint = new Hint('drag to aim, let go to drop', 'hand');
  private phase: Phase = 'ready';
  private phaseT = 0;
  private tower: Placed[] = [];
  /** The stone in hand. */
  private stone: Stone = stoneFor(0);
  private best = loadBest();
  /** The high score as this run began, and whether it's been beaten yet. */
  private startBest = 0;
  private beaten = false;
  /** How high this run stood. */
  private height = 0;
  private rewound = false;
  private finger: number | null = null;
  /** Where the stone is meant to be, where it is, and how fast it's going there. */
  private aim = 0;
  private x = 0;
  private vx = 0;
  private y = 0;
  private vy = 0;
  private painted = false;
  private paintedTheme: unknown = null;
  private started = false;

  private hud = new OrderHud();
  private toast = new OrderToast();
  private plus = new Rising();

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-stack');
    this.ui.append(this.hud.root, this.toast.root, this.plus.root, this.hint.root);
    this.s = getStackScene();
    this.view = this.s.canvas;
    this.s.onTumble = (speed, at) => {
      material.stoneClack(clamp(speed / 9, 0, 1), panFor(this.s.toScreen(at).x, this.w));
      if (speed > 4) haptics.play('tap');
    };
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    this.s.resize(w, h, window.devicePixelRatio || 1, safe.top + 150, h - safe.bottom - 60);
    this.painted = false;
  }

  enter() {
    if (!this.started) this.beginRun();
    this.started = true;
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1400);
    this.painted = false;
  }

  leave() {
    this.hint.hide();
    this.finger = null;
  }

  // ——— the run ———

  private beginRun() {
    this.tower = [];
    this.height = 0;
    this.beaten = false;
    this.rewound = false;
    this.startBest = this.best;
    this.s.reset();
    this.s.sync(this.tower);
    this.s.sway = reducedMotion ? 0 : swayFor();
    this.toast.hide();
    this.syncHud(false);
    this.nextStone();
  }

  private syncHud(bump: boolean) {
    this.hud.set(this.best, 'high score', false, false, bump);
  }

  private get hangY() {
    return restY(this.tower, this.stone) + HANG;
  }

  private nextStone() {
    this.stone = stoneFor(this.tower.length);
    this.phase = 'ready';
    this.phaseT = 0;
    this.x = this.aim = 0;
    this.vx = 0;
    this.y = this.hangY;
    this.s.hold(this.stone, this.x, this.y);
    this.s.face.base = 'calm';
    this.s.face.set('happy', 0.8);
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    if (this.phase === 'over') {
      if (this.phaseT > OVER.rewind + 0.5) this.beginRun();
      return;
    }
    // A finger that's early, while a stone settles, takes the next one as it comes.
    if (this.finger === null && (this.phase === 'ready' || this.phase === 'settle')) {
      this.finger = p.id;
      haptics.play('tick');
      if (this.phase === 'ready') this.s.face.set('wide', 0.4);
    }
  }

  pointerMove(p: Pointer) {
    if (p.id !== this.finger || this.phase !== 'ready') return;
    this.aim = clamp(this.aim + (p.x - p.prevX) * this.s.unitsPerPx, -REACH, REACH);
    if (Math.abs(p.x - p.startX) > 6) this.hint.hide();
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    if (p.id !== this.finger) return;
    this.finger = null;
    // Interrupted: the stone stays in hand.
    if (cancelled || this.phase !== 'ready') return;
    this.phase = 'drop';
    this.phaseT = 0;
    this.vy = 0;
    this.toast.hide();
    settings.markHintSeen(this.id);
    material.pop(0.2, panFor(this.s.at(this.x, this.y).x, this.w));
  }

  // ——— simulation ———

  update(dt: number) {
    this.phaseT += dt;
    switch (this.phase) {
      case 'ready':
        this.stepHand(dt);
        break;
      case 'drop':
        this.stepDrop(dt);
        break;
      case 'settle':
        if (this.phaseT > SETTLE) this.nextStone();
        break;
      case 'over':
        if (this.phaseT > OVER.rewind) this.s.rewind();
        if (!this.rewound && this.phaseT > OVER.clear) this.showResult();
        if (this.phaseT > OVER.next) this.beginRun();
        break;
    }
    this.s.update(dt);
  }

  /** The stone trails your finger on a soft spring, and hangs on swinging a little. */
  private stepHand(dt: number) {
    const f = 46 * (this.aim - this.x) - 11 * this.vx;
    this.vx += f * dt;
    this.x += this.vx * dt;
    const target = this.hangY + Math.sin(this.s.towerTime * 1.6) * 0.05;
    this.y = damp(this.y, target, 9, dt);
    this.s.moveHeld(this.x, this.y, clamp(-this.vx * 0.05, -0.2, 0.2));
    const top = this.tower[this.tower.length - 1];
    if (top) {
      const dx = this.x - (top.x + swayAt(this.tower.length - 1, this.s.towerTime, this.s.sway));
      this.s.face.look(-dx * 0.5, 0.7);
    }
  }

  private stepDrop(dt: number) {
    this.vy += GRAVITY * dt;
    this.y -= this.vy * dt;
    this.x += this.vx * 0.35 * dt;
    this.vx *= Math.exp(-3 * dt);
    this.s.moveHeld(this.x, this.y, clamp(-this.vx * 0.05, -0.2, 0.2));
    const rest = restY(this.tower, this.stone);
    if (this.y > rest) return;
    this.land(rest);
  }

  private land(rest: number) {
    const stone = this.stone;
    // Where it lands on the tower as it stands now, sway and all.
    const level = this.tower.length;
    const x = clamp(this.x - swayAt(level, this.s.towerTime, this.s.sway), -REACH, REACH);
    const pan = panFor(this.s.at(x, rest).x, this.w);
    const placed: Placed = { stone, x, y: rest, lean: leanOf(this.tower, stone, x) };
    const tower = [...this.tower, placed];
    const res = landing(tower);
    material.stoneClack(clamp(this.vy / 8, 0.25, 1), pan);
    haptics.play('tap');
    if (res.stable) {
      this.tower = tower;
      this.height = tower.length;
      this.s.sync(this.tower);
      const shaky = 1 - res.margin;
      this.s.place(placed, level, 2 + shaky * 11);
      if (shaky > 0.72) {
        this.s.face.set('nervous', 1);
        haptics.play('tick');
      }
      this.score(shaky > 0.72, this.s.at(x, rest + stone.b + 0.34));
      this.phase = 'settle';
      this.phaseT = 0;
      return;
    }
    // The stone itself, or everything above a join that gave: that's the run.
    const from = res.from;
    if (from === level) this.s.dropHeld(res.side);
    else {
      this.s.place(placed, level, 0);
      this.tower = tower;
      this.s.sync(this.tower);
      this.s.tumble(from, res.side);
      this.tower = tower.slice(0, from);
      this.s.sync(this.tower);
    }
    this.s.face.set('dizzy', 1.2);
    haptics.play('soft');
    this.plus.show('whoops', this.s.at(x, rest));
    this.phase = 'over';
    this.phaseT = 0;
  }

  /** Beside the stone, how high it's got; and the high score goes up with you. */
  private score(wobbly: boolean, at: { x: number; y: number }) {
    const n = this.height;
    const passed = n > this.best;
    if (passed) {
      this.best = n;
      saveBest(n);
      this.syncHud(true);
    }
    if (passed && !this.beaten && this.startBest > 0) {
      this.beaten = true;
      material.sparkle(0);
      haptics.play('soft');
      this.plus.show('new high score!', at);
      return;
    }
    if (passed) this.beaten = true;
    this.plus.show(wobbly ? 'wobbly!' : String(n), at);
  }

  private showResult() {
    this.rewound = true;
    // On a clear board, so the words never sit over the stones.
    this.s.reset();
    this.toast.show(...verdict(this.height, this.best, this.beaten));
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    if (!this.live || !this.painted || theme.current !== this.paintedTheme) {
      paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null, spot: { x: w / 2, y: h * 0.5, r: Math.min(w, h) * 0.8 } });
      this.painted = this.live;
      this.paintedTheme = theme.current;
    }
    const view = this.s.render();
    if (!this.live) ctx.drawImage(view, 0, 0, w, h);
  }
}
