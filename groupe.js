// =========================================================================
//  IVALIS — LA COMPAGNIE (v418) : ceux qui suivent le groupe
// =========================================================================
//  Les règles sont dans groupe_pur.js ; ici, la base et le tour du MJ.
//
//    · Systeme_Parties/{partie}.Suiveurs : [{ id (Monde_PNJ), nom, etat
//      ("avec", "laisse", "parti", "renvoye", "mort"), depuis (date en jeu),
//      ts, averti, lieu?, quand?, raison? }] — trois « avec » au plus ;
//    · LES SUIVEURS DANS LA SCÈNE (rejoindreLaScene, appelé par
//      preparerEnvironnement) : où que soit le groupe (même en pleine nature),
//      ses suiveurs sont parmi les PNJ présents (Suiveur: true), et leur place
//      en base suit celle du groupe — laissé en arrière, un suiveur reste donc
//      là où on l'a quitté ;
//    · AVANT LE MJ (avantLeMJ, ia_master.js, après l'Arbitre des dés) : un
//      suiveur mort sort de la compagnie ; un suiveur mécontent prévient, puis
//      s'en va ; une demande d'un héros (« rejoins-nous », « attends-nous ici »,
//      « tu peux partir ») lue par MIA_GROUPE est tranchée par le moteur (au
//      besoin, il demande d'abord un jet de Charisme) ; le Narrateur reçoit LA
//      COMPAGNIE (suiveurs et compagnons du Pisteur) et les décisions à jouer ;
//    · LA DÉFAITE (blessuresDeLaCompagnie, blessures_ui.js) : chaque suiveur et
//      chaque compagnon du Pisteur tire sa blessure.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as GP from "./groupe_pur.js?v=2";

const PARTIES = "Systeme_Parties";
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const sansBalises = (t) => String(t || "").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const dateJeu = () => `Jour ${(window.DATE_EN_JEU_ACTUELLE && window.DATE_EN_JEU_ACTUELLE.jour) || "?"} de l'an ${(window.DATE_EN_JEU_ACTUELLE && window.DATE_EN_JEU_ACTUELLE.annee) || "?"}`;
const journal = (t) => console.log(`[La compagnie] ${t}`);
const memeNom = (a, b) => typeof window.memeNomPNJIvalis === "function" ? window.memeNomPNJIvalis(a, b)
    : (sansAccent(a) === sansAccent(b) || sansAccent(a).split(/\s+/)[0] === sansAccent(b).split(/\s+/)[0]);

// Les héros de la partie (joueurs, actifs).
export function herosDeLaPartie() {
    const l = (window.PERSOS_JOUEURS_PARTIE && window.PERSOS_JOUEURS_PARTIE.length ? window.PERSOS_JOUEURS_PARTIE : window.PERSOS_PARTIE) || [];
    return l.filter(h => h && h.idPersonnage && !h.estMonstre && !h.estIllusion && h.actif !== false);
}
// Les compagnons du Pisteur : { nom, description, caractere, blessures, mort, maitre }.
export function compagnonsDuGroupe(heros) {
    return (heros || herosDeLaPartie()).filter(h => h.compagnon && h.compagnon.nom)
        .map(h => ({ ...h.compagnon, idMaitre: h.idPersonnage, maitre: [h.prenom, h.nom].filter(Boolean).join(" ").trim() || h.prenom || "" }));
}

// -------------------------------------------------------------------------
//  LIRE ET ÉCRIRE LA COMPAGNIE
// -------------------------------------------------------------------------
export async function lireCompagnie(p) {
    if (!p) return [];
    const s = await getDoc(doc(db, PARTIES, p));
    return GP.normaliser(s.exists() ? (s.data() || {}).Suiveurs : []);
}
async function ecrireCompagnie(p, liste) {
    await updateDoc(doc(db, PARTIES, p), { Suiveurs: GP.normaliser(liste) });
}
async function lireFiche(id) {
    try { const s = await getDoc(doc(db, "Monde_PNJ", id)); return s.exists() ? { ...s.data(), idDoc: id } : null; }
    catch (e) { return null; }
}
// La place du groupe, telle qu'une fiche de PNJ la porte (ID_Lieu, ID_Batiment) ; null en pleine nature.
function placeDuGroupe(lieuActuelId, env) {
    if (!lieuActuelId) return null;
    if (lieuActuelId.startsWith("L")) return { ID_Lieu: lieuActuelId, ID_Batiment: "" };
    if (lieuActuelId.startsWith("B")) return { ID_Lieu: (env && env.details && env.details.ID_Lieu) || "", ID_Batiment: lieuActuelId };
    return null;
}

