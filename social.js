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
import { collection, query, where, getDocs, doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as P from "./social_pur.js?v=3";

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
export const schemaLiens = () => ({
    type: "ARRAY", description: "0 à 3 liens qu'il a DÉJÀ avec des personnages de la liste des PNJ du lieu (jamais avec un héros, jamais un nom hors de la liste).",
    items: { type: "OBJECT", properties: { nom: { type: "STRING" }, type: { type: "STRING", enum: Object.keys(LIENS_IA) }, histoire: { type: "STRING", description: "Une phrase : ce qui les lie." } }, required: ["nom", "type"] }
});
export function consigneCreation(nomsDuLieu) {
    const noms = (nomsDuLieu || []).filter(Boolean);
    return `\nÂME (v411) : donne à chacun une personnalité (psyche) : six traits de 0 à 100 (varie-les franchement, pas 50 partout), 1 à 3 valeurs parmi ${P.VALEURS.join(", ")}, 1 à 3 objectifs concrets, une faille, un masque public.`
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
    const ame = { id: idPnj, type: "pnj", nom: fiche.nom || "", ref: idPnj, psyche, humeur: null, statut: "vivant", Version: P.VERSION_SOCIAL, Cree_Le: Date.now() };
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
    journal(`${fiche.nom} reçoit son âme${crees.length ? ` et ${crees.length} lien(s) d'avant : ${crees.map(c => `${c.nom} (${c.type})`).join(", ")}` : ""}.`);
    return { ame, liens: crees };
}

// -------------------------------------------------------------------------
//  MIA_AME : la personnalité de ceux qui n'en ont pas encore
// -------------------------------------------------------------------------
async function demanderAmes(personnages) {
    if (!personnages.length || typeof window.fetchGemini !== "function") return {};
    const systeme = `Tu es MIA_AME : tu donnes une âme aux personnages d'Ivalis (Antiquité magique, mythologie).
Pour chacun, d'après sa fiche, une personnalité stable : six traits de 0 à 100 (prudence, impulsivite, loyaute, empathie, orgueil, sociabilite — varie-les franchement, pas 50 partout), 1 à 3 valeurs parmi ${P.VALEURS.join(", ")} (la plus importante d'abord), 1 à 3 objectifs concrets, une faille, un masque public.
Pour un héros (joué par un joueur), reste prudent : une estimation d'après sa fiche, qui se précisera avec ses actes.
Utilise l'outil 'donnerAmes', une entrée par personnage, avec son nom exact.`;
    const outils = [{ functionDeclarations: [{ name: "donnerAmes", description: "La personnalité de chaque personnage.",
        parameters: { type: "OBJECT", properties: { ames: { type: "ARRAY", items: { type: "OBJECT", properties: { nom: { type: "STRING" }, ...PROPRIETES_PSYCHE }, required: ["nom"] } } }, required: ["ames"] } }] }];
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
        });
        return rendu;
    } catch (e) { console.warn("[MIA_AME] Personnalités impossibles (valeurs moyennes) :", e); return {}; }
}

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
        ...heros.filter(h => !ames[h.idPersonnage]).map(h => ({ id: h.idPersonnage, type: "heros", nom: h.prenom, fiche: { nom: `${h.prenom} ${h.nom || ""}`.trim(), genre: h.genre || "", race: h.race || "", classe: h.classe || "", age: h.age || "", signes: h.signes || "", histoire: String(h.histoire || h.Histoire || h.background || "").slice(0, 400) } }))
    ].slice(0, 10);
    const lot = writeBatch(db);
    let ecrits = 0;
    if (manquants.length) {
        const psyches = await demanderAmes(manquants.map(m => ({ id: m.id, nom: m.nom, type: m.type === "heros" ? "héros" : "PNJ", fiche: m.fiche })));
        manquants.forEach(m => {
            const psyche = psyches[m.id] || P.psycheValide({});
            if (m.type === "pnj") psyche.style = String(m.fiche.parole || "").slice(0, 200);
            const ame = { id: m.id, type: m.type, nom: m.nom, ref: m.id, psyche, humeur: null, statut: "vivant", Version: P.VERSION_SOCIAL, Cree_Le: Date.now(), ...(psyches[m.id] ? {} : { Psyche_Par_Defaut: true }) };
            ames[m.id] = ame; lot.set(refAme(p, m.id), ame); ecrits++;
        });
        journal(`MIA_AME : ${manquants.map(m => m.nom).join(", ")} reçoi${manquants.length > 1 ? "vent" : "t"} une âme.`);
    }
    const liens = await lireLiens(p, ids);
    // LA PREMIÈRE RENCONTRE : un PNJ et un héros présents ensemble, sans lien encore.
    pnjs.forEach(x => heros.forEach(h => {
        const a = ames[x.id];
        if (!a || a.statut === "mort") return;
        const kp = P.cleLien(x.id, h.idPersonnage), kh = P.cleLien(h.idPersonnage, x.id);
        if (!liens[kp]) { liens[kp] = { de: x.id, vers: h.idPersonnage, axes: P.premiereImpression(a.psyche, o.reputation), origine: "rencontre", etiquette: "", histoire: "", majLe: Date.now(), derniers: [] }; lot.set(refLien(p, x.id, h.idPersonnage), liens[kp]); ecrits++; }
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
// Efface une âme, ses liens (dans les deux sens) et ses souvenirs (la purge des
// anciens PNJ, un lieu effacé).
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
Lis les dernières actions des joueurs et la réponse du Maître du Jeu. Relève ce que les personnages PRÉSENTS se sont FAIT les uns aux autres, dans cette scène seulement.

Les présents (noms exacts) : ${presents.map(x => `${x.nom} (${x.type === "heros" ? "héros" : "PNJ"})`).join(", ")}.

Les actions possibles (et seulement elles) :
${catalogue}

RÈGLES :
- Un événement = un personnage (acteur) fait une de ces actions à un autre (cible), tous deux présents. Jamais entre deux héros.
- Seulement ce qui s'est VRAIMENT passé dans ce texte (pas une intention, pas un souvenir, pas une menace imaginée, pas une action ratée qui n'a rien fait).
- Gravité : 1 un petit geste, 2 un acte qui compte, 3 un événement fondateur (une vie sauvée, une trahison grave). Le plus souvent 1.
- « discret » : vrai si personne d'autre ne pouvait le voir ou l'entendre.
- « extrait » : quatre à huit mots EXACTS du texte du Maître du Jeu où cela se passe.
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
            extrait: { type: "STRING" } }, required: ["type", "acteur", "cible", "gravite", "resume"] } },
        souvenirs: { type: "ARRAY", items: { type: "OBJECT", properties: {
            nom: { type: "STRING" }, texte: { type: "STRING" }, a_propos_de: { type: "ARRAY", items: { type: "STRING" } }, importance: { type: "NUMBER" } }, required: ["nom", "texte"] } }
    }, required: ["evenements"] } }] }];

