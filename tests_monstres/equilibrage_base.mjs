// L'ÉQUILIBRAGE DE NICO, LU PAR LE JEU TEL QU'IL EST DANS LA BASE.
//
// Nico a rééquilibré les techniques dans le grimoire (attaques et soins à 3
// pour 2 PC, Absorption/Contre à 6 PC plafonnés à 60 %, Confusion 6 %/48 %,
// Immobilisation 10 %/50 %, Provocation plafonnée à 60 %, Étalement « Cout /
// 1.2 »…). Deux vérifications, sur l'instantané réel de la base
// (effets_reels.json, relu en lecture seule) :
//
//   1. CONTRE ET ABSORPTION. Chaque attaque réelle part avec le bon type, et
//      la chaîne de dégâts (moteur_pur.js) fait jouer le Contre contre le
//      PHYSIQUE seulement, l'Absorption contre le MAGIQUE seulement.
//   2. LES PLAFONDS DE CHANCE viennent du grimoire, pas d'un chiffre écrit en
//      dur : ce que la Forge annonce est ce que le combat applique.
//
// Le coût des cartes de monstres, lui, est comparé à la vraie Forge par
// cout_reel.mjs, sur la même base (ristourne de l'Étalement comprise).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chaineDeDegats } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const RACINE = '/home/user/Ivalis';
const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
const parId = (nom) => Object.keys(EFFETS).find(id => (EFFETS[id].Nom || "").toLowerCase() === nom.toLowerCase());

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
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const pg = await b.newPage();
await pg.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
await pg.goto(base + '/index.html'); await pg.waitForTimeout(300);
await pg.evaluate(({ src, effets }) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => ({ q: 0, r: 0 }),
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  window.EFFETS_BDD_CACHE = effets;
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  window.__extraire = async (actions, arme = "Arme polyvalente") => {
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: arme, Fatigue: 5, Composants: { actions } } };
    return window.demarrerCiblage("C", { extraire: true, idLanceur: "J1" });
  };
}, { src: SRC, effets: EFFETS });

