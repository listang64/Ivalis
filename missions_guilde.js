// =========================================================================
//  IVALIS — LES MISSIONS DE GUILDE : LE TABLEAU (v442)
// =========================================================================
//  Nico : « nous allons pouvoir commencer la création de missions de guilde.
//  Trois niveaux de difficulté : Rang C (le plus faible, des missions facilement
//  réalisables par un groupe de nouveaux joueurs : escorter un PNJ et le protéger,
//  enquêter…), Rang B (pour aventuriers accomplis, mieux préparés), Rang A (les
//  plus dures). Dans les encarts du panneau des missions, une mission générée par
//  une IA pour chaque encart ; si vide, ça se crée après avoir chargé la partie ;
//  les missions se renouvellent tous les 30 jours. » « Un tableau par partie ; des
//  jours en jeu ; les six missions, un peu plus de C, une seule A, deux au plus. »
//  « Le générateur peut utiliser les lieux existants. » « Quand les missions sont
//  remplacées, ça les remplace dans la base. »
//
//  LA BASE : Systeme_Parties/{partie}/Guilde/Tableau — { Missions: [6 missions ou
//  null, dans l'ordre des encarts], Jour_Absolu (le jour en jeu de leur arrivée :
//  an × 365 + jour), Genere_Le, Generation_En_Cours (l'heure où un poste a commencé
//  à les écrire : un verrou de 3 minutes) }. Une mission : { Id, Rang, Titre,
//  Resume, Region, Region_Nom, Commanditaire, Details, Objectif, Lettre (le mot du
//  commanditaire, à la première personne), Lieu: { Id (un lieu existant) ou null,
//  Nom, Type, Description }, Ecriture (l'écriture de son encart) }.
//
//  LA FEUILLE : un toucher sur un encart fait glisser, du bas de l'écran, une page
//  de parchemin (la texture des pages du livre) avec le détail de la mission ; son
//  bas reste caché sous le bord de l'écran ; en bas, le sceau rouge « Accepter la
//  mission ». Un toucher en dehors la referme. Le bruit d'une page qu'on attrape.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, onSnapshot, runTransaction, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = (id) => { try { if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement(id); } catch (e) {} };
export const NB_MISSIONS = 6;
export const DUREE_JOURS = 30;
const VERROU_MS = 3 * 60 * 1000;
export const RANGS = {
    C: { nom: "Rang C", consigne: "le rang le plus faible : des missions facilement réalisables par un groupe de nouveaux aventuriers (escorter et protéger un PNJ, enquêter sur une disparition, retrouver un objet, chasser quelques bêtes, porter un message dangereux…). Peu de combats, des adversaires modestes." },
    B: { nom: "Rang B", consigne: "des missions pour aventuriers accomplis : il faut être mieux préparé et entraîné (une bande organisée, une créature redoutable, une intrigue à démêler, un lieu dangereux à traverser). Des combats sérieux." },
    A: { nom: "Rang A", consigne: "les missions les plus dures, tant par leurs tâches que par leurs adversaires (un monstre légendaire, une conspiration puissante, une expédition au cœur d'un lieu maudit). Des combats très dangereux, des choix lourds." }
};
// Six écritures à la main, une par encart (index.html : Google Fonts).
export const ECRITURES = ["Caveat", "Dancing Script", "Kalam", "Homemade Apple", "Indie Flower", "Satisfy"];

// ---------------------------------------------------------------------
//  LE TEMPS, LA PARTIE
// ---------------------------------------------------------------------
export const jourAbsolu = (d) => {
    const date = d || window.DATE_EN_JEU_ACTUELLE || {};
    const j = parseInt(date.jour, 10), a = parseInt(date.annee, 10);
    return (Number.isFinite(a) ? a : 0) * 365 + (Number.isFinite(j) ? j : 0);
};
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refTableau = (id) => doc(db, "Systeme_Parties", id, "Guilde", "Tableau");

