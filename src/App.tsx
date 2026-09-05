import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { ContextMenu, type MenuState } from "./components/ContextMenu";
import { GameDetail } from "./components/GameDetail";
import { GameGrid } from "./components/GameGrid";
import { Sidebar } from "./components/Sidebar";
import { useLibrary } from "./hooks/useLibrary";
import { launchGame, openInstallDir } from "./lib/api";
import { normalize } from "./lib/format";
import { PLATFORMS, type Game, type Platform, type SortKey } from "./types";

const EMPTY_COUNTS = Object.fromEntries(
  PLATFORMS.map((platform) => [platform, 0]),
) as Record<Platform, number>;

function EmptyState({ scanning }: { scanning: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-ink-muted">
        {scanning ? "Analyse des launchers…" : "Aucun jeu ne correspond."}
      </p>
      {!scanning && (
        <p className="max-w-xs text-xs text-ink-faint">
          Vérifiez vos filtres, ou relancez une analyse si vous venez
          d'installer un jeu.
        </p>
      )}
    </div>
  );
}

export default function App() {
  const { result, status, error, refresh } = useLibrary();

  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const games = useMemo(() => result?.games ?? [], [result]);

  const counts = useMemo(() => {
    const tally = { ...EMPTY_COUNTS };
    for (const game of games) tally[game.platform] += 1;
    return tally;
  }, [games]);

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = games.filter(
      (game) =>
        (platform === null || game.platform === platform) &&
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
  }, [games, platform, query, sort]);

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
    void run(launchGame(game.id), `Impossible de lancer ${game.name}`);
  };

  const handleOpenFolder = (game: Game) => {
    setMenu(null);
    void run(openInstallDir(game.id), "Impossible d'ouvrir le dossier");
  };

  const handleContextMenu = (game: Game, event: MouseEvent) => {
    event.preventDefault();
    setSelectedId(game.id);
    setMenu({ x: event.clientX, y: event.clientY, gameId: game.id });
  };

  const menuGame = menu
    ? (games.find((game) => game.id === menu.gameId) ?? null)
    : null;

  return (
    <div className="flex h-full">
      <Sidebar
        counts={counts}
        total={games.length}
        platform={platform}
        onPlatformChange={setPlatform}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        scanning={status !== "idle"}
        onRefresh={() => void refresh()}
        errors={result?.errors ?? []}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-3">
          <span className="text-sm text-ink-muted">
            {visible.length} {visible.length > 1 ? "jeux" : "jeu"}
            {platform || query ? ` sur ${games.length}` : ""}
          </span>
          {status !== "idle" && (
            <span className="text-xs text-ink-faint">
              {status === "scanning"
                ? "Analyse des launchers…"
                : "Récupération des jaquettes…"}
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
              onContextMenu={handleContextMenu}
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

      {menu && menuGame && (
        <ContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          onLaunch={() => handleLaunch(menuGame)}
          onOpenFolder={() => handleOpenFolder(menuGame)}
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
