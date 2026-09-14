import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { fetchCatalog, loadCachedLibrary, scanLibrary } from "../lib/api";
import type { ScanResult } from "../types";

type Status = "idle" | "scanning" | "fetching-catalog";

/** Where the network half of a sync is, as the backend reports it. */
export interface CatalogProgress {
  stage: "catalog" | "covers";
  done: number;
  total: number;
}

/**
 * Floor between two focus-driven rescans. Alt-tabbing is frequent and a scan
 * touches a few dozen files; once every ten seconds is plenty to catch a game
 * installed or removed while the window was away.
 */
const FOCUS_RESCAN_GAP_MS = 10_000;

/**
 * Owns the library. Paints the cached scan first, then refreshes from the
 * launchers on disk, then goes to the network for the owned Steam catalogue
 * and any missing cover art -- each step replacing the grid in place, so the
 * window is never blank while work is happening.
 *
 * After that it keeps itself current: the backend watches the launchers'
 * directories and pushes a new library whenever one changes, and coming back
 * to the window triggers a scan, which is what covers the two stores that live
 * in the registry instead of in files.
 */
export function useLibrary() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  /* No cached library means nothing has ever been scanned on this machine.
     Unknown (null) until the cache has been read. */
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<CatalogProgress | null>(null);
  const running = useRef(false);
  const lastScan = useRef(0);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      setStatus("scanning");
      setResult(await scanLibrary());
      lastScan.current = Date.now();

      setStatus("fetching-catalog");
      setResult(await fetchCatalog());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setStatus("idle");
      setProgress(null);
      running.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached = await loadCachedLibrary();
        if (!cancelled) {
          if (cached) setResult(cached);
          setFirstRun(!cached);
        }
      } catch {
        // A missing or unreadable cache is normal on first run.
        if (!cancelled) setFirstRun(true);
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // A game installed or removed while the window was in the background is the
  // usual case, and the two registry-based stores have no watcher.
  useEffect(() => {
    const onFocus = () => {
      if (running.current) return;
      const now = Date.now();
      if (now - lastScan.current < FOCUS_RESCAN_GAP_MS) return;
      lastScan.current = now;
      // Deliberately without touching `status`: an indicator flashing on every
      // alt-tab would be worse than the silence.
      void scanLibrary()
        .then(setResult)
        .catch(() => {
          // The next sync will carry whatever this missed.
        });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // And while the window is in front, the watcher pushes the change straight
  // through: a game uninstalled elsewhere simply loses its card.
  useEffect(() => {
    const stop = listen<ScanResult>("library-changed", (event) => {
      lastScan.current = Date.now();
      setResult(event.payload);
    });
    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const stop = listen<CatalogProgress>("catalog-progress", (event) =>
      setProgress(event.payload),
    );
    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, []);

  return {
    result,
    status,
    error,
    firstRun,
    progress,
    refresh,
    applyResult: setResult,
  };
}