// Les rangs des six encarts : une A (deux au plus), un peu plus de C que de B, au hasard.
export function tirerRangs(alea = Math.random) {
    const nbA = alea() < 0.25 ? 2 : 1;
    const reste = NB_MISSIONS - nbA;
    let nbC = Math.ceil(reste / 2) + (alea() < 0.3 ? 1 : 0);
    nbC = Math.min(nbC, reste - 1);                    // au moins une B
    const rangs = [...Array(nbA).fill("A"), ...Array(nbC).fill("C"), ...Array(reste - nbC).fill("B")];
    for (let i = rangs.length - 1; i > 0; i--) { const k = Math.floor(alea() * (i + 1)); [rangs[i], rangs[k]] = [rangs[k], rangs[i]]; }
    return rangs;
}

// ---------------------------------------------------------------------
//  LE GÉNÉRATEUR (MIA_MISSIONS)
// ---------------------------------------------------------------------
function regionsConnues() {
    const cartes = window.CARTES_REGIONALES || {};
    return Object.keys(cartes).map(Number).filter(n => n > 0).sort((a, b) => a - b).map(n => {
        const c = cartes[n] || {};
        let lore = "";
        try { lore = typeof window.loreDeLaRegion === "function" ? String(window.loreDeLaRegion(n) || "") : ""; } catch (e) {}
        return { numero: n, nom: c.nom || `Région ${n}`, texte: (String(c.description || "") + " " + lore).replace(/\s+/g, " ").trim().slice(0, 600) };
    });
}
function lieuxConnus() {
    return Object.values(window.VILLAGES_REGIONAUX || {}).filter(v => v && v.id && v.nom)
        .map(v => ({ id: v.id, nom: v.nom, type: v.type || "Lieu", region: v.numero, hub: !!v.hub })).slice(0, 80);
}
export function promptMissions(rangs, contexte) {
    const regions = contexte.regions.map(r => `- Région ${r.numero} « ${r.nom} » : ${r.texte || "(pas de description)"}`).join("\n");
    const lieux = contexte.lieux.length ? contexte.lieux.map(l => `- ${l.id} : ${l.nom} (${l.type}, région ${l.region})${l.hub ? " — Eraldur, le village de la guilde : pas de mission dedans" : ""}`).join("\n") : "(aucun lieu connu pour l'instant)";
    return `Tu es MIA_MISSIONS, le scribe de la guilde d'Ivalis : tu rédiges les missions affichées sur le panneau des missions du Hall de guilde d'Eraldur.
Le monde : Ivalis, un monde antique fantastique (mythologie, Antiquité magique). Rien d'anachronique, rien de farfelu ; pas de technologie moderne.

LES RANGS :
- Rang C : ${RANGS.C.consigne}
- Rang B : ${RANGS.B.consigne}
- Rang A : ${RANGS.A.consigne}

LES RÉGIONS (une mission se passe toujours dans l'une d'elles) :
${regions || "- Région 1"}

LES LIEUX QUI EXISTENT DÉJÀ (tu peux y placer une mission, en donnant son identifiant) :
${lieux}

Le groupe d'aventuriers est de niveau ${contexte.niveau}. Nous sommes le jour ${contexte.jour || "?"} du calendrier.

Écris EXACTEMENT ${rangs.length} missions, toutes différentes (sujets, régions, commanditaires variés), dans cet ordre de rangs : ${rangs.join(", ")}.
Réponds UNIQUEMENT par un tableau JSON de ${rangs.length} objets, chacun ainsi :
{
  "rang": "C" | "B" | "A" (celui demandé à cette place),
  "titre": "un titre court et évocateur (6 mots au plus)",
  "resume": "une phrase très courte pour l'affiche (20 mots au plus)",
  "region": numéro de la région,
  "commanditaire": "qui confie la mission (nom et qualité)",
  "details": "le détail de la mission, ce que l'on sait (3 à 5 phrases)",
  "objectif": "l'objectif de la mission, clair et vérifiable (1 phrase)",
  "lettre": "le mot laissé par le commanditaire à la guilde, écrit à la première personne, avec sa voix (3 à 6 phrases)",
  "lieu": { "id_existant": "l'identifiant d'un lieu de la liste, ou null", "nom": "le nom du lieu de la mission", "type": "son type (ruine, grotte, camp, village, sanctuaire…)", "description": "à quoi il ressemble (2 phrases)" }
}`;
}
function nettoyerMission(m, rang, i, contexte, ecriture) {
    const regions = new Map(contexte.regions.map(r => [r.numero, r.nom]));
    const lieux = new Map(contexte.lieux.map(l => [l.id, l]));
    const texte = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
    let region = Number(m && m.region);
    if (!regions.has(region)) region = contexte.regions.length ? contexte.regions[i % contexte.regions.length].numero : 1;
    const l = (m && m.lieu) || {};
    const existant = l.id_existant && lieux.get(String(l.id_existant)) && !lieux.get(String(l.id_existant)).hub ? lieux.get(String(l.id_existant)) : null;
    if (existant) region = existant.region;
    return {
        Id: `M_${Date.now().toString(36)}_${i}_${Math.floor(Math.random() * 1e5).toString(36)}`,
        Rang: rang, Titre: texte(m && m.titre, 80) || "Une mission", Resume: texte(m && m.resume, 200),
        Region: region, Region_Nom: regions.get(region) || `Région ${region}`,
        Commanditaire: texte(m && m.commanditaire, 120), Details: texte(m && m.details, 1200), Objectif: texte(m && m.objectif, 300),
        Lettre: String((m && m.lettre) || "").trim().slice(0, 1500),
        Lieu: existant ? { Id: existant.id, Nom: existant.nom, Type: existant.type, Description: texte(l.description, 400) }
                       : { Id: null, Nom: texte(l.nom, 80) || "Un lieu sans nom", Type: texte(l.type, 40) || "Lieu", Description: texte(l.description, 400) },
        Ecriture: ecriture
    };
}
export async function genererMissions() {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("missions")) throw new Error("Aucune clé Gemini");
    const rangs = tirerRangs();
    const contexte = { regions: regionsConnues(), lieux: lieuxConnus(), niveau: window.NIVEAU_GROUPE || 1, jour: jourAbsolu() };
    const corps = JSON.stringify({
        systemInstruction: { parts: [{ text: promptMissions(rangs, contexte) }] },
        contents: [{ role: "user", parts: [{ text: "Rédige les missions du panneau." }] }],
        generationConfig: { temperature: 1.0, responseMimeType: "application/json" }
    });
    const rep = await window.fetchGemini("missions", corps);
    const json = await rep.json();
    if (!rep.ok || json.error) throw new Error((json.error && json.error.message) || `Gemini ${rep.status}`);
    let liste = JSON.parse(json.candidates[0].content.parts[0].text);
    if (!Array.isArray(liste)) liste = Array.isArray(liste && liste.missions) ? liste.missions : [];
    if (liste.length < NB_MISSIONS) throw new Error(`MIA_MISSIONS n'a rendu que ${liste.length} missions`);
    const ecritures = ECRITURES.slice().sort(() => Math.random() - 0.5);
    return rangs.map((r, i) => nettoyerMission(liste[i], r, i, contexte, ecritures[i % ecritures.length]));
}

