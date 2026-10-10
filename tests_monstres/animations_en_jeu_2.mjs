// LES ANIMATIONS DU STUDIO, IMPLANTÉES EN JEU — LA SUITE
//
// Nico, dans le Studio : « Marche case par case, marche en terrain difficile,
// marche gelée, entrée dans les zones persistantes, attaque de zone, attaque
// d'un zombie, échec de technique (Étourdi), compétence lancée sur soi : c'est
// bon, tu peux intégrer. »
//
//   1. LE NOYAU : un pas dit son terrain difficile (sauf pour qui y marche
//      comme ailleurs) et le Glacé ; une carte dit sa zone (pas une fois
//      détournée ni ratée), sa technique ratée (l'Étourdi), son retour sur
//      son lanceur (la Confusion) ; le cerveau fait voyager les cases de la
//      zone, joueur et créature ;
//   2. LE PONT : il transmet tout ça, et appelle au bon moment l'entrée de
//      zone (avant le chiffre), l'attaque de zone (après la ruée), la griffe
//      du zombie (à la place de la ruée), l'échec et le retour sur soi (sans
//      ruée) ; le jeu les branche (regime_cerveau.js, moteur_effets.js) ;
//   3. LE VRAI PLATEAU (index.html) : chaque geste, ses sons, ses mots ;
//   4. LE PION JOUÉ EN AVANCE (anticiperMarche) : la même marche que le
//      journal racontera — le coût, le terrain difficile, le Glacé.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { resoudreMouvement } from '../mouvement_pur.js';
import { resoudreCarte } from '../moteur_pur.js';
import { appliquerIntention } from '../cerveau_combat.js';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { misEnScene, creerPont } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
  idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = (extraH1 = {}) => construireEtatCombat({
  idPartie: "G", cerveau: "P_01", graine: 7,
  combattants: [fiche("H1", { idJoueur: "P_01", camp: "Allié", prenom: "Naomi", ...extraH1 }),
                fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" }),
                fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 4, r: 0 }, M2: { q: 5, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 2, Ordre_Initiative: ["H1", "M1", "M2"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }, { idPersonnage: "M1", idCarte: "C" }, { idPersonnage: "M2", idCarte: "C" }] }
});
const des = { d100: () => 99, fraction: () => 0.5, graine: () => 1, parmi: (l) => l[0] };
const plaine = { etatCase: () => ({ bloquee: false, supprimee: false, difficile: false }) };
// La case (1,0) est un terrain difficile.
const ronces = { etatCase: (q, r) => ({ bloquee: false, supprimee: false, difficile: q === 1 && r === 0 }) };
const ZONE = [{ q: 4, r: 0 }, { q: 5, r: 0 }, { q: 4, r: 1 }];
const BOULE = { nom: "Boule", valeurBrute: 10, typeRes: "Magique", isHeal: false, isShield: false, rangeMax: 6, cibles: ["M1", "M2"] };

