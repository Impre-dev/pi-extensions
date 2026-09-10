# pi-extensions

Extensions pour [pi](https://github.com/badlogic/pi-mono) (pi-coding-agent).
Un repo, un dossier par extension — chaque extension embarque son `roadmap_<Projet>.md`
et `discovery_<Projet>.md`.

| Extension | Description | Install |
|---|---|---|
| [hub](hub/) | Écran d'accueil : workspaces & discussions, art braille | Copier `hub/hub.ts` dans `~/.pi/agent/extensions/` |
| [keybinds](keybinds/) | Tweaks UX fullscreen : sélection écran, cut/redo, molette, Ctrl+C sûr, F8 | Copier `keybinds/keybinds.ts` dans `~/.pi/agent/extensions/` |
| [multi-rules](multi-rules/) | Règles multi-fichiers : global + groupes + racines workspace (Pi-xel) | Copier `multi-rules/multi-rules.ts` dans `~/.pi/agent/extensions/` |

`custom-header/` : archive — rôle absorbé par le hub en v0.2.

## Sync install

Le script `dev/sync.ps1` copie les `.ts` du repo vers l'install (`~/.pi/agent/extensions/`) —
chemins relatifs au script, donc insensible au déplacement du repo.

## Dev

Chaque extension embarque son outillage dans `dev/` (typecheck, assets, outils).
Typecheck d'une extension :

```bash
cd <extension>/dev
npm i
npx tsc -p tsconfig.dev.json
```
