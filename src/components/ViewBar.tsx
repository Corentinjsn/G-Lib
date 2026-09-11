import { SEARCH_INPUT_ID } from "../hooks/useGridKeys";
import {
  INSTALL_FILTERS,
  INSTALL_FILTER_LABELS,
  PLATFORMS,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  SORT_LABELS,
  type InstallFilter,
  type Platform,
  type SortKey,
} from "../types";
import { PlatformIcon } from "./PlatformIcon";

interface Props {
  count: number;
  scopeLabel: string;
  /** Text for the scan in progress, or null when idle. */
  status: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  installFilter: InstallFilter;
  onInstallFilterChange: (filter: InstallFilter) => void;
  installCounts: Record<InstallFilter, number>;
  /** La boutique d'origine, ou null pour toutes. */
  platform: Platform | null;
  onPlatformChange: (platform: Platform | null) => void;
  /** Combien de jeux chaque boutique apporte, dans l'ensemble courant. */
  platformCounts: Record<Platform, number>;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
}

/**
 * What is shown, and how.
 *
 * These used to sit in the sidebar, which answers a different question: the
 * sidebar picks the set -- favourites, a list, a store -- while these three
 * decide how that set is filtered and ordered. Controls belong over the thing
 * they change, so they moved onto the grid.
 */
export function ViewBar({
  count,
  scopeLabel,
  status,
  query,
  onQueryChange,
  installFilter,
  onInstallFilterChange,
  installCounts,
  platform,
  onPlatformChange,
  platformCounts,
  sort,
  onSortChange,
}: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
      <span className="shrink-0 text-sm text-ink-muted">
        {count} {count > 1 ? "jeux" : "jeu"}
        <span className="text-ink-faint"> · {scopeLabel}</span>
      </span>

      {status && (
        <span className="truncate text-xs text-ink-faint">{status}</span>
      )}

      <div className="relative ml-auto w-56 shrink-0">
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filtrer…"
          aria-label="Filtrer la grille"
          className="w-full rounded-md border border-line bg-surface-2 py-1.5 pr-8 pl-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        {/* Ce champ filtre la grille ; le lancement rapide appartient à la
            palette, donc le slot ne porte que la sortie de recherche. */}
        {query !== "" && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Effacer le filtre"
            title="Effacer le filtre"
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-sm leading-none text-ink-faint transition hover:bg-surface-3 hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* Owned games outnumber installed ones several times over, so this
          decides what the whole grid is about. */}
      <div className="flex shrink-0 rounded-md border border-line bg-surface-2 p-0.5">
        {INSTALL_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onInstallFilterChange(filter)}
            title={`${INSTALL_FILTER_LABELS[filter]} — ${installCounts[filter]} jeux`}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
              installFilter === filter
                ? "bg-surface-3 text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {INSTALL_FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      {/* Les marques plutot que les noms : quatre boutons nommes prendraient
          la moitie de la barre, et un logo se reconnait plus vite qu'un mot a
          cette taille. Un second clic sur la meme boutique revient a toutes,
          ce qui evite un bouton « Toutes » de plus. */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
        {PLATFORMS.map((entry) => {
          const active = platform === entry;
          const count = platformCounts[entry];
          return (
            <button
              key={entry}
              type="button"
              disabled={count === 0 && !active}
              onClick={() => onPlatformChange(active ? null : entry)}
              aria-pressed={active}
              title={
                active
                  ? `${PLATFORM_LABELS[entry]} — tout afficher`
                  : `${PLATFORM_LABELS[entry]} — ${count} jeux`
              }
              className={`flex size-7 items-center justify-center rounded transition disabled:opacity-30 ${
                active ? "bg-surface-3" : "hover:bg-surface-3"
              }`}
              style={{
                color: active ? PLATFORM_COLORS[entry] : undefined,
              }}
            >
              <span className={active ? "" : "text-ink-muted"}>
                <PlatformIcon platform={entry} className="size-4" />
              </span>
            </button>
          );
        })}
      </div>

      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortKey)}
        aria-label="Trier"
        title="Trier"
        className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
      >
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </header>
  );
}