console.log("\n1. LE NOYAU : CE QUE LE PAS ET LA CARTE DISENT À L'ÉCRAN");
{
  const pasDe = (etat, plateau) => resoudreMouvement(etat, { idLanceur: "H1", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }, des, plateau)
    .etapes.filter(e => e.type === "pas");
  const ronce = pasDe(monde(), ronces);
  verifier("le terrain difficile : le pas sur la ronce le dit, le suivant non",
           ronce.length === 2 && ronce[0].difficile === true && !ronce[1].difficile, JSON.stringify(ronce.map(p => [p.cout, !!p.difficile])));
  const geo = monde(); geo.combattants.H1.atouts = { ...(geo.combattants.H1.atouts || {}), terrainFacile: true };
  verifier("…mais pas pour qui y marche comme ailleurs (le Géomancien)", pasDe(geo, ronces).every(p => !p.difficile));
  const glace = pasDe(monde({ Etats_Alteres: [{ nom: "Glacé", duree: 2 }] }), plaine);
  verifier("le Glacé : chaque pas le dit", glace.length === 2 && glace.every(p => p.glace === true), JSON.stringify(glace.map(p => [p.cout, !!p.glace])));
  verifier("une marche ordinaire ne dit rien de neuf (les journaux d'avant se rejouent tels quels)",
           pasDe(monde(), plaine).every(p => !("difficile" in p) && !("glace" in p)));

  const carteDe = (action, etat = monde()) => resoudreCarte(etat, { type: "carte", idLanceur: "H1", idCarte: "C", jets: { parCible: {} },
                                                                    alterations: [], ...action }).etapes;
  const zone = carteDe({ attaques: [BOULE], zoneVisee: ZONE });
  const etape = zone.find(e => e.type === "carte");
  verifier("une attaque de zone : l'étape carte porte ses cases", JSON.stringify(etape.zone) === JSON.stringify(ZONE), JSON.stringify(etape.zone));
  verifier("…une carte ordinaire n'en porte pas", !("zone" in carteDe({ attaques: [BOULE] }).find(e => e.type === "carte")));
  const soin = carteDe({ attaques: [{ ...BOULE, isHeal: true }], zoneVisee: ZONE }).find(e => e.type === "carte");
  verifier("…ni un soin de zone (ce n'est pas une attaque)", !("zone" in soin));
  const surSoi = carteDe({ attaques: [{ ...BOULE, cibles: ["H1"] }], zoneVisee: ZONE, confusion: { issue: "travers", soi: true } }).find(e => e.type === "carte");
  verifier("la Confusion retourne la carte contre son lanceur : « surSoi », plus de zone", surSoi.surSoi === true && !("zone" in surSoi), JSON.stringify(surSoi));
  const etourdi = monde({ Etats_Alteres: [{ nom: "Étourdi", duree: 1 }] });
  const rate = carteDe({ attaques: [BOULE], zoneVisee: ZONE, jets: { attaqueRatee: true, parCible: {} } }, etourdi);
  const eRate = rate.find(e => e.type === "carte");
  verifier("l'Étourdi rate sa technique : la carte le dit (« rate »), sans zone, puis l'échec",
           eRate.rate === true && !("zone" in eRate) && rate.some(e => e.type === "echec" && e.raison === "Étourdi"), JSON.stringify(rate.map(e => e.type)));
  verifier("…réussie, rien de tel", !("rate" in carteDe({ attaques: [BOULE] }, etourdi).find(e => e.type === "carte")));

  // Le cerveau : les cases de la zone voyagent avec la carte demandée.
  const pas = appliquerIntention(monde(), { id: "INT_Z", type: "carte", acteur: "H1", poste: "P_01", idCarte: "C",
    attaques: [BOULE], alterations: [], coutFatigue: 10, zoneVisee: ZONE }, plaine);
  const carteCerveau = (pas.entree.etapes || []).find(e => e.type === "carte");
  verifier("le cerveau fait voyager la zone demandée jusqu'à l'étape carte", carteCerveau && JSON.stringify(carteCerveau.zone) === JSON.stringify(ZONE),
           JSON.stringify(carteCerveau && carteCerveau.zone));
  const src = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
  verifier("…la créature aussi (son emprise, choisirZone)", /zoneVisee: zone\.hexes/.test(src('cerveau_combat.js')));
  verifier("le jeu envoie l'emprise de l'attaque de zone avec la carte (moteur_effets.js, regime_cerveau.js)",
           /zoneVisee: \(state\.isZone && Array\.isArray\(state\.zoneHexesFinaux\)\)/.test(src('moteur_effets.js'))
           && /zoneVisee: carte\.zoneVisee\.map/.test(src('regime_cerveau.js')));
}

