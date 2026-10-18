# soft spot

A cozy, low-pressure pocket playground for iOS and Android: a small calm
world with tactile toys you can open for two minutes and leave feeling
better. No scores, no timers, no coins — the interaction _is_ the game.

This prototype contains the first four of five planned rooms, built on a
shared design system so every future toy looks, sounds and feels like it
came from the same shelf.

| room                                | what you do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pop** — watermelon & rubber bands | A 3D watermelon with a little face lies on its side on the table, seen in a raised three-quarter view. Tap it, or swipe down across it, and a band of every colour flies on loose and snaps tight. Each band squeezes the melon right where you put it — pile them up and the groove bites deeper, while the squeezed-out volume swells the free parts and makes it longer, until it's a peanut resting on its two lobes. It gets nervous, creaks, hairline cracks creep round the rind… and somewhere between 40 and 65 bands it _bursts_ — never the same way twice: the rind fractures into irregular pieces (small where it split, big end caps tumbling open), wet flesh with seeds still in it, juice that streaks through the air and lands in glossy puddles and smears, a puff of mist and a ring across the table, snapped bands wriggling everywhere, and a few chunks keep dizzy little faces. The camera swoops low over the mess. Poke the pieces; then they pop away and a fresh melon drops in. |
| **jelly** — soft 3D fruit jellies   | Seen from above: a wobbly watermelon slice on a table. **Knife:** draw a line and a chef's knife lines up over it and chops when you let go — every piece your line crosses is cut right where you drew it, again and again; peel, flesh and seeds run all the way through. A crumb too small to cut makes the blade boing off. **Hand:** grab and slide, flick to toss, second finger to twist; press two pieces of the same fruit together and they melt back into one. **+** adds more fruits (three watermelons, orange, lemon, kiwi, strawberry, apple, peach, dragon fruit); the settings sheet has firmness, settle, slow motion, show mesh, pause and a nudge. Every piece keeps a little face.                                                                                                                                                                                                                                                                                                         |
| **bubbles** — bubble wrap           | A sheet of bubble wrap with a tiny face on every bubble. **Press:** push a bubble in — it resists in three little creaky steps, trembles, then gives with a big pop (a quick tap is a small one); its neighbours watch nervously. Roll a finger across a row and each bubble pops a step higher, like a xylophone run; clear a whole row in one swipe and it chimes. **Stretch:** grab the film and pull — bubbles stretch into ovals, look worried and crackle if you pull too hard; let go and it snaps back. Pop them all and the sheet rolls itself up and a fresh one unrolls. Leave it alone and the bubbles doze off; a touch wakes them in a ripple. **+** picks the film colour and bubble size (remembered next time).                                                                                                                                                                                                                                                                                |
| **pour** — fill to the line         | A random drink every glass — milk from a carton, cola from a glass bottle, bubble tea (pearls already waiting) or lemonade from a classic pitcher (ice and a lemon wheel) — and a fill line. Pearls and ice take up room, so the drink climbs faster around them, and each time bubble tea or lemonade comes back there are a few more. **Press and hold** and it tips and pours; **let go** to stop. Once it settles it's judged: right on the line keeps your **streak** going, anything else starts it over, and your **best** streak is kept. Each one in a row pours a little faster. Cola foams up above the drink, so you have to read the drink through the froth. Holding Space or Enter works too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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
  - Melon (three.js): a volume-conserving body of revolution lying on its
    side — every band compresses it locally where it sits, and the displaced
    volume lengthens it and smoothly bulges the unbanded parts, so it rests
    on its lobes — plus springs for squash/roll/swell/waist wobble. The
    burst fractures the rind (a Voronoi split of its actual squeezed shape,
    crowded at the groove) into curved shells, faceted flesh, juice that splats on the table,
    seeds and snapped bands, all simple rigid bodies that tumble, bounce
    and settle lying flat while the camera swoops low.
  - Jelly (three.js): each piece is a rounded convex prism simulated
    as a 3D shape-matching soft body (rotation via quaternion polar
    decomposition + area-preserving affine stretch, volume pressure, resting
    pre-stress so it holds its shape), skinned onto a smooth mesh. Cuts are
    planes, so every piece can be cut again; colour is a solid texture in
    the original fruit's space, so cut faces show the right cross-section.
- **Procedural audio** via Web Audio: Karplus–Strong plucks for rubber bands,
  filtered noise and tuned tones for jelly, crisp pops and plastic crinkles
  for bubble wrap, stick–slip creaks, generative
  ambient music. All tuned to one pentatonic scale.
- Runs at 60 fps on phones: DPR capped at 2, no per-frame `shadowBlur`/filters,
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
    melon/    shape (bands + squeeze), MelonScene (three.js), bands3d, explosion + debris, MelonRoom, preview
    jelly/    Piece (soft body), Lab (three.js scene), material, fruits, Knife, JellyRoom, preview
    wrap/     Sheet (stretchy film + bubbles), draw, WrapRoom, preview
tests/        melon, jelly physics, cutting, bubble wrap & geometry tests (vitest)
```
