import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tandoproductions.skicoachai',
  appName: 'Ski Coach AI',
  webDir: 'dist',
  server: {
    iosScheme: 'https',
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#FAFAFA"
    }
  }
};

export default config;
