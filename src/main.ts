import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import './styles/app.css';

import { App } from './app/App';
import { ROOMS } from './app/rooms';
import { HomeScene } from './rooms/home/HomeScene';
import { Capacitor } from '@capacitor/core';
import { setupNative } from './native';

// Feel like an app, not a page: no pinch or double-tap zoom (iOS ignores
// user-scalable=no), no long-press menus, no dragging images out.
for (const type of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu', 'dragstart'])
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });

const host = document.getElementById('app')!;
const app = new App(host, ROOMS, (nav) => new HomeScene(nav, ROOMS));
// On a phone the launch screen covers building every room (see App.ready).
app.rush = Capacitor.isNativePlatform();
app.start();
// `?room=soap` opens a room straight away, for tuning and testing.
const first = new URLSearchParams(location.search).get('room');
if (first) setTimeout(() => app.go(first), 800);
setupNative(() => app.home(), app);

// On the web, cache the game so it opens offline once added to the home screen.
// The worker sits beside the manifest at the site's root, where the game lives.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const root = manifest?.href ?? location.href;
  const url = new URL('sw.js', root);
  let reg: ServiceWorkerRegistration | null = null;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(url, { updateViaCache: 'none' })
      .then((r) => (reg = r))
      .catch(() => {});
  });

  // A home-screen app on iPhone is usually resumed, not reloaded, so it could sit
  // on an old build for weeks. Each time it comes back into view, ask the server
  // which build is current and quietly reload if this one is out of date.
  const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  let lastCheck = 0;
  const checkForNewBuild = async () => {
    if (!mine || Date.now() - lastCheck < 30_000) return;
    lastCheck = Date.now();
    void reg?.update().catch(() => {});
    try {
      const html = await (await fetch(new URL('./', root), { cache: 'no-store' })).text();
      const src = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)?.[1];
      if (src && new URL(src, root).href !== mine) location.reload();
    } catch {
      // Offline: keep playing what's here.
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForNewBuild();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void checkForNewBuild();
  });
}

// Debug/testing handle (harmless in production).
(window as unknown as { softspot: App }).softspot = app;
