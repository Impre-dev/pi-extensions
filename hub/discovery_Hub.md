# Discovery Hub

> Sas de décision — les découvertes attendent ici leur statut. L'adoptée migre
> vers la File priorisée du roadmap ; l'écartée reste en mémoire.

| ID | Date | Découverte | Constat / preuve | Reco | Statut | Décision |
|---|---|---|---|---|---|---|
| F-02 | 12/09 | Conversion image → braille dans le pipeline `use-art` (ex-point 1 de la file) | Besoin jamais précisé : Impre convertit déjà ses images de son côté, et `braille-resize.mjs` couvre le rééchantillonnage | — | ❌ Écartée | Impre, 12/09 (« c'était une idée en l'air, c'est plus d'actualité ») |
| F-03 | 12/09 | Ligne fantôme en haut du hub au retour d'une discussion — enquête et fix v0.16 (leçon 11) | Enquête complète : calque composite (base layer scrollé, row 0 = transcript en discussion) ; voies mortes documentées — margin 0 (effets de bord globaux, 2 tests TUI), header seul (scrollé hors écran), writeSync (piégé par le diff-painting, leçon 13), agrandir/row absolu (clamp marginTop). Fix : header vide + scroll-to-top + restore (leçon 11) | ✅ Adoptée | Livrée v0.16 (405a719) | Impre, 12/09 |
| F-01 | 09/09 | PowerShell 5.1 lit les `.txt` UTF-8 sans BOM en ANSI (ex-leçon 2 du roadmap) | Fait PS général vrai, mais aucun flux du projet ne le rencontre : les assets art sont **sans BOM** (`e2a080` = braille direct dès l'octet 1) et fonctionnels — lus par Node (`use-art.mjs`), jamais `cat` par PowerShell | Pas une leçon SessionHub ; la re-proposer seulement si un flux PS→texte apparaît un jour | ❌ Écartée | Impre, 09/09 (« poubelle ») |
