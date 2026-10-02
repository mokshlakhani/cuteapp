import { Capacitor } from '@capacitor/core';

/**
 * Native shell niceties (iOS / Android via Capacitor). Everything here is
 * optional: on the web these calls are skipped.
 */
export async function setupNative(onBack: () => void) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
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
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    /* plugin missing */
  }
}
