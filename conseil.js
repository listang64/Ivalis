// =========================================================================
//  IVALIS — LE CONSEIL AUTOUR DU FEU (v485)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 9) :
//    · « Former le conseil » (la page du camp) ouvre en fondu la page du
//      conseil ; jamais pendant une expédition hors du camp ; un conseil
//      extraordinaire s'ouvre tout seul quand le camp n'a plus de provisions.
//    · Un récit à part, uniquement des paroles ; Thémès raconte (le réglage
//      d'IA du narrateur), en répliques courtes ; l'IA répond quand un joueur
//      écrit, en JSON (répliques, post-it, avis des PNJ), et laisse aux joueurs
//      le temps de parler ; les PNJ peuvent se répondre.
//    · Les post-its : 3 sujets au plus (les trois premiers), un par joueur, les
//      PNJ sans enchaîner ; l'éclaireur annonce vite un lieu repéré.
//    · Le vote : les joueurs seuls, modifiable ; le vote final dès que tous les
//      joueurs connectés ont voté ; les bulles des PNJ ; l'égalité départagée
//      par les PNJ, puis au sort. Le résultat devient la tâche votée ; +5 de
//      moral aux PNJ suivis, −3 aux ignorés (les fils invisibles).
//  Les règles : camp_pur.js. Les messages : Systeme_Parties/{p}/Conseil_Messages.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, getDocs, addDoc, collection, query, where, onSnapshot, runTransaction, deleteField, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=21";

const PARTIES = "Systeme_Parties";
export const ATTENTE_IA_MS = 6000;
// (v501) Nico : « les réponses des PNJ ne sont pas assez rapides : la même IA que pour les dialogues privés » ; « trois
// dialogues de trois personnes qui pop en même temps : un délai » ; « faire parler un PNJ quand pas de réponse après un
// certain temps (en pause si la fenêtre est fermée chez tous les joueurs) » ; « le vote fini, 10 secondes, puis le
// conseil se ferme et on revient au camp ».
export const MODELE_CONSEIL = "gemini-3.8-flash", MODELE_SECOURS_CONSEIL = "gemini-flash-lite-latest";
export const SILENCE_MS = 45000, RELANCES_MAX = 2, FERMETURE_APRES_VOTE_MS = 10000;
export const pauseEntreRepliques = (texte) => Math.min(4200, 1400 + 28 * String(texte || "").length);
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const refPartie = () => doc(db, PARTIES, idPartie());
const colMessages = () => collection(db, PARTIES, idPartie(), "Conseil_Messages");
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const camp = () => (window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null);
export const conseil = () => ((window.PARTIE_DATA || {}).Conseil) || null;
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const persos = () => window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [];
const nomHeros = (h) => [h.prenom, h.nom].filter(Boolean).join(" ").trim() || "Un héros";
let infos = {};
async function lireInfos() { try { infos = window.CAMP && window.CAMP.infosMembres ? await window.CAMP.infosMembres() : {}; } catch (e) {} return infos; }
const nomMembre = (id) => (infos[id] || {}).nom || ((camp() || {}).Membres || {})[id]?.Nom || id;
// Le héros qui parle pour ce joueur : son héros principal.
function monHeros() {
    const choix = (window.PARTIE_DATA || {}).Heros_Principaux || {};
    const id = CP.herosPrincipal(moi(), persos(), choix);
    return persos().find(h => h.idPersonnage === id) || null;
}
// Les PNJ du conseil (v491, camp_pur.js) : les membres restés au camp, hors Thémès (il anime) et hors héros principaux
// des joueurs connectés ; les héros secondaires et ceux des joueurs absents parlent comme des PNJ.
async function pnjsDuConseil() {
    const c = camp();
    if (!c) return [];
    const connectes = window.CAMP && window.CAMP.joueursConnectes ? await window.CAMP.joueursConnectes() : new Set([moi()]);
    const partis = (((window.PARTIE_DATA || {}).Expedition || {}).Membres || []);
    return CP.pnjsDuConseil(c, persos(), (window.PARTIE_DATA || {}).Heros_Principaux || {}, connectes, partis).map(id => ({ id, nom: nomMembre(id) }));
}

