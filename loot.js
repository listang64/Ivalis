// =========================================================================
//  IVALIS - INVENTAIRE, ÉQUIPEMENT ET BUTIN DE FIN DE COMBAT
// =========================================================================
//  Trois choses vivent ici :
//   1. La conversion emplacement <-> icône/libellé, partagée par la fiche
//      perso et les deux fenêtres de butin.
//   2. La détection de victoire (tous les ennemis à terre) et le tirage du
//      butin qui en découle.
//   3. Le déroulé du butin lui-même : fenêtre personnelle (deux objets par
//      héros, à prendre ou laisser) puis fenêtre commune (les objets laissés,
//      sur lesquels les joueurs se placent — tirage au sort en cas d'objets
//      convoités par plusieurs).
//
//  Toute écriture partagée sur le champ "Butin" du document de partie passe
//  par window.modifierPartie (combat.js) : plusieurs joueurs y touchent au
//  même instant, exactement comme la file d'attente du combat.
// =========================================================================

import { db } from "./firebase-config.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  VOCABULAIRE COMMUN DES EMPLACEMENTS
// =========================================================================

window.emplacementVersChampDoc = {
    "Armure": "Equip_Armure",
    "Main_Droite": "Equip_Main_Droite",
    "Main_Gauche": "Equip_Main_Gauche"
};
window.emplacementVersChampFront = {
    "Armure": "equipArmure",
    "Main_Droite": "equipMainDroite",
    "Main_Gauche": "equipMainGauche"
};
window.champDocVersFront = {
    "Equip_Armure": "equipArmure",
    "Equip_Main_Droite": "equipMainDroite",
    "Equip_Main_Gauche": "equipMainGauche"
};

window.iconeParEmplacement = function(objet) {
    const emplacement = typeof objet === "string" ? objet : (objet && objet.emplacement);
    const type = (objet && objet.type) || "";
    if (emplacement === "Armure") return "🛡️";
    if (type === "Bouclier") return "🛡️";
    if (type === "Magie") return "💍";
    if (type.includes("Distance")) return "🏹";
    if (emplacement === "Main_Gauche") return "🗡️";
    return "⚔️";
};
window.libelleEmplacement = function(objet) {
    const emplacement = typeof objet === "string" ? objet : (objet && objet.emplacement);
    if (emplacement === "Armure") return "Armure";
    if (typeof objet === "object" && objet && objet.deuxMains) return "Deux mains";
    if (emplacement === "Main_Gauche") return "Main gauche";
    if (emplacement === "Main_Droite") return "Main droite";
    return "Une main";
};

// =========================================================================
//  OÙ VA UN OBJET
// =========================================================================
//  L'armure a son emplacement ; tout le reste (armes, boucliers, bagues) va
//  dans une main. Une arme à deux mains occupe les DEUX : elle est écrite dans
//  les deux champs avec le même uid, et window.objetsEquipes (objets.js) la
//  dédoublonne pour que ses bonus ne comptent pas double.
//
//  Les objets d'avant ce tableau portaient directement "Main_Droite" ou
//  "Main_Gauche" comme emplacement : ils restent lisibles ici.
window.champsPourObjet = function(objet, main) {
    if (!objet) return [];
    if (objet.emplacement === "Armure") return ["Equip_Armure"];
    if (objet.deuxMains) return ["Equip_Main_Droite", "Equip_Main_Gauche"];
    if (objet.emplacement === "Main_Gauche") return ["Equip_Main_Gauche"];
    if (objet.emplacement === "Main_Droite") return ["Equip_Main_Droite"];
    return [main === "Gauche" ? "Equip_Main_Gauche" : "Equip_Main_Droite"];
};

// Ce qui serait détruit en équipant cet objet à cet endroit. Sans sac dans
// Ivalis, l'écrasement est définitif : le joueur doit le voir avant de valider.
window.objetsEcrasesPar = function(perso, objet, main) {
    if (!perso) return [];
    return window.champsPourObjet(objet, main)
        .map(champ => perso[window.champDocVersFront[champ]])
        .filter(o => o && o.nom);
};

// Écrit un objet dans le ou les emplacements qui lui reviennent. L'ancien
// occupant n'est conservé nulle part : c'est voulu, il n'existe pas de sac.
window.equiperObjet = async function(idPersonnage, objet, main) {
    const champs = window.champsPourObjet(objet, main);
    if (champs.length === 0) return;

    const valeur = JSON.parse(JSON.stringify(objet));
    const maj = {};
    // Une arme à deux mains chasse aussi ce qui occupait l'autre main : les
    // deux champs sont réécrits, donc rien ne peut survivre à côté d'elle.
    champs.forEach(champ => maj[champ] = valeur);

    try {
        await updateDoc(doc(db, "Personnages", idPersonnage), maj);
        window.appliquerEquipementEnRam(idPersonnage, maj);
    } catch (e) {
        console.error("Équipement :", e);
    }
};

// Lâche ce qu'on porte à un emplacement. Une arme à deux mains libère les deux
// mains d'un coup, où qu'on ait cliqué.
window.lacherObjet = async function(idPersonnage, champ) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    const porte = perso ? perso[window.champDocVersFront[champ]] : null;

    const champs = (porte && porte.deuxMains)
        ? ["Equip_Main_Droite", "Equip_Main_Gauche"]
        : [champ];

    const maj = {};
    champs.forEach(c => maj[c] = null);
    try {
        await updateDoc(doc(db, "Personnages", idPersonnage), maj);
        window.appliquerEquipementEnRam(idPersonnage, maj);
    } catch (e) {
        console.error("Lâcher l'objet :", e);
    }
};

