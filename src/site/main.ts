/**
 * soft spot — the website's front page.
 *
 * Plain DOM, no framework, like the game. The page's words live in
 * index.html; this fills in what comes from the game itself (the toys, how to
 * play them, what you've kept) and wires up the bits you can touch.
 */
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-500.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import './site.css';

import { icons, type IconName } from '../design/icons';
import { TOYS, toy, playUrl, type Toy } from './toys';
import { readShelf } from './shelf';
import { setupPlayer } from './player';

document.documentElement.classList.add('js');

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/** Escape text for innerHTML. Everything shown comes from our own data, but keep it honest. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (name: IconName) => icons[name];

function fillIcons(root: ParentNode = document) {
  for (const node of $$('[data-icon]', root)) {
    const name = node.dataset.icon as IconName;
    if (icons[name] && !node.firstElementChild) node.innerHTML = icons[name];
  }
}

// ——— the toys ———

const tileStyle = (t: Toy) => `--face:${t.face};--edge-color:${t.edge};--focus:${t.focus}`;

function renderToys() {
  const list = $('[data-toys]');
  if (!list) return;
  list.innerHTML = TOYS.map(
    (t) => `
    <li class="reveal">
      <button class="toy" type="button" style="${tileStyle(t)}" data-toy="${t.id}" aria-haspopup="dialog" aria-label="${esc(`${t.name}: ${t.blurb}. How to play`)}">
        <span class="toy-window">
          <img src="${t.shot}" alt="" width="660" height="1429" loading="lazy" decoding="async" />
        </span>
        <span class="toy-plate">
          <span class="toy-name">${esc(t.name)}</span>
          <span class="toy-blurb">${esc(t.blurb)}</span>
          <span class="toy-meta">
            <span class="toy-tag">${icon(t.gesture)}${esc(t.controls)}</span>
            <span class="toy-tag">${icon('sparkle')}${esc(t.keeps)}</span>
          </span>
        </span>
      </button>
    </li>`,
  ).join('');
  list.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-toy]');
    if (btn) openToy(btn.dataset.toy!, btn);
  });
}

// ——— a toy, up close (deep-linkable as #toy-<id>) ———

const dialog = $<HTMLDialogElement>('[data-dialog]')!;
let returnFocus: HTMLElement | null = null;

function openToy(id: string, from?: HTMLElement) {
  const t = toy(id);
  if (!t || !dialog) return;
  returnFocus = from ?? null;
  const body = $('[data-dialog-body]', dialog)!;
  dialog.setAttribute('style', tileStyle(t));
  body.innerHTML = `
    <div class="dialog-art"><img src="${t.shot}" alt="${esc(`${t.name}, mid-play`)}" width="660" height="1429" /></div>
    <div class="dialog-body">
      <h2 id="toy-dialog-title">${esc(t.name)}</h2>
      <p class="dialog-blurb">${esc(t.blurb)}</p>
      <p class="dialog-goal">${esc(t.howto.goal)}</p>
      <div class="dialog-tags">
        <span class="toy-tag">${icon(t.gesture)}${esc(t.controls)}</span>
        <span class="toy-tag">${icon('sparkle')}${esc(t.keeps)}</span>
      </div>
      <h3>how to play</h3>
      <ol class="dialog-steps">${t.howto.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
      ${t.howto.tips.length ? `<h3>good to know</h3><ul class="dialog-tips">${t.howto.tips.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ul>` : ''}
      <div class="dialog-foot">
        <a class="btn btn-honey btn-big" href="${playUrl(t.id)}"><span class="btn-icon">${icon('press')}</span>play ${esc(t.name)}</a>
        <button class="btn btn-felt" type="button" data-dialog-close>back to the shelf</button>
      </div>
    </div>
    <button class="dialog-close" type="button" aria-label="close" autofocus data-dialog-close>${icon('close')}</button>`;
  if (!dialog.open) dialog.showModal();
  $('.dialog-body', dialog)?.scrollTo(0, 0);
  dialog.scrollTo?.(0, 0);
  const hash = `#toy-${t.id}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function setupDialog() {
  if (!dialog) return;
  dialog.addEventListener('click', (e) => {
    // A click on the backdrop (the dialog itself, outside its content) closes it.
    if (e.target === dialog || (e.target as Element).closest('[data-dialog-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (location.hash.startsWith('#toy-')) history.replaceState(null, '', '#toys');
    returnFocus?.focus({ preventScroll: true });
  });
  const fromHash = () => {
    const m = /^#toy-(\w+)$/.exec(location.hash);
    if (m && toy(m[1])) openToy(m[1], $<HTMLElement>(`[data-toy="${m[1]}"]`) ?? undefined);
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}

// ——— your shelf ———

function renderShelf() {
  const list = $('[data-kept]');
  const empty = $('[data-kept-empty]');
  if (!list || !empty) return;
  const rows = readShelf();
  list.innerHTML = rows
    .map((r) => {
      const t = toy(r.id)!;
      return `<li class="kept-item" style="${tileStyle(t)}">
        <span class="kept-game">${esc(r.game)}</span>
        <span class="kept-value">${r.value}</span>
        <span class="kept-unit">${esc(r.unit(r.value))}</span>
      </li>`;
    })
    .join('');
  list.hidden = rows.length === 0;
  empty.hidden = rows.length > 0;
}

function setupShelf() {
  renderShelf();
  // The game writes as you play: in the frame on this page, another tab, or before coming back.
  window.addEventListener('storage', (e) => e.key?.startsWith('softspot.') && renderShelf());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && renderShelf());
  window.addEventListener('pageshow', renderShelf);
}

// ——— install & share ———

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function setupInstall() {
  const btn = $<HTMLButtonElement>('[data-install]');
  if (!btn) return;
  let deferred: InstallPrompt | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
    if (outcome === 'accepted') toast('soft spot is on your home screen');
  });
  window.addEventListener('appinstalled', () => (btn.hidden = true));
}

function setupShare() {
  const btn = $<HTMLButtonElement>('[data-share]');
  if (!btn) return;
  const url = new URL('./', location.href).href;
  btn.addEventListener('click', async () => {
    const data = { title: 'soft spot', text: 'eight cozy toys to squish, pour, peel and pop', url };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('link copied · send it to someone nice');
    } catch {
      toast(url);
    }
  });
}

let toastTimer = 0;
function toast(text: string) {
  const el = $('[data-toast]');
  if (!el) return;
  el.textContent = text;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-shown'), 3200);
}

// ——— calm motion: things settle in once, and the nav firms up as you scroll ———

function setupReveal() {
  const items = $$('.reveal');
  // Siblings arrive one after another, a beat apart.
  for (const el of items) {
    const sibs = [...(el.parentElement?.children ?? [])].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--delay', `${Math.min(sibs.indexOf(el), 7) * 90}ms`);
  }
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}

function setupNav() {
  const nav = $('[data-nav]');
  if (!nav) return;
  let queued = false;
  const update = () => {
    queued = false;
    nav.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!queued) requestAnimationFrame(update);
      queued = true;
    },
    { passive: true },
  );
  update();

  // Light up the section you're reading.
  const links = new Map($$<HTMLAnchorElement>('.nav-links a').map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a, id) => a.classList.toggle('is-here', id === e.target.id));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  }
}

// ——— go ———

fillIcons();
renderToys();
fillIcons($('[data-toys]') ?? document);
setupDialog();
setupShelf();
setupInstall();
setupShare();
setupPlayer({ toast });
setupNav();
setupReveal();

// Offline, like the game: the worker sits beside the manifest at the site's root.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const manifest = $<HTMLLinkElement>('link[rel="manifest"]');
  const url = new URL('sw.js', manifest?.href ?? location.href);
  window.addEventListener('load', () => void navigator.serviceWorker.register(url).catch(() => {}));
}
