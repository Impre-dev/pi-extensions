# Roadmap SessionHub

> Document de pilotage — statut au 08/09. Extension pi : écran d'accueil
> workspaces & discussions avec art braille (tête anime, vert flat).
> Source de dev : `test_pi/session-hub/` — install : `~/.pi/agent/extensions/session-hub.ts`.

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|
| v0.4 | Robot braille (401×443 dots, 28 lignes) remplace la tête anime. `use-art.mjs` : autocrop bounding box (AUTOCROP=1 par défaut), chemins fixés, assets originaux archivés dans `dev/` (robot-original, robot-v2, ghost) — rollback d'art en une commande. v2 du robot testée puis écartée | 9db606a |
| v0.8 | Architecture zéro-cascade : le hub ne s'ouvre plus jamais depuis un ctx event — au lancement home : /hub prérempli (un Enter), ouvert ensuite via le ctx commande (seul ayant le pouvoir de switcher). Ctrl+H : ouvre le hub partout (garde getSwitch). Options contextuelles : racine = Accueil (header natif) / Root (explorateur ~/.pi/agent) / Quitter (clear ANSI writeSync) ; discussions = New / Rename (mode cible jaune : ctrl+r ou clic, ↵ ou clic confirme) / Retour. Rename : retour au hub directement dans le workspace de la discussion. ACTION_SOUND : stub sons (.wav PowerShell). | f46d653 |
| v0.3 | Mode overlay (`anchor: "top-center"`) : hub flottant en haut de fenêtre. Inversion art/liste testée puis annulée (art à gauche). Tout-vert testé puis annulé (couleurs thème). Titre « Session hub » viré. Options centrées flottant au-dessus de la chatbox (`CHATBOX_H`). Outil `use-art.mjs` : changement d'art en une commande | ba954af |
| v0.2 | Cosmétique : art statique vert flat, zéro bordure, padding. Fusion header : session-hub absorbe custom-header.ts (logo pi en session normale, header minimal sur home, custom-header retiré de l'install — backup `custom-header/`). Souris : `handleMouse` (liste + molette + options du bas cliquables, actif fullscreen), libellés New/Rename/Quitter | `59b5356` |
| v0.1 | Écran d'accueil hub : `/hub` + auto-launch sur home, navigation 2 niveaux (workspaces → discussions), Enter/Ctrl+N/Ctrl+R/Esc, art braille vert flat + shimmer 8 FPS. Validé en TUI par Impre (retours → file v0.2) | `8915832` |
| — | Backup custom-header archivé dans `custom-header/` avant absorption v0.2 | voir git log |

## 🎯 File priorisée

### 1. Conversion image → braille dans le pipeline `use-art` ⭐
**Demande** : « ça peut être une image tout court ? »
**Mécanisme** : `use-art.mjs` n'accepte que du braille texte ; une image (png/jpg) doit passer par luminance → seuillage/dithering → encode braille.
**Implémentation** : accepter `.png`/`.jpg` dans `use-art.mjs` (dépendance dev type `pngjs`, dithering Floyd-Steinberg, seuil ajustable) — le rendu du hub reste du braille, fiable partout.

## 🧠 Leçons de plateforme (à ne plus retester)

1. **`switchSession` n'existe que sur `ExtensionCommandContext`** — le ctx des events ne l'expose pas au typage : runtime-check + fallback `setEditorText("/hub")` (pattern actuel du hub).
2. **PowerShell 5.1 lit les `.txt` en ANSI sauf BOM UTF-8** — toute préview destinée à un `cat` PS doit porter un BOM.
3. **Le braille Unicode se rééchantillonne comme une image** — decode 2×4 dots → box-average → re-encode (`tools/braille-resize.mjs`) ; les dots braille sont ~carrés en terminal, le ratio se conserve au niveau dots.
4. **La capture souris n'est active qu'en mode fullscreen** (`tuiMode: "fullscreen"`) — en regular, le terminal garde le scrollback. `handleMouse` s'implémente quand même : inerte en regular, actif dès la bascule.
5. **`TuiMouseEvent` (x, y) est local au composant récepteur** — pour forwarder à un enfant rendu dans une sous-zone, retarget manuel (shift x/y) avant `handleMouse` enfant.
6. **`ctx.setHeader` se rejoue à chaque `session_start`** — un replacement de session (switch) re-fire `session_start` : un seul handler gère les deux modes (hub sur home, logo ailleurs).
7. **Mode overlay** : `ctx.ui.custom(factory, { overlay: true, overlayOptions })` — anchors `top-center` etc. Le hub connaît la hauteur du terminal via `tui.terminal.rows` : filler calculé dans le render pour ancrer les options juste au-dessus de la chatbox (`CHATBOX_H`).
9. **Le ctx des events n'a jamais le pouvoir de switcher** —  et les shortcuts non-command : le hub ne s'ouvre que via la commande  (ou un shortcut vérifié par ) ; sinon  + Enter. Coût : un Enter au lancement sur home. Bénéfice : zéro cascade, définitif.
8. **Changement d'art = une commande** (`use-art.mjs`) — `ART_W` est dérivé du tableau injecté, le layout se recalcule tout seul. Les assets originaux sont archivés dans `dev/` : rollback en relançant l'ancien fichier. L'autocrop (bounding box des dots) préserve la résolution quand l'art source a des marges vides.
