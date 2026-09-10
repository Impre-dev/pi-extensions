# Roadmap keybinds

> Document de pilotage — statut au 10/09. Extension pi : tweaks UX fullscreen Windows.
> Source de dev : `keybinds/` — install : `~/.pi/agent/extensions/keybinds.ts`.
> (ex-MyPiKeybinds — renommé et centralisé dans pi-extensions le 10/09.)

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|

## 🎯 File priorisée

### 1. Toggle vue épurée + navigation rapide ⭐
**Demande** : « le but c'est de pouvoir naviguer très vite dans la discussion, remonter à un msg, réafficher les trucs » (10/09)
**Constats** : Ctrl+T natif (`app.thinking.toggle`) marche à chaud mais **scrolle tout en bas de la discussion** quand on enclenche le hide — casse exactement le cas d'usage navigation. Ctrl+O natif (`app.tools.expand`) quasi sans effet. NB : `hideThinkingBlock: true` est déjà actif dans les settings (pensées masquées en dur).
**Mécanisme** : API `ctx.ui.getToolsExpanded()` / `setToolsExpanded(bool)` pour l'état tools (extensions.md). Pas d'event natif « état changé » ni d'interception des keybinds natifs documentés → raccourci propre via `registerShortcut` + état interne. L'extension possède déjà le socle nécessaire (`CustomEditor`, accès `TuiAltScreen`, listener TUI).
**Implémentation** : à dessiner — shortcut dédié, toggle masquage tools, préservation de la position de lecture du transcript (voir discovery F-01), réaffichage à la demande.

## 🧠 Leçons de plateforme

1. (à acter après la première itération validée)
