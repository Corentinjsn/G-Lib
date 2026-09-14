import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  Collection,
  MarketItem,
  Offers,
  Platform,
  ScanResult,
  Shelf,
} from "../types";

/** Previous scan read straight off disk, so the grid can paint immediately. */
export const loadCachedLibrary = () =>
  invoke<ScanResult | null>("load_cached_library");

/** Re-read every launcher. */
export const scanLibrary = () => invoke<ScanResult>("scan_library");

/** Resolve owned Steam games and download any missing covers. */
export const fetchCatalog = () => invoke<ScanResult>("fetch_catalog");

/** Re-reads the session log without rescanning the launchers. */
export const refreshPlaytime = () => invoke<ScanResult>("refresh_playtime");

/** Cherche un jeu a acheter, chez Steam faute d'autre catalogue public. */
export const searchMarket = (query: string) =>
  invoke<MarketItem[]>("search_market", { query });

/** The store's front page. Cached for half an hour by the backend. */
export const marketHome = () => invoke<Shelf[]>("market_home");

/**
 * Ce que le meme jeu coute ailleurs.
 *
 * Quatre requetes de plus, dont deux lisent une page entiere : reserve a la
 * fiche ouverte, jamais lance pour toute une liste de resultats. L'appid sert
 * au comparateur, qui n'a alors aucun titre a deviner.
 */
export const storeOffers = (name: string, appid: number | null) =>
  invoke<Offers>("store_offers", { name, appid });

/**
 * Ouvre une page de boutique dans le navigateur.
 *
 * Le backend n'accepte que les hotes qu'il connait : c'est lui qui decide, pas
 * l'adresse qu'on lui tend.
 */
export const openStoreUrl = (url: string) =>
  invoke<void>("open_store_url", { url });

/** Opens where a store takes a game key. The backend picks the target. */
export const openRedeem = (store: Platform) =>
  invoke<void>("open_redeem", { store });

/**
 * Montre la fenetre principale et ferme celle du demarrage.
 *
 * C'est le frontend qui decide du moment : lui seul sait si la grille a de
 * quoi se peindre.
 */
export const finishSplash = () => invoke<void>("finish_splash");

export const launchGame = (id: string) => invoke<void>("launch_game", { id });

/** Hands the game to its launcher's uninstall flow. */
export const uninstallGame = (id: string) =>
  invoke<void>("uninstall_game", { id });

export const openInstallDir = (id: string) =>
  invoke<void>("open_install_dir", { id });

/** Cached art lives on disk and is served through Tauri's asset protocol. */
export const coverUrl = (path: string | null): string | null =>
  path ? convertFileSrc(path) : null;

/* Every collection command answers with the whole list, so the frontend never
   has to guess what the file now holds. */

/* Per-game marks. Like the collection commands, each answers with the whole
   library so the grid never has to guess. */

export const setGameFlag = (gameId: string, name: string, value: boolean) =>
  invoke<ScanResult>("set_game_flag", { gameId, name, value });

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
