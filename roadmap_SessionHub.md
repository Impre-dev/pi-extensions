# Roadmap SessionHub

> Document de pilotage — statut au 08/09. Extension pi : écran d'accueil
> workspaces & discussions avec art braille (tête anime, vert flat).
> Source de dev : `test_pi/session-hub/` — install : `~/.pi/agent/extensions/session-hub.ts`.

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|
| v0.1 | Écran d'accueil hub : `/hub` + auto-launch sur home, navigation 2 niveaux (workspaces → discussions), Enter/Ctrl+N/Ctrl+R/Esc, art braille vert flat + shimmer 8 FPS. Validé en TUI par Impre (retours → file v0.2) | `8915832` |
| — | Backup custom-header archivé dans `custom-header/` avant absorption v0.2 | voir git log |

## 🎯 File priorisée

### 1. Cosmétique : art statique + zéro barre ⭐ (prochain — micro-passe)
**Demande** : « retirer l'animation » / « si on pouvait virer les barres bleues »
**Mécanisme** : le shimmer (timer 8 FPS) distrait ; les `DynamicBorder` rendent en bleu selon le thème.
**Implémentation** : figer l'art en vert flat `\x1b[1;32m` (la maquette validée), supprimer les bordures top/bottom et le timer (et son `// LAST RESORT` avec lui).

### 2. Fusion header/hub — virer custom-header.ts
**Demande** : « le menu natif est visible et comprimé en haut […] on devrait les fusionner ; on peut virer l'extension header »
**Mécanisme** : au startup sur home, le header (logo pi de custom-header.ts) s'affiche au-dessus du hub → deux blocs concurrents, écran encombré.
**Implémentation** : session-hub absorbe le rôle — au startup home : `setHeader` minimal/vide + hub plein écran ; en session normale (et après reprise via hub) : reprendre le `buildHeader()` de custom-header.ts (logo pi + version). custom-header.ts supprimé. Une extension, deux comportements.

### 3. Souris : liste et options cliquables + libellés
**Demande** : « rendre la navigation cliquable, et les options du bas aussi, virer "Navigate" et "enter select" » ; libellés : `New (ctrl+n)` / `Rename (ctrl+r)` / `Quitter (esc)`
**Mécanisme** : l'interface `Component` de pi-tui expose `handleMouse?(event: TuiMouseEvent)` — SelectList l'implémente déjà (clic + molette). MAIS la capture souris n'est active qu'en **mode fullscreen** (`tuiMode: "fullscreen"`, expérimental) ; en regular, le terminal garde la souris.
**Implémentation** : exposer `handleMouse` sur le hub (forward SelectList + zones cliquables pour les 3 options du bas, hit-test par ligne/colonne) ; hint réduit aux 3 libellés cliquables ; raccourcis clavier conservés. Contrainte documentée : clic = fullscreen mode.

## 🧠 Leçons de plateforme (à ne plus retester)

1. **`switchSession` n'existe que sur `ExtensionCommandContext`** — le ctx des events ne l'expose pas au typage : runtime-check + fallback `setEditorText("/hub")` (pattern actuel du hub).
2. **PowerShell 5.1 lit les `.txt` en ANSI sauf BOM UTF-8** — toute préview destinée à un `cat` PS doit porter un BOM.
3. **Le braille Unicode se rééchantillonne comme une image** — decode 2×4 dots → box-average → re-encode (`tools/braille-resize.mjs`) ; les dots braille sont ~carrés en terminal, le ratio se conserve au niveau dots.
