import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from "../types";
import { PlatformIcon } from "./PlatformIcon";

/**
 * The store a game comes from, shown as its own mark.
 *
 * A logo is read at a glance where a word has to be; on a wall of cover art
 * that matters, and it keeps the badge small enough not to fight the artwork.
 * The name still reaches assistive technology and the tooltip through the
 * icon's own label.
 */
export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span
      title={PLATFORM_LABELS[platform]}
      className="inline-flex items-center rounded-md bg-surface-0/80 p-1 backdrop-blur-sm"
      style={{ color: PLATFORM_COLORS[platform] }}
    >
      <PlatformIcon platform={platform} className="size-3.5" />
    </span>
  );
}
