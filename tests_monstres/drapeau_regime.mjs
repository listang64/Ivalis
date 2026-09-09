// LE DRAPEAU, ET LA PROMESSE DE RETOUR ARRIÈRE.
//
// Le nouveau régime ne vaut que si on peut l'éteindre. C'est la condition qu'on
// s'est donnée : un basculement qui ne se défait pas en une ligne est un
// basculement qu'on n'ose pas essayer un soir de partie, et on jouerait donc
// toujours avec l'ancien.
//
// Ce banc-là ne fait tourner aucun combat : il LIT LE CODE DU JEU et vérifie
// deux choses que rien d'autre ne peut vérifier.
//
//   1. Chaque point d'appel redirigé est bien derrière `window.REGIME_CERVEAU`.
//      Un seul oubli, et le drapeau éteint ne rendrait pas exactement l'ancien
//      comportement — la promesse serait fausse, et on ne s'en apercevrait
//      qu'en jeu, un soir, au milieu d'un combat.
//   2. L'ancien chemin est toujours là, entier. On DÉBRANCHE, on ne supprime
//      pas : la suppression, c'est l'étape 7, et elle vient après une vraie
//      partie jouée jusqu'au bout.
//
// C'est un banc de structure, pas de comportement. Il attrape la classe
// d'erreur qu'aucun test de combat ne peut voir.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');

const SOURCES = {
    'app.js': lire('app.js'),
    'combat.js': lire('combat.js'),
    'mouvement.js': lire('mouvement.js'),
    'moteur_effets.js': lire('moteur_effets.js'),
    'sequence_tour.js': lire('sequence_tour.js'),
    'regime_cerveau.js': lire('regime_cerveau.js'),
    'index.html': lire('index.html')
};

console.log("\n=========================================================");
console.log("  LE DRAPEAU — CE QU'IL ÉTEINT, ET CE QU'IL LAISSE INTACT");
console.log("=========================================================\n");

