"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget wake ping: Render's free tier parks the web service after
 * ~15 min idle, and waking takes 30-60s. Pinging /api/health on page load
 * starts the boot while the user is still reading, instead of on first
 * interaction. keepalive lets the request outlive the page.
 */
export default function WakePing() {
  useEffect(() => {
    fetch("/api/health", { method: "GET", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
