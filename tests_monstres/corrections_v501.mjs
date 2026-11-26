// v501 — LE CONSEIL : l'IA des discussions privées, une réplique après l'autre, un PNJ qui relance le silence (en pause
// si personne n'a la page ouverte), les avis qui bougent, les avatars deux fois plus grands, celui de Thémès, la dictée,
// une jolie fenêtre pour clore, et 10 secondes après le vote, le retour au camp.
// Lancer : node tests_monstres/corrections_v501.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
// Firestore en mémoire : les écritures (setDoc, updateDoc aux chemins pointés,
// deleteField, les lots, les transactions) changent window.__docs, et toute
// écriture de la partie revient au jeu comme l'écoute la lui donnerait.
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, ...c) => ({ col: c.join("/") });
  const SUPPR = { __supprimer: true };
  const docs = () => (window.__docs = window.__docs || {});
  const cloner = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const estMap = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.__supprimer;
  function fusionner(cible, src) {
    Object.entries(src).forEach(([k, v]) => {
      if (v && v.__supprimer) { delete cible[k]; return; }
      if (estMap(v)) { if (!estMap(cible[k])) cible[k] = {}; fusionner(cible[k], v); return; }
      cible[k] = cloner(v);
    });
  }
  function nettoyer(v) { if (estMap(v)) { Object.keys(v).forEach(k => { if (v[k] && v[k].__supprimer) delete v[k]; else nettoyer(v[k]); }); } return v; }
  function ecrire(chemin, data, mode) {
    const d = docs();
    if (mode === "set") d[chemin] = nettoyer(cloner(Object.fromEntries(Object.entries(data).filter(([k, v]) => !(v && v.__supprimer)))));
    else if (mode === "merge") { d[chemin] = d[chemin] || {}; fusionner(d[chemin], data); }
    else if (mode === "update") {
      if (!d[chemin]) throw new Error("document absent : " + chemin);
      Object.entries(data).forEach(([cle, v]) => {
        const parts = cle.split("."); let o = d[chemin];
        for (let i = 0; i < parts.length - 1; i++) { if (!estMap(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
        const f = parts[parts.length - 1];
        if (v && v.__supprimer) delete o[f]; else o[f] = nettoyer(cloner(v));
      });
    }
    (window.__journal = window.__journal || []).push({ chemin, mode, data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) });
    if (chemin.startsWith("Systeme_Parties/") && chemin.split("/").length === 2 && window.__relaisPartie && typeof window.appliquerVoyageDeLaPartie === "function") {
      const copie = cloner(d[chemin]);
      setTimeout(() => window.appliquerVoyageDeLaPartie(copie), 0);
    }
  }
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; };
  export const query = (c, ...contraintes) => ({ col: c.col, contraintes });
  export const where = (champ, op, valeur) => ({ type: "where", champ, op, valeur });
  export const orderBy = (champ) => ({ type: "orderBy", champ }); export const limit = (n) => ({ type: "limit", n });
  export const getDocs = async (q) => {
    const col = q.col; const w = (q.contraintes || []).filter(c => c && c.type === "where");
    const liste = Object.entries(docs()).filter(([k]) => k.startsWith(col + "/") && k.split("/").length === col.split("/").length + 1)
      .filter(([, v]) => w.every(c => c.op === "==" ? v[c.champ] === c.valeur : c.op === "in" ? c.valeur.includes(v[c.champ]) : true))
      .map(([k, v]) => ({ id: k.split("/").pop(), ref: { chemin: k }, data: () => cloner(v) }))
      .sort((a, b) => (a.data().Timestamp || 0) - (b.data().Timestamp || 0));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0, size: liste.length };
  };
  export const setDoc = async (ref, data, options) => { ecrire(ref.chemin, data, options && options.merge ? "merge" : "set"); (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data)), options }); };
  export const updateDoc = async (ref, data) => { ecrire(ref.chemin, data, "update"); (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) }); };
  export const deleteDoc = async (ref) => { delete docs()[ref.chemin]; (window.__suppressions = window.__suppressions || []).push(ref.chemin); };
  let n = 0;
  export const addDoc = async (c, data) => { const id = "m" + (++n) + "_" + Date.now(); docs()[c.col + "/" + id] = cloner(data); (window.__ajouts = window.__ajouts || []).push({ col: c.col, id, data: cloner(data) }); return { id }; };
  export const deleteField = () => SUPPR; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (k) => k; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const writeBatch = () => { const ops = []; return { set(r, d, o){ ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); }, update(r, d){ ops.push(() => ecrire(r.chemin, d, "update")); },
    delete(r){ ops.push(() => { delete docs()[r.chemin]; (window.__suppressions = window.__suppressions || []).push(r.chemin); }); }, commit: async () => { ops.forEach(f => f()); } }; };
  export const runTransaction = async (_d, fn) => {
    window.__transactions = (window.__transactions || 0) + 1;
    const ops = [];
    const tx = { get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; },
                 update(r, d) { ops.push(() => ecrire(r.chemin, d, "update")); return tx; },
                 set(r, d, o) { ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); return tx; } };
    const res = await fn(tx);
    ops.forEach(f => f());
    return res;
  };
  export const Timestamp = { now: () => Date.now() };
