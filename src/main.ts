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
