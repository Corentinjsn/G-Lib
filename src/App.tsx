import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { emit } from "@tauri-apps/api/event";
import { ContextMenu, type MenuState } from "./components/ContextMenu";
import { GameDetail } from "./components/GameDetail";
import { GameGrid } from "./components/GameGrid";
import { Market } from "./components/Market";
import { NameDialog } from "./components/NameDialog";
import { RedeemDialog } from "./components/RedeemDialog";
import { Palette, type PaletteAction } from "./components/Palette";
import { Sidebar } from "./components/Sidebar";
import { Splash } from "./components/Splash";
import { TitleBar } from "./components/TitleBar";
import { ViewBar } from "./components/ViewBar";
import { useCollections } from "./hooks/useCollections";
import { useGridKeys } from "./hooks/useGridKeys";
import { useLibrary, type CatalogProgress } from "./hooks/useLibrary";
import { useUpdate } from "./hooks/useUpdate";
import {
  finishSplash,
  launchGame,
  openFriends,
  openRedeem,
  openInstallDir,
  setGameFlag,
  uninstallGame,
} from "./lib/api";
import {
  inInstallFilter,
  inPlatform,
  inScope,
  inSelection,
  installCounts,
  launchLabel,
  selectGames,
  universe,
} from "./lib/library";
import { arrivals } from "./lib/activation";
import { SPLASH_EVENT, type SplashState, type SplashStep } from "./lib/splash";
import {
  INSTALL_FILTER_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  type Collection,
  type Game,
  type InstallFilter,
  type Platform,
  type Selection,
  type SortKey,
} from "./types";

/**
 * Duree minimale de la fenetre de demarrage, en millisecondes.
 *
 * Avec un cache chaud, la grille est prete en moins d'une demi-seconde : la
 * petite fenetre paraitrait et disparaitrait dans le meme battement de cil,
 * ce qui se lit comme un defaut et non comme un demarrage. Elle tient donc le
 * temps qu'il faut pour etre vue.
 */
const SPLASH_FLOOR_MS = 900;

/** L'instant ou le module est evalue, au plus pres de l'ouverture. */
const STARTED_AT = Date.now();

/** How often, and how long, the library resyncs after a key is redeemed. */
const KEY_WATCH_EVERY_MS = 20_000;
const KEY_WATCH_FOR_MS = 5 * 60_000;