// ---------------------------------------------------------------------
//  OUVRIR, CRÉER
// ---------------------------------------------------------------------
export function peutOuvrir() {
    if (!idPartie() || !camp()) return "Le clan n'a pas de camp.";
    if (window.CAMP && window.CAMP.postesBloques && window.CAMP.postesBloques()) return "Une expédition est en cours hors du camp : le conseil attendra son retour.";
    return "";
}
async function lireDateJeu() {
    try { const s = await getDoc(doc(db, "Date_En_Jeu", "actuelle")); const d = s.exists() ? s.data() : {}; return d.Jour ? `Jour ${d.Jour} de l'an ${d.Annee || "?"}` : ""; } catch (e) { return ""; }
}
async function ecrire(m) {
    const c = conseil() || {};
    return addDoc(colMessages(), { Conseil: m.conseil || c.Id || "", Type: m.type, Auteur_ID: m.id || "", Auteur_Nom: m.nom || "", Texte: String(m.texte || ""), Timestamp: Date.now() + (m.decalage || 0),
                                   ...(m.relance ? { Relance: true } : {}) });
}
// Crée le conseil (une fois, par une transaction) avec ses sujets déjà connus : le manque de vivres (extraordinaire),
// le lieu repéré par l'éclaireur, les sujets laissés par le retour au camp (un voyageur…). Rend le conseil, et
// `nouveau` si c'est ce poste qui l'a créé.
export async function creerConseil(o = {}) {
    await lireInfos();
    const dateJeu = await lireDateJeu();
    const res = await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const d = s.exists() ? s.data() : {};
        if (!d.Camp) return null;
        if (d.Conseil && d.Conseil.Ouvert) return { conseil: d.Conseil, nouveau: false };
        const extra = !!(o.extraordinaire || d.Camp.Conseil_Extraordinaire);
        const c = CP.conseilVide("C" + Date.now().toString(36), { extraordinaire: extra, raison: extra ? ((d.Camp.Conseil_Extraordinaire || {}).Raison || o.raison || "") : "", maintenant: Date.now(), dateJeu });
        const idT = CP.idThemesDuCamp(d.Camp);
        const ajouter = (sujet) => { if ((c.Sujets || []).length < CP.SUJETS_MAX) c.Sujets.push(CP.nouveauSujet(c, { ...sujet, le: Date.now() })); };
        if (extra) ajouter({ titre: "Le manque cruel de vivres", resume: "Le camp n'a plus de provisions : comment nourrir le clan ?", type: "vivres", par: { id: idT || "THEMES", nom: "Thémès", type: "pnj" } });
        const lieu = (d.Camp.Lieux_Reperes || [])[0];
        if (lieu) ajouter({ titre: "Aller voir le lieu repéré", resume: `${nomMembre(lieu.Par)} a repéré un lieu intéressant près du camp.`, type: "lieu", par: { id: lieu.Par, nom: nomMembre(lieu.Par), type: "pnj" }, lieu });
        (d.Camp.Sujets_Conseil || []).forEach(x => ajouter({ titre: x.Type === "voyageur" ? "Accueillir le voyageur" : "Une affaire du camp", resume: x.Texte || "", type: "autre", par: { id: idT || "THEMES", nom: "Thémès", type: "pnj" } }));
        tx.update(refPartie(), { Conseil: c });
        return { conseil: c, nouveau: true, lieu };
    });
    if (res && res.nouveau) {
        const c = res.conseil;
        await ecrire({ conseil: c.Id, type: "themes", id: "THEMES", nom: "Thémès", texte: c.Extraordinaire
            ? "Asseyez-vous, tous. Le camp n'a plus de vivres : ce soir, nous ne nous lèverons pas sans avoir décidé comment nourrir le clan."
            : "Le feu est allumé, le clan est réuni. Que chacun dise ce qu'il a sur le cœur : qui veut parler le premier ?" });
        if (res.lieu) await ecrire({ conseil: c.Id, type: "pnj", id: res.lieu.Par, nom: nomMembre(res.lieu.Par), decalage: 1,
            texte: "Avant tout : en éclaireur, j'ai repéré un endroit pas loin du camp. Ça mérite qu'on aille y voir." });
    }
    return res;
}
export async function ouvrir() {
    const refus = peutOuvrir();
    if (refus) return refus;
    const r = await creerConseil();
    if (!r) return "Le conseil n'a pas pu se réunir.";
    window.PARTIE_DATA = { ...(window.PARTIE_DATA || {}), Conseil: r.conseil };
    ouvrirVue();
    return "";
}

