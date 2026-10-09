// =========================================================================
//  IVALIS — LE CATALOGUE COMPLET DES ANIMATIONS DE COMBAT (Studio)
// =========================================================================
//  Nico : « Tu vas m'intégrer et me créer une animation dans le Studio
//  d'animation de tous ces effets. Pour rappel, la vue du token est une vue
//  de haut sur la map. Tu vas me créer l'animation et le son qui vont bien. »
//  Suit la liste de Nico, section par section : déplacements, attaques,
//  impacts et défenses, soins, contrôle, états altérés, zones, classes
//  (niveau par niveau), talents.
//
//  VUE DE DESSUS. Ce qui s'élève grossit (un bond, une nuée), ce qui tombe
//  rapetisse jusqu'au sol, l'ombre reste au sol ; un pion marche de case en
//  case (la grille du Studio), une zone couvre des hexagones entiers.
//
//  Chaque animation part du pion du joueur ; l'ennemi donne l'axe. Les
//  outils (poser, son, chemin, aura, rayon, figurant…) viennent
//  d'animations_combat.js, qui garde aussi les dix premières.
// =========================================================================

(function () {
    if (!window.OUTILS_ANIMATION || typeof window.enregistrerAnimationsCombat !== "function") return;
    const { centre, axe, hasard, COULEURS, ROUGE, Z, BASE } = window.OUTILS_ANIMATION;
    const deg = (rad) => rad * 180 / Math.PI;

    // --- LES TEINTES ------------------------------------------------------
    const VERT = "sepia(1) saturate(5) hue-rotate(55deg) brightness(0.95)";
    const GIVRE = "saturate(0.45) hue-rotate(170deg) brightness(1.25)";
    const VIOLET = "sepia(1) saturate(4) hue-rotate(225deg) brightness(0.9)";
    const SOMBRE = "brightness(0.55) saturate(0.6)";
    const OR = "brightness(1.35) drop-shadow(0 0 10px #ffd700)";
    const GRIS = "grayscale(1) brightness(0.65)";
    const ROSE = "sepia(0.6) saturate(3) hue-rotate(290deg) brightness(1.1)";
    const ORANGE = "sepia(1) saturate(5) hue-rotate(-20deg) brightness(1.15)";
    const ELEC = "brightness(1.8) saturate(0.4) hue-rotate(180deg)";
    const ALLIE = "hue-rotate(110deg) saturate(1.2)";
    const ZOMBIE = "grayscale(0.5) sepia(0.7) hue-rotate(45deg) saturate(1.6) brightness(0.8)";
    const ILLUSION = "hue-rotate(200deg) saturate(1.4) brightness(1.2)";

    // --- LES MORCEAUX COMMUNS ----------------------------------------------
    // Où sont les deux pions, et l'axe héros → ennemi.
    const lieux = ({ lanceur, cible, calque }) => {
        const a = centre(lanceur, calque), b = centre(cible, calque);
        return { a, b, v: axe(a, b) };
    };
    const etat = (o, calque, pion, texte) => o.texte(calque, pion, texte, COULEURS.etat);
    // Tenir une teinte sur un pion le temps de l'animation (elle s'en va au nettoyage).
    const teinte = (o, el, filtre, duree) => o.teinter(el, [{ filter: "none" }, { filter: filtre }], { duration: duree || 300, fill: "forwards" });
    const deteindre = (o, el, filtre, duree) => o.teinter(el, [{ filter: filtre }, { filter: "none" }], { duration: duree || 400, fill: "forwards" });
    // L'entaille d'une lame, en travers de l'axe du coup.
    const entaille = (o, calque, pos, angle, p = {}) => {
        const t = pos.t * (p.taille || 1.5);
        const d = o.poser(calque, pos.x + (p.dx || 0), pos.y + (p.dy || 0), `width:${t}px; height:${t}px; z-index:${Z.haut};
            transform:translate(-50%,-50%) rotate(${deg(angle) + (p.tourne || 0)}deg);`,
            `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M30 12 Q 62 50 30 88" fill="none" stroke="${p.couleur || "#fff"}"
               stroke-width="${p.epaisseur || 7}" stroke-linecap="round" stroke-dasharray="120" stroke-dashoffset="120"
               style="filter:drop-shadow(0 0 6px ${p.lueur || "#fff"}) drop-shadow(0 0 12px ${p.lueur2 || "#9cf"})"/></svg>`);
        return o.teinter(d.querySelector("path"), [{ strokeDashoffset: 120, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.5 },
                                                  { strokeDashoffset: -120, opacity: 0 }], { duration: p.duree || 380, delay: p.retard || 0, easing: "ease-out" })
            .then(() => d.remove());
    };
    // Trois griffures parallèles (un fauve, un zombie).
    const griffes = (o, calque, pos, angle, couleur) => Promise.all([-1, 0, 1].map(k => entaille(o, calque, pos, angle,
        { taille: 1.1, epaisseur: 4, couleur, lueur: couleur, lueur2: couleur, dx: -Math.sin(angle) * k * pos.t * 0.16, dy: Math.cos(angle) * k * pos.t * 0.16, retard: (k + 1) * 50 })));
    // UN COUP au corps à corps, de `de` vers `vers` (n'importe quels pions).
    const frapper = async (o, calque, de, vers, p = {}) => {
        const A = centre(de, calque), B = centre(vers, calque), v = axe(A, B);
        if (p.sonElan !== false) o.son(p.sonElan || "lame-souffle", p.retardSon === undefined ? 150 : p.retardSon);
        const elan = o.elan(de, A, B, p.elan || {});
        await o.attendre(p.contact || 330);
        if (p.sonImpact !== false) o.son(p.sonImpact || "lame-impact");
        if (p.valeur) o.jauge(calque, vers, 40, Math.max(2, 40 - Math.abs(parseInt(p.valeur, 10) || 8)), 40, p.valeur, p.couleur || COULEURS.degats, p.couleur || COULEURS.degats);
        await Promise.all([elan,
            p.griffes ? griffes(o, calque, B, v.angle, p.griffes) : entaille(o, calque, B, v.angle, p.entaille || {}),
            o.secouer(vers, B.t * (p.force || 0.1), 320, v), o.eclat(vers, p.filtre || ROUGE),
            o.gerbe(calque, B.x, B.y, { nombre: 8, dist: B.t * 0.7, angle: v.angle, eventail: Math.PI, couleurs: p.gerbe || ["#fff", "#ffd6d6"], taille: 5 })]);
        return { A, B, v };
    };
    // Encaisser un coup venu de `depuis` : secousse, éclat, chiffre.
    const encaisser = (o, calque, pion, depuis, p = {}) => {
        const P = centre(pion, calque), D = centre(depuis, calque), recul = axe(D, P);
        if (p.valeur) o.jauge(calque, pion, 40, Math.max(2, 40 - Math.abs(parseInt(p.valeur, 10) || 8)), 40, p.valeur, p.couleur || COULEURS.degats, p.couleur || COULEURS.degats);
        return Promise.all([o.secouer(pion, P.t * (p.force || 0.12), 360, recul), o.eclat(pion, p.filtre || ROUGE, 460)]);
    };
    // Un projectile magique (une orbe) de A vers B.
    const orbe = (o, calque, A, B, p = {}) => o.projectile(calque, A, B, { taille: p.taille || 0.36, arc: p.arc === undefined ? 0.3 : p.arc,
        duree: p.duree || Math.min(800, 320 + axe(A, B).d * 0.8), traine: p.traine, easing: p.easing,
        style: `background:radial-gradient(circle at 40% 40%, ${p.coeur || "#fff"}, ${p.couleur} 55%, rgba(0,0,0,0) 100%); box-shadow:0 0 14px ${p.couleur}, 0 0 28px ${p.couleur};` });
    // De la poussière au pied d'un pion.
    const poussiere = (o, calque, pt, p = {}) => o.gerbe(calque, pt.x, pt.y + pt.t * 0.2, { nombre: p.n || 6, dist: pt.t * (p.dist || 0.38),
        couleurs: p.couleurs || ["#c4ad86", "#8a7454"], taille: p.taille || 6, tailleMin: 3, duree: p.duree || 560 });
    // Des particules qui CONVERGENT vers un point (une énergie qu'on rassemble).
    const rassembler = (o, calque, pos, p = {}) => Promise.all(Array.from({ length: p.n || 8 }, (_, i) => {
        const ang = (i / (p.n || 8)) * Math.PI * 2 + hasard(-0.3, 0.3), r = pos.t * (p.rayon || 1.1);
        return o.filer(calque, { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r, t: pos.t }, pos,
                       { couleur: p.couleur, taille: p.taille || 0.12, duree: p.duree || 520, retard: hasard(0, p.etale || 200), contenu: p.contenu });
    }));
    // Une marque au sol (un sceau qui tourne lentement) sous un pion.
    const sceau = (o, calque, pos, couleur, p = {}) => {
        const t = pos.t * (p.taille || 1.25);
        const d = o.poser(calque, pos.x, pos.y, `width:${t}px; height:${t}px; z-index:${Z.sol};`,
            `<svg viewBox="-50 -50 100 100" width="100%" height="100%" style="overflow:visible; filter:drop-shadow(0 0 6px ${couleur})">
               <circle r="44" fill="none" stroke="${couleur}" stroke-width="3"/><circle r="34" fill="none" stroke="${couleur}" stroke-width="1.5" stroke-dasharray="6 5"/>
               <polygon points="0,-34 29.4,17 -29.4,17" fill="none" stroke="${couleur}" stroke-width="2"/>
               <polygon points="0,34 29.4,-17 -29.4,-17" fill="none" stroke="${couleur}" stroke-width="2"/></svg>`);
        o.teinter(d, [{ transform: `${BASE} rotate(0deg) scale(0.3)`, opacity: 0 }, { transform: `${BASE} rotate(40deg) scale(1)`, opacity: 1, offset: 0.25 },
                      { transform: `${BASE} rotate(${p.tours || 160}deg) scale(1)`, opacity: 1 }],
                  { duration: p.duree || 1800, easing: "ease-out", fill: "forwards" });
        return d;
    };
    // UNE ZONE : le dessin de chaque élément, et ce qui l'anime.
    const FONDS_ZONE = {
        feu: "radial-gradient(circle, rgba(255,220,110,0.9), rgba(255,120,25,0.75) 45%, rgba(170,30,0,0.55) 85%)",
        glace: "radial-gradient(circle, rgba(255,255,255,0.92), rgba(175,232,255,0.72) 50%, rgba(60,150,220,0.55) 88%)",
        foudre: "radial-gradient(circle, rgba(225,242,255,0.88), rgba(95,145,255,0.62) 50%, rgba(30,40,140,0.58) 88%)",
        poison: "radial-gradient(circle, rgba(205,255,125,0.82), rgba(110,190,40,0.66) 50%, rgba(40,90,10,0.58) 88%)",
        soin: "radial-gradient(circle, rgba(220,255,225,0.85), rgba(110,230,140,0.6) 50%, rgba(30,120,60,0.45) 88%)"
    };
    const animerZone = (o, calque, pts, type, duree) => {
        const fins = [];
        pts.forEach((pt, i) => {
            const r = (pt.t || 60) * 0.35;
            if (type === "feu") fins.push(o.gerbe(calque, pt.x, pt.y, { nombre: 5, dist: r, monte: r * 1.4, couleurs: ["#ffd25a", "#ff7a1a", "#ff4500"], taille: 7, duree: 900, etale: duree * 0.6 }));
            if (type === "glace") fins.push(o.gerbe(calque, pt.x, pt.y, { nombre: 4, dist: r, couleurs: ["#ffffff", "#bdf3ff"], taille: 5, carre: true, duree: 800, etale: duree * 0.6 }));
            if (type === "poison") fins.push(o.gerbe(calque, pt.x, pt.y, { nombre: 4, dist: r * 0.6, monte: r, couleurs: ["#b5ff4c", "#7dd321"], taille: 9, tailleMin: 4, duree: 900, etale: duree * 0.6 }));
            if (type === "foudre") fins.push(o.attendre(hasard(0, duree * 0.6)).then(() => o.eclair(calque,
                { x: pt.x - r, y: pt.y + hasard(-r, r) * 0.5, t: pt.t }, { x: pt.x + r, y: pt.y + hasard(-r, r) * 0.5, t: pt.t }, { largeur: 0.4, duree: 300, segments: 5 })));
        });
        return Promise.all(fins);
    };
    // Poser une zone sur des cases : apparition en cascade, vie, effacement.
    const zone = async (o, calque, pts, type, p = {}) => {
        const cases = pts.map((pt, i) => o.hexagone(calque, pt, { fond: FONDS_ZONE[type], opacite: p.opacite || 0.85, retard: i * (p.cascade || 70), duree: 420 }));
        await o.attendre(420 + pts.length * (p.cascade || 70));
        if (p.vie !== false) await Promise.all([o.pulser(cases, { duree: 520, fois: 2, eclat: 1.35 }), animerZone(o, calque, pts, type, p.duree || 1000)]);
        return cases;
    };
    const effacerTout = (o, els, p = {}) => Promise.all(els.map((e, i) => o.attendre(i * (p.cascade || 40)).then(() => o.effacer(e, { duree: p.duree || 380, echelle: p.echelle || 0.7 }))));
    // UN ALLIÉ, UN AUTRE ENNEMI… sur une case voisine (direction `tour` en radians
    // par rapport à l'axe héros → ennemi).
    const allie = (o, sc, tour, p = {}) => {
        const { a, v } = lieux(sc);
        const pos = o.voisine(sc.lanceur, a, o.tourner(v, tour));
        return { el: o.figurant(sc.calque, sc.lanceur, pos, { filtre: p.filtre || ALLIE, opacite: p.opacite }), pos };
    };
    const autreEnnemi = (o, sc, tour, p = {}) => {
        const { b, v } = lieux(sc);
        const pos = o.voisine(sc.cible, b, o.tourner(v, tour));
        return { el: o.figurant(sc.calque, sc.cible, pos, { filtre: p.filtre || "", opacite: p.opacite }), pos };
    };
    // Faire apparaître un figurant (il « tombe » du ciel, vu de dessus).
    const atterrir = (o, el, p = {}) => o.teinter(el, [
        { transform: `${BASE} scale(${p.depuis || 1.6})`, opacity: 0 },
        { transform: `${BASE} scale(0.94)`, opacity: 1, offset: 0.8 },
        { transform: `${BASE} scale(1)`, opacity: 1 }
    ], { duration: p.duree || 560, easing: "ease-in", fill: "forwards" });
    // Un pion qui SORT DU SOL (un zombie qui se relève) : petit, sombre, puis à taille.
    const sortirDuSol = (o, el, p = {}) => o.teinter(el, [
        { transform: `${BASE} scale(0.4) rotate(-25deg)`, opacity: 0 },
        { transform: `${BASE} scale(1.05) rotate(6deg)`, opacity: 1, offset: 0.7 },
        { transform: `${BASE} scale(1) rotate(0deg)`, opacity: 1 }
    ], { duration: p.duree || 800, easing: "ease-out", fill: "forwards" });
    // UN PION À TERRE (vu de dessus : il pivote, pâlit, s'affaisse).
    const aTerre = (o, el, tourne, p = {}) => o.bouger(el, [
        { transform: "rotate(0deg) scale(1)", filter: "none", opacity: 1 },
        { transform: `rotate(${tourne}deg) scale(0.9)`, filter: GRIS, opacity: p.opacite || 0.6 }
    ], { duration: p.duree || 600, easing: "ease-in", fill: "forwards" });
    const deTerre = (o, el, tourne, p = {}) => o.bouger(el, [
        { transform: `rotate(${tourne}deg) scale(0.9)`, filter: GRIS, opacity: p.opacite || 0.6 },
        { transform: "rotate(0deg) scale(1.06)", filter: "brightness(1.3)", opacity: 1, offset: 0.75 },
        { transform: "rotate(0deg) scale(1)", filter: "none", opacity: 1 }
    ], { duration: p.duree || 800, easing: "ease-out", fill: "forwards" });
    // MARCHER : n cases dans une direction, puis revenir chez soi.
    const marcher = async (sc, o, p) => {
        const { a, v } = lieux(sc);
        const el = p.qui || sc.lanceur;
        const depart = p.qui ? centre(p.qui, sc.calque) : a;
        const dir = p.dir ? p.dir(v) : v;
        const pts = o.chemin(el, depart, dir, p.cases || 3, { zigzag: p.zigzag });
        if (p.avant) await p.avant(depart, pts);
        await o.parcourir(el, depart, pts, { duree: p.duree || 380, hauteur: p.hauteur, tangue: p.tangue, rythme: p.rythme, easing: p.easing,
            apresPas: (pt, i) => { if (p.son) o.son(p.son); if (p.pas) p.pas(pt, i, pts); } });
        if (p.apres) await p.apres(pts);
        await o.attendre(p.pause === undefined ? 250 : p.pause);
        // En vraies conditions, le pion RESTE sur sa nouvelle case (o.arriver) ;
        // `revenir` : une démonstration qui le ramène chez lui.
        if (p.revenir) await o.rentrer(el);
        else await o.arriver(el, pts[pts.length - 1]);
        return pts;
    };

    // =====================================================================
    //  LE TERRAIN ET LE CIBLAGE (Nico : « pour les sorts style persistance de
    //  terrain, murs de pierre, qu'on puisse cliquer sur les hexagones à cibler ;
    //  et mets-y les mêmes que dans le jeu »)
    // =====================================================================
    //  Une animation qui porte `ciblage` se vise sur la carte du Studio : ses
    //  cases arrivent dans `sc.cases`. Le dessin vient du jeu quand la scène le
    //  fournit (sc.terrain : les nappes de combat.js, la roche et les gravats de
    //  murs_terre.js), et ce qui est posé RESTE sur la carte, comme en combat.
    const ciblees = (sc, o, auto) => {
        if (!Array.isArray(sc.cases) || !sc.cases.length || !o.grille) return auto();
        const t = centre(sc.lanceur, sc.calque).t;
        return sc.cases.map(c => { const px = o.grille.pixel(c.q, c.r); return { x: px.x, y: px.y, q: c.q, r: c.r, t }; });
    };
    const memeCase = (a, b) => !!(a && b && a.q !== undefined && a.q === b.q && a.r === b.r);
    // Le pion (héros ou ennemi) qui se tient sur cette case.
    const pionSur = (sc, o, pt) => [sc.lanceur, sc.cible].find(el => el && memeCase(o.caseDe(el), pt)) || null;
    // La case du milieu d'une zone (la plus proche du centre de ses cases).
    const milieu = (pts) => {
        const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        return pts.slice().sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my))[0];
    };
    // Les nappes du jeu (TYPES_ZONES_PERSISTANTES, moteur_effets.js) : la foudre y est « électrique ».
    const NAPPE_JEU = { feu: "feu", glace: "glace", foudre: "electrique", poison: "poison", soin: "soin" };
    // Les rangs des cases, du haut de l'écran vers le bas.
    const duHautVersLeBas = (pts) => pts.map((pt, i) => i).sort((i, j) => (pts[i].y - pts[j].y) || (i - j));
    const VOISINS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    // UN COMBATTANT SOUS UN MUR QUI SE LÈVE est repoussé sur une case voisine
    // libre, loin de `loinDe` (comme en combat) — jamais sur une case murée.
    const repousser = async (sc, o, pion, interdites, loinDe) => {
        const c = o.caseDe(pion);
        if (!c || !o.grille) { await o.secouer(pion, 4, 300); return false; }
        const P = centre(pion, sc.calque);
        const dest = VOISINS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }))
            .filter(x => o.grille.libre(x.q, x.r) && !interdites.some(i => memeCase(i, x)))
            .map(x => { const px = o.grille.pixel(x.q, x.r); return { ...x, x: px.x, y: px.y, t: P.t, s: loinDe ? Math.hypot(px.x - loinDe.x, px.y - loinDe.y) : 0 }; })
            .sort((m, k) => k.s - m.s)[0];
        if (!dest) { await o.secouer(pion, 4, 300); return false; }
        await o.parcourir(pion, P, [dest], { duree: 300, easing: "ease-out" });
        poussiere(o, sc.calque, dest, { n: 6 });
        await o.attendre(150);
        return o.arriver(pion, dest);
    };
    // Les murs levés RESTENT sur la carte (sc.terrain) : leurs dessins
    // d'animation cèdent la place aux murs de la carte, reliés entre eux.
    // Sans terrain, ils s'effacent.
    const garderMurs = async (o, sc, pts, murs) => {
        if (sc.terrain && typeof sc.terrain.poserMurs === "function" && sc.terrain.poserMurs(pts)) {
            murs.forEach(m => m && m.remove());
            return true;
        }
        await o.attendre(600);
        await effacerTout(o, murs.filter(Boolean), { duree: 350 });
        return false;
    };
    // DES GRAVATS QUI RESTENT (sc.terrain) : les tas du jeu, posés en cascade.
    const tasDeGravats = (o, sc, pts, p = {}) => {
        if (sc.terrain && typeof sc.terrain.poserGravats === "function") {
            const tas = sc.terrain.poserGravats(pts);
            tas.forEach((el, i) => {
                el.dataset.ancre = "libre";
                o.teinter(el, [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 0.95, transform: "scale(1)" }],
                          { duration: 420, delay: i * (p.cascade || 0), easing: "ease-out", fill: "both" });
            });
            return { tas, restent: true };
        }
        return { tas: pts.map((pt, i) => o.gravats(sc.calque, pt, { retard: i * (p.cascade || 0), nombre: p.nombre })), restent: false };
    };
    const CIBLAGE_ZONE = { genre: "zone", min: 1, max: 19,
        consigne: "Touche les cases de la zone sur la carte (19 au plus) — touche-en une de nouveau pour l'enlever — puis « Lancer »." };

    const A = [];
    const ajouter = (section, sousSection, liste) => liste.forEach(x => A.push({ section, ...(sousSection ? { sousSection } : {}), ...x }));

    // =====================================================================
    //  1. DÉPLACEMENTS
    // =====================================================================
    ajouter(1, null, [
        {
            id: "marche", nom: "Marche case par case", sens: "sur soi",
            description: "Le pion avance d'hexagone en hexagone ; à chaque case, un peu de poussière et un point d'énergie dépensé.",
            async jouer(sc, o) {
                await marcher(sc, o, { cases: 3, son: "pas", pas: (pt) => { poussiere(o, sc.calque, pt, { n: 4 }); o.texte(sc.calque, sc.lanceur, "-1 ⚡", COULEURS.attention, { taille: 15 }); } });
            }
        },
        {
            id: "marche-difficile", nom: "Marche en terrain difficile", sens: "sur soi",
            description: "Des gravats sur le chemin : le pion s'enfonce à chaque pas, lourd, dans un nuage de poussière ; chaque case coûte double.",
            async jouer(sc, o) {
                await marcher(sc, o, { cases: 2, duree: 680, hauteur: 0.95, tangue: 5, son: "pas-lourd",
                    avant: async (a, pts) => { pts.forEach((pt, i) => o.gravats(sc.calque, pt, { retard: i * 90 })); await o.attendre(450); },
                    pas: (pt) => { poussiere(o, sc.calque, pt, { n: 10, dist: 0.55, taille: 8 }); o.texte(sc.calque, sc.lanceur, "-2 ⚡", COULEURS.attention, { taille: 15 }); } });
            }
        },
        {
            id: "marche-gelee", nom: "Marche gelée (Glacé)", sens: "sur soi",
            description: "Le héros bleuit de givre ; ses pas sont raides, le sol gèle sous chacun d'eux, chaque case coûte double.",
            async jouer(sc, o) {
                etat(o, sc.calque, sc.lanceur, "Glacé : marche ×2");
                await teinte(o, sc.lanceur, GIVRE);
                await marcher(sc, o, { cases: 2, duree: 560, hauteur: 1, tangue: 7, easing: "cubic-bezier(.8,0,.2,1)", son: "pas-givre",
                    pas: (pt) => {
                        o.hexagone(sc.calque, pt, { fond: FONDS_ZONE.glace, opacite: 0.55, duree: 300 });
                        o.gerbe(sc.calque, pt.x, pt.y, { nombre: 6, dist: pt.t * 0.45, couleurs: ["#ffffff", "#bdf3ff"], taille: 5, carre: true, duree: 600 });
                        o.texte(sc.calque, sc.lanceur, "-2 ⚡", COULEURS.attention, { taille: 15 });
                    } });
            }
        },
        {
            id: "marche-vargen", nom: "Marche du Vargen", sens: "sur soi",
            description: "Foulée légère et rapide : quatre cases d'un trait, des silhouettes laissées derrière, l'énergie divisée par deux.",
            async jouer(sc, o) {
                o.texte(sc.calque, sc.lanceur, "Foulée du Vargen : ½ ⚡", COULEURS.neutre);
                const { a } = lieux(sc);
                let prec = a;
                await marcher(sc, o, { cases: 4, duree: 210, hauteur: 1.08, son: "pas-leger",
                    pas: (pt) => { o.fantome(sc.calque, sc.lanceur, prec, { opacite: 0.4 }); prec = pt; } });
            }
        },
        {
            id: "bond", nom: "Bond", sens: "vers l'ennemi",
            description: "Vu de haut : le pion s'élève (il grossit), survole deux cases en arc pendant que son ombre glisse au sol, et se reçoit dans la poussière.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const pts = o.chemin(sc.lanceur, a, v, 2);
                const fin = pts[pts.length - 1] || a;
                const dx = fin.x - a.x, dy = fin.y - a.y;
                const ombre = o.ombre(sc.calque, a);
                o.son("bond-envol");
                const vol = o.bouger(sc.lanceur, [
                    { transform: "translate(0,0) scale(1)" },
                    { transform: `translate(${dx * 0.08}px, ${dy * 0.08}px) scale(0.9)`, offset: 0.14 },
                    { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(1.42)`, offset: 0.55 },
                    { transform: `translate(${dx}px, ${dy}px) scale(0.93)`, offset: 0.9 },
                    { transform: `translate(${dx}px, ${dy}px) scale(1)` }
                ], { duration: 900, easing: "ease-in-out", fill: "forwards" });
                o.teinter(ombre, [{ transform: `${BASE} translate(0px, 0px) scale(1)`, opacity: 1 },
                                  { transform: `${BASE} translate(${dx * 0.5}px, ${dy * 0.5}px) scale(0.5)`, opacity: 0.45, offset: 0.55 },
                                  { transform: `${BASE} translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 }],
                          { duration: 900, easing: "ease-in-out", fill: "forwards" });
                await o.attendre(810);
                o.son("reception");
                o.onde(sc.calque, fin, { couleur: "#c8b08a", taille: 0.9, duree: 500, echelle: 1.8 });
                poussiere(o, sc.calque, fin, { n: 12, dist: 0.65 });
                await vol;
                o.texte(sc.calque, sc.lanceur, "Bond !", COULEURS.neutre);
                await o.attendre(300);
                await o.arriver(sc.lanceur, fin);
            }
        },
        {
            id: "repli", nom: "Repli", sens: "vers l'ennemi",
            description: "Le héros frappe, puis recule de trois cases d'un trait, sans que l'ennemi puisse le frapper au passage.",
            async jouer(sc, o) {
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8" });
                o.icone(sc.calque, centre(sc.lanceur, sc.calque), "↩️", { taille: 0.45, duree: 1100 });
                o.son("repli");
                o.texte(sc.calque, sc.lanceur, "Repli : sans opportunité", COULEURS.neutre);
                let prec = centre(sc.lanceur, sc.calque);
                await marcher(sc, o, { cases: 3, duree: 190, hauteur: 1.03, dir: (v) => o.tourner(v, Math.PI),
                    pas: (pt) => { o.fantome(sc.calque, sc.lanceur, prec, { opacite: 0.35 }); prec = pt; } });
            }
        },
        {
            id: "pas-retraite", nom: "Pas de retraite offert par l'arme", sens: "vers l'ennemi",
            description: "Après la frappe, le héros recule d'une case, gratuitement : une empreinte dorée marque le pas offert.",
            async jouer(sc, o) {
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8" });
                await marcher(sc, o, { cases: 1, duree: 320, son: "pas-leger", dir: (v) => o.tourner(v, Math.PI),
                    pas: (pt) => {
                        o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,230,140,0.7), rgba(226,184,79,0.25) 70%)", duree: 300 });
                        o.texte(sc.calque, sc.lanceur, "Pas gratuit", "#ffd700");
                    } });
            }
        },
        {
            id: "fuite-peur", nom: "Fuite sous la Peur", sens: "sur soi",
            description: "Le héros tremble, s'assombrit, puis détale à l'opposé de l'ennemi en titubant.",
            async jouer(sc, o) {
                o.son("peur");
                o.icone(sc.calque, centre(sc.lanceur, sc.calque), "😱", { duree: 1300 });
                etat(o, sc.calque, sc.lanceur, "Peur : il s'enfuit !");
                teinte(o, sc.lanceur, SOMBRE);
                await o.secouer(sc.lanceur, 4, 500);
                o.son("course");
                await marcher(sc, o, { cases: 3, duree: 230, tangue: 12, hauteur: 1.06, zigzag: 0.4, dir: (v) => o.tourner(v, Math.PI),
                    pas: (pt) => o.gerbe(sc.calque, pt.x, pt.y, { nombre: 3, dist: pt.t * 0.4, couleurs: ["#bfe6ff", "#8ac8ff"], taille: 4, duree: 400 }) });
            }
        },
        {
            id: "fuite-confusion", nom: "Fuite sous la Confusion", sens: "sur soi",
            description: "Des points d'interrogation tournent autour du héros ; il part au hasard, en zigzag, en tournant sur lui-même.",
            async jouer(sc, o) {
                o.son("confusion");
                o.etoiles(sc.calque, centre(sc.lanceur, sc.calque), { signe: "?", couleur: "#d6a8ff", duree: 1900 });
                etat(o, sc.calque, sc.lanceur, "Confusion : course folle");
                teinte(o, sc.lanceur, VIOLET);
                await o.attendre(300);
                o.son("course");
                await marcher(sc, o, { cases: 3, duree: 280, tangue: 35, zigzag: 1.3, dir: (v) => o.tourner(v, hasard(-2.5, 2.5)) });
            }
        },
        {
            id: "entree-zone", nom: "Entrée dans une zone persistante", sens: "sur soi",
            description: "Trois cases piégées : le héros y marche ; la première s'embrase, la deuxième gèle, la troisième crépite d'étincelles.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const pts = o.chemin(sc.lanceur, a, o.tourner(v, Math.PI / 2), 3);
                const types = ["feu", "glace", "foudre"];
                pts.forEach((pt, i) => o.nappe(sc.calque, pt, NAPPE_JEU[types[i]], { fond: FONDS_ZONE[types[i]], opacite: 0.7, retard: i * 80 }));
                await o.attendre(500);
                await o.parcourir(sc.lanceur, a, pts, { duree: 420, apresPas: (pt, i) => {
                    o.son("pas");
                    if (types[i] === "feu") {
                        o.son("brule"); o.eclat(sc.lanceur, ORANGE, 500);
                        o.gerbe(sc.calque, pt.x, pt.y, { nombre: 10, dist: pt.t * 0.5, monte: pt.t * 0.6, couleurs: ["#ffd25a", "#ff7a1a", "#ff4500"], taille: 8, duree: 700 });
                        o.texte(sc.calque, sc.lanceur, "-3 🔥", COULEURS.degats);
                    } else if (types[i] === "glace") {
                        o.son("glace-impact"); o.eclat(sc.lanceur, GIVRE, 500);
                        o.onde(sc.calque, pt, { couleur: "#bdf3ff", taille: 0.8, duree: 500, echelle: 1.6 });
                        o.texte(sc.calque, sc.lanceur, "Glacé !", COULEURS.etat);
                    } else {
                        o.son("electrique"); o.eclat(sc.lanceur, ELEC, 500);
                        for (let k = 0; k < 3; k++) o.eclair(sc.calque, { x: pt.x - pt.t * 0.5, y: pt.y + hasard(-20, 20), t: pt.t }, { x: pt.x + pt.t * 0.5, y: pt.y + hasard(-20, 20), t: pt.t }, { largeur: 0.4, duree: 360, retard: k * 90, segments: 6 });
                        o.texte(sc.calque, sc.lanceur, "Électrifié !", COULEURS.etat);
                    }
                } });
                await o.attendre(600);
                await o.arriver(sc.lanceur, pts[pts.length - 1]);
            }
        },
        {
            id: "hemorragie-interne", nom: "Hémorragie interne", sens: "sur soi",
            description: "À chaque case traversée, le héros pâlit d'un éclat rouge et perd des points de vie ; des gouttes marquent son chemin.",
            async jouer(sc, o) {
                etat(o, sc.calque, sc.lanceur, "Hémorragie interne");
                await marcher(sc, o, { cases: 3, duree: 460, son: "pas", pas: (pt) => {
                    o.son("saignement");
                    o.eclat(sc.lanceur, ROUGE, 380);
                    o.gerbe(sc.calque, pt.x, pt.y + pt.t * 0.15, { nombre: 6, dist: pt.t * 0.35, couleurs: ["#b0101c", "#e03040"], taille: 6, duree: 600 });
                    o.texte(sc.calque, sc.lanceur, "-2", COULEURS.degats, { taille: 16 });
                } });
            }
        },
        {
            id: "arrivee-renfort", nom: "Arrivée d'un combattant ou d'un renfort", sens: "vers l'ennemi",
            description: "Un cercle s'ouvre au sol près de l'ennemi ; un nouveau combattant y tombe du ciel (vu de haut, il descend vers la carte) et se pose dans la poussière.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pos = o.voisine(sc.cible, b, o.tourner(v, 0.6));
                o.son("apparition");
                const cercle = o.hexagone(sc.calque, pos, { fond: "radial-gradient(circle, rgba(255,240,200,0.2) 30%, rgba(226,184,79,0.75) 60%, rgba(120,60,20,0) 80%)" });
                o.onde(sc.calque, pos, { couleur: "#e2b84f", taille: 1, duree: 700, echelle: 1.5 });
                await o.attendre(400);
                const f = o.figurant(sc.calque, sc.cible, pos, { opacite: 0 });
                await atterrir(o, f, {});
                o.son("reception");
                poussiere(o, sc.calque, pos, { n: 10, dist: 0.6 });
                o.texte(sc.calque, f, "Renfort !", COULEURS.attention);
                await o.attendre(900);
                await Promise.all([o.effacer(f, { duree: 400 }), o.effacer(cercle)]);
            }
        },
        {
            id: "apparition-illusion", nom: "Apparition d'une Illusion", sens: "sur soi",
            description: "Des éclats irisés convergent à côté du héros et forment son double, translucide et changeant.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const pos = o.voisine(sc.lanceur, a, o.tourner(v, Math.PI / 2));
                o.son("illusion");
                await rassembler(o, sc.calque, pos, { couleur: "#c9a8ff", n: 12, duree: 600, etale: 250 });
                const f = o.figurant(sc.calque, sc.lanceur, pos, { filtre: ILLUSION, opacite: 0 });
                await o.teinter(f, [{ opacity: 0, filter: `${ILLUSION} blur(4px)` }, { opacity: 0.8, filter: ILLUSION }], { duration: 450, fill: "forwards" });
                o.texte(sc.calque, f, "Illusion", "#c9a8ff");
                await o.teinter(f, [{ filter: ILLUSION, opacity: 0.8 }, { filter: "hue-rotate(260deg) saturate(1.4) brightness(1.3)", opacity: 0.6 }, { filter: ILLUSION, opacity: 0.8 }],
                                { duration: 900, iterations: 2 });
                await o.effacer(f);
            }
        },
        {
            id: "deploiement", nom: "Déploiement des pions en début de combat", sens: "sur soi",
            description: "Le plateau se vide, puis chaque camp se pose : la case du héros s'illumine d'or et il descend dessus, puis l'ennemi sur sa case rouge.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                await Promise.all([sc.lanceur, sc.cible].map(el => o.teinter(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" })));
                o.son("deploiement");
                const poser = async (el, pos, fond) => {
                    const h = o.hexagone(sc.calque, pos, { fond });
                    await o.attendre(150);
                    o.lacher(el);
                    await o.teinter(el, [{ transform: `${BASE} scale(1.6)`, opacity: 0 }, { transform: `${BASE} scale(0.95)`, opacity: 1, offset: 0.8 },
                                         { transform: `${BASE} scale(1)`, opacity: 1 }], { duration: 480, easing: "ease-in" });
                    poussiere(o, sc.calque, pos, { n: 8 });
                    return h;
                };
                const h1 = await poser(sc.lanceur, a, "radial-gradient(circle, rgba(255,235,150,0.75), rgba(226,184,79,0.35) 70%)");
                o.texte(sc.calque, sc.lanceur, "Déploiement", COULEURS.neutre);
                const h2 = await poser(sc.cible, b, "radial-gradient(circle, rgba(255,140,140,0.7), rgba(180,30,30,0.35) 70%)");
                await o.attendre(600);
                await Promise.all([o.effacer(h1), o.effacer(h2)]);
            }
        }
    ]);

    // =====================================================================
    //  2. ATTAQUES (côté lanceur)
    // =====================================================================
    ajouter(2, null, [
        {
            id: "attaque-legere", nom: "Attaque légère (Dextérité)", sens: "vers l'ennemi",
            description: "Deux coups vifs, à peine le temps de les voir : deux entailles fines qui se croisent.",
            async jouer(sc, o) {
                const elan = { portee: 0.45, duree: 300, prise: 0.25, frappe: 0.55 };
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-4", elan, contact: 165, sonElan: "dague", retardSon: 40,
                                                                   entaille: { taille: 1.1, epaisseur: 5, duree: 260 } });
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-4", elan, contact: 165, sonElan: "dague", retardSon: 40,
                                                                   entaille: { taille: 1.1, epaisseur: 5, duree: 260, tourne: 180 } });
            }
        },
        {
            id: "attaque-lourde", nom: "Attaque lourde (Force)", sens: "vers l'ennemi",
            description: "Le héros arme longuement, recule et pivote, puis abat un coup ample : grande entaille, onde de choc au sol, éclats de pierre.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("lourd-elan");
                await o.bouger(sc.lanceur, [{ transform: "translate(0,0) rotate(0deg)" },
                    { transform: `translate(${-v.ux * a.t * 0.22}px, ${-v.uy * a.t * 0.22}px) rotate(-14deg) scale(1.08)` }],
                    { duration: 520, easing: "ease-out", fill: "forwards" });
                o.lacher(sc.lanceur);
                const elan = o.bouger(sc.lanceur, [
                    { transform: `translate(${-v.ux * a.t * 0.22}px, ${-v.uy * a.t * 0.22}px) rotate(-14deg) scale(1.08)` },
                    { transform: `translate(${v.ux * Math.min(v.d * 0.45, a.t * 0.75)}px, ${v.uy * Math.min(v.d * 0.45, a.t * 0.75)}px) rotate(10deg) scale(1.1)`, offset: 0.45 },
                    { transform: "translate(0,0) rotate(0deg)" }], { duration: 520, easing: "cubic-bezier(.6,0,.3,1)" });
                await o.attendre(230);
                o.son("lourd-impact");
                o.jauge(sc.calque, sc.cible, 40, 22, 40, "-18", COULEURS.degats, COULEURS.degats);
                await Promise.all([elan, entaille(o, sc.calque, b, v.angle, { taille: 2.1, epaisseur: 11, duree: 460 }),
                    o.onde(sc.calque, b, { couleur: "#c8a878", taille: 1.1, duree: 650, echelle: 2.1, bord: 5 }),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 12, dist: b.t * 1.1, couleurs: ["#a08868", "#6e5a40", "#fff"], taille: 7, carre: true, duree: 750 }),
                    o.secouer(sc.cible, b.t * 0.22, 460, v), o.eclat(sc.cible, ROUGE, 520)]);
            }
        },
        {
            id: "attaque-distance", nom: "Attaque à distance (tir)", sens: "vers l'ennemi",
            description: "Le héros bande son arc, la flèche file droit sur l'ennemi et s'y plante en vibrant.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                await o.bouger(sc.lanceur, [{ transform: "translate(0,0)" }, { transform: `translate(${-v.ux * 4}px, ${-v.uy * 4}px) scale(0.97)` }],
                               { duration: 320, fill: "forwards" });
                o.son("tir");
                o.lacher(sc.lanceur);
                await o.projectile(sc.calque, a, b, { taille: 0.7, arc: 0.12, oriente: true, easing: "linear", duree: Math.min(520, 200 + v.d * 0.5),
                    style: "height:auto; aspect-ratio:7/1; background:linear-gradient(90deg, #e8e0d0 0 12%, #6b4a2a 12% 82%, #cfd6dc 82%); clip-path:polygon(0 20%, 82% 30%, 82% 0, 100% 50%, 82% 100%, 82% 70%, 0 80%); filter:drop-shadow(0 0 3px #fff);" });
                o.son("fleche-impact");
                const fleche = o.poser(sc.calque, b.x - v.ux * b.t * 0.3, b.y - v.uy * b.t * 0.3, `width:${b.t * 0.55}px; height:${b.t * 0.08}px; z-index:${Z.haut};
                    background:linear-gradient(90deg, #e8e0d0 0 12%, #6b4a2a 12%); transform:translate(-50%,-50%) rotate(${deg(v.angle)}deg);`);
                o.jauge(sc.calque, sc.cible, 40, 31, 40, "-9", COULEURS.degats, COULEURS.degats);
                await Promise.all([o.secouer(sc.cible, b.t * 0.08, 300, v), o.eclat(sc.cible, ROUGE),
                    o.teinter(fleche, [{ transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg)` }, { transform: `translate(-50%,-50%) rotate(${deg(v.angle) + 6}deg)` },
                                       { transform: `translate(-50%,-50%) rotate(${deg(v.angle) - 4}deg)` }, { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg)` }],
                              { duration: 300, iterations: 2 })]);
                await o.effacer(fleche);
            }
        },
        {
            id: "attaque-foudre", nom: "Attaque magique Foudre", sens: "vers l'ennemi",
            description: "Le héros crépite de bleu, un éclair déchire l'air jusqu'à l'ennemi, deux fois ; l'ennemi blanchit, des étincelles jaillissent.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.eclat(sc.lanceur, "brightness(1.4) drop-shadow(0 0 8px #9fd8ff)", 500);
                for (let k = 0; k < 3; k++) o.eclair(sc.calque, a, { x: a.x + hasard(-1, 1) * a.t * 0.6, y: a.y + hasard(-1, 1) * a.t * 0.6, t: a.t }, { largeur: 0.3, duree: 260, retard: k * 90, segments: 4 });
                await o.attendre(320);
                o.son("foudre");
                o.eclair(sc.calque, a, b, { duree: 480 });
                o.eclair(sc.calque, a, b, { duree: 420, retard: 200 });
                o.jauge(sc.calque, sc.cible, 40, 29, 40, "-11", COULEURS.degats, COULEURS.degats);
                o.attendre(500).then(() => etat(o, sc.calque, sc.cible, "Électrifié !"));
                await Promise.all([o.onde(sc.calque, b, { couleur: "#9fd8ff", taille: 0.9, duree: 500, echelle: 1.8 }),
                    o.teinter(sc.cible, [{ filter: "none" }, { filter: ELEC, offset: 0.15 }, { filter: "none", offset: 0.3 }, { filter: ELEC, offset: 0.45 }, { filter: "none" }], { duration: 700 }),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 12, dist: b.t * 0.9, couleurs: ["#ffffff", "#9fd8ff", "#5aa0ff"], taille: 4, duree: 500 }),
                    o.secouer(sc.cible, b.t * 0.06, 500)]);
                await o.attendre(300);
            }
        },
        {
            id: "attaque-glace", nom: "Attaque magique Glace", sens: "vers l'ennemi",
            description: "Un trait de givre continu relie le héros à l'ennemi ; des cristaux naissent le long du rayon, l'ennemi blanchit de froid.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("givre-rayon");
                const rayon = o.rayon(sc.calque, a, b, { fond: "linear-gradient(90deg, rgba(225,250,255,0.95), rgba(140,215,255,0.85))", couleur: "#9fe6ff", epaisseur: 0.13, duree: 950 });
                for (let k = 1; k <= 4; k++) {
                    const f = k / 5;
                    o.gerbe(sc.calque, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, { nombre: 3, dist: a.t * 0.3, couleurs: ["#ffffff", "#bdf3ff"], taille: 5, carre: true, duree: 600, etale: 300 });
                }
                await o.attendre(380);
                o.son("glace-impact");
                o.jauge(sc.calque, sc.cible, 40, 31, 40, "-9", COULEURS.degats, COULEURS.degats);
                await Promise.all([rayon, o.teinter(sc.cible, [{ filter: "none" }, { filter: GIVRE, offset: 0.3 }, { filter: GIVRE, offset: 0.8 }, { filter: "none" }], { duration: 1100 }),
                    o.onde(sc.calque, b, { couleur: "#bdf3ff", taille: 1, duree: 700, echelle: 1.6 }), o.secouer(sc.cible, b.t * 0.05, 400, v)]);
            }
        },
        {
            id: "attaque-multi", nom: "Attaque magique multi-élémentaire", sens: "vers l'ennemi",
            description: "Trois orbes (feu, glace, foudre) tournent autour du héros, puis filent ensemble vers l'ennemi et éclatent en trois couleurs mêlées.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const couleurs = [["#ff7a1a", "#fff1c0"], ["#9fe6ff", "#ffffff"], ["#8fb0ff", "#ffffff"]];
                o.son("feu-lancer"); o.son("gel-lancer", 120);
                const r = a.t * 0.62;
                const billes = couleurs.map(([c, coeur], i) => {
                    const d = o.poser(sc.calque, a.x, a.y, `width:${a.t * 0.26}px; height:${a.t * 0.26}px; border-radius:50%; z-index:${Z.ciel};
                        background:radial-gradient(circle at 40% 40%, ${coeur}, ${c} 60%, rgba(0,0,0,0)); box-shadow:0 0 12px ${c};`);
                    const images = [];
                    for (let k = 0; k <= 8; k++) {
                        const ang = (i / 3) * Math.PI * 2 + (k / 8) * Math.PI * 2;
                        images.push({ transform: `translate(calc(-50% + ${Math.cos(ang) * r}px), calc(-50% + ${Math.sin(ang) * r}px))` });
                    }
                    return o.jouerPuisRetirer(d, images, { duration: 700, easing: "linear" });
                });
                await Promise.all(billes);
                o.son("foudre");
                await Promise.all(couleurs.map(([c, coeur], i) => orbe(o, sc.calque, a, b, { couleur: c, coeur, taille: 0.26, arc: [0.5, 0, -0.5][i], duree: 520,
                                                                                            traine: [c, coeur] })));
                o.son("feu-explosion");
                o.jauge(sc.calque, sc.cible, 40, 25, 40, "-15", COULEURS.degats, COULEURS.degats);
                o.attendre(450).then(() => o.texte(sc.calque, sc.cible, "🔥 ❄️ ⚡", COULEURS.etat));
                await Promise.all([...couleurs.map(([c], i) => o.onde(sc.calque, b, { couleur: c, taille: 0.8 + i * 0.15, duree: 700, echelle: 2, retard: i * 90 })),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 15, dist: b.t * 1.1, couleurs: ["#ff7a1a", "#bdf3ff", "#8fb0ff"], taille: 6, duree: 800 }),
                    o.secouer(sc.cible, b.t * 0.12, 380, axe(a, b))]);
            }
        },
        {
            id: "mots-de-pouvoir", nom: "Mots de pouvoir", sens: "vers l'ennemi",
            description: "Le héros prononce les mots : trois ondes de voix, en arcs, roulent vers l'ennemi et le frappent de dégâts bruts, sans couleur.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("mots");
                o.eclat(sc.lanceur, "brightness(1.3) grayscale(0.5) drop-shadow(0 0 8px #fff)", 600);
                const rot = deg(v.angle);
                const arcs = [0, 1, 2].map(i => {
                    const d = o.poser(sc.calque, a.x, a.y, `width:${a.t * 0.5}px; height:${a.t * 1.1}px; z-index:${Z.haut}; border-radius:50%;
                        border-right:4px solid rgba(240,240,240,0.9); filter:drop-shadow(0 0 6px #fff);`);
                    return o.jouerPuisRetirer(d, [
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0.5)`, opacity: 0 },
                        { transform: `translate(calc(-50% + ${(b.x - a.x) * 0.3}px), calc(-50% + ${(b.y - a.y) * 0.3}px)) rotate(${rot}deg) scale(0.9)`, opacity: 1, offset: 0.3 },
                        { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) rotate(${rot}deg) scale(1.5)`, opacity: 0 }
                    ], { duration: 620, delay: i * 140, easing: "ease-out" });
                });
                await o.attendre(480);
                o.jauge(sc.calque, sc.cible, 40, 30, 40, "-10", "#e6e6e6", "#e6e6e6");
                await Promise.all([...arcs, o.onde(sc.calque, b, { couleur: "#e6e6e6", taille: 0.9, duree: 600, echelle: 1.8 }),
                    o.secouer(sc.cible, b.t * 0.14, 500, v), o.eclat(sc.cible, "grayscale(1) brightness(1.5)", 500)]);
                o.texte(sc.calque, sc.cible, "Dégâts bruts", COULEURS.neutre);
                await o.attendre(300);
            }
        },
        {
            id: "lumiere-forge", nom: "Lumière (effet de la Forge)", sens: "vers l'ennemi",
            description: "Un rayon doré et blanc jaillit du héros et traverse l'ennemi : un halo l'entoure, sa résistance magique est percée.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("lumiere");
                o.eclat(sc.lanceur, OR, 700);
                await o.attendre(200);
                const rayon = o.rayon(sc.calque, a, b, { fond: "linear-gradient(90deg, rgba(255,250,220,0.95), rgba(255,215,90,0.9))", couleur: "#ffd700", epaisseur: 0.2, duree: 900, longueur: 1.35 });
                await o.attendre(250);
                o.jauge(sc.calque, sc.cible, 40, 30, 40, "-10", COULEURS.degats, COULEURS.degats);
                o.attendre(450).then(() => o.texte(sc.calque, sc.cible, "Résistance percée", "#ffd700"));
                await Promise.all([rayon, o.aura(sc.calque, b, { couleur: "#ffe680", taille: 1.3, pulsations: 2, duree: 1100 }),
                    o.eclat(sc.cible, "brightness(1.8) sepia(0.4)", 700)]);
            }
        },
        {
            id: "attaque-zone", nom: "Attaque de zone", sens: "vers l'ennemi",
            description: "Les cases de la zone (par défaut, les sept autour de l'ennemi) rougeoient, puis explosent ensemble : chaque hexagone flamboie, l'onde balaie la zone.",
            ciblage: CIBLAGE_ZONE,
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const pts = ciblees(sc, o, () => o.autour(sc.cible, centre(sc.cible, sc.calque), 1, { avecCentre: true }));
                const b = milieu(pts);
                // L'ennemi encaisse s'il est dans la zone (le lanceur, jamais : comme au combat).
                const touches = (!o.grille || pts.some(pt => memeCase(o.caseDe(sc.cible), pt))) ? [sc.cible] : [];
                o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff5030)", 600);
                const cases = pts.map((pt, i) => o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,120,80,0.45), rgba(200,30,20,0.35) 80%)", retard: i * 40 }));
                await o.pulser(cases, { duree: 300, fois: 2, eclat: 1.6, decale: 20 });
                o.son("zone-explosion");
                touches.forEach(el => o.jauge(sc.calque, el, 40, 28, 40, "-12", COULEURS.degats, COULEURS.degats));
                await Promise.all([
                    ...cases.map(c => o.teinter(c, [{ filter: "brightness(1)", opacity: 1 }, { filter: "brightness(2.4) saturate(1.5)", opacity: 1, offset: 0.2 },
                                                    { filter: "brightness(1)", opacity: 0 }], { duration: 800, fill: "forwards" })),
                    ...pts.map((pt, i) => o.onde(sc.calque, pt, { couleur: "#ff9a40", taille: 0.7, duree: 600, echelle: 1.7, retard: i * 25 })),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 18, dist: b.t * Math.min(3.5, 1.8 * Math.sqrt(pts.length / 7)), couleurs: ["#ffcf5a", "#ff7a1a", "#e8420c"], taille: 7, duree: 850 }),
                    ...touches.map(el => o.secouer(el, b.t * 0.14, 420, axe(a, centre(el, sc.calque))))]);
            }
        },
        {
            id: "attaque-etalee", nom: "Attaque étalée", sens: "vers l'ennemi",
            description: "Rien d'éclatant au lancement : une petite marque sombre file sur l'ennemi et s'y grave en sceau au sol, qui reste.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("marque");
                await orbe(o, sc.calque, a, b, { couleur: "#8a1840", coeur: "#ffb0c8", taille: 0.2, arc: 0.2 });
                const s = sceau(o, sc.calque, b, "#c83a6a", { duree: 2000 });
                etat(o, sc.calque, sc.cible, "Étalé : 3 manches");
                await o.attendre(1700);
                await o.effacer(s);
            }
        },
        {
            id: "attaque-opportunite", nom: "Attaque d'opportunité", sens: "sur soi",
            description: "Le héros tente de s'éloigner ; au moment où il quitte la case, l'ennemi le frappe au passage.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const loin = o.voisine(sc.lanceur, a, o.tourner(v, Math.PI));
                o.son("pas");
                const part = o.bouger(sc.lanceur, [{ transform: "translate(0,0)" }, { transform: `translate(${(loin.x - a.x) * 0.45}px, ${(loin.y - a.y) * 0.45}px)` }],
                                      { duration: 420, easing: "ease-out", fill: "forwards" });
                await o.attendre(150);
                o.icone(sc.calque, centre(sc.cible, sc.calque), "⚔️", { taille: 0.45, duree: 1100 });
                o.texte(sc.calque, sc.cible, "Opportunité !", COULEURS.attention);
                await part;
                await frapper(o, sc.calque, sc.cible, sc.lanceur, { valeur: "-6" });
                await o.parcourir(sc.lanceur, a, [loin], { duree: 320, depuis: { x: a.x + (loin.x - a.x) * 0.45, y: a.y + (loin.y - a.y) * 0.45 } });
                await o.attendre(250);
                await o.arriver(sc.lanceur, loin);
            }
        },
        {
            id: "attaque-zombie", nom: "Attaque d'un zombie (Profanateur)", sens: "vers l'ennemi",
            description: "Un zombie au teint verdâtre, à côté de l'ennemi, titube et le griffe de trois traits pâles.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pos = o.voisine(sc.cible, b, o.tourner(v, -Math.PI / 2));
                const z = o.figurant(sc.calque, sc.cible, pos, { filtre: ZOMBIE, opacite: 0 });
                o.son("zombie");
                await sortirDuSol(o, z, { duree: 600 });
                await o.bouger(z, [{ transform: "rotate(0deg)" }, { transform: "rotate(-8deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(0deg)" }], { duration: 500 });
                await frapper(o, sc.calque, z, sc.cible, { valeur: "-6", sonElan: false, sonImpact: "griffe", griffes: "#c8ffb0" });
                await o.attendre(300);
                await o.effacer(z);
            }
        },
        {
            id: "frappe-mur", nom: "Créature qui frappe un mur de terre", sens: "vers l'ennemi",
            description: "Un mur de terre barre la route : l'ennemi le frappe à coups de pioche ⛏️, des éclats de roche volent, le mur tremble.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pos = o.voisine(sc.cible, b, o.tourner(v, Math.PI / 2));
                const mur = o.mur(sc.calque, pos, { sansApparition: true });
                for (let k = 0; k < 2; k++) {
                    const elan = o.elan(sc.cible, b, pos, { portee: 0.5, duree: 420 });
                    await o.attendre(240);
                    o.son("pioche");
                    o.icone(sc.calque, pos, "⛏️", { taille: 0.5, duree: 700 });
                    o.gerbe(sc.calque, pos.x, pos.y, { nombre: 9, dist: pos.t * 0.8, couleurs: ["#a08868", "#6e5a40"], taille: 6, carre: true, duree: 600 });
                    o.secouer(mur, 4, 260);
                    await elan;
                }
                o.texte(sc.calque, mur, "⛏️ -1", COULEURS.attention);
                await o.attendre(700);
            }
        },
        {
            id: "echec-technique", nom: "Échec de technique (Étourdi)", sens: "sur soi",
            description: "Le héros rassemble son énergie… qui fuse et retombe en fumée grise : la technique a raté.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("energie");
                await Promise.all([rassembler(o, sc.calque, a, { couleur: "#ffe680", n: 8, duree: 450 }), o.eclat(sc.lanceur, OR, 500)]);
                o.son("echec");
                o.icone(sc.calque, a, "💫", { duree: 1200 });
                o.texte(sc.calque, sc.lanceur, "Échec ! (Étourdi)", COULEURS.attention);
                await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 12, dist: a.t * 0.8, monte: a.t * 0.4, couleurs: ["#9a9a9a", "#cfcfcf", "#6a6a6a"], taille: 12, tailleMin: 6, duree: 1100, etale: 200 }),
                    o.teinter(sc.lanceur, [{ filter: "none" }, { filter: "grayscale(0.8) brightness(0.8)", offset: 0.3 }, { filter: "none" }], { duration: 900 })]);
            }
        },
        {
            id: "hors-portee", nom: "« Hors de portée »", sens: "vers l'ennemi",
            description: "Une ligne pointillée part vers la cible et s'arrête court ; une croix rouge la barre.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("refus");
                const mi = { x: a.x + (b.x - a.x) * 0.55, y: a.y + (b.y - a.y) * 0.55, t: a.t };
                const ligne = o.lien(sc.calque, a, mi, { couleur: "#ff6060", epaisseur: 4 });
                await o.attendre(250);
                o.icone(sc.calque, mi, "✖", { dy: 0, taille: 0.5, duree: 1200, lueur: "#ff4040" });
                o.texte(sc.calque, sc.lanceur, "Hors de portée", COULEURS.attention);
                await o.attendre(1200);
                await o.effacer(ligne);
            }
        },
        {
            id: "competence-sur-soi", nom: "Compétence lancée sur soi (Confusion)", sens: "sur soi",
            description: "Confus, le héros lance son sort… qui fait demi-tour en l'air et revient le frapper.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("confusion");
                o.icone(sc.calque, a, "❓", { duree: 1300, lueur: "#c9a8ff" });
                const mi = { x: a.x + (b.x - a.x) * 0.7, y: a.y + (b.y - a.y) * 0.7, t: a.t };
                await orbe(o, sc.calque, a, mi, { couleur: "#b070ff", taille: 0.3, arc: 0.6, duree: 420, easing: "ease-out" });
                await orbe(o, sc.calque, mi, a, { couleur: "#b070ff", taille: 0.3, arc: -0.6, duree: 420, easing: "ease-in" });
                o.son("impact-magique");
                o.texte(sc.calque, sc.lanceur, "Confusion : sur lui-même !", COULEURS.etat);
                await encaisser(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-7", filtre: VIOLET });
            }
        }
    ]);

    // =====================================================================
    //  3. IMPACTS ET DÉFENSES (côté cible : le héros encaisse)
    // =====================================================================
    // Un dôme de bouclier sur le héros (rend l'élément, qui tient jusqu'à o.effacer).
    const dome = (o, calque, a, p = {}) => {
        const d = o.poser(calque, a.x, a.y, `width:${a.t * 1.45}px; height:${a.t * 1.45}px; border-radius:50%; z-index:${Z.haut};
            border:2px solid rgba(160,245,255,0.9); background:radial-gradient(circle, rgba(91,232,255,0.05) 45%, rgba(91,232,255,0.32) 75%, rgba(220,255,255,0.55) 100%);
            box-shadow:0 0 18px #5be8ff, inset 0 0 18px #5be8ff;`, p.contenu || "");
        o.surgir(d, { duree: 380 });
        return d;
    };
    // L'ennemi lance une orbe sur le héros.
    const sortEnnemi = (o, sc, p) => { const { a, b } = lieux(sc); return orbe(o, sc.calque, b, a, p); };
    ajouter(3, null, [
        {
            id: "coup-recu-physique", nom: "Coup reçu — physique", sens: "sur soi",
            description: "Une lame venue de l'ennemi : deux traits d'acier blanc se croisent sur le héros, qui recule dans une gerbe d'étincelles rouges.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const v = axe(b, a);
                o.son("coup-physique");
                await Promise.all([entaille(o, sc.calque, a, v.angle, { taille: 1.3 }), entaille(o, sc.calque, a, v.angle, { taille: 1.3, tourne: 90, retard: 80 }),
                    encaisser(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8" }),
                    o.gerbe(sc.calque, a.x, a.y, { nombre: 9, dist: a.t * 0.7, angle: v.angle, eventail: Math.PI, couleurs: ["#c4141c", "#ff6b6b", "#fff"], taille: 5 })]);
            }
        },
        {
            id: "coup-recu-magique", nom: "Coup reçu — magique", sens: "sur soi",
            description: "Un sort frappe le héros : un anneau violet se resserre sur lui, des éclats d'arcane crépitent, il se teinte de violet.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("impact-magique");
                await Promise.all([o.onde(sc.calque, a, { couleur: "#b070ff", taille: 1.6, duree: 500, echelle: 0.5 }),
                    o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.8, couleurs: ["#d6b0ff", "#9050e0", "#ffffff"], texte: "✦", taille: 16, tailleMin: 10, duree: 700 }),
                    encaisser(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8", filtre: VIOLET })]);
            }
        },
        {
            id: "coup-recu-brut", nom: "Coup reçu — brut", sens: "sur soi",
            description: "Un choc sans couleur, que rien n'arrête : le héros s'écrase sous l'onde grise, le chiffre monte en gris.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("impact-brut");
                o.jauge(sc.calque, sc.lanceur, 40, 32, 40, "-8", "#d0d0d0", "#d0d0d0");
                await Promise.all([o.onde(sc.calque, a, { couleur: "#c8c8c8", taille: 0.9, duree: 550, echelle: 1.9 }),
                    o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(0.86)", offset: 0.25 }, { transform: "scale(1.03)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 500 }),
                    o.eclat(sc.lanceur, "grayscale(1) brightness(1.4)", 500), o.secouer(sc.lanceur, a.t * 0.06, 400, axe(b, a))]);
            }
        },
        {
            id: "degats-envol", nom: "Nombre de dégâts qui s'envole", sens: "vers l'ennemi",
            description: "Le chiffre jaillit de l'ennemi, grossit, tourne en s'envolant en arc et s'efface : on le lit d'un coup d'œil.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                o.son("coup-physique");
                o.son("chiffre", 80);
                o.secouer(sc.cible, b.t * 0.1, 320, v);
                o.eclat(sc.cible, ROUGE);
                const n = o.poser(sc.calque, b.x, b.y - b.t * 0.3, `z-index:${Z.ciel}; font-family:'Cinzel', serif; font-weight:bold; font-size:${b.t * 0.6}px;
                    color:#ff4c4c; white-space:nowrap; text-shadow:0 0 6px #000, 0 0 12px #000, 2px 2px 2px #000, 0 0 18px #ff4c4c;`, "-27");
                const sx = v.ux >= 0 ? 1 : -1;
                await o.jouerPuisRetirer(n, [
                    { transform: "translate(-50%,-50%) scale(0.4) rotate(0deg)", opacity: 0 },
                    { transform: "translate(-50%,-50%) scale(1.5) rotate(-6deg)", opacity: 1, offset: 0.18 },
                    { transform: `translate(calc(-50% + ${sx * b.t * 0.5}px), calc(-50% - ${b.t * 0.9}px)) scale(1.2) rotate(${sx * 8}deg)`, opacity: 1, offset: 0.6 },
                    { transform: `translate(calc(-50% + ${sx * b.t * 0.9}px), calc(-50% - ${b.t * 1.2}px)) scale(0.8) rotate(${sx * 14}deg)`, opacity: 0 }
                ], { duration: 1400, easing: "cubic-bezier(.2,.8,.3,1)" });
            }
        },
        {
            id: "parade", nom: "Parade — le coup est bloqué", sens: "sur soi",
            description: "L'ennemi frappe ; un arc d'acier doré se lève côté ennemi, le coup y claque dans une gerbe d'étincelles, le héros tient bon.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("lame-souffle", 100);
                const elan = o.elan(sc.cible, b, a, { portee: 0.4 });
                await o.attendre(300);
                o.son("parade");
                const contact = { x: a.x + v.ux * a.t * 0.55, y: a.y + v.uy * a.t * 0.55, t: a.t };
                const arc = o.poser(sc.calque, contact.x, contact.y, `width:${a.t * 0.35}px; height:${a.t * 1.1}px; z-index:${Z.haut};
                    border-radius:50%; border-right:6px solid #ffe9a0; filter:drop-shadow(0 0 8px #ffd700);`);
                o.texte(sc.calque, sc.lanceur, "Paré !", COULEURS.neutre);
                await Promise.all([elan,
                    o.jouerPuisRetirer(arc, [{ transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(0.4)`, opacity: 0 },
                                             { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(1.1)`, opacity: 1, offset: 0.25 },
                                             { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(1)`, opacity: 0 }], { duration: 650 }),
                    o.gerbe(sc.calque, contact.x, contact.y, { nombre: 12, dist: a.t * 0.7, angle: v.angle, eventail: Math.PI * 1.2, couleurs: ["#fff6c0", "#ffd700"], taille: 4, duree: 500 }),
                    o.secouer(sc.lanceur, a.t * 0.04, 250, axe(b, a))]);
            }
        },
        {
            id: "contre", nom: "Contre", sens: "sur soi",
            description: "L'ennemi frappe ; le héros annule une part du coup et la lui renvoie aussitôt d'un revers.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("lame-souffle", 100);
                const elan = o.elan(sc.cible, b, a, { portee: 0.4 });
                await o.attendre(300);
                o.son("parade");
                o.texte(sc.calque, sc.lanceur, "Contre : -20 %", COULEURS.bouclier);
                o.gerbe(sc.calque, a.x + v.ux * a.t * 0.5, a.y + v.uy * a.t * 0.5, { nombre: 8, dist: a.t * 0.5, angle: v.angle, eventail: Math.PI, couleurs: ["#fff6c0", "#ffd700"], taille: 4, duree: 450 });
                await elan;
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-2", elan: { portee: 0.35, duree: 320, frappe: 0.5 }, contact: 160, sonElan: false,
                                                                   entaille: { taille: 1.1, couleur: "#ffe9a0", lueur: "#ffd700", lueur2: "#ffb000" } });
            }
        },
        {
            id: "absorption", nom: "Absorption", sens: "sur soi",
            description: "Un sort ennemi atteint le héros : son aura l'avale dans un tourbillon vert-violet ; une part s'éteint, une part le soigne.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("impact-magique");
                await sortEnnemi(o, sc, { couleur: "#b070ff", taille: 0.34, traine: ["#d6b0ff", "#9050e0"] });
                o.son("absorption");
                o.texte(sc.calque, sc.lanceur, "Absorbé : -20 %", COULEURS.bouclier);
                await Promise.all([o.aura(sc.calque, a, { couleur: "#7dffb0", taille: 1.3, tourne: 360, pulsations: 2, duree: 1000, trait: "dashed" }),
                    rassembler(o, sc.calque, a, { couleur: "#b8ffd0", n: 10, duree: 500, rayon: 0.9 })]);
                o.jauge(sc.calque, sc.lanceur, 30, 32, 40, "+2", COULEURS.soin, COULEURS.soin);
                await o.eclat(sc.lanceur, "brightness(1.4) drop-shadow(0 0 10px #7dff9a)", 600);
            }
        },
        {
            id: "resistance-element", nom: "Résistance élémentaire", sens: "sur soi",
            description: "Une boule de feu touche le héros : un sceau orange se lève sous lui, le feu glisse ; puis les sceaux de la foudre et de la glace s'allument à leur tour.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("feu-lancer");
                await sortEnnemi(o, sc, { couleur: "#ff7a1a", coeur: "#fff1c0", taille: 0.36, traine: ["#ffb02e", "#ff5a0a"] });
                o.son("resiste");
                const s = sceau(o, sc.calque, a, "#ff9a40", { duree: 1300 });
                o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.9, couleurs: ["#ffcf5a", "#ff7a1a"], taille: 6, duree: 600 });
                o.texte(sc.calque, sc.lanceur, "🔥 Résiste au feu : -20 %", COULEURS.attention);
                await o.attendre(700);
                o.son("resiste");
                o.icone(sc.calque, a, "⚡", { dx: -a.t * 0.5, duree: 1100, lueur: "#9fd8ff" });
                o.icone(sc.calque, a, "❄️", { dx: a.t * 0.5, duree: 1100, retard: 150, lueur: "#bdf3ff" });
                o.icone(sc.calque, a, "🔥", { duree: 1100, retard: 300, lueur: "#ff9a40" });
                o.attendre(400).then(() => o.texte(sc.calque, sc.lanceur, "Multi-éléments : la part résistée", COULEURS.neutre));
                await o.attendre(1300);
                await o.effacer(s);
            }
        },
        {
            id: "bouclier-encaisse", nom: "Le bouclier magique encaisse le coup", sens: "sur soi",
            description: "Le dôme cyan reçoit la lame : une onde court sur sa paroi au point d'impact, il vacille, le héros n'est pas touché.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const d = dome(o, sc.calque, a);
                await o.attendre(380);
                o.son("lame-souffle", 80);
                const elan = o.elan(sc.cible, b, a, { portee: 0.4 });
                await o.attendre(300);
                o.son("bouclier-impact");
                const contact = { x: a.x + v.ux * a.t * 0.7, y: a.y + v.uy * a.t * 0.7, t: a.t * 0.6 };
                o.texte(sc.calque, sc.lanceur, "-8 🛡️", COULEURS.bouclier);
                await Promise.all([elan, o.onde(sc.calque, contact, { couleur: "#e8ffff", taille: 0.8, duree: 500, echelle: 1.8 }),
                    o.teinter(d, [{ opacity: 1 }, { opacity: 0.35, offset: 0.2 }, { opacity: 1, offset: 0.45 }, { opacity: 0.6, offset: 0.7 }, { opacity: 1 }], { duration: 600 })]);
                await o.effacer(d, { echelle: 1.2 });
            }
        },
        {
            id: "bouclier-brise", nom: "Le bouclier magique se brise", sens: "sur soi",
            description: "Le dôme se fissure sous le coup, puis vole en éclats de verre cyan.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const d = dome(o, sc.calque, a, { contenu: `<svg viewBox="0 0 100 100" width="100%" height="100%" class="fissures" style="opacity:0">
                    <path d="M50 50 L22 18 M50 50 L84 30 M50 50 L70 88 M50 50 L18 66 M36 34 L28 40 M70 40 L78 50" stroke="#ffffff" stroke-width="2.5" fill="none"/></svg>` });
                await o.attendre(380);
                o.son("lame-souffle", 80);
                const elan = o.elan(sc.cible, b, a, { portee: 0.4 });
                await o.attendre(300);
                o.son("bouclier-impact");
                await o.teinter(d.querySelector(".fissures"), [{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "forwards" });
                await o.attendre(150);
                o.son("bris-verre");
                o.texte(sc.calque, sc.lanceur, "Bouclier brisé !", COULEURS.bouclier);
                d.remove();
                await Promise.all([elan, o.gerbe(sc.calque, a.x, a.y, { nombre: 22, dist: a.t * 1.3, couleurs: ["#e8ffff", "#5be8ff", "#a0f5ff"], taille: 9, tailleMin: 4, carre: true, duree: 800 }),
                    o.secouer(sc.lanceur, a.t * 0.06, 300, axe(b, a))]);
            }
        },
        {
            id: "etat-resiste", nom: "État raté ou résisté (immunité)", sens: "sur soi",
            description: "Une fiole de venin vole vers le héros ; un sceau doré s'allume, la fiole éclate en fumée grise sans effet.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("poison-lancer");
                await sortEnnemi(o, sc, { couleur: "#7dd321", coeur: "#e8ffc0", taille: 0.28, arc: 0.7 });
                o.son("resiste");
                const s = sceau(o, sc.calque, a, "#ffd700", { duree: 1200 });
                o.texte(sc.calque, sc.lanceur, "Résiste ! (immunité)", "#ffd700");
                await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.7, monte: a.t * 0.3, couleurs: ["#a0a0a0", "#d0d0d0"], taille: 10, tailleMin: 5, duree: 900 }),
                    o.eclat(sc.lanceur, OR, 600)]);
                await o.attendre(500);
                await o.effacer(s);
            }
        },
        {
            id: "illusion-brisee", nom: "Illusion brisée", sens: "vers l'ennemi",
            description: "L'ennemi frappe le double illusoire du héros : il éclate comme du verre, en éclats irisés.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pos = o.voisine(sc.cible, b, o.tourner(v, Math.PI * 0.6));
                const f = o.figurant(sc.calque, sc.lanceur, pos, { filtre: ILLUSION, opacite: 0.78 });
                await o.attendre(400);
                await frapper(o, sc.calque, sc.cible, f, { sonImpact: "bris-verre" });
                o.son("illusion");
                o.texte(sc.calque, f, "Illusion brisée", "#c9a8ff");
                await Promise.all([o.effacer(f, { duree: 200, echelle: 1.3 }),
                    o.gerbe(sc.calque, pos.x, pos.y, { nombre: 20, dist: pos.t * 1.2, couleurs: ["#e8d8ff", "#9fd8ff", "#ffffff"], taille: 8, tailleMin: 3, carre: true, duree: 800 })]);
                await o.attendre(400);
            }
        }
    ]);

    // =====================================================================
    //  4. SOINS, PROTECTIONS, ÉNERGIE
    // =====================================================================
    // La lueur d'un soin sur un pion (onde au sol, plus verts qui montent).
    const lueurSoin = (o, calque, pion, p = {}) => {
        const P = centre(pion, calque);
        return Promise.all([
            o.onde(calque, P, { couleur: p.couleur || "#7dff9a", taille: 1.1, aplati: 0.45, decalage: P.t * 0.3, duree: 900, echelle: 1.5 }),
            o.eclat(pion, p.filtre || "brightness(1.45) drop-shadow(0 0 10px #7dff9a)", 900),
            o.gerbe(calque, P.x, P.y + P.t * 0.2, { nombre: p.n || 7, dist: P.t * 0.35, monte: P.t * 0.8, couleurs: p.couleurs || ["#7dff9a", "#d9ffe1"],
                                                   texte: "+", taille: 17, tailleMin: 11, duree: 1100, etale: 400 })]);
    };
    // Une bénédiction : un sceau, une aura, un emblème qui s'élève.
    const benir = async (o, sc, couleur, embleme, texte) => {
        const { a } = lieux(sc);
        o.son("benediction");
        const s = sceau(o, sc.calque, a, couleur, { duree: 1800 });
        o.icone(sc.calque, a, embleme, { duree: 1600, lueur: couleur, taille: 0.6 });
        o.attendre(250).then(() => o.texte(sc.calque, sc.lanceur, texte, couleur));
        await Promise.all([o.aura(sc.calque, a, { couleur, taille: 1.3, pulsations: 3, duree: 1700 }),
            o.eclat(sc.lanceur, `brightness(1.3) drop-shadow(0 0 10px ${couleur})`, 1400)]);
        await o.effacer(s);
    };
    ajouter(4, null, [
        {
            id: "soin-zone", nom: "Soin de zone", sens: "sur soi",
            description: "Les hexagones autour du héros fleurissent de vert ; lui et ses deux alliés voisins s'illuminent et reprennent des forces.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const al1 = allie(o, sc, Math.PI * 0.7), al2 = allie(o, sc, -Math.PI * 0.7);
                await o.attendre(250);
                o.son("soin-zone");
                const cases = o.autour(sc.lanceur, a, 1, { avecCentre: true }).map((pt, i) => o.hexagone(sc.calque, pt, { fond: FONDS_ZONE.soin, opacite: 0.7, retard: i * 50 }));
                await o.attendre(300);
                [sc.lanceur, al1.el, al2.el].forEach((el, i) => {
                    if (!el) return;
                    lueurSoin(o, sc.calque, el, { n: 5 });
                    o.attendre(i * 120).then(() => o.jauge(sc.calque, el, 20, 30, 40, "+10", COULEURS.soin, COULEURS.soin));
                });
                await o.pulser(cases, { duree: 500, fois: 2, eclat: 1.3, decale: 30 });
                await effacerTout(o, cases);
            }
        },
        {
            id: "soin-etale", nom: "Soin étalé", sens: "sur soi",
            description: "Un sceau vert se pose sous le héros ; à chaque fin de manche il pulse et rend une part du soin.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("soin");
                const s = sceau(o, sc.calque, a, "#7dff9a", { duree: 2400, tours: 300 });
                o.texte(sc.calque, sc.lanceur, "Soin étalé : 3 manches", COULEURS.soin);
                for (let k = 0; k < 3; k++) {
                    await o.attendre(560);
                    o.son("soin-tic");
                    o.teinter(s, [{ filter: "brightness(1)" }, { filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 400 });
                    o.eclat(sc.lanceur, "brightness(1.35) drop-shadow(0 0 8px #7dff9a)", 400);
                    o.jauge(sc.calque, sc.lanceur, 20 + k * 4, 24 + k * 4, 40, "+4", COULEURS.soin, COULEURS.soin);
                }
                await o.attendre(400);
                await o.effacer(s);
            }
        },
        {
            id: "soin-reduit", nom: "Soin réduit (Brûlé, Plaie infectée)", sens: "sur soi",
            description: "La lueur verte monte, mais la moitié des éclats se ternit et retombe : le soin est réduit de moitié.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("soin");
                o.icone(sc.calque, a, "🔥", { dx: a.t * 0.55, dy: -a.t * 0.3, taille: 0.35, duree: 1800 });
                await Promise.all([lueurSoin(o, sc.calque, sc.lanceur, { n: 4 }),
                    o.gerbe(sc.calque, a.x, a.y - a.t * 0.2, { nombre: 5, dist: a.t * 0.5, couleurs: ["#8a8a8a", "#5a5a5a"], texte: "+", taille: 16, tailleMin: 10, duree: 1000, etale: 300 })]);
                o.son("refus");
                o.texte(sc.calque, sc.lanceur, "Soin -50 % (Brûlé)", COULEURS.attention);
                o.jauge(sc.calque, sc.lanceur, 20, 27, 40, "+7", COULEURS.soin, COULEURS.soin);
                await o.attendre(700);
            }
        },
        {
            id: "purification", nom: "Purification", sens: "sur soi",
            description: "Une tache d'ombre (l'état) colle au héros ; un éclat blanc l'arrache vers le ciel où elle se dissout en étincelles.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const tache = o.poser(sc.calque, a.x, a.y, `width:${a.t * 0.9}px; height:${a.t * 0.9}px; border-radius:50%; z-index:${Z.haut};
                    background:radial-gradient(circle, rgba(60,10,80,0.85), rgba(120,40,160,0.4) 60%, rgba(0,0,0,0) 75%);
                    display:flex; align-items:center; justify-content:center; font-size:${a.t * 0.4}px;`, "☠️");
                await o.surgir(tache, { duree: 400 });
                o.son("purification");
                await o.eclat(sc.lanceur, "brightness(1.8) drop-shadow(0 0 14px #ffffff)", 500);
                await Promise.all([
                    o.teinter(tache, [{ transform: `${BASE} scale(1)`, opacity: 1 }, { transform: `${BASE} translate(0, ${-a.t * 0.8}px) scale(1.6)`, opacity: 0 }],
                              { duration: 700, easing: "ease-in", fill: "forwards" }),
                    o.gerbe(sc.calque, a.x, a.y - a.t * 0.5, { nombre: 14, dist: a.t * 0.9, couleurs: ["#ffffff", "#fffbe0", "#e0d0ff"], taille: 5, duree: 800 })]);
                o.texte(sc.calque, sc.lanceur, "Purifié !", COULEURS.soin);
                await o.attendre(500);
            }
        },
        {
            id: "benediction-magique", nom: "Bénédiction magique (arme de soin)", sens: "sur soi",
            description: "Un sceau bleu-violet sous le héros, une aura qui pulse : sa résistance magique grimpe.",
            async jouer(sc, o) { await benir(o, sc, "#8fa8ff", "✦", "+ Résistance magique"); }
        },
        {
            id: "benediction-physique", nom: "Bénédiction physique (arme de soin)", sens: "sur soi",
            description: "Un sceau d'acier doré, une aura et un écu qui s'élève : sa résistance physique grimpe.",
            async jouer(sc, o) { await benir(o, sc, "#e0c070", "🛡️", "+ Résistance physique"); }
        },
        {
            id: "benediction-offensive", nom: "Bénédiction offensive (arme de soin)", sens: "sur soi",
            description: "Un sceau rouge-orangé, une aura et deux épées croisées : ses dégâts grimpent.",
            async jouer(sc, o) { await benir(o, sc, "#ff8050", "⚔️", "+ Dégâts"); }
        },
        {
            id: "repos-long", nom: "Repos long", sens: "sur soi",
            description: "Le héros s'apaise et respire lentement, quelques « z » s'envolent, puis l'énergie remonte en paillettes dorées.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("repos");
                teinte(o, sc.lanceur, "brightness(0.82) saturate(0.8)", 400);
                [0, 400, 800].forEach((d, i) => o.icone(sc.calque, a, "💤", { dx: a.t * (0.25 + i * 0.12), dy: -a.t * (0.5 + i * 0.12), taille: 0.3 + i * 0.06, duree: 1100, retard: d }));
                await o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(0.95)" }, { transform: "scale(1)" }], { duration: 800, iterations: 2, easing: "ease-in-out" });
                deteindre(o, sc.lanceur, "brightness(0.82) saturate(0.8)");
                o.son("energie");
                o.energie(sc.calque, sc.lanceur, 10, 40, 40, "+30 ⚡");
                await o.gerbe(sc.calque, a.x, a.y + a.t * 0.2, { nombre: 14, dist: a.t * 0.4, monte: a.t * 0.9, couleurs: ["#fbf5bd", "#e2c46a", "#ffd700"], taille: 6, duree: 1000, etale: 400 });
            }
        },
        {
            id: "regen-energie", nom: "Régénération d'énergie en fin de manche", sens: "sur soi",
            description: "Quelques paillettes dorées remontent autour du héros ; la jauge d'énergie se remplit d'un cran.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("energie");
                o.energie(sc.calque, sc.lanceur, 30, 35, 40, "+5 ⚡");
                await o.gerbe(sc.calque, a.x, a.y + a.t * 0.2, { nombre: 8, dist: a.t * 0.35, monte: a.t * 0.7, couleurs: ["#fbf5bd", "#e2c46a"], taille: 5, duree: 900, etale: 300 });
            }
        },
        {
            id: "depense-energie", nom: "Dépense d'énergie d'une compétence", sens: "sur soi",
            description: "L'énergie s'échappe du héros en éclats jaunes et la jauge baisse.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("depense");
                o.energie(sc.calque, sc.lanceur, 40, 28, 40, "-12 ⚡");
                await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 12, dist: a.t * 0.9, couleurs: ["#fbf5bd", "#e2c46a", "#c2a878"], taille: 5, duree: 700 }),
                    o.eclat(sc.lanceur, "brightness(0.8) saturate(0.7)", 600)]);
            }
        }
    ]);

    // =====================================================================
    //  5. CONTRÔLE ET DÉPLACEMENTS FORCÉS
    // =====================================================================
    // Une fuite désordonnée (Confusion).
    const fuiteConfuse = (sc, o) => marcher(sc, o, { cases: 3, duree: 280, tangue: 35, zigzag: 1.3, dir: (v) => o.tourner(v, hasard(-2.5, 2.5)), son: "pas-leger" });
    ajouter(5, null, [
        {
            id: "poussee", nom: "Poussée", sens: "vers l'ennemi",
            description: "Le héros frappe et l'ennemi glisse de deux cases en ligne droite, en laissant une traînée de poussière.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-5", sonImpact: "coup-physique" });
                o.son("poussee");
                o.texte(sc.calque, sc.cible, "Poussé !", COULEURS.etat);
                await marcher(sc, o, { qui: sc.cible, cases: 2, duree: 240, hauteur: 1, easing: "ease-out", dir: () => v,
                                       pas: (pt) => poussiere(o, sc.calque, pt, { n: 7, dist: 0.5 }) });
            }
        },
        {
            id: "traction", nom: "Traction magique", sens: "vers l'ennemi",
            description: "Un fil violet part du héros et attire l'ennemi, case après case, jusqu'à lui (jusqu'à 3 cases). Déjà au contact : la démonstration le pose loin, avec un second ennemi, puis les attire.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const fondFil = "linear-gradient(90deg, #e0c8ff, #9050e0)";
                const ecart = o.distanceCases(sc.lanceur, sc.cible);
                if (ecart !== null && ecart > 1) {
                    // EN VRAIES CONDITIONS : l'ennemi est loin, il est attiré jusqu'au contact (3 cases au plus).
                    const chemin = o.chemin(sc.cible, b, axe(b, a), Math.min(3, ecart - 1));
                    o.son("traction");
                    o.texte(sc.calque, sc.lanceur, "Traction !", COULEURS.etat);
                    const fil = o.lien(sc.calque, a, b, { couleur: "#b070ff", epaisseur: 4, fond: fondFil });
                    const arrivee = chemin[chemin.length - 1] || b;
                    const v1 = axe(a, b);
                    await Promise.all([o.parcourir(sc.cible, b, chemin, { duree: 300, apresPas: (pt) => poussiere(o, sc.calque, pt, { n: 4 }) }),
                        o.teinter(fil, [{ transform: `translate(0,-50%) rotate(${deg(v1.angle)}deg) scaleX(1)` },
                                        { transform: `translate(0,-50%) rotate(${deg(v1.angle)}deg) scaleX(${Math.max(0.05, axe(a, arrivee).d / v1.d)})` }],
                                  { duration: 300 * chemin.length, easing: "ease-in", fill: "forwards" })]);
                    await o.effacer(fil);
                    await o.arriver(sc.cible, arrivee);
                    return;
                }
                const pts = o.chemin(sc.cible, b, v, 3);
                const loin = pts[pts.length - 1] || b;
                // L'ennemi est d'abord posé au loin (sans transition).
                await o.bouger(sc.cible, [{ transform: `translate(${loin.x - b.x}px, ${loin.y - b.y}px)` }, { transform: `translate(${loin.x - b.x}px, ${loin.y - b.y}px)` }],
                               { duration: 20, fill: "forwards" });
                const v2 = o.tourner(v, 1.3);
                const p2 = o.chemin(sc.lanceur, a, v2, 3);
                const loin2 = p2[p2.length - 1], pres2 = p2[0];
                const f = loin2 ? o.figurant(sc.calque, sc.cible, loin2, {}) : null;
                await o.attendre(300);
                o.son("traction");
                const fil1 = o.lien(sc.calque, a, loin, { couleur: "#b070ff", epaisseur: 4, fond: "linear-gradient(90deg, #e0c8ff, #9050e0)" });
                const fil2 = f ? o.lien(sc.calque, a, loin2, { couleur: "#b070ff", epaisseur: 4, fond: "linear-gradient(90deg, #e0c8ff, #9050e0)" }) : null;
                o.texte(sc.calque, sc.lanceur, "Traction !", COULEURS.etat);
                const retour = [...pts.slice(0, -1).reverse(), { x: b.x, y: b.y }];
                // Les fils raccourcissent à mesure que les cibles arrivent.
                const raccourcir = (fil, loinP, presP, duree) => {
                    const v1 = axe(a, loinP), k = Math.max(0.05, axe(a, presP).d / v1.d);
                    return o.teinter(fil, [{ transform: `translate(0,-50%) rotate(${deg(v1.angle)}deg) scaleX(1)` },
                                           { transform: `translate(0,-50%) rotate(${deg(v1.angle)}deg) scaleX(${k})` }], { duration: duree, easing: "ease-in", fill: "forwards" });
                };
                await Promise.all([
                    o.parcourir(sc.cible, b, retour, { duree: 300, depuis: loin, apresPas: (pt) => poussiere(o, sc.calque, pt, { n: 4 }) }),
                    raccourcir(fil1, loin, b, 300 * retour.length),
                    f ? raccourcir(fil2, loin2, pres2, 900) : null,
                    f ? o.teinter(f, [{ transform: `${BASE} translate(0px, 0px)` }, { transform: `${BASE} translate(${pres2.x - loin2.x}px, ${pres2.y - loin2.y}px)` }],
                                  { duration: 900, easing: "ease-in", fill: "forwards" }) : null]);
                await Promise.all([o.effacer(fil1), fil2 ? o.effacer(fil2) : null]);
                await o.attendre(400);
                if (f) await o.effacer(f);
            }
        },
        {
            id: "peur", nom: "Peur", sens: "vers l'ennemi",
            description: "Une volute d'ombre touche l'ennemi : il tremble, s'assombrit, et s'enfuit loin du héros.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("peur");
                await orbe(o, sc.calque, a, b, { couleur: "#40206a", coeur: "#b090d0", taille: 0.3, traine: ["#40206a", "#7050a0"] });
                o.icone(sc.calque, b, "😱", { duree: 1300 });
                etat(o, sc.calque, sc.cible, "Peur !");
                teinte(o, sc.cible, SOMBRE);
                await o.secouer(sc.cible, 4, 450);
                o.son("course");
                await marcher(sc, o, { qui: sc.cible, cases: 2, duree: 240, tangue: 12, dir: () => v });
            }
        },
        {
            id: "provocation", nom: "Provocation", sens: "vers l'ennemi",
            description: "Le héros lance son défi : un anneau rouge part de lui, un « ! » éclate sur l'ennemi et un fil rouge le rive au héros.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("provocation");
                o.onde(sc.calque, a, { couleur: "#ff4040", taille: 1, duree: 700, echelle: 2.6, bord: 4 });
                await o.attendre(300);
                o.icone(sc.calque, b, "❗", { duree: 1400, lueur: "#ff4040" });
                etat(o, sc.calque, sc.cible, "Provoqué !");
                const fil = o.lien(sc.calque, b, a, { couleur: "#ff4040", epaisseur: 4, fond: "linear-gradient(90deg, #ff8080, #c01010)" });
                await o.bouger(sc.cible, [{ transform: "rotate(0deg)" }, { transform: "rotate(-14deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(0deg)" }], { duration: 600 });
                await o.attendre(600);
                await o.effacer(fil);
            }
        },
        {
            id: "confusion-soi", nom: "Confusion : se frappe soi-même", sens: "sur soi",
            description: "Confus, le héros retourne son arme contre lui : une entaille sur son propre pion.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                o.son("confusion");
                o.icone(sc.calque, a, "❓", { duree: 1300, lueur: "#c9a8ff" });
                await o.attendre(400);
                o.son("coup-sourd");
                o.texte(sc.calque, sc.lanceur, "Confusion : se frappe !", COULEURS.etat);
                await Promise.all([entaille(o, sc.calque, a, v.angle + Math.PI), encaisser(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-5" })]);
            }
        },
        {
            id: "confusion-allie", nom: "Confusion : attaque un allié au hasard", sens: "vers l'ennemi",
            description: "Confus, le héros se trompe de cible et frappe l'allié qui se tient à côté de lui.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const al = allie(o, sc, Math.PI * 0.75);
                o.son("confusion");
                o.icone(sc.calque, a, "❓", { duree: 1300, lueur: "#c9a8ff" });
                o.texte(sc.calque, sc.lanceur, "Confusion : frappe un allié !", COULEURS.etat);
                await o.attendre(450);
                await frapper(o, sc.calque, sc.lanceur, al.el, { valeur: "-6" });
                await o.attendre(300);
            }
        },
        {
            id: "confusion-fuite", nom: "Confusion : s'enfuit", sens: "sur soi",
            description: "Le dé de la Confusion roule au-dessus du héros… « S'enfuit ! » : il part en zigzag.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("confusion");
                await o.icone(sc.calque, a, "🎲", { duree: 800, tourne: 720 });
                o.texte(sc.calque, sc.lanceur, "S'enfuit !", COULEURS.etat);
                teinte(o, sc.lanceur, VIOLET);
                o.son("course");
                await fuiteConfuse(sc, o);
            }
        },
        {
            id: "confusion-dissipee", nom: "Confusion dissipée", sens: "sur soi",
            description: "Les points d'interrogation qui tournaient autour du héros éclatent en étincelles ; sa teinte violette s'efface.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                teinte(o, sc.lanceur, VIOLET, 200);
                o.etoiles(sc.calque, a, { signe: "?", couleur: "#d6a8ff", duree: 900, tours: 400 });
                await o.attendre(800);
                o.son("dissipe");
                o.texte(sc.calque, sc.lanceur, "Confusion dissipée", COULEURS.neutre);
                await Promise.all([o.gerbe(sc.calque, a.x, a.y - a.t * 0.2, { nombre: 12, dist: a.t * 0.8, couleurs: ["#ffffff", "#e0c8ff"], taille: 5, duree: 700 }),
                    deteindre(o, sc.lanceur, VIOLET, 700)]);
            }
        },
        {
            id: "immobilisation", nom: "Immobilisation", sens: "sur soi",
            description: "Des chaînes jaillissent du sol de tous côtés et se referment sur le héros ; il tire dessus, en vain.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                o.son("chaines");
                const anneau = o.poser(sc.calque, a.x, a.y, `width:${a.t * 1.2}px; height:${a.t * 1.2}px; border-radius:50%; z-index:${Z.sol};
                    border:5px dotted #8a8a8a; box-shadow:0 0 8px #444;`);
                o.surgir(anneau);
                await rassembler(o, sc.calque, a, { contenu: "⛓️", n: 6, taille: 0.3, duree: 450, rayon: 1.2 });
                etat(o, sc.calque, sc.lanceur, "Immobilisé !");
                for (let k = 0; k < 2; k++) {
                    await o.bouger(sc.lanceur, [{ transform: "translate(0,0)" }, { transform: `translate(${v.ux * 6}px, ${v.uy * 6}px)`, offset: 0.4 }, { transform: "translate(0,0)" }],
                                   { duration: 300, easing: "ease-out" });
                    o.son("chaines");
                    await o.attendre(150);
                }
                await o.effacer(anneau);
            }
        },
        {
            id: "etourdi", nom: "Étourdi", sens: "sur soi",
            description: "Le héros encaisse un choc ; des étoiles tournent autour de sa tête, il vacille.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("etourdi");
                encaisser(o, sc.calque, sc.lanceur, sc.cible, {});
                etat(o, sc.calque, sc.lanceur, "Étourdi !");
                await Promise.all([o.etoiles(sc.calque, a, { duree: 1800 }),
                    o.bouger(sc.lanceur, [{ transform: "rotate(0deg)" }, { transform: "rotate(-9deg)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-6deg)" },
                                          { transform: "rotate(5deg)" }, { transform: "rotate(0deg)" }], { duration: 1700, easing: "ease-in-out" })]);
            }
        }
    ]);

    // =====================================================================
    //  6. ÉTATS ALTÉRÉS (pose, présence, tic de fin de manche)
    // =====================================================================
    ajouter(6, null, [
        {
            id: "brule", nom: "Brûlé", sens: "vers l'ennemi",
            description: "Des braises pleuvent sur l'ennemi, qui rougeoie ; puis, en fin de manche, les flammes se ravivent et le brûlent.",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("brule");
                await rassembler(o, sc.calque, b, { couleur: "#ff7a1a", n: 9, taille: 0.1, duree: 450, rayon: 1.2 });
                o.icone(sc.calque, b, "🔥", { duree: 1300 });
                etat(o, sc.calque, sc.cible, "Brûlé !");
                await o.eclat(sc.cible, ORANGE, 600);
                await o.attendre(300);
                o.son("brule");
                o.jauge(sc.calque, sc.cible, 40, 36, 40, "-4", COULEURS.degats, COULEURS.degats);
                await Promise.all([o.gerbe(sc.calque, b.x, b.y + b.t * 0.2, { nombre: 12, dist: b.t * 0.4, monte: b.t * 0.9, couleurs: ["#ffd25a", "#ff7a1a", "#ff4500"], taille: 8, duree: 900, etale: 300 }),
                    o.eclat(sc.cible, ORANGE, 700)]);
            }
        },
        {
            id: "electrifie", nom: "Électrifié", sens: "vers l'ennemi",
            description: "De petits arcs électriques courent sur l'ennemi qui clignote ; il perd de l'initiative et craint davantage la magie.",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("electrique");
                for (let k = 0; k < 5; k++) {
                    const ang = hasard(0, Math.PI * 2), r = b.t * 0.45;
                    o.eclair(sc.calque, { x: b.x + Math.cos(ang) * r, y: b.y + Math.sin(ang) * r, t: b.t }, { x: b.x - Math.cos(ang) * r, y: b.y - Math.sin(ang) * r, t: b.t },
                             { largeur: 0.35, duree: 320, retard: k * 140, segments: 6 });
                }
                etat(o, sc.calque, sc.cible, "Électrifié !");
                o.attendre(450).then(() => o.texte(sc.calque, sc.cible, "-35 initiative", COULEURS.attention));
                o.attendre(900).then(() => o.texte(sc.calque, sc.cible, "+20 % dégâts magiques", COULEURS.attention));
                await o.teinter(sc.cible, [{ filter: "none" }, { filter: ELEC, offset: 0.1 }, { filter: "none", offset: 0.2 }, { filter: ELEC, offset: 0.35 },
                                           { filter: "none", offset: 0.5 }, { filter: ELEC, offset: 0.65 }, { filter: "none" }], { duration: 1200 });
                await o.attendre(400);
            }
        },
        {
            id: "saignement", nom: "Saignement", sens: "vers l'ennemi",
            description: "Une entaille rouge sur l'ennemi, des gouttes ; en fin de manche il saigne encore, et chaque case qu'il parcourt lui coûte plus cher.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                o.son("lame-impact");
                o.son("saignement", 120);
                await Promise.all([entaille(o, sc.calque, b, v.angle, { couleur: "#e02030", lueur: "#ff4050", lueur2: "#a00010" }),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 8, dist: b.t * 0.5, couleurs: ["#b0101c", "#e03040"], taille: 6, duree: 600 })]);
                etat(o, sc.calque, sc.cible, "Saignement !");
                await o.attendre(400);
                o.son("saignement");
                o.jauge(sc.calque, sc.cible, 40, 37, 40, "-3", COULEURS.degats, COULEURS.degats);
                await o.attendre(500);
                await marcher(sc, o, { qui: sc.cible, cases: 1, duree: 420, dir: () => o.tourner(v, Math.PI / 2), son: "pas",
                    pas: (pt) => { o.gerbe(sc.calque, pt.x, pt.y, { nombre: 5, dist: pt.t * 0.3, couleurs: ["#b0101c"], taille: 5, duree: 600 });
                                   o.texte(sc.calque, sc.cible, "+1 ⚡ par case", COULEURS.attention); } });
            }
        },
        {
            id: "aveugle", nom: "Aveuglé", sens: "sur soi",
            description: "L'obscurité se referme depuis les bords et s'arrête à quatre cases du héros : au-delà, il ne voit plus rien ; ses yeux se voilent.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("aveugle");
                o.icone(sc.calque, a, "🌑", { duree: 1600 });
                etat(o, sc.calque, sc.lanceur, "Aveuglé : 4 cases");
                const vision = o.pasHex(a) * 4.3;
                // La limite de vision : un cercle pointillé à quatre cases (dézoomer pour le voir en entier).
                const limite = o.poser(sc.calque, a.x, a.y, `width:${vision * 2}px; height:${vision * 2}px; border-radius:50%; z-index:${Z.haut};
                    border:2px dashed rgba(255,255,255,0.55);`);
                o.jouerPuisRetirer(limite, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2400 });
                await Promise.all([o.brouillard(sc.calque, a, vision, { duree: 2400, noir: 0.88 }),
                    o.teinter(sc.lanceur, [{ filter: "none" }, { filter: "brightness(0.6) blur(1px)", offset: 0.2 }, { filter: "brightness(0.6) blur(1px)", offset: 0.8 }, { filter: "none" }], { duration: 2000 })]);
            }
        },
        {
            id: "etourdi-presence", nom: "Étourdi — présence", sens: "sur soi",
            description: "Tant qu'il est étourdi, des étoiles tournent lentement autour du héros, qui oscille : une chance sur cinq de rater sa technique.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("etourdi");
                o.texte(sc.calque, sc.lanceur, "Étourdi : 20 % d'échec", COULEURS.etat);
                await Promise.all([o.etoiles(sc.calque, a, { duree: 2200, tours: 600 }),
                    o.bouger(sc.lanceur, [{ transform: "rotate(0deg)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(0deg)" }], { duration: 1100, iterations: 2 })]);
            }
        },
        {
            id: "immobilisation-presence", nom: "Immobilisation — présence", sens: "sur soi",
            description: "Un anneau de chaînes reste au sol autour du héros ; à chaque manche, il pulse et lui prend de l'énergie.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const anneau = o.poser(sc.calque, a.x, a.y, `width:${a.t * 1.2}px; height:${a.t * 1.2}px; border-radius:50%; z-index:${Z.sol};
                    border:5px dotted #8a8a8a; box-shadow:0 0 8px #444;`);
                o.surgir(anneau);
                o.icone(sc.calque, a, "⛓️", { duree: 1600 });
                etat(o, sc.calque, sc.lanceur, "Immobilisé");
                await o.attendre(600);
                o.son("chaines");
                o.teinter(anneau, [{ filter: "brightness(1)" }, { filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 500 });
                o.energie(sc.calque, sc.lanceur, 40, 37, 40, "-2 ⚡");
                await o.attendre(1000);
                await o.effacer(anneau);
            }
        },
        {
            id: "confusion-presence", nom: "Confusion — présence", sens: "sur soi",
            description: "Des points d'interrogation tournent autour du héros, dont la teinte vire et revient, comme un vertige.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("confusion");
                etat(o, sc.calque, sc.lanceur, "Confusion");
                await Promise.all([o.etoiles(sc.calque, a, { signe: "?", couleur: "#d6a8ff", duree: 2000, tours: 700 }),
                    o.teinter(sc.lanceur, [{ filter: "none" }, { filter: "hue-rotate(90deg) saturate(1.3)" }, { filter: "hue-rotate(-60deg)" }, { filter: "none" }], { duration: 1900 })]);
            }
        },
        {
            id: "peur-presence", nom: "Peur — présence", sens: "sur soi",
            description: "Une aura sombre frémit autour du héros, qui tremble sans cesse.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("peur");
                o.icone(sc.calque, a, "😨", { duree: 1700 });
                etat(o, sc.calque, sc.lanceur, "Peur");
                await Promise.all([o.aura(sc.calque, a, { couleur: "#3a2050", fond: "radial-gradient(circle, rgba(40,10,60,0) 50%, rgba(40,10,60,0.5) 80%)", pulsations: 3, duree: 1800 }),
                    o.secouer(sc.lanceur, 3, 1700)]);
            }
        },
        {
            id: "provocation-presence", nom: "Provocation — présence", sens: "sur soi",
            description: "Un fil rouge relie le héros provoqué à son provocateur ; il pulse, un « ! » rouge reste au-dessus du héros.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("provocation");
                o.icone(sc.calque, a, "❗", { duree: 1800, lueur: "#ff4040" });
                o.texte(sc.calque, sc.lanceur, "Provoqué : fixé sur lui", COULEURS.etat);
                const fil = o.lien(sc.calque, a, b, { couleur: "#ff4040", epaisseur: 4, fond: "linear-gradient(90deg, #c01010, #ff8080)" });
                await o.teinter(fil, [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 600, iterations: 3 });
                await o.effacer(fil);
            }
        },
        {
            id: "etalement-tic", nom: "Étalement — tic des dégâts différés", sens: "vers l'ennemi",
            description: "Le sceau grave sous l'ennemi pulse en fin de manche et lâche une part des dégâts différés.",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                const s = sceau(o, sc.calque, b, "#c83a6a", { duree: 1600 });
                await o.attendre(600);
                o.son("marque");
                o.son("coup-sourd", 120);
                o.teinter(s, [{ filter: "brightness(1)" }, { filter: "brightness(2.2)" }, { filter: "brightness(1)" }], { duration: 500 });
                o.jauge(sc.calque, sc.cible, 40, 36, 40, "-4", COULEURS.degats, COULEURS.degats);
                await Promise.all([o.eclat(sc.cible, ROUGE, 500), o.onde(sc.calque, b, { couleur: "#e04070", taille: 1, duree: 600, echelle: 1.5 })]);
                await o.attendre(400);
                await o.effacer(s);
            }
        },
        {
            id: "plaie-rouverte", nom: "Plaie rouverte (blessure)", sens: "sur soi",
            description: "Une vieille blessure se rouvre sur le héros : un trait rouge, des gouttes, des points de vie perdus.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                o.son("saignement");
                etat(o, sc.calque, sc.lanceur, "Plaie rouverte");
                await Promise.all([entaille(o, sc.calque, a, v.angle + Math.PI / 2, { couleur: "#e02030", lueur: "#ff4050", lueur2: "#a00010", taille: 1.2, duree: 600 }),
                    encaisser(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-3", force: 0.05 }),
                    o.gerbe(sc.calque, a.x, a.y + a.t * 0.1, { nombre: 7, dist: a.t * 0.35, couleurs: ["#b0101c", "#e03040"], taille: 5, duree: 700 })]);
            }
        },
        {
            id: "repli-etat", nom: "Repli (état d'un tour)", sens: "sur soi",
            description: "Après sa frappe, le héros garde un contour bleuté et une flèche de retour : ce tour-ci, il peut se replier sans être frappé.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("repli");
                o.icone(sc.calque, a, "↩️", { duree: 1700 });
                o.texte(sc.calque, sc.lanceur, "Repli (1 tour)", COULEURS.neutre);
                await Promise.all([o.aura(sc.calque, a, { couleur: "#8ac8ff", taille: 1.15, pulsations: 3, duree: 1800, trait: "dashed" }),
                    o.eclat(sc.lanceur, "drop-shadow(0 0 8px #8ac8ff)", 1700)]);
            }
        }
    ]);

    // =====================================================================
    //  7. ZONES ET TERRAIN
    // =====================================================================
    // LA NAPPE DU JEU (combat.js), case après case, sur les cases visées (par
    // défaut, l'ennemi et ses voisines) : elle reste sur la carte, comme en
    // combat, jusqu'à « ⟲ Replacer ».
    const zonePersistante = (type, nom, son, texte, description) => ({
        id: "zone-" + type, nom, sens: "vers l'ennemi", description, ciblage: CIBLAGE_ZONE,
        async jouer(sc, o) {
            const { b } = lieux(sc);
            const pts = ciblees(sc, o, () => o.autour(sc.cible, b, 1, { avecCentre: true }));
            const dedans = pionSur(sc, o, pts.find(pt => pionSur(sc, o, pt)));
            o.son(son);
            o.texte(sc.calque, dedans || sc.cible, texte, COULEURS.etat);
            const nappes = pts.map((pt, i) => o.nappe(sc.calque, pt, NAPPE_JEU[type], { persistante: true, fond: FONDS_ZONE[type], opacite: 0.85, retard: i * 70, duree: 420 }));
            await o.attendre(420 + pts.length * 70);
            await Promise.all([o.pulser(nappes, { duree: 520, fois: 2, eclat: 1.35 }), animerZone(o, sc.calque, pts, type, 1200)]);
            o.son(son);
            await animerZone(o, sc.calque, pts, type, 700);
            // Sans la carte du Studio (pas de terrain), la zone n'est qu'un dessin : elle s'efface.
            if (!sc.terrain) await effacerTout(o, nappes, { duree: 450 });
        }
    });
    ajouter(7, null, [
        {
            id: "zone-apercu", nom: "Aperçu d'une zone ciblée", sens: "vers l'ennemi",
            description: "Avant de lancer : les cases que la zone couvrira se teintent de rouge, cernées d'un trait, comme au combat, et pulsent ; un viseur marque son centre.",
            ciblage: CIBLAGE_ZONE,
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("chiffre");
                const pts = ciblees(sc, o, () => o.autour(sc.cible, b, 1, { avecCentre: true }));
                const coeur = milieu(pts);
                // Le dessin du combat (dessinerHexesZoneCiblage), sinon des hexagones orangés.
                const apercu = sc.terrain && typeof sc.terrain.apercuZone === "function" ? o.suivre(sc.terrain.apercuZone(pts)) : null;
                const cases = apercu ? [apercu]
                    : pts.map((pt, i) => o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,200,90,0.18), rgba(255,160,40,0.45) 85%)", retard: i * 30 }));
                o.icone(sc.calque, coeur, "⌖", { dy: 0, taille: 0.9, duree: 1600, lueur: "#ffb040" });
                o.texte(sc.calque, pionSur(sc, o, coeur) || sc.cible, "Zone ciblée", COULEURS.attention);
                if (apercu) {
                    apercu.dataset.ancre = "libre";
                    await o.teinter(apercu, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: "both" });
                    await o.teinter(apercu, [{ opacity: 1 }, { opacity: 0.4, offset: 0.5 }, { opacity: 1 }], { duration: 600, iterations: 3 });
                } else await o.pulser(cases, { duree: 600, fois: 3, eclat: 1.6, decale: 0 });
                await effacerTout(o, cases, { cascade: 0 });
            }
        },
        zonePersistante("feu", "Zone persistante de feu", "zone-feu", "Zone de feu",
                        "Les cases autour de l'ennemi s'embrasent en cascade ; les braises montent, les flammes vivent, puis tout retombe en cendres."),
        zonePersistante("glace", "Zone persistante de glace", "zone-glace", "Zone de glace",
                        "Le sol gèle case après case autour de l'ennemi : des éclats de givre scintillent, puis le givre fond."),
        zonePersistante("foudre", "Zone persistante de foudre", "zone-foudre", "Zone de foudre",
                        "Un champ électrique couvre les cases autour de l'ennemi : de petits éclairs y crépitent, puis la charge s'éteint."),
        zonePersistante("poison", "Zone persistante de poison", "zone-poison", "Zone de poison",
                        "Une nappe verte s'étale autour de l'ennemi et bouillonne de bulles toxiques, puis se dissipe."),
        {
            id: "gravats", nom: "Gravats / terrain difficile", sens: "vers l'ennemi",
            description: "Les tas de gravats du jeu jonchent les cases visées (par défaut, quelques-unes près de l'ennemi) : ce terrain coûte double. Ils restent sur la carte.",
            ciblage: { genre: "gravats", min: 1, max: 8,
                       consigne: "Touche les cases à joncher de gravats (8 au plus) — touche-en une de nouveau pour l'enlever — puis « Lancer »." },
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("gravats");
                const pts = ciblees(sc, o, () => o.autour(sc.cible, b, 1, { libres: true }).slice(0, 4));
                const { tas, restent } = tasDeGravats(o, sc, pts, { cascade: 110 });
                pts.forEach((pt, i) => o.attendre(i * 110).then(() => poussiere(o, sc.calque, pt, { n: 5 })));
                o.texte(sc.calque, pionSur(sc, o, pts[0]) || tas[0] || sc.cible, "Gravats : terrain difficile", COULEURS.attention);
                await o.attendre(1800);
                if (!restent) await effacerTout(o, tas);
            }
        }
    ]);

    // =====================================================================
    //  8. CLASSES — TOUS LES EFFETS, NIVEAU PAR NIVEAU
    // =====================================================================
    // Une barrière hexagonale (Chasseur de mages) autour du héros.
    const barriere = (o, calque, a, p = {}) => {
        const t = a.t * 1.6;
        const d = o.poser(calque, a.x, a.y, `width:${t}px; height:${t}px; z-index:${Z.haut};`,
            `<svg viewBox="-50 -50 100 100" width="100%" height="100%" style="overflow:visible; filter:drop-shadow(0 0 6px #ffe680) drop-shadow(0 0 12px #fff)">
               <polygon points="${[0, 1, 2, 3, 4, 5].map(i => `${46 * Math.cos(i * Math.PI / 3)},${46 * Math.sin(i * Math.PI / 3)}`).join(" ")}"
                 fill="rgba(255,240,180,0.12)" stroke="#fff3c0" stroke-width="3"/>
               <polygon points="${[0, 1, 2, 3, 4, 5].map(i => `${36 * Math.cos(i * Math.PI / 3 + Math.PI / 6)},${36 * Math.sin(i * Math.PI / 3 + Math.PI / 6)}`).join(" ")}"
                 fill="none" stroke="#ffd700" stroke-width="1.5" stroke-dasharray="5 4"/></svg>`);
        o.teinter(d, [{ transform: `${BASE} scale(0.3) rotate(0deg)`, opacity: 0 }, { transform: `${BASE} scale(1) rotate(30deg)`, opacity: 1, offset: 0.25 },
                      { transform: `${BASE} scale(1) rotate(${p.tours || 120}deg)`, opacity: 1 }], { duration: p.duree || 2000, easing: "ease-out", fill: "forwards" });
        return d;
    };
    // Un compagnon dessiné sur une case voisine du héros.
    const compagnon = (o, sc, tour) => {
        const { a, v } = lieux(sc);
        const pos = o.voisine(sc.lanceur, a, o.tourner(v, tour));
        return { el: o.pionDessine(sc.calque, pos, { contenu: "🐺" }), pos };
    };
    // Un pion qui se relève en zombie (vert-de-gris).
    const releverEnZombie = (o, el, tourne) => o.bouger(el, [
        { transform: `rotate(${tourne}deg) scale(0.9)`, filter: GRIS, opacity: 0.6 },
        { transform: "rotate(0deg) scale(1.05)", filter: ZOMBIE, opacity: 1, offset: 0.75 },
        { transform: "rotate(0deg) scale(1)", filter: ZOMBIE, opacity: 1 }
    ], { duration: 900, easing: "ease-out", fill: "forwards" });

    ajouter(8, "Sorcier", [
        {
            id: "tenebres", nom: "Niv.1 Ténèbres (sort de classe)", sens: "vers l'ennemi",
            description: "Une orbe d'ombre file sur l'ennemi : l'ombre ronge d'abord son énergie ; une fois l'énergie vide, la vie, ×1,5.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("tenebres");
                o.eclat(sc.lanceur, "brightness(0.65) drop-shadow(0 0 10px #6a2aa0)", 500);
                await orbe(o, sc.calque, a, b, { couleur: "#3a0a5a", coeur: "#a070d0", taille: 0.42, traine: ["#2a0a40", "#6a2aa0"] });
                o.son("impact-magique");
                o.aura(sc.calque, b, { couleur: "#6a2aa0", fond: "radial-gradient(circle, rgba(20,0,30,0.6), rgba(20,0,30,0) 70%)", pulsations: 2, duree: 1500 });
                o.energie(sc.calque, sc.cible, 12, 0, 40, "-12 ⚡");
                await o.teinter(sc.cible, [{ filter: "none" }, { filter: SOMBRE }], { duration: 500, fill: "forwards" });
                await o.attendre(500);
                o.texte(sc.calque, sc.cible, "Énergie vide : ×1,5", COULEURS.etat);
                o.jauge(sc.calque, sc.cible, 40, 25, 40, "-15", COULEURS.degats, COULEURS.degats);
                await o.secouer(sc.cible, b.t * 0.1, 400, v);
            }
        },
        {
            id: "tenebres-etalees", nom: "Niv.1 Ténèbres étalées", sens: "vers l'ennemi",
            description: "Un sceau d'ombre reste sous l'ennemi ; à chaque fin de manche il pulse et ronge son énergie.",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("tenebres");
                const s = sceau(o, sc.calque, b, "#8a50c0", { duree: 2000, tours: 260 });
                etat(o, sc.calque, sc.cible, "Ténèbres étalées");
                for (let k = 0; k < 2; k++) {
                    await o.attendre(650);
                    o.son("marque");
                    o.teinter(s, [{ filter: "brightness(1)" }, { filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 450 });
                    o.eclat(sc.cible, SOMBRE, 450);
                    o.energie(sc.calque, sc.cible, 30 - k * 4, 26 - k * 4, 40, "-4 ⚡");
                }
                await o.attendre(400);
                await o.effacer(s);
            }
        },
        {
            id: "charme-fratricide", nom: "Niv.5 Charme fratricide", sens: "vers l'ennemi",
            description: "Trois cœurs roses filent vers l'ennemi : il rosit, des cœurs tournent autour de lui. Il est charmé.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("charme");
                await Promise.all([0, 1, 2].map(k => o.filer(sc.calque, a, b, { contenu: "💗", taille: 0.32, duree: 600, retard: k * 140 })));
                etat(o, sc.calque, sc.cible, "Charmé !");
                await Promise.all([o.teinter(sc.cible, [{ filter: "none" }, { filter: ROSE }], { duration: 400, fill: "forwards" }),
                    o.etoiles(sc.calque, b, { signe: "♥", couleur: "#ff7ab8", duree: 1600 })]);
            }
        },
        {
            id: "charme-frappe", nom: "Niv.5 Charmé : frappe son allié", sens: "vers l'ennemi",
            description: "L'ennemi charmé, tout rose, se retourne contre le combattant de son propre camp et le frappe.",
            async jouer(sc, o) {
                const al = autreEnnemi(o, sc, Math.PI / 2);
                teinte(o, sc.cible, ROSE);
                o.son("charme");
                o.icone(sc.calque, centre(sc.cible, sc.calque), "💗", { duree: 1200 });
                o.texte(sc.calque, sc.cible, "Charmé : frappe son allié !", COULEURS.etat);
                await o.attendre(500);
                await frapper(o, sc.calque, sc.cible, al.el, { valeur: "-7" });
                await o.attendre(300);
            }
        },
        {
            id: "charme-perdu", nom: "Niv.5 Charme perdu", sens: "vers l'ennemi",
            description: "L'ennemi charmé cherche un allié à frapper, regarde à gauche, à droite… personne : le charme tombe à vide.",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                teinte(o, sc.cible, ROSE);
                o.icone(sc.calque, b, "❓", { duree: 1500, lueur: "#ff7ab8" });
                await o.bouger(sc.cible, [{ transform: "rotate(0deg)" }, { transform: "rotate(-25deg)", offset: 0.3 }, { transform: "rotate(25deg)", offset: 0.7 }, { transform: "rotate(0deg)" }],
                               { duration: 1100, easing: "ease-in-out" });
                o.son("refus");
                o.texte(sc.calque, sc.cible, "Charmé : aucun allié à portée", COULEURS.neutre);
                await deteindre(o, sc.cible, ROSE, 600);
            }
        },
        {
            id: "transfert", nom: "Niv.10 Transfert", sens: "vers l'ennemi",
            description: "Deux tourbillons violets s'ouvrent sous le héros et l'ennemi ; ils s'y engloutissent et réapparaissent chacun à la place de l'autre. Le héros regagne 10 PV.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("teleport");
                const tour = (pos) => o.aura(sc.calque, pos, { couleur: "#b070ff", fond: "radial-gradient(circle, rgba(120,40,200,0.4), rgba(120,40,200,0) 70%)", taille: 1.3, tourne: 540, pulsations: 2, duree: 1500, trait: "dashed", sol: true });
                tour(a); tour(b);
                const disparaitre = (el) => o.bouger(el, [{ transform: "scale(1) rotate(0deg)", opacity: 1 }, { transform: "scale(0.2) rotate(360deg)", opacity: 0 }], { duration: 450, easing: "ease-in", fill: "forwards" });
                await Promise.all([disparaitre(sc.lanceur), disparaitre(sc.cible)]);
                o.lacher(sc.lanceur); o.lacher(sc.cible);
                const reparaitre = (el, de, vers) => o.bouger(el, [
                    { transform: `translate(${vers.x - de.x}px, ${vers.y - de.y}px) scale(0.2) rotate(-360deg)`, opacity: 0 },
                    { transform: `translate(${vers.x - de.x}px, ${vers.y - de.y}px) scale(1) rotate(0deg)`, opacity: 1 }], { duration: 450, easing: "ease-out", fill: "forwards" });
                await Promise.all([reparaitre(sc.lanceur, a, b), reparaitre(sc.cible, b, a)]);
                o.texte(sc.calque, sc.lanceur, "+10", COULEURS.soin);
                o.eclat(sc.lanceur, "brightness(1.4) drop-shadow(0 0 10px #b070ff)", 600);
                await o.attendre(600);
                await o.echanger(sc.lanceur, sc.cible);
            }
        }
    ]);

    ajouter(8, "Protecteur", [
        {
            id: "provocation-protecteur", nom: "Niv.1 Provocation de ses attaques", sens: "vers l'ennemi",
            description: "Le Protecteur frappe ; une fois sur sept environ (15 %), sa frappe provoque : un « ! » rouge et un fil rouge rivent l'ennemi à lui.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8" });
                o.son("provocation");
                o.icone(sc.calque, b, "❗", { duree: 1300, lueur: "#ff4040" });
                etat(o, sc.calque, sc.cible, "Provoqué (15 %)");
                const fil = o.lien(sc.calque, b, a, { couleur: "#ff4040", epaisseur: 4, fond: "linear-gradient(90deg, #ff8080, #c01010)" });
                await o.attendre(1100);
                await o.effacer(fil);
            }
        },
        {
            id: "rempart", nom: "Niv.5 Rempart", sens: "sur soi",
            description: "Une chaîne dorée relie le Protecteur à l'allié voisin ; un écu s'élève au-dessus de l'allié, une aura d'or l'entoure (3 manches).",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const al = allie(o, sc, Math.PI * 0.65);
                await o.attendre(300);
                o.son("rempart");
                const chaine = o.lien(sc.calque, a, al.pos, { couleur: "#ffd700", epaisseur: 6 });
                o.icone(sc.calque, al.pos, "🛡️", { duree: 1500, lueur: "#ffd700" });
                o.texte(sc.calque, al.el, "Rempart : 3 manches", "#ffd700");
                await o.aura(sc.calque, al.pos, { couleur: "#ffd700", taille: 1.25, pulsations: 2, duree: 1400 });
                await o.effacer(chaine);
            }
        },
        {
            id: "rempart-actif", nom: "Niv.5 Rempart actif", sens: "sur soi",
            description: "L'allié protégé est frappé : la moitié du coup remonte la chaîne dorée et le Protecteur l'encaisse à sa place.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const al = allie(o, sc, Math.PI * 0.65);
                const chaine = o.lien(sc.calque, a, al.pos, { couleur: "#ffd700", epaisseur: 6 });
                await o.attendre(400);
                o.son("lame-souffle", 80);
                const elan = o.elan(sc.cible, b, al.pos, { portee: 0.4 });
                await o.attendre(300);
                o.son("coup-sourd");
                o.jauge(sc.calque, al.el, 40, 34, 40, "-6", COULEURS.degats, COULEURS.degats);
                await Promise.all([elan, o.secouer(al.el, 5, 300), o.eclat(al.el, ROUGE, 400)]);
                o.son("rempart");
                await o.filer(sc.calque, al.pos, a, { couleur: "#ffd700", taille: 0.3, duree: 450 });
                o.texte(sc.calque, sc.lanceur, "🛡️ Rempart", "#ffd700");
                o.jauge(sc.calque, sc.lanceur, 40, 34, 40, "-6", COULEURS.degats, COULEURS.degats);
                await Promise.all([o.secouer(sc.lanceur, 5, 300), o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 8px #ffd700)", 500)]);
                await o.attendre(300);
                await o.effacer(chaine);
            }
        },
        {
            id: "rempart-rompu", nom: "Niv.5 Rempart rompu", sens: "sur soi",
            description: "L'allié s'éloigne : la chaîne dorée se tend, puis casse en maillons qui retombent.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const al = allie(o, sc, Math.PI * 0.65);
                const chaine = o.lien(sc.calque, a, al.pos, { couleur: "#ffd700", epaisseur: 6 });
                await o.attendre(400);
                const pts = o.chemin(al.el, al.pos, axe(a, al.pos), 1);
                const loin = pts[0] || al.pos;
                o.son("pas");
                await Promise.all([o.parcourir(al.el, al.pos, pts, { duree: 500 }),
                    o.teinter(chaine, [{ transform: `translate(0,-50%) rotate(${deg(axe(a, al.pos).angle)}deg) scaleX(1)` },
                                       { transform: `translate(0,-50%) rotate(${deg(axe(a, loin).angle)}deg) scaleX(${axe(a, loin).d / axe(a, al.pos).d})` }],
                              { duration: 500, fill: "forwards" })]);
                o.son("rupture");
                const mi = { x: (a.x + loin.x) / 2, y: (a.y + loin.y) / 2 };
                chaine.remove();
                o.texte(sc.calque, sc.lanceur, "Rempart rompu", COULEURS.attention);
                await o.gerbe(sc.calque, mi.x, mi.y, { nombre: 10, dist: a.t * 0.6, couleurs: ["#ffd700", "#c9a24a"], taille: 6, carre: true, duree: 700 });
                await o.attendre(300);
            }
        },
        {
            id: "resonance-bouclier", nom: "Niv.10 Résonance du bouclier", sens: "vers l'ennemi",
            description: "Le Protecteur frappe le sol de son bouclier : une onde d'or balaie les cases voisines ; l'ennemi au contact est étourdi et perd 5 % de ses PV.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                await o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(1.14)", offset: 0.6 }, { transform: "scale(0.94)" }], { duration: 420, fill: "forwards" });
                o.son("onde-choc");
                o.lacher(sc.lanceur);
                const cases = o.autour(sc.lanceur, a, 1).map(pt => o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,230,140,0.6), rgba(226,184,79,0.25) 80%)", duree: 250 }));
                o.jauge(sc.calque, sc.cible, 40, 38, 40, "-5 %", COULEURS.degats, COULEURS.degats);
                o.attendre(400).then(() => etat(o, sc.calque, sc.cible, "Étourdi !"));
                await Promise.all([o.onde(sc.calque, a, { couleur: "#ffd700", taille: 1, duree: 800, echelle: 3.2, bord: 6 }),
                    o.onde(sc.calque, a, { couleur: "#fff3c0", taille: 0.8, duree: 800, echelle: 2.6, retard: 120 }),
                    o.secouer(sc.cible, b.t * 0.15, 400, v), o.etoiles(sc.calque, b, { duree: 1500 })]);
                await effacerTout(o, cases, { cascade: 0 });
            }
        }
    ]);

    ajouter(8, "Assassin", [
        {
            id: "instinct-tueur", nom: "Niv.1 Instinct du tueur", sens: "sur soi",
            description: "L'ennemi tombe ; une tête de mort, puis une aura rouge et noire flambe autour de l'Assassin : +15 % de critique pendant 2 manches.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("chute");
                o.icone(sc.calque, b, "💀", { duree: 1000 });
                await aTerre(o, sc.cible, 80, { duree: 500 });
                o.son("instinct");
                o.texte(sc.calque, sc.lanceur, "+15 % critique (2 manches)", COULEURS.critique);
                await Promise.all([o.aura(sc.calque, a, { couleur: "#c01020", fond: "radial-gradient(circle, rgba(0,0,0,0) 45%, rgba(60,0,0,0.45) 80%)", pulsations: 3, duree: 1600 }),
                    o.eclat(sc.lanceur, "brightness(1.2) drop-shadow(0 0 10px #ff2020)", 1400),
                    o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.8, couleurs: ["#ff2020", "#300000"], taille: 5, duree: 900, etale: 400 })]);
            }
        },
        {
            id: "assaut-mortel", nom: "Niv.5 Assaut mortel", sens: "vers l'ennemi",
            description: "Deux ennemis au contact, deux cases rougies : l'Assassin tranche les deux d'un trait ; le poison les gagne même si l'un esquive.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const autre = { pos: o.voisine(sc.lanceur, a, o.tourner(axe(a, b), Math.PI / 3)) };
                autre.el = o.figurant(sc.calque, sc.cible, autre.pos, {});
                const cases = [b, autre.pos].map(pt => o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,80,80,0.4), rgba(160,0,0,0.3) 80%)" }));
                await o.attendre(350);
                o.son("lame-souffle");
                await o.bouger(sc.lanceur, [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(-200deg) scale(1.12)", offset: 0.6 }, { transform: "rotate(-360deg) scale(1)" }],
                               { duration: 520, easing: "ease-in-out" });
                o.son("lame-impact");
                o.son("poison-bulles", 200);
                const toucher = (el, pos, valeur, esquive) => {
                    if (esquive) o.texte(sc.calque, el, "Esquivé 💨", COULEURS.neutre);
                    else o.jauge(sc.calque, el, 40, 30, 40, valeur, COULEURS.degats, COULEURS.degats);
                    o.attendre(450).then(() => etat(o, sc.calque, el, "Empoisonné !"));
                    return Promise.all([entaille(o, sc.calque, pos, axe(a, pos).angle), o.secouer(el, 5, 300),
                        o.teinter(el, [{ filter: "none" }, { filter: VERT, offset: 0.3 }, { filter: "none" }], { duration: 1000 }),
                        o.gerbe(sc.calque, pos.x, pos.y, { nombre: 8, dist: pos.t * 0.4, monte: pos.t * 0.5, couleurs: ["#7dd321", "#b5ff4c"], taille: 7, duree: 900 })]);
                };
                await Promise.all([toucher(sc.cible, b, "-10", false), toucher(autre.el, autre.pos, "-10", true)]);
                await effacerTout(o, cases);
            }
        }
    ]);

    ajouter(8, "Médicus", [
        {
            id: "soin-urgence", nom: "Niv.5 Soin d'urgence", sens: "sur soi",
            description: "Le Médicus lève les mains : une grande vague verte déferle sur le plateau, et tous les alliés debout reprennent 12 PV d'un coup.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const al1 = allie(o, sc, Math.PI * 0.7), al2 = allie(o, sc, -Math.PI * 0.7);
                await o.eclat(sc.lanceur, "brightness(1.6) drop-shadow(0 0 14px #7dff9a)", 400);
                o.son("soin-zone");
                o.onde(sc.calque, a, { couleur: "#7dff9a", taille: 1, duree: 1100, echelle: 5, bord: 5, fond: "radial-gradient(circle, rgba(125,255,154,0.25), transparent 70%)" });
                await o.attendre(250);
                await Promise.all([sc.lanceur, al1.el, al2.el].filter(Boolean).map((el, i) => o.attendre(i * 100).then(() => {
                    o.jauge(sc.calque, el, 22, 34, 40, "+12", COULEURS.soin, COULEURS.soin);
                    return lueurSoin(o, sc.calque, el, { n: 4 });
                })));
            }
        },
        {
            id: "prise-en-charge", nom: "Niv.10 Prise en charge", sens: "sur soi",
            description: "Un allié est à terre, à côté : le Médicus s'agenouille, une lueur verte le relève (30 % de ses PV), et les ennemis au contact sont repoussés d'une case.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const al = allie(o, sc, Math.PI * 0.65);
                await aTerre(o, al.el, 80, { duree: 10 });
                await o.attendre(300);
                o.son("releve");
                await o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(0.9)" }], { duration: 350, fill: "forwards" });
                const fil = o.lien(sc.calque, a, al.pos, { couleur: "#7dff9a", epaisseur: 5, fond: "linear-gradient(90deg, #d9ffe1, #3fbf6a)" });
                o.lacher(al.el);
                await deTerre(o, al.el, 80, {});
                o.texte(sc.calque, al.el, "Réanimé : 30 % PV", COULEURS.soin);
                lueurSoin(o, sc.calque, al.el, { n: 5 });
                await o.effacer(fil);
                o.lacher(sc.lanceur);
                o.son("poussee");
                o.texte(sc.calque, sc.cible, "Repoussé !", COULEURS.etat);
                o.onde(sc.calque, a, { couleur: "#7dff9a", taille: 1, duree: 600, echelle: 2.4 });
                await marcher(sc, o, { qui: sc.cible, cases: 1, duree: 300, dir: () => v, pas: (pt) => poussiere(o, sc.calque, pt, { n: 6 }) });
            }
        }
    ]);

    ajouter(8, "Chasseur de mages", [
        {
            id: "lumiere-classe", nom: "Niv.1 Lumière (sort de classe)", sens: "vers l'ennemi",
            description: "Le Chasseur de mages forge une lance de lumière et la projette : elle transperce l'ennemi et sa résistance magique dans un éclat doré.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                o.son("lumiere");
                await Promise.all([o.eclat(sc.lanceur, OR, 500), rassembler(o, sc.calque, a, { couleur: "#fff3a0", n: 8, duree: 400 })]);
                await o.projectile(sc.calque, a, b, { taille: 0.85, arc: 0, oriente: true, easing: "linear", duree: Math.min(420, 160 + v.d * 0.4), traine: ["#fff6c0", "#ffd700"],
                    style: "height:auto; aspect-ratio:6/1; background:linear-gradient(90deg, rgba(255,240,180,0), #fff6c0 50%, #ffffff); clip-path:polygon(0 40%, 80% 25%, 100% 50%, 80% 75%, 0 60%); filter:drop-shadow(0 0 8px #ffd700);" });
                o.son("impact-magique");
                o.jauge(sc.calque, sc.cible, 40, 30, 40, "-10", COULEURS.degats, COULEURS.degats);
                o.attendre(400).then(() => o.texte(sc.calque, sc.cible, "Résistance percée", "#ffd700"));
                await Promise.all([o.onde(sc.calque, b, { couleur: "#ffe680", taille: 0.9, duree: 600, echelle: 2, fond: "radial-gradient(circle, rgba(255,250,220,0.8), transparent 65%)" }),
                    o.eclat(sc.cible, "brightness(1.9) sepia(0.4)", 600), o.secouer(sc.cible, b.t * 0.08, 300, v)]);
            }
        },
        {
            id: "lumiere-aveuglante", nom: "Niv.1 Lumière aveuglante", sens: "vers l'ennemi",
            description: "La lumière éclate sur l'ennemi et ses voisins : un flash blanc, leurs yeux se voilent (8 %). « ☀️ Éblouis ! »",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const autre = autreEnnemi(o, sc, Math.PI / 2);
                o.son("lumiere");
                await orbe(o, sc.calque, a, b, { couleur: "#ffe680", coeur: "#ffffff", taille: 0.3 });
                o.son("aveugle");
                const flash = o.poser(sc.calque, b.x, b.y, `width:${b.t * 4.5}px; height:${b.t * 4.5}px; border-radius:50%; z-index:${Z.ciel};
                    background:radial-gradient(circle, rgba(255,255,255,0.95), rgba(255,250,210,0.6) 35%, rgba(255,250,210,0) 70%);`);
                o.jouerPuisRetirer(flash, [{ opacity: 0, transform: "translate(-50%,-50%) scale(0.3)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.25 },
                                           { opacity: 0, transform: "translate(-50%,-50%) scale(1.2)" }], { duration: 900 });
                await o.attendre(250);
                o.texte(sc.calque, sc.cible, "☀️ Éblouis !", "#ffd700");
                await Promise.all([sc.cible, autre.el].map(el => o.teinter(el, [{ filter: "brightness(2.2)" }, { filter: "brightness(0.5) blur(1px)", offset: 0.4 },
                                                                                 { filter: "brightness(0.5) blur(1px)", offset: 0.8 }, { filter: "none" }], { duration: 1500 })));
            }
        },
        {
            id: "bouclier-anti-magie", nom: "Niv.5 Bouclier anti-magie", sens: "sur soi",
            description: "Une barrière hexagonale de lumière se dresse et tourne autour du Chasseur (la manche en cours et la suivante).",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("anti-magie");
                const d = barriere(o, sc.calque, a, { duree: 2000 });
                o.texte(sc.calque, sc.lanceur, "Bouclier anti-magie : 2 manches", "#ffd700");
                await o.attendre(1800);
                await o.effacer(d);
            }
        },
        {
            id: "renvoi", nom: "Niv.5 Renvoi", sens: "sur soi",
            description: "Un sort ennemi heurte la barrière du Chasseur et repart, entier, frapper son lanceur. « 🔮 Renvoyé ! »",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const d = barriere(o, sc.calque, a, { duree: 2400 });
                await o.attendre(300);
                o.son("impact-magique");
                const bord = { x: a.x + (b.x - a.x) * 0.25, y: a.y + (b.y - a.y) * 0.25, t: a.t };
                await orbe(o, sc.calque, b, bord, { couleur: "#b070ff", taille: 0.32, arc: 0.15, duree: 360, easing: "ease-in" });
                o.son("renvoi");
                o.texte(sc.calque, sc.lanceur, "🔮 Renvoyé !", "#c9a8ff");
                o.teinter(d, [{ filter: "brightness(1)" }, { filter: "brightness(2.2)" }, { filter: "brightness(1)" }], { duration: 400 });
                await orbe(o, sc.calque, bord, b, { couleur: "#b070ff", taille: 0.36, arc: -0.2, duree: 340, easing: "ease-out", traine: ["#d6b0ff", "#9050e0"] });
                o.son("impact-magique");
                await encaisser(o, sc.calque, sc.cible, sc.lanceur, { valeur: "-12", filtre: VIOLET });
                await o.effacer(d);
            }
        },
        {
            id: "appel-lumiere", nom: "Niv.10 Appel de la lumière", sens: "sur soi",
            description: "Le Chasseur appelle le ciel : un éclat blanc inonde tout le champ de bataille, des rayons partent de lui ; les ennemis sont aveuglés 2 manches.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("appel-lumiere");
                await o.eclat(sc.lanceur, "brightness(1.8) drop-shadow(0 0 16px #ffffff)", 500);
                for (let i = 0; i < 8; i++) {
                    const ang = (i / 8) * Math.PI * 2;
                    o.rayon(sc.calque, a, { x: a.x + Math.cos(ang) * a.t * 3, y: a.y + Math.sin(ang) * a.t * 3, t: a.t },
                            { fond: "linear-gradient(90deg, rgba(255,255,240,0.95), rgba(255,240,180,0))", couleur: "#fff6c0", epaisseur: 0.12, duree: 1100, retard: i * 30 });
                }
                o.voile(sc.calque, { fond: "radial-gradient(circle, rgba(255,255,255,0.9), rgba(255,250,220,0.75))", duree: 1300, retard: 200 });
                await o.attendre(900);
                o.texte(sc.calque, sc.cible, "Aveuglé : 2 manches", COULEURS.etat);
                o.texte(sc.calque, sc.lanceur, "Appel de la lumière", "#ffd700");
                await o.teinter(sc.cible, [{ filter: "none" }, { filter: "brightness(0.5) blur(1px)", offset: 0.3 }, { filter: "brightness(0.5) blur(1px)", offset: 0.8 }, { filter: "none" }], { duration: 1400 });
            }
        }
    ]);

    ajouter(8, "Profanateur", [
        {
            id: "releve-zombies", nom: "Niv.5 Relève des zombies", sens: "vers l'ennemi",
            description: "L'ennemi tombé à côté du Profanateur : un sceau vert s'ouvre sous lui, et il se relève, vert-de-gris, à son service.",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("chute");
                await aTerre(o, sc.cible, 80, { duree: 500 });
                o.son("zombie");
                const s = sceau(o, sc.calque, b, "#7dd321", { duree: 1800 });
                await o.attendre(500);
                o.lacher(sc.cible);
                o.son("releve");
                await releverEnZombie(o, sc.cible, 80);
                o.texte(sc.calque, sc.cible, "Se relève : zombie !", "#9fe070");
                await o.attendre(700);
                await o.effacer(s);
            }
        },
        {
            id: "zombie-marche-attaque", nom: "Niv.5 Zombie qui marche / qui attaque", sens: "vers l'ennemi",
            description: "Un zombie du Profanateur avance en titubant, d'un pas lourd, puis griffe l'ennemi.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const loin = o.chemin(sc.lanceur, a, o.tourner(v, Math.PI * 0.75), 2);
                const depart = loin[loin.length - 1] || a;
                const z = o.figurant(sc.calque, sc.cible, depart, { filtre: ZOMBIE });
                o.son("zombie");
                await o.attendre(300);
                const vers = o.voisine(sc.cible, b, o.tourner(v, Math.PI * 0.6));
                await o.parcourir(z, depart, o.chemin(z, depart, axe(depart, vers), 2), { duree: 600, tangue: 10, hauteur: 1.02,
                    apresPas: () => o.son("pas-lourd") });
                // Il reste là où il est arrivé : on fixe sa place avant de lâcher son trajet.
                const ici = centre(z, sc.calque);
                o.lacher(z);
                z.style.left = ici.x + "px"; z.style.top = ici.y + "px";
                await frapper(o, sc.calque, z, sc.cible, { valeur: "-6", sonElan: false, sonImpact: "griffe", griffes: "#c8ffb0" });
                await o.attendre(300);
            }
        },
        {
            id: "sursis", nom: "Niv.10 Sursis", sens: "sur soi",
            description: "À 0 PV, le Profanateur reste debout, grisé, un sablier au-dessus de lui ; les coups le traversent sans effet. « Sursis 💀 »",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("sursis");
                teinte(o, sc.lanceur, GRIS, 400);
                o.icone(sc.calque, a, "⏳", { duree: 2400, tourne: 180 });
                o.aura(sc.calque, a, { couleur: "#7a1020", fond: "radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(40,0,0,0.5) 85%)", pulsations: 3, duree: 2200 });
                o.texte(sc.calque, sc.lanceur, "0 PV : sursis 2 tours", COULEURS.etat);
                await o.attendre(700);
                o.son("lame-souffle", 60);
                const elan = o.elan(sc.cible, b, a, { portee: 0.4 });
                await o.attendre(300);
                o.son("coup-sourd");
                o.texte(sc.calque, sc.lanceur, "Sursis 💀", COULEURS.neutre);
                await Promise.all([elan, entaille(o, sc.calque, a, axe(b, a).angle, { couleur: "#9a9a9a", lueur: "#666", lueur2: "#333" })]);
                await o.attendre(900);
            }
        },
        {
            id: "sursis-soin-refuse", nom: "Niv.10 Soin refusé en sursis", sens: "sur soi",
            description: "Des éclats de soin viennent au Profanateur en sursis… et se ternissent, retombent en cendres grises. « Sursis : aucun soin 💀 »",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                teinte(o, sc.lanceur, GRIS, 300);
                o.son("soin");
                await rassembler(o, sc.calque, a, { couleur: "#7dff9a", n: 9, duree: 600, rayon: 1.3 });
                o.son("refus");
                o.texte(sc.calque, sc.lanceur, "Sursis : aucun soin 💀", COULEURS.neutre);
                await o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.5, couleurs: ["#8a8a8a", "#5a5a5a"], taille: 5, duree: 900 });
            }
        },
        {
            id: "sursis-fin", nom: "Niv.10 Fin du sursis", sens: "sur soi",
            description: "Le sablier se vide et se renverse ; le Profanateur, à bout, s'effondre.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                teinte(o, sc.lanceur, GRIS, 300);
                o.son("sursis");
                await o.icone(sc.calque, a, "⌛", { duree: 1000, tourne: 180 });
                o.son("chute");
                o.texte(sc.calque, sc.lanceur, "Fin du sursis", COULEURS.degats, { taille: 24 });
                const loin = axe(b, a);
                o.lacher(sc.lanceur);
                await o.bouger(sc.lanceur, [{ transform: "translate(0,0) rotate(0deg)", filter: GRIS, opacity: 1 },
                    { transform: `translate(${loin.ux * a.t * 0.2}px, ${loin.uy * a.t * 0.2}px) rotate(${loin.ux >= 0 ? 85 : -85}deg) scale(0.9)`, filter: "grayscale(1) brightness(0.4)", opacity: 0.5 }],
                    { duration: 700, easing: "ease-in", fill: "forwards" });
                await o.attendre(900);
                await o.rentrer(sc.lanceur);
            }
        },
        {
            id: "releve-zombies-2", nom: "Niv.10 Relève des zombies à 2 cases", sens: "sur soi",
            description: "Un grand sceau vert s'étend jusqu'à deux cases du Profanateur ; deux ennemis tombés y sont saisis et se relèvent, zombies.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const loin = o.autour(sc.lanceur, a, 2, { libres: true }).filter(p => p.dist === 2);
                const choisis = [loin[0], loin[Math.floor(loin.length / 2)]].filter(Boolean);
                const morts = choisis.map(pt => o.figurant(sc.calque, sc.cible, pt, {}));
                await Promise.all(morts.map(m => aTerre(o, m, 80, { duree: 10 })));
                o.son("zombie");
                const s = sceau(o, sc.calque, a, "#7dd321", { taille: 4.6, duree: 2200, tours: 90 });
                await o.attendre(500);
                await Promise.all(choisis.map((pt, i) => o.filer(sc.calque, a, pt, { couleur: "#9fe070", taille: 0.2, duree: 500, retard: i * 120 })));
                o.son("releve");
                morts.forEach(m => o.lacher(m));
                await Promise.all(morts.map(m => releverEnZombie(o, m, 80)));
                o.texte(sc.calque, sc.lanceur, "Relève à 2 cases", "#9fe070");
                await o.attendre(700);
                await o.effacer(s);
            }
        }
    ]);

    ajouter(8, "Pisteur", [
        {
            id: "compagnon-apparition", nom: "Niv.1 Apparition du compagnon", sens: "sur soi",
            description: "Le Pisteur siffle : des feuilles tourbillonnent sur la case voisine et le compagnon en surgit.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                o.son("appel");
                const pos = o.voisine(sc.lanceur, a, o.tourner(v, Math.PI * 0.6));
                await o.gerbe(sc.calque, pos.x, pos.y, { nombre: 10, dist: pos.t * 0.6, couleurs: ["#7da040", "#a07a30"], texte: "🍃", taille: 16, tailleMin: 10, duree: 700 });
                o.son("apparition");
                const c = o.pionDessine(sc.calque, pos, { contenu: "🐺" });
                await o.surgir(c, { duree: 450 });
                o.texte(sc.calque, c, "Compagnon !", "#c9e09a");
                await o.attendre(1000);
                await o.effacer(c);
            }
        },
        {
            id: "compagnon-attaque", nom: "Niv.1 Attaque du compagnon", sens: "vers l'ennemi",
            description: "Juste après son maître, le compagnon bondit sur l'ennemi et le mord ; son attaque porte le nom trouvé par l'IA (« Croc sauvage »).",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                const c = compagnon(o, sc, Math.PI / 3);
                await o.surgir(c.el, { duree: 300 });
                o.texte(sc.calque, c.el, "Croc sauvage", "#c9e09a");
                await o.attendre(300);
                o.son("morsure", 200);
                const elan = o.elan(c.el, c.pos, b, { portee: 0.6, duree: 480 });
                await o.attendre(260);
                o.jauge(sc.calque, sc.cible, 40, 32, 40, "-8", COULEURS.degats, COULEURS.degats);
                await Promise.all([elan, griffes(o, sc.calque, b, axe(c.pos, b).angle, "#ffffff"), o.secouer(sc.cible, 5, 300), o.eclat(sc.cible, ROUGE)]);
                await o.attendre(300);
                await o.effacer(c.el);
            }
        },
        {
            id: "compagnon-terre", nom: "Niv.1 Compagnon mis à terre", sens: "vers l'ennemi",
            description: "L'ennemi frappe le compagnon : il pivote, pâlit et reste à terre.",
            async jouer(sc, o) {
                const c = compagnon(o, sc, Math.PI / 3);
                await o.surgir(c.el, { duree: 300 });
                await frapper(o, sc.calque, sc.cible, c.el, { valeur: "-14" });
                o.son("chute");
                o.texte(sc.calque, c.el, "À terre !", COULEURS.degats);
                await o.teinter(c.el, [{ transform: `${BASE} rotate(0deg)`, filter: "none", opacity: 1 }, { transform: `${BASE} rotate(80deg) scale(0.9)`, filter: GRIS, opacity: 0.6 }],
                                { duration: 600, fill: "forwards" });
                await o.attendre(800);
                await o.effacer(c.el);
            }
        },
        {
            id: "tir-precis", nom: "Niv.5 Tir précis", sens: "vers l'ennemi",
            description: "Une mire se resserre sur l'ennemi, la flèche part, droite et sûre : il est cloué au sol. « 🎯 Tir précis ! »",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const mire = o.poser(sc.calque, b.x, b.y, `width:${b.t * 1.6}px; height:${b.t * 1.6}px; z-index:${Z.ciel}; border-radius:50%;
                    border:3px solid #ff4040; box-shadow:0 0 8px #ff4040, inset 0 0 8px #ff4040;`,
                    `<div style="position:absolute; left:50%; top:0; bottom:0; width:2px; background:#ff4040; transform:translateX(-50%)"></div>
                     <div style="position:absolute; top:50%; left:0; right:0; height:2px; background:#ff4040; transform:translateY(-50%)"></div>`);
                await o.teinter(mire, [{ transform: `${BASE} scale(1.6)`, opacity: 0 }, { transform: `${BASE} scale(0.75)`, opacity: 1 }], { duration: 600, easing: "ease-in", fill: "forwards" });
                o.son("tir");
                await o.projectile(sc.calque, a, b, { taille: 0.7, arc: 0, oriente: true, easing: "linear", duree: Math.min(380, 140 + v.d * 0.4),
                    style: "height:auto; aspect-ratio:7/1; background:linear-gradient(90deg, #e8e0d0 0 12%, #6b4a2a 12% 82%, #cfd6dc 82%); clip-path:polygon(0 20%, 82% 30%, 82% 0, 100% 50%, 82% 100%, 82% 70%, 0 80%);" });
                o.son("fleche-impact");
                mire.remove();
                o.texte(sc.calque, sc.cible, "🎯 Tir précis !", "#ff6060");
                o.jauge(sc.calque, sc.cible, 40, 32, 40, "-8", COULEURS.degats, COULEURS.degats);
                o.son("chaines", 300);
                const anneau = o.poser(sc.calque, b.x, b.y, `width:${b.t * 1.2}px; height:${b.t * 1.2}px; border-radius:50%; z-index:${Z.sol}; border:5px dotted #8a8a8a;`);
                o.surgir(anneau);
                o.attendre(500).then(() => etat(o, sc.calque, sc.cible, "Immobilisé"));
                await Promise.all([o.secouer(sc.cible, 5, 300, v), o.eclat(sc.cible, ROUGE)]);
                await o.attendre(1000);
                await o.effacer(anneau);
            }
        },
        {
            id: "lien-sang-soin", nom: "Niv.10 Lien de sang — soin", sens: "sur soi",
            description: "Un lien rouge et or relie le Pisteur à son compagnon blessé ; un cœur le parcourt, et le compagnon retrouve tous ses PV.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const c = compagnon(o, sc, Math.PI * 0.6);
                o.teinter(c.el, [{ filter: "none" }, { filter: ROUGE }], { duration: 300, fill: "forwards" });
                await o.attendre(400);
                o.son("lien");
                const fil = o.lien(sc.calque, a, c.pos, { couleur: "#ff5050", epaisseur: 5, fond: "linear-gradient(90deg, #ffd700, #c01020)" });
                await o.filer(sc.calque, a, c.pos, { contenu: "❤️", taille: 0.35, duree: 600 });
                o.lacher(c.el);
                o.texte(sc.calque, c.el, "PV max !", COULEURS.soin);
                await lueurSoin(o, sc.calque, c.el, { n: 6 });
                await o.effacer(fil);
                await o.effacer(c.el);
            }
        },
        {
            id: "lien-sang-releve", nom: "Niv.10 Lien de sang — relève", sens: "sur soi",
            description: "Le compagnon est à terre : le lien de sang le saisit, un cœur bat le long du fil, et il se relève avec tous ses PV.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const c = compagnon(o, sc, Math.PI * 0.6);
                await o.teinter(c.el, [{ transform: `${BASE} rotate(80deg) scale(0.9)`, filter: GRIS, opacity: 0.6 }, { transform: `${BASE} rotate(80deg) scale(0.9)`, filter: GRIS, opacity: 0.6 }],
                                { duration: 10, fill: "forwards" });
                await o.attendre(400);
                o.son("lien");
                const fil = o.lien(sc.calque, a, c.pos, { couleur: "#ff5050", epaisseur: 5, fond: "linear-gradient(90deg, #ffd700, #c01020)" });
                await o.filer(sc.calque, a, c.pos, { contenu: "❤️", taille: 0.35, duree: 600 });
                o.son("releve");
                o.lacher(c.el);
                await o.teinter(c.el, [{ transform: `${BASE} rotate(80deg) scale(0.9)`, filter: GRIS, opacity: 0.6 }, { transform: `${BASE} rotate(0deg) scale(1.08)`, filter: "brightness(1.4)", opacity: 1, offset: 0.75 },
                                       { transform: `${BASE} rotate(0deg) scale(1)`, filter: "none", opacity: 1 }], { duration: 800, fill: "forwards" });
                o.texte(sc.calque, c.el, "Relevé : PV max", COULEURS.soin);
                await o.effacer(fil);
                await o.attendre(500);
                await o.effacer(c.el);
            }
        }
    ]);

    ajouter(8, "Géomancien", [
        {
            id: "mur-terre", nom: "Niv.5 Mur de terre", sens: "sur soi",
            description: "Sur chaque case touchée, la roche du jeu sort de terre en tremblant, dans un nuage de poussière ; les murs voisins se soudent en muraille et restent sur la carte. Un combattant sur une case murée est repoussé.",
            ciblage: { genre: "mur", min: 1, max: 8,
                       consigne: "Touche les cases où lever un mur, comme en combat (8 au plus ; pas sur ton pion) — touche-en une de nouveau pour l'enlever — puis « Lancer »." },
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const pts = ciblees(sc, o, () => o.autour(sc.lanceur, a, 1, { libres: true }).slice(0, 3));
                o.son("mur-terre");
                // Posés du haut de l'écran vers le bas : la roche du devant passe
                // devant (comme au combat) ; ils sortent de terre dans l'ordre touché.
                const murs = duHautVersLeBas(pts).map(i => o.mur(sc.calque, pts[i], { retard: i * 180, avec: pts }));
                o.texte(sc.calque, sc.lanceur, "Mur de terre", "#c8b08a");
                // Quelqu'un sur une case murée : il est repoussé (comme en combat).
                const pousses = pts.map((pt, i) => {
                    const pion = pionSur(sc, o, pt);
                    if (!pion || pion === sc.lanceur) return null;
                    return o.attendre(i * 180 + 220).then(() => {
                        o.son("poussee");
                        o.texte(sc.calque, pion, "Repoussé !", COULEURS.etat);
                        return repousser(sc, o, pion, pts, a);
                    });
                }).filter(Boolean);
                await Promise.all([o.attendre(1100 + pts.length * 180), ...pousses]);
                await garderMurs(o, sc, pts, murs);
            }
        },
        {
            id: "mur-terre-repousse", nom: "Niv.5 Mur de terre sous un combattant", sens: "vers l'ennemi",
            description: "Le mur jaillit sous le combattant qui se tenait sur la case visée (par défaut, l'ennemi) : il est éjecté sur une case voisine et la roche se dresse à sa place, pour de bon.",
            ciblage: { genre: "mur", min: 1, max: 1,
                       consigne: "Touche la case d'un combattant (l'ennemi) : le mur jaillira sous lui. Puis « Lancer »." },
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const pt = ciblees(sc, o, () => [{ ...b, ...(o.caseDe(sc.cible) || {}) }])[0];
                // Sans grille, la case de l'ennemi.
                const dessus = o.grille ? pionSur(sc, o, pt) : sc.cible;
                o.gerbe(sc.calque, pt.x, pt.y, { nombre: 8, dist: pt.t * 0.6, couleurs: ["#a08868", "#6e5a40"], taille: 5, carre: true, duree: 500 });
                if (dessus) o.secouer(dessus, 3, 400);
                await o.attendre(400);
                o.son("mur-terre");
                const mur = o.mur(sc.calque, pt, { avec: [pt] });
                if (dessus) {
                    o.son("poussee", 100);
                    o.texte(sc.calque, dessus, "Repoussé !", COULEURS.etat);
                    await o.attendre(150);
                    await repousser(sc, o, dessus, [pt], a);
                }
                await o.attendre(dessus ? 750 : 1100);
                await garderMurs(o, sc, [pt], [mur]);
            }
        },
        {
            id: "mur-effondre", nom: "Niv.5 Mur de terre effondré → gravats", sens: "vers l'ennemi",
            description: "Le mur visé (un mur levé sur la carte, ou une case libre où il se dresse d'abord) se fissure, tremble, puis s'écroule en un tas de gravats qui reste sur la case ; ses voisins gardent un moignon cassé.",
            ciblage: { genre: "effondre", min: 1, max: 4,
                       consigne: "Touche un mur de terre levé sur la carte (ou une case libre : un mur s'y dressera d'abord) — 4 au plus — puis « Lancer »." },
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pts = ciblees(sc, o, () => [o.voisine(sc.cible, b, o.tourner(v, Math.PI / 2))]);
                // La roche telle qu'elle se dresse (reliée à ses voisines) prend la place du mur de la carte le temps de tomber.
                const murs = duHautVersLeBas(pts).map(i => o.mur(sc.calque, pts[i], { sansApparition: true }));
                if (sc.terrain && typeof sc.terrain.retirerMur === "function") pts.forEach(pt => pt.q !== undefined && sc.terrain.retirerMur(pt.q, pt.r));
                await o.attendre(300);
                await Promise.all(murs.map(m => o.secouer(m, 4, 500)));
                o.son("effondrement");
                await Promise.all([...murs.map(m => o.effondrer(m)),
                    ...pts.map(pos => o.gerbe(sc.calque, pos.x, pos.y, { nombre: 16, dist: pos.t * 0.9, couleurs: ["#a08868", "#6e5a40", "#cbb898"], taille: 7, tailleMin: 3, carre: true, duree: 800 }))]);
                murs.forEach(m => m && m.remove());
                const { tas, restent } = tasDeGravats(o, sc, pts, { nombre: 9 });
                o.texte(sc.calque, tas[0] || sc.cible, "Gravats", COULEURS.attention);
                await o.attendre(1200);
                if (!restent) await effacerTout(o, tas);
            }
        },
        {
            id: "traverse-murs", nom: "Niv.5 Traverse ses propres murs", sens: "sur soi",
            description: "Un mur de terre sur sa route : le Géomancien le traverse comme une ombre, la roche devient translucide à son passage.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const dir = o.tourner(v, Math.PI / 2);
                const pts = o.chemin(sc.lanceur, a, dir, 2);
                const mur = pts[0] ? o.mur(sc.calque, pts[0], { sansApparition: true }) : null;
                await o.attendre(400);
                await o.parcourir(sc.lanceur, a, pts, { duree: 520, apresPas: (pt, i) => {
                    o.son("pas");
                    if (i === 0 && mur) {
                        o.son("gravats");
                        o.teinter(mur, [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 700 });
                        o.texte(sc.calque, sc.lanceur, "Traverse ses murs", "#c8b08a");
                    }
                } });
                await o.attendre(400);
                await o.arriver(sc.lanceur, pts[pts.length - 1]);
            }
        },
        {
            id: "zones-sans-danger", nom: "Niv.5 Ses zones ne le blessent pas", sens: "sur soi",
            description: "Le Géomancien marche dans ses propres flammes : elles s'écartent sous ses pas, il en sort indemne.",
            async jouer(sc, o) {
                const { a, v } = lieux(sc);
                const pts = o.chemin(sc.lanceur, a, o.tourner(v, -Math.PI / 2), 3);
                o.son("zone-feu");
                const cases = pts.map((pt, i) => o.nappe(sc.calque, pt, "feu", { fond: FONDS_ZONE.feu, opacite: 0.75, retard: i * 70 }));
                animerZone(o, sc.calque, pts, "feu", 1500);
                await o.attendre(450);
                await o.parcourir(sc.lanceur, a, pts, { duree: 420, apresPas: (pt) => {
                    o.son("pas");
                    o.onde(sc.calque, pt, { couleur: "#ffcf5a", taille: 0.6, duree: 450, echelle: 1.8 });
                } });
                o.texte(sc.calque, sc.lanceur, "Indemne", COULEURS.soin);
                await o.attendre(500);
                await Promise.all([o.arriver(sc.lanceur, pts[pts.length - 1]), effacerTout(o, cases)]);
            }
        }
    ]);

    ajouter(8, "Sentinelle", [
        {
            id: "fureur-sentinelle", nom: "Niv.10 Fureur de la sentinelle", sens: "vers l'ennemi",
            description: "La Sentinelle tournoie et frappe chaque ennemi au contact, puis recule d'une case.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const autre = { pos: o.voisine(sc.lanceur, a, o.tourner(axe(a, b), -Math.PI * 0.66)) };
                autre.el = o.figurant(sc.calque, sc.cible, autre.pos, {});
                await o.attendre(300);
                o.son("tourbillon");
                o.texte(sc.calque, sc.lanceur, "Fureur !", COULEURS.critique);
                const tour = o.bouger(sc.lanceur, [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(360deg) scale(1.12)", offset: 0.7 }, { transform: "rotate(360deg) scale(1)" }],
                                      { duration: 700, easing: "ease-in-out" });
                await o.attendre(250);
                o.son("lame-impact"); o.son("lame-impact", 150);
                const toucher = (el, pos, k) => {
                    o.attendre(k * 150).then(() => o.jauge(sc.calque, el, 40, 33, 40, "-7", COULEURS.degats, COULEURS.degats));
                    return Promise.all([entaille(o, sc.calque, pos, axe(a, pos).angle, { retard: k * 150 }), o.secouer(el, 5, 300), o.eclat(el, ROUGE)]);
                };
                await Promise.all([tour, toucher(sc.cible, b, 0), toucher(autre.el, autre.pos, 1)]);
                await marcher(sc, o, { cases: 1, duree: 320, son: "pas", dir: (v) => o.tourner(v, Math.PI) });
            }
        }
    ]);

    ajouter(8, "Oracle", [
        {
            id: "retour-arriere", nom: "Niv.10 Retour arrière", sens: "vers l'ennemi",
            description: "Un sablier se renverse à l'envers, le temps reflue sur l'Oracle ; il prend un repos long, son énergie remonte, puis sa compétence part.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("rembobiner");
                o.icone(sc.calque, a, "⏳", { duree: 1400, tourne: -540 });
                o.texte(sc.calque, sc.lanceur, "Retour arrière", "#9fd8ff");
                await o.teinter(sc.lanceur, [{ filter: "none" }, { filter: "hue-rotate(-120deg) saturate(1.5)" }, { filter: "hue-rotate(-240deg) saturate(1.5)" }, { filter: "none" }],
                                { duration: 1100 });
                o.son("repos");
                o.texte(sc.calque, sc.lanceur, "Repos long avant d'agir", COULEURS.neutre);
                o.energie(sc.calque, sc.lanceur, 10, 40, 40, "+30 ⚡");
                await o.gerbe(sc.calque, a.x, a.y + a.t * 0.2, { nombre: 10, dist: a.t * 0.35, monte: a.t * 0.8, couleurs: ["#fbf5bd", "#e2c46a"], taille: 6, duree: 800, etale: 300 });
                o.son("lumiere");
                await orbe(o, sc.calque, a, b, { couleur: "#9fd8ff", coeur: "#ffffff", taille: 0.3 });
                o.son("impact-magique");
                await encaisser(o, sc.calque, sc.cible, sc.lanceur, { valeur: "-8" });
            }
        }
    ]);

    ajouter(8, "Vampire", [
        {
            id: "insensible-gel", nom: "Niv.1 Insensible au gel", sens: "sur soi",
            description: "Un trait de glace frappe le Vampire : le givre se forme… puis fond aussitôt en brume rouge. « ❄️ Insensible au gel »",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("gel-lancer");
                await sortEnnemi(o, sc, { couleur: "#9fe6ff", coeur: "#ffffff", taille: 0.3, arc: 0 });
                o.son("glace-impact");
                await Promise.all([o.onde(sc.calque, a, { couleur: "#bdf3ff", taille: 1, duree: 400, echelle: 1.3 }), o.eclat(sc.lanceur, GIVRE, 400)]);
                o.son("resiste");
                o.texte(sc.calque, sc.lanceur, "❄️ Insensible au gel", COULEURS.neutre);
                await o.gerbe(sc.calque, a.x, a.y, { nombre: 12, dist: a.t * 0.6, monte: a.t * 0.4, couleurs: ["#c01020", "#ff5060", "#600010"], taille: 8, tailleMin: 4, duree: 900 });
            }
        },
        {
            id: "baiser-vampire", nom: "Niv.5 Baiser du vampire", sens: "vers l'ennemi",
            description: "Le Vampire fond sur l'ennemi et le mord : deux points rouges, puis des filets de sang remontent jusqu'à lui et le soignent.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const elan = o.elan(sc.lanceur, a, b, { portee: 0.7, duree: 520 });
                await o.attendre(300);
                o.son("morsure");
                [-1, 1].forEach(k => {
                    const d = o.poser(sc.calque, b.x + k * b.t * 0.1, b.y, `width:${b.t * 0.1}px; height:${b.t * 0.1}px; border-radius:50%; z-index:${Z.haut}; background:#c01020; box-shadow:0 0 6px #ff2030;`);
                    o.jouerPuisRetirer(d, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1400 });
                });
                o.jauge(sc.calque, sc.cible, 40, 30, 40, "-25", "#e6e6e6", "#e6e6e6");
                o.eclat(sc.cible, ROUGE, 500);
                await elan;
                o.son("aspiration");
                await Promise.all(Array.from({ length: 8 }, (_, k) => o.filer(sc.calque, b, a, { couleur: "#d01030", taille: 0.12, duree: 600, retard: k * 70 })));
                o.jauge(sc.calque, sc.lanceur, 20, 35, 40, "+15", COULEURS.soin, COULEURS.soin);
                await o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff2030)", 600);
            }
        },
        {
            id: "nuee", nom: "Niv.10 Nuée de chauve-souris", sens: "sur soi",
            description: "Le Vampire éclate en chauves-souris qui tournoient autour de sa case ; il n'est plus qu'une ombre (esquive 40 %, 2 manches).",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("nuee");
                await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 12, dist: a.t * 1.1, couleurs: ["#1a0a1a", "#3a1a3a"], texte: "🦇", taille: 20, tailleMin: 12, duree: 700 }),
                    o.teinter(sc.lanceur, [{ opacity: 1, filter: "none" }, { opacity: 0.3, filter: "brightness(0.4) blur(2px)" }], { duration: 500, fill: "forwards" })]);
                o.texte(sc.calque, sc.lanceur, "Nuée : esquive 40 %", COULEURS.etat);
                o.son("nuee");
                await o.etoiles(sc.calque, a, { signe: "🦇", couleur: "#2a102a", duree: 1600, tours: 720 });
                await deteindre(o, sc.lanceur, "brightness(0.4) blur(2px)", 400);
            }
        },
        {
            id: "esquive-nuee", nom: "Niv.10 Esquive en nuée", sens: "sur soi",
            description: "En nuée, le Vampire est frappé : les chauves-souris s'écartent sous la lame, puis se reforment.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                await o.teinter(sc.lanceur, [{ opacity: 1, filter: "none" }, { opacity: 0.35, filter: "brightness(0.4) blur(2px)" }], { duration: 300, fill: "forwards" });
                o.son("lame-souffle", 80);
                const elan = o.elan(sc.cible, b, a, { portee: 0.45 });
                await o.attendre(300);
                o.son("nuee");
                o.son("esquive");
                o.texte(sc.calque, sc.lanceur, "Esquivé 🦇", COULEURS.neutre);
                await Promise.all([elan, entaille(o, sc.calque, a, axe(b, a).angle, { couleur: "#cccccc" }),
                    o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 1.2, couleurs: ["#1a0a1a"], texte: "🦇", taille: 18, tailleMin: 12, duree: 600 })]);
                await rassembler(o, sc.calque, a, { contenu: "🦇", n: 8, taille: 0.3, duree: 500, rayon: 1.2 });
            }
        }
    ]);

    // =====================================================================
    //  9. TALENTS QUI SE VOIENT
    // =====================================================================
    ajouter(9, null, [
        {
            id: "adrenaline", nom: "Adrénaline du Bourreau", sens: "vers l'ennemi",
            description: "L'ennemi tombe ; des volutes dorées s'en échappent et rejoignent le héros, dont l'énergie remonte.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("chute");
                o.icone(sc.calque, b, "💀", { duree: 900 });
                await aTerre(o, sc.cible, 80, { duree: 500 });
                o.son("energie");
                await Promise.all(Array.from({ length: 5 }, (_, k) => o.filer(sc.calque, b, a, { couleur: "#ffd700", taille: 0.16, duree: 650, retard: k * 90 })));
                o.texte(sc.calque, sc.lanceur, "Adrénaline", "#ffd700");
                o.energie(sc.calque, sc.lanceur, 24, 32, 40, "+8 ⚡");
                await o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #ffd700)", 600);
            }
        },
        {
            id: "inertie-martiale", nom: "Inertie martiale", sens: "vers l'ennemi",
            description: "Le héros charge en ligne droite jusqu'à l'ennemi, des silhouettes dans son sillage ; plus la course est longue, plus l'impact est lourd. « ⚡ Inertie martiale » (au contact : il prend d'abord deux cases d'élan).",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const ecart = o.distanceCases(sc.lanceur, sc.cible);
                if (ecart !== null && ecart > 1) {
                    // EN VRAIES CONDITIONS : l'ennemi est à distance, le héros charge en ligne droite jusqu'à lui.
                    const chemin = o.chemin(sc.lanceur, a, v, Math.min(4, ecart - 1));
                    o.son("charge");
                    let prec = a;
                    await o.parcourir(sc.lanceur, a, chemin, { duree: 150, hauteur: 1.04, easing: "linear",
                        apresPas: (pt) => { o.fantome(sc.calque, sc.lanceur, prec, { opacite: 0.4 }); prec = pt; } });
                    await o.arriver(sc.lanceur, chemin[chemin.length - 1]);
                    o.son("lourd-impact");
                    o.texte(sc.calque, sc.lanceur, `⚡ Inertie martiale -${2 * chemin.length}`, COULEURS.attention);
                    await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-14", sonElan: false, sonImpact: false, elan: { portee: 0.7, duree: 360, prise: 0.05, frappe: 0.35 },
                                                                       contact: 120, force: 0.2, entaille: { taille: 1.9, epaisseur: 9 } });
                    return;
                }
                const recul = o.chemin(sc.lanceur, a, o.tourner(v, Math.PI), 2);
                const depart = recul[recul.length - 1] || a;
                await o.bouger(sc.lanceur, [{ transform: `translate(${depart.x - a.x}px, ${depart.y - a.y}px)`, opacity: 0 },
                                            { transform: `translate(${depart.x - a.x}px, ${depart.y - a.y}px)`, opacity: 1 }], { duration: 250, fill: "forwards" });
                o.son("charge");
                let prec = depart;
                await o.parcourir(sc.lanceur, a, [...recul.slice(0, -1).reverse(), { x: a.x, y: a.y }], { duree: 150, hauteur: 1.04, depuis: depart, easing: "linear",
                    apresPas: (pt) => { o.fantome(sc.calque, sc.lanceur, prec, { opacite: 0.4 }); prec = pt; } });
                o.lacher(sc.lanceur);
                o.son("lourd-impact");
                o.texte(sc.calque, sc.lanceur, "⚡ Inertie martiale -4", COULEURS.attention);
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-14", sonElan: false, sonImpact: false, elan: { portee: 0.7, duree: 360, prise: 0.05, frappe: 0.35 },
                                                                   contact: 120, force: 0.2, entaille: { taille: 1.9, epaisseur: 9 } });
            }
        },
        {
            id: "impact-cinetique", nom: "Impact cinétique", sens: "vers l'ennemi",
            description: "Frappé, l'ennemi est projeté contre un obstacle derrière lui : il s'y écrase dans un nuage de pierres. « 💥 Impact ! »",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const obstacle = o.voisine(sc.cible, b, v);
                const mur = o.mur(sc.calque, obstacle, { sansApparition: true });
                await o.attendre(300);
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-6", sonImpact: "coup-physique" });
                o.son("poussee");
                const dx = (obstacle.x - b.x) * 0.45, dy = (obstacle.y - b.y) * 0.45;
                await o.bouger(sc.cible, [{ transform: "translate(0,0)" }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: 220, easing: "ease-in", fill: "forwards" });
                o.son("impact-mur");
                o.texte(sc.calque, sc.cible, "💥 Impact !", COULEURS.critique);
                o.jauge(sc.calque, sc.cible, 34, 28, 40, "-6", COULEURS.degats, COULEURS.degats);
                o.lacher(sc.cible);
                await Promise.all([
                    o.bouger(sc.cible, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) rotate(8deg)`, offset: 0.4 }, { transform: "translate(0,0)" }],
                             { duration: 600, easing: "ease-out" }),
                    o.secouer(mur, 5, 400),
                    o.gerbe(sc.calque, (b.x + obstacle.x) / 2, (b.y + obstacle.y) / 2, { nombre: 14, dist: b.t * 0.8, couleurs: ["#a08868", "#6e5a40", "#fff"], taille: 6, carre: true, duree: 700 }),
                    o.eclat(sc.cible, ROUGE, 500)]);
                await o.attendre(400);
                await o.effacer(mur);
            }
        },
        {
            id: "elan-partage", nom: "Élan partagé", sens: "sur soi",
            description: "Le soigneur se soigne, et des arcs d'énergie dorée bondissent vers les alliés à son contact.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const al1 = allie(o, sc, Math.PI * 0.7), al2 = allie(o, sc, -Math.PI * 0.7);
                o.son("soin");
                await lueurSoin(o, sc.calque, sc.lanceur, { n: 5 });
                o.son("energie");
                o.texte(sc.calque, sc.lanceur, "Élan partagé", "#ffd700");
                await Promise.all([al1, al2].filter(x => x.el).map((al, k) => o.filer(sc.calque, a, al.pos, { couleur: "#ffd700", taille: 0.2, duree: 500, retard: k * 120 })
                    .then(() => { o.energie(sc.calque, al.el, 30, 33, 40, "+3 ⚡"); return o.eclat(al.el, "brightness(1.3) drop-shadow(0 0 8px #ffd700)", 500); })));
                await o.attendre(300);
            }
        },
        {
            id: "bouclier-sages", nom: "Bouclier des Sages", sens: "sur soi",
            description: "Initiative 100 : le héros joue en premier, prend un repos long, et une enveloppe bleue et or le protège jusqu'à la fin de la manche.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.icone(sc.calque, a, "⏱ 100", { taille: 0.4, duree: 1300, lueur: "#ffd700" });
                o.son("repos");
                o.icone(sc.calque, a, "💤", { dx: a.t * 0.4, dy: -a.t * 0.4, taille: 0.35, duree: 1000, retard: 300 });
                o.energie(sc.calque, sc.lanceur, 14, 40, 40, "+26 ⚡");
                await o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(0.95)" }, { transform: "scale(1)" }], { duration: 900 });
                o.son("benediction");
                o.texte(sc.calque, sc.lanceur, "+ Résistances (fin de manche)", "#8fa8ff");
                await o.aura(sc.calque, a, { couleur: "#8fa8ff", fond: "radial-gradient(circle, rgba(143,168,255,0.1) 50%, rgba(255,215,0,0.25) 85%)", taille: 1.4, pulsations: 2, duree: 1400 });
            }
        },
        {
            id: "degats-illusoires", nom: "Dégâts illusoires", sens: "vers l'ennemi",
            description: "L'ennemi brise l'illusion du héros ; ses éclats repartent vers lui et le blessent. « ✨ Dégâts illusoires »",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pos = o.voisine(sc.cible, b, o.tourner(v, Math.PI * 0.6));
                const f = o.figurant(sc.calque, sc.lanceur, pos, { filtre: ILLUSION, opacite: 0.78 });
                await o.attendre(350);
                await frapper(o, sc.calque, sc.cible, f, { sonImpact: "bris-verre" });
                f.remove();
                o.son("impact-magique");
                await Promise.all(Array.from({ length: 6 }, (_, k) => o.filer(sc.calque, pos, b, { couleur: "#c9a8ff", taille: 0.12, duree: 420, retard: k * 50 })));
                o.texte(sc.calque, sc.cible, "✨ Dégâts illusoires", "#c9a8ff");
                await encaisser(o, sc.calque, sc.cible, sc.lanceur, { valeur: "-5", filtre: VIOLET });
            }
        },
        {
            id: "immunise", nom: "Immunisé", sens: "sur soi",
            description: "Un état néfaste se pose pour trois tours ; un sceau d'or s'allume et le raccourcit d'un tour.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("poison-bulles");
                await o.icone(sc.calque, a, "☠️ 3", { taille: 0.42, duree: 900 });
                o.son("resiste");
                const s = sceau(o, sc.calque, a, "#ffd700", { duree: 1300 });
                o.eclat(sc.lanceur, OR, 600);
                o.texte(sc.calque, sc.lanceur, "Immunisé : -1 tour", "#ffd700");
                await o.icone(sc.calque, a, "☠️ 2", { taille: 0.42, duree: 1100 });
                await o.effacer(s);
            }
        },
        {
            id: "pugiliste", nom: "Pugiliste", sens: "vers l'ennemi",
            description: "Un direct du poing, sec : le venin éclabousse l'ennemi (+15 % de poison).",
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.icone(sc.calque, centre(sc.lanceur, sc.calque), "👊", { taille: 0.45, duree: 700 });
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-6", sonElan: false, sonImpact: "coup-poing", elan: { portee: 0.5, duree: 360, frappe: 0.5 }, contact: 190,
                                                                   entaille: { taille: 0.8, epaisseur: 10, couleur: "#fff6e0" } });
                o.son("poison-bulles");
                o.texte(sc.calque, sc.cible, "Poison +15 %", COULEURS.etat);
                await Promise.all([o.gerbe(sc.calque, b.x, b.y, { nombre: 10, dist: b.t * 0.6, couleurs: ["#7dd321", "#b5ff4c"], taille: 8, tailleMin: 4, duree: 700 }),
                    o.teinter(sc.cible, [{ filter: "none" }, { filter: VERT, offset: 0.3 }, { filter: "none" }], { duration: 900 })]);
            }
        },
        {
            id: "diversion", nom: "Diversion", sens: "sur soi",
            description: "Le héros s'éloigne ; l'ennemi frappe au passage… une silhouette laissée en leurre, qui se dissipe. Le héros n'a rien.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const leurre = o.fantome(sc.calque, sc.lanceur, a, { opacite: 0.6, duree: 1400 });
                const loin = o.voisine(sc.lanceur, a, o.tourner(v, Math.PI));
                o.son("pas-leger");
                const part = o.parcourir(sc.lanceur, a, [loin], { duree: 380 });
                o.son("lame-souffle", 100);
                const elan = o.elan(sc.cible, b, a, { portee: 0.45 });
                await o.attendre(300);
                o.son("esquive");
                o.texte(sc.calque, sc.lanceur, "Diversion : esquivée", COULEURS.neutre);
                await Promise.all([part, elan, entaille(o, sc.calque, a, axe(b, a).angle, { couleur: "#dddddd" }),
                    leurre ? o.gerbe(sc.calque, a.x, a.y, { nombre: 8, dist: a.t * 0.5, couleurs: ["#e0e0e0", "#a0a0a0"], taille: 6, duree: 600 }) : null]);
                await o.attendre(300);
                await o.arriver(sc.lanceur, loin);
            }
        }
    ]);

    // L'ORDRE DE LA LISTE DE NICO (les dix premières y prennent leur place).
    const ORDRE = [
        // 1. Déplacements
        "marche", "marche-difficile", "marche-gelee", "marche-vargen", "bond", "repli", "pas-retraite", "fuite-peur", "fuite-confusion",
        "entree-zone", "hemorragie-interne", "arrivee-renfort", "apparition-illusion", "deploiement",
        // 2. Attaques
        "coup-epee", "attaque-legere", "attaque-lourde", "attaque-distance", "boule-de-feu", "attaque-foudre", "attaque-glace", "attaque-multi",
        "mots-de-pouvoir", "lumiere-forge", "attaque-zone", "attaque-etalee", "coup-critique", "attaque-opportunite", "attaque-zombie",
        "frappe-mur", "echec-technique", "hors-portee", "competence-sur-soi",
        // 3. Impacts et défenses
        "coup-recu", "coup-recu-physique", "coup-recu-magique", "coup-recu-brut", "degats-envol", "esquive", "parade", "contre", "absorption",
        "resistance-element", "bouclier-encaisse", "bouclier-brise", "etat-resiste", "mise-a-terre", "illusion-brisee",
        // 4. Soins, protections, énergie
        "soin", "soin-zone", "soin-etale", "soin-reduit", "bouclier", "purification", "benediction-magique", "benediction-physique",
        "benediction-offensive", "repos-long", "regen-energie", "depense-energie",
        // 5. Contrôle
        "poussee", "traction", "peur", "provocation", "confusion-soi", "confusion-allie", "confusion-fuite", "confusion-dissipee", "immobilisation", "etourdi",
        // 6. États altérés
        "poison", "brule", "gel", "electrifie", "saignement", "aveugle", "etourdi-presence", "immobilisation-presence", "confusion-presence",
        "peur-presence", "provocation-presence", "etalement-tic", "plaie-rouverte", "repli-etat",
        // 7. Zones et terrain
        "zone-apercu", "zone-feu", "zone-glace", "zone-foudre", "zone-poison", "gravats",
        // 8. Classes
        "tenebres", "tenebres-etalees", "charme-fratricide", "charme-frappe", "charme-perdu", "transfert",
        "provocation-protecteur", "rempart", "rempart-actif", "rempart-rompu", "resonance-bouclier",
        "instinct-tueur", "assaut-mortel",
        "soin-urgence", "prise-en-charge",
        "lumiere-classe", "lumiere-aveuglante", "bouclier-anti-magie", "renvoi", "appel-lumiere",
        "releve-zombies", "zombie-marche-attaque", "sursis", "sursis-soin-refuse", "sursis-fin", "releve-zombies-2",
        "compagnon-apparition", "compagnon-attaque", "compagnon-terre", "tir-precis", "lien-sang-soin", "lien-sang-releve",
        "mur-terre", "mur-terre-repousse", "mur-effondre", "traverse-murs", "zones-sans-danger",
        "fureur-sentinelle", "retour-arriere",
        "insensible-gel", "baiser-vampire", "nuee", "esquive-nuee",
        // 9. Talents
        "adrenaline", "inertie-martiale", "impact-cinetique", "elan-partage", "bouclier-sages", "degats-illusoires", "immunise", "pugiliste", "diversion"
    ];
    window.ORDRE_ANIMATIONS_COMBAT = ORDRE;
    window.enregistrerAnimationsCombat(A, ORDRE);
})();
