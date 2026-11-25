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
import { doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, collection, deleteField, runTransaction, increment, addDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=14";

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
let areneAvant = "";
window.appliquerCampDeLaPartie = function(data) {
    const avant = JSON.stringify(camp && camp.Position);
    camp = (data && data.Camp) || null;
    if (JSON.stringify(camp && camp.Position) !== avant) redessiner();
    // (v490) La partie vient de naître : son camp se pose tout seul.
    if (!camp && data && data.Camp_A_Creer) setTimeout(() => creerCampAuto(), 0);
    // (v483) L'expédition part quand le groupe quitte la case du camp, finit quand il y revient (expedition.js).
    if (camp && data && data.Expedition) setTimeout(() => { try { if (window.EXPEDITION) window.EXPEDITION.veiller(); } catch (e) {} }, 0);
    // (v487) Le déplacement du camp : le voyage du clan part, puis s'achève (deplacement_camp.js).
    if (camp && camp.Deplacement && camp.Deplacement.En_Cours) setTimeout(() => { try { if (window.DEPLACEMENT_CAMP) window.DEPLACEMENT_CAMP.veiller(); } catch (e) {} }, 0);
    // (v485) Le conseil : l'extraordinaire qui s'ouvre tout seul, la page qui suit, le vote final (conseil.js).
    if (camp && data && (data.Conseil || camp.Conseil_Extraordinaire)) setTimeout(() => { try { if (window.CONSEIL) window.CONSEIL.veiller(); } catch (e) {} }, 0);
    // (v483) Le mode arène (test) : les combattants suivent le choix de chacun (monstres.js, recomposerCombattants).
    // (v489) La réputation par région : les jauges des pages de région suivent.
    setTimeout(() => { try { window.majReputationRegions(); } catch (e) {} }, 0);
    const arene = JSON.stringify((data && data.Arene_Choix) || null);
    if (arene !== areneAvant) { areneAvant = arene; if (typeof window.recomposerCombattants === "function") { try { window.recomposerCombattants(); } catch (e) {} } }
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
        .filter(h => h && h.idPersonnage && !h.estMonstre && !h.estIllusion && h.statut !== "Mort" && !h.librePourTous)   // (v490) un PNJ incarné reste un PNJ du camp
        .map(h => ({ id: h.idPersonnage, nom: [h.prenom, h.nom].filter(Boolean).join(" ").trim(), joueur: h.idJoueur || "" }));
}
// Crée Thémès (sa fiche, son âme, ses liens) et le camp de la partie. Rend le camp,
// ou null (pas de partie, pas de Forêt des Murmures, refus de recréer).
export async function creerCampDev(options) {
    const o = options || {};
    const p = idPartie();
    if (!p) { avertir("Aucune partie chargée."); return null; }
    if (camp && !o.recreer && !(typeof window.confirm === "function" && window.confirm("Le camp existe déjà. Le recréer (Thémès compris) ?"))) return null;
    const region = o.region || CP.regionNommee(window.CARTES_REGIONALES || {}, REGION_DEPART);
    if (!region) { avertir(`La région « ${REGION_DEPART} » est introuvable : le camp n'a pas été créé.`, o.silencieux); return null; }
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
    // (v490) Le camp de la création de la partie : le groupe part de là (s'il n'est pas déjà sur la carte), et le drapeau tombe.
    const auto = o.auto ? { Camp_A_Creer: deleteField(), ...(s.exists() && s.data().Position_Groupe ? {} : { Position_Groupe: position }) } : {};
    lot.set(refPartie(p), { Camp: nouveau, Bourses_Joueurs: bourses, ...auto }, { merge: true });
    await lot.commit();
    camp = nouveau;
    redessiner();
    avertir(`Le camp est posé en ${(window.CARTES_REGIONALES || {})[region]?.nom || REGION_DEPART}, avec Thémès${Jauge === null ? " (jauge des ressources non estimée : pas de clé Gemini ou pas d'image)" : ` (ressources : ${Jauge}/100)`}.`, o.silencieux);
    return nouveau;
}
function avertir(texte, silencieux) {
    console.log("⛺ [Camp] " + texte);
    if (silencieux) return;
    try { if (typeof window.alert === "function") window.alert(texte); } catch (e) {}
}

// ---------------------------------------------------------------------
//  (v480) LA PRÉSENCE DES JOUEURS : « sauf sur le personnage d'un autre joueur si ce joueur est
//  connecté » (la page du camp), « tous les joueurs connectés et présents » (le conseil). Chaque poste
//  donne signe de vie chaque minute (Systeme_Parties/{partie}/Presence/{joueur}) ; on lit à la demande.
// ---------------------------------------------------------------------
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
async function signeDeVie() {
    const p = idPartie(), j = moi();
    if (!p || !j || document.hidden) return;
    try { await setDoc(doc(db, PARTIES, p, "Presence", j), { Le: Date.now(), Joueur: j }); } catch (e) {}
}
setInterval(signeDeVie, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) signeDeVie(); });
let connectesLu = { p: "", le: 0, ensemble: new Set() };
export async function joueursConnectes() {
    const p = idPartie();
    if (!p) return new Set();
    if (connectesLu.p === p && Date.now() - connectesLu.le < 20000) return connectesLu.ensemble;
    const maintenant = Date.now(), ensemble = new Set();
    try { (await getDocs(collection(db, PARTIES, p, "Presence"))).forEach(d => { const x = d.data() || {}; if (CP.estConnecte(x.Le, maintenant)) ensemble.add(x.Joueur || d.id); }); } catch (e) {}
    ensemble.add(moi());
    connectesLu = { p, le: maintenant, ensemble };
    return ensemble;
}

