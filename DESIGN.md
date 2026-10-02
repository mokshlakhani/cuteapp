# soft spot — design system

> One calm little world containing a handful of interactive toys.
> Open → breathe → choose → play → get absorbed → feel satisfied → leave.

This document is the contract every room (current and future) follows. Rooms
inherit almost all of it automatically by using the shared modules; the
rest is a short list of rules.

---

## 1. Principles

1. **The toy is the star.** Chrome is small, soft and quiet. While playing,
   the screen shows the toy, a floor, and at most a back button, a sound
   button and one dock.
2. **Show, don't tell.** Home cards show each toy _alive_. Hints are one line,
   appear once, and leave as soon as you've done the thing.
3. **No pressure.** No scores, timers, coins, lives, streaks, badges or
   progress bars. Nothing can be failed. Every "ending" (a burst, a pile of
   jelly pieces) resets itself gently or with one tap.
4. **Feel over features.** When in doubt, make an existing interaction 20%
   more satisfying instead of adding something.
5. **Everything is alive.** Toys breathe, blink, wobble and look at your
   finger. Nothing is ever perfectly still.

## 2. Palette (`src/design/tokens.ts`)

| token                          | day                    | dusk                  | use                             |
| ------------------------------ | ---------------------- | --------------------- | ------------------------------- |
| `bg` / `bgDeep`                | `#FCF8F1` / `#F5ECDF`  | `#3A3346` / `#2C2737` | vertical background wash        |
| `surface`                      | `#FFFDF9`              | `#4A4258`             | buttons, cards, sheets          |
| `surfaceSunk`                  | `#F1E8DA`              | `#3A3347`             | tracks, wells                   |
| `ink` / `inkSoft` / `inkFaint` | warm cocoa `#5E4B42` … | warm cream …          | text & icons — never pure black |
| `shadowRgb`                    | `128,92,66`            | `16,10,26`            | every shadow is warm-tinted     |

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

- **Display:** Fredoka 500/600 — titles and card names. Rounded, friendly.
- **Text:** Nunito 600/700 — hints, toggles, small labels.
- All lowercase, short words: _soft spot_, _pop_, _jelly_, _fresh start_.
- Fonts are bundled locally (no network needed on device).

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
- Slow motion & screen shake are rare, short and gentle (burst only;
  ≤ 7 px, ~0.4 s).

## 8. Sound (`src/core/audio.ts`, `src/core/sounds.ts`, `src/core/music.ts`)

- **No audio files.** Everything is synthesised, so it's tiny and tunable.
- One signal path: every sound → warm high-shelf cut → gentle compressor,
  with a shared small, dark room reverb.
- **One scale.** Every pitched sound snaps to F-major pentatonic — the key
  the ambient music is in — so toys always harmonise with the music and with
  each other, even when mashed.
- Rooms speak a shared vocabulary rather than building sounds:
  `ui.tap/toggle/whoosh/sheet`, `material.boop/plop/thump/pop/sparkle`,
  elastic `twang/creak/burst`, jelly `squeak/snapBack/squish/slice`.
- Rate limits per word stop collisions from machine-gunning; voices are capped.
- Music: generative warm pads (Fmaj9 → Am7 → B♭maj9 → C6/9), rare soft bells,
  the odd piano note — ~20 dB under the toys, never loops audibly.
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

Some toys (like **jelly**) are rendered in 3D with three.js. They must still
look like they came from the same shelf:

- **Same chrome.** Back + sound in the top bar, one bottom dock built from
  the shared `Segmented` / `iconButton`, sheets that rise from the dock, and
  one-time `Hint`s. No room-specific headers, fonts or readouts.
- **Same backdrop.** The 3D canvas is transparent and drawn over
  `paintBackdrop` with the room's pastel tint, plus `paintGrain`.
- **Same light & shadow.** One key light from the upper left; shadows use the
  app's warm cocoa shadow tone, never grey or black.
- **Same camera language.** A calm top view (≈74° down), so the toy reads
  like an object on a table, the way 2D rooms read like a shelf.
- **Same faces.** Faces are drawn with `render/face.ts` into a texture and
  painted inside the jelly, so expressions match every other toy.
- **Same fruit colours.** All fruit colours come from
  `design/fruitPalette.ts` — the watermelon in **pop** and in **jelly** is
  the same watermelon.

## 13. Adding a room

1. Create `src/rooms/<name>/<Name>Room.ts` implementing `Scene`
   (`src/app/scene.ts`). Draw with `paintBackdrop` / `paintGrain`, light toys
   with `shade` / `gloss` / `contactShadow`, give them a `Face`.
2. Speak in `material.*` sounds and `haptics.play(word)`; if you need a new
   sound, add it to `sounds.ts` (in the shared scale) rather than the room.
3. Add a tiny live `Preview` for the home card.
4. Register it in `src/app/rooms.ts` (flip one of the sleeping `soon` slots
   to `awake: true`). Navigation, transition, top bar, sound settings and
   haptics come for free.
