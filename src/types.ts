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
  /** Seconds played, as measured by G-Lib itself. */
  playtimeSeconds: number | null;
  /** The launcher reports a pending update for this installed game. */
  needsUpdate: boolean;
  /** Handed to the launcher's uninstall flow. Absent where the store
      publishes none. */
  uninstall: string | null;
  /** Marked by the user, not by any scanner. */
  favorite: boolean;
  /** Kept out of every view but the one that lists hidden games. */
  hidden: boolean;
  coverPath: string | null;
  coverUrls: string[];
  /** Launches the game, or installs it. The backend decides which. */
  actionUri: string;
  /**
   * Ce que le jeu fait en ce moment.
   *
   * `launching` couvre le temps ou le launcher se reveille : le clic est
   * parti, aucun processus n'existe encore, et c'est precisement la fenetre
   * pendant laquelle un second clic lancerait le jeu deux fois.
   */
  activity: "idle" | "launching" | "running";
  /**
   * Les autres exemplaires du meme jeu, sur d'autres boutiques.
   *
   * Pose par l'interface, jamais par le backend : la bibliotheque reste une
   * liste plate d'entrees, une par boutique, et c'est la vue qui les replie
   * en une seule carte. Les marques, les listes et les raccourcis continuent
   * donc de designer une entree precise par son id.
   */
  duplicates?: Game[];
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

/**
 * L'ensemble que la grille montre.
 *
 * La plateforme n'en fait pas partie : elle n'est pas un ensemble mais une
 * facette, au meme titre que « installes ». On veut ses favoris Steam, ou les
 * jeux Epic d'une liste — ce qu'une selection unique ne permettait pas.
 */
export type Selection =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "hidden" }
  | { kind: "collection"; id: string };

export const ALL_SELECTION: Selection = { kind: "all" };

/** Stable key for a selection, used for comparison and for expanded state. */
export function selectionKey(selection: Selection): string {
  return selection.kind === "collection"
    ? `collection:${selection.id}`
    : selection.kind;
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

/* La boutique. Miroir de `src-tauri/src/market.rs`. */

export interface MarketPrice {
  /** Deja formate par Steam dans la monnaie du pays. */
  current: string;
  /** Prix barre, present seulement pendant une remise. */
  original: string | null;
  discount: number;
}

export interface MarketItem {
  /** `steam:2369390` ou `igdb:7360` : les deux catalogues numerotent chacun
      de leur cote. */
  id: string;
  /** Absent pour un jeu que Steam ne vend pas. */
  appid: number | null;
  name: string;
  coverUrl: string | null;
  headerUrl: string | null;
  shortDescription: string | null;
  developers: string[];
  publishers: string[];
  /** Date de sortie Steam, en secondes epoch. */
  releaseDate: number | null;
  comingSoon: boolean;
  free: boolean;
  price: MarketPrice | null;
  screenshots: string[];
  /** La page Steam du jeu, quand il y en a une. */
  storeUrl: string | null;
  /** Set when the item comes from another store's promotions: `price` is
      then that store's price, not Steam's. */
  deal: MarketDeal | null;
}

export interface MarketDeal {
  store: Platform;
  url: string | null;
}

/** One row of the store's front page. */
export interface Shelf {
  id: string;
  title: string;
  store: Platform | null;
  state: "ready" | "empty" | "needsKey" | "unavailable";
  items: MarketItem[];
}

/** Ce que le meme jeu coute chez une autre boutique. */
export interface StoreOffer {
  /** Le meme identifiant que `StoreLink.id`. */
  store: string;
  price: MarketPrice | null;
  /** Page du jeu, quand la boutique l'a nommee. */
  url: string | null;
}

/** Une boutique que l'application ne nomme pas d'elle-meme. */
export interface ShopDeal {
  /** Le nom que la boutique porte chez IsThereAnyDeal. */
  shop: string;
  price: MarketPrice;
  url: string | null;
}

export interface Offers {
  /** Les cinq boutiques que la fiche nomme. */
  stores: StoreOffer[];
  /** Les autres : GOG, Fanatical, Humble… la moins chere en tete. */
  elsewhere: ShopDeal[];
  historyLow: string | null;
  /** Vrai quand le comparateur a repondu. */
  aggregated: boolean;
}

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
