# Roadmap SessionHub

> Document de pilotage — statut au 08/09. Extension pi : écran d'accueil
> workspaces & discussions avec art braille (tête anime, vert flat).
> Source de dev : `test_pi/session-hub/` — install : `~/.pi/agent/extensions/session-hub.ts`.

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|
| v0.2 | Cosmétique : art statique vert flat, zéro bordure, padding. Fusion header : session-hub absorbe custom-header.ts (logo pi en session normale, header minimal sur home, custom-header retiré de l'install — backup `custom-header/`). Souris : `handleMouse` (liste + molette + options du bas cliquables, actif fullscreen), libellés New/Rename/Quitter | `59b5356` |
| v0.1 | Écran d'accueil hub : `/hub` + auto-launch sur home, navigation 2 niveaux (workspaces → discussions), Enter/Ctrl+N/Ctrl+R/Esc, art braille vert flat + shimmer 8 FPS. Validé en TUI par Impre (retours → file v0.2) | `8915832` |
| — | Backup custom-header archivé dans `custom-header/` avant absorption v0.2 | voir git log |

## 🎯 File priorisée

*(vide — en attente des retours d'usage d'Impre)*

## 🧠 Leçons de plateforme (à ne plus retester)

1. **`switchSession` n'existe que sur `ExtensionCommandContext`** — le ctx des events ne l'expose pas au typage : runtime-check + fallback `setEditorText("/hub")` (pattern actuel du hub).
2. **PowerShell 5.1 lit les `.txt` en ANSI sauf BOM UTF-8** — toute préview destinée à un `cat` PS doit porter un BOM.
3. **Le braille Unicode se rééchantillonne comme une image** — decode 2×4 dots → box-average → re-encode (`tools/braille-resize.mjs`) ; les dots braille sont ~carrés en terminal, le ratio se conserve au niveau dots.
4. **La capture souris n'est active qu'en mode fullscreen** (`tuiMode: "fullscreen"`) — en regular, le terminal garde le scrollback. `handleMouse` s'implémente quand même : inerte en regular, actif dès la bascule.
5. **`TuiMouseEvent` (x, y) est local au composant récepteur** — pour forwarder à un enfant rendu dans une sous-zone, retarget manuel (shift x/y) avant `handleMouse` enfant.
6. **`ctx.setHeader` se rejoue à chaque `session_start`** — un replacement de session (switch) re-fire `session_start` : un seul handler gère les deux modes (hub sur home, logo ailleurs).