// LES SUIVEURS DANS LA SCÈNE : ajoutés aux PNJ présents, leur place suit le groupe.
export async function rejoindreLaScene(env, lieuActuelId) {
    const p = window.ID_PARTIE_COURANTE;
    if (!p || !env) return env;
    let liste = [];
    try { liste = GP.actifs(await lireCompagnie(p)); } catch (e) { return env; }
    const place = placeDuGroupe(lieuActuelId, env);
    for (const s of liste) {
        const f = await lireFiche(s.id);
        if (!f || f.Statut === "Mort") continue;
        const memoires = f.Memoires_Groupes || {};
        f.Memoires = memoires[p] || f.Memoires || "Aucun souvenir de ce groupe.";
        delete f.Memoires_Groupes;
        f.Suiveur = true;
        if (place && (f.ID_Lieu !== place.ID_Lieu || (f.ID_Batiment || "") !== place.ID_Batiment)) {
            f.ID_Lieu = place.ID_Lieu; f.ID_Batiment = place.ID_Batiment;
            updateDoc(doc(db, "Monde_PNJ", s.id), place).catch(e => console.warn(`[La compagnie] ${s.nom} ne suit pas :`, e));
        }
        if (env.pnjsPresents) env.pnjsPresents[f.Nom_PNJ || s.nom] = f;
    }
    return env;
}

// LA LOYAUTÉ de chaque suiveur (moyenne de ses affinités envers les héros).
async function loyautes(p, ids, heros) {
    const res = {};
    if (!ids.length || !window.SOCIAL || typeof window.SOCIAL.lireLiens !== "function") return res;
    const liens = await window.SOCIAL.lireLiens(p, ids).catch(() => ({}));
    ids.forEach(id => { res[id] = GP.loyaute(heros.map(h => ((liens[`${id}~${h.idPersonnage}`] || {}).axes) || {})); });
    return res;
}

// -------------------------------------------------------------------------
//  MIA_GROUPE : les demandes des héros (rejoindre, renvoyer, attendre ici)
// -------------------------------------------------------------------------
export async function detecterDemandes(o) {
    const cle = (() => { try { return localStorage.getItem("ivalis_GEMINI_API_KEY"); } catch (e) { return ""; } })();
    if (!cle) return [];
    const prompt = `Tu es MIA_GROUPE, l'IA qui tient le registre de la compagnie d'Ivalis (un jeu de rôle). Tu ne racontes rien.
Lis les dernières actions des héros. Relève seulement les DEMANDES EXPLICITES qu'un héros fait à un PNJ, maintenant :
- "recruter" : un héros demande à un PNJ de rejoindre le groupe, de les suivre, de les accompagner (ou accepte clairement l'offre d'un PNJ qui propose de venir) ;
- "renvoyer" : un héros dit à un suiveur de partir, qu'il ne fait plus partie du groupe ;
- "laisser" : un héros demande à un suiveur de rester ici, de les attendre ici.
Les joueurs l'écrivent de mille façons, au tutoiement ou au vouvoiement, parfois avec des fautes : « rejoins-nous », « viens avec nous », « suis-moi », « tu nous accompagnes ? », « fais route avec nous », « deviens notre compagnon », « je t'engage », « on t'emmène » (recruter) ; « tu peux partir », « va-t'en », « nos chemins se séparent », « on n'a plus besoin de toi », « tu es libre », « rentre chez toi » (renvoyer) ; « attends-nous ici », « reste là », « garde le camp, on revient », « je te laisse ici » (laisser). Lis l'intention, pas le mot exact.
Rien pour une simple question sur la route, une conversation, ou une demande d'aide ponctuelle (guider jusqu'à la porte, porter un sac).
PNJ présents (pas encore suiveurs) : ${o.nomsPresents.join(", ") || "(aucun)"}.
Suiveurs actuels : ${o.nomsSuiveurs.join(", ") || "(aucun)"}.
Héros : ${o.nomsHeros.join(", ")}.
Réponds avec l'outil 'demandesCompagnie' (liste vide s'il n'y a aucune demande).`;
    const outils = [{ functionDeclarations: [{
        name: "demandesCompagnie", description: "Les demandes faites à des PNJ au sujet de la compagnie.",
        parameters: { type: "OBJECT", properties: { demandes: { type: "ARRAY", items: { type: "OBJECT", properties: {
            type: { type: "STRING", enum: ["recruter", "renvoyer", "laisser"] },
            pnj: { type: "STRING", description: "Le nom du PNJ, tel qu'écrit dans les listes." },
            heros: { type: "STRING", description: "Le prénom du héros qui fait la demande." } }, required: ["type", "pnj", "heros"] } } }, required: ["demandes"] }
    }] }];
    try {
        const corps = JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: o.texte }] }],
            tools: outils, toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["demandesCompagnie"] } }, generationConfig: { temperature: 0 } });
        const rep = typeof window.fetchGemini === "function"
            ? await window.fetchGemini("groupe", corps, { modele: "gemini-flash-lite-latest" })
            : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cle}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: corps });
        const data = await rep.json();
        const appel = ((data.candidates?.[0]?.content?.parts) || []).find(x => x.functionCall && x.functionCall.name === "demandesCompagnie");
        return (appel && appel.functionCall.args && Array.isArray(appel.functionCall.args.demandes)) ? appel.functionCall.args.demandes : [];
    } catch (e) { console.warn("[MIA_GROUPE] Lecture impossible :", e); return []; }
}

