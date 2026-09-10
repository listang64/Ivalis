// LE SPECTATEUR, MIS À L'ÉPREUVE — ÉTAPE 4.
//
// Un écran qui regarde n'écrit rien, ne calcule rien, ne décide rien : il rejoue
// le journal, une entrée à la fois, dans l'ordre des numéros. Ce banc vérifie ce
// que ça implique, et surtout LA propriété qui rend tout sûr :
//
//   un poste en retard ne peut pas être FAUX, il ne peut être qu'EN RETARD.
//
// Il rattrape en rejouant les numéros manquants et arrive NÉCESSAIREMENT au même
// écran que les autres. On le vérifie ici sur trois postes menés à des rythmes
// délibérément différents — dont un qui dort, un qui reçoit dans le désordre, et
// un qui ne touche jamais son bouton.
import { creerSpectateur, prochaineEtape, cleDuTour } from '../spectateur_combat.js';
import { creerCerveau, prochainPas } from '../cerveau_combat.js';
import { construireEtatCombat, clonerEtat, verifierEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const monde = () => construireEtatCombat({
    idPartie: "GAME_TEST", cerveau: "P_03", graine: 4242,
    combattants: [
        fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Pliors" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 3, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1,
              Ordre_Initiative: ["H1", "M1", "H2"],
              File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_H1" },
                                    { idPersonnage: "M1", idCarte: "C_M1" },
                                    { idPersonnage: "H2", idCarte: "C_H2" }] }
});

// Un petit journal fait à la main : deux pas et un coup, portés par M1.
const TOUR_M1 = {
    v: 1, acteur: "M1", manche: 1, graine: 7,
    etapes: [
        { type: "pas", acteur: "M1", de: { q: 3, r: 0 }, vers: { q: 2, r: 0 } },
        { type: "pas", acteur: "M1", de: { q: 2, r: 0 }, vers: { q: 1, r: 0 } },
        { type: "carte", acteur: "M1", carte: "C_M1", cibles: ["H1"] },
        { type: "degats", cible: "H1", acteur: "M1", montant: 12, pvApres: 48 }
    ]
};
const TOUR_H2 = {
    v: 2, acteur: "H2", manche: 1, graine: 9,
    etapes: [{ type: "degats", cible: "M1", acteur: "H2", montant: 20, pvApres: 40 }]
};

// Un spectateur d'essai : il note ce qu'il anime au lieu de le dessiner.
function creerEcran(poste, options = {}) {
    const vu = { animations: [], etats: [], fenetres: [], traces: [] };
    const spectateur = creerSpectateur({
        estAMoi: (id) => (id === "H1" && poste === "P_03") || (id === "H2" && poste === "P_01"),
        // On étiquette par le combattant CONCERNÉ : celui qui bouge pour un pas,
        // celui qui encaisse pour un coup. C'est ce que l'écran montre.
        animer: async (etape) => {
            const qui = (etape.type === "degats" || etape.type === "soin" || etape.type === "chute")
                ? etape.cible : (etape.acteur || etape.cible || "");
            vu.animations.push(`${etape.type}:${qui}`);
        },
        surEtat: (e) => { vu.etats.push(e ? e.version : null); },
        surFenetre: (e) => { vu.fenetres.push(e ? e.v : null); },
        tracer: (i, q, d) => { vu.traces.push(`${i} ${q}`); },
        respiration: 0,
        delaiAvantRattrapage: 0,
        ...options
    });
    return { spectateur, vu };
}