// Miroir en mémoire de ce qui vient d'être écrit : la fiche ouverte et les
// stats de combat suivent sans attendre l'aller-retour de la base.
window.appliquerEquipementEnRam = function(idPersonnage, maj) {
    const enRam = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    Object.keys(maj).forEach(champ => {
        const champFront = window.champDocVersFront[champ];
        if (enRam) enRam[champFront] = maj[champ];
    });

    // Si la fiche de ce héros est ouverte à l'écran, les encarts se redessinent
    // tout de suite plutôt que d'attendre une réouverture.
    if (document.getElementById("champ-id-personnage")?.value === idPersonnage
        && typeof window.afficherEmplacementEquipement === "function") {
        Object.keys(maj).forEach(champ => {
            const suffixe = champ === "Equip_Armure" ? "armure"
                          : champ === "Equip_Main_Gauche" ? "main-gauche" : "main-droite";
            window.afficherEmplacementEquipement(suffixe, maj[champ]);
        });
    }
};

// Ancien nom, conservé le temps que le butin bascule entièrement : équipe dans
// la main libre s'il y en a une, sinon la droite.
window.equiperObjetButin = async function(idPersonnage, item, main) {
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    let mainChoisie = main;
    if (!mainChoisie && perso && !item.deuxMains && item.emplacement !== "Armure") {
        mainChoisie = !perso.equipMainDroite ? "Droite" : (!perso.equipMainGauche ? "Gauche" : "Droite");
    }
    await window.equiperObjet(idPersonnage, item, mainChoisie);
};

// Deux objets par héros, tirés dans le tableau d'équipement (objets.js) selon
// la difficulté de la rencontre. Chaque tirage est indépendant : deux héros
// peuvent très bien convoiter la même arme, c'est au partage de trancher.
window.tirerObjetsAleatoires = function(difficulte, n) {
    const tires = [];
    if (typeof window.tirerObjetPourDifficulte !== "function") {
        console.warn("Butin : objets.js n'est pas chargé, aucun objet à tirer.");
        return tires;
    }
    for (let i = 0; i < n; i++) tires.push(window.tirerObjetPourDifficulte(difficulte));
    return tires;
};

// =========================================================================
//  DÉTECTION DE VICTOIRE
// =========================================================================
//  Rejouée à chaque changement de la liste des combattants (recomposerCombattants,
//  dans monstres.js) : c'est le seul endroit qui voit à la fois les monstres
//  mourir au combat et la coupe de test les achever d'un coup. Bon marché et
//  protégée par transaction (modifierPartie), donc sans risque à rejouer
//  souvent ni depuis plusieurs postes à la fois.
// Reste-t-il un ennemi debout ? La question sert deux fois : à savoir si le
// combat est gagné, et à savoir si le butin a encore le droit d'occuper
// l'écran. Une seule définition, donc aucun risque que les deux divergent.
window.ennemisEncoreDebout = function() {
    const estMort = (m) => m.estIllusion || m.statut === "Mort"
        || (typeof window.estCombattantMort === "function" && window.estCombattantMort(m.idPersonnage));
    return (window.MONSTRES_PARTIE || []).some(m => !estMort(m));
};

// Le combat est-il GAGNÉ, là, maintenant ? Il faut des ennemis, et qu'ils
// soient tous à terre. Un plateau VIDE n'est pas une victoire : c'est l'état
// d'un combat qu'on vient de réinitialiser, ou pas encore commencé. Sans cette
// nuance, un butin oublié en base rouvrait sa fenêtre juste après une
// réinitialisation, par-dessus la demande de points d'apparition.
window.combatGagne = function() {
    const monstres = window.MONSTRES_PARTIE || [];
    if (monstres.length === 0) return false;
    return !window.ennemisEncoreDebout();
};

window.verifierVictoireCombat = function() {
    if (document.getElementById("fenetre-combat")?.style.display !== "block") return;
    if (window.PARTIE_DATA && window.PARTIE_DATA.Butin && window.PARTIE_DATA.Butin.ouvert) return;

    if (!window.combatGagne()) return;

    const heroVivant = (window.PERSOS_PARTIE || []).some(p => p.camp === "Allié" && !p.estIllusion && p.actif !== false
        && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)));
    if (!heroVivant) return;

    if (typeof window.demarrerButin === "function") window.demarrerButin();
};

