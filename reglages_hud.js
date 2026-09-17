// =========================================================================
//  LA BOÎTE DE RÉGLAGE DU BLOC DU HÉROS — OUTIL PROVISOIRE
// =========================================================================
//  POURQUOI ELLE EXISTE.
//
//  Le bouton de fin de tour est une IMAGE. Le disque qu'on y voit, son rebord
//  doré, sa marge transparente : rien de tout cela n'est décrit en CSS, et rien
//  ne se lit depuis le code. Placer un anneau de jauges autour de ce disque
//  revient donc à viser à l'aveugle — et le premier essai a visé quinze pixels
//  trop court, si bien que l'anneau s'est retrouvé entièrement caché derrière
//  le bouton.
//
//  Plutôt que de deviner une fois de plus, cette boîte donne la main : quatre
//  flèches par élément, deux de plus pour les tailles, et un bouton qui recrache
//  les valeurs obtenues. On règle à l'écran, on copie, et les valeurs deviennent
//  les nouvelles valeurs par défaut du code.
//
//  ELLE EST FAITE POUR DISPARAÎTRE. Une fois les nombres arrêtés, ce fichier
//  entier s'efface : il suffit de recopier REGLAGES_HUD tel qu'il est ici, avec
//  les valeurs réglées, et de retirer la balise <script> de index.html.
//
//  Les réglages survivent au rechargement (localStorage) : on peut régler,
//  recharger, continuer.

