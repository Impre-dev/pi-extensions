/**
 * Labo — BUG v1.3 : sélection écran + flèches (viewport bougé) → conversion fausse.
 *
 * Scénario terrain d'Impre : drag souris sur l'éditeur (sélection posée), puis
 * flèches clavier → cursorLine bouge → le render re-clampe scrollOffset sur le
 * curseur → previousScreen est décalée → les rows figées de la sélection
 * désignent un AUTRE contenu → Suppr/copier partent sur les mauvais offsets.
 *
 * Chaîne validée en source pi-tui :
 *  - tui.js route les touches au focusedComponent sans consulter selectionPressActive
 *  - Editor.render() clamp scrollOffset sur cursorLine (l.404-416)
 *  - selectionAnchor/Focus = {row,col} écran, jamais réévalués
 *
 * Repro attendu + deux primitives de correction candidates :
 *  - PRIMITIVE 1 (exactitude) : relire les rows CAPTURÉES avec le scrollOffset
 *    de capture → toujours vrai (les bornes étaient visibles à la capture).
 *  - PRIMITIVE 2 (affichage, bornes restant dans la box) : rows − delta dans
 *    la frame courante → suit le contenu. Hors box → offsets figés (v1.4).
 *
 * Usage : node dev/lab-arrows.mjs
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
		start(onInput) {
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

/** Drag SGR du 1er caractère de fromNeedle au DERNIER caractère de toNeedle, SANS release. */
function dragWordsHeld(tui, fromNeedle, toNeedle) {
	const from = locate(tui, fromNeedle);
	const toStart = locate(tui, toNeedle);
	if (!from || !toStart) throw new Error(`repères introuvables: ${fromNeedle}, ${toNeedle}`);
	const to = { row: toStart.row, col: toStart.col + toNeedle.length - 1 };
	tui.handleTerminalInput(`\x1b[<0;${from.col + 1};${from.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<32;${to.col + 1};${to.row + 1}M`);
	return { from, to };
}

// ===========================================================================
// CONVERSION GÉOMÉTRIQUE v1.3 — miroir exact de keybinds.ts (frame courante)
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

/** v1.3 telle quelle : lit la frame COURANTE (scrollOffset/box actuels). */
function screenSelectionToEditorRange(tui, editor, bounds) {
	return convertWithScroll(tui, editor, bounds, editor.scrollOffset);
}

/**
 * Variante laboratoire : convertit des bornes avec un scrollOffset IMPOSÉ.
 * C'est le banc d'essai des primitives : PRIMITIVE 1 passe scrollBefore
 * (frame de capture), PRIMITIVE 2 passe scrollAfter avec rows re-mappées.
 */
