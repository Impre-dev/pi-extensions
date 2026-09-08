#!/usr/bin/env node
/**
 * braille-resize — rééchantillonnage propre d'un pixel art braille Unicode.
 *
 * Chaque char U+2800..U+28FF encode une grille 2×4 de dots :
 *   (col,row) → bit :  (0,0)=0 (0,1)=1 (0,2)=2 (0,3)=6
 *                      (1,0)=3 (1,1)=4 (1,2)=5 (1,3)=7
 * On décode → matrice de dots, box-average vers la taille cible, réencode.
 * Les dots braille sont ~carrés en terminal → le ratio se conserve au niveau dots.
 *
 * Usage : node braille-resize.mjs <in.txt> <out.txt> <targetDotsWidth>
 */

import { readFileSync, writeFileSync } from "node:fs";

const [inp, outp, targetWArg] = process.argv.slice(2);
if (!inp || !outp || !targetWArg) {
  console.error("Usage: node braille-resize.mjs <in.txt> <out.txt> <targetDotsWidth>");
  process.exit(1);
}
const targetDotsW = parseInt(targetWArg, 10);
const threshold = process.env.THRESHOLD ? parseFloat(process.env.THRESHOLD) : 0.5;

// (col,row) -> bit
const BIT = [
  [0, 0], // dot1 bit0
  [0, 1], // dot2 bit1
  [0, 2], // dot3 bit2
  [1, 0], // dot4 bit3
  [1, 1], // dot5 bit4
  [1, 2], // dot6 bit5
  [0, 3], // dot7 bit6
  [1, 3], // dot8 bit7
];

// ── Décode ──
const rawLines0 = readFileSync(inp, "utf8").replace(/\r/g, "").split("\n");
while (rawLines0.length && rawLines0[rawLines0.length - 1].trim() === "") rawLines0.pop();
// Crop optionnel en chars : CROP=x0,y0,x1,y1 (bornes incluses)
let rawLines = rawLines0;
if (process.env.CROP) {
  const [x0, y0, x1, y1] = process.env.CROP.split(",").map(Number);
  rawLines = rawLines0.slice(y0, y1 + 1).map((l) => [...l].slice(x0, x1 + 1).join(""));
}
const width = Math.max(...rawLines.map((l) => [...l].length));
const lines = rawLines.map((l) => {
  const a = [...l];
  while (a.length < width) a.push(" ");
  return a;
});

const dotsW = width * 2;
const dotsH = lines.length * 4;
const grid = new Uint8Array(dotsW * dotsH);

for (let y = 0; y < lines.length; y++) {
  for (let x = 0; x < width; x++) {
    const ch = lines[y][x];
    const code = ch === " " ? 0x2800 : ch.codePointAt(0);
    if (code < 0x2800 || code > 0x28ff) continue; // ignore tout char non-braille
    const bits = code - 0x2800;
    for (let d = 0; d < 8; d++) {
      if (bits & (1 << d)) {
        const [cx, ry] = BIT[d];
        grid[(y * 4 + ry) * dotsW + (x * 2 + cx)] = 1;
      }
    }
  }
}

// ── Cible (ratio dots conservé) ──
const targetDotsH = Math.max(1, Math.round((targetDotsW * dotsH) / dotsW));
const targetW = Math.ceil(targetDotsW / 2);
const targetH = Math.ceil(targetDotsH / 4);

// ── Box average ──
const out = [];
for (let ty = 0; ty < targetDotsH; ty++) {
  const sy0 = Math.floor((ty * dotsH) / targetDotsH);
  const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * dotsH) / targetDotsH));
  for (let tx = 0; tx < targetDotsW; tx++) {
    const sx0 = Math.floor((tx * dotsW) / targetDotsW);
    const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * dotsW) / targetDotsW));
    let sum = 0, n = 0;
    for (let sy = sy0; sy < sy1 && sy < dotsH; sy++)
      for (let sx = sx0; sx < sx1 && sx < dotsW; sx++) { sum += grid[sy * dotsW + sx]; n++; }
    out.push(n > 0 && sum / n >= threshold ? 1 : 0);
  }
}

// ── Réencode ──
const result = [];
for (let cy = 0; cy < targetH; cy++) {
  let line = "";
  for (let cx = 0; cx < targetW; cx++) {
    let bits = 0;
    for (let d = 0; d < 8; d++) {
      const [lx, ly] = BIT[d];
      const gx = cx * 2 + lx, gy = cy * 4 + ly;
      if (gx < targetDotsW && gy < targetDotsH && out[gy * targetDotsW + gx]) bits |= 1 << d;
    }
    line += String.fromCodePoint(0x2800 + bits);
  }
  result.push(line.replace(/\u2800+$/, "")); // trim fin de ligne
}

writeFileSync(outp, result.join("\n") + "\n");
console.log(`Source : ${dotsW}×${dotsH} dots (${width}×${lines.length} chars)`);
console.log(`Cible  : ${targetDotsW}×${targetDotsH} dots (${targetW}×${targetH} chars)`);
console.log(`Écrit  : ${outp}`);
