// LES ÉLÉMENTS DES SORTS, ET LES RÉSISTANCES DES CRÉATURES.
//
// Nico : « Une attaque magique (hors Mot de pouvoir) sera toujours liée à un
// élément. Au moment où l'on sélectionne Attaque magique, une popup s'ouvre
// avec un élément au choix à cliquer parmi ceux présents dans le jeu — de
// beaux boutons ronds. Et l'attaque se met dans la Forge avec en sous-effet
// gratuit 5 % de chance de brûler, électrifier, glacer selon l'élément, que
// l'on peut monter en % comme un sous-effet classique. Si un personnage ou
// ennemi est insensible au gel, à la brûlure ou à l'électrique, un sort de la
// même nature lancé contre lui fera −20 % de dégâts. Et une résistance
// aléatoire pour chaque ennemi à partir de Normal : 1 résistance, les Élites
// 2, les Boss 3. »
//   - Feu → Brûlé, Foudre → Électrifié, Glace → Glacé (ELEMENTS_MAGIQUES) ;
//   - l'élément voyage sur l'attaque (etatElement) jusqu'au noyau, qui retire
//     20 % si la cible est insensible à cet état (chaineDeDegats) ;
//   - résister à un élément = être insensible à son état (immunites).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat } from '../combat_etat.js';
import { resoudreCarte, chaineDeDegats, REDUCTION_SORT_RESISTE } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = (fiches) => {
    const pos = {}; fiches.forEach((f, i) => { pos[f.idPersonnage] = { q: i, r: 0 }; });
    const e = construireEtatCombat({ idPartie: "P", cerveau: "H", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = fiches.map(f => f.idPersonnage);
    e.phase = "Resolution";
    return e;
};
const sort = (e, cible, element, valeur = 50, etats = {}) => {
    const el = w.elementMagique(element);
    return resoudreCarte(e, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
        attaques: [{ nom: "Attaque Magique", valeurBrute: valeur, typeRes: "Magique", cibles: [cible],
                     ...(el ? { element: el.id, etatElement: el.etat } : {}) }],
        alterations: [],
        jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats } } } });
};

console.log("\n=========================================================");
console.log("  LES ÉLÉMENTS DES SORTS, LES RÉSISTANCES DES CRÉATURES");
console.log("=========================================================");

console.log("\n1. LA TABLE DES ÉLÉMENTS");
{
    const t = w.ELEMENTS_MAGIQUES.map(e => `${e.id}→${e.etat}`).join(", ");
    verifier("Feu → Brûlé, Foudre → Électrifié, Glace → Glacé", t === "Feu→Brûlé, Foudre→Électrifié, Glace→Glacé", t);
    verifier("5 % offerts, −20 % contre qui y est insensible", w.CHANCE_ELEMENT_OFFERTE === 5 && w.REDUCTION_SORT_RESISTE === 20
             && REDUCTION_SORT_RESISTE === 20);
    verifier("l'Attaque Magique a un élément ; pas un Mot de pouvoir, pas une attaque physique",
             w.estAttaqueElementaire("Attaque Magique") && !w.estAttaqueElementaire("Mots de pouvoirs")
             && !w.estAttaqueElementaire("Attaque lourde"));
}

