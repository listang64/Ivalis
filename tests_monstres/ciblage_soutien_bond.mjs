// VISER UNE CARTE QUI FRAPPE ET SOIGNE, ET VISER APRÈS UN BOND.
//
// Deux signalements de Nico, joués ici sur le VRAI moteur_effets.js, dans un
// vrai navigateur, du premier clic jusqu'à l'intention envoyée au cerveau :
//
//   1. « Quand on met un soin sur une compétence après une attaque, il soigne
//      la cible de l'attaque. Ça devrait soigner soi-même ou un allié. Fais
//      une sélection de cible pour le soin après celle de l'attaque. »
//   2. « Une compétence avec bond puis une zone : la sélection de zone s'est
//      faite sur mon emplacement d'avant le bond. »
//
// Et la même règle côté créatures, dans le cerveau (cerveau_combat.js) : le
// soin d'une carte mixte revient à la créature, pas à sa victime.
import fs from 'fs';
import { jouerCreature } from '../cerveau_combat.js';
import { construireEtatCombat } from '../combat_etat.js';

const SRC = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

// Le décor : un lanceur J1, un allié J2, deux ennemis. Le plateau est un
// simple hexagone sans murs ; la carte est forgée à la volée.
await p.evaluate((src) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = {
    hexSize: 30,
    hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }),
    pixelToHex: () => window.__caseCliquee,
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, rayon) => {
      const out = [];
      for (let dq = -rayon; dq <= rayon; dq++)
        for (let dr = -rayon; dr <= rayon; dr++)
          if (dist({ q, r }, { q: q + dq, r: r + dr }) <= rayon) out.push({ q: q + dq, r: r + dr });
      return out;
    }
  };
  window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
  window.bonusEquip = () => 0;
  window.bonusPorteeMagique = () => 0;
  window.estUneCreature = (p) => !!(p && p.estMonstre);
  window.critiqueCombattant = () => 0;
  window.jouerSonClic = () => {};
  window.afficherMessageFlottantHex = (q, r, texte) => { window.__messages.push(texte); };
  window.estCombattantMort = () => false;
  window.EFFETS_BDD_CACHE = {
    ATT:  { id: "ATT", Nom: "Attaque légère", Valeur: 6 },
    SOIN: { id: "SOIN", Nom: "Soin", Valeur: 5 },
    BOND: { id: "BOND", Nom: "Bond", Valeur: 2 },
    DIST: { id: "DIST", Nom: "Distance", Valeur: 1 }
  };
  window.__hote = document.createElement("div");
  window.__hote.id = "apercu-carte-hd-competence";
  document.body.appendChild(window.__hote);
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));

  // Le cerveau, réduit à ce qu'il reçoit.
  window.regimeDemande = {
    actif: () => true,
    carte: async (acteur, carte) => { window.__envoyees.push(JSON.parse(JSON.stringify(carte))); },
    bond: async (acteur, vers) => { window.__bonds.push(vers); }
  };

  window.__poser = (positions) => {
    window.__messages = []; window.__envoyees = []; window.__bonds = [];
    const lanceur = { idPersonnage: "J1", prenom: "Cybile", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [
      lanceur,
      { idPersonnage: "J2", prenom: "Pliors", camp: "Allié", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M2", prenom: "Spectre", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }
    ];
    window.TOKENS_VTT_DATA = JSON.parse(JSON.stringify(positions));
    window.COMBAT_PERSOS_JOUEUR = [lanceur];
    window.COMBAT_INDEX_PERSO = 0;
    window.ETAT_CIBLAGE = null;
  };
  window.__carte = (actions) => {
    const id = "C_" + Math.random().toString(36).slice(2, 8);
    window.COMPETENCES_CACHE = { [id]: { Nom: "Banc", Fatigue: 10, Arme: "Magie", Composants: { actions } } };
    return id;
  };
  window.__cibles = (carte, nom) => ((carte.attaques || []).find(a => a.nom === nom) || {}).cibles;
}, SRC);