// ---------------------------------------------------------------------
//  PARLER, PROPOSER, VOTER
// ---------------------------------------------------------------------
export async function envoyer(texte) {
    const c = conseil(), t = String(texte || "").trim();
    if (!c || !c.Ouvert || !t) return "";
    const h = monHeros();
    await ecrire({ type: "joueur", id: moi(), nom: h ? nomHeros(h) : ((window.COMPTE_JOUEUR || {}).nom || "Un joueur"), texte: t.slice(0, 800) });
    await rafraichir();
    planifierIA();
    return "";
}
export async function proposer(titre, resume, type) {
    const h = monHeros();
    const par = { id: moi(), nom: h ? nomHeros(h) : "Un joueur", type: "joueur" };
    let refus = "";
    await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const c = (s.exists() ? s.data() : {}).Conseil;
        refus = CP.peutProposer(c, par);
        if (refus) return;
        if (!String(titre || "").trim()) { refus = "Donne un titre au sujet."; return; }
        tx.update(refPartie(), { "Conseil.Sujets": [...(c.Sujets || []), CP.nouveauSujet(c, { titre, resume, type, par, le: Date.now() })] });
    });
    return refus;
}
export async function voter(idSujet) {
    let refus = "";
    await runTransaction(db, async (tx) => {
        const s = await tx.get(refPartie());
        const c = (s.exists() ? s.data() : {}).Conseil;
        if (!c || !c.Ouvert) { refus = "Le conseil n'est pas réuni."; return; }
        if (!(c.Sujets || []).some(x => x.Id === idSujet)) { refus = "Ce sujet n'existe pas."; return; }
        tx.update(refPartie(), { ["Conseil.Votes." + moi()]: idSujet });
    });
    if (!refus) setTimeout(() => verifierVote(), 0);
    return refus;
}
// LE VOTE FINAL : quand tous les joueurs connectés ont voté. Le poste qui clôt applique les conséquences.
let verification = null;
export async function verifierVote(alea = Math.random) {
    if (verification) return verification;
    verification = (async () => {
        const connectes = window.CAMP && window.CAMP.joueursConnectes ? await window.CAMP.joueursConnectes() : new Set([moi()]);
        const clos = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const d = s.exists() ? s.data() : {};
            const c = d.Conseil;
            if (!c || !c.Ouvert || !d.Camp) return null;
            const r = CP.resultatVote(c, connectes, alea);
            if (!r) return null;
            const resultat = { Sujet: r.sujet, Egalite: r.egalite, Tirage: r.tirage, Le: Date.now() };
            const camp2 = JSON.parse(JSON.stringify(d.Camp));
            if (c.Extraordinaire) delete camp2.Conseil_Extraordinaire;
            if (r.sujet.Lieu) camp2.Lieux_Reperes = (camp2.Lieux_Reperes || []).slice(1);
            camp2.Sujets_Conseil = [];
            // « Le choix gagnant devient la priorité du groupe : on crée la tâche correspondante » (la tâche en cours).
            camp2.Tache_Votee = { Type: r.sujet.Type, Titre: r.sujet.Titre, Resume: r.sujet.Resume, ...(r.sujet.Lieu ? { Lieu: r.sujet.Lieu } : {}), Conseil: c.Id, Le: Date.now() };
            if (r.sujet.Type === "deplacer") camp2.Deplacement_Vote = { Conseil: c.Id, Le: Date.now() };
            if (r.sujet.Type === "recruter") camp2.Recrutement_Vote = { Conseil: c.Id, Le: Date.now() };
            camp2.Conseils_Passes = (camp2.Conseils_Passes || []).concat([{ Id: c.Id, Extraordinaire: !!c.Extraordinaire, Sujets: (c.Sujets || []).map(x => x.Titre), Resultat: r.sujet.Titre, Le: Date.now() }]).slice(-20);
            tx.update(refPartie(), { Camp: camp2, "Conseil.Ouvert": false, "Conseil.Resultat": resultat });
            return { conseil: c, resultat };
        });
        if (clos) { fermeture.clore = clos.conseil.Id; await apresLeVote(clos.conseil, clos.resultat); }
        return clos;
    })();
    try { return await verification; } finally { verification = null; }
}
async function apresLeVote(c, resultat) {
    const s = resultat.Sujet;
    await ecrire({ conseil: c.Id, type: "themes", id: "THEMES", nom: "Thémès",
        texte: `Le conseil a décidé${resultat.Tirage ? ", et le sort a tranché" : resultat.Egalite ? ", et l'avis du clan a départagé les voix" : ""} : ${s.Titre.charAt(0).toLowerCase() + s.Titre.slice(1)}. C'est désormais notre tâche.` });
    const moraux = CP.moralApresConseil(c.Avis_PNJ, s.Id);
    if (moraux.length && window.CAMP && window.CAMP.changerMoral) { try { await window.CAMP.changerMoral(moraux); } catch (e) { console.warn("[Conseil] Le moral :", e); } }
    // La tâche votée remplace la tâche en cours (tache_en_cours.js, étape 10).
    if (window.TACHE_EN_COURS && typeof window.TACHE_EN_COURS.depuisConseil === "function") {
        Promise.resolve(window.TACHE_EN_COURS.depuisConseil(s)).catch(e => console.error("[Conseil] La tâche votée :", e));
    }
    console.log(`🔥 [Conseil] Décidé : « ${s.Titre} ».`);
}

// (v495) METTRE FIN AU CONSEIL : son historique effacé (les messages de ce conseil), le conseil retiré de la partie ;
// le prochain repart de zéro.
export async function terminer() {
    const c = conseil();
    if (!idPartie() || !c) return "Aucun conseil n'est réuni.";
    clearTimeout(minuteurIA);
    try {
        const snap = await getDocs(query(colMessages(), where("Conseil", "==", c.Id)));
        const refs = []; snap.forEach(d => refs.push(d.ref));
        for (let i = 0; i < refs.length; i += 400) { const lot = writeBatch(db); refs.slice(i, i + 400).forEach(r => lot.delete(r)); await lot.commit(); }
        await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const d = s.exists() ? s.data() : {};
            // (le conseil extraordinaire aussi : sinon il se rouvrirait aussitôt)
            if (d.Conseil && d.Conseil.Id === c.Id) tx.update(refPartie(), { Conseil: deleteField(), ...(d.Camp && d.Camp.Conseil_Extraordinaire ? { "Camp.Conseil_Extraordinaire": deleteField() } : {}) });
        });
    } catch (e) { console.error("[Conseil] Mettre fin au conseil :", e); return "La base n'a pas répondu."; }
    messages = [];
    const d = { ...(window.PARTIE_DATA || {}) }; delete d.Conseil; window.PARTIE_DATA = d;
    console.log(`🔥 [Conseil] Le conseil ${c.Id} est clos, son historique effacé.`);
    return "";
}

