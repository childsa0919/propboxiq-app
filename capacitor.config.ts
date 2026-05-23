import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the PropBox IQ iOS app.
 *
 * The iOS app ships the built React bundle (dist/public) inside the IPA and
 * talks to the production API at https://propboxiq.com/api/*.
 *
 * Bundle ID: com.propboxiq.app
 * App display name: PropBox IQ
 *
 * Server is intentionally NOT set to a remote URL — we ship the bundle locally
 * so that Apple sees a real native app (not just a thin web wrapper). The React
 * code talks to the live API via fetch(), with credentials configured per
 * platform in client/src/lib/queryClient.ts.
 */
const config: CapacitorConfig = {
  appId: "com.propboxiq.app",
  appName: "PropBox IQ",
  webDir: "dist/public",
  ios: {
    // Use the standard WKWebView. Hide the scroll bounce so it feels native.
    scrollEnabled: true,
    contentInset: "automatic",
    // Limit the bundle to HTTPS only (App Transport Security default).
    limitsNavigationsToAppBoundDomains: false,
  },
  server: {
    // Local-first: load bundle from app. Allow our API + OAuth providers.
    androidScheme: "https",
    iosScheme: "propboxiq",
    allowNavigation: [
      "propboxiq.com",
      "*.propboxiq.com",
      "accounts.google.com",
      "*.googleusercontent.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0a0e12",
      iosSpinnerStyle: "small",
      spinnerColor: "#5fd4e7",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0e12",
      overlaysWebView: false,
    },
  },
};

export default config;
