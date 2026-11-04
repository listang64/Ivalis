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
//  Les pages du livre (grimoire.js) : 3-4 l'index, 5-6 le sommaire du récit,
//  7… les pages du chapitre, toujours en nombre pair, puis la quatrième de
//  couverture.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, query, where, runTransaction } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const G = () => window.GRIMOIRE || null;
const PREMIERE_SUITE = 5;              // le sommaire (5-6)
const PREMIERE_RECIT = 7;              // la première page du chapitre
const MOTS_PAR_SECONDE = 17;           // « les phrases doivent s'écrire quand même vite »
const AUTEURS_RECRITS = ["DESTIN", "SYSTEME_TEMPS"];
const DELAI_LITE_MS = 20000;
const MODELE_LITE = "gemini-flash-lite-latest";

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
    pnjImages: {}, notes: {}, ecouteFlip: false, minuteur: null, sonPlume: 0
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
const lien = (nom, texte) => `<a class="nom-livre" data-nom="${echapper(nom)}">${echapper(texte)}</a>`;
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
function deDeMarge(jets) {
    return jets.map(j => {
        const classe = j.de === 20 ? " critique" : (j.de === 1 ? " fumble" : "");
        return `<span class="de-marge${classe}" title="Jet de ${echapper(nomCaracJoli(j.carac))} : ${j.de} ${echapper(j.mod)} = ${j.total}">${SVG_DE("de-marge-svg", j.total)}</span>`;
    }).join("");
}
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
    for (const e of entrees) {
        const paras = jetonsDe(e);
        let i0 = 0;
        etat.totaux[e.id] = paras.reduce((n, p) => n + p.length, 0);
        paras.forEach((jetons, k) => {
            let debut = 0, premier = true;
            const remplir = (p, a, b) => {
                p.innerHTML = (k === 0 && premier && e.jets.length ? deDeMarge(e.jets) : "")
                    + jetons.slice(a, b).map((t, x) => `<span class="mot" data-i="${i0 + a + x}">${t}</span>`).join(" ");
            };
            while (debut < jetons.length) {
                const p = document.createElement("p");
                p.className = `para-recit type-${e.type}${premier ? "" : " suite"}${k === 0 && premier ? " premier" : ""}`;
                p.dataset.e = e.id;
                remplir(p, debut, jetons.length);
                boite.appendChild(p);
                if (!deborde()) { debut = jetons.length; break; }
                let lo = 0, hi = jetons.length - debut;
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
            i0 += jetons.length;
        });
    }
    if (boite.innerHTML.trim() || !pages.length) pages.push(boite.innerHTML || `<p class="page-blanche"></p>`);
    boite.innerHTML = "";                  // le mesureur ne garde rien (ses mots ne sont pas ceux du livre)
    if (pages.length % 2) pages.push("");
    return pages;
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
function creerPage(i) {
    const el = document.createElement("div");
    el.className = `page-grimoire page-papier ${(PREMIERE_SUITE + i) % 2 === 1 ? "gauche" : "droite"} page-suite`;
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
    // Le lecteur était sur la dernière double page : il suit le récit.
    const pf = g.pageFlip();
    if (pf && avant && etat.pagesRecit > avant && !etat.lecture) {
        const ici = pf.getCurrentPageIndex();
        if (ici >= PREMIERE_RECIT + avant - 2) setTimeout(() => allerALaDernierePage(), 120);
    }
    majInterface();
}
// Les mots pas encore écrits se cachent (l'encre les écrira).
function appliquerEcriture() {
    Object.keys(etat.ecrits).forEach(id => {
        const n = etat.ecrits[id], total = etat.totaux[id] || 0;
        etat.elements.forEach(el => el.querySelectorAll(`.para-recit[data-e="${CSS.escape(id)}"] .mot`).forEach(m => {
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
    etat.ecrits[id] = i + 1;
    let mot = null;
    for (const el of etat.elements) { mot = el.querySelector(`.para-recit[data-e="${CSS.escape(id)}"] .mot[data-i="${i}"]`); if (mot) break; }
    if (mot) {
        mot.classList.remove("a-ecrire");
        mot.classList.add("ecrit");
        if (Math.random() < 0.6) son("plume-ecrit", 0.8);
        suivreLaPlume(mot);
    }
}
// L'ordre des entrées dans le livre (celles d'abord, celles d'après ensuite).
function construireOrdreEcriture() {
    const vus = [];
    etat.elements.forEach(el => el.querySelectorAll(".para-recit[data-e]").forEach(p => { if (!vus.includes(p.dataset.e)) vus.push(p.dataset.e); }));
    Object.keys(etat.ecrits).forEach(id => { if (!vus.includes(id)) vus.push(id); });
    return vus;
}
function suivreLaPlume(mot) {
    const g = G(), pf = g && g.pageFlip();
    if (!pf || etat.lecture || pf.getState() !== "read") return;
    const page = mot.closest(".page-suite");
    const index = PREMIERE_SUITE + etat.elements.indexOf(page);
    const ici = pf.getCurrentPageIndex();
    if (ici < PREMIERE_RECIT) return;                 // le lecteur est ailleurs : on ne le dérange pas
    const gaucheIci = ici % 2 === 1 ? ici : ici - 1, gaucheMot = index % 2 === 1 ? index : index - 1;
    if (gaucheMot === gaucheIci + 2) g.allerALaPage(gaucheMot);
}
function allerALaDernierePage() {
    const g = G();
    if (!g) return;
    const derniere = PREMIERE_RECIT + Math.max(etat.pagesRecit, 2) - 1;
    g.allerALaPage(derniere % 2 === 1 ? derniere : derniere - 1);
}

// ---------------------------------------------------------------------
//  LES ÉLÉMENTS DU RÉCIT AUTOUR DU LIVRE
// ---------------------------------------------------------------------
let elts = null;
const SVG_PLUME = `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="plein" d="M34 3 C24 8 15 18 11 31 C18 24 28 16 34 3 Z"/><path d="M34 3 C26 14 18 24 7 37"/></svg>`;
const SILHOUETTE = `<svg class="silhouette" viewBox="0 0 100 140" aria-hidden="true"><path d="M50 18 C64 18 70 30 69 42 C68 56 60 66 50 66 C40 66 32 56 31 42 C30 30 36 18 50 18 Z"/><path d="M14 136 C16 104 30 84 50 82 C70 84 84 104 86 136"/></svg>`;
function creerElements() {
    const g = G();
    const scene = g.scene(), livre = g.livre(), ecran = g.ecran();
    const avantLivre = (el) => scene.insertBefore(el, livre);
    const portrait = document.createElement("div");
    portrait.className = "recit-portrait";
    portrait.id = "recit-portrait";
    portrait.innerHTML = `<div class="bande-portrait"><div class="cadre-portrait" id="recit-portrait-image"></div><div class="nom-portrait" id="recit-portrait-nom"></div></div>`;
    // (v301) Sous les pages et sous les marque-pages : elle sort du haut de la page de gauche.
    scene.insertBefore(portrait, document.getElementById("grimoire-marque-page") || livre);
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
        <button type="submit" class="ecriture-plume" id="recit-envoyer" aria-label="Écrire dans le livre">${SVG_PLUME}</button>
      </form>`;
    avantLivre(ecriture);                  // (v301) un marque-page : sous les pages, il sort par le haut
    const poussiere = document.createElement("div");
    poussiere.className = "recit-poussiere";
    poussiere.id = "recit-poussiere";
    ecran.appendChild(poussiere);
    elts = { portrait, notes, postit, ecriture, poussiere, saisie: ecriture.querySelector("textarea"), form: ecriture.querySelector("form") };
    elts.form.addEventListener("submit", (ev) => { ev.preventDefault(); envoyer(); });
    elts.saisie.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    toucherVite(postit, () => lancerNarrateur());
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
// Un toucher ailleurs : la bande du portrait rentre dans le livre.
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

// LA BANDE DU PORTRAIT : elle sort du livre côté gauche.
function montrerPortrait(nom) {
    if (!elts || !nom) return;
    const h = herosDeLaPartie().find(p => sansAccent(p.prenom) === sansAccent(nom) || sansAccent(`${p.prenom} ${p.nom}`) === sansAccent(nom));
    const url = h ? (h.urlCloudinary || h.urlPortraitReference || "") : (etat.pnjImages[nom] || etat.pnjImages[Object.keys(etat.pnjImages).find(n => sansAccent(n) === sansAccent(nom))] || "");
    document.getElementById("recit-portrait-image").innerHTML = url ? `<img src="${echapper(url)}" alt="${echapper(nom)}" draggable="false">` : SILHOUETTE;
    document.getElementById("recit-portrait-nom").textContent = h ? `${h.prenom} ${h.nom || ""}`.trim() : nom;
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
        G().allerALaPage(PREMIERE_RECIT);
    } catch (e) { console.error("Le livre : chapitre", e); }
}
function allerAuRecit() {
    if (!etat.actif) return;
    if (etat.lecture) { etat.lecture = null; rendre(); }
    allerALaDernierePage();
}

// ---------------------------------------------------------------------
//  LE PARCHEMIN D'ÉCRITURE, LE POST-IT, LES NOTES DES DÉS
// ---------------------------------------------------------------------
function surLeRecit() {
    const g = G(), pf = g && g.pageFlip();
    return !!(etat.actif && pf && g.ouvert() && pf.getCurrentPageIndex() >= PREMIERE_RECIT && !etat.lecture);
}
function majInterface() {
    if (!elts) return;
    const g = G(), pf = g && g.pageFlip();
    const attente = jetsEnAttente(etat.messages);
    const ecrit = Object.keys(etat.ecrits).some(id => etat.ecrits[id] < (etat.totaux[id] || 0) && etat.messages.some(m => idDe(m) === id && m.Est_Narration_IA));
    const combat = etat.combat && ["detection", "preparation", "en_cours", "narration"].includes(etat.combat.Etat);
    const bloque = etat.verrou || attente.manquants.length > 0 || combat;
    const posee = pf && pf.getState() === "read";
    const heros = monHeros();
    const recit = surLeRecit();
    const ouvrir = recit && posee && !bloque && !etat.envoi && !!heros;
    const etaitSorti = elts.ecriture.classList.contains("sortie");
    elts.ecriture.classList.toggle("sortie", ouvrir);
    if (ouvrir && !etaitSorti && window.matchMedia && !window.matchMedia("(hover: none)").matches) setTimeout(() => { try { elts.saisie.focus({ preventScroll: true }); } catch (e) {} }, 450);
    if (heros) {
        elts.saisie.placeholder = `Ce que ${heros.prenom} dit ou fait…`;
        const liste = mesHeros();
        document.getElementById("recit-choix-heros").innerHTML = liste.map(h =>
            `<a class="heros-choix${h.idPersonnage === heros.idPersonnage ? " choisi" : ""}" data-heros="${echapper(h.idPersonnage)}">${echapper(h.prenom)}</a>`).join("");
    }
    elts.postit.classList.toggle("sortie", recit && posee);
    elts.postit.classList.toggle("eteint", bloque || etat.envoi || ecrit);
    elts.postit.disabled = bloque || etat.envoi;
    elts.notes.classList.toggle("visible", !!(etat.actif && g && g.ouvert() && pf && pf.getCurrentPageIndex() > 0));
    majNotes(attente);
    majNoteCombat();
    // Une page encore en mouvement : on regarde de nouveau quand elle s'est posée
    // (l'événement de StPageFlip peut arriver avant son état « read »).
    clearTimeout(etat.revoir);
    if (etat.actif && pf && !posee) etat.revoir = setTimeout(majInterface, 120);
}
// LE COMBAT DU RÉCIT (v278, combat_rp.js) : son bouton vivait dans l'ancien
// parchemin du MJ ; dans le livre, une note rouge sort du haut du livre —
// « le destin hésite », puis COMBATTRE (ou rejoindre la bataille).
function majNoteCombat() {
    const c = etat.combat;
    const voulu = c && ["detection", "preparation", "en_cours"].includes(c.Etat) ? c.Etat : null;
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
    el.innerHTML = voulu === "detection"
        ? `<div class="papier-note"><div class="note-heros">⚔️</div><div class="note-jet"><i>Le destin hésite…</i></div></div>`
        : `<div class="papier-note"><div class="note-heros">${adv}</div>
             <button type="button" class="note-combattre">${voulu === "en_cours" ? "Rejoindre le combat" : "Combattre"}</button></div>`;
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
    elts.postit.classList.add("appuye");
    setTimeout(() => elts.postit.classList.remove("appuye"), 400);
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
            const el = etat.elements[index - PREMIERE_SUITE];
            const mots = el ? el.querySelectorAll(".mot") : [];
            if (mots.length) { const r = mots[mots.length - 1].getBoundingClientRect(); if (r.width) return { x: r.right + 6, y: r.top + r.height / 2 }; }
        }
        const el = etat.elements[gauche - PREMIERE_SUITE];
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
        const duree = 850 + Math.random() * 600, delai = i * 7 + Math.random() * 80;
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
                const d2 = 700 + Math.random() * 900;
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
    }, Math.min(fin, 2400) + 40));
}

// ---------------------------------------------------------------------
//  LE NARRATEUR LITE (Flash-Lite) : la ligne d'un joueur, dans la voix du
//  Narrateur. Il ne reçoit que les 4 dernières lignes du livre.
// ---------------------------------------------------------------------
const PROMPT_NARRATEUR_LITE = `Tu es le Narrateur d'Ivalis : tu accompagnes un groupe d'aventuriers dans un monde d'Antiquité fantastique et tu écris le livre de leurs aventures, à la première personne. Tu es un témoin : tu ne décides rien à leur place.
Un joueur vient d'écrire ce que fait ou dit son héros. Récris-le pour le livre, dans ta voix :
- à la première personne (c'est toi qui racontes : « Je vois Thorin… », « Thorin, fidèle à lui-même, … »), au présent ;
- garde au mieux l'essence de ce que le joueur a voulu faire ou dire, ni plus ni moins ; n'invente ni la suite, ni le résultat (tu ne sais pas encore si ça réussit), ni de nouveaux personnages ;
- s'il parle, garde ses paroles entre guillemets « », à peine corrigées ;
- ajoute si tu veux une touche de ton regard (amusé, inquiet, admiratif…), légère et courte ;
- une à trois phrases, sans mise en forme, sans titre, sans guillemets autour de l'ensemble.
Les dernières lignes du livre te donnent la scène et le ton : enchaîne avec elles, sans les répéter.`;
const PROMPT_ANNONCE_LITE = `Tu es le Narrateur d'Ivalis : tu accompagnes un groupe d'aventuriers et tu écris le livre de leurs aventures, à la première personne, au présent.
Une annonce du jeu (le temps qui passe, le destin, la route) doit entrer dans le livre. Récris-la en une ou deux phrases, dans ta voix, sans rien ajouter d'important, sans mise en forme.`;
function dernieresLignes(n) {
    return construireEntrees(etat.messages).slice(-n).map(e => (e.textes || []).join(" ")).filter(Boolean).join("\n");
}
async function appelLite(systeme, texte) {
    const cle = (() => { try { return localStorage.getItem("ivalis_GEMINI_API_KEY"); } catch (e) { return null; } })();
    if (!cle) return null;
    const rep = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE_LITE}:generateContent?key=${cle}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systeme }] },
            contents: [{ role: "user", parts: [{ text: texte }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 400 }
        })
    });
    if (!rep.ok) throw new Error("statut " + rep.status);
    const data = await rep.json();
    if (data.usageMetadata && typeof window.ajouterTokens === "function") window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    const t = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
        .filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("").replace(/\*+/g, "").trim();
    return t || null;
}
function reformuler(texte, heros) {
    const qui = [heros.prenom, heros.nom].filter(Boolean).join(" ") + (heros.race ? ` (${heros.race}${heros.classe ? ", " + heros.classe : ""})` : "");
    return appelLite(PROMPT_NARRATEUR_LITE, `LES DERNIÈRES LIGNES DU LIVRE :\n${dernieresLignes(4) || "(le livre commence)"}\n\nLE HÉROS : ${qui}\nCE QU'ÉCRIT SON JOUEUR : ${texte}`);
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
    try { t = await appelLite(PROMPT_ANNONCE_LITE, `LES DERNIÈRES LIGNES DU LIVRE :\n${dernieresLignes(3) || "(le livre commence)"}\n\nL'ANNONCE : ${sansBalises(m.Texte)}`); }
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
    if (elts) ["portrait", "notes", "postit", "ecriture", "poussiere"].forEach(k => { if (elts[k]) elts[k].remove(); });
    elts = null;
    if (mesureur) { mesureur.remove(); mesureur = null; }
    etat.elements = []; etat.htmlPages = []; etat.pagesRecit = 0;
    etat.idPartie = null; etat.lecture = null; etat.notes = {};
}

let redim = null;
window.addEventListener("resize", () => { clearTimeout(redim); redim = setTimeout(() => { if (etat.actif) { etat.htmlPages = []; rendre(); } }, 250); });

window.GRIMOIRE_RECIT = {
    entrer, sortir, allerAuRecit, archiverChapitre, rendre, envoyer,
    construireEntrees, jetsEnAttente, reformuler,
    etat: () => ({ actif: etat.actif, idPartie: etat.idPartie, pagesRecit: etat.pagesRecit, verrou: etat.verrou, envoi: etat.envoi,
                   lecture: etat.lecture ? etat.lecture.id : null, chapitres: etat.chapitres.length,
                   ecrits: { ...etat.ecrits }, totaux: { ...etat.totaux } }),
    PREMIERE_RECIT, PROMPT_NARRATEUR_LITE
};
