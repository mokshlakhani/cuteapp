import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.softspot.toys',
  appName: 'soft spot',
  webDir: 'dist',
  backgroundColor: '#7A4A5C',
  ios: {
    contentInset: 'never',
    backgroundColor: '#7A4A5C',
  },
  android: {
    backgroundColor: '#7A4A5C',
  },
  plugins: {
    SplashScreen: {
      // A fail-safe: the page hides it itself, as soon as every room is built (see native.ts).
      launchShowDuration: 5000,
      launchFadeOutDuration: 300,
      backgroundColor: '#7A4A5C',
      showSpinner: false,
    },
  },
};

export default config;