// =========================================================================
console.log("1. CHAQUE REDIRECTION EST DERRIÈRE LE DRAPEAU");
// =========================================================================
//  On cherche l'usage de `window.regimeDemande` dans le jeu, et on vérifie
//  qu'aucun n'est atteignable sans que le drapeau soit allumé. La garde est
//  toujours la même phrase — c'est voulu : une seule forme, donc une seule
//  chose à relire.
{
    const GARDE = 'window.REGIME_CERVEAU && window.regimeDemande && window.regimeDemande.actif()';
    const attendus = [
        ['combat.js', 'finDeTour', 'la fin de tour'],
        ['mouvement.js', 'mouvement', 'le déplacement'],
        ['moteur_effets.js', 'carte', 'la carte'],
        ['sequence_tour.js', 'ok', 'le OK de la fenêtre sombre']
    ];

    attendus.forEach(([fichier, appel, quoi]) => {
        const src = SOURCES[fichier];
        verifier(`${quoi} passe par le régime`,
                 src.includes(`window.regimeDemande.${appel}(`), fichier);
        verifier(`et cette redirection est gardée`, src.includes(GARDE), fichier);
    });

    // Aucun appel à regimeDemande ne doit traîner hors d'une garde. On compte :
    // autant de gardes que de blocs qui s'en servent.
    Object.keys(SOURCES).forEach(fichier => {
        if (fichier === 'regime_cerveau.js' || fichier === 'index.html') return;
        const src = SOURCES[fichier];
        const usages = (src.match(/window\.regimeDemande\.(finDeTour|mouvement|carte|ok)\(/g) || []).length;
        const gardes = (src.match(/window\.REGIME_CERVEAU && window\.regimeDemande/g) || []).length;
        if (usages === 0) return;
        verifier(`${fichier} : autant de gardes que d'usages`, gardes >= 1 && usages <= gardes,
                 `${usages} usage(s), ${gardes} garde(s)`);
    });
}

// =========================================================================
console.log("\n2. L'ANCIENNE SYNCHRONISATION EST DÉBRANCHÉE, PAS SUPPRIMÉE");
// =========================================================================
//  Sous le nouveau régime, la séquence de tour rejouerait un second journal
//  par-dessus le premier, et l'IA ferait jouer les créatures en double — une
//  fois là, une fois dans le cerveau. C'est très exactement le mécanisme des
//  tours joués deux fois. Les deux appels sont donc éteints — et SEULEMENT
//  éteints : le code reste, entier, pour qu'on puisse revenir.
{
    const app = SOURCES['app.js'];
    verifier("le nouveau régime a son point d'entrée dans la partie",
             app.includes('window.regimeSuivreLaPartie(dataPartie)'));
    verifier("l'ancienne synchro est sous condition", app.includes('if (!window.REGIME_CERVEAU) {'));

    // Les deux appels doivent se trouver APRÈS l'ouverture du bloc, et avant sa
    // fermeture : c'est ce qui prouve qu'ils sont dedans.
    const debut = app.indexOf('if (!window.REGIME_CERVEAU) {');
    const iSeq = app.indexOf('window.suivreSequenceTour(dataPartie)');
    const iIA = app.indexOf('window.verifierTourIAMonstres();', debut);
    verifier("la séquence de tour est dedans", debut > 0 && iSeq > debut, `(${debut} < ${iSeq})`);
    verifier("l'IA des monstres aussi", iIA > debut, `(${iIA})`);

    // Et rien n'a été effacé.
    verifier("suivreSequenceTour existe toujours",
             SOURCES['sequence_tour.js'].includes('window.suivreSequenceTour = function'));
    verifier("l'ancien chemin de la fin de tour est intact",
             SOURCES['combat.js'].includes('window.modifierPartieOuEchec'));
    verifier("celui du déplacement aussi",
             SOURCES['mouvement.js'].includes('Action_Mouvement'));
    verifier("et celui de la carte", SOURCES['moteur_effets.js'].includes('Action_Moteur'));
    verifier("le verrou de l'IA n'a pas bougé", lire('monstres_ia.js').includes('reclamerVerrouIA'));
}

// =========================================================================
console.log("\n3. LE DRAPEAU EST ÉTEINT PAR DÉFAUT, ET IL SE GARDE");
// =========================================================================
//  Éteint par défaut : une page fraîchement rechargée joue comme avant, quoi
//  qu'il arrive. Et le choix survit au rechargement, parce que rouvrir la
//  console d'un iPad pour retaper une ligne à chaque essai n'est pas une option.
{
    const r = SOURCES['regime_cerveau.js'];
    verifier("le drapeau naît éteint", r.includes('window.REGIME_CERVEAU = window.REGIME_CERVEAU === true;'));
    verifier("on l'allume d'une ligne", r.includes('window.regimeCerveau = function(actif)'));
    verifier("et le choix survit au rechargement", r.includes('localStorage.setItem("REGIME_CERVEAU"'));
    verifier("le régime ne fait rien quand il est éteint",
             r.includes('if (!window.REGIME_CERVEAU) return;'));
}

// =========================================================================
console.log("\n4. LE NOUVEAU RÉGIME N'ÉCRIT JAMAIS DANS L'ANCIEN MONDE");
// =========================================================================
//  Le fichier du régime ne doit toucher ni au document de la partie, ni aux
//  fiches, ni aux Action_*. S'il le faisait, on aurait deux écrivains — et
//  toute l'architecture repose sur le fait qu'il n'y en a qu'un.
{
    const r = SOURCES['regime_cerveau.js'];
    ['Action_Moteur', 'Action_Mouvement', 'Action_Bond', 'modifierPartie',
     'File_Attente_Combat:', 'updateDoc', 'setDoc', 'writeBatch'].forEach(interdit => {
        verifier(`le régime ne touche pas à ${interdit}`, !r.includes(interdit));
    });
    verifier("il ne connaît Firestore qu'à travers l'accès injecté",
             r.includes('window.ioCombatFirestore') && !r.includes('firebase-firestore.js'));
}

// =========================================================================
console.log("\n5. TOUT EST CHARGÉ PAR LA PAGE");
// =========================================================================
//  Un fichier écrit mais pas chargé, c'est un fichier qui n'existe pas. Et un
//  `?v=` oublié, c'est un iPad qui garde l'ancienne version en cache et joue un
//  autre jeu que le PC — on connaît, ça nous a coûté une soirée.
{
    const html = SOURCES['index.html'];
    ['combat_etat.js', 'moteur_pur.js', 'mouvement_pur.js', 'ia_pure.js',
     'cerveau_combat.js', 'spectateur_combat.js', 'depot_firestore.js',
     'pont_combat.js', 'regime_cerveau.js'].forEach(f => {
        verifier(`${f} est chargé`, html.includes(`src="${f}?v=`), "");
    });
    const sansVersion = (html.match(/src="[a-z_]+\.js"/g) || []);
    verifier("aucun module du combat n'est chargé sans son ?v=",
             sansVersion.every(t => !/(combat|moteur|mouvement|ia_|cerveau|spectateur|depot|pont|regime)/.test(t)),
             sansVersion.join(" "));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
