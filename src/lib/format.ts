export function formatSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} Go`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} Mo`;
}

export function formatLastPlayed(epochSeconds: number | null): string | null {
  if (!epochSeconds || epochSeconds <= 0) return null;

  const then = new Date(epochSeconds * 1000);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);

  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} jours`;
  return then.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Play time, rounded the way a launcher shows it. */
export function formatPlaytime(seconds: number | null): string | null {
  if (!seconds || seconds < 60) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = seconds / 3600;
  return hours < 10 ? `${hours.toFixed(1)} h` : `${Math.round(hours)} h`;
}

/** Coarse "how long ago", for the sync stamp. */
export function formatAgo(epochSeconds: number | null): string | null {
  if (!epochSeconds || epochSeconds <= 0) return null;

  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (seconds < 90) return "à l'instant";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  return formatLastPlayed(epochSeconds);
}

/** Case- and accent-insensitive, so "pokemon" finds "Pokémon". */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
