// =========================================================================
//  IVALIS — LES EXPÉDITIONS DU CLAN (v483)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 6) :
//    · « La page Expédition montre trois emplacements de personnages actifs
//      (3 joueurs maximum). Si aucune expédition n'est montée, un bouton
//      « Monter l'expédition ». En cliquant sur un emplacement, le joueur
//      ouvre la liste des personnages qu'il peut jouer. Sous chaque personnage,
//      le nom du joueur en petit. Thémès part automatiquement, et on peut
//      emmener des suiveurs » (0 à 2 : ils quittent leur tâche, mangent, et
//      donnent leur bonus à tout le groupe).
//    · « L'expédition commence dès que le groupe quitte la case du camp ; elle
//      se termine dès qu'il y revient » : la veille ci-dessous, une seule fois
//      par une transaction. Au départ, les provisions emportées sont prises sur
//      la réserve ; au retour, ce qui reste et les achats du commerce y
//      rentrent, les emplacements se vident, et le récit est rangé dans le
//      livre sous la forme « Expédition N ».
//    · « Mode arène (test) : avant chaque combat, choisir le personnage de chaque
//      joueur, indépendamment du personnage actif de l'histoire » (Arene_Choix).
//  Les règles : camp_pur.js.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, runTransaction, updateDoc, deleteField, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=19";

const PARTIES = "Systeme_Parties";
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refPartie = () => doc(db, PARTIES, idPartie());
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const camp = () => (window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null);
const partie = () => window.PARTIE_DATA || {};
export const expedition = () => partie().Expedition || null;
const RAYON = 0.06;
const position = () => (typeof window.positionGroupeBrute === "function" ? window.positionGroupeBrute() : null) || partie().Position_Groupe || null;
const persos = () => window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [];

// Une écriture de la partie, lue et écrite d'un coup. `fn(data)` rend { maj } ou { refus }.
async function modifier(fn) {
    if (!idPartie()) return "Pas de partie.";
    try {
        return await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const r = fn(s.exists() ? s.data() : {}) || {};
            if (r.refus) return r.refus;
            if (r.maj) tx.update(refPartie(), r.maj);
            return "";
        });
    } catch (e) { console.error("[Expédition] :", e); return "La base n'a pas répondu."; }
}
// Les personnages que ce joueur peut jouer : les siens (« d'abord ses propres personnages »).
export const jouables = (joueur = moi()) => CP.personnagesDuJoueur(joueur, persos()).map(h => h.idPersonnage);
// (v490) « D'abord ses propres personnages, puis, en dessous, les personnages du camp libres pour tous. »
export const jouablesExpedition = (joueur = moi()) => CP.jouablesExpedition(joueur, persos(), camp(), expedition());

// (v490) INCARNER UN PERSONNAGE DU CAMP : sa fiche d'aventurier (Personnages, le même identifiant que sa fiche de PNJ),
// créée la première fois depuis sa fiche de PNJ, et passée au joueur qui le prend (« pas exclusif » : le dernier qui
// le joue le commande). Ses compétences : la Forge, ouverte à tous les joueurs pour lui (grimoire_fiches.js).
export async function incarner(id) {
    const c = camp(), p = idPartie(), j = moi();
    if (!p || !c) return "Le clan n'a pas de camp.";
    const ref = doc(db, "Personnages", id);
    let caracs = null;
    try {
        const s = await getDoc(ref);
        if (s.exists()) {
            const refus = CP.peutIncarner(c, id, null) || (s.data().Statut === "Mort" ? "Ce personnage est mort." : "");
            if (refus) return refus;
            if (s.data().ID_Joueur !== j) await updateDoc(ref, { ID_Joueur: j });
        } else {
            const sf = await getDoc(doc(db, "Monde_PNJ", id));
            const f = sf.exists() ? sf.data() : null;
            if (!f) return "Ce personnage est introuvable.";
            const refus = CP.peutIncarner(c, id, f);
            if (refus) return refus;
            caracs = f.Caracs || CP.caracsDeRecrue([]);
            const lot = writeBatch(db);
            lot.set(ref, CP.ficheIncarnee(id, f, { partie: p, joueur: j, caracs, maintenant: Date.now() }));
            lot.set(doc(db, "Caracteristiques", id), caracs);
            if (!f.Caracs) lot.set(doc(db, "Monde_PNJ", id), { Caracs: caracs }, { merge: true });
            await lot.commit();
            console.log(`⛺ [Expédition] ${f.Nom_PNJ || id} reçoit sa fiche d'aventurier.`);
        }
        // La liste de la partie le sait tout de suite (le héros actif bascule sans attendre l'écoute de la base).
        const liste = window.PERSOS_JOUEURS_PARTIE || (window.PERSOS_JOUEURS_PARTIE = []);
        const h = liste.find(x => x && x.idPersonnage === id);
        if (h) h.idJoueur = j;
        else if (typeof window.persoDocVersFront === "function") { const d = (await getDoc(ref)).data(); if (d) liste.push(window.persoDocVersFront(id, d)); }
        if (caracs && window.CARACS_PARTIE) window.CARACS_PARTIE[id] = caracs;
        return "";
    } catch (e) { console.error("[Expédition] Incarner :", e); return "La base n'a pas répondu."; }
}

