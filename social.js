// =========================================================================
//  IVALIS — LES ÂMES EN BASE (v411) — « LES FILS INVISIBLES », LOT 2
// =========================================================================
//  Le moteur pur (social_pur.js) calcule ; ce module lit et écrit ce qu'il
//  calcule, pour la partie en cours, sous Systeme_Parties/{partie}/ :
//
//    · Ames/{id}      une âme par PNJ (id = sa fiche Monde_PNJ) ou héros (id =
//                     idPersonnage) : { id, type, nom, ref, psyche, humeur,
//                     statut }. Le jour où un héros deviendra PNJ, son âme garde
//                     son identifiant : seul son type change.
//    · Liens/{de~vers} un lien orienté : { de, vers, axes, origine
//                     ("preexistant" | "rencontre"), etiquette, histoire }.
//    · Evenements_Sociaux/{n} ce qui a fait bouger un chiffre (v412) : type,
//                     acteur, cible, témoins, gravité, la phrase, les écarts.
//    · Souvenirs/{id} les souvenirs datés d'une âme (v412).
//    · Social/etat    le compteur des réponses du MJ (`tour`), la mémoire courte
//                     (lassitude), les messages déjà lus (jamais deux fois).
//
//  Une âme naît avec sa fiche (MIA_CASTING, MIA_PNJ : `naissancePnj`), avec sa
//  personnalité et ses liens d'avant la rencontre (seulement avec des PNJ déjà
//  créés dans ce lieu). Une fiche sans âme (née ailleurs, ou d'avant la
//  refonte) et chaque héros la reçoivent la première fois qu'ils sont dans une
//  scène (`assurerAmes`, MIA_AME). Un PNJ qui découvre un héros s'en fait une
//  première impression (la réputation du lieu, sa personnalité).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as P from "./social_pur.js?v=7";

const PARTIES = "Systeme_Parties";
const refAme = (p, id) => doc(db, PARTIES, p, "Ames", id);
const refLien = (p, de, vers) => doc(db, PARTIES, p, "Liens", P.cleLien(de, vers));
const colLiens = (p) => collection(db, PARTIES, p, "Liens");
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const memeNom = (a, b) => (typeof window.memeNomPNJIvalis === "function" ? window.memeNomPNJIvalis(a, b) : sansAccent(a) === sansAccent(b));
const par = (liste, n) => { const r = []; for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n)); return r; };
const journal = (...a) => console.log("🧠 [Fils invisibles]", ...a);

// -------------------------------------------------------------------------
//  LIRE
// -------------------------------------------------------------------------
export async function lireAmes(p, ids) {
    const ames = {};
    await Promise.all([...new Set(ids || [])].filter(Boolean).map(async id => {
        const s = await getDoc(refAme(p, id));
        if (s.exists()) ames[id] = { ...s.data(), id };
    }));
    return ames;
}
// Les liens qui partent de ces âmes (`de` parmi `ids`).
export async function lireLiens(p, ids) {
    const liens = {};
    for (const bloc of par([...new Set(ids || [])].filter(Boolean), 30)) {
        const s = await getDocs(query(colLiens(p), where("de", "in", bloc)));
        s.forEach(d => { const x = d.data(); liens[P.cleLien(x.de, x.vers)] = x; });
    }
    return liens;
}
// Les liens qui arrivent sur ces âmes (« ce que les autres pensent de lui »).
export async function lireLiensVers(p, ids) {
    const liens = {};
    for (const bloc of par([...new Set(ids || [])].filter(Boolean), 30)) {
        const s = await getDocs(query(colLiens(p), where("vers", "in", bloc)));
        s.forEach(d => { const x = d.data(); liens[P.cleLien(x.de, x.vers)] = x; });
    }
    return liens;
}

// -------------------------------------------------------------------------
//  CE QUE L'IA REMPLIT À LA CRÉATION D'UN PNJ (MIA_CASTING, MIA_PNJ)
// -------------------------------------------------------------------------
// Les liens d'avant la rencontre, tels que l'IA les nomme, et leur sens :
// [type du moteur, le nouveau est-il A ?]. « patron_de » : le nouveau est le
// patron de l'autre.
export const LIENS_IA = {
    famille: ["famille", true], ami: ["ami", true], amour: ["amant", true], voisin: ["voisin", true],
    rival: ["rival", true], ennemi: ["ennemi", true],
    patron_de: ["patron", true], employe_de: ["patron", false], mentor_de: ["mentor", true], eleve_de: ["mentor", false],
    creancier_de: ["creancier", true], debiteur_de: ["creancier", false]
};
const PROPRIETES_PSYCHE = {
    ...Object.fromEntries(P.TRAITS.map(t => [t, { type: "NUMBER", description: `${P.NOMS_TRAITS[t]}, de 0 à 100.` }])),
    valeurs: { type: "ARRAY", items: { type: "STRING", enum: P.VALEURS }, description: "1 à 3 valeurs, la plus importante d'abord." },
    objectifs: { type: "ARRAY", items: { type: "STRING" }, description: "1 à 3 buts concrets, actuels." },
    faille: { type: "STRING", description: "Une faiblesse, une peur ou une limite." },
    masque: { type: "STRING", description: "Comment il se montre en public, s'il cache ce qu'il ressent." }
};
export const schemaPsyche = () => ({ type: "OBJECT", description: "Sa personnalité (stable).", properties: PROPRIETES_PSYCHE });
// (v460) Sa disposition de départ envers les héros (social_pur.js, DISPOSITIONS ; le hasard s'en mêle à sa naissance).
const DESCRIPTION_DISPOSITION = "Son a priori envers les héros à leur première rencontre, d'après son background, son métier et la scène où il apparaît : mefiant, reserve, neutre, bienveillant ou chaleureux.";
export const schemaDisposition = () => ({ type: "STRING", enum: Object.keys(P.DISPOSITIONS), description: DESCRIPTION_DISPOSITION });
export const schemaRaisonDisposition = () => ({ type: "STRING", description: "Une courte phrase : pourquoi cet a priori." });
// La disposition d'une âme qui naît : celle de l'IA, puis le tirage (sympathique de nature, mauvais a priori).
export function dispositionDeNaissance(motIA, raison) {
    const d = P.tirerDisposition(motIA, Math.random());
    return { ...d, raison: String(raison || "").slice(0, 200) };
}
export const schemaLiens = () => ({
    type: "ARRAY", description: "0 à 3 liens qu'il a DÉJÀ avec des personnages de la liste des PNJ du lieu (jamais avec un héros, jamais un nom hors de la liste).",
    items: { type: "OBJECT", properties: { nom: { type: "STRING" }, type: { type: "STRING", enum: Object.keys(LIENS_IA) }, histoire: { type: "STRING", description: "Une phrase : ce qui les lie." } }, required: ["nom", "type"] }
});
export function consigneCreation(nomsDuLieu) {
    const noms = (nomsDuLieu || []).filter(Boolean);
    return `\nÂME (v411) : donne à chacun une personnalité (psyche) : six traits de 0 à 100 (varie-les franchement, pas 50 partout), 1 à 3 valeurs parmi ${P.VALEURS.join(", ")}, 1 à 3 objectifs concrets, une faille, un masque public.`
        + `\nA PRIORI ENVERS LES HÉROS (v460) : « disposition_heros » (mefiant, reserve, neutre, bienveillant, chaleureux), d'après son background, son métier et la scène où il apparaît (une aubergiste qui accueille des voyageurs : bienveillante ; un garde en pleine alerte : méfiant ; un marchand : neutre ou bienveillant…), avec « disposition_raison » en une phrase. Varie : pas neutre partout.`
        + (noms.length ? `\nLIENS D'AVANT (v411) : s'il le faut, 0 à 3 liens existants avec des PNJ DÉJÀ PRÉSENTS dans ce lieu, et seulement eux : ${JSON.stringify(noms)} (famille, ami, amour, voisin, rival, ennemi, patron_de, employe_de, mentor_de, eleve_de, creancier_de, debiteur_de). Le plus souvent, aucun ou un seul.`
                       : `\nLIENS D'AVANT : aucun PNJ n'est encore créé dans ce lieu ; laisse « liens » vide.`);
}
// La psyché telle que l'IA la donne (traits à plat) → celle du moteur.
export function psycheDeLIA(x) {
    if (!x || typeof x !== "object") return null;
    const traits = Object.fromEntries(P.TRAITS.filter(t => x[t] !== undefined || (x.traits && x.traits[t] !== undefined)).map(t => [t, x[t] !== undefined ? x[t] : x.traits[t]]));
    if (!Object.keys(traits).length) return null;
    return P.psycheValide({ traits, valeurs: x.valeurs, objectifs: x.objectifs, faille: x.faille, masque: x.masque, style: x.style });
}

// Les PNJ de la partie, au lieu donné (et dans ses bâtiments), sauf `sauf`.
async function pnjDuLieu(p, idLieu, sauf) {
    if (!idLieu) return [];
    const s = await getDocs(query(collection(db, "Monde_PNJ"), where("ID_Lieu", "==", idLieu)));
    const liste = [];
    s.forEach(d => { const x = d.data() || {}; if (d.id !== sauf && x.ID_Partie === p && x.Statut !== "Mort") liste.push({ id: d.id, ...x }); });
    return liste;
}

