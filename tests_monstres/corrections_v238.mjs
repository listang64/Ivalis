// LA CONFUSION ET L'ÉTOURDI DU STUDIO, INTÉGRÉS EN JEU (v238).
//
// Nico : « Confusion se frappe soi-même : on garde, tu peux intégrer.
// Confusion attaque un allié au hasard : on garde, tu peux intégrer. Confusion
// dissipée : on garde, tu peux intégrer. Étourdi : on garde, tu peux
// intégrer. »
//
//   1. LE NOYAU : la carte détournée sur un allié le dit (« surAllie »), comme
//      celle retournée contre son lanceur (« surSoi ») ; les mots de la
//      Confusion disent ce qu'ils sont (`confusion` : soi, allie, dissipee) ;
//   2. LE PONT : le confus qui frappe un allié a son geste AVANT l'attaque ;
//      celui qui se frappe reçoit qui est vraiment touché ; le mot déjà dit
//      par le geste n'est pas redit ; la confusion dissipée a son geste, qui
//      dit le mot ; l'Étourdi posé a le sien ;
//   3. LE VRAI PLATEAU : chaque geste, ses sons, ses mots — et aucun doublon
//      (le coup reçu du confus qui se frappe, le mot qui suit la carte).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { resoudreCarte, dissiperConfusion } from '../moteur_pur.js';
import { construireEtatCombat } from '../combat_etat.js';
import { misEnScene, creerPont } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
  idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = () => construireEtatCombat({
  idPartie: "P", cerveau: "P_01", graine: 3,
  combattants: [fiche("MOI", "Allié", { idJoueur: "P_01", Etats_Alteres: [{ nom: "Confusion", duree: 3 }] }),
                fiche("AMI", "Allié", { idJoueur: "P_02" }), fiche("ORC", "Ennemi", { estMonstre: true })],
  positions: { MOI: { q: 0, r: 0 }, AMI: { q: 1, r: 0 }, ORC: { q: 0, r: 2 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["MOI", "ORC", "AMI"],
            File_Attente_Combat: [{ idPersonnage: "MOI", idCarte: "C1" }] }
});
const COUP = { valeurBrute: 10, rangeMax: 3, typeRes: "Physique", isHeal: false, isShield: false };
const carteDe = (cibles, confusion, extra = {}) => resoudreCarte(monde(), { type: "carte", idLanceur: "MOI", idCarte: "C1", jets: { parCible: {} },
  attaques: [{ ...COUP, cibles }], alterations: [], confusion, ...extra }).etapes;

console.log("\n1. LE NOYAU : CE QUE LA CARTE ET LES MOTS DE LA CONFUSION DISENT À L'ÉCRAN");
{
  const allie = carteDe(["AMI"], { issue: "travers", soi: false, hasard: true, idCible: "AMI" });
  const cA = allie.find(e => e.type === "carte"), mA = allie.find(e => e.type === "message" && /allié/.test(e.texte));
  verifier("la carte détournée sur un allié le dit : « surAllie » (et pas « surSoi »)", cA.surAllie === true && !cA.surSoi, JSON.stringify(cA));
  verifier("…son mot dit ce qu'il est (confusion : « allie »), toujours après la carte",
           mA && mA.confusion === "allie" && mA.texte === "Confus : attaque un allié !" && allie.indexOf(mA) > allie.indexOf(cA));
  const soi = carteDe(["MOI"], { issue: "travers", soi: true, hasard: false });
  const cS = soi.find(e => e.type === "carte"), mS = soi.find(e => e.type === "message" && /inflige/.test(e.texte));
  verifier("la carte retournée contre son lanceur : « surSoi », et qui est vraiment touché (lui)",
           cS.surSoi === true && !cS.surAllie && Array.isArray(cS.touches) && cS.touches.includes("MOI"), JSON.stringify(cS));
  verifier("…son mot : confusion « soi »", mS && mS.confusion === "soi");
  const net = carteDe(["ORC"], undefined).find(e => e.type === "carte");
  verifier("une carte ordinaire ne dit rien de neuf (les journaux d'avant se rejouent tels quels)", !("surAllie" in net) && !("surSoi" in net));
  const etat = monde();
  const diss = dissiperConfusion(etat, "MOI");
  verifier("la confusion dissipée : son mot dit ce qu'il est (confusion « dissipee »), en vert",
           diss[0].type === "message" && diss[0].confusion === "dissipee" && diss[0].texte === "Confusion dissipée !" && diss[0].couleur === "#33cc66");
  const fuite = carteDe(["ORC"], { issue: "fuite", fuite: true, annulee: true });
  verifier("la fuite et le « ne fait rien » ne portent pas de geste neuf", fuite.every(e => !e.confusion));
}

console.log("\n2. LE PONT : CHAQUE GESTE AU BON MOMENT, ET PAS DE MOT DIT DEUX FOIS");
{
  const etat = monde();
  const s = (e) => misEnScene(e, etat);
  verifier("la carte : « surAllie » passe", s({ type: "carte", acteur: "MOI", carte: "C1", cibles: ["AMI"], surAllie: true }).surAllie === true);
  const dit = s({ type: "message", cible: "MOI", acteur: "MOI", texte: "Confus : attaque un allié !", couleur: "#cc66ff", confusion: "allie" });
  verifier("le mot de la carte détournée : une réaction « confusion-dit » qui REMPLACE le mot",
           dit.reaction && dit.reaction.sorte === "confusion-dit" && dit.reaction.remplace === true && dit.reaction.texte === "Confus : attaque un allié !", JSON.stringify(dit.reaction));
  const dis = s({ type: "message", cible: "MOI", acteur: "MOI", texte: "Confusion dissipée !", couleur: "#33cc66", confusion: "dissipee" });
  verifier("la confusion dissipée : son geste, qui dit le mot (en vert)",
           dis.reaction && dis.reaction.sorte === "confusion-dissipee" && dis.reaction.remplace === true && dis.reaction.couleur === "#33cc66");
  verifier("un mot ordinaire n'a pas de geste", !("reaction" in s({ type: "message", cible: "MOI", texte: "Plus d'énergie" })));
  const et = s({ type: "etats", cible: "ORC", pose: "Étourdi", liste: [{ nom: "Étourdi", duree: 1 }] });
  verifier("l'Étourdi posé : son geste (à côté de l'état)", et.geste === "etats" && et.reaction && et.reaction.sorte === "etourdi" && !et.reaction.remplace);
  // (v242 : Brûlé, Glacé, Provocation… ont désormais le leur — corrections_v242.mjs.)
  verifier("…un état sans geste du Studio, non", !("reaction" in s({ type: "etats", cible: "ORC", pose: "Saignement", liste: [] })));

  const vus = [];
  const pont = creerPont({
    ruee: async () => vus.push(["ruee"]),
    message: (pion, texte) => vus.push(["message", texte]),
    surSoi: async (d) => vus.push(["surSoi", d.pion, d.touches || null]),
    attaque: async (d) => { vus.push(["attaque", d.cibles.join(",")]); return true; },
    reaction: async (d) => { vus.push(["reaction", d.sorte, d.texte || null]); return d.sorte === "confusion-dit" ? d.texte === "Confus : attaque un allié !" : true; },
    pause: async () => {}
  });
  const jouer = async (e) => { vus.length = 0; await pont.animer(e, etat); return JSON.stringify(vus); };
  const a = await jouer({ type: "carte", acteur: "MOI", carte: "C1", cibles: ["AMI"], surAllie: true, frappe: "epee", touches: ["AMI"] });
  verifier("frapper un allié : le geste de la Confusion PUIS l'attaque", a === '[["reaction","confusion-allie","Confus : attaque un allié !"],["attaque","AMI"]]', a);
  const so = await jouer({ type: "carte", acteur: "MOI", carte: "C1", cibles: ["MOI"], surSoi: true, touches: ["MOI"] });
  verifier("se frapper soi-même : le geste reçoit qui est vraiment touché", so === '[["surSoi","MOI",["MOI"]]]', so);
  verifier("le mot déjà dit par le geste n'est pas redit",
           await jouer({ type: "message", cible: "MOI", acteur: "MOI", texte: "Confus : attaque un allié !", confusion: "allie" }) === '[["reaction","confusion-dit","Confus : attaque un allié !"]]');
  verifier("…pas dit (le geste n'a pas pu se jouer) : le mot reste",
           await jouer({ type: "message", cible: "MOI", acteur: "MOI", texte: "Confus : s'inflige sa propre compétence !", confusion: "soi" })
           === '[["reaction","confusion-dit","Confus : s\'inflige sa propre compétence !"],["message","Confus : s\'inflige sa propre compétence !"]]');
  verifier("la confusion dissipée : son geste seul (il dit le mot)",
           await jouer({ type: "message", cible: "MOI", acteur: "MOI", texte: "Confusion dissipée !", couleur: "#33cc66", confusion: "dissipee" })
           === '[["reaction","confusion-dissipee","Confusion dissipée !"]]');
  verifier("l'Étourdi posé : son geste", await jouer({ type: "etats", cible: "ORC", pose: "Étourdi", liste: [] }) === '[["reaction","etourdi",null]]');
}

// =========================================================================
//  3. LE VRAI PLATEAU
// =========================================================================
const RACINE = '/home/user/Ivalis';
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
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>` }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1800);

await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.sequenceTourEnAttente = () => false;
  const s = 36;
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 420 + 1.5 * s * q, y: 330 + s * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }),
    pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, hexSize: s
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  const f = (id, extra) => Object.assign({ idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }, extra || {});
  window.PERSOS_PARTIE = [f("H1", { prenom: "Naomi", race: "Humain" }), f("H2", { prenom: "Ben", race: "Humain" }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Goule" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, url, taille: 55 }, H2: { q: 1, r: 0, url, taille: 55 }, M1: { q: 3, r: 0, taille: 55 } };
  window.ZONES_PERSISTANTES = {};
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 2, File_Attente_Combat: [] };
  window.DELAI_DEPLOIEMENT_MS = 0;
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  window.__sons = []; window.__textes = [];
  const vraiSon = window.jouerSonCombat;
  window.jouerSonCombat = (id, f) => { window.__sons.push(id); return vraiSon(id, f); };
  const vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { window.__textes.push(t); return vraiTexte(q, r, t, c, o); };
  window.__noter = () => { window.__sons = []; window.__textes = []; };
  // Ce qui passe dans le calque des pions (le texte des effets posés, leurs classes).
  window.__guetter = () => {
    const vus = { textes: new Set(), classes: new Set(), lames: 0 }; let fini = false;
    const tour = () => {
      document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").forEach(e => { vus.textes.add((e.textContent || "").trim()); e.classList.forEach(c => vus.classes.add(c)); });
      vus.lames = Math.max(vus.lames, document.querySelectorAll("#conteneur-tokens-vtt .entaille-lame").length);
      if (!fini) requestAnimationFrame(tour);
    };
    requestAnimationFrame(tour);
    return () => { fini = true; return { textes: [...vus.textes].join(" "), classes: [...vus.classes], lames: vus.lames }; };
  };
  window.__animsDe = (id) => {
    const el = document.getElementById("token-" + id), vues = new Set(), images = []; let fini = false;
    const tour = () => { el.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => (k.transform || "") + "|" + (k.filter || ""))); } });
                         if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return images; };
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n3. LE VRAI PLATEAU : SE FRAPPER, FRAPPER UN ALLIÉ, LA CONFUSION DISSIPÉE, L'ÉTOURDI");
{
  const r = await p.evaluate(async () => {
    const res = {};
    // SE FRAPPER SOI-MÊME (une carte qui attaque, et le touche).
    window.__noter();
    let g = window.__guetter(); let a = window.__animsDe("H1");
    await window.animerCarteSurSoiCombat({ pion: "H1", touches: ["H1"] });
    res.soi = { ...g(), sons: window.__sons, textes2: window.__textes, anims: a().length };
    // L'étape des dégâts qui suit : le coup reçu est déjà montré (pas de second).
    window.__noter();
    res.soi.coupApres = await window.animerReactionCombat({ sorte: "coup-physique", pion: "H1" });
    res.soi.sonsApres = window.__sons;
    // Le mot qui suit la carte : déjà dit (une fois), puis plus rien à retenir.
    res.soi.motDit = await window.animerReactionCombat({ sorte: "confusion-dit", pion: "H1", texte: "Confus : s'inflige sa propre compétence !" });
    res.soi.motRedit = await window.animerReactionCombat({ sorte: "confusion-dit", pion: "H1", texte: "Confus : s'inflige sa propre compétence !" });
    await window.__attendre(1600);
    // Une carte sans attaque (un soin) qu'il se donne : le ❓, le mot, la lueur — pas d'entaille.
    window.__noter();
    g = window.__guetter();
    await window.animerCarteSurSoiCombat({ pion: "H1" });
    res.soin = { ...g(), sons: window.__sons, textes2: window.__textes };
    await window.__attendre(1600);
    // FRAPPER UN ALLIÉ AU HASARD : le geste de la Confusion, puis le coup d'épée sur l'allié.
    window.__noter();
    g = window.__guetter(); a = window.__animsDe("H1");
    const t0 = performance.now();
    res.allie = { joue: await window.animerReactionCombat({ sorte: "confusion-allie", pion: "H1", texte: "Confus : attaque un allié !", couleur: "#cc66ff" }) };
    res.allie.ms = performance.now() - t0;
    res.allie.attaque = await window.animerAttaqueCombat({ pion: "H1", cibles: ["H2"], frappe: "epee", touches: ["H2"], carte: "C1" });
    Object.assign(res.allie, g(), { sons: window.__sons, textes2: window.__textes, filtres: a().flat().filter(x => /hue-rotate\(225deg\)/.test(x)).length });
    res.allie.motDit = await window.animerReactionCombat({ sorte: "confusion-dit", pion: "H1", texte: "Confus : attaque un allié !" });
    await window.__attendre(1600);
    // LA CONFUSION DISSIPÉE.
    window.__noter();
    g = window.__guetter(); a = window.__animsDe("H1");
    res.dissipee = { joue: await window.animerReactionCombat({ sorte: "confusion-dissipee", pion: "H1", texte: "Confusion dissipée !", couleur: "#33cc66" }) };
    await window.__attendre(60);
    Object.assign(res.dissipee, g(), { sons: window.__sons, textes2: window.__textes, filtres: a().flat().filter(x => /hue-rotate\(225deg\)/.test(x)).length });
    await window.__attendre(1500);
    // L'ÉTOURDI posé.
    window.__noter();
    g = window.__guetter(); a = window.__animsDe("M1");
    const t1 = performance.now();
    res.etourdi = { joue: await window.animerReactionCombat({ sorte: "etourdi", pion: "M1" }) };
    res.etourdi.ms = performance.now() - t1;
    Object.assign(res.etourdi, g(), { sons: window.__sons, textes2: window.__textes, vacille: a().some(k => k.some(x => /rotate\(-9deg\)/.test(x))) });
    await window.__attendre(1500);
    res.reste = document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length;
    const el = document.getElementById("token-H1");
    res.net = el.getAnimations().length === 0 && getComputedStyle(el).filter === "none";
    return res;
  });
  verifier("se frapper : le ❓, son mot, l'entaille sur son propre pion, la chair entaillée",
           r.soi.textes.includes("❓") && r.soi.textes2.includes("Confus : s'inflige sa propre compétence !") && r.soi.lames >= 1
           && r.soi.sons.includes("confusion") && r.soi.sons.includes("entaille-chair"), JSON.stringify(r.soi));
  verifier("…le coup reçu de l'étape des dégâts n'est pas rejoué (déjà montré)", r.soi.coupApres === true && r.soi.sonsApres.length === 0, JSON.stringify(r.soi.sonsApres));
  verifier("…le mot qui suit la carte n'est pas redit — une fois, pas deux", r.soi.motDit === true && r.soi.motRedit === false);
  verifier("un soin qu'il se donne : le ❓ et le mot, sans entaille ni sang",
           r.soin.textes.includes("❓") && r.soin.lames === 0 && !r.soin.sons.includes("entaille-chair") && r.soin.textes2.includes("Confus : s'inflige sa propre compétence !"),
           JSON.stringify(r.soin));
  verifier("frapper un allié : le ❓ et « Confus : attaque un allié ! » sur le confus, en violet, AVANT le coup",
           r.allie.joue === true && r.allie.textes.includes("❓") && r.allie.textes2[0] === "Confus : attaque un allié !" && r.allie.filtres >= 1 && r.allie.ms >= 400,
           JSON.stringify({ textes2: r.allie.textes2, ms: Math.round(r.allie.ms), filtres: r.allie.filtres }));
  verifier("…puis le coup d'épée sur l'allié ; le mot qui suit n'est pas redit",
           r.allie.attaque === true && r.allie.lames >= 1 && r.allie.sons.includes("entaille-chair") && r.allie.motDit === true, JSON.stringify(r.allie.sons));
  verifier("la confusion dissipée : les « ? » qui tournent, le son, « Confusion dissipée ! », la teinte violette qui s'efface",
           r.dissipee.joue === true && /\?/.test(r.dissipee.textes) && r.dissipee.sons.includes("dissipe") && r.dissipee.textes2.includes("Confusion dissipée !")
           && r.dissipee.filtres >= 2, JSON.stringify(r.dissipee));
  verifier("l'Étourdi : les étoiles, « Étourdi ! », le son, il vacille",
           r.etourdi.joue === true && /✦/.test(r.etourdi.textes) && r.etourdi.textes2.includes("Étourdi !") && r.etourdi.sons.includes("etourdi") && r.etourdi.vacille
           && r.etourdi.ms > 1000, JSON.stringify({ ...r.etourdi, ms: Math.round(r.etourdi.ms) }));
  verifier("rien ne reste, et le pion est net", r.reste === 0 && r.net, String(r.reste));
}

console.log("\n4. LE JEU LES BRANCHE");
{
  const jeu = fs.readFileSync(`${RACINE}/animations_jeu.js`, 'utf-8');
  verifier("les gestes en jeu (animations_jeu.js → animations_catalogue.js)",
           /"confusion-allie": "jeu-confusion-allie"/.test(jeu) && /"confusion-dissipee": "jeu-confusion-dissipee"/.test(jeu) && /etourdi: "jeu-etourdi"/.test(jeu));
  const cat = fs.readFileSync(`${RACINE}/animations_catalogue.js`, 'utf-8');
  verifier("…et le Studio garde les siens, tels quels",
           ["confusion-soi", "confusion-allie", "confusion-dissipee", "etourdi"].every(id => cat.includes(`id: "${id}", nom:`)));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