// -------------------------------------------------------------------------
//  AVANT LE MJ
// -------------------------------------------------------------------------
const ATTACHES = new Set(["famille", "amour", "amant", "patron", "employé", "mentor", "élève"]);
// `o` : { messages, env, demanderJets(jets) }. Rend { attendre, contexte }.
export async function avantLeMJ(o) {
    const p = window.ID_PARTIE_COURANTE;
    const vide = { attendre: false, contexte: "" };
    if (!p) return vide;
    const heros = herosDeLaPartie();
    const env = (o && o.env) || { pnjsPresents: {} };
    let liste = await lireCompagnie(p);
    const avant = JSON.stringify(liste);
    const decisions = [];

    // 1. LES MORTS sortent de la compagnie.
    for (const s of GP.actifs(liste)) {
        const f = await lireFiche(s.id);
        if (f && f.Statut === "Mort") { liste = GP.appliquer(liste, { type: "mort", id: s.id, quand: dateJeu() }); journal(`${s.nom} est mort : il quitte la compagnie.`); }
    }

    // 2. LES DEMANDES des héros, depuis la dernière narration.
    const messages = ((o && o.messages) || []).slice().sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
    let debut = -1;
    messages.forEach((m, i) => { if (m && m.Est_Narration_IA) debut = i; });
    const depuis = messages.slice(debut + 1);
    const idsHeros = new Set(heros.map(h => h.idPersonnage));
    const actions = depuis.filter(m => idsHeros.has(m.Auteur_ID) && !GP.lireJet(m.Texte) && sansBalises(m.Texte_Livre || m.Texte));
    const presents = Object.values(env.pnjsPresents || {}).filter(f => f && f.idDoc && f.Statut !== "Mort");
    const jets = [], actionsCompagnie = [];
    if (actions.some(m => GP.parleDuGroupe(sansBalises(m.Texte_Livre || m.Texte)))) {
        const actifsNoms = GP.actifs(liste).map(s => s.nom);
        const demandes = await GROUPE.detecterDemandes({
            texte: actions.map(m => `${m.Auteur_Nom} : ${sansBalises(m.Texte_Livre || m.Texte)}`).join("\n"),
            nomsPresents: presents.filter(f => !f.Suiveur).map(f => f.Nom_PNJ), nomsSuiveurs: actifsNoms, nomsHeros: heros.map(h => h.prenom)
        });
        const ames = window.SOCIAL && typeof window.SOCIAL.lireAmes === "function" ? await window.SOCIAL.lireAmes(p, presents.map(f => f.idDoc)).catch(() => ({})) : {};
        const liens = window.SOCIAL && typeof window.SOCIAL.lireLiens === "function" ? await window.SOCIAL.lireLiens(p, presents.map(f => f.idDoc)).catch(() => ({})) : {};
        for (const d of (demandes || [])) {
            const f = presents.find(x => memeNom(x.Nom_PNJ, d.pnj || ""));
            const h = heros.find(x => x.prenom && sansAccent(x.prenom) === sansAccent(String(d.heros || "").split(/\s+/)[0])) || null;
            if (!f) continue;
            const nomH = h ? h.prenom : "un héros";
            const suiveur = GP.actifs(liste).some(s => s.id === f.idDoc);
            if (d.type === "recruter") {
                if (!h) continue;
                const lien = (vers) => (liens[`${f.idDoc}~${vers}`] || {});
                const autres = [...heros.filter(x => x.idPersonnage !== h.idPersonnage).map(x => x.idPersonnage), ...GP.actifs(liste).map(s => s.id)];
                const attache = Object.values(liens).some(l => l.de === f.idDoc && !idsHeros.has(l.vers) && !GP.actifs(liste).some(s => s.id === l.vers) && ATTACHES.has(String(l.etiquette || "").toLowerCase()));
                const jetFait = depuis.filter(m => m.Auteur_ID === h.idPersonnage).map(m => GP.lireJet(m.Texte)).filter(j => j && sansAccent(j.carac) === "charisme").pop() || null;
                const verdict = GP.deciderRecrutement({
                    axesDemandeur: lien(h.idPersonnage).axes || {}, affAutres: autres.map(id => window.SOCIAL.affinite(lien(id).axes || {})),
                    traits: ((ames[f.idDoc] || {}).psyche || {}).traits || {}, attache, nbSuiveurs: GP.actifs(liste).length, dejaSuiveur: suiveur, jet: jetFait
                });
                journal(`${nomH} demande à ${f.Nom_PNJ} de suivre la compagnie : ${verdict.verdict} (score ${verdict.score}${verdict.dd ? `, difficulté ${verdict.dd}` : ""}) — ${verdict.raison}.`);
                if (verdict.verdict === "jet") {
                    jets.push({ idPerso: h.idPersonnage, heros: h.prenom, caracteristique: "CHARISME", difficulte: GP.motDifficulte(verdict.dd), action: `convaincre ${f.Nom_PNJ} de rejoindre la compagnie` });
                } else if (verdict.verdict === "oui") {
                    actionsCompagnie.push({ type: "recruter", id: f.idDoc, nom: f.Nom_PNJ, depuis: dateJeu(), ts: Date.now() });
                    decisions.push(`${f.Nom_PNJ} ACCEPTE de rejoindre la compagnie (demandé par ${nomH} : ${verdict.raison}). Joue son acceptation ; désormais il voyage avec les héros.`);
                } else if (verdict.verdict === "non") {
                    decisions.push(`${f.Nom_PNJ} REFUSE de suivre la compagnie (demandé par ${nomH} : ${verdict.raison}). Joue ce refus avec son caractère, sans le changer.`);
                }
            } else if (suiveur && (d.type === "renvoyer" || d.type === "laisser")) {
                actionsCompagnie.push({ type: d.type, id: f.idDoc, quand: dateJeu(), lieu: (env.details && (env.details.Nom_Du_Lieu || env.details.Nom_Batiment)) || "", raison: d.type === "renvoyer" ? `renvoyé par ${nomH}` : `prié d'attendre par ${nomH}` });
                decisions.push(d.type === "renvoyer"
                    ? `${f.Nom_PNJ} est RENVOYÉ par ${nomH} : il quitte la compagnie et reste ici. Joue la séparation avec son caractère.`
                    : `${f.Nom_PNJ} RESTE ICI à attendre la compagnie (demandé par ${nomH}) : il ne suit plus le groupe et restera dans ce lieu.`);
            }
        }
    }
    // Un jet de Charisme à faire d'abord : l'Arbitre le demande, rien ne change encore.
    if (jets.length) {
        if (o && typeof o.demanderJets === "function") await o.demanderJets(jets);
        return { attendre: true, contexte: "" };
    }
    actionsCompagnie.forEach(a => { liste = GP.appliquer(liste, a); });

    // 3. LES MÉCONTENTS préviennent, puis s'en vont.
    const restants = GP.actifs(liste);
    const loy = await loyautes(p, restants.map(s => s.id), heros);
    for (const s of restants) {
        const v = loy[s.id] || 0, verdict = GP.verdictDepart({ loyaute: v, averti: s.averti });
        if (verdict === "partir") {
            liste = GP.appliquer(liste, { type: "partir", id: s.id, quand: dateJeu(), lieu: (env.details && (env.details.Nom_Du_Lieu || env.details.Nom_Batiment)) || "", raison: "il est parti de lui-même" });
            decisions.push(`${s.nom} QUITTE LA COMPAGNIE de lui-même (loyauté ${v} : ${GP.motLoyaute(v)}). Raconte son départ dans la scène, avec ce qu'il reproche aux héros ; il reste ici.`);
            journal(`${s.nom} s'en va (loyauté ${v}).`);
        } else if (verdict === "avertir") {
            liste = GP.avertir(liste, s.id, true);
            decisions.push(`${s.nom} est MÉCONTENT (loyauté ${v}) : qu'il le fasse clairement sentir aux héros, comme un avertissement — il partira si rien ne change.`);
            journal(`${s.nom} prévient (loyauté ${v}).`);
        } else if (verdict === "apaise") liste = GP.avertir(liste, s.id, false);
    }
    if (JSON.stringify(liste) !== avant) {
        try { await ecrireCompagnie(p, liste); } catch (e) { console.error("[La compagnie] Écriture impossible :", e); }
    }
    return { attendre: false, contexte: contexteDuNarrateur(liste, loy, heros, decisions, env) };
}

