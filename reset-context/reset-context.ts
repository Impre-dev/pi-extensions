/**
 * ResetContext — extension pi
 *
 * Reset du contexte dans la discussion : `/reset` déclenche une compaction dont
 * le "summary" n'est pas un résumé LLM mais un POINTEUR vers les artefacts de
 * continuité (session.md, git, registres). Le fil de discussion continue avec un
 * contexte lean, réorienté par les artefacts — l'équivalent d'une session neuve
 * sans ouvrir de nouvelle discussion.
 *
 * Design (acté en brainstorm) :
 * - La validation est la frappe de `/reset` par l'opérateur : structurelle,
 *   non contournable. L'agent ne peut jamais déclencher seul.
 * - Le hook est SÉLECTIF : il ne substitue le pointeur que si les instructions
 *   valent exactement "handover" (émises par la commande). Tout autre /compact
 *   (manuel avec instructions, auto-threshold, overflow) garde le comportement
 *   natif LLM — filet de sécurité intact.
 * - Non destructeur : la compaction APPEND une entry, l'historique complet
 *   reste dans le session file (browsable /tree, minable plus tard).
 */

import { Box, Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Instruction réservée émise par la commande /reset et reconnue par le hook. */
export const HANDOVER_INSTRUCTION = "handover";

/**
 * Le texte que le moi-post-reset lira. Ce n'est PAS un résumé : c'est un
 * pointeur. La pertinence a été jugée par le rituel de continuité (à froid,
 * validé par l'opérateur) AVANT que /reset ne soit frappé.
 */
export const POINTER_SUMMARY = `## ResetContext — continuité

Le contexte vient d'être volontairement réinitialisé (/reset) APRÈS une phase de continuité. Ce texte n'est pas un résumé : c'est un pointeur. Ta mémoire vit dans les artefacts du projet :

1. Lis \`session.md\` à la racine du projet s'il existe (état courant + journal).
2. \`git log --oneline -15\` et \`git status\`.
3. Lis \`roadmap_<Projet>.md\` s'il existe (livré + file) et \`discovery_<Projet>.md\` (encours).

Confirme ton orientation en 2-3 phrases maximum, puis attends les instructions de l'opérateur. N'improvise aucune reconstitution au-delà des artefacts : ce qu'ils ne disent pas n'existe pas.`;

/** Le hook ne substitue le pointeur QUE sur cette instruction exacte. */
export function isHandoverRequest(customInstructions: string | undefined | null): boolean {
	return customInstructions?.trim().toLowerCase() === HANDOVER_INSTRUCTION;
}

// ── Ancrage projet ───────────────────────────────────────────────
// Dans un workspace multi-projets, les artefacts vivent dans le dossier du
// projet — pas au cwd de la session. On dérive l'ancrage des fichiers touchés
// par les tool calls (read/write/edit) : le rituel de continuité écrit
// session.md dans le projet JUSTE avant le reset, donc l'artefact le plus
// récent pointe vers le projet actif. Logique pure, zéro LLM.

const ARTIFACT_BASENAMES = new Set(["session.md"]);
const ARTIFACT_PREFIXES = ["roadmap_", "discovery_"];

interface FileOp {
	path: string;
	timestamp: number;
}

/** Extrait les ops fichier des tool calls read/write/edit, du plus récent au plus ancien. */
export function extractFileOps(entries: unknown): FileOp[] {
	const ops: FileOp[] = [];
	if (!Array.isArray(entries)) return ops;
	for (const entry of entries) {
		const message = (entry as any)?.message;
		if (!message || message.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const block of message.content) {
			if (block?.type !== "toolCall" || typeof block?.name !== "string") continue;
			if (!(block.name === "read" || block.name === "write" || block.name === "edit")) continue;
			const path = block?.arguments?.path;
			if (typeof path !== "string" || path.length === 0) continue;
			const ts = Date.parse(message.timestamp ?? "") || Date.parse((entry as any)?.timestamp ?? "") || 0;
			ops.push({ path, timestamp: ts });
		}
	}
	return ops.sort((a, b) => b.timestamp - a.timestamp);
}

export function dirnameOf(path: string): string {
	const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return i > 0 ? path.slice(0, i) : path;
}

function basenameOf(path: string): string {
	const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * Racine projet dérivée des fichiers touchés :
 * 1. artefact de continuité (session.md, roadmap_*, discovery_*) le plus récent → son dossier
 * 2. fallback : dossier du fichier le plus récent
 * 3. aucun fichier touché → null
 */
export function resolveProjectAnchor(entries: unknown, cwd: string): string | null {
	const ops = extractFileOps(entries);
	if (ops.length === 0) return null;
	const abs = ops.map((op) => toAbsolute(op.path, cwd));
	for (const p of abs) {
		const base = basenameOf(p).toLowerCase();
		if (ARTIFACT_BASENAMES.has(base) || ARTIFACT_PREFIXES.some((p) => base.startsWith(p))) {
			return dirnameOf(p);
		}
	}
	return dirnameOf(abs[0]);
}

const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;

function toAbsolute(p: string, cwd: string): string {
	if (WINDOWS_ABS.test(p) || p.startsWith("/") || p.startsWith("\\") || p.startsWith("~")) return p;
	return cwd.endsWith("/") || cwd.endsWith("\\") ? cwd + p : cwd + "\\" + p;
}

/** Le content du message de reprise : l'ancrage pour le LLM, une fois. */
export function buildRepriseContent(anchor: string | null): string {
	if (!anchor) {
		return "Reprise post-reset — aucun ancrage projet détecté. Demande à l'opérateur où se trouvent les artefacts, puis attends ses instructions.";
	}
	return `Reprise post-reset — dernier ancrage projet : ${anchor}. Suis le pointeur ci-dessus (réoriente-toi depuis les artefacts), puis attends les instructions.`;
}

export default function resetContext(pi: ExtensionAPI) {
	// Rendu du message de reprise : UNE ligne — la preuve d'ancrage, vérifiable
	// d'un coup d'œil. L'ancrage voyage dans details (jamais envoyé au LLM).
	pi.registerMessageRenderer<{ anchor: string | null }>("reset-context", (message, _options, theme) => {
		const anchor = message.details?.anchor;
		const shown = anchor ?? "aucun détecté — demande à l'opérateur où se trouvent les artefacts";
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(new Text(theme.fg("dim", "Dernier ancrage projet : ") + theme.fg("accent", shown), 0, 0));
		return box;
	});

	pi.on("session_before_compact", async (event, ctx) => {
		// Filtrage strict : toute autre compaction (manuelle, threshold, overflow)
		// suit le comportement natif — on ne retourne rien.
		if (!isHandoverRequest(event.customInstructions)) return;

		// Garder le strict minimum : la feuille courante (dernière entry).
		// Fallback sur la frontière native si pas de leaf. Le summary reste le
		// pointeur PUR — sans ancrage (il voyage dans le message de reprise).
		const leafId = ctx.sessionManager.getLeafId();

		return {
			compaction: {
				summary: POINTER_SUMMARY,
				firstKeptEntryId: leafId ?? event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
			},
		};
	});

	const resetHandler = async (_args: string, ctx: ExtensionCommandContext) => {
		const anchor = resolveProjectAnchor(ctx.sessionManager.getBranch(), ctx.cwd);
		ctx.compact({
			customInstructions: HANDOVER_INSTRUCTION,
			onComplete: () => {
				// Feedback visuel : la Box d'ancrage (renderer du message de reprise)
				// suffit — un toast notify serait redondant.
				// L'enchaînement automatique : le message de reprise (rendu = ligne
				// d'ancrage) déclenche le tour de re-orientation. L'opérateur ne
				// tape rien — la continuité repart seule depuis les artefacts.
				pi.sendMessage(
					{
						customType: "reset-context",
						content: buildRepriseContent(anchor),
						display: true,
						details: { anchor },
					},
					{ triggerTurn: true },
				);
			},
			onError: (error) => {
				ctx.ui.notify(`Reset impossible : ${error.message}`, "error");
			},
		});
	};

	// /reset : auto-documenté · /r : le geste rapide (alias)
	pi.registerCommand("reset", {
		description:
			"Reset le contexte : compaction vers un pointeur vers les artefacts de continuité (session.md, git, registres). À frapper APRÈS la phase de continuité, jamais en plein mandat.",
		handler: resetHandler,
	});
	pi.registerCommand("r", {
		description: "Alias de /reset",
		handler: resetHandler,
	});
}
