// LES ZONES PERSISTANTES, RAMENÉES DANS LE CERVEAU.
//
// Une carte de Persistance de terrain laisse une nappe au sol — feu, poison,
// remous bienfaisant — qui frappe quiconque met le pied dessus, pendant trois
// manches.
//
// CE QUI ÉTAIT CASSÉ, ET QUI NE SE VOYAIT PAS.
//
// Sous le nouveau régime, marcher dans le feu ne faisait plus RIEN. Et c'était
// invisible, parce que tout le reste marchait : la zone se posait, se dessinait
// en rouge sur le plateau, et l'IA des créatures la contournait même
// soigneusement (ia_pure.js lit etat.zones pour calculer le risque d'une case).
// Tout était là, sauf l'essentiel — la seule fonction qui infligeait vraiment
// quelque chose vivait dans l'ancien moteur, appelée depuis des chemins que le
// cerveau ne traverse jamais. Un joueur pouvait traverser un brasier sans une
// égratignure, et rien à l'écran ne le disait.
//
// Pire : la zone ne vivait même pas dans l'état du combat. Elle s'écrivait à
// côté, dans une variable globale et dans Combat_VTT, sans passer par le
// cerveau. Ce banc suit donc la nappe sur toute sa vie : elle NAÎT dans
// l'état, elle BRÛLE ce qui la traverse, elle VIEILLIT, et elle MEURT.
import {
    traverserZones, creerZonePure, poserZone, vieillirZones
} from '../moteur_pur.js';
import { resoudreMouvement } from '../mouvement_pur.js';
import { construireEtatCombat, creerDes, appliquerEntree } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, camp: "Allié", prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

// Une nappe de feu sur trois cases en ligne, à partir de (1,0).
const FEU = {
    id: "zp_feu", type: "feu", idLanceur: "LANCEUR", dureeRestante: 3,
    hexes: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
    degats: { valeurBrute: 12, typeRes: "Physique" },
    soin: null,
    etat: { nom: "Brûlé", chance: 100, duree: 2, estPoison: false, tickFait: false }
};

const monde = (zones = {}, extra = {}) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_01", graine: 55,
    combattants: [fiche("MARCHEUR", extra), fiche("LANCEUR")],
    positions: { MARCHEUR: { q: 0, r: 0 }, LANCEUR: { q: 0, r: 5 } },
    partie: { Tour_Combat: 1 }, zones
});

console.log("\n=========================================================");
console.log("  LES ZONES PERSISTANTES DANS LE CERVEAU");
console.log("=========================================================");

// =========================================================================
console.log("\n1. MARCHER DANS LE FEU BRÛLE — LE TROU PRINCIPAL");
// =========================================================================
{
    const etat = monde({ zp_feu: FEU });
    const { etat: apres, etapes } = resoudreMouvement(
        etat, { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);

    const c = apres.combattants.MARCHEUR;
    verifier("le marcheur a perdu des points de vie", c.pv < 60, `${c.pv} PV`);
    verifier("une étape de dégâts le raconte, et nomme la zone",
             etapes.some(e => e.type === "degats" && e.zone === "zp_feu"),
             JSON.stringify(etapes.map(e => e.type)));
    verifier("l'état de la zone s'est posé sur lui",
             (c.etats || []).some(e => e.nom === "Brûlé"),
             JSON.stringify(c.etats));
}

// =========================================================================
console.log("\n2. CHAQUE CASE COMPTE — « S'IL CONTINUE, ÇA CONTINUE »");
// =========================================================================
//  La règle de l'ancien moteur : ce n'est pas l'entrée dans la zone qui
//  déclenche, c'est CHAQUE case de zone franchie.
{
    const unePas = resoudreMouvement(monde({ zp_feu: FEU }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);
    const troisPas = resoudreMouvement(monde({ zp_feu: FEU }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] },
        creerDes(3), null);

    const perteUne = 60 - unePas.etat.combattants.MARCHEUR.pv;
    const perteTrois = 60 - troisPas.etat.combattants.MARCHEUR.pv;
    verifier("traverser trois cases coûte plus qu'une seule",
             perteTrois > perteUne, `${perteUne} PV contre ${perteTrois} PV`);
    verifier("et une résolution par case franchie",
             troisPas.etapes.filter(e => e.type === "degats" && e.zone).length === 3,
             `${troisPas.etapes.filter(e => e.type === "degats" && e.zone).length} résolution(s)`);
}

// =========================================================================
console.log("\n3. LE TERRAIN NU NE CONSOMME AUCUN DÉ");
// =========================================================================
//  La règle de la maison. Un dé tiré par condition décalerait toute la suite
//  du tirage, et deux postes rejouant le même tour ne verraient plus la même
//  partie. Une marche hors zone doit tirer EXACTEMENT ce qu'elle tirait avant.
{
    const des = creerDes(999);
    const avant = des.graine();
    resoudreMouvement(monde(), { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }] },
                      des, null);
    verifier("aucune zone, aucun dé consommé", des.graine() === avant,
             `${avant} → ${des.graine()}`);

    const desFeu = creerDes(999);
    const avantFeu = desFeu.graine();
    resoudreMouvement(monde({ zp_feu: FEU }),
                      { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, desFeu, null);
    verifier("avec une zone, le dé tourne bien", desFeu.graine() !== avantFeu);
}

