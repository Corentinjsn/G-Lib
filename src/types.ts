/** Mirror of `src-tauri/src/models.rs`. Keep the two in step. */

export type Platform = "steam" | "epic" | "ea" | "ubisoft";

export interface Game {
  id: string;
  platform: Platform;
  platformId: string;
  name: string;
  installDir: string;
  sizeOnDisk: number | null;
  lastPlayed: number | null;
  coverPath: string | null;
  launchUri: string;
}

export interface ScanError {
  platform: Platform;
  message: string;
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

export type SortKey = "name" | "lastPlayed" | "size";

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Nom",
  lastPlayed: "Dernière session",
  size: "Taille",
};
