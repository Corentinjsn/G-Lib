import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  /** Version on offer, or null when there is nothing to install. */
  updateVersion: string | null;
  updateDownloading: boolean;
  updateProgress: number;
  onInstallUpdate: () => void;
}

/**
 * The download mark: an arrow onto a line.
 *
 * Drawn rather than borrowed so it keeps its weight at 15 pixels, where an
 * icon font would go muddy.
 */
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
}: Props) {
  const [maximized, setMaximized] = useState(false);

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
      className="relative z-50 flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface-1 pl-3 select-none"
    >
      {/* Absolutely placed so the name sits at the centre of the window rather
          than the centre of whatever space the buttons leave over. */}
      <span
        data-tauri-drag-region
        className="pointer-events-none absolute inset-x-0 flex items-baseline justify-center gap-1.5"
      >
        <span className="font-display text-[13px] leading-none font-semibold tracking-tight text-ink">
          Gamlib
        </span>
        <span className="text-[10px] leading-none text-ink-faint">
          v{__APP_VERSION__}
        </span>
      </span>

      <span data-tauri-drag-region className="h-full flex-1" />

      <div className="flex h-full items-center">
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
