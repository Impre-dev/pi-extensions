#!/usr/bin/env node
/**
 * use-art — remplace le pixel art du hub en une commande.
 *
 * Pipeline : resize braille propre → réinjection dans session-hub.ts.
 * ART_W et le layout (listW, showArt) se recalculent automatiquement
 * depuis la constante — aucun autre fichier à toucher.
 *
 * Usage : node tools/use-art.mjs <art-braille.txt> [largeurDots=100]
 * Exemple : node tools/use-art.mjs ~/Desktop/mon-art.txt 110
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [inp, targetW = "100"] = process.argv.slice(2);
if (!inp) {
	console.error("Usage : node tools/use-art.mjs <art-braille.txt> [largeurDots=100]");
	process.exit(1);
}

// 1. Resize vers un fichier de travail
const tmp = join(here, "..", "dev", "art-new.txt");
execFileSync(process.execPath, [join(here, "braille-resize.mjs"), inp, tmp, String(targetW)], { stdio: "inherit" });

// 2. Lecture + génération du bloc TS
const lines = readFileSync(tmp, "utf8")
	.replace(/\r/g, "")
	.split("\n")
	.filter((l) => l.trim().length > 0)
	.map((l) => `\t\t"${l}",`);
const block = `const ART_LINES: string[] = [\n${lines.join("\n")}\n];`;

// 3. Injection dans session-hub.ts (remplace le tableau entier)
const tsPath = join(here, "..", "session-hub.ts");
let code = readFileSync(tsPath, "utf8");
const re = /const ART_LINES: string\[\] = \[\n[\s\S]*?\n\];/;
if (!re.test(code)) {
	console.error("Bloc ART_LINES introuvable dans session-hub.ts");
	process.exit(1);
}
code = code.replace(re, block);
writeFileSync(tsPath, code);

console.log(`Art remplacé : ${lines.length} lignes — tsc + sync install pour valider.`);
