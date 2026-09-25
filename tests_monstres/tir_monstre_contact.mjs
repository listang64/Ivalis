// LES CRÉATURES AUSSI PERDENT 30 % EN TIRANT AU CONTACT.
//
// Vérification demandée par Nico. La règle vit dans le noyau (chaineDeDegats,
// moteur_pur.js : une attaque « à distance » employée à une case perd 30 %).
// Encore faut-il que la carte d'une créature arrive au noyau marquée « à
// distance » : ce banc la prépare comme le cerveau le fait (demarrerCiblage en
// extraction, vrai moteur_effets.js, grimoire réel), puis la joue au contact
// et à trois cases.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { resoudreCarte } from '../moteur_pur.js';
import { construireEtatCombat } from '../combat_etat.js';

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
    // Le LANCEUR est une créature (M1), comme quand le cerveau prépare ses cartes.
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    const m = { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", estMonstre: true, Palier: "Normal", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, m];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.estUneCreature = (p) => !!(p && p.estMonstre);
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: arme, Fatigue: 5, Composants: { actions } } };
    window.CACHE_COMPETENCES_GLOBAL = { M1: window.COMPETENCES_CACHE };
    return window.demarrerCiblage("C", { extraire: true, idLanceur: "M1" });
  };
}, { src: SRC, effets: EFFETS });


const idAtt = parId("Attaque légère"), idDist = parId("Distance");
const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 200, PV_Actuels: 200, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const jouer = (attaques, distance) => {
  const etat = construireEtatCombat({ idPartie: "G", cerveau: "P", graine: 1,
    combattants: [fiche("J1", { idJoueur: "P", camp: "Allié" }), fiche("M1", { estMonstre: true, camp: "Ennemi" })],
    positions: { J1: { q: 0, r: 0 }, M1: { q: distance, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "J1"], File_Attente_Combat: [] } });
  const r = resoudreCarte(etat, { type: "carte", idLanceur: "M1", idCarte: "C",
    attaques: attaques.map(a => ({ ...a, cibles: ["J1"] })), alterations: [],
    jets: { parCible: { J1: { esquive: false, etats: {} } } } });
  return 200 - r.etat.combattants.J1.pv;
};

for (const [titre, actions, arme] of [
  ["archer (Arme légère Distance) avec Distance", [{ baseEffetId: idAtt, count: 3, mods: { [idDist]: 1 } }], "Arme légère Distance"],
  ["mage, mod Distance sur l'attaque", [{ baseEffetId: idAtt, count: 3, mods: { [idDist]: 2 } }], "Magie"]
]) {
  console.log(`\n· ${titre}`);
  const x = await pg.evaluate(async ({ actions, arme }) => window.__extraire(actions, arme), { actions, arme });
  const att = (x && x.attaques || [])[0] || {};
  verifier("la carte de la créature arrive marquée « à distance »", att.isRanged === true, JSON.stringify({ r: att.isRanged, p: att.rangeMax }));
  const loin = jouer([att], 3), pres = jouer([att], 1);
  verifier("au contact, elle perd 30 %", pres === Math.floor(loin * 0.7) && pres < loin, `${loin} à 3 cases → ${pres} au contact`);
}
{
  // L'ARC NE DONNE AUCUNE PORTÉE À UNE CRÉATURE : la portée d'arme vient de
  // l'équipement porté (porteeAvecArme), qu'une créature n'a pas. Sans Distance,
  // sa carte est une attaque de contact — elle ne peut viser qu'à une case, et
  // n'a donc aucun malus à y subir.
  console.log("\n· archer SANS Distance");
  const x = await pg.evaluate(async ({ actions }) => window.__extraire(actions, "Arme légère Distance"),
                              { actions: [{ baseEffetId: idAtt, count: 3, mods: {} }] });
  const att = (x && x.attaques || [])[0] || {};
  verifier("c'est une attaque de contact (portée 1), pas un tir", att.isRanged === false && att.rangeMax === 1,
           JSON.stringify({ r: att.isRanged, p: att.rangeMax }));
}
{
  console.log("\n· attaque de contact (témoin)");
  const x = await pg.evaluate(async ({ actions }) => window.__extraire(actions, "Arme polyvalente"),
                              { actions: [{ baseEffetId: idAtt, count: 3, mods: {} }] });
  const att = (x && x.attaques || [])[0] || {};
  verifier("une attaque de contact n'est pas marquée « à distance »", att.isRanged === false, String(att.isRanged));
  verifier("et ne perd rien au contact", jouer([att], 1) === jouer([att], 3));
}

await b.close(); serveur.close();
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
