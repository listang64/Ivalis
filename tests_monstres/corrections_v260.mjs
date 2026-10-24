// LES CORRECTIONS DE LA v260 : DISTORSION, ÉTALEMENT, ZOMBIES, POOLS DES
// CRÉATURES, COULEURS DES CHIFFRES, RÉSISTANCES, ENGAGEMENT.
//
//   « Les distorsions mentales = dégâts bruts qui ne prennent pas en compte
//     l'esquive et la parade de la cible (enlève le choix lié à confusion /
//     peur / immobilisation). Étalement des dégâts et soins : pas de critique
//     possible. Les zombies du Profanateur ont 3 tours de vie, mais se font à
//     deux cases de distance dès le niveau 1. Les soutiens : 1 bouclier / contre
//     / absorption, 1 attaque de DPS faible, de bons soins combinés, des états.
//     Les DPS magiques : 60 % intelligence, 20 % distorsion et charisme, 20 % un
//     mélange. Combattant, tank et tireur : dégâts physiques seulement. Les
//     chiffres : rouge physique, bleu magique, blanc distorsion, vert clair
//     soins — dissociés par catégorie. Les immunités deviennent des résistances
//     de 25 %, partout ; celles des monstres sur tous les états. Ajoute un
//     effet Engagé : −15 % aux tirs lointains, −30 % au contact SEULEMENT si
//     engagé ; un agresseur étourdi ou confus n'engage plus. »
//   Et (réponses de Nico) : les peuples aussi ; résister au Brûlé, c'est −25 %
//   de chance ET −15 % des sorts de feu ; une attaque esquivée engage.
//
// Le banc se charge même sur l'ancien code (imports dynamiques, tout est
// gardé) : il y échoue au compte, il n'y plante pas.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, defaut) => { try { return f(); } catch (e) { return defaut === undefined ? { erreur: e.message } : defaut; } };
const RACINE = '/home/user/Ivalis';
const lire = (f) => fs.readFileSync(`${RACINE}/${f}`, 'utf-8');

const CE = await import('../combat_etat.js');
const MP = await import('../moteur_pur.js');
const CC = await import('../cerveau_combat.js');
const PC = await import('../pont_combat.js');

