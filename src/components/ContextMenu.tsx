import { useEffect } from "react";

export interface MenuItem {
  label: string;
  action: () => void;
  /** Renders a checkbox: used for list membership, which is a toggle. */
  checked?: boolean;
  /** Renders a star instead of a checkbox. A favourite is not a category
      one ticks; the mark is the point. */
  star?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  heading?: string;
  items: MenuItem[];
}

interface Props {
  state: MenuState;
  onClose: () => void;
}

const ROW_HEIGHT = 30;

export function ContextMenu({ state, onClose }: Props) {
  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const height = state.items.length * ROW_HEIGHT + (state.heading ? 30 : 0) + 12;

  return (
    <div
      // Nudged inside the viewport so a right-click near an edge stays usable.
      style={{
        left: Math.min(state.x, window.innerWidth - 210),
        top: Math.max(4, Math.min(state.y, window.innerHeight - height - 4)),
      }}
      className="fixed z-50 max-h-[70vh] w-52 overflow-y-auto rounded-md border border-line bg-surface-2 py-1 shadow-xl shadow-black/60"
    >
      {state.heading && (
        <p className="truncate px-3 py-1 text-[10px] tracking-widest text-ink-faint uppercase">
          {state.heading}
        </p>
      )}
      {state.items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          type="button"
          onClick={item.action}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition hover:bg-surface-3 hover:text-ink ${
            item.divider ? "mt-1 border-t border-line pt-2" : ""
          }`}
        >
          {item.star !== undefined && (
            <span
              aria-hidden
              className={`w-3.5 shrink-0 text-center text-[13px] leading-none ${
                item.star ? "text-yellow-400" : "text-ink-faint"
              }`}
            >
              {item.star ? "★" : "☆"}
            </span>
          )}
          {item.checked !== undefined && (
            <span
              aria-hidden
              className={`flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] ${
                item.checked
                  ? "border-accent bg-accent text-surface-0"
                  : "border-line"
              }`}
            >
              {item.checked ? "✓" : ""}
            </span>
          )}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
