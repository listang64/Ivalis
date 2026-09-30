// =========================================================================
//  IVALIS — LA FABRIQUE (Paramètres → La Fabrique)
// =========================================================================
//  Dix sons d'interface, fabriqués sur place avec Web Audio : aucun fichier à
//  héberger, aucun réseau. Chacun a sa fonction — un clic de menu, un
//  effleurement, une validation, une grande validation, un retour, un refus,
//  une fenêtre qui s'ouvre, une qui se ferme, une page de parchemin, une
//  pièce d'or — pour qu'on les écoute ici avant de choisir où les poser.
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

    // --- LES DIX SONS ------------------------------------------------------
    const SONS = [
        {
            id: "clic-menu", nom: "Clic de menu",
            usage: "Les boutons de menu, les onglets du jeu",
            fabriquer(ctx, s) {
                // Un petit coup de bois : un souffle court, une note qui tombe.
                bruit(ctx, s, { duree: 0.03, freq: 1800, q: 4, gain: 0.5 });
                note(ctx, s, { freq: 880, glisse: 560, duree: 0.07, gain: 0.12, type: "triangle" });
            }
        },
        {
            id: "effleurement", nom: "Effleurement",
            usage: "Le survol d'un bouton, un choix qu'on parcourt",
            fabriquer(ctx, s) {
                // Presque rien : un éclat aigu et un souffle de soie.
                note(ctx, s, { freq: 2350, duree: 0.05, gain: 0.05 });
                bruit(ctx, s, { duree: 0.02, freq: 6000, filtre: "highpass", q: 0.7, gain: 0.12 });
            }
        },
        {
            id: "validation", nom: "Validation",
            usage: "Valider, confirmer un choix ordinaire",
            fabriquer(ctx, s) {
                // Deux notes qui montent (mi → si), claires et brèves.
                note(ctx, s, { freq: 659.3, duree: 0.22, gain: 0.17, type: "triangle" });
                note(ctx, s, { freq: 987.8, debut: 0.08, duree: 0.3, gain: 0.17, type: "triangle" });
                note(ctx, s, { freq: 1975.5, debut: 0.08, duree: 0.2, gain: 0.03 });
            }
        },
        {
            id: "grande-validation", nom: "Grande validation",
            usage: "Créer un héros, lancer une partie, choisir sa classe",
            fabriquer(ctx, s) {
                // Un arpège doré qui s'élève (do, mi, sol, do), avec son harmonique.
                [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => {
                    note(ctx, s, { freq: f, debut: i * 0.07, duree: 0.7, gain: 0.12 });
                    note(ctx, s, { freq: f * 2, debut: i * 0.07, duree: 0.4, gain: 0.025 });
                });
            }
        },
        {
            id: "retour", nom: "Retour",
            usage: "Retour, annuler, revenir à l'écran d'avant",
            fabriquer(ctx, s) {
                // Deux notes qui redescendent (sol → ré), plus douces.
                note(ctx, s, { freq: 784.0, duree: 0.18, gain: 0.13, type: "triangle" });
                note(ctx, s, { freq: 587.3, debut: 0.08, duree: 0.26, gain: 0.13, type: "triangle" });
            }
        },
        {
            id: "refus", nom: "Refus",
            usage: "Action impossible, erreur, pas assez d'énergie",
            fabriquer(ctx, s) {
                // Deux bourdonnements graves et un peu faux, étouffés.
                [0, 0.13].forEach(d => {
                    note(ctx, s, { freq: 116, debut: d, duree: 0.11, gain: 0.12, type: "sawtooth", passeBas: 900 });
                    note(ctx, s, { freq: 123, debut: d, duree: 0.11, gain: 0.12, type: "sawtooth", passeBas: 900 });
                });
            }
        },
        {
            id: "ouverture", nom: "Ouverture de fenêtre",
            usage: "Une fenêtre, une fiche ou un panneau qui s'ouvre",
            fabriquer(ctx, s) {
                // Un souffle qui monte, et une note qui s'élève avec lui.
                bruit(ctx, s, { duree: 0.34, balayage: [350, 2600], q: 1.4, gain: 0.35, forme: "cloche" });
                note(ctx, s, { freq: 440, glisse: 660, duree: 0.34, gain: 0.07, attaque: 0.08 });
            }
        },
        {
            id: "fermeture", nom: "Fermeture de fenêtre",
            usage: "Une fenêtre qui se referme, un panneau qu'on range",
            fabriquer(ctx, s) {
                // Le même souffle, qui redescend, et se pose.
                bruit(ctx, s, { duree: 0.3, balayage: [2600, 350], q: 1.4, gain: 0.3, forme: "cloche" });
                note(ctx, s, { freq: 620, glisse: 390, duree: 0.3, gain: 0.07, attaque: 0.05 });
            }
        },
        {
            id: "parchemin", nom: "Page de parchemin",
            usage: "Tourner une page, changer d'onglet dans une fiche",
            fabriquer(ctx, s) {
                // Le papier qu'on froisse en le tournant, puis qui se pose.
                bruit(ctx, s, { duree: 0.09, freq: 3800, filtre: "highpass", q: 0.8, gain: 0.25, forme: "cloche" });
                bruit(ctx, s, { debut: 0.07, duree: 0.05, freq: 2600, q: 1.2, gain: 0.3 });
                note(ctx, s, { freq: 160, debut: 0.1, duree: 0.08, gain: 0.08 });
            }
        },
        {
            id: "piece", nom: "Pièce d'or",
            usage: "Or gagné, achat, butin, récompense",
            fabriquer(ctx, s) {
                // Deux tintements métalliques (partiels inharmoniques), le second un peu plus haut.
                [[0, 1], [0.09, 1.12]].forEach(([d, k]) => {
                    note(ctx, s, { freq: 2093 * k, debut: d, duree: 0.45, gain: 0.08 });
                    note(ctx, s, { freq: 2637 * k * 1.01, debut: d, duree: 0.3, gain: 0.05 });
                    note(ctx, s, { freq: 3950 * k, debut: d, duree: 0.18, gain: 0.03 });
                });
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

    // Jouer un son de la Fabrique, par son rang (1 à 10) ou son identifiant.
    window.jouerSonFabrique = function (quel) {
        const son = typeof quel === "number" ? SONS[quel - 1] : SONS.find(x => x.id === quel);
        if (!son) return false;
        const v = volume();
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
