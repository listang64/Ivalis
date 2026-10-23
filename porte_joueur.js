// =========================================================================
//  LA PORTE DU JOUEUR (v259)
// =========================================================================
//  Depuis les comptes (comptes.js), la base n'est ouverte qu'aux joueurs
//  CONNECTÉS ET VALIDÉS — les règles Firestore le font respecter. Tout ce qui
//  lisait la base dès le chargement de la page (la date en jeu, les parties,
//  les effets, la carte, les réglages des monstres, les régions) attend donc
//  derrière cette porte : on lui confie la fonction, elle la lance au moment
//  où le compte est reconnu. Lancée plus tôt, la lecture serait refusée, et
//  un écouteur refusé ne se relève pas.
//
//  Un script classique, chargé avant tous les modules : chacun peut s'y
//  inscrire dès sa première ligne, quel que soit l'ordre des modules.
// =========================================================================
window.PorteJoueur = (function () {
    let ouverte = false;
    const enAttente = [];
    const lancer = (fn) => {
        try { fn(); } catch (e) { console.error("Porte du joueur :", e); }
    };
    return {
        get ouverte() { return ouverte; },
        // Lance `fn` tout de suite si la porte est ouverte, sinon à son ouverture.
        quand(fn) {
            if (typeof fn !== "function") return;
            if (ouverte) lancer(fn); else enAttente.push(fn);
        },
        ouvrir() {
            if (ouverte) return;
            ouverte = true;
            enAttente.splice(0).forEach(lancer);
        }
    };
})();