// LA NAISSANCE D'UN PNJ : son âme et ses liens d'avant (seulement avec un PNJ
// déjà créé dans ce lieu, de cette partie ; un nom inconnu est ignoré).
export async function naissancePnj(p, idPnj, fiche, options) {
    if (!p || !idPnj || !fiche) return null;
    const psyche = psycheDeLIA(fiche.psyche);
    if (!psyche) return null;   // sans personnalité : MIA_AME la donnera à sa première scène
    psyche.style = String(fiche.style_parole || psyche.style || "").slice(0, 200);
    const disposition = dispositionDeNaissance(fiche.disposition_heros, fiche.disposition_raison);
    const ame = { id: idPnj, type: "pnj", nom: fiche.nom || "", ref: idPnj, psyche, disposition, humeur: null, statut: "vivant", Version: P.VERSION_SOCIAL, Cree_Le: Date.now() };
    const lot = writeBatch(db);
    lot.set(refAme(p, idPnj), ame);
    const crees = [];
    const voisins = await pnjDuLieu(p, (options || {}).idLieu, idPnj);
    (Array.isArray(fiche.liens) ? fiche.liens : []).slice(0, 3).forEach(l => {
        const sens = LIENS_IA[String(l && l.type || "").toLowerCase()];
        const autre = voisins.find(v => memeNom(l && l.nom, v.Nom_PNJ));
        if (!sens || !autre || crees.some(c => c.autre === autre.id)) return;
        const [A, B] = sens[1] ? [idPnj, autre.id] : [autre.id, idPnj];
        const r = P.liensPreexistants(sens[0], A, B);
        const histoire = String(l.histoire || "").slice(0, 200);
        lot.set(refLien(p, A, B), { de: A, vers: B, axes: r.ab, origine: "preexistant", etiquette: r.etiquetteAB, histoire, majLe: Date.now(), derniers: [] });
        lot.set(refLien(p, B, A), { de: B, vers: A, axes: r.ba, origine: "preexistant", etiquette: r.etiquetteBA, histoire, majLe: Date.now(), derniers: [] });
        crees.push({ autre: autre.id, nom: autre.Nom_PNJ, type: sens[0] });
    });
    await lot.commit();
    journal(`${fiche.nom} reçoit son âme (a priori : ${P.NOMS_DISPOSITIONS[String(disposition.niveau)]}${disposition.nature ? `, ${disposition.nature === "sympathique" ? "sympathique de nature" : "mauvais a priori"}` : ""})${crees.length ? ` et ${crees.length} lien(s) d'avant : ${crees.map(c => `${c.nom} (${c.type})`).join(", ")}` : ""}.`);
    return { ame, liens: crees };
}

// -------------------------------------------------------------------------
//  MIA_AME : la personnalité de ceux qui n'en ont pas encore
// -------------------------------------------------------------------------
// (v460) `dispositions` : rempli avec l'a priori des PNJ envers les héros ({ id: { mot, raison } }).
async function demanderAmes(personnages, dispositions = {}) {
    if (!personnages.length || typeof window.fetchGemini !== "function") return {};
    const systeme = `Tu es MIA_AME : tu donnes une âme aux personnages d'Ivalis (Antiquité magique, mythologie).
Pour chacun, d'après sa fiche, une personnalité stable : six traits de 0 à 100 (prudence, impulsivite, loyaute, empathie, orgueil, sociabilite — varie-les franchement, pas 50 partout), 1 à 3 valeurs parmi ${P.VALEURS.join(", ")} (la plus importante d'abord), 1 à 3 objectifs concrets, une faille, un masque public.
Pour un héros (joué par un joueur), reste prudent : une estimation d'après sa fiche, qui se précisera avec ses actes.
Pour un PNJ, ajoute aussi son a priori envers les héros (disposition_heros : mefiant, reserve, neutre, bienveillant, chaleureux) d'après son background et son métier, et disposition_raison en une phrase. Varie : pas neutre partout.
Utilise l'outil 'donnerAmes', une entrée par personnage, avec son nom exact.`;
    const outils = [{ functionDeclarations: [{ name: "donnerAmes", description: "La personnalité de chaque personnage.",
        parameters: { type: "OBJECT", properties: { ames: { type: "ARRAY", items: { type: "OBJECT", properties: { nom: { type: "STRING" }, ...PROPRIETES_PSYCHE,
            disposition_heros: schemaDisposition(), disposition_raison: schemaRaisonDisposition() }, required: ["nom"] } } }, required: ["ames"] } }] }];
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: systeme }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(personnages) }] }],
        tools: outils, toolConfig: { functionCallingConfig: { mode: "ANY" } }, generationConfig: { temperature: 0.9 } });
    try {
        const rep = await window.fetchGemini("social", corps);
        const data = await rep.json();
        const appel = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).find(x => x.functionCall && x.functionCall.name === "donnerAmes");
        const rendu = {};
        ((appel && appel.functionCall.args && appel.functionCall.args.ames) || []).forEach(a => {
            const qui = personnages.find(x => memeNom(x.nom, a && a.nom));
            const psyche = psycheDeLIA(a);
            if (qui && psyche) rendu[qui.id] = psyche;
            if (qui && a.disposition_heros) dispositions[qui.id] = { mot: a.disposition_heros, raison: a.disposition_raison || "" };
        });
        return rendu;
    } catch (e) { console.warn("[MIA_AME] Personnalités impossibles (valeurs moyennes) :", e); return {}; }
}

export const FAMILIARITE_COMPAGNONS = 40;
// LES ÂMES DE LA SCÈNE : chaque PNJ présent (`pnjs` : [{ id, fiche }]) et
// chaque héros (`heros` : les fiches de la partie) a son âme ; un PNJ qui
// découvre un héros s'en fait une première impression. Rend { ames, liens }
// (les liens qui partent des présents).
export async function assurerAmes(o) {
    const p = o && o.idPartie;
    if (!p) return { ames: {}, liens: {} };
    const pnjs = (o.pnjs || []).filter(x => x && x.id);
    const heros = (o.heros || []).filter(h => h && h.idPersonnage && h.prenom);
    const ids = [...pnjs.map(x => x.id), ...heros.map(h => h.idPersonnage)];
    const ames = await lireAmes(p, ids);
    const manquants = [
        ...pnjs.filter(x => !ames[x.id]).map(x => ({ id: x.id, type: "pnj", nom: x.fiche.Nom_PNJ, fiche: { occupation: x.fiche.Occupation || "", race: x.fiche.Race || "", physique: String(x.fiche.Description_Physique || "").slice(0, 300), secret: x.fiche.Secret_Mental || "", parole: x.fiche.Style_De_Parole || "" } })),
        ...heros.filter(h => !ames[h.idPersonnage]).map(h => ({ id: h.idPersonnage, type: "heros", nom: h.prenom, fiche: { nom: `${h.prenom} ${h.nom || ""}`.trim(), genre: h.genre || "", race: h.race || "", classe: h.classe || "", age: h.age || "", signes: h.signes || "", secret: h.secret || "", histoire: String(h.histoire || h.Histoire || h.background || "").slice(0, 400) } }))
    ].slice(0, 10);
    const lot = writeBatch(db);
    let ecrits = 0;
    if (manquants.length) {
        const dispositions = {};
        const psyches = await demanderAmes(manquants.map(m => ({ id: m.id, nom: m.nom, type: m.type === "heros" ? "héros" : "PNJ", fiche: m.fiche })), dispositions);
        manquants.forEach(m => {
            const psyche = psyches[m.id] || P.psycheValide({});
            if (m.type === "pnj") psyche.style = String(m.fiche.parole || "").slice(0, 200);
            const ame = { id: m.id, type: m.type, nom: m.nom, ref: m.id, psyche, humeur: null, statut: "vivant", Version: P.VERSION_SOCIAL, Cree_Le: Date.now(), ...(psyches[m.id] ? {} : { Psyche_Par_Defaut: true }),
                          ...(m.type === "pnj" ? { disposition: dispositionDeNaissance((dispositions[m.id] || {}).mot, (dispositions[m.id] || {}).raison) } : {}) };
            ames[m.id] = ame; lot.set(refAme(p, m.id), ame); ecrits++;
        });
        journal(`MIA_AME : ${manquants.map(m => m.nom).join(", ")} reçoi${manquants.length > 1 ? "vent" : "t"} une âme.`);
    }
    const liens = await lireLiens(p, ids);
    // (v417) LES COMPAGNONS DE ROUTE. Nico : « les héros ne connaissent pas, dans le
    // réseau, les autres membres du groupe : mets-leur des relations neutres de
    // base ». Deux héros de la partie sans lien : un lien neutre (aucun axe, une
    // familiarité de compagnons), étiqueté « compagnon ». Le moteur ne le fait pas
    // bouger (pas de relation chiffrée entre héros : les joueurs décident).
    heros.forEach(a => heros.forEach(b => {
        if (a.idPersonnage === b.idPersonnage) return;
        const k = P.cleLien(a.idPersonnage, b.idPersonnage);
        if (liens[k]) return;
        liens[k] = { de: a.idPersonnage, vers: b.idPersonnage, axes: { ...P.axesVides(), familiarite: FAMILIARITE_COMPAGNONS }, origine: "groupe", etiquette: "compagnon", histoire: "", majLe: Date.now(), derniers: [] };
        lot.set(refLien(p, a.idPersonnage, b.idPersonnage), liens[k]); ecrits++;
    }));
    // LA PREMIÈRE RENCONTRE : un PNJ et un héros présents ensemble, sans lien encore.
    pnjs.forEach(x => heros.forEach(h => {
        const a = ames[x.id];
        if (!a || a.statut === "mort") return;
        const kp = P.cleLien(x.id, h.idPersonnage), kh = P.cleLien(h.idPersonnage, x.id);
        if (!liens[kp]) { liens[kp] = { de: x.id, vers: h.idPersonnage, axes: P.premiereImpression(a.psyche, o.reputation, a.disposition), origine: "rencontre", etiquette: "", histoire: "", majLe: Date.now(), derniers: [] }; lot.set(refLien(p, x.id, h.idPersonnage), liens[kp]); ecrits++; }
        if (!liens[kh]) { liens[kh] = { de: h.idPersonnage, vers: x.id, axes: P.impressionHeros(), origine: "rencontre", etiquette: "", histoire: "", majLe: Date.now(), derniers: [] }; lot.set(refLien(p, h.idPersonnage, x.id), liens[kh]); ecrits++; }
    }));
    if (ecrits) await lot.commit();
    return { ames, liens };
}

