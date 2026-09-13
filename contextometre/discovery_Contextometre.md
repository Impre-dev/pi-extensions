# Discovery Contextometre

> Sas de décision — les découvertes attendent ici leur statut. L'adoptée migre
> vers la File priorisée du roadmap ; l'écartée reste en mémoire.

| ID | Date | Découverte | Constat / preuve | Reco | Statut | Décision |
|---|---|---|---|---|---|---|
| F-01 | 13/09 | Compaction programmatique : `ctx.compact({customInstructions, onComplete, onError})` est déclenchable depuis une extension | docs/extensions.md §`ctx.compact` | Un jour : compact « piloté par l'horloge » (ex : auto-compact doux en zone ⚠) — mais attendre des données réelles sur les seuils avant d'automatiser quoi que ce soit | 🆕 | — |
| F-02 | 13/09 | Marqueur « live » : l'event `context` permettrait de réécrire un seul message marqueur à chaque tour (zéro accumulation) | docs/extensions.md §context (« can modify messages ») | Ne pas faire maintenant : persistance transcript à vérifier, plus intrusif ; le marqueur par run suffit (validé TUI) | 🆕 | — |
