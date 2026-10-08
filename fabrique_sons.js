// =========================================================================
//  IVALIS — LA FABRIQUE (Paramètres → La Fabrique)
// =========================================================================
//  Dix sons d'interface, fabriqués sur place avec Web Audio : aucun fichier
//  à héberger, aucun réseau. Doux et légers — goutte, plume, bulle, verre,
//  écho, carillon, harpe, pétale, brume, pluie de notes —, certains
//  s'effacent par paliers. On les écoute ici avant d'en choisir un pour les
//  boutons du jeu (aujourd'hui le ding perle, gardé à part dans SONS_JEU).
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

    // --- LES DIX SONS DE LA FABRIQUE ---------------------------------------
    //  Nico : « remplace les sons existants par dix autres, plus doux et
    //  légers ; certains qui s'effacent en graduation. » Pas de souffle
    //  d'attaque (le petit « tac » des dings) : chaque son monte en douceur,
    //  reste discret, et quatre d'entre eux s'éteignent par paliers — un écho,
    //  un carillon, une pluie de notes, une cascade.
    //  `doux` : une note tendre, sinusoïdale, à l'attaque lente et filtrée.
    function doux(ctx, s, o) {
        const debut = o.debut || 0;
        (o.partiels || [[1, 1, 1], [2, 0.12, 0.5]]).forEach(([k, part, tenue]) => {
            note(ctx, s, { freq: o.freq * k, debut, duree: (o.duree || 0.3) * tenue, gain: (o.gain || 0.1) * part,
                           type: o.type || "sine", attaque: o.attaque || 0.014, glisse: o.glisse ? o.glisse * k : undefined,
                           desaccord: o.desaccord || 0, passeBas: o.passeBas || 2600 });
        });
    }
    // Une même note reprise plusieurs fois, chaque fois plus bas : l'effacement
    // par paliers. `pas` : l'écart entre deux reprises ; `chute` : ce qu'il
    // reste du volume à chaque palier.
    function paliers(ctx, s, o) {
        (o.notes || Array(o.fois || 4).fill(o.freq)).forEach((f, i) => {
            doux(ctx, s, { ...o, freq: f, debut: (o.debut || 0) + i * o.pas, gain: (o.gain || 0.1) * Math.pow(o.chute || 0.55, i) });
        });
    }

    const SONS = [
        {
            id: "goutte-rosee", nom: "Goutte de rosée",
            usage: "Une goutte qui tombe, toute ronde, et glisse un peu vers le bas",
            fabriquer(ctx, s) { doux(ctx, s, { freq: 1175, glisse: 1046, duree: 0.26, gain: 0.12, attaque: 0.008 }); }
        },
        {
            id: "plume", nom: "Plume",
            usage: "Presque rien : une note feutrée qui se pose",
            fabriquer(ctx, s) {
                doux(ctx, s, { freq: 784, duree: 0.24, gain: 0.1, attaque: 0.02, type: "triangle", passeBas: 1500,
                               partiels: [[1, 1, 1]] });
            }
        },
        {
            id: "bulle", nom: "Bulle",
            usage: "Une petite bulle qui remonte, légère",
            fabriquer(ctx, s) { doux(ctx, s, { freq: 520, glisse: 820, duree: 0.17, gain: 0.12, attaque: 0.012 }); }
        },
        {
            id: "souffle-verre", nom: "Souffle de verre",
            usage: "Un verre effleuré qui s'éteint lentement",
            fabriquer(ctx, s) {
                doux(ctx, s, { freq: 1568, duree: 1.4, gain: 0.08, attaque: 0.02,
                               partiels: [[1, 1, 1], [2.76, 0.12, 0.35]] });
            }
        },
        {
            id: "echo-efface", nom: "Écho qui s'efface",
            usage: "Une note, puis son écho, de plus en plus loin",
            fabriquer(ctx, s) { paliers(ctx, s, { freq: 988, fois: 5, pas: 0.12, chute: 0.5, duree: 0.2, gain: 0.11 }); }
        },
        {
            id: "carillon-lointain", nom: "Carillon lointain",
            usage: "Trois clochettes qui descendent et s'éloignent",
            fabriquer(ctx, s) {
                paliers(ctx, s, { notes: [1319, 1175, 988, 880], pas: 0.11, chute: 0.6, duree: 0.32, gain: 0.09,
                                  partiels: [[1, 1, 1], [2.0, 0.15, 0.5]] });
            }
        },
        {
            id: "harpe-feutree", nom: "Harpe feutrée",
            usage: "Une corde pincée du bout du doigt",
            fabriquer(ctx, s) {
                doux(ctx, s, { freq: 659, duree: 0.5, gain: 0.12, attaque: 0.006, type: "triangle", passeBas: 1200,
                               partiels: [[1, 1, 1], [2, 0.2, 0.4], [3, 0.06, 0.25]] });
            }
        },
        {
            id: "petale", nom: "Pétale",
            usage: "Deux notes tendres ensemble, comme un accord murmuré",
            fabriquer(ctx, s) {
                doux(ctx, s, { freq: 880, duree: 0.4, gain: 0.07, attaque: 0.025, partiels: [[1, 1, 1]] });
                doux(ctx, s, { freq: 1109, duree: 0.4, gain: 0.06, attaque: 0.03, partiels: [[1, 1, 1]] });
            }
        },
        {
            id: "brume", nom: "Brume",
            usage: "Une nappe très douce qui monte puis se dissout",
            fabriquer(ctx, s) {
                doux(ctx, s, { freq: 698.5, duree: 1.5, gain: 0.07, attaque: 0.05, desaccord: -6, partiels: [[1, 1, 1]] });
                doux(ctx, s, { freq: 698.5, duree: 1.5, gain: 0.07, attaque: 0.05, desaccord: 6, partiels: [[1, 1, 1]] });
            }
        },
        {
            id: "pluie-notes", nom: "Pluie de notes",
            usage: "Une cascade qui monte et s'efface note après note",
            fabriquer(ctx, s) {
                paliers(ctx, s, { notes: [784, 988, 1175, 1319, 1568], pas: 0.07, chute: 0.62, duree: 0.24, gain: 0.1,
                                  partiels: [[1, 1, 1]] });
            }
        }
    ];

    // LE SON DES BOUTONS DU JEU vit à part (SONS_JEU) : la Fabrique peut
    // changer ses dix sons sans couper la voix des boutons. Le ding perle,
    // choisi par Nico, reste celui du jeu tant qu'il n'en choisit pas un autre.
    const SONS_JEU = [
        {
            id: "ding-perle", nom: "Ding perle",
            usage: "Minuscule et aigu, pour un petit bouton",
            fabriquer(ctx, s) {
                ding(ctx, s, { freq: 2093, duree: 0.1, force: 0.7, clic: 0.6,
                               partiels: [[1, 1, 1], [2, 0.1, 0.5]] });
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
        const son = typeof quel === "number" ? SONS[quel - 1]
            : (SONS.find(x => x.id === quel) || SONS_JEU.find(x => x.id === quel));
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
