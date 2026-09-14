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
 *             ou /quit. Sélection dans l'éditeur : le texte LOGIQUE est copié
 *             (conversion géométrique — voir plus bas), pas les lignes
 *             visuelles : pas de « \n » parasites aux soft-wraps.
 *
 * 2. Suppr / Backspace — supprime le texte de la sélection écran si ce texte
 *             appartient à l'éditeur (avec undo via Ctrl+Z, snapshot posé par
 *             setText). Multi-lignes OK, soft-wraps compris : la sélection
 *             écran (rows/cols) est convertie en offsets logiques, sans
 *             matching de contenu. Sélection hors éditeur (transcript ou autre
 *             composant du dock) : le surlignage est vidé et le
 *             Backspace/Suppr normal s'applique.
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
 *             redoable). Dans l'éditeur : texte logique propre (même conversion
 *             géométrique). Sans sélection → comportement natif pi conservé
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
 * 10. Indicateur « scroll to end » (visible quand on est remonté dans le
 *             transcript) : réduit à « ↓ » gras sur fond sélectionné — le
 *             natif « ↓ Jump to latest message · End » est verbeux. Le clic
 *             natif reste opérationnel (zone recalculée à chaque frame à
 *             partir du texte rendu). Pas d'agrandissement de police possible
 *             (grille terminal uniforme) : le gras + fond compensent.
 *
 * 11. Frapper un caractère (ou Entrée) avec une sélection écran dans
 *             l'éditeur REMPLACE la sélection (convention GUI) au lieu de
 *             s'insérer devant. Undo couvert (snapshot delete par setText,
 *             puis insert normal).
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
 * Conversion géométrique (cut/copy/suppr multi-lignes) : getActiveSelectionText
 * reconstruit le texte depuis les lignes VISUELLES de l'écran jointes par
 * "\n" — dès qu'une sélection chevauche un soft-wrap (ligne logique affichée
 * sur plusieurs rows), ce texte contient des "\n" inexistants dans le texte
 * logique : tout matching par contenu échoue (bug « une seule ligne » v1.2).
 * On convertit donc les COORDONNÉES : TuiAltScreen.getSelectionBounds donne
 * rows/cols écran ; la box de layout de l'éditeur (tui.currentLayout —
 * l'éditeur n'a pas de layout node propre, sa box est celle du Container qui
 * le porte, identifiée par children) donne rect.y + lines (= résultat du
 * dernier render : [topBorder, ...layoutLines visibles, bottomBorder, …]) et
 * paintBox dessine lines[lineOffset + row - rect.y] → chaque row écran devient
 * un index de layoutLine ; layoutText(lastWidth) rejoué fournit le texte de
 * chaque layoutLine, que mapLayoutLinesToRanges convertit en plage logique par
 * partitionnement séquentiel (indexOf croissant, sans ambiguïté). Inclusivité
 * du bout : start = début du graphème sous le point, end l'inclut (cf.
 * getSelectionColumns de pi-tui). Toutes les étapes sont gardées : maillon
 * manquant → fallback matching par contenu (comportement v1.2), jamais crash.
 *
 * Toutes les capacités ciblées sont gardées : si pi renomme/retire une API
 * interne, l'extension se contente de ne rien faire (pas de crash).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
	decodeKittyPrintable,
	matchesKey,
	sliceByColumn,
	visibleWidth,
	type TUI,
	type EditorTheme,
	type ScrollView,
} from "@earendil-works/pi-tui";

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
	/** Bornes de la sélection écran : rows/cols écran, start avant end. */
	getSelectionBounds?(): ScreenSelectionBounds | undefined;
	/** Copie directe d'un texte (flash "Copied!"/"Copy failed" géré côté renderer). */
	copyTextToClipboard?(text: string): Promise<boolean>;
	flash?(message: string, durationMs?: number): void;
	/** Indicateur « scroll to end » (TuiAltScreen, champ public) — factory appelée à chaque frame quand on n'est pas en bas. */
	scrollToEndIndicator?: () => string;
	/** Présent sur TuiBase, absent de l'interface TUI — comparaison d'identité uniquement. */
	getFocusedComponent?(): unknown;
	/** Pose de sélection par code (Ctrl+A select-all) — champs internes TuiAltScreen. */
	selectionAnchor?: ScreenSelectionPoint;
	selectionFocus?: ScreenSelectionPoint;
	selectionGranularity?: string;
	selectionInitialRange?: unknown;
	requestRender?(): void;
}

