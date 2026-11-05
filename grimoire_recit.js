// =========================================================================
//  IVALIS — LE RÉCIT DANS LE GRIMOIRE (v300)
// =========================================================================
//  Nico : « intégration de la partie chatbox au livre ». Le récit de la
//  partie s'écrit dans le grimoire, comme un livre, et non plus en bulles :
//
//    · l'index (« Le récit ») et le marque-page à la plume tournent les
//      pages jusqu'au chapitre en cours ; avant lui, le sommaire du récit (les
//      chapitres finis, chargés seulement quand on en ouvre un) ;
//    · le Narrateur (l'ancien MJ) raconte à la première personne, en témoin
//      qui suit le groupe ; son texte s'écrit sur la page, vite, mot après
//      mot, au bruit de la plume ;
//    · plus de tours de parole : sur les pages du récit, un morceau de
//      parchemin sort du livre côté droit, pour écrire ce que son héros dit
//      ou fait (v301 : un marque-page qui sort du haut de la page de droite) ;
//      validé, le texte part en poussière vers le livre pendant que
//      le Narrateur lite le récrit dans la voix du Narrateur (les 4 dernières
//      lignes du livre lui donnent la scène) ;
//    · le post-it « Narrateur », sur le côté droit, lance la séquence du MJ
//      (l'Arbitre des dés d'abord) ; pendant qu'il écrit, et pendant que les
//      dés demandés attendent, le parchemin rentre dans le livre chez tous ;
//    · une note par jet demandé sort du haut du livre ; le joueur du héros
//      touche le dé, le jet part, la note rentre ; dans la marge du récit, un
//      petit dé garde le résultat, à côté de l'action. Les dés lancés, le
//      Narrateur repart tout seul ;
//    · le Destin et le Maître du Temps s'écrivent aussi dans la voix du
//      Narrateur ;
//    · un nom (héros ou PNJ) touché : une bande de papier sort du haut de la
//      page de gauche, derrière les marque-pages (v301), avec son portrait ;
//      un toucher ailleurs la fait rentrer.
//
//  Les messages restent ceux de la partie (Messages_Chat, lus par app.js,
//  relayés ici sans nouvelle lecture) : la ligne d'un joueur garde ses mots
//  (Texte, pour l'Arbitre) et ce qu'en écrit le livre (Texte_Livre, pour le
//  Narrateur, ia_master.js ligneDuLivre). Un chapitre fini (l'archivage du
//  chat, ia_master.js) se range dans Recits_Chapitres (le titre, le numéro)
//  et Recits_Textes (ses pages) ; il n'est jamais renvoyé au Narrateur.
//
//  Les pages du livre (grimoire.js) : 3-4 l'index, 5-6 la carte du monde
//  (v302), 7-8 le sommaire du récit, 9… les pages du chapitre, toujours en
//  nombre pair, puis la quatrième de couverture.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, query, where, runTransaction } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const G = () => window.GRIMOIRE || null;
// (v302 : la carte du monde occupe 5-6, juste après l'index, grimoire.js.)
// (v308) Les cartes régionales s'intercalent après la carte du monde : le
// sommaire et le chapitre se décalent d'autant (7 et 9 sans elles).
const premiereSuite = () => { const g = window.GRIMOIRE; const p = g && typeof g.premiereDeLaSuite === "function" ? g.premiereDeLaSuite() : 7; return Number(p) || 7; };
const premiereRecit = () => premiereSuite() + 2;
// (v313) Après le récit viennent les pages des Aventuriers (grimoire_fiches.js) : le récit s'arrête à sa dernière page.
const finDuRecit = () => premiereSuite() + Math.max(2, etat.elements.length);
const MOTS_PAR_SECONDE = 17;           // « les phrases doivent s'écrire quand même vite »
const AUTEURS_RECRITS = ["DESTIN", "SYSTEME_TEMPS"];
const DELAI_LITE_MS = 25000;
const MODELE_LITE = "gemini-flash-lite-latest";
const MODELE_PLUME = "gemini-3.8-flash";

const etat = {
    actif: false, idPartie: null, messages: [], initialRecu: false,
    affiches: new Set(),               // les entrées déjà montrées (sans animation)
    ecrits: {},                        // entrée en train de s'écrire -> mots déjà écrits
    totaux: {},                        // entrée -> nombre de mots
    verrou: false,                     // le Narrateur écrit (IA_En_Cours)
    combat: null,                      // le combat du récit (Combat_RP, combat_rp.js)
    envoi: false,                      // mon texte part en poussière
    chapitres: [], lecture: null,      // les chapitres finis ; celui qu'on relit
    elements: [], htmlPages: [],       // les pages de la suite (sommaire + récit)
    pagesRecit: 0,
    heros: null,                       // le héros pour qui j'écris
    lances: new Set(), autoLances: new Set(), reecritures: new Set(),
    pnjImages: {}, notes: {}, ecouteFlip: false, minuteur: null, sonPlume: 0,
    lu: null                           // (v311) le dernier mot lu, sur ce poste : { e, i }
};