// =========================================================================
console.log("\n1. QUE FAIRE MAINTENANT ? — LA DÉCISION, SEULE");
// =========================================================================
{
    const mien = (id) => id === "H1";

    verifier("rien reçu : rien à faire",
             prochaineEtape(0, {}, null, mien).quoi === "rien");
    verifier("l'entrée suivante est là : on joue",
             prochaineEtape(0, { 1: TOUR_H2 }, "H2|1", mien).quoi === "jouer");

    // Le tour d'un autre s'ouvre : la fenêtre sombre attend le OK.
    const attente = prochaineEtape(0, { 1: TOUR_M1 }, null, mien);
    verifier("le tour d'un autre demande le OK", attente.quoi === "attendre");
    verifier("et nomme le tour concerné", attente.cle === "M1|1");
    verifier("une fois acquitté, il se joue",
             prochaineEtape(0, { 1: TOUR_M1 }, "M1|1", mien).quoi === "jouer");
    verifier("mon propre tour ne demande jamais de OK",
             prochaineEtape(0, { 1: { ...TOUR_M1, acteur: "H1" } }, null, mien).quoi === "jouer");

    // LE TROU. Il passe avant tout : jouer par-dessus un numéro manquant, c'est
    // raconter une histoire à laquelle il manque une page.
    const trou = prochaineEtape(0, { 3: TOUR_H2 }, null, mien);
    verifier("un numéro manquant est détecté", trou.quoi === "trou");
    verifier("on sait lequel manque, et lequel on a déjà",
             trou.manque === 1 && trou.deja === 3);
    verifier("le trou passe avant la fenêtre sombre",
             prochaineEtape(0, { 2: TOUR_M1, 5: TOUR_H2 }, null, mien).quoi === "trou");
}

// =========================================================================
console.log("\n2. UN TOUR SE REJOUE ÉTAPE PAR ÉTAPE, DANS L'ORDRE");
// =========================================================================
{
    const { spectateur, vu } = creerEcran("P_03");
    spectateur.repartirDe(monde(), 0);
    spectateur.recevoir([TOUR_M1]);
    await spectateur.lire();

    verifier("la fenêtre sombre s'est ouverte", vu.fenetres[0] === 1);
    verifier("et rien n'a encore été animé", vu.animations.length === 0);

    await spectateur.ok();
    verifier("après le OK, les quatre étapes sont jouées",
             vu.animations.join(" ") === "pas:M1 pas:M1 carte:M1 degats:H1",
             `(${vu.animations.join(" ")})`);
    verifier("la fenêtre s'est refermée", vu.fenetres[vu.fenetres.length - 1] === null);
    verifier("le curseur a avancé", spectateur.vue() === 1);
    verifier("le pion est arrivé au bout",
             spectateur.etat().combattants.M1.q === 1);
    verifier("et le héros a encaissé", spectateur.etat().combattants.H1.pv === 48);
    verifier("l'écran a été rafraîchi à chaque étape", vu.etats.length >= 4);
}

// =========================================================================
console.log("\n3. ON ANIME D'ABORD, ON APPLIQUE ENSUITE");
// =========================================================================
//  C'est très exactement ce qui donnait « le jeu joue pendant l'écran noir, je
//  vois la vie qui se retire ». L'écran ne doit jamais montrer le résultat avant
//  le geste.
{
    const ordre = [];
    const { spectateur } = creerEcran("P_03", {
        animer: async (etape, etat) => {
            // Au moment d'animer les dégâts, les points de vie doivent être
            // ceux d'AVANT le coup.
            if (etape.type === "degats") ordre.push(`anime avec pv=${etat.combattants.H1.pv}`);
        },
        surEtat: (e) => { if (e) ordre.push(`ecran pv=${e.combattants.H1.pv}`); }
    });
    spectateur.repartirDe(monde(), 0);
    spectateur.recevoir([{ ...TOUR_M1, acteur: "H1" }]);    // mon héros : pas de OK
    await spectateur.lire();

    const iAnime = ordre.findIndex(o => o.startsWith("anime"));
    const iApres = ordre.findIndex(o => o === "ecran pv=48");
    verifier("l'animation reçoit les points de vie d'AVANT",
             ordre[iAnime] === "anime avec pv=60", `(${ordre[iAnime]})`);
    verifier("et l'écran ne descend qu'APRÈS", iApres > iAnime,
             `(${ordre.join(" | ")})`);
}

