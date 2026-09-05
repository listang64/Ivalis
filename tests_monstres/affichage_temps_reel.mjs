// « JE VOIS MON FRÈRE AVEC 48 D'ÉNERGIE, LUI EN VOIT 18. IL FAUT CLIQUER SUR UN
//   AUTRE PERSO ET REVENIR POUR QUE ÇA SE DÉBLOQUE. »
//
// Ce symptôme-là ne parle PAS de réseau : la donnée arrivait bien (Firestore la
// pousse sans qu'on demande rien), c'est le REDESSIN qui manquait. Le panneau
// gauche n'était refait que par le poste qui agissait ; ailleurs il gardait les
// chiffres du moment où le combat s'était ouvert.
//
// Et « le pion se téléporte à l'arrivée, puis revient au début pour lancer son
// animation » : la case d'arrivée et l'ordre d'animer voyagent dans DEUX
// documents, sans ordre garanti entre eux.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

function extraire(fichier, marqueur, finLigne = '};') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}
const SRC = ['window.positionsProtegees = function',
             'window.rafraichirAffichageCombat = function',
             'window.demarrerTicAffichageCombat = function',
             'window.arreterTicAffichageCombat = function',
             'window.enregistrerPionsVTT = async function']
    .map(m => extraire('combat.js', m)).join('\n\n')
    + '\nwindow.PIONS_EN_MOUVEMENT = window.PIONS_EN_MOUVEMENT || {};'
    + '\nwindow.DERNIER_MOUVEMENT_ANIME = window.DERNIER_MOUVEMENT_ANIME || 0;';

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
await p.goto('https://banc.ivalis/');

const res = await p.evaluate((src) => {
    const journal = { jauges: [], pistes: [], ecritures: [] };
    const db = {};
    const doc = (...a) => ({ chemin: a.slice(1).join("/") });
    const setDoc = async (ref, maj, opts) => { journal.ecritures.push({ maj, opts }); };

    window.localStorage.setItem("ID_JOUEUR_COURANT", "P1");
    document.getElementById = (id) => id === "fenetre-combat" ? { style: { display: "block" } } : null;

    // Les fiches telles que le réseau les livre : de NOUVEAUX objets à chaque
    // notification, jamais les mêmes que ceux du panneau.
    const fiche = (id, joueur, energie) => ({ idPersonnage: id, idJoueur: joueur, prenom: id,
                                              PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
                                              fatigueActuelle: energie });
    window.PERSOS_PARTIE = [fiche("J1", "P1", 100), fiche("J2", "P2", 100)];
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;
    window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
    window.TOKENS_VTT_DATA = {};
    window.ID_PARTIE_COURANTE = "P1";

    window.mettreAJourJaugePV = () => {
        const x = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
        journal.jauges.push(x ? x.PV_Actuels : null);
    };
    window.mettreAJourJaugeFatigue = () => {
        const x = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
        journal.jauges.push(x ? x.fatigueActuelle : null);
    };
    window.afficherPisteInitiative = () => { journal.pistes.push(Date.now()); };
    window.actualiserBoutonFinTour = () => {};
    window.actualiserEtatCarteCombat = () => {};

    eval(src);

    window.PERSOS_PARTIE = [fiche("J1", "P1", 18), fiche("J2", "P2", 100)];
    const avantRafraichissement = window.COMBAT_PERSOS_JOUEUR[0].fatigueActuelle;
    window.rafraichirAffichageCombat();
    const apresRafraichissement = window.COMBAT_PERSOS_JOUEUR[0].fatigueActuelle;

    window.PERSOS_PARTIE = [fiche("J1", "P1", 18), fiche("J3", "P1", 90), fiche("J2", "P2", 100)];
    window.rafraichirAffichageCombat();
    const listeApres = window.COMBAT_PERSOS_JOUEUR.map(x => x.idPersonnage);
    const selection = (window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] || {}).idPersonnage;

    window.COMBAT_PERSOS_JOUEUR_BACKUP = [window.PERSOS_PARTIE[0]];
    window.COMBAT_PERSOS_JOUEUR = [{ idPersonnage: "MONSTRE_1", estMonstre: true }];
    window.COMBAT_INDEX_PERSO = 0;
    window.rafraichirAffichageCombat();
    const pendantCreature = (window.COMBAT_PERSOS_JOUEUR[0] || {}).idPersonnage;
    window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;

    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0, taille: 55 }, J2: { q: 5, r: 5, taille: 55 } };
    const arrivee = { J1: { q: 4, r: 0, taille: 55 }, J2: { q: 5, r: 5, taille: 55 } };

    const sansAnnonce = window.positionsProtegees(arrivee, null);
    const annonce = { idToken: "J1", timestamp: Date.now() };
    const avecAnnonce = window.positionsProtegees(arrivee, annonce);

    window.DERNIER_MOUVEMENT_ANIME = annonce.timestamp;
    const apresAnimation = window.positionsProtegees(arrivee, annonce);

    window.DERNIER_MOUVEMENT_ANIME = 0;
    window.PIONS_EN_MOUVEMENT = { J1: true };
    window.TOKENS_VTT_DATA = { J1: { q: 2, r: 0, taille: 55 }, J2: { q: 5, r: 5, taille: 55 } };
    const pendantMarche = window.positionsProtegees(arrivee, null);
    window.PIONS_EN_MOUVEMENT = {};

    const vieille = window.positionsProtegees(arrivee, { idToken: "J1", timestamp: Date.now() - 30000 });

    window.TOKENS_VTT_DATA = { J1: { q: 4, r: 0, taille: 55 } };
    return (async () => {
        await window.enregistrerPionsVTT("J1", { idToken: "J1", timestamp: 1234 });
        const avecTrajet = journal.ecritures[journal.ecritures.length - 1];
        await window.enregistrerPionsVTT("J1");
        const sansTrajet = journal.ecritures[journal.ecritures.length - 1];

        return { avantRafraichissement, apresRafraichissement, listeApres, selection, pendantCreature,
                 sansAnnonce: sansAnnonce.J1, avecAnnonce: avecAnnonce.J1,
                 apresAnimation: apresAnimation.J1, pendantMarche: pendantMarche.J1, vieille: vieille.J1,
                 voisinIntact: avecAnnonce.J2,
                 avecTrajet, sansTrajet, jauges: journal.jauges, pistes: journal.pistes.length };
    })();
}, SRC);

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. LE PANNEAU SE REMET D'ACCORD AVEC LA BASE");
verifier("avant, le panneau tenait la fiche périmée",
         res.avantRafraichissement === 100, `(${res.avantRafraichissement})`);