// -------------------------------------------------------------------------
//  LA MORT, L'OUBLI
// -------------------------------------------------------------------------
export async function marquerMort(p, id) {
    if (!p || !id) return;
    const s = await getDoc(refAme(p, id));
    if (s.exists()) await setDoc(refAme(p, id), { statut: "mort", humeur: null }, { merge: true });
}
// Efface une âme, ses liens (dans les deux sens) et ses souvenirs.
export async function oublierAme(p, id) {
    if (!p || !id) return;
    const lot = writeBatch(db);
    lot.delete(refAme(p, id));
    for (const champ of ["de", "vers"]) {
        (await getDocs(query(colLiens(p), where(champ, "==", id)))).forEach(d => lot.delete(d.ref || doc(db, PARTIES, p, "Liens", d.id)));
    }
    (await getDocs(query(collection(db, PARTIES, p, "Souvenirs"), where("ame", "==", id)))).forEach(d => lot.delete(d.ref || doc(db, PARTIES, p, "Souvenirs", d.id)));
    await lot.commit();
}

// (v464) Nico : « dans la page des fils invisibles d'un PNJ, la possibilité de le supprimer totalement : ses
// images, et son existence de la base de données ». Sa fiche (Monde_PNJ), son âme, ses liens dans les deux sens,
// ses souvenirs, sa place dans la compagnie, et ses images sur Cloudinary (son portrait, son pion…).
// Rend { images: [urls effacées] } ; null si rien n'a pu être fait.
export async function supprimerPnj(p, id) {
    if (!p || !id) return null;
    let fiche = null;
    try { const f = await getDoc(doc(db, "Monde_PNJ", id)); fiche = f.exists() ? (f.data() || {}) : null; } catch (e) {}
    // (le PNJ d'une autre partie n'est pas à elle)
    if (fiche && fiche.ID_Partie && fiche.ID_Partie !== p) return null;
    const images = fiche ? [...new Set(Object.values(fiche).filter(v => typeof v === "string" && /^https:\/\/res\.cloudinary\.com\//.test(v)))] : [];
    await oublierAme(p, id);
    if (fiche) await deleteDoc(doc(db, "Monde_PNJ", id));
    if (typeof window.oublierPnjDeLaPartieIvalis === "function") window.oublierPnjDeLaPartieIvalis(id);
    // Il ne suit plus la compagnie.
    try {
        const sp = await getDoc(doc(db, PARTIES, p)), suiveurs = sp.exists() ? (sp.data() || {}).Suiveurs : null;
        if (Array.isArray(suiveurs) && suiveurs.some(x => x && x.id === id)) await setDoc(doc(db, PARTIES, p), { Suiveurs: suiveurs.filter(x => !x || x.id !== id) }, { merge: true });
    } catch (e) { console.warn("[Fils invisibles] La compagnie :", e); }
    const effacees = [];
    if (typeof window.supprimerImageCloudinary === "function") {
        for (const url of images) { try { await window.supprimerImageCloudinary(url); effacees.push(url); } catch (e) { console.warn("[Fils invisibles] Une image du PNJ :", e); } }
    }
    journal(`${(fiche && fiche.Nom_PNJ) || id} est supprimé de la partie (fiche, âme, liens, souvenirs, ${effacees.length} image(s)).`);
    return { images: effacees };
}

// -------------------------------------------------------------------------
//  MIA_SOCIAL (v412) : CE QUE LA SCÈNE A FAIT AUX LIENS
// -------------------------------------------------------------------------
// L'IA lit les actions des joueurs et la réponse du MJ ; elle nomme les actions
// du catalogue (qui, envers qui, gravité, une phrase, l'endroit du texte), et les
// souvenirs des présents. Elle ne donne JAMAIS un chiffre : le moteur calcule.
export const MAX_EVENEMENTS = 6;
const refEtat = (p) => doc(db, PARTIES, p, "Social", "etat");
const refEvenement = (p, n) => doc(db, PARTIES, p, "Evenements_Sociaux", String(n).padStart(6, "0"));
const refSouvenir = (p, id) => doc(db, PARTIES, p, "Souvenirs", id);

function promptSocial(presents) {
    const catalogue = P.TYPES_ACTIONS.map(t => `- ${t} : ${P.ACTIONS[t].nom} (gravité max ${P.ACTIONS[t].gmax})`).join("\n");
    return `Tu es MIA_SOCIAL, l'IA qui observe les relations entre les personnages d'Ivalis.
Lis le récit que les joueurs ont écrit depuis la dernière réponse du Maître du Jeu (leurs paroles, leurs gestes, et les répliques des PNJ qu'ils ont fait parler), puis la réponse du Maître du Jeu. Relève ce que les personnages PRÉSENTS se sont FAIT ou DIT les uns aux autres, dans l'un comme dans l'autre, dans cette scène seulement.

Les présents (noms exacts) : ${presents.map(x => `${x.nom} (${x.type === "heros" ? "héros" : "PNJ"})`).join(", ")}.

Les actions possibles (et seulement elles) :
${catalogue}

RÈGLES :
- Un événement = un personnage (acteur) fait une de ces actions à un autre (cible), tous deux PHYSIQUEMENT là dans cette scène (pas seulement dans la liste des présents). Jamais entre deux héros. Un acte qui ne vise personne en particulier (éviter des pièges, trouver un chemin) n'est un événement envers personne : celui qui n'était pas là n'en sait rien.
- Seulement ce qui s'est VRAIMENT passé dans ce texte (pas une intention, pas un souvenir, pas une menace imaginée, pas une action ratée qui n'a rien fait).
- Dans le récit des joueurs, les paroles comptent (une promesse, un compliment, une insulte, un mensonge, une confidence) ; une action seulement TENTÉE (« Kaya tente de le plaquer au sol ») n'est pas encore un fait : c'est la réponse du Maître du Jeu qui dit si elle a réussi.
- Gravité : 1 un petit geste, 2 un acte qui compte, 3 un événement fondateur (une vie sauvée, une trahison grave). Le plus souvent 1. Pour « raconter », la gravité de l'acte raconté.
- « discret » : vrai si personne d'autre ne pouvait le voir ou l'entendre.
- « temoins » : les noms exacts des AUTRES personnages qui ont VRAIMENT vu ou entendu l'action, parce qu'ils étaient physiquement là à ce moment. La liste des présents est ce que le jeu croit : un personnage resté ailleurs (au village, au camp, dans une autre pièce, parti en avant) n'est PAS témoin, même s'il figure dans la liste. Dans le doute, ne le mets pas. Personne d'autre ne l'a vu : une liste vide.
- Ce qu'un personnage n'a ni vu ni appris ne change rien pour lui. S'il l'APPREND parce qu'on le lui raconte dans la scène (« Syrinx raconte à Thalia que Tartuf l'a sauvée »), c'est l'action « raconter » : acteur = celui qui raconte, cible = celui qui écoute, et « rapporte » = l'acte raconté (son auteur, son type, sa cible).
- Quand un personnage prend parti contre un autre ou le contredit ouvertement (il défend les aventuriers contre Mael, il désavoue un ordre de Mael devant tous), ajoute « s_opposer » de lui envers celui qu'il contredit : c'est ce dernier qui le vit mal, jamais l'inverse. Vérifie toujours le sens : l'acteur est celui qui agit, la cible celui qui subit.
- « extrait » : quatre à huit mots EXACTS du texte où cela se passe (celui du Maître du Jeu de préférence).
- L'attirance se découvre, rarement : un geste tendre, un regard troublé, une main gardée un peu trop longtemps → « geste_tendre » ; des avances (une invitation, un compliment appuyé) → « courtiser » ; des avances repoussées → « repousser » (acteur = celui qui repousse). Ne les invente jamais : seulement quand le texte le montre.
- Six événements au plus ; s'il ne s'est rien passé entre eux, une liste vide.
- Souvenirs : pour chaque PNJ marqué par la scène, UNE phrase à la première personne (ce qu'il en retiendra), et de qui elle parle.
- Ne donne JAMAIS de chiffre de relation.
Utilise l'outil 'noterScene'.`;
}
const OUTIL_SOCIAL = [{ functionDeclarations: [{ name: "noterScene", description: "Les actions entre personnages présents, et leurs souvenirs.",
    parameters: { type: "OBJECT", properties: {
        evenements: { type: "ARRAY", items: { type: "OBJECT", properties: {
            type: { type: "STRING", enum: P.TYPES_ACTIONS }, acteur: { type: "STRING" }, cible: { type: "STRING" },
            gravite: { type: "NUMBER" }, discret: { type: "BOOLEAN" }, resume: { type: "STRING", description: "Une phrase, au passé." },
            temoins: { type: "ARRAY", items: { type: "STRING" }, description: "Les autres personnages qui ont vraiment vu ou entendu l'action (noms exacts) ; vide si personne." },
            rapporte: { type: "OBJECT", description: "Pour « raconter » seulement : l'acte raconté.", properties: {
                acteur: { type: "STRING" }, type: { type: "STRING", enum: P.TYPES_ACTIONS.filter(t => t !== "raconter") }, cible: { type: "STRING" } } },
            extrait: { type: "STRING" } }, required: ["type", "acteur", "cible", "gravite", "resume", "temoins"] } },
        souvenirs: { type: "ARRAY", items: { type: "OBJECT", properties: {
            nom: { type: "STRING" }, texte: { type: "STRING" }, a_propos_de: { type: "ARRAY", items: { type: "STRING" } }, importance: { type: "NUMBER" } }, required: ["nom", "texte"] } }
    }, required: ["evenements"] } }] }];

async function demanderScene(presents, texteJoueurs, texteMJ) {
    if (typeof window.fetchGemini !== "function") return null;
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: promptSocial(presents) }] },
        contents: [{ role: "user", parts: [{ text: `--- LE RÉCIT DES JOUEURS DEPUIS LA DERNIÈRE RÉPONSE DU MAÎTRE DU JEU ---\n${texteJoueurs || ""}\n\n--- LA RÉPONSE DU MAÎTRE DU JEU ---\n${texteMJ || ""}` }] }],
        tools: OUTIL_SOCIAL, toolConfig: { functionCallingConfig: { mode: "ANY" } }, generationConfig: { temperature: 0.2 } });
    const rep = await window.fetchGemini("social", corps);
    const data = await rep.json();
    const appel = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).find(x => x.functionCall && x.functionCall.name === "noterScene");
    return (appel && appel.functionCall.args) || { evenements: [] };
}