console.log("\n2. LE PONT : CHAQUE GESTE AU BON MOMENT");
{
  const etat = monde();
  etat.zones = { z1: { id: "z1", type: "electrique", hexes: [{ q: 0, r: 0 }] } };
  etat.combattants.Z1 = { ...clonerEtat(etat.combattants.M1), id: "Z1", camp: "Allié", estMonstre: true, zombie: { idMaitre: "H1" } };
  const s = (e) => misEnScene(e, etat);
  const pas = s({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 }, cout: 4, difficile: true, glace: true });
  verifier("un pas : son coût, son terrain difficile, son Glacé", pas.cout === 4 && pas.difficile === true && pas.glace === true);
  verifier("la carte d'un zombie : « zombie » (son état, ou la Morsure d'un journal d'avant)",
           s({ type: "carte", acteur: "Z1", carte: "ZOMBIE_MORSURE", cibles: ["M1"] }).zombie === true
           && s({ type: "carte", acteur: "M1", carte: "ZOMBIE_MORSURE", cibles: ["H1"] }).zombie === true
           && !s({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"] }).zombie);
  const zc = s({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], zone: ZONE, rate: true, surSoi: true });
  verifier("la carte : sa zone, sa technique ratée, son retour sur soi", JSON.stringify(zc.zone) === JSON.stringify(ZONE) && zc.rate && zc.surSoi);
  const ech = s({ type: "echec", acteur: "H1", raison: "Étourdi" }), imm = s({ type: "echec", acteur: "H1", raison: "Immobilisation" });
  verifier("l'échec de l'Étourdi a son geste ; l'Immobilisation garde son mot",
           ech.geste === "echec" && ech.texte === "Échec ! (Étourdi)" && imm.geste === "message" && imm.texte === "Échec technique !");
  const dz = s({ type: "degats", cible: "H1", montant: 4, pvApres: 56, bouclierApres: 0, zone: "z1" });
  const ez = s({ type: "etats", cible: "H1", pose: "Électrifié", liste: [], zone: "z1" });
  verifier("un coup ou un état venu d'une zone : la zone et sa nature (lue dans l'état)",
           dz.zone && dz.zone.type === "electrique" && ez.zone && ez.zone.id === "z1" && ez.pose === "Électrifié", JSON.stringify([dz.zone, ez.zone]));
  verifier("…sans zone, rien de neuf", !("zone" in s({ type: "degats", cible: "H1", montant: 4, pvApres: 56, bouclierApres: 0 })));

  const vus = [];
  const pont = creerPont({
    pas: async (d) => vus.push(["pas", d.cout, !!d.difficile, !!d.glace]),
    ruee: async () => vus.push(["ruee"]),
    projectile: async () => vus.push(["projectile"]),
    jauge: () => vus.push(["jauge"]),
    message: (pion, texte) => vus.push(["message", texte]),
    marche: async (d) => vus.push(["zone", d.zone.type, d.etat || null]),
    zoneCarte: async (d) => vus.push(["zoneCarte", d.cases.length, d.cibles.join(",")]),
    zombie: async (d) => vus.push(["zombie", d.pion, d.cible]),
    echec: async (d) => vus.push(["echec", d.texte]),
    surSoi: async (d) => vus.push(["surSoi", d.pion]),
    pause: async () => {}
  });
  const jouer = async (e) => { vus.length = 0; await pont.animer(e, etat); return JSON.stringify(vus); };
  verifier("le pas part avec son coût, son terrain, son Glacé",
           await jouer({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 }, cout: 4, difficile: true, glace: true }) === '[["pas",4,true,true]]');
  verifier("l'entrée de zone AVANT le chiffre", await jouer({ type: "degats", cible: "H1", montant: 4, pvApres: 56, bouclierApres: 0, zone: "z1" })
           === '[["zone","electrique",null],["jauge"]]');
  verifier("l'état posé par la zone se dit", await jouer({ type: "etats", cible: "H1", pose: "Électrifié", liste: [], zone: "z1" }) === '[["zone","electrique","Électrifié"]]');
  const tirZone = await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1", "M2"], projectile: "boule", zone: ZONE });
  verifier("l'attaque de zone : la ruée, le tir, PUIS les cases qui explosent", tirZone === '[["ruee"],["projectile"],["zoneCarte",3,"M1,M2"]]', tirZone);
  verifier("le zombie griffe À LA PLACE de la ruée", await jouer({ type: "carte", acteur: "Z1", carte: "ZOMBIE_MORSURE", cibles: ["M1"] }) === '[["zombie","Z1","M1"]]');
  verifier("une technique ratée ne s'élance pas ; l'échec a son geste",
           await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], projectile: "boule", rate: true }) === '[]'
           && await jouer({ type: "echec", acteur: "H1", raison: "Étourdi" }) === '[["echec","Échec ! (Étourdi)"]]');
  verifier("la carte retournée contre son lanceur lui revient dessus, sans ruée ni tir",
           await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["H1"], projectile: "boule", surSoi: true }) === '[["surSoi","H1"]]');
  verifier("l'Immobilisation : son mot, comme avant", await jouer({ type: "echec", acteur: "H1", raison: "Immobilisation" }) === '[["message","Échec technique !"]]');
  const regime = fs.readFileSync('/home/user/Ivalis/regime_cerveau.js', 'utf-8');
  verifier("le jeu branche les cinq gestes (regime_cerveau.js → animations_jeu.js)",
           ["marche: (d) => window.animerEntreeZoneCombat", "zoneCarte: (d) => window.animerAttaqueZoneCombat", "zombie: (d) => window.animerAttaqueZombieCombat",
            "echec: (d) => window.animerEchecCombat", "surSoi: (d) => window.animerCarteSurSoiCombat"].every(t => regime.includes(t)));
}