function convertWithScroll(tui, editor, bounds, scrollOffsetOverride) {
	if (!bounds) return undefined;
	if (bounds.start.scrollView || bounds.end.scrollView) return undefined;

	const scrollOffset = scrollOffsetOverride;
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
		if (lineIndex <= 0) return undefined; // topBorder/hors box : frame IMPOSÉE → refus
		let layoutIndex;
		if (lineIndex === visible + 1) {
			layoutIndex = scrollOffset + visible - 1;
			const range = ranges[layoutIndex];
			return range ? range.end : undefined;
		}
		if (lineIndex > visible + 1) return undefined;
		layoutIndex = scrollOffset + (lineIndex - 1);
		const range = ranges[layoutIndex];
		if (!range) return undefined;
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
// SCÉNARIOS
// ===========================================================================

const MANY_LINES = Array.from(
	{ length: 15 },
	(_, i) => `ligne numero ${String(i + 1).padStart(2, "0")} courte`,
).join("\n");

const results = [];
function report(id, label, ok, details) {
	results.push({ id, label, ok, details });
}

/**
 * Scénario : drag posé (maintenu, SANS release), puis flèches (chacune
 * suivie d'un render — le TUI réel rend à chaque frame), mesures.
 */
function runArrowScenario({ text, cursorLine, fromNeedle, toNeedle, arrows }) {
	const { tui, editor } = buildTui(0);
	editor.setText(text);
	editor.state.cursorLine = cursorLine;
	editor.state.cursorCol = 0;
	tui.renderNow();
	tui.setFocus(editor); // le vrai TUI : l'éditeur a le focus de typing

	// 1) drag posé (maintenu — le terrain garde le clic enfoncé)
	const markers = dragWordsHeld(tui, fromNeedle, toNeedle);
	const boundsBefore = tui.getSelectionBounds();
	const scrollBefore = editor.scrollOffset;
	const cursorBefore = editor.state.cursorLine;

	// 2) flèches — le TUI réel rend après chaque input
	for (const key of arrows) {
		tui.handleTerminalInput(key);
		tui.renderNow();
	}

	const scrollAfter = editor.scrollOffset;
	const delta = scrollAfter - scrollBefore;
	const boundsAfter = tui.getSelectionBounds();
	const cursorAfter = editor.state.cursorLine;
	const textFull = editor.getText();

	// conversion v1.3 telle quelle (frame courante) — le comportement à repro
	const v13 = screenSelectionToEditorRange(tui, editor, boundsAfter);

	return {
		tui, editor, markers, boundsBefore, boundsAfter,
		scrollBefore, scrollAfter, delta, cursorBefore, cursorAfter, textFull, v13,
	};
}

/** slice attendu entre deux repères « numero XX » (lignes courtes, sans wrap). */
function sliceBetween(text, a, b) {
	return text.slice(text.indexOf(`numero ${String(a).padStart(2, "0")}`), text.indexOf(`numero ${String(b).padStart(2, "0")}`) + 9);
}

// --- A1 : contrôle SANS flèches (la conversion v1.3 doit rester juste) -------
{
	const r = runArrowScenario({ text: MANY_LINES, cursorLine: 0, fromNeedle: "numero 03", toNeedle: "numero 05", arrows: [] });
	const expected = sliceBetween(r.textFull, 3, 5);
	const got = r.v13 ? r.textFull.slice(r.v13.start, r.v13.end) : undefined;
	report(
		"A1",
		"contrôle : drag sans flèches → v1.3 juste (le bug nécessite le mouvement)",
		r.delta === 0 && got === expected,
		[
			`extrait : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
		],
	);
}

// --- A2 : 3× flèche BAS, curseur reste dans le viewport → pas de scroll ------
{
	const r = runArrowScenario({
		text: MANY_LINES, cursorLine: 0, fromNeedle: "numero 03", toNeedle: "numero 05",
		arrows: ["\x1b[B", "\x1b[B", "\x1b[B"],
	});
	const expected = sliceBetween(r.textFull, 3, 5);
	const got = r.v13 ? r.textFull.slice(r.v13.start, r.v13.end) : undefined;
	report(
		"A2",
		"3× ↓ curseur reste visible : delta 0, v1.3 juste",
		r.delta === 0 && got === expected,
		[
			`cursorLine : ${r.cursorBefore} → ${r.cursorAfter} ; scrollOffset : ${r.scrollBefore} → ${r.scrollAfter}`,
			`extrait : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
		],
	);
}

// --- A3 : LE BUG — flèches sortent le curseur sous le viewport ---------------
{
	const r = runArrowScenario({
		text: MANY_LINES, cursorLine: 0, fromNeedle: "numero 02", toNeedle: "numero 04",
		arrows: Array.from({ length: 10 }, () => "\x1b[B"), // ↓×10 → cursorLine 10 → clamp scroll
	});
	const expected = sliceBetween(r.textFull, 2, 4);
	const got = r.v13 ? r.textFull.slice(r.v13.start, r.v13.end) : undefined;
	const shifted = r.delta > 0 ? sliceBetween(r.textFull, 2 + r.delta, 4 + r.delta) : undefined;
	report(
		"A3",
		`REPRO BUG : ↓×10 → delta scroll ${r.delta} → v1.3 lit le contenu décalé`,
		r.delta > 0 && got !== undefined && got !== expected && got === shifted,
		[
			`cursorLine : ${r.cursorBefore} → ${r.cursorAfter} ; scrollOffset : ${r.scrollBefore} → ${r.scrollAfter} (delta ${r.delta})`,
			`v1.3 lit : ${JSON.stringify(got)} — devrait lire ${JSON.stringify(expected)}`,
			r.delta > 0 && got === shifted ? `❌ confirmé : décalé de ${r.delta} ligne(s) viewport` : "à examiner",
		],
	);
}

// --- A4 : PRIMITIVE 1 — rows capturées + scrollOffset de capture -------------
{
	const r = runArrowScenario({
		text: MANY_LINES, cursorLine: 0, fromNeedle: "numero 02", toNeedle: "numero 04",
		arrows: Array.from({ length: 10 }, () => "\x1b[B"),
	});
	const expected = sliceBetween(r.textFull, 2, 4);
	// reconstruction : mêmes rows, frame de capture (scrollBefore)
	const c = convertWithScroll(r.tui, r.editor, r.boundsAfter, r.scrollBefore);
	const got = c ? r.textFull.slice(c.start, c.end) : undefined;
	report(
		"A4",
		"PRIMITIVE 1 : rows capturées + scroll de capture → vérité (même bornes sorties du viewport)",
		got === expected,
		[
			`delta viewport : ${r.delta} ; bornes origine ${JSON.stringify(r.boundsBefore?.start)}, ${JSON.stringify(r.boundsBefore?.end)}`,
			`reconstruction : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
		],
	);
}

// --- A5 : PRIMITIVE 2 — rows − delta dans la frame courante (bornes in-box) --
{
	const r = runArrowScenario({
		text: MANY_LINES, cursorLine: 8, fromNeedle: "numero 05", toNeedle: "numero 07",
		arrows: ["\x1b[B", "\x1b[B", "\x1b[B"], // ↓×3 → cursorLine 11 → clamp scroll +3
	});
	const expected = sliceBetween(r.textFull, 5, 7);
	// re-map affichage : le contenu monte de `delta` rows quand on scrolle bas
	const remapped = {
		start: { ...r.boundsAfter.start, row: r.boundsAfter.start.row - r.delta },
		end: { ...r.boundsAfter.end, row: r.boundsAfter.end.row - r.delta },
	};
	const c = convertWithScroll(r.tui, r.editor, remapped, r.scrollAfter);
	const got = c ? r.textFull.slice(c.start, c.end) : undefined;
	const v13got = r.v13 ? r.textFull.slice(r.v13.start, r.v13.end) : undefined;
	report(
		"A5",
		`PRIMITIVE 2 : rows−${r.delta} frame courante → suit le contenu (bornes re-restées dans la box)`,
		got === expected,
		[
			`scrollOffset : ${r.scrollBefore} → ${r.scrollAfter} (delta ${r.delta})`,
			`v1.3 brute lit : ${JSON.stringify(v13got)} (faux)`,
			`re-mappé lit : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
		],
	);
}

// --- A6 : scroll HAUT (↑×12 depuis le bas) — repro miroir --------------------
{
	const r = runArrowScenario({
		text: MANY_LINES, cursorLine: 14, fromNeedle: "numero 11", toNeedle: "numero 13",
		arrows: Array.from({ length: 12 }, () => "\x1b[A"), // ↑×12 → cursorLine 2 → clamp scroll haut
	});
	const expected = sliceBetween(r.textFull, 11, 13);
	const got = r.v13 ? r.textFull.slice(r.v13.start, r.v13.end) : undefined;
	// PRIMITIVE 1 en miroir
	const c = convertWithScroll(r.tui, r.editor, r.boundsAfter, r.scrollBefore);
	const reconstructed = c ? r.textFull.slice(c.start, c.end) : undefined;
	report(
		"A6",
		`↑×12 depuis le bas : delta ${r.delta} → v1.3 décalée + PRIMITIVE 1 vraie`,
		r.delta < 0 && got !== expected && reconstructed === expected,
		[
			`cursorLine : ${r.cursorBefore} → ${r.cursorAfter} ; scrollOffset : ${r.scrollBefore} → ${r.scrollAfter} (delta ${r.delta})`,
			`v1.3 lit : ${JSON.stringify(got)} — devrait lire ${JSON.stringify(expected)}`,
			`reconstruction (P1) : ${JSON.stringify(reconstructed)}`,
		],
	);
}

console.log("=".repeat(74));
console.log(`LABO flèches — bug v1.3 sélection+viewport — ${COLS}x${ROWS}, 15 lignes`);
console.log("=".repeat(74));
for (const r of results) {
	console.log(`\n--- ${r.id} : ${r.label} ${r.ok ? "✅" : "❌"}`);
	for (const d of r.details) console.log(`    ${d}`);
}
const nOk = results.filter((r) => r.ok).length;
console.log(`\nRÉSULTAT : ${nOk}/${results.length} scénarios`);
