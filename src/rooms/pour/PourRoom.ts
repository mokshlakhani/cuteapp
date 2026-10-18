import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint, springs, world } from '../../design/tokens';
import { ease, Spring } from '../../design/motion';
import { clamp, lerp, rand, smoothstep, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { panFor } from '../../core/audio';
import { material, ui as uiSound } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { Particles } from '../../render/particles';
import { Shake } from '../../render/camera';
import { Face } from '../../render/face';
import { el, iconButton, Hint, Segmented } from '../../ui/components';
import { Glass, type Verdict } from './Glass';
import { DRINKS, drink, type Drink } from './drinks';
import {
  drawGlass,
  drawJug,
  drawStream,
  glassShape,
  halfAt,
  jugShape,
  onGlass,
  spout,
  yAt,
  type Drop,
  type GlassShape,
  type JugShape,
} from './draw';

type Slide = 'here' | 'away' | 'arrive';

/** Glass heights per second at full tilt. */
const MAX_FLOW = 0.26;
/** Seconds for a glass to slide off, and for the next one to slide in. */
const AWAY = 0.45;
const ARRIVE = 0.55;
/** A perfect pour is admired this long before it's served. */
const ADMIRE = 1.5;

const PREFS = 'softspot.pour.v1';

interface Bubble {
  u: number;
  f: number;
  r: number;
  sp: number;
}

/**
 * Room: pour. A jug, a glass with a face, and a line on the glass. Drag the
 * jug down to tip it; the further it tips, the faster it pours. Stop right on
 * the line and the glass glows and is served. Soda foams up faster than it
 * fills, so it wants to be poured in little bursts. Nothing to lose: overfill
 * it and there's just a puddle and an embarrassed glass.
 */
export class PourRoom implements Scene {
  readonly id = 'pour';
  readonly tint = roomTint.pour;
  readonly ui: HTMLElement;

  private w = 0;
  private h = 0;
  private floorY = 0;
  private g: GlassShape = glassShape(0, 0, 100);
  private j: JugShape = jugShape(100);
  private jy = 0;
  private restX = 0;
  private jx = new Spring(0, springs.soft);
  private tilt = new Spring(0, { stiffness: 300, damping: 26 });
  private grab: { id: number; x0: number; px: number; py: number } | null = null;
  private tapOn: number | null = null;

  private drink: Drink;
  /** The drink in the glass (it changes with the jug only for a fresh glass). */
  private inGlass: Drink;
  private glass: Glass;
  private face = new Face();
  private drops: Drop[] = [];
  private bubbles: Bubble[] = [];
  private particles = new Particles();
  private shake = new Shake();
  private puddle = { x: 0, amount: 0, color: '#ffffff' };
  private spillAcc = 0;

  private slide: Slide = 'here';
  private slideT = 0;
  private glow = 0;
  private nudge = 0;
  private admireT = -1;
  private glugT = 0;
  private landing = 0;
  private time = 0;

  private segmented: Segmented<Drink['id']>;
  private hint = new Hint('drag the jug down to pour', 'hand');

  constructor(_nav: RoomNav) {
    this.drink = drink(loadPrefs());
    this.inGlass = this.drink;
    this.glass = this.newGlass();
    this.ui = el('div', 'room room-pour');
    this.segmented = new Segmented<Drink['id']>(
      DRINKS.map((d) => ({ value: d.id, icon: d.id, label: d.name })),
      this.drink.id,
      (v) => this.setDrink(v),
    );
    const fresh = iconButton('glass', 'a fresh glass', () => this.serve());
    const dock = el('div', 'dock', {}, [this.segmented.root, el('div', 'dock-divider'), fresh]);
    this.ui.append(this.hint.root, dock);
  }

  private newGlass() {
    const g = new Glass(this.inGlass.foamy);
    g.events = {
      spill: (amount, foam) => this.onSpill(amount, foam),
      verdict: (v) => this.onVerdict(v),
    };
    return g;
  }

  private setDrink(id: Drink['id']) {
    this.drink = drink(id);
    haptics.play('tick');
    try {
      localStorage.setItem(PREFS, JSON.stringify({ drink: id }));
    } catch {
      /* private mode */
    }
    // A glass already started goes; an empty one just takes the new drink.
    if (this.glass.level > 0.02) this.serve();
    else if (this.slide === 'here') {
      this.inGlass = this.drink;
      this.glass.foamy = this.drink.foamy;
    }
  }

  // ——— layout ———

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    const dockTop = h - safe.bottom - 18 - 64;
    this.floorY = dockTop - 64;
    const gW = clamp(w * 0.36, 104, 150);
    this.g = glassShape(w * 0.4, this.floorY, gW);
    this.j = jugShape(gW);
    // High enough that even fully tipped, the spout clears the rim.
    this.jy = Math.max(safe.top + 76 + this.j.H * 0.55, yAt(this.g, 1) - gW * 0.9 - 34);
    // At rest, placed so a steady pour lands in the glass.
    this.restX = this.g.cx + gW * 0.12 - spout(this.j, 0, 0, 0.75).x;
    this.jx.snap(this.restX);
    this.particles.width = w;
    this.particles.floorY = this.floorY;
    this.puddle.x = this.g.cx;
  }

  enter() {
    if (!settings.value.seenHints.includes('pour')) this.hint.show(1100);
  }

  leave() {
    this.hint.hide();
    this.letGo();
  }

  private letGo() {
    this.grab = null;
    this.tapOn = null;
    this.tilt.target = 0;
    this.jx.target = this.restX;
  }

  /** The glass as it stands right now, slid along if it's coming or going. */
  private get shape(): GlassShape {
    let off = 0;
    if (this.slide === 'away') off = ease.inCubic(clamp(this.slideT / AWAY, 0, 1)) * (this.w - this.g.cx + this.g.wt * 3);
    else if (this.slide === 'arrive') off = -(1 - ease.outCubic(clamp(this.slideT / ARRIVE, 0, 1))) * (this.g.cx + this.g.wt * 3);
    return off ? { ...this.g, cx: this.g.cx + off } : this.g;
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    if (this.slide === 'here' && onGlass(this.g, p.x, p.y)) {
      this.tapOn = p.id;
      this.face.set('happy', 0.5);
      this.glass.slosh(0.4);
      return;
    }
    if (this.grab) return;
    this.grab = { id: p.id, x0: this.jx.target, px: p.x, py: p.y };
    haptics.play('tick');
  }

  pointerMove(p: Pointer) {
    const gr = this.grab;
    if (!gr || gr.id !== p.id) return;
    this.jx.target = clamp(gr.x0 + (p.x - gr.px), this.j.W * 1.15, this.w - this.j.W * 0.3);
    this.tilt.target = clamp((p.y - gr.py) / (this.h * 0.2), 0, 1);
    if (this.tilt.target > 0.45) {
      settings.markHintSeen('pour');
      this.hint.hide();
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    if (this.tapOn === p.id) {
      this.tapOn = null;
      if (!cancelled && p.travel < 12 && this.glass.level > 0.03) this.serve();
      return;
    }
    if (this.grab?.id === p.id) this.letGo();
  }

  // ——— the glass talking back ———

  private onSpill(amount: number, foam: boolean) {
    const g = this.shape;
    const d = this.inGlass;
    this.spillAcc += amount;
    // Froth is mostly air: it leaves much less of a puddle than the drink.
    this.puddle.amount += foam ? amount * 0.2 : amount;
    this.puddle.color = d.color;
    this.puddle.x = lerp(this.puddle.x, g.cx, 0.2);
    while (this.spillAcc > 0.004) {
      this.spillAcc -= 0.004;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.emit({
        kind: 'drop',
        x: g.cx + side * (g.wt + g.wall) * rand(0.7, 1),
        y: yAt(g, 1) - 1,
        vx: side * rand(15, 60),
        vy: rand(-30, 30),
        speed: [0, 10],
        size: [2.2, 4],
        life: [1, 1.6],
        color: foam ? d.foam : d.color,
      });
    }
    this.face.set('wide', 0.7);
    if (Math.random() < 0.25) material.splat(0.4, panFor(g.cx, this.w));
  }

  private onVerdict(v: Verdict) {
    const g = this.shape;
    const pan = panFor(g.cx, this.w);
    switch (v) {
      case 'perfect': {
        material.pourPerfect(pan);
        haptics.play('soft');
        this.face.set('happy', ADMIRE + 1);
        this.admireT = 0;
        const y = yAt(g, this.glass.line);
        for (const s of [-1, 1]) {
          this.particles.emit({
            kind: 'sparkle',
            x: g.cx + s * halfAt(g, this.glass.line),
            y,
            count: 3,
            speed: [40, 110],
            size: [3.5, 6],
            life: [0.5, 0.9],
            color: '#ffffff',
          });
        }
        break;
      }
      case 'under':
        // A hopeful look up at the jug: more, please.
        this.face.set('wide', 0.8);
        break;
      case 'over':
        this.face.set('nervous', 1.6);
        this.nudge = 1;
        break;
      case 'spilled':
        this.face.set('dizzy', 1.6);
        this.nudge = 1;
        break;
    }
  }

  /** The glass slides off to be enjoyed; a fresh one slides in. */
  private serve() {
    if (this.slide !== 'here') return;
    this.slide = 'away';
    this.slideT = 0;
    this.admireT = -1;
    this.glass.slosh(-1.2);
    this.face.set('happy', 1);
    uiSound.whoosh(true);
    haptics.play('tap');
  }

  // ——— simulation ———

  update(dt: number) {
    this.time += dt;
    this.particles.update(dt);
    this.shake.update(dt);
    this.jx.update(dt);
    this.tilt.update(dt);
    this.face.update(dt);
    this.puddle.amount *= Math.exp(-0.12 * dt);

    this.updateSlide(dt);
    this.pour(dt);
    this.glass.step(dt);
    this.updateBubbles(dt);
    this.react(dt);
  }

  private updateSlide(dt: number) {
    if (this.slide === 'here') return;
    this.slideT += dt;
    if (this.slide === 'away' && this.slideT >= AWAY) {
      this.inGlass = this.drink;
      this.glass = this.newGlass();
      this.bubbles.length = 0;
      this.glow = 0;
      this.nudge = 0;
      this.face.set('calm', 0.1);
      this.slide = 'arrive';
      this.slideT = 0;
    } else if (this.slide === 'arrive' && this.slideT >= ARRIVE) {
      this.slide = 'here';
      material.clink(panFor(this.g.cx, this.w));
      haptics.play('tick');
      this.face.set('happy', 0.8);
    }
  }

  /** Tip the jug and the drink leaves it; follow every drop to where it lands. */
  private pour(dt: number) {
    const tilt = clamp(this.tilt.value, 0, 1);
    const flow = smoothstep(0.32, 1, tilt);
    if (flow > 0.01) {
      const lip = spout(this.j, this.jx.value, this.jy, tilt);
      const n = Math.max(1, Math.ceil(dt * 150));
      const speed = lerp(50, 150, flow);
      for (let i = 0; i < n; i++) {
        const k = i / n;
        this.drops.push({
          x: lip.x,
          y: lip.y,
          vx: lip.dx * speed,
          vy: lip.dy * speed,
          vol: (MAX_FLOW * flow * dt) / n,
          w: lerp(3, 10, flow),
          alive: true,
        });
        // Spread the frame's drops along their first instant of flight.
        const d = this.drops[this.drops.length - 1];
        d.x += d.vx * dt * k;
        d.y += d.vy * dt * k;
      }
    }

    const g = this.shape;
    const here = this.slide === 'here';
    let landed = 0;
    const gravity = world.gravity;
    for (const d of this.drops) {
      if (!d.alive) continue;
      const py = d.y;
      d.vy += gravity * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const speed = Math.hypot(d.vx, d.vy);
      // Into the glass?
      const top = this.glass.top;
      const rimY = yAt(g, 1);
      const half = halfAt(g, top);
      const surfY = yAt(g, top);
      const dx = d.x - g.cx;
      if (Math.abs(dx) < half && d.y >= surfY && py <= surfY + 30 && (here || this.slide === 'arrive')) {
        const u = (dx + half) / (half * 2);
        this.glass.add(d.vol, u, speed);
        d.alive = false;
        landed += d.vol;
        continue;
      }
      // Off the rim: a little splash outward.
      const rimHalf = g.wt + g.wall;
      if (py < rimY && d.y >= rimY && Math.abs(dx) >= g.wt && Math.abs(dx) < rimHalf + 3) {
        d.alive = false;
        this.spillSplash(d, Math.sign(dx) || 1);
        continue;
      }
      // On the table.
      if (d.y >= this.floorY) {
        d.alive = false;
        this.puddle.amount += d.vol;
        this.puddle.color = this.drink.color;
        this.puddle.x = lerp(this.puddle.x, d.x, 0.05);
        material.splat(clamp(d.vol * 80, 0.2, 1), panFor(d.x, this.w));
        if (Math.random() < 0.3) this.spillSplash(d, Math.random() < 0.5 ? -1 : 1);
      }
    }
    while (this.drops.length && !this.drops[0].alive) this.drops.shift();
    if (this.drops.length > 600) this.drops.splice(0, this.drops.length - 600);

    // Glugs as it lands, quicker the harder it pours, higher as it fills.
    this.landing = lerp(this.landing, landed > 0 ? 1 : 0, Math.min(1, dt * 12));
    this.glugT -= dt;
    if (landed > 0 && this.glugT <= 0) {
      this.glugT = lerp(0.2, 0.085, flow) * rand(0.8, 1.2);
      material.glug(this.glass.top, flow, panFor(g.cx, this.w));
      haptics.play('tick');
    }
  }

  private spillSplash(d: Drop, side: number) {
    this.particles.emit({
      kind: 'drop',
      x: d.x,
      y: d.y,
      count: 2,
      angle: side > 0 ? -0.6 : -Math.PI + 0.6,
      spread: 0.9,
      speed: [60, 140],
      size: [1.8, 3.2],
      life: [0.8, 1.2],
      color: this.drink.color,
    });
  }

  /** Soda: bubbles stream up through it, and you can hear it fizz. */
  private updateBubbles(dt: number) {
    const glass = this.glass;
    const d = this.inGlass;
    if (d.fizz && glass.level > 0.03) {
      const rate = 3 + glass.foam * 50 + this.landing * 25;
      if (Math.random() < rate * dt) {
        this.bubbles.push({ u: rand(0.12, 0.88), f: rand(0, 0.15), r: rand(0.9, 2.2), sp: rand(0.18, 0.4) });
      }
      if (glass.foam > 0.02 || Math.random() < dt * 4) material.fizz(clamp(glass.foam * 5 + 0.15, 0, 1), panFor(this.g.cx, this.w));
    }
    for (const b of this.bubbles) {
      b.f += b.sp * dt;
      b.u += Math.sin(this.time * 5 + b.r * 9) * 0.02 * dt;
    }
    this.bubbles = this.bubbles.filter((b) => b.f < glass.level - 0.01);
  }

  /** The glass watches the jug, and gets more excited the closer it gets. */
  private react(dt: number) {
    const g = this.shape;
    const glass = this.glass;
    const tilt = clamp(this.tilt.value, 0, 1);
    const lip = spout(this.j, this.jx.value, this.jy, tilt);
    const fy = yAt(g, 0.3);
    this.face.look((lip.x - g.cx) / (g.wt * 4), (lip.y - fy) / (g.wt * 4));
    if (this.landing > 0.3) {
      const d = glass.top - glass.line;
      if (glass.top > 0.92) this.face.set('strain', 0.25);
      else if (d > PERFECT_NEAR) this.face.set('nervous', 0.25);
      else if (d > -0.12) this.face.set('wide', 0.25);
      else this.face.set('happy', 0.25);
    }
    const perfect = glass.verdict === 'perfect';
    this.glow = lerp(this.glow, perfect ? 1 : 0, Math.min(1, dt * (perfect ? 8 : 4)));
    this.nudge = Math.max(0, this.nudge - dt * 0.6);
    if (this.admireT >= 0) {
      this.admireT += dt;
      if (this.admireT > ADMIRE) this.serve();
    }
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: this.floorY });
    ctx.save();
    this.shake.apply(ctx, w / 2, h / 2);

    // Whatever missed, pooled on the table.
    if (this.puddle.amount > 0.003) {
      const rx = Math.min(this.g.wt * 2.2, Math.sqrt(this.puddle.amount) * this.g.wt * 2.6);
      ctx.fillStyle = rgba(this.puddle.color, clamp(this.puddle.amount * 6, 0, 0.55));
      ctx.beginPath();
      ctx.ellipse(this.puddle.x, this.floorY + 4, rx, Math.max(2, rx * 0.16), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', clamp(this.puddle.amount * 5, 0, 0.4));
      ctx.beginPath();
      ctx.ellipse(this.puddle.x - rx * 0.3, this.floorY + 3, rx * 0.35, Math.max(1, rx * 0.04), 0, 0, TAU);
      ctx.fill();
    }

    const g = this.shape;
    drawGlass(ctx, t, g, this.glass, this.inGlass, {
      face: this.face,
      glow: this.glow,
      nudge: this.nudge,
      time: this.time,
      inside: this.bubbles.length ? (c) => this.drawBubbles(c, g) : undefined,
    });
    drawStream(ctx, this.drops, this.drink);
    drawJug(ctx, t, this.j, this.jx.value, this.jy, clamp(this.tilt.value, 0, 1), this.drink);
    this.particles.draw(ctx);
    ctx.restore();
    paintGrain(ctx, w, h, t);
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, g: GlassShape) {
    ctx.fillStyle = rgba('#ffffff', 0.55);
    for (const b of this.bubbles) {
      const half = halfAt(g, b.f);
      ctx.beginPath();
      ctx.arc(g.cx - half + b.u * half * 2, yAt(g, b.f), b.r, 0, TAU);
      ctx.fill();
    }
  }
}

/** Past the line by more than this while pouring, the glass gets nervous. */
const PERFECT_NEAR = 0.02;

function loadPrefs(): string {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}');
    return typeof p.drink === 'string' ? p.drink : DRINKS[0].id;
  } catch {
    return DRINKS[0].id;
  }
}