// =========================================================================
//  3. LE VRAI PLATEAU
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
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
                          f("Z1", { prenom: "Zombie", estMonstre: true, zombie: true }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Goule" }), f("M2", { camp: "Ennemi", estMonstre: true, prenom: "Spectre" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, url, taille: 55 }, H2: { q: -3, r: 2, url, taille: 55 }, Z1: { q: 3, r: 1, taille: 55 },
                             M1: { q: 4, r: 0, taille: 55 }, M2: { q: 5, r: 0, taille: 55 } };
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
  window.__sonder = (selecteur) => {
    let max = 0; let fini = false;
    const tour = () => { max = Math.max(max, document.querySelectorAll(selecteur).length); if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return max; };
  };
  // Les images clés jouées sur un pion (le petit saut, une secousse).
  window.__images = (id) => {
    const el = document.getElementById("token-" + id), vues = new Set(), images = []; let fini = false;
    const tour = () => { el.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => k.transform || "")); } });
                         if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return images; };
  };
  window.__surCase = (id, c) => {
    const el = document.getElementById("token-" + id);
    const px = window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    return !!el && +el.dataset.q === c.q && +el.dataset.r === c.r
      && Math.abs(parseFloat(el.style.left) - px.x) < 1 && Math.abs(parseFloat(el.style.top) - px.y) < 1
      && el.getAnimations().length === 0;
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n3. LA MARCHE SUR LE VRAI PLATEAU");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const saut = (k) => k.length === 4 && /scale\(1\.1\d?\)/.test(k[1]) && /scale\(0\.95\)/.test(k[2]);
    // La marche case par case.
    window.__noter();
    let images = window.__images("H1"); let t0 = performance.now();
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 }, cout: 2 });
    res.marcheMs = performance.now() - t0;
    await window.__attendre(120);
    res.marche = { sorte: window.sortePasDeCombat({ idToken: "H1" }), sauts: images().filter(saut).length, sons: window.__sons, textes: window.__textes,
                   surCase: window.__surCase("H1", { q: 1, r: 0 }) };
    // Une case gratuite ne dit rien.
    window.__noter();
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 1, r: 0 }, vers: { q: 2, r: 0 }, cout: 0 });
    await window.__attendre(120);
    res.gratuit = window.__textes;
    // Le terrain difficile.
    window.__noter();
    images = window.__images("H1"); t0 = performance.now();
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 2, r: 0 }, vers: { q: 2, r: 1 }, cout: 4, difficile: true });
    res.difficileMs = performance.now() - t0;
    await window.__attendre(120);
    res.difficile = { sorte: window.sortePasDeCombat({ idToken: "H1", difficile: true }), sauts: images().filter(saut).length, sons: window.__sons,
                      textes: window.__textes, surCase: window.__surCase("H1", { q: 2, r: 1 }) };
    // La marche gelée : deux pas d'un trajet.
    window.__noter();
    const cristaux = window.__sonder("#conteneur-tokens-vtt .anim-cristaux");
    images = window.__images("H1");
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 2, r: 1 }, vers: { q: 1, r: 1 }, cout: 4, glace: true });
    const t1 = [...window.__textes];
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 1, r: 1 }, vers: { q: 0, r: 1 }, cout: 4, glace: true });
    await window.__attendre(150);
    const imgs = images();
    res.gelee = { sorte: window.sortePasDeCombat({ idToken: "H1", glace: true }), cristaux: cristaux(), sons: window.__sons, t1,
                  t2: window.__textes.slice(t1.length), sauts: imgs.filter(saut).length,
                  teinte: [...document.querySelectorAll("#token-H1, #token-H1 *")].some(e => /hue-rotate\(170deg\)/.test(e.style.filter || "")),
                  surCase: window.__surCase("H1", { q: 0, r: 1 }) };
    return res;
  });
  verifier("la marche case par case : un petit saut, le pas sur l'herbe, « -2 ⚡ » au-dessus",
           r.marche.sorte === "marche" && r.marche.sauts === 1 && r.marche.sons.includes("pas-herbe") && r.marche.textes.includes("-2 ⚡") && r.marche.surCase,
           JSON.stringify(r.marche));
  verifier("…une case gratuite ne dit rien", !r.gratuit.some(t => /⚡/.test(t)), JSON.stringify(r.gratuit));
  verifier("le terrain difficile : la même marche, plus lente, plus lourde, « -4 ⚡ »",
           r.difficile.sorte === "difficile" && r.difficile.sauts === 1 && r.difficile.sons.includes("pas-lourd") && r.difficile.textes.includes("-4 ⚡")
           && r.difficileMs > r.marcheMs * 1.3 && r.difficile.surCase, `${Math.round(r.difficileMs)} ms contre ${Math.round(r.marcheMs)} — ${JSON.stringify(r.difficile)}`);
  verifier("la marche gelée : la même marche, des cristaux dessous, la glace qui craque",
           r.gelee.sorte === "gelee" && r.gelee.sauts === 2 && r.gelee.cristaux >= 1 && r.gelee.sons.filter(s => s === "pas-glace").length === 2 && r.gelee.surCase,
           JSON.stringify(r.gelee));
  verifier("…« Glacé : marche ×2 » au premier pas seulement, rien sur le pion",
           r.gelee.t1.includes("Glacé : marche ×2") && !r.gelee.t2.includes("Glacé : marche ×2") && !r.gelee.teinte, JSON.stringify([r.gelee.t1, r.gelee.t2]));
}

