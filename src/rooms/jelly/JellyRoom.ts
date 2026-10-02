import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint, world } from '../../design/tokens';
import { clamp, pick, rand, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { panFor } from '../../core/audio';
import { material, ui as uiSound } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { Particles } from '../../render/particles';
import { Shake } from '../../render/camera';
import { el, iconButton, Hint, Segmented, tactile } from '../../ui/components';
import { icons } from '../../design/icons';
import { FRUITS, type Fruit } from './fruits';
import { SoftBody, type Crossing } from './SoftBody';
import { JellyWorld } from './JellyWorld';
import { drawJelly, drawJellyShadow } from './renderJelly';

type Tool = 'hand' | 'knife';

interface Hold {
  body: SoftBody;
  mode: 'pending' | 'grab' | 'squish';
  t: number;
  step: number;
  maxStretch: number;
}

interface Blade {
  pts: { x: number; y: number; age: number }[];
  /** Per body: where the blade entered (null = currently outside). */
  entry: Map<number, Crossing | 'inside'>;
  live: boolean;
}

const MAX_BODIES = 24;
/** Smallest piece the knife will make (px radius) — still a satisfying crumb. */
const MIN_PIECE_R = 12;

/**
 * Room: translucent fruit jellies. No goal — poke, squish, stretch with one
 * or two fingers, toss them around, or switch to the knife and slice.
 */
export class JellyRoom implements Scene {
  readonly id = 'jelly';
  readonly tint = roomTint.jelly;
  readonly ui: HTMLElement;

  private w = 0;
  private h = 0;
  private floorY = 0;
  private baseR = 70;
  private safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private world: JellyWorld;
  private particles = new Particles();
  private shake = new Shake();
  private time = 0;
  private tool: Tool = 'hand';
  private holds = new Map<number, Hold>();
  private blades = new Map<number, Blade>();
  private trails: Blade[] = [];
  private lookAt: { x: number; y: number } | null = null;
  private nextIdle = 3;
  private started = false;

  private segmented: Segmented<Tool>;
  private sheet: HTMLDivElement;
  private sheetOpen = false;
  private plus: HTMLButtonElement;
  private hint = new Hint('squish, stretch or toss', 'hand');
  private knifeHint = new Hint('swipe through to slice', 'knife');

  constructor(_nav: RoomNav) {
    this.world = new JellyWorld({
      impact: (b, speed, x) => this.onImpact(b, speed, x),
      bump: (a, b, speed) => this.onBump(a, b, speed),
    });

    this.ui = el('div', 'room room-jelly');
    this.segmented = new Segmented<Tool>(
      [
        { value: 'hand', icon: 'hand', label: 'play' },
        { value: 'knife', icon: 'knife', label: 'slice' },
      ],
      'hand',
      (v) => this.setTool(v),
    );
    this.plus = iconButton('plus', 'add a fruit', () => this.toggleSheet());
    const dock = el('div', 'dock', {}, [this.segmented.root, el('div', 'dock-divider'), this.plus]);
    this.sheet = el('div', 'sheet', { role: 'dialog', 'aria-label': 'add a fruit' });
    this.ui.append(this.hint.root, this.knifeHint.root, this.sheet, dock);
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    this.safe = safe;
    const usable = h - safe.bottom;
    this.floorY = Math.round(usable * world.floorRatio);
    // Sized so four or five jellies can sit side by side on a phone.
    this.baseR = clamp(Math.min(w * 0.15, usable * 0.085), 42, 84);
    const wd = this.world;
    wd.left = 2;
    wd.right = w - 2;
    wd.top = safe.top + 2;
    wd.floor = this.floorY;
    this.particles.floorY = this.floorY;
    this.particles.width = w;
    // Keep everything inside if the screen changed size.
    for (const b of wd.bodies) {
      for (let i = 0; i < b.n; i++) {
        b.x[i] = clamp(b.x[i], wd.left, wd.right);
        b.y[i] = Math.min(b.y[i], wd.floor);
      }
    }
  }

  enter() {
    if (!this.started) {
      this.started = true;
      this.spawn(FRUITS[0], this.w / 2, this.floorY - this.baseR * 3.2, 0);
    }
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1500);
  }

  leave() {
    this.hint.hide();
    this.knifeHint.hide();
    this.toggleSheet(false);
    for (const b of this.world.bodies) {
      b.grabs.clear();
      b.squish.target = 0;
    }
    this.holds.clear();
    this.blades.clear();
  }

  // ——— chrome ———

  private setTool(t: Tool) {
    this.tool = t;
    for (const id of [...this.holds.keys()]) this.release(id);
    this.toggleSheet(false);
    haptics.play('tick');
    if (t === 'knife' && !settings.value.seenHints.includes('jelly-knife')) {
      this.hint.hide();
      this.knifeHint.show(250);
    } else {
      this.knifeHint.hide();
    }
  }

  private buildSheet() {
    if (this.sheet.childElementCount) return;
    const grid = el('div', 'sheet-grid');
    FRUITS.forEach((f, i) => {
      const b = el('button', 'fruit-btn', { type: 'button', 'aria-label': f.name, title: f.name });
      b.style.setProperty('--i', String(i));
      b.append(this.fruitIcon(f));
      tactile(b, () => {
        this.spawnFromTop(f);
        this.toggleSheet(false);
      });
      grid.append(b);
    });
    const tidy = el('button', 'btn btn-text', { type: 'button' });
    tidy.innerHTML = `${icons.sparkle}<span>fresh start</span>`;
    tactile(tidy, () => {
      this.tidy();
      this.toggleSheet(false);
    });
    this.sheet.append(grid, tidy);
  }

  /** Fruit icons are rendered by the real jelly renderer — one look. */
  private fruitIcon(f: Fruit) {
    const size = 60;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = `${size}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const r = 20 / Math.max(0.8, f.size);
    const b = SoftBody.fromFruit(f, r, size / 2, size / 2 + 3);
    drawJelly(ctx, theme.current, b, 0);
    return c;
  }

  private toggleSheet(force?: boolean) {
    const open = force ?? !this.sheetOpen;
    if (open === this.sheetOpen) return;
    this.sheetOpen = open;
    if (open) this.buildSheet();
    this.sheet.classList.toggle('is-open', open);
    this.plus.classList.toggle('is-on', open);
    uiSound.sheet(open);
  }

  // ——— spawning ———

  private spawn(f: Fruit, x: number, y: number, vy: number) {
    const b = SoftBody.fromFruit(f, this.baseR, x, y);
    for (let i = 0; i < b.n; i++) {
      b.vy[i] = vy;
      b.vx[i] = rand(-30, 30);
    }
    b.spawnPop.value = 0.3;
    b.face!.set('surprised', 0.6);
    this.world.add(b);
    this.cull();
    material.pop(0.6, panFor(x, this.w));
    return b;
  }

  private spawnFromTop(f: Fruit) {
    // Drop into the emptiest spot so newcomers don't land on someone's head.
    let x = this.w / 2;
    let best = -1;
    for (let k = 0; k < 9; k++) {
      const cx = this.w * (0.2 + (0.6 * k) / 8) + rand(-8, 8);
      let gap = Infinity;
      for (const b of this.world.bodies) gap = Math.min(gap, Math.abs(b.cx - cx) - b.R);
      if (gap > best) {
        best = gap;
        x = cx;
      }
    }
    const y = Math.max(this.safe.top + this.baseR * 1.4 + 40, this.floorY * 0.3);
    this.spawn(f, x, y, 80);
    this.particles.emit({ kind: 'sparkle', x, y, count: 5, speed: [60, 180], size: [4, 7], life: [0.4, 0.7], color: '#ffffff' });
  }

  private tidy() {
    this.world.bodies.forEach((b, i) => {
      b.dying = 0.001;
      material.pop(rand(0.3, 0.9), panFor(b.cx, this.w), i * 0.04);
      this.particles.emit({
        kind: 'puff',
        x: b.cx,
        y: b.cy,
        count: 3,
        speed: [40, 120],
        size: [b.R * 0.3, b.R * 0.5],
        life: [0.35, 0.6],
        color: '#ffffff',
      });
    });
    this.holds.clear();
    window.setTimeout(() => {
      this.spawnFromTop(pick(FRUITS.slice(0, 7)));
      material.sparkle(0);
    }, 380);
  }

  /** Too many jellies? The tiniest, oldest crumbs quietly melt away. */
  private cull() {
    const alive = this.world.bodies.filter((b) => b.dying === 0);
    let extra = alive.length - MAX_BODIES;
    if (extra <= 0) return;
    const victims = alive.filter((b) => b.grabs.size === 0).sort((a, b) => a.R - b.R || b.age - a.age);
    for (const v of victims) {
      if (extra-- <= 0) break;
      v.dying = 0.001;
      this.particles.emit({
        kind: 'puff',
        x: v.cx,
        y: v.cy,
        count: 2,
        speed: [20, 60],
        size: [v.R * 0.4, v.R * 0.6],
        life: [0.3, 0.5],
        color: '#ffffff',
      });
    }
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    this.lookAt = { x: p.x, y: p.y };
    if (this.sheetOpen) this.toggleSheet(false);
    if (this.tool === 'knife') {
      const entry = new Map<number, Crossing | 'inside'>();
      for (const b of this.world.bodies) if (b.contains(p.x, p.y)) entry.set(b.id, 'inside');
      const blade: Blade = { pts: [{ x: p.x, y: p.y, age: 0 }], entry, live: true };
      this.blades.set(p.id, blade);
      this.trails.push(blade);
      return;
    }
    const b = this.world.pick(p.x, p.y);
    if (!b) return;
    this.world.bringToFront(b);
    this.holds.set(p.id, { body: b, mode: 'pending', t: 0, step: 0, maxStretch: 1 });
    b.face?.look((p.x - b.cx) / b.R, (p.y - b.cy) / b.R);
  }

  pointerMove(p: Pointer) {
    this.lookAt = { x: p.x, y: p.y };
    if (this.tool === 'knife') {
      const blade = this.blades.get(p.id);
      if (!blade) return;
      blade.pts.push({ x: p.x, y: p.y, age: 0 });
      if (blade.pts.length > 40) blade.pts.shift();
      this.slice(blade, p.prevX, p.prevY, p.x, p.y);
      return;
    }
    const hold = this.holds.get(p.id);
    if (!hold) return;
    const b = hold.body;
    if (hold.mode !== 'grab' && p.travel > 9) {
      // Became a drag: grab right where the finger is.
      if (hold.mode === 'squish') b.squish.target = 0;
      hold.mode = 'grab';
      b.grab(p.id, p.x, p.y);
      haptics.play('tick');
      if (!settings.value.seenHints.includes(this.id)) {
        settings.markHintSeen(this.id);
        this.hint.hide();
      }
    }
    if (hold.mode === 'grab') {
      const g = b.grabs.get(p.id);
      if (g) {
        g.fx = p.x;
        g.fy = p.y;
      }
    }
  }

  pointerUp(p: Pointer) {
    const blade = this.blades.get(p.id);
    if (blade) {
      blade.live = false;
      this.blades.delete(p.id);
    }
    this.release(p.id, p.vx, p.vy);
  }

  private release(id: number, fvx = 0, fvy = 0) {
    const hold = this.holds.get(id);
    if (!hold) return;
    this.holds.delete(id);
    const b = hold.body;
    const pan = panFor(b.cx, this.w);
    if (hold.mode === 'pending') {
      // A quick tap: a little boing.
      b.squish.velocity += 7;
      b.face?.set('happy', 1.1);
      material.boop(b.R, 0.5, pan);
      haptics.play('tap');
      this.particles.emit({
        kind: 'bubble',
        x: b.cx,
        y: b.minY + 6,
        count: 2,
        speed: [20, 50],
        size: [2.5, 4.5],
        life: [0.6, 1],
        color: b.fruit.light,
        angle: -Math.PI / 2,
        spread: 1.2,
      });
    } else if (hold.mode === 'squish') {
      b.squish.target = 0;
      b.face?.set('happy', 1);
      material.boop(b.R, 0.7, pan);
      haptics.play('soft');
    } else {
      // A flick: hand the finger's momentum to the jelly (more where you held it).
      const g = b.grabs.get(id);
      const sp = Math.hypot(fvx, fvy);
      if (g && sp > 200) {
        const k = (Math.min(sp, 2600) / sp) * 0.32;
        for (let i = 0; i < b.n; i++) {
          const w = 0.55 + 0.45 * g.w[i];
          b.vx[i] += fvx * k * w;
          b.vy[i] += fvy * k * w;
        }
      }
      b.grabs.delete(id);
      if (hold.maxStretch > 1.45) {
        material.snapBack(clamp((hold.maxStretch - 1.4) / 1.2, 0, 1), pan);
        haptics.play('snap');
      }
      const speed = Math.hypot(b.vcx, b.vcy);
      if (speed > 1100) b.face?.set('surprised', 0.6);
      else b.face?.set('happy', 0.9);
    }
  }

  // ——— knife ———

  private slice(blade: Blade, ax: number, ay: number, bx: number, by: number) {
    for (const body of [...this.world.bodies]) {
      if (body.dying > 0) continue;
      const cs = body.crossings(ax, ay, bx, by);
      if (!cs.length) continue;
      let state = blade.entry.get(body.id) ?? null;
      for (const c of cs) {
        if (state === null) state = c;
        else if (state === 'inside')
          state = null; // started inside: this is just an exit
        else {
          const ok = this.cut(body, state, c, ax + (bx - ax) * c.s, ay + (by - ay) * c.s);
          state = null;
          if (ok) break;
        }
      }
      if (state === null) blade.entry.delete(body.id);
      else blade.entry.set(body.id, state);
    }
  }

  private cut(body: SoftBody, e1: Crossing, e2: Crossing, ex: number, ey: number) {
    const pieces = body.split(e1, e2, MIN_PIECE_R);
    const pan = panFor(ex, this.w);
    if (!pieces) {
      // Too small to split: a gentle nick wobble instead.
      body.squish.velocity += 4;
      material.squeak(0.2, pan);
      return false;
    }
    const idx = this.world.bodies.indexOf(body);
    this.world.bodies.splice(idx, 1, ...pieces);
    for (const [id, h] of this.holds) if (h.body === body) this.holds.delete(id);
    material.slice(pan);
    haptics.play('snap');
    // Juicy (but clean) droplets along the cut, in the fruit's light colour.
    const f = body.fruit;
    this.particles.emit({
      kind: 'drop',
      x: ex,
      y: ey,
      count: 9,
      speed: [80, 260],
      size: [2, 4.5],
      life: [0.7, 1.2],
      color: f.body,
      vy: -120,
    });
    this.particles.emit({ kind: 'sparkle', x: ex, y: ey, count: 3, speed: [40, 140], size: [4, 7], life: [0.3, 0.6], color: '#ffffff' });
    if (!settings.value.seenHints.includes('jelly-knife')) {
      settings.markHintSeen('jelly-knife');
      this.knifeHint.hide();
    }
    this.cull();
    return true;
  }

  // ——— world events ———

  private onImpact(b: SoftBody, speed: number, x: number) {
    if (speed < 240 || b.dying > 0) return;
    const s = clamp(speed / 1600, 0, 1);
    const pan = panFor(x, this.w);
    material.boop(b.R, s, pan);
    if (speed > 1250) {
      b.face?.set('dizzy', 1.8);
      haptics.play('soft');
      this.shake.kick(1.2);
      this.particles.emit({
        kind: 'puff',
        x,
        y: Math.min(this.floorY, b.maxY),
        count: 4,
        speed: [50, 140],
        size: [b.R * 0.18, b.R * 0.3],
        life: [0.3, 0.6],
        color: '#ffffff',
      });
    } else {
      if (speed > 600) haptics.play('tap');
      if (b.face && b.face.expression === 'surprised') b.face.set('happy', 0.9);
    }
  }

  private onBump(a: SoftBody, b: SoftBody, speed: number) {
    const s = clamp(speed / 1200, 0, 1);
    material.plop((a.R + b.R) / 2, s, panFor((a.cx + b.cx) / 2, this.w));
    if (speed > 420) haptics.play('tick');
    if (speed > 750) {
      a.face?.set('surprised', 0.45);
      b.face?.set('surprised', 0.45);
    }
  }

  // ——— simulation ———

  update(dt: number) {
    this.time += dt;
    this.shake.update(dt);

    for (const [id, hold] of this.holds) {
      hold.t += dt;
      const b = hold.body;
      if (!this.world.bodies.includes(b)) {
        this.holds.delete(id);
        continue;
      }
      if (hold.mode === 'pending' && hold.t > 0.11) {
        // A held press: squish!
        hold.mode = 'squish';
        const p = this.lookAt ?? { x: b.cx, y: b.minY };
        const dx = b.cx - p.x;
        const dy = b.cy - p.y;
        const d = Math.hypot(dx, dy);
        // Pressing near the middle squashes from above; near an edge, from that side.
        if (d < b.R * 0.35) {
          b.squishNx = 0;
          b.squishNy = 1;
        } else {
          b.squishNx = dx / d;
          b.squishNy = dy / d;
        }
        b.squish.target = 0.3;
        material.squish(0.7, panFor(b.cx, this.w));
        haptics.play('soft');
        if (!settings.value.seenHints.includes(this.id)) {
          settings.markHintSeen(this.id);
          this.hint.hide();
        }
      }
      if (hold.mode === 'squish') b.face?.set('squeeze', 0.3);
      if (hold.mode === 'grab') {
        hold.maxStretch = Math.max(hold.maxStretch, b.stretch);
        const step = Math.floor((b.stretch - 1.15) / 0.16);
        if (step > hold.step && step > 0) {
          material.squeak(clamp((b.stretch - 1.15) / 1.4, 0, 1), panFor(b.cx, this.w));
          haptics.play('tick');
        }
        hold.step = Math.max(0, step);
        if (b.stretch > 1.32) b.face?.set('wide', 0.35);
        else if (b.face?.expression === 'calm') b.face.set('happy', 0.4);
      }
    }

    this.world.step(dt);
    this.particles.update(dt);

    // Faces look toward your finger, or where they're flying.
    for (const b of this.world.bodies) {
      if (!b.face) continue;
      if (this.lookAt && (this.holds.size || this.blades.size)) {
        b.face.look((this.lookAt.x - b.cx) / (b.R * 3), (this.lookAt.y - b.cy) / (b.R * 3));
      } else {
        b.face.look(b.vcx / 900, b.vcy / 900);
      }
    }

    // Idle life: now and then someone has a little jiggle.
    this.nextIdle -= dt;
    if (this.nextIdle <= 0) {
      this.nextIdle = rand(2.5, 6);
      const idle = this.world.bodies.filter((b) => b.grabs.size === 0 && b.touchingFloor);
      if (idle.length) {
        const b = pick(idle);
        b.squish.velocity += rand(1.5, 3);
        if (Math.random() < 0.4) b.face?.set('happy', 1.2);
      }
    }

    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      for (const p of tr.pts) p.age += dt;
      tr.pts = tr.pts.filter((p) => p.age < 0.22);
      if (!tr.live && !tr.pts.length) this.trails.splice(i, 1);
    }
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    paintBackdrop(ctx, this.w, this.h, t, { tint: this.tint, floorY: this.floorY });
    ctx.save();
    this.shake.apply(ctx, this.w / 2, this.h / 2);
    for (const b of this.world.bodies) drawJellyShadow(ctx, t, b, this.floorY);
    for (const b of this.world.bodies) drawJelly(ctx, t, b, this.time);
    this.particles.draw(ctx);
    this.drawTrails(ctx);
    ctx.restore();
    paintGrain(ctx, this.w, this.h, t);
  }

  /** The knife's trail: a soft tapered ribbon of light. */
  private drawTrails(ctx: CanvasRenderingContext2D) {
    for (const tr of this.trails) {
      const pts = tr.pts;
      if (pts.length < 2) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const k = 1 - b.age / 0.22;
        const taper = i / pts.length;
        ctx.strokeStyle = rgba('#ffffff', 0.85 * k);
        ctx.lineWidth = 1 + 7 * taper * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const tip = pts[pts.length - 1];
      if (tr.live) {
        ctx.fillStyle = rgba('#ffffff', 0.9);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
