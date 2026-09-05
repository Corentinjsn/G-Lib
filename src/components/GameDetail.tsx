import { coverUrl } from "../lib/api";
import { formatLastPlayed, formatPlaytime, formatSize } from "../lib/format";
import { PLATFORM_LABELS, type Game } from "../types";
import { Kbd } from "./Kbd";
import { PlatformBadge } from "./PlatformBadge";

interface Props {
  game: Game;
  onClose: () => void;
  onLaunch: () => void;
  onOpenFolder: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] tracking-widest text-ink-faint uppercase">
        {label}
      </span>
      <span className="text-xs break-all text-ink-muted select-text">
        {value}
      </span>
    </div>
  );
}

export function GameDetail({ game, onClose, onLaunch, onOpenFolder }: Props) {
  const art = coverUrl(game.coverPath);
  const size = formatSize(game.sizeOnDisk);
  const lastPlayed = formatLastPlayed(game.lastPlayed);
  const playtime = formatPlaytime(game.playtimeSeconds);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface-1">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="flex flex-col gap-2">
          <h2 className="text-base leading-tight font-semibold text-ink">
            {game.name}
          </h2>
          <PlatformBadge platform={game.platform} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="rounded-md px-2 py-1 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {art && (
          <img
            src={art}
            alt=""
            draggable={false}
            className="w-full rounded-lg object-cover"
          />
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLaunch}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-semibold text-surface-0 transition hover:brightness-110"
          >
            {game.installed ? "Jouer" : "Installer"}
            <span className="opacity-70">
              <Kbd>↵</Kbd>
            </span>
          </button>
          {game.installed && (
            <button
              type="button"
              onClick={onOpenFolder}
              className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted transition hover:border-accent hover:text-ink"
            >
              Dossier
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Field label="Plateforme" value={PLATFORM_LABELS[game.platform]} />
          <Field
            label="État"
            value={game.installed ? "Installé" : "Possédé, non installé"}
          />
          {size && <Field label="Taille sur disque" value={size} />}
          {lastPlayed && <Field label="Dernière session" value={lastPlayed} />}
          {playtime && <Field label="Temps de jeu" value={playtime} />}
          {game.installDir && (
            <Field label="Dossier d'installation" value={game.installDir} />
          )}
        </div>
      </div>
    </aside>
  );
}
