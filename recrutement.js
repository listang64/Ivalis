// =========================================================================
//  IVALIS — LE RECRUTEMENT DU CLAN (v488)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 12) :
//    · « On reprend le système de recrutement actuel, mais au lieu de devenir
//      des suiveurs du groupe, les PNJ qui acceptent rejoignent directement le
//      camp » (invités en RP : moral 60).
//    · « Les mercenaires, et tous ceux qui demandent de l'argent en RP, doivent
//      être payés (caisse du groupe), puis rejoignent le camp » (30 drachmes à
//      l'embauche, 3 par jour, moral 40).
//    · « Une recrue arrive au niveau 1, avec des caracs aléatoires, cohérentes
//      avec son background, qui suivent les mêmes règles que les autres
//      personnages ; la classe est donnée par les joueurs. »
//    · « Un personnage créé de toutes pièces coûte 300 drachmes : acheté par un
//      joueur avec sa bourse (moral 100, à lui seul), ou recruté pour le groupe
//      par une tâche votée au conseil, avec la caisse (créé par le premier joueur
//      qui clique sur « Créer », jouable par tous). »
//    · « Dans les fils invisibles d'un PNJ, un bouton DEV rouge pour forcer son
//      recrutement dans le camp, comme s'il avait été recruté naturellement. »
//  Les règles : camp_pur.js.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, getDocs, setDoc, updateDoc, runTransaction, deleteField, collection, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=15";

const PARTIES = "Systeme_Parties";
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refPartie = () => doc(db, PARTIES, idPartie());
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const camp = () => (window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null);
export const avecCamp = () => !!(idPartie() && camp());
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const dateJeu = () => { const d = window.DATE_EN_JEU_ACTUELLE || {}; return d.jour ? `Jour ${d.jour} de l'an ${d.annee || "?"}` : ""; };

// MIA_CARACS : les caracs de la recrue rangées d'après son personnage (sinon au hasard).
async function ordreDesCaracs(f) {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("missions")) return [];
    const consigne = `Tu es MIA_CARACS. Voici un personnage d'un jeu de rôle d'Antiquité fantastique : ${f.Nom_PNJ || "?"}, ${[f.Race, f.Occupation, f.Description_Physique, f.Style_De_Parole].filter(Boolean).join(", ")}.
Range ses six caractéristiques de la plus marquée à la moins marquée, d'après son métier et son caractère : force, dex (dextérité), con (constitution), int (intelligence), sag (sagesse), cha (charisme).
Réponds en JSON seul : { "ordre": ["…", "…", "…", "…", "…", "…"] }`;
    try {
        const rep = await window.fetchGemini("missions", JSON.stringify({ contents: [{ role: "user", parts: [{ text: consigne }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }));
        const j = await rep.json();
        const o = JSON.parse(j.candidates[0].content.parts[0].text).ordre;
        return Array.isArray(o) ? o : [];
    } catch (e) { return []; }
}
// UN PNJ REJOINT LE CAMP. `o` : { type: "invite" | "mercenaire", prix (le mercenaire, payé par la caisse), par }.
// Rend "" ou la raison du refus.
export async function rejoindreLeCamp(id, o = {}) {
    if (!avecCamp()) return "Le clan n'a pas de camp.";
    const sf = await getDoc(doc(db, "Monde_PNJ", id));
    const f = sf.exists() ? sf.data() : null;
    if (!f) return "Ce personnage est introuvable.";
    if (f.Statut === "Mort") return "Ce personnage est mort.";
    const type = o.type === "mercenaire" ? "mercenaire" : "invite";
    const prix = type === "mercenaire" ? Math.max(0, Math.round(Number(o.prix ?? CP.PRIX_MERCENAIRE))) : 0;
    let refus = "";
    await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const c = (s.exists() ? s.data() : {}).Camp;
        if (!c) { refus = "Le clan n'a pas de camp."; return; }
        if ((c.Membres || {})[id]) { refus = `${f.Nom_PNJ || "Ce personnage"} est déjà du clan.`; return; }
        if (prix) { refus = CP.peutEngager(c, prix); if (refus) return; }
        const maj = { ["Camp.Membres." + id]: CP.membreRecrue(type, f.Nom_PNJ, { maintenant: Date.now(), par: o.par || "" }) };
        if (prix) maj["Camp.Caisse"] = (Number(c.Caisse) || 0) - prix;
        tx.update(refPartie(), maj);
    });
    if (refus) return refus;
    // Sa fiche : membre du clan, niveau 1, ses caracs (s'il n'en a pas).
    const fiche = { Membre_Du_Clan: true, ...(f.Niveau ? {} : { Niveau: 1, XP: 0 }) };
    if (!f.Caracs) fiche.Caracs = CP.caracsDeRecrue(await ordreDesCaracs(f));
    try { await setDoc(doc(db, "Monde_PNJ", id), fiche, { merge: true }); } catch (e) { console.warn("[Recrutement] La fiche :", e); }
    // Son souvenir : il sait qu'il vit au camp.
    if (window.SOCIAL && window.SOCIAL.noterSouvenir) {
        try { await window.SOCIAL.noterSouvenir(idPartie(), id, type === "mercenaire" ? `J'ai été engagé par le clan nomade (${prix} drachmes, puis une solde) : je vis désormais au camp.` : "J'ai rejoint le clan nomade : je vis désormais au camp, avec eux.", { cle: "clan", importance: 3, dateJeu: dateJeu() }); }
        catch (e) {}
    }
    console.log(`⛺ [Recrutement] ${f.Nom_PNJ} rejoint le camp (${CP.TYPES_RECRUE[type]}${prix ? `, ${prix} drachmes` : ""}).`);
    return "";
}
export const engager = (id, prix, par) => rejoindreLeCamp(id, { type: "mercenaire", prix, par });

