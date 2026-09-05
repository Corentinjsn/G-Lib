import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Collection, ScanResult } from "../types";

/** Previous scan read straight off disk, so the grid can paint immediately. */
export const loadCachedLibrary = () =>
  invoke<ScanResult | null>("load_cached_library");

/** Re-read every launcher. */
export const scanLibrary = () => invoke<ScanResult>("scan_library");

/** Resolve owned Steam games and download any missing covers. */
export const fetchCatalog = () => invoke<ScanResult>("fetch_catalog");

/** Re-reads the session log without rescanning the launchers. */
export const refreshPlaytime = () => invoke<ScanResult>("refresh_playtime");

export const launchGame = (id: string) => invoke<void>("launch_game", { id });

export const openInstallDir = (id: string) =>
  invoke<void>("open_install_dir", { id });

/** Cached art lives on disk and is served through Tauri's asset protocol. */
export const coverUrl = (path: string | null): string | null =>
  path ? convertFileSrc(path) : null;

/* Every collection command answers with the whole list, so the frontend never
   has to guess what the file now holds. */

export const listCollections = () => invoke<Collection[]>("list_collections");

export const createCollection = (name: string) =>
  invoke<Collection[]>("create_collection", { name });

export const renameCollection = (id: string, name: string) =>
  invoke<Collection[]>("rename_collection", { id, name });

export const deleteCollection = (id: string) =>
  invoke<Collection[]>("delete_collection", { id });

export const setCollectionMembership = (
  id: string,
  gameId: string,
  member: boolean,
) => invoke<Collection[]>("set_collection_membership", { id, gameId, member });
