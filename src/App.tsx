import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { ContextMenu, type MenuState } from "./components/ContextMenu";
import { GameDetail } from "./components/GameDetail";
import { GameGrid } from "./components/GameGrid";
import { NameDialog } from "./components/NameDialog";
import { Sidebar } from "./components/Sidebar";
import { Splash, type SplashStep } from "./components/Splash";
import { useCollections } from "./hooks/useCollections";
import { useLibrary } from "./hooks/useLibrary";
import { useUpdate } from "./hooks/useUpdate";
import { launchGame, openInstallDir } from "./lib/api";
import { normalize } from "./lib/format";
import {
  INSTALL_FILTER_LABELS,
  PLATFORM_LABELS,
  type Collection,
  type Game,
  type InstallFilter,
  type Selection,
  type SortKey,
} from "./types";

/** Which naming prompt is open, if any. */
type Dialog =
  | { mode: "create"; gameId?: string }
  | { mode: "rename"; collection: Collection };

function EmptyState({ scanning }: { scanning: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-ink-muted">
        {scanning ? "Synchronisation…" : "Aucun jeu ne correspond."}
      </p>
      {!scanning && (
        <p className="max-w-xs text-xs text-ink-faint">
          Vérifiez vos filtres, ou lancez un sync si vous venez d'installer un
          jeu.
        </p>
      )}
    </div>
  );
}

