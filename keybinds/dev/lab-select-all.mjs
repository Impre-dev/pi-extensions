/**
 * Labo — Ctrl+A : tout sélectionner dans le champ de saisie (F-09).
 *
 * Pipeline réel : TuiAltScreen + Editor dans le dock (comme createChatViewport
 * de pi). La sélection est POSÉE PAR CODE (assignation selectionAnchor /
 * selectionFocus — miroir exact du futur handler TS), pas par drag SGR.
 *
 * Test d'or : la conversion géométrique v1.3 (screenSelectionToEditorRange)
 * d'une sélection posée par code doit rendre exactement {start:0, end:len}
 * quand le texte tient dans le viewport → Ctrl+A puis Ctrl+C = tout, propre.
 *
 * Usage : node dev/lab-select-all.mjs
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

// ===========================================================================
// MIROIRS DU CODE EXISTANT (v1.3) — conversion géométrique
// ===========================================================================

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

function mapLayoutLinesToRanges(lines, layoutLines) {
	const ranges = new Array(layoutLines.length);
	let k = 0;
	let offset = 0;
	for (let i = 0; i < lines.length && k < layoutLines.length; i++) {
		const line = lines[i] ?? "";
		if (line === "") {
			if ((layoutLines[k]?.text ?? "") === "") {
				ranges[k] = { start: offset, end: offset };
				k++;
			}
			offset += 1;
			continue;
		}
		let pos = 0;
		let guard = 0;
		while (k < layoutLines.length && guard++ < 10000) {
			const t = layoutLines[k]?.text ?? "";
			if (t === "") {
				k++;
				continue;
			}
			const found = line.indexOf(t, pos);
			if (found === -1) break;
			ranges[k] = { start: offset + found, end: offset + found + t.length };
			pos = found + t.length;
			k++;
			if (pos >= line.length) break;
		}
		offset += line.length + 1;
	}
	return ranges;
}

function screenSelectionToEditorRange(tui, editor, bounds) {
	if (!bounds) return undefined;
	if (bounds.start.scrollView || bounds.end.scrollView) return undefined;

	const scrollOffset = editor.scrollOffset;
	const lastWidth = editor.lastWidth;
	const visible = editor.renderedVisibleLineCount;
	if (typeof scrollOffset !== "number" || typeof lastWidth !== "number" || typeof visible !== "number")
		return undefined;

	const layout = tui.currentLayout;
	const box = findComponentBox(layout?.root, editor);
	if (!box?.rect || !Array.isArray(box.lines)) return undefined;
	if (box.lines.length < visible + 2) return undefined;

	const layoutLines = editor.layoutText(lastWidth);
	if (!Array.isArray(layoutLines)) return undefined;
	const ranges = mapLayoutLinesToRanges(editor.state.lines, layoutLines);

	const paddingX = Math.min(editor.paddingX ?? 0, Math.max(0, Math.floor((box.rect.width - 1) / 2)));

	const toOffset = (point, isEnd) => {
		const lineIndex = (box.lineOffset ?? 0) + point.row - box.rect.y;
		if (lineIndex < 0) return undefined;
		let layoutIndex;
		let clamp;
		if (lineIndex === 0) {
			layoutIndex = scrollOffset;
			clamp = "start";
		} else if (lineIndex === visible + 1) {
			layoutIndex = scrollOffset + visible - 1;
			clamp = "end";
		} else if (lineIndex > visible + 1) {
			return undefined;
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
		const idx = colText >= lineWidth ? lineText.length : sliceByColumn(lineText, 0, colText, true).length;
		const included = isEnd && colText < lineWidth ? 1 : 0;
		return Math.min(range.start + idx + included, range.end);
	};

	const start = toOffset(bounds.start, false);
	const end = toOffset(bounds.end, true);
	if (start === undefined || end === undefined || end <= start) return undefined;
	return { start, end };
}

// ===========================================================================
// SELECT-ALL — MIROIR DU FUTUR CODE TS (le handler Ctrl+A)
// ===========================================================================

/**
 * Pose la sélection écran sur tout le TEXTE visible de l'éditeur.
 * Retourne true si la sélection est posée, false si rien à sélectionner
 * (éditeur vide, box introuvable) — le handler TS laissera alors le natif.
 */
