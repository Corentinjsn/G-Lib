import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * La place d'un contenu qui n'est pas encore la.
 *
 * Un ecran vide ne dit pas si l'application travaille ou si elle a fini ; un
 * texte « Chargement… » le dit mais ne prepare rien, et tout saute a
 * l'arrivee. Le squelette fait les deux : il occupe exactement la forme
 * attendue, et sa lueur dit que ca vient.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block rounded-md ${className}`} />;
}

/**
 * Une image distante, et sa place tenue jusqu'a ce qu'elle arrive.
 *
 * Les jaquettes et les captures de la boutique viennent du CDN de Steam :
 * quelques centaines de millisecondes ou l'espace serait vide, et la fiche se
 * reorganiserait a chaque arrivee. Le rapport de forme est donc impose des le
 * depart, et l'image n'apparait qu'une fois prete.
 *
 * `src` sert de cle : passer d'un jeu a l'autre remonte un composant neuf,
 * donc un squelette neuf, plutot que de laisser l'image precedente affichee
 * sous un nouveau titre.
 */
export function RemoteArt({
  src,
  className = "",
  imageClassName = "",
  fallback = null,
  ratio,
}: {
  src: string;
  /** Porte les coins et la position ; le squelette remplit le reste. */
  className?: string;
  imageClassName?: string;
  /** Ce qui reste quand l'image ne vient pas. */
  fallback?: ReactNode;
  /**
   * Rapport de forme, porte par l'image elle-meme.
   *
   * Le poser sur l'enveloppe ne suffit pas : dans une colonne flex, sa
   * largeur vient d'un etirement, que le calcul du rapport de forme ne
   * considere pas comme definie — la hauteur retombait a zero et la banniere
   * disparaissait sans la moindre erreur, ce qui est le pire des cas. Portee
   * par l'image, la contrainte tient partout.
   *
   * Sans `ratio`, l'image remplit ce que son parent lui donne.
   */
  ratio?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "broken">("loading");
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setState("loading");
    // Une image deja en cache peut etre complete avant meme que l'effet ne
    // parte : son evenement `load` est alors passe, et l'attendre laisserait
    // un squelette pour toujours.
    const node = image.current;
    if (node?.complete && node.naturalWidth > 0) setState("ready");
  }, [src]);

  if (state === "broken") return <>{fallback}</>;

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {state === "loading" && (
        <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" />
      )}
      <img
        ref={image}
        src={src}
        alt=""
        draggable={false}
        onLoad={() => setState("ready")}
        onError={() => setState("broken")}
        style={ratio ? { aspectRatio: ratio } : undefined}
        className={`block w-full object-cover transition-opacity duration-200 ${
          ratio ? "" : "h-full"
        } ${state === "ready" ? "opacity-100" : "opacity-0"} ${imageClassName}`}
      />
    </span>
  );
}
