// =========================================================================
//  LA TRACE DU COMBAT — DE QUOI ARRÊTER DE CHERCHER À L'AVEUGLE
// =========================================================================
//
//  COMMENT S'EN SERVIR
//  -------------------
//   1. Ouvrir la console du navigateur : F12 sur PC, ou sur iPad brancher la
//      tablette au Mac et ouvrir Safari > Développement.
//   2. Jouer le tour qui déraille.
//   3. Taper `copierTrace()` dans la console : tout part dans le presse-papier,
//      prêt à être collé.
//      `voirTrace()` la réaffiche à l'écran, `effacerTrace()` repart de zéro.
//
//  CE QU'ON Y LIT
//  --------------
//  Une ligne par chose qui arrive, dans l'ordre, avec le temps écoulé et le
//  poste qui l'a faite. Les points de vie sont tracés à CHAQUE changement, avec
//  leur cause : c'est ainsi qu'on voit un dégât appliqué deux fois — la même
//  cible, le même nombre, deux lignes.
//
//      [ 12.34s] iPad-Nico  📤 152  pas M1  (0,0 → 1,0)
//      [ 12.51s] iPad-Nico  📥 152
//      [ 13.02s] iPad-Nico  ⏸️  fenêtre : tour 3 de M1 (Griffes)
//      [ 15.88s] iPad-Nico  👆 OK — M1 (tour 3)  n°152 pas | 2 en file | tête : M1 | curseur 151
//      [ 15.89s] iPad-Nico  ▶️  152  pas M1
//      [ 16.31s] iPad-Nico  ⏹️  152
//      [ 16.35s] iPad-Nico  💥 J1  60 → 48  (-12)  [auteur]
//
//  LA CROIX ROUGE DE LA FENÊTRE SOMBRE
//  -----------------------------------
//  En haut à droite du voile. Elle l'écarte SANS rien jouer : le plateau
//  apparaît tel qu'il est, on regarde où en sont les pions et les jauges pendant
//  que le tour est encore retenu, et rien n'est touché — ni le journal, ni la
//  file. La fenêtre revient d'elle-même au tour suivant ; `revoirVoileTour()`
//  la rappelle immédiatement.
//
//  La trace ne coûte rien : elle ne garde que les 500 dernières lignes, et se
//  coupe entièrement avec `TRACE_COMBAT_ACTIVE = false`.
// =========================================================================

// LA VERSION DE CE POSTE. Elle voyage avec chaque événement publié, et la trace
// l'affiche à la réception : « 📥 2 carte M1 [de P_01 v24] ». Une seule ligne
// suffit alors à voir qu'un appareil n'a pas rechargé la page et tourne encore
// sur du vieux code — ce qui, dans un jeu où deux postes doivent s'entendre sur
// qui joue, fabrique des bugs impossibles à comprendre autrement.
// À MONTER À CHAQUE FOIS QUE index.html monte ses ?v=.
window.VERSION_IVALIS = 47;

window.TRACE_COMBAT_ACTIVE = true;
// Quand une écriture de points de vie n'est ni un coup ni un rejeu mais une
// remise en ordre de l'affichage, elle le dit : sans ça la trace est illisible.
window.__TRACE_CAUSE = null;
window.TRACE_COMBAT = [];
const TRACE_MAX = 500;
let debutTrace = Date.now();

function posteCourt() {
    const id = (typeof localStorage !== "undefined" && localStorage.getItem("ID_JOUEUR_COURANT")) || "?";
    return String(id).slice(0, 10).padEnd(10);
}

window.tracerCombat = function(icone, quoi, detail) {
    if (!window.TRACE_COMBAT_ACTIVE) return;
    const secondes = ((Date.now() - debutTrace) / 1000).toFixed(2).padStart(7);
    const ligne = `[${secondes}s] ${posteCourt()} ${icone} ${quoi}${detail ? "  " + detail : ""}`;
    window.TRACE_COMBAT.push(ligne);
    if (window.TRACE_COMBAT.length > TRACE_MAX) window.TRACE_COMBAT.shift();
    console.log("%c" + ligne, "color:#c2a878");
};