function selectAllInEditor(tui, editor) {
	if (editor.getText().length === 0) return false;

	const layout = tui.currentLayout;
	const box = findComponentBox(layout?.root, editor);
	if (!box?.rect || !Array.isArray(box.lines)) return false;

	const scrollOffset = editor.scrollOffset;
	const visible = editor.renderedVisibleLineCount;
	const lastWidth = editor.lastWidth;
	if (typeof scrollOffset !== "number" || typeof visible !== "number" || typeof lastWidth !== "number")
		return false;

	const layoutLines = editor.layoutText(lastWidth);
	if (!Array.isArray(layoutLines)) return false;

	// fenêtre visible de lignes rendues
	const windowLines = layoutLines.slice(scrollOffset, scrollOffset + visible);
	// première et dernière ligne NON VIDES (pas de rows vides dans la sélection
	// : elles pollueraient le texte extrait et casseraient la conversion)
	let firstIdx = -1;
	let lastIdx = -1;
	for (let i = 0; i < windowLines.length; i++) {
		if ((windowLines[i]?.text ?? "").length > 0) {
			if (firstIdx === -1) firstIdx = i;
			lastIdx = i;
		}
	}
	if (firstIdx === -1 || lastIdx === -1) return false;

	const paddingX = Math.min(editor.paddingX ?? 0, Math.max(0, Math.floor((box.rect.width - 1) / 2)));
	const x = box.rect.x + paddingX;

	tui.selectionAnchor = { row: box.rect.y + 1 + firstIdx, col: x };
	tui.selectionFocus = {
		row: box.rect.y + 1 + lastIdx,
		col: x + visibleWidth(windowLines[lastIdx].text),
		boundary: true,
	};
	tui.selectionGranularity = "character";
	tui.selectionInitialRange = undefined;
	tui.requestRender();
	return true;
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
		id: "S1",
		label: "3 lignes courtes (tout tient) — test d'or : geo = {0, len}",
		text: ["premiere ligne", "deuxieme ligne", "troisieme ligne"].join("\n"),
		expected: (text) => ({ start: 0, end: text.length }),
	},
	{
		id: "S2",
		label: "Soft-wrap (ligne longue) — le tout sélectionné reste propre",
		text: ["premiere ligne", LONG_LINE, "troisieme ligne"].join("\n"),
		expected: (text) => ({ start: 0, end: text.length }),
	},
	{
		id: "S3",
		label: "Éditeur VIDE — le handler doit refuser (pas de sélection posée)",
		text: "",
		expected: () => undefined,
	},
	{
		id: "S4",
		label: "Éditeur scrollé (15 lignes, ~6 visibles) — sélection = fenêtre visible",
		text: MANY_LINES,
		scrollToEnd: true,
		expectedRange: (tui, editor) => {
			// attendu indépendant : slice logique couvrant la fenêtre visible
			const layoutLines = editor.layoutText(editor.lastWidth);
			const ranges = mapLayoutLinesToRanges(editor.state.lines, layoutLines);
			const a = ranges[editor.scrollOffset];
			const b = ranges[editor.scrollOffset + editor.renderedVisibleLineCount - 1];
			if (!a || !b) return undefined;
			return { start: a.start, end: b.end };
		},
	},
	{
		id: "S5",
		label: "paddingX=2 — le calcul de colonne doit compenser",
		text: ["premiere ligne", "deuxieme ligne"].join("\n"),
		paddingX: 2,
		expected: (text) => ({ start: 0, end: text.length }),
	},
	{
		id: "S6",
		label: "Sélection TRANSCRIPT préexistante — le select-all la remplace (éditeur)",
		text: ["premiere ligne", "deuxieme ligne"].join("\n"),
		fillTranscript: true,
		presetTranscriptSelection: true,
		expected: (text) => ({ start: 0, end: text.length }),
	},
];

function runCase(c) {
	const { tui, editor, chatContainer } = buildTui(c.paddingX ?? 0);
	editor.setText(c.text);
	if (c.fillTranscript) {
		chatContainer.addChild({
			render: (width) => ["TRANSCRIPT contenu HORS EDITEUR pour test"].map((l) => l.slice(0, width)),
		});
	}
	tui.renderNow();

	if (c.scrollToEnd) {
		editor.state.cursorLine = 14;
		editor.state.cursorCol = 5;
		tui.renderNow(); // scroll : le bas du texte est visible
	}

	if (c.presetTranscriptSelection) {
		// sélection transcript posée à la main (comme un drag) — le select-all doit la remplacer
		tui.selectionAnchor = { row: 1, col: 0 };
		tui.selectionFocus = { row: 2, col: 5, boundary: true };
		tui.requestRender();
	}

	const posed = selectAllInEditor(tui, editor);
	const bounds = posed ? tui.getSelectionBounds() : undefined;
	const geo = screenSelectionToEditorRange(tui, editor, bounds);
	const natif = posed ? tui.getActiveSelectionText() : undefined;
	const expected = c.expectedRange ? c.expectedRange(tui, editor) : c.expected(editor.getText());
	const pass = JSON.stringify(geo) === JSON.stringify(expected);

	// cohérence pipeline aval : suppression miroir de deleteScreenSelection (v1.3)
	let deleteAllOk = null;
	if (geo && geo.start === 0 && geo.end === editor.getText().length) deleteAllOk = true;
	else if (geo) deleteAllOk = false;

	return { c, posed, bounds, geo, natif, expected, pass, deleteAllOk };
}

console.log("==========================================================================");
console.log(`LABO — Ctrl+A select-all champ de saisie (F-09) — ${COLS}x${ROWS}`);
console.log("==========================================================================\n");

let passed = 0;
let total = 0;
for (const c of CASES) {
	const r = runCase(c);
	total++;
	if (r.pass) passed++;
	console.log(`--- ${r.c.id} : ${r.c.label}`);
	console.log(
		`    posée        : ${r.posed ? "oui" : "non (refus — natif laissé)"} ${["S3"].includes(r.c.id) ? (!r.posed ? "✅" : "❌") : r.posed ? "✅" : "❌"}`,
	);
	console.log(`    geo          : ${r.geo ? JSON.stringify(r.geo) : "(undefined)"} — attendu ${JSON.stringify(r.expected)} ${r.pass ? "✅" : "❌ MISMATCH"}`);
	if (r.deleteAllOk !== null && r.c.id !== "S4")
		console.log(`    delete-all   : la couverture {0..len} est ${r.deleteAllOk ? "✅ complète" : "❌ partielle"}`);
	else if (r.c.id === "S4") console.log(`    delete-all   : n/a — cas scrollé, couverture visible seule (limite F-06 assumée)`);
	if (r.c.id === "S1" && r.natif !== undefined)
		console.log(`    natif extrait: ${JSON.stringify(r.natif)}`);
	console.log();
}

console.log("==========================================================================");
console.log(`RÉSULTAT : ${passed}/${total} cas conformes`);
console.log("==========================================================================");