const w = {};
new Function('window', lire('experience.js'))(w);
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
// A (un héros) au centre, M1 au contact, M2 à quatre cases.
const monde = (extraA = {}, extraM1 = {}, extraM2 = {}) => {
    const e = CE.construireEtatCombat({ idPartie: "P", cerveau: "A", graine: 7,
        combattants: [fiche("A", extraA), fiche("M1", extraM1), fiche("M2", extraM2)],
        positions: { A: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 4, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["A", "M1", "M2"];
    e.phase = "Resolution";
    return e;
};
// Des dés qui comptent ce qu'on leur tire.
const desComptes = (valeur = 50) => { const d = { tires: 0, d100() { d.tires++; return typeof valeur === "function" ? valeur(d.tires) : valeur; } }; return d; };
const carte = (lanceur, attaques, alterations = [], extra = {}) => ({ type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
    attaques, alterations, ...extra });
const jetsSimples = (ids, extra = {}) => ({ attaqueRatee: false, parCible: Object.fromEntries(ids.map(id => [id, { esquive: false, etats: {}, ...extra }])) });
const montants = (r) => (r.etapes || []).filter(x => x.type === "degats").map(x => x.montant);

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v260");
console.log("=========================================================");

// ---------------------------------------------------------------------------
console.log("\n1. LA DISTORSION MENTALE : BRUTE, NI ESQUIVE NI PARADE");
{
    const distorsion = { nom: "Distorsion mentale", valeurBrute: 10, typeRes: "Magique", brut: true, distorsion: true,
                         isRanged: true, rangeMax: 5, cibles: ["M1"] };
    const e = monde({}, { Esquive: 100, Parade: 100, Def_Magique: 50 });
    const des = desComptes(1);
    const action = carte("A", [distorsion]);
    const jets = essai(() => MP.tirerDesCarte(e, action, "A", false, des), { parCible: {} });
    verifier("aucun jet de défense pour sa cible (esquive 100 %)", des.tires === 0 && jets.parCible && jets.parCible.M1 && jets.parCible.M1.esquive === false,
             `${des.tires} dé(s), ${JSON.stringify(jets.parCible)}`);
    const r = essai(() => MP.resoudreCarte(e, { ...action, jets }), { etapes: [] });
    const d = (r.etapes || []).find(x => x.type === "degats");
    verifier("elle touche pour 10, brute : la défense magique de 50 % n'y fait rien", !!d && d.montant === 10, JSON.stringify(d));
    verifier("sa nature : « mental » (le chiffre blanc)", !!d && d.nature === "mental", d && d.nature);
    // Avec une attaque physique sur la même cible : l'esquive arrête le coup, pas la Distorsion.
    const mixte = carte("A", [{ nom: "Attaque légère", valeurBrute: 8, typeRes: "Physique", cibles: ["M1"] }, distorsion]);
    const jetsM = essai(() => MP.tirerDesCarte(e, mixte, "A", false, desComptes(1)), { parCible: {} });
    const rm = essai(() => MP.resoudreCarte(e, { ...mixte, jets: jetsM }), { etapes: [] });
    verifier("avec un coup physique esquivé : l'esquive est dite, la Distorsion frappe",
             (rm.etapes || []).some(x => x.type === "esquive") && montants(rm).includes(10), JSON.stringify(montants(rm)));
    // Le Bouclier anti-magie ne la renvoie pas : ce n'est pas un coup magique.
    const ea = monde({}, { Etats_Alteres: [{ nom: "Bouclier anti-magie", duree: 2 }] });
    ea.combattants.M1.etats = [{ nom: "Bouclier anti-magie", duree: 2 }];
    const ra = essai(() => MP.resoudreCarte(ea, { ...carte("A", [distorsion]), jets: jetsSimples(["M1"]) }), { etapes: [] });
    verifier("le Bouclier anti-magie ne la renvoie pas", !(ra.etapes || []).some(x => x.texte === "🔮 Renvoyé !")
             && ((ra.etapes || []).find(x => x.type === "degats") || {}).cible === "M1");
    // L'extraction la marque ; l'état du charisme a disparu de partout.
    const me = lire('moteur_effets.js'), co = lire('competences.js'), li = lire('lia_forge.js'), mc = lire('monstres_competences.js'), ap = lire('app.js');
    verifier("l'extraction marque la Distorsion : distorsion + brut", /estDistorsionNom\(effBase\.Nom\) && !isHeal \? \{ distorsion: true, brut: true \}/.test(me));
    verifier("l'extraction n'offre plus d'état du charisme (lienAct = l'élément seul)", /const lienAct = elementAct;/.test(me) && !/etatMentalAct/.test(me));
    verifier("la Forge ne demande plus d'état à la pose de la Distorsion", !/ouvrirChoixEtatMental/.test(co) && !/etatMentalDeLAction/.test(co));
    verifier("LIA n'écrit plus d'etat_mental", !/etat_mental/.test(li) && !/etatMentalPourLIA/.test(li));
    verifier("les créatures non plus", !/act\.etatMental =/.test(mc));
    verifier("app.js : plus de table des états du charisme de la Distorsion", !/window\.ETATS_DISTORSION\s*=/.test(ap));
    verifier("le grimoire le dit : « ni armure, ni esquive, ni parade »", /1 dégât brut mental : ni armure, ni esquive, ni parade/.test(ap));
}

// ---------------------------------------------------------------------------
console.log("\n2. L'ÉTALEMENT NE CRITIQUE PAS");
{
    const etale = { nom: "Coup", valeurBrute: 20, typeRes: "Physique", estEtalement: true, toursEtalement: 2 };
    const c1 = essai(() => MP.chaineDeDegats({ etats: [], def: {} }, etale, { critique: true }), {});
    verifier("chaîne : un coup étalé critique n'est pas doublé (10 + 10)", Array.isArray(c1.tics) && c1.tics.join("+") === "10+10", JSON.stringify(c1.tics));
    const e = monde();
    const r = essai(() => MP.resoudreCarte(e, { ...carte("A", [{ ...etale, cibles: ["M1"] }], [], { critique: true }), jets: jetsSimples(["M1"]) }), { etapes: [], etat: e });
    const c = (r.etapes || []).find(x => x.type === "carte") || {};
    const et = ((r.etat.combattants.M1 || {}).etats || []).find(x => x.nom === "Étalement") || {};
    verifier("une carte qui n'étale que : pas de critique annoncé", c.critique === false, String(c.critique));
    verifier("ses parts : 10 et 10, sans marque de critique", (et.tics || []).join("+") === "10+10" && !et.critique, JSON.stringify(et));
    const soin = { nom: "Soin", valeurBrute: 20, typeRes: "Magique", isHeal: true, estEtalement: true, toursEtalement: 2, cibles: ["A"] };
    const eS = monde({ PV_Actuels: 40 });
    const rs = essai(() => MP.resoudreCarte(eS, { ...carte("A", [soin], [], { critique: true }), jets: jetsSimples(["A"]) }), { etat: eS });
    const se = ((rs.etat.combattants.A || {}).etats || []).find(x => x.nom === "Soin étalé") || {};
    verifier("un soin étalé « critique » : 10 + 10, non doublé", (se.tics || []).join("+") === "10+10" && !se.critique, JSON.stringify(se));
    // Une carte qui frappe aussi d'un coup garde son critique — mais seulement là.
    const rm = essai(() => MP.resoudreCarte(monde(), { ...carte("A", [{ ...etale, cibles: ["M1"] },
        { nom: "Attaque lourde", valeurBrute: 5, typeRes: "Physique", cibles: ["M2"] }], [], { critique: true }),
        jets: jetsSimples(["M1", "M2"]) }), { etapes: [], etat: monde() });
    const directe = (rm.etapes || []).find(x => x.type === "degats" && x.cible === "M2") || {};
    const parts = (((rm.etat.combattants || {}).M1 || {}).etats || []).find(x => x.nom === "Étalement") || {};
    verifier("carte mixte : le coup direct est doublé (10), l'étalé non (10 + 10)", directe.montant === 10 && (parts.tics || []).join("+") === "10+10",
             `${directe.montant} / ${JSON.stringify(parts.tics)}`);
    verifier("le cerveau ne tire pas de critique pour une carte qui n'étale que",
             /tirerCritique\(etat, intention\.acteur, des\)\s*&& !carteToutEtalee/.test(lire('cerveau_combat.js')));
}

// ---------------------------------------------------------------------------
console.log("\n3. LES ZOMBIES : TROIS TOURS, DEUX CASES DÈS LE NIVEAU 1");
{
    verifier("ZOMBIE.tours vaut 3", CE.ZOMBIE && CE.ZOMBIE.tours === 3, String(CE.ZOMBIE && CE.ZOMBIE.tours));
    const atouts = essai(() => w.atoutRace({ classe: "Profanateur", xp: 0 }), {});
    verifier("le Profanateur de niveau 1 relève jusqu'à 2 cases", atouts.zombies === true && atouts.rayonZombies === 2, JSON.stringify(atouts.rayonZombies));
    const at10 = essai(() => w.atoutRace({ classe: "Profanateur", xp: 999999 }), {});
    verifier("…et toujours 2 au niveau 10 (pas 4 : le palier ne s'additionne plus)", at10.rayonZombies === 2, JSON.stringify(at10.rayonZombies));
    // Un ennemi tombe à deux cases du Profanateur de niveau 1, d'une autre main.
    const e = CE.construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 7,
        combattants: [fiche("P", { classe: "Profanateur", xp: 0 }), fiche("H"), fiche("M1", { PV_Actuels: 5 })],
        positions: { P: { q: 0, r: 0 }, H: { q: 3, r: 0 }, M1: { q: 2, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
    const r = essai(() => MP.resoudreCarte(e, { ...carte("H", [{ nom: "Coup", valeurBrute: 10, typeRes: "Physique", cibles: ["M1"] }]),
                                                jets: jetsSimples(["M1"]) }), { etapes: [] });
    const z = (r.etapes || []).find(x => x.type === "zombie");
    verifier("tombé à deux cases d'un Profanateur de niveau 1 : il se relève, 3 tours", !!z && z.tours === 3, JSON.stringify(z));
    verifier("la fiche de classe le dit (3 tours, 2 cases au niveau 1)",
             /que 3 tours, puis retombe/.test(lire('classes.js')) && /zombies: true, glacePhysique: true, rayonZombies: 2/.test(lire('app.js')));
}

// ---------------------------------------------------------------------------
console.log("\n4. LES POOLS DES CRÉATURES");
{
    process.chdir('/home/user/Ivalis/tests_monstres');
    const banc = await import('./banc_reel.mjs');
    const fen = banc.chargerGenerateur();
    const nomDe = (id) => ((banc.EFFETS || {})[id] || {}).Nom || id;
    const nomsCarte = (d) => d.Composants.actions.flatMap(a => [nomDe(a.baseEffetId), ...Object.keys(a.mods || {}).map(nomDe)]).map(n => n.toLowerCase());
    const genere = async (archetype, palier) => {
        try { return await fen.genererCompetencesMonstre({ nom: "Créature", archetype, palier }); } catch (e) { return []; }
    };
    // La voie des mages : 60 / 20 / 20.
    const voies = { intelligence: 0, charisme: 0, mixte: 0 };
    let x = 7; const alea = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    for (let i = 0; i < 4000; i++) { const v = essai(() => fen.tirerVoieMonstre("DPS MAGE DISTANCE", alea), {}); if (voies[v.magie] !== undefined) voies[v.magie]++; }
    const pct = (n) => Math.round(n / 40);
    verifier("les mages : 60 % intelligence, 20 % charisme, 20 % mixte", Math.abs(pct(voies.intelligence) - 60) <= 3
             && Math.abs(pct(voies.charisme) - 20) <= 3 && Math.abs(pct(voies.mixte) - 20) <= 3, JSON.stringify(voies));
    verifier("combattant, tank, tireur : une voie physique", ["DPS CAC", "TANK CAC", "DPS DISTANCE"].every(a => essai(() => fen.tirerVoieMonstre(a).physique, false)));
    let physiquesMagiques = 0, physiques = 0;
    for (const a of ["DPS CAC", "TANK CAC", "DPS DISTANCE"]) for (const p of ["Normal", "Élite", "Boss"]) for (let k = 0; k < 4; k++) {
        const docs = await genere(a, p);
        physiques += docs.length;
        physiquesMagiques += docs.filter(d => nomsCarte(d).some(n => n.includes("attaque magique") || /distorsion|pouvoir/.test(n) || /brûl|glac|électri/.test(n))).length;
    }
    verifier("leurs cartes : ni Attaque Magique, ni Distorsion, ni état magique", physiques > 0 && physiquesMagiques === 0, `${physiquesMagiques}/${physiques}`);
    let fautesVoie = 0, mages = 0, mixtesComplets = 0, mixtes = 0;
    for (const a of ["DPS MAGE CAC", "DPS MAGE DISTANCE"]) for (const p of ["Normal", "Élite", "Boss"]) for (let k = 0; k < 6; k++) {
        const docs = await genere(a, p);
        mages++;
        const mag = docs.some(d => nomsCarte(d).some(n => n.includes("attaque magique")));
        const dis = docs.some(d => nomsCarte(d).some(n => /distorsion|pouvoir/.test(n)));
        if (docs.voieMagique === "intelligence" && dis) fautesVoie++;
        if (docs.voieMagique === "charisme" && mag) fautesVoie++;
        if (docs.voieMagique === "mixte") { mixtes++; if (mag && dis) mixtesComplets++; }
        if (!docs.voieMagique) fautesVoie++;
    }
    verifier("un mage d'intelligence n'a pas de Distorsion, un du charisme pas d'Attaque Magique", mages > 0 && fautesVoie === 0, `${fautesVoie} faute(s) sur ${mages}`);
    verifier("un mage mixte a les deux", mixtes === 0 || mixtesComplets === mixtes, `${mixtesComplets}/${mixtes}`);
    let soutiens = 0, unSeulRempart = 0, petiteAttaque = 0, deuxSoins = 0, soinZone = 0;
    for (const p of ["Petit", "Normal", "Élite", "Boss"]) for (let k = 0; k < 5; k++) {
        const docs = await genere("SOUTIEN", p);
        if (docs.length !== 6) continue;
        soutiens++;
        const bases = docs.map(d => nomDe(d.Composants.actions[0].baseEffetId).toLowerCase());
        if (bases.filter(b => /bouclier|contre|absorption/.test(b)).length === 1) unSeulRempart++;
        if (/attaque|distorsion|pouvoir/.test(bases[0]) && docs[0].Fatigue <= Math.min(...docs.map(d => d.Fatigue))) petiteAttaque++;
        if (bases.filter(b => /^soin/.test(b)).length >= 2) deuxSoins++;
        if (docs.some((d, i) => /^soin/.test(bases[i]) && d.Composants.actions.some(a => (a.zoneHexes || []).length > 0))) soinZone++;
    }
    verifier("un soutien : UNE protection (bouclier, contre ou absorption)", soutiens > 0 && unSeulRempart === soutiens, `${unSeulRempart}/${soutiens}`);
    verifier("…une petite attaque, la moins chère de son jeu", petiteAttaque === soutiens, `${petiteAttaque}/${soutiens}`);
    verifier("…au moins deux vrais soins, dont un de zone", deuxSoins === soutiens && soinZone >= soutiens - 1, `${deuxSoins} / ${soinZone} sur ${soutiens}`);
    verifier("la voie du mage est écrite sur la créature (Voie_Magique)", /Voie_Magique: documents\.voieMagique/.test(lire('monstres_competences.js')));
}

// ---------------------------------------------------------------------------
console.log("\n5. LA COULEUR DES CHIFFRES");
{
    const e = monde();
    const sc = (etape) => essai(() => PC.misEnScene(etape, e), {});
    const coul = (nature) => (sc({ type: "degats", cible: "M1", acteur: "A", montant: 5, pvApres: 95, ...(nature ? { nature } : {}) }) || {}).couleurTexte;
    verifier("physique : rouge", coul("physique") === "#ff4c4c", coul("physique"));
    verifier("magique : bleu (bleu ciel depuis la v263)", coul("magique") === "#7fd0ff", coul("magique"));
    verifier("Distorsion mentale : blanc (violet clair depuis la v263)", coul("mental") === "#c9a2ff", coul("mental"));
    const soin = sc({ type: "soin", cible: "A", acteur: "A", montant: 5, pvApres: 100 });
    verifier("soin : vert clair (la barre garde son vert)", soin.couleurTexte === "#8cf08c" && soin.couleurBarre === "#1b6e3a", `${soin.couleurTexte} / ${soin.couleurBarre}`);
    const brulure = sc({ type: "degats", cible: "M1", montant: 3, pvApres: 97, tic: "Brûlure" });
    verifier("la brûlure de fin de manche : bleu (dégâts magiques)", brulure.couleurTexte === "#7fd0ff", brulure.couleurTexte);
    // Une carte de deux natures : deux chiffres, chacun sa couleur.
    const r = essai(() => MP.resoudreCarte(monde(), { ...carte("A", [
        { nom: "Attaque lourde", valeurBrute: 6, typeRes: "Physique", cibles: ["M1"] },
        { nom: "Attaque Magique", valeurBrute: 4, typeRes: "Magique", cibles: ["M1"] },
        { nom: "Distorsion mentale", valeurBrute: 3, typeRes: "Magique", brut: true, distorsion: true, cibles: ["M1"] }]),
        jets: jetsSimples(["M1"]) }), { etapes: [] });
    const natures = (r.etapes || []).filter(x => x.type === "degats").map(x => x.nature);
    verifier("une carte physique + magique + mentale : trois chiffres dissociés", natures.join(",") === "physique,magique,mental", natures.join(","));
    const etale = essai(() => MP.resoudreCarte(monde(), { ...carte("A", [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: "Magique", estEtalement: true,
        toursEtalement: 2, cibles: ["M1"] }]), jets: jetsSimples(["M1"]) }), { etat: monde() });
    const tic = essai(() => PC.misEnScene({ type: "degats", cible: "M1", montant: 5, pvApres: 95, tic: "Étalement" }, etale.etat), {});
    verifier("un étalement magique garde son bleu à chaque part", tic.couleurTexte === "#7fd0ff", tic.couleurTexte);
}

// ---------------------------------------------------------------------------
console.log("\n6. LES RÉSISTANCES REMPLACENT LES IMMUNITÉS");
{
    const races = { Ankylar: "Étourdi", Ondari: "Brûlé", "Ethéré": "Empoisonnement" };
    Object.entries(races).forEach(([race, nom]) => {
        const a = essai(() => w.atoutRace({ race }), {});
        verifier(`${race} : résiste à ${nom}, plus d'immunité`, (a.resistances || []).includes(nom) && !(a.immunites || []).length, JSON.stringify(a.resistances));
    });
    const vamp = essai(() => w.atoutRace({ classe: "Vampire", xp: 0 }), {});
    verifier("Vampire : résiste au Glacé", (vamp.resistances || []).includes("Glacé") && !(vamp.immunites || []).length, JSON.stringify(vamp.resistances));
    const e = monde({ race: "Ondari" });
    verifier("le combattant porte ses résistances (atouts.resistances)", JSON.stringify(e.combattants.A.atouts.resistances) === '["Brûlé"]',
             JSON.stringify(e.combattants.A.atouts.resistances));
    const ch = essai(() => MP.chanceEtatDe(e.combattants.M1, { nom: "Brûlé", chance: 50 }, e.combattants.A), -1);
    verifier("un sort à 50 % de brûler un Ondari : 25 %", ch === 25, String(ch));
    const ch2 = essai(() => MP.chanceEtatDe(e.combattants.M1, { nom: "Brûlé", chance: 10 }, e.combattants.A), -1);
    verifier("…à 10 % : 0 %, jamais négatif", ch2 === 0, String(ch2));
    const feu = essai(() => MP.chaineDeDegats(e.combattants.A, { valeurBrute: 20, typeRes: "Magique", etatElement: "Brûlé" }, {}).degats, -1);
    verifier("un sort de feu de 20 sur un Ondari : 17 (−15 %)", feu === 17, String(feu));
    // Un critique impose l'état… sauf à qui y résiste : un dé, à 75 %.
    const alt = { nom: "Brûlé", chance: 30, duree: 2, cibles: ["A"] };
    const des80 = desComptes(80), des70 = desComptes(70);
    const j80 = essai(() => MP.tirerDesCarte(e, carte("M1", [], [alt]), "M1", true, des80), { parCible: { A: { etats: {} } } });
    const j70 = essai(() => MP.tirerDesCarte(e, carte("M1", [], [alt]), "M1", true, des70), { parCible: { A: { etats: {} } } });
    verifier("critique sur un résistant : 80 au dé → raté, 70 → pris", (j80.parCible.A || {}).etats && j80.parCible.A.etats["Brûlé"] === false
             && j70.parCible.A.etats["Brûlé"] === true, `${JSON.stringify(j80.parCible.A)} / ${JSON.stringify(j70.parCible.A)}`);
    const eH = monde();
    const jH = essai(() => MP.tirerDesCarte(eH, carte("M1", [], [alt]), "M1", true, desComptes(99)), { parCible: { A: { etats: {} } } });
    verifier("critique sur qui ne résiste pas : imposé, sans dé", (jH.parCible.A || { etats: {} }).etats["Brûlé"] === true);
    // L'alteration posée : plus d'étape « immunisé ».
    const r = essai(() => MP.resoudreCarte(e, { ...carte("M1", [], [alt]), jets: { parCible: { A: { esquive: false, etats: { "Brûlé": true } } } } }), { etat: e, etapes: [] });
    verifier("un Ondari peut maintenant brûler", ((r.etat.combattants.A || {}).etats || []).some(x => x.nom === "Brûlé"));
    // Les techniques « à coup sûr » : Tir précis sur qui résiste à l'Immobilisation.
    const eT = monde({ classe: "Pisteur", xp: 999999 }, {});
    eT.combattants.M1.atouts.resistances = ["Immobilisation"];
    const tir = (pris) => essai(() => MP.resoudreTechniqueClasse(eT, { idLanceur: "A", idCarte: "CLASSE_TIR_PRECIS", cible: "M1",
        ...(pris === undefined ? {} : { prisMalgreResistance: { M1: pris } }) }), { etat: eT, etapes: [] });
    const immob = (r2) => ((r2.etat.combattants.M1 || {}).etats || []).some(x => x.nom === "Immobilisation");
    verifier("Tir précis sur un résistant : le dé du cerveau décide (75 %)", !immob(tir(false)) && immob(tir(true))
             && (tir(false).etapes || []).some(x => x.type === "etatRate" && x.resiste));
    verifier("le cerveau tire ce dé (jetsSurs, prisMalgreResistance)", /prisMalgreResistance: jetsSurs/.test(lire('cerveau_combat.js')));
    // Une zone : 25 points de moins.
    const eZ = monde({ race: "Ondari" });
    eZ.zones = { z1: { id: "z1", hexes: [{ q: 0, r: 0 }], type: "feu", etat: { nom: "Brûlé", chance: 40, duree: 2 } } };
    const zone = (jet) => essai(() => { const c = CE.clonerEtat(eZ); MP.traverserZones(c, "A", { q: 0, r: 0 }, desComptes((n) => n === 1 ? 100 : jet)); return c; }, eZ);
    verifier("une zone à 40 % sur un Ondari : 30 au dé → raté, 10 → pris",
             !(zone(30).combattants.A.etats || []).some(x => x.nom === "Brûlé") && (zone(10).combattants.A.etats || []).some(x => x.nom === "Brûlé"));
    // Les créatures : sur tous les états.
    const tirees = new Set();
    for (let i = 0; i < 300; i++) essai(() => w.tirerResistancesEtats("Boss"), []).forEach(n => tirees.add(n));
    verifier("une créature peut résister à tous les états (Provocation, Saignement, Étourdi…)",
             ["Provocation", "Saignement", "Empoisonnement", "Étourdi", "Glacé", "Aveuglé"].every(n => tirees.has(n)), [...tirees].join(", "));
    verifier("Normal 1, Élite 2, Boss 3 résistances", essai(() => [w.tirerResistancesEtats("Normal").length, w.tirerResistancesEtats("Élite").length,
             w.tirerResistancesEtats("Boss").length].join("/"), "") === "1/2/3");
    const cr = essai(() => w.atoutCreature({ estMonstre: true, resistancesEtats: ["Provocation"] }), {});
    verifier("atoutCreature rend des résistances, plus des immunités", JSON.stringify(cr) === '{"resistances":["Provocation"]}', JSON.stringify(cr));
    // v263 : le tirage passe par une variable (son nombre suit le niveau du groupe).
    verifier("monstres.js écrit Resistances_Etats (et relit l'ancien champ)", /Resistances_Etats: /.test(lire('monstres.js'))
             && /= typeof window\.tirerResistancesEtats === "function"/.test(lire('monstres.js'))
             && /brut\.Resistances_Elementaires/.test(lire('monstres.js')));
    // Une fiche d'avant (immunites) vaut résistance.
    const vieux = essai(() => CE.combattantDepuisFiche(fiche("V"), { q: 0, r: 0 }, { ...REGLES, atouts: () => ({ immunites: ["Glacé"] }) }), { atouts: {} });
    verifier("un atout d'avant (immunites) devient une résistance", JSON.stringify(vieux.atouts.resistances) === '["Glacé"]', JSON.stringify(vieux.atouts.resistances));
}

// ---------------------------------------------------------------------------
console.log("\n7. L'ENGAGEMENT");
{
    const coup = (lanceur, cible, extra = {}, esquive = false) => ({ ...carte(lanceur, [{ nom: "Coup", valeurBrute: 20, typeRes: "Physique", cibles: [cible], ...extra }]),
        jets: { attaqueRatee: false, parCible: { [cible]: { esquive, etats: {} } } } });
    const r1 = essai(() => MP.resoudreCarte(monde(), coup("M1", "A", {}, true)), { etat: monde(), etapes: [] });
    const eng = ((r1.etat.combattants.A || {}).etats || []).find(x => x.nom === "Engagé");
    verifier("attaqué au contact, même esquivé : Engagé, par M1, une manche", !!eng && JSON.stringify(eng.par) === '["M1"]' && eng.duree === 1, JSON.stringify(eng));
    verifier("le journal le dit (une étape « etats »)", (r1.etapes || []).some(x => x.type === "etats" && x.cible === "A" && x.pose === "Engagé"));
    const rTir = essai(() => MP.resoudreCarte(monde(), coup("M1", "A", { isRanged: true, rangeMax: 5 })), { etat: monde() });
    verifier("un tir au contact n'engage pas", !((rTir.etat.combattants.A || {}).etats || []).some(x => x.nom === "Engagé"));
    const eE = r1.etat;
    verifier("A est engagé (estEngage)", essai(() => MP.estEngage(eE, eE.combattants.A), false) === true);
    verifier("engagé, un tir sur une cible éloignée : −15 % (20 → 17)", JSON.stringify(montants(essai(() => MP.resoudreCarte(eE, coup("A", "M2", { isRanged: true, rangeMax: 6 })), {}))) === "[17]");
    verifier("engagé, un tir au contact : −30 % (20 → 14)", JSON.stringify(montants(essai(() => MP.resoudreCarte(eE, coup("A", "M1", { isRanged: true, rangeMax: 6 })), {}))) === "[14]");
    verifier("NON engagé, un tir au contact : plein (20)", JSON.stringify(montants(essai(() => MP.resoudreCarte(monde(), coup("A", "M1", { isRanged: true, rangeMax: 6 })), {}))) === "[20]");
    verifier("engagé, un coup au contact (pas un tir) : plein (20)", JSON.stringify(montants(essai(() => MP.resoudreCarte(eE, coup("A", "M1")), {}))) === "[20]");
    const eSorc = CE.clonerEtat(eE); eSorc.combattants.A.atouts.sortsSansMalusContact = true;
    verifier("le Sorcier engagé ne perd rien, ni de loin ni au contact", JSON.stringify(montants(essai(() => MP.resoudreCarte(eSorc, coup("A", "M2", { isRanged: true, rangeMax: 6 })), {}))) === "[20]"
             && JSON.stringify(montants(essai(() => MP.resoudreCarte(eSorc, coup("A", "M1", { isRanged: true, rangeMax: 6 })), {}))) === "[20]");
    ["Étourdi", "Confusion"].forEach(nom => {
        const c = CE.clonerEtat(eE); c.combattants.M1.etats = [{ nom, duree: 2 }];
        verifier(`l'agresseur ${nom === "Étourdi" ? "étourdi" : "confus"} : plus engagé (tant qu'il l'est)`, essai(() => MP.estEngage(c, c.combattants.A), true) === false
                 && JSON.stringify(montants(essai(() => MP.resoudreCarte(c, coup("A", "M2", { isRanged: true, rangeMax: 6 })), {}))) === "[20]");
    });
    const ko = CE.clonerEtat(eE); ko.combattants.M1.aTerre = true;
    verifier("l'agresseur à terre : plus engagé", essai(() => MP.estEngage(ko, ko.combattants.A), true) === false);
    const fin = CE.clonerEtat(eE); essai(() => CC.vieillirLesEtats(fin));
    verifier("en fin de manche, l'engagement tombe", !(fin.combattants.A.etats || []).some(x => x.nom === "Engagé"));
    const deux = essai(() => MP.resoudreCarte(eE, coup("M2", "A")), { etat: eE });   // M2 est à 4 cases : pas au contact
    verifier("un coup qui ne vient pas du contact n'ajoute personne", JSON.stringify(((deux.etat.combattants.A.etats || []).find(x => x.nom === "Engagé") || {}).par) === '["M1"]');
    verifier("la purification ne l'enlève pas (pas une altération)", essai(() => MP.estEtatNefaste({ nom: "Engagé" }), true) === false);
    const co = lire('combat.js'), me = lire('moteur_effets.js'), st = lire('style.css');
    verifier("l'écran : les flèches du pion sélectionné vers qui l'engage", /window\.dessinerEngagements = function/.test(co)
             && /window\.engageursActifs = function/.test(co) && /try \{ window\.dessinerEngagements\(\); \}/.test(co));
    verifier("…courbes (Q), rouges, à demi transparentes, une pointe aux flancs creusés", /Q \$\{f\(c\.x\)\}/.test(co) && /rgba\(229,57,53,0\.62\)/.test(co)
             && /L \$\{-L\} \$\{-W\} Q/.test(co) && /\.fleches-engagement/.test(st));
    verifier("le ciblage dit « -15% » ou « -30% », seulement engagé", /lanceurEngage = typeof window\.estEngageCombat/.test(me)
             && /\(dist === 1 \? 30 : 15\)/.test(me) && /malusLabel\.innerText = `-\$\{malusTir\}% Dégâts`/.test(me));
}

// ---------------------------------------------------------------------------
console.log("\n8. LES VERSIONS");
{
    const html = lire('index.html');
    // Au moins 260 : les versions suivantes montent encore le numéro.
    const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+);/) || [])[1] || 0);
    const vJson = Number((lire('version.json').match(/"version": (\d+)/) || [])[1] || 0);
    verifier("version 260 ou plus (trace_combat.js, version.json)", vTrace >= 260 && vJson === vTrace, `${vTrace} / ${vJson}`);
    // Au moins ces numéros, la carte d'import et la balise d'accord.
    const v = (m) => (html.match(new RegExp(`${m}\\.js\\?v=(\\d+)`, "g")) || []).map(x => Number(x.split("=")[1]));
    const auMoins = (m, n) => v(m).length === 2 && v(m)[0] === v(m)[1] && v(m)[0] >= n;
    verifier("moteur_pur v65+, combat_etat v40+, cerveau v59+, pont v42+ (importmap et balises)",
             auMoins("moteur_pur", 65) && auMoins("combat_etat", 40) && auMoins("cerveau_combat", 59) && auMoins("pont_combat", 42),
             ["moteur_pur", "combat_etat", "cerveau_combat", "pont_combat"].map(m => `${m} ${v(m).join("/")}`).join(", "));
}

console.log(`\n${echecs === 0 ? "✅ TOUT EST BON" : `❌ ${echecs} ÉCHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
