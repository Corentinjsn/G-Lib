/** Mirror of `src-tauri/src/models.rs`. Keep the two in step. */

export type Platform = "steam" | "epic" | "ea" | "ubisoft";

export interface Game {
  id: string;
  platform: Platform;
  platformId: string;
  name: string;
  /** Present on disk and launchable, as opposed to owned and installable. */
  installed: boolean;
  installDir: string | null;
  sizeOnDisk: number | null;
  lastPlayed: number | null;
  /** Seconds played, as measured by GAMLIB itself. */
  playtimeSeconds: number | null;
  coverPath: string | null;
  coverUrls: string[];
  /** Launches the game, or installs it. The backend decides which. */
  actionUri: string;
}

export interface ScanError {
  platform: Platform;
  message: string;
}

/** A user-made list. A game may belong to any number of them. */
export interface Collection {
  id: string;
  name: string;
  gameIds: string[];
}

/** What the grid is currently showing. */
export type Selection =
  | { kind: "all" }
  | { kind: "platform"; platform: Platform }
  | { kind: "collection"; id: string };

export const ALL_SELECTION: Selection = { kind: "all" };

/** Stable key for a selection, used for comparison and for expanded state. */
export function selectionKey(selection: Selection): string {
  switch (selection.kind) {
    case "platform":
      return `platform:${selection.platform}`;
    case "collection":
      return `collection:${selection.id}`;
    default:
      return "all";
  }
}

export interface ScanResult {
  games: Game[];
  errors: ScanError[];
  scannedAt: number;
}

export const PLATFORMS: Platform[] = ["steam", "epic", "ea", "ubisoft"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  steam: "Steam",
  epic: "Epic Games",
  ea: "EA",
  ubisoft: "Ubisoft",
};

/** Accent per store, used for badges, dots and placeholder art. */
export const PLATFORM_COLORS: Record<Platform, string> = {
  steam: "#66c0f4",
  epic: "#cbd5e1",
  ea: "#ff6b4a",
  ubisoft: "#2f7bff",
};

export type SortKey = "name" | "lastPlayed" | "playtime" | "size";

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Nom",
  lastPlayed: "Dernière session",
  playtime: "Temps de jeu",
  size: "Taille",
};

/**
 * Owned games outnumber installed ones several times over, so the grid opens
 * on what can actually be played and the rest is one click away.
 */
export type InstallFilter = "installed" | "all" | "notInstalled";

export const INSTALL_FILTERS: InstallFilter[] = [
  "installed",
  "all",
  "notInstalled",
];

export const INSTALL_FILTER_LABELS: Record<InstallFilter, string> = {
  installed: "Installés",
  all: "Tous",
  notInstalled: "À installer",
};
