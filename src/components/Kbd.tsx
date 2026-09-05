/**
 * A keycap, the way documentation sites draw one.
 *
 * Shortcuts nobody can see are shortcuts nobody uses, and a launcher is
 * something you reach for quickly — so the keys are shown rather than left to
 * be discovered.
 */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.35rem] items-center justify-center rounded border border-line border-b-2 bg-surface-2 px-1 py-px font-sans text-[10px] leading-[1.4] text-ink-muted">
      {children}
    </kbd>
  );
}

/** A group of keys with one label, e.g. `← ↑ ↓ →  naviguer`. */
export function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span className="ml-0.5 text-ink-faint">{label}</span>
    </span>
  );
}