console.log("\n4. LES ZONES, L'ATTAQUE DE ZONE, LE ZOMBIE, L'ÉCHEC, LE RETOUR SUR SOI");
{
  const r = await p.evaluate(async () => {
    const res = {};
    // L'entrée dans une zone, nature par nature.
    for (const type of ["feu", "glace", "electrique", "poison"]) {
      window.__noter();
      const eclairs = window.__sonder("#conteneur-tokens-vtt .anim-effet polyline");
      const cristaux = window.__sonder("#conteneur-tokens-vtt .anim-cristaux");
      await window.animerEntreeZoneCombat({ pion: "H2", zone: { id: "z_" + type, type } });
      await window.__attendre(80);
      res[type] = { sons: window.__sons, eclairs: eclairs(), cristaux: cristaux() };
    }
    // Un coup PUIS un état venus de la même zone, au même pas : la case ne réagit qu'une fois.
    window.__noter();
    await window.animerEntreeZoneCombat({ pion: "H2", zone: { id: "z_elec2", type: "electrique" } });
    await window.animerEntreeZoneCombat({ pion: "H2", zone: { id: "z_elec2", type: "electrique" }, etat: "Électrifié" });
    await window.__attendre(80);
    res.double = { sons: window.__sons, textes: window.__textes };
    // L'attaque de zone.
    await window.__attendre(1600);
    window.__noter();
    const cases = window.__sonder("#conteneur-tokens-vtt .anim-case-zone");
    const secousses = window.__images("M2");
    await window.animerAttaqueZoneCombat({ pion: "H1", cases: [{ q: 4, r: 0 }, { q: 5, r: 0 }, { q: 4, r: 1 }], cibles: ["M1", "M2"] });
    res.zone = { cases: cases(), sons: window.__sons, secousses: secousses().length };
    await window.__attendre(1300);
    res.zone.reste = document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length;
    // Le zombie.
    window.__noter();
    const traits = window.__sonder("#conteneur-tokens-vtt .entaille-lame");
    await window.animerAttaqueZombieCombat({ pion: "Z1", cible: "M1" });
    await window.__attendre(80);
    res.zombie = { sons: window.__sons, traits: traits(), surCase: window.__surCase("Z1", { q: 3, r: 1 }) };
    // L'échec de l'Étourdi.
    await window.__attendre(1500);
    window.__noter();
    const icone = window.__sonder("#conteneur-tokens-vtt .anim-effet");
    let vu = false; const guet = setInterval(() => { if ([...document.querySelectorAll("#conteneur-tokens-vtt .anim-effet")].some(e => e.textContent.includes("💫"))) vu = true; }, 30);
    await window.animerEchecCombat({ pion: "H1", texte: "Échec ! (Étourdi)", couleur: "#ffb347" });
    clearInterval(guet);
    res.echec = { sons: window.__sons, textes: window.__textes, etourdi: vu, effets: icone() };
    // La carte retournée contre son lanceur.
    await window.__attendre(1500);
    window.__noter();
    let question = false; const guet2 = setInterval(() => { if ([...document.querySelectorAll("#conteneur-tokens-vtt .anim-effet")].some(e => e.textContent.includes("❓"))) question = true; }, 30);
    const orbes = window.__sonder('#conteneur-tokens-vtt .anim-effet[style*="radial-gradient"]');
    await window.animerCarteSurSoiCombat({ pion: "H1" });
    clearInterval(guet2);
    res.surSoi = { sons: window.__sons, question, orbes: orbes() };
    return res;
  });
  verifier("une zone de feu : le brasier monte (son « brûle »)", r.feu.sons.includes("brule"), JSON.stringify(r.feu));
  verifier("une zone de glace : la glace saisit, des cristaux", r.glace.sons.includes("glace-impact") && r.glace.cristaux >= 1, JSON.stringify(r.glace));
  verifier("une zone électrique : la décharge (son électrique), des éclairs", r.electrique.sons.includes("decharge") && r.electrique.eclairs >= 3, JSON.stringify(r.electrique));
  verifier("une zone de poison : ça bouillonne", r.poison.sons.includes("poison-bulles"), JSON.stringify(r.poison));
  verifier("un coup puis un état de la même zone : la case réagit une fois, « Électrifié ! » se dit",
           r.double.sons.filter(s => s === "decharge").length === 1 && r.double.textes.includes("Électrifié !"), JSON.stringify(r.double));
  verifier("l'attaque de zone : ses trois cases rougeoient puis explosent, ceux qui y sont secoués",
           r.zone.cases === 3 && r.zone.sons.includes("zone-explosion") && r.zone.secousses >= 1, JSON.stringify(r.zone));
  verifier("…et rien ne reste", r.zone.reste === 0, String(r.zone.reste));
  verifier("le zombie : il gémit, griffe de trois traits, et reste sur sa case",
           r.zombie.sons.includes("zombie") && r.zombie.sons.includes("griffe") && r.zombie.traits === 3 && r.zombie.surCase, JSON.stringify(r.zombie));
  verifier("l'échec de l'Étourdi : l'énergie qui fuse, 💫, « Échec ! (Étourdi) »",
           r.echec.sons.includes("energie") && r.echec.sons.includes("echec") && r.echec.etourdi && r.echec.textes.includes("Échec ! (Étourdi)"), JSON.stringify(r.echec));
  verifier("la carte retournée contre son lanceur : ❓, l'orbe qui part et revient, l'impact",
           r.surSoi.sons.includes("confusion") && r.surSoi.sons.includes("impact-magique") && r.surSoi.question && r.surSoi.orbes >= 1, JSON.stringify(r.surSoi));
}

