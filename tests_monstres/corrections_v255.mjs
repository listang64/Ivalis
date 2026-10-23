// LES CORRECTIONS DE LA v255.
//
//   1. « Fais en sorte qu'une fois la compétence jouée, on ne puisse plus
//      sélectionner de déplacement avec son perso pour le tour en cours. »
//   2. « Je viens de me faire un soin, et la jauge affichée en dessous a monté
//      direct, sans animation de transition. »
//   3. « L'effet Contre ne peut être mis que pour soi-même. »
//   4. « Les dégâts triche aux monstres : mets plutôt en % sur tous leurs
//      dégâts et soins existants ; change le tableau et mets 10 % à chaque. »
//   5. « En combat, quand on clique sur un token, des jauges apparaissent en
//      dessous : fais apparaître en plus, sous les jauges, en tout petit, le
//      nom du personnage ou du monstre, avec une ombre portée en dessous. »
import fs from 'fs';
import * as MP from '../moteur_pur.js';
import { construireEtatCombat, creerDes } from '../combat_etat.js';
import { ouvrirStudio } from './_studio_commun.mjs';

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = () => construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 5,
    combattants: [fiche("H1", "Allié", { idJoueur: "P" }), fiche("M1", "Ennemi", { estMonstre: true, Palier: "Normal" }),
                  fiche("M2", "Ennemi", { estMonstre: true, Palier: "Boss" })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 2, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1", "M2"] } });

const { p, verifier, fin } = await ouvrirStudio();
console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v255");
console.log("=========================================================");

console.log("\n4a. LA TRICHE DES CRÉATURES : UN POURCENTAGE DE LEURS DÉGÂTS ET SOINS");
{
    const frappe = (lanceur, cible, valeur, heal) => {
        const e = monde();
        e.combattants[cible].pv = 50;
        const r = MP.resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
            attaques: [{ valeurBrute: valeur, typeRes: "Physique", isHeal: !!heal, cibles: [cible] }], alterations: [],
            jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } });
        return r.etat.combattants[cible].pv - 50;
    };
    verifier("à l'origine, chaque stature : +10 %", JSON.stringify(MP.bonusMonstresActuels()) === '{"Petit":10,"Normal":10,"Élite":10,"Boss":10}',
             JSON.stringify(MP.bonusMonstresActuels()));
    verifier("une créature Normale tape 20 → 22", frappe("M1", "H1", 20) === -22, `${frappe("M1", "H1", 20)}`);
    verifier("…et 40 → 44 : le bonus suit le coup (ce n'est plus +1 fixe)", frappe("M1", "H1", 40) === -44, `${frappe("M1", "H1", 40)}`);
    verifier("son soin aussi : 10 → 11", frappe("M1", "M2", 10, true) === 11, `${frappe("M1", "M2", 10, true)}`);
    verifier("un héros frappe comme sa carte (20)", frappe("H1", "M1", 20) === -20, `${frappe("H1", "M1", 20)}`);
    MP.reglerBonusMonstres({ Petit: 10, Normal: 50, "Élite": 10, Boss: 10 });
    verifier("Normale réglée à 50 % : 20 → 30", frappe("M1", "H1", 20) === -30, `${frappe("M1", "H1", 20)}`);
    MP.reglerBonusMonstres(null);
    verifier("sans réglage : retour aux 10 %", frappe("M1", "H1", 20) === -22);
}

console.log("\n3a. LE CONTRE NE SE POSE QUE SUR SOI (le cerveau)");
{
    const e = monde();
    // Une créature qui pose son Contre « sur » un allié (M2) : il part sur elle.
    const action = { type: "carte", idLanceur: "M1", idCarte: "C", critique: false, attaques: [],
        alterations: [{ nom: "Contre", chance: 100, duree: 1, valeurContre: 30, isHeal: true, cibles: ["M2"] }] };
    const jets = MP.tirerDesCarte(e, action, "M1", false, creerDes(3));
    const r = MP.resoudreCarte(e, { ...action, jets });
    const porte = (id) => (r.etat.combattants[id].etats || []).some(x => x.nom === "Contre");
    verifier("visé sur un allié, le Contre se pose sur le lanceur", porte("M1") && !porte("M2"),
             JSON.stringify({ M1: porte("M1"), M2: porte("M2") }));
    verifier("(les dés sont tirés pour le lanceur, pas pour l'allié)", !!(jets.parCible.M1 && jets.parCible.M1.etats.Contre === true)
             && !jets.parCible.M2, JSON.stringify(Object.keys(jets.parCible)));
    const soin = typeof MP.ciblesSurSoi === "function"
        ? MP.ciblesSurSoi({ alterations: [{ nom: "Soin", cibles: ["M2"] }, { nom: "Contre", cibles: ["M2"] }] }, "M1") : { alterations: [] };
    verifier("une carte Soin + Contre : le soin garde son allié, le Contre revient au lanceur",
             JSON.stringify(soin.alterations.map(a => a.cibles[0])) === '["M2","M1"]', JSON.stringify(soin.alterations));
}

