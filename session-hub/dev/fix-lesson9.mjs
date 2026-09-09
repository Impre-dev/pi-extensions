import { readFileSync, writeFileSync } from "node:fs";
const p = "../../roadmap_SessionHub.md";
let s = readFileSync(p, "utf8");

const broken = "9. **Le ctx des events n'a jamais le pouvoir de switcher** —  et les shortcuts non-command : le hub ne s'ouvre que via la commande  (ou un shortcut vérifié par ) ; sinon  + Enter. Coût : un Enter au lancement sur home. Bénéfice : zéro cascade, définitif.";
const fixed = "9. **Le ctx des events n'a jamais le pouvoir de switcher** — `session_start` et les shortcuts non-command : le hub ne s'ouvre que via la commande `/hub` (ou un shortcut vérifié par `getSwitch`) ; sinon `setEditorText(\"/hub\")` + Enter. Coût : un Enter au lancement sur home. Bénéfice : zéro cascade, définitif.";

if (!s.includes(broken)) {
	console.error("texte corrompu introuvable — vérifier manuellement");
	process.exit(1);
}
s = s.replace(broken, fixed);
writeFileSync(p, s);
console.log("leçon 9 réparée");
