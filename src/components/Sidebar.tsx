import { useEffect, useState, type MouseEvent } from "react";
import { formatAgo } from "../lib/format";
import {
  INSTALL_FILTERS,
  INSTALL_FILTER_LABELS,
  PLATFORMS,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  SORT_LABELS,
  selectionKey,
  type Collection,
  type Game,
  type InstallFilter,
  type ScanError,
  type Selection,
  type SortKey,
} from "../types";
import { SEARCH_INPUT_ID } from "../hooks/useGridKeys";
import { Kbd } from "./Kbd";
import { PlatformIcon } from "./PlatformIcon";

interface Props {
  /** Already narrowed by the install filter, so counts match what is shown. */
  games: Game[];
  /** Every visible game, ignoring the install filter. Lets a list report how
      many of its members the current view is leaving out. */
  unscopedGames: Game[];
  collections: Collection[];
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
  selectedGameId: string | null;
  onSelectGame: (game: Game) => void;
  onGameContextMenu: (game: Game, event: MouseEvent) => void;
  onCollectionContextMenu: (
    collection: Collection,
    event: MouseEvent,
  ) => void;
  onNewCollection: () => void;
  installFilter: InstallFilter;
  onInstallFilterChange: (filter: InstallFilter) => void;
  installCounts: Record<InstallFilter, number>;
  query: string;
  onQueryChange: (query: string) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  syncing: boolean;
  onSync: () => void;
  /** Unix epoch seconds of the last completed sync, if any. */
  syncedAt: number | null;
  errors: ScanError[];
  /** Total hidden games, counted outside the current view. */
  hiddenCount: number;
  /** Set only when a newer release is waiting. */
  updateVersion: string | null;
  updateDownloading: boolean;
  updateProgress: number;
  onInstallUpdate: () => void;
}

/**
 * Re-renders once a minute so the sync stamp does not sit on "à l'instant"
 * for an app that has been open all afternoon.
 */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
}