export const monter = () => modifier((d) => {
    if (!d.Camp) return { refus: "Le clan n'a pas de camp." };
    if (d.Expedition && (d.Expedition.Montee || d.Expedition.En_Cours)) return { refus: "Une expédition est déjà montée." };
    return { maj: { Expedition: CP.expeditionVide(d.Camp.Prochaine_Expedition, Math.min(Number(d.Camp.Provisions) || 0, 10)) } };
});
export const annuler = () => modifier((d) => {
    if (!d.Expedition) return { refus: "Aucune expédition n'est montée." };
    if (d.Expedition.En_Cours) return { refus: "L'expédition est partie : elle se termine en revenant au camp." };
    return { maj: { Expedition: deleteField() } };
});
export async function prendrePlace(i, perso) {
    const j = moi(), { siens, libres } = jouablesExpedition(j), tous = [...siens, ...libres];
    // (v490) Un personnage du camp : d'abord sa place (pas celle d'un autre), puis sa fiche d'aventurier, à ce joueur.
    const libre = !siens.includes(perso) && libres.includes(perso);
    if (libre) {
        const r = CP.peutPrendrePlace(expedition(), i, perso, j, tous) || await incarner(perso);
        if (r) return r;
    }
    const refus = await modifier((d) => {
        const r = CP.peutPrendrePlace(d.Expedition, i, perso, j, tous);
        if (r) return { refus: r };
        const pl = (d.Expedition.Emplacements || [null, null, null]).slice(0, CP.PLACES_EXPEDITION);
        while (pl.length < CP.PLACES_EXPEDITION) pl.push(null);
        pl[i] = { Perso: perso, Joueur: j, Nom_Joueur: (window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom) || "" };
        return { maj: { "Expedition.Emplacements": pl } };
    });
    // Le personnage de sa place est celui qu'il joue (son héros principal, le héros actif). (v490) Un personnage du camp
    // est le héros actif sans devenir le héros principal, sauf pour un joueur qui n'a plus de personnage à lui.
    const F = window.GRIMOIRE_FICHES;
    if (!refus && F && libre && siens.length && typeof F.jouer === "function") {
        try { await F.jouer(perso); } catch (e) { console.warn("[Expédition] Le héros joué :", e); }
    } else if (!refus && F && typeof F.definirHerosPrincipal === "function") {
        try { await F.definirHerosPrincipal(perso); } catch (e) { console.warn("[Expédition] Le héros joué :", e); }
    }
    return refus;
}
export const quitterPlace = (i) => modifier((d) => {
    const e = d.Expedition;
    if (!e || e.En_Cours) return { refus: e ? "L'expédition est déjà partie." : "Aucune expédition n'est montée." };
    const pl = (e.Emplacements || []).slice();
    if (!pl[i]) return { refus: "Cette place est libre." };
    if (pl[i].Joueur !== moi()) return { refus: "Ce n'est pas ta place." };
    pl[i] = null;
    return { maj: { "Expedition.Emplacements": pl } };
});
export const emmener = (id) => modifier((d) => {
    const r = CP.peutEmmener(d.Expedition, d.Camp, id);
    return r ? { refus: r } : { maj: { "Expedition.Suiveurs": [...(d.Expedition.Suiveurs || []), id] } };
});
export const laisser = (id) => modifier((d) => {
    const e = d.Expedition;
    if (!e || e.En_Cours) return { refus: e ? "L'expédition est déjà partie." : "Aucune expédition n'est montée." };
    return { maj: { "Expedition.Suiveurs": (e.Suiveurs || []).filter(x => x !== id) } };
});
export const reglerProvisions = (n) => modifier((d) => {
    const e = d.Expedition;
    if (!e || e.En_Cours) return { refus: e ? "L'expédition est déjà partie." : "Aucune expédition n'est montée." };
    const max = Math.max(0, Number((d.Camp || {}).Provisions) || 0);
    return { maj: { "Expedition.Provisions_Prevues": Math.max(0, Math.min(max, Math.floor(Number(n) || 0))) } };
});
// Partir du camp sans expédition montée : refusé (voyage_groupe.js, proposerVoyageGroupe).
export function refusDepart() {
    const c = camp();
    if (!c) return "";
    return CP.refusDepartDuCamp({ ...partie(), Camp: c, Position_Groupe: position() }, RAYON);
}

