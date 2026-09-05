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
