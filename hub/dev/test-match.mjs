import { pathToFileURL } from "node:url";
import(pathToFileURL("C:/Users/Pelo/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/index.js")).then(async (m) => {
	const all = await m.SessionManager.listAll();
	// Le path EXACT tel que reçu par l'éditeur (backslashes, depuis la capture d'Impre)
	const trimmed =
		"C:\\Users\\Pelo\\.pi\\agent\\sessions\\--C--Users-Pelo-Desktop-test_pi--\\2026-09-08T21-19-46-561Z_01a082e4-2b80-707e-ab31-d6789b13c1a5.jsonl";
	const exact = all.find((s) => s.path === trimmed);
	console.log("match exact backslashes :", exact ? "OUI" : "NON");
	const norm = (p) => p.toLowerCase().replace(/[\\/]+/g, "\\");
	const normMatch = all.find((s) => norm(s.path) === norm(trimmed));
	console.log("match normalisé          :", normMatch ? "OUI" : "NON");
	const sample = all.find((s) => s.cwd.includes("test_pi"));
	console.log("s.path réel (test_pi)    :", JSON.stringify(sample?.path));
}).catch((e) => console.error("ERR:", e.message));