// Les paragraphes du texte du MJ (comme le livre les découpe) ; celui de l'extrait.
const paragraphes = (t) => String(t || "").replace(/<[^>]+>/g, "").split(/\n/).map(x => x.trim()).filter(Boolean);
export function paragrapheDe(texteMJ, extrait) {
    const paras = paragraphes(texteMJ).map(sansAccent);
    const mots = sansAccent(extrait).replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(m => m.length > 2);
    if (!paras.length) return 0;
    if (!mots.length) return paras.length - 1;
    let meilleur = paras.length - 1, score = 0;
    paras.forEach((p, i) => { const s = mots.filter(m => p.includes(m)).length; if (s > score) { score = s; meilleur = i; } });
    return meilleur;
}
const signe = (v) => (v > 0 ? "+" : "−") + Math.abs(Math.round(v));
// Les lignes de la marge : « Varos → Kaya : confiance −7 · crainte +4 ».
export function lignesDeMarge(changements, ames) {
    const parLien = new Map();
    changements.forEach(c => {
        // (v430) Nico : « dans l'icône du petit cerveau, c'est toujours le nom du PJ, une
        // flèche et le nom du PNJ ; il faudrait mettre quand ça modifie la relation du PNJ » :
        // seulement ce que ressent un PNJ (PNJ → héros, PNJ → PNJ), pas ce que ressent un héros.
        if (!ames[c.de] || ames[c.de].type !== "pnj") return;
        const d = c.apres - c.avant;
        if (Math.abs(d) < 0.5) return;
        const k = c.de + "~" + c.vers;
        if (!parLien.has(k)) parLien.set(k, { de: c.de, vers: c.vers, axes: {} });
        parLien.get(k).axes[c.axe] = (parLien.get(k).axes[c.axe] || 0) + d;
    });
    const nom = (id) => (ames[id] && ames[id].nom) || id;
    return [...parLien.values()].map(l => ({ de: l.de, vers: l.vers,
        texte: `${nom(l.de)} → ${nom(l.vers)} : ${Object.entries(l.axes).filter(([, d]) => Math.abs(d) >= 0.5).map(([a, d]) => `${P.NOMS_AXES[a].toLowerCase()} ${signe(d)}`).join(" · ")}` }))
        .filter(l => !/: $/.test(l.texte));
}

// LE TOUR SOCIAL : les âmes de la scène, MIA_SOCIAL, le moteur, l'écriture (un
// seul lot), et les cerveaux de la marge sur le message du MJ. Un message déjà
// lu ne l'est jamais une seconde fois.
// `o` : { idPartie, pnjs: [{ id, fiche }], heros, reputation, texteJoueurs, texteMJ, idMessage, dateJeu }.
export async function tourSocial(o) {
    const p = o && o.idPartie;
    if (!p) return null;
    const etatSnap = await getDoc(refEtat(p));
    const etatSocial = etatSnap.exists() ? etatSnap.data() : {};
    if (o.idMessage && (etatSocial.messages || []).includes(o.idMessage)) { journal("Ce message a déjà été lu : rien de plus."); return { deja: true }; }
    const { ames, liens } = await assurerAmes(o);
    const tour = P.nombre(etatSocial.tour) + 1;
    const presents = Object.values(ames).filter(a => a && a.statut !== "mort").map(a => ({ id: a.id, nom: a.nom, type: a.type }));
    const resultat = { tour, evenements: [], changements: [], souvenirs: [], marge: [] };
    const fin = { tour, historique: (etatSocial.historique || []).slice(-30), messages: [...(etatSocial.messages || []), o.idMessage].filter(Boolean).slice(-30),
                  compteur: P.nombre(etatSocial.compteur), dernieresInitiatives: etatSocial.dernieresInitiatives || [] };
    if (!presents.some(x => x.type === "pnj") || !o.texteMJ) { await setDoc(refEtat(p), fin, { merge: true }); return resultat; }

    let rendu = null;
    try { rendu = await demanderScene(presents, o.texteJoueurs, o.texteMJ); }
    catch (e) { console.warn("[MIA_SOCIAL] Lecture de la scène impossible :", e); }
    const idDuNom = (n) => (presents.find(x => memeNom(x.nom, n)) || {}).id || "";
    const typeDe = (id) => (ames[id] || {}).type;
    // (v475) Les témoins nommés par l'IA (jamais d'office tous les présents), et
    // l'auteur d'un acte raconté, qu'on cherche parmi toutes les âmes connues.
    const idDuNomTous = (n) => (Object.values(ames).find(a => a && memeNom(a.nom, n)) || {}).id || "";
    const proposes = ((rendu && rendu.evenements) || []).slice(0, MAX_EVENEMENTS).map(e => ({ ...e, acteur: idDuNom(e.acteur), cible: idDuNom(e.cible), acteurNom: e.acteur, cibleNom: e.cible,
            temoins: (Array.isArray(e.temoins) ? e.temoins : []).map(idDuNom).filter(Boolean),
            rapporte: e.rapporte ? { type: e.rapporte.type, acteur: idDuNomTous(e.rapporte.acteur), cible: idDuNomTous(e.rapporte.cible) } : undefined }))
        .filter(e => !(typeDe(e.acteur) === "heros" && typeDe(e.cible) === "heros"));   // pas de relation chiffrée entre héros
    const calcul = P.appliquerEvenements({ ames, liens }, proposes, { presents: presents.map(x => x.id), tour, historique: fin.historique, sansLienEntreHeros: true });
    calcul.rejets.forEach(r => console.warn("[MIA_SOCIAL] Écarté :", r.raison, r.evenement && r.evenement.resume));

    const lot = writeBatch(db);
    const touches = new Set(calcul.changements.map(c => P.cleLien(c.de, c.vers)));
    const numeros = calcul.evenements.map((e, i) => fin.compteur + 1 + i);
    fin.compteur += calcul.evenements.length;
    // Les liens touchés : leurs axes, et leurs cinq derniers changements.
    touches.forEach(k => {
        const l = calcul.etat.liens[k];
        const ici = calcul.changements.filter(c => P.cleLien(c.de, c.vers) === k);
        // (v417) qui a agi envers qui : l'encart ne montre que ce qui s'est passé entre les deux.
        const parEv = [...new Set(ici.map(c => c.evenement))].map(n => ({ n: numeros[n], tour, resume: calcul.evenements[n].resume,
            acteur: calcul.evenements[n].acteur, cible: calcul.evenements[n].cible,
            // (v475) Nico : « attachement −0 : à filtrer » — un écart qui s'arrondit à zéro ne s'écrit pas.
            ecarts: Object.fromEntries(ici.filter(c => c.evenement === n && Math.abs(c.apres - c.avant) >= 0.5).map(c => [c.axe, Math.round((c.apres - c.avant) * 100) / 100])) }));
        lot.set(refLien(p, l.de, l.vers), { ...l, majLe: Date.now(), derniers: [...((liens[k] && liens[k].derniers) || []), ...parEv].slice(-5) });
    });
    // Les âmes : l'humeur de la cible, la personnalité d'un héros qui glisse.
    new Set([...calcul.humeurs.map(h => h.ame), ...calcul.derives.map(d => d.ame)]).forEach(id => {
        const a = calcul.etat.ames[id];
        lot.set(refAme(p, id), { humeur: a.humeur || null, psyche: a.psyche }, { merge: true });
    });
    // Les événements, avec leurs témoins et leurs écarts.
    const presentsIds = presents.map(x => x.id);
    calcul.evenements.forEach((e, i) => {
        const fiche = { numero: numeros[i], tour, message: o.idMessage || "", dateJeu: o.dateJeu || "", type: e.type, acteur: e.acteur, cible: e.cible, gravite: e.gravite,
            discret: e.discret, resume: e.resume, temoins: e.discret ? [] : (Array.isArray(e.temoins) ? e.temoins : presentsIds.filter(x => x !== e.acteur && x !== e.cible)),
            ...(e.rapporte ? { rapporte: e.rapporte } : {}),
            changements: calcul.changements.filter(c => c.evenement === i).map(c => ({ de: c.de, vers: c.vers, axe: c.axe, avant: c.avant, apres: c.apres })),
            annule: false, Le: Date.now() };
        lot.set(refEvenement(p, numeros[i]), fiche);
        resultat.evenements.push(fiche);
        fin.historique.push({ acteur: e.acteur, cible: e.cible, type: e.type });
    });
    fin.historique = fin.historique.slice(-30);
    // Les souvenirs : ceux que l'IA a écrits (à la première personne) ; sinon, pour
    // la cible d'un événement, la phrase de l'événement.
    const souvenirs = [];
    ((rendu && rendu.souvenirs) || []).forEach(sv => {
        const id = idDuNom(sv && sv.nom);
        if (!id || !sv.texte) return;
        souvenirs.push({ ame: id, texte: String(sv.texte).slice(0, 300), sujets: (sv.a_propos_de || []).map(idDuNom).filter(Boolean), importance: Math.max(1, Math.min(3, Math.round(P.nombre(sv.importance, 1)))) });
    });
    calcul.evenements.forEach((e, i) => {
        if (typeDe(e.cible) !== "pnj" || souvenirs.some(sv => sv.ame === e.cible)) return;
        souvenirs.push({ ame: e.cible, texte: e.resume, sujets: [e.acteur], importance: e.gravite, evenement: numeros[i] });
    });
    souvenirs.slice(0, 12).forEach((sv, k) => {
        const id = `${o.idMessage || ("t" + tour)}_${k}`;
        const d = { ...sv, tour, dateJeu: o.dateJeu || "", message: o.idMessage || "", Le: Date.now() };
        lot.set(refSouvenir(p, id), d);
        resultat.souvenirs.push(d);
    });
    // Les cerveaux de la marge : un par paragraphe touché.
    const marge = new Map();
    calcul.evenements.forEach((e, i) => {
        const lignes = lignesDeMarge(calcul.changements.filter(c => c.evenement === i), ames);
        if (!lignes.length) return;
        const para = paragrapheDe(o.texteMJ, (proposes.find(x => x.resume === e.resume) || {}).extrait || e.resume);
        if (!marge.has(para)) marge.set(para, { para, evenements: [], lignes: [] });
        const m = marge.get(para);
        m.evenements.push(numeros[i]);
        m.lignes.push(...lignes.map(l => l.texte));
        m.resume = [m.resume, e.resume].filter(Boolean).join(" ");
    });
    resultat.marge = [...marge.values()].sort((a, b) => a.para - b.para);
    if (o.idMessage && resultat.marge.length) lot.set(doc(db, "Messages_Chat", o.idMessage), { Social: resultat.marge }, { merge: true });
    lot.set(refEtat(p), fin, { merge: true });
    await lot.commit();
    resultat.changements = calcul.changements;
    // (v497) Les liens qui viennent de bouger : un lien fort se scelle, s'éteint ou se brise.
    try { resultat.liensForts = await verifierLiensForts(p, [...touches], { ames: calcul.etat.ames, liens: calcul.etat.liens }); }
    catch (e) { console.warn("[Fils invisibles] Les liens forts :", e); }
    journal(`Tour ${tour} : ${calcul.evenements.length} événement(s), ${touches.size} lien(s) changé(s), ${resultat.souvenirs.length} souvenir(s).`);
    // (v428) Un journal trop plein passe dans la mémoire à long terme (derrière, sans attendre).
    resultat.memoire = consoliderSiBesoin(p, resultat.souvenirs.map(sv => sv.ame));
    return resultat;
}

