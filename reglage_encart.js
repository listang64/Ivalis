// =========================================================================
//  OUTIL PROVISOIRE — LE RÉGLAGE DE L'ENCART DE TOUR
// =========================================================================
//  L'encart, c'est la plaque en bas à gauche qui montre la technique qui va
//  être lancée : l'image de fond, le portrait (médaillon ou avatar en pied),
//  les états, le nom du combattant, le nom de la technique, le détail de
//  l'attaque et la ligne d'attente. Ce fichier ajoute, en combat, un bouton
//  « ⚙ HUD » qui ouvre une boîte de flèches pour déplacer et redimensionner
//  chacun de ces éléments, plus un bouton qui extrait le code à renvoyer.
//
//  IL NE POSE RIEN LUI-MÊME. Il modifie window.REGLAGES_HUD et redemande la
//  pose à hud_disposition.js, qui est le seul à placer les éléments : ce qui
//  se voit pendant le réglage est donc exactement ce que le jeu fera une fois
//  les nombres recopiés dans le code.
//
//  Les réglages survivent au rechargement (localStorage de CET appareil) :
//  on peut régler, relancer, continuer. Une fois les bons nombres recopiés
//  dans hud_disposition.js, ce fichier et sa ligne dans index.html partent.
// =========================================================================
(function () {
    const CLE_MEMOIRE = "ivalis_reglage_encart_v1";
    const GROUPES = ["encart", "encartFond", "encartPion", "encartAvatar", "encartEtats",
                     "encartNom", "encartCarte", "encartDetail", "encartAttente"];

    // CE QUE CHAQUE LIGNE RÈGLE. « unite » donne l'ordre de grandeur d'un pas :
    // la plaque se place en pixels d'écran, tout le reste en % de la plaque —
    // un pas de 2 % déplacerait déjà beaucoup.
    const LIGNES = [
        { titre: "Plaque entière (fond + contenu)", groupe: "encart", unite: 2,
          deplacer: { x: "gauche", y: "bas", inverseY: true },
          tailles: [{ cle: "largeur", nom: "Largeur", pas: 10, min: 100 }] },
        { titre: "Image de fond seule", groupe: "encartFond", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "echelle", nom: "Taille", pas: 1, min: 10 }] },
        { titre: "Médaillon (créature)", groupe: "encartPion", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "taille", nom: "Taille", pas: 1, min: 4 }] },
        { titre: "Avatar en pied (héros)", groupe: "encartAvatar", unite: 0.5,
          deplacer: { x: "x", y: "bas", inverseY: true },
          tailles: [{ cle: "hauteur", nom: "Hauteur", pas: 2, min: 10 }] },
        { titre: "États", groupe: "encartEtats", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "taille", nom: "Icônes", pas: 0.5, min: 1 },
                    { cle: "largeur", nom: "Largeur", pas: 2, min: 4 },
                    { cle: "ecart", nom: "Écart", pas: 0.2, min: 0 }] },
        { titre: "Nom du combattant", groupe: "encartNom", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "taille", nom: "Police", pas: 0.2, min: 1 }] },
        { titre: "Nom de la technique", groupe: "encartCarte", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "taille", nom: "Police", pas: 0.2, min: 1 }] },
        { titre: "Détail de l'attaque", groupe: "encartDetail", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "taille", nom: "Police", pas: 0.1, min: 0.5 },
                    { cle: "largeur", nom: "Largeur", pas: 2, min: 5 }] },
        { titre: "Ligne d'attente", groupe: "encartAttente", unite: 0.5,
          deplacer: { x: "x", y: "y" },
          tailles: [{ cle: "taille", nom: "Police", pas: 0.1, min: 0.5 }] }
    ];

    const copier = (o) => JSON.parse(JSON.stringify(o));
    // Deux décimales : sans cela 27 + 0.5 - 0.5 finit en 26.999999999999996.
    const arrondir = (v) => Math.round(v * 100) / 100;

    let PAR_DEFAUT = null;
    let pas = 1;

    function reglages() { return window.REGLAGES_HUD || null; }

    function retenir() {
        const r = reglages(); if (!r) return;
        const o = {}; GROUPES.forEach(g => { if (r[g]) o[g] = r[g]; });
        try { localStorage.setItem(CLE_MEMOIRE, JSON.stringify(o)); } catch (e) {}
    }

    function relire() {
        const r = reglages(); if (!r) return;
        let lu = null;
        try { lu = JSON.parse(localStorage.getItem(CLE_MEMOIRE) || "null"); } catch (e) { lu = null; }
        if (!lu) return;
        GROUPES.forEach(g => {
            if (!lu[g] || !r[g]) return;
            Object.keys(r[g]).forEach(k => { if (typeof lu[g][k] === "number") r[g][k] = lu[g][k]; });
        });
    }

    function reposer() {
        if (typeof window.appliquerReglagesEncart === "function") window.appliquerReglagesEncart();
        if (window.ENCART_FIGE) figer();
        retenir();
        rafraichirValeurs();
    }

    // =====================================================================
    //  LE CODE À RENVOYER
    // =====================================================================
    window.codeReglageEncart = function () {
        const r = reglages();
        const ligne = (g) => {
            const o = r[g];
            const corps = Object.keys(o).map(k => `${k}: ${arrondir(o[k])}`).join(", ");
            return `        ${(g + ":").padEnd(15)}{ ${corps} },`;
        };
        const encart = document.getElementById("voile-tour-encart");
        const L = encart ? Math.round(encart.getBoundingClientRect().width) : 0;
        return [
            `// ENCART DE TOUR — réglé sur une plaque de ${L} px de large (${window.innerWidth}×${window.innerHeight})`,
            ...GROUPES.filter(g => r[g]).map(ligne)
        ].join("\n");
    };

    // =====================================================================
    //  LA BOÎTE
    // =====================================================================
    function bouton(texte, titre, action, repeter) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = texte;
        b.title = titre || "";
        b.style.cssText = "min-width: 34px; height: 32px; margin: 2px; padding: 0 7px;"
            + "background: #2a2118; color: #e8d5a5; border: 1px solid #8a6a3f;"
            + "border-radius: 6px; font-family: monospace; font-size: 15px; cursor: pointer;"
            + "touch-action: manipulation; -webkit-user-select: none; user-select: none;";
        // UN APPUI LONG RÉPÈTE : sur iPad, taper vingt fois pour traverser la
        // plaque serait interminable.
        let minuteur = null, intervalle = null;
        const stop = () => { clearTimeout(minuteur); clearInterval(intervalle); minuteur = intervalle = null; };
        b.addEventListener("pointerdown", (e) => {
            e.stopPropagation(); e.preventDefault();
            action();
            if (!repeter) return;
            minuteur = setTimeout(() => { intervalle = setInterval(action, 70); }, 380);
        });
        ["pointerup", "pointerleave", "pointercancel"].forEach(t => b.addEventListener(t, stop));
        b.addEventListener("click", (e) => e.stopPropagation());
        return b;
    }

    function bouger(groupe, cle, signe, unite) {
        const g = reglages()[groupe];
        g[cle] = arrondir((g[cle] || 0) + signe * pas * (unite || 1));
        reposer();
    }

    function redimensionner(groupe, t, signe) {
        const g = reglages()[groupe];
        const plancher = t.min === undefined ? 1 : t.min;
        g[t.cle] = arrondir(Math.max(plancher, (g[t.cle] || 0) + signe * t.pas * pas));
        reposer();
    }

    const affichages = [];
    function rafraichirValeurs() {
        affichages.forEach(a => { a.el.textContent = a.texte(); });
    }

    function construire() {
        if (document.getElementById("reglage-encart")) return;

        const boite = document.createElement("div");
        boite.id = "reglage-encart";
        boite.style.cssText = "position: fixed; top: 70px; right: 10px; z-index: 10030;"
            + "display: none; max-height: 84vh; overflow-y: auto; -webkit-overflow-scrolling: touch;"
            + "background: rgba(14, 11, 8, 0.96); border: 2px solid #8a6a3f; border-radius: 10px;"
            + "padding: 12px 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.9);"
            + "font-family: 'Segoe UI', sans-serif; color: #e8d5a5; font-size: 13px;"
            + "pointer-events: auto; width: 340px; box-sizing: border-box;";
        ["click", "pointerdown", "mousedown", "touchstart"].forEach(t =>
            boite.addEventListener(t, (e) => e.stopPropagation()));

        const entete = document.createElement("div");
        entete.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";
        const titre = document.createElement("div");
        titre.textContent = "RÉGLAGE DE L'ENCART";
        titre.style.cssText = "font-weight: bold; letter-spacing: 1px;";
        entete.appendChild(titre);
        const actionsEntete = document.createElement("div");
        // La boîte peut gêner la vue sur la plaque : on la change de côté.
        actionsEntete.appendChild(bouton("⇄", "Changer la boîte de côté", () => {
            const aDroite = boite.style.right !== "auto";
            boite.style.right = aDroite ? "auto" : "10px";
            boite.style.left = aDroite ? "10px" : "auto";
        }));
        actionsEntete.appendChild(bouton("✕", "Fermer la boîte", () => window.basculerReglageEncart()));
        entete.appendChild(actionsEntete);
        boite.appendChild(entete);

        const sous = document.createElement("div");
        sous.textContent = "Outil provisoire. Appuie sur « Figer » pour garder l'encart à l'écran. "
                        + "Tout est en % de la plaque (sauf la plaque elle-même, en pixels) : "
                        + "ce qui est réglé ici vaut sur tous les écrans. Appui long = répétition.";
        sous.style.cssText = "font-size: 11px; color: #a89f91; margin-bottom: 8px;";
        boite.appendChild(sous);

        const ligneHaut = document.createElement("div");
        ligneHaut.style.cssText = "display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;";
        const boutonFiger = bouton("👁 Figer", "Garder l'encart à l'écran avec un exemple", () => {
            window.ENCART_FIGE = !window.ENCART_FIGE;
            if (!window.ENCART_FIGE) window.ENCART_FORME = null;   // le jeu reprend la main sur la forme
            boutonFiger.style.background = window.ENCART_FIGE ? "#5c3a21" : "#2a2118";
            if (window.ENCART_FIGE) figer();
            else if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        });
        ligneHaut.appendChild(boutonFiger);
        // LES DEUX FORMES DU PORTRAIT n'ont pas les mêmes mesures : on bascule
        // l'exemple de l'une à l'autre pour régler les deux.
        // Elle agit sur le portrait AFFICHÉ, quel qu'il soit : si le dernier tour
        // était celui d'une créature, c'est son médaillon qui est à l'écran, et
        // sans cela les flèches de l'avatar n'auraient rien à bouger.
        const boutonForme = bouton("🧍 / ⚪ Portrait", "Basculer entre avatar en pied et médaillon", () => {
            const boitePion = document.getElementById("voile-tour-pion-boite");
            const estAvatar = !!boitePion && boitePion.classList.contains("pion-avatar-entier");
            window.ENCART_FORME = estAvatar ? "medaillon" : "avatar";
            if (!window.ENCART_FIGE) { window.ENCART_FIGE = true; boutonFiger.style.background = "#5c3a21"; }
            figer();
        });
        ligneHaut.appendChild(boutonForme);
        boite.appendChild(ligneHaut);

        // LE PAS : fin pour la fin du réglage, gros pour le début.
        const ligneDuPas = document.createElement("div");
        ligneDuPas.style.cssText = "display: flex; align-items: center; gap: 4px; margin-bottom: 8px;";
        const etiquettePas = document.createElement("span");
        etiquettePas.textContent = "Pas ×";
        ligneDuPas.appendChild(etiquettePas);
        [0.5, 1, 2, 5].forEach(v => {
            const b = bouton(String(v), `Multiplier chaque pas par ${v}`, () => {
                pas = v;
                [...ligneDuPas.querySelectorAll("button")].forEach(x => {
                    x.style.background = (x.textContent === String(pas)) ? "#5c3a21" : "#2a2118";
                });
            });
            if (v === pas) b.style.background = "#5c3a21";
            ligneDuPas.appendChild(b);
        });
        boite.appendChild(ligneDuPas);

        LIGNES.forEach(ligne => {
            const bloc = document.createElement("div");
            bloc.style.cssText = "border-top: 1px solid #3a2e20; padding: 7px 0;";

            const nom = document.createElement("div");
            const g = document.createElement("div");
            g.textContent = ligne.titre;
            g.style.cssText = "font-weight: bold;";
            const valeur = document.createElement("div");
            valeur.style.cssText = "font-family: monospace; font-size: 11px; color: #c2a878;";
            affichages.push({ el: valeur, texte: () => {
                const o = (reglages() || {})[ligne.groupe] || {};
                return Object.keys(o).map(k => `${k} ${arrondir(o[k])}`).join("  ");
            } });
            nom.appendChild(g); nom.appendChild(valeur);
            bloc.appendChild(nom);

            const fleches = document.createElement("div");
            fleches.style.cssText = "margin-top: 4px; display: flex; align-items: center; flex-wrap: wrap;";
            const d = ligne.deplacer;
            // Les flèches disent ce qu'on VOIT : « ▲ » monte l'élément, même
            // quand la valeur derrière se compte depuis le bas et augmente donc.
            fleches.appendChild(bouton("◀", "Vers la gauche", () => bouger(ligne.groupe, d.x, -1, ligne.unite), true));
            fleches.appendChild(bouton("▶", "Vers la droite", () => bouger(ligne.groupe, d.x, 1, ligne.unite), true));
            fleches.appendChild(bouton("▲", "Vers le haut", () => bouger(ligne.groupe, d.y, d.inverseY ? 1 : -1, ligne.unite), true));
            fleches.appendChild(bouton("▼", "Vers le bas", () => bouger(ligne.groupe, d.y, d.inverseY ? -1 : 1, ligne.unite), true));

            (ligne.tailles || []).forEach(t => {
                const etiq = document.createElement("span");
                etiq.textContent = t.nom;
                etiq.style.cssText = "margin: 0 2px 0 8px; font-size: 11px; color: #a89f91;";
                fleches.appendChild(etiq);
                fleches.appendChild(bouton("−", "Réduire " + t.nom.toLowerCase(), () => redimensionner(ligne.groupe, t, -1), true));
                fleches.appendChild(bouton("+", "Agrandir " + t.nom.toLowerCase(), () => redimensionner(ligne.groupe, t, 1), true));
            });

            bloc.appendChild(fleches);
            boite.appendChild(bloc);
        });

        const bas = document.createElement("div");
        bas.style.cssText = "border-top: 1px solid #3a2e20; padding-top: 10px; margin-top: 4px;"
            + "display: flex; flex-wrap: wrap; gap: 4px;";

        const zone = document.createElement("textarea");
        zone.id = "reglage-encart-code";
        zone.readOnly = true;
        zone.style.cssText = "width: 100%; box-sizing: border-box; height: 170px; margin-top: 8px; display: none;"
            + "background: #070504; color: #9fd2ff; border: 1px solid #3a2e20; border-radius: 6px;"
            + "font-family: monospace; font-size: 11px; padding: 6px; resize: vertical;";

        const etatCopie = document.createElement("div");
        etatCopie.style.cssText = "font-size: 11px; color: #8fd18f; margin-top: 4px; min-height: 14px;";

        bas.appendChild(bouton("📋 Extraire le code", "Afficher et copier le code à renvoyer", () => {
            const code = window.codeReglageEncart();
            zone.value = code;
            zone.style.display = "block";
            zone.focus(); zone.select();
            etatCopie.textContent = "Sélectionné — colle-le dans la conversation.";
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code)
                    .then(() => { etatCopie.textContent = "Copié dans le presse-papiers — colle-le dans la conversation."; })
                    .catch(() => {});
            }
        }));
        bas.appendChild(bouton("↺ Défaut", "Tout remettre aux valeurs du code", () => {
            if (!PAR_DEFAUT) return;
            const r = reglages();
            GROUPES.forEach(g => { if (PAR_DEFAUT[g]) r[g] = copier(PAR_DEFAUT[g]); });
            reposer();
        }));
        boite.appendChild(bas);
        boite.appendChild(etatCopie);
        boite.appendChild(zone);

        document.body.appendChild(boite);

        const poignee = document.createElement("div");
        poignee.id = "reglage-encart-poignee";
        poignee.textContent = "⚙ HUD";
        poignee.style.cssText = "position: fixed; top: 50%; left: 8px; z-index: 10029;"
            + "background: rgba(14, 11, 8, 0.92); color: #e8d5a5; border: 1px solid #8a6a3f;"
            + "border-radius: 8px; padding: 8px 12px; cursor: pointer; display: none;"
            + "font-family: 'Segoe UI', sans-serif; font-size: 13px; letter-spacing: 1px;"
            + "box-shadow: 0 4px 12px rgba(0,0,0,0.8); user-select: none; -webkit-user-select: none;";
        poignee.addEventListener("click", (e) => { e.stopPropagation(); window.basculerReglageEncart(); });
        document.body.appendChild(poignee);

        rafraichirValeurs();
    }

    // =====================================================================
    //  FIGER : L'ENCART RESTE À L'ÉCRAN, AVEC UN EXEMPLE
    // =====================================================================
    //  L'encart ne s'affiche que pendant le tour d'un combattant : sans ce
    //  maintien, il faudrait régler entre deux animations. On n'écrit que ce
    //  qui est vide — un vrai tour en cours garde ce qu'il a déjà mis.
    const EXEMPLE = "data-exemple-reglage";
    function viderExemple() {
        document.querySelectorAll(`[${EXEMPLE}]`).forEach(el => {
            if (el.tagName === "IMG") el.removeAttribute("src"); else el.innerHTML = "";
            el.removeAttribute(EXEMPLE);
        });
    }

    function figer() {
        const voile = document.getElementById("voile-tour-combat");
        const encart = document.getElementById("voile-tour-encart");
        if (!voile || !encart) return;
        const poser = (id, html) => {
            const el = document.getElementById(id);
            if (el && !el.innerHTML.trim()) { el.innerHTML = html; el.setAttribute(EXEMPLE, "1"); }
        };
        poser("voile-tour-nom", "Cybile");
        poser("voile-tour-carte", "Fureur du roc meurtrier");
        poser("voile-tour-effets",
            '<div style="margin-top: 8px;">'
            + '<div style="color: #f4efe4; font-weight: bold;">• Attaque lourde</div>'
            + '<div style="color: #cfc6b6; font-style: italic; margin-left: 14px;">10 dégâts physiques</div>'
            + '</div><div style="margin-top: 8px; color: #f4efe4; font-weight: bold;">• Peur</div>');
        poser("voile-tour-attente", "En attente de Nico, Ben…");
        poser("voile-tour-etats",
            ["#c0392b", "#2980b9", "#8e44ad"].map(c =>
                `<span class="exemple-etat" style="display:inline-block; border-radius:50%; background:${c};"></span>`).join(""));
        // Les icônes d'exemple prennent la taille réglée, comme les vraies.
        const etats = document.getElementById("voile-tour-etats");
        if (etats && etats.hasAttribute(EXEMPLE)) {
            const t = (parseFloat(etats.dataset.taille) || 20) + "px";
            etats.style.display = "flex";
            etats.querySelectorAll(".exemple-etat").forEach(sp => { sp.style.width = t; sp.style.height = t; });
        }
        const pion = document.getElementById("voile-tour-pion");
        const boitePion = document.getElementById("voile-tour-pion-boite");
        if (pion && !pion.getAttribute("src")) {
            pion.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png";
            pion.setAttribute(EXEMPLE, "1");
        }
        // Un exemple sans forme choisie se montre en pied : c'est la forme qu'on a
        // le plus de raisons de vouloir régler.
        if (!window.ENCART_FORME && pion && pion.hasAttribute(EXEMPLE)) window.ENCART_FORME = "avatar";
        if (boitePion && window.ENCART_FORME) {
            const veutAvatar = window.ENCART_FORME === "avatar";
            if (boitePion.classList.contains("pion-avatar-entier") !== veutAvatar) {
                boitePion.classList.toggle("pion-avatar-entier", veutAvatar);
                if (typeof window.appliquerReglagesEncart === "function") window.appliquerReglagesEncart();
            }
        }
        voile.style.display = "block";
        voile.style.opacity = "1";
        voile.style.pointerEvents = "none";
    }

    // Toute redemande d'affichage du voile referme la fenêtre quand aucun tour
    // n'est en cours — et hud_disposition.js en redemande une à chaque pose.
    // On refige donc DANS LA FOULÉE, avant que l'écran ne se redessine :
    // sans quoi l'encart clignoterait au rythme des poses.
    function envelopperRafraichissement() {
        const f = window.rafraichirVoileTour;
        if (typeof f !== "function" || f.__reglageEncart) return;
        const enveloppe = function () {
            const r = f.apply(this, arguments);
            if (window.ENCART_FIGE) figer();
            return r;
        };
        enveloppe.__reglageEncart = true;
        window.rafraichirVoileTour = enveloppe;
    }

    window.basculerReglageEncart = function () {
        const boite = document.getElementById("reglage-encart");
        const poignee = document.getElementById("reglage-encart-poignee");
        if (!boite) return;
        const ouvrir = boite.style.display === "none";
        boite.style.display = ouvrir ? "block" : "none";
        if (poignee) poignee.style.display = ouvrir ? "none" : "block";
        if (ouvrir) rafraichirValeurs();
    };

    // LA POIGNÉE NE SE MONTRE QU'EN COMBAT : ailleurs, il n'y a pas d'encart.
    function surveiller() {
        envelopperRafraichissement();
        if (window.ENCART_FIGE) figer();
        const fenetre = document.getElementById("fenetre-combat");
        const poignee = document.getElementById("reglage-encart-poignee");
        const boite = document.getElementById("reglage-encart");
        if (!fenetre || !poignee || !boite) return;
        const enCombat = fenetre.style.display === "block";
        if (!enCombat) {
            poignee.style.display = "none"; boite.style.display = "none";
            if (window.ENCART_FIGE) { window.ENCART_FIGE = false; window.ENCART_FORME = null; viderExemple(); }
            return;
        }
        if (boite.style.display !== "block") poignee.style.display = "block";
    }

    function demarrer() {
        if (!reglages()) { setTimeout(demarrer, 300); return; }
        PAR_DEFAUT = {};
        GROUPES.forEach(g => { if (reglages()[g]) PAR_DEFAUT[g] = copier(reglages()[g]); });
        relire();
        construire();
        if (typeof window.appliquerReglagesEncart === "function") window.appliquerReglagesEncart();
        setInterval(surveiller, 600);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
    else demarrer();
})();
