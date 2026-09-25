// LE REPLI : FRAPPER, PUIS DÉCROCHER.
//
// Nouvel effet demandé par Nico : « Repli — 6 — DEXTÉRITÉ — Se déplace de 3
// cases après avoir attaqué, avec 60 % de chance d'éviter les attaques
// d'opportunité. » Ce banc le suit de bout en bout, sur le vrai code :
//
//   1. le noyau pur (mouvement_pur.js) : une MARCHE de 3 cases au plus, gratuite,
//      qui ne traverse ni mur ni vivant, et où chaque ennemi quitté est évité
//      à 60 % AVANT le jet de défense ordinaire ;
//   2. le cerveau (cerveau_combat.js) : la case voyage AVEC la carte — une
//      demande envoyée après serait refusée, puisque la carte clôt le tour — et
//      le repli se joue après l'attaque, avant la clôture ;
//   3. les créatures : l'IA (ia_pure.js, choisirRepli) décroche vers la case
//      la plus éloignée de l'adversaire ;
//   4. la carte (moteur_effets.js) : la vraie fiche du grimoire, extraite ;
//   5. l'écran (pont_combat.js) : « ↩️ Repli ! », des pas marqués repli, et
//      « Repli 💨 » quand une opportunité est évitée ;
//   6. le générateur de techniques des monstres (monstres_competences.js).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { cheminsDeRepli, resoudreRepli, PORTEE_REPLI, CHANCE_REPLI_OPPORTUNITE } from '../mouvement_pur.js';
import { appliquerIntention, validerIntention, jouerCreature } from '../cerveau_combat.js';
import { choisirRepli } from '../ia_pure.js';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(68)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// La fiche telle que la migration la crée (app.js, MIGRATION_EFFETS).
const FICHE_REPLI = { id: "EFF_REPLI", Nom: "Repli", Cout_PT: "6", Modificateur: "DEXTÉRITÉ",
  Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun", Valeur: 3, Pourcent_Base: 60, Pourcent_Max: 60,
  Tours: 0, Cible_Etat: "repli",
  Effet_Base: "Se déplace de 3 cases après avoir attaqué, avec 60% chance d'éviter les attaques d'opportunités." };

const fiche = (id, extra = {}) => ({
  idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
// H1 (Naomi) au contact de la goule M1 ; M2 plus loin.
const monde = (positions = {}) => construireEtatCombat({
  idPartie: "G", cerveau: "P_03", graine: 77,
  combattants: [
    fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }),
    fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Ben" }),
    fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" }),
    fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre" })
  ],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, H2: { q: -4, r: 4 }, M2: { q: 8, r: 0 }, ...positions },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1", "H2", "M2"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_H1" }, { idPersonnage: "M1", idCarte: "C_M1" },
                                  { idPersonnage: "H2", idCarte: "C_H2" }, { idPersonnage: "M2", idCarte: "C_M2" }] }
});
const desFixe = (suite, defaut = 99) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : defaut,
  fraction: () => 0.5, graine: () => 1 }; };
// Un plateau avec un mur en (-1,0), juste à l'ouest de Naomi.
const MURS = new Set(["-1,0"]);
const plateau = { etatCase: (q, r) => ({ bloquee: MURS.has(`${q},${r}`), supprimee: false, difficile: false }) };

