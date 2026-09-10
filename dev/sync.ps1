# sync.ps1 - copie les extensions du repo vers l'install pi (~/.pi/agent/extensions/).
#
# Chemins relatifs a ce script ($PSScriptRoot) : le repo peut etre deplace
# sans rien casser - aucune URL codee en dur.
# Copie binaire (Copy-Item) : encodage des fichiers preserve tel quel.
#
# Usage :
#   powershell -File sync.ps1          # copie ce qui differe
#   powershell -File sync.ps1 -Check   # compare sans copier

param([switch]$Check)

$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:USERPROFILE ".pi\agent\extensions"
$repoRoot   = Split-Path $PSScriptRoot -Parent

# Extensions installables (custom-header est une archive : PAS installee, role absorbe par le hub en v0.2)
$extensions = @("hub", "keybinds", "multi-rules")

$changed = 0; $same = 0; $missing = 0

foreach ($ext in $extensions) {
    $src = Join-Path $repoRoot "$ext\$ext.ts"
    $dst = Join-Path $installDir "$ext.ts"

    if (-not (Test-Path $src)) {
        Write-Host "MANQUANT (repo)  : $src" -ForegroundColor Red
        $missing++
        continue
    }

    $inSync = (Test-Path $dst) -and ((Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash)

    if ($inSync) {
        Write-Host "OK               : $ext.ts" -ForegroundColor DarkGray
        $same++
        continue
    }

    if ($Check) {
        Write-Host "DIFF             : $ext.ts" -ForegroundColor Yellow
        $changed++
        continue
    }

    Copy-Item $src $dst -Force
    Write-Host "SYNC             : $ext.ts" -ForegroundColor Green
    $changed++
}

Write-Host ""
if ($Check) { Write-Host "Resultat : $changed difference(s), $same synchronise(s), $missing manquant(s)" }
else        { Write-Host "Termine  : $changed copie(s), $same deja en place, $missing manquant(s)" }
Read-Host "Appuyez sur Entree pour fermer"
