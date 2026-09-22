import { db } from "./firebase-config.js?v=2";
import { doc, setDoc, onSnapshot, updateDoc, runTransaction, deleteField, FieldPath } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  TOUTE MODIFICATION PARTAGÉE DU DOCUMENT DE PARTIE PASSE PAR ICI
// =========================================================================
//  La file d'attente du combat est lue puis réécrite par cinq endroits
//  différents (une carte choisie, un repos long, une fin de tour, les cartes
//  des créatures, un déplacement validé). Tant qu'un seul navigateur jouait,
//  ces lectures-écritures ne se croisaient jamais. À trois postes, si :
//
//    - trois joueurs choisissent leur carte au même instant, les trois lisent
//      la même file vide et réécrivent chacun la leur par-dessus : deux
//      entrées sur trois disparaissent, et la piste d'initiative n'affiche
//      qu'un seul personnage ;
//    - deux postes terminent le même tour, la file avance de deux crans et le
//      combattant suivant ne joue jamais ;
//    - deux postes franchissent la fin d'un round, la régénération et le
//      décompte des états tombent deux fois.
//
//  Une transaction Firestore sérialise lecture et écriture : le second poste
//  relit ce que le premier vient d'écrire au lieu de l'écraser.
//
//  "modifier" reçoit les données à jour et renvoie soit null (rien à faire),
//  soit { maj, resultat } — les champs à écrire, et ce que l'appelant veut
//  récupérer. Les écritures qui ne concernent PAS le document de partie
//  (fatigue d'un combattant, états) restent en dehors : une transaction
//  Firestore exige que toutes ses lectures précèdent ses écritures, et se
//  rejoue parfois plusieurs fois — on ne veut pas d'effet de bord là-dedans.
// =========================================================================
//  ÉCRIRE UN PION SANS TOUCHER AUX AUTRES
// =========================================================================
//  Le plateau garde tous les pions dans une seule carte, "Tokens". Sept
//  endroits l'envoyaient ENTIÈRE à chaque déplacement — la copie locale du
//  poste qui bouge, avec sa vision possiblement périmée des autres pions. À
//  trois postes, celui qui déplace son héros renvoyait donc au passage la
//  vieille position d'une créature qu'un autre venait de faire avancer : le
//  pion revenait en arrière, puis repartait d'un bond à la notification
//  suivante. On n'écrit plus que la case du pion concerné.
//  ⚠️ setDoc NE COMPREND PAS LES CHEMINS POINTÉS. Écrire {"Tokens.abc": pion}
//  ne range PAS le pion sous "Tokens" : cela crée un champ de premier niveau qui
//  s'appelle littéralement "Tokens.abc". Seul updateDoc (et tx.update) découpe la
//  clé sur les points. Le pion partait donc en base... à côté de la carte des
//  pions, que personne ne relisait jamais : les jetons ne s'affichaient plus.
//  On envoie donc un objet réellement imbriqué, que {merge:true} fusionne case
//  par case sans toucher aux autres pions.
//  Le dernier argument peut être une ANNONCE de trajet ({idToken, timestamp}) :
//  elle part alors dans la même écriture que la case d'arrivée. C'est ce qui
//  permet aux autres postes de reconnaître un pion qui va marcher, et de ne pas
//  le téléporter en attendant l'ordre d'animer — qui, lui, voyage par un autre
//  document et peut très bien arriver après.
window.enregistrerPionsVTT = async function(...idsTokens) {
    if (!window.ID_PARTIE_COURANTE || idsTokens.length === 0) return;

    let annonce = null;
    if (idsTokens.length > 0 && idsTokens[idsTokens.length - 1]
        && typeof idsTokens[idsTokens.length - 1] === "object") {
        annonce = idsTokens.pop();
    }
    if (idsTokens.length === 0) return;

    const pions = {};
    idsTokens.forEach(id => {
        const pion = (window.TOKENS_VTT_DATA || {})[id];
        if (pion) pions[id] = pion;
    });
    if (Object.keys(pions).length === 0) return;

    const maj = { Tokens: pions };
    if (annonce) maj.Mouvement_En_Cours = annonce;

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), maj, { merge: true });
    } catch (e) {
        console.error("Enregistrement du pion :", e);
    }
};

// Réparation des parties déjà abîmées : les pions écrits à plat ("Tokens.abc"
// en champ de premier niveau) sont remis à leur place dans la carte "Tokens",
// puis le champ bancal est effacé. Le nom du champ contient un point : il faut
// passer par un FieldPath d'un seul segment, sinon updateDoc le relit comme un
// chemin et supprime le vrai pion.
window.MIGRATION_PIONS_EN_COURS = false;
window.reparerPionsAPlat = async function(data) {
    if (window.MIGRATION_PIONS_EN_COURS || !window.ID_PARTIE_COURANTE) return false;
    const champsAPlat = Object.keys(data || {}).filter(cle => cle.startsWith("Tokens."));
    if (champsAPlat.length === 0) return false;

    window.MIGRATION_PIONS_EN_COURS = true;
    const recuperes = {};
    champsAPlat.forEach(cle => {
        const pion = data[cle];
        const id = cle.slice("Tokens.".length);
        if (id && pion && pion.q !== undefined && pion.r !== undefined) recuperes[id] = pion;
    });

    try {
        const ref = doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
        if (Object.keys(recuperes).length > 0) {
            await setDoc(ref, { Tokens: recuperes }, { merge: true });
        }
        const paires = [];
        champsAPlat.forEach(cle => paires.push(new FieldPath(cle), deleteField()));
        await updateDoc(ref, ...paires);
        console.log(`🧰 ${champsAPlat.length} pion(s) mal rangé(s) remis dans la carte des pions.`);
    } catch (e) {
        console.error("Réparation des pions à plat :", e);
    } finally {
        window.MIGRATION_PIONS_EN_COURS = false;
    }
    return true;
};

// =========================================================================
//  QUI DOIT ENCORE JOUER ? — LA SEULE QUESTION QUI COMPTE À TROIS POSTES
// =========================================================================
//  Cinq endroits décidaient du passage en Résolution, et TOUS lisaient
//  window.PERSOS_PARTIE : la liste LOCALE du poste qui écrit. Trois appareils,
//  trois réponses. Pire, deux règles cohabitaient pour la même question — ici
//  « statut !== Mort », là « estCombattantMort() » — et un héros à zéro point
//  de vie n'est jamais marqué "Mort" en base : il comptait donc comme vivant
//  d'un côté, à terre de l'autre. Et un combattant pas encore chargé sur un
//  poste (p introuvable) comptait comme mort, ce qui faisait basculer la phase
//  trop tôt : le joueur qui n'avait pas encore choisi voyait son deck grisé et
//  ne pouvait plus rien cliquer de tout le combat.
//
//  Désormais la réponse ne sort QUE du document de partie, relu dans la
//  transaction. Deux listes, et le même verdict sur les trois écrans :
//    Combattants_Hors_Jeu  — ceux qui ne joueront plus (à terre)
//    Ont_Joue_Ce_Round     — ceux qui ont déjà posé leur carte
window.combattantsAttendus = function(data) {
    const horsJeu = new Set((data && data.Combattants_Hors_Jeu) || []);
    return ((data && data.Ordre_Initiative) || []).filter(id => !horsJeu.has(id));
};

// La file passée en argument est celle de la transaction en cours, qui contient
// déjà la carte qu'on est en train d'inscrire.
window.toutLeMondeAJoue = function(data, fileEnCours) {
    const attendus = window.combattantsAttendus(data);
    if (attendus.length === 0) return false;
    const aJoue = new Set((data && data.Ont_Joue_Ce_Round) || []);
    (fileEnCours || (data && data.File_Attente_Combat) || []).forEach(f => aJoue.add(f.idPersonnage));
    return attendus.every(id => aJoue.has(id));
};

// Un combattant vient de poser sa carte : on le note, pour que la file puisse
// se vider pendant la résolution sans qu'on oublie qu'il a joué.
window.avecCarteJouee = function(data, idPersonnage) {
    const aJoue = new Set((data && data.Ont_Joue_Ce_Round) || []);
    aJoue.add(idPersonnage);
    return [...aJoue];
};

// LA MISE À JOUR DE « QUI EST À TERRE », convergente par construction.
//  Deux règles, et elles comptent autant l'une que l'autre :
//
//  1. Chaque poste ne juge QUE les combattants qu'il connaît. Un combattant pas
//     encore chargé n'est jamais déclaré à terre, si bien qu'un poste en retard
//     ne peut plus faire basculer la phase à la place des autres.
//  2. LA LISTE NE FAIT QUE GRANDIR pendant un combat. Sans cela, un poste dont
//     la fiche est en retard voit le tombé encore debout et le retire ; le
//     poste d'à côté le remet ; et ainsi de suite — un va-et-vient d'écritures
//     à chaque notification, précisément le genre de bavardage qui saccade les
//     déplacements. Un combattant à terre le reste donc jusqu'à la
//     réinitialisation du combat, qui vide la liste.
//
//     J'AI ESSAYÉ L'INVERSE, ET C'ÉTAIT PIRE. Faire sortir de la liste celui
//     qu'on voit debout paraît symétrique, mais « je le vois debout » peut
//     vouloir dire « ma fiche est périmée » : le va-et-vient revient aussitôt.
//     Le vrai problème était ailleurs — voir la règle 3.
//
//  3. ON NE JUGE PAS PENDANT UNE RÉINITIALISATION. C'est là qu'était le bug qui
//     a coûté à Nico une rencontre entière : en remettant le combat à zéro, les
//     fiches passent une fraction de seconde à zéro point de vie avant de
//     recevoir leurs valeurs neuves. Les deux héros entraient alors dans la
//     liste, n'en sortaient plus, et finDeTourCombat les RAYAIT DE LA FILE
//     D'INITIATIVE : la rencontre suivante se jouait sans eux, la file se vidait
//     après le dernier monstre, et personne ne pouvait jouer son tour.
//     Pendant une réinitialisation, cette fonction ne juge donc personne.
//
//  4. LE CERVEAU A LE DERNIER MOT, quand il parle. `idsATerre` porte les
//     combattants que l'ÉTAT DU COMBAT déclare tombés, et ceux-là entrent sans
//     autre examen : c'est la vérité partagée, la même sur les trois écrans.
//
//     Ce n'est pas un raffinement, c'est ce qui manquait. Cette fonction ne
//     s'appelait plus que depuis `recomposerCombattants`, réveillée par une
//     notification des documents Personnages/Monstres — documents qui ne
//     reçoivent plus une écriture de points de vie depuis que le combat vit
//     dans l'état du cerveau. Personne ne constatait donc plus une chute, la
//     liste restait vide, et `toutLeMondeAJoue` attendait éternellement la
//     carte d'un mort : le combat se figeait en préparation dès la première
//     créature tuée. Le cerveau appelle maintenant ici (voir `rafraichir`,
//     regime_cerveau.js) avec ce qu'il voit, et ce qu'il voit fait foi.
//
//  Trois postes qui constatent la même chute écrivent la même liste : la
//  deuxième écriture ne voit plus de différence et n'a pas lieu.
window.synchroniserCombattantsHorsJeu = async function(idsATerre) {
    if (!window.ID_PARTIE_COURANTE) return false;
    // Le combat est en train d'être remis à zéro : les fiches traversent un
    // instant où elles valent zéro point de vie sans que personne ne soit tombé.
    // On ne juge rien tant que la poussière n'est pas retombée.
    if (window.REINITIALISATION_COMBAT_EN_COURS) return false;
    const data = window.PARTIE_DATA || {};
    const ordre = data.Ordre_Initiative || [];
    if (ordre.length === 0) return false;
    if (typeof window.estCombattantMort !== "function") return false;

    const connus = new Set((window.PERSOS_PARTIE || []).map(p => p.idPersonnage));
    const voulue = new Set(data.Combattants_Hors_Jeu || []);
    let change = false;

    ordre.forEach(id => {
        if (!connus.has(id)) return;              // pas encore chargé : on ne juge pas
        if (window.estCombattantMort(id) && !voulue.has(id)) { voulue.add(id); change = true; }
    });

    // Ceux que le cerveau déclare à terre : pas de filtre « est-il chargé
    // ici ? », la question ne se pose pas. L'état du combat est la même chose
    // pour tout le monde.
    (idsATerre || []).forEach(id => {
        if (!id || voulue.has(id) || !ordre.includes(id)) return;
        voulue.add(id); change = true;
    });

    // Seul retrait admis : un combattant qui n'est plus dans l'ordre
    // d'initiative. Il a été effacé du combat, il n'y a plus rien à attendre
    // de lui — et cette information-là, elle, vient de la partie partagée.
    voulue.forEach(id => {
        if (!ordre.includes(id)) { voulue.delete(id); change = true; }
    });

    if (!change) return false;
    await window.modifierPartie(() => ({ maj: { Combattants_Hors_Jeu: [...voulue] } }));
    return true;
};

// MODIFIER LA PARTIE, ET SAVOIR SI ÇA A MARCHÉ.
//
// Cette fonction rendait `null` dans DEUX cas qui n'ont rien à voir : « il n'y
// avait rien à faire » et « l'écriture a échoué ». Ses appelants ne pouvaient
// pas les distinguer, et finDeTourCombat prenait donc un échec pour un « un
// autre poste s'en est chargé » : il rendait la main, la file d'initiative
// n'avançait pas, et le combat restait planté sur une créature qui avait déjà
// joué. C'est le « le tour d'un ennemi vient d'être complètement passé ».
//
// Le document de la partie est le plus disputé du jeu. Une transaction qui se
// fait doubler rend « failed-precondition » : ce n'est pas une panne, c'est une
// invitation à recommencer. On recommence donc, avec une attente qui s'allonge
// et un grain de hasard pour que deux postes ne repartent pas ensemble.
//
// LE COUPE-CIRCUIT DU DOCUMENT DE PARTIE.
//
// Une trace de combat a montré ceci : le document Systeme_Parties/<id> reçoit
// des écritures venues de DEUX endroits à la fois — une carte choisie ou un
// repos long ici, un verrou d'IA repris dans monstres_ia.js — et les deux
// retentent chacun de leur côté sur un « failed-precondition ». Tant que
// Firestore refuse juste une transaction doublée, ce n'est pas grave : la
// suivante passe. Mais quand le document devient si chaud qu'il rend
// « resource-exhausted » (HTTP 429 — le quota d'écritures est dépassé, pas
// juste une course perdue), retenter dans la seconde ne fait qu'ajouter une
// écriture de plus à une pile qui déborde déjà : les deux boucles s'entretenaient
// l'une l'autre sans jamais laisser le quota respirer, et le combat restait
// planté plus d'une minute.
// On pose donc un coupe-circuit PARTAGÉ entre les deux fichiers (via window,
// comme modifierPartie l'est déjà pour monstres_ia.js) : quand ce document
// rend resource-exhausted, tout le monde — nous y compris, la prochaine fois
// qu'on repasse par ici — attend la fin de la pause avant de retenter quoi
// que ce soit dessus.
window.PAUSE_ECRITURE_PARTIE = window.PAUSE_ECRITURE_PARTIE || 0;

window.attendreCoupeCircuitPartie = async function() {
    const reste = window.PAUSE_ECRITURE_PARTIE - Date.now();
    if (reste > 0) await new Promise(r => setTimeout(r, reste));
};

// Une seconde de base, doublée à chaque essai, avec du hasard pour que deux
// postes ne relèvent pas le coupe-circuit à la même milliseconde.
function leverCoupeCircuitPartie(essai) {
    const pause = 1000 * Math.pow(2, essai - 1) + Math.floor(Math.random() * 400);
    window.PAUSE_ECRITURE_PARTIE = Date.now() + pause;
    return pause;
}

// modifierPartieOuEchec rend { ok, resultat } : `ok` faux veut dire que RIEN
// n'a été écrit, et que l'appelant doit s'en occuper.
window.modifierPartieOuEchec = async function(modifier) {
    if (!window.ID_PARTIE_COURANTE) return { ok: false, resultat: null };
    const ESSAIS = 4;
    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
    let derniere = null;
    for (let essai = 1; essai <= ESSAIS; essai++) {
        await window.attendreCoupeCircuitPartie();
        try {
            const resultat = await runTransaction(db, async (tx) => {
                const snap = await tx.get(partieRef);
                if (!snap.exists()) return null;
                const sortie = modifier(snap.data());
                if (!sortie) return null;
                if (sortie.maj) tx.update(partieRef, sortie.maj);
                return sortie.resultat !== undefined ? sortie.resultat : true;
            });
            return { ok: true, resultat };
        } catch (e) {
            derniere = e;
            if (e && e.code === "resource-exhausted") {
                const pause = leverCoupeCircuitPartie(essai);
                if (typeof window.tracerCombat === "function") {
                    window.tracerCombat("⛔", `quota Firestore dépassé sur la partie (essai ${essai})`,
                                        `coupe-circuit levé ${pause} ms`);
                }
            } else if (essai < ESSAIS && typeof window.tracerCombat === "function") {
                const attente = 150 * Math.pow(2, essai - 1) + Math.floor(Math.random() * 120);
                window.tracerCombat("♻️", `écriture de la partie bousculée (essai ${essai})`,
                                    `on retente dans ${attente} ms`);
                await new Promise(r => setTimeout(r, attente));
            }
        }
    }
    console.error("Modification de la partie :", derniere);
    if (typeof window.tracerCombat === "function") {
        window.tracerCombat("❌", "écriture de la partie IMPOSSIBLE",
                            (derniere && derniere.code) || String(derniere));
    }
    return { ok: false, resultat: null };
};

window.modifierPartie = async function(modifier) {
    return (await window.modifierPartieOuEchec(modifier)).resultat;
};

// =========================================================================
//  IVALIS - MODULE DE COMBAT (INTERFACE DE BASE)
// =========================================================================

window.COMBAT_PERSOS_JOUEUR = [];

// =========================================================================
//  GESTION DU POPUP DE PRÉ-RENCONTRE
// =========================================================================

window.ouvrirPopupRencontre = function() {
    const modale = document.getElementById("modale-pre-combat");
    if (modale) {
        modale.style.display = "flex"; // Utilise flexbox pour centrer le contenu
    }
};

window.fermerPopupRencontre = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const modale = document.getElementById("modale-pre-combat");
    if (modale) {
        modale.style.display = "none";
    }
};

window.validerPopupRencontre = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    // 1. On ferme le popup
    window.fermerPopupRencontre();
    // 2. On lance l'interface de combat
    window.ouvrirCombat();
};

window.COMBAT_INDEX_PERSO = 0;

window.ouvrirCombat = function() {
    if (typeof window.fermerToutesLesFenetres === "function") {
        window.fermerToutesLesFenetres();
    }

    const menuLat = document.getElementById('menu-lateral');
    const menuNav = document.getElementById('menu-navigation-bas');
    if (menuLat) menuLat.style.display = 'none';
    if (menuNav) menuNav.style.display = 'none';

    const btnFermer = document.getElementById('btn-fermer-combat');
    if (btnFermer) btnFermer.style.display = 'block';

    const fenetreCombat = document.getElementById('fenetre-combat');
    if (fenetreCombat) fenetreCombat.style.display = 'block';

    // Aucune des scenes surveillees par cette veille n'est visible en combat : on la coupe
    if (typeof window.suspendreSynchroCanvas === "function") window.suspendreSynchroCanvas();

    // Annonce le tour actuel dès l'ouverture (Tour 1 au lancement)
    if (typeof window.verifierChangementTour === "function") {
        window.verifierChangementTour((window.PARTIE_DATA && window.PARTIE_DATA.Tour_Combat) || 1);
    }

    // On charge juste l'UI de gauche
    window.initialiserPersosCombat();
    // Le filet : toutes les deux secondes, l'écran se remet d'accord avec ce
    // que le poste a déjà reçu. Aucune requête réseau, aucun quota consommé.
    if (typeof window.demarrerTicAffichageCombat === "function") window.demarrerTicAffichageCombat();
    
    // Le plateau a déjà été chargé en arrière-plan, on s'assure juste qu'il est bien centré
    if (typeof window.centrerPlateau === "function") {
        window.centrerPlateau();
    }

    // Nouveau combat : les deux repères d'apparition manquent, on les demande.
    window.APPARITION_REPORTEE = false;
    if (typeof window.verifierPointsApparition === "function") window.verifierPointsApparition();
};

window.fermerCombat = function() {
    if (typeof window.jouerSonSurvolParchemin === "function") {
        window.jouerSonSurvolParchemin();
    }
    if (typeof window.fermerMenusCoulissantsCombat === "function") {
        window.fermerMenusCoulissantsCombat();
    }
    // Désactive la gomme sans sauvegarder (le MJ doit valider via le losange)
    if (window.VTT_MODE_EFFACEMENT) {
        window.VTT_MODE_EFFACEMENT = false;
        isPaintingVTT = false;
        const btnGomme = document.getElementById("btn-gomme-vtt");
        if (btnGomme) btnGomme.classList.remove("actif");
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    }
    if (window.VTT_MODE_MURS) {
        window.VTT_MODE_MURS = false;
        isPaintingVTT = false;
        const btnMurs = document.getElementById("btn-murs-vtt");
        if (btnMurs) btnMurs.classList.remove("actif");
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    }
    if (window.VTT_MODE_DIFFICILE) {
        window.VTT_MODE_DIFFICILE = false;
        isPaintingVTT = false;
        const btnDifficile = document.getElementById("btn-difficile-vtt");
        if (btnDifficile) btnDifficile.classList.remove("actif");
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    }
    if (typeof window.fermerToutesLesFenetres === "function") {
        window.fermerToutesLesFenetres();
    }

    if (typeof window.arreterPlacementApparition === "function") window.arreterPlacementApparition();

    // On quitte le combat : la veille redevient utile pour les autres scenes
    if (typeof window.arreterTicAffichageCombat === "function") window.arreterTicAffichageCombat();
    if (typeof window.reprendreSynchroCanvas === "function") window.reprendreSynchroCanvas();
};

// LES HÉROS D'UN POSTE, ET RIEN D'AUTRE.
//
// UNE ILLUSION N'EST PAS UN HÉROS, même si elle porte l'ID_Joueur de celui qui
// l'a lancée — et elle le porte à dessein : c'est ce qui permet d'effacer ses
// leurres avec lui. Mais le simple filtre « même joueur » la faisait entrer dans
// la liste des héros de ce poste, et comme elle n'est pas une créature non plus
// (estMonstre est faux sur un leurre), plus rien ne l'arrêtait : le bloc du
// héros basculait sur le leurre — son avatar, son nom, et ses jauges à 1 point
// de vie sur 1, sans énergie. Signalé en partie : « quand j'ai créé une
// illusion, l'avatar, le nom et les jauges ont changé au-dessus de mon bouton
// fin de tour ».
//
// Une illusion est un leurre posé sur le plateau : le moteur doit la voir dans
// PERSOS_PARTIE pour qu'on puisse la viser et la faire tomber, mais elle n'a de
// fiche à montrer nulle part. Une seule lecture répond donc à « qui sont mes
// héros ? », et tout ce qui se pose la question passe par elle.
window.herosDuJoueur = function(idJoueur) {
    if (!idJoueur) return [];
    return (window.PERSOS_PARTIE || [])
        .filter(p => p && p.idJoueur === idJoueur && !p.estMonstre && !p.estIllusion);
};

window.initialiserPersosCombat = function() {
    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");

    window.COMBAT_PERSOS_JOUEUR = window.herosDuJoueur(currentUserId);

    window.COMBAT_INDEX_PERSO = 0;
    window.afficherPersoCombatActuel();
};

// LES FLÈCHES ◄ ► ONT DISPARU AVEC LE PANNEAU, et changerPersoCombat avec
// elles : c'étaient ses deux seuls appelants. Un joueur n'aura bientôt plus
// qu'un personnage, et d'ici là c'est le premier de sa liste qui joue.

window.afficherPersoCombatActuel = function() {
    const liste = document.getElementById("combat-liste-competences");

    if (window.COMBAT_PERSOS_JOUEUR.length === 0) {
        if (liste) liste.innerHTML = "";
        // L'aperçu du repos long est lié au héros : sans héros, il s'efface.
        const divReposVide = document.getElementById("apercu-repos-long-ui");
        if (divReposVide) {
            divReposVide.style.opacity = "0";
            divReposVide.style.left = "50px";
        }
        return;
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    window.chargerCompetencesCombat(persoActuel.idPersonnage, persoActuel.couleur);

    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
    window.actualiserEtatCarteCombat();
};

// =========================================================================
//  CHARGEMENT ET AFFICHAGE DU DECK (ZÉRO LATENCE)
// =========================================================================

// =========================================================================
//  LE VOLET DES COMPÉTENCES
// =========================================================================
//  Les bannières pendaient en permanence dans le panneau latéral gauche. Elles
//  pendent maintenant d'une lanière de cuir qui descend du haut de l'écran
//  quand on la demande, et remonte hors champ le reste du temps : le plateau
//  reste dégagé pour viser et se déplacer.
//
//  LES BANNIÈRES NE BOUGENT PAS D'UN PIXEL, et c'est volontaire : on DÉMÉNAGE
//  l'élément `combat-liste-competences` au lieu d'en fabriquer un second. Tout
//  ce qui le peuple (chargerCompetencesCombat), le lit (les boîtes de clic, les
//  aperçus de carte) ou l'écoute continue de marcher sans rien savoir du volet.
//  Deux listes concurrentes, elles, auraient divergé au premier tour.
window.VOLET_COMPETENCES_OUVERT = false;

// LA CARTE EST RETENUE : LE VOLET S'EN VA EN ENTIER.
//
// Quand un joueur retenait sa carte, on faisait simplement passer le deck à
// l'opacité zéro. Du temps du panneau latéral, c'était tout ce qu'il y avait à
// faire. Avec le volet, ça donnait une scène bancale : les bannières
// s'évaporaient et la lanière de cuir restait pendue là, toute seule, sans rien
// au bout.
//
// Le volet remonte donc entièrement, avec son animation. Et les bannières
// dessous passent en « verrouillé » (grisées, éteintes) plutôt qu'invisibles :
// si le joueur rouvre le volet, il voit son deck, et il voit qu'il est fermé.
window.rangerDeckApresChoix = function() {
    const deck = document.getElementById("combat-liste-competences");
    if (deck) {
        deck.style.transition = "opacity 0.3s ease, filter 0.3s ease";
        deck.style.opacity = "0.4";
        deck.style.filter = "grayscale(100%)";
        deck.style.pointerEvents = "none";
    }
    if (typeof window.fermerVoletCompetences === "function") window.fermerVoletCompetences();
};

// Le pendant exact, pour les chemins qui rendent la main au joueur (une erreur
// réseau, un tour qui recommence) : le deck se rallume et le volet redescend.
window.rouvrirDeckApresEchec = function() {
    const deck = document.getElementById("combat-liste-competences");
    if (deck) {
        deck.style.opacity = "1";
        deck.style.filter = "none";
        deck.style.pointerEvents = "auto";
    }
    if (typeof window.toggleVoletCompetences === "function") window.toggleVoletCompetences(true);
};

// Le déménagement n'a lieu qu'une fois, et seulement si les deux éléments sont
// là : une page à moitié chargée ne doit pas perdre la liste en route.
//
// Posée sur `window` À DESSEIN. C'est chargerCompetencesCombat qui l'appelle, et
// plusieurs bancs extraient cette fonction-là de combat.js PAR SON NOM pour la
// faire tourner seule. Une fonction locale les aurait fait mourir sur un
// ReferenceError — c'est arrivé trois fois déjà, avec trois voisines
// différentes. Sur `window` et appelée avec sa garde, elle se contente de ne
// rien faire là où le volet n'existe pas.
window.installerVoletCompetences = function() {
    window.calerVoletReplie();
    const hote = document.getElementById("volet-bannieres");
    const liste = document.getElementById("combat-liste-competences");
    if (!hote || !liste || liste.parentNode === hote) return !!hote;
    hote.appendChild(liste);
    // Dans le panneau, la liste était posée par le flux ; ici elle occupe toute
    // la largeur de son hôte, qui est calé sur son ancienne place.
    liste.style.marginTop = "0px";
    liste.style.paddingLeft = "0px";
    return true;
};

// LA POINTE DE LA LANIÈRE DÉPASSE, ET C'EST ELLE QU'ON TIRE.
//
// Le volet remontait ENTIÈREMENT hors champ : rien ne disait plus qu'il
// existait, et le seul moyen de le rappeler était le petit bouton rond du
// bandeau. On laisse donc pendre le bout de la lanière en haut de l'écran —
// c'est un objet qu'on tire, pas un menu qu'on ouvre.
//
// COMBIEN FAUT-IL REMONTER ? Ça ne peut pas s'écrire en dur. La lanière est une
// image dont on ne fixe que la LARGEUR : sa hauteur dépend de ses proportions,
// et un chiffre écrit ici serait faux le jour où l'image change. On la mesure
// donc, et on en déduit le décalage : remonter tout sauf la pointe.
//
// Le résultat est posé en variable CSS parce que c'est une ANIMATION qui s'en
// sert, avec ses rebonds — et une animation ne se calcule pas en JavaScript
// sans perdre justement ces rebonds. La valeur de repli d'origine (-115%) reste
// écrite comme secours dans la feuille de style : un moteur qui ne saurait pas
// lire une variable dans une image-clé retrouverait l'ancien comportement au
// lieu d'un volet coincé à mi-hauteur.
// 26 px, c'était la longueur d'un ongle : sur l'iPad de Nico, on ne voyait
// presque rien pendre, et personne n'avait l'idée de tirer dessus. On en a
// laissé pendre presque trois fois plus, puis encore un peu plus — de quoi
// reconnaître un bout de cuir à l'autre bout de la table, sans pour autant
// montrer les bannières.
window.POINTE_LANIERE_VISIBLE = 100;   // ce qui dépasse, en pixels d'écran

window.calerVoletReplie = function() {
    const contenu = document.getElementById("volet-contenu");
    const laniere = document.getElementById("volet-laniere");
    if (!contenu || !laniere) return false;

    // Pas encore chargée : on repassera quand elle le sera (voir plus bas).
    const hauteur = laniere.getBoundingClientRect().height;
    if (hauteur <= 0) return false;

    // La lanière est posée à `top` dans le contenu ; son bas se trouve donc à
    // `top + hauteur`. Pour qu'il reste `POINTE_LANIERE_VISIBLE` pixels sous le
    // bord haut de l'écran, il faut remonter le contenu d'autant.
    const haut = parseFloat(getComputedStyle(laniere).top) || 0;
    const replie = window.POINTE_LANIERE_VISIBLE - (haut + hauteur);
    contenu.style.setProperty("--volet-replie", Math.round(replie) + "px");
    return true;
};

// LE REPOS LONG SE CHOISIT COMME UNE CARTE. Pas d'aperçu en grand — il n'a
// aucun effet à détailler — mais le même geste : on le retient, le bouton fin
// de tour passe sur « choisir compétence », et c'est lui qui l'envoie.
window.choisirReposLongDansVolet = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD();

    document.querySelectorAll(".banniere-carte-combat").forEach(el => { el.dataset.actif = "false"; });
    const banniere = document.getElementById("combat-carte-REPOS_LONG");
    if (banniere) banniere.dataset.actif = "true";

    // Le repos ne coûte rien : la jauge d'énergie ne montre aucune réserve.
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);

    window.CARTE_APERCU = { idCarte: "REPOS_LONG", choisissable: true };
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
};

window.toggleVoletCompetences = function(forcer) {
    const contenu = document.getElementById("volet-contenu");
    if (!contenu || !window.installerVoletCompetences()) return;

    const ouvrir = (forcer === undefined) ? !window.VOLET_COMPETENCES_OUVERT : !!forcer;
    if (ouvrir === window.VOLET_COMPETENCES_OUVERT) return;
    window.VOLET_COMPETENCES_OUVERT = ouvrir;

    // LE SON APRÈS LES GARDES, ET PAS AVANT. Le volet est désormais refermé par
    // du code autant que par un doigt — un choix de carte, un ciblage, un
    // déplacement, et chaque rafraîchissement qui repasse par là. En tête de
    // fonction, le clic retentissait à chaque appel, même quand le volet était
    // déjà replié et qu'il n'y avait rien à animer.
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    contenu.classList.remove("volet-ouvre", "volet-ferme");
    // Une animation relancée sur le même élément ne rejoue pas toute seule : il
    // faut que le navigateur reprenne son souffle entre les deux classes.
    void contenu.offsetWidth;
    contenu.classList.add(ouvrir ? "volet-ouvre" : "volet-ferme");

    // Replié, le volet ne doit rien intercepter : il couvre tout le flanc
    // gauche de l'écran, y compris le plateau qu'on veut cliquer.
    const bannieres = document.getElementById("volet-bannieres");
    if (bannieres) bannieres.style.pointerEvents = ouvrir ? "auto" : "none";

    // LA LANIÈRE, C'EST L'INVERSE : elle ne prend les clics que REPLIÉE.
    // Sa pointe est alors la poignée qu'on tire. Déployée, elle passe au-dessus
    // de la première bannière — la laisser cliquable lui volerait son clic, et
    // le joueur croirait que sa technique ne répond pas.
    const laniere = document.getElementById("volet-laniere");
    if (laniere) laniere.style.pointerEvents = ouvrir ? "none" : "auto";

    // En se refermant, il emporte l'aperçu de carte ouvert : sinon la carte
    // reste seule au milieu de l'écran, sans la bannière qui l'a appelée.
    if (!ouvrir && window.CARTE_EN_APERCU && typeof window.masquerApercuCarteHD === "function") {
        window.masquerApercuCarteHD();
    }
};

// LE VOLET S'EFFACE DEVANT LE JEU. Dès qu'on vise une cible ou qu'on trace un
// chemin, le plateau doit être libre : la lanière remonte d'elle-même, et le
// clic suivant sur la carte est un clic de ciblage, pas une fermeture.
window.fermerVoletCompetences = function() {
    if (!window.VOLET_COMPETENCES_OUVERT) return;
    window.toggleVoletCompetences(false);
};

