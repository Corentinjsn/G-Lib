import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCovers, loadCachedLibrary, scanLibrary } from "../lib/api";
import type { ScanResult } from "../types";

type Status = "idle" | "scanning" | "fetching-covers";

/**
 * Owns the library. Paints the cached scan first, then refreshes from the
 * launchers, then fills in any missing cover art -- each step replacing the
 * grid in place so the window is never blank while work is happening.
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

      setStatus("fetching-covers");
      setResult(await fetchCovers());
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

  return { result, status, error, refresh };
}
