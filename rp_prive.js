// =========================================================================
//  IVALIS — UN MOMENT À PART : LE RP PRIVÉ AVEC UN PNJ DU CAMP (v503)
// =========================================================================
//  Nico : « quand on est en discussion privée avec un personnage au camp, un bouton en haut : L'inviter en privé. Ça
//  ouvre alors le livre avec un RP de ce personnage où vous l'invitez à part dans le camp. Ce RP n'est disponible et
//  visible que pour le joueur l'ayant initié. C'est un RP traditionnel, mais avec le PNJ à qui il parle. »
//    · une double page du livre (grimoire.js, definirPrive), chez ce joueur seulement : à gauche le PNJ, à droite le
//      récit et l'encart pour écrire ;
//    · la scène : Systeme_Parties/{p}/RP_Prives/{id} (Joueur, Heros, Pnj, Ouvert…) et ses Messages (« pj », « mj ») ;
//    · le MJ (l'IA des discussions privées) raconte et joue le PNJ (sa fiche, son âme, ses liens, ses souvenirs :
//      discussion_privee.js, connaissances) ; jamais de combat ; jamais à la place du héros ;
//    · « Revenir au camp » : la scène est close, MIA_SOCIAL la lit (les fils invisibles), la page du camp revient.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

export const MODELE = "gemini-3.8-flash", MODELE_SECOURS = "gemini-flash-lite-latest";
const PARTIES = "Systeme_Parties";
const G = () => window.GRIMOIRE;
const D = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
const cadre = (g, amp) => (D().cadre ? D().cadre(g, amp) : "");
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const nomHeros = (h) => [h && h.prenom, h && h.nom].filter(Boolean).join(" ").trim() || "?";
const dateJeu = () => { const d = window.DATE_EN_JEU_ACTUELLE || {}; return d.jour ? `Jour ${d.jour} de l'an ${d.annee || "?"}` : ""; };
const FLEURON = `<svg class="fleuron fleuron-groupe" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
const TEINTE = { couleurs: ["#7a3b6e", "#9c5a8c", "#5e2c55"], opacite: 0.32, nom: "prive" };
const TEINTE_CAMP = { couleurs: ["#5e7f59", "#7d9c6f", "#476944"], opacite: 0.42, nom: "retour-camp" };
const colScenes = (p) => collection(db, PARTIES, p, "RP_Prives");
const colMessages = (p, id) => collection(db, PARTIES, p, "RP_Prives", id, "Messages");

let scene = null;          // { id, p, idPnj, nomPnj, fiche, heros, k, messages: [{ qui, texte, le }], attente }
let pages = null;

// ---------------------------------------------------------------------
//  LE MJ : il raconte, et joue le PNJ
// ---------------------------------------------------------------------
export function promptMJ(s, k) {
    const h = s.heros, f = s.fiche || {};
    const pnj = window.DISCUSSION && window.DISCUSSION.promptPnj ? String(window.DISCUSSION.promptPnj({ ...s, lignes: [] }, k || {})).replace(/\n\nRéponds en JSON seul[\s\S]*$/, "") : "";
    return `Tu es le Maître du Jeu d'Ivalis (un jeu de rôle antique fantastique). Tu mènes une scène PRIVÉE : ${nomHeros(h)} a invité ${s.nomPnj}${f.Occupation ? `, ${f.Occupation}` : ""}, à l'écart, quelque part dans le camp du clan nomade (au bord du camp, près d'un feu à part, sous un arbre, au bord de l'eau…). Personne d'autre n'est là.
