/**
 * MyPiKeybinds — tweaks UX pour pi en tuiMode "fullscreen" sous Windows.
 *
 * Ce que ça change :
 *
 * 1. Ctrl+C  — copie la sélection écran si elle existe ; sinon il ne se passe
 *             RIEN. Le comportement destructeur par défaut de pi (app.clear :
 *             1re pression efface l'éditeur, 2e quitte) est neutralisé quand
 *             l'éditeur principal a le focus. Les dialogs/selectors gardent
 *             leur Ctrl+C natif (= cancel). Quitter reste Ctrl+D (éditeur vide)
 *             ou /quit.
 *
 * 2. Suppr / Backspace — supprime le texte de la sélection écran si ce texte
 *             appartient à l'éditeur (avec undo via Ctrl+Z, snapshot posé par
 *             setText). Si la sélection est hors éditeur (transcript), le
 *             surlignage est vidé et le Backspace/Suppr normal s'applique.
 *             Limite connue : si le MÊME texte existe dans l'éditeur et que tu
 *             sélectionnes son double dans le transcript, la suppression
 *             frappera l'éditeur (matching par contenu). Undo répare.
 *
 * 3. Molette — 4 lignes par cran au lieu de 1 (pi hardcode 1). Alt+molette
 *             reste ×5 (multiplier interne de pi).
 *
 * 4. Pas de copie automatique — géré par le setting natif pi dans
 *             ~/.pi/agent/settings.json : "fullscreenCopyOnSelect": false.
 *             (Le code extension ne peut pas le faire : applyRuntimeSettings
 *             ré-applique le setting APRÈS notre factory à chaque bind/reload.)
 *             Effet de bord utile : pi route alors Ctrl+X vers la sélection
 *             écran si elle existe, sinon vers la dernière réponse du modèle.
 *
 * 5. Ctrl+X  — vrai cut GUI : sélection écran → copie + suppression (undoable,
 *             redoable). Sans sélection → comportement natif pi conservé
 *             (copie la dernière réponse du modèle).
 *
 * 6. Ctrl+Shift+Z — redo one-shot de la dernière suppression de sélection
 *             (pi n'a aucun redo). Ne fonctionne que si l'état courant
 *             correspond exactement à l'état d'après la suppression —
 *             toute frappe intermédiaire invalide le redo.
 *
 * 7. Après Suppr/Backspace sur sélection, le curseur se pose à l'endroit
 *             de la suppression (comportement GUI standard) au lieu de
 *             sauter en fin d'éditeur.
 *
 * 8. F8 — ouvre le dossier du projet courant (ctx.cwd) dans l'Explorateur
 *             Windows. Le shortcut est dispatché en premier par CustomEditor
 *             (onExtensionShortcut), donc actif même pendant l'édition.
 *
 * 9. F5 — vue épurée du transcript : masque les tool rows (ne restent que
 *             les messages user/assistant) + thinking forcé caché, avec
 *             scroll anchor (le point de lecture ne bouge pas — fix du
 *             « descend tt en bas » natif). Même touche pour réafficher.
 *             Navigation rapide : Ctrl+Up/Down natifs (saut de message en
 *             message — les marques OSC-133 ignorent les tools). Mécanisme
 *             détaillé dans la section « Vue épurée » plus bas.
 *
 * Pas de redo général : pi n'en a tout simplement pas (aucun code, aucun
 * binding). L'undo (Ctrl+Z) marche, y compris pour nos suppressions via
 * setText. Ici on couvre juste nos suppressions.
 *
 * Note flash : copyActiveSelectionToClipboard → copyTextToClipboard flashe
 * déjà "Copied!" (ou "Copy failed") lui-même — ne PAS re-flasher.
 *
 * Mécanisme : les sélections à la souris en fullscreen ne sont pas des
 * sélections "éditeur" mais des sélections ÉCRAN gérées par le renderer
 * (TuiAltScreen). On accède donc au renderer via la factory de l'éditeur et
 * on intercepte les touches au niveau TUI (addInputListener tourne AVANT le
 * dispatch vers le composant focus, donc avant app.clear).
 *
 * Toutes les capacités ciblées sont gardées : si pi renomme/retire une API
 * interne, l'extension se contente de ne rien faire (pas de crash).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, type TUI, type EditorTheme, type ScrollView } from "@earendil-works/pi-tui";

/** Lignes par cran de molette (défaut pi : 1). Ajustable. */
const WHEEL_SCROLL_LINES = 4;