// ---------------------------------------------------------------------
//  L'IA : Thémès et les PNJ répondent
// ---------------------------------------------------------------------
let minuteurIA = null;
export function planifierIA(ms = ATTENTE_IA_MS) {
    clearTimeout(minuteurIA);
    minuteurIA = setTimeout(() => { repondre().catch(e => console.error("[Conseil] La réponse :", e)); }, ms);
}
async function lireMessages(id) {
    try {
        const snap = await getDocs(query(colMessages(), where("Conseil", "==", id)));
        const l = []; snap.forEach(d => l.push({ id: d.id, ...d.data() }));
        return l.sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
    } catch (e) { return []; }
}
async function memoire() {
    const c = camp() || {};
    const exps = (c.Expeditions_Passees || []).slice(-5);
    let titres = {};
    try {
        const snap = await getDocs(query(collection(db, "Recits_Chapitres"), where("ID_Partie", "==", idPartie())));
        snap.forEach(d => { const x = d.data(); if (x.Expedition) titres[x.Expedition] = x.Titre; });
    } catch (e) {}
    return exps.map(e => `- ${titres[e.Numero] || `Expédition ${e.Numero}`} : ${e.Jours} jour${e.Jours > 1 ? "s" : ""}, avec ${(e.Membres || []).map(nomMembre).join(", ")}`).join("\n")
        + (c.Dernier_Rapport && c.Dernier_Rapport.Texte ? `\n- Le dernier rapport de l'intendant : ${String(c.Dernier_Rapport.Texte).slice(0, 600)}` : "");
}
// (v501) L'IA des discussions privées (discussion_privee.js) : rapide, peu de réflexion ; Flash-Lite si elle est refusée.
async function appelIA(prompt, historique) {
    if (typeof window.fetchGemini !== "function") return "";
    const appel = (modele) => {
        const generationConfig = { temperature: 0.95, maxOutputTokens: 1500, responseMimeType: "application/json", ...(modele === MODELE_CONSEIL ? { thinkingConfig: { thinkingLevel: "low" } } : {}) };
        return window.fetchGemini("discussion", JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: historique }] }], generationConfig }), { modele });
    };
    let rep = await appel(MODELE_CONSEIL);
    if (rep && !rep.ok && [400, 403, 404, 429].includes(rep.status)) rep = await appel(MODELE_SECOURS_CONSEIL);
    const j = await rep.json();
    return (((j.candidates || [])[0] || {}).content || {}).parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
}
let enReponse = false;
// (v501) Combien de relances depuis la dernière parole d'un joueur (pas plus de RELANCES_MAX : le conseil attend).
export const relancesDepuisJoueur = (msgs) => { let n = 0; for (let i = msgs.length - 1; i >= 0 && msgs[i].Type !== "joueur"; i--) if (msgs[i].Relance) n++; return n; };
export async function repondre(o = {}) {
    const c = conseil();
    if (enReponse || !c || !c.Ouvert) return null;
    enReponse = true;
    try {
        const msgs = await lireMessages(c.Id);
        const dernier = msgs[msgs.length - 1];
        if (!dernier) return null;
        if (o.relance) { if (dernier.Type === "joueur" || Date.now() - (Number(dernier.Timestamp) || 0) < SILENCE_MS || relancesDepuisJoueur(msgs) >= RELANCES_MAX) return null; }
        else if (dernier.Type !== "joueur") return null;
        // Un seul poste répond : un verrou d'une minute dans le conseil.
        const pris = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const cc = (s.exists() ? s.data() : {}).Conseil;
            if (!cc || !cc.Ouvert || (cc.IA && cc.IA.Le && Date.now() - cc.IA.Le < 60000)) return false;
            tx.update(refPartie(), { "Conseil.IA": { Par: moi(), Le: Date.now(), Message: dernier.id } });
            return true;
        });
        if (!pris) { planifierIA(ATTENTE_IA_MS * 2); return null; }
        await lireInfos();
        const ames = {};
        const pnjs = await pnjsDuConseil();
        await Promise.all(pnjs.map(async (p) => { try { const s = await getDoc(doc(db, PARTIES, idPartie(), "Ames", p.id)); if (s.exists()) ames[p.id] = s.data(); } catch (e) {} }));
        const cmp = camp() || {};
        const prompt = CP.promptConseil({
            extraordinaire: c.Extraordinaire, raison: c.Raison,
            pnjs: pnjs.map(p => ({ nom: p.nom, caractere: window.SOCIAL && window.SOCIAL.caractere ? window.SOCIAL.caractere((ames[p.id] || {}).psyche) : "", moral: (cmp.Membres[p.id] || {}).Moral,
                                  tache: CP.TACHES[(cmp.Membres[p.id] || {}).Tache] ? CP.TACHES[(cmp.Membres[p.id] || {}).Tache].nom.toLowerCase() : "" })),
            heros: [...new Set(msgs.filter(m => m.Type === "joueur").map(m => m.Auteur_Nom))], sujets: c.Sujets, memoire: await memoire(), relance: !!o.relance,
            avis: pnjs.map(p => ({ nom: p.nom, sujet: ((c.Sujets || []).find(s => s.Id === (c.Avis_PNJ || {})[p.id]) || {}).Titre || "" })),
            camp: `${Number(cmp.Provisions) || 0} provisions, ${Number(cmp.Caisse) || 0} drachmes dans la caisse, les alentours à ${((cmp.Ressources || {}).Jauge) ?? "?"}/100`
        });
        const historique = msgs.slice(-30).map(m => `${m.Auteur_Nom || "?"} : ${m.Texte}`).join("\n");
        let texte = "";
        try { texte = await appelIA(prompt, historique); } catch (e) { console.warn("[Conseil] L'IA :", e); }
        const r = CP.lireReponseConseil(texte, c, pnjs);
        if (o.relance) r.repliques = r.repliques.slice(0, 1);
        // (v501) Une réplique après l'autre, le temps de la lire (plus de trois bulles d'un coup).
        for (let i = 0; i < r.repliques.length; i++) {
            const x = r.repliques[i];
            if (i) await attendre(pauseEntreRepliques(r.repliques[i - 1].texte));
            if (!(conseil() || {}).Ouvert) break;
            await ecrire({ conseil: c.Id, type: x.id === "THEMES" ? "themes" : "pnj", id: x.id, nom: x.qui, texte: x.texte, relance: !!o.relance });
        }
        await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie());
            const cc = (s.exists() ? s.data() : {}).Conseil;
            if (!cc || cc.Id !== c.Id || !cc.Ouvert) return;
            const maj = { "Conseil.IA": deleteField() };
            let sujets = cc.Sujets || [];
            if (r.postit && r.postit.par && !CP.peutProposer(cc, { id: r.postit.par, type: "pnj" }))
                sujets = maj["Conseil.Sujets"] = [...sujets, CP.nouveauSujet(cc, { titre: r.postit.titre, resume: r.postit.resume, type: r.postit.type, par: { id: r.postit.par, nom: r.postit.parNom, type: "pnj" }, le: Date.now() })];
            // Les avis : seulement sur des post-its qui existent (le post-it refusé n'en reçoit pas).
            const existe = new Set(sujets.map(x => x.Id));
            const avis = Object.fromEntries(Object.entries(r.avis).map(([id, v]) => [id, v && existe.has(v) ? v : null]));
            if (Object.keys(avis).length) maj["Conseil.Avis_PNJ"] = { ...(cc.Avis_PNJ || {}), ...avis };
            tx.update(refPartie(), maj);
        });
        const apres = await rafraichir();
        // Un joueur a parlé pendant la réponse : à son tour d'être entendu.
        if (apres.length && apres[apres.length - 1].Type === "joueur" && apres[apres.length - 1].id !== dernier.id) planifierIA(2000);
        return r;
    } finally { enReponse = false; }
}