// =========================================================================
console.log("\n1. CONTRE : PHYSIQUE SEULEMENT — ABSORPTION : MAGIQUE SEULEMENT");
// =========================================================================
{
  const idContre = parId("Contre"), idAbs = parId("Absorption");
  const soutiens = await pg.evaluate(async ({ idContre, idAbs }) => {
    const c = await window.__extraire([{ baseEffetId: idContre, count: 1, mods: {} }]);
    const c9 = await window.__extraire([{ baseEffetId: idContre, count: 9, mods: {} }]);
    const a = await window.__extraire([{ baseEffetId: idAbs, count: 1, mods: {} }]);
    const a9 = await window.__extraire([{ baseEffetId: idAbs, count: 9, mods: {} }]);
    const lire = (x, nom, champ) => ((x.alterations || []).find(e => e.nom === nom) || {})[champ];
    return { contre: lire(c, "Contre", "valeurContre"), contre9: lire(c9, "Contre", "valeurContre"),
             abs: lire(a, "Absorption", "valeurAbs"), abs9: lire(a9, "Absorption", "valeurAbs") };
  }, { idContre, idAbs });
  const vC = Number(EFFETS[idContre].Valeur), mC = Number(EFFETS[idContre].Pourcent_Max);
  const vA = Number(EFFETS[idAbs].Valeur), mA = Number(EFFETS[idAbs].Pourcent_Max);
  verifier(`un cran de Contre : ${vC} % (grimoire)`, soutiens.contre === vC, String(soutiens.contre));
  verifier(`neuf crans : plafonné au Pourcentage max du grimoire (${mC} %)`, soutiens.contre9 === mC, String(soutiens.contre9));
  verifier(`un cran d'Absorption : ${vA} % (grimoire)`, soutiens.abs === vA, String(soutiens.abs));
  verifier(`neuf crans : plafonnée à ${mA} %`, soutiens.abs9 === mA, String(soutiens.abs9));

  // Chaque attaque RÉELLE de la base, avec son vrai type, contre une cible qui
  // porte l'un ou l'autre soutien (sans résistance, pour lire le pourcentage net).
  const attaques = Object.keys(EFFETS).filter(id => /attaque|pouvoir/i.test(EFFETS[id].Nom || ""));
  verifier("la base a ses quatre attaques (légère, lourde, magique, mots de pouvoir)", attaques.length === 4,
           attaques.map(id => EFFETS[id].Nom).join(", "));
  const cible = (etat) => ({ pv: 60, pvMax: 60, bouclier: 0, etats: [etat], def: {} });
  const CONTRE = { nom: "Contre", valeurContre: vC }, ABS = { nom: "Absorption", valeurAbs: vA };
  for (const id of attaques) {
    const a = await pg.evaluate(async (id) => {
      const x = await window.__extraire([{ baseEffetId: id, count: 10, mods: {} }], "Magie");
      return (x.attaques || [])[0] || {};
    }, id);
    const nom = EFFETS[id].Nom;
    const magique = /magique|pouvoir/i.test(nom);
    verifier(`${nom} part en ${magique ? "Magique" : "Physique"}`, a.typeRes === (magique ? "Magique" : "Physique"), a.typeRes);
    const brut = a.valeurBrute;
    const surContre = chaineDeDegats(cible(CONTRE), { valeurBrute: brut, typeRes: a.typeRes }, {});
    const surAbs = chaineDeDegats(cible(ABS), { valeurBrute: brut, typeRes: a.typeRes }, {});
    const reduit = (c, pct) => c.degats === brut - Math.floor(brut * pct / 100);
    if (magique) {
      verifier(`  ${nom} : le Contre ne l'arrête pas`, surContre.degats === brut && !surContre.renvoi, `${surContre.degats}/${brut}`);
      verifier(`  ${nom} : l'Absorption en annule ${vA} % et soigne 10 %`, reduit(surAbs, vA) && surAbs.soinAbsorption === Math.floor(brut * 0.1),
               `${surAbs.degats}/${brut}, soin ${surAbs.soinAbsorption}`);
    } else {
      verifier(`  ${nom} : le Contre en annule ${vC} % et renvoie 10 %`, reduit(surContre, vC) && surContre.renvoi === Math.floor(brut * 0.1),
               `${surContre.degats}/${brut}, renvoi ${surContre.renvoi}`);
      verifier(`  ${nom} : l'Absorption ne l'arrête pas`, surAbs.degats === brut && !surAbs.soinAbsorption, `${surAbs.degats}/${brut}`);
    }
  }
}

// =========================================================================
console.log("\n2. LES PLAFONDS DE CHANCE SONT CEUX DU GRIMOIRE");
// =========================================================================
{
  const attaque = parId("Attaque légère");
  // [nom en base, nom de l'état produit]
  const ETATS = [["Immobilisation", "Immobilisation"], ["Confusion", "Confusion"], ["Provocations", "Provocation"],
                 ["Empoisonnement", "Empoisonnement"], ["Brûlé", "Brûlé"], ["Glacé", "Glacé"], ["Électrifié", "Électrifié"],
                 ["Peur", "Peur"], ["Poussée", "Poussée"]];
  for (const [nomBase, nomEtat] of ETATS) {
    const id = parId(nomBase);
    if (!id) { verifier(`${nomBase} présent dans la base`, false); continue; }
    const max = Number(EFFETS[id].Pourcent_Max);
    const chance = await pg.evaluate(async ({ attaque, id, nomEtat }) => {
      const x = await window.__extraire([{ baseEffetId: attaque, count: 1, mods: { [id]: 30 } }]);
      return ((x.alterations || []).find(a => a.nom === nomEtat) || {}).chance;
    }, { attaque, id, nomEtat });
    verifier(`${nomBase} poussé à l'extrême : plafonné à ${max} % (grimoire)`, chance === max, String(chance));
  }
}

await b.close(); serveur.close();
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
