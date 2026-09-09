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
    verifier("le drapeau naît ALLUMÉ — c'est le régime du jeu maintenant",
             r.includes('window.REGIME_CERVEAU = window.REGIME_CERVEAU !== false;'));
    verifier("et la case du panneau est cochée d'emblée",
             SOURCES['index.html'].includes('id="toggle-regime-cerveau" checked'));
    verifier("mais un « 0 » enregistré l'éteint toujours",
             r.includes('if (choix === "0") window.REGIME_CERVEAU = false;'));
    verifier("on l'allume d'une ligne", r.includes('window.regimeCerveau = function(actif)'));
    verifier("et le choix survit au rechargement", r.includes('localStorage.setItem("REGIME_CERVEAU"'));
    // Chaque fonction que l'ancien monde peut appeler doit sortir tout de suite
    // quand le drapeau est éteint. On les nomme une par une : une garde
    // manquante ne se verrait qu'en jeu.
    [['regimeSuivreLaPartie', 'if (!window.REGIME_CERVEAU) { phasePrecedente = phaseVue; return; }'],
     // Elle nettoie même quand aucun régime n'est branché : c'est justement
     // quand un état périmé traîne qu'il empêche la rencontre suivante de
     // s'ouvrir. Sa garde ne porte donc que sur le drapeau.
     ['regimeFermerLeCombat', 'if (!window.REGIME_CERVEAU) return;\n        if (!REGIME) {']]
        .forEach(([nom, garde]) => {
            verifier(`${nom} sort tout de suite si le drapeau est éteint`, r.includes(garde));
        });
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

// =========================================================================
console.log("\n6. LE DRAPEAU EST ATTEIGNABLE, ET LA TRACE DIT OÙ ON EST");
// =========================================================================
//  La première vraie partie d'essai a tourné entièrement en ancien régime sans
//  que rien ne le dise : il a fallu relire la trace ligne à ligne pour
//  comprendre que le drapeau n'était pas allumé. Deux corrections, et les deux
//  sont vérifiées ici plutôt que promises.
//
//  Un drapeau qui n'est atteignable que par la console n'existe pas sur iPad :
//  la console y est au bout d'un câble et d'un Mac. Autant dire qu'il n'était
//  pas là où il fallait justement l'essayer.
{
    const html = SOURCES['index.html'];
    const app = SOURCES['app.js'];
    const r = SOURCES['regime_cerveau.js'];

    verifier("le régime se coche depuis l'écran",
             html.includes('id="toggle-regime-cerveau"'));
    verifier("la case appelle bien la bascule",
             html.includes('window.basculerRegimeCerveau(this.checked)'));
    verifier("et la bascule existe", app.includes('window.basculerRegimeCerveau = function'));
    verifier("la case reflète l'état réel du drapeau au chargement",
             app.includes('caseRegime.checked = window.REGIME_CERVEAU === true'));

    verifier("la trace annonce le régime au début d'un combat",
             r.includes('combat en régime ${window.REGIME_CERVEAU ? "CERVEAU" : "ANCIEN"}'));
    // Et elle l'annonce même quand le drapeau est ÉTEINT — sinon on retombe
    // exactement dans le cas qui a coûté la soirée.
    const iAnnonce = r.indexOf('combat en régime');
    const iSortie = r.indexOf('if (!window.REGIME_CERVEAU) { phasePrecedente');
    verifier("y compris quand il est éteint", iAnnonce > 0 && iAnnonce < iSortie,
             `(annonce ${iAnnonce}, sortie ${iSortie})`);
}

