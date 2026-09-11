import { useEffect, useMemo, useRef, useState } from "react";
import instantGamingMark from "../assets/instant-gaming.png";
import { openStoreUrl, searchMarket, storeOffers } from "../lib/api";
import { normalize } from "../lib/format";
import { storeLinks, type StoreLink } from "../lib/stores";
import {
  PLATFORM_COLORS,
  type Game,
  type MarketItem,
  type MarketPrice,
  type Offers,
  type ShopDeal,
} from "../types";
import { PlatformIcon } from "./PlatformIcon";
import { RemoteArt, Skeleton } from "./Skeleton";

interface Props {
  /** Toute la bibliotheque, pour reconnaitre ce qui est deja possede. */
  library: Game[];
  onError: (message: string) => void;
}

/** Attente avant de lancer la recherche, en millisecondes. */
const DEBOUNCE_MS = 450;

/** En dessous, tout le catalogue repondrait. */
const MIN_QUERY = 2;

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4 shrink-0 text-ink-faint"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

/** Un prix, remise comprise. La pastille verte est celle de Steam. */
function PriceTag({
  price,
  large = false,
}: {
  price: MarketPrice;
  large?: boolean;
}) {
  const size = large ? "text-base" : "text-[13px]";

  return (
    <span className="flex items-center gap-2">
      {price.discount > 0 && (
        <>
          <span className="rounded bg-[#4c6b22] px-1.5 py-0.5 text-[11px] font-semibold text-[#beee11]">
            −{price.discount} %
          </span>
          <span className="text-[11px] text-ink-faint line-through">
            {price.original}
          </span>
        </>
      )}
      <span className={`${size} font-semibold text-ink`}>{price.current}</span>
    </span>
  );
}

/** Le prix Steam du jeu, ou ce qui en tient lieu. */
function Price({ item, large = false }: { item: MarketItem; large?: boolean }) {
  const size = large ? "text-base" : "text-[13px]";

  // Venu du catalogue general : Steam ne le vend pas, donc il n'en donne pas
  // le prix. Le dire vaut mieux qu'un tiret, qui se lit comme une panne.
  if (item.appid === null) {
    return (
      <span className={`${size} text-ink-faint`}>Pas vendu sur Steam</span>
    );
  }
  if (item.free) {
    return <span className={`${size} text-ink-muted`}>Gratuit</span>;
  }
  if (!item.price) {
    return (
      <span className={`${size} text-ink-faint`}>
        {item.comingSoon ? "Bientôt" : "—"}
      </span>
    );
  }
  return <PriceTag price={item.price} large={large} />;
}

/** Une carte de resultat, avant que la recherche n'ait repondu. */
function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-surface-2">
      <Skeleton className="aspect-[2/3] w-full rounded-none" />
      <span className="flex min-h-[52px] flex-col gap-2 p-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-12" />
      </span>
    </div>
  );
}

function Card({
  item,
  owned,
  selected,
  onSelect,
}: {
  item: MarketItem;
  owned: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={item.name}
      className={`group flex flex-col overflow-hidden rounded-lg bg-surface-2 text-left transition duration-150 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 ${
        selected ? "ring-2 ring-accent" : ""
      }`}
    >
      <span className="relative block aspect-[2/3] w-full overflow-hidden bg-surface-3">
        {item.coverUrl ? (
          <RemoteArt
            // La cle remonte un composant neuf a chaque jeu : sans elle, la
            // jaquette precedente resterait sous un nouveau nom le temps que
            // la sienne arrive.
            key={item.coverUrl}
            src={item.coverUrl}
            className="absolute inset-0 h-full w-full"
            fallback={
              <span className="flex h-full w-full items-center justify-center p-3 text-center text-sm font-semibold text-ink-muted">
                {item.name}
              </span>
            }
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-3 text-center text-sm font-semibold text-ink-muted">
            {item.name}
          </span>
        )}

        {/* Le seul fait que la boutique ne sait pas et que l'application, si :
            ce jeu est deja a vous. */}
        {owned && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-surface-0/85 px-1.5 py-1 text-[10px] font-medium text-accent backdrop-blur-sm">
            Dans votre bibliothèque
          </span>
        )}
      </span>

      <span className="flex min-h-[52px] flex-col gap-1 p-2">
        <span className="line-clamp-2 text-xs leading-snug font-medium text-ink">
          {item.name}
        </span>
        <Price item={item} />
      </span>
    </button>
  );
}

/**
 * Une boutique, et ce qu'elle demande pour ce jeu.
 *
 * Le prix n'arrive pas avec la fiche : il faut le chercher chez chacune. Tant
 * qu'il n'est pas la, la ligne dit ce qu'elle sait deja — qu'elle mene a une
 * fiche ou a une recherche — plutot que de laisser un trou qui se remplira.
 */