COMMENT TU ÉCRIS :
- Un RP traditionnel : tu racontes la scène et tu fais parler et agir ${s.nomPnj} (ses répliques entre guillemets « »), en prose, au présent, 1 à 3 courts paragraphes.
- Tu ne décides JAMAIS à la place de ${nomHeros(h)} : ni ses paroles, ni ses gestes, ni ce qu'il ressent ; tu t'arrêtes quand c'est à lui d'agir.
- Pas de combat, pas d'ennemi, pas de danger : c'est un moment à part, au camp.
- ${s.nomPnj} reste lui-même (ce qui suit) : il peut s'ouvrir, se confier, refuser, se fâcher, partir, selon son caractère et ce qu'il pense de ${h.prenom || nomHeros(h)}.
${window.CAMP && window.CAMP.regleClanLoyal ? `- ${window.CAMP.regleClanLoyal()}` : ""}
${window.REGLE_MAGIE_IVALIS ? `- ${window.REGLE_MAGIE_IVALIS}` : ""}

CE QUI DÉFINIT ${String(s.nomPnj).toUpperCase()} (sa fiche, son caractère, ses liens, ses souvenirs) :
${pnj}`;
}
const transcription = (s) => s.messages.map(m => m.qui === "pj" ? `${nomHeros(s.heros)} : ${m.texte}` : `[MJ] ${m.texte}`).join("\n\n");
async function appelMJ(s, consigne) {
    if (typeof window.fetchGemini !== "function") throw new Error("Pas d'IA.");
    const k = await s.k;
    const appel = (modele) => {
        const generationConfig = { temperature: 0.95, maxOutputTokens: 1500, ...(modele === MODELE ? { thinkingConfig: { thinkingLevel: "low" } } : {}) };
        return window.fetchGemini("discussion", JSON.stringify({ systemInstruction: { parts: [{ text: promptMJ(s, k) }] },
            contents: [{ role: "user", parts: [{ text: `--- LA SCÈNE JUSQU'ICI ---\n${transcription(s) || "(elle commence)"}\n\n${consigne}` }] }], generationConfig }), { modele });
    };
    let rep = await appel(MODELE);
    if (rep && !rep.ok && [400, 403, 404, 429].includes(rep.status)) rep = await appel(MODELE_SECOURS);
    const j = await rep.json();
    const t = (((j.candidates || [])[0] || {}).content || {}).parts?.filter(x => !x.thought).map(x => x.text || "").join("") || "";
    return String(t).trim();
}
async function ecrire(s, qui, texte) {
    const m = { qui, texte: String(texte || "").slice(0, 4000), le: Date.now() };
    s.messages.push(m);
    try { await addDoc(colMessages(s.p, s.id), { Qui: qui, Texte: m.texte, Timestamp: m.le }); } catch (e) { console.warn("[Moment à part] L'écriture :", e); }
    maj();
}