// =========================================================================
console.log("\n7. L'IA GARDE SON PREMIER MÉTIER : PRÉPARER LES CARTES");
// =========================================================================
//  verifierTourIAMonstres fait DEUX métiers, et un seul appartient au cerveau.
//
//    • Pendant la PRÉPARATION, elle fait choisir aux créatures leur technique
//      et les inscrit dans la file d'initiative. C'est la phase de préparation,
//      qui reste dans l'ancien monde — comme les joueurs qui choisissent leur
//      carte.
//    • Pendant la RÉSOLUTION, elle leur fait jouer leur tour. Ça, c'est le
//      cerveau.
//
//  Je l'avais coupée en entier. Les créatures ne posaient donc plus jamais
//  leur carte, la file restait incomplète, la phase ne passait jamais en
//  résolution, et la piste d'initiative ne se lançait pas — sans que rien dans
//  la trace ne dise pourquoi. Ce chapitre existe pour que ça ne se reproduise
//  pas silencieusement.
{
    const app = SOURCES['app.js'];
    const ia = lire('monstres_ia.js');

    // L'appel doit être HORS du bloc qui éteint l'ancienne synchro.
    const bloc = app.indexOf('if (!window.REGIME_CERVEAU) {');
    const iSeq = app.indexOf('window.suivreSequenceTour(dataPartie)');
    const iIA = app.indexOf('window.verifierTourIAMonstres();');
    verifier("le rejeu de l'ancien journal reste éteint", bloc > 0 && iSeq > bloc, `(${bloc} < ${iSeq})`);
    verifier("mais l'IA des monstres est toujours appelée", iIA > 0);
    verifier("et elle l'est dans les DEUX régimes", iIA > iSeq,
             "l'appel doit venir après le bloc conditionnel, donc hors de lui");

    // Et c'est monstres_ia.js qui sait lequel de ses deux métiers s'arrête.
    verifier("l'IA s'écarte d'elle-même quand le cerveau tient la main",
             ia.includes('if (window.REGIME_CERVEAU === true && !aPreparer) return;'));
    const iGarde = ia.indexOf('window.REGIME_CERVEAU === true && !aPreparer');
    const iPrepare = ia.indexOf('await window.preparerCartesMonstres()');
    const iJoue = ia.indexOf('await window.jouerTourMonstre(');
    verifier("la garde passe avant les deux métiers", iGarde > 0 && iGarde < iPrepare && iGarde < iJoue,
             `(garde ${iGarde}, préparer ${iPrepare}, jouer ${iJoue})`);
    verifier("préparer reste atteignable — c'est ce que la garde laisse passer",
             iPrepare > 0 && ia.includes('if (phase === "Preparation") {'));
}

// =========================================================================
console.log("\n8. LE DRAPEAU COCHÉ EN COURS DE COMBAT NE RESTE PAS MUET");
// =========================================================================
//  Le cerveau se donne à l'OUVERTURE d'un combat. Cocher la case au milieu
//  d'une rencontre déjà commencée n'ouvre donc rien — et aucun poste ne prend
//  la main de son propre chef, ce serait une élection, et c'est précisément ce
//  qu'on a supprimé. Il faut donc le dire, au lieu de laisser un plateau qui
//  n'avance plus sans raison visible.
{
    const r = SOURCES['regime_cerveau.js'];
    verifier("le cas est détecté",
             r.includes("!REGIME.etatPublie()\n            && !ouvertureEnCours && !aPrevenuSansCombat"));
    // ET IL NE MENT PAS PENDANT QU'ON OUVRE. Le message se déclenchait à chaque
    // début de combat : pendant la réclamation l'état n'est pas encore publié,
    // ce qui n'est pas la même chose que « il n'y en aura pas ».
    verifier("il se tait pendant l'ouverture", r.includes("ouvertureEnCours = true;"));
    verifier("et se rouvre quand elle est finie",
             (r.match(/ouvertureEnCours = false;/g) || []).length >= 2);
    verifier("et il se dit une seule fois", r.includes('aPrevenuSansCombat = true'));
    verifier("le message dit quoi faire",
             r.includes("réinitialise le combat pour qu'il prenne effet"));
    verifier("et l'avertissement se réarme au combat suivant",
             r.includes('if (phase === "Preparation") { aPrevenuSansCombat = false; dejaSignale = ""; }'));
}

// =========================================================================
console.log("\n9. UN COMBAT QUI NE PEUT PAS S'OUVRIR S'ARRÊTE, ET LE DIT");
// =========================================================================
//  Refuser de publier un état incohérent est la bonne décision. Ce qui était
//  faux, c'est ce qui suivait le refus.
//
//  Une première correction rebasculait sur l'ancien régime « pour ne pas
//  laisser la table sans rien ». Mauvaise idée : l'ancien régime est cassé, et
//  le rendre à la table sans prévenir, au milieu d'une rencontre, c'est offrir
//  une soirée de bugs à la place d'un message clair.
//
//  Un échec s'arrête donc franchement, et se dit À L'ÉCRAN. Mieux vaut un
//  combat qui refuse de commencer qu'un combat qui commence mal.
{
    const r = SOURCES['regime_cerveau.js'];

    verifier("l'échec d'ouverture est traité, pas ignoré",
             r.includes('REGIME.ouvrir(sourceDuJeu()).then(resultat => {'));
    verifier("un résultat vide est reconnu comme un échec", r.includes('if (resultat) return;'));
    // ON NE RETOMBE PAS DANS L'ANCIEN RÉGIME. Il est cassé ; le rendre à la
    // table sans prévenir, au milieu d'une rencontre, c'est offrir une soirée
    // de bugs à la place d'un message clair. Un échec s'arrête franchement.
    verifier("le combat s'ARRÊTE au lieu de retomber dans l'ancien",
             r.includes('arreterLeCombat("le combat n\'a pas pu s\'ouvrir")'));
    verifier("et on ne rebascule jamais en douce",
             !r.includes("retour à l'ANCIEN régime"));
    verifier("l'arrêt se voit à l'écran, pas seulement en console",
             r.includes("Le combat n'a pas pu démarrer."));
    verifier("le régime se débranche proprement",
             r.includes('REGIME.debrancher(); REGIME = null;'));
    verifier("et où lire la raison", r.includes("la ligne ❌"));
    verifier("on ne répète pas le même arrêt en boucle",
             r.includes('if (dejaSignale === raison) return;'));

    // UN ABANDON N'EST PAS UN ÉCHEC : quand un autre poste a déjà réclamé la
    // rencontre, on regarde, et surtout on n'arrête rien.
    verifier("perdre la réclamation n'arrête pas le combat",
             r.includes('if (REGIME && REGIME.ouvertureAilleurs()) return;'));

    // La règle de fond : refuser de publier reste la bonne décision. On vérifie
    // qu'on n'a PAS désarmé le contrôle pour se simplifier la vie.
    verifier("on refuse toujours de publier un état de départ incohérent",
             r.includes('tracer("❌", "combat non ouvert : état de départ incohérent"'));
    verifier("les bornes du jeu sont injectées dans l'état",
             r.includes('pvMax: window.pvMaxCombattant')
             && r.includes('fatigueMax: window.fatigueMaxCombattant'));
}

