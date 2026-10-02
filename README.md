# soft spot

A cozy, low-pressure pocket playground for iOS and Android: a small calm
world with tactile toys you can open for two minutes and leave feeling
better. No scores, no timers, no coins — the interaction _is_ the game.

This prototype contains the first two of five planned rooms, built on a
shared design system so every future toy looks, sounds and feels like it
came from the same shelf.

| room                                  | what you do                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **pop** — watermelon & rubber bands   | Swipe across the melon to snap bands around its waist. It squeezes, bulges, gets nervous, creaks… and at some unknowable point it _pops_ — slow-motion, juice, flying bands, and a few dizzy little slices. Then a fresh melon drops in.                                                         |
| **melon jelly** — a 3D watermelon-jelly specimen | A glossy, wobbly wedge of watermelon jelly on a table. **Knife:** draw a line across it and a cleaver lines up over it, then chops when you let go — cut the pieces again, as small as you like; flesh, rind, skin and seeds run all the way through. **Hand:** grab any corner and pull, flick to toss, add a second finger to twist. The specimen panel has three varieties (Crimson, Golden, Rosé), firmness and internal-damping sliders, nudge, reset, ¼ speed, show mesh and pause, with a live mass / volume / kinetic / pieces readout. Every piece keeps a little face. |

See **[DESIGN.md](DESIGN.md)** for the full design system: palette, type,
lighting, faces, motion, the procedural sound palette, haptic vocabulary,
and how to add a room.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173 — open on your phone via your LAN IP
npm test             # physics + geometry tests
npm run build        # production web build in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

Use a phone (or your browser's device toolbar with touch emulation). Sound
starts after the first touch, as mobile browsers require.

## iOS & Android (Capacitor)

The app is a web-tech core wrapped natively with [Capacitor](https://capacitorjs.com),
with native haptics (Taptic Engine / Android vibrator), status-bar styling
and the Android back button wired up (`src/native.ts`).

```bash
npm run cap:sync       # web build + copy into ios/ and android/
npx cap open ios       # opens Xcode (macOS) — run on a device for haptics
npx cap open android   # opens Android Studio
```

Both native projects are already generated in `ios/` (Swift Package Manager,
no CocoaPods) and `android/`, locked to portrait.

Config lives in `capacitor.config.ts` (app id `app.softspot.toys`).

## How it's built

- **TypeScript + Canvas 2D**, no game engine. One full-screen canvas; a thin
  DOM layer for chrome (buttons, sheets) so text stays crisp and accessible.
- **Physics written for feel:**
  - Melon: an analytic silhouette deformed by band pinch, volume-conserving
    bulge, and springs for squash/sway/swell; the burst shatters the current
    outline into Voronoi chunks with impulse-based rigid-body physics.
  - Melon jelly (three.js): each piece is a rounded convex prism simulated
    as a 3D shape-matching soft body (rotation via quaternion polar
    decomposition + area-preserving affine stretch, volume pressure, resting
    pre-stress so it holds its shape), skinned onto a smooth mesh. Cuts are
    planes, so every piece can be cut again; colour is a solid texture in
    the original fruit's space, so cut faces show the right cross-section.
- **Procedural audio** via Web Audio: Karplus–Strong plucks for rubber bands,
  filtered noise and tuned tones for jelly, stick–slip creaks, generative
  ambient music. All tuned to one pentatonic scale.
- Runs at 60 fps on phones: DPR capped at 2, no `shadowBlur`/filters,
  allocation-free physics inner loops.

```
src/
  app/        App (loop, transitions, top bar), Scene contract, room registry
  core/       math, geometry, input, audio, sounds, music, haptics, settings
  design/     tokens, theme (day/dusk), motion (springs/easing), icons
  render/     stage, paint (lighting/material), face, particles, camera
  ui/         buttons, sound menu, segmented control, hint
  rooms/
    home/     the shelf
    melon/    Melon, Burst, MelonRoom, preview
    jelly/    Piece (soft body), Lab (three.js scene), material, Knife, varieties, JellyRoom, preview
tests/        jelly physics, cutting & geometry tests (vitest)
```