// Pose le butin en base : un jet de deux objets par héros survivant, sous
// transaction pour qu'un seul poste (parmi ceux qui détectent la victoire au
// même instant) l'écrive réellement.
window.demarrerButin = async function() {
    if (!window.ID_PARTIE_COURANTE) return;

    const participants = (window.PERSOS_PARTIE || [])
        .filter(p => p.camp === "Allié" && !p.estIllusion && p.actif !== false
                  && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)))
        .map(p => p.idPersonnage);
    if (participants.length === 0) return;

    // La difficulté est celle de la dernière rencontre générée, enregistrée
    // dans la partie (monstres.js). Des monstres posés à la main n'en laissent
    // aucune : on retombe alors sur la ligne NORMAL du tableau de loot.
    const difficulte = (window.PARTIE_DATA && window.PARTIE_DATA.Difficulte_Rencontre) || "Normale";
    const idRencontre = (window.PARTIE_DATA && window.PARTIE_DATA.ID_Rencontre) || "";

    await window.modifierPartie((data) => {
        // Un butin déjà ouvert bloque celui-ci — mais SEULEMENT s'il appartient
        // encore à ce combat. Sans cette nuance, un butin qu'on avait quitté
        // sans le refermer (fenêtre fermée, page rechargée, joueur parti)
        // restait "ouvert" pour toujours en base et empêchait tous les butins
        // suivants : plus aucune victoire ne rapportait quoi que ce soit.
        const ancien = data.Butin;
        if (ancien && ancien.ouvert && !window.butinPerime(ancien, idRencontre)) return null;

        const parPersonnage = {};
        participants.forEach(id => {
            parPersonnage[id] = { items: window.tirerObjetsAleatoires(difficulte, 2), decisions: {}, valide: false };
        });

        return { maj: { Butin: {
            ouvert: true,
            etape: "personnel",
            // Deux marqueurs : celui du combat d'où vient ce butin, et le sien
            // propre — ce dernier sert à la fermeture locale (une croix ne doit
            // masquer QUE le butin qu'on a sous les yeux, pas le suivant).
            id: "butin_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
            creeLe: Date.now(),
            idRencontre,
            difficulte,
            participants,
            parPersonnage,
            pool: [],
            poolValides: [],
            resolu: false
        } } };
    });
};

// Un butin est périmé quand il ne concerne plus le combat en cours : soit il
// vient d'une rencontre précédente, soit il a déjà été résolu (sa raison
// d'être est passée). Dans les deux cas, une nouvelle victoire peut l'écraser.
//
// L'ancienneté sert de dernier recours, pour les combats dont les monstres ont
// été posés à la main (aucune rencontre générée, donc aucun identifiant des
// deux côtés). Le délai peut être court sans risque : demarrerButin n'est
// atteint que lorsqu'un poste croit qu'AUCUN butin n'est ouvert, ce qui, à
// plusieurs, se joue en quelques millisecondes après la mort du dernier
// monstre — jamais une minute plus tard. Un butin d'une minute appartient donc
// forcément à un combat passé, quel que soit le temps que les joueurs mettent
// à choisir.
window.DELAI_BUTIN_PERIME_MS = 60000;

window.butinPerime = function(butin, idRencontreCourante) {
    if (!butin) return true;
    if (butin.resolu) return true;
    // Les deux rencontres sont identifiées et diffèrent : le butin est vieux.
    if (idRencontreCourante && butin.idRencontre && butin.idRencontre !== idRencontreCourante) return true;
    // Un butin d'avant cette mécanique n'a pas d'identifiant : on le laisse
    // passer une fois, plutôt que de bloquer indéfiniment les butins suivants.
    if (idRencontreCourante && !butin.idRencontre) return true;
    // Ni l'un ni l'autre n'est identifié : on tranche à l'ancienneté.
    if (butin.creeLe && (Date.now() - butin.creeLe) > window.DELAI_BUTIN_PERIME_MS) return true;
    // Un butin d'avant cette correction n'a même pas de date : il ne doit pas
    // condamner la partie pour autant.
    if (!butin.creeLe && !butin.idRencontre) return true;
    return false;
};

// =========================================================================
//  AFFICHAGE — répartiteur appelé à chaque notification de la partie
// =========================================================================

// Fermeture MANUELLE, pour ce poste seulement. C'est une porte de sortie, pas
// un bouton d'abandon : elle ne touche pas au butin des autres joueurs (une
// croix cliquée par mégarde ne doit priver personne de son loot). Le butin
// reste en base, et rouvrir le combat le fait réapparaître.
// La fermeture vaut pour l'ÉTAPE en cours, pas pour tout le butin : fermer sa
// fenêtre personnelle ne doit pas priver le joueur du partage commun qui suit.
// Chaque étape peut être refermée à son tour, donc on n'est jamais coincé.
window.signatureEtapeButin = function(butin) {
    if (!butin) return "";
    return (butin.id || "butin-sans-identifiant") + ":" + (butin.etape || "");
};

window.fermerButinLocalement = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    // On masque ce que la fenêtre montre RÉELLEMENT (retenu au dernier
    // affichage), pas ce qu'on relit de la partie : si PARTIE_DATA a dérivé
    // entre-temps, la croix fermerait une étape que le joueur n'a pas sous les
    // yeux, et la fenêtre se rouvrirait aussitôt. Une porte de sortie qui ne
    // sort pas ne sert à rien.
    window.BUTIN_MASQUE_LOCALEMENT = window.BUTIN_AFFICHE_SIGNATURE
        || window.signatureEtapeButin((window.PARTIE_DATA || {}).Butin);
    const fenetre = document.getElementById("fenetre-butin");
    if (fenetre) fenetre.style.display = "none";
};

// La touche Échap et un clic sur le fond sombre ferment aussi : trois sorties
// valent mieux qu'une pour un calque qui couvre tout l'écran.
//
// Sous garde, parce que ceci s'exécute au CHARGEMENT du module : une exception
// ici et c'est loot.js tout entier qui ne se charge pas — plus une seule de
// ses fonctions, donc une fenêtre de butin qui ne répond plus à rien. C'est
// précisément le genre de panne qu'on cherche à rendre impossible.
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const fenetre = document.getElementById("fenetre-butin");
        if (fenetre && fenetre.style.display !== "none") window.fermerButinLocalement();
    });
}

