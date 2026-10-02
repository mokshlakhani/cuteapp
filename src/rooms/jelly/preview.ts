import type { Preview } from '../../app/scene';
import { theme } from '../../design/theme';
import { rand } from '../../core/math';
import { fruitById } from './fruits';
import { SoftBody } from './SoftBody';
import { JellyWorld } from './JellyWorld';
import { drawJelly, drawJellyShadow } from './renderJelly';

/** Three tiny jellies living on the home card, jiggling now and then. */
export function jellyPreview(): Preview {
  const world = new JellyWorld();
  world.substeps = 2;
  let built = { w: 0, h: 0, x: 0, y: 0 };
  let time = 0;
  let nextJiggle = 1.5;

  const build = (x: number, y: number, w: number, h: number) => {
    built = { w, h, x, y };
    world.bodies = [];
    world.left = x + 8;
    world.right = x + w - 8;
    world.top = y + 8;
    world.floor = y + h * 0.74;
    const r = Math.min(w * 0.16, h * 0.16);
    const specs: [string, number][] = [
      ['strawberry', 0.27],
      ['orange', 0.55],
      ['grape', 0.78],
    ];
    for (const [id, fx] of specs) {
      const f = fruitById(id);
      const b = SoftBody.fromFruit(f, r, x + w * fx, world.floor - r * f.size * 1.02);
      world.add(b);
    }
  };

  return {
    update(dt) {
      if (!built.w) return;
      time += dt;
      world.step(dt);
      nextJiggle -= dt;
      if (nextJiggle <= 0) {
        nextJiggle = rand(1.8, 3.5);
        const b = world.bodies[Math.floor(rand(0, world.bodies.length))];
        if (b) {
          b.squish.velocity += rand(2.5, 4);
          if (Math.random() < 0.5) b.face?.set('happy', 1);
        }
      }
    },
    draw(ctx, x, y, w, h) {
      if (Math.abs(w - built.w) > 1 || Math.abs(h - built.h) > 1 || Math.abs(x - built.x) > 1 || Math.abs(y - built.y) > 1)
        build(x, y, w, h);
      const t = theme.current;
      for (const b of world.bodies) drawJellyShadow(ctx, t, b, world.floor);
      for (const b of world.bodies) drawJelly(ctx, t, b, time);
    },
    poke() {
      world.bodies.forEach((b, i) => {
        for (let k = 0; k < b.n; k++) b.vy[k] -= 260 + i * 60;
        b.face?.set('happy', 1.3);
      });
    },
  };
}
