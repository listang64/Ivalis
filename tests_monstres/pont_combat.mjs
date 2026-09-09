// LE PONT, MIS À L'ÉPREUVE — ÉTAPE 5b.
//
// Le spectateur sait quand animer, le pont sait quoi montrer. Ce banc vérifie
// la seconde moitié, et il existe pour trois raisons très concrètes.
//
// UN. Le nouveau régime ne doit RIEN recalculer à l'écran. `jouerAnimationMoteur`
// ne montre pas une attaque, elle la résout — dés d'esquive, dégâts, états,
// écritures en base. La rejouer telle quelle sur trois appareils, c'est le
// mécanisme des dégâts doublés remis en marche. On vérifie donc qu'aucune mise
// en scène ne demande de calcul : elle ne fait que lire l'étape et l'état.
//
// DEUX. Une jauge a besoin de deux bouts. L'étape ne porte que l'arrivée
// (`pvApres: 33`) — c'est ce qui rend le rejeu idempotent. Le départ se lit dans
// l'état d'AVANT, celui que le spectateur n'a pas encore fait avancer. Si le
// pont lisait l'état d'après, toutes les barres descendraient de zéro à zéro.
//
// TROIS. Un type d'étape oublié, c'est un moment de combat invisible. On prend
// donc la liste des types que le moteur sait produire, et on vérifie que le
// pont les connaît TOUS — pas ceux auxquels on a pensé, tous.
import {
    misEnScene, TYPES_MIS_EN_SCENE, creerPont, COULEURS, RYTHME,
    pionsDepuisEtat, fichesDepuisEtat, fileDepuisEtat, creerProjection
} from '../pont_combat.js';
import { construireEtatCombat, appliquerEtape, TYPES_ETAPES } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte } from '../moteur_pur.js';
import { resoudreMouvement } from '../mouvement_pur.js';
import { creerDes } from '../combat_etat.js';
import { jouerCreature, cloturerTour } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const monde = (extra = {}) => construireEtatCombat({
    idPartie: "G", cerveau: "P_03", graine: 4242,
    combattants: [
        fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Pliors" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 3, r: 0 } },
    partie: {
        Phase_Combat: "Resolution", Tour_Combat: 1,
        Ordre_Initiative: ["H1", "M1", "H2"],
        File_Attente_Combat: [
            { idPersonnage: "H1", idCarte: "C1" }, { idPersonnage: "M1", idCarte: "C2" },
            { idPersonnage: "H2", idCarte: "C3" }
        ]
    }, ...extra
});

// Un pont de banc : il note ce qu'on lui demande, sans rien afficher.
function pontDeBanc(options = {}) {
    const vus = [];
    const pont = creerPont({
        pas: async (d) => vus.push(`pas ${d.idToken} → ${d.vers.q},${d.vers.r}`),
        poussee: async (d) => vus.push(`poussee ${d.idToken} → ${d.vers.q},${d.vers.r}`),
        bond: async (d) => vus.push(`bond ${d.idToken}`),
        ruee: async (d) => vus.push(`ruee ${d.pion} → ${(d.cibles || []).join("+")}`),
        jauge: (pion, de, vers, max, texte) => vus.push(`jauge ${pion} ${de}→${vers}/${max} "${texte}"`),
        message: (pion, texte) => vus.push(`msg ${pion} "${texte}"`),
        opportunite: async (d) => vus.push(`opportunite ${d.idAttaquant}→${d.idCible}`),
        zone: async (s) => vus.push(`zone ${s.id}`),
        pause: options.pause || (async () => {}),
        tracer: options.tracer || (() => {})
    });
    return { pont, vus };
}

console.log("\n=========================================================");
console.log("  LE PONT — DE L'ÉTAPE À CE QU'ON VOIT");
console.log("=========================================================\n");

// =========================================================================
console.log("1. AUCUN TYPE D'ÉTAPE N'EST LAISSÉ SANS MISE EN SCÈNE");
// =========================================================================
//  Le noyau sait appliquer un certain nombre de types d'étapes. Chacun d'eux
//  change quelque chose à l'état, donc chacun d'eux doit se voir. Un type
//  oublié n'est pas une animation manquante : c'est un moment de combat qui
//  n'existe pas à l'écran, et un joueur qui ne comprend pas ce qui vient de se
//  passer.
{
    const oublies = TYPES_ETAPES.filter(t => !TYPES_MIS_EN_SCENE.includes(t));
    verifier("tous les types que le noyau applique sont mis en scène",
             oublies.length === 0, oublies.join(", "));

    // Et l'inverse : un type que le pont connaît mais que rien ne produit
    // serait du code mort. Ceux-là sont les étapes purement narratives —
    // esquive, échec, renoncement — que le moteur produit sans qu'elles
    // changent l'état. On les nomme, pour que la liste reste honnête.
    const narratives = ["esquive", "echec", "etatRate", "trajetEcourte", "renonce", "opportunite", "manche"];
    const inconnus = TYPES_MIS_EN_SCENE.filter(t => !TYPES_ETAPES.includes(t) && !narratives.includes(t));
    verifier("et le pont n'invente pas de types", inconnus.length === 0, inconnus.join(", "));

    verifier("une étape inconnue ne fait pas tomber le pont",
             misEnScene({ type: "quelque_chose_de_neuf" }).geste === "rien");
    verifier("mais elle se signale", misEnScene({ type: "neuf" }).inconnu === "neuf");
    verifier("et une étape absente non plus", misEnScene(null).geste === "rien");
}

// =========================================================================
console.log("\n2. UNE JAUGE A DEUX BOUTS, ET LE DÉPART VIENT DE L'ÉTAT D'AVANT");
// =========================================================================
//  Le point qui rend le rejeu juste. L'étape ne dit que « pvApres: 48 » ; sans
//  l'état d'avant, on ne saurait pas d'où la barre part, et elle ne bougerait
//  pas.
{
    const etat = monde();
    const scene = misEnScene(
        { type: "degats", cible: "H1", acteur: "M1", montant: 12, pvApres: 48 }, etat);

    verifier("la barre part des points de vie d'avant", scene.de === 60, `(de ${scene.de})`);
    verifier("et arrive à ceux que l'étape annonce", scene.vers === 48, `(vers ${scene.vers})`);
    verifier("le maximum vient de la fiche", scene.max === 60);
    verifier("le chiffre flottant dit ce qu'on encaisse", scene.texte === "-12", scene.texte);
    verifier("en rouge", scene.couleurTexte === COULEURS.degats);

    // Et le rejeu : la même étape appliquée à l'état d'APRÈS ne montre plus rien
    // bouger. C'est exactement ce qu'on veut — pas de second retrait.
    const apres = appliquerEtape(etat, { type: "degats", cible: "H1", pvApres: 48 });
    const rejeu = misEnScene({ type: "degats", cible: "H1", montant: 12, pvApres: 48 }, apres);
    verifier("rejouée, elle ne retire rien de plus",
             rejeu.de === 48 && rejeu.vers === 48, `(${rejeu.de}→${rejeu.vers})`);
}

// =========================================================================
console.log("\n3. UN COUP SUR LE BOUCLIER SE VOIT SUR LE BOUCLIER");
// =========================================================================
//  Sinon on lit un gros chiffre rouge devant une barre de vie qui ne bouge pas,
//  et on croit à un bug d'affichage. C'est arrivé, et c'était la bonne lecture
//  d'un mauvais affichage.
{
    const etat = monde();
    etat.combattants.H1.bouclier = 20;
    etat.combattants.H1.bouclierMax = 20;

    const surBouclier = misEnScene({ type: "degats", cible: "H1", montant: 9,
                                     surBouclier: 9, bouclierApres: 11, pvApres: 60 }, etat);
    verifier("le coup encaissé par le bouclier s'affiche dessus",
             surBouclier.champ === "bouclier", surBouclier.champ);
    verifier("la barre va de 20 à 11", surBouclier.de === 20 && surBouclier.vers === 11);
    verifier("et la couleur est celle du bouclier",
             surBouclier.couleurBarre === COULEURS.bouclier);

    const traverse = misEnScene({ type: "degats", cible: "H1", montant: 30,
                                  surBouclier: 20, bouclierApres: 0, pvApres: 50,
                                  bouclierBrise: true }, etat);
    verifier("un coup qui traverse s'affiche sur la vie", traverse.champ === "pv", traverse.champ);
    verifier("de 60 à 50", traverse.de === 60 && traverse.vers === 50);
    verifier("et le bris du bouclier est signalé", traverse.bouclierBrise === true);

    const gain = misEnScene({ type: "degats", cible: "H1", gainBouclier: 15,
                              bouclierApres: 20 }, etat);
    verifier("un gain de bouclier n'est pas une blessure",
             gain.champ === "bouclier" && gain.texte.startsWith("+"), gain.texte);
}

// =========================================================================
console.log("\n4. LE SOIN, LE DRAIN ET LE CRITIQUE ONT CHACUN LEUR LANGAGE");
// =========================================================================
{
    const etat = monde();
    etat.combattants.H1.pv = 30;

    const soin = misEnScene({ type: "soin", cible: "H1", montant: 12, pvApres: 42 }, etat);
    verifier("un soin monte, et en vert",
             soin.de === 30 && soin.vers === 42 && soin.couleurBarre === COULEURS.soin,
             `${soin.de}→${soin.vers}`);
    verifier("avec un plus", soin.texte === "+12", soin.texte);

    const drain = misEnScene({ type: "soin", cible: "H1", drain: true, montant: 3, pvApres: 33 }, etat);
    verifier("le drain d'absorption se distingue d'un soin", /🩸/.test(drain.texte), drain.texte);

    const crit = misEnScene({ type: "degats", cible: "H1", montant: 24,
                              pvApres: 6, critique: true }, etat);
    verifier("un critique se lit dans le chiffre", crit.texte === "-24 !", crit.texte);

    const opp = misEnScene({ type: "degats", cible: "H1", montant: 10,
                             opportunite: true, pvApres: 20 }, etat);
    verifier("une attaque d'opportunité aussi", /⚔️/.test(opp.texte), opp.texte);
}

// =========================================================================
console.log("\n5. LES ÉTAPES SANS GESTE NE SONT PAS DES ÉTAPES OUBLIÉES");
// =========================================================================
//  L'énergie dépensée, la file qui avance : rien à animer, mais l'écran se
//  rafraîchit après chaque étape. On dit « pas de geste » plutôt que de laisser
//  le pont ne pas savoir.
{
    const etat = monde();
    verifier("l'énergie ne s'anime pas", misEnScene({ type: "fatigue", cible: "H1" }, etat).geste === "rien");
    verifier("la file non plus", misEnScene({ type: "tour", fini: "H1" }, etat).geste === "rien");
    verifier("une nouvelle manche s'annonce",
             misEnScene({ type: "manche", numero: 3 }, etat).geste === "manche");
    verifier("une chute a son moment", misEnScene({ type: "chute", cible: "H1" }, etat).geste === "chute");
    verifier("et elle dure assez pour être lue",
             misEnScene({ type: "chute", cible: "H1" }, etat).duree >= 1000);
    const renonce = misEnScene({ type: "renonce", acteur: "M1", raison: "hors de portée" }, etat);
    verifier("une créature qui renonce le dit à l'écran",
             renonce.geste === "message" && /Hors de portée/.test(renonce.texte), renonce.texte);
}

// =========================================================================
console.log("\n6. UN VRAI TOUR DE CRÉATURE, TRADUIT DE BOUT EN BOUT");
// =========================================================================
//  Le vrai cerveau produit les étapes, le vrai pont les traduit. Aucune n'est
//  laissée de côté, et l'ordre de ce qu'on voit est celui de ce qui s'est passé.
{
    const etat = monde();
    const carte = { idCarte: "C2", infos: { portee: 1, fatigue: 15 },
                    attaques: [{ valeurBrute: 12 }], alterations: [] };
    // C'est le tour de M1 : on fait avancer la file.
    const enJeu = JSON.parse(JSON.stringify(etat));
    cloturerTour(enJeu);

    const pas = jouerCreature(enJeu, "M1", carte, null);
    verifier("la créature a joué", !!pas && pas.entree.etapes.length > 0,
             pas ? `(${pas.entree.etapes.length} étapes)` : "");

    const { pont, vus } = pontDeBanc();
    let courant = enJeu;
    const inconnus = [];
    for (const etape of pas.entree.etapes) {
        const scene = await pont.animer(etape, courant);
        if (scene.inconnu) inconnus.push(scene.inconnu);
        courant = appliquerEtape(courant, etape);
    }

    verifier("aucune étape n'est restée sans mise en scène", inconnus.length === 0, inconnus.join(","));
    verifier("on a vu la créature marcher", vus.some(v => v.startsWith("pas M1")), vus.slice(0, 3).join(" | "));
    const iPas = vus.findIndex(v => v.startsWith("pas"));
    const iRuee = vus.findIndex(v => v.startsWith("ruee"));
    if (iRuee >= 0) verifier("puis frapper — dans cet ordre", iPas < iRuee, `pas@${iPas} ruee@${iRuee}`);
    else verifier("ou renoncer, et le dire", vus.some(v => /msg M1/.test(v)), vus.join(" | "));
}

// =========================================================================
console.log("\n7. LE PONT N'ÉCRIT RIEN, ET NE CALCULE RIEN");
// =========================================================================
//  La garantie de fond. Une mise en scène ne doit dépendre QUE de l'étape et de
//  l'état qu'on lui donne — jamais d'un tirage, jamais d'une horloge, jamais
//  d'une lecture en base. Sinon deux écrans montreraient deux combats.
{
    const etat = monde();
    const etape = { type: "degats", cible: "H1", acteur: "M1", montant: 12, pvApres: 48 };

    const a = JSON.stringify(misEnScene(etape, etat));
    const b = JSON.stringify(misEnScene(etape, etat));
    const c = JSON.stringify(misEnScene(etape, JSON.parse(JSON.stringify(etat))));
    verifier("la même étape donne toujours la même scène", a === b && b === c);

    // Et l'état n'est pas touché : le pont regarde, il ne modifie pas.
    const avant = JSON.stringify(etat);
    misEnScene(etape, etat);
    const { pont } = pontDeBanc();
    await pont.animer(etape, etat);
    verifier("animer ne modifie pas l'état", JSON.stringify(etat) === avant);

    // Cent étapes tirées au hasard : aucune ne doit faire tomber le pont ni
    // toucher à l'état.
    const des = creerDes(7);
    let casses = 0;
    for (let i = 0; i < 300; i++) {
        const type = TYPES_MIS_EN_SCENE[des.entier(0, TYPES_MIS_EN_SCENE.length - 1)];
        const bricole = { type, acteur: "M1", cible: "H1",
                          montant: des.entier(-20, 40), pvApres: des.entier(-5, 80),
                          bouclierApres: des.entier(-5, 30), de: { q: 0, r: 0 }, vers: { q: 1, r: 0 },
                          liste: [], cibles: ["H1"], numero: 2, id: "z1" };
        try { misEnScene(bricole, etat); } catch (e) { casses++; }
    }
    verifier("trois cents étapes bricolées, aucune casse", casses === 0, `(${casses})`);
    verifier("et l'état est toujours intact", JSON.stringify(etat) === avant);
}

// =========================================================================
console.log("\n8. L'ANIMATION REND LA MAIN QUAND ELLE A FINI, PAS AVANT");
// =========================================================================
//  C'est la seule attente de tout le système, et c'est elle qui empêche les
//  pions de sauter. Le spectateur n'applique l'étape qu'au retour d'`animer`.
{
    const ordre = [];
    const pont = creerPont({
        jauge: () => ordre.push("jauge posée"),
        pause: async (ms) => { ordre.push(`attente ${ms}`); }
    });
    await pont.animer({ type: "degats", cible: "H1", montant: 12, pvApres: 48 }, monde());
    verifier("la barre part, puis on laisse le temps de la lire",
             ordre[0] === "jauge posée" && /^attente/.test(ordre[1] || ""), ordre.join(" → "));
    verifier("et l'attente n'est pas nulle", RYTHME.jauge > 0 && RYTHME.chute > RYTHME.jauge,
             `jauge ${RYTHME.jauge}, chute ${RYTHME.chute}`);

    // Le critique s'annonce AVANT le coup.
    const dit = [];
    const pont2 = creerPont({
        message: (p, t) => dit.push(t),
        ruee: async () => dit.push("ruée"),
        pause: async () => {}
    });
    await pont2.animer({ type: "carte", acteur: "M1", cibles: ["H1"], critique: true }, monde());
    verifier("« Critique ! » se lit avant le coup",
             dit[0] === "Critique !" && dit[1] === "ruée", dit.join(" → "));
}

// =========================================================================
console.log("\n9. L'ÉTAT DESCEND VERS L'ÉCRAN, ET RIEN NE REMONTE");
// =========================================================================
//  L'autre moitié du pont. Ce qui remplace les sept mécanismes de
//  réconciliation : il n'y a plus qu'une source, donc plus rien à arbitrer.
{
    const etat = monde();
    etat.combattants.H1.pv = 33;
    etat.combattants.H1.bouclier = 7;
    etat.combattants.H1.etats = [{ nom: "Brûlure", tours: 2 }];
    etat.combattants.M1.q = 2; etat.combattants.M1.r = 1;
    etat.combattants.H2.aTerre = true;
    etat.combattants.H2.pv = 0;

    const pions = pionsDepuisEtat(etat);
    verifier("chaque pion a sa case", pions.M1.q === 2 && pions.M1.r === 1,
             `(${pions.M1.q},${pions.M1.r})`);
    verifier("et tous y sont", Object.keys(pions).length === 3);

    const fiches = fichesDepuisEtat(etat, [
        { idPersonnage: "H1", PV_Actuels: 60, statut: "Vivant", Nom: "Naomi" },
        { idPersonnage: "H2", PV_Actuels: 60, statut: "Vivant" },
        { idPersonnage: "X9", PV_Actuels: 10, statut: "Vivant" }
    ]);
    const h1 = fiches.find(f => f.idPersonnage === "H1");
    verifier("les points de vie descendent dans la fiche", h1.PV_Actuels === 33);
    verifier("le bouclier aussi", h1.Bouclier_Actuel === 7);
    verifier("et les états", h1.Etats_Alteres[0].nom === "Brûlure");
    verifier("ce qui n'était pas dans l'état n'est pas touché",
             fiches.find(f => f.idPersonnage === "X9").PV_Actuels === 10);
    verifier("un combattant à terre le devient dans sa fiche",
             fiches.find(f => f.idPersonnage === "H2").statut === "Inconscient");
    verifier("et le champ qu'on n'écrit pas reste tel quel", h1.Nom === "Naomi");

    const file = fileDepuisEtat(etat);
    verifier("la file garde son ordre et ses cartes",
             file.map(f => f.idPersonnage).join(",") === "H1,M1,H2" && file[0].idCarte === "C1",
             file.map(f => f.idPersonnage).join(","));

    // La projection complète : un seul sens, et tout arrive.
    const recu = {};
    const projeter = creerProjection({
        poserPions: (p) => recu.pions = p,
        poserFiches: (f) => recu.fiches = f,
        poserFile: (f, infos) => { recu.file = f; recu.infos = infos; },
        rafraichir: () => recu.rafraichi = true,
        lireFiches: () => [{ idPersonnage: "H1", PV_Actuels: 60, statut: "Vivant" }]
    });
    projeter(etat);
    verifier("la projection pose les pions", !!recu.pions && !!recu.pions.H1);
    verifier("les fiches", recu.fiches[0].PV_Actuels === 33);
    verifier("la file et la manche", recu.file.length === 3 && recu.infos.manche === 1);
    verifier("et rafraîchit l'écran", recu.rafraichi === true);
    verifier("un état absent ne casse rien", (projeter(null), true));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
