import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from "../types";

export function PlatformDot({ platform }: { platform: Platform }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ background: PLATFORM_COLORS[platform] }}
    />
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-surface-0/80 px-1.5 py-0.5 text-[10px] font-medium tracking-wide backdrop-blur-sm"
      style={{ color: PLATFORM_COLORS[platform] }}
    >
      <PlatformDot platform={platform} />
      {PLATFORM_LABELS[platform]}
    </span>
  );
}