// Remet le chronomètre à zéro et vide la trace : à faire juste avant de
// reproduire le problème, pour n'avoir que lui sous les yeux.
window.effacerTrace = function() {
    window.TRACE_COMBAT = [];
    debutTrace = Date.now();
    console.log("%cTrace du combat effacée — rejoue le tour qui déraille, puis tape copierTrace()",
                "color:#7bd66a; font-weight:bold");
};

window.voirTrace = function() {
    console.log("%c===== TRACE DU COMBAT (" + window.TRACE_COMBAT.length + " lignes) =====",
                "color:#7bd66a; font-weight:bold");
    console.log(window.TRACE_COMBAT.join("\n"));
};

window.copierTrace = function() {
    const texte = window.TRACE_COMBAT.join("\n");
    const fini = () => console.log("%c✅ Trace copiée (" + window.TRACE_COMBAT.length
                                   + " lignes). Colle-la telle quelle.",
                                   "color:#7bd66a; font-weight:bold");
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).then(fini).catch(() => {
            // Safari refuse parfois le presse-papier hors d'un clic : on affiche.
            window.voirTrace();
            console.log("%c(presse-papier refusé — sélectionne le bloc ci-dessus)", "color:#e63946");
        });
    } else {
        window.voirTrace();
    }
    return texte;
};

// =========================================================================
//  LES POINTS DE VIE, TRACÉS À CHAQUE CHANGEMENT
// =========================================================================
//  C'est le mouchard le plus utile : il n'y a qu'une façon de voir un dégât
//  appliqué deux fois, c'est de voir passer deux fois la même soustraction. On
//  installe donc une sentinelle sur PV_Actuels et Bouclier_Actuel de chaque
//  combattant, à chaque fois que la base en livre une nouvelle fiche.
const CHAMPS_SURVEILLES = ["PV_Actuels", "Bouclier_Actuel"];

window.surveillerCombattant = function(perso) {
    if (!window.TRACE_COMBAT_ACTIVE || !perso || perso.__surveille) return perso;
    try {
        Object.defineProperty(perso, "__surveille", { value: true, enumerable: false });
        CHAMPS_SURVEILLES.forEach(champ => {
            let valeur = perso[champ];
            Object.defineProperty(perso, champ, {
                configurable: true, enumerable: true,
                get() { return valeur; },
                set(nouvelle) {
                    if (nouvelle !== valeur) {
                        const cause = window.__TRACE_CAUSE ? window.__TRACE_CAUSE
                                    : window.REJEU_SCRIPT_EN_COURS ? "[rejeu]"
                                    : window.CALCUL_IA_SILENCIEUX ? "[calcul IA]"
                                    : "[direct]";
                        const ecart = (parseInt(nouvelle) || 0) - (parseInt(valeur) || 0);
                        window.tracerCombat(champ === "PV_Actuels" ? "💥" : "🛡️",
                            `${perso.idPersonnage}  ${valeur} → ${nouvelle}`,
                            `(${ecart >= 0 ? "+" : ""}${ecart}) ${cause}`);
                    }
                    valeur = nouvelle;
                }
            });
        });
    } catch (e) { /* une fiche figée : tant pis, on trace le reste */ }
    return perso;
};

// Toute la table d'un coup — appelé à chaque recomposition des combattants.
window.surveillerLesCombattants = function() {
    (window.PERSOS_PARTIE || []).forEach(window.surveillerCombattant);
};

console.log("%cTrace du combat active — version " + window.VERSION_IVALIS
            + ". copierTrace() pour l'envoyer, effacerTrace() pour repartir de zéro.",
            "color:#c2a878; font-style:italic");
