// =========================================================================
//  IVALIS — LA SCÈNE DU D20 (jet de caractéristique depuis la fiche perso)
// =========================================================================
//  Un clic sur le d20 d'une caractéristique écrit le jet dans la partie
//  (Action_Des, app.js) ; CHAQUE poste reçoit la même valeur et joue ici la
//  même scène :
//
//    1. l'écran s'assombrit en fondu, pour tout le monde ; l'avatar du lanceur
//       entre en grand, côté droit, par-dessus tout le jeu ;
//    2. un d20 au milieu de l'écran : les chiffres défilent, de moins en moins
//       vite, et s'arrêtent sur le résultat tiré ;
//    3. un modificateur (+3) s'affiche en doré juste à côté, et s'égrène : +3
//       → +2 → +1, le dé grossit un peu dans une lueur dorée et reprend sa
//       taille à chaque cran, son chiffre monte de 1. Un malus (−2) descend de
//       la même façon, sans dorure, et le dé rétrécit à chaque cran ;
//    4. le résultat final, avec des lueurs dorées qui dansent autour et sous
//       le dé ;
//    5. un 1 NATUREL passe tout au rouge (dé, chiffre, lueurs), un 20 NATUREL
//       tout au violet — dès que le dé s'arrête, et jusqu'à la fin.
//
//  La scène se ferme au toucher (une fois le résultat final affiché), ou
//  d'elle-même dix secondes plus tard. Le message du chat part au moment du
//  résultat final, depuis le seul poste qui a lancé (posterJetDansLeChat,
//  app.js) — il ne dépend donc pas du moment où chacun ferme la scène.
//
//  Les chiffres qui défilent ne sont qu'un spectacle, tirés localement : seul
//  le résultat (le même partout) vient de la base.
// =========================================================================

