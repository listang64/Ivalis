// LE BOND PLACÉ APRÈS L'ATTAQUE SE JOUE ENFIN.
//
// Une carte « Attaque, puis Bond » visait, envoyait la carte au cerveau, PUIS
// demandait le saut. Mais une carte clôt le tour de son lanceur : la demande
// de saut arrivait sur un tour déjà passé, le cerveau la refusait (« c'est au
// tour de X ») et le pion ne sautait jamais. Trouvé en construisant le Repli,
// qui avait exactement le même problème et la même solution : la case se
// choisit avant l'envoi et voyage AVEC la carte.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { appliquerIntention, validerIntention } from '../cerveau_combat.js';
import { construireEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(68)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = () => construireEtatCombat({
  idPartie: "G", cerveau: "P_03", graine: 5,
  combattants: [fiche("H1", { idJoueur: "P_03", camp: "Allié" }), fiche("M1", { estMonstre: true, camp: "Ennemi" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }, { idPersonnage: "M1", idCarte: "CM" }] }
});
const carte = { id: "I1", type: "carte", acteur: "H1", poste: "P_03", idCarte: "C",
  attaques: [{ valeurBrute: 8, cibles: ["M1"] }], alterations: [], coutFatigue: 10 };

console.log("\n1. LE CERVEAU");
{
  // Le bug, tel qu'il était : la carte d'abord, le saut ensuite → refusé.
  const apres = appliquerIntention(monde(), carte, null);
  const sautTardif = validerIntention(apres.etat, { id: "I2", type: "bond", acteur: "H1", poste: "P_03", vers: { q: -2, r: 0 } });
  verifier("(l'ancien chemin : un saut demandé après la carte est refusé)", !sautTardif.ok, sautTardif.raison);

  const pas = appliquerIntention(monde(), { ...carte, bond: { vers: { q: -2, r: 0 }, portee: 2 } }, null);
  const types = pas.entree.etapes.map(e => e.type);
  verifier("la carte porte le saut : attaque, PUIS bond, PUIS fin du tour",
           types.indexOf("carte") >= 0 && types.indexOf("bond") > types.indexOf("carte")
           && types.lastIndexOf("tour") > types.indexOf("bond"), types.join(","));
  verifier("le lanceur atterrit sur sa case", pas.etat.combattants.H1.q === -2 && pas.etat.combattants.H1.r === 0);
  verifier("la goule a bien pris le coup", pas.etat.combattants.M1.pv === 52, String(pas.etat.combattants.M1.pv));
  const trop = appliquerIntention(monde(), { ...carte, bond: { vers: { q: -5, r: 0 }, portee: 2 } }, null);
  verifier("un saut hors de portée est refusé par resoudreBond", trop.etat.combattants.H1.q === 0
           && trop.entree.etapes.some(e => e.type === "message" && /Bond impossible/.test(e.texte)));
  const bondPuisRepli = appliquerIntention(monde(), { ...carte, bond: { vers: { q: -2, r: 0 }, portee: 2 },
    repli: { vers: { q: -3, r: -1 }, portee: 3, chance: 60 } }, null);
  const t2 = bondPuisRepli.entree.etapes.map(e => e.type);
  verifier("Bond puis Repli : le repli part de la case d'atterrissage",
           t2.indexOf("repli") > t2.indexOf("bond") && bondPuisRepli.etat.combattants.H1.q === -3
           && bondPuisRepli.etat.combattants.H1.r === -1, t2.join(","));
}

console.log("\n2. LE PARCOURS DU JOUEUR (vrai moteur_effets.js, vrai clic)");
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
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const pg = await b.newPage();
await pg.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
await pg.goto(base + '/index.html'); await pg.waitForTimeout(300);
await pg.evaluate(async (src) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => window.__caseCliquee,
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  window.estUneCreature = (p) => !!(p && p.estMonstre); window.critiqueCombattant = () => 0;
  window.estCombattantMort = () => false; window.afficherMessageFlottantHex = () => {};
  window.EFFETS_BDD_CACHE = {
    ATT: { id: "ATT", Nom: "Attaque légère", Valeur: 6 }, BOND: { id: "BOND", Nom: "Bond", Valeur: 2 },
    REPLI: { id: "REPLI", Nom: "Repli", Valeur: 3, Pourcent_Base: 60, Pourcent_Max: 60 } };
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  window.mouvementPur = await import('/mouvement_pur.js');
  window.regimeDemande = { actif: () => true,
    carte: async (a, c) => { window.__envoyees.push(JSON.parse(JSON.stringify(c))); },
    bond: async (a, v) => { window.__bonds.push(v); } };
  window.__jouer = async (actions, clics) => {
    window.__envoyees = []; window.__bonds = []; window.ETAT_CIBLAGE = null;
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Arme légère CAC", Fatigue: 10, Composants: { actions } } };
    await window.demarrerCiblage("C", { idLanceur: "J1" });
    window.ajouterCibleCiblage("M1");
    const hote = document.getElementById("conteneur-plateau-vtt");
    const fin = window.declencherResolutionAvecBondEventuel();
    for (const c of clics) {
      await new Promise(r => setTimeout(r, 40));
      window.__caseCliquee = c;
      hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    }
    await fin;
    return { envoyees: window.__envoyees, bonds: window.__bonds };
  };
}, SRC);
{
  const r = await pg.evaluate(() => window.__jouer([{ baseEffetId: "ATT", mods: {} }, { baseEffetId: "BOND", mods: {} }],
                                                   [{ q: -2, r: 0 }]));
  const c = r.envoyees[0] || {};
  verifier("une seule carte part, AVEC la case du saut", r.envoyees.length === 1 && c.bond && c.bond.vers.q === -2
           && c.bond.portee === 2, JSON.stringify(c.bond));
  verifier("et plus aucune demande de saut séparée (celle qui était refusée)", r.bonds.length === 0);
  verifier("l'attaque vise toujours la goule", JSON.stringify((c.attaques || [])[0].cibles) === '["M1"]');

  const r2 = await pg.evaluate(() => window.__jouer([{ baseEffetId: "ATT", mods: {} }, { baseEffetId: "BOND", mods: {} },
                                                     { baseEffetId: "REPLI", mods: {} }], [{ q: -2, r: 0 }, { q: -4, r: 0 }]));
  const c2 = r2.envoyees[0] || {};
  verifier("Bond puis Repli : le repli se choisit depuis la case d'atterrissage (-2 → -4)",
           c2.bond && c2.bond.vers.q === -2 && c2.repli && c2.repli.vers.q === -4, JSON.stringify({ b: c2.bond, r: c2.repli }));

  // Le transport jusqu'au cerveau (regime_cerveau.js).
  const srcRegime = fs.readFileSync(`${RACINE}/regime_cerveau.js`, 'utf-8');
  const demande = srcRegime.slice(srcRegime.indexOf('const demanderCarte = '), srcRegime.indexOf('const demanderBond = '));
  verifier("la demande de carte transporte la case du saut", /carte\.bond\.vers/.test(demande));
}
await b.close(); serveur.close();
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