window.afficherFenetreButin = function(butin) {
    const fenetre = document.getElementById("fenetre-butin");
    if (!fenetre) return;

    if (!butin || !butin.ouvert) {
        fenetre.style.display = "none";
        window.BUTIN_MASQUE_LOCALEMENT = null;   // le prochain butin s'affichera
        return;
    }

    // Le butin appartient à la fin d'un combat : hors de la fenêtre de combat,
    // il n'a rien à faire à l'écran. Sans ce garde-fou, un butin resté ouvert
    // en base rouvrait sa fenêtre au simple chargement de la partie — par-dessus
    // la carte du monde, et sans que le joueur puisse rien en faire.
    if (document.getElementById("fenetre-combat")?.style.display !== "block") {
        fenetre.style.display = "none";
        return;
    }

    // Un combat en cours passe TOUJOURS avant un butin. Ce calque couvre tout
    // l'écran (z-index 20000, au-dessus du bandeau des points d'apparition et
    // de la fenêtre de rencontre) : tant qu'il est là, on ne peut ni placer un
    // repère ni générer des ennemis, et les boutons du menu de combat semblent
    // morts. Dès qu'un ennemi est debout, le butin s'efface donc de lui-même.
    if (!window.combatGagne()) {
        fenetre.style.display = "none";
        return;
    }

    // Ce joueur a refermé cette étape à la main : on ne la lui réimpose pas à
    // chaque notification de la partie. L'étape suivante, elle, s'affichera.
    if (window.BUTIN_MASQUE_LOCALEMENT
        && window.BUTIN_MASQUE_LOCALEMENT === window.signatureEtapeButin(butin)) {
        fenetre.style.display = "none";
        return;
    }

    fenetre.style.display = "flex";
    window.BUTIN_AFFICHE_SIGNATURE = window.signatureEtapeButin(butin);

    const joueurId = localStorage.getItem("ID_JOUEUR_COURANT");
    const mesPersonnages = (butin.participants || [])
        .map(id => (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === id))
        .filter(p => p && p.idJoueur === joueurId);

    // Le butin personnel se joue héros par héros : la fenêtre appartient à
    // celui dont c'est le tour, et à lui seul. Un joueur qui mène deux
    // personnages les traite l'un après l'autre, puis rejoint le partage.
    const enAttente = mesPersonnages.filter(p => {
        const bloc = (butin.parPersonnage || {})[p.idPersonnage];
        return bloc && !bloc.valide;
    });
    const herosCourant = butin.etape === "personnel" ? (enAttente[0] || null) : null;

    // L'équipement rappelé est celui du héros concerné : dans sa fenêtre, le
    // sien seul ; dans le partage commun, ceux de tous ses personnages.
    window.afficherEquipementActuelButin(herosCourant ? [herosCourant] : mesPersonnages);

    // Aucun de ces éléments n'est tenu pour acquis. Cette fonction tourne au
    // TOUT DÉBUT du traitement de chaque notification de partie (app.js), et
    // 150 lignes de combat la suivent : points d'apparition, tour de l'IA,
    // changement de tour, animations. Une exception ici les emportait toutes,
    // à chaque notification — le combat entier paraissait cassé. Un index.html
    // servi depuis le cache du navigateur (c'est le seul fichier sans ?v=)
    // suffit à faire manquer un élément : on ne lui laisse plus cette prise.
    const vuePersonnel = document.getElementById("butin-vue-personnel");
    const vuePartage = document.getElementById("butin-vue-partage");
    const vueFin = document.getElementById("butin-vue-fin");
    const titre = document.getElementById("butin-titre");
    const sousTitre = document.getElementById("butin-sous-titre");
    if (vuePersonnel) vuePersonnel.style.display = "none";
    if (vuePartage) vuePartage.style.display = "none";
    if (vueFin) vueFin.style.display = "none";
    const ecrire = (el, texte) => { if (el) el.innerText = texte; };
    const montrer = (el) => { if (el) el.style.display = "block"; };

    if (butin.etape === "personnel") {
        ecrire(titre, herosCourant ? `Butin de ${herosCourant.prenom}` : "Butin de guerre");
        // Un joueur à plusieurs héros voit où il en est dans sa file.
        const restants = mesPersonnages.length > 1 && herosCourant
            ? ` (${mesPersonnages.length - enAttente.length + 1} sur ${mesPersonnages.length})` : "";
        ecrire(sousTitre, herosCourant
            ? `Choisis ce que ${herosCourant.prenom} garde — l'objet remplacé est perdu pour de bon.${restants}`
            : "Choisis ce que tu gardes — l'objet remplacé est perdu pour de bon.");
        montrer(vuePersonnel);
        window.rendreVuePersonnelleButin(butin, mesPersonnages, herosCourant);
    } else if (butin.etape === "partage") {
        ecrire(titre, "Partage du butin");
        ecrire(sousTitre, "Place-toi sur un ou plusieurs objets restants. Plusieurs prétendants ? Le sort tranchera.");
        montrer(vuePartage);
        window.rendreVuePartageButin(butin, mesPersonnages.map(p => p.idPersonnage));
    } else if (butin.etape === "termine") {
        ecrire(titre, "Butin réparti");
        ecrire(sousTitre, "Voici ce que chacun a récupéré.");
        montrer(vueFin);
        window.rendreVueFinButin(butin, mesPersonnages.map(p => p.idPersonnage));
    }
};

