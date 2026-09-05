import { useEffect, useRef, type RefObject } from "react";
import { gridMotion } from "../lib/keys";
import type { Game } from "../types";

/** Id of the sidebar search field, so it can be reached from anywhere. */
export const SEARCH_INPUT_ID = "library-search";

interface Options {
  games: Game[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLaunch: (game: Game) => void;
  onToggleFavorite: (game: Game) => void;
  /** Raises the launch palette; bound to `/` and Ctrl+K. */
  onOpenPalette: () => void;
  /** The palette owns Ctrl+K and the arrows while it is up. */
  paletteOpen: boolean;
  /** The scroll container holding the grid, used to measure it. */
  gridRef: RefObject<HTMLElement | null>;
  /** Suspended while a menu or dialog owns the keyboard. */
  enabled: boolean;
}

/**
 * How the grid is laid out right now.
 *
 * It is `auto-fill`, so neither the column count nor the number of rows on
 * screen is knowable from the component -- both have to be read back from the
 * resolved layout.
 */
function measure(container: HTMLElement | null): {
  columns: number;
  rows: number;
} {
  const grid = container?.querySelector<HTMLElement>("[data-game-grid]");
  if (!grid || !container) return { columns: 1, rows: 1 };

  const template = getComputedStyle(grid).gridTemplateColumns;
  const columns = Math.max(1, template.split(" ").filter(Boolean).length);

  const card = grid.firstElementChild;
  const cardHeight = card ? card.getBoundingClientRect().height : 0;
  const rows =
    cardHeight > 0
      ? Math.max(1, Math.floor(container.clientHeight / cardHeight))
      : 1;

  return { columns, rows };
}

/**
 * Arrow keys through the grid, Enter to play, `/` to search.
 *
 * A launcher is something you reach for quickly; having to aim at a cover with
 * the mouse every time is the slow path. The Neovim motions sit alongside the
 * arrows rather than replacing them -- see `lib/keys`.
 */
export function useGridKeys({
  games,
  selectedId,
  onSelect,
  onLaunch,
  onToggleFavorite,
  onOpenPalette,
  paletteOpen,
  gridRef,
  enabled,
}: Options) {
  // Survives renders because `gg` spans two key presses, and must not cause
  // one of its own: nothing on screen depends on a half-typed motion.
  const pendingG = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      // Ctrl+K reaches the palette from anywhere, including from inside a
      // field. While the palette is up the key belongs to it, where it moves
      // the highlight the way it does in a Neovim picker.
      if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        if (paletteOpen) return;
        event.preventDefault();
        onOpenPalette();
        return;
      }

      if (typing) {
        // Escape leaves a field rather than being swallowed by it.
        if (event.key === "Escape") target?.blur();

        // Type, then Enter, then playing: that sequence is the whole point of
        // a launcher, and it has to work without ever leaving the search box.
        if (target?.id === SEARCH_INPUT_ID && games.length > 0) {
          if (event.key === "Enter") {
            event.preventDefault();
            onSelect(games[0].id);
            onLaunch(games[0]);
          }
          // Down arrow steps out of the field into the results, so the search
          // is a way in to the grid rather than a dead end.
          if (event.key === "ArrowDown") {
            event.preventDefault();
            target.blur();
            onSelect(games[0].id);
          }
        }
        return;
      }
      if (!enabled) return;

      // `/` used to focus the sidebar field, which searched only what the
      // current filter allowed. It opens the palette instead: the fast path to
      // a game should not depend on where you happen to be standing.
      if (event.key === "/") {
        event.preventDefault();
        onOpenPalette();
        return;
      }

      if (games.length === 0) return;
      const index = games.findIndex((game) => game.id === selectedId);

      if (event.key === "Enter" && index >= 0) {
        event.preventDefault();
        onLaunch(games[index]);
        return;
      }

      // Marking favourites is a sorting pass over a whole library: doing it
      // from the keyboard while arrowing through the grid beats aiming at a
      // star on every cover.
      if (
        (event.key === "f" || event.key === "F") &&
        !event.ctrlKey &&
        index >= 0
      ) {
        event.preventDefault();
        onToggleFavorite(games[index]);
        return;
      }

      const { columns, rows } = measure(gridRef.current);
      const motion = gridMotion(
        { key: event.key, ctrl: event.ctrlKey || event.metaKey },
        { index, count: games.length, columns, rows, pendingG: pendingG.current },
      );

      // Whatever followed the `g` has now spent it, motion or not.
      const wasPending = pendingG.current;
      pendingG.current = motion?.kind === "await-g";
      if (motion?.kind === "await-g") {
        event.preventDefault();
        return;
      }
      if (!motion) {
        // `g` followed by anything else is an unknown motion, not two keys:
        // the second one is swallowed rather than acted on alone.
        if (wasPending) event.preventDefault();
        return;
      }

      event.preventDefault();
      const clamped = Math.min(Math.max(motion.to, 0), games.length - 1);
      const game = games[clamped];
      onSelect(game.id);
      document
        .querySelector(`[data-game-id="${CSS.escape(game.id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    games,
    selectedId,
    onSelect,
    onLaunch,
    onToggleFavorite,
    onOpenPalette,
    paletteOpen,
    gridRef,
    enabled,
  ]);
}
