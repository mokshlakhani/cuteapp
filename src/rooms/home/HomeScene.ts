import type { Preview, RoomInfo, RoomNav, Scene } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint, radius, type } from '../../design/tokens';
import { Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { mix, rgba } from '../../core/color';
import { rand, TAU } from '../../core/math';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { paintBackdrop, paintGrain, roundRect, gloss, shade } from '../../render/paint';
import { Face, drawFace } from '../../render/face';
import { el, tactile } from '../../ui/components';

interface Card {
  info: RoomInfo;
  node: HTMLElement;
  preview: Preview;
  press: Spring;
  rect: { x: number; y: number; w: number; h: number };
  face?: Face;
  wiggle?: Spring;
  zs: { x: number; y: number; age: number }[];
  nextZ: number;
}

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
        press: new Spring(1, springs.soft),
        rect: { x: 0, y: 0, w: 0, h: 0 },
        zs: [],
        nextZ: rand(0.5, 2.5),
      };
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
    this.ui.append(header, shelf, sleepers);
  }

  layout(w: number, h: number, _safe: Insets) {
    this.w = w;
    this.h = h;
    requestAnimationFrame(() => this.measure());
  }

  private measure() {
    for (const c of this.cards) {
      const r = c.node.getBoundingClientRect();
      c.rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
  }

  enter() {
    this.greet.textContent = greeting();
    requestAnimationFrame(() => this.measure());
  }

  leave() {}

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

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    paintBackdrop(ctx, this.w, this.h, t, { tint: this.tint, floorY: null });
    // Cards are laid out by CSS; the canvas paints them where they are.
    this.measure();
    for (const c of this.cards) {
      const { x, y, w, h } = c.rect;
      if (!w) continue;
      const s = c.press.value;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(s, s);
      ctx.translate(-(x + w / 2), -(y + h / 2));
      if (c.info.awake) this.drawCard(ctx, c);
      else this.drawSleeper(ctx, c);
      ctx.restore();
    }
    paintGrain(ctx, this.w, this.h, t);
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: Card) {
    const t = theme.current;
    const { x, y, w, h } = c.rect;
    const r = radius.lg;
    // Soft layered shadow (warm, never grey).
    for (let i = 3; i >= 1; i--) {
      roundRect(ctx, x - i * 1.5, y + i * 3, w + i * 3, h + i * 2, r + i * 2);
      ctx.fillStyle = `rgba(${t.shadowRgb},${0.035 * t.shadowStrength})`;
      ctx.fill();
    }
    const tintAmt = t.name === 'day' ? 0.32 : 0.16;
    roundRect(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, mix(t.surface, c.info.tint, tintAmt * 0.6));
    g.addColorStop(1, mix(t.surface, c.info.tint, tintAmt));
    ctx.fillStyle = g;
    ctx.fill();
    // A little floor inside the card, matching the room it opens.
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = mix(t.surface, c.info.tint, tintAmt * 1.5);
    ctx.fillRect(x, y + h * 0.74, w, h * 0.26);
    ctx.fillStyle = t.floorEdge;
    ctx.fillRect(x, y + h * 0.74 - 1, w, 1.5);
    c.preview.draw(ctx, x, y, w, h);
    ctx.restore();
    // Top edge highlight: the card feels soft and raised.
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = rgba('#ffffff', t.name === 'day' ? 0.7 : 0.08);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawSleeper(ctx: CanvasRenderingContext2D, c: Card) {
    const t = theme.current;
    const { x, y, w, h } = c.rect;
    const cx = x + w / 2;
    const base = y + h * 0.68;
    const R = Math.min(w, h) * 0.26;
    const breathe = Math.sin(this.time * 1.1 + x * 0.01) * 0.035;
    const wig = c.wiggle!.value * 0.01;
    // Pad
    ctx.fillStyle = mix(t.surface, c.info.tint, t.name === 'day' ? 0.25 : 0.12);
    ctx.beginPath();
    ctx.ellipse(cx, base + R * 0.15, R * 1.55, R * 0.42, 0, 0, TAU);
    ctx.fill();
    // Sleepy blob (a toy that hasn't moved in yet)
    ctx.save();
    ctx.translate(cx, base);
    ctx.rotate(wig);
    ctx.scale(1 + breathe * 0.6, 1 - breathe);
    const col = mix(c.info.tint, t.surface, t.name === 'day' ? 0.15 : 0.35);
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.8, R * 1.05, R * 0.85, 0, 0, TAU);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.clip();
    shade(ctx, t, 0, -R * 0.8, R * 1.05, 0.35, 0.18, mix(c.info.tint, '#6b5a70', 0.5));
    ctx.restore();
    gloss(ctx, -R * 0.42, -R * 1.18, R * 0.26, R * 0.12, 0.65);
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
