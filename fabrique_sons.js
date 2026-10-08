// =========================================================================
//  IVALIS — LA FABRIQUE (Paramètres → La Fabrique)
// =========================================================================
//  Dix sons de clic de menu, fabriqués sur place avec Web Audio : aucun
//  fichier à héberger, aucun réseau. Tous sont un léger « ding » — clair,
//  doux, cristal, boisé, double, feutré, perle, clochette, écho, scintillant —
//  pour qu'on les écoute ici avant de choisir celui des boutons du jeu.
//
//  Chaque son est une fonction (ctx, sortie) : elle ne fait que brancher des
//  oscillateurs et des souffles filtrés sur `sortie`. C'est ce qui permet de
//  les jouer pour de vrai (contexte audio du navigateur) ET de les rendre hors
//  ligne dans un banc (OfflineAudioContext) pour vérifier qu'ils sonnent.
//
//  Le volume suit les réglages du jeu : « Interface » × « Général ».
// =========================================================================

(function () {
    // --- LES DEUX BRIQUES ------------------------------------------------
    // Une note : un oscillateur et son enveloppe (attaque, puis chute).
    function note(ctx, sortie, o) {
        const t = ctx.currentTime + (o.debut || 0);
        const duree = o.duree || 0.2;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = o.type || "sine";
        osc.frequency.setValueAtTime(o.freq, t);
        if (o.glisse) osc.frequency.exponentialRampToValueAtTime(o.glisse, t + duree);
        if (o.desaccord) osc.detune.setValueAtTime(o.desaccord, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t + (o.attaque || 0.006));
        g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
        let bout = g;
        if (o.passeBas) {
            const f = ctx.createBiquadFilter();
            f.type = "lowpass";
            f.frequency.value = o.passeBas;
            g.connect(f);
            bout = f;
        }
        osc.connect(g);
        bout.connect(sortie);
        osc.start(t);
        osc.stop(t + duree + 0.03);
    }

    // Un souffle filtré : la matière d'un clic, d'un froissement, d'un vent.
    // `balayage` fait glisser le filtre (une fenêtre qui s'ouvre, qui se ferme).
    function bruit(ctx, sortie, o) {
        const t = ctx.currentTime + (o.debut || 0);
        const duree = o.duree || 0.05;
        const n = Math.max(1, Math.floor(ctx.sampleRate * duree));
        const tampon = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = tampon.getChannelData(0);
        const forme = o.forme || "chute";      // "chute" : attaque sèche ; "cloche" : monte puis retombe
        for (let i = 0; i < n; i++) {
            const x = i / n;
            const env = forme === "cloche" ? Math.sin(Math.PI * x) : Math.pow(1 - x, 3);
            d[i] = (Math.random() * 2 - 1) * env;
        }
        const src = ctx.createBufferSource();
        src.buffer = tampon;
        const filtre = ctx.createBiquadFilter();
        filtre.type = o.filtre || "bandpass";
        filtre.Q.value = o.q || 1;
        if (o.balayage) {
            filtre.frequency.setValueAtTime(o.balayage[0], t);
            filtre.frequency.exponentialRampToValueAtTime(o.balayage[1], t + duree);
        } else {
            filtre.frequency.value = o.freq || 2000;
        }
        const g = ctx.createGain();
        g.gain.value = o.gain || 0.3;
        src.connect(filtre).connect(g).connect(sortie);
        src.start(t);
    }

    // --- UN DING, ET SES DIX VARIATIONS ---------------------------------
    //  Nico : « remplace tous ces sons par des exemples de clic de menu sur un
    //  bouton — un léger ding, et des variations pour les dix boutons ». Un
    //  ding, c'est une toute petite attaque (le doigt qui touche) et une note
    //  claire qui s'éteint vite ; ses partiels (les harmoniques au-dessus)
    //  décident s'il sonne verre, cloche, bois ou métal.
    function ding(ctx, s, o) {
        const f = o.freq;
        const debut = o.debut || 0;
        const duree = o.duree || 0.25;
        const force = o.force || 1;
        // L'attaque : un souffle minuscule, pour que le ding « se touche ».
        if (o.clic !== false) {
            bruit(ctx, s, { debut, duree: 0.012, freq: Math.min(9000, f * 3), q: 2,
                            gain: 0.12 * force * (o.clic || 1) });
        }
        // La note, et ses partiels : [rapport de fréquence, part du volume, part de la durée].
        (o.partiels || [[1, 1, 1], [2, 0.18, 0.5]]).forEach(([k, part, tenue]) => {
            note(ctx, s, { freq: f * k, debut, duree: duree * tenue, gain: 0.16 * force * part,
                           type: o.type || "sine", attaque: o.attaque || 0.004,
                           desaccord: o.desaccord || 0, passeBas: o.passeBas });
        });
    }

    const SONS = [
        {
            id: "ding-clair", nom: "Ding clair",
            usage: "Net et lumineux — le clic de menu de base",
            fabriquer(ctx, s) { ding(ctx, s, { freq: 1318.5, duree: 0.22 }); }
        },
        {
            id: "ding-doux", nom: "Ding doux",
            usage: "Plus bas et plus rond, sans aucune pointe",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 880, duree: 0.3, clic: 0.4, attaque: 0.012,
                               partiels: [[1, 1, 1], [2, 0.08, 0.4]] });
            }
        },
        {
            id: "ding-cristal", nom: "Ding cristal",
            usage: "Un verre qu'on effleure, très pur",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 1760, duree: 0.28, force: 0.8,
                               partiels: [[1, 1, 1], [2.76, 0.22, 0.45], [5.4, 0.06, 0.2]] });
            }
        },
        {
            id: "ding-bois", nom: "Ding boisé",
            usage: "Court et mat, un petit coup sur du bois",
            fabriquer(ctx, s) {
                bruit(ctx, s, { duree: 0.025, freq: 1400, q: 3, gain: 0.35 });
                ding(ctx, s, { freq: 1046.5, duree: 0.11, clic: false, type: "triangle",
                               partiels: [[1, 1, 1], [3, 0.1, 0.4]] });
            }
        },
        {
            id: "ding-double", nom: "Ding double",
            usage: "Deux petites notes qui montent, vives",
            fabriquer(ctx, s) {
                // Do puis sol : une quinte, pour que la montée s'entende.
                ding(ctx, s, { freq: 1046.5, duree: 0.13, force: 0.8 });
                ding(ctx, s, { freq: 1568, debut: 0.065, duree: 0.2, force: 0.8, clic: 0.5 });
            }
        },
        {
            id: "ding-feutre", nom: "Ding feutré",
            usage: "Très discret, comme étouffé sous un tissu",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 698.5, duree: 0.2, force: 0.75, clic: 0.15, passeBas: 1100,
                               attaque: 0.012, partiels: [[1, 1, 1], [2, 0.06, 0.4]] });
            }
        },
        {
            id: "ding-perle", nom: "Ding perle",
            usage: "Minuscule et aigu, pour un petit bouton",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 2093, duree: 0.1, force: 0.7, clic: 0.6,
                               partiels: [[1, 1, 1], [2, 0.1, 0.5]] });
            }
        },
        {
            id: "ding-cloche", nom: "Ding clochette",
            usage: "Une petite clochette, qui tinte un peu plus",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 987.8, duree: 0.45, force: 0.85,
                               partiels: [[1, 1, 1], [2.0, 0.3, 0.7], [2.76, 0.18, 0.5], [5.4, 0.06, 0.25]] });
            }
        },
        {
            id: "ding-echo", nom: "Ding écho",
            usage: "Le ding, puis son écho plus faible",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 1174.7, duree: 0.18 });
                ding(ctx, s, { freq: 1174.7, debut: 0.12, duree: 0.2, force: 0.35, clic: false });
            }
        },
        {
            id: "ding-scintillant", nom: "Ding scintillant",
            usage: "Deux voix à peine décalées qui miroitent",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 1396.9, duree: 0.32, force: 0.65, desaccord: -9 });
                ding(ctx, s, { freq: 1396.9, duree: 0.32, force: 0.65, desaccord: 9, clic: false });
            }
        }
    ];

    // --- LE JOUEUR ---------------------------------------------------------
    //  Safari n'ouvre le son qu'après un geste : le contexte naît (ou se
    //  réveille) au premier toucher — ici, le bouton lui-même en est un.
    let contexte = null;
    function audio() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!contexte) { try { contexte = new Ctx(); } catch (e) { return null; } }
        if (contexte.state === "suspended") contexte.resume().catch(() => {});
        return contexte;
    }
    function volume() {
        const r = window.PARAMETRES_AUDIO || { interface: 1, general: 1 };
        const v = (Number(r.interface) || 0) * (Number(r.general) || 0);
        return Math.max(0, Math.min(1, isNaN(v) ? 0 : v));
    }

    window.SONS_FABRIQUE = SONS;

    // LE SON DES BOUTONS DU JEU, choisi par Nico dans la Fabrique : le ding
    // perle. Il remplace le bruit de parchemin (clik_bouton_aniy88.mp3) qui
    // jouait à chaque clic (jouerSonClic) et au survol des menus
    // (jouerSonSurvolParchemin, app.js). Changer de son pour tout le jeu,
    // c'est changer cette seule ligne.
    window.SON_CLIC_JEU = "ding-perle";

    // Safari et Chrome n'ouvrent le son qu'après un geste : le contexte se
    // réveille au premier toucher, pour que même un survol sonne ensuite.
    ["pointerdown", "touchend", "keydown"].forEach(ev =>
        window.addEventListener(ev, () => { audio(); }, { capture: true, passive: true }));

    // Jouer un son de la Fabrique, par son rang (1 à 10) ou son identifiant.
    // `facteur` règle le volume par-dessus les réglages du jeu (le survol des
    // menus joue à moitié, comme l'ancien bruit de parchemin).
    window.jouerSonFabrique = function (quel, facteur) {
        const son = typeof quel === "number" ? SONS[quel - 1] : SONS.find(x => x.id === quel);
        if (!son) return false;
        const v = volume() * (facteur === undefined ? 1 : Math.max(0, Number(facteur) || 0));
        if (v <= 0) return false;
        const ctx = audio();
        if (!ctx) return false;
        try {
            const sortie = ctx.createGain();
            sortie.gain.value = v;
            sortie.connect(ctx.destination);
            son.fabriquer(ctx, sortie);
            return true;
        } catch (e) {
            console.error("La Fabrique :", e);
            return false;
        }
    };

    // --- LES SONS D'ÉVÉNEMENT ----------------------------------------------
    //  À part des dix clics (ils ne s'affichent pas dans la Fabrique) : la fin
    //  d'un combat et la blessure qui tombe (blessures_ui.js).
    const SONS_EVENEMENTS = {
        // Un gong grave qui résonne longtemps : des partiels inharmoniques,
        // un battement lent, une queue de quatre secondes.
        "gong-blessure"(ctx, s) {
            bruit(ctx, s, { duree: 0.06, freq: 300, q: 1.2, gain: 0.5 });
            [[1, 1, 1], [1.48, 0.55, 0.8], [2.09, 0.4, 0.6], [2.76, 0.22, 0.45], [3.9, 0.1, 0.3]].forEach(([k, part, tenue]) => {
                note(ctx, s, { freq: 82 * k, duree: 4.2 * tenue, gain: 0.32 * part, attaque: 0.01, type: "sine" });
                note(ctx, s, { freq: 82 * k, duree: 4.2 * tenue, gain: 0.16 * part, attaque: 0.02, type: "sine", desaccord: 7 });
            });
            note(ctx, s, { freq: 41, duree: 2.5, gain: 0.25, attaque: 0.02, type: "triangle", passeBas: 200 });
        },
        // La victoire : trois notes qui montent, claires.
        "victoire"(ctx, s) {
            [[523.3, 0], [659.3, 0.16], [784, 0.32], [1046.5, 0.5]].forEach(([f, d], i) =>
                ding(ctx, s, { freq: f, debut: d, duree: i === 3 ? 1.4 : 0.5, force: 1.1, type: "triangle",
                               partiels: [[1, 1, 1], [2, 0.25, 0.6], [3, 0.1, 0.4]] }));
        },
        // La défaite : deux notes graves qui descendent, étouffées.
        "defaite"(ctx, s) {
            ding(ctx, s, { freq: 220, duree: 1.2, force: 1.3, clic: false, passeBas: 900, type: "triangle" });
            ding(ctx, s, { freq: 164.8, debut: 0.45, duree: 2.6, force: 1.4, clic: false, passeBas: 700, type: "triangle",
                           partiels: [[1, 1, 1], [1.5, 0.3, 0.7], [2, 0.15, 0.5]] });
        }
    };
    window.SONS_EVENEMENTS = SONS_EVENEMENTS;
    window.jouerSonEvenement = function (id, facteur) {
        const fabriquer = SONS_EVENEMENTS[id];
        if (!fabriquer) return false;
        const v = volume() * (facteur === undefined ? 1 : Math.max(0, Number(facteur) || 0));
        if (v <= 0) return false;
        const ctx = audio();
        if (!ctx) return false;
        try {
            const sortie = ctx.createGain();
            sortie.gain.value = v;
            sortie.connect(ctx.destination);
            fabriquer(ctx, sortie);
            return true;
        } catch (e) {
            console.error("La Fabrique (événement) :", e);
            return false;
        }
    };

    // --- L'ÉCRAN ---------------------------------------------------------
    //  Les dix boutons sont construits ici, à partir de la liste : ajouter un
    //  son, c'est ajouter une entrée à SONS, rien d'autre.
    window.rendreFabrique = function () {
        const grille = document.getElementById("grille-fabrique");
        if (!grille) return;
        grille.innerHTML = "";
        SONS.forEach((son, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn-parametres btn-fabrique";
            b.dataset.son = son.id;
            b.innerHTML = `<span class="fabrique-numero">${i + 1}</span>`
                + `<span class="fabrique-nom">${son.nom}</span>`
                + `<span class="fabrique-usage">${son.usage}</span>`;
            b.addEventListener("click", () => {
                window.jouerSonFabrique(i + 1);
                b.classList.remove("fabrique-joue");
                void b.offsetWidth;
                b.classList.add("fabrique-joue");
            });
            grille.appendChild(b);
        });
        const muet = document.getElementById("fabrique-muet");
        if (muet) muet.style.display = volume() <= 0 ? "block" : "none";
    };

    window.ouvrirFabrique = function () {
        window.rendreFabrique();
        if (typeof window.naviguerFenetre === "function") {
            window.naviguerFenetre("etape-menu-parametres", "etape-fabrique");
        }
    };
})();