// ---------------------------------------------------------------------
//  LA PAGE DU CONSEIL
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
let ouverte = false, messages = [], desabonner = null, fermes = new Set(), proposition = false;
function construire() {
    let e = $("ecran-conseil");
    if (e) return e;
    e = document.createElement("div");
    e.id = "ecran-conseil";
    e.className = "ecran-conseil";
    e.innerHTML = `
      <div class="cadre-conseil">
        <div class="tete-conseil"><button type="button" class="retour-conseil" data-cs="quitter">‹ Le camp</button>
          <h2 class="titre-conseil">Le conseil du clan</h2><span class="raison-conseil" id="raison-conseil"></span>
          <button type="button" class="finir-conseil" data-cs="finir" title="Clore le conseil et effacer son historique">Mettre fin au conseil</button></div>
        <div class="corps-conseil">
          <div class="colonne-chat-conseil">
            <div class="chat-conseil" id="chat-conseil" aria-live="polite"></div>
            <form class="saisie-conseil" id="saisie-conseil" autocomplete="off">
              <textarea id="texte-conseil" rows="2" maxlength="800" placeholder="Ce que ton héros dit au conseil…"></textarea>
              ${boutonMicro("texte-conseil")}
              <button type="submit" class="dire-conseil">Dire</button>
            </form>
            <p class="fin-vote-conseil" id="fin-vote-conseil" aria-live="polite"></p>
          </div>
          <div class="colonne-postits-conseil"><div class="postits-conseil" id="postits-conseil"></div><div class="proposer-conseil" id="proposer-conseil"></div>
            <p class="note-conseil" id="note-conseil" aria-live="polite"></p></div>
        </div>
      </div>
      <div class="voile-fin-conseil" id="voile-fin-conseil" role="dialog" aria-modal="true" aria-labelledby="titre-fin-conseil">
        <div class="carte-fin-conseil">
          <div class="titre-fin-conseil" id="titre-fin-conseil">Mettre fin au conseil ?</div>
          <p class="parole-fin-conseil">Thémès se lève et tisonne les braises : « Le feu baisse, mes amis. Il est temps que chacun retourne à ses occupations. Ce qui s'est dit ce soir restera entre nous et le feu. »</p>
          <p class="avis-fin-conseil">L'historique du conseil sera effacé.</p>
          <div class="boutons-fin-conseil"><button type="button" data-cs="finir-oui">Clore le conseil</button><button type="button" data-cs="finir-non">Rester encore</button></div>
        </div>
      </div>`;
    document.body.appendChild(e);
    e.addEventListener("click", surClic);
    e.querySelector("#saisie-conseil").addEventListener("submit", (ev) => { ev.preventDefault(); const t = $("texte-conseil"); const v = t.value; t.value = ""; son(); envoyer(v); });
    e.querySelector("#texte-conseil").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); e.querySelector("#saisie-conseil").requestSubmit(); } });
    return e;
}
// (v501) LA DICTÉE (comme l'encart d'écriture du récit, grimoire_recit.js) : on garde tout ce qui est dit, à la suite ;
// l'écoute reprend toute seule après un silence, jusqu'au prochain toucher.
const SVG_MICRO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"/></svg>`;
function boutonMicro(cible) { return `<button type="button" class="micro-conseil" data-cs="micro" data-cible="${cible}" aria-label="Dicter à voix haute" title="Dicter à voix haute">${SVG_MICRO}</button>`; }
const dictee = { reco: null, voulue: false, base: "", finies: "", champ: null, bouton: null };
const joindre = (a, b) => { a = a || ""; b = (b || "").trim(); if (!b) return a; return a + (a && !/\s$/.test(a) ? " " : "") + b; };
function basculerDictee(bouton) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const champ = $(bouton.dataset.cible);
    if (!champ) return;
    if (!SR) { noter("La dictée à voix haute demande Safari, Chrome ou Edge."); return; }
    const meme = dictee.voulue && dictee.champ === champ;
    if (dictee.voulue) arreterDictee();
    if (meme) return;
    Object.assign(dictee, { voulue: true, base: champ.value, finies: "", champ, bouton });
    try { window.dispatchEvent(new CustomEvent("ivalis-dictee", { detail: { active: true } })); } catch (e) {}
    bouton.classList.add("ecoute");
    demarrerDictee(SR);
}
function demarrerDictee(SR) {
    const reco = new SR();
    reco.lang = "fr-FR"; reco.interimResults = true; reco.continuous = true;
    reco.onresult = (ev) => {
        let finies = "", enCours = "";
        for (let i = 0; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) finies = joindre(finies, t); else enCours = joindre(enCours, t); }
        dictee.finies = finies;
        if (dictee.champ) dictee.champ.value = joindre(joindre(dictee.base, finies), enCours);
    };
    reco.onend = () => {
        dictee.base = joindre(dictee.base, dictee.finies); dictee.finies = "";
        if (dictee.voulue && dictee.champ && document.body.contains(dictee.champ)) { try { demarrerDictee(SR); return; } catch (e) {} }
        arreterDictee();
    };
    reco.onerror = (ev) => { if (ev && (ev.error === "not-allowed" || ev.error === "service-not-allowed")) arreterDictee(); };
    dictee.reco = reco;
    try { reco.start(); } catch (e) { arreterDictee(); }
}
function arreterDictee() {
    const reco = dictee.reco;
    dictee.voulue = false; dictee.reco = null;
    if (reco) { try { reco.stop(); } catch (e) { try { reco.abort(); } catch (e2) {} } }
    if (dictee.bouton) dictee.bouton.classList.remove("ecoute");
    dictee.champ = null; dictee.bouton = null;
    try { window.dispatchEvent(new CustomEvent("ivalis-dictee", { detail: { active: false } })); } catch (e) {}
}
function noter(t) { const n = $("note-conseil"); if (!n) return; n.textContent = t || ""; n.classList.toggle("visible", !!t); clearTimeout(noter.m); noter.m = setTimeout(() => n.classList.remove("visible"), 4000); }
export function ouvrirVue() {
    const e = construire(), c = conseil();
    if (!c) return false;
    ouverte = true; proposition = false;
    e.classList.add("affiche");
    requestAnimationFrame(() => e.classList.add("visible"));
    lireInfos().then(() => rendre());
    try { if (desabonner) desabonner(); desabonner = onSnapshot(query(colMessages(), where("Conseil", "==", c.Id)), (snap) => {
        const l = []; snap.forEach(d => l.push({ id: d.id, ...d.data() })); messages = l.sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0)); rendre(); }, () => {}); } catch (err) {}
    rafraichir();
    return true;
}
export function fermerVue() {
    const e = $("ecran-conseil"), c = conseil();
    if (c) fermes.add(c.Id);
    ouverte = false;
    if (dictee.voulue) arreterDictee();
    clearTimeout(fermeture.minuteur); fermeture.id = null;
    if (desabonner) { try { desabonner(); } catch (err) {} desabonner = null; }
    if (e) { e.classList.remove("visible"); setTimeout(() => { if (!ouverte) e.classList.remove("affiche"); }, 500); }
}
export async function rafraichir() {
    const c = conseil();
    if (!c) return [];
    messages = await lireMessages(c.Id);
    rendre();
    return messages;
}
function avatar(m) {
    let url = "";
    // (v501) Thémès parle sous « THEMES » : son portrait est celui de sa fiche de PNJ (le membre narrateur du camp).
    const idA = m.Auteur_ID === "THEMES" ? (CP.idThemesDuCamp(camp() || {}) || "") : m.Auteur_ID;
    if (m.Type === "joueur") { const h = persos().find(x => x.idJoueur === m.Auteur_ID && nomHeros(x) === m.Auteur_Nom) || persos().find(x => x.idJoueur === m.Auteur_ID); url = h ? (h.urlCloudinary || h.urlPortraitReference || "") : ""; }
    else if (idA && infos[idA]) url = infos[idA].portrait || (((infos[idA].fiche || {}).Images_Camp || [])[0] || {}).url || "";
    return url ? `<img class="avatar-conseil" src="${echapper(url)}" alt="" draggable="false">` : `<span class="avatar-conseil sans-image">${echapper(String(m.Auteur_Nom || "?").slice(0, 1).toUpperCase())}</span>`;
}
export function rendre() {
    if (!ouverte) return;
    const c = conseil();
    if (!c) return;
    const r = $("raison-conseil");
    if (r) r.textContent = c.Extraordinaire ? `Conseil extraordinaire${c.Raison ? " — " + c.Raison : ""}` : (c.Ouvert ? "" : "Le conseil a décidé.");
    const chat = $("chat-conseil");
    if (chat) {
        const enBas = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        chat.innerHTML = messages.map(m => `<div class="message-conseil ${m.Type}${m.Type === "joueur" && m.Auteur_ID === moi() ? " moi" : ""}">${avatar(m)}
            <div class="bulle-conseil"><b class="auteur-conseil">${echapper(m.Auteur_Nom)}</b><span>${echapper(m.Texte)}</span></div></div>`).join("");
        if (enBas) chat.scrollTop = chat.scrollHeight;
    }
    const zone = $("postits-conseil");
    if (zone) {
        const nomJoueur = (j) => { const m = messages.find(x => x.Type === "joueur" && x.Auteur_ID === j); return m ? m.Auteur_Nom : (j === moi() ? "toi" : "un joueur"); };
        const gagnant = c.Resultat && c.Resultat.Sujet ? c.Resultat.Sujet.Id : "";
        zone.innerHTML = (c.Sujets || []).map((s, i) => {
            const votes = Object.keys(c.Votes || {}).filter(j => c.Votes[j] === s.Id), pnjs = Object.keys(c.Avis_PNJ || {}).filter(id => c.Avis_PNJ[id] === s.Id);
            const mien = (c.Votes || {})[moi()] === s.Id;
            return `<div class="postit-conseil${mien ? " mien" : ""}${gagnant === s.Id ? " gagnant" : ""}" data-sujet="${echapper(s.Id)}" style="--penche:${[-2, 1.5, -1][i % 3]}deg">
                <div class="titre-postit">${echapper(s.Titre)}</div><div class="resume-postit">${echapper(s.Resume)}</div>
                <div class="par-postit">proposé par ${echapper((s.Par || {}).nom || "?")}</div>
                <div class="votes-postit">${votes.map(j => `<span class="vote-postit">${echapper(nomJoueur(j))}</span>`).join("")}</div>
                <div class="bulles-postit">${pnjs.map(id => `<span class="bulle-pnj-postit">${echapper(nomMembre(id))}</span>`).join("")}</div>
                ${c.Ouvert ? `<button type="button" class="voter-postit" data-cs="voter" data-sujet="${echapper(s.Id)}">${mien ? "Mon vote ✓" : "Voter pour"}</button>` : ""}
              </div>`;
        }).join("") || `<p class="vide-postits">Aucun sujet pour l'instant : chacun peut en proposer un (trois au plus).</p>`;
    }
    const prop = $("proposer-conseil");
    if (prop) {
        const refus = CP.peutProposer(c, { id: moi(), type: "joueur" });
        // (v501) Le formulaire n'est redessiné que s'il change : ce qu'on tape (ou dicte) n'est plus effacé à chaque message.
        const sigProp = JSON.stringify([c.Ouvert, !!refus, proposition]);
        if (prop.dataset.sig !== sigProp) { prop.dataset.sig = sigProp;
        prop.innerHTML = !c.Ouvert ? "" : refus ? "" : proposition
            ? `<div class="form-sujet-conseil"><div class="ligne-micro-conseil"><input id="titre-sujet-conseil" maxlength="80" placeholder="Le sujet, en quelques mots">${boutonMicro("titre-sujet-conseil")}</div>
                <div class="ligne-micro-conseil"><textarea id="resume-sujet-conseil" rows="2" maxlength="300" placeholder="Son résumé"></textarea>${boutonMicro("resume-sujet-conseil")}</div>
                <select id="type-sujet-conseil">${Object.keys(CP.TYPES_SUJET).map(t => `<option value="${t}">${CP.TYPES_SUJET[t]}</option>`).join("")}</select>
                <button type="button" data-cs="poser">Poser le post-it</button><button type="button" data-cs="annuler">Annuler</button></div>`
            : `<button type="button" class="proposer-sujet" data-cs="proposer">+ Proposer un sujet</button>`; }
    }
    const saisie = $("saisie-conseil");
    if (saisie) saisie.classList.toggle("eteinte", !c.Ouvert);
    // (v501) Le vote fini : 10 secondes, puis le conseil se lève et l'on revient au camp.
    if (!c.Ouvert && c.Resultat && fermeture.id !== c.Id) {
        fermeture.id = c.Id; fermeture.fin = Date.now() + FERMETURE_APRES_VOTE_MS;
        clearTimeout(fermeture.minuteur);
        fermeture.minuteur = setTimeout(() => { fermerVue(); if (fermeture.clore === c.Id) { fermeture.clore = null; terminer().catch(() => {}); } }, FERMETURE_APRES_VOTE_MS);
    }
    const fv = $("fin-vote-conseil");
    if (fv) { const reste = fermeture.id === c.Id ? Math.max(0, Math.ceil((fermeture.fin - Date.now()) / 1000)) : 0; fv.textContent = reste ? `Le conseil se lève dans ${reste} seconde${reste > 1 ? "s" : ""}…` : ""; }
}
const fermeture = { id: null, fin: 0, minuteur: null, clore: null };
async function surClic(ev) {
    const b = ev.target.closest("[data-cs]");
    if (!b) return;
    const quoi = b.dataset.cs;
    son();
    if (quoi === "quitter") return fermerVue();
    if (quoi === "micro") return basculerDictee(b);
    // (v501) Une jolie fenêtre, et un mot de Thémès, plutôt que la boîte du navigateur.
    if (quoi === "finir") { $("voile-fin-conseil").classList.add("visible"); return; }
    if (quoi === "finir-non") { $("voile-fin-conseil").classList.remove("visible"); return; }
    if (quoi === "finir-oui") {
        $("voile-fin-conseil").classList.remove("visible");
        const r = await terminer();
        if (r) return noter(r);
        return fermerVue();
    }
    if (quoi === "voter") { const r = await voter(b.dataset.sujet); if (r) noter(r); return; }
    if (quoi === "proposer") { proposition = true; return rendre(); }
    if (quoi === "annuler") { proposition = false; return rendre(); }
    if (quoi === "poser") {
        const r = await proposer(($("titre-sujet-conseil") || {}).value, ($("resume-sujet-conseil") || {}).value, ($("type-sujet-conseil") || {}).value);
        if (r) return noter(r);
        proposition = false;
        return rendre();
    }
}

