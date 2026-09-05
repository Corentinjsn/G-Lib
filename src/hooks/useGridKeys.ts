import { useEffect, type RefObject } from "react";
import type { Game } from "../types";

/** Id of the sidebar search field, so `/` can reach it from anywhere. */
export const SEARCH_INPUT_ID = "library-search";

interface Options {
  games: Game[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLaunch: (game: Game) => void;
  onToggleFavorite: (game: Game) => void;
  /** Raises the launch palette, or dismisses it; bound to `/` and Ctrl+K. */
  onTogglePalette: () => void;
  /** The scroll container holding the grid, used to count its columns. */
  gridRef: RefObject<HTMLElement | null>;
  /** Suspended while a menu or dialog owns the keyboard. */
  enabled: boolean;
}

/**
 * How many cards sit on a row right now.
 *
 * The grid is `auto-fill`, so the count depends on the window width and is only
 * knowable from the resolved style -- there is no column number to read off the
 * component.
 */
function columnCount(container: HTMLElement | null): number {
  const grid = container?.querySelector<HTMLElement>("[data-game-grid]");
  if (!grid) return 1;
  const template = getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, template.split(" ").filter(Boolean).length);
}

/**
 * Arrow keys through the grid, Enter to play, `/` to search.
 *
 * A launcher is something you reach for quickly; having to aim at a cover with
 * the mouse every time is the slow path.
 */
export function useGridKeys({
  games,
  selectedId,
  onSelect,
  onLaunch,
  onToggleFavorite,
  onTogglePalette,
  gridRef,
  enabled,
}: Options) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      // Ctrl+K reaches the palette from anywhere, including from inside a
      // field: it is the one shortcut that must never be swallowed. Pressed
      // again it puts the palette away, so the same key undoes itself.
      if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onTogglePalette();
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
        onTogglePalette();
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
      if ((event.key === "f" || event.key === "F") && index >= 0) {
        event.preventDefault();
        onToggleFavorite(games[index]);
        return;
      }

      const columns = columnCount(gridRef.current);
      const step: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: columns,
        ArrowUp: -columns,
      };

      let next: number | null = null;
      if (event.key in step) {
        // With nothing selected, the first key press lands on the first card
        // rather than jumping into the middle of the grid.
        next = index < 0 ? 0 : index + step[event.key];
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = games.length - 1;
      }

      if (next === null) return;
      event.preventDefault();
      const clamped = Math.min(Math.max(next, 0), games.length - 1);
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
    onTogglePalette,
    gridRef,
    enabled,
  ]);
}
