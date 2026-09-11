/**
 * Labo — sélection écran multi-lignes : matching contenu (actuel) VS géométrie (proposé).
 *
 * Pipeline réel : TuiAltScreen (previousScreen) + Editor dans le dock (comme
 * createChatViewport de pi), drag souris simulé par vraies séquences SGR.
 * Les drags vont du 1er caractère d'un mot-repère au DERNIER caractère d'un
 * mot-repère (le caractère sous le point final est inclus, cf.
 * getSelectionColumns/getGraphemeCellRange de pi-tui) → attendus non ambiguës.
 *
 * Usage : node dev/lab-selection.mjs
 */

import { pathToFileURL } from "node:url";

const PI_TUI =
	"C:/Users/Pelo/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist";

const { TuiAltScreen } = await import(pathToFileURL(`${PI_TUI}/tui-alt-screen.js`).href);
const { Editor } = await import(pathToFileURL(`${PI_TUI}/components/editor.js`).href);
const { ScrollView } = await import(pathToFileURL(`${PI_TUI}/components/scroll-view.js`).href);
const { VStack } = await import(pathToFileURL(`${PI_TUI}/components/v-stack.js`).href);
const { Container } = await import(pathToFileURL(`${PI_TUI}/tui.js`).href);
const { stripTerminalSequences, sliceByColumn, visibleWidth } = await import(
	pathToFileURL(`${PI_TUI}/utils.js`).href
);

const COLS = 100;
const ROWS = 30;

function makeFakeTerminal() {
	return {
		columns: COLS,
		rows: ROWS,
		writes: [],
		onInput: null,
		write(data) {
			this.writes.push(data);
		},
		start(onInput, _onResize) {
			this.onInput = onInput;
		},
		stop() {},
		showCursor() {},
		hideCursor() {},
	};
}

const theme = {
	borderColor: (t) => t,
	selectList: {
		selectedPrefix: (t) => t,
		selectedText: (t) => t,
		description: (t) => t,
		scrollInfo: (t) => t,
		noMatch: (t) => t,
	},
};

function buildTui(paddingX = 0) {
	const terminal = makeFakeTerminal();
	const tui = new TuiAltScreen(terminal, false, undefined, { copyOnSelect: false });
	const editor = new Editor(tui, theme, { paddingX });

	const chatContainer = new Container();
	const editorContainer = new Container();
	editorContainer.addChild(editor);

	const transcript = new ScrollView(chatContainer, { follow: "end", primary: true });
	tui.layoutRoot = new VStack([
		{ component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: editorContainer, basis: "auto", grow: 0, shrink: 1, minSize: 3 },
	]);
	tui.start();
	return { tui, editor, chatContainer };
}

/** Position écran (row, col) de la n-ième occurrence d'une sous-chaîne dans le rendu. */
function locate(tui, needle, occurrence = 0) {
	let seen = 0;
	for (let row = 0; row < tui.previousScreen.length; row++) {
		const plain = stripTerminalSequences(tui.previousScreen[row] ?? "");
		let from = 0;
		for (;;) {
			const col = plain.indexOf(needle, from);
			if (col === -1) break;
			if (seen === occurrence) return { row, col };
			seen++;
			from = col + 1;
		}
	}
	return undefined;
}

/** Drag du 1er caractère de fromNeedle au DERNIER caractère de toNeedle. */
function dragWords(tui, fromNeedle, toNeedle) {
	const from = locate(tui, fromNeedle);
	const toStart = locate(tui, toNeedle);
	if (!from || !toStart) throw new Error(`repères introuvables: ${fromNeedle}, ${toNeedle}`);
	const to = { row: toStart.row, col: toStart.col + toNeedle.length - 1 };
	tui.handleTerminalInput(`\x1b[<0;${from.col + 1};${from.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<32;${to.col + 1};${to.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<0;${to.col + 1};${to.row + 1}m`);
	return { from, to, fromNeedle, toNeedle };
}

/** Attendu indépendant : slice de getText() entre les mêmes repères que le drag. */
function expectedSlice(text, { fromNeedle, toNeedle }) {
	const a = text.indexOf(fromNeedle);
	const b = text.indexOf(toNeedle) + toNeedle.length;
	return text.slice(a, b);
}

// ===========================================================================
// CONVERSION GÉOMÉTRIQUE — miroir exact du futur code TS
// ===========================================================================

/**
 * Box de layout rendant CE composant (walk défensif de l'arbre).
 * L'éditeur n'a pas de layout node propre : sa box est celle du Container qui
 * le porte → identité directe OU identité par contenu (children inclut editor).
 */
function findComponentBox(box, component) {
	if (!box) return undefined;
	if (box.component === component) return box;
	if (Array.isArray(box.component?.children) && box.component.children.includes(component)) return box;
	for (const child of box.children ?? []) {
		const found = findComponentBox(child, component);
		if (found) return found;
	}
	return undefined;
}