window.chargerCompetencesCombat = function(idPersonnage, couleur) {
    // LE DÉMÉNAGEMENT SE FAIT AVANT LE REMPLISSAGE, jamais après. Sans cette
    // ligne, les bannières restaient dans le panneau latéral jusqu'au premier
    // clic sur le bouton du volet — visibles là où elles ne doivent plus être,
    // et absentes du volet qu'on vient d'ouvrir.
    if (typeof window.installerVoletCompetences === "function") window.installerVoletCompetences();
    const listeDiv = document.getElementById("combat-liste-competences");
    
    try {
        const persoActuel = window.PERSOS_PARTIE.find(p => p.idPersonnage === idPersonnage);
        if (!persoActuel) return;
        
        window.COMBAT_FATIGUE_MAX = window.fatigueMaxCombattant(persoActuel);
        window.COMBAT_FATIGUE_ACTUELLE = persoActuel.fatigueActuelle !== undefined ? parseInt(persoActuel.fatigueActuelle) : window.COMBAT_FATIGUE_MAX;
        
        window.COMBAT_PV_MAX = (parseInt(persoActuel.PV_Max) || 1) + (parseInt(persoActuel.Dev_Mod_PV) || 0);
        window.COMBAT_PV_ACTUELS = persoActuel.PV_Actuels !== undefined ? parseInt(persoActuel.PV_Actuels) : window.COMBAT_PV_MAX;

        window.mettreAJourJaugeFatigue(0);
        window.mettreAJourJaugePV();

        const deck = persoActuel.deckEquipe || [];

        if (deck.length === 0) {
            listeDiv.innerHTML = "<div style='color:#a89f91; font-family: Almendra, serif; font-size:16px; margin-top: 10px; font-style: italic;'>Aucune compétence mémorisée.</div>";
            return;
        }

        const competencesDuPerso = window.CACHE_COMPETENCES_GLOBAL[idPersonnage] || {};
        let competencesToRender = [];
        
        if (!window.COMPETENCES_CACHE) window.COMPETENCES_CACHE = {};

        deck.forEach(idCarte => {
            if (competencesDuPerso[idCarte]) {
                const data = competencesDuPerso[idCarte];
                window.COMPETENCES_CACHE[idCarte] = data; 
                competencesToRender.push({ id: idCarte, data: data });
            }
        });

        competencesToRender.sort((a, b) => (b.data.Initiative || 0) - (a.data.Initiative || 0));
        window.COULEUR_PERSO_COURANT = couleur || "#4a1c1c";

        let htmlDeck = "";
        const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
        const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

        const ESPACEMENT_BANNIERES = -45;

        competencesToRender.forEach(comp => {
            const data = comp.data;
            const idCarte = comp.id;
            const titre = data.Nom || "Technique";
            const initiative = data.Initiative || 0;
            const coutFatigue = parseInt(data.Fatigue) || 0;
            const estEpuise = coutFatigue > window.COMBAT_FATIGUE_ACTUELLE;

            // L'arme en main peut interdire la technique. Une carte inadaptée
            // reste visible — le joueur doit comprendre POURQUOI elle ne part
            // pas — mais elle s'assombrit et annonce sa raison au survol.
            const persoCarte = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
            const blocageArme = typeof window.raisonBlocageCarte === "function"
                ? window.raisonBlocageCarte(persoCarte, data.Arme) : null;

            const urlCadre = (estEpuise || blocageArme) ? IMAGE_CADRE_EPUISE : IMAGE_CADRE_NORMAL;
            const classeEpuise = (estEpuise || blocageArme) ? "banniere-epuisee" : "";
            const couleurTexte = (estEpuise || blocageArme) ? "#888888" : "#e0d0b0";
            const titreSurvol = blocageArme ? ` title="${blocageArme.replace(/"/g, "&quot;")}"` : "";

            htmlDeck += `
            <div style="position: relative; height: 100px; margin-bottom: ${ESPACEMENT_BANNIERES}px; transition: margin 0.2s ease;">
                <div onclick="event.stopPropagation(); window.gererClicCarteCombat('${idCarte}')"${titreSurvol}
                     onmouseover="document.getElementById('combat-carte-${idCarte}').style.transform='scale(0.75) translateX(15px)'; document.getElementById('combat-carte-${idCarte}').style.zIndex='100';"
                     onmouseout="document.getElementById('combat-carte-${idCarte}').style.transform='scale(0.75) translateX(0px)'; document.getElementById('combat-carte-${idCarte}').style.zIndex='2';"
                     style="position: absolute; top: 35px; left: 0; width: 335px; height: 40px; z-index: 10; cursor: pointer;">
                </div>

                <div id="combat-carte-${idCarte}" class="banniere-carte-combat ${classeEpuise}" data-actif="false" data-card-id="${idCarte}"
                     style="position: absolute; top: 0; left: 0; width: 450px; height: 160px; pointer-events: none; transition: filter 0.2s ease, transform 0.2s ease; transform: scale(0.75); transform-origin: left top; z-index: 2;">
                     
                    <div style="position: absolute; top: 49px; bottom: 58px; left: 63px; right: 7px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                    <div id="cadre-combat-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${urlCadre}'); background-size: contain; background-position: left center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6)); transition: background-image 0.2s ease;"></div>
                    <div class="texte-init-banniere" style="position: absolute; top: 44%; transform: translateY(-50%); left: 6px; width: 69px; text-align: center; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black;">${initiative}</div>
                    <div class="texte-nom-banniere titre-auto-reduit" data-taille-max="17" style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titre}</div>
                </div>
            </div>
            `;
        });

        // LE REPOS LONG EST UNE TECHNIQUE COMME LES AUTRES, désormais.
        //
        // Il vivait sur son propre bouton du HUD — celui-là même qui ouvre et
        // referme maintenant le volet. Le laisser sans place, c'était supprimer
        // une action de jeu ; le cacher derrière le bouton fin de tour, c'était
        // en charger un sixième sens. Il prend donc la dernière bannière : on le
        // choisit d'un clic comme une carte, le bouton fin de tour le lance, et
        // la file d'initiative le connaît déjà (idCarte « REPOS_LONG »,
        // initiative 0, affiché ⏳ sur la piste).
        //
        // Il ne coûte rien et ne s'épuise jamais : aucune bannière grisée.
        htmlDeck += `
        <div style="position: relative; height: 100px; margin-bottom: ${ESPACEMENT_BANNIERES}px; transition: margin 0.2s ease;">
            <div onclick="event.stopPropagation(); window.choisirReposLongDansVolet()"
                 title="Repos long — récupère de l'énergie au lieu de lancer une technique"
                 onmouseover="document.getElementById('combat-carte-REPOS_LONG').style.transform='scale(0.75) translateX(15px)'; document.getElementById('combat-carte-REPOS_LONG').style.zIndex='100';"
                 onmouseout="document.getElementById('combat-carte-REPOS_LONG').style.transform='scale(0.75) translateX(0px)'; document.getElementById('combat-carte-REPOS_LONG').style.zIndex='2';"
                 style="position: absolute; top: 35px; left: 0; width: 335px; height: 40px; z-index: 10; cursor: pointer;">
            </div>
            <div id="combat-carte-REPOS_LONG" class="banniere-carte-combat" data-actif="false" data-card-id="REPOS_LONG"
                 style="position: absolute; top: 0; left: 0; width: 450px; height: 160px; pointer-events: none; transition: filter 0.2s ease, transform 0.2s ease; transform: scale(0.75); transform-origin: left top; z-index: 2;">
                <div style="position: absolute; top: 49px; bottom: 58px; left: 63px; right: 7px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                <div id="cadre-combat-REPOS_LONG" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${IMAGE_CADRE_NORMAL}'); background-size: contain; background-position: left center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6)); transition: background-image 0.2s ease;"></div>
                <div class="texte-init-banniere" style="position: absolute; top: 44%; transform: translateY(-50%); left: 6px; width: 69px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black;">⏳</div>
                <div class="texte-nom-banniere titre-auto-reduit" data-taille-max="17" style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Repos long</div>
            </div>
        </div>
        `;

        listeDiv.innerHTML = htmlDeck;
        // Les noms de technique trop longs rétrécissent au lieu d'être coupés.
        if (typeof window.ajusterTitresBannieres === "function") window.ajusterTitresBannieres(listeDiv);

    } catch (e) {
        console.error("Erreur cache :", e);
    }
};

// =========================================================================
//  LES GLOBALES DE VITALITÉ ET D'ÉNERGIE
// =========================================================================
// Le combattant dont ce poste suit les compteurs, tel qu'il est DANS
// PERSOS_PARTIE. Elle s'appelait combattantDuPanneau tant qu'un panneau latéral
// existait pour l'afficher ; le panneau est parti, la question reste la même :
// COMBAT_PERSOS_JOUEUR n'en garde qu'une copie, qui peut avoir vieilli (un
// objet reconstruit par un snapshot), alors que PERSOS_PARTIE porte la fiche
// vivante. On rend donc celle-ci dès qu'on la retrouve.
function combattantCourant() {
    const affiche = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
    if (!affiche) return null;
    return (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === affiche.idPersonnage) || affiche;
}

// =========================================================================
//  LE REDESSIN DE CE QUI EST DÉJÀ À L'ÉCRAN
// =========================================================================
//  Firestore pousse les données sans qu'on ait rien à demander : quand un héros
//  dépense son énergie, les trois postes reçoivent sa fiche dans la seconde.
//  Ce qui manquait, c'est le REDESSIN. Les jauges du panneau gauche n'étaient
//  refaites que par le poste qui agissait ; sur les autres écrans elles
//  restaient sur la valeur d'avant — 48 d'énergie ici, 18 là — jusqu'à ce qu'on
//  change de héros et qu'on revienne, ce qui forçait un redessin.
//
//  Aucune lecture réseau ici : on ne fait que remettre à l'écran ce que le
//  poste sait déjà.
// Les pions dont une animation de marche est en cours sur CE poste, avec la
// date à laquelle chacun s'y est mis (Date.now(), plus jamais "true"). Tant
// qu'un pion y figure ET que cette date est récente, sa case à l'écran est
// celle de l'animation, pas celle qui arrive du réseau.
//
// Pourquoi une date et pas un simple drapeau : sur iPad/Safari, un onglet mis
// en arrière-plan (écran verrouillé, appli changée pendant le tour d'un
// autre joueur) peut geler l'animation en plein trajet — le setTimeout qui
// devait la faire avancer, et donc le "delete" qui la sort de cette liste à
// la fin, ne se rejoue jamais tant que l'onglet dort. Un simple drapeau sans
// date restait alors bloqué à "true" pour de bon : la vraie position du
// pion, elle, continuait d'avancer en base (d'autres tours se jouaient
// pendant ce temps), et au réveil de l'onglet, la PROCHAINE animation de ce
// même pion à se terminer normalement levait enfin le drapeau — laissant
// passer d'un coup une position vieille de plusieurs tours : le
// "téléporte-à-retardement" vu sur iPad, absent sur PC (dont l'onglet actif
// n'est jamais mis en veille de cette façon). La date fait expirer la
// protection toute seule, bien avant que ça arrive.
window.PIONS_EN_MOUVEMENT = window.PIONS_EN_MOUVEMENT || {};

// Le mouvement le plus récemment ANIMÉ sur ce poste. Il sert à reconnaître un
// trajet dont la case d'arrivée est arrivée avant l'ordre d'animer.
window.DERNIER_MOUVEMENT_ANIME = 0;

// LE SEUL REDESSIN AUTORISÉ PENDANT UN COMBAT. appliquerTokensVTT dessine ce
// qu'on lui donne, sans se poser de question : l'appeler avec les cases brutes
// de la base pose chaque pion là où la BASE le croit — donc à l'arrivée d'un
// trajet que cet écran n'a pas encore rejoué. C'était ça, le pion qui « se
// téléporte n'importe où » : pas une animation ratée, un redessin de trop.
// Ici, les cases passent d'abord par positionsProtegees.
window.redessinerPions = function(source) {
    if (typeof window.appliquerTokensVTT !== "function") return;
    const brut = source || window.TOKENS_VTT_DATA || {};
    const mouvement = (window.PARTIE_DATA || {}).Mouvement_En_Cours;
    window.appliquerTokensVTT(window.positionsProtegees(brut, mouvement));
};

window.positionsProtegees = function(tokensRecus, mouvementEnCours) {
    const recus = tokensRecus ? JSON.parse(JSON.stringify(tokensRecus)) : {};
    const locaux = window.TOKENS_VTT_DATA || {};

    // OÙ EST LE PION, VRAIMENT ? Sur l'ÉCRAN — c'est-à-dire dans le data-q /
    // data-r de son élément, que l'animation déplace case par case. On lisait
    // autrefois TOKENS_VTT_DATA, mais celui-ci porte désormais la vérité de la
    // BASE : protéger un pion en le recopiant depuis la base revenait à ne pas
    // le protéger du tout. Pire, l'ancienne version rangeait la position
    // protégée DANS TOKENS_VTT_DATA : la case d'arrivée n'était plus notée
    // nulle part, et le pion revenait à son point de départ dès que le trajet
    // était rejoué. C'était ça, le pion qui « se déplace n'importe où ».
    const garder = (id) => {
        if (!recus[id]) return;
        const div = typeof document !== "undefined" ? document.getElementById("token-" + id) : null;
        if (div && div.dataset && div.dataset.q !== undefined && div.dataset.q !== "") {
            recus[id] = { ...recus[id], q: parseFloat(div.dataset.q), r: parseFloat(div.dataset.r) };
        } else if (locaux[id]) {
            recus[id] = { ...recus[id], q: locaux[id].q, r: locaux[id].r };
        }
    };

    // Aucune animation légitime ne dépasse ce délai (déjà la limite retenue par
    // filerAnimation, app.js) : passé ce temps réel, une protection encore
    // active n'est plus le signe d'une marche en cours, mais d'un poste qui
    // vient de se réveiller après avoir dormi pendant qu'elle tournait.
    const delaiMax = window.DELAI_MAX_ANIMATION_MS || 20000;

    // 1. Les pions dont l'animation tourne en ce moment sur cet écran — sauf si
    //    elle dure depuis trop longtemps pour être encore vraie (voir plus haut).
    Object.entries(window.PIONS_EN_MOUVEMENT || {}).forEach(([id, depuis]) => {
        if (typeof depuis === "number" && (Date.now() - depuis) > delaiMax) return;
        garder(id);
    });

    // 2. Et celui dont le trajet est annoncé mais pas encore joué ICI. La case
    //    d'arrivée voyage dans le plateau, l'ordre d'animer dans la partie :
    //    deux documents, donc aucune garantie d'ordre. L'annonce est écrite
    //    dans la MÊME opération que la case — impossible de recevoir l'une
    //    sans l'autre — ce qui ferme la course pour de bon.
    if (mouvementEnCours && mouvementEnCours.idToken
        && (mouvementEnCours.timestamp || 0) > (window.DERNIER_MOUVEMENT_ANIME || 0)
        && (Date.now() - (mouvementEnCours.timestamp || 0)) < delaiMax) {
        garder(mouvementEnCours.idToken);
    }

    // 3. Et ceux qu'un événement du journal n'a pas encore fait bouger ICI.
    //    Cette liste n'est pas tenue à la main : elle se DÉDUIT des événements
    //    reçus et pas encore rejoués (voir pionsRetenusParLeJournal, dans
    //    sequence_tour.js). Une liste tenue à la main finissait toujours par
    //    mentir — on oubliait d'y inscrire un pion, ou de l'en retirer.
    //    Aucune expiration ici : ce n'est pas une animation qui traîne, c'est
    //    une attente VOULUE, qui dure le temps qu'il faut (un joueur parti
    //    chercher un café). Elle se vide d'elle-même quand le journal est à
    //    jour, donc elle ne peut pas rester coincée.
    Object.keys(window.PIONS_EN_ATTENTE_SEQUENCE || {}).forEach(garder);

    return recus;
};

window.rafraichirAffichageCombat = function() {
    if (document.getElementById("fenetre-combat")?.style.display !== "block") return;

    // Les objets de PERSOS_PARTIE sont REMPLACÉS à chaque notification (une
    // nouvelle conversion par snapshot) : la liste du panneau, elle, garde les
    // anciens. On la fait pointer sur les objets frais.
    const frais = (p) => (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === p.idPersonnage) || p;
    if (Array.isArray(window.COMBAT_PERSOS_JOUEUR)) {
        window.COMBAT_PERSOS_JOUEUR = window.COMBAT_PERSOS_JOUEUR.map(frais);
    }

    // Un héros arrivé (ou reparti) après l'ouverture du combat doit entrer dans
    // la liste de ce poste : sans cela, il n'y apparaît jamais. La réserve
    // « sauf si le panneau montre une créature » est partie avec la visionneuse :
    // cette liste ne contient plus que mes héros, en toute circonstance.
    const idJoueur = localStorage.getItem("ID_JOUEUR_COURANT");
    if (idJoueur) {
        // Même lecture qu'à l'ouverture du combat : les héros de ce poste, sans
        // les leurres qu'ils auraient pu poser (voir herosDuJoueur).
        const miens = window.herosDuJoueur(idJoueur);
        const affiche = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
        const memesHeros = miens.length === (window.COMBAT_PERSOS_JOUEUR || []).length
            && miens.every((p, i) => p.idPersonnage === window.COMBAT_PERSOS_JOUEUR[i].idPersonnage);
        if (!memesHeros) {
            window.COMBAT_PERSOS_JOUEUR = miens;
            const i = miens.findIndex(p => affiche && p.idPersonnage === affiche.idPersonnage);
            window.COMBAT_INDEX_PERSO = i >= 0 ? i : 0;
        }
    }

    // Chaque redessin est isolé : une bulle d'initiative qui casse ne doit pas
    // emporter les jauges avec elle.
    const sansCasser = (nom, fn) => { try { fn(); } catch (e) { console.error("Redessin " + nom + " :", e); } };
    if (typeof window.mettreAJourJaugePV === "function")
        sansCasser("vitalité", () => window.mettreAJourJaugePV());
    if (typeof window.mettreAJourJaugeFatigue === "function")
        sansCasser("énergie", () => window.mettreAJourJaugeFatigue(0));
    // Appelé pour lui-même, et pas seulement par les jauges du panneau : si
    // l'une d'elles casse, son propre redessin est perdu, pas celui du héros.
    if (typeof window.actualiserHudHeros === "function")
        sansCasser("bloc du héros", () => window.actualiserHudHeros());
    if (typeof window.afficherPisteInitiative === "function")
        sansCasser("piste", () => window.afficherPisteInitiative());
    if (typeof window.actualiserBoutonFinTour === "function")
        sansCasser("bouton de fin de tour", () => window.actualiserBoutonFinTour());
    if (typeof window.actualiserEtatCarteCombat === "function")
        sansCasser("carte du panneau", () => window.actualiserEtatCarteCombat());
};

// LE TIC DE SÉCURITÉ.
//  Toutes les deux secondes, l'écran se remet d'accord avec ce que le poste a
//  déjà reçu. Il ne demande RIEN au réseau : c'est un simple redessin, dont le
//  coût est nul et qui ne consomme aucun quota. Il rattrape ce qu'un
//  rafraîchissement manquant aurait laissé passer — un cas oublié, une
//  exception avalée — sans qu'on ait à tous les avoir prévus.
window.TIC_AFFICHAGE_COMBAT = null;
window.demarrerTicAffichageCombat = function() {
    if (window.TIC_AFFICHAGE_COMBAT) return;
    window.TIC_AFFICHAGE_COMBAT = setInterval(() => {
        try { window.rafraichirAffichageCombat(); }
        catch (e) { console.error("Tic d'affichage :", e); }
    }, 2000);
};
window.arreterTicAffichageCombat = function() {
    if (!window.TIC_AFFICHAGE_COMBAT) return;
    clearInterval(window.TIC_AFFICHAGE_COMBAT);
    window.TIC_AFFICHAGE_COMBAT = null;
};

window.mettreAJourJaugePV = function() {
    // Les globales COMBAT_PV_* sont recopiées à la main depuis une douzaine
    // d'endroits du moteur, et il suffit qu'un seul oublie pour que la barre
    // mente : le tic de poison, par exemple, baissait les points de vie puis ne
    // redessinait que la jauge de fatigue. On repart donc de la donnée du
    // combattant, et on remet les globales d'accord avec elle.
    const perso = combattantCourant();
    let max = window.COMBAT_PV_MAX || 1;
    let actuelle = window.COMBAT_PV_ACTUELS || 0;
    if (perso) {
        const maxReel = (parseInt(perso.PV_Max) || 0) + (parseInt(perso.Dev_Mod_PV) || 0);
        if (maxReel > 0) max = maxReel;
        if (perso.PV_Actuels !== undefined) actuelle = parseInt(perso.PV_Actuels) || 0;
        window.COMBAT_PV_MAX = max;
        window.COMBAT_PV_ACTUELS = actuelle;
    }
    
    // ELLE NE DESSINE PLUS RIEN, ET ELLE SERT TOUJOURS.
    //
    // Les deux barres qu'elle peignait vivaient dans le panneau latéral, qui a
    // été supprimé. Mais ce sont ces lignes-ci qui remettent COMBAT_PV_MAX et
    // COMBAT_PV_ACTUELS d'accord avec la fiche du combattant, et une douzaine
    // d'endroits du moteur lisent ces globales. On garde donc le calcul, et le
    // bloc du héros se peint juste après.

    // Le bloc du héros se greffe sur les deux jauges plutôt que sur
    // leurs appelants : elles sont rafraîchies de partout, du tic de poison au
    // clic sur une carte, et aucun de ces endroits n'a à savoir qu'un second
    // affichage existe maintenant en bas à droite.
    if (typeof window.actualiserHudHeros === "function") window.actualiserHudHeros();
};

// =========================================================================
//  LOGIQUE DE LA JAUGE DE FATIGUE
// =========================================================================
window.mettreAJourJaugeFatigue = function(coutFatigueBrut) {
    // Même règle que pour la vitalité : la donnée du combattant fait foi.
    const perso = combattantCourant();
    let max = window.COMBAT_FATIGUE_MAX || 1;
    let actuelle = window.COMBAT_FATIGUE_ACTUELLE || 0;
    if (perso) {
        const maxReel = window.fatigueMaxCombattant(perso, 0);
        if (maxReel > 0) max = maxReel;
        if (perso.fatigueActuelle !== undefined) actuelle = parseInt(perso.fatigueActuelle) || 0;
        window.COMBAT_FATIGUE_MAX = max;
        window.COMBAT_FATIGUE_ACTUELLE = actuelle;
    }
    
    const coutFatigue = parseInt(coutFatigueBrut) || 0; 
    const coutReel = Math.min(coutFatigue, actuelle); 
    const reste = actuelle - coutReel;

    // ELLE NON PLUS NE DESSINE PLUS RIEN. La barre d'énergie, son aperçu du coût
    // en rouge et ses deux étiquettes vivaient dans le panneau latéral. Ce qui
    // reste — la remise d'accord de COMBAT_FATIGUE_MAX et COMBAT_FATIGUE_ACTUELLE
    // avec la fiche — est lu de partout, et le coût passé en argument sert
    // toujours à ses appelants.

    // Le bloc du héros montre l'énergie RÉELLE, jamais l'aperçu du coût d'une
    // carte : c'est un état, pas une simulation.
    if (typeof window.actualiserHudHeros === "function") window.actualiserHudHeros();
};

// =========================================================================
//  LE BLOC DU HÉROS SUR LE BOUTON DE FIN DE TOUR
// =========================================================================
//  Son avatar derrière le bouton, son nom au-dessus, et ses deux jauges en
//  demi-anneaux : la vitalité à gauche, l'énergie à droite, chacune avec son
//  ancre chiffrée au bout.
//
//  CE BLOC MONTRE LE HÉROS DE CE POSTE, ET LUI SEUL.
//
//  Il fut un temps où cette phrase demandait un effort. Le panneau latéral était
//  une VISIONNEUSE : cliquer sur un portrait y installait ce combattant-là,
//  créature comprise, en remplaçant COMBAT_PERSOS_JOUEUR par [lui]. Demander à
//  cette liste « qui est mon héros ? » pouvait donc répondre « le gnoll que tu
//  regardes », et ça a désarmé le bouton de fin de tour, puis le lancement des
//  cartes, puis l'aperçu des compétences.
//
//  Le panneau a été supprimé, et l'échange avec lui : cette liste ne contient
//  plus que mes héros, en toute circonstance. herosDuPoste() reste néanmoins la
//  bonne porte d'entrée — elle relit la fiche dans PERSOS_PARTIE, où les
//  chiffres du cerveau sont reversés, plutôt qu'une copie qui peut avoir vieilli.

// Le héros de ce poste, tel qu'il est DANS PERSOS_PARTIE (la copie du panneau
// peut avoir vieilli). On prend le premier : un joueur n'aura bientôt plus
// qu'un seul personnage, et d'ici là le premier de la liste est le sien.
window.herosDuPoste = function() {
    const miens = window.COMBAT_PERSOS_JOUEUR || [];
    // PAS DE REPLI SUR LE PREMIER VENU. Il y en avait un — `|| miens[0]` — du
    // temps où le panneau latéral pouvait remplacer cette liste par [une
    // créature] : il fallait bien afficher quelque chose. Le panneau a disparu,
    // la liste ne contient plus que mes héros, et rendre une créature ici
    // reviendrait à montrer au joueur la vie d'un gnoll comme si c'était la
    // sienne. Aucun héros, aucune réponse.
    //
    // NI UNE ILLUSION. Elle est filtrée en amont, à la construction de la liste
    // (herosDuJoueur) ; ce second filet est là parce que ce bloc-ci est le seul
    // endroit où l'erreur se VOIT, et qu'elle s'y est déjà vue une fois.
    const mien = miens.find(h => h && !h.estMonstre && !h.estIllusion);
    if (!mien) return null;
    return (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === mien.idPersonnage) || mien;
};

// DU ROUGE ET DU JAUNE FRANCS, SANS UN GRAMME D'OMBRAGE.
//
// Les trois jauges étaient peintes avec un dégradé vertical, du sombre en bas
// vers le clair en haut. Sur un arc de quinze pixels vu à travers une fenêtre
// creusée dans le bouton, ce dégradé ne se lisait pas comme du relief : il se
// lisait comme de la saleté, et il tirait la couleur vers le brun dès qu'on
// s'éloignait du milieu. Une teinte pleine par jauge, et on voit du premier
// coup d'œil où on en est.
//
// Les chiffres et leurs écussons portent la même teinte que leur jauge : c'est
// la règle posée dès le départ, et elle vaut aussi pour ces couleurs-ci.
const HUD_TEINTES = {
    vie:      { trait: "#ff2b2b", chiffre: "#ff5a5a", ecusson: "#ff2b2b" },
    bouclier: { trait: "#22d3ff", chiffre: "#63e2ff", ecusson: "#22d3ff" },
    energie:  { trait: "#ffd400", chiffre: "#ffdf3d", ecusson: "#ffd400" }
};

// La taille de départ du nom est un réglage comme un autre : elle vient de la
// boîte de réglage quand celle-ci est chargée, sinon de cette valeur.
//
// ELLE SUIT L'ÉCHELLE DU BANDEAU, comme tout le reste du bloc. Sur tablette,
// style.css réduit le bandeau de 450 à 380 px et le bouton avec lui ; un nom qui
// garderait ses 38 pixels y paraîtrait deux fois trop gros et déborderait de sa
// boîte, elle aussi rétrécie.
function hudEchelle() {
    return typeof window.echelleHud === "function" ? window.echelleHud() : 1;
}
function hudNomTailleMax() {
    const r = window.REGLAGES_HUD;
    return ((r && r.nom && r.nom.taille) || 38) * hudEchelle();
}
function hudNomTailleMin() {
    return 14 * hudEchelle();
}

// LE NOM RÉTRÉCIT JUSQU'À TENIR. On descend par paliers de deux pixels tant que
// le texte déborde de sa boîte, sans jamais passer sous une taille lisible.
// L'espacement des lettres se resserre en chemin : à 38 px trois pixels d'écart
// font respirer le mot, à 22 px ils le font déborder pour rien.
function ajusterNomHudHeros(div, texte) {
    const k = hudEchelle();
    const depart = hudNomTailleMax();
    const plancher = hudNomTailleMin();
    let taille = depart;

    // L'ESPACEMENT SE RESSERRE EN CHEMIN, ET FINIT PAR DISPARAÎTRE : sur un nom
    // de trente lettres, un pixel entre chacune, c'est trente pixels de plus à
    // caser — de quoi faire déborder un mot qui tenait tout juste. Les paliers
    // suivent l'échelle du bandeau comme la taille elle-même : à 380 px de
    // large, une lettre de 30 px n'existe pas, le premier palier ne serait
    // jamais franchi et l'espacement resterait à trois pixels jusqu'au bout.
    const espacement = (t) => {
        if (t >= 30 * k) return (3 * k) + "px";
        if (t >= 24 * k) return (2 * k) + "px";
        if (t >= 20 * k) return (1 * k) + "px";
        return "0px";
    };

    texte.style.fontSize = taille + "px";
    texte.style.letterSpacing = espacement(taille);
    while (taille > plancher && div.scrollWidth > div.clientWidth) {
        taille -= 2 * k;
        texte.style.fontSize = taille + "px";
        texte.style.letterSpacing = espacement(taille);
    }
}

// =========================================================================
//  LA PISTE DES ÉTATS DU HÉROS
// =========================================================================
//  À gauche du bouton de fin de tour : ce que le héros du poste subit en ce
//  moment. Même source que ses jauges — herosDuPoste(), jamais la visionneuse
//  du panneau latéral.
//
//  UN TAPIS ROULANT, ET C'EST TOUT LE MÉCANISME. Chaque icône est ancrée au
//  bord droit de la piste et poussée vers la gauche par son RANG. Le rang 0 est
//  collé au bouton ; un état qui arrive prend le rang le plus élevé et entre
//  donc par la gauche. Quand l'un s'en va, les rangs de ceux qui restent
//  baissent d'un cran : ils glissent vers la droite d'eux-mêmes, par la seule
//  transition CSS, sans une ligne d'animation.
//
//  L'ORDRE D'ARRIVÉE EST MÉMORISÉ ICI, et il le faut : les fiches ne disent que
//  quels états sont là, jamais depuis quand. Sans cette mémoire, le tapis se
//  réordonnerait au premier rafraîchissement venu et les icônes sauteraient de
//  place sans raison.
let PISTE_ETATS_ORDRE = [];

// La géométrie vient des réglages, à l'échelle du bandeau — comme le reste du
// bloc du héros, qui rétrécit avec lui sur tablette.
function reglagesPisteEtats() {
    const r = (window.REGLAGES_HUD || {}).etats || {};
    const k = typeof window.echelleHud === "function" ? window.echelleHud() : 1;
    const taille = (r.taille || 46) * k;
    const ecart = (r.ecart === undefined ? 12 : r.ecart) * k;
    return { taille, ecart, pas: taille + ecart, echelle: k };
}

// LE MÊME ÉTAT NE COMPTE QU'UNE FOIS. Il ne s'empile jamais sur la fiche non
// plus — poser deux fois une brûlure allonge sa durée, elle n'en crée pas une
// seconde — donc deux icônes identiques ne diraient rien de plus qu'une.
function etatsDuHeros() {
    const heros = window.herosDuPoste ? window.herosDuPoste() : null;
    const vus = new Set();
    return ((heros && heros.Etats_Alteres) || []).filter(e => {
        if (!e || !e.nom || vus.has(e.nom)) return false;
        vus.add(e.nom);
        return true;
    });
}

// LE CLIC MONTRE LES TOURS QUI RESTENT, DEUX SECONDES.
window.montrerDureeEtat = function(nom) {
    const piste = document.getElementById("piste-etats");
    if (!piste) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // Une seule réponse à la fois : toucher un second état efface la première.
    piste.querySelectorAll(".etat-piste-duree").forEach(d => {
        d.classList.remove("visible");
        if (d.dataset.minuterie) { clearTimeout(parseInt(d.dataset.minuterie)); d.dataset.minuterie = ""; }
    });

    const tuile = piste.querySelector(`.etat-piste[data-nom="${CSS.escape(nom)}"]`);
    const etat = etatsDuHeros().find(e => e.nom === nom);
    if (!tuile || !etat) return;

    const tours = Math.max(0, parseInt(etat.duree) || 0);
    const bulle = tuile.querySelector(".etat-piste-duree");
    if (!bulle) return;
    bulle.innerText = tours + (tours > 1 ? " Tours" : " Tour");
    bulle.classList.add("visible");
    bulle.dataset.minuterie = String(setTimeout(() => {
        bulle.classList.remove("visible");
        bulle.dataset.minuterie = "";
    }, 2000));
};

window.actualiserPisteEtats = function() {
    const piste = document.getElementById("piste-etats");
    if (!piste) return;                           // pas en combat : rien à peindre
    const voile = document.getElementById("piste-etats-voile");
    const { taille, ecart, pas, echelle } = reglagesPisteEtats();

    const etats = etatsDuHeros();
    const presents = new Set(etats.map(e => e.nom));

    // ─── CEUX QUI VIENNENT DE DISPARAÎTRE ───────────────────────────────
    // Ils quittent tout de suite l'ordre (pour que les autres se resserrent
    // sans attendre), mais restent à l'écran le temps de filer vers la droite.
    PISTE_ETATS_ORDRE.filter(nom => !presents.has(nom)).forEach(nom => {
        PISTE_ETATS_ORDRE = PISTE_ETATS_ORDRE.filter(n => n !== nom);
        const tuile = piste.querySelector(`.etat-piste[data-nom="${CSS.escape(nom)}"]`);
        if (!tuile) return;
        tuile.removeAttribute("data-nom");        // il ne compte plus comme présent
        tuile.classList.add("etat-sort");
        // L'OPACITÉ EST REMISE À LA MAIN, ET IL LE FAUT. La classe `etat-sort`
        // la met à zéro, mais chaque icône porte un `style.opacity = "1"` en
        // ligne, posé à sa naissance pour la faire apparaître en fondu — et un
        // style en ligne l'emporte toujours sur une classe. L'icône filait donc
        // vers la droite à pleine opacité, puis disparaissait d'un coup.
        tuile.style.opacity = "0";
        tuile.style.pointerEvents = "none";
        // Assez loin vers la droite pour passer franchement sous le bouton.
        tuile.style.transform = `translateX(${Math.round(160 * echelle)}px)`;
        setTimeout(() => tuile.remove(), 600);
    });

    // ─── CEUX QUI ARRIVENT ──────────────────────────────────────────────
    // Ajoutés en fin d'ordre, donc au rang le plus élevé, donc à gauche.
    etats.forEach(e => {
        if (PISTE_ETATS_ORDRE.includes(e.nom)) return;
        PISTE_ETATS_ORDRE.push(e.nom);
        const tuile = document.createElement("div");
        tuile.className = "etat-piste";
        tuile.dataset.nom = e.nom;
        tuile.title = e.nom;
        tuile.onclick = (ev) => { ev.stopPropagation(); window.montrerDureeEtat(e.nom); };
        // Il naît à sa place puis y glisse : sans ce départ décalé, il
        // apparaîtrait brutalement au milieu des autres.
        tuile.style.transform = `translateX(${-Math.round((PISTE_ETATS_ORDRE.length) * pas)}px)`;
        tuile.style.opacity = "0";
        piste.appendChild(tuile);
    });

    // ─── CHACUN À SON RANG ──────────────────────────────────────────────
    PISTE_ETATS_ORDRE.forEach((nom, rang) => {
        const tuile = piste.querySelector(`.etat-piste[data-nom="${CSS.escape(nom)}"]`);
        const etat = etats.find(e => e.nom === nom);
        if (!tuile || !etat) return;
        tuile.style.width = taille + "px";
        tuile.style.height = taille + "px";
        // L'icône est refaite seulement si elle a changé : la réécrire à chaque
        // battement du combat relancerait le chargement de l'image.
        if (tuile.dataset.icone !== (etat.icone || "")) {
            tuile.dataset.icone = etat.icone || "";
            tuile.innerHTML = window.imageEtat(etat, Math.round(taille))
                            + `<div class="etat-piste-duree" style="font-size: ${Math.round(13 * echelle)}px;"></div>`;
        }
        const bulle = tuile.querySelector(".etat-piste-duree");
        if (bulle) bulle.style.fontSize = Math.round(13 * echelle) + "px";
        requestAnimationFrame(() => {
            tuile.style.opacity = "1";
            tuile.style.transform = `translateX(${-Math.round(rang * pas)}px)`;
        });
    });

    // ─── LE VOILE SUIT, ET S'EFFACE QUAND IL N'Y A PLUS RIEN ────────────
    if (voile) {
        const n = PISTE_ETATS_ORDRE.length;
        voile.style.width = n === 0 ? "0px"
            : Math.round((n - 1) * pas + taille + 60 * echelle) + "px";
        voile.style.opacity = n === 0 ? "0" : "1";
    }
    piste.style.height = taille + "px";
};

