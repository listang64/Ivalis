// LA MANCHE SUIVANTE — LE CHAÎNON QUI MANQUAIT.
//
// Le cerveau publie la résolution ; la préparation, elle, appartient encore aux
// joueurs et s'écrit dans le document de la partie. En fin de manche, le
// cerveau vidait donc sa file et repassait sa phase à « Preparation »… sans
// jamais le DIRE à la partie, qui restait en « Resolution » avec la file de la
// manche écoulée. Plus personne ne pouvait choisir de carte, et le passage
// Preparation → Résolution — le seul qui ouvre une manche — ne pouvait plus se
// produire. Le combat jouait sa première manche puis répétait « la file est
// vide » toutes les cinq secondes, pour toujours.
//
// Ce banc fait tourner le VRAI regime_cerveau.js, couche fenêtre comprise
// (window.regimeSuivreLaPartie), sur un Firestore en mémoire, et joue DEUX
// manches d'affilée.

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// --------------------------------------------------------------------------
//  UN FIRESTORE EN MÉMOIRE, ET UN DOCUMENT DE PARTIE À CÔTÉ
// --------------------------------------------------------------------------
function firestore() {
    const base = new Map();
    const ecoutes = [];
    const cle = (c) => c.join("/");
    const copie = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));

    function documentsDe(chemin, r) {
        const p = cle(chemin) + "/";
        let l = [...base.entries()]
            .filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1)
            .map(([k, d]) => ({ ...d, __chemin: k.split("/") }));
        if (r && r.champ !== undefined && r.sup !== undefined) l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
        if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
        return copie(l);
    }

    const attente = [];
    const empiler = () => ecoutes.forEach(e => attente.push({
        e, charge: copie(e.estCollection ? documentsDe(e.chemin, e.requete) : (base.get(cle(e.chemin)) || null))
    }));

    const io = {
        async lire(chemin) { return copie(base.get(cle(chemin)) || null); },
        async lister(chemin, requete) { return documentsDe(chemin, requete); },
        async lot(operations) {
            (operations || []).forEach(o => {
                const k = cle(o.chemin);
                if (o.op === "delete") base.delete(k);
                else if (o.op === "update") base.set(k, { ...(base.get(k) || {}), ...copie(o.data) });
                else base.set(k, copie(o.data));
            });
            empiler();
        },
        async transaction(chemin, decider) {
            const k = cle(chemin);
            const aEcrire = decider(copie(base.get(k) || null));
            if (!aEcrire) return false;
            base.set(k, copie(aEcrire));
            empiler();
            return true;
        },
        ecouterDoc(chemin, rappel) {
            const e = { chemin, rappel, estCollection: false };
            ecoutes.push(e);
            attente.push({ e, charge: copie(base.get(cle(chemin)) || null) });
            return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
        },
        ecouterCollection(chemin, requete, rappel) {
            const e = { chemin, requete, rappel, estCollection: true };
            ecoutes.push(e);
            attente.push({ e, charge: documentsDe(chemin, requete) });
            return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
        }
    };

    async function livrer(tours = 8) {
        for (let t = 0; t < tours; t++) {
            const lot = attente.splice(0, attente.length);
            for (const { e, charge } of lot) await e.rappel(charge);
            await new Promise(r => setTimeout(r, 0));
            if (attente.length === 0) break;
        }
    }
    return { io, livrer, base };
}

// --------------------------------------------------------------------------
//  LE MONDE
// --------------------------------------------------------------------------
const PARTIE = "GAME_MANCHE";
const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 40, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", camp: "Allié", ...extra
});

const HEROS = fiche("H1", { idJoueur: "P_01", prenom: "Pliors", Regeneration: 20 });
const CREATURE = fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule",
                               Personnalite: "brutal", Regeneration: 0 });

const fileDe = (...ids) => ids.map(id => ({ idPersonnage: id, idCarte: "C_" + id }));

const partieDoc = {
    ID_Rencontre: "renc_manche",
    Difficulte_Rencontre: "Normale",
    Phase_Combat: "Preparation",
    Tour_Combat: 1,
    Ordre_Initiative: ["M1", "H1"],
    File_Attente_Combat: [],
    Ont_Joue_Ce_Round: []
};