// =========================================================================
//  SUR LE VRAI PLATEAU (le Studio : la carte de combat, Aldric en 3,2)
// =========================================================================
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
await p.evaluate((EFFETS) => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.fermerStudioAnimation();
  const param = document.getElementById("conteneur-parametres");
  if (param) { param.style.display = "none"; param.classList.remove("ouvert"); }
  document.getElementById("fenetre-combat").style.display = "block";
  // Le menu latéral recouvre la droite du plateau : on le range, comme en combat.
  const menu = document.getElementById("menu-lateral"); if (menu) menu.style.display = "none";
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  const heros = "https://res.cloudinary.com/x/heros-test.svg";
  const f = (id, prenom, extra) => ({ idPersonnage: id, prenom, camp: "Allié", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100,
                                     Etats_Alteres: [], statut: "Vivant", xp: 0, race: "Humain", ...extra });
  window.PERSOS_PARTIE = [f("H1", "Aldric", { idJoueur: "J1", urlToken: heros }), f("H2", "Bryn", { idJoueur: "J2" }),
                          f("M1", "Gnoll", { camp: "Ennemi", estMonstre: true })];
  window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE.slice(0, 2);
  window.TOKENS_VTT_DATA = { H1: { q: 3, r: 2, url: heros, taille: 48 }, H2: { q: 4, r: 1, taille: 48 }, M1: { q: 6, r: 2, taille: 48 } };
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "H1" }] };
  window.TOKEN_SELECTIONNE = "H1";
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
}, EFFETS_PAR_ID);
await p.waitForTimeout(400);

console.log("\n1. LA COMPÉTENCE PARTIE, PLUS DE DÉPLACEMENT");
{
  const clicCase = async (q, r) => {
    const pt = await p.evaluate(({ q, r }) => {
      window.TOKEN_SELECTIONNE = "H1";     // un clic dans le vide désélectionne
      const px = window.PLATEAU_VTT.hexToPixel(q, r);
      return { x: px.x * window.VTT_SCALE + window.VTT_POS_X, y: px.y * window.VTT_SCALE + window.VTT_POS_Y };
    }, { q, r });
    await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(150);
  };
  const etat = () => p.evaluate(() => ({ chemin: (window.CHEMIN_MOUVEMENT || []).length, envois: window.__envois.length,
                                         message: (window.__messages || []).slice(-1)[0] || "" }));
  await p.evaluate(() => {
    window.__envois = []; window.__messages = [];
    const vrai = window.afficherMessageFlottantHex;
    window.afficherMessageFlottantHex = (q, r, t, ...rest) => { window.__messages.push(t); return vrai(q, r, t, ...rest); };
    window.__vraiRegime = window.regimeDemande;
    window.__enVol = null;
    window.regimeDemande = { actif: () => true, enVol: (id) => window.__enVol === id,
                             mouvement: async (acteur, chemin) => { window.__envois.push(chemin); return true; } };
    window.annulerMouvement();
  });
  await clicCase(4, 2);
  const avant = await etat();
  verifier("avant la compétence : toucher une case trace un chemin", avant.chemin > 0, JSON.stringify(avant));
  await p.evaluate(() => { window.annulerMouvement(); window.__enVol = "H1"; });
  await clicCase(4, 2);
  const apres = await etat();
  verifier("la compétence partie : plus de chemin, et on le dit", apres.chemin === 0 && /Compétence jouée/.test(apres.message), JSON.stringify(apres));
  // Un chemin tracé AVANT, qu'on valide APRÈS : il ne part pas.
  await p.evaluate(() => { window.__enVol = null; });
  await clicCase(4, 2);
  await p.evaluate(async () => { window.__enVol = "H1"; await window.validerMouvement(); });
  const valide = await etat();
  verifier("un chemin tracé avant, validé après : annulé, rien n'est envoyé", valide.chemin === 0 && valide.envois === 0, JSON.stringify(valide));
  // Une autre tête de file : son déplacement à elle n'est pas concerné.
  const autre = await p.evaluate(() => window.__ou(() => window.competenceDejaJouee("H2"), "absente"));
  verifier("seul le combattant qui a joué est bloqué", autre === false, String(autre));
  await p.evaluate(() => { window.annulerMouvement(); window.regimeDemande = window.__vraiRegime; window.__enVol = null; });
}