// ---------------------------------------------------------------------
//  LA VEILLE : le départ, le retour
// ---------------------------------------------------------------------
async function lireDateJeu() {
    try { const s = await getDoc(doc(db, "Date_En_Jeu", "actuelle")); const d = s.exists() ? s.data() : {}; return d.Jour ? `Jour ${d.Jour} de l'an ${d.Annee || "?"}` : ""; }
    catch (e) { return ""; }
}
async function caracsDesMembres() {
    const infos = window.CAMP && window.CAMP.infosMembres ? await window.CAMP.infosMembres() : {};
    return (id) => (infos[id] || {}).caracs || (window.CARACS_PARTIE || {})[id] || {};
}
let occupe = false;
export async function veiller() {
    const c = camp(), d = partie(), e = d.Expedition;
    if (occupe || !idPartie() || !c || !e) return null;
    const v = d.Voyage_Groupe, enRoute = !!(v && v.Etat && v.Etat !== "vote");
    const surLeCamp = CP.pionSurLeCamp(c, position(), RAYON);
    if (e.Montee && !e.En_Cours && (enRoute || !surLeCamp)) return partir();
    if (e.En_Cours && !(v && v.Etat) && surLeCamp) return revenir();
    return null;
}
async function partir() {
    occupe = true;
    try {
        const caracsDe = await caracsDesMembres(), dateJeu = await lireDateJeu();
        const r = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const m = CP.departExpedition(s.exists() ? s.data() : {}, { caracsDe, maintenant: Date.now(), dateJeu });
            if (!m) return null;
            tx.update(refPartie(), { Camp: m.Camp, Expedition: m.Expedition });
            return m.Expedition;
        });
        if (r) console.log(`🧭 [Expédition] L'expédition ${r.Numero} quitte le camp : ${r.Membres.length} membres, ${r.Provisions} provisions.`);
        return r ? { depart: r } : null;
    } catch (e) { console.error("[Expédition] Le départ :", e); return null; }
    finally { occupe = false; }
}
async function revenir() {
    occupe = true;
    try {
        const dateJeu = await lireDateJeu();
        const r = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const m = CP.retourExpedition(s.exists() ? s.data() : {}, { maintenant: Date.now(), dateJeu });
            if (!m) return null;
            tx.update(refPartie(), { Camp: m.Camp, Expedition: deleteField() });
            return m.resume;
        });
        if (!r) return null;
        console.log(`⛺ [Expédition] L'expédition ${r.Numero} rentre au camp après ${r.Jours} jour(s).`);
        // Ce poste-ci a clos l'expédition : son récit se range dans le livre (« Expédition N »).
        const archive = typeof window.nettoyerChatVoyage === "function"
            ? Promise.resolve(window.nettoyerChatVoyage({ expedition: r.Numero, cimetiere: true })).catch(e => console.error("[Expédition] L'archive du récit :", e))
            : Promise.resolve();
        // Le retour au camp (retour_camp.js) attend que le récit soit rangé : le rapport de l'intendant ouvre la page suivante.
        try { window.dispatchEvent(new CustomEvent("ivalis-retour-expedition", { detail: { ...r, archive } })); } catch (e) {}
        return { retour: r };
    } catch (e) { console.error("[Expédition] Le retour :", e); return null; }
    finally { occupe = false; }
}

// LE BONUS AUX TESTS DES SUIVEURS (Constitution, Intelligence, Sagesse, Charisme) : un atout de plus pour les héros
// de l'expédition en cours (app.js, atoutRace).
window.atoutExpedition = function (perso) {
    const e = expedition();
    if (!e || !e.En_Cours || !perso || !(e.Membres || []).includes(perso.idPersonnage)) return {};
    const t = ((e.Bonus || {}).tests) || {};
    return Object.keys(t).length ? { testsCarac: { ...t } } : {};
};

// ---------------------------------------------------------------------
//  LE MODE ARÈNE (test) : chacun choisit son combattant de l'arène
// ---------------------------------------------------------------------
export const choixArene = () => partie().Arene_Choix || null;
export async function areneActive(actif) {
    if (!idPartie()) return "Pas de partie.";
    try { await updateDoc(refPartie(), { "Arene_Choix.Actif": !!actif }); return ""; } catch (e) { return "La base n'a pas répondu."; }
}
// (v491) Un seul joueur choisit les trois combattants, parmi tous les personnages de la partie.
export async function choisirPourArene(perso, coche = true) {
    if (!idPartie()) return "Pas de partie.";
    if (perso && !CP.persosArene(persos()).some(h => h.idPersonnage === perso)) return "Ce personnage ne peut pas combattre.";
    // Lu et écrit d'un coup : deux cases cochées vite ne s'écrasent pas.
    return modifier((d) => {
        const actuels = ((d.Arene_Choix || {}).Combattants) || [];
        if (coche && perso && !actuels.includes(perso) && actuels.length >= CP.MAX_COMBATTANTS_ARENE) return { refus: "Trois combattants au plus." };
        const l = perso ? CP.choisirCombattantArene(actuels, perso, coche) : [];
        return { maj: { "Arene_Choix.Combattants": l, "Arene_Choix.Par": moi(), "Arene_Choix.Choix": deleteField() } };
    });
}

window.EXPEDITION = { expedition, jouables, jouablesExpedition, incarner, monter, annuler, prendrePlace, quitterPlace, emmener, laisser, reglerProvisions, refusDepart, veiller,
                      choixArene, areneActive, choisirPourArene, regles: CP };