// LA COMPAGNIE, telle que le Narrateur la lit.
export function contexteDuNarrateur(liste, loy, heros, decisions, env) {
    const actifs = GP.actifs(liste);
    const compagnons = compagnonsDuGroupe(heros).filter(c => !c.mort);
    let t = "";
    if (actifs.length || compagnons.length) {
        t += `\n--- LA COMPAGNIE (ceux qui voyagent avec les héros) ---\n`;
        t += `Ils suivent les héros partout et font partie de chaque scène : fais-les vivre (une réplique, un geste, un avis), selon leur caractère et leurs sentiments, sans voler la vedette aux héros. S'il y a de la bagarre, ils combattent SEULEMENT dans le récit (jamais dans le combat tactique du jeu).\n`;
        actifs.forEach(s => {
            const f = Object.values((env && env.pnjsPresents) || {}).find(x => x && x.idDoc === s.id) || {};
            const v = (loy || {})[s.id];
            t += `- ${s.nom}${f.Occupation ? ` (${f.Occupation})` : ""} : suiveur${s.depuis ? ` depuis le ${s.depuis}` : ""}${Number.isFinite(v) ? ` — ${GP.motLoyaute(v)} envers les héros (${v})` : ""}${(f.Blessures || []).length ? ` — blessé (${(f.Blessures || []).map(b => (window.blessureParId && (window.blessureParId(b.id) || {}).nom) || b.id).join(", ")})` : ""}.\n`;
        });
        compagnons.forEach(c => {
            t += `- ${c.nom} : le compagnon animal de ${c.maitre} (Pisteur)${c.description ? ` — ${c.description}` : ""}${c.caractere ? ` — caractère : ${c.caractere}` : ""}${(c.blessures || []).length ? ` — blessé (${c.blessures.map(b => (window.blessureParId && (window.blessureParId(b.id) || {}).nom) || b.id).join(", ")})` : ""}. Il obéit à son maître mais garde son caractère ; fais-le réagir dans la scène.\n`;
        });
    }
    if (decisions && decisions.length) {
        t += `\n--- DÉCISIONS DE LA COMPAGNIE (tranchées par le jeu : joue-les telles quelles) ---\n`;
        t += decisions.map(d => `- ${d}`).join("\n") + "\n";
    }
    return t;
}

