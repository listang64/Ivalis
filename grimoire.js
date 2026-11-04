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
        page: "images/grimoire/page.webp?v=1",
        // v305 : la table de bois, l'encrier et la plume (l'image de Nico).
        table: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1793777473/BG_tjiigl.png"
    };
    const LIVRE = { w: 2000, h: 1117 };
    const ZONE = { x: 251, y: 62, w: 1514, h: 984 };       // les deux pages
    const PAGE = { w: ZONE.w / 2, h: ZONE.h };
    const COUVERTURE = { w: 1344, h: 2000 };               // l'image de la couverture
    // LA TABLE (v305) : Nico, « voilà l'image que j'aimerais en background…
    // le livre fermé posé dessus [comme sur l'exemple] ; quand on ouvre et que
    // ça zoome un peu, la table suit le mouvement ; que l'image s'adapte à tous
    // les écrans, le plus important c'est que le livre reste à la même place sur
    // la table, peu importe où l'image est tronquée ». En pixels de l'image de
    // la table (1672 × 941 ; sa vraie taille est relue au chargement) : la boîte
    // de l'image de la couverture fermée, à gauche de l'encrier. Fermé, la table
    // couvre l'écran (recadrée autour du livre) ; le livre y est posé ; la table
    // est dans la scène, elle zoome avec lui à l'ouverture. Nico ensuite :
    // « grossis un peu la taille du livre posé sur la table » (560 → 630).
    const TABLE = { w: 1672, h: 941, livre: { x: 623, y: 150, h: 630 },
    // v306 : Nico, « le zoom quand le livre s'ouvre ne va pas car les tailles
    // diffèrent : le livre s'ouvre, dépasse de la table et est complètement sur
    // la plume et l'encrier ». Les deux images ne s'accordent pas (une moitié du
    // livre ouvert est presque carrée, la couverture étroite) : le livre ouvert a
    // sa propre place sur la table — à gauche de l'encrier, sous la plume, à peu
    // près de la hauteur du livre fermé. Sa reliure (x 68 → 1999, y 43 → 1080 de
    // l'image du livre ouvert) va dans cette boîte ; la table glisse d'un cadrage
    // à l'autre pendant l'ouverture, en même temps que le zoom.
                    ouvert: { x: 200, y: 232, w: 905 } };
    const RELIURE = { x: 68, y: 43, w: 1931, h: 1037 };   // la reliure du livre ouvert, dans son image
    // v298 : Nico, « le livre, descends-le au max sur l'écran — ne l'agrandis
    // pas, juste descends-le ». Même taille qu'avant (tout le livre tient à
    // l'écran), mais posé en bas, un filet de marge sous lui.
    // v300 : Nico, « sur iPad il y a une marge au-dessus, c'est bien, mais sur
    // PC il prend toute la fenêtre : réduis le livre pour laisser une marge
    // raisonnable au-dessus, pour pouvoir afficher des trucs ». 12 % en haut.
    const MARGE_HAUT = 0.12, MARGE_BAS = 0.012, MARGE_COTE = 0.02;
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
    // v300 : « le marque-page index, réduis sa taille ». À côté, le marque-page
    // du récit (une plume), un peu décalé.
    const MARQUE = { x: 360, y: -30, w: 66, h: 200, penche: -6 };
    // v301 : au-dessus des pages sortent aussi le marque-page où l'on écrit, la
    // bande du portrait et les notes des dés (grimoire_recit.css) : jusqu'à
    // 175 unités au-dessus de l'image du livre. La place leur est gardée.
    const HAUT_DES_MARQUES = 175;
    // L'INDEX (v299) : les chapitres du jeu, trois par page.
    const ENTREES_INDEX = [
        ["carte", "Carte du monde"], ["recit", "Le récit"], ["fiches", "Les fiches personnages"],
        ["combats", "Les combats"], ["village", "Le village"], ["parametres", "Les paramètres"]
    ];

    let ecran = null, scene = null, livre = null, pageFlip = null, attrape = null;
    let ouvert = false, chapitre = "", initialise = false, departEnCours = false;
    let partieChoisie = null, enPartie = false, origine = null;
    // LES PAGES QUI SUIVENT L'INDEX (v300, grimoire_recit.js) : le sommaire du
    // récit et les pages du chapitre. Le livre compte alors 0 couverture,
    // 1-2 titre et journal, 3-4 index ou chapitre, les pages de la suite, et
    // la quatrième de couverture (`dos`), toujours la dernière.
    // LES PAGES VIERGES (v306) : Nico, « fais en sorte qu'on ne puisse pas
    // fermer la dernière page du livre ; que si ça devait se passer, on tourne
    // plutôt une page vierge, quitte à créer 6 pages vierges utilisées que pour
    // ça ». Avant la quatrième de couverture, toujours ; la dernière double page
    // vierge ne se tourne plus (brancherPrise).
    const NB_VIERGES = 6;
    // LES PAGES DU DÉFILEMENT (v306) : Nico, « quand les pages défilent vite,
    // tu n'utilises pas la bibliothèque des pages, ça fait défiler comme des
    // couvertures rigides… les pages ne sont pas naturelles ; fais défiler des
    // pages de texte au hasard, avec de l'écriture, pour simuler que le livre
    // est écrit ». Des pages manuscrites glissées le temps du défilement.
    const NB_FEUILLETS = 12;
    let dos = null, suite = [], nbPages = 6 + NB_VIERGES, vierges = [], feuillets = [], listeActuelle = [];
    // LA CARTE DU MONDE (v302) : sa double page vient juste après l'index (5-6),
    // en partie seulement ; la suite (le récit) commence alors à la page 7.
    // Nico : « page de gauche cette partie de la map, page de droite celle-là ;
    // elles doivent remplir tout l'espace si possible, et centrées ».
    const PAGE_CARTE = 5;
    const IMAGES_CARTE = {
        gauche: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1793744008/IMG_2203_gvfqfv.png",
        droite: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1793744008/IMG_2207_sz48ll.png"
    };
    let pagesCarte = [];
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
    const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const bouton = (id, texte, action, graine) =>
        `<button type="button" class="bouton-grimoire" id="${id}" data-action="${action}">${cadreMain(graine || id)}<span>${texte}</span></button>`;
    const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
    // (v304 : muet pendant que le livre relit ses pages — StPageFlip annonce
    // alors une « page tournée » qui n'en est pas une.)
    let muet = false;
    const bruitPage = (id) => { if (muet) return; try { if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement(id); } catch (e) {} };

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
            <div class="journal-entete">Journal d'un aventurier</div>
            <div class="journal-entrees">
              ${bouton("grimoire-btn-nouvelle", "Nouvelle partie", "nouvelle")}
              ${bouton("grimoire-btn-charger", "Charger partie", "charger")}
              ${bouton("grimoire-btn-compte", "Compte", "compte")}
            </div>
          </div>`;
    }

    // LE SOULIGNÉ À LA PLUME (v300). Nico : « enlève le surlignage jaune sur
    // l'index, et fais genre un trait grossier écrit à la plume dessous de
    // chaque ligne ». Un trait d'encre épais au milieu, effilé aux bouts, qui
    // ondule un peu, doublé d'un second plus léger ; posé sous chaque ligne du
    // texte (box-decoration-break), en SVG.
    function souligneFond(graine) {
        const r = hasard(graine);
        const v = (a, b) => (a + r() * (b - a)).toFixed(2);
        const trait = (y, e) => `M ${v(0, 2)} ${v(y - 0.4, y + 0.4)} C ${v(20, 35)} ${v(y - 1.4, y)} ${v(55, 70)} ${v(y, y + 1.2)} ${v(97, 100)} ${v(y - 1, y + 0.2)} `
                + `L ${v(97, 100)} ${v(y + e * 0.3, y + e * 0.6)} C ${v(60, 72)} ${v(y + e * 1.4, y + e * 1.9)} ${v(25, 40)} ${v(y + e * 1.2, y + e * 1.8)} ${v(1, 3)} ${v(y + e * 0.4, y + e * 0.8)} Z`;
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'>`
                  + `<path d='${trait(4.2, 2.6)}' fill='rgba(20,12,6,0.9)'/><path d='${trait(6.4, 1.1)}' fill='rgba(20,12,6,0.45)'/></svg>`;
        // (les apostrophes encodées aussi : l'attribut style est entre apostrophes)
        return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}")`;
    }
    function entreeIndex(id, texte) {
        const r = hasard("index-" + id);
        const penche = ((r() * 2 - 1) * 3.4).toFixed(2), decale = ((r() * 2 - 1) * 7).toFixed(1);
        return `<button type="button" class="entree-index" id="grimoire-index-${id}" data-action="index" data-entree="${id}"
                   style="--penche:${penche}deg; --decale:${decale}"><span class="entree-index-texte" style='background-image:${souligneFond("trait-" + id)}'>${texte}</span></button>`;
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

    // Le dessin du marque-page du récit (v300) : une plume d'oie, à l'encre.
    function dessinPlume() {
        const r = hasard("marque-plume");
        let barbes = "";
        for (let i = 0; i < 9; i++) {
            const t = 0.12 + i * 0.085, x = 44 - t * 30, y = 10 + t * 56;
            barbes += `<path class="ligne" d="M ${x.toFixed(1)} ${y.toFixed(1)} q ${(-7 - r() * 3).toFixed(1)} ${(2 + r() * 2).toFixed(1)} ${(-10 - r() * 3).toFixed(1)} ${(7 + r() * 2).toFixed(1)}"/>`;
            barbes += `<path class="ligne" d="M ${x.toFixed(1)} ${y.toFixed(1)} q ${(5 + r() * 2).toFixed(1)} ${(1 + r()).toFixed(1)} ${(7 + r() * 2).toFixed(1)} ${(5 + r() * 2).toFixed(1)}"/>`;
        }
        return `<svg class="dessin-marque" viewBox="0 0 60 80" aria-hidden="true">
                  <path class="feuille" d="M 46 6 C 33 14 22 34 17 62 C 27 50 40 30 46 6 Z"/>
                  <path class="coin" d="M 46 6 C 36 26 26 46 13 74"/>
                  ${barbes}
                  <path class="coin" d="M 13 74 l -2.5 3.5"/></svg>`;
    }

    // Le dessin du marque-page de la carte (v302) : une terre, au trait noir —
    // le globe, ses méridiens et parallèles, et des terres esquissées.
    function dessinTerre() {
        return `<svg class="dessin-marque dessin-terre" viewBox="0 0 60 80" aria-hidden="true">
                  <circle class="feuille" cx="30" cy="38" r="21"/>
                  <path class="ligne" d="M 9.5 38 C 20 41 40 41 50.5 38"/>
                  <path class="ligne" d="M 13 27 C 22 29.5 38 29.5 47 27 M 13 49 C 22 46.5 38 46.5 47 49"/>
                  <path class="ligne" d="M 30 17 C 21 26 21 50 30 59 M 30 17 C 39 26 39 50 30 59"/>
                  <path class="coin" d="M 17 24 C 21 21 26 23 25 27 C 24 31 28 32 27 36 C 26 40 20 39 18 35 C 16 31 14 27 17 24 Z"/>
                  <path class="coin" d="M 35 30 C 39 27 45 29 46 34 C 47 40 43 45 38 47 C 35 48 33 44 35 41 C 37 38 32 34 35 30 Z"/>
                  <path class="ligne" d="M 22 66 C 26 64 34 64 38 66 M 30 59 L 30 66"/></svg>`;
    }
    function pageCarte(cote) {
        const el = document.createElement("div");
        el.className = `page-grimoire page-papier ${cote} page-carte`;
        el.id = "grimoire-carte-" + cote;
        el.innerHTML = `<div class="contenu-carte"><img class="image-carte" src="${IMAGES_CARTE[cote]}" alt="La carte du monde" draggable="false"></div>`;
        return el;
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
    let tableTaille = { w: TABLE.w, h: TABLE.h };
    function mesurer() {
        const vw = window.innerWidth, vh = window.innerHeight;
        let s = Math.min(vw * (1 - 2 * MARGE_COTE) / LIVRE.w, vh * (1 - MARGE_HAUT - MARGE_BAS) / LIVRE.h);
        // Le marque-page dépasse au-dessus du livre : sur un écran très large,
        // le livre perd juste ce qu'il faut pour qu'il reste visible.
        const place = vh * (1 - MARGE_BAS) - 4;
        if (place - LIVRE.h * s < HAUT_DES_MARQUES * s) s = place / (LIVRE.h + HAUT_DES_MARQUES);
        const gauche = (vw - LIVRE.w * s) / 2, haut = vh * (1 - MARGE_BAS) - LIVRE.h * s;
        // La table, fermée : elle couvre l'écran ; recadrée autour du livre, sans
        // jamais découvrir son bord (un écran extrême : le livre tient d'abord,
        // le plancher sombre prolonge l'image).
        const tw = tableTaille.w, th = tableTaille.h, r = tw / TABLE.w;
        const bh = TABLE.livre.h * th / TABLE.h, bw = bh * COUVERTURE.w / COUVERTURE.h;
        const bx = TABLE.livre.x * r, by = TABLE.livre.y * th / TABLE.h;
        const k = Math.min(Math.max(vw / tw, vh / th), vh * 0.92 / bh, vw * 0.92 / bw);
        let ox = vw / 2 - (bx + bw / 2) * k, oy = vh / 2 - (by + bh / 2) * k;
        ox = tw * k >= vw ? Math.min(0, Math.max(vw - tw * k, ox)) : (vw - tw * k) / 2;
        oy = th * k >= vh ? Math.min(0, Math.max(vh - th * k, oy)) : (vh - th * k) / 2;
        // La couverture fermée (dans la scène : à droite du dos, la hauteur d'une
        // page) va sur sa place de la table : l'échelle et le décalage de la scène fermée.
        const lx = (ZONE.x + PAGE.w) * s, ly = ZONE.y * s, lh = PAGE.h * s;
        const z = bh * k / lh;
        const tx = ox + bx * k - gauche - z * lx, ty = oy + by * k - haut - z * ly;
        // La table, dans la scène (elle suit le zoom de l'ouverture).
        const table = { x: (ox - gauche - tx) / z, y: (oy - haut - ty) / z, w: tw * k / z, h: th * k / z };
        // Ouvert (v306) : la table sous la reliure du livre ouvert, à sa place.
        const u = RELIURE.w * s / (TABLE.ouvert.w * r);            // pixels de scène par pixel de table
        const tableOuverte = { x: RELIURE.x * s - TABLE.ouvert.x * r * u, y: RELIURE.y * s - TABLE.ouvert.y * th / TABLE.h * u, w: tw * u, h: th * u };
        return { s, gauche, haut, tx, ty, z, table, tableOuverte, vw, vh };
    }
    function poser() {
        if (!scene) return;
        const m = mesurer();
        scene.style.left = m.gauche + "px";
        scene.style.top = m.haut + "px";
        scene.style.width = LIVRE.w * m.s + "px";
        scene.style.height = LIVRE.h * m.s + "px";
        scene.style.setProperty("--u", (PAGE.w * m.s / 100) + "px");   // 1 % de la largeur d'une page
        scene.style.setProperty("--transform-ferme", `translate(${m.tx}px, ${m.ty}px) scale(${m.z})`);
        const table = document.getElementById("grimoire-table");
        if (table) {
            // Posée à sa place « ouvert » ; fermée, une transformation la ramène sous la couverture.
            const o = m.tableOuverte, f = m.table, sigma = f.w / o.w;
            Object.assign(table.style, { left: o.x + "px", top: o.y + "px", width: o.w + "px", height: o.h + "px" });
            scene.style.setProperty("--table-ferme", `translate(${f.x - o.x}px, ${f.y - o.y}px) scale(${sigma})`);
        }
        const ombre = document.getElementById("grimoire-ombre-couverture");
        if (ombre) Object.assign(ombre.style, { left: (ZONE.x + PAGE.w) * m.s + "px", top: ZONE.y * m.s + "px", height: PAGE.h * m.s + "px" });
        scene.style.setProperty("--s", String(m.s));
        scene.style.setProperty("--marge-gauche", m.gauche + "px");   // (v306) la place à gauche du livre ouvert
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
            <img class="grimoire-table" id="grimoire-table" src="${IMAGES.table}" alt="" draggable="false">
            <img class="grimoire-ombre-couverture" id="grimoire-ombre-couverture" src="${IMAGES.couverture}" alt="" draggable="false">
            <img class="grimoire-fond-livre" src="${IMAGES.livre}" alt="" draggable="false">
            <button type="button" class="marque-page inactif" id="grimoire-marque-page" data-action="marque-page"
                    aria-label="Aller à l'index" aria-disabled="true" title="L'index (en partie)">
              <span class="marque-papier">${dessinMarque()}</span></button>
            <button type="button" class="marque-page marque-plume inactif" id="grimoire-marque-recit" data-action="marque-recit"
                    aria-label="Aller au récit" aria-disabled="true" title="Le récit (en partie)">
              <span class="marque-papier">${dessinPlume()}</span></button>
            <button type="button" class="marque-page marque-terre inactif" id="grimoire-marque-carte" data-action="marque-carte"
                    aria-label="Aller à la carte du monde" aria-disabled="true" title="La carte du monde (en partie)">
              <span class="marque-papier">${dessinTerre()}</span></button>
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
        // La table : sa vraie taille relue au chargement (le livre garde sa place).
        const imgTable = document.getElementById("grimoire-table");
        const tableChargee = () => { if (imgTable.naturalWidth > 0) { tableTaille = { w: imgTable.naturalWidth, h: imgTable.naturalHeight }; poser(); } };
        if (imgTable.complete) tableChargee(); else imgTable.addEventListener("load", tableChargee, { once: true });
        imgTable.addEventListener("error", () => imgTable.classList.add("absente"), { once: true });
        for (let i = 0; i <= 5; i++) pages[i] = document.getElementById("grimoire-page-" + i);
        dos = pages[5];
        vierges = Array.from({ length: NB_VIERGES }, (_, i) => {
            const el = document.createElement("div");
            el.className = `page-grimoire page-papier ${i % 2 === 0 ? "gauche" : "droite"} page-vierge`;
            el.id = "grimoire-vierge-" + i;
            livre.insertBefore(el, dos);
            return el;
        });
        feuillets = Array.from({ length: NB_FEUILLETS }, (_, i) => pageManuscrite(i));
        listeActuelle = [pages[0], pages[1], pages[2], pages[3], pages[4], ...vierges, dos];
        pagesCarte = [pageCarte("gauche"), pageCarte("droite")];
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
            if (!pageFlip || !ouvert) return;
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            if (ev.target && ev.target.closest && ev.target.closest("input, label, button, select, textarea, a, [data-action], .liste-parties-grimoire, .nom-livre, .nom-heros")) return;
            if (pageFlip.getState() !== "read" || defileEnCours) return;
            const p = pos(ev), pw = p.r.width / 2, h = p.r.height;
            const aGauche = p.x < pw, xp = aGauche ? p.x : p.x - pw;
            if (aGauche ? xp > pw * ZONE_PRISE : xp < pw * (1 - ZONE_PRISE)) return;
            // (v306) la dernière double page vierge : on ne referme pas le livre par la fin.
            if (!aGauche && pageFlip.getCurrentPageIndex() >= nbPages - 3) return;
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
        if (defileEnCours) return;               // (v306) les feuillets qui passent ne comptent pas
        if (index >= nbPages - 1) {             // la quatrième de couverture : on revient à la dernière double page
            setTimeout(() => { try { pageFlip.flip(nbPages - 3, "top"); } catch (e) {} }, 60);
            return;
        }
        try { ecran.dispatchEvent(new CustomEvent("grimoire-page", { detail: { index } })); } catch (e) {}
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
        allerALaPage(3);
        setTimeout(() => {
            const champ = pages[4].querySelector("input") || pages[3].querySelector("input");
            if (champ && window.matchMedia && !window.matchMedia("(hover: none)").matches) champ.focus();
        }, 1000);
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

    // Une partie fondée ou réveillée : le livre s'ouvre à l'index.
    // v300 : Nico, « le livre, une fois la partie chargée, laisse-le à la même
    // place que dans le menu principal ; il masque l'ancienne interface, ce
    // n'est pas grave, on va tout intégrer au livre. Masque la map globale et
    // laisse le fond beige ». Le livre entre dans l'écran de jeu (z 30), son
    // fond beige reste : la carte et l'ancien menu disparaissent dessous, les
    // anciennes fenêtres (fiches, paramètres, combat…) s'ouvrent par-dessus.
    function entrerDansLaPartie(id) {
        if (departEnCours) return;
        departEnCours = true;
        const entrer = portes().entrerDansPartie;
        try { if (typeof entrer === "function") entrer(id); } catch (e) { console.error("Grimoire : entrée en partie", e); }
        passerEnPartie(id);
        setTimeout(() => { departEnCours = false; }, 900);
    }
    function passerEnPartie(id) {
        const jeu = document.getElementById("ecran-jeu");
        enPartie = true;
        if (jeu && ecran.parentNode !== jeu) jeu.appendChild(ecran);
        ecran.style.display = "block";
        ecran.classList.add("visible", "en-partie");
        ecran.classList.remove("disparait");
        remplirChapitre("index");
        majMarquePage();
        placerNavigation();
        poser();
        definirSuite(suite);                     // la double page de la carte entre dans le livre (v302)
        try { if (window.GRIMOIRE_CARTE) window.GRIMOIRE_CARTE.entrer(); } catch (e) { console.error("Grimoire : la carte", e); }
        try { if (window.GRIMOIRE_RECIT) window.GRIMOIRE_RECIT.entrer(id || window.ID_PARTIE_COURANTE); }
        catch (e) { console.error("Grimoire : le récit", e); }
        if (!pageFlip) return;
        if (!ouvert) etatOuvert(true);
        const ici = pageFlip.getCurrentPageIndex();
        // v304 : Nico, « après avoir chargé la partie, ouvre sur la page de la map globale ».
        // Un livre encore en mouvement ignorerait le geste : on attend qu'il se pose (3 s au plus).
        if (ici !== PAGE_CARTE && ici !== PAGE_CARTE + 1) {
            let essais = 0;
            const versLaCarte = () => {
                if (!pageFlip || !enPartie) return;
                const p = pageFlip.getCurrentPageIndex();
                if (p === PAGE_CARTE || p === PAGE_CARTE + 1) return;
                if (pageFlip.getState() !== "read" && ++essais < 25) { setTimeout(versLaCarte, 120); return; }
                try { pageFlip.flip(PAGE_CARTE, "top"); } catch (e) { try { pageFlip.turnToPage(PAGE_CARTE); } catch (e2) {} }
            };
            setTimeout(versLaCarte, 60);
        }
    }
    // De retour au journal (« Retour au menu ») : le livre ressort de l'écran
    // de jeu, perd les pages du récit, et les marque-pages s'éteignent.
    function quitterLaPartie() {
        const etait = enPartie;
        enPartie = false;
        if (etait) { try { if (window.GRIMOIRE_RECIT) window.GRIMOIRE_RECIT.sortir(); } catch (e) { console.error("Grimoire : le récit", e); } }
        if (suite.length || nbPages !== 6 + NB_VIERGES) definirSuite([]);
        if (origine && origine.parent && ecran.parentNode !== origine.parent) {
            const suivant = origine.suivant && origine.suivant.parentNode === origine.parent ? origine.suivant : null;
            origine.parent.insertBefore(ecran, suivant);
        }
        ecran.classList.remove("en-partie");
        majMarquePage();
        placerNavigation();
    }
    // Les marque-pages ne servent qu'en partie (Nico : « désactivé tant que pas
    // rentré dans une partie »). Le livre levé cache l'ancienne interface.
    function majMarquePage() {
        ["grimoire-marque-page", "grimoire-marque-recit", "grimoire-marque-carte"].forEach(idm => {
            const m = document.getElementById(idm);
            if (!m) return;
            m.classList.toggle("inactif", !enPartie);
            m.setAttribute("aria-disabled", enPartie ? "false" : "true");
        });
        const jeu = document.getElementById("ecran-jeu");
        if (jeu) jeu.classList.toggle("livre-leve", enPartie);
    }
    // LES PETITS BOUTONS (v299, v300) : le DEV rouge, le volume, la maison, la
    // porte. Nico : « dès que l'on voit le livre » ; v300 : « finalement, mets-
    // les en haut à droite ». Ils vivent dans le grimoire, en partie aussi.
    function placerNavigation() {
        const nav = document.getElementById("menu-navigation-bas");
        if (!nav || !ecran) return;
        nav.classList.add("nav-livre");
        if (nav.parentNode !== ecran) ecran.appendChild(nav);
    }

    // LA SUITE DU LIVRE (v300) : les pages après l'index (un nombre pair),
    // posées avant la quatrième de couverture. StPageFlip relit ses pages ;
    // pendant qu'une page tourne, on attend qu'elle se pose.
    function definirSuite(elements) {
        suite = (elements || []).slice();
        if (!pageFlip) return;
        const liste = [pages[0], pages[1], pages[2], pages[3], pages[4], ...(enPartie ? pagesCarte : []), ...suite, ...vierges, dos];
        const generation = ++definirSuite.generation;      // seule la dernière demande s'applique
        const appliquer = () => {
            if (generation !== definirSuite.generation) return;
            if (pageFlip.getState() !== "read") { setTimeout(appliquer, 80); return; }
            const ici = pageFlip.getCurrentPageIndex();
            liste.forEach(el => { if (el.parentNode !== livre) livre.appendChild(el); });
            nbPages = liste.length;
            listeActuelle = liste;
            muet = true;
            try { pageFlip.updateFromHtml(liste); } catch (e) { console.error("Grimoire : les pages", e); }
            muet = false;
            if (ici >= nbPages - 1) { try { pageFlip.turnToPage(Math.max(0, nbPages - 3)); } catch (e) {} }
            poser();
        };
        appliquer();
    }
    definirSuite.generation = 0;
    // Aller à une page, en la tournant (le livre s'ouvre s'il est fermé).
    // ALLER À UNE PAGE PAR UN LIEN (v304) : les pages défilent. Nico : « quand
    // on clique sur un des marque-pages, une animation de plein de pages qui
    // défilent très vite, comme si la page était loin dans le livre ; pareil
    // dès qu'on clique sur un lien dans le livre ».
    // v306 : de vraies pages de StPageFlip (souples, qui se courbent), couvertes
    // d'écriture : entre la double page ouverte et celle qu'on cherche, le livre
    // reçoit quelques feuillets manuscrits et les tourne très vite ; arrivé, il
    // retrouve ses vraies pages (les mêmes sont à l'écran : rien ne saute).
    let defileEnCours = false;
    function allerALaPage(n) {
        if (!pageFlip || defileEnCours) return;
        if (!ouvert) etatOuvert(true);
        const ici = pageFlip.getCurrentPageIndex();
        const cible = Math.max(1, Math.min(n, nbPages - 2));
        if (ici === cible || (cible % 2 === 0 ? ici === cible - 1 : ici === cible + 1)) return;
        // La double page voisine (ou la couverture) se tourne normalement ; le
        // défilement rapide, c'est pour une page « loin dans le livre ».
        if (Math.abs(planche(cible) - planche(ici)) <= 1 || ici === 0 || pageFlip.getState() !== "read") {
            try { pageFlip.flip(cible, "top"); } catch (e) { try { pageFlip.turnToPage(cible); } catch (e2) {} }
            return;
        }
        defiler(ici, cible);
    }
    const planche = (p) => Math.floor((p + 1) / 2);         // 0 la couverture, 1 les pages 1-2, 2 les pages 3-4…
    const DEFILE = { tourne: 150, min: 2, max: NB_FEUILLETS / 2 };
    function defiler(ici, cible) {
        const vrai = listeActuelle.slice();
        const sI = planche(ici), sC = planche(cible), enAvant = sC > sI;
        const k = Math.max(DEFILE.min, Math.min(DEFILE.max, Math.abs(sC - sI) - 1));
        // Des feuillets pris au hasard (un nombre pair : k doubles pages).
        const pile = feuillets.slice().sort(() => Math.random() - 0.5).slice(0, 2 * k)
            .map((el, j) => { el.classList.toggle("gauche", j % 2 === 0); el.classList.toggle("droite", j % 2 === 1); return el; });
        let temp, depart;
        if (enAvant) {
            temp = [...vrai.slice(0, 2 * sI + 1), ...pile, vrai[2 * sC - 1], vrai[2 * sC], ...vrai.slice(2 * sC + 1)];
            depart = 2 * sI - 1;
        } else {
            temp = [...vrai.slice(0, 2 * sC + 1), ...pile, vrai[2 * sI - 1], vrai[2 * sI], ...vrai.slice(2 * sI + 1)];
            depart = 2 * sC + 1 + 2 * k;
        }
        defileEnCours = true;
        bruitPage("pages-defilent");
        muet = true;
        const reglages = pageFlip.getSettings(), duree = reglages.flippingTime;
        pile.forEach(el => { if (el.parentNode !== livre) livre.appendChild(el); });
        try {
            pageFlip.updateFromHtml(temp);
            if (pageFlip.getCurrentPageIndex() !== depart) pageFlip.turnToPage(depart);
        } catch (e) { finir(false); return; }
        reglages.flippingTime = DEFILE.tourne;
        let restant = k + 1;
        const pas = () => {
            if (!pageFlip) return;
            if (pageFlip.getState() !== "read") { setTimeout(pas, 16); return; }
            if (restant === 0) { finir(true); return; }
            restant--;
            try { enAvant ? pageFlip.flipNext("bottom") : pageFlip.flipPrev("bottom"); } catch (e) { finir(true); return; }
            setTimeout(pas, 30);
        };
        setTimeout(pas, 20);
        function finir(arrive) {
            reglages.flippingTime = duree;
            try {
                pageFlip.updateFromHtml(vrai);
                const bonne = 2 * sC - 1;
                if (!arrive || pageFlip.getCurrentPageIndex() !== bonne) pageFlip.turnToPage(Math.max(1, bonne));
            } catch (e) {}
            pile.forEach(el => el.remove());
            muet = false;
            defileEnCours = false;
            surTourne(pageFlip.getCurrentPageIndex());   // la page d'arrivée compte, elle
        }
    }
    // UN FEUILLET MANUSCRIT : des lignes d'écriture au hasard, un peu de
    // ratures, parfois un croquis ; on ne les lit pas, elles passent trop vite.
    const MOTS = ("nous marchons longtemps sous le ciel bas et la route se perd entre les collines le vent porte une odeur de pluie " +
        "Thorin grogne que la bière d'ici ne vaut rien Lyra rit doucement les feux du camp éclairent nos visages fatigués " +
        "au matin la brume couvre la vallée un corbeau nous suit depuis trois jours personne n'en parle mais tous le regardent " +
        "la cité de marbre se dresse enfin devant nous ses portes de bronze sont fermées un garde nous dévisage longuement " +
        "le marchand jure par tous les dieux que son vin vient d'Arcaï je n'en crois pas un mot la nuit tombe vite").split(" ");
    function pageManuscrite(i) {
        const el = document.createElement("div");
        el.className = "page-grimoire page-papier page-manuscrite";
        el.id = "grimoire-feuillet-" + i;
        const alea = (n) => Math.floor(Math.random() * n);
        const phrase = (n) => { const m = []; for (let j = 0; j < n; j++) m.push(MOTS[alea(MOTS.length)]); const s = m.join(" "); return s.charAt(0).toUpperCase() + s.slice(1) + "."; };
        const paras = [];
        const nb = 3 + alea(3);
        for (let p = 0; p < nb; p++) {
            const txt = Array.from({ length: 2 + alea(3) }, () => phrase(6 + alea(10))).join(" ");
            paras.push(`<p style="--penche:${(Math.random() * 1.2 - 0.6).toFixed(2)}deg">${txt}</p>`);
        }
        if (i % 4 === 2) paras.splice(1 + alea(2), 0, `<svg class="croquis" viewBox="0 0 120 70" aria-hidden="true"><path d="M6 60 Q30 ${10 + alea(20)} 54 48 T112 ${20 + alea(30)}"/><path d="M20 62 l10 -14 l10 14 M70 58 l8 -12 l8 12"/><circle cx="${80 + alea(25)}" cy="${12 + alea(10)}" r="6"/></svg>`);
        el.innerHTML = `<div class="ecriture-feuillet">${paras.join("")}</div>`;
        return el;
    }
    function allerIndex() {
        if (!enPartie || !pageFlip) return;
        if (chapitre !== "index") remplirChapitre("index");
        allerALaPage(3);
    }
    // Les chapitres de l'index. Le récit est dans le livre (v300) ; les
    // autres ouvrent encore l'ancienne fenêtre, par-dessus le livre ; la
    // carte et le village viendront.
    function allerALaCarte() { if (enPartie) allerALaPage(PAGE_CARTE); }
    const OUVRIR_INDEX = {
        carte: () => allerALaCarte(),
        recit: () => window.GRIMOIRE_RECIT && window.GRIMOIRE_RECIT.allerAuRecit(),
        fiches: () => window.ouvrirMenuPersonnages && window.ouvrirMenuPersonnages(),
        combats: () => window.ouvrirPopupRencontre && window.ouvrirPopupRencontre(),
        parametres: () => window.ouvrirParametres && window.ouvrirParametres()
    };
    const BIENTOT = { village: "Le village : ce chapitre s'écrira bientôt." };
    function choisirIndex(id) {
        if (!enPartie) return;
        if (BIENTOT[id]) {
            const note = document.getElementById("grimoire-note-index");
            if (note) {
                note.textContent = BIENTOT[id];
                note.classList.add("visible");
                clearTimeout(choisirIndex.minuteur);
                choisirIndex.minuteur = setTimeout(() => note.classList.remove("visible"), 2800);
            }
            return;
        }
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
        if (action === "marque-page" || action === "marque-recit" || action === "marque-carte") {
            if (!enPartie) return;               // éteints hors partie : rien, pas même le clic
            // (v304 : « enlève le son quand on clique sur un marque-page ou un bouton de l'index » —
            // les pages qui défilent font leur propre bruit)
            if (action === "marque-page") allerIndex();
            else if (action === "marque-carte") allerALaCarte();
            else if (window.GRIMOIRE_RECIT) window.GRIMOIRE_RECIT.allerAuRecit();
            return;
        }
        if (action === "index") { choisirIndex(cible.dataset.entree); return; }
        son();
        // En partie, fonder ou réveiller un autre groupe, c'est d'abord quitter
        // celle-ci : la question de la maison (app.js) est posée.
        if (enPartie && (action === "nouvelle" || action === "charger")) { if (typeof window.demanderRetourMenu === "function") window.demanderRetourMenu(); }
        else if (action === "nouvelle" || action === "charger" || action === "compte") allerAuChapitre(action);
        else if (action === "revenir") allerALaPage(1);
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
                                   enPartie, nbPages });
    window.grimoireAllerIndex = allerIndex;
    // Pour le récit (grimoire_recit.js) : la scène, les pages, la suite.
    window.GRIMOIRE = {
        ecran: () => ecran, scene: () => scene, livre: () => livre, pageFlip: () => pageFlip,
        enPartie: () => enPartie, ouvert: () => ouvert, nbPages: () => nbPages, defileEnCours: () => defileEnCours,
        premiereDeLaSuite: 7, PAGE_CARTE, IMAGES_CARTE, pagesCarte: () => pagesCarte.slice(), allerALaCarte, definirSuite, allerALaPage, unite: () => (scene ? parseFloat(scene.style.getPropertyValue("--u")) || 0 : 0)
    };
})();
