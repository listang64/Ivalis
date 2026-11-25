// =========================================================================
//  IVALIS — LE RETOUR AU CAMP (v484)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 8) :
//    « Au retour de l'expédition, on calcule d'un coup ce qui s'est passé au
//    camp, en fonction du nombre de jours écoulés : les affinités évoluent
//    (fils invisibles, moral compris) entre personnages qui ont partagé une
//    tâche ou un repas ; une ou deux petites scènes tous les 3 jours ; des
//    événements (un voyageur, une bête qui rôde, une maladie, une tempête ;
//    certains attendent la décision du conseil). Le rapport de l'intendant en
//    RP : il remplace la chronique du camp et le récit du retour ; pas de
//    rapport si personne n'est resté au camp. »
//  Le poste qui a clos l'expédition (expedition.js) s'en charge, une fois le
//  récit de l'expédition rangé dans le livre. Les règles : camp_pur.js.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, runTransaction, addDoc, collection } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=10";

const PARTIES = "Systeme_Parties";
const idPartie = () => window.ID_PARTIE_COURANTE || "";

async function lireAmes(p, ids) {
    const out = {};
    await Promise.all(ids.map(async (id) => { try { const s = await getDoc(doc(db, PARTIES, p, "Ames", id)); if (s.exists()) out[id] = s.data(); } catch (e) {} }));
    return out;
}
async function demanderRapport(prompt) {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("missions")) return "";
    const corps = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9 } });
    const rep = await window.fetchGemini("missions", corps);
    const j = await rep.json();
    return String((((j.candidates || [])[0] || {}).content || {}).parts?.map(x => x.text || "").join("") || "").trim();
}

