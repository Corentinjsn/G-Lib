import { useEffect, useMemo, useRef, useState } from "react";
import { openStoreUrl, searchMarket } from "../lib/api";
import { normalize } from "../lib/format";
import { storeLinks, type StoreLink } from "../lib/stores";
import { PLATFORM_COLORS, type Game, type MarketItem } from "../types";
import { PlatformIcon } from "./PlatformIcon";

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

/** Le prix, remise comprise, ou ce qui en tient lieu. */
function Price({ item, large = false }: { item: MarketItem; large?: boolean }) {
  const size = large ? "text-base" : "text-[13px]";

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

  return (
    <span className="flex items-center gap-2">
      {item.price.discount > 0 && (
        <>
          <span className="rounded bg-[#4c6b22] px-1.5 py-0.5 text-[11px] font-semibold text-[#beee11]">
            −{item.price.discount} %
          </span>
          <span className={`${size} text-ink-faint line-through`}>
            {item.price.original}
          </span>
        </>
      )}
      <span className={`${size} font-semibold text-ink`}>
        {item.price.current}
      </span>
    </span>
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
  const [broken, setBroken] = useState(false);
  const art = broken ? null : item.coverUrl;

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
        {art ? (
          <img
            src={art}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
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

function StoreButton({
  link,
  onOpen,
}: {
  link: StoreLink;
  onOpen: (link: StoreLink) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(link)}
      title={
        link.exact
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
        // Instant Gaming n'est pas une plateforme de la bibliotheque : pas de
        // marque a emprunter, une etiquette fera l'affaire.
        <span className="flex size-4 items-center justify-center text-[13px] text-[#fa4b4b]">
          ⌁
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      <span className="shrink-0 text-[10px] text-ink-faint">
        {link.exact ? "fiche" : (link.note ?? "recherche")}
      </span>
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
        {item.headerUrl && (
          <img
            src={item.headerUrl}
            alt=""
            draggable={false}
            className="w-full rounded-lg object-cover"
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
              <img
                key={shot}
                src={shot}
                alt=""
                loading="lazy"
                draggable={false}
                className="w-full rounded object-cover"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <span className="text-[10px] tracking-widest text-ink-faint uppercase">
            Acheter
          </span>
          {/* Steam ouvre la fiche du jeu ; les autres n'ont pas de catalogue
              public a interroger, donc leur recherche, titre deja saisi. */}
          {storeLinks(item).map((link) => (
            <StoreButton key={link.id} link={link} onOpen={onOpen} />
          ))}
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
            current && items.some((item) => item.appid === current.appid)
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
          {results.length > 0 ? (
            // Largeur fixe, comme la grille de la bibliotheque : ouvrir une
            // fiche ne doit pas redimensionner ce qu'on regarde.
            <div className="grid grid-cols-[repeat(auto-fill,170px)] justify-start gap-3 p-4">
              {results.map((item) => (
                <Card
                  key={item.appid}
                  item={item}
                  owned={owned.has(normalize(item.name))}
                  selected={selected?.appid === item.appid}
                  onSelect={() => setSelected(item)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-sm text-ink-muted">
                {loading
                  ? "Recherche…"
                  : searched
                    ? "Aucun jeu ne correspond."
                    : "Cherchez un jeu par son titre."}
              </p>
              {!searched && !loading && (
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
