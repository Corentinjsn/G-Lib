import { useCallback, useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdatePhase =
  | "checking"
  | "none"
  | "available"
  | "downloading"
  | "installed";

/**
 * Looks for a newer release once, at startup.
 *
 * A failed check is not surfaced: it means no endpoint, no network, or a dev
 * build, none of which the user can act on. Only a failure *during* an install
 * they asked for is worth reporting.
 */
export function useUpdate(onError: (message: string) => void) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("checking");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await check();
        if (cancelled) return;
        setUpdate(found);
        setPhase(found ? "available" : "none");
      } catch {
        if (!cancelled) setPhase("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setPhase("downloading");
    setProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
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
    }
  }, [update, onError]);

  return {
    phase,
    version: update?.version ?? null,
    notes: update?.body ?? null,
    progress,
    install,
  };
}