// Le combat repart de zéro : la mémoire de l'ordre doit repartir avec lui,
// sinon la première manche hériterait du tapis de la partie précédente.
window.oublierPisteEtats = function() {
    PISTE_ETATS_ORDRE = [];
    const piste = document.getElementById("piste-etats");
    if (piste) piste.querySelectorAll(".etat-piste").forEach(t => t.remove());
    const voile = document.getElementById("piste-etats-voile");
    if (voile) { voile.style.width = "0px"; voile.style.opacity = "0"; }
};

window.actualiserHudHeros = function() {
    const arcGauche = document.getElementById("hud-arc-gauche");
    if (!arcGauche) return;                       // pas en combat : rien à peindre
    const arcDroit = document.getElementById("hud-arc-droit");

    // Pose une jauge : son arc, son écusson, son chiffre.
    const poser = (arc, idAncre, idValeur, teinte, valeur, part) => {
        const pct = Math.min(100, Math.max(0, part * 100));
        if (arc) {
            arc.style.stroke = teinte.trait;
            arc.style.strokeDasharray = pct + " 100";
            // À zéro, un bout arrondi dessinerait quand même un point de couleur.
            arc.style.strokeOpacity = pct <= 0 ? "0" : "1";
        }
        const ancre = document.getElementById(idAncre);
        if (ancre) ancre.style.background = teinte.ecusson;
        const valeurEl = document.getElementById(idValeur);
        if (valeurEl) {
            valeurEl.innerText = valeur;
            valeurEl.style.color = teinte.chiffre;
        }
    };

    const heros = window.herosDuPoste();
    const avatar = document.getElementById("hud-avatar-heros");
    const divNom = document.getElementById("hud-nom-heros");

    if (!heros) {
        poser(arcGauche, "hud-ancre-gauche", "hud-valeur-gauche", HUD_TEINTES.vie, "–", 0);
        poser(arcDroit, "hud-ancre-droite", "hud-valeur-droite", HUD_TEINTES.energie, "–", 0);
        if (avatar) avatar.style.opacity = "0";
        if (divNom) {
            const t = document.getElementById("hud-nom-heros-texte");
            if (t) t.innerText = "";
            divNom.dataset.nom = "";
        }
        return;
    }

    const pvMax = (parseInt(heros.PV_Max) || 1) + (parseInt(heros.Dev_Mod_PV) || 0);
    const pv = heros.PV_Actuels !== undefined ? parseInt(heros.PV_Actuels) || 0 : pvMax;

    const bouclier = parseInt(heros.Bouclier_Actuel) || 0;
    // Le maximum du bouclier n'a pas toujours été écrit sur la fiche (c'est
    // récent) : à défaut, le bouclier en cours fait office de plein.
    const bouclierMax = Math.max(parseInt(heros.Bouclier_Max) || 0, bouclier);

    const energieMax = window.fatigueMaxCombattant(heros) || 1;
    const energie = heros.fatigueActuelle !== undefined ? parseInt(heros.fatigueActuelle) || 0 : energieMax;

    // À GAUCHE : LA VITALITÉ — SAUF TANT QU'UN BOUCLIER TIENT. Le bouclier
    // encaisse à la place des points de vie, c'est donc lui qu'il faut lire
    // pendant qu'il existe. Quand il tombe, la vitalité reprend sa place, avec
    // le chiffre qu'elle avait pendant tout ce temps.
    if (bouclier > 0) {
        poser(arcGauche, "hud-ancre-gauche", "hud-valeur-gauche",
              HUD_TEINTES.bouclier, bouclier, bouclier / bouclierMax);
    } else {
        poser(arcGauche, "hud-ancre-gauche", "hud-valeur-gauche",
              HUD_TEINTES.vie, pv, pv / pvMax);
    }
    poser(arcDroit, "hud-ancre-droite", "hud-valeur-droite",
          HUD_TEINTES.energie, energie, energie / energieMax);

    // L'AVATAR. On ne réécrit `src` que si l'adresse a changé : sans cette
    // garde, chaque rafraîchissement relancerait un chargement d'image, et le
    // portrait clignoterait à chaque battement du combat.
    if (avatar) {
        const url = heros.urlCloudinary || "";
        if (!url) {
            avatar.style.opacity = "0";
        } else {
            const voulue = typeof window.redimensionnerImageCloudinary === "function"
                ? window.redimensionnerImageCloudinary(url, 900) : url;
            if (avatar.dataset.url !== voulue) {
                avatar.dataset.url = voulue;
                avatar.src = voulue;
            }
            avatar.style.opacity = "1";
        }
    }

    // LE NOM. Il n'est réajusté que lorsqu'il change, et seulement quand la
    // boîte a une largeur : mesuré pendant que le combat est encore masqué, il
    // déborderait d'une boîte large de zéro et tomberait à la taille minimale.
    if (typeof window.actualiserPisteEtats === "function") window.actualiserPisteEtats();

    const texteNom = document.getElementById("hud-nom-heros-texte");
    if (divNom && texteNom) {
        const nom = ((heros.prenom || "") + " " + (heros.nom || "")).trim() || heros.idPersonnage;
        if (divNom.dataset.nom !== nom) {
            divNom.dataset.nom = nom;
            texteNom.innerText = nom;
            divNom.dataset.ajuste = "0";
        }
        if (divNom.dataset.ajuste !== "1" && divNom.clientWidth > 0) {
            ajusterNomHudHeros(divNom, texteNom);
            divNom.dataset.ajuste = "1";
        }
    }
};

// =========================================================================
//  INTERACTIONS AVEC LES CARTES (IMAGE ET JAUGE)
// =========================================================================
window.gererClicCarteCombat = function(idCarte) {
    const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";
    const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const fatigueMax = window.fatigueMaxCombattant(persoActuel);
    const fatiguePerso = (persoActuel && persoActuel.fatigueActuelle !== undefined) ? parseInt(persoActuel.fatigueActuelle) : fatigueMax;

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    const cout = parseInt(dataCarte?.Fatigue) || 0;

    // Une carte trop chère (seule, ou combinée au trajet déjà tracé) reste
    // consultable comme n'importe quelle autre : plus de message d'erreur ni de
    // clic bloqué, elle s'ouvre et s'affiche normalement — c'est uniquement à
    // l'affichage (competences.js, boutonChoisirHtml) que le bouton "Choisir"
    // cède la place à "Énergie Insuffisante". On ne réserve simplement pas son
    // coût auprès du déplacement, puisqu'elle ne pourra de toute façon pas partir.
    const abordable = cout + (window.MOUVEMENT_COUT_TOTAL || 0) <= (window.COMBAT_FATIGUE_ACTUELLE || 0);

    if (window.CARTE_EN_APERCU !== idCarte) {
        window.COUT_COMPETENCE_SELECTIONNEE = abordable ? cout : 0;
    } else {
        window.COUT_COMPETENCE_SELECTIONNEE = 0;
    }

    // Réinitialise tout en gardant l'état épuisé si nécessaire
    document.querySelectorAll('.banniere-carte-combat').forEach(el => {
        el.dataset.actif = "false";
        const cId = el.id.replace("combat-carte-", "");
        const cData = window.COMPETENCES_CACHE[cId];
        const estEp = cData && (parseInt(cData.Fatigue) || 0) > fatiguePerso;
        const cadre = document.getElementById(`cadre-combat-${cId}`);
        if (cadre) cadre.style.backgroundImage = `url('${estEp ? IMAGE_CADRE_EPUISE : IMAGE_CADRE_NORMAL}')`;
    });

    if (window.CARTE_EN_APERCU !== idCarte) {
        window.CARTE_EN_APERCU = idCarte;

        const estEpuise = !abordable;

        const carteDiv = document.getElementById(`combat-carte-${idCarte}`);
        const cadreDiv = document.getElementById(`cadre-combat-${idCarte}`);
        if (carteDiv && cadreDiv) {
            carteDiv.dataset.actif = "true";
            // Si la carte est épuisée, on affiche pas la cible rouge, on garde la bannière usée
            cadreDiv.style.backgroundImage = `url('${estEpuise ? IMAGE_CADRE_EPUISE : IMAGE_CADRE_SELECTIONNE}')`;
        }
        
        window.mettreAJourJaugeFatigue(cout);
        
        if (typeof window.afficherApercuCarteHD === "function") {
            window.afficherApercuCarteHD(idCarte);
        }
    } else {
        window.mettreAJourJaugeFatigue(0);
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
    }
    
    // Force la réactualisation visuelle des couleurs grises
    if (typeof window.actualiserBannieresEpuisees === "function") window.actualiserBannieresEpuisees();
};

// Clic global (Fermeture dans le vide)
document.addEventListener("click", function(event) {
    const btnFermer = document.getElementById('btn-fermer-combat');
    if (!btnFermer || btnFermer.style.display === 'none') return;

    const clicSurBanniere = event.target.closest('.banniere-carte-combat');
    const clicSurCarteHD = event.target.closest('#apercu-carte-hd-competence');
    // Ce garde-fou visait les flèches ◄ ► du panneau latéral, qui changeaient de
    // héros sans devoir annuler l'aperçu au passage. Le panneau n'est plus là,
    // mais la classe habille toujours les petits boutons du jeu (menu de
    // développement, réglages du plateau) : un clic dessus n'est pas « le vide »
    // non plus. On le garde, sous un nom qui dit ce qu'il couvre vraiment.
    const clicSurPetitBouton = event.target.closest('.btn-combat-switch');
    // La fenêtre de tour n'est pas "le vide" : le clic qui y lance les animations
    // ne doit pas annuler au passage le ciblage qu'on est en train de préparer.
    const clicSurVoile = event.target.closest('#voile-tour-combat');
    // LE BOUTON FIN DE TOUR NON PLUS. C'est lui qui OUVRE le ciblage depuis son
    // image « lancer » : son clic partait ici en remontant et appelait
    // nettoyerCiblage dans la foulée — la carte s'ouvrait et se refermait dans
    // le même geste, sans que rien à l'écran ne le dise. Du temps où le ciblage
    // démarrait par « Appliquer », posé SUR la carte, le cas ne pouvait pas se
    // produire (clicSurCarteHD couvrait le bouton).
    const clicSurBoutonFinTour = event.target.closest('#btn-hud-fintour');

    if (!clicSurBanniere && !clicSurCarteHD && !clicSurPetitBouton && !clicSurVoile
        && !clicSurBoutonFinTour && window.CARTE_EN_APERCU) {
        
        // 🔻 NOUVEAU : Annule le ciblage en cours si on clique dans le vide
        if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();

        window.COUT_COMPETENCE_SELECTIONNEE = 0;
        window.mettreAJourJaugeFatigue(0); 
        
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
        
        document.querySelectorAll('.banniere-carte-combat').forEach(el => {
            el.dataset.actif = "false";
        });
        if (typeof window.actualiserBannieresEpuisees === "function") window.actualiserBannieresEpuisees();
    }
});

// =========================================================================
//  GESTION DE LA CAMÉRA (TABLE VIRTUELLE - VTT)
// =========================================================================

window.PLATEAU_VTT = null;
window.VTT_SCALE = 1;
window.VTT_POS_X = 0;
window.VTT_POS_Y = 0;
let isDraggingVTT = false;
let startDragX = 0;
let startDragY = 0;

window.initialiserPlateau = function() {
    if (!window.PLATEAU_VTT) {
        window.PLATEAU_VTT = new Plateau('plateau-canvas');
        
        // 🔻 AJOUT ICI : Coupe définitivement le glissement natif de l'écran sur cette zone
        const conteneur = document.getElementById("conteneur-plateau-vtt");
        if (conteneur) {
            conteneur.style.touchAction = "none";
        }

        window.PLATEAU_VTT.renderMap();
        window.centrerPlateau();
        window.activerPanZoom();
    }
};

window.VTT_SCALE_MIN = 0.1;
window.VTT_SCALE_MAX = 5;

window.centrerPlateau = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (!conteneur) return;
    
    // On s'adapte à la taille physique du conteneur (qui va changer selon l'image)
    const w = conteneur.offsetWidth || 1800;
    const h = conteneur.offsetHeight || 1800;
    
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    window.VTT_SCALE = Math.min(winW / w, winH / h) * 0.9; 
    
    // Les bornes de zoom sont relatives au cadrage d'origine (une petite map ne se bloquait plus au bon moment)
    window.VTT_SCALE_MIN = window.VTT_SCALE * 0.5;
    window.VTT_SCALE_MAX = window.VTT_SCALE * 8;
    
    window.VTT_POS_X = winW - (w * window.VTT_SCALE); // Bord droit de la carte collé au bord droit de l'écran à l'entrée
    window.VTT_POS_Y = (winH - (h * window.VTT_SCALE)) / 2;
    
    window.appliquerTransformPlateau();
};

// Zoom autour d'un point d'ancrage. Le facteur est recalculé APRÈS bridage :
// sinon, une fois la limite atteinte, la carte continuait de glisser sans zoomer.
window.appliquerZoomVTT = function(facteurDemande, ancreX, ancreY) {
    const echelleVoulue = window.VTT_SCALE * facteurDemande;
    const nouvelleEchelle = Math.min(Math.max(echelleVoulue, window.VTT_SCALE_MIN), window.VTT_SCALE_MAX);
    const facteurReel = nouvelleEchelle / window.VTT_SCALE;

    window.VTT_POS_X = ancreX - (ancreX - window.VTT_POS_X) * facteurReel;
    window.VTT_POS_Y = ancreY - (ancreY - window.VTT_POS_Y) * facteurReel;
    window.VTT_SCALE = nouvelleEchelle;

    window.appliquerTransformPlateau();
};

let frameTransformVTT = null;

window.appliquerTransformPlateau = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (conteneur) {
        conteneur.style.transform = `translate(${window.VTT_POS_X}px, ${window.VTT_POS_Y}px) scale(${window.VTT_SCALE})`;
    }

    // Les pions ne subissent pas ce scale : on les repositionne à la main, une fois par frame
    if (frameTransformVTT) return;
    frameTransformVTT = requestAnimationFrame(() => {
        frameTransformVTT = null;
        window.repositionnerTokensVTT();
    });
};

window.VTT_MODE_EFFACEMENT = false;
window.VTT_MODE_MURS = false;
window.VTT_MODE_DIFFICILE = false;
let isPaintingVTT = false;
let currentPaintAction = null; // 'delete', 'restore', 'block', 'unblock', 'difficult', 'undifficult'
let dernierHexPeint = null;
let framePeintureVTT = null;

// Regroupe tous les renderMap() d'un même geste en un seul par frame (au lieu d'un par
// evenement pointer/touch, qui peut arriver a 60+ fois/seconde pendant qu'on peint).
function demanderRenderPeintureVTT() {
    if (framePeintureVTT) return;
    framePeintureVTT = requestAnimationFrame(() => {
        framePeintureVTT = null;
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    });
}

// Applique l'outil actif (gomme/murs/difficile) sur une case, en ignorant les evenements
// repetes sur la MEME case (le doigt qui bouge de quelques pixels sans changer d'hexagone).
function peindreHexVTT(hex, forcer) {
    if (!hex) return;
    const cle = hex.q + "," + hex.r;
    if (!forcer && cle === dernierHexPeint) return;
    dernierHexPeint = cle;

    if (window.VTT_MODE_EFFACEMENT) {
        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDeleted: currentPaintAction === 'delete' });
    } else if (window.VTT_MODE_MURS) {
        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isBlocked: currentPaintAction === 'block' });
    } else if (window.VTT_MODE_DIFFICILE) {
        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDifficult: currentPaintAction === 'difficult' });
    }
    demanderRenderPeintureVTT();
}

window.activerPanZoom = function() {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur) return;

    function getHexFromMouse(clientX, clientY) {
        if (!window.PLATEAU_VTT) return null;
        const canvasX = (clientX - window.VTT_POS_X) / window.VTT_SCALE;
        const canvasY = (clientY - window.VTT_POS_Y) / window.VTT_SCALE;
        return window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
    }

    // --- ZOOM SOURIS (Molette PC) ---
    conteneur.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.08;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        
        window.appliquerZoomVTT(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // --- SOURIS (Pan & Peinture PC) ---
    conteneur.addEventListener("mousedown", (e) => {
        if (conteneur.contains(e.target)) {
            if (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE) {
                isPaintingVTT = true;
                dernierHexPeint = null;
                const hex = getHexFromMouse(e.clientX, e.clientY);
                if (hex) {
                    const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                    if (window.VTT_MODE_EFFACEMENT) currentPaintAction = state.isDeleted ? 'restore' : 'delete';
                    else if (window.VTT_MODE_MURS) currentPaintAction = state.isBlocked ? 'unblock' : 'block';
                    else if (window.VTT_MODE_DIFFICILE) currentPaintAction = state.isDifficult ? 'undifficult' : 'difficult';
                    peindreHexVTT(hex, true);
                }
            } else {
                isDraggingVTT = true;
                startDragX = e.clientX - window.VTT_POS_X;
                startDragY = e.clientY - window.VTT_POS_Y;
                conteneur.style.cursor = "grabbing";
            }
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (isPaintingVTT && (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE)) {
            peindreHexVTT(getHexFromMouse(e.clientX, e.clientY), false);
            return;
        }

        if (!isDraggingVTT) return;
        window.VTT_POS_X = e.clientX - startDragX;
        window.VTT_POS_Y = e.clientY - startDragY;
        window.appliquerTransformPlateau();
    });

    window.addEventListener("mouseup", () => {
        isDraggingVTT = false;
        isPaintingVTT = false;
        if (conteneur) conteneur.style.cursor = "grab";
    });

    // --- TACTILE AVANCÉ IPAD (Pinch & Pan & Paint) ---
    let lastPinchDist = 0;
    let lastPinchCenter = { x: 0, y: 0 };

    conteneur.addEventListener("touchstart", (e) => {
        if (conteneur.contains(e.target)) {
            if (e.touches.length === 1) {
                if (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE) {
                    isPaintingVTT = true;
                    dernierHexPeint = null;

                    // NOUVEAU : Délai de 100ms pour laisser le temps au 2ème doigt de se poser (Pinch to zoom)
                    window.vttPaintTimeout = setTimeout(() => {
                        if (isPaintingVTT && window.PLATEAU_VTT) {
                            const hex = getHexFromMouse(e.touches[0].clientX, e.touches[0].clientY);
                            if (hex) {
                                const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                                if (window.VTT_MODE_EFFACEMENT) currentPaintAction = state.isDeleted ? 'restore' : 'delete';
                                else if (window.VTT_MODE_MURS) currentPaintAction = state.isBlocked ? 'unblock' : 'block';
                                else if (window.VTT_MODE_DIFFICILE) currentPaintAction = state.isDifficult ? 'undifficult' : 'difficult';
                                peindreHexVTT(hex, true);
                            }
                        }
                    }, 100);

                } else {
                    isDraggingVTT = true;
                    startDragX = e.touches[0].clientX - window.VTT_POS_X;
                    startDragY = e.touches[0].clientY - window.VTT_POS_Y;
                }
            } else if (e.touches.length === 2) {
                // C'est un zoom ! On annule immédiatement le pinceau du 1er doigt
                if (e.cancelable) e.preventDefault();
                clearTimeout(window.vttPaintTimeout);
                isDraggingVTT = false;
                isPaintingVTT = false;
                lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                lastPinchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
            }
        }
    }, { passive: false });

    conteneur.addEventListener("touchmove", (e) => {
        if (isDraggingVTT || isPaintingVTT || e.touches.length === 2) {
            if (e.cancelable) e.preventDefault(); 
        }

        if (e.touches.length === 1) {
            if (isPaintingVTT && (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE)) {
                peindreHexVTT(getHexFromMouse(e.touches[0].clientX, e.touches[0].clientY), false);
                return;
            }

            if (isDraggingVTT) {
                window.VTT_POS_X = e.touches[0].clientX - startDragX;
                window.VTT_POS_Y = e.touches[0].clientY - startDragY;
                window.appliquerTransformPlateau();
            }
        } else if (e.touches.length === 2) {
            const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const currentCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };

            if (lastPinchDist > 0) {
                // 1. On suit le déplacement des deux doigts
                window.VTT_POS_X += currentCenter.x - lastPinchCenter.x;
                window.VTT_POS_Y += currentCenter.y - lastPinchCenter.y;
                // 2. Puis on zoome autour de leur centre (bridage géré dans appliquerZoomVTT)
                window.appliquerZoomVTT(currentDist / lastPinchDist, currentCenter.x, currentCenter.y);
            }

            lastPinchDist = currentDist;
            lastPinchCenter = currentCenter;
        }
    }, { passive: false });

    conteneur.addEventListener("touchend", (e) => {
        clearTimeout(window.vttPaintTimeout);
        isPaintingVTT = false;
        
        if (e.touches.length === 1) {
            lastPinchDist = 0;
            if (!window.VTT_MODE_EFFACEMENT && !window.VTT_MODE_MURS && !window.VTT_MODE_DIFFICILE) {
                isDraggingVTT = true;
                startDragX = e.touches[0].clientX - window.VTT_POS_X;
                startDragY = e.touches[0].clientY - window.VTT_POS_Y;
            }
        } else if (e.touches.length === 0) {
            isDraggingVTT = false;
            lastPinchDist = 0;
        }
    });

    // iOS coupe parfois le geste (appel, geste système…) : sans ça l'état restait bloqué et la carte partait en glissade
    conteneur.addEventListener("touchcancel", () => {
        clearTimeout(window.vttPaintTimeout);
        isPaintingVTT = false;
        isDraggingVTT = false;
        lastPinchDist = 0;
    });
};

// =========================================================================
//  GESTION DU MENU DÉVELOPPEUR (COMBAT)
// =========================================================================

window.toggleMenuCombat = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    const menuDev = document.getElementById("menu-dev-combat");
    if (!menuDev) return;
    
    if (menuDev.classList.contains("ouvert")) {
        window.fermerMenusCoulissantsCombat();
    } else {
        menuDev.classList.add("ouvert");
        menuDev.style.top = "0"; // Glisse depuis le haut
    }
    if (typeof window.positionnerBandeauApparition === "function") window.positionnerBandeauApparition();
};

window.fermerMenusCoulissantsCombat = function(e) {
    const evt = e || (typeof window.event !== 'undefined' ? window.event : null);
    if (evt && evt.target && evt.target.tagName === 'BUTTON' && typeof window.jouerSonClic === "function") {
        window.jouerSonClic();
    }
    const menuDev = document.getElementById("menu-dev-combat");
    if (menuDev) {
        menuDev.classList.remove("ouvert");
        menuDev.style.top = "-150px"; // Repart se cacher en haut
    }
    if (typeof window.positionnerBandeauApparition === "function") window.positionnerBandeauApparition();
};

// =========================================================================
//  GESTION DEV : MAPS ET ÉCHELLES (SYNCHRONISÉES EN BDD)
// =========================================================================

window.UNSUBSCRIBE_VTT = null;

function urlsVTTIdentiques(currentSrc, targetUrl) {
    if (!targetUrl) return !currentSrc;
    try {
        return new URL(currentSrc, window.location.href).href === new URL(targetUrl, window.location.href).href;
    } catch {
        return currentSrc === targetUrl;
    }
}

// L'écouteur qui tourne en arrière-plan chez tous les joueurs
window.ecouterTerrainVTT = function() {
    if (!window.ID_PARTIE_COURANTE) return;
    if (window.UNSUBSCRIBE_VTT) window.UNSUBSCRIBE_VTT(); 
    
    if (typeof window.initialiserPlateau === "function") {
        window.initialiserPlateau();
    }

    window.UNSUBSCRIBE_VTT = onSnapshot(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            
            // NOUVEAU : On applique les trous d'abord...
            if (data.Tuiles_Supprimees !== undefined) {
                window.appliquerTuilesSupprimees(data.Tuiles_Supprimees);
            }

            // NOUVEAU : ...puis les murs
            if (data.Tuiles_Murs !== undefined) {
                window.appliquerMurs(data.Tuiles_Murs);
            }

            // NOUVEAU : Application du terrain difficile
            if (data.Tuiles_Difficiles !== undefined) {
                window.appliquerTerrainDifficile(data.Tuiles_Difficiles);
            }

            // ...puis on gère la grille en elle-même !
            if (data.URL_Map !== undefined && data.Taille_Hex !== undefined) {
                const opacite = data.Opacite_Grille !== undefined ? data.Opacite_Grille : 0.8;
                window.appliquerTerrain(data.URL_Map, data.Taille_Hex, opacite);
            }

            // Une partie sauvée avant la correction peut encore contenir des pions
            // rangés à plat : on les remet en place, le snapshot suivant les dessine.
            if (typeof window.reparerPionsAPlat === "function") window.reparerPionsAPlat(data);

            // LE CERVEAU, QUAND IL TIENT DÉJÀ CE COMBAT, EST LA SEULE AUTORITÉ
            // SUR LA POSITION. Ce document (Combat_VTT) reste la vérité du
            // TERRAIN — murs, trous, apparence d'un pion — mais sa carte
            // `Tokens` ne reçoit plus une seule écriture de position depuis
            // que les déplacements vivent dans l'état du cerveau : elle se
            // fige au moment où le combat s'ouvre, sauf pour les rares
            // écritures encore couturées (une Illusion qui range son image).
            //
            // Avant ce filet, CHAQUE instantané de ce document — un mur posé,
            // une Illusion qui naît — reposait cette photo figée par-dessus
            // les positions à jour de tout le monde : les pions sautaient en
            // arrière d'un coup, le temps que la prochaine action du cerveau
            // les remette en place. Voir fusionnerPionsVTT (pont_combat.js) :
            // on reprend de Firestore ce que le cerveau ignore (l'apparence),
            // jamais ce qu'il sait mieux (la position).
            const etatCerveauOuvert = typeof window.regimeDuJeu === "function" && window.regimeDuJeu()
                && window.regimeDuJeu().etatPublie();
            const combattantsDuCerveau = etatCerveauOuvert ? etatCerveauOuvert.combattants : null;

            // 🔻 NOUVEAU : Lecture des Pions (Tokens) depuis Firebase 🔻
            if (data.Tokens !== undefined) {
                // UN PION EN PLEINE MARCHE GARDE SA POSITION. La case d'arrivée
                // et l'ordre d'animer voyagent dans deux documents différents,
                // et rien ne garantit l'ordre d'arrivée : quand la case gagnait
                // la course, le pion se téléportait à destination, puis
                // l'animation le ramenait au départ pour rejouer son trajet —
                // avec, au passage, la mise en scène des attaques
                // d'opportunité qu'il venait pourtant de subir.
                // DEUX CHOSES DIFFÉRENTES, ET C'EST TOUT LE POINT :
                //  — TOKENS_VTT_DATA porte la VÉRITÉ DE LA BASE. C'est elle que
                //    lisent les portées, les cases occupées, le calcul de
                //    chemin : ce qui doit raisonner juste, même quand l'écran
                //    est en retard.
                //  — l'ÉCRAN, lui, garde le pion là où il est tant que le
                //    journal ne l'a pas fait marcher ici (redessinerPions).
                // Ranger la position protégée dans TOKENS_VTT_DATA, comme
                // avant, effaçait la case d'arrivée : le pion revenait à son
                // point de départ sitôt le trajet rejoué.
                window.TOKENS_VTT_DATA = (combattantsDuCerveau && window.pontCombat
                                          && typeof window.pontCombat.fusionnerPionsVTT === "function")
                    ? window.pontCombat.fusionnerPionsVTT(data.Tokens, window.TOKENS_VTT_DATA, combattantsDuCerveau)
                    : (data.Tokens || {});
                if (typeof window.redessinerPions === "function") window.redessinerPions();
            } else if (!combattantsDuCerveau) {
                window.TOKENS_VTT_DATA = {};
                if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT({});
            }

            // 🔻 NOUVEAU : Zones persistantes (Persistance de terrain) 🔻
            //
            // Une fois le combat ouvert sous le cerveau, ce champ ne reçoit
            // plus une seule écriture (les nappes vivent dans l'état, voir
            // moteur_pur.js/creerZonePure) : il reste figé sur ce qu'il
            // valait à l'ouverture, le plus souvent rien. Le relire ici
            // effacerait, à chaque instantané de ce document, une zone que
            // le cerveau vient pourtant de poser — jusqu'à ce que sa propre
            // projection (poserZones, regime_cerveau.js) la redessine.
            if (!combattantsDuCerveau) {
                window.ZONES_PERSISTANTES = data.Zones_Persistantes || {};
                if (typeof window.appliquerZonesPersistantes === "function") {
                    window.appliquerZonesPersistantes();
                }
            }
        }
    });
};

// La fonction qui peint l'image, l'échelle ET L'OPACITÉ
window.appliquerTerrain = function(url, scale, opacity) {
    if (!window.PLATEAU_VTT) return;
    const imgEl = document.getElementById("image-map-vtt");
    const conteneurTransform = document.getElementById("transform-plateau");
    if (!imgEl || !conteneurTransform) return;

    // Fond de carte de combat : souvent une image generee en tres haute resolution, inutile
    // de la faire decoder a taille reelle par l'iPad. On compare/assigne toujours CETTE
    // version (jamais l'URL brute) pour que le test anti-rechargement reste cohérent.
    const url2 = url && typeof window.redimensionnerImageCloudinary === "function"
        ? window.redimensionnerImageCloudinary(url, 2200)
        : url;

    // Anti-scintillement global (URL, Taille, Opacité)
    if (urlsVTTIdentiques(imgEl.src, url2) && window.PLATEAU_VTT.hexSize === scale && Math.abs(window.PLATEAU_VTT.gridOpacity - opacity) < 0.001) return;

    window.PLATEAU_VTT.hexSize = scale;
    window.PLATEAU_VTT.hexWidth = 2 * scale;
    window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * scale;
    
    // Application de l'opacité
    window.PLATEAU_VTT.gridOpacity = opacity;
    
    const labelTaille = document.getElementById("label-taille-hexa");
    if (labelTaille) labelTaille.innerText = scale;
    
    const labelOpa = document.getElementById("label-opacite-hexa");
    if (labelOpa) labelOpa.innerText = opacity.toFixed(1);

    const appliquerMapChargee = function() {
        imgEl.style.display = "block";
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        conteneurTransform.style.width = w + "px";
        conteneurTransform.style.height = h + "px";
        window.PLATEAU_VTT.resize(w, h);
        window.PLATEAU_VTT.renderMap();
        window.centrerPlateau();
        
        // 🔻 CORRECTION : On place les pions UNE FOIS que l'image a donné ses dimensions !
        if (typeof window.appliquerTokensVTT === "function") {
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }
    };

    if (!urlsVTTIdentiques(imgEl.src, url2) && url !== "") {
        imgEl.onload = appliquerMapChargee;
        imgEl.src = url2;
        if (imgEl.complete && imgEl.naturalWidth > 0) appliquerMapChargee();
    } else {
        // Changement d'échelle/opacité seul, ou repeinture sans nouvelle image
        window.PLATEAU_VTT.renderMap();
        
        // 🔻 CORRECTION : On replace les pions si le MJ change la taille de la grille en direct !
        if (typeof window.appliquerTokensVTT === "function") {
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }
    }
};

window.chargerMapTest = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;

    const imgUrl = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789076932/arene_s5qs3e.png";
    const scale = window.PLATEAU_VTT ? window.PLATEAU_VTT.hexSize : 60;
    const opacity = window.PLATEAU_VTT ? window.PLATEAU_VTT.gridOpacity : 0.8;
    
    console.log("[VTT] Envoi de la map en base de données...");

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            URL_Map: imgUrl,
            Taille_Hex: scale,
            Opacite_Grille: opacity
        }, { merge: true });
    } catch(e) {
        console.error("Erreur synchro map :", e);
    }
};

window.sauvegarderEchelleVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    
    const imgEl = document.getElementById("image-map-vtt");
    const url = imgEl ? imgEl.src || "" : "";
    const btn = document.getElementById("btn-ok-echelle");
    if (btn) btn.innerText = "⏳";

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            URL_Map: url,
            Taille_Hex: window.PLATEAU_VTT.hexSize
        }, { merge: true });
        
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro échelle :", e);
        if (btn) btn.innerText = "❌";
    }
};

// =========================================================================
//  GESTION DEV : PIONS (TOKENS) SUR LA TABLE VIRTUELLE
// =========================================================================
window.TOKENS_VTT_DATA = window.TOKENS_VTT_DATA || {};
window.TOKEN_SELECTIONNE = window.TOKEN_SELECTIONNE ?? null;
window.VTT_MODE_DEPLACEMENT = false;

let vttClicStartX = 0;
let vttClicStartY = 0;

document.addEventListener("mousedown", e => { vttClicStartX = e.clientX; vttClicStartY = e.clientY; });
document.addEventListener("touchstart", e => { if (e.touches.length > 0) { vttClicStartX = e.touches[0].clientX; vttClicStartY = e.touches[0].clientY; } });

window.toggleModeDeplacementToken = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    window.VTT_MODE_DEPLACEMENT = !window.VTT_MODE_DEPLACEMENT;
    
    const btn = document.getElementById("btn-move-token");
    if (btn) {
        if (window.VTT_MODE_DEPLACEMENT) {
            btn.classList.add("actif");
            btn.style.filter = "drop-shadow(0 0 15px rgba(255, 215, 0, 0.9))";
        } else {
            btn.classList.remove("actif");
            btn.style.filter = "drop-shadow(0 0 8px rgba(255,255,255,0.3))";
            window.TOKEN_SELECTIONNE = null;
            const label = document.getElementById("label-taille-token");
            if (label) label.innerText = "--";
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }
    }
};

