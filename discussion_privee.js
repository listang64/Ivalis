// =========================================================================
//  IVALIS — LA DISCUSSION PRIVÉE (v422)
// =========================================================================
//  Nico : « sur la page du groupe, une petite tête qui parle dans l'encart des
//  PNJ qui nous suivent (pas le familier du Pisteur) : une interface privée
//  entre le joueur et le PNJ. Un fond noir à 70 %, à droite en grand l'avatar
//  du PNJ, à gauche celui du joueur ; celui qui parle a son encart (coins
//  arrondis, noir à 80 %) qui part de son avatar et s'arrête avant l'autre. On
//  commence par « Oui ? ». Le joueur parle sans retouche ; le PNJ parle, sans
//  description, seulement des gestes visibles entre astérisques. Un ping-pong
//  qui fait évoluer la relation (le système actuel), et les choses importantes
//  dans ses souvenirs. Un bouton pour quitter ; le PNJ peut partir de lui-même. »
//  Et : « la phrase du PNJ se met en plus petit en bas de l'écran » (quand c'est
//  au joueur de répondre) ; privé ; les liens du héros changent aussi ; pas
//  pendant un combat ; chaque discussion repart de « Oui ? ».
//
//    · LE PNJ : à chaque réplique, MIA_PAROLE (le modèle du Narrateur, réflexion
//      basse) lit son âme, ce qu'il pense du héros, ses souvenirs, la fin du
//      récit et toute la discussion ; elle rend { replique, partir } ;
//    · EN BASE : Systeme_Parties/{p}/Discussions/{id}, tenue à jour à chaque
//      échange (une page fermée brutalement n'y perd rien) ;
//    · À LA FIN (bouton, départ du PNJ, ou à la prochaine ouverture) : toute la
//      discussion passe une fois dans MIA_SOCIAL (social.js, tourSocial) — les
//      liens des deux côtés, l'humeur, les souvenirs ; sans témoin, sans trace
//      dans le récit.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { collection, query, where, getDocs, getDoc, orderBy, doc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

export const MODELE = "gemini-3.8-flash";
export const MODELE_SECOURS = "gemini-flash-lite-latest";
export const LASSITUDE = 12;          // au-delà, il peut se lasser
export const MAX_ECHANGES = 20;       // au-delà, il s'en va
const PARTIES = "Systeme_Parties";

const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sansHtml = (t) => String(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const dateJeu = () => { const d = window.DATE_EN_JEU_ACTUELLE || {}; return d.jour ? `Jour ${d.jour} de l'an ${d.annee || "?"}` : ""; };
const nomHeros = (h) => [h.prenom, h.nom].filter(Boolean).join(" ").trim() || "?";
const S = () => window.SOCIAL || {};

// Une réplique du PNJ, à l'écran : les gestes entre astérisques en italique.
export function htmlReplique(t) {
    return echapper(t).replace(/\*+([^*]+?)\*+/g, (_, g) => `<em class="geste-dp">${g.trim()}</em>`);
}
// Ce que l'IA rend, relu : une réplique (sans guillemets ni nom devant), partir oui/non.
export function lireReponse(brut, nomPnj) {
    let o = null;
    const m = String(brut || "").match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch (e) { o = null; } }
    let r = String((o ? o.replique : brut) || "").trim();
    const guillemets = (x) => x.replace(/^[«"“]\s*/, "").replace(/\s*[»"”]$/, "").trim();
    r = guillemets(r);
    if (nomPnj) r = guillemets(r.replace(new RegExp(`^${String(nomPnj).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s*\\([^)]{0,30}\\))?\\s*:\\s*`, "i"), ""));
    r = r.replace(/\s+/g, " ").trim().slice(0, 600);
    return { replique: r, partir: !!(o && o.partir === true) };
}
// La discussion, comme un dialogue écrit.
export const transcription = (lignes, nomHeros, nomPnj) => (lignes || []).map(l => `${l.qui === "pj" ? nomHeros : nomPnj} : ${l.texte}`).join("\n");
const echanges = (lignes) => (lignes || []).filter(l => l.qui === "pj").length;

