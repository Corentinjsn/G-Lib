import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCatalog,
  loadCachedLibrary,
  refreshPlaytime,
  scanLibrary,
} from "../lib/api";
import type { ScanResult } from "../types";

type Status = "idle" | "scanning" | "fetching-catalog";

/**
 * Owns the library. Paints the cached scan first, then refreshes from the
 * launchers on disk, then goes to the network for the owned Steam catalogue
 * and any missing cover art -- each step replacing the grid in place, so the
 * window is never blank while work is happening.
 */
export function useLibrary() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      setStatus("scanning");
      setResult(await scanLibrary());

      setStatus("fetching-catalog");
      setResult(await fetchCatalog());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setStatus("idle");
      running.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached = await loadCachedLibrary();
        if (cached && !cancelled) setResult(cached);
      } catch {
        // A missing or unreadable cache is normal on first run.
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Coming back to the window is exactly when a play session has just ended,
  // and re-reading the session log is far cheaper than a full sync.
  useEffect(() => {
    const onFocus = () => {
      if (running.current) return;
      void refreshPlaytime()
        .then(setResult)
        .catch(() => {
          // Nothing scanned yet; the next sync will carry the sessions.
        });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return { result, status, error, refresh, applyResult: setResult };
}
