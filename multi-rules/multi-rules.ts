/**
 * pi-multi-rules — chargement multi-fichiers de règles persistantes.
 *
 * v2 — multi-roots : en plus du dossier global et du cwd, l'extension lit
 * PI_WORKSPACE_FOLDERS_JSON (racines du workspace VS Code, passées par Pi-xel
 * au spawn du process rpc — l'ordre reçu fait foi, le cwd est envoyé en
 * dernier = plus de poids conversationnel) et PI_PIXEL_SRC (repo source de
 * Pi-xel : annoncé dans le system prompt ET scanné comme racine de règles).
 * Sans env var (pi lancé en TUI), comportement v1 : global + cwd seul.
 *
 * Dossiers globaux groupés : ~/.pi/agent/rules/<groupe>/*.md (profondeur 2
 * max, un seul niveau de groupe) → un git clone de règles partagées dans
 * rules/ suffit, plus besoin de symlinks.
 *
 * Tri (par dossier) : fichiers préfixés `NN-` d'abord (par numéro croissant),
 * puis non-préfixés par ordre alphabétique insensible à la casse.
 *
 * /rules : liste des règles chargées (niveau, nom, chemin, taille).
 *
 * Spec : Desktop/test_pi/spec-pi-multi-rules.md
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	CONFIG_DIR_NAME,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const MARKER = "# Rules (loaded by pi-multi-rules)";
const PREFIX_RE = /^(\d+)-/;

interface RuleFile {
	label: string; // global | global:<groupe> | project | root:<nom>
	file: string;
	path: string;
	size: number;
	content: string;
}

interface RulesSnapshot {
	rules: RuleFile[];
	warnings: string[];
	pixelSrc: string | null;
}

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}

/** realpath + clé de dédup (Windows insensible à la casse). null si absent. */
function realPathKey(dir: string): string | null {
	try {
		const real = fs.realpathSync(dir);
		return process.platform === "win32" ? real.toLowerCase() : real;
	} catch {
		return null;
	}
}

/** Tri : préfixe numérique optionnel d'abord, alpha insensible à la casse ensuite. */
function compareNames(a: string, b: string): number {
	const pa = PREFIX_RE.exec(a);
	const pb = PREFIX_RE.exec(b);
	if (pa && pb && pa[1] !== pb[1]) return Number(pa[1]) - Number(pb[1]);
	if (pa && !pb) return -1;
	if (!pa && pb) return 1;
	return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function listRules(dir: string, label: string): RulesSnapshot {
	const snapshot: RulesSnapshot = { rules: [], warnings: [], pixelSrc: null };
	if (!fs.existsSync(dir)) return snapshot;

	const names = fs
		.readdirSync(dir)
		.filter((n) => n.endsWith(".md"))
		.sort(compareNames);

	for (const name of names) {
		const full = path.join(dir, name);
		try {
			// statSync suit les symlinks (workflow dotfiles) et rejette les dossiers "x.md/"
			const stat = fs.statSync(full);
			if (!stat.isFile()) continue;
			const content = fs.readFileSync(full, "utf8").trim();
			if (!content) continue; // fichier vide → skip silencieux
			snapshot.rules.push({ label, file: name, path: full, size: stat.size, content });
		} catch {
			snapshot.warnings.push(`[pi-multi-rules] illisible, règle sautée : ${full}`);
		}
	}
	return snapshot;
}

/** Scanne <dir>/.pi/rules/ une seule fois par realpath (dédup partagé). */
function scanRoot(out: RulesSnapshot, seen: Set<string>, dir: string, label: string): void {
	const key = realPathKey(dir);
	if (!key) {
		out.warnings.push(`[pi-multi-rules] racine introuvable, ignorée : ${dir}`);
		return;
	}
	if (seen.has(key)) return;
	seen.add(key);
	const found = listRules(path.join(dir, CONFIG_DIR_NAME, "rules"), label);
	out.rules.push(...found.rules);
	out.warnings.push(...found.warnings);
}

/** Règles globales : *.md au premier niveau, puis groupes (sous-dossiers, profondeur 2 max). */
function collectGlobal(out: RulesSnapshot): void {
	const globalDir = path.join(agentDir(), "rules");
	if (!fs.existsSync(globalDir)) return;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(globalDir, { withFileTypes: true });
	} catch {
		out.warnings.push(`[pi-multi-rules] illisible : ${globalDir}`);
		return;
	}

	const topLevel = listRules(globalDir, "global");
	out.rules.push(...topLevel.rules);
	out.warnings.push(...topLevel.warnings);

	const groups = entries
		.filter((e) => e.isDirectory() && !e.name.endsWith(".md"))
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	for (const group of groups) {
		const found = listRules(path.join(globalDir, group), `global:${group}`);
		out.rules.push(...found.rules);
		out.warnings.push(...found.warnings);
	}
}

