// =========================================================================
//  IVALIS — LA DISPOSITION DU BLOC DU HÉROS ET DE L'ENCART DE TOUR
// =========================================================================
//  CE FICHIER EST CE QUI RESTE D'UN OUTIL PROVISOIRE, ET C'EST VOULU.
//
//  Le bouton de fin de tour est une IMAGE. Le disque qu'on y voit, son rebord
//  doré, sa marge transparente : rien de tout cela n'est décrit en CSS, et rien
//  ne se lit depuis le code. Placer un anneau de jauges autour de ce disque
//  revenait donc à viser à l'aveugle — le premier essai a visé quinze pixels
//  trop court, et l'anneau s'est retrouvé entièrement caché derrière le bouton.
//
//  Une boîte de réglage a donc vécu ici : quatre flèches par élément, deux de
//  plus pour les tailles, et un bouton qui recrachait les valeurs obtenues. Les
//  nombres ci-dessous en sortent — réglés à l'écran, sur l'appareil, puis
//  recopiés tels quels. L'outil a fait son travail et il est parti ; ce qui
//  reste, c'est ce qu'il réglait.
//
//  ET CE QUI RESTE N'A RIEN DE PROVISOIRE : c'est la mise à l'échelle.
//
//  Le bandeau ne fait pas la même largeur partout — une règle de style.css le
//  passe de 450 à 380 px sur tablette — et des mesures en pixels absolus ne
//  valent donc que sur l'appareil où elles ont été prises. Tout ce qui suit est
//  rapporté à la largeur du bandeau au moment du réglage, et se réduit avec
//  lui. Sans ces trois fonctions, le bloc du héros serait juste sur un écran et
//  faux sur tous les autres.