// ---------------------------------------------------------------------
//  LE TABLEAU DE LA PARTIE : écouté ; écrit (ou renouvelé) par un seul poste
// ---------------------------------------------------------------------
let tableau = null, partieEcoutee = "", arretEcoute = null, enGeneration = false;
const abonnes = new Set();
const prevenir = () => abonnes.forEach(f => { try { f(tableau); } catch (e) { console.warn("Missions : un abonné", e); } });
export const surChangement = (f) => { abonnes.add(f); return () => abonnes.delete(f); };
export const lireTableau = () => tableau;
function ecouter(id) {
    if (partieEcoutee === id) return;
    if (arretEcoute) { try { arretEcoute(); } catch (e) {} arretEcoute = null; }
    partieEcoutee = id; tableau = null; prevenir();
    if (!id) return;
    relire(id);
    try {
        arretEcoute = onSnapshot(refTableau(id), (s) => { if (partieEcoutee !== id) return; tableau = s.exists() ? s.data() : { Missions: [] }; prevenir(); },
                                 (e) => console.warn("Missions : l'écoute du tableau", e));
    } catch (e) { console.warn("Missions : l'écoute du tableau", e); }
}
// Une lecture directe (au départ, après une écriture de ce poste) : l'écoute suit ensuite.
async function relire(id) {
    try { const s = await getDoc(refTableau(id)); if (partieEcoutee === id) { tableau = s.exists() ? s.data() : { Missions: [] }; prevenir(); } }
    catch (e) { console.warn("Missions : la lecture du tableau", e); }
}
export const relireTableau = () => relire(idPartie());
// À renouveler ? Vide, jamais écrit, ou plus vieux que 30 jours en jeu.
export function aRenouveler(t, jour = jourAbsolu()) {
    if (!t) return false;                                             // pas encore lu
    const missions = Array.isArray(t.Missions) ? t.Missions : [];
    if (!missions.length || t.Jour_Absolu == null) return true;
    return jour - Number(t.Jour_Absolu) >= DUREE_JOURS;
}
export async function renouveler(options) {
    const id = idPartie();
    if (!id || enGeneration) return false;
    const forcer = !!(options && options.forcer);
    enGeneration = true;
    try {
        // Le verrou : un seul poste écrit les missions.
        const pris = await runTransaction(db, async (tx) => {
            const s = await tx.get(refTableau(id)), d = s.exists() ? s.data() : {};
            if (!forcer && !aRenouveler({ Missions: [], ...d })) return false;
            if (d.Generation_En_Cours && Date.now() - Number(d.Generation_En_Cours) < VERROU_MS) return false;
            tx.set(refTableau(id), { Generation_En_Cours: Date.now() }, { merge: true });
            return true;
        });
        if (!pris) return false;
        let missions;
        try { missions = await genererMissions(); }
        catch (e) { console.error("MIA_MISSIONS :", e); await setDoc(refTableau(id), { Generation_En_Cours: deleteField() }, { merge: true }); return false; }
        await setDoc(refTableau(id), { Missions: missions, Jour_Absolu: jourAbsolu(), Genere_Le: Date.now(), Generation_En_Cours: deleteField() }, { merge: true });
        await relire(id);
        return true;
    } catch (e) { console.error("Missions : le renouvellement", e); return false; }
    finally { enGeneration = false; }
}
// La veille : la partie chargée, son tableau écouté ; vide ou trop vieux, il se (re)fait.
let derniereTentative = 0;
setInterval(() => {
    if (document.hidden) return;
    const id = idPartie();
    ecouter(id);
    if (!id || !tableau || enGeneration || !window.cleGemini || !window.cleGemini("missions")) return;
    if (!aRenouveler(tableau)) return;
    if (Date.now() - derniereTentative < 60000) return;               // un échec : on réessaie dans une minute
    derniereTentative = Date.now();
    renouveler();
}, 2000);