/**
 * Partitionne les layoutLines (texte visuel par chunk) contre les lignes
 * logiques : ranges[k] = plage [start, end) dans getText() du layoutLine k.
 * Principe : les chunks d'une ligne logique s'enchaînent — indexOf croissant.
 * Retourne un tableau potentiellement troué si désynchronisation détectée.
 */
function mapLayoutLinesToRanges(lines, layoutLines) {
	const ranges = new Array(layoutLines.length);
	let k = 0;
	let offset = 0; // début de la ligne logique courante dans getText()
	for (let i = 0; i < lines.length && k < layoutLines.length; i++) {
		const line = lines[i] ?? "";
		if (line === "") {
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

/**
 * Sélection écran → plage d'offsets dans getText(), SI elle appartient à
 * l'éditeur. undefined = sélection hors éditeur (transcript…) ou maillon
 * manquant → l'extension devra fallback sur le matching par contenu.
 */
function screenSelectionToEditorRange(tui, editor, bounds) {
	if (!bounds) return undefined;
	if (bounds.start.scrollView || bounds.end.scrollView) return undefined; // transcript → natif

	const scrollOffset = editor.scrollOffset;
	const lastWidth = editor.lastWidth;
	const visible = editor.renderedVisibleLineCount;
	if (typeof scrollOffset !== "number" || typeof lastWidth !== "number" || typeof visible !== "number")
		return undefined;

	const layout = tui.currentLayout;
	const box = findComponentBox(layout?.root, editor);
	if (!box?.rect || !Array.isArray(box.lines)) return undefined;
	if (box.lines.length < visible + 2) return undefined; // structure inattendue

	const layoutLines = editor.layoutText(lastWidth);
	if (!Array.isArray(layoutLines)) return undefined;
	const ranges = mapLayoutLinesToRanges(editor.state.lines, layoutLines);

	const paddingX = Math.min(editor.paddingX ?? 0, Math.max(0, Math.floor((box.rect.width - 1) / 2)));

	const toOffset = (point, isEnd) => {
		const lineIndex = (box.lineOffset ?? 0) + point.row - box.rect.y;
		if (lineIndex < 0) return undefined; // au-dessus de la box éditeur
		let layoutIndex;
		let clamp;
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
		const colText = Math.max(0, point.col - box.rect.x - paddingX);
		const lineWidth = visibleWidth(lineText);
		// colonne écran → index caractère (wide-char safe)
		const idx = colText >= lineWidth ? lineText.length : sliceByColumn(lineText, 0, colText, true).length;
		// START : début du graphème sous le point (getSelectionColumns : start =
		// getGraphemeCellRange(...).start, pas d'offset). END : le caractère SOUS le
		// point est inclus (end = ...end) sauf si le point est au-delà du texte.
		const included = isEnd && colText < lineWidth ? 1 : 0;
		return Math.min(range.start + idx + included, range.end);
	};

	const start = toOffset(bounds.start, false);
	const end = toOffset(bounds.end, true);
	if (start === undefined || end === undefined || end <= start) return undefined;
	return { start, end };
}

/** Matching par contenu : logique ACTUELLE de deleteScreenSelection (keybinds.ts). */
function legacyMatching(editor, sel) {
	const text = editor.getText();
	let idx = text.indexOf(sel);
	let match = sel;
	if (idx === -1 && sel.trim().length > 0) {
		idx = text.indexOf(sel.trim());
		match = sel.trim();
	}
	if (idx === -1) return undefined;
	return { start: idx, end: idx + match.length };
}

// ===========================================================================
// CAS DE TEST
// ===========================================================================

const LONG_LINE =
	"ligne longue qui depasse largement la largeur de l'editeur et va donc etre wrappee par le layout en plusieurs lignes visuelles a l'ecran";

const MANY_LINES = Array.from(
	{ length: 15 },
	(_, i) => `ligne numero ${String(i + 1).padStart(2, "0")} courte`,
).join("\n");

const CASES = [
	{
		id: "T1",
		label: "1 ligne logique wrappée, sélection DANS UNE row visuelle (contrôle)",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui) => dragWords(tui, "wrappee", "layout"),
	},
	{
		id: "T2",
		label: "1 ligne logique wrappée, sélection À TRAVERS le soft-wrap",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui) => dragWords(tui, "ligne longue", "a l"),
	},
	{
		id: "T3",
		label: "1 ligne logique courte complète",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui) => dragWords(tui, "premiere", "courte"),
	},
	{
		id: "T4",
		label: "2 lignes logiques (fin ligne 1 → milieu ligne 2, sans wrap)",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui) => dragWords(tui, "courte", "longue"),
	},
	{
		id: "T5",
		label: "Tout le message (3 lignes logiques, wrap inclus) — le « tout couper »",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui) => dragWords(tui, "premiere", "troisieme ligne"),
	},
	{
		id: "T6",
		label: "T2 avec curseur posé DANS la sélection (rendu inversé)",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui, editor) => {
			editor.state.cursorLine = 1;
			editor.state.cursorCol = 20;
			tui.renderNow();
			return dragWords(tui, "ligne longue", "a l");
		},
	},
	{
		id: "T7",
		label: "Double-clic (mot) sur l'éditeur : pi efface la sélection (click dispatch)",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		setup: (tui) => {
			const at = locate(tui, "visuelles");
			for (let i = 0; i < 2; i++) {
				tui.handleTerminalInput(`\x1b[<0;${at.col + 1};${at.row + 1}M`);
				tui.handleTerminalInput(`\x1b[<0;${at.col + 1};${at.row + 1}m`);
			}
		},
		expected: () => undefined, // pas de sélection persistante attendue
	},
	{
		id: "T8",
		label: "Éditeur scrollé (15 lignes, curseur en bas) — sélection dans les lignes visibles",
		text: MANY_LINES,
		setup: (tui, editor) => {
			editor.state.cursorLine = 14;
			editor.state.cursorCol = 5;
			tui.renderNow(); // scroll : visibles = numero 07..15
			return dragWords(tui, "numero 08", "numero 09");
		},
	},
	{
		id: "T9",
		label: "Sélection TRANSCRIPT (hors éditeur) → la géométrie doit refuser",
		text: ["premiere ligne courte", LONG_LINE, "troisieme ligne"].join("\n"),
		fillTranscript: true,
		setup: (tui) => dragWords(tui, "TRANSCRIPT", "EDITEUR"),
		expected: () => undefined,
	},
];

