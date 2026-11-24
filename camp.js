// =========================================================================
//  IVALIS — LE CAMP DU CLAN NOMADE (v478)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 2) :
//    · le camp sur le document de la partie (position, caisse du groupe,
//      provisions, jauge des ressources, membres et leur tâche, intendant, tâche
//      en cours, numéro de la prochaine expédition, réputation par région) et la
//      bourse de chaque joueur (vide pour l'instant) — leurs règles : camp_pur.js ;
//    · « un bouton DEV provisoire, à côté de l'autre : crée Thémès et fait
//      apparaître l'icône du camp dans la carte régionale de la Forêt des Murmures » ;
//    · la jauge des ressources : une capture de la carte autour du camp, lue par
//      une IA (MIA_RESSOURCES, environnement_mj.js), ramenée au barème ;
//    · « le camp est un lieu de la carte, représenté par le logo qu'on utilise sur
//      la carte globale » : ce logo, sur la carte régionale et sur la carte du monde.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=1";

const PARTIES = "Systeme_Parties";
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refPartie = (p) => doc(db, PARTIES, p);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
// La région de départ du camp, pour le bouton DEV (le document l'impose).
export const REGION_DEPART = "Forêt des Murmures";
// La taille de l'icône du camp sur la carte régionale, en part de la hauteur de la carte.
export const TAILLE_ICONE_REGION = 0.06;

let camp = null;
export const lireCamp = () => camp;

// La partie, comme la base la relaie (app.js, l'écoute de la partie).
window.appliquerCampDeLaPartie = function(data) {
    const avant = JSON.stringify(camp && camp.Position);
    camp = (data && data.Camp) || null;
    if (JSON.stringify(camp && camp.Position) !== avant) redessiner();
};
function redessiner() {
    try { if (typeof window.dessinerVillagesRegion === "function") window.dessinerVillagesRegion(); } catch (e) {}
    try { if (typeof window.placerPionsVoyage === "function") window.placerPionsVoyage(); } catch (e) {}
}

// ---------------------------------------------------------------------
//  LE LOGO DU CAMP SUR LES CARTES
// ---------------------------------------------------------------------
const logo = () => window.IMAGE_GROUPE_MONDE || "";
// La carte régionale (villages_regionaux.js, dessiner) : l'élément à poser, ou null.
// `c` : le cadrage de la carte ouverte (en pixels de l'image).
window.elementCampCarte = function(numero, c) {
    if (!camp || !camp.Position || Number(camp.Position.Region) !== Number(numero) || !c || !c.largeur) return null;
    const cote = TAILLE_ICONE_REGION * c.hauteur;
    const el = document.createElement("div");
    el.className = "camp-carte";
    el.title = "Le camp";
    Object.assign(el.style, { left: (camp.Position.x * c.largeur - cote / 2) + "px", top: (camp.Position.y * c.hauteur - cote / 2) + "px", width: cote + "px", height: cote + "px" });
    el.innerHTML = `<img src="${logo()}" alt="Le camp" draggable="false">`;
    return el;
};
// La carte du monde (voyage_groupe.js, placerPions) : au centre de la boîte de la
// région du camp, à la taille du pion du groupe.
window.placerCampMonde = function(centreMonde, taille) {
    const carte = document.getElementById("carte-fond-jeu");
    let img = document.getElementById("camp-monde");
    const ici = camp && camp.Position && typeof centreMonde === "function" ? centreMonde(Number(camp.Position.Region)) : null;
    if (!ici || !carte) { if (img) img.style.display = "none"; return; }
    if (!img) {
        img = document.createElement("img");
        img.id = "camp-monde";
        img.className = "camp-monde";
        img.alt = "Le camp";
        img.title = "Le camp";
        img.draggable = false;
        img.src = logo();
        carte.appendChild(img);
    }
    Object.assign(img.style, { display: "block", left: ici.x + "px", top: ici.y + "px", width: (Number(taille) || 40) + "px" });
};

// ---------------------------------------------------------------------
//  LA JAUGE DES RESSOURCES (MIA_RESSOURCES)
// ---------------------------------------------------------------------
// { Jauge, Terrain } pour une place du camp ; { Jauge: null } si l'IA n'a rien pu dire.
export async function estimerJauge(position) {
    if (typeof window.estimerRessourcesA !== "function") return { Jauge: null, Terrain: "" };
    try {
        const r = await window.estimerRessourcesA(position);
        if (!r) return { Jauge: null, Terrain: "" };
        return { Jauge: CP.jaugeDuTerrain(r.terrain, r.valeur), Terrain: r.terrain };
    } catch (e) { console.error("[MIA_RESSOURCES] L'estimation a échoué :", e); return { Jauge: null, Terrain: "" }; }
}