// LES HÉROS NÉS APRÈS LE CAMP rejoignent ses membres (« tout personnage de joueur qui n'est pas utilisé en
// expédition est traité comme un PNJ : il vit au camp comme les autres ») : un poste les ajoute.
// (v490) LE CAMP DE LA CRÉATION DE LA PARTIE : « automatique à la création d'une partie (camp à un endroit aléatoire,
// 100 drachmes, 28 provisions, Thémès) ». La partie naît avec Camp_A_Creer (app.js, creerNouvellePartie) ; le premier
// poste qui l'ouvre, ses cartes chargées, prend la main (une transaction) et pose le camp dans une région au hasard.
let campEnCreation = false;
async function creerCampAuto() {
    const p = idPartie();
    if (campEnCreation || !p || camp) return null;
    const cartes = window.CARTES_REGIONALES || {};
    if (!Object.keys(cartes).length) { setTimeout(() => creerCampAuto(), 3000); return null; }   // les cartes ne sont pas encore là
    campEnCreation = true;
    try {
        const maintenant = Date.now();
        const pris = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie(p));
            const d = s.exists() ? s.data() : {};
            const a = d.Camp_A_Creer;
            // Personne d'autre ne le pose déjà (une main prise il y a plus de deux minutes est perdue).
            if (d.Camp || !a || (typeof a === "object" && maintenant - (Number(a.Le) || 0) < 120000)) return false;
            tx.update(refPartie(p), { Camp_A_Creer: { Par: moiJoueur(), Le: maintenant } });
            return true;
        });
        if (!pris) return null;
        const jouable = (n) => typeof window.terrainsDefinisRegion !== "function" || window.terrainsDefinisRegion(n);
        const region = CP.regionAuHasard(cartes, jouable) || CP.regionAuHasard(cartes) || CP.regionNommee(cartes, REGION_DEPART);
        return await creerCampDev({ recreer: true, region, auto: true, silencieux: true });
    } catch (e) { console.error("[Camp] Le camp de la nouvelle partie :", e); return null; }
    finally { campEnCreation = false; }
}
const moiJoueur = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
async function rattraperMembres() {
    const p = idPartie();
    if (!p || !camp || !camp.Membres || document.hidden) return;
    const manquants = herosDeLaPartie().filter(h => !camp.Membres[h.id]);
    if (!manquants.length) return;
    const maj = {}, lot = writeBatch(db), maintenant = Date.now(), idT = CP.idThemesDuCamp(camp);
    // (v488) Un personnage acheté (moral 100, à son joueur) ou une recrue du clan (pour tous) arrive comme tel.
    manquants.forEach(h => {
        const a = CP.arriveeDuHeros(camp, h, maintenant);
        maj["Camp.Membres." + h.id] = a.membre;
        if (a.efface === "achat") maj["Camp.Achats_En_Attente." + h.joueur] = deleteField();
        if (a.efface === "recrutement") {
            maj["Camp.Recrutement_En_Cours"] = deleteField();
            lot.update(doc(db, "Personnages", h.id), { Libre_Pour_Tous: true });   // (v490) « tout le monde peut le jouer »
        }
        // (v490) Thémès aime aussi les héros arrivés après lui (le camp de la création de la partie naît sans eux).
        if (idT) lot.set(doc(db, PARTIES, p, "Liens", `${idT}~${h.id}`), CP.lienThemesVers(idT, h.id, maintenant));
    });
    lot.update(refPartie(p), maj);
    try { await lot.commit(); } catch (e) { console.warn("[Camp] Les nouveaux membres :", e); }
}
setInterval(rattraperMembres, 15000);

