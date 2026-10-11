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
import { Shake } from '../../render/camera';
import { el, iconButton, Hint, Segmented, tactile } from '../../ui/components';
import { Sheet, type Bubble, type BubbleSize, type PopCause } from './Sheet';
import { FILMS, drawRoll, drawSheet, drawSwatch, film, type Film } from './draw';

type Tool = 'press' | 'stretch';
type Phase = 'unroll' | 'play' | 'done' | 'away';

interface Touch {
  tool: Tool;
  x: number;
  y: number;
  /** press: the bubble under the finger, and the pops this stroke made. */
  bubble: Bubble | null;
  popped: Bubble[];
  /** stretch: how far it's pulled (0..1+), and where the last crinkle was. */
  pull: number;
  lastCrinkle: number;
  grabbed: boolean;
}

/** Seconds: unrolling a fresh sheet, rolling one up, and it leaving. */
const UNROLL = 0.85;
const ROLL_UP = 0.7;
const ROLL_OFF = 0.4;
/** Wait for the room to slide in before the first unroll. */
const ENTER_DELAY = 0.45;
/** Untouched this long, the bubbles doze off. */
const DOZE_AFTER = 14;
/** The roll's radius as a sheet starts and finishes unrolling (px). */
const ROLL_FULL = 22;
const ROLL_END = 8;

/** How big a pop sounds and feels, by bubble size. */
const POP_SIZE: Record<BubbleSize, number> = { small: 0.15, regular: 0.5, jumbo: 0.9 };
const POP_HAPTIC: Record<BubbleSize, HapticWord> = { small: 'tap', regular: 'snap', jumbo: 'thud' };

const PREFS = 'softspot.wrap.v1';

function loadPrefs(): { film: string; size: BubbleSize } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}');
    const size = ['small', 'regular', 'jumbo'].includes(p.size) ? p.size : 'regular';
    return { film: typeof p.film === 'string' ? p.film : FILMS[0].id, size };
  } catch {
    return { film: FILMS[0].id, size: 'regular' };
  }
}