console.log("\n2. LE NOYAU : −20 % CONTRE QUI EST INSENSIBLE À L'ÉLÉMENT");
{
    const cible = (immunites) => ({ pv: 100, pvMax: 100, bouclier: 0, etats: [], atouts: { immunites }, defense: {} });
    const feu = { valeurBrute: 50, typeRes: "Magique", element: "Feu", etatElement: "Brûlé" };
    const a = chaineDeDegats(cible([]), feu, {}), b = chaineDeDegats(cible(["Brûlé"]), feu, {});
    const c = chaineDeDegats(cible(["Glacé"]), feu, {});
    const sansEl = chaineDeDegats(cible(["Brûlé"]), { valeurBrute: 50, typeRes: "Magique" }, {});
    const brut = chaineDeDegats(cible(["Brûlé"]), { ...feu, brut: true }, {});
    verifier("un sort de Feu : 50 sur un humain, 40 sur un insensible au feu", a.degats === 50 && b.degats === 40 && b.resiste === "Brûlé",
             `${a.degats} / ${b.degats}`);
    verifier("insensible au gel : le Feu passe en entier", c.degats === 50 && !c.resiste, String(c.degats));
    verifier("un sort sans élément (Mot de pouvoir, technique d'avant) : rien ne change", sansEl.degats === 50);
    verifier("des dégâts bruts ne connaissent pas la résistance", brut.degats === 50);

    // Par la vraie résolution : l'Ondari (insensible au feu), le Vampire (au gel).
    const e = monde([fiche("H", { classe: "Sorcier" }), fiche("O", { race: "Ondari", camp: "Ennemi" }),
                     fiche("V", { classe: "Vampire", camp: "Ennemi" }), fiche("X", { camp: "Ennemi" })]);
    const r1 = sort(e, "O", "Feu"), r2 = sort(e, "O", "Glace"), r3 = sort(e, "V", "Glace"), r4 = sort(e, "X", "Feu");
    const pv = (r, id) => r.etat.combattants[id].pv;
    const msg = (r) => r.etapes.filter(x => x.type === "message").map(x => x.texte);
    verifier("l'Ondari prend 20 % de moins d'un sort de Feu (et « Résiste au feu »)",
             100 - pv(r1, "O") === 40 && msg(r1).some(t => /Résiste au feu/.test(t)), `${100 - pv(r1, "O")} ${JSON.stringify(msg(r1))}`);
    verifier("…mais un sort de Glace en entier", 100 - pv(r2, "O") === 50 && !msg(r2).some(t => /Résiste/.test(t)), String(100 - pv(r2, "O")));
    verifier("le Vampire (insensible au gel) prend 20 % de moins de la Glace", 100 - pv(r3, "V") === 40, String(100 - pv(r3, "V")));
    verifier("un humain : le Feu en entier", 100 - pv(r4, "X") === 50);
}

console.log("\n2 bis. PLUSIEURS ÉLÉMENTS : −20 % × INSENSIBLES ÷ ÉLÉMENTS");
// Nico : « si plusieurs éléments sur une attaque : −20 % × (insensibilités ÷
// éléments) — 1 sur 3 éléments de la technique, −6,66 % ».
{
    const cible = (immunites) => ({ pv: 100, pvMax: 100, bouclier: 0, etats: [], atouts: { immunites }, defense: {} });
    const trois = { valeurBrute: 300, typeRes: "Magique", etatElement: "Brûlé", etatsElements: ["Brûlé", "Glacé", "Électrifié"] };
    const d = (imm, att = trois) => chaineDeDegats(cible(imm), att, {});
    const un = d(["Glacé"]), deux = d(["Glacé", "Brûlé"]), tous = d(["Glacé", "Brûlé", "Électrifié"]), aucun = d(["Étourdi"]);
    verifier("3 éléments, insensible à 1 : −6,67 % (300 → 280)", un.degats === 280 && Math.abs(un.reductionElementaire - 20 / 3) < 1e-9,
             `${un.degats} (−${un.reductionElementaire.toFixed(2)} %)`);
    verifier("3 éléments, insensible à 2 : −13,33 % (300 → 260)", deux.degats === 260, String(deux.degats));
    verifier("3 éléments, insensible aux 3 : −20 % (300 → 240)", tous.degats === 240, String(tous.degats));
    verifier("insensible à aucun : en entier", aucun.degats === 300 && !aucun.resiste);
    const deuxEl = d(["Brûlé"], { valeurBrute: 100, typeRes: "Magique", etatElement: "Brûlé", etatsElements: ["Brûlé", "Glacé"] });
    verifier("2 éléments, insensible à 1 : −10 % (100 → 90)", deuxEl.degats === 90, String(deuxEl.degats));
    const ancien = d(["Brûlé"], { valeurBrute: 100, typeRes: "Magique", etatElement: "Brûlé" });
    verifier("un seul élément (etatElement seul) : −20 % comme avant", ancien.degats === 80, String(ancien.degats));

    const e = monde([fiche("H", { classe: "Sorcier" }), fiche("O", { race: "Ondari", camp: "Ennemi" })]);
    const r = resoudreCarte(e, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
        attaques: [{ nom: "Attaque Magique", valeurBrute: 30, typeRes: "Magique", cibles: ["O"],
                     element: "Feu", etatElement: "Brûlé", etatsElements: ["Brûlé", "Glacé", "Électrifié"] }],
        alterations: [], jets: { attaqueRatee: false, parCible: { O: { esquive: false, etats: {} } } } });
    const msg = r.etapes.filter(x => x.type === "message").map(x => x.texte);
    verifier("l'Ondari, un sort Feu-Glace-Foudre : 28 au lieu de 30, « 🔥 Résiste −6,7 % »",
             100 - r.etat.combattants.O.pv === 28 && msg.some(t => t === "🔥 Résiste −6,7 %"), `${100 - r.etat.combattants.O.pv} ${JSON.stringify(msg)}`);
}