export default function App() {
  const { result, status, error, refresh } = useLibrary();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [installFilter, setInstallFilter] = useState<InstallFilter>("installed");
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showError = useCallback((message: string) => setToast(message), []);
  const collections = useCollections(showError);
  const update = useUpdate(showError);

  /* The splash stays up until there is something to show. It waits on the
     update check too, so a pending update is announced before the grid rather
     than appearing under the user a second later. */
  const ready = result !== null && update.phase !== "checking";
  const splashSteps: SplashStep[] = [
    {
      label: "Vérification des mises à jour",
      state: update.phase === "checking" ? "active" : "done",
    },
    {
      label: "Lecture des launchers",
      state: result !== null ? "done" : "active",
    },
    {
      label: "Catalogue en ligne",
      state:
        status === "fetching-catalog"
          ? "active"
          : result !== null && status === "idle"
            ? "done"
            : "pending",
    },
  ];

  const games = useMemo(() => result?.games ?? [], [result]);

  const installCounts = useMemo(() => {
    const installed = games.filter((game) => game.installed).length;
    return {
      installed,
      all: games.length,
      notInstalled: games.length - installed,
    };
  }, [games]);

  /** The install filter comes first: everything else counts within it. */
  const scoped = useMemo(
    () =>
      games.filter((game) =>
        installFilter === "all"
          ? true
          : game.installed === (installFilter === "installed"),
      ),
    [games, installFilter],
  );

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    const inSelection = (game: Game) => {
      switch (selection.kind) {
        case "platform":
          return game.platform === selection.platform;
        case "collection": {
          const list = collections.collections.find(
            (entry) => entry.id === selection.id,
          );
          return list?.gameIds.includes(game.id) ?? false;
        }
        default:
          return true;
      }
    };

    const filtered = scoped.filter(
      (game) =>
        inSelection(game) &&
        (needle === "" || normalize(game.name).includes(needle)),
    );

    return filtered.sort((a, b) => {
      switch (sort) {
        case "lastPlayed":
          // Never-played titles sink below everything with a timestamp.
          return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
        case "size":
          return (b.sizeOnDisk ?? 0) - (a.sizeOnDisk ?? 0);
        default:
          return a.name.localeCompare(b.name, "fr");
      }
    });
  }, [scoped, selection, collections.collections, query, sort]);

  const selected = useMemo(
    () => games.find((game) => game.id === selectedId) ?? null,
    [games, selectedId],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (error) setToast(error);
  }, [error]);

  const run = async (action: Promise<void>, failure: string) => {
    try {
      await action;
    } catch (cause) {
      setToast(`${failure} : ${cause}`);
    }
  };

  const handleLaunch = (game: Game) => {
    setMenu(null);
    const verb = game.installed ? "lancer" : "installer";
    void run(launchGame(game.id), `Impossible de ${verb} ${game.name}`);
  };

  const handleOpenFolder = (game: Game) => {
    setMenu(null);
    void run(openInstallDir(game.id), "Impossible d'ouvrir le dossier");
  };

  const openGameMenu = (game: Game, event: MouseEvent) => {
    event.preventDefault();
    setSelectedId(game.id);
    setMenu({
      x: event.clientX,
      y: event.clientY,
      heading: game.name,
      items: [
        {
          label: game.installed ? "Jouer" : "Installer",
          action: () => handleLaunch(game),
        },
        ...(game.installed
          ? [
              {
                label: "Ouvrir le dossier",
                action: () => handleOpenFolder(game),
              },
            ]
          : []),
        // Membership is a set of toggles rather than a submenu: a game can be
        // in several lists, and this shows which at a glance.
        ...collections.collections.map((collection, index) => ({
          label: collection.name,
          checked: collection.gameIds.includes(game.id),
          divider: index === 0,
          action: () => {
            void collections.setMembership(
              collection.id,
              game.id,
              !collection.gameIds.includes(game.id),
            );
            setMenu(null);
          },
        })),
        {
          label: "Nouvelle liste…",
          divider: collections.collections.length === 0,
          action: () => {
            setMenu(null);
            setDialog({ mode: "create", gameId: game.id });
          },
        },
      ],
    });
  };

  const openCollectionMenu = (collection: Collection, event: MouseEvent) => {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      heading: collection.name,
      items: [
        {
          label: "Renommer…",
          action: () => {
            setMenu(null);
            setDialog({ mode: "rename", collection });
          },
        },
        {
          label: "Supprimer la liste",
          action: () => {
            setMenu(null);
            // Dropping a list never touches the games in it.
            if (selection.kind === "collection" && selection.id === collection.id) {
              setSelection({ kind: "all" });
            }
            void collections.remove(collection.id);
          },
        },
      ],
    });
  };

  const confirmDialog = async (name: string) => {
    const pending = dialog;
    setDialog(null);
    if (!pending) return;

    if (pending.mode === "rename") {
      await collections.rename(pending.collection.id, name);
      return;
    }

    const lists = await collections.create(name);
    const created = lists?.[lists.length - 1];
    if (created && pending.gameId) {
      await collections.setMembership(created.id, pending.gameId, true);
    }
  };

  const scopeLabel = useMemo(() => {
    switch (selection.kind) {
      case "platform":
        return PLATFORM_LABELS[selection.platform];
      case "collection":
        return (
          collections.collections.find((entry) => entry.id === selection.id)
            ?.name ?? "Liste"
        );
      default:
        return INSTALL_FILTER_LABELS[installFilter].toLowerCase();
    }
  }, [selection, collections.collections, installFilter]);

  if (!ready) {
    return <Splash steps={splashSteps} />;
  }

  return (
    <div className="flex h-full">
      <Sidebar
        games={scoped}
        collections={collections.collections}
        selection={selection}
        onSelectionChange={setSelection}
        selectedGameId={selectedId}
        onSelectGame={(game) => setSelectedId(game.id)}
        onGameContextMenu={openGameMenu}
        onCollectionContextMenu={openCollectionMenu}
        onNewCollection={() => setDialog({ mode: "create" })}
        installFilter={installFilter}
        onInstallFilterChange={setInstallFilter}
        installCounts={installCounts}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        syncing={status !== "idle"}
        onSync={() => void refresh()}
        syncedAt={result?.scannedAt ?? null}
        errors={result?.errors ?? []}
        updateVersion={update.phase === "none" ? null : update.version}
        updateDownloading={update.phase === "downloading"}
        updateProgress={update.progress}
        onInstallUpdate={() => void update.install()}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-3">
          <span className="text-sm text-ink-muted">
            {visible.length} {visible.length > 1 ? "jeux" : "jeu"}
            <span className="text-ink-faint"> · {scopeLabel}</span>
          </span>
          {status !== "idle" && (
            <span className="text-xs text-ink-faint">
              {status === "scanning"
                ? "Lecture des launchers…"
                : "Catalogue en ligne…"}
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length > 0 ? (
            <GameGrid
              games={visible}
              selectedId={selectedId}
              onSelect={(game) => setSelectedId(game.id)}
              onLaunch={handleLaunch}
              onContextMenu={openGameMenu}
            />
          ) : (
            <EmptyState scanning={status !== "idle"} />
          )}
        </div>
      </main>

      {selected && (
        <GameDetail
          game={selected}
          onClose={() => setSelectedId(null)}
          onLaunch={() => handleLaunch(selected)}
          onOpenFolder={() => handleOpenFolder(selected)}
        />
      )}

      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}

      {dialog && (
        <NameDialog
          title={
            dialog.mode === "rename" ? "Renommer la liste" : "Nouvelle liste"
          }
          initial={dialog.mode === "rename" ? dialog.collection.name : ""}
          confirmLabel={dialog.mode === "rename" ? "Renommer" : "Créer"}
          onCancel={() => setDialog(null)}
          onConfirm={(name) => void confirmDialog(name)}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-md border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink shadow-xl shadow-black/60">
          {toast}
        </div>
      )}
    </div>
  );
}