// -------------------------------------------------------------------------
//  CE QUE SAIT LE PNJ
// -------------------------------------------------------------------------
async function finDuRecit(p, n = 8) {
    try {
        const snap = await getDocs(query(collection(db, "Messages_Chat"), where("ID_Partie", "==", p), orderBy("Timestamp", "asc")));
        const l = []; snap.forEach(d => l.push(d.data()));
        return l.filter(m => m && !["Date", "Système", "Date_En_Jeu"].includes(m.Auteur_Nom) && m.Auteur_ID !== "Date")
            .slice(-n).map(m => `${m.Auteur_Nom || "?"} : ${sansHtml(m.Texte).slice(0, 700)}`).join("\n");
    } catch (e) { return ""; }
}
async function connaissances(d) {
    const s = S(), p = d.p;
    const o = { ame: null, lien: null, souvenirs: [], recit: "", tour: 1 };
    try {
        const [ames, liens, sv, recit, etat] = await Promise.all([
            s.lireAmes ? s.lireAmes(p, [d.idPnj]) : {}, s.lireLiens ? s.lireLiens(p, [d.idPnj]) : {},
            s.lireSouvenirsDe ? s.lireSouvenirsDe(p, d.idPnj) : [], finDuRecit(p), getDoc(doc(db, PARTIES, p, "Social", "etat"))]);
        o.tour = Number(((etat.exists() && etat.data()) || {}).tour || 0) + 1;
        o.ame = ames[d.idPnj] || null;
        o.lien = liens[s.cleLien ? s.cleLien(d.idPnj, d.heros.idPersonnage) : `${d.idPnj}~${d.heros.idPersonnage}`] || null;
        o.souvenirs = sv.slice().sort((a, b) => ((b.sujets || []).includes(d.heros.idPersonnage) ? 3 : 0) + (Number(b.importance) || 1) - ((a.sujets || []).includes(d.heros.idPersonnage) ? 3 : 0) - (Number(a.importance) || 1)).slice(0, 6);
        o.recit = recit;
    } catch (e) { console.warn("[Discussion] Ce que sait le PNJ :", e); }
    return o;
}
export function promptPnj(d, k) {
    const s = S(), f = d.fiche || {}, h = d.heros;
    const ps = k.ame && s.psycheValide ? s.psycheValide(k.ame.psyche) : null;
    const hum = k.ame && s.humeurActive ? s.humeurActive(k.ame, k.tour || 1) : null;
    const lien = k.lien && k.lien.axes;
    const fem = typeof window.estGenreFeminin === "function" ? window.estGenreFeminin(h.genre) : /^f/i.test(String(h.genre || ""));
    let t = `Tu es ${d.nomPnj}${f.Occupation ? `, ${f.Occupation}` : ""}${f.Race ? ` (${f.Race})` : ""}, un personnage d'Ivalis (un jeu de rôle antique fantastique). Tu suis la compagnie de ${nomHeros(h)}.
${d.public ? `Sur la route, pendant la marche, tu parles à ${nomHeros(h)} (${[h.genre ? (fem ? "une femme" : "un homme") : "", h.race, h.classe].filter(Boolean).join(", ")}), devant le reste de la compagnie qui entend tout. ${(d.lignes || []).length ? "Tu lui réponds." : `C'EST TOI QUI ENGAGES LA CONVERSATION : ta réplique commence par son prénom, « ${h.prenom || nomHeros(h)}, … », puis ce que tu as envie de lui dire (une question, une remarque, un souci, un souvenir, une confidence, une pique…), selon ton caractère, ce que tu penses de lui et ce qui s'est passé.`}`
    : `${nomHeros(h)} (${[h.genre ? (fem ? "une femme" : "un homme") : "", h.race, h.classe].filter(Boolean).join(", ")}) te parle EN PRIVÉ, à l'écart des autres. Tu lui réponds.`}

${window.REGLE_MAGIE_IVALIS || ""}

COMMENT TU PARLES :
- Seulement ce que tu dis à voix haute, à la première personne, une à trois phrases courtes. Tu tutoies ou vouvoies selon ton caractère et votre relation.
- Aucune narration, aucune description de ce que tu fais ou ressens. Seul un geste VISIBLE et bref peut se glisser entre astérisques : *rigole*, *se crispe*, *détourne les yeux*.
- Tu restes toi-même : ton caractère, ton humeur, ce que tu penses de ${h.prenom || nomHeros(h)} et ce que tu as vécu. Tu ne sais que ce que tu as vécu ou vu. Tu peux refuser de répondre, mentir, te taire, te fâcher ou t'ouvrir, selon toi.
- Tu peux METTRE FIN à la discussion si tu n'as plus envie de parler (vexé, lassé, mal à l'aise, pressé, ou parce que tout a été dit) : "partir": true, et ta réplique est ta dernière phrase.`;
    if (f.Description_Physique) t += `\n\nTON ALLURE : ${sansHtml(f.Description_Physique).slice(0, 300)}`;
    if (ps) {
        t += `\n\nTON CARACTÈRE : ${s.caractere ? s.caractere(ps) : ""}.`;
        if (ps.valeurs && ps.valeurs.length) t += ` Tes valeurs : ${ps.valeurs.map(v => (s.NOMS_VALEURS || {})[v] || v).join(", ")}.`;
        if (ps.objectifs && ps.objectifs.length) t += ` Ce que tu veux : ${ps.objectifs.join(" ; ")}.`;
        if (ps.faille) t += ` Ta faille : ${ps.faille}.`;
        if (ps.masque) t += ` Ton masque devant les autres : ${ps.masque}.`;
    }
    if (ps && ps.style || f.Style_De_Parole) t += `\nTA FAÇON DE PARLER : ${(ps && ps.style) || f.Style_De_Parole}.`;
    if (f.Secret_Mental) t += `\nTON SECRET (tu ne le livres pas facilement) : ${sansHtml(f.Secret_Mental).slice(0, 300)}.`;
    t += `\nTON HUMEUR : ${hum ? `${(s.NOMS_EMOTIONS || {})[hum.emotion] || hum.emotion}${hum.cause ? ` (${hum.cause})` : ""}` : "calme"}.`;
    if (lien && s.affinite) {
        const a = s.affinite(lien);
        t += `\nCE QUE TU PENSES DE ${String(h.prenom || nomHeros(h)).toUpperCase()} : ${s.motAffinite ? s.motAffinite(a) : ""} (${Math.round(a)} sur une échelle de −100 à +100)${s.resumeLien ? ` — ${s.resumeLien(lien)}` : ""}.`;
    }
    // (v497) Un lien fort (social_pur.js) : il l'aime, ou le chérit comme un frère d'armes — avec pudeur.
    const fort = k.lien && k.lien.fort && k.lien.fort.type;
    if (fort === "amour") t += `\nTU L'AIMES. Tu ne le dis pas forcément : ça se voit à tes gestes, à ton trouble, à ton inquiétude pour lui. Reste pudique.`;
    else if (fort === "amitie") t += `\nTU TIENS À LUI COMME À UN FRÈRE OU UNE SŒUR D'ARMES : une confiance profonde, une franchise de vieux compagnon.`;
    // (v428) il sait qu'il fait partie de la compagnie, depuis quand ; et sa mémoire à long terme
    if (d.depuis) t += `\nTU FAIS PARTIE DE LA COMPAGNIE de ${nomHeros(h)} : tu voyages avec eux depuis le ${d.depuis}.`;
    if (k.ame && k.ame.memoire) t += `\nTA MÉMOIRE (ce que tu as retenu du passé plus lointain) : ${String(k.ame.memoire).slice(0, 1500)}`;
    if (k.souvenirs.length) t += `\nTES SOUVENIRS : ${k.souvenirs.map(z => `${z.dateJeu ? `[${z.dateJeu}] ` : ""}« ${z.texte} »`).join(" ")}`;
    if (k.recit) t += `\n\nOÙ EN EST L'HISTOIRE (les dernières lignes du récit) :\n${k.recit}`;
    t += `\n\nRéponds en JSON seul : {"replique":"...","partir":false}`;
    return t;
}
// La réplique du PNJ (le modèle du Narrateur ; Flash-Lite s'il est refusé).
async function demanderReplique(d, k) {
    const n = echanges(d.lignes);
    const fin = n >= MAX_ECHANGES ? `\n\n(La discussion a assez duré : c'est ta dernière réplique, "partir": true.)`
        : n >= LASSITUDE ? `\n\n(La discussion dure depuis un moment : tu peux y mettre fin si tu veux.)` : "";
    const texte = `--- LA DISCUSSION ---\n${transcription(d.lignes, d.heros.prenom || nomHeros(d.heros), d.nomPnj)}${fin}\n\nÀ toi, ${d.nomPnj}.`;
    const appel = async (modele) => {
        const generationConfig = { temperature: 0.9, maxOutputTokens: 1200, responseMimeType: "application/json" };
        if (modele === MODELE) generationConfig.thinkingConfig = { thinkingLevel: "low" };
        const corps = JSON.stringify({ systemInstruction: { parts: [{ text: promptPnj(d, k) }] }, contents: [{ role: "user", parts: [{ text: texte }] }], generationConfig });
        return window.fetchGemini("discussion", corps, { modele });
    };
    let rep = await appel(MODELE);
    if (!rep.ok && [400, 403, 404, 429].includes(rep.status)) { console.warn(`[Discussion] ${MODELE} refusé (${rep.status}) : ${MODELE_SECOURS} prend la parole.`); rep = await appel(MODELE_SECOURS); }
    if (!rep.ok) throw new Error("statut " + rep.status);
    const data = await rep.json();
    if (data.usageMetadata && typeof window.ajouterTokens === "function") window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    const brut = ((data.candidates?.[0]?.content?.parts) || []).filter(x => typeof x.text === "string" && !x.thought).map(x => x.text).join("");
    const r = lireReponse(brut, d.nomPnj);
    if (!r.replique) throw new Error("réplique vide");
    if (n >= MAX_ECHANGES) r.partir = true;
    return r;
}