// ---------------------------------------------------------------------
//  COMMENCER, REPRENDRE, FINIR
// ---------------------------------------------------------------------
// `o` : { idPnj, nomPnj, fiche, heros, lignes } (la discussion privée qui l'a ouverte).
export async function commencer(o) {
    const p = idPartie();
    if (!p || !o || !o.idPnj || !o.heros) return "Pas de partie.";
    const j = moi();
    let id = null, messages = [];
    // Une scène encore ouverte avec lui : on la reprend.
    try {
        const snap = await getDocs(query(colScenes(p), where("Joueur", "==", j)));
        snap.forEach(d => { const x = d.data(); if (x.Ouvert && x.Pnj === o.idPnj && x.Heros === o.heros.idPersonnage) id = d.id; });
        if (id) { const ms = await getDocs(colMessages(p, id)); ms.forEach(d => { const x = d.data(); messages.push({ qui: x.Qui, texte: x.Texte, le: x.Timestamp }); }); messages.sort((a, b) => a.le - b.le); }
    } catch (e) {}
    if (!id) {
        id = `${Date.now().toString(36)}_${o.idPnj}`;
        try { await setDoc(doc(db, PARTIES, p, "RP_Prives", id), { Joueur: j, Heros: o.heros.idPersonnage, Pnj: o.idPnj, Nom_Pnj: o.nomPnj, Ouvert: true, Debut: Date.now(), Date_Jeu: dateJeu() }); }
        catch (e) { console.warn("[Moment à part] La scène :", e); }
    }
    scene = { id, p, idPnj: o.idPnj, nomPnj: o.nomPnj, fiche: o.fiche || {}, heros: o.heros, messages, attente: false, avant: (o.lignes || []).slice(-6) };
    scene.k = window.DISCUSSION && window.DISCUSSION.connaissances ? window.DISCUSSION.connaissances({ p, idPnj: o.idPnj, heros: o.heros }).catch(() => ({})) : Promise.resolve({});
    // Le livre : la page du camp se ferme, la double page s'ouvre.
    const montrer = () => ouvrirPages();
    if (window.CAMP_SCENE && window.CAMP_SCENE.ouvert && window.CAMP_SCENE.ouvert()) window.CAMP_SCENE.fermer(montrer); else montrer();
    if (!messages.length) {
        const s = scene;
        s.attente = true; maj();
        const avant = s.avant.length ? `\n(Juste avant, ils parlaient : ${s.avant.map(l => `${l.qui === "pj" ? nomHeros(s.heros) : s.nomPnj} : ${l.texte}`).join(" / ")})` : "";
        try { const t = await appelMJ(s, `Ouvre la scène : ${nomHeros(s.heros)} vient d'inviter ${s.nomPnj} à l'écart, dans le camp. Décris l'endroit où ils s'isolent et la réaction de ${s.nomPnj}, puis laisse la main au joueur.${avant}`); if (t && scene === s) await ecrire(s, "mj", t); }
        catch (e) { console.warn("[Moment à part] Le MJ :", e); if (scene === s) await ecrire(s, "mj", `${s.nomPnj} te suit à l'écart du camp, là où le bruit des tentes s'estompe.`); }
        if (scene === s) { s.attente = false; maj(); }
    }
    return "";
}
export async function envoyer(texte) {
    const s = scene, t = String(texte || "").replace(/\s+/g, " ").trim();
    if (!s || s.attente || !t) return "";
    await ecrire(s, "pj", t);
    s.attente = true; maj();
    try { const r = await appelMJ(s, `À toi, Maître du Jeu : raconte la suite, ${s.nomPnj} réagit à ce que ${nomHeros(s.heros)} vient de faire ou de dire.`); if (r && scene === s) await ecrire(s, "mj", r); }
    catch (e) { console.warn("[Moment à part] Le MJ :", e); if (scene === s) await ecrire(s, "mj", "(Le MJ n'a pas répondu : réessaie.)"); }
    if (scene === s) { s.attente = false; maj(); }
    return "";
}
export async function finir() {
    const s = scene;
    if (!s) return;
    scene = null;
    try { await updateDoc(doc(db, PARTIES, s.p, "RP_Prives", s.id), { Ouvert: false, Fin: Date.now() }); } catch (e) {}
    // Les fils invisibles : MIA_SOCIAL lit la scène (comme une discussion privée).
    if (window.DISCUSSION && window.DISCUSSION.analyser && s.messages.length > 1) {
        Promise.resolve(window.DISCUSSION.analyser(s.p, "prive_" + s.id, { idPnj: s.idPnj, nomPnj: s.nomPnj, idHeros: s.heros.idPersonnage, nomHeros: s.heros.prenom || nomHeros(s.heros),
            lignes: s.messages.map(m => ({ qui: m.qui === "pj" ? "pj" : "pnj", texte: m.texte })), dateJeu: dateJeu(), fiche: s.fiche })).catch(e => console.warn("[Moment à part] Les fils invisibles :", e));
    }
    const g = G();
    if (g && g.definirPrive) g.definirPrive([]);
    pages = null;
    if (window.CAMP_SCENE && window.CAMP_SCENE.ouvrir) window.CAMP_SCENE.ouvrir();
}