(function () {
    "use strict";

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
    // Posées sur `window` : combat.js les lit pour la taille du nom et pour la
    // piste des états, et les bancs les font varier pour vérifier que tout
    // suit. Le nom leur est resté de l'époque où on les réglait à la main.
    window.REGLAGES_HUD = {
        anneau: {
            centreDroite: 103,   // centre de l'anneau, depuis le bord droit
            centreBas: 111,      // centre de l'anneau, depuis le bord bas
            diametre: 180,       // diamètre de la LIGNE MOYENNE des jauges
            epaisseur: 15        // épaisseur du trait des jauges
        },
        ancreGauche: { dx: -14, dy: 0 },
        ancreDroite: { dx: 12, dy: 0 },
        // Agrandi d'environ 9 % (376 → 410) : il grandit vers le haut, et le
        // bord droit recule d'une dizaine de pixels pour qu'il reste centré.
        avatar: { droite: -40, bas: 56, hauteur: 410 },
        nom: { gauche: 50, bas: 152, largeur: 330, taille: 38 },
        // LA PISTE DES ÉTATS est à GAUCHE du bandeau : sa distance au bord droit
        // dépasse donc les 450 px de largeur, et c'est normal.
        etats: { droite: 470, bas: 130, taille: 46, ecart: 12 },

        // ─────────────────────────────────────────────────────────────────
        //  L'ENCART DE TOUR
        // ─────────────────────────────────────────────────────────────────
        //  SEULE SA BOÎTE EST EN PIXELS D'ÉCRAN. Tout ce qui se pose DESSUS est
        //  en pourcentages de l'image : `x` en pourcentage de sa largeur, `y` en
        //  pourcentage de sa hauteur, `taille` en pourcentage de sa largeur.
        //
        //  C'est la seule façon de n'avoir aucune surprise d'un écran à l'autre.
        //  La largeur de la plaque est bornée par la fenêtre (64vw) : sur un
        //  iPad, elle se réduit. Tout ce qui est écrit en pourcentages se réduit
        //  avec elle, dans les mêmes proportions, y compris les polices. Une
        //  taille en pixels aurait tenu bon pendant que la plaque rétrécissait
        //  autour d'elle, et le texte serait sorti du cadre.
        encart:        { gauche: 52, bas: -8, largeur: 760 },
        encartPion:    { x: -5, y: 34, taille: 29 },
        // L'AVATAR EN PIED A SES PROPRES MESURES, et il lui en fallait.
        // Le médaillon se place par son HAUT ; l'avatar monte du bas de l'écran,
        // donc il se place par son BAS. Ce ne sont pas les mêmes nombres, et les
        // faire cohabiter dans un seul groupe aurait obligé à régler l'un en
        // cassant l'autre. `hauteur` est en pourcentage de la LARGEUR de la
        // plaque, comme toutes les tailles ici : c'est ce qui la fait suivre.
        encartAvatar:  { x: -8, bas: 0, hauteur: 62 },
        encartEtats:   { x: 2, y: 78, largeur: 22, taille: 5, ecart: 1.4 },
        encartNom:     { x: 21, y: 14, taille: 8 },
        encartCarte:   { x: 27, y: 29, taille: 4 },
        encartDetail:  { x: 40, y: 39, taille: 2.4, largeur: 74 },
        encartAttente: { x: 27, y: 87, taille: 1.7 }
    };

    // =====================================================================
    //  POSER LA DISPOSITION SUR LES ÉLÉMENTS
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

        window.appliquerReglagesEncart();

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
    //  L'ENCART DE TOUR — TOUT EST LIÉ À SON IMAGE
    // =====================================================================
    //  La boîte se place en pixels d'écran ; TOUT le reste se calcule à partir
    //  de la largeur RÉELLEMENT RENDUE de la plaque. Positions et largeurs
    //  partent en pourcentages — le navigateur s'en charge alors tout seul, même
    //  si la fenêtre change de taille entre deux passages ici. Les tailles de
    //  police, elles, doivent être calculées : en CSS, un pourcentage de
    //  `font-size` se rapporte à la police du parent, pas à sa largeur.
    window.appliquerReglagesEncart = function () {
        const r = window.REGLAGES_HUD;
        const encart = document.getElementById("voile-tour-encart");
        if (!encart) return false;

        encart.style.left = r.encart.gauche + "px";
        encart.style.bottom = r.encart.bas + "px";
        encart.style.width = `min(${r.encart.largeur}px, 64vw)`;

        // La largeur rendue de la plaque : c'est l'unité de mesure de tout ce
        // qui suit. Nulle tant que rien n'est à l'écran — on repassera.
        const L = encart.getBoundingClientRect().width;
        // Rien n'est à l'écran : on ne peut rien mesurer, donc rien poser. On le
        // DIT au veilleur, qui repassera — sans quoi la demande se perdrait.
        if (L <= 0) { window.ENCART_A_REPOSER = true; return false; }
        window.ENCART_A_REPOSER = false;
        const pc = (v) => Math.max(1, (v / 100) * L);   // % de la plaque → pixels

        // LA PLAQUE PORTE SA PROPRE POLICE, et c'est un filet plus qu'un
        // réglage. Tout ce qui se pose dessus a sa taille écrite noir sur blanc
        // — mais tout ce qu'on AJOUTERA un jour sans y penser héritera de
        // celle-ci, qui suit la plaque. Sans elle, l'héritage venait du corps du
        // document : une taille fixe, qui serait restée plantée là pendant que
        // la plaque rétrécissait autour d'elle. C'est exactement le genre de
        // détail qui ne se voit que sur l'iPad du joueur.
        encart.style.fontSize = pc(r.encartDetail.taille) + "px";

        const poser = (id, groupe, extra) => {
            const el = document.getElementById(id);
            if (!el || !groupe) return;
            if (groupe.x !== undefined) el.style.left = groupe.x + "%";
            if (groupe.y !== undefined) el.style.top = groupe.y + "%";
            if (groupe.largeur !== undefined) el.style.width = groupe.largeur + "%";
            if (groupe.taille !== undefined && extra !== "largeur") {
                el.style.fontSize = pc(groupe.taille) + "px";
                // La taille de départ est notée sur l'élément : le nom et le nom
                // de technique se rétrécissent tout seuls quand ils sont trop
                // longs, et ils doivent repartir de CELLE-CI, pas d'un chiffre
                // écrit en dur dans combat.js.
                el.dataset.base = pc(groupe.taille);
            }
        };

        // LE PORTRAIT, DANS L'UNE OU L'AUTRE DE SES DEUX FORMES.
        //
        // C'est combat.js qui choisit la forme, en posant (ou non) la classe
        // `pion-avatar-entier` : un héros qui a un portrait l'a en pied, tout le
        // reste a son médaillon. On lit donc cette classe plutôt que de refaire
        // le choix ici — deux endroits qui décident de la même chose finissent
        // toujours par ne plus être d'accord.
        //
        // Les deux formes ne s'ancrent pas pareil : le médaillon par son HAUT,
        // l'avatar par son BAS (il monte du bas de l'écran). On efface donc
        // toujours l'ancrage de l'autre, sinon un `top` oublié d'un côté
        // écraserait le `bottom` de l'autre.
        const pion = document.getElementById("voile-tour-pion-boite");
        const image = document.getElementById("voile-tour-pion");
        if (pion) {
            if (pion.classList.contains("pion-avatar-entier")) {
                pion.style.left = r.encartAvatar.x + "%";
                pion.style.top = "auto";
                pion.style.bottom = r.encartAvatar.bas + "%";
                pion.style.width = "auto";
                pion.style.height = "auto";
                if (image) image.style.height = pc(r.encartAvatar.hauteur) + "px";
            } else {
                pion.style.left = r.encartPion.x + "%";
                pion.style.top = r.encartPion.y + "%";
                pion.style.bottom = "auto";
                pion.style.width = r.encartPion.taille + "%";
                pion.style.height = "auto";
                if (image) image.style.height = "";
            }
        }

        // Les états, à leur propre place. Leur taille est lue par combat.js au
        // moment de les dessiner : une image se dimensionne à la construction.
        const etats = document.getElementById("voile-tour-etats");
        if (etats) {
            etats.style.left = r.encartEtats.x + "%";
            etats.style.top = r.encartEtats.y + "%";
            etats.style.width = r.encartEtats.largeur + "%";
            etats.dataset.taille = Math.round(pc(r.encartEtats.taille));
            etats.style.gap = pc(r.encartEtats.ecart) + "px";
            // Redessiner à la prochaine occasion : la signature change de forme.
            etats.dataset.signature = "";
        }

        poser("voile-tour-nom", r.encartNom);
        poser("voile-tour-carte", r.encartCarte);
        poser("voile-tour-attente", r.encartAttente);

        const bas = document.getElementById("voile-tour-bas");
        if (bas) {
            bas.style.left = r.encartDetail.x + "%";
            bas.style.top = r.encartDetail.y + "%";
            bas.style.width = r.encartDetail.largeur + "%";
        }
        const effets = document.getElementById("voile-tour-effets");
        if (effets) effets.style.fontSize = pc(r.encartDetail.taille) + "px";

        if (typeof window.rafraichirVoileTour === "function") {
            try { window.rafraichirVoileTour(); } catch (e) {}
        }
        return true;
    };

    // =====================================================================
    //  CE QUI TIENT LA DISPOSITION À JOUR
    // =====================================================================
    //  Le bandeau peut changer de largeur sans prévenir : une rotation de
    //  tablette, une fenêtre qu'on redimensionne, une règle @media qui bascule.
    //  On repose alors tout à la nouvelle échelle.
    let derniereLargeur = 0;

    // LA POSE DE L'ENCART N'EST PAS ACQUISE UNE FOIS POUR TOUTES.
    //
    // Ce drapeau ne valait d'abord que pour le chargement : l'encart est masqué
    // au démarrage, sa plaque n'a aucune largeur, et il fallait repasser dès
    // qu'elle en avait une. Une fois posé, on n'y revenait plus jamais.
    //
    // Sauf que combat.js redemande une pose à chaque changement de forme du
    // portrait (médaillon ↔ avatar en pied), et que cette demande peut elle
    // aussi tomber sur une plaque non mesurable. Elle échouait alors en silence
    // et plus rien ne réessayait : le portrait gardait les mesures de la forme
    // précédente pour le reste du combat. On retient donc l'échec, d'où qu'il
    // vienne, et le veilleur repasse tant qu'il n'a pas réussi.
    let encartPose = false;

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
        if (!encartPose || window.ENCART_A_REPOSER) encartPose = window.appliquerReglagesEncart();
    }

    function demarrer() {
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