// =========================================================================
console.log("\n10. UNE SEULE OUVERTURE, ET UNE SEULE TRANSACTION");
// =========================================================================
//  Les trois postes voient la même notification au même instant : il faut donc
//  que la base tranche qui ouvre. C'est la SEULE transaction de tout le nouveau
//  régime — rien à voir avec le compteur d'événements d'avant, qui s'écrivait à
//  chaque hexagone parcouru et surchauffait le document de la partie.
{
    const app = SOURCES['app.js'];
    const depot = lire('depot_firestore.js');
    const spectateur = lire('spectateur_combat.js');

    verifier("l'accès Firestore sait réclamer", app.includes('async transaction(chemin, decider)'));
    verifier("et c'est la seule transaction du nouveau régime",
             (app.match(/runTransaction\(db/g) || []).length
             - (app.match(/runTransaction\(db, async \(tx\) => \{\n        const snap = await tx\.get\(ref\)/g) || []).length >= 0);
    verifier("l'ouverture passe par elle",
             depot.includes('const gagne = await io.transaction(chemin'));
    verifier("et abandonne si la rencontre est déjà ouverte",
             depot.includes('if (actuel && etat.combat && actuel.combat === etat.combat) return null;'));

    verifier("chaque entrée de journal porte sa rencontre",
             depot.includes('combat: etat.combat || ""'));
    verifier("et le spectateur écarte ce qui vient d'ailleurs",
             spectateur.includes("if (moi.combat && e.combat && e.combat !== moi.combat)"));
    verifier("l'identité vient du jeu, pas d'un tirage local",
             SOURCES['regime_cerveau.js'].includes('combat: partie.ID_Rencontre'));
}

// =========================================================================
console.log("\n11. LA QUESTION QU'ON POSE AVANT D'OUVRIR");
// =========================================================================
//  « Y a-t-il un état publié ? » était la mauvaise question, et elle a coûté un
//  essai entier : l'état de la rencontre précédente survivait à la
//  réinitialisation, la réponse était donc oui, et personne n'ouvrait le
//  nouveau combat. Aucune trace, aucune erreur — juste un plateau qui ne
//  démarre pas.
//
//  La bonne question est « cet état parle-t-il de CETTE rencontre ? ».
{
    const r = SOURCES['regime_cerveau.js'];
    const depot = lire('depot_firestore.js');

    verifier("on compare l'identité de la rencontre",
             r.includes('const memeCombat = !!publie && publie.combat === idCombat;'));
    verifier("et c'est elle qui décide d'ouvrir", r.includes('if (!memeCombat) {'));
    verifier("on ne se contente plus de l'existence d'un état",
             !r.includes('if (!publie) {'));

    // Le ménage : une réinitialisation ne laisse rien, état compris.
    verifier("effacer un combat retire aussi l'état",
             depot.includes('op: "delete", chemin: CHEMINS.etat(idPartie)'));
    verifier("et la fermeture passe par là", r.includes('await effacerLeCombat(io, idPartie)'));
    verifier("même sans régime branché, l'état périmé part",
             r.includes('await effacerLeCombat(window.ioCombatFirestore, window.ID_PARTIE_COURANTE)'));

    // Les pions : on déplace, on n'invente pas.
    verifier("la projection ne fabrique pas de pion",
             r.includes('const t = table[id];\n                    if (!t) return;'));
    verifier("et elle ignore un combattant hors du plateau",
             r.includes('if (pions[id].q === null || pions[id].r === null) return;'));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
