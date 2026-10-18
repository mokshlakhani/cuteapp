import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.softspot.toys',
  appName: 'soft spot',
  webDir: 'dist',
  backgroundColor: '#EFE5D7',
  ios: {
    contentInset: 'never',
    backgroundColor: '#EFE5D7',
  },
  android: {
    backgroundColor: '#EFE5D7',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchFadeOutDuration: 300,
      backgroundColor: '#EFE5D7',
      showSpinner: false,
    },
  },
};

export default config;
