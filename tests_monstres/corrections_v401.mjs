// v401 — LES SONS DU CHAT VOCAL. Nico : « mets un son quand un joueur se connecte sur
// le vocal, et quand l'un des joueurs quitte le vocal ; un son de cor pour l'arrivée
// (comme ceux des batailles de l'époque) ; pour le départ, je te laisse choisir ».
//
// 1. Les deux sons (fabrique_sons.js), rendus hors ligne et écoutés par le calcul :
//    le cor qui appelle (ré bref, puis la long, une quinte au-dessus, qui enfle) ;
//    la retraite (sol puis ré, plus bas, plus sourd, plus loin).
// 2. Quand ils sonnent (vocal.js) : le vrai module, sur une base en mémoire.
//    (corrections_v396 les entend aussi, entre deux vrais postes en WebRTC.)
//
// Lancer : node tests_monstres/corrections_v401.mjs   (V401_SONS=dossier : les deux sons en .wav)
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (req.url === '/vide.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>banc</title>'); return; }
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.goto(base + '/vide.html');
await p.addScriptTag({ url: base + '/fabrique_sons.js' });

// Rendre un son hors ligne, puis l'écouter : niveau, durée, hauteur (Goertzel), timbre.
const ecouter = (id) => p.evaluate(async (id) => {
  const sr = 44100, duree = 5;
  const ctx = new OfflineAudioContext(1, sr * duree, sr);
  window.SONS_EVENEMENTS[id](ctx, ctx.destination);
  const buf = await ctx.startRendering();
  const x = buf.getChannelData(0);
  const tranche = (a, z) => x.subarray(Math.floor(a * sr), Math.floor(z * sr));
  const rms = (t) => Math.sqrt(t.reduce((s, v) => s + v * v, 0) / Math.max(1, t.length));
  const goertzel = (t, f) => { const k = 2 * Math.cos(2 * Math.PI * f / sr); let s1 = 0, s2 = 0; for (let i = 0; i < t.length; i++) { const s0 = t[i] + k * s1 - s2; s2 = s1; s1 = s0; } return (s1 * s1 + s2 * s2 - k * s1 * s2) / t.length; };
  // la brillance : l'énergie des différences (l'aigu) rapportée à l'énergie du signal
  const brillance = (t) => { let d = 0, e = 0; for (let i = 1; i < t.length; i++) { d += (t[i] - t[i - 1]) ** 2; e += t[i] * t[i]; } return e ? d / e : 0; };
  let pic = 0, fin = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pic) pic = a; if (a > 0.003) fin = i / sr; }
  let debut = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.003) { debut = i / sr; break; }
  const notes = (a, z) => { const t = tranche(a, z); return { re: goertzel(t, 146.83), sol: goertzel(t, 196), la: goertzel(t, 220), re_bas: goertzel(t, 73.4) }; };
  // un .wav (16 bits) pour l'oreille, en base64
  const wav = (() => { const n = x.length, o = new DataView(new ArrayBuffer(44 + n * 2)); const ecr = (p, s) => { for (let i = 0; i < s.length; i++) o.setUint8(p + i, s.charCodeAt(i)); };
    ecr(0, "RIFF"); o.setUint32(4, 36 + n * 2, true); ecr(8, "WAVE"); ecr(12, "fmt "); o.setUint32(16, 16, true); o.setUint16(20, 1, true); o.setUint16(22, 1, true);
    o.setUint32(24, sr, true); o.setUint32(28, sr * 2, true); o.setUint16(32, 2, true); o.setUint16(34, 16, true); ecr(36, "data"); o.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) o.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    let s = ""; const u = new Uint8Array(o.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); })();
  return { pic, debut, fin, rmsDebut: rms(tranche(0.05, 0.4)), rmsMilieu: rms(tranche(0.7, 1.4)), rmsTenue: rms(tranche(1.4, 2.1)),
           premiere: notes(0.08, 0.42), longue: notes(0.95, 1.9), brillance: brillance(tranche(0.9, 1.9)), wav };
}, id);