const f = firestore();
const ecrituresPartie = [];

// --------------------------------------------------------------------------
//  LA FENÊTRE, TELLE QUE LE JEU LA PRÉSENTE AU RÉGIME
// --------------------------------------------------------------------------
const elements = { "fenetre-combat": { style: { display: "block" } } };
global.document = {
    getElementById: (id) => elements[id] || (elements[id] = { style: {}, innerHTML: "", innerText: "" }),
    addEventListener: () => {}
};
global.localStorage = { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? "P_01" : null), setItem: () => {} };

const filesVues = [];          // ce que la projection a posé dans l'écran
const traces = [];

global.window = {
    REGIME_CERVEAU: true,
    ID_PARTIE_COURANTE: PARTIE,
    ioCombatFirestore: f.io,
    PARTIE_DATA: JSON.parse(JSON.stringify(partieDoc)),
    PERSOS_PARTIE: [JSON.parse(JSON.stringify(CREATURE)), JSON.parse(JSON.stringify(HEROS))],
    MONSTRES_PARTIE: [JSON.parse(JSON.stringify(CREATURE))],
    TOKENS_VTT_DATA: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    ZONES_PERSISTANTES: {},
    // Les formules du jeu (app.js). Le régime les injecte dans l'état : sans
    // elles, les maxima seraient lus bruts et les invariants refuseraient
    // d'ouvrir le combat — c'est ce qui est arrivé au premier vrai essai.
    pvMaxCombattant: (p) => parseInt(p.PV_Max) || 0,
    fatigueMaxCombattant: (p) => parseInt(p.Fatigue_Max) || 100,
    esquiveCombattant: (p) => parseInt(p.Esquive) || 0,
    paradeCombattant: (p) => parseInt(p.Parade) || 0,
    defPhysiqueCombattant: (p) => parseInt(p.Def_Physique) || 0,
    defMagiqueCombattant: (p) => parseInt(p.Def_Magique) || 0,
    critiqueCombattant: (p) => parseInt(p.Critique) || 0,
    atoutRace: () => ({}),
    bonusEquip: () => 0,
    estMonHerosCombat: (id) => id === "H1",
    tracerCombat: (i, q, d) => traces.push(`${i} ${q} ${d || ""}`),
    // La partie : une transaction, comme la vraie (combat.js).
    modifierPartie: async (modifier) => {
        const sortie = modifier(JSON.parse(JSON.stringify(partieDoc)));
        if (!sortie) return null;
        if (sortie.maj) {
            ecrituresPartie.push(Object.keys(sortie.maj).sort().join(","));
            Object.assign(partieDoc, JSON.parse(JSON.stringify(sortie.maj)));
        }
        return sortie.resultat !== undefined ? sortie.resultat : true;
    },
    // La carte de la créature, telle que l'extracteur la rendrait.
    demarrerCiblage: async (idCarte, options) => ({
        attaques: [{ valeurBrute: 9 }], alterations: [], isZone: false, zoneHexesBase: []
    }),
    analyserCarteMonstre: () => ({ portee: 1, fatigue: 10 }),
    // L'interface : on ne garde que ce que la projection lui donne.
    afficherPisteInitiative: (file) => filesVues.push((file || []).map(x => x.idPersonnage).join(">")),
    actualiserBoutonFinTour: () => {},
    actualiserEtatCarteCombat: () => {},
    rafraichirAffichageCombat: () => {},
    redessinerPions: () => {},
    rafraichirVoileTour: () => {}
};

await import('/home/user/Ivalis/regime_cerveau.js');

