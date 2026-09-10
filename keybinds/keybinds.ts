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
import { matchesKey, type TUI, type EditorTheme } from "@earendil-works/pi-tui";

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
	});

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