// ---------------------------------------------------------------------
//  LA VEILLE (chaque nouvelle de la partie, camp.js)
// ---------------------------------------------------------------------
export async function veiller() {
    const c = camp(), d = window.PARTIE_DATA || {};
    if (!idPartie() || !c) return;
    // « Un conseil extraordinaire s'ouvre automatiquement quand le camp n'a plus de provisions » — une fois le clan au camp.
    if (c.Conseil_Extraordinaire && !(d.Conseil && d.Conseil.Ouvert) && !peutOuvrir()) { await creerConseil({ extraordinaire: true }); return; }
    const cs = d.Conseil;
    if (cs && cs.Ouvert && cs.Extraordinaire && !ouverte && !fermes.has(cs.Id)) ouvrirVue();
    if (ouverte) rendre();
    if (cs && cs.Ouvert && Object.keys(cs.Votes || {}).length) verifierVote();
}

// (v501) LE SILENCE : la page ouverte et visible chez ce joueur (sinon, rien : en pause), un PNJ relance la discussion
// quand personne n'a parlé depuis SILENCE_MS (RELANCES_MAX fois au plus d'affilée). Un seul poste parle (le verrou de l'IA).
setInterval(() => {
    if (!ouverte || document.hidden) return;
    const c = conseil();
    if (!c || !c.Ouvert) { if (c && fermeture.id === c.Id) rendre(); return; }
    const der = messages[messages.length - 1];
    if (der && der.Type !== "joueur" && Date.now() - (Number(der.Timestamp) || 0) >= SILENCE_MS && relancesDepuisJoueur(messages) < RELANCES_MAX)
        repondre({ relance: true }).catch(e => console.warn("[Conseil] La relance :", e));
}, 5000);
setInterval(() => { const c = conseil(); if (ouverte && c && !c.Ouvert && fermeture.id === c.Id) rendre(); }, 1000);

window.CONSEIL = { terminer, ouvrir, peutOuvrir, creerConseil, envoyer, proposer, voter, verifierVote, repondre, planifierIA, rafraichir, ouvrirVue, fermerVue, veiller, conseil,
                   ouverte: () => ouverte, messages: () => messages.slice(), rendre, relancesDepuisJoueur };
