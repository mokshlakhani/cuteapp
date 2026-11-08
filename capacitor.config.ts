import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.softspot.toys',
  appName: 'soft spot',
  webDir: 'dist-app',
  backgroundColor: '#7E465B',
  ios: {
    contentInset: 'never',
    backgroundColor: '#7E465B',
  },
  android: {
    backgroundColor: '#7E465B',
  },
  plugins: {
    SplashScreen: {
      // A fail-safe: the page hides it itself, as soon as every room is built (see native.ts).
      launchShowDuration: 5000,
      launchFadeOutDuration: 300,
      backgroundColor: '#7E465B',
      showSpinner: false,
    },
  },
};

export default config;
