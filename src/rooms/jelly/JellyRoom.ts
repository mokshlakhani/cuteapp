import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { icons, type IconName } from '../../design/icons';
import { clamp } from '../../core/math';
import { rgba } from '../../core/color';
import { material, ui as uiSound } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { Face, drawFace } from '../../render/face';
import { el, iconButton, Hint, Segmented, tactile } from '../../ui/components';
import { getLab, type Lab } from './Lab';
import { JELLY_FRUITS, drawFruitIcon, type JellyFruit } from './fruits';
import type { Piece } from './Piece';

type Tool = 'hand' | 'knife';

interface Hold {
  piece: Piece;
  t0: number;
  moved: boolean;
  step: number;
}

/**
 * Room: jelly. Soft fruit jellies on a table, seen from above. Slice them
 * with the knife, or grab, slide, toss and twist them by hand — and press
 * two crumbs of the same fruit together to melt them back into one. Chrome is
 * the same as every other room: back + sound up top, one dock below, sheets
 * that rise from it, and a hint that appears once.
 */
export class JellyRoom implements Scene {
  readonly id = 'jelly';
  readonly tint = roomTint.jelly;
  readonly ui: HTMLElement;

  private lab: Lab;
  private w = 0;
  private h = 0;
  private safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private tool: Tool = 'knife';
  private holds = new Map<number, Hold>();
  private pointers = new Map<number, { x: number; y: number }>();
  private twistAngle: number | null = null;
  private stroke: { id: number; ax: number; ay: number; bx: number; by: number; aimed: boolean } | null = null;
  private statsT = 0;

  private segmented: Segmented<Tool>;
  private plus: HTMLButtonElement;
  private gear: HTMLButtonElement;
  private fruitSheet: HTMLDivElement;
  private settingsSheet: HTMLDivElement;
  private open: 'fruit' | 'settings' | null = null;
  private caption: HTMLElement;
  private hints: Record<Tool, Hint> = {
    knife: new Hint('draw a line across to slice', 'knife'),
    hand: new Hint('grab, slide or flick a jelly', 'hand'),
  };
  private mergeHint = new Hint('too small to cut · push two together to melt', 'hand');
  private pressStep = -1;
  private pauseRow!: HTMLButtonElement;

