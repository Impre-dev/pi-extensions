/**
 * Lab ResetContext — miroir du mécanisme, exécutable sans pi.
 *
 * Simule la surface pi (pi.on / registerCommand / ctx) et vérifie que le
 * code de index.ts se comporte exactement comme le design l'acte :
 *
 *  1. La commande /reset appelle ctx.compact avec l'instruction "handover"
 *  2. Le hook substitue le pointeur UNIQUEMENT sur "handover"
 *  3. Toute autre compaction (autres instructions / aucune) → silence = natif
 *  4. firstKeptEntryId = leaf courante ; fallback frontière native si null
 *  5. isHandoverRequest : match exact, insensible casse/espaces, rien d'autre
 *
 * Run: npx tsx lab-reset-context.ts
 */

import assert from "node:assert/strict";
import resetContext, {
	HANDOVER_INSTRUCTION,
	POINTER_SUMMARY,
	isHandoverRequest,
	extractFileOps,
	resolveProjectAnchor,
	buildSummary,
} from "../reset-context.ts";

// ── Surface pi factice ────────────────────────────────────────────────
type Handler = (event: any, ctx: any) => Promise<any>;
const handlers: Record<string, Handler> = {};
const commands: Record<string, { description: string; handler: (args: string, ctx: any) => Promise<void> }> = {};

const fakePi = {
	on: (type: string, handler: Handler) => {
		handlers[type] = handler;
	},
	registerCommand: (name: string, def: { description: string; handler: (args: string, ctx: any) => Promise<void> }) => {
		commands[name] = def;
	},
} as any;

// ── Montage ───────────────────────────────────────────────────────────
resetContext(fakePi);

const hook = handlers["session_before_compact"];
assert.ok(hook, "le hook session_before_compact est enregistré");
assert.ok(commands["reset"], "la commande /reset est enregistrée");
assert.match(commands["reset"].description, /reset/i, "la commande /reset a une description");

let passed = 0;
const check = (name: string, fn: () => void) => {
	fn();
	passed++;
	console.log(`  ✓ ${name}`);
};

// ── 1. La commande déclenche compact avec l'instruction réservée ─────
check("commandes /reset ET /r → ctx.compact({ customInstructions: 'handover' })", () => {
	assert.ok(commands["r"], "l'alias /r est enregistre");
	for (const name of ["reset", "r"]) {
		let captured: any = null;
		const ctx = {
			compact: (options: any) => {
				captured = options;
			},
			ui: { notify: () => {} },
		};
		commands[name].handler("", ctx);
		assert.equal(captured.customInstructions, HANDOVER_INSTRUCTION, name);
		assert.ok(typeof captured.onComplete === "function", name);
		assert.ok(typeof captured.onError === "function", name);
	}
});

// ── 2. Le hook substitue le pointeur sur "handover" ──────────────────
check("hook + 'handover' → pointeur, firstKeptEntryId = leaf, tokensBefore préservés", async () => {
	const event = {
		customInstructions: HANDOVER_INSTRUCTION,
		preparation: { firstKeptEntryId: "entry-native-1", tokensBefore: 213000 },
		branchEntries: [],
	};
	const ctx = { sessionManager: { getLeafId: () => "leaf-42" } };
	const result = await hook(event, ctx);
	assert.ok(result?.compaction, "retourne une compaction");
	assert.equal(result.compaction.firstKeptEntryId, "leaf-42");
	assert.equal(result.compaction.tokensBefore, 213000);
	assert.match(result.compaction.summary, /ResetContext — continuité/);
	assert.match(result.compaction.summary, /session\.md/);
	assert.match(result.compaction.summary, /git log/);
	assert.match(result.compaction.summary, /roadmap_/);
	assert.match(result.compaction.summary, /n'existe pas/);
});

// ── 3. Le hook se tait sur tout le reste → comportement natif ────────
check("hook + autres instructions → undefined (natif intact)", async () => {
	const ctx = { sessionManager: { getLeafId: () => "leaf-42" } };
	for (const instructions of [undefined, "", "focus sur la root cause", "handover stp", "lance le handover"]) {
		const event = {
			customInstructions: instructions,
			preparation: { firstKeptEntryId: "entry-native-1", tokensBefore: 1000 },
		};
		const result = await hook(event, ctx);
		assert.equal(result, undefined, `devrait se taire pour: ${JSON.stringify(instructions)}`);
	}
});

// ── 4. Pas de leaf → fallback frontière native ───────────────────────
check("hook + leafId null → fallback preparation.firstKeptEntryId", async () => {
	const event = {
		customInstructions: HANDOVER_INSTRUCTION,
		preparation: { firstKeptEntryId: "entry-native-1", tokensBefore: 500 },
	};
	const ctx = { sessionManager: { getLeafId: () => null } };
	const result = await hook(event, ctx);
	assert.equal(result.compaction.firstKeptEntryId, "entry-native-1");
});

// ── 5. isHandoverRequest : match exact uniquement ────────────────────
check("isHandoverRequest : insensible casse/espaces, jamais sous-chaîne", () => {
	assert.equal(isHandoverRequest("handover"), true);
	assert.equal(isHandoverRequest("  HANDOVER  "), true);
	assert.equal(isHandoverRequest("go"), false);
	assert.equal(isHandoverRequest("ok"), false);
	assert.equal(isHandoverRequest("lance le handover"), false);
	assert.equal(isHandoverRequest("handover stp"), false);
	assert.equal(isHandoverRequest(undefined), false);
	assert.equal(isHandoverRequest(null), false);
	assert.equal(isHandoverRequest(""), false);
});

// ── 6. onComplete / onError notifient ────────────────────────────────
check("commande /reset → onComplete et onError notifient via ctx.ui", () => {
	const notifications: Array<{ msg: string; level: string }> = [];
	const ctx = {
		compact: (options: any) => {
			options.onComplete({ summary: "x" });
			options.onError(new Error("session trop petite"));
		},
		ui: {
			notify: (msg: string, level: string) => notifications.push({ msg, level }),
		},
	};
	commands["reset"].handler("", ctx);
	assert.equal(notifications.length, 2);
	assert.equal(notifications[0].level, "info");
	assert.equal(notifications[1].level, "error");
	assert.match(notifications[1].msg, /session trop petite/);
});

// ── 7. Ancrage projet : extraction des ops fichier ─────────────────
check("extractFileOps : ops extraites, triées du plus récent au plus ancien", () => {
	const entries = [
		{ message: { role: "assistant", timestamp: "2025-09-15T10:00:00Z", content: [
			{ type: "toolCall", name: "read", arguments: { path: "C:/ws/projetA/src/a.ts" } },
		] } },
		{ message: { role: "assistant", timestamp: "2025-09-15T10:05:00Z", content: [
			{ type: "toolCall", name: "write", arguments: { path: "C:/ws/projetA/session.md" } },
		] } },
		{ message: { role: "user", content: [{ type: "text", text: "pas un toolCall" }] } },
		{ message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }] } },
	];
	const ops = extractFileOps(entries);
	assert.equal(ops.length, 2);
	assert.equal(ops[0].path, "C:/ws/projetA/session.md"); // 10:05 > 10:00
	assert.equal(ops[1].path, "C:/ws/projetA/src/a.ts");
});

