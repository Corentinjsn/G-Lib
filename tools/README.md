# tools

## `make-icon.ps1`

Compose l'icône de l'application à partir du logo (`public/GAMLIB.png`).

Le logo n'est pas utilisable tel quel comme icône : il est en deux aplats,
`#222222` pour les cartes et `#F6F4F0` pour le G, donc posé sur une barre des
tâches Windows sombre il disparaît. Le script le centre sur une pastille
arrondie crème — la couleur est reprise du G du logo, aucune teinte n'est
inventée — et rogne d'abord les marges transparentes pour que le cadrage
dépende du dessin plutôt que de la taille du fichier.

Régénérer le jeu d'icônes complet :

```powershell
powershell -ExecutionPolicy Bypass -File tools/make-icon.ps1 `
  -LogoFile public/GAMLIB.png -OutFile src-tauri/icons/icon-source.png -Size 1024
```

```bash
bun run tauri icon src-tauri/icons/icon-source.png
```

Deux pièges après coup :

- `tauri icon` produit aussi des variantes iOS et Android. Le projet ne vise que
  Windows, donc `src-tauri/icons/ios` et `src-tauri/icons/android` sont
  supprimés.
- Cargo ne surveille pas les fichiers d'icônes. Sans un `touch` sur
  `src-tauri/build.rs`, la ressource n'est pas ré-embarquée et le binaire garde
  l'ancienne icône.

Les paramètres `-Inset` (part du côté occupée par le logo, 0.72 par défaut) et
`-Background` permettent de recadrer ou de changer la pastille sans toucher au
code.