async function demanderScene(presents, texteJoueurs, texteMJ) {
    if (typeof window.fetchGemini !== "function") return null;
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: promptSocial(presents) }] },
        contents: [{ role: "user", parts: [{ text: `--- LES DERNIÈRES ACTIONS DES JOUEURS ---\n${texteJoueurs || ""}\n\n--- LA RÉPONSE DU MAÎTRE DU JEU ---\n${texteMJ || ""}` }] }],
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
    const proposes = ((rendu && rendu.evenements) || []).slice(0, MAX_EVENEMENTS).map(e => ({ ...e, acteur: idDuNom(e.acteur), cible: idDuNom(e.cible), acteurNom: e.acteur, cibleNom: e.cible }))
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
        const parEv = [...new Set(ici.map(c => c.evenement))].map(n => ({ n: numeros[n], tour, resume: calcul.evenements[n].resume,
            ecarts: Object.fromEntries(ici.filter(c => c.evenement === n).map(c => [c.axe, Math.round((c.apres - c.avant) * 100) / 100])) }));
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
            discret: e.discret, resume: e.resume, temoins: e.discret ? [] : presentsIds.filter(x => x !== e.acteur && x !== e.cible),
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
    journal(`Tour ${tour} : ${calcul.evenements.length} événement(s), ${touches.size} lien(s) changé(s), ${resultat.souvenirs.length} souvenir(s).`);
    return resultat;
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

window.SOCIAL = { ...P, lireAmes, lireLiens, lireLiensVers, naissancePnj, assurerAmes, marquerMort, oublierAme, apresLeTour, tourSocial, paragrapheDe, lignesDeMarge,
                  schemaPsyche, schemaLiens, consigneCreation, psycheDeLIA, LIENS_IA };
