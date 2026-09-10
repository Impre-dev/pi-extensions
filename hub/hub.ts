/**
 * Hub — écran d'accueil pi : workspaces & discussions, art braille.
 *
 * - Lancé depuis le home : le hub s'ouvre d'office (header minimal).
 *   En session normale : header logo pi + version (absorbe custom-header.ts).
 * - `/hub` : ouvre le hub · `/hub <path|id>` : reprendre direct ·
 *   `/hub --new <cwd>` : créer direct · Ctrl+H : ouvrir le hub partout.
 * - Niveau 1 : les 10 derniers workspaces (par activité) + « tous »
 *   Options : Accueil (header natif) · Root (~/.pi/agent) · Quitter
 * - Niveau 2 : les 10 dernières discussions du workspace + « toutes »
 *   Options : New · Rename (mode cible jaune → ↵ ou clic) · Retour
 * - LE COEUR : le ctx des events n'a pas le pouvoir de switcher (prouvé par
 *   diagnostic). Au choix d'une discussion, l'extension queue la commande
 *   `/hub <id>` via `pi.sendUserMessage(..., { deliverAs: "followUp" })` —
 *   pi l'exécute comme commande slash avec un ctx command → switch direct,
 *   zéro champ prérempli, zéro action utilisateur après le choix.
 * - Souris : liste et options cliquables — capture active en fullscreen.
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir, SessionManager, VERSION } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeSync, writeFileSync } from "node:fs";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { SelectList, type SelectItem, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { basename, join } from "node:path";

// Type dérivé du runtime : aucune hypothèse sur l'export nommé de SessionInfo.
type SessionInfo = Awaited<ReturnType<typeof SessionManager.listAll>>[number];

// ── Art (braille, injecté par dev/tools/use-art.mjs) ──
const ART_LINES: string[] = [
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠗",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡸",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠃",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡏",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣠⣴⣄⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⠤⡚⠠⣿",
		"⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠤⠐⠒⠂⠉⠉⢁⣀⣀⣀⣀⣀⣀⡀⠀⠀⠄⠄⠀⠐⢀⣐⣀⣈⡉⠁⠑⠓⠠⢄⡀",
		"⠀⠀⠀⠀⠀⢀⣔⠩⠄⠐⢒⠂⠉⠉⠉⠁⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢩⡉⠉⠆⠒⠒⡷⡄",
		"⠀⠀⠀⠀⠀⠘⡄⠐⠥⣃⣈⣀⡀⠠⠤⠤⠄⠀⠒⠒⠒⢒⡒⠶⠶⢀⡀⠐⠒⠒⠒⠒⠲⣶⣲⢤⣤⣤⡤⠤⠤⣭⠇",
		"⠀⠀⠀⠀⠀⠀⠈⢏⠀⠀⠀⠃⠀⠀⠀⠀⠀⠀⠀⢀⠖⣽⣶⣶⣷⣶⣌⠱⡄⢀⣄⠀⠀⣿⣿⢫⡿⠉⠀⠀⡰⠁",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠣⡀⠀⠀⠃⠀⠀⠀⠀⠀⢰⢃⣾⣿⣿⣿⣿⣧⣽⣧⠼⡈⠉⠀⢼⠷⢿⡟⠁⠀⢀⠎",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⠀⠐⠐⠀⠀⠒⠐⠸⠰⣿⣿⣿⣿⣿⣿⣿⣿⠀⠗⠒⠂⠀⠐⠤⠤⠄⡤⠋",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠆⠀⠀⠀⠀⠀⠄⠀⢣⠻⣿⣿⣿⣿⣿⣿⢃⣸⠃⠀⠀⠀⠀⠀⠆⡐⠁",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⢀⣀⡀⡀⡀⢀⣀⣑⠤⣉⣛⣛⣉⠠⠚⠁⠈⢶⣎⡀⢀⡀⣰⠁",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢡⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠩⠄⠩⠀⠀⠀⠀⠼⢁⠃",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡆⠀⠀⠰⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡂⡜",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠂⢤⣀⣀⣀⣀⠀⠀⠀⠠⠀⠈⠀⢀⣀⣀⡀⠤⣴⠔⠁",
		"⠀⠀⠀⠀⡤⡲⠖⢤⣰⣲⢄⠀⠀⠀⠀⠀⠉⠒⠒⢠⢬⠭⠭⣭⠭⡭⠭⠤⢤⠘⠒⠉⠁⠀⠀⠀⠀⠀⠀⢀⣀",
		"⠀⠀⢠⢎⠝⠁⠀⠀⠈⢢⠑⠳⡠⡀⠀⠀⠀⠀⢠⣖⡳⣦⠀⢹⢀⠀⠀⣼⢺⣦⠀⠀⠀⠀⠀⠀⣀⣤⠖⠛⡺⠖⠉⢫⡻⣆",
		"⠀⢀⢮⠊⠀⢀⢠⠀⠀⡆⠀⠀⠈⠢⡕⠠⣀⡠⣚⠽⠷⠟⢲⣴⣤⣤⠔⠛⠚⠪⡢⣀⣀⠤⢒⠝⠉⠀⠀⣼⠀⠀⠀⠀⠙⡘⢆",
		"⠀⡘⠆⠀⠀⠌⠈⠀⠌⠀⠀⠀⠀⠀⠈⠱⢥⠼⠁⠀⠀⠀⢸⣟⣿⣿⠀⠀⠀⠀⠈⢫⣘⡖⠁⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠘⢎⢆",
		"⢠⢹⠁⠀⢠⢠⢶⡎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡿⣻⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠣⡀⠀⠀⠈⡞⠈⢎⡆",
		"⡸⡇⠀⠀⠘⣿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣦⠊⠀⠀⠈⡾",
		"⡇⠁⠀⠀⡠⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠱⣝⢧⠀⠀⠀⢸⡇",
		"⡇⠀⢀⠜⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⣄⠀⠐⠈⣧",
		"⢣⡄⢀⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⡄⠀⢿",
		"⠘⣇⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⢸",
		"⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠋",
];
const ART_W = Math.max(...ART_LINES.map((l) => visibleWidth(l)));

// ── Rendu ──
const RESET = "\x1b[0m";
const FLAT = "\x1b[1;32m"; // vert bold — art, sélection, libellés actifs
const GREEN = "\x1b[32m"; // vert normal — logo header
const YELLOW = "\x1b[1;33m"; // jaune bold — cible du mode renommage
const PAD = "  ";

// ── Calibrage chirurgical (itère avec Impre) ──
const RACINE_OFFSET_X = 0; // décalage horizontal du bloc au niveau racine (cols)
const SESSIONS_OFFSET_X = 0; // décalage horizontal du bloc au niveau discussions (cols)
const LIST_DROP = 9; // décalage vertical : la liste commence sous le haut du robot
const LIST_WIDTH = 30; // largeur de la colonne liste (labels seuls)
const ACTION_GAP = 3; // espaces entre les options du bas
const RACINE_ACTIONS_OFFSET_X = 1; // options du bas, niveau racine (cols, négatif = gauche) — calibré
const SESSIONS_ACTIONS_OFFSET_X = 0; // options du bas, niveau discussions (à tuner)
const ACTION_SOUND: string = join(getAgentDir(), "extensions", "resources", "key.wav"); // son d'action (.wav — vide = muet)
const SOUND_PLAYER: string = "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe"; // lecteur AHK v2 — ~100ms de démarrage vs ~370ms PowerShell (benché 09/09)
const SOUND_SCRIPT: string = join(getAgentDir(), "extensions", "resources", "sound-daemon.ahk"); // daemon AHK : boucle stdin → SoundPlay

// SessionManager.create() ne flush pas le fichier (lazy) : le .jsonl n'existe PAS sur
// disque au retour. Or switchSession → SessionManager.open() exige un fichier existant —
// sans header sur disque, il retombe sur process.cwd() (le chemin d'ouverture de pi) :
// la session tournait au mauvais endroit avec un header contaminé (prouvé par logs 10/09).
// Fix : flusher le header officiel (getHeader) avant tout switch.
function createFlushedSession(cwd: string): string | undefined {
	const sm = SessionManager.create(cwd);
	const file = sm.getSessionFile();
	if (!file) return undefined;
	if (!existsSync(file)) {
		const header = sm.getHeader();
		if (!header) return undefined;
		writeFileSync(file, `${JSON.stringify(header)}\n`);
	}
	return file;
}

function diagLog(msg: string): void {
	try {
		writeFileSync(join(homedir(), ".pi", "agent", "hub-diag.log"), `${new Date().toISOString()} ${msg}\n`, { flag: "a" });
	} catch { /* ignore */ }
}