// Rappel discret de ce que portent déjà "mes" héros, visible dans les deux
// fenêtres — c'est ce à quoi le joueur compare avant de choisir.
window.afficherEquipementActuelButin = function(mesPersonnages) {
    const conteneur = document.getElementById("butin-equipement-actuel");
    if (!conteneur) return;
    if (mesPersonnages.length === 0) { conteneur.innerHTML = ""; return; }

    const carre = (objet, icone) => {
        if (objet && objet.nom) {
            const img = objet.image ? `<img src="${objet.image}" alt="${objet.nom}" style="display:block;">` : icone;
            return `<div class="mini-carre-equip" title="${objet.nom} — ${objet.effetTexte || ""}">${img}</div>`;
        }
        return `<div class="mini-carre-equip vide">${icone}</div>`;
    };

    conteneur.innerHTML = mesPersonnages.map(p => `
        <span class="mini-etiquette-perso">${p.prenom}</span>
        ${carre(p.equipArmure, "🛡️")}
        ${carre(p.equipMainDroite, "⚔️")}
        ${carre(p.equipMainGauche, "🗡️")}
    `).join("");
};

// =========================================================================
//  VUE 1 : LE BUTIN PERSONNEL
// =========================================================================

// L'étiquette de rareté et, s'il manque la carac, l'avertissement de prérequis
// — les deux mêmes lignes dans les trois vues du butin.
window.bandeauObjetButin = function(item, idPersonnage) {
    const couleur = (window.COULEUR_RARETE && window.COULEUR_RARETE[item.rarete]) || "#5c3a21";
    let html = `<div class="etiquette-rarete" style="color:${couleur};">${item.rarete || ""}${item.deuxMains ? " · deux mains" : ""}</div>`;
    if (idPersonnage && typeof window.peutEquiper === "function") {
        const test = window.peutEquiper(idPersonnage, item);
        if (!test.possible) {
            html += `<div class="prerequis-objet">⚠ ${item.carac} ${item.prerequis} requis (tu as ${test.valeur})</div>`;
        }
    }
    return html;
};

window.rendreVuePersonnelleButin = function(butin, mesPersonnages, herosCourant) {
    const conteneur = document.getElementById("butin-vue-personnel");
    if (!conteneur) return;

    if (mesPersonnages.length === 0) {
        conteneur.innerHTML = `<p class="butin-attente">Tu n'as pas de héros dans ce combat.</p>`;
        return;
    }

    // Tous mes héros ont choisi : il ne reste qu'à attendre les autres joueurs
    // avant que le partage commun ne s'ouvre.
    if (!herosCourant) {
        const valides = (butin.participants || []).filter(id => (butin.parPersonnage[id] || {}).valide).length;
        const total = (butin.participants || []).length;
        conteneur.innerHTML = `
            <p class="butin-attente">✔️ ${mesPersonnages.length > 1 ? "Tes héros ont" : "Ton héros a"} fait son choix.</p>
            <p class="butin-attente">En attente des autres joueurs (${valides}/${total} prêts)...</p>`;
        return;
    }

    const bloc = butin.parPersonnage[herosCourant.idPersonnage];
    if (!bloc) { conteneur.innerHTML = ""; return; }

    const cartes = bloc.items.map(item =>
        window.rendreCarteLootPersonnel(herosCourant.idPersonnage, item, bloc)).join("");
    const tousDecides = bloc.items.every(it => bloc.decisions && bloc.decisions[it.uid] !== undefined);

    // Un joueur qui mène plusieurs héros voit les suivants attendre leur tour.
    const suivants = mesPersonnages.filter(p => p.idPersonnage !== herosCourant.idPersonnage
        && !(butin.parPersonnage[p.idPersonnage] || {}).valide);
    const fileAttente = suivants.length > 0
        ? `<p class="butin-file-heros">Ensuite : ${suivants.map(p => p.prenom).join(", ")}</p>`
        : "";

    conteneur.innerHTML = `
        <div class="bloc-heros-butin">
            <div class="butin-grille">${cartes}</div>
            <div class="butin-actions">
                <button class="btn-parametres" style="background-color:#1b6e3a; border-color:#0f4021;${tousDecides ? "" : " opacity:0.4; cursor:not-allowed;"}"
                        ${tousDecides ? "" : "disabled"}
                        onclick="window.validerButinPersonnel('${herosCourant.idPersonnage}')">Valider le choix de ${herosCourant.prenom}</button>
            </div>
            ${fileAttente}
        </div>`;
};

window.rendreCarteLootPersonnel = function(idPersonnage, item, bloc) {
    const decision = bloc.decisions ? bloc.decisions[item.uid] : undefined;
    const icone = window.iconeParEmplacement(item);
    const image = item.image ? `<img src="${item.image}" alt="${item.nom}" style="display:block;">`
                              : `<div class="icone-emplacement-vide">${icone}</div>`;

    // Un objet dont on n'a pas la carac se prend quand même... mais ne peut pas
    // s'équiper. Autant le dire ici : le bouton Prendre reste, grisé, et le
    // joueur a tout intérêt à le laisser au partage pour un camarade.
    const test = typeof window.peutEquiper === "function"
        ? window.peutEquiper(idPersonnage, item) : { possible: true };

    let actions;
    if (decision === true) actions = `<div class="statut-loot pris">✔️ Pris</div>`;
    else if (decision === false) actions = `<div class="statut-loot laisse">Laissé</div>`;
    else if (bloc.valide) actions = `<div class="statut-loot laisse">Non décidé</div>`;
    else actions = `<div class="carte-loot-actions">
        <button class="btn-loot-mini prendre"${test.possible ? "" : ' disabled style="opacity:0.4; cursor:not-allowed;" title="Caractéristique insuffisante"'}
                onclick="window.choisirLootPersonnel('${idPersonnage}','${item.uid}', true)">Prendre</button>
        <button class="btn-loot-mini laisser" onclick="window.choisirLootPersonnel('${idPersonnage}','${item.uid}', false)">Laisser</button>
    </div>`;

    return `<div class="carte-loot${test.possible ? "" : " loot-hors-portee"}">
        <div class="carre-equipement">${image}</div>
        <div class="libelle-emplacement">${window.libelleEmplacement(item)}</div>
        <div class="nom-objet-equipe">${item.nom}</div>
        ${window.bandeauObjetButin(item, idPersonnage)}
        <div class="effet-objet-equipe">${item.effetTexte || ""}</div>
        ${actions}
    </div>`;
};