// -------------------------------------------------------------------------
//  LA MÉMOIRE À LONG TERME (v428)
// -------------------------------------------------------------------------
// Nico : « dans les souvenirs : Gladys a parlé avec truc, a pris des nouvelles de
// truc… on va très vite remplir le journal. Une fois qu'on arrive à 30 souvenirs, une
// IA trie les dix derniers pour ne garder que les plus importants, les synthétise et
// les met dans sa mémoire à long terme (envoyée avec le reste). On lui envoie la
// mémoire à long terme existante, et elle récrit le tout propre. »
//    · « les dix derniers » : les dix plus anciens (le bas de la liste, le livre met
//      les plus récents en haut) ; ils quittent le journal une fois la mémoire écrite ;
//    · la mémoire vit sur l'âme (Ames/{id} : memoire, memoireMaj) ; le MJ, la
//      discussion privée et les fils invisibles la lisent.
export const SEUIL_MEMOIRE = 30, LOT_MEMOIRE = 10, MAX_MEMOIRE = 1500;
export function promptMemoire(nom) {
    return `Tu es MIA_MEMOIRE, l'IA qui tient la mémoire à long terme des personnages d'Ivalis (un jeu de rôle antique fantastique).
On te donne la MÉMOIRE À LONG TERME actuelle de ${nom} (elle peut être vide) et ses ${LOT_MEMOIRE} SOUVENIRS LES PLUS ANCIENS, écrits au fil du jeu.
- Trie ces souvenirs : garde seulement ce qui compte pour ${nom} (ce qui a changé ses relations, ce qu'il a appris, promis, perdu ou gagné, ce qui l'a marqué, où et avec qui il voyage). Oublie l'anecdotique (saluer, bavarder, prendre des nouvelles, une banalité).
- Récris TOUTE la mémoire à long terme, propre : l'ancienne et ce que tu gardes, fondus ensemble, sans doublon ni contradiction (le plus récent l'emporte).
- À la première personne (c'est ${nom} qui se souvient), en phrases courtes, avec les dates quand elles sont connues. Les noms exacts des personnages.
- ${MAX_MEMOIRE} caractères au plus. N'invente rien.
Réponds en JSON seul : {"memoire":"..."}`;
}
async function demanderMemoire(nom, memoire, vieux) {
    if (typeof window.fetchGemini !== "function") return "";
    const souvenirs = vieux.map(z => `- ${z.dateJeu ? `[${z.dateJeu}] ` : ""}${z.texte}`).join("\n");
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: promptMemoire(nom) }] },
        contents: [{ role: "user", parts: [{ text: `--- LA MÉMOIRE À LONG TERME DE ${nom.toUpperCase()} ---\n${memoire || "(vide)"}\n\n--- SES ${vieux.length} SOUVENIRS LES PLUS ANCIENS ---\n${souvenirs}` }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" } });
    const rep = await window.fetchGemini("social", corps);
    if (!rep || !rep.ok) throw new Error("statut " + (rep && rep.status));
    const data = await rep.json();
    if (data.usageMetadata && typeof window.ajouterTokens === "function") window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    const brut = ((data.candidates?.[0]?.content?.parts) || []).filter(x => typeof x.text === "string" && !x.thought).map(x => x.text).join("");
    let o = null;
    const m = brut.match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch (e) { o = null; } }
    return String((o && o.memoire) || "").replace(/\s+\n/g, "\n").trim().slice(0, MAX_MEMOIRE);
}
const enConsolidation = new Set();
// Les souvenirs d'une âme passent le seuil : les dix plus anciens entrent dans sa mémoire.
export async function consoliderMemoire(p, id) {
    if (!p || !id || enConsolidation.has(p + "/" + id)) return null;
    enConsolidation.add(p + "/" + id);
    try {
        const sv = await lireSouvenirsDe(p, id);
        if (sv.length < SEUIL_MEMOIRE) return null;
        const vieux = sv.slice().sort((a, b) => P.nombre(a.tour) - P.nombre(b.tour) || P.nombre(a.Le) - P.nombre(b.Le)).slice(0, LOT_MEMOIRE);
        const sa = await getDoc(refAme(p, id));
        const ame = sa.exists() ? sa.data() : {};
        const memoire = await demanderMemoire(ame.nom || id, ame.memoire || "", vieux);
        if (!memoire) return null;                       // rien d'écrit : les souvenirs restent
        const lot = writeBatch(db);
        lot.set(refAme(p, id), { memoire, memoireMaj: Date.now() }, { merge: true });
        vieux.forEach(z => lot.delete(refSouvenir(p, z.id)));
        await lot.commit();
        journal(`${ame.nom || id} : ${vieux.length} vieux souvenirs entrés dans sa mémoire à long terme.`);
        return memoire;
    } catch (e) { console.warn("[Fils invisibles] La mémoire à long terme :", e); return null; }
    finally { enConsolidation.delete(p + "/" + id); }
}
export async function consoliderSiBesoin(p, ids) {
    const faits = {};
    for (const id of [...new Set((ids || []).filter(Boolean))]) faits[id] = await consoliderMemoire(p, id);
    return faits;
}
// Un souvenir écrit hors d'une scène (v428 : un PNJ qui rejoint la compagnie).
export async function noterSouvenir(p, ame, texte, o) {
    if (!p || !ame || !texte) return null;
    const x = o || {};
    const id = `${x.cle || "note"}_${ame}_${Date.now()}`;
    const etat = await getDoc(refEtat(p));
    const d = { ame, texte: String(texte).slice(0, 300), sujets: (x.sujets || []).filter(Boolean), importance: Math.max(1, Math.min(3, Math.round(P.nombre(x.importance, 2)))),
                tour: P.nombre(((etat.exists() && etat.data()) || {}).tour) + 1, dateJeu: x.dateJeu || "", Le: Date.now() };
    await setDoc(refSouvenir(p, id), d);
    consoliderMemoire(p, ame);
    return { ...d, id };
}

// -------------------------------------------------------------------------
//  LE LIVRE (v414) : tout le réseau de la partie, et ce que Nico et Ben corrigent
// -------------------------------------------------------------------------
// { ames, liens, fiches (Monde_PNJ de la partie, par id), etat (Social/etat) }.
export async function lireReseau(p) {
    const ames = {}, liens = {}, fiches = {};
    if (!p) return { ames, liens, fiches, etat: {} };
    const [sa, sl, sf, se] = await Promise.all([getDocs(collection(db, PARTIES, p, "Ames")), getDocs(colLiens(p)),
        getDocs(query(collection(db, "Monde_PNJ"), where("ID_Partie", "==", p))), getDoc(refEtat(p))]);
    sa.forEach(d => { ames[d.id] = { ...d.data(), id: d.id }; });
    sl.forEach(d => { const x = d.data(); liens[P.cleLien(x.de, x.vers)] = x; });
    sf.forEach(d => { fiches[d.id] = { ...d.data(), id: d.id }; });
    return { ames, liens, fiches, etat: se.exists() ? se.data() : {} };
}
export async function lireSouvenirsDe(p, id) {
    const liste = [];
    if (!p || !id) return liste;
    (await getDocs(query(collection(db, PARTIES, p, "Souvenirs"), where("ame", "==", id)))).forEach(d => liste.push({ ...d.data(), id: d.id }));
    return liste.sort((a, b) => P.nombre(b.tour) - P.nombre(a.tour) || P.nombre(b.Le) - P.nombre(a.Le));
}
const quiCorrige = () => (window.COMPTE_JOUEUR && (window.COMPTE_JOUEUR.nom || window.COMPTE_JOUEUR.idJoueur)) || (() => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } })();
export const estAdminSocial = () => !!(window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.admin);
// ANNULER un événement : ses écarts sont retirés des liens (ce qui est venu
// après reste), et il est marqué annulé, avec qui l'a annulé.
export async function annulerEvenement(p, numero) {
    if (!estAdminSocial()) throw new Error("Réservé à Nico, Ben et Adrien.");
    const ref = refEvenement(p, numero), s = await getDoc(ref);
    if (!s.exists()) throw new Error("Événement introuvable.");
    const ev = s.data();
    if (ev.annule) return { deja: true };
    const parLien = new Map();
    (ev.changements || []).forEach(c => { const k = P.cleLien(c.de, c.vers); if (!parLien.has(k)) parLien.set(k, []); parLien.get(k).push(c); });
    const lot = writeBatch(db);
    for (const [k, chg] of parLien) {
        const sl = await getDoc(doc(db, PARTIES, p, "Liens", k));
        if (!sl.exists()) continue;
        const l = sl.data(), axes = { ...P.axesVides(), ...(l.axes || {}) };
        chg.forEach(c => { axes[c.axe] = Math.round(P.borner(c.axe, P.nombre(axes[c.axe]) - (c.apres - c.avant)) * 100) / 100; });
        const derniers = (l.derniers || []).map(d => d.n === numero ? { ...d, annule: true } : d);
        lot.set(doc(db, PARTIES, p, "Liens", k), { ...l, axes, derniers, majLe: Date.now() });
    }
    lot.set(ref, { annule: true, annulePar: quiCorrige(), annuleLe: Date.now() }, { merge: true });
    await lot.commit();
    journal(`Événement n° ${numero} annulé par ${quiCorrige()}.`);
    return { annule: true };
}
// AJUSTER un lien à la main : chaque axe changé devient un événement
// « ajustement » du journal (qui, quand, avant, après).
export async function ajusterLien(p, de, vers, valeurs) {
    // (v425) La réglette du mode DEV (grimoire_liens.js). (v426) Nico : « enlève l'ancien truc
    // [le bouton Ajuster des admins] pour ne garder que les roues crantées rouges » : seul le
    // mode développeur règle un lien à la main.
    const dev = (() => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } })();
    if (!dev) throw new Error("Réservé au mode développeur.");
    const refL = refLien(p, de, vers), sl = await getDoc(refL);
    const l = sl.exists() ? sl.data() : { de, vers, axes: P.axesVides(), origine: "rencontre", etiquette: "", histoire: "", derniers: [] };
    const axes = { ...P.axesVides(), ...(l.axes || {}) };
    const changements = [];
    Object.entries(valeurs || {}).forEach(([axe, v]) => {
        if (!P.AXES.includes(axe) || v === "" || v == null || !Number.isFinite(Number(v))) return;
        const apres = P.borner(axe, Number(v)), avant = P.nombre(axes[axe]);
        if (Math.abs(apres - avant) < 0.01) return;
        axes[axe] = apres;
        changements.push({ de, vers, axe, avant, apres });
    });
    if (!changements.length) return { rien: true };
    const etatSnap = await getDoc(refEtat(p));
    const e = etatSnap.exists() ? etatSnap.data() : {};
    const numero = P.nombre(e.compteur) + 1, qui = quiCorrige();
    const resume = `Réglé en mode DEV par ${qui}.`;
    const lot = writeBatch(db);
    lot.set(refEvenement(p, numero), { numero, tour: P.nombre(e.tour), message: "", type: "ajustement", acteur: "", cible: "", gravite: 0, discret: true, resume, temoins: [], changements, annule: false, par: qui, Le: Date.now() });
    lot.set(refL, { ...l, axes, majLe: Date.now(), derniers: [...(l.derniers || []), { n: numero, tour: P.nombre(e.tour), resume, type: "ajustement", ecarts: Object.fromEntries(changements.map(c => [c.axe, Math.round((c.apres - c.avant) * 100) / 100])) }].slice(-5) });
    lot.set(refEtat(p), { compteur: numero }, { merge: true });
    await lot.commit();
    journal(`${resume} (${de} → ${vers})`);
    try { await verifierLiensForts(p, [P.cleLien(de, vers)]); } catch (e) { console.warn("[Fils invisibles] Les liens forts :", e); }
    return { numero, changements };
}

