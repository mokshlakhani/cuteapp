import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.softspot.toys',
  appName: 'soft spot',
  webDir: 'dist',
  backgroundColor: '#EECDB4',
  ios: {
    contentInset: 'never',
    backgroundColor: '#EECDB4',
  },
  android: {
    backgroundColor: '#EECDB4',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchFadeOutDuration: 300,
      backgroundColor: '#EECDB4',
      showSpinner: false,
    },
  },
};

export default config;