// =========================================================================
console.log("\n1. LE NOYAU PUR : UNE MARCHE DE 3 CASES, GRATUITE");
// =========================================================================
{
  verifier("réglages par défaut : 3 cases, 60 %", PORTEE_REPLI === 3 && CHANCE_REPLI_OPPORTUNITE === 60);
  const etat = monde();
  const chemins = cheminsDeRepli(etat, "H1", 3, plateau);
  const cles = [...chemins.keys()];
  verifier("aucune case de mur", !cles.includes("-1,0"));
  verifier("jamais la case d'un vivant (la goule)", !cles.includes("1,0"));
  verifier("rien au-delà de 3 pas", [...chemins.values()].every(c => c.length >= 1 && c.length <= 3));
  // (-2,0) est à 2 cases à vol d'oiseau, mais le mur est sur la ligne : à pied, 3 pas en le contournant.
  verifier("on contourne le mur à pied (3 pas pour une case à 2)", chemins.has("-2,0") && chemins.get("-2,0").length === 3,
           chemins.has("-2,0") ? JSON.stringify(chemins.get("-2,0")) : "absente");

  // La marche : la goule, quittée au premier pas, rate son coup (le repli se dérobe : dé 10 ≤ 60).
  const s = clonerEtat(etat);
  const fatigueAvant = s.combattants.H1.fatigue;
  const etapes = resoudreRepli(s, "H1", { q: 0, r: -3 }, desFixe([10]), plateau);
  const pas = etapes.filter(e => e.type === "pas");
  verifier("elle annonce le repli", etapes[0] && etapes[0].type === "repli", etapes[0] && etapes[0].type);
  verifier("trois pas, marqués repli, à coût nul", pas.length === 3 && pas.every(p => p.repli && p.cout === 0),
           JSON.stringify(pas.map(p => p.vers)));
  verifier("l'énergie ne bouge pas", s.combattants.H1.fatigue === fatigueAvant);
  verifier("elle arrive où on l'a demandé", s.combattants.H1.q === 0 && s.combattants.H1.r === -3);
  const opp = etapes.find(e => e.type === "opportunite");
  verifier("la goule quittée frappe… et le repli l'évite (dé 10)", !!opp && opp.evitee && opp.mot === "Repli 💨",
           JSON.stringify(opp));
  verifier("aucun PV perdu", s.combattants.H1.pv === 60);

  // Dé 61 : le repli ne se dérobe pas ; la défense (Esquive 0) ne sauve pas non plus → 6 dégâts.
  const s2 = clonerEtat(etat);
  const e2 = resoudreRepli(s2, "H1", { q: 0, r: -3 }, desFixe([61, 99]), plateau);
  verifier("dé 61 : l'attaque d'opportunité porte (6 dégâts)", s2.combattants.H1.pv === 54,
           JSON.stringify(e2.filter(e => e.type === "opportunite" || e.type === "degats")));

  // La chance se règle : 0 % = jamais évité par le repli.
  const s3 = clonerEtat(etat);
  resoudreRepli(s3, "H1", { q: 0, r: -3 }, desFixe([1, 99]), plateau, { chance: 0 });
  verifier("avec 0 % de chance, même un dé de 1 ne sauve pas", s3.combattants.H1.pv === 54);

  // Hors d'atteinte / immobilisé / à terre.
  const loin = clonerEtat(etat);
  const eLoin = resoudreRepli(loin, "H1", { q: 0, r: -6 }, desFixe([]), plateau);
  verifier("une case à 6 pas : repli bloqué, on ne bouge pas", loin.combattants.H1.r === 0
           && eLoin.some(e => e.type === "message" && /bloqué/.test(e.texte)));
  const fige = clonerEtat(etat);
  fige.combattants.H1.etats = [{ nom: "Immobilisation", duree: 1 }];
  const eFige = resoudreRepli(fige, "H1", { q: 0, r: -3 }, desFixe([]), plateau);
  verifier("immobilisé : pas de repli", fige.combattants.H1.r === 0 && eFige.some(e => e.raison === "Immobilisation"));
  const couche = clonerEtat(etat);
  couche.combattants.H1.aTerre = true;
  verifier("à terre : rien", resoudreRepli(couche, "H1", { q: 0, r: -3 }, desFixe([]), plateau).length === 0);
}

