import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { coverUrl } from "../lib/api";
import { searchPalette } from "../lib/library";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Game } from "../types";
import { KbdHint } from "./Kbd";
import { PlatformIcon } from "./PlatformIcon";

interface Props {
  games: Game[];
  onLaunch: (game: Game) => void;
  onClose: () => void;
}

/** A cover at list size, falling back to the platform's colour. */
function Thumb({ game }: { game: Game }) {
  const [broken, setBroken] = useState(false);
  const art = broken ? null : coverUrl(game.coverPath);

  return (
    <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-3">
      {art ? (
        <img
          src={art}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className={`h-full w-full object-cover ${
            game.installed ? "" : "opacity-50 saturate-50"
          }`}
        />
      ) : (
        <span
          className="block h-full w-full"
          style={{ background: `${PLATFORM_COLORS[game.platform]}33` }}
        />
      )}
    </span>
  );
}

/**
 * The launcher, reduced to what it is for.
 *
 * The grid is for browsing; this is for the case where you already know what
 * you want to play. It floats above the application on purpose: it answers
 * over the whole library, so binding it to the sidebar's current filter would
 * make the fastest path the one that hides half your games.
 *
 * Highlight and selection stay separate here — the arrows walk the results
 * without opening the detail panel, which is what lets Enter mean "play this"
 * from the first keystroke.
 */
export function Palette({ games, onLaunch, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchPalette(games, query), [games, query]);
  // The reset below only lands after the render that shortened the list, so the
  // highlight is clamped here as well: Enter must never fire on a stale index.
  const index = Math.min(active, Math.max(0, results.length - 1));

  // Every keystroke rebuilds the list, so the highlight goes back to the top:
  // holding it in place would leave it pointing at a game that has scrolled
  // out from under it.
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Wraps, because a palette is a short ring: reaching the end and pressing
      // down again should not simply stop.
      setActive((current) => (current + step + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onLaunch(results[index]);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-center bg-black/50 pt-[14vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Rechercher un jeu"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="palette-in flex h-fit max-h-[68vh] w-[min(34rem,90vw)] flex-col overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl shadow-black/70"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          {/* Drawn rather than typed: the U+2315 glyph falls back to whatever
              face has it and lands off the baseline at this size. */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-4 shrink-0 text-ink-faint"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Lancer un jeu…"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {results.length > 0 ? (
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {results.map((game, position) => (
              <li key={game.id}>
                <button
                  type="button"
                  data-index={position}
                  // Pointer and keyboard drive the same highlight, so the two
                  // never disagree about what Enter would launch.
                  onMouseMove={() => setActive(position)}
                  onClick={() => {
                    onLaunch(game);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                    position === index ? "bg-surface-3" : ""
                  }`}
                >
                  <Thumb game={game} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        game.installed ? "text-ink" : "text-ink-muted"
                      }`}
                    >
                      {game.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <PlatformIcon
                        platform={game.platform}
                        className="size-3"
                      />
                      {PLATFORM_LABELS[game.platform]}
                      {!game.installed && <span>· à installer</span>}
                    </span>
                  </span>
                  {game.favorite && (
                    <span className="text-[13px] text-yellow-400">★</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-ink-faint">
            Aucun jeu ne correspond.
          </p>
        )}

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px]">
          <KbdHint keys={["↑", "↓"]} label="parcourir" />
          <KbdHint keys={["↵"]} label="lancer" />
          <KbdHint keys={["esc"]} label="fermer" />
        </div>
      </div>
    </div>
  );
}
