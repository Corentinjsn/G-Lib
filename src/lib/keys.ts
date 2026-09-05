/**
 * Which cell a key press moves to, in a grid.
 *
 * Pulled out of the hook because it is arithmetic, not React: two key
 * vocabularies map onto the same motions, `gg` needs a pending state, and the
 * page motions depend on how many rows happen to fit. All of that is worth
 * testing without a DOM.
 */
export interface GridShape {
  /** Currently selected cell, or -1 when nothing is selected. */
  index: number;
  count: number;
  columns: number;
  /** Rows visible at once, for the page motions. */
  rows: number;
  /** A `g` is waiting for its second half. */
  pendingG: boolean;
}

export interface GridKey {
  key: string;
  ctrl: boolean;
}

export type Motion =
  /** Target cell, before clamping to the grid. */
  | { kind: "move"; to: number }
  /** First half of `gg`; the caller remembers it and swallows the key. */
  | { kind: "await-g" }
  | null;

/**
 * Arrows and Neovim motions, on the same footing.
 *
 * Both vocabularies are live at once rather than behind a setting: someone who
 * reaches for `j` does it without thinking, and someone who reaches for the
 * arrow key would not know a setting existed.
 */
export function gridMotion(key: GridKey, shape: GridShape): Motion {
  const { index, count, columns, rows, pendingG } = shape;
  if (count === 0) return null;

  // `gg` goes to the top. A pending `g` is spent by whatever follows, so a
  // stray one never sits waiting to change the meaning of a later key.
  if (pendingG) return key.key === "g" ? { kind: "move", to: 0 } : null;

  const half = Math.max(1, Math.ceil(rows / 2)) * columns;
  const page = Math.max(1, rows) * columns;

  const step = (offset: number): Motion =>
    // With nothing selected, the first press lands on the first card rather
    // than jumping into the middle of the grid.
    ({ kind: "move", to: index < 0 ? 0 : index + offset });

  if (key.ctrl) {
    switch (key.key) {
      case "d":
        return step(half);
      case "u":
        return step(-half);
      case "f":
        return step(page);
      case "b":
        return step(-page);
      default:
        return null;
    }
  }

  switch (key.key) {
    case "ArrowRight":
    case "l":
      return step(1);
    case "ArrowLeft":
    case "h":
      return step(-1);
    case "ArrowDown":
    case "j":
      return step(columns);
    case "ArrowUp":
    case "k":
      return step(-columns);
    // Ends of the current row, as in a line of text. Meaningless before
    // anything is selected, so they fall through to the first cell.
    case "0":
      return index < 0
        ? { kind: "move", to: 0 }
        : { kind: "move", to: index - (index % columns) };
    case "$":
      return index < 0
        ? { kind: "move", to: 0 }
        : { kind: "move", to: index - (index % columns) + columns - 1 };
    case "Home":
      return { kind: "move", to: 0 };
    case "End":
    case "G":
      return { kind: "move", to: count - 1 };
    case "g":
      return { kind: "await-g" };
    default:
      return null;
  }
}

/** Which way a list key press moves, or 0 when the key means nothing here. */
export function listStep(key: GridKey): number {
  if (key.key === "ArrowDown") return 1;
  if (key.key === "ArrowUp") return -1;
  // Inside a text field the letters themselves have to reach the field, so the
  // vertical motions are the control-key ones a Neovim picker uses.
  if (!key.ctrl) return 0;
  if (key.key === "j" || key.key === "n") return 1;
  if (key.key === "k" || key.key === "p") return -1;
  return 0;
}