/**
 * Sous-ensemble des capacités fullscreen de TuiAltScreen utilisées ici.
 * Tout est optionnel : en mode regular ou après un refactor de pi, chaque
 * appel est gardé et devient un no-op au lieu de casser.
 */
interface AltScreenInternals {
	wheelScrollLines?: number;
	hasActiveSelection?(): boolean;
	getActiveSelectionText?(): string | undefined;
	clearTextSelection?(): void;
	copyActiveSelectionToClipboard?(): Promise<boolean>;
	flash?(message: string, durationMs?: number): void;
	/** Présent sur TuiBase, absent de l'interface TUI — comparaison d'identité uniquement. */
	getFocusedComponent?(): unknown;
}

class MyPiEditor extends CustomEditor {
	private readonly alt: AltScreenInternals;

	/** Redo one-shot : état pré/post de la dernière suppression + position du curseur. */
	private redoState: { before: string; after: string; cursorOffset: number } | null = null;

	/** Vue typée de l'état interne de l'éditeur (privé TS, présent au runtime). */
	private get stateInternal(): { lines: string[]; cursorLine: number; cursorCol: number } | undefined {
		return (this as unknown as { state?: { lines: string[]; cursorLine: number; cursorCol: number } }).state;
	}

	// `tui` est hérité de Editor (protected) — pas de redéclaration ici.
	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, alt: AltScreenInternals) {
		super(tui, theme, keybindings);
		this.alt = alt;
	}

	override handleInput(data: string): void {
		if (matchesKey(data, "ctrl+shift+z")) {
			this.redoScreenSelectionDeletion();
			return;
		}
		if (matchesKey(data, "ctrl+x") && this.alt.hasActiveSelection?.()) {
			// Cut : copie (le renderer flashe) + suppression de la sélection.
			// Sans sélection : pas de return → super route vers le comportement
			// natif pi (copie de la dernière réponse du modèle).
			void this.alt.copyActiveSelectionToClipboard?.();
			this.deleteScreenSelection();
			return;
		}
		if (matchesKey(data, "backspace") || matchesKey(data, "delete")) {
			if (this.deleteScreenSelection()) return;
		}
		super.handleInput(data);
	}

	/**
	 * Redo one-shot : ne re-applique la suppression que si l'état courant
	 * correspond exactement à l'état d'après celle-ci (aucune frappe entre
	 * les deux). Sinon, invalide et no-op.
	 */
	private redoScreenSelectionDeletion(): void {
		if (!this.redoState) return;
		if (this.getText() !== this.redoState.before) {
			this.redoState = null;
			return;
		}
		this.setTextAndCursor(this.redoState.after, this.redoState.cursorOffset);
		this.tui.requestRender();
	}

	/**
	 * Supprime le texte sélectionné à la souris s'il appartient à l'éditeur.
	 * Retourne true si la sélection a été consommée (la touche ne va pas plus loin).
	 */
	private deleteScreenSelection(): boolean {
		const sel = this.alt.getActiveSelectionText?.();
		if (!sel) return false;

		const text = this.getText();
		// Matching par contenu : la sélection écran peut embarquer le padding de
		// l'éditeur ou des espaces de fin de ligne → on tente brut, puis trimé.
		let idx = text.indexOf(sel);
		let match = sel;
		if (idx === -1 && sel.trim().length > 0) {
			idx = text.indexOf(sel.trim());
			match = sel.trim();
		}
		if (idx === -1) {
			// Sélection hors éditeur (transcript) : on vide le surlignage et on
			// laisse le Backspace/Suppr normal s'appliquer.
			this.alt.clearTextSelection?.();
			this.tui.requestRender();
			return false;
		}

		const after = text.slice(0, idx) + text.slice(idx + match.length);
		// Un nouvel état redo invalide le précédent (comportement GUI standard).
		this.redoState = { before: text, after, cursorOffset: idx };
		this.setTextAndCursor(after, idx);
		this.alt.clearTextSelection?.();
		this.tui.requestRender();
		return true;
	}

	/**
	 * setText + curseur à un offset global donné (converti en ligne/colonne
	 * logiques). Utilise `state` et `setCursorCol` (privés TS, runtime) :
	 * setCursorCol reset aussi le sticky column (preferredVisualCol).
	 */
	private setTextAndCursor(text: string, cursorOffset: number): void {
		this.setText(text);
		const state = this.stateInternal;
		if (!state?.lines) return;
		let remaining = Math.max(0, Math.min(cursorOffset, text.length));
		let line = 0;
		while (line < state.lines.length && remaining > state.lines[line].length) {
			remaining -= state.lines[line].length + 1; // +1 = "\n"
			line++;
		}
		state.cursorLine = line;
		const editable = this as unknown as { setCursorCol?: (col: number) => void };
		if (typeof editable.setCursorCol === "function") {
			editable.setCursorCol(Math.max(0, remaining));
		} else {
			state.cursorCol = Math.max(0, remaining);
		}
	}
}

