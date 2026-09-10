# Roadmap D2R2

> Document de pilotage — statut au 10/09. Extension pi : son de fin de
> réponse — playlist séquentielle de sons D2R (14 .wav).
> Source de dev : `d2r2/` — install : `~/.pi/agent/extensions/d2r2.ts`.
> (d2r2 : ancienne appellation de r2d2 — le petit droïde de Star Wars.)

## ✅ Livré & poussé

| Version | Contenu | Commit |
|---|---|---|
| v0.1.0 | Son à la fin de chaque réponse : event `agent_settled` (pi ne relance rien = réponse finale, guard TUI) → playlist séquentielle des 14 .wav de `resources/d2r2/` — tri numérique (1→14, pas lexicographique), re-listé à chaque appel (<1ms : ajout/retrait de sons sans reload), index brut stocké sans mod dans `d2r2-state.json` (repo, à côté du .ts — survit aux reloads/switchs/restarts ; mod au moment de jouer). Daemon AHK v2 dédié (pattern hub v0.13 : spawn lazy ~100ms vs ~370ms PowerShell, stdin.end() au shutdown — jamais kill()). Copie dédiée obligatoire : #SingleInstance Force est par chemin de script. deploy.ps1 : copie install + bootstrap daemon. Typecheck strict ✅ · Validé TUI par Impre : 1.wav puis 2.wav aux fins de réponse, json index 0→1→2. | 8ac813e |

## 🎯 File priorisée

1. Consolidation deploy.ps1 ↔ dev/sync.ps1 — voir discovery_D2R2.md F-01 (doublon partiel ; sync.ps1 attend déjà le layout `$ext\$ext.ts`).

## 🧠 Leçons de plateforme (à ne plus retester)

1. **#SingleInstance Force (AHK) opère par chemin de script** — deux extensions qui spawnent le MÊME fichier .ahk se battent pour l'instance unique (le respawn du second tue le premier). Tout daemon résident = sa propre copie du script sous un nom distinct (`d2r2-sound-daemon.ahk` ≠ `sound-daemon.ahk`).
2. **Pi recharge les extensions à chaque transition de session** (session_shutdown → reload) — tout état en mémoire d'extension est volatile ; ce qui doit traverser les sessions vit sur disque (fichier de state). Pattern daemon : respawn lazy + `stdin.end()` au shutdown (hub v0.14.1, d2r2 v0.1.0).