(function () {
    const NS = "http://www.w3.org/2000/svg";

    // Réglages de rythme, réunis ici (et lisibles par un banc).
    const RYTHME_D20 = {
        fondu: 600,          // l'écran qui s'assombrit
        entree: 450,         // le dé qui apparaît
        tics: 22,            // chiffres qui défilent
        ticMin: 38,          // premier intervalle (ms)
        ticMax: 330,         // allonge du dernier intervalle (ms)
        pauseAvantMod: 550,
        cran: 560,           // un cran de modificateur
        fermetureAuto: 10000
    };
    window.RYTHME_D20 = RYTHME_D20;

    // ---------------------------------------------------------------------
    //  LE DÉ : un icosaèdre vu de face — hexagone, triangle central, facettes.
    // ---------------------------------------------------------------------
    function point(angleDeg, rayon) {
        const a = angleDeg * Math.PI / 180;
        return [Math.cos(a) * rayon, Math.sin(a) * rayon];
    }
    function dessinerDe() {
        const R = 100, r = 58;
        const H = [-90, -30, 30, 90, 150, 210].map(a => point(a, R));
        const T = [-90, 30, 150].map(a => point(a, r));
        const face = (pts, classe) => {
            const p = document.createElementNS(NS, "polygon");
            p.setAttribute("points", pts.map(x => x.join(",")).join(" "));
            p.setAttribute("class", classe);
            return p;
        };
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "-110 -110 220 220");
        svg.setAttribute("class", "d20-svg");
        // Les dix facettes visibles : la face centrale, les trois qui la
        // bordent, puis les six coins — chaque groupe dans sa teinte.
        [
            [[H[5], H[0], T[0]], "d20-f d20-haut"], [[H[0], H[1], T[0]], "d20-f d20-haut"],
            [[H[1], H[2], T[1]], "d20-f d20-cote"], [[H[4], H[5], T[2]], "d20-f d20-cote"],
            [[H[2], H[3], T[1]], "d20-f d20-bas"], [[H[3], H[4], T[2]], "d20-f d20-bas"],
            [[T[0], T[1], H[1]], "d20-f d20-bord"], [[T[2], T[0], H[5]], "d20-f d20-bord"],
            [[T[1], T[2], H[3]], "d20-f d20-bord-bas"],
            [T, "d20-f d20-centre"]
        ].forEach(([pts, c]) => svg.appendChild(face(pts, c)));
        // Le reflet : une nappe claire sur le haut du dé, qui ne change pas de
        // couleur avec le thème — c'est la lumière, pas la matière.
        svg.appendChild(face([H[5], H[0], H[1], T[0]], "d20-reflet"));
        const contour = face(H, "d20-contour");
        svg.appendChild(contour);
        const chiffre = document.createElementNS(NS, "text");
        chiffre.setAttribute("x", "0");
        chiffre.setAttribute("y", "4");
        chiffre.setAttribute("class", "d20-chiffre");
        chiffre.setAttribute("text-anchor", "middle");
        chiffre.setAttribute("dominant-baseline", "middle");
        chiffre.textContent = "20";
        svg.appendChild(chiffre);
        return { svg, chiffre };
    }

    // ---------------------------------------------------------------------
    //  LA SCÈNE : construite une fois, réutilisée à chaque jet.
    // ---------------------------------------------------------------------
    let scene = null;
    function construireScene() {
        const hote = document.getElementById("overlay-jet-des");
        if (!hote) return null;
        if (scene && scene.hote === hote) return scene;
        hote.className = "scene-d20";
        hote.innerHTML = `
            <div class="scene-d20-voile"></div>
            <img class="scene-d20-avatar" alt="">
            <div class="scene-d20-centre">
              <div class="scene-d20-titre"></div>
              <div class="scene-d20-piste">
                <div class="scene-d20-lueurs">${"<span></span>".repeat(7)}</div>
                <div class="scene-d20-de"></div>
                <div class="scene-d20-mod"></div>
              </div>
              <div class="scene-d20-sol"></div>
              <div class="scene-d20-indice">Touchez pour fermer</div>
            </div>`;
        const { svg, chiffre } = dessinerDe();
        hote.querySelector(".scene-d20-de").appendChild(svg);
        scene = {
            hote,
            avatar: hote.querySelector(".scene-d20-avatar"),
            titre: hote.querySelector(".scene-d20-titre"),
            de: hote.querySelector(".scene-d20-de"),
            mod: hote.querySelector(".scene-d20-mod"),
            chiffre
        };
        // Fermer au toucher — seulement une fois le résultat final posé : un
        // doigt qui traîne ne doit pas couper le jet des autres.
        hote.addEventListener("click", () => {
            if (hote.classList.contains("d20-final")) fermer();
        });
        return scene;
    }

    // Un jet chasse le précédent : chaque scène porte son numéro, et une
    // étape qui découvre qu'un autre jet a commencé s'arrête là.
    let numeroScene = 0;
    let minuterieFermeture = null;
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));

    function avatarDuLanceur(donnees) {
        const persos = window.PERSOS_PARTIE || [];
        const nom = String(donnees.nomPerso || "").trim();
        const p = persos.find(x => donnees.idPerso && x.idPersonnage === donnees.idPerso)
            || persos.find(x => `${x.prenom || ""} ${x.nom || ""}`.trim() === nom || x.prenom === nom);
        return (p && (p.urlCloudinary || p.URL_Cloudinary)) || "";
    }

    function son(jouer) {
        const audio = document.getElementById("audio-roulette");
        if (!audio) return;
        if (jouer) {
            const reglages = window.PARAMETRES_AUDIO || { interface: 1, general: 1 };
            audio.volume = Math.max(0, Math.min(1, (reglages.interface || 0) * (reglages.general || 0)));
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } else {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    function fermer() {
        const s = scene;
        numeroScene++;
        if (minuterieFermeture) { clearTimeout(minuterieFermeture); minuterieFermeture = null; }
        son(false);
        if (!s) return;
        s.hote.classList.remove("d20-visible");
        setTimeout(() => {
            if (!s.hote.classList.contains("d20-visible")) s.hote.style.display = "none";
        }, RYTHME_D20.fondu);
    }
    window.fermerJetD20 = fermer;

    // Les intervalles du défilement : de plus en plus longs, jusqu'à l'arrêt.
    window.intervallesDefilementD20 = function () {
        const n = RYTHME_D20.tics;
        return Array.from({ length: n }, (_, i) =>
            Math.round(RYTHME_D20.ticMin + Math.pow(i / (n - 1), 2.4) * RYTHME_D20.ticMax));
    };

    // Le thème : "or" par défaut, "rouge" sur un 1 naturel, "violet" sur un 20.
    window.themeJetD20 = (brut) => brut === 1 ? "rouge" : (brut === 20 ? "violet" : "or");

    window.jouerAnimationDesGlobal = async function (donnees) {
        if (!donnees) return;
        const s = construireScene();
        if (!s) return;
        const moi = ++numeroScene;
        const encore = () => moi === numeroScene;
        if (minuterieFermeture) { clearTimeout(minuterieFermeture); minuterieFermeture = null; }

        const brut = Math.max(1, Math.min(20, parseInt(donnees.resultatBrut) || 1));
        const mod = parseInt(donnees.modificateur) || 0;
        const total = (donnees.totalFinal !== undefined && donnees.totalFinal !== null)
            ? parseInt(donnees.totalFinal) : brut + mod;

        // --- 1. LE FONDU ET L'AVATAR ------------------------------------
        const h = s.hote;
        h.classList.remove("d20-visible", "d20-final", "d20-roule", "d20-pose",
                           "theme-rouge", "theme-violet", "theme-or");
        h.classList.add("theme-or");
        h.dataset.brut = String(brut);
        h.dataset.total = String(total);
        s.titre.textContent = `Jet de ${donnees.caract || "caractéristique"} — ${donnees.nomPerso || ""}`.replace(/ — $/, "");
        s.mod.className = "scene-d20-mod";
        s.mod.textContent = "";
        s.chiffre.textContent = String(1 + Math.floor(Math.random() * 20));
        const url = avatarDuLanceur(donnees);
        s.avatar.style.display = url ? "block" : "none";
        if (url) s.avatar.src = url;
        h.style.display = "block";
        void h.offsetWidth;                 // le fondu part de zéro
        h.classList.add("d20-visible");
        await attendre(RYTHME_D20.entree);
        if (!encore()) return;

        // --- 2. LE DÉ ROULE ---------------------------------------------
        h.classList.add("d20-roule");
        son(true);
        let precedent = parseInt(s.chiffre.textContent);
        const intervalles = window.intervallesDefilementD20();
        for (let i = 0; i < intervalles.length; i++) {
            const dernier = i === intervalles.length - 1;
            let n = dernier ? brut : 1 + Math.floor(Math.random() * 20);
            if (!dernier && n === precedent) n = (n % 20) + 1;
            precedent = n;
            s.chiffre.textContent = String(n);
            // Le dé tangue un peu à chaque chiffre, de moins en moins.
            const amplitude = 12 * (1 - i / intervalles.length);
            s.de.style.transform = dernier ? "" :
                `rotate(${(Math.random() * 2 - 1) * amplitude}deg) scale(${1 + Math.random() * 0.04})`;
            await attendre(intervalles[i]);
            if (!encore()) return;
        }
        son(false);
        h.classList.remove("d20-roule");
        h.classList.add("d20-pose");
        const theme = window.themeJetD20(brut);
        if (theme !== "or") { h.classList.remove("theme-or"); h.classList.add("theme-" + theme); }

        // --- 3. LE MODIFICATEUR, CRAN PAR CRAN ---------------------------
        if (mod !== 0) {
            await attendre(RYTHME_D20.pauseAvantMod);
            if (!encore()) return;
            const signe = mod > 0 ? 1 : -1;
            const ecrire = (reste) => { s.mod.textContent = (reste > 0 ? "+" : "−") + Math.abs(reste); };
            ecrire(mod);
            s.mod.classList.add("d20-mod-visible", signe > 0 ? "d20-mod-bonus" : "d20-mod-malus");
            await attendre(RYTHME_D20.cran * 0.7);
            let valeur = brut;
            for (let reste = mod; reste !== 0; reste -= signe) {
                if (!encore()) return;
                // Le dernier cran vide l'étiquette : elle s'efface au lieu
                // d'afficher « +0 ».
                if (reste - signe === 0) s.mod.classList.add("d20-mod-epuise");
                else ecrire(reste - signe);
                s.de.classList.remove("d20-cran-haut", "d20-cran-bas");
                void s.de.offsetWidth;
                s.de.classList.add(signe > 0 ? "d20-cran-haut" : "d20-cran-bas");
                await attendre(RYTHME_D20.cran * 0.35);
                if (!encore()) return;
                valeur += signe;
                s.chiffre.textContent = String(valeur);
                await attendre(RYTHME_D20.cran * 0.65);
            }
            if (!encore()) return;
            s.de.classList.remove("d20-cran-haut", "d20-cran-bas");
        }

        // --- 4. LE RÉSULTAT FINAL ----------------------------------------
        s.chiffre.textContent = String(total);
        h.classList.add("d20-final");
        if (typeof window.posterJetDansLeChat === "function") {
            try { window.posterJetDansLeChat(donnees); } catch (e) { console.error("Jet de dé → chat :", e); }
        }
        minuterieFermeture = setTimeout(() => { if (encore()) fermer(); }, RYTHME_D20.fermetureAuto);
    };
})();