console.log("\n2 + 5. LES JAUGES SOUS LE PION : ELLES GLISSENT, ET LE NOM EN DESSOUS");
{
  const r = await p.evaluate(async () => {
    const h = window.PERSOS_PARTIE[0];
    window.TOKEN_SELECTIONNE = "H1";
    h.PV_Actuels = 15;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(res => setTimeout(res, 800));
    const barre = () => document.querySelector("#porteur-H1 .jauge-selection-vie .jauge-selection-remplie, #token-H1 .jauge-selection-vie .jauge-selection-remplie");
    const pct = () => { const b = barre(); return b ? Math.round(b.offsetWidth / b.parentElement.clientWidth * 100) : -1; };
    const attendu = (pv) => Math.round(pv / window.mesuresJaugesSelection(h).pvMax * 100);
    const depart = pct();
    // Le soin : 15 → 54 / 60, et le plateau se redessine.
    h.PV_Actuels = 54;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(res => setTimeout(res, 120));
    const enRoute = pct();
    // Un redessin EN PLEIN glissement : il ne doit pas le faire sauter au bout.
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const apresRedessin = pct();
    await new Promise(res => setTimeout(res, 900));
    const arrivee = pct();
    const nom = document.querySelector("#porteur-H1 .jauges-selection-nom, #token-H1 .jauges-selection-nom");
    const calcule = nom ? getComputedStyle(nom) : null;
    const style = calcule ? { fontSize: calcule.fontSize, textShadow: calcule.textShadow } : null;
    const bloc = nom ? nom.parentElement.getBoundingClientRect() : null, n = nom ? nom.getBoundingClientRect() : null;
    // Un monstre sélectionné a son nom aussi.
    window.TOKEN_SELECTIONNE = "M1";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const nomMonstre = (document.querySelector("#porteur-M1 .jauges-selection-nom, #token-M1 .jauges-selection-nom") || {}).textContent || "";
    window.TOKEN_SELECTIONNE = "H1";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    return { depart, enRoute, apresRedessin, arrivee, quinze: attendu(15), cinquante: attendu(54), nom: nom ? nom.textContent : null, taille: style && style.fontSize,
             ombre: style && style.textShadow, sous: !!(bloc && n && n.top >= bloc.bottom - 1), nomMonstre };
  });
  verifier("avant le soin : la barre de vie à 15 PV", Math.abs(r.depart - r.quinze) <= 2, `${r.depart} (attendu ${r.quinze})`);
  verifier("le soin : la barre MONTE (encore en route après 120 ms)", r.enRoute > r.depart + 3 && r.enRoute < r.cinquante - 3, `${r.depart} → ${r.enRoute}`);
  verifier("un redessin pendant le glissement : ni saut au bout, ni recul",
           r.apresRedessin < r.cinquante - 3 && r.apresRedessin >= r.enRoute - 1, `${r.enRoute} → ${r.apresRedessin}`);
  verifier("…et elle arrive à 54 PV", Math.abs(r.arrivee - r.cinquante) <= 2, `${r.arrivee} (attendu ${r.cinquante})`);
  verifier("sous les jauges : le nom, en tout petit", r.nom === "Aldric" && r.sous && parseFloat(r.taille) <= 10, JSON.stringify(r));
  verifier("avec une ombre portée dessous (le relief)", /rgb|rgba/.test(r.ombre || "") && r.ombre !== "none", r.ombre);
  verifier("un monstre sélectionné a le sien", r.nomMonstre === "Gnoll", r.nomMonstre);
}