// -------------------------------------------------------------------------
//  LA BASE ET LE SYSTÈME SOCIAL
// -------------------------------------------------------------------------
const refDiscussion = (p, id) => doc(db, PARTIES, p, "Discussions", id);
async function sauver(d, extra) {
    try {
        await setDoc(refDiscussion(d.p, d.id), { idPnj: d.idPnj, nomPnj: d.nomPnj, idHeros: d.heros.idPersonnage, nomHeros: nomHeros(d.heros), joueur: d.joueur,
            lignes: d.lignes, dateJeu: d.dateJeu, ouverte: d.ouverte, analysee: false, ...(extra || {}) }, { merge: true });
    } catch (e) { console.warn("[Discussion] Sauvegarde :", e); }
}
const analysees = new Set();
// Toute la discussion passe une fois dans MIA_SOCIAL : les liens des deux côtés, l'humeur, les souvenirs.
export async function analyser(p, id, x) {
    if (!p || !id || !x || analysees.has(id)) return null;
    analysees.add(id);
    const lignes = x.lignes || [];
    if (!lignes.some(l => l.qui === "pj") || !S().tourSocial) { await setDoc(refDiscussion(p, id), { analysee: true }, { merge: true }); return null; }
    const heros = (window.GROUPE && window.GROUPE.herosDeLaPartie ? window.GROUPE.herosDeLaPartie() : []).find(h => h.idPersonnage === x.idHeros)
        || { idPersonnage: x.idHeros, prenom: x.nomHeros };
    try {
        const res = await S().tourSocial({ idPartie: p, pnjs: [{ id: x.idPnj, fiche: x.fiche || { Nom_PNJ: x.nomPnj } }], heros: [heros], dateJeu: x.dateJeu || dateJeu(),
            texteJoueurs: x.public ? `(Une discussion sur la route entre ${x.nomHeros} et ${x.nomPnj}, engagée par ${x.nomPnj}, devant le reste de la compagnie. Les répliques de ${x.nomHeros} sont ses actions ; le dialogue complet est ci-dessous.)`
                : `(Une discussion EN PRIVÉ entre ${x.nomHeros} et ${x.nomPnj}, sans aucun témoin. Les répliques de ${x.nomHeros} sont ses actions ; le dialogue complet est ci-dessous.)`,
            texteMJ: transcription(lignes, x.nomHeros, x.nomPnj) });
        await setDoc(refDiscussion(p, id), { analysee: true, analyseeLe: Date.now(), evenements: ((res && res.evenements) || []).map(e => e.resume).slice(0, 6) }, { merge: true });
        console.log(`🗣️ [Discussion] ${x.nomHeros} et ${x.nomPnj} : ${((res && res.evenements) || []).length} événement(s), ${((res && res.souvenirs) || []).length} souvenir(s).`);
        if (window.GRIMOIRE_GROUPE && window.GRIMOIRE_GROUPE.lire) window.GRIMOIRE_GROUPE.lire(true);
        return res;
    } catch (e) { analysees.delete(id); console.warn("[Discussion] MIA_SOCIAL n'a pas pu lire la discussion :", e); return null; }
}
// Les discussions de ce joueur restées sans lecture (une page fermée en pleine discussion).
async function rattraper(p, sauf) {
    try {
        const snap = await getDocs(query(collection(db, PARTIES, p, "Discussions"), where("joueur", "==", moi()), where("analysee", "==", false)));
        const l = []; snap.forEach(d => { if (d.id !== sauf) l.push([d.id, d.data()]); });
        for (const [id, x] of l) await analyser(p, id, x);
    } catch (e) { console.warn("[Discussion] Rattrapage :", e); }
}