// =========================================================================
console.log("\n2. LE CERVEAU : LA CASE VOYAGE AVEC LA CARTE");
// =========================================================================
{
  const etat = monde();
  const intention = { id: "INT_R", type: "carte", acteur: "H1", poste: "P_03", idCarte: "C_H1",
    attaques: [{ valeurBrute: 10, cibles: ["M1"] }], alterations: [], coutFatigue: 12,
    repli: { vers: { q: 0, r: -3 }, portee: 3, chance: 60 } };
  verifier("l'intention est recevable", validerIntention(etat, intention).ok);
  const pas = appliquerIntention(etat, intention, plateau);
  const types = pas.entree.etapes.map(e => e.type);
  const iCarte = types.indexOf("carte"), iRepli = types.indexOf("repli"), iTour = types.indexOf("tour");
  verifier("l'attaque, PUIS le repli, PUIS la clôture du tour", iCarte >= 0 && iRepli > iCarte && iTour > iRepli,
           types.join(","));
  verifier("la goule a pris le coup", pas.etat.combattants.M1.pv < 60, String(pas.etat.combattants.M1.pv));
  verifier("Naomi s'est repliée sur sa case", pas.etat.combattants.H1.q === 0 && pas.etat.combattants.H1.r === -3,
           `${pas.etat.combattants.H1.q},${pas.etat.combattants.H1.r}`);
  verifier("et n'a payé que la carte (12)", pas.etat.combattants.H1.fatigue === 88, String(pas.etat.combattants.H1.fatigue));
  verifier("le tour est passé à la goule", (pas.etat.file[0] || {}).id === "M1");

  // Sans repli : exactement la même carte qu'avant.
  const sans = appliquerIntention(etat, { ...intention, id: "INT_S", repli: undefined }, plateau);
  verifier("une carte sans repli ne bouge pas son lanceur", sans.etat.combattants.H1.r === 0
           && !sans.entree.etapes.some(e => e.type === "repli"));
  // La portée demandée est bornée : un poste ne s'offre pas 20 cases.
  const triche = appliquerIntention(etat, { ...intention, id: "INT_T",
    repli: { vers: { q: 0, r: -9 }, portee: 20, chance: 100 } }, plateau);
  verifier("une portée de 20 est ramenée à 6 : case à 9 pas refusée", triche.etat.combattants.H1.r === 0);
}

// =========================================================================
console.log("\n3. LES CRÉATURES DÉCROCHENT");
// =========================================================================
{
  // La goule M1, au contact de Naomi, frappe puis se replie.
  let etat = monde();
  etat.file = [etat.file[1], ...etat.file.filter((_, i) => i !== 1)];   // la goule en tête
  const choix = choisirRepli(etat, "M1", 3, plateau);
  const dAvant = Math.abs(1 - 0);
  verifier("l'IA choisit une case plus loin de Naomi", !!choix
           && (Math.abs(choix.q) + Math.abs(choix.q + choix.r) + Math.abs(choix.r)) / 2 > dAvant, JSON.stringify(choix));
  const carte = { idCarte: "C_M1", infos: { portee: 1, fatigue: 10 }, attaques: [{ valeurBrute: 8 }], alterations: [],
                  repli: { portee: 3, chance: 60 } };
  const pas = jouerCreature(etat, "M1", carte, plateau);
  const types = pas.entree.etapes.map(e => e.type);
  verifier("elle attaque, puis se replie, puis clôt son tour",
           types.indexOf("carte") >= 0 && types.indexOf("repli") > types.indexOf("carte")
           && types.lastIndexOf("tour") > types.indexOf("repli"), types.join(","));
  const g = pas.etat.combattants.M1, n = pas.etat.combattants.H1;
  const d = (Math.abs(g.q - n.q) + Math.abs(g.q + g.r - n.q - n.r) + Math.abs(g.r - n.r)) / 2;
  verifier("et finit loin de Naomi (3 cases)", d === 4 || d === 3, `distance ${d}`);
  const sansRepli = jouerCreature(etat, "M1", { ...carte, repli: null }, plateau);
  verifier("sans Repli sur sa carte, elle reste au contact",
           !sansRepli.entree.etapes.some(e => e.type === "repli"));
}

// =========================================================================
console.log("\n4. L'ÉCRAN");
// =========================================================================
{
  const annonce = misEnScene({ type: "repli", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 0, r: -3 } }, monde());
  verifier("« ↩️ Repli ! » s'affiche sur le lanceur", annonce.geste === "message" && /Repli/.test(annonce.texte));
  const p = misEnScene({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: -1, r: 0 }, cout: 0, repli: true }, monde());
  verifier("ses pas sont joués en mode repli (rapides, avec traînée)", p.geste === "pas" && p.repli === true);
  const o = misEnScene({ type: "opportunite", attaquant: "M1", cible: "H1", evitee: true, mot: "Repli 💨" }, monde());
  verifier("une opportunité évitée dit « Repli 💨 »", o.texte === "Repli 💨");
  const src = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8');
  verifier("l'animation de pas connaît le repli (traînée + vitesse)",
           /laisserTraceRepli\(tokenDiv\)/.test(src) && /const repli = !!pas\.repli/.test(src));
}

