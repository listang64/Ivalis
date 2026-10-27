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
    // Les effets d'état sur la cible (animations_combat.js, v242).
    const { effetGlace, effetPoison, ticPoison } = window.OUTILS_ANIMATION;
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
    const JAUNE_LEGER = "brightness(1.2) sepia(0.5) saturate(1.6) hue-rotate(-8deg)";

    // --- LES MORCEAUX COMMUNS ----------------------------------------------
    // Où sont les deux pions, et l'axe héros → ennemi.
    const lieux = ({ lanceur, cible, calque }) => {
        const a = centre(lanceur, calque), b = centre(cible, calque);
        return { a, b, v: axe(a, b) };
    };
    const etat = (o, calque, pion, texte) => o.texte(calque, pion, texte, COULEURS.etat);

    // =====================================================================
    //  LA DISTORSION MENTALE (v265)
    // =====================================================================
    //  Nico : « des ondes psychiques qui déforment l'image en dessous vers la
    //  cible, et à la réception des dégâts la cible se déforme un peu sur
    //  elle-même avant de redevenir normale. »
    //
    //  LE SOL SE DÉFORME POUR DE BON. La carte (l'image de fond et la grille)
    //  est recopiée une fois, sur la bande qui va du lanceur à sa cible, dans
    //  un canevas posé SOUS les pions. Chaque onde est un arc qui roule vers la
    //  cible ; sous elle, la copie est redessinée en fines couronnes, chacune
    //  légèrement agrandie ou rétrécie autour du lanceur : la carte gonfle puis
    //  se creuse au passage de l'onde, comme sous une lentille, et redevient
    //  elle-même derrière. Ni lecture de pixels (l'image vient d'ailleurs) ni
    //  filtre sur tout le plateau : rien que des copies découpées, ce que
    //  l'iPad sait faire vite. Sur chaque crête, un fil violet clair (la couleur
    //  de la Distorsion, pont_combat.js) — trois, `anim-arc-mots`.
    const VIOLET_DISTORSION = "#c9a2ff";
    const sourcesDuSol = () => {
        const ids = ["image-map-vtt", "studio-image-carte", "studio-canvas"];
        const els = ids.map(id => document.getElementById(id));
        if (window.PLATEAU_VTT && window.PLATEAU_VTT.canvas) els.push(window.PLATEAU_VTT.canvas);
        return els.filter((el, i, l) => el && l.indexOf(el) === i && el.isConnected
                && (el.tagName !== "IMG" || (el.complete && el.naturalWidth > 0))
                && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden")
            .sort((x, y) => (x.tagName === "IMG" ? 0 : 1) - (y.tagName === "IMG" ? 0 : 1));
    };
    const ondesPsychiques = (o, sc, a, b, p = {}) => {
        const n = p.ondes || 3, ecartement = (p.demiAngle || 34) * Math.PI / 180;
        const v = axe(a, b), t = a.t;
        const r0 = t * 0.45, r1 = Math.max(r0 + t * 0.5, v.d);
        const duree = p.duree || 760, decale = p.decale || 170, largeur = t * 0.62, force = t * (p.force || 0.17);
        const vitesse = Math.max(0.05, Number(window.VITESSE_ANIMATIONS) || 1);
        // Les fils violets, sur les crêtes : posés dans le calque, au-dessus du sol.
        const R = r1 + largeur;
        const arcDeg = (ecartement * 180 / Math.PI).toFixed(1);
        const fils = Array.from({ length: n }, (_, i) => {
            const d = o.poser(sc.calque, a.x, a.y, `width:${R * 2}px; height:${R * 2}px; z-index:${Z.haut}; opacity:0;`,
                `<svg viewBox="-1 -1 2 2" width="100%" height="100%" style="overflow:visible; filter:drop-shadow(0 0 4px ${VIOLET_DISTORSION})">
                   <path d="M${Math.cos(-ecartement).toFixed(4)} ${Math.sin(-ecartement).toFixed(4)} A1 1 0 0 1 ${Math.cos(ecartement).toFixed(4)} ${Math.sin(ecartement).toFixed(4)}"
                         fill="none" stroke="${VIOLET_DISTORSION}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                   <path d="M${Math.cos(-ecartement * 0.8).toFixed(4)} ${Math.sin(-ecartement * 0.8).toFixed(4)} A1 1 0 0 1 ${Math.cos(ecartement * 0.8).toFixed(4)} ${Math.sin(ecartement * 0.8).toFixed(4)}"
                         fill="none" stroke="#f3e9ff" stroke-width="0.9" stroke-opacity="0.8" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`);
            d.classList.add("anim-arc-mots");
            d.dataset.arc = arcDeg;
            const echelle = (r) => (r / R).toFixed(4);
            return o.jouerPuisRetirer(d, [
                { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(${echelle(r0)})`, opacity: 0 },
                { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(${echelle(r0 + (r1 - r0) * 0.2)})`, opacity: 0.9, offset: 0.2 },
                { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(${echelle(r0 + (r1 - r0) * 0.8)})`, opacity: 0.75, offset: 0.8 },
                { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(${echelle(r1)})`, opacity: 0 }
            ], { duration: duree, delay: i * decale, easing: "linear" });
        });
        // LE SOL : une copie de la carte sur la bande, déformée au passage des ondes.
        const sources = sourcesDuSol();
        let sol = Promise.resolve();
        if (sources.length && !o.annulee()) {
            const cr = sc.calque.getBoundingClientRect();
            const angles = Array.from({ length: 13 }, (_, i) => v.angle - ecartement + (2 * ecartement * i) / 12);
            const xs = [a.x, ...angles.map(g => a.x + Math.cos(g) * R)], ys = [a.y, ...angles.map(g => a.y + Math.sin(g) * R)];
            const boite = { x: Math.floor(Math.min(...xs) - 4), y: Math.floor(Math.min(...ys) - 4) };
            boite.l = Math.ceil(Math.max(...xs) + 4) - boite.x; boite.h = Math.ceil(Math.max(...ys) + 4) - boite.y;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const copie = document.createElement("canvas");
            copie.width = Math.max(1, Math.round(boite.l * dpr)); copie.height = Math.max(1, Math.round(boite.h * dpr));
            const cc = copie.getContext("2d");
            sources.forEach(el => {
                const r = el.getBoundingClientRect();
                const nl = el.tagName === "IMG" ? el.naturalWidth : el.width, nh = el.tagName === "IMG" ? el.naturalHeight : el.height;
                const x0 = Math.max(cr.left + boite.x, r.left), y0 = Math.max(cr.top + boite.y, r.top);
                const x1 = Math.min(cr.left + boite.x + boite.l, r.right), y1 = Math.min(cr.top + boite.y + boite.h, r.bottom);
                if (x1 <= x0 || y1 <= y0 || !nl || !nh) return;
                try {
                    cc.drawImage(el, (x0 - r.left) * nl / r.width, (y0 - r.top) * nh / r.height, (x1 - x0) * nl / r.width, (y1 - y0) * nh / r.height,
                                 (x0 - cr.left - boite.x) * dpr, (y0 - cr.top - boite.y) * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr);
                } catch (e) {}
            });
            const porteur = o.poser(sc.calque, boite.x + boite.l / 2, boite.y + boite.h / 2,
                `width:${boite.l}px; height:${boite.h}px; z-index:1;`, "");
            porteur.classList.add("anim-sol-distorsion");
            const ecran = document.createElement("canvas");
            ecran.width = copie.width; ecran.height = copie.height;
            ecran.style.cssText = "width:100%; height:100%; display:block;";
            porteur.appendChild(ecran);
            const ce = ecran.getContext("2d");
            const ax = (a.x - boite.x) * dpr, ay = (a.y - boite.y) * dpr;
            const couronnes = 5, bandes = [[-1, -0.45, 0.45], [-0.45, 0.45, 1], [0.45, 1, 0.45]];
            const debut = performance.now(), total = (duree + (n - 1) * decale) / vitesse;
            sol = new Promise(fin => {
                const image = (maintenant) => {
                    if (o.annulee() || !porteur.isConnected) { porteur.remove(); return fin(); }
                    const ecoule = maintenant - debut;
                    ce.clearRect(0, 0, ecran.width, ecran.height);
                    for (let i = 0; i < n; i++) {
                        const u = (ecoule - (i * decale) / vitesse) / (duree / vitesse);
                        if (u <= 0 || u >= 1) continue;
                        const rayon = (r0 + (r1 - r0) * u) * dpr, enveloppe = Math.sin(Math.PI * u), w = largeur * dpr;
                        for (let k = 0; k < couronnes; k++) {
                            const ri = Math.max(1, rayon - w / 2 + (k * w) / couronnes), re = ri + w / couronnes + 0.6;
                            const milieu = (k + 0.5) / couronnes;
                            bandes.forEach(([g0, g1, poids]) => {
                                const delta = force * dpr * enveloppe * poids * Math.sin(Math.PI * 2 * milieu);
                                const echelle = 1 + delta / ((ri + re) / 2);
                                ce.save();
                                ce.beginPath();
                                ce.arc(ax, ay, re, v.angle + g0 * ecartement, v.angle + g1 * ecartement);
                                ce.arc(ax, ay, ri, v.angle + g1 * ecartement, v.angle + g0 * ecartement, true);
                                ce.closePath();
                                ce.clip();
                                ce.translate(ax, ay); ce.scale(echelle, echelle); ce.translate(-ax, -ay);
                                ce.drawImage(copie, 0, 0);
                                ce.restore();
                            });
                        }
                    }
                    if (ecoule < total) requestAnimationFrame(image);
                    else { porteur.remove(); fin(); }
                };
                requestAnimationFrame(image);
            });
        }
        // `arrivee` : quand la première onde touche (o.attendre tient compte de la vitesse).
        return { arrivee: duree * 0.92, fin: Promise.all([...fils, sol]) };
    };
    // LA CIBLE SE TORD SUR ELLE-MÊME, puis redevient elle-même : son pion
    // s'écrase et se penche dans un sens, dans l'autre, et son image ondule
    // (un filtre de turbulence sur l'image seule, le temps du coup).
    let numeroTorsion = 0;
    const tordreCible = (o, el, p = {}) => {
        const duree = p.duree || 760;
        const image = el && el.querySelector ? (el.querySelector(".token-img-main") || el) : null;
        let filtre = null, avant = "";
        if (image && !o.annulee()) {
            const id = "anim-torsion-" + (++numeroTorsion);
            filtre = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            filtre.setAttribute("width", "0"); filtre.setAttribute("height", "0");
            filtre.style.cssText = "position:absolute; width:0; height:0; overflow:hidden;";
            filtre.innerHTML = `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${numeroTorsion % 9}" result="bruit"/>
                <feDisplacementMap in="SourceGraphic" in2="bruit" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>`;
            document.body.appendChild(filtre);
            const deplacement = filtre.querySelector("feDisplacementMap");
            avant = image.style.filter;
            image.style.filter = `url(#${id})`;
            const vitesse = Math.max(0.05, Number(window.VITESSE_ANIMATIONS) || 1);
            const debut = performance.now(), total = duree / vitesse, fort = (image.getBoundingClientRect().width || 60) * 0.16;
            const pas = (maintenant) => {
                const u = Math.min(1, (maintenant - debut) / total);
                deplacement.setAttribute("scale", (fort * Math.sin(Math.PI * u) * (1 - 0.4 * u)).toFixed(2));
                if (u < 1 && !o.annulee() && filtre.isConnected) requestAnimationFrame(pas);
                else { image.style.filter = avant; filtre.remove(); }
            };
            requestAnimationFrame(pas);
        }
        return o.bouger(el, [{ transform: "scale(1, 1) skewX(0deg)" },
            { transform: "scale(1.13, 0.88) skewX(8deg) rotate(-3deg)", offset: 0.22 },
            { transform: "scale(0.9, 1.1) skewX(-7deg) rotate(3deg)", offset: 0.48 },
            { transform: "scale(1.05, 0.96) skewX(3deg)", offset: 0.74 },
            { transform: "scale(1, 1) skewX(0deg)" }], { duration: duree, easing: "ease-in-out" });
    };
    // Tenir une teinte sur un pion le temps de l'animation (elle s'en va au nettoyage).
    const teinte = (o, el, filtre, duree) => o.teinter(el, [{ filter: "none" }, { filter: filtre }], { duration: duree || 300, fill: "forwards" });
    const deteindre = (o, el, filtre, duree) => o.teinter(el, [{ filter: filtre }, { filter: "none" }], { duration: duree || 400, fill: "forwards" });
    // L'ENTAILLE D'UNE LAME, en travers de l'axe du coup — EFFILÉE AUX DEUX
    // BOUTS (Nico : « le trait qui apparaît pour simuler le coup, ses deux
    // extrémités, fais-les en pointes ») : un croissant plein, épais au milieu,
    // en pointe aux extrémités, que la lame dévoile puis emporte (un masque qui
    // court le long de la courbe).
    let numeroEntaille = 0;
    const entaille = (o, calque, pos, angle, p = {}) => {
        const t = pos.t * (p.taille || 1.5);
        const e = p.epaisseur || 7, id = "anim-entaille-" + (++numeroEntaille);
        const d = o.poser(calque, pos.x + (p.dx || 0), pos.y + (p.dy || 0), `width:${t}px; height:${t}px; z-index:${Z.haut};
            transform:translate(-50%,-50%) rotate(${deg(angle) + (p.tourne || 0)}deg);`,
            `<svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible">
               <defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
                 <path d="M30 12 Q 62 50 30 88" fill="none" stroke="#fff" stroke-width="${e * 3 + 6}" stroke-linecap="round" stroke-dasharray="120" stroke-dashoffset="120"/>
               </mask></defs>
               <path class="entaille-lame" d="M30 10 Q ${59 + e} 50 30 90 Q ${59 - e} 50 30 10 Z" fill="${p.couleur || "#fff"}" mask="url(#${id})"
                 style="filter:drop-shadow(0 0 6px ${p.lueur || "#fff"}) drop-shadow(0 0 12px ${p.lueur2 || "#9cf"})"/></svg>`);
        return o.teinter(d.querySelector("mask path"), [{ strokeDashoffset: 120 }, { strokeDashoffset: 0, offset: 0.5 }, { strokeDashoffset: -120 }],
                         { duration: p.duree || 380, delay: p.retard || 0, easing: "ease-out" })
            .then(() => d.remove());
    };
    // Trois griffures parallèles (un fauve, un zombie).
    const griffes = (o, calque, pos, angle, couleur) => Promise.all([-1, 0, 1].map(k => entaille(o, calque, pos, angle,
        { taille: 1.1, epaisseur: 4, couleur, lueur: couleur, lueur2: couleur, dx: -Math.sin(angle) * k * pos.t * 0.16, dy: Math.cos(angle) * k * pos.t * 0.16, retard: (k + 1) * 50 })));
    // LE COUP REÇU (Nico : « cette animation de coup reçu, mets-la pour toutes
    // les réceptions d'attaque physique du Studio ») : le pion recule à
    // l'opposé du coup et s'empourpre, une gerbe de sang jaillit de son flanc,
    // et l'on entend la chair entaillée (plus de « ding »). `depuis` : le pion
    // ou le point d'où vient le coup.
    const coupRecu = (o, calque, pion, depuis, p = {}) => {
        const A = centre(pion, calque), D = depuis && depuis.x !== undefined ? depuis : centre(depuis, calque);
        const recul = axe(D, A);
        const flanc = { x: A.x - recul.ux * A.t * 0.4, y: A.y - recul.uy * A.t * 0.4 };
        if (p.son !== false) o.son(p.son || "entaille-chair");
        if (p.valeur) o.jauge(calque, pion, 40, Math.max(2, 40 - Math.abs(parseInt(p.valeur, 10) || 8)), 40, p.valeur, p.couleur || COULEURS.degats, p.couleur || COULEURS.degats);
        return Promise.all([o.secouer(pion, A.t * (p.force || 0.14), 380, recul), o.eclat(pion, ROUGE, 480),
            // Une illusion qui se brise ne saigne pas (`sang: false`) : des éclats clairs.
            o.gerbe(calque, flanc.x, flanc.y, { nombre: p.n || 8, dist: A.t * 0.6, angle: recul.angle + Math.PI, eventail: Math.PI * 0.9,
                                                couleurs: p.sang === false ? ["#ffffff", "#d6c8ff"] : ["#c4141c", "#ff6b6b"], taille: 6 })]);
    };
    // UN COUP au corps à corps, de `de` vers `vers` (n'importe quels pions) :
    // l'élan (le bruit de la lame), l'entaille, puis le coup reçu.
    const frapper = async (o, calque, de, vers, p = {}) => {
        const A = centre(de, calque), B = centre(vers, calque), v = axe(A, B);
        if (p.sonElan !== false) o.son(p.sonElan || "lame-souffle", p.retardSon === undefined ? 150 : p.retardSon);
        const elan = o.elan(de, A, B, p.elan || {});
        await o.attendre(p.contact || 330);
        await Promise.all([elan,
            p.griffes ? griffes(o, calque, B, v.angle, p.griffes) : entaille(o, calque, B, v.angle, p.entaille || {}),
            coupRecu(o, calque, vers, A, { son: p.sonImpact === false ? false : (p.sonImpact || "entaille-chair"), valeur: p.valeur, couleur: p.couleur,
                                           force: p.force ? p.force * 1.3 : undefined, sang: p.sang })]);
        return { A, B, v };
    };
    // Encaisser un coup venu de `depuis` : un coup physique est un coup reçu
    // (le sang, la chair) ; un coup teinté (`filtre` : magie, confusion…) garde
    // sa secousse et sa couleur.
    const encaisser = (o, calque, pion, depuis, p = {}) => {
        if (!p.filtre) return coupRecu(o, calque, pion, depuis, { valeur: p.valeur, couleur: p.couleur, force: p.force, son: p.son });
        const P = centre(pion, calque), D = centre(depuis, calque), recul = axe(D, P);
        if (p.valeur) o.jauge(calque, pion, 40, Math.max(2, 40 - Math.abs(parseInt(p.valeur, 10) || 8)), 40, p.valeur, p.couleur || COULEURS.degats, p.couleur || COULEURS.degats);
        return Promise.all([o.secouer(pion, P.t * (p.force || 0.12), 360, recul), o.eclat(pion, p.filtre, 460)]);
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
        soin: "radial-gradient(circle, rgba(220,255,225,0.85), rgba(110,230,140,0.6) 50%, rgba(30,120,60,0.45) 88%)",
        neutre: "radial-gradient(circle, rgba(150,150,158,0.5), rgba(95,92,96,0.45) 55%, rgba(50,46,48,0.4) 88%)"
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
        await o.parcourir(el, depart, pts, { duree: p.duree || 380, hauteur: p.hauteur, tangue: p.tangue, rythme: p.rythme, easing: p.easing, saut: p.saut,
            apresPas: (pt, i) => { if (p.son) o.son(p.son); if (p.pas) p.pas(pt, i, pts); } });
        if (p.apres) await p.apres(pts);
        await o.attendre(p.pause === undefined ? 250 : p.pause);
        // En vraies conditions, le pion RESTE sur sa nouvelle case (o.arriver) ;
        // `revenir` : une démonstration qui le ramène chez lui.
        if (p.revenir) await o.rentrer(el);
        else await o.arriver(el, pts[pts.length - 1]);
        return pts;
    };

    // S'EFFACER EN FONDU, sans toucher à la pose : une flèche plantée, un pic de
    // glace gardent leur angle jusqu'au bout.
    const fondre = async (o, el, duree) => {
        if (!el) return;
        await o.teinter(el, [{ opacity: 1 }, { opacity: 0 }], { duration: duree || 400, fill: "forwards" });
        el.remove();
    };
    // LA FLÈCHE, vue de dessus, la pointe vers la droite (Nico : « revois le
    // dessin de l'empennage, plume de la flèche, et baisse un peu l'épaisseur du
    // bois ») : l'encoche, deux plumes barbées (crème, liseré rouge), un fût
    // fin, la ligature, une pointe d'acier. 140 × 20 : la boîte fait 7 pour 1.
    const DESSIN_FLECHE = `<svg viewBox="0 0 140 20" width="100%" height="100%" preserveAspectRatio="none" style="display:block; overflow:visible; filter:drop-shadow(0 1px 1px rgba(0,0,0,.6))">
        <path d="M0 6.6 L 5 8 L 5 12 L 0 13.4 L 1.8 10 Z" fill="#2f2318"/>
        <path d="M5 8 L 9.5 1 Q 22 -0.4 35 5.4 L 39 8 Z" fill="#efe6d2" stroke="#a8977a" stroke-width="0.5" stroke-linejoin="round"/>
        <path d="M5 12 L 9.5 19 Q 22 20.4 35 14.6 L 39 12 Z" fill="#efe6d2" stroke="#a8977a" stroke-width="0.5" stroke-linejoin="round"/>
        <path d="M9 8 L 12 1.4 L 16.5 0.9 L 15 8 Z M9 12 L 12 18.6 L 16.5 19.1 L 15 12 Z" fill="#b3261e"/>
        <path d="M14 8 L 11.5 2.2 M19 8 L 17 1.4 M24 8 L 22.5 1.6 M29 8 L 28 3 M34 8 L 33.4 5.4
                 M14 12 L 11.5 17.8 M19 12 L 17 18.6 M24 12 L 22.5 18.4 M29 12 L 28 17 M34 12 L 33.4 14.6" stroke="#9c8b6e" stroke-width="0.45" fill="none"/>
        <rect class="fleche-fut" x="4" y="7.5" width="114" height="5" rx="2.5" fill="#86602f"/>
        <rect x="4" y="8" width="114" height="1.1" fill="#b98d55" opacity="0.8"/>
        <rect x="111" y="7.2" width="6" height="5.6" rx="1" fill="#3d2b1c"/>
        <path d="M116 4 L 140 10 L 116 16 L 120 10 Z" fill="#c9d1d8" stroke="#59636c" stroke-width="0.7" stroke-linejoin="round"/>
        <path d="M120 10 L 139 10" stroke="#ffffff" stroke-width="0.8" opacity="0.85"/></svg>`;
    // UNE FLÈCHE PLANTÉE dans un pion : la pointe enfoncée (cachée dans la chair),
    // le fût et l'empennage dehors, dans l'axe du tir. Elle vibre autour de son
    // point d'entrée et GARDE SON ANGLE jusqu'au bout (Nico : « une fois plantée,
    // à la toute fin la flèche bouge et se met à 90° : fais-lui garder son
    // angle »). `longueur` : celle de la flèche en vol, pour qu'elle ne change
    // pas de taille en se plantant.
    const flechePlantee = (o, calque, pos, v, p = {}) => {
        const L = p.longueur || pos.t * 0.9, h = L / 7, dehors = 0.84;
        // Le point d'entrée : là où était la ligature quand la pointe a touché.
        const x = pos.x + v.ux * (pos.t * 0.05 - L * 0.16), y = pos.y + v.uy * (pos.t * 0.05 - L * 0.16);
        const el = o.poser(calque, x, y, `width:0; height:0; z-index:${Z.haut};`,
            `<div class="anim-fleche-plantee" style="position:absolute; right:0; top:${-h / 2}px; width:${L * dehors}px; height:${h}px; overflow:hidden;
                  transform-origin:100% 50%; transform:rotate(${deg(v.angle)}deg);"><div style="width:${100 / dehors}%; height:100%">${DESSIN_FLECHE}</div></div>`);
        return { el, fut: el.querySelector(".anim-fleche-plantee") };
    };
    // LA BOULE DE FEU (Nico : « une boule de feu plus réaliste ») : un cœur
    // blanc-jaune qui palpite, un halo orangé, des langues qui tournent, une
    // queue de flammes qui traîne derrière (style.css, .anim-boule-feu).
    const DESSIN_BOULE_DE_FEU = `<span class="anim-boule-feu"><span class="bf-queue"></span><span class="bf-halo"></span><span class="bf-langues"></span><span class="bf-coeur"></span></span>`;
    // UNE GERBE DE FEU sur un pion (« à l'impact, une gerbe de feu sur la
    // cible ») : des langues de flamme jaillissent tout autour et s'élancent,
    // des braises volent, un éclair de chaleur au cœur.
    const LANGUE_DE_FEU = `<svg viewBox="0 0 100 40" width="100%" height="100%" preserveAspectRatio="none" style="display:block; overflow:visible">
        <path d="M0 20 C 18 3, 52 6, 100 20 C 62 26, 70 34, 44 36 C 26 37, 12 31, 0 20 Z" fill="#e8420c" opacity="0.85"/>
        <path d="M0 20 C 14 9, 40 10, 78 20 C 44 28, 22 29, 0 20 Z" fill="#ff9a1f"/>
        <path d="M0 20 C 10 14, 26 15, 48 20 C 26 25, 10 25, 0 20 Z" fill="#fff1b8"/></svg>`;
    const gerbeDeFeu = (o, calque, pos, p = {}) => {
        const n = p.n || 7, L = pos.t * (p.taille || 0.95), H = L * 0.42;
        const langues = Array.from({ length: n }, (_, i) => {
            const ang = (i / n) * 360 + hasard(-18, 18), s = hasard(0.85, 1.15);
            const d = o.poser(calque, pos.x, pos.y, `width:${L * s}px; height:${H * s}px; z-index:${Z.haut}; transform-origin:0 50%;
                transform:translate(0,-50%) rotate(${ang}deg) scale(0.15, 0.4); opacity:0; filter:drop-shadow(0 0 6px #ff7a1a);`, LANGUE_DE_FEU);
            d.classList.add("anim-langue-feu");
            return o.jouerPuisRetirer(d, [
                { transform: `translate(0,-50%) rotate(${ang}deg) translateX(${-pos.t * 0.1}px) scale(0.15, 0.4)`, opacity: 0 },
                { transform: `translate(0,-50%) rotate(${ang}deg) translateX(${pos.t * 0.02}px) scale(1, 1)`, opacity: 1, offset: 0.3 },
                { transform: `translate(0,-50%) rotate(${ang + hasard(-12, 12)}deg) translateX(${pos.t * 0.25}px) scale(1.15, 0.55)`, opacity: 0 }
            ], { duration: p.duree || 680, delay: i * 22, easing: "cubic-bezier(.2,.8,.3,1)" });
        });
        return Promise.all([...langues,
            o.onde(calque, pos, { couleur: "#ff7a1a", taille: 0.9, bord: 2, duree: 520, echelle: 2.1,
                                  fond: "radial-gradient(circle, rgba(255,246,200,0.95), rgba(255,140,30,0.6) 55%, rgba(255,60,0,0) 75%)" }),
            o.gerbe(calque, pos.x, pos.y, { nombre: 16, dist: pos.t * 1.15, couleurs: ["#ffcf5a", "#ff7a1a", "#e8420c"], taille: 6, tailleMin: 2, duree: 850 }),
            o.gerbe(calque, pos.x, pos.y, { nombre: 8, dist: pos.t * 0.4, monte: pos.t * 0.7, couleurs: ["#fff1b8", "#ffb02e"], taille: 4, tailleMin: 2, duree: 1000, etale: 250 })]);
    };
    // UN PIC DE CRISTAL GELÉ, la pointe vers la droite : deux faces (l'une
    // éclairée, l'autre dans l'ombre), une arête blanche, une lueur de givre.
    const DESSIN_PIC_DE_GLACE = `<svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none" style="display:block; overflow:visible; filter:drop-shadow(0 0 4px #bdf3ff) drop-shadow(0 0 1px #3aa8e8)">
        <polygon points="0,15 14,6 62,9 100,15" fill="#f2fdff"/>
        <polygon points="0,15 14,24 62,21 100,15" fill="#8fd3f2"/>
        <polygon points="0,15 14,6 62,9 100,15 62,21 14,24" fill="none" stroke="#5fb4e0" stroke-width="1"/>
        <path d="M14 6 L 30 15 L 14 24 M62 9 L 48 15 L 62 21" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.8"/>
        <path d="M4 15 L 96 15" stroke="#ffffff" stroke-width="1.1" opacity="0.9"/></svg>`;
    // LE MESSAGE DU COUP CRITIQUE (Nico : « un message en rouge qui spawn, pour
    // changer, sous le token, avec un joli effet ») : « COUP CRITIQUE ! » tombe
    // sous le pion de très haut (énorme et flou), claque à sa taille, un trait
    // rouge le souligne d'un coup de lame, des étincelles giclent ; puis il
    // glisse vers le bas et s'efface. Ensuite vient l'attaque, normale.
    const messageCritique = (o, calque, pion, p = {}) => {
        const c = centre(pion, calque);
        const taille = Math.max(16, Math.round(c.t * 0.4));
        const y = c.y + c.t * 0.78;
        const m = o.poser(calque, c.x, y, `z-index:${Z.ciel}; white-space:nowrap; font-family:'Cinzel', Georgia, serif; font-weight:900; font-size:${taille}px;
            letter-spacing:0.06em; color:#ff2a2a; opacity:0; text-shadow:0 0 2px #000, 0 0 3px #000, 2px 2px 0 #4a0000, 0 0 10px #ff1a1a, 0 0 20px #c00000;`, p.texte || "COUP CRITIQUE !");
        m.classList.add("anim-message-critique");
        const trait = o.poser(calque, c.x, y + taille * 0.72, `width:${c.t * 2.3}px; height:3px; z-index:${Z.ciel}; border-radius:2px; opacity:0;
            background:linear-gradient(90deg, rgba(255,40,40,0), #ff3030 20%, #ffd0d0 50%, #ff3030 80%, rgba(255,40,40,0)); box-shadow:0 0 8px #ff2020;`);
        o.jouerPuisRetirer(trait, [{ transform: `${BASE} scaleX(0)`, opacity: 1 }, { transform: `${BASE} scaleX(1)`, opacity: 1, offset: 0.35 },
                                   { transform: `${BASE} scaleX(1.05)`, opacity: 0 }], { duration: 560, delay: 170, easing: "ease-out" });
        o.attendre(170).then(() => o.gerbe(calque, c.x, y, { nombre: 12, dist: c.t, couleurs: ["#ff3030", "#ffb0a0", "#ffd700"], taille: 4, tailleMin: 2, duree: 650 }));
        o.onde(calque, { x: c.x, y, t: c.t }, { couleur: "#ff3030", taille: 1.6, aplati: 0.32, duree: 600, echelle: 1.6, retard: 150, bord: 2 });
        return o.jouerPuisRetirer(m, [
            { transform: `${BASE} scale(2.6)`, opacity: 0, filter: "blur(6px)" },
            { transform: `${BASE} scale(0.9)`, opacity: 1, filter: "blur(0px)", offset: 0.12 },
            { transform: `${BASE} scale(1.08)`, opacity: 1, filter: "blur(0px)", offset: 0.19 },
            { transform: `${BASE} scale(1)`, opacity: 1, filter: "blur(0px)", offset: 0.26 },
            { transform: `${BASE} scale(1)`, opacity: 1, filter: "blur(0px)", offset: 0.8 },
            { transform: `translate(-50%, calc(-50% + ${c.t * 0.22}px)) scale(0.96)`, opacity: 0, filter: "blur(2px)" }
        ], { duration: p.duree || 1700, easing: "ease-out" });
    };
    // QUELQUES CRISTAUX DE GIVRE au sol, sous le pion (la marche gelée) : ils
    // poussent d'un coup puis fondent, en couronne — assez loin du centre pour
    // dépasser du pion qui les recouvre.
    const cristaux = (o, calque, pt, p = {}) => {
        const t = pt.t * (p.taille || 1.6);
        const n = p.n || 7;
        const formes = Array.from({ length: n }, (_, i) => {
            const ang = (i / n) * Math.PI * 2 + hasard(-0.4, 0.4), d = hasard(30, 46);
            const x = 50 + Math.cos(ang) * d, y = 50 + Math.sin(ang) * d * 0.8, L = hasard(8, 14), rot = hasard(0, 180);
            return `<polygon points="0,${-L} ${L * 0.34},0 0,${L} ${-L * 0.34},0" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(0)})"
                       fill="rgba(235,250,255,0.95)" stroke="#7fcfff" stroke-width="1.2"/>`;
        }).join("");
        const d = o.poser(calque, pt.x, pt.y + pt.t * 0.08, `width:${t}px; height:${t}px; z-index:${Z.sol};`,
            `<svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible; filter:drop-shadow(0 0 3px #bdf3ff)">${formes}</svg>`);
        d.classList.add("anim-cristaux");
        return o.jouerPuisRetirer(d, [{ opacity: 0, transform: `${BASE} scale(0.5)` }, { opacity: 1, transform: `${BASE} scale(1)`, offset: 0.2 },
                                      { opacity: 1, transform: `${BASE} scale(1)`, offset: 0.65 }, { opacity: 0, transform: `${BASE} scale(1.05)` }],
                                  { duration: p.duree || 1100, easing: "ease-out" });
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
    // DES GRAVATS QUI RESTENT (sc.terrain) : l'éboulis procédural (v247), qui
    // gagne les cases depuis `depuis` ; sinon les tas du jeu, posés en cascade.
    // `tas[0]` : où dire « Gravats ».
    const tasDeGravats = (o, sc, pts, p = {}) => {
        const arrivee = sc.terrain && typeof sc.terrain.etendreGravats === "function" && pts.length && pts.every(pt => pt.q !== undefined)
            ? sc.terrain.etendreGravats(pts.map(pt => ({ q: pt.q, r: pt.r })), { depuis: p.depuis, duree: p.duree }) : null;
        if (arrivee) {
            const pt = p.depuis || pts[0];
            return { tas: [o.poser(sc.calque, pt.x, pt.y, "width:1px; height:1px; opacity:0;", "")], restent: true, arrivee };
        }
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
            description: "Le pion avance d'hexagone en hexagone par petits sauts ; à chaque case, un pas sur l'herbe et la terre, un peu de poussière et l'énergie dépensée.",
            async jouer(sc, o) {
                await marcher(sc, o, { cases: 3, duree: 420, saut: true, son: "pas-herbe",
                    pas: (pt) => { poussiere(o, sc.calque, pt, { n: 4 }); o.texte(sc.calque, sc.lanceur, "-1 ⚡", COULEURS.attention, { taille: 15 }); } });
            }
        },
        {
            id: "marche-difficile", nom: "Marche en terrain difficile", sens: "sur soi",
            description: "La marche, par petits sauts, mais plus lente et plus lourde : chaque pas pèse, un peu de poussière ; chaque case coûte double.",
            async jouer(sc, o) {
                await marcher(sc, o, { cases: 2, duree: 700, saut: true, hauteur: 1.1, son: "pas-lourd",
                    pas: (pt) => { poussiere(o, sc.calque, pt, { n: 5 }); o.texte(sc.calque, sc.lanceur, "-2 ⚡", COULEURS.attention, { taille: 15 }); } });
            }
        },
        {
            id: "marche-gelee", nom: "Marche gelée (Glacé)", sens: "sur soi",
            description: "La marche, par petits sauts, sans rien sur le pion ; dessous, à chaque pas, quelques cristaux de givre poussent puis fondent, et la glace craque ; chaque case coûte double.",
            async jouer(sc, o) {
                etat(o, sc.calque, sc.lanceur, "Glacé : marche ×2");
                await marcher(sc, o, { cases: 2, duree: 420, saut: true, son: "pas-glace",
                    pas: (pt) => {
                        cristaux(o, sc.calque, pt);
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
                        o.son("decharge"); o.eclat(sc.lanceur, ELEC, 500);
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
            description: "Deux coups vifs, à peine le temps de les voir : deux entailles fines, effilées, qui se croisent ; la chair entaillée, le sang, et les dégâts au second coup.",
            async jouer(sc, o) {
                const elan = { portee: 0.45, duree: 300, prise: 0.25, frappe: 0.55 };
                // Les dégâts une seule fois, au second coup (Nico).
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { elan, contact: 165, sonElan: "dague", retardSon: 40,
                                                                   entaille: { taille: 1.1, epaisseur: 5, duree: 260 } });
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8", elan, contact: 165, sonElan: "dague", retardSon: 40,
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
                // Le choc sourd du coup, puis la chair entaillée (plus de « ding »).
                o.son("lourd-impact");
                await Promise.all([elan, entaille(o, sc.calque, b, v.angle, { taille: 2.1, epaisseur: 11, duree: 460 }),
                    o.onde(sc.calque, b, { couleur: "#c8a878", taille: 1.1, duree: 650, echelle: 2.1, bord: 5 }),
                    coupRecu(o, sc.calque, sc.cible, a, { valeur: "-18", force: 0.22, n: 12 })]);
            }
        },
        {
            id: "attaque-distance", nom: "Attaque à distance (tir)", sens: "vers l'ennemi",
            description: "Le héros bande son arc (la corde se tend), la flèche file en sifflant et se plante dans la chair de l'ennemi ; elle y vibre, garde son angle, puis s'efface.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                // La corde qui se tend, pendant que le héros recule d'un rien.
                o.son("arc-tendu");
                await o.bouger(sc.lanceur, [{ transform: "translate(0,0)" }, { transform: `translate(${-v.ux * 4}px, ${-v.uy * 4}px) scale(0.97)` }],
                               { duration: 380, fill: "forwards" });
                o.son("tir");
                o.lacher(sc.lanceur);
                // Elle vole droit, la pointe devant, jusqu'à toucher l'ennemi.
                const L = a.t * 0.9;
                const fin = { x: b.x + v.ux * (b.t * 0.05 - L / 2), y: b.y + v.uy * (b.t * 0.05 - L / 2), t: b.t };
                await o.projectile(sc.calque, a, fin, { taille: 0.9, arc: 0.06, oriente: true, easing: "linear", duree: Math.min(520, 200 + v.d * 0.5), forme: "0",
                    contenu: DESSIN_FLECHE, style: "height:auto; aspect-ratio:7/1; background:none;" });
                // Plantée : le bruit de la chair, le coup reçu ; elle vibre et garde son angle.
                const fleche = flechePlantee(o, sc.calque, b, v, { longueur: L });
                await Promise.all([coupRecu(o, sc.calque, sc.cible, a, { son: "fleche-impact", valeur: "-9", force: 0.08, n: 6 }),
                    o.teinter(fleche.fut, [0, 7, -5, 3, -1.5, 0].map(k => ({ transform: `rotate(${deg(v.angle) + k}deg)` })), { duration: 560, easing: "ease-out" })]);
                await o.attendre(350);
                await fondre(o, fleche.el, 380);
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
                // Le seul son de l'électricité (Nico : « garde juste le son de
                // l'électricité, pas de son quand la cible reçoit les dégâts »).
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
            description: "Des pointes de cristal gelé naissent en suspension devant le héros, se tournent vers l'ennemi, puis filent une à une, très vite, se planter en lui ; il blanchit de froid.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const n = 5, R = a.t * 0.82, L = a.t * 0.52, H = L * 0.3;
                o.son("glace-formation");
                const pics = Array.from({ length: n }, (_, i) => {
                    const k = i - (n - 1) / 2, ang = deg(v.angle + k * 0.42);
                    const pos = { x: a.x + Math.cos(v.angle + k * 0.42) * R, y: a.y + Math.sin(v.angle + k * 0.42) * R };
                    // Où il se plantera : en éventail serré sur l'ennemi.
                    const vise = { x: b.x - v.uy * k * b.t * 0.1, y: b.y + v.ux * k * b.t * 0.1 };
                    const u = axe(pos, vise);
                    const fin = { x: vise.x - u.ux * L * 0.3, y: vise.y - u.uy * L * 0.3 };
                    // L'angle visé, pris du côté le plus court (pas de tour complet).
                    const vers = ang + ((deg(u.angle) - ang + 540) % 360) - 180;
                    const el = o.poser(sc.calque, pos.x, pos.y, `width:${L}px; height:${H}px; z-index:${Z.ciel}; opacity:0;
                        transform:${BASE} rotate(${ang}deg) scale(0);`, DESSIN_PIC_DE_GLACE);
                    el.classList.add("anim-pic-glace");
                    return { el, pos, fin, ang, vers, u };
                });
                const pose = (pc, angle, s, dx = 0, dy = 0) => `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}deg) scale(${s})`;
                // Ils naissent l'un après l'autre et flottent, pointés vers l'extérieur…
                pics.forEach((pc, i) => o.teinter(pc.el, [{ transform: pose(pc, pc.ang, 0), opacity: 0 }, { transform: pose(pc, pc.ang, 1.15), opacity: 1, offset: 0.5 },
                                                          { transform: pose(pc, pc.ang, 1), opacity: 1 }], { duration: 300, delay: i * 70, easing: "ease-out", fill: "forwards" }));
                await o.attendre(300 + (n - 1) * 70);
                // …en suspension (vus d'en haut, ils respirent)…
                await Promise.all(pics.map((pc, i) => o.teinter(pc.el, [{ transform: pose(pc, pc.ang, 1) }, { transform: pose(pc, pc.ang, 1.07), offset: 0.5 },
                                                                        { transform: pose(pc, pc.ang, 1) }], { duration: 380, delay: i * 30 })));
                // …puis se tournent vers l'ennemi.
                await Promise.all(pics.map(pc => o.teinter(pc.el, [{ transform: pose(pc, pc.ang, 1), opacity: 1 }, { transform: pose(pc, pc.vers, 1), opacity: 1 }],
                                                           { duration: 240, easing: "ease-in-out", fill: "forwards" })));
                await o.attendre(120);
                // L'un après l'autre, très vite, ils filent se planter.
                await Promise.all(pics.map((pc, i) => o.attendre(i * 110).then(async () => {
                    o.son("glace-tir");
                    await o.teinter(pc.el, [{ transform: pose(pc, pc.vers, 1), opacity: 1 },
                                            { transform: pose(pc, pc.vers, 0.9, pc.fin.x - pc.pos.x, pc.fin.y - pc.pos.y), opacity: 1 }],
                                    { duration: 140, easing: "cubic-bezier(.5,0,1,1)", fill: "forwards" });
                    o.son("glace-plante");
                    o.gerbe(sc.calque, pc.fin.x + pc.u.ux * L * 0.4, pc.fin.y + pc.u.uy * L * 0.4, { nombre: 5, dist: b.t * 0.35, angle: pc.u.angle + Math.PI, eventail: Math.PI * 0.8,
                                                                                         couleurs: ["#ffffff", "#bdf3ff", "#7fcfff"], taille: 4, tailleMin: 2, carre: true, duree: 420 });
                    o.secouer(sc.cible, b.t * 0.05, 160, pc.u);
                })));
                o.jauge(sc.calque, sc.cible, 40, 31, 40, "-9", COULEURS.degats, COULEURS.degats);
                await Promise.all([o.teinter(sc.cible, [{ filter: "none" }, { filter: GIVRE, offset: 0.3 }, { filter: GIVRE, offset: 0.8 }, { filter: "none" }], { duration: 1000 }),
                    o.onde(sc.calque, b, { couleur: "#bdf3ff", taille: 1, duree: 650, echelle: 1.6 })]);
                await Promise.all(pics.map(pc => fondre(o, pc.el, 350)));
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
            // Renommée Distorsion mentale (v240) ; l'identifiant reste, pour
            // garder la case « intégrée » que le MJ a cochée.
            id: "mots-de-pouvoir", nom: "Distorsion mentale", sens: "vers l'ennemi",
            description: "Des ondes psychiques violet clair roulent vers l'ennemi et déforment la carte sous elles ; touché, l'ennemi se tord sur lui-même puis redevient normal. Dégâts bruts.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("mots");
                o.eclat(sc.lanceur, `brightness(1.15) drop-shadow(0 0 9px ${VIOLET_DISTORSION})`, 700);
                const ondes = ondesPsychiques(o, sc, a, b);
                await o.attendre(ondes.arrivee);
                o.jauge(sc.calque, sc.cible, 40, 30, 40, "-10", VIOLET_DISTORSION, "#e6e6e6");
                await Promise.all([ondes.fin, tordreCible(o, sc.cible), o.eclat(sc.cible, `drop-shadow(0 0 8px ${VIOLET_DISTORSION})`, 600)]);
                o.texte(sc.calque, sc.cible, "Dégâts bruts", COULEURS.neutre);
                await o.attendre(300);
            }
        },
        {
            id: "lumiere-forge", nom: "Lumière (effet de la Forge)", sens: "vers l'ennemi",
            description: "Un arc de lumière s'ouvre devant le héros ; le rayon en part, large, et s'amincit jusqu'à l'ennemi qu'il perce : l'ennemi clignote une fois d'un jaune léger, sa résistance magique est percée.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const rot = deg(v.angle), R = a.t * 0.62;
                o.son("lumiere");
                o.eclat(sc.lanceur, "brightness(1.25) drop-shadow(0 0 8px #ffe680)", 700);
                // L'arc de cercle devant le héros (± 58°), qui s'ouvre depuis son milieu.
                const arc = o.poser(sc.calque, a.x, a.y, `width:${R * 2.4}px; height:${R * 2.4}px; z-index:${Z.haut}; opacity:0; transform:${BASE} rotate(${rot}deg);`,
                    `<svg viewBox="-60 -60 120 120" width="100%" height="100%" style="overflow:visible; filter:drop-shadow(0 0 4px #ffd700) drop-shadow(0 0 10px #ffb800)">
                       <path d="M26.5 -42.4 A 50 50 0 0 1 26.5 42.4" fill="none" stroke="#fff6c8" stroke-width="5" stroke-linecap="round"/></svg>`);
                arc.classList.add("anim-arc-lumiere");
                await o.teinter(arc, [{ transform: `${BASE} rotate(${rot}deg) scale(0.6, 0)`, opacity: 0 }, { transform: `${BASE} rotate(${rot}deg) scale(1, 1)`, opacity: 1 }],
                                { duration: 260, easing: "ease-out", fill: "forwards" });
                // Le rayon part de l'arc : large à sa corde, il s'amincit jusqu'à sa
                // pointe, sur l'ennemi (un cœur blanc dans un trait doré).
                const corde = R * 0.848 * 2;
                const S = { x: a.x + v.ux * R * 0.53, y: a.y + v.uy * R * 0.53 };
                const L = Math.max(10, Math.hypot(b.x - S.x, b.y - S.y));
                const rayon = o.poser(sc.calque, S.x, S.y, `width:${L}px; height:${corde}px; z-index:${Z.haut}; transform-origin:0 50%;
                    transform:translate(0,-50%) rotate(${rot}deg) scaleX(0); filter:drop-shadow(0 0 5px #ffd700) drop-shadow(0 0 12px #ffb800);`,
                    `<div style="position:absolute; inset:0; clip-path:polygon(0 0, 100% 48%, 100% 52%, 0 100%);
                          background:linear-gradient(90deg, rgba(255,226,120,0.5), rgba(255,240,170,0.9));"></div>
                     <div style="position:absolute; inset:0; clip-path:polygon(0 34%, 100% 49.4%, 100% 50.6%, 0 66%);
                          background:linear-gradient(90deg, rgba(255,255,240,0.8), #ffffff);"></div>`);
                rayon.classList.add("anim-rayon-lumiere");
                const trace = (sx) => `translate(0,-50%) rotate(${rot}deg) scaleX(${sx})`;
                const trait = o.teinter(rayon, [{ transform: trace(0), opacity: 1 }, { transform: trace(1), opacity: 1, offset: 0.28 },
                                                 { transform: trace(1), opacity: 0.9, offset: 0.7 }, { transform: trace(1), opacity: 0 }],
                                        { duration: 900, easing: "ease-out", fill: "forwards" });
                await o.attendre(250);
                // Touchée, la cible clignote UNE fois d'un jaune léger (plus de cercle
                // jaune autour d'elle, ni de flash rouge : la barre seulement).
                o.jauge(sc.calque, sc.cible, 40, 30, 40, "-10", COULEURS.degats, COULEURS.degats, { sansEclat: true });
                o.attendre(420).then(() => o.texte(sc.calque, sc.cible, "Résistance percée", "#ffd700"));
                await Promise.all([trait, o.teinter(sc.cible, [{ filter: "none" }, { filter: JAUNE_LEGER, offset: 0.45 }, { filter: "none" }], { duration: 520 }),
                    o.teinter(arc, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 650, fill: "forwards" })]);
                arc.remove();
                rayon.remove();
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
            description: "Un mur de terre barre la route : l'ennemi le frappe à grands coups, des éclats de roche volent, le mur tremble.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                const pos = o.voisine(sc.cible, b, o.tourner(v, Math.PI / 2));
                const mur = o.mur(sc.calque, pos, { sansApparition: true });
                for (let k = 0; k < 2; k++) {
                    const elan = o.elan(sc.cible, b, pos, { portee: 0.5, duree: 420 });
                    await o.attendre(240);
                    o.son("pioche");
                    o.gerbe(sc.calque, pos.x, pos.y, { nombre: 9, dist: pos.t * 0.8, couleurs: ["#a08868", "#6e5a40"], taille: 6, carre: true, duree: 600 });
                    o.secouer(mur, 4, 260);
                    await elan;
                }
                o.texte(sc.calque, mur, "-1", COULEURS.attention);
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
            description: "Une lame venue de l'ennemi : deux entailles effilées se croisent sur le héros, qui recule, s'empourpre et saigne de son flanc ; la chair entaillée.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                const v = axe(b, a);
                o.son("lame-souffle");
                await Promise.all([entaille(o, sc.calque, a, v.angle, { taille: 1.3 }), entaille(o, sc.calque, a, v.angle, { taille: 1.3, tourne: 90, retard: 80 }),
                    coupRecu(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-8" })]);
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
                o.texte(sc.calque, sc.lanceur, "🔥 Résiste au feu : -15 %", COULEURS.attention);
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
            id: "etat-resiste", nom: "État raté ou résisté (résistance)", sens: "sur soi",
            description: "Une fiole de venin vole vers le héros ; un sceau doré s'allume, la fiole éclate en fumée grise sans effet.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("poison-lancer");
                await sortEnnemi(o, sc, { couleur: "#7dd321", coeur: "#e8ffc0", taille: 0.28, arc: 0.7 });
                o.son("resiste");
                const s = sceau(o, sc.calque, a, "#ffd700", { duree: 1200 });
                o.texte(sc.calque, sc.lanceur, "🛡️ Résisté ! (−25 %)", "#ffd700");
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
                await frapper(o, sc.calque, sc.cible, f, { sonImpact: "bris-verre", sang: false });
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
        // Sur le pion seul : en jeu, une bénédiction n'a pas d'ennemi en face.
        const a = centre(sc.lanceur, sc.calque);
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
    // UNE GLISSADE FLUIDE (Nico : « fais qu'elle soit fluide, sans saccade ») :
    // le pion file d'un seul trait le long de ses cases — une seule animation,
    // sans rebond ni arrêt à chaque case — en ralentissant (`courbe`) ; il
    // reste là où il arrive (fill), jusqu'à o.arriver. `trainee(point, k)` :
    // ce qu'il sème derrière lui, à mesure qu'il passe. `depuis` : d'où il
    // part, s'il n'est pas chez lui.
    const ralentir = (t) => 1 - Math.pow(1 - t, 3);
    const accelerer = (t) => t * t * (1.6 - 0.6 * t);
    const glisser = async (o, el, origine, pts, p = {}) => {
        const depart = p.depuis ? { x: p.depuis.x - origine.x, y: p.depuis.y - origine.y } : { x: 0, y: 0 };
        const sommets = [depart, ...pts.map(pt => ({ x: pt.x - origine.x, y: pt.y - origine.y }))];
        const cumul = [0];
        for (let i = 1; i < sommets.length; i++) cumul.push(cumul[i - 1] + Math.hypot(sommets[i].x - sommets[i - 1].x, sommets[i].y - sommets[i - 1].y));
        const L = cumul[cumul.length - 1] || 1;
        // Le point à la fraction `f` du trajet (en longueur parcourue).
        const ou = (f) => {
            const d = Math.max(0, Math.min(1, f)) * L;
            let i = 1;
            while (i < cumul.length - 1 && cumul[i] < d) i++;
            const k = (d - cumul[i - 1]) / ((cumul[i] - cumul[i - 1]) || 1);
            return { x: sommets[i - 1].x + (sommets[i].x - sommets[i - 1].x) * k, y: sommets[i - 1].y + (sommets[i].y - sommets[i - 1].y) * k };
        };
        const courbe = p.courbe || ralentir, duree = p.duree || 700, N = 32;
        const images = [];
        for (let k = 0; k <= N; k++) {
            const q = ou(courbe(k / N));
            images.push({ transform: `translate(${q.x.toFixed(2)}px, ${q.y.toFixed(2)}px)`, offset: k / N });
        }
        const semis = [];
        if (p.trainee && sommets.length > 1) {
            const n = p.bouffees || Math.max(4, Math.round(L / ((origine.t || 60) * 0.32)));
            for (let k = 0; k < n; k++) {
                const t = (k + 0.4) / n, q = ou(courbe(t));
                semis.push(o.attendre(duree * t).then(() => p.trainee({ x: origine.x + q.x, y: origine.y + q.y, t: origine.t }, k)));
            }
        }
        await o.bouger(el, images, { duration: duree, easing: "linear", fill: "forwards" });
        return semis;
    };
    // LA TRAÎNÉE DE POUSSIÈRE d'une glissade (Nico : « que ça laisse sur le
    // passage comme un nuage de poussière qui disparaît en fondu ») : de
    // petites bouffées sous le pion, qui gonflent sur place et s'effacent.
    const traineePoussiere = (o, calque, pt) => o.nuagePoussiere(calque, pt, { nombre: 4, etendue: 0.38, taille: 0.62, pied: 0.22,
                                                                           duree: 1350, etale: 80, opacite: 0.8, z: Z.bas });
    // UN COUP D'AIR (la Traction magique) : des filets de vent pâles qui
    // naissent derrière la cible et filent vers le héros, en ondulant.
    const filetsDAir = (o, calque, de, vers, p = {}) => {
        const v = axe(de, vers), t = de.t || 60, n = p.n || 9, fins = [];
        for (let i = 0; i < n; i++) {
            const lat = hasard(-0.55, 0.55) * t, recul = hasard(0.1, 0.7) * t;
            const x0 = de.x - v.ux * recul - v.uy * lat, y0 = de.y - v.uy * recul + v.ux * lat;
            const L = t * hasard(0.55, 1.0), course = v.d + recul - t * 0.35;
            const d = o.poser(calque, x0, y0, `width:${L}px; height:${t * 0.2}px; z-index:${Z.haut}; transform-origin:0 50%; opacity:0;`,
                `<svg viewBox="0 0 100 20" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block">
                   <path d="M0 10 C 25 ${hasard(2, 6).toFixed(1)}, 55 ${hasard(14, 18).toFixed(1)}, 100 10" fill="none" stroke="rgba(235,248,255,0.9)"
                     stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 3px rgba(190,225,255,0.9))"/></svg>`);
            d.classList.add("anim-filet-air");
            const pose = (k, sx) => `translate(${(v.ux * course * k).toFixed(1)}px, calc(-50% + ${(v.uy * course * k).toFixed(1)}px)) rotate(${deg(v.angle) + 180}deg) scaleX(${sx})`;
            fins.push(o.jouerPuisRetirer(d, [
                { transform: pose(0, 0.3), opacity: 0 },
                { transform: pose(0.25, 1), opacity: 0.95, offset: 0.25 },
                { transform: pose(0.8, 1.15), opacity: 0.7, offset: 0.8 },
                { transform: pose(1, 0.4), opacity: 0 }
            ], { duration: (p.duree || 620) * hasard(0.85, 1.15), delay: (p.retard || 0) + hasard(0, p.etale || 420), easing: "ease-in" }));
        }
        return Promise.all(fins);
    };
    // L'AIR AVALÉ par le héros : des anneaux pâles qui se resserrent sur lui.
    const aspiration = (o, calque, pos, p = {}) => Promise.all([0, 1, 2].map(k => {
        const t = (pos.t || 60) * 1.9;
        const d = o.poser(calque, pos.x, pos.y, `width:${t}px; height:${t}px; border-radius:50%; z-index:${Z.haut};
            border:2px solid rgba(230,245,255,0.75); box-shadow:0 0 10px rgba(190,225,255,0.8), inset 0 0 8px rgba(190,225,255,0.6);`);
        return o.jouerPuisRetirer(d, [{ transform: `${BASE} scale(1) rotate(0deg)`, opacity: 0 },
                                      { transform: `${BASE} scale(0.75) rotate(-60deg)`, opacity: 0.8, offset: 0.35 },
                                      { transform: `${BASE} scale(0.3) rotate(-160deg)`, opacity: 0 }],
                                  { duration: p.duree || 560, delay: (p.retard || 0) + k * 170, easing: "ease-in" });
    }));
    // TROIS TRAITS ROUGES DE FRAYEUR, serrés, sur le coin haut droit du pion.
    const traitsDeFrayeur = (o, calque, pos, p = {}) => {
        const t = pos.t || 60, h = t * 0.26, e = Math.max(2.5, t * 0.045);
        const d = o.poser(calque, pos.x + t * 0.38, pos.y - t * 0.36, `width:${e * 5.4}px; height:${h}px; z-index:${Z.ciel};`,
            [0, 1, 2].map(i => `<span class="trait-frayeur" style="position:absolute; left:${i * e * 2.2}px; top:${i === 1 ? -h * 0.12 : 0}px; width:${e}px; height:${h}px;
                border-radius:${e}px; background:linear-gradient(180deg, #ff5a4a, #c80f0f); box-shadow:0 0 4px rgba(255,40,30,0.8), 0 1px 1px #000;
                transform-origin:50% 100%;"></span>`).join(""));
        d.classList.add("anim-frayeur");
        d.querySelectorAll(".trait-frayeur").forEach((s, i) => o.teinter(s, [{ transform: "scaleY(0)" }, { transform: "scaleY(1.15)", offset: 0.6 }, { transform: "scaleY(1)" }],
                                                                          { duration: 220, delay: i * 70, easing: "ease-out", fill: "both" }));
        return o.jouerPuisRetirer(d, [{ opacity: 1, transform: `${BASE} translate(0,0)` }, { opacity: 1, transform: `${BASE} translate(1px,-1px)`, offset: 0.3 },
                                      { opacity: 1, transform: `${BASE} translate(-1px,1px)`, offset: 0.55 }, { opacity: 1, transform: `${BASE} translate(0,0)`, offset: 0.8 },
                                      { opacity: 0, transform: `${BASE} translate(0,-3px)` }], { duration: p.duree || 1000 });
    };
    // La Peur : la teinte du héros qui l'inspire (mauve foncé) et celle de qui la subit (un peu vert).
    // Le sépia d'abord, presque entier : sans lui, la couleur propre du pion tourne
    // avec la teinte (un pion bleu virait au vert au lieu du mauve).
    const MAUVE_SOMBRE = "sepia(0.9) saturate(1.8) hue-rotate(228deg) brightness(0.7)";
    const VERT_PEUR = "sepia(0.85) saturate(1.5) hue-rotate(58deg) brightness(0.98)";
    ajouter(5, null, [
        {
            id: "poussee", nom: "Poussée", sens: "vers l'ennemi",
            description: "Le héros donne une poussée d'épaule : l'ennemi file d'un trait, sans à-coups, sur deux cases en ligne droite, et laisse derrière lui un nuage de poussière qui s'efface en fondu.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                // Plus de coup d'épée (Nico : « enlève l'animation de coup
                // d'épée ») : un élan bref, l'onde de la poussée sur l'ennemi.
                const elan = o.elan(sc.lanceur, a, b, { portee: 0.45, duree: 460 });
                await o.attendre(250);
                o.son("poussee");
                o.onde(sc.calque, b, { couleur: "rgba(236,226,200,0.9)", taille: 0.9, echelle: 1.9, bord: 3, duree: 520 });
                o.texte(sc.calque, sc.cible, "Poussé !", COULEURS.etat);
                const pts = o.chemin(sc.cible, b, v, 2);
                const semis = await glisser(o, sc.cible, b, pts, { duree: 640, courbe: ralentir, trainee: (pt) => traineePoussiere(o, sc.calque, pt) });
                await elan;
                await o.arriver(sc.cible, pts[pts.length - 1]);
                // La poussière finit de retomber, en fondu.
                await Promise.all(semis);
            }
        },
        {
            id: "traction", nom: "Traction magique", sens: "vers l'ennemi",
            description: "Un coup d'air : des filets de vent pâles naissent derrière l'ennemi et filent vers le héros, qui avale l'air ; l'ennemi est aspiré d'un trait jusqu'à lui (jusqu'à 3 cases). Déjà au contact : la démonstration le pose loin, avec un second ennemi, puis les attire.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const ecart = o.distanceCases(sc.lanceur, sc.cible);
                const appel = (loin) => {
                    o.son("traction");
                    o.texte(sc.calque, sc.lanceur, "Traction !", COULEURS.etat);
                    o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(1.06)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 700 });
                    return Promise.all([aspiration(o, sc.calque, a, { duree: 600 }), filetsDAir(o, sc.calque, loin, a, { n: 10, duree: 640, etale: 520 })]);
                };
                if (ecart !== null && ecart > 1) {
                    // EN VRAIES CONDITIONS : l'ennemi est loin, il est aspiré jusqu'au contact (3 cases au plus).
                    const chemin = o.chemin(sc.cible, b, axe(b, a), Math.min(3, ecart - 1));
                    const arrivee = chemin[chemin.length - 1] || b;
                    const air = appel(b);
                    await o.attendre(260);
                    const semis = await glisser(o, sc.cible, b, chemin, { duree: 260 + 170 * chemin.length, courbe: accelerer,
                                                                          trainee: (pt) => traineePoussiere(o, sc.calque, pt) });
                    await o.arriver(sc.cible, arrivee);
                    await Promise.all([air, o.secouer(sc.cible, 3, 220, axe(arrivee, a)), ...semis]);
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
                const air = Promise.all([appel(loin), loin2 ? filetsDAir(o, sc.calque, loin2, a, { n: 7, duree: 640, etale: 520 }) : null]);
                await o.attendre(260);
                const retour = [...pts.slice(0, -1).reverse(), { x: b.x, y: b.y, t: b.t }];
                const [semis] = await Promise.all([
                    glisser(o, sc.cible, b, retour, { depuis: loin, duree: 260 + 170 * retour.length, courbe: accelerer,
                                                      trainee: (pt) => traineePoussiere(o, sc.calque, pt) }),
                    f ? glisser(o, f, loin2, [pres2], { duree: 260 + 170 * 2, courbe: accelerer,
                                                        trainee: (pt) => traineePoussiere(o, sc.calque, pt) }).then(x => Promise.all(x)) : null]);
                await Promise.all([air, ...semis]);
                await o.attendre(300);
                if (f) await o.effacer(f);
            }
        },
        {
            id: "peur", nom: "Peur", sens: "vers l'ennemi",
            description: "Le héros grandit et se teinte de mauve foncé ; l'ennemi, lui, rapetisse un instant, verdit, trois traits rouges de frayeur lui sautent au coin de la tête… et il détale loin du héros.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                // Plus de smiley (Nico : « pas de smiley déjà ») : le héros
                // grandit et s'assombrit de mauve…
                o.son("peur");
                o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(1.22)" }], { duration: 520, easing: "cubic-bezier(.3,.8,.3,1.2)", fill: "forwards" });
                teinte(o, sc.lanceur, MAUVE_SOMBRE, 520);
                o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.75, couleurs: ["#3a1850", "#6a3a8a"], taille: 10, tailleMin: 5, duree: 900, etale: 250 });
                await o.attendre(380);
                // …l'ennemi rapetisse un instant en tremblant, verdit, et trois
                // traits rouges lui sautent au coin de la tête.
                etat(o, sc.calque, sc.cible, "Peur !");
                teinte(o, sc.cible, VERT_PEUR, 260);
                const frayeur = traitsDeFrayeur(o, sc.calque, b, { duree: 1050 });
                await o.bouger(sc.cible, [{ transform: "scale(1) translate(0,0)" }, { transform: "scale(0.82) translate(0,0)", offset: 0.22 },
                                          { transform: "scale(0.82) translate(2px,-1px)", offset: 0.4 }, { transform: "scale(0.82) translate(-2px,1px)", offset: 0.55 },
                                          { transform: "scale(0.82) translate(1px,0)", offset: 0.7 }, { transform: "scale(0.84) translate(0,0)", offset: 0.85 },
                                          { transform: "scale(1) translate(0,0)" }], { duration: 950, easing: "ease-out" });
                // Puis il détale ; le héros reprend sa taille et sa couleur.
                o.son("course");
                o.bouger(sc.lanceur, [{ transform: "scale(1.22)" }, { transform: "scale(1)" }], { duration: 600, easing: "ease-in-out", fill: "forwards" });
                deteindre(o, sc.lanceur, MAUVE_SOMBRE, 700);
                await Promise.all([frayeur, marcher(sc, o, { qui: sc.cible, cases: 2, duree: 240, tangue: 12, dir: () => v, pause: 150,
                                                             apres: () => deteindre(o, sc.cible, VERT_PEUR, 350) })]);
            }
        },
        {
            id: "provocation", nom: "Provocation", sens: "vers l'ennemi",
            description: "Le héros lance son défi : un anneau rouge part de lui, un « ! » éclate sur l'ennemi, qui vacille.",
            async jouer(sc, o) {
                const { a, b } = lieux(sc);
                o.son("provocation");
                o.onde(sc.calque, a, { couleur: "#ff4040", taille: 1, duree: 700, echelle: 2.6, bord: 4 });
                await o.attendre(300);
                o.icone(sc.calque, b, "❗", { duree: 1400, lueur: "#ff4040" });
                etat(o, sc.calque, sc.cible, "Provoqué !");
                // (Plus de fil rouge qui rive l'ennemi au héros — Nico : « garde
                // tout sauf la ligne rouge qui pop, c'est pas beau ».)
                await o.bouger(sc.cible, [{ transform: "rotate(0deg)" }, { transform: "rotate(-14deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(0deg)" }], { duration: 600 });
                await o.attendre(600);
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
            description: "Un « ! » violet éclate au-dessus du héros confus… « S'enfuit ! » : il part en zigzag.",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("confusion");
                // (Plus de dé qui roule — Nico : « enlève l'animation de dé et
                // mets un point d'exclamation comme les autres ».)
                o.icone(sc.calque, a, "❗", { duree: 1200, lueur: "#c9a8ff" });
                await o.attendre(450);
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
    // CE QU'UN ÉTAT FAIT SUR SA CIBLE, sans le sort qui l'a porté (Nico, v242 :
    // « brûlé, même principe : on garde juste l'animation sur la cible, pas le
    // sort lancé » ; « électrifié, pareil ») — l'attaque a son geste à elle. Le
    // Studio les montre seuls, le combat les joue après l'attaque.
    const effetBrule = async (o, calque, el) => {
        const b = centre(el, calque);
        o.son("brule");
        o.icone(calque, b, "🔥", { duree: 1300 });
        etat(o, calque, el, "Brûlé !");
        await Promise.all([o.eclat(el, ORANGE, 700),
            o.gerbe(calque, b.x, b.y + b.t * 0.2, { nombre: 8, dist: b.t * 0.35, monte: b.t * 0.7, couleurs: ["#ffd25a", "#ff7a1a"], taille: 6, duree: 800, etale: 250 })]);
    };
    // Le tic de la brûlure : les flammes se ravivent (le chiffre est à part).
    const ticBrule = (o, calque, el) => {
        const b = centre(el, calque);
        o.son("brule");
        return Promise.all([o.gerbe(calque, b.x, b.y + b.t * 0.2, { nombre: 12, dist: b.t * 0.4, monte: b.t * 0.9, couleurs: ["#ffd25a", "#ff7a1a", "#ff4500"], taille: 8, duree: 900, etale: 300 }),
            o.eclat(el, ORANGE, 700)]);
    };
    const effetElectrifie = async (o, calque, el) => {
        const b = centre(el, calque);
        o.son("electrique");
        for (let k = 0; k < 5; k++) {
            const ang = hasard(0, Math.PI * 2), r = b.t * 0.45;
            o.eclair(calque, { x: b.x + Math.cos(ang) * r, y: b.y + Math.sin(ang) * r, t: b.t }, { x: b.x - Math.cos(ang) * r, y: b.y - Math.sin(ang) * r, t: b.t },
                     { largeur: 0.35, duree: 320, retard: k * 140, segments: 6 });
        }
        etat(o, calque, el, "Électrifié !");
        // (Plus de « -35 initiative » : l'Électrifié n'en retire plus, v267.)
        o.attendre(600).then(() => o.texte(calque, el, "+20 % dégâts magiques", COULEURS.attention));
        await o.teinter(el, [{ filter: "none" }, { filter: ELEC, offset: 0.1 }, { filter: "none", offset: 0.2 }, { filter: ELEC, offset: 0.35 },
                             { filter: "none", offset: 0.5 }, { filter: ELEC, offset: 0.65 }, { filter: "none" }], { duration: 1200 });
    };
    // LES ÉTATS QUI DURENT, et ce qui les montre (le Studio et le combat).
    const presenceEtourdi = (o, calque, el) => {
        const a = centre(el, calque);
        o.son("etourdi");
        o.texte(calque, el, "Étourdi : 20 % d'échec", COULEURS.etat);
        return Promise.all([o.etoiles(calque, a, { duree: 2200, tours: 600 }),
            o.bouger(el, [{ transform: "rotate(0deg)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(0deg)" }], { duration: 1100, iterations: 2 })]);
    };
    const presenceConfusion = (o, calque, el) => {
        const a = centre(el, calque);
        o.son("confusion");
        etat(o, calque, el, "Confusion");
        return Promise.all([o.etoiles(calque, a, { signe: "?", couleur: "#d6a8ff", duree: 2000, tours: 700 }),
            o.teinter(el, [{ filter: "none" }, { filter: "hue-rotate(90deg) saturate(1.3)" }, { filter: "hue-rotate(-60deg)" }, { filter: "none" }], { duration: 1900 })]);
    };
    // La Peur qui reste : une aura sombre frémit, il tremble (plus de smiley —
    // Nico, v242 : « peur présence, vire le smiley »).
    const presencePeur = (o, calque, el, p = {}) => {
        const a = centre(el, calque);
        return Promise.all([o.aura(calque, a, { couleur: "#3a2050", fond: "radial-gradient(circle, rgba(40,10,60,0) 50%, rgba(40,10,60,0.5) 80%)", pulsations: p.pulsations || 3, duree: p.duree || 1800 }),
            o.secouer(el, 3, (p.duree || 1800) - 100)]);
    };
    // Le sceau de l'étalement pulse et lâche sa part.
    const pulsationEtalement = async (o, calque, el) => {
        const b = centre(el, calque);
        const s = sceau(o, calque, b, "#c83a6a", { duree: 1600 });
        await o.attendre(600);
        o.son("marque");
        o.son("coup-sourd", 120);
        o.teinter(s, [{ filter: "brightness(1)" }, { filter: "brightness(2.2)" }, { filter: "brightness(1)" }], { duration: 500 });
        await Promise.all([o.eclat(el, ROUGE, 500), o.onde(calque, b, { couleur: "#e04070", taille: 1, duree: 600, echelle: 1.5 })]);
        await o.attendre(300);
        await o.effacer(s);
    };
    // Le contour bleuté du Repli, pour un tour (plus de flèche-émoticône —
    // Nico, v242 : « repli, vire l'émoticône »).
    const contourRepli = (o, calque, el) => {
        const a = centre(el, calque);
        o.son("repli");
        o.texte(calque, el, "Repli (1 tour)", COULEURS.neutre);
        return Promise.all([o.aura(calque, a, { couleur: "#8ac8ff", taille: 1.15, pulsations: 3, duree: 1800, trait: "dashed" }),
            o.eclat(el, "drop-shadow(0 0 8px #8ac8ff)", 1700)]);
    };
    ajouter(6, null, [
        {
            id: "brule", nom: "Brûlé", sens: "vers l'ennemi",
            description: "L'ennemi, touché, prend feu : il rougeoie, quelques flammèches montent de lui ; puis, en fin de manche, les flammes se ravivent et le brûlent.",
            async jouer(sc, o) {
                // Plus de braises qui convergent sur lui (le sort lancé) : l'état
                // sur la cible seule (Nico, v242).
                await effetBrule(o, sc.calque, sc.cible);
                await o.attendre(300);
                o.jauge(sc.calque, sc.cible, 40, 36, 40, "-4", COULEURS.degats, COULEURS.degats);
                await ticBrule(o, sc.calque, sc.cible);
            }
        },
        {
            id: "electrifie", nom: "Électrifié", sens: "vers l'ennemi",
            description: "De petits arcs électriques courent sur l'ennemi qui clignote ; il perd de l'initiative et craint davantage la magie.",
            async jouer(sc, o) {
                // L'état sur la cible seule, sans le sort qui l'a porté (v242).
                await effetElectrifie(o, sc.calque, sc.cible);
                await o.attendre(400);
            }
        },
        {
            id: "saignement", nom: "Saignement", sens: "vers l'ennemi",
            description: "Une entaille rouge sur l'ennemi, des gouttes ; en fin de manche il saigne encore, et chaque case qu'il parcourt lui coûte plus cher.",
            async jouer(sc, o) {
                const { b, v } = lieux(sc);
                o.son("entaille-chair");
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
                await presenceEtourdi(o, sc.calque, sc.lanceur);
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
                await presenceConfusion(o, sc.calque, sc.lanceur);
            }
        },
        {
            id: "peur-presence", nom: "Peur — présence", sens: "sur soi",
            description: "Une aura sombre frémit autour du héros, qui tremble sans cesse.",
            async jouer(sc, o) {
                o.son("peur");
                etat(o, sc.calque, sc.lanceur, "Peur");
                await presencePeur(o, sc.calque, sc.lanceur);
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
                o.attendre(600).then(() => o.jauge(sc.calque, sc.cible, 40, 36, 40, "-4", COULEURS.degats, COULEURS.degats));
                await pulsationEtalement(o, sc.calque, sc.cible);
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
            description: "Après sa frappe, le héros garde un contour bleuté : ce tour-ci, il peut se replier sans être frappé.",
            async jouer(sc, o) {
                await contourRepli(o, sc.calque, sc.lanceur);
            }
        }
    ]);

    // =====================================================================
    //  7. ZONES ET TERRAIN
    // =====================================================================
    // UNE ZONE PROCÉDURALE (v243 la glace, v244 le feu, v245 le poison et la
    // foudre) : l'élément gagne les cases visées (par défaut, l'ennemi et ses
    // voisines) depuis leur cœur et rejoint la plaque déjà posée sur la carte du
    // Studio (zones_procedurales.js) ; elle reste jusqu'à « ⟲ Replacer ». Sans
    // cette carte : la nappe d'avant, qui s'efface.
    // `type` : celui du terrain (« electrique » pour la foudre, comme au combat) ;
    // `id` : celui du catalogue (« zone-foudre »).
    const zoneProcedurale = (type, methode, nom, son, texte, souffle, description, id) => ({
        id: id || "zone-" + type, nom, sens: "vers l'ennemi", description, ciblage: CIBLAGE_ZONE,
        async jouer(sc, o) {
            const { b } = lieux(sc);
            const pts = ciblees(sc, o, () => o.autour(sc.cible, b, 1, { avecCentre: true }));
            const dedans = pionSur(sc, o, pts.find(pt => pionSur(sc, o, pt)));
            const coeur = milieu(pts);
            o.son(son);
            o.texte(sc.calque, dedans || sc.cible, texte, COULEURS.etat);
            const poser = sc.terrain && (typeof sc.terrain.zone === "function" ? (l, p) => sc.terrain.zone(type, l, p)
                                         : typeof sc.terrain[methode] === "function" ? (l, p) => sc.terrain[methode](l, p) : null);
            if (poser && pts.every(pt => pt.q !== undefined)) {
                // Un souffle au cœur (froid, brûlant, acide, chargé), puis l'élément gagne les cases.
                o.onde(sc.calque, coeur, { couleur: souffle, taille: 0.8, echelle: 2.2, bord: 2, duree: 900 });
                await poser(pts.map(pt => ({ q: pt.q, r: pt.r })), { depuis: { q: coeur.q, r: coeur.r }, duree: 1700 });
                await o.attendre(400);
                return;
            }
            const element = type === "electrique" ? "foudre" : type;
            const nappes = pts.map((pt, i) => o.nappe(sc.calque, pt, type, { fond: FONDS_ZONE[element], opacite: 0.85, retard: i * 70, duree: 420 }));
            await o.attendre(420 + pts.length * 70);
            await animerZone(o, sc.calque, pts, element, 1000);
            await effacerTout(o, nappes, { duree: 450 });
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
        // LA ZONE DE FEU (Nico, v244 : « comme les zones de glace, fais aussi de
        // façon procédurale les zones de feu ») : le feu prend au cœur de la zone
        // et gagne les cases visées, son front rougeoyant ; il rejoint le brasier
        // déjà posé ; il reste.
        zoneProcedurale("feu", "feu", "Zone persistante de feu", "zone-feu", "Zone de feu", "rgba(255,170,70,0.85)",
                        "Le feu prend au cœur de la zone et gagne les cases visées, son front rougeoyant : le sol se calcine sans contour, des veines de braises respirent, des flammes dansent couchées par le vent, une fumée s'en va sous le vent au-delà de la zone, des étincelles s'envolent. Deux zones qui se touchent ne font qu'un brasier."),
        // LA ZONE DE GLACE (Nico, v243 : « pas de contour, quelque chose de plus
        // réaliste vu du dessus : une zone de givre qui vient un peu en
        // transparence au-dessus du terrain, une petite brume glacée soufflée
        // par le vent ; plusieurs zones collées font une grosse zone ;
        // procédural ») : le givre rampe depuis le cœur de la zone sur les cases
        // visées, et rejoint la plaque déjà posée (zones_procedurales.js) ; il reste.
        zoneProcedurale("glace", "givre", "Zone persistante de glace", "zone-glace", "Zone de glace", "rgba(220,244,255,0.8)",
                        "Le givre gagne les cases visées depuis le cœur de la zone : une pellicule blanc-bleu translucide sur le terrain, sans contour, des fougères de givre, des éclats qui scintillent, et une brume glacée que le vent pousse. Deux zones qui se touchent ne font qu'une plaque."),
        // LA ZONE DE PIÈGES (Nico, v248 : « pour les zones avec juste des dégâts
        // normaux, fais des chausse-trappes sur le sol, en mode procédural
        // pareil ») : le type « neutre » du combat, « Terrain piégé ».
        zoneProcedurale("neutre", "zone", "Zone persistante de dégâts (chausse-trappes)", "zone-pieges", "Terrain piégé", "rgba(215,220,230,0.8)",
                        "Des chausse-trappes se répandent depuis le cœur de la zone sur les cases visées : le sol piétiné, à peine assombri, sans contour, semé de pointes de fer — trois à plat, la quatrième dressée — tournées au hasard, chacune avec son ombre, plus ou moins rouillées ; un reflet accroche la lumière de loin en loin. Deux zones qui se touchent ne font qu'un champ de pièges.",
                        "zone-pieges"),
        // LA ZONE DE SOIN (Nico, v250 : « dans le même esprit, fais la zone de
        // soin : de la lumière blanche qui jaillit par endroits du sol, comme un
        // soin de paladin »).
        zoneProcedurale("soin", "zone", "Zone persistante de soin (lumière sacrée)", "soin-zone", "Zone de soin", "rgba(255,250,225,0.9)",
                        "La lumière gagne les cases visées depuis le cœur de la zone : une clarté blanc doré posée sur le sol, sans contour ; par endroits, des sources de lumière qui respirent, et de leurs cœurs des colonnes de lumière blanche qui jaillissent vers le ciel, tour à tour, comme un soin de paladin ; des étincelles montent, un voile de clarté flotte. Deux zones qui se touchent ne font qu'un sanctuaire.",
                        "zone-soin"),
        // LA ZONE DE FOUDRE ET LA ZONE DE POISON (Nico, v245 : « refais dans le même
        // état d'esprit les zones poison et électrique ») : procédurales elles aussi.
        zoneProcedurale("electrique", "zone", "Zone persistante de foudre", "zone-foudre", "Zone de foudre", "rgba(170,220,255,0.85)",
                        "La charge gagne les cases visées depuis le cœur de la zone : le sol s'ionise à peine, sans contour, marqué de brûlures ramifiées qui grésillent ; des arcs claquent au hasard d'un point à l'autre, un voile de plasma vacille, des étincelles crépitent. Deux zones qui se touchent ne font qu'un champ.",
                        "zone-foudre"),
        zoneProcedurale("poison", "zone", "Zone persistante de poison", "zone-poison", "Zone de poison", "rgba(170,235,90,0.8)",
                        "La boue acide gagne les cases visées depuis le cœur de la zone : translucide, vert vif sur les bords, vert noir dans les flaques, luisante, sans contour ; le terrain se fane autour ; des bulles gonflent et crèvent ; un miasme lourd rampe sous le vent. Deux zones qui se touchent ne font qu'un marais."),
        {
            id: "gravats", nom: "Gravats / terrain difficile", sens: "vers l'ennemi",
            description: "Un éboulis jonche les cases visées (par défaut, quelques-unes près de l'ennemi) : il gagne le terrain depuis le cœur — la terre retournée, un petit monticule par case, des pierres cassées et leurs ombres, des cailloux qui roulent au-delà, une poussière légère au vent ; deux tas voisins ne font qu'un, sans contour. Ce terrain coûte double. Il reste sur la carte.",
            ciblage: { genre: "gravats", min: 1, max: 8,
                       consigne: "Touche les cases à joncher de gravats (8 au plus) — touche-en une de nouveau pour l'enlever — puis « Lancer »." },
            async jouer(sc, o) {
                const { b } = lieux(sc);
                o.son("gravats");
                const pts = ciblees(sc, o, () => o.autour(sc.cible, b, 1, { libres: true }).slice(0, 4));
                // L'éboulis part de la case la plus centrale des cases visées.
                const mx = pts.reduce((a, pt) => a + pt.x, 0) / pts.length, my = pts.reduce((a, pt) => a + pt.y, 0) / pts.length;
                const coeur = pts.reduce((m, pt) => Math.hypot(pt.x - mx, pt.y - my) < Math.hypot(m.x - mx, m.y - my) ? pt : m, pts[0]);
                const { tas, restent } = tasDeGravats(o, sc, pts, { cascade: 110, depuis: coeur, duree: 1000 });
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
    // LE CÔNE DES POINTES DE GLACE : trois rangs devant le Profanateur (2, 3 puis
    // 4 cases), entre deux de ses six directions — celle qui prend l'ennemi,
    // sinon la plus proche de lui (conePointesGlace, moteur_pur.js). Sans grille :
    // un éventail à vue.
    const coneDevant = (o, sc, a, b, v) => {
        const c0 = o.caseDe(sc.lanceur), ce = o.caseDe(sc.cible);
        if (o.grille && c0) {
            const tourner = (h, pas) => { let q = h.q, r = h.r; for (let i = 0; i < pas; i++) { const nq = -r, nr = q + r; q = nq; r = nr; } return { q, r }; };
            let mieux = null;
            for (let pas = 0; pas < 6; pas++) {
                const cases = [];
                for (let k = 1; k <= 3; k++) for (let j = 0; j <= k; j++) {
                    const h = tourner({ q: k, r: -j }, pas), q = c0.q + h.q, r = c0.r + h.r, px = o.grille.pixel(q, r);
                    cases.push({ x: px.x, y: px.y, q, r, t: a.t, rang: k, ennemi: !!ce && ce.q === q && ce.r === r });
                }
                const cx = cases.reduce((m, c) => m + c.x, 0) / cases.length - a.x, cy = cases.reduce((m, c) => m + c.y, 0) / cases.length - a.y;
                const score = (cases.some(c => c.ennemi) ? 10 : 0) + (cx * v.ux + cy * v.uy) / (Math.hypot(cx, cy) || 1);
                if (!mieux || score > mieux.score) mieux = { score, cases };
            }
            return mieux.cases;
        }
        const pas = o.pasHex(a), cases = [];
        for (let k = 1; k <= 3; k++) for (let j = 0; j <= k; j++) {
            const ang = v.angle + (j - k / 2) * (Math.PI / 3) / Math.max(1, k);
            cases.push({ x: a.x + Math.cos(ang) * pas * k, y: a.y + Math.sin(ang) * pas * k, t: a.t, rang: k, ennemi: k === 1 && j === 0 });
        }
        return cases;
    };
    // DES PICS DE GLACE qui jaillissent du sol d'une case, en étoile (vus de dessus).
    const picsDeGlace = (o, calque, pt, p = {}) => {
        const n = p.n || 4, t = pt.t || 60, els = [];
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * 360 + hasard(-25, 25), L = t * hasard(0.3, 0.46), H = L * 0.32;
            const el = o.poser(calque, pt.x, pt.y, `width:${L}px; height:${H}px; z-index:${Z.bas + 1}; transform-origin:0 50%; opacity:0;
                transform:translate(0,-50%) rotate(${ang.toFixed(0)}deg) scaleX(0);`, DESSIN_PIC_DE_GLACE);
            el.classList.add("anim-pic-pointe");
            const pose = (sx) => `translate(0,-50%) rotate(${ang.toFixed(0)}deg) scaleX(${sx})`;
            o.teinter(el, [{ transform: pose(0), opacity: 0 }, { transform: pose(1.18), opacity: 1, offset: 0.6 }, { transform: pose(1), opacity: 1 }],
                      { duration: 280, delay: (p.retard || 0) + i * 35, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "forwards" });
            els.push(el);
        }
        return els;
    };
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
                await Promise.all([elan, coupRecu(o, sc.calque, al.el, b, { valeur: "-6" })]);
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
                o.son("poison-bulles", 200);
                const toucher = (el, pos, valeur, esquive) => {
                    if (esquive) o.texte(sc.calque, el, "Esquivé 💨", COULEURS.neutre);
                    o.attendre(450).then(() => etat(o, sc.calque, el, "Empoisonné !"));
                    // Touché : le coup reçu (la chair, le sang) ; esquivé, le seul poison.
                    return Promise.all([entaille(o, sc.calque, pos, axe(a, pos).angle), esquive ? o.secouer(el, 5, 300) : coupRecu(o, sc.calque, el, a, { valeur }),
                        o.teinter(el, [{ filter: "none" }, { filter: VERT, offset: 0.3 }, { filter: "none" }], { duration: 1000, delay: esquive ? 0 : 420 }),
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
            id: "releve-zombies", nom: "Niv.1 Relève des zombies", sens: "vers l'ennemi",
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
            id: "zombie-marche-attaque", nom: "Niv.1 Zombie qui marche / qui attaque", sens: "vers l'ennemi",
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
            id: "pointes-glace", nom: "Niv.5 Pointes de glace", sens: "vers l'ennemi",
            description: "Le Profanateur frappe le sol de son froid : en cône devant lui, rang après rang, des pics de glace jaillissent et la terre gèle ; l'ennemi pris dedans se fige, Glacé, et perd 5 % de ses PV max.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                const cases = coneDevant(o, sc, a, b, v);
                o.son("gel-lancer");
                o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(1.08)", offset: 0.4 }, { transform: "scale(0.96)", offset: 0.7 }, { transform: "scale(1)" }], { duration: 560 });
                o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #bdf3ff)", 600);
                await rassembler(o, sc.calque, a, { couleur: "#e8fbff", n: 10, duree: 420, rayon: 1.2 });
                const sols = [], pics = [];
                let prise = false;
                for (let rang = 1; rang <= 3; rang++) {
                    o.son("glace-impact");
                    const duRang = cases.filter(c => c.rang === rang);
                    duRang.forEach((pt, i) => {
                        sols.push(o.hexagone(sc.calque, pt, { fond: FONDS_ZONE.glace, opacite: 0.7, duree: 260, retard: i * 40 }));
                        pics.push(...picsDeGlace(o, sc.calque, pt, { retard: i * 40 }));
                        cristaux(o, sc.calque, pt, { n: 5, duree: 900 });
                    });
                    if (!prise && duRang.some(c => c.ennemi)) {
                        prise = true;
                        teinte(o, sc.cible, GIVRE, 300);
                        etat(o, sc.calque, sc.cible, "Glacé !");
                        o.jauge(sc.calque, sc.cible, 40, 38, 40, "-2", COULEURS.degats, COULEURS.degats);
                        o.secouer(sc.cible, b.t * 0.06, 300);
                    }
                    await o.attendre(230);
                }
                await o.attendre(1100);
                if (prise) deteindre(o, sc.cible, GIVRE, 500);
                await Promise.all([effacerTout(o, sols, { duree: 500 }), ...pics.map(el => fondre(o, el, 500))]);
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
                // La morsure (son déjà parti) : le coup reçu, sans autre bruit.
                await Promise.all([elan, griffes(o, sc.calque, b, axe(c.pos, b).angle, "#ffffff"), coupRecu(o, sc.calque, sc.cible, c.pos, { son: false, valeur: "-8" })]);
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
                o.son("arc-tendu");
                await o.teinter(mire, [{ transform: `${BASE} scale(1.6)`, opacity: 0 }, { transform: `${BASE} scale(0.75)`, opacity: 1 }], { duration: 600, easing: "ease-in", fill: "forwards" });
                o.son("tir");
                const L = a.t * 0.9;
                await o.projectile(sc.calque, a, { x: b.x + v.ux * (b.t * 0.05 - L / 2), y: b.y + v.uy * (b.t * 0.05 - L / 2), t: b.t },
                    { taille: 0.9, arc: 0, oriente: true, easing: "linear", duree: Math.min(380, 140 + v.d * 0.4), forme: "0",
                      contenu: DESSIN_FLECHE, style: "height:auto; aspect-ratio:7/1; background:none;" });
                mire.remove();
                const fleche = flechePlantee(o, sc.calque, b, v, { longueur: L });
                o.texte(sc.calque, sc.cible, "🎯 Tir précis !", "#ff6060");
                coupRecu(o, sc.calque, sc.cible, a, { son: "fleche-impact", valeur: "-8", force: 0.08, n: 6 });
                o.son("chaines", 300);
                const anneau = o.poser(sc.calque, b.x, b.y, `width:${b.t * 1.2}px; height:${b.t * 1.2}px; border-radius:50%; z-index:${Z.sol}; border:5px dotted #8a8a8a;`);
                o.surgir(anneau);
                o.attendre(500).then(() => etat(o, sc.calque, sc.cible, "Immobilisé"));
                await o.attendre(1300);
                await Promise.all([o.effacer(anneau), fondre(o, fleche.el, 400)]);
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
            description: "Sur toutes les cases touchées à la fois, la roche du jeu sort de terre en tremblant ; un nuage de poussière roule à son pied et des cailloux volent de partout avant de s'effacer en fondu. Les murs voisins se soudent en muraille et restent sur la carte. Un combattant sur une case murée est repoussé.",
            ciblage: { genre: "mur", min: 1, max: 8,
                       consigne: "Touche les cases où lever un mur, comme en combat (8 au plus ; pas sur ton pion) — touche-en une de nouveau pour l'enlever — puis « Lancer »." },
            async jouer(sc, o) {
                const { a } = lieux(sc);
                const pts = ciblees(sc, o, () => o.autour(sc.lanceur, a, 1, { libres: true }).slice(0, 3));
                o.son("mur-terre");
                // Posés du haut de l'écran vers le bas : la roche du devant passe
                // devant (comme au combat). TOUS sortent de terre EN MÊME TEMPS
                // (Nico : « il faut que tous les murs de pierre sortent de terre en
                // même temps ») — chacun dans sa poussière et ses cailloux (o.mur).
                const murs = duHautVersLeBas(pts).map(i => o.mur(sc.calque, pts[i], { avec: pts }));
                o.texte(sc.calque, sc.lanceur, "Mur de terre", "#c8b08a");
                // Quelqu'un sur une case murée : il est repoussé (comme en combat).
                const pousses = pts.map((pt) => {
                    const pion = pionSur(sc, o, pt);
                    if (!pion || pion === sc.lanceur) return null;
                    return o.attendre(220).then(() => {
                        o.son("poussee");
                        o.texte(sc.calque, pion, "Repoussé !", COULEURS.etat);
                        return repousser(sc, o, pion, pts, a);
                    });
                }).filter(Boolean);
                // Le temps que la poussière retombe et que les cailloux s'effacent.
                await Promise.all([o.attendre(2400), ...pousses]);
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
                // Le temps que la poussière retombe et que les cailloux s'effacent.
                await o.attendre(dessus ? 1900 : 2400);
                await garderMurs(o, sc, [pt], [mur]);
            }
        },
        {
            id: "mur-effondre", nom: "Niv.5 Mur de terre effondré → gravats", sens: "vers l'ennemi",
            description: "Le mur visé (un mur levé sur la carte, ou une case libre où il se dresse d'abord) se fissure, tremble, puis s'écroule dans un gros nuage de poussière, des cailloux volant de partout avant de s'effacer en fondu ; à son pied, l'éboulis gagne la case — terre retournée, pierres cassées, poussière — et reste (deux murs tombés côte à côte ne font qu'un éboulis) ; ses voisins gardent un moignon cassé.",
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
                // L'écroulement soulève un GROS nuage de poussière (Nico : « pareil
                // pour l'animation du mur détruit : nuage de poussière »), plus
                // large et plus long que celui d'un mur qui sort, et projette ses
                // cailloux de partout ; tout s'efface en fondu.
                const poussieres = pts.map(pos => Promise.all([
                    o.nuagePoussiere(sc.calque, pos, { nombre: 18, etendue: 1.4, taille: 1.25, pied: 0.1, duree: 2200 }),
                    o.attendre(60).then(() => o.cailloux(sc.calque, pos, { nombre: 16, portee: 1.3, pied: 0 }))]));
                // L'éboulis gagne le sol depuis le pied du mur pendant qu'il s'écroule.
                const chute = Promise.all(murs.map(m => o.effondrer(m)));
                await o.attendre(260);
                const { tas, restent } = tasDeGravats(o, sc, pts, { nombre: 9, depuis: pts[0], duree: 900 });
                await chute;
                murs.forEach(m => m && m.remove());
                o.texte(sc.calque, tas[0] || sc.cible, "Gravats", COULEURS.attention);
                await Promise.all([o.attendre(1200), ...poussieres]);
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
                // Une seule petite plaque de feu sur les trois cases (la carte du Studio), sinon une nappe par case.
                const plaque = sc.terrain && typeof sc.terrain.plaquePassagere === "function" && pts.every(pt => pt.q !== undefined)
                    ? sc.terrain.plaquePassagere("feu", pts.map(pt => ({ q: pt.q, r: pt.r }))) : null;
                if (plaque) { o.suivre(plaque); o.teinter(plaque, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: "both" }); }
                const cases = plaque ? [plaque] : pts.map((pt, i) => o.nappe(sc.calque, pt, "feu", { fond: FONDS_ZONE.feu, opacite: 0.75, retard: i * 70 }));
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
                const toucher = (el, pos, k) => Promise.all([entaille(o, sc.calque, pos, axe(a, pos).angle, { retard: k * 150 }),
                    o.attendre(k * 150).then(() => coupRecu(o, sc.calque, el, a, { valeur: "-7" }))]);
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
            id: "insensible-gel", nom: "Niv.1 Résiste au gel", sens: "sur soi",
            description: "Un trait de glace frappe le Vampire : le givre se forme… puis fond aussitôt en brume rouge. « ❄️ Résiste au gel »",
            async jouer(sc, o) {
                const { a } = lieux(sc);
                o.son("gel-lancer");
                await sortEnnemi(o, sc, { couleur: "#9fe6ff", coeur: "#ffffff", taille: 0.3, arc: 0 });
                o.son("glace-impact");
                await Promise.all([o.onde(sc.calque, a, { couleur: "#bdf3ff", taille: 1, duree: 400, echelle: 1.3 }), o.eclat(sc.lanceur, GIVRE, 400)]);
                o.son("resiste");
                o.texte(sc.calque, sc.lanceur, "❄️ Résiste au gel", COULEURS.neutre);
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
                await frapper(o, sc.calque, sc.cible, f, { sonImpact: "bris-verre", sang: false });
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
    // LES PREMIÈRES ANIMATIONS, RETOUCHÉES (animations_combat.js garde leur
    // version d'origine ; celles-ci les remplacent, à la même place).
    //   • Coup d'épée : l'entaille effilée, la chair, le sang (le coup reçu).
    //   • Boule de feu (Nico : « le bruit d'une flamme tout le long du chemin,
    //     à l'arrivée une explosion de flamme sans bruit de métal ; une boule
    //     de feu plus réaliste, qui part en ligne droite ; à l'impact une
    //     gerbe de feu sur la cible »).
    //   • Coup critique (« juste l'animation du message coup critique, ensuite
    //     c'est l'animation normale de l'attaque »).
    ajouter(2, null, [
        {
            id: "coup-epee", nom: "Coup d'épée (corps à corps)", categorie: "Attaque", sens: "vers l'ennemi",
            description: "Le héros prend son élan et fond sur l'ennemi : une entaille effilée le traverse, il recule et saigne. (Le coup de base, sans style : Attaque légère et Attaque lourde en sont les deux formes du jeu.)",
            async jouer(sc, o) {
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-12" });
            }
        },
        {
            id: "boule-de-feu", nom: "Attaque magique Feu (Boule de feu)", categorie: "Sort", sens: "vers l'ennemi",
            description: "Le héros s'embrase ; une boule de feu rugissante file droit sur l'ennemi en semant des braises et explose sur lui en une gerbe de flammes.",
            async jouer(sc, o) {
                const { a, b, v } = lieux(sc);
                await o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff8c1a)", 260);
                // La flamme qui gronde, tout le long du chemin.
                o.son("feu-vol");
                await o.projectile(sc.calque, a, b, { taille: 0.55, arc: 0, oriente: true, duree: Math.min(900, 380 + v.d * 0.9), easing: "cubic-bezier(.4,0,.8,1)",
                    traine: ["#ffcf5a", "#ff7a1a", "#e8420c"], contenu: DESSIN_BOULE_DE_FEU, style: "background:none; overflow:visible;" });
                // L'explosion de flammes (sans métal), la gerbe de feu sur la cible.
                o.son("feu-explosion");
                o.jauge(sc.calque, sc.cible, 40, 26, 40, "-14", COULEURS.degats, COULEURS.degats);
                o.attendre(500).then(() => etat(o, sc.calque, sc.cible, "Brûlé !"));
                await Promise.all([gerbeDeFeu(o, sc.calque, b), o.secouer(sc.cible, b.t * 0.12, 320, v), o.eclat(sc.cible, ORANGE, 600)]);
            }
        },
        {
            id: "coup-critique", nom: "Coup critique", categorie: "Attaque", sens: "vers l'ennemi",
            description: "« COUP CRITIQUE ! » tombe en rouge sous le pion du héros, claque, souligné d'un trait, dans une pluie d'étincelles, sur un son sourd et épique ; puis vient l'attaque, normale.",
            async jouer(sc, o) {
                o.son("critique-epique");
                messageCritique(o, sc.calque, sc.lanceur);
                await o.attendre(650);
                await frapper(o, sc.calque, sc.lanceur, sc.cible, { valeur: "-24 !" });
                await o.attendre(300);
            }
        }
    ]);

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
        "zone-apercu", "zone-feu", "zone-glace", "zone-foudre", "zone-poison", "zone-pieges", "zone-soin", "gravats",
        // 8. Classes
        "tenebres", "tenebres-etalees", "charme-fratricide", "charme-frappe", "charme-perdu", "transfert",
        "provocation-protecteur", "rempart", "rempart-actif", "rempart-rompu", "resonance-bouclier",
        "instinct-tueur", "assaut-mortel",
        "soin-urgence", "prise-en-charge",
        "lumiere-classe", "lumiere-aveuglante", "bouclier-anti-magie", "renvoi", "appel-lumiere",
        "releve-zombies", "zombie-marche-attaque", "pointes-glace", "sursis", "sursis-soin-refuse", "sursis-fin", "releve-zombies-2",
        "compagnon-apparition", "compagnon-attaque", "compagnon-terre", "tir-precis", "lien-sang-soin", "lien-sang-releve",
        "mur-terre", "mur-terre-repousse", "mur-effondre", "traverse-murs", "zones-sans-danger",
        "fureur-sentinelle", "retour-arriere",
        "insensible-gel", "baiser-vampire", "nuee", "esquive-nuee",
        // 9. Talents
        "adrenaline", "inertie-martiale", "impact-cinetique", "elan-partage", "bouclier-sages", "degats-illusoires", "immunise", "pugiliste", "diversion"
    ];
    window.ORDRE_ANIMATIONS_COMBAT = ORDRE;
    window.enregistrerAnimationsCombat(A, ORDRE);

    // =====================================================================
    //  EN JEU : LES ANIMATIONS VALIDÉES, JOUÉES PAR LE COMBAT
    // =====================================================================
    //  Nico, dans le Studio : « Marche du Vargen, Bond, Repli, Pas de retraite
    //  offert par l'arme, Fuite sous la Peur, Fuite sous la Confusion,
    //  Hémorragie interne, Arrivée d'un renfort, Apparition d'une Illusion,
    //  Déploiement des pions : tu peux les implanter en jeu. » Puis : « Marche
    //  case par case, terrain difficile, marche gelée, entrée dans les zones
    //  persistantes, attaque de zone, attaque d'un zombie, échec de technique
    //  (Étourdi), compétence lancée sur soi : c'est bon, tu peux intégrer. »
    //  Et : « coup d'épée au corps à corps, attaque légère, attaque lourde,
    //  attaque à distance, attaque magique feu : tu peux implanter. »
    //
    //  Le combat ne joue pas une scène entière : il rejoue son journal ÉTAPE
    //  PAR ÉTAPE — un pas, un bond, une arrivée (animations_jeu.js). Ce sont
    //  donc les gestes du Studio, découpés au pas : `sc.de` et `sc.vers` sont
    //  les cases du pas, `sc.premier` dit s'il ouvre le trajet (ce qui ne se
    //  dit qu'une fois : « Foulée du Vargen », « Peur : il s'enfuit ! »), et
    //  le pion finit sur sa case (sc.poserPion). Pour un pion qui entre en
    //  scène, le vrai pion reste caché (sc.montrer le rend visible) : c'est
    //  sa copie qui tombe du ciel, qu'un redessin du plateau ne coupe pas.
    const pointDe = (o, sc, c) => {
        const px = o.grille.pixel(c.q, c.r);
        return { x: px.x, y: px.y, q: c.q, r: c.r, t: centre(sc.lanceur, sc.calque).t };
    };
    // UN PAS DU COMBAT : de la case où le pion se tient jusqu'à `sc.vers`, où il reste.
    const unPas = async (sc, o, p = {}) => {
        const a = centre(sc.lanceur, sc.calque), arrivee = pointDe(o, sc, sc.vers);
        await o.parcourir(sc.lanceur, a, [arrivee], { duree: p.duree || 380, hauteur: p.hauteur, tangue: p.tangue, saut: p.saut,
            apresPas: (pt) => { if (p.son) o.son(p.son); if (p.pas) p.pas(pt, a); } });
        await o.arriver(sc.lanceur, arrivee, { sinonRentrer: false });
        return arrivee;
    };
    // UNE TEINTE QUI TIENT LE TEMPS D'UNE FUITE : reposée sur l'image du pion à
    // chaque pas, elle s'en va d'elle-même quand plus aucun pas ne la ravive.
    const teintesTenues = new WeakMap();
    const teinteTenue = (el, filtre, ms) => {
        const img = (el && el.querySelector(".token-img-main")) || el;
        if (!img) return;
        if (!teintesTenues.has(img)) img.dataset.filtreAvant = img.style.filter || "";
        img.style.transition = "filter 0.3s ease";
        img.style.filter = filtre;
        clearTimeout(teintesTenues.get(img));
        teintesTenues.set(img, setTimeout(() => { img.style.filter = img.dataset.filtreAvant || ""; teintesTenues.delete(img); }, ms || 2000));
    };
    // La copie d'un pion qui entre en scène (le vrai, caché, la remplace à la fin).
    const doublure = (o, sc, pos) => {
        const f = o.figurant(sc.calque, sc.lanceur, pos, { opacite: 0 });
        if (f) f.classList.remove("pion-en-entree");
        return f;
    };
    const positionDe = (o, sc) => ({ ...centre(sc.lanceur, sc.calque), ...(o.caseDe(sc.lanceur) || {}) });
    // UN COUP AU CORPS À CORPS, EN JEU : l'élan vers la première cible, une
    // entaille sur chacune, le coup reçu sur qui est vraiment touché (sans
    // chiffre : l'étape des dégâts le dira).
    const toucheEnJeu = (sc, el) => (sc.touchees || []).includes(el);
    const frapperEnJeu = async (o, sc, p = {}) => {
        const A = centre(sc.lanceur, sc.calque), B = centre(sc.cibles[0], sc.calque);
        if (p.sonElan !== false) o.son(p.sonElan || "lame-souffle", p.retardSon === undefined ? 150 : p.retardSon);
        const elan = o.elan(sc.lanceur, A, B, p.elan || {});
        await o.attendre(p.contact || 330);
        await Promise.all([elan, ...sc.cibles.map(el => {
            const C = centre(el, sc.calque);
            return Promise.all([entaille(o, sc.calque, C, axe(A, C).angle, p.entaille || {}),
                toucheEnJeu(sc, el) ? coupRecu(o, sc.calque, el, A, {}) : null]);
        })]);
    };
    // Ce que coûte la case, au-dessus du pion (une case gratuite ne dit rien).
    const coutAffiche = (sc, o) => { if (Number(sc.cout) > 0) o.texte(sc.calque, sc.lanceur, `-${Number(sc.cout)} ⚡`, COULEURS.attention, { taille: 15 }); };
    // D'OÙ VIENT LE COUP d'une réaction : le pion qui l'a porté (sc.cible),
    // sinon sa case (sc.caseDepuis), sinon d'au-dessus (une zone, un tic).
    const sourceDuCoup = (sc, o) => {
        const a = centre(sc.lanceur, sc.calque);
        if (sc.cible) return centre(sc.cible, sc.calque);
        if (sc.caseDepuis && o.grille) return pointDe(o, sc, sc.caseDepuis);
        return { x: a.x, y: a.y - a.t, t: a.t };
    };
    // L'énergie qui monte ou descend sur le pion : sa barre et son chiffre (« +5 ⚡ »).
    const energieEnJeu = (o, sc) => {
        if (sc.max === undefined) return;
        o.energie(sc.calque, sc.lanceur, sc.de, sc.vers, sc.max, sc.texte || "");
    };
    // LES CASES D'UN DÉPLACEMENT IMPOSÉ, de `de` (exclue) à `vers` (incluse) :
    // la ligne droite de la grille (coordonnées axiales, arrondi cubique) — le
    // cerveau a tranché l'arrivée, l'écran la rejoint case après case.
    const casesEntre = (de, vers) => {
        if (!de || !vers) return [];
        const q0 = Number(de.q), r0 = Number(de.r), q1 = Number(vers.q), r1 = Number(vers.r);
        const n = Math.max(Math.abs(q1 - q0), Math.abs(r1 - r0), Math.abs(q1 + r1 - q0 - r0));
        const cases = [];
        for (let i = 1; i <= n; i++) {
            const k = i / n, x = q0 + (q1 - q0) * k + 1e-6, z = r0 + (r1 - r0) * k + 1e-6, y = -x - z;
            let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
            const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
            if (dx > dy && dx > dz) rx = -ry - rz;
            else if (dz > dy) rz = -rx - ry;
            cases.push({ q: rx, r: rz });
        }
        return cases;
    };
    // La source d'un geste (qui pousse, tire, effraie, provoque) : le pion de
    // la scène qui n'est pas celui qui subit.
    const sourceDe = (sc) => (sc.cible && sc.cible !== sc.lanceur ? sc.cible : null);

    window.enregistrerAnimationsJeu([
        // LES ATTAQUES (Nico : « coup d'épée au corps à corps, attaque légère,
        // attaque lourde, attaque à distance, attaque magique feu : tu peux
        // implanter ») : le geste du Studio, vers chaque cible (sc.cibles) ; le
        // coup reçu — le recul, le sang, la chair — sur qui est vraiment touché
        // (sc.touchees). Le chiffre vient ensuite, une fois, à l'étape des
        // dégâts ; l'esquive à la sienne.
        { id: "jeu-coup-epee", async jouer(sc, o) {
            await frapperEnJeu(o, sc, {});
        } },
        // Deux coups vifs, deux entailles fines qui se croisent ; les dégâts une
        // seule fois (l'étape des dégâts suit).
        { id: "jeu-attaque-legere", async jouer(sc, o) {
            const elan = { portee: 0.45, duree: 300, prise: 0.25, frappe: 0.55 };
            await frapperEnJeu(o, sc, { elan, contact: 165, sonElan: "dague", retardSon: 40, entaille: { taille: 1.1, epaisseur: 5, duree: 260 } });
            await frapperEnJeu(o, sc, { elan, contact: 165, sonElan: "dague", retardSon: 40, entaille: { taille: 1.1, epaisseur: 5, duree: 260, tourne: 180 } });
        } },
        // Il arme longuement, recule et pivote, puis abat un coup ample : grande
        // entaille, onde de choc au sol, le choc sourd.
        { id: "jeu-attaque-lourde", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), b = centre(sc.cibles[0], sc.calque), v = axe(a, b);
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
            await Promise.all([elan, ...sc.cibles.map(el => {
                const c = centre(el, sc.calque);
                return Promise.all([entaille(o, sc.calque, c, axe(a, c).angle, { taille: 2.1, epaisseur: 11, duree: 460 }),
                    o.onde(sc.calque, c, { couleur: "#c8a878", taille: 1.1, duree: 650, echelle: 2.1, bord: 5 }),
                    toucheEnJeu(sc, el) ? coupRecu(o, sc.calque, el, a, { force: 0.22, n: 12 }) : null]);
            })]);
        } },
        // La corde qui se tend, la flèche qui file ; touchée, la cible la prend
        // dans la chair (elle y vibre, garde son angle, puis s'efface) ; ratée,
        // la flèche file au-delà.
        { id: "jeu-attaque-distance", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), v0 = axe(a, centre(sc.cibles[0], sc.calque));
            o.son("arc-tendu");
            await o.bouger(sc.lanceur, [{ transform: "translate(0,0)" }, { transform: `translate(${-v0.ux * 4}px, ${-v0.uy * 4}px) scale(0.97)` }],
                           { duration: 380, fill: "forwards" });
            o.son("tir");
            o.lacher(sc.lanceur);
            const L = a.t * 0.9;
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), v = axe(a, b), touchee = toucheEnJeu(sc, el);
                const fin = touchee ? { x: b.x + v.ux * (b.t * 0.05 - L / 2), y: b.y + v.uy * (b.t * 0.05 - L / 2), t: b.t }
                                    : { x: b.x + v.ux * b.t * 1.4, y: b.y + v.uy * b.t * 1.4, t: b.t };
                await o.projectile(sc.calque, a, fin, { taille: 0.9, arc: 0.06, oriente: true, easing: "linear", duree: Math.min(560, 200 + axe(a, fin).d * 0.5),
                    forme: "0", contenu: DESSIN_FLECHE, style: "height:auto; aspect-ratio:7/1; background:none;" });
                if (!touchee) return;
                const fleche = flechePlantee(o, sc.calque, b, v, { longueur: L });
                o.attendre(900).then(() => fondre(o, fleche.el, 380));
                await Promise.all([coupRecu(o, sc.calque, el, a, { son: "fleche-impact", force: 0.08, n: 6 }),
                    o.teinter(fleche.fut, [0, 7, -5, 3, -1.5, 0].map(k => ({ transform: `rotate(${deg(v.angle) + k}deg)` })), { duration: 560, easing: "ease-out" })]);
            }));
        } },
        // La boule de feu : le lanceur s'embrase, la flamme gronde tout le
        // chemin, en ligne droite ; sur la cible touchée, l'explosion et la gerbe
        // de feu ; ratée, elle s'écrase sur sa case, plus petite.
        { id: "jeu-boule-de-feu", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            await o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff8c1a)", 260);
            o.son("feu-vol");
            let sonne = false;
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), v = axe(a, b), touchee = toucheEnJeu(sc, el);
                await o.projectile(sc.calque, a, b, { taille: 0.55, arc: 0, oriente: true, duree: Math.min(900, 380 + v.d * 0.9), easing: "cubic-bezier(.4,0,.8,1)",
                    traine: ["#ffcf5a", "#ff7a1a", "#e8420c"], contenu: DESSIN_BOULE_DE_FEU, style: "background:none; overflow:visible;" });
                if (!sonne) { sonne = true; o.son("feu-explosion"); }
                if (!touchee) return gerbeDeFeu(o, sc.calque, b, { taille: 0.6, n: 5 });
                await Promise.all([gerbeDeFeu(o, sc.calque, b), o.secouer(el, b.t * 0.12, 320, v), o.eclat(el, ORANGE, 600)]);
            }));
        } },
        // LA MARCHE CASE PAR CASE (Nico : « c'est bon, tu peux intégrer ») : un
        // petit saut par case, un pas sur l'herbe et la terre, un peu de
        // poussière, et ce que coûte la case au-dessus du pion.
        { id: "jeu-pas-marche", async jouer(sc, o) {
            await unPas(sc, o, { duree: 400, saut: true, son: "pas-herbe",
                pas: (pt) => { poussiere(o, sc.calque, pt, { n: 4 }); coutAffiche(sc, o); } });
        } },
        // LE TERRAIN DIFFICILE : la même marche, plus lente et plus lourde.
        { id: "jeu-pas-difficile", async jouer(sc, o) {
            await unPas(sc, o, { duree: 680, saut: true, hauteur: 1.1, son: "pas-lourd",
                pas: (pt) => { poussiere(o, sc.calque, pt, { n: 5 }); coutAffiche(sc, o); } });
        } },
        // LA MARCHE GELÉE (Glacé) : rien sur le pion ; dessous, quelques cristaux
        // de givre à chaque pas, et la glace qui craque. « Glacé : marche ×2 »
        // au premier pas.
        { id: "jeu-pas-gelee", async jouer(sc, o) {
            if (sc.premier) etat(o, sc.calque, sc.lanceur, "Glacé : marche ×2");
            await unPas(sc, o, { duree: sc.difficile ? 680 : 420, saut: true, hauteur: sc.difficile ? 1.1 : undefined, son: "pas-glace",
                pas: (pt) => { cristaux(o, sc.calque, pt); coutAffiche(sc, o); } });
        } },
        // L'ENTRÉE DANS UNE ZONE PERSISTANTE : la case réagit sous le pion, selon
        // sa nature — le feu monte, la glace saisit, la décharge crépite (son
        // électrique), le poison bouillonne. Le chiffre suit, avec sa jauge ;
        // l'état posé se dit. `sc.deja` : la case a déjà réagi pour cette
        // entrée (un chiffre, puis un état) : l'état seul.
        { id: "jeu-entree-zone", async jouer(sc, o) {
            const pt = centre(sc.lanceur, sc.calque);
            if (!sc.deja) {
                if (sc.type === "feu") {
                    o.son("brule"); o.eclat(sc.lanceur, ORANGE, 500);
                    o.gerbe(sc.calque, pt.x, pt.y, { nombre: 10, dist: pt.t * 0.5, monte: pt.t * 0.6, couleurs: ["#ffd25a", "#ff7a1a", "#ff4500"], taille: 8, duree: 700 });
                } else if (sc.type === "glace") {
                    o.son("glace-impact"); o.eclat(sc.lanceur, GIVRE, 500);
                    o.onde(sc.calque, pt, { couleur: "#bdf3ff", taille: 0.8, duree: 500, echelle: 1.6 });
                    cristaux(o, sc.calque, pt, { n: 5 });
                } else if (sc.type === "electrique") {
                    o.son("decharge"); o.eclat(sc.lanceur, ELEC, 500);
                    for (let k = 0; k < 3; k++) o.eclair(sc.calque, { x: pt.x - pt.t * 0.5, y: pt.y + hasard(-0.3, 0.3) * pt.t, t: pt.t },
                                                         { x: pt.x + pt.t * 0.5, y: pt.y + hasard(-0.3, 0.3) * pt.t, t: pt.t }, { largeur: 0.4, duree: 360, retard: k * 90, segments: 6 });
                } else if (sc.type === "poison") {
                    o.son("poison-bulles"); o.eclat(sc.lanceur, VERT, 500);
                    o.gerbe(sc.calque, pt.x, pt.y + pt.t * 0.1, { nombre: 10, dist: pt.t * 0.4, monte: pt.t * 0.7, couleurs: ["#7dd321", "#b5ff4c", "#4e8a12"],
                                                                 taille: 8, tailleMin: 4, duree: 900, etale: 300 });
                } else {
                    o.son("impact-magique"); o.eclat(sc.lanceur, ROUGE, 450);
                    o.onde(sc.calque, pt, { couleur: "#ff6a4a", taille: 0.8, duree: 500, echelle: 1.6 });
                }
            }
            if (sc.etat) etat(o, sc.calque, sc.lanceur, `${sc.etat} !`);
            await o.attendre(sc.deja ? 300 : 450);
        } },
        // L'ATTAQUE DE ZONE (Nico : « on garde, tu peux l'implanter ») : les cases
        // visées rougeoient, pulsent, puis explosent ensemble — chaque hexagone
        // flamboie, une onde par case, une gerbe au milieu ; ceux qui y sont
        // secoués. Les chiffres suivent, un par cible.
        { id: "jeu-attaque-zone", async jouer(sc, o) {
            const pts = (sc.cases || []).map(c => pointDe(o, sc, c));
            if (!pts.length) return;
            const a = centre(sc.lanceur, sc.calque), b = milieu(pts);
            const touches = (sc.cibles || []).map(id => document.getElementById("token-" + id)).filter(el => el && el !== sc.lanceur);
            o.eclat(sc.lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff5030)", 600);
            const cases = pts.map((pt, i) => o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,120,80,0.45), rgba(200,30,20,0.35) 80%)", retard: i * 40 }));
            cases.forEach(c => c.classList.add("anim-case-zone"));
            await o.pulser(cases, { duree: 300, fois: 2, eclat: 1.6, decale: 20 });
            o.son("zone-explosion");
            await Promise.all([
                ...cases.map(c => o.teinter(c, [{ filter: "brightness(1)", opacity: 1 }, { filter: "brightness(2.4) saturate(1.5)", opacity: 1, offset: 0.2 },
                                                { filter: "brightness(1)", opacity: 0 }], { duration: 800, fill: "forwards" })),
                ...pts.map((pt, i) => o.onde(sc.calque, pt, { couleur: "#ff9a40", taille: 0.7, duree: 600, echelle: 1.7, retard: i * 25 })),
                o.gerbe(sc.calque, b.x, b.y, { nombre: 18, dist: b.t * Math.min(3.5, 1.8 * Math.sqrt(pts.length / 7)), couleurs: ["#ffcf5a", "#ff7a1a", "#e8420c"], taille: 7, duree: 850 }),
                ...touches.map(el => o.secouer(el, b.t * 0.14, 420, axe(a, centre(el, sc.calque))))]);
            cases.forEach(c => c.remove());
        } },
        // L'ATTAQUE D'UN ZOMBIE (« c'est bon, tu peux implanter ») : il titube,
        // s'élance et griffe sa proie de trois traits pâles.
        { id: "jeu-attaque-zombie", async jouer(sc, o) {
            const A = centre(sc.lanceur, sc.calque), B = centre(sc.cible, sc.calque), v = axe(A, B);
            o.son("zombie");
            await o.bouger(sc.lanceur, [{ transform: "rotate(0deg)" }, { transform: "rotate(-8deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(0deg)" }], { duration: 500 });
            const elan = o.elan(sc.lanceur, A, B, {});
            await o.attendre(330);
            o.son("griffe");
            await Promise.all([elan, griffes(o, sc.calque, B, v.angle, "#c8ffb0")]);
        } },
        // L'ÉCHEC D'UNE TECHNIQUE (Étourdi) : le combattant rassemble son
        // énergie… qui fuse et retombe en fumée grise.
        { id: "jeu-echec-etourdi", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("energie");
            await Promise.all([rassembler(o, sc.calque, a, { couleur: "#ffe680", n: 8, duree: 450 }), o.eclat(sc.lanceur, OR, 500)]);
            o.son("echec");
            o.icone(sc.calque, a, "💫", { duree: 1200 });
            o.texte(sc.calque, sc.lanceur, sc.texte || "Échec ! (Étourdi)", sc.couleur || COULEURS.attention);
            await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 12, dist: a.t * 0.8, monte: a.t * 0.4, couleurs: ["#9a9a9a", "#cfcfcf", "#6a6a6a"], taille: 12, tailleMin: 6, duree: 1100, etale: 200 }),
                o.teinter(sc.lanceur, [{ filter: "none" }, { filter: "grayscale(0.8) brightness(0.8)", offset: 0.3 }, { filter: "none" }], { duration: 900 })]);
        } },
        // SE FRAPPER SOI-MÊME (la Confusion — Nico : « Confusion se frappe
        // soi-même : on garde, tu peux intégrer ») : le geste du Studio. Un
        // « ❓ » au-dessus du confus, « Confus : s'inflige sa propre
        // compétence ! », puis il retourne son arme contre lui : une entaille sur
        // son propre pion, et le coup reçu s'il se touche vraiment (sc.touche) —
        // le chiffre suit, à l'étape des dégâts. Une carte sans attaque qu'il se
        // donne (un soin, un bouclier) : le « ❓ », le mot et la lueur violette.
        { id: "jeu-carte-sur-soi", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const loin = sc.cible ? centre(sc.cible, sc.calque) : { x: a.x + a.t * 2, y: a.y, t: a.t };
            const v = axe(a, loin);
            o.son("confusion");
            o.icone(sc.calque, a, "❓", { duree: 1300, lueur: "#c9a8ff" });
            await o.attendre(400);
            o.texte(sc.calque, sc.lanceur, sc.texte || "Confus : s'inflige sa propre compétence !", sc.couleur || "#cc66ff");
            if (!sc.offensive) { await o.eclat(sc.lanceur, VIOLET, 600); return; }
            o.son("lame-souffle");
            await Promise.all([entaille(o, sc.calque, a, v.angle + Math.PI),
                sc.touche ? coupRecu(o, sc.calque, sc.lanceur, loin, {}) : o.eclat(sc.lanceur, VIOLET, 460)]);
        } },
        // ATTAQUER UN ALLIÉ AU HASARD (la Confusion — « on garde, tu peux
        // intégrer ») : le « ❓ » et le mot sur le confus, sa lueur violette ;
        // puis (le geste de l'attaque, juste après) il frappe l'allié.
        { id: "jeu-confusion-allie", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("confusion");
            o.icone(sc.calque, a, "❓", { duree: 1300, lueur: "#c9a8ff" });
            o.texte(sc.calque, sc.lanceur, sc.texte || "Confus : attaque un allié !", sc.couleur || "#cc66ff");
            await Promise.all([o.eclat(sc.lanceur, VIOLET, 450), o.attendre(450)]);
        } },
        // LA CONFUSION DISSIPÉE (« on garde, tu peux intégrer ») : les « ? » qui
        // tournaient autour du pion éclatent en étincelles, sa teinte violette
        // s'efface ; le mot, en vert.
        { id: "jeu-confusion-dissipee", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            teinte(o, sc.lanceur, VIOLET, 200);
            o.etoiles(sc.calque, a, { signe: "?", couleur: "#d6a8ff", duree: 900, tours: 400 });
            await o.attendre(800);
            o.son("dissipe");
            o.texte(sc.calque, sc.lanceur, sc.texte || "Confusion dissipée !", sc.couleur || "#33cc66");
            await Promise.all([o.gerbe(sc.calque, a.x, a.y - a.t * 0.2, { nombre: 12, dist: a.t * 0.8, couleurs: ["#ffffff", "#e0c8ff"], taille: 5, duree: 700 }),
                deteindre(o, sc.lanceur, VIOLET, 700)]);
        } },
        // ÉTOURDI (« on garde, tu peux intégrer ») : l'état posé, des étoiles
        // tournent autour de sa tête et il vacille. Le choc lui-même (le coup
        // reçu, le chiffre) a eu son étape ; sans coup avant, un éclat le marque.
        { id: "jeu-etourdi", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("etourdi");
            etat(o, sc.calque, sc.lanceur, "Étourdi !");
            await Promise.all([o.etoiles(sc.calque, a, { duree: 1600 }),
                sc.dejaFrappe ? null : o.eclat(sc.lanceur, "brightness(1.5)", 300),
                o.bouger(sc.lanceur, [{ transform: "rotate(0deg)" }, { transform: "rotate(-9deg)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-6deg)" },
                                      { transform: "rotate(5deg)" }, { transform: "rotate(0deg)" }], { duration: 1500, easing: "ease-in-out" })]);
        } },
        // =================================================================
        //  LE PROFANATEUR (Nico : « relève des zombies, zombie qui marche et
        //  qui attaque, sursis, soin refusé en sursis, fin de sursis, relève
        //  des zombies à 2 cases : on garde, tu peux intégrer »).
        // =================================================================
        // LA RELÈVE : tombé, le pion a quitté le plateau ; sa copie, couchée et
        // grise, se relève sur un sceau vert, vert-de-gris, à son service (le
        // vrai pion reparaît dessous à la fin).
        { id: "jeu-releve-zombie", async jouer(sc, o) {
            const pos = positionDe(o, sc);
            const f = doublure(o, sc, pos);
            await o.bouger(f, [{ transform: "rotate(80deg) scale(0.9)", filter: GRIS, opacity: 0.6 },
                               { transform: "rotate(80deg) scale(0.9)", filter: GRIS, opacity: 0.6 }], { duration: 30, fill: "forwards" });
            o.son("zombie");
            const s = sceau(o, sc.calque, pos, "#7dd321", { duree: 1800 });
            await o.attendre(500);
            o.son("releve");
            await releverEnZombie(o, f, 80);
            if (sc.montrer) sc.montrer();
            o.texte(sc.calque, f || sc.lanceur, sc.texte || "🧟 Se relève en zombie !", "#9fe070");
            await o.attendre(600);
            await o.effacer(s);
        } },
        // À 2 CASES DU PROFANATEUR (niveau 10) : le grand sceau s'étend autour
        // de lui (sc.cible), une lueur file jusqu'au mort, qui se relève.
        { id: "jeu-releve-zombie-2", async jouer(sc, o) {
            const pos = positionDe(o, sc);
            const m = sc.cible ? centre(sc.cible, sc.calque) : pos;
            const f = doublure(o, sc, pos);
            await o.bouger(f, [{ transform: "rotate(80deg) scale(0.9)", filter: GRIS, opacity: 0.6 },
                               { transform: "rotate(80deg) scale(0.9)", filter: GRIS, opacity: 0.6 }], { duration: 30, fill: "forwards" });
            o.son("zombie");
            const s = sceau(o, sc.calque, m, "#7dd321", { taille: 4.6, duree: 2200, tours: 90 });
            await o.attendre(500);
            await o.filer(sc.calque, m, pos, { couleur: "#9fe070", taille: 0.2, duree: 500 });
            o.son("releve");
            await releverEnZombie(o, f, 80);
            if (sc.montrer) sc.montrer();
            o.texte(sc.calque, f || sc.lanceur, sc.texte || "🧟 Se relève en zombie !", "#9fe070");
            await o.attendre(600);
            await o.effacer(s);
        } },
        // LE ZOMBIE QUI MARCHE : il titube, d'un pas lourd (sa griffe :
        // jeu-attaque-zombie).
        { id: "jeu-pas-zombie", async jouer(sc, o) {
            if (sc.premier) o.son("zombie");
            await unPas(sc, o, { duree: 340, tangue: 10, hauteur: 1.02, son: "pas-lourd" });
        } },
        // LE SURSIS QUI COMMENCE : à zéro PV, il reste debout, grisé, un sablier
        // au-dessus de lui, une aura sombre qui pulse ; « 💀 Sursis : 2 tours ».
        { id: "jeu-sursis", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("sursis");
            teinte(o, sc.lanceur, GRIS, 400);
            o.icone(sc.calque, a, "⏳", { duree: 2000, tourne: 180 });
            o.aura(sc.calque, a, { couleur: "#7a1020", fond: "radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(40,0,0,0.5) 85%)", pulsations: 3, duree: 1900 });
            o.texte(sc.calque, sc.lanceur, sc.texte || "💀 Sursis", sc.couleur || "#b388ff");
            await o.attendre(1800);
            await deteindre(o, sc.lanceur, GRIS, 300);
        } },
        // UN COUP SUR LUI EN SURSIS : une entaille grise, un bruit sourd, rien
        // ne se passe — « Sursis 💀 ».
        { id: "jeu-sursis-coup", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const D = sc.cible ? centre(sc.cible, sc.calque) : { x: a.x - a.t, y: a.y, t: a.t };
            o.son("coup-sourd");
            o.texte(sc.calque, sc.lanceur, sc.texte || "Sursis 💀", sc.couleur || "#b388ff");
            await Promise.all([entaille(o, sc.calque, a, axe(D, a).angle, { couleur: "#9a9a9a", lueur: "#666", lueur2: "#333" }),
                               o.eclat(sc.lanceur, GRIS, 500)]);
        } },
        // UN SOIN REFUSÉ EN SURSIS : les éclats de soin viennent à lui… et
        // retombent en cendres grises.
        { id: "jeu-sursis-soin-refuse", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("soin");
            await rassembler(o, sc.calque, a, { couleur: "#7dff9a", n: 9, duree: 600, rayon: 1.3 });
            o.son("refus");
            o.texte(sc.calque, sc.lanceur, sc.texte || "Sursis : aucun soin 💀", sc.couleur || "#b388ff");
            await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.5, couleurs: ["#8a8a8a", "#5a5a5a"], taille: 5, duree: 900 }),
                               o.eclat(sc.lanceur, GRIS, 700)]);
        } },
        // LA FIN DU SURSIS : le sablier se vide et se renverse ; à bout, il
        // s'effondre (et ne se relève pas : invisible jusqu'au redessin).
        { id: "jeu-sursis-fin", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o);
            const loin = axe(D, a), tourne = loin.ux >= 0 ? 85 : -85;
            teinte(o, sc.lanceur, GRIS, 300);
            o.son("sursis");
            await o.icone(sc.calque, a, "⌛", { duree: 1000, tourne: 180 });
            o.son("chute");
            o.texte(sc.calque, sc.lanceur, "Fin du sursis", COULEURS.degats, { taille: 24 });
            await o.bouger(sc.lanceur, [{ transform: "translate(0,0) rotate(0deg)", filter: GRIS, opacity: 1 },
                { transform: `translate(${loin.ux * a.t * 0.2}px, ${loin.uy * a.t * 0.2}px) rotate(${tourne}deg) scale(0.9)`, filter: "grayscale(1) brightness(0.4)", opacity: 0.5, offset: 0.7 },
                { transform: `translate(${loin.ux * a.t * 0.2}px, ${loin.uy * a.t * 0.2}px) rotate(${tourne}deg) scale(0.9)`, filter: "grayscale(1) brightness(0.4)", opacity: 0 }],
                { duration: 1100, easing: "ease-in", fill: "forwards" });
            if (!o.annulee()) sc.lanceur.style.opacity = "0";
            await o.attendre(200);
        } },
        // LA MARCHE DU VARGEN : foulée légère et rapide, une silhouette laissée
        // sur chaque case quittée ; « ½ ⚡ » au premier pas.
        { id: "jeu-pas-vargen", async jouer(sc, o) {
            if (sc.premier) o.texte(sc.calque, sc.lanceur, "Foulée du Vargen : ½ ⚡", COULEURS.neutre);
            await unPas(sc, o, { duree: 210, hauteur: 1.08, son: "pas-leger",
                pas: (pt, a) => o.fantome(sc.calque, sc.lanceur, a, { opacite: 0.4 }) });
        } },
        // LE REPLI : son annonce (le souffle, sans icône), puis des pas qui filent
        // en laissant leur ombre derrière eux.
        { id: "jeu-annonce-repli", async jouer(sc, o) {
            o.son("repli");
            o.texte(sc.calque, sc.lanceur, sc.texte || "Repli : sans opportunité", sc.couleur || COULEURS.neutre);
            await o.attendre(450);
        } },
        { id: "jeu-pas-repli", async jouer(sc, o) {
            await unPas(sc, o, { duree: 190, hauteur: 1.03,
                pas: (pt, a) => o.fantome(sc.calque, sc.lanceur, a, { opacite: 0.35 }) });
        } },
        // LE PAS DE RETRAITE OFFERT PAR L'ARME : chaque case gratuite marquée
        // d'une empreinte dorée, « Pas gratuit ».
        { id: "jeu-pas-offert", async jouer(sc, o) {
            let empreinte = null;
            await unPas(sc, o, { duree: 320, son: "pas-leger",
                pas: (pt) => {
                    empreinte = o.hexagone(sc.calque, pt, { fond: "radial-gradient(circle, rgba(255,230,140,0.7), rgba(226,184,79,0.25) 70%)", duree: 300 });
                    o.texte(sc.calque, sc.lanceur, "Pas gratuit", "#ffd700");
                } });
            await o.attendre(250);
            if (empreinte) o.effacer(empreinte, { duree: 500 });
        } },
        // LA FUITE SOUS LA PEUR : au premier pas il tremble (plus de smiley),
        // puis détale en titubant, des gouttes de sueur ; il garde le vert de
        // la Peur. L'effroi joué juste avant (jeu-peur, `sc.effraye`) a déjà
        // tout dit : il détale aussitôt.
        { id: "jeu-pas-peur", async jouer(sc, o) {
            teinteTenue(sc.lanceur, VERT_PEUR, 2000);
            if (sc.premier && !sc.effraye) {
                o.son("peur");
                etat(o, sc.calque, sc.lanceur, "Peur : il s'enfuit !");
                await o.secouer(sc.lanceur, 4, 500);
            }
            o.son("course");
            await unPas(sc, o, { duree: 230, tangue: 12, hauteur: 1.06,
                pas: (pt) => o.gerbe(sc.calque, pt.x, pt.y, { nombre: 3, dist: pt.t * 0.4, couleurs: ["#bfe6ff", "#8ac8ff"], taille: 4, duree: 400 }) });
        } },
        // LA FUITE SOUS LA CONFUSION : une teinte violette, puis une course
        // folle qui tangue. Le « ❗ » et « Confus : s'enfuit ! » ont été dits
        // juste avant (jeu-confusion-fuite) : plus de « ? » au premier pas.
        { id: "jeu-pas-confusion", async jouer(sc, o) {
            teinteTenue(sc.lanceur, VIOLET, 2000);
            o.son("course");
            await unPas(sc, o, { duree: 280, tangue: 35 });
        } },
        // L'HÉMORRAGIE INTERNE : à chaque case, un éclat rouge, des gouttes, le
        // son qui saigne (le chiffre suit, avec sa jauge).
        { id: "jeu-hemorragie", async jouer(sc, o) {
            if (sc.premier) etat(o, sc.calque, sc.lanceur, "Hémorragie interne");
            const p = centre(sc.lanceur, sc.calque);
            o.son("saignement");
            o.eclat(sc.lanceur, ROUGE, 380);
            o.gerbe(sc.calque, p.x, p.y + p.t * 0.15, { nombre: 6, dist: p.t * 0.35, couleurs: ["#b0101c", "#e03040"], taille: 6, duree: 600 });
            await o.attendre(220);
        } },
        // LE BOND : le pion s'élève (il grossit), survole les cases en arc
        // pendant que son ombre glisse au sol, et se reçoit dans la poussière.
        { id: "jeu-bond", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), fin = pointDe(o, sc, sc.vers);
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
            await o.arriver(sc.lanceur, fin, { sinonRentrer: false });
            o.effacer(ombre, { duree: 200 });
            await o.attendre(150);
        } },
        // UN RENFORT : un cercle doré s'ouvre sur sa case, il tombe du ciel et
        // se pose dans la poussière. « Renfort ! »
        { id: "jeu-arrivee-renfort", async jouer(sc, o) {
            const pos = positionDe(o, sc);
            o.son("apparition");
            const cercle = o.hexagone(sc.calque, pos, { fond: "radial-gradient(circle, rgba(255,240,200,0.2) 30%, rgba(226,184,79,0.75) 60%, rgba(120,60,20,0) 80%)" });
            o.onde(sc.calque, pos, { couleur: "#e2b84f", taille: 1, duree: 700, echelle: 1.5 });
            await o.attendre(400);
            const f = doublure(o, sc, pos);
            await atterrir(o, f, {});
            o.son("reception");
            poussiere(o, sc.calque, pos, { n: 10, dist: 0.6 });
            if (sc.montrer) sc.montrer();
            o.texte(sc.calque, f || sc.lanceur, "Renfort !", COULEURS.attention);
            await o.attendre(900);
            await o.effacer(cercle);
        } },
        // UNE ILLUSION : des éclats irisés convergent sur sa case et forment le
        // leurre, qui sort du flou et chatoie.
        { id: "jeu-apparition-illusion", async jouer(sc, o) {
            const pos = positionDe(o, sc);
            o.son("illusion");
            await rassembler(o, sc.calque, pos, { couleur: "#c9a8ff", n: 12, duree: 600, etale: 250 });
            const f = doublure(o, sc, pos);
            await o.teinter(f, [{ opacity: 0, filter: "hue-rotate(200deg) saturate(1.4) brightness(1.2) blur(4px)" }, { opacity: 1, filter: "none" }],
                            { duration: 450, fill: "forwards" });
            if (sc.montrer) sc.montrer();
            o.texte(sc.calque, f || sc.lanceur, "Illusion", "#c9a8ff");
            await o.teinter(f, [{ filter: "none" }, { filter: "hue-rotate(260deg) saturate(1.4) brightness(1.3)" }, { filter: "none" }], { duration: 900 });
        } },
        // LE DÉPLOIEMENT : la case s'illumine (d'or pour un allié, de rouge pour
        // un ennemi) et le pion y descend ; `sc.retard` les égrène.
        { id: "jeu-deploiement", async jouer(sc, o) {
            const pos = positionDe(o, sc);
            await o.attendre(sc.retard || 0);
            if (sc.sonne) o.son("deploiement");
            const h = o.hexagone(sc.calque, pos, { fond: sc.allie ? "radial-gradient(circle, rgba(255,235,150,0.75), rgba(226,184,79,0.35) 70%)"
                                                               : "radial-gradient(circle, rgba(255,140,140,0.7), rgba(180,30,30,0.35) 70%)" });
            await o.attendre(150);
            const f = doublure(o, sc, pos);
            await o.teinter(f, [{ transform: `${BASE} scale(1.6)`, opacity: 0 }, { transform: `${BASE} scale(0.95)`, opacity: 1, offset: 0.8 },
                                { transform: `${BASE} scale(1)`, opacity: 1 }], { duration: 480, easing: "ease-in", fill: "forwards" });
            poussiere(o, sc.calque, pos, { n: 8 });
            if (sc.montrer) sc.montrer();
            if (sc.texte) o.texte(sc.calque, f || sc.lanceur, "Déploiement", COULEURS.neutre);
            await o.attendre(600);
            await o.effacer(h);
        } },

        // =================================================================
        //  LA LISTE SUIVANTE (Nico : « attaque magique, garde juste le son de
        //  l'électricité… glace, multi-élémentaire, mots de pouvoir, lumière,
        //  coup critique, attaque d'opportunité, créature qui frappe un mur,
        //  coups reçus, esquive, parade, contre, absorption, bouclier,
        //  mise à terre, illusion brisée, soins, bouclier créé, purification,
        //  bénédictions, repos long, régénération, dépense d'énergie : tu peux
        //  intégrer »). Les sorts partent vers chaque cible (sc.cibles) ; le coup
        //  ne porte que sur qui est vraiment touché (sc.touchees). Aucun chiffre
        //  ici : il vient, une fois, à l'étape des dégâts.
        // =================================================================
        // LA FOUDRE : le lanceur crépite de bleu ; deux éclairs déchirent l'air
        // jusqu'à la cible, qui blanchit et jette des étincelles. Manquée,
        // l'éclair claque au sol à côté d'elle. Un seul son, celui de
        // l'électricité — rien quand la cible reçoit le coup.
        { id: "jeu-attaque-foudre", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.eclat(sc.lanceur, "brightness(1.4) drop-shadow(0 0 8px #9fd8ff)", 500);
            for (let k = 0; k < 3; k++) o.eclair(sc.calque, a, { x: a.x + hasard(-1, 1) * a.t * 0.6, y: a.y + hasard(-1, 1) * a.t * 0.6, t: a.t },
                                                 { largeur: 0.3, duree: 260, retard: k * 90, segments: 4 });
            await o.attendre(320);
            o.son("foudre");
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), v = axe(a, b), touchee = toucheEnJeu(sc, el);
                const vise = touchee ? b : { x: b.x - v.uy * b.t * 0.75, y: b.y + v.ux * b.t * 0.75, t: b.t };
                o.eclair(sc.calque, a, vise, { duree: 480 });
                o.eclair(sc.calque, a, vise, { duree: 420, retard: 200 });
                if (!touchee) return o.gerbe(sc.calque, vise.x, vise.y, { nombre: 6, dist: b.t * 0.5, couleurs: ["#ffffff", "#9fd8ff"], taille: 3, duree: 420 });
                await Promise.all([o.onde(sc.calque, b, { couleur: "#9fd8ff", taille: 0.9, duree: 500, echelle: 1.8 }),
                    o.teinter(el, [{ filter: "none" }, { filter: ELEC, offset: 0.15 }, { filter: "none", offset: 0.3 }, { filter: ELEC, offset: 0.45 }, { filter: "none" }], { duration: 700 }),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 12, dist: b.t * 0.9, couleurs: ["#ffffff", "#9fd8ff", "#5aa0ff"], taille: 4, duree: 500 }),
                    o.secouer(el, b.t * 0.06, 500)]);
            }));
        } },
        // LA GLACE : des pointes de cristal naissent devant le lanceur, se
        // tournent vers la cible et filent une à une s'y planter ; elle blanchit
        // de froid. Manquées, elles filent au-delà et se brisent au sol.
        { id: "jeu-attaque-glace", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const n = sc.cibles.length > 1 ? 3 : 5, R = a.t * 0.82, L = a.t * 0.52, H = L * 0.3;
            const pose = (angle, s, dx = 0, dy = 0) => `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}deg) scale(${s})`;
            o.son("glace-formation");
            const pics = [];
            sc.cibles.forEach((el, j) => {
                const b = centre(el, sc.calque), v = axe(a, b), touchee = toucheEnJeu(sc, el);
                for (let i = 0; i < n; i++) {
                    const k = i - (n - 1) / 2, base = v.angle + k * 0.42, ang = deg(base);
                    const pos = { x: a.x + Math.cos(base) * R, y: a.y + Math.sin(base) * R };
                    // MANQUÉS, ils frôlent la cible et se brisent au sol juste
                    // à côté d'elle (Nico, v252 : « l'attaque magique de glace
                    // au CàC, l'animation va un hexagone plus loin que sa
                    // cible ») : ils filaient 1,3 pion au-delà, soit presque une
                    // case entière quand on frappe au contact.
                    const cote = 0.5 + i * 0.12;   // tous du même côté, en éventail
                    const vise = touchee ? { x: b.x - v.uy * k * b.t * 0.1, y: b.y + v.ux * k * b.t * 0.1 }
                                         : { x: b.x + v.ux * b.t * 0.35 - v.uy * cote * b.t, y: b.y + v.uy * b.t * 0.35 + v.ux * cote * b.t };
                    const u = axe(pos, vise);
                    const fin = { x: vise.x - u.ux * L * 0.3, y: vise.y - u.uy * L * 0.3 };
                    const vers = ang + ((deg(u.angle) - ang + 540) % 360) - 180;
                    const pic = o.poser(sc.calque, pos.x, pos.y, `width:${L}px; height:${H}px; z-index:${Z.ciel}; opacity:0;
                        transform:${BASE} rotate(${ang}deg) scale(0);`, DESSIN_PIC_DE_GLACE);
                    pic.classList.add("anim-pic-glace");
                    pics.push({ el: pic, pos, fin, ang, vers, u, cible: el, b, touchee, rang: j * n + i });
                }
            });
            pics.forEach(pc => o.teinter(pc.el, [{ transform: pose(pc.ang, 0), opacity: 0 }, { transform: pose(pc.ang, 1.15), opacity: 1, offset: 0.5 },
                                                 { transform: pose(pc.ang, 1), opacity: 1 }], { duration: 300, delay: pc.rang * 60, easing: "ease-out", fill: "forwards" }));
            await o.attendre(300 + (pics.length - 1) * 60);
            await Promise.all(pics.map(pc => o.teinter(pc.el, [{ transform: pose(pc.ang, 1), opacity: 1 }, { transform: pose(pc.vers, 1), opacity: 1 }],
                                                       { duration: 240, easing: "ease-in-out", fill: "forwards" })));
            await o.attendre(120);
            await Promise.all(pics.map((pc, i) => o.attendre(i * 100).then(async () => {
                o.son("glace-tir");
                await o.teinter(pc.el, [{ transform: pose(pc.vers, 1), opacity: 1 },
                                        { transform: pose(pc.vers, 0.9, pc.fin.x - pc.pos.x, pc.fin.y - pc.pos.y), opacity: 1 }],
                                { duration: 140, easing: "cubic-bezier(.5,0,1,1)", fill: "forwards" });
                o.gerbe(sc.calque, pc.fin.x + pc.u.ux * L * 0.4, pc.fin.y + pc.u.uy * L * 0.4, { nombre: 5, dist: pc.b.t * 0.35, angle: pc.u.angle + Math.PI,
                    eventail: Math.PI * 0.8, couleurs: ["#ffffff", "#bdf3ff", "#7fcfff"], taille: 4, tailleMin: 2, carre: true, duree: 420 });
                if (!pc.touchee) return;
                o.son("glace-plante");
                o.secouer(pc.cible, pc.b.t * 0.05, 160, pc.u);
            })));
            await Promise.all([...sc.cibles.filter(el => toucheEnJeu(sc, el)).map(el => Promise.all([
                o.teinter(el, [{ filter: "none" }, { filter: GIVRE, offset: 0.3 }, { filter: GIVRE, offset: 0.8 }, { filter: "none" }], { duration: 1000 }),
                o.onde(sc.calque, centre(el, sc.calque), { couleur: "#bdf3ff", taille: 1, duree: 650, echelle: 1.6 })])),
                ...pics.map(pc => fondre(o, pc.el, 350))]);
        } },
        // LE SORT DE PLUSIEURS ÉLÉMENTS : trois orbes (feu, glace, foudre)
        // tournent autour du lanceur, puis filent ensemble et éclatent en trois
        // couleurs mêlées. Manquée, la cible les voit passer et s'éteindre.
        { id: "jeu-attaque-multi", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const couleurs = [["#ff7a1a", "#fff1c0"], ["#9fe6ff", "#ffffff"], ["#8fb0ff", "#ffffff"]];
            o.son("feu-lancer"); o.son("gel-lancer", 120);
            const r = a.t * 0.62;
            await Promise.all(couleurs.map(([c, coeur], i) => {
                const d = o.poser(sc.calque, a.x, a.y, `width:${a.t * 0.26}px; height:${a.t * 0.26}px; border-radius:50%; z-index:${Z.ciel};
                    background:radial-gradient(circle at 40% 40%, ${coeur}, ${c} 60%, rgba(0,0,0,0)); box-shadow:0 0 12px ${c};`);
                const images = [];
                for (let k = 0; k <= 8; k++) {
                    const ang = (i / 3) * Math.PI * 2 + (k / 8) * Math.PI * 2;
                    images.push({ transform: `translate(calc(-50% + ${Math.cos(ang) * r}px), calc(-50% + ${Math.sin(ang) * r}px))` });
                }
                return o.jouerPuisRetirer(d, images, { duration: 700, easing: "linear" });
            }));
            o.son("foudre");
            let sonne = false;
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), v = axe(a, b), touchee = toucheEnJeu(sc, el);
                const fin = touchee ? b : { x: b.x + v.ux * b.t * 1.2, y: b.y + v.uy * b.t * 1.2, t: b.t };
                await Promise.all(couleurs.map(([c, coeur], i) => orbe(o, sc.calque, a, fin, { couleur: c, coeur, taille: 0.26, arc: [0.5, 0, -0.5][i], duree: 520,
                                                                                              traine: [c, coeur] })));
                if (!touchee) return o.gerbe(sc.calque, fin.x, fin.y, { nombre: 6, dist: b.t * 0.5, couleurs: ["#ff7a1a", "#bdf3ff", "#8fb0ff"], taille: 4, duree: 450 });
                if (!sonne) { sonne = true; o.son("feu-explosion"); }
                await Promise.all([...couleurs.map(([c], i) => o.onde(sc.calque, b, { couleur: c, taille: 0.8 + i * 0.15, duree: 700, echelle: 2, retard: i * 90 })),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 15, dist: b.t * 1.1, couleurs: ["#ff7a1a", "#bdf3ff", "#8fb0ff"], taille: 6, duree: 800 }),
                    o.secouer(el, b.t * 0.12, 380, v)]);
            }));
        } },
        // L'ARCANE (v267) : un sceau violet s'ouvre sous le lanceur, trois runes
        // s'y rassemblent ; une orbe violette file, traînant des éclats de
        // lumière pâle, et sur la cible touchée deux cercles runiques se
        // déploient puis s'éteignent. Manquée, l'orbe passe et se disperse.
        { id: "jeu-attaque-arcane", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const VIOLET = "#b98cff", PALE = "#efe3ff";
            o.son("lumiere");
            const marque = sceau(o, sc.calque, a, VIOLET, { taille: 1.15, duree: 1500, tours: 120 });
            await Promise.all([rassembler(o, sc.calque, a, { couleur: VIOLET, n: 6, duree: 420, rayon: 0.9 }),
                o.eclat(sc.lanceur, `brightness(1.2) drop-shadow(0 0 9px ${VIOLET})`, 520)]);
            let sonne = false;
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), v = axe(a, b), touchee = toucheEnJeu(sc, el);
                const fin = touchee ? b : { x: b.x + v.ux * b.t * 1.2, y: b.y + v.uy * b.t * 1.2, t: b.t };
                await orbe(o, sc.calque, a, fin, { couleur: VIOLET, coeur: PALE, taille: 0.34, arc: 0.18, duree: Math.min(780, 340 + v.d * 0.8),
                                                   traine: [VIOLET, PALE] });
                if (!sonne) { sonne = true; o.son("impact-magique"); }
                if (!touchee) return o.gerbe(sc.calque, fin.x, fin.y, { nombre: 7, dist: b.t * 0.5, couleurs: [VIOLET, PALE], taille: 4, duree: 450 });
                const cercle = sceau(o, sc.calque, b, VIOLET, { taille: 1.05, duree: 900, tours: -90 });
                await Promise.all([o.onde(sc.calque, b, { couleur: VIOLET, taille: 0.85, duree: 650, echelle: 2 }),
                    o.onde(sc.calque, b, { couleur: PALE, taille: 0.7, duree: 650, echelle: 1.7, retard: 110 }),
                    o.gerbe(sc.calque, b.x, b.y, { nombre: 12, dist: b.t * 0.9, couleurs: [VIOLET, PALE, "#7d4dff"], taille: 5, duree: 700 }),
                    o.secouer(el, b.t * 0.1, 340, v), o.eclat(el, `drop-shadow(0 0 8px ${VIOLET})`, 600)]);
                await fondre(o, cercle, 300);
            }));
            await fondre(o, marque, 300);
        } },
        // LA DISTORSION MENTALE (ex-Mots de pouvoir) : le lanceur prononce les
        // mots, trois ondes de voix roulent en arcs jusqu'à la cible et la
        // frappent, sans couleur.
        { id: "jeu-mots-de-pouvoir", async jouer(sc, o) {
            // La Distorsion mentale (v265) : des ondes psychiques qui déforment
            // la carte jusqu'à chaque cible ; touchée, elle se tord sur elle-même.
            const a = centre(sc.lanceur, sc.calque);
            o.son("mots");
            o.eclat(sc.lanceur, `brightness(1.15) drop-shadow(0 0 9px ${VIOLET_DISTORSION})`, 700);
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), touchee = toucheEnJeu(sc, el);
                const ondes = ondesPsychiques(o, sc, a, b);
                await o.attendre(ondes.arrivee);
                if (!touchee) return ondes.fin;
                await Promise.all([ondes.fin, tordreCible(o, el), o.eclat(el, `drop-shadow(0 0 8px ${VIOLET_DISTORSION})`, 600)]);
            }));
        } },
        // LA LUMIÈRE : un arc de lumière s'ouvre devant le lanceur ; le rayon en
        // part, large, et s'amincit jusqu'à la cible qu'il perce : elle
        // clignote une fois d'un jaune léger.
        { id: "jeu-lumiere", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), R = a.t * 0.62;
            o.son("lumiere");
            o.eclat(sc.lanceur, "brightness(1.25) drop-shadow(0 0 8px #ffe680)", 700);
            await Promise.all(sc.cibles.map(async el => {
                const b = centre(el, sc.calque), v = axe(a, b), rot = deg(v.angle), touchee = toucheEnJeu(sc, el);
                const arc = o.poser(sc.calque, a.x, a.y, `width:${R * 2.4}px; height:${R * 2.4}px; z-index:${Z.haut}; opacity:0; transform:${BASE} rotate(${rot}deg);`,
                    `<svg viewBox="-60 -60 120 120" width="100%" height="100%" style="overflow:visible; filter:drop-shadow(0 0 4px #ffd700) drop-shadow(0 0 10px #ffb800)">
                       <path d="M26.5 -42.4 A 50 50 0 0 1 26.5 42.4" fill="none" stroke="#fff6c8" stroke-width="5" stroke-linecap="round"/></svg>`);
                arc.classList.add("anim-arc-lumiere");
                await o.teinter(arc, [{ transform: `${BASE} rotate(${rot}deg) scale(0.6, 0)`, opacity: 0 }, { transform: `${BASE} rotate(${rot}deg) scale(1, 1)`, opacity: 1 }],
                                { duration: 260, easing: "ease-out", fill: "forwards" });
                const corde = R * 0.848 * 2;
                const S = { x: a.x + v.ux * R * 0.53, y: a.y + v.uy * R * 0.53 };
                const fin = touchee ? b : { x: b.x + v.ux * b.t * 0.9, y: b.y + v.uy * b.t * 0.9 };
                const L = Math.max(10, Math.hypot(fin.x - S.x, fin.y - S.y));
                const rayon = o.poser(sc.calque, S.x, S.y, `width:${L}px; height:${corde}px; z-index:${Z.haut}; transform-origin:0 50%;
                    transform:translate(0,-50%) rotate(${rot}deg) scaleX(0); filter:drop-shadow(0 0 5px #ffd700) drop-shadow(0 0 12px #ffb800);`,
                    `<div style="position:absolute; inset:0; clip-path:polygon(0 0, 100% 48%, 100% 52%, 0 100%);
                          background:linear-gradient(90deg, rgba(255,226,120,0.5), rgba(255,240,170,0.9));"></div>
                     <div style="position:absolute; inset:0; clip-path:polygon(0 34%, 100% 49.4%, 100% 50.6%, 0 66%);
                          background:linear-gradient(90deg, rgba(255,255,240,0.8), #ffffff);"></div>`);
                rayon.classList.add("anim-rayon-lumiere");
                const trace = (sx) => `translate(0,-50%) rotate(${rot}deg) scaleX(${sx})`;
                const trait = o.teinter(rayon, [{ transform: trace(0), opacity: 1 }, { transform: trace(1), opacity: 1, offset: 0.28 },
                                                 { transform: trace(1), opacity: 0.9, offset: 0.7 }, { transform: trace(1), opacity: 0 }],
                                        { duration: 900, easing: "ease-out", fill: "forwards" });
                await o.attendre(250);
                await Promise.all([trait, touchee ? o.teinter(el, [{ filter: "none" }, { filter: JAUNE_LEGER, offset: 0.45 }, { filter: "none" }], { duration: 520 }) : null,
                    o.teinter(arc, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 650, fill: "forwards" })]);
                arc.remove();
                rayon.remove();
            }));
        } },
        // LE COUP CRITIQUE S'ANNONCE AVANT LE COUP (Nico : « mets un son plus
        // sourd et épique ») : « COUP CRITIQUE ! » tombe sous le pion, sur un
        // son de timbale et de cuivres graves ; puis vient l'attaque, normale.
        { id: "jeu-critique", async jouer(sc, o) {
            o.son("critique-epique");
            messageCritique(o, sc.calque, sc.lanceur);
            await o.attendre(650);
        } },
        // L'ATTAQUE D'OPPORTUNITÉ : celui qui reste frappe au passage celui qui
        // s'en va (⚔️, « Opportunité ! ») — l'élan, l'entaille, le coup reçu ;
        // le chiffre vient à l'étape des dégâts.
        { id: "jeu-attaque-opportunite", async jouer(sc, o) {
            if (!sc.cible) return;
            const a = centre(sc.lanceur, sc.calque), b = centre(sc.cible, sc.calque), v = axe(a, b);
            o.icone(sc.calque, a, "⚔️", { taille: 0.45, duree: 1100 });
            o.texte(sc.calque, sc.lanceur, "Opportunité !", COULEURS.attention);
            o.son("lame-souffle", 150);
            const elan = o.elan(sc.lanceur, a, b, {});
            await o.attendre(330);
            await Promise.all([elan, entaille(o, sc.calque, b, v.angle, {}), coupRecu(o, sc.calque, sc.cible, a, {})]);
        } },
        // UNE CRÉATURE QUI FRAPPE UN MUR DE TERRE (sans la pioche, Nico) : deux
        // grands coups vers la case du mur, des éclats de roche qui volent, de
        // la poussière.
        { id: "jeu-frappe-mur", async jouer(sc, o) {
            if (!sc.mur || !o.grille) return;
            const a = centre(sc.lanceur, sc.calque), pos = pointDe(o, sc, sc.mur);
            for (let k = 0; k < 2; k++) {
                const elan = o.elan(sc.lanceur, a, pos, { portee: 0.5, duree: 420 });
                await o.attendre(240);
                o.son("pioche");
                o.gerbe(sc.calque, pos.x, pos.y, { nombre: 9, dist: pos.t * 0.8, couleurs: ["#a08868", "#6e5a40"], taille: 6, carre: true, duree: 600 });
                poussiere(o, sc.calque, pos, { n: 5, dist: 0.5 });
                await elan;
            }
        } },

        // --- LES RÉACTIONS (le pion qui encaisse, qui se dérobe, qu'on soigne) ---
        // LE COUP REÇU PHYSIQUE : deux entailles se croisent, le pion recule,
        // s'empourpre et saigne de son flanc.
        { id: "jeu-coup-recu-physique", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o), v = axe(D, a);
            o.son("lame-souffle");
            await Promise.all([entaille(o, sc.calque, a, v.angle, { taille: 1.3 }), entaille(o, sc.calque, a, v.angle, { taille: 1.3, tourne: 90, retard: 80 }),
                coupRecu(o, sc.calque, sc.lanceur, D, {})]);
        } },
        // LE COUP REÇU MAGIQUE : un anneau violet se resserre, des éclats
        // d'arcane crépitent, le pion se teinte de violet.
        { id: "jeu-coup-recu-magique", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o);
            o.son("impact-magique");
            await Promise.all([o.onde(sc.calque, a, { couleur: "#b070ff", taille: 1.6, duree: 500, echelle: 0.5 }),
                o.gerbe(sc.calque, a.x, a.y, { nombre: 10, dist: a.t * 0.8, couleurs: ["#d6b0ff", "#9050e0", "#ffffff"], texte: "✦", taille: 16, tailleMin: 10, duree: 700 }),
                o.secouer(sc.lanceur, a.t * 0.12, 360, axe(D, a)), o.eclat(sc.lanceur, VIOLET, 460)]);
        } },
        // LE COUP REÇU BRUT : un choc sans couleur, que rien n'arrête.
        { id: "jeu-coup-recu-brut", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o);
            o.son("impact-brut");
            await Promise.all([o.onde(sc.calque, a, { couleur: "#c8c8c8", taille: 0.9, duree: 550, echelle: 1.9 }),
                o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(0.86)", offset: 0.25 }, { transform: "scale(1.03)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 500 }),
                o.eclat(sc.lanceur, "grayscale(1) brightness(1.4)", 500), o.secouer(sc.lanceur, a.t * 0.06, 400, axe(D, a))]);
        } },
        // L'ESQUIVE : un pas de côté fulgurant, perpendiculaire au coup ; le
        // coup ne trouve qu'une image fantôme.
        { id: "jeu-esquive", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o), v = axe(a, D);
            const px = -v.uy * a.t * 0.7, py = v.ux * a.t * 0.7;
            o.son("esquive");
            o.texte(sc.calque, sc.lanceur, sc.texte || "Esquivé 💨", COULEURS.neutre);
            o.fantome(sc.calque, sc.lanceur, a, { opacite: 0.55, duree: 650 });
            const trait = o.poser(sc.calque, a.x, a.y, `width:${a.t * 1.3}px; height:4px; z-index:${Z.haut}; border-radius:2px;
                background:linear-gradient(90deg, transparent, #fff, transparent); transform:translate(-50%,-50%) rotate(${deg(v.angle)}deg);`);
            await Promise.all([o.bouger(sc.lanceur, [{ transform: "translate(0,0)" }, { transform: `translate(${px}px, ${py}px) skewX(-10deg)`, offset: 0.25 },
                                                      { transform: `translate(${px}px, ${py}px)`, offset: 0.7 }, { transform: "translate(0,0)" }],
                                       { duration: 820, easing: "cubic-bezier(.2,.9,.3,1)" }),
                o.jouerPuisRetirer(trait, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 400, delay: 120 })]);
        } },
        // LA PARADE : un arc d'acier doré se lève côté attaquant, le coup y
        // claque dans une gerbe d'étincelles, le pion tient bon.
        { id: "jeu-parade", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o), v = axe(a, D);
            o.son("parade");
            const contact = { x: a.x + v.ux * a.t * 0.55, y: a.y + v.uy * a.t * 0.55, t: a.t };
            const arc = o.poser(sc.calque, contact.x, contact.y, `width:${a.t * 0.35}px; height:${a.t * 1.1}px; z-index:${Z.haut};
                border-radius:50%; border-right:6px solid #ffe9a0; filter:drop-shadow(0 0 8px #ffd700);`);
            arc.classList.add("anim-parade");
            o.texte(sc.calque, sc.lanceur, sc.texte || "Paré !", COULEURS.neutre);
            await Promise.all([o.jouerPuisRetirer(arc, [{ transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(0.4)`, opacity: 0 },
                                                        { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(1.1)`, opacity: 1, offset: 0.25 },
                                                        { transform: `translate(-50%,-50%) rotate(${deg(v.angle)}deg) scale(1)`, opacity: 0 }], { duration: 650 }),
                o.gerbe(sc.calque, contact.x, contact.y, { nombre: 12, dist: a.t * 0.7, angle: v.angle, eventail: Math.PI * 1.2, couleurs: ["#fff6c0", "#ffd700"], taille: 4, duree: 500 }),
                o.secouer(sc.lanceur, a.t * 0.04, 250, axe(D, a))]);
        } },
        // LE CONTRE : celui qui contre (sc.cible) rend une part du coup d'un
        // revers doré ; c'est l'attaquant (le pion) qui l'encaisse.
        { id: "jeu-contre", async jouer(sc, o) {
            if (!sc.cible) return;
            const a = centre(sc.lanceur, sc.calque), b = centre(sc.cible, sc.calque), v = axe(b, a);
            o.son("parade");
            o.texte(sc.calque, sc.cible, "Contre !", COULEURS.bouclier);
            o.gerbe(sc.calque, b.x + v.ux * b.t * 0.5, b.y + v.uy * b.t * 0.5, { nombre: 8, dist: b.t * 0.5, angle: v.angle, eventail: Math.PI,
                                                                             couleurs: ["#fff6c0", "#ffd700"], taille: 4, duree: 450 });
            const elan = o.elan(sc.cible, b, a, { portee: 0.35, duree: 320, frappe: 0.5 });
            await o.attendre(160);
            await Promise.all([elan, entaille(o, sc.calque, a, v.angle, { taille: 1.1, couleur: "#ffe9a0", lueur: "#ffd700", lueur2: "#ffb000" }),
                coupRecu(o, sc.calque, sc.lanceur, b, {})]);
        } },
        // L'ABSORPTION : l'aura du pion avale le sort dans un tourbillon
        // vert-violet ; une part s'éteint, une part le soigne (le chiffre suit).
        { id: "jeu-absorption", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("absorption");
            o.texte(sc.calque, sc.lanceur, "Absorbé", COULEURS.bouclier);
            await Promise.all([o.aura(sc.calque, a, { couleur: "#7dffb0", taille: 1.3, tourne: 360, pulsations: 2, duree: 1000, trait: "dashed" }),
                rassembler(o, sc.calque, a, { couleur: "#b8ffd0", n: 10, duree: 500, rayon: 0.9 }),
                o.eclat(sc.lanceur, "brightness(1.4) drop-shadow(0 0 10px #7dff9a)", 800)]);
        } },
        // LE BOUCLIER MAGIQUE ENCAISSE : le dôme cyan reçoit le coup, une onde
        // court sur sa paroi au point d'impact, il vacille.
        { id: "jeu-bouclier-encaisse", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o), v = axe(a, D);
            const d = dome(o, sc.calque, a);
            d.classList.add("anim-dome");
            await o.attendre(260);
            o.son("bouclier-impact");
            const contact = { x: a.x + v.ux * a.t * 0.7, y: a.y + v.uy * a.t * 0.7, t: a.t * 0.6 };
            await Promise.all([o.onde(sc.calque, contact, { couleur: "#e8ffff", taille: 0.8, duree: 500, echelle: 1.8 }),
                o.teinter(d, [{ opacity: 1 }, { opacity: 0.35, offset: 0.2 }, { opacity: 1, offset: 0.45 }, { opacity: 0.6, offset: 0.7 }, { opacity: 1 }], { duration: 600 })]);
            await o.effacer(d, { echelle: 1.2 });
        } },
        // LE BOUCLIER MAGIQUE SE BRISE : le dôme se fissure, puis vole en éclats
        // de verre cyan.
        { id: "jeu-bouclier-brise", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o);
            const d = dome(o, sc.calque, a, { contenu: `<svg viewBox="0 0 100 100" width="100%" height="100%" class="fissures" style="opacity:0">
                <path d="M50 50 L22 18 M50 50 L84 30 M50 50 L70 88 M50 50 L18 66 M36 34 L28 40 M70 40 L78 50" stroke="#ffffff" stroke-width="2.5" fill="none"/></svg>` });
            d.classList.add("anim-dome");
            await o.attendre(260);
            o.son("bouclier-impact");
            await o.teinter(d.querySelector(".fissures"), [{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "forwards" });
            await o.attendre(120);
            o.son("bris-verre");
            o.texte(sc.calque, sc.lanceur, "Bouclier brisé !", COULEURS.bouclier);
            d.remove();
            await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 22, dist: a.t * 1.3, couleurs: ["#e8ffff", "#5be8ff", "#a0f5ff"], taille: 9, tailleMin: 4, carre: true, duree: 800 }),
                o.secouer(sc.lanceur, a.t * 0.06, 300, axe(D, a))]);
        } },
        // LE BOUCLIER MAGIQUE SE POSE : un dôme cyan se referme sur le pion,
        // pulse, puis se dissipe (le « +N 🛡️ » est celui de l'étape).
        { id: "jeu-bouclier-cree", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("bouclier");
            const d = dome(o, sc.calque, a);
            d.classList.add("anim-dome");
            await o.teinter(d, [{ opacity: 1, filter: "brightness(1)" }, { opacity: 0.85, filter: "brightness(1.5)", offset: 0.4 }, { opacity: 1, filter: "brightness(1)" }],
                            { duration: 900 });
            await o.effacer(d, { echelle: 1.25 });
        } },
        // LA MISE À TERRE : frappé, il vacille, s'effondre à l'opposé du coup et
        // pâlit — et il y reste : le plateau le retire juste après.
        { id: "jeu-mise-a-terre", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), D = sourceDuCoup(sc, o);
            const loin = axe(D, a), tourne = loin.ux >= 0 ? 80 : -80;
            o.son("coup-sourd");
            o.son("chute", 650);
            o.attendre(650).then(() => o.texte(sc.calque, sc.lanceur, "À terre !", COULEURS.degats, { taille: 26 }));
            await o.bouger(sc.lanceur, [
                { transform: "translate(0,0) rotate(0deg)", filter: "none", opacity: 1 },
                { transform: `translate(${loin.ux * a.t * 0.06}px, ${loin.uy * a.t * 0.06}px) rotate(${tourne * 0.1}deg)`, offset: 0.25 },
                { transform: `translate(${-loin.ux * a.t * 0.04}px, ${-loin.uy * a.t * 0.04}px) rotate(${-tourne * 0.08}deg)`, offset: 0.45 },
                { transform: `translate(${loin.ux * a.t * 0.22}px, ${loin.uy * a.t * 0.22 + a.t * 0.08}px) rotate(${tourne}deg) scale(0.92)`, filter: "grayscale(1) brightness(0.6)", opacity: 0.55, offset: 0.8 },
                { transform: `translate(${loin.ux * a.t * 0.22}px, ${loin.uy * a.t * 0.22 + a.t * 0.08}px) rotate(${tourne}deg) scale(0.92)`, filter: "grayscale(1) brightness(0.6)", opacity: 0 }
            ], { duration: 1500, easing: "ease-in-out", fill: "forwards" });
            // Il ne se relève pas : invisible jusqu'au redessin qui le retire.
            if (!o.annulee()) sc.lanceur.style.opacity = "0";
            await o.attendre(200);
        } },
        // L'ILLUSION BRISÉE : le leurre éclate comme du verre, en éclats irisés.
        { id: "jeu-illusion-brisee", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("bris-verre");
            o.son("illusion", 120);
            o.texte(sc.calque, sc.lanceur, "Illusion brisée", "#c9a8ff");
            await Promise.all([o.bouger(sc.lanceur, [{ transform: "scale(1)", opacity: 1, filter: "none" }, { transform: "scale(1.3)", opacity: 0, filter: ILLUSION }],
                                        { duration: 260, fill: "forwards" }),
                o.gerbe(sc.calque, a.x, a.y, { nombre: 20, dist: a.t * 1.2, couleurs: ["#e8d8ff", "#9fd8ff", "#ffffff"], taille: 8, tailleMin: 3, carre: true, duree: 800 })]);
            if (!o.annulee()) sc.lanceur.style.opacity = "0";
            await o.attendre(200);
        } },
        // LE SOIN : une lueur verte monte du sol, des « + » s'élèvent.
        { id: "jeu-soin", async jouer(sc, o) {
            o.son("soin");
            await lueurSoin(o, sc.calque, sc.lanceur, {});
        } },
        // UNE PART DE SOIN ÉTALÉ (fin de manche) : le sceau vert pulse sous le pion.
        { id: "jeu-soin-tic", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("soin-tic");
            const s = sceau(o, sc.calque, a, "#7dff9a", { duree: 900, tours: 120 });
            s.classList.add("anim-sceau-soin");
            await Promise.all([o.teinter(s, [{ filter: "brightness(1)" }, { filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 500 }),
                o.eclat(sc.lanceur, "brightness(1.35) drop-shadow(0 0 8px #7dff9a)", 500)]);
            await o.effacer(s);
        } },
        // LE SOIN DE ZONE : les cases de la zone fleurissent de vert et pulsent
        // (chaque soigné a ensuite sa lueur, à son étape).
        { id: "jeu-soin-zone", async jouer(sc, o) {
            const pts = (sc.cases || []).map(c => pointDe(o, sc, c));
            if (!pts.length) return;
            o.son("soin-zone");
            const cases = pts.map((pt, i) => o.hexagone(sc.calque, pt, { fond: FONDS_ZONE.soin, opacite: 0.7, retard: i * 50 }));
            cases.forEach(c => c.classList.add("anim-case-soin"));
            await o.attendre(300);
            await o.pulser(cases, { duree: 500, fois: 2, eclat: 1.3, decale: 30 });
            await effacerTout(o, cases);
        } },
        // LE SOIN ÉTALÉ, POSÉ : un sceau vert se pose sous chaque soigné ; il
        // rendra une part du soin à chaque fin de manche.
        { id: "jeu-soin-etale", async jouer(sc, o) {
            const cibles = (sc.cibles || []).length ? sc.cibles : [sc.lanceur];
            o.son("soin");
            const sceaux = cibles.map(el => {
                const s = sceau(o, sc.calque, centre(el, sc.calque), "#7dff9a", { duree: 1600, tours: 220 });
                s.classList.add("anim-sceau-soin");
                o.texte(sc.calque, el, "Soin étalé", COULEURS.soin);
                return s;
            });
            await o.attendre(1300);
            await Promise.all(sceaux.map(s => o.effacer(s)));
        } },
        // LA PURIFICATION : une tache d'ombre colle au pion ; un éclat blanc
        // l'arrache vers le ciel, où elle se dissout en étincelles.
        { id: "jeu-purification", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const tache = o.poser(sc.calque, a.x, a.y, `width:${a.t * 0.9}px; height:${a.t * 0.9}px; border-radius:50%; z-index:${Z.haut};
                background:radial-gradient(circle, rgba(60,10,80,0.85), rgba(120,40,160,0.4) 60%, rgba(0,0,0,0) 75%);
                display:flex; align-items:center; justify-content:center; font-size:${a.t * 0.4}px;`, "☠️");
            tache.classList.add("anim-tache-purifiee");
            await o.surgir(tache, { duree: 350 });
            o.son("purification");
            await o.eclat(sc.lanceur, "brightness(1.8) drop-shadow(0 0 14px #ffffff)", 450);
            await Promise.all([
                o.teinter(tache, [{ transform: `${BASE} scale(1)`, opacity: 1 }, { transform: `${BASE} translate(0, ${-a.t * 0.8}px) scale(1.6)`, opacity: 0 }],
                          { duration: 700, easing: "ease-in", fill: "forwards" }),
                o.gerbe(sc.calque, a.x, a.y - a.t * 0.5, { nombre: 14, dist: a.t * 0.9, couleurs: ["#ffffff", "#fffbe0", "#e0d0ff"], taille: 5, duree: 800 })]);
            tache.remove();
        } },
        // LES BÉNÉDICTIONS DE L'ÉQUIPEMENT DE SOIN : un sceau, une aura, un
        // emblème qui s'élève — bleu-violet (résistance magique), acier doré
        // (résistance physique), rouge-orangé (dégâts).
        { id: "jeu-benediction-magique", async jouer(sc, o) { await benir(o, sc, "#8fa8ff", "✦", "+ Résistance magique"); } },
        { id: "jeu-benediction-physique", async jouer(sc, o) { await benir(o, sc, "#e0c070", "🛡️", "+ Résistance physique"); } },
        { id: "jeu-benediction-offensive", async jouer(sc, o) { await benir(o, sc, "#ff8050", "⚔️", "+ Dégâts"); } },
        // LE REPOS LONG : le pion s'apaise et respire lentement, quelques « z »
        // s'envolent, puis l'énergie remonte en paillettes dorées.
        { id: "jeu-repos-long", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("repos");
            teinte(o, sc.lanceur, "brightness(0.82) saturate(0.8)", 400);
            [0, 300, 600].forEach((d, i) => o.icone(sc.calque, a, "💤", { dx: a.t * (0.25 + i * 0.12), dy: -a.t * (0.5 + i * 0.12), taille: 0.3 + i * 0.06, duree: 1000, retard: d }));
            await o.bouger(sc.lanceur, [{ transform: "scale(1)" }, { transform: "scale(0.95)" }, { transform: "scale(1)" }], { duration: 700, iterations: 2, easing: "ease-in-out" });
            deteindre(o, sc.lanceur, "brightness(0.82) saturate(0.8)");
            o.son("energie");
            energieEnJeu(o, sc);
            await o.gerbe(sc.calque, a.x, a.y + a.t * 0.2, { nombre: 14, dist: a.t * 0.4, monte: a.t * 0.9, couleurs: ["#fbf5bd", "#e2c46a", "#ffd700"], taille: 6, duree: 1000, etale: 400 });
        } },
        // LA RÉGÉNÉRATION DE FIN DE MANCHE : quelques paillettes dorées
        // remontent, la jauge d'énergie se remplit d'un cran.
        { id: "jeu-regen-energie", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("energie");
            energieEnJeu(o, sc);
            await o.gerbe(sc.calque, a.x, a.y + a.t * 0.2, { nombre: 8, dist: a.t * 0.35, monte: a.t * 0.7, couleurs: ["#fbf5bd", "#e2c46a"], taille: 5, duree: 900, etale: 300 });
        } },
        // LA DÉPENSE D'ÉNERGIE D'UNE COMPÉTENCE : l'énergie s'échappe du pion en
        // éclats jaunes et la jauge baisse.
        { id: "jeu-depense-energie", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("depense");
            energieEnJeu(o, sc);
            await Promise.all([o.gerbe(sc.calque, a.x, a.y, { nombre: 12, dist: a.t * 0.9, couleurs: ["#fbf5bd", "#e2c46a", "#c2a878"], taille: 5, duree: 700 }),
                o.eclat(sc.lanceur, "brightness(0.8) saturate(0.7)", 600)]);
        } },

        // =================================================================
        //  LA LISTE DE LA v242 (Nico : « poussée, traction magique, peur,
        //  provocation, confus s'enfuit, immobilisation, empoisonnement,
        //  brûlé, glacé, électrifié, aveuglé, étourdi / immobilisation /
        //  confusion / peur présence, étalement, plaie rouverte, repli : tu
        //  peux implanter c'est bon »). Ici `sc.lanceur` est le pion qui SUBIT
        //  (poussé, effrayé, provoqué, empoisonné…) et `sc.cible` qui en est la
        //  source (qui pousse, effraie, provoque) quand elle est connue. Un état
        //  posé par une attaque : sur la cible seule — l'attaque a eu son geste
        //  et ses dégâts. Un tic : son geste, le chiffre reste à l'étape.
        // =================================================================
        // LA POUSSÉE : l'élan d'épaule de qui pousse, l'onde sur le poussé, qui
        // file d'un trait le long de ses cases dans un nuage de poussière.
        // Rien ne bouge (un obstacle) : le choc seul.
        { id: "jeu-poussee", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), pousseur = sourceDe(sc);
            const pts = casesEntre(sc.de, sc.vers).map(c => pointDe(o, sc, c));
            let elan = null;
            if (pousseur) {
                elan = o.elan(pousseur, centre(pousseur, sc.calque), a, { portee: 0.45, duree: 460 });
                await o.attendre(250);
            }
            o.son("poussee");
            o.onde(sc.calque, a, { couleur: "rgba(236,226,200,0.9)", taille: 0.9, echelle: 1.9, bord: 3, duree: 520 });
            o.texte(sc.calque, sc.lanceur, "Poussé !", COULEURS.etat);
            if (!pts.length) {
                await Promise.all([elan, o.secouer(sc.lanceur, a.t * 0.06, 300, pousseur ? axe(centre(pousseur, sc.calque), a) : undefined)]);
                return;
            }
            await glisser(o, sc.lanceur, a, pts, { duree: 320 + 160 * pts.length, courbe: ralentir, trainee: (pt) => traineePoussiere(o, sc.calque, pt) });
            if (elan) await elan;
            await o.arriver(sc.lanceur, pts[pts.length - 1], { sinonRentrer: false });
        } },
        // LA TRACTION MAGIQUE : des filets d'air naissent derrière le tiré et
        // filent vers qui tire, qui les avale ; le tiré est aspiré d'un trait,
        // en accélérant, jusqu'à sa case.
        { id: "jeu-traction", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), tireur = sourceDe(sc);
            const pts = casesEntre(sc.de, sc.vers).map(c => pointDe(o, sc, c));
            if (!tireur && !pts.length) return;
            const T = tireur ? centre(tireur, sc.calque) : pts[pts.length - 1];
            o.son("traction");
            if (tireur) {
                o.texte(sc.calque, tireur, "Traction !", COULEURS.etat);
                o.bouger(tireur, [{ transform: "scale(1)" }, { transform: "scale(1.06)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 700 });
            }
            const air = Promise.all([tireur ? aspiration(o, sc.calque, T, { duree: 600 }) : null,
                                     filetsDAir(o, sc.calque, a, T, { n: 10, duree: 640, etale: 520 })]);
            await o.attendre(260);
            if (!pts.length) { await Promise.all([air, o.secouer(sc.lanceur, 3, 220, axe(a, T))]); return; }
            const arrivee = pts[pts.length - 1];
            await glisser(o, sc.lanceur, a, pts, { duree: 260 + 170 * pts.length, courbe: accelerer,
                                                   trainee: (pt) => traineePoussiere(o, sc.calque, pt) });
            await o.arriver(sc.lanceur, arrivee, { sinonRentrer: false });
            await Promise.all([air, o.secouer(sc.lanceur, 3, 220, axe(arrivee, T))]);
        } },
        // L'EFFROI (juste avant la fuite) : qui effraie grandit et se teinte de
        // mauve foncé ; l'effrayé rapetisse en tremblant, verdit, trois traits
        // rouges de frayeur lui sautent au coin de la tête, une aura sombre
        // frémit autour de lui (la présence de la Peur, sans smiley). La
        // fuite, case par case, suit (jeu-pas-peur).
        { id: "jeu-peur", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), source = sourceDe(sc);
            o.son("peur");
            if (source) {
                const s = centre(source, sc.calque);
                o.bouger(source, [{ transform: "scale(1)" }, { transform: "scale(1.22)", offset: 0.3 }, { transform: "scale(1.22)", offset: 0.7 }, { transform: "scale(1)" }],
                         { duration: 1800, easing: "ease-in-out" });
                o.teinter(source, [{ filter: "none" }, { filter: MAUVE_SOMBRE, offset: 0.3 }, { filter: MAUVE_SOMBRE, offset: 0.7 }, { filter: "none" }], { duration: 1900 });
                o.gerbe(sc.calque, s.x, s.y, { nombre: 10, dist: s.t * 0.75, couleurs: ["#3a1850", "#6a3a8a"], taille: 10, tailleMin: 5, duree: 900, etale: 250 });
                await o.attendre(380);
            }
            etat(o, sc.calque, sc.lanceur, "Peur !");
            teinteTenue(sc.lanceur, VERT_PEUR, 3000);
            const frayeur = traitsDeFrayeur(o, sc.calque, a, { duree: 1050 });
            const aura = o.aura(sc.calque, a, { couleur: "#3a2050", fond: "radial-gradient(circle, rgba(40,10,60,0) 50%, rgba(40,10,60,0.5) 80%)", pulsations: 2, duree: 1200 });
            await o.bouger(sc.lanceur, [{ transform: "scale(1) translate(0,0)" }, { transform: "scale(0.82) translate(0,0)", offset: 0.22 },
                                        { transform: "scale(0.82) translate(2px,-1px)", offset: 0.4 }, { transform: "scale(0.82) translate(-2px,1px)", offset: 0.55 },
                                        { transform: "scale(0.82) translate(1px,0)", offset: 0.7 }, { transform: "scale(0.84) translate(0,0)", offset: 0.85 },
                                        { transform: "scale(1) translate(0,0)" }], { duration: 950, easing: "ease-out" });
            await Promise.all([frayeur, aura]);
        } },
        // LA PROVOCATION : un anneau rouge part de qui provoque, un « ❗ »
        // éclate sur le provoqué, qui vacille.
        { id: "jeu-provocation", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), source = sourceDe(sc);
            o.son("provocation");
            if (source) {
                o.onde(sc.calque, centre(source, sc.calque), { couleur: "#ff4040", taille: 1, duree: 700, echelle: 2.6, bord: 4 });
                await o.attendre(300);
            }
            o.icone(sc.calque, a, "❗", { duree: 1400, lueur: "#ff4040" });
            etat(o, sc.calque, sc.lanceur, "Provoqué !");
            await o.bouger(sc.lanceur, [{ transform: "rotate(0deg)" }, { transform: "rotate(-14deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(0deg)" }], { duration: 600 });
            await o.attendre(300);
        } },
        // LE CONFUS S'ENFUIT : un « ❗ » violet éclate au-dessus de lui, le mot,
        // sa teinte violette — puis sa course folle (jeu-pas-confusion).
        { id: "jeu-confusion-fuite", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("confusion");
            o.icone(sc.calque, a, "❗", { duree: 1200, lueur: "#c9a8ff" });
            await o.attendre(450);
            o.texte(sc.calque, sc.lanceur, sc.texte || "Confus : s'enfuit !", sc.couleur || "#cc66ff");
            teinteTenue(sc.lanceur, VIOLET, 2500);
            await o.attendre(350);
        } },
        // L'IMMOBILISATION : des chaînes jaillissent du sol de tous côtés et se
        // referment sur lui ; il tire dessus (vers qui l'a enchaîné), en vain.
        { id: "jeu-immobilisation", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque), source = sourceDe(sc);
            const v = source ? axe(a, centre(source, sc.calque)) : o.tourner({ ux: 1, uy: 0, d: 1, angle: 0 }, hasard(0, Math.PI * 2));
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
        } },
        // L'EMPOISONNEMENT POSÉ (après le geste de l'attaque) : le venin prend
        // sur lui, il verdit par vagues sous des bulles toxiques.
        { id: "jeu-empoisonnement", async jouer(sc, o) {
            if (effetPoison) await effetPoison(o, sc.calque, sc.lanceur);
        } },
        // LE TIC DU POISON : sur l'énergie (la jauge baisse sous une vague
        // verte), puis sur les PV (des bulles ; le chiffre est à l'étape).
        { id: "jeu-poison-energie", async jouer(sc, o) {
            o.son("poison-bulles");
            energieEnJeu(o, sc);
            await o.teinter(sc.lanceur, [{ filter: "none" }, { filter: VERT, offset: 0.4 }, { filter: "none" }], { duration: 800 });
        } },
        { id: "jeu-poison-tic", async jouer(sc, o) {
            etat(o, sc.calque, sc.lanceur, "Poison");
            if (ticPoison) await ticPoison(o, sc.calque, sc.lanceur);
        } },
        // BRÛLÉ (sur la cible seule) : il prend feu et rougeoie ; en fin de
        // manche, les flammes se ravivent.
        { id: "jeu-brule", async jouer(sc, o) {
            await effetBrule(o, sc.calque, sc.lanceur);
        } },
        { id: "jeu-brule-tic", async jouer(sc, o) {
            etat(o, sc.calque, sc.lanceur, "Brûlure");
            await ticBrule(o, sc.calque, sc.lanceur);
        } },
        // GLACÉ (sur la cible seule) : il se fige dans les cristaux et bleuit ;
        // le sol gèle sous lui un instant.
        { id: "jeu-glace-pose", async jouer(sc, o) {
            if (effetGlace) await effetGlace(o, sc.calque, sc.lanceur);
        } },
        // ÉLECTRIFIÉ (sur la cible seule) : de petits arcs courent sur lui, il clignote.
        { id: "jeu-electrifie", async jouer(sc, o) {
            await effetElectrifie(o, sc.calque, sc.lanceur);
        } },
        // AVEUGLÉ : l'obscurité se referme depuis les bords et s'arrête à quatre
        // cases de lui ; ses yeux se voilent. (Le noir qui reste, lui, n'est vu
        // que par l'aveuglé.)
        { id: "jeu-aveugle", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("aveugle");
            o.icone(sc.calque, a, "🌑", { duree: 1600 });
            etat(o, sc.calque, sc.lanceur, sc.texte || "Aveuglé : 4 cases");
            const vision = o.pasHex(a) * 4.3;
            const limite = o.poser(sc.calque, a.x, a.y, `width:${vision * 2}px; height:${vision * 2}px; border-radius:50%; z-index:${Z.haut};
                border:2px dashed rgba(255,255,255,0.55);`);
            o.jouerPuisRetirer(limite, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2400 });
            await Promise.all([o.brouillard(sc.calque, a, vision, { duree: 2400, noir: 0.88 }),
                o.teinter(sc.lanceur, [{ filter: "none" }, { filter: "brightness(0.6) blur(1px)", offset: 0.2 }, { filter: "brightness(0.6) blur(1px)", offset: 0.8 }, { filter: "none" }], { duration: 2000 })]);
        } },
        // LES ÉTATS QUI DURENT, au début de son tour : les étoiles de l'Étourdi,
        // les « ? » de la Confusion.
        { id: "jeu-etourdi-presence", async jouer(sc, o) {
            await presenceEtourdi(o, sc.calque, sc.lanceur);
        } },
        { id: "jeu-confusion-presence", async jouer(sc, o) {
            await presenceConfusion(o, sc.calque, sc.lanceur);
        } },
        // L'IMMOBILISATION, à chaque fin de manche : l'anneau de chaînes reste
        // au sol, il pulse, et l'énergie bouge (la vraie : sa barre, son chiffre).
        { id: "jeu-immobilisation-presence", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            const anneau = o.poser(sc.calque, a.x, a.y, `width:${a.t * 1.2}px; height:${a.t * 1.2}px; border-radius:50%; z-index:${Z.sol};
                border:5px dotted #8a8a8a; box-shadow:0 0 8px #444;`);
            o.surgir(anneau);
            o.icone(sc.calque, a, "⛓️", { duree: 1600 });
            etat(o, sc.calque, sc.lanceur, "Immobilisé");
            await o.attendre(600);
            o.son("chaines");
            o.teinter(anneau, [{ filter: "brightness(1)" }, { filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 500 });
            energieEnJeu(o, sc);
            await o.attendre(1000);
            await o.effacer(anneau);
        } },
        // LE TIC DE L'ÉTALEMENT : le sceau sous lui pulse et lâche sa part.
        { id: "jeu-etalement-tic", async jouer(sc, o) {
            await pulsationEtalement(o, sc.calque, sc.lanceur);
        } },
        // LA PLAIE ROUVERTE (une blessure) : un trait rouge, des gouttes, il
        // accuse le coup.
        { id: "jeu-plaie-rouverte", async jouer(sc, o) {
            const a = centre(sc.lanceur, sc.calque);
            o.son("saignement");
            etat(o, sc.calque, sc.lanceur, "Plaie rouverte");
            await Promise.all([entaille(o, sc.calque, a, hasard(0, Math.PI), { couleur: "#e02030", lueur: "#ff4050", lueur2: "#a00010", taille: 1.2, duree: 600 }),
                o.secouer(sc.lanceur, a.t * 0.05, 360),
                o.eclat(sc.lanceur, ROUGE, 460),
                o.gerbe(sc.calque, a.x, a.y + a.t * 0.1, { nombre: 7, dist: a.t * 0.35, couleurs: ["#b0101c", "#e03040"], taille: 5, duree: 700 })]);
        } },
        // LE REPLI (état d'un tour) : son contour bleuté, sans émoticône.
        { id: "jeu-repli-etat", async jouer(sc, o) {
            await contourRepli(o, sc.calque, sc.lanceur);
        } }
    ]);
})();