// ---------------------------------------------------------------------
//  OUTILS
// ---------------------------------------------------------------------
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sansBalises = (t) => String(t || "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const normCarac = (c) => sansAccent(c).toUpperCase();
const nomCaracJoli = (n) => { const s = String(n || "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const son = (id, f) => { try { if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement(id, f); } catch (e) {} };
const hasard = (graine) => {
    let s = 0;
    for (const c of String(graine)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};
const idDe = (m) => m.idDoc || m.id || ("t" + (m.Timestamp || 0));

// LE PAPIER OÙ L'ON ÉCRIT, ABÎMÉ (v316, Nico : « améliore le réalisme de la
// texture du post-it où les joueurs écrivent : des bords abîmés, plus
// réalistes »). Un contour déchiré calculé une fois (graine fixe) : le haut
// arraché en dents irrégulières, de petites fibres qui dépassent, un coin mangé,
// des entailles sur les côtés (le bas reste droit, il est sous les pages). Le
// même contour sert de découpe (clip-path) et de dessin : un liseré clair, les
// fibres blanches du papier à l'endroit de la déchirure, et un roussi brun juste
// derrière. En plus : le grain du papier, un pli de coin, les bords foncés.
function contourDechire(graine) {
    const r = hasard(graine);
    for (let i = 0; i < 7; i++) r();
    const pts = [];
    // Le coin haut gauche, mangé en biais.
    const coin = 4 + r() * 3;
    pts.push([0, coin + 6]);
    for (let k = 1; k <= 4; k++) pts.push([coin * k / 4 + (r() - 0.5) * 0.6, coin + 6 - (coin + 4) * k / 4 + (r() - 0.5) * 1.2]);
    // Le haut, arraché : une marche au hasard, des dents fines, deux accrocs.
    let x = coin, y = 2 + r() * 1.5;
    const accrocs = [20 + r() * 25, 60 + r() * 25];
    while (x < 99) {
        x += 0.8 + r() * 1.9;
        y = Math.max(0.2, Math.min(5.5, y + (r() - 0.5) * 1.6));
        let yy = y + (r() < 0.35 ? r() * 1.1 : 0);
        if (accrocs.some(a => Math.abs(a - x) < 1.2)) yy += 3 + r() * 3;
        pts.push([Math.min(100, x), yy]);
    }
    // Le côté droit : presque droit, deux ou trois entailles.
    let yd = 3;
    while (yd < 96) {
        yd += 6 + r() * 10;
        if (yd > 96) break;
        const entaille = r() < 0.45;
        pts.push([100 - (r() * 0.5), yd]);
        if (entaille) { pts.push([100 - 1 - r() * 1.6, yd + 1 + r()]); pts.push([100 - r() * 0.4, yd + 2.4 + r() * 1.2]); }
    }
    pts.push([100, 100], [0, 100]);
    // Le côté gauche, de bas en haut.
    let yg = 100;
    while (yg > coin + 10) {
        yg -= 6 + r() * 10;
        if (yg < coin + 8) break;
        const entaille = r() < 0.4;
        pts.push([r() * 0.5, yg]);
        if (entaille) { pts.push([1 + r() * 1.4, yg - 1 - r()]); pts.push([r() * 0.4, yg - 2.4 - r() * 1.2]); }
    }
    return pts.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
}
function papierDechire(papier) {
    if (!papier) return;
    const pts = contourDechire("papier-ecriture");
    papier.style.clipPath = "polygon(" + pts.map(([a, b]) => `${a}% ${b}%`).join(", ") + ")";
    // (le haut et les côtés seuls, d'un trait ouvert — gauche, haut, droite :
    // il ne traverse pas le bas, sous les pages)
    const iBas = pts.findIndex(([a, b]) => a === 0 && b === 100);
    const haut = [...pts.slice(iBas + 1), ...pts.slice(0, iBas - 1)];
    const d = "M" + haut.map(([a, b]) => `${a},${b}`).join(" L");
    // Les fibres : de petits poils clairs qui dépassent de la déchirure du haut.
    const r = hasard("fibres-papier");
    let fibres = "";
    haut.filter(([a, b]) => b < 9 && a > 2 && a < 98).forEach(([a, b]) => {
        if (r() < 0.55) return;
        const l = 0.6 + r() * 1.4, ang = -Math.PI / 2 + (r() - 0.5) * 1.6;
        fibres += `M${a},${(b + 0.4).toFixed(2)} l${(Math.cos(ang) * l * 0.4).toFixed(2)},${(Math.sin(ang) * l).toFixed(2)} `;
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "bords-papier");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `<path class="roussi" d="${d}"/><path class="dechirure" d="${d}"/><path class="fibres" d="${fibres}"/>
        <path class="pli" d="M${(93 + r() * 2).toFixed(1)},100 L100,${(84 + r() * 4).toFixed(1)}"/>`;
    papier.insertBefore(svg, papier.firstChild);
}
const estJet = (m) => /^🎲 Jet de /.test(sansBalises(m.Texte));
const caracDuJet = (m) => ((sansBalises(m.Texte).match(/^🎲 Jet de (.+?) pour /) || [])[1] || "").trim();

// Les héros de la table (pas les monstres, ni les illusions).
function herosDeLaPartie() {
    const source = (window.PERSOS_JOUEURS_PARTIE && window.PERSOS_JOUEURS_PARTIE.length ? window.PERSOS_JOUEURS_PARTIE : window.PERSOS_PARTIE) || [];
    return source.filter(p => p && p.idPersonnage && !p.estMonstre && !p.estIllusion);
}
function mesHeros() {
    const id = moi();
    return herosDeLaPartie().filter(p => p.idJoueur === id && p.actif !== false && p.statut !== "Mort");
}
function monHeros() {
    const liste = mesHeros();
    return liste.find(p => p.idPersonnage === etat.heros) || liste[0] || null;
}

// ---------------------------------------------------------------------
//  LES NOMS QUI SE TOUCHENT : héros et PNJ, dans le texte
// ---------------------------------------------------------------------
function nomsConnus() {
    const noms = new Set();
    herosDeLaPartie().forEach(h => { if (h.prenom) noms.add(h.prenom.trim()); });
    Object.keys(etat.pnjImages).forEach(n => { if (n) noms.add(n.trim()); });
    return [...noms].filter(n => n.length > 1).sort((a, b) => b.length - a.length);
}
// v304 : Nico, « les noms des joueurs : ne les souligne pas, juste en gras,
// comme dans l'ancienne interface ». v306 : « les noms cliquables dans le
// texte RP ne marchent toujours pas » — ils restaient muets depuis la v304 :
// en gras, et cliquables (l'avatar sort du livre), comme ceux des PNJ.
const estHeros = (nom) => herosDeLaPartie().some(h => sansAccent(h.prenom) === sansAccent(nom));
const lien = (nom, texte) => estHeros(nom)
    ? `<b class="nom-livre nom-heros" data-nom="${echapper(nom)}">${echapper(texte)}</b>`
    : `<a class="nom-livre" data-nom="${echapper(nom)}">${echapper(texte)}</a>`;
// Un texte en mots (jetons HTML) ; les noms connus deviennent des liens, un seul jeton.
function jetonsDuTexte(texte, noms) {
    const t = String(texte || "");
    const jetons = [];
    const mots = (bout) => bout.split(/\s+/).filter(Boolean).forEach(m => jetons.push(echapper(m)));
    if (!noms.length) { mots(t); return jetons; }
    const re = new RegExp("(?<![\\p{L}])(" + noms.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}])", "giu");
    let i = 0, m;
    while ((m = re.exec(t))) {
        const avant = t.slice(i, m.index);
        // un nom collé à la ponctuation qui suit (« Thorin, ») : la ponctuation reste dans le lien
        const apres = t.slice(m.index + m[0].length).match(/^[,.;:!?»)]*/)[0];
        if (/\S$/.test(avant)) {
            // collé au mot d'avant (« d'Arès ») : le mot d'avant et le nom vont ensemble
            const coupe = avant.match(/^(.*\s)?(\S+)$/s);
            mots(coupe[1] || "");
            jetons.push(echapper(coupe[2]) + lien(noms.find(n => sansAccent(n) === sansAccent(m[0])) || m[0], m[0]) + echapper(apres));
        } else {
            mots(avant);
            jetons.push(lien(noms.find(n => sansAccent(n) === sansAccent(m[0])) || m[0], m[0]) + echapper(apres));
        }
        i = m.index + m[0].length + apres.length;
        re.lastIndex = i;
    }
    mots(t.slice(i));
    return souder(jetons);
}
// La ponctuation française isolée (« » ! ? : ;) reste collée à son mot : jamais
// seule en début de ligne ou de page.
function souder(jetons) {
    const r = [];
    for (let k = 0; k < jetons.length; k++) {
        const t = jetons[k];
        if (/^(&raquo;|»|!|\?|:|;|—)+$/.test(t) && r.length) { r[r.length - 1] += "&nbsp;" + t; continue; }
        if (/^(«|&laquo;|—)$/.test(t) && k + 1 < jetons.length) { jetons[k + 1] = t + "&nbsp;" + jetons[k + 1]; continue; }
        r.push(t);
    }
    return r;
}
// Le texte du Narrateur (formaterTexteMJ, ia_master.js) : des paragraphes, les
// PNJ en étiquettes (leur portrait s'il existe).
function parasDeNarration(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html || "").replace(/\*\*/g, "");
    const paras = [[]];
    const nouveau = () => { if (paras[paras.length - 1].length) paras.push([]); };
    const marcher = (n) => {
        for (const c of n.childNodes) {
            if (c.nodeType === 3) {
                c.nodeValue.split(/\n/).forEach((t, i) => { if (i) nouveau(); if (t) paras[paras.length - 1].push({ t }); });
            } else if (c.nodeType === 1) {
                if (c.tagName === "BR" || c.tagName === "P" || c.tagName === "DIV") { nouveau(); if (c.tagName !== "BR") { marcher(c); nouveau(); } continue; }
                if (c.classList && c.classList.contains("pnj-chat-hover")) {
                    const nom = ((c.querySelector("strong") || c).textContent || "").trim();
                    const img = c.querySelector("img");
                    if (nom) { if (img && img.getAttribute("src")) etat.pnjImages[nom] = img.getAttribute("src"); else if (!(nom in etat.pnjImages)) etat.pnjImages[nom] = ""; }
                    paras[paras.length - 1].push({ t: nom });
                    continue;
                }
                if (c.tagName === "IMG") continue;
                if (c.tagName === "STRONG" && c.getAttribute("style")) {
                    const nom = (c.textContent || "").trim();
                    if (nom && !(nom in etat.pnjImages)) etat.pnjImages[nom] = "";
                    paras[paras.length - 1].push({ t: nom });
                    continue;
                }
                marcher(c);
            }
        }
    };
    marcher(tpl.content);
    return paras.filter(p => p.length).map(p => p.map(x => x.t).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
}
const parasDeTexte = (t) => String(t || "").split(/\n+/).map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);

// ---------------------------------------------------------------------
//  LES ENTRÉES DU LIVRE, depuis les messages de la partie
// ---------------------------------------------------------------------
// Chaque entrée : { id, type, auteurId, textes (paragraphes), jets }. Les jets
// de dés se rangent dans la marge de l'action de leur héros ; l'Arbitre ne
// s'écrit pas (ses notes sortent du livre).
function construireEntrees(messages) {
    const liste = (messages || []).slice().sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
    const idsHeros = new Set(herosDeLaPartie().map(h => h.idPersonnage));
    const entrees = [];
    for (const m of liste) {
        const id = idDe(m);
        if (m.Auteur_ID === "ARBITRE_DES") continue;
        if (estJet(m)) {
            const brut = sansBalises(m.Texte);
            const r = brut.match(/Résultat\s*:\s*(\d+)\s*([+-]\s*\d+)?\s*=\s*(\d+)/);
            const cible = [...entrees].reverse().find(e => e.auteurId === m.Auteur_ID && (e.type === "joueur" || e.type === "ancien"));
            if (cible && r) cible.jets.push({ de: Number(r[1]), mod: (r[2] || "").replace(/\s/g, ""), total: Number(r[3]), carac: caracDuJet(m) });
            continue;
        }
        if (m.Est_Narration_IA) {
            const textes = parasDeNarration(m.Texte);
            if (textes.length) entrees.push({ id, type: "narration", auteurId: "MJ", textes, jets: [], enCours: m.Recit_En_Cours === true });
            // (v314) Le croquis de MIA_ILLUSTRATEUR, après les paragraphes ; les PNJ nouveaux, en pleine page.
            const ill = m.Illustration;
            if (ill && ill.Url) entrees.push({ id: id + "-croquis", type: "illustration", image: ill, textes: [], jets: [] });
            (Array.isArray(m.Portraits_PNJ) ? m.Portraits_PNJ : []).forEach((p, k) => {
                if (p && p.Url) entrees.push({ id: `${id}-pnj${k}`, type: "portrait", image: p, textes: [], jets: [] });
            });
            continue;
        }
        if (m.Texte_Livre && (idsHeros.has(m.Auteur_ID) || m.Livre)) {
            entrees.push({ id, type: "joueur", auteurId: m.Auteur_ID, textes: parasDeTexte(m.Texte_Livre), jets: [] });
            continue;
        }
        if (AUTEURS_RECRITS.includes(m.Auteur_ID)) {
            if (m.Texte_Livre) entrees.push({ id, type: "temps", auteurId: m.Auteur_ID, textes: parasDeTexte(m.Texte_Livre), jets: [] });
            continue;
        }
        if (["Date", "Système", "Date_En_Jeu"].includes(m.Auteur_Nom) || m.Auteur_ID === "Date") continue;
        const brut = sansBalises(m.Texte);
        if (!brut) continue;
        if (idsHeros.has(m.Auteur_ID)) entrees.push({ id, type: "ancien", auteurId: m.Auteur_ID, textes: [`${m.Auteur_Nom} : « ${brut} »`], jets: [] });
        else entrees.push({ id, type: "note", auteurId: m.Auteur_ID || "", textes: [brut], jets: [] });
    }
    return entrees;
}
// Une entrée en mots (jetons) : [[jetons du paragraphe 1], …].
function jetonsDe(entree) {
    const noms = nomsConnus();
    return (entree.textes || []).map(t => jetonsDuTexte(t, noms));
}

// Les jets demandés depuis la dernière narration, et ceux qui manquent.
function jetsEnAttente(messages) {
    const liste = (messages || []).slice().sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
    let debut = -1;
    liste.forEach((m, i) => { if (m.Est_Narration_IA) debut = i; });
    const depuis = liste.slice(debut + 1);
    const demandes = [];
    depuis.forEach(m => { if (m.Auteur_ID === "ARBITRE_DES") (m.Jets_Demandes || []).forEach(j => demandes.push({ ...j, t: m.Timestamp || 0 })); });
    const jets = depuis.filter(m => estJet(m));
    const manquants = demandes.filter(d => !jets.some(j => j.Auteur_ID === d.idPerso && (j.Timestamp || 0) >= d.t
        && (!d.caracteristique || normCarac(caracDuJet(j)) === normCarac(d.caracteristique))));
    return { demandes, manquants, jets };
}
const cleDemande = (d) => `${d.t}-${d.idPerso}-${normCarac(d.caracteristique)}`;

// ---------------------------------------------------------------------
//  LA MISE EN PAGES
// ---------------------------------------------------------------------
// Un mesureur caché, de la taille d'une page, avec les styles des pages du
// récit : les paragraphes s'y posent un à un ; celui qui déborde est coupé
// au mot près et continue sur la page suivante.
let mesureur = null;
function boiteDeMesure(gauche) {
    const g = G();
    if (!g || !g.scene()) return null;
    const livre = g.livre();
    if (!mesureur || !mesureur.isConnected) {
        mesureur = document.createElement("div");
        mesureur.className = "page-papier recit-mesureur";
        mesureur.innerHTML = `<div class="contenu-page page-recit"></div>`;
        g.scene().appendChild(mesureur);
    }
    mesureur.style.width = (parseFloat(livre.style.width) || livre.clientWidth || 800) / 2 + "px";
    mesureur.style.height = (parseFloat(livre.style.height) || livre.clientHeight || 500) + "px";
    mesureur.classList.toggle("gauche", gauche);
    mesureur.classList.toggle("droite", !gauche);
    return mesureur.firstElementChild;
}
const SVG_DE = (classe, texte) => `<svg class="${classe}" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z"/><path d="M20 9 L31 27 L9 27 Z" class="facette"/>${texte != null ? `<text x="20" y="25">${texte}</text>` : ""}</svg>`;
function deDeMarge(jets, id) {
    return jets.map(j => {
        const classe = j.de === 20 ? " critique" : (j.de === 1 ? " fumble" : "");
        return `<span class="de-marge${classe}" data-e="${echapper(id || "")}" title="Jet de ${echapper(nomCaracJoli(j.carac))} : ${j.de} ${echapper(j.mod)} = ${j.total}">${SVG_DE("de-marge-svg", j.total)}</span>`;
    }).join("");
}
const FLECHE_SUITE = `<span class="fleche-suite" title="La suite, page suivante" aria-label="La suite, page suivante"><svg viewBox="0 0 30 16" aria-hidden="true">`
    + `<path d="M 2 8.6 C 9 7.4 16 8.8 25 7.9"/><path d="M 19.5 3.2 C 22 5.2 24 6.6 26.6 7.9 C 24 9.4 22.2 10.9 20 13"/></svg></span>`;
function enteteChapitre() {
    if (etat.lecture) {
        return `<div class="entete-recit"><span class="numero-chapitre">Chapitre ${romain(etat.lecture.numero)}</span>
                  <span class="titre-chapitre">${echapper(etat.lecture.titre || "")}</span>
                  <a class="lien-recit" data-recit="courant">← Revenir au chapitre en cours</a></div>`;
    }
    return `<div class="entete-recit"><span class="numero-chapitre">Chapitre ${romain(etat.chapitres.length + 1)}</span>
              <span class="titre-chapitre en-cours">en cours d'écriture</span></div>`;
}
function romain(n) {
    n = Math.max(1, Math.floor(Number(n) || 1));
    const t = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let r = "";
    t.forEach(([v, s]) => { while (n >= v) { r += s; n -= v; } });
    return r;
}

// LE RÉCIT D'UN SEUL SOUFFLE (v303). Nico : « j'aimerais que le récit soit
// fluide et continu, en intégrant ce que disent ou font les joueurs ». La
// ligne d'un joueur (récrite dans la voix du Narrateur) ne commence pas un
// nouveau paragraphe : elle continue celui qui précède, comme une phrase de
// plus. Chaque mot garde son entrée (data-e) et son rang (data-i) : l'encre
// écrit chaque entrée à son tour, même au milieu d'un paragraphe.
function paragraphesDuChapitre(entrees) {
    const paras = [];
    for (const e of entrees) {
        if (e.image) { etat.totaux[e.id] = 0; paras.push({ e: e.id, type: e.type, image: e.image, mots: [] }); continue; }
        const blocs = jetonsDe(e);
        let i0 = 0;
        etat.totaux[e.id] = blocs.reduce((n, p) => n + p.length, 0);
        blocs.forEach((jetons, k) => {
            const mots = jetons.map((h, x) => ({ h, e: e.id, i: i0 + x }));
            if (k === 0 && e.jets.length && mots.length) mots[0].de = e.jets;
            // v307 : Nico, « quand les joueurs écrivent leur texte, fais que l'IA saute
            // quand même une ligne pour aérer le texte » — la ligne d'un joueur ouvre
            // son paragraphe (la plume l'écrit toujours dans la continuité du récit).
            paras.push({ e: e.id, type: e.type, mots });
            i0 += jetons.length;
        });
    }
    return paras;
}
// LES CROQUIS (v314, illustrations_recit.js) : une taille tirée par l'IA, centrés
// sur la page (v318), le tout stable d'un affichage à l'autre.
// Un croquis déjà vu ne se redessine pas.
etat.croquisVus = etat.croquisVus || new Set();
function htmlCroquis(para) {
    const im = para.image, r = hasard("croquis-" + para.e);
    // (v318, Nico : « centre l'image sur la page ») : toujours au milieu.
    const place = "milieu"; r();
    const neuf = !etat.croquisVus.has(para.e);
    if (neuf) setTimeout(() => etat.croquisVus.add(para.e), 4000);
    // (v328, Nico : « l'image du récit, en taille fixe : la moitié d'une page, centrée ;
    // s'il n'y a pas la place, elle se dessine sur la page suivante ») : un cadre
    // d'une demi-page de haut (grimoire_recit.css), l'image centrée dedans.
    const penche = ((r() * 2 - 1) * 2.2).toFixed(1);
    return `<figure class="croquis-recit demi-page place-${place}${neuf ? " neuf" : ""}" data-e="${echapper(para.e)}" style="--penche:${penche}deg">`
        + `<img src="${echapper(im.Url)}" alt="" draggable="false"></figure>`;
}
function htmlPortraitPleinePage(para) {
    const im = para.image;
    const neuf = !etat.croquisVus.has(para.e);
    if (neuf) setTimeout(() => etat.croquisVus.add(para.e), 4000);
    return `<figure class="portrait-pleine-page${neuf ? " neuf" : ""}" data-e="${echapper(para.e)}">`
        + `<img src="${echapper(im.Url)}" alt="${echapper(im.Nom || "")}" draggable="false"><figcaption>${echapper(im.Nom || "")}</figcaption></figure>`;
}
// Rend les pages du chapitre (HTML) : une page par élément.
function paginer(entrees) {
    const pages = [];
    let j = 0;
    let boite = boiteDeMesure(true);
    if (!boite) return pages;
    boite.innerHTML = enteteChapitre();
    const deborde = () => boite.scrollHeight > boite.clientHeight + 1;
    const vide = () => !boite.querySelector(".para-recit");
    const fermer = () => { pages.push(boite.innerHTML); j++; boite = boiteDeMesure(j % 2 === 0); boite.innerHTML = ""; };
    for (const para of paragraphesDuChapitre(entrees)) {
        // (v314) LES IMAGES : le croquis suit le texte (v328 : toujours une demi-page ;
        // sur la page suivante s'il n'y tient pas) ; le portrait d'un PNJ prend une page entière.
        if (para.image) {
            if (para.type === "portrait") {
                if (boite.innerHTML.trim()) fermer();          // toujours une page à lui
                boite.innerHTML += htmlPortraitPleinePage(para);
                fermer();
                continue;
            }
            const tmp = document.createElement("div");
            tmp.innerHTML = htmlCroquis(para);
            const fig = tmp.firstElementChild;
            boite.appendChild(fig);
            if (deborde()) {
                boite.removeChild(fig);
                if (!vide() || boite.querySelector("figure")) fermer();
                boite.appendChild(fig);
            }
            continue;
        }
        const mots = para.mots;
        let debut = 0, premier = true;
        // (le petit dé de la marge se pose sur la ligne du premier mot de son action)
        const remplir = (p, a, b) => {
            p.innerHTML = mots.slice(a, b).map(m => (m.de ? deDeMarge(m.de, m.e) : "")
                + `<span class="mot" data-e="${echapper(m.e)}" data-i="${m.i}">${m.h}</span>`).join(" ");
        };
        while (debut < mots.length) {
            const p = document.createElement("p");
            p.className = `para-recit type-${para.type}${premier ? " premier" : " suite"}`;
            p.dataset.e = para.e;
            remplir(p, debut, mots.length);
            boite.appendChild(p);
            if (!deborde()) { debut = mots.length; break; }
            let lo = 0, hi = mots.length - debut;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                remplir(p, debut, debut + mid);
                if (deborde()) hi = mid - 1; else lo = mid;
            }
            if (lo === 0) {
                boite.removeChild(p);
                if (vide()) { remplir(p, debut, debut + 1); boite.appendChild(p); debut += 1; premier = false; }
                fermer();
                continue;
            }
            remplir(p, debut, debut + lo);
            debut += lo;
            premier = false;
            fermer();
        }
    }
    if (boite.innerHTML.trim() || !pages.length) pages.push(boite.innerHTML || `<p class="page-blanche"></p>`);
    boite.innerHTML = "";                  // le mesureur ne garde rien (ses mots ne sont pas ceux du livre)
    if (pages.length % 2) pages.push("");
    // LA PETITE FLÈCHE (v304) : « une toute petite flèche noire dans le coin
    // droit de la page, en bas, pour indiquer qu'il y a une suite ».
    return pages.map((h, j) => (j % 2 === 1 && pages.slice(j + 1).some(x => /class="mot"/.test(x))) ? h + FLECHE_SUITE : h);
}