/**
 * Racines projet. Deux modes :
 * - PI_WORKSPACE_FOLDERS_JSON présent (spawné par Pi-xel) : racines workspace
 *   dans l'ordre reçu. Posture trust pragmatique : une racine passée par
 *   Pi-xel est un dossier ouvert explicitement dans VS Code = trusted by
 *   construction (le trust natif de pi ne couvre que le cwd).
 * - Absente (TUI) : fallback v1, cwd seul, garde isProjectTrusted().
 */
function collectRoots(ctx: ExtensionContext, out: RulesSnapshot, seen: Set<string>): void {
	const raw = process.env.PI_WORKSPACE_FOLDERS_JSON;

	if (!raw) {
		if (ctx.isProjectTrusted()) scanRoot(out, seen, ctx.cwd, "project");
		return;
	}

	let roots: unknown;
	try {
		roots = JSON.parse(raw);
	} catch {
		out.warnings.push("[pi-multi-rules] PI_WORKSPACE_FOLDERS_JSON illisible — racines ignorées");
		if (ctx.isProjectTrusted()) scanRoot(out, seen, ctx.cwd, "project");
		return;
	}
	if (!Array.isArray(roots) || roots.length === 0) {
		// Jamais pire que v1 : liste vide/malformée → cwd seul
		if (ctx.isProjectTrusted()) scanRoot(out, seen, ctx.cwd, "project");
		return;
	}

	const cwdKey = realPathKey(ctx.cwd);
	for (const entry of roots) {
		if (typeof entry !== "string" || !path.isAbsolute(entry)) continue;
		const key = realPathKey(entry);
		if (!key) {
			out.warnings.push(`[pi-multi-rules] racine workspace introuvable, ignorée : ${entry}`);
			continue;
		}
		// Le cwd (folder[0] côté Pi-xel, envoyé en dernier) porte le label project
		const label = key === cwdKey ? "project" : `root:${path.basename(entry)}`;
		scanRoot(out, seen, entry, label);
	}
}

function collect(ctx: ExtensionContext): RulesSnapshot {
	const out: RulesSnapshot = { rules: [], warnings: [], pixelSrc: null };
	const seen = new Set<string>();
	collectGlobal(out);
	collectRoots(ctx, out, seen);

	// Source Pi-xel : annoncée dans le prompt + scannée comme racine (dédup
	// avec les racines workspace déjà vues — le repo peut être ouvert en même
	// temps que n'importe quel projet).
	const src = process.env.PI_PIXEL_SRC;
	if (src && path.isAbsolute(src)) {
		if (realPathKey(src)) {
			out.pixelSrc = src;
			scanRoot(out, seen, src, `root:${path.basename(src)}`);
		} else {
			out.warnings.push(`[pi-multi-rules] PI_PIXEL_SRC introuvable : ${src}`);
		}
	}
	return out;
}

function buildSection(snapshot: RulesSnapshot): string | null {
	const parts = snapshot.rules.map((r) => `## [${r.label}] ${r.file}\n\n${r.content}`);
	if (snapshot.pixelSrc) {
		parts.push(
			`## [pixel-source] Pi-xel source code\n\n` +
				`Pi-xel source repository available at: \`${snapshot.pixelSrc}\`. ` +
				`Use absolute paths with read/edit tools to work on the VS Code extension itself from any session.`,
		);
	}
	if (parts.length === 0) return null;
	return `${MARKER}\n\n${parts.join("\n\n")}`;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function multiRules(pi: ExtensionAPI) {
	const warned = new Set<string>();

	const warnOnce = (ctx: ExtensionContext, warnings: string[]) => {
		for (const w of warnings) {
			if (warned.has(w)) continue;
			warned.add(w);
			ctx.ui.notify(w, "warning");
		}
	};

	pi.on("session_start", () => {
		warned.clear(); // re-signaler après reload / new / resume
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const snapshot = collect(ctx);
		warnOnce(ctx, snapshot.warnings);
		const section = buildSection(snapshot);
		if (!section || event.systemPrompt.includes(MARKER)) return;
		// Pattern documenté : injection par valeur de retour, pas de mutation in place.
		return { systemPrompt: `${event.systemPrompt}\n\n${section}` };
	});

	pi.registerCommand("rules", {
		description: "List rules loaded by pi-multi-rules",
		handler: async (_args, ctx) => {
			const snapshot = collect(ctx);
			const lines = snapshot.rules.map(
				(r) => `[${r.label}] ${r.file} — ${r.path} (${formatSize(r.size)})`,
			);
			if (snapshot.pixelSrc) lines.push(`[pixel-source] ${snapshot.pixelSrc}`);
			for (const w of snapshot.warnings) lines.push(`⚠ ${w}`);
			const header = snapshot.rules.length
				? `pi-multi-rules : ${snapshot.rules.length} règle(s)`
				: "pi-multi-rules : aucune règle (dossiers vides ou absents)";
			ctx.ui.notify([header, ...lines].join("\n"), "info");
		},
	});
}