// -------------------------------------------------------------------------
//  RENVOYER DEPUIS LE LIVRE (la page du Groupe)
// -------------------------------------------------------------------------
export async function renvoyer(id) {
    const p = window.ID_PARTIE_COURANTE;
    if (!p || !id) return false;
    const liste = await lireCompagnie(p);
    if (!GP.actifs(liste).some(s => s.id === id)) return false;
    await ecrireCompagnie(p, GP.appliquer(liste, { type: "renvoyer", id, quand: dateJeu(), raison: "renvoyé par le groupe" }));
    return true;
}

// -------------------------------------------------------------------------
//  LA DÉFAITE : les blessures de la compagnie (blessures_ui.js)
// -------------------------------------------------------------------------
const SANS_RETRAIT = { modCon: 0, chanceux: 0, veinard: 0, total: 0 };
function tirage(alea) {
    const t = window.tirerBlessures({}, alea, SANS_RETRAIT);
    return t.tirages.map(x => { const b = window.blessureParId(x.id) || {}; return { id: x.id, nom: b.nom || x.id, texte: b.texte || "", de: x.de, score: x.score }; });
}
// Tire une blessure pour chaque suiveur et chaque compagnon du Pisteur. Rend
// { [cle]: { nom, type: "suiveur" | "compagnon", id, tirages } } (sans rien écrire).
export async function tirerBlessuresCompagnie(alea) {
    const p = window.ID_PARTIE_COURANTE, res = {};
    if (!p || typeof window.tirerBlessures !== "function") return res;
    const hasard = typeof alea === "function" ? alea : Math.random;
    (await lireCompagnie(p).catch(() => [])).filter(s => s.etat === "avec").forEach(s => {
        res["PNJ_" + s.id] = { nom: s.nom, type: "suiveur", id: s.id, tirages: tirage(hasard) };
    });
    compagnonsDuGroupe(herosDeLaPartie()).filter(c => !c.mort).forEach(c => {
        res["COMPAGNON_" + c.idMaitre] = { nom: c.nom, type: "compagnon", id: c.idMaitre, maitre: c.maitre, tirages: tirage(hasard) };
    });
    return res;
}
// Écrit ces blessures : la fiche du PNJ (Blessures, Statut « Mort » ; la
// compagnie le sait), la fiche du maître pour un compagnon (Compagnon_Blessures, Compagnon_Mort).
export async function ecrireBlessuresCompagnie(blessures, alea) {
    const p = window.ID_PARTIE_COURANTE;
    if (!p || !blessures) return;
    const hasard = typeof alea === "function" ? alea : Math.random;
    let liste = null;
    for (const b of Object.values(blessures)) {
        const mort = (b.tirages || []).some(x => x.id === "BLE_MORT");
        const nouvelles = (b.tirages || []).map(x => window.entreeBlessure(x.id, [], hasard)).filter(Boolean);
        try {
            if (b.type === "suiveur") {
                const f = await lireFiche(b.id);
                const anciennes = window.blessuresApresCombat ? window.blessuresApresCombat((f && f.Blessures) || []) : ((f && f.Blessures) || []);
                await updateDoc(doc(db, "Monde_PNJ", b.id), { Blessures: [...anciennes, ...nouvelles], ...(mort ? { Statut: "Mort" } : {}) });
                if (mort) {
                    liste = GP.appliquer(liste || await lireCompagnie(p), { type: "mort", id: b.id, quand: dateJeu(), raison: "tombé au combat" });
                    if (window.SOCIAL && typeof window.SOCIAL.marquerMort === "function") window.SOCIAL.marquerMort(p, b.id).catch(() => {});
                }
            } else if (b.type === "compagnon") {
                const h = herosDeLaPartie().find(x => x.idPersonnage === b.id);
                if (!h || !h.compagnon) continue;
                const anciennes = window.blessuresApresCombat ? window.blessuresApresCombat(h.compagnon.blessures || []) : (h.compagnon.blessures || []);
                h.compagnon.blessures = [...anciennes, ...nouvelles];
                if (mort) h.compagnon.mort = true;
                // Les deux listes de la partie portent le même compagnon.
                [window.PERSOS_PARTIE, window.PERSOS_JOUEURS_PARTIE].forEach(l => (l || []).forEach(x => { if (x && x !== h && x.idPersonnage === h.idPersonnage && x.compagnon) { x.compagnon.blessures = h.compagnon.blessures; x.compagnon.mort = !!h.compagnon.mort; } }));
                await updateDoc(doc(db, "Personnages", b.id), { Compagnon_Blessures: h.compagnon.blessures, Compagnon_Mort: !!h.compagnon.mort });
            }
        } catch (e) { console.error(`[La compagnie] Blessures de ${b.nom} :`, e); }
    }
    if (liste) await ecrireCompagnie(p, liste).catch(e => console.error("[La compagnie] Écriture impossible :", e));
}