// LE SOMMAIRE DU RÉCIT (pages 5-6) : les chapitres finis, puis celui en cours.
function sommaireHtml() {
    const ligne = (id, numero, titre, classe) =>
        `<a class="ligne-sommaire${classe ? " " + classe : ""}" data-recit="${echapper(id)}"><span class="num">${romain(numero)}</span><span class="tit">${echapper(titre)}</span></a>`;
    const finis = etat.chapitres.map(c => ligne("chap:" + c.id, c.Numero, c.Titre || "Sans titre", ""));
    const courant = ligne("courant", etat.chapitres.length + 1, "Le chapitre en cours", "courant");
    const toutes = [...finis, courant];
    const gauche = toutes.slice(0, 8), droite = toutes.slice(8);
    return [
        `<div class="contenu-page page-sommaire">
           <h2 class="titre-sommaire">Le récit</h2>
           <svg class="fleuron" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>
           <div class="liste-sommaire">${gauche.join("")}</div>
         </div>`,
        `<div class="contenu-page page-sommaire droite">
           <div class="liste-sommaire">${droite.join("")}</div>
           <p class="note-sommaire">Un chapitre se ferme quand le groupe reprend la route ; son titre s'écrit alors.</p>
         </div>`
    ];
}

// ---------------------------------------------------------------------
//  LE RENDU : les pages de la suite, posées dans le livre
// ---------------------------------------------------------------------
// (v315 : les taches de café des pages du récit sont retirées — Nico : « ce
// n'est pas beau ». Les papiers vieillis restent.)
function creerPage(i) {
    const el = document.createElement("div");
    el.className = `page-grimoire page-papier ${(premiereSuite() + i) % 2 === 1 ? "gauche" : "droite"} page-suite`;
    el.id = "grimoire-suite-" + i;
    return el;
}
function rendre() {
    const g = G();
    if (!etat.actif || !g) return;
    const entrees = etat.lecture ? etat.lecture.entrees : construireEntrees(etat.messages);
    // Les entrées nouvelles s'écrivent ; celles d'avant (et un chapitre relu) sont déjà là.
    if (!etat.lecture) {
        entrees.forEach(e => {
            if (!etat.affiches.has(e.id)) {
                etat.affiches.add(e.id);
                if (etat.initialRecu) etat.ecrits[e.id] = 0;
            }
        });
    }
    const recit = paginer(entrees);
    // (Une page de droite garde sa marge basse pour le parchemin d'écriture.)
    const html = [...sommaireHtml(), ...recit.map(h => `<div class="contenu-page page-recit">${h}</div>`)];
    let change = html.length !== etat.elements.length;
    while (etat.elements.length < html.length) etat.elements.push(creerPage(etat.elements.length));
    if (etat.elements.length > html.length) etat.elements.length = html.length;
    html.forEach((h, i) => {
        if (etat.htmlPages[i] !== h) { etat.elements[i].innerHTML = h; etat.htmlPages[i] = h; }
    });
    etat.htmlPages.length = html.length;
    const avant = etat.pagesRecit;
    etat.pagesRecit = recit.length;
    if (change) g.definirSuite(etat.elements);
    appliquerEcriture();
    // (v304 : le livre ne tourne plus tout seul quand le récit passe à la page
    // suivante — la plume finit la double page ouverte, le lecteur tourne.)
    majInterface();
}
// Les mots pas encore écrits se cachent (l'encre les écrira).
function appliquerEcriture() {
    Object.keys(etat.ecrits).forEach(id => {
        const n = etat.ecrits[id], total = etat.totaux[id] || 0;
        etat.elements.forEach(el => el.querySelectorAll(`.mot[data-e="${CSS.escape(id)}"]`).forEach(m => {
            m.classList.toggle("a-ecrire", Number(m.dataset.i) >= n);
        }));
        if (n >= total && total > 0 && !etat.lecture) { /* fini : on le garde, il ne se cache plus */ }
    });
    if (Object.keys(etat.ecrits).some(id => etat.ecrits[id] < (etat.totaux[id] || 0))) demarrerPlume();
}

