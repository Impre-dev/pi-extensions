# Discovery Hub

> Sas de décision — les découvertes attendent ici leur statut. L'adoptée migre
> vers la File priorisée du roadmap ; l'écartée reste en mémoire.

| ID | Date | Découverte | Constat / preuve | Reco | Statut | Décision |
|---|---|---|---|---|---|---|
| F-02 | 12/09 | Conversion image → braille dans le pipeline `use-art` (ex-point 1 de la file) | Besoin jamais précisé : Impre convertit déjà ses images de son côté, et `braille-resize.mjs` couvre le rééchantillonnage | — | ❌ Écartée | Impre, 12/09 (« c'était une idée en l'air, c'est plus d'actualité ») |
| F-01 | 09/09 | PowerShell 5.1 lit les `.txt` UTF-8 sans BOM en ANSI (ex-leçon 2 du roadmap) | Fait PS général vrai, mais aucun flux du projet ne le rencontre : les assets art sont **sans BOM** (`e2a080` = braille direct dès l'octet 1) et fonctionnels — lus par Node (`use-art.mjs`), jamais `cat` par PowerShell | Pas une leçon SessionHub ; la re-proposer seulement si un flux PS→texte apparaît un jour | ❌ Écartée | Impre, 09/09 (« poubelle ») |
