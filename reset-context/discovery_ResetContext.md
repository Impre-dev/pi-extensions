# discovery_ResetContext

| ID | Date | Découverte | Constat / preuve | Reco | Statut | Décision |
|---|---|---|---|---|---|---|
| D1 | 15/09 | V2 : outil `handover` exécuté par l'agent après validation verbale (au lieu de la frappe `/reset`) | `ctx.compact()` est fire-and-forget → ordre tool-result/compaction à vérifier (race) | V1 = commande seule ; V2 seulement si friction réelle constatée | 🆕 | |
| D2 | 15/09 | Popup de stats à la frappe (contexte %, git clean, dernier commit) | Pattern `ctx.ui.custom` éprouvé (ask-user-question, bash-guard) | Utilité faible : la frappe EST la validation, le popup ralentirait le geste | 🆕 | |
| D3 | 15/09 | Mémoire durable OM-style (`.memory/` topic files + JOURNEY) en complément du reset | Repo pi-observational-memory analysé : observers LLM continus, coût récurrent | Écartée : fenêtre 1M + protocole continuity couvrent le besoin ; le reset pointe vers des artefacts humains, pas une mémoire machine | ❌ | écartée le 15/09 — le pointeur remplace la mémoire |
