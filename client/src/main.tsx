import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hideSplash, runningInApp } from "@/lib/native";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Tag the root element so CSS can target the native iOS shell specifically.
if (runningInApp()) {
  document.documentElement.classList.add("is-native-ios");
}

createRoot(document.getElementById("root")!).render(<App />);

// Hide the native splash once React mounts. Small delay so the first paint
// has actually happened.
if (runningInApp()) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      void hideSplash();
    }, 80);
  });
}

// Register PWA service worker — production web only. Skip inside the iOS app
// (the bundle is already local; SW just adds cache complexity for no win).
if ("serviceWorker" in navigator && import.meta.env.PROD && !runningInApp()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Silent — PWA enhancement, not critical to app function
      });
  });
}
