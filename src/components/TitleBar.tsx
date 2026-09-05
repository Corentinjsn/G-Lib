import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatAgo } from "../lib/format";
import { LogoMark } from "./LogoMark";

interface Props {
  /** Version on offer, or null when there is nothing to install. */
  updateVersion: string | null;
  updateDownloading: boolean;
  updateProgress: number;
  onInstallUpdate: () => void;
  syncing: boolean;
  onSync: () => void;
  /** Unix epoch seconds of the last completed sync, if any. */
  syncedAt: number | null;
}

/**
 * Re-renders once a minute so the sync stamp does not sit on "à l'instant"
 * for an app that has been open all afternoon.
 */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
}

/**
 * The download mark: an arrow onto a line.
 *
 * Drawn rather than borrowed so it keeps its weight at 15 pixels, where an
 * icon font would go muddy.
 */
/** The refresh mark: a ring open at the top, with its own arrow head. */
function RefreshIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[15px]"
    >
      <path d="M20 11a8 8 0 1 0-1.8 6" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[15px]"
    >
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

/** The three Windows glyphs, at the size the system draws them. */
function ControlIcon({
  shape,
}: {
  shape: "min" | "max" | "restore" | "close";
}) {
  const props = {
    "aria-hidden": true,
    viewBox: "0 0 10 10",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1,
    className: "size-2.5",
  } as const;

  if (shape === "min") {
    return (
      <svg {...props}>
        <path d="M0 5h10" />
      </svg>
    );
  }
  if (shape === "close") {
    return (
      <svg {...props}>
        <path d="M0 0l10 10M10 0L0 10" />
      </svg>
    );
  }
  if (shape === "restore") {
    return (
      <svg {...props}>
        <path d="M2 2.5h5.5V8H2z" />
        <path d="M3.5 2.5V1h5.5v5.5H7.5" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M0.5 0.5h9v9h-9z" />
    </svg>
  );
}

/**
 * Our own title bar, because Windows draws its own on the left.
 *
 * The name could not be centred in the system bar -- the system owns that text
 * -- so the window is undecorated and this stands in its place. The cost is
 * Windows' Snap Layouts, which only appear over a real maximise button.
 *
 * The whole strip is a drag region except the buttons, and double-clicking it
 * maximises, both handled by Tauri from the `data-tauri-drag-region` attribute.
 */
export function TitleBar({
  updateVersion,
  updateDownloading,
  updateProgress,
  onInstallUpdate,
  syncing,
  onSync,
  syncedAt,
}: Props) {
  const [maximized, setMaximized] = useState(false);
  useMinuteTick();
  const syncedAgo = formatAgo(syncedAt);

  useEffect(() => {
    const window = getCurrentWindow();
    const sync = () => void window.isMaximized().then(setMaximized);
    sync();
    // The button also has to change when the window is snapped or restored by
    // dragging, which never goes through our own click handler.
    const unlisten = window.onResized(sync);
    return () => void unlisten.then((off) => off());
  }, []);

  const win = () => getCurrentWindow();

  return (
    <header
      data-tauri-drag-region
      className="relative z-50 flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface-1 pl-2.5 select-none"
    >
      <span
        data-tauri-drag-region
        className="pointer-events-none flex items-center gap-1"
      >
        {/* La marque dessinee plutot que le PNG : a cette taille, un aplat de
            16 pixels devient une bouillie, alors que les traits du SVG
            tiennent. */}
        {/* Au meme ton que les boutons de la barre : rien ici n'est le sujet
            de la fenetre, c'est une etiquette. */}
        <LogoMark className="h-[20px] w-auto text-ink-muted" />
        <span className="font-display text-[13px] leading-none font-semibold tracking-tight text-ink-muted">
          Gamlib
        </span>
        <span className="text-[10px] leading-none text-ink-faint">
          v{__APP_VERSION__}
        </span>
      </span>

      <span data-tauri-drag-region className="h-full flex-1" />

      <div className="flex h-full items-center">
        {/* Un bouton « Sync » occupait le bas de la barre laterale pour une
            action qu'on declenche rarement — la synchronisation se fait au
            demarrage et sur detection de changement. Reduit a son icone, il
            reste a portee sans prendre de place. */}
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          aria-label="Synchroniser"
          title={
            syncing
              ? "Synchronisation…"
              : syncedAgo
                ? `Synchroniser — dernière sync ${syncedAgo}`
                : "Synchroniser"
          }
          className={`flex h-8 w-11 items-center justify-center transition disabled:cursor-progress ${
            syncing
              ? "animate-spin text-accent"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <RefreshIcon />
        </button>

        {/* Sans fond : l'icone seule, sur la meme trame que les boutons de
            fenetre. C'est le vert qui la fait remarquer, une pastille
            n'ajouterait que du bruit dans une barre haute de huit points. */}
        {updateVersion && (
          <button
            type="button"
            onClick={onInstallUpdate}
            disabled={updateDownloading}
            aria-label={`Mettre à jour vers ${updateVersion}`}
            title={
              updateDownloading
                ? `Téléchargement… ${Math.round(updateProgress * 100)} %`
                : `Mettre à jour vers ${updateVersion}`
            }
            className="flex h-8 w-11 items-center justify-center text-[#23a55a] transition hover:brightness-125 disabled:cursor-progress"
          >
            {updateDownloading ? (
              <span className="size-[11px] animate-pulse rounded-full bg-[#23a55a]" />
            ) : (
              <DownloadIcon />
            )}
          </button>
        )}

        {/* La barre porte deux familles de boutons : ceux de l'application et
            ceux de la fenetre. Rien ne les distinguait puisqu'ils partagent la
            meme trame et le meme ton — le trait dit ou l'une finit. */}
        <span aria-hidden className="mx-1.5 h-4 w-px bg-line" />

        {/* Sized and coloured like the system's own, close included: a title
            bar that behaves like one is worth more than a styled one. */}
        <button
          type="button"
          onClick={() => void win().minimize()}
          aria-label="Réduire"
          className="flex h-8 w-11 items-center justify-center text-ink-muted transition hover:bg-surface-3 hover:text-ink"
        >
          <ControlIcon shape="min" />
        </button>
        <button
          type="button"
          onClick={() => void win().toggleMaximize()}
          aria-label={maximized ? "Restaurer" : "Agrandir"}
          className="flex h-8 w-11 items-center justify-center text-ink-muted transition hover:bg-surface-3 hover:text-ink"
        >
          <ControlIcon shape={maximized ? "restore" : "max"} />
        </button>
        <button
          type="button"
          onClick={() => void win().close()}
          aria-label="Fermer"
          className="flex h-8 w-11 items-center justify-center text-ink-muted transition hover:bg-[#c42b1c] hover:text-white"
        >
          <ControlIcon shape="close" />
        </button>
      </div>
    </header>
  );
}