// Clic global (Sélection, Déplacement ou Désélection)
document.addEventListener("click", async function(event) {
    if (Math.abs(event.clientX - vttClicStartX) > 10 || Math.abs(event.clientY - vttClicStartY) > 10) return;

    // 🔻 NOUVEAU : On ignore le clic s'il est sur la piste d'initiative
    // LE HUD N'EST PAS LE PLATEAU. Ce qu'on y clique (fin de tour, engrenage,
    // repos long) ne doit ni tracer un pas de déplacement, ni tomber dans la
    // désélection « clic dans le vide » du bas de cette fonction : celle-ci
    // remet TOKEN_SELECTIONNE à null et redessine les pions, ce qui EFFACE au
    // passage les anneaux du ciblage que le bouton fin de tour vient tout juste
    // d'ouvrir. Du temps où le ciblage partait du bouton « Appliquer », posé
    // sur l'aperçu de la carte, le cas ne pouvait pas se produire.
    if (event.target.closest(".token-vtt") || event.target.closest("#menu-dev-combat")
        || event.target.closest("#piste-initiative") || event.target.closest("#combat-hud-bas-droite")
        || event.target.closest("#volet-competences")
        || event.target.closest("#apercu-carte-hd-competence")) return;

    // UN CLIC SUR LA CARTE REFERME LE VOLET. C'est la seconde façon de le
    // ranger, avec son bouton — et la plus naturelle : on a vu ses techniques,
    // on revient au plateau. Les exclusions ci-dessus comptent autant que la
    // ligne elle-même : cliquer DANS le volet, sur une bannière ou sur la carte
    // ouverte en grand, ce n'est pas cliquer sur la carte du monde.
    if (window.VOLET_COMPETENCES_OUVERT && typeof window.fermerVoletCompetences === "function") {
        window.fermerVoletCompetences();
    }

    if (window.TOKEN_SELECTIONNE) {
        
        // 🔻 NOUVEAU : VERIFIER SI C'EST MON TOUR POUR TRACER UN CHEMIN 🔻
        const partie = window.PARTIE_DATA || {};
        const queue = partie.File_Attente_Combat || [];
        const phase = partie.Phase_Combat || "Preparation";
        const monId = localStorage.getItem("ID_JOUEUR_COURANT");
        const persoSelectionne = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === window.TOKEN_SELECTIONNE);
        
        const estMonTour = (
            phase === "Resolution" &&
            queue.length > 0 &&
            queue[0].idPersonnage === window.TOKEN_SELECTIONNE &&
            persoSelectionne && persoSelectionne.idJoueur === monId
        );
        // Le déplacement ne se referme plus après une première validation : tant
        // que la carte n'est pas lancée (et son lancement met fin au tour), le
        // personnage peut repartir d'où il s'est arrêté. Le barème du coût, lui,
        // continue de grimper — cf. window.pasDejaParcourus.

        // L'Immobilisation bloque tout déplacement volontaire (mais pas les
        // déplacements subis comme Poussée/Traction/Peur, qui ne passent pas par ce clic de
        // tracé de chemin).
        const estImmobilise = persoSelectionne && persoSelectionne.Etats_Alteres
            && persoSelectionne.Etats_Alteres.some(e => e.nom === "Immobilisation");

        if (estMonTour && estImmobilise && !window.VTT_MODE_DEPLACEMENT) {
            const tk = window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE];

            if (tk && typeof window.afficherMessageFlottantHex === "function") {
                window.afficherMessageFlottantHex(tk.q, tk.r, "Immobilisé !", "#aaaaaa");
            }
            return;
        }

        if (estMonTour && !window.VTT_MODE_DEPLACEMENT) {
            const conteneur = document.getElementById("conteneur-plateau-vtt");
            if (conteneur && conteneur.contains(event.target) && window.PLATEAU_VTT) {
                const canvasX = (event.clientX - window.VTT_POS_X) / window.VTT_SCALE;
                const canvasY = (event.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
                const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
                
                // Initialise le point de départ du chemin
                if (window.CHEMIN_MOUVEMENT.length === 0) {
                    window.CHEMIN_START_NODE = {
                        q: window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].q,
                        r: window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].r
                    };
                }
                
                window.ajouterEtapeMouvement(hex.q, hex.r);
                return;
            }
        }

        if (window.VTT_MODE_DEPLACEMENT) {
            const conteneur = document.getElementById("conteneur-plateau-vtt");
            if (conteneur && conteneur.contains(event.target) && window.PLATEAU_VTT) {
                
                const canvasX = (event.clientX - window.VTT_POS_X) / window.VTT_SCALE;
                const canvasY = (event.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
                const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
                
                const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                // Même règle que pour un déplacement de combat : seuls les pions
                // réellement présents et debout occupent une case. L'ancien
                // décompte prenait aussi les morts (dont le pion a disparu) et les
                // fantômes, et refusait des cases visiblement libres.
                const isOccupied = window.caseOccupeeParVivant(hex.q, hex.r);

                if (!state.isDeleted && !state.isBlocked && !isOccupied) {
                    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
                    
                    window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].q = hex.q;
                    window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].r = hex.r;
                    
                    window.TOKEN_SELECTIONNE = null;
                    const label = document.getElementById("label-taille-token");
                    if (label) label.innerText = "--";
                    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

                    // L'écriture était silencieuse : si elle échouait, le pion
                    // semblait déplacé à l'écran puis revenait à sa case au premier
                    // rafraîchissement, sans que rien ne l'explique.
                    if (!window.ID_PARTIE_COURANTE) {
                        console.warn("Déplacement libre non enregistré : aucune partie ouverte.");
                    } else {
                        try {
                            await window.enregistrerPionsVTT(window.TOKEN_SELECTIONNE);
                        } catch (e) {
                            console.error("Déplacement libre : enregistrement du pion impossible.", e);
                        }
                    }
                    
                    return; 
                }
            }
        }

        window.TOKEN_SELECTIONNE = null;
        const label = document.getElementById("label-taille-token");
        if (label) label.innerText = "--";
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
});

window.changerTailleToken = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (!window.TOKEN_SELECTIONNE) {
        alert("Sélectionnez d'abord un pion sur la carte en cliquant dessus.");
        return;
    }
    
    let tokenData = window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE];
    if (!tokenData) return;
    
    let taille = tokenData.taille || 55;
    taille += delta;
    if (taille < 20) taille = 20; 
    if (taille > 400) taille = 400; 
    
    tokenData.taille = taille;
    const label = document.getElementById("label-taille-token");
    if (label) label.innerText = taille;
    
    // Redessine localement et instantanément
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
};

window.sauvegarderTailleToken = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.TOKEN_SELECTIONNE) return;
    
    const btn = document.getElementById("btn-ok-taille-token");
    if (btn) btn.innerText = "⏳";

    try {
        await window.enregistrerPionsVTT(window.TOKEN_SELECTIONNE);
        
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro taille token :", e);
        if (btn) btn.innerText = "❌";
    }
};

// =========================================================================
//  GESTION DU FOCUS ET DE LA CAMÉRA (PANNEAU ET CARTE)
// =========================================================================

// LA VISIONNEUSE A ÉTÉ SUPPRIMÉE, ET C'ÉTAIT LE PLUS URGENT DE CE MÉNAGE.
//
// Trois fonctions vivaient ici : afficherDansPanneauGauche, qui installait dans
// le panneau le combattant qu'on venait de cliquer — créature comprise — en
// REMPLAÇANT window.COMBAT_PERSOS_JOUEUR par [lui] et en mettant la vraie liste
// de côté dans COMBAT_PERSOS_JOUEUR_BACKUP ; restaurerPanneauGauche, qui
// défaisait l'échange ; et panneauVerrouilleParIA, qui empêchait une créature
// de s'y installer au milieu du sort d'une autre.
//
// C'ÉTAIT UNE VISIONNEUSE QUI SE FAISAIT PASSER POUR UNE AUTORITÉ, et elle a
// coûté trois défauts distincts, signalés trois fois par le joueur : le bouton
// de fin de tour éteint, la carte qui refusait de se lancer, et le combat qu'on
// ne pouvait plus démarrer. À chaque fois, du code demandait « qui joue ? » ou
// « à qui est cette carte ? » à COMBAT_PERSOS_JOUEUR, et recevait la réponse
// « au gnoll qu'on regarde ».
//
// Sans le panneau, l'échange n'a plus d'objet : COMBAT_PERSOS_JOUEUR est la
// liste des héros de ce poste, elle ne bouge plus, et le piège ne peut pas
// revenir. Les gardes qu'il avait fallu poser (mesHerosDeCombat, herosDuPoste,
// lanceurDuCiblage) restent justes, mais elles n'ont plus rien à contourner.
//
// Cliquer sur un pion le SÉLECTIONNE, et c'est tout ce que ça fait.

window.centrerMapSurToken = function(idPersonnage) {
    if (!window.PLATEAU_VTT || !window.TOKENS_VTT_DATA || !window.TOKENS_VTT_DATA[idPersonnage]) return;
    
    const data = window.TOKENS_VTT_DATA[idPersonnage];
    const px = window.PLATEAU_VTT.hexToPixel(data.q, data.r);
    
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur) return;
    
    const winW = conteneur.offsetWidth || window.innerWidth;
    const winH = conteneur.offsetHeight || window.innerHeight;
    
    // Ajout d'une transition CSS temporaire pour un mouvement de caméra fluide
    const conteneurTransform = document.getElementById("transform-plateau");
    if (conteneurTransform) {
        conteneurTransform.style.transition = "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";
        setTimeout(() => { if (conteneurTransform) conteneurTransform.style.transition = "none"; }, 400);
    }

    // Les pions vivent hors du calque zoomé : ils doivent glisser au même rythme que la caméra
    if (!window.ANIMATION_VTT_EN_COURS) {
        const calqueTokens = document.getElementById("conteneur-tokens-vtt");
        if (calqueTokens) {
            calqueTokens.querySelectorAll(".token-vtt").forEach(div => {
                div.style.transition = "left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), top 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";
                setTimeout(() => { div.style.transition = "none"; }, 400);
            });
        }
    }

    // Calcul pour centrer le point exact au milieu de l'écran
    window.VTT_POS_X = (winW / 2) - (px.x * window.VTT_SCALE);
    window.VTT_POS_Y = (winH / 2) - (px.y * window.VTT_SCALE);
    
    window.appliquerTransformPlateau();
};

window.selectionnerEtCentrerPerso = function(idPersonnage) {
    window.TOKEN_SELECTIONNE = idPersonnage;
    
    if (window.TOKENS_VTT_DATA && window.TOKENS_VTT_DATA[idPersonnage]) {
        const dataToken = window.TOKENS_VTT_DATA[idPersonnage];
        const label = document.getElementById("label-taille-token");
        if (label) label.innerText = dataToken.taille || 55;
        
        window.centrerMapSurToken(idPersonnage);
    }
    
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
};

// =========================================================================
//  SUPPRESSION D'UN PION (TOKEN) ET AUTO-DESTRUCTION DES ENNEMIS
// =========================================================================
window.supprimerTokenVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (!window.TOKEN_SELECTIONNE) {
        alert("Sélectionnez d'abord un pion sur la carte en cliquant dessus.");
        return;
    }
    if (!confirm("Voulez-vous vraiment retirer ce pion de la carte tactique ?")) return;

    const idSupprime = window.TOKEN_SELECTIONNE;
    const persoCible = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idSupprime);
    const estEnnemi = persoCible && persoCible.camp === "Ennemi";

    // 1. Suppression dans la mémoire locale
    delete window.TOKENS_VTT_DATA[idSupprime];
    window.TOKEN_SELECTIONNE = null;
    
    const label = document.getElementById("label-taille-token");
    if (label) label.innerText = "--";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

    if (!window.ID_PARTIE_COURANTE) return;
    try {
        const { doc, getDoc, updateDoc, deleteDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        
        // 2. On le retire du plateau partagé
        await updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            ["Tokens." + idSupprime]: deleteField()
        });

        // 3. Si c'est un Ennemi, on purge l'initiative et la Base de données !
        if (estEnnemi) {
            // Sous transaction, comme toute modification de la file : retirer une
            // créature ne doit pas effacer la carte qu'un joueur vient de poser.
            await window.modifierPartie((data) => {
                let ordre = data.Ordre_Initiative || [];
                let file = data.File_Attente_Combat || [];
                let phase = data.Phase_Combat || "Preparation";

                ordre = ordre.filter(id => id !== idSupprime);
                file = file.filter(item => item.idPersonnage !== idSupprime);

                // Le combattant retiré ne doit plus être attendu : on le sort
                // aussi des deux listes de suivi du round.
                const horsJeu = (data.Combattants_Hors_Jeu || []).filter(id => id !== idSupprime);
                const ontJoue = (data.Ont_Joue_Ce_Round || []).filter(id => id !== idSupprime);

                if (phase === "Preparation"
                    && window.toutLeMondeAJoue({ ...data, Ordre_Initiative: ordre,
                                                 Combattants_Hors_Jeu: horsJeu,
                                                 Ont_Joue_Ce_Round: ontJoue }, file)) {
                    phase = "Resolution";
                }

                return { maj: {
                    Ordre_Initiative: ordre,
                    File_Attente_Combat: file,
                    Phase_Combat: phase,
                    Combattants_Hors_Jeu: horsJeu,
                    Ont_Joue_Ce_Round: ontJoue
                } };
            });
            
            // refCombattant : l'ennemi vit désormais dans la collection Monstres, mais un
            // pion retiré peut aussi être une illusion restée dans Personnages.
            await deleteDoc(window.refCombattant(idSupprime));
            if (window.SOURCE_COMBATTANTS) delete window.SOURCE_COMBATTANTS[idSupprime];
            console.log(`💀 L'ennemi ${idSupprime} a été incinéré pour garder la BDD propre.`);
        }
        
    } catch (e) {
        console.error("Erreur lors de la suppression du token :", e);
    }
};

window.genererTokensCombat = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT || !window.PERSOS_PARTIE) return;

    let tokensData = { ...window.TOKENS_VTT_DATA };
    const nouveaux = [];

    window.PERSOS_PARTIE.forEach(perso => {
        if (perso.statut === "Mort") return;

        const imgToUse = perso.urlToken || perso.urlCloudinary;
        if (!imgToUse) return;

        if (!tokensData[perso.idPersonnage]) {
            const hexLibre = window.trouverHexLibreAutour(
                tokensData, window.pointApparition(perso.camp), 2);
            tokensData[perso.idPersonnage] = {
                q: hexLibre.q,
                r: hexLibre.r,
                url: imgToUse,
                taille: 55
            };
            nouveaux.push(perso.idPersonnage);
        }
    });

    // Seuls les pions qu'on vient de créer sont écrits : renvoyer toute la carte
    // remettrait au passage les positions périmées des autres.
    if (nouveaux.length > 0) {
        window.TOKENS_VTT_DATA = tokensData;
        // Dessinés tout de suite : le déploiement se voit sans attendre
        // l'aller-retour réseau, comme partout ailleurs sur le plateau.
        if (typeof window.appliquerTokensVTT === "function") {
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }
        await window.enregistrerPionsVTT(...nouveaux);
    }
};

// =========================================================================
//  L'AFFICHAGE DES TOKENS, DE L'OMBRE AU SOL ET DE L'ANNEAU MAGIQUE
// =========================================================================

// Le pion vit hors du calque zoomé : sa position ET sa taille sont recalculées
// en pixels écran. C'est ce qui garde l'image nette au zoom sur iPad.
window.positionnerTokenVTT = function(divToken, majEchelle) {
    if (!divToken || !window.PLATEAU_VTT) return;

    const echelle = window.VTT_SCALE;
    const px = window.PLATEAU_VTT.hexToPixel(parseFloat(divToken.dataset.q), parseFloat(divToken.dataset.r));

    divToken.style.left = (window.VTT_POS_X + px.x * echelle) + "px";
    divToken.style.top = (window.VTT_POS_Y + px.y * echelle) + "px";

    if (!majEchelle) return;

    const taille = parseFloat(divToken.dataset.taille) || 55;

    divToken.style.width = (taille * echelle) + "px";
    divToken.style.height = (taille * echelle) + "px";

    // L'ombre au sol et le halo de sélection sont en %/scale : ils se redimensionnent seuls
    // avec le pion, sans aucun recalcul JS ici.
};

let echelleTokensAppliquee = null;

window.repositionnerTokensVTT = function() {
    const conteneur = document.getElementById("conteneur-tokens-vtt");
    if (!conteneur) return;

    // Le simple déplacement ne touche qu'à left/top : on évite de recalculer les flous à chaque frame
    const echelleModifiee = echelleTokensAppliquee !== window.VTT_SCALE;
    conteneur.querySelectorAll(".token-vtt").forEach(div => window.positionnerTokenVTT(div, echelleModifiee));
    echelleTokensAppliquee = window.VTT_SCALE;
};

// =========================================================================
//  HALO VECTORIEL GÉNÉRIQUE (sélection, bouclier magique...) : nappe diffuse
//  + filaments qui tournent en pointillés décalés + étincelles. Purement en
//  SVG (viewBox) : suit le zoom nativement, le flou vient du SVG en unités
//  de viewBox (jamais un filtre CSS en pixels) donc aucun artefact iPad.
// =========================================================================
function construireHaloVTT(options) {
    const idFiltre = options.idFiltre;
    const vitesse = options.vitesse || 1; // >1 = plus lent

    if (!document.getElementById("anim-halo-vtt")) {
        const styleHalo = document.createElement("style");
        styleHalo.id = "anim-halo-vtt";
        styleHalo.innerHTML = `
            @keyframes haloTourne     { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
            @keyframes haloTourneInv  { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
            @keyframes haloRespire    { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.95; } }
            @keyframes haloScintille  { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
            /* L'origine des rotations est le centre du viewBox, pas la boite de l'element */
            .halo-couche { transform-box: view-box; transform-origin: 50px 50px; }
        `;
        document.head.appendChild(styleHalo);
    }

    const halo = document.createElement("div");
    halo.style.position = "absolute";
    halo.style.top = "0";
    halo.style.left = "0";
    halo.style.width = "100%";
    halo.style.height = "100%";
    halo.style.pointerEvents = "none";

    let etincellesSvg = "";
    for (let e = 0; e < options.nbEtincelles; e++) {
        const rad = (Math.random() * 360) * Math.PI / 180;
        const dist = 50 + Math.random() * 4;
        const cx = (50 + dist * Math.cos(rad)).toFixed(1);
        const cy = (50 + dist * Math.sin(rad)).toFixed(1);
        const rayon = (0.5 + Math.random() * 0.9).toFixed(2);
        const duree = ((1.1 + Math.random() * 1.9) * vitesse).toFixed(2);
        const delai = (-Math.random() * 3).toFixed(2);
        etincellesSvg += `<circle cx="${cx}" cy="${cy}" r="${rayon}" fill="${options.couleurEtincelle}"
            filter="url(#halo-flou-${idFiltre})" style="animation: haloScintille ${duree}s ease-in-out ${delai}s infinite;"/>`;
    }

    halo.innerHTML = `
        <svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow: visible;">
            <defs>
                <filter id="halo-flou-${idFiltre}" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="1.1"/>
                </filter>
                <filter id="halo-flou-large-${idFiltre}" x="-70%" y="-70%" width="240%" height="240%">
                    <feGaussianBlur stdDeviation="4.5"/>
                </filter>
            </defs>

            <!-- Nappe de lumière diffuse qui déborde du bord du médaillon -->
            <circle cx="50" cy="50" r="49" fill="none" stroke="${options.couleurNappe}" stroke-width="7"
                    filter="url(#halo-flou-large-${idFiltre})"
                    style="animation: haloRespire ${(3.4 * vitesse).toFixed(1)}s ease-in-out infinite;"/>

            <!-- Filaments : pointillés décalés, vitesses/sens différents = tressage lumineux -->
            <g class="halo-couche" style="animation: haloTourne ${(7 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="50.5" fill="none" stroke="${options.couleursFilaments[0]}" stroke-width="1.2"
                        stroke-linecap="round" stroke-dasharray="16 11 5 21 9 26"
                        filter="url(#halo-flou-${idFiltre})"/>
            </g>
            <g class="halo-couche" style="animation: haloTourneInv ${(11 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="48.5" fill="none" stroke="${options.couleursFilaments[1]}" stroke-width="0.9"
                        stroke-linecap="round" stroke-dasharray="9 17 22 8 13 19"
                        filter="url(#halo-flou-${idFiltre})"/>
            </g>
            <g class="halo-couche" style="animation: haloTourne ${(16 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="52" fill="none" stroke="${options.couleursFilaments[2]}" stroke-width="0.6"
                        stroke-linecap="round" stroke-dasharray="5 27 11 33 7 24"
                        filter="url(#halo-flou-${idFiltre})" opacity="0.95"/>
            </g>
            <g class="halo-couche" style="animation: haloTourneInv ${(5.5 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="47" fill="none" stroke="${options.couleursFilaments[3]}" stroke-width="0.7"
                        stroke-linecap="round" stroke-dasharray="7 23 14 29"
                        filter="url(#halo-flou-${idFiltre})" opacity="0.88"/>
            </g>

            <!-- Étincelles -->
            <g class="halo-couche" style="animation: haloTourne ${(26 * vitesse).toFixed(1)}s linear infinite;">
                ${etincellesSvg}
            </g>
        </svg>
    `;

    return halo;
}

// =========================================================================
//  LES COMBATTANTS À TERRE
// =========================================================================
//  Un combattant mort disparaît complètement du plateau : plus de pion, donc
//  rien à cliquer, et sa case redevient libre. Ces deux fonctions sont le seul
//  endroit qui décide "qui est mort", pour que l'affichage, les clics et les
//  déplacements ne puissent jamais se contredire.
// =========================================================================
// L'ICÔNE D'UN ÉTAT, OU RIEN DU TOUT.
//
// Trois endroits dessinaient <img src="${etat.icone}"> sans se demander si
// l'icône existait. Un état sans icône — l'Étalement en est un, et tout état
// posé par le cerveau l'était avant qu'il ne transmette la sienne — donnait
// donc `src="undefined"`, une requête 404 en boucle dans la console et un
// rectangle d'image cassée sous le portrait du héros, dans la piste
// d'initiative. Un état sans visage ne se dessine pas : il ne casse rien.
window.imageEtat = function(etat, taille) {
    if (!etat || !etat.icone) return "";
    return `<img src="${etat.icone}" style="width: ${taille}px; height: auto; border: none;`
         + ` background: transparent; box-shadow: none;`
         + ` filter: drop-shadow(0 ${taille > 30 ? 4 : 2}px ${taille > 30 ? 6 : 4}px rgba(0,0,0,0.85));">`;
};

// L'ESQUIVE SE VOIT : LE PION RECULE.
//
// Elle avait DEUX moitiés dans l'ancien moteur — le mot qui monte (« Esquivé 💨 »
// ou « Paré 🛡️ ») et le pion qui se dérobe, un pas en arrière puis retour. Le
// nouveau régime ne reprenait que la première : à l'écran, une attaque esquivée
// par une créature ne se voyait pas bouger, et on croyait que rien ne s'était
// passé.
//
// La voici pour de bon, et à un seul endroit cette fois : elle prend la case de
// l'attaquant pour savoir DE QUEL CÔTÉ se dérober.
window.animerEsquive = function({ idCible, depuis, texte, couleur }) {
    const tkCible = (window.TOKENS_VTT_DATA || {})[idCible];
    if (!tkCible) return;

    if (typeof window.afficherMessageFlottantHex === "function") {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r,
                                          texte || "Esquivé 💨", couleur || "#cccccc");
    }

    const pion = document.getElementById("token-" + idCible);
    if (!pion || !depuis || !window.PLATEAU_VTT
        || typeof window.PLATEAU_VTT.hexToPixel !== "function") return;

    const pxAttaquant = window.PLATEAU_VTT.hexToPixel(depuis.q, depuis.r);
    const pxCible = window.PLATEAU_VTT.hexToPixel(tkCible.q, tkCible.r);
    const dx = pxCible.x - pxAttaquant.x;
    const dy = pxCible.y - pxAttaquant.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const echelle = window.VTT_SCALE || 1;
    const reculX = (dx / distance) * 25 * echelle;
    const reculY = (dy / distance) * 25 * echelle;

    // Un léger temps avant de se dérober : le mot a le temps de se lire.
    setTimeout(() => {
        pion.style.transition = "transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1)";
        pion.style.transform = `translate(calc(-50% + ${reculX}px), calc(-50% + ${reculY}px))`;
        setTimeout(() => {
            pion.style.transition = "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
            pion.style.transform = `translate(-50%, -50%)`;
            setTimeout(() => { pion.style.transition = "none"; }, 250);
        }, 150);
    }, 150);
};

window.estCombattantMort = function(idCombattant) {
    const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === idCombattant);
    if (!p) return false;
    // PV_Max est vérifié avant de conclure : un combattant dont les PV ne sont pas
    // encore chargés vaut 0 et passerait à tort pour un cadavre.
    const pvMax = window.pvMaxCombattant(p);
    const pv = parseInt(p.PV_Actuels) || 0;
    return p.statut === "Mort" || (pvMax > 0 && pv <= 0);
};

// Vrai seulement si un combattant ENCORE DEBOUT occupe la case.
window.caseOccupeeParVivant = function(q, r, tokensData) {
    const tokens = tokensData || window.TOKENS_VTT_DATA || {};
    for (let id in tokens) {
        if (tokens[id].q !== q || tokens[id].r !== r) continue;

        // Un pion fantôme — son combattant n'existe plus, fiche supprimée ou
        // monstre effacé — n'est plus dessiné sur le plateau : il ne doit pas
        // barrer la route non plus. Sinon on lit "Case occupée" sur une case
        // visiblement vide, et personne ne comprend pourquoi.
        if (!(window.PERSOS_PARTIE || []).some(p => p.idPersonnage === id)) continue;

        if (window.estCombattantMort(id)) continue;
        return true;
    }
    return false;
};

// =========================================================================
//  LES GOUTTES D'ÉTAT — VOIR D'UN COUP D'ŒIL QUI SUBIT QUOI
// =========================================================================
//  Nico l'a demandé en une phrase : « que d'un coup d'œil sur la map on
//  puisse voir les altérations d'état sur les belligérants ». Pas un texte à
//  lire, une couleur à reconnaître — un petit point discret en bas du pion,
//  un par état actif, avec juste assez de dégradé et d'ombre pour ressembler
//  à une goutte posée sur le médaillon plutôt qu'à un aplat plat.
//
//  Chaque état a SA couleur, choisie pour être reconnaissable sans hésiter :
//  le feu est orange, le poison est vert, le gel est bleu clair, etc. Un état
//  qui n'a pas encore la sienne (une nouveauté de la Forge) prend un gris
//  neutre plutôt que de disparaître — mieux vaut un point terne que rien.
window.COULEUR_ETAT = {
    "Étourdi":        "#f9a825",   // ambre — les étoiles qui tournent
    "Immobilisation": "#795548",   // brun — les racines qui retiennent
    "Confusion":      "#ab47bc",   // violet — les idées mélangées
    "Empoisonnement": "#66bb6a",   // vert — le poison classique
    "Brûlé":          "#e64a19",   // orange-rouge — la flamme
    "Glacé":          "#4fc3f7",   // bleu clair — la glace
    "Électrifié":     "#fdd835",   // jaune vif — l'éclair
    "Provocation":    "#c62828",   // rouge sombre — la rage qu'on impose
    "Absorption":     "#1e88e5",   // bleu profond — le bouclier qui draine
    "Étalement":      "#ad1457",   // bordeaux — la blessure qui continue de saigner
    "Élan":           "#26a69a",   // turquoise — la vitesse gagnée
    "Béni":           "#ffe082",   // or pâle — la bénédiction
    "Repli":          "#78909c"    // gris bleuté — le pas de recul défensif
};
window.COULEUR_ETAT_DEFAUT = "#9e9e9e";

//  PLUSIEURS ÉTATS, UN ARC DE CERCLE. Les empiler en colonne aurait vite
//  débordé sous un petit pion ; les aligner le long du bord bas, si, tient
//  toujours dans le même espace discret. L'arc s'élargit avec le nombre
//  d'états, mais reste borné à 130° : au-delà, les points glisseraient sur
//  les côtés du pion plutôt que de rester "en bas".
window.construireIndicateursEtatsToken = function(etats, taille) {
    // Un même état ne compte qu'une fois (il ne s'empile jamais sur la fiche
    // non plus) : deux points identiques ne diraient rien de plus qu'un seul.
    const noms = [...new Set((etats || []).map(e => e && e.nom).filter(Boolean))];
    if (noms.length === 0) return [];

    const n = noms.length;
    const t = taille || 55;
    const diametre = Math.max(5, Math.round(t * 0.115));
    const rayonPct = 37;                          // bien DANS le médaillon, pas sur son bord
    const etalement = Math.min(130, (n - 1) * 34); // écart total de l'arc, borné

    return noms.map((nom, i) => {
        // 90° = plein sud (le bas du pion, en coordonnées écran) ; l'arc se
        // déploie symétriquement de part et d'autre.
        const decalage = n === 1 ? 0 : -etalement / 2 + (etalement * i) / (n - 1);
        const rad = ((90 + decalage) * Math.PI) / 180;
        const x = 50 + rayonPct * Math.cos(rad);
        const y = 50 + rayonPct * Math.sin(rad);

        const couleur = window.COULEUR_ETAT[nom] || window.COULEUR_ETAT_DEFAUT;
        const point = document.createElement("div");
        point.className = "point-etat-token";
        point.dataset.etat = nom;
        point.title = nom;
        point.style.position = "absolute";
        point.style.left = x + "%";
        point.style.top = y + "%";
        point.style.width = diametre + "px";
        point.style.height = diametre + "px";
        point.style.borderRadius = "50%";
        point.style.transform = "translate(-50%, -50%)";
        point.style.zIndex = "4";
        point.style.pointerEvents = "none";
        // Le dégradé façon goutte : un reflet clair en haut-gauche (la lumière
        // qui accroche), la teinte de l'état au centre, assombrie sur le
        // pourtour — plus une ombre portée qui la détache du pion sans
        // l'alourdir. C'est ce mélange, pas la couleur seule, qui donne
        // l'impression d'une petite goutte posée là plutôt qu'un autocollant.
        point.style.background =
            "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85) 0%, "
            + couleur + " 42%, " + couleur + " 75%, rgba(0,0,0,0.35) 100%)";
        point.style.boxShadow = "0 1px 2px rgba(0,0,0,0.6)";
        point.style.border = "0.5px solid rgba(0,0,0,0.35)";
        return point;
    });
};

// LE VISAGE DES CRÉATURES, EN UN SEUL ENDROIT.
//
// Une créature n'a pas de portrait généré : son pion était jusqu'ici un disque
// rouge avec son nom écrit dedans, et ça se voyait — tous les ennemis d'une
// rencontre se ressemblaient, et un nom long finissait coupé en deux.
//
// Elle porte maintenant une image, la même pour tous, au format et à la taille
// de référence d'un pion de joueur (55). La constante vit ici parce que DEUX
// endroits en ont besoin : le plateau (ci-dessous) et la piste d'initiative.
// Les documents Monstres, eux, ne portent toujours aucune URL : ce n'est pas
// une donnée de la créature, c'est une décision d'affichage.
window.IMAGE_TOKEN_ENNEMI = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789309136/IMG_2137_mxyexl.png";

