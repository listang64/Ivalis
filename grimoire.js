// =========================================================================
//  IVALIS — LE GRIMOIRE (v297) : l'accueil devient un vieux livre
// =========================================================================
//  Nico : « tout le jeu aura comme interface un vieux grimoire : on l'ouvre au
//  début et on navigue à travers ses pages ». Première partie : l'accueil.
//
//  Après l'écran noir de connexion (comptes.js, accueillir), le grimoire
//  remplace l'ancien menu (#ecran-menu) :
//    · sur fond beige, le livre fermé — on ne voit que sa couverture ;
//    · un toucher : la couverture tourne (StPageFlip, vendor/page-flip), le
//      livre ouvert apparaît derrière et grossit, une petite marge en haut ;
//    · page de gauche : « Ivalis, le jeu de rôle », imaginé par Benjamin et
//      Nicolas Duval ; page de droite, bordée à la plume : « Journal de » et
//      le nom du joueur surligné, puis Nouvelle partie, Charger partie et
//      Compte dans des cadres tracés à la main ;
//    · chaque entrée remplit la double page suivante et le livre y tourne
//      tout seul ; tourner la page en arrière (glisser) ramène au journal ;
//    · une partie fondée ou réveillée : le grimoire s'efface sur l'ancienne
//      interface (lancerPartieChargee, app.js).
//  « Retour au menu » depuis la partie rouvre le grimoire sur le journal.
//
//  Les pages : 0 couverture (rigide) · 1-2 titre et journal · 3-4 la double
//  page du chapitre choisi · 5 quatrième de couverture (rigide, jamais
//  atteinte : le livre revient au chapitre). Les mesures viennent des images
//  (images/grimoire) : le livre ouvert fait 2000 × 1117, ses deux pages
//  occupent x 251 → 1765 et y 62 → 1046, le dos au milieu (x 1008).
//  Script simple (pas un module), chargé après vendor/page-flip.
// =========================================================================
(function () {
    const IMAGES = {
        couverture: "images/grimoire/couverture.webp?v=1",
        livre: "images/grimoire/livre_ouvert.webp?v=1",
        page: "images/grimoire/page.webp?v=1"
    };
    const LIVRE = { w: 2000, h: 1117 };
    const ZONE = { x: 251, y: 62, w: 1514, h: 984 };       // les deux pages
    const PAGE = { w: ZONE.w / 2, h: ZONE.h };
    const COUVERTURE = { w: 1344, h: 2000 };               // l'image de la couverture
    const ZOOM_FERME = 0.82;                                // le livre fermé, un peu plus petit
    // v298 : Nico, « le livre, descends-le au max sur l'écran — ne l'agrandis
    // pas, juste descends-le ». Même taille qu'avant (tout le livre tient à
    // l'écran), mais posé en bas, un filet de marge sous lui.
    const MARGE_HAUT = 0.025, MARGE_BAS = 0.012, MARGE_COTE = 0.02;
    // v298 : Nico, « fais un peu plus rapide l'animation de tourner la page » ;
    // v299 : « accélère encore ».
    const DUREE_TOURNE = 500;
    // v299 : Nico, « je ne peux saisir la page que par les coins ». Une page se
    // prend n'importe où dans sa moitié extérieure (le bord, le milieu, les
    // coins) : le doigt y tire le coin du même côté, à sa hauteur.
    const ZONE_PRISE = 0.5;
    // LE MARQUE-PAGE (v299), en unités de l'image du livre : glissé sous les
    // pages de gauche, il dépasse au-dessus du livre (le bord du livre est à
    // y 44, celui des pages à y 62). Assez de place est gardée en haut pour lui.
    const MARQUE = { x: 360, y: -36, w: 92, h: 250, penche: -6 };
    const BORD_LIVRE = 44;
    // Rangé (en partie), le livre descend : il n'en reste qu'un liseré en bas
    // de l'écran, et le marque-page qui dépasse.
    const LISERE_RANGE = 12;
    // L'INDEX (v299) : les chapitres du jeu, trois par page.
    const ENTREES_INDEX = [
        ["carte", "Carte du monde"], ["recit", "Le récit"], ["fiches", "Les fiches personnages"],
        ["combats", "Les combats"], ["village", "Le village"], ["parametres", "Les paramètres"]
    ];

    let ecran = null, scene = null, livre = null, pageFlip = null, attrape = null;
    let ouvert = false, chapitre = "", initialise = false, departEnCours = false;
    let partieChoisie = null, enPartie = false, origine = null;
    const pages = {};

    // ---------------------------------------------------------------------
    //  LE TRAIT À LA MAIN : des tracés irréguliers, toujours les mêmes pour
    //  un même cadre (une graine), dans un repère 0..100 étiré sur le cadre.
    // ---------------------------------------------------------------------
    function hasard(graine) {
        let s = 0;
        for (const c of String(graine)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }
    // Un rectangle tracé deux fois, coins qui dépassent un peu, côtés qui ondulent.
    function cadreMain(graine, ampleur = 1.6) {
        const r = hasard(graine);
        const j = (a) => (r() - 0.5) * 2 * a;
        const trace = () => {
            const coins = [[2 + j(ampleur), 4 + j(ampleur)], [98 + j(ampleur), 3 + j(ampleur)], [97 + j(ampleur), 96 + j(ampleur)], [3 + j(ampleur), 97 + j(ampleur)]];
            let d = `M ${(coins[0][0] - 1.5).toFixed(1)} ${(coins[0][1] + j(1)).toFixed(1)}`;
            for (let i = 1; i <= 4; i++) {
                const a = coins[(i - 1) % 4], b = coins[i % 4];
                const mx = (a[0] + b[0]) / 2 + j(ampleur * 0.8), my = (a[1] + b[1]) / 2 + j(ampleur * 0.8);
                d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${(b[0] + j(0.6)).toFixed(1)} ${(b[1] + j(0.6)).toFixed(1)}`;
            }
            return d + ` L ${(coins[0][0] + 3 + j(1)).toFixed(1)} ${(coins[0][1] + j(1)).toFixed(1)}`;
        };
        return `<svg class="cadre-main" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d="${trace()}" class="trait-1"/><path d="${trace()}" class="trait-2"/></svg>`;
    }
    // La bordure de la page du journal : un cadre à la plume qui suit le bord,
    // fait de petits segments qui tremblent.
    function bordurePlume(graine) {
        const r = hasard(graine);
        const j = (a) => (r() - 0.5) * 2 * a;
        const cote = (x1, y1, x2, y2, n) => {
            let d = "";
            for (let i = 1; i <= n; i++) {
                const t = i / n;
                d += ` L ${(x1 + (x2 - x1) * t + j(0.35)).toFixed(2)} ${(y1 + (y2 - y1) * t + j(0.35)).toFixed(2)}`;
            }
            return d;
        };
        const g = 5, dr = 95;
        const tour = () => `M ${g + j(0.4)} ${g + j(0.4)}` + cote(g, g, dr, g, 24) + cote(dr, g, dr, dr, 30) + cote(dr, dr, g, dr, 24) + cote(g, dr, g, g + 0.6, 30);
        return `<svg class="bordure-plume" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d="${tour()}" class="trait-1"/><path d="${tour()}" class="trait-2"/>
                  <path d="M ${g + 2} ${g + 2} L ${g + 2 + 4} ${g + 2} M ${g + 2} ${g + 2} L ${g + 2} ${g + 2 + 3}" class="trait-coin"/>
                  <path d="M ${dr - 2} ${dr - 2} L ${dr - 6} ${dr - 2} M ${dr - 2} ${dr - 2} L ${dr - 2} ${dr - 5}" class="trait-coin"/></svg>`;
    }
    // Le trait de surligneur derrière le nom du joueur.
    function surligneur(graine) {
        const r = hasard(graine);
        const y = () => (40 + (r() - 0.5) * 14).toFixed(1);
        return `<svg class="surligneur" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M 1 ${y()} C 30 ${y()} 70 ${y()} 99 ${y()} L 98 ${(78 + (r() - 0.5) * 10).toFixed(1)} C 70 ${y() * 1 + 36} 30 ${y() * 1 + 40} 2 ${(80 + (r() - 0.5) * 10).toFixed(1)} Z"/></svg>`;
    }
    const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const bouton = (id, texte, action, graine) =>
        `<button type="button" class="bouton-grimoire" id="${id}" data-action="${action}">${cadreMain(graine || id)}<span>${texte}</span></button>`;
    const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
    const bruitPage = (id) => { try { if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement(id); } catch (e) {} };

    // ---------------------------------------------------------------------
    //  LES PAGES
    // ---------------------------------------------------------------------
    const nomJoueur = () => {
        const c = window.COMPTE_JOUEUR;
        return (c && c.nom) || "Voyageur";
    };

    function pageTitre() {
        return `<div class="contenu-page page-titre">
            <div class="titre-haut">Les Chroniques</div>
            <h1 class="titre-ivalis">Ivalis</h1>
            <div class="titre-sous">le jeu de rôle</div>
            <svg class="fleuron" viewBox="0 0 200 24" aria-hidden="true">
              <path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/>
              <circle cx="100" cy="12" r="2.2"/></svg>
            <div class="titre-auteurs">Imaginé par<br><span>Benjamin et Nicolas Duval</span></div>
          </div>`;
    }

    function pageJournal() {
        return `<div class="contenu-page page-journal">
            ${bordurePlume("bordure-journal")}
            <div class="journal-entete">Journal de <span class="nom-surligne">${surligneur("nom")}<b id="grimoire-nom-joueur">${echapper(nomJoueur())}</b></span></div>
            <div class="journal-entrees">
              ${bouton("grimoire-btn-nouvelle", "Nouvelle partie", "nouvelle")}
              ${bouton("grimoire-btn-charger", "Charger partie", "charger")}
              ${bouton("grimoire-btn-compte", "Compte", "compte")}
            </div>
          </div>`;
    }

    // Le trait de surligneur d'une entrée de l'index : une traînée irrégulière,
    // posée derrière chaque ligne du texte (box-decoration-break), en SVG.
    function surligneurFond(graine) {
        const r = hasard(graine);
        const v = (a, b) => (a + r() * (b - a)).toFixed(1);
        const d = `M ${v(0, 3)} ${v(18, 30)} C ${v(25, 35)} ${v(8, 20)} ${v(60, 70)} ${v(14, 26)} ${v(97, 100)} ${v(10, 24)} `
                + `L ${v(96, 100)} ${v(80, 92)} C ${v(65, 75)} ${v(88, 98)} ${v(30, 40)} ${v(82, 94)} ${v(1, 4)} ${v(86, 96)} Z`;
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${d}' fill='rgba(236,190,60,0.72)'/></svg>`;
        // (les apostrophes encodées aussi : l'attribut style est entre apostrophes)
        return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}")`;
    }
    function entreeIndex(id, texte) {
        const r = hasard("index-" + id);
        const penche = ((r() * 2 - 1) * 3.4).toFixed(2), decale = ((r() * 2 - 1) * 7).toFixed(1);
        return `<button type="button" class="entree-index" id="grimoire-index-${id}" data-action="index" data-entree="${id}"
                   style="--penche:${penche}deg; --decale:${decale}"><span class="entree-index-texte" style='background-image:${surligneurFond("fond-" + id)}'>${texte}</span></button>`;
    }
    function indexHtml() {
        const entrees = (a, b) => ENTREES_INDEX.slice(a, b).map(([id, t]) => entreeIndex(id, t)).join("");
        return [
            `<div class="contenu-page page-index">
               <div class="entete-index">Index</div>
               <svg class="fleuron fleuron-index" viewBox="0 0 200 24" aria-hidden="true">
                 <path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/>
                 <circle cx="100" cy="12" r="2.2"/></svg>
               <div class="entrees-index">${entrees(0, 3)}</div>
             </div>`,
            `<div class="contenu-page page-index droite">
               <div class="entrees-index">${entrees(3, 6)}</div>
               <p class="note-index" id="grimoire-note-index" aria-live="polite"></p>
             </div>`
        ];
    }
    // Le dessin du marque-page, à la plume : une feuille au coin corné,
    // couverte de lignes manuscrites — l'index du livre.
    function dessinMarque() {
        const r = hasard("marque-page");
        const j = (a) => ((r() - 0.5) * 2 * a).toFixed(2);
        let lignes = "";
        for (let i = 0; i < 6; i++) {
            const y = 25 + i * 8.2, fin = 41 - (i === 5 ? 12 : r() * 7);
            let d = `M ${16 + +j(0.6)} ${y + +j(0.5)}`;
            for (let x = 16; x < fin; x += 4) d += ` q 1 ${j(1.4)} 2 ${j(0.5)} t 2 ${j(0.6)}`;
            lignes += `<path class="ligne" d="${d}"/>`;
        }
        return `<svg class="dessin-marque" viewBox="0 0 60 80" aria-hidden="true">
                  <path class="feuille" d="M 11 8.5 C 20 7.6 31 8.4 40.5 7.8 L 49.5 17 C 49 34 50.2 53 49.3 72.4 C 37 73.2 23 71.8 10.6 72.8 C 11.6 51 10.2 29 11 8.5 Z"/>
                  <path class="coin" d="M 40.5 7.8 C 41.2 11 40.6 14 41 17.3 C 44 16.8 46.6 17.4 49.5 17"/>
                  ${lignes}</svg>`;
    }

    // La double page d'un chapitre : [gauche, droite].
    function chapitreHtml(nom) {
        if (nom === "index") return indexHtml();
        const revenir = `<button type="button" class="lien-grimoire revenir" data-action="revenir">← Revenir au journal</button>`;
        if (nom === "nouvelle") return [
            `<div class="contenu-page page-chapitre">
               <h2>Nouvelle partie</h2>
               <p class="texte-plume">Pour fonder un nouveau groupe d'aventuriers, inscris d'abord la Clé de Rune.</p>
               <p class="texte-plume">Puis donne un nom au groupe et un mot de passe : ceux de ta table le taperont pour vous rejoindre.</p>
               ${revenir}
             </div>`,
            `<div class="contenu-page page-chapitre page-formulaire">
               <form id="grimoire-form-cle" class="form-grimoire" novalidate>
                 <label class="champ-grimoire">Clé de Rune
                   <input type="password" id="grimoire-saisie-cle" autocomplete="off"></label>
                 ${bouton("grimoire-valider-cle", "Ouvrir", "valider-cle")}
                 <p class="message-grimoire" id="grimoire-msg-cle"></p>
               </form>
               <form id="grimoire-form-groupe" class="form-grimoire" novalidate hidden>
                 <label class="champ-grimoire">Nom du groupe
                   <input type="text" id="grimoire-nom-groupe" autocomplete="off" maxlength="40"></label>
                 <label class="champ-grimoire">Mot de passe de l'équipe
                   <input type="password" id="grimoire-mdp-groupe" autocomplete="new-password"></label>
                 ${bouton("grimoire-creer-groupe", "Fonder le groupe", "creer-groupe")}
                 <p class="message-grimoire" id="grimoire-msg-groupe"></p>
               </form>
             </div>`
        ];
        if (nom === "charger") return [
            `<div class="contenu-page page-chapitre">
               <h2>Archives d'Ivalis</h2>
               <p class="texte-plume">Choisis la session à réveiller :</p>
               <div class="liste-parties-grimoire" id="grimoire-liste-parties"></div>
               ${revenir}
             </div>`,
            `<div class="contenu-page page-chapitre page-formulaire" id="grimoire-sceau-partie">
               <p class="texte-plume attente">Choisis une session sur la page de gauche.</p>
             </div>`
        ];
        if (nom === "compte") {
            const c = window.COMPTE_JOUEUR || {};
            const auto = typeof window.connexionAutomatique === "function" ? window.connexionAutomatique() : true;
            return [
                `<div class="contenu-page page-chapitre">
                   <h2>Compte</h2>
                   <p class="ligne-compte"><span>Nom</span><b>${echapper(c.nom || nomJoueur())}</b></p>
                   <p class="ligne-compte"><span>E-mail</span><b>${echapper(c.email || "—")}</b></p>
                   <p class="ligne-compte"><span>Rôle</span><b>${c.admin ? "Valide les inscriptions" : "Joueur"}</b></p>
                   <label class="case-grimoire"><input type="checkbox" id="grimoire-connexion-auto"${auto ? " checked" : ""}> Connexion automatique</label>
                   ${c.admin ? bouton("grimoire-btn-demandes", "Demandes d'inscription", "demandes") : ""}
                   ${bouton("grimoire-btn-deconnexion", "Se déconnecter", "deconnecter")}
                   ${revenir}
                 </div>`,
                `<div class="contenu-page page-chapitre page-formulaire">
                   <h3>Changer de mot de passe</h3>
                   <form id="grimoire-form-mdp" class="form-grimoire" novalidate>
                     <label class="champ-grimoire">Mot de passe actuel
                       <input type="password" id="grimoire-mdp-actuel" autocomplete="current-password"></label>
                     <label class="champ-grimoire">Nouveau mot de passe
                       <input type="password" id="grimoire-mdp-nouveau" autocomplete="new-password"></label>
                     <label class="champ-grimoire">Confirme le nouveau
                       <input type="password" id="grimoire-mdp-confirmer" autocomplete="new-password"></label>
                     ${bouton("grimoire-changer-mdp", "Changer", "changer-mdp")}
                     <p class="message-grimoire" id="grimoire-msg-mdp"></p>
                   </form>
                 </div>`
            ];
        }
        return [
            `<div class="contenu-page page-chapitre"><p class="texte-plume attente">Ces pages attendent leur chapitre.</p>${revenir}</div>`,
            `<div class="contenu-page page-chapitre"></div>`
        ];
    }

    // ---------------------------------------------------------------------
    //  LA MISE EN PAGE : le livre ouvert remplit l'écran (petite marge en
    //  haut) ; fermé, la couverture est plus petite et centrée.
    // ---------------------------------------------------------------------
    function mesurer() {
        const vw = window.innerWidth, vh = window.innerHeight;
        let s = Math.min(vw * (1 - 2 * MARGE_COTE) / LIVRE.w, vh * (1 - MARGE_HAUT - MARGE_BAS) / LIVRE.h);
        // Le marque-page dépasse au-dessus du livre : sur un écran très large,
        // le livre perd juste ce qu'il faut pour qu'il reste visible.
        const place = vh * (1 - MARGE_BAS) - 4;
        if (place - LIVRE.h * s < -MARQUE.y * s) s = place / (LIVRE.h - MARQUE.y);
        const gauche = (vw - LIVRE.w * s) / 2, haut = vh * (1 - MARGE_BAS) - LIVRE.h * s;
        // La couverture fermée : à droite du dos, sa hauteur celle d'une page.
        const largeurCouv = PAGE.h * COUVERTURE.w / COUVERTURE.h;
        const cx = (ZONE.x + PAGE.w + largeurCouv / 2) * s, cy = (ZONE.y + PAGE.h / 2) * s;
        const tx = vw / 2 - gauche - ZOOM_FERME * cx, ty = vh / 2 - haut - ZOOM_FERME * cy;
        const descente = Math.max(0, vh - LISERE_RANGE - (haut + BORD_LIVRE * s));
        return { s, gauche, haut, tx, ty, vw, vh, descente };
    }
    function poser() {
        if (!scene) return;
        const m = mesurer();
        scene.style.left = m.gauche + "px";
        scene.style.top = m.haut + "px";
        scene.style.width = LIVRE.w * m.s + "px";
        scene.style.height = LIVRE.h * m.s + "px";
        scene.style.setProperty("--u", (PAGE.w * m.s / 100) + "px");   // 1 % de la largeur d'une page
        scene.style.setProperty("--transform-ferme", `translate(${m.tx}px, ${m.ty}px) scale(${ZOOM_FERME})`);
        scene.style.setProperty("--transform-range", `translateY(${m.descente}px)`);
        scene.style.setProperty("--s", String(m.s));
        livre.style.left = ZONE.x * m.s + "px";
        livre.style.top = ZONE.y * m.s + "px";
        livre.style.width = ZONE.w * m.s + "px";
        livre.style.height = ZONE.h * m.s + "px";
        if (pageFlip) { try { pageFlip.update(); } catch (e) {} }
    }

    // ---------------------------------------------------------------------
    //  LA CONSTRUCTION
    // ---------------------------------------------------------------------
    function construire() {
        if (initialise) return true;
        ecran = document.getElementById("ecran-grimoire");
        if (!ecran) return false;
        origine = { parent: ecran.parentNode, suivant: ecran.nextSibling };
        ecran.innerHTML = `
          <div class="grimoire-scene ferme" id="grimoire-scene">
            <img class="grimoire-fond-livre" src="${IMAGES.livre}" alt="" draggable="false">
            <button type="button" class="marque-page inactif" id="grimoire-marque-page" data-action="marque-page"
                    aria-label="Aller à l'index" aria-disabled="true" title="L'index (en partie)">
              <span class="marque-papier">${dessinMarque()}</span></button>
            <div class="grimoire-livre" id="grimoire-livre">
              <div class="page-grimoire page-couverture" data-density="hard" id="grimoire-page-0">
                <img src="${IMAGES.couverture}" alt="Les Chroniques d'Ivalis" draggable="false"></div>
              <div class="page-grimoire page-papier gauche" id="grimoire-page-1"></div>
              <div class="page-grimoire page-papier droite" id="grimoire-page-2"></div>
              <div class="page-grimoire page-papier gauche" id="grimoire-page-3"></div>
              <div class="page-grimoire page-papier droite" id="grimoire-page-4"></div>
              <div class="page-grimoire page-dos" data-density="hard" id="grimoire-page-5"></div>
            </div>
            <div class="grimoire-attrape" id="grimoire-attrape" role="button" aria-label="Ouvrir le grimoire"></div>
          </div>
          <p class="grimoire-invite" id="grimoire-invite">Touchez le grimoire pour l'ouvrir</p>`;
        scene = document.getElementById("grimoire-scene");
        livre = document.getElementById("grimoire-livre");
        attrape = document.getElementById("grimoire-attrape");
        for (let i = 0; i <= 5; i++) pages[i] = document.getElementById("grimoire-page-" + i);
        pages[1].innerHTML = pageTitre();
        pages[2].innerHTML = pageJournal();
        remplirChapitre("");
        // AU DOIGT, TOUT DE SUITE (v298). Nico : « sur iPad le toucher ne se
        // déclenche pas tout de suite, il y a un décalage ». Safari attend
        // avant d'envoyer un « click » ; le grimoire agit dès que le doigt se
        // lève (pointerup), sur la cible où il s'était posé, sans glisser. Le
        // « click » qui suit est ignoré ; seul (le clavier), il agit.
        let appui = null, dernier = null;
        const cibleDe = (el) => {
            if (!el || !el.closest) return null;
            if (el.closest("#grimoire-attrape")) return attrape;
            const c = el.closest("[data-action]");
            return c && ecran.contains(c) && !c.disabled ? c : null;
        };
        const declencher = (c) => { if (c === attrape) ouvrirLivre(); else agir(c); };
        ecran.addEventListener("pointerdown", (ev) => {
            const c = cibleDe(ev.target);
            appui = c ? { c, x: ev.clientX, y: ev.clientY, t: Date.now() } : null;
        }, true);
        ecran.addEventListener("pointerup", (ev) => {
            const a = appui;
            appui = null;
            if (!a || cibleDe(ev.target) !== a.c || Date.now() - a.t > 900 || Math.hypot(ev.clientX - a.x, ev.clientY - a.y) > 14) return;
            dernier = { c: a.c, t: Date.now() };
            declencher(a.c);
        }, true);
        ecran.addEventListener("pointercancel", () => { appui = null; }, true);
        ecran.addEventListener("click", (ev) => {
            const c = cibleDe(ev.target);
            if (!c) return;
            if (dernier && dernier.c === c && Date.now() - dernier.t < 1000) { dernier = null; return; }
            declencher(c);
        });
        // Les champs, les cases et les boutons des pages gardent le doigt et
        // la souris : StPageFlip ne doit pas y voir un début de page tournée.
        ["mousedown", "touchstart"].forEach(type => ecran.addEventListener(type, (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest("input, label, button, select, textarea, .liste-parties-grimoire, .message-grimoire")) ev.stopPropagation();
        }, true));
        ecran.addEventListener("submit", (ev) => { ev.preventDefault(); surEnvoi(ev.target); });
        ecran.addEventListener("change", (ev) => {
            if (ev.target && ev.target.id === "grimoire-connexion-auto" && typeof window.basculerConnexionAuto === "function") {
                son(); window.basculerConnexionAuto(ev.target.checked);
            }
        });
        window.addEventListener("resize", () => { clearTimeout(poser.minuteur); poser.minuteur = setTimeout(poser, 120); });
        initialise = true;
        return true;
    }

    function demarrerPageFlip(pageDepart) {
        if (pageFlip || !window.St || typeof window.St.PageFlip !== "function") return;
        poser();
        pageFlip = new window.St.PageFlip(livre, {
            width: PAGE.w, height: PAGE.h, size: "stretch",
            minWidth: 40, maxWidth: 4000, minHeight: 50, maxHeight: 5000,
            showCover: true, usePortrait: false, autoSize: false,
            drawShadow: true, maxShadowOpacity: 0.45, flippingTime: DUREE_TOURNE,
            // La souris et le doigt, c'est le grimoire qui les suit (brancherPrise).
            mobileScrollSupport: false, clickEventForward: true, useMouseEvents: false,
            disableFlipByClick: true, showPageCorners: false, swipeDistance: 30,
            startPage: pageDepart || 0
        });
        pageFlip.loadFromHTML(livre.querySelectorAll(".page-grimoire"));
        pageFlip.on("flip", (e) => surTourne(Number(e.data)));
        // LES BRUITS DE PAGES (fabrique_sons.js) : le doigt qui saisit une page
        // (v298), puis la page qui se pose de l'autre côté — le vieux bruit de
        // parchemin de Nico (v299 : « pour le bruit de posage, récupère mon vieux
        // son de parchemin »). Une page relâchée qui retombe ne se pose pas.
        let etatAvant = "read";
        pageFlip.on("changeState", (e) => {
            const etat = String(e.data);
            if (etat === "user_fold" && etatAvant !== "user_fold" && etatAvant !== "flipping") bruitPage("page-prise");
            etatAvant = etat;
        });
        pageFlip.on("flip", () => bruitPage("page-tourne"));
        brancherPrise();
        window.GRIMOIRE_PAGEFLIP = pageFlip;
    }

    // LA PRISE DES PAGES (v299). Un doigt (ou la souris) posé dans la moitié
    // extérieure d'une page, puis qui glisse : StPageFlip reçoit le geste comme
    // si le doigt tenait le coin de ce côté-là (même mouvement, décalé à la
    // hauteur du coin). Un simple toucher ne tourne rien ; les champs, les
    // boutons et les listes gardent le doigt.
    function brancherPrise() {
        let prise = null;
        const pos = (ev) => { const r = livre.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top, r }; };
        livre.addEventListener("pointerdown", (ev) => {
            if (!pageFlip || !ouvert || ecran.classList.contains("range")) return;
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            if (ev.target && ev.target.closest && ev.target.closest("input, label, button, select, textarea, a, [data-action], .liste-parties-grimoire")) return;
            if (pageFlip.getState() !== "read") return;
            const p = pos(ev), pw = p.r.width / 2, h = p.r.height;
            const aGauche = p.x < pw, xp = aGauche ? p.x : p.x - pw;
            if (aGauche ? xp > pw * ZONE_PRISE : xp < pw * (1 - ZONE_PRISE)) return;
            const coinY = p.y >= h / 2 ? h - 1 : 1;
            prise = { id: ev.pointerId, x0: p.x, y0: p.y, dy: coinY - p.y, partie: false };
            try { livre.setPointerCapture(ev.pointerId); } catch (e) {}
        });
        livre.addEventListener("pointermove", (ev) => {
            if (!prise || ev.pointerId !== prise.id) return;
            const p = pos(ev);
            if (!prise.partie) {
                if (Math.hypot(p.x - prise.x0, p.y - prise.y0) < 8) return;
                prise.partie = true;
                pageFlip.startUserTouch({ x: prise.x0, y: prise.y0 + prise.dy });
            }
            pageFlip.userMove({ x: p.x, y: p.y + prise.dy }, false);
            if (ev.cancelable) ev.preventDefault();
        });
        const lacher = (ev) => {
            if (!prise || ev.pointerId !== prise.id) return;
            const a = prise;
            prise = null;
            if (!a.partie) return;
            const p = pos(ev);
            pageFlip.userStop({ x: p.x, y: p.y + a.dy });
        };
        livre.addEventListener("pointerup", lacher);
        livre.addEventListener("pointercancel", lacher);
    }

    // ---------------------------------------------------------------------
    //  OUVRIR, TOURNER, REFERMER
    // ---------------------------------------------------------------------
    function etatOuvert(o) {
        ouvert = o;
        scene.classList.toggle("ferme", !o);
        scene.classList.toggle("ouvert", o);
        attrape.style.display = o ? "none" : "block";
        const invite = document.getElementById("grimoire-invite");
        if (invite) invite.classList.toggle("visible", !o);
    }
    function ouvrirLivre() {
        if (ouvert || !pageFlip) return;
        etatOuvert(true);                       // le bruit de la couverture qui tourne suffit (v298)
        try { pageFlip.flipNext("top"); } catch (e) { try { pageFlip.turnToPage(1); } catch (e2) {} }
    }
    function surTourne(index) {
        if (index >= 5) {                       // la quatrième de couverture : on revient au chapitre
            setTimeout(() => { try { pageFlip.flip(3, "top"); } catch (e) {} }, 60);
            return;
        }
        if (index === 0 && ouvert) etatOuvert(false);   // tourné jusqu'à la couverture : le livre se referme
        else if (index > 0 && !ouvert) etatOuvert(true);
    }
    function remplirChapitre(nom) {
        chapitre = nom;
        const [g, d] = chapitreHtml(nom);
        pages[3].innerHTML = g;
        pages[4].innerHTML = d;
        if (nom === "charger") afficherParties(window.LISTE_PARTIES_CACHE || []);
    }
    // Une entrée du journal : sa double page se remplit, et le livre y tourne.
    function allerAuChapitre(nom) {
        remplirChapitre(nom);
        partieChoisie = null;
        if (!pageFlip) return;
        const ici = pageFlip.getCurrentPageIndex();
        if (ici >= 3) return;                    // déjà sur la double page du chapitre
        try { pageFlip.flipNext("top"); } catch (e) { pageFlip.turnToPage(3); }
        setTimeout(() => {
            const champ = pages[4].querySelector("input") || pages[3].querySelector("input");
            if (champ && window.matchMedia && !window.matchMedia("(hover: none)").matches) champ.focus();
        }, DUREE_TOURNE + 50);
    }

    // ---------------------------------------------------------------------
    //  LES CHAPITRES
    // ---------------------------------------------------------------------
    function message(id, texte, ok) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = texte || "";
        el.classList.toggle("ok", !!ok);
    }
    function occupe(id, oui, texte) {
        const b = document.getElementById(id);
        if (!b) return;
        b.disabled = !!oui;
        const span = b.querySelector("span");
        if (span) {
            if (oui) { b.dataset.texte = span.textContent; span.textContent = texte || "…"; }
            else if (b.dataset.texte) span.textContent = b.dataset.texte;
        }
    }
    const valeur = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const portes = () => window.PORTES_GRIMOIRE || {};

    function afficherParties(parties) {
        const zone = document.getElementById("grimoire-liste-parties");
        if (!zone) return;
        if (!parties || !parties.length) {
            zone.innerHTML = `<p class="texte-plume attente">Aucune expédition en cours.</p>`;
            return;
        }
        zone.innerHTML = parties.map(p => bouton("grimoire-partie-" + p.id, echapper(p.nom || "Sans nom"), "partie", "partie-" + p.id)
            .replace('data-action="partie"', `data-action="partie" data-id="${echapper(p.id)}"`)).join("");
    }
    window.grimoirePartiesMaj = function (parties) { if (chapitre === "charger") afficherParties(parties); };

    function choisirPartie(id) {
        const p = (window.LISTE_PARTIES_CACHE || []).find(x => x.id === id) || { id, nom: "" };
        partieChoisie = p;
        document.querySelectorAll("#grimoire-liste-parties .bouton-grimoire").forEach(b => b.classList.toggle("choisi", b.dataset.id === id));
        const page = document.getElementById("grimoire-sceau-partie");
        if (!page) return;
        page.innerHTML = `<h3>Sceau de sécurité</h3>
            <p class="texte-plume">Le grimoire de <b>${echapper(p.nom || "ce groupe")}</b> est scellé. Inscris le mot de passe du groupe :</p>
            <form id="grimoire-form-partie" class="form-grimoire" novalidate>
              <label class="champ-grimoire">Mot de passe
                <input type="password" id="grimoire-mdp-partie" autocomplete="off"></label>
              ${bouton("grimoire-valider-partie", "Déverrouiller", "valider-partie")}
              <p class="message-grimoire" id="grimoire-msg-partie"></p>
            </form>`;
        const champ = document.getElementById("grimoire-mdp-partie");
        if (champ && window.matchMedia && !window.matchMedia("(hover: none)").matches) champ.focus();
    }

    async function validerCle() {
        const porte = portes().verifierCle;
        if (!porte) return;
        occupe("grimoire-valider-cle", true, "Vérification…");
        message("grimoire-msg-cle", "");
        let ok = false;
        try { ok = await porte(valeur("grimoire-saisie-cle")); } catch (e) { console.error("Grimoire : clé", e); }
        occupe("grimoire-valider-cle", false);
        if (!ok) { message("grimoire-msg-cle", "Clé incorrecte."); return; }
        document.getElementById("grimoire-form-cle").hidden = true;
        document.getElementById("grimoire-form-groupe").hidden = false;
        const champ = document.getElementById("grimoire-nom-groupe");
        if (champ) champ.focus();
    }
    async function creerGroupe() {
        const nom = valeur("grimoire-nom-groupe"), mdp = valeur("grimoire-mdp-groupe");
        if (!nom || !mdp) { message("grimoire-msg-groupe", "Le grimoire exige un nom de groupe et un mot de passe."); return; }
        const porte = portes().creerPartie;
        if (!porte) return;
        occupe("grimoire-creer-groupe", true, "Fondation…");
        message("grimoire-msg-groupe", "");
        try {
            const id = await porte(nom, mdp);
            entrerDansLaPartie(id);
        } catch (e) {
            console.error("Grimoire : fondation du groupe", e);
            message("grimoire-msg-groupe", "Une erreur est survenue lors de la fondation du groupe.");
        } finally { occupe("grimoire-creer-groupe", false); }
    }
    async function validerPartie() {
        if (!partieChoisie) return;
        const porte = portes().verifierMdpPartie;
        if (!porte) return;
        occupe("grimoire-valider-partie", true, "Vérification…");
        message("grimoire-msg-partie", "");
        let verdict = { ok: false };
        try { verdict = await porte(partieChoisie.id, valeur("grimoire-mdp-partie")); } catch (e) { console.error("Grimoire : mot de passe", e); }
        occupe("grimoire-valider-partie", false);
        if (verdict && verdict.ok) { entrerDansLaPartie(partieChoisie.id); return; }
        message("grimoire-msg-partie", verdict && verdict.raison === "injoignable"
            ? "Le grimoire ne répond pas. Vérifie la connexion, puis réessaie." : "Mot de passe incorrect.");
    }
    async function changerMdp() {
        const porte = window.changerMotDePasseCompte;
        if (typeof porte !== "function") return;
        occupe("grimoire-changer-mdp", true, "…");
        const r = await porte(valeur("grimoire-mdp-actuel"), valeur("grimoire-mdp-nouveau"), valeur("grimoire-mdp-confirmer"));
        occupe("grimoire-changer-mdp", false);
        message("grimoire-msg-mdp", r && r.texte, r && r.ok);
        if (r && r.ok) ["grimoire-mdp-actuel", "grimoire-mdp-nouveau", "grimoire-mdp-confirmer"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    }

    // Une partie fondée ou réveillée (v299) : la carte du jeu s'installe sous
    // le livre, le fond beige s'efface, et la double page devient l'index.
    // Nico : « garde la map en dessous du livre, une fois la partie chargée le
    // livre se met par-dessus ; on laisse pour l'instant les boutons menu en
    // doublon sur la droite ». Le livre entre donc dans l'écran de jeu, sous
    // ses fenêtres et ses menus, au-dessus de la carte.
    function entrerDansLaPartie(id) {
        if (departEnCours) return;
        departEnCours = true;
        const entrer = portes().entrerDansPartie;
        try { if (typeof entrer === "function") entrer(id); } catch (e) { console.error("Grimoire : entrée en partie", e); }
        passerEnPartie();
        setTimeout(() => { departEnCours = false; }, 900);
    }
    function passerEnPartie() {
        const jeu = document.getElementById("ecran-jeu");
        enPartie = true;
        if (jeu && ecran.parentNode !== jeu) {
            jeu.appendChild(ecran);
            void ecran.offsetWidth;              // déplacé : le fondu part de l'écran beige
        }
        ecran.style.display = "block";
        ecran.classList.add("visible", "en-partie");
        ecran.classList.remove("range", "disparait");
        remplirChapitre("index");
        majMarquePage();
        placerNavigation();
        poser();
        if (!pageFlip) return;
        if (!ouvert) etatOuvert(true);
        const ici = pageFlip.getCurrentPageIndex();
        if (ici < 3) { try { pageFlip.flip(3, "top"); } catch (e) { try { pageFlip.turnToPage(3); } catch (e2) {} } }
    }
    // De retour au journal (« Retour au menu ») : le livre ressort de l'écran
    // de jeu, retrouve son fond beige, et le marque-page s'éteint.
    function quitterLaPartie() {
        enPartie = false;
        if (origine && origine.parent && ecran.parentNode !== origine.parent) {
            const suivant = origine.suivant && origine.suivant.parentNode === origine.parent ? origine.suivant : null;
            origine.parent.insertBefore(ecran, suivant);
        }
        ecran.classList.remove("en-partie", "range");
        majMarquePage();
        placerNavigation();
    }
    // Le marque-page n'est actif qu'en partie (Nico : « désactivé tant que pas
    // rentré dans une partie »).
    function majMarquePage() {
        const m = document.getElementById("grimoire-marque-page");
        if (m) {
            m.classList.toggle("inactif", !enPartie);
            m.setAttribute("aria-disabled", enPartie ? "false" : "true");
        }
        const jeu = document.getElementById("ecran-jeu");
        if (jeu) jeu.classList.toggle("livre-leve", enPartie && !ecran.classList.contains("range"));
    }
    // LES BOUTONS DU BAS (v299) : le DEV rouge, le volume, la maison, la porte.
    // Nico : « les trois petits boutons (quatre avec le petit dev rouge) du bas
    // de l'écran dès que l'on voit le livre ». Hors partie, ils suivent le
    // grimoire ; en partie, ils retrouvent l'écran de jeu (le livre y est).
    function placerNavigation() {
        const nav = document.getElementById("menu-navigation-bas");
        const jeu = document.getElementById("ecran-jeu");
        if (!nav) return;
        const cible = enPartie ? jeu : ecran;
        if (cible && nav.parentNode !== cible) cible.appendChild(nav);
    }

    // RANGER LE LIVRE (en partie) : il descend sous le bord de l'écran, il
    // n'en dépasse que le marque-page. Le marque-page le remonte, à l'index.
    function rangerLivre() {
        if (!enPartie) return;
        if (!ouvert && pageFlip) { etatOuvert(true); try { pageFlip.turnToPage(3); } catch (e) {} }
        ecran.classList.add("range");
        majMarquePage();
    }
    function allerIndex() {
        if (!enPartie || !pageFlip) return;
        ecran.classList.remove("range");
        majMarquePage();
        const ici = pageFlip.getCurrentPageIndex();
        if (chapitre !== "index" || ici < 3) remplirChapitre("index");
        if (!ouvert) etatOuvert(true);
        if (ici < 3) { try { pageFlip.flip(3, "top"); } catch (e) { try { pageFlip.turnToPage(3); } catch (e2) {} } }
    }
    // Les chapitres de l'index : pour l'instant, ils ouvrent l'ancienne
    // interface (le livre se range pour lui laisser la place) ; le village
    // n'existe pas encore.
    const OUVRIR_INDEX = {
        carte: null,
        recit: () => window.ouvrirChatbox && window.ouvrirChatbox(),
        fiches: () => window.ouvrirMenuPersonnages && window.ouvrirMenuPersonnages(),
        combats: () => window.ouvrirPopupRencontre && window.ouvrirPopupRencontre(),
        parametres: () => window.ouvrirParametres && window.ouvrirParametres()
    };
    function choisirIndex(id) {
        if (!enPartie) return;
        if (id === "village") {
            const note = document.getElementById("grimoire-note-index");
            if (note) {
                note.textContent = "Le village : ce chapitre s'écrira bientôt.";
                note.classList.add("visible");
                clearTimeout(choisirIndex.minuteur);
                choisirIndex.minuteur = setTimeout(() => note.classList.remove("visible"), 2800);
            }
            return;
        }
        if (!(id in OUVRIR_INDEX)) return;
        rangerLivre();
        const ouvrir = OUVRIR_INDEX[id];
        if (ouvrir) { try { ouvrir(); } catch (e) { console.error("Grimoire : chapitre « " + id + " »", e); } }
    }
    // LA MAISON hors partie (v299) : Nico, « le bouton pour revenir au menu
    // principal fera revenir à la page principale du livre ». Le livre tourne
    // jusqu'au journal (ou s'ouvre dessus). En partie, c'est app.js qui
    // demande d'abord s'il faut quitter la partie.
    window.grimoireAllerAuJournal = function () {
        if (!initialise || enPartie || ecran.style.display === "none" || !pageFlip) return false;
        if (!ouvert) { ouvrirLivre(); return true; }
        const ici = pageFlip.getCurrentPageIndex();
        if (ici > 2) { try { pageFlip.flip(1, "top"); } catch (e) { try { pageFlip.turnToPage(1); } catch (e2) {} } }
        return true;
    };

    function agir(cible) {
        if (!cible || cible.disabled) return;
        const action = cible.dataset.action;
        if (action === "marque-page") {
            if (!enPartie) return;               // éteint hors partie : rien, pas même le clic
            son(); allerIndex(); return;
        }
        son();
        if (action === "index") choisirIndex(cible.dataset.entree);
        // En partie, fonder ou réveiller un autre groupe, c'est d'abord quitter
        // celle-ci : la question de la maison (app.js) est posée.
        else if (enPartie && (action === "nouvelle" || action === "charger")) { if (typeof window.demanderRetourMenu === "function") window.demanderRetourMenu(); }
        else if (action === "nouvelle" || action === "charger" || action === "compte") allerAuChapitre(action);
        else if (action === "revenir") { try { pageFlip.flipPrev("top"); } catch (e) {} }
        else if (action === "valider-cle") validerCle();
        else if (action === "creer-groupe") creerGroupe();
        else if (action === "partie") choisirPartie(cible.dataset.id);
        else if (action === "valider-partie") validerPartie();
        else if (action === "changer-mdp") changerMdp();
        else if (action === "deconnecter" && typeof window.seDeconnecter === "function") window.seDeconnecter();
        else if (action === "demandes" && typeof window.ouvrirDemandesInscription === "function") window.ouvrirDemandesInscription();
    }
    function surEnvoi(form) {
        if (!form) return;
        if (form.id === "grimoire-form-cle") validerCle();
        else if (form.id === "grimoire-form-groupe") creerGroupe();
        else if (form.id === "grimoire-form-partie") validerPartie();
        else if (form.id === "grimoire-form-mdp") changerMdp();
    }

    // ---------------------------------------------------------------------
    //  L'ENTRÉE EN SCÈNE
    // ---------------------------------------------------------------------
    // `options.ouvert` : le livre s'ouvre directement sur le journal (retour au
    // menu depuis une partie).
    window.afficherGrimoire = function (options) {
        if (!construire()) return false;
        const surLeJournal = !!(options && options.ouvert);
        const menu = document.getElementById("ecran-menu");
        if (menu) menu.style.display = "none";
        const nom = document.getElementById("grimoire-nom-joueur");
        if (nom) nom.textContent = nomJoueur();
        quitterLaPartie();
        ecran.style.display = "block";
        void ecran.offsetWidth;
        ecran.classList.add("visible");
        poser();
        if (!pageFlip) {
            etatOuvert(surLeJournal);
            demarrerPageFlip(surLeJournal ? 1 : 0);
        } else if (surLeJournal) {
            remplirChapitre("");
            etatOuvert(true);
            try { pageFlip.turnToPage(1); } catch (e) {}
        }
        return true;
    };
    // Les trois images se chargent dès la page prête : le grimoire est l'écran
    // qui suit la connexion, il doit apparaître d'un coup.
    window.addEventListener("load", () => {
        Object.values(IMAGES).forEach(src => { const img = new Image(); img.decoding = "async"; img.src = src; });
    });
    window.ouvrirGrimoire = ouvrirLivre;
    window.allerChapitreGrimoire = allerAuChapitre;
    window.grimoireEtat = () => ({ ouvert, chapitre, page: pageFlip ? pageFlip.getCurrentPageIndex() : -1,
                                   visible: !!ecran && ecran.style.display !== "none",
                                   enPartie, range: !!ecran && ecran.classList.contains("range") });
    window.grimoireRanger = rangerLivre;
    window.grimoireAllerIndex = allerIndex;
})();
