/**
 * Labo — frappe remplace la sélection écran (v1.5, fix 2).
 *
 * Bug : avec une sélection écran dans l'éditeur, taper un caractère l'insérait
 * DEVANT la sélection (pi ne connaît pas la sélection écran — c'est un état
 * renderer). Convention GUI : la frappe REMPLACE la sélection.
 *
 * Fix testé ici (miroir MyPiEditor.handleInput v1.5) : si l'entrée est
 * insérable (même seuil que le fallback d'insertion de pi : kitty CSI-u
 * imprimable ou charCodeAt(0) >= 32, hors séquences ESC, plus Entrée) ET la
 * sélection appartient à l'éditeur → suppression géométrique d'abord (v1.3,
 * posée le curseur à range.start), puis insertion native par super.
 *
 * Pipeline réel : TuiAltScreen + Editor dans le dock, drag souris SGR.
 *
 * Usage : node dev/lab-replace-selection.mjs
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

const { decodeKittyPrintable } = await import(pathToFileURL(`${PI_TUI}/keys.js`).href);

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

const editorTheme = {
	borderColor: (t) => t,
	selectList: {
		selectedPrefix: (t) => t,
		selectedText: (t) => t,
		description: (t) => t,
		scrollInfo: (t) => t,
		noMatch: (t) => t,
	},
};

function buildTui() {
	const terminal = makeFakeTerminal();
	const tui = new TuiAltScreen(terminal, false, undefined, { copyOnSelect: false });
	const editor = new Editor(tui, editorTheme, { paddingX: 0 });

	const chatContainer = new Container();
	chatContainer.addChild({
		render: (width) => ["TRANSCRIPT contenu HORS EDITEUR pour test"].map((l) => l.slice(0, width)),
	});

	const editorContainer = new Container();
	editorContainer.addChild(editor);

	const transcript = new ScrollView(chatContainer, { follow: "end", primary: true });
	tui.layoutRoot = new VStack([
		{ component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: editorContainer, basis: "auto", grow: 0, shrink: 1, minSize: 3 },
	]);
	tui.start();
	return { tui, editor };
}

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

function dragWords(tui, fromNeedle, toNeedle) {
	const from = locate(tui, fromNeedle);
	const toStart = locate(tui, toNeedle);
	if (!from || !toStart) throw new Error(`repères introuvables: ${fromNeedle}, ${toNeedle}`);
	const to = { row: toStart.row, col: toStart.col + toNeedle.length - 1 };
	tui.handleTerminalInput(`\x1b[<0;${from.col + 1};${from.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<32;${to.col + 1};${to.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<0;${to.col + 1};${to.row + 1}m`);
	return { fromNeedle, toNeedle };
}

// ===========================================================================
// MIROIRS (keybinds.ts v1.3 validé + v1.5)
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

	const box = findComponentBox(tui.currentLayout?.root, editor);
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

/** deleteScreenSelection : chemin géométrique + curseur posé (setTextAndCursor). */
function deleteScreenSelectionMirror(tui, editor) {
	const bounds = tui.getSelectionBounds();
	if (!bounds) return false;
	if (bounds.start.scrollView || bounds.end.scrollView) {
		tui.clearTextSelection?.();
		tui.requestRender();
		return false;
	}
	const range = screenSelectionToEditorRange(tui, editor, bounds);
	if (!range) {
		tui.clearTextSelection?.();
		tui.requestRender();
		return false;
	}
	const text = editor.getText();
	const after = text.slice(0, range.start) + text.slice(range.end);
	editor.setText(after);
	const state = editor.state;
	let remaining = Math.max(0, Math.min(range.start, after.length));
	let line = 0;
	while (line < state.lines.length && remaining > state.lines[line].length) {
		remaining -= state.lines[line].length + 1;
		line++;
	}
	state.cursorLine = line;
	if (typeof editor.setCursorCol === "function") editor.setCursorCol(remaining);
	else state.cursorCol = remaining;
	tui.clearTextSelection?.();
	tui.requestRender();
	return true;
}

/** Miroir replacesScreenSelection (v1.5). */
function replacesScreenSelection(tui, editor, data) {
	const insertable =
		decodeKittyPrintable(data) !== undefined ||
		(data.length > 0 && !data.includes("\x1b") && (data.charCodeAt(0) >= 32 || data === "\r"));
	if (!insertable) return false;
	const bounds = tui.getSelectionBounds();
	if (!bounds || bounds.start.scrollView || bounds.end.scrollView) return false;
	return screenSelectionToEditorRange(tui, editor, bounds) !== undefined;
}

/** Miroir MyPiEditor.handleInput (parties sélection ; sans cut/redo ici). */
function editorHandleInputV15(tui, editor, data) {
	if ((data === "\x7f" || data === "\x1b[3~") && deleteScreenSelectionMirror(tui, editor)) {
		// backspace/delete : consommé si sélection éditeur
		return;
	}
	if (replacesScreenSelection(tui, editor, data)) {
		deleteScreenSelectionMirror(tui, editor);
	}
	editor.handleInput(data);
}

// ===========================================================================
// CAS DE TEST
// ===========================================================================

const TEXT = "premiere ligne de test\nligne longue qui depasse largement la largeur de l'editeur et sera wrappee par le layout\nligne trois";