window.appliquerTokensVTT = function(tokensMap) {
    if (!window.PLATEAU_VTT) return;
    
    // VERROU ANTI-TÉLÉPORTATION : pendant qu'un pion marche, on ne redessine
    // pas la carte sous ses pieds. Mais un verrou levé depuis plus longtemps
    // qu'aucune animation ne dure n'est pas une marche en cours, c'est un verrou
    // oublié — et il empêchait alors TOUT redessin pour le reste du combat.
    if (typeof window.animationEnCours === "function"
        ? window.animationEnCours("ANIMATION_VTT_EN_COURS") : window.ANIMATION_VTT_EN_COURS) return;
    
    const conteneur = document.getElementById("conteneur-tokens-vtt");
    if (!conteneur) return;

    // Filet de sécurité : si le plateau a été (re)construit après la dernière synchro, le calque
    // des zones persistantes a disparu avec lui — on le redessine sans attendre un nouveau
    // snapshot Firestore (et sans rien refaire s'il est déjà là).
    if (Object.keys(window.ZONES_PERSISTANTES || {}).length > 0
        && !document.getElementById("svg-zones-persistantes")
        && typeof window.appliquerZonesPersistantes === "function") {
        window.appliquerZonesPersistantes();
    }

    // Les petites jauges qui apparaissent sous un pion pendant une animation de
    // dégâts vivent DANS le pion. Or le moindre changement en base redessine tous
    // les pions : la jauge était balayée en pleine descente, et on ne voyait donc
    // jamais la barre d'un ennemi bouger. On les met de côté et on les remet en
    // place : leurs animations, elles, continuent de tourner sur les mêmes
    // éléments.
    const jaugesEnCours = {};
    conteneur.querySelectorAll(".jauge-flash-token").forEach(jauge => {
        const pion = jauge.closest(".token-vtt");
        if (!pion || !pion.id) return;
        const id = pion.id.replace("token-", "");
        (jaugesEnCours[id] = jaugesEnCours[id] || []).push(jauge);
    });

    conteneur.innerHTML = "";

    for (let idPerso in tokensMap) {
        const data = tokensMap[idPerso];
        const taille = data.taille || 55;
        const pData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPerso);

        // Un combattant à terre disparaît purement et simplement du plateau : pas de pion,
        // donc rien à cliquer et rien qui barre le passage. Son entrée reste dans les Tokens
        // (sa case est mémorisée) mais elle n'est plus dessinée. Toutes les animations qui
        // cherchent un pion par son id gèrent déjà son absence.
        if (window.estCombattantMort(idPerso)) continue;

        // Pion fantôme : son combattant n'existe plus (fiche supprimée, monstre
        // effacé). On ne le dessine pas — il resterait un jeton vide et cliquable
        // au milieu du plateau. Le nettoyage de fin de combat le retire pour de bon.
        if (!pData) continue;

        const divToken = document.createElement("div");
        divToken.className = "token-vtt";
        divToken.style.position = "absolute";

        // La case et la taille de référence sont mémorisées : la position écran en découle à chaque zoom.
        // Les pions ne pivotent plus jamais : aucun angle n'est stocké ni appliqué.
        divToken.dataset.q = data.q;
        divToken.dataset.r = data.r;
        divToken.dataset.taille = taille;

        // Le conteneur reste fixe
        divToken.style.transform = `translate(-50%, -50%)`; 
        
        // Seuls des combattants debout arrivent ici : les morts ont été écartés plus haut.
        divToken.style.pointerEvents = "auto";
        divToken.style.cursor = "pointer";
        divToken.style.zIndex = "10";
        divToken.style.borderRadius = "50%";
        divToken.id = "token-" + idPerso;
        (jaugesEnCours[idPerso] || []).forEach(jauge => divToken.appendChild(jauge));

        // LA CROIX ROUGE SOUS LE PION : ON RENONCE À CE QU'ON ÉTAIT EN TRAIN DE
        // FAIRE, SANS PERDRE SON TOUR.
        //
        // Elle remplace l'ancienne bulle-validation-mouvement (fixe, en haut de
        // l'écran) : recréée ici à chaque passage, elle survit donc au redessin
        // des pions (une notification Firestore pendant qu'on réfléchit à son
        // chemin) — le même principe que jaugesEnCours juste au-dessus.
        //
        // Elle sert DEUX renoncements, et jamais les deux à la fois : le chemin
        // qu'on est en train de tracer, ou le ciblage qu'on vient d'ouvrir. Un
        // seul dessin pour les deux : deux croix côte à côte qui ne se
        // ressembleraient pas tout à fait, c'est un détail qui finit par se voir.
        const poserCroix = (classe, titre, action) => {
            const croix = document.createElement("div");
            croix.className = classe;
            croix.title = titre;
            croix.style.cssText = "position: absolute; bottom: -14px; right: -6px; width: 26px; height: 26px; background: #d32f2f; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; border: 2px solid white; box-shadow: 0 0 8px #d32f2f; cursor: pointer; z-index: 6;";
            croix.innerText = "✖";
            croix.onclick = (e) => { e.stopPropagation(); action(); };
            divToken.appendChild(croix);
        };

        // LE CIBLAGE PASSE DEVANT LE DÉPLACEMENT. Signalé en partie : « quand on
        // lance une compétence et que ça se met en mode ciblage, on ne peut plus
        // faire de déplacement ». C'était vrai : le seul renoncement offert était
        // le bouton « ANNULER » à côté de « RÉSOUDRE », et celui-là n'apparaît
        // qu'une fois une cible choisie. Tant qu'on n'avait visé personne, il n'y
        // avait aucune sortie — sauf finir son tour.
        //
        // La croix est sur le pion du LANCEUR, pas sur celui qui est sélectionné :
        // pendant un ciblage, la sélection suit ce qu'on vise.
        const lanceur = (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif
                         && typeof window.lanceurDuCiblage === "function")
            ? window.lanceurDuCiblage() : null;
        if (lanceur && idPerso === lanceur) {
            poserCroix("croix-annuler-ciblage", "Annuler le ciblage",
                       () => { if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage(); });
        } else if (!lanceur && idPerso === window.TOKEN_SELECTIONNE
                   && (window.CHEMIN_MOUVEMENT || []).length > 0) {
            poserCroix("croix-annuler-deplacement", "Annuler le déplacement",
                       () => window.annulerMouvement());
        }

        // 1️⃣ L'OMBRE PORTÉE : jeton posé à plat sur la table, lumière venant du haut.
        // C'est un disque de la taille du jeton, simplement décalé vers le bas : le médaillon
        // opaque en recouvre la majeure partie, et il n'en dépasse qu'un croissant au sud.
        // Dégradé radial plutôt qu'un filtre "blur" : ce dernier doit être recalculé en pixels à
        // chaque étape du zoom, ce qui laissait des résidus visuels sur iPad (Safari) pendant un
        // pincement rapide. Un dégradé se redimensionne nativement avec l'élément, sans recalcul JS.
        // Une Illusion n'en projette pas : ce n'est qu'un leurre immatériel, pas un vrai jeton posé.
        if (!pData || !pData.estIllusion) {
            const ombreSol = document.createElement("div");
            ombreSol.className = "token-ombre-sol";
            ombreSol.style.position = "absolute";
            ombreSol.style.top = "56%";  // Décalage vers le sud : c'est lui qui fait apparaître le croissant
            ombreSol.style.left = "50%";
            ombreSol.style.transform = "translate(-50%, -50%)";
            ombreSol.style.width = "97%";
            ombreSol.style.height = "97%";
            ombreSol.style.borderRadius = "50%";
            // Coeur dense et opaque, puis long fondu vers les bords : donne le flou du contact sans filtre CSS.
            // "closest-side" est indispensable ici : sans lui, un dégradé radial va par défaut jusqu'au
            // coin le plus éloigné (bien au-delà du cercle visible découpé par border-radius), donc le
            // fondu n'atteint jamais 0 avant d'être tronqué net par le border-radius. Avec closest-side,
            // le dégradé est calé sur le bord du cercle réellement visible : le fondu se termine pile là.
            // Coeur franchement opaque jusqu'à 75% du rayon, puis fondu concentré sur le dernier quart :
            // la zone visible (le croissant qui dépasse du médaillon) reste bien sombre, et seule
            // l'extrémité du dégradé s'estompe en douceur au lieu d'être coupée net.
            ombreSol.style.background = "radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.9) 75%, rgba(0,0,0,0.65) 90%, rgba(0,0,0,0) 100%)";
            ombreSol.style.zIndex = "-2";
            ombreSol.style.pointerEvents = "none";
            divToken.appendChild(ombreSol);
        }

        // 2️⃣ LE HALO DE SÉLECTION : couronne d'énergie dorée qui épouse le bord du médaillon.
        if (window.TOKEN_SELECTIONNE === idPerso) {
            const haloSelection = construireHaloVTT({
                idFiltre: "select-" + idPerso,
                vitesse: 1,
                nbEtincelles: 9,
                couleurNappe: "#ffdb94",
                couleursFilaments: ["#fff6dc", "#ffe9b4", "#ffffff", "#ffd589"],
                couleurEtincelle: "#fffaf0"
            });
            haloSelection.className = "token-halo-selection";
            haloSelection.style.zIndex = "-1"; // Derrière le médaillon : ne dépasse qu'au-delà de son bord
            divToken.appendChild(haloSelection);
        }

        // 3️⃣ LE HALO DU BOUCLIER MAGIQUE : même effet, en cyan et deux fois plus lent.
        // Placé devant le médaillon (contrairement au halo de sélection) : les deux se
        // superposent proprement quand un personnage protégé est sélectionné.
        if (pData && (parseInt(pData.Bouclier_Actuel) || 0) > 0) {
            const haloBouclier = construireHaloVTT({
                idFiltre: "bouclier-" + idPerso,
                vitesse: 2,
                nbEtincelles: 7,
                couleurNappe: "#5be8ff",
                couleursFilaments: ["#e0ffff", "#99f6ff", "#ffffff", "#5be8ff"],
                couleurEtincelle: "#eafeff"
            });
            haloBouclier.className = "token-halo-bouclier";
            haloBouclier.style.zIndex = "3"; // Devant le médaillon
            haloBouclier.style.opacity = "0.8"; // Un tout petit peu plus transparent que le rendu de base
            divToken.appendChild(haloBouclier);
        }

        // Gestion du Clic
        divToken.onclick = function(e) {
            e.stopPropagation();

            // 🔻 NOUVEAU : INTERCEPTION POUR LE CIBLAGE 🔻
            if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) {
                if (typeof window.ajouterCibleCiblage === "function") window.ajouterCibleCiblage(idPerso);
                return;
            }

            window.TOKEN_SELECTIONNE = idPerso;
            const label = document.getElementById("label-taille-token");
            if (label) label.innerText = taille;
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA); 
        };


        // 4️⃣ LE PION LUI-MÊME
        // Une créature n'a pas de portrait généré : elle porte l'image commune
        // des ennemis (IMAGE_TOKEN_ENNEMI), au même format et à la même taille
        // qu'un pion de joueur. On la construit À LA PLACE de l'image du
        // portrait plutôt qu'en plus : `data.url` est vide pour un monstre, et
        // un <img> vide afficherait l'icône de fichier cassé du navigateur.
        //
        // Son NOM ne s'écrit plus dessus. Il se lisait mal (un « Nécromancien »
        // ne tient pas dans 55 pixels), il encombrait le plateau dès que deux
        // créatures se touchaient, et il est de toute façon affiché en clair
        // dans le panneau latéral et dans la fenêtre sombre de tour.
        if (pData && pData.estMonstre) {
            const imgEnnemi = document.createElement("img");
            imgEnnemi.className = "token-img-main";
            imgEnnemi.src = typeof window.redimensionnerImageCloudinary === "function"
                ? window.redimensionnerImageCloudinary(window.IMAGE_TOKEN_ENNEMI, 700)
                : window.IMAGE_TOKEN_ENNEMI;
            imgEnnemi.style.position = "absolute";
            imgEnnemi.style.top = "0";
            imgEnnemi.style.left = "0";
            imgEnnemi.style.width = "100%";
            imgEnnemi.style.height = "100%";
            imgEnnemi.style.objectFit = "contain";
            imgEnnemi.style.zIndex = "2";
            imgEnnemi.style.pointerEvents = "none";
            imgEnnemi.onerror = () => { imgEnnemi.style.display = "none"; };
            divToken.appendChild(imgEnnemi);

            // 5️⃣ LES GOUTTES D'ÉTAT : un point par altération active, discret,
            // en bas du médaillon.
            if (pData.Etats_Alteres && pData.Etats_Alteres.length > 0) {
                window.construireIndicateursEtatsToken(pData.Etats_Alteres, taille)
                    .forEach(point => divToken.appendChild(point));
            }

            window.positionnerTokenVTT(divToken, true);
            conteneur.appendChild(divToken);
            continue;
        }

        const img = document.createElement("img");
        img.className = "token-img-main";
        img.src = typeof window.redimensionnerImageCloudinary === "function"
            ? window.redimensionnerImageCloudinary(data.url, 700)
            : data.url;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        // 🔻 CORRECTION DU BUG D'AFFICHAGE : On force la position absolue comme les ombres 🔻
        img.style.position = "absolute";
        img.style.top = "0";
        img.style.left = "0";
        img.style.zIndex = "2";
        img.onerror = () => { img.style.display = "none"; };
        // L'Illusion reprend le token du lanceur mais à 50% d'opacité, pour rester reconnaissable
        // comme un leurre plutôt qu'un vrai personnage.
        if (pData && pData.estIllusion) img.style.opacity = "0.4";

        divToken.appendChild(img);

        // 5️⃣ LES GOUTTES D'ÉTAT : même repère, pour un héros comme pour un
        // monstre — un problème se voit pareil des deux côtés du plateau.
        if (pData && pData.Etats_Alteres && pData.Etats_Alteres.length > 0) {
            window.construireIndicateursEtatsToken(pData.Etats_Alteres, taille)
                .forEach(point => divToken.appendChild(point));
        }

        window.positionnerTokenVTT(divToken, true);
        conteneur.appendChild(divToken);
    }

    echelleTokensAppliquee = window.VTT_SCALE;
};

// =========================================================================
//  NOUVEAU : CONTRÔLE ET SAUVEGARDE DE L'OPACITÉ
// =========================================================================

window.changerOpaciteGrille = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.PLATEAU_VTT) return;
    
    let nouvelleOpa = window.PLATEAU_VTT.gridOpacity + delta;
    
    // On bloque entre 0.0 (Invisible) et 1.0 (Noir pur)
    if (nouvelleOpa < 0) nouvelleOpa = 0;
    if (nouvelleOpa > 1) nouvelleOpa = 1;
    
    window.PLATEAU_VTT.gridOpacity = nouvelleOpa;
    
    const label = document.getElementById("label-opacite-hexa");
    if (label) label.innerText = nouvelleOpa.toFixed(1);
    
    window.PLATEAU_VTT.renderMap();
};

window.sauvegarderOpaciteVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    
    const btn = document.getElementById("btn-ok-opacite");
    if (btn) btn.innerText = "⏳";

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            Opacite_Grille: window.PLATEAU_VTT.gridOpacity
        }, { merge: true });
        
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro opacité :", e);
        if (btn) btn.innerText = "❌";
    }
};

window.changerTailleHexa = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.PLATEAU_VTT) return;
    
    let nouvelleTaille = window.PLATEAU_VTT.hexSize + delta;
    
    if (nouvelleTaille < 20) nouvelleTaille = 20; 
    if (nouvelleTaille > 250) nouvelleTaille = 250; 
    
    window.PLATEAU_VTT.hexSize = nouvelleTaille;
    window.PLATEAU_VTT.hexWidth = 2 * nouvelleTaille;
    window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * nouvelleTaille;
    
    const label = document.getElementById("label-taille-hexa");
    if (label) label.innerText = nouvelleTaille;
    window.PLATEAU_VTT.renderMap();
};

// LA MÉCANIQUE D'OUVERTURE DU PANNEAU LATÉRAL A ÉTÉ SUPPRIMÉE.
//
// PANNEAU_GAUCHE_OUVERT et togglePanneauGauche faisaient coulisser le panneau
// hors champ et le rappelaient, et plusieurs coins du jeu s'en accommodaient :
// la fenêtre de tour s'arrêtait à son bord, le menu de développement le
// refermait avant de descendre. Tout cela n'a plus d'objet.

// =========================================================================
//  GESTION DES PINCEAUX VTT (MURS, GOMME, DIFFICILE) ET EXCLUSIVITÉ
// =========================================================================

window.toggleModeEffacementHex = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (window.VTT_MODE_MURS) { window.VTT_MODE_MURS = false; document.getElementById("btn-murs-vtt")?.classList.remove("actif"); window.sauvegarderMurs(); }
    if (window.VTT_MODE_DIFFICILE) { window.VTT_MODE_DIFFICILE = false; document.getElementById("btn-difficile-vtt")?.classList.remove("actif"); window.sauvegarderTerrainDifficile(); }

    window.VTT_MODE_EFFACEMENT = !window.VTT_MODE_EFFACEMENT;
    const btn = document.getElementById("btn-gomme-vtt");
    if (btn) {
        if (window.VTT_MODE_EFFACEMENT) btn.classList.add("actif");
        else { btn.classList.remove("actif"); window.sauvegarderTuilesSupprimees(); }
    }
    if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
};

window.toggleModeMursHex = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (window.VTT_MODE_EFFACEMENT) { window.VTT_MODE_EFFACEMENT = false; document.getElementById("btn-gomme-vtt")?.classList.remove("actif"); window.sauvegarderTuilesSupprimees(); }
    if (window.VTT_MODE_DIFFICILE) { window.VTT_MODE_DIFFICILE = false; document.getElementById("btn-difficile-vtt")?.classList.remove("actif"); window.sauvegarderTerrainDifficile(); }

    window.VTT_MODE_MURS = !window.VTT_MODE_MURS;
    const btn = document.getElementById("btn-murs-vtt");
    if (btn) {
        if (window.VTT_MODE_MURS) btn.classList.add("actif");
        else { btn.classList.remove("actif"); window.sauvegarderMurs(); }
    }
    if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
};

window.toggleModeTerrainDifficileHex = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (window.VTT_MODE_EFFACEMENT) { window.VTT_MODE_EFFACEMENT = false; document.getElementById("btn-gomme-vtt")?.classList.remove("actif"); window.sauvegarderTuilesSupprimees(); }
    if (window.VTT_MODE_MURS) { window.VTT_MODE_MURS = false; document.getElementById("btn-murs-vtt")?.classList.remove("actif"); window.sauvegarderMurs(); }

    window.VTT_MODE_DIFFICILE = !window.VTT_MODE_DIFFICILE;
    const btn = document.getElementById("btn-difficile-vtt");
    if (btn) {
        if (window.VTT_MODE_DIFFICILE) btn.classList.add("actif");
        else { btn.classList.remove("actif"); window.sauvegarderTerrainDifficile(); }
    }
    if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
};

// --- SYNC FIREBASE ---
window.sauvegarderTuilesSupprimees = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    const deletedHexes = Object.keys(window.PLATEAU_VTT.gridState).filter(key => window.PLATEAU_VTT.gridState[key].isDeleted);
    try { await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tuiles_Supprimees: deletedHexes }, { merge: true }); } catch(e) {}
};

window.sauvegarderMurs = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    const blockedHexes = Object.keys(window.PLATEAU_VTT.gridState).filter(key => window.PLATEAU_VTT.gridState[key].isBlocked);
    try { await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tuiles_Murs: blockedHexes }, { merge: true }); } catch(e) {}
};

window.sauvegarderTerrainDifficile = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    const diffHexes = Object.keys(window.PLATEAU_VTT.gridState).filter(key => window.PLATEAU_VTT.gridState[key].isDifficult);
    try { await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tuiles_Difficiles: diffHexes }, { merge: true }); } catch(e) {}
};

window.appliquerTuilesSupprimees = function(tuilesList) {
    if (!window.PLATEAU_VTT) return;
    for (const key in window.PLATEAU_VTT.gridState) window.PLATEAU_VTT.gridState[key].isDeleted = false;
    if (Array.isArray(tuilesList)) tuilesList.forEach(key => { if (!window.PLATEAU_VTT.gridState[key]) window.PLATEAU_VTT.gridState[key] = {}; window.PLATEAU_VTT.gridState[key].isDeleted = true; });
    window.PLATEAU_VTT.renderMap();
};

window.appliquerMurs = function(tuilesList) {
    if (!window.PLATEAU_VTT) return;
    for (const key in window.PLATEAU_VTT.gridState) window.PLATEAU_VTT.gridState[key].isBlocked = false;
    if (Array.isArray(tuilesList)) tuilesList.forEach(key => { if (!window.PLATEAU_VTT.gridState[key]) window.PLATEAU_VTT.gridState[key] = {}; window.PLATEAU_VTT.gridState[key].isBlocked = true; });
    window.PLATEAU_VTT.renderMap();
};

window.appliquerTerrainDifficile = function(tuilesList) {
    if (!window.PLATEAU_VTT) return;
    for (const key in window.PLATEAU_VTT.gridState) window.PLATEAU_VTT.gridState[key].isDifficult = false;
    if (Array.isArray(tuilesList)) tuilesList.forEach(key => { if (!window.PLATEAU_VTT.gridState[key]) window.PLATEAU_VTT.gridState[key] = {}; window.PLATEAU_VTT.gridState[key].isDifficult = true; });
    window.PLATEAU_VTT.renderMap();
};

// =========================================================================
//  RENDU DES ZONES PERSISTANTES (Persistance de terrain)
//  Un calque SVG dédié, glissé DANS #transform-plateau (donc il suit le zoom et le pan comme
//  le reste du plateau) et posé sous les pions (z-index 3 contre 10). Tout est vu du dessus :
//  pas de flammes "de profil", mais un lit de braises, du givre qui s'étale, des arcs qui
//  claquent au sol et une nappe de gaz qui dérive.
// =========================================================================
function injecterStyleZonesPersistantes() {
    if (document.getElementById("style-zones-persistantes")) return;
    const style = document.createElement("style");
    style.id = "style-zones-persistantes";
    style.textContent = `
        #svg-zones-persistantes .zp-anim { transform-box: fill-box; transform-origin: center; }
        @keyframes zpBraise {
            0%, 100% { transform: scale(0.88); opacity: 0.55; }
            50%      { transform: scale(1.18); opacity: 0.95; }
        }
        @keyframes zpLangue {
            0%, 100% { transform: scaleY(0.75) scaleX(1.05); opacity: 0.65; }
            35%      { transform: scaleY(1.35) scaleX(0.85); opacity: 1; }
            70%      { transform: scaleY(0.95) scaleX(1.1);  opacity: 0.8; }
        }
        @keyframes zpEtincelle {
            0%   { transform: translateX(0) scale(1);   opacity: 0; }
            20%  { opacity: 0.95; }
            100% { transform: translateX(14px) scale(0.2); opacity: 0; }
        }
        @keyframes zpGivre {
            0%, 100% { transform: scale(0.94); opacity: 0.5; }
            50%      { transform: scale(1.06); opacity: 0.95; }
        }
        @keyframes zpGivreTour { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes zpArc {
            0%, 34%, 46%, 80%, 100% { opacity: 0; }
            36%  { opacity: 1; }
            38%  { opacity: 0.2; }
            40%  { opacity: 0.95; }
            44%  { opacity: 0; }
            84%  { opacity: 1; }
            86%  { opacity: 0.15; }
            88%  { opacity: 1; }
            94%  { opacity: 0; }
        }
        @keyframes zpNappe {
            0%, 100% { transform: translate(0px, 0px) scale(1);      opacity: 0.30; }
            50%      { transform: translate(7px, -6px) scale(1.18);  opacity: 0.55; }
        }
        @keyframes zpBulle {
            0%   { transform: scale(0.3); opacity: 0; }
            30%  { opacity: 0.8; }
            100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes zpSocle { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.72; } }
    `;
    document.head.appendChild(style);
}

// Aléatoire déterministe : le décor d'une case reste identique d'un rendu à l'autre (sinon il
// "sauterait" à chaque zoom, chaque déplacement de pion ou chaque snapshot Firestore).
function graineZone(q, r, k) {
    const x = Math.sin(q * 127.1 + r * 311.7 + k * 74.7) * 43758.5453;
    return x - Math.floor(x);
}

function pointsHexZone(cx, cy, rayon) {
    let s = "";
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i);
        s += `${(cx + rayon * Math.cos(a)).toFixed(1)},${(cy + rayon * Math.sin(a)).toFixed(1)} `;
    }
    return s.trim();
}

// Tout est dessiné en coordonnées LOCALES (case centrée sur 0,0) dans un groupe translaté puis
// découpé à l'hexagone : rien ne bave sur les cases voisines, et le contour reste lisible pour
// que les joueurs voient exactement où le terrain est piégé.
// `leger` : mode allégé automatique sur les très grandes emprises (moins d'éléments, pas de
// flou) — un iPad ne doit pas ramer parce qu'un joueur a posé une AoE de 19 cases en feu.
function dessinerHexZonePersistante(type, hex, R, leger) {
    const px = window.PLATEAU_VTT.hexToPixel(hex.q, hex.r);
    const rnd = (k) => graineZone(hex.q, hex.r, k);
    const flouDoux = leger ? "" : ` filter="url(#zp-flou-doux)"`;
    const flouFort = leger ? "" : ` filter="url(#zp-flou-fort)"`;
    const halo = leger ? "" : ` filter="url(#zp-glow)"`;

    let deco = "";
    let contour = "#ff4c4c";

    if (type === "feu") {
        contour = "#ff8a2e";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-feu)" class="zp-anim" style="animation: zpSocle 2.4s ease-in-out infinite; animation-delay:-${(rnd(1) * 2).toFixed(2)}s"/>`;
        // Cœur incandescent : c'est lui qui donne la chaleur, les langues ne font que danser autour.
        deco += `<ellipse rx="${(R * 0.42).toFixed(1)}" ry="${(R * 0.34).toFixed(1)}" fill="url(#zp-grad-coeur)"${flouDoux} class="zp-anim"
            style="animation: zpBraise 2.1s ease-in-out infinite"/>`;

        // Lit de braises : de larges taches chaudes qui respirent, vues du dessus.
        const nbBraises = leger ? 2 : 3;
        for (let k = 0; k < nbBraises; k++) {
            const ang = (k * (360 / nbBraises) + rnd(k + 2) * 40) * Math.PI / 180;
            const d = R * (0.08 + rnd(k + 8) * 0.30);
            const rx = R * (0.30 + rnd(k + 14) * 0.14);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <ellipse rx="${rx.toFixed(1)}" ry="${(rx * 0.80).toFixed(1)}" fill="url(#zp-grad-braise)"${flouDoux} class="zp-anim"
                    style="animation: zpBraise ${(1.3 + rnd(k + 20) * 1.1).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 26) * 2).toFixed(2)}s"/></g>`;
        }

        // Langues de feu : de petites pointes claires qui lèchent vers l'extérieur.
        const nbLangues = leger ? 2 : 4;
        for (let k = 0; k < nbLangues; k++) {
            // Angles franchement dispersés : réparties trop régulièrement, les langues dessinent
            // une fleur au lieu d'un feu.
            const ang = k * (360 / nbLangues) + rnd(k + 32) * 90 - 25;
            const d = R * (0.10 + rnd(k + 38) * 0.34);
            const t = R * (0.075 + rnd(k + 44) * 0.055);
            const rad = ang * Math.PI / 180;
            deco += `<g transform="translate(${(Math.cos(rad) * d).toFixed(1)},${(Math.sin(rad) * d).toFixed(1)}) rotate(${(ang + 90).toFixed(0)})">
                <path d="M 0,${t.toFixed(1)} C ${(-t * 0.80).toFixed(1)},${(t * 0.15).toFixed(1)} ${(-t * 0.40).toFixed(1)},${(-t * 1.50).toFixed(1)} 0,${(-t * 2.60).toFixed(1)} C ${(t * 0.40).toFixed(1)},${(-t * 1.50).toFixed(1)} ${(t * 0.80).toFixed(1)},${(t * 0.15).toFixed(1)} 0,${t.toFixed(1)} Z"
                    fill="url(#zp-grad-langue)"${halo} class="zp-anim"
                    style="animation: zpLangue ${(0.7 + rnd(k + 50) * 0.5).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 56) * 1.4).toFixed(2)}s"/></g>`;
        }

        // Escarbilles qui filent vers l'extérieur.
        if (!leger) {
            for (let k = 0; k < 3; k++) {
                const ang = rnd(k + 62) * 360;
                deco += `<g transform="rotate(${ang.toFixed(0)})">
                    <circle r="${(R * 0.05).toFixed(1)}" fill="#ffe6ac"${halo} class="zp-anim"
                        style="animation: zpEtincelle ${(1.6 + rnd(k + 68) * 1.2).toFixed(2)}s linear infinite; animation-delay:-${(rnd(k + 74) * 2.4).toFixed(2)}s"/></g>`;
            }
        }

    } else if (type === "glace") {
        contour = "#d6f4ff";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-glace)"/>`;
        deco += `<polygon points="${pointsHexZone(0, 0, R * 0.68)}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.6" stroke-dasharray="5 9" class="zp-anim"
            style="animation: zpGivreTour 26s linear infinite"/>`;

        const nbCristaux = leger ? 3 : 5;
        for (let k = 0; k < nbCristaux; k++) {
            const ang = k * (360 / nbCristaux) + rnd(k + 3) * 35;
            const d = R * (0.12 + rnd(k + 9) * 0.40);
            const L = R * (0.17 + rnd(k + 15) * 0.13);
            const rad = ang * Math.PI / 180;
            deco += `<g transform="translate(${(Math.cos(rad) * d).toFixed(1)},${(Math.sin(rad) * d).toFixed(1)}) rotate(${(rnd(k + 21) * 360).toFixed(0)})">
                <polygon points="0,${(-L).toFixed(1)} ${(L * 0.30).toFixed(1)},0 0,${L.toFixed(1)} ${(-L * 0.30).toFixed(1)},0"
                    fill="url(#zp-grad-cristal)" stroke="rgba(255,255,255,0.9)" stroke-width="0.8" class="zp-anim"
                    style="animation: zpGivre ${(2.6 + rnd(k + 27) * 2).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 33) * 3).toFixed(2)}s"/></g>`;
        }

    } else if (type === "electrique") {
        contour = "#9fdcff";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-elec)" class="zp-anim" style="animation: zpSocle 3s ease-in-out infinite"/>`;

        // Un arc se construit d'un bord à l'autre, en zigzag.
        const arc = (k, largeur) => {
            const angDep = rnd(k + 4) * 360;
            const angArr = angDep + 120 + rnd(k + 10) * 120;
            const radD = angDep * Math.PI / 180, radA = angArr * Math.PI / 180;
            const x1 = Math.cos(radD) * R * 0.85, y1 = Math.sin(radD) * R * 0.85;
            const x2 = Math.cos(radA) * R * 0.85, y2 = Math.sin(radA) * R * 0.85;
            let d = `M ${x1.toFixed(1)},${y1.toFixed(1)}`;
            const seg = 4;
            for (let s = 1; s <= seg; s++) {
                const t = s / seg;
                const bx = x1 + (x2 - x1) * t;
                const by = y1 + (y2 - y1) * t;
                const ecart = s === seg ? 0 : (rnd(k * 10 + s + 16) - 0.5) * R * 0.5;
                const nx = -(y2 - y1), ny = (x2 - x1);
                const norme = Math.hypot(nx, ny) || 1;
                d += ` L ${(bx + nx / norme * ecart).toFixed(1)},${(by + ny / norme * ecart).toFixed(1)}`;
            }
            return { d: d, largeur: largeur };
        };

        // Deux arcs de fond toujours visibles : la case reste "sous tension" même entre deux
        // décharges, sinon elle a l'air éteinte les trois quarts du temps.
        for (let k = 0; k < 2; k++) {
            const a = arc(k + 90, R * 0.035);
            deco += `<path d="${a.d}" fill="none" stroke="#7fc9ff" stroke-width="${a.largeur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.30"/>`;
        }
        // Puis les décharges franches qui claquent chacune sur son tempo.
        const nbArcs = leger ? 2 : 3;
        for (let k = 0; k < nbArcs; k++) {
            const a = arc(k, R * 0.055);
            deco += `<path d="${a.d}" fill="none" stroke="#eaf7ff" stroke-width="${a.largeur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"${halo}
                style="animation: zpArc ${(1.8 + rnd(k + 40) * 1.6).toFixed(2)}s linear infinite; animation-delay:-${(rnd(k + 46) * 3).toFixed(2)}s"/>`;
        }
        // Étincelles au sol entre deux décharges.
        const nbEclats = leger ? 2 : 4;
        for (let k = 0; k < nbEclats; k++) {
            const ang = rnd(k + 52) * 360 * Math.PI / 180;
            const d = R * (0.15 + rnd(k + 58) * 0.55);
            deco += `<circle cx="${(Math.cos(ang) * d).toFixed(1)}" cy="${(Math.sin(ang) * d).toFixed(1)}" r="${(R * 0.05).toFixed(1)}"
                fill="#ffffff"${halo}
                style="animation: zpArc ${(1.4 + rnd(k + 64) * 1.6).toFixed(2)}s linear infinite; animation-delay:-${(rnd(k + 70) * 2).toFixed(2)}s"/>`;
        }

    } else if (type === "poison") {
        contour = "#8fdc4c";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-poison)" class="zp-anim" style="animation: zpSocle 4s ease-in-out infinite"/>`;

        const nbBouillons = leger ? 2 : 4;
        for (let k = 0; k < nbBouillons; k++) {
            const ang = (k * (360 / nbBouillons) + rnd(k + 5) * 45) * Math.PI / 180;
            const d = R * (0.06 + rnd(k + 11) * 0.34);
            const rr = R * (0.28 + rnd(k + 17) * 0.16);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <circle r="${rr.toFixed(1)}" fill="url(#zp-grad-vapeur)"${flouFort} class="zp-anim"
                    style="animation: zpNappe ${(4.5 + rnd(k + 23) * 3).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 29) * 5).toFixed(2)}s"/></g>`;
        }
        const nbBulles = leger ? 1 : 3;
        for (let k = 0; k < nbBulles; k++) {
            const ang = rnd(k + 35) * 360 * Math.PI / 180;
            const d = R * (0.12 + rnd(k + 41) * 0.48);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <circle r="${(R * 0.11).toFixed(1)}" fill="none" stroke="#c9f79e" stroke-width="1.5" class="zp-anim"
                    style="animation: zpBulle ${(2.4 + rnd(k + 47) * 1.8).toFixed(2)}s ease-out infinite; animation-delay:-${(rnd(k + 53) * 3).toFixed(2)}s"/></g>`;
        }

    } else if (type === "soin") {
        // Une zone bienfaisante : verte, jamais rouge — un remous de vie qui pulse doucement,
        // avec quelques étincelles qui montent et s'effacent, comme une bénédiction posée au sol.
        contour = "#4caf50";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-soin)" class="zp-anim" style="animation: zpSocle 3.4s ease-in-out infinite"/>`;
        deco += `<ellipse rx="${(R * 0.40).toFixed(1)}" ry="${(R * 0.32).toFixed(1)}" fill="url(#zp-grad-soin-coeur)"${flouDoux} class="zp-anim"
            style="animation: zpBraise 2.6s ease-in-out infinite"/>`;

        const nbEtincelles = leger ? 2 : 4;
        for (let k = 0; k < nbEtincelles; k++) {
            const ang = (k * (360 / nbEtincelles) + rnd(k + 5) * 45) * Math.PI / 180;
            const d = R * (0.10 + rnd(k + 11) * 0.42);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <circle r="${(R * 0.09).toFixed(1)}" fill="url(#zp-grad-etincelle-soin)"${halo} class="zp-anim"
                    style="animation: zpBulle ${(2.2 + rnd(k + 17) * 1.8).toFixed(2)}s ease-out infinite; animation-delay:-${(rnd(k + 23) * 3).toFixed(2)}s"/></g>`;
        }
    } else {
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="rgba(255,76,76,0.22)" class="zp-anim" style="animation: zpSocle 2.6s ease-in-out infinite"/>`;
    }

    return `<g transform="translate(${px.x.toFixed(1)},${px.y.toFixed(1)})">
        <g clip-path="url(#zp-clip-hex)">${deco}</g>
        <polygon points="${pointsHexZone(0, 0, R * 0.985)}" fill="none" stroke="${contour}" stroke-width="2.2" opacity="0.8"/>
    </g>`;
}

window.appliquerZonesPersistantes = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (!conteneur || !window.PLATEAU_VTT) return;

    // UNE ZONE N'APPARAÎT PAS AVANT LE TOUR QUI LA POSE. Elle est écrite en base
    // dès que la carte se résout chez son auteur ; les autres écrans, eux, n'ont
    // pas encore rejoué ce tour-là. Sans cette retenue, la nappe de feu se
    // dessinait sur le plateau plusieurs secondes avant l'animation qui la crée.
    // La relecture rappelle cette fonction quand elle a fini (sequence_tour.js).
    if ((typeof window.evenementsEnAttente === "function" && window.evenementsEnAttente() > 0)
        || window.EVENEMENT_ATTENDU) return;

    let svg = document.getElementById("svg-zones-persistantes");
    if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "svg-zones-persistantes";
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.zIndex = "3"; // Sous les pions (10), au-dessus du fond de carte
        svg.style.pointerEvents = "none";
        svg.style.overflow = "visible";
        conteneur.appendChild(svg);
    }

    injecterStyleZonesPersistantes();

    const zones = Object.values(window.ZONES_PERSISTANTES || {});
    if (zones.length === 0) {
        svg.innerHTML = "";
        return;
    }

    const R = window.PLATEAU_VTT.hexSize;

    const defs = `<defs>
        <clipPath id="zp-clip-hex"><polygon points="${pointsHexZone(0, 0, R)}"/></clipPath>
        <filter id="zp-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="${(R * 0.11).toFixed(2)}" result="flou"/>
            <feMerge><feMergeNode in="flou"/><feMergeNode in="flou"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="zp-flou-doux" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="${(R * 0.10).toFixed(2)}"/>
        </filter>
        <filter id="zp-flou-fort" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="${(R * 0.20).toFixed(2)}"/>
        </filter>
        <radialGradient id="zp-grad-feu">
            <stop offset="0%"   stop-color="#ffa53c" stop-opacity="0.62"/>
            <stop offset="55%"  stop-color="#d63a08" stop-opacity="0.50"/>
            <stop offset="100%" stop-color="#4d1000" stop-opacity="0.40"/>
        </radialGradient>
        <radialGradient id="zp-grad-coeur">
            <stop offset="0%"   stop-color="#fff6d2" stop-opacity="0.90"/>
            <stop offset="45%"  stop-color="#ffab3a" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#ff6a12" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="zp-grad-braise">
            <stop offset="0%"   stop-color="#fff2b0" stop-opacity="0.95"/>
            <stop offset="45%"  stop-color="#ff9d2e" stop-opacity="0.75"/>
            <stop offset="100%" stop-color="#e03a05" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="zp-grad-langue" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stop-color="#ff7a1e" stop-opacity="0.90"/>
            <stop offset="50%"  stop-color="#ffcf5c" stop-opacity="0.98"/>
            <stop offset="100%" stop-color="#fffbe6" stop-opacity="1"/>
        </linearGradient>
        <radialGradient id="zp-grad-glace">
            <stop offset="0%"   stop-color="#eafaff" stop-opacity="0.45"/>
            <stop offset="70%"  stop-color="#8fd8f7" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#4aa6cf" stop-opacity="0.32"/>
        </radialGradient>
        <linearGradient id="zp-grad-cristal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#8fd8f7" stop-opacity="0.55"/>
        </linearGradient>
        <radialGradient id="zp-grad-elec">
            <stop offset="0%"   stop-color="#9fd8ff" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="#1b4c7a" stop-opacity="0.22"/>
        </radialGradient>
        <radialGradient id="zp-grad-poison">
            <stop offset="0%"   stop-color="#a8ef6c" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#2f6b1f" stop-opacity="0.34"/>
        </radialGradient>
        <radialGradient id="zp-grad-vapeur">
            <stop offset="0%"   stop-color="#e2ffb8" stop-opacity="0.92"/>
            <stop offset="55%"  stop-color="#9ae04f" stop-opacity="0.50"/>
            <stop offset="100%" stop-color="#4d9b32" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="zp-grad-soin">
            <stop offset="0%"   stop-color="#c8f7a8" stop-opacity="0.55"/>
            <stop offset="55%"  stop-color="#6fce4c" stop-opacity="0.42"/>
            <stop offset="100%" stop-color="#2e7d32" stop-opacity="0.32"/>
        </radialGradient>
        <radialGradient id="zp-grad-soin-coeur">
            <stop offset="0%"   stop-color="#ffffe6" stop-opacity="0.92"/>
            <stop offset="45%"  stop-color="#baf78c" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#6fce4c" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="zp-grad-etincelle-soin">
            <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#9df57a" stop-opacity="0"/>
        </radialGradient>
    </defs>`;

    let totalHexes = 0;
    zones.forEach(z => { totalHexes += (z.hexes || []).length; });
    const leger = totalHexes > 12;

    let corps = "";
    zones.forEach(zone => {
        (zone.hexes || []).forEach(hex => {
            corps += dessinerHexZonePersistante(zone.type || "neutre", hex, R, leger);
        });
    });

    // On passe par DOMParser plutôt que par innerHTML : l'affectation de balisage SVG via
    // innerHTML est capricieuse selon les moteurs, et le jeu tourne sur iPad (WebKit).
    svg.innerHTML = "";
    try {
        const docSvg = new DOMParser().parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg">${defs}${corps}</svg>`, "image/svg+xml"
        );
        if (docSvg.querySelector("parsererror")) throw new Error("SVG des zones illisible");
        Array.from(docSvg.documentElement.childNodes).forEach(n => svg.appendChild(document.importNode(n, true)));
    } catch (e) {
        console.error("Erreur rendu zones persistantes :", e);
    }
};