// =========================================================================
console.log("\n4. UN NUMÉRO MANQUANT SE RATTRAPE, ET NE SE SAUTE JAMAIS");
// =========================================================================
{
    // Le n°1 est introuvable : on n'avance pas. Sauter, c'est désynchroniser
    // cet écran pour tout le reste du combat.
    const perdu = creerEcran("P_01", { chercher: async () => null });
    perdu.spectateur.repartirDe(monde(), 0);
    perdu.spectateur.recevoir([TOUR_H2]);        // le n°2 sans le n°1
    await perdu.spectateur.lire();
    verifier("sans le numéro manquant, on n'avance pas", perdu.spectateur.vue() === 0);
    verifier("et rien n'est animé", perdu.vu.animations.length === 0);
    verifier("mais on le signale", perdu.vu.traces.some(t => t.includes("introuvable")));

    // Retrouvé : la suite se déroule normalement.
    const sauve = creerEcran("P_01", { chercher: async (v) => (v === 1 ? TOUR_M1 : null) });
    sauve.spectateur.repartirDe(monde(), 0);
    sauve.spectateur.recevoir([TOUR_H2]);
    await sauve.spectateur.lire();
    verifier("le trou déclenche une lecture directe",
             sauve.vu.traces.some(t => t.includes("il manque")));
    // Le n°1 est le tour de M1 : la fenêtre s'ouvre.
    verifier("et la fenêtre s'ouvre sur le tour retrouvé",
             sauve.spectateur.enAttente() && sauve.spectateur.enAttente().v === 1);
    await sauve.spectateur.ok();
    verifier("puis les DEUX entrées se jouent, dans l'ordre",
             sauve.spectateur.vue() === 2, `(vue ${sauve.spectateur.vue()})`);
}

// =========================================================================
console.log("\n5. LES ENTRÉES ARRIVENT DANS LE DÉSORDRE, L'ÉCRAN NON");
// =========================================================================
{
    const { spectateur, vu } = creerEcran("P_03");
    spectateur.repartirDe(monde(), 0);
    // Le réseau livre 2 puis 1 : ça arrive, surtout après une mise en veille.
    spectateur.recevoir([TOUR_H2, TOUR_M1]);
    // Deux tours d'acteurs différents : deux fenêtres, deux OK.
    await spectateur.lire();
    await spectateur.ok();
    if (spectateur.enAttente()) await spectateur.ok();

    verifier("l'écran rejoue dans l'ordre des numéros", spectateur.vue() === 2,
             `(vue ${spectateur.vue()})`);
    verifier("le coup de M1 est joué avant celui de H2",
             vu.animations.indexOf("degats:H1") < vu.animations.indexOf("degats:M1"),
             `(${vu.animations.join(" ")})`);
}