/** Garde anti-cumul : la factory est rappelée à chaque /reload sur la MÊME
 *  instance TUI — sans ça, un listener de plus par reload → N copies par Ctrl+C. */
const installedListeners = new WeakSet<TUI>();

/** Référence mutable vers l'éditeur actif (mis à jour à chaque factory call,
 *  car /reload recrée l'éditeur mais pas la TUI qui porte le listener). */
const activeEditor: { current: MyPiEditor | null } = { current: null };

// ===========================================================================
// Vue épurée (Ctrl+Alt+Shift+P) — transcript sans tool rows
// ===========================================================================

/**
 * Masque les tool rows du transcript (ne restent que les messages user et
 * assistant) sans les détacher de l'arbre. Principe : un override de render
 * est posé SUR CHAQUE INSTANCE ToolExecutionComponent (duck-typing : champ
 * toolName). L'override consulte `epureActive` AU MOMENT DU RENDU :
 *   - épuré ON  → [] (zéro ligne — même effet que le flag natif hideComponent
 *                 de ToolExecutionComponent.render)
 *   - épuré OFF → délégation au render original (natif à l'octet près)
 * L'override est une own property d'instance : `updateDisplay()` reset bien le
 * FLAG natif à chaque rebuild (tool-execution.js:223), mais ne touche jamais
 * aux own properties — le masquage survit au streaming sans re-flag.
 *
 * Thinking : les composants assistant (duck-typing : setHideThinkingBlock +
 * hideThinkingBlock boolean) sont forcés cachés pendant l'épuré, valeur
 * d'origine samplée avant pour une restauration exacte. Le setting natif
 * hideThinkingBlock:true les cache déjà — le forçage ne sert que si Ctrl+T
 * natif les a rendus visibles avant. État mixte assumé : un Ctrl+T natif
 * pendant l'épuré re-rend le thinking visible (pi ne connaît pas notre force).
 *
 * Scroll anchor (discovery F-01) : le scrollTop natif est un offset ABSOLU en
 * lignes — quand le contenu rétrécit, le point de lecture défile hors écran et
 * peut même finir clampé au bas + followingEnd (le « descend tt en bas »).
 * Avant le flip (uniquement si l'utilisateur ne suit PAS le bas), on compte les
 * marques OSC-133;A au-dessus du viewport top : elles ne sont émises que par
 * user-message/assistant-message, donc « le n-ième marqueur » désigne le même
 * message avant et après le toggle, même si des tool rows ont disparu entre
 * les deux. Après le flip, tui.renderNow() (render SYNCHRONE — zéro race)
 * reconstruit le layout, et on scroll vers ce n-ième marqueur avec
 * disableFollow pour rester en position de lecture. Si l'utilisateur suivait
 * le bas, on ne touche à rien : rester collé au bas est le comportement live
 * attendu.
 *
 * Arrivées en streaming : pi émet déjà message_update / tool_execution_start /
 * tool_execution_update — on y re-walk l'arbre pour patcher les nouveaux tools
 * et forcer le thinking des nouvelles réponses. Event-driven, zéro polling.
 * Fenêtre résiduelle : si notre handler passe avant la création du composant
 * par pi, la row peut apparaître quelques frames — l'event suivant la masque.
 *
 * Accès : editor.tui (hérité de Editor, posé au constructeur) → currentLayout
 * (frame de layout : primaryScrollView = transcript, boxes portant
 * scrollContentLines — les mêmes lignes que scrollToPrompt natif). Tout est
 * résolu LAZY à chaque usage, chaque maillon optionnel : si pi renomme un
 * champ, l'épuré devient no-op au lieu de crasher. Caveat : après un switch
 * tui-mode à chaud, editor.tui est périmé (switchTuiMode recrée la TUI) —
 * discovery F-05, même fix unifié que le listener Ctrl+C.
 */

