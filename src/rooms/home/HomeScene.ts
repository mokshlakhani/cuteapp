import type { Preview, RoomInfo, RoomNav, Scene } from '../../app/scene';
import { frames } from '../../core/frames';
import { meter } from '../../core/perf';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { duration, roomTint, radius, tile, type, type Theme } from '../../design/tokens';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { mix, rgba } from '../../core/color';
import { clamp, rand, TAU } from '../../core/math';
import { reducedMotion } from '../../render/camera';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { contactShadow, paintBackdrop, roundRect, gloss, shade } from '../../render/paint';
import { Face, drawFace } from '../../render/face';
import { el, tactile } from '../../ui/components';
import { bestFor } from './scores';

interface Card {
  info: RoomInfo;
  node: HTMLElement;
  /** Everything that sinks when the tile's pressed. */
  top: HTMLElement;
  score: HTMLElement;
  preview: Preview;
  /** The card without its toy, painted once (see paintFrame). */
  frame: HTMLCanvasElement;
  /** What the frame was last painted for (size, theme). */
  frameKey: string;
  /** The press it was last shown at, once home has settled (see draw). */
  shownScale: number;
  press: Spring;
  rect: { x: number; y: number; w: number; h: number };
  face?: Face;
  wiggle?: Spring;
  zs: { x: number; y: number; age: number }[];
  nextZ: number;
  /** Which frames this toy's turn to render falls on, on a fast screen (see draw). */
  slot: number;
  /** Until when (ms) the toy renders every frame: it was just touched. */
  hotUntil: number;
}

/** Room round a card's frame for its corners, and round a sleeper for its z's (px). */
const FRAME_PAD = 2;
const SLEEPER_PAD = 36;
/** How deep a tile's chunky edge is, and so how far it sinks when pressed (px). */
const EDGE = 6;
/** How far the press spring goes, for the whole sink. */
const PRESS = 0.05;
/** The plate along a tile's foot, with its name on (px; `--plate` in app.css). */
const PLATE = 50;
/** The shelf's first arrival: each tile this long after the one before (ms), taking this long, rising this far (px). Matches .is-arriving in app.css. */
const ARRIVE = { each: 55, time: 560, rise: 16 };

/**
 * Home: the game's front page. Each game is a chunky tile in its own colour,
 * all the same size, that sinks into its edge like a real button: its toy
 * alive on top, and a plate along its foot saying what it's called and what
 * you do, with your best in the corner. Sleeping spots hint that more toys will move in later,
 * without a single "coming soon" banner.
 */
