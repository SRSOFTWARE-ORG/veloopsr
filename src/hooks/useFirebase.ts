import { useEffect, useRef } from "react";
import { initAnalytics, initPerformance, initRemoteConfig } from "@/lib/firebase";

/**
 * Initializes Firebase services (Analytics, Performance, Remote Config).
 * Call once at app root level.
 */
export function useFirebaseInit() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Don't init in iframe/preview contexts
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const isPreview =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");

    if (isInIframe || isPreview) return;

    // Init all services in parallel
    Promise.allSettled([
      initAnalytics(),
      initRemoteConfig(),
    ]).then((results) => {
      console.log("[Firebase] Services initialized", results.map(r => r.status));
    });

    // Performance is synchronous init
    initPerformance();
  }, []);
}
