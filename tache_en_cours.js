// =========================================================================
//  IVALIS — LA TÂCHE EN COURS (v486, les anciennes missions)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 10) :
//    · « Quand le jeu détecte qu'une nouvelle tâche commence — parce que les
//      joueurs l'ont acceptée dans le RP, ou suite à un conseil — il crée la
//      tâche avec le créateur de missions actuel et la met en tâche active.
//      Une seule tâche est active à la fois. Une tâche votée au conseil
//      remplace la tâche en cours. Son détail reste caché aux joueurs. »
//    · « Les récompenses sont déterminées à la création (elles vont dans la
//      caisse du groupe) : normale 40–80 drachmes et 10–20 provisions,
//      difficile 100–200 et 20–40. Les événements du camp (une fête) : de l'XP
//      et +10 de moral. »
//    · « Lieu repéré par l'éclaireur : si le conseil vote pour aller voir, créer
//      la tâche avec le lieu sur la carte. »
//    · « Quand l'expédition revient au camp, on a la possibilité d'annuler la
//      tâche en cours. »
//  La mission elle-même (sa fiche, son plan caché, son suivi par le narrateur,
//  sa fin) reste celle de missions_guilde.js. Les règles : camp_pur.js.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, runTransaction, updateDoc, deleteField, increment } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=20";

const PARTIES = "Systeme_Parties";
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refPartie = () => doc(db, PARTIES, idPartie());
const M = () => window.MISSIONS_GUILDE || null;
const camp = () => (window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null);
const nomRegion = (n) => (((window.CARTES_REGIONALES || {})[n] || {}).nom) || `Région ${n}`;

