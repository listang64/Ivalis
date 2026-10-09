// =========================================================================
//  IVALIS — LA FABRIQUE (Paramètres → La Fabrique)
// =========================================================================
//  Dix sons d'interface, fabriqués sur place avec Web Audio : aucun fichier
//  à héberger, aucun réseau. Sobres, à la manière des bruits d'Apple — tic,
//  tac, bascule, pop, goutte, tinte, verre, validation, retour, envoi : très
//  courts, très propres, rien qui traîne. On les écoute ici ; celui des
//  menus du jeu est la Goutte (SON_CLIC_JEU).
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

    // --- DIX SONS SOBRES, À LA MANIÈRE DES BRUITS D'APPLE ------------------
    //  Nico : « les sons de la Fabrique, ça ne va pas ; j'aimerais quelque
    //  chose de plus sobre, un peu comme les bruits Apple ». Ce qui fait ces
    //  sons-là : très courts, très propres, une attaque nette sans jamais être
    //  agressive, une seule idée par son (un tic, un pop, un verre), et rien
    //  qui traîne — ni écho, ni nappe, ni cascade. Trois matières :
    //    • le clic : un souffle de quelques millisecondes posé sur une note
    //      très brève — c'est lui qui donne le « toucher » ;
    //    • la note qui glisse : un pop qui retombe, une goutte qui remonte ;
    //    • la cloche FM : une note dont l'éclat (la modulation) s'éteint bien
    //      avant elle — le timbre « verre poli » des interfaces.

    // Un clic : un souffle de quelques millisecondes, et un corps très bref.
    function clic(ctx, s, o) {
        bruit(ctx, s, { debut: o.debut, duree: o.dureeSouffle || 0.012, filtre: "bandpass",
                        freq: o.souffle || 3500, q: o.q || 1.2, gain: o.gainSouffle || 0.15 });
        if (o.corps) note(ctx, s, { debut: o.debut, freq: o.corps, glisse: o.glisse, duree: o.duree || 0.03,
                                    gain: o.gain || 0.08, attaque: 0.001 });
    }
    // Une cloche FM : une porteuse, et une modulante dont l'indice (l'éclat,
    // les harmoniques) retombe en `eclat` secondes, bien avant la note.
    function clocheFM(ctx, s, o) {
        const t = ctx.currentTime + (o.debut || 0);
        const duree = o.duree || 0.4;
        const porteuse = ctx.createOscillator();
        const modulante = ctx.createOscillator();
        const indice = ctx.createGain();
        const g = ctx.createGain();
        const fm = o.freq * (o.rapport || 2);
        porteuse.frequency.setValueAtTime(o.freq, t);
        modulante.frequency.setValueAtTime(fm, t);
        indice.gain.setValueAtTime(fm * (o.indice || 1), t);
        indice.gain.exponentialRampToValueAtTime(Math.max(0.5, fm * (o.indice || 1) * 0.01), t + (o.eclat || duree * 0.3));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.gain || 0.1, t + (o.attaque || 0.002));
        g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
        modulante.connect(indice).connect(porteuse.frequency);
        porteuse.connect(g).connect(s);
        porteuse.start(t); modulante.start(t);
        porteuse.stop(t + duree + 0.03); modulante.stop(t + duree + 0.03);
    }

    const SONS = [
        {
            id: "tic", nom: "Tic",
            usage: "Le tic d'une touche de clavier : à peine là, pour taper ou cocher",
            fabriquer(ctx, s) {
                clic(ctx, s, { souffle: 5000, q: 1.4, dureeSouffle: 0.014, gainSouffle: 0.16,
                               corps: 2200, duree: 0.022, gain: 0.05 });
            }
        },
        {
            id: "tac", nom: "Tac",
            usage: "Un petit coup de bois, mat et rond, pour un bouton",
            fabriquer(ctx, s) {
                note(ctx, s, { freq: 560, glisse: 440, duree: 0.09, gain: 0.2, attaque: 0.0015 });
                note(ctx, s, { freq: 1680, duree: 0.035, gain: 0.035, attaque: 0.001 });
                bruit(ctx, s, { duree: 0.008, filtre: "lowpass", freq: 2500, q: 0.7, gain: 0.12 });
            }
        },
        {
            id: "bascule", nom: "Bascule",
            usage: "Un interrupteur qui s'enclenche : deux clics serrés, pour un oui / non",
            fabriquer(ctx, s) {
                clic(ctx, s, { souffle: 2600, q: 1.6, dureeSouffle: 0.01, gainSouffle: 0.13, corps: 950, duree: 0.02, gain: 0.05 });
                clic(ctx, s, { debut: 0.05, souffle: 3800, q: 1.6, dureeSouffle: 0.009, gainSouffle: 0.09,
                               corps: 1400, duree: 0.018, gain: 0.035 });
            }
        },
        {
            id: "pop", nom: "Pop",
            usage: "Une bulle qui éclate, ronde et brève, pour ouvrir une fenêtre",
            fabriquer(ctx, s) { note(ctx, s, { freq: 1100, glisse: 300, duree: 0.07, gain: 0.22, attaque: 0.0015, passeBas: 3000 }); }
        },
        {
            id: "goutte", nom: "Goutte",
            usage: "Un « plic » qui remonte, comme une goutte d'eau, pour une petite réussite",
            fabriquer(ctx, s) { note(ctx, s, { freq: 1250, glisse: 2300, duree: 0.06, gain: 0.16, attaque: 0.002 }); }
        },
        {
            id: "tinte", nom: "Tinte",
            usage: "Un tintement de métal, net et court, pour une alerte discrète",
            fabriquer(ctx, s) {
                note(ctx, s, { freq: 2349, duree: 0.16, gain: 0.09, attaque: 0.001 });
                note(ctx, s, { freq: 2349 * 2.76, duree: 0.05, gain: 0.022, attaque: 0.001 });
                note(ctx, s, { freq: 2349 * 0.5, duree: 0.06, gain: 0.03, attaque: 0.001 });
            }
        },
        {
            id: "verre", nom: "Verre",
            usage: "Un verre effleuré d'un ongle : clair, poli, il sonne un instant",
            fabriquer(ctx, s) { clocheFM(ctx, s, { freq: 1760, rapport: 2, indice: 1.1, eclat: 0.1, duree: 0.7, gain: 0.1 }); }
        },
        {
            id: "validation", nom: "Validation",
            usage: "Deux notes qui montent : c'est fait, c'est bon",
            fabriquer(ctx, s) {
                clocheFM(ctx, s, { freq: 1046.5, rapport: 2, indice: 0.8, eclat: 0.06, duree: 0.24, gain: 0.085 });
                clocheFM(ctx, s, { debut: 0.085, freq: 1568, rapport: 2, indice: 0.8, eclat: 0.08, duree: 0.48, gain: 0.095 });
            }
        },
        {
            id: "retour", nom: "Retour",
            usage: "Deux notes qui redescendent, à mi-voix : on referme, on revient",
            fabriquer(ctx, s) {
                clocheFM(ctx, s, { freq: 1318.5, rapport: 2, indice: 0.5, eclat: 0.05, duree: 0.16, gain: 0.07 });
                clocheFM(ctx, s, { debut: 0.075, freq: 987.8, rapport: 2, indice: 0.5, eclat: 0.06, duree: 0.28, gain: 0.07 });
            }
        },
        {
            id: "envoi", nom: "Envoi",
            usage: "Un souffle qui file vers l'aigu : un message qui part",
            fabriquer(ctx, s) {
                bruit(ctx, s, { duree: 0.3, filtre: "bandpass", q: 1.8, balayage: [900, 5500], gain: 0.25, forme: "cloche" });
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

    // LE SON DES MENUS, choisi par Nico dans la Fabrique : la Goutte (« ok,
    // remplace tous les sons menu par la goutte »). Elle joue à chaque clic de
    // bouton (jouerSonClic) et, à mi-volume, au survol des menus et à
    // l'ouverture du chat ou du combat (jouerSonSurvolParchemin, app.js).
    // Avant elle : le ding perle, et avant encore le bruit de parchemin
    // (clik_bouton_aniy88.mp3). Changer de son pour tout le jeu, c'est changer
    // cette seule ligne.
    window.SON_CLIC_JEU = "goutte";

    // Safari et Chrome n'ouvrent le son qu'après un geste : le contexte se
    // réveille au premier toucher, pour que même un survol sonne ensuite.
    ["pointerdown", "touchend", "keydown"].forEach(ev =>
        window.addEventListener(ev, () => { audio(); }, { capture: true, passive: true }));

    // Jouer un son de la Fabrique, par son rang (1 à 10) ou son identifiant.
    // `facteur` règle le volume par-dessus les réglages du jeu (le survol des
    // menus joue à moitié, comme l'ancien bruit de parchemin).
    window.jouerSonFabrique = function (quel, facteur) {
        const son = typeof quel === "number" ? SONS[quel - 1]
            : SONS.find(x => x.id === quel);
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
    // Jouer une fabrication au volume du jeu (« Interface » × « Général »).
    function jouerFabrication(fabriquer, facteur, quoi) {
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
            console.error("La Fabrique (" + quoi + ") :", e);
            return false;
        }
    }
    window.jouerSonEvenement = function (id, facteur) {
        const fabriquer = SONS_EVENEMENTS[id];
        return fabriquer ? jouerFabrication(fabriquer, facteur, "événement") : false;
    };

    // --- LES SONS DES ANIMATIONS DE COMBAT ----------------------------------
    //  Joués par animations_combat.js, au moment exact où l'animation les
    //  demande : le souffle de la lame à l'élan, l'impact au contact, le feu
    //  qui part puis qui explose. Brefs, et sous le volume des clics.
    const SONS_COMBAT = {
        // Une lame qui fend l'air : un souffle filtré qui balaie vers l'aigu.
        "lame-souffle"(ctx, s) { bruit(ctx, s, { duree: 0.24, filtre: "bandpass", q: 1.4, balayage: [500, 3200], gain: 0.45, forme: "cloche" }); },
        // L'acier qui mord : un claquement, deux harmoniques métalliques, un coup sourd.
        "lame-impact"(ctx, s) {
            bruit(ctx, s, { duree: 0.04, freq: 3200, q: 1.5, gain: 0.5 });
            note(ctx, s, { freq: 1870, duree: 0.28, gain: 0.07, type: "triangle", attaque: 0.002 });
            note(ctx, s, { freq: 2790, duree: 0.18, gain: 0.04, type: "triangle", attaque: 0.002 });
            note(ctx, s, { freq: 140, glisse: 70, duree: 0.16, gain: 0.3, attaque: 0.003 });
        },
        // Un coup encaissé : un choc grave et mat.
        "coup-sourd"(ctx, s) {
            note(ctx, s, { freq: 110, glisse: 48, duree: 0.28, gain: 0.5, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.09, filtre: "lowpass", freq: 700, q: 0.7, gain: 0.5 });
        },
        // Un soin : un arpège clair qui monte, puis un scintillement.
        "soin"(ctx, s) {
            [659, 880, 1109, 1319].forEach((f, i) => note(ctx, s, { freq: f, debut: i * 0.09, duree: 0.6, gain: 0.07, attaque: 0.02 }));
            note(ctx, s, { freq: 2637, debut: 0.36, duree: 0.7, gain: 0.025, attaque: 0.04 });
        },
        // Un bouclier : un bourdon cristallin qui ondule, puis s'éteint.
        "bouclier"(ctx, s) {
            note(ctx, s, { freq: 523, duree: 1.4, gain: 0.08, attaque: 0.08 });
            note(ctx, s, { freq: 523, duree: 1.4, gain: 0.08, attaque: 0.08, desaccord: 14 });
            note(ctx, s, { freq: 1568, duree: 0.9, gain: 0.025, attaque: 0.06 });
            bruit(ctx, s, { duree: 0.5, filtre: "highpass", freq: 6000, q: 0.5, gain: 0.05, forme: "cloche" });
        },
        // Le feu qui part : un souffle grave qui enfle, et des crépitements.
        "feu-lancer"(ctx, s) {
            bruit(ctx, s, { duree: 0.55, filtre: "bandpass", q: 0.9, balayage: [250, 1300], gain: 0.4, forme: "cloche" });
            for (let i = 0; i < 6; i++) bruit(ctx, s, { debut: 0.08 + i * 0.07, duree: 0.015, freq: 2600, q: 3, gain: 0.25 });
        },
        // L'explosion : un grondement qui retombe, un souffle qui se ferme.
        "feu-explosion"(ctx, s) {
            bruit(ctx, s, { duree: 0.7, filtre: "lowpass", q: 0.7, balayage: [2400, 160], gain: 0.7 });
            note(ctx, s, { freq: 80, glisse: 38, duree: 0.6, gain: 0.45, attaque: 0.004 });
        },
        // Une esquive : un sifflement bref qui retombe.
        "esquive"(ctx, s) { bruit(ctx, s, { duree: 0.2, filtre: "bandpass", q: 2, balayage: [2800, 700], gain: 0.4, forme: "cloche" }); },
        // Le givre qui se forme : un tintement de verre et un froissement aigu.
        "gel-lancer"(ctx, s) {
            [2093, 2637, 3136].forEach((f, i) => note(ctx, s, { freq: f, debut: i * 0.05, duree: 0.3, gain: 0.035, attaque: 0.005 }));
            bruit(ctx, s, { duree: 0.35, filtre: "highpass", freq: 5000, q: 0.6, gain: 0.12, forme: "cloche" });
        },
        // La glace qui saisit : des éclats de cristal et un craquement.
        "glace-impact"(ctx, s) {
            bruit(ctx, s, { duree: 0.08, filtre: "highpass", freq: 3500, q: 0.8, gain: 0.35 });
            [3520, 2960, 3950, 2490, 4430].forEach((f, i) => note(ctx, s, { freq: f, debut: i * 0.035, duree: 0.22, gain: 0.03, attaque: 0.002, type: "triangle" }));
        },
        // La fiole qui part : un « fouit » qui monte.
        "poison-lancer"(ctx, s) {
            bruit(ctx, s, { duree: 0.18, filtre: "bandpass", q: 2.5, balayage: [600, 1800], gain: 0.3, forme: "cloche" });
            note(ctx, s, { freq: 300, glisse: 620, duree: 0.2, gain: 0.08, attaque: 0.01 });
        },
        // Les bulles toxiques : de petits éclatements qui montent.
        "poison-bulles"(ctx, s) {
            [0, 0.12, 0.2, 0.34, 0.45, 0.6, 0.72].forEach((t, i) =>
                note(ctx, s, { freq: 380 + (i % 3) * 140, glisse: 700 + (i % 3) * 200, debut: t, duree: 0.07, gain: 0.1, attaque: 0.004 }));
        },
        // Le critique qui se prépare : un son qui monte, plein d'or.
        "critique-charge"(ctx, s) {
            note(ctx, s, { freq: 392, glisse: 1175, duree: 0.38, gain: 0.08, attaque: 0.02, type: "triangle" });
            note(ctx, s, { freq: 784, glisse: 2349, duree: 0.38, gain: 0.03, attaque: 0.02 });
        },
        // Le critique qui frappe : un choc lourd et une cloche éclatante.
        "critique-impact"(ctx, s) {
            note(ctx, s, { freq: 90, glisse: 40, duree: 0.45, gain: 0.55, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.06, freq: 2500, q: 1, gain: 0.5 });
            [1568, 2093, 3136].forEach((f, i) => note(ctx, s, { freq: f, debut: 0.01, duree: 0.7 - i * 0.15, gain: 0.06 - i * 0.015, attaque: 0.003 }));
        },
        // La chute : un choc mat, puis une note qui s'effondre.
        "chute"(ctx, s) {
            note(ctx, s, { freq: 70, duree: 0.3, gain: 0.45, attaque: 0.004 });
            bruit(ctx, s, { duree: 0.12, filtre: "lowpass", freq: 500, q: 0.7, gain: 0.45 });
            note(ctx, s, { freq: 330, glisse: 82, debut: 0.05, duree: 0.7, gain: 0.06, attaque: 0.02, type: "triangle" });
        }
    };
    // --- LES SONS DU CATALOGUE COMPLET (animations_catalogue.js) ------------
    //  Trois petites matières de plus : la crépitation (de minuscules
    //  claquements au hasard : feu, électricité, gravats), les bulles (de
    //  petites notes qui remontent), et les tintements (des éclats de verre ou
    //  de cristal, aigus et brefs).
    const au = (a, b) => a + Math.random() * (b - a);
    function crepiter(ctx, s, o) {
        for (let i = 0; i < (o.n || 10); i++) {
            bruit(ctx, s, { debut: (o.debut || 0) + au(0, o.duree || 0.6), duree: au(0.006, 0.02), filtre: o.filtre || "highpass",
                            freq: au(o.fmin || 1800, o.fmax || 4000), q: 1, gain: au(0.4, 1) * (o.gain || 0.25) });
        }
    }
    function bulles(ctx, s, o) {
        for (let i = 0; i < (o.n || 8); i++) {
            const f = au(o.fmin || 300, o.fmax || 700);
            note(ctx, s, { debut: (o.debut || 0) + au(0, o.duree || 0.7), freq: f, glisse: f * au(1.5, 2.2), duree: au(0.05, 0.09),
                           gain: o.gain || 0.08, attaque: 0.004 });
        }
    }
    function tintements(ctx, s, o) {
        for (let i = 0; i < (o.n || 6); i++) {
            note(ctx, s, { debut: (o.debut || 0) + i * (o.pas || 0.035) + au(0, 0.015), freq: au(o.fmin || 2500, o.fmax || 5000),
                           duree: au(0.12, o.tenue || 0.3), gain: o.gain || 0.03, attaque: 0.002, type: "triangle" });
        }
    }
    function pas(ctx, s, o) {
        const d = o.debut || 0;
        bruit(ctx, s, { debut: d, duree: o.duree || 0.07, filtre: "lowpass", freq: o.grain || 650, q: 0.7, gain: o.gain || 0.3 });
        note(ctx, s, { debut: d, freq: o.corps || 95, glisse: (o.corps || 95) * 0.7, duree: (o.duree || 0.07) * 1.2, gain: (o.gain || 0.3) * 0.6, attaque: 0.003 });
    }
    function souffle(ctx, s, o) {
        bruit(ctx, s, { debut: o.debut || 0, duree: o.duree || 0.3, filtre: "bandpass", q: o.q || 1.4, balayage: o.balayage,
                        gain: o.gain || 0.3, forme: "cloche" });
    }
    Object.assign(SONS_COMBAT, {
        // — DÉPLACEMENTS —
        "pas"(ctx, s) { pas(ctx, s, {}); },
        "pas-lourd"(ctx, s) {
            pas(ctx, s, { duree: 0.13, grain: 380, corps: 62, gain: 0.42 });
            bruit(ctx, s, { debut: 0.02, duree: 0.09, freq: 2500, q: 0.8, gain: 0.07 });
        },
        "pas-givre"(ctx, s) {
            pas(ctx, s, { duree: 0.06, gain: 0.22 });
            for (let i = 0; i < 5; i++) bruit(ctx, s, { debut: i * 0.013, duree: 0.012, filtre: "highpass", freq: 3200, q: 0.8, gain: 0.18 });
            note(ctx, s, { debut: 0.02, freq: 2637, duree: 0.09, gain: 0.02, attaque: 0.002, type: "triangle" });
        },
        "pas-leger"(ctx, s) { pas(ctx, s, { duree: 0.045, grain: 1500, corps: 160, gain: 0.18 }); },
        // UN PAS SUR UN SOL D'HERBE ET DE TERRE (Nico : « un bruit de pas sur un
        // sol herbeux, terre plutôt ») : la terre qui reçoit le pied, mate et
        // feutrée, l'herbe froissée par-dessus, et quelques brins qui craquent.
        "pas-herbe"(ctx, s) {
            bruit(ctx, s, { duree: 0.09, filtre: "lowpass", freq: 320, q: 0.6, gain: 0.34 });
            note(ctx, s, { freq: 88, glisse: 60, duree: 0.08, gain: 0.12, attaque: 0.004 });
            bruit(ctx, s, { debut: 0.005, duree: 0.14, filtre: "bandpass", freq: 2600, q: 0.9, gain: 0.1, forme: "cloche" });
            for (let i = 0; i < 4; i++) bruit(ctx, s, { debut: au(0.01, 0.1), duree: au(0.004, 0.01), filtre: "highpass", freq: au(3500, 5500), q: 1, gain: au(0.04, 0.08) });
        },
        // UN PAS SUR LA GLACE (Nico : « un craquement de glace ») : le pied qui
        // pèse, la croûte qui cède d'un coup sec, puis les fêlures qui
        // courent, et le grincement du gel.
        "pas-glace"(ctx, s) {
            bruit(ctx, s, { duree: 0.07, filtre: "lowpass", freq: 420, q: 0.6, gain: 0.22 });
            bruit(ctx, s, { debut: 0.01, duree: 0.025, filtre: "highpass", freq: 2200, q: 0.8, gain: 0.3 });
            let t = 0.02;
            for (let i = 0; i < 6; i++) {
                bruit(ctx, s, { debut: t, duree: au(0.006, 0.014), filtre: "bandpass", freq: au(1400, 4200), q: 2, gain: au(0.12, 0.22) });
                t += au(0.012, 0.026);
            }
            note(ctx, s, { debut: 0.015, freq: 1300, glisse: 760, duree: 0.12, gain: 0.025, attaque: 0.002, type: "triangle" });
        },
        "course"(ctx, s) { for (let i = 0; i < 4; i++) pas(ctx, s, { debut: i * 0.09, duree: 0.045, grain: 1300, corps: 150, gain: 0.2 }); },
        "bond-envol"(ctx, s) {
            souffle(ctx, s, { duree: 0.3, balayage: [400, 1800], gain: 0.3 });
            note(ctx, s, { freq: 180, glisse: 260, duree: 0.22, gain: 0.06, attaque: 0.02 });
        },
        "reception"(ctx, s) {
            note(ctx, s, { freq: 75, glisse: 45, duree: 0.26, gain: 0.42, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.12, filtre: "lowpass", freq: 500, q: 0.7, gain: 0.42 });
        },
        "repli"(ctx, s) {
            souffle(ctx, s, { duree: 0.3, balayage: [2400, 500], gain: 0.32 });
            note(ctx, s, { freq: 520, glisse: 300, duree: 0.25, gain: 0.04, attaque: 0.02 });
        },
        "apparition"(ctx, s) {
            bruit(ctx, s, { duree: 0.4, filtre: "highpass", freq: 4000, q: 0.6, gain: 0.12, forme: "cloche" });
            clocheFM(ctx, s, { freq: 880, rapport: 1.5, indice: 1.5, eclat: 0.2, duree: 0.6, gain: 0.07 });
            note(ctx, s, { freq: 220, glisse: 440, duree: 0.3, gain: 0.06, attaque: 0.02 });
        },
        "illusion"(ctx, s) {
            [1318, 1661, 1976].forEach((f, i) => clocheFM(ctx, s, { debut: i * 0.06, freq: f, rapport: 3.5, indice: 0.7, eclat: 0.3, duree: 0.9, gain: 0.045 }));
            bruit(ctx, s, { duree: 0.7, filtre: "highpass", freq: 6000, q: 0.5, gain: 0.05, forme: "cloche" });
        },
        "deploiement"(ctx, s) {
            pas(ctx, s, { duree: 0.12, grain: 500, corps: 70, gain: 0.35 });
            pas(ctx, s, { debut: 0.18, duree: 0.12, grain: 500, corps: 80, gain: 0.3 });
            ding(ctx, s, { freq: 784, debut: 0.36, duree: 0.5, force: 0.6, clic: false });
        },
        "saignement"(ctx, s) {
            note(ctx, s, { freq: 900, glisse: 1500, duree: 0.05, gain: 0.1, attaque: 0.003 });
            note(ctx, s, { debut: 0.18, freq: 700, glisse: 1100, duree: 0.05, gain: 0.07, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.06, filtre: "lowpass", freq: 800, q: 0.7, gain: 0.15 });
        },
        // — ATTAQUES —
        "dague"(ctx, s) {
            souffle(ctx, s, { duree: 0.12, balayage: [1200, 5000], gain: 0.32 });
            note(ctx, s, { debut: 0.1, freq: 4000, duree: 0.03, gain: 0.04, attaque: 0.001 });
        },
        "lourd-elan"(ctx, s) {
            souffle(ctx, s, { duree: 0.45, balayage: [200, 900], q: 1, gain: 0.42 });
            note(ctx, s, { freq: 70, glisse: 110, duree: 0.4, gain: 0.12, attaque: 0.05 });
        },
        "lourd-impact"(ctx, s) {
            note(ctx, s, { freq: 60, glisse: 35, duree: 0.5, gain: 0.45, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.4, filtre: "lowpass", q: 0.7, balayage: [1800, 150], gain: 0.42 });
            note(ctx, s, { freq: 1240, duree: 0.4, gain: 0.05, type: "triangle", attaque: 0.002 });
            note(ctx, s, { freq: 1860, duree: 0.3, gain: 0.03, type: "triangle", attaque: 0.002 });
        },
        "tir"(ctx, s) {
            note(ctx, s, { freq: 220, glisse: 180, duree: 0.25, gain: 0.18, type: "triangle", attaque: 0.002 });
            note(ctx, s, { freq: 440, duree: 0.12, gain: 0.05, attaque: 0.002 });
            souffle(ctx, s, { debut: 0.03, duree: 0.25, balayage: [3000, 1200], q: 2, gain: 0.18 });
        },
        "fleche-impact"(ctx, s) {
            note(ctx, s, { freq: 180, glisse: 110, duree: 0.12, gain: 0.32, attaque: 0.002 });
            bruit(ctx, s, { duree: 0.05, freq: 1200, q: 2, gain: 0.32 });
            note(ctx, s, { debut: 0.02, freq: 330, duree: 0.22, gain: 0.04, type: "triangle", desaccord: 30 });
        },
        "foudre"(ctx, s) {
            bruit(ctx, s, { duree: 0.05, filtre: "highpass", freq: 2000, q: 0.7, gain: 0.36 });
            bruit(ctx, s, { duree: 0.35, filtre: "bandpass", q: 0.9, balayage: [6000, 400], gain: 0.28 });
            note(ctx, s, { freq: 110, duree: 0.4, gain: 0.05, type: "sawtooth", passeBas: 1500 });
            note(ctx, s, { freq: 50, duree: 0.6, gain: 0.22, attaque: 0.01 });
            crepiter(ctx, s, { n: 8, duree: 0.35, gain: 0.2 });
        },
        "givre-rayon"(ctx, s) {
            bruit(ctx, s, { duree: 0.7, filtre: "highpass", freq: 3500, q: 0.6, gain: 0.16, forme: "cloche" });
            tintements(ctx, s, { n: 5, fmin: 2000, fmax: 3300, pas: 0.09, gain: 0.025 });
            note(ctx, s, { freq: 1046, duree: 0.6, gain: 0.035, attaque: 0.05 });
        },
        "mots"(ctx, s) {
            note(ctx, s, { freq: 110, duree: 0.6, gain: 0.1, type: "sawtooth", passeBas: 900, attaque: 0.04 });
            note(ctx, s, { freq: 165, duree: 0.55, gain: 0.06, type: "sawtooth", passeBas: 1100, attaque: 0.05 });
            note(ctx, s, { debut: 0.15, freq: 55, glisse: 38, duree: 0.5, gain: 0.35, attaque: 0.004 });
            bruit(ctx, s, { debut: 0.15, duree: 0.3, filtre: "lowpass", freq: 300, q: 0.7, gain: 0.3 });
        },
        "lumiere"(ctx, s) {
            [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(ctx, s, { debut: i * 0.03, freq: f, duree: 0.9, gain: 0.04, attaque: 0.05 }));
            bruit(ctx, s, { duree: 0.6, filtre: "highpass", freq: 7000, q: 0.5, gain: 0.06, forme: "cloche" });
        },
        "zone-explosion"(ctx, s) {
            bruit(ctx, s, { duree: 1.0, filtre: "lowpass", q: 0.7, balayage: [3000, 120], gain: 0.55 });
            note(ctx, s, { freq: 55, glisse: 30, duree: 0.9, gain: 0.4, attaque: 0.004 });
            crepiter(ctx, s, { debut: 0.05, n: 8, duree: 0.6, gain: 0.18 });
        },
        "marque"(ctx, s) {
            note(ctx, s, { freq: 196, duree: 0.6, gain: 0.1, type: "triangle", attaque: 0.01 });
            note(ctx, s, { freq: 196, duree: 0.6, gain: 0.08, type: "triangle", attaque: 0.01, desaccord: 25 });
            clocheFM(ctx, s, { freq: 392, rapport: 1.41, indice: 1, eclat: 0.2, duree: 0.5, gain: 0.05 });
            bruit(ctx, s, { duree: 0.08, filtre: "lowpass", freq: 600, q: 0.7, gain: 0.2 });
        },
        "griffe"(ctx, s) { [0, 0.07, 0.14].forEach(d => souffle(ctx, s, { debut: d, duree: 0.08, balayage: [3000, 1200], q: 1.6, gain: 0.3 })); },
        "zombie"(ctx, s) {
            note(ctx, s, { freq: 98, glisse: 82, duree: 0.9, gain: 0.08, type: "sawtooth", passeBas: 600, attaque: 0.08 });
            note(ctx, s, { freq: 147, glisse: 130, duree: 0.8, gain: 0.05, type: "sawtooth", passeBas: 700, attaque: 0.1, desaccord: 15 });
            bruit(ctx, s, { duree: 0.9, filtre: "lowpass", freq: 400, q: 0.7, gain: 0.12, forme: "cloche" });
        },
        "pioche"(ctx, s) {
            bruit(ctx, s, { duree: 0.05, freq: 2200, q: 3, gain: 0.45 });
            note(ctx, s, { freq: 1900, duree: 0.12, gain: 0.07, type: "triangle", attaque: 0.001 });
            note(ctx, s, { freq: 240, duree: 0.08, gain: 0.2, attaque: 0.002 });
            bruit(ctx, s, { debut: 0.02, duree: 0.1, filtre: "highpass", freq: 4000, q: 0.7, gain: 0.12 });
        },
        "echec"(ctx, s) {
            souffle(ctx, s, { duree: 0.5, balayage: [3000, 300], q: 1, gain: 0.22 });
            note(ctx, s, { freq: 600, glisse: 150, duree: 0.45, gain: 0.08, attaque: 0.01 });
        },
        "refus"(ctx, s) {
            note(ctx, s, { freq: 196, duree: 0.11, gain: 0.06, type: "square", passeBas: 800, attaque: 0.004 });
            note(ctx, s, { debut: 0.15, freq: 185, duree: 0.13, gain: 0.06, type: "square", passeBas: 800, attaque: 0.004 });
        },
        "confusion"(ctx, s) {
            [[600, 900], [900, 550], [550, 820]].forEach(([a, b], i) =>
                note(ctx, s, { debut: i * 0.17, freq: a, glisse: b, duree: 0.18, gain: 0.07, type: "triangle", attaque: 0.01 }));
            note(ctx, s, { freq: 450, glisse: 700, duree: 0.5, gain: 0.03, desaccord: 20, attaque: 0.05 });
        },
        // — IMPACTS ET DÉFENSES —
        "coup-physique"(ctx, s) {
            bruit(ctx, s, { duree: 0.06, freq: 1600, q: 1, gain: 0.45 });
            note(ctx, s, { freq: 140, glisse: 70, duree: 0.18, gain: 0.35, attaque: 0.002 });
        },
        "impact-magique"(ctx, s) {
            note(ctx, s, { freq: 880, glisse: 220, duree: 0.35, gain: 0.1, attaque: 0.003 });
            clocheFM(ctx, s, { freq: 659, rapport: 2.5, indice: 2, eclat: 0.15, duree: 0.5, gain: 0.06 });
            bruit(ctx, s, { duree: 0.3, filtre: "highpass", freq: 5000, q: 0.6, gain: 0.08, forme: "cloche" });
        },
        "impact-brut"(ctx, s) {
            note(ctx, s, { freq: 80, glisse: 50, duree: 0.35, gain: 0.45, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.12, filtre: "lowpass", freq: 300, q: 0.7, gain: 0.45 });
        },
        "chiffre"(ctx, s) {
            note(ctx, s, { freq: 500, glisse: 1200, duree: 0.09, gain: 0.14, attaque: 0.002 });
            note(ctx, s, { debut: 0.08, freq: 1568, duree: 0.2, gain: 0.04, attaque: 0.003 });
        },
        "parade"(ctx, s) {
            bruit(ctx, s, { duree: 0.03, filtre: "highpass", freq: 2500, q: 0.7, gain: 0.42 });
            [[1180, 0.5, 0.08], [1770, 0.35, 0.05], [2650, 0.25, 0.035]].forEach(([f, d, g]) =>
                note(ctx, s, { freq: f, duree: d, gain: g, type: "triangle", attaque: 0.001 }));
            note(ctx, s, { freq: 300, duree: 0.1, gain: 0.15, attaque: 0.002 });
        },
        "absorption"(ctx, s) {
            note(ctx, s, { freq: 300, glisse: 900, duree: 0.4, gain: 0.07, attaque: 0.03 });
            souffle(ctx, s, { duree: 0.4, balayage: [600, 3000], q: 1, gain: 0.12 });
            clocheFM(ctx, s, { debut: 0.35, freq: 1318.5, rapport: 2, indice: 0.8, eclat: 0.1, duree: 0.45, gain: 0.05 });
        },
        "resiste"(ctx, s) {
            note(ctx, s, { freq: 220, duree: 0.3, gain: 0.12, type: "triangle", attaque: 0.003 });
            clocheFM(ctx, s, { freq: 440, rapport: 1, indice: 0.5, eclat: 0.1, duree: 0.5, gain: 0.06 });
            bruit(ctx, s, { duree: 0.05, filtre: "lowpass", freq: 900, q: 0.7, gain: 0.2 });
        },
        "bouclier-impact"(ctx, s) {
            note(ctx, s, { freq: 523, duree: 0.5, gain: 0.08, attaque: 0.003 });
            note(ctx, s, { freq: 523, duree: 0.5, gain: 0.08, attaque: 0.003, desaccord: 18 });
            bruit(ctx, s, { duree: 0.06, filtre: "highpass", freq: 3000, q: 0.7, gain: 0.22 });
            note(ctx, s, { freq: 180, duree: 0.12, gain: 0.18, attaque: 0.002 });
        },
        "bris-verre"(ctx, s) {
            bruit(ctx, s, { duree: 0.4, filtre: "highpass", freq: 3500, q: 0.7, gain: 0.3 });
            tintements(ctx, s, { n: 9, fmin: 2500, fmax: 5500, pas: 0.03, gain: 0.03 });
            note(ctx, s, { freq: 160, duree: 0.1, gain: 0.15, attaque: 0.002 });
        },
        // — SOINS, PROTECTIONS, ÉNERGIE —
        "soin-tic"(ctx, s) {
            ding(ctx, s, { freq: 1318.5, duree: 0.3, force: 0.55, clic: false });
            note(ctx, s, { debut: 0.05, freq: 2637, duree: 0.25, gain: 0.02, attaque: 0.01 });
        },
        "soin-zone"(ctx, s) {
            [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => note(ctx, s, { debut: i * 0.07, freq: f, duree: 0.8, gain: 0.055, attaque: 0.02 }));
            bruit(ctx, s, { debut: 0.3, duree: 0.6, filtre: "highpass", freq: 6000, q: 0.5, gain: 0.05, forme: "cloche" });
        },
        "purification"(ctx, s) {
            souffle(ctx, s, { duree: 0.6, balayage: [2000, 9000], q: 1, gain: 0.12 });
            [1568, 2093, 2637].forEach((f, i) => note(ctx, s, { debut: 0.1 + i * 0.08, freq: f, duree: 0.4, gain: 0.045, attaque: 0.01 }));
        },
        "benediction"(ctx, s) {
            [[523.3, 0.05], [659.3, 0.05], [784, 0.05], [1046.5, 0.03]].forEach(([f, g]) =>
                note(ctx, s, { freq: f, duree: 1.0, gain: g, attaque: 0.12 }));
        },
        "repos"(ctx, s) {
            note(ctx, s, { freq: 220, glisse: 330, duree: 1.2, gain: 0.08, attaque: 0.2 });
            note(ctx, s, { freq: 330, glisse: 495, duree: 1.1, gain: 0.05, attaque: 0.25 });
            bruit(ctx, s, { duree: 1.0, filtre: "lowpass", freq: 900, q: 0.6, gain: 0.05, forme: "cloche" });
        },
        "energie"(ctx, s) {
            note(ctx, s, { freq: 660, glisse: 990, duree: 0.12, gain: 0.08, attaque: 0.004 });
            note(ctx, s, { debut: 0.08, freq: 990, glisse: 1320, duree: 0.14, gain: 0.06, attaque: 0.004 });
        },
        "depense"(ctx, s) {
            note(ctx, s, { freq: 990, glisse: 495, duree: 0.18, gain: 0.08, attaque: 0.004 });
            souffle(ctx, s, { duree: 0.2, balayage: [3000, 800], q: 1.2, gain: 0.06 });
        },
        // — CONTRÔLE —
        "poussee"(ctx, s) {
            souffle(ctx, s, { duree: 0.25, balayage: [500, 2500], gain: 0.3 });
            note(ctx, s, { debut: 0.05, freq: 110, glisse: 60, duree: 0.25, gain: 0.32, attaque: 0.003 });
            bruit(ctx, s, { debut: 0.1, duree: 0.35, filtre: "lowpass", freq: 1200, q: 0.7, gain: 0.12, forme: "cloche" });
        },
        "traction"(ctx, s) {
            note(ctx, s, { freq: 200, glisse: 500, duree: 0.5, gain: 0.08, attaque: 0.03 });
            souffle(ctx, s, { duree: 0.5, balayage: [3000, 400], q: 1, gain: 0.2 });
            pas(ctx, s, { debut: 0.5, duree: 0.08, gain: 0.25 });
        },
        "peur"(ctx, s) {
            note(ctx, s, { freq: 110, duree: 1.0, gain: 0.06, type: "sawtooth", passeBas: 700, attaque: 0.08 });
            note(ctx, s, { freq: 116.5, duree: 1.0, gain: 0.06, type: "sawtooth", passeBas: 700, attaque: 0.08 });
            note(ctx, s, { freq: 155, glisse: 140, duree: 0.9, gain: 0.05, type: "triangle", attaque: 0.1 });
            bruit(ctx, s, { duree: 1.0, filtre: "lowpass", freq: 300, q: 0.7, gain: 0.12, forme: "cloche" });
        },
        "provocation"(ctx, s) {
            note(ctx, s, { freq: 196, duree: 0.5, gain: 0.1, type: "sawtooth", passeBas: 1200, attaque: 0.04 });
            note(ctx, s, { freq: 294, duree: 0.5, gain: 0.06, type: "sawtooth", passeBas: 1400, attaque: 0.05 });
            bruit(ctx, s, { duree: 0.4, freq: 800, q: 0.8, gain: 0.1, forme: "cloche" });
        },
        "dissipe"(ctx, s) {
            note(ctx, s, { freq: 523, glisse: 1046, duree: 0.3, gain: 0.07, attaque: 0.01 });
            clocheFM(ctx, s, { debut: 0.2, freq: 1568, rapport: 2, indice: 0.6, eclat: 0.08, duree: 0.4, gain: 0.05 });
            bruit(ctx, s, { debut: 0.15, duree: 0.4, filtre: "highpass", freq: 6000, q: 0.5, gain: 0.05, forme: "cloche" });
        },
        "chaines"(ctx, s) {
            [0, 0.08, 0.17, 0.23].forEach((d, i) => {
                bruit(ctx, s, { debut: d, duree: 0.02, filtre: "highpass", freq: 4000, q: 0.7, gain: 0.25 });
                note(ctx, s, { debut: d, freq: 1600 + i * 170, duree: 0.15, gain: 0.05, type: "triangle", attaque: 0.001 });
            });
            note(ctx, s, { debut: 0.3, freq: 140, duree: 0.2, gain: 0.2, attaque: 0.003 });
        },
        "etourdi"(ctx, s) {
            note(ctx, s, { freq: 300, glisse: 150, duree: 0.15, gain: 0.2, attaque: 0.002 });
            [2093, 2349, 2637, 2349, 2093, 2637].forEach((f, i) =>
                note(ctx, s, { debut: 0.12 + i * 0.1, freq: f, glisse: f * 1.04, duree: 0.12, gain: 0.04, attaque: 0.005 }));
        },
        // — ÉTATS —
        "brule"(ctx, s) {
            crepiter(ctx, s, { n: 12, duree: 0.6, gain: 0.25 });
            bruit(ctx, s, { duree: 0.6, filtre: "lowpass", freq: 800, q: 0.7, gain: 0.15, forme: "cloche" });
        },
        "electrique"(ctx, s) {
            note(ctx, s, { freq: 120, duree: 0.5, gain: 0.06, type: "sawtooth", passeBas: 2500 });
            note(ctx, s, { freq: 180, duree: 0.5, gain: 0.03, type: "square", passeBas: 2000 });
            crepiter(ctx, s, { n: 7, duree: 0.45, fmin: 3000, fmax: 6000, gain: 0.25 });
        },
        "aveugle"(ctx, s) {
            bruit(ctx, s, { duree: 0.8, filtre: "lowpass", q: 0.7, balayage: [2500, 200], gain: 0.25, forme: "cloche" });
            note(ctx, s, { freq: 300, glisse: 120, duree: 0.8, gain: 0.07, attaque: 0.05 });
        },
        // — ZONES —
        "zone-feu"(ctx, s) {
            bruit(ctx, s, { duree: 1.0, filtre: "lowpass", freq: 900, q: 0.7, gain: 0.32, forme: "cloche" });
            crepiter(ctx, s, { n: 10, duree: 0.9, gain: 0.2 });
        },
        "zone-glace"(ctx, s) {
            [1760, 2349, 2794, 3520].forEach((f, i) => note(ctx, s, { debut: i * 0.06, freq: f, duree: 0.4, gain: 0.04, type: "triangle", attaque: 0.003 }));
            bruit(ctx, s, { duree: 0.6, filtre: "highpass", freq: 4500, q: 0.6, gain: 0.1, forme: "cloche" });
        },
        "zone-foudre"(ctx, s) {
            bruit(ctx, s, { duree: 0.04, filtre: "highpass", freq: 2000, q: 0.7, gain: 0.4 });
            note(ctx, s, { freq: 120, duree: 0.7, gain: 0.06, type: "sawtooth", passeBas: 2200 });
            crepiter(ctx, s, { n: 10, duree: 0.7, fmin: 3000, fmax: 6500, gain: 0.22 });
        },
        // ENTRER DANS UNE NAPPE ÉLECTRIQUE (Nico : « fais un bruitage
        // électrique ») : l'arc qui claque, le bourdonnement haché du courant,
        // une note qui grésille en retombant, et les étincelles qui crépitent.
        "decharge"(ctx, s) {
            bruit(ctx, s, { duree: 0.03, filtre: "highpass", freq: 3000, q: 0.7, gain: 0.42 });
            for (let i = 0; i < 9; i++) note(ctx, s, { debut: i * 0.045, freq: 98, duree: 0.03, gain: 0.07, type: "sawtooth", attaque: 0.002, passeBas: 3000 });
            note(ctx, s, { freq: 1800, glisse: 300, duree: 0.25, gain: 0.03, type: "square", attaque: 0.002, passeBas: 4000 });
            crepiter(ctx, s, { n: 14, duree: 0.45, fmin: 2500, fmax: 7000, gain: 0.28 });
        },
        "zone-poison"(ctx, s) {
            bulles(ctx, s, { n: 9, duree: 0.8, gain: 0.08 });
            bruit(ctx, s, { duree: 0.9, filtre: "lowpass", freq: 500, q: 0.7, gain: 0.08, forme: "cloche" });
        },
        "gravats"(ctx, s) {
            for (let i = 0; i < 10; i++) bruit(ctx, s, { debut: au(0, 0.5), duree: au(0.02, 0.05), freq: au(700, 1500), q: 1.2, gain: au(0.15, 0.3) });
            note(ctx, s, { freq: 80, duree: 0.3, gain: 0.22, attaque: 0.003 });
        },
        // — CLASSES —
        "tenebres"(ctx, s) {
            note(ctx, s, { freq: 73, duree: 0.9, gain: 0.12, type: "sawtooth", passeBas: 400, attaque: 0.06 });
            note(ctx, s, { freq: 77.8, duree: 0.9, gain: 0.1, type: "sawtooth", passeBas: 400, attaque: 0.06 });
            souffle(ctx, s, { duree: 0.7, balayage: [200, 1200], q: 1, gain: 0.2 });
        },
        "charme"(ctx, s) {
            [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(ctx, s, { debut: i * 0.1, freq: f, duree: 0.35, gain: 0.05, attaque: 0.01, desaccord: 8 }));
            bruit(ctx, s, { debut: 0.2, duree: 0.5, filtre: "highpass", freq: 6000, q: 0.5, gain: 0.04, forme: "cloche" });
        },
        "teleport"(ctx, s) {
            note(ctx, s, { freq: 400, glisse: 1600, duree: 0.35, gain: 0.07, attaque: 0.02 });
            souffle(ctx, s, { duree: 0.35, balayage: [500, 6000], q: 1, gain: 0.18 });
            note(ctx, s, { debut: 0.4, freq: 1600, glisse: 400, duree: 0.35, gain: 0.06, attaque: 0.02 });
            souffle(ctx, s, { debut: 0.4, duree: 0.35, balayage: [6000, 500], q: 1, gain: 0.15 });
        },
        "rempart"(ctx, s) {
            note(ctx, s, { freq: 262, duree: 0.8, gain: 0.09, type: "triangle", attaque: 0.05 });
            note(ctx, s, { freq: 393, duree: 0.8, gain: 0.05, type: "triangle", attaque: 0.06 });
            bruit(ctx, s, { duree: 0.03, filtre: "highpass", freq: 2500, q: 0.7, gain: 0.25 });
            note(ctx, s, { freq: 1180, duree: 0.4, gain: 0.04, type: "triangle", attaque: 0.002 });
        },
        "rupture"(ctx, s) {
            bruit(ctx, s, { duree: 0.04, filtre: "highpass", freq: 3000, q: 0.7, gain: 0.42 });
            note(ctx, s, { freq: 1500, glisse: 600, duree: 0.2, gain: 0.07, type: "triangle", attaque: 0.002 });
            [0.15, 0.24, 0.3].forEach((d, i) => note(ctx, s, { debut: d, freq: 1900 - i * 250, duree: 0.1, gain: 0.04, type: "triangle", attaque: 0.001 }));
        },
        "onde-choc"(ctx, s) {
            note(ctx, s, { freq: 50, glisse: 30, duree: 0.8, gain: 0.45, attaque: 0.004 });
            bruit(ctx, s, { duree: 0.6, filtre: "lowpass", q: 0.7, balayage: [2000, 100], gain: 0.4 });
            note(ctx, s, { freq: 523, duree: 1.0, gain: 0.05, type: "triangle", attaque: 0.003 });
        },
        "instinct"(ctx, s) {
            note(ctx, s, { freq: 60, duree: 0.12, gain: 0.42, attaque: 0.004 });
            note(ctx, s, { debut: 0.18, freq: 60, duree: 0.12, gain: 0.36, attaque: 0.004 });
            souffle(ctx, s, { debut: 0.35, duree: 0.25, balayage: [3000, 8000], q: 1.5, gain: 0.18 });
        },
        "releve"(ctx, s) {
            note(ctx, s, { freq: 110, glisse: 220, duree: 0.8, gain: 0.1, attaque: 0.1 });
            note(ctx, s, { freq: 165, glisse: 330, duree: 0.8, gain: 0.06, attaque: 0.12 });
            bruit(ctx, s, { debut: 0.4, duree: 0.5, filtre: "highpass", freq: 6000, q: 0.5, gain: 0.05, forme: "cloche" });
        },
        "sursis"(ctx, s) {
            note(ctx, s, { freq: 55, duree: 0.12, gain: 0.45, attaque: 0.004 });
            note(ctx, s, { debut: 0.22, freq: 55, duree: 0.12, gain: 0.38, attaque: 0.004 });
            [0.6, 1.0].forEach(d => bruit(ctx, s, { debut: d, duree: 0.01, freq: 3000, q: 2, gain: 0.2 }));
        },
        "appel"(ctx, s) {
            note(ctx, s, { freq: 1400, glisse: 1900, duree: 0.25, gain: 0.08, attaque: 0.02 });
            note(ctx, s, { debut: 0.27, freq: 1900, glisse: 1500, duree: 0.2, gain: 0.07, attaque: 0.02 });
        },
        "morsure"(ctx, s) {
            bruit(ctx, s, { duree: 0.05, freq: 1000, q: 1.2, gain: 0.42 });
            note(ctx, s, { freq: 200, glisse: 90, duree: 0.15, gain: 0.3, attaque: 0.002 });
            bruit(ctx, s, { debut: 0.08, duree: 0.15, filtre: "lowpass", freq: 900, q: 0.7, gain: 0.15, forme: "cloche" });
        },
        "lien"(ctx, s) {
            note(ctx, s, { freq: 82, duree: 0.12, gain: 0.35, attaque: 0.004 });
            clocheFM(ctx, s, { debut: 0.1, freq: 523.3, rapport: 2, indice: 0.7, eclat: 0.1, duree: 0.6, gain: 0.05 });
            clocheFM(ctx, s, { debut: 0.14, freq: 659.3, rapport: 2, indice: 0.7, eclat: 0.1, duree: 0.6, gain: 0.04 });
        },
        "mur-terre"(ctx, s) {
            note(ctx, s, { freq: 45, duree: 0.9, gain: 0.4, attaque: 0.05 });
            bruit(ctx, s, { duree: 0.8, filtre: "lowpass", freq: 250, q: 0.7, gain: 0.42, forme: "cloche" });
            bruit(ctx, s, { debut: 0.4, duree: 0.08, freq: 1500, q: 1, gain: 0.32 });
        },
        "effondrement"(ctx, s) {
            bruit(ctx, s, { duree: 0.9, filtre: "lowpass", freq: 300, q: 0.7, gain: 0.35 });
            for (let i = 0; i < 12; i++) bruit(ctx, s, { debut: au(0.05, 0.7), duree: au(0.02, 0.06), freq: au(500, 1400), q: 1.2, gain: au(0.15, 0.32) });
            note(ctx, s, { freq: 60, glisse: 40, duree: 0.6, gain: 0.3, attaque: 0.004 });
        },
        "tourbillon"(ctx, s) {
            souffle(ctx, s, { duree: 0.28, balayage: [400, 2600], gain: 0.28 });
            souffle(ctx, s, { debut: 0.22, duree: 0.28, balayage: [2600, 500], gain: 0.25 });
        },
        "rembobiner"(ctx, s) {
            note(ctx, s, { freq: 1200, glisse: 300, duree: 0.5, gain: 0.05, type: "sawtooth", passeBas: 2000, attaque: 0.02 });
            souffle(ctx, s, { duree: 0.5, balayage: [4000, 500], q: 1, gain: 0.15 });
            [0.05, 0.13, 0.2, 0.26, 0.31, 0.35].forEach(d => bruit(ctx, s, { debut: d, duree: 0.01, freq: 3200, q: 2, gain: 0.18 }));
        },
        "aspiration"(ctx, s) {
            note(ctx, s, { freq: 600, glisse: 200, duree: 0.5, gain: 0.07, attaque: 0.03 });
            bruit(ctx, s, { duree: 0.5, filtre: "lowpass", q: 0.7, balayage: [3000, 300], gain: 0.22, forme: "cloche" });
        },
        "nuee"(ctx, s) {
            for (let i = 0; i < 22; i++) {
                const t = i * 0.035;
                bruit(ctx, s, { debut: t, duree: 0.025, freq: au(600, 1200), q: 1.4, gain: 0.25 * Math.sin(Math.PI * (i + 1) / 23) });
            }
            [0.1, 0.35, 0.6].forEach(d => note(ctx, s, { debut: d, freq: au(3500, 4500), duree: 0.03, gain: 0.03, attaque: 0.002 }));
        },
        "anti-magie"(ctx, s) {
            note(ctx, s, { freq: 330, duree: 1.0, gain: 0.07, attaque: 0.08 });
            note(ctx, s, { freq: 333, duree: 1.0, gain: 0.07, attaque: 0.08 });
            clocheFM(ctx, s, { freq: 1318.5, rapport: 3, indice: 1, eclat: 0.15, duree: 0.7, gain: 0.05 });
        },
        "renvoi"(ctx, s) {
            clocheFM(ctx, s, { freq: 880, rapport: 2, indice: 1, eclat: 0.06, duree: 0.2, gain: 0.07 });
            souffle(ctx, s, { debut: 0.05, duree: 0.25, balayage: [800, 4000], q: 1.2, gain: 0.15 });
            clocheFM(ctx, s, { debut: 0.25, freq: 1318.5, rapport: 2, indice: 1, eclat: 0.08, duree: 0.4, gain: 0.07 });
        },
        "appel-lumiere"(ctx, s) {
            [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(ctx, s, { debut: i * 0.05, freq: f, duree: 1.4, gain: 0.04, attaque: 0.15 }));
            bruit(ctx, s, { duree: 1.4, filtre: "highpass", freq: 5000, q: 0.5, gain: 0.12, forme: "cloche" });
            note(ctx, s, { freq: 130.8, duree: 1.4, gain: 0.1, attaque: 0.3 });
        },
        // — TALENTS —
        "charge"(ctx, s) {
            for (let i = 0; i < 4; i++) pas(ctx, s, { debut: i * 0.08, duree: 0.05, grain: 900, corps: 120, gain: 0.22 });
            souffle(ctx, s, { duree: 0.5, balayage: [300, 2000], gain: 0.28 });
        },
        "impact-mur"(ctx, s) {
            note(ctx, s, { freq: 70, duree: 0.3, gain: 0.42, attaque: 0.003 });
            bruit(ctx, s, { duree: 0.05, freq: 1800, q: 2, gain: 0.42 });
            for (let i = 0; i < 5; i++) bruit(ctx, s, { debut: 0.05 + au(0, 0.3), duree: au(0.02, 0.04), freq: au(700, 1400), q: 1.2, gain: 0.2 });
        },
        "coup-poing"(ctx, s) {
            note(ctx, s, { freq: 150, glisse: 70, duree: 0.12, gain: 0.42, attaque: 0.002 });
            bruit(ctx, s, { duree: 0.04, filtre: "lowpass", freq: 1200, q: 0.7, gain: 0.42 });
        }
    });

    window.SONS_COMBAT = SONS_COMBAT;
    window.jouerSonCombat = function (id, facteur) {
        const fabriquer = SONS_COMBAT[id];
        return fabriquer ? jouerFabrication(fabriquer, facteur, "combat") : false;
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