// ---------------------------------------------------------------------
//  LA DOUBLE PAGE
// ---------------------------------------------------------------------
function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-fiches page-prive`; el.id = "grimoire-prive-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    pages.d.addEventListener("submit", (e) => { if (!e.target.closest(".saisie-prive")) return; e.preventDefault(); const t = pages.d.querySelector(".texte-prive"); const v = t.value; t.value = ""; son(); envoyer(v); });
    pages.d.addEventListener("keydown", (e) => { if (e.target.classList.contains("texte-prive") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });
    [pages.g, pages.d].forEach(pg => pg.addEventListener("click", (e) => { if (e.target.closest("[data-prive='camp']")) { son(); finir(); } }));
    return pages;
}
function ouvrirPages() {
    const g = G();
    if (!g || !g.definirPrive || !scene) return false;
    const { g: pg, d: pd } = creer();
    g.definirPrive([pg, pd]);
    maj(true);
    const aller = (essai) => { const i = g.indexDe(pg); if (i < 0) { if (essai < 30) setTimeout(() => aller(essai + 1), 100); return; } g.allerALaPage(i); };
    aller(0);
    return true;
}
const htmlTexte = (t) => echapper(t).replace(/\*([^*]+)\*/g, "<i>$1</i>").split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, "<br>")}</p>`).join("");
let signature = "";
function maj(force) {
    if (!pages || !scene) return;
    const s = scene, sig = JSON.stringify([s.id, s.messages.length, s.attente]);
    if (!force && sig === signature) return;
    signature = sig;
    const url = (s.fiche || {}).URL_Cloudinary || "";
    pages.g.innerHTML = `<div class="contenu-page page-prive-gauche">
        <div class="entete-groupe">${lavis(TEINTE, "prive-titre")}<span class="titre-page-fiche">Un moment à part</span></div>${FLEURON}
        <div class="portrait-prive">${url ? `<img src="${echapper(url)}" alt="" draggable="false">` : `<span>${echapper(String(s.nomPnj).slice(0, 1).toUpperCase())}</span>`}</div>
        <div class="nom-prive">${echapper(s.nomPnj)}</div>
        <p class="avec-prive">avec ${echapper(nomHeros(s.heros))}, à l'écart du camp</p>
        <p class="discret-prive">Ce moment n'appartient qu'à toi : les autres joueurs ne le voient pas.</p>
        <button type="button" class="bouton-aquarelle-camp" data-prive="camp">${lavis(TEINTE_CAMP, "prive-camp")}${cadre("prive-camp", 1.4)}<span>⛺ Revenir au camp</span></button>
      </div>`;
    const actif = document.activeElement, enCours = actif && actif.classList && actif.classList.contains("texte-prive") ? actif.value : null;
    pages.d.innerHTML = `<div class="contenu-page page-prive-droite">
        <div class="recit-prive defile-fiche">${s.messages.map(m => `<div class="ligne-prive ${m.qui}">${m.qui === "pj" ? `<b>${echapper(s.heros.prenom || nomHeros(s.heros))}</b> ` : ""}${htmlTexte(m.texte)}</div>`).join("")}
          ${s.attente ? `<div class="ligne-prive mj attente-prive"><span></span><span></span><span></span></div>` : ""}</div>
        <form class="saisie-prive" autocomplete="off">
          <textarea class="texte-prive" rows="3" maxlength="1500" placeholder="Ce que fait et dit ${echapper(s.heros.prenom || nomHeros(s.heros))}…"${s.attente ? " disabled" : ""}></textarea>
          <button type="submit" class="ecrire-prive"${s.attente ? " disabled" : ""}>Écrire</button>
        </form>
      </div>`;
    const r = pages.d.querySelector(".recit-prive");
    if (r) r.scrollTop = r.scrollHeight;
    if (enCours !== null) { const t = pages.d.querySelector(".texte-prive"); if (t) { t.value = enCours; try { t.focus(); } catch (e) {} } }
}

window.RP_PRIVE = { commencer, envoyer, finir, promptMJ, scene: () => (scene ? { ...scene, messages: scene.messages.slice() } : null), pages: () => (pages ? [pages.g, pages.d] : []) };