// LE RETOUR : `r` = le résumé de l'expédition (expedition.js) : { Numero, Jours, Membres, archive }.
export async function apresLeRetour(r, alea = Math.random) {
    const p = idPartie();
    if (!p || !r) return null;
    try { await r.archive; } catch (e) {}
    const s0 = await getDoc(doc(db, PARTIES, p));
    const d0 = s0.exists() ? s0.data() : {};
    if (!d0.Camp) return null;
    const infos = window.CAMP && window.CAMP.infosMembres ? await window.CAMP.infosMembres() : {};
    const nom = (id) => (infos[id] || {}).nom || ((d0.Camp.Membres || {})[id] || {}).Nom || id;
    const presents = Object.keys(d0.Camp.Membres || {}).filter(id => !(r.Membres || []).includes(id) && !CP.estThemes(id, d0.Camp.Membres[id]));
    // « Pas de rapport si personne n'est resté au camp. »
    if (!presents.length) { console.log("⛺ [Retour] Personne n'est resté au camp : pas de rapport."); return { rapport: "", presents: [] }; }
    const jours = Math.max(0, Number(r.Jours) || 0);
    const noms = Object.fromEntries(presents.map(id => [id, nom(id)]));
    // 1. LES ÉVÉNEMENTS (appliqués au camp : provisions, sujets du conseil) ; leur moral passe par les fils invisibles.
    const evenements = CP.evenementsDuCamp(jours, presents, alea, noms);
    if (evenements.length) {
        await runTransaction(db, async (tx) => {
            const s = await tx.get(doc(db, PARTIES, p));
            const c = JSON.parse(JSON.stringify((s.exists() ? s.data() : {}).Camp || {}));
            if (!c.Membres) return;
            evenements.forEach(ev => {
                if (ev.provisions) c.Provisions = Math.max(0, (Number(c.Provisions) || 0) + ev.provisions);
                if (ev.conseil) c.Sujets_Conseil = (c.Sujets_Conseil || []).concat([{ Type: ev.type, Texte: ev.texte, Le: Date.now() }]);
            });
            c.Journal = (c.Journal || []).concat([{ Jour: Number(c.Jours_Ecoules) || 0, Date_Jeu: "", Lignes: evenements.map(ev => ev.texte) }]).slice(-CP.JOURNAL_JOURS);
            tx.update(doc(db, PARTIES, p), { Camp: c });
        });
        const moraux = evenements.flatMap(ev => ev.moral || []);
        if (moraux.length && window.CAMP && window.CAMP.changerMoral) { try { await window.CAMP.changerMoral(moraux); } catch (e) { console.warn("[Retour] Le moral des événements :", e); } }
    }
    // 2. LES AFFINITÉS entre ceux qui ont partagé une tâche ou un repas.
    const ames = await lireAmes(p, presents);
    const s1 = await getDoc(doc(db, PARTIES, p));
    const camp = (s1.exists() ? s1.data() : {}).Camp || d0.Camp;
    const ecarts = CP.evolutionAffinites({ presents, jours, taches: Object.fromEntries(presents.map(id => [id, (camp.Membres[id] || {}).Tache || null])),
        psyches: Object.fromEntries(presents.map(id => [id, (ames[id] || {}).psyche || {}])), moraux: Object.fromEntries(presents.map(id => [id, (camp.Membres[id] || {}).Moral])) });
    if (ecarts.length && window.SOCIAL && window.SOCIAL.ajusterLiensDuCamp) {
        try { await window.SOCIAL.ajusterLiensDuCamp(p, ecarts, `La vie du camp pendant l'expédition ${r.Numero} (${jours} jour${jours > 1 ? "s" : ""}).`); }
        catch (e) { console.warn("[Retour] Les affinités :", e); }
    }
    // 3. LE RAPPORT DE L'INTENDANT, avec les petites scènes : une page de Thémès, dans le récit.
    const intendant = camp.Intendant && camp.Membres[camp.Intendant] ? camp.Intendant : presents[0];
    const journal = (camp.Journal || []).slice(-(jours + 1)).flatMap(j => j.Lignes || []);
    const prompt = CP.promptRapportIntendant({
        numero: r.Numero, jours, intendant: nom(intendant), caractere: window.SOCIAL && window.SOCIAL.caractere ? window.SOCIAL.caractere((ames[intendant] || {}).psyche) : "",
        heros: (r.Membres || []).filter(id => !CP.estThemes(id, camp.Membres[id])).map(nom), journal, evenements: evenements.map(ev => ev.texte),
        caisse: Number(camp.Caisse) || 0, provisions: Number(camp.Provisions) || 0, jauge: (camp.Ressources || {}).Jauge,
        moraux: presents.map(id => `${nom(id)} ${Number.isFinite(Number((camp.Membres[id] || {}).Moral)) ? (camp.Membres[id] || {}).Moral : 60}/100`),
        scenes: CP.nombreDeScenes(jours, alea), presents: presents.map(nom)
    });
    let rapport = "";
    try { rapport = await demanderRapport(prompt); } catch (e) { console.warn("[Retour] Le rapport de l'intendant :", e); }
    if (!rapport) rapport = `De retour au camp, ${nom(intendant)} nous fait son rapport : « ${journal.slice(-4).join(" ") || "Rien de notable, le camp a tenu."} »`;
    const date = window.DATE_EN_JEU_ACTUELLE || {};
    try {
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: p, Auteur_ID: "MJ", Auteur_Nom: "MJ", Auteur_Couleur: "#ffffff", Texte: rapport, Est_Narration_IA: true,
            Rapport_Intendant: { Expedition: Number(r.Numero) || 0, Intendant: intendant }, Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
        });
    } catch (e) { console.error("[Retour] Le rapport dans le récit :", e); }
    try {
        await runTransaction(db, async (tx) => {
            const s = await tx.get(doc(db, PARTIES, p));
            if (!(s.exists() && s.data().Camp)) return;
            tx.update(doc(db, PARTIES, p), { "Camp.Dernier_Rapport": { Expedition: Number(r.Numero) || 0, Intendant: intendant, Texte: rapport, Le: Date.now() } });
        });
    } catch (e) {}
    console.log(`📜 [Retour] Le rapport de ${nom(intendant)} (expédition ${r.Numero}, ${jours} jours, ${evenements.length} événement(s), ${ecarts.length / 2} lien(s)).`);
    return { rapport, presents, evenements, ecarts, intendant };
}
window.addEventListener("ivalis-retour-expedition", (ev) => {
    Promise.resolve(apresLeRetour(ev.detail)).catch(e => console.error("[Retour] Le retour au camp :", e));
});
window.RETOUR_CAMP = { apresLeRetour };
