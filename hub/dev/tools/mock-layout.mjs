#!/usr/bin/env node
/**
 * mock-layout — maquette de l'écran d'accueil hub.
 * Compose l'art braille (à gauche) + la liste (à droite) et écrit
 * le résultat avec couleurs ANSI. Ouvrir avec `cat` dans un terminal.
 *
 * Usage : node mock-layout.mjs <art.txt> <out.txt> [--flat]
 *   --flat : vert uniforme (comme le header pi), sinon léger dégradé vertical
 */

import { readFileSync, writeFileSync } from "node:fs";

const [inp, outp] = process.argv.slice(2);
const flat = process.argv.includes("--flat");

// ── Palette (truecolor) ──
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
// Dégradé vertical : 3 paliers de vert (haut clair → bas profond)
const GREENS = ["\x1b[38;2;134;239;172m", "\x1b[38;2;74;222;128m", "\x1b[38;2;34;158;80m"];
const FLAT = "\x1b[1;32m"; // bold green — identique au header pi

// ── Largeur visible (ignore les séquences ANSI) ──
const visibleWidth = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
const padEndVis = (s, w) => s + " ".repeat(Math.max(0, w - visibleWidth(s)));

// ── Charge l'art, colorie ──
const artRaw = readFileSync(inp, "utf8").replace(/\r/g, "").split("\n");
while (artRaw.length && artRaw[artRaw.length - 1].trim() === "") artRaw.pop();
const artW = Math.max(...artRaw.map((l) => visibleWidth(l)));
const art = artRaw.map((l, i) => {
  const c = flat ? FLAT : GREENS[Math.min(GREENS.length - 1, Math.floor((i / artRaw.length) * GREENS.length))];
  return c + l + RESET;
});

// ── Fausse liste (contenu de démo) ──
const listW = 42;
const ACCENT = (s) => `\x1b[1;32m${s}${RESET}`;
const DIM = (s) => `\x1b[2m${s}${RESET}`;
const BOLDW = (s) => `${BOLD}${s}${RESET}`;
const list = [
  { sel: true, label: "test_pi", sub: "il y a 2 h" },
  { sel: false, label: "Pi-xel", sub: "hier" },
  { sel: false, label: "Laboratory-Game", sub: "il y a 3 j" },
  { sel: false, label: "zoo-code", sub: "la semaine dernière" },
];

const listLines = [];
for (const it of list) {
  const bullet = it.sel ? ACCENT("▸") : DIM(" ");
  const label = it.sel ? ACCENT(BOLDW(it.label)) : it.label;
  let sub = `  ${it.sub}`;
  const avail = listW - 4 - 20; // bullet+espaces + label padEnd
  if (sub.length > avail) sub = sub.slice(0, avail - 1) + "…";
  listLines.push(` ${bullet} ${padEndVis(label, 20)}${DIM(sub)}`);
}
listLines.push("");
listLines.push(` ${ACCENT("📂")} Tous les workspaces…`);

// ── Compose : bordure + colonnes ──
const H = Math.max(art.length, listLines.length + 4); // +4 : titre, sep, hint
const innerW = artW + 3 + listW; // art | 3 espaces | liste
const top = `╭${"─".repeat(innerW)}╮`;
const bot = `╰${"─".repeat(innerW)}╯`;
const title = ` ${BOLD}${ACCENT("◈ hub")}${RESET}`;
const hint = DIM("  ↑↓ navigate · enter select · n new · r rename · esc quit");

const rows = [];
rows.push(`│${padEndVis(title, innerW)}│`);
rows.push(`│${" ".repeat(innerW)}│`);
for (let i = 0; i < H; i++) {
  const a = i < art.length ? padEndVis(art[i], artW) : " ".repeat(artW);
  const l = listLines[i - 1] ?? ""; // liste commence une ligne sous le titre
  rows.push(`│${a}   ${padEndVis(l, listW)}│`);
}
rows.push(`│${" ".repeat(innerW)}│`);
rows.push(`│${padEndVis(hint, innerW)}│`);

// BOM UTF-8 : PowerShell 5.1 lit l'UTF-8 automatiquement seulement avec BOM
writeFileSync(outp, "\uFEFF" + [top, ...rows, bot].join("\n") + "\n");
console.log(`Maquette écrite : ${outp} (${innerW + 2} cols × ${H + 2} lignes)`);