// LA PLUME QUI ÉCRIT : les mots apparaissent un à un, à l'encre, au bruit de
// la plume ; la page suit si le texte passe sur la double page suivante.
function demarrerPlume() {
    if (etat.minuteur) return;
    etat.minuteur = setInterval(ecrireUnMot, 1000 / MOTS_PAR_SECONDE);
}
function ecrireUnMot() {
    const ordre = construireOrdreEcriture();
    const id = ordre.find(x => etat.ecrits[x] < (etat.totaux[x] || 0));
    if (!id) { clearInterval(etat.minuteur); etat.minuteur = null; majInterface(); return; }
    const i = etat.ecrits[id];
    let mot = null;
    for (const el of etat.elements) { mot = el.querySelector(`.mot[data-e="${CSS.escape(id)}"][data-i="${i}"]`); if (mot) break; }
    // LA PLUME FINIT LA DOUBLE PAGE OUVERTE (v304). Nico : « quand le récit
    // va créer une nouvelle page, il tourne de suite la page ; on va faire
    // autrement : il va finir la page en cours et laisser le joueur tourner
    // la page lui-même pour lire la suite ». Un mot qui tombe sur une page
    // pas encore ouverte attend que le lecteur y arrive ; un mot sur une page
    // qu'il a déjà dépassée s'écrit d'un coup.
    // v307 : Nico, « quand le texte s'écrit sur les pages d'après, fais-les écrire
    // directement, pas quand le joueur tourne la page : quand il la tournera, les
    // mots seront déjà écrits ». Hors de la double page ouverte (avant, après, ou
    // le lecteur ailleurs dans le livre), l'encre se pose d'un coup ; seule une
    // page en mouvement fait attendre la plume. (La petite flèche reste.)
    const ou = mot ? placeDuMot(mot) : "ouvert";
    if (ou === "attente") return;
    if (ou !== "ouvert") {
        while (mot && !["ouvert", "attente"].includes(placeDuMot(mot))) {
            mot.classList.remove("a-ecrire");
            etat.ecrits[id] += 1;
            mot = null;
            for (const el of etat.elements) { mot = el.querySelector(`.mot[data-e="${CSS.escape(id)}"][data-i="${etat.ecrits[id]}"]`); if (mot) break; }
        }
        return;
    }
    etat.ecrits[id] = i + 1;
    if (mot) {
        mot.classList.remove("a-ecrire");
        mot.classList.add("ecrit");
        if (Math.random() < 0.6) son("plume-ecrit", 0.8);
    }
}
// Où est ce mot pour le lecteur : sur la double page ouverte, avant, ou après ?
function placeDuMot(mot) {
    const g = G(), pf = g && g.pageFlip();
    if (!pf || etat.lecture) return "ouvert";
    const index = premiereSuite() + etat.elements.indexOf(mot.closest(".page-suite"));
    const ici = pf.getCurrentPageIndex(), gauche = ici % 2 === 1 ? ici : ici - 1;
    if (pf.getState() !== "read" || (g.defileEnCours && g.defileEnCours())) return "attente";
    if (!g.ouvert() || ici < premiereRecit() || ici >= finDuRecit()) return "ailleurs";
    if (index < gauche) return "avant";
    if (index > gauche + 1) return "apres";
    return "ouvert";
}
// L'ordre des entrées dans le livre (celles d'abord, celles d'après ensuite).
function construireOrdreEcriture() {
    const vus = [];
    etat.elements.forEach(el => el.querySelectorAll(".mot[data-e]").forEach(m => { if (!vus.includes(m.dataset.e)) vus.push(m.dataset.e); }));
    Object.keys(etat.ecrits).forEach(id => { if (!vus.includes(id)) vus.push(id); });
    return vus;
}
function allerALaDernierePage() {
    const g = G();
    if (!g) return;
    g.allerALaPage(pageALire());
}
// LÀ OÙ ON N'A PAS ENCORE LU (v311). Nico : « le narrateur a écrit sur trois
// pages, ça m'a ouvert direct à la troisième ; il faudrait que, si je n'ai pas lu
// la suite, ça s'ouvre là où je n'ai pas encore lu ». Le livre retient (sur ce
// poste, pour chaque partie) le dernier mot écrit qu'on a eu sous les yeux — la
// fin de la double page ouverte, posée, sur le récit ; le récit s'ouvre sur la
// double page du mot suivant. Tout lu (ou rien de retenu) : la dernière page.
const cleLu = () => "ivalis_livre_lu_" + (etat.idPartie || "");
const tousLesMots = () => etat.elements.flatMap(el => [...el.querySelectorAll(".mot[data-e]")]);
const rangDe = (mots, lu) => lu ? mots.findIndex(m => m.dataset.e === lu.e && m.dataset.i === String(lu.i)) : -1;
function noterLecture() {
    const g = G(), pf = g && g.pageFlip();
    if (!pf || !surLeRecit() || pf.getState() !== "read" || (g.defileEnCours && g.defileEnCours())) return;
    const ici = pf.getCurrentPageIndex(), gauche = ici % 2 === 1 ? ici : ici - 1;
    const vus = [gauche, gauche + 1].map(i => etat.elements[i - premiereSuite()]).filter(Boolean)
        .flatMap(el => [...el.querySelectorAll(".mot[data-e]:not(.a-ecrire)")]);
    const dernier = vus[vus.length - 1];
    if (!dernier) return;
    const mots = tousLesMots();
    if (rangDe(mots, etat.lu) >= mots.indexOf(dernier)) return;
    etat.lu = { e: dernier.dataset.e, i: Number(dernier.dataset.i) };
    try { localStorage.setItem(cleLu(), JSON.stringify(etat.lu)); } catch (e) {}
}
function pageALire() {
    const derniere = premiereRecit() + Math.max(etat.pagesRecit, 2) - 1;
    const finale = derniere % 2 === 1 ? derniere : derniere - 1;
    const mots = tousLesMots(), rang = rangDe(mots, etat.lu);
    if (rang < 0 || rang + 1 >= mots.length) return finale;
    const page = premiereSuite() + etat.elements.indexOf(mots[rang + 1].closest(".page-suite"));
    if (page < premiereRecit()) return finale;
    return Math.min(finale, page % 2 === 1 ? page : page - 1);
}

