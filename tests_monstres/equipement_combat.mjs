// L'ÉQUIPEMENT, UNE FOIS EN MAIN.
// Le catalogue est vérifié ailleurs (objets_tableau.mjs) : ici on regarde ce
// que les objets FONT réellement une fois portés — stats, dégâts, états posés
// sur la cible, armure percée, portée, allonge, coût de déplacement, arme
// inadaptée, provocation. Tout tourne sur le VRAI code des fichiers du jeu.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// -------------------------------------------------------------------------
//  Le vrai code, découpé dans les fichiers du jeu.
// -------------------------------------------------------------------------
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');

function extraire(fichier, marqueur, finLigne = '};') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

// Les gabarits d'états et la greffe d'équipement sur une carte : un bloc continu.
const SRC_GREFFE = (() => {
    const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
    const d = src.indexOf('const GABARITS_ETATS_EQUIPEMENT = {');
    const f = src.indexOf('window.appliquerSuitesEquipement = async function');
    if (d < 0 || f < 0) throw new Error("bloc d'équipement introuvable dans moteur_effets.js");
    return src.slice(d, f);
})();
const SRC_DES = extraire('moteur_effets.js', 'function tirerLesDesDeLaCarte(state, lanceurData, critique) {', '}');
// Le ciblage de l'IA s'appuie sur des aides internes du module (traits, bruit,
// distanceHex) : on charge donc le fichier entier, comme les autres bancs d'IA.
const SRC_IA = fs.readFileSync('/home/user/Ivalis/monstres_ia.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

// Un monde minimal : ce que le moteur lit du décor pour ces fonctions-là.
function creerMonde() {
    const w = {};
    w.PERSOS_PARTIE = [];
    w.TOKENS_VTT_DATA = {};
    w.estCombattantMort = (id) => {
        const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
        return !p || (p.PV_Actuels !== undefined && p.PV_Actuels <= 0);
    };
    w.afficherMessageFlottantHex = () => {};
    global.window = w;
    global.document = { getElementById: () => null, querySelectorAll: () => [] };
    global.localStorage = { getItem: () => null, setItem: () => {} };

    new Function('window', SRC_OBJETS)(w);
    new Function('window', SRC_STATS_COMMUNES)(w);
    // Les deux blocs partagent la même portée dans moteur_effets.js (le tirage
    // des dés appelle attaquesFrappantes) : ils doivent donc être évalués
    // ensemble ici aussi, sinon le banc testerait une découpe qui n'existe pas.
    new Function('window', SRC_GREFFE + '\n' + SRC_DES
        + '\nwindow.tirerLesDesDeLaCarte = tirerLesDesDeLaCarte;')(w);
    return w;
}

const w = creerMonde();

// Un objet fabriqué à la demande, sans passer par le hasard du tirage.
function objet(modeleNom, rarete) {
    const modele = w.MODELES_OBJETS.find(m => m.modele === modeleNom);
    if (!modele) throw new Error("modèle inconnu : " + modeleNom);
    return w.fabriquerObjet(modele, rarete);
}
const heros = (extra = {}) => ({
    idPersonnage: "J1", prenom: "Pliors", camp: "Allié", idJoueur: "P1",
    PV_Max: 100, PV_Actuels: 100, Esquive: 15, Parade: 0, Critique: 10,
    Def_Physique: 0, Def_Magique: 0, Etats_Alteres: [],
    equipArmure: null, equipMainDroite: null, equipMainGauche: null, ...extra
});

// =========================================================================
console.log("1. LES BONUS S'ADDITIONNENT SUR LES STATS");
{
    const dague = objet("Dague", "Rare");            // +6% critique
    const bouclier = objet("Bouclier lourd", "Rare"); // 32 parade, +1 coût de déplacement
    const p = heros({ equipMainDroite: dague, equipMainGauche: bouclier });
    w.PERSOS_PARTIE = [p];

    verifier("le critique de base (10) reçoit les +6% de la dague",
             w.critiqueCombattant(p) === 16, `(${w.critiqueCombattant(p)})`);
    verifier("la parade reçoit les 32 du bouclier lourd",
             w.paradeCombattant(p) === 32, `(${w.paradeCombattant(p)})`);
    verifier("et son +1 au coût de déplacement est bien lu",
             w.bonusEquip(p, "coutDeplacement") === 1);

    const armure = objet("Armure lourde", "Épique"); // 40% phys, 15% mag (valeurs fixes)
    const q = heros({ equipArmure: armure });
    w.PERSOS_PARTIE = [q];
    verifier("l'armure lourde épique donne 40% de résistance physique",
             w.defPhysiqueCombattant(q) === 40, `(${w.defPhysiqueCombattant(q)})`);
    verifier("et 15% de résistance magique",
             w.defMagiqueCombattant(q) === 15, `(${w.defMagiqueCombattant(q)})`);
}

// =========================================================================
console.log("\n2. UNE ARME À DEUX MAINS NE COMPTE QU'UNE FOIS");
{
    const hache = objet("Hache à deux mains", "Rare"); // +4 dégâts physiques
    // Équipée, elle occupe les DEUX mains : le même objet dans les deux champs.
    const p = heros({ equipMainDroite: hache, equipMainGauche: hache });
    w.PERSOS_PARTIE = [p];
    verifier("elle n'est comptée qu'une fois malgré ses deux emplacements",
             w.objetsEquipes(p).length === 1, `(${w.objetsEquipes(p).length} objets)`);
    verifier("ses dégâts ne sont donc pas doublés (+4 et non +8)",
             w.bonusEquip(p, "degatsPhys") === 4, `(${w.bonusEquip(p, "degatsPhys")})`);
}

// =========================================================================
console.log("\n3. CE QUE L'ARME EN MAIN AUTORISE À LANCER");
{
    const hache = objet("Hache", "Commun");            // Arme lourde CAC
    const dague = objet("Dague", "Commun");            // Arme légère CAC
    const bague = objet("Bagues DPS", "Commun");       // Magie, portée au doigt
    const bouclier = objet("Bouclier léger", "Commun");

    const nu = heros();
    w.PERSOS_PARTIE = [nu];
    verifier("les mains vides, rien ne s'oppose à une technique d'arme",
             w.raisonBlocageCarte(nu, "Arme lourde CAC") === null);

    const avecHache = heros({ equipMainDroite: hache });
    verifier("une hache interdit une technique d'arme légère",
             w.raisonBlocageCarte(avecHache, "Arme légère CAC") !== null);
    verifier("et autorise une technique d'arme lourde",
             w.raisonBlocageCarte(avecHache, "Arme lourde CAC") === null);
    verifier("une technique sans arme reste toujours jouable",
             w.raisonBlocageCarte(avecHache, "Sans arme / Arme rp") === null);

    const deuxArmes = heros({ equipMainDroite: hache, equipMainGauche: dague });
    verifier("deux armes en main : chacune ouvre son propre type",
             w.raisonBlocageCarte(deuxArmes, "Arme légère CAC") === null
             && w.raisonBlocageCarte(deuxArmes, "Arme lourde CAC") === null);

    verifier("une main libre suffit pour lancer un sort",
             w.raisonBlocageCarte(avecHache, "Magie") === null);
    const mainsPrises = heros({ equipMainDroite: hache, equipMainGauche: bouclier });
    verifier("les deux mains prises, le sort ne part pas",
             w.raisonBlocageCarte(mainsPrises, "Magie") !== null);

    const bagueEtBouclier = heros({ equipMainDroite: bague, equipMainGauche: bouclier });
    verifier("une bague ne ferme pas la main : le sort passe",
             w.raisonBlocageCarte(bagueEtBouclier, "Magie") === null);
    verifier("et une bague seule n'interdit aucune technique d'arme",
             w.raisonBlocageCarte(heros({ equipMainDroite: bague }), "Arme lourde CAC") === null);

    const hacheDeuxMains = objet("Hache à deux mains", "Commun");
    const prisesParDeuxMains = heros({ equipMainDroite: hacheDeuxMains, equipMainGauche: hacheDeuxMains });
    verifier("une arme à deux mains empêche de lancer un sort",
             w.raisonBlocageCarte(prisesParDeuxMains, "Magie") !== null);
}

// =========================================================================
console.log("\n4. LA GREFFE SUR UNE CARTE : DÉGÂTS, SOINS, ÉTATS");
{
    const carte = () => ({
        attaques: [{ nom: "Attaque légère", typeRes: "Physique", valeurBrute: 20,
                     isRanged: false, rangeMax: 1, isHeal: false, isShield: false, cibles: ["M1"] }],
        alterations: []
    });

    const hache = objet("Hache", "Très rare");   // +3 dégâts physiques, + 1 effet A
    const p = heros({ equipMainDroite: hache });
    w.PERSOS_PARTIE = [p];
    const c = carte();
    w.appliquerEquipementALaCarte(c, p);
    const attendu = 20 + w.bonusEquip(p, "degatsPhys") + w.bonusEquip(p, "degats");
    verifier("les dégâts plats de l'arme s'ajoutent à la valeur brute",
             c.attaques[0].valeurBrute === attendu, `(${c.attaques[0].valeurBrute} pour ${attendu} attendus)`);

    // Deux fois la même carte ne doit pas cumuler deux fois.
    w.appliquerEquipementALaCarte(c, p);
    verifier("une carte déjà enrichie ne l'est pas une seconde fois",
             c.attaques[0].valeurBrute === attendu, `(${c.attaques[0].valeurBrute})`);

    // Le gourdin porte SON état propre : il doit rejoindre les altérations.
    const gourdin = objet("Gourdin", "Commun");  // 10% d'étourdissement
    const q = heros({ equipMainDroite: gourdin });
    w.PERSOS_PARTIE = [q];
    const c2 = carte();
    w.appliquerEquipementALaCarte(c2, q);
    const etourdi = c2.alterations.find(a => a.nom === "Étourdi");
    verifier("l'état de l'arme rejoint les altérations de la carte",
             !!etourdi, `(${c2.alterations.map(a => a.nom).join(",") || "aucune"})`);
    verifier("avec la chance du tableau (10%)", etourdi && etourdi.chance === 10, `(${etourdi && etourdi.chance})`);
    verifier("il vise exactement ce que la carte a frappé",
             etourdi && etourdi.cibles.join() === "M1");
    verifier("et il porte la durée et l'icône d'un vrai état du moteur",
             etourdi && etourdi.duree === 2 && (etourdi.icone || "").startsWith("https://"));

    // Une carte qui inflige DÉJÀ l'état ne doit pas l'avoir en double.
    const c3 = carte();
    c3.alterations.push({ nom: "Étourdi", chance: 5, duree: 3, cibles: ["M1"] });
    w.appliquerEquipementALaCarte(c3, q);
    verifier("un état déjà porté par la carte n'est pas dupliqué",
             c3.alterations.filter(a => a.nom === "Étourdi").length === 1);
    verifier("mais l'arme relève sa chance (5% deviennent 10%)",
             c3.alterations.find(a => a.nom === "Étourdi").chance === 10);

    // Un soin reçoit le bonus de soin, pas les dégâts.
    const bagueSoin = objet("Bagues Soins", "Rare");  // +2 soins
    const s = heros({ equipMainDroite: bagueSoin });
    w.PERSOS_PARTIE = [s];
    const cSoin = { attaques: [{ nom: "Soin", typeRes: "Magique", valeurBrute: 10, isHeal: true, cibles: ["J1"] }], alterations: [] };
    w.appliquerEquipementALaCarte(cSoin, s);
    verifier("une bague de soin ajoute ses points au soin", cSoin.attaques[0].valeurBrute === 12,
             `(${cSoin.attaques[0].valeurBrute})`);

    // Une arme sans état n'ajoute aucune altération.
    const dague = objet("Dague", "Commun");
    const d = heros({ equipMainDroite: dague });
    w.PERSOS_PARTIE = [d];
    const c4 = carte();
    w.appliquerEquipementALaCarte(c4, d);
    verifier("une arme sans état n'ajoute aucune altération", c4.alterations.length === 0);
}

// =========================================================================
console.log("\n5. LES JETS DE L'ÉQUIPEMENT SONT TIRÉS UNE SEULE FOIS");
{
    const masse = objet("Masse", "Commun");  // 15% d'ignorer l'armure
    const p = heros({ equipMainDroite: masse });
    const cible = { idPersonnage: "M1", camp: "Ennemi", Esquive: 0, Parade: 0, Etats_Alteres: [] };
    w.PERSOS_PARTIE = [p, cible];

    const state = {
        attaques: [{ typeRes: "Physique", valeurBrute: 20, isHeal: false, isShield: false, cibles: ["M1"] }],
        alterations: []
    };

    const vrai = Math.random;
    Math.random = () => 0;            // un jet de 1 : la percée passe
    const jetsReussis = w.tirerLesDesDeLaCarte(state, p, false);
    Math.random = () => 0.99;         // un jet de 100 : elle échoue
    const jetsRates = w.tirerLesDesDeLaCarte(state, p, false);
    Math.random = vrai;

    verifier("le jet de percée d'armure est bien pris avec les autres dés",
             jetsReussis.parCible.M1.equip !== undefined);
    verifier("un petit jet perce l'armure", jetsReussis.parCible.M1.equip.ignoreArmure === true);
    verifier("un gros jet ne la perce pas", jetsRates.parCible.M1.equip.ignoreArmure === false);

    // Une arme sans percée ne doit produire aucun jet inutile.
    const dague = objet("Dague", "Commun");
    const q = heros({ equipMainDroite: dague });
    w.PERSOS_PARTIE = [q, cible];
    const jetsDague = w.tirerLesDesDeLaCarte(state, q, false);
    verifier("une arme sans percée ne tire pas de jet de percée",
             !jetsDague.parCible.M1.equip || jetsDague.parCible.M1.equip.ignoreArmure === undefined);
}

// =========================================================================
console.log("\n6. PORTÉE, ALLONGE ET COÛT DE DÉPLACEMENT");
{
    const arc = objet("Arc court", "Commun");     // +1 portée
    const lance = objet("Lance à deux mains", "Commun"); // +1 allonge
    const couteau = objet("Couteau", "Commun");   // -1 au coût du déplacement

    const archer = heros({ equipMainDroite: arc, equipMainGauche: arc });
    verifier("l'arc court donne +1 de portée", w.bonusEquip(archer, "portee") === 1);
    verifier("et aucune allonge (ce n'est pas une arme de contact)",
             w.bonusEquip(archer, "allonge") === 0);

    const lancier = heros({ equipMainDroite: lance, equipMainGauche: lance });
    verifier("la lance à deux mains donne +1 d'allonge", w.bonusEquip(lancier, "allonge") === 1);
    verifier("et aucune portée : elle reste une arme de contact",
             w.bonusEquip(lancier, "portee") === 0);

    verifier("le couteau retire 1 au coût de chaque case",
             w.bonusEquip(heros({ equipMainDroite: couteau }), "coutDeplacement") === -1);
}

// =========================================================================
console.log("\n7. LES PRÉREQUIS EN CARACTÉRISTIQUE");
{
    const commun = objet("Hache", "Commun");     // aucun prérequis
    const rare = objet("Hache", "Rare");         // FORCE 10
    const epique = objet("Hache", "Épique");     // FORCE 12

    global.localStorage = { getItem: () => JSON.stringify({ force: 10, dex: 8, con: 8, int: 8, sag: 8, cha: 8 }) };
    verifier("un objet commun n'exige rien", w.peutEquiper("J1", commun).possible === true);
    verifier("FORCE 10 suffit pour un objet rare", w.peutEquiper("J1", rare).possible === true);
    verifier("mais pas pour un épique (12 exigés)", w.peutEquiper("J1", epique).possible === false);
    verifier("et le manque est chiffré", w.peutEquiper("J1", epique).manque === 2,
             `(${w.peutEquiper("J1", epique).manque})`);

    global.localStorage = { getItem: () => null };
    verifier("une fiche de caracs illisible ne bloque jamais l'équipement",
             w.peutEquiper("J1", epique).possible === true);
}

// =========================================================================
console.log("\n8. UNE CRÉATURE PROVOQUÉE NE VOIT PLUS QUE SON PROVOCATEUR");
{
    const m = creerMonde();
    new Function('window', 'db', 'doc', 'updateDoc', 'getDoc', 'setDoc', SRC_IA)(m, {}, () => ({}), async () => {}, async () => ({ exists: () => false }), async () => {});
    m.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 }, J1: { q: 5, r: 0 }, J2: { q: 1, r: 0 } };
    const monstre = { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, PV_Actuels: 50, PV_Max: 50,
                      Etats_Alteres: [], archetype: "DPS CAC" };
    const loin = { idPersonnage: "J1", camp: "Allié", PV_Actuels: 100, PV_Max: 100, Etats_Alteres: [] };
    const proche = { idPersonnage: "J2", camp: "Allié", PV_Actuels: 100, PV_Max: 100, Etats_Alteres: [] };
    m.PERSOS_PARTIE = [monstre, loin, proche];
    const infos = { estSoin: false, portee: 1, estAttaqueSimple: true };

    // Sans provocation, elle préfère naturellement le héros le plus proche.
    const sansProvoc = [];
    for (let i = 0; i < 30; i++) sansProvoc.push(m.choisirCibleMonstre(monstre, infos).idPersonnage);
    verifier("sans provocation, elle vise surtout le plus proche",
             sansProvoc.filter(id => id === "J2").length > 20,
             `(${sansProvoc.filter(id => id === "J2").length}/30 fois J2)`);

    // Provoquée par le héros LOINTAIN, elle n'a plus le choix.
    monstre.Etats_Alteres = [{ nom: "Provocation", duree: 2, idProvocateur: "J1" }];
    const avecProvoc = [];
    for (let i = 0; i < 30; i++) avecProvoc.push(m.choisirCibleMonstre(monstre, infos).idPersonnage);
    verifier("provoquée, elle ne vise plus que son provocateur",
             avecProvoc.every(id => id === "J1"), `(${[...new Set(avecProvoc)].join(",")})`);

    // Le provocateur tombe : la contrainte s'efface au lieu de bloquer la créature.
    loin.PV_Actuels = 0;
    const apresMort = m.choisirCibleMonstre(monstre, infos);
    verifier("si le provocateur tombe, elle retrouve sa liberté",
             apresMort && apresMort.idPersonnage === "J2", `(${apresMort && apresMort.idPersonnage})`);

    // Un soin va toujours aux siens, provocation ou non.
    monstre.Etats_Alteres = [{ nom: "Provocation", duree: 2, idProvocateur: "J2" }];
    const allie = { idPersonnage: "M2", camp: "Ennemi", PV_Actuels: 10, PV_Max: 50, Etats_Alteres: [] };
    m.PERSOS_PARTIE.push(allie);
    m.TOKENS_VTT_DATA.M2 = { q: 1, r: 1 };
    const soin = m.choisirCibleMonstre(monstre, { estSoin: true, portee: 3, estAttaqueSimple: false });
    verifier("un soin reste dirigé vers les siens malgré la provocation",
             soin && soin.camp === "Ennemi", `(${soin && soin.idPersonnage})`);
}

// =========================================================================
console.log("\n9. LES ÉTATS TEMPORAIRES PASSENT PAR LES MÊMES STATS");
{
    const p = heros({ Etats_Alteres: [
        { nom: "Élan", duree: 2, bonusEquip: { initiative: 15 } },
        { nom: "Béni", duree: 1, bonusEquip: { resMag: 8 } }
    ]});
    w.PERSOS_PARTIE = [p];
    verifier("l'élan d'initiative est lu comme un bonus d'équipement",
             w.bonusEquip(p, "initiative") === 15, `(${w.bonusEquip(p, "initiative")})`);
    verifier("la bénédiction s'ajoute à la résistance magique",
             w.defMagiqueCombattant(p) === 8, `(${w.defMagiqueCombattant(p)})`);

    // Élan ET épée courte : les deux sources s'additionnent.
    const epee = objet("Épée courte", "Commun");  // +5 d'initiative
    const q = heros({ equipMainDroite: epee, Etats_Alteres: [{ nom: "Élan", duree: 2, bonusEquip: { initiative: 15 } }] });
    w.PERSOS_PARTIE = [q];
    verifier("arme et état temporaire s'additionnent", w.bonusEquip(q, "initiative") === 20,
             `(${w.bonusEquip(q, "initiative")})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