// Le voile : le cerveau regarde son propre écran, donc il doit cliquer OK comme
// les autres. On le fait automatiquement dès qu'une fenêtre s'ouvre.
// Les animations prennent leur temps (RYTHME : jusqu'à 1,2 s pour une chute) :
// on attend que l'écran ait vraiment rattrapé ce qui est publié, en cliquant OK
// à chaque fenêtre qui s'ouvre.
const attendreEtCliquer = async (limiteMs = 12000) => {
    const debut = Date.now();
    while (Date.now() - debut < limiteMs) {
        await f.livrer(4);
        const r = window.regimeDuJeu && window.regimeDuJeu();
        if (r) {
            r.ok();
            const publie = r.etatPublie();
            if (publie && r.vue() >= publie.version) {
                // Rattrapé : on laisse une dernière respiration au cas où le
                // cerveau enchaînerait.
                await f.livrer(4);
                await new Promise(x => setTimeout(x, 30));
                if (r.vue() >= r.etatPublie().version) return;
            }
        }
        await new Promise(x => setTimeout(x, 40));
    }
};

// Une notification de la partie, comme app.js la reçoit : PARTIE_DATA est
// remplacée par une COPIE FRAÎCHE du document, puis le régime la suit.
const notifier = async () => {
    window.PARTIE_DATA = JSON.parse(JSON.stringify(partieDoc));
    // Comme app.js : la piste d'initiative est dessinée depuis le document de
    // la partie AVANT que le régime ne dise son mot. C'est ce qui fait vivre la
    // phase de préparation, et c'est cette file-là que la projection ne doit
    // pas écraser.
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat,
                                   window.PARTIE_DATA.Phase_Combat);
    window.regimeSuivreLaPartie(window.PARTIE_DATA);
    await attendreEtCliquer();
};

console.log("\n=========================================================");
console.log("  DEUX MANCHES D'AFFILÉE, SANS INTERVENTION");
console.log("=========================================================");

// ==========================================================================
console.log("\n1. LA PREMIÈRE MANCHE S'OUVRE ET SE JOUE");
{
    await notifier();                                  // préparation : rien à faire
    verifier("en préparation, le cerveau n'ouvre rien", !window.regimeDuJeu()?.etatPublie());

    partieDoc.File_Attente_Combat = fileDe("M1", "H1");
    partieDoc.Phase_Combat = "Resolution";
    await notifier();

    const etat = window.regimeDuJeu().etatPublie();
    verifier("le combat est ouvert", !!etat, etat ? `(version ${etat.version})` : "");
    verifier("et c'est ce poste qui tient le cerveau", window.regimeDuJeu().jeSuisLeCerveau());
    verifier("la créature a joué", (etat.file || []).length <= 1,
             `(${(etat.file || []).map(x => x.id).join(",") || "file vide"})`);

}

// ==========================================================================
console.log("\n1 bis. CE QUE L'INTERFACE VOIT QUAND C'EST AU TOUR DU JOUEUR");
// C'EST LE CONTRÔLE QUI MANQUAIT DEPUIS LE DÉBUT. Le bouton « Appliquer » — le
// seul chemin par lequel un joueur lance sa carte pendant son tour — n'apparaît
// que si TROIS choses sont vraies dans window.PARTIE_DATA : la phase est
// « Resolution », le héros est EN TÊTE de la file, et son entrée porte bien
// l'identifiant de sa carte (competences.js, `estMonTour` + `isLocked`).
// Ces trois choses viennent de la projection du cerveau. Si l'une manque, le
// joueur regarde son écran sans rien pouvoir cliquer, et RIEN ne le dit.
{
    const vue = window.PARTIE_DATA;
    verifier("la phase projetée est bien la résolution", vue.Phase_Combat === "Resolution",
             `(${vue.Phase_Combat})`);
    const tete = (vue.File_Attente_Combat || [])[0];
    verifier("le héros est en tête de la file projetée", !!tete && tete.idPersonnage === "H1",
             `(${tete ? tete.idPersonnage : "file vide"})`);
    verifier("et son entrée porte l'identifiant de sa carte", !!tete && !!tete.idCarte,
             `(${tete ? String(tete.idCarte) : "—"})`);
    verifier("il n'est pas noté comme ayant déjà joué",
             !((vue.Ont_Joue_Ce_Round || []).includes("H1")),
             `(${(vue.Ont_Joue_Ce_Round || []).join(", ") || "personne"})`);
}