// -------------------------------------------------------------------------
//  POUR LE LIVRE : la compagnie, prête à être dessinée
// -------------------------------------------------------------------------
export async function etatPourLeLivre() {
    const p = window.ID_PARTIE_COURANTE;
    if (!p) return { suiveurs: [], compagnons: [] };
    const heros = herosDeLaPartie();
    const liste = await lireCompagnie(p);
    const fiches = {};
    for (const s of liste) fiches[s.id] = await lireFiche(s.id);
    const loy = await loyautes(p, liste.map(s => s.id), heros);
    const ames = window.SOCIAL && typeof window.SOCIAL.lireAmes === "function" ? await window.SOCIAL.lireAmes(p, liste.map(s => s.id)).catch(() => ({})) : {};
    // L'humeur du moment (celle que le MJ lit) : le tour social en cours.
    let tour = 1;
    try { const e = await getDoc(doc(db, PARTIES, p, "Social", "etat")); tour = Number(((e.exists() && e.data()) || {}).tour || 0) + 1; } catch (e) {}
    const suiveurs = liste.map(s => {
        const f = fiches[s.id] || {};
        const a = ames[s.id] || null;
        const h = a && window.SOCIAL && typeof window.SOCIAL.humeurActive === "function" ? window.SOCIAL.humeurActive(a, tour) : null;
        const etat = f.Statut === "Mort" ? "mort" : s.etat;
        return { ...s, etat, fiche: f, loyaute: loy[s.id] || 0, motLoyaute: GP.motLoyaute(loy[s.id] || 0),
                 humeur: h ? (window.SOCIAL.NOMS_EMOTIONS[h.emotion] || h.emotion) : "calme",
                 blesse: (f.Blessures || []).length > 0 };
    });
    return { suiveurs, compagnons: compagnonsDuGroupe(heros), lieu: await lieuDuGroupe(p) };
}
// Où est le groupe, et ce qu'on y pense de lui (la réputation locale, de −10 à +10).
async function lieuDuGroupe(p) {
    const id = (window.PARTIE_DATA && window.PARTIE_DATA.Lieu_Actuel) || "";
    if (!id) return { nom: "", nature: true, reputation: null, tags: [] };
    try {
        let nom = "", idLieu = id;
        if (id.startsWith("B")) {
            const b = await getDoc(doc(db, "Monde_Batiment", id));
            const bd = b.exists() ? b.data() : {};
            nom = bd.Nom_Batiment || ""; idLieu = bd.ID_Lieu || "";
        }
        const l = idLieu ? await getDoc(doc(db, "Monde_Lieux", idLieu)) : null;
        const ld = l && l.exists() ? l.data() : {};
        const rep = (ld.Reputations || {})[p] || {};
        return { nom: nom ? `${nom}${ld.Nom_Du_Lieu ? `, ${ld.Nom_Du_Lieu}` : ""}` : (ld.Nom_Du_Lieu || ""), nature: false,
                 reputation: Number.isFinite(Number(rep.Score)) ? Number(rep.Score) : 0, tags: rep.Tags || [] };
    } catch (e) { return { nom: "", nature: false, reputation: null, tags: [] }; }
}

const GROUPE = { ...GP, herosDeLaPartie, compagnonsDuGroupe, lireCompagnie, rejoindreLaScene, detecterDemandes, avantLeMJ, contexteDuNarrateur,
                 renvoyer, tirerBlessuresCompagnie, ecrireBlessuresCompagnie, etatPourLeLivre };
window.GROUPE = GROUPE;