  constructor(_nav: RoomNav) {
    this.lab = getLab();
    this.lab.events = {
      impact: (p, v) => this.onImpact(p, v),
      bump: (_a, _b, v) => {
        material.plop(30, clamp(v / 400, 0, 1));
        if (v > 160) haptics.play('tick');
      },
      cut: (n, small) => this.onCut(n, small),
      bounce: () => {
        material.boing();
        haptics.play('soft');
        // Tiny crumbs can't be cut, but they can be melted back together.
        this.showOnce('jelly-merge', this.mergeHint, 700);
      },
      pressing: (_a, _b, k) => {
        const step = Math.floor(k * 3);
        if (step > this.pressStep) {
          material.squeak(0.3 + k * 0.5);
          haptics.play('tick');
        }
        this.pressStep = step;
      },
      merge: (m, from) => {
        material.melt(clamp(m.inradius / 3, 0, 1));
        haptics.play('soft');
        this.pressStep = -1;
        for (const hold of this.holds.values()) if (from.includes(hold.piece)) hold.piece = m;
        this.mergeHint.hide();
      },
      land: () => {
        material.thump(0.35);
        haptics.play('snap');
      },
    };

    this.ui = el('div', 'room room-jelly');

    // ——— dock: tools · add a fruit · settings ———
    this.segmented = new Segmented<Tool>(
      [
        { value: 'hand', icon: 'hand', label: 'hand' },
        { value: 'knife', icon: 'knife', label: 'knife' },
      ],
      this.tool,
      (v) => this.setTool(v),
    );
    this.plus = iconButton('plus', 'add a fruit', () => this.toggle('fruit'), 'btn-plus');
    this.gear = iconButton('sliders', 'jelly settings', () => this.toggle('settings'));
    const dock = el('div', 'dock', {}, [this.segmented.root, el('div', 'dock-divider'), this.plus, this.gear]);

    // ——— fruit sheet ———
    this.fruitSheet = el('div', 'sheet', { role: 'dialog', 'aria-label': 'add a fruit' });
    const grid = el('div', 'sheet-grid sheet-grid-5');
    JELLY_FRUITS.forEach((f, i) => {
      const b = el('button', 'fruit-btn', { type: 'button', 'aria-label': f.name, title: f.name });
      b.style.setProperty('--i', String(i));
      b.append(this.fruitIcon(f));
      tactile(b, () => {
        if (this.lab.addFruit(f.id)) material.pop(0.6);
        this.toggle(null);
      });
      grid.append(b);
    });
    const fresh = el('button', 'btn btn-text', { type: 'button' });
    fresh.innerHTML = `${icons.sparkle}<span>fresh start</span>`;
    tactile(fresh, () => {
      this.lab.reset();
      material.sparkle(0);
      this.toggle(null);
    });
    this.fruitSheet.append(grid, fresh);

    // ——— settings sheet (same switches as the sound menu) ———
    this.settingsSheet = el('div', 'sheet jelly-settings', { role: 'dialog', 'aria-label': 'jelly settings' });
    this.caption = el('p', 'sheet-caption');
    const slider = (id: string, label: string, lo: string, hi: string, value: number, onInput: (v: number) => void) => {
      const input = el('input', 'range', {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        value: String(value),
        id,
        'aria-label': label,
      }) as HTMLInputElement;
      input.addEventListener('input', () => {
        onInput(parseFloat(input.value));
        haptics.play('tick');
      });
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      return el('label', 'range-row', { for: id }, [
        el('span', 'range-label', {}, [label]),
        input,
        el('span', 'range-ends', {}, [el('span', '', {}, [lo]), el('span', '', {}, [hi])]),
      ]);
    };
    const toggleRow = (icon: IconName, label: string, fn: (on: boolean) => void) => {
      const row = el('button', 'toggle', { type: 'button', role: 'switch', 'aria-checked': 'false' });
      row.innerHTML = `<span class="toggle-icon">${icons[icon]}</span><span class="toggle-label">${label}</span><span class="toggle-pill"><span class="toggle-knob"></span></span>`;
      tactile(
        row,
        () => {
          const on = !row.classList.contains('is-on');
          row.classList.toggle('is-on', on);
          row.setAttribute('aria-checked', String(on));
          uiSound.toggle(on);
          fn(on);
        },
        { sound: false },
      );
      return row;
    };
    this.pauseRow = toggleRow('pause', 'pause', (on) => (this.lab.paused = on));
    const nudge = el('button', 'btn btn-text', { type: 'button' });
    nudge.innerHTML = `${icons.wave}<span>give it a nudge</span>`;
    tactile(nudge, () => this.nudge());
    this.settingsSheet.append(
      this.caption,
      slider('jelly-firmness', 'firmness', 'wobbly', 'firm', this.lab.firmness, (v) => (this.lab.firmness = v)),
      slider('jelly-damping', 'settle', 'lively', 'syrupy', this.lab.dampingAmt, (v) => (this.lab.dampingAmt = v)),
      toggleRow('slow', 'slow motion', (on) => (this.lab.timeScale = on ? 0.25 : 1)),
      toggleRow('grid', 'show mesh', (on) => this.lab.setShowMesh(on)),
      this.pauseRow,
      nudge,
    );

    this.ui.append(this.hints.knife.root, this.hints.hand.root, this.mergeHint.root, this.fruitSheet, this.settingsSheet, dock);

    // Desktop: scroll while holding to twist.
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.ui.classList.contains('is-active')) return;
        for (const id of this.holds.keys()) this.lab.twist(id, e.deltaY * 0.004);
      },
      { passive: true },
    );
  }

  /** Fruit icons share the app's look: the cross-section with a little face. */
  private fruitIcon(f: JellyFruit) {
    const size = 52;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = `${size}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawFruitIcon(ctx, f, size);
    const face = new Face();
    face.base = 'calm';
    ctx.save();
    ctx.translate(size / 2, size / 2 + (f.code === 0 ? 6 : 1));
    drawFace(ctx, face, size * (f.code === 0 ? 0.32 : 0.38), { ink: '#3A2621', blush: f.blush });
    ctx.restore();
    return c;
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    this.safe = safe;
    // The table fills the space between the top bar and the dock.
    const top = safe.top + 72;
    const bottom = h - safe.bottom - 18 - 64 - 16;
    this.lab.resize(w, h, window.devicePixelRatio || 1, top, Math.max(top + 200, bottom));
  }

  enter() {
    this.layout(this.w || window.innerWidth, this.h || window.innerHeight, this.safe);
    this.showHint(this.tool);
  }

  leave() {
    this.toggle(null);
    for (const h of Object.values(this.hints)) h.hide();
    this.mergeHint.hide();
    for (const id of [...this.holds.keys()]) this.lab.release(id);
    this.holds.clear();
    this.pointers.clear();
    this.lab.cancelKnife();
    this.stroke = null;
  }

  // ——— chrome ———

  private showHint(t: Tool) {
    for (const [k, h] of Object.entries(this.hints)) if (k !== t) h.hide();
    if (!settings.value.seenHints.includes(`jelly-${t}`)) this.hints[t].show(t === 'knife' ? 1200 : 250);
  }

  /** A one-time tip that fades by itself after a few seconds. */
  private showOnce(key: string, hint: Hint, delay: number) {
    if (settings.value.seenHints.includes(key)) return;
    settings.markHintSeen(key);
    for (const h of Object.values(this.hints)) h.hide();
    hint.show(delay);
    window.setTimeout(() => hint.hide(), delay + 6000);
  }

  private doneHint(t: Tool) {
    if (settings.value.seenHints.includes(`jelly-${t}`)) return;
    settings.markHintSeen(`jelly-${t}`);
    this.hints[t].hide();
  }

  private setTool(t: Tool) {
    this.tool = t;
    haptics.play('tick');
    this.toggle(null);
    this.lab.cancelKnife();
    this.stroke = null;
    this.showHint(t);
  }

  private toggle(which: 'fruit' | 'settings' | null) {
    const next = which === this.open ? null : which;
    if (next === this.open) return;
    this.open = next;
    this.fruitSheet.classList.toggle('is-open', next === 'fruit');
    this.settingsSheet.classList.toggle('is-open', next === 'settings');
    this.plus.classList.toggle('is-on', next === 'fruit');
    this.gear.classList.toggle('is-on', next === 'settings');
    uiSound.sheet(next !== null);
  }

  private nudge() {
    this.lab.nudge();
    material.boop(40, 0.7);
    material.boop(30, 0.5);
    haptics.play('soft');
  }

  // ——— events from the table ———

  private onImpact(p: Piece, v: number) {
    const s = clamp(v / 420, 0, 1);
    material.boop(p.inradius * 14, s);
    if (v > 330) {
      material.thump(s * 0.5);
      haptics.play('soft');
    } else if (v > 160) haptics.play('tap');
  }

  private onCut(n: number, tooSmall: number) {
    if (n > 0) {
      material.slice();
      haptics.play('snap');
      this.doneHint('knife');
    } else if (tooSmall > 0) {
      material.squeak(0.4);
      haptics.play('tap');
    }
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.open) {
      this.toggle(null);
      return;
    }
    if (this.tool === 'knife') {
      if (this.stroke) return;
      this.stroke = { id: p.id, ax: p.x, ay: p.y, bx: p.x, by: p.y, aimed: false };
      return;
    }
    // A second finger while holding a piece: twist it.
    if (this.holds.size === 1 && !this.holds.has(p.id)) {
      const [, other] = [...this.pointers].find(([id]) => this.holds.has(id)) ?? [];
      if (other) this.twistAngle = Math.atan2(p.y - other.y, p.x - other.x);
      return;
    }
    const piece = this.lab.grab(p.id, p.x, p.y);
    if (piece) {
      this.holds.set(p.id, { piece, t0: performance.now(), moved: false, step: 0 });
      haptics.play('tick');
      material.squeak(0.15);
    }
  }

  pointerMove(p: Pointer) {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.tool === 'knife') {
      const s = this.stroke;
      if (!s || s.id !== p.id) return;
      s.bx = p.x;
      s.by = p.y;
      if (Math.hypot(s.bx - s.ax, s.by - s.ay) > 14) {
        const wasAimed = s.aimed;
        s.aimed = this.lab.aimKnife(s.ax, s.ay, s.bx, s.by);
        if (s.aimed && !wasAimed) material.pop(0.9);
      }
      return;
    }
    const hold = this.holds.get(p.id);
    if (hold) {
      if (p.travel > 8) {
        hold.moved = true;
        this.doneHint('hand');
      }
      this.lab.drag(p.id, p.x, p.y);
      return;
    }
    // Twisting with the second finger.
    if (this.twistAngle != null && this.holds.size === 1) {
      const [id] = [...this.holds.keys()];
      const o = this.pointers.get(id);
      if (!o) return;
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      let d = a - this.twistAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.twistAngle = a;
      this.lab.twist(id, -d);
      this.lab.drag(id, o.x, o.y);
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    this.pointers.delete(p.id);
    if (this.tool === 'knife') {
      const s = this.stroke;
      if (!s || s.id !== p.id) return;
      this.stroke = null;
      // Use exactly where the finger lifted, even if the last move was missed.
      if (!cancelled && (s.bx !== p.x || s.by !== p.y)) {
        s.bx = p.x;
        s.by = p.y;
        if (Math.hypot(s.bx - s.ax, s.by - s.ay) > 14) s.aimed = this.lab.aimKnife(s.ax, s.ay, s.bx, s.by) || s.aimed;
      }
      if (s.aimed && !cancelled) {
        this.lab.chop();
        material.squeak(0.3);
      } else this.lab.cancelKnife();
      return;
    }
    if (!this.holds.has(p.id)) {
      if (this.holds.size) this.twistAngle = null;
      return;
    }
    const hold = this.holds.get(p.id)!;
    this.holds.delete(p.id);
    this.twistAngle = null;
    const piece = this.lab.release(p.id);
    if (!piece) return;
    if (!hold.moved && performance.now() - hold.t0 < 280) {
      this.lab.poke(piece, p.x, p.y);
      piece.face?.set('happy', 1.1);
      material.boop(piece.inradius * 14, 0.5);
      haptics.play('tap');
    } else if (piece.wobble > 0.35) {
      material.snapBack(clamp(piece.wobble, 0, 1));
      haptics.play('soft');
    }
  }

  // ——— loop ———

  update(dt: number) {
    this.lab.update(dt);
    for (const hold of this.holds.values()) {
      const step = Math.floor(hold.piece.wobble / 0.22);
      if (step > hold.step) {
        material.squeak(clamp(hold.piece.wobble / 1.2, 0, 1));
        haptics.play('tick');
      }
      hold.step = step;
    }
    this.statsT -= dt;
    if (this.statsT <= 0 && this.open === 'settings') {
      this.statsT = 0.25;
      const s = this.lab.stats();
      this.caption.textContent = `${s.pieces} ${s.pieces === 1 ? 'jelly' : 'jellies'} · about ${Math.round(s.mass)} g`;
    }
    this.pauseRow.classList.toggle('is-on', this.lab.paused);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    paintBackdrop(ctx, this.w, this.h, t, { tint: this.tint, floorY: null });
    ctx.drawImage(this.lab.render(), 0, 0, this.w, this.h);
    // A soft dotted guide under the knife while you draw.
    const s = this.stroke;
    if (s && Math.hypot(s.bx - s.ax, s.by - s.ay) > 6) {
      ctx.save();
      ctx.strokeStyle = rgba(t.ink, 0.35);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.setLineDash([0.1, 8]);
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
      ctx.stroke();
      ctx.restore();
    }
    paintGrain(ctx, this.w, this.h, t);
  }
}
