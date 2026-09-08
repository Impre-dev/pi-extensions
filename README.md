# pi-extensions

Extensions pour [pi](https://github.com/badlogic/pi-mono) (pi-coding-agent).
Un repo, un dossier par extension — les `roadmap_<Projet>.md` vivent à la racine.

| Extension | Description | Install |
|---|---|---|
| [session-hub](session-hub/) | Écran d'accueil : workspaces & discussions, art braille | Copier `session-hub/session-hub.ts` dans `~/.pi/agent/extensions/` |

## Dev

Chaque extension embarque son outillage dans `dev/` (typecheck, assets, outils).
Typecheck d'une extension :

```bash
cd <extension>/dev
npm i
npx tsc -p tsconfig.dev.json
```