/** Point de sélection écran (TuiAltScreen.getSelectionBounds). */
interface ScreenSelectionPoint {
	row: number;
	col: number;
	/** ScrollView d'origine : défini = sélection transcript, absent = écran physique. */
	scrollView?: unknown;
	/** End exact : la colonne du point est prise telle quelle (sinon caractère sous le point inclus). */
	boundary?: boolean;
}

/** Bornes d'une sélection écran (start toujours avant end). */
interface ScreenSelectionBounds {
	start: ScreenSelectionPoint;
	end: ScreenSelectionPoint;
}

/**
 * Box de layout d'un composant simple (renderLayoutFrame, pi-tui/layout).
 * lines = résultat du dernier render(width) du composant ; paintBox dessine
 * lines[lineOffset + row - rect.y] aux rows écran [max(rect.y, clip.y), min(…)).
 */
interface EditorLayoutBox {
	component?: unknown;
	rect?: { x: number; y: number; width: number; height: number };
	lines?: readonly string[];
	lineOffset?: number;
	children?: EditorLayoutBox[];
}

/**
 * Vue typée des internes runtime de l'éditeur (privés TS, présents au runtime).
 * state = état d'édition ; les métriques sont posées à chaque render().
 */
interface EditorInternals {
	state?: { lines: string[]; cursorLine: number; cursorCol: number };
	scrollOffset?: unknown;
	lastWidth?: unknown;
	renderedVisibleLineCount?: unknown;
	paddingX?: unknown;
	layoutText?: (width: number) => { text: string }[] | undefined;
}

/**
 * Box de layout rendant CE composant (walk défensif de l'arbre).
 * L'éditeur n'a pas de layout node propre : sa box est celle du Container qui
 * le porte → identité directe OU identité par contenu (children inclut editor).
 */
function findEditorBox(box: EditorLayoutBox | undefined, editor: unknown): EditorLayoutBox | undefined {
	if (!box) return undefined;
	if (box.component === editor) return box;
	const comp = box.component as { children?: unknown[] } | undefined;
	if (Array.isArray(comp?.children) && comp.children.includes(editor)) return box;
	for (const child of box.children ?? []) {
		const found = findEditorBox(child, editor);
		if (found) return found;
	}
	return undefined;
}

/**
 * Partitionne les layoutLines (texte visuel par chunk de wrap) contre les
 * lignes logiques : ranges[k] = plage [start, end) dans getText() du
 * layoutLine k. Principe : les chunks d'une ligne logique s'enchaînent —
 * indexOf croissant depuis la dernière position, sans ambiguïté d'occurrence.
 * Tableau potentiellement troué si désynchronisation détectée (l'appelant
 * teste chaque range utilisée).
 */
