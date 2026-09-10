# Deploy D2R2 — copie l'extension vers l'install pi (~/.pi/agent/extensions)
# Repo = source (commité) · Install = runtime (d2r2.ts + daemon dédié)
# Usage : .\deploy.ps1   puis /reload dans pi
$ErrorActionPreference = "Stop"

$install = Join-Path $env:USERPROFILE ".pi\agent\extensions"

# ── Extension ──
Copy-Item (Join-Path $PSScriptRoot "d2r2.ts") (Join-Path $install "d2r2.ts") -Force

# ── Daemon dédié ──
# #SingleInstance Force est par CHEMIN DE SCRIPT : d2r2 a besoin de sa propre
# copie, sinon le respawn se bat avec le daemon du hub (dialogue « older
# instance »). Bootstrap depuis celui du hub s'il n'existe pas encore.
$daemon = Join-Path $install "resources\d2r2-sound-daemon.ahk"
if (-not (Test-Path $daemon)) {
    Copy-Item (Join-Path $install "resources\sound-daemon.ahk") $daemon
    Write-Host "  daemon dédié bootstrappé : $daemon"
}

Write-Host "Deploy OK : d2r2.ts -> $install"