// ---------------------------------------------------------------------
//  LES ÉLÉMENTS DU RÉCIT AUTOUR DU LIVRE
// ---------------------------------------------------------------------
let elts = null;
const SVG_PLUME = `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="plein" d="M34 3 C24 8 15 18 11 31 C18 24 28 16 34 3 Z"/><path d="M34 3 C26 14 18 24 7 37"/></svg>`;
// LA TÊTE QUI PARLE (v312) : Nico, « récupère le bouton du micro pour le mettre
// au-dessus de la plume, dans l'encart où les joueurs écrivent ; un dessin en noir
// dans le même style que la plume, d'un symbole de tête qui parle, discret ».
const SVG_TETE_PARLE = `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="plein" d="M9 33 C8 27 6 24 6.5 18 C7 10 13 5.5 19.5 6 C25 6.4 28.5 10.5 28.6 15.5 C28.7 17.5 30.5 19.5 30.6 20.6 C30.7 21.6 29 21.8 28.7 22.4 C28.5 23 29 24.6 28.4 25.4 C27.8 26.2 26.6 25.8 26.6 26.8 C26.6 28 27.4 29.6 25.8 30.4 C24.2 31.2 21 30.3 20.2 31.3 C19.6 32 19.8 33 19.8 34"/><path d="M32.5 13.5 C34.4 15.2 34.6 18.6 32.6 20.6"/><path d="M35.2 10.6 C38.6 13.8 38.8 20.6 35.4 23.8"/></svg>`;
const SILHOUETTE = `<svg class="silhouette" viewBox="0 0 100 140" aria-hidden="true"><path d="M50 18 C64 18 70 30 69 42 C68 56 60 66 50 66 C40 66 32 56 31 42 C30 30 36 18 50 18 Z"/><path d="M14 136 C16 104 30 84 50 82 C70 84 84 104 86 136"/></svg>`;
function creerElements() {
    const g = G();
    const scene = g.scene(), livre = g.livre(), ecran = g.ecran();
    const avantLivre = (el) => scene.insertBefore(el, livre);
    // LES PAPIERS DES AVATARS (v306). Nico : « les avatars des personnages, quand
    // on clique sur leur nom, sortent du côté gauche du livre, un peu en biais,
    // sur un morceau de parchemin usé. Quand on ne clique rien, dans la partie RP,
    // il reste sorti tout le temps avec l'avatar de son personnage. Quand on
    // clique sur un nom, un autre papier vient sortir par-dessus, légèrement
    // décalé, pour donner l'illusion de superposition. » Glissés sous la tranche
    // gauche du livre : ils en sortent vers la gauche.
    const avatars = document.createElement("div");
    avatars.className = "recit-avatars";
    avatars.id = "recit-avatars";
    const papier = (id, idImage, idNom) => `<div class="papier-avatar" id="${id}"><div class="papier-usure"><div class="cadre-portrait" id="${idImage}"></div><div class="nom-portrait" id="${idNom}"></div></div></div>`;
    avatars.innerHTML = papier("recit-avatar", "recit-avatar-image", "recit-avatar-nom") + papier("recit-portrait", "recit-portrait-image", "recit-portrait-nom")
        // v310 : les couches hautes de la tranche, par-dessus les papiers.
        + `<div class="recit-tranche" aria-hidden="true"></div>`;
    scene.insertBefore(avatars, document.getElementById("grimoire-marque-page") || livre);
    const portrait = avatars.querySelector("#recit-portrait"), avatar = avatars.querySelector("#recit-avatar");
    const notes = document.createElement("div");
    notes.className = "recit-notes";
    notes.id = "recit-notes";
    avantLivre(notes);
    const postit = document.createElement("button");
    postit.type = "button";
    postit.className = "recit-postit";
    postit.id = "recit-postit";
    postit.setAttribute("aria-label", "Le Narrateur écrit la suite");
    postit.innerHTML = `<span class="papier-postit">${SVG_PLUME}<span>Narrateur</span></span>`;
    avantLivre(postit);
    const ecriture = document.createElement("div");
    ecriture.className = "recit-ecriture";
    ecriture.id = "recit-ecriture";
    ecriture.innerHTML = `<form class="papier-ecriture" id="recit-form" novalidate>
        <div class="choix-heros" id="recit-choix-heros"></div>
        <textarea id="recit-saisie" rows="3" maxlength="900" placeholder="Ce que ton héros dit ou fait…"></textarea>
        <button type="button" class="ecriture-micro" id="recit-micro" aria-label="Dicter à voix haute" title="Dicter à voix haute">${SVG_TETE_PARLE}</button>
        <button type="submit" class="ecriture-plume" id="recit-envoyer" aria-label="Écrire dans le livre">${SVG_PLUME}</button>
      </form>`;
    papierDechire(ecriture.querySelector(".papier-ecriture"));
    avantLivre(ecriture);                  // (v301) un marque-page : sous les pages, il sort par le haut
    const poussiere = document.createElement("div");
    poussiere.className = "recit-poussiere";
    poussiere.id = "recit-poussiere";
    ecran.appendChild(poussiere);
    elts = { portrait, avatar, avatars, notes, postit, ecriture, poussiere, saisie: ecriture.querySelector("textarea"), form: ecriture.querySelector("form") };
    elts.form.addEventListener("submit", (ev) => { ev.preventDefault(); envoyer(); });
    elts.saisie.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    elts.micro = ecriture.querySelector("#recit-micro");
    toucherVite(elts.micro, () => basculerDictee());
    toucherVite(postit, () => lancerNarrateur());
    // (v312) Les papiers des avatars : un toucher ouvre la fiche du héros.
    toucherVite(avatar, () => ouvrirFicheDuPapier(avatar));
    toucherVite(portrait, () => ouvrirFicheDuPapier(portrait));
    // Les liens du récit (noms, chapitres) et le choix du héros : une seule
    // fois par scène (elle sert à toutes les parties).
    if (scene.__recit) return;
    scene.__recit = true;
    toucherVite(scene, (cible) => {
        if (!etat.actif) return false;
        const nom = cible.closest(".nom-livre");
        if (nom) { montrerPortrait(nom.dataset.nom); return true; }
        const r = cible.closest("[data-recit]");
        if (r) { choisirDansLeSommaire(r.dataset.recit); return true; }
        const h = cible.closest("[data-heros]");
        if (h) { etat.heros = h.dataset.heros; majInterface(); return true; }
        return false;
    }, true);
}
// LA DICTÉE (v312). L'ancien bouton du chat (app.js, toggleMicro) récrivait, à
// chaque phrase, seulement celle en cours : après une pause, ce qu'on venait de
// dire s'effaçait (Nico : « si je faisais une pause, il effaçait tout ce que je
// venais de dire au lieu d'ajouter à la suite »). Ici, on garde tout : le texte
// d'avant, chaque phrase finie, et celle qu'on dit encore. Si le navigateur coupe
// l'écoute sur un silence, elle reprend toute seule, à la suite, jusqu'au
// prochain toucher.
const dictee = { reco: null, voulue: false, base: "", finies: "" };
const joindre = (a, b) => { a = a || ""; b = (b || "").trim(); if (!b) return a; return a + (a && !/\s$/.test(a) ? " " : "") + b; };
window.texteDictee = (base, resultats) => {           // (pour les bancs) ce que la dictée écrit
    let finies = "", enCours = "";
    for (const r of resultats) { if (r.isFinal) finies = joindre(finies, r.texte); else enCours = joindre(enCours, r.texte); }
    return joindre(joindre(base, finies), enCours);
};
function basculerDictee() {
    if (!elts) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { elts.saisie.placeholder = "La dictée à voix haute demande Safari, Chrome ou Edge."; return; }
    if (dictee.voulue) { arreterDictee(); return; }
    dictee.voulue = true;
    dictee.base = elts.saisie.value;
    dictee.finies = "";
    demarrerDictee(SR);
    elts.micro.classList.add("ecoute");
    son("page-prise", 0.4);
}
function demarrerDictee(SR) {
    const reco = new SR();
    reco.lang = "fr-FR"; reco.interimResults = true; reco.continuous = true;
    reco.onresult = (ev) => {
        // TOUS les résultats de la séance (pas seulement depuis resultIndex) : les phrases finies restent.
        let finies = "", enCours = "";
        for (let i = 0; i < ev.results.length; i++) {
            const t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) finies = joindre(finies, t); else enCours = joindre(enCours, t);
        }
        dictee.finies = finies;
        elts.saisie.value = joindre(joindre(dictee.base, finies), enCours);
    };
    reco.onend = () => {
        // Une pause a coupé l'écoute : on garde ce qui est dit, et on reprend à la suite.
        dictee.base = joindre(dictee.base, dictee.finies);
        dictee.finies = "";
        if (dictee.voulue && elts) { try { demarrerDictee(SR); return; } catch (e) {} }
        finirDictee();
    };
    reco.onerror = (ev) => { if (ev && (ev.error === "not-allowed" || ev.error === "service-not-allowed")) { dictee.voulue = false; finirDictee(); } };
    dictee.reco = reco;
    try { reco.start(); } catch (e) { dictee.voulue = false; finirDictee(); }
}
function arreterDictee() {
    dictee.voulue = false;
    if (dictee.reco) { try { dictee.reco.stop(); } catch (e) { try { dictee.reco.abort(); } catch (e2) {} } }
    finirDictee();
}
function finirDictee() {
    if (elts && elts.micro) elts.micro.classList.remove("ecoute");
    if (!dictee.voulue) dictee.reco = null;
    // (comme l'ancien bouton) l'iPad rend le volume du jeu une fois le micro fermé
    setTimeout(() => { if (typeof window.appliquerVolumesAudio === "function") window.appliquerVolumesAudio(); }, 500);
}

// Un toucher ailleurs : le papier du nom touché rentre dans le livre (le sien reste).
document.addEventListener("pointerdown", (ev) => {
    if (!elts || !elts.portrait.classList.contains("sortie")) return;
    if (ev.target.closest && (ev.target.closest(".nom-livre") || ev.target.closest("#recit-portrait"))) return;
    elts.portrait.classList.remove("sortie");
}, true);
// Agir dès que le doigt se lève (Safari retarde le « click », v298) ; le
// « click » qui suit est ignoré. `deleguer` : la cible est cherchée dedans.
function toucherVite(el, faire, deleguer) {
    let appui = null, dernier = 0;
    const lancer = (cible) => (deleguer ? faire(cible) : (faire(cible), true));
    el.addEventListener("pointerdown", (ev) => { appui = { x: ev.clientX, y: ev.clientY, t: Date.now(), cible: ev.target }; });
    el.addEventListener("pointerup", (ev) => {
        const a = appui; appui = null;
        if (!a || Date.now() - a.t > 900 || Math.hypot(ev.clientX - a.x, ev.clientY - a.y) > 14) return;
        if (lancer(a.cible)) dernier = Date.now();
    });
    el.addEventListener("click", (ev) => {
        if (Date.now() - dernier < 1000) return;
        lancer(ev.target);
    });
}

// LE PAPIER D'UN NOM TOUCHÉ : il sort par-dessus le sien, un peu décalé.
function remplirPapier(idImage, idNom, nom, h) {
    const url = h ? (h.urlCloudinary || h.urlPortraitReference || "") : (etat.pnjImages[nom] || etat.pnjImages[Object.keys(etat.pnjImages).find(n => sansAccent(n) === sansAccent(nom))] || "");
    const cadre = document.getElementById(idImage);
    const voulu = url ? `<img src="${echapper(url)}" alt="${echapper(nom)}" draggable="false">` : SILHOUETTE;
    if (cadre.__voulu !== voulu) { cadre.innerHTML = voulu; cadre.__voulu = voulu; }
    const el = document.getElementById(idNom), texte = h ? `${h.prenom} ${h.nom || ""}`.trim() : nom;
    if (el.textContent !== texte) { el.textContent = texte; ajusterNom(el); }
    else if (!el.__ajuste) ajusterNom(el);
    // (v312) un héros : un toucher sur son papier ouvre sa fiche
    const papier = cadre.closest(".papier-avatar");
    if (papier) papier.dataset.heros = h ? h.idPersonnage : "";
}
// LE NOM SUR UNE LIGNE (v312) : sa taille se règle sur la largeur du papier.
function ajusterNom(el) {
    if (!el) return;
    el.style.fontSize = "";
    const largeur = el.clientWidth, voulue = el.scrollWidth;
    if (!largeur) { el.__ajuste = false; return; }
    el.__ajuste = true;
    if (voulue > largeur) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * largeur / voulue * 0.97).toFixed(2) + "px";
}
window.addEventListener("resize", () => setTimeout(() => document.querySelectorAll(".papier-avatar .nom-portrait").forEach(ajusterNom), 300));
function ouvrirFicheDuPapier(papier) {
    const id = papier && papier.dataset.heros;
    const h = id && herosDeLaPartie().find(p => p.idPersonnage === id);
    if (!h || typeof window.ouvrirFichePerso !== "function") return;
    son("page-prise", 0.5);
    try { window.ouvrirFichePerso(h.idPersonnage, h.prenom, h.nom, h.couleur); } catch (e) { console.error("Le livre : la fiche", e); }
}
function montrerPortrait(nom) {
    if (!elts || !nom) return;
    const h = herosDeLaPartie().find(p => sansAccent(p.prenom) === sansAccent(nom) || sansAccent(`${p.prenom} ${p.nom}`) === sansAccent(nom));
    remplirPapier("recit-portrait-image", "recit-portrait-nom", nom, h);
    elts.portrait.classList.remove("sortie");
    void elts.portrait.offsetWidth;
    elts.portrait.classList.add("sortie");
    son("page-prise", 0.6);
}

// LE SOMMAIRE : un chapitre fini se charge (et seulement lui) ; « en cours »
// revient au chapitre vivant.
async function choisirDansLeSommaire(cle) {
    if (cle === "courant") { allerAuRecit(); return; }
    if (!cle.startsWith("chap:")) return;
    const id = cle.slice(5);
    const fiche = etat.chapitres.find(c => c.id === id);
    if (!fiche) return;
    try {
        const snap = await getDoc(doc(db, "Recits_Textes", id));
        const data = snap.exists() ? snap.data() : {};
        const entrees = (data.Entrees || []).map(e => ({ id: e.id, type: e.type || "narration", auteurId: e.auteurId || "",
            textes: (e.textes || []).slice(), jets: (e.jets || []).slice() }));
        etat.lecture = { id, numero: fiche.Numero, titre: fiche.Titre, entrees };
        rendre();
        G().allerALaPage(premiereRecit());
    } catch (e) { console.error("Le livre : chapitre", e); }
}
function allerAuRecit() {
    if (!etat.actif) return;
    if (etat.lecture) { etat.lecture = null; rendre(); }
    allerALaDernierePage();
}
// v313 : Nico, « quand on clique sur Le récit dans le sommaire, ça envoie à la
// page du sommaire des chapitres du récit ».
function allerAuSommaireDuRecit() {
    if (!etat.actif) return;
    if (etat.lecture) { etat.lecture = null; rendre(); }
    G().allerALaPage(premiereSuite());
}
// LE MARQUE-PAGE DU RÉCIT (v307). Nico : « ça amène à la dernière page du récit ;
// fais que si on rappuie une deuxième fois, ça amène à l'index des chapitres ».
function marqueDuRecit() {
    if (!etat.actif) return;
    const g = G(), pf = g && g.pageFlip();
    if (pf && !etat.lecture) {
        // (v311) la double page à lire : la première pas encore lue, sinon la dernière.
        const gauche = pageALire();
        const ici = pf.getCurrentPageIndex();
        if (ici === gauche || ici === gauche + 1) { g.allerALaPage(premiereSuite()); return; }
    }
    allerAuRecit();
}

