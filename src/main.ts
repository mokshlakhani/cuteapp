import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './styles/app.css';

import { App } from './app/App';
import { ROOMS } from './app/rooms';
import { HomeScene } from './rooms/home/HomeScene';
import { setupNative } from './native';

const host = document.getElementById('app')!;
const app = new App(host, ROOMS, (nav) => new HomeScene(nav, ROOMS));
app.start();
setupNative(() => app.home());

// Debug/testing handle (harmless in production).
(window as unknown as { softspot: App }).softspot = app;