// UN PERSONNAGE CRÉÉ DE TOUTES PIÈCES (300 drachmes) : acheté avec sa bourse, ou recruté pour le groupe avec la caisse.
function lancerCreation() {
    try { if (window.GRIMOIRE_CREATION && window.GRIMOIRE_CREATION.commencer()) return true; } catch (e) {}
    if (typeof window.ouvrirCreationHero === "function") { window.ouvrirCreationHero(); return true; }
    return false;
}
export async function acheterPersonnage() {
    const j = moi();
    let refus = "";
    await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const d = s.exists() ? s.data() : {};
        if (!d.Camp) { refus = "Le clan n'a pas de camp."; return; }
        refus = CP.peutAcheter(d.Bourses_Joueurs, j);
        if (refus) return;
        tx.update(refPartie(), { ["Bourses_Joueurs." + j]: (Number((d.Bourses_Joueurs || {})[j]) || 0) - CP.PRIX_PERSONNAGE, ["Camp.Achats_En_Attente." + j]: { Le: Date.now() } });
    });
    if (!refus) lancerCreation();
    return refus;
}
export async function recruterPourLeGroupe() {
    const j = moi();
    let refus = "";
    await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const c = (s.exists() ? s.data() : {}).Camp;
        refus = CP.peutRecruterPourLeGroupe(c);
        if (refus) return;
        tx.update(refPartie(), { "Camp.Caisse": (Number(c.Caisse) || 0) - CP.PRIX_PERSONNAGE, "Camp.Recrutement_Vote": deleteField(), "Camp.Recrutement_En_Cours": { Par: j, Le: Date.now() } });
    });
    if (!refus) lancerCreation();
    return refus;
}
// LA CLASSE d'une recrue : « donnée par n'importe quel joueur ».
export async function choisirClasse(id, classe) {
    if (!avecCamp() || !((camp().Membres || {})[id])) return "Ce personnage n'est pas au camp.";
    try { await setDoc(doc(db, "Monde_PNJ", id), { Classe: String(classe || "") }, { merge: true }); return ""; } catch (e) { return "La base n'a pas répondu."; }
}
// DEV : de quoi acheter un personnage.
export async function remplirBourseDev() {
    if (!estDev() || !idPartie()) return "";
    const s = await getDoc(refPartie());
    const b = Number(((s.exists() ? s.data() : {}).Bourses_Joueurs || {})[moi()]) || 0;
    await updateDoc(refPartie(), { ["Bourses_Joueurs." + moi()]: b + CP.PRIX_PERSONNAGE });
    return "";
}

// (v494) DEV : les PNJ de la partie qui ne sont pas (encore) au camp, vivants, par nom.
export async function pnjsHorsDuCamp() {
    if (!avecCamp()) return [];
    const membres = camp().Membres || {};
    const s = await getDocs(query(collection(db, "Monde_PNJ"), where("ID_Partie", "==", idPartie())));
    const out = [];
    s.forEach(d => { const f = d.data() || {}; if (!membres[d.id] && f.Statut !== "Mort" && f.Nom_PNJ && !f.Narrateur) out.push({ id: d.id, nom: f.Nom_PNJ }); });
    return out.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

window.RECRUTEMENT = { pnjsHorsDuCamp, avecCamp, rejoindreLeCamp, engager, acheterPersonnage, recruterPourLeGroupe, choisirClasse, remplirBourseDev, regles: CP };