// =========================================================================
console.log("\n6. TROIS ÉCRANS, TROIS RYTHMES, LE MÊME RÉSULTAT");
// =========================================================================
//  LE contrôle qui remplace nos simulations à trois navigateurs. Le cerveau
//  déroule un vrai combat ; trois postes le suivent à des rythmes délibérément
//  différents. À la fin, ils doivent afficher exactement la même chose.
{
    const depart = monde();
    const journal = [];

    // Le cerveau, avec un dépôt minimal : il publie, on garde le journal.
    const memoire = { etat: clonerEtat(depart), intentions: [] };
    const CARTES = { C_M1: { idCarte: "C_M1", infos: { portee: 1, fatigue: 15 },
                             attaques: [{ valeurBrute: 12 }], alterations: [] } };
    const cerveau = creerCerveau({
        lireEtat: async () => clonerEtat(memoire.etat),
        lireIntentions: async () => memoire.intentions.filter(i => !i.traitee),
        publier: async (etat, entree, traitees) => {
            memoire.etat = clonerEtat(etat);
            journal.push(JSON.parse(JSON.stringify(entree)));
            (traitees || []).forEach(id => {
                const i = memoire.intentions.find(x => x.id === id);
                if (i) i.traitee = true;
            });
        },
        // UN VRAI DÉPÔT SAIT REFUSER, et c'est indispensable : depuis qu'une
        // carte clôt le tour, le « fin de tour » qu'un joueur envoie juste après
        // son attaque arrive trop tard et se fait refuser. Sans fermeture, le
        // cerveau repasserait dessus indéfiniment — il s'arrête plutôt que de
        // tourner en rond, donc un dépôt qui ne referme pas bloque le combat.
        refuser: async (id, raison) => {
            const i = memoire.intentions.find(x => x.id === id);
            if (i) { i.traitee = true; i.refus = raison; }
        }
    }, { poste: "P_03", carteDe: (id, c) => CARTES[c] || null, maintenant: () => 1 });

    // Nico joue son tour, puis on laisse la goule et Pliors enchaîner.
    memoire.intentions.push(
        { id: "I1", poste: "P_03", acteur: "H1", type: "carte", idCarte: "C_H1",
          coutFatigue: 20, attaques: [{ valeurBrute: 15, cibles: ["M1"] }], alterations: [] },
        { id: "I2", poste: "P_03", acteur: "H1", type: "finTour" });
    await cerveau.tournerJusquAuCalme();
    memoire.intentions.push({ id: "I3", poste: "P_01", acteur: "H2", type: "finTour" });
    await cerveau.tournerJusquAuCalme();

    verifier("le cerveau a produit un journal", journal.length >= 3, `(${journal.length} entrées)`);

    // POSTE A — il suit tout, et acquitte chaque tour dès qu'il le voit.
    const a = creerEcran("P_03");
    a.spectateur.repartirDe(depart, 0);
    for (const e of journal) {
        a.spectateur.recevoir([e]);
        await a.spectateur.lire();
        if (a.spectateur.enAttente()) await a.spectateur.ok();
    }

    // POSTE B — il dort tout du long, et reçoit les entrées d'un bloc, dans le
    // désordre. C'est l'iPad qu'on rouvre après avoir regardé ailleurs.
    const b = creerEcran("P_01");
    b.spectateur.repartirDe(depart, 0);
    b.spectateur.recevoir([...journal].reverse());
    for (let i = 0; i < journal.length + 2; i++) {
        await b.spectateur.lire();
        if (b.spectateur.enAttente()) await b.spectateur.ok();
    }

    // POSTE C — il ne touche JAMAIS son bouton, et se contente de rattraper
    // sans animer. C'est le poste muet de nos anciens bancs.
    const c = creerEcran("P_99");
    c.spectateur.repartirDe(depart, 0);
    c.spectateur.rattraperSansAnimer(journal);

    const final = memoire.etat;
    const memeQue = (s) => JSON.stringify(s.etat().combattants) === JSON.stringify(final.combattants);

    verifier("le poste qui suit tout affiche l'état du cerveau", memeQue(a.spectateur),
             `(vue ${a.spectateur.vue()} / ${final.version})`);
    verifier("le poste qui dormait aussi, une fois réveillé", memeQue(b.spectateur),
             `(vue ${b.spectateur.vue()})`);
    verifier("et celui qui n'a jamais cliqué également", memeQue(c.spectateur),
             `(vue ${c.spectateur.vue()})`);
    verifier("les trois écrans sont au même numéro",
             a.spectateur.vue() === b.spectateur.vue()
             && b.spectateur.vue() === c.spectateur.vue()
             && c.spectateur.vue() === final.version,
             `(${a.spectateur.vue()}, ${b.spectateur.vue()}, ${c.spectateur.vue()})`);
    verifier("et leur état est cohérent",
             verifierEtatCombat(a.spectateur.etat()).length === 0);

    // Celui qui suivait tout a VU les animations ; celui qui rattrape, non.
    verifier("celui qui suivait a vu les animations", a.vu.animations.length > 0);
    verifier("celui qui rattrape n'en a joué aucune", c.vu.animations.length === 0);
}