// (v484) LA VIE DU CAMP (le clan nomade, camp_pur.js, evolutionAffinites) : au retour d'une expédition, les liens
// entre ceux qui sont restés au camp évoluent d'un coup. `ecarts` : [{ de, vers, axes: { axe: +n } }] (des écarts,
// pas des valeurs). Un seul événement social, discret, les porte.
export async function ajusterLiensDuCamp(p, ecarts, resume) {
    if (!p || !Array.isArray(ecarts) || !ecarts.length) return 0;
    const etatSnap = await getDoc(refEtat(p));
    const e = etatSnap.exists() ? etatSnap.data() : {};
    const numero = P.nombre(e.compteur) + 1, texte = resume || "La vie du camp pendant l'expédition.";
    const lot = writeBatch(db), changements = [];
    for (const x of ecarts) {
        const refL = refLien(p, x.de, x.vers), sl = await getDoc(refL);
        const l = sl.exists() ? sl.data() : { de: x.de, vers: x.vers, axes: P.axesVides(), origine: "camp", etiquette: "", histoire: "", derniers: [] };
        const axes = { ...P.axesVides(), ...(l.axes || {}) }, ec = {};
        Object.entries(x.axes || {}).forEach(([axe, d]) => {
            if (!P.AXES.includes(axe) || !Number.isFinite(Number(d))) return;
            const avant = P.nombre(axes[axe]), apres = P.borner(axe, avant + Number(d));
            if (Math.abs(apres - avant) < 0.01) return;
            axes[axe] = apres; ec[axe] = Math.round((apres - avant) * 100) / 100;
            changements.push({ de: x.de, vers: x.vers, axe, avant, apres });
        });
        if (!Object.keys(ec).length) continue;
        lot.set(refL, { ...l, axes, majLe: Date.now(), derniers: [...(l.derniers || []), { n: numero, tour: P.nombre(e.tour), resume: texte, type: "camp", ecarts: ec }].slice(-5) });
    }
    if (!changements.length) return 0;
    lot.set(refEvenement(p, numero), { numero, tour: P.nombre(e.tour), message: "", type: "camp", acteur: "", cible: "", gravite: 1, discret: true, resume: texte, temoins: [], changements, annule: false, par: "camp", Le: Date.now() });
    lot.set(refEtat(p), { compteur: numero }, { merge: true });
    await lot.commit();
    try { await verifierLiensForts(p, [...new Set(changements.map(c => P.cleLien(c.de, c.vers)))]); } catch (er) { console.warn("[Fils invisibles] Les liens forts :", er); }
    return changements.length;
}

