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
import { material, ui as uiSound } from '../../core/sounds';
import { haptics, type HapticWord } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { Particles } from '../../render/particles';
import { el, iconButton, Hint, Segmented, tactile } from '../../ui/components';
import { Sheet, type Bubble, type BubbleSize, type PopCause } from './Sheet';
import { FILMS, drawRoll, drawSheet, drawSwatch, type Film } from './draw';

type Tool = 'press' | 'stretch';
type Phase = 'unroll' | 'play' | 'done' | 'away';

interface Touch {
  tool: Tool;
  x: number;
  y: number;
  /** press: the bubble under the finger. */
  bubble: Bubble | null;
  /** stretch: how far it's pulled (0..1+), and where the last crinkle was. */
  pull: number;
  lastCrinkle: number;
  grabbed: boolean;
}

const UNROLL = 0.8;
const AWAY = 0.55;
const ENTER_DELAY = 0.45;

/** How big a pop sounds and feels, by bubble size. */
const POP_SIZE: Record<BubbleSize, number> = { small: 0.15, regular: 0.5, jumbo: 0.9 };
const POP_HAPTIC: Record<BubbleSize, HapticWord> = { small: 'tap', regular: 'snap', jumbo: 'thud' };

/**
 * Room: bubble wrap. A sheet of little faces on the table. Press a bubble
 * until it pops, roll a finger across a row, or grab the sheet and stretch
 * it until bubbles give way on their own. Pop them all and the sheet rolls
 * away and a fresh one unrolls. Same chrome as every room: back + sound up
 * top, one dock below, a sheet that rises from it, hints that appear once.
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
  private film: Film = FILMS[0];
  private size: BubbleSize = 'regular';
  private tool: Tool = 'press';
  private phase: Phase = 'unroll';
  private phaseT = 0;
  private touches = new Map<number, Touch>();
  private particles = new Particles();
  private lastPop = 0;
  private pops = 0;
  private idleT = rand(2, 4);

  private segmented: Segmented<Tool>;
  private plus: HTMLButtonElement;
  private picker: HTMLDivElement;
  private swatches = new Map<string, HTMLButtonElement>();
  private sizes: Segmented<BubbleSize>;
  private open = false;
  private hints: Record<Tool, Hint> = {
    press: new Hint('press a bubble, or roll across a row', 'press'),
    stretch: new Hint('pull the sheet to stretch it', 'hand'),
  };

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-wrap');

    // ——— dock: tools · a fresh sheet ———
    this.segmented = new Segmented<Tool>(
      [
        { value: 'press', icon: 'press', label: 'press' },
        { value: 'stretch', icon: 'hand', label: 'stretch' },
      ],
      this.tool,
      (v) => this.setTool(v),
    );
    this.plus = iconButton('plus', 'a fresh sheet', () => this.toggle(), 'btn-plus');
    const dock = el('div', 'dock', {}, [this.segmented.root, el('div', 'dock-divider'), this.plus]);

    // ——— sheet picker: film colour + bubble size ———
    this.picker = el('div', 'sheet wrap-picker', { role: 'dialog', 'aria-label': 'a fresh sheet' });
    const grid = el('div', 'sheet-grid sheet-grid-5');
    FILMS.forEach((f, i) => {
      const b = el('button', 'fruit-btn', { type: 'button', 'aria-label': `${f.name} film`, title: f.name });
      b.style.setProperty('--i', String(i));
      b.append(this.swatch(f));
      tactile(b, () => {
        this.film = f;
        this.syncPicker();
        this.freshSheet();
        this.toggle(false);
      });
      this.swatches.set(f.id, b);
      grid.append(b);
    });
    this.sizes = new Segmented<BubbleSize>(
      [
        { value: 'small', icon: 'bubblesSmall', label: 'small bubbles' },
        { value: 'regular', icon: 'bubblesRegular', label: 'regular bubbles' },
        { value: 'jumbo', icon: 'bubblesJumbo', label: 'jumbo bubbles' },
      ],
      this.size,
      (v) => {
        this.size = v;
        this.freshSheet();
      },
    );
    const fresh = el('button', 'btn btn-text', { type: 'button' });
    fresh.innerHTML = `${icons.sparkle}<span>fresh sheet</span>`;
    tactile(fresh, () => {
      this.freshSheet();
      this.toggle(false);
    });
    this.picker.append(grid, el('div', 'wrap-sizes', {}, [this.sizes.root]), fresh);
    this.syncPicker();

    this.ui.append(this.hints.press.root, this.hints.stretch.root, this.picker, dock);
  }

  private swatch(f: Film) {
    const size = 52;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = `${size}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawSwatch(ctx, theme.current, f, size);
    return c;
  }

  private syncPicker() {
    for (const [id, b] of this.swatches) b.classList.toggle('is-on', id === this.film.id);
  }

  // ——— layout ———

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    this.safe = safe;
    const top = safe.top + 76;
    const bottom = h - safe.bottom - 18 - 64 - 26;
    const aw = Math.min(w - 40, 420);
    const ah = Math.max(200, Math.min(bottom - top, aw * 1.7));
    const area = { x: (w - aw) / 2, y: top + Math.max(0, (bottom - top - ah) / 2), w: aw, h: ah };
    const resized = Math.abs(area.w - this.area.w) > 2 || Math.abs(area.h - this.area.h) > 2;
    this.area = area;
    this.particles.width = w;
    if (!this.sheet || resized) this.makeSheet(this.phase !== 'play');
    else this.placeSheet();
  }

  private makeSheet(unroll: boolean) {
    const a = this.area;
    const s = new Sheet(a.w, a.h, this.size);
    s.events = { pop: (b, cause, order) => this.onPop(b, cause, order) };
    this.sheet = s;
    this.placeSheet();
    s.settle();
    s.frame();
    this.touches.clear();
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
    if (this.sheet && this.sheet.remaining === 0) this.makeSheet(true);
    if (this.phase === 'unroll') {
      // Wait for the room to slide in, then unroll in plain view.
      this.phaseT = -ENTER_DELAY;
      material.rustle(UNROLL, ENTER_DELAY);
    }
    this.showHint(this.tool);
  }

  leave() {
    this.toggle(false);
    for (const h of Object.values(this.hints)) h.hide();
    this.releaseAll();
  }

  // ——— chrome ———

  private showHint(t: Tool) {
    for (const [k, h] of Object.entries(this.hints)) if (k !== t) h.hide();
    if (!settings.value.seenHints.includes(`wrap-${t}`)) this.hints[t].show(t === 'press' ? 1300 : 250);
  }

  private doneHint(t: Tool) {
    if (settings.value.seenHints.includes(`wrap-${t}`)) return;
    settings.markHintSeen(`wrap-${t}`);
    this.hints[t].hide();
  }

  private setTool(t: Tool) {
    this.tool = t;
    haptics.play('tick');
    this.toggle(false);
    this.releaseAll();
    this.showHint(t);
  }

  private toggle(force?: boolean) {
    const next = force ?? !this.open;
    if (next === this.open) return;
    this.open = next;
    this.picker.classList.toggle('is-open', next);
    this.plus.classList.toggle('is-on', next);
    uiSound.sheet(next);
  }

  /** Roll the current sheet away (if any) and unroll a new one. */
  private freshSheet() {
    this.releaseAll();
    if (this.phase === 'play' || this.phase === 'done') {
      this.phase = 'away';
      this.phaseT = 0;
      material.rustle(AWAY);
    } else {
      this.makeSheet(true);
      material.rustle(UNROLL);
    }
  }

  private releaseAll() {
    for (const [id, t] of this.touches) {
      if (t.bubble) t.bubble.pressing = false;
      this.sheet?.release(id);
    }
    this.touches.clear();
  }

  // ——— the sheet talking back ———

  private onPop(b: Bubble, cause: PopCause, order: number) {
    const s = this.sheet!;
    const now = performance.now();
    this.lastPop = now;
    const z = POP_SIZE[s.size];
    // A quick run of pops climbs the scale; a lone pop is just a pop.
    material.bubblePop(cause === 'strain' ? z * 0.6 : z, order, panFor(b.x, this.w));
    haptics.play(cause === 'strain' ? 'tap' : POP_HAPTIC[s.size]);
    b.wobble.impulse(9);
    if (b.face) {
      b.face.base = 'sleepy';
      b.face.set('happy', 0.7);
    }
    this.particles.emit({
      kind: 'puff',
      x: b.x,
      y: b.y,
      count: 3,
      speed: [40, 110],
      size: [b.r * 0.25, b.r * 0.45],
      life: [0.25, 0.45],
      color: '#ffffff',
    });
    if (Math.random() < 0.35) {
      this.particles.emit({ kind: 'sparkle', x: b.x, y: b.y, count: 1, speed: [40, 90], size: [3, 5], life: [0.4, 0.6], color: '#ffffff' });
    }
    // The neighbours flinch.
    const near = s.pitch * 1.6;
    for (const o of s.bubbles) {
      if (o === b || o.popped) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d > near) continue;
      o.wobble.impulse(rand(3, 6));
      o.face?.set('surprised', 0.45);
    }
    this.pops++;
    if (this.pops >= 3) this.doneHint('press');
    if (s.remaining === 0 && this.phase === 'play') {
      this.phase = 'done';
      this.phaseT = 0;
    }
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    if (this.open) {
      this.toggle(false);
      return;
    }
    const s = this.sheet;
    if (!s || this.phase !== 'play') return;
    const t: Touch = { tool: this.tool, x: p.x, y: p.y, bubble: null, pull: 0, lastCrinkle: 0, grabbed: false };
    this.touches.set(p.id, t);
    if (t.tool === 'press') {
      const b = s.bubbleAt(p.x, p.y);
      if (b) this.pressOn(t, b);
    } else if (s.grab(p.id, p.x, p.y)) {
      t.grabbed = true;
      haptics.play('tick');
      material.squeak(0.15, panFor(p.x, this.w));
    }
  }

  private pressOn(t: Touch, b: Bubble) {
    t.bubble = b;
    b.pressing = true;
    b.face?.set('squeeze', 5);
    haptics.play('tick');
  }

  pointerMove(p: Pointer) {
    const t = this.touches.get(p.id);
    const s = this.sheet;
    if (!t || !s || this.phase !== 'play') return;
    const px = t.x;
    const py = t.y;
    t.x = p.x;
    t.y = p.y;
    if (t.tool === 'press') {
      // Rolling across: every bubble the finger leaves behind pops.
      const under = s.bubbleAt(p.x, p.y);
      for (const b of s.bubblesAlong(px, py, p.x, p.y)) if (b !== under) s.pop(b, 'roll');
      if (under !== t.bubble) {
        if (t.bubble && !t.bubble.popped) s.pop(t.bubble, 'roll');
        t.bubble = null;
        if (under) this.pressOn(t, under);
      }
      return;
    }
    if (!t.grabbed) return;
    t.pull = s.drag(p.id, p.x, p.y);
    // Crinkles that come quicker and louder the further you pull.
    const step = lerp(0.16, 0.07, clamp(t.pull, 0, 1));
    if (Math.abs(t.pull - t.lastCrinkle) > step) {
      t.lastCrinkle = t.pull;
      material.crinkle(clamp(t.pull, 0, 1), panFor(p.x, this.w));
      haptics.play('tick');
      if (t.pull > 0.5) material.squeak(clamp(t.pull - 0.3, 0, 1), panFor(p.x, this.w));
    }
    if (t.pull > 0.35) this.doneHint('stretch');
    // Too far: it slips out of your fingers and snaps back.
    if (t.pull > 1.9) {
      s.release(p.id);
      t.grabbed = false;
      material.snapBack(1, panFor(p.x, this.w));
      haptics.play('snap');
      for (const b of s.bubbles) b.face?.set('surprised', 0.5);
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    const t = this.touches.get(p.id);
    this.touches.delete(p.id);
    const s = this.sheet;
    if (!t || !s) return;
    if (t.tool === 'press') {
      const b = t.bubble;
      if (!b || b.popped) return;
      b.pressing = false;
      // Any real press pops on release; a cancelled touch lets it puff back.
      if (!cancelled && this.phase === 'play') s.pop(b, 'press');
      else b.face?.set('calm', 0.1);
      return;
    }
    if (t.grabbed) {
      s.release(p.id);
      if (t.pull > 0.15) material.snapBack(clamp(t.pull, 0, 1), panFor(p.x, this.w));
      if (t.pull > 0.4) haptics.play('soft');
    }
  }

  // ——— simulation ———

  update(dt: number) {
    this.phaseT += dt;
    this.particles.update(dt);
    const s = this.sheet;
    if (!s) return;
    if (performance.now() - this.lastPop > 450) s.resetOrder();

    switch (this.phase) {
      case 'unroll': {
        const k = ease.outCubic(clamp(this.phaseT / UNROLL, 0, 1));
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
        }
        break;
      }
      case 'done': {
        if (this.phaseT > 0.25 && this.phaseT - dt <= 0.25) {
          material.sparkle(0);
          for (const b of s.bubbles) b.face?.set('happy', 2);
        }
        if (this.phaseT > 1.3) {
          this.phase = 'away';
          this.phaseT = 0;
          material.rustle(AWAY);
        }
        break;
      }
      case 'away': {
        if (this.phaseT >= AWAY) {
          this.makeSheet(true);
          material.rustle(UNROLL);
        }
        break;
      }
    }

    if (this.phase === 'play' || this.phase === 'done') {
      const steps = Math.min(8, Math.max(1, Math.ceil(dt * 240)));
      for (let i = 0; i < steps; i++) s.step(dt / steps);
      s.frame();
    }
    s.update(dt);

    // Faces follow your finger, and look worried when the film is taut.
    const lead = [...this.touches.values()][0];
    const reach = s.pitch * 3;
    for (const b of s.bubbles) {
      const f = b.face;
      if (!f || b.popped) continue;
      if (lead) f.look((lead.x - b.x) / reach, (lead.y - b.y) / reach);
      else f.look(0, 0);
      if (b.stretch > b.limit - 0.08) f.set('strain', 0.2);
      else if (b.stretch > 1.22) f.set('wide', 0.25);
    }
    // Now and then, one of them wiggles.
    this.idleT -= dt;
    if (this.idleT <= 0 && this.phase === 'play') {
      this.idleT = rand(2.5, 5);
      const awake = s.bubbles.filter((b) => !b.popped && b.face);
      const b = awake[Math.floor(rand(0, awake.length))];
      if (b) {
        b.wobble.impulse(5);
        b.face!.set(Math.random() < 0.5 ? 'happy' : 'wide', 0.6);
      }
    }
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null });
    const s = this.sheet;
    if (s) {
      if (this.phase === 'unroll') {
        const k = ease.outCubic(clamp(this.phaseT / UNROLL, 0, 1));
        const edge = s.y0 + s.H * k;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, edge);
        ctx.clip();
        drawSheet(ctx, t, this.film, s);
        ctx.restore();
        const r = lerp(16, 6, k) * (1 - smoothstep(0.88, 1, k));
        if (r > 0.5) drawRoll(ctx, t, this.film, s.x0, edge, s.W, r);
      } else if (this.phase === 'away') {
        const k = ease.inCubic(clamp(this.phaseT / AWAY, 0, 1));
        ctx.save();
        ctx.translate(0, k * (h - s.y0 + 40));
        ctx.globalAlpha = 1 - k * 0.4;
        drawSheet(ctx, t, this.film, s);
        ctx.restore();
      } else {
        drawSheet(ctx, t, this.film, s);
      }
      // A soft fingertip where the film is held.
      for (const g of s.grabs.values()) {
        ctx.fillStyle = rgba(t.ink, 0.08);
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.particles.draw(ctx);
    paintGrain(ctx, w, h, t);
  }
}