// =========================================================================
console.log("\n7. DEUX REJEUX NE SE CHEVAUCHENT JAMAIS");
// =========================================================================
//  Deux boucles en parallèle joueraient deux animations l'une sur l'autre —
//  c'est exactement le genre de chevauchement qui faisait sauter les pions.
{
    let simultanees = 0, maxi = 0;
    const { spectateur } = creerEcran("P_03", {
        animer: async () => {
            simultanees++; maxi = Math.max(maxi, simultanees);
            await new Promise(r => setTimeout(r, 5));
            simultanees--;
        }
    });
    spectateur.repartirDe(monde(), 0);
    spectateur.recevoir([{ ...TOUR_M1, acteur: "H1" }, { ...TOUR_H2, acteur: "H1" }]);

    // On lance trois lectures d'un coup, comme le feraient trois notifications.
    await Promise.all([spectateur.lire(), spectateur.lire(), spectateur.lire()]);
    verifier("une seule animation à la fois, toujours", maxi === 1, `(${maxi} en parallèle)`);
    verifier("et tout a bien été joué", spectateur.vue() === 2);
}

// =========================================================================
console.log("\n8. REJOINDRE UN COMBAT DÉJÀ COMMENCÉ");
// =========================================================================
//  Rejouer trois cents entrées n'aurait aucun intérêt et prendrait dix minutes :
//  on saute directement à l'état publié.
{
    const avance = monde();
    avance.version = 152;
    avance.combattants.H1.pv = 21;

    const { spectateur, vu } = creerEcran("P_01");
    spectateur.rejoindre(avance);
    verifier("on part de la version publiée", spectateur.vue() === 152);
    verifier("avec l'état tel quel", spectateur.etat().combattants.H1.pv === 21);
    verifier("sans rejouer une seule animation", vu.animations.length === 0);

    // Et la suite s'anime normalement.
    spectateur.recevoir([{ ...TOUR_H2, v: 153 }]);
    await spectateur.lire();
    verifier("la suite reprend au bon numéro", spectateur.vue() === 153);
    verifier("et s'anime, elle", vu.animations.length === 1);

    // Une entrée déjà dépassée est ignorée : elle n'a plus rien à raconter.
    spectateur.recevoir([{ ...TOUR_M1, v: 12 }]);
    verifier("une entrée déjà dépassée est écartée", spectateur.enFile() === 0);
}

// =========================================================================
console.log("\n9. LA CLÉ D'UN TOUR");
// =========================================================================
//  C'est elle qui décide si la fenêtre sombre s'ouvre : une fois par tour, pas
//  une fois par étape, et pas deux fois pour deux manches du même combattant.
{
    verifier("un tour est identifié par son acteur et sa manche",
             cleDuTour({ acteur: "M1", manche: 3 }) === "M1|3");
    verifier("deux manches du même combattant sont deux tours",
             cleDuTour({ acteur: "M1", manche: 3 }) !== cleDuTour({ acteur: "M1", manche: 4 }));

    // Deux entrées du MÊME tour : un seul OK.
    const { spectateur, vu } = creerEcran("P_03");
    spectateur.repartirDe(monde(), 0);
    spectateur.recevoir([
        { v: 1, acteur: "M1", manche: 1, etapes: [{ type: "pas", acteur: "M1", vers: { q: 2, r: 0 } }] },
        { v: 2, acteur: "M1", manche: 1, etapes: [{ type: "degats", cible: "H1", pvApres: 50 }] }
    ]);
    await spectateur.lire();
    await spectateur.ok();
    verifier("un seul OK suffit pour tout un tour", spectateur.vue() === 2,
             `(vue ${spectateur.vue()})`);
    verifier("la fenêtre ne s'est ouverte qu'une fois",
             vu.fenetres.filter(f => f !== null).length === 1);

    // La manche suivante, elle, redemande un OK.
    spectateur.recevoir([{ v: 3, acteur: "M1", manche: 2,
                           etapes: [{ type: "degats", cible: "H1", pvApres: 40 }] }]);
    await spectateur.lire();
    verifier("la manche suivante redemande le OK",
             spectateur.enAttente() && spectateur.enAttente().v === 3);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