// Une tâche remplace celle en cours (« une seule tâche active à la fois »).
async function laisserLaTacheEnCours(raison) {
    const s = await getDoc(refPartie());
    const d = s.exists() ? s.data() : {};
    if (!(d.Mission_En_Cours && d.Mission_En_Cours.Id)) return false;
    let fini = false;
    try { fini = M() && M().terminerMission ? await M().terminerMission("remplacee", raison) : false; } catch (e) {}
    if (!fini) { try { await updateDoc(refPartie(), { Mission_En_Cours: deleteField() }); } catch (e) {} }
    return true;
}
// CRÉER LA TÂCHE : le créateur de missions l'écrit d'après son sujet (sans clé, une tâche simple tirée du sujet) ;
// ses récompenses sont fixées tout de suite ; elle devient la tâche en cours.
export async function creer(o = {}) {
    let m = null;
    if (!o.simple && M() && typeof M().genererMission === "function") {
        try { m = await M().genererMission(o.difficulte || "normale", { sujet: o.sujet || "" }); } catch (e) { console.warn("[Tâche] Le créateur de missions :", e.message || e); }
    }
    if (!m) m = CP.tacheDuSujet({ Titre: o.titre, Resume: o.resume, Type: o.type }, { maintenant: Date.now(), region: (o.position || {}).Region, regionNom: o.position ? nomRegion(o.position.Region) : "" });
    if (o.titre && o.garderTitre) m.Titre = o.titre;
    if (o.commanditaire) m.Commanditaire = o.commanditaire;
    m.Type_Tache = o.type || m.Type_Tache || "autre";
    m.Recompense = CP.recompenseTache(m.Difficulte, m.Type_Tache);
    if (o.position) { m.Position_Voulue = o.position; m.Region = o.position.Region; m.Region_Nom = nomRegion(o.position.Region); }
    if (o.lieu) m.Lieu = { ...m.Lieu, ...o.lieu };
    await laisserLaTacheEnCours(o.raison || "Une autre tâche l'a remplacée.");
    const ok = M() && M().lancerMission ? await M().lancerMission(m) : false;
    if (ok) console.log(`📜 [Tâche] « ${m.Titre} » est la tâche en cours (${CP.texteRecompense(m.Recompense).join(", ")}).`);
    return ok ? m : null;
}
// APRÈS LE CONSEIL : « Toutes les décisions du conseil deviennent des tâches. »
export async function depuisConseil(sujet) {
    if (!sujet) return null;
    const c = camp();
    // Déplacer le camp, recruter : la tâche passe par son bouton (étapes 11 et 12) ; elle remplace la tâche en cours.
    if (CP.TACHES_A_BOUTON[sujet.Type]) { await laisserLaTacheEnCours("Le conseil a choisi une autre tâche."); return { bouton: sujet.Type }; }
    const ici = c && c.Position ? { Region: Number(c.Position.Region), x: Number(c.Position.x), y: Number(c.Position.y) } : null;
    const o = { titre: sujet.Titre, resume: sujet.Resume, type: sujet.Type, garderTitre: true, commanditaire: "Le conseil du clan", raison: "Le conseil a choisi une autre tâche.",
                sujet: `« ${sujet.Titre} » : ${sujet.Resume || ""} Commanditaire : le conseil du clan.` };
    if (sujet.Type === "lieu") {
        o.position = CP.placePresDuCamp(c, Math.random, typeof window.placePoiValable === "function" ? window.placePoiValable : () => true);
        o.sujet += " Il faut aller voir un lieu intéressant repéré par l'éclaireur, tout près du camp.";
    } else if (["fete", "partager", "autre"].includes(sujet.Type)) {
        // Au camp : la fête (écrite par le créateur, en étapes) ; partager les vivres, une autre décision (une tâche simple).
        if (ici) o.position = ici;
        o.lieu = { Id: null, Nom: "Le camp du clan", Type: "camp" };
        o.simple = sujet.Type !== "fete";
        if (sujet.Type === "fete") o.sujet += " C'est une fête au camp du clan, qui se prépare en plusieurs étapes en RP (de quoi décorer, des vivres pour le banquet, un musicien, un prêtre…), puis se célèbre au camp.";
    }
    // Trouver des vivres, accepter une mission : le créateur choisit le lieu.
    return creer(o);
}
// DANS LE RP : « parce que les joueurs l'ont acceptée dans le RP » (MIA_TACHE, après chaque page du narrateur, tant
// qu'aucune tâche n'est en cours).
export async function detecter(texteMJ, messages) {
    const d = window.PARTIE_DATA || {};
    if (!camp() || (d.Mission_En_Cours && d.Mission_En_Cours.Id)) return null;
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("missions")) return null;
    const derniers = (messages || []).slice(-6).map(m => `${m.Auteur_Nom || "?"} : ${String(m.Texte_Livre || m.Texte || "").replace(/<[^>]+>/g, " ").slice(0, 400)}`);
    const corps = JSON.stringify({ contents: [{ role: "user", parts: [{ text: CP.promptDetectionTache(texteMJ, derniers) }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } });
    let t = null;
    try { const rep = await window.fetchGemini("missions", corps); const j = await rep.json(); t = CP.lireDetectionTache(j.candidates[0].content.parts[0].text); }
    catch (e) { console.warn("[MIA_TACHE] :", e); return null; }
    if (!t) return null;
    console.log(`📜 [MIA_TACHE] Une nouvelle tâche acceptée dans le RP : « ${t.titre} ».`);
    return creer({ difficulte: t.difficulte, titre: t.titre, resume: t.resume, commanditaire: t.commanditaire, type: "mission",
                   sujet: `« ${t.titre} » : ${t.resume} Commanditaire : ${t.commanditaire}. Objectif : ${t.objectif}.` });
}

// LES RÉCOMPENSES : la tâche réussie verse les siennes (la caisse du groupe, les provisions ; l'XP et le moral d'une fête).
export async function verserRecompense(mission) {
    const r = mission && mission.Recompense;
    if (!idPartie() || !r || !camp()) return null;
    const verse = await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const c = (s.exists() ? s.data() : {}).Camp;
        if (!c || (c.Recompenses_Versees || []).includes(mission.Id)) return false;
        tx.update(refPartie(), { "Camp.Caisse": (Number(c.Caisse) || 0) + (Number(r.Drachmes) || 0), "Camp.Provisions": (Number(c.Provisions) || 0) + (Number(r.Provisions) || 0),
                                 "Camp.Recompenses_Versees": [...(c.Recompenses_Versees || []), mission.Id].slice(-50) });
        return true;
    });
    if (!verse) return null;
    if (r.Xp) {
        const heros = (window.PERSOS_JOUEURS_PARTIE || []).filter(h => h && h.actif !== false && !h.estIllusion && !h.estMonstre);
        for (const h of heros) { try { await updateDoc(doc(db, "Personnages", h.idPersonnage), { XP: increment(Number(r.Xp)) }); } catch (e) {} }
    }
    if (r.Moral && window.CAMP && window.CAMP.changerMoral) {
        const c = camp();
        try { await window.CAMP.changerMoral(Object.keys(c.Membres || {}).map(id => ({ id, delta: Number(r.Moral), raison: mission.Type_Tache === "fete" ? "la fête du clan" : "la tâche accomplie" }))); } catch (e) {}
    }
    console.log(`💰 [Tâche] « ${mission.Titre} » : ${CP.texteRecompense(r).join(", ")}.`);
    return r;
}
window.addEventListener("ivalis-tache-terminee", (ev) => {
    const d = ev.detail || {};
    if (d.statut === "reussie") Promise.resolve(verserRecompense(d.mission)).catch(e => console.error("[Tâche] Les récompenses :", e));
});
// AU RETOUR D'UNE EXPÉDITION : la tâche en cours peut être annulée (la gestion du camp le propose).
window.addEventListener("ivalis-retour-expedition", async () => {
    const d = window.PARTIE_DATA || {};
    if (!idPartie() || !camp() || !(d.Mission_En_Cours && d.Mission_En_Cours.Id)) return;
    try { await updateDoc(refPartie(), { "Camp.Annulation_Tache": { Mission: d.Mission_En_Cours.Id, Le: Date.now() } }); } catch (e) {}
});
export async function annulerTache() {
    if (!M() || typeof M().voterAbandon !== "function") return null;
    return M().voterAbandon("oui");
}

window.TACHE_EN_COURS = { creer, depuisConseil, detecter, verserRecompense, annulerTache, regles: CP };
