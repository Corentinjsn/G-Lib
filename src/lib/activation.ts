import type { Platform } from "../types";

/**
 * Game keys, and which store a key probably belongs to.
 *
 * Each store prints its keys in its own groups of letters and digits. The
 * shapes overlap little, but they are a convention, not a contract: the guess
 * only preselects a store, and the user can always pick another.
 */

/** Uppercase, dashes between groups, no spaces -- the way keys are printed. */
export function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_–—]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Group lengths, `5-5-5` for `AAAAA-BBBBB-CCCCC`. */
function shape(key: string): string {
  return key
    .split("-")
    .map((group) => group.length)
    .join("-");
}

const SHAPES: Record<string, Platform> = {
  // Steam: three groups of five, sometimes five.
  "5-5-5": "steam",
  "5-5-5-5-5": "steam",
  // Epic: four groups of five.
  "5-5-5-5": "epic",
  // EA: five groups of four.
  "4-4-4-4-4": "ea",
  // Ubisoft: four groups of four, or a group of three first.
  "4-4-4-4": "ubisoft",
  "3-4-4-4": "ubisoft",
};

export function guessStore(raw: string): Platform | null {
  const key = normalizeKey(raw);
  if (!key.includes("-")) return null;
  return SHAPES[shape(key)] ?? null;
}

/** Long enough to be worth copying: the shortest shape is 15 characters. */
export function looksLikeKey(raw: string): boolean {
  return normalizeKey(raw).replace(/-/g, "").length >= 15;
}

/**
 * Ids present now that were not in `before`: the games a key just added.
 */
export function arrivals<T extends { id: string }>(
  before: ReadonlySet<string>,
  now: readonly T[],
): T[] {
  return now.filter((game) => !before.has(game.id));
}
