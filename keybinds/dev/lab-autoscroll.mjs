/**
 * Labo — autoscroll éditeur : drag aux bords + molette pendant le drag.
 *
 * Pipeline réel : TuiAltScreen + Editor dans le dock (createChatViewport),
 * drag souris SGR simulé, ticks d'autoscroll déclenchés manuellement
 * (déterministes), wrappers installés comme le futur code TS.
 *
 * Usage : node dev/lab-autoscroll.mjs
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
const WHEEL_LINES = 1; // lignes par cran de molette sur l'éditeur

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

// ===========================================================================
// GÉOMÉTRIE (partagée avec lab-selection.mjs / v1.3)
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

/**
 * Conversion v1.3 étendue : les bornes sorties de l'écran par le scroll
 * (lineIndex < 0 ou > visible+1) sont relues depuis les offsets figés.
 */
function screenSelectionToEditorRange(tui, editor, bounds, frozen) {
	if (!bounds) return undefined;
	if (bounds.start.scrollView || bounds.end.scrollView) return undefined;

	const scrollOffset = editor.scrollOffset;
	const lastWidth = editor.lastWidth;
	const visible = editor.renderedVisibleLineCount;
	if (typeof scrollOffset !== "number" || typeof lastWidth !== "number" || typeof visible !== "number")
		return undefined;

	const layout = tui.currentLayout;
	const box = findComponentBox(layout?.root, editor);
	const rect = box?.rect;
	if (!rect || !Array.isArray(box.lines)) return undefined;
	if (box.lines.length < visible + 2) return undefined;

	const layoutLines = editor.layoutText(lastWidth);
	if (!Array.isArray(layoutLines)) return undefined;
	const ranges = mapLayoutLinesToRanges(editor.state.lines, layoutLines);

	const paddingX = Math.min(editor.paddingX ?? 0, Math.max(0, Math.floor((rect.width - 1) / 2)));

	const toOffset = (point, isEnd) => {
		const lineIndex = (box.lineOffset ?? 0) + point.row - rect.y;
		if (lineIndex < 0 || lineIndex > visible + 1 || lineIndex === visible + 1) {
			// Hors contenu ou bottomBorder : offset figé au moment de la sortie,
			// sinon clamps aux extrémités visibles (drag sans scroll).
			const v = isEnd ? frozen?.end : frozen?.start;
			if (typeof v === "number") return v;
			if (lineIndex < 0) return ranges[scrollOffset]?.start;
			return ranges[scrollOffset + visible - 1]?.end;
		}
		if (lineIndex === 0) {
			// TopBorder : la borne y est clampée (wrapper/wheel) → elle désigne le
			// début du contenu visible COURANT (jamais le frozen ici).
			return ranges[scrollOffset]?.start;
		}
		const layoutIndex = scrollOffset + (lineIndex - 1);
		const range = ranges[layoutIndex];
		if (!range) return undefined;
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
 * Wrappers autoscroll — miroir exact du futur code TS. Installés sur
 * l'instance TuiAltScreen (délégation prototype hors de notre cas).
 */
function moveCursorToOffset(editor, offset) {
	const text = editor.getText();
	const lines = editor.state.lines;
	let remaining = Math.max(0, Math.min(offset, text.length));
	let line = 0;
	while (line < lines.length && remaining > lines[line].length) {
		remaining -= lines[line].length + 1;
		line++;
	}
	editor.state.cursorLine = line;
	editor.state.cursorCol = Math.max(0, remaining);
}

function caretOffsetOf(editor) {
	const st = editor.state;
	let off = 0;
	for (let i = 0; i < st.cursorLine; i++) off += (st.lines[i] ?? "").length + 1;
	return off + st.cursorCol;
}

function installEditorScrollExtensions(tui, editor) {
	if (tui.__editorScrollExt) return;
	tui.__editorScrollExt = true;

	const proto = Object.getPrototypeOf(tui);
	const origUpdateFocus = proto.updateSelectionFocus;
	const origUpdate = proto.updateSelectionAutoScroll;
	const origTick = proto.autoScrollSelection;
	const origRouteWheel = proto.routeWheel;
	const origStop = proto.stopSelectionAutoScroll;

	/** Offsets logiques figés quand une borne quitte l'écran pendant le scroll. */
	const frozen = { start: undefined, end: undefined };
	editor.frozenSelection = frozen;
	/** Suivi de session de drag (invalide le frozen à chaque nouveau drag). */
	let dragSession = false;
	/** Scroll cumulé depuis le press — ≠ 0 : le focus natif est obsolète. */
	let dragScrollDelta = 0;

	const editorBox = () => findComponentBox(tui.currentLayout?.root, editor);
	const visibleCount = () => editor.renderedVisibleLineCount;
	const maxVisible = () => Math.max(5, Math.floor(tui.terminal.rows * 0.3));

	// Motions/release d'un drag éditeur : pi re-projète le focus au point BRUT
	// (coords écran) — après un scroll, ce point ne désigne plus le bon contenu.
	// Si notre scroll a bougé les bornes (dragScrollDelta ≠ 0), on IGNORE la
	// re-projection : le focus est géré par nos ticks (re-mappé + clampé).
	// Sinon (pas de scroll) : comportement natif, clampé à la box par sûreté.
	// Fin de session au release (selectionPressActive déjà false à cet appel).
	tui.updateSelectionFocus = function (point) {
		const isEditorDrag = this.selectionAnchor && !this.selectionAnchor.scrollView;
		if (!this.selectionPressActive) {
			dragSession = false;
			if (isEditorDrag && dragScrollDelta !== 0) {
				dragScrollDelta = 0;
				return undefined; // le focus re-mappé par nos ticks fait foi
			}
		} else if (isEditorDrag && dragSession && dragScrollDelta !== 0) {
			return undefined; // motion pendant drag scrollé : nos ticks pilotent
		}
		if (isEditorDrag && this.selectionPressActive) {
			const box = editorBox();
			const rect = box?.rect;
			if (rect) {
				const clamped = { ...point, row: Math.max(rect.y, Math.min(rect.y + rect.height - 1, point.row)) };
				return origUpdateFocus.call(this, clamped);
			}
		}
		return origUpdateFocus.call(this, point);
	};

	const editorScrollBy = (delta, extendMode) => {
		const box = editorBox();
		const rect = box?.rect;
		if (!rect) return 0;
		const layoutLinesArr = editor.layoutText(editor.lastWidth);
		if (!Array.isArray(layoutLinesArr)) return 0;
		const ranges = mapLayoutLinesToRanges(editor.state.lines, layoutLinesArr);
		const visible = visibleCount();
		const oldOffset = editor.scrollOffset;
		const maxOffset = Math.max(0, layoutLinesArr.length - maxVisible());
		const newOffset = Math.max(0, Math.min(maxOffset, oldOffset + delta));
		const applied = newOffset - oldOffset;
		if (applied === 0) return 0;

		const vTop = Math.max(0, rect.y, box.clip?.y ?? 0);
		const vBottom = Math.min(
			tui.terminal.rows - 1,
			rect.y + rect.height - 1,
			(box.clip?.y ?? 0) + (box.clip?.height ?? 0) - 1,
		);
		const paddingX = Math.min(editor.paddingX ?? 0, Math.max(0, Math.floor((rect.width - 1) / 2)));
		const lineIndexOf = (point) => (box.lineOffset ?? 0) + point.row - rect.y;
		const offsetAt = (point, isEnd, baseOffset, lineIdx) => {
			let layoutIndex;
			let clamp;
			if (lineIdx === 0) {
				// TopBorder : fige le contenu du bord + la colonne d'origine.
				layoutIndex = baseOffset;
			} else if (lineIdx === visible + 1) {
				layoutIndex = baseOffset + visible - 1;
				clamp = "end";
			} else {
				layoutIndex = baseOffset + (lineIdx - 1);
			}
			const range = ranges[layoutIndex];
			if (!range) return undefined;
			if (clamp === "end") return range.end;
			const lineText = layoutLinesArr[layoutIndex]?.text ?? "";
			const colText = Math.max(0, point.col - rect.x - paddingX);
			const lineWidth = visibleWidth(lineText);
			const idx = colText >= lineWidth ? lineText.length : sliceByColumn(lineText, 0, colText, true).length;
			const included = isEnd && colText < lineWidth ? 1 : 0;
			return Math.min(range.start + idx + included, range.end);
		};

		// Fige les bornes qui quittent le contenu visible (leur offset écran perdrait
		// tout sens) — au DERNIER état où elles étaient encore sur une ligne.
		const anchor = tui.selectionAnchor;
		const focus = tui.selectionFocus;
		const anchorIsStart =
			anchor &&
			focus &&
			(anchor.row < focus.row || (anchor.row === focus.row && anchor.col <= focus.col));
		for (const [point, isEnd] of [
			[anchor, !anchorIsStart],
			[focus, anchorIsStart],
		]) {
			if (!point) continue;
			const lineIdxOld = lineIndexOf(point);
			const lineIdxNew = lineIdxOld - applied;
			const leaves = lineIdxNew <= 0 || lineIdxNew >= visible + 1;
			if (leaves && lineIdxOld >= 1 && lineIdxOld <= visible) {
				const off = offsetAt(point, isEnd, oldOffset, lineIdxOld);
				if (typeof process.env.LAB_DEBUG === "string") {
					console.log(
						`    [freeze] point=${JSON.stringify(point)} isEnd=${isEnd} lineIdxOld=${lineIdxOld} oldOffset=${oldOffset} → off=${off}`,
					);
				}
				if (typeof off === "number") {
					const isStart = anchorIsStart === (point === anchor);
					if (isStart) frozen.start = off;
					else frozen.end = off;
				}
			}
		}

		editor.scrollOffset = newOffset;
		dragScrollDelta += applied;
		if (anchor) anchor.row -= applied;
		if (focus) {
			if (extendMode) {
				// Extrémité mobile COLLÉE au bord d'extension : le contenu sous ce
				// bord avance de `applied` par tick → la sélection s'étend d'autant.
				focus.row = applied > 0 ? vBottom : vTop;
			} else {
				focus.row -= applied;
			}
		}

		// Curseur maintenu dans le viewport (sinon le render re-clampe au curseur).
		const lo = ranges[newOffset];
		const hi = ranges[Math.min(newOffset + visible - 1, layoutLinesArr.length - 1)];
		if (extendMode) {
			moveCursorToOffset(editor, applied > 0 ? hi.end : lo.start);
		} else {
			const caret = caretOffsetOf(editor);
			if (caret < lo.start) moveCursorToOffset(editor, lo.start);
			else if (caret > hi.end) moveCursorToOffset(editor, hi.end);
		}
		return applied;
	};

	tui.updateSelectionAutoScroll = function (event) {
		if (!this.selectionAnchor?.scrollView) {
			// Premier motion d'un nouveau drag (éditeur) : le frozen précédent
			// appartient à un drag terminé → invalide, delta remis à zéro.
			if (!dragSession && this.selectionPressActive) {
				dragSession = true;
				dragScrollDelta = 0;
				frozen.start = undefined;
				frozen.end = undefined;
			}
		}
		if (this.selectionAnchor?.scrollView) return origUpdate.call(this, event);
		const box = editorBox();
		const rect = box?.rect;
		if (!rect) return;
		const vTop = Math.max(0, rect.y, box.clip?.y ?? 0);
		const vBottom = Math.min(
			tui.terminal.rows - 1,
			rect.y + rect.height - 1,
			(box.clip?.y ?? 0) + (box.clip?.height ?? 0) - 1,
		);
		this.selectionDragPointer = { x: event.x, y: event.y };
		this.selectionAutoScrollDirection = event.y <= vTop ? -1 : event.y >= vBottom ? 1 : 0;
		if (this.selectionAutoScrollDirection === 0) {
			origStop.call(this);
			return;
		}
		if (this.selectionAutoScrollTimer) return;
		// LAST RESORT: drag avec souris immobile — aucun event n'arrive aux bords,
		// même pattern que le natif transcript (pi-tui tui-alt-screen.js).
		this.selectionAutoScrollTimer = setInterval(() => this.autoScrollSelection(), 50);
		this.selectionAutoScrollTimer.unref?.();
	};

	tui.autoScrollSelection = function () {
		if (this.selectionAnchor?.scrollView) return origTick.call(this);
		const direction = this.selectionAutoScrollDirection;
		if (direction === 0 || !this.selectionDragPointer || !this.selectionPressActive) {
			origStop.call(this);
			return;
		}
		const applied = editorScrollBy(direction, true);
		if (applied === 0) origStop.call(this);
		this.requestRender();
	};

	tui.routeWheel = function (event) {
		if (this.selectionPressActive && !this.selectionAnchor?.scrollView) {
			const box = editorBox();
			const rect = box?.rect;
			if (rect && event.y >= rect.y && event.y < rect.y + rect.height) {
				editorScrollBy(event.direction * WHEEL_LINES, false);
				this.requestRender();
				return;
			}
		}
		origRouteWheel.call(this, event);
	};
}

// ===========================================================================
// SCÉNARIOS — texte : 30 lignes « ligne numero XX courte »
// ===========================================================================

const MANY = Array.from({ length: 30 }, (_, i) => `ligne numero ${String(i + 1).padStart(2, "0")} courte`).join("\n");

// Attendus INDEPENDANTS de la géométrie : offsets calculés des longueurs de lignes.
function lineStart(text, logicalLine) {
	let off = 0;
	for (let i = 0; i < logicalLine; i++) off += text.indexOf("\n", off) - off + 1;
	return off;
}

function setup(message, cursorLine) {
	const { tui, editor } = buildTui(0);
	editor.setText(message);
	editor.state.cursorLine = cursorLine;
	editor.state.cursorCol = 0;
	tui.renderNow();
	installEditorScrollExtensions(tui, editor);
	return { tui, editor };
}

function invariants(tui, editor, issues) {
	const visible = editor.renderedVisibleLineCount;
	const cur = editor.state.cursorLine;
	if (cur < editor.scrollOffset || cur >= editor.scrollOffset + visible) {
		issues.push(`curseur hors viewport (line ${cur}, scroll ${editor.scrollOffset}, visible ${visible})`);
	}
	// NB : anchor/focus sortent volontairement de la box pendant l'autoscroll
	// (bornes figées) — c'est le design, pas une violation.
}

const results = [];
function report(id, label, ok, details) {
	results.push({ id, label, ok, details });
}

// --- W1 : drag vers le bord BAS + autoscroll ---------------------------------
{
	const { tui, editor } = setup(MANY, 0);
	// viewport initial : lignes logiques 0..8 (numero 01..09), box y=19..29
	const from = locate(tui, "numero 05"); // ligne logique 4, row = rect.y+5
	tui.handleTerminalInput(`\x1b[<0;${from.col + 1};${from.row + 1}M`);
	// motion au bord bas de la box (bottomBorder : y = ROWS-1), colonne 0
	tui.handleTerminalInput(`\x1b[<32;1;${ROWS}M`);
	for (let i = 0; i < 6; i++) { tui.autoScrollSelection(); console.log(`    [tick] off=${editor.scrollOffset} a=${JSON.stringify(tui.selectionAnchor)} f=${JSON.stringify(tui.selectionFocus)} frozen=${JSON.stringify(editor.frozenSelection)}`); }
	tui.handleTerminalInput(`\x1b[<0;1;${ROWS}m`);

	const text = editor.getText();
	const range = screenSelectionToEditorRange(tui, editor, tui.getSelectionBounds(), editor.frozenSelection);
	const got = range ? text.slice(range.start, range.end) : undefined;
	// Après 6 ticks : offset 6, bord bas = ligne logique 14 (fin numero 15).
	// anchor (numero 05, col 6) figé au tick 5 (lineIndex_new = 0) → start = lineStart(4)+6.
	const expected = text.slice(lineStart(text, 4) + 6, lineStart(text, 15) - 1);
	const issues = [];
	invariants(tui, editor, issues);
	const ok = got === expected && editor.scrollOffset === 6 && issues.length === 0;
	report(
		"W1",
		"drag bas + 6 ticks : étend jusqu'à numero 15, anchor figé (numero 05)",
		ok,
		[
			`scrollOffset : ${editor.scrollOffset} (attendu 6)`,
			`extrait : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
			...issues,
		],
	);
}

// --- W2 : drag vers le bord HAUT + autoscroll (borne basse figée) ------------
{
	const { tui, editor } = setup(MANY, 29);
	// viewport initial : lignes 21..29 (numero 22..30)
	const from = locate(tui, "numero 25"); // ligne logique 24
	tui.handleTerminalInput(`\x1b[<0;${from.col + 7};${from.row + 1}M`);
	// motion au bord haut (y=0), colonne 0
	tui.handleTerminalInput(`\x1b[<32;1;1M`);
	for (let i = 0; i < 6; i++) { tui.autoScrollSelection(); console.log(`    [tick] off=${editor.scrollOffset} a=${JSON.stringify(tui.selectionAnchor)} f=${JSON.stringify(tui.selectionFocus)} frozen=${JSON.stringify(editor.frozenSelection)}`); }
	tui.handleTerminalInput(`\x1b[<0;${from.col + 7};1m`);

	const text = editor.getText();
	const range = screenSelectionToEditorRange(tui, editor, tui.getSelectionBounds(), editor.frozenSelection);
	const got = range ? text.slice(range.start, range.end) : undefined;
	// offset 21-6 = 15 → focus clampé topBorder → clamp start = début ligne 15 (numero 16).
	// anchor (numero 25, col 6) sort par le bas au tick 6 → figé : lineStart(24)+6+1.
	const expected = text.slice(lineStart(text, 15), lineStart(text, 24) + 13);
	const issues = [];
	invariants(tui, editor, issues);
	const ok = got === expected && editor.scrollOffset === 15 && issues.length === 0;
	report(
		"W2",
		"drag haut + 6 ticks : étend jusqu'à numero 16, anchor bas figé (numero 25)",
		ok,
		[
			`scrollOffset : ${editor.scrollOffset} (attendu 15)`,
			`extrait : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
			...issues,
		],
	);
}

// --- W3 : molette pendant le drag (la sélection glisse) -----------------------
{
	const { tui, editor } = setup(MANY, 0);
	const from = locate(tui, "numero 04"); // ligne 3
	tui.handleTerminalInput(`\x1b[<0;${from.col + 7};${from.row + 1}M`);
	const to = locate(tui, "numero 06"); // ligne 5
	tui.handleTerminalInput(`\x1b[<32;${to.col + 7};${to.row + 1}M`);
	// 3 crans molette BAS (button 65), pointeur immobile, drag maintenu
	for (let i = 0; i < 3; i++) tui.handleTerminalInput(`\x1b[<65;${to.col + 7};${to.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<0;${to.col + 7};${to.row + 1}m`);

	const text = editor.getText();
	const range = screenSelectionToEditorRange(tui, editor, tui.getSelectionBounds(), editor.frozenSelection);
	const got = range ? text.slice(range.start, range.end) : undefined;
	// la molette défile la VUE sans changer la sélection (comportement GUI) :
	// bornes toujours lignes 3..5 ; cols réelles = SGR-1 (press/motion à from.col+7 → col 12).
	const s = lineStart(text, 3) + from.col + 6;
	const e = lineStart(text, 5) + to.col + 7;
	const expected = text.slice(s, e);
	const issues = [];
	invariants(tui, editor, issues);
	const ok = got === expected && editor.scrollOffset === 3 && issues.length === 0;
	report(
		"W3",
		"molette ×3 pendant le drag : vue défilée, sélection inchangée (04..06)",
		ok,
		[
			`scrollOffset : ${editor.scrollOffset} (attendu 3)`,
			`extrait : ${JSON.stringify(got)}`,
			`attendu : ${JSON.stringify(expected)}`,
			...issues,
		],
	);
}

// --- W4 : molette hors drag → délégation native (transcript) ------------------
{
	const { tui, editor } = setup(MANY, 0);
	const at = locate(tui, "numero 05");
	tui.handleTerminalInput(`\x1b[<64;${at.col + 1};${at.row + 1}M`); // wheel haut, pas de drag
	tui.handleTerminalInput(`\x1b[<65;${at.col + 1};${at.row + 1}M`); // wheel bas, pas de drag
	const ok = editor.scrollOffset === 0 && !tui.selectionAnchor;
	report(
		"W4",
		"molette hors drag : délégation native, l'éditeur reste intact",
		ok,
		[`éditeur.scrollOffset : ${editor.scrollOffset} (attendu 0)`, `sélection : ${JSON.stringify(tui.getSelectionBounds())}`],
	);
}

// --- W5 : bornes — ticks au-delà de la fin, stop propre ------------------------
{
	const { tui, editor } = setup(MANY, 0);
	const from = locate(tui, "numero 05");
	tui.handleTerminalInput(`\x1b[<0;${from.col + 1};${from.row + 1}M`);
	tui.handleTerminalInput(`\x1b[<32;${from.col + 7};${ROWS}M`);
	for (let i = 0; i < 100; i++) tui.autoScrollSelection();
	tui.handleTerminalInput(`\x1b[<0;${from.col + 7};${ROWS}m`);
	const text = editor.getText();
	const range = screenSelectionToEditorRange(tui, editor, tui.getSelectionBounds(), editor.frozenSelection);
	const got = range ? text.slice(range.start, range.end) : undefined;
	const maxOffset = 30 - 9;
	const expected = text.slice(lineStart(text, 4) + 6, text.length);
	const issues = [];
	invariants(tui, editor, issues);
	const ok = editor.scrollOffset === maxOffset && got === expected && issues.length === 0;
	report(
		"W5",
		`100 ticks : stop propre aux bornes (offset max ${maxOffset})`,
		ok,
		[
			`scrollOffset : ${editor.scrollOffset}`,
			`début d'extrait : ${JSON.stringify(got?.slice(0, 40))}`,
			`attendu début : ${JSON.stringify(expected.slice(0, 40))}`,
			`fin d'extrait : ${JSON.stringify(got?.slice(-30))}`,
			...issues,
		],
	);
}

console.log("==========================================================================");
console.log(`LABO autoscroll éditeur — ${COLS}x${ROWS}, 30 lignes, molette ${WHEEL_LINES} ligne/cran`);
console.log("==========================================================================\n");
for (const r of results) {
	console.log(`--- ${r.id} : ${r.label} ${r.ok ? "✅" : "❌"}`);
	for (const d of r.details) console.log(`    ${d}`);
	console.log();
}
console.log(`RÉSULTAT : ${results.filter((r) => r.ok).length}/${results.length} scénarios conformes`);