function StoreButton({
  link,
  price,
  loading,
  exact,
  onOpen,
}: {
  link: StoreLink;
  price: MarketPrice | null;
  loading: boolean;
  /** La boutique a nomme la page du jeu, plutot qu'une recherche. */
  exact: boolean;
  onOpen: (link: StoreLink) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(link)}
      title={
        exact
          ? `Ouvrir la fiche ${link.label}`
          : `Chercher ce titre sur ${link.label}`
      }
      className="flex items-center gap-2.5 rounded-md border border-line bg-surface-2 px-3 py-2 text-left text-sm text-ink-muted transition hover:border-accent hover:text-ink"
    >
      {link.platform ? (
        <span style={{ color: PLATFORM_COLORS[link.platform] }}>
          <PlatformIcon platform={link.platform} className="size-4" />
        </span>
      ) : (
        <img
          src={instantGamingMark}
          alt=""
          draggable={false}
          className="size-4 shrink-0"
        />
      )}
      <span className="min-w-0 flex-1 truncate">{link.label}</span>

      {price ? (
        <PriceTag price={price} />
      ) : loading ? (
        <Skeleton className="h-3.5 w-14 shrink-0" />
      ) : (
        <span className="shrink-0 text-[10px] text-ink-faint">
          {exact ? "fiche" : (link.note ?? "recherche")}
        </span>
      )}
    </button>
  );
}

/**
 * Une boutique que l'application ne connaissait pas.
 *
 * Pas de marque a montrer — il y en a une cinquantaine et elles vont et
 * viennent — donc le nom suffit. La ligne est plus discrete que les cinq du
 * dessus : ce sont des boutiques ou l'on achete une cle, pas un launcher
 * installe sur la machine.
 */
function ShopRow({
  deal,
  onOpen,
}: {
  deal: ShopDeal;
  onOpen: (link: StoreLink) => void;
}) {
  const openable = Boolean(deal.url);

  return (
    <button
      type="button"
      disabled={!openable}
      onClick={() =>
        deal.url &&
        onOpen({
          id: deal.shop,
          label: deal.shop,
          platform: null,
          url: deal.url,
          exact: true,
        })
      }
      title={
        openable
          ? `Ouvrir ${deal.shop}`
          : `${deal.shop} — lien indisponible`
      }
      className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] transition ${
        openable
          ? "text-ink-muted hover:bg-surface-2 hover:text-ink"
          : "cursor-default text-ink-faint"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{deal.shop}</span>
      <PriceTag price={deal.price} />
    </button>
  );
}