// =========================================================================
console.log("1. ATTAQUE PUIS SOIN : DEUX CIBLES, DEUX TEMPS");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 6, r: 0 } });
    const id = window.__carte([{ baseEffetId: "ATT", mods: {} }, { baseEffetId: "SOIN", mods: {} }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    const st = window.ETAT_CIBLAGE;
    const debut = { deuxTemps: st.soutienDiffere, phase: st.phaseCiblage };

    window.ajouterCibleCiblage("M1");
    const apresAttaque = { attaque: window.__cibles(st, "Attaque légère"), soin: window.__cibles(st, "Soin") };

    await window.declencherResolutionAvecBondEventuel();
    const phase2 = { phase: st.phaseCiblage, envoyees: window.__envoyees.length,
                     soin: window.__cibles(st, "Soin"), attaque: window.__cibles(st, "Attaque légère"),
                     message: (document.getElementById("msg-ciblage-soutien") || {}).innerText || "",
                     boutons: !!document.getElementById("btn-resoudre-carte") };

    window.ajouterCibleCiblage("M1");
    const soinSurEnnemi = { soin: window.__cibles(st, "Soin"), messages: [...window.__messages] };

    window.ajouterCibleCiblage("J2");
    const soinSurAllie = window.__cibles(st, "Soin");

    await window.declencherResolutionAvecBondEventuel();
    const envoyee = window.__envoyees[0] || {};
    return { debut, apresAttaque, phase2, soinSurEnnemi, soinSurAllie,
             envoyee: { attaque: window.__cibles(envoyee, "Attaque légère"), soin: window.__cibles(envoyee, "Soin") },
             nbEnvois: window.__envoyees.length,
             messageParti: !document.getElementById("msg-ciblage-soutien") };
  });
  verifier("la carte se vise en deux temps, l'attaque d'abord",
           r.debut.deuxTemps === true && r.debut.phase === "offensive", JSON.stringify(r.debut));
  verifier("viser l'ennemi n'engage QUE l'attaque",
           JSON.stringify(r.apresAttaque.attaque) === '["M1"]' && (r.apresAttaque.soin || []).length === 0,
           JSON.stringify(r.apresAttaque));
  verifier("valider l'attaque ouvre la phase du soin, sans rien envoyer",
           r.phase2.phase === "soutien" && r.phase2.envoyees === 0, JSON.stringify(r.phase2).slice(0, 120));
  verifier("le lanceur est présélectionné pour le soin", JSON.stringify(r.phase2.soin) === '["J1"]',
           JSON.stringify(r.phase2.soin));
  verifier("l'attaque garde sa cible pendant ce temps", JSON.stringify(r.phase2.attaque) === '["M1"]');
  verifier("un message dit qu'on vise le soin, RÉSOUDRE est là",
           /soin/i.test(r.phase2.message) && r.phase2.boutons, r.phase2.message);
  verifier("le soin refuse l'ennemi", JSON.stringify(r.soinSurEnnemi.soin) === '["J1"]'
           && r.soinSurEnnemi.messages.includes("Cible invalide"), JSON.stringify(r.soinSurEnnemi));
  verifier("et accepte un allié", JSON.stringify(r.soinSurAllie) === '["J2"]', JSON.stringify(r.soinSurAllie));
  verifier("UNE seule carte part, attaque sur M1, soin sur J2",
           r.nbEnvois === 1 && JSON.stringify(r.envoyee.attaque) === '["M1"]'
           && JSON.stringify(r.envoyee.soin) === '["J2"]', JSON.stringify(r.envoyee));
  verifier("le message du soin s'en va avec le ciblage", r.messageParti);
}

// =========================================================================
console.log("\n2. UNE CARTE QUI NE FAIT QUE FRAPPER, OU QUE SOIGNER : RIEN NE CHANGE");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 6, r: 0 } });
    let id = window.__carte([{ baseEffetId: "ATT", mods: {} }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    window.ajouterCibleCiblage("M1");
    await window.declencherResolutionAvecBondEventuel();
    const attaqueSeule = { deuxTemps: window.ETAT_CIBLAGE.soutienDiffere, envois: window.__envoyees.length,
                           cible: window.__cibles(window.__envoyees[0] || {}, "Attaque légère") };

    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 6, r: 0 } });
    id = window.__carte([{ baseEffetId: "SOIN", mods: {} }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    window.ajouterCibleCiblage("J2");
    await window.declencherResolutionAvecBondEventuel();
    const soinSeul = { deuxTemps: window.ETAT_CIBLAGE.soutienDiffere, envois: window.__envoyees.length,
                       cible: window.__cibles(window.__envoyees[0] || {}, "Soin") };
    return { attaqueSeule, soinSeul };
  });
  verifier("une attaque seule part d'un seul geste",
           !r.attaqueSeule.deuxTemps && r.attaqueSeule.envois === 1
           && JSON.stringify(r.attaqueSeule.cible) === '["M1"]', JSON.stringify(r.attaqueSeule));
  verifier("un soin seul aussi", !r.soinSeul.deuxTemps && r.soinSeul.envois === 1
           && JSON.stringify(r.soinSeul.cible) === '["J2"]', JSON.stringify(r.soinSeul));
}

