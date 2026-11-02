import '@fontsource/lilita-one/latin-400.css';
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
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Debug/testing handle (harmless in production).
(window as unknown as { softspot: App }).softspot = app;
