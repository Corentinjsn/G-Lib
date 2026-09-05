import { useState, type MouseEvent } from "react";
import {
  PLATFORMS,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  selectionKey,
  type Collection,
  type Game,
  type ScanError,
  type Selection,
} from "../types";
import { KbdHint } from "./Kbd";
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
  onCollectionContextMenu: (collection: Collection, event: MouseEvent) => void;
  onNewCollection: () => void;
  errors: ScanError[];
  /** Total hidden games, counted outside the current view. */
  hiddenCount: number;
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
  errors,
  hiddenCount,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      {/* Ne reste que la navigation : quel ensemble on regarde. Comment on le
          regarde — filtre, installés, tri — appartient a la barre au-dessus de
          la grille, et la synchronisation a la barre de titre. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
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
                onSelect={() =>
                  onSelectionChange({ kind: "platform", platform })
                }
                icon={platform}
              />
              {expanded.has(key) && gameRows(list)}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 border-t border-line p-4">
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

        {/* Le bas de la barre laterale etait occupe par le bouton Sync ; il
            revient aux raccourcis, qui n'avaient nulle part ou tenir une fois
            l'en-tete de la grille rempli. */}
        <div className="flex flex-col gap-1.5 text-[11px]">
          <KbdHint keys={["←", "↑", "↓", "→"]} label="naviguer" />
          <KbdHint keys={["↵"]} label="lancer" />
          <KbdHint keys={["Ctrl", "K"]} label="rechercher" />
        </div>
      </div>
    </aside>
  );
}