// ── 8. resolveProjectAnchor : artefact > fichier récent > null ──────
check("resolveProjectAnchor : session.md le plus récent → son dossier (racine projet)", () => {
	const entries = [
		{ message: { role: "assistant", timestamp: "2025-09-15T10:00:00Z", content: [
			{ type: "toolCall", name: "edit", arguments: { path: "C:/ws/projetB/src/x.ts" } },
		] } },
		{ message: { role: "assistant", timestamp: "2025-09-15T10:09:00Z", content: [
			{ type: "toolCall", name: "write", arguments: { path: "C:/ws/projetB/session.md" } },
		] } },
	];
	assert.equal(resolveProjectAnchor(entries, "C:/ws"), "C:/ws/projetB");
});

check("resolveProjectAnchor : roadmap_*/discovery_* comptent comme artefacts", () => {
	const entries = [
		{ message: { role: "assistant", timestamp: "2025-09-15T10:09:00Z", content: [
			{ type: "toolCall", name: "read", arguments: { path: "O:/lab/Discovery_X.md" } },
		] } },
		{ message: { role: "assistant", timestamp: "2025-09-15T10:01:00Z", content: [
			{ type: "toolCall", name: "read", arguments: { path: "O:/ws/projet/Roadmap_Y.md" } },
		] } },
	];
	assert.equal(resolveProjectAnchor(entries, "X:/autre"), "O:/lab"); // Discovery le plus récent
});

check("resolveProjectAnchor : fallback fichier le plus récent, null si rien", () => {
	const fallback = [
		{ message: { role: "assistant", timestamp: "2025-09-15T10:00:00Z", content: [
			{ type: "toolCall", name: "read", arguments: { path: "C:/ws/projetC/src/main.ts" } },
		] } },
	];
	assert.equal(resolveProjectAnchor(fallback, "C:/ws"), "C:/ws/projetC/src");
	assert.equal(resolveProjectAnchor([], "C:/ws"), null);
	assert.equal(resolveProjectAnchor(undefined, "C:/ws"), null);
});

// ── 9. buildSummary : ancrage injecté ou demande à l'opérateur ──────
check("buildSummary : avec ancrage → chemin injecté ; sans → demande explicite", () => {
	const withAnchor = buildSummary("C:/ws/projetB");
	assert.match(withAnchor, /Dernier ancrage projet/);
	assert.ok(withAnchor.includes("C:/ws/projetB"));
	const without = buildSummary(null);
	assert.match(without, /Aucun ancrage projet/);
	assert.match(without, /demande à l'opérateur/);
});

// ── 10. Intégration : le hook injecte l'ancrage depuis branchEntries ─
check("hook : branchEntries avec session.md récent → ancrage dans le summary", async () => {
	const event = {
		customInstructions: HANDOVER_INSTRUCTION,
		preparation: { firstKeptEntryId: "e1", tokensBefore: 900 },
		branchEntries: [
			{ message: { role: "assistant", timestamp: "2025-09-15T10:09:00Z", content: [
				{ type: "toolCall", name: "write", arguments: { path: "session.md" } },
			] } },
		],
	};
	const ctx = {
		sessionManager: { getLeafId: () => "leaf-7" },
		cwd: "O:/Programmation/IDE/Pi/pi-extensions/reset-context",
	};
	const result = await hook(event, ctx);
	assert.ok(result.compaction.summary.includes("pi-extensions"), "ancrage doit contenir le dossier projet resolu depuis cwd");
	assert.ok(result.compaction.summary.includes("reset-context"));
	assert.equal(result.compaction.firstKeptEntryId, "leaf-7");
});

console.log(`\nLab vert : ${passed}/12 checks passés.`);