verifier("après, il tient la fiche fraîche",
         res.apresRafraichissement === 18, `(${res.apresRafraichissement})`);
verifier("les jauges sont réellement redessinées",
         res.jauges.length >= 2, `(${res.jauges.length} redessin(s))`);
verifier("et la piste d'initiative avec elles", res.pistes >= 3, `(${res.pistes})`);
verifier("un héros qui rejoint en cours de combat entre dans le panneau",
         res.listeApres.join(",") === "J1,J3", `(${res.listeApres.join(",")})`);
verifier("sans faire sauter la sélection en cours",
         res.selection === "J1", `(${res.selection})`);
verifier("et le panneau qui montre une créature n'est pas volé",
         res.pendantCreature === "MONSTRE_1", `(${res.pendantCreature})`);

console.log("\n2. LE PION NE SE TÉLÉPORTE PLUS AVANT DE MARCHER");
verifier("sans annonce, la case d'arrivée s'applique aussitôt (le défaut)",
         res.sansAnnonce.q === 4, `(q=${res.sansAnnonce.q})`);
verifier("avec l'annonce, le pion reste à son point de départ",
         res.avecAnnonce.q === 0, `(q=${res.avecAnnonce.q})`);
verifier("les autres pions ne sont pas figés pour autant",
         res.voisinIntact.q === 5 && res.voisinIntact.r === 5);
verifier("une fois le trajet animé, la case du réseau reprend la main",
         res.apresAnimation.q === 4, `(q=${res.apresAnimation.q})`);
verifier("pendant la marche, le pion garde la case de son animation",
         res.pendantMarche.q === 2, `(q=${res.pendantMarche.q})`);
verifier("une annonce trop vieille ne fige plus rien",
         res.vieille.q === 4, `(q=${res.vieille.q})`);

console.log("\n3. L'ANNONCE PART DANS LA MÊME ÉCRITURE QUE LA CASE");
verifier("la case et l'annonce voyagent ensemble",
         !!(res.avecTrajet.maj.Tokens && res.avecTrajet.maj.Tokens.J1
            && res.avecTrajet.maj.Mouvement_En_Cours
            && res.avecTrajet.maj.Mouvement_En_Cours.timestamp === 1234),
         JSON.stringify(res.avecTrajet.maj));
verifier("une écriture ordinaire n'annonce aucun trajet",
         !res.sansTrajet.maj.Mouvement_En_Cours && !!res.sansTrajet.maj.Tokens.J1,
         JSON.stringify(res.sansTrajet.maj));

console.log("\n4. LE TIC DE SÉCURITÉ");
{
    const tic = await p.evaluate(async () => {
        let redessins = 0;
        const vrai = window.rafraichirAffichageCombat;
        window.rafraichirAffichageCombat = () => { redessins++; };
        window.demarrerTicAffichageCombat();
        window.demarrerTicAffichageCombat();
        const unSeul = !!window.TIC_AFFICHAGE_COMBAT;
        await new Promise(r => setTimeout(r, 4600));
        const pendant = redessins;
        window.arreterTicAffichageCombat();
        await new Promise(r => setTimeout(r, 2200));
        window.rafraichirAffichageCombat = vrai;
        return { pendant, apresArret: redessins, arrete: window.TIC_AFFICHAGE_COMBAT === null, unSeul };
    });
    verifier("l'écran se remet d'accord environ toutes les deux secondes",
             tic.pendant >= 2, `(${tic.pendant} redessin(s) en 4,6 s)`);
    verifier("démarrer deux fois ne pose pas deux tics",
             tic.unSeul && tic.pendant <= 3, `(${tic.pendant} redessin(s))`);
    verifier("et il s'arrête en quittant le combat",
             tic.arrete && tic.apresArret === tic.pendant,
             `(${tic.apresArret} vs ${tic.pendant})`);
}

console.log("\n5. AUCUNE REQUÊTE RÉSEAU DANS CE TIC");
{
    const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
    const bloc = src.slice(src.indexOf('window.rafraichirAffichageCombat = function'),
                           src.indexOf('window.mettreAJourJaugePV = function'));
    verifier("le rafraîchissement ne lit ni n'écrit la base",
             !/getDoc|setDoc|updateDoc|onSnapshot|modifierPartie/.test(bloc),
             "(il ne fait que redessiner ce que le poste sait déjà)");
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
