# soft spot — design system

> One warm little world containing a handful of interactive toys —
> a lamplit room that feels like a hug.
> Open → breathe → choose → play → get absorbed → feel satisfied → leave.

This document is the contract every room (current and future) follows. Rooms
inherit almost all of it automatically by using the shared modules; the
rest is a short list of rules.

---

## 1. Principles

1. **The toy is the star.** Chrome is small, soft and quiet. While playing,
   the screen shows the toy, a floor, and at most a back button, a sound
   button and one dock.
2. **Show, don't tell.** Home tiles show each toy _alive_, on a chunky tile in
   the game's own muted, earthy colour that sinks into its edge when pressed. Every
   tile is the same size, with a plate saying what the game's called and what
   you do, and your best in the corner if it keeps one. Each toy sits dead centre above
   its plate. A game's name stands
   big for a moment as you walk in. Display type is Fredoka everywhere,
   text is Nunito. Home says a quiet hello that follows the time of day. Hints are one line,
   appear once, and leave as soon as you've done the thing.
3. **No pressure.** No scores, timers, coins, lives, streaks, badges or
   progress bars. Nothing can be failed. Every "ending" (a burst, a pile of
   jelly pieces) resets itself gently or with one tap.
   _The one exception is **pour**, which keeps a streak of perfect pours and
   your best — quietly, in the top bar's centre, with no penalty for a miss
   beyond the streak starting over. Each drink pours its own way, left for you
   to find out rather than explained: milk is slow and steady with the most
   room either side of the line; cola's foam takes a while to settle; bubble
   tea starts as a trickle and builds; lemonade comes in glugs, the stream
   breaking off between them; hot cocoa steams up the glass and hides the
   line, so look before you pour. What the room says afterwards is dealt from
   about a hundred kind lines, never the same one twice running. There are no stars anywhere in the app. **Slice** asks
   for exactly so many pieces in at most so many cuts, and just says how
   close you came, with a little fanfare for exactly right; every fruit falls
   apart, so nothing is ever failed. **Peel** keeps the same deal: an
   ever-changing width of strip, a fanfare for one unbroken strip. Its one challenge is
   pace: a felt meter under the fruit with a green zone on a red track and a
   bead for your pace. The green wanders and narrows as the strip grows, and
   too long in the red, too fast or too slow, snaps the strip. **Bubbles** is a memory game and nothing else: a pattern of
   bubbles glows, you pop the ones you saw and tap done, and it simply says
   how many you got (no percentages, no extras, no best); a
   perfect round makes the next pattern a bubble bigger. **Soap** counts the
   bubbles that hold in a row until one pops, under your high score. **Stack**
   has no goal: only your high score, quietly at the top, to beat if you feel
   like it._
4. **Feel over features.** When in doubt, make an existing interaction 20%
   more satisfying instead of adding something.
5. **Everything is alive.** Toys breathe, blink, wobble and look at your
   finger. Nothing is ever perfectly still.

## 2. Palette (`src/design/tokens.ts`)

| token                          | day                    | dusk                  | use                             |
| ------------------------------ | ---------------------- | --------------------- | ------------------------------- |
| `bg` / `bgDeep`                | `#7E465B` / `#502C39`  | `#4C2A33` / `#2B191F` | mulberry → cocoa wash           |
| `surface`                      | `#925B64`              | `#603B43`             | buttons, cards, sheets          |
| `surfaceSunk`                  | `#6D3D47`              | `#45282F`             | tracks, wells                   |
| `ink` / `inkSoft` / `inkFaint` | milk-tea cream `#FFF1E2` … | warm cream …      | text & icons — never pure black |
| `glowWarm` / `glowCool`        | `#FEB46A` / `#D17456`  | `#F0994C` / `#A34B37` | lamp amber up top, ember below  |
| `shadowRgb`                    | `52,22,24`             | `20,8,10`             | every shadow is warm-tinted     |

