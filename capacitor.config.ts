import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flutterbot.profittracker',
  appName: 'FlutterBot Profit Tracker',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