// ---------------------------------------------------------------------
//  LE PARCHEMIN D'ÉCRITURE, LE POST-IT, LES NOTES DES DÉS
// ---------------------------------------------------------------------
function surLeRecit() {
    const g = G(), pf = g && g.pageFlip();
    const ici = pf ? pf.getCurrentPageIndex() : -1;
    return !!(etat.actif && pf && g.ouvert() && ici >= premiereRecit() && ici < finDuRecit() && !etat.lecture);
}
function majInterface() {
    if (!elts) return;
    noterLecture();
    const g = G(), pf = g && g.pageFlip();
    const attente = jetsEnAttente(etat.messages);
    const ecrit = Object.keys(etat.ecrits).some(id => etat.ecrits[id] < (etat.totaux[id] || 0) && etat.messages.some(m => idDe(m) === id && m.Est_Narration_IA));
    // (v304 : la détection d'un combat — « le destin hésite » — ne se voit plus et ne bloque rien.)
    const combat = etat.combat && ["preparation", "en_cours", "narration"].includes(etat.combat.Etat);
    const bloque = etat.verrou || attente.manquants.length > 0 || combat;
    const posee = pf && pf.getState() === "read";
    // v312 — Nico : « quand on tourne la page du RP, l'encart de l'avatar, les
    // post-its et l'encart pour écrire sursautent, comme s'ils s'enlevaient
    // brièvement avant de reprendre leur place ; laisse-les juste en place ».
    // Tant qu'une page tourne (ou que les pages défilent), ils ne bougent pas :
    // on regarde de nouveau quand le livre s'est posé.
    const fige = !posee || !!(g && g.defileEnCours && g.defileEnCours());
    const heros = monHeros();
    const recit = surLeRecit();
    // v307 : Nico, « quand un joueur écrit et que l'animation se joue, ne replie pas
    // de suite le morceau de papier dans le livre ; on le replie quand le narrateur
    // écrit ». Pendant l'envoi il reste là (sans rien prendre de plus) ; il rentre
    // quand le Narrateur prend la plume (son tour, ou sa page qui s'écrit).
    const ouvrir = recit && posee && !bloque && !ecrit && !!heros;
    elts.saisie.readOnly = !!etat.envoi;
    const etaitSorti = elts.ecriture.classList.contains("sortie");
    if (!fige) elts.ecriture.classList.toggle("sortie", ouvrir);
    if (ouvrir && !etaitSorti && window.matchMedia && !window.matchMedia("(hover: none)").matches) setTimeout(() => { try { elts.saisie.focus({ preventScroll: true }); } catch (e) {} }, 450);
    if (heros) {
        elts.saisie.placeholder = `Ce que ${heros.prenom} dit ou fait…`;
        const liste = mesHeros();
        document.getElementById("recit-choix-heros").innerHTML = liste.map(h =>
            `<a class="heros-choix${h.idPersonnage === heros.idPersonnage ? " choisi" : ""}" data-heros="${echapper(h.idPersonnage)}">${echapper(h.prenom)}</a>`).join("");
    }
    // v307 : Nico, « quand on clique sur le marque-page du narrateur, fais-le rentrer
    // complètement dans le livre, et qu'il ressorte quand le narrateur a fini de
    // parler ». Touché, il rentre ; il reste rentré tant que le Narrateur a la main
    // (son tour, les dés qu'il attend, sa page qui s'écrit).
    if (etat.narrateurDemande && (etat.verrou || attente.manquants.length || Date.now() - etat.narrateurDemande > 15000)) etat.narrateurDemande = 0;
    const narrateurOccupe = !!etat.narrateurDemande || bloque || ecrit;
    if (!fige) elts.postit.classList.toggle("sortie", recit && posee && !narrateurOccupe);
    if (etat.narrateurDemande) { clearTimeout(etat.revoirNarrateur); etat.revoirNarrateur = setTimeout(majInterface, 15200); }
    // (v306) Son papier : sorti tant qu'on est dans le récit, avec l'avatar de son héros.
    if (heros) remplirPapier("recit-avatar-image", "recit-avatar-nom", heros.prenom, heros);
    if (!fige) elts.avatar.classList.toggle("sortie", !!(recit && posee && heros));
    elts.avatars.classList.toggle("visible", !!(etat.actif && g && g.ouvert()));
    elts.postit.classList.toggle("eteint", narrateurOccupe || etat.envoi);
    elts.postit.disabled = narrateurOccupe || etat.envoi;
    elts.notes.classList.toggle("visible", !!(etat.actif && g && g.ouvert() && pf && pf.getCurrentPageIndex() > 0));
    majNotes(attente);
    majNoteCombat();
    // Une page encore en mouvement : on regarde de nouveau quand elle s'est posée
    // (l'événement de StPageFlip peut arriver avant son état « read »).
    clearTimeout(etat.revoir);
    if (etat.actif && pf && fige) etat.revoir = setTimeout(majInterface, 120);
}
// LE COMBAT DU RÉCIT (v278, combat_rp.js) : son bouton vivait dans l'ancien
// parchemin du MJ ; dans le livre, une note rouge sort du haut du livre —
// « le destin hésite », puis COMBATTRE (ou rejoindre la bataille).
function majNoteCombat() {
    const c = etat.combat;
    // v304 : Nico, « je ne devrais pas voir "le destin hésite" : soit j'ai un lancé
    // à faire, soit rien ». La note ne sort que quand le combat est là.
    const voulu = c && ["preparation", "en_cours"].includes(c.Etat) ? c.Etat : null;
    let el = etat.notes.__combat;
    if (!voulu) {
        if (el) { delete etat.notes.__combat; el.classList.remove("sortie"); setTimeout(() => el.remove(), 700); }
        return;
    }
    if (!el) {
        el = document.createElement("div");
        el.className = "note-de note-combat";
        el.style.setProperty("--penche", "-3deg");
        elts.notes.prepend(el);
        etat.notes.__combat = el;
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("sortie")));
    }
    if (el.dataset.etat === voulu) return;
    el.dataset.etat = voulu;
    const adv = c.Adversaires ? `Face à ${echapper(c.Adversaires)}` : "Le combat éclate";
    // v313 : Nico, « revois le post-it qui apparaît quand un combat commence : pas
    // d'animation qui bouge sur Combattre, plus joli, dans le style du livre ».
    // Deux glaives croisés à l'encre, le titre à la main, l'adversaire, et le
    // bouton tracé à la plume, scellé d'une goutte de cire. Rien ne palpite.
    const GLAIVES = `<svg class="glaives-combat" viewBox="0 0 64 44" aria-hidden="true">
        <path d="M 10 40 L 46 6 M 54 40 L 18 6"/><path class="garde" d="M 13 31 L 19 37 M 51 31 L 45 37"/>
        <path class="lame" d="M 46 6 L 50 3 L 48 8 Z M 18 6 L 14 3 L 16 8 Z"/>
        <circle cx="9" cy="41" r="1.8"/><circle cx="55" cy="41" r="1.8"/></svg>`;
    el.innerHTML = voulu === "detection"
        ? `<div class="papier-note"><div class="note-heros">⚔️</div><div class="note-jet"><i>Le destin hésite…</i></div></div>`
        : `<div class="papier-note">${GLAIVES}
             <div class="titre-note-combat">${voulu === "en_cours" ? "La mêlée gronde" : "Aux armes !"}</div>
             <div class="adversaires-note-combat">${adv}</div>
             <button type="button" class="note-combattre"><svg class="trait-combattre" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
               <path d="M 3 6 Q 50 2 97 5 L 96 25 Q 50 28 4 26 Z"/><path class="leger" d="M 5 4 Q 52 4 95 7 L 98 24 Q 48 30 2 24 Z"/></svg>
               <span>${voulu === "en_cours" ? "Rejoindre le combat" : "Combattre"}</span><i class="cire-combattre" aria-hidden="true"></i></button></div>`;
    const b = el.querySelector(".note-combattre");
    if (b) toucherVite(b, () => { son("gong-blessure", 0.6); if (typeof window.rejoindreCombatRP === "function") window.rejoindreCombatRP(); });
}
function majNotes(attente) {
    const voulues = new Map(attente.manquants.map(d => [cleDemande(d), d]));
    Object.keys(etat.notes).forEach(cle => {
        if (voulues.has(cle) || cle === "__combat") return;
        const el = etat.notes[cle];
        delete etat.notes[cle];
        el.classList.remove("sortie");
        setTimeout(() => el.remove(), 700);
    });
    const id = moi();
    voulues.forEach((d, cle) => {
        if (etat.notes[cle]) return;
        const perso = herosDeLaPartie().find(p => p.idPersonnage === d.idPerso);
        const aMoi = !!(perso && perso.idJoueur === id);
        const r = hasard(cle);
        const el = document.createElement("div");
        el.className = "note-de" + (aMoi ? " a-moi" : "");
        el.dataset.cle = cle;
        el.style.setProperty("--penche", ((r() * 2 - 1) * 7).toFixed(1) + "deg");
        el.style.setProperty("--decale", ((r() * 2 - 1) * 4).toFixed(1));
        el.innerHTML = `<div class="papier-note">
            <div class="note-heros">${echapper(d.heros)}</div>
            <div class="note-jet">jet de ${echapper(nomCaracJoli(d.caracteristique))} · <i>${echapper(d.difficulte || "")}</i></div>
            ${d.action ? `<div class="note-action">${echapper(d.action)}</div>` : ""}
            <button type="button" class="note-lancer" ${aMoi ? "" : "disabled"} aria-label="Lancer le dé">${SVG_DE("note-de-svg", "20")}</button>
          </div>`;
        elts.notes.appendChild(el);
        etat.notes[cle] = el;
        if (aMoi) toucherVite(el.querySelector(".note-lancer"), () => lancerLeDe(d, el));
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("sortie")));
        son("page-prise", 0.5);
    });
}
async function lancerLeDe(d, el) {
    const cle = cleDemande(d);
    if (etat.lances.has(cle)) return;
    etat.lances.add(cle);
    el.classList.add("lance");
    try {
        if (typeof window.lancerJetPourHeros !== "function" || !(await window.lancerJetPourHeros(d.idPerso, d.caracteristique))) {
            etat.lances.delete(cle);
            el.classList.remove("lance");
        }
    } catch (e) { console.error("Le livre : le dé", e); etat.lances.delete(cle); el.classList.remove("lance"); }
}

// LE POST-IT : le Narrateur écrit la suite (l'Arbitre des dés d'abord).
function lancerNarrateur() {
    if (!elts || elts.postit.disabled || etat.verrou) return;
    son("page-prise", 0.6);
    etat.narrateurDemande = Date.now();         // (v307) il rentre dans le livre
    majInterface();
    if (typeof window.declencherTourIA === "function") {
        Promise.resolve(window.declencherTourIA()).catch(e => console.error("Le Narrateur :", e));
    }
}

