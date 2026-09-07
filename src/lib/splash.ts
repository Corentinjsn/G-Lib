/**
 * Ce que la fenetre de demarrage affiche, et le canal par lequel elle
 * l'apprend.
 *
 * Deux fenetres se partagent ces types : la principale, cachee, qui sait ou en
 * est le demarrage, et la petite, qui n'a que ce qu'on lui envoie.
 */

export type StepState = "pending" | "active" | "done";

export interface SplashStep {
  label: string;
  state: StepState;
}

export interface SplashUpdate {
  version: string | null;
  /** 0 to 1. Stays at 0 until the server reports a content length. */
  progress: number;
}

export interface SplashState {
  steps: SplashStep[];
  /** Non nul pendant une mise a jour, qui remplace alors les etapes. */
  update: SplashUpdate | null;
}

/** L'evenement que la fenetre principale emet a chaque changement d'etat. */
export const SPLASH_EVENT = "splash:state";

/**
 * Ce qui s'affiche avant le premier evenement.
 *
 * La petite fenetre parait avant que la principale n'ait charge son bundle :
 * pendant ces quelques centaines de millisecondes il vaut mieux montrer la
 * premiere etape en cours qu'une liste vide.
 */
export const INITIAL_SPLASH: SplashState = {
  steps: [
    { label: "Vérification des mises à jour", state: "active" },
    { label: "Lecture des launchers", state: "pending" },
    { label: "Catalogue en ligne", state: "pending" },
  ],
  update: null,
};
