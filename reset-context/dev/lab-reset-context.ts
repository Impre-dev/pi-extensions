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
	buildRepriseContent,
} from "../reset-context.ts";

// ── Surface pi factice ────────────────────────────────────────────────
type Handler = (event: any, ctx: any) => Promise<any>;
const handlers: Record<string, Handler> = {};
const commands: Record<string, { description: string; handler: (args: string, ctx: any) => Promise<void> }> = {};

const messageRenderers: Record<string, Function> = {};
let lastSent: any = null;
const fakePi = {
	on: (type: string, handler: Handler) => {
		handlers[type] = handler;
	},
	registerMessageRenderer: (customType: string, renderer: Function) => {
		messageRenderers[customType] = renderer;
	},
	sendMessage: (message: any, options: any) => {
		lastSent = { message, options };
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
check("commandes /reset ET /r → compact + enchaînement automatique (sendMessage triggerTurn)", () => {
	assert.ok(commands["r"], "l'alias /r est enregistre");
	const branch = [
		{ message: { role: "assistant", timestamp: "2025-09-17T10:09:00Z", content: [
			{ type: "toolCall", name: "write", arguments: { path: "session.md" } },
		] } },
	];
	for (const name of ["reset", "r"]) {
		let captured: any = null;
		lastSent = null;
		const ctx = {
			cwd: "O:/ws/bigbang",
			sessionManager: { getLeafId: () => "leaf-1", getBranch: () => branch },
			compact: (options: any) => {
				captured = options;
			},
			ui: { notify: () => {} },
		};
		commands[name].handler("", ctx);
		assert.equal(captured.customInstructions, HANDOVER_INSTRUCTION, name);
		// onComplete : le message de reprise part avec triggerTurn
		captured.onComplete();
		assert.ok(lastSent, name);
		assert.equal(lastSent.message.customType, "reset-context", name);
		assert.equal(lastSent.message.details.anchor, "O:/ws/bigbang", name);
		assert.equal(lastSent.options.triggerTurn, true, name);
		// onError : PAS de message de reprise
		lastSent = null;
		captured.onError(new Error("session trop petite"));
		assert.equal(lastSent, null, name);
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

// ── 6. onError notifie — onComplete se tait (la Box d'ancrage suffit) ─
check("commande /reset → onError notifie via ctx.ui, onComplete silencieux", () => {
	const notifications: Array<{ msg: string; level: string }> = [];
	const ctx = {
		cwd: "O:/ws/test",
		sessionManager: { getLeafId: () => "leaf-1", getBranch: () => [] },
		compact: (options: any) => {
			options.onComplete({ summary: "x" });
			options.onError(new Error("session trop petite"));
		},
		sendMessage: () => {},
		ui: {
			notify: (msg: string, level: string) => notifications.push({ msg, level }),
		},
	};
	commands["reset"].handler("", ctx);
	assert.equal(notifications.length, 1);
	assert.equal(notifications[0].level, "error");
	assert.match(notifications[0].msg, /session trop petite/);
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

// ── 9. buildRepriseContent : ancrage injecté ou demande à l'opérateur
check("buildRepriseContent : ancrage injecté pour le LLM ; sans → demande explicite", () => {
	const withAnchor = buildRepriseContent("C:/ws/projetB");
	assert.match(withAnchor, /dernier ancrage projet : C:\/ws\/projetB/);
	assert.match(withAnchor, /réoriente-toi depuis les artefacts/);
	const without = buildRepriseContent(null);
	assert.match(without, /aucun ancrage projet détecté/);
	assert.match(without, /Demande à l'opérateur/);
});

// ── 10. Intégration : ANTI-DOUBLON — le hook rend le pointeur PUR ──
check("hook : summary = pointeur pur, SANS ancrage (il vit dans le message de reprise)", async () => {
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
	assert.equal(result.compaction.summary, POINTER_SUMMARY, "summary = pointeur pur, zéro ancrage");
	assert.equal(result.compaction.firstKeptEntryId, "leaf-7");
});

// ── 11. Renderer du message de reprise : la ligne d'ancrage ────────
check("renderer reset-context : affiche la ligne d'ancrage (et son fallback)", () => {
	assert.ok(messageRenderers["reset-context"], "renderer enregistre");
	const theme = { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s };
	const withAnchor = messageRenderers["reset-context"](
		{ details: { anchor: "O:/ws/bigbang" } } as any,
		{ expanded: true, outputPad: 1 },
		theme,
	);
	assert.ok(withAnchor, "composant rendu avec ancrage");
	const without = messageRenderers["reset-context"](
		{ details: { anchor: null } } as any,
		{ expanded: true, outputPad: 1 },
		theme,
	);
	assert.ok(without, "composant rendu sans ancrage");
});

console.log(`\nLab vert : ${passed}/13 checks passés.`);
