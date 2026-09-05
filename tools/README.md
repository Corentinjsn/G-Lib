# tools

## `make-icon.ps1`

Dessine l'icône de l'application. Elle n'est pas peinte à la main : c'est du
code, pour qu'un changement de palette reste une modification d'une ligne
plutôt qu'un aller-retour dans un éditeur d'images.

Trois cartes de jeu en éventail — orange EA, bleu Ubisoft, cyan Steam, les
mêmes accents que les pastilles de plateforme de la barre latérale — avec un
bouton lecture au centre. Le triangle fait environ deux tiers de la carte : en
dessous il disparaît dans un bouton de barre des tâches à 16 px, au-dessus la
carte cesse de se lire comme une carte.

Régénérer le jeu d'icônes complet :

```powershell
powershell -ExecutionPolicy Bypass -File tools/make-icon.ps1 `
  -OutFile src-tauri/icons/icon-source.png -Size 1024
```

```bash
bun run tauri icon src-tauri/icons/icon-source.png
```

`tauri icon` produit aussi des variantes iOS et Android. Le projet ne vise que
Windows, donc `src-tauri/icons/ios` et `src-tauri/icons/android` sont supprimés
après coup.
