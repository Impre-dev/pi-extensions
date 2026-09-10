# MyPiKeybinds — Référence des raccourcis

> pi 0.85.1 · mode `tuiMode: "fullscreen"` · Windows natif.
> Sources : doc officielle pi (keybindings.md, terminal-setup.md) + code de
> l'extension. Tout est rebindable via `~/.pi/agent/keybindings.json`
> (puis `/reload`).

---

## ⭐ MyPiKeybinds — nos personnalisations

| Touche | Action | Détail / défaut pi écrasé |
|---|---|---|
| `Ctrl+C` | **Copie la sélection** (écran) si elle existe, sinon **ne fait rien** | Défaut pi : `app.clear` — 1ʳᵉ pression efface l'éditeur, 2ᵉ quitte. Neutralisé quand l'éditeur principal a le focus. Les dialogs/sélecteurs gardent leur Ctrl+C natif (= annuler) |
| `Ctrl+X` | **Coupe** : copie la sélection + la supprime (undoable `Ctrl+Z`, redoable `Ctrl+Shift+Z`) | Défaut pi : copie la dernière réponse du modèle — conservé si aucune sélection |
| `Suppr` / `Backspace` | **Supprime le texte sélectionné** à la souris (curseur posé à l'endroit de la suppression) | Défaut pi : efface 1 caractère avant/après le curseur — conservé si la sélection est hors éditeur (le surlignage est juste vidé) |
| `Ctrl+Shift+Z` | **Redo** de la dernière suppression de sélection | pi n'a aucun redo. Invalide si tu as tapé autre chose entre-temps |
| `F8` | **Ouvre le dossier du projet** (`cwd`) dans l'Explorateur Windows | Nouveau (aucun binding natif) |
| `F5` | **Vue épurée** : masque les tool rows du transcript (ne restent que les messages user/assistant) + thinking forcé caché. **Scroll anchor** : le point de lecture ne bouge pas au toggle (fix du saut-en-bas natif). Même touche pour réafficher (état d'origine restauré) | Nouveau (aucun binding natif). Combo avec `Ctrl+↑/↓` (saut de message en message) pour naviguer vite en mode épuré |
| Molette | Scroll **4 lignes par cran** | Défaut pi : 1 ligne/cran (hardcodé, non réglable) |
| `Alt+molette` | Scroll 20 lignes par cran (×5) | Natif pi, inchangé |
| Drag souris | **Ne copie plus automatiquement** au relâchement | Désactivé via setting natif `fullscreenCopyOnSelect: false` (settings.json) — la copie devient explicite (`Ctrl+C`) |

Rappel : **quitter** pi = `Ctrl+D` (éditeur vide) ou `/quit` — le double `Ctrl+C` de pi est neutralisé.

---

## ✏️ Éditeur de saisie

### Curseur

| Touche | Action |
|---|---|
| `↑` / `↓` | Historique (haut de l'input) |
| `←` / `→`, `Ctrl+B` / `Ctrl+F` | Gauche / droite |
| `Alt+←` / `Alt+→`, `Ctrl+←` / `Ctrl+→` | Mot précédent / suivant |
| `Home` / `End`, `Ctrl+A` / `Ctrl+E` | Début / fin de ligne |
| `Ctrl+Home` / `Ctrl+End` | Début / fin de l'input |
| `Page↑` / `Page↓`, `Ctrl+Page↑/↓` | Page haut/bas dans l'éditeur |
| `Ctrl+]` / `Ctrl+Alt+]` | Saut avant / arrière au caractère |

### Suppression

| Touche | Action |
|---|---|
| `Backspace` | Efface le caractère avant le curseur |
| `Delete`, `Ctrl+D` | Efface le caractère après le curseur |
| `Ctrl+W`, `Alt+Backspace` | Efface le mot avant |
| `Alt+D`, `Alt+Delete` | Efface le mot après |
| `Ctrl+U` | Efface jusqu'au début de ligne |
| `Ctrl+K` | Efface jusqu'à la fin de ligne |

### Kill ring, undo, saisie

| Touche | Action |
|---|---|
| `Ctrl+Y` | Colle la dernière suppression (yank) |
| `Alt+Y` | Fait défiler le kill ring après un yank |
| `Ctrl+Z` (Windows) | Undo d'édition |
| `Shift+Enter`, `Ctrl+J` | Nouvelle ligne |
| `Enter` | Envoyer |
| `Tab` | Autocomplétion |
| `Alt+V` | Coller image ou texte du presse-papier (Windows) |
| `Ctrl+G` | Ouvrir l'input dans l'éditeur externe |

---

## 📜 Transcript (fullscreen)

### Navigation

| Touche | Action |
|---|---|
| Molette / `Alt+Molette` | Scroll (4 / 20 lignes par cran — see MyPiKeybinds) |
| `Page↑` / `Page↓` | Page haut / bas |
| `Ctrl+↑` / `Ctrl+↓` | Message précédent / suivant (saut de message en message) |
| `Home` / `End` | Début du transcript / bas + suivi du flux |

### Recherche

| Touche | Action |
|---|---|
| `Ctrl+F` | Chercher dans le transcript (Windows) |
| `Enter`, `Ctrl+G` | Match suivant |
| `Shift+Enter`, `Ctrl+Shift+G` | Match précédent |
| `Escape` | Fermer la recherche |

### Flux & messages

| Touche | Action |
|---|---|
| `Escape` | Interrompre l'agent en cours |
| `Ctrl+Q` | Mettre un message en file (follow-up pendant le stream) |
| `Alt+Q` | Restaurer les messages en file vers l'éditeur |
| `Ctrl+X` | (sans sélection) copier la dernière réponse du modèle |
| `Ctrl+O` | Plier / déplier la sortie d'un outil |
| `Ctrl+T` | Plier / déplier les blocs de thinking |

---

## 🤖 Modèles & thinking

| Touche | Action |
|---|---|
| `Ctrl+P` | Modèle suivant |
| `Alt+P` | Modèle précédent (Windows) |
| `Ctrl+L` | Sélecteur de modèle |
| `Shift+Tab` | Cycle du niveau de thinking |

---

## 🌳 Navigation d'arbre (`/tree`)

| Touche | Action |
|---|---|
| `Ctrl+←` / `Ctrl+→` | Replier / déplier le segment, saut de segment |
| `Shift+L` / `Shift+T` | Éditer le label / horodatage du nœud |
| `Ctrl+D` / `Ctrl+T` / `Ctrl+U` / `Ctrl+L` / `Ctrl+A` | Filtres : défaut / sans outils / user / labellisés / tout |
| `Ctrl+O` / `Ctrl+Shift+O` | Cycle des filtres avant / arrière |

Dans les sélecteurs de sessions (`/resume`, `/tree`) : `Ctrl+R` renommer, `Ctrl+D` supprimer, `Ctrl+Backspace` supprimer (requête vide), `Ctrl+S` tri, `Ctrl+P` chemin, `Ctrl+N` filtre nommés. `Ctrl+S` sauvegarde aussi modèle/thinking dans les sélecteurs de modèles.

---

## ⚠️ Notes

- `Ctrl+D` fait double emploi : efface le caractère après le curseur, et **quitte pi** si l'éditeur est vide.
- `Ctrl+P` : cycle de modèle dans l'éditeur, toggle "chemin" dans le sélecteur de sessions.
- `Shift+Enter` requiert le binding Windows Terminal (`sendInput \u001b[13;2u`) — déjà configuré chez toi ou à ajouter dans `settings.json` de WT (voir doc pi terminal-setup.md).
- Les bindings listés sont ceux de pi **0.85.1** — après une mise à jour de pi, revérifier `docs/keybindings.md`.
