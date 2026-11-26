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
import * as CP from "./camp_pur.js?v=19";

const PARTIES = "Systeme_Parties";
export const ATTENTE_IA_MS = 6000;
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
    return addDoc(colMessages(), { Conseil: m.conseil || c.Id || "", Type: m.type, Auteur_ID: m.id || "", Auteur_Nom: m.nom || "", Texte: String(m.texte || ""), Timestamp: Date.now() + (m.decalage || 0) });
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
        if (clos) await apresLeVote(clos.conseil, clos.resultat);
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
async function appelIA(prompt, historique) {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("narrateur")) return "";
    const reglages = typeof window.reglagesNarrateur === "function" ? window.reglagesNarrateur() : {};
    const fiche = (window.MODELES_NARRATEUR || []).find(m => m.id === reglages.modele);
    const generationConfig = { temperature: 1.0, responseMimeType: "application/json", ...(fiche && fiche.reflexion ? { thinkingConfig: { thinkingLevel: reglages.reflexion || "medium" } } : {}) };
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: historique }] }], generationConfig });
    const rep = await window.fetchGemini("narrateur", corps, reglages.modele ? { modele: reglages.modele } : undefined);
    const j = await rep.json();
    return (((j.candidates || [])[0] || {}).content || {}).parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
}
let enReponse = false;
export async function repondre() {
    const c = conseil();
    if (enReponse || !c || !c.Ouvert) return null;
    enReponse = true;
    try {
        const msgs = await lireMessages(c.Id);
        const dernier = msgs[msgs.length - 1];
        if (!dernier || dernier.Type !== "joueur") return null;
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
            heros: [...new Set(msgs.filter(m => m.Type === "joueur").map(m => m.Auteur_Nom))], sujets: c.Sujets, memoire: await memoire(),
            camp: `${Number(cmp.Provisions) || 0} provisions, ${Number(cmp.Caisse) || 0} drachmes dans la caisse, les alentours à ${((cmp.Ressources || {}).Jauge) ?? "?"}/100`
        });
        const historique = msgs.slice(-30).map(m => `${m.Auteur_Nom || "?"} : ${m.Texte}`).join("\n");
        let texte = "";
        try { texte = await appelIA(prompt, historique); } catch (e) { console.warn("[Conseil] L'IA :", e); }
        const r = CP.lireReponseConseil(texte, c, pnjs);
        for (let i = 0; i < r.repliques.length; i++) {
            const x = r.repliques[i];
            await ecrire({ conseil: c.Id, type: x.id === "THEMES" ? "themes" : "pnj", id: x.id, nom: x.qui, texte: x.texte, decalage: i });
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
              <button type="submit" class="dire-conseil">Dire</button>
            </form>
          </div>
          <div class="colonne-postits-conseil"><div class="postits-conseil" id="postits-conseil"></div><div class="proposer-conseil" id="proposer-conseil"></div>
            <p class="note-conseil" id="note-conseil" aria-live="polite"></p></div>
        </div>
      </div>`;
    document.body.appendChild(e);
    e.addEventListener("click", surClic);
    e.querySelector("#saisie-conseil").addEventListener("submit", (ev) => { ev.preventDefault(); const t = $("texte-conseil"); const v = t.value; t.value = ""; son(); envoyer(v); });
    e.querySelector("#texte-conseil").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); e.querySelector("#saisie-conseil").requestSubmit(); } });
    return e;
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
    if (m.Type === "joueur") { const h = persos().find(x => x.idJoueur === m.Auteur_ID && nomHeros(x) === m.Auteur_Nom) || persos().find(x => x.idJoueur === m.Auteur_ID); url = h ? (h.urlCloudinary || h.urlPortraitReference || "") : ""; }
    else if (m.Auteur_ID && infos[m.Auteur_ID]) url = infos[m.Auteur_ID].portrait || "";
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
        prop.innerHTML = !c.Ouvert ? "" : refus ? "" : proposition
            ? `<div class="form-sujet-conseil"><input id="titre-sujet-conseil" maxlength="80" placeholder="Le sujet, en quelques mots">
                <textarea id="resume-sujet-conseil" rows="2" maxlength="300" placeholder="Son résumé"></textarea>
                <select id="type-sujet-conseil">${Object.keys(CP.TYPES_SUJET).map(t => `<option value="${t}">${CP.TYPES_SUJET[t]}</option>`).join("")}</select>
                <button type="button" data-cs="poser">Poser le post-it</button><button type="button" data-cs="annuler">Annuler</button></div>`
            : `<button type="button" class="proposer-sujet" data-cs="proposer">+ Proposer un sujet</button>`;
    }
    const saisie = $("saisie-conseil");
    if (saisie) saisie.classList.toggle("eteinte", !c.Ouvert);
}
async function surClic(ev) {
    const b = ev.target.closest("[data-cs]");
    if (!b) return;
    const quoi = b.dataset.cs;
    son();
    if (quoi === "quitter") return fermerVue();
    if (quoi === "finir") {
        if (typeof window.confirm === "function" && !window.confirm("Mettre fin au conseil ? Son historique sera effacé.")) return;
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

window.CONSEIL = { terminer, ouvrir, peutOuvrir, creerConseil, envoyer, proposer, voter, verifierVote, repondre, planifierIA, rafraichir, ouvrirVue, fermerVue, veiller, conseil,
                   ouverte: () => ouverte, messages: () => messages.slice() };
