/**
 * D2R2 — son de fin de réponse (playlist séquentielle de sons D2R).
 *
 * (d2r2 : ancienne appellation de r2d2 — le petit droïde, son de droïde inclus)
 *
 * - Event `agent_settled` : pi ne relancera rien (pas de retry/compaction/
 *   follow-up en queue) = la réponse finale est terminée → on joue le son.
 * - Playlist : les .wav de resources/d2r2 (install), triés numériquement
 *   (1 → 14). Un son différent à chaque réponse, jamais aléatoire : on
 *   avance d'un cran, la boucle revient au début après le dernier.
 * - State : d2r2-state.json à côté de d2r2.ts dans le repo (choix Impre) —
 *   survit aux reloads, switches de session et restarts de pi.
 * - Daemon AHK dédié (pattern hub, benché 09/09 : ~100ms vs ~370ms
 *   PowerShell) : process résident qui lit des chemins sur son stdin.
 *   ⚠ #SingleInstance Force est par CHEMIN DE SCRIPT → il faut une copie
 *   dédiée (d2r2-sound-daemon.ahk), sinon les daemons hub/d2r2 se battent.
 *   Spawn lazy (au 1er son, caché par la fin de génération), respawn auto,
 *   stdin.end() au shutdown (jamais kill() — qui coupe le son en plein
 *   milieu ; constaté TUI hub 10/09).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Chemins ──
const SOUND_PLAYER = "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe"; // lecteur AHK v2 (benché hub 09/09)
const SOUND_SCRIPT = join(getAgentDir(), "extensions", "resources", "d2r2-sound-daemon.ahk"); // daemon dédié
const SOUNDS_DIR = join(getAgentDir(), "extensions", "resources", "d2r2"); // les 14 .wav
// State dans le repo, à côté de d2r2.ts (choix Impre) — chemin du projet.
const STATE_FILE = "O:\\Programmation\\IDE\\Pi\\pi-extensions\\d2r2\\d2r2-state.json";

// ── Daemon son (pattern hub) ──
// Un process AHK résident reçoit les chemins sur son stdin et joue en
// séquentiel : pas d'interpréteur à démarrer à chaque réponse.
let soundDaemon: ChildProcess | null = null;

function ensureSoundDaemon(): ChildProcess {
	if (!soundDaemon || soundDaemon.exitCode !== null) {
		soundDaemon = spawn(SOUND_PLAYER, [SOUND_SCRIPT], { stdio: ["pipe", "ignore", "ignore"] });
		soundDaemon.unref();
		soundDaemon.on("error", () => (soundDaemon = null)); // jamais bloquant, respawn au prochain appel
	}
	return soundDaemon;
}

// ── Playlist ──
// Re-listé à chaque appel (<1ms pour 14 fichiers) : ajouter/retirer un son
// du dossier est pris en compte sans /reload. Tri numérique : 1, 2, … 14
// (pas lexicographique, où 10 précéderait 2).
function loadPlaylist(): string[] {
	try {
		return readdirSync(SOUNDS_DIR)
			.filter((f) => f.toLowerCase().endsWith(".wav"))
			.sort((a, b) => {
				const na = a.match(/\d+/)?.[0];
				const nb = b.match(/\d+/)?.[0];
				if (na && nb) return parseInt(na, 10) - parseInt(nb, 10);
				return a.localeCompare(b);
			})
			.map((f) => join(SOUNDS_DIR, f));
	} catch {
		return []; // dossier absent/vide : silence, jamais bloquant
	}
}

// ── State ──
// L'index brut est stocké sans mod : si la playlist grandit, aucun saut
// bizarre — le mod se fait au moment de jouer.
function readIndex(): number {
	try {
		const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { index?: number };
		return typeof parsed.index === "number" && parsed.index >= 0 ? parsed.index : 0;
	} catch {
		return 0; // pas encore de state (1er run) ou corrompu : on repart du début
	}
}

function writeIndex(index: number): void {
	try {
		writeFileSync(STATE_FILE, `${JSON.stringify({ index }, null, "\t")}\n`);
	} catch {
		/* pas de state persisté : le prochain son reprendra au dernier index connu */
	}
}

// ── Lecture ──
// LAST RESORT: aucun événement terminal n'existe pour la lecture audio —
// le process AHK résident est le seul chemin réactif (benché hub 09/09).
function playSound(path: string): void {
	try {
		ensureSoundDaemon().stdin?.write(`${path}\n`);
	} catch {
		/* pas de son : jamais bloquant */
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_settled", async (_event, ctx) => {
		if (ctx.mode !== "tui") return; // pas de son en print/JSON/RPC
		const playlist = loadPlaylist();
		if (playlist.length === 0) return;
		const index = readIndex();
		playSound(playlist[index % playlist.length]);
		writeIndex(index + 1);
	});

	// Le daemon meurt à chaque transition de session : pi recharge les
	// extensions (session_shutdown) — sans end(), l'ancien daemon orphelin
	// reste bloqué sur ReadLine et le respawn suivant affiche « Could not
	// close the previous instance » (hub v0.14.1). end() et pas kill() :
	// le daemon FINIT le son en cours, lit l'EOF et sort proprement.
	pi.on("session_shutdown", () => {
		soundDaemon?.stdin?.end();
		soundDaemon = null;
	});
}
