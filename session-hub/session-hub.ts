/**
 * Session Hub — écran d'accueil pi : workspaces & discussions, art animé.
 *
 * - Lancé depuis le home : le hub s'ouvre d'office (Esc = quitte pi)
 * - `/hub` : ouvre le hub depuis n'importe quelle session
 * - Niveau 1 : les 10 derniers workspaces (par activité) + « tous »
 * - Niveau 2 : les 10 dernières discussions du workspace + « toutes »
 * - Enter : reprendre · Ctrl+N : nouvelle session · Ctrl+R : renommer
 *   Esc : retour arrière (ou quitte pi si auto-launch)
 *
 * L'animation de l'art utilise un timer :
 * LAST RESORT: le shimmer est un phénomène purement temporel — aucun
 * événement alternatif n'existe pour « le temps passe ». Le timer ne vit
 * que pendant l'écran d'accueil et est tué à sa fermeture (finish()).
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, SessionManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { SelectList, type SelectItem } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { basename } from "node:path";

// Type dérivé du runtime : aucune hypothèse sur l'export nommé de SessionInfo.
type SessionInfo = Awaited<ReturnType<typeof SessionManager.listAll>>[number];

// ── Art (braille, généré depuis ghost-small.txt — tête de fille anime) ──
const ART_LINES: string[] = [
"⣿⣿⣿⠁",
		"⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀",
		"⣿⣿⣿⠀⠀⠀⠀⠀⠀⠆⠀⠀⠀⠀⠀⠀⠀⡆⠈⣆",
		"⣿⣿⣷⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠸⠀⠀⠀⠀⠀⠀⠀⢀",
		"⣿⣿⣟⣏⢆⠀⠀⠀⠀⠘⠆⠀⠀⠀⡀⠀⠀⠁⠀⠀⠃⠀⠀⠀⠀⠀⠀⠾",
		"⣿⣿⣿⣿⣞⠂⠀⠀⠀⠀⠈⠀⠀⠀⠐⡀⠀⠀⠠⠀⢠⣄⠀⠀⠀⠀⣠⡄",
		"⣿⣿⣿⠟⠅⠘⠀⠀⠀⠀⠰⣶⠀⢠⡀⠘⠦⣤⣐⠦⣀⡙⠀⠀⢠⣀⠘⠃",
		"⣿⣿⢋⠎⠀⠀⠀⠀⠀⠀⣄⡙⢓⣾⣿⣦⣬⣿⣿⡶⠀⢀⣀⣀⠀⠉",
		"⢿⣵⠋⠀⠀⠀⠀⠀⠀⢰⡾⣩⣦⣍⡻⣿⣿⣿⣿⣿⠿⠿⢿⣿⣇⠀⢀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠",
		"⣿⠋⠀⠀⠀⠀⠀⠀⠀⣨⣾⣿⣿⣿⣿⣿⡻⣿⣿⣿⣷⣴⣤⣈⠙⠛⠒⠃⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘",
		"⠟⠀⠀⠀⠀⠀⠀⠀⢾⣿⣿⣿⣿⣿⣿⣿⣿⣷⣿⣿⣿⣿⣿⣿⣿⣿⢋⣬⣤⢖⡔",
		"⠀⢀⠀⠠⠀⠀⠀⠀⠈⡻⣿⡿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣏⣛⡻⠿⠻⣑⣼⣯⠀⡄",
		"⢀⠆⠀⠀⠀⠀⠀⠀⠀⢸⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣷⣿⣾⣽⢰⡇",
		"⣴⠃⠀⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢼⡁",
		"⣁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣬⣿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠇",
		"⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⢿⣿⣾⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⡆",
		"⡤⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣶⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠃",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠿⣛⣉⣠⣴⡖⢀",
		"⠀⠀⠀⠀⠀⡄⠀⠀⠀⠀⠀⠀⠙⠿⣿⣿⣿⣿⠿⠿⠟⠛⠋⠹⣶⣶⣿⣿⣿⣿⣿⣼⠈",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢿⣿⣿⣿⣿⣿⡟",
		"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣿⣿⣿⡿⠛⠁",
		"⢀⢰⠀⠀⢠⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠹⠫⢕⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⠐",
		"⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠞⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣾⣿⣿⣿",
		"⠀⠐⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣿⣿⣿⣿⣿⡏",
		"⢿⠀⢿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀⢀⣀⣶⣾⣿⣿⣿⣿⠿⠉⠁",
		"⠈⠈⠈⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠉⠉⠉⠉⠉⠉",
];
const ART_W = Math.max(...ART_LINES.map((l) => visibleWidth(l)));

// ── Rendu helpers ──
const RESET = "\x1b[0m";

/** Vert truecolor interpolé entre #15803d (sombre) et #86efac (clair). */
function lerpGreen(t: number): string {
	const from = [21, 128, 61];
	const to = [134, 239, 172];
	const c = from.map((f, i) => Math.round(f + (to[i] - f) * t));
	return `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
}

function padEndVis(s: string, w: number): string {
	return s + " ".repeat(Math.max(0, w - visibleWidth(s)));
}

function firstLine(s: string, max: number): string {
	const line = s.split("\n")[0].replace(/\s+/g, " ").trim();
	return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

function relTime(d: Date): string {
	const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
	if (sec < 60) return "à l'instant";
	const min = sec / 60;
	if (min < 60) return `${Math.floor(min)} min`;
	const h = min / 60;
	if (h < 24) return `${Math.floor(h)} h`;
	const j = h / 24;
	if (j < 7) return `${Math.floor(j)} j`;
	if (j < 30) return `${Math.floor(j / 7)} sem`;
	if (j < 365) return `${Math.floor(j / 30)} mois`;
	return `${Math.floor(j / 365)} an`;
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
	action: "switch" | "new" | "quit" | "rename";
	path?: string;
	cwd?: string;
	label?: string;
}

// switchSession n'est typé que sur ExtensionCommandContext ; à l'exécution le
// runtime peut l'exposer aussi sur le ctx des events. On check, sinon fallback.
type SwitchFn = ExtensionCommandContext["switchSession"];
type HubContext = ExtensionContext & { switchSession?: SwitchFn };

function getSwitch(ctx: HubContext): SwitchFn | undefined {
	const fn = (ctx as unknown as Record<string, unknown>).switchSession;
	return typeof fn === "function" ? (fn as SwitchFn) : undefined;
}

// ── L'écran ──
const MAX_VISIBLE = 12;
const RECENT_COUNT = 10;
const FRAME_MS = 125; // ~8 FPS : un fantôme flotte, il ne court pas

class HubScreen {
	private level: "workspaces" | "sessions" = "workspaces";
	private workspaceCwd: string | null = null;
	private showAllWorkspaces = false;
	private showAllSessions = false;
	private selectList!: SelectList;
	private timer: ReturnType<typeof setInterval> | null = null;
	private frame = 0;
	private tui!: { requestRender(): void };
	private theme!: Theme;
	private done!: (v: HubResult | null) => void;
	private border!: DynamicBorder;

	constructor(
		private ctx: HubContext,
		private workspaces: Workspace[],
		private autoLaunched: boolean,
	) {}

	bind(tui: { requestRender(): void }, theme: Theme, done: (v: HubResult | null) => void): {
		render: (width: number) => string[];
		invalidate: () => void;
		handleInput: (data: string) => void;
	} {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.border = new DynamicBorder((s) => theme.fg("border", s));
		this.rebuild();
		// LAST RESORT: animation par frames — voir note d'en-tête.
		this.timer = setInterval(() => {
			this.frame++;
			this.tui.requestRender();
		}, FRAME_MS);

		return {
			render: (w) => this.render(w),
			invalidate: () => this.selectList.invalidate(),
			handleInput: (data) => this.handleInput(data),
		};
	}

	private finish(v: HubResult | null): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.done(v);
	}

	private t(): Theme {
		return this.theme;
	}

	private currentSessions(): SessionInfo[] {
		return this.workspaces.find((w) => w.cwd === this.workspaceCwd)?.sessions ?? [];
	}

	private buildItems(): SelectItem[] {
		const t = this.t();
		if (this.level === "workspaces") {
			const sorted = this.showAllWorkspaces
				? this.workspaces
				: this.workspaces.slice(0, RECENT_COUNT);
			const items: SelectItem[] = sorted.map((w) => ({
				value: `ws:${w.cwd}`,
				label: basename(w.cwd) || w.cwd,
				description: `${w.sessions.length} session${w.sessions.length > 1 ? "s" : ""} · ${relTime(w.sessions[0].modified)}`,
			}));
			if (!this.showAllWorkspaces && this.workspaces.length > RECENT_COUNT) {
				items.push({
					value: "all-ws",
					label: "📂 Tous les workspaces…",
					description: `${this.workspaces.length} au total`,
				});
			}
			void t;
			return items;
		}
		// niveau sessions
		const sessions = this.currentSessions();
		const sorted = this.showAllSessions ? sessions : sessions.slice(0, RECENT_COUNT);
		const items: SelectItem[] = sorted.map((s) => ({
			value: `sess:${s.path}`,
			label: s.name || firstLine(s.firstMessage, 44) || "(session vide)",
			description: `${relTime(s.modified)} · ${s.messageCount} msg`,
		}));
		if (!this.showAllSessions && sessions.length > RECENT_COUNT) {
			items.push({
				value: "all-sess",
				label: "📜 Tout afficher…",
				description: `${sessions.length} au total`,
			});
		}
		return items;
	}

	private rebuild(): void {
		const t = this.t();
		const items = this.buildItems();
		this.selectList = new SelectList(
			items,
			Math.min(items.length, MAX_VISIBLE),
			{
				selectedPrefix: (s) => t.fg("accent", s),
				selectedText: (s) => t.fg("accent", s),
				description: (s) => t.fg("muted", s),
				scrollInfo: (s) => t.fg("dim", s),
				noMatch: (s) => t.fg("warning", s),
			},
		);
		this.selectList.onSelect = (item) => this.pick(String(item.value));
		this.selectList.onCancel = () => this.onEscape();
	}

	private pick(value: string): void {
		if (value.startsWith("ws:")) {
			this.level = "sessions";
			this.workspaceCwd = value.slice(3);
			this.showAllSessions = false;
			this.rebuild();
		} else if (value === "all-ws") {
			this.showAllWorkspaces = true;
			this.rebuild();
		} else if (value === "all-sess") {
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
		if (this.level === "sessions") {
			this.level = "workspaces";
			this.workspaceCwd = null;
			this.showAllSessions = false;
			this.rebuild();
			this.tui.requestRender();
			return;
		}
		// Niveau 1 : si auto-launch, Esc = sortie de pi (décision design).
		this.finish(this.autoLaunched ? { action: "quit" } : null);
	}

	private handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.onEscape();
			return;
		}
		if (matchesKey(data, "ctrl+n")) {
			const cwd = this.level === "sessions" ? this.workspaceCwd : this.selectedWorkspaceCwd();
			if (cwd) this.finish({ action: "new", cwd });
			return;
		}
		if (matchesKey(data, "ctrl+r") && this.level === "sessions") {
			const sel = this.selectList.getSelectedItem();
			if (sel && String(sel.value).startsWith("sess:")) {
				this.finish({ action: "rename", path: String(sel.value).slice(5), label: sel.label });
			}
			return;
		}
		this.selectList.handleInput(data);
		this.tui.requestRender();
	}

	private selectedWorkspaceCwd(): string | null {
		const sel = this.selectList.getSelectedItem();
		if (!sel) return null;
		const v = String(sel.value);
		return v.startsWith("ws:") ? v.slice(3) : this.workspaceCwd;
	}

	private title(): string {
		const t = this.t();
		let title = t.fg("accent", t.bold("◈ session hub"));
		if (this.level === "sessions" && this.workspaceCwd) {
			title += t.fg("dim", ` — ${basename(this.workspaceCwd) || this.workspaceCwd}`);
		}
		return title;
	}

	private render(width: number): string[] {
		const w = Math.min(width, 110);
		const showArt = w >= ART_W + 44;
		const listW = Math.max(36, w - ART_W - 6);

		const out: string[] = [];
		out.push(...this.border.render(w));
		out.push(this.title());

		const listLines = this.selectList.render(showArt ? listW : w - 2);
		const bodyH = Math.max(showArt ? ART_LINES.length : 0, listLines.length);
		for (let y = 0; y < bodyH; y++) {
			let line = "";
			if (showArt) {
				const raw = ART_LINES[y] ?? "";
				// Shimmer : vague sinusoïdale verticale, amplitude douce.
				const wave = 0.62 + 0.38 * Math.sin(this.frame * 0.32 + y * 0.52);
				line += lerpGreen(wave) + raw + RESET;
				line += " ".repeat(ART_W - visibleWidth(raw) + 3);
			}
			line += listLines[y] ?? "";
			out.push(line);
		}
		out.push("");
		out.push(
			this.t().fg(
				"dim",
				"  ↑↓ navigate · enter select · ctrl+n new · ctrl+r rename · esc " +
					(this.autoLaunched ? "quit" : "close"),
			),
		);
		out.push(...this.border.render(w));
		return out;
	}
}

// ── Ouverture du hub & actions ──

async function openHub(ctx: HubContext, opts: { autoLaunched: boolean }): Promise<HubResult | null> {
	const workspaces = await collectWorkspaces();
	if (workspaces.length === 0) {
		ctx.ui.notify("Aucune session trouvée", "info");
		return null;
	}
	const screen = new HubScreen(ctx, workspaces, opts.autoLaunched);
	return ctx.ui.custom<HubResult | null>((tui, theme, _kb, done) => screen.bind(tui, theme, done));
}

async function actOnResult(result: HubResult | null, ctx: HubContext): Promise<void> {
	if (!result) return;

	if (result.action === "quit") {
		ctx.shutdown();
		return;
	}

	const sw = getSwitch(ctx);
	if (!sw) {
		// ctx d'event sans méthodes runtime : fallback propre.
		ctx.ui.setEditorText("/hub");
		ctx.ui.notify("Appuie ↵ pour ouvrir le hub", "info");
		return;
	}

	if (result.action === "switch" && result.path) {
		const label = result.label ?? "";
		await sw(result.path, {
			withSession: async (c) => {
				c.ui.notify(`Reprise : ${label}`, "info");
			},
		});
		return;
	}

	if (result.action === "new" && result.cwd) {
		const cwd = result.cwd;
		const sm = SessionManager.create(cwd);
		const file = sm.getSessionFile();
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

	if (result.action === "rename" && result.path) {
		const name = await ctx.ui.input("Nom de la session :", result.label ?? "");
		if (name?.trim()) {
			try {
				SessionManager.open(result.path).appendSessionInfo(name.trim());
				ctx.ui.notify(`Renommée : ${name.trim()}`, "info");
			} catch (e) {
				ctx.ui.notify(`Échec du renommage : ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		}
		// Retour au hub après le renommage.
		const again = await openHub(ctx, { autoLaunched: false });
		await actOnResult(again, ctx);
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("hub", {
		description: "Session hub — workspaces & discussions",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				ctx.ui.notify("Session hub : mode TUI uniquement", "warning");
				return;
			}
			const result = await openHub(ctx, { autoLaunched: false });
			await actOnResult(result, ctx);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") return;
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		if (ctx.cwd !== homedir()) return; // décision : auto uniquement sur home
		const result = await openHub(ctx, { autoLaunched: true });
		await actOnResult(result, ctx);
	});
}