// ---------------------------------------------------------------------
//  ÉCRIRE DANS LE LIVRE : le texte part en poussière, le Narrateur lite le
//  récrit, la ligne s'écrit dans le livre.
// ---------------------------------------------------------------------
async function envoyer() {
    if (!elts || etat.envoi) return;
    if (dictee.voulue) arreterDictee();          // (v312) on écrit : la dictée s'arrête
    const texte = elts.saisie.value.trim();
    const heros = monHeros();
    if (!texte || !heros || !window.ID_PARTIE_COURANTE) return;
    etat.envoi = true;
    const vol = poussiere(elts.saisie, pointDArrivee());
    elts.saisie.value = "";
    majInterface();
    son("poussiere-envol");
    let livre = null;
    try { livre = await Promise.race([reformuler(texte, heros), new Promise(r => setTimeout(() => r(null), DELAI_LITE_MS))]); }
    catch (e) { console.warn("Le Narrateur lite :", e); }
    if (!livre) livre = `${heros.prenom} : « ${texte} »`;
    await vol;
    const date = window.DATE_EN_JEU_ACTUELLE || {};
    try {
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE,
            Auteur_ID: heros.idPersonnage, Auteur_Nom: heros.prenom, Auteur_Couleur: heros.couleur || "#4a2e1b",
            Texte: texte, Texte_Livre: livre, Livre: true,
            Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
        });
    } catch (e) {
        console.error("Le livre : écrire", e);
        elts.saisie.value = texte;
    } finally {
        etat.envoi = false;
        majInterface();
    }
}
// Où va la poussière : là où le récit s'arrête, sur la double page ouverte.
function pointDArrivee() {
    const g = G(), pf = g && g.pageFlip();
    if (pf) {
        const ici = pf.getCurrentPageIndex(), gauche = ici % 2 === 1 ? ici : ici - 1;
        for (const index of [gauche + 1, gauche]) {
            const el = etat.elements[index - premiereSuite()];
            const mots = el ? el.querySelectorAll(".mot") : [];
            if (mots.length) { const r = mots[mots.length - 1].getBoundingClientRect(); if (r.width) return { x: r.right + 6, y: r.top + r.height / 2 }; }
        }
        const el = etat.elements[gauche - premiereSuite()];
        if (el) { const r = el.getBoundingClientRect(); if (r.width) return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.25 }; }
    }
    return { x: innerWidth * 0.45, y: innerHeight * 0.4 };
}
// LA POUSSIÈRE : chaque lettre se détache, se trouble et s'envole vers le
// livre, semant des grains d'encre. Rend une promesse (la fin du vol).
function poussiere(zone, cible) {
    const couche = elts && elts.poussiere;
    const texte = zone.value;
    if (!couche || !texte || typeof Element.prototype.animate !== "function") return new Promise(r => setTimeout(r, 400));
    const r = zone.getBoundingClientRect(), st = getComputedStyle(zone);
    const clone = document.createElement("div");
    clone.className = "poussiere-texte";
    Object.assign(clone.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", font: st.font, lineHeight: st.lineHeight,
                                 padding: st.padding, letterSpacing: st.letterSpacing, color: st.color });
    const lettres = [...texte].slice(0, 320);
    clone.innerHTML = lettres.map(c => c === "\n" ? "<br>" : `<span>${c === " " ? "&nbsp;" : echapper(c)}</span>`).join("");
    couche.appendChild(clone);
    const spans = [...clone.querySelectorAll("span")];
    let fin = 0;
    const anims = [];
    spans.forEach((sp, i) => {
        const b = sp.getBoundingClientRect();
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const dx = cible.x - cx, dy = cible.y - cy;
        const jx = (Math.random() - 0.5) * 60, jy = -20 - Math.random() * 50;
        // (v303 : plus lent, le temps que la plume du Narrateur récrive la ligne)
        const duree = 1500 + Math.random() * 900, delai = i * 12 + Math.random() * 140;
        fin = Math.max(fin, duree + delai);
        anims.push(sp.animate([
            { transform: "translate(0,0) scale(1)", opacity: 1, filter: "blur(0)" },
            { offset: 0.3, transform: `translate(${jx}px, ${jy}px) scale(0.85) rotate(${(Math.random() - 0.5) * 40}deg)`, opacity: 0.85, filter: "blur(0.6px)" },
            { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0, filter: "blur(2px)" }
        ], { duration: duree, delay: delai, easing: "cubic-bezier(.45,0,.55,1)", fill: "forwards" }));
        if (i % 2 === 0) {
            for (let k = 0; k < 2; k++) {
                const grain = document.createElement("i");
                grain.className = "grain-poussiere";
                grain.style.left = cx + "px"; grain.style.top = cy + "px";
                couche.appendChild(grain);
                const gx = (Math.random() - 0.5) * 90, gy = (Math.random() - 0.5) * 70;
                const d2 = 1300 + Math.random() * 1200;
                fin = Math.max(fin, d2 + delai);
                anims.push(grain.animate([
                    { transform: "translate(0,0)", opacity: 0.9 },
                    { offset: 0.4, transform: `translate(${gx}px, ${gy}px)`, opacity: 0.7 },
                    { transform: `translate(${dx + gx * 0.2}px, ${dy + gy * 0.2}px) scale(0.3)`, opacity: 0 }
                ], { duration: d2, delay: delai, easing: "ease-in-out", fill: "forwards" }));
            }
        }
    });
    return new Promise(res => setTimeout(() => {
        couche.querySelectorAll(".poussiere-texte, .grain-poussiere").forEach(n => n.remove());
        res();
    }, Math.min(fin, 3800) + 40));
}

// ---------------------------------------------------------------------
//  LE NARRATEUR LITE (Flash-Lite) : la ligne d'un joueur, dans la voix du
//  Narrateur. Il ne reçoit que les 4 dernières lignes du livre.
// ---------------------------------------------------------------------
// LA PLUME DU NARRATEUR (v303). Nico : « l'IA qui retravaille le texte des
// joueurs commence toujours par "Je vois Untel faire…", et tous les
// paragraphes : ça casse le récit, ça ne fait pas la continuité. J'aimerais
// que le récit soit fluide et continu, en intégrant ce que disent ou font les
// joueurs — quitte à mettre la version payante. » Elle écrit maintenant la
// suite de la dernière phrase du livre, dans le même paragraphe (voir
// paragraphesDuChapitre), et c'est le modèle du Narrateur (Gemini 3.8 Flash,
// réflexion basse) qui tient la plume ; Flash-Lite reprend s'il est refusé.
// v304 : la plume écrit comme un compagnon du groupe (« je », « nous », une
// émotion ou la réaction des autres), d'après le guide de style du propriétaire.
const PROMPT_NARRATEUR_LITE = `Tu es la plume du Narrateur d'Ivalis. Le Narrateur est un membre à part entière d'un groupe d'aventuriers, dans un monde d'Antiquité fantastique, et il écrit le livre de leurs aventures de l'intérieur : de la prose, au présent, à la première personne (« je » pour ce qu'il ressent et fait, « nous » pour ce que le groupe vit ensemble). Il vit la scène avec eux, mais il ne décide rien à leur place.
Un joueur vient d'écrire ce que fait ou dit son héros. Écris la ou les phrases qui l'intègrent au livre, comme si le Narrateur poursuivait sa propre page, à côté du héros :
- Tes phrases viennent JUSTE APRÈS la dernière ligne du livre, en ouvrant un nouveau paragraphe (pour aérer le texte) qui en est la suite directe : enchaîne avec elle naturellement (le rythme, le lieu, le moment, une liaison si elle sert), sans répéter ce qu'elle dit et sans recommencer la scène.
- Raconte directement l'action ou la réplique du héros (« Thorin abat son poing sur le comptoir… », « Sans attendre, Lyra… », « C'est le moment que choisit Thorin pour… », ou la réplique d'abord). Ne commence JAMAIS par « Je vois », « Je regarde », « J'observe », « Je remarque » ni aucune formule de ce genre, et varie tes débuts d'une fois sur l'autre.
- Le Narrateur peut ensuite réagir en une demi-phrase, s'il le sent : une émotion, une sensation, la réaction visible des autres, une remarque complice (« À côté de moi, Lyra retient son souffle. », « Je ne peux pas m'empêcher de sourire. »). Son « je » n'est jamais pour dire qu'il voit ou qu'il entend : il ressent, il réagit.
- Garde au mieux l'essence de ce que le joueur a voulu faire ou dire, ni plus ni moins. N'invente ni la suite, ni le résultat (on ne sait pas encore si ça réussit), ni de nouveaux personnages, ni les pensées du héros.
- S'il parle, ses paroles restent entre guillemets « », à peine corrigées, avec le nom de celui qui parle dans la phrase.
- Une écriture fluide et naturelle, sans poésie forcée ni dramatisation excessive. Une à trois phrases, sans mise en forme, sans titre, sans guillemets autour de l'ensemble.`;
const PROMPT_ANNONCE_LITE = `Tu es la plume du Narrateur d'Ivalis : membre à part entière d'un groupe d'aventuriers, il écrit le livre de leurs aventures de l'intérieur, en prose, au présent, à la première personne (« je », « nous »).
Une annonce du jeu (le temps qui passe, le destin, la route) doit entrer dans le livre. Écris-la en une ou deux phrases qui enchaînent avec la dernière ligne du livre, comme le groupe la vit (« Nous marchons jusqu'à la nuit… »), sans rien ajouter d'important, sans mise en forme, sans commencer par « Je vois ».`;
function dernieresLignes(n) {
    return construireEntrees(etat.messages).slice(-n).map(e => (e.textes || []).join(" ")).filter(Boolean).join("\n");
}
// `plume` : le modèle du Narrateur (réflexion basse) ; sinon Flash-Lite. Un
// modèle refusé (inconnu, réservé, quota) passe la main à Flash-Lite.
async function appelLite(systeme, texte, plume) {
    const cle = (() => { try { return localStorage.getItem("ivalis_GEMINI_API_KEY"); } catch (e) { return null; } })();
    if (!cle) return null;
    const modele = plume ? MODELE_PLUME : MODELE_LITE;
    const generationConfig = { temperature: 0.85, maxOutputTokens: plume ? 1200 : 400 };
    if (plume) generationConfig.thinkingConfig = { thinkingLevel: "low" };
    const rep = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systeme }] },
            contents: [{ role: "user", parts: [{ text: texte }] }],
            generationConfig
        })
    });
    if (!rep.ok && plume && [400, 403, 404, 429].includes(rep.status)) {
        console.warn(`[La plume du Narrateur] ${modele} refusé (${rep.status}) : ${MODELE_LITE} prend la plume.`);
        return appelLite(systeme, texte, false);
    }
    if (!rep.ok) throw new Error("statut " + rep.status);
    const data = await rep.json();
    if (data.usageMetadata && typeof window.ajouterTokens === "function") window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    const t = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
        .filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("").replace(/\*+/g, "").trim();
    return t || null;
}
function reformuler(texte, heros) {
    // (v312) son genre aussi : la plume accorde (« elle », « il »).
    const fem = typeof window.estGenreFeminin === "function" ? window.estGenreFeminin(heros.genre) : /^f/i.test(String(heros.genre || ""));
    const genre = heros.genre ? (fem ? "une femme — accorde au féminin" : "un homme") : "";
    const details = [genre, heros.race, heros.classe && (typeof window.nomClasseGenre === "function" ? window.nomClasseGenre(heros.classe, heros.genre) : heros.classe)].filter(Boolean).join(", ");
    const qui = [heros.prenom, heros.nom].filter(Boolean).join(" ") + (details ? ` (${details})` : "");
    return appelLite(PROMPT_NARRATEUR_LITE, `LES DERNIÈRES LIGNES DU LIVRE (tu continues la dernière) :\n${dernieresLignes(4) || "(le livre commence)"}\n\nLE HÉROS : ${qui}\nCE QU'ÉCRIT SON JOUEUR : ${texte}`, true);
}
// Le Destin et le Maître du Temps : un seul poste récrit chaque annonce
// (il la réserve d'abord), les autres attendent sa ligne.
async function recrireAnnonce(m) {
    const id = idDe(m);
    if (etat.reecritures.has(id) || !m.idDoc) return;
    etat.reecritures.add(id);
    const ref = doc(db, "Messages_Chat", m.idDoc);
    let aMoi = false;
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) return;
            const d = snap.data();
            if (d.Texte_Livre || (d.Livre_Plume && Date.now() - (d.Livre_Plume_T || 0) < 30000)) return;
            tx.update(ref, { Livre_Plume: moi() || "?", Livre_Plume_T: Date.now() });
            aMoi = true;
        });
    } catch (e) { console.warn("Le livre : annonce", e); }
    if (!aMoi) return;
    let t = null;
    try { t = await appelLite(PROMPT_ANNONCE_LITE, `LES DERNIÈRES LIGNES DU LIVRE :\n${dernieresLignes(3) || "(le livre commence)"}\n\nL'ANNONCE : ${sansBalises(m.Texte)}`, true); }
    catch (e) { console.warn("Le Narrateur lite (annonce) :", e); }
    try { await updateDoc(ref, { Texte_Livre: t || sansBalises(m.Texte).replace(/^[⏳\s*]+|\*+$/g, "") }); }
    catch (e) { console.error("Le livre : annonce", e); }
}

