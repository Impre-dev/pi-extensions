# roadmap_ResetContext

Extension pi : reset du contexte **dans** la discussion — `/reset` compacte vers un pointeur vers les artefacts de continuité (session.md, git, registres) au lieu d'un summary LLM. La validation est la frappe de la commande : structurelle, non contournable. L'agent propose (la cloche), l'opérateur dispose (la frappe).

## Livré & poussé

| Version | Quoi | Validation | Hash |
|---|---|---|---|
| v0.1.0 | `/reset` + `/r` (commande + hook sélectif) + lab miroir 12 checks | Lab vert 12/12 + typecheck strict ✅ + validé en réel par Impre : 2 vols (39 637 / 41 315 tokens) — pointeur substitué, ancrage absolu, re-orientation artefacts complète | 39896b8 | cf. git |

## File priorisée

- ⭐ **v0.1.1** — test réel opérateur en session scratch (reset observable + natif `/compact` intact) puis amendement continuity.md (section handover : rappel ~20%, validation = frappe, séquence continuity → /reset → réorientation)
- V2 éventuelle — cf. discovery D1/D2

## Leçons de plateforme

(Uniquement des invariants prouvés — à remplir après le test réel.)