// -------------------------------------------------------------------------
//  LA FENÊTRE
// -------------------------------------------------------------------------
let d = null;            // la discussion ouverte
let fenetre = null;
const $ = (sel) => fenetre && fenetre.querySelector(sel);
const avatar = (url, nom, cote) => url ? `<img class="avatar-dp ${cote}" src="${echapper(url)}" alt="" draggable="false">`
    : `<div class="avatar-dp ${cote} sans-image"><span>${echapper(String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join(""))}</span></div>`;

export function peutParler(idPnj) {
    const p = window.ID_PARTIE_COURANTE;
    if (!p) return "Pas de partie en cours.";
    if (typeof window.combatRPActif === "function" && window.combatRPActif(p)) return "On ne discute pas en plein combat.";
    const heros = (window.GROUPE && window.GROUPE.herosDeLaPartie ? window.GROUPE.herosDeLaPartie() : []).find(h => h.idJoueur === moi());
    if (!heros) return "Tu n'as pas de héros actif dans cette partie.";
    return "";
}
// Ouvre la discussion avec un suiveur : { id, nom, fiche }.
export async function ouvrir(s) {
    if (d || !s || !s.id) return false;
    const refus = peutParler(s.id);
    if (refus) { alert(refus); return false; }
    const p = window.ID_PARTIE_COURANTE;
    const heros = window.GROUPE.herosDeLaPartie().find(h => h.idJoueur === moi());
    d = { p, id: `${Date.now()}_${s.id}`, idPnj: s.id, nomPnj: s.nom || (s.fiche || {}).Nom_PNJ || "?", fiche: s.fiche || {}, depuis: s.depuis || "", heros, joueur: moi(),
          lignes: [{ qui: "pnj", texte: "Oui ?" }], dateJeu: dateJeu(), ouverte: Date.now(), attente: false, fini: false, k: null };
    construire();
    rattraper(p, d.id);
    // Ce qu'il sait, lu pendant que « Oui ? » s'affiche.
    const ici = d;
    d.k = connaissances(d).then(k => { ici.k = k; return k; });
    afficherPnj("Oui ?", false);
    return true;
}
// (v503) Au camp (la page du camp ouverte, ou le clan au camp) : on peut inviter le PNJ à part.
const auCampIci = () => !!(window.RP_PRIVE && ((window.CAMP_SCENE && window.CAMP_SCENE.ouvert && window.CAMP_SCENE.ouvert()) || (window.CAMP && window.CAMP.auCamp && window.CAMP.auCamp() && window.CAMP.lire && window.CAMP.lire() && (window.CAMP.lire().Membres || {})[(d || {}).idPnj])));
function construire() {
    fenetre = document.createElement("div");
    fenetre.id = "discussion-privee";
    fenetre.className = "discussion-privee";
    fenetre.setAttribute("role", "dialog");
    fenetre.setAttribute("aria-label", `Discussion avec ${d.nomPnj}`);
    const h = d.heros;
    fenetre.innerHTML = `
      ${avatar(h.urlCloudinary || h.urlAvatarEquipe || h.urlPortraitReference || "", nomHeros(h), "pj")}
      ${avatar((d.fiche || {}).URL_Cloudinary || "", d.nomPnj, "pnj")}
      <div class="encart-dp pnj"><div class="nom-dp">${echapper(d.nomPnj)}</div><div class="texte-dp"></div><div class="suite-dp"></div></div>
      <form class="encart-dp pj" autocomplete="off">
        <div class="nom-dp">${echapper(h.prenom || nomHeros(h))}</div>
        <textarea class="saisie-dp" rows="3" maxlength="600" placeholder="Ce que tu lui dis…"></textarea>
        <button type="submit" class="envoyer-dp" title="Dire (Entrée)" aria-label="Dire">➤</button>
      </form>
      <div class="rappel-dp" hidden></div>
      <button type="button" class="quitter-dp">Quitter la discussion</button>
      ${auCampIci() ? `<button type="button" class="inviter-dp">L'inviter en privé</button>` : ""}`;
    document.body.appendChild(fenetre);
    $(".quitter-dp").addEventListener("click", () => fermer("joueur"));
    // (v503) Nico : « en discussion privée avec un personnage au camp, un bouton en haut : L'inviter en privé ; ça ouvre
    // le livre avec un RP de ce personnage où vous l'invitez à part dans le camp, visible du seul joueur qui l'a initié ».
    const inviter = $(".inviter-dp");
    if (inviter) inviter.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!d || !window.RP_PRIVE) return;
        const x = { idPnj: d.idPnj, nomPnj: d.nomPnj, fiche: d.fiche, heros: d.heros, lignes: d.lignes.slice() };
        await fermer("joueur");
        window.RP_PRIVE.commencer(x);
    });
    $(".encart-dp.pj").addEventListener("submit", (e) => { e.preventDefault(); envoyer(); });
    $(".saisie-dp").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } });
    // (v428) Nico : « les paroles du PNJ disparaissent et vont en bas seulement quand le joueur a
    // cliqué quelque part sur l'écran ». Un toucher n'importe où (sauf « Quitter ») : à lui de
    // répondre ; le PNJ parti, le toucher referme la discussion.
    fenetre.addEventListener("click", (e) => {
        if (!d || e.target.closest(".quitter-dp")) return;
        const t = fenetre.dataset.tour;
        if (t === "pnj" && !d.attente && !d.fini) { e.preventDefault(); tourDuJoueur(); }
        else if (t === "parti") fermer("pnj");
    });
    fenetre.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer("joueur"); });
}
// Le PNJ parle (ou réfléchit : « … ») ; sa phrase reste jusqu'au toucher du joueur.
// (v428) Nico : « les deux encarts se chevauchent : quand le PNJ parle, l'encart du joueur à
// 10 %, et l'inverse quand c'est au joueur, l'encart actif passant devant ». Les deux restent
// là, en bas de l'écran ; `data-tour` dit lequel est devant (discussion_privee.css).
function afficherPnj(texte, reflechit) {
    if (!fenetre) return;
    $(".rappel-dp").hidden = true;
    const e = $(".encart-dp.pnj");
    e.classList.toggle("reflechit", !!reflechit);
    e.querySelector(".texte-dp").innerHTML = reflechit ? `<span class="points-dp"><i></i><i></i><i></i></span>` : htmlReplique(texte);
    // (v430) Une nouvelle phrase arrive en fondu rapide.
    if (!reflechit) { e.classList.remove("neuf"); void e.offsetWidth; e.classList.add("neuf"); }
    e.querySelector(".suite-dp").textContent = reflechit ? "" : d.fini ? "Touchez l'écran pour quitter" : "Touchez l'écran pour répondre";
    fenetre.dataset.tour = reflechit ? "attente" : "pnj";
    const s = $(".saisie-dp");
    s.disabled = true;
    try { s.blur(); } catch (er) {}
}
// Au joueur : la phrase du PNJ, en petit, en bas de l'écran ; son encart à lui.
function tourDuJoueur() {
    if (!fenetre || !d || d.fini) return;
    const derniere = [...d.lignes].reverse().find(l => l.qui === "pnj");
    const r = $(".rappel-dp");
    r.innerHTML = derniere ? `<b>${echapper(d.nomPnj)}</b> ${htmlReplique(derniere.texte)}` : "";
    r.hidden = !derniere;
    $(".encart-dp.pnj .suite-dp").textContent = "";
    fenetre.dataset.tour = "pj";
    const s = $(".saisie-dp");
    s.disabled = false;
    setTimeout(() => { try { s.focus(); } catch (e) {} }, 30);
}
async function envoyer() {
    if (!d || d.attente || d.fini) return;
    const s = $(".saisie-dp");
    const texte = String(s.value || "").replace(/\s+/g, " ").trim();
    if (!texte) return;
    d.attente = true;
    s.value = "";
    d.lignes.push({ qui: "pj", texte });
    afficherPnj("", true);
    const ici = d;
    try {
        const k = await ici.k;
        const r = await demanderReplique(ici, k);
        if (d !== ici) return;
        ici.lignes.push({ qui: "pnj", texte: r.replique });
        ici.attente = false;
        if (r.partir) { ici.fini = true; ici.parti = true; }
        sauver(ici);
        afficherPnj(r.replique, false);
        if (r.partir) fenetre.dataset.tour = "parti";       // (v428) un toucher referme
    } catch (e) {
        console.warn("[Discussion] La réplique n'est pas venue :", e);
        if (d !== ici) return;
        ici.lignes.pop();
        ici.attente = false;
        tourDuJoueur();
        $(".saisie-dp").value = texte;
        const r = $(".rappel-dp");
        r.hidden = false;
        r.innerHTML = `<i>(${echapper(ici.nomPnj)} ne semble pas t'avoir entendu — réessaie.)</i>`;
    }
}
// Fermer : la fenêtre s'en va tout de suite ; MIA_SOCIAL lit la discussion derrière.
export async function fermer(qui) {
    if (!d) return null;
    const x = d;
    d = null;
    if (fenetre) { fenetre.remove(); fenetre = null; }
    x.fini = true;
    await sauver(x, { fermee: Date.now(), fin: qui === "pnj" ? "pnj" : "joueur" });
    return analyser(x.p, x.id, { idPnj: x.idPnj, nomPnj: x.nomPnj, idHeros: x.heros.idPersonnage, nomHeros: x.heros.prenom || nomHeros(x.heros), lignes: x.lignes, dateJeu: x.dateJeu, fiche: x.fiche });
}