**No blue light anywhere.** The ground stays deep (never lighten it), but
every glow, lamp and accent is amber, honey, terracotta or cocoa. Toggles
and sliders use honey (`--accent`). Game tiles are muted and earthy (clay,
sage, lavender, denim, honey, terracotta, rose, moss) and all hold cream
text at 4.3:1 or better.

Pastel accents (`pastel.*`): sage, mint, pink, peach, butter, sky, lilac,
berry (a desaturated red). They tint rooms, colour rubber bands, and fill
toggles. Fruits may be a little stronger, but are tuned to sit inside this
range (e.g. watermelon flesh `#F2858D`, not `#FF0033`).

**Dusk** is selected automatically from the system dark-mode setting — a warm
plum evening palette for using the app before sleep. Toys keep their colours;
only the world around them dims.

Each room has a **tint** (`roomTint`) mixed lightly into the shared backdrop
and used for its home card and transition rim. Melon = sage, jelly = pink.

## 3. Type

- **Display:** Fredoka 500/600 — titles, tile names and scores. Round and soft;
  titles carry one soft blurred shadow, never a hard sticker edge.
- **Text:** Nunito 600/700 — hints, toggles, small labels.
- All lowercase, short words: _soft spot_, _pop_, _jelly_, _fresh start_.
- Fonts are bundled locally (no network needed on device).

### Words

Kind, never measuring. A miss is "almost" or "a happy spill", never a
percentage; bests are "your best", never "high score"; orders read like a
recipe ("12 little pieces · 4 cuts, if you can"). Score numbers sit small and
soft at the top, in `inkSoft`.

## 4. Shape

- Radii: `xs 10 · sm 14 · md 20 · lg 28 · xl 36 · pill`. Cards use `lg`,
  sheets `xl`, buttons are circles or pills. No sharp corners anywhere —
  even watermelon burst chunks get softly rounded corners.
- Icons (`src/design/icons.ts`): 24×24, 2.2 px round-capped strokes, drawn in
  one hand. Add new tools to this set.

## 5. Light, material & shadow (`src/render/paint.ts`)

One lamp lights the whole world, from the **upper left** (`light` token).

| helper          | what it does                                                         | used by                           |
| --------------- | -------------------------------------------------------------------- | --------------------------------- |
| `paintBackdrop` | wash + window light pool + floor plane with soft AO edge             | every scene                       |
| `paintGrain`    | very faint paper grain over everything                               | every scene                       |
| `contactShadow` | warm, soft elliptical floor shadow that fades with height            | melon, chunks, jellies, home toys |
| `shade`         | ball shading: lit upper-left, soft far-side falloff                  | melon, jellies, sleepers          |
| `gloss`         | the signature highlight: soft lozenge + tiny sparkle dot, upper-left | every toy                         |

Materials differ only in _opacity and inner detail_: the melon is opaque
vinyl, the jelly is translucent with scattered inner light, bubbles and seeds
— but both use the same shading, gloss, rim and shadow, so they read as toys
from the same shelf.

### Something soft to sit on

Nothing floats in the void. Every 3D toy rests on a cloth from
`clothMesh` (`render/table.ts`): a knitted rug (pop), gingham (jelly,
slice, peel) or linen (soap, stack), with a running stitch round its edge.
Soft chrome matches: the dock, sheets, popover and round buttons carry a
faint dashed stitch (`--stitch`), like felt. 3D lights are warm
(`#ffe2bf` key, `#ffeedb`/`#d9b49a` hemisphere) and the backdrop's lamp pool
is amber. Jelly is cut with a round-ended butter knife: nothing sharp.

## 6. Faces (`src/render/face.ts`)

Every toy has a face, and all faces come from one renderer and one
controller, so they emote identically.

