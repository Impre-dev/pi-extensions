# move-and-rename.ps1 - migration one-shot du 10/09.
#
#   1. COPY du repo Desktop -> O:\Programmation\IDE\Pi\pi-extensions
#      (robocopy /E - l'original Desktop n'est JAMAIS supprime ni modifie :
#       il reste le backup jusqu'a validation complete, purge manuelle ensuite)
#   2. Rename install : session-hub.ts -> hub.ts + purge du residu MyPiKeybinds\
#   3. Rename des dossiers de sessions encodes (les discussions suivent le cwd)
#   4. Maj du champ "cwd" (ligne 1 des .jsonl) via node - UTF-8 safe
#
# PREREQUIS : pi FERME (aucune session active - le .jsonl en cours est tenu
# ouvert par le process). Refaire la copie de sauvegarde de ~/.pi/agent juste
# avant, ou s'assurer que celle du Bureau est a jour.

$ErrorActionPreference = "Stop"

# --- Config -----------------------------------------------------------------
$source   = "C:\Users\Pelo\Desktop\pi-extensions"
$dest     = "O:\Programmation\IDE\Pi\pi-extensions"
$sessions = Join-Path $env:USERPROFILE ".pi\agent\sessions"
$extDir   = Join-Path $env:USERPROFILE ".pi\agent\extensions"

# Ancien / nouveau cwd (encodage dossier sessions : ':' et '\' -> '-')
$oldCwd = "C:\Users\Pelo\Desktop\pi-extensions"
$newCwd = "O:\Programmation\IDE\Pi\pi-extensions"

$sessionMoves = [ordered]@{
    "--C--Users-Pelo-Desktop-pi-extensions--"             = "--O--Programmation-IDE-Pi-pi-extensions--"
    "--C--Users-Pelo-Desktop-pi-extensions-session-hub--" = "--O--Programmation-IDE-Pi-pi-extensions-hub--"
}
# ----------------------------------------------------------------------------

function Step($n, $msg) { Write-Host "`n=== [$n] $msg ===" -ForegroundColor Cyan }

Write-Host "ATTENTION : pi doit etre FERME avant de lancer ce script." -ForegroundColor Yellow
Write-Host "Source : $source"
Write-Host "Dest   : $dest"
Read-Host "Confirmer (tapez GO) | Ctrl+C pour annuler" | ForEach-Object {
    if ($_ -ne "GO") { throw "Abandon." }
}

# --- [1] COPY du repo (jamais de delete) ------------------------------------
Step 1 "Copie du repo (robocopy)"
robocopy $source $dest /E /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy a echoue (exit $LASTEXITCODE)" }
Write-Host "Copie OK (robocopy exit $LASTEXITCODE)" -ForegroundColor Green

# --- [2] Renames install ------------------------------------------------------
Step 2 "Install : session-hub.ts -> hub.ts + purge residu"
$oldExt = Join-Path $extDir "session-hub.ts"
$newExt = Join-Path $extDir "hub.ts"
if (Test-Path $oldExt) {
    if (Test-Path $newExt) { throw "hub.ts existe deja en install - etat inattendu, abort." }
    Rename-Item $oldExt "hub.ts"
    Write-Host "Renomme : session-hub.ts -> hub.ts" -ForegroundColor Green
} elseif (Test-Path $newExt) {
    Write-Host "hub.ts deja en place" -ForegroundColor DarkGray
} else {
    throw "Ni session-hub.ts ni hub.ts en install - abort."
}

$stale = Join-Path $extDir "MyPiKeybinds"
if (Test-Path $stale) {
    $left = (Get-ChildItem $stale -Force | Measure-Object).Count
    if ($left -gt 0) { throw "MyPiKeybinds\ n'est PAS vide ($left element(s)) - purge manuelle requise, abort." }
    Remove-Item $stale
    Write-Host "Purge   : MyPiKeybinds\ (vide)" -ForegroundColor Green
} else {
    Write-Host "MyPiKeybinds\ deja absent" -ForegroundColor DarkGray
}

