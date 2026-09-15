/**
 * lab-xbutton.mjs — est-ce que le terminal transmet XButton1/2 en séquence souris ?
 *
 * v3 : tracking souris ?1000h (press/release) + ?1006h (SGR) uniquement —
 * SANS le ?1003h any-motion de pi (un event par mouvement de souris = flood
 * absurde, constaté v2, et sélection de la sortie impossible). Pour copier
 * malgré le tracking : maintenir Shift pendant la sélection (convention xterm,
 * supportée par WT).
 *
 * Pi note : molette (button 64+) et drag nécessitent respectivement ?1000h
 * (les releases wheel sont des press) et ?1002h — la molette passe déjà en
 * 1000h ; le drag ne nous intéresse pas ici.
 *
 * Lancer : node hub/dev/lab-xbutton.mjs   (dans Windows Terminal)
 * Puis cliquer dans la fenêtre : XButton1 (back), XButton2 (forward), clic gauche,
 * molette, drag. Esc et lettres loggent aussi. Ctrl+C pour sortir (tracking
 * désactivé proprement).
 *
 * Verdict attendu :
 *   - `\x1b[<8;x;yM|m` (press/release) → XButton1 TRANSMIS → feature jouable en natif.
 *   - clic gauche/molette loggent mais rien aux boutons latéraux → terminal muet
 *     → plan B AHK (XButton1 → Esc envoyé à WT).
 */

const ENABLE = "\x1b[?1000h\x1b[?1006h";
const DISABLE = "\x1b[?1000l\x1b[?1006l";

process.stdout.write(ENABLE);
process.on("exit", () => process.stdout.write(DISABLE));
process.on("SIGINT", () => process.exit(0));

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

function describeSgrMouse(data) {
	const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(data);
	if (!m) return undefined;
	const button = Number(m[1]);
	const action = m[4] === "m" ? "release" : "press";
	const bits = [];
	if (button & 32) bits.push("motion");
	if (button & 64) bits.push("wheel");
	if (button & 4) bits.push("shift");
	if (button & 8) bits.push("alt-bit");
	if (button & 16) bits.push("ctrl");
	return `SGR mouse button=${button} (${action}${bits.length ? ", " + bits.join("+") : ""}) @ x=${Number(m[2]) - 1} y=${Number(m[3]) - 1}`;
}

console.log("=== lab-xbutton v3 (tracking press/release + SGR, sans motion). Clique back/forward/gauche/molette. Esc, lettres. Ctrl+C sort. Shift+sélection pour copier. ===");

process.stdin.on("data", (data) => {
	const hex = [...data].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
	const sgr = describeSgrMouse(data);
	console.log(`--- chunk (${data.length} octets)`);
	console.log(`    hex  : ${hex}`);
	console.log(`    text : ${JSON.stringify(data)}`);
	if (sgr) console.log(`    >>>  : ${sgr}`);
});
