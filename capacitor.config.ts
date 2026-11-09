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
      // A fail-safe only: the page hides it itself once the rooms are built (see native.ts).
      // A first launch compiles every shader before the page can say so, which can take
      // several seconds; a short fail-safe would lift the splash onto a blank screen.
      launchShowDuration: 30000,
      launchFadeOutDuration: 300,
      backgroundColor: '#7E465B',
      showSpinner: false,
    },
  },
};

export default config;
