import { coverUrl } from "../lib/api";
import { formatLastPlayed, formatPlaytime, formatSize } from "../lib/format";
import { launchLabel } from "../lib/library";
import { PLATFORM_LABELS, type Game } from "../types";
import { Kbd } from "./Kbd";
import { PlatformBadge } from "./PlatformBadge";

interface Props {
  game: Game;
  onClose: () => void;
  onLaunch: () => void;
  /** Lance l'exemplaire d'une autre boutique. */
  onLaunchOther: (other: Game) => void;
  onOpenFolder: () => void;
  onToggleFavorite: () => void;
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

export function GameDetail({
  game,
  onClose,
  onLaunch,
  onLaunchOther,
  onOpenFolder,
  onToggleFavorite,
}: Props) {
  const art = coverUrl(game.coverPath);
  const size = formatSize(game.sizeOnDisk);
  const lastPlayed = formatLastPlayed(game.lastPlayed);
  const playtime = formatPlaytime(game.playtimeSeconds);
  const action = launchLabel(game);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface-1">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        {/* items-start : sans quoi le badge s etire sur la largeur du titre
            et son fond ressemble a un champ vide. */}
        <div className="flex flex-col items-start gap-2">
          <h2 className="text-base leading-tight font-semibold text-ink">
            {game.name}
          </h2>
          {/* The panel said everything about the game except whether it was a
              favourite — the one thing the user had set themselves. */}
          <div className="flex items-center gap-2">
            <PlatformBadge platform={game.platform} />
            <button
              type="button"
              onClick={onToggleFavorite}
              title={
                game.favorite ? "Retirer des favoris" : "Mettre en favori"
              }
              className={`rounded-md px-1.5 py-1 text-[13px] leading-none transition hover:bg-surface-2 ${
                game.favorite
                  ? "text-yellow-400"
                  : "text-ink-faint hover:text-yellow-400"
              }`}
            >
              {game.favorite ? "★" : "☆"}
            </button>
          </div>
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
            disabled={!action.enabled}
            onClick={onLaunch}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition ${
              action.enabled
                ? "bg-accent text-surface-0 hover:brightness-110"
                : "cursor-default border border-line bg-surface-2 text-ink-muted"
            }`}
          >
            {action.text}
            {action.enabled && (
              <span className="opacity-70">
                <Kbd>↵</Kbd>
              </span>
            )}
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

        {/* La carte en replie plusieurs : le detail dit lesquelles, et permet
            de lancer depuis l'autre boutique — celle qui a la version a jour,
            ou simplement celle qu'on prefere. */}
        {game.duplicates && game.duplicates.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-[10px] tracking-widest text-ink-faint uppercase">
              Aussi sur
            </span>
            {game.duplicates.map((other) => (
              <button
                key={other.id}
                type="button"
                onClick={() => onLaunchOther(other)}
                title={`${other.installed ? "Jouer" : "Installer"} — ${
                  PLATFORM_LABELS[other.platform]
                }`}
                className="flex items-center gap-2.5 rounded-md border border-line bg-surface-2 px-3 py-2 text-left text-sm text-ink-muted transition hover:border-accent hover:text-ink"
              >
                <PlatformBadge platform={other.platform} />
                <span className="min-w-0 flex-1 truncate">
                  {PLATFORM_LABELS[other.platform]}
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">
                  {other.installed ? "installé" : "à installer"}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Field
            label="État"
            value={
              game.activity === "running"
                ? "En cours"
                : game.activity === "launching"
                  ? "Lancement…"
                  : game.installed
                    ? game.needsUpdate
                      ? "Installé — mise à jour en attente"
                      : "Installé"
                    : "Possédé, non installé"
            }
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