// LE CLAN EST-IL AU CAMP (pas d'expédition en route, le pion sur l'icône du camp) ? « Un RP dans
// le camp ne déclenche jamais de combat » (combat_rp.js, annoncerDetectionCombat).
export function auCamp() {
    const d = window.PARTIE_DATA || {};
    const pos = typeof window.positionGroupeBrute === "function" ? window.positionGroupeBrute() : d.Position_Groupe;
    return CP.groupeAuCamp(camp, pos, d.Expedition, TAILLE_ICONE_REGION);
}
// Ce que le narrateur sait du camp quand le clan y est (ia_master.js).
export function contexteMJ() {
    if (!auCamp()) return "";
    return `--- LE CAMP DU CLAN ---\nLes héros sont au camp du clan nomade : des tentes, un feu, les membres du clan qui vaquent à leurs occupations. Ils flânent, parlent, s'occupent.\nRÈGLE ABSOLUE : un RP dans le camp ne déclenche JAMAIS de combat (aucun ennemi, aucune attaque, aucune embuscade, aucune bagarre qui tourne au combat).`;
}

// ---------------------------------------------------------------------
//  (v481) LA GESTION DU CAMP : les tâches, l'intendant, le moral
// ---------------------------------------------------------------------
// Ceux qui sont partis en expédition (étape 6) ; les autres restent au camp.
export const partis = () => (((window.PARTIE_DATA || {}).Expedition || {}).Membres || []).slice();
// « Pendant qu'une expédition est en cours, hors du camp, on ne peut ni lancer de conseil, ni changer les postes. »
export const postesBloques = () => !!camp && !auCamp();
// Ce qu'il faut savoir des membres pour leurs tâches : leurs caracs (les héros : Caracteristiques ; les PNJ :
// leur fiche, Caracs, 10 partout sinon), leur niveau, leur nom, leur portrait.
const cacheInfos = new Map();
async function lireDoc(col, id) {
    const c = cacheInfos.get(col + "/" + id);
    if (c && Date.now() - c.le < 30000) return c.d;
    let d = null;
    try { const s = await getDoc(doc(db, col, id)); d = s.exists() ? s.data() : null; } catch (e) {}
    cacheInfos.set(col + "/" + id, { d, le: Date.now() });
    return d;
}
export async function infosMembres() {
    if (!camp) return {};
    const persos = window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [];
    const out = {};
    await Promise.all(Object.keys(camp.Membres || {}).map(async (id) => {
        const mb = camp.Membres[id] || {}, h = persos.find(x => x && x.idPersonnage === id);
        if (h && !h.librePourTous) {
            const caracs = (window.CARACS_PARTIE || {})[id] || await lireDoc("Caracteristiques", id) || {};
            out[id] = { id, heros: true, joueur: h.idJoueur || "", nom: [h.prenom, h.nom].filter(Boolean).join(" ").trim() || mb.Nom || "", caracs,
                        niveau: Number(h.niveau) || 1, portrait: h.urlCloudinary || h.urlAvatarEquipe || h.urlPortraitReference || "" };
            return;
        }
        const f = await lireDoc("Monde_PNJ", id) || {};
        if (h) {   // (v490) un personnage du camp qu'un joueur a incarné : un PNJ du camp, dont la fiche d'aventurier dit les caracs et le niveau
            const caracs = (window.CARACS_PARTIE || {})[id] || await lireDoc("Caracteristiques", id) || f.Caracs || {};
            out[id] = { id, heros: false, incarne: true, joueur: h.idJoueur || "", nom: f.Nom_PNJ || [h.prenom, h.nom].filter(Boolean).join(" ").trim() || mb.Nom || "", caracs,
                        niveau: Number(h.niveau) || 1, portrait: f.URL_Cloudinary || h.urlCloudinary || h.urlPortraitReference || "", occupation: f.Occupation || "", classe: h.classe || f.Classe || "" };
            return;
        }
        out[id] = { id, heros: false, nom: f.Nom_PNJ || mb.Nom || "", caracs: f.Caracs || {}, niveau: Number(f.Niveau) || 1, portrait: f.URL_Cloudinary || "",
                    occupation: f.Occupation || "", classe: f.Classe || "" };
    }));
    return out;
}
// Donner une tâche (null : le repos). Rend "" ou la raison du refus.
export async function assignerTache(id, tache, o = {}) {
    const p = idPartie();
    if (!p || !camp) return "Pas de camp.";
    const infos = await infosMembres();
    const refus = CP.peutAssigner(camp, id, tache || null, { bloque: postesBloques(), infos, recrue: o.recrue, commerce: o.commerce });
    if (refus) return refus;
    const base = "Camp.Membres." + id + ".";
    const maj = { [base + "Tache"]: tache || null, [base + "Recrue"]: tache === "entrainer" ? o.recrue : deleteField(), [base + "Commerce"]: deleteField() };
    if (tache === "commercer") {
        const m = CP.mDeTache("commercer", (infos[id] || {}).caracs), q = Math.floor(Number(o.commerce.quantite));
        // « La transaction est payée immédiatement, au jour 1, et les provisions arrivent au camp au retour de l'expédition. »
        maj[base + "Commerce"] = { Sens: o.commerce.sens, Quantite: q, Prix: CP.prixCommerce(o.commerce.sens, q, m), Paye: false, Le: Date.now() };
    }
    try { await updateDoc(refPartie(p), maj); } catch (e) { console.error("[Camp] La tâche :", e); return "La base n'a pas répondu."; }
    return "";
}
export async function nommerIntendant(id) {
    const p = idPartie();
    if (!p || !camp) return "Pas de camp.";
    if (postesBloques()) return CP.peutAssigner(camp, id, null, { bloque: true });
    const refus = id ? CP.peutEtreIntendant(camp, id, partis()) : "";
    if (refus) return refus;
    try { await updateDoc(refPartie(p), { "Camp.Intendant": id || null }); } catch (e) { return "La base n'a pas répondu."; }
    return "";
}
// LE MORAL qui change : [{ id, delta, raison, dateJeu }]. Inscrit dans le camp (Moral, Moral_Historique), et dans
// les fils invisibles : un souvenir et une humeur (joyeux, triste) pour une variation de 5 points ou plus.
export async function changerMoral(changes) {
    const p = idPartie();
    if (!p || !camp || !Array.isArray(changes) || !changes.length) return [];
    const maj = {}, faits = [];
    changes.forEach(c => {
        const mb = (camp.Membres || {})[c.id];
        const delta = Math.round(Number(c.delta) || 0);
        if (!mb || !delta) return;
        const avant = Number.isFinite(Number(mb.Moral)) ? Number(mb.Moral) : 60, apres = CP.moralBorne(avant + delta);
        const histo = (Array.isArray(mb.Moral_Historique) ? mb.Moral_Historique : []).concat([{ Delta: apres - avant, Raison: String(c.raison || ""), Date_Jeu: c.dateJeu || "", Le: Date.now() }]).slice(-CP.MORAL_HISTORIQUE);
        maj["Camp.Membres." + c.id + ".Moral"] = apres;
        maj["Camp.Membres." + c.id + ".Moral_Historique"] = histo;
        mb.Moral = apres; mb.Moral_Historique = histo;
        faits.push({ id: c.id, avant, apres, delta: apres - avant, raison: c.raison || "", dateJeu: c.dateJeu || "" });
    });
    if (!faits.length) return [];
    await updateDoc(refPartie(p), maj);
    await inscrireMoraux(p, faits);
    return faits;
}
// Les fils invisibles : pour une variation de 5 points ou plus, un souvenir et une humeur.
async function inscrireMoraux(p, faits) {
    let tour = 0;
    try { const e = await getDoc(doc(db, PARTIES, p, "Social", "etat")); tour = Number(((e.exists() && e.data()) || {}).tour) || 0; } catch (e) {}
    for (const f of faits) {
        const h = CP.humeurDuMoral(f.delta);
        if (!h) continue;
        const texte = `${f.delta > 0 ? "Mon moral remonte" : "Mon moral baisse"} (${f.delta > 0 ? "+" : "−"}${Math.abs(f.delta)}) : ${f.raison || "la vie du camp"}.`;
        try { if (window.SOCIAL && window.SOCIAL.noterSouvenir) await window.SOCIAL.noterSouvenir(p, f.id, texte, { cle: "moral", importance: h.intensite >= 2 ? 2 : 1, dateJeu: f.dateJeu }); } catch (e) {}
        try { await setDoc(doc(db, PARTIES, p, "Ames", f.id), { humeur: { emotion: h.emotion, intensite: h.intensite, cause: f.raison || "le moral", jusquA: tour + 1 + 3 } }, { merge: true }); } catch (e) {}
    }
}