function Detail({
  item,
  owned,
  onClose,
  onOpen,
}: {
  item: MarketItem;
  owned: boolean;
  onClose: () => void;
  onOpen: (link: StoreLink) => void;
}) {
  // null tant que la reponse n'est pas la : c'est ce qui distingue « on
  // cherche encore » de « cette boutique ne l'a pas ».
  const [offers, setOffers] = useState<Offers | null>(null);

  useEffect(() => {
    setOffers(null);
    let cancelled = false;
    storeOffers(item.name, item.appid)
      .then((found) => {
        if (!cancelled) setOffers(found);
      })
      // Un prix absent n'a rien d'un incident : la ligne redevient un simple
      // lien de recherche, et l'utilisateur n'a pas a etre averti.
      .catch(() => {
        if (!cancelled) {
          setOffers({
            stores: [],
            elsewhere: [],
            historyLow: null,
            aggregated: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.name]);

  const released = item.releaseDate
    ? new Date(item.releaseDate * 1000).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const studios = [...new Set([...item.developers, ...item.publishers])];

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-line bg-surface-1">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <h2 className="text-base leading-tight font-semibold text-ink">
          {item.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="rounded-md px-2 py-1 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {/* Le rapport de forme est celui de la banniere Steam : impose ici,
            il empeche la fiche de se reorganiser quand l'image arrive. */}
        {item.headerUrl && (
          <RemoteArt
            key={item.headerUrl}
            src={item.headerUrl}
            ratio="460 / 215"
            className="w-full rounded-lg"
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <Price item={item} large />
          {owned && (
            <span className="text-[11px] text-accent">
              Déjà dans votre bibliothèque
            </span>
          )}
        </div>

        {item.shortDescription && (
          <p className="text-[13px] leading-relaxed text-ink-muted select-text">
            {item.shortDescription}
          </p>
        )}

        <div className="flex flex-col gap-2 text-xs text-ink-faint">
          {studios.length > 0 && (
            <span className="select-text">{studios.join(" · ")}</span>
          )}
          {released && (
            <span>
              {item.comingSoon ? "Sortie prévue " : "Sorti le "}
              {released}
            </span>
          )}
        </div>

        {item.screenshots.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {item.screenshots.map((shot) => (
              <RemoteArt
                key={shot}
                src={shot}
                ratio="16 / 9"
                className="w-full rounded"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <span className="text-[10px] tracking-widest text-ink-faint uppercase">
            Acheter
          </span>
          {/* Steam donne son prix avec la fiche ; Epic, Ubisoft et Instant
              Gaming sont interroges a l'ouverture. EA ne publie rien. */}
          {storeLinks(item).map((link) => {
            const offer = offers?.stores.find((entry) => entry.store === link.id);
            const price =
              link.id === "steam"
                ? item.free
                  ? null
                  : item.price
                : (offer?.price ?? null);

            return (
              <StoreButton
                key={link.id}
                // La boutique a souvent nomme la page exacte du jeu ; on la
                // prefere alors a sa recherche.
                link={offer?.url ? { ...link, url: offer.url } : link}
                price={price}
                loading={link.id !== "steam" && offers === null}
                exact={link.exact || Boolean(offer?.url)}
                onOpen={onOpen}
              />
            );
          })}

          {/* Sans comparateur, EA n'a aucune source publique. Dit une fois, en
              bas, plutot que sur une ligne muette qu'on prendrait pour un
              chargement qui n'aboutit pas. */}
          {offers !== null &&
            !offers.stores.some((entry) => entry.store === "ea") && (
              <p className="pt-1 text-[11px] leading-snug text-ink-faint">
                {offers.aggregated
                  ? "Aucun prix EA pour ce titre : sa ligne mène à une recherche."
                  : "EA ne publie aucun prix hors de son application : sa ligne mène à une recherche."}
              </p>
            )}

          {offers !== null && offers.elsewhere.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <span className="text-[10px] tracking-widest text-ink-faint uppercase">
                Ailleurs
              </span>
              {/* La moins chere en tete : c'est la seule raison de lire cette
                  liste. */}
              {offers.elsewhere.slice(0, 8).map((deal) => (
                <ShopRow key={deal.shop} deal={deal} onOpen={onOpen} />
              ))}
            </div>
          )}

          {offers?.historyLow && (
            <p className="text-[11px] text-ink-faint">
              Plus bas historique : {offers.historyLow}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * La boutique.
 *
 * La bibliotheque dit ce qu'on possede ; ceci dit ce qui existe. Le catalogue
 * vient de Steam, seul a en publier un sans compte ni cle — mais les liens
 * d'achat vont aux quatre plateformes et a Instant Gaming, parce qu'un jeu vu
 * ici ne s'achete pas forcement la ou on l'a trouve.
 */
export function Market({ library, onError }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<MarketItem | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  // Ce qu'on possede deja, par nom : la boutique ne connait que Steam, mais
  // un jeu achete chez EA porte le meme titre.
  const owned = useMemo(
    () => new Set(library.map((game) => normalize(game.name))),
    [library],
  );

  const term = query.trim();

  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    // Chaque frappe couterait deux requetes a Steam : on attend que la main
    // s'arrete.
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMarket(term)
        .then((items) => {
          if (cancelled) return;
          setResults(items);
          setSearched(true);
          // La fiche ouverte parle d'une recherche precedente.
          setSelected((current) =>
            current && items.some((item) => item.id === current.id)
              ? current
              : null,
          );
        })
        .catch((cause) => {
          if (!cancelled) onError(`Recherche impossible : ${cause}`);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, onError]);

  const open = (link: StoreLink) => {
    void openStoreUrl(link.url).catch((cause) =>
      onError(`Impossible d'ouvrir ${link.label} : ${cause}`),
    );
  };

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <div className="relative flex w-full max-w-lg items-center gap-2.5 rounded-md border border-line bg-surface-2 px-3 focus-within:border-accent">
            <SearchIcon />
            <input
              ref={field}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Chercher un jeu à acheter…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </div>

          <span className="text-xs text-ink-faint">
            {loading
              ? "Recherche…"
              : searched
                ? `${results.length} ${results.length > 1 ? "résultats" : "résultat"}`
                : "Catalogue Steam"}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Une premiere recherche montre des cartes en attente ; une
              recherche qui en suit une autre garde les resultats a l'ecran,
              sans quoi la grille clignoterait a chaque frappe. */}
          {results.length === 0 && loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,170px)] justify-start gap-3 p-4">
              {Array.from({ length: 10 }, (_, index) => (
                <CardSkeleton key={index} />
              ))}
            </div>
          ) : results.length > 0 ? (
            // Largeur fixe, comme la grille de la bibliotheque : ouvrir une
            // fiche ne doit pas redimensionner ce qu'on regarde.
            <div className="grid grid-cols-[repeat(auto-fill,170px)] justify-start gap-3 p-4">
              {results.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  owned={owned.has(normalize(item.name))}
                  selected={selected?.id === item.id}
                  onSelect={() => setSelected(item)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              {/* La recherche en cours a ses cartes en attente ; ce qui reste
                  ici, c'est le depart et le vide. */}
              <p className="text-sm text-ink-muted">
                {searched
                  ? "Aucun jeu ne correspond."
                  : "Cherchez un jeu par son titre."}
              </p>
              {!searched && (
                <p className="max-w-sm text-xs text-ink-faint">
                  Le catalogue et les prix viennent de Steam. Les liens d'achat
                  mènent aussi à Epic, EA, Ubisoft et Instant Gaming.
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {selected && (
        <Detail
          item={selected}
          owned={owned.has(normalize(selected.name))}
          onClose={() => setSelected(null)}
          onOpen={open}
        />
      )}
    </>
  );
}
