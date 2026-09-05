import { useEffect } from "react";

export interface MenuState {
  x: number;
  y: number;
  gameId: string;
}

interface Props {
  state: MenuState;
  installed: boolean;
  onClose: () => void;
  onLaunch: () => void;
  onOpenFolder: () => void;
}

export function ContextMenu({
  state,
  installed,
  onClose,
  onLaunch,
  onOpenFolder,
}: Props) {
  useEffect(() => {
    const dismiss = () => onClose();
    window.addEventListener("click", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [onClose]);

  // A game that is not on disk has no folder to open.
  const items = installed
    ? [
        { label: "Jouer", action: onLaunch },
        { label: "Ouvrir le dossier", action: onOpenFolder },
      ]
    : [{ label: "Installer", action: onLaunch }];

  return (
    <div
      // Nudged inside the viewport so a right-click near an edge stays usable.
      style={{
        left: Math.min(state.x, window.innerWidth - 180),
        top: Math.min(state.y, window.innerHeight - 90),
      }}
      className="fixed z-50 w-44 overflow-hidden rounded-md border border-line bg-surface-2 py-1 shadow-xl shadow-black/60"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.action}
          className="block w-full px-3 py-1.5 text-left text-sm text-ink-muted transition hover:bg-surface-3 hover:text-ink"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