// =========================================================================
//  NOUVEAU : CONTRÔLE DE L'ESPACEMENT DES BANNIÈRES
// =========================================================================

window.changerEspacementBannieres = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    // Récupération de l'espacement actuel (ou valeur par défaut)
    let espacementActuel = parseInt(localStorage.getItem("ivalis_espacement_bannieres")) || -85;
    let nouvelEspacement = espacementActuel + delta;
    
    // On met des limites raisonnables (-120px très serré, 0px très espacé)
    if (nouvelEspacement < -120) nouvelEspacement = -120;
    if (nouvelEspacement > 0) nouvelEspacement = 0;
    
    // Sauvegarde dans le navigateur
    localStorage.setItem("ivalis_espacement_bannieres", nouvelEspacement);
    window.ESPACEMENT_BANNIERES_COMBAT = nouvelEspacement;
    
    const label = document.getElementById("label-espacement-bannieres");
    if (label) label.innerText = nouvelEspacement;
    
    // On force le rafraîchissement immédiat de l'UI
    if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR.length > 0) {
        window.afficherPersoCombatActuel();
    }
};

// --- INITIALISATION VISUELLE DU LABEL AU DÉMARRAGE ---
document.addEventListener("DOMContentLoaded", function () {
    const label = document.getElementById("label-espacement-bannieres");
    if (label) {
        label.innerText = parseInt(localStorage.getItem("ivalis_espacement_bannieres")) || -85;
    }
});

// =========================================================================
//  GESTION DU TOUR PAR TOUR ET PISTE D'INITIATIVE
// =========================================================================

// 1. Le Joueur choisit sa carte
// =========================================================================
//  À QUI EST CETTE CARTE ?
// =========================================================================
//  ENCORE LE PANNEAU GAUCHE PRIS POUR L'AUTORITÉ. Deux endroits décidaient du
//  sort d'une carte d'après le combattant AFFICHÉ : competences.js refusait de
//  la retenir si le panneau montrait une créature, et jouerCarteCombat
//  l'inscrivait au nom de ce combattant-là.
//
//  Or le panneau était une visionneuse, et l'IA comme le joueur pouvaient y
//  installer une créature — COMBAT_PERSOS_JOUEUR devenait alors [elle]. Le deck
//  affiché, lui, mettait un instant à suivre : le joueur voyait donc SA carte,
//  la cliquait, et « Choisir » restait mort, sans un mot. À la table, ça s'est
//  traduit par trois minutes d'attente, jusqu'à ce que l'IA renonce à attendre
//  les joueurs et engage les créatures toute seule.
//
//  Le panneau a disparu depuis, et l'échange avec lui. Cette fonction n'a donc
//  plus de piège à déjouer — mais elle reste la bonne réponse à la question,
//  qui ne dépend d'aucun affichage.
//
//  La carte, elle, sait à qui elle appartient : le cache global range les
//  techniques par combattant. On le lui demande.
window.proprietaireDeLaCarte = function(idCarte) {
    if (!idCarte) return null;
    const cache = window.CACHE_COMPETENCES_GLOBAL || {};
    return Object.keys(cache).find(id => cache[id] && cache[id][idCarte]) || null;
};

// Les héros de CE poste — ceux que je commande. Une seule liste désormais : la
// mise de côté qu'imposait le panneau latéral n'a plus lieu d'être.
window.mesHerosDeCombat = function() {
    return window.COMBAT_PERSOS_JOUEUR || [];
};

// LE HÉROS POUR QUI CETTE CARTE SE JOUE.
//
// Elle avait un repli qui n'a survécu que parce que le panneau existait : faute
// de propriétaire des miens, elle rendait LE COMBATTANT AFFICHÉ. Quand la
// visionneuse montrait la créature dont on venait d'ouvrir la technique, ce
// repli tombait juste par accident — il rendait la créature, et « Choisir »
// restait éteint comme il le devait. Le panneau parti, le repli rendait mon
// propre héros pour la carte d'un gnoll : sa technique devenait choisissable.
//
// L'ordre des réponses est donc explicite :
//   · le propriétaire de la carte s'il est des miens — c'est le cas courant ;
//   · sinon, le propriétaire quand même, fût-il une créature : c'est LUI que le
//     reste du moteur doit voir pour refuser le choix ;
//   · et seulement si la carte n'a aucun propriétaire connu — un cache pas
//     encore rempli — mon héros courant, pour ne jamais bloquer le joueur.
window.herosPourCarte = function(idCarte) {
    const proprietaire = window.proprietaireDeLaCarte(idCarte);
    if (proprietaire) {
        const mien = window.mesHerosDeCombat().find(h => h && h.idPersonnage === proprietaire);
        if (mien) return mien;
        const autre = (window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === proprietaire);
        if (autre) return autre;
    }
    return (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO] || null;
};

window.jouerCarteCombat = async function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // UN CLIC QUI NE FAIT RIEN, ET RIEN QUI LE DISE. Cette fonction avait quatre
    // sorties muettes : le joueur choisissait sa carte, l'écran ne bougeait pas,
    // et aucune trace ne disait pourquoi. « Sur l'iPad ça ne voulait pas prendre
    // la carte sélectionnée » a coûté une soirée à cause de ça. Chaque refus se
    // nomme maintenant.
    const refuser = (raison, detail) => {
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🚫", `carte ${idCarte} refusée : ${raison}`, detail || "");
        }
    };

    if (!window.ID_PARTIE_COURANTE) return refuser("aucune partie en cours");

    const phase = (window.PARTIE_DATA || {}).Phase_Combat || "Preparation";
    if (phase !== "Preparation") return refuser("on n'est pas en préparation", `(phase ${phase})`);

    // LE HÉROS À QUI CETTE CARTE APPARTIENT, demandé à la carte elle-même et
    // non à ce qui est affiché (voir herosPourCarte).
    // Le `typeof` n'est pas de la superstition : cette fonction a une longue
    // histoire de sorties muettes, et une exception y serait pire encore —
    // elle laisserait le deck grisé et le joueur devant un plateau figé.
    const persoActuel = typeof window.herosPourCarte === "function"
        ? window.herosPourCarte(idCarte)
        : (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return refuser("aucun héros à qui attribuer cette carte",
                                     `(index ${window.COMBAT_INDEX_PERSO})`);
    if (persoActuel.estMonstre) return refuser("cette carte est celle d'une créature",
                                               persoActuel.idPersonnage);

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return refuser("technique absente du cache", `(${persoActuel.idPersonnage})`);

    // Ce qu'on tient en main peut interdire la technique : pas d'attaque légère
    // avec une hache, pas de sort les deux mains prises. Contrôlé ici, au
    // moment de jouer, plutôt qu'à la Forge : une carte reste forgeable, elle
    // attend seulement la bonne arme.
    if (typeof window.raisonBlocageCarte === "function") {
        const blocage = window.raisonBlocageCarte(persoActuel, dataCarte.Arme);
        if (blocage) {
            if (typeof window.afficherMessageFlottantHex === "function") {
                const tk = (window.TOKENS_VTT_DATA || {})[persoActuel.idPersonnage];
                if (tk) window.afficherMessageFlottantHex(tk.q, tk.r, "Arme inadaptée", "#ff4c4c");
            }
            alert(blocage);
            return;
        }
    }

    const btn = document.getElementById("btn-choisir-action");
    if(btn) { btn.innerText = "Préparation..."; btn.disabled = true; }

    // 🔻 EFFET VISUEL IMMÉDIAT (N'attend pas le réseau)
    //
    // LA CARTE RETENUE S'EN VA, ELLE AUSSI. Elle restait posée en grand au
    // milieu de l'écran jusqu'à la résolution, verrouillée pour qu'on ne puisse
    // pas la refermer. C'était la mémoire du choix du temps où rien d'autre ne
    // le montrait ; le bouton de fin de tour et la piste le disent maintenant,
    // et la carte ne faisait plus qu'occuper le plateau.
    //
    // `true` force le masquage : sans lui, un aperçu verrouillé refuse de se
    // fermer, c'est tout son rôle.
    if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true);
    if (typeof window.rangerDeckApresChoix === "function") window.rangerDeckApresChoix();
    window.mettreAJourJaugeFatigue(0); // Cache la jauge rouge

    let etatsApresElectrifie = null;

    try {
        // Sous transaction : trois joueurs qui choisissent au même instant ne
        // doivent pas s'effacer mutuellement de la file (cf. modifierPartie).
        await window.modifierPartie((data) => {
            let file = data.File_Attente_Combat || [];
            file = file.filter(item => item.idPersonnage !== persoActuel.idPersonnage);

            // Électrifié : consommé sur la toute prochaine carte jouée, quelle qu'elle soit —
            // -35 en initiative sur CETTE carte (la piste se retrie automatiquement puisque
            // file.sort() ci-dessous relit la valeur qu'on vient d'écrire), puis l'état disparaît.
            // Une transaction peut être rejouée plusieurs fois : on n'écrit rien
            // d'autre ici, on note seulement ce qu'il faudra faire après coup.
            // L'équipement (épée courte, effet A/B "+3 initiative") avance le
            // héros dans la piste ; l'élan temporaire gagné en frappant s'y
            // ajoute tant qu'il dure.
            let initiativeCarte = (dataCarte.Initiative || 0)
                + (typeof window.bonusEquip === "function" ? window.bonusEquip(persoActuel, "initiative") : 0);
            const etatElectrifie = persoActuel.Etats_Alteres && persoActuel.Etats_Alteres.find(e => e.nom === "Électrifié");
            if (etatElectrifie) {
                initiativeCarte = Math.max(0, initiativeCarte - 35);
                etatsApresElectrifie = persoActuel.Etats_Alteres.filter(e => e !== etatElectrifie);
            }

            file.push({
                idPersonnage: persoActuel.idPersonnage,
                idCarte: idCarte, // NOUVEAU : Sauvegarde la carte choisie !
                initiative: initiativeCarte,
                timestamp: new Date().getTime()
            });

            file.sort((a, b) => {
                if (b.initiative !== a.initiative) return b.initiative - a.initiative;
                return a.timestamp - b.timestamp;
            });

            let phase = data.Phase_Combat || "Preparation";

            // La bascule se décide sur le document de partie, jamais sur la
            // liste locale du poste : c'est la seule façon que les trois écrans
            // passent en résolution au même moment.
            const ontJoue = window.avecCarteJouee(data, persoActuel.idPersonnage);
            if (window.toutLeMondeAJoue({ ...data, Ont_Joue_Ce_Round: ontJoue }, file)) phase = "Resolution";

            return { maj: { File_Attente_Combat: file, Phase_Combat: phase, Ont_Joue_Ce_Round: ontJoue } };
        });

        // L'état Électrifié se dissipe une fois la carte réellement inscrite.
        if (etatsApresElectrifie) {
            persoActuel.Etats_Alteres = etatsApresElectrifie;
            const persoPartieElec = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === persoActuel.idPersonnage);
            if (persoPartieElec) persoPartieElec.Etats_Alteres = etatsApresElectrifie;
            updateDoc(window.refCombattant(persoActuel.idPersonnage), { Etats_Alteres: etatsApresElectrifie })
                .catch(e => console.error(e));
        }
    } catch (e) {
        console.error("Erreur jouerCarteCombat:", e);
        if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true);
        if (typeof window.rouvrirDeckApresEchec === "function") window.rouvrirDeckApresEchec();
        const btn = document.getElementById("btn-choisir-action");
        if (btn) { btn.innerText = "Choisir"; btn.disabled = false; }
        window.mettreAJourJaugeFatigue(0);
    }
};

// =========================================================================
//  MÉCANIQUE DE REPOS LONG
// =========================================================================
window.jouerReposLong = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;

    const partie = window.PARTIE_DATA || {};
    const phase = partie.Phase_Combat || "Preparation";
    
    if (phase !== "Preparation") return;

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    if (typeof window.rangerDeckApresChoix === "function") window.rangerDeckApresChoix();
    window.mettreAJourJaugeFatigue(0);
    window.actualiserEtatCarteCombat("REPOS_LONG");

    try {
        // Même règle que pour une carte ordinaire : sous transaction, sinon un
        // repos long effacerait la carte qu'un autre joueur vient de poser.
        await window.modifierPartie((data) => {
            let file = data.File_Attente_Combat || [];
            
            file = file.filter(item => item.idPersonnage !== persoActuel.idPersonnage);

            file.push({
                idPersonnage: persoActuel.idPersonnage,
                idCarte: "REPOS_LONG", 
                initiative: 0,
                timestamp: new Date().getTime()
            });

            file.sort((a, b) => {
                if (b.initiative !== a.initiative) return b.initiative - a.initiative;
                return a.timestamp - b.timestamp;
            });

            let newPhase = data.Phase_Combat || "Preparation";

            const ontJoueRepos = window.avecCarteJouee(data, persoActuel.idPersonnage);
            if (window.toutLeMondeAJoue({ ...data, Ont_Joue_Ce_Round: ontJoueRepos }, file)) newPhase = "Resolution";

            return { maj: { File_Attente_Combat: file, Phase_Combat: newPhase,
                            Ont_Joue_Ce_Round: ontJoueRepos } };
        });
    } catch (e) {
        console.error("Erreur jouerReposLong:", e);
        window.actualiserEtatCarteCombat();
    }
};

// =========================================================================
//  GESTION VISUELLE DU BOUTON "FIN DU TOUR"
// =========================================================================

window.PEUT_PASSER_TOUR = false;

// LES CINQ VISAGES DU BOUTON.
//
// Il tenait jusqu'ici deux états (éteint / allumé) et ne servait qu'à finir le
// tour. Il porte maintenant, TOUJOURS AU MÊME ENDROIT, l'action principale du
// moment — et son image dit laquelle :
//
//   • éteint (IMG_2134) ....... ce n'est pas à nous de jouer, entre les tours ;
//   • choisir compétence ...... en PRÉPARATION, une carte est affichée en grand
//     (IMG_2131)               et attend d'être retenue pour cette manche ;
//   • valider déplacement ..... à notre tour, un chemin est tracé et attend
//     (IMG_2130)               d'être confirmé (l'annuler passe par la petite
//                              croix sous le pion, voir appliquerTokensVTT) ;
//   • lancer (IMG_2132) ....... à notre tour, on ne veut plus se déplacer : on
//                              part sur le ciblage de sa carte, qui se déroule
//                              ensuite comme avant (RÉSOUDRE / ANNULER) ;
//   • fin de tour (IMG_2124) .. pendant le ciblage, ou quand il n'y a rien à
//                              lancer : finir son tour sans dépenser sa carte.
//
// window.MODE_BOUTON_FINTOUR mémorise CE QUE le prochain clic déclenchera :
// c'est lui que lit window.actionBoutonFinTour (plus bas), pour ne jamais avoir
// à redeviner l'état au moment du clic.
window.MODE_BOUTON_FINTOUR = "eteint";

const IMG_FINTOUR = {
    eteint:              "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789309135/IMG_2134_nh3lfn.png",
    choisir_competence:  "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789309134/IMG_2131_pgtsas.png",
    valider_deplacement: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789309134/IMG_2130_hosju1.png",
    lancer:              "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789309134/IMG_2132_ldpmqq.png",
    fin_de_tour:         "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789309133/IMG_2124_afpicw.png"
};

// LA CARTE AFFICHÉE EN GRAND, ET SI ELLE PEUT ÊTRE RETENUE. Posée par
// afficherApercuCarteHD (competences.js), effacée par masquerApercuCarteHD :
// c'est elle que « choisir compétence » verrouille pour la manche.
window.CARTE_APERCU = null;

window.actualiserBoutonFinTour = function(queueParam, phaseParam) {
    const imgBtn = document.getElementById("img-hud-fintour");
    if (!imgBtn) return;

    const poser = (mode, actionnable) => {
        imgBtn.src = IMG_FINTOUR[mode];
        window.MODE_BOUTON_FINTOUR = mode;
        window.PEUT_PASSER_TOUR = actionnable;
    };

    // Récupération des données (Paramètres en priorité, fallback sur PARTIE_DATA si on change juste de perso)
    const partie = window.PARTIE_DATA || {};
    const queue = queueParam !== undefined ? queueParam : (partie.File_Attente_Combat || []);
    const phase = phaseParam !== undefined ? phaseParam : (partie.Phase_Combat || "Preparation");
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];

    // La fenêtre de tour dépend des mêmes données que ce bouton (qui joue, avec
    // quelle carte, sur quel poste) : on la rafraîchit ici, et elle suit dès lors
    // tous les appels existants — changement de héros affiché compris.
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour(queue, phase);

    // Un tour déjà calculé qui attend les autres postes n'est plus à passer :
    // le bouton s'éteint, c'est la barrière de synchronisation qui prendra le
    // relais dès que tout le monde aura fini de rejouer (voir sequence_tour.js).
    if (typeof window.sequenceTourEnAttente === "function" && window.sequenceTourEnAttente()) {
        return poser("eteint", false);
    }

    // === LA PRÉPARATION : RETENIR SA CARTE POUR LA MANCHE ===================
    // Le bouton ne s'allume que si une carte est ouverte en grand ET qu'elle
    // peut être retenue (assez d'énergie, arme compatible : c'est
    // afficherApercuCarteHD qui en juge, et qui le dit dans CARTE_APERCU).
    if (phase !== "Resolution") {
        const apercu = window.CARTE_APERCU;
        if (apercu && apercu.choisissable) return poser("choisir_competence", true);
        return poser("eteint", false);
    }

    // === LA RÉSOLUTION : NOTRE TOUR, OU PAS ================================
    //
    // LA FILE DIT QUI JOUE. Ce test comparait autrefois la tête de file au
    // combattant AFFICHÉ DANS LE PANNEAU LATÉRAL — une visionneuse où un clic
    // sur un portrait installait n'importe quel combattant, créature comprise.
    // Regarder la fiche d'un ennemi suffisait donc à répondre « ce n'est pas ton
    // tour » : le bouton s'éteignait, et le clic ne lançait plus rien.
    //
    // La bonne question est « la tête de file est-elle un de MES héros ? », et
    // elle se pose à la liste des héros de ce poste. Le panneau n'existe plus,
    // cette liste ne se fait plus détourner, mais la question reste la même.
    //
    // On ne passe volontairement PAS par estMonHerosCombat, qui compare
    // l'idJoueur de la fiche au poste courant : une fiche dont ce champ manque
    // ou ne correspond pas éteindrait le bouton pour tout le combat, et on
    // remplacerait un défaut par un autre. La liste des héros du poste, elle,
    // est vraie par construction.
    const idQuiJoue = queue.length > 0 ? queue[0].idPersonnage : null;
    const mesHeros = window.COMBAT_PERSOS_JOUEUR || [];
    const estMonTour = !!idQuiJoue && mesHeros.some(h => h && h.idPersonnage === idQuiJoue);

    // Le tour d'un monstre appartient à l'IA, et à elle seule : le bouton reste
    // éteint. Il se rallume quand même si l'IA n'a plus donné signe de vie
    // depuis vingt secondes — mieux vaut une fin de tour à la main qu'une table
    // bloquée devant une créature qui ne joue pas.
    const teteEstMonstre = queue.length > 0 && typeof window.estMonstre === "function"
                           && window.estMonstre(queue[0].idPersonnage);
    const iaDonneSigneDeVie = (Date.now() - (window.IA_DERNIER_SIGNE || 0)) < 20000;
    if (teteEstMonstre && iaDonneSigneDeVie) return poser("eteint", false);

    if (!estMonTour) return poser("eteint", false);

    // 1. LE CIBLAGE EST OUVERT : la carte se joue par ses propres boutons
    // (RÉSOUDRE / ANNULER, ou la bulle des zones). Ce bouton-ci n'offre plus
    // qu'une sortie : finir son tour sans lancer, donc sans rien dépenser.
    const ciblage = window.ETAT_CIBLAGE;
    if (ciblage && ciblage.actif) return poser("fin_de_tour", true);

    // 2. UN DÉPLACEMENT SE TRACE : le bouton le valide.
    if ((window.CHEMIN_MOUVEMENT || []).length > 0) return poser("valider_deplacement", true);

    // 3. UNE CARTE ATTEND D'ÊTRE LANCÉE : on ne se déplace plus, on vise.
    //    La créature en tête est déjà écartée plus haut (teteEstMonstre) : on
    //    ne regarde donc plus si le PANNEAU montre une créature, ce qui
    //    éteignait le bouton dès qu'on consultait la fiche d'un ennemi.
    const idCarteEnAttente = queue[0] && queue[0].idCarte;
    if (idCarteEnAttente && idCarteEnAttente !== "REPOS_LONG") {
        return poser("lancer", true);
    }

    // 4. RIEN À LANCER (repos long, aucune carte retenue) : il ne reste que la
    // fin du tour.
    return poser("fin_de_tour", true);
};

// LE CLIC SUR LE BOUTON : ce qu'il déclenche dépend entièrement de l'image
// qu'il montre, posée par actualiserBoutonFinTour ci-dessus.
window.actionBoutonFinTour = function() {
    if (!window.PEUT_PASSER_TOUR) return;

    // Une demande déjà partie attend la réponse du cerveau : le temps de
    // l'aller-retour réseau, le bouton montre encore l'action d'avant. Sans
    // cette garde, un second clic la referait une seconde fois — exactement le
    // doublon que demandeDejaEnVol empêchait pour l'ancien bouton Appliquer
    // (voir regime_cerveau.js).
    // QUI JOUE : la tête de file, toujours — jamais le combattant que le
    // panneau gauche montre. Voir actualiserBoutonFinTour pour l'histoire de
    // cette confusion. Le repli sur le panneau ne sert qu'à la préparation, où
    // la file peut être vide.
    const teteDeFile = ((window.PARTIE_DATA || {}).File_Attente_Combat || [])[0];
    const idQuiJoue = (teteDeFile && teteDeFile.idPersonnage)
        || ((window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] || {}).idPersonnage || null);

    if (window.regimeDemande && typeof window.regimeDemande.enVol === "function"
        && idQuiJoue && window.regimeDemande.enVol(idQuiJoue)) {
        return;
    }

    if (window.MODE_BOUTON_FINTOUR === "choisir_competence") {
        const apercu = window.CARTE_APERCU;
        if (!apercu || !apercu.idCarte) return;
        // Le repos long a sa propre écriture : il n'a pas de fiche de carte, et
        // jouerCarteCombat en chercherait une dans le cache.
        if (apercu.idCarte === "REPOS_LONG") {
            return typeof window.jouerReposLong === "function" ? window.jouerReposLong() : undefined;
        }
        if (typeof window.jouerCarteCombat === "function") {
            return window.jouerCarteCombat(apercu.idCarte);
        }
        return;
    }

    if (window.MODE_BOUTON_FINTOUR === "valider_deplacement") {
        return window.validerMouvement();
    }

    if (window.MODE_BOUTON_FINTOUR === "lancer") {
        const queue = (window.PARTIE_DATA || {}).File_Attente_Combat || [];
        const idCarte = queue[0] && queue[0].idCarte;
        if (!idCarte || typeof window.demarrerCiblage !== "function") return;

        // LA CARTE DOIT ÊTRE À L'ÉCRAN AVANT DE VISER. RÉSOUDRE et ANNULER se
        // posent sur son aperçu (moteur_effets.js) : l'ancien bouton
        // « Appliquer » vivait dessus, donc l'aperçu était forcément là. Ce
        // bouton-ci, lui, est dans le HUD et se clique même carte refermée —
        // le ciblage partait alors sans ses deux boutons, et la carte restait
        // en l'air sans rien pour la résoudre ni l'annuler.
        if (typeof window.afficherApercuCarteHD === "function") {
            window.afficherApercuCarteHD(idCarte, true);
        }
        // ON NOMME LE LANCEUR. Sans ça, demarrerCiblage le déduit du panneau
        // gauche — c'est-à-dire du combattant qu'on regarde, pas de celui qui
        // joue — et allait chercher la carte dans le mauvais deck.
        return window.demarrerCiblage(idCarte, { idLanceur: idQuiJoue });
    }

    // FIN DE TOUR. Si un ciblage était ouvert, il se referme sans rien lancer :
    // la carte n'a jamais été envoyée au cerveau, donc son énergie n'a jamais
    // été dépensée.
    if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif
        && typeof window.nettoyerCiblage === "function") {
        window.nettoyerCiblage();
    }
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    return window.finDeTourCombat();
};

window.ANIMATION_TOUR_EN_COURS = false;

window.finDeTourCombat = async function(forcer = false, idQuiTermine = null) {
    if (!window.PEUT_PASSER_TOUR && !forcer) return;

    // ON NE FAIT PAS AVANCER LA FILE, ON LE DEMANDE. Le cerveau tranche —
    // est-ce bien son tour, ce poste commande-t-il ce combattant — puis
    // publie la file d'après avec son entrée de journal.
    if (window.regimeDemande && window.regimeDemande.actif()) {
        const teteNouvelle = ((window.PARTIE_DATA || {}).File_Attente_Combat || [])[0];
        const qui = idQuiTermine || (teteNouvelle ? teteNouvelle.idPersonnage : null);
        if (!qui) return;
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        window.COUT_COMPETENCE_SELECTIONNEE = 0;
        return await window.regimeDemande.finDeTour(qui);
    }
};

// =========================================================================
//  LA PISTE D'INITIATIVE
// =========================================================================
//  ELLE NE DISPARAÎT PLUS. C'était son défaut de fond : elle s'effaçait dès la
//  fin de la manche, c'est-à-dire précisément au moment où on choisit sa carte
//  — et où l'ordre de passage est l'information la plus utile de l'écran. Il
//  fallait la deviner de mémoire, ou attendre la manche suivante pour la
//  revoir.
//
//  Elle reste donc affichée pendant toute la rencontre, en haut et au centre,
//  et raconte trois choses à la fois :
//    · qui a DÉJÀ JOUÉ ce tour-ci   → son portrait passe en retrait (0,7)
//    · à qui c'est le TOUR          → une lueur dorée respire derrière lui
//    · dans quel ORDRE on passera   → la place de chacun sur la bande
//
//  CE QUE LA FILE NE DIT PAS, ET POURQUOI IL A FALLU UNE MÉMOIRE
//  ------------------------------------------------------------
//  `File_Attente_Combat` ne contient que ceux qui n'ont PAS ENCORE joué : le
//  cerveau en retire la tête à chaque tour clos. Une piste dessinée à partir
//  d'elle verrait donc les combattants s'évaporer un par un — l'inverse de ce
//  qu'on veut. On retient donc l'ordre COMPLET au moment où la manche s'ouvre
//  (PISTE_MANCHE), et la file courante ne sert plus qu'à répondre à « celui-là
//  a-t-il déjà joué ? ».
//
//  Cette mémoire sert une seconde fois : pendant la PRÉPARATION, la file est
//  vide (personne n'a encore choisi). La piste montre alors l'ordre de la
//  manche qui vient de finir, tout le monde à opacité pleine — et quand la
//  nouvelle manche s'ouvre, les portraits GLISSENT à leur nouvelle place au
//  lieu de réapparaître ailleurs. C'est pour ce glissement que les tuiles sont
//  positionnées une par une en absolu et réutilisées d'un dessin à l'autre :
//  un `innerHTML` reconstruit à chaque fois n'anime rien.
// =========================================================================

// La géométrie, en un seul endroit. La piste est « un peu plus grosse » que
// l'ancienne (55 × 63) ; tout le reste — l'encart d'initiative, les jauges, les
// états — se déduit de ces trois nombres.
const PISTE_LARGEUR_TUILE = 68;
const PISTE_HAUTEUR_TUILE = 78;
// L'écart reprend la proportion du croquis : les portraits y sont serrés, et
// les deux jauges penchées de deux voisins se frôlent sans se toucher. Elles
// débordent de six pixels de chaque côté, d'où les seize qui restent.
const PISTE_ECART = 16;
const PISTE_PAS = PISTE_LARGEUR_TUILE + PISTE_ECART;
// De la place sous les portraits pour les pastilles d'état, qui débordent.
const PISTE_MARGE_ETATS = 26;

// L'ordre COMPLET de la manche en cours : { manche, ordre: [{id, initiative, idCarte}] }.
window.PISTE_MANCHE = { manche: 0, ordre: [] };

// Le combattant a-t-il fini son tour ? Il est dans l'ordre de la manche, mais
// plus dans la file de ceux qui restent à jouer.
function pisteAJoue(id, resteAJouer) {
    return !resteAJouer.has(id);
}

// =========================================================================
//  LE TITRE DE PRÉPARATION, AU-DESSUS DE LA PISTE
// =========================================================================
// Nico voulait qu'on sache d'un coup d'œil où en est la manche pendant qu'on
// choisit sa carte : un gros titre, posé devant la piste sur un fond flouté
// qui la masque en partie — pas un élément DEDANS elle (voir plus haut le
// long combat contre `backdrop-filter` + z-index négatif sur .piste-fond :
// mieux vaut rester à l'écart de ce piège que le retenter).
//
// Deux titres, et le second ne parle QUE de ce poste-ci : « il me reste une
// carte à choisir » (mes héros ne sont pas tous dans Ont_Joue_Ce_Round / la
// file), ou, une fois que c'est fait, « on attend les autres » tant que
// toutLeMondeAJoue ne dit pas oui. Dès que la phase bascule en résolution, le
// titre s'efface : la piste redevient entièrement lisible.
window.actualiserTitrePreparation = function(queueParam, phaseParam) {
    const zone = document.getElementById("titre-preparation-zone");
    const texte = document.getElementById("titre-preparation-texte");
    if (!zone || !texte) return;

    const partie = window.PARTIE_DATA || {};
    const queue = queueParam !== undefined ? queueParam : (partie.File_Attente_Combat || []);
    const phase = phaseParam !== undefined ? phaseParam : (partie.Phase_Combat || "Preparation");

    if (phase !== "Preparation") {
        zone.style.opacity = "0";
        return;
    }

    // Mes héros encore en jeu : un combattant à terre n'a plus de carte à
    // choisir, il ne doit jamais retenir ce titre affiché.
    const horsJeu = new Set(partie.Combattants_Hors_Jeu || []);
    const mesHeros = (window.COMBAT_PERSOS_JOUEUR || []).filter(p => !horsJeu.has(p.idPersonnage));

    const aJoue = new Set(partie.Ont_Joue_Ce_Round || []);
    queue.forEach(f => aJoue.add(f.idPersonnage));
    const moiPret = mesHeros.every(p => aJoue.has(p.idPersonnage));

    let texteAAfficher;
    if (!moiPret) {
        texteAAfficher = "Sélectionner une compétence";
    } else if (typeof window.toutLeMondeAJoue === "function" && window.toutLeMondeAJoue(partie, queue)) {
        // Tout le monde a joué : la résolution s'ouvre d'un instant à l'autre,
        // inutile d'afficher quoi que ce soit entre-temps.
        texteAAfficher = null;
    } else {
        texteAAfficher = "En attente des joueurs";
    }

    if (!texteAAfficher) {
        zone.style.opacity = "0";
        return;
    }
    if (texte.textContent !== texteAAfficher) texte.textContent = texteAAfficher;
    zone.style.opacity = "1";
};