// "Laisser" est immédiat (rien à confirmer) ; "Prendre" ouvre la comparaison
// avant/après, et n'écrit la décision qu'une fois confirmé.
window.choisirLootPersonnel = function(idPersonnage, uid, prendre) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!prendre) {
        window.enregistrerDecisionButin(idPersonnage, uid, false);
        return;
    }

    const butin = (window.PARTIE_DATA || {}).Butin;
    const bloc = butin && butin.parPersonnage[idPersonnage];
    const item = bloc && bloc.items.find(it => it.uid === uid);
    if (!item) return;

    window.ouvrirConfirmationEquip(idPersonnage, item, uid);
};

// La fenêtre de confirmation, qui répond à trois questions d'un coup : ce que
// l'objet apporte, ce qu'il DÉTRUIT (une arme à deux mains en écrase deux), et
// dans quelle main le mettre. Un objet dont on n'a pas la carac s'affiche
// quand même, mais sans bouton pour l'équiper : le joueur voit ce qu'il rate.
window.ouvrirConfirmationEquip = function(idPersonnage, item, uid) {
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    window.BUTIN_CHOIX_EN_ATTENTE = { idPersonnage, uid, item };

    const test = typeof window.peutEquiper === "function"
        ? window.peutEquiper(idPersonnage, item) : { possible: true };

    // Les mains proposées : une seule pour une armure ou une arme à deux mains,
    // les deux pour le reste.
    let choix;
    if (item.emplacement === "Armure") {
        choix = [{ libelle: "Équiper", main: null }];
    } else if (item.deuxMains) {
        choix = [{ libelle: "Équiper à deux mains", main: null }];
    } else {
        choix = [{ libelle: "Main droite", main: "Droite" }, { libelle: "Main gauche", main: "Gauche" }];
    }

    // La comparaison montre, pour le premier choix, ce qui serait perdu.
    window.remplirComparaisonEquip(window.objetsEcrasesPar(perso, item, choix[0].main), item);

    const message = document.getElementById("message-confirmation-equip");
    if (message) {
        message.innerText = test.possible ? ""
            : `Il te faut ${item.prerequis} en ${item.carac} pour porter cet objet (tu as ${test.valeur}).`;
        message.style.display = test.possible ? "none" : "block";
    }

    const actions = document.getElementById("actions-confirmation-equip");
    if (actions) {
        const boutons = test.possible ? choix.map(c => {
            const perdus = window.objetsEcrasesPar(perso, item, c.main);
            const detail = perdus.length ? ` (remplace ${perdus.map(o => o.nom).join(" et ")})` : "";
            return `<button class="btn-parametres" style="background-color: #1b6e3a; border-color: #0f4021;"
                        onmouseover="window.remplirComparaisonEquip(window.objetsEcrasesPar(
                            (window.PERSOS_PARTIE||[]).find(p => p.idPersonnage === '${idPersonnage}'),
                            window.BUTIN_CHOIX_EN_ATTENTE.item, ${c.main ? `'${c.main}'` : "null"}),
                            window.BUTIN_CHOIX_EN_ATTENTE.item)"
                        onclick="window.confirmerChoixButin(true, ${c.main ? `'${c.main}'` : "null"})">${c.libelle}${detail}</button>`;
        }).join("") : "";
        actions.innerHTML = boutons +
            `<button class="btn-parametres" onclick="window.confirmerChoixButin(false)">Annuler</button>`;
    }

    const popup = document.getElementById("popup-confirmation-equip");
    if (popup) popup.style.display = "flex";
};

// "actuels" est une LISTE : une arme à deux mains chasse ce que portent les
// deux mains, et le joueur doit voir les deux objets qu'il sacrifie.
window.remplirComparaisonEquip = function(actuels, nouveau) {
    const rendre = (objet) => {
        if (!objet || !objet.nom) {
            return `<div class="carre-equipement"><div class="icone-emplacement-vide">—</div></div>
                    <div class="nom-objet-equipe">Rien d'équipé</div>`;
        }
        const icone = window.iconeParEmplacement(objet);
        const image = objet.image ? `<img src="${objet.image}" alt="${objet.nom}" style="display:block;">`
                                   : `<div class="icone-emplacement-vide">${icone}</div>`;
        const couleur = (window.COULEUR_RARETE && window.COULEUR_RARETE[objet.rarete]) || "#5c3a21";
        return `<div class="carre-equipement">${image}</div>
                <div class="nom-objet-equipe">${objet.nom}</div>
                <div class="etiquette-rarete" style="color:${couleur};">${objet.rarete || ""}</div>
                <div class="effet-objet-equipe">${objet.effetTexte || ""}</div>`;
    };
    const liste = Array.isArray(actuels) ? actuels : (actuels ? [actuels] : []);
    const actuel = document.getElementById("comparaison-actuel");
    const neuf = document.getElementById("comparaison-nouveau");
    if (actuel) actuel.innerHTML =
        liste.length === 0 ? rendre(null) : liste.map(rendre).join('<div class="separateur-comparaison"></div>');
    if (neuf) neuf.innerHTML = rendre(nouveau);
};

