import type { Preview, RoomInfo, RoomNav, Scene } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { duration, roomTint, radius, type, type Theme } from '../../design/tokens';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { mix, rgba } from '../../core/color';
import { rand, TAU } from '../../core/math';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { contactShadow, paintBackdrop, roundRect, gloss, shade } from '../../render/paint';
import { Face, drawFace } from '../../render/face';
import { el, tactile } from '../../ui/components';

interface Card {
  info: RoomInfo;
  node: HTMLElement;
  preview: Preview;
  /** The card without its toy, painted once (see paintFrame). */
  frame: HTMLCanvasElement;
  /** What the frame was last painted for (size, theme). */
  frameKey: string;
  /** The press scale it was last shown at, once home has settled (see draw). */
  shownScale: number;
  press: Spring;
  rect: { x: number; y: number; w: number; h: number };
  face?: Face;
  wiggle?: Spring;
  zs: { x: number; y: number; age: number }[];
  nextZ: number;
}

/** Room round a card's frame for its soft shadow, and round a sleeper for its z's (px). */
const FRAME_PAD = 12;
const SLEEPER_PAD = 36;

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'good morning';
  if (h >= 12 && h < 17) return 'good afternoon';
  if (h >= 17 && h < 22) return 'good evening';
  return 'hello, night owl';
}

/**
 * Home: a quiet shelf of toys. Each awake toy is shown alive on its card —
 * you see what it does before you touch it. Sleeping spots hint that more
 * toys will move in later, without a single "coming soon" banner.
 */
export class HomeScene implements Scene {
  readonly id = 'home';
  readonly tint = roomTint.home;
  readonly ui: HTMLElement;
  private cards: Card[] = [];
  private w = 0;
  private h = 0;
  private time = 0;
  private greet: HTMLElement;
  private blobs = new Map<string, HTMLCanvasElement>();
  /** When the cards may show their own canvases (see draw). */
  private liveFrom = Infinity;
  private settled = false;
  /** What the stage was last painted whole for, while settled; '' when it needs painting. */
  private stageKey = '';
  /** The ground and the cards at rest, to repaint patches of the stage from (see draw). */
  private still = document.createElement('canvas');
  private stillKey = '';

