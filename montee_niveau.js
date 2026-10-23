// =========================================================================
//  IVALIS — LA MONTÉE DE NIVEAU (v256)
// =========================================================================
//  Nico : « quand un personnage monte de niveau, fais une popup avec
//  l'avatar, et en dessous l'animation de la jauge d'XP qui arrive au bout
//  avec un bruit de trompette, et le niveau I qui change en grossissant pour
//  le niveau II, etc. selon le niveau ».
//
//  QUI LA VOIT : le joueur du héros, sur ses postes. L'écoute des fiches
//  (ecouterPersonnagesDeLaPartie, app.js) passe chaque lecture à
//  surveillerMonteesDeNiveau ; le niveau déjà montré de chaque héros est
//  gardé sur le poste (localStorage) : un niveau gagné pendant qu'il était
//  fermé se fête à la réouverture, et jamais deux fois.
//
//  QUAND : tout de suite, sauf si l'écran est pris par la fin d'un combat
//  (le bandeau, la blessure) ou le butin — la popup attend qu'ils se ferment.
//  Plusieurs niveaux d'un coup : la jauge se remplit et le chiffre grandit
//  une fois par niveau.
//
//  Script simple (pas un module) : les bancs le chargent tel quel.
// =========================================================================

(function () {
    const CLE = (id) => "ivalis_NIVEAU_VU_" + id;
    const DUREE_REMPLISSAGE_MS = 1100;
    const file = [];
    let enCours = false;

    const lire = (cle) => { try { return JSON.parse(localStorage.getItem(cle) || "null"); } catch (e) { return null; } };
    const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* poste sans stockage */ } };
    const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));
    const reduit = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
    const echapper = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fr = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR");

    // I, II, III, IV… — le chiffre des niveaux, comme sur une stèle.
    window.chiffreRomain = function (n) {
        let x = Math.max(1, Math.floor(Number(n) || 1));
        const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
                       [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
        let s = "";
        table.forEach(([v, l]) => { while (x >= v) { s += l; x -= v; } });
        return s;
    };

    // La part de la jauge remplie pour cette XP, DANS ce niveau (0 à 1).
    function ratioDans(niveau, xp) {
        const debut = window.xpPourNiveau(niveau), suivant = window.xpPourNiveau(niveau + 1);
        return Math.max(0, Math.min(1, ((Number(xp) || 0) - debut) / Math.max(1, suivant - debut)));
    }

    // Chaque lecture des fiches : un héros de CE joueur qui a pris un niveau
    // depuis la dernière fois rejoint la file.
    window.surveillerMonteesDeNiveau = function (persos) {
        if (typeof window.niveauDepuisXP !== "function") return [];
        const joueur = moi();
        const nouveaux = [];
        (persos || []).forEach(p => {
            if (!p || !p.idPersonnage || p.estIllusion || p.estMonstre || p.camp === "Ennemi") return;
            if (!joueur || (p.idJoueur || "") !== joueur) return;
            const xp = window.xpDuPerso(p);
            const niveau = window.niveauDepuisXP(xp);
            const vu = lire(CLE(p.idPersonnage));
            ecrire(CLE(p.idPersonnage), { niveau, xp });
            if (!vu || typeof vu.niveau !== "number") return;   // premier passage : on retient, sans fête
            if (niveau > vu.niveau) nouveaux.push({ perso: p, de: vu.niveau, a: niveau, xpAvant: vu.xp, xp });
        });
        nouveaux.forEach(n => file.push(n));
        if (nouveaux.length > 0 && !enCours) suivante();
        return nouveaux;
    };

    // L'écran est-il pris par la fin d'un combat ou par le butin ?
    function ecranPris() {
        const voile = document.getElementById("fin-combat-voile");
        const butin = document.getElementById("fenetre-butin");
        const visible = (el) => !!el && el.style.display !== "none" && getComputedStyle(el).display !== "none";
        return visible(voile) || visible(butin);
    }

    async function suivante() {
        if (enCours) return;
        const item = file.shift();
        if (!item) return;
        enCours = true;
        try {
            let garde = 0;
            while (ecranPris() && garde++ < 600) await attendre(1000);
            await window.afficherMonteeNiveau(item);
        } catch (e) {
            console.error("Montée de niveau :", e);
        } finally {
            enCours = false;
            if (file.length > 0) suivante();
        }
    }

    function voile() {
        let v = document.getElementById("voile-niveau");
        if (!v) {
            v = document.createElement("div");
            v.id = "voile-niveau";
            v.className = "voile-niveau";
            document.body.appendChild(v);
        }
        return v;
    }

    // Une jauge qui glisse d'une largeur à l'autre (en %), sans à-coup.
    function glisser(barre, de, a, duree) {
        barre.style.width = a + "%";
        if (reduit() || typeof barre.animate !== "function" || duree <= 0) return Promise.resolve();
        const anim = barre.animate([{ width: de + "%" }, { width: a + "%" }], { duration: duree, easing: "cubic-bezier(.45,.05,.35,1)" });
        return anim.finished.catch(() => null);
    }

    // LA POPUP. `item` : { perso, de, a, xpAvant, xp }. Se résout au « Continuer ».
    window.afficherMonteeNiveau = function (item) {
        return new Promise(async (resolve) => {
            const p = item.perso || {};
            const de = Math.max(1, item.de || 1), a = Math.max(de + 1, item.a || de + 1);
            const nom = p.prenom || p.nom || "Le héros";
            const image = p.urlCloudinary || p.urlPortraitReference || p.urlToken || "";
            const v = voile();
            v.innerHTML = `<div class="carte-niveau" role="dialog" aria-label="Montée de niveau">
                <div class="niveau-titre">Niveau supérieur</div>
                <div class="niveau-portrait">${image ? `<img src="${echapper(image)}" alt="${echapper(nom)}">` : ""}</div>
                <div class="niveau-nom">${echapper(nom)}</div>
                <div class="niveau-medaillon"><span class="niveau-mot">Niveau</span><span class="niveau-romain">${window.chiffreRomain(de)}</span></div>
                <div class="niveau-jauge"><div class="niveau-jauge-remplie"></div></div>
                <div class="niveau-xp"></div>
                <ul class="niveau-gains"></ul>
                <button type="button" class="niveau-continuer">Continuer</button>
            </div>`;
            v.style.display = "flex";
            const carte = v.querySelector(".carte-niveau");
            const romain = v.querySelector(".niveau-romain");
            const barre = v.querySelector(".niveau-jauge-remplie");
            const texteXp = v.querySelector(".niveau-xp");
            const gains = v.querySelector(".niveau-gains");
            const bouton = v.querySelector(".niveau-continuer");
            requestAnimationFrame(() => carte.classList.add("visible"));

            const depart = typeof item.xpAvant === "number" ? ratioDans(de, item.xpAvant) * 100 : 0;
            barre.style.width = depart + "%";
            texteXp.textContent = `${fr(item.xp)} XP`;
            await attendre(reduit() ? 0 : 650);

            // Une fois par niveau gagné : la jauge va au bout, la trompette
            // sonne, le chiffre change en grossissant.
            let largeur = depart;
            for (let n = de + 1; n <= a; n++) {
                await glisser(barre, largeur, 100, DUREE_REMPLISSAGE_MS * (1 - largeur / 100) + 250);
                if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement("trompette-niveau");
                carte.classList.add("plein");
                romain.textContent = window.chiffreRomain(n);
                if (!reduit() && typeof romain.animate === "function") {
                    romain.animate([{ transform: "scale(1)" }, { transform: "scale(1.9)", offset: 0.35 }, { transform: "scale(1)" }],
                                   { duration: 900, easing: "cubic-bezier(.2,.9,.3,1.2)" });
                }
                const gain = typeof window.gainDuNiveau === "function" ? window.gainDuNiveau(n) : "";
                const li = document.createElement("li");
                li.textContent = `Niveau ${window.chiffreRomain(n)}${gain ? " : " + gain : ""}`;
                gains.appendChild(li);
                await attendre(reduit() ? 0 : 1000);
                carte.classList.remove("plein");
                largeur = 0;
                if (n < a) barre.style.width = "0%";
            }
            // Puis l'XP déjà gagnée dans le nouveau niveau.
            const fin = ratioDans(a, item.xp) * 100;
            await glisser(barre, 0, fin, 600);
            texteXp.textContent = `${fr(item.xp)} / ${fr(window.xpPourNiveau(a + 1))} XP`;
            bouton.classList.add("visible");
            bouton.focus({ preventScroll: true });
            bouton.onclick = () => {
                if (typeof window.jouerSonClic === "function") window.jouerSonClic();
                v.classList.add("se-ferme");
                setTimeout(() => { v.style.display = "none"; v.classList.remove("se-ferme"); v.innerHTML = ""; resolve(); }, reduit() ? 0 : 350);
            };
        });
    };
})();
