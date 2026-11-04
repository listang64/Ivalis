// =========================================================================
//  IVALIS — LA POLICE DES TITRES (v313)
// =========================================================================
//  Nico : « change la police du sommaire et des titres, ça ne va pas du tout.
//  Dans Paramètres, fais-moi une page pour que je choisisse une police : 25
//  propositions différentes. Je veux une police d'écriture qui imite une
//  vraie écriture ». Vingt-cinq écritures à la main (Google Fonts, licence
//  OFL), de la plume ancienne au crayon. Le choix est gardé sur l'appareil
//  (localStorage) et passe par une variable CSS : --police-titres (le
//  sommaire, les titres du livre, les noms des héros…), avec un réglage de
//  taille propre à chaque écriture (--echelle-titres), certaines étant
//  naturellement plus petites que d'autres.
//  Script simple (pas un module).
// =========================================================================
(function () {
    // [nom Google Fonts, poids, échelle, genre]
    const POLICES = [
        ["Homemade Apple", "400", 0.82, "plume ronde, encre appuyée"],
        ["La Belle Aurore", "400", 1.05, "plume fine, penchée"],
        ["Cedarville Cursive", "400", 1.0, "cursive d'écolier, à la plume"],
        ["Mrs Saint Delafield", "400", 1.35, "calligraphie ancienne, grandes boucles"],
        ["Herr Von Muellerhoff", "400", 1.4, "plume d'oie, très penchée"],
        ["Pinyon Script", "400", 1.05, "écriture de copiste"],
        ["Italianno", "400", 1.4, "chancelière italienne"],
        ["Tangerine", "700", 1.5, "plume calligraphique"],
        ["Petit Formal Script", "400", 0.9, "lettre soignée d'antan"],
        ["Monsieur La Doulaise", "400", 1.4, "paraphe à l'ancienne"],
        ["Dawning of a New Day", "400", 1.1, "plume rapide, déliée"],
        ["Zeyada", "400", 1.2, "écriture vive, irrégulière"],
        ["Nothing You Could Do", "400", 0.95, "carnet de voyage"],
        ["Reenie Beanie", "400", 1.25, "notes griffonnées"],
        ["Waiting for the Sunrise", "400", 1.0, "écriture fine et lâche"],
        ["Kristi", "400", 1.35, "pinceau à l'encre"],
        ["Caveat", "700", 1.15, "écriture vive, lisible"],
        ["Kalam", "700", 0.95, "plume feutre, lisible"],
        ["Shadows Into Light", "400", 1.05, "écriture légère"],
        ["Gochi Hand", "400", 1.0, "écriture appuyée"],
        ["Covered By Your Grace", "400", 1.1, "lettres hautes et serrées"],
        ["Nanum Pen Script", "400", 1.35, "stylo, très naturel"],
        ["Sacramento", "400", 1.3, "cursive liée"],
        ["Dancing Script", "700", 1.05, "cursive dansante"],
        ["Kaushan Script", "400", 0.95, "pinceau épais"]
    ];
    const PAR_DEFAUT = "Homemade Apple";
    const CLE = "ivalis_police_titres";
    window.POLICES_TITRES = POLICES.map(([nom, poids, echelle, genre]) => ({ nom, poids, echelle, genre }));

    const url = (liste) => "https://fonts.googleapis.com/css2?" + liste.map(([nom, poids]) => "family=" + nom.replace(/ /g, "+") + ":wght@" + poids).join("&") + "&display=swap";
    const charges = new Set();
    function charger(liste) {
        const manquantes = liste.filter(p => !charges.has(p[0]));
        if (!manquantes.length) return;
        manquantes.forEach(p => charges.add(p[0]));
        const l = document.createElement("link");
        l.rel = "stylesheet"; l.href = url(manquantes);
        document.head.appendChild(l);
    }
    const lire = () => { try { return localStorage.getItem(CLE) || PAR_DEFAUT; } catch (e) { return PAR_DEFAUT; } };
    function appliquer(nom) {
        const p = POLICES.find(x => x[0] === nom) || POLICES.find(x => x[0] === PAR_DEFAUT);
        charger([p]);
        const r = document.documentElement.style;
        r.setProperty("--police-titres", `'${p[0]}'`);
        r.setProperty("--poids-titres", p[1]);
        r.setProperty("--echelle-titres", String(p[2]));
        document.documentElement.dataset.policeTitres = p[0];
        const n = document.getElementById("police-titres-actuelle");
        if (n) { n.textContent = p[0]; n.style.fontFamily = `'${p[0]}', cursive`; }
        // Les noms qui s'ajustent à leur largeur se remesurent.
        setTimeout(() => { try { window.dispatchEvent(new Event("resize")); } catch (e) {} }, 400);
    }
    window.choisirPoliceTitres = function (nom) {
        try { localStorage.setItem(CLE, nom); } catch (e) {}
        appliquer(nom);
        document.querySelectorAll(".carte-police").forEach(c => c.classList.toggle("choisie", c.dataset.police === nom));
    };

    // LA PAGE DU CHOIX : les 25 écritures, chacune écrit le même exemple.
    function page() {
        let f = document.getElementById("page-polices");
        if (f) return f;
        f = document.createElement("div");
        f.id = "page-polices";
        f.className = "page-polices";
        f.setAttribute("role", "dialog");
        f.setAttribute("aria-label", "L'écriture des titres");
        const actuelle = lire();
        f.innerHTML = `<div class="feuille-polices">
            <div class="entete-polices"><h2>L'écriture des titres</h2>
              <button type="button" class="btn-parametres" onclick="jouerSonClic(); fermerPagePolices()">Fermer</button></div>
            <p class="aide-polices">Touche une écriture : le sommaire, les titres du livre et les noms des héros la prennent aussitôt.</p>
            <div class="grille-polices">${POLICES.map(([nom, poids, echelle, genre], i) => `
              <button type="button" class="carte-police${nom === actuelle ? " choisie" : ""}" data-police="${nom}" onclick="jouerSonClic(); choisirPoliceTitres(this.dataset.police)">
                <span class="numero-police">${i + 1}</span>
                <span class="exemple-police" style="font-family:'${nom}', cursive !important; font-weight:${poids}; font-size:calc(26px * ${echelle})">Sommaire · Kaya</span>
                <span class="exemple-police petit" style="font-family:'${nom}', cursive !important; font-weight:${poids}; font-size:calc(19px * ${echelle})">II- Carte du monde · Clan de Nico</span>
                <span class="nom-police">${nom} <i>— ${genre}</i></span>
              </button>`).join("")}</div></div>`;
        f.addEventListener("click", (e) => { if (e.target === f) window.fermerPagePolices(); });
        document.body.appendChild(f);
        return f;
    }
    window.ouvrirPagePolices = function () {
        charger(POLICES);
        const f = page();
        f.style.display = "flex";
        requestAnimationFrame(() => f.classList.add("visible"));
    };
    window.fermerPagePolices = function () {
        const f = document.getElementById("page-polices");
        if (!f) return;
        f.classList.remove("visible");
        setTimeout(() => { f.style.display = "none"; }, 250);
    };
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") window.fermerPagePolices(); });

    appliquer(lire());
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => appliquer(lire()));
})();