// ---------------------------------------------------------------------
//  LE BOUTON DEV : THÉMÈS ET LE CAMP, EN FORÊT DES MURMURES
// ---------------------------------------------------------------------
// Une place au hasard dans la région, sur un terrain où l'on peut marcher.
function placeAuHasard(region, alea = Math.random) {
    for (let essai = 0; essai < 200; essai++) {
        const x = 0.12 + alea() * 0.76, y = 0.12 + alea() * 0.76;
        if (typeof window.placePoiValable !== "function" || window.placePoiValable(region, x, y)) return { Region: region, x: Math.round(x * 1e5) / 1e5, y: Math.round(y * 1e5) / 1e5 };
    }
    return { Region: region, x: 0.5, y: 0.5 };
}
// Les héros des joueurs de la partie : les membres du clan avec Thémès.
function herosDeLaPartie() {
    return ((window.PERSOS_JOUEURS_PARTIE && window.PERSOS_JOUEURS_PARTIE.length ? window.PERSOS_JOUEURS_PARTIE : window.PERSOS_PARTIE) || [])
        .filter(h => h && h.idPersonnage && !h.estMonstre && !h.estIllusion && h.statut !== "Mort")
        .map(h => ({ id: h.idPersonnage, nom: [h.prenom, h.nom].filter(Boolean).join(" ").trim(), joueur: h.idJoueur || "" }));
}
// Crée Thémès (sa fiche, son âme, ses liens) et le camp de la partie. Rend le camp,
// ou null (pas de partie, pas de Forêt des Murmures, refus de recréer).
export async function creerCampDev(options) {
    const o = options || {};
    const p = idPartie();
    if (!p) { avertir("Aucune partie chargée."); return null; }
    if (camp && !o.recreer && !(typeof window.confirm === "function" && window.confirm("Le camp existe déjà. Le recréer (Thémès compris) ?"))) return null;
    const region = CP.regionNommee(window.CARTES_REGIONALES || {}, REGION_DEPART);
    if (!region) { avertir(`La région « ${REGION_DEPART} » est introuvable : le camp n'a pas été créé.`); return null; }
    const position = o.position || placeAuHasard(region);
    const heros = herosDeLaPartie();
    const { Jauge, Terrain } = await estimerJauge(position);
    const maintenant = Date.now();
    const nouveau = CP.campInitial({ partie: p, position, jauge: Jauge, terrain: Terrain, membres: heros, maintenant });
    const idT = CP.idThemes(p);
    const lot = writeBatch(db);
    lot.set(doc(db, "Monde_PNJ", idT), {
        Nom_PNJ: CP.THEMES.nom, Race: CP.THEMES.race, Occupation: CP.THEMES.occupation, Description_Physique: CP.THEMES.physique,
        Style_De_Parole: CP.THEMES.style, Secret_Mental: "", Statut: "Vivant", URL_Cloudinary: "", ID_Lieu: "", ID_Batiment: "",
        ID_Partie: p, Narrateur: true, Ne_Combat_Pas: true, Immortel: true, Membre_Du_Clan: true,
        Version_Creation: Number(window.VERSION_IVALIS) || 0
    }, { merge: true });
    lot.set(doc(db, PARTIES, p, "Ames", idT), {
        id: idT, type: "pnj", nom: CP.THEMES.nom, ref: idT, psyche: CP.THEMES.psyche,
        disposition: { niveau: 2, base: 2, nature: "", raison: "Le premier du clan : il aime les héros dont il écrit l'histoire." },
        humeur: null, statut: "vivant", Version: 1, Cree_Le: maintenant, Narrateur: true
    });
    heros.forEach(h => lot.set(doc(db, PARTIES, p, "Liens", `${idT}~${h.id}`), CP.lienThemesVers(idT, h.id, maintenant)));
    const s = await getDoc(refPartie(p));
    const bourses = s.exists() && s.data().Bourses_Joueurs ? s.data().Bourses_Joueurs : {};
    lot.set(refPartie(p), { Camp: nouveau, Bourses_Joueurs: bourses }, { merge: true });
    await lot.commit();
    camp = nouveau;
    redessiner();
    avertir(`Le camp est posé en ${(window.CARTES_REGIONALES || {})[region]?.nom || REGION_DEPART}, avec Thémès${Jauge === null ? " (jauge des ressources non estimée : pas de clé Gemini ou pas d'image)" : ` (ressources : ${Jauge}/100)`}.`);
    return nouveau;
}
function avertir(texte) {
    console.log("⛺ [Camp] " + texte);
    try { if (typeof window.alert === "function") window.alert(texte); } catch (e) {}
}

window.CAMP = { lire: lireCamp, creerCampDev, estimerJauge, REGION_DEPART, regles: CP, estDev };
