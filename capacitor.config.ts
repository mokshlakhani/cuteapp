import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.softspot.toys',
  appName: 'soft spot',
  webDir: 'dist',
  backgroundColor: '#8A5799',
  ios: {
    contentInset: 'never',
    backgroundColor: '#8A5799',
  },
  android: {
    backgroundColor: '#8A5799',
  },
  plugins: {
    SplashScreen: {
      // A fail-safe: the page hides it itself, as soon as every room is built (see native.ts).
      launchShowDuration: 5000,
      launchFadeOutDuration: 300,
      backgroundColor: '#8A5799',
      showSpinner: false,
    },
  },
};

export default config;