window.confirmerChoixButin = async function(confirme, main) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const popupFerme = document.getElementById("popup-confirmation-equip");
    if (popupFerme) popupFerme.style.display = "none";
    const attente = window.BUTIN_CHOIX_EN_ATTENTE;
    window.BUTIN_CHOIX_EN_ATTENTE = null;
    if (!attente) return;

    if (confirme) {
        await window.equiperObjet(attente.idPersonnage, attente.item, main);
        await window.enregistrerDecisionButin(attente.idPersonnage, attente.uid, true);
    }
    // Annulé : la décision reste ouverte, le joueur peut recliquer Prendre ou Laisser.
};

window.enregistrerDecisionButin = async function(idPersonnage, uid, prendre) {
    await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "personnel") return null;
        const bloc = butin.parPersonnage[idPersonnage];
        if (!bloc || bloc.valide) return null; // déjà validé : trop tard pour changer d'avis
        return { maj: { [`Butin.parPersonnage.${idPersonnage}.decisions.${uid}`]: prendre } };
    });
};

// Valide les deux choix d'un héros. Si c'est le DERNIER héros à valider, le
// pool du partage commun est construit ici même, dans la même transaction :
// la bascule est atomique, aucune autre écriture ne peut se glisser entre les
// deux (cf. window.modifierPartie).
window.validerButinPersonnel = async function(idPersonnage) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "personnel") return null;
        const bloc = butin.parPersonnage[idPersonnage];
        if (!bloc || bloc.valide) return null;

        const tousDecides = bloc.items.every(it => bloc.decisions && bloc.decisions[it.uid] !== undefined);
        if (!tousDecides) return null;

        const maj = { [`Butin.parPersonnage.${idPersonnage}.valide`]: true };

        const dejaValides = new Set(Object.keys(butin.parPersonnage).filter(id => butin.parPersonnage[id].valide));
        dejaValides.add(idPersonnage);
        const tousValides = butin.participants.every(id => dejaValides.has(id));

        if (tousValides) {
            const pool = [];
            butin.participants.forEach(id => {
                const b = butin.parPersonnage[id];
                const decisions = id === idPersonnage ? (bloc.decisions || {}) : (b.decisions || {});
                (b.items || []).forEach(item => {
                    if (decisions[item.uid] === false) pool.push({ ...item, candidats: [], gagnant: null });
                });
            });
            maj["Butin.pool"] = pool;
            maj["Butin.etape"] = "partage";
        }

        return { maj };
    });
};

// =========================================================================
//  VUE 2 : LE PARTAGE COMMUN
// =========================================================================

window.rendreVuePartageButin = function(butin, mesIds) {
    const conteneur = document.getElementById("butin-grille-partage");
    const attente = document.getElementById("butin-attente-partage");
    const btnValider = document.getElementById("btn-valider-butin-partage");
    if (!conteneur) return;

    const dejaValide = mesIds.length > 0 && mesIds.every(id => (butin.poolValides || []).includes(id));

    if ((butin.pool || []).length === 0) {
        conteneur.innerHTML = `<p class="butin-attente">Personne n'a laissé d'objet cette fois-ci.</p>`;
    } else {
        conteneur.innerHTML = butin.pool.map(item => window.rendreCarteLootPool(item, mesIds, dejaValide)).join("");
    }

    if (btnValider) {
        btnValider.style.display = dejaValide ? "none" : "inline-block";
        btnValider.disabled = mesIds.length === 0;
    }
    if (attente) {
        const nbValides = (butin.poolValides || []).length;
        const total = (butin.participants || []).length;
        attente.innerText = dejaValide ? `En attente des autres joueurs (${nbValides}/${total} prêts)...` : "";
    }
};

window.rendreCarteLootPool = function(item, mesIds, dejaValide) {
    const icone = window.iconeParEmplacement(item);
    const image = item.image ? `<img src="${item.image}" alt="${item.nom}" style="display:block;">`
                              : `<div class="icone-emplacement-vide">${icone}</div>`;
    const candidats = item.candidats || [];
    const jeSuisDedans = mesIds.some(id => candidats.includes(id));
    const nomsCandidats = candidats.map(id => {
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
        return p ? p.prenom : id;
    });

    let actions;
    if (dejaValide) {
        actions = jeSuisDedans ? `<div class="statut-loot pris">En lice</div>` : "";
    } else {
        actions = `<div class="carte-loot-actions">` + mesIds.map(id => {
            const dedans = candidats.includes(id);
            const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
            const suffixeNom = mesIds.length > 1 ? ` (${p ? p.prenom : id})` : "";
            // Inutile de se placer sur un objet qu'on ne pourra pas porter :
            // ce serait un tirage au sort gagné pour rien.
            const test = typeof window.peutEquiper === "function"
                ? window.peutEquiper(id, item) : { possible: true };
            if (!test.possible) {
                return `<button class="btn-loot-mini place" disabled style="opacity:0.4; cursor:not-allowed;"
                    title="${item.carac} ${item.prerequis} requis">Hors de portée${suffixeNom}</button>`;
            }
            return `<button class="btn-loot-mini ${dedans ? "retirer" : "place"}"
                onclick="window.togglePlacementPool('${id}','${item.uid}')">${dedans ? "Se retirer" : "Se placer"}${suffixeNom}</button>`;
        }).join("") + `</div>`;
    }

    return `<div class="carte-loot">
        <div class="carre-equipement">${image}</div>
        <div class="libelle-emplacement">${window.libelleEmplacement(item)}</div>
        <div class="nom-objet-equipe">${item.nom}</div>
        ${window.bandeauObjetButin(item, mesIds[0])}
        <div class="effet-objet-equipe">${item.effetTexte || ""}</div>
        <div class="candidats-loot">${nomsCandidats.length ? "Convoité par : " + nomsCandidats.join(", ") : "Personne pour l'instant"}</div>
        ${actions}
    </div>`;
};

