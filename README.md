# GAMLIB

Une bibliothèque de jeux unique pour Steam, Epic Games, EA et Ubisoft Connect.
Scanne les jeux **installés**, les affiche dans une grille de jaquettes, et les
lance d'un clic — sans ouvrir quatre launchers.

## Fonctionnement

Tout le scan est local : fichiers et registre Windows. Aucun login, aucune API
propriétaire, aucun token.

| Plateforme | Source | Lancement |
|---|---|---|
| Steam | `libraryfolders.vdf` puis `appmanifest_*.acf` par bibliothèque | `steam://rungameid/<appid>` |
| Epic | manifests JSON `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` | `com.epicgames.launcher://apps/<ns>:<item>:<app>?action=launch` |
| EA | entrées de désinstallation + `<jeu>\__Installer\installerdata.xml` → contentID | `origin2://game/launch?offerIds=<id>` |
| Ubisoft | `HKLM\...\Ubisoft\Launcher\Installs\<id>` | `uplay://launch/<id>/0` |

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

Jeux possédés non installés · choisir sa propre jaquette (et donc corriger une
correspondance ratée sans vider le cache) · suivi du temps de jeu · favoris et
catégories · GOG, Battle.net, Xbox · import de jeux manuels · détection
d'installation en temps réel.