const CASES = [
	{
		id: "R1",
		label: "frappe « X » sur sélection au milieu d'une ligne → remplacement",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne de test", "ligne de test"); // sélection d'un mot ligne 1
			editorHandleInputV15(tui, editor, "X");
		},
		expected: (before) => before.replace("premiere ligne de test", "premiere X"),
	},
	{
		id: "R2",
		label: "frappe « X » sur sélection multi-lignes (à travers le soft-wrap) → remplacement",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne longue", "wrappee"); // sélection à travers le wrap
			editorHandleInputV15(tui, editor, "X");
		},
		expected: (before) => {
			const a = before.indexOf("ligne longue");
			const b = before.indexOf("wrappee") + "wrappee".length;
			return before.slice(0, a) + "X" + before.slice(b);
		},
	},
	{
		id: "R3",
		label: "Entrée « \\r » sur sélection → sélection supprimée puis submit (Entrée = touche d'envoi)",
		setup: (tui, editor) => {
			let submitted;
			editor.onSubmit = (v) => (submitted = v);
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne de test", "ligne de test");
			editorHandleInputV15(tui, editor, "\r");
			return { submitted };
		},
		// submitValue vide l'éditeur après onSubmit — le texte AVANT vidage est dans `submitted`.
		// Entrée ne s'insère pas : la sélection est supprimée, le texte restant est soumis.
		expected: () => "",
		submitOf: (before) => before.replace("premiere ligne de test", "premiere "),
	},
	{
		id: "R4",
		label: "flèche droite (séquence ESC) → PAS de remplacement",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne de test", "ligne de test");
			editorHandleInputV15(tui, editor, "\x1b[C");
		},
		expected: (before) => before, // texte inchangé
	},
	{
		id: "R5",
		label: "frappe « X » avec sélection TRANSCRIPT → pas de suppression, frappe au curseur (natif conservé)",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "TRANSCRIPT contenu", "EDITEUR");
			editorHandleInputV15(tui, editor, "X");
		},
		// Le X s'insère au curseur (fin d'éditeur) mais AUCUN texte n'est supprimé :
		// la sélection transcript ne doit jamais déclencher la suppression éditeur.
		expected: (before) => before + "X",
	},
	{
		id: "R6",
		label: "frappe « X » SANS sélection → insertion normale au curseur (pas de régression)",
		setup: (tui, editor) => {
			editor.setText("abc");
			tui.renderNow();
			editor.state.cursorLine = 0;
			editor.setCursorCol(1);
			tui.renderNow();
			editorHandleInputV15(tui, editor, "X");
		},
		expected: () => "aXbc",
	},
	{
		id: "R7",
		label: "kitty CSI-u press « \\x1b[120u » (=x) sur sélection → remplacement",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne de test", "ligne de test");
			editorHandleInputV15(tui, editor, "\x1b[120u");
		},
		expected: (before) => before.replace("premiere ligne de test", "premiere x"),
	},
	{
		id: "R7b",
		label: "kitty CSI-u release « \\x1b[120;;u » → rien (pi l'ignore aussi — miroir fidèle)",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne de test", "ligne de test");
			editorHandleInputV15(tui, editor, "\x1b[120;;u");
		},
		expected: (before) => before, // ni suppression ni insertion (decodeKittyPrintable = undefined, fallback ESC exclu)
	},
	{
		id: "R8",
		label: "backspace sur sélection → suppression simple (contrôle v1.3)",
		setup: (tui, editor) => {
			editor.setText(TEXT);
			tui.renderNow();
			dragWords(tui, "ligne de test", "ligne de test");
			editorHandleInputV15(tui, editor, "\x7f");
		},
		expected: (before) => before.replace("premiere ligne de test", "premiere "),
	},
];

let passed = 0;
let total = 0;
console.log("==========================================================================");
console.log(`LABO — frappe remplace la sélection (v1.5) — ${COLS}x${ROWS}`);
console.log("==========================================================================\n");
for (const c of CASES) {
	total++;
	const { tui, editor } = buildTui();
	const before = TEXT;
	let extra;
	try {
		extra = c.setup(tui, editor) ?? {};
	} catch (e) {
		console.log(`--- ${c.id} : ${c.label}`);
		console.log(`    ❌ ERREUR: ${e.message}\n`);
		continue;
	}
	const after = editor.getText();
	const expected = c.expected(before);
	const ok = after === expected;
	if (ok) passed++;
	console.log(`--- ${c.id} : ${c.label}`);
	console.log(`    attendu : ${JSON.stringify(expected)}`);
	console.log(`    obtenu  : ${JSON.stringify(after)} ${ok ? "✅" : "❌ MISMATCH"}`);
	if (c.submitOf) {
		const okSubmit = extra.submitted === c.submitOf(before);
		total++;
		if (okSubmit) passed++;
		console.log(`    submit  : ${JSON.stringify(extra.submitted)} ${okSubmit ? "✅" : `❌ attendu ${JSON.stringify(c.submitOf(before))}`}`);
	}
	console.log();
}
console.log("==========================================================================");
console.log(`RÉSULTAT : ${passed}/${total} cas conformes`);
console.log("==========================================================================");