| expression           | look                                 | when                            |
| -------------------- | ------------------------------------ | ------------------------------- |
| `calm`               | • ‿ • (blinks, looks at your finger) | idle                            |
| `happy`              | ^ ▽ ^                                | poked, landed, playing          |
| `wide`               | ● o ●                                | being stretched, tension rising |
| `squeeze`            | > ~ <                                | squished, a band snapping on    |
| `nervous` / `strain` | • ~ • / > ~ <, sweat drop, tremble   | melon near bursting             |
| `dizzy`              | @ ~ @                                | after a hard bounce / the burst |
| `surprised`          | ● · ●                                | just cut, just spawned          |
| `sleepy`             | ‿ . ‿                                | rooms that haven't moved in yet |

Faces are drawn **inside the toy's deformation transform** (and, for jelly,
_under_ the glossy surface), so they squash, stretch and wobble with the body
instead of floating on top like stickers. Expressions pop in with a small
spring and relax back to the base expression after a hold time.

## 7. Motion (`src/design/motion.ts`)

- Everything moves on springs. Presets: `soft` (UI), `wobbly` (toys),
  `gentle` (idle drift), `snap` (elastic). CSS uses matching curves
  (`--ease-overshoot` etc.) so DOM and canvas feel the same.
- Press = quick squish down (90 ms), release = overshooting spring back.
- Room transition (`App`): the next room **blooms out of the spot you
  touched** as a growing circle with a soft tinted rim (640 ms); the old room
  drifts back ~3%. Same transition for every room, both directions.
- Slow motion & screen shake are rare (burst only): the melon's burst holds
  its breath in slow motion for ~1.5 s, then time rushes back in; shake
  ≤ 10 px, never continuous.

## 8. Sound (`src/core/audio.ts`, `src/core/sounds.ts`, `src/core/music.ts`)

- **No audio files.** Everything is synthesised, so it's tiny and tunable.
- One signal path: every sound → warm high-shelf cut → gentle compressor,
  with a shared small, dark room reverb.
- **One scale.** Every pitched sound snaps to F-major pentatonic — the key
  the ambient music is in — so toys always harmonise with the music and with
  each other, even when mashed.
- Rooms speak a shared vocabulary rather than building sounds:
  `ui.tap/toggle/whoosh/sheet`, `material.boop/plop/thump/pop/sparkle`,
  elastic `twang/creak/burst`, jelly `squeak/snapBack/squish/slice/boing/melt`.
- Rate limits per word stop collisions from machine-gunning; voices are capped.
- Music: generative warm pads (Fmaj9 → Am7 → B♭maj9 → C6/9), rare soft bells,
  the odd piano note — ~20 dB under the toys, never loops audibly. Under it,
  a fire crackles quietly in the room (a low hush and rare soft ticks); it
  comes and goes with the music toggle.
- Music and sounds toggle independently. On iOS the audio session is set to
  _ambient_: respects the silent switch and mixes with the user's own music.

## 9. Haptics (`src/core/haptics.ts`)

A six-word vocabulary, never raw durations:

| word    | feel                            | e.g.                                 |
| ------- | ------------------------------- | ------------------------------------ |
| `tick`  | lightest grain, used in streams | band stretching, jelly stretch steps |
| `tap`   | small landing                   | band placed, poke                    |
| `soft`  | squishy contact                 | jelly squish, hard bounce            |
| `snap`  | elastic snap / slice            | high-tension band, knife cut         |
| `thud`  | heavier landing                 | melon drops in                       |
| `burst` | the big release (still short)   | melon pops                           |

Native: Capacitor Haptics (iOS Taptic Engine / Android). Web: `navigator.vibrate`.
A global minimum gap means haptics never buzz continuously.

## 10. Particles (`src/render/particles.ts`)

One particle language: `drop` (round juicy droplet that leaves a fading
splat), `sparkle` (soft four-point twinkle), `puff` (soft air circle),
`seed` (tumbling teardrop), `bubble`. All round, soft, and short-lived — the
scene stays clean.

