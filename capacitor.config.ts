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
      launchShowDuration: 600,
      launchFadeOutDuration: 300,
      backgroundColor: '#8A5799',
      showSpinner: false,
    },
  },
};

export default config;
