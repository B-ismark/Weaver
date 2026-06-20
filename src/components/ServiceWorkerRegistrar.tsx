"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (/sw.js) after mount. Client-only, renders
 * nothing. Kept tiny and isolated so the rest of the tree stays server-rendered.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return; // avoid caching during dev
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("SW registration failed:", err));
  }, []);

  return null;
}