console.log("\n3. LES RÉSISTANCES DES CRÉATURES : NORMAL 1, ÉLITE 2, BOSS 3");
{
    const etats = ["Brûlé", "Électrifié", "Glacé"];
    const n = {}, toutesValides = [];
    ["Petit", "Normal", "Élite", "Boss"].forEach(palier => {
        const tirages = Array.from({ length: 200 }, () => w.tirerResistancesElementaires(palier));
        n[palier] = [...new Set(tirages.map(t => t.length))];
        toutesValides.push(tirages.every(t => new Set(t).size === t.length && t.every(x => etats.includes(x))));
    });
    verifier("Petit 0, Normal 1, Élite 2, Boss 3", JSON.stringify(n) === '{"Petit":[0],"Normal":[1],"Élite":[2],"Boss":[3]}', JSON.stringify(n));
    verifier("des états élémentaires, jamais deux fois le même", toutesValides.every(Boolean));
    const vues = new Set(Array.from({ length: 300 }, () => w.tirerResistancesElementaires("Normal")[0]));
    verifier("au hasard : les trois sortent", vues.size === 3, [...vues].join(", "));
    const d1 = w.resistancesParDefaut("MONSTRE_ABC", "Élite"), d2 = w.resistancesParDefaut("MONSTRE_ABC", "Élite");
    verifier("une créature d'avant : les siennes tirées de son identifiant, les mêmes partout",
             d1.length === 2 && JSON.stringify(d1) === JSON.stringify(d2), JSON.stringify(d1));

    const m = fiche("M1", { Palier: "Élite", resistancesElementaires: ["Glacé", "Brûlé"] });
    const comp = fiche("M2", { compagnonDe: "P", resistancesElementaires: ["Brûlé"] });
    verifier("résister, c'est être insensible : ses immunités les portent", JSON.stringify(w.atoutRace(m).immunites) === '["Glacé","Brûlé"]',
             JSON.stringify(w.atoutRace(m)));
    verifier("le compagnon du Pisteur et les héros n'en ont pas",
             !(w.atoutRace(comp).immunites || []).length && !(w.atoutRace(fiche("H")).immunites || []).length);
    const e = monde([fiche("H"), m]);
    verifier("dans l'état du combat aussi", JSON.stringify(e.combattants.M1.atouts.immunites) === '["Glacé","Brûlé"]');
    const r = sort(e, "M1", "Glace", 50, { "Glacé": true });
    const rf = sort(e, "M1", "Foudre", 50);
    verifier("un sort de Glace : 40 au lieu de 50, et jamais Glacée", 100 - r.etat.combattants.M1.pv === 40
             && !(r.etat.combattants.M1.etats || []).some(x => x.nom === "Glacé"), String(100 - r.etat.combattants.M1.pv));
    verifier("la Foudre, à laquelle elle ne résiste pas : en entier", 100 - rf.etat.combattants.M1.pv === 50);
}