// =========================================================================
console.log("\n3. UNE ZONE QUI FRAPPE ET SOIGNE : LES ENNEMIS PRENNENT, LES ALLIÉS SONT SOIGNÉS");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 6, r: 0 } });
    const zone = [{ q: 1, r: 0 }, { q: 0, r: 1 }];
    const id = window.__carte([{ baseEffetId: "ATT", mods: {}, zoneHexes: zone },
                               { baseEffetId: "SOIN", mods: {}, zoneHexes: zone }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    const deuxTemps = window.ETAT_CIBLAGE.soutienDiffere;
    window.validerZoneAoE();
    await new Promise(r => setTimeout(r, 50));
    const e = window.__envoyees[0] || {};
    return { deuxTemps, envois: window.__envoyees.length,
             attaque: window.__cibles(e, "Attaque légère"), soin: window.__cibles(e, "Soin") };
  });
  verifier("le soin posé DANS la zone ne demande pas de second ciblage", r.deuxTemps === false && r.envois === 1,
           JSON.stringify(r));
  verifier("le soin ne touche que les alliés de la zone", JSON.stringify(r.soin) === '["J2"]', JSON.stringify(r.soin));
  verifier("l'attaque touche la zone (lanceur exclu)",
           JSON.stringify([...(r.attaque || [])].sort()) === '["J2","M1"]', JSON.stringify(r.attaque));
}

// =========================================================================
console.log("\n4. UNE ZONE D'ATTAQUE, PUIS UN SOIN À PART");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 6, r: 0 } });
    const id = window.__carte([{ baseEffetId: "ATT", mods: {}, zoneHexes: [{ q: 1, r: 0 }] },
                               { baseEffetId: "SOIN", mods: {} }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    const st = window.ETAT_CIBLAGE;
    window.validerZoneAoE();
    await new Promise(r => setTimeout(r, 50));
    const milieu = { phase: st.phaseCiblage, envois: window.__envoyees.length,
                     zoneEffacee: !document.getElementById("svg-zone-ciblage"),
                     soin: window.__cibles(st, "Soin") };
    // En phase de soin, un clic sur le plateau ne repose plus la zone.
    window.__caseCliquee = { q: 5, r: 5 };
    const ev = new MouseEvent("click", { bubbles: true, clientX: 1, clientY: 1 });
    window.VTT_CIBLAGE_CLICK(Object.assign(ev, {}));
    window.ajouterCibleCiblage("J2");
    await window.declencherResolutionAvecBondEventuel();
    const e = window.__envoyees[0] || {};
    return { milieu, envois: window.__envoyees.length,
             attaque: window.__cibles(e, "Attaque légère"), soin: window.__cibles(e, "Soin") };
  });
  verifier("valider la zone ouvre la phase du soin", r.milieu.phase === "soutien" && r.milieu.envois === 0,
           JSON.stringify(r.milieu));
  verifier("le dessin de la zone s'en va", r.milieu.zoneEffacee);
  verifier("le soin part sur l'allié choisi, l'attaque sur la zone",
           r.envois === 1 && JSON.stringify(r.soin) === '["J2"]' && JSON.stringify(r.attaque) === '["M1"]',
           JSON.stringify(r));
}

