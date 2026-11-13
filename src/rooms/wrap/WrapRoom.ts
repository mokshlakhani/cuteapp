import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { ease } from '../../design/motion';
import { icons } from '../../design/icons';
import { clamp, lerp, rand, smoothstep } from '../../core/math';
import { rgba } from '../../core/color';
import { panFor } from '../../core/audio';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { paintBackdrop } from '../../render/paint';
import { Particles } from '../../render/particles';
import { Shake } from '../../render/camera';
import { el, Segmented, tactile } from '../../ui/components';
import { OrderToast } from '../../ui/order';
import { Sheet, type Bubble, type BubbleSize } from './Sheet';
import { FILMS, drawRoll, drawSheet, warmPopped, type Film } from './draw';
import { flashFor, loadMemory, memoryVerdict, nextSize, pickPattern, saveMemory, scoreMemory } from './memory';

const SIZE_KEY = 'softspot.wrap.size.v1';
function loadBubbleSize(): BubbleSize {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return v === 'small' || v === 'jumbo' ? v : 'regular';
  } catch {
    return 'regular';
  }
}

type Phase = 'unroll' | 'play' | 'away';
/** A breath before the pattern, the pattern glowing, your go, and how it went. */
type Mem = 'ready' | 'watch' | 'recall' | 'reveal';

/** Seconds: unrolling a fresh sheet, rolling one up, and it leaving. */
const UNROLL = 0.85;
const ROLL_UP = 0.7;
const ROLL_OFF = 0.4;
/** Wait for the room to slide in before the first unroll. */
const ENTER_DELAY = 0.45;
/** The roll's radius as a sheet starts and finishes unrolling (px). */
const ROLL_FULL = 22;
const ROLL_END = 8;
/** A breath before the pattern shows, and its glow fading in and out (s). */
const READY = 0.7;
const FADE = 0.3;
/** How long the result stays before the next sheet (s), unless you tap on. */
const SHOW = 3.6;
const GOLD = '#f6c96b';
const CORAL = '#f4a291';

/**
 * Room: bubbles, a memory game on a sheet of bubble wrap. A fresh sheet
 * unrolls and a pattern of bubbles glows gold for a moment. When the glow
 * fades, pop the ones you remember — only the bubble you let go on pops, so
 * you can slide off one if you change your mind — and tap done. The ones you
 * got shine gold, the ones you missed get a dashed ring, and any popped by
 * mistake a coral one. Get them all and the next pattern is a bubble bigger;
 * a fuzzy round makes it a bubble smaller. No scores to keep, nothing to fail.
 */
export class WrapRoom implements Scene {
  readonly id = 'wrap';
  readonly tint = roomTint.wrap;
  readonly ui: HTMLElement;

  private w = 0;
  private h = 0;
  private safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private area = { x: 0, y: 0, w: 0, h: 0 };
  private sheet: Sheet | null = null;
  /** Each sheet comes in the next film colour. */
  private filmAt = 0;
  private film: Film = FILMS[0];
  private phase: Phase = 'unroll';
  private phaseT = 0;
  private time = 0;
  /** Each finger down, and the bubble under it. */
  private touches = new Map<number, Bubble | null>();
  private particles = new Particles();
  private shake = new Shake();
  private lastPop = 0;
  /** All popped looks painted for this sheet yet? */
  private warm = false;