// Un héros peut se placer sur PLUSIEURS objets à la fois (bascule simple par
// objet), et changer d'avis librement tant que le partage n'est pas résolu.
window.togglePlacementPool = async function(idPersonnage, uid) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "partage" || butin.resolu) return null;
        const pool = (butin.pool || []).map(item => {
            if (item.uid !== uid) return item;
            const candidats = item.candidats || [];
            const dedans = candidats.includes(idPersonnage);
            return { ...item, candidats: dedans ? candidats.filter(id => id !== idPersonnage) : [...candidats, idPersonnage] };
        });
        return { maj: { "Butin.pool": pool } };
    });
};

// Valide TOUS les héros de ce joueur d'un coup. Si c'est le dernier joueur à
// valider, la résolution (tirage au sort compris) a lieu ici même, dans la
// transaction : un seul appel, parmi tous ceux qui arrivent en même temps,
// obtient un résultat non nul — c'est lui, et lui seul, qui équipe ensuite
// les gagnants (même principe que "jeSuisLAuteur" dans le moteur d'effets).
window.validerButinPool = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const joueurId = localStorage.getItem("ID_JOUEUR_COURANT");
    const butinLocal = (window.PARTIE_DATA || {}).Butin;
    if (!butinLocal) return;
    const mesPersonnages = (butinLocal.participants || [])
        .filter(id => {
            const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
            return p && p.idJoueur === joueurId;
        });
    if (mesPersonnages.length === 0) return;

    const resolution = await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "partage" || butin.resolu) return null;

        const poolValides = new Set(butin.poolValides || []);
        mesPersonnages.forEach(id => poolValides.add(id));
        const tousValides = (butin.participants || []).every(id => poolValides.has(id));

        if (!tousValides) {
            // resultat explicite (et non "undefined") : sinon modifierPartie
            // renverrait true par défaut, et le for..of plus bas plante dessus.
            return { maj: { "Butin.poolValides": [...poolValides] }, resultat: null };
        }

        const pool = (butin.pool || []).map(item => {
            const candidats = item.candidats || [];
            let gagnant = null;
            if (candidats.length === 1) gagnant = candidats[0];
            else if (candidats.length > 1) gagnant = candidats[Math.floor(Math.random() * candidats.length)];
            return { ...item, gagnant };
        });

        return {
            maj: { "Butin.poolValides": [...poolValides], "Butin.pool": pool, "Butin.resolu": true, "Butin.etape": "termine" },
            resultat: pool
        };
    });

    if (resolution) {
        for (const item of resolution) {
            if (!item.gagnant) continue;
            // Dernier garde-fou : on n'équipe jamais quelqu'un qui n'a pas la
            // carac (il n'aurait pas dû pouvoir se placer, mais une fiche lue
            // en retard suffirait à passer au travers).
            const test = typeof window.peutEquiper === "function"
                ? window.peutEquiper(item.gagnant, item) : { possible: true };
            if (test.possible) await window.equiperObjetButin(item.gagnant, item);
        }
    }
};

// =========================================================================
//  VUE 3 : LE RÉSULTAT
// =========================================================================

window.rendreVueFinButin = function(butin, mesIds) {
    const conteneur = document.getElementById("butin-resultats");
    if (!conteneur) return;
    if ((butin.pool || []).length === 0) {
        conteneur.innerHTML = `<p class="butin-attente">Rien n'était à partager cette fois-ci.</p>`;
        return;
    }
    conteneur.innerHTML = butin.pool.map(item => {
        const icone = window.iconeParEmplacement(item);
        const image = item.image ? `<img src="${item.image}" alt="${item.nom}" style="display:block;">`
                                  : `<div class="icone-emplacement-vide">${icone}</div>`;
        const gagnantPerso = item.gagnant ? (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === item.gagnant) : null;
        const statut = gagnantPerso
            ? `<div class="statut-loot gagne">🏆 ${gagnantPerso.prenom}</div>`
            : `<div class="statut-loot perdu">Personne ne l'a pris</div>`;
        // Un objet remporté par un autre joueur s'assombrit : ce qui reste en
        // pleine lumière est ce qui a un rapport avec MES héros.
        const inaccessible = item.gagnant && !mesIds.includes(item.gagnant);

        return `<div class="carte-loot${inaccessible ? " loot-inaccessible" : ""}">
            <div class="carre-equipement">${image}</div>
            <div class="libelle-emplacement">${window.libelleEmplacement(item)}</div>
            <div class="nom-objet-equipe">${item.nom}</div>
            ${window.bandeauObjetButin(item, null)}
            <div class="effet-objet-equipe">${item.effetTexte || ""}</div>
            ${statut}
        </div>`;
    }).join("");
};

// Referme le butin pour tout le monde d'un coup — n'importe quel joueur peut
// le faire une fois la répartition terminée.
window.fermerFenetreButin = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await window.modifierPartie((data) => {
        if (!data.Butin || !data.Butin.ouvert) return null;
        return { maj: { "Butin.ouvert": false } };
    });
};