function mapLayoutLinesToRanges(
	lines: readonly string[],
	layoutLines: readonly { text: string }[],
): ({ start: number; end: number } | undefined)[] {
	const ranges: ({ start: number; end: number } | undefined)[] = new Array(layoutLines.length);
	let k = 0;
	let offset = 0; // début de la ligne logique courante dans getText()
	for (let i = 0; i < lines.length && k < layoutLines.length; i++) {
		const line = lines[i] ?? "";
		if (line === "") {
			// Ligne vide : une layoutLine au texte vide, plage dégénérée.
			if ((layoutLines[k]?.text ?? "") === "") {
				ranges[k] = { start: offset, end: offset };
				k++;
			}
			offset += 1; // "\n"
			continue;
		}
		let pos = 0;
		let guard = 0;
		while (k < layoutLines.length && guard++ < 10000) {
			const t = layoutLines[k]?.text ?? "";
			if (t === "") {
				k++; // layoutLine vide inattendue : skip défensif
				continue;
			}
			const found = line.indexOf(t, pos);
			if (found === -1) break; // la ligne logique suivante prendra le relais
			ranges[k] = { start: offset + found, end: offset + found + t.length };
			pos = found + t.length;
			k++;
			if (pos >= line.length) break;
		}
		offset += line.length + 1; // +1 = "\n"
	}
	return ranges;
}

class MyPiEditor extends CustomEditor {
	private readonly alt: AltScreenInternals;

	/** Redo one-shot : état pré/post de la dernière suppression + position du curseur. */
	private redoState: { before: string; after: string; cursorOffset: number } | null = null;

