import {
  PLATFORMS,
  PLATFORM_LABELS,
  SORT_LABELS,
  type Platform,
  type ScanError,
  type SortKey,
} from "../types";
import { PlatformDot } from "./PlatformBadge";

interface Props {
  counts: Record<Platform, number>;
  total: number;
  platform: Platform | null;
  onPlatformChange: (platform: Platform | null) => void;
  query: string;
  onQueryChange: (query: string) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  scanning: boolean;
  onRefresh: () => void;
  errors: ScanError[];
}

function FilterRow({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: Platform;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
        active
          ? "bg-surface-3 text-ink"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {dot ? <PlatformDot platform={dot} /> : <span className="size-2" />}
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="text-xs tabular-nums text-ink-faint">{count}</span>
    </button>
  );
}

export function Sidebar({
  counts,
  total,
  platform,
  onPlatformChange,
  query,
  onQueryChange,
  sort,
  onSortChange,
  scanning,
  onRefresh,
  errors,
}: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-line bg-surface-1 p-4">
      <div className="flex items-baseline gap-2">
        <h1 className="font-display text-2xl leading-none font-semibold tracking-tight text-ink">
          Gamlib
        </h1>
        <span className="text-[10px] text-ink-faint">v0.1</span>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Rechercher…"
        className="w-full rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />

      <nav className="flex flex-col gap-0.5">
        <FilterRow
          label="Tous les jeux"
          count={total}
          active={platform === null}
          onClick={() => onPlatformChange(null)}
        />
        {PLATFORMS.map((entry) => (
          <FilterRow
            key={entry}
            label={PLATFORM_LABELS[entry]}
            count={counts[entry]}
            active={platform === entry}
            dot={entry}
            onClick={() => onPlatformChange(entry)}
          />
        ))}
      </nav>

      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] tracking-widest text-ink-faint uppercase">
          Trier par
        </span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-auto flex flex-col gap-3">
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

        <button
          type="button"
          onClick={onRefresh}
          disabled={scanning}
          className="w-full rounded-md border border-line bg-surface-2 py-2 text-sm text-ink-muted transition hover:border-accent hover:text-ink disabled:cursor-progress disabled:opacity-60"
        >
          {scanning ? "Analyse en cours…" : "Réanalyser"}
        </button>
      </div>
    </aside>
  );
}
