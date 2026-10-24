// v266 — LA DISTANCE DE L'ENCART PLUS GROSSE, LA FENÊTRE DES MONSTRES QUI TIENT DANS L'ÉCRAN
//
// Nico :
//  · « L'icône de distance et son chiffre sur le visuel de la compétence qui va
//    être jouée : fais-les 1,5× plus gros. »
//  · « Sur iPad, la fenêtre Paramètres > Monstres est tronquée, on ne voit pas
//    le haut : fais-la tenir selon la taille de la fenêtre. »
//
// SUR LA VRAIE PAGE (faux Firestore) :
//   1. la distance : 1,5× plus grosse (4,8 % de la plaque au lieu de 3,2 %), le
//      nom de la technique s'arrête avant elle, et se réajuste quand la place
//      qu'on lui laisse change ;
//   2. Paramètres > Monstres, en iPad paysage et portrait : la fenêtre tient
//      dans l'écran, défile dedans, son en-tête (titre, Enregistrer, Retour)
//      reste en haut et l'en-tête du tableau se colle juste dessous ;
//   3. les versions.
// Le banc se charge sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, d = null) => { try { return f(); } catch (e) { return d; } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const titre = (t) => { console.log("\n========================================================="); console.log("  " + t); console.log("========================================================="); };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async (ref) => { const l = ((window.__collections || {})[ref && ref.col] || []).map(x => ({ id: x.id, data: () => x.data }));
    return { forEach: (f) => l.forEach(f), docs: l, empty: l.length === 0 }; };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data });
    if (docs()[ref.chemin]) Object.assign(docs()[ref.chemin], JSON.parse(JSON.stringify(data))); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => { const ops = []; return { set(ref, d){ ops.push({ chemin: ref.chemin, data: d }); }, update(ref, d){ ops.push({ chemin: ref.chemin, data: d }); },
    delete(){}, commit: async () => { (window.__lots = window.__lots || []).push(...ops); } }; };
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// La plaque de l'encart (injoignable d'ici) : un bouchon carré.
const PLAQUE = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="120" y="160" width="890" height="840" rx="40" fill="#1d1712"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="#c44"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: /IMG_2122/.test(r.request().url()) ? PLAQUE : PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.__ouAsync = async (f, d) => { try { return await f(); } catch (e) { return d; } };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  window.ID_PARTIE_COURANTE = "P1";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.__docs = { "Systeme_Parties/P1": { Ordre_Initiative: ["H1", "H2"] } };
  window.__hex = (t) => t ? t.q + "," + t.r : null;
  window.__dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
  window.__ecran = (q, r) => { const px = window.PLATEAU_VTT.hexToPixel(q, r);
    return { x: window.VTT_POS_X + px.x * window.VTT_SCALE, y: window.VTT_POS_Y + px.y * window.VTT_SCALE }; };
  // Les héros du groupe : XP 0 → niveau 1, 1200 → 3, 2500 → 5, 6400 → 9.
  window.__heros = (liste) => liste.map(([id, prenom, xp, extra]) => ({ idPersonnage: id, prenom, camp: "Allié", xp, PV_Max: 40, PV_Actuels: 40,
    Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", ...(extra || {}) }));
});

titre("1. LA DISTANCE DE L'ENCART : 1,5× PLUS GROSSE, LE NOM S'ARRÊTE AVANT ELLE");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const reglage = window.REGLAGES_HUD && window.REGLAGES_HUD.encartDistance;
    res.reglage = reglage ? { ...reglage } : null;
    const carte = (nom) => ({ Nom: nom, Arme: "Magie", Fatigue: 30, Initiative: 40, Composants: { actions: [] },
      Effets_Compiles: [{ nom: "Attaque Magique", desc: "9 dégâts magique", isMod: false }, { nom: "Distance", desc: "5 hexagone", isMod: true }] });
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 80, Etats_Alteres: [], statut: "Vivant" },
                            { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 80, Etats_Alteres: [], statut: "Vivant" }];
    window.CACHE_COMPETENCES_GLOBAL = { M1: { LONG: carte("Hurlement putride"), COURT: carte("Trait") } };
    const montrer = async (idCarte, v) => {
      window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
                             File_Attente_Combat: [{ idPersonnage: "M1", idCarte, initiative: 50 }] };
      window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte, manche: 1, v };
      window.__ou(() => window.rafraichirVoileTour(), null);
      await new Promise(r2 => setTimeout(r2, 700));
      window.__ou(() => window.appliquerReglagesEncart(), null);
      window.__ou(() => window.rafraichirVoileTour(), null);
      await new Promise(r2 => setTimeout(r2, 150));
      const d = document.getElementById("voile-tour-distance"), c = document.getElementById("voile-tour-carte");
      const e = document.getElementById("voile-tour-encart").getBoundingClientRect();
      const bd = d.getBoundingClientRect(), bc = c.getBoundingClientRect();
      const svg = d.querySelector("svg"), bs = svg ? svg.getBoundingClientRect() : { height: 0 };
      return { visible: getComputedStyle(d).display !== "none" && bd.width > 0, texte: d.innerText.trim(),
               policeDistance: +(parseFloat(getComputedStyle(d).fontSize) / e.width * 100).toFixed(2),
               symbole: +(bs.height / e.width * 100).toFixed(2),
               chevauche: bc.right > bd.left + 1 && bc.left < bd.right - 1,
               uneLigne: c.scrollWidth <= c.clientWidth + 1, policeTitre: parseFloat(c.style.fontSize), base: parseFloat(c.dataset.base) || 26,
               largeur: e.width };
    };
    res.court = await montrer("COURT", 1);
    res.long = await montrer("LONG", 2);
    // On rétrécit la place laissée au titre (ce que fait la distance plus grosse,
    // ou un réglage de l'encart) : au battement suivant, il se réajuste.
    const c = document.getElementById("voile-tour-carte");
    const avant = parseFloat(c.style.fontSize);
    c.style.maxWidth = Math.round(c.clientWidth * 0.75) + "px";
    window.__ou(() => window.rafraichirVoileTour(), null);
    await new Promise(r2 => setTimeout(r2, 100));
    const d = document.getElementById("voile-tour-distance").getBoundingClientRect(), bc = c.getBoundingClientRect();
    res.retreci = { avant, apres: parseFloat(c.style.fontSize), uneLigne: c.scrollWidth <= c.clientWidth + 1 };
    // Et la place rendue : il regrandit.
    window.__ou(() => window.appliquerReglagesEncart(), null);
    window.__ou(() => window.rafraichirVoileTour(), null);
    await new Promise(r2 => setTimeout(r2, 100));
    res.rendu = { police: parseFloat(c.style.fontSize), uneLigne: c.scrollWidth <= c.clientWidth + 1 };
    window.EVENEMENT_ATTENDU = null;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [] };
    window.__ou(() => window.rafraichirVoileTour(), null);
    return res;
  });
  verifier("le réglage : 1,5× l'ancienne taille (3,2 % → 4,8 % de la plaque)", !!r.reglage && Math.abs(r.reglage.taille - 3.2 * 1.5) < 0.01, JSON.stringify(r.reglage));
  verifier("à l'écran, le chiffre fait bien 4,8 % de la plaque", r.court.visible && r.court.texte === "5" && Math.abs(r.court.policeDistance - 4.8) <= 0.15,
           `${r.court.texte} · ${r.court.policeDistance} % de ${Math.round(r.court.largeur)} px`);
  verifier("…et l'icône grandit avec lui (≈ 0,95 em)", Math.abs(r.court.symbole - 4.8 * 0.95) <= 0.3, `${r.court.symbole} %`);
  verifier("un titre court : à sa taille pleine, sans toucher la distance", !r.court.chevauche && r.court.uneLigne && Math.abs(r.court.policeTitre - r.court.base) < 0.5,
           JSON.stringify({ c: r.court.chevauche, l: r.court.uneLigne, p: r.court.policeTitre, b: r.court.base }));
  verifier("UN TITRE LONG : il rétrécit et s'arrête AVANT la distance, sur une ligne", r.long.visible && !r.long.chevauche && r.long.uneLigne && r.long.policeTitre < r.long.base,
           JSON.stringify({ c: r.long.chevauche, l: r.long.uneLigne, p: r.long.policeTitre, b: r.long.base }));
  verifier("LA PLACE DU TITRE RÉTRÉCIT : il se réajuste (même titre)", r.retreci.uneLigne && r.retreci.apres < r.retreci.avant, JSON.stringify(r.retreci));
  verifier("…la place rendue, il regrandit", r.rendu.uneLigne && r.rendu.police > r.retreci.apres, JSON.stringify(r.rendu));
}

