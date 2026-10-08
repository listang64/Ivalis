// =========================================================================
//  IVALIS — LES ANIMATIONS DE COMBAT (le catalogue du Studio d'animation)
// =========================================================================
//  Nico : « dans les paramètres, un bouton Studio d'animation : à gauche la
//  réplique de la carte du combat, mon pion sur un hexagone central et un
//  ennemi inerte à côté ; à droite la liste des futures animations de combat
//  que nous allons créer. Un clic sur une animation la joue en direct sur mon
//  pion ; pour chacune, une case à cocher pour me rappeler si elle est
//  intégrée ou non. »
//
//  CE FICHIER EST LE CATALOGUE, ET RIEN QUE LUI. Une animation est une
//  fonction `jouer({ lanceur, cible, calque })` qui rend une promesse :
//    • lanceur, cible : les PIONS (des éléments posés par leur centre, avec
//      `transform: translate(-50%, -50%)` — exactement comme les pions du
//      plateau de combat, `.token-vtt`) ;
//    • calque : l'élément où poser les effets (étincelles, projectiles…),
//      dans le même repère que les pions.
//  Le Studio (studio_animation.js) l'appelle sur sa réplique du plateau ; le
//  jour où une animation sera intégrée au combat, le combat l'appellera sur
//  ses vrais pions, avec le même code. Ajouter une animation, c'est ajouter
//  une entrée à ANIMATIONS_COMBAT, rien d'autre.
//
//  Script simple (pas un module) : chargé tel quel par la page et par les bancs.
// =========================================================================

