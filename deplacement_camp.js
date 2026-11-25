// =========================================================================
//  IVALIS — LE DÉPLACEMENT DU CAMP (v487)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 11) :
//    « Le déplacement est décidé par un vote au conseil, qui crée la tâche
//    « Déplacer le camp ». On utilise ensuite le bouton « Déplacer le camp » :
//    le clan se déplace sur la carte comme une expédition, avec son compteur de
//    jours et son décompte de provisions (2 par membre et par jour, moins la
//    réduction du forgeron). Un événement en route (20 % par jour, moins
//    l'éclaireur) se joue en RP. À 0 provision : le camp s'arrête là où il est,
//    et un conseil extraordinaire s'ouvre. À l'arrivée : nouvelle estimation de
//    la jauge des ressources. »
//  Le voyage est celui du groupe (voyage_groupe.js) : on choisit la destination
//  sur la carte ; chaque jour de route passe par camp.js (journeeDuCamp, qui prend
//  ici la journée du déplacement). Les règles : camp_pur.js.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, runTransaction, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=12";

const PARTIES = "Systeme_Parties";
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refPartie = () => doc(db, PARTIES, idPartie());
const camp = () => (window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null);
const position = () => (typeof window.positionGroupeBrute === "function" ? window.positionGroupeBrute() : null) || (window.PARTIE_DATA || {}).Position_Groupe || null;

export const peutDeplacer = () => CP.peutDeplacer(camp(), window.PARTIE_DATA || {});
async function lireDateJeu() {
    try { const s = await getDoc(doc(db, "Date_En_Jeu", "actuelle")); const d = s.exists() ? s.data() : {}; return d.Jour ? `Jour ${d.Jour} de l'an ${d.Annee || "?"}` : ""; } catch (e) { return ""; }
}
// LE BOUTON « DÉPLACER LE CAMP » : le camp se met en route ; on choisit la destination sur la carte.
export async function commencer() {
    const dateJeu = await lireDateJeu();
    let refus = "";
    await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const d = s.exists() ? s.data() : {};
        refus = CP.peutDeplacer(d.Camp, d);
        if (refus) return;
        tx.update(refPartie(), { "Camp.Deplacement": { En_Cours: true, Jours: 0, Depart: d.Camp.Position || null, Debut: { Le: Date.now(), Date_Jeu: dateJeu } }, "Camp.Deplacement_Vote": deleteField() });
    });
    if (refus) { try { window.alert(refus); } catch (e) {} return refus; }
    console.log("🐎 [Camp] Le camp se met en route : choisissez sa destination sur la carte.");
    try { if (window.GRIMOIRE && typeof window.GRIMOIRE.allerALaCarte === "function") window.GRIMOIRE.allerALaCarte(); } catch (e) {}
    try { window.alert("Le camp se met en route : choisissez sur la carte où mener le clan (le voyage, comme une expédition)."); } catch (e) {}
    return "";
}
// L'ARRIVÉE OU L'ARRÊT : le camp se pose où est le clan ; la jauge des ressources est réestimée.
export async function terminer(o = {}) {
    const pos = position();
    const fini = await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const d = s.exists() ? s.data() : {};
        if (!(d.Camp && d.Camp.Deplacement && d.Camp.Deplacement.En_Cours)) return null;
        const c = CP.finDuDeplacement(d.Camp, pos || d.Position_Groupe, { arret: !!o.arret, maintenant: Date.now() });
        const maj = { Camp: c };
        if (o.arret) maj.Voyage_Groupe = deleteField();
        tx.update(refPartie(), maj);
        return c;
    });
    if (!fini) return null;
    console.log(`⛺ [Camp] Le camp se pose${o.arret ? " (plus de provisions)" : ""}.`);
    if (window.CAMP && window.CAMP.estimerJauge) {
        try {
            const j = await window.CAMP.estimerJauge(fini.Position);
            if (j && j.Jauge !== null && j.Jauge !== undefined) await updateDoc(refPartie(), { "Camp.Ressources": { Jauge: j.Jauge, Terrain: j.Terrain || "", Le: Date.now() } });
        } catch (e) { console.warn("[Camp] La nouvelle jauge :", e); }
    }
    return fini;
}
// LA VEILLE : le voyage du clan part (on le note) puis s'achève (le camp se pose).
let occupe = false;
export async function veiller() {
    const c = camp(), d = window.PARTIE_DATA || {};
    if (occupe || !idPartie() || !c || !(c.Deplacement && c.Deplacement.En_Cours)) return null;
    const v = d.Voyage_Groupe;
    occupe = true;
    try {
        if (v && v.Etat && v.Etat !== "vote" && v.Id && c.Deplacement.Voyage !== v.Id) { await updateDoc(refPartie(), { "Camp.Deplacement.Voyage": v.Id }); return { parti: v.Id }; }
        if (c.Deplacement.Voyage && !(v && v.Etat)) return { arrive: await terminer() };
        return null;
    } finally { occupe = false; }
}

window.DEPLACEMENT_CAMP = { peutDeplacer, commencer, terminer, veiller };