// =========================================================================
//  (v457) LA DISCUSSION DE LA ROUTE : VISIBLE PAR TOUS
// =========================================================================
//  Nico : « lors des déplacements sur la carte, 30 % de chance qu'au lieu d'un POI, ça ouvre pour tous les
//  joueurs la fenêtre de dialogue, visible par tous : un des PNJ qui nous suivent ouvre le dialogue et
//  commence à parler à l'un des joueurs du groupe, en commençant par « NOM DU HÉROS, … ». Le joueur peut
//  entamer la discussion, les autres lisent. Quand le joueur a écrit et que c'est au tour du PNJ, le RP du
//  joueur est placé en bas comme celui du PNJ. »
//    · la halte : voyage_groupe.js (Etat « dialogue ») ; la discussion vit sur la partie, chacun la voit :
//      Systeme_Parties/{p}.Discussion_Route = { Id, Voyage, idPnj, nomPnj, image, idHeros, nomHeros, joueur,
//      lignes, tour : "attente" | "pnj" | "parti", dateJeu, Le } ;
//    · seul le joueur du héros interpellé répond (son poste demande les répliques au PNJ) ; elle finie, elle
//      passe dans MIA_SOCIAL (devant la compagnie) et la marche reprend.
const refPartie = (p) => doc(db, PARTIES, p);
async function ecrireRoute(p, valeur) { await setDoc(refPartie(p), { Discussion_Route: valeur === null ? deleteField() : valeur }, { merge: true }); }
const commencePar = (texte, prenom) => !prenom || String(texte).slice(0, 60).toLowerCase().includes(String(prenom).toLowerCase());
const SILENCE_ROUTE_MS = 3 * 60 * 1000;   // sans un mot depuis, les autres peuvent reprendre la route
export async function ouvrirSurLaRoute(o) {
    const p = window.ID_PARTIE_COURANTE;
    if (!p || !window.GROUPE || typeof window.fetchGemini !== "function") return false;
    if (typeof window.combatRPActif === "function" && window.combatRPActif(p)) return false;
    const liste = (await window.GROUPE.lireCompagnie(p)).filter(x => x && x.id && (x.etat || "avec") === "avec");
    // Un héros d'un joueur qui marche avec le groupe (celui qui répondra).
    const presents = new Set((typeof window.votantsVoyageGroupe === "function" ? window.votantsVoyageGroupe() : []).map(x => x.id));
    const tous = window.GROUPE.herosDeLaPartie().filter(h => h && h.idJoueur && h.statut !== "Mort");
    const heros = tous.filter(h => presents.has(h.idJoueur));
    const choixHeros = heros.length ? heros : tous;
    if (!liste.length || !choixHeros.length) return false;
    const s = liste[Math.floor(Math.random() * liste.length)], h = choixHeros[Math.floor(Math.random() * choixHeros.length)];
    let fiche = {};
    try { const f = await getDoc(doc(db, "Monde_PNJ", s.id)); fiche = f.exists() ? (f.data() || {}) : {}; } catch (e) {}
    if (fiche.Statut === "Mort") return false;
    const base = { Id: `${Date.now()}_${s.id}_route`, Voyage: (o && o.voyage) || "", idPnj: s.id, nomPnj: s.nom || fiche.Nom_PNJ || "?", image: fiche.URL_Cloudinary || "",
                   idHeros: h.idPersonnage, nomHeros: h.prenom || nomHeros(h), joueur: h.idJoueur, lignes: [], tour: "attente", dateJeu: dateJeu(), Le: Date.now() };
    await ecrireRoute(p, base);
    const dd = { p, id: base.Id, idPnj: s.id, nomPnj: base.nomPnj, fiche, depuis: s.depuis || "", heros: h, joueur: h.idJoueur, lignes: [], dateJeu: base.dateJeu, public: true };
    try {
        const k = await connaissances(dd);
        const r = await demanderReplique(dd, k);
        const prenom = h.prenom || nomHeros(h);
        const texte = commencePar(r.replique, prenom) ? r.replique : `${prenom}, ${r.replique}`;
        await ecrireRoute(p, { ...base, lignes: [{ qui: "pnj", texte }], tour: "pnj", Le: Date.now() });
        console.log(`🗣️ [Discussion de la route] ${base.nomPnj} à ${base.nomHeros} : « ${texte} »`);
        return true;
    } catch (e) {
        console.warn("[Discussion de la route] Le PNJ n'a pas pris la parole :", e);
        await ecrireRoute(p, null).catch(() => {});
        return false;
    }
}

