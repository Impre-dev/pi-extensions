# Roadmap Contextometre

> Document de pilotage — statut au 13/09. L'extension affiche l'usage du contexte
> dans le chat, visible de l'agent ET d'Impre — l'horloge murale de memory.md
> (« on ne se demande pas si on a la notion du temps, on la lit »).

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|
| v0.1 | Marqueur `[⏱ % · tokens/fenêtre]` injecté à chaque `before_agent_start` (1 par run, pas par tour) : message custom LLM-visible + renderer TUI dim/warning/error, seuils 20%/25% memory.md, rappels de règle envoyés au LLM seulement en dérive, « ? » post-compaction. Validé TUI par Impre : ligne visible des deux côtés, % cohérents (6.8% → 6.9% constatés sur fenêtre 1M) | `ae58dc1` |

## 🎯 File priorisée

*(vide)*

## 🧠 Leçons de plateforme (à ne plus retester)

1. **`ctx.getContextUsage()` retourne `{tokens|null, contextWindow, percent|null}`** — `tokens`/`percent` sont `null` juste après une compaction (avant la prochaine réponse LLM) : toujours coder le cas « ? ».
2. **Injecter par message, jamais par system prompt** — réécrire le system prompt à chaque tour invaliderait le prompt-cache de TOUTE la conversation ; l'injection append-only en fin de transcript le préserve.
3. **`before_agent_start` peut retourner `{message}` directement** — injecté en session + envoyé au LLM, pas besoin de `pi.sendMessage()` pour ce cas.