(function () {
    // Les pions sont posés par leur centre : toute transformation garde ce
    // décalage, sinon le pion sauterait d'un demi-pion en bas à droite.
    const BASE = "translate(-50%, -50%)";
    const fini = (a) => a.finished.catch(() => {});
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));

    function bouger(el, images, options) {
        if (!el || typeof el.animate !== "function") return Promise.resolve();
        return fini(el.animate(images.map(f => ({ ...f, transform: BASE + " " + (f.transform || "") })), options));
    }
    function teinter(el, images, options) {
        if (!el || typeof el.animate !== "function") return Promise.resolve();
        return fini(el.animate(images, options));
    }

    // Le centre d'un pion dans le repère du calque, et sa taille à l'écran.
    function centre(el, calque) {
        const r = el.getBoundingClientRect(), c = calque.getBoundingClientRect();
        return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2, t: r.width || 60 };
    }

    // Un effet posé dans le calque, centré sur (x, y). `style` : son allure.
    function poser(calque, x, y, style, contenu) {
        const d = document.createElement("div");
        d.className = "anim-effet";
        d.style.cssText = `position:absolute; left:${x}px; top:${y}px; transform:translate(-50%,-50%); pointer-events:none; ${style || ""}`;
        if (contenu) d.innerHTML = contenu;
        calque.appendChild(d);
        return d;
    }
    // Un effet joue, puis s'en va.
    async function jouerPuisRetirer(el, images, options) {
        await teinter(el, images, options);
        el.remove();
    }
    const hasard = (a, b) => a + Math.random() * (b - a);

    // Une gerbe de particules autour de (x, y).
    function gerbe(calque, x, y, o) {
        const n = o.nombre || 10;
        const fins = [];
        for (let i = 0; i < n; i++) {
            const angle = (o.angle !== undefined ? o.angle : 0) + (o.eventail || Math.PI * 2) * (i / n - 0.5) + hasard(-0.2, 0.2);
            const dist = hasard(o.distMin || o.dist * 0.6, o.dist);
            const taille = hasard(o.tailleMin || 4, o.taille || 8);
            const p = poser(calque, x, y, `width:${taille}px; height:${taille}px; border-radius:${o.carre ? "2px" : "50%"};
                background:${o.couleurs[i % o.couleurs.length]}; box-shadow:0 0 ${taille * 1.5}px ${o.couleurs[0]};`, o.texte ? o.texte : "");
            if (o.texte) { p.style.background = "none"; p.style.boxShadow = "none"; p.style.color = o.couleurs[i % o.couleurs.length];
                           p.style.fontWeight = "bold"; p.style.fontSize = taille + "px"; p.style.textShadow = `0 0 6px ${o.couleurs[0]}`; }
            const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist - (o.monte || 0);
            fins.push(jouerPuisRetirer(p, [
                { transform: "translate(-50%,-50%) scale(0.4)", opacity: 0 },
                { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35}px)) scale(1)`, opacity: 1, offset: 0.25 },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0 }
            ], { duration: o.duree || 700, delay: (o.etale || 0) * Math.random(), easing: "cubic-bezier(.2,.7,.3,1)" }));
        }
        return Promise.all(fins);
    }

    // Une secousse : le coup qu'on encaisse.
    const secouer = (el, force, duree) => bouger(el, [
        { transform: "translate(0,0)" }, { transform: `translate(${force}px, ${-force * 0.3}px)` },
        { transform: `translate(${-force * 0.8}px, ${force * 0.25}px)` }, { transform: `translate(${force * 0.5}px, 0)` },
        { transform: `translate(${-force * 0.25}px, 0)` }, { transform: "translate(0,0)" }
    ], { duration: duree || 320 });
    // Un éclat de couleur sur le pion (un coup, un soin, un gel…).
    const eclat = (el, filtre, duree) => teinter(el, [{ filter: "none" }, { filter: filtre, offset: 0.3 }, { filter: "none" }], { duration: duree || 420 });
    const ROUGE = "sepia(1) saturate(7) hue-rotate(-45deg) brightness(1.05)";

    // Un nombre qui s'envole au-dessus du pion (les dégâts, le soin).
    function nombreVolant(calque, pos, texte, couleur) {
        const n = poser(calque, pos.x, pos.y - pos.t * 0.45, `font-family:'Cinzel', serif; font-weight:bold; font-size:${Math.max(16, pos.t * 0.42)}px;
            color:${couleur}; text-shadow:0 2px 3px #000, 0 0 10px ${couleur}; white-space:nowrap; z-index:5;`, texte);
        return jouerPuisRetirer(n, [
            { transform: "translate(-50%,-50%) scale(0.6)", opacity: 0 },
            { transform: "translate(-50%,-90%) scale(1.15)", opacity: 1, offset: 0.2 },
            { transform: "translate(-50%,-220%) scale(1)", opacity: 0 }
        ], { duration: 1100, easing: "ease-out" });
    }

    // Une onde qui s'élargit (le sol qui s'illumine, l'explosion).
    function onde(calque, pos, o) {
        const d = poser(calque, pos.x, pos.y + (o.decalage || 0), `width:${pos.t * (o.taille || 1)}px; height:${pos.t * (o.taille || 1) * (o.aplati || 1)}px;
            border-radius:50%; border:${o.bord || 3}px solid ${o.couleur}; box-shadow:0 0 14px ${o.couleur}, inset 0 0 12px ${o.couleur};
            background:${o.fond || "transparent"};`);
        return jouerPuisRetirer(d, [
            { transform: "translate(-50%,-50%) scale(0.3)", opacity: 0.9 },
            { transform: `translate(-50%,-50%) scale(${o.echelle || 1.6})`, opacity: 0 }
        ], { duration: o.duree || 700, delay: o.retard || 0, easing: "ease-out" });
    }

    // =====================================================================
    //  LE CATALOGUE
    // =====================================================================
    const ANIMATIONS = [
        {
            id: "coup-epee", nom: "Coup d'épée", categorie: "Attaque",
            description: "Le héros prend son élan, fond sur l'ennemi, une entaille blanche le traverse.",
            async jouer({ lanceur, cible, calque }) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const dx = b.x - a.x, dy = b.y - a.y;
                const elan = bouger(lanceur, [
                    { transform: "translate(0,0)" },
                    { transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.03)`, offset: 0.35 },
                    { transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) scale(1.08)`, offset: 0.6 },
                    { transform: "translate(0,0)" }
                ], { duration: 560, easing: "cubic-bezier(.3,.7,.3,1)" });
                await attendre(330);
                const t = b.t * 1.5;
                const entaille = poser(calque, b.x, b.y, `width:${t}px; height:${t}px; z-index:4;`,
                    `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M15 80 Q 45 45 88 18" fill="none" stroke="#fff" stroke-width="7"
                      stroke-linecap="round" stroke-dasharray="120" stroke-dashoffset="120" style="filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 12px #9cf)"/></svg>`);
                const trait = entaille.querySelector("path");
                const coupe = teinter(trait, [{ strokeDashoffset: 120, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.5 }, { strokeDashoffset: -120, opacity: 0 }], { duration: 380, easing: "ease-out" });
                await Promise.all([elan, coupe.then(() => entaille.remove()), secouer(cible, b.t * 0.1), eclat(cible, ROUGE),
                                   gerbe(calque, b.x, b.y, { nombre: 8, dist: b.t * 0.7, couleurs: ["#fff", "#ffd6d6"], taille: 5 })]);
            }
        },
        {
            id: "coup-recu", nom: "Coup reçu", categorie: "Impact",
            description: "Le pion encaisse : secousse, éclat rouge, et les dégâts qui s'envolent.",
            async jouer({ lanceur, calque }) {
                const a = centre(lanceur, calque);
                await Promise.all([secouer(lanceur, a.t * 0.12, 380), eclat(lanceur, ROUGE, 480),
                                   nombreVolant(calque, a, "−12", "#ff4c4c"),
                                   gerbe(calque, a.x, a.y, { nombre: 7, dist: a.t * 0.6, couleurs: ["#c4141c", "#ff6b6b"], taille: 6 })]);
            }
        },
        {
            id: "soin", nom: "Soin", categorie: "Soin",
            description: "Une lueur verte monte du sol, des éclats de vie s'élèvent autour du héros.",
            async jouer({ lanceur, calque }) {
                const a = centre(lanceur, calque);
                await Promise.all([
                    onde(calque, a, { couleur: "#7dff9a", taille: 1.2, aplati: 0.45, decalage: a.t * 0.35, duree: 1100, echelle: 1.5 }),
                    onde(calque, a, { couleur: "#b6ffc6", taille: 1.2, aplati: 0.45, decalage: a.t * 0.35, duree: 1100, echelle: 1.5, retard: 300 }),
                    eclat(lanceur, "brightness(1.45) drop-shadow(0 0 10px #7dff9a)", 1200),
                    gerbe(calque, a.x, a.y + a.t * 0.2, { nombre: 9, dist: a.t * 0.35, monte: a.t * 0.9, couleurs: ["#7dff9a", "#d9ffe1"],
                                                          texte: "+", taille: 18, tailleMin: 12, duree: 1300, etale: 500 }),
                    nombreVolant(calque, a, "+15", "#7dff9a")
                ]);
            }
        },
        {
            id: "bouclier", nom: "Bouclier magique", categorie: "Défense",
            description: "Un dôme cyan se referme sur le héros, pulse, puis se dissipe.",
            async jouer({ lanceur, calque }) {
                const a = centre(lanceur, calque);
                const dome = poser(calque, a.x, a.y, `width:${a.t * 1.45}px; height:${a.t * 1.45}px; border-radius:50%; z-index:4;
                    border:2px solid rgba(160,245,255,0.9); background:radial-gradient(circle, rgba(91,232,255,0.05) 45%, rgba(91,232,255,0.35) 75%, rgba(220,255,255,0.6) 100%);
                    box-shadow:0 0 18px #5be8ff, inset 0 0 18px #5be8ff;`);
                await teinter(dome, [
                    { transform: "translate(-50%,-50%) scale(0.2)", opacity: 0 },
                    { transform: "translate(-50%,-50%) scale(1.08)", opacity: 1, offset: 0.25 },
                    { transform: "translate(-50%,-50%) scale(0.98)", opacity: 0.85, offset: 0.45 },
                    { transform: "translate(-50%,-50%) scale(1.03)", opacity: 0.95, offset: 0.65 },
                    { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 }
                ], { duration: 1700, easing: "ease-in-out" });
                dome.remove();
            }
        },
        {
            id: "boule-de-feu", nom: "Boule de feu", categorie: "Sort",
            description: "Une boule de feu file vers l'ennemi en traînant des braises, et explose.",
            async jouer({ lanceur, cible, calque }) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const t = a.t * 0.45;
                await eclat(lanceur, "brightness(1.3) drop-shadow(0 0 10px #ff8c1a)", 260);
                const boule = poser(calque, a.x, a.y, `width:${t}px; height:${t}px; border-radius:50%; z-index:4;
                    background:radial-gradient(circle at 40% 40%, #fff6c4, #ffb02e 40%, #e8420c 75%, rgba(200,30,0,0) 100%); box-shadow:0 0 18px #ff7a1a, 0 0 36px #ff4500;`);
                const duree = 520;
                const vol = teinter(boule, [
                    { transform: "translate(-50%,-50%) scale(0.6)" },
                    { transform: `translate(calc(-50% + ${(b.x - a.x) * 0.5}px), calc(-50% + ${(b.y - a.y) * 0.5 - a.t * 0.35}px)) scale(1)`, offset: 0.5 },
                    { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(1.1)` }
                ], { duration: duree, easing: "ease-in" });
                const braises = [];
                for (let k = 1; k < 9; k++) {
                    const f = k / 9, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f - Math.sin(Math.PI * f) * a.t * 0.35;
                    braises.push(attendre(duree * f).then(() => gerbe(calque, x, y, { nombre: 2, dist: t * 0.6, couleurs: ["#ffb02e", "#ff5a0a"], taille: 5, duree: 450 })));
                }
                await vol;
                boule.remove();
                await Promise.all([...braises,
                    onde(calque, b, { couleur: "#ff7a1a", taille: 1, fond: "radial-gradient(circle, rgba(255,240,180,0.9), rgba(255,120,20,0.5) 60%, transparent)", duree: 600, echelle: 2 }),
                    onde(calque, b, { couleur: "#ffcf5a", taille: 0.8, duree: 700, echelle: 2.4, retard: 80 }),
                    gerbe(calque, b.x, b.y, { nombre: 14, dist: b.t * 1.1, couleurs: ["#ffcf5a", "#ff7a1a", "#e8420c"], taille: 7, duree: 800 }),
                    secouer(cible, b.t * 0.12), eclat(cible, "sepia(1) saturate(5) hue-rotate(-20deg) brightness(1.2)", 600)]);
            }
        },
        {
            id: "esquive", nom: "Esquive", categorie: "Déplacement",
            description: "Un pas de côté fulgurant : le coup ne trouve qu'une image fantôme.",
            async jouer({ lanceur, cible, calque }) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const lg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const px = -(b.y - a.y) / lg * a.t * 0.7, py = (b.x - a.x) / lg * a.t * 0.7;
                const fantome = lanceur.cloneNode(true);
                fantome.removeAttribute("id");
                fantome.classList.add("anim-effet");
                fantome.style.pointerEvents = "none";
                lanceur.parentNode.insertBefore(fantome, lanceur);
                const trace = teinter(fantome, [{ opacity: 0.55, filter: "grayscale(0.6) brightness(1.4)" }, { opacity: 0, filter: "grayscale(1) brightness(1.6)" }], { duration: 650 });
                await bouger(lanceur, [
                    { transform: "translate(0,0)" },
                    { transform: `translate(${px}px, ${py}px) skewX(-10deg)`, offset: 0.25 },
                    { transform: `translate(${px}px, ${py}px)`, offset: 0.7 },
                    { transform: "translate(0,0)" }
                ], { duration: 820, easing: "cubic-bezier(.2,.9,.3,1)" });
                await trace;
                fantome.remove();
            }
        },
        {
            id: "gel", nom: "Gel", categorie: "État",
            description: "Des éclats de glace se figent autour de l'ennemi, qui bleuit sous le givre.",
            async jouer({ cible, calque }) {
                const b = centre(cible, calque);
                const eclats = [];
                for (let i = 0; i < 7; i++) {
                    const ang = (i / 7) * Math.PI * 2, r = b.t * 0.55;
                    const c = poser(calque, b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r, `width:${b.t * 0.16}px; height:${b.t * 0.42}px; z-index:4;
                        background:linear-gradient(180deg, #ffffff, #9fe6ff 50%, #3aa8e8); clip-path:polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
                        filter:drop-shadow(0 0 4px #bdf3ff);`);
                    const rot = (ang * 180 / Math.PI) + 90;
                    eclats.push(jouerPuisRetirer(c, [
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0)`, opacity: 0 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.3 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.75 },
                        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.4)`, opacity: 0 }
                    ], { duration: 1500, delay: i * 50, easing: "ease-out" }));
                }
                await Promise.all([...eclats,
                    teinter(cible, [{ filter: "none" }, { filter: "saturate(0.4) hue-rotate(170deg) brightness(1.25)", offset: 0.3 },
                                    { filter: "saturate(0.4) hue-rotate(170deg) brightness(1.25)", offset: 0.75 }, { filter: "none" }], { duration: 1600 }),
                    onde(calque, b, { couleur: "#bdf3ff", taille: 1.1, duree: 900, echelle: 1.7 })]);
            }
        },
        {
            id: "poison", nom: "Poison", categorie: "État",
            description: "Le venin ronge : le héros verdit par vagues, des bulles toxiques remontent.",
            async jouer({ lanceur, calque }) {
                const a = centre(lanceur, calque);
                const VERT = "sepia(1) saturate(5) hue-rotate(55deg) brightness(0.95)";
                await Promise.all([
                    teinter(lanceur, [{ filter: "none" }, { filter: VERT, offset: 0.25 }, { filter: "none", offset: 0.5 }, { filter: VERT, offset: 0.75 }, { filter: "none" }], { duration: 1500 }),
                    gerbe(calque, a.x, a.y + a.t * 0.1, { nombre: 12, dist: a.t * 0.4, monte: a.t * 0.8, couleurs: ["#7dd321", "#b5ff4c", "#4e8a12"],
                                                         taille: 9, tailleMin: 4, duree: 1300, etale: 700 }),
                    secouer(lanceur, a.t * 0.05, 500)
                ]);
            }
        },
        {
            id: "coup-critique", nom: "Coup critique", categorie: "Attaque",
            description: "Le héros s'embrase d'or, frappe d'un éclair, une étoile dorée éclate sur l'ennemi.",
            async jouer({ lanceur, cible, calque }) {
                const a = centre(lanceur, calque), b = centre(cible, calque);
                const dx = b.x - a.x, dy = b.y - a.y;
                await eclat(lanceur, "brightness(1.4) drop-shadow(0 0 12px #ffd700)", 380);
                const elan = bouger(lanceur, [
                    { transform: "translate(0,0)" },
                    { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(1.12)`, offset: 0.4 },
                    { transform: "translate(0,0)" }
                ], { duration: 420, easing: "cubic-bezier(.5,0,.3,1)" });
                await attendre(170);
                const t = b.t * 2.2;
                const etoile = poser(calque, b.x, b.y, `width:${t}px; height:${t}px; z-index:4;`,
                    `<svg viewBox="-50 -50 100 100" width="100%" height="100%">${Array.from({ length: 12 }, (_, i) =>
                        `<polygon points="0,-48 4,-6 -4,-6" fill="${i % 2 ? "#fff3b0" : "#ffd700"}" transform="rotate(${i * 30})"/>`).join("")}
                        <circle r="10" fill="#fffbe6"/></svg>`);
                const texte = poser(calque, b.x, b.y - b.t * 0.9, `font-family:'Cinzel', serif; font-weight:bold; font-size:${Math.max(16, b.t * 0.36)}px;
                    color:#ffd700; text-shadow:0 2px 3px #000, 0 0 12px #ffb000; white-space:nowrap; z-index:5;`, "CRITIQUE !");
                await Promise.all([elan,
                    jouerPuisRetirer(etoile, [{ transform: "translate(-50%,-50%) scale(0.2) rotate(0deg)", opacity: 1 },
                                              { transform: "translate(-50%,-50%) scale(1) rotate(25deg)", opacity: 1, offset: 0.4 },
                                              { transform: "translate(-50%,-50%) scale(1.3) rotate(45deg)", opacity: 0 }], { duration: 650, easing: "ease-out" }),
                    jouerPuisRetirer(texte, [{ transform: "translate(-50%,-50%) scale(1.8)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.25 },
                                             { transform: "translate(-50%,-80%) scale(1)", opacity: 1, offset: 0.75 }, { transform: "translate(-50%,-120%) scale(0.9)", opacity: 0 }], { duration: 1300 }),
                    secouer(cible, b.t * 0.2, 450), eclat(cible, ROUGE, 500),
                    gerbe(calque, b.x, b.y, { nombre: 12, dist: b.t * 1.2, couleurs: ["#ffd700", "#fff3b0"], taille: 6, duree: 800 })]);
            }
        },
        {
            id: "mise-a-terre", nom: "Mise à terre", categorie: "Impact",
            description: "Le héros vacille, s'effondre et pâlit… puis se relève.",
            async jouer({ lanceur, calque }) {
                const a = centre(lanceur, calque);
                await bouger(lanceur, [
                    { transform: "translate(0,0) rotate(0deg)", filter: "none", opacity: 1 },
                    { transform: `translate(${a.t * 0.05}px, 0) rotate(8deg)`, offset: 0.15 },
                    { transform: `translate(${-a.t * 0.04}px, 0) rotate(-6deg)`, offset: 0.3 },
                    { transform: `translate(${a.t * 0.1}px, ${a.t * 0.18}px) rotate(80deg) scale(0.92)`, filter: "grayscale(1) brightness(0.6)", opacity: 0.55, offset: 0.5 },
                    { transform: `translate(${a.t * 0.1}px, ${a.t * 0.18}px) rotate(80deg) scale(0.92)`, filter: "grayscale(1) brightness(0.6)", opacity: 0.55, offset: 0.8 },
                    { transform: "translate(0,0) rotate(0deg)", filter: "none", opacity: 1 }
                ], { duration: 2400, easing: "ease-in-out" });
            }
        }
    ];

    window.ANIMATIONS_COMBAT = ANIMATIONS;
    window.animationCombatParId = (id) => ANIMATIONS.find(a => a.id === id) || null;
    // Le point d'entrée, pour le Studio comme pour le combat de demain.
    window.jouerAnimationCombat = function (id, scene) {
        const anim = window.animationCombatParId(id);
        if (!anim || !scene || !scene.lanceur || !scene.calque) return Promise.resolve(false);
        return Promise.resolve(anim.jouer(scene)).then(() => true, (e) => { console.error("Animation " + id + " :", e); return false; });
    };
})();
