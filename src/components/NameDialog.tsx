import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initial?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

/**
 * A one-field prompt, for naming and renaming lists.
 *
 * The webview has no usable `window.prompt`, and a modal is better anyway: it
 * can pre-select the existing name so renaming is a single keystroke away.
 */
export function NameDialog({
  title,
  initial = "",
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="w-80 rounded-lg border border-line bg-surface-1 p-4 shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
        <input
          ref={input}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") onCancel();
          }}
          placeholder="Nom de la liste"
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-surface-0 transition hover:brightness-110 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