titre("1. LE COR QUI APPELLE (« cor-arrivee ») ET LA RETRAITE (« cor-depart »)");
let arrivee = null, depart = null;
await section(async () => {
  const ids = await p.evaluate(() => Object.keys(window.SONS_EVENEMENTS || {}));
  verifier("les deux sons existent parmi les sons d'événement", ids.includes("cor-arrivee") && ids.includes("cor-depart"), ids.join(", "));
  arrivee = await ecouter("cor-arrivee"); depart = await ecouter("cor-depart");
  if (process.env.V401_SONS) { fs.writeFileSync(path.join(process.env.V401_SONS, "cor-arrivee.wav"), Buffer.from(arrivee.wav, "base64")); fs.writeFileSync(path.join(process.env.V401_SONS, "cor-depart.wav"), Buffer.from(depart.wav, "base64")); }
  const court = (o) => JSON.stringify({ pic: +o.pic.toFixed(3), debut: +o.debut.toFixed(3), fin: +o.fin.toFixed(2), tenue: +o.rmsTenue.toFixed(3), brillance: +o.brillance.toFixed(4) });
  verifier("le cor sonne tout de suite, sans saturer (crête < 0,9)", arrivee.debut < 0.03 && arrivee.pic > 0.1 && arrivee.pic < 0.9, court(arrivee));
  verifier("…une sonnerie longue : 2,5 à 4,5 s avec l'écho", arrivee.fin > 2.5 && arrivee.fin < 4.5, court(arrivee));
  verifier("…d'abord la brève : un ré (146,8 Hz) plus fort que le la", arrivee.premiere.re > 3 * arrivee.premiere.la, JSON.stringify(arrivee.premiere));
  verifier("…puis la longue, une quinte au-dessus : le la (220 Hz) domine", arrivee.longue.la > 3 * arrivee.longue.re && arrivee.longue.la > 3 * arrivee.longue.sol, JSON.stringify(arrivee.longue));
  verifier("…une note TENUE qui enfle (pas un « ding » qui s'éteint)", arrivee.rmsTenue >= 0.9 * arrivee.rmsMilieu && arrivee.rmsMilieu > 0.03, `${arrivee.rmsMilieu.toFixed(3)} → ${arrivee.rmsTenue.toFixed(3)}`);
  verifier("la retraite descend : le sol d'abord, puis le ré", depart.premiere.sol > 3 * depart.premiere.re && depart.longue.re > 3 * depart.longue.sol, JSON.stringify({ a: depart.premiere, b: depart.longue }));
  verifier("…plus loin : moins forte que l'appel", depart.pic < 0.75 * arrivee.pic && depart.pic > 0.04, `${depart.pic.toFixed(3)} / ${arrivee.pic.toFixed(3)}`);
  verifier("…plus sourde : moins d'aigu que l'appel", depart.brillance < 0.8 * arrivee.brillance, `${depart.brillance.toFixed(4)} / ${arrivee.brillance.toFixed(4)}`);
  verifier("…plus courte que l'appel, mais pas un simple clic (1,6 à 3,8 s)", depart.fin > 1.6 && depart.fin < 3.8 && depart.fin < arrivee.fin + 0.5, depart.fin.toFixed(2));
  verifier("ils suivent le volume du jeu (jouerSonEvenement : « Interface » × « Général »)", await p.evaluate(() => {
    window.PARAMETRES_AUDIO = { interface: 0, general: 1 };
    const muet = window.jouerSonEvenement("cor-arrivee") === false;
    window.PARAMETRES_AUDIO = { interface: 1, general: 1 };
    return muet;
  }));
});

titre("2. QUAND ILS SONNENT (vocal.js)");
await section(async () => {
  const s = lire("vocal.js");
  const d = s.indexOf("function annoncerMouvements"), corps = s.slice(d, s.indexOf("\n}\n", d));
  verifier("à chaque nouvelle de la présence, et au contrôle des absents (toutes les 5 s)",
    /synchroniserPairs\(\);\s*annoncerMouvements\(\);\s*maj\(\);\s*\}, \(e\) => console\.error\("Vocal : présents"/.test(s) && /setInterval\(\(\) => \{ synchroniserPairs\(\); annoncerMouvements\(\); maj\(\); \}, 5000\)/.test(s));
  verifier("une voix qui arrive : le cor ; une voix qui part : la retraite (un seul son à la fois)", /arrive \? "cor-arrivee" : part \? "cor-depart" : ""/.test(corps));
  verifier("les voix déjà là en entrant dans la partie ne sonnent pas (voixConnues remis à zéro)", /v\.voixConnues = null;/.test(s.slice(s.indexOf("function entrer"), s.indexOf("function sortir"))) && /if \(v\.voixConnues\)/.test(corps));
  verifier("(le banc corrections_v396 les entend entre deux vrais postes)", /cor-arrivee/.test(lire("tests_monstres/corrections_v396.mjs")) && /cor-depart/.test(lire("tests_monstres/corrections_v396.mjs")));
});

titre("3. LA VERSION");
await section(async () => {
  const v = JSON.parse(lire("version.json")).version;
  verifier("version.json et VERSION_IVALIS d'accord (401 ou plus)", v >= 401 && new RegExp("VERSION_IVALIS = " + v + ";").test(lire("trace_combat.js")), String(v));
  const html = lire("index.html");
  verifier("index.html charge les nouvelles versions (vocal.js 2, fabrique_sons.js 23)", /vocal\.js\?v=([2-9]|\d\d)"/.test(html) && /fabrique_sons\.js\?v=(2[3-9]|[3-9]\d)"/.test(html));
  verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log("\n" + (echecs ? `${echecs} CONTRÔLE(S) EN ÉCHEC` : "TOUS LES CONTRÔLES PASSENT"));
process.exit(echecs ? 1 : 0);