// ==========================================================================
console.log("\n2. LA MANCHE EST FINIE : LE CERVEAU REND LA MAIN");
{
    // Le héros termine son tour : c'est la dernière chose que la manche attend.
    window.regimeDemande.finDeTour("H1");
    await attendreEtCliquer();

    const etat = window.regimeDuJeu().etatPublie();
    verifier("l'état repasse en préparation", etat.phase === "Preparation", `(${etat.phase})`);
    verifier("sa file est vide", (etat.file || []).length === 0);
    verifier("et c'est la manche 2", etat.manche === 2, `(manche ${etat.manche})`);

    await notifier();      // c'est ici que le cerveau doit écrire dans la partie

    verifier("LA PARTIE REPASSE EN PRÉPARATION", partieDoc.Phase_Combat === "Preparation",
             `(${partieDoc.Phase_Combat})`);
    verifier("sa file est vidée", (partieDoc.File_Attente_Combat || []).length === 0,
             `(${(partieDoc.File_Attente_Combat || []).length})`);
    verifier("son compteur de tour avance", partieDoc.Tour_Combat === 2, `(${partieDoc.Tour_Combat})`);
    verifier("et tout le monde doit rejouer", (partieDoc.Ont_Joue_Ce_Round || []).length === 0);
    verifier("le retour est annoncé dans la trace",
             traces.some(t => t.includes("la main revient aux joueurs")));

    const avant = ecrituresPartie.length;
    for (let i = 0; i < 5; i++) await notifier();
    verifier("et il ne le réécrit pas à chaque notification", ecrituresPartie.length === avant,
             `(${ecrituresPartie.length - avant} écriture(s) de trop)`);
}

// ==========================================================================
console.log("\n3. LA PRÉPARATION GARDE LA PAROLE SUR LA FILE");
{
    // Les joueurs choisissent leurs cartes une par une : la partie se remplit.
    partieDoc.File_Attente_Combat = fileDe("H1");
    await notifier();
    verifier("la file de la partie n'est pas effacée par la projection",
             (window.PARTIE_DATA.File_Attente_Combat || []).length === 1,
             `(${(window.PARTIE_DATA.File_Attente_Combat || []).length})`);
    verifier("l'écran voit bien ce choix", filesVues.includes("H1"),
             `(dernier : ${filesVues[filesVues.length - 1] || "vide"})`);
}

// ==========================================================================
console.log("\n4. LA DEUXIÈME MANCHE S'OUVRE TOUTE SEULE");
{
    const versionAvant = window.regimeDuJeu().etatPublie().version;
    partieDoc.File_Attente_Combat = fileDe("M1", "H1");
    partieDoc.Phase_Combat = "Resolution";
    await notifier();

    const etat = window.regimeDuJeu().etatPublie();
    verifier("le cerveau a publié la nouvelle manche", etat.version > versionAvant,
             `(${versionAvant} → ${etat.version})`);
    verifier("l'état est en résolution", etat.phase === "Resolution", `(${etat.phase})`);
    verifier("et la manche 2 est bien la manche en cours", etat.manche === 2, `(${etat.manche})`);
    verifier("la créature rejoue", (etat.file || []).every(x => x.id !== "M1")
             || (etat.file || [])[0]?.id !== "M1",
             `(${(etat.file || []).map(x => x.id).join(",") || "file vide"})`);
}

// ==========================================================================
console.log("\n5. L'ÉNERGIE REMONTE À CHAQUE FIN DE MANCHE");
{
    // 20% de régénération sur une jauge de 100 : le héros reprend 20 points.
    // Sans ça, l'ancien monde le faisait dans finDeTourCombat — que le nouveau
    // régime ne traverse plus — et le combat s'éteignait faute d'énergie.
    const etat = window.regimeDuJeu().etatPublie();
    const h = etat.combattants.H1;
    verifier("le héros a récupéré son pourcentage de régénération", h.fatigue >= 60,
             `(${h.fatigue}/${h.fatigueMax} pour 40 au départ)`);
    const m = etat.combattants.M1;
    verifier("une créature sans régénération ne gagne rien", m.fatigue <= 40,
             `(${m.fatigue})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