// ---------------------------------------------------------------------
//  (v482) LA JOURNÉE DU CAMP : « à chaque jour de voyage (seul le voyage fait avancer le temps) » —
//  appelée par le poste qui a fait passer le jour (voyage_groupe.js). Les règles : camp_pur.js.
// ---------------------------------------------------------------------
async function lireDateJeu() {
    try { const s = await getDoc(doc(db, "Date_En_Jeu", "actuelle")); const d = s.exists() ? s.data() : {}; return d.Jour ? `Jour ${d.Jour} de l'an ${d.Annee || "?"}` : ""; }
    catch (e) { return ""; }
}
export async function journeeDuCamp(o = {}) {
    const p = idPartie();
    if (!p || !camp) return null;
    const infos = await infosMembres();
    const persos = window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [];
    persos.forEach(h => {
        if (!h || !infos[h.idPersonnage] || typeof window.blessuresDuPerso !== "function") return;
        infos[h.idPersonnage].convalescence = Math.max(0, ...window.blessuresDuPerso(h).map(b => Number(b.jours) || 0));
    });
    const dateJeu = o.dateJeu || await lireDateJeu();
    let res = null;
    try {
        res = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie(p));
            const d = s.exists() ? s.data() : {};
            if (!d.Camp || (o.cle && d.Camp.Derniere_Journee === o.cle)) return null;
            const choix = d.Heros_Principaux || {};
            const principaux = [...new Set(persos.map(h => h && h.idJoueur).filter(Boolean))].map(j => CP.herosPrincipal(j, persos, choix)).filter(Boolean);
            const partis = ((d.Expedition || {}).Membres || []).slice();
            const jour = o.jour || (Number(d.Camp.Jours_Ecoules) || 0) + 1;
            // (v487) Le camp en route : la journée du déplacement (le camp suit le clan sur la carte).
            const r = d.Camp.Deplacement && d.Camp.Deplacement.En_Cours
                ? CP.journeeDuDeplacement({ camp: d.Camp, infos, principaux, jour, dateJeu, position: d.Position_Groupe })
                : CP.journeeDuCamp({ camp: d.Camp, infos, partis, expedition: d.Expedition && d.Expedition.En_Cours ? d.Expedition : null, principaux, jour, dateJeu });
            r.camp.Derniere_Journee = o.cle || ("jour_" + r.camp.Jours_Ecoules);
            const maj = { Camp: r.camp };
            if (r.expedition) maj.Expedition = r.expedition;
            tx.update(refPartie(p), maj);
            return r;
        });
    } catch (e) { console.error("[Camp] La journée du camp :", e); return null; }
    if (!res) return null;
    camp = res.camp;
    console.log(`⛺ [Camp] ${dateJeu || "Un jour"} : ${res.journal.join(" ")}`);
    // L'entraînement : l'expérience des recrues.
    for (const x of res.xp) {
        const h = persos.find(y => y && y.idPersonnage === x.id);
        try { await updateDoc(doc(db, h ? "Personnages" : "Monde_PNJ", x.id), { XP: increment(x.xp) }); } catch (e) { console.warn("[Camp] L'XP de l'entraînement :", e); }
    }
    // La guérison des héros (le temps, le repos, le soigneur) : leurs blessures « jours ».
    for (const id of Object.keys(res.soinsHeros)) {
        const h = persos.find(y => y && y.idPersonnage === id), n = res.soinsHeros[id];
        if (!h || !n || typeof window.blessuresApresJours !== "function" || typeof window.blessuresDuPerso !== "function") continue;
        const avant = window.blessuresDuPerso(h);
        if (!avant.some(b => (Number(b.jours) || 0) > 0)) continue;
        try { await updateDoc(doc(db, "Personnages", id), { Blessures: window.blessuresApresJours(avant, n) }); } catch (e) { console.warn("[Camp] Les blessures :", e); }
    }
    await inscrireMoraux(p, res.moraux.map(m => ({ ...m, dateJeu })));
    // (v487) La route : l'événement se joue en RP (le Destin l'écrit dans le récit) ; à zéro, le camp s'arrête là.
    if (res.evenements.evenementRoute) {
        try { await addDoc(collection(db, "Messages_Chat"), { ID_Partie: p, Auteur_ID: "DESTIN", Auteur_Nom: "Destin", Auteur_Couleur: "#c2a878", Texte: res.evenements.evenementRoute.texte, Timestamp: Date.now() }); }
        catch (e) { console.warn("[Camp] L'événement de la route :", e); }
    }
    if (res.evenements.arret && window.DEPLACEMENT_CAMP && window.DEPLACEMENT_CAMP.terminer) {
        try { await window.DEPLACEMENT_CAMP.terminer({ arret: true }); } catch (e) { console.warn("[Camp] L'arrêt du camp :", e); }
    }
    return res;
}