# --- [3] Renames dossiers de sessions ---------------------------------------
Step 3 "Sessions : rename des dossiers encodes"
# Garde anti-verrou : si pi tient un .jsonl ouvert (session active), Windows
# refusera le rename du dossier parent. On le detecte AVANT, clairement.
foreach ($k in $sessionMoves.Keys) {
    $srcDir = Join-Path $sessions $k
    $dstDir = Join-Path $sessions $sessionMoves[$k]
    $target = if (Test-Path $srcDir) { $srcDir } elseif (Test-Path $dstDir) { $dstDir } else { continue }
    foreach ($f in Get-ChildItem $target -Filter *.jsonl) {
        try {
            $fs = [System.IO.File]::Open($f.FullName, 'Open', 'ReadWrite', 'None')
            $fs.Close()
        } catch {
            throw "VERROU DETECTE : $($f.Name) est tenu par un process (pi ouvert ?).`nFermez pi PUIS relancez ce script. Abort."
        }
    }
}
$renamed = 0; $absent = 0; $already = 0
foreach ($k in $sessionMoves.Keys) {
    $srcDir = Join-Path $sessions $k
    $dstDir = Join-Path $sessions $sessionMoves[$k]
    if (Test-Path $dstDir) { Write-Host "Deja renomme : $k" -ForegroundColor DarkGray; $already++; continue }
    if (-not (Test-Path $srcDir)) { Write-Host "Absent, skip : $k" -ForegroundColor DarkGray; $absent++; continue }
    Rename-Item $srcDir $sessionMoves[$k]
    Write-Host "Renomme : $k" -ForegroundColor Green
    $renamed++
}
if ($renamed -eq 0 -and $absent -gt 0 -and $already -eq 0) { throw "AUCUN dossier source trouve ($absent absents) - noms du mapping inattendus, abort." }

# --- [4] Maj du champ cwd (ligne 1 des .jsonl) via node ----------------------
Step 4 "JSONL : maj du champ cwd (via node, UTF-8 safe)"
$nodeScript = Join-Path $env:TEMP "move-rename-cwd.cjs"
@'
const fs = require("fs");
const path = require("path");
const [dir, oldCwd, newCwd] = process.argv.slice(2);
const oldJ = JSON.stringify(oldCwd), newJ = JSON.stringify(newCwd);
let scanned = 0, changed = 0, skipped = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".jsonl")) continue;
  const p = path.join(dir, f);
  scanned++;
  const txt = fs.readFileSync(p, "utf8");
  const nl = txt.indexOf("\n");
  const head = nl < 0 ? txt : txt.slice(0, nl);
  const rest = nl < 0 ? "" : txt.slice(nl);
  if (!head.includes('"type":"session"')) { skipped++; continue; }
  if (!head.includes(oldJ)) { skipped++; continue; }
  fs.writeFileSync(p, head.replace(oldJ, newJ) + rest, "utf8");
  changed++;
}
console.log(`${dir} : ${changed}/${scanned} fichier(s) mis a jour, ${skipped} sans changement`);
'@ | Set-Content -Path $nodeScript -Encoding ASCII
foreach ($k in $sessionMoves.Keys) {
    $srcDir = Join-Path $sessions $k
    $dstDir = Join-Path $sessions $sessionMoves[$k]
    if (Test-Path $dstDir) { $target = $dstDir } elseif (Test-Path $srcDir) { $target = $srcDir } else { continue }
    node $nodeScript $target $oldCwd $newCwd
    if ($LASTEXITCODE -ne 0) { throw "node a echoue sur $target" }
}
Remove-Item $nodeScript -ErrorAction SilentlyContinue

# --- Rapport -----------------------------------------------------------------
Step "FIN" "Migration terminee"
Write-Host @"
Prochaines etapes :
  1. Rouvrir pi depuis $dest
  2. /resume : verifier que les discussions sont LA (dont celle-ci)
  3. /hub + sons, F8, /rules, molette - tout doit marcher a l'identique
  4. Supprimer manuellement $source (uniquement apres validation totale)
"@ -ForegroundColor Cyan
Read-Host "Appuyez sur Entree pour fermer"