`;




const CP = await import(path.join(RACINE, 'camp_pur.js'));
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", creeLe: 1 }, { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", creeLe: 1 }];
  ["Ara", "Bors", "Cleo", "Vif"].forEach(n => { window.__docs["Monde_PNJ/PNJ_" + n.toUpperCase()] = { Nom_PNJ: n }; });
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Narrateur: true };
  window.__docs["Systeme_Parties/P1/Presence/J2"] = { Le: Date.now(), Joueur: "J2" };
  window.__docs["Recits_Chapitres/c1"] = { ID_Partie: "P1", Numero: 1, Titre: "Expédition 1 — Les loups de la crête", Expedition: 1 };
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.5, y: 0.5 }, Heros_Principaux: {},
    Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 12, Ressources: { Jauge: 60 }, Lieux_Reperes: [{ Par: "PNJ_VIF", Jour: 3 }],
      Expeditions_Passees: [{ Numero: 1, Jours: 4, Membres: ["H1"] }],
      Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Moral: 60 }, H2: { Type: "heros", Moral: 60 },
                 PNJ_ARA: { Type: "pnj", Moral: 60 }, PNJ_BORS: { Type: "pnj", Moral: 60 }, PNJ_CLEO: { Type: "pnj", Moral: 60 }, PNJ_VIF: { Type: "pnj", Tache: "eclaireur", Moral: 60 } } } };
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.positionGroupeBrute = () => (window.PARTIE_DATA || {}).Position_Groupe || null;
  window.__taches = []; window.TACHE_EN_COURS = { depuisConseil: async (s) => { window.__taches.push(s); } };
});
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
const msgs = () => p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).map(([, v]) => v).sort((a, b) => a.Timestamp - b.Timestamp));

await p.evaluate(() => { window.__docs["Monde_PNJ/PNJ_THEMES_P1"].URL_Cloudinary = "https://res.cloudinary.com/x/image/upload/themes.png"; window.CONSEIL.planifierIA(3600000); });
const reponseIA = (o) => p.evaluate((o) => {
  window.__appels = window.__appels || [];
  window.fetchGemini = async (usage, corps, opt) => { window.__appels.push({ usage, corps: JSON.parse(corps), modele: opt && opt.modele });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }) }; };
}, o);

titre("1. LES RÈGLES");
await section(async () => {
  const C = await import(path.join(RACINE, 'conseil.js')).catch(() => null);
  const code = lire("conseil.js"), cp = lire("camp_pur.js");
  verifier("une pause entre deux répliques, selon la longueur (1,4 à 4,2 s)", /pauseEntreRepliques = \(texte\) => Math\.min\(4200, 1400 \+ 28 \* /.test(code));
  verifier("la consigne : les avis des PNJ bougent selon ce qui se dit ; leur avis actuel ; la relance", /LES AVIS BOUGENT/.test(cp) && /L'avis actuel de chaque PNJ/.test(cp) && /PERSONNE N'A PARLÉ DEPUIS UN MOMENT/.test(cp));
});

titre("2. L'IA DES DISCUSSIONS PRIVÉES, UNE RÉPLIQUE APRÈS L'AUTRE, LES AVIS QUI BOUGENT");
await section(async () => {
  await p.evaluate(async () => { await window.CONSEIL.ouvrir(); }); await p.waitForTimeout(500);
  await p.evaluate(async () => { await window.CONSEIL.proposer("Organiser une fête", "Le clan a besoin de souffler.", "fete"); window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))); });
  await p.evaluate(async () => { window.CONSEIL.planifierIA(3600000); await window.CONSEIL.envoyer("Une fête, voilà ce qu'il nous faut."); window.CONSEIL.planifierIA(3600000); });
  await reponseIA({ repliques: [{ qui: "Ara", texte: "Une fête ? Avec quoi, des racines ?" }, { qui: "Bors", texte: "Moi, je dis qu'on va chasser plus loin." }, { qui: "Thémès", texte: "Écoutons chacun." }], avis: { Ara: "S1", Bors: "S1" } });
  const r = await p.evaluate(async () => { const t0 = Date.now(); await window.CONSEIL.repondre(); window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))); return { duree: Date.now() - t0, appel: window.__appels.slice(-1)[0] }; });
  const m = await msgs(), trois = m.slice(-3);
  verifier("l'IA des discussions privées (gemini-3.8-flash, peu de réflexion), en JSON", r.appel.usage === "discussion" && r.appel.modele === "gemini-3.8-flash" && r.appel.corps.generationConfig.thinkingConfig.thinkingLevel === "low" && r.appel.corps.generationConfig.responseMimeType === "application/json", JSON.stringify({ u: r.appel.usage, m: r.appel.modele }));
  const ecarts = [trois[1].Timestamp - trois[0].Timestamp, trois[2].Timestamp - trois[1].Timestamp];
  verifier("trois répliques : l'une après l'autre (plus de trois bulles d'un coup)", trois.map(x => x.Auteur_Nom).join() === "Ara,Bors,Thémès" && ecarts.every(e => e >= 1400) && r.duree >= 2800, ecarts.join(" / ") + " ms");
  const sys = r.appel.corps.systemInstruction.parts[0].text;
  verifier("…le prompt dit l'avis actuel de chaque PNJ et que les avis peuvent bouger", /L'avis actuel de chaque PNJ/.test(sys) && /LES AVIS BOUGENT/.test(sys));
  // Thorin convainc Ara : son avis change.
  await p.evaluate(async () => { window.CONSEIL.planifierIA(3600000); await window.CONSEIL.envoyer("Ara, une fête, c'est aussi la chasse partagée : on fêtera ce qu'on rapporte."); window.CONSEIL.planifierIA(3600000); });
  await reponseIA({ repliques: [{ qui: "Ara", texte: "Dit comme ça… Tu m'as convaincue." }], avis: { Ara: "S2" } });
  await p.evaluate(async () => { await window.CONSEIL.repondre(); window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))); });
  const d = await partie();
  const sys2 = await p.evaluate(() => window.__appels.slice(-1)[0].corps.systemInstruction.parts[0].text);
  verifier("le RP fait changer un PNJ d'avis (Ara : du lieu repéré à la fête) ; Bors garde le sien", d.Conseil.Avis_PNJ.PNJ_ARA === "S2" && d.Conseil.Avis_PNJ.PNJ_BORS === "S1" && /- Ara : Aller voir le lieu repéré/.test(sys2), JSON.stringify(d.Conseil.Avis_PNJ));
});

titre("3. LE SILENCE : UN PNJ RELANCE (DEUX FOIS AU PLUS)");
await section(async () => {
  const r = await p.evaluate(async () => {
    const vieux = () => Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).forEach(([, v]) => { v.Timestamp -= 60000; });
    const tot = await window.CONSEIL.repondre({ relance: true });   // le dernier message est récent : rien
    vieux();
    window.fetchGemini = async (u, corps) => { window.__dernierPrompt = JSON.parse(corps).systemInstruction.parts[0].text; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ repliques: [{ qui: "Cleo", texte: "Thorin, tu ne dis plus rien ?" }, { qui: "Bors", texte: "…" }], avis: {} }) }] } }] }) }; };
    const r1 = await window.CONSEIL.relancer ? null : await window.CONSEIL.repondre({ relance: true });
    const prompt1 = window.__dernierPrompt;
    vieux();
    const r2 = await window.CONSEIL.repondre({ relance: true });
    vieux();
    const r3 = await window.CONSEIL.repondre({ relance: true });
    const l = Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).map(([, v]) => v).sort((a, b) => a.Timestamp - b.Timestamp);
    return { tot, r1: !!r1, r2: !!r2, r3, prompt1, dernieres: l.slice(-3).map(x => [x.Auteur_Nom, !!x.Relance]) };
  });
  verifier("trop tôt (moins de 45 s de silence) : personne ne relance", r.tot === null);
  verifier("45 s de silence : un PNJ relance, une seule réplique (la consigne le lui dit)", r.r1 && /PERSONNE N'A PARLÉ DEPUIS UN MOMENT/.test(r.prompt1 || "") && JSON.stringify(r.dernieres.slice(-2)) === '[["Cleo",true],["Cleo",true]]', JSON.stringify(r.dernieres));
  verifier("…deux relances au plus d'affilée : ensuite le conseil attend les joueurs", r.r2 && r.r3 === null);
  const code = lire("conseil.js");
  verifier("…en pause si la page n'est ouverte et visible chez personne (la relance ne part que d'une page ouverte, visible)", /if \(!ouverte \|\| document\.hidden\) return;[\s\S]{0,400}repondre\(\{ relance: true \}\)/.test(code));
});

titre("4. LA PAGE : LES AVATARS, THÉMÈS, LA DICTÉE");
await section(async () => {
  await p.evaluate(() => window.CONSEIL.rafraichir()); await p.waitForTimeout(300);
  const v = await p.evaluate(() => {
    const th = [...document.querySelectorAll(".message-conseil.themes")][0], a = document.querySelector(".message-conseil .avatar-conseil");
    return { themes: th ? (th.querySelector("img.avatar-conseil") || {}).src || "" : "", taille: getComputedStyle(a).width, align: getComputedStyle(a.parentNode).alignItems,
             micros: [...document.querySelectorAll('#saisie-conseil [data-cs="micro"]')].map(x => x.dataset.cible) };
  });
  verifier("l'avatar de Thémès dans sa bulle (sa fiche de PNJ)", /themes\.png/.test(v.themes), v.themes);
  verifier("les avatars deux fois plus grands (80 px), centrés sur leur encart", v.taille === "80px" && v.align === "center", JSON.stringify(v));
  const dic = await p.evaluate(async () => {
    class FausseReco { constructor() { window.__reco = this; } start() { setTimeout(() => this.onresult({ results: [Object.assign([{ transcript: "Je propose de partir à l'aube" }], { isFinal: true })] }), 30); } stop() { this.onend && this.onend(); } abort() {} }
    window.SpeechRecognition = FausseReco;
    const t = document.getElementById("texte-conseil"); t.value = "Écoutez :";
    const b = document.querySelector('#saisie-conseil [data-cs="micro"]'); b.click(); await new Promise(r => setTimeout(r, 120));
    const r = { valeur: t.value, ecoute: b.classList.contains("ecoute") };
    b.click(); r.arret = !b.classList.contains("ecoute");
    localStorage.setItem("ID_JOUEUR_COURANT", "J3"); window.CONSEIL.rendre();   // un joueur qui n'a pas encore proposé de sujet
    document.querySelector('[data-cs="proposer"]') && document.querySelector('[data-cs="proposer"]').click();
    await new Promise(r => setTimeout(r, 100));
    r.form = [...document.querySelectorAll('.form-sujet-conseil [data-cs="micro"]')].map(x => x.dataset.cible);
    const ti = document.getElementById("titre-sujet-conseil"); if (ti) ti.value = "Partir à l'aube";
    await window.CONSEIL.rafraichir();
    r.garde = (document.getElementById("titre-sujet-conseil") || {}).value || "";
    localStorage.setItem("ID_JOUEUR_COURANT", "J1"); window.CONSEIL.rendre();
    return r;
  });
  verifier("l'icône de la dictée dans le chat : ce qui est dit s'ajoute à la suite", dic.valeur === "Écoutez : Je propose de partir à l'aube" && dic.ecoute && dic.arret, JSON.stringify(dic));
  verifier("…et dans les encarts des propositions (le titre, le résumé)", JSON.stringify(dic.form) === '["titre-sujet-conseil","resume-sujet-conseil"]', JSON.stringify(dic.form));
  verifier("…ce qu'on y tape n'est plus effacé à chaque message", dic.garde === "Partir à l'aube", dic.garde);
});

titre("5. METTRE FIN AU CONSEIL : UNE JOLIE FENÊTRE");
await section(async () => {
  const r = await p.evaluate(async () => {
    let natif = false; window.confirm = () => { natif = true; return true; };
    document.querySelector('[data-cs="finir"]').click(); await new Promise(r => setTimeout(r, 50));
    const voile = document.getElementById("voile-fin-conseil"), visible = voile.classList.contains("visible") && getComputedStyle(voile).display !== "none";
    const texte = voile.textContent.replace(/\s+/g, " ");
    voile.querySelector('[data-cs="finir-non"]').click(); await new Promise(r => setTimeout(r, 50));
    return { natif, visible, texte, cache: !voile.classList.contains("visible"), toujours: !!window.__docs["Systeme_Parties/P1"].Conseil };
  });
  verifier("une fenêtre au style du jeu (plus la boîte du navigateur), un mot de Thémès : chacun retourne à ses occupations", !r.natif && r.visible && /chacun retourne à ses occupations/.test(r.texte) && /Clore le conseil/.test(r.texte), r.texte.slice(0, 140));
  verifier("« Rester encore » : le conseil continue", r.cache && r.toujours);
});

titre("6. LE VOTE FINI : 10 SECONDES, PUIS RETOUR AU CAMP");
await section(async () => {
  const t = await p.evaluate(async () => {
    window.__docs["Systeme_Parties/P1"].Conseil.Votes = { J2: "S2" };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    await window.CONSEIL.voter("S2"); await new Promise(r => setTimeout(r, 600));
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))); window.CONSEIL.rendre();
    await new Promise(r => setTimeout(r, 1200));
    return { clos: window.__docs["Systeme_Parties/P1"].Conseil && !window.__docs["Systeme_Parties/P1"].Conseil.Ouvert, compte: document.getElementById("fin-vote-conseil").textContent, ouverte: window.CONSEIL.ouverte() };
  });
  verifier("le vote clos : « Le conseil se lève dans … secondes », la page encore ouverte", t.clos && /Le conseil se lève dans (9|10) secondes/.test(t.compte) && t.ouverte, JSON.stringify(t));
  await p.waitForTimeout(9800);
  const f = await p.evaluate(() => ({ ouverte: window.CONSEIL.ouverte(), conseil: !!window.__docs["Systeme_Parties/P1"].Conseil, tache: !!window.__docs["Systeme_Parties/P1"].Camp.Tache_Votee }));
  verifier("…10 secondes après : la page se ferme (retour au camp), le conseil est clos et effacé, la tâche votée reste", !f.ouverte && !f.conseil && f.tache, JSON.stringify(f));
});

titre("7. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS), ix = lire("index.html");
  verifier("version 501 ou plus ; conseil.js et conseil.css rechargés", v >= 501 && Number((ix.match(/conseil\.js\?v=(\d+)/) || [])[1]) >= 14 && Number((ix.match(/conseil\.css\?v=(\d+)/) || [])[1]) >= 3, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
