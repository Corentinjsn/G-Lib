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
}

/**
 * Only Steam publishes free portrait art, so every other store gets a tinted
 * placeholder built from its own accent colour rather than an empty box.
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
}: Props) {
  const [artBroken, setArtBroken] = useState(false);
  const art = artBroken ? null : coverUrl(game.coverPath);

  return (
    <div
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

      <div className="absolute top-1.5 left-1.5">
        <PlatformBadge platform={game.platform} />
      </div>

      {/* Play affordance, revealed on hover so the art stays unobstructed. */}
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
          className="w-full rounded-md bg-accent py-1.5 text-xs font-semibold text-surface-0 transition hover:brightness-110"
        >
          Jouer
        </button>
      </div>
    </div>
  );
}
