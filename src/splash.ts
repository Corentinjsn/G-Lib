import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import { SPLASH_EVENT, type SplashState } from "./lib/splash";

/**
 * Le script de la fenetre de demarrage.
 *
 * Il ne construit rien : `splash.html` est deja peint quand il arrive, avec
 * les trois etapes a leur etat de depart. Il ne fait que suivre ce que la
 * fenetre principale — cachee, en train de travailler — lui raconte.
 *
 * Pas de React ici, volontairement. Cette fenetre vit une seconde ou deux ;
 * evaluer un bundle avant de montrer quoi que ce soit reviendrait a afficher
 * un rectangle noir pendant tout ce temps.
 */

const steps = document.querySelectorAll<HTMLLIElement>("#steps li");
const version = document.getElementById("version");
const bar = document.getElementById("update-bar");
const title = document.getElementById("update-title");
const hint = document.getElementById("update-hint");

if (version) version.textContent = `v${__APP_VERSION__}`;

document
  .getElementById("quit")
  ?.addEventListener("click", () => void exit(0));

function render(state: SplashState) {
  state.steps.forEach((step, index) => {
    const node = steps[index];
    if (!node) return;
    node.dataset.state = step.state;
    const label = node.querySelector(".label");
    if (label) label.textContent = step.label;
  });

  document.body.dataset.updating = state.update ? "yes" : "no";
  if (!state.update) return;

  const percent = Math.round(state.update.progress * 100);
  if (title) {
    title.textContent = state.update.version
      ? `Mise à jour vers ${state.update.version}`
      : "Mise à jour";
  }
  if (bar) bar.style.width = `${percent}%`;
  // Une fois le telechargement fini, l'installeur travaille seul quelques
  // secondes sans rien dire. Sans cette ligne la barre reste pleine et la
  // fenetre a l'air bloquee.
  if (hint) {
    hint.textContent =
      state.update.progress >= 1
        ? "Installation…  l'application redémarrera toute seule."
        : `Téléchargement… ${percent} %`;
  }
}

void listen<SplashState>(SPLASH_EVENT, (event) => render(event.payload));
