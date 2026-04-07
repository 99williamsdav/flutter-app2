import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flutterbot.profittracker',
  appName: 'Flutterbot Profit Tracker',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