// =========================================================================
//  LA VRAIE PAGE
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
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
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  // Les valeurs du grimoire en ligne (l'instantané des bancs est plus ancien).
  ["EFF_BRULE", "EFF_GLACE", "EFF_ELECTRIFIE"].forEach(id => {
    Object.assign(window.EFFETS_BDD_CACHE[id], { Pourcent_Base: 15, Pourcent_Max: 75 });
  });
  window.EFFETS_BDD_CACHE.EFF_GLACE.Effet_Base = "15% chance de gelée sur 2 tour (Max 75%)";
  window.__docs = { "Personnages/P1": { Classe: "", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { Intelligence: 16, Sagesse: 12 } };
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Magie";
  window.rafraichirForge();
}, EFFETS_PAR_ID);

console.log("\n4. LA FORGE : LA POPUP DES ÉLÉMENTS");
{
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE"));
  const r = await p.evaluate(() => {
    const m = document.getElementById("modale-choix-element");
    const ronds = [...m.querySelectorAll(".forge-element-rond")];
    const disque = ronds[0] && ronds[0].querySelector(".forge-element-disque");
    const cs = disque ? getComputedStyle(disque) : {};
    const rm = m.getBoundingClientRect();
    return { visible: getComputedStyle(m).display === "block", actions: window.forgeState.actions.length,
             noms: ronds.map(x => x.textContent.replace(/\s+/g, " ").trim()),
             rond: cs.borderRadius === "50%" && parseFloat(cs.width) >= 80 && parseFloat(cs.width) === parseFloat(cs.height),
             dansEcran: rm.left >= 0 && rm.right <= innerWidth && rm.top >= 0 && rm.bottom <= innerHeight };
  });
  verifier("choisir Attaque Magique ouvre la popup — rien n'est encore posé", r.visible && r.actions === 0);
  verifier("trois boutons : Feu, Foudre, Glace, avec leur état et les 5 %",
           r.noms.length === 3 && /Feu.*Brûlé · 5 %/.test(r.noms[0]) && /Foudre.*Électrifié · 5 %/.test(r.noms[1]) && /Glace.*Glacé · 5 %/.test(r.noms[2]),
           JSON.stringify(r.noms));
  verifier("des boutons ronds (disques de 80 px et plus), la popup tient à l'écran", r.rond && r.dansEcran);
  await p.screenshot({ path: "/tmp/claude-0/elements_popup.png" });
  await p.click("#modale-choix-element .btn-parametres");
  const annule = await p.evaluate(() => ({ ferme: getComputedStyle(document.getElementById("modale-choix-element")).display === "none",
                                           actions: window.forgeState.actions.length }));
  verifier("Annuler : la popup se ferme, aucune attaque posée", annule.ferme && annule.actions === 0);

  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE"));
  await p.click('#modale-choix-element .forge-element-rond[data-element="Glace"]');
  await p.waitForTimeout(50);
  const g = await p.evaluate(() => {
    const act = window.forgeState.actions[0];
    const offert = document.querySelector("#forge-contenu-carte .forge-sous-effet-offert");
    return { element: act && act.element, mods: act && Object.keys(act.mods).length,
             ferme: getComputedStyle(document.getElementById("modale-choix-element")).display === "none",
             offert: offert ? offert.textContent.replace(/\s+/g, " ").trim() : null,
             pastille: (document.querySelector("#forge-contenu-carte .forge-element-pastille") || {}).textContent,
             entete: document.getElementById("forge-element-affichage").textContent,
             fatigue: document.getElementById("forge-fatigue-val").innerText };
  });
  verifier("un clic sur Glace : l'attaque se pose, liée à la Glace", g.element === "Glace" && g.ferme && g.mods === 0, JSON.stringify(g));
  verifier("le sous-effet offert : ❄️ Glacé, 5 %, OFFERT, à 0 cran",
           !!g.offert && /❄️ Glacé/.test(g.offert) && /OFFERT/.test(g.offert) && /\b5%/.test(g.offert) && /- 0 \+/.test(g.offert), g.offert);
  verifier("la pastille et l'en-tête disent l'élément", /❄️ Glace/.test(g.pastille) && /GLACE/.test(g.entete), `${g.pastille} | ${g.entete}`);
  const multi = await p.evaluate(() => {
    const act = window.forgeState.actions[0];
    act.mods.EFF_ELECTRIFIE = 1; window.rafraichirForge();
    const t = document.getElementById("forge-element-affichage").textContent;
    delete act.mods.EFF_ELECTRIFIE; window.rafraichirForge();
    return t;
  });
  verifier("un état élémentaire en plus (Électrifié) : l'en-tête dit les deux éléments", /❄️ GLACE/.test(multi) && /⚡ FOUDRE/.test(multi), multi);
  await p.screenshot({ path: "/tmp/claude-0/elements_forge_offert.png" });

  // Monter la chance : le « + » de la ligne offerte, comme un sous-effet.
  await p.click("#forge-contenu-carte .forge-sous-effet-offert .forge-btn-plus");
  const monte = await p.evaluate(() => {
    const act = window.forgeState.actions[0];
    const ligne = [...document.querySelectorAll("#forge-contenu-carte .forge-sous-effet")].find(l => /Glacé/.test(l.textContent));
    return { cran: act.mods.EFF_GLACE, offertReste: !!document.querySelector("#forge-contenu-carte .forge-sous-effet-offert"),
             ligne: ligne ? ligne.textContent.replace(/\s+/g, " ").trim() : null,
             fatigue: document.getElementById("forge-fatigue-val").innerText };
  });
  verifier("« + » : un cran de Glacé, 5 + 15 = 20 %, « +5 % OFFERTS »", monte.cran === 1 && !monte.offertReste
           && /\b20%/.test(monte.ligne) && /\+5 % OFFERTS/.test(monte.ligne), monte.ligne);
  verifier("l'offert ne coûte rien ; le cran se paie comme d'habitude (5 de fatigue)",
           parseInt(monte.fatigue) - parseInt(g.fatigue) === 5, `${g.fatigue} → ${monte.fatigue}`);
  const plafond = await p.evaluate(() => { window.forgeState.actions[0].mods.EFF_GLACE = 5; window.rafraichirForge();
    const l = [...document.querySelectorAll("#forge-contenu-carte .forge-sous-effet")].find(x => /Glacé/.test(x.textContent));
    const t = l.textContent; window.forgeState.actions[0].mods.EFF_GLACE = 1; window.rafraichirForge(); return t; });
  verifier("plafonné au maximum du grimoire (5 crans : 75 %, pas 80)", /\b75%/.test(plafond) && !/80%/.test(plafond));

  // Changer d'élément : la pastille rouvre la popup.
  await p.click("#forge-contenu-carte .forge-element-pastille");
  await p.click('#modale-choix-element .forge-element-rond[data-element="Feu"]');
  const feu = await p.evaluate(() => ({ element: window.forgeState.actions[0].element,
    offert: (document.querySelector("#forge-contenu-carte .forge-sous-effet-offert") || {}).textContent || "" }));
  verifier("la pastille rouvre la popup : passé au Feu, 🔥 Brûlé offert (le Glacé reste un sous-effet)",
           feu.element === "Feu" && /🔥 Brûlé/.test(feu.offert), feu.offert.replace(/\s+/g, " ").trim());

  // Un Mot de pouvoir : pas de popup.
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_MOTS_DE_POUVOIRS"));
  const mot = await p.evaluate(() => ({ popup: getComputedStyle(document.getElementById("modale-choix-element")).display,
    n: window.forgeState.actions.length, element: window.forgeState.actions[1] && window.forgeState.actions[1].element }));
  verifier("un Mot de pouvoir se pose sans popup, sans élément", mot.popup === "none" && mot.n === 2 && !mot.element, JSON.stringify(mot));

  // Enregistrer : l'élément part avec la technique.
  const enr = await p.evaluate(async () => {
    window.forgeState.actions.pop();
    document.getElementById("forge-nom").value = "Souffle ardent";
    window.rafraichirForge();
    window.__ecrits = [];
    await window.sauvegarderCompetence();
    const e = window.__ecrits.find(x => /Competences/.test(x.chemin));
    return e ? { Element: e.data.Element, action: e.data.Composants.actions[0], effets: e.data.Effets_Compiles } : null;
  });
  verifier("enregistrée : Element « Feu », et l'élément sur l'action", enr && enr.Element === "Feu" && enr.action.element === "Feu",
           JSON.stringify(enr && enr.action));
  verifier("la carte dit l'élément, et l'état offert quand il n'a pas de cran",
           enr && /🔥 Feu/.test(enr.effets[0].desc) && enr.effets.some(x => x.nom === "Brûlé" && /5%.*\(offert\)/.test(x.desc))
           // passée au Feu, son cran de Glacé n'a plus rien d'offert : 15 %.
           && enr.effets.some(x => x.nom === "Glacé" && /15%/.test(x.desc)),
           JSON.stringify(enr && enr.effets.map(x => x.nom + ": " + x.desc)));

  // Une Attaque Magique sans élément (technique d'avant, LIA) ne se forge pas.
  const sans = await p.evaluate(async () => {
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    window.forgeState.actions = [{ idInst: "A", baseEffet: window.forgeState.effetsBDD.find(e => e.id === "EFF_ATTAQUE_MAGIQUE"),
                                   count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }];
    document.getElementById("forge-nom").value = "Sans";
    window.rafraichirForge();
    const avant = document.getElementById("btn-valider-forge").disabled;
    const pastille = document.querySelector("#forge-contenu-carte .forge-element-pastille.manquant");
    window.forgeState.actions[0].element = "Foudre";
    window.rafraichirForge();
    return { avant, pastille: pastille && pastille.textContent, apres: document.getElementById("btn-valider-forge").disabled };
  });
  verifier("sans élément : « Choisir un élément », bouton Forger éteint ; avec, rallumé",
           sans.avant && /Choisir un élément/.test(sans.pastille) && !sans.apres, JSON.stringify(sans));
}

