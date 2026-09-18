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
//
//  UNE PARTIE DE CE FICHIER N'EST PAS PROVISOIRE : la mise à l'échelle.
//  Le bandeau ne fait pas la même largeur partout — une règle de style.css le
//  passe de 450 à 380 px sur tablette — et des mesures en pixels absolus ne
//  valent donc que sur l'appareil où elles ont été prises. Tout est rapporté à
//  la largeur du bandeau au moment du réglage. Le jour où cette boîte
//  disparaîtra, `appliquerReglagesHud` devra déménager dans combat.js, pas
//  partir avec elle.

(function () {
    "use strict";

    const CLE_MEMOIRE = "REGLAGES_HUD_IVALIS";

    // LA LARGEUR DU BANDEAU AU MOMENT OÙ LES MESURES ONT ÉTÉ PRISES.
    //
    // C'est la clé de tout ce fichier. Les valeurs ci-dessous sont des pixels,
    // et un pixel ne veut rien dire tout seul : sur tablette, style.css réduit
    // le bandeau à 380 px (@media pointer: coarse), et le bouton avec lui. Des
    // coordonnées absolues réglées sur un bandeau de 450 y tombaient 15 % trop
    // loin — l'anneau à côté du bouton, le nom ailleurs, l'avatar décollé.
    //
    // Tout est donc multiplié par (largeur réelle / largeur de référence). Le
    // bouton rétrécit, tout le reste rétrécit avec lui, et les mêmes nombres
    // valent sur n'importe quel écran.
    const LARGEUR_REFERENCE = 450;

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
            centreDroite: 103,   // centre de l'anneau, depuis le bord droit
            centreBas: 111,      // centre de l'anneau, depuis le bord bas
            diametre: 180,       // diamètre de la LIGNE MOYENNE des jauges
            epaisseur: 15        // épaisseur du trait des jauges
        },
        ancreGauche: { dx: -14, dy: 0 },
        ancreDroite: { dx: 12, dy: 0 },
        avatar: { droite: -30, bas: 56, hauteur: 376 },
        nom: { gauche: 50, bas: 152, largeur: 330, taille: 38 },
        // LA PISTE DES ÉTATS est à GAUCHE du bandeau : sa distance au bord droit
        // dépasse donc les 450 px de largeur, et c'est normal.
        etats: { droite: 470, bas: 130, taille: 46, ecart: 12 },
        // L'ENCART DE TOUR N'APPARTIENT PAS AU BANDEAU : il se place par rapport
        // à l'écran, et il n'est donc PAS mis à l'échelle avec lui. Sa largeur
        // est bornée par la fenêtre dans la feuille de style, ce qui le protège
        // déjà des petits écrans.
        encart: { gauche: 26, bas: 18, largeur: 760 }
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
    // L'échelle du bandeau à cet instant. Exposée pour combat.js, qui en a
    // besoin pour la taille du nom — lui non plus ne doit pas rester en dur.
    window.echelleHud = function () {
        const hud = document.getElementById("combat-hud-bas-droite");
        const largeur = hud ? hud.getBoundingClientRect().width : 0;
        return largeur > 0 ? largeur / LARGEUR_REFERENCE : 1;
    };

    window.appliquerReglagesHud = function () {
        const r = window.REGLAGES_HUD;
        const k = window.echelleHud();
        window.ECHELLE_HUD = k;
        const px = (v) => (v * k) + "px";

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
            boite.style.width = px(d);
            boite.style.height = px(d);
            boite.style.right = px(r.anneau.centreDroite - d / 2);
            boite.style.bottom = px(r.anneau.centreBas - d / 2);
            boite.style.top = "auto";
            boite.style.transform = "none";
        });

        // L'épaisseur du trait est donnée en pixels d'écran ; le SVG raisonne en
        // centièmes de sa boîte. La règle de trois vit ici, une seule fois — et
        // elle N'EST PAS mise à l'échelle : la boîte l'est déjà, et un rapport
        // entre deux longueurs ne dépend pas de l'unité.
        const unites = (r.anneau.epaisseur / d) * 100;
        // LE FOND NOIR FAIT EXACTEMENT LA LARGEUR DE LA JAUGE, PAS UN POIL DE PLUS.
        //
        // Il débordait de 1,6 centième de part et d'autre — trois pixels à
        // l'écran — et comme il est noir et translucide, ce liseré se lisait
        // comme une ombre coincée entre l'image du bouton et les jauges. Il n'y
        // avait aucune ombre : c'était le fond qui dépassait.
        document.querySelectorAll(".hud-arc-fond").forEach(a => {
            a.style.strokeWidth = unites;
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
            gauche.style.transform = `translate(${px(r.ancreGauche.dx)}, calc(-50% + ${px(r.ancreGauche.dy)}))`;
        }
        const droite = document.getElementById("hud-ancre-droite");
        if (droite) {
            droite.style.left = "100%";
            droite.style.top = "50%";
            droite.style.transform = `translate(calc(-100% + ${px(r.ancreDroite.dx)}), calc(-50% + ${px(r.ancreDroite.dy)}))`;
        }

        // LES PLAQUES ELLES-MÊMES rétrécissent aussi : une ancre de taille fixe
        // au bout d'un anneau réduit déborderait du bouton.
        document.querySelectorAll(".hud-ancre").forEach(a => {
            a.style.width = px(42);
            a.style.height = px(29);
        });
        document.querySelectorAll(".hud-ancre-fond").forEach(f => {
            f.style.fontSize = px(17);
        });

        // L'AVATAR.
        const avatar = document.getElementById("hud-avatar-heros");
        if (avatar) {
            avatar.style.right = px(r.avatar.droite);
            avatar.style.bottom = px(r.avatar.bas);
            avatar.style.height = px(r.avatar.hauteur);
        }

        // LA PISTE DES ÉTATS. Sa hauteur et l'écart entre les icônes sont posés
        // par combat.js au moment de la remplir : ici, seulement son ancrage.
        const etats = document.getElementById("piste-etats");
        if (etats) {
            etats.style.right = px(r.etats.droite);
            etats.style.bottom = px(r.etats.bas);
            etats.style.height = px(r.etats.taille);
            if (typeof window.actualiserPisteEtats === "function") window.actualiserPisteEtats();
        }

        // L'ENCART DE TOUR, en pixels d'écran et sans mise à l'échelle : il ne
        // vit pas dans le bandeau, il se pose dans le coin de la fenêtre.
        const encart = document.getElementById("voile-tour-encart");
        if (encart) {
            encart.style.left = r.encart.gauche + "px";
            encart.style.bottom = r.encart.bas + "px";
            encart.style.width = `min(${r.encart.largeur}px, 64vw)`;
        }

        // LE NOM. Changer sa largeur ou sa taille change la façon dont il
        // rétrécit : on redemande donc l'ajustement automatique à combat.js.
        const nom = document.getElementById("hud-nom-heros");
        if (nom) {
            nom.style.left = px(r.nom.gauche);
            nom.style.bottom = px(r.nom.bas);
            nom.style.width = px(r.nom.largeur);
            nom.style.paddingLeft = px(6);
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
        const hud = document.getElementById("combat-hud-bas-droite");
        const largeur = hud ? Math.round(hud.getBoundingClientRect().width) : 0;
        // LA NOTE DISAIT « RÉFÉRENCE ATTENDUE », ET ÇA SONNAIT COMME UNE ALERTE.
        // Il n'y a rien à corriger : les nombres sont TOUJOURS rangés dans la
        // référence de 450, quel que soit l'écran sur lequel on règle — les
        // flèches touchent la valeur rangée, l'affichage seul est mis à
        // l'échelle. Régler depuis une tablette de 380 px est donc parfaitement
        // normal, et le bloc se recopie tel quel. La note le dit maintenant.
        const note = largeur === LARGEUR_REFERENCE
            ? "réglé sur un bandeau de " + largeur + " px"
            : "réglé sur un bandeau de " + largeur + " px, valeurs exprimées dans la "
              + "référence de " + LARGEUR_REFERENCE + " px — recopiables telles quelles";
        return [
            "REGLAGES_HUD =  (" + note + ")",
            "    anneau      { " + l("anneau", ["centreDroite", "centreBas", "diametre", "epaisseur"]) + " }",
            "    ancreGauche { " + l("ancreGauche", ["dx", "dy"]) + " }",
            "    ancreDroite { " + l("ancreDroite", ["dx", "dy"]) + " }",
            "    avatar      { " + l("avatar", ["droite", "bas", "hauteur"]) + " }",
            "    etats       { " + l("etats", ["droite", "bas", "taille", "ecart"]) + " }",
            "    encart      { " + l("encart", ["gauche", "bas", "largeur"]) + " }",
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
        { titre: "Piste des états", groupe: "etats",
          deplacer: { x: "droite", y: "bas", inverseX: true, inverseY: true },
          tailles: [{ cle: "taille", nom: "Icônes", pas: 2 },
                    { cle: "ecart", nom: "Écart", pas: 2 }] },
        { titre: "Encart de tour", groupe: "encart",
          deplacer: { x: "gauche", y: "bas", inverseY: true },
          tailles: [{ cle: "largeur", nom: "Largeur", pas: 10 }] },
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
    // LE BANDEAU PEUT CHANGER DE LARGEUR SANS PRÉVENIR : une rotation de
    // tablette, une fenêtre qu'on redimensionne, une règle @media qui bascule.
    // On repose alors tous les réglages à la nouvelle échelle.
    let derniereLargeur = 0;
    function suivreLaLargeur() {
        const hud = document.getElementById("combat-hud-bas-droite");
        if (!hud) return;
        const largeur = Math.round(hud.getBoundingClientRect().width);
        if (largeur === 0 || largeur === derniereLargeur) return;
        derniereLargeur = largeur;
        window.appliquerReglagesHud();
    }

    function surveiller() {
        suivreLaLargeur();
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
        window.addEventListener("resize", () => window.appliquerReglagesHud());
        window.addEventListener("orientationchange", () => setTimeout(() => window.appliquerReglagesHud(), 200));
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", demarrer);
    } else {
        demarrer();
    }
})();