console.log("\n3b. LE CONTRE AU CIBLAGE : SUR SOI SEULEMENT");
{
  const r = await p.evaluate(async () => {
    const act = (id, count) => ({ baseEffetId: id, count, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} });
    window.COMPETENCES_CACHE = {
      CONTRE: { Nom: "Garde", Arme: "Arme lourde CAC", Fatigue: 10, Initiative: 50, Composants: { actions: [act("EFF_CONTRE", 1)] } },
      SOIN_CONTRE: { Nom: "Soin gardé", Arme: "Magie", Fatigue: 10, Initiative: 50, Composants: { actions: [act("EFF_SOIN", 2), act("EFF_CONTRE", 1)] } }
    };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    window.__messages = [];
    const ex = await window.demarrerCiblage("CONTRE", { extraire: true, idLanceur: "H1" });
    const out = { soiSeulement: !!((ex && ex.alterations) || []).find(a => a.nom === "Contre" && a.soiSeulement) };
    await window.demarrerCiblage("CONTRE", { idLanceur: "H1" });
    out.anneaux = [...document.querySelectorAll(".anneau-ciblage")].map(a => (a.closest("[id^='token-']") || {}).id);
    window.ajouterCibleCiblage("H2");
    out.allie = window.__messages.slice(-1)[0];
    out.uniqueApresAllie = window.ETAT_CIBLAGE.cibleUnique;
    window.ajouterCibleCiblage("H1");
    out.uniqueSoi = window.ETAT_CIBLAGE.cibleUnique;
    window.nettoyerCiblage();
    // Soin + Contre : on soigne Bryn, le Contre part sur Aldric.
    await window.demarrerCiblage("SOIN_CONTRE", { idLanceur: "H1" });
    out.soutienDiffere = window.ETAT_CIBLAGE.soutienDiffere;
    window.ajouterCibleCiblage("H2");
    const vrai = window.regimeDemande;
    window.regimeDemande = { actif: () => true, carte: async (id, charge) => { window.__envoi = charge; }, enVol: () => false };
    await window.declencherResolution();
    window.regimeDemande = vrai;
    const envoi = window.__envoi || {};
    out.soin = ((envoi.attaques || []).find(a => a.isHeal) || {}).cibles;
    out.contre = ((envoi.alterations || []).find(a => a.nom === "Contre") || {}).cibles;
    if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) window.nettoyerCiblage();
    return out;
  });
  verifier("la carte lue : le Contre est marqué « sur soi seulement »", r.soiSeulement === true);
  verifier("une carte de Contre seul : un seul anneau, sur le lanceur", JSON.stringify(r.anneaux) === '["token-H1"]', JSON.stringify(r.anneaux));
  verifier("toucher un allié : refusé (« Sur soi seulement »)", r.allie === "Sur soi seulement" && r.uniqueApresAllie !== "H2", JSON.stringify(r));
  verifier("se toucher soi-même : la cible", r.uniqueSoi === "H1");
  verifier("Soin + Contre : pas de seconde phase pour le Contre", r.soutienDiffere === false, String(r.soutienDiffere));
  verifier("…le soin part sur Bryn, le Contre sur Aldric", JSON.stringify(r.soin) === '["H2"]' && JSON.stringify(r.contre) === '["H1"]',
           JSON.stringify({ soin: r.soin, contre: r.contre }));
}

console.log("\n4b. LE TABLEAU DES MONSTRES : LA TRICHE EN %");
{
  const r = await p.evaluate(async () => {
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    window.__ou(() => window.dessinerReglagesMonstres(), null);
    const lignes = [...document.querySelectorAll("#tbody-reglages-monstres tr")];
    const titre = lignes[0] ? lignes[0].querySelector("td").textContent : "";
    const valeurs = lignes[0] ? [...lignes[0].querySelectorAll("input")].map(i => i.value).join("/") : "";
    window.__ecrits = [];
    const champ = lignes[0] && lignes[0].querySelectorAll("input")[1];
    if (champ) { champ.value = "25"; champ.dispatchEvent(new Event("change")); }
    await new Promise(res => setTimeout(res, 50));
    const ecrit = (window.__ecrits || []).filter(x => x.chemin === "Monstres_Modeles/_REGLAGES").map(x => JSON.stringify(x.data));
    const MP = await import('./moteur_pur.js');
    const normal = MP.bonusMonstreDe({ estMonstre: true, palier: "Normal" });
    // L'ancien champ (des POINTS : +1, +2…) n'est pas relu comme des pour cent.
    window.__ou(() => window.appliquerReglagesMonstres({ Bonus_Degats: { Petit: 0, Normal: 1, "Élite": 2, Boss: 3 } }), null);
    const ancien = MP.bonusMonstreDe({ estMonstre: true, palier: "Boss" });
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    return { titre, valeurs, ecrit, normal, ancien };
  });
  // (v262 : plus de colonne Élite.)
  verifier("la ligne dit « Dégâts et soins en plus (%) », 10 partout", /\(%\)/.test(r.titre) && r.valeurs === "10/10/10", `${r.titre} ${r.valeurs}`);
  verifier("Normale à 25 % : le moteur le sait, la base l'écrit (Bonus_Degats_Pct)", r.normal === 25
           && r.ecrit.some(x => /"Bonus_Degats_Pct":\{[^}]*"Normal":25/.test(x)), JSON.stringify(r.ecrit));
  verifier("l'ancien réglage en points (Bonus_Degats) n'est pas relu en %", r.ancien === 10, `${r.ancien}`);
}

await fin();