// ---------------------------------------------------------------------
//  (v489) LA RÉPUTATION PAR RÉGION (étape 13) : l'écho des lieux, la jauge des pages de région, le narrateur.
// ---------------------------------------------------------------------
const nomDuGroupe = () => {
    const p = (window.LISTE_PARTIES_CACHE || []).find(x => x.id === idPartie());
    return (p && p.nom) || (window.PARTIE_DATA && window.PARTIE_DATA.Nom_Du_Groupe) || "Le clan";
};
export async function echoReputation(region, ecartLieu) {
    const p = idPartie(), n = Number(region);
    if (!p || !camp || !n || !Number(ecartLieu)) return null;
    let apres = null;
    try {
        await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie(p));
            const c = (s.exists() ? s.data() : {}).Camp;
            if (!c) return;
            apres = CP.echoReputation(CP.reputationRegion(c, n), ecartLieu);
            tx.update(refPartie(p), { ["Camp.Reputation_Regions." + n]: apres });
        });
    } catch (e) { console.warn("[Camp] La réputation de la région :", e); }
    if (apres !== null) console.log(`📣 [Camp] Réputation du clan dans la région ${n} : ${apres}.`);
    return apres;
}
export function contexteReputationMJ() {
    if (!camp) return "";
    const pos = typeof window.positionGroupeBrute === "function" ? window.positionGroupeBrute() : (window.PARTIE_DATA || {}).Position_Groupe;
    const n = Number((pos || {}).Region);
    if (!n) return "";
    return CP.contexteReputationRegion(nomDuGroupe(), ((window.CARTES_REGIONALES || {})[n] || {}).nom || "", CP.reputationRegion(camp, n));
}
// La page de gauche de chaque région : le nom du groupe, puis la jauge de sa réputation (grimoire_regions.js pose la place).
window.majReputationRegions = function () {
    document.querySelectorAll(".reputation-region[data-region]").forEach(el => {
        if (!camp) { el.innerHTML = ""; return; }
        const n = Number(el.dataset.region), v = CP.reputationRegion(camp, n);
        const sig = `${nomDuGroupe()}|${v}`;
        if (el.dataset.sig === sig) return;
        el.dataset.sig = sig;
        const gauche = v < 0 ? 50 + v / 2 : 50, largeur = Math.abs(v) / 2;
        el.innerHTML = `<span class="groupe-reputation-region">${String(nomDuGroupe()).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</span>
            <span class="jauge-reputation-region" title="Réputation ${v} (de −100 à +100)"><i class="${v < 0 ? "neg" : "pos"}" style="left:${gauche}%;width:${largeur}%"></i><b></b></span>
            <span class="mot-reputation-region">${CP.motReputationRegion(v)} <small>(${v > 0 ? "+" : ""}${v})</small></span>`;
    });
};

// (v484) THÉMÈS, LE NARRATEUR (étape 7) : ce que le narrateur reçoit dès que le clan a un camp (ia_master.js).
export const consignesThemes = () => (camp ? CP.CONSIGNES_THEMES : "");

window.CAMP = { consignesThemes, echoReputation, contexteReputationMJ, lire: lireCamp, creerCampDev, creerCampAuto, rattraperMembres, estimerJauge, REGION_DEPART, regles: CP, estDev, joueursConnectes, auCamp, contexteMJ,
                partis, postesBloques, infosMembres, assignerTache, nommerIntendant, changerMoral, journeeDuCamp };
window.journeeDuCamp = journeeDuCamp;
