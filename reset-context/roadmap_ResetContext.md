# roadmap_ResetContext

Extension pi : reset du contexte **dans** la discussion — `/reset` compacte vers un pointeur vers les artefacts de continuité (session.md, git, registres) au lieu d'un summary LLM. La validation est la frappe de la commande : structurelle, non contournable. L'agent propose (la cloche), l'opérateur dispose (la frappe).

## Livré & poussé

| Version | Quoi | Validation | Hash |
|---|---|---|---|
| v0.1.0 | `/reset` + `/r` (commande + hook sélectif) + lab miroir 12 checks | Lab vert 12/12 + typecheck strict ✅ + validé en réel par Impre : 2 vols (39 637 / 41 315 tokens) — pointeur substitué, ancrage absolu, re-orientation artefacts complète | 39896b8 |
| v0.1.1 | enchaînement auto (sendMessage triggerTurn, API pi) + renderer custom : la ligne d'ancrage s'affiche dans le transcript | Lab vert 13/13 + typecheck strict ✅ + vols réels 17/09 (ré-orientation artefacts complète, enchaînement auto) | 2c93f1c |
| v0.1.2 | toast notify du onComplete supprimé — la Box d'ancrage (canal humain) suffit ; onError notifie seul | Lab vert 13/13 (test 6 réécrit) + typecheck strict ✅ + vol réel 17/09 « ça marche nickel » — 2 blocs jumeaux compaction+ancrage | 2c93f1c |

## File priorisée

- (aucun chantier adopté — v0.1.2 livrée, extension stable)
- Mis de côté : #3 historique visuel post-reset — limite pi-core (renderSessionEntries = buildContextEntries) ; feature request pi-mono éventuelle
- V2 éventuelle — cf. discovery D1/D2

## Leçons de plateforme

(Uniquement des invariants prouvés — fait → conséquence → contournement.)

- Un custom message pi a deux visages : `renderer` = canal humain seul, `content` = canal LLM seul → tout check anti-doublon se joue à ces frontières (le pointeur de compaction doit rester pur)
- Le bloc compaction est rendu par pi-core (`CompactionSummaryMessageComponent`, bg `customMessageBg`, même token que les custom messages) et `renderSessionEntries = buildContextEntries` → aucune contribution extension possible au bloc (ni merge, ni masquage)
- Le lab TS tourne via `node lab-reset-context.ts` (Node 24, strip-types natif) — pas de tsx/tsc locaux ; typecheck via `npx -y -p typescript tsc`
