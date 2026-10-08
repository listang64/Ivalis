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
    const ROUGE = "sepia(1) saturate(7) hue-rotate(-45deg) brightness(1.05)";

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
    function outils(jeton) {
        const o = {};
        o.annulee = () => jeton.annule;
        o.attendre = (ms) => new Promise(r => {
            if (jeton.annule) return r();
            const t = setTimeout(() => { jeton.minuteurs.delete(t); r(); }, ms);
            jeton.minuteurs.add(t);
            jeton.reveils.add(r);
        });
        o.son = (id, retard) => {
            if (jeton.annule) return;
            const t = setTimeout(() => {
                jeton.minuteurs.delete(t);
                if (!jeton.annule && typeof window.jouerSonCombat === "function") window.jouerSonCombat(id);
            }, retard || 0);
            jeton.minuteurs.add(t);
            if (typeof window.__sonsCombatDemandes === "object") window.__sonsCombatDemandes.push(id);
        };
        o.bouger = (el, images, options) => {
            if (!el || typeof el.animate !== "function" || jeton.annule) return Promise.resolve();
            return fini(el.animate(images.map(f => ({ ...f, transform: BASE + " " + (f.transform || "") })), options));
        };
        o.teinter = (el, images, options) => {
            if (!el || typeof el.animate !== "function" || jeton.annule) return Promise.resolve();
            return fini(el.animate(images, options));
        };
        // Un effet posé dans le calque, centré sur (x, y).
        o.poser = (calque, x, y, style, contenu) => {
            const d = document.createElement("div");
            d.className = "anim-effet";
            d.style.cssText = `position:absolute; left:${x}px; top:${y}px; transform:translate(-50%,-50%); pointer-events:none; ${style || ""}`;
            if (contenu) d.innerHTML = contenu;
            if (!jeton.annule) calque.appendChild(d);
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
        // Un nombre qui s'envole au-dessus du pion (les dégâts, le soin).
        o.nombreVolant = (calque, pos, texte, couleur) => {
            const n = o.poser(calque, pos.x, pos.y - pos.t * 0.45, `font-family:'Cinzel', serif; font-weight:bold; font-size:${Math.max(16, pos.t * 0.42)}px;
                color:${couleur}; text-shadow:0 2px 3px #000, 0 0 10px ${couleur}; white-space:nowrap; z-index:5;`, texte);
            return o.jouerPuisRetirer(n, [
                { transform: "translate(-50%,-50%) scale(0.6)", opacity: 0 },
                { transform: "translate(-50%,-90%) scale(1.15)", opacity: 1, offset: 0.2 },
                { transform: "translate(-50%,-220%) scale(1)", opacity: 0 }
            ], { duration: 1100, easing: "ease-out" });
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
        return o;
    }

    // =====================================================================
    //  LE CATALOGUE
    // =====================================================================
    //  `sens` dit ce que fait le pion du joueur : « vers l'ennemi » (il agit
    //  sur lui) ou « sur soi » (il encaisse ou se protège, l'ennemi donnant
    //  l'axe du coup).
    const ANIMATIONS = [
        {
            id: "coup-epee", nom: "Coup d'épée", categorie: "Attaque", sens: "vers l'ennemi",
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
                                   o.nombreVolant(calque, a, "−12", "#ff4c4c"),
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
                    o.nombreVolant(calque, a, "+15", "#7dff9a")
                ]);
            }
        },
        {
            id: "bouclier", nom: "Bouclier magique", categorie: "Défense", sens: "sur soi",
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
            id: "boule-de-feu", nom: "Boule de feu", categorie: "Sort", sens: "vers l'ennemi",
            description: "Le héros s'embrase, une boule de feu file vers l'ennemi en traînant des braises, et explose.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                o.son("feu-lancer");
                await o.eclat(lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff8c1a)", 260);
                await o.projectile(calque, a, b, { taille: 0.5, duree: Math.min(900, 380 + axe(a, b).d * 0.9), traine: ["#ffb02e", "#ff5a0a"],
                    style: "background:radial-gradient(circle at 40% 40%, #fff6c4, #ffb02e 40%, #e8420c 75%, rgba(200,30,0,0) 100%); box-shadow:0 0 18px #ff7a1a, 0 0 36px #ff4500;" });
                o.son("feu-explosion");
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
            id: "gel", nom: "Gel", categorie: "Sort", sens: "vers l'ennemi",
            description: "Le héros se couvre de givre, lance un trait de glace : l'ennemi se fige dans les cristaux et bleuit.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                o.son("gel-lancer");
                await Promise.all([o.eclat(lanceur, "saturate(0.6) hue-rotate(170deg) brightness(1.3) drop-shadow(0 0 8px #bdf3ff)", 380),
                                   o.gerbe(calque, a.x, a.y, { nombre: 8, dist: a.t * 0.5, couleurs: ["#e8fbff", "#9fe6ff"], taille: 5, duree: 400 })]);
                await o.projectile(calque, a, b, { taille: 0.42, forme: "2px", arc: 0, oriente: true, duree: Math.min(700, 260 + axe(a, b).d * 0.7), easing: "linear",
                    traine: ["#e8fbff", "#9fe6ff"],
                    style: "height:auto; aspect-ratio:3/1; background:linear-gradient(90deg, rgba(160,230,255,0), #bdf3ff 60%, #ffffff); clip-path:polygon(0 35%, 75% 0, 100% 50%, 75% 100%, 0 65%); filter:drop-shadow(0 0 6px #9fe6ff);" });
                o.son("glace-impact");
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
                await Promise.all([...eclats,
                    o.teinter(cible, [{ filter: "none" }, { filter: "saturate(0.4) hue-rotate(170deg) brightness(1.25)", offset: 0.3 },
                                      { filter: "saturate(0.4) hue-rotate(170deg) brightness(1.25)", offset: 0.75 }, { filter: "none" }], { duration: 1500 }),
                    o.onde(calque, b, { couleur: "#bdf3ff", taille: 1.1, duree: 900, echelle: 1.7 })]);
            }
        },
        {
            id: "poison", nom: "Poison", categorie: "Attaque", sens: "vers l'ennemi",
            description: "Le héros lance une fiole de venin : elle éclate sur l'ennemi, qui verdit par vagues sous des bulles toxiques.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const VERT = "sepia(1) saturate(5) hue-rotate(55deg) brightness(0.95)";
                o.son("poison-lancer");
                await o.projectile(calque, a, b, { taille: 0.3, arc: 0.7, duree: Math.min(800, 360 + axe(a, b).d * 0.8), easing: "ease-in-out",
                    style: "background:radial-gradient(circle at 35% 35%, #e8ffc0, #7dd321 50%, #2e5a0a); box-shadow:0 0 10px #7dd321;" });
                o.son("poison-bulles");
                await Promise.all([
                    o.onde(calque, b, { couleur: "#7dd321", taille: 0.9, fond: "radial-gradient(circle, rgba(125,211,33,0.5), transparent 70%)", duree: 600, echelle: 1.6 }),
                    o.teinter(cible, [{ filter: "none" }, { filter: VERT, offset: 0.25 }, { filter: "none", offset: 0.5 }, { filter: VERT, offset: 0.75 }, { filter: "none" }], { duration: 1500 }),
                    o.gerbe(calque, b.x, b.y + b.t * 0.1, { nombre: 12, dist: b.t * 0.4, monte: b.t * 0.8, couleurs: ["#7dd321", "#b5ff4c", "#4e8a12"],
                                                           taille: 9, tailleMin: 4, duree: 1300, etale: 700 }),
                    o.secouer(cible, b.t * 0.05, 500)
                ]);
            }
        },
        {
            id: "coup-critique", nom: "Coup critique", categorie: "Attaque", sens: "vers l'ennemi",
            description: "Le héros s'embrase d'or, fond sur l'ennemi, une étoile dorée éclate sur lui.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const v = axe(a, b);
                o.son("critique-charge");
                await o.eclat(lanceur, "brightness(1.4) drop-shadow(0 0 12px #ffd700)", 380);
                const elan = o.elan(lanceur, a, b, { portee: 0.75, echelle: 1.12, prise: 0.15, frappe: 0.4, duree: 420, easing: "cubic-bezier(.5,0,.3,1)" });
                await o.attendre(170);
                o.son("critique-impact");
                const t = b.t * 2.2;
                const etoile = o.poser(calque, b.x, b.y, `width:${t}px; height:${t}px; z-index:4;`,
                    `<svg viewBox="-50 -50 100 100" width="100%" height="100%">${Array.from({ length: 12 }, (_, i) =>
                        `<polygon points="0,-48 4,-6 -4,-6" fill="${i % 2 ? "#fff3b0" : "#ffd700"}" transform="rotate(${i * 30})"/>`).join("")}
                        <circle r="10" fill="#fffbe6"/></svg>`);
                const texte = o.poser(calque, b.x, b.y - b.t * 0.9, `font-family:'Cinzel', serif; font-weight:bold; font-size:${Math.max(16, b.t * 0.36)}px;
                    color:#ffd700; text-shadow:0 2px 3px #000, 0 0 12px #ffb000; white-space:nowrap; z-index:5;`, "CRITIQUE !");
                await Promise.all([elan,
                    o.jouerPuisRetirer(etoile, [{ transform: "translate(-50%,-50%) scale(0.2) rotate(0deg)", opacity: 1 },
                                                { transform: "translate(-50%,-50%) scale(1) rotate(25deg)", opacity: 1, offset: 0.4 },
                                                { transform: "translate(-50%,-50%) scale(1.3) rotate(45deg)", opacity: 0 }], { duration: 650, easing: "ease-out" }),
                    o.jouerPuisRetirer(texte, [{ transform: "translate(-50%,-50%) scale(1.8)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.25 },
                                               { transform: "translate(-50%,-80%) scale(1)", opacity: 1, offset: 0.75 }, { transform: "translate(-50%,-120%) scale(0.9)", opacity: 0 }], { duration: 1300 }),
                    o.secouer(cible, b.t * 0.2, 450, v), o.eclat(cible, ROUGE, 500),
                    o.gerbe(calque, b.x, b.y, { nombre: 12, dist: b.t * 1.2, angle: v.angle, eventail: Math.PI * 1.4, couleurs: ["#ffd700", "#fff3b0"], taille: 6, duree: 800 })]);
            }
        },
        {
            id: "mise-a-terre", nom: "Mise à terre", categorie: "Impact", sens: "sur soi",
            description: "Frappé depuis l'ennemi, le héros vacille, s'effondre à l'opposé et pâlit… puis se relève.",
            async jouer({ lanceur, cible, calque }, o) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const loin = axe(b, a);   // il tombe à l'opposé de l'ennemi
                const tourne = loin.ux >= 0 ? 80 : -80;
                o.son("coup-sourd");
                o.son("chute", 900);
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

    window.ANIMATIONS_COMBAT = ANIMATIONS;
    window.animationCombatParId = (id) => ANIMATIONS.find(a => a.id === id) || null;

    // LA LECTURE EN COURS (une seule à la fois) : l'interrompre coupe ses sons
    // en attente et fait rendre la main à ses pauses.
    let enCours = null;
    window.annulerAnimationsCombat = function () {
        if (!enCours) return;
        enCours.annule = true;
        enCours.minuteurs.forEach(clearTimeout);
        enCours.minuteurs.clear();
        enCours.reveils.forEach(r => r());
        enCours.reveils.clear();
        enCours = null;
    };
    // Le point d'entrée, pour le Studio comme pour le combat de demain.
    window.jouerAnimationCombat = function (id, scene) {
        const anim = window.animationCombatParId(id);
        if (!anim || !scene || !scene.lanceur || !scene.calque) return Promise.resolve(false);
        window.annulerAnimationsCombat();
        const jeton = { annule: false, minuteurs: new Set(), reveils: new Set() };
        enCours = jeton;
        // Sans cible (un héros seul), l'axe pointe vers la droite.
        const cible = scene.cible || scene.lanceur;
        return Promise.resolve(anim.jouer({ ...scene, cible }, outils(jeton)))
            .then(() => { if (enCours === jeton) enCours = null; return !jeton.annule; },
                  (e) => { console.error("Animation " + id + " :", e); if (enCours === jeton) enCours = null; return false; });
    };
})();