function SectionLabel({
  children,
  action,
}: {
  children: string;
  action?: { label: string; title: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between px-2.5 pt-4 pb-1">
      <span className="text-[10px] tracking-widest text-ink-faint uppercase">
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          title={action.title}
          aria-label={action.title}
          className="rounded px-1 text-sm leading-none text-ink-faint transition hover:text-ink"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** A filter row that can also unfold to reveal the games it holds. */
function GroupRow({
  label,
  count,
  active,
  title,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
  icon,
}: {
  label: string;
  count: string;
  active: boolean;
  title?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onContextMenu?: (event: MouseEvent) => void;
  /** Drawn beside the label: a store is its mark. */
  icon?: Game["platform"];
}) {
  return (
    <div
      className={`flex items-center rounded-md transition ${
        active ? "bg-surface-3 text-ink" : "text-ink-muted hover:bg-surface-2"
      }`}
    >
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Replier" : "Déplier"}
          className="w-5 shrink-0 py-1.5 text-[9px] text-ink-faint transition hover:text-ink"
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={onContextMenu}
        title={title}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2.5 text-left text-sm hover:text-ink"
      >
        {icon && (
          <span style={{ color: PLATFORM_COLORS[icon] }}>
            <PlatformIcon platform={icon} className="size-4" />
          </span>
        )}
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs tabular-nums text-ink-faint">{count}</span>
      </button>
    </div>
  );
}

function GameRow({
  game,
  active,
  onSelect,
  onContextMenu,
}: {
  game: Game;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={game.name}
      className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 pl-7 text-left text-[13px] transition ${
        active
          ? "bg-surface-3 text-ink"
          : game.installed
            ? "text-ink-muted hover:bg-surface-2 hover:text-ink"
            : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
      }`}
    >
      <span className="truncate">{game.name}</span>
      {!game.installed && (
        <span className="ml-auto shrink-0 text-[10px] text-ink-faint">↓</span>
      )}
    </button>
  );
}

export function Sidebar({
  unscopedGames,
  games,
  collections,
  selection,
  onSelectionChange,
  selectedGameId,
  onSelectGame,
  onGameContextMenu,
  onCollectionContextMenu,
  onNewCollection,
  installFilter,
  onInstallFilterChange,
  installCounts,
  query,
  onQueryChange,
  sort,
  onSortChange,
  syncing,
  onSync,
  syncedAt,
  errors,
  hiddenCount,
  updateVersion,
  updateDownloading,
  updateProgress,
  onInstallUpdate,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useMinuteTick();
  const lastSync = formatAgo(syncedAt);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const active = selectionKey(selection);
  const byPlatform = (platform: Game["platform"]) =>
    games.filter((game) => game.platform === platform);
  const inCollection = (collection: Collection) =>
    games.filter((game) => collection.gameIds.includes(game.id));

  const gameRows = (list: Game[]) =>
    list.map((game) => (
      <GameRow
        key={game.id}
        game={game}
        active={game.id === selectedGameId}
        onSelect={() => onSelectGame(game)}
        onContextMenu={(event) => onGameContextMenu(game, event)}
      />
    ));

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface-1">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-2xl leading-none font-semibold tracking-tight text-ink">
            Gamlib
          </h1>
          <span className="text-[10px] text-ink-faint">v{__APP_VERSION__}</span>
        </div>

        <div className="relative">
          <input
            id={SEARCH_INPUT_ID}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Rechercher…"
            className="peer w-full rounded-md border border-line bg-surface-2 py-1.5 pr-9 pl-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          {/* Hidden once the field is in use: the hint has done its job. */}
          {query === "" && (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 peer-focus:hidden">
              <Kbd>/</Kbd>
            </span>
          )}
        </div>

        {/* Owned games outnumber installed ones several times over, so this
            decides what the whole sidebar is about. */}
        <div className="flex rounded-md border border-line bg-surface-2 p-0.5">
          {INSTALL_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => onInstallFilterChange(filter)}
              title={`${INSTALL_FILTER_LABELS[filter]} — ${installCounts[filter]} jeux`}
              className={`flex-1 rounded px-1 py-1 text-[11px] font-medium transition ${
                installFilter === filter
                  ? "bg-surface-3 text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {INSTALL_FILTER_LABELS[filter]}
            </button>
          ))}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <GroupRow
          label="Tous les jeux"
          count={String(games.length)}
          active={active === "all"}
          onSelect={() => onSelectionChange({ kind: "all" })}
        />
        <GroupRow
          label="Favoris"
          count={String(games.filter((game) => game.favorite).length)}
          active={active === "favorites"}
          onSelect={() => onSelectionChange({ kind: "favorites" })}
        />
        {/* Only worth a row once something is actually hidden: it is the one
            view that reaches games every other view leaves out. */}
        {hiddenCount > 0 && (
          <GroupRow
            label="Masqués"
            count={String(hiddenCount)}
            active={active === "hidden"}
            onSelect={() => onSelectionChange({ kind: "hidden" })}
          />
        )}

        <SectionLabel
          action={{
            label: "＋",
            title: "Nouvelle liste",
            onClick: onNewCollection,
          }}
        >
          Mes listes
        </SectionLabel>

        {collections.length === 0 ? (
          <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-faint">
            Aucune liste. Clic droit sur un jeu pour l'ajouter à une nouvelle
            liste.
          </p>
        ) : (
          collections.map((collection) => {
            const key = `collection:${collection.id}`;
            const members = inCollection(collection);
            // A list of games the current filter excludes would otherwise read
            // as empty, with nothing to say why.
            const total = unscopedGames.filter((game) =>
              collection.gameIds.includes(game.id),
            ).length;
            const partial = members.length !== total;
            return (
              <div key={collection.id}>
                <GroupRow
                  label={collection.name}
                  count={
                    partial ? `${members.length} / ${total}` : String(total)
                  }
                  title={
                    partial
                      ? `${total} jeux dans cette liste, ${members.length} dans la vue actuelle`
                      : undefined
                  }
                  active={active === key}
                  expanded={expanded.has(key)}
                  onToggle={() => toggle(key)}
                  onSelect={() =>
                    onSelectionChange({ kind: "collection", id: collection.id })
                  }
                  onContextMenu={(event) =>
                    onCollectionContextMenu(collection, event)
                  }
                />
                {expanded.has(key) && gameRows(members)}
              </div>
            );
          })
        )}

        <SectionLabel>Plateformes</SectionLabel>

        {PLATFORMS.map((platform) => {
          const key = `platform:${platform}`;
          const list = byPlatform(platform);
          if (list.length === 0) return null;
          return (
            <div key={platform}>
              <GroupRow
                // Nommée ici, contrairement aux badges de la grille : une
                // barre de navigation se lit ligne à ligne, et le nom écrit
                // vaut mieux qu'un logo à deviner.
                label={PLATFORM_LABELS[platform]}
                count={String(list.length)}
                active={active === key}
                expanded={expanded.has(key)}
                onToggle={() => toggle(key)}
                onSelect={() => onSelectionChange({ kind: "platform", platform })}
                icon={platform}
              />
              {expanded.has(key) && gameRows(list)}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 border-t border-line p-4">
        {/* Discreet on purpose: a release found mid-session interrupts nothing,
            so it announces itself in a pill rather than a banner. */}
        {updateVersion && (
          <button
            type="button"
            onClick={onInstallUpdate}
            disabled={updateDownloading}
            title={`Installe la version ${updateVersion} et relance l'application.`}
            className="relative mx-auto flex items-center gap-1.5 overflow-hidden rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/25 disabled:cursor-progress"
          >
            {updateDownloading && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-accent/25 transition-[width] duration-200"
                style={{ width: `${Math.round(updateProgress * 100)}%` }}
              />
            )}
            <span className="relative leading-none">↓</span>
            <span className="relative">
              {updateDownloading
                ? `${Math.round(updateProgress * 100)} %`
                : `Mise à jour ${updateVersion}`}
            </span>
          </button>
        )}

        <label className="flex items-center gap-2">
          <span className="text-[10px] tracking-widest text-ink-faint uppercase">
            Tri
          </span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className="flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {errors.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2.5">
            {errors.map((error) => (
              <li key={error.platform} className="text-[11px] leading-snug">
                <span className="font-medium text-ink-muted">
                  {PLATFORM_LABELS[error.platform]}
                </span>
                <span className="text-ink-faint"> — {error.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            title="La synchronisation se fait aussi automatiquement à chaque démarrage."
            className="w-full rounded-md border border-line bg-surface-2 py-2 text-sm text-ink-muted transition hover:border-accent hover:text-ink disabled:cursor-progress disabled:opacity-60"
          >
            {syncing ? "Synchronisation…" : "Sync"}
          </button>
          {lastSync && !syncing && (
            <p className="text-center text-[10px] text-ink-faint">
              Dernière sync {lastSync}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
