import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { clamp } from '../../core/math';
import { rgba } from '../../core/color';
import { material, ui as uiSound } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { el, iconButton, Segmented, tactile } from '../../ui/components';
import { getLab, type Lab } from './Lab';
import { VARIETIES } from './varieties';
import type { Piece } from './Piece';

type Tool = 'hand' | 'knife';

interface Hold {
  piece: Piece;
  t0: number;
  moved: boolean;
  step: number;
}

const INSTRUCTIONS: Record<Tool, string> = {
  knife: 'Draw a line across the slice — the knife lines up over it and cuts when you let go. Cut the pieces again, as small as you like.',
  hand: 'Grab any piece — tip, corner, flesh or rind — and pull. Add a second finger while holding to twist it. Flick to toss.',
};

/**
 * Room: Melon Jelly — a specimen table with a soft watermelon-jelly wedge,
 * a cleaver, and the little control panel from the reference, laid out for a
 * phone. The pieces keep soft-spot's faces.
 */
export class JellyRoom implements Scene {
  readonly id = 'jelly';
  readonly tint = roomTint.jelly;
  readonly ui: HTMLElement;

  private lab: Lab;
  private w = 0;
  private h = 0;
  private tool: Tool = 'knife';
  private holds = new Map<number, Hold>();
  private pointers = new Map<number, { x: number; y: number }>();
  private twistAngle: number | null = null;
  private stroke: { id: number; ax: number; ay: number; bx: number; by: number; aimed: boolean } | null = null;
  private statsT = 0;

  private segmented: Segmented<Tool>;
  private sheet: HTMLDivElement;
  private sheetOpen = false;
  private specBtn: HTMLButtonElement;
  private instr: HTMLParagraphElement;
  private instrLabel: HTMLSpanElement;
  private statEls: Record<'mass' | 'volume' | 'kinetic' | 'pieces', HTMLElement>;
  private head: HTMLElement;
  private foot: HTMLElement;
  private swatches = new Map<string, HTMLButtonElement>();
  private toggles: Record<'slow' | 'mesh' | 'pause', HTMLButtonElement>;