const OSC133_PROMPT_START = /^\x1b]133;A(?:\x07|\x1b\\)/;

/** Slots d'override posés sur les instances (symbols : zéro collision avec pi). */
const EPURE_ORIGINAL_RENDER = Symbol("epureOriginalRender");
const EPURE_SAVED_THINKING = Symbol("epureSavedThinking");

interface EpureLayoutBox {
	component?: unknown;
	scrollView?: unknown;
	children?: EpureLayoutBox[];
	scrollContentLines?: readonly string[];
}

interface EpureTui {
	currentLayout?: { primaryScrollView?: unknown; root?: EpureLayoutBox };
	renderNow(force?: boolean): void;
}

interface EpureComponent {
	toolName?: unknown;
	render?(width: number): string[];
	setHideThinkingBlock?(hide: boolean): void;
	hideThinkingBlock?: boolean;
	children?: unknown[];
}

/** État épuré : lu par les overrides render à chaque frame. /reload repart à OFF. */
let epureActive = false;

/** Résout TUI + transcript ScrollView depuis l'éditeur actif (lazy, défensif). */
function resolveTranscript(): { tui: EpureTui; scrollView: ScrollView } | undefined {
	const editor = activeEditor.current as unknown as { tui?: EpureTui } | null;
	const tui = editor?.tui;
	const scrollView = tui?.currentLayout?.primaryScrollView as ScrollView | undefined;
	if (!tui || !scrollView) return undefined;
	if (typeof scrollView.scrollTop !== "number" || typeof scrollView.scrollTo !== "function") return undefined;
	return { tui, scrollView };
}

/** Retrouve la box de layout d'un ScrollView (même cible que getScrollViewBox de pi-tui). */
function findScrollBox(box: EpureLayoutBox | undefined, scrollView: unknown): EpureLayoutBox | undefined {
	if (!box) return undefined;
	if (box.component === scrollView || box.scrollView === scrollView) return box;
	for (const child of box.children ?? []) {
		const found = findScrollBox(child, scrollView);
		if (found) return found;
	}
	return undefined;
}

/** Walk défensif de l'arbre de composants (children publics des Containers pi-tui). */
function walkTree(root: unknown, visit: (component: EpureComponent) => void): void {
	const seen = new Set<unknown>();
	const stack: unknown[] = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || typeof current !== "object" || seen.has(current)) continue;
		seen.add(current);
		const comp = current as EpureComponent;
		visit(comp);
		if (Array.isArray(comp.children)) {
			for (const child of comp.children) {
				if (child && typeof child === "object") stack.push(child);
			}
		}
	}
}

