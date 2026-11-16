// =========================================================================
//  IVALIS — LES RENCONTRES RÉCENTES (v421)
// =========================================================================
//  Nico : « quand on clôture un chapitre RP, une IA cherche le type de
//  rencontre dans ce chapitre, et le range en secret dans la base du groupe ;
//  quelque chose de pas gros et très bref. On envoie cette liste au narrateur
//  afin de ne pas tomber toujours sur le même type de rencontre. »
//
//    · À LA CLÔTURE (grimoire_recit.js, archiverChapitre) : MIA_RENCONTRES
//      (Flash-Lite) lit le chapitre et choisit 1 à 4 types dans un catalogue
//      fixe (pour pouvoir compter), chacun avec un résumé de quelques mots ;
//    · EN SECRET : Systeme_Parties/{partie}.Rencontres_Recentes, les dix
//      derniers chapitres ({ numero, titre, rencontres: [{ type, resume }], ts }) ;
//      rien dans le livre, sauf la page des Paramètres (le Maître du Jeu) ;
//    · LE NARRATEUR (ia_master.js) lit, à chaque tour, ce qui revient dans les
//      cinq derniers chapitres et quelques pistes peu exploitées : « évite » ;
//    · MIA_ENNEMIS (combat_rp.js) lit les combats récents : si le récit ne
//      l'impose pas, elle varie le genre d'adversaires.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// LE CATALOGUE : un type, ce qu'il veut dire.
export const TYPES = {
    "combat-betes": "combat contre des bêtes",
    "combat-humains": "combat contre des humains (bandits, soldats, mercenaires)",
    "combat-surnaturel": "combat contre une créature surnaturelle (mort-vivant, démon, esprit)",
    "embuscade": "embuscade",
    "poursuite": "poursuite ou fuite",
    "negociation": "négociation ou marchandage",
    "intrigue": "intrigue ou politique",
    "taverne": "fête, taverne ou banquet",
    "rencontre-amicale": "rencontre amicale (voyageur, marchand, pèlerin)",
    "sauvetage": "PNJ en détresse ou sauvetage",
    "enquete": "enquête",
    "enigme": "énigme ou mystère",
    "ruines": "exploration de ruines ou de souterrains",
    "danger-naturel": "piège ou danger naturel (tempête, éboulement, gouffre)",
    "rite": "rite, religion ou magie",
    "larcin": "vol ou larcin"
};
export const COMBATS = ["combat-betes", "combat-humains", "combat-surnaturel", "embuscade"];
export const FENETRE = 5;          // les chapitres que le Narrateur regarde
export const GARDES = 10;          // les chapitres gardés en base
export const MAX_PAR_CHAPITRE = 4;

// Ce que l'IA rend, relu : seulement des types du catalogue, une fois chacun, quatre au plus.
export function nettoyer(brut) {
    const liste = Array.isArray(brut) ? brut : (brut && Array.isArray(brut.rencontres) ? brut.rencontres : []);
    const vus = new Set(), res = [];
    liste.forEach(x => {
        const type = String((x && x.type) || "").trim().toLowerCase();
        if (!TYPES[type] || vus.has(type) || res.length >= MAX_PAR_CHAPITRE) return;
        vus.add(type);
        res.push({ type, resume: String((x && x.resume) || "").replace(/\s+/g, " ").trim().slice(0, 80) });
    });
    return res;
}
const recents = (liste, n) => (Array.isArray(liste) ? liste : []).slice().sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0) || (Number(a.ts) || 0) - (Number(b.ts) || 0)).slice(-n);
// Combien de fois chaque type revient dans les `n` derniers chapitres (du plus fréquent au moins fréquent).
export function compter(liste, n = FENETRE) {
    const c = new Map();
    recents(liste, n).forEach(ch => (ch.rencontres || []).forEach(r => { if (TYPES[r.type]) c.set(r.type, (c.get(r.type) || 0) + 1); }));
    return [...c.entries()].sort((a, b) => b[1] - a[1] || Object.keys(TYPES).indexOf(a[0]) - Object.keys(TYPES).indexOf(b[0]));
}
// Les pistes : les types absents de la fenêtre, les jamais vus d'abord, puis les plus anciens ;
// à égalité, l'ordre tourne d'un chapitre à l'autre (pas toujours les mêmes propositions).
export function pistes(liste, n = 3, parmi = Object.keys(TYPES)) {
    const vusFenetre = new Set(compter(liste).map(([t]) => t));
    const dernier = {};
    const garde = recents(liste, GARDES);
    garde.forEach((ch, i) => (ch.rencontres || []).forEach(r => { dernier[r.type] = i + 1; }));
    const decalage = (Number((garde[garde.length - 1] || {}).numero) || garde.length) * 5;
    const rang = (t) => (parmi.indexOf(t) - decalage % parmi.length + parmi.length) % parmi.length;
    return parmi.filter(t => !vusFenetre.has(t)).sort((a, b) => (dernier[a] || 0) - (dernier[b] || 0) || rang(a) - rang(b)).slice(0, n);
}
const fois = ([t, k]) => `${TYPES[t]}${k > 1 ? ` ×${k}` : ""}`;
// LE BLOC DU NARRATEUR (vide tant qu'aucun chapitre n'a été rangé).
export function contexteNarrateur(liste) {
    const c = compter(liste);
    if (!c.length) return "";
    const p = pistes(liste);
    return `\n--- RENCONTRES RÉCENTES (varie) ---\nDéjà vu dans les ${Math.min(FENETRE, recents(liste, FENETRE).length)} derniers chapitres : ${c.map(fois).join(", ")}. `
        + `Évite de reproposer ces types de rencontre, sauf si les joueurs les cherchent eux-mêmes.${p.length ? ` Pistes peu exploitées : ${p.map(t => TYPES[t]).join(", ")}.` : ""}\n`;
}
// POUR MIA_ENNEMIS : seulement les combats.
export function contexteEnnemis(liste) {
    const c = compter(liste).filter(([t]) => COMBATS.includes(t));
    if (!c.length) return "";
    const p = pistes(liste, 2, COMBATS.filter(t => t !== "embuscade"));
    return `\n--- LES COMBATS DES DERNIERS CHAPITRES ---\n${c.map(fois).join(", ")}. Si le récit n'impose pas qui attaque, varie le genre d'adversaires${p.length ? ` (peu vus : ${p.map(t => TYPES[t]).join(", ")})` : ""}.\n`;
}

