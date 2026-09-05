import { useState, type MouseEvent } from "react";
import { coverUrl } from "../lib/api";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Game } from "../types";
import { PlatformBadge } from "./PlatformBadge";

interface Props {
  game: Game;
  selected: boolean;
  onSelect: () => void;
  onLaunch: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onToggleFavorite: () => void;
}

/**
 * A game with no art anywhere gets a tinted placeholder built from its own
 * store's accent colour, rather than an empty box.
 */
function CoverPlaceholder({ game }: { game: Game }) {
  const accent = PLATFORM_COLORS[game.platform];
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center"
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, ${accent}26 0%, transparent 60%), linear-gradient(160deg, #1c2230 0%, #0f131b 100%)`,
      }}
    >
      <span className="line-clamp-4 text-sm leading-snug font-semibold text-ink">
        {game.name}
      </span>
      <span
        className="text-[10px] tracking-widest uppercase"
        style={{ color: accent }}
      >
        {PLATFORM_LABELS[game.platform]}
      </span>
    </div>
  );
}

export function GameCard({
  game,
  selected,
  onSelect,
  onLaunch,
  onContextMenu,
  onToggleFavorite,
}: Props) {
  const [artBroken, setArtBroken] = useState(false);
  const art = artBroken ? null : coverUrl(game.coverPath);

  return (
    <div
      data-game-id={game.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onLaunch}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === "Enter") onLaunch();
        if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      title={game.name}
      className={`group relative aspect-[2/3] cursor-pointer overflow-hidden rounded-lg bg-surface-2 outline-none ring-offset-2 ring-offset-surface-0 transition duration-150 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? "ring-2 ring-accent" : ""
      }`}
    >
      {/* Owned but absent: dimmed and desaturated, so a glance at the grid
          separates what can be played from what would need downloading. */}
      <div
        className={
          game.installed
            ? "h-full w-full"
            : "h-full w-full opacity-45 saturate-50 transition group-hover:opacity-70 group-hover:saturate-100"
        }
      >
        {art ? (
          <img
            src={art}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setArtBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <CoverPlaceholder game={game} />
        )}
      </div>

      <div className="absolute top-1.5 left-1.5">
        <PlatformBadge platform={game.platform} />
      </div>

      {/* Marking a favourite is frequent enough to deserve the cover itself,
          rather than a trip through the context menu. Filled stars stay on
          show; the empty one only appears under the pointer. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={game.favorite ? "Retirer des favoris" : "Mettre en favori"}
        title={game.favorite ? "Retirer des favoris" : "Mettre en favori"}
        className={`absolute bottom-1.5 left-1.5 rounded-md bg-surface-0/85 px-1.5 py-0.5 text-[13px] leading-none backdrop-blur-sm transition ${
          game.favorite
            ? "text-yellow-400"
            : "text-ink-faint opacity-0 group-hover:opacity-100 hover:text-yellow-400"
        }`}
      >
        {game.favorite ? "★" : "☆"}
      </button>

      <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
        {game.needsUpdate && (
          <span
            title="Mise à jour en attente"
            aria-label="Mise à jour en attente"
            className="rounded-md bg-surface-0/85 px-1.5 py-0.5 text-[11px] leading-none text-accent backdrop-blur-sm"
          >
            ↻
          </span>
        )}
        {!game.installed && (
          <span
            title="Possédé, non installé"
            aria-label="Possédé, non installé"
            className="rounded-md bg-surface-0/85 px-1.5 py-0.5 text-[11px] leading-none text-ink-muted backdrop-blur-sm"
          >
            ↓
          </span>
        )}
      </div>

      {/* Action affordance, revealed on hover so the art stays unobstructed. */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
        <p className="mb-2 line-clamp-2 text-xs font-medium text-ink">
          {game.name}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onLaunch();
          }}
          className={`w-full rounded-md py-1.5 text-xs font-semibold transition hover:brightness-110 ${
            game.installed
              ? "bg-accent text-surface-0"
              : "border border-line bg-surface-2 text-ink"
          }`}
        >
          {game.installed ? "Jouer" : "Installer"}
        </button>
      </div>
    </div>
  );
}
