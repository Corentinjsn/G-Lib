import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { coverUrl } from "../lib/api";
import { normalize } from "../lib/format";
import { searchPalette } from "../lib/library";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Game } from "../types";
import { KbdHint } from "./Kbd";
import { PlatformIcon } from "./PlatformIcon";

/** One entry of the second level: what can be done to the highlighted game. */
export interface PaletteAction {
  label: string;
  /** Shown as a star rather than a tick, matching the covers. */
  star?: boolean;
  checked?: boolean;
  /** Drawn in red; the caller is expected to place these last. */
  danger?: boolean;
  /** Toggles stay on the list so their effect is visible where it happened. */
  keepOpen?: boolean;
  run: () => void;
}

interface Props {
  games: Game[];
  actionsFor: (game: Game) => PaletteAction[];
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

function SearchIcon() {
  return (
    // Drawn rather than typed: the U+2315 glyph falls back to whatever face
    // has it and lands off the baseline at this size.
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
 *
 * Tab opens a second level on the highlighted game. Everything the right-click
 * menu offers lives there, so the things done occasionally — uninstalling,
 * filing a game under a list — stop being the one errand that sends you back
 * to the mouse.
 */
export function Palette({ games, actionsFor, onLaunch, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [actionQuery, setActionQuery] = useState("");
  const [actionActive, setActionActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchPalette(games, query), [games, query]);

  // Resolved from the live library rather than held as an object, so a
  // favourite toggled from the action list shows up in it at once.
  const target = useMemo(
    () =>
      targetId ? (games.find((game) => game.id === targetId) ?? null) : null,
    [games, targetId],
  );

  const actions = useMemo(
    () => (target ? actionsFor(target) : []),
    [target, actionsFor],
  );

  // The field keeps working at the second level: with a dozen lists to file a
  // game under, typing three letters beats arrowing down to one.
  const shownActions = useMemo(() => {
    const needle = normalize(actionQuery.trim());
    return needle
      ? actions.filter((action) => normalize(action.label).includes(needle))
      : actions;
  }, [actions, actionQuery]);

  // Both resets below only land after the render that shortened their list, so
  // the highlight is clamped here too: Enter must never fire on a stale index.
  const index = Math.min(active, Math.max(0, results.length - 1));
  const actionIndex = Math.min(
    actionActive,
    Math.max(0, shownActions.length - 1),
  );

  // Every keystroke rebuilds the list, so the highlight goes back to the top:
  // holding it in place would leave it pointing at a game that has scrolled
  // out from under it.
  useEffect(() => setActive(0), [query]);
  useEffect(() => setActionActive(0), [actionQuery, targetId]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${target ? actionIndex : index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, actionIndex, target]);

  const leaveActions = () => {
    setTargetId(null);
    setActionQuery("");
  };

  const runAction = (action: PaletteAction) => {
    action.run();
    // A toggle leaves the list up, and leaves the field alone, so the row it
    // was run from stays under the highlight with its new state showing —
    // pressing Enter again undoes it. Anything else has done its job and the
    // palette gets out of the way.
    if (!action.keepOpen) onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Tab moves between the two levels rather than between focusable elements:
    // the palette has exactly one field, so the browser's own use for the key
    // would go nowhere.
    if (event.key === "Tab") {
      event.preventDefault();
      if (target) leaveActions();
      else if (results.length > 0) setTargetId(results[index].id);
      return;
    }

    if (target) {
      // Escape backs out one level at a time: the way in was two steps, so the
      // way out should not throw the search away in one.
      if (event.key === "Escape") {
        event.preventDefault();
        leaveActions();
        return;
      }
      if (shownActions.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActionActive(
          (current) =>
            (current + step + shownActions.length) % shownActions.length,
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        runAction(shownActions[actionIndex]);
      }
      return;
    }

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
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          {target ? (
            // Names the game every action below applies to; clicking it is the
            // way back for anyone who arrived here with the mouse.
            <button
              type="button"
              onClick={leaveActions}
              title="Revenir à la recherche"
              className="flex max-w-[14rem] shrink-0 items-center gap-1.5 rounded-md bg-surface-3 py-1 pr-2.5 pl-1.5 text-xs text-ink transition hover:bg-surface-2"
            >
              <span className="text-ink-faint">←</span>
              <span className="truncate">{target.name}</span>
            </button>
          ) : (
            <SearchIcon />
          )}
          <input
            autoFocus
            type="text"
            value={target ? actionQuery : query}
            onChange={(event) =>
              (target ? setActionQuery : setQuery)(event.target.value)
            }
            placeholder={target ? "Action…" : "Lancer un jeu…"}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {target ? (
          shownActions.length > 0 ? (
            <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {shownActions.map((action, position) => (
                <li key={action.label}>
                  <button
                    type="button"
                    data-index={position}
                    onMouseMove={() => setActionActive(position)}
                    onClick={() => runAction(action)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      position === actionIndex ? "bg-surface-3" : ""
                    } ${action.danger ? "text-red-400" : "text-ink"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {action.label}
                    </span>
                    {action.star !== undefined && (
                      <span
                        className={
                          action.star ? "text-yellow-400" : "text-ink-faint"
                        }
                      >
                        {action.star ? "★" : "☆"}
                      </span>
                    )}
                    {action.checked !== undefined && action.checked && (
                      <span className="text-accent">✓</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">
              Aucune action ne correspond.
            </p>
          )
        ) : results.length > 0 ? (
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
          {target ? (
            <>
              <KbdHint keys={["↵"]} label="valider" />
              <KbdHint keys={["⇥"]} label="retour" />
            </>
          ) : (
            <>
              <KbdHint keys={["↵"]} label="lancer" />
              <KbdHint keys={["⇥"]} label="actions" />
              <KbdHint keys={["esc"]} label="fermer" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