/** Pose l'override render sur une instance tool (idempotent). */
function epurePatchTool(component: EpureComponent): void {
	const slot = component as unknown as Record<PropertyKey, unknown>;
	if (slot[EPURE_ORIGINAL_RENDER] !== undefined) return;
	const proto = Object.getPrototypeOf(component) as { render?: (width: number) => string[] } | null;
	if (typeof proto?.render !== "function" || typeof component.render !== "function") return;
	const original = proto.render;
	slot[EPURE_ORIGINAL_RENDER] = original;
	component.render = (width: number): string[] => {
		if (epureActive) return [];
		return original.call(component, width);
	};
}

/** Force le thinking caché sur un composant assistant, valeur d'origine samplée. */
function epureForceThinkingHidden(component: EpureComponent): void {
	const slot = component as unknown as Record<PropertyKey, unknown>;
	if (slot[EPURE_SAVED_THINKING] !== undefined) return;
	if (typeof component.setHideThinkingBlock !== "function" || typeof component.hideThinkingBlock !== "boolean") return;
	slot[EPURE_SAVED_THINKING] = component.hideThinkingBlock;
	component.setHideThinkingBlock(true);
}

/** Restaure le thinking d'origine sur tout composant forcé. */
function epureRestoreThinking(root: unknown): void {
	walkTree(root, (comp) => {
		const slot = comp as unknown as Record<PropertyKey, unknown>;
		const saved = slot[EPURE_SAVED_THINKING];
		if (saved === undefined) return;
		delete slot[EPURE_SAVED_THINKING];
		if (typeof comp.setHideThinkingBlock === "function") comp.setHideThinkingBlock(saved === true);
	});
}

/** Un walk pour tout : patch tools + forçage thinking (à l'ON et aux events). */
function epureApply(root: unknown, forceThinking: boolean): void {
	walkTree(root, (comp) => {
		if (comp.toolName !== undefined) {
			epurePatchTool(comp);
		} else if (forceThinking) {
			epureForceThinkingHidden(comp);
		}
	});
}

/** Ordinal (0-based) du message contenant le haut du viewport, via marques OSC-133. */
function epureCaptureAnchor(scrollView: ScrollView, tui: EpureTui): number {
	const lines = findScrollBox(tui.currentLayout?.root, scrollView)?.scrollContentLines;
	if (!lines) return Number.NaN;
	const top = Math.min(scrollView.scrollTop, lines.length - 1);
	let count = 0;
	for (let row = 0; row <= top; row++) {
		if (OSC133_PROMPT_START.test(lines[row] ?? "")) count++;
	}
	return count - 1; // -1 = viewport au-dessus du 1er message → restore.scrollTo(0)
}

/** Replace le viewport sur le n-ième marqueur du NOUVEAU layout (disableFollow = position de lecture). */
function epureRestoreAnchor(scrollView: ScrollView, tui: EpureTui, anchor: number): void {
	if (Number.isNaN(anchor)) return;
	if (anchor < 0) {
		scrollView.scrollTo(0, { disableFollow: true });
		return;
	}
	const lines = findScrollBox(tui.currentLayout?.root, scrollView)?.scrollContentLines;
	if (!lines) return;
	let ordinal = 0;
	for (let row = 0; row < lines.length; row++) {
		if (!OSC133_PROMPT_START.test(lines[row] ?? "")) continue;
		if (ordinal === anchor) {
			scrollView.scrollTo(row, { disableFollow: true });
			return;
		}
		ordinal++;
	}
}

