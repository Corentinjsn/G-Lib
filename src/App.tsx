import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ContextMenu, type MenuState } from "./components/ContextMenu";
import { GameDetail } from "./components/GameDetail";
import { GameGrid } from "./components/GameGrid";
import { KbdHint } from "./components/Kbd";
import { NameDialog } from "./components/NameDialog";
import { Palette } from "./components/Palette";
import { Sidebar } from "./components/Sidebar";
import { Splash, type SplashStep } from "./components/Splash";
import { useCollections } from "./hooks/useCollections";
import { useGridKeys } from "./hooks/useGridKeys";
import { useLibrary } from "./hooks/useLibrary";
import { useUpdate } from "./hooks/useUpdate";
import {
  launchGame,
  openInstallDir,
  setGameFlag,
  uninstallGame,
} from "./lib/api";
import {
  inInstallFilter,
  installCounts,
  selectGames,
  universe,
} from "./lib/library";
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
  const { result, status, error, refresh, applyResult } = useLibrary();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [installFilter, setInstallFilter] = useState<InstallFilter>("installed");
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const gridScroll = useRef<HTMLDivElement>(null);

  const showError = useCallback((message: string) => setToast(message), []);
  const collections = useCollections(showError);
  const update = useUpdate(showError);

  /* An update found at startup installs itself before anything is shown: the
     restart would throw the library away anyway. The splash otherwise waits on
     the first scan and on the update check. */
  const updating =
    update.phase === "downloading" || update.phase === "installed";
  const ready = !updating && result !== null && update.phase !== "checking";
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

  const allGames = useMemo(() => result?.games ?? [], [result]);
  const hiddenCount = useMemo(
    () => allGames.filter((game) => game.hidden).length,
    [allGames],
  );
  const counts = useMemo(() => installCounts(allGames), [allGames]);
  const unhidden = useMemo(
    () => universe(allGames, { kind: "all" }),
    [allGames],
  );

  /** What the sidebar groups and counts over: the universe minus the install
      filter, but before any selection — a platform row has to keep its count
      whichever platform is currently selected. */
  const scoped = useMemo(
    () =>
      universe(allGames, selection).filter((game) =>
        inInstallFilter(game, installFilter),
      ),
    [allGames, selection, installFilter],
  );

  const visible = useMemo(
    () =>
      selectGames(allGames, {
        installFilter,
        selection,
        collections: collections.collections,
        query,
        sort,
      }),
    [allGames, installFilter, selection, collections.collections, query, sort],
  );

  const selected = useMemo(
    () => allGames.find((game) => game.id === selectedId) ?? null,
    [allGames, selectedId],
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

  const toggleFlag = async (game: Game, name: string, value: boolean) => {
    try {
      applyResult(await setGameFlag(game.id, name, value));
    } catch (cause) {
      setToast(`Impossible de modifier ${game.name} : ${cause}`);
    }
  };

  const handleUninstall = (game: Game) => {
    setMenu(null);
    // Le launcher demande sa propre confirmation ; en ajouter une ici ne
    // ferait que doubler le même dialogue.
    void run(uninstallGame(game.id), `Impossible de désinstaller ${game.name}`);
  };

  const openGameMenu = (game: Game, event: MouseEvent) => {
    event.preventDefault();
    // Volontairement sans sélection : ouvrir le panneau de détail rétrécit la
    // grille et fait glisser les cartes sous un pointeur qui vient à peine de
    // quitter celle qu'on visait.
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
        // Absent pour Epic, qui ne publie aucune désinstallation.
        ...(game.installed && game.uninstall
          ? [
              {
                label: "Désinstaller…",
                action: () => handleUninstall(game),
              },
            ]
          : []),
        {
          label: "Favori",
          star: game.favorite,
          divider: true,
          action: () => {
            void toggleFlag(game, "favorite", !game.favorite);
            setMenu(null);
          },
        },
        {
          label: "Masquer",
          checked: game.hidden,
          action: () => {
            void toggleFlag(game, "hidden", !game.hidden);
            setMenu(null);
          },
        },
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
      case "favorites":
        return "favoris";
      case "hidden":
        return "masqués";
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

  useGridKeys({
    games: visible,
    selectedId,
    onSelect: setSelectedId,
    onLaunch: handleLaunch,
    onToggleFavorite: (game: Game) =>
      void toggleFlag(game, "favorite", !game.favorite),
    onTogglePalette: () => setPaletteOpen((open) => !open),
    gridRef: gridScroll,
    // A context menu, a dialog or the palette owns the keyboard while it is
    // open; the palette runs its own arrows over its own results.
    enabled: menu === null && dialog === null && !paletteOpen,
  });

  if (!ready) {
    return (
      <Splash
        steps={splashSteps}
        update={
          updating
            ? { version: update.version, progress: update.progress }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar
        games={scoped}
        unscopedGames={unhidden}
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
        installCounts={counts}
        enterTarget={visible[0]?.name ?? null}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        syncing={status !== "idle"}
        onSync={() => {
          void refresh();
          void update.checkNow();
        }}
        syncedAt={result?.scannedAt ?? null}
        errors={result?.errors ?? []}
        hiddenCount={hiddenCount}
        // Reste affichée pendant le téléchargement, qui porte sa progression.
        updateVersion={
          update.phase === "available" || update.phase === "downloading"
            ? update.version
            : null
        }
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
          {status !== "idle" ? (
            <span className="text-xs text-ink-faint">
              {status === "scanning"
                ? "Lecture des launchers…"
                : "Catalogue en ligne…"}
            </span>
          ) : (
            // Sits where the sync status goes, so the header never carries two
            // competing messages. Dropped on narrow windows.
            <span className="hidden items-center gap-4 text-[11px] lg:flex">
              <KbdHint keys={["←", "↑", "↓", "→"]} label="naviguer" />
              <KbdHint keys={["↵"]} label="lancer" />
              {/* Une palette qu'on ne sait pas ouvrir n'existe pas. */}
              <KbdHint keys={["Ctrl", "K"]} label="rechercher" />
            </span>
          )}
        </header>

        <div ref={gridScroll} className="min-h-0 flex-1 overflow-y-auto">
          {visible.length > 0 ? (
            <GameGrid
              games={visible}
              selectedId={selectedId}
              onSelect={(game) => setSelectedId(game.id)}
              onLaunch={handleLaunch}
              onContextMenu={openGameMenu}
              onToggleFavorite={(game) =>
                void toggleFlag(game, "favorite", !game.favorite)
              }
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
          onToggleFavorite={() =>
            void toggleFlag(selected, "favorite", !selected.favorite)
          }
        />
      )}

      {/* Cherche dans toute la bibliothèque, filtres de la barre latérale
          compris : c'est le chemin vers un jeu qu'on ne voit pas. */}
      {paletteOpen && (
        <Palette
          games={allGames}
          onLaunch={handleLaunch}
          onClose={() => setPaletteOpen(false)}
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