(function () {
    "use strict";

    const CLE_MEMOIRE = "REGLAGES_HUD_IVALIS";

    // TOUTES LES MESURES SONT EN PIXELS, ET TOUTES PARTENT D'UN COIN DU BANDEAU.
    // « centreDroite » et « centreBas », par exemple, disent où se trouve le
    // CENTRE de l'anneau par rapport au coin bas-droit du bandeau — c'est ce
    // qu'on mesure le plus facilement sur une capture d'écran.
    //
    // CES VALEURS-LÀ NE SONT PLUS DES ESTIMATIONS : elles ont été réglées à
    // l'écran, sur l'appareil, avec cette boîte, puis recopiées ici telles
    // quelles. C'est tout l'objet de l'outil.
    const PAR_DEFAUT = {
        anneau: {
            centreDroite: 99,    // centre de l'anneau, depuis le bord droit
            centreBas: 109,      // centre de l'anneau, depuis le bord bas
            diametre: 174,       // diamètre de la LIGNE MOYENNE des jauges
            epaisseur: 15        // épaisseur du trait des jauges
        },
        ancreGauche: { dx: -14, dy: 0 },
        ancreDroite: { dx: 12, dy: 0 },
        avatar: { droite: -30, bas: 56, hauteur: 376 },
        nom: { gauche: 50, bas: 152, largeur: 330, taille: 38 }
    };

    function copierProfond(o) { return JSON.parse(JSON.stringify(o)); }

    function fusionner(base, lu) {
        const sortie = copierProfond(base);
        if (!lu || typeof lu !== "object") return sortie;
        Object.keys(sortie).forEach(groupe => {
            if (!lu[groupe]) return;
            Object.keys(sortie[groupe]).forEach(cle => {
                const v = parseFloat(lu[groupe][cle]);
                if (!isNaN(v)) sortie[groupe][cle] = v;
            });
        });
        return sortie;
    }

    let memoire = null;
    try { memoire = JSON.parse(localStorage.getItem(CLE_MEMOIRE) || "null"); } catch (e) { memoire = null; }
    window.REGLAGES_HUD = fusionner(PAR_DEFAUT, memoire);

    function retenir() {
        try { localStorage.setItem(CLE_MEMOIRE, JSON.stringify(window.REGLAGES_HUD)); } catch (e) {}
    }

    // =====================================================================
    //  POSER LES RÉGLAGES SUR LES ÉLÉMENTS
    // =====================================================================
    window.appliquerReglagesHud = function () {
        const r = window.REGLAGES_HUD;

        // L'ANNEAU. Sa boîte EST le cercle de la ligne moyenne des jauges : le
        // tracé SVG est dessiné à un rayon de 50 dans un repère de 100, donc
        // exactement sur le bord de la boîte. Régler le diamètre de la boîte,
        // c'est régler le diamètre de l'anneau — il n'y a pas de conversion
        // cachée entre les deux.
        // DEUX BOÎTES, EXACTEMENT SUPERPOSÉES. Les arcs vivent sous l'image du
        // bouton (ils se voient par la fenêtre creusée dedans), les ancres
        // chiffrées par-dessus : il leur faut donc deux éléments distincts, de
        // part et d'autre de l'image dans la page. Elles sont posées ici par la
        // même boucle, avec les mêmes nombres — deux réglages tenus à la main
        // auraient fini par se décaler d'un pixel.
        const d = r.anneau.diametre;
        ["hud-anneau-boite", "hud-ancres-boite"].forEach(id => {
            const boite = document.getElementById(id);
            if (!boite) return;
            boite.style.position = "absolute";
            boite.style.pointerEvents = "none";
            boite.style.width = d + "px";
            boite.style.height = d + "px";
            boite.style.right = (r.anneau.centreDroite - d / 2) + "px";
            boite.style.bottom = (r.anneau.centreBas - d / 2) + "px";
            boite.style.top = "auto";
            boite.style.transform = "none";
        });

        // L'épaisseur du trait est donnée en pixels d'écran ; le SVG raisonne en
        // centièmes de sa boîte. La règle de trois vit ici, une seule fois.
        const unites = (r.anneau.epaisseur / d) * 100;
        document.querySelectorAll(".hud-arc-fond").forEach(a => {
            a.style.strokeWidth = (unites + 1.6);
        });
        document.querySelectorAll(".hud-arc-jauge").forEach(a => {
            a.style.strokeWidth = unites;
        });

        // LES ANCRES. Chacune est collée par son bord EXTÉRIEUR au bout de son
        // demi-anneau, puis déplacée de son propre décalage. Centrées SUR le
        // bout, celle de droite sortait de l'écran : le bouton est dans le coin.
        const gauche = document.getElementById("hud-ancre-gauche");
        if (gauche) {
            gauche.style.left = "0%";
            gauche.style.top = "50%";
            gauche.style.transform = `translate(${r.ancreGauche.dx}px, calc(-50% + ${r.ancreGauche.dy}px))`;
        }
        const droite = document.getElementById("hud-ancre-droite");
        if (droite) {
            droite.style.left = "100%";
            droite.style.top = "50%";
            droite.style.transform = `translate(calc(-100% + ${r.ancreDroite.dx}px), calc(-50% + ${r.ancreDroite.dy}px))`;
        }

        // L'AVATAR.
        const avatar = document.getElementById("hud-avatar-heros");
        if (avatar) {
            avatar.style.right = r.avatar.droite + "px";
            avatar.style.bottom = r.avatar.bas + "px";
            avatar.style.height = r.avatar.hauteur + "px";
        }

        // LE NOM. Changer sa largeur ou sa taille change la façon dont il
        // rétrécit : on redemande donc l'ajustement automatique à combat.js.
        const nom = document.getElementById("hud-nom-heros");
        if (nom) {
            nom.style.left = r.nom.gauche + "px";
            nom.style.bottom = r.nom.bas + "px";
            nom.style.width = r.nom.largeur + "px";
            nom.style.top = "auto";
            nom.style.marginBottom = "0px";
            nom.dataset.ajuste = "0";
            if (typeof window.actualiserHudHeros === "function") window.actualiserHudHeros();
        }
    };

    // =====================================================================
    //  LE CODE À ME RENVOYER
    // =====================================================================
    window.codeReglagesHud = function () {
        const r = window.REGLAGES_HUD;
        const l = (groupe, cles) => cles.map(c => `${c}: ${Math.round(r[groupe][c])}`).join(", ");
        return [
            "REGLAGES_HUD =",
            "    anneau      { " + l("anneau", ["centreDroite", "centreBas", "diametre", "epaisseur"]) + " }",
            "    ancreGauche { " + l("ancreGauche", ["dx", "dy"]) + " }",
            "    ancreDroite { " + l("ancreDroite", ["dx", "dy"]) + " }",
            "    avatar      { " + l("avatar", ["droite", "bas", "hauteur"]) + " }",
            "    nom         { " + l("nom", ["gauche", "bas", "largeur", "taille"]) + " }",
            "",
            JSON.stringify(r)
        ].join("\n");
    };

    // =====================================================================
    //  LA BOÎTE ELLE-MÊME
    // =====================================================================
    const LIGNES = [
        { titre: "Anneau des jauges", groupe: "anneau",
          deplacer: { x: "centreDroite", y: "centreBas", inverseX: true, inverseY: true },
          tailles: [{ cle: "diametre", nom: "Diamètre", pas: 2 },
                    { cle: "epaisseur", nom: "Épaisseur", pas: 1 }] },
        { titre: "Ancre chiffrée gauche", groupe: "ancreGauche",
          deplacer: { x: "dx", y: "dy", inverseY: true } },
        { titre: "Ancre chiffrée droite", groupe: "ancreDroite",
          deplacer: { x: "dx", y: "dy", inverseY: true } },
        { titre: "Avatar", groupe: "avatar",
          deplacer: { x: "droite", y: "bas", inverseX: true, inverseY: true },
          tailles: [{ cle: "hauteur", nom: "Hauteur", pas: 4 }] },
        { titre: "Nom du héros", groupe: "nom",
          deplacer: { x: "gauche", y: "bas", inverseY: true },
          tailles: [{ cle: "taille", nom: "Police", pas: 1 },
                    { cle: "largeur", nom: "Largeur", pas: 10 }] }
    ];

    let pas = 2;

    function bouton(texte, titre, action) {
        const b = document.createElement("button");
        b.textContent = texte;
        b.title = titre || "";
        b.style.cssText = "min-width: 30px; height: 26px; margin: 0 2px; padding: 0 6px;"
            + "background: #2a2118; color: #e8d5a5; border: 1px solid #8a6a3f;"
            + "border-radius: 5px; font-family: monospace; font-size: 14px; cursor: pointer;";
        b.onclick = (e) => { e.stopPropagation(); action(); };
        return b;
    }

    function bouger(groupe, cle, signe) {
        window.REGLAGES_HUD[groupe][cle] += signe * pas;
        window.appliquerReglagesHud();
        retenir();
        rafraichirValeurs();
    }

    const affichages = [];
    function rafraichirValeurs() {
        affichages.forEach(a => { a.el.textContent = a.texte(); });
    }

    function construire() {
        if (document.getElementById("reglage-hud")) return;

        const boite = document.createElement("div");
        boite.id = "reglage-hud";
        boite.style.cssText = "position: fixed; top: 10px; left: 10px; z-index: 10030;"
            + "display: none; max-height: 92vh; overflow-y: auto;"
            + "background: rgba(14, 11, 8, 0.96); border: 2px solid #8a6a3f; border-radius: 10px;"
            + "padding: 12px 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.9);"
            + "font-family: 'Segoe UI', sans-serif; color: #e8d5a5; font-size: 13px;"
            + "pointer-events: auto; width: 330px;";
        boite.onclick = (e) => e.stopPropagation();

        const titre = document.createElement("div");
        titre.textContent = "RÉGLAGE DU BLOC DU HÉROS";
        titre.style.cssText = "font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;";
        boite.appendChild(titre);

        const sous = document.createElement("div");
        sous.textContent = "Outil provisoire — les réglages sont gardés d'une session à l'autre.";
        sous.style.cssText = "font-size: 11px; color: #a89f91; margin-bottom: 10px;";
        boite.appendChild(sous);

        // LE PAS. Régler au pixel près est indispensable à la fin, et
        // interminable au début : on choisit sa vitesse.
        const ligneDuPas = document.createElement("div");
        ligneDuPas.style.cssText = "display: flex; align-items: center; gap: 6px; margin-bottom: 10px;";
        const etiquettePas = document.createElement("span");
        etiquettePas.textContent = "Pas :";
        ligneDuPas.appendChild(etiquettePas);
        [1, 2, 5, 10].forEach(v => {
            const b = bouton(String(v), `Déplacer de ${v} pixel(s) par clic`, () => {
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
            bloc.style.cssText = "border-top: 1px solid #3a2e20; padding: 8px 0;";

            const nom = document.createElement("div");
            nom.style.cssText = "display: flex; justify-content: space-between; align-items: baseline;";
            const g = document.createElement("span");
            g.textContent = ligne.titre;
            g.style.cssText = "font-weight: bold;";
            const valeur = document.createElement("span");
            valeur.style.cssText = "font-family: monospace; font-size: 11px; color: #c2a878;";
            affichages.push({ el: valeur, texte: () => {
                const o = window.REGLAGES_HUD[ligne.groupe];
                return Object.keys(o).map(k => `${k} ${Math.round(o[k])}`).join("  ");
            } });
            nom.appendChild(g); nom.appendChild(valeur);
            bloc.appendChild(nom);

            const fleches = document.createElement("div");
            fleches.style.cssText = "margin-top: 6px; display: flex; align-items: center; flex-wrap: wrap;";
            const d = ligne.deplacer;
            // Les flèches disent toujours ce qu'on VOIT : « ◀ » déplace
            // l'élément vers la gauche de l'écran, même quand la valeur
            // derrière se compte depuis le bord droit et augmente donc.
            fleches.appendChild(bouton("◀", "Vers la gauche", () => bouger(ligne.groupe, d.x, d.inverseX ? 1 : -1)));
            fleches.appendChild(bouton("▶", "Vers la droite", () => bouger(ligne.groupe, d.x, d.inverseX ? -1 : 1)));
            fleches.appendChild(bouton("▲", "Vers le haut", () => bouger(ligne.groupe, d.y, d.inverseY ? 1 : -1)));
            fleches.appendChild(bouton("▼", "Vers le bas", () => bouger(ligne.groupe, d.y, d.inverseY ? -1 : 1)));

            (ligne.tailles || []).forEach(t => {
                const etiq = document.createElement("span");
                etiq.textContent = " " + t.nom;
                etiq.style.cssText = "margin: 0 4px 0 10px; font-size: 11px; color: #a89f91;";
                fleches.appendChild(etiq);
                fleches.appendChild(bouton("−", "Réduire " + t.nom.toLowerCase(), () => {
                    window.REGLAGES_HUD[ligne.groupe][t.cle] =
                        Math.max(1, window.REGLAGES_HUD[ligne.groupe][t.cle] - t.pas);
                    window.appliquerReglagesHud(); retenir(); rafraichirValeurs();
                }));
                fleches.appendChild(bouton("+", "Agrandir " + t.nom.toLowerCase(), () => {
                    window.REGLAGES_HUD[ligne.groupe][t.cle] += t.pas;
                    window.appliquerReglagesHud(); retenir(); rafraichirValeurs();
                }));
            });

            bloc.appendChild(fleches);
            boite.appendChild(bloc);
        });

        const bas = document.createElement("div");
        bas.style.cssText = "border-top: 1px solid #3a2e20; padding-top: 10px; margin-top: 4px; display: flex; gap: 6px;";

        const zone = document.createElement("textarea");
        zone.id = "reglage-hud-code";
        zone.readOnly = true;
        zone.style.cssText = "width: 100%; height: 132px; margin-top: 8px; display: none;"
            + "background: #070504; color: #9fd2ff; border: 1px solid #3a2e20; border-radius: 6px;"
            + "font-family: monospace; font-size: 11px; padding: 6px; resize: vertical;";

        bas.appendChild(bouton("📋  Extraire le code", "Copier les réglages pour les renvoyer", () => {
            const code = window.codeReglagesHud();
            zone.value = code;
            zone.style.display = "block";
            zone.select();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code).catch(() => {});
            }
        }));
        bas.appendChild(bouton("↺  Défaut", "Tout remettre aux valeurs d'origine", () => {
            window.REGLAGES_HUD = copierProfond(PAR_DEFAUT);
            window.appliquerReglagesHud(); retenir(); rafraichirValeurs();
        }));
        boite.appendChild(bas);
        boite.appendChild(zone);

        document.body.appendChild(boite);

        const poignee = document.createElement("div");
        poignee.id = "reglage-hud-poignee";
        poignee.textContent = "⚙ HUD";
        poignee.style.cssText = "position: fixed; top: 10px; left: 10px; z-index: 10029;"
            + "background: rgba(14, 11, 8, 0.92); color: #e8d5a5; border: 1px solid #8a6a3f;"
            + "border-radius: 8px; padding: 6px 10px; cursor: pointer; display: none;"
            + "font-family: 'Segoe UI', sans-serif; font-size: 12px; letter-spacing: 1px;"
            + "box-shadow: 0 4px 12px rgba(0,0,0,0.8); user-select: none;";
        poignee.onclick = (e) => { e.stopPropagation(); window.basculerReglageHud(); };
        document.body.appendChild(poignee);

        rafraichirValeurs();
    };

    window.basculerReglageHud = function () {
        const boite = document.getElementById("reglage-hud");
        const poignee = document.getElementById("reglage-hud-poignee");
        if (!boite) return;
        const ouvrir = boite.style.display === "none";
        boite.style.display = ouvrir ? "block" : "none";
        if (poignee) poignee.style.display = ouvrir ? "none" : "block";
    };

    // LA POIGNÉE NE SE MONTRE QU'EN COMBAT : ailleurs, elle n'aurait rien à
    // régler. On surveille l'affichage de la fenêtre de combat plutôt que de
    // demander à combat.js de nous prévenir — l'outil est provisoire, il ne doit
    // laisser aucune trace dans le code du jeu.
    function surveiller() {
        const fenetre = document.getElementById("fenetre-combat");
        const poignee = document.getElementById("reglage-hud-poignee");
        const boite = document.getElementById("reglage-hud");
        if (!fenetre || !poignee || !boite) return;
        const enCombat = fenetre.style.display === "block";
        if (!enCombat) { poignee.style.display = "none"; boite.style.display = "none"; return; }
        if (boite.style.display !== "block") poignee.style.display = "block";
    }

    function demarrer() {
        construire();
        window.appliquerReglagesHud();
        setInterval(surveiller, 600);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", demarrer);
    } else {
        demarrer();
    }
})();