let route = null, fenetreRoute = null, routeVue = "", masquee = "", repondre = -1, routeLocale = null, envoiRoute = false;
const $r = (sel) => fenetreRoute && fenetreRoute.querySelector(sel);
const estMaRoute = () => !!route && route.joueur === moi();
export function appliquerRoute(x) {
    if (!x || !x.Id) { route = null; routeVue = ""; repondre = -1; if (fenetreRoute) { fenetreRoute.remove(); fenetreRoute = null; } return; }
    route = { ...x, lignes: Array.isArray(x.lignes) ? x.lignes : [] };
    const sig = JSON.stringify([x.Id, route.lignes, x.tour]);
    if (sig === routeVue && fenetreRoute) return;
    routeVue = sig;
    if (masquee && masquee !== `${x.Id}|${route.lignes.length}|${x.tour}`) masquee = "";
    if (masquee) return;
    if (fenetreRoute && fenetreRoute.dataset.id !== x.Id) { fenetreRoute.remove(); fenetreRoute = null; }
    if (!fenetreRoute) construireRoute();
    rendreRoute();
}
function herosDeLaRoute() {
    const l = window.GROUPE && window.GROUPE.herosDeLaPartie ? window.GROUPE.herosDeLaPartie() : [];
    return l.find(h => h.idPersonnage === route.idHeros) || { idPersonnage: route.idHeros, prenom: route.nomHeros, idJoueur: route.joueur };
}
function construireRoute() {
    const h = herosDeLaRoute(), mien = estMaRoute();
    fenetreRoute = document.createElement("div");
    fenetreRoute.id = "discussion-route";
    fenetreRoute.className = "discussion-privee discussion-route";
    fenetreRoute.dataset.id = route.Id;
    fenetreRoute.setAttribute("role", "dialog");
    fenetreRoute.setAttribute("aria-label", `${route.nomPnj} parle à ${route.nomHeros}`);
    fenetreRoute.innerHTML = `
      ${avatar(h.urlCloudinary || h.urlAvatarEquipe || h.urlPortraitReference || "", nomHeros(h), "pj")}
      ${avatar(route.image || "", route.nomPnj, "pnj")}
      <div class="encart-dp pnj"><div class="nom-dp">${echapper(route.nomPnj)}</div><div class="texte-dp"></div><div class="suite-dp"></div></div>
      ${mien ? `<form class="encart-dp pj" autocomplete="off">
        <div class="nom-dp">${echapper(h.prenom || nomHeros(h))}</div>
        <textarea class="saisie-dp" rows="3" maxlength="600" placeholder="Ce que tu lui réponds…"></textarea>
        <button type="submit" class="envoyer-dp" title="Dire (Entrée)" aria-label="Dire">➤</button>
      </form>` : ""}
      <div class="rappel-dp" hidden></div>
      <button type="button" class="quitter-dp" ${mien ? "" : "hidden"}>${mien ? "Quitter la discussion" : "Reprendre la route"}</button>`;
    document.body.appendChild(fenetreRoute);
    $r(".quitter-dp").addEventListener("click", (e) => { e.stopPropagation(); finirRoute(estMaRoute() ? "joueur" : "silence"); });
    if (mien) {
        $r(".encart-dp.pj").addEventListener("submit", (e) => { e.preventDefault(); envoyerSurLaRoute(); });
        $r(".saisie-dp").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyerSurLaRoute(); } });
    }
    // Un toucher : au joueur interpellé de répondre (ou de refermer, le PNJ parti) ; les autres lisent
    // (le PNJ parti, leur toucher referme la fenêtre chez eux).
    fenetreRoute.addEventListener("click", (e) => {
        if (!route || e.target.closest(".quitter-dp") || e.target.closest(".encart-dp.pj")) return;
        if (route.tour === "parti") { if (estMaRoute()) finirRoute("pnj"); else masquerRoute(); return; }
        if (estMaRoute() && route.tour === "pnj" && !envoiRoute) { repondre = route.lignes.length; rendreRoute(); }
    });
}
function masquerRoute() {
    if (!route) return;
    masquee = `${route.Id}|${route.lignes.length}|${route.tour}`;
    if (fenetreRoute) { fenetreRoute.remove(); fenetreRoute = null; }
}
function rendreRoute() {
    if (!fenetreRoute || !route) return;
    const mien = estMaRoute(), l = route.lignes;
    const pnj = [...l].reverse().find(x => x.qui === "pnj"), pj = [...l].reverse().find(x => x.qui === "pj");
    const e = $r(".encart-dp.pnj"), rappel = $r(".rappel-dp");
    const auJoueur = mien && route.tour === "pnj" && repondre === l.length;
    const reflechit = route.tour === "attente";
    e.querySelector(".texte-dp").innerHTML = reflechit ? `<span class="points-dp"><i></i><i></i><i></i></span>` : htmlReplique(pnj ? pnj.texte : "");
    if (!reflechit && e.__vu !== l.length) { e.__vu = l.length; e.classList.remove("neuf"); void e.offsetWidth; e.classList.add("neuf"); }
    e.querySelector(".suite-dp").textContent = reflechit || auJoueur ? ""
        : route.tour === "parti" ? (mien ? "Touchez l'écran pour quitter" : "La discussion est finie.")
        : mien ? "Touchez l'écran pour répondre" : `${route.nomHeros} va lui répondre…`;
    // En bas, en petit : au tour du PNJ, ce que le héros vient de dire ; au tour du joueur, la phrase du PNJ.
    const enBas = auJoueur ? (pnj ? { nom: route.nomPnj, texte: pnj.texte } : null) : (pj ? { nom: route.nomHeros, texte: pj.texte } : null);
    rappel.innerHTML = enBas ? `<b>${echapper(enBas.nom)}</b> ${htmlReplique(enBas.texte)}` : "";
    rappel.hidden = !enBas;
    fenetreRoute.dataset.tour = auJoueur ? "pj" : reflechit ? "attente" : route.tour === "parti" ? "parti" : "pnj";
    const s = $r(".saisie-dp");
    if (s) { s.disabled = !auJoueur; if (auJoueur) setTimeout(() => { try { s.focus(); } catch (er) {} }, 30); }
    const q = $r(".quitter-dp");
    if (q && !mien) q.hidden = Date.now() - (Number(route.Le) || 0) < SILENCE_ROUTE_MS;
}
// Trois minutes sans un mot : chez les autres, « Reprendre la route » apparaît.
setInterval(() => { if (fenetreRoute && route && !estMaRoute() && !document.hidden) rendreRoute(); }, 10000);
// Ce que le PNJ sait, lu une fois par discussion, sur le poste du joueur interpellé.
async function discussionLocale() {
    if (routeLocale && routeLocale.id === route.Id) return routeLocale;
    let fiche = {};
    try { const f = await getDoc(doc(db, "Monde_PNJ", route.idPnj)); fiche = f.exists() ? (f.data() || {}) : {}; } catch (e) {}
    const compagnie = window.GROUPE && window.GROUPE.lireCompagnie ? await window.GROUPE.lireCompagnie(window.ID_PARTIE_COURANTE).catch(() => []) : [];
    const dd = { p: window.ID_PARTIE_COURANTE, id: route.Id, idPnj: route.idPnj, nomPnj: route.nomPnj, fiche, depuis: ((compagnie || []).find(x => x.id === route.idPnj) || {}).depuis || "",
                 heros: herosDeLaRoute(), joueur: route.joueur, lignes: [], dateJeu: route.dateJeu || dateJeu(), public: true };
    dd.k = await connaissances(dd);
    routeLocale = dd;
    return dd;
}
async function envoyerSurLaRoute() {
    if (!route || !estMaRoute() || envoiRoute || route.tour !== "pnj") return;
    const s = $r(".saisie-dp");
    const texte = String((s && s.value) || "").replace(/\s+/g, " ").trim();
    if (!texte) return;
    envoiRoute = true;
    const ici = { ...route }, avant = ici.lignes.slice(), p = window.ID_PARTIE_COURANTE;
    const lignes = [...avant, { qui: "pj", texte }];
    s.value = "";
    try {
        await ecrireRoute(p, { ...ici, lignes, tour: "attente", Le: Date.now() });
        const dd = await discussionLocale();
        const r = await demanderReplique({ ...dd, lignes }, dd.k);
        await ecrireRoute(p, { ...ici, lignes: [...lignes, { qui: "pnj", texte: r.replique }], tour: r.partir ? "parti" : "pnj", Le: Date.now() });
    } catch (e) {
        console.warn("[Discussion de la route] La réplique n'est pas venue :", e);
        await ecrireRoute(p, { ...ici, lignes: avant, tour: "pnj", Le: Date.now() }).catch(() => {});
        repondre = avant.length;
        const t = $r(".saisie-dp"); if (t) t.value = texte;
    } finally { envoiRoute = false; }
}
// La fin (le joueur quitte, le PNJ est parti, ou trois minutes de silence) : la fenêtre se ferme chez tous,
// la discussion rangée et lue par MIA_SOCIAL, la marche reprend.
export async function finirRoute(qui) {
    if (!route) return null;
    const x = route, p = window.ID_PARTIE_COURANTE;
    route = null; routeVue = ""; repondre = -1;
    if (fenetreRoute) { fenetreRoute.remove(); fenetreRoute = null; }
    await ecrireRoute(p, null).catch(e => console.warn("[Discussion de la route] Fermeture :", e));
    try {
        await setDoc(refDiscussion(p, x.Id), { idPnj: x.idPnj, nomPnj: x.nomPnj, idHeros: x.idHeros, nomHeros: x.nomHeros, joueur: x.joueur, lignes: x.lignes || [], dateJeu: x.dateJeu || "",
            ouverte: Number(x.Le) || Date.now(), route: true, analysee: false, fermee: Date.now(), fin: qui }, { merge: true });
    } catch (e) { console.warn("[Discussion de la route] Sauvegarde :", e); }
    if (typeof window.reprendreApresDialogueVoyage === "function") window.reprendreApresDialogueVoyage(x.Voyage || null);
    return analyser(p, x.Id, { idPnj: x.idPnj, nomPnj: x.nomPnj, idHeros: x.idHeros, nomHeros: x.nomHeros, lignes: x.lignes || [], dateJeu: x.dateJeu, public: true });
}

window.DISCUSSION = { connaissances, ouvrir, fermer, peutParler, analyser, htmlReplique, lireReponse, transcription, promptPnj, LASSITUDE, MAX_ECHANGES,
                      ouverte: () => !!d, etat: () => d,
                      ouvrirSurLaRoute, appliquerRoute, finirRoute, route: () => route };