  constructor(_nav: RoomNav) {
    this.lab = getLab();
    this.lab.events = {
      impact: (p, v) => this.onImpact(p, v),
      bump: (_a, _b, v) => {
        material.plop(30, clamp(v / 400, 0, 1));
        if (v > 160) haptics.play('tick');
      },
      cut: (n) => this.onCut(n),
      land: () => {
        material.thump(0.35);
        haptics.play('snap');
      },
    };

    this.ui = el('div', 'room room-lab');

    // ——— header (title block from the reference) ———
    this.head = el('header', 'lab-head', {}, [
      el('p', 'lab-eyebrow', {}, ['Material studies · No. 006']),
      el('h1', 'lab-title', {}, ['Melon Jelly.']),
      el('p', 'lab-tagline', {}, ['A slice of summer. A little wobble. Too soft to share.']),
    ]);

    // ——— footer: instructions + live readout ———
    this.instrLabel = el('span', 'lab-instr-label');
    this.instr = el('p', 'lab-instr');
    const stat = (label: string, unit: string) => {
      const v = el('span', 'lab-stat-value');
      const box = el('div', 'lab-stat', {}, [
        el('span', 'lab-stat-label', {}, [label]),
        el('span', 'lab-stat-line', {}, [v, el('span', 'lab-stat-unit', {}, [unit])]),
      ]);
      return { box, v };
    };
    const mass = stat('Mass', 'g');
    const vol = stat('Volume', '% of rest');
    const kin = stat('Kinetic', 'µJ');
    const pcs = stat('Pieces', '');
    this.statEls = { mass: mass.v, volume: vol.v, kinetic: kin.v, pieces: pcs.v };
    this.foot = el('footer', 'lab-foot', {}, [this.instr, el('div', 'lab-stats', {}, [mass.box, vol.box, kin.box, pcs.box])]);

    // ——— dock: tool + specimen panel ———
    this.segmented = new Segmented<Tool>(
      [
        { value: 'hand', icon: 'hand', label: 'hand' },
        { value: 'knife', icon: 'knife', label: 'knife' },
      ],
      this.tool,
      (v) => this.setTool(v),
    );
    this.specBtn = iconButton('sliders', 'the specimen', () => this.toggleSheet());
    const dock = el('div', 'dock', {}, [this.segmented.root, el('div', 'dock-divider'), this.specBtn]);

    // ——— the specimen sheet ———
    this.sheet = el('div', 'sheet lab-sheet', { role: 'dialog', 'aria-label': 'the specimen' });
    const varietyRow = el('div', 'lab-varieties');
    for (const v of VARIETIES) {
      const b = el('button', 'lab-variety', { type: 'button', 'aria-label': v.name });
      b.innerHTML = `<span class="lab-swatch" style="--flesh:${v.flesh};--rind:${v.rind};--skin:${v.skin}"></span><span class="lab-variety-name">${v.name}</span>`;
      tactile(b, () => this.setVariety(v.id));
      this.swatches.set(v.id, b);
      varietyRow.append(b);
    }
    const slider = (id: string, label: string, lo: string, hi: string, value: number, onInput: (v: number) => void) => {
      // A slider, exactly like the reference panel's.
      const out = el('span', 'lab-slider-value', {}, [value.toFixed(2)]);
      const input = el('input', 'lab-range', {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        value: String(value),
        id,
        'aria-label': label,
      }) as HTMLInputElement;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        out.textContent = v.toFixed(2);
        onInput(v);
        haptics.play('tick');
      });
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      const wrap = el('div', 'lab-slider', {}, [
        el('div', 'lab-slider-head', {}, [el('span', 'lab-label', {}, [label]), out]),
        input,
        el('div', 'lab-slider-ends', {}, [el('span', '', {}, [lo]), el('span', '', {}, [hi])]),
      ]);
      return { wrap };
    };
    const firm = slider('lab-firmness', 'Firmness', 'trembling', 'set', this.lab.firmness, (v) => (this.lab.firmness = v));
    const damp = slider('lab-damping', 'Internal damping', 'lively', 'syrupy', this.lab.dampingAmt, (v) => (this.lab.dampingAmt = v));
    const textBtn = (label: string, fn: () => void, cls = '') => {
      const b = el('button', `lab-btn ${cls}`, { type: 'button' }, [label]);
      tactile(b, fn);
      return b;
    };
    const check = (label: string, fn: (on: boolean) => void) => {
      const b = el('button', 'lab-check', { type: 'button', role: 'switch', 'aria-checked': 'false' }, [
        el('span', 'lab-check-box'),
        label,
      ]);
      tactile(b, () => {
        const on = !b.classList.contains('is-on');
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
        fn(on);
      });
      return b;
    };
    this.toggles = {
      slow: check('¼ speed', (on) => (this.lab.timeScale = on ? 0.25 : 1)),
      mesh: check('Show mesh', (on) => this.lab.setShowMesh(on)),
      pause: textBtn('Pause', () => this.togglePause(), 'lab-btn-wide'),
    };
    this.sheet.append(
      el('div', 'lab-sheet-head', {}, [el('span', 'lab-label', {}, ['The specimen']), el('span', 'lab-fig', {}, ['fig. 6'])]),
      el('span', 'lab-label', {}, ['Variety']),
      varietyRow,
      firm.wrap,
      damp.wrap,
      el('div', 'lab-row', {}, [textBtn('Give it a nudge', () => this.nudge()), textBtn('Reset', () => this.reset())]),
      el('div', 'lab-row', {}, [this.toggles.slow, this.toggles.mesh]),
      this.toggles.pause,
    );

    this.ui.append(this.head, this.foot, this.sheet, dock);
    this.syncVariety();
    this.setTool(this.tool, true);

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

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    // The free band between the header and the footer + dock.
    const top = safe.top + 150;
    const bottom = h - safe.bottom - 18 - 64 - 112;
    this.lab.resize(w, h, window.devicePixelRatio || 1, top, Math.max(top + 200, bottom));
    requestAnimationFrame(() => this.relayoutFromDom());
  }

  enter() {
    requestAnimationFrame(() => this.relayoutFromDom());
  }

  /** Use the real header/footer sizes for the camera's free band. */
  private relayoutFromDom() {
    const top = this.head.getBoundingClientRect().bottom + 8;
    const bottom = this.foot.getBoundingClientRect().top - 8;
    if (bottom - top > 160) this.lab.resize(this.w, this.h, window.devicePixelRatio || 1, top, bottom);
  }

  leave() {
    this.toggleSheet(false);
    for (const id of [...this.holds.keys()]) this.lab.release(id);
    this.holds.clear();
    this.pointers.clear();
    this.lab.cancelKnife();
    this.stroke = null;
  }

  // ——— chrome ———

  private setTool(t: Tool, silent = false) {
    this.tool = t;
    this.instrLabel.textContent = t === 'knife' ? 'Knife' : 'Hand';
    this.instr.replaceChildren(this.instrLabel, ' ', INSTRUCTIONS[t]);
    if (!silent) {
      haptics.play('tick');
      this.toggleSheet(false);
    }
    this.lab.cancelKnife();
    this.stroke = null;
  }

  private toggleSheet(force?: boolean) {
    const open = force ?? !this.sheetOpen;
    if (open === this.sheetOpen) return;
    this.sheetOpen = open;
    this.sheet.classList.toggle('is-open', open);
    this.specBtn.classList.toggle('is-on', open);
    uiSound.sheet(open);
  }

  private setVariety(id: string) {
    const v = VARIETIES.find((x) => x.id === id);
    if (!v) return;
    this.lab.setVariety(v);
    this.syncVariety();
    material.sparkle(0);
    for (const e of this.lab.entries) e.piece.face?.set('happy', 1);
  }

  private syncVariety() {
    for (const [id, b] of this.swatches) b.classList.toggle('is-on', id === this.lab.variety.id);
  }

  private togglePause() {
    this.lab.paused = !this.lab.paused;
    this.toggles.pause.textContent = this.lab.paused ? 'Resume' : 'Pause';
    this.toggles.pause.classList.toggle('is-on', this.lab.paused);
  }

  private nudge() {
    this.lab.nudge();
    material.boop(40, 0.7);
    material.boop(30, 0.5);
    haptics.play('soft');
  }

  private reset() {
    this.lab.reset();
    material.pop(0.6);
    material.sparkle(0);
    haptics.play('tap');
  }

  // ——— events from the lab ———

  private onImpact(p: Piece, v: number) {
    const s = clamp(v / 420, 0, 1);
    material.boop(p.inradius * 14, s);
    if (v > 330) {
      material.thump(s * 0.5);
      haptics.play('soft');
    } else if (v > 160) haptics.play('tap');
  }

  private onCut(n: number) {
    if (n > 0) {
      material.slice();
      haptics.play('snap');
    }
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.sheetOpen) {
      this.toggleSheet(false);
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
      if (p.travel > 8) hold.moved = true;
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
    // Hand over the flick's momentum.
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
    // Squeaks while stretching a held piece.
    for (const hold of this.holds.values()) {
      const step = Math.floor(hold.piece.wobble / 0.22);
      if (step > hold.step) {
        material.squeak(clamp(hold.piece.wobble / 1.2, 0, 1));
        haptics.play('tick');
      }
      hold.step = step;
    }
    this.statsT -= dt;
    if (this.statsT <= 0) {
      this.statsT = 0.12;
      const s = this.lab.stats();
      this.statEls.mass.textContent = `≈${Math.round(s.mass)}`;
      this.statEls.volume.textContent = s.volume.toFixed(1);
      this.statEls.kinetic.textContent = s.kinetic < 10 ? s.kinetic.toFixed(2) : String(Math.round(s.kinetic));
      this.statEls.pieces.textContent = String(s.pieces);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    paintBackdrop(ctx, this.w, this.h, t, { tint: this.tint, floorY: null });
    ctx.drawImage(this.lab.render(), 0, 0, this.w, this.h);
    // The guide line under the knife while you draw.
    const s = this.stroke;
    if (s && Math.hypot(s.bx - s.ax, s.by - s.ay) > 6) {
      ctx.save();
      ctx.strokeStyle = rgba(t.ink, 0.45);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(t.ink, 0.55);
      for (const [x, y] of [
        [s.ax, s.ay],
        [s.bx, s.by],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    paintGrain(ctx, this.w, this.h, t);
  }
}
