import { Capacitor } from '@capacitor/core';
import { meter } from './core/perf';

/**
 * Native shell niceties (iOS / Android via Capacitor). Everything here is
 * optional: on the web these calls are skipped.
 */
export async function setupNative(onBack: () => void, app: { ready: Promise<void>; rush: boolean }) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Both grounds are deep orchid, so the status bar is always light text.
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* plugin missing */
  }
  try {
    const { App } = await import('@capacitor/app');
    // Android back button: go home from a room, otherwise leave the app.
    App.addListener('backButton', ({ canGoBack }) => {
      const inRoom = document.querySelector('.topbar-back:not(.is-hidden)');
      if (inRoom) onBack();
      else if (!canGoBack) void App.exitApp();
    });
  } catch {
    /* plugin missing */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // Keep the launch screen up while every room is built (a few seconds at most):
    // then nothing is built, and no frame dropped, while you play.
    await Promise.race([app.ready, new Promise((resolve) => setTimeout(resolve, 4000))]);
    app.rush = false;
    meter.note(`launch screen held ${Math.round(performance.now())}ms`);
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    /* plugin missing */
  }
}