console.log("\n5. LE COMBAT : CE QUE LA CARTE EMPORTE");
{
  const ex = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", prenom: "Ilda", classe: "", race: "Humain", xp: 0,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    const carte = (actions) => ({ Nom: "Sort", Arme: "Magie", Fatigue: 10, Initiative: 50, Composants: { actions } });
    const a = (extra) => ({ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 2, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, ...extra });
    window.COMPETENCES_CACHE = {
      FEU: carte([a({ element: "Feu" })]),
      FEU1: carte([a({ element: "Feu", mods: { EFF_BRULE: 1 } })]),
      GLACE: carte([a({ element: "Glace" })]),
      FOUDRE_GLACE: carte([a({ element: "Foudre", mods: { EFF_GLACE: 1 } })]),
      TRIPLE: carte([a({ element: "Feu", mods: { EFF_GLACE: 1, EFF_ELECTRIFIE: 1 } })]),
      ANCIENNE: carte([a({})]),
      MOT: carte([{ baseEffetId: "EFF_MOTS_DE_POUVOIRS", count: 2, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, element: "Feu" }])
    };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    const lire = async (id) => {
      const r = (await window.demarrerCiblage(id, { extraire: true, idLanceur: "H1" })) || {};
      const att = (r.attaques || [])[0] || {};
      return { att, alt: (r.alterations || []).map(x => `${x.nom}:${x.chance}:${x.duree}`),
               etats: att.etatsElements || null, elements: att.elements || null };
    };
    const out = {};
    for (const id of Object.keys(window.COMPETENCES_CACHE)) out[id] = await lire(id);
    return out;
  });
  const r = (id) => ex[id];
  verifier("Feu sans cran : Brûlé à 5 % (2 tours), l'attaque emporte son élément",
           JSON.stringify(r("FEU").alt) === '["Brûlé:5:2"]' && r("FEU").att.element === "Feu" && r("FEU").att.etatElement === "Brûlé",
           JSON.stringify(r("FEU")));
  verifier("Feu + 1 cran : Brûlé à 20 %", JSON.stringify(r("FEU1").alt) === '["Brûlé:20:2"]', JSON.stringify(r("FEU1").alt));
  verifier("Glace : Glacé à 5 %", JSON.stringify(r("GLACE").alt) === '["Glacé:5:2"]', JSON.stringify(r("GLACE").alt));
  verifier("Foudre + 1 cran de Glacé : Glacé 15 %, Électrifié 5 %",
           r("FOUDRE_GLACE").alt.includes("Glacé:15:2") && r("FOUDRE_GLACE").alt.includes("Électrifié:5:2"), JSON.stringify(r("FOUDRE_GLACE").alt));
  verifier("ses éléments : Feu seul → [Brûlé] ; Foudre qui glace → [Électrifié, Glacé]",
           JSON.stringify(r("FEU").etats) === '["Brûlé"]' && JSON.stringify(r("FOUDRE_GLACE").etats) === '["Électrifié","Glacé"]',
           JSON.stringify([r("FEU").etats, r("FOUDRE_GLACE").etats]));
  verifier("Feu qui glace et électrifie : trois éléments (Feu, Glace, Foudre)",
           JSON.stringify(r("TRIPLE").etats) === '["Brûlé","Glacé","Électrifié"]' && JSON.stringify(r("TRIPLE").elements) === '["Feu","Glace","Foudre"]',
           JSON.stringify(r("TRIPLE").elements));
  verifier("une technique d'avant (sans élément) : rien d'offert", r("ANCIENNE").alt.length === 0 && !r("ANCIENNE").att.etatElement);
  verifier("un Mot de pouvoir n'a jamais d'élément", r("MOT").alt.length === 0 && !r("MOT").att.etatElement, JSON.stringify(r("MOT")));
}

