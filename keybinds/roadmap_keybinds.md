# Roadmap keybinds

> Document de pilotage — statut au 10/09. Extension pi : tweaks UX fullscreen Windows.
> Source de dev : `keybinds/` — install : `~/.pi/agent/extensions/keybinds.ts`.
> (ex-MyPiKeybinds — renommé et centralisé dans pi-extensions le 10/09.)

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|
| v1.0 | Centralisation : l'extension rejoint pi-extensions (ex-MyPiKeybinds → keybinds, contenu copy-only — aucun code modifié à la migration) : Ctrl+C sûr, sélection écran, cut/redo one-shot, molette ×4, F8. Doc : `keybinds/PI-keybinds List.md`. + scripts repo `dev/sync.ps1` (sync repo→install, relocation-proof) et `move-and-rename.ps1` (archive de la migration) | 0a445e9 |
| v1.1 | Vue épurée du transcript (**F5**) : tool rows masquées via override render posé sur chaque instance ToolExecutionComponent (immunisé au reset `updateDisplay`, délégation native en OFF), thinking forcé caché samplé/restauré, **scroll anchor OSC-133** — capture de l'ordinal du message lu → `renderNow()` synchrone → restore avec disableFollow (fix F-01 « descend tt en bas »), sweep streaming event-driven (`message_update` / `tool_execution_*`, zéro polling). Typecheck strict ✅ (`keybinds/dev/tsconfig.dev.json`). Validé TUI Impre. Historique du choix de touche : ctrl+alt+shift+p morte en legacy (leçon #1) → alias ctrl+alt+p → F5 retenu | 1ecba22 |

## 🎯 File priorisée

Aucun point ouvert. En attente de décision (discovery) : F-04 (mode épuré persisté), F-05 (listeners perdus après switch tui-mode à chaud — backport du fix lazy au Ctrl+C/molette).

## 🧠 Leçons de plateforme

1. **SHIFT perdu sur les lettres en encodage legacy** — terminal sans protocole clavier kitty : `ctrl+alt+shift+lettre` arrive physiquement comme `ctrl+alt+lettre`, et `matchesKey` de pi-tui ne gère le fallback legacy que pour ctrl+alt SANS shift (keys.js) → un binding shift+lettre ne matche jamais. Prouvé : v1 ctrl+alt+shift+p muette, alias v2 fired sur les deux pressions (même octet reçu), F5 ok. **Contournement : préférer les F-keys** (séquence identique legacy/kitty — F8, F5).
2. **Le scroll natif du transcript est un offset ABSOLU en lignes** (`ScrollView.updateLayout` de pi-tui) : tout toggle qui réduit la hauteur du contenu décale le point de lecture et peut clamp + `followingEnd` (collé en bas). **Contournement** : capturer un anchor de contenu (ordinal des marques OSC-133;A — émises par user/assistant uniquement, donc stables avant/après le toggle) → `renderNow()` synchrone → restore avec `disableFollow: true`.