/**
 * Room: bubble wrap. A sheet of little faces on the table. Press a bubble
 * until it gives, roll a finger across a row, or grab the sheet and stretch
 * it until bubbles crackle on their own. Pop them all and the sheet rolls
 * itself up and a fresh one unrolls. Same chrome as every room: back + sound
 * up top, one dock below, a sheet that rises from it, hints that appear once.
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
  private film: Film;
  private size: BubbleSize;
  private tool: Tool = 'press';
  private phase: Phase = 'unroll';
  private phaseT = 0;
  private time = 0;
  private touches = new Map<number, Touch>();
  /** The stroke whose finger is popping bubbles right now, if any. */
  private rolling: Touch | null = null;
  private particles = new Particles();
  private shake = new Shake();
  private lastPop = 0;
  private pops = 0;
  private idleT = rand(2, 4);
  private untouched = 0;
  private dozing = false;

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
    const prefs = loadPrefs();
    this.film = film(prefs.film);
    this.size = prefs.size;
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
        this.savePrefs();
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
        this.savePrefs();
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
    // Day ↔ dusk: repaint the little swatches to match.
    theme.onChange(() => {
      for (const f of FILMS) this.swatches.get(f.id)?.replaceChildren(this.swatch(f));
    });

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

  private savePrefs() {
    this.syncPicker();
    try {
      localStorage.setItem(PREFS, JSON.stringify({ film: this.film.id, size: this.size }));
    } catch {
      /* private mode */
    }
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
    s.events = {
      pop: (b, cause, order) => this.onPop(b, cause, order),
      strain: (b, step) => this.onStrain(b, step),
    };
    this.sheet = s;
    this.placeSheet();
    s.settle();
    s.frame();
    this.touches.clear();
    this.dozing = false;
    this.untouched = 0;
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

  /** Roll the current sheet up (if any) and unroll a new one. */
  private freshSheet() {
    this.releaseAll();
    if (this.phase === 'play' || this.phase === 'done') {
      this.phase = 'away';
      this.phaseT = 0;
      this.sheet?.settle();
      this.sheet?.frame();
      material.rustle(ROLL_UP);
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

  private onStrain(b: Bubble, step: number) {
    const s = this.sheet!;
    material.bubbleStrain(step, POP_SIZE[s.size], panFor(b.x, this.w));
    haptics.play('tick');
    b.wobble.impulse(-1.5 * step);
    if (step >= 2) {
      // The neighbours watch, worried.
      for (const o of this.near(b, 1.25)) o.face?.set(step === 3 ? 'nervous' : 'wide', 0.6);
    }
  }

  private onPop(b: Bubble, cause: PopCause, order: number) {
    const s = this.sheet!;
    this.lastPop = performance.now();
    const z = POP_SIZE[s.size];
    const strain = cause === 'strain';
    const power = strain ? 0.45 : b.power;
    material.bubblePop(z, power, order, panFor(b.x, this.w), b.voice);
    haptics.play(strain ? 'tap' : power > 0.8 ? POP_HAPTIC[s.size] : s.size === 'jumbo' ? 'snap' : 'tap');
    if (s.size === 'jumbo' && power > 0.8) this.shake.kick(2.2);
    else if (s.size === 'regular' && power > 0.95) this.shake.kick(0.8);
    b.wobble.impulse(9);
    if (b.face) {
      b.face.base = 'sleepy';
      b.face.set('happy', 0.8);
    }
    this.particles.emit({
      kind: 'puff',
      x: b.x,
      y: b.y,
      count: 2 + Math.round(power * 3),
      speed: [40, 90 + power * 70],
      size: [b.r * 0.22, b.r * 0.45],
      life: [0.25, 0.45],
      color: '#ffffff',
    });
    if (power > 0.9 || Math.random() < 0.25) {
      this.particles.emit({
        kind: 'sparkle',
        x: b.x,
        y: b.y,
        count: power > 0.9 ? 2 : 1,
        speed: [50, 110],
        size: [3, 5.5],
        life: [0.4, 0.65],
        color: '#ffffff',
      });
    }
    // The neighbours flinch.
    for (const o of this.near(b, 1.6)) {
      o.wobble.impulse(rand(3, 6) * (0.6 + power * 0.5));
      o.face?.set('surprised', 0.45);
    }
    // Rolled across a whole row in one go? It chimes.
    const t = this.rolling ?? [...this.touches.values()].find((o) => o.bubble === b);
    if (t && !strain) {
      t.popped.push(b);
      this.checkRow(t, b);
    }

    this.pops++;
    if (this.pops >= 3) this.doneHint('press');
    if (s.remaining === 0 && this.phase === 'play') {
      this.phase = 'done';
      this.phaseT = 0;
      this.celebrate(b);
    }
  }

  private checkRow(t: Touch, b: Bubble) {
    const row = this.sheet!.rowOf(b.row);
    if (row.length < 3 || !row.every((o) => o.popped)) return;
    const mine = row.filter((o) => t.popped.includes(o)).length;
    if (mine < Math.ceil(row.length * 0.6)) return;
    material.bubbleRow(panFor(b.x, this.w));
    haptics.play('soft');
    for (const o of row) {
      this.particles.emit({ kind: 'sparkle', x: o.x, y: o.y, count: 1, speed: [20, 60], size: [3, 5], life: [0.5, 0.8], color: '#ffffff' });
    }
  }

  /** Unpopped bubbles within `pitches` of one bubble. */
  private near(b: Bubble, pitches: number) {
    const s = this.sheet!;
    const d = s.pitch * pitches;
    return s.bubbles.filter((o) => o !== b && !o.popped && Math.hypot(o.x - b.x, o.y - b.y) < d);
  }

  /** The last bubble went: a happy ripple runs out across the sheet. */
  private celebrate(from: Bubble) {
    material.tada();
    haptics.play('soft');
    for (const b of this.sheet!.bubbles) b.wakeIn = Math.hypot(b.x - from.x, b.y - from.y) / 700;
  }

  /** Someone came back: the bubbles wake in a ripple from the touch. */
  private wake(x: number, y: number) {
    if (!this.dozing) return;
    this.dozing = false;
    for (const b of this.sheet!.bubbles) {
      if (b.popped || !b.face) continue;
      b.face.base = 'calm';
      b.wakeIn = Math.hypot(b.x - x, b.y - y) / 600;
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
    this.untouched = 0;
    this.wake(p.x, p.y);
    const t: Touch = { tool: this.tool, x: p.x, y: p.y, bubble: null, popped: [], pull: 0, lastCrinkle: 0, grabbed: false };
    this.touches.set(p.id, t);
    if (t.tool === 'press') {
      const b = s.bubbleAt(p.x, p.y);
      if (b) this.pressOn(t, b);
      else if (s.contains(p.x, p.y)) {
        // A poke on bare film: it jiggles, and everyone looks.
        s.kick(p.x, p.y, 70, s.pitch * 1.8);
        haptics.play('tick');
        material.boop(20, 0.25, panFor(p.x, this.w));
      }
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
    b.wobble.impulse(-3);
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
    this.untouched = 0;
    if (t.tool === 'press') {
      // Rolling across: every bubble the finger leaves behind pops, a bit
      // harder the faster you go.
      const under = s.bubbleAt(p.x, p.y);
      const power = clamp(0.45 + Math.hypot(p.vx, p.vy) / 3000, 0.45, 0.8);
      this.rolling = t;
      for (const b of s.bubblesAlong(px, py, p.x, p.y)) if (b !== under) s.pop(b, 'roll', Math.max(power, b.press));
      if (under !== t.bubble) {
        if (t.bubble && !t.bubble.popped) s.pop(t.bubble, 'roll', Math.max(power, t.bubble.press));
        t.bubble = null;
        if (under) this.pressOn(t, under);
      }
      this.rolling = null;
      return;
    }
    if (!t.grabbed) return;
    t.pull = s.drag(p.id, p.x, p.y);
    // Crinkles that come quicker and louder the further you pull.
    const step = lerp(0.16, 0.06, clamp(t.pull, 0, 1));
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
      this.shake.kick(1.2);
      for (const b of s.bubbles) if (!b.popped) b.face?.set(Math.random() < 0.3 ? 'dizzy' : 'surprised', 0.7);
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    const t = this.touches.get(p.id);
    this.touches.delete(p.id);
    const s = this.sheet;
    if (!t || !s) return;
    if (t.tool === 'press') {
      const b = t.bubble;
      if (b && !b.popped) {
        b.pressing = false;
        // Any real press pops on release (a quick tap is a small pop); a
        // cancelled touch lets it puff back up.
        if (!cancelled && this.phase === 'play') s.pop(b, 'press');
        else b.face?.set('calm', 0.1);
      }
      // A long roll ends with a little flourish.
      if (t.popped.length >= 5 && !cancelled) material.sparkle(panFor(p.x, this.w));
      return;
    }
    if (t.grabbed) {
      s.release(p.id);
      if (t.pull > 0.15) material.snapBack(clamp(t.pull, 0, 1), panFor(p.x, this.w));
      if (t.pull > 0.4) {
        haptics.play('soft');
        for (const b of s.bubbles) if (!b.popped && b.stretch > 1.15) b.face?.set('happy', 0.5);
      }
    }
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

    switch (this.phase) {
      case 'unroll': {
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
        break;
      }
      case 'done': {
        if (this.phaseT > 1.6) {
          this.phase = 'away';
          this.phaseT = 0;
          s.settle();
          s.frame();
          material.rustle(ROLL_UP);
        }
        break;
      }
      case 'away': {
        if (this.phaseT >= ROLL_UP + ROLL_OFF) {
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

    // Ripples: wake-ups and the finale travel out across the sheet.
    for (const b of s.bubbles) {
      if (b.wakeIn < 0) continue;
      b.wakeIn -= dt;
      if (b.wakeIn < 0) {
        b.wobble.impulse(rand(5, 8));
        b.face?.set('happy', this.phase === 'done' ? 1.4 : 0.7);
        if (this.phase === 'done') s.kick(b.x, b.y, 25, s.pitch);
      }
    }

    // Faces follow your finger, and look worried when the film is taut.
    const lead = this.touches.values().next().value;
    const reach = s.pitch * 3;
    for (const b of s.bubbles) {
      const f = b.face;
      if (!f || b.popped) continue;
      if (lead) f.look((lead.x - b.x) / reach, (lead.y - b.y) / reach);
      else f.look(0, 0);
      if (b.stretch > b.limit - 0.08) f.set('strain', 0.2);
      else if (b.stretch > 1.22) f.set('wide', 0.25);
    }

    if (this.phase !== 'play') return;
    // Left alone a while, they doze off; a touch wakes them.
    this.untouched += dt;
    if (!this.dozing && this.untouched > DOZE_AFTER && this.touches.size === 0) {
      this.dozing = true;
      for (const b of s.bubbles) if (!b.popped && b.face) b.face.base = 'sleepy';
    }
    // Now and then, one of them wiggles.
    this.idleT -= dt;
    if (this.idleT <= 0 && !this.dozing) {
      this.idleT = rand(2.5, 5);
      const awake = s.bubbles.filter((b) => !b.popped && b.face);
      const b = awake[Math.floor(rand(0, awake.length))];
      if (b) {
        b.wobble.impulse(5);
        b.face!.set(Math.random() < 0.5 ? 'happy' : 'wide', 0.6);
      }
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
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null });
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
    ctx.restore();
    paintGrain(ctx, w, h, t);
  }
}
