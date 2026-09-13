/**
 * Contextomètre — l'horloge murale du contexte.
 *
 * memory.md (rule globale) documente la dérive : passé ~25% de contexte,
 * la mémoire interne de l'agent se dégrade (réponses à d'anciens messages,
 * décisions réinventées, « réparations » de ce qui marche déjà). La règle :
 * « L'horloge murale — on ne se demande pas si on a la notion du temps, on
 * la lit. » Le footer TUI montre déjà l'usage à Impre ; le Contextomètre
 * le montre à l'agent.
 *
 * Mécanisme : à chaque démarrage de run (event `before_agent_start` — fire
 * quand le prompt user arrive, AVANT que l'agent tourne), une ligne custom
 * est injectée en session : stockée dans le JSONL, envoyée au LLM, rendue
 * dans le TUI. Le marqueur est donc visible par les deux pendant tout le
 * run, calculé après le prompt user (le plus frais possible). Append-only
 * => le prompt-cache n'est pas invalidé (une réécriture du system prompt
 * re-cacherait TOUTE la conversation à chaque tour).
 *
 * La trajectoire se lit dans le transcript : chaque échange est annoté de
 * l'état du contexte à cet instant. Une chute brutale (= compaction auto)
 * apparaît d'elle-même — utile pour recalibrer les seuils. Le marqueur
 * affiche « ? » quand le chiffre est inconnu (juste après une compaction,
 * avant la prochaine réponse LLM).
 *
 * Chaque marqueur porte l'horodatage d'injection (dd/MM HH:mm) — ancrage
 * temporel pour l'agent, dont la chronologie interne se reconstruit mal
 * (flagrant délit du 13/09 : « hier » lâché 10 minutes après le commit du
 * jour, le % lui-même étant juste). L'heure seule ne suffit pas : 15:42
 * existe aussi hier.
 *
 * Seuils (memory.md, recalibrés 13/09) :
 *   ⚠ ≥ WARN — mode transition : plus d'opérations structurelles
 *   🔴 ≥ CRIT — fermeture propre dès la frontière suivante (cahier + git)
 * Le rappel de la règle n'est envoyé au LLM que quand le seuil est franchi
 * (zéro coût en zone OK).
 *
 * Zéro tool, zéro commande : l'affichage est le service.
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const CUSTOM_TYPE = "contextometre";

/** Seuils memory.md en fraction de fenêtre — recalibrables */
const WARN = 0.2;
const CRIT = 0.25;

type Statut = "ok" | "warn" | "crit" | "unknown";

interface UsageDetails {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
	statut: Statut;
	horodatage: string;
}

/** 86234 -> "86.2k" (compact, pour la ligne TUI) */
function fmtK(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Date -> "13/09 15:42" (compact, lisible des deux côtés du mur) */
function horodate(d: Date): string {
	const p2 = (n: number) => String(n).padStart(2, "0");
	return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function statutDe(percent: number | null): Statut {
	if (percent === null) return "unknown";
	if (percent >= CRIT * 100) return "crit";
	if (percent >= WARN * 100) return "warn";
	return "ok";
}

export default function contextometre(pi: ExtensionAPI) {

	// Rendu TUI : une ligne discrète, colorée selon le statut
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, options, theme) => {
		const d = message.details as UsageDetails | undefined;
		const pct = d?.percent == null ? "?" : `${d.percent.toFixed(1)}%`;
		const toks = d == null || d.tokens == null ? "?" : `${fmtK(d.tokens)}/${fmtK(d.contextWindow)}`;
		const hz = d?.horodatage ? ` · ${d.horodatage}` : ""; // marqueurs v0.1 sans horodatage
		const line = `[⏱ ${pct} · ${toks}${hz}]`;
		const colored =
			d?.statut === "crit" ? theme.fg("error", line) :
			d?.statut === "warn" ? theme.fg("warning", line) :
			theme.fg("dim", line);
		return new Text(colored, options.outputPad, 0);
	});

	// Injection au démarrage de chaque run (prompt user ou message en queue)
	pi.on("before_agent_start", async (_event, ctx) => {
		const usage = ctx.getContextUsage();
		if (!usage) return; // pas de modèle/contexte lisible — pas de marqueur

		const statut = statutDe(usage.percent);
		const pct = usage.percent === null ? "?" : `${usage.percent.toFixed(1)}%`;
		const toks = usage.tokens === null ? "?" : `${fmtK(usage.tokens)}/${fmtK(usage.contextWindow)}`;
		const horodatage = horodate(new Date());

		// Ligne envoyée au LLM — compacte en zone OK, explicative en dérive
		let content = `Contexte: ${pct} (${toks} tokens) — ${horodatage}`;
		if (statut === "warn") content += ` · ⚠ ≥20%: mode transition, plus d'opérations structurelles (memory.md)`;
		else if (statut === "crit") content += ` · 🔴 ≥25%: fermer proprement à la frontière suivante (écrire cahier + git)`;
		else if (statut === "unknown") content += ` · chiffre inconnu (juste après compaction, fiable au prochain tour)`;

		return {
			message: {
				customType: CUSTOM_TYPE,
				content,
				display: true,
				details: {
					tokens: usage.tokens,
					contextWindow: usage.contextWindow,
					percent: usage.percent,
					statut,
					horodatage,
				} satisfies UsageDetails,
			},
		};
	});
}