/** The third startup step, with a count once there is one to give. */
function catalogLabel(progress: CatalogProgress | null): string {
  if (!progress || progress.total === 0) return "Catalogue en ligne";
  const count = `${progress.done} / ${progress.total}`;
  return progress.stage === "catalog"
    ? `Catalogue en ligne · ${count}`
    : `Jaquettes · ${count}`;
}

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
  const { result, status, error, firstRun, progress, refresh, applyResult } =
    useLibrary();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [installFilter, setInstallFilter] =
    useState<InstallFilter>("installed");
  /* La boutique d'origine est une facette, pas un ensemble : on la choisit
     au-dessus de la grille et elle se combine avec le reste — les favoris
     Steam, les jeux Epic d'une liste. En faire une ligne de la barre laterale
     interdisait ces croisements. */
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* La boutique prend la place de la grille plutot que de s'ouvrir par-dessus :
     on y va pour chercher, pas pour jeter un oeil. */
  const [market, setMarket] = useState(false);
  const gridScroll = useRef<HTMLDivElement>(null);

  const showError = useCallback((message: string) => setToast(message), []);
  const collections = useCollections(showError);
  const update = useUpdate(showError);

  /* An update found at startup installs itself before anything is shown: the
     restart would throw the library away anyway. The splash otherwise waits on
     the first scan and on the update check.

     On a machine that has never been scanned it also waits for the online
     catalogue and the covers. The grid would otherwise open half empty and
     fill in under the user's hands for a minute or two: owned Steam games
     appearing, cards reordering, placeholders turning into art. Later starts
     paint the cache at once and let that work happen in the background. */
  const updating =
    update.phase === "downloading" || update.phase === "installed";
  const syncing = status !== "idle";
  /* Once open, the library stays open: a later sync on a first run must not
     bring the startup screen back. */
  const [opened, setOpened] = useState(false);
  const startupDone =
    result !== null && update.phase !== "checking" && !(firstRun && syncing);
  useEffect(() => {
    if (startupDone) setOpened(true);
  }, [startupDone]);
  const ready = !updating && (opened || startupDone);
  const catalogProgress = status === "fetching-catalog" ? progress : null;
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
      label: catalogLabel(catalogProgress),
      state:
        status === "fetching-catalog"
          ? "active"
          : result !== null && status === "idle"
            ? "done"
            : "pending",
    },
  ];

  /* La fenetre principale demarre cachee ; ce qu'on voit au demarrage est une
     petite fenetre a part, qui ne sait rien par elle-meme. Elle recoit donc
     l'etat a chaque changement, et cede la place quand il y a une grille a
     montrer.

     La comparaison passe par le texte : l'objet est reconstruit a chaque
     rendu, et on n'a pas de raison de reveiller l'autre fenetre pour un objet
     identique. */
  const splashState: SplashState = {
    steps: splashSteps,
    update: updating
      ? { version: update.version, progress: update.progress }
      : null,
  };
  const splashJson = JSON.stringify(splashState);

  useEffect(() => {
    void emit(SPLASH_EVENT, JSON.parse(splashJson) as SplashState);
  }, [splashJson]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const wait = Math.max(0, SPLASH_FLOOR_MS - (Date.now() - STARTED_AT));
    const timer = setTimeout(() => {
      // Deux images d'attente : l'effet part avant que le navigateur n'ait
      // peint, et devoiler la fenetre a cet instant la montrerait vide.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) void finishSplash();
        }),
      );
    }, wait);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);

  const allGames = useMemo(() => result?.games ?? [], [result]);
  const hiddenCount = useMemo(
    () => allGames.filter((game) => game.hidden).length,
    [allGames],
  );
  const counts = useMemo(() => installCounts(allGames), [allGames]);

  /** Ce que chaque boutique apporte a l'ensemble courant, la facette
      plateforme mise de cote : un bouton doit annoncer ce qu'il donnerait. */
  const platformCounts = useMemo(() => {
    const tally = Object.fromEntries(
      PLATFORMS.map((entry) => [entry, 0]),
    ) as Record<Platform, number>;
    for (const game of universe(allGames, selection)) {
      if (
        inInstallFilter(game, installFilter) &&
        inSelection(game, selection, collections.collections)
      ) {
        tally[game.platform] += 1;
      }
    }
    return tally;
  }, [allGames, selection, installFilter, collections.collections]);
  const unhidden = useMemo(
    () => universe(allGames, { kind: "all" }),
    [allGames],
  );

  /** Ce que la barre laterale compte : l'univers reduit au filtre
      d'installation et a la boutique choisie, pour que ses totaux disent la
      meme chose que la grille. */
  const scoped = useMemo(
    () =>
      universe(allGames, selection).filter(
        (game) =>
          inInstallFilter(game, installFilter) && inPlatform(game, platform),
      ),
    [allGames, selection, installFilter, platform],
  );

  const visible = useMemo(
    () =>
      selectGames(allGames, {
        installFilter,
        platform,
        selection,
        collections: collections.collections,
        query,
        sort,
      }),
    [
      allGames,
      installFilter,
      platform,
      selection,
      collections.collections,
      query,
      sort,
    ],
  );

  /* Cherche d'abord dans la vue : c'est la que les exemplaires d'un meme jeu
     ont ete replies en une seule entree, qui sait sur quelles autres boutiques
     il se trouve. Le repli sur la bibliotheque entiere sert aux jeux qu'on
     ouvre depuis la palette, hors du perimetre courant. */
  const selected = useMemo(
    () =>
      visible.find((game) => game.id === selectedId) ??
      allGames.find((game) => game.id === selectedId) ??
      null,
    [visible, allGames, selectedId],
  );
  /* Le panneau de detail decrit un jeu de la grille. Quand ce jeu sort du
     perimetre courant — autre categorie, autre plateforme, autre filtre
     d'installation, ou parce qu'on vient de le masquer — le panneau part avec
     lui. Il restait ouvert sur un jeu que la vue n'affichait plus. */
  useEffect(() => {
    if (!selected) return;
    if (
      !inScope(selected, {
        installFilter,
        platform,
        selection,
        collections: collections.collections,
      })
    ) {
      setSelectedId(null);
    }
  }, [selected, installFilter, platform, selection, collections.collections]);

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
          label: launchLabel(game).text,
          action: () => launchLabel(game).enabled && handleLaunch(game),
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

  /**
   * The same repertoire as the right-click menu, for the palette's second
   * level. Built here rather than inside the palette so there is one place
   * that decides what can be done to a game.
   *
   * Order matters: the highlight lands on the first entry, so playing is first
   * and the destructive one is last.
   */
  const paletteActions = (game: Game): PaletteAction[] => [
    {
      // Le meme libelle que la carte et le panneau : un jeu qui tourne le dit
      // partout ou on pourrait le relancer.
      label: launchLabel(game).text,
      run: () => launchLabel(game).enabled && handleLaunch(game),
    },
    ...(game.installed
      ? [{ label: "Ouvrir le dossier", run: () => handleOpenFolder(game) }]
      : []),
    {
      label: "Voir les détails",
      run: () => {
        // La palette voit toute la bibliotheque. Ouvrir le detail d'un jeu que
        // la vue courante exclut demande d'aller jusqu'a lui, sans quoi la
        // regle ci-dessus refermerait le panneau aussitot.
        if (
          !inScope(game, {
            installFilter,
            platform,
            selection,
            collections: collections.collections,
          })
        ) {
          setSelection({ kind: "all" });
          setInstallFilter("all");
          setPlatform(null);
        }
        setSelectedId(game.id);
      },
    },
    {
      label: "Favori",
      star: game.favorite,
      keepOpen: true,
      run: () => void toggleFlag(game, "favorite", !game.favorite),
    },
    {
      label: "Masquer",
      checked: game.hidden,
      keepOpen: true,
      run: () => void toggleFlag(game, "hidden", !game.hidden),
    },
    ...collections.collections.map((collection) => ({
      label: collection.name,
      checked: collection.gameIds.includes(game.id),
      keepOpen: true,
      run: () =>
        void collections.setMembership(
          collection.id,
          game.id,
          !collection.gameIds.includes(game.id),
        ),
    })),
    // Sans cela, la palette permettrait de classer un jeu dans une liste
    // existante mais jamais d'en ouvrir une.
    {
      label: "Nouvelle liste…",
      run: () => setDialog({ mode: "create", gameId: game.id }),
    },
    // Absente pour Epic, qui ne publie aucune désinstallation.
    ...(game.installed && game.uninstall
      ? [
          {
            label: "Désinstaller…",
            danger: true,
            run: () => handleUninstall(game),
          },
        ]
      : []),
  ];

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
            if (
              selection.kind === "collection" &&
              selection.id === collection.id
            ) {
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
    const set = (() => {
      switch (selection.kind) {
        case "favorites":
          return "favoris";
        case "hidden":
          return "masqués";
        case "collection":
          return (
            collections.collections.find((entry) => entry.id === selection.id)
              ?.name ?? "Liste"
          );
        default:
          return INSTALL_FILTER_LABELS[installFilter].toLowerCase();
      }
    })();
    // La plateforme s'ajoute au lieu de remplacer : c'est bien une facette
    // par-dessus l'ensemble choisi.
    return platform ? `${set} · ${PLATFORM_LABELS[platform]}` : set;
  }, [selection, collections.collections, installFilter, platform]);

  /** Toute navigation dans la bibliotheque ramene de la boutique. */
  const selectSection = (next: Selection) => {
    setMarket(false);
    setSelection(next);
  };

  useGridKeys({
    games: visible,
    selectedId,
    onSelect: setSelectedId,
    onLaunch: handleLaunch,
    onToggleFavorite: (game: Game) =>
      void toggleFlag(game, "favorite", !game.favorite),
    onOpenPalette: () => setPaletteOpen(true),
    paletteOpen,
    gridRef: gridScroll,
    // A context menu, a dialog or the palette owns the keyboard while it is
    // open; the palette runs its own motions over its own results. La
    // boutique a son propre champ et sa propre grille.
    enabled:
      menu === null &&
      dialog === null &&
      !redeemOpen &&
      !paletteOpen &&
      !market,
  });

  // La barre de titre est rendue avant tout le reste, y compris pendant le
  // splash : la fenetre n'a plus de decoration systeme, donc c'est le seul
  // endroit d'ou on peut la deplacer ou la fermer.
  /* After a key is taken to its store, the game appears in the launcher's
     files some seconds to a minute later. Rather than asking for a manual sync,
     the library resyncs on its own until the game shows up, for a while. */
  const [keyWatch, setKeyWatch] = useState<{
    before: Set<string>;
    until: number;
  } | null>(null);

  useEffect(() => {
    if (!keyWatch) return;
    const timer = setInterval(() => {
      if (Date.now() > keyWatch.until) {
        setKeyWatch(null);
        return;
      }
      void refresh();
    }, KEY_WATCH_EVERY_MS);
    return () => clearInterval(timer);
  }, [keyWatch, refresh]);

  useEffect(() => {
    if (!keyWatch || !result) return;
    const added = arrivals(keyWatch.before, result.games);
    if (added.length === 0) return;
    setKeyWatch(null);
    setToast(
      added.length === 1
        ? `${added[0].name} est arrivé dans votre bibliothèque.`
        : `${added.length} jeux sont arrivés dans votre bibliothèque.`,
    );
  }, [keyWatch, result]);

  const redeem = async (store: Platform) => {
    try {
      await openRedeem(store);
    } catch (cause) {
      setToast(`Impossible d'ouvrir ${PLATFORM_LABELS[store]} : ${cause}`);
      return false;
    }
    setKeyWatch({
      before: new Set(allGames.map((game) => game.id)),
      until: Date.now() + KEY_WATCH_FOR_MS,
    });
    return true;
  };

  const sync = () => {
    void refresh();
    void update.checkNow();
  };

  const titleBar = (
    <TitleBar
      // Reste affichée pendant le téléchargement, qui porte sa progression.
      updateVersion={
        update.phase === "available" || update.phase === "downloading"
          ? update.version
          : null
      }
      updateDownloading={update.phase === "downloading"}
      updateProgress={update.progress}
      onInstallUpdate={() => void update.install()}
      syncing={status !== "idle"}
      onSync={sync}
      onRedeem={() => setRedeemOpen(true)}
      onFriends={() =>
        void openFriends().catch((cause) => setToast(String(cause)))
      }
      syncedAt={result?.scannedAt ?? null}
    />
  );

  if (!ready) {
    return (
      <div className="flex h-full flex-col">
        {titleBar}
        <Splash
          steps={splashSteps}
          update={
            updating
              ? { version: update.version, progress: update.progress }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {titleBar}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          games={scoped}
          unscopedGames={unhidden}
          collections={collections.collections}
          selection={selection}
          onSelectionChange={selectSection}
          selectedGameId={selectedId}
          onSelectGame={(game) => setSelectedId(game.id)}
          onGameContextMenu={openGameMenu}
          onCollectionContextMenu={openCollectionMenu}
          onNewCollection={() => setDialog({ mode: "create" })}
          errors={result?.errors ?? []}
          hiddenCount={hiddenCount}
          market={market}
          onOpenMarket={() => {
            setMarket(true);
            // Le panneau de detail decrit un jeu de la grille, qui n'est plus
            // la.
            setSelectedId(null);
          }}
        />

        {market ? (
          <Market library={allGames} onError={showError} />
        ) : (
          <>
          <main className="flex min-w-0 flex-1 flex-col">
            <ViewBar
              count={visible.length}
              scopeLabel={scopeLabel}
              status={
                status === "scanning"
                  ? "Lecture des launchers…"
                  : status === "fetching-catalog"
                    ? "Catalogue en ligne…"
                    : null
              }
              query={query}
              onQueryChange={setQuery}
              installFilter={installFilter}
              onInstallFilterChange={setInstallFilter}
              installCounts={counts}
              platform={platform}
              onPlatformChange={setPlatform}
              platformCounts={platformCounts}
              sort={sort}
              onSortChange={setSort}
            />

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
              onLaunchOther={handleLaunch}
              onOpenFolder={() => handleOpenFolder(selected)}
              onToggleFavorite={() =>
                void toggleFlag(selected, "favorite", !selected.favorite)
              }
            />
          )}
          </>
        )}
      </div>

      {/* Cherche dans toute la bibliothèque, filtres de la barre latérale
          compris : c'est le chemin vers un jeu qu'on ne voit pas. */}
      {paletteOpen && (
        <Palette
          games={allGames}
          actionsFor={paletteActions}
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

      {redeemOpen && (
        <RedeemDialog
          watching={keyWatch !== null}
          onClose={() => setRedeemOpen(false)}
          onRedeem={redeem}
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
