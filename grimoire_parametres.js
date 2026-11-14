// =========================================================================
//  IVALIS — LES PARAMÈTRES DANS LE LIVRE (v395)
// =========================================================================
//  Nico : « tout le reste des paramètres, mets-le dans des pages du livre, avec
//  le design actuel des boutons et des encarts ; regroupe les options en
//  catégories. Et pareil pour les sous-menus : une page dédiée à chacun, que
//  l'on ne puisse atteindre qu'avec le mot de passe, pas en tournant les pages
//  du livre. »
//
//    · Le chapitre « Paramètres » prend la double page des chapitres (3-4,
//      grimoire.js). Fermé : le mot de passe. Ouvert : les catégories, en
//      encarts (le Maître du Jeu ; le monde et ses règles ; l'atelier).
//    · Chaque sous-menu (les fenêtres d'index.html : Instructions IA, Clés API,
//      Réglages du narrateur, Dépenses, Effets, Races, Monstres, Apparitions,
//      Butin) vient sur sa page dédiée, à la place des catégories : la fenêtre
//      est déplacée dans le livre (ses boutons et leurs fonctions restent les
//      mêmes) ; les grands tableaux prennent toute la double page. Leurs
//      « Retour » (naviguerFenetre, app.js) ramènent aux catégories.
//    · Ces pages ne sont jamais dans le fil du livre : quitter la double page
//      (tourner, un marque-page) referme tout et remet le cadenas.
// =========================================================================
(function () {
    const G = () => window.GRIMOIRE;
    const D = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
    const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
    const cadre = (g, amp) => (D().cadre ? D().cadre(g, amp) : (G() && G().dessins ? G().dessins.cadreMain(g, amp) : ""));
    const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
    const modeDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
    const FLEURON = `<svg class="fleuron fleuron-parametres" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
    // Un cadenas, à la plume.
    const CADENAS = `<svg class="cadenas-parametres" viewBox="0 0 40 48" aria-hidden="true"><path d="M11 21 L11 14 C11 6 29 6 29 14 L29 21"/><path class="plein" d="M6 21.5 Q20 20 34 21 L33.5 44 Q20 45.5 6.5 44 Z"/><path d="M20 30 L20 37 M17.5 31 a2.6 2.6 0 1 1 5 0"/></svg>`;

    // LES CATÉGORIES. `ouvre` : la fonction d'app.js (ou le saut de fenêtre) qu'un clic lance.
    const CATEGORIES = [
        { id: "mj", titre: "Le Maître du Jeu", teinte: "bleu", cote: "gauche",
          texte: "Ce que l'IA sait, comment elle raconte, ce qu'elle coûte.",
          entrees: [
              ["instructions", "Instructions de l'IA", () => window.ouvrirListeInstructions && window.ouvrirListeInstructions("etape-menu-parametres")],
              ["narrateur", "Réglages du narrateur", () => window.naviguerFenetre && window.naviguerFenetre("etape-menu-outils", "etape-ia-parametre")],
              ["depenses", "Dépenses du MJ", () => window.ouvrirDepensesMJ && window.ouvrirDepensesMJ()],
              ["cles", "Clés API", () => window.ouvrirClesApi && window.ouvrirClesApi("etape-menu-parametres")]
          ] },
        { id: "monde", titre: "Le monde et ses règles", teinte: "vert", cote: "droite",
          texte: "Les effets, les peuples, les créatures et ce qu'elles laissent.",
          entrees: [
              ["effets", "Effets de combat", () => window.ouvrirGestionEffets && window.ouvrirGestionEffets()],
              ["races", "Races de l'univers", () => window.ouvrirGestionRaces && window.ouvrirGestionRaces()],
              ["monstres", "Monstres", () => window.ouvrirGestionMonstres && window.ouvrirGestionMonstres()],
              ["apparitions", "Apparitions", () => window.ouvrirTableRencontres && window.ouvrirTableRencontres()],
              ["butin", "Butin", () => window.ouvrirTableButin && window.ouvrirTableButin()]
          ] },
        { id: "atelier", titre: "L'atelier", teinte: "beige", cote: "droite",
          texte: "Les outils de ceux qui construisent Ivalis.",
          entrees: [
              ["studio", "Studio d'animation", () => window.ouvrirStudioAnimation && window.ouvrirStudioAnimation()]
          ] }
    ];
    // LES PAGES DÉDIÉES : chaque fenêtre de sous-menu (index.html), son titre, sa
    // catégorie ; `large` : un grand tableau, posé sur toute la double page.
    const SOUS_PAGES = {
        "etape-liste-instructions": { titre: "Instructions de l'IA", cat: "mj", texte: "Les règles et la mémoire que le Maître du Jeu garde toujours en tête. Double-clique une instruction pour la modifier ; « + » en écrit une nouvelle." },
        "etape-editeur-instruction": { titre: "Une instruction", cat: "mj", texte: "Son titre et ce que l'IA doit en retenir." },
        "etape-confirmation-suppression": { titre: "Détruire une instruction", cat: "mj", texte: "Une instruction détruite ne revient pas." },
        "etape-ia-parametre": { titre: "Réglages du narrateur", cat: "mj", texte: "Le modèle du Maître du Jeu, sa réflexion avant de répondre et sa créativité." },
        "etape-depenses-mj": { titre: "Dépenses du MJ", cat: "mj", large: true },
        "etape-cles-api": { titre: "Clés API", cat: "mj", texte: "Gardées dans ce navigateur seulement : chaque poste a les siennes." },
        "etape-gestion-effets": { titre: "Effets de combat", cat: "monde", large: true },
        "etape-gestion-races": { titre: "Races de l'univers", cat: "monde", large: true },
        "etape-gestion-monstres": { titre: "Monstres", cat: "monde", large: true },
        "etape-rencontres-monstres": { titre: "Apparitions", cat: "monde", large: true },
        "etape-table-butin": { titre: "Butin", cat: "monde", large: true }
    };
    // Les fenêtres qui étaient des menus : y revenir, c'est revenir aux catégories.
    const MENUS = new Set(["etape-menu-parametres", "etape-menu-outils", "etape-mdp-parametres"]);

    // vue : "verrou" (le mot de passe), "menu" (les catégories) ou l'id d'une fenêtre.
    let vue = "verrou";
    let deplace = null;                 // { el, parent, suivant } : la fenêtre posée dans le livre
    let calqueLarge = null;             // la double page des grands tableaux (dans la scène)
    let attente = false;

    const actif = () => !!G() && G().chapitre() === "parametres";

    // ---------------------------------------------------------------------
    //  LES PAGES
    // ---------------------------------------------------------------------
    function htmlVerrou() {
        return [
            `<div class="contenu-page page-parametres-g">
               <div class="titre-page-fiche titre-parametres">Paramètres</div>
               ${FLEURON}
               <p class="texte-parametres">Les rouages d'Ivalis : le Maître du Jeu, les règles du monde, l'atelier.</p>
               <p class="texte-parametres discret">Le son se règle sur la première page du livre.</p>
               <button type="button" class="lien-fiche revenir-parametres" data-action="revenir">← Revenir au journal</button>
             </div>`,
            `<div class="contenu-page page-parametres-d page-verrou-parametres">
               ${CADENAS}
               <div class="titre-encart-parametres">Accès réservé</div>
               <p class="texte-parametres">Le savoir d'Ivalis est protégé.</p>
               <form id="grimoire-form-param" class="form-grimoire form-parametres" novalidate>
                 <label class="champ-grimoire">Mot de passe
                   <input type="password" id="grimoire-mdp-param" autocomplete="off"></label>
                 ${bouton("grimoire-param-deverrouiller", "Déverrouiller", "param-deverrouiller")}
                 <p class="message-grimoire" id="grimoire-msg-param"></p>
               </form>
             </div>`
        ];
    }
    function bouton(id, texte, action) {
        const cadreMain = G() && G().dessins ? G().dessins.cadreMain(id) : "";
        return `<button type="button" class="bouton-grimoire" id="${id}" data-action="${action}">${cadreMain}<span>${texte}</span></button>`;
    }
    function encart(cat) {
        const entrees = cat.entrees.map(([id, texte]) =>
            `<button type="button" class="entree-parametre" id="grimoire-param-${id}" data-action="param-ouvrir" data-cle="${id}">${cadre("param-" + id, 1.1)}<span>${texte}</span></button>`).join("");
        const dev = cat.id === "atelier"
            ? `<button type="button" class="case-parametre${modeDev() ? " coche" : ""}" id="grimoire-param-dev" data-action="param-dev" aria-pressed="${modeDev()}">
                 <svg class="case-belligerant" viewBox="0 0 24 24" aria-hidden="true"><path class="boite" d="M 4 5 Q 12 3.6 20 4.6 L 19.4 19.6 Q 12 20.6 4.6 19.4 Z"/>${modeDev() ? `<path class="coche" d="M 7 12.5 L 10.6 16 L 18 7"/>` : ""}</svg>
                 <span>Mode développeur (DEV)</span></button>` : "";
        return `<section class="encart-fiche encart-parametres" data-cat="${cat.id}">
            ${lavis(cat.teinte, "param-cat-" + cat.id)}${cadre("param-cat-" + cat.id, 1.3)}
            <div class="titre-encart-parametres">${cat.titre}</div>
            <p class="texte-parametres">${cat.texte}</p>
            <div class="entrees-parametres">${entrees}${dev}</div>
          </section>`;
    }
    function htmlMenu() {
        return [
            `<div class="contenu-page page-parametres-g">
               <div class="titre-page-fiche titre-parametres">Paramètres</div>
               ${FLEURON}
               ${CATEGORIES.filter(c => c.cote === "gauche").map(encart).join("")}
               <button type="button" class="lien-fiche revenir-parametres" data-action="param-verrouiller">Refermer les paramètres</button>
             </div>`,
            `<div class="contenu-page page-parametres-d defile-fiche">
               ${CATEGORIES.filter(c => c.cote === "droite").map(encart).join("")}
             </div>`
        ];
    }
    function htmlSousPage(id) {
        const sp = SOUS_PAGES[id], cat = CATEGORIES.find(c => c.id === sp.cat);
        const retour = `<button type="button" class="lien-fiche revenir-parametres" data-action="param-menu">← Retour aux paramètres</button>`;
        if (sp.large) return [
            `<div class="contenu-page page-parametres-g page-sous-large"></div>`,
            `<div class="contenu-page page-parametres-d page-sous-large"></div>`
        ];
        return [
            `<div class="contenu-page page-parametres-g">
               <div class="sur-titre-parametres">${cat ? cat.titre : "Paramètres"}</div>
               <div class="titre-page-fiche titre-parametres">${sp.titre}</div>
               ${FLEURON}
               ${sp.texte ? `<p class="texte-parametres">${sp.texte}</p>` : ""}
               ${retour}
             </div>`,
            `<div class="contenu-page page-parametres-d defile-fiche place-fenetre"></div>`
        ];
    }
    function html() {
        if (vue === "verrou") return htmlVerrou();
        if (vue === "menu") return htmlMenu();
        return SOUS_PAGES[vue] ? htmlSousPage(vue) : htmlMenu();
    }
    // La double page vient d'être écrite (grimoire.js, remplirChapitre).
    function rempli(g, d) {
        [g, d].forEach(p => p.classList.add("page-fiches", "page-parametres"));
        if (vue === "verrou") {
            setTimeout(() => {
                const champ = document.getElementById("grimoire-mdp-param");
                if (champ && actif() && window.matchMedia && !window.matchMedia("(hover: none)").matches) champ.focus();
            }, 900);
            return;
        }
        const sp = SOUS_PAGES[vue];
        if (!sp) return;
        const el = document.getElementById(vue);
        if (!el) return;
        deplace = { el, parent: el.parentNode, suivant: el.nextSibling };
        el.classList.add("fenetre-dans-le-livre");
        if (sp.large) {
            const c = calque();
            c.querySelector(".titre-large-parametres").textContent = sp.titre;
            c.querySelector(".place-large").appendChild(el);
            c.classList.add("visible");
        } else {
            const place = d.querySelector(".place-fenetre");
            if (place) place.appendChild(el);
        }
        el.style.display = "block";
        el.style.opacity = "1";
    }
    // Avant que la double page ne soit réécrite : la fenêtre retourne à sa place.
    function ranger() {
        if (deplace) {
            const { el, parent, suivant } = deplace;
            deplace = null;
            el.classList.remove("fenetre-dans-le-livre");
            el.style.display = "none";
            el.style.opacity = "0";
            try { parent.insertBefore(el, suivant && suivant.parentNode === parent ? suivant : null); } catch (e) { parent.appendChild(el); }
        }
        if (calqueLarge) calqueLarge.classList.remove("visible");
        const g = G();
        if (g) [3, 4].forEach(i => { const p = g.pageChapitre(i); if (p) p.classList.remove("page-fiches", "page-parametres"); });
    }
    // La double page des grands tableaux : posée sur les deux pages, dans la scène.
    function calque() {
        if (calqueLarge && calqueLarge.isConnected) return calqueLarge;
        const scene = G().scene(), livre = G().livre();
        calqueLarge = document.createElement("div");
        calqueLarge.className = "calque-parametres-large";
        calqueLarge.id = "grimoire-param-large";
        calqueLarge.innerHTML = `<div class="entete-large-parametres">
              <button type="button" class="lien-fiche revenir-parametres" data-action="param-menu">← Retour aux paramètres</button>
              <div class="titre-page-fiche titre-large-parametres"></div><span></span></div>
            <div class="place-large defile-fiche"></div>`;
        scene.insertBefore(calqueLarge, livre.nextSibling);
        return calqueLarge;
    }
    function montrer(nouvelleVue) {
        vue = nouvelleVue;
        if (actif()) G().remplirChapitre("parametres");
        else G().ouvrirChapitre("parametres");
    }

    // ---------------------------------------------------------------------
    //  LES GESTES
    // ---------------------------------------------------------------------
    // Le menu principal : le chapitre s'ouvre, toujours sous cadenas.
    function ouvrir() {
        const g = G();
        if (!g || typeof g.ouvrirChapitre !== "function") return false;
        if (typeof window.fermerParametres === "function") { try { window.fermerParametres(true); } catch (e) {} }
        if (!actif()) vue = "verrou";
        g.ouvrirChapitre("parametres");
        return true;
    }
    async function deverrouiller() {
        if (attente) return;
        const champ = document.getElementById("grimoire-mdp-param");
        const msg = document.getElementById("grimoire-msg-param");
        const mdp = champ ? champ.value : "";
        if (!mdp) { if (msg) msg.textContent = "Inscris le mot de passe."; return; }
        attente = true;
        if (msg) { msg.textContent = "Vérification…"; msg.classList.remove("ok"); }
        let ok = false;
        try { ok = typeof window.verifierMdpParametres === "function" && await window.verifierMdpParametres(mdp); }
        catch (e) { console.error("Paramètres : le mot de passe", e); }
        attente = false;
        if (!actif() || vue !== "verrou") return;
        if (ok) { montrer("menu"); return; }
        if (msg) msg.textContent = "Mot de passe incorrect.";
        if (champ) champ.value = "";
    }
    function agir(cible) {
        const a = cible.dataset.action;
        if (a === "param-deverrouiller") { son(); deverrouiller(); return; }
        if (vue === "verrou") return;                     // rien ne s'ouvre sans le mot de passe
        if (a === "param-menu") { son(); montrer("menu"); return; }
        if (a === "param-verrouiller") { son(); montrer("verrou"); return; }
        if (a === "param-dev") {
            son();
            const oui = !modeDev();
            const caseDev = document.getElementById("toggle-dev-mode");
            if (caseDev) caseDev.checked = oui;
            if (typeof window.basculerDevMode === "function") window.basculerDevMode(oui);
            montrer("menu");
            return;
        }
        if (a === "param-ouvrir") {
            son();
            const entree = CATEGORIES.flatMap(c => c.entrees).find(e => e[0] === cible.dataset.cle);
            if (entree) { try { entree[2](); } catch (e) { console.error("Paramètres : « " + entree[1] + " »", e); } }
        }
    }
    // naviguerFenetre (app.js) : dans le livre, une fenêtre de sous-menu prend sa
    // page dédiée ; un menu, ce sont les catégories. Hors du livre : rien (false).
    function naviguer(sortante, entrante) {
        if (!actif() || vue === "verrou") return false;
        if (MENUS.has(entrante)) { montrer("menu"); return true; }
        if (SOUS_PAGES[entrante]) { montrer(entrante); return true; }
        return false;
    }
    // Quitter la double page des chapitres : tout se range, le cadenas revient ;
    // en partie, le sommaire reprend sa place.
    function surTourne(index) {
        if (!actif() || index === 3 || index === 4) { if (actif() && calqueLarge && deplace && SOUS_PAGES[vue] && SOUS_PAGES[vue].large) calqueLarge.classList.add("visible"); return; }
        vue = "verrou";
        if (G().enPartie()) G().remplirChapitre("index");
        else G().remplirChapitre("parametres");
    }
    // Une page qui se soulève : le grand tableau s'efface le temps qu'elle tourne.
    function surEtat(etat) {
        if (!calqueLarge) return;
        if (etat !== "read") calqueLarge.classList.remove("visible");
        else if (actif() && deplace && SOUS_PAGES[vue] && SOUS_PAGES[vue].large && [3, 4].includes(G().page())) calqueLarge.classList.add("visible");
    }

    window.GRIMOIRE_PARAMETRES = { html, rempli, ranger, ouvrir, agir, deverrouiller, naviguer, surTourne, surEtat,
                                   vue: () => vue, CATEGORIES, SOUS_PAGES };
})();
