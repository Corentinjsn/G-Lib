import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ScanResult } from "../types";

/** Previous scan read straight off disk, so the grid can paint immediately. */
export const loadCachedLibrary = () =>
  invoke<ScanResult | null>("load_cached_library");

/** Re-read every launcher. */
export const scanLibrary = () => invoke<ScanResult>("scan_library");

/** Download any covers still missing, then hand back the library with art. */
export const fetchCovers = () => invoke<ScanResult>("fetch_covers");

export const launchGame = (id: string) => invoke<void>("launch_game", { id });

export const openInstallDir = (id: string) =>
  invoke<void>("open_install_dir", { id });

/** Cached art lives on disk and is served through Tauri's asset protocol. */
export const coverUrl = (path: string | null): string | null =>
  path ? convertFileSrc(path) : null;