## 11. Layout

- Portrait first; adapts to any aspect ratio. Sizes derive from the viewport
  (`min(width·k, height·k)`), never fixed pixels.
- Safe areas respected via `env(safe-area-inset-*)` (notch, home indicator).
- The floor sits at 80% of usable height in every room, leaving room for one
  bottom dock on the floor.
- Chrome: back (top-left, rooms only) · sound (top-right, always) · optional
  dock (bottom-centre). That's it.

## 12. 3D rooms follow the same rules

Some toys (**pop**, **jelly**, **slice**, **soap**, **stack** and **peel**) are rendered in 3D with three.js. They must still
look like they came from the same shelf:

- **Same chrome.** Back + sound in the top bar, one bottom dock built from
  the shared `Segmented` / `iconButton`, sheets that rise from the dock, and
  one-time `Hint`s. No room-specific headers, fonts or readouts.
- **Same backdrop.** The 3D canvas is transparent and drawn over
  `paintBackdrop` with the room's pastel tint, plus `paintGrain`.
- **Same light & shadow.** One key light from the upper left; shadows use the
  app's warm cocoa shadow tone, never grey or black.
- **Same camera language.** A calm, raised view of an object on a table —
  from above for things you handle flat (jelly, ≈74° down), a three-quarter
  view for things with a shape to show (pop, ≈23° down; slice, ≈13° down
  at a fruit floating over its board). Big moments may
  swoop the camera (the pop dips low over the mess), then it eases back.
- **Same faces.** Faces are drawn with `render/face.ts` into a texture and
  painted inside the jelly, so expressions match every other toy.
- **Same fruit colours.** All fruit colours come from
  `design/fruitPalette.ts` — the watermelon in **pop** and in **jelly** is
  the same watermelon.
- **Same fruits.** **Pop** and **slice** use the same eight fruits, built
  the same way: one outline per fruit (`slice/fruits.ts`), one skin and
  insides shader (`render/fruitShader.ts`), and the same stems, leaves and
  tips (`slice/extras.ts`). Pop only adds how each one bursts. **Peel** uses
  them too, all but the dragon fruit, whose scales are real leaves.
- **Same chrome.** Rooms with orders or a number share theirs (`ui/order.ts`):
  the toast that says how it went, the count at the top, and the little words
  that rise off the toy. Soap's words stay right beside its bubble.
- **Fixed views.** A room's view keeps its size. Stack climbs instead of
  pulling back: past the top of the screen it rises one stone per stone set.
- **One rule per toy.** What breaks a peel is pace against the strip's width,
  and nothing random. Make such rules plain enough to explain in a sentence.
- **One rule of thumb for the shelf.** Only pop, jelly and slice show live 3D
  on their home cards. Every other card paints a cached sprite on the stage:
  each extra WebGL card costs the whole home screen frames on an iPhone.
- **Rules that can't glitch.** Stack has no physics engine: the tower is exactly
  what `stack/game.ts` says, and anything that tips off rolls away and shrinks,
  so there are never jittery piles.

## 13. Adding a room

1. Create `src/rooms/<name>/<Name>Room.ts` implementing `Scene`
   (`src/app/scene.ts`). Draw with `paintBackdrop` / `paintGrain`, light toys
   with `shade` / `gloss` / `contactShadow`, give them a `Face`.
2. Speak in `material.*` sounds and `haptics.play(word)`; if you need a new
   sound, add it to `sounds.ts` (in the shared scale) rather than the room.
3. Add a tiny live `Preview` for the home card.
4. Register it in `src/app/rooms.ts`. Navigation, transition, top bar, sound
   settings and haptics come for free. Give it a `blurb` there. The shelf (`.shelf` in `app.css`) is
   two across and four down: a ninth game needs a look at that grid, a `tile`
   colour in `tokens.ts`, and an entry in `home/scores.ts` if it keeps a best.
