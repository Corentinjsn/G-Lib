import { normalize } from "./format";
import type {
  Collection,
  Game,
  InstallFilter,
  Selection,
  SortKey,
} from "../types";

/**
 * Turning the library into what the grid shows.
 *
 * Pulled out of the component because it is the densest logic in the app and
 * the part most likely to be wrong: four filters compose in an order that
 * matters, and none of it needs React to be exercised.
 */
export interface View {
  installFilter: InstallFilter;
  selection: Selection;
  collections: Collection[];
  query: string;
  sort: SortKey;
}

/**
 * The set a view draws from, before any filter.
 *
 * Hidden games are absent from everything but the view that lists them, so
 * this comes first: it decides which universe exists at all.
 */
export function universe(games: Game[], selection: Selection): Game[] {
  return selection.kind === "hidden"
    ? games.filter((game) => game.hidden)
    : games.filter((game) => !game.hidden);
}

export function inInstallFilter(game: Game, filter: InstallFilter): boolean {
  return filter === "all" ? true : game.installed === (filter === "installed");
}

export function inSelection(
  game: Game,
  selection: Selection,
  collections: Collection[],
): boolean {
  switch (selection.kind) {
    case "favorites":
      return game.favorite;
    // The hidden view is already the whole universe by this point.
    case "hidden":
      return true;
    case "platform":
      return game.platform === selection.platform;
    case "collection": {
      const list = collections.find((entry) => entry.id === selection.id);
      return list?.gameIds.includes(game.id) ?? false;
    }
    default:
      return true;
  }
}

export function matchesQuery(game: Game, query: string): boolean {
  const needle = normalize(query.trim());
  return needle === "" || normalize(game.name).includes(needle);
}

export function compareGames(a: Game, b: Game, sort: SortKey): number {
  switch (sort) {
    case "lastPlayed":
      // Never-played titles sink below everything with a timestamp.
      return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
    case "playtime":
      return (b.playtimeSeconds ?? 0) - (a.playtimeSeconds ?? 0);
    case "size":
      return (b.sizeOnDisk ?? 0) - (a.sizeOnDisk ?? 0);
    default:
      return a.name.localeCompare(b.name, "fr");
  }
}

/** Everything above, in the order that matters. Never mutates its input. */
export function selectGames(games: Game[], view: View): Game[] {
  return universe(games, view.selection)
    .filter(
      (game) =>
        inInstallFilter(game, view.installFilter) &&
        inSelection(game, view.selection, view.collections) &&
        matchesQuery(game, view.query),
    )
    .sort((a, b) => compareGames(a, b, view.sort));
}

export interface InstallCounts {
  installed: number;
  all: number;
  notInstalled: number;
}

/** Counted over visible games only: hidden ones are not part of any total. */
export function installCounts(games: Game[]): InstallCounts {
  const visible = games.filter((game) => !game.hidden);
  const installed = visible.filter((game) => game.installed).length;
  return {
    installed,
    all: visible.length,
    notInstalled: visible.length - installed,
  };
}

/* ------------------------------------------------------------------ palette */

/**
 * How well a name answers a query, lower being better.
 *
 * Three tiers rather than a fuzzy score: a launcher's job is to put the title
 * you are already thinking of under the cursor, and titles you know are typed
 * from their start. A points-based fuzzy match would let a scattering of
 * letters outrank a clean prefix, which is exactly the surprise you cannot
 * afford when Enter launches immediately.
 */
export function paletteRank(name: string, needle: string): number | null {
  const haystack = normalize(name);
  const index = haystack.indexOf(needle);
  if (index < 0) return null;
  if (index === 0) return 0;
  // A word start: "ring" should find "Elden Ring", but "ing" should not rank
  // it above a title that opens with those letters.
  return /[\s:_\-–—.'"([]/.test(haystack[index - 1]) ? 1 : 2;
}

/**
 * The palette's results: the whole library, installed first.
 *
 * Deliberately ignores the sidebar — the palette is the way to reach a game
 * you cannot see, so a filter chosen minutes ago must not hide it. Hidden
 * games stay hidden: that flag is a decision about the library, not a view.
 */
export function searchPalette(
  games: Game[],
  query: string,
  limit = 40,
): Game[] {
  const needle = normalize(query.trim());
  const pool = games.filter((game) => !game.hidden);

  const ranked = needle
    ? pool.flatMap((game) => {
        const rank = paletteRank(game.name, needle);
        return rank === null ? [] : [{ game, rank }];
      })
    : // An empty field is the "resume something" case, so it offers what was
      // played most recently rather than the alphabet.
      pool.map((game) => ({ game, rank: 0 }));

  ranked.sort((a, b) => {
    if (a.game.installed !== b.game.installed) return a.game.installed ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    const played = (b.game.lastPlayed ?? 0) - (a.game.lastPlayed ?? 0);
    if (played !== 0) return played;
    return a.game.name.localeCompare(b.game.name, "fr");
  });

  return ranked.slice(0, needle ? limit : 8).map((entry) => entry.game);
}