function padEndVis(s: string, w: number): string {
	return s + " ".repeat(Math.max(0, w - visibleWidth(s)));
}

function sessionIdFromPath(path: string): string {
	return basename(path, ".jsonl").split("_").pop() ?? "";
}

function firstLine(s: string, max: number): string {
	const line = s.split("\n")[0].replace(/\s+/g, " ").trim();
	return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

// ── Daemon son ──
// Un process AHK résident reçoit les chemins sur son stdin et joue en séquentiel :
// plus d'interpréteur à démarrer à chaque action (le cumul rendait le son lent).
// Vit jusqu'à la fermeture de pi — le pipe stdin casse, ReadLine retourne vide,
// l'AHK sort proprement tout seul. Respawn auto s'il meurt.
let soundDaemon: ChildProcess | null = null;

function ensureSoundDaemon(): ChildProcess {
	if (!soundDaemon || soundDaemon.exitCode !== null) {
		soundDaemon = spawn(SOUND_PLAYER, [SOUND_SCRIPT], { stdio: ["pipe", "ignore", "ignore"] });
		soundDaemon.unref();
		soundDaemon.on("error", () => (soundDaemon = null)); // jamais bloquant, respawn au prochain appel
	}
	return soundDaemon;
}

/** Joue le son via le daemon (écriture stdin, ~0ms) — silence si non configuré.
 *  LAST RESORT: aucun événement terminal n'existe pour la lecture audio — le
 *  process externe résident est le seul chemin réactif. */
function playActionSound(): void {
	if (!ACTION_SOUND) return;
	try {
		ensureSoundDaemon().stdin?.write(ACTION_SOUND + "\n");
	} catch {
		/* pas de son : jamais bloquant */
	}
}

// ── Header logo pi (repris de l'ex-custom-header.ts) ──
function buildHeaderLines(theme: Theme): string[] {
	const lines = [
		"   ███████████████████████████╗  ",
		"   ╚══██████╔════════██████╔══╝  ",
		"      ██████║        ██████║     ",
		"      ██████║        ██████║     ",
		"      ██████║        ██████║     ",
		"      ██████║        ██████║     ",
		"      ██████║        ██████║     ",
		"      ██████║        ██████║     ",
		"   ████████████╗  ████████████╗  ",
		"   ╚═══════════╝  ╚═══════════╝  ",
	].map((line) => `${FLAT}${line}${RESET}`);
	lines.push("");
	lines.push(theme.bold(theme.fg("accent", "pi")) + theme.fg("dim", ` v${VERSION}`));
	return lines;
}

// ── Données ──
interface Workspace {
	cwd: string;
	sessions: SessionInfo[];
}

async function collectWorkspaces(): Promise<Workspace[]> {
	const all = await SessionManager.listAll();
	const map = new Map<string, SessionInfo[]>();
	for (const s of all) {
		if (!s.cwd) continue;
		const arr = map.get(s.cwd) ?? [];
		arr.push(s);
		map.set(s.cwd, arr);
	}
	const out: Workspace[] = [];
	for (const [cwd, sessions] of map) {
		sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
		out.push({ cwd, sessions });
	}
	out.sort((a, b) => b.sessions[0].modified.getTime() - a.sessions[0].modified.getTime());
	return out;
}

// ── Résultat du hub ──
interface HubResult {
	action: "switch" | "new" | "quit" | "rename" | "home";
	path?: string;
	cwd?: string;
	label?: string;
}

// switchSession n'est typé que sur ExtensionCommandContext ; à l'exécution le
// runtime peut l'exposer aussi sur les ctx command (commandes, shortcuts).
type SwitchFn = ExtensionCommandContext["switchSession"];
type HubContext = ExtensionContext & { switchSession?: SwitchFn };

function getSwitch(ctx: HubContext): SwitchFn | undefined {
	const fn = (ctx as unknown as Record<string, unknown>).switchSession;
	return typeof fn === "function" ? (fn as SwitchFn) : undefined;
}

// ── L'écran ──
const MAX_VISIBLE = 12;
const RECENT_COUNT = 10;

class HubScreen {
	private level: "workspaces" | "sessions" = "workspaces";
	private workspaceCwd: string | null = null;
	private showAllWorkspaces = false;
	private showAllSessions = false;
	private pendingRename = false;
	private selectList!: SelectList;
	private tui!: { requestRender(): void; terminal: { rows: number } };
	private theme!: Theme;
	private done!: (v: HubResult | null) => void;
	private bodyRow = -1;
	private bodyHeight = 0;
	private bodyX0 = 0;
	private listX0 = 0;
	private hintRow = -1;
	private actionSpans: Array<{ x0: number; x1: number; run: () => void }> = [];

	constructor(
		private ctx: HubContext,
		private workspaces: Workspace[],
		openWorkspace?: string,
	) {
		if (openWorkspace) {
			this.level = "sessions";
			this.workspaceCwd = openWorkspace;
		}
	}

	bind(tui: { requestRender(): void; terminal: { rows: number } }, theme: Theme, done: (v: HubResult | null) => void): {
		render: (width: number) => string[];
		invalidate: () => void;
		handleInput: (data: string) => void;
		handleMouse?: (event: TuiMouseEvent) => TuiMouseEventResult | undefined;
	} {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.rebuild();

		return {
			render: (w) => this.render(w),
			invalidate: () => this.selectList.invalidate(),
			handleInput: (data) => this.handleInput(data),
			handleMouse: (event) => this.handleMouse(event),
		};
	}

	private finish(v: HubResult | null): void {
		playActionSound();
		this.done(v);
	}

	private t(): Theme {
		return this.theme;
	}

	private currentSessions(): SessionInfo[] {
		return this.workspaces.find((w) => w.cwd === this.workspaceCwd)?.sessions ?? [];
	}

	private buildItems(): SelectItem[] {
		if (this.level === "workspaces") {
			const sorted = this.showAllWorkspaces
				? this.workspaces
				: this.workspaces.slice(0, RECENT_COUNT);
			const items: SelectItem[] = sorted.map((w) => ({
				value: `ws:${w.cwd}`,
				label: basename(w.cwd) || w.cwd,
			}));
			if (!this.showAllWorkspaces && this.workspaces.length > RECENT_COUNT) {
				items.push({ value: "all-ws", label: "📂 Tous les workspaces…" });
			}
			return items;
		}
		const sessions = this.currentSessions();
		const sorted = this.showAllSessions ? sessions : sessions.slice(0, RECENT_COUNT);
		const items: SelectItem[] = sorted.map((s) => ({
			value: `sess:${s.path}`,
			label: s.name || firstLine(s.firstMessage, 44) || "(session vide)",
		}));
		if (!this.showAllSessions && sessions.length > RECENT_COUNT) {
			items.push({ value: "all-sess", label: "📜 Tout afficher…" });
		}
		return items;
	}

	private rebuild(): void {
		const t = this.t();
		const items = this.buildItems();
		// En mode renommage, la cible (sélection) passe en jaune.
		const sel = (s: string): string =>
			this.pendingRename ? YELLOW + s + RESET : t.fg("accent", s);
		this.selectList = new SelectList(
			items,
			Math.min(items.length, MAX_VISIBLE),
			{
				selectedPrefix: (s) => sel(s),
				selectedText: (s) => sel(s),
				description: (s) => t.fg("muted", s),
				scrollInfo: (s) => t.fg("dim", s),
				noMatch: (s) => t.fg("warning", s),
			},
		);
		this.selectList.onSelect = (item) => this.pick(String(item.value));
		this.selectList.onCancel = () => this.onEscape();
	}

	private pick(value: string): void {
		// En mode renommage, les clics confirment la cible au lieu d'ouvrir.
		if (this.pendingRename) {
			this.confirmRename();
			return;
		}
		if (value.startsWith("ws:")) {
			playActionSound();
			this.level = "sessions";
			this.workspaceCwd = value.slice(3);
			this.showAllSessions = false;
			this.rebuild();
		} else if (value === "all-ws") {
			playActionSound();
			this.showAllWorkspaces = true;
			this.rebuild();
		} else if (value === "all-sess") {
			playActionSound();
			this.showAllSessions = true;
			this.rebuild();
		} else if (value.startsWith("sess:")) {
			const path = value.slice(5);
			const s = this.currentSessions().find((x) => x.path === path);
			this.finish({ action: "switch", path, label: s?.name ?? basename(path) });
		}
		this.tui.requestRender();
	}

	private onEscape(): void {
		// Mode renommage : Esc annule le mode d'abord.
		if (this.pendingRename) {
			playActionSound();
			this.pendingRename = false;
			this.rebuild();
			this.tui.requestRender();
			return;
		}
		if (this.level === "sessions") {
			playActionSound();
			this.level = "workspaces";
			this.workspaceCwd = null;
			this.showAllSessions = false;
			this.rebuild();
			this.tui.requestRender();
			return;
		}
		// Niveau 1 : Esc = quit pi, où que le hub soit ouvert (comme le bouton).
		this.finish({ action: "quit" });
	}

	private triggerNew(): void {
		if (this.level !== "sessions") return;
		const cwd = this.workspaceCwd;
		if (cwd) this.finish({ action: "new", cwd });
	}

	private enterRenameMode(): void {
		if (this.level !== "sessions" || this.pendingRename) return;
		this.pendingRename = true;
		this.rebuild();
		this.tui.requestRender();
	}

	private cancelRenameMode(): void {
		if (!this.pendingRename) return;
		this.pendingRename = false;
		this.rebuild();
		this.tui.requestRender();
	}

	private confirmRename(): void {
		if (this.level !== "sessions" || !this.pendingRename) return;
		const sel = this.selectList.getSelectedItem();
		if (!sel || !String(sel.value).startsWith("sess:")) return;
		const path = String(sel.value).slice(5);
		const ws = this.workspaces.find((w) => w.sessions.some((x) => x.path === path));
		this.finish({ action: "rename", path, label: sel.label, cwd: ws?.cwd });
	}

	private triggerHome(): void {
		if (this.level !== "workspaces") return;
		this.finish({ action: "home" });
	}

	private triggerRoot(): void {
		if (this.level !== "workspaces") return;
		playActionSound();
		try {
			const child = spawn("explorer.exe", [getAgentDir()], {
				detached: true,
				stdio: "ignore",
			});
			child.unref();
		} catch {
			/* pas de blocage si l'explorateur échoue */
		}
	}

	private handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.onEscape();
			return;
		}
		// Mode renommage : Enter (ou clic) confirme la cible jaune.
		if (this.pendingRename && (data === "\r" || data === "\n")) {
			this.confirmRename();
			return;
		}
		if (this.level === "workspaces") {
			if (matchesKey(data, "ctrl+a")) {
				this.triggerHome();
				return;
			}
			if (matchesKey(data, "ctrl+d")) {
				this.triggerRoot();
				return;
			}
		} else {
			if (matchesKey(data, "ctrl+n")) {
				this.triggerNew();
				return;
			}
			if (matchesKey(data, "ctrl+r")) {
				this.enterRenameMode();
				return;
			}
		}
		this.selectList.handleInput(data);
		this.tui.requestRender();
	}

	// ── Souris ──
	private handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		// Options du bas
		if (event.type === "click" && event.y === this.hintRow) {
			const span = this.actionSpans.find((s) => event.x >= s.x0 && event.x < s.x1);
			if (span) {
				span.run();
				return { handled: true };
			}
			return undefined;
		}
		// Mode renommage : un clic dans la liste confirme la cible jaune.
		if (this.pendingRename && event.type === "click" && this.inList(event)) {
			this.confirmRename();
			return { handled: true };
		}
		// Zone liste : retarget vers le SelectList (coords locales à la liste)
		if (this.inList(event)) {
			const shifted: TuiMouseEvent = {
				...event,
				x: event.x - this.listX0,
				y: event.y - this.bodyRow - LIST_DROP,
			};
			this.selectList.handleMouse(shifted);
			this.tui.requestRender();
			return { handled: true };
		}
		return undefined;
	}

	private inList(event: TuiMouseEvent): boolean {
		return (
			this.bodyRow >= 0 &&
			event.y >= this.bodyRow + LIST_DROP &&
			event.y < this.bodyRow + this.bodyHeight
		);
	}

	// ── Rendu ──
	private render(width: number): string[] {
		const w = Math.min(width, 110); // width = 100% du terminal (overlay)
		const showArt = w >= ART_W + 6 + LIST_WIDTH;
		const listW = Math.min(LIST_WIDTH, Math.max(20, w - 4 - (showArt ? ART_W + 3 : 0)));
		const rows = this.tui.terminal.rows || 24;
		const offsetX = this.level === "workspaces" ? RACINE_OFFSET_X : SESSIONS_OFFSET_X;

		const out: string[] = [];
		out.push("");

		// Body centré horizontalement : robot (gauche) + liste (droite, descendue)
		const gap = 4; // pair => bodyW pair => centrage à la demi-cellule près
		const bodyW = (showArt ? ART_W + gap : 0) + listW;
		const bodyX0 = Math.max(0, Math.round((w - bodyW) / 2)) + offsetX;
		const listLines = [
			...Array(LIST_DROP).fill(""),
			...this.selectList.render(listW),
		];
		this.bodyRow = out.length;
		this.bodyX0 = bodyX0;
		this.listX0 = bodyX0 + (showArt ? ART_W + gap : 0);
		const bodyH = Math.max(showArt ? ART_LINES.length : 0, listLines.length);
		this.bodyHeight = bodyH;
		for (let y = 0; y < bodyH; y++) {
			let line = " ".repeat(bodyX0);
			if (showArt) {
				const raw = ART_LINES[y] ?? "";
				line += FLAT + raw + RESET;
				line += " ".repeat(ART_W - visibleWidth(raw) + gap);
			}
			line += listLines[y] ?? "";
			out.push(line);
		}

		// Pousser les options juste au-dessus de la chatbox pi.
		const CHATBOX_H = 4;
		const filler = Math.max(1, rows - CHATBOX_H - out.length - 1);
		for (let i = 0; i < filler; i++) out.push("");

		// Options du bas, centrées sur l'axe du body — cliquables (fullscreen)
		const t = this.t();
		let actions: Array<{ label: string; hint: string; yellow?: boolean; run: () => void }>;
		if (this.level === "workspaces") {
			actions = [
				{ label: "Accueil", hint: "(ctrl+a)", run: () => this.triggerHome() },
				{ label: "Root", hint: "(ctrl+d)", run: () => this.triggerRoot() },
				{ label: "Quitter", hint: "(esc)", run: () => this.finish({ action: "quit" }) },
			];
		} else if (this.pendingRename) {
			actions = [
				{ label: "New", hint: "(ctrl+n)", run: () => this.triggerNew() },
				{ label: "Confirmer", hint: "(↵ ou clic)", yellow: true, run: () => this.confirmRename() },
				{ label: "Annuler", hint: "(esc)", run: () => this.cancelRenameMode() },
			];
		} else {
			actions = [
				{ label: "New", hint: "(ctrl+n)", run: () => this.triggerNew() },
				{ label: "Rename", hint: "(ctrl+r)", run: () => this.enterRenameMode() },
				{ label: "Retour", hint: "(esc)", run: () => this.onEscape() },
			];
		}
		let hint = "";
		const spans: Array<{ x0: number; x1: number; run: () => void }> = [];
		for (const a of actions) {
			if (hint) hint += " ".repeat(ACTION_GAP);
			const x0 = visibleWidth(hint);
			hint += (a.yellow ? YELLOW + t.bold(a.label) : t.fg("accent", t.bold(a.label))) + RESET;
			hint += t.fg("dim", ` ${a.hint}`) + RESET;
			spans.push({ x0, x1: visibleWidth(hint), run: a.run });
		}
		// Options centrées sur l'axe du body (même centre que robot+liste)
		const actionsOffsetX =
			this.level === "workspaces" ? RACINE_ACTIONS_OFFSET_X : SESSIONS_ACTIONS_OFFSET_X;
		const padL = Math.max(
			0,
			Math.round(bodyX0 + bodyW / 2 - visibleWidth(hint) / 2) + actionsOffsetX,
		);
		this.hintRow = out.length;
		this.actionSpans = spans.map((s) => ({ x0: s.x0 + padL, x1: s.x1 + padL, run: s.run }));
		out.push(" ".repeat(padL) + hint);
		return out;
	}
}