// ---------------------------------------------------------------------
//  L'ENCART (grimoire_guilde.js le pose dans chaque encart du tableau)
// ---------------------------------------------------------------------
const SEPARATEUR = `<svg class="separateur-mission" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true"><path d="M4 5 C 30 3.2, 48 6.4, 56 5 M64 5 C 72 3.6, 92 6.6, 116 5"/><path d="M60 2.2 L 62.6 5 L 60 7.8 L 57.4 5 Z"/></svg>`;
export function htmlEncart(m, slot) {
    if (!m) return "";
    // (l'écriture passe par une variable : style.css impose Almendra à tout, en !important)
    return `<div class="mission-encart" style="--ecriture:'${echapper(m.Ecriture || ECRITURES[slot % ECRITURES.length])}'">
        <div class="rang-mission rang-${echapper(m.Rang)}">${echapper((RANGS[m.Rang] || {}).nom || "Rang " + m.Rang)}</div>
        ${SEPARATEUR}
        <div class="titre-mission">${echapper(m.Titre)}</div>
        <div class="resume-mission">${echapper(m.Resume)}</div></div>`;
}
export const missionDe = (slot) => { const l = tableau && Array.isArray(tableau.Missions) ? tableau.Missions : []; return l[slot] || null; };

// ---------------------------------------------------------------------
//  LA FEUILLE QUI GLISSE DU BAS DE L'ÉCRAN
// ---------------------------------------------------------------------
const paragraphes = (t) => String(t || "").split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => `<p>${echapper(x)}</p>`).join("");
export function ouvrirFeuille(slot) {
    const m = missionDe(slot);
    if (!m) return false;
    let voile = document.getElementById("feuille-mission");
    if (!voile) {
        voile = document.createElement("div");
        voile.id = "feuille-mission";
        voile.className = "voile-feuille-mission";
        voile.addEventListener("click", (e) => {
            if (e.target.closest(".sceau-mission")) { e.stopPropagation(); accepter(Number(voile.dataset.slot)); return; }
            if (!e.target.closest(".feuille-mission")) fermerFeuille();
        });
        document.body.appendChild(voile);
    }
    voile.dataset.slot = String(slot);
    voile.innerHTML = `<div class="feuille-mission" role="dialog" aria-label="${echapper(m.Titre)}">
        <div class="contenu-feuille-mission">
          <div class="rang-feuille rang-${echapper(m.Rang)}">${echapper((RANGS[m.Rang] || {}).nom || m.Rang)}</div>
          <h2 class="titre-feuille">${echapper(m.Titre)}</h2>
          ${SEPARATEUR}
          <dl class="faits-mission">
            <div><dt>Région</dt><dd>${echapper(m.Region_Nom)}</dd></div>
            <div><dt>Lieu</dt><dd>${echapper(m.Lieu && m.Lieu.Nom)}${m.Lieu && m.Lieu.Type ? ` <em>(${echapper(m.Lieu.Type)})</em>` : ""}</dd></div>
            <div><dt>Commanditaire</dt><dd>${echapper(m.Commanditaire)}</dd></div>
          </dl>
          <h3>La mission</h3>${paragraphes(m.Details)}
          <h3>L'objectif</h3><p class="objectif-mission">${echapper(m.Objectif)}</p>
          <h3>Le mot du commanditaire</h3><div class="lettre-mission" style="--ecriture:'${echapper(m.Ecriture || "Caveat")}'">${paragraphes(m.Lettre)}</div>
          <button type="button" class="sceau-mission" title="Accepter la mission"><span>Accepter<br>la mission</span></button>
        </div></div>`;
    son("page-prise");
    requestAnimationFrame(() => requestAnimationFrame(() => voile.classList.add("ouverte")));
    return true;
}
export function fermerFeuille() {
    const voile = document.getElementById("feuille-mission");
    if (!voile || !voile.classList.contains("ouverte")) return false;
    voile.classList.remove("ouverte");
    son("page-prise");
    return true;
}
// Accepter : le vote du groupe (v443). D'ici là, le sceau dit qu'il arrive.
let accepterMission = null;
export const brancherAcceptation = (f) => { accepterMission = f; };
function accepter(slot) {
    if (typeof accepterMission === "function") { accepterMission(slot, missionDe(slot)); return; }
    const sceau = document.querySelector("#feuille-mission .sceau-mission");
    if (sceau) sceau.classList.add("bientot");
}

window.MISSIONS_GUILDE = { RANGS, ECRITURES, NB_MISSIONS, DUREE_JOURS, jourAbsolu, tirerRangs, promptMissions, genererMissions, renouveler, aRenouveler,
                          lireTableau, relireTableau, surChangement, htmlEncart, missionDe, ouvrirFeuille, fermerFeuille, brancherAcceptation };