window.afficherPisteInitiative = function(queue, phase) {
    if (queue === undefined && window.PARTIE_DATA) {
        queue = window.PARTIE_DATA.File_Attente_Combat || [];
        phase = window.PARTIE_DATA.Phase_Combat || "Preparation";
    }
    queue = queue || [];

    // Pendant l'animation de fin de tour, on ne redessine pas la piste. Mais la
    // notification qui apporte l'état suivant ne reviendra pas toute seule : si
    // la bascule en résolution tombe pendant cette fenêtre (et elle y tombe
    // souvent, puisque les créatures choisissent en dernier), la piste ne se
    // remettrait plus jamais à jour et le combat aurait l'air figé. On se
    // rappelle donc, comme le fait déjà l'IA.
    if (window.ANIMATION_TOUR_EN_COURS) {
        clearTimeout(window.RAPPEL_PISTE_INITIATIVE);
        window.RAPPEL_PISTE_INITIATIVE = setTimeout(() => window.afficherPisteInitiative(queue, phase), 300);
        return;
    }
    clearTimeout(window.RAPPEL_PISTE_INITIATIVE);

    const piste = document.getElementById("piste-initiative");
    if (!piste) return;

    const partie = window.PARTIE_DATA || {};
    const manche = parseInt(partie.Tour_Combat) || 1;
    const enResolution = phase === "Resolution" && queue.length > 0;

    // LA MÉMOIRE EST UNE GLOBALE, DONC ON NE LA SUPPOSE PAS. Elle est posée en
    // haut de ce fichier, mais un fichier n'est pas toujours chargé en entier —
    // un banc qui n'extrait que cette fonction, un script coupé en plein vol,
    // une remise à zéro qui passe au mauvais moment. Une piste qui lève une
    // exception emporte avec elle le bouton de fin de tour et la fenêtre de
    // tour, qu'elle rafraîchit juste en dessous : ça vaut bien deux lignes.
    if (!window.PISTE_MANCHE || !Array.isArray(window.PISTE_MANCHE.ordre)) {
        window.PISTE_MANCHE = { manche: 0, ordre: [] };
    }

    // MÉMORISER L'ORDRE DE LA MANCHE, une fois, à son ouverture. On repère une
    // manche neuve à son numéro ; le test sur la longueur n'est qu'un filet, au
    // cas où une file arriverait plus complète que celle qu'on a retenue (un
    // poste qui rattrape son retard, par exemple).
    if (enResolution && (window.PISTE_MANCHE.manche !== manche
                         || queue.length > window.PISTE_MANCHE.ordre.length)) {
        window.PISTE_MANCHE = {
            manche,
            ordre: queue.map(f => ({ id: f.idPersonnage, initiative: f.initiative, idCarte: f.idCarte }))
        };
    }

    // CE QU'ON DESSINE. En résolution : l'ordre retenu de la manche. Sinon
    // (préparation, ou file vide) : le même ordre, celui de la manche qui vient
    // de finir — et si le combat vient de commencer et qu'on n'a encore rien
    // retenu, l'ordre d'initiative de la partie, sans chiffres.
    let ordre = window.PISTE_MANCHE.ordre;
    if (ordre.length === 0) {
        ordre = (partie.Ordre_Initiative || []).map(id => ({ id, initiative: null, idCarte: null }));
    }

    // Un combattant à terre quitte la piste : son pion a déjà disparu du
    // plateau, sa place dans l'ordre de passage n'a plus de sens.
    ordre = ordre.filter(e => !(typeof window.estCombattantMort === "function"
                                && window.estCombattantMort(e.id)));

    const resteAJouer = new Set(enResolution ? queue.map(f => f.idPersonnage) : ordre.map(e => e.id));
    const idQuiJoue = enResolution ? queue[0].idPersonnage : null;

    // On ne garde que ceux dont on a vraiment la fiche : sans elle il n'y a ni
    // portrait, ni jauges, ni rien à montrer.
    const visibles = ordre
        .map(e => ({ ...e, perso: (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === e.id) }))
        .filter(e => !!e.perso);

    // LA PISTE NE DOIT JAMAIS SORTIR DE L'ÉCRAN. Ancrée en bas à droite, elle
    // se contentait d'un `max-width` et débordait sous le panneau : centrée en
    // haut, un débordement la ferait sortir des DEUX côtés à la fois. Trois
    // joueurs contre quatre créatures font déjà sept portraits, et une illusion
    // ou un renfort en ajoutent.
    //
    // Plutôt que de couper, on resserre : les portraits se chevauchent comme un
    // jeu de cartes en éventail, et tout le monde reste visible.
    const largeurMax = Math.max(320, (window.innerWidth || 1024) * 0.92);
    let pas = PISTE_PAS;
    if (visibles.length > 1) {
        const besoin = (visibles.length - 1) * pas + PISTE_LARGEUR_TUILE;
        if (besoin > largeurMax) {
            pas = Math.max(28, (largeurMax - PISTE_LARGEUR_TUILE) / (visibles.length - 1));
        }
    }

    piste.style.width = visibles.length === 0
        ? "0px"
        : ((visibles.length - 1) * pas + PISTE_LARGEUR_TUILE) + "px";
    piste.style.height = (PISTE_HAUTEUR_TUILE + PISTE_MARGE_ETATS) + "px";
    piste.style.opacity = visibles.length === 0 ? "0" : "1";

    // LE BANDEAU : un élément posé une fois pour toutes, jamais reconstruit. Il
    // suit la largeur de la piste sans qu'on ait à la lui dire, puisqu'il est
    // ancré à ses deux bords. Il descend du bord haut de l'écran : il pend
    // plutôt que de flotter, et ses deux coins du bas sont les seuls arrondis.
    //
    // SON OMBRE A RETROUVÉ SON PROPRE ÉLÉMENT, et cette fois elle s'y voit.
    //
    // Elle en avait déjà un, autrefois, et il était invisible : le
    // `backdrop-filter` que portait alors le bandeau le promouvait en couche de
    // composition, et les éléments à z-index négatif étaient peints DANS le fond
    // que cette couche recouvrait ensuite. Ce `backdrop-filter` a disparu, le
    // terrain est donc redevenu sain — et il le fallait, car une ombre portée
    // par le bandeau lui-même ne peut qu'épouser sa forme, alors qu'on veut une
    // tache sans contour (voir style.css).
    //
    // ELLE EST INSÉRÉE EN PREMIER, PAS AJOUTÉE À LA FIN. Le bandeau et elle sont
    // tous deux à z-index -1 : c'est l'ordre dans la page qui décide lequel
    // passe devant. Ajoutée après coup sur une piste déjà construite, elle se
    // serait retrouvée PAR-DESSUS le bandeau, à le noircir.
    let ombre = piste.querySelector(".piste-ombre-sol");
    if (!ombre) {
        ombre = document.createElement("div");
        ombre.className = "piste-ombre-sol";
        piste.insertBefore(ombre, piste.firstChild);
    }
    // La moitié d'un portrait, prise à la constante : le jour où les portraits
    // changeront de taille, l'ombre suivra sans qu'on ait à y penser.
    ombre.style.height = (PISTE_HAUTEUR_TUILE / 2) + "px";

    let fond = piste.querySelector(".piste-fond");
    if (!fond) {
        fond = document.createElement("div");
        fond.className = "piste-fond";
        piste.appendChild(fond);
    }

    // LES TUILES SONT RÉUTILISÉES, jamais reconstruites : c'est ce qui leur
    // permet de glisser. On les retrouve par l'identifiant du combattant.
    const vues = new Set();
    visibles.forEach((e, index) => {
        vues.add(e.id);
        let tuile = piste.querySelector(`.piste-tuile[data-id="${e.id}"]`);
        if (!tuile) {
            tuile = document.createElement("div");
            tuile.className = "piste-tuile";
            tuile.dataset.id = e.id;
            tuile.style.width = PISTE_LARGEUR_TUILE + "px";
            tuile.style.height = PISTE_HAUTEUR_TUILE + "px";
            // Une tuile qui naît se pose directement à sa place, sans glisser
            // depuis la gauche de l'écran : la transition ne doit courir que
            // sur les DÉPLACEMENTS.
            tuile.style.left = (index * pas) + "px";
            tuile.onclick = () => window.selectionnerEtCentrerPerso(e.id);
            piste.appendChild(tuile);
        }
        tuile.style.left = (index * pas) + "px";
        // Resserrés, les portraits se recouvrent : le premier de la file passe
        // devant ses voisins, comme dans un éventail.
        tuile.style.zIndex = String(visibles.length - index);
        tuile.classList.toggle("a-joue", enResolution && pisteAJoue(e.id, resteAJouer));
        tuile.innerHTML = contenuTuilePiste(e, e.id === idQuiJoue);
    });

    // Un combattant qui n'est plus sur la piste (tombé, retiré du combat)
    // emporte sa tuile.
    piste.querySelectorAll(".piste-tuile").forEach(t => {
        if (!vues.has(t.dataset.id)) t.remove();
    });

    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour(queue, phase);
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour(queue, phase);
    if (typeof window.actualiserTitrePreparation === "function") window.actualiserTitrePreparation(queue, phase);
};

// LES QUATRE PALIERS, LES QUATRE COULEURS. Un Petit se repère en gris, un
// Normal en blanc, un Élite en jaune, un Boss en rouge — les mêmes teintes
// qu'ailleurs dans le jeu (le rouge du Boss est celui de la jauge de vie).
// Exposée sur window : le banc de test la lit directement plutôt que de
// deviner les couleurs depuis le CSS rendu.
window.COULEURS_PALIER_INITIATIVE = {
    "Petit": "#a8a8a8",
    "Normal": "#ffffff",
    "Élite": "#f4c430",
    "Boss": "#e63946"
};

// Le contenu d'une tuile : le portrait (hexagone pour un héros, médaillon rond
// pour une créature), l'encart d'initiative, les deux jauges penchées, et les
// pastilles d'état sous le tout.
function contenuTuilePiste(entree, cestSonTour) {
    const perso = entree.perso;
    const L = PISTE_LARGEUR_TUILE, H = PISTE_HAUTEUR_TUILE;

    const pvMax = (parseInt(perso.PV_Max) || 1) + (parseInt(perso.Dev_Mod_PV) || 0);
    const pvActuels = perso.PV_Actuels !== undefined ? parseInt(perso.PV_Actuels) : pvMax;
    const pctPv = Math.min(100, Math.max(0, (pvActuels / pvMax) * 100));

    const fatigueMax = window.fatigueMaxCombattant(perso);
    const fatigue = perso.fatigueActuelle !== undefined ? parseInt(perso.fatigueActuelle) : fatigueMax;
    const pctFatigue = Math.min(100, Math.max(0, (fatigue / fatigueMax) * 100));

    // UNE CRÉATURE PORTE SON MÉDAILLON ROND, celui-là même qu'elle a sur le
    // plateau, et à la taille des portraits voisins : on reconnaît d'un coup
    // d'œil qui est qui sans avoir à lire un nom.
    //
    // LE HÉROS PORTE DÉSORMAIS LE MÊME MÉDAILLON ROND QUE LA CRÉATURE — celui
    // de son PION sur le plateau (TOKENS_VTT_DATA[id].url), pas le portrait de
    // sa fiche : c'est ce token-là qu'on reconnaît en un coup d'œil sur la
    // carte, et la piste doit montrer la même chose. L'hexagone doré n'a plus
    // de raison de traiter les deux camps différemment.
    const estEnnemi = !!perso.estMonstre && !perso.estIllusion;
    const imgUrl = estEnnemi
        ? window.IMAGE_TOKEN_ENNEMI
        : (((window.TOKENS_VTT_DATA || {})[perso.idPersonnage] || {}).url
           || perso.urlCloudinary
           || "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png");

    const portrait = `<div style="position: absolute; top: ${Math.round((H - L) / 2)}px; left: 0; width: ${L}px; height: ${L}px;
                       border-radius: 50%; overflow: hidden; z-index: 1;">
               <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: contain;">
           </div>`;

    // Le chiffre d'initiative, dans le même petit encart pour tout le monde.
    // Vide tant que la manche n'a pas ouvert (la piste montre alors l'ordre de
    // la précédente, ou le simple ordre d'initiative au tout premier tour).
    const affichageInit = entree.idCarte === "REPOS_LONG" ? "⏳"
                        : (entree.initiative === null || entree.initiative === undefined ? "–" : entree.initiative);

    // LA COULEUR DE L'ENCART SUIT LE PALIER DE LA CRÉATURE : d'un coup d'œil,
    // sans lire son nom ni ouvrir sa fiche, on sait si c'est un Petit, un
    // Normal, un Élite ou un Boss qui va jouer. Un héros n'a pas de palier
    // (voir combat_etat.js) : il garde l'or d'origine.
    const couleurInitiative = (perso.estMonstre && window.COULEURS_PALIER_INITIATIVE[perso.Palier])
        || "#e8d5a5";

    let etatsHtml = "";
    if (perso.Etats_Alteres && perso.Etats_Alteres.length > 0) {
        etatsHtml = `<div style="position: absolute; bottom: -${PISTE_MARGE_ETATS - 4}px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; justify-content: center; z-index: 5;">`;
        perso.Etats_Alteres.forEach(etat => { etatsHtml += window.imageEtat(etat, 18); });
        etatsHtml += `</div>`;
    }

    return `
        ${cestSonTour ? '<div class="piste-scintillement"></div>' : ''}
        ${portrait}
        <div style="position: absolute; top: -3px; left: -5px; width: 23px; height: 23px; border-radius: 50%; border: 1px solid ${couleurInitiative}; background: #1a0f08; box-shadow: 0 2px 5px rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 3;">
            <span style="color: ${couleurInitiative}; font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; text-shadow: 1px 1px 3px black, 0 0 5px ${couleurInitiative}80;">${affichageInit}</span>
        </div>

        <div style="position: absolute; bottom: 5px; left: -6px; width: 31px; height: 5px; background: #000; border: 1px solid #1a0f08; border-radius: 2px; transform: rotate(30deg); transform-origin: center; box-shadow: 0 2px 4px rgba(0,0,0,0.8); overflow: hidden; z-index: 3;">
            <div style="position: absolute; top: 0; right: 0; width: ${pctPv}%; height: 100%; background: linear-gradient(to right, #e63946, #ff8b8b); transition: width 0.3s ease;"></div>
        </div>

        <div style="position: absolute; bottom: 5px; right: -6px; width: 31px; height: 5px; background: #000; border: 1px solid #1a0f08; border-radius: 2px; transform: rotate(-30deg); transform-origin: center; box-shadow: 0 2px 4px rgba(0,0,0,0.8); overflow: hidden; z-index: 3;">
            <div style="position: absolute; top: 0; left: 0; width: ${pctFatigue}%; height: 100%; background: linear-gradient(to right, #c2a878, #fbf5bd); transition: width 0.3s ease;"></div>
        </div>
        ${etatsHtml}`;
}

// =========================================================================
//  BANDEAU D'ACTION (BAS GAUCHE) : LA CARTE DU COMBATTANT QUI JOUE
// =========================================================================

// LE RELAIS PISTE → PANNEAU LATÉRAL A DISPARU AVEC SON DÉCLENCHEUR.
//
// Il rouvrait le panneau de gauche au moment où la piste d'initiative
// s'effaçait, pour que le joueur retrouve sa fiche avant de choisir sa carte.
// La piste ne s'efface plus jamais : cette bascule n'avait tout simplement plus
// d'instant où se produire. Le rafraîchissement de la fenêtre sombre, qui
// voyageait avec elle, est passé dans afficherPisteInitiative — il n'a rien à
// voir avec le panneau et devait vivre sa propre vie.

// La fiche d'une carte, qu'elle appartienne à un héros (cache du panneau) ou à
// une créature (cache global alimenté à la génération du monstre).
window.donneesCarteCombattant = function(idPersonnage, idCarte) {
    return (window.COMPETENCES_CACHE || {})[idCarte]
        || ((window.CACHE_COMPETENCES_GLOBAL || {})[idPersonnage] || {})[idCarte]
        || null;
};

// Les effets d'une carte, en toutes lettres. "Initiative +" n'en fait pas
// partie : ce n'est pas un effet de jeu, et la carte ne l'affiche pas non plus.
//
// PAS DE POURCENTAGES DANS L'ENCART DE TOUR, ET LA RÈGLE SE LIT DANS LE TEXTE.
//
// L'encart annonce ce qui va se passer, en une seconde, pendant qu'on regarde
// le plateau. « Peur — 6% chance de faire Peur (Max 60%) » n'a rien à y faire :
// le joueur veut savoir qu'il y a de la Peur, pas jouer aux probabilités. Un
// montant de dégâts ou un nombre de cases, lui, change ce qu'on va voir.
//
// Le partage se fait sur la description elle-même, et pas sur une liste
// d'effets tenue à la main : toute description qui contient un « % » tombe,
// toutes les autres restent. C'est exactement le découpage voulu sur les vrais
// effets du jeu — « 2 dégats physique », « 1 hexagone » et « 2 soins » restent ;
// « Peur », « Brûlé » et « Bouclier magique » (dont le texte dit « 30% des pv
// restants ») se réduisent à leur titre — et une nouvelle chance qu'on ajoutera
// un jour au bestiaire suivra la règle sans qu'on y pense.
window.ligneEffetsCarte = function(dataCarte, lanceur) {
    const effets = (dataCarte && dataCarte.Effets_Compiles) || [];
    const lignes = [];

    // LA MÊME PORTÉE QUE SUR LA CARTE EN GRAND, ET PAR LA MÊME RÈGLE.
    // L'encart de tour annonce la technique qui va partir : s'il affichait la
    // portée écrite dans la Forge pendant que la carte en grand affiche celle
    // que l'arme donne, les deux écrans se contrediraient à un mètre l'un de
    // l'autre. `distanceAAfficher` et `texteDistanceReelle` vivent dans
    // moteur_effets.js et servent aux deux.
    const porteeVraie = (lanceur && typeof window.distanceAAfficher === "function")
        ? window.distanceAAfficher(dataCarte, lanceur) : null;
    const reecrireDistance = (texte) => (porteeVraie && typeof window.texteDistanceReelle === "function")
        ? window.texteDistanceReelle(texte, porteeVraie) : texte;
    // Le format d'une ligne, à un seul endroit : la ligne de Distance ajoutée
    // doit être indiscernable des vraies.
    const ligneEffet = (nom, desc, estMod) => {
        const retrait = estMod ? "margin-left: 18px; margin-top: 4px;" : "margin-top: 8px;";
        const couleur = estMod ? "#ddd4c4" : "#f4efe4";
        const prefixe = estMod ? "↳ " : "• ";
        const detail = desc
            ? `<div style="color: #cfc6b6; font-size: 15px; font-style: italic; line-height: 1.3; margin-left: 14px;">${desc}</div>`
            : "";
        return `<div style="${retrait}">
                <div style="color: ${couleur}; font-weight: bold;">${prefixe}${nom}</div>
                ${detail}
            </div>`;
    };
    let aDejaSaDistance = false;

    effets.forEach(eff => {
        // Les vieilles cartes gardent des effets en simple texte : on les
        // affiche tels quels, sans description.
        if (typeof eff === "string") {
            const brut = eff.replace(/\s+/g, " ").trim();
            if (!brut || brut.indexOf("Initiative +") >= 0) return;
            const estDistance = brut.indexOf("Distance") >= 0;
            if (estDistance) aDejaSaDistance = true;
            lignes.push(`<div style="margin-top: 6px; color: #f4efe4;">• ${estDistance ? reecrireDistance(brut) : brut}</div>`);
            return;
        }
        if (!eff || !eff.nom) return;
        if (eff.nom.indexOf("Initiative +") === 0) return;
        // La zone est dessinée à côté, pas décrite en toutes lettres.
        if (eff.isZone) return;

        const estDistance = eff.nom.indexOf("Distance") >= 0;
        if (estDistance) aDejaSaDistance = true;
        const chiffre = eff.desc && !/%/.test(eff.desc);
        lignes.push(ligneEffet(eff.nom,
                               chiffre ? (estDistance ? reecrireDistance(eff.desc) : eff.desc) : "",
                               !!eff.isMod));
    });

    // La carte ne dit rien de sa portée, et pourtant elle porte : c'est l'arme.
    // On l'écrit en tête, dans le même format qu'une vraie ligne.
    if (porteeVraie && !aDejaSaDistance) {
        lignes.unshift(ligneEffet("Distance",
                                  reecrireDistance(window.gabaritTexteDistance()), false));
    }

    if (lignes.length === 0) return `<span style="color: #a89f91; font-style: italic;">Aucun effet</span>`;
    return lignes.join("");
};

// La couleur d'un combattant : la sienne s'il en a une, le rouge de sang des
// créatures sinon. Elle habille le nom de sa technique dans la fenêtre de tour.
window.couleurCombattant = function(perso) {
    const estCreature = !!(perso && perso.estMonstre)
        || (typeof window.estMonstre === "function" && perso && window.estMonstre(perso.idPersonnage));
    if (estCreature) return "#e63946";
    const c = perso && perso.couleur;
    return (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : "#e8d5a5";
};

// Le dégradé brossé du panneau latéral, mais dans la couleur qu'on lui donne :
// un éclat clair, la couleur pleine, une ombre profonde, puis un reflet. C'est
// « le même effet », transposé — et non un simple aplat.
window.degradeBrosse = function(couleur) {
    return `linear-gradient(135deg, #ffffff 0%, ${couleur} 22%, ${window.assombrirCouleur(couleur, 0.45)} 50%, ${couleur} 74%, #ffffff 100%)`;
};

window.assombrirCouleur = function(hex, facteur) {
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) return "#5c3a21";
    const r = Math.round(((n >> 16) & 255) * (1 - facteur));
    const v = Math.round(((n >> 8) & 255) * (1 - facteur));
    const b = Math.round((n & 255) * (1 - facteur));
    return "#" + [r, v, b].map(x => x.toString(16).padStart(2, "0")).join("");
};

// Le dessin de la zone d'une technique, en hexagones — le même que sur la carte
// en grand format, mais aux couleurs du combattant et en plus lisible de loin.
window.dessinZoneCarte = function(dataCarte, couleur, rayonHex) {
    const actions = (dataCarte && dataCarte.Composants && dataCarte.Composants.actions) || [];
    let hexesZone = [];
    let aDistance = false;
    actions.forEach(act => {
        if (act.zoneHexes && act.zoneHexes.length > 0) hexesZone = act.zoneHexes;
        if (act.mods && Object.keys(act.mods).some(id => /DISTANCE/i.test(id))) aDistance = true;
    });
    (dataCarte && dataCarte.Effets_Compiles || []).forEach(eff => {
        if (eff && typeof eff === "object" && typeof eff.nom === "string" && eff.nom.indexOf("Distance") === 0) aDistance = true;
    });
    if (hexesZone.length === 0) return "";

    const rayon = rayonHex || 15;
    let polygones = "";
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let q = -3; q <= 3; q++) {
        for (let r = Math.max(-3, -q - 3); r <= Math.min(3, -q + 3); r++) {
            const estCentre = (q === 0 && r === 0);
            const estLanceur = estCentre && !aDistance;
            const estPrise = hexesZone.some(h => h.q === q && h.r === r);
            if (!estPrise && !estLanceur) continue;

            const x = rayon * Math.sqrt(3) * (q + r / 2.0);
            const y = rayon * 1.5 * r;
            const remplissage = (estLanceur && !estPrise) ? "rgba(160, 160, 160, 0.75)" : couleur;

            let points = "";
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 3 * i - Math.PI / 6;
                const px = x + rayon * Math.cos(angle);
                const py = y + rayon * Math.sin(angle);
                points += `${px.toFixed(1)},${py.toFixed(1)} `;
                minX = Math.min(minX, px); maxX = Math.max(maxX, px);
                minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            }
            polygones += `<polygon points="${points.trim()}" fill="${remplissage}" fill-opacity="0.8" stroke="#ffffff" stroke-width="1.5" />`;
        }
    }
    if (minX === Infinity) return "";

    const marge = 4;
    const largeur = maxX - minX + marge * 2;
    const hauteur = maxY - minY + marge * 2;
    return `<svg width="${largeur.toFixed(0)}" height="${hauteur.toFixed(0)}"
                 viewBox="${(minX - marge).toFixed(1)} ${(minY - marge).toFixed(1)} ${largeur.toFixed(1)} ${hauteur.toFixed(1)}"
                 style="filter: drop-shadow(0 5px 10px rgba(0,0,0,0.9));">${polygones}</svg>`;
};

// Une seule ligne, donc : plutôt que de couper le texte, on rétrécit la police
// jusqu'à ce qu'il tienne — même parti pris que les titres des bannières.
function ajusterSurUneLigne(element, tailleMax, tailleMin) {
    if (!element) return;
    let taille = tailleMax;
    element.style.fontSize = taille + "px";
    while (taille > tailleMin && element.scrollWidth > element.clientWidth) {
        taille -= 1;
        element.style.fontSize = taille + "px";
    }
}

// =========================================================================
//  LA FENÊTRE DE TOUR (« le voile ») — L'AFFICHAGE
// =========================================================================
//  Le protocole (qui a fini de calculer, qui a fini de rejouer, quand la file
//  avance) vit dans sequence_tour.js. Ici on ne fait que peindre ce que ce
//  protocole raconte : qui joue, dans quel état, avec quelle technique, et pour
//  quel effet. Le tout est ici plutôt que là-bas parce que la mise à la bonne
//  taille (ajusterSurUneLigne) et la lecture des cartes appartiennent à ce
//  fichier depuis toujours.
window.rafraichirVoileTour = function(queueParam, phaseParam) {
    const voile = document.getElementById("voile-tour-combat");
    if (!voile) return;

    const masquer = () => {
        voile.style.opacity = "0";
        voile.style.pointerEvents = "none";
        // Le retrait effectif attend la fin du fondu : sans ça la fenêtre
        // disparaît d'un coup et le plateau saute à l'œil.
        clearTimeout(voile._minuteurRetrait);
        voile._minuteurRetrait = setTimeout(() => {
            if (voile.style.opacity === "0") voile.style.display = "none";
        }, 460);
        const ok = document.getElementById("voile-tour-ok");
        if (ok) ok.style.display = "none";
        const forcer = document.getElementById("voile-tour-forcer");
        if (forcer) forcer.style.display = "none";
    };

    if (document.getElementById("fenetre-combat")?.style.display !== "block") return masquer();

    const seq = window.SEQUENCE_TOUR;
    if (!seq || !seq.voile) return masquer();

    // LA CROIX ROUGE l'a écartée à la main pour qu'on puisse regarder le plateau.
    // Elle reste écartée tant que le tour retenu est le MÊME : dès qu'un
    // nouveau tour se présente, la fenêtre reprend sa place toute seule — sinon
    // on oublierait qu'on l'a fermée et on jouerait à l'aveugle. `revoirVoileTour()`
    // la rappelle tout de suite.
    if (window.VOILE_TOUR_MASQUE_DEBUG) {
        const marque = `${seq.acteur}|${seq.idCarte || ""}`;
        if (voile._tourMasqueDebug === undefined) voile._tourMasqueDebug = marque;
        if (voile._tourMasqueDebug === marque) return masquer();
        voile._tourMasqueDebug = undefined;
        window.VOILE_TOUR_MASQUE_DEBUG = false;
    } else {
        voile._tourMasqueDebug = undefined;
    }

    const partie = window.PARTIE_DATA || {};
    const queue = queueParam !== undefined ? queueParam : (partie.File_Attente_Combat || []);
    const phase = phaseParam !== undefined ? phaseParam : (partie.Phase_Combat || "Preparation");

    // Deux sources possibles pour « qui agit ». Quand la fenêtre parle d'un
    // ÉVÉNEMENT — un tour retenu par le OK, ou un tour en cours de relecture —
    // c'est l'événement qui fait foi : ce poste peut être en retard, la file
    // avoir déjà tourné, et le combattant du tour être mort depuis. On raconte
    // ce qu'on montre, pas ce que la base dit de l'instant présent.
    let tete;
    if (seq.evenement) {
        tete = { idPersonnage: seq.acteur, idCarte: seq.idCarte };
    } else {
        tete = (phase === "Resolution" && queue.length > 0) ? queue[0] : null;
        if (!tete || tete.idPersonnage !== seq.acteur) return masquer();
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(tete.idPersonnage)) return masquer();
    }

    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === tete.idPersonnage) || {};

    // LA PLAQUE DOIT ÊTRE MESURABLE AVANT QU'ON POSE QUOI QUE CE SOIT DESSUS.
    //
    // Tout ce qui se pose sur l'encart — la taille du portrait, celle du nom,
    // celle des icônes d'état — est un POURCENTAGE de la largeur réellement
    // rendue de la plaque. Or cette fonction ne rendait la fenêtre visible qu'à
    // sa toute fin : entre deux tours, la fenêtre se retire complètement
    // (display:none au bout de 460 ms), et le tour suivant trouvait donc une
    // plaque de largeur nulle. appliquerReglagesEncart renonce dans ce cas — et
    // le portrait gardait les mesures de la forme PRÉCÉDENTE.
    //
    // Deux défauts signalés en partie, une seule cause : le médaillon d'une
    // créature qui héritait de la hauteur d'un avatar en pied et sortait deux
    // fois trop gros, et l'avatar d'un héros qui, privé de sa hauteur, se
    // dessinait à la taille brute de son image et n'était plus lisible.
    //
    // On rend donc la fenêtre présente MAINTENANT. Elle reste transparente :
    // l'opacité ne monte qu'à la fin, après le reflow, et le fondu d'entrée est
    // intact. Le retrait en attente est annulé, sinon il la reprendrait au
    // milieu du tour.
    if (voile.style.display !== "block") {
        clearTimeout(voile._minuteurRetrait);
        voile.style.display = "block";
    }

    // LE GROS PION DU COMBATTANT. Une créature porte l'image commune des
    // ennemis, celle-là même qu'elle a sur le plateau et dans la piste : on
    // reconnaît qui frappe sans avoir à lire.
    const elPion = document.getElementById("voile-tour-pion");
    if (elPion) {
        const estCreature = !!perso.estMonstre
            || (typeof window.estMonstre === "function" && window.estMonstre(tete.idPersonnage));

        // DEUX FORMES, ET C'EST LE PORTRAIT QUI DÉCIDE.
        //
        // Le médaillon taille l'image au carré : parfait pour un pion de
        // plateau, désastreux pour un portrait en pied — il lui coupait la tête.
        // Un héros qui a un vrai portrait l'a donc ENTIER, plus grand, monté du
        // bas de l'écran ; une créature, ou un héros qui n'en a pas, garde son
        // médaillon. La bascule tient dans cette seule classe, et hud_disposition.js
        // la lit pour savoir laquelle des deux géométries poser.
        const enPied = !estCreature && !!perso.urlCloudinary;
        const boitePion = document.getElementById("voile-tour-pion-boite");
        if (boitePion && boitePion.classList.contains("pion-avatar-entier") !== enPied) {
            boitePion.classList.toggle("pion-avatar-entier", enPied);
            // La forme vient de changer : ses mesures ne sont plus les bonnes.
            if (typeof window.appliquerReglagesEncart === "function") window.appliquerReglagesEncart();
        }
        // LES DEUX REPLIS NE SONT PAS DÉCORATIFS. Une fiche sans portrait, ça
        // arrive ; et IMAGE_TOKEN_ENNEMI vit plus haut dans ce même fichier,
        // donc à portée en vraie page — mais pas forcément dans un banc qui
        // n'en charge qu'un morceau. Sans repli, `url` valait `undefined`, la
        // garde « a-t-elle changé ? » comparait undefined à undefined, l'image
        // n'était jamais posée, et le pion restait vide sans un mot.
        const url = (estCreature
            ? window.IMAGE_TOKEN_ENNEMI
            : perso.urlCloudinary)
            || "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png";
        // Réécrire `src` à chaque battement relancerait le chargement de
        // l'image, et le pion clignoterait pendant tout le tour.
        if (elPion.dataset.url !== url) { elPion.dataset.url = url; elPion.src = url; }
    }

    const elNom = document.getElementById("voile-tour-nom");
    const nom = ((perso.prenom || "") + " " + (perso.nom || "")).trim() || "Combattant";
    if (elNom && elNom.dataset.nom !== nom) {
        elNom.dataset.nom = nom;
        elNom.textContent = nom;
        // LA TAILLE DE DÉPART VIENT DE L'ÉLÉMENT, pas d'un chiffre écrit ici.
        // Elle est posée en pourcentage de la plaque (hud_disposition.js) pour que
        // le texte rétrécisse avec elle sur un écran étroit. Un 42 en dur aurait
        // écrasé ce réglage à chaque rafraîchissement.
        const baseNom = parseFloat(elNom.dataset.base) || 42;
        ajusterSurUneLigne(elNom, baseNom, baseNom * 0.5);
    }

    // Les états qu'il porte, dans les mêmes icônes que le panneau latéral.
    const elEtats = document.getElementById("voile-tour-etats");
    if (elEtats) {
        const etats = perso.Etats_Alteres || [];
        const signature = etats.map(e => e.nom + ":" + e.duree).join("|");
        if (elEtats.dataset.signature !== signature) {
            elEtats.dataset.signature = signature;
            // Les icônes seules, sous le pion : leur nom tiendrait mal dans une
            // colonne aussi étroite, et il est déjà dans l'infobulle.
            // La taille des icônes est posée par hud_disposition.js, en pourcentage
            // de la plaque : une image se dimensionne à la construction, elle ne
            // peut pas se contenter d'un pourcentage CSS ici.
            const tailleEtat = parseInt(elEtats.dataset.taille) || 32;
            elEtats.innerHTML = etats.map(etat =>
                `<div title="${etat.nom} (${etat.duree})" style="line-height: 0;">${window.imageEtat(etat, tailleEtat)}</div>`
            ).join("");
        }
    }

    let titre = "";
    let ligne = "";
    let dessinZone = "";
    // La couleur du combattant ne sert plus qu'au dessin de sa zone : le nom de
    // la technique est rouge pour tout le monde (voir plus bas).
    const couleur = window.couleurCombattant(perso);
    if (tete.idCarte === "REPOS_LONG") {
        titre = "Repos Long";
        ligne = `<div style="color: #e8d5a5;">• Concentration et souffle</div>`;
    } else {
        const dataCarte = window.donneesCarteCombattant(tete.idPersonnage, tete.idCarte);
        titre = dataCarte ? (dataCarte.Nom || "Technique") : "Technique";
        ligne = dataCarte ? window.ligneEffetsCarte(dataCarte, perso)
                          : `<span style="color: #a89f91; font-style: italic;">Technique inconnue de ce poste</span>`;
        if (dataCarte) dessinZone = window.dessinZoneCarte(dataCarte, couleur, 16);
    }

    const elCarte = document.getElementById("voile-tour-carte");
    const elEffets = document.getElementById("voile-tour-effets");
    const elZone = document.getElementById("voile-tour-zone");
    if (elCarte && elCarte.textContent !== titre) {
        elCarte.textContent = titre;
        const baseCarte = parseFloat(elCarte.dataset.base) || 26;
        ajusterSurUneLigne(elCarte, baseCarte, baseCarte * 0.5);
    }
    if (elEffets && elEffets.innerHTML !== ligne) elEffets.innerHTML = ligne;
    if (elZone && elZone.innerHTML !== dessinZone) elZone.innerHTML = dessinZone;

    // L'état de la barrière : ce que ce poste attend, et de qui.
    const elAttente = document.getElementById("voile-tour-attente");
    const elOk = document.getElementById("voile-tour-ok");
    const elForcer = document.getElementById("voile-tour-forcer");
    const etape = typeof window.etatSequenceTour === "function" ? window.etatSequenceTour() : null;

    // LE TOUR DU JOUEUR GARDE SON ENCART DU DÉBUT À LA FIN.
    //
    // C'est l'exception voulue : celui qui joue doit avoir sous les yeux ce que
    // fait la compétence qu'il vient de retenir, pendant qu'il vise et qu'il se
    // déplace. L'encart ne se lève donc pas au milieu de son tour, et surtout il
    // ne prend AUCUN clic — sans quoi il avalerait les clics de ciblage destinés
    // au plateau. Il s'en va tout seul quand la tête de file change.
    if (seq.monTour) {
        // Ni message d'attente ni bouton : il n'attend personne, c'est son tour.
        const att = document.getElementById("voile-tour-attente");
        if (att) att.textContent = "";
        const ok0 = document.getElementById("voile-tour-ok");
        if (ok0) ok0.style.display = "none";
        const fo0 = document.getElementById("voile-tour-forcer");
        if (fo0) fo0.style.display = "none";
        voile.style.display = "block";
        voile.style.pointerEvents = "none";
        void voile.offsetWidth;
        voile.style.opacity = "1";
        return;
    }

    // Le joueur a appuyé sur OK : la fenêtre se lève pour laisser voir les
    // animations. Elle ne revient que si la barrière suivante fait attendre.
    if (etape && etape.masquee) return masquer();

    if (elAttente && etape) {
        const texte = etape.message || "";
        if (elAttente.textContent !== texte) elAttente.textContent = texte;
    }
    if (elOk) elOk.style.display = (etape && etape.okVisible) ? "inline-flex" : "none";
    if (elForcer) elForcer.style.display = (etape && etape.forcerVisible) ? "block" : "none";

    voile.style.display = "block";
    // Le clic ne compte que lorsqu'il y a quelque chose à déclencher : sinon un
    // doigt posé au hasard pendant le calcul consommerait le OK à venir.
    voile.style.pointerEvents = (etape && (etape.okVisible || etape.forcerVisible)) ? "auto" : "none";
    // Un reflow avant de monter l'opacité, sinon le fondu d'entrée est sauté.
    void voile.offsetWidth;
    voile.style.opacity = "1";
};

