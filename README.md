# GAMLIB

Une bibliothèque de jeux unique pour Steam, Epic Games, EA et Ubisoft Connect.
Affiche les jeux **installés** comme ceux que vous **possédez sans les avoir
installés**, dans une grille de jaquettes, et les lance — ou les installe —
d'un clic, sans ouvrir quatre launchers.

## Fonctionnement

Tout le scan est local : fichiers et registre Windows. Aucun login, aucune API
propriétaire, aucun token.

### Jeux installés

| Plateforme | Source | Lancement |
|---|---|---|
| Steam | `libraryfolders.vdf` puis `appmanifest_*.acf` par bibliothèque | `steam://rungameid/<appid>` |
| Epic | manifests JSON `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` | `com.epicgames.launcher://apps/<ns>:<item>:<app>?action=launch` |
| EA | entrées de désinstallation + `<jeu>\__Installer\installerdata.xml` → contentID | `origin2://game/launch?offerIds=<id>` |
| Ubisoft | `HKLM\...\Ubisoft\Launcher\Installs\<id>` | `uplay://launch/<id>/0` |

### Jeux possédés, non installés

| Plateforme | Source | Installation |
|---|---|---|
| Steam | `appcache\packageinfo.vdf` — la liste des licences, en VDF binaire. Les appids sont ensuite nommés et illustrés par l'API store, qui écarte au passage DLC, bandes-son et outils | `steam://install/<appid>` |
| Epic | `Data\Catalog\catcache.bin` — le catalogue du compte, déjà lu pour les jaquettes | `com.epicgames.launcher://apps/...?action=install` |
| EA · Ubisoft | **aucune** : ces launchers ne gardent en local que ce qui est installé | — |

Le fichier de licences Steam n'est pas une heuristique : tous les jeux
installés y figurent. Il accorde en revanche bien plus d'appids que de jeux
(562 pour 148 jeux sur une bibliothèque réelle), d'où le tri par l'API store.
Les réponses — y compris les négatives, qui sont la majorité — sont mises en
cache dans `steam-store.json`, sans quoi des centaines d'appids seraient
réinterrogés à chaque lancement.

La grille s'ouvre sur les jeux installés ; un sélecteur donne accès à
« Tous » et « À installer ». Les jeux non installés sont grisés et portent un
badge ↓.

### Jaquettes

Trois sources, aucune ne demandant de clé d'API ni de compte :

- **Steam** : le cache local du client (`appcache\librarycache`) d'abord —
  instantané et hors ligne. À défaut, l'endpoint `IStoreBrowseService/GetItems`
  donne le chemin haché des assets, seul moyen d'atteindre l'art des jeux
  récents (l'ancienne route `apps/<appid>/library_600x900.jpg` renvoie 404 pour
  eux).
- **Epic** : le launcher garde le catalogue du compte dans
  `Data\Catalog\catcache.bin` (JSON encodé en base64), avec l'art
  `DieselGameBoxTall`. La correspondance se fait sur l'ID de catalogue — exacte,
  sans deviner de nom.
- **EA et Ubisoft** : aucune source gratuite. La plupart de leurs titres sont
  aussi sur Steam, donc le jeu y est cherché par nom. Correspondance exacte
  d'abord ; sinon le plus long titre Steam qui est un préfixe du nôtre, ce qui
  rattrape les éditions absentes du store (`Siege X` → `Siege`, `Open Beta` →
  le jeu de base). Un titre sans correspondance sûre garde sa vignette générée
  plutôt que d'afficher la jaquette d'un autre jeu.

Un launcher absent ou cassé n'empêche jamais les autres d'être scannés :
l'erreur est remontée dans la barre latérale, pas propagée.

## Développement

Prérequis : [Bun](https://bun.sh), Rust stable, MSVC build tools, WebView2.

```bash
bun install
bun run tauri dev      # lance l'app
bun run tauri build    # produit le .msi
```

Tests des scanners, sur des fixtures réelles (`src-tauri/tests/fixtures/`) :

```bash
cd src-tauri
cargo test
cargo test -- --ignored --nocapture dump_real_library   # dump de la machine
```

## Architecture

- `src-tauri/src/scanners/` — un module par plateforme, chacun renvoyant des
  `Game` normalisés ; `mod.rs` agrège et isole les pannes.
- `src-tauri/src/vdf.rs` — parser du format KeyValues de Valve.
- `src-tauri/src/launcher.rs` — `ShellExecuteW` sur l'URI de la plateforme.
- `src-tauri/src/artwork.rs` — jaquettes, cache disque, servies via le
  protocole `asset` de Tauri (la CSP reste fermée aux hôtes distants).
- `src/` — React + Tailwind. `types.ts` est le miroir de `models.rs`.

## Pas encore fait

Jeux possédés côté EA et Ubisoft (aucune source locale — il faudrait
s'authentifier) · choisir sa propre jaquette, et donc corriger une
correspondance ratée sans vider le cache · suivi du temps de jeu · favoris et
catégories · GOG, Battle.net, Xbox · import de jeux manuels · détection
d'installation en temps réel.