// -------------------------------------------------------------------------
//  MIA_RENCONTRES : le chapitre lu, ses rencontres en quelques mots
// -------------------------------------------------------------------------
export async function analyserChapitre(texte) {
    const cle = (() => { try { return localStorage.getItem("ivalis_GEMINI_API_KEY"); } catch (e) { return ""; } })();
    if (!cle || !String(texte || "").trim()) return [];
    const prompt = `Tu es MIA_RENCONTRES, l'archiviste d'Ivalis (un jeu de rôle). Tu ne racontes rien.
Lis ce chapitre et dis quels TYPES DE RENCONTRE les héros y ont vécus (1 à ${MAX_PAR_CHAPITRE}, les plus marquants), seulement parmi :
${Object.entries(TYPES).map(([t, s]) => `- ${t} : ${s}`).join("\n")}
Pour chacun, un résumé de 5 à 8 mots (« bandits sur la route d'Aulis »).
Réponds en JSON seul : {"rencontres":[{"type":"...","resume":"..."}]}`;
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: String(texte).slice(-14000) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: "application/json" } });
    const rep = typeof window.fetchGemini === "function"
        ? await window.fetchGemini("rencontres", corps, { modele: "gemini-flash-lite-latest" })
        : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cle}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: corps });
    if (!rep.ok) throw new Error("statut " + rep.status);
    const data = await rep.json();
    if (data.usageMetadata && typeof window.ajouterTokens === "function") window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    const brut = ((data.candidates?.[0]?.content?.parts) || []).filter(x => typeof x.text === "string" && !x.thought).map(x => x.text).join("");
    const m = brut.match(/\{[\s\S]*\}/);
    return m ? nettoyer(JSON.parse(m[0])) : [];
}

// -------------------------------------------------------------------------
//  LA BASE DU GROUPE (en secret)
// -------------------------------------------------------------------------
export async function lire(p) {
    if (!p) return [];
    const s = await getDoc(doc(db, "Systeme_Parties", p));
    const l = s.exists() ? (s.data() || {}).Rencontres_Recentes : [];
    return Array.isArray(l) ? l : [];
}
export async function enregistrer(p, entree) {
    if (!p || !entree) return null;
    const avant = (await lire(p)).filter(x => Number(x.numero) !== Number(entree.numero));
    const liste = recents([...avant, entree], GARDES);
    await updateDoc(doc(db, "Systeme_Parties", p), { Rencontres_Recentes: liste });
    return liste;
}
// La clôture d'un chapitre : lu, rangé ; jamais bloquant, jamais bruyant.
export async function apresChapitre(p, promesse, numero, titre) {
    try {
        const rencontres = await promesse;
        if (!rencontres || !rencontres.length) { console.log(`🗺️ [MIA_RENCONTRES] Chapitre ${numero} : aucune rencontre relevée.`); return null; }
        const liste = await enregistrer(p, { numero, titre: String(titre || "").slice(0, 90), rencontres, ts: Date.now() });
        console.log(`🗺️ [MIA_RENCONTRES] Chapitre ${numero} : ${rencontres.map(r => r.type).join(", ")}.`);
        return liste;
    } catch (e) { console.warn("[MIA_RENCONTRES] Le chapitre n'a pas pu être lu :", e); return null; }
}

window.RENCONTRES = { TYPES, COMBATS, FENETRE, GARDES, nettoyer, compter, pistes, contexteNarrateur, contexteEnnemis, analyserChapitre, lire, enregistrer, apresChapitre };