// =========================================================================
//  GESTION VISUELLE DE LA CARTE DANS LE PANNEAU GAUCHE
// =========================================================================
window.actualiserEtatCarteCombat = function(simulationAction = null) {
    if (document.getElementById("fenetre-combat")?.style.display !== "block") return;
    
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    const partie = window.PARTIE_DATA || {};
    const queue = partie.File_Attente_Combat || [];
    const phase = partie.Phase_Combat || "Preparation";
    
    const persoInQueue = simulationAction ? { idCarte: simulationAction } : queue.find(q => q.idPersonnage === persoActuel.idPersonnage);

    // Dé-sélection visuelle si la carte en aperçu n'est plus finançable
    if (window.CARTE_EN_APERCU && !(persoInQueue && persoInQueue.idCarte)) {
        const dataSel = window.COMPETENCES_CACHE[window.CARTE_EN_APERCU];
        const coutSel = parseInt(dataSel?.Fatigue) || 0;
        const fatigueRestante = persoActuel.fatigueActuelle !== undefined
            ? parseInt(persoActuel.fatigueActuelle)
            : (window.COMBAT_FATIGUE_ACTUELLE || 0);
        if (coutSel > fatigueRestante) {
            window.COUT_COMPETENCE_SELECTIONNEE = 0;
            document.querySelectorAll('.banniere-carte-combat').forEach(el => {
                el.dataset.actif = "false";
            });
            if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD();
        }
    }
    
    const deckEl = document.getElementById("combat-liste-competences");
    if (deckEl) deckEl.style.transition = "opacity 0.3s ease, filter 0.3s ease";

    let divRepos = document.getElementById("apercu-repos-long-ui");
    if (!divRepos) {
        divRepos = document.createElement("div");
        divRepos.id = "apercu-repos-long-ui";
        divRepos.style.cssText = "position: absolute; top: 9vh; left: 50px; width: 340px; height: 300px; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; opacity: 0; transition: opacity 0.3s ease, left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); pointer-events: none;";
        divRepos.innerHTML = `
            <div style="font-size: 72px; filter: drop-shadow(0 0 20px rgba(194, 168, 120, 0.8)); animation: levitation 3s infinite alternate ease-in-out;">⏳</div>
            <div style="font-family: 'Cinzel', serif; font-size: 24px; font-weight: bold; color: #e8d5a5; text-shadow: 2px 2px 5px black; margin-top: 10px; text-transform: uppercase; letter-spacing: 2px;">Repos Long</div>
            <div style="font-family: 'Almendra', serif; font-size: 17px; color: #c2a878; text-shadow: 1px 1px 3px black; margin-top: 10px; text-align: center; max-width: 80%;">Concentration et souffle.<br><br><span style="color:#1b6e3a;">+35% Énergie Max</span> à la fin du tour.</div>
        `;
        // Il vivait dans le panneau latéral. Il se pose maintenant dans la
        // fenêtre de combat, à la place que le panneau occupait.
        const fenetre = document.getElementById("fenetre-combat");
        if (fenetre) fenetre.appendChild(divRepos);
    }

    if (persoInQueue && persoInQueue.idCarte) {
        window.mettreAJourJaugeFatigue(0);

        // La carte retenue quitte l'écran, quelle qu'elle soit — c'était déjà
        // le cas du repos long, ça l'est maintenant de toutes les techniques.
        if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true);

        if (persoInQueue.idCarte === "REPOS_LONG") {
            divRepos.style.left = "20px";
            divRepos.style.opacity = "1";
        } else {
            divRepos.style.left = "50px";
            divRepos.style.opacity = "0";
        }

        // Le portrait rapetisse APRÈS le rangement de la carte : masquer
        // l'aperçu rend au portrait sa taille pleine, et l'ordre inverse
        // annulait le rétrécissement dans la foulée — le repos long en
        // souffrait déjà.
        // Et seulement maintenant : le volet remonte. Ce rafraîchissement-là
        // est le filet du geste immédiat — il rattrape les postes qui
        // apprennent le choix par le réseau plutôt qu'au clic.
        if (typeof window.rangerDeckApresChoix === "function") window.rangerDeckApresChoix();
    } else {
        // 🔻 Si la phase est "Resolution", c'est qu'il a déjà joué et n'est plus dans la file : on grise son deck.
        //
        // MAIS PAS S'IL N'A JAMAIS JOUÉ. C'est le filet qui manquait : un poste
        // qui basculait la phase trop tôt condamnait le joueur en retard à
        // regarder son deck éteint pendant tout le combat, sans rien pouvoir
        // cliquer. Tant qu'il n'est pas noté comme ayant posé sa carte, ses
        // techniques restent vivantes — il rentre alors dans la file, et le
        // round se déroule normalement.
        const aDejaJoue = !persoActuel
            || ((window.PARTIE_DATA || {}).Ont_Joue_Ce_Round || []).includes(persoActuel.idPersonnage);
        if (deckEl) {
            if (phase === "Resolution" && aDejaJoue) {
                deckEl.style.opacity = "0.4";
                deckEl.style.pointerEvents = "none";
                deckEl.style.filter = "grayscale(100%)";
            } else {
                deckEl.style.opacity = "1";
                deckEl.style.pointerEvents = "auto";
                deckEl.style.filter = "none";
            }
        }
        divRepos.style.left = "50px";
        divRepos.style.opacity = "0";

        const conteneurCarte = document.getElementById("apercu-carte-hd-competence");
        if (conteneurCarte && conteneurCarte.dataset.locked === "true") {
            conteneurCarte.dataset.locked = "false";
            if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true); 
        }
    }

    if (typeof window.actualiserBannieresEpuisees === "function") {
        window.actualiserBannieresEpuisees();
    }
};

window.actualiserBannieresEpuisees = function() {
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;
    
    const fatigueMax = window.fatigueMaxCombattant(persoActuel);
    const fatiguePerso = persoActuel.fatigueActuelle !== undefined ? parseInt(persoActuel.fatigueActuelle) : fatigueMax;

    const liste = document.getElementById("combat-liste-competences");
    if (!liste) return;

    const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

    Array.from(liste.querySelectorAll('.banniere-carte-combat')).forEach(ban => {
        const idCarte = ban.id.replace("combat-carte-", "");
        const dataCarte = window.COMPETENCES_CACHE[idCarte];
        
        if (dataCarte) {
            const coutFatigue = parseInt(dataCarte.Fatigue) || 0;
            const cadre = document.getElementById(`cadre-combat-${idCarte}`);
            
            if (coutFatigue > fatiguePerso) {
                ban.classList.add("banniere-epuisee");
                if (cadre) cadre.style.backgroundImage = `url('${IMAGE_CADRE_EPUISE}')`;
            } else {
                ban.classList.remove("banniere-epuisee");
                if (cadre && ban.dataset.actif !== "true") cadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;
            }
        }
    });
};

window.validerCarteCombat = async function(idCarte, idLanceur) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    // MÊME UNE CARTE QUI NE FRAPPE RIEN PASSE PAR LE CERVEAU. C'est par ici
    // que sortent les cartes qui n'ont personne à toucher : un lanceur
    // paralysé, une Illusion seule, un Bond seul. On demande une carte, sans
    // attaque ni altération : le cerveau paie l'énergie, ferme le tour, et
    // les trois écrans voient la même chose.
    if (window.regimeDemande && window.regimeDemande.actif()) {
        const qui = idLanceur || persoActuel.idPersonnage;
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🎴", `carte sans cible pour ${qui}`,
                                `${idCarte} — ${parseInt(dataCarte.Fatigue) || 0} d'énergie`);
        }
        return await window.regimeDemande.carte(qui, {
            idCarte,
            attaques: [],
            alterations: [],
            coutFatigue: parseInt(dataCarte.Fatigue) || 0
        });
    }
};

// =========================================================================
//  GESTION DES TOURS ET DE LA RÉINITIALISATION
// =========================================================================

window.DERNIER_TOUR_AFFICHE = 0; // Mémoire locale pour ne pas rejouer l'animation en boucle

// 1. Détecte le changement de tour et lance l'animation
window.verifierChangementTour = function(nouveauTour) {
    const fenetreCombat = document.getElementById("fenetre-combat");
    if (!fenetreCombat || fenetreCombat.style.display !== "block") return;
    
    // Au lancement du combat (Tour 1) ou si le tour change
    if (window.DERNIER_TOUR_AFFICHE !== nouveauTour) {
        window.DERNIER_TOUR_AFFICHE = nouveauTour;
        window.animerTexteTour(nouveauTour);
    }
};

// 2. Joue l'animation CSS centrale
window.animerTexteTour = function(tour) {
    const divAnnonce = document.getElementById("annonce-tour-combat");
    if (!divAnnonce) return;
    
    divAnnonce.innerHTML = `<span>Tour</span> <span style="font-size: 2em; line-height: 0.8; margin-top: -15px;">${tour}</span>`;
    
    divAnnonce.classList.remove("anim-tour-pop");
    void divAnnonce.offsetWidth; 
    divAnnonce.classList.add("anim-tour-pop");
};

// 3. Le super bouton RESET
window.reinitialiserCombat = async function() {
    if (!confirm("Voulez-vous vraiment réinitialiser ce combat ? Tous les PV et la Fatigue seront restaurés, et le combat repassera au Tour 1.")) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // PENDANT TOUT CE QUI SUIT, ON NE JUGE PERSONNE À TERRE. Les fiches vont
    // traverser un instant à zéro point de vie avant de recevoir leurs valeurs
    // neuves : sans ce drapeau, les héros bien vivants entrent dans
    // Combattants_Hors_Jeu, n'en sortent plus, et la rencontre suivante se joue
    // sans eux (voir synchroniserCombattantsHorsJeu).
    window.REINITIALISATION_COMBAT_EN_COURS = true;

    // La piste oublie l'ordre de la manche : celui de la rencontre d'avant n'a
    // plus rien à montrer, et il ferait apparaître des combattants effacés le
    // temps que la nouvelle file arrive.
    window.PISTE_MANCHE = { manche: 0, ordre: [] };

    // Et la piste des états oublie son tapis, pour la même raison : elle garde
    // l'ordre d'arrivée en mémoire, et cet ordre-là n'a plus d'objet.
    if (typeof window.oublierPisteEtats === "function") window.oublierPisteEtats();

    // LE COMBAT DU NOUVEAU RÉGIME SE FERME AUSSI, ET AVANT LE RESTE. Un état
    // publié qui survivrait à une réinitialisation serait pire qu'inutile : les
    // postes le liraient encore, avec ses positions et ses points de vie de la
    // rencontre d'avant, par-dessus le plateau qu'on vient de nettoyer. C'est
    // le bug du curseur resté sur le journal purgé, dans sa version la plus
    // visible.
    if (typeof window.regimeFermerLeCombat === "function") {
        try { await window.regimeFermerLeCombat(); } catch (e) { console.error("Fermeture du régime :", e); }
    }

    try {
        const { doc, getDoc, deleteDoc, updateDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");

        // A. Reset de la Partie (Tour 1, file vide)
        if (window.ID_PARTIE_COURANTE) {
            const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
            await updateDoc(partieRef, {
                File_Attente_Combat: [],
                Phase_Combat: "Preparation",
                Tour_Combat: 1,
                // Les repères d'apparition ne survivent pas à une réinitialisation :
                // le combat suivant se placera peut-être ailleurs sur la carte.
                Spawn_Allies: deleteField(),
                Spawn_Ennemis: deleteField(),
                // Le butin du combat précédent non plus. Il est déjà réparti :
                // ce qui a été pris est équipé, le reste est perdu. Le laisser
                // en base ferait traîner un butin réputé "de cette rencontre"
                // par-dessus le combat suivant.
                Butin: deleteField(),
                // Le suivi du round repart de zéro : personne n'est à terre,
                // personne n'a encore joué.
                Combattants_Hors_Jeu: [],
                Ont_Joue_Ce_Round: [],
                // La rencontre passée est close : sans cela, le prochain butin
                // s'attribuerait l'identifiant de l'ancienne.
                Difficulte_Rencontre: deleteField(),
                ID_Rencontre: deleteField(),
                // Le ménage qui suit prend plusieurs écritures (créatures,
                // pions, soins). Tant qu'il dure, aucun poste ne doit prendre
                // les cadavres du combat précédent pour une victoire fraîche et
                // ouvrir un butin fantôme. Le drapeau part dans la MÊME écriture
                // que l'effacement du butin : impossible de voir l'un sans
                // l'autre.
                Reinitialisation_En_Cours: Date.now()
            });

            // LE JOURNAL DU COMBAT PRÉCÉDENT N'A PLUS RIEN À RACONTER. On
            // l'efface et on remet son compteur à zéro dans la foulée : sans
            // ça, le combat suivant démarrerait avec des centaines de numéros
            // derrière lui, et un poste qui rejoint rejouerait une bataille qui
            // n'existe plus.
            if (typeof window.viderJournalCombat === "function") {
                await window.viderJournalCombat(window.ID_PARTIE_COURANTE);
            }
            if (window.PARTIE_DATA) {
                delete window.PARTIE_DATA.Spawn_Allies;
                delete window.PARTIE_DATA.Spawn_Ennemis;
                delete window.PARTIE_DATA.Butin;
                delete window.PARTIE_DATA.Difficulte_Rencontre;
                delete window.PARTIE_DATA.ID_Rencontre;
            }
        }

        // A bis. Les Illusions ne survivent pas au combat : c'est le seul vrai "fin de combat"
        // disponible dans le jeu (pas de bouton dédié pour ça), donc leur nettoyage est accroché ici.
        // Les zones persistantes ne survivent pas à une réinitialisation de combat. Là encore,
        // updateDoc et pas setDoc/merge : sinon la map vide ne supprimerait rien du tout.
        if (window.ID_PARTIE_COURANTE) {
            window.ZONES_PERSISTANTES = {};
            if (typeof window.sauvegarderZonesPersistantes === "function") {
                await window.sauvegarderZonesPersistantes({}).catch(e => console.error(e));
            }
            if (typeof window.appliquerZonesPersistantes === "function") window.appliquerZonesPersistantes();
        }

        // A ter. Les monstres non plus ne survivent pas au combat : documents, pions,
        // initiative et réserve de renforts sont effacés d'un bloc (cf. monstres.js).
        if (typeof window.nettoyerMonstresCombat === "function") {
            await window.nettoyerMonstresCombat().catch(e => console.error(e));
        }

        // A quater. Les fantômes : pions et entrées d'initiative dont le combattant
        // n'existe plus (une fiche supprimée depuis un autre écran, un monstre
        // effacé à la main). Ils encombrent le plateau et l'ordre de passage.
        if (window.ID_PARTIE_COURANTE) {
            try {
                const existe = (id) => (window.PERSOS_PARTIE || []).some(p => p.idPersonnage === id);
                const partieRefF = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
                const snapF = await getDoc(partieRefF);
                if (snapF.exists()) {
                    const ordreF = snapF.data().Ordre_Initiative || [];
                    const ordrePropre = ordreF.filter(existe);
                    if (ordrePropre.length !== ordreF.length) {
                        await updateDoc(partieRefF, { Ordre_Initiative: ordrePropre });
                        console.log(`🧹 ${ordreF.length - ordrePropre.length} combattant(s) disparu(s) retiré(s) de l'ordre d'initiative.`);
                    }
                }

                const fantomes = Object.keys(window.TOKENS_VTT_DATA || {}).filter(id => !existe(id));
                if (fantomes.length > 0) {
                    const vttRefF = doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
                    const majF = {};
                    fantomes.forEach(id => { delete window.TOKENS_VTT_DATA[id]; majF["Tokens." + id] = deleteField(); });
                    await updateDoc(vttRefF, majF).catch(e => console.error(e));
                    console.log(`🧹 ${fantomes.length} pion(s) fantôme(s) retiré(s) du plateau.`);
                }
            } catch (e) {
                console.error("Nettoyage des fantômes :", e);
            }
        }

        // A quinquies. Le plateau est vidé de TOUS ses pions, héros compris : la
        // rencontre suivante repose ses repères d'apparition, et le bouton
        // "Déployer les pions" redistribue tout le monde autour. Un pion de héros
        // laissé là où il était rendait ces repères inopérants pour son camp.
        // updateDoc sur le seul champ Tokens : les murs, le terrain difficile et
        // les tuiles effacées de la carte ne doivent pas partir avec.
        if (window.ID_PARTIE_COURANTE) {
            window.TOKENS_VTT_DATA = {};
            try {
                await updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tokens: {} });
            } catch (e) {
                console.error("Vidage des pions du plateau :", e);
            }
            if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT({});
            window.TOKEN_SELECTIONNE = null;
        }

        const illusions = (window.PERSOS_PARTIE || []).filter(p => p.estIllusion);
        if (illusions.length > 0 && window.ID_PARTIE_COURANTE) {
            const vttRef = doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
            for (const illusion of illusions) {
                delete window.TOKENS_VTT_DATA[illusion.idPersonnage];
                await deleteDoc(doc(db, "Personnages", illusion.idPersonnage)).catch(e => console.error(e));
                await updateDoc(vttRef, { ["Tokens." + illusion.idPersonnage]: deleteField() }).catch(e => console.error(e));
            }
            if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }

        // B. Reset des Personnages (Soin total de la Vie et de l'Énergie)
        if (window.PERSOS_PARTIE && window.PERSOS_PARTIE.length > 0) {
            for (let perso of window.PERSOS_PARTIE) {
                // Les illusions viennent d'être supprimées juste au-dessus, mais PERSOS_PARTIE
                // les contient encore (le snapshot Firestore n'est pas revenu). Les soigner
                // reviendrait à écrire dans un document effacé : updateDoc lève alors une
                // erreur qui interrompait TOUTE la boucle, laissant les personnages suivants
                // sans soin. On les saute donc explicitement.
                if (perso.estIllusion) continue;

                const pvMax = (parseInt(perso.PV_Max) || 1) + (parseInt(perso.Dev_Mod_PV) || 0);
                const fatigueMax = window.fatigueMaxCombattant(perso);

                // Mise à jour locale immédiate (évite d'attendre le snapshot)
                perso.PV_Actuels = pvMax;
                perso.fatigueActuelle = fatigueMax;
                perso.Bouclier_Max = 0;
                perso.Bouclier_Actuel = 0;
                // Brûlures, poisons, peurs : rien de tout cela ne survit à une
                // réinitialisation. Sans ce nettoyage, un personnage repartait au
                // tour 1 avec la pleine santé mais toujours empoisonné.
                perso.Etats_Alteres = [];

                // La copie du panneau gauche est un autre objet : sans elle, les
                // icônes d'état restaient affichées jusqu'au prochain redessin.
                const copiePanneau = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === perso.idPersonnage);
                if (copiePanneau) {
                    copiePanneau.Etats_Alteres = [];
                    copiePanneau.PV_Actuels = pvMax;
                    copiePanneau.fatigueActuelle = fatigueMax;
                    copiePanneau.Bouclier_Max = 0;
                    copiePanneau.Bouclier_Actuel = 0;
                }

                const persoActuel = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                if (persoActuel && persoActuel.idPersonnage === perso.idPersonnage) {
                    window.COMBAT_PV_MAX = pvMax;
                    window.COMBAT_PV_ACTUELS = pvMax;
                    window.COMBAT_FATIGUE_MAX = fatigueMax;
                    window.COMBAT_FATIGUE_ACTUELLE = fatigueMax;
                }

                // Un échec sur un combattant (document supprimé entre-temps, coupure réseau)
                // ne doit jamais empêcher les suivants d'être soignés.
                const persoRef = window.refCombattant(perso.idPersonnage);
                await updateDoc(persoRef, {
                    PV_Actuels: pvMax,
                    Fatigue_Actuelle: fatigueMax,
                    Bouclier_Max: 0,
                    Bouclier_Actuel: 0,
                    Etats_Alteres: []
                }).catch(e => console.error(`Reset de ${perso.idPersonnage} :`, e));
            }
        }

        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
        if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
        if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        
        // Forcer la remise à zéro de la mémoire locale pour rejouer l'animation "Tour 1"
        window.DERNIER_TOUR_AFFICHE = 0;
        if (typeof window.verifierChangementTour === "function") {
            window.verifierChangementTour(1);
        }
        window.APPARITION_REPORTEE = false;
        // Réinitialiser, c'est repartir pour un combat : une fois les deux
        // repères posés, on enchaîne tout seul sur le déploiement des héros
        // puis sur la rencontre. Le MJ n'a plus qu'à choisir la difficulté.
        window.DEPLOIEMENT_APRES_REPERES = true;
        if (typeof window.verifierPointsApparition === "function") window.verifierPointsApparition();

        // Le ménage est fini : les butins redeviennent possibles.
        if (window.ID_PARTIE_COURANTE) {
            await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
                Reinitialisation_En_Cours: deleteField()
            }).catch(e => console.error("Levée du verrou de réinitialisation :", e));
            if (window.PARTIE_DATA) delete window.PARTIE_DATA.Reinitialisation_En_Cours;
        }

        console.log("Le combat a été entièrement réinitialisé !");
        
    } catch (e) {
        console.error("Erreur lors de la réinitialisation du combat :", e);
    } finally {
        // On rend son jugement à la synchronisation, mais pas tout de suite :
        // les fiches neuves mettent encore un aller-retour à revenir de la base,
        // et juger avant leur retour ferait exactement le dégât qu'on évite.
        setTimeout(() => { window.REINITIALISATION_COMBAT_EN_COURS = false; }, 4000);
    }
};

// =========================================================================
//  GESTION DES ENNEMIS (SPAWN & RESET)
// =========================================================================

// Outil mutualisé : Cherche la case vide la plus proche du centre
window.trouverHexLibreVTT = function(tokensData) {
    function estHexLibre(q, r) {
        if (!window.PLATEAU_VTT) return false;
        const state = window.PLATEAU_VTT.getCaseState(q, r);
        if (state.isDeleted || state.isBlocked) return false;
        for (let id in tokensData) {
            if (tokensData[id].q === q && tokensData[id].r === r) return false;
        }
        return true;
    }

    let radius = 0;
    while (radius < 20) {
        if (radius === 0) {
            if (estHexLibre(0, 0)) return { q: 0, r: 0 };
        } else {
            let q = -radius, r = radius;
            const directions = [ {dq: 1, dr: 0}, {dq: 0, dr: -1}, {dq: -1, dr: -1}, {dq: -1, dr: 0}, {dq: 0, dr: 1}, {dq: 1, dr: 1} ];
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < radius; j++) {
                    if (estHexLibre(q, r)) return { q, r };
                    q += directions[i].dq; r += directions[i].dr;
                }
            }
        }
        radius++;
    }
    return { q: 0, r: 0 }; 
};

// =========================================================================
//  POINTS D'APPARITION (ALLIÉS / ENNEMIS)
// =========================================================================
//  Deux repères invisibles posés sur le plateau au début du combat : les pions
//  des héros apparaissent autour du premier, ceux des créatures autour du
//  second, au hasard des cases libres. Sans eux, tout le monde s'entassait au
//  centre exact de la carte, joueurs et monstres mélangés.

window.PLACEMENT_APPARITION = null; // { etape: "Allié" | "Ennemi", nettoyer: fn }

// Distance en cases entre deux hexagones (coordonnées axiales).
function distanceHexVTT(a, b) {
    if (typeof window.hexDistanceVTT === "function") return window.hexDistanceVTT(a, b);
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r),
                    Math.abs((-a.q - a.r) - (-b.q - b.r)));
}

// Une case libre tirée au sort autour d'un point, en élargissant le cercle tant
// qu'il n'y a pas de place. Sans point de repère, on retombe sur l'ancien
// comportement : la case libre la plus proche du centre.
window.trouverHexLibreAutour = function(tokensData, centre, rayon) {
    if (!centre || centre.q === undefined || centre.r === undefined) {
        return window.trouverHexLibreVTT(tokensData);
    }

    const estLibre = (q, r) => {
        if (!window.PLATEAU_VTT) return false;
        const state = window.PLATEAU_VTT.getCaseState(q, r);
        if (state.isDeleted || state.isBlocked) return false;
        for (let id in tokensData) {
            if (tokensData[id].q === q && tokensData[id].r === r) return false;
        }
        return true;
    };

    const rayonDepart = rayon || 2;
    for (let portee = rayonDepart; portee <= 20; portee++) {
        const candidates = [];
        for (let dq = -portee; dq <= portee; dq++) {
            for (let dr = -portee; dr <= portee; dr++) {
                const q = centre.q + dq, r = centre.r + dr;
                if (distanceHexVTT(centre, { q, r }) > portee) continue;
                if (estLibre(q, r)) candidates.push({ q, r });
            }
        }
        if (candidates.length > 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }
    }
    return window.trouverHexLibreVTT(tokensData);
};

// Le point d'apparition d'un camp, tel qu'il est enregistré pour cette partie.
window.pointApparition = function(camp) {
    const partie = window.PARTIE_DATA || {};
    const point = camp === "Ennemi" ? partie.Spawn_Ennemis : partie.Spawn_Allies;
    if (!point || point.q === undefined || point.r === undefined) return null;
    return { q: point.q, r: point.r };
};

// Un clic franc : ni un glissement de carte, ni un appui prolongé, ni un
// pincement à deux doigts. Sur iPad, poser le doigt pour faire glisser le
// plateau ne doit surtout pas planter un point d'apparition au passage.
function armerClicFrancPlateau(surCase) {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur) return () => {};

    let departX = 0, departY = 0, departT = 0, franc = false, dernierToucher = 0;

    const debut = (x, y, nbDoigts) => {
        franc = nbDoigts <= 1;
        departX = x; departY = y; departT = Date.now();
    };
    const bouge = (x, y) => {
        if (Math.abs(x - departX) > 10 || Math.abs(y - departY) > 10) franc = false;
    };
    const fin = (x, y) => {
        if (!franc) return;
        franc = false;
        if (Date.now() - departT > 800) return;
        if (Math.abs(x - departX) > 10 || Math.abs(y - departY) > 10) return;

        surCase(x, y);
        return true;
    };

    // Un appui du doigt sur iPad déclenche le tactile, PUIS des événements de
    // souris que Safari synthétise juste derrière : le même geste posait alors les
    // deux repères d'un coup, au même endroit. On ignore donc toute souris qui
    // suit de près un contact tactile. Deux vrais appuis restent tous deux
    // tactiles, et ne se gênent pas — un simple délai de garde entre deux dépôts,
    // lui, aurait avalé le second appui du MJ s'il était un peu rapide.
    const fantomeDeDoigt = () => Date.now() - dernierToucher < 700;

    const surSouris = e => { if (fantomeDeDoigt()) return; debut(e.clientX, e.clientY, 1); };
    const surSourisBouge = e => { if (fantomeDeDoigt()) return; bouge(e.clientX, e.clientY); };
    const surSourisFin = e => { if (fantomeDeDoigt()) return; fin(e.clientX, e.clientY); };
    const surDoigt = e => { dernierToucher = Date.now(); if (e.touches.length > 0) debut(e.touches[0].clientX, e.touches[0].clientY, e.touches.length); };
    const surDoigtBouge = e => { dernierToucher = Date.now(); if (e.touches.length > 0) bouge(e.touches[0].clientX, e.touches[0].clientY); };
    const surDoigtFin = e => {
        dernierToucher = Date.now();
        if (e.changedTouches.length === 0) return;
        // Couper la source des événements de souris fantômes plutôt que de les
        // subir : le délai de garde ci-dessus reste là en second rideau.
        if (fin(e.changedTouches[0].clientX, e.changedTouches[0].clientY)) e.preventDefault();
    };

    // Le clic qui suit ne doit atteindre aucun autre gestionnaire : sans ce
    // barrage, le même geste sélectionnerait un pion ou tracerait un chemin.
    // Le bandeau de la demande fait exception, sinon son lien « Plus tard »
    // serait lui aussi bloqué et la demande deviendrait impossible à écarter.
    const barrage = e => {
        if (e.target && e.target.closest && e.target.closest("#placement-apparition")) return;
        e.stopPropagation();
    };

    conteneur.addEventListener("mousedown", surSouris, true);
    conteneur.addEventListener("mousemove", surSourisBouge, true);
    conteneur.addEventListener("mouseup", surSourisFin, true);
    conteneur.addEventListener("touchstart", surDoigt, true);
    conteneur.addEventListener("touchmove", surDoigtBouge, true);
    conteneur.addEventListener("touchend", surDoigtFin, { capture: true, passive: false });
    document.addEventListener("click", barrage, true);

    return () => {
        conteneur.removeEventListener("mousedown", surSouris, true);
        conteneur.removeEventListener("mousemove", surSourisBouge, true);
        conteneur.removeEventListener("mouseup", surSourisFin, true);
        conteneur.removeEventListener("touchstart", surDoigt, true);
        conteneur.removeEventListener("touchmove", surDoigtBouge, true);
        conteneur.removeEventListener("touchend", surDoigtFin, { capture: true });
        document.removeEventListener("click", barrage, true);
    };
}

// La case du plateau sous un point de l'écran, si elle est praticable.
window.caseSousLEcran = function(clientX, clientY) {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur || !window.PLATEAU_VTT) return null;
    const canvasX = (clientX - window.VTT_POS_X) / window.VTT_SCALE;
    const canvasY = (clientY - window.VTT_POS_Y) / window.VTT_SCALE;
    const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
    if (!hex) return null;
    const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
    if (state.isDeleted || state.isBlocked) return null;
    return hex;
};

// La barre d'outils de combat descend du haut de l'écran par-dessus tout le
// reste : le bandeau se décale sous elle tant qu'elle est déployée, au lieu de
// disparaître derrière.
window.positionnerBandeauApparition = function() {
    const boite = document.getElementById("placement-apparition-boite");
    if (!boite) return;
    const menuDev = document.getElementById("menu-dev-combat");
    const deploye = menuDev && menuDev.classList.contains("ouvert");
    boite.style.marginTop = deploye
        ? (menuDev.getBoundingClientRect().height + 14) + "px"
        : "4vh";
};

window.arreterPlacementApparition = function() {
    if (window.PLACEMENT_APPARITION && window.PLACEMENT_APPARITION.nettoyer) {
        window.PLACEMENT_APPARITION.nettoyer();
    }
    window.PLACEMENT_APPARITION = null;
    const calque = document.getElementById("placement-apparition");
    if (calque) calque.style.display = "none";
};

// Le MJ (ou le premier poste à ouvrir le combat) pose les deux repères. Si un
// autre poste les a posés entre-temps, la demande se referme d'elle-même.
window.demarrerPlacementApparition = function() {
    if (window.PLACEMENT_APPARITION) return;
    const calque = document.getElementById("placement-apparition");
    const titre = document.getElementById("placement-apparition-titre");
    if (!calque || !titre) return;

    const points = {};

    const annoncer = (camp) => {
        titre.innerText = camp === "Ennemi"
            ? "Où apparaissent les ennemis ?"
            : "Où apparaissent les héros ?";
        titre.style.color = camp === "Ennemi" ? "#ff8b8b" : "#e8d5a5";
    };

    const poser = (clientX, clientY) => {
        const hex = window.caseSousLEcran(clientX, clientY);
        if (!hex) {
            if (typeof window.afficherMessageFlottantHex === "function") {
                const raté = window.PLATEAU_VTT ? window.PLATEAU_VTT.pixelToHex(
                    (clientX - window.VTT_POS_X) / window.VTT_SCALE,
                    (clientY - window.VTT_POS_Y) / window.VTT_SCALE) : null;
                if (raté) window.afficherMessageFlottantHex(raté.q, raté.r, "Case impraticable", "#ff4c4c");
            }
            return;
        }
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();

        const etape = window.PLACEMENT_APPARITION.etape;
        if (etape === "Allié") {
            points.allies = hex;
            window.PLACEMENT_APPARITION.etape = "Ennemi";
            annoncer("Ennemi");
            return;
        }

        points.ennemis = hex;
        window.arreterPlacementApparition();
        window.enregistrerPointsApparition(points.allies, points.ennemis);
    };

    window.PLACEMENT_APPARITION = { etape: "Allié", nettoyer: armerClicFrancPlateau(poser) };
    annoncer("Allié");
    window.positionnerBandeauApparition();
    calque.style.display = "flex";
};

window.enregistrerPointsApparition = async function(allies, ennemis) {
    if (!window.ID_PARTIE_COURANTE) return;
    // Écriture immédiate en mémoire : la génération des pions qui suit ne doit
    // pas attendre l'aller-retour réseau pour connaître les deux repères.
    if (window.PARTIE_DATA) {
        window.PARTIE_DATA.Spawn_Allies = allies;
        window.PARTIE_DATA.Spawn_Ennemis = ennemis;
    }
    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Spawn_Allies: allies,
            Spawn_Ennemis: ennemis
        });
        console.log("Points d'apparition enregistrés :", allies, ennemis);
    } catch (e) {
        console.error("Erreur d'enregistrement des points d'apparition :", e);
    }

    // Poser les repères après une réinitialisation enchaîne sur la suite
    // logique : les héros se déploient, puis la rencontre demande sa
    // difficulté. Le drapeau est consommé tout de suite, pour qu'un
    // replacement ultérieur des repères ne relance pas tout.
    if (window.DEPLOIEMENT_APRES_REPERES) {
        window.DEPLOIEMENT_APRES_REPERES = false;
        await window.deployerCombatApresReperes();
    }
};

// Le déploiement d'un combat neuf : les pions des héros autour de leur repère,
// puis la fenêtre de rencontre pour choisir la difficulté des ennemis.
window.deployerCombatApresReperes = async function() {
    try {
        if (typeof window.genererTokensCombat === "function") await window.genererTokensCombat();
    } catch (e) {
        console.error("Déploiement des héros :", e);
    }
    // La fenêtre de rencontre s'ouvre après les héros : le MJ voit déjà son
    // groupe posé quand il choisit à quoi il va les confronter.
    if (typeof window.ouvrirGenerationRencontre === "function") window.ouvrirGenerationRencontre();
};

// Reporté à la main : on ne redemandera plus tant que la fenêtre reste ouverte.
window.APPARITION_REPORTEE = false;
window.reporterPointsApparition = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    window.APPARITION_REPORTEE = true;
    window.arreterPlacementApparition();
};

// Appelée à l'ouverture du combat, puis à chaque mise à jour de la partie : elle
// lance la demande quand les repères manquent, et la referme dès qu'ils
// arrivent — y compris quand c'est un autre poste qui les a posés.
window.verifierPointsApparition = function() {
    const enCombat = document.getElementById("fenetre-combat")?.style.display === "block";
    if (!enCombat) {
        window.arreterPlacementApparition();
        return;
    }

    const complets = !!window.pointApparition("Allié") && !!window.pointApparition("Ennemi");
    if (complets) {
        window.arreterPlacementApparition();
        return;
    }

    if (window.APPARITION_REPORTEE) return;

    // La partie n'est pas encore chargée : on repasse dans un instant plutôt que
    // de renoncer — l'ouverture du combat précède souvent la première lecture.
    if (!window.PARTIE_DATA || !window.PLATEAU_VTT) {
        clearTimeout(window.RAPPEL_APPARITION);
        window.RAPPEL_APPARITION = setTimeout(window.verifierPointsApparition, 400);
        return;
    }

    window.demarrerPlacementApparition();
};

// Le bouton 💀 des options de combat ouvre désormais la fenêtre de génération de
// rencontre (window.ouvrirGenerationRencontre, cf. monstres.js) : composition tirée
// au sort d'après le tableau des rencontres, noms trouvés par l'IA, stats héritées
// des gabarits. L'ancien ennemi de test générique (Sbire 50 PV) n'existe plus.

// 2. Bouton "Reset" : Soigne tous les ennemis à 100%
window.resetEnnemisTest = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PERSOS_PARTIE) return;

    // Ne cible que les ennemis vivants
    const ennemis = window.PERSOS_PARTIE.filter(p => p.camp === "Ennemi" && p.statut !== "Mort");
    if (ennemis.length === 0) return;

    try {
        const { doc, writeBatch } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const batch = writeBatch(db);

        ennemis.forEach(ennemi => {
            const ref = window.refCombattant(ennemi.idPersonnage);
            batch.update(ref, {
                PV_Actuels: (parseInt(ennemi.PV_Max) || 50) + (parseInt(ennemi.Dev_Mod_PV) || 0),
                Fatigue_Actuelle: window.fatigueMaxCombattant(ennemi)
            });
        });

        await batch.commit();
        console.log("🔄 Les ennemis ont récupéré toute leur santé et énergie !");
        
    } catch(e) {
        console.error("Erreur reset ennemis :", e);
    }
};

// Bouton coupe des paramètres de combat : termine le combat en un clic pour
// tester le butin, sans avoir à vraiment vaincre les ennemis un par un.
window.declencherVictoireTest = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PERSOS_PARTIE) return;

    // Une illusion n'est pas un vrai ennemi : elle ne doit pas compter.
    const ennemis = window.PERSOS_PARTIE.filter(p => p.camp === "Ennemi" && !p.estIllusion && p.statut !== "Mort");
    if (ennemis.length === 0) return;

    try {
        const { writeBatch } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const batch = writeBatch(db);

        // Volontairement SANS passer par window.marquerMonstreMort : elle ferait
        // entrer un renfort depuis la réserve à la place de chaque tombé, ce qui
        // empêcherait justement la victoire qu'on veut simuler ici.
        ennemis.forEach(ennemi => {
            const ref = window.refCombattant(ennemi.idPersonnage);
            batch.update(ref, { Statut: "Mort", PV_Actuels: 0 });
        });

        await batch.commit();
        console.log("🏆 Victoire de test : tous les ennemis sont terrassés.");
    } catch (e) {
        console.error("Erreur victoire de test :", e);
    }
};