// =========================================================================
console.log("\n5. LA CARTE, EXTRAITE PAR LE VRAI moteur_effets.js");
// =========================================================================
const GRIMOIRE = {
  EFF_REPLI: FICHE_REPLI,
  EFF_ATTAQUE_LEGERE: { id: "EFF_ATTAQUE_LEGERE", Nom: "Attaque légère", Valeur: 6, Pourcent_Base: 0, Pourcent_Max: 0,
    Cout_PT: "2", Type_Mecanique: "Action/Global", Effet_Base: "Inflige 6 dégâts." }
};
const SRC = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const pg = await b.newPage();
// Servie en http : un module (mouvement_pur.js) ne s'importe pas depuis file://.
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
await pg.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
await pg.goto(base + '/index.html'); await pg.waitForTimeout(300);
await pg.evaluate(({ src, grimoire }) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => ({ q: 0, r: 0 }),
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  window.EFFETS_BDD_CACHE = grimoire;
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  window.__extraire = async (actions) => {
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Arme légère CAC", Fatigue: 5, Composants: { actions } } };
    return window.demarrerCiblage("C", { extraire: true, idLanceur: "J1" });
  };
}, { src: SRC, grimoire: GRIMOIRE });
{
  const r = await pg.evaluate(async () => {
    const deux = await window.__extraire([{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: {} },
                                          { baseEffetId: "EFF_REPLI", count: 1, mods: {} }]);
    const enMod = await window.__extraire([{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: { EFF_REPLI: 1 } }]);
    const sans = await window.__extraire([{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: {} }]);
    return { deux: { repli: deux.repli, nbAtt: deux.attaques.length, brut: (deux.attaques[0] || {}).valeurBrute },
             enMod: enMod.repli, sans: sans.repli };
  });
  verifier("Attaque + action Repli : la carte porte { 3 cases, 60 % }",
           r.deux.repli && r.deux.repli.portee === 3 && r.deux.repli.chance === 60, JSON.stringify(r.deux.repli));
  verifier("l'attaque reste entière (1 attaque, 6 dégâts)", r.deux.nbAtt === 1 && r.deux.brut === 6, JSON.stringify(r.deux));
  verifier("posé en modificateur, le Repli est lu aussi", r.enMod && r.enMod.portee === 3, JSON.stringify(r.enMod));
  verifier("une carte sans Repli n'en porte pas", r.sans === null);

  // Les cases éclairées à l'écran : même fonction que le cerveau.
  const cases = await pg.evaluate(async () => {
    const mp = await import('/mouvement_pur.js');
    window.mouvementPur = window.mouvementPur || mp;
    return window.casesDeRepliEcran("J1", 3, null).map(h => `${h.q},${h.r}`);
  });
  verifier("l'écran propose des cases à 3 pas, jamais celle de la goule",
           cases.length > 0 && !cases.includes("1,0") && !cases.includes("0,0"), `${cases.length} cases`);
}
// LE PARCOURS DU JOUEUR, du ciblage à l'intention envoyée : il vise la goule,
// valide, l'écran lui demande où se replier, il tape une case — et la carte
// part au cerveau AVEC cette case.
{
  const r = await pg.evaluate(async () => {
    window.PLATEAU_VTT.pixelToHex = () => window.__caseCliquee;
    window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
    window.__envoyees = []; window.__messages = [];
    window.afficherMessageFlottantHex = (q, r, t) => window.__messages.push(t);
    window.estUneCreature = (p) => !!(p && p.estMonstre);
    window.critiqueCombattant = () => 0;
    window.estCombattantMort = () => false;
    window.regimeDemande = { actif: () => true,
      carte: async (acteur, carte) => { window.__envoyees.push(JSON.parse(JSON.stringify(carte))); } };
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.ETAT_CIBLAGE = null;
    window.COMPETENCES_CACHE = { CR: { Nom: "Coup et repli", Arme: "Arme légère CAC", Fatigue: 40,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: {} },
                              { baseEffetId: "EFF_REPLI", count: 1, mods: {} }] } } };
    await window.demarrerCiblage("CR", { idLanceur: "J1" });
    window.ajouterCibleCiblage("M1");
    const hote = document.getElementById("conteneur-plateau-vtt");
    const fin = window.declencherResolutionAvecBondEventuel();
    await new Promise(res => setTimeout(res, 40));
    const assombri = !!document.getElementById("svg-repli-assombrissement");
    // D'abord une case trop loin (4 pas) : rien ne se passe.
    window.__caseCliquee = { q: -4, r: 0 };
    hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    await new Promise(res => setTimeout(res, 20));
    const envoisApresTropLoin = window.__envoyees.length;
    // Puis une vraie case de repli.
    window.__caseCliquee = { q: -3, r: 0 };
    hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    await fin;
    const carte = window.__envoyees[0] || {};
    return { assombri, envoisApresTropLoin, nb: window.__envoyees.length, repli: carte.repli || null,
             cibles: ((carte.attaques || [])[0] || {}).cibles, messages: window.__messages,
             overlayParti: !document.getElementById("svg-repli-assombrissement") };
  });
  verifier("après la cible, l'écran demande où se replier (plateau assombri)", r.assombri && r.messages.some(m => /replier/.test(m)),
           JSON.stringify(r.messages));
  verifier("un clic trop loin ne fait rien", r.envoisApresTropLoin === 0);
  verifier("un clic sur une case à 3 pas : la carte part, une seule fois", r.nb === 1 && r.overlayParti);
  verifier("avec l'attaque sur la goule ET la case de repli",
           JSON.stringify(r.cibles) === '["M1"]' && r.repli && r.repli.vers.q === -3 && r.repli.vers.r === 0
           && r.repli.portee === 3 && r.repli.chance === 60, JSON.stringify(r.repli));

  // Taper son propre pion : pas de repli, la carte part quand même.
  const r2 = await pg.evaluate(async () => {
    window.__envoyees = []; window.ETAT_CIBLAGE = null;
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    await window.demarrerCiblage("CR", { idLanceur: "J1" });
    window.ajouterCibleCiblage("M1");
    const hote = document.getElementById("conteneur-plateau-vtt");
    const fin = window.declencherResolutionAvecBondEventuel();
    await new Promise(res => setTimeout(res, 40));
    window.__caseCliquee = { q: 0, r: 0 };
    hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    await fin;
    return { nb: window.__envoyees.length, repli: (window.__envoyees[0] || {}).repli };
  });
  verifier("taper sa propre case : la carte part sans repli", r2.nb === 1 && !r2.repli, JSON.stringify(r2));
}

