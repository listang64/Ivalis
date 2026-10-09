// =========================================================================
//  IVALIS — LES ANIMATIONS DE COMBAT (le catalogue du Studio d'animation)
// =========================================================================
//  Nico : « dans les paramètres, un bouton Studio d'animation : à gauche la
//  réplique de la carte du combat, mon pion sur un hexagone central et un
//  ennemi inerte à côté ; à droite la liste des futures animations de combat
//  que nous allons créer. Un clic sur une animation la joue en direct sur mon
//  pion. » Puis : « quand on jouera une animation, il y aura du son aussi ; et
//  l'animation sera toujours sur le pion joueur et en direction de l'ennemi. »
//
//  CE FICHIER EST LE CATALOGUE, ET RIEN QUE LUI. Une animation est une
//  fonction `jouer(scene, outils)` qui rend une promesse :
//    • scene.lanceur : LE PION QUI AGIT — celui du joueur, toujours ;
//    • scene.cible   : celui vers qui il agit (l'ennemi) : tout ce qui a une
//      direction (l'élan, le projectile, le recul, la chute) se calcule sur
//      l'axe lanceur → cible, au moment de jouer — déplacez les pions, la
//      direction suit ;
//    • scene.calque  : où poser les effets, dans le repère des pions ;
//    • outils : poser, son, attendre, gerbe, onde… liés à CETTE lecture : une
//      lecture interrompue (une autre animation lancée, le studio fermé) ne
//      pose plus rien et ne joue plus aucun son.
//  Les pions sont posés par leur centre (`translate(-50%, -50%)`, comme les
//  `.token-vtt` du plateau) : le jour où une animation est intégrée, le
//  combat l'appelle sur ses vrais pions avec le même code.
//
//  Les sons sont fabriqués sur place (fabrique_sons.js, SONS_COMBAT) et
//  suivent le volume du jeu.
//
//  Script simple (pas un module) : chargé tel quel par la page et par les bancs.
// =========================================================================