  constructor(
    private nav: RoomNav,
    rooms: RoomInfo[],
  ) {
    this.ui = el('div', 'home');
    this.greet = el('p', 'home-greeting', {}, [greeting()]);
    const title = el('h1', 'home-title', {}, ['soft spot']);
    const header = el('header', 'home-header', {}, [this.greet, title]);
    const shelf = el('div', 'shelf');
    const sleepers = el('div', 'sleepers');
    for (const info of rooms) {
      const awake = info.awake;
      const node = el(
        awake ? 'button' : 'div',
        awake ? 'card' : 'sleeper',
        awake ? { type: 'button', 'aria-label': `open ${info.name}` } : { 'aria-hidden': 'true' },
      );
      node.append(el('span', awake ? 'card-label' : 'sleeper-label', {}, [awake ? info.name : 'soon']));
      const card: Card = {
        info,
        node,
        preview: info.preview(),
        frame: document.createElement('canvas'),
        frameKey: '',
        shownScale: 1,
        press: new Spring(1, springs.soft),
        rect: { x: 0, y: 0, w: 0, h: 0 },
        zs: [],
        nextZ: rand(0.5, 2.5),
      };
      const toy = card.preview.canvas;
      if (toy) {
        toy.classList.add('card-toy', 'is-hidden');
        node.prepend(toy);
      }
      if (!awake) {
        card.face = new Face();
        card.face.base = 'sleepy';
        card.wiggle = new Spring(0, springs.wobbly);
      }
      const press = () => {
        card.press.target = 0.95;
      };
      node.addEventListener('pointerdown', press);
      const unpress = () => {
        card.press.target = 1;
      };
      node.addEventListener('pointerup', unpress);
      node.addEventListener('pointercancel', unpress);
      node.addEventListener('pointerleave', unpress);
      tactile(
        node,
        () => {
          card.press.target = 1;
          card.press.impulse(0.6);
          if (awake) {
            card.preview.poke();
            const r = node.getBoundingClientRect();
            this.nav.go(info.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
          } else {
            // Shh, it's sleeping. A sleepy wiggle and a soft "mm".
            card.wiggle!.impulse(9);
            card.face!.set('calm', 0.9);
            card.zs.push({ x: 0, y: 0, age: 0 });
            material.pop(0.1);
            haptics.play('soft');
          }
        },
        { sound: awake, haptic: awake },
      );
      (awake ? shelf : sleepers).append(node);
      this.cards.push(card);
    }
    this.ui.append(header, shelf);
    if (sleepers.childElementCount) this.ui.append(sleepers);
  }

  layout(w: number, h: number, _safe: Insets) {
    this.w = w;
    this.h = h;
    this.stageKey = '';
    requestAnimationFrame(() => this.measure());
  }

  /** Where each card sits, unpressed (a pressed card is scaled about its middle). */
  private measure() {
    for (const c of this.cards) {
      const r = c.node.getBoundingClientRect();
      const w = c.node.offsetWidth;
      const h = c.node.offsetHeight;
      c.rect = { x: r.left + r.width / 2 - w / 2, y: r.top + r.height / 2 - h / 2, w, h };
    }
  }

  enter() {
    this.greet.textContent = greeting();
    requestAnimationFrame(() => this.measure());
    // The cards show their own canvases once home has finished blooming in.
    this.liveFrom = performance.now() + duration.room + 60;
  }

  leave() {
    this.liveFrom = Infinity;
  }

  pointerDown(_p: Pointer) {}
  pointerMove(_p: Pointer) {}
  pointerUp(_p: Pointer) {}

  update(dt: number) {
    this.time += dt;
    for (const c of this.cards) {
      c.press.update(dt);
      c.preview.update(dt);
      c.face?.update(dt);
      c.wiggle?.update(dt);
      c.nextZ -= dt;
      if (c.face && c.nextZ <= 0) {
        c.nextZ = rand(2.2, 4.5);
        c.zs.push({ x: 0, y: 0, age: 0 });
      }
      for (const z of c.zs) z.age += dt;
      c.zs = c.zs.filter((z) => z.age < 2.4);
    }
  }

  /**
   * Settled, home keeps a still picture of the ground and the cards, and each
   * frame repaints only the patches that move: the 2D toys and the sleeper,
   * each restored from the still and redrawn. The 3D toys show their own
   * canvases. While a card is pressed, or a room blooms in or out, the whole
   * stage is drawn instead. On an iPhone, repainting the whole stage every
   * frame alongside the 3D toys more than halves the frame rate.
   */
  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    this.measure();
    this.setSettled(performance.now() >= this.liveFrom);
    if (!this.settled) {
      this.stageKey = '';
      paintBackdrop(ctx, this.w, this.h, t, { tint: this.tint, floorY: null });
      for (const c of this.cards) this.drawCard(ctx, t, c, true);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${Math.round(this.w)}x${Math.round(this.h)}@${dpr}|${t.name}|${this.cards.map((c) => `${Math.round(c.rect.x)},${Math.round(c.rect.y)},${Math.round(c.rect.w)}`).join(';')}`;
    if (key !== this.stillKey) {
      this.stillKey = key;
      this.paintStill(t, dpr);
      this.stageKey = '';
    }
    // 3D toys render themselves, pressed with their card.
    let pressing = false;
    for (const c of this.cards) {
      const s = Math.round(c.press.value * 1000) / 1000;
      if (s !== 1 || s !== c.shownScale) pressing = true;
      if (c.preview.render && s !== c.shownScale) toyScale(c, s);
      c.shownScale = s;
      if (c.preview.render && c.rect.w) c.preview.render(c.rect.w, c.rect.h);
    }
    if (pressing || this.stageKey !== key) {
      // Everything, with the pressed card at its pressed size.
      this.stageKey = pressing ? '' : key;
      paintBackdrop(ctx, this.w, this.h, t, { tint: this.tint, floorY: null });
      for (const c of this.cards) this.drawCard(ctx, t, c, false);
      return;
    }
    // Sleepers first: their patches reach up over the cards' edges.
    for (const pass of [false, true]) {
      for (const c of this.cards) {
        const { x, y, w, h } = c.rect;
        if (!w || c.info.awake !== pass || c.preview.render) continue;
        const pad = c.info.awake ? 0 : SLEEPER_PAD;
        const px = Math.floor(x - pad);
        const py = Math.floor(y - pad);
        const pw = Math.ceil(x + w + pad) - px;
        const ph = Math.ceil(y + h + pad) - py;
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();
        ctx.drawImage(this.still, px * dpr, py * dpr, pw * dpr, ph * dpr, px, py, pw, ph);
        if (c.info.awake) c.preview.draw(ctx, x, y, w, h);
        else this.drawSleeper(ctx, t, c, x, y);
        ctx.restore();
      }
    }
  }

  /** The ground with every card's frame (and each sleeper's shadow) on it, at rest. */
  private paintStill(t: Theme, dpr: number) {
    const cv = this.still;
    cv.width = Math.max(1, Math.round(this.w * dpr));
    cv.height = Math.max(1, Math.round(this.h * dpr));
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackdrop(g, this.w, this.h, t, { tint: this.tint, floorY: null });
    for (const c of this.cards) {
      const { x, y, w, h } = c.rect;
      if (!w || !c.info.awake) continue;
      this.paintFrame(t, c);
      g.drawImage(c.frame, x - FRAME_PAD, y - FRAME_PAD, w + FRAME_PAD * 2, h + FRAME_PAD * 2);
    }
  }

  private setSettled(on: boolean) {
    if (on === this.settled) return;
    this.settled = on;
    for (const c of this.cards) {
      c.preview.canvas?.classList.toggle('is-hidden', !on);
      c.shownScale = 1;
      if (c.preview.canvas) toyScale(c, 1);
    }
  }

  /**
   * One card at its pressed size: its frame and its toy, or a sleeper. A toy
   * showing its own canvas is left out unless `all`. The toy is clipped to
   * the card's rectangle: a rounded clip is costly in Safari, and the toys
   * keep clear of the corners.
   */
  private drawCard(ctx: CanvasRenderingContext2D, t: Theme, c: Card, all: boolean) {
    const { x, y, w, h } = c.rect;
    if (!w) return;
    const s = c.press.value;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(s, s);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    if (c.info.awake) {
      this.paintFrame(t, c);
      ctx.drawImage(c.frame, x - FRAME_PAD, y - FRAME_PAD, w + FRAME_PAD * 2, h + FRAME_PAD * 2);
      if (all || !c.preview.render) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        c.preview.draw(ctx, x, y, w, h);
      }
    } else this.drawSleeper(ctx, t, c, x, y);
    ctx.restore();
  }

  /** Size a card's own canvas to w×h CSS px, clear it, and hand back its context in CSS px. */
  private fit(cv: HTMLCanvasElement, w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw;
      cv.height = ch;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  /** Paint a card's frame into its own canvas, when its size or the theme changes. */
  private paintFrame(t: Theme, c: Card) {
    const { w, h } = c.rect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${Math.round(w)}x${Math.round(h)}@${dpr}|${t.name}`;
    if (key === c.frameKey) return;
    c.frameKey = key;
    const g = this.fit(c.frame, w + FRAME_PAD * 2, h + FRAME_PAD * 2);
    g.translate(FRAME_PAD, FRAME_PAD);
    this.drawFrame(g, t, c, w, h);
  }

  /** A card without its toy: soft shadow, body, the little floor, a lit top edge. */
  private drawFrame(ctx: CanvasRenderingContext2D, t: Theme, c: Card, w: number, h: number) {
    const r = radius.lg;
    // Soft layered shadow (warm, never grey).
    for (let i = 3; i >= 1; i--) {
      roundRect(ctx, -i * 1.5, i * 3, w + i * 3, h + i * 2, r + i * 2);
      ctx.fillStyle = `rgba(${t.shadowRgb},${0.035 * t.shadowStrength})`;
      ctx.fill();
    }
    const tintAmt = t.light ? 0.32 : 0.16;
    roundRect(ctx, 0, 0, w, h, r);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mix(t.surface, c.info.tint, tintAmt * 0.6));
    g.addColorStop(1, mix(t.surface, c.info.tint, tintAmt));
    ctx.fillStyle = g;
    ctx.fill();
    // A little floor inside the card, matching the room it opens.
    ctx.save();
    roundRect(ctx, 0, 0, w, h, r);
    ctx.clip();
    ctx.fillStyle = mix(t.surface, c.info.tint, tintAmt * 1.5);
    ctx.fillRect(0, h * 0.74, w, h * 0.26);
    ctx.fillStyle = t.floorEdge;
    ctx.fillRect(0, h * 0.74 - 1, w, 1.5);
    ctx.restore();
    // Top edge highlight: the card feels soft and raised.
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = rgba('#ffffff', t.light ? 0.7 : 0.08);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** The sleeper's round body, shaded and glossed, painted once and reused. */
  private blob(t: Theme, c: Card, R: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${c.info.id}|${t.name}|${Math.round(R * 10)}@${dpr}`;
    let cv = this.blobs.get(c.info.id);
    if (cv && cv.dataset.key === key) return cv;
    cv ??= document.createElement('canvas');
    this.blobs.set(c.info.id, cv);
    cv.dataset.key = key;
    cv.width = Math.ceil(R * 2.4 * dpr);
    cv.height = Math.ceil(R * 2.2 * dpr);
    const g = cv.getContext('2d')!;
    // Origin at the blob's resting point, R*1.2 in from the left and R*1.9 down.
    g.setTransform(dpr, 0, 0, dpr, R * 1.2 * dpr, R * 1.9 * dpr);
    const col = mix(c.info.tint, t.surface, t.light ? 0.15 : 0.35);
    g.beginPath();
    g.ellipse(0, -R * 0.8, R * 1.05, R * 0.85, 0, 0, TAU);
    g.fillStyle = col;
    g.globalAlpha = 0.9;
    g.fill();
    g.globalAlpha = 1;
    g.save();
    g.clip();
    shade(g, t, 0, -R * 0.8, R * 1.05, 0.35, 0.18, mix(c.info.tint, '#6b5a70', 0.5));
    g.restore();
    gloss(g, -R * 0.42, -R * 1.18, R * 0.26, R * 0.12, 0.65);
    return cv;
  }

  /** A sleeping toy whose spot sits at (x, y): it breathes, and now and then a z floats up. */
  private drawSleeper(ctx: CanvasRenderingContext2D, t: Theme, c: Card, x: number, y: number) {
    const { w, h } = c.rect;
    const cx = x + w / 2;
    const base = y + h * 0.68;
    const R = Math.min(w, h) * 0.26;
    const breathe = Math.sin(this.time * 1.1 + c.rect.x * 0.01) * 0.035;
    const wig = c.wiggle!.value * 0.01;
    // A soft shadow where it rests.
    contactShadow(ctx, t, cx, base + R * 0.15, R * 1.4, R * 0.36, 0.22);
    // Sleepy blob (a toy that hasn't moved in yet)
    ctx.save();
    ctx.translate(cx, base);
    ctx.rotate(wig);
    ctx.scale(1 + breathe * 0.6, 1 - breathe);
    ctx.drawImage(this.blob(t, c, R), -R * 1.2, -R * 1.9, R * 2.4, R * 2.2);
    ctx.translate(0, -R * 0.7);
    drawFace(ctx, c.face!, R * 1.05, { ink: t.faceInk, blush: '#F4A6B0', alpha: 0.85 });
    ctx.restore();
    // Floating z's
    ctx.font = `600 ${Math.round(R * 0.5)}px ${type.display}`;
    ctx.textAlign = 'center';
    for (const z of c.zs) {
      const k = z.age / 2.4;
      ctx.fillStyle = rgba(t.inkSoft, Math.sin(Math.PI * k) * 0.8);
      ctx.fillText('z', cx + R * 0.9 + Math.sin(z.age * 3) * 5 + k * R * 0.4, base - R * 1.6 - k * R * 1.4);
    }
  }
}

/** Press a 3D toy's own canvas with its card. */
function toyScale(c: Card, s: number) {
  const toy = c.preview.canvas;
  if (toy) toy.style.transform = s === 1 ? '' : `scale(${s})`;
}
