import { PLATFORM_LABELS, type MarketItem, type Platform } from "../types";

/**
 * Ou acheter un jeu.
 *
 * Seul Steam publie un prix sans compte ni cle : c'est pour cela que la fiche
 * en montre un seul. Les autres boutiques ne sont pas devinees pour autant —
 * elles sont ouvertes sur leur propre recherche, le titre deja saisi, ce qui
 * est exactement le geste qu'on ferait a la main.
 *
 * Les adresses sont construites ici mais verifiees dans le backend
 * (`launcher::open_store_url`) : une commande qui ouvrirait l'URL qu'on lui
 * tend serait une passerelle vers le shell.
 */

export interface StoreLink {
  id: string;
  label: string;
  /** L'une des quatre plateformes connues, quand c'en est une. */
  platform: Platform | null;
  url: string;
  /** Ce que le clic donne : la fiche du jeu, ou une recherche. */
  exact: boolean;
  note?: string;
}

export function storeLinks(item: MarketItem): StoreLink[] {
  const term = encodeURIComponent(item.name);

  return [
    {
      id: "steam",
      label: PLATFORM_LABELS.steam,
      platform: "steam",
      // Un jeu venu du catalogue general n'a pas de page Steam : on y cherche
      // le titre, comme chez les autres.
      url:
        item.storeUrl ??
        `https://store.steampowered.com/search/?term=${term}`,
      exact: item.storeUrl !== null,
    },
    {
      id: "epic",
      label: PLATFORM_LABELS.epic,
      platform: "epic",
      url: `https://store.epicgames.com/fr/browse?q=${term}&sortBy=relevancy&sortDir=DESC`,
      exact: false,
    },
    {
      id: "ea",
      label: PLATFORM_LABELS.ea,
      platform: "ea",
      url: `https://www.ea.com/fr-fr/results?query=${term}`,
      exact: false,
    },
    {
      id: "ubisoft",
      label: PLATFORM_LABELS.ubisoft,
      platform: "ubisoft",
      url: `https://store.ubisoft.com/fr/search?q=${term}`,
      exact: false,
    },
    {
      id: "instant-gaming",
      label: "Instant Gaming",
      platform: null,
      url: `https://www.instant-gaming.com/fr/rechercher/?q=${term}`,
      exact: false,
      note: "revendeur de clés",
    },
  ];
}
