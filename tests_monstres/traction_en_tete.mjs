// LA TRACTION ÉCRITE EN PREMIER TIRE, PUIS LA CARTE FRAPPE.
//
// Nico : « j'ai une compétence avec dessus Traction en premier et des dégâts
// ensuite. La cible était à 3 de distance mais je ne pouvais pas la cibler,
// car ma compétence n'avait pas de distance — pourtant Traction est censée la
// tracter. »
//
// Deux trous, l'un derrière l'autre :
//   1. LE CIBLAGE (moteur_effets.js) prenait comme portée « de la Traction »
//      la portée de l'action… soit 1 case sans Distance. La cible à 3 cases
//      restait hors d'atteinte.
//   2. LE CERVEAU (moteur_pur.js, resoudreCarte) jouait toujours les attaques
//      AVANT les états : même visée, la carte aurait frappé à 3 cases, puis
//      tiré. Le drapeau « Traction avant l'attaque » était calculé… et lu par
//      personne.
// Désormais : Traction en tête → on vise jusqu'à 3 cases, le cerveau tire
// d'abord, frappe ensuite, et si la cible n'a pas été ramenée à portée (jet
// raté), le coup de contact ne part pas à 3 cases. Traction APRÈS l'attaque :
// rien ne change, la portée reste celle du coup.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { appliquerIntention } from '../cerveau_combat.js';
import { construireEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = () => construireEtatCombat({
  idPartie: "G", cerveau: "P_03", graine: 5,
  combattants: [fiche("H1", { idJoueur: "P_03", camp: "Allié" }), fiche("M1", { estMonstre: true, camp: "Ennemi" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }, { idPersonnage: "M1", idCarte: "CM" }] }
});
const traction = (chance, extra = {}) => ({ nom: "Traction", chance, duree: 0, cases: 3, estTraction: true,
                                            rangeMax: 1, cibles: ["M1"], ...extra });
const carte = (alterations) => ({ id: "I1", type: "carte", acteur: "H1", poste: "P_03", idCarte: "C",
  attaques: [{ valeurBrute: 8, typeRes: "Physique", rangeMax: 1, cibles: ["M1"] }], alterations, coutFatigue: 10 });
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

console.log("\n1. LE CERVEAU : TIRER, PUIS FRAPPER");
{
  const pas = appliquerIntention(monde(), carte([traction(100, { avantAttaque: true, coupAPortee: true })]), null);
  const types = pas.entree.etapes.map(e => e.type);
  verifier("la traction passe AVANT les dégâts", types.indexOf("traction") >= 0
           && types.indexOf("traction") < types.indexOf("degats"), types.join(","));
  const m = pas.etat.combattants.M1, h = pas.etat.combattants.H1;
  verifier("la cible est ramenée au contact", dist(m, h) === 1, `(${m.q},${m.r})`);
  verifier("et le coup de contact la touche", m.pv === 52, String(m.pv));

  const rate = appliquerIntention(monde(), carte([traction(0, { avantAttaque: true, coupAPortee: true })]), null);
  const m2 = rate.etat.combattants.M1;
  verifier("jet de traction raté : la cible reste à 3 cases", dist(m2, rate.etat.combattants.H1) === 3);
  verifier("et le coup de contact ne part pas à 3 cases", m2.pv === 60
           && rate.entree.etapes.some(e => e.type === "message" && e.texte === "Hors de portée"), String(m2.pv));

  // Traction APRÈS l'attaque : l'ordre reste attaque puis traction.
  const apres = appliquerIntention(monde(), { ...carte([traction(100)]),
    attaques: [{ valeurBrute: 8, typeRes: "Physique", rangeMax: 1, cibles: ["M1"] }] }, null);
  const t3 = apres.entree.etapes.map(e => e.type);
  verifier("Traction écrite après l'attaque : attaque, PUIS traction", t3.indexOf("degats") >= 0
           && t3.indexOf("traction") > t3.indexOf("degats"), t3.join(","));
  verifier("sans drapeau, aucun « Hors de portée » ajouté", !apres.entree.etapes.some(e => e.texte === "Hors de portée"));
}

console.log("\n2. L'EXTRACTION ET LE CIBLAGE DU JOUEUR (vrai moteur_effets.js)");
const RACINE = '/home/user/Ivalis';
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end(); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const SRC = fs.readFileSync(`${RACINE}/moteur_effets.js`, 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const SRC_IA = fs.readFileSync(`${RACINE}/monstres_ia.js`, 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const pg = await b.newPage();
await pg.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
await pg.goto(base + '/index.html'); await pg.waitForTimeout(300);
await pg.evaluate((src) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => ({ q: 0, r: 0 }),
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  window.estUneCreature = (p) => !!(p && p.estMonstre); window.critiqueCombattant = () => 0;
  window.estCombattantMort = () => false; window.__messages = [];
  window.afficherMessageFlottantHex = (q, r, t) => window.__messages.push(t);
  window.EFFETS_BDD_CACHE = {
    ATT: { id: "ATT", Nom: "Attaque légère", Valeur: 6 },
    TRA: { id: "TRA", Nom: "Traction magique", Valeur: 3, Pourcent_Base: 15, Pourcent_Max: 60 } };
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  const monde = (cibleQ) => {
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: cibleQ, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
  };
  window.__extraire = async (actions) => {
    monde(3);
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Arme légère CAC", Fatigue: 10, Composants: { actions } } };
    return window.demarrerCiblage("C", { extraire: true, idLanceur: "J1" });
  };
  window.__viser = async (actions, cibleQ) => {
    window.ETAT_CIBLAGE = null; window.__messages = [];
    monde(cibleQ);
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Arme légère CAC", Fatigue: 10, Composants: { actions } } };
    await window.demarrerCiblage("C", { idLanceur: "J1" });
    window.ajouterCibleCiblage("M1");
    const e = window.ETAT_CIBLAGE || {};
    return { retenue: e.cibleUnique === "M1" || (e.ciblesSelectionnees || []).includes("M1"),
             messages: window.__messages.slice(), porteeMin: e.porteeMinTraction };
  };
}, SRC);
{
  const TETE = [{ baseEffetId: "TRA", count: 1, mods: {} }, { baseEffetId: "ATT", count: 1, mods: {} }];
  const QUEUE = [{ baseEffetId: "ATT", count: 1, mods: {} }, { baseEffetId: "TRA", count: 1, mods: {} }];
  const x = await pg.evaluate((a) => window.__extraire(a), TETE);
  const alt = (x.alterations || []).find(a => a.estTraction) || {};
  verifier("Traction en tête : l'altération part marquée « avant l'attaque »", alt.avantAttaque === true
           && alt.coupAPortee === true && alt.cases === 3, JSON.stringify({ a: alt.avantAttaque, c: alt.coupAPortee, n: alt.cases }));
  verifier("et la carte vise jusqu'à 3 cases (sans Distance)", x.porteeMinTraction === 3, String(x.porteeMinTraction));
  const y = await pg.evaluate((a) => window.__extraire(a), QUEUE);
  const alt2 = (y.alterations || []).find(a => a.estTraction) || {};
  verifier("Traction après l'attaque : pas de drapeau, portée du coup (1)",
           !alt2.avantAttaque && y.porteeMinTraction === 1, String(y.porteeMinTraction));

  const vise3 = await pg.evaluate((a) => window.__viser(a, 3), TETE);
  verifier("le joueur peut viser la cible à 3 cases (le cas de Nico)", vise3.retenue && !vise3.messages.includes("Hors de portée"),
           JSON.stringify(vise3));
  const vise4 = await pg.evaluate((a) => window.__viser(a, 4), TETE);
  verifier("mais pas à 4 (la traction ne tire que 3 cases)", !vise4.retenue && vise4.messages.includes("Hors de portée"),
           JSON.stringify(vise4));
  const viseQueue = await pg.evaluate((a) => window.__viser(a, 3), QUEUE);
  verifier("Traction après l'attaque : la cible à 3 cases reste hors de portée", !viseQueue.retenue,
           JSON.stringify(viseQueue));
}

console.log("\n3. LES MONSTRES LISENT LA MÊME PORTÉE (monstres_ia.js)");
{
  const r = await pg.evaluate((src) => {
    if (typeof window.analyserCarteMonstre !== "function") new Function(src)();
    const carte = (actions) => ({ Fatigue: 10, Composants: { actions } });
    return {
      tete: window.analyserCarteMonstre(carte([{ baseEffetId: "TRA", count: 1, mods: {} }, { baseEffetId: "ATT", count: 1, mods: {} }])).portee,
      queue: window.analyserCarteMonstre(carte([{ baseEffetId: "ATT", count: 1, mods: {} }, { baseEffetId: "TRA", count: 1, mods: {} }])).portee,
      enMod: window.analyserCarteMonstre(carte([{ baseEffetId: "ATT", count: 1, mods: { TRA: 1 } }])).portee
    };
  }, SRC_IA);
  verifier("Traction en tête : la créature vise à 3 cases", r.tete === 3, String(r.tete));
  verifier("Traction après l'attaque : portée du coup (1)", r.queue === 1, String(r.queue));
  verifier("Traction en sous-effet de l'attaque : même action, portée du coup (1)", r.enMod === 1, String(r.enMod));
}

await b.close(); serveur.close();
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