console.log("\n6. LES CRÉATURES : LEUR ÉLÉMENT, LEURS RÉSISTANCES À L'ÉCRAN");
{
  const r = await p.evaluate(() => {
    // L'encart du tour : une créature qui résiste au feu et au gel.
    window.PERSOS_PARTIE = [{ idPersonnage: "M1", estMonstre: true, camp: "Ennemi", prenom: "Golem", Palier: "Élite",
                              resistancesElementaires: ["Brûlé", "Glacé"], Etats_Alteres: [] }];
    const el = document.getElementById("voile-tour-etats");
    el.dataset.acteur = "M1"; el.dataset.signature = "";
    window.actualiserEtatsEncart();
    const pastilles = [...el.querySelectorAll(".pastille-resistance")].map(x => x.textContent.trim() + "|" + x.title);
    return { pastilles };
  });
  verifier("l'encart de son tour montre ses résistances (🔥, ❄️)", r.pastilles.length === 2 && /🔥/.test(r.pastilles[0]) && /❄️/.test(r.pastilles[1]),
           JSON.stringify(r.pastilles));
  const src = fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8');
  verifier("ses Attaques Magiques reçoivent un élément tiré au sort (et l'emportent)",
           /estAttaqueElementaire\(effetBase\.Nom\)/.test(src) && /act\.element = els\[Math\.floor\(Math\.random\(\)/.test(src)
           && /\.\.\.\(act\.element \? \{ element: act\.element \} : \{\}\)/.test(src));
  const mon = fs.readFileSync('/home/user/Ivalis/monstres.js', 'utf-8');
  verifier("à sa création : Resistances_Elementaires tirées selon son palier ; relues à l'écoute",
           /Resistances_Elementaires: typeof window\.tirerResistancesElementaires === "function"\s*\?\s*window\.tirerResistancesElementaires\(gabarit\.Palier\)/.test(mon)
           && /objet\.resistancesElementaires = Array\.isArray\(brut\.Resistances_Elementaires\)/.test(mon));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
