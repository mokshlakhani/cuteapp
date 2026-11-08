/**
 * The phone in the hero: the real game, played right on the page.
 *
 * On a computer it loads the game (play/) in a frame inside the phone, only
 * when asked, so the front page stays light. On a phone or tablet a framed
 * phone inside a phone is cramped, so the same button opens the game full
 * screen instead.
 */
import { playUrl } from './toys';

/** Room enough, and a mouse: play in the frame. Otherwise go to the game's own page. */
const embedHere = () => matchMedia('(min-width: 901px) and (pointer: fine)').matches;

export function setupPlayer({ toast }: { toast: (text: string) => void }) {
  const root = document.querySelector<HTMLElement>('[data-player]');
  if (!root) return;
  const screen = root.querySelector<HTMLElement>('.device-screen')!;
  const start = root.querySelector<HTMLButtonElement>('[data-player-start]')!;
  const bar = root.querySelector<HTMLElement>('[data-player-bar]')!;
  const full = root.querySelector<HTMLButtonElement>('[data-player-full]')!;
  const stop = root.querySelector<HTMLButtonElement>('[data-player-stop]')!;
  let frame: HTMLIFrameElement | null = null;
  let slow = 0;

  const play = () => {
    if (!embedHere()) {
      location.href = playUrl();
      return;
    }
    if (frame) return;
    root.classList.add('is-loading');
    frame = document.createElement('iframe');
    frame.title = 'soft spot, the game';
    frame.src = playUrl();
    frame.allow = 'autoplay; fullscreen; vibrate';
    frame.setAttribute('allowfullscreen', '');
    // A slow connection: say so kindly rather than leave a spinner.
    slow = window.setTimeout(() => toast('still warming up · nearly there'), 8000);
    frame.addEventListener(
      'load',
      () => {
        clearTimeout(slow);
        // The game builds its rooms just after it loads; give it a breath before showing it.
        window.setTimeout(() => {
          root.classList.remove('is-loading');
          root.classList.add('is-playing');
          bar.hidden = false;
          frame?.focus();
        }, 500);
      },
      { once: true },
    );
    frame.addEventListener('error', () => {
      clearTimeout(slow);
      putAway();
      toast('the game didn’t load · try opening it in its own tab');
    });
    screen.append(frame);
  };

  const putAway = () => {
    clearTimeout(slow);
    frame?.remove();
    frame = null;
    root.classList.remove('is-loading', 'is-playing');
    bar.hidden = true;
    start.focus({ preventScroll: true });
  };

  const goFull = () => {
    const el = frame as (HTMLIFrameElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => (location.href = playUrl()));
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else location.href = playUrl();
  };

  // Say what the button will actually do here.
  const label = start.querySelector('span:last-child');
  const relabel = () => label && (label.textContent = embedHere() ? 'play right here' : 'tap to play');
  relabel();
  matchMedia('(min-width: 901px) and (pointer: fine)').addEventListener?.('change', relabel);

  start.addEventListener('click', play);
  stop.addEventListener('click', putAway);
  full.addEventListener('click', goFull);

  // The hero's own "play now" plays right here when it can.
  const heroPlay = document.querySelector<HTMLAnchorElement>('.hero [data-play]');
  heroPlay?.addEventListener('click', (e) => {
    if (!embedHere() || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    play();
  });
}