// -------------------------------------------------------------------------
//  LE MJ JOUE LES ÂMES (v413) : ce qu'il lit avant d'écrire
// -------------------------------------------------------------------------
const ADJ_TRAITS = { prudence: "prudent", impulsivite: "impulsif", loyaute: "loyal", empathie: "empathique", orgueil: "orgueilleux", sociabilite: "sociable" };
export function caractere(psyche) {
    const t = P.psycheValide(psyche).traits;
    const forts = P.TRAITS.filter(x => t[x] >= 70).map(x => (t[x] >= 85 ? "très " : "") + ADJ_TRAITS[x]);
    const faibles = P.TRAITS.filter(x => t[x] <= 30).map(x => (t[x] <= 15 ? "pas du tout " : "peu ") + ADJ_TRAITS[x]);
    return [...forts, ...faibles].join(", ") || "tempérament mesuré";
}
const signeNb = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v));
// Les souvenirs d'une âme, les plus parlants d'abord : importance, présents
// concernés, fraîcheur.
function meilleursSouvenirs(liste, idsPresents, n) {
    const ici = new Set(idsPresents);
    return liste.slice().sort((a, b) => {
        const score = (x) => P.nombre(x.importance, 1) * 2 + ((x.sujets || []).some(s => ici.has(s)) ? 3 : 0) + P.nombre(x.tour) * 0.05;
        return score(b) - score(a);
    }).slice(0, n);
}
// `o` : { idPartie, pnjs: [{ id, fiche }] (présents), heros, sollicites: [noms] }.
// Rend le texte des sections « LES ÂMES PRÉSENTES » et « TENSIONS ET ENVIES ».
export async function contexteDuMJ(o) {
    const p = o && o.idPartie;
    if (!p) return "";
    const pnjs = (o.pnjs || []).filter(x => x && x.id);
    const heros = (o.heros || []).filter(h => h && h.idPersonnage);
    if (!pnjs.length) return "";
    const idsPnj = pnjs.map(x => x.id), ids = [...idsPnj, ...heros.map(h => h.idPersonnage)];
    const [ames, liens, etatSnap] = await Promise.all([lireAmes(p, ids), lireLiens(p, idsPnj), getDoc(refEtat(p))]);
    const etatSocial = etatSnap.exists() ? etatSnap.data() : {};
    const tour = P.nombre(etatSocial.tour) + 1;
    const souvenirs = {};
    for (const bloc of par(idsPnj, 30)) {
        (await getDocs(query(collection(db, PARTIES, p, "Souvenirs"), where("ame", "in", bloc)))).forEach(d => { const x = d.data(); (souvenirs[x.ame] = souvenirs[x.ame] || []).push(x); });
    }
    const nom = (id) => (ames[id] && ames[id].nom) || (pnjs.find(x => x.id === id) || { fiche: {} }).fiche.Nom_PNJ || (heros.find(h => h.idPersonnage === id) || {}).prenom || id;
    const sollicites = (o.sollicites || []).map(sansAccent);
    const avecAme = pnjs.filter(x => ames[x.id] && ames[x.id].statut !== "mort");
    if (!avecAme.length) return "";
    let t = `\n--- LES ÂMES PRÉSENTES (les fils invisibles) ---\n`;
    t += `Joue chaque PNJ ci-dessous fidèlement : sa voix, son caractère, son humeur et ce qu'il ressent pour chacun (chiffres de −100 à +100). Ses sentiments viennent de ce qu'il a vécu : ne les contredis pas sans raison. Il ne se souvient QUE de ce qu'il a vécu ou vu. Son masque public peut cacher ce qu'il ressent devant les autres.\n`;
    let total = 0;
    avecAme.slice(0, 8).forEach(x => {
        const a = ames[x.id], ps = P.psycheValide(a.psyche), f = x.fiche || {};
        const detail = sollicites.some(n => sansAccent(nom(x.id)).includes(n) || n.includes(sansAccent(nom(x.id)))) || avecAme.length <= 3;
        const h = P.humeurActive(a, tour);
        t += `• ${nom(x.id)}${f.Occupation ? ` (${f.Occupation})` : ""}${h ? ` — humeur : ${P.NOMS_EMOTIONS[h.emotion] || h.emotion}${h.cause ? ` (${h.cause})` : ""}` : ""}.\n`;
        if (detail) {
            t += `  Caractère : ${caractere(ps)}.${ps.valeurs.length ? ` Valeurs : ${ps.valeurs.map(v => P.NOMS_VALEURS[v]).join(", ")}.` : ""}${ps.objectifs.length ? ` Objectif : ${ps.objectifs.join(" ; ")}.` : ""}${ps.faille ? ` Faille : ${ps.faille}.` : ""}${ps.masque ? ` Masque public : ${ps.masque}.` : ""}\n`;
        }
        const avis = ids.filter(y => y !== x.id).map(y => ({ y, l: liens[P.cleLien(x.id, y)] })).filter(v => v.l)
            .sort((u, v) => Math.abs(P.affinite(v.l.axes)) - Math.abs(P.affinite(u.l.axes))).slice(0, detail ? 5 : 3);
        if (avis.length) t += `  Ce qu'il pense des présents : ${avis.map(v => `${nom(v.y)}${v.l.etiquette ? ` (${v.l.etiquette})` : ""} — ${P.motAffinite(P.affinite(v.l.axes))} (${signeNb(P.affinite(v.l.axes))}) : ${P.resumeLien(v.l.axes)}`).join(" ; ")}.\n`;
        // (v428) sa mémoire à long terme (le passé lointain, synthétisé)
        if (a.memoire) t += `  Sa mémoire (le passé lointain) : ${String(a.memoire).slice(0, detail ? 900 : 300)}\n`;
        const sv = meilleursSouvenirs(souvenirs[x.id] || [], ids, detail ? 5 : 2).filter(() => total < 8);
        if (sv.length) { total += sv.length; t += `  Ses souvenirs : ${sv.map(z => `${z.dateJeu ? `[${z.dateJeu}] ` : ""}« ${z.texte} »`).join(" ")}\n`; }
    });
    // (v497) LES CŒURS : les liens forts entre les présents, et ce qui vient de changer (à jouer avec pudeur).
    t += await coeursDuMJ(p, ids, nom, etatSocial);
    // LES ENVIES : au plus deux, le MJ en joue au plus une ; jamais le même PNJ deux tours de suite.
    const envies = P.initiatives({ ames, liens }, ids, { tour, max: 2, dernieres: etatSocial.dernieresInitiatives || [] });
    if (envies.length) {
        t += `\n--- TENSIONS ET ENVIES ---\nSi la scène s'y prête, UNE de ces envies au plus peut pousser un PNJ à agir de lui-même (aller vers quelqu'un, demander, avertir, provoquer), sans voler la vedette aux héros ; sinon, ignore-les.\n`;
        t += envies.map(e => `- ${e.texte}`).join("\n") + "\n";
    }
    try { await setDoc(refEtat(p), { dernieresInitiatives: envies.map(e => e.ame) }, { merge: true }); } catch (e) {}
    return t;
}

// -------------------------------------------------------------------------
//  L'ÉLAGAGE DES SOUVENIRS (v415, à la clôture de session)
// -------------------------------------------------------------------------
// Une âme garde au plus `max` souvenirs : les plus importants, puis les plus
// récents ; les autres (petits et anciens) s'effacent. Le MJ n'en lit que huit.
export const MAX_SOUVENIRS = 30;
export async function elaguerSouvenirs(p, max = MAX_SOUVENIRS) {
    if (!p) return 0;
    const parAme = new Map();
    (await getDocs(collection(db, PARTIES, p, "Souvenirs"))).forEach(d => {
        const x = d.data() || {};
        if (!parAme.has(x.ame)) parAme.set(x.ame, []);
        parAme.get(x.ame).push({ id: d.id, ref: d.ref, score: P.nombre(x.importance, 1) * 1000 + P.nombre(x.tour) });
    });
    const lot = writeBatch(db);
    let effaces = 0;
    parAme.forEach(liste => liste.sort((a, b) => b.score - a.score).slice(max).forEach(x => { lot.delete(x.ref || refSouvenir(p, x.id)); effaces++; }));
    if (effaces) { await lot.commit(); journal(`${effaces} vieux souvenir(s) oublié(s) (au plus ${max} par âme).`); }
    return effaces;
}

// -------------------------------------------------------------------------
//  APRÈS UN TOUR DU MJ (ia_master.js, en arrière-plan)
// -------------------------------------------------------------------------
// `o` : { idPartie, pnjs: [{ id, fiche }] (ceux de la scène), heros, reputation,
// texteJoueurs, texteMJ, idMessage, dateJeu }.
export async function apresLeTour(o) {
    try { return await tourSocial(o); }
    catch (e) { console.error("[Fils invisibles] Le tour social :", e); return null; }
}

