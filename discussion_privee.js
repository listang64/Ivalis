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
import { collection, query, where, getDocs, getDoc, orderBy, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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
${nomHeros(h)} (${[h.genre ? (fem ? "une femme" : "un homme") : "", h.race, h.classe].filter(Boolean).join(", ")}) te parle EN PRIVÉ, à l'écart des autres. Tu lui réponds.

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
            texteJoueurs: `(Une discussion EN PRIVÉ entre ${x.nomHeros} et ${x.nomPnj}, sans aucun témoin. Les répliques de ${x.nomHeros} sont ses actions ; le dialogue complet est ci-dessous.)`,
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
const lecture = (t) => Math.max(1400, Math.min(6000, 900 + String(t || "").length * 45));

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
    d = { p, id: `${Date.now()}_${s.id}`, idPnj: s.id, nomPnj: s.nom || (s.fiche || {}).Nom_PNJ || "?", fiche: s.fiche || {}, heros, joueur: moi(),
          lignes: [{ qui: "pnj", texte: "Oui ?" }], dateJeu: dateJeu(), ouverte: Date.now(), attente: false, fini: false, k: null };
    construire();
    rattraper(p, d.id);
    // Ce qu'il sait, lu pendant que « Oui ? » s'affiche.
    const ici = d;
    d.k = connaissances(d).then(k => { ici.k = k; return k; });
    afficherPnj("Oui ?", false);
    return true;
}
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
      <div class="encart-dp pnj" hidden><div class="nom-dp">${echapper(d.nomPnj)}</div><div class="texte-dp"></div></div>
      <form class="encart-dp pj" hidden autocomplete="off">
        <div class="nom-dp">${echapper(h.prenom || nomHeros(h))}</div>
        <textarea class="saisie-dp" rows="3" maxlength="600" placeholder="Ce que tu lui dis…"></textarea>
        <button type="submit" class="envoyer-dp" title="Dire (Entrée)" aria-label="Dire">➤</button>
      </form>
      <div class="rappel-dp" hidden></div>
      <button type="button" class="quitter-dp">Quitter la discussion</button>`;
    document.body.appendChild(fenetre);
    $(".quitter-dp").addEventListener("click", () => fermer("joueur"));
    $(".encart-dp.pj").addEventListener("submit", (e) => { e.preventDefault(); envoyer(); });
    $(".saisie-dp").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } });
    $(".encart-dp.pnj").addEventListener("click", () => { if (d && !d.attente && !d.fini) tourDuJoueur(); });
    fenetre.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer("joueur"); });
}
// Le PNJ parle (ou réfléchit : « … ») ; puis, sa phrase lue, c'est au joueur.
function afficherPnj(texte, reflechit) {
    if (!fenetre) return;
    $(".encart-dp.pj").hidden = true;
    $(".rappel-dp").hidden = true;
    const e = $(".encart-dp.pnj");
    e.hidden = false;
    e.classList.toggle("reflechit", !!reflechit);
    e.querySelector(".texte-dp").innerHTML = reflechit ? `<span class="points-dp"><i></i><i></i><i></i></span>` : htmlReplique(texte);
    fenetre.dataset.tour = reflechit ? "attente" : "pnj";
    clearTimeout(afficherPnj.minuteur);
    if (!reflechit && !d.fini) afficherPnj.minuteur = setTimeout(tourDuJoueur, lecture(texte));
}
// Au joueur : la phrase du PNJ, en petit, en bas de l'écran ; son encart à lui.
function tourDuJoueur() {
    if (!fenetre || !d || d.fini) return;
    clearTimeout(afficherPnj.minuteur);
    const derniere = [...d.lignes].reverse().find(l => l.qui === "pnj");
    $(".encart-dp.pnj").hidden = true;
    const r = $(".rappel-dp");
    r.innerHTML = derniere ? `<b>${echapper(d.nomPnj)}</b> ${htmlReplique(derniere.texte)}` : "";
    r.hidden = !derniere;
    $(".encart-dp.pj").hidden = false;
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
        if (r.partir) {
            fenetre.dataset.tour = "parti";
            setTimeout(() => { if (d === ici) fermer("pnj"); }, lecture(r.replique) + 2000);
        }
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
    clearTimeout(afficherPnj.minuteur);
    if (fenetre) { fenetre.remove(); fenetre = null; }
    x.fini = true;
    await sauver(x, { fermee: Date.now(), fin: qui === "pnj" ? "pnj" : "joueur" });
    return analyser(x.p, x.id, { idPnj: x.idPnj, nomPnj: x.nomPnj, idHeros: x.heros.idPersonnage, nomHeros: x.heros.prenom || nomHeros(x.heros), lignes: x.lignes, dateJeu: x.dateJeu, fiche: x.fiche });
}

window.DISCUSSION = { ouvrir, fermer, peutParler, analyser, htmlReplique, lireReponse, transcription, promptPnj, LASSITUDE, MAX_ECHANGES,
                      ouverte: () => !!d, etat: () => d };