console.log("\n5. LE PION JOUÉ EN AVANCE : LA MÊME MARCHE QUE LE JOURNAL");
{
  const r = await p.evaluate(async () => {
    await window.__attendre(1200);
    window.TOKENS_VTT_DATA.H2 = { ...window.TOKENS_VTT_DATA.H2, q: -3, r: 2 };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "H2").Etats_Alteres = [{ nom: "Glacé", duree: 2 }];
    window.etatCaseCombat = (q, r) => ({ isBlocked: false, isDeleted: false, isDifficult: q === -1 && r === 2 });
    const joues = [], vrai = window.jouerAnimationPas;
    window.jouerAnimationPas = (pas) => { joues.push({ cout: pas.cout, difficile: !!pas.difficile, glace: !!pas.glace }); return vrai(pas); };
    window.anticiperMarche("H2", [{ q: -2, r: 2 }, { q: -1, r: 2 }], { couts: [4, 8] });
    await window.__attendre(2200);
    window.jouerAnimationPas = vrai;
    window.fermerAnticipationMarche();
    delete window.etatCaseCombat;
    return { joues, src: document.querySelector('script[src*="mouvement.js"]') ? "" : "" };
  });
  verifier("chaque pas joué en avance porte son coût, le Glacé, et la ronce sous le second",
           JSON.stringify(r.joues) === JSON.stringify([{ cout: 4, difficile: false, glace: true }, { cout: 8, difficile: true, glace: true }]), JSON.stringify(r.joues));
  const mvt = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8');
  verifier("le tracé validé passe le coût de chaque case à la marche jouée en avance",
           /const couts = window\.CHEMIN_MOUVEMENT\.map\(step => Number\(step\.cost\) \|\| 0\);/.test(mvt) && /window\.anticiperMarche\(idPerso, chemin, \{ couts \}\)/.test(mvt));
}

// Pour les yeux : l'attaque de zone, la marche gelée.
if (process.env.CAPTURE_DIR) {
  await p.evaluate(() => { window.animerAttaqueZoneCombat({ pion: "H1", cases: [{ q: 4, r: 0 }, { q: 5, r: 0 }, { q: 4, r: 1 }, { q: 5, r: -1 }], cibles: ["M1", "M2"] }); });
  await p.waitForTimeout(820);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_attaque_zone.png`, clip: { x: 500, y: 330, width: 330, height: 270 } });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.jouerAnimationPas({ idToken: "H1", de: { q: 0, r: 1 }, vers: { q: 1, r: 1 }, cout: 4, glace: true }); });
  await p.waitForTimeout(470);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_marche_gelee.png`, clip: { x: 320, y: 280, width: 300, height: 230 } });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { window.animerEntreeZoneCombat({ pion: "H2", zone: { id: "z_cap", type: "electrique" } }); });
  await p.waitForTimeout(160);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_zone_electrique.png`, clip: { x: 140, y: 240, width: 280, height: 230 } });
  await p.waitForTimeout(800);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
