import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tandoproductions.skicoachai",
  appName: "Ski Coach AI",
  // Vite builds the web app here (see vite.config.ts).
  webDir: "dist/public",
  server: {
    iosScheme: "https",
  },
  ios: {
    // Pages handle the notch themselves with env(safe-area-inset-*).
    contentInset: "never",
  },
  plugins: {
    CapacitorSQLite: {
      // Keep the database out of the user-visible Documents folder.
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false,
    },
  },
};

export default config;