(function () {
    // Les pions sont posés par leur centre : toute transformation garde ce
    // décalage, sinon le pion sauterait d'un demi-pion en bas à droite.
    const BASE = "translate(-50%, -50%)";
    const fini = (a) => a.finished.catch(() => {});
    const hasard = (a, b) => a + Math.random() * (b - a);
    // LA VITESSE DE LECTURE (1 : normale). Le Studio la baisse pour le ralenti,
    // les bancs la montent pour tout jouer vite ; toutes les durées passent par
    // elle (animations, pauses, sons différés).
    const vitesse = () => Math.max(0.05, Number(window.VITESSE_ANIMATIONS) || 1);
    // LES ÉTAGES, vus de dessus : les pions sont à 10-11 (studio, plateau). Le
    // sol (zones, ombres, runes) passe dessous, le ciel (éclats, icônes,
    // projectiles) au-dessus.
    const Z = { sol: 2, bas: 5, haut: 14, ciel: 20 };
    const VOISINS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const ROUGE = "sepia(1) saturate(7) hue-rotate(-45deg) brightness(1.05)";
    // Les couleurs des textes du combat (COULEURS, pont_combat.js) ; l'état
    // posé, en violet, comme les zones persistantes (moteur_effets.js).
    const COULEURS = { degats: "#ff4c4c", bouclier: "#00ffff", soin: "#1b6e3a", neutre: "#cccccc",
                       attention: "#ffaa00", critique: "#ff2d2d", etat: "#9333ea" };

    // Le centre d'un pion dans le repère du calque, et sa taille à l'écran.
    function centre(el, calque) {
        const r = el.getBoundingClientRect(), c = calque.getBoundingClientRect();
        return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2, t: r.width || 60 };
    }
    // L'axe lanceur → cible : la direction (unitaire) et la distance.
    function axe(a, b) {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        return { ux: dx / d, uy: dy / d, d, angle: Math.atan2(dy, dx) };
    }

    // =====================================================================
    //  LES OUTILS D'UNE LECTURE
    // =====================================================================
    //  Fabriqués pour chaque lecture, autour d'un jeton : une fois la lecture
    //  annulée, `poser` ne pose plus rien dans la scène, `son` se tait, et
    //  `attendre` rend la main tout de suite — l'animation se termine à vide,
    //  sans rien laisser derrière elle.
    function outils(jeton, scene) {
        const o = {};
        o.annulee = () => jeton.annule;
        o.attendre = (ms) => new Promise(r => {
            if (jeton.annule) return r();
            const t = setTimeout(() => { jeton.minuteurs.delete(t); r(); }, ms / vitesse());
            jeton.minuteurs.add(t);
            jeton.reveils.add(r);
        });
        o.son = (id, retard) => {
            if (jeton.annule) return;
            const t = setTimeout(() => {
                jeton.minuteurs.delete(t);
                if (!jeton.annule && typeof window.jouerSonCombat === "function") window.jouerSonCombat(id);
            }, (retard || 0) / vitesse());
            jeton.minuteurs.add(t);
            if (typeof window.__sonsCombatDemandes === "object") window.__sonsCombatDemandes.push(id);
        };
        // Toute animation lancée par cette lecture est suivie : à la fin, ce
        // qui tient encore (fill) est annulé et les pions reviennent tels quels.
        const lancer = (el, images, options) => {
            const opt = { ...(options || {}) };
            if (opt.duration) opt.duration = opt.duration / vitesse();
            if (opt.delay) opt.delay = opt.delay / vitesse();
            const an = el.animate(images, opt);
            jeton.anims.add(an);
            return fini(an);
        };
        o.bouger = (el, images, options) => {
            if (!el || typeof el.animate !== "function" || jeton.annule) return Promise.resolve();
            return lancer(el, images.map(f => ({ ...f, transform: BASE + " " + (f.transform || "") })), options);
        };
        o.teinter = (el, images, options) => {
            if (!el || typeof el.animate !== "function" || jeton.annule) return Promise.resolve();
            return lancer(el, images, options);
        };
        // Un effet posé dans le calque, centré sur (x, y).
        o.poser = (calque, x, y, style, contenu) => {
            const d = document.createElement("div");
            d.className = "anim-effet";
            d.style.cssText = `position:absolute; left:${x}px; top:${y}px; transform:translate(-50%,-50%); pointer-events:none; ${style || ""}`;
            if (contenu) d.innerHTML = contenu;
            if (!jeton.annule) { calque.appendChild(d); jeton.poses.add(d); }
            return d;
        };
        o.jouerPuisRetirer = async (el, images, options) => { await o.teinter(el, images, options); el.remove(); };

        // Une gerbe de particules autour de (x, y).
        o.gerbe = (calque, x, y, g) => {
            const n = g.nombre || 10;
            const fins = [];
            for (let i = 0; i < n; i++) {
                const angle = (g.angle !== undefined ? g.angle : 0) + (g.eventail || Math.PI * 2) * (i / n - 0.5) + hasard(-0.2, 0.2);
                const dist = hasard(g.distMin || g.dist * 0.6, g.dist);
                const taille = hasard(g.tailleMin || 4, g.taille || 8);
                const p = o.poser(calque, x, y, `width:${taille}px; height:${taille}px; border-radius:${g.carre ? "2px" : "50%"};
                    background:${g.couleurs[i % g.couleurs.length]}; box-shadow:0 0 ${taille * 1.5}px ${g.couleurs[0]};`, g.texte || "");
                if (g.texte) { p.style.background = "none"; p.style.boxShadow = "none"; p.style.color = g.couleurs[i % g.couleurs.length];
                               p.style.fontWeight = "bold"; p.style.fontSize = taille + "px"; p.style.textShadow = `0 0 6px ${g.couleurs[0]}`; }
                const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist - (g.monte || 0);
                fins.push(o.jouerPuisRetirer(p, [
                    { transform: "translate(-50%,-50%) scale(0.4)", opacity: 0 },
                    { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35}px)) scale(1)`, opacity: 1, offset: 0.25 },
                    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0 }
                ], { duration: g.duree || 700, delay: (g.etale || 0) * Math.random(), easing: "cubic-bezier(.2,.7,.3,1)" }));
            }
            return Promise.all(fins);
        };
        // Une secousse : le coup qu'on encaisse. `sens` : l'axe du coup (le
        // pion recule dans cette direction), sinon une secousse sur place.
        o.secouer = (el, force, duree, sens) => {
            const ux = sens ? sens.ux : 1, uy = sens ? sens.uy : -0.3;
            const pas = (k) => `translate(${ux * force * k}px, ${uy * force * k}px)`;
            return o.bouger(el, [{ transform: "translate(0,0)" }, { transform: pas(1) }, { transform: pas(-0.6) }, { transform: pas(0.4) },
                                 { transform: pas(-0.2) }, { transform: "translate(0,0)" }], { duration: duree || 320 });
        };
        o.eclat = (el, filtre, duree) => o.teinter(el, [{ filter: "none" }, { filter: filtre, offset: 0.3 }, { filter: "none" }], { duration: duree || 420 });
        // LES TEXTES FLOTTANTS DU COMBAT, au-dessus des pions : le même dessin
        // que sur le plateau (afficherMessageFlottantHex, mouvement.js), posé
        // dans ce calque au-dessus du pion. Les couleurs sont celles du combat
        // (COULEURS, pont_combat.js).
        o.texte = (calque, pion, texte, couleur, options) => {
            if (jeton.annule || !pion) return null;
            const c = centre(pion, calque);
            if (typeof window.afficherMessageFlottantHex !== "function") return null;
            const msg = window.afficherMessageFlottantHex(null, null, texte, couleur || COULEURS.degats,
                { ...(options || {}), ecran: { conteneur: calque, x: c.x, y: c.y, cle: "anim-" + (pion.id || "pion") } });
            if (msg && msg.classList) msg.classList.add("anim-message");
            return msg;
        };
        // Le chiffre, l'éclat et la petite barre qui se vide sous le pion :
        // afficherFlashDegatToken (moteur_effets.js), comme pour un vrai coup.
        o.jauge = (calque, pion, de, vers, max, texte, couleurTexte, couleurBarre) => {
            if (jeton.annule || !pion) return;
            o.texte(calque, pion, texte, couleurTexte);
            if (typeof window.afficherFlashDegatToken === "function") {
                // Sans `ecran` : l'éclat et la barre seulement, le texte vient d'être posé.
                window.afficherFlashDegatToken(null, de, vers, max, texte, couleurTexte, couleurBarre, { pion });
                pion.querySelectorAll(".jauge-flash-token").forEach(j => j.classList.add("anim-message"));
            }
        };

        // Une onde qui s'élargit (le sol qui s'illumine, l'explosion).
        o.onde = (calque, pos, w) => {
            const d = o.poser(calque, pos.x, pos.y + (w.decalage || 0), `width:${pos.t * (w.taille || 1)}px; height:${pos.t * (w.taille || 1) * (w.aplati || 1)}px;
                border-radius:50%; border:${w.bord || 3}px solid ${w.couleur}; box-shadow:0 0 14px ${w.couleur}, inset 0 0 12px ${w.couleur};
                background:${w.fond || "transparent"};`);
            return o.jouerPuisRetirer(d, [
                { transform: "translate(-50%,-50%) scale(0.3)", opacity: 0.9 },
                { transform: `translate(-50%,-50%) scale(${w.echelle || 1.6})`, opacity: 0 }
            ], { duration: w.duree || 700, delay: w.retard || 0, easing: "ease-out" });
        };
        // UN PROJECTILE du lanceur vers la cible, en léger arc, avec une
        // traînée. `style` : son allure ; rend une promesse à l'arrivée.
        o.projectile = async (calque, a, b, p) => {
            const t = a.t * (p.taille || 0.45);
            const bille = o.poser(calque, a.x, a.y, `width:${t}px; height:${t}px; border-radius:${p.forme || "50%"}; z-index:4; ${p.style}`);
            const duree = p.duree || 520, arc = a.t * (p.arc === undefined ? 0.35 : p.arc);
            const rot = (p.oriente ? axe(a, b).angle * 180 / Math.PI : 0);
            const vol = o.teinter(bille, [
                { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0.6)` },
                { transform: `translate(calc(-50% + ${(b.x - a.x) * 0.5}px), calc(-50% + ${(b.y - a.y) * 0.5 - arc}px)) rotate(${rot}deg) scale(1)`, offset: 0.5 },
                { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) rotate(${rot}deg) scale(1.1)` }
            ], { duration: duree, easing: p.easing || "ease-in" });
            const traines = [];
            if (p.traine) for (let k = 1; k < 9; k++) {
                const f = k / 9, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f - Math.sin(Math.PI * f) * arc;
                traines.push(o.attendre(duree * f).then(() => o.gerbe(calque, x, y, { nombre: 2, dist: t * 0.6, couleurs: p.traine, taille: 5, duree: 450 })));
            }
            await vol;
            bille.remove();
            return Promise.all(traines);
        };
        // L'élan d'un coup au corps à corps, VERS la cible, borné : même un
        // ennemi loin, le héros ne bondit pas à travers la carte.
        o.elan = (lanceur, a, b, p) => {
            const v = axe(a, b);
            const portee = Math.min(v.d * 0.42, a.t * (p.portee || 0.6));
            const recul = a.t * 0.08;
            return o.bouger(lanceur, [
                { transform: "translate(0,0)" },
                { transform: `translate(${-v.ux * recul}px, ${-v.uy * recul}px) scale(1.03)`, offset: p.prise || 0.35 },
                { transform: `translate(${v.ux * portee}px, ${v.uy * portee}px) scale(${p.echelle || 1.08})`, offset: p.frappe || 0.6 },
                { transform: "translate(0,0)" }
            ], { duration: p.duree || 560, easing: p.easing || "cubic-bezier(.3,.7,.3,1)" });
        };
        ajouterOutilsDeScene(o, jeton, scene);
        return o;
    }

    // =====================================================================
    //  LES OUTILS DE LA SCÈNE (vue de dessus)
    // =====================================================================
    //  La carte est vue d'en haut : ce qui « monte » grossit (un bond, un objet
    //  qui s'élève), ce qui « tombe » rapetisse jusqu'au sol, et l'ombre reste
    //  au sol. La grille hexagonale (scene.grille, fournie par le Studio ou le
    //  combat) donne les cases : un pion marche de case en case, une zone
    //  couvre des hexagones entiers. Sans grille, tout se calcule à vue, sur
    //  la taille des pions.
    function ajouterOutilsDeScene(o, jeton, scene) {
        const g = (scene && scene.grille) || null;
        o.grille = g;
        o.Z = Z;
        o.caseDe = (el) => (g && el && typeof g.caseDe === "function") ? g.caseDe(el) : null;
        // La distance entre deux cases voisines, à l'écran.
        o.pasHex = (a) => {
            if (g) {
                const p0 = g.pixel(0, 0), p1 = g.pixel(1, 0);
                const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                if (d > 1) return d;
            }
            return ((a && a.t) || 60) * 1.12;
        };
        // Un hexagone à bords plats : 2 côtés de large, √3 côtés de haut.
        o.tailleHex = (a) => { const p = o.pasHex(a); return { l: p * 2 / Math.sqrt(3), h: p }; };
        const cle = (c) => c.q + "," + c.r;

        // LE CHEMIN : n cases, chacune la voisine libre la mieux alignée sur
        // la direction `v` (le pion contourne ce qui le gêne). `zigzag` brouille
        // la direction (une fuite désordonnée).
        o.chemin = (el, a, v, n, p = {}) => {
            const pts = [];
            const c0 = o.caseDe(el);
            if (g && c0) {
                let c = c0;
                const vues = new Set([cle(c0)]);
                for (let i = 0; i < n; i++) {
                    const pc = g.pixel(c.q, c.r);
                    const cands = VOISINS6.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }))
                        .filter(x => !vues.has(cle(x)) && (p.partout || !g.libre || g.libre(x.q, x.r)))
                        .map(x => {
                            const px = g.pixel(x.q, x.r), d = Math.hypot(px.x - pc.x, px.y - pc.y) || 1;
                            return { ...x, x: px.x, y: px.y,
                                     s: ((px.x - pc.x) * v.ux + (px.y - pc.y) * v.uy) / d + (p.zigzag ? hasard(-p.zigzag, p.zigzag) : 0) };
                        })
                        .sort((m, k) => k.s - m.s);
                    if (!cands.length) break;
                    c = cands[0];
                    vues.add(cle(c));
                    pts.push({ x: c.x, y: c.y, q: c.q, r: c.r, t: a.t });
                }
                if (pts.length) return pts;
            }
            const pas = o.pasHex(a);
            let x = a.x, y = a.y;
            for (let i = 0; i < n; i++) {
                const ang = Math.atan2(v.uy, v.ux) + (p.zigzag ? hasard(-p.zigzag, p.zigzag) * 0.8 : 0);
                x += Math.cos(ang) * pas; y += Math.sin(ang) * pas;
                pts.push({ x, y, t: a.t });
            }
            return pts;
        };
        // Une case voisine libre, la plus proche de la direction voulue.
        o.voisine = (el, a, v, p) => o.chemin(el, a, v, 1, p)[0]
            || { x: a.x + v.ux * o.pasHex(a), y: a.y + v.uy * o.pasHex(a), t: a.t };
        // Une direction tournée de `angle` radians.
        o.tourner = (v, angle) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            const ux = v.ux * c - v.uy * s, uy = v.ux * s + v.uy * c;
            return { ux, uy, d: v.d, angle: Math.atan2(uy, ux) };
        };
        // Les cases autour d'un pion, jusqu'à `rayon` cases (sans la sienne,
        // sauf `avecCentre`) ; `libres` : seulement les cases où l'on peut aller.
        o.autour = (el, a, rayon, p = {}) => {
            const c0 = o.caseDe(el);
            const pts = [];
            if (g && c0) {
                for (let dq = -rayon; dq <= rayon; dq++) {
                    for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
                        if (!dq && !dr && !p.avecCentre) continue;
                        const q = c0.q + dq, r = c0.r + dr;
                        if (g.existe && !g.existe(q, r)) continue;
                        if (p.libres && g.libre && !g.libre(q, r)) continue;
                        const px = g.pixel(q, r);
                        pts.push({ x: px.x, y: px.y, q, r, t: a.t, dist: Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) });
                    }
                }
                return pts;
            }
            const pas = o.pasHex(a);
            if (p.avecCentre) pts.push({ x: a.x, y: a.y, t: a.t, dist: 0 });
            for (let k = 1; k <= rayon; k++) {
                for (let i = 0; i < 6 * k; i++) {
                    const ang = (i / (6 * k)) * Math.PI * 2 + Math.PI / 6;
                    pts.push({ x: a.x + Math.cos(ang) * pas * k, y: a.y + Math.sin(ang) * pas * k, t: a.t, dist: k });
                }
            }
            return pts;
        };

        // UN PION QUI SE DÉPLACE, case après case : chaque pas reste acquis
        // (fill) jusqu'au retour (o.rentrer). `apresPas(point, i)` : ce qui se
        // passe à chaque case (poussière, givre, sang, son).
        o.parcourir = async (el, a, pts, p = {}) => {
            let prec = p.depuis ? { x: p.depuis.x - a.x, y: p.depuis.y - a.y } : { x: 0, y: 0 };
            for (let i = 0; i < pts.length; i++) {
                if (jeton.annule) break;
                const vers = { x: pts[i].x - a.x, y: pts[i].y - a.y };
                const mx = (prec.x + vers.x) / 2, my = (prec.y + vers.y) / 2;
                const tangue = p.tangue ? hasard(-p.tangue, p.tangue) : 0;
                const rot = p.rotation || 0;
                await o.bouger(el, [
                    { transform: `translate(${prec.x}px, ${prec.y}px) rotate(${rot}deg)` },
                    { transform: `translate(${mx}px, ${my}px) scale(${p.hauteur || 1.05}) rotate(${rot + tangue}deg)`, offset: 0.5 },
                    { transform: `translate(${vers.x}px, ${vers.y}px) rotate(${rot}deg)` }
                ], { duration: (p.duree || 360) * (p.rythme ? p.rythme(i) : 1), easing: p.easing || "ease-in-out", fill: "forwards" });
                prec = vers;
                if (p.apresPas) p.apresPas(pts[i], i);
            }
            return prec;
        };
        // Annuler ce que cette lecture a posé sur un élément (il revient tel quel).
        o.lacher = (el) => {
            jeton.anims.forEach(an => {
                if (an.effect && an.effect.target === el) { an.cancel(); jeton.anims.delete(an); }
            });
        };
        // ARRIVER POUR DE BON (Nico : « que ça fasse bouger le pion, qu'on
        // puisse voir l'animation en vraies conditions »). Un déplacement qui,
        // en combat, change la case du combattant le laisse sur sa nouvelle
        // case : la scène la lui donne (scene.poserPion), et l'animation qui
        // l'y a mené s'efface dans le même instant — pas de saut. Sans scène
        // capable de le poser (ni grille, ni case libre), il rentre chez lui.
        o.arriver = async (el, pt, p = {}) => {
            if (!el || jeton.annule) return false;
            const pose = !!(pt && pt.q !== undefined && scene && typeof scene.poserPion === "function" && scene.poserPion(el, pt.q, pt.r));
            if (pose) { o.lacher(el); return true; }
            if (p.sinonRentrer !== false) await o.rentrer(el);
            return false;
        };
        // L'ÉCHANGE DE PLACES (le Transfert) : chacun reste sur la case de l'autre.
        o.echanger = async (a, b) => {
            if (jeton.annule) return false;
            if (scene && typeof scene.echangerPions === "function" && scene.echangerPions()) { o.lacher(a); o.lacher(b); return true; }
            await Promise.all([o.rentrer(a), o.rentrer(b)]);
            return false;
        };
        // La distance en cases entre deux pions (ou null sans grille).
        o.distanceCases = (el1, el2) => {
            const c1 = o.caseDe(el1), c2 = o.caseDe(el2);
            if (!c1 || !c2) return null;
            const dq = c1.q - c2.q, dr = c1.r - c2.r;
            return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        };
        // Le retour du pion à sa case : il s'efface là où il est, et réapparaît
        // chez lui (une démonstration qui ne change pas de case).
        o.rentrer = async (el, p = {}) => {
            if (!el) return;
            await o.teinter(el, [{ opacity: 1 }, { opacity: 0 }], { duration: p.duree || 260, fill: "forwards" });
            o.lacher(el);
            await o.teinter(el, [{ opacity: 0 }, { opacity: 1 }], { duration: p.duree || 260 });
        };

        // UN FIGURANT : une copie d'un pion (un allié, un renfort, une illusion,
        // un zombie), posée sur une case le temps de l'animation.
        o.figurant = (calque, modele, pos, p = {}) => {
            if (!modele || jeton.annule) return null;
            const f = modele.cloneNode(true);
            f.removeAttribute("id");
            f.querySelectorAll("[id]").forEach(x => x.removeAttribute("id"));
            f.classList.add("anim-effet", "anim-figurant");
            f.classList.remove("studio-pion-saisi");
            f.style.left = pos.x + "px";
            f.style.top = pos.y + "px";
            f.style.transform = BASE;
            f.style.pointerEvents = "none";
            f.style.filter = p.filtre || "";
            f.style.opacity = p.opacite === undefined ? "1" : String(p.opacite);
            // Sa case à lui (pas celle du pion copié) : il peut marcher.
            if (pos.q !== undefined) { f.dataset.q = pos.q; f.dataset.r = pos.r; }
            else { delete f.dataset.q; delete f.dataset.r; }
            calque.appendChild(f);
            jeton.poses.add(f);
            return f;
        };
        // Un pion dessiné (le compagnon du Pisteur) : un médaillon et un emblème.
        o.pionDessine = (calque, pos, p = {}) => {
            const t = (pos.t || 60) * (p.taille || 0.92);
            const d = o.poser(calque, pos.x, pos.y, `width:${t}px; height:${t}px; border-radius:50%; z-index:10;
                display:flex; align-items:center; justify-content:center; font-size:${t * 0.56}px;
                background:${p.fond || "radial-gradient(circle at 40% 35%, #8a6a3a, #3a2a14)"}; border:3px solid ${p.bord || "#c9a24a"};
                box-shadow:0 3px 8px rgba(0,0,0,0.6);`, p.contenu || "🐺");
            if (pos.q !== undefined) { d.dataset.q = pos.q; d.dataset.r = pos.r; }
            return d;
        };
        // L'apparition et la disparition d'un élément posé.
        o.surgir = (el, p = {}) => o.teinter(el, [
            { transform: `${BASE} scale(${p.depart || 0.2})`, opacity: 0 },
            { transform: `${BASE} scale(${p.depasse || 1.12})`, opacity: 1, offset: 0.6 },
            { transform: `${BASE} scale(1)`, opacity: 1 }
        ], { duration: p.duree || 420, easing: "ease-out", fill: "forwards" });
        o.effacer = async (el, p = {}) => {
            if (!el) return;
            // Un élément du terrain (une nappe, un tas de gravats) n'est pas centré
            // par translate(-50%,-50%) : il rétrécit sur place.
            const base = el.dataset && el.dataset.ancre === "libre" ? "" : BASE;
            await o.teinter(el, [{ opacity: 1, transform: `${base} scale(1)` }, { opacity: 0, transform: `${base} scale(${p.echelle || 1})` }],
                            { duration: p.duree || 400, fill: "forwards" });
            if (p.garder !== true) el.remove();
        };
        // SUIVRE un élément posé ailleurs que dans le calque (une nappe sur la
        // carte du Studio) : il disparaît avec le reste à la fin de la lecture.
        o.suivre = (el) => {
            if (!el) return el;
            if (jeton.annule) { el.remove(); return el; }
            jeton.poses.add(el);
            return el;
        };
        // La silhouette laissée derrière soi (une foulée rapide, un repli).
        o.fantome = (calque, modele, pos, p = {}) => {
            const f = o.figurant(calque, modele, pos, { opacite: p.opacite || 0.45, filtre: p.filtre || "grayscale(0.5) brightness(1.3)" });
            if (f) o.teinter(f, [{ opacity: p.opacite || 0.45 }, { opacity: 0 }], { duration: p.duree || 420, fill: "forwards" }).then(() => f.remove());
            return f;
        };

        // UNE ICÔNE qui surgit au-dessus d'un pion (💀, ⏳, 🎯, ❓…).
        o.icone = (calque, pos, contenu, p = {}) => {
            const t = (pos.t || 60) * (p.taille || 0.55);
            const d = o.poser(calque, pos.x + (p.dx || 0), pos.y + (p.dy === undefined ? -(pos.t || 60) * 0.72 : p.dy),
                `font-size:${t}px; line-height:1; z-index:${Z.ciel}; white-space:nowrap;
                 filter:drop-shadow(0 2px 3px rgba(0,0,0,.75))${p.lueur ? ` drop-shadow(0 0 8px ${p.lueur})` : ""};`, contenu);
            const tour = p.tourne || 0;
            return o.jouerPuisRetirer(d, [
                { transform: "translate(-50%,-50%) scale(0.2)", opacity: 0 },
                { transform: "translate(-50%,-50%) scale(1.18)", opacity: 1, offset: 0.16 },
                { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.28 },
                { transform: `translate(-50%,-50%) scale(1) rotate(${tour}deg)`, opacity: 1, offset: 0.82 },
                { transform: `translate(-50%,-50%) scale(0.85) rotate(${tour}deg)`, opacity: 0 }
            ], { duration: p.duree || 1400, delay: p.retard || 0, easing: "ease-out" });
        };
        // UNE AURA : un anneau lumineux qui pulse autour d'un pion.
        o.aura = (calque, pos, p = {}) => {
            const t = (pos.t || 60) * (p.taille || 1.35);
            const d = o.poser(calque, pos.x, pos.y, `width:${t}px; height:${t}px; border-radius:50%; z-index:${p.sol ? Z.sol : Z.haut};
                border:${p.bord || 3}px ${p.trait || "solid"} ${p.couleur}; box-shadow:0 0 16px ${p.couleur}, inset 0 0 14px ${p.couleur};
                background:${p.fond || "transparent"};`, p.contenu || "");
            const n = p.pulsations || 2;
            const images = [{ transform: "translate(-50%,-50%) scale(0.5) rotate(0deg)", opacity: 0 }];
            for (let i = 0; i < n; i++) {
                images.push({ transform: `translate(-50%,-50%) scale(1.06) rotate(${(p.tourne || 0) * (i + 0.5) / n}deg)`, opacity: 1, offset: (i + 0.45) / (n + 0.6) });
                images.push({ transform: `translate(-50%,-50%) scale(0.94) rotate(${(p.tourne || 0) * (i + 1) / n}deg)`, opacity: p.creux || 0.6, offset: (i + 0.95) / (n + 0.6) });
            }
            images.push({ transform: `translate(-50%,-50%) scale(1.2) rotate(${p.tourne || 0}deg)`, opacity: 0 });
            return o.jouerPuisRetirer(d, images, { duration: p.duree || 1600, delay: p.retard || 0, easing: "ease-in-out" });
        };
        // UN RAYON de a vers b : il jaillit de a, tient, s'éteint.
        o.rayon = (calque, a, b, p = {}) => {
            const v = axe(a, b);
            const ep = (a.t || 60) * (p.epaisseur || 0.16);
            const rot = v.angle * 180 / Math.PI;
            const d = o.poser(calque, a.x, a.y, `width:${v.d * (p.longueur || 1)}px; height:${ep}px; z-index:${p.sol ? Z.sol : Z.haut};
                border-radius:${ep}px; transform-origin:0 50%; background:${p.fond}; box-shadow:0 0 12px ${p.couleur}, 0 0 26px ${p.couleur};
                ${p.style || ""}`);
            const pose = (sx, sy) => `translate(0,-50%) rotate(${rot}deg) scale(${sx}, ${sy})`;
            return o.jouerPuisRetirer(d, [
                { transform: pose(0, 1), opacity: 1 },
                { transform: pose(1, 1.25), opacity: 1, offset: p.jaillit || 0.25 },
                { transform: pose(1, 1), opacity: 0.9, offset: p.tient || 0.75 },
                { transform: pose(1, 0.1), opacity: 0 }
            ], { duration: p.duree || 700, delay: p.retard || 0, easing: "ease-out" });
        };
        // UN ÉCLAIR : une ligne brisée qui scintille de a vers b.
        o.eclair = (calque, a, b, p = {}) => {
            const v = axe(a, b);
            const rot = v.angle * 180 / Math.PI;
            const n = p.segments || 9;
            let points = "0,0";
            for (let i = 1; i < n; i++) points += ` ${(i / n) * 100},${hasard(-38, 38)}`;
            points += " 100,0";
            const h = (a.t || 60) * (p.largeur || 0.9);
            const d = o.poser(calque, a.x, a.y, `width:${v.d}px; height:${h}px; z-index:${Z.haut}; transform-origin:0 50%;
                transform:translate(0,-50%) rotate(${rot}deg);`,
                `<svg viewBox="0 -50 100 100" preserveAspectRatio="none" width="100%" height="100%" style="overflow:visible">
                   <polyline points="${points}" fill="none" stroke="${p.couleur || "#9fd8ff"}" stroke-width="7" stroke-linejoin="round"
                     vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 6px ${p.couleur || "#9fd8ff"})"/>
                   <polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
                 </svg>`);
            const pose = `translate(0,-50%) rotate(${rot}deg)`;
            return o.jouerPuisRetirer(d, [
                { transform: pose, opacity: 0 }, { transform: pose, opacity: 1, offset: 0.08 }, { transform: pose, opacity: 0.2, offset: 0.25 },
                { transform: pose, opacity: 1, offset: 0.38 }, { transform: pose, opacity: 0.3, offset: 0.55 }, { transform: pose, opacity: 1, offset: 0.68 },
                { transform: pose, opacity: 0 }
            ], { duration: p.duree || 520, delay: p.retard || 0 });
        };
        // UN HEXAGONE de sol (une case de zone) : `fond` son dessin. Il apparaît
        // et reste jusqu'à o.effacer (ou la fin de la lecture).
        o.hexagone = (calque, pt, p = {}) => {
            const h = o.tailleHex(pt);
            const e = p.echelle || 0.96;
            const d = o.poser(calque, pt.x, pt.y, `width:${h.l * e}px; height:${h.h * e}px; z-index:${p.z || Z.sol};
                clip-path:polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); background:${p.fond}; ${p.style || ""}`, p.contenu || "");
            if (p.sansApparition) return d;
            o.teinter(d, [{ opacity: 0, transform: `${BASE} scale(0.55)` }, { opacity: p.opacite || 1, transform: `${BASE} scale(1)` }],
                      { duration: p.duree || 380, delay: p.retard || 0, easing: "ease-out", fill: "forwards" });
            return d;
        };
        // Faire vivre des cases : chacune pulse (flammes, givre, étincelles…).
        o.pulser = (els, p = {}) => Promise.all(els.map((d, i) => o.teinter(d, [
            { filter: "brightness(1)" }, { filter: `brightness(${p.eclat || 1.45})`, offset: 0.5 }, { filter: "brightness(1)" }
        ], { duration: p.duree || 520, delay: (p.decale || 60) * i, iterations: p.fois || 2 })));
        // UN LIEN entre deux points (Rempart, Provocation, Lien de sang).
        o.lien = (calque, a, b, p = {}) => {
            const v = axe(a, b);
            const rot = v.angle * 180 / Math.PI;
            const ep = p.epaisseur || 5;
            const d = o.poser(calque, a.x, a.y, `width:${v.d}px; height:${ep}px; z-index:${p.sol ? Z.sol : Z.haut}; transform-origin:0 50%;
                transform:translate(0,-50%) rotate(${rot}deg); border-radius:${ep}px;
                background:${p.fond || `repeating-linear-gradient(90deg, ${p.couleur} 0 10px, transparent 10px 15px)`};
                box-shadow:0 0 8px ${p.couleur};`);
            o.teinter(d, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: "forwards" });
            return d;
        };
        // UN ÉLÉMENT qui file de a vers b le long d'un lien (une pulsation).
        o.filer = (calque, a, b, p = {}) => {
            const t = (a.t || 60) * (p.taille || 0.22);
            const d = o.poser(calque, a.x, a.y, `width:${t}px; height:${t}px; border-radius:50%; z-index:${Z.ciel};
                background:${p.fond || p.couleur}; box-shadow:0 0 10px ${p.couleur}, 0 0 18px ${p.couleur};`, p.contenu || "");
            if (p.contenu) { d.style.background = "none"; d.style.boxShadow = "none"; d.style.fontSize = t + "px"; }
            return o.jouerPuisRetirer(d, [
                { transform: "translate(-50%,-50%) scale(0.6)", opacity: 0 },
                { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.15 },
                { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(1)`, opacity: 1, offset: 0.9 },
                { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(0.4)`, opacity: 0 }
            ], { duration: p.duree || 600, delay: p.retard || 0, easing: p.easing || "ease-in-out" });
        };
        // DES ÉTOILES qui tournent autour de la tête (Étourdi).
        o.etoiles = (calque, pos, p = {}) => {
            const r = (pos.t || 60) * 0.42;
            const d = o.poser(calque, pos.x, pos.y - (pos.t || 60) * 0.12, `width:${r * 2}px; height:${r * 2}px; z-index:${Z.ciel};`,
                [0, 1, 2].map(i => `<span style="position:absolute; left:${50 + 50 * Math.cos(i * 2.094)}%; top:${50 + 50 * Math.sin(i * 2.094)}%;
                    transform:translate(-50%,-50%); font-size:${(pos.t || 60) * 0.3}px; color:${p.couleur || "#ffe14a"};
                    text-shadow:0 0 6px #fff3a0, 0 1px 2px #000;">${p.signe || "✦"}</span>`).join(""));
            return o.jouerPuisRetirer(d, [
                { transform: "translate(-50%,-50%) rotate(0deg) scale(0.4)", opacity: 0 },
                { transform: "translate(-50%,-50%) rotate(140deg) scale(1)", opacity: 1, offset: 0.15 },
                { transform: `translate(-50%,-50%) rotate(${p.tours || 900}deg) scale(1)`, opacity: 1, offset: 0.85 },
                { transform: `translate(-50%,-50%) rotate(${(p.tours || 900) + 120}deg) scale(0.6)`, opacity: 0 }
            ], { duration: p.duree || 1800, easing: "linear" });
        };
        // UN VOILE sur toute la scène (un éclat de lumière, l'obscurité).
        o.voile = (calque, p = {}) => {
            const d = document.createElement("div");
            d.className = "anim-effet";
            d.style.cssText = `position:absolute; inset:0; pointer-events:none; z-index:${p.z || Z.ciel}; background:${p.fond};`;
            if (!jeton.annule) { calque.appendChild(d); jeton.poses.add(d); }
            return o.jouerPuisRetirer(d, p.images || [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
                                      { duration: p.duree || 1200, delay: p.retard || 0 });
        };
        // L'AVEUGLEMENT : tout s'obscurcit, sauf un cercle de vision autour du pion.
        o.brouillard = (calque, pos, rayonPx, p = {}) => {
            const c = calque.getBoundingClientRect();
            const R = Math.max(c.width, c.height) * 2.2;
            const d = o.poser(calque, pos.x, pos.y, `width:${R}px; height:${R}px; z-index:${Z.haut}; border-radius:50%;
                background:radial-gradient(circle, rgba(0,0,0,0) ${rayonPx * 0.85}px, rgba(8,6,14,${p.noir || 0.82}) ${rayonPx * 1.15}px);`);
            // L'obscurité se referme depuis les bords jusqu'au cercle de vision.
            const de = p.depuis || 2.6;
            return o.jouerPuisRetirer(d, [
                { opacity: 0, transform: `translate(-50%,-50%) scale(${de})` },
                { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.35 },
                { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 },
                { opacity: 0, transform: "translate(-50%,-50%) scale(1.1)" }
            ], { duration: p.duree || 2000, easing: "ease-in-out" });
        };
        // UN MUR DE TERRE qui surgit du sol (vu de dessus : un bloc de roche qui
        // grossit en tremblant, la poussière autour).
        //  LE DESSIN DU JEU (Nico : « mets dans le Studio les mêmes que dans le
        //  jeu ») : si la scène sait dessiner un mur de terre sur cette case
        //  (scene.terrain.tuileMur, murs_terre.js), c'est sa roche qui sort de
        //  terre — elle monte depuis le pied de la case, en tremblant. Sinon, le
        //  bloc dessiné d'avant.
        const terrain = (scene && scene.terrain) || null;
        o.terrain = terrain;
        o.mur = (calque, pt, p = {}) => {
            const tuile = terrain && pt && pt.q !== undefined && typeof terrain.tuileMur === "function" ? terrain.tuileMur(pt.q, pt.r, p) : null;
            if (tuile && tuile.dessin) {
                // La case est au pied du dessin (`pied`, en fraction de sa hauteur).
                const d = o.poser(calque, pt.x, pt.y + tuile.h * (0.5 - tuile.pied),
                    `width:${tuile.l}px; height:${tuile.h}px; z-index:${p.z || 12}; overflow:hidden;`);
                d.classList.add("anim-mur");
                tuile.dessin.style.cssText = "position:absolute; left:0; top:0; width:100%; height:100%;";
                d.appendChild(tuile.dessin);
                if (!p.sansApparition) {
                    o.teinter(tuile.dessin, [{ transform: "translateY(100%)" }, { transform: "translateY(-5%)", offset: 0.72 }, { transform: "translateY(0)" }],
                              { duration: p.duree || 680, delay: p.retard || 0, easing: "cubic-bezier(.25,.8,.3,1)", fill: "both" });
                    o.attendre((p.retard || 0) + 60).then(() => o.secouer(d, 2.5, 560));
                    o.attendre((p.retard || 0) + 120).then(() => o.gerbe(calque, pt.x, pt.y, { nombre: 12, dist: tuile.l * 0.6,
                        couleurs: ["#a08868", "#6e5a40", "#cbb898"], taille: 7, tailleMin: 3, carre: true, duree: 700 }));
                }
                return d;
            }
            const h = o.tailleHex(pt);
            const d = o.poser(calque, pt.x, pt.y, `width:${h.l * 0.86}px; height:${h.h * 0.86}px; z-index:${p.z || 12};
                clip-path:polygon(20% 4%, 52% 0, 82% 8%, 100% 46%, 86% 88%, 52% 100%, 16% 92%, 0 52%);
                background:radial-gradient(circle at 38% 32%, #b59a74, #7a6248 45%, #4a3a28 80%);
                box-shadow:inset 0 0 14px rgba(0,0,0,.6);`,
                `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M30 25 L45 45 L40 62 M60 20 L58 40 L72 55 M45 45 L60 50"
                   stroke="rgba(40,28,16,.75)" stroke-width="3" fill="none"/></svg>`);
            if (!p.sansApparition) {
                o.teinter(d, [
                    { transform: `${BASE} scale(0.15) rotate(-8deg)`, opacity: 0.6 },
                    { transform: `${BASE} scale(1.12) rotate(3deg)`, opacity: 1, offset: 0.55 },
                    { transform: `${BASE} scale(0.97) rotate(-1deg)`, offset: 0.75 },
                    { transform: `${BASE} scale(1) rotate(0deg)`, opacity: 1 }
                ], { duration: p.duree || 620, delay: p.retard || 0, easing: "cubic-bezier(.2,.8,.3,1.2)", fill: "forwards" });
                o.attendre((p.retard || 0) + 120).then(() => o.gerbe(calque, pt.x, pt.y, { nombre: 12, dist: h.l * 0.75,
                    couleurs: ["#a08868", "#6e5a40", "#cbb898"], taille: 7, tailleMin: 3, carre: true, duree: 700 }));
            }
            return d;
        };
        // UN MUR QUI S'ÉCROULE : la roche du jeu s'enfonce dans sa case ; le bloc
        // d'avant rapetisse en tournant.
        o.effondrer = (mur, p = {}) => {
            if (!mur) return Promise.resolve();
            const roche = mur.classList && mur.classList.contains("anim-mur") ? mur.querySelector("canvas") : null;
            if (roche) return Promise.all([
                o.teinter(roche, [{ transform: "translateY(0) rotate(0deg)" }, { transform: "translateY(18%) rotate(-3deg)", offset: 0.3 },
                                  { transform: "translateY(70%) rotate(5deg)" }], { duration: p.duree || 560, easing: "ease-in", fill: "forwards" }),
                o.teinter(mur, [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: p.duree || 560, fill: "forwards" })]);
            return o.teinter(mur, [{ transform: `${BASE} scale(1)`, opacity: 1 }, { transform: `${BASE} scale(0.5) rotate(12deg)`, opacity: 0 }],
                             { duration: p.duree || 500, fill: "forwards" });
        };
        // DES GRAVATS : le tas du jeu (scene.terrain.tuileGravats) à plat sur la
        // case ; sinon quelques pierres éparses.
        o.gravats = (calque, pt, p = {}) => {
            const tas = terrain && pt && pt.q !== undefined && typeof terrain.tuileGravats === "function" ? terrain.tuileGravats(pt.q, pt.r) : null;
            if (tas && tas.src) {
                const d = o.poser(calque, pt.x, pt.y, `width:${tas.t}px; height:${tas.t}px; z-index:${p.z || Z.bas};`,
                    `<img class="gravats-terre" alt="" src="${tas.src}" style="display:block; width:100%; height:100%;">`);
                if (!p.sansApparition) o.teinter(d, [{ opacity: 0, transform: `${BASE} scale(0.6)` }, { opacity: 1, transform: `${BASE} scale(1)` }],
                                                 { duration: p.duree || 420, delay: p.retard || 0, easing: "ease-out", fill: "both" });
                return d;
            }
            const h = o.tailleHex(pt);
            const pierres = Array.from({ length: p.nombre || 7 }, () => {
                const t = hasard(h.h * 0.1, h.h * 0.22);
                return `<span style="position:absolute; left:${hasard(18, 82)}%; top:${hasard(20, 80)}%; width:${t}px; height:${t * hasard(0.6, 0.9)}px;
                    transform:translate(-50%,-50%) rotate(${hasard(0, 180)}deg); border-radius:${hasard(20, 45)}%;
                    background:radial-gradient(circle at 35% 30%, #b8a284, #6a563e); box-shadow:0 2px 3px rgba(0,0,0,.5);"></span>`;
            }).join("");
            return o.hexagone(calque, pt, { fond: "rgba(90,70,48,0.35)", contenu: pierres, z: Z.bas, duree: p.duree || 420, retard: p.retard });
        };
        // UNE NAPPE (une case de zone persistante) : le dessin du jeu
        // (scene.terrain.nappe, combat.js) sur la carte même ; sinon un hexagone
        // peint (`fond`). `persistante` : elle reste après la lecture (le Studio
        // la garde sur sa carte, comme le combat) ; sinon elle part avec le reste.
        o.nappe = (calque, pt, type, p = {}) => {
            const el = terrain && pt && pt.q !== undefined && typeof terrain.nappe === "function"
                ? terrain.nappe(type, pt.q, pt.r, { persistante: !!p.persistante }) : null;
            if (el) {
                if (!p.persistante) o.suivre(el);
                el.dataset.ancre = "libre";
                if (!p.sansApparition) o.teinter(el, [{ opacity: 0, transform: "scale(0.55)" }, { opacity: 1, transform: "scale(1)" }],
                                                 { duration: p.duree || 420, delay: p.retard || 0, easing: "ease-out", fill: "both" });
                return el;
            }
            return o.hexagone(calque, pt, { fond: p.fond, opacite: p.opacite, retard: p.retard, duree: p.duree, sansApparition: p.sansApparition });
        };
        // L'OMBRE au sol d'un pion qui s'élève (un bond, une nuée).
        o.ombre = (calque, pos, p = {}) => {
            const d = o.poser(calque, pos.x, pos.y + (pos.t || 60) * 0.12,
                `width:${(pos.t || 60) * 0.9}px; height:${(pos.t || 60) * 0.5}px; border-radius:50%; z-index:${Z.sol};
                 background:radial-gradient(ellipse, rgba(0,0,0,${p.noir || 0.45}), rgba(0,0,0,0) 70%);`);
            d.classList.add("anim-ombre");
            return d;
        };
        // L'énergie (la jauge de fatigue) : le chiffre jaune et la barre.
        o.energie = (calque, pion, de, vers, max, texte) => o.jauge(calque, pion, de, vers, max, texte, COULEURS.attention, "#e2c46a");
    }

    // =====================================================================
    //  LE CATALOGUE
    // =====================================================================
    //  `sens` dit ce que fait le pion du joueur : « vers l'ennemi » (il agit
    //  sur lui) ou « sur soi » (il encaisse ou se protège, l'ennemi donnant
    //  l'axe du coup).
    const ANIMATIONS = [
        {
            id: "coup-epee", nom: "Coup d'épée (corps à corps)", categorie: "Attaque", sens: "vers l'ennemi",
            description: "Le héros prend son élan, fond sur l'ennemi, une entaille blanche le traverse.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const v = axe(a, b);
                o.son("lame-souffle", 150);
                const elan = o.elan(lanceur, a, b, {});
                await o.attendre(330);
                o.son("lame-impact");
                const t = b.t * 1.5;
                // L'entaille croise l'axe du coup.
                const entaille = o.poser(calque, b.x, b.y, `width:${t}px; height:${t}px; z-index:4; transform:translate(-50%,-50%) rotate(${v.angle * 180 / Math.PI}deg);`,
                    `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M30 12 Q 62 50 30 88" fill="none" stroke="#fff" stroke-width="7"
                      stroke-linecap="round" stroke-dasharray="120" stroke-dashoffset="120" style="filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 12px #9cf)"/></svg>`);
                const coupe = o.teinter(entaille.querySelector("path"), [{ strokeDashoffset: 120, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.5 },
                                                                         { strokeDashoffset: -120, opacity: 0 }], { duration: 380, easing: "ease-out" });
                o.jauge(calque, cible, 40, 28, 40, "-12", COULEURS.degats, COULEURS.degats);
                await Promise.all([elan, coupe.then(() => entaille.remove()), o.secouer(cible, b.t * 0.1, 320, v), o.eclat(cible, ROUGE),
                                   o.gerbe(calque, b.x, b.y, { nombre: 8, dist: b.t * 0.7, angle: v.angle, eventail: Math.PI, couleurs: ["#fff", "#ffd6d6"], taille: 5 })]);
            }
        },
        {
            id: "coup-recu", nom: "Coup reçu", categorie: "Impact", sens: "sur soi",
            description: "Le héros encaisse un coup venu de l'ennemi : il recule, s'empourpre, les dégâts s'envolent.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const recul = axe(b, a);           // le coup vient de l'ennemi
                const flanc = { x: a.x - recul.ux * a.t * 0.4, y: a.y - recul.uy * a.t * 0.4, t: a.t };
                o.son("coup-sourd");
                await Promise.all([o.secouer(lanceur, a.t * 0.14, 380, recul), o.eclat(lanceur, ROUGE, 480),
                                   Promise.resolve(o.jauge(calque, lanceur, 40, 28, 40, "-12", COULEURS.degats, COULEURS.degats)),
                                   o.gerbe(calque, flanc.x, flanc.y, { nombre: 8, dist: a.t * 0.6, angle: recul.angle + Math.PI, eventail: Math.PI * 0.9,
                                                                       couleurs: ["#c4141c", "#ff6b6b"], taille: 6 })]);
            }
        },
        {
            id: "soin", nom: "Soin", categorie: "Soin", sens: "sur soi",
            description: "Une lueur verte monte du sol, des éclats de vie s'élèvent autour du héros.",
            async jouer({ lanceur, calque }, o) {
                const a = centre(lanceur, calque);
                o.son("soin");
                await Promise.all([
                    o.onde(calque, a, { couleur: "#7dff9a", taille: 1.2, aplati: 0.45, decalage: a.t * 0.35, duree: 1100, echelle: 1.5 }),
                    o.onde(calque, a, { couleur: "#b6ffc6", taille: 1.2, aplati: 0.45, decalage: a.t * 0.35, duree: 1100, echelle: 1.5, retard: 300 }),
                    o.eclat(lanceur, "brightness(1.45) drop-shadow(0 0 10px #7dff9a)", 1200),
                    o.gerbe(calque, a.x, a.y + a.t * 0.2, { nombre: 9, dist: a.t * 0.35, monte: a.t * 0.9, couleurs: ["#7dff9a", "#d9ffe1"],
                                                            texte: "+", taille: 18, tailleMin: 12, duree: 1300, etale: 500 }),
                    Promise.resolve(o.jauge(calque, lanceur, 20, 35, 40, "+15", COULEURS.soin, COULEURS.soin))
                ]);
            }
        },
        {
            id: "bouclier", nom: "Bouclier magique (création)", categorie: "Défense", sens: "sur soi",
            description: "Un dôme cyan se referme sur le héros ; sa paroi brille côté ennemi, pulse, puis se dissipe.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const v = axe(a, b);
                o.son("bouclier");
                const dome = o.poser(calque, a.x, a.y, `width:${a.t * 1.45}px; height:${a.t * 1.45}px; border-radius:50%; z-index:4;
                    border:2px solid rgba(160,245,255,0.9); background:radial-gradient(circle, rgba(91,232,255,0.05) 45%, rgba(91,232,255,0.35) 75%, rgba(220,255,255,0.6) 100%);
                    box-shadow:0 0 18px #5be8ff, inset 0 0 18px #5be8ff;`);
                // La paroi tournée vers l'ennemi : un arc plus vif.
                const paroi = o.poser(calque, a.x + v.ux * a.t * 0.62, a.y + v.uy * a.t * 0.62, `width:${a.t * 0.32}px; height:${a.t * 1.1}px; z-index:4;
                    border-radius:50%; border-right:5px solid #e8ffff; filter:drop-shadow(0 0 8px #5be8ff);`);
                const rot = v.angle * 180 / Math.PI;
                o.jauge(calque, lanceur, 0, 12, 12, "+12 🛡️", COULEURS.bouclier, COULEURS.bouclier);
                await Promise.all([
                    o.jouerPuisRetirer(dome, [
                        { transform: "translate(-50%,-50%) scale(0.2)", opacity: 0 },
                        { transform: "translate(-50%,-50%) scale(1.08)", opacity: 1, offset: 0.25 },
                        { transform: "translate(-50%,-50%) scale(0.98)", opacity: 0.85, offset: 0.45 },
                        { transform: "translate(-50%,-50%) scale(1.03)", opacity: 0.95, offset: 0.65 },
                        { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 }
                    ], { duration: 1700, easing: "ease-in-out" }),
                    o.jouerPuisRetirer(paroi, [
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0.3)`, opacity: 0 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.3 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 0.8, offset: 0.7 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.2)`, opacity: 0 }
                    ], { duration: 1700, easing: "ease-in-out" })
                ]);
            }
        },
        {
            id: "boule-de-feu", nom: "Attaque magique Feu (Boule de feu)", categorie: "Sort", sens: "vers l'ennemi",
            description: "Le héros s'embrase, une boule de feu file vers l'ennemi en traînant des braises, et explose.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                o.son("feu-lancer");
                await o.eclat(lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff8c1a)", 260);
                await o.projectile(calque, a, b, { taille: 0.5, duree: Math.min(900, 380 + axe(a, b).d * 0.9), traine: ["#ffb02e", "#ff5a0a"],
                    style: "background:radial-gradient(circle at 40% 40%, #fff6c4, #ffb02e 40%, #e8420c 75%, rgba(200,30,0,0) 100%); box-shadow:0 0 18px #ff7a1a, 0 0 36px #ff4500;" });
                o.son("feu-explosion");
                o.jauge(calque, cible, 40, 26, 40, "-14", COULEURS.degats, COULEURS.degats);
                o.attendre(500).then(() => o.texte(calque, cible, "Brûlé !", COULEURS.etat));
                await Promise.all([
                    o.onde(calque, b, { couleur: "#ff7a1a", taille: 1, fond: "radial-gradient(circle, rgba(255,240,180,0.9), rgba(255,120,20,0.5) 60%, transparent)", duree: 600, echelle: 2 }),
                    o.onde(calque, b, { couleur: "#ffcf5a", taille: 0.8, duree: 700, echelle: 2.4, retard: 80 }),
                    o.gerbe(calque, b.x, b.y, { nombre: 14, dist: b.t * 1.1, couleurs: ["#ffcf5a", "#ff7a1a", "#e8420c"], taille: 7, duree: 800 }),
                    o.secouer(cible, b.t * 0.12, 320, axe(a, b)), o.eclat(cible, "sepia(1) saturate(5) hue-rotate(-20deg) brightness(1.2)", 600)]);
            }
        },
        {
            id: "esquive", nom: "Esquive", categorie: "Déplacement", sens: "sur soi",
            description: "Un pas de côté fulgurant, perpendiculaire à l'ennemi : le coup ne trouve qu'une image fantôme.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const v = axe(a, b);
                const px = -v.uy * a.t * 0.7, py = v.ux * a.t * 0.7;
                const fantome = lanceur.cloneNode(true);
                fantome.removeAttribute("id");
                fantome.classList.add("anim-effet");
                fantome.style.pointerEvents = "none";
                if (!o.annulee()) lanceur.parentNode.insertBefore(fantome, lanceur);
                o.son("esquive");
                o.texte(calque, lanceur, "Esquivé 💨", COULEURS.neutre);
                const trace = o.teinter(fantome, [{ opacity: 0.55, filter: "grayscale(0.6) brightness(1.4)" }, { opacity: 0, filter: "grayscale(1) brightness(1.6)" }], { duration: 650 });
                // Le coup venu de l'ennemi traverse la case vide.
                const trait = o.poser(calque, a.x, a.y, `width:${a.t * 1.3}px; height:4px; z-index:4; border-radius:2px;
                    background:linear-gradient(90deg, transparent, #fff, transparent); transform:translate(-50%,-50%) rotate(${v.angle * 180 / Math.PI}deg);`);
                await Promise.all([
                    o.bouger(lanceur, [
                        { transform: "translate(0,0)" },
                        { transform: `translate(${px}px, ${py}px) skewX(-10deg)`, offset: 0.25 },
                        { transform: `translate(${px}px, ${py}px)`, offset: 0.7 },
                        { transform: "translate(0,0)" }
                    ], { duration: 820, easing: "cubic-bezier(.2,.9,.3,1)" }),
                    o.jouerPuisRetirer(trait, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 400, delay: 120 })
                ]);
                await trace;
                fantome.remove();
            }
        },
        {
            id: "gel", nom: "Glacé", categorie: "Sort", sens: "vers l'ennemi",
            description: "Le héros se couvre de givre, lance un trait de glace : l'ennemi se fige dans les cristaux et bleuit ; le sol reste gelé sous lui (marche ×2, +20 % de dégâts physiques).",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                o.son("gel-lancer");
                await Promise.all([o.eclat(lanceur, "saturate(0.6) hue-rotate(170deg) brightness(1.3) drop-shadow(0 0 8px #bdf3ff)", 380),
                                   o.gerbe(calque, a.x, a.y, { nombre: 8, dist: a.t * 0.5, couleurs: ["#e8fbff", "#9fe6ff"], taille: 5, duree: 400 })]);
                await o.projectile(calque, a, b, { taille: 0.42, forme: "2px", arc: 0, oriente: true, duree: Math.min(700, 260 + axe(a, b).d * 0.7), easing: "linear",
                    traine: ["#e8fbff", "#9fe6ff"],
                    style: "height:auto; aspect-ratio:3/1; background:linear-gradient(90deg, rgba(160,230,255,0), #bdf3ff 60%, #ffffff); clip-path:polygon(0 35%, 75% 0, 100% 50%, 75% 100%, 0 65%); filter:drop-shadow(0 0 6px #9fe6ff);" });
                o.son("glace-impact");
                o.jauge(calque, cible, 40, 31, 40, "-9", COULEURS.degats, COULEURS.degats);
                o.attendre(500).then(() => o.texte(calque, cible, "Glacé !", COULEURS.etat));
                const eclats = [];
                for (let i = 0; i < 7; i++) {
                    const ang = (i / 7) * Math.PI * 2, r = b.t * 0.55;
                    const c = o.poser(calque, b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r, `width:${b.t * 0.16}px; height:${b.t * 0.42}px; z-index:4;
                        background:linear-gradient(180deg, #ffffff, #9fe6ff 50%, #3aa8e8); clip-path:polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
                        filter:drop-shadow(0 0 4px #bdf3ff);`);
                    const rot = (ang * 180 / Math.PI) + 90;
                    eclats.push(o.jouerPuisRetirer(c, [
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0)`, opacity: 0 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.3 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.75 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.4)`, opacity: 0 }
                    ], { duration: 1400, delay: i * 40, easing: "ease-out" }));
                }
                // LA PRÉSENCE (Nico : « pose, présence ») : le sol reste gelé sous lui.
                const sol = o.hexagone(calque, b, { fond: "radial-gradient(circle, rgba(255,255,255,0.75), rgba(170,230,255,0.45) 60%, rgba(60,150,220,0.2) 90%)", opacite: 0.85 });
                await Promise.all([...eclats,
                    o.teinter(cible, [{ filter: "none" }, { filter: "saturate(0.4) hue-rotate(170deg) brightness(1.25)", offset: 0.3 },
                                      { filter: "saturate(0.4) hue-rotate(170deg) brightness(1.25)", offset: 0.75 }, { filter: "none" }], { duration: 1500 }),
                    o.onde(calque, b, { couleur: "#bdf3ff", taille: 1.1, duree: 900, echelle: 1.7 })]);
                o.texte(calque, cible, "Marche ×2 · +20 % dégâts phys.", COULEURS.attention);
                await o.attendre(450);
                await o.effacer(sol, { duree: 300 });
            }
        },
        {
            id: "poison", nom: "Empoisonnement", categorie: "Attaque", sens: "vers l'ennemi",
            description: "Le héros lance une fiole de venin : elle éclate sur l'ennemi, qui verdit par vagues sous des bulles toxiques ; puis le tic de fin de manche ronge son énergie et ses PV.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const VERT = "sepia(1) saturate(5) hue-rotate(55deg) brightness(0.95)";
                o.son("poison-lancer");
                await o.projectile(calque, a, b, { taille: 0.3, arc: 0.7, duree: Math.min(800, 360 + axe(a, b).d * 0.8), easing: "ease-in-out",
                    style: "background:radial-gradient(circle at 35% 35%, #e8ffc0, #7dd321 50%, #2e5a0a); box-shadow:0 0 10px #7dd321;" });
                o.son("poison-bulles");
                o.jauge(calque, cible, 40, 35, 40, "-5", COULEURS.degats, COULEURS.degats);
                o.attendre(500).then(() => o.texte(calque, cible, "Empoisonnement !", COULEURS.etat));
                await Promise.all([
                    o.onde(calque, b, { couleur: "#7dd321", taille: 0.9, fond: "radial-gradient(circle, rgba(125,211,33,0.5), transparent 70%)", duree: 600, echelle: 1.6 }),
                    o.teinter(cible, [{ filter: "none" }, { filter: VERT, offset: 0.25 }, { filter: "none", offset: 0.5 }, { filter: VERT, offset: 0.75 }, { filter: "none" }], { duration: 1500 }),
                    o.gerbe(calque, b.x, b.y + b.t * 0.1, { nombre: 12, dist: b.t * 0.4, monte: b.t * 0.8, couleurs: ["#7dd321", "#b5ff4c", "#4e8a12"],
                                                           taille: 9, tailleMin: 4, duree: 1300, etale: 700 }),
                    o.secouer(cible, b.t * 0.05, 500)
                ]);
                // PUIS LE TIC de fin de manche (Nico : « pose, puis tic ») : le
                // venin ronge l'énergie, puis les PV.
                o.son("poison-bulles");
                o.energie(calque, cible, 35, 32, 40, "-3 ⚡");
                o.attendre(450).then(() => o.texte(calque, cible, "-2", COULEURS.degats));
                await Promise.all([o.teinter(cible, [{ filter: "none" }, { filter: VERT, offset: 0.4 }, { filter: "none" }], { duration: 800 }),
                    o.gerbe(calque, b.x, b.y, { nombre: 7, dist: b.t * 0.35, monte: b.t * 0.6, couleurs: ["#7dd321", "#b5ff4c"], taille: 7, duree: 900 })]);
            }
        },
        {
            id: "coup-critique", nom: "Coup critique", categorie: "Attaque", sens: "vers l'ennemi",
            description: "Le héros s'embrase d'or, fond sur l'ennemi, une étoile dorée éclate sur lui.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const v = axe(a, b);
                o.son("critique-charge");
                // Le critique s'annonce AVANT le coup, sur le lanceur (pont_combat.js).
                o.texte(calque, lanceur, "Critique !", COULEURS.critique, { taille: 30, eclat: true });
                await o.eclat(lanceur, "brightness(1.4) drop-shadow(0 0 12px #ffd700)", 380);
                const elan = o.elan(lanceur, a, b, { portee: 0.75, echelle: 1.12, prise: 0.15, frappe: 0.4, duree: 420, easing: "cubic-bezier(.5,0,.3,1)" });
                await o.attendre(170);
                o.son("critique-impact");
                const t = b.t * 2.2;
                const etoile = o.poser(calque, b.x, b.y, `width:${t}px; height:${t}px; z-index:4;`,
                    `<svg viewBox="-50 -50 100 100" width="100%" height="100%">${Array.from({ length: 12 }, (_, i) =>
                        `<polygon points="0,-48 4,-6 -4,-6" fill="${i % 2 ? "#fff3b0" : "#ffd700"}" transform="rotate(${i * 30})"/>`).join("")}
                        <circle r="10" fill="#fffbe6"/></svg>`);
                o.jauge(calque, cible, 40, 16, 40, "-24 !", COULEURS.degats, COULEURS.degats);
                await Promise.all([elan,
                    o.jouerPuisRetirer(etoile, [{ transform: "translate(-50%,-50%) scale(0.2) rotate(0deg)", opacity: 1 },
                                                { transform: "translate(-50%,-50%) scale(1) rotate(25deg)", opacity: 1, offset: 0.4 },
                                                { transform: "translate(-50%,-50%) scale(1.3) rotate(45deg)", opacity: 0 }], { duration: 650, easing: "ease-out" }),
                    o.secouer(cible, b.t * 0.2, 450, v), o.eclat(cible, ROUGE, 500),
                    o.gerbe(calque, b.x, b.y, { nombre: 12, dist: b.t * 1.2, angle: v.angle, eventail: Math.PI * 1.4, couleurs: ["#ffd700", "#fff3b0"], taille: 6, duree: 800 })]);
            }
        },
        {
            id: "mise-a-terre", nom: "Mise à terre / KO", categorie: "Impact", sens: "sur soi",
            description: "Frappé depuis l'ennemi, le héros vacille, s'effondre à l'opposé et pâlit… puis se relève.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const loin = axe(b, a);   // il tombe à l'opposé de l'ennemi
                const tourne = loin.ux >= 0 ? 80 : -80;
                o.son("coup-sourd");
                o.son("chute", 900);
                o.jauge(calque, lanceur, 30, 0, 40, "-30", COULEURS.degats, COULEURS.degats);
                o.attendre(900).then(() => o.texte(calque, lanceur, "À terre !", COULEURS.degats, { taille: 26 }));
                await o.bouger(lanceur, [
                    { transform: "translate(0,0) rotate(0deg)", filter: "none", opacity: 1 },
                    { transform: `translate(${loin.ux * a.t * 0.06}px, ${loin.uy * a.t * 0.06}px) rotate(${tourne * 0.1}deg)`, offset: 0.15 },
                    { transform: `translate(${-loin.ux * a.t * 0.04}px, ${-loin.uy * a.t * 0.04}px) rotate(${-tourne * 0.08}deg)`, offset: 0.3 },
                    { transform: `translate(${loin.ux * a.t * 0.22}px, ${loin.uy * a.t * 0.22 + a.t * 0.08}px) rotate(${tourne}deg) scale(0.92)`, filter: "grayscale(1) brightness(0.6)", opacity: 0.55, offset: 0.5 },
                    { transform: `translate(${loin.ux * a.t * 0.22}px, ${loin.uy * a.t * 0.22 + a.t * 0.08}px) rotate(${tourne}deg) scale(0.92)`, filter: "grayscale(1) brightness(0.6)", opacity: 0.55, offset: 0.8 },
                    { transform: "translate(0,0) rotate(0deg)", filter: "none", opacity: 1 }
                ], { duration: 2400, easing: "ease-in-out" });
            }
        }
    ];

    // Les dix premières, rangées dans les sections du catalogue (Nico).
    const SECTIONS_PREMIERES = { "coup-epee": 2, "coup-recu": 3, "soin": 4, "bouclier": 4, "boule-de-feu": 2, "esquive": 3,
                                 "gel": 6, "poison": 6, "coup-critique": 2, "mise-a-terre": 3 };
    ANIMATIONS.forEach(a => { a.section = SECTIONS_PREMIERES[a.id] || 2; });

    window.ANIMATIONS_COMBAT = ANIMATIONS;
    window.animationCombatParId = (id) => ANIMATIONS.find(a => a.id === id) || null;
    // LES SECTIONS DU CATALOGUE, dans l'ordre de la liste de Nico.
    window.SECTIONS_ANIMATIONS = [
        { n: 1, titre: "Déplacements" }, { n: 2, titre: "Attaques" }, { n: 3, titre: "Impacts et défenses" },
        { n: 4, titre: "Soins, protections, énergie" }, { n: 5, titre: "Contrôle et déplacements forcés" },
        { n: 6, titre: "États altérés" }, { n: 7, titre: "Zones et terrain" }, { n: 8, titre: "Classes" }, { n: 9, titre: "Talents" }
    ];
    // D'autres fichiers ajoutent leurs animations (animations_catalogue.js) ;
    // `ordre` : la liste complète des identifiants, dans l'ordre voulu.
    window.enregistrerAnimationsCombat = function (liste, ordre) {
        (liste || []).forEach(a => {
            const i = ANIMATIONS.findIndex(x => x.id === a.id);
            if (i >= 0) ANIMATIONS[i] = a; else ANIMATIONS.push(a);
        });
        if (Array.isArray(ordre)) {
            const rang = new Map(ordre.map((id, i) => [id, i]));
            ANIMATIONS.sort((x, y) => (rang.has(x.id) ? rang.get(x.id) : 1e6) - (rang.has(y.id) ? rang.get(y.id) : 1e6));
        }
    };
    // Les outils de dessin, pour le catalogue.
    window.OUTILS_ANIMATION = { centre, axe, hasard, COULEURS, ROUGE, Z, BASE };

    // LA LECTURE EN COURS (une seule à la fois) : l'interrompre coupe ses sons
    // en attente et fait rendre la main à ses pauses.
    let enCours = null;
    // Ce qu'une lecture laisse encore derrière elle (effets posés, figurants,
    // animations qui tiennent) disparaît : les pions reviennent tels quels.
    function nettoyer(jeton) {
        jeton.anims.forEach(an => { try { an.cancel(); } catch (e) {} });
        jeton.anims.clear();
        jeton.poses.forEach(el => el.remove());
        jeton.poses.clear();
    }
    window.annulerAnimationsCombat = function () {
        if (!enCours) return;
        enCours.annule = true;
        enCours.minuteurs.forEach(clearTimeout);
        enCours.minuteurs.clear();
        enCours.reveils.forEach(r => r());
        enCours.reveils.clear();
        nettoyer(enCours);
        enCours = null;
    };
    // Le point d'entrée, pour le Studio comme pour le combat de demain.
    window.jouerAnimationCombat = function (id, scene) {
        const anim = window.animationCombatParId(id);
        if (!anim || !scene || !scene.lanceur || !scene.calque) return Promise.resolve(false);
        window.annulerAnimationsCombat();
        const jeton = { annule: false, minuteurs: new Set(), reveils: new Set(), anims: new Set(), poses: new Set() };
        enCours = jeton;
        // Sans cible (un héros seul), l'axe pointe vers la droite.
        const cible = scene.cible || scene.lanceur;
        const fin = (ok) => { nettoyer(jeton); if (enCours === jeton) enCours = null; return ok; };
        let promesse;
        try { promesse = Promise.resolve(anim.jouer({ ...scene, cible }, outils(jeton, scene))); }
        catch (e) { promesse = Promise.reject(e); }
        return promesse.then(() => fin(!jeton.annule),
                             (e) => { console.error("Animation " + id + " :", e); return fin(false); });
    };
})();