titre("2. PARAMÈTRES > MONSTRES TIENT DANS L'ÉCRAN (iPad paysage et portrait)");
{
  const ouvrir = async (largeur, hauteur) => {
    await p.setViewportSize({ width: largeur, height: hauteur });
    return p.evaluate(async () => {
      document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
      const param = document.getElementById("conteneur-parametres");
      param.style.display = "block"; param.classList.add("ouvert");
      ["etape-mdp-parametres", "etape-menu-parametres", "etape-rencontres-monstres", "etape-gestion-monstres"].forEach(id => {
        const e = document.getElementById(id); if (e) { e.style.display = "none"; e.style.opacity = "0"; } });
      const m = document.getElementById("etape-menu-outils"); if (m) { m.style.display = "block"; m.style.opacity = "1"; }
      window.__collections = {};
      await window.__ouAsync(() => window.ouvrirGestionMonstres(), null);
      await new Promise(r2 => setTimeout(r2, 1000));
      const f = document.getElementById("etape-gestion-monstres");
      const entete = f.querySelector(".entete-gestion-monstres") || f.firstElementChild;
      const bf = f.getBoundingClientRect(), be = entete.getBoundingClientRect();
      const table = document.getElementById("conteneur-table-monstres");
      const res = { haut: Math.round(bf.top), bas: Math.round(bf.bottom), ecran: window.innerHeight, enteteHaut: Math.round(be.top), enteteBas: Math.round(be.bottom),
                    defile: f.scrollHeight > f.clientHeight + 1, tableVisible: getComputedStyle(table).display !== "none",
                    tableDefileASonCompte: /auto|scroll/.test(getComputedStyle(table).overflowY) && getComputedStyle(table).maxHeight !== "none" };
      // On descend tout en bas : le tableau passe sous l'en-tête s'il est assez long.
      f.scrollTop = f.scrollHeight;
      await new Promise(r2 => setTimeout(r2, 200));
      const bf2 = f.getBoundingClientRect(), be2 = entete.getBoundingClientRect();
      const th = f.querySelector(".table-monstres-ivalis th"), bt = th ? th.getBoundingClientRect() : null;
      const enregistrer = document.getElementById("btn-sauver-monstres").getBoundingClientRect();
      const tableHaut = table.getBoundingClientRect().top;
      res.apres = { defile: f.scrollTop > 0, enteteColle: Math.abs(be2.top - bf2.top) <= 4, enregistrerVisible: enregistrer.top >= bf2.top - 1 && enregistrer.bottom <= bf2.bottom,
                    // Le tableau a filé sous l'en-tête : le sien se colle juste dessous ; sinon il est à sa place, plus bas.
                    passeDessous: tableHaut < be2.bottom,
                    thSousEntete: bt ? (tableHaut < be2.bottom ? Math.abs(bt.top - be2.bottom) <= 3 : bt.top >= be2.bottom - 1) : false,
                    th: bt && Math.round(bt.top), e: Math.round(be2.bottom) };
      return res;
    });
  };
  for (const [nom, l, h] of [["paysage", 1180, 820], ["portrait", 820, 1180]]) {
    const r = await ouvrir(l, h);
    verifier(`${nom} (${l}×${h}) : LE HAUT DE LA FENÊTRE SE VOIT, son bas aussi`, r.haut >= 0 && r.bas <= r.ecran && r.enteteHaut >= 0,
             `haut ${r.haut} · bas ${r.bas} / ${r.ecran} · en-tête ${r.enteteHaut}`);
    verifier(`${nom} : le tableau est là, et c'est la fenêtre qui défile (pas un cadre à part)`, r.tableVisible && r.defile && !r.tableDefileASonCompte,
             JSON.stringify({ t: r.tableVisible, d: r.defile, cadre: r.tableDefileASonCompte }));
    verifier(`${nom} : en descendant, le titre, Enregistrer et Retour restent en haut`, r.apres.defile && r.apres.enteteColle && r.apres.enregistrerVisible, JSON.stringify(r.apres));
    verifier(`${nom} : l'en-tête du tableau se colle juste sous le leur (jamais caché dessous)`, r.apres.thSousEntete,
             `th ${r.apres.th} · en-tête ${r.apres.e} · ${r.apres.passeDessous ? "collé" : "à sa place"}`);
  }
  await p.setViewportSize({ width: 1194, height: 834 });
}

titre("3. LES VERSIONS");
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
  const vJson = essai(() => JSON.parse(lire('version.json')).version, 0);
  verifier("version 266 ou plus (trace_combat.js, version.json)", vTrace >= 266 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => [...html.matchAll(new RegExp('["/ ]' + f.replace(".", "\\.") + "\\?v=(\\d+)", "g"))].map(x => Number(x[1]));
  const ok = (f, min) => v(f).length > 0 && v(f).every(x => x >= min) && new Set(v(f)).size === 1;
  verifier("combat.js v151+, hud_disposition.js v8+, style.css v97+, monstres.js v39+, trace_combat.js v177+",
           ok("combat.js", 151) && ok("hud_disposition.js", 8) && ok("style.css", 97) && ok("monstres.js", 39) && ok("trace_combat.js", 177),
           ["combat.js", "hud_disposition.js", "style.css", "monstres.js", "trace_combat.js"].map(f => v(f).join("/")).join(" · "));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
