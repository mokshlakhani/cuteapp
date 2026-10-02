import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.softspot.toys',
  appName: 'soft spot',
  webDir: 'dist',
  backgroundColor: '#FBF6EE',
  ios: {
    contentInset: 'never',
    backgroundColor: '#FBF6EE',
  },
  android: {
    backgroundColor: '#FBF6EE',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchFadeOutDuration: 300,
      backgroundColor: '#FBF6EE',
      showSpinner: false,
    },
  },
};

export default config;