// ---------------------------------------------------------------------
//  LES CHAPITRES FINIS : rangés dans le livre, chargés à la demande
// ---------------------------------------------------------------------
async function chargerChapitres(idPartie) {
    try {
        const snap = await getDocs(query(collection(db, "Recits_Chapitres"), where("ID_Partie", "==", idPartie)));
        const liste = [];
        snap.forEach(d => liste.push({ id: d.id, ...d.data() }));
        if (etat.idPartie !== idPartie) return;
        etat.chapitres = liste.sort((a, b) => (a.Numero || 0) - (b.Numero || 0));
        rendre();
    } catch (e) { console.error("Le livre : les chapitres", e); }
}
// Appelée par l'archivage du chat (ia_master.js), avant qu'il ne se vide : le
// chapitre, son titre (écrit d'après ce qui y a été vécu) et ses pages.
async function archiverChapitre(messages) {
    const idPartie = window.ID_PARTIE_COURANTE;
    if (!idPartie) return null;
    const entrees = construireEntrees((messages || []).map(m => ({ idDoc: m.idDoc || m.id, ...m })));
    if (!entrees.some(e => e.type === "narration" || e.type === "joueur")) return null;
    const texte = entrees.map(e => e.textes.join(" ")).join("\n").slice(-14000);
    let titre = null;
    try {
        titre = await appelLite(`Tu donnes leur titre aux chapitres du livre d'Ivalis (un jeu de rôle d'Antiquité fantastique). Lis ce chapitre et donne-lui un titre de 3 à 8 mots, évocateur, à la manière d'un vieux roman d'aventures, d'après ce qui y a été vécu. Réponds par le titre seul, sans guillemets ni ponctuation finale.`, texte);
    } catch (e) { console.warn("Le titre du chapitre :", e); }
    titre = String(titre || "").split("\n")[0].replace(/^["«\s]+|["»\s.]+$/g, "").slice(0, 90) || "Un chapitre sans titre";
    let numero = 1;
    try {
        const snap = await getDocs(query(collection(db, "Recits_Chapitres"), where("ID_Partie", "==", idPartie)));
        numero = snap.size + 1;
    } catch (e) {}
    const date = window.DATE_EN_JEU_ACTUELLE || {};
    const fiche = await addDoc(collection(db, "Recits_Chapitres"), {
        ID_Partie: idPartie, Numero: numero, Titre: titre, Nb_Entrees: entrees.length,
        Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
    });
    await setDoc(doc(db, "Recits_Textes", fiche.id), {
        ID_Partie: idPartie,
        Entrees: entrees.map(e => ({ id: e.id, type: e.type, auteurId: e.auteurId || "", textes: e.textes, jets: e.jets }))
    });
    console.log(`📖 [Le livre] Chapitre ${numero} rangé : « ${titre} ».`);
    if (etat.idPartie === idPartie) {
        etat.chapitres.push({ id: fiche.id, ID_Partie: idPartie, Numero: numero, Titre: titre });
        rendre();
    }
    return { id: fiche.id, numero, titre };
}

// ---------------------------------------------------------------------
//  CE QUE LE JEU RELAIE (app.js) : les messages, l'état de la partie
// ---------------------------------------------------------------------
window.livreRecitMessages = function (messages, options) {
    const initial = !!(options && options.initial);
    const avant = new Set(etat.messages.map(idDe));
    etat.messages = (messages || []).slice();
    if (!etat.actif) { if (initial) etat.initialRecu = false; return; }
    if (initial || !etat.initialRecu) {
        // Ce qui était déjà écrit à l'arrivée : posé tel quel, sans plume.
        construireEntrees(etat.messages).forEach(e => etat.affiches.add(e.id));
        etat.initialRecu = true;
    }
    // Les annonces du Destin et du Temps, à récrire dans la voix du Narrateur.
    etat.messages.forEach(m => { if (AUTEURS_RECRITS.includes(m.Auteur_ID) && !m.Texte_Livre) recrireAnnonce(m); });
    rendre();
    // LES DÉS LANCÉS : le dernier jet demandé est tombé (par un de mes héros) :
    // le Narrateur repart tout seul.
    if (initial) return;
    const attente = jetsEnAttente(etat.messages);
    const mesIds = new Set(mesHeros().map(h => h.idPersonnage));
    const nouveauJet = etat.messages.find(m => !avant.has(idDe(m)) && estJet(m) && mesIds.has(m.Auteur_ID));
    if (nouveauJet && attente.demandes.length && !attente.manquants.length && !etat.autoLances.has(idDe(nouveauJet))) {
        etat.autoLances.add(idDe(nouveauJet));
        setTimeout(() => { if (typeof window.declencherTourIA === "function") Promise.resolve(window.declencherTourIA()).catch(e => console.error("Le Narrateur :", e)); }, 700);
    }
};
window.livreRecitPartie = function (data) {
    const v = !!(data && data.IA_En_Cours === true);
    const c = (data && data.Combat_RP) || null;
    const avant = JSON.stringify(etat.combat && [etat.combat.Etat, etat.combat.Adversaires]);
    const combatChange = avant !== JSON.stringify(c && [c.Etat, c.Adversaires]);
    if (v === etat.verrou && !combatChange) return;
    etat.verrou = v;
    etat.combat = c;
    majInterface();
};

// ---------------------------------------------------------------------
//  ENTRER, SORTIR
// ---------------------------------------------------------------------
// L'ancien chat parlait par-dessus tout (le parchemin du MJ, l'écran
// d'attente, le bandeau des dés) : dans le livre, il se tait.
function faireTaireLAncienChat() {
    const envelopper = (nom, taire) => {
        const f = window[nom];
        if (typeof f !== "function" || f.__livre) return;
        const g = function (...a) { if (etat.actif && taire(...a)) return undefined; return f.apply(this, a); };
        g.__livre = true;
        window[nom] = g;
    };
    envelopper("lancerRecitDynamique", () => true);
    envelopper("majRecitDynamique", () => true);
    envelopper("annoncerJetsDemandes", () => true);
    envelopper("afficherEcranAttente", (texte) => !texte);
    // v311 : Nico, « mon groupe s'est déplacé vers un POI, l'ancien code entre en
    // conflit : l'avatar de mon perso est apparu en gros à droite de l'écran ».
    // L'arrivée au POI (et le feu de camp, le retour d'un combat) ouvrait l'ancien
    // chat ; dans le livre, c'est le récit qui s'ouvre, là où on n'a pas encore lu.
    envelopper("ouvrirChatbox", () => { allerAuRecit(); return true; });
}
function entrer(idPartie) {
    const g = G();
    if (!g || !g.scene()) return;
    if (etat.actif && etat.idPartie === idPartie) return;
    if (etat.actif) sortir();
    etat.actif = true;
    etat.idPartie = idPartie || null;
    etat.lecture = null;
    etat.chapitres = [];
    etat.affiches = new Set(); etat.ecrits = {}; etat.totaux = {};
    etat.lances = new Set(); etat.autoLances = new Set(); etat.reecritures = new Set();
    etat.elements = []; etat.htmlPages = []; etat.pagesRecit = 0; etat.notes = {};
    try { etat.lu = JSON.parse(localStorage.getItem(cleLu()) || "null"); } catch (e) { etat.lu = null; }
    etat.initialRecu = etat.messages.length > 0 && etat.messages.every(m => m.ID_Partie === idPartie);
    if (!etat.initialRecu) etat.messages = [];
    else construireEntrees(etat.messages).forEach(e => etat.affiches.add(e.id));
    faireTaireLAncienChat();
    creerElements();
    const ecran = g.ecran();
    ecran.addEventListener("grimoire-page", majInterface);
    const pf = g.pageFlip();
    if (pf && !etat.ecouteFlip) { etat.ecouteFlip = true; pf.on("changeState", () => majInterface()); }
    rendre();
    if (idPartie) chargerChapitres(idPartie);
}
function sortir() {
    if (!etat.actif) return;
    etat.actif = false;
    clearInterval(etat.minuteur); etat.minuteur = null;
    const g = G();
    if (g && g.ecran()) g.ecran().removeEventListener("grimoire-page", majInterface);
    if (elts) ["avatars", "notes", "postit", "ecriture", "poussiere"].forEach(k => { if (elts[k]) elts[k].remove(); });
    elts = null;
    if (mesureur) { mesureur.remove(); mesureur = null; }
    etat.elements = []; etat.htmlPages = []; etat.pagesRecit = 0;
    etat.idPartie = null; etat.lecture = null; etat.notes = {};
}

let redim = null;
window.addEventListener("resize", () => { clearTimeout(redim); redim = setTimeout(() => { if (etat.actif) { etat.htmlPages = []; rendre(); } }, 250); });

window.GRIMOIRE_RECIT = {
    entrer, sortir, allerAuRecit, allerAuSommaireDuRecit, marqueDuRecit, archiverChapitre, rendre, envoyer,
    construireEntrees, jetsEnAttente, reformuler,
    etat: () => ({ actif: etat.actif, idPartie: etat.idPartie, pagesRecit: etat.pagesRecit, verrou: etat.verrou, envoi: etat.envoi,
                   lecture: etat.lecture ? etat.lecture.id : null, chapitres: etat.chapitres.length,
                   ecrits: { ...etat.ecrits }, totaux: { ...etat.totaux } }),
    get PREMIERE_RECIT() { return premiereRecit(); }, PROMPT_NARRATEUR_LITE
};
