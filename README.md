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

### Bibliothèque vivante

Installer ou supprimer un jeu réécrit un fichier dans un dossier déjà connu :
un manifeste `.acf` pour Steam, un `.item` pour Epic. Ces dossiers sont
surveillés, donc un jeu désinstallé perd simplement sa carte, sans qu'il faille
penser à cliquer sur Sync.

EA et Ubisoft déclarent leurs jeux dans le registre plutôt que dans des
fichiers : eux sont rattrapés par l'analyse qui a lieu au retour sur la
fenêtre.

### Navigation et listes

La barre latérale est une navigation à la Steam : « Tous les jeux », vos listes,
puis un groupe par plateforme. Chaque groupe se déplie pour révéler ses jeux par
nom ; cliquer sur l'un d'eux ouvre sa fiche sans changer le filtre.

Les listes sont libres et un jeu peut appartenir à plusieurs d'entre elles. On
les remplit au clic droit sur un jeu — les listes s'y affichent en cases à
cocher — et on les renomme ou supprime au clic droit sur la liste elle-même.

L'appartenance est stockée sur la liste (`collections.json`), pas sur le jeu :
chaque analyse reconstruit la bibliothèque depuis les launchers, donc tout ce
qui serait porté par un `Game` disparaîtrait avec elle.

### Historique de jeu

Aucune boutique n'expose localement le temps de jeu, et seule Steam donne une
date de dernière session. GAMLIB tient donc le sien : chaque jeu installé a un
dossier, donc un processus dont l'exécutable est sous ce dossier *est* ce jeu
qui tourne. La méthode vaut pour les quatre plateformes, sans authentification,
et donne la dernière session comme le temps cumulé. Steam reste la référence
quand son horodatage est plus récent.

### Favoris, jeux masqués, raccourcis

Le clic droit sur un jeu permet de le marquer favori ou de le masquer. Les jeux
masqués disparaissent de toutes les vues sauf « Masqués », qui n'apparaît que
s'il y en a. Comme les listes, ces marques vivent dans leur propre fichier
(`flags.json`) : chaque sync reconstruit la bibliothèque depuis les launchers.

Au clavier : `/` pour la recherche, flèches pour parcourir la grille, Entrée pour
lancer, Échap pour quitter un champ.

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

Tests. Le frontend couvre la logique pure — filtrage, tri, formatage — extraite
dans `src/lib/` précisément pour être exerçable hors React :

```bash
bun test
```

Côté Rust, sur des fixtures réelles (`src-tauri/tests/fixtures/`) :

```bash
cd src-tauri
cargo test
cargo test -- --ignored --nocapture dump_real_library   # dump de la machine
```

## Mises à jour

L'application cherche une version plus récente au démarrage, pendant l'écran de
chargement. S'il y en a une, un bouton apparaît en bas de la barre latérale :
il télécharge, installe et relance.

Tauri refuse d'installer une mise à jour non signée. La paire de clés vit **hors
du dépôt**, par défaut `%USERPROFILE%\.gamlib\updater.key` — la perdre revient à
ne plus pouvoir publier de mise à jour pour les installations existantes.

Publier une version :

```powershell
# bumper la version dans package.json, Cargo.toml et tauri.conf.json d'abord
powershell -ExecutionPolicy Bypass -File tools/make-release.ps1
```

Le script construit, signe, et assemble le `latest.json` attendu par l'updater,
puis affiche la commande `gh release create` à lancer. `latest.json` doit être
un asset de la release **la plus récente** : l'updater le lit via
`/releases/latest/download/latest.json`.

## Architecture

- `src-tauri/src/scanners/` — un module par plateforme, chacun renvoyant des
  `Game` normalisés ; `mod.rs` agrège et isole les pannes.
- `src-tauri/src/vdf.rs` — KeyValues texte de Valve (`.vdf`, `.acf`).
- `src-tauri/src/binvdf.rs` — KeyValues **binaire**, un format distinct, pour la
  liste de licences Steam.
- `src-tauri/src/steam_store.rs` — client des endpoints store publics.
- `src-tauri/src/launcher.rs` — `ShellExecuteW` sur l'URI de la plateforme.
- `src-tauri/src/artwork.rs` — jaquettes, cache disque, servies via le
  protocole `asset` de Tauri (la CSP reste fermée aux hôtes distants).
- `src-tauri/src/collections.rs` — les listes de l'utilisateur.
- `src-tauri/src/playtime.rs` — sessions de jeu, par surveillance des processus.
- `src-tauri/src/flags.rs` — favoris et jeux masqués.
- `src-tauri/src/watcher.rs` — surveillance des dossiers des launchers.
- `src/lib/library.ts` — filtrage et tri de la bibliothèque, sans React.
- `src/` — React + Tailwind. `types.ts` est le miroir de `models.rs`.

Le cache de bibliothèque porte un `SCHEMA_VERSION` : un fichier écrit par une
version antérieure du modèle est écarté volontairement, plutôt que de rater sa
désérialisation et d'être perdu en silence.

## Pas encore fait

Jeux possédés côté EA et Ubisoft (aucune source locale — il faudrait
s'authentifier) · choisir sa propre jaquette, et donc corriger une
correspondance ratée sans vider le cache · suivi du temps de jeu ·
GOG, Battle.net, Xbox · import de jeux manuels · détection d'installation en
temps réel.