// Le transport jusqu'au cerveau (regime_cerveau.js) : la case ne se perd pas
// en route, et la table des créatures garde leur repli.
{
  const src = fs.readFileSync('/home/user/Ivalis/regime_cerveau.js', 'utf-8');
  const demande = src.slice(src.indexOf('const demanderCarte = '), src.indexOf('const demanderBond = '));
  verifier("la demande de carte transporte la case de repli", /repli: \{/.test(demande) && /carte\.repli\.vers/.test(demande));
  verifier("la carte d'une créature garde son repli", /repli: carte\.repli \|\| null/.test(src));
}

await b.close(); serveur.close();

// =========================================================================
console.log("\n6. LE GÉNÉRATEUR DE TECHNIQUES DES MONSTRES");
// =========================================================================
{
  const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
  const fenetre = {}; global.window = fenetre;
  global.localStorage = { getItem: () => null };
  global.fetch = async () => { throw new Error("IA débranchée"); };
  global.document = { getElementById: () => null };
  fenetre.EFFETS_BDD_CACHE = { ...EFFETS, EFF_REPLI: FICHE_REPLI };
  fenetre.gabaritMonstre = () => null;
  eval(fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, ''));
  const compte = async (archetype, n) => {
    let cartes = 0, avecRepli = 0;
    for (let i = 0; i < n; i++) {
      const docs = await fenetre.genererCompetencesMonstre({ nom: "Créature", archetype, palier: "Normal" });
      docs.forEach(d => { cartes++; if (d.Composants.actions.some(a => a.baseEffetId === "EFF_REPLI"
        || Object.keys(a.mods || {}).includes("EFF_REPLI"))) avecRepli++; });
    }
    return { cartes, avecRepli };
  };
  const tireur = await compte("DPS DISTANCE", 12);
  const tank = await compte("TANK CAC", 12);
  verifier("un tireur se sert du Repli", tireur.avecRepli > 0, `${tireur.avecRepli}/${tireur.cartes}`);
  verifier("plus souvent qu'un tank", tireur.avecRepli / tireur.cartes > tank.avecRepli / tank.cartes,
           `${tireur.avecRepli}/${tireur.cartes} contre ${tank.avecRepli}/${tank.cartes}`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