/** Toggle épuré : capture anchor → flip → renderNow synchrone → restore anchor. */
function toggleEpure(): void {
	const resolved = resolveTranscript();
	if (!resolved) return; // hors fullscreen ou TUI introuvable → no-op
	const { tui, scrollView } = resolved;
	const doc = (scrollView as unknown as { child?: unknown }).child;
	if (!doc || typeof doc !== "object") return;

	const followingEnd = scrollView.isFollowingEnd;
	const anchor = followingEnd ? Number.NaN : epureCaptureAnchor(scrollView, tui);

	epureActive = !epureActive;
	epureApply(doc, epureActive);
	if (!epureActive) epureRestoreThinking(doc);

	(tui as unknown as AltScreenInternals).flash?.(epureActive ? "Vue épurée : outils masqués" : "Vue épurée : off");
	tui.renderNow(); // layout synchrone → currentLayout frais pour l'anchor

	if (!followingEnd) epureRestoreAnchor(scrollView, tui, anchor);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		// TUI-only : pas de renderer en mode print/json/rpc.
		if (ctx.mode !== "tui" || !ctx.hasUI) return;

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const alt = tui as unknown as AltScreenInternals;

			// 3. Molette plus rapide (fullscreen uniquement — champ absent sinon).
			if (alt.wheelScrollLines !== undefined) {
				alt.wheelScrollLines = WHEEL_SCROLL_LINES;
			}

			const editor = new MyPiEditor(tui, theme, keybindings, alt);
			activeEditor.current = editor;

			// 1. Ctrl+C au niveau TUI : tourne AVANT le dispatch au composant
			// focus, donc avant l'app.clear destructeur de pi. Chirurgical : on
			// n'agit que si c'est l'éditeur actif qui a le focus (les selectors
			// gardent leur Ctrl+C = cancel), et jamais au-dessus d'un overlay.
			if (!installedListeners.has(tui)) {
				installedListeners.add(tui);
				tui.addInputListener((data) => {
					if (!matchesKey(data, "ctrl+c")) return undefined;
					if (tui.hasOverlay()) return undefined;
					if (alt.getFocusedComponent?.() !== activeEditor.current) return undefined;

					if (alt.hasActiveSelection?.()) {
						// Le renderer flashe "Copied!" lui-même en cas de succès.
						void alt.copyActiveSelectionToClipboard?.();
					}
					// Sans sélection : neutre. Ctrl+C ne détruit plus le texte.
					return { consume: true };
				});
			}

			return editor;
		});
		// Vue épurée : si active au moment d'un switch de session, re-patcher
		// l'arbre fraîchement monté (les events couvrent ensuite le streaming).
		if (epureActive) epureSweep();
	});

	// 9. F5 — vue épurée du transcript (tool rows masquées). F5 = séquence
	// legacy universelle (\x1b[15~), aucun problème de modificateurs — contrairement
	// aux combos ctrl/alt/shift+lettre dont SHIFT est perdu sans protocole kitty
	// (cf. git history : la v1 nécessitait un alias ctrl+alt+p à cause de ça).
	pi.registerShortcut("f5", {
		description: "Toggle clean transcript view (hide tool rows)",
		handler: async () => {
			toggleEpure();
		},
	});

	// Pendant l'épuré : patch des tools + forçage thinking des composants qui
	// arrivent au fil du streaming (events pi déjà émis — zéro polling).
	const epureSweep = (): void => {
		if (!epureActive) return;
		const resolved = resolveTranscript();
		if (!resolved) return;
		const doc = (resolved.scrollView as unknown as { child?: unknown }).child;
		if (!doc || typeof doc !== "object") return;
		epureApply(doc, true);
	};
	pi.on("message_update", epureSweep);
	pi.on("tool_execution_start", epureSweep);
	pi.on("tool_execution_update", epureSweep);

	// 8. F8 : dossier du projet courant dans l'Explorateur Windows.
	pi.registerShortcut("f8", {
		description: "Open the current project folder in Explorer",
		handler: async (ctx) => {
			const result = await pi.exec("explorer", [ctx.cwd]);
			// explorer.exe retourne 1 même en succès — on ne signale que le vrai échec.
			if (result.code !== 0 && result.code !== 1) {
				ctx.ui.notify(`Explorer failed (exit ${result.code})`, "error");
			}
		},
	});
}
