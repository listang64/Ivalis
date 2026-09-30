// =========================================================================
//  IVALIS — L'EXPÉRIENCE ET LES NIVEAUX
// =========================================================================
//  La grille de Nico (tableau 1) :
//
//     Niv.  XP requis   Gain
//      1         0      Compétences de départ + classe
//      2       700      +1 compétence
//      3     1 200      Talent mineur
//      4     1 800      +1 compétence
//      5     2 500      Talent mineur
//      6     3 300      +1 compétence
//      7     4 200      Talent mineur
//      8     5 200      +1 compétence
//      9     6 400      Talent majeur
//     10     7 900      +1 compétence
//     11+   +1 500 par niveau   +1 compétence
//
//  Le héros garde son XP TOTALE (champ « XP » de sa fiche, Personnages) : son
//  niveau s'en déduit, il n'est jamais écrit à part — deux chiffres qui
//  pourraient se contredire, c'est un de trop.
//
//  UNE COMPÉTENCE GAGNÉE, C'EST UNE COMPÉTENCE DE PLUS À CRÉER dans la Forge.
//  La limite en main (les cartes mémorisées pour le combat) ne bouge pas.
//  Les talents viendront plus tard : la grille les annonce déjà.
//
//  L'XP se gagne à la victoire : chaque créature tombée rapporte son « XP pour
//  le groupe » (bestiaire, XP_Groupe) à CHAQUE membre de l'équipe — voir
//  demarrerButin (loot.js).
// =========================================================================

(function () {
    const SEUILS = [0, 700, 1200, 1800, 2500, 3300, 4200, 5200, 6400, 7900];
    const PAS_APRES_10 = 1500;
    const GAINS = {
        1: "Compétences de départ + classe",
        2: "+1 compétence", 3: "Talent mineur", 4: "+1 compétence", 5: "Talent mineur",
        6: "+1 compétence", 7: "Talent mineur", 8: "+1 compétence", 9: "Talent majeur",
        10: "+1 compétence"
    };
    // Si le bestiaire n'a pas de chiffre pour une créature, la grille de Nico
    // selon sa stature (tous les types rapportent la même chose).
    const XP_PAR_PALIER = { "Petit": 40, "Normal": 100, "Élite": 240, "Boss": 800 };

    window.GRILLE_XP = { SEUILS, PAS_APRES_10, GAINS, XP_PAR_PALIER };

    // L'XP qu'il faut avoir accumulée pour ATTEINDRE ce niveau.
    window.xpPourNiveau = function (niveau) {
        const n = Math.max(1, Math.floor(Number(niveau) || 1));
        if (n <= SEUILS.length) return SEUILS[n - 1];
        return SEUILS[SEUILS.length - 1] + (n - SEUILS.length) * PAS_APRES_10;
    };

    // Le niveau que donne cette XP.
    window.niveauDepuisXP = function (xp) {
        const x = Math.max(0, Number(xp) || 0);
        let n = 1;
        while (x >= window.xpPourNiveau(n + 1)) n++;
        return n;
    };

    // Ce qu'on gagne en atteignant ce niveau.
    window.gainDuNiveau = function (niveau) {
        return GAINS[niveau] || (niveau > 10 ? "+1 compétence" : "");
    };

    // Combien de compétences EN PLUS le niveau permet de créer : une à chaque
    // « +1 compétence » atteint (2, 4, 6, 8, 10, puis chaque niveau).
    window.competencesDeNiveau = function (niveau) {
        const n = Math.max(1, Math.floor(Number(niveau) || 1));
        let total = 0;
        for (let k = 2; k <= n; k++) if (k > 10 || k % 2 === 0) total++;
        return total;
    };

    // L'XP d'une fiche : la fiche convertie porte `xp`, le document brut `XP`.
    window.xpDuPerso = function (perso) {
        if (!perso) return 0;
        const v = perso.xp !== undefined ? perso.xp : perso.XP;
        return Math.max(0, Number(v) || 0);
    };

    // Où en est ce héros : son niveau, l'XP de ce niveau, celle du suivant.
    window.progressionXP = function (xp) {
        const x = Math.max(0, Number(xp) || 0);
        const niveau = window.niveauDepuisXP(x);
        const debut = window.xpPourNiveau(niveau);
        const suivant = window.xpPourNiveau(niveau + 1);
        return { xp: x, niveau, debut, suivant,
                 dansNiveau: x - debut, pourNiveau: suivant - debut,
                 ratio: Math.max(0, Math.min(1, (x - debut) / (suivant - debut))),
                 prochainGain: window.gainDuNiveau(niveau + 1) };
    };

    // L'XP que rapporte une créature tombée, à chaque membre de l'équipe.
    window.xpDeLaCreature = function (m) {
        if (!m) return 0;
        const v = Number(m.XP_Groupe);
        if (v > 0) return v;
        return XP_PAR_PALIER[m.Palier || m.palier] || 0;
    };

    // --- LA JAUGE DE LA FICHE ----------------------------------------------
    const nombre = (n) => Math.round(n).toLocaleString("fr-FR");

    window.afficherJaugeXP = function (perso) {
        const bandeau = document.getElementById("bandeau-xp-perso");
        if (!bandeau) return;
        const p = window.progressionXP(window.xpDuPerso(perso));
        bandeau.dataset.idPerso = (perso && perso.idPersonnage) || "";
        const niveau = bandeau.querySelector(".xp-niveau-chiffre");
        const remplissage = bandeau.querySelector(".xp-jauge-remplissage");
        const texte = bandeau.querySelector(".xp-jauge-texte");
        const prochain = bandeau.querySelector(".xp-prochain");
        if (niveau) niveau.textContent = String(p.niveau);
        if (remplissage) remplissage.style.width = (p.ratio * 100).toFixed(2) + "%";
        if (texte) texte.textContent = `${nombre(p.xp)} / ${nombre(p.suivant)} XP`;
        if (prochain) {
            prochain.textContent = p.prochainGain
                ? `Niveau ${p.niveau + 1} dans ${nombre(p.suivant - p.xp)} XP : ${p.prochainGain}`
                : "";
        }
    };

    // Rafraîchir la jauge de la fiche ouverte, si c'est ce héros-là (appelé
    // quand la fiche change en base : une victoire, une triche de niveau).
    window.rafraichirJaugeXPOuverte = function () {
        const bandeau = document.getElementById("bandeau-xp-perso");
        const fiche = document.getElementById("fenetre-fiche-perso");
        if (!bandeau || !fiche || getComputedStyle(fiche).display === "none") return;
        const id = (document.getElementById("champ-id-personnage") || {}).value || bandeau.dataset.idPerso;
        const perso = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id)
            || (window.PERSOS_JOUEURS_PARTIE || []).find(x => x.idPersonnage === id);
        if (perso) window.afficherJaugeXP(perso);
    };
})();