// =========================================================================
console.log("\n4. LA RÉSISTANCE PROTÈGE, LE BOUCLIER ENCAISSE D'ABORD");
// =========================================================================
{
    const blinde = resoudreMouvement(monde({ zp_feu: FEU }, { Def_Physique: 50 }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);
    const nu = resoudreMouvement(monde({ zp_feu: FEU }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);
    verifier("50 % de résistance divise les dégâts par deux",
             (60 - blinde.etat.combattants.MARCHEUR.pv) * 2 === (60 - nu.etat.combattants.MARCHEUR.pv),
             `${60 - blinde.etat.combattants.MARCHEUR.pv} contre ${60 - nu.etat.combattants.MARCHEUR.pv}`);

    const avecBouclier = resoudreMouvement(
        monde({ zp_feu: FEU }, { Bouclier_Actuel: 30, Bouclier_Max: 30 }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);
    const cb = avecBouclier.etat.combattants.MARCHEUR;
    verifier("le bouclier prend le coup, les PV sont intacts",
             cb.pv === 60 && cb.bouclier < 30, `${cb.pv} PV / ${cb.bouclier} bouclier`);
}

// =========================================================================
console.log("\n5. UNE ZONE DE SOIN SOIGNE, SANS DISTINCTION DE CAMP");
// =========================================================================
{
    const remous = { ...FEU, id: "zp_soin", type: "soin", degats: null,
                     soin: { valeurBrute: 15 }, etat: null };
    const { etat: apres, etapes } = resoudreMouvement(
        monde({ zp_soin: remous }, { PV_Actuels: 20 }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);

    verifier("le marcheur est soigné", apres.combattants.MARCHEUR.pv > 20,
             `${apres.combattants.MARCHEUR.pv} PV`);
    verifier("une étape de soin le dit",
             etapes.some(e => e.type === "soin" && e.zone === "zp_soin"));

    // Jamais au-delà du maximum.
    const plein = resoudreMouvement(monde({ zp_soin: remous }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);
    verifier("jamais au-dessus des PV max",
             plein.etat.combattants.MARCHEUR.pv === 60,
             `${plein.etat.combattants.MARCHEUR.pv} PV`);
}

// =========================================================================
console.log("\n6. UNE IMMUNITÉ DE PEUPLE TRAVERSE SANS RIEN ATTRAPER");
// =========================================================================
{
    const etat = monde({ zp_feu: FEU });
    etat.combattants.MARCHEUR.atouts = { immunites: ["Brûlé"] };
    const { etat: apres, etapes } = resoudreMouvement(
        etat, { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] }, creerDes(3), null);

    verifier("l'état n'est pas attrapé",
             !(apres.combattants.MARCHEUR.etats || []).some(e => e.nom === "Brûlé"));
    verifier("et c'est DIT, pas passé sous silence",
             etapes.some(e => e.type === "etatRate" && e.immunise),
             JSON.stringify(etapes.map(e => e.type)));
    verifier("les dégâts, eux, tombent quand même",
             apres.combattants.MARCHEUR.pv < 60, `${apres.combattants.MARCHEUR.pv} PV`);
}

// =========================================================================
console.log("\n7. TOMBER DANS LE FEU ARRÊTE LA MARCHE");
// =========================================================================
//  Un pion mis à terre continuait sa route et finissait son trajet couché.
{
    const brasier = { ...FEU, degats: { valeurBrute: 100, typeRes: "Physique" }, etat: null };
    const { etat: apres, etapes } = resoudreMouvement(
        monde({ zp_feu: brasier }, { PV_Actuels: 10 }),
        { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] },
        creerDes(3), null);

    const c = apres.combattants.MARCHEUR;
    verifier("le marcheur est à terre", c.aTerre === true);
    verifier("il s'est arrêté à la PREMIÈRE case, pas à la troisième",
             c.q === 1 && c.r === 0, `(${c.q},${c.r})`);
    verifier("une seule résolution de zone, pas trois",
             etapes.filter(e => e.type === "degats" && e.zone).length === 1);
    verifier("et le trajet écourté est annoncé",
             etapes.some(e => e.type === "trajetEcourte"));
}

// =========================================================================
console.log("\n8. LA NAISSANCE D'UNE ZONE, DANS L'ÉTAT");
// =========================================================================
{
    const etat = monde();
    const action = {
        attaques: [{ valeurBrute: 12, typeRes: "Magique", cibles: ["MARCHEUR"] }],
        alterations: [{ nom: "Brûlé", persistante: true, typeZone: "feu",
                        chance: 40, duree: 2, icone: "ic.png" }]
    };
    const zone = creerZonePure(etat, action, [{ q: 1, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], "LANCEUR");

    verifier("la zone existe", !!zone);
    verifier("les cases en double sont dédoublonnées", zone.hexes.length === 2,
             JSON.stringify(zone.hexes));
    verifier("elle porte les dégâts de la carte",
             zone.degats && zone.degats.valeurBrute === 12 && zone.degats.typeRes === "Magique");
    verifier("et son état élémentaire, avec sa chance",
             zone.etat && zone.etat.nom === "Brûlé" && zone.etat.chance === 40);
    verifier("elle vit trois manches", zone.dureeRestante === 3);

    // L'IDENTIFIANT NE PEUT PAS ÊTRE UN HORODATAGE : deux postes rejouant le
    // même tour fabriqueraient deux zones là où il n'y en a qu'une.
    const jumelle = creerZonePure(etat, action, [{ q: 1, r: 0 }, { q: 2, r: 0 }], "LANCEUR");
    verifier("deux postes fabriquent le MÊME identifiant", zone.id === jumelle.id, zone.id);

    // Une carte qui ne laisse rien : pas de zone fantôme.
    const rien = creerZonePure(etat, { attaques: [{ valeurBrute: 0 }], alterations: [] },
                               [{ q: 1, r: 0 }], "LANCEUR");
    verifier("une carte sans dégât, sans soin ni état ne pose rien", rien === null);
    verifier("et sans case visée non plus",
             creerZonePure(etat, action, [], "LANCEUR") === null);
}

// =========================================================================
console.log("\n9. UNE NOUVELLE NAPPE RONGE CELLE QU'ELLE RECOUVRE");
// =========================================================================
//  Et surtout : CHAQUE zone touchée porte son étape. N'annoncer que la
//  nouvelle suffirait à l'affichage mais pas au rejeu — un poste qui rejoue le
//  journal se retrouverait avec deux nappes superposées là où le cerveau n'en
//  a qu'une.
{
    const etat = monde({ zp_feu: FEU });
    const neuve = { ...FEU, id: "zp_glace", type: "glace",
                    hexes: [{ q: 1, r: 0 }, { q: 2, r: 0 }] };
    const etapes = poserZone(etat, neuve);

    verifier("l'ancienne survit, amputée des cases reprises",
             etat.zones.zp_feu && etat.zones.zp_feu.hexes.length === 1,
             JSON.stringify(etat.zones.zp_feu.hexes));
    verifier("la nouvelle est bien là", !!etat.zones.zp_glace);
    verifier("l'amputation de l'ancienne EST annoncée",
             etapes.some(e => e.id === "zp_feu" && e.zone && e.zone.hexes.length === 1),
             JSON.stringify(etapes.map(e => `${e.id}${e.retiree ? ":retirée" : ""}`)));

    // Entièrement recouverte : elle disparaît, et on le dit.
    const etat2 = monde({ zp_feu: FEU });
    const large = { ...FEU, id: "zp_large", hexes: [...FEU.hexes] };
    const etapes2 = poserZone(etat2, large);
    verifier("entièrement recouverte, l'ancienne disparaît",
             etat2.zones.zp_feu === undefined);
    verifier("et sa disparition est annoncée",
             etapes2.some(e => e.id === "zp_feu" && e.retiree === true));
}

// =========================================================================
console.log("\n10. ELLE VIEILLIT, ET ELLE MEURT");
// =========================================================================
//  Ce décompte vivait dans combat.js, sur le poste qui avait vidé la file —
//  donc nulle part sous ce régime : une zone posée serait restée jusqu'à la
//  fin du combat.
{
    const etat = monde({ zp_feu: { ...FEU, dureeRestante: 2 } });

    const m1 = vieillirZones(etat);
    verifier("après une manche, il lui reste un tour",
             etat.zones.zp_feu.dureeRestante === 1, String(etat.zones.zp_feu.dureeRestante));
    verifier("et son nouvel âge est annoncé",
             m1.some(e => e.type === "zone" && e.id === "zp_feu" && e.zone));

    const m2 = vieillirZones(etat);
    verifier("après la seconde, elle s'efface", etat.zones.zp_feu === undefined);
    verifier("sa disparition est annoncée",
             m2.some(e => e.type === "zone" && e.id === "zp_feu" && e.retiree === true));
    verifier("une nappe éteinte ne brûle plus personne",
             resoudreMouvement(etat, { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }] },
                               creerDes(3), null).etat.combattants.MARCHEUR.pv === 60);
}

// =========================================================================
console.log("\n11. LE REJEU DONNE LE MÊME PLATEAU QUE LE CERVEAU");
// =========================================================================
//  L'épreuve qui compte : un poste qui ne fait qu'APPLIQUER les étapes doit
//  arriver exactement aux mêmes zones que celui qui les a calculées.
{
    const chezLeCerveau = monde({ zp_feu: FEU });
    const chezLAutre = monde({ zp_feu: FEU });

    const neuve = { ...FEU, id: "zp_glace", hexes: [{ q: 1, r: 0 }, { q: 2, r: 0 }] };
    const etapes = [...poserZone(chezLeCerveau, neuve), ...vieillirZones(chezLeCerveau)];
    // Comme le fait un poste en retard : il applique l'entrée de journal telle
    // qu'elle lui arrive, et n'a rien d'autre pour reconstituer le plateau.
    const rejoue = appliquerEntree(chezLAutre, { etapes });

    verifier("les deux postes ont exactement les mêmes zones",
             JSON.stringify(rejoue.zones) === JSON.stringify(chezLeCerveau.zones),
             `rejeu ${JSON.stringify(Object.keys(rejoue.zones))} `
             + `contre cerveau ${JSON.stringify(Object.keys(chezLeCerveau.zones))}`);
    verifier("y compris l'amputation de celle qu'on a recouverte",
             JSON.stringify((rejoue.zones.zp_feu || {}).hexes)
             === JSON.stringify((chezLeCerveau.zones.zp_feu || {}).hexes),
             JSON.stringify((rejoue.zones.zp_feu || {}).hexes));
}

// =========================================================================
console.log("\n12. MÊME GRAINE, MÊME BRÛLURE — SUR TROIS POSTES");
// =========================================================================
{
    const resultats = [1, 2, 3].map(() => {
        const r = resoudreMouvement(monde({ zp_feu: { ...FEU, etat: { ...FEU.etat, chance: 50 } } }),
            { idLanceur: "MARCHEUR", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }] },
            creerDes(2024), null);
        return JSON.stringify({ pv: r.etat.combattants.MARCHEUR.pv,
                                etats: r.etat.combattants.MARCHEUR.etats });
    });
    verifier("les trois postes voient la même chose",
             resultats[0] === resultats[1] && resultats[1] === resultats[2], resultats[0]);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