	/** Vue typée des internes runtime de l'éditeur (privés TS, présents au runtime). */
	private get editorInternals(): EditorInternals {
		return this as unknown as EditorInternals;
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
			// Cut : copie + suppression de la sélection. Dans l'éditeur : texte
			// LOGIQUE propre (conversion géométrique — pas de "\n" de soft-wrap) ;
			// sinon (transcript) : chemin renderer natif. Sans sélection : pas de
			// return → super route vers le comportement natif pi (copie de la
			// dernière réponse du modèle).
			const editorText = this.copyScreenSelectionText();
			if (editorText !== undefined && this.alt.copyTextToClipboard) {
				void this.alt.copyTextToClipboard(editorText);
			} else {
				void this.alt.copyActiveSelectionToClipboard?.();
			}
			this.deleteScreenSelection();
			return;
		}
		if (matchesKey(data, "ctrl+a")) {
			// Select-all du champ (convention GUI, F-09) : pose la sélection écran
			// sur tout le texte visible de l'éditeur. Rien à sélectionner → pas de
			// return, le natif (cursorLineStart) passe — sur éditeur vide c'est
			// équivalent. L'utilisateur perd début-de-ligne sur Ctrl+A (Home/Ctrl+Home
			// restent) : trade-off assumé du select-all.
			if (this.selectAllInEditor()) return;
		}
		if (matchesKey(data, "backspace") || matchesKey(data, "delete")) {
			if (this.deleteScreenSelection()) return;
		} else if (this.replacesScreenSelection(data)) {
			// Frappe sur sélection écran éditeur : convention GUI — la sélection
			// est REMPLACÉE. deleteScreenSelection supprime et pose le curseur au
			// début de l'ex-sélection ; super.handleInput insère ensuite la frappe
			// à cet endroit.
			this.deleteScreenSelection();
		}
		super.handleInput(data);
	}

	/**
	 * La frappe doit-elle remplacer la sélection écran (convention GUI) ? Oui
	 * si l'entrée est insérable ET la sélection appartient à l'éditeur.
	 *
	 * Insérable : kitty CSI-u imprimable (decodeKittyPrintable rejette déjà
	 * alt/ctrl) ; sinon encodage legacy — même seuil que le fallback
	 * d'insertion de pi (editor.js : charCodeAt(0) >= 32, émojis inclus via
	 * surrogate pair), hors séquences ESC (flèches, bracketed paste…), plus
	 * Entrée « \r » (replace + submit, convention GUI).
	 */
	private replacesScreenSelection(data: string): boolean {
		const insertable =
			decodeKittyPrintable(data) !== undefined ||
			(data.length > 0 && !data.includes("\x1b") && (data.charCodeAt(0) >= 32 || data === "\r"));
		if (!insertable) return false;
		return this.hasEditorScreenSelection();
	}

	/** Sélection écran actuellement dans l'éditeur (convertible géométriquement) ? */
	private hasEditorScreenSelection(): boolean {
		const bounds = this.alt.getSelectionBounds?.();
		if (!bounds || bounds.start.scrollView || bounds.end.scrollView) return false;
		return this.screenSelectionToEditorRange(bounds) !== undefined;
	}

	/**
	 * Ctrl+A : pose la sélection écran sur tout le TEXTE visible de l'éditeur.
	 * La pose est l'assignation directe des champs internes de TuiAltScreen
	 * (selectionAnchor/selectionFocus — points {row,col}, boundary sur le end) :
	 * le surlignage suit automatiquement (applySelection au paint) et la
	 * sélection survit aux inputs clavier. Tout le pipeline aval est déjà
	 * validé : Ctrl+C géométrique v1.3, frappe remplace v1.4, cut/suppr.
	 * Limite assumée (F-06) : le texte au-delà du viewport reste hors sélection
	 * — la sélection écran vit sur les rows visuelles.
	 * Retourne false si rien à sélectionner (vide, métriques absentes) →
	 * l'appelant laisse le natif passer.
	 */
	private selectAllInEditor(): boolean {
		if (this.getText().length === 0) return false;

		const internals = this.editorInternals;
		const scrollOffset = internals.scrollOffset;
		const visible = internals.renderedVisibleLineCount;
		const lastWidth = internals.lastWidth;
		if (typeof scrollOffset !== "number" || typeof visible !== "number" || typeof lastWidth !== "number") {
			return false;
		}
		const layoutLines = internals.layoutText?.(lastWidth);
		if (!Array.isArray(layoutLines)) return false;

		const tuiLayout = this.tui as unknown as EpureTui; // même accès que la vue épurée
		const box = findEditorBox(tuiLayout.currentLayout?.root as EditorLayoutBox | undefined, this);
		const rect = box?.rect;
		if (!rect || !Array.isArray(box.lines)) return false;

		// Fenêtre visible de layoutLines, bornée aux lignes NON VIDES : les rows
		// vides n'apportent rien au texte et bloqueraient la conversion v1.3.
		const windowLines = layoutLines.slice(scrollOffset, scrollOffset + visible);
		let firstIdx = -1;
		let lastIdx = -1;
		for (let i = 0; i < windowLines.length; i++) {
			if ((windowLines[i]?.text ?? "").length > 0) {
				if (firstIdx === -1) firstIdx = i;
				lastIdx = i;
			}
		}
		if (firstIdx === -1 || lastIdx === -1) return false;

		const paddingXSetting = typeof internals.paddingX === "number" ? internals.paddingX : 0;
		const paddingX = Math.min(paddingXSetting, Math.max(0, Math.floor((rect.width - 1) / 2)));
		const x = rect.x + paddingX;

		this.alt.selectionAnchor = { row: rect.y + 1 + firstIdx, col: x };
		this.alt.selectionFocus = {
			row: rect.y + 1 + lastIdx,
			col: x + visibleWidth(windowLines[lastIdx]?.text ?? ""),
			boundary: true,
		};
		this.alt.selectionGranularity = "character";
		this.alt.selectionInitialRange = undefined;
		this.alt.requestRender?.();
		return true;
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
	 *
	 * Chemin principal : conversion GÉOMÉTRIQUE (cf. screenSelectionToEditorRange)
	 * — exacte multi-lignes, soft-wraps compris. Sélection transcript ou autre
	 * composant : surlignage vidé, touche normale. getSelectionBounds absent
	 * (refactor pi) : fallback historique par contenu.
	 */
	private deleteScreenSelection(): boolean {
		const sel = this.alt.getActiveSelectionText?.();
		if (!sel) return false;

		const bounds = this.alt.getSelectionBounds?.();
		if (!bounds) return this.deleteSelectionByContent(sel);

		if (bounds.start.scrollView || bounds.end.scrollView) {
			// Sélection hors éditeur (transcript) : on vide le surlignage et on
			// laisse le Backspace/Suppr normal s'appliquer. Le test scrollView
			// élimine la limite v1.2 (même texte présent dans l'éditeur).
			this.alt.clearTextSelection?.();
			this.tui.requestRender();
			return false;
		}

		const range = this.screenSelectionToEditorRange(bounds);
		if (!range) {
			// Ni transcript ni éditeur (autre composant du dock) : idem, neutre.
			this.alt.clearTextSelection?.();
			this.tui.requestRender();
			return false;
		}

		const text = this.getText();
		const after = text.slice(0, range.start) + text.slice(range.end);
		// Un nouvel état redo invalide le précédent (comportement GUI standard).
		this.redoState = { before: text, after, cursorOffset: range.start };
		this.setTextAndCursor(after, range.start);
		this.alt.clearTextSelection?.();
		this.tui.requestRender();
		return true;
	}

	/**
	 * Fallback historique (v1.2) : matching par contenu, si getSelectionBounds
	 * est indisponible. Limites connues (soft-wraps, double transcript/éditeur).
	 */
	private deleteSelectionByContent(sel: string): boolean {
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
			this.alt.clearTextSelection?.();
			this.tui.requestRender();
			return false;
		}
		const after = text.slice(0, idx) + text.slice(idx + match.length);
		this.redoState = { before: text, after, cursorOffset: idx };
		this.setTextAndCursor(after, idx);
		this.alt.clearTextSelection?.();
		this.tui.requestRender();
		return true;
	}

	/**
	 * Texte LOGIQUE de la sélection écran si elle appartient à l'éditeur — copie
	 * propre (pas de "\n" parasites aux soft-wraps). undefined sinon.
	 */
	copyScreenSelectionText(): string | undefined {
		const bounds = this.alt.getSelectionBounds?.();
		if (!bounds || bounds.start.scrollView || bounds.end.scrollView) return undefined;
		const range = this.screenSelectionToEditorRange(bounds);
		if (!range) return undefined;
		return this.getText().slice(range.start, range.end);
	}

	/**
	 * Conversion géométrique : sélection écran (rows/cols) → plage [start, end)
	 * dans getText(). undefined si la sélection n'appartient pas à l'éditeur ou
	 * si un maillon manque (champ renommé par pi → l'appelant fallback).
	 *
	 * Principe : la box de layout de l'éditeur (trouvée par findEditorBox) porte
	 * rect.y + lines = [topBorder, ...layoutLines visibles, bottomBorder,
	 * …autocomplete] et paintBox dessine lines[lineOffset + row - rect.y] →
	 * chaque row écran devient un index de layoutLine ; layoutText(lastWidth)
	 * rejoué fournit le texte de chaque layoutLine, converti en plage logique
	 * par mapLayoutLinesToRanges. Colonne écran → index caractère via
	 * sliceByColumn (largeur d'affichage, wide-char safe). Inclusivité : le
	 * point de START désigne le début du graphème sous lui ; le point de END
	 * INCLUT ce caractère (getSelectionColumns de pi-tui) sauf s'il est
	 * au-delà du texte (padding) — dans ce cas plage de fin.
	 */
	private screenSelectionToEditorRange(bounds: ScreenSelectionBounds): { start: number; end: number } | undefined {
		if (bounds.start.scrollView || bounds.end.scrollView) return undefined; // transcript

		const internals = this.editorInternals;
		const lines = internals.state?.lines;
		const scrollOffset = internals.scrollOffset;
		const lastWidth = internals.lastWidth;
		const visible = internals.renderedVisibleLineCount;
		if (!lines || typeof scrollOffset !== "number" || typeof lastWidth !== "number" || typeof visible !== "number") {
			return undefined;
		}

		const tuiLayout = this.tui as unknown as EpureTui; // même accès que la vue épurée
		const box = findEditorBox(tuiLayout.currentLayout?.root as EditorLayoutBox | undefined, this);
		const rect = box?.rect;
		if (!rect || !Array.isArray(box.lines)) return undefined;
		if (box.lines.length < visible + 2) return undefined; // structure inattendue

		const layoutLines = internals.layoutText?.(lastWidth);
		if (!Array.isArray(layoutLines)) return undefined;
		const ranges = mapLayoutLinesToRanges(lines, layoutLines);

		const paddingXSetting = typeof internals.paddingX === "number" ? internals.paddingX : 0;
		const paddingX = Math.min(paddingXSetting, Math.max(0, Math.floor((rect.width - 1) / 2)));

		const toOffset = (point: ScreenSelectionPoint, isEnd: boolean): number | undefined => {
			const lineIndex = (box.lineOffset ?? 0) + point.row - rect.y;
			if (lineIndex < 0) return undefined; // au-dessus de la box éditeur
			let layoutIndex: number;
			let clamp: "start" | "end" | undefined;
			if (lineIndex === 0) {
				layoutIndex = scrollOffset; // topBorder → début du texte
				clamp = "start";
			} else if (lineIndex === visible + 1) {
				layoutIndex = scrollOffset + visible - 1; // bottomBorder → fin du texte
				clamp = "end";
			} else if (lineIndex > visible + 1) {
				return undefined; // autocomplete / sous la box → pas notre texte
			} else {
				layoutIndex = scrollOffset + (lineIndex - 1);
			}
			const range = ranges[layoutIndex];
			if (!range) return undefined;
			if (clamp === "start") return range.start;
			if (clamp === "end") return range.end;
			const lineText = layoutLines[layoutIndex]?.text ?? "";
			const colText = Math.max(0, point.col - rect.x - paddingX);
			const lineWidth = visibleWidth(lineText);
			const idx = colText >= lineWidth ? lineText.length : sliceByColumn(lineText, 0, colText, true).length;
			const included = isEnd && colText < lineWidth ? 1 : 0;
			return Math.min(range.start + idx + included, range.end);
		};

		const start = toOffset(bounds.start, false);
		const end = toOffset(bounds.end, true);
		if (start === undefined || end === undefined || end <= start) return undefined;
		return { start, end };
	}

	/**
	 * setText + curseur à un offset global donné (converti en ligne/colonne
	 * logiques). Utilise `state` et `setCursorCol` (privés TS, runtime) :
	 * setCursorCol reset aussi le sticky column (preferredVisualCol).
	 */
	private setTextAndCursor(text: string, cursorOffset: number): void {
		this.setText(text);
		const state = this.editorInternals.state;
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

			// 10. Indicateur « scroll to end » réduit à une flèche (le natif est
			// verbeux : « ↓ Jump to latest message · End »). Même guard que la
			// molette : le champ n'existe que sur TuiAltScreen. Style : gras sur
			// le fond sélectionné natif — pas d'agrandissement de police possible
			// (grille terminal uniforme), le gras compense. Le padding élargit la
			// zone cliquable (rect recalculé par pi à chaque frame sur le texte).
			if (alt.wheelScrollLines !== undefined) {
				alt.scrollToEndIndicator = () =>
					ctx.ui.theme.bg("selectedBg", ctx.ui.theme.bold("  ↓  "));
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
						// Sélection dans l'éditeur → texte LOGIQUE propre (pas de "\n"
						// parasites aux soft-wraps) ; sinon chemin renderer (transcript).
						// Le renderer flashe "Copied!" lui-même dans les deux cas.
						const editorText = activeEditor.current?.copyScreenSelectionText();
						if (editorText !== undefined && alt.copyTextToClipboard) {
							void alt.copyTextToClipboard(editorText);
						} else {
							void alt.copyActiveSelectionToClipboard?.();
						}
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