// =========================================================================
console.log("\n5. BOND PUIS ZONE : LA ZONE PART DE LA CASE D'ARRIVÉE");
{
  // Le vrai saut : un clic sur une case d'atterrissage, le cerveau reçoit la
  // demande — et le pion, lui, n'a pas encore bougé à l'écran.
  const saut = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 3 }, M1: { q: 3, r: 0 }, M2: { q: 1, r: 0 } });
    const hote = document.getElementById("conteneur-plateau-vtt");
    window.__caseCliquee = { q: 2, r: 0 };
    const promesse = window.resoudreBondInteractif("J1", 2);
    await new Promise(r => setTimeout(r, 30));
    hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    const rendu = await promesse;
    return { rendu, bonds: window.__bonds, pion: window.TOKENS_VTT_DATA.J1 };
  });
  verifier("le Bond rend la case d'atterrissage", saut.rendu && saut.rendu.q === 2 && saut.rendu.r === 0,
           JSON.stringify(saut.rendu));
  verifier("(le pion, lui, n'a pas encore bougé : c'est le cerveau qui le déplacera)",
           saut.pion.q === 0 && saut.pion.r === 0);

  const r = await p.evaluate(async () => {
    // M2 colle l'ancienne case (1,0), M1 colle la case d'arrivée (3,0).
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 3 }, M1: { q: 3, r: 0 }, M2: { q: 1, r: 0 } });
    window.resoudreBondInteractif = async () => ({ q: 2, r: 0 });
    const id = window.__carte([{ baseEffetId: "BOND", mods: {} },
                               { baseEffetId: "ATT", mods: {}, zoneHexes: [{ q: 1, r: 0 }] }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    const st = window.ETAT_CIBLAGE;
    const avant = { origine: st.origineLanceur, centre: st.zoneCenterHex };
    window.validerZoneAoE();
    await new Promise(r => setTimeout(r, 50));
    const e = window.__envoyees[0] || {};
    return { avant, attaque: window.__cibles(e, "Attaque légère") };
  });
  verifier("le ciblage retient l'origine d'après le bond", r.avant.origine && r.avant.origine.q === 2,
           JSON.stringify(r.avant));
  verifier("la zone collée au lanceur est centrée sur la case d'arrivée",
           r.avant.centre && r.avant.centre.q === 2 && r.avant.centre.r === 0, JSON.stringify(r.avant.centre));
  verifier("elle frappe l'ennemi voisin de l'ARRIVÉE, pas celui du départ",
           JSON.stringify(r.attaque) === '["M1"]', JSON.stringify(r.attaque));

  const posables = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 5 }, M1: { q: 9, r: 9 }, M2: { q: 9, r: -9 } });
    window.resoudreBondInteractif = async () => ({ q: 3, r: 0 });
    const id = window.__carte([{ baseEffetId: "BOND", mods: {} },
                               { baseEffetId: "ATT", mods: { DIST: 1 }, zoneHexes: [{ q: 0, r: 0 }] }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    const config = window.configCiblage(window.ETAT_CIBLAGE);
    const cases = window.casesPosablesZone("J1", config);
    return { portee: config.rangeMax, loin: cases.some(h => h.q === 5 && h.r === 0),
             depart: cases.some(h => h.q === -2 && h.r === 0) };
  });
  verifier("une zone à distance se pose autour de la case d'arrivée",
           posables.loin && !posables.depart, JSON.stringify(posables));
}

verifier("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();

// =========================================================================
console.log("\n6. LES CRÉATURES : LE SOIN D'UNE CARTE MIXTE REVIENT À LA CRÉATURE");
{
  const fiche = (id, extra) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 40, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  const etat = construireEtatCombat({
    idPartie: "P1", cerveau: "P_03", graine: 11,
    combattants: [fiche("H1", { camp: "Allié", idJoueur: "P_03" }),
                  fiche("M1", { camp: "Ennemi", estMonstre: true, nom: "Goule", Personnalite: "brutal" })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"],
              File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C1" }] }
  });
  const carte = { idCarte: "C1", infos: { portee: 1, fatigue: 5 },
    attaques: [{ nom: "Attaque", valeurBrute: 8 }, { nom: "Soin", valeurBrute: 10, isHeal: true }],
    alterations: [] };
  const pas = jouerCreature(etat, "M1", carte, null);
  const soins = (pas && pas.entree && pas.entree.etapes || []).filter(e => e.type === "soin");
  const coups = (pas && pas.entree && pas.entree.etapes || []).filter(e => e.type === "degats");
  verifier("la créature frappe le héros", coups.some(e => e.cible === "H1"), JSON.stringify(coups.map(e => e.cible)));
  verifier("et se soigne elle-même, jamais le héros",
           soins.length > 0 && soins.every(e => e.cible === "M1"), JSON.stringify(soins.map(e => e.cible)));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