function runCase(c) {
	const { tui, editor, chatContainer } = buildTui(0);
	editor.setText(c.text);
	if (c.fillTranscript) {
		chatContainer.addChild({
			render: (width) => ["TRANSCRIPT contenu HORS EDITEUR pour test"].map((l) => l.slice(0, width)),
		});
	}
	tui.renderNow();
	const markers = c.setup(tui, editor);

	const bounds = tui.getSelectionBounds();
	const sel = tui.getActiveSelectionText();
	const text = editor.getText();

	const legacy = sel === undefined ? undefined : legacyMatching(editor, sel);
	const geo = screenSelectionToEditorRange(tui, editor, bounds);
	const geoText = geo ? text.slice(geo.start, geo.end) : undefined;
	const expected = c.expected ? c.expected(text) : expectedSlice(text, markers);
	const pass = geoText === expected;
	const legacyText = legacy ? text.slice(legacy.start, legacy.end) : undefined;
	return { c, sel, legacyText, geo, geoText, expected, pass, bounds };
}

console.log("==========================================================================");
console.log(`LABO v2 — matching contenu (actuel) vs géométrie (proposé) — ${COLS}x${ROWS}`);
console.log("==========================================================================\n");

let passed = 0;
let total = 0;
for (const c of CASES) {
	const r = runCase(c);
	total++;
	if (r.pass) passed++;
	console.log(`--- ${r.c.id} : ${r.c.label}`);
	console.log(`    attendu      : ${JSON.stringify(r.expected)}`);
	console.log(
		`    géométrie    : ${r.geoText === undefined ? "(refusé — fallback)" : JSON.stringify(r.geoText)} ${r.pass ? "✅" : "❌ MISMATCH"}`,
	);
	console.log(`    actuel       : ${r.legacyText !== undefined ? `MATCH ${JSON.stringify(r.legacyText)}` : "NO MATCH / rien"}`);
	console.log();
}

console.log("==========================================================================");
console.log(`RÉSULTAT : ${passed}/${total} cas conformes`);
console.log("==========================================================================");

// Cas limites internes : partitionnement seul (sans TUI complète)
console.log("\n--- Partitionnement : toutes les plages coïncident avec les chunks ?");
{
	const lines = [
		"abc abc abc tres longue ligne pour forcer le wrap partout oui oui oui oui encore encore",
		"abc abc",
		"",
		"derniere",
	];
	const { tui, editor } = buildTui(0);
	editor.setText(lines.join("\n"));
	tui.renderNow();
	const layoutLines = editor.layoutText(editor.lastWidth);
	const ranges = mapLayoutLinesToRanges(lines, layoutLines);
	const text = lines.join("\n");
	let ok = true;
	let counted = 0;
	for (let k = 0; k < layoutLines.length; k++) {
		if (!ranges[k]) continue;
		counted++;
		const slice = text.slice(ranges[k].start, ranges[k].end);
		if (slice !== layoutLines[k].text) {
			ok = false;
			console.log(`    ❌ layoutLine ${k} : attendu ${JSON.stringify(layoutLines[k].text)}, obtenu ${JSON.stringify(slice)}`);
		}
	}
	console.log(`    ${counted}/${layoutLines.length} layoutLines mappées, ${ok ? "✅ plages toutes conformes" : "❌ désynchronisation"}`);
}
