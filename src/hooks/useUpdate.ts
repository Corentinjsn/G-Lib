import { useCallback, useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdatePhase =
  | "checking"
  | "none"
  | "available"
  | "downloading"
  | "installed";

/**
 * How often to look again while the application is open. Releases are not
 * frequent enough to warrant more, and each check is a request to GitHub.
 */
const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Keeping the application up to date.
 *
 * The two moments are treated differently on purpose. At startup nothing is
 * lost by updating straight away, so it happens without asking and the splash
 * reports it. Once the library is on screen the user is in the middle of
 * something, so a later release is announced with a button and installed only
 * when they say so.
 *
 * A failed check stays silent: no endpoint, no network or a dev build, none of
 * which the user can act on. Only a failure during an install they triggered
 * is worth reporting.
 */
export function useUpdate(onError: (message: string) => void) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("checking");
  const [progress, setProgress] = useState(0);
  const busy = useRef(false);

  const download = useCallback(
    async (target: Update) => {
      if (busy.current) return;
      busy.current = true;
      setPhase("downloading");
      setProgress(0);
      try {
        let downloaded = 0;
        let total = 0;
        await target.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              total = event.data.contentLength ?? 0;
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              if (total > 0) setProgress(downloaded / total);
              break;
            case "Finished":
              setProgress(1);
              break;
          }
        });
        setPhase("installed");
        await relaunch();
      } catch (cause) {
        onError(`Mise à jour impossible : ${cause}`);
        setPhase("available");
      } finally {
        busy.current = false;
      }
    },
    [onError],
  );

  // First look, before anything is on screen: install it there and then.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await check();
        if (cancelled) return;
        setUpdate(found);
        if (found) {
          await download(found);
        } else {
          setPhase("none");
        }
      } catch {
        if (!cancelled) setPhase("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [download]);

  // Later looks, while the application is in use: announce, never interrupt.
  useEffect(() => {
    const timer = setInterval(() => {
      if (busy.current) return;
      void check()
        .then((found) => {
          if (!found) return;
          setUpdate(found);
          setPhase("available");
        })
        .catch(() => {
          // Same silence as the first check.
        });
    }, RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return {
    phase,
    version: update?.version ?? null,
    notes: update?.body ?? null,
    progress,
    install: () => (update ? download(update) : Promise.resolve()),
  };
}
