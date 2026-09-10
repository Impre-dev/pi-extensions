# Discovery D2R2

> Sas de décision — les découvertes attendent ici leur statut. L'adoptée migre
> vers la File priorisée du roadmap ; l'écartée reste en mémoire.

| ID | Date | Découverte | Constat / preuve | Reco | Statut | Décision |
|---|---|---|---|---|---|---|
| F-01 | 10/09 | Doublon partiel `deploy.ps1` (d2r2) vs `dev/sync.ps1` (root) — sync.ps1 attend déjà le layout `$ext\$ext.ts` que d2r2 respecte ; il lui manque juste le bootstrap du daemon dédié | `dev/sync.ps1` : `$extensions = @("hub","keybinds","multi-rules")` + copie hash-vérifiée | Ajouter `"d2r2"` à sync.ps1 pour le quotidien ; garder deploy.ps1 comme bootstrap autonome (install fraîche) — ou fusionner tout dans sync.ps1 (bootstrap daemon générique) et supprimer deploy.ps1 | 🆕 | — |