// =========================================================================
//  (v497) LES LIENS FORTS : L'AMITIÉ PROFONDE ET L'AMOUR (social_pur.js, evolutionLienFort)
// =========================================================================
//  · un PNJ : son lien se scelle tout seul quand il devient « très proche » (un souvenir, un moment pour le narrateur) ;
//  · un héros : son joueur décide (Liens_Proposes, sur la partie : un post-it, liens_forts.js) ; quand un PNJ s'attache
//    à un héros, le joueur de ce héros est invité à dire ce que son héros ressent ;
//  · deux héros : une déclaration (Declarations_Liens) que l'autre joueur accepte ou refuse ; jamais défaite toute seule ;
//  · une trahison, un abandon… : le lien fort se brise ; un amour sans attirance s'éteint en amitié.
const refPartie = (p) => doc(db, PARTIES, p);
const nomAme = (ames, id) => (ames[id] && ames[id].nom) || id;
async function joueurDuHeros(id) {
    const h = (window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || []).find(x => x && x.idPersonnage === id);
    if (h && h.idJoueur) return h.idJoueur;
    try { const s = await getDoc(doc(db, "Personnages", id)); return s.exists() ? (s.data().ID_Joueur || "") : ""; } catch (e) { return ""; }
}
export async function verifierLiensForts(p, cles, connu = {}) {
    if (!p || !(cles || []).length) return [];
    const liens = { ...(connu.liens || {}) }, ames = { ...(connu.ames || {}) };
    const ids = new Set();
    for (const k of cles) {
        if (!liens[k]) { const s = await getDoc(doc(db, PARTIES, p, "Liens", k)); if (s.exists()) liens[k] = s.data(); }
        const l = liens[k]; if (l) { ids.add(l.de); ids.add(l.vers); }
    }
    const manquantes = [...ids].filter(id => !ames[id]);
    if (manquantes.length) Object.assign(ames, await lireAmes(p, manquantes));
    const faits = [], moments = [], propositions = {}, lot = writeBatch(db);
    let ecrit = false;
    for (const k of cles) {
        const l = liens[k];
        if (!l || !ames[l.de] || ames[l.de].statut === "mort" || (ames[l.vers] || {}).statut === "mort") continue;
        const ev = P.evolutionLienFort(l, ames);
        if (!ev.action) continue;
        const nD = nomAme(ames, l.de), nV = nomAme(ames, l.vers), maintenant = Date.now();
        if (ev.action === "proposer") {
            if (l.propose || l.refuse) continue;   // déjà demandé (ou décliné) : on ne harcèle pas le joueur
            const joueur = await joueurDuHeros(l.de);
            if (!joueur) continue;
            propositions[k] = { de: l.de, vers: l.vers, nomDe: nD, nomVers: nV, joueur, amourPossible: !P.estNarrateur(l.vers, ames[l.vers]), le: maintenant };
            lot.set(doc(db, PARTIES, p, "Liens", k), { propose: { le: maintenant } }, { merge: true }); ecrit = true;
            faits.push({ cle: k, action: "proposer" });
            continue;
        }
        if (ev.action === "sceller") {
            lot.set(doc(db, PARTIES, p, "Liens", k), { fort: { type: ev.type, le: maintenant } }, { merge: true });
            lot.set(doc(db, PARTIES, p, "Souvenirs", `fort_${k}_${maintenant}`), { ame: l.de, sujets: [l.vers], importance: 3, tour: 0, Le: maintenant,
                texte: ev.type === "amour" ? `Je crois que j'aime ${nV}.` : `${nV} compte pour moi comme un frère ou une sœur d'armes.` });
            // Le héros que ce PNJ aime ou chérit : son joueur dit ce que son héros ressent, s'il ne l'a pas déjà dit.
            if ((ames[l.vers] || {}).type === "heros") {
                const inv = P.cleLien(l.vers, l.de), li = liens[inv] || (await getDoc(doc(db, PARTIES, p, "Liens", inv))).data() || null;
                if (!(li && (li.fort || li.propose || li.refuse))) {
                    const joueur = await joueurDuHeros(l.vers);
                    if (joueur) {
                        propositions[inv] = { de: l.vers, vers: l.de, nomDe: nV, nomVers: nD, joueur, amourPossible: !P.estNarrateur(l.de, ames[l.de]),
                            parce: ev.type === "amour" ? `${nD} est tombé·e amoureux·se de ${nV}.` : `${nD} tient profondément à ${nV}.`, le: maintenant };
                        lot.set(doc(db, PARTIES, p, "Liens", inv), { de: l.vers, vers: l.de, propose: { le: maintenant } }, { merge: true });
                    }
                }
            }
        } else if (ev.action === "rompre") {
            lot.set(doc(db, PARTIES, p, "Liens", k), { fort: deleteField(), rupture: { type: ev.type, le: maintenant } }, { merge: true });
            if ((ames[l.de] || {}).type === "pnj") lot.set(doc(db, PARTIES, p, "Souvenirs", `rupture_${k}_${maintenant}`), { ame: l.de, sujets: [l.vers], importance: 3, tour: 0, Le: maintenant,
                texte: `Ce qui me liait à ${nV} s'est brisé.` });
        } else if (ev.action === "eteindre") {
            lot.set(doc(db, PARTIES, p, "Liens", k), { fort: { type: "amitie", le: maintenant } }, { merge: true });
        }
        ecrit = true;
        moments.push({ texte: P.momentDuLien(nD, nV, ev.action, ev.type), ids: [l.de, l.vers], le: maintenant });
        faits.push({ cle: k, action: ev.action, type: ev.type });
    }
    if (Object.keys(propositions).length) { lot.set(refPartie(p), { Liens_Proposes: propositions }, { merge: true }); ecrit = true; }
    if (moments.length) {
        const e = (await getDoc(refEtat(p))).data() || {};
        lot.set(refEtat(p), { momentsLiens: [...(e.momentsLiens || []), ...moments].slice(-8) }, { merge: true }); ecrit = true;
    }
    if (ecrit) await lot.commit();
    if (faits.length) journal(`Liens forts : ${faits.map(f => `${f.cle} ${f.action}${f.type ? " (" + f.type + ")" : ""}`).join(", ")}.`);
    return faits;
}
// Le joueur répond pour son héros : « amitie », « amour » ou « rien » (garder les choses comme elles sont).
export async function repondreProposition(p, cle, choix) {
    const s = await getDoc(refPartie(p));
    const pr = ((s.exists() ? s.data() : {}).Liens_Proposes || {})[cle];
    if (!pr) return "Cette proposition n'existe plus.";
    const lot = writeBatch(db), maintenant = Date.now();
    if (choix === "amour" && !pr.amourPossible) return "Ce lien ne peut pas être un amour.";
    if (choix === "amitie" || choix === "amour") {
        lot.set(doc(db, PARTIES, p, "Liens", cle), { de: pr.de, vers: pr.vers, fort: { type: choix, le: maintenant, choisi: true }, propose: deleteField() }, { merge: true });
        const e = (await getDoc(refEtat(p))).data() || {};
        lot.set(refEtat(p), { momentsLiens: [...(e.momentsLiens || []), { texte: P.momentDuLien(pr.nomDe, pr.nomVers, "sceller", choix), ids: [pr.de, pr.vers], le: maintenant }].slice(-8) }, { merge: true });
    } else lot.set(doc(db, PARTIES, p, "Liens", cle), { de: pr.de, vers: pr.vers, refuse: true, propose: deleteField() }, { merge: true });
    lot.update(refPartie(p), { ["Liens_Proposes." + cle]: deleteField() });
    await lot.commit();
    return "";
}
// Entre deux héros : déclarer (le joueur de `de`), accepter ou refuser (le joueur de `vers`), défaire (l'un ou l'autre).
export async function declarerLien(p, de, vers, type) {
    if (!P.TYPES_LIENS_FORTS[type]) return "Amitié profonde ou amour ?";
    const [jDe, jVers] = await Promise.all([joueurDuHeros(de), joueurDuHeros(vers)]);
    if (!jDe || !jVers) return "Ce lien ne se déclare qu'entre deux héros de joueurs.";
    const ames = await lireAmes(p, [de, vers]);
    await updateDoc(refPartie(p), { ["Declarations_Liens." + P.cleLien(de, vers)]: { de, vers, type, par: jDe, pour: jVers, nomDe: nomAme(ames, de), nomVers: nomAme(ames, vers), le: Date.now() } });
    return "";
}
export async function repondreDeclaration(p, cle, accepte) {
    const s = await getDoc(refPartie(p));
    const d = ((s.exists() ? s.data() : {}).Declarations_Liens || {})[cle];
    if (!d) return "Cette déclaration n'existe plus.";
    const lot = writeBatch(db), maintenant = Date.now();
    if (accepte) {
        [[d.de, d.vers], [d.vers, d.de]].forEach(([a, b]) => lot.set(doc(db, PARTIES, p, "Liens", P.cleLien(a, b)),
            { de: a, vers: b, declare: true, fort: { type: d.type, le: maintenant, choisi: true } }, { merge: true }));
        const e = (await getDoc(refEtat(p))).data() || {};
        lot.set(refEtat(p), { momentsLiens: [...(e.momentsLiens || []), { texte: d.type === "amour" ? `${d.nomDe} et ${d.nomVers} s'aiment : ils l'ont choisi tous deux.` : `${d.nomDe} et ${d.nomVers} sont désormais liés d'une amitié profonde.`, ids: [d.de, d.vers], le: maintenant }].slice(-8) }, { merge: true });
    }
    lot.update(refPartie(p), { ["Declarations_Liens." + cle]: deleteField() });
    await lot.commit();
    return "";
}
export async function defaireLien(p, de, vers) {
    const lot = writeBatch(db), maintenant = Date.now();
    const k = P.cleLien(de, vers), inv = P.cleLien(vers, de);
    const l = (await getDoc(doc(db, PARTIES, p, "Liens", k))).data() || {};
    lot.set(doc(db, PARTIES, p, "Liens", k), { fort: deleteField(), rupture: { type: (l.fort || {}).type || "", le: maintenant } }, { merge: true });
    if (l.declare) lot.set(doc(db, PARTIES, p, "Liens", inv), { fort: deleteField(), rupture: { type: (l.fort || {}).type || "", le: maintenant } }, { merge: true });
    await lot.commit();
    return "";
}
// Tous les liens forts de la partie (la fiche, la gestion du camp, le réseau).
export async function lireLiensForts(p) {
    if (!p) return [];
    const out = [];
    (await getDocs(query(colLiens(p), where("fort.type", "in", Object.keys(P.TYPES_LIENS_FORTS))))).forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
}
// Ce que le narrateur lit : les liens forts entre les présents, et les moments à jouer (une fois chacun).
async function coeursDuMJ(p, ids, nom, etatSocial) {
    const ici = new Set(ids);
    let forts = [];
    try { forts = (await lireLiensForts(p)).filter(l => ici.has(l.de) && ici.has(l.vers)); } catch (e) {}
    const moments = (etatSocial.momentsLiens || []).filter(m => (m.ids || []).some(id => ici.has(id)));
    if (!forts.length && !moments.length) return "";
    let t = `
--- LES CŒURS (amitiés profondes et amours) ---
`;
    if (forts.length) {
        const vus = new Set();
        forts.forEach(l => {
            const inv = forts.find(x => x.de === l.vers && x.vers === l.de && x.fort.type === l.fort.type);
            const cle = [l.de, l.vers].sort().join("~");
            if (inv && vus.has(cle)) return;
            vus.add(cle);
            t += inv ? `- ${nom(l.de)} et ${nom(l.vers)} : ${l.fort.type === "amour" ? "ils s'aiment" : "une amitié profonde"}.
`
                     : `- ${nom(l.de)} ${l.fort.type === "amour" ? "aime" : "tient profondément à"} ${nom(l.vers)} (pas forcément réciproque${l.fort.type === "amour" ? " ; il·elle ne l'a peut-être pas dit" : ""}).
`;
        });
        t += `Joue ces liens avec pudeur et constance (gestes, regards, inquiétude pour l'autre) ; jamais de scène explicite.
`;
    }
    if (moments.length) {
        t += moments.map(m => `- À l'instant : ${m.texte}`).join("\n") + "\n";
        const reste = (etatSocial.momentsLiens || []).filter(m => !moments.includes(m));
        try { await setDoc(refEtat(p), { momentsLiens: reste }, { merge: true }); } catch (e) {}
    }
    return t;
}

window.SOCIAL = { ...P, verifierLiensForts, repondreProposition, declarerLien, repondreDeclaration, defaireLien, lireLiensForts, ajusterLiensDuCamp, elaguerSouvenirs, MAX_SOUVENIRS, consoliderMemoire, consoliderSiBesoin, noterSouvenir, promptMemoire, SEUIL_MEMOIRE, LOT_MEMOIRE, contexteDuMJ, caractere, lireReseau, lireSouvenirsDe, annulerEvenement, ajusterLien, estAdminSocial, lireAmes, lireLiens, lireLiensVers, naissancePnj, assurerAmes, marquerMort, oublierAme, supprimerPnj, apresLeTour, tourSocial, paragrapheDe, lignesDeMarge,
                  schemaPsyche, schemaLiens, consigneCreation, psycheDeLIA, LIENS_IA, schemaDisposition, schemaRaisonDisposition, dispositionDeNaissance };
