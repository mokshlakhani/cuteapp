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
app.start();
setupNative(() => app.home());

// On the web, cache the game so it opens offline once added to the home screen.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Debug/testing handle (harmless in production).
(window as unknown as { softspot: App }).softspot = app;