// ── Ouverture du hub & actions ──

let hubOpen = false; // garde anti-réouverture (shortcut pendant que le hub est ouvert)

async function openHub(ctx: HubContext, opts: { openWorkspace?: string } = {}): Promise<HubResult | null> {
	if (hubOpen) return null;
	const workspaces = await collectWorkspaces();
	if (workspaces.length === 0) {
		ctx.ui.notify("Aucune session trouvée", "info");
		return null;
	}
	const screen = new HubScreen(ctx, workspaces, opts.openWorkspace);
	ensureSoundDaemon(); // amorce le daemon pendant l'affichage du hub — le 1er son est réactif aussi
	hubOpen = true;
	try {
		return await ctx.ui.custom<HubResult | null>(
			(tui, theme, _kb, done) => screen.bind(tui, theme, done),
			{
				overlay: true,
				overlayOptions: { anchor: "top-center", width: "100%", margin: { top: 1 } },
			},
		);
	} finally {
		hubOpen = false;
	}
}

async function actOnResult(
	result: HubResult | null,
	ctx: HubContext,
	pi: ExtensionAPI,
): Promise<void> {
	if (!result) return;

	if (result.action === "quit") {
		// Clear ANSI + exit direct. LAST RESORT: ctx.shutdown() est deferred
		// "until idle" et avalé pendant le startup (testé : Quitter depuis le
		// hub au lancement ne quitte pas). Les sessions sont déjà persistées
		// (JSONL append-only) — exit déterministe et sans perte.
		writeSync(1, "\x1b[2J\x1b[3J\x1b[H");
		process.exit(0);
	}

	if (result.action === "home") {
		// Restaure le header natif de pi (version, extensions, AGENTS.md…)
		ctx.ui.setHeader(undefined);
		return;
	}

	if (result.action === "rename" && result.path) {
		// Le renommage est du filesystem : pas besoin de ctx command.
		const name = await ctx.ui.input("Nom de la session :", result.label ?? "");
		if (name?.trim()) {
			try {
				SessionManager.open(result.path).appendSessionInfo(name.trim());
				ctx.ui.notify(`Renommée : ${name.trim()}`, "info");
			} catch (e) {
				ctx.ui.notify(`Échec du renommage : ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		}
		// Retour au hub, directement dans le workspace de la discussion.
		const again = await openHub(ctx, { openWorkspace: result.cwd });
		await actOnResult(again, ctx, pi);
		return;
	}

	// switch / new : nécessitent un ctx command. Si le hub a été ouvert depuis
	// un ctx command (commande /hub, shortcut Ctrl+H) → switch direct.
	// Sinon (ouvert au lancement via ctx event) → on queue la commande /hub
	// comme follow-up : pi l'exécute avec un ctx command — zéro action user.
	const sw = getSwitch(ctx);
	if (sw && result.action === "switch" && result.path) {
		const label = result.label ?? "";
		try {
			await sw(result.path, {
				withSession: async (c) => {
					c.ui.notify(`Reprise : ${label}`, "info");
				},
			});
			return;
		} catch (e) {
			diagLog(`SWITCH ERROR: ${e instanceof Error ? e.message : String(e)}`);
			ctx.ui.notify(`SWITCH ERROR: ${e instanceof Error ? e.message : String(e)}`, "error");
			return;
		}
	}

	if (sw && result.action === "new" && result.cwd) {
		const cwd = result.cwd;
		const file = createFlushedSession(cwd);
		if (!file) {
			ctx.ui.notify("Création de session impossible", "error");
			return;
		}
		await sw(file, {
			withSession: async (c) => {
				c.ui.notify(
					`Nouvelle session dans ${basename(cwd)} — /name pour la nommer`,
					"info",
				);
			},
		});
		return;
	}

	// Fallback : queue la commande /hub — pi l'exécute avec un ctx command.
	if (result.action === "switch" && result.path) {
		diagLog(`fallback sendUserMessage → /hub ${sessionIdFromPath(result.path)}`);
		pi.sendUserMessage(`/hub ${sessionIdFromPath(result.path)}`, {
			deliverAs: "followUp",
			expandPromptTemplates: true,
		});
		return;
	}
	if (result.action === "new" && result.cwd) {
		pi.sendUserMessage(`/hub --new ${result.cwd}`, {
			deliverAs: "followUp",
			expandPromptTemplates: true,
		});
		return;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("hub", {
		description:
			"Hub — workspaces & discussions (/hub <path|id> reprendre, /hub --new <cwd> créer)",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				ctx.ui.notify("Hub : mode TUI uniquement", "warning");
				return;
			}

			// /hub --new <cwd> : créer une session dans le workspace donné
			const trimmed = (args ?? "").trim();
			if (trimmed.startsWith("--new ")) {
				const cwd = trimmed.slice(6).trim();
				if (cwd) {
					const file = createFlushedSession(cwd);
					const sw = getSwitch(ctx);
					if (sw && file) {
						await sw(file, {
							withSession: async (c) => {
								c.ui.notify(`Nouvelle session dans ${basename(cwd)}`, "info");
							},
						});
						return;
					}
					pi.sendUserMessage(`/hub --new ${cwd}`, {
						deliverAs: "followUp",
						expandPromptTemplates: true,
					});
					return;
				}
			}

			// /hub <path|id> : reprendre directement une session
			if (trimmed && !trimmed.startsWith("--")) {
				const all = await SessionManager.listAll();
				const match =
					all.find((s) => s.path === trimmed) ??
					all.find((s) => s.id.startsWith(trimmed)) ??
					all.find((s) => s.path.toLowerCase() === trimmed.toLowerCase());
				if (match) {
					const sw = getSwitch(ctx);
					if (sw) {
						await sw(match.path, {
							withSession: async (c) => {
								c.ui.notify(`Reprise : ${match.name || basename(match.path)}`, "info");
							},
						});
						return;
					}
					pi.sendUserMessage(`/hub ${sessionIdFromPath(match.path)}`, {
						deliverAs: "followUp",
						expandPromptTemplates: true,
					});
					return;
				}
				ctx.ui.notify(`Session introuvable : ${trimmed}`, "warning");
				return;
			}

			const result = await openHub(ctx);
			await actOnResult(result, ctx, pi);
		},
	});

	// Ctrl+H : ouvrir le hub depuis n'importe où (discussions, accueil natif)
	pi.registerShortcut("ctrl+h", {
		description: "Hub — workspaces & discussions",
		handler: async (ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) return;
			const result = await openHub(ctx);
			await actOnResult(result, ctx, pi);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		const onHome = ctx.cwd === homedir();

		if (onHome && event.reason === "startup") {
			// Hub plein écran : header minimal.
			ctx.ui.setHeader(() => ({ render: () => [""], invalidate() {} }));
			const result = await openHub(ctx);
			await actOnResult(result, ctx, pi);
			return;
		}

		// Session normale : header logo pi (rôle repris de custom-header.ts).
		ctx.ui.setHeader((_tui, theme) => ({
			render: () => buildHeaderLines(theme),
			invalidate() {},
		}));
	});
}