  private mem: Mem = 'ready';
  private memT = 0;
  private size: number;
  private pattern = new Set<Bubble>();
  private chosen = new Set<Bubble>();
  private doneBtn: HTMLButtonElement;
  private toast = new OrderToast();
  /** The size of bubble on the sheet, picked in the dock and kept between visits. */
  private bubbleSize: BubbleSize = loadBubbleSize();
  private sizes: Segmented<BubbleSize>;

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-wrap');
    this.size = loadMemory();
    this.doneBtn = el('button', 'btn wrap-done', { type: 'button', 'aria-label': 'done', disabled: true });
    this.doneBtn.innerHTML = `${icons.check}<span>done</span>`;
    tactile(this.doneBtn, () => this.submit());
    // Which wrap to play on: lots of little bubbles, the usual, or a few big ones.
    this.sizes = new Segmented<BubbleSize>(
      [
        { value: 'small', icon: 'bubblesSmall', label: 'small bubbles' },
        { value: 'regular', icon: 'bubblesRegular', label: 'regular bubbles' },
        { value: 'jumbo', icon: 'bubblesJumbo', label: 'big bubbles' },
      ],
      this.bubbleSize,
      (v) => this.setSize(v),
    );
    const dock = el('div', 'dock', {}, [this.sizes.root, el('div', 'dock-divider'), this.doneBtn]);
    this.ui.append(this.toast.root, dock);
  }

  // ——— layout ———

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    this.safe = safe;
    const area = this.areaFor();
    const resized = Math.abs(area.w - this.area.w) > 2 || Math.abs(area.h - this.area.h) > 2;
    this.area = area;
    this.particles.width = w;
    if (!this.sheet || resized) this.makeSheet(this.phase !== 'play');
    else this.placeSheet();
  }

  /** Where the sheet lies: under the words at the top, clear of the done button. */
  private areaFor() {
    const { w, h, safe } = this;
    const top = safe.top + 162;
    const bottom = h - safe.bottom - 104;
    const aw = Math.min(w - 40, 420);
    const ah = Math.max(200, Math.min(bottom - top, aw * 1.7));
    return { x: (w - aw) / 2, y: top + Math.max(0, (bottom - top - ah) / 2), w: aw, h: ah };
  }

  private makeSheet(unroll: boolean) {
    const a = this.area;
    this.film = FILMS[this.filmAt++ % FILMS.length];
    const s = new Sheet(a.w, a.h, this.bubbleSize);
    s.events = { pop: (b, _cause, order) => this.onPop(b, order) };
    this.sheet = s;
    this.placeSheet();
    s.settle();
    s.frame();
    this.touches.clear();
    this.warm = false;
    this.pattern.clear();
    this.chosen.clear();
    this.setMem('ready');
    this.toast.show('get ready', 'watch for the glow');
    if (unroll) {
      this.phase = 'unroll';
      this.phaseT = 0;
      for (const b of s.bubbles) b.face?.set('sleepy', 99);
    }
  }

  private placeSheet() {
    const s = this.sheet!;
    const a = this.area;
    s.moveTo(a.x + (a.w - s.W) / 2, a.y + (a.h - s.H) / 2);
  }

  enter() {
    this.layout(this.w || window.innerWidth, this.h || window.innerHeight, this.safe);
    // Back in the room: always a fresh pattern, never one half-seen.
    if (this.phase === 'play' && this.mem !== 'ready') this.makeSheet(true);
    else this.toast.show('get ready', 'watch for the glow');
    if (this.phase === 'unroll') {
      this.phaseT = -ENTER_DELAY;
      material.rustle(UNROLL, ENTER_DELAY);
    }
  }

  leave() {
    this.toast.hide();
    this.releaseAll();
  }

  /** Roll the current sheet up and unroll a new one. */
  private freshSheet() {
    this.releaseAll();
    if (this.phase === 'play') {
      this.phase = 'away';
      this.phaseT = 0;
      this.sheet?.settle();
      this.sheet?.frame();
      material.rustle(ROLL_UP);
    } else if (this.phase !== 'away') {
      this.makeSheet(true);
      material.rustle(UNROLL);
    }
  }

  /** A different wrap: the sheet on the table rolls away and one of that size unrolls. */
  private setSize(v: BubbleSize) {
    this.bubbleSize = v;
    try {
      localStorage.setItem(SIZE_KEY, v);
    } catch {
      /* private mode: it just won't be remembered */
    }
    haptics.play('tick');
    this.toast.hide();
    this.freshSheet();
  }

  private releaseAll() {
    for (const b of this.touches.values()) if (b) b.pressing = false;
    this.touches.clear();
  }

  // ——— the game ———

  private setMem(m: Mem) {
    this.mem = m;
    this.memT = 0;
    this.doneBtn.disabled = m !== 'recall' || this.chosen.size === 0;
  }

  private stepMemory(dt: number) {
    this.memT += dt;
    const s = this.sheet;
    if (!s || this.phase !== 'play') return;
    switch (this.mem) {
      case 'ready':
        if (this.memT >= READY) {
          const live = s.bubbles.filter((b) => !b.popped);
          this.pattern = new Set(pickPattern(live.length, this.size).map((i) => live[i]));
          this.chosen.clear();
          this.setMem('watch');
          this.toast.show('remember these', `${this.pattern.size} bubbles`);
          material.sparkle(0);
          haptics.play('soft');
          for (const b of this.pattern) {
            b.wobble.impulse(6);
            b.face?.set('happy', flashFor(this.pattern.size));
          }
        }
        break;
      case 'watch':
        if (this.memT >= flashFor(this.pattern.size)) {
          this.setMem('recall');
          this.toast.show('your turn', `pop the ${this.pattern.size} you saw, then tap done`);
          haptics.play('tick');
        }
        break;
      case 'reveal':
        if (this.memT >= SHOW) this.freshSheet();
        break;
      default:
        break;
    }
  }

  /** Done: how well do your pops match the pattern? */
  private submit() {
    if (this.mem !== 'recall' || this.chosen.size === 0) return;
    const s = this.sheet!;
    const index = new Map(s.bubbles.map((b, i) => [b, i]));
    const n = this.pattern.size;
    const score = scoreMemory(
      [...this.pattern].map((b) => index.get(b)!),
      [...this.chosen].map((b) => index.get(b)!),
    );
    this.releaseAll();
    this.setMem('reveal');
    this.size = nextSize(n, score.grade);
    saveMemory(this.size);
    this.toast.show(...memoryVerdict(score, n));
    if (score.grade === 'perfect') material.tada();
    haptics.play(score.grade === 'perfect' ? 'soft' : 'tap');
    // The pattern answers back: the right ones beam, the missed ones peek out.
    for (const b of this.pattern) {
      b.wobble.impulse(5);
      if (!b.popped) b.face?.set('wide', 2);
    }
    for (const b of this.chosen) if (!this.pattern.has(b)) b.wobble.impulse(4);
  }

  private onPop(b: Bubble, order: number) {
    this.lastPop = performance.now();
    material.bubblePop(0.5, b.power, order, panFor(b.x, this.w), b.voice);
    haptics.play(b.power > 0.8 ? 'snap' : 'tap');
    if (b.power > 0.95) this.shake.kick(0.8);
    b.wobble.impulse(9);
    if (b.face) {
      b.face.base = 'sleepy';
      b.face.set('happy', 0.8);
    }
    this.particles.emit({
      kind: 'puff',
      x: b.x,
      y: b.y,
      count: 2 + Math.round(b.power * 3),
      speed: [40, 90 + b.power * 70],
      size: [b.r * 0.22, b.r * 0.45],
      life: [0.25, 0.45],
      color: '#ffffff',
    });
    // The neighbours flinch.
    const s = this.sheet!;
    for (const o of s.bubbles) {
      if (o === b || o.popped || Math.hypot(o.x - b.x, o.y - b.y) > s.pitch * 1.6) continue;
      o.wobble.impulse(rand(3, 6));
      o.face?.set('surprised', 0.45);
    }
    if (this.mem === 'recall') {
      this.chosen.add(b);
      this.doneBtn.disabled = false;
    }
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    const s = this.sheet;
    if (!s || this.phase !== 'play') return;
    // A tap once it's scored moves on to the next pattern.
    if (this.mem === 'reveal') {
      if (this.memT > 1) this.freshSheet();
      return;
    }
    if (this.mem !== 'recall') return;
    const b = s.bubbleAt(p.x, p.y);
    const live = b && !b.popped ? b : null;
    this.touches.set(p.id, live);
    if (live) this.pressOn(live);
    else if (s.contains(p.x, p.y)) {
      // A poke on bare film: it jiggles.
      s.kick(p.x, p.y, 70, s.pitch * 1.8);
      haptics.play('tick');
    }
  }

  private pressOn(b: Bubble) {
    b.pressing = true;
    b.face?.set('squeeze', 5);
    b.wobble.impulse(-3);
    haptics.play('tick');
  }

  /** Only the bubble you let go on pops: sliding off one lets it puff back up. */
  pointerMove(p: Pointer) {
    const s = this.sheet;
    if (!s || !this.touches.has(p.id) || this.mem !== 'recall') return;
    const was = this.touches.get(p.id) ?? null;
    const b = s.bubbleAt(p.x, p.y);
    const under = b && !b.popped ? b : null;
    if (under === was) return;
    if (was && !was.popped) {
      was.pressing = false;
      was.face?.set('calm', 0.1);
    }
    this.touches.set(p.id, under);
    if (under) this.pressOn(under);
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    const b = this.touches.get(p.id);
    this.touches.delete(p.id);
    if (!b || b.popped) return;
    b.pressing = false;
    if (!cancelled && this.phase === 'play' && this.mem === 'recall') this.sheet!.pop(b, 'press');
    else b.face?.set('calm', 0.1);
  }

  // ——— simulation ———

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.particles.update(dt);
    this.shake.update(dt);
    const s = this.sheet;
    if (!s) return;
    if (performance.now() - this.lastPop > 450) s.resetOrder();
    // Paint the popped looks a few at a time, before they're needed.
    if (!this.warm) this.warm = warmPopped(theme.current, this.film, s.radius);

    if (this.phase === 'unroll') {
      const k = this.unrolled;
      // Faces wake as the roll passes them.
      for (const b of s.bubbles) {
        if (b.face?.expression === 'sleepy' && !b.popped && b.v < k * s.H) {
          b.face.set('happy', rand(0.5, 0.9));
          b.wobble.impulse(rand(4, 7));
        }
      }
      if (this.phaseT >= UNROLL) {
        this.phase = 'play';
        this.phaseT = 0;
        haptics.play('tap');
      }
    } else if (this.phase === 'away' && this.phaseT >= ROLL_UP + ROLL_OFF) {
      this.makeSheet(true);
      material.rustle(UNROLL);
    }

    if (this.phase === 'play') {
      const steps = Math.min(8, Math.max(1, Math.ceil(dt * 240)));
      for (let i = 0; i < steps; i++) s.step(dt / steps);
      s.frame();
    }
    s.update(dt);
    this.stepMemory(dt);

    // Faces follow your finger.
    const reach = s.pitch * 3;
    const lead = [...this.touches.values()].find((b) => b);
    for (const b of s.bubbles) {
      if (!b.face || b.popped) continue;
      if (lead) b.face.look((lead.x - b.x) / reach, (lead.y - b.y) / reach);
      else b.face.look(0, 0);
    }
  }

  /** How much of a fresh sheet has unrolled (0..1). */
  private get unrolled() {
    return ease.inOutCubic(clamp(this.phaseT / UNROLL, 0, 1));
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    const a = this.area;
    const spot = { x: a.x + a.w / 2, y: a.y + a.h / 2, r: Math.max(a.w, a.h) * 0.8 };
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null, spot });
    ctx.save();
    this.shake.apply(ctx, w / 2, h / 2);
    const s = this.sheet;
    if (s) {
      if (this.phase === 'unroll') {
        // The roll travels down the table, laying the sheet out behind it.
        const k = this.unrolled;
        const edge = s.y0 + s.H * k;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, edge);
        ctx.clip();
        drawSheet(ctx, t, this.film, s, this.time);
        ctx.restore();
        const r = lerp(ROLL_FULL, ROLL_END, k) * (1 - smoothstep(0.9, 1, k));
        drawRoll(ctx, t, this.film, s.x0, edge, s.W, r);
      } else if (this.phase === 'away') {
        // Rolled back up from the top, then the roll trundles off.
        const k = ease.inOutCubic(clamp(this.phaseT / ROLL_UP, 0, 1));
        const off = ease.inCubic(clamp((this.phaseT - ROLL_UP) / ROLL_OFF, 0, 1));
        const edge = s.y0 + s.H * k;
        if (k < 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, edge, w, h);
          ctx.clip();
          drawSheet(ctx, t, this.film, s, this.time);
          ctx.restore();
        }
        const r = lerp(ROLL_END, ROLL_FULL, k);
        drawRoll(ctx, t, this.film, s.x0, edge + off * (h - edge + r * 2 + 30), s.W, r);
      } else {
        drawSheet(ctx, t, this.film, s, this.time);
        if (this.mem === 'watch' || this.mem === 'reveal') this.drawMemory(ctx);
      }
    }
    this.particles.draw(ctx);
    ctx.restore();
  }

  /** The glowing pattern, and once it's scored, which you got. */
  private drawMemory(ctx: CanvasRenderingContext2D) {
    const ring = (b: Bubble, color: string, a: number, dashed = false, width = 2.4) => {
      ctx.save();
      ctx.strokeStyle = rgba(color, a);
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    const glow = (b: Bubble, color: string, a: number) => {
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r * 1.55);
      g.addColorStop(0, rgba(color, 0.62 * a));
      g.addColorStop(0.62, rgba(color, 0.42 * a));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.55, 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.mem === 'watch') {
      const T = flashFor(this.pattern.size);
      const a = Math.min(smoothstep(0, FADE, this.memT), 1 - smoothstep(T - FADE, T, this.memT));
      for (const b of this.pattern) {
        glow(b, GOLD, a);
        ring(b, GOLD, a);
      }
      return;
    }
    // Scored: the ones you got beam gold, missed ones are a dashed gold ring,
    // and ones popped by mistake get a soft coral ring.
    const a = smoothstep(0, 0.35, this.memT);
    const beat = 0.75 + 0.25 * Math.sin(this.memT * 5);
    for (const b of this.pattern) {
      if (this.chosen.has(b)) {
        glow(b, GOLD, a * 0.8);
        ring(b, GOLD, a);
      } else ring(b, GOLD, a * beat, true, 2.6);
    }
    for (const b of this.chosen) if (!this.pattern.has(b)) ring(b, CORAL, a, false, 2.6);
  }
}