export class HomeScene implements Scene {
  readonly id = 'home';
  readonly tint = roomTint.home;
  readonly ui: HTMLElement;
  private cards: Card[] = [];
  private greeting = el('p', 'home-greeting');
  private w = 0;
  private h = 0;
  private time = 0;
  private blobs = new Map<string, HTMLCanvasElement>();
  /** When the cards may show their own canvases (see draw). */
  private liveFrom = Infinity;
  /** The first arrival: whether it's happened, and when it began (0: not arriving). */
  private arrived = false;
  private arriveAt = 0;
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
    const title = el('h1', 'home-title', {}, ['soft spot']);
    const header = el('header', 'home-header', {}, [title, this.greeting]);
    this.greet();
    const shelf = el('div', 'shelf');
    const sleepers = el('div', 'sleepers');
    for (const info of rooms) {
      const awake = info.awake;
      const node = el(
        awake ? 'button' : 'div',
        awake ? 'card' : 'sleeper',
        awake ? { type: 'button', 'aria-label': `open ${info.name}: ${info.blurb}` } : { 'aria-hidden': 'true' },
      );
      const colours = tile[info.id];
      if (colours) node.style.setProperty('--tile-edge', colours.edge);
      node.style.setProperty('--i', String(this.cards.length));
      const top = el('span', 'card-face');
      const score = el('span', 'card-score');
      if (awake) top.append(el('span', 'card-plate', {}, [el('span', 'card-label', {}, [info.name]), el('span', 'card-blurb', {}, [info.blurb])]), score);
      else top.append(el('span', 'sleeper-label', {}, ['soon']));
      node.append(top);
      const card: Card = {
        info,
        node,
        top,
        score,
        preview: info.preview(),
        frame: document.createElement('canvas'),
        frameKey: '',
        shownScale: 1,
        press: new Spring(1, springs.soft),
        rect: { x: 0, y: 0, w: 0, h: 0 },
        zs: [],
        nextZ: rand(0.5, 2.5),
        slot: this.cards.length,
        hotUntil: 0,
      };
      const toy = card.preview.canvas;
      if (toy) {
        toy.classList.add('card-toy', 'is-hidden');
        top.prepend(toy);
      }
      if (!awake) {
        card.face = new Face();
        card.face.base = 'sleepy';
        card.wiggle = new Spring(0, springs.wobbly);
      }
      const press = () => {
        card.hotUntil = performance.now() + 2000;
        if (awake) this.nav.prepare(info.id);
        card.press.target = 1 - PRESS;
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
    this.greet();
    this.showScores();
    requestAnimationFrame(() => this.measure());
    // The cards show their own canvases once home has finished blooming in.
    this.liveFrom = performance.now() + duration.room + 60;
    // The very first time, the shelf arrives: each tile rises into place a
    // beat after the one before, title first. (Coming back from a room, home
    // blooms in whole, as every room does.)
    if (!this.arrived) {
      this.arrived = true;
      if (!reducedMotion) {
        this.arriveAt = performance.now() + 120;
        this.ui.classList.add('is-arriving');
        const total = ARRIVE.each * (this.cards.length - 1) + ARRIVE.time + 160;
        this.liveFrom = Math.max(this.liveFrom, this.arriveAt + total);
        window.setTimeout(() => this.ui.classList.remove('is-arriving'), total + 300);
      }
    }
  }

  /** How far a card has arrived (0 not yet, 1 in place). */
  private arriving(c: Card) {
    if (!this.arriveAt) return 1;
    const k = clamp((performance.now() - this.arriveAt - c.slot * ARRIVE.each) / ARRIVE.time, 0, 1);
    return 1 - Math.pow(1 - k, 4);
  }

  leave() {
    this.liveFrom = Infinity;
  }

  /** A quiet hello that follows the time of day. */
  private greet() {
    const hr = new Date().getHours();
    this.greeting.textContent =
      hr < 5 ? 'still up? stay as long as you like' : hr < 12 ? 'good morning · take your time' : hr < 17 ? 'hello again · take a little break' : hr < 22 ? 'good evening · get comfy' : 'cozy night · nothing to rush';
  }

  /** Your bests, fresh each time you come back. */
  private showScores() {
    for (const c of this.cards) {
      const best = bestFor(c.info.id);
      c.score.textContent = best === null ? '' : `best ${best}`;
    }
  }

  /** How far a card has sunk into its edge (px). */
  private sink(c: Card) {
    return (clamp((1 - c.press.value) / PRESS, -0.25, 1.2) * EDGE * 100 | 0) / 100;
  }

  /** Where a card's toy goes: all of it above the plate. */
  private toyRect(c: Card) {
    const { x, y, w, h } = c.rect;
    return { x, y, w, h: h - PLATE };
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
      for (const c of this.cards) {
        const k = this.arriving(c);
        if (k >= 1) this.drawCard(ctx, t, c, true);
        else if (k > 0) {
          // Rising into place, in step with its words (see .is-arriving in app.css).
          ctx.save();
          ctx.globalAlpha = k;
          ctx.translate(0, ARRIVE.rise * (1 - k));
          this.drawCard(ctx, t, c, true);
          ctx.restore();
        }
      }
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${Math.round(this.w)}x${Math.round(this.h)}@${dpr}|${t.name}|${this.cards.map((c) => `${Math.round(c.rect.x)},${Math.round(c.rect.y)},${Math.round(c.rect.w)}`).join(';')}`;
    if (key !== this.stillKey) {
      this.stillKey = key;
      this.paintStill(t, dpr);
      this.stageKey = '';
    }
    // 3D toys render themselves, pressed with their card. On a 120 Hz screen
    // they take turns, every other frame each: they only breathe and turn
    // slowly, so it can't be seen, and three or four live renders a frame
    // are the heaviest thing on the shelf. A toy that's just been touched
    // goes back to every frame.
    const now = performance.now();
    let pressing = false;
    for (const c of this.cards) {
      const s = this.sink(c);
      if (s !== 0 || s !== c.shownScale) pressing = true;
      if (s !== c.shownScale) faceSink(c, s);
      c.shownScale = s;
      const toy = this.toyRect(c);
      if (c.preview.render && toy.w && (!frames.fast || now < c.hotUntil || (frames.n + c.slot) % 2 === 0)) {
        const t0 = meter.start();
        c.preview.render(toy.w, toy.h);
        meter.stop('gl:' + c.info.id, t0);
      }
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
        const toy = this.toyRect(c);
        if (c.info.awake) {
          ctx.beginPath();
          ctx.rect(toy.x, toy.y, toy.w, toy.h);
          ctx.clip();
          // A card still being laid out has no room for its toy yet.
          if (toy.w > 1 && toy.h > 1) c.preview.draw(ctx, toy.x, toy.y, toy.w, toy.h);
        } else this.drawSleeper(ctx, t, c, x, y);
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
      this.drawEdge(g, t, c);
      g.drawImage(c.frame, x - FRAME_PAD, y - FRAME_PAD, w + FRAME_PAD * 2, h + FRAME_PAD * 2);
    }
  }

  private setSettled(on: boolean) {
    if (on === this.settled) return;
    this.settled = on;
    for (const c of this.cards) {
      c.preview.canvas?.classList.toggle('is-hidden', !on);
      c.shownScale = 0;
      faceSink(c, 0);
    }
  }

  /**
   * One card, sunk as far as it's pressed: its edge stays where it is, and its
   * frame and toy go down into it. A toy showing its own canvas is left out
   * unless `all`. The toy is clipped to the card's rectangle: a rounded clip
   * is costly in Safari, and the toys keep clear of the corners.
   */
  private drawCard(ctx: CanvasRenderingContext2D, t: Theme, c: Card, all: boolean) {
    const { x, y, w, h } = c.rect;
    if (!w) return;
    if (!c.info.awake) {
      this.drawSleeper(ctx, t, c, x, y);
      return;
    }
    this.drawEdge(ctx, t, c);
    ctx.save();
    ctx.translate(0, this.sink(c));
    this.paintFrame(t, c);
    ctx.drawImage(c.frame, x - FRAME_PAD, y - FRAME_PAD, w + FRAME_PAD * 2, h + FRAME_PAD * 2);
    if (all || !c.preview.render) {
      const toy = this.toyRect(c);
      ctx.beginPath();
      ctx.rect(toy.x, toy.y, toy.w, toy.h);
      ctx.clip();
      if (toy.w > 1 && toy.h > 1) c.preview.draw(ctx, toy.x, toy.y, toy.w, toy.h);
    }
    ctx.restore();
  }

  /** The dusk theme dims the tiles with the rest of the world. */
  private colours(t: Theme, c: Card) {
    const k = tile[c.info.id] ?? { face: t.surface, edge: t.surfaceSunk };
    return t.light ? k : { face: mix(k.face, t.bg, 0.22), edge: mix(k.edge, t.bg, 0.22) };
  }

  /** The chunky edge a tile sits on and sinks into. */
  private drawEdge(ctx: CanvasRenderingContext2D, t: Theme, c: Card) {
    const { x, y, w, h } = c.rect;
    roundRect(ctx, x, y + EDGE, w, h, radius.lg);
    ctx.fillStyle = this.colours(t, c).edge;
    ctx.fill();
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

  /** A tile's top without its toy: one flat colour, lit along its upper edge, on its plate. */
  private drawFrame(ctx: CanvasRenderingContext2D, t: Theme, c: Card, w: number, h: number) {
    const r = radius.lg;
    roundRect(ctx, 0, 0, w, h, r);
    ctx.fillStyle = this.colours(t, c).face;
    ctx.fill();
    ctx.save();
    roundRect(ctx, 0, 0, w, h, r);
    ctx.clip();
    ctx.fillStyle = mix(this.colours(t, c).face, this.colours(t, c).edge, 0.72);
    ctx.fillRect(0, h - PLATE, w, PLATE);
    roundRect(ctx, 0, 2, w, h + r, r);
    ctx.strokeStyle = rgba('#ffffff', t.light ? 0.3 : 0.16);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
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

/** Sink a card's own layer (its toy's canvas, its words) with its tile. */
function faceSink(c: Card, y: number) {
  c.top.style.transform = y ? `translateY(${y}px)` : '';
}
