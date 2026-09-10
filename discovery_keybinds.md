# Discovery keybinds

> Sas de décision — les découvertes attendent ici leur statut. L'adoptée migre
> vers la File priorisée du roadmap ; l'écartée reste en mémoire.

| ID | Date | Découverte | Constat / preuve | Reco | Statut | Décision |
|---|---|---|---|---|---|---|
| F-01 | 10/09 | Ctrl+T natif scrolle en bas au hide | Constat terrain : toggle thinking ok à chaud, mais « ça me descend tt en bas de la discussion » à l'enclenchement — casse la navigation | Le toggle futur doit préserver la position de lecture du transcript (scroll anchor) | 💬 | — |
| F-02 | 10/09 | Ctrl+O natif quasi sans effet | Constat terrain : « ne change quasiment rien, c'est pas très utile » | Ne pas bâtir la vue épurée dessus ; passer par `setToolsExpanded` + renderers | 💬 | — |
| F-03 | 10/09 | Objectif réel = navigation rapide | « remonter à un msg, réafficher les trucs » — la vue épurée n'est qu'un moyen | Cahier des charges du point 1 du roadmap : masquer + retrouver + réafficher | 💬 | — |
| F-04 | 10/09 | La vue « que nos messages » existe côté /tree | keybindings.md : `app.tree.filter.userOnly` (Ctrl+U) / `noTools` (Ctrl+T) ; `treeFilterMode` est persisté dans settings.json | Source d'inspiration UX : un mode persisté pour le toggle ? | 🆕 | — |
