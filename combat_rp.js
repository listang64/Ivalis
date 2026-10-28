// =========================================================================
//  IVALIS — LES COMBATS DU RÉCIT (v278)
// =========================================================================
//  Nico : « maintenant nous allons connecter les combats au RP ». Le récit
//  lance le combat, l'IA le prépare, on combat, et le récit reprend.
//
//  1. LA DÉTECTION. Le MJ vient de répondre : MIA_COMBAT lit les dernières
//     actions des joueurs et cette réponse — une agression, une embuscade,
//     une action qui mène au combat ? Elle tourne pendant que les joueurs
//     lisent le parchemin, en même temps que les IA d'arrière-plan (Nico :
//     « 2. Ok ») ; la fin du parchemin attend son verdict (« Le destin
//     hésite… »), puis montre le bouton COMBATTRE — ou se referme.
//
//  2. LA PRÉPARATION, sur le poste qui a lancé le MJ (un autre poste qui a
//     les clés reprend s'il disparaît, comme pour les POI). Chaque étape écrit
//     son résultat dans la partie (Combat_RP) : celui qui reprend repart de là.
//       · la remise à zéro : l'arène est mise de côté et le plateau vidé (le
//         combat du récit prend le plateau, Nico : « 1. Ok ») ;
//       · MIA_CHAMP_DE_BATAILLE : les 15 derniers messages, le lieu (ou, dans
//         la nature, le terrain et la région) → la description détaillée du
//         lieu du combat ;
//       · la carte : le style de Paramètres > Instructions IA (« Style map
//         crea », lu par son titre, jamais écrit ici) + cette description,
//         dessinée comme les portraits des héros (gpt-image-2, qualité
//         medium) ;
//       · MIA_ENNEMIS : qui affronte les héros, combien (→ Apparition 1 à 4),
//         puis, le cas tiré au sort selon les règles des apparitions (Nico :
//         « 6. Non, aléatoire selon les règles d'apparitions »), un nom et une
//         apparence pour chaque créature — renforts compris ;
//       · les pions : directement depuis l'apparence (« 5. Token direct »),
//         depuis son portrait pour un PNJ nommé qui en a un ;
//       · la grille : une boîte pour les joueurs en mode DEV, la main à Nico
//         puis à Ben s'ils sont là (« 4. Tous ceux en mode dev la voient,
//         priorité à Nico et Ben ») ;
//       · MIA_PEINTURE_MURS, _INACCESSIBLE, _DIFFICILE : la carte avec sa
//         grille numérotée, et les numéros de ce qu'elles y voient ;
//       · MIA_SPAWN : la même image et les 6 derniers messages → les repères
//         des héros et des ennemis, les cases des renforts ;
//       · le déploiement : les héros, puis la rencontre (son butin se prépare
//         dès lors, comme dans l'arène).
//
//  3. LE COMBAT : celui de l'arène, tel quel. Le chat ne s'écrit plus et le
//     MJ se tait (« 3. Ok ») ; un bandeau « Combat en cours » y mène.
//
//  4. LA FIN : victoire, la dernière fenêtre de butin refermée ; défaite, le
//     grand « Défaite » passé. Chacun revient au récit, et UN poste réveille
//     le MJ avec l'issue, les blessures des héros, le lieu saccagé.
//
//  Toutes les IA de texte prennent la seconde clé Gemini (cles_gemini.js).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import {
    doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, orderBy,
    runTransaction, deleteField
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const idJoueur = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || "INVITE"; } catch (e) { return "INVITE"; } };
const nomJoueur = () => (window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom) || idJoueur();
const SESSION = Math.random().toString(36).slice(2, 8);
const moi = () => idJoueur() + ":" + SESSION;
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const echapper = (t) => String(t === undefined || t === null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const normaliser = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const sansHtml = (t) => String(t || "").replace(/<img[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
const refPartie = () => doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
const refVTT = () => doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
const AUTEUR_DESTIN = { Auteur_ID: "DESTIN", Auteur_Nom: "Destin", Auteur_Couleur: "#c2a878" };

// LES RÉGLAGES, en un seul endroit (les bancs les raccourcissent).
const R = window.REGLAGES_COMBAT_RP = {
    messagesLieu: 15,          // Nico : « les 15 derniers messages du chatbox »
    messagesSpawn: 6,          // Nico : « les 6 derniers messages du RP »
    tailleCarte: "1536x1024",  // paysage, comme l'écran de l'iPad
    qualiteCarte: "medium",    // celle des portraits des héros
    visuelsMax: 5,             // au plus cinq pions différents à dessiner
    pionsEnParallele: 2,
    attenteVerdictMs: 30000,   // la fin du parchemin attend le verdict, pas plus
    battementMs: 15000,        // le poste qui prépare dit qu'il est là
    relaisMs: 60000,           // au-delà, un autre poste reprend
    regleurFraisMs: 20000,     // un joueur DEV devant la boîte de la grille
    grilleSansRegleurMs: 60000,// personne en DEV : la grille garde sa taille
    prioritaires: ["P_01", "P_02"], // Nico, puis Ben
    narrationApresMs: { victoire: 2500, defaite: 12000 },
    butinOublieMs: 60000,      // un butin réparti resté ouvert : on le referme
    abandonMs: 20000,          // le combat a disparu du plateau (réinitialisé)
    narrationBloqueeMs: 180000
};

// =========================================================================
//  1. L'ÉTAT (Systeme_Parties/{id}.Combat_RP)
// =========================================================================
//  { Id, Etat: "detection" | "aucun" | "preparation" | "en_cours" | "narration",
//    Message (l'horodatage du message du MJ jugé), Raison, Adversaires,
//    Createur { id, t }, Remise, Lieu { Titre, Description, Interieur },
//    Carte, Carte_Le, Regleurs { P_xx: { nom, t, depuis } }, Apercu_Grille,
//    Grille { Taille, Par, Le }, Ennemis { Apparition, Tirage, Visuels },
//    Tokens { cle: url }, Peinture { murs, inaccessibles, difficiles },
//    Peint, Deploye, ID_Rencontre, Issue, Narrateur }
let partieVue = null;
const lirePartieVue = () => partieVue || window.PARTIE_DATA || {};
const etat = (p) => (p || lirePartieVue()).Combat_RP || null;

window.combatRPActif = (p) => { const c = etat(p); return !!c && ["preparation", "en_cours", "narration"].includes(c.Etat); };
window.combatRPEnPreparation = (p) => (etat(p) || {}).Etat === "preparation";
window.etatCombatRP = () => etat();

// Une écriture pointée, aussitôt vue ici (l'écoute de la partie la rapportera).
function appliquerPointe(objet, champs) {
    Object.entries(champs).forEach(([cle, v]) => {
        const parts = cle.split(".");
        let o = objet;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = {};
            o = o[parts[i]];
        }
        const f = parts[parts.length - 1];
        if (v && typeof v === "object" && v._methodName === "deleteField") delete o[f];
        else if (v && v.__supprimer) delete o[f];
        else o[f] = v;
    });
}
async function maj(champs) {
    await updateDoc(refPartie(), champs);
    const p = partieVue || window.PARTIE_DATA;
    if (p) appliquerPointe(p, champs);
}
// Une transaction sur la partie : `fn(data)` rend { maj, resultat } ou null.
async function transaction(fn) {
    if (!window.ID_PARTIE_COURANTE) return null;
    try {
        const r = await runTransaction(db, async (tx) => {
            const snap = await tx.get(refPartie());
            const data = snap && snap.exists() ? snap.data() : {};
            const x = fn(data || {});
            if (!x) return null;
            if (x.maj && Object.keys(x.maj).length) tx.update(refPartie(), x.maj);
            return { resultat: x.resultat === undefined ? true : x.resultat, maj: x.maj };
        });
        if (!r) return null;
        const p = partieVue || window.PARTIE_DATA;
        if (p && r.maj) appliquerPointe(p, r.maj);
        return r.resultat;
    } catch (e) {
        console.error("Combat du récit :", e);
        return null;
    }
}
async function lirePartie() {
    const snap = await getDoc(refPartie());
    return snap && snap.exists() ? snap.data() : {};
}
const aLesCles = () => {
    const l = (k) => { try { return (localStorage.getItem(k) || "").trim(); } catch (e) { return ""; } };
    return !!(window.cleGemini ? window.cleGemini("combat") : l("ivalis_GEMINI_API_KEY"))
        && !!l("ivalis_OPENAI_API_KEY") && !!l("ivalis_CLOUDINARY_CLOUD_NAME")
        && !!l("ivalis_CLOUDINARY_API_KEY") && !!l("ivalis_CLOUDINARY_API_SECRET");
};

// =========================================================================
//  2. LES IA DE TEXTE (seconde clé, JSON)
// =========================================================================
async function demanderJSON({ systeme, texte, image, temperature }) {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini("combat")) throw new Error("Aucune clé Gemini");
    const parts = [{ text: texte }];
    if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });
    const res = await window.fetchGemini("combat", JSON.stringify({
        systemInstruction: { parts: [{ text: systeme }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: temperature === undefined ? 0.4 : temperature, responseMimeType: "application/json" }
    }));
    const data = await res.json();
    if (!res.ok || data.error) throw new Error((data.error && data.error.message) || `Gemini ${res.status}`);
    if (typeof window.ajouterTokens === "function" && data.usageMetadata) window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    const brut = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    const debut = brut.indexOf("{"), fin = brut.lastIndexOf("}");
    return JSON.parse(debut >= 0 && fin > debut ? brut.slice(debut, fin + 1) : brut);
}

// Les derniers messages du chat, lisibles (sans les dates du parchemin).
async function lireMessages(n) {
    const snap = await getDocs(query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc")));
    const liste = [];
    snap.forEach(d => liste.push(d.data()));
    return liste.filter(m => m && !["Date", "Système", "Date_En_Jeu"].includes(m.Auteur_Nom) && m.Auteur_ID !== "Date")
        .slice(-n).map(m => `${m.Auteur_Nom || "?"} : ${sansHtml(m.Texte)}`).join("\n");
}

const PROMPT_COMBAT = `Tu es MIA_COMBAT, l'arbitre d'un jeu de rôle tactique (Antique Fantastique). Tu lis les dernières actions des joueurs et la dernière réponse du Maître du Jeu, et tu décides si un COMBAT TACTIQUE commence MAINTENANT.

C'EST UN COMBAT (combat = true) quand, dans ces messages :
- un héros attaque, frappe, tire ou lance un sort offensif sur quelqu'un (ou quelque chose) capable de se défendre ;
- quelqu'un ou quelque chose attaque les héros, leur tend une embuscade, les charge, ou leur barre la route l'arme à la main ;
- les hostilités sont déclenchées et inévitables : armes tirées des deux côtés, un défi accepté, une bête qui bondit.

CE N'EST PAS UN COMBAT (combat = false) :
- des menaces, une tension, une négociation, une intimidation qui n'a pas encore dégénéré ;
- un combat déjà terminé, raconté au passé, ou réglé en une phrase par le MJ ;
- une bagarre entre PNJ qui n'implique pas les héros, un entraînement, une démonstration, une chasse sans danger ;
- une simple intention (« je m'apprête à… ») que le MJ n'a pas encore fait aboutir.

Dans le doute, réponds false : un combat lancé à tort coupe le récit.

Réponds UNIQUEMENT en JSON : {"combat": true ou false, "raison": "une phrase", "adversaires": "qui affronte les héros (vide sans combat)"}`;

// LE VERDICT : ce que les joueurs ont fait depuis la réponse précédente du MJ,
// et la nouvelle réponse.
async function demanderVerdict(texteMJ, messages) {
    const liste = Array.isArray(messages) ? messages : [];
    let debut = 0;
    liste.forEach((m, i) => { if (m && (m.Est_Narration_IA || m.Auteur_ID === "MJ")) debut = i; });
    const depuis = liste.slice(Math.max(0, debut)).map(m => `${m.Auteur_Nom || "?"} : ${sansHtml(m.Texte)}`).join("\n");
    return demanderJSON({
        systeme: PROMPT_COMBAT, temperature: 0.2,
        texte: `--- LES DERNIERS MESSAGES ---\n${depuis || "(aucun)"}\n\n--- LA RÉPONSE QUE LE MAÎTRE DU JEU VIENT DE DONNER ---\n${sansHtml(texteMJ)}`
    });
}

// =========================================================================
//  3. LA DÉTECTION
// =========================================================================
// Avant le message du MJ : la partie sait qu'un verdict viendra pour lui.
window.annoncerDetectionCombat = async function(ts) {
    if (!window.ID_PARTIE_COURANTE || typeof window.cleGemini !== "function" || !window.cleGemini("combat")) return false;
    return !!(await transaction((data) => {
        if (window.combatRPActif(data)) return null;
        return { maj: { Combat_RP: { Id: "crp_" + ts + "_" + Math.random().toString(36).slice(2, 6), Etat: "detection", Message: ts, Le: Date.now() } } };
    }));
};

window.detecterCombatRP = async function(o) {
    const { ts, texteMJ, messages } = o || {};
    let verdict = null;
    try { verdict = await demanderVerdict(texteMJ, messages); }
    catch (e) { console.error("[MIA_COMBAT] Verdict impossible :", e); }
    const combat = !!(verdict && verdict.combat === true);
    console.log(`⚔️ [MIA_COMBAT] ${combat ? "COMBAT" : "pas de combat"} — ${(verdict && verdict.raison) || "sans verdict"}`);
    const lance = await transaction((data) => {
        const x = data.Combat_RP;
        if (!x || Number(x.Message) !== Number(ts) || x.Etat !== "detection") return null;
        if (!combat) return { maj: { "Combat_RP.Etat": "aucun", "Combat_RP.Raison": String((verdict && verdict.raison) || "") }, resultat: false };
        return { maj: champsDebut(x.Id, ts, verdict), resultat: true };
    });
    if (lance) poursuivre();
    return !!lance;
};

function champsDebut(id, ts, verdict) {
    return {
        Combat_RP: {
            Id: id, Etat: "preparation", Message: ts || 0, Debut: Date.now(),
            Raison: String((verdict && verdict.raison) || ""), Adversaires: String((verdict && verdict.adversaires) || ""),
            Createur: { id: moi(), t: Date.now() }
        }
    };
}

// DEV : un combat du récit tout de suite, sans attendre le MJ.
window.forcerCombatRP = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return false;
    if (!aLesCles()) {
        if (typeof window.afficherAlerteCles === "function") window.afficherAlerteCles("Le combat du récit a besoin des clés Gemini, OpenAI et Cloudinary.");
        return false;
    }
    const id = "crp_" + Date.now() + "_dev";
    const ok = await transaction((data) => window.combatRPActif(data) ? null
        : { maj: champsDebut(id, 0, { raison: "Combat lancé depuis le mode DEV." }) });
    if (ok) poursuivre();
    actualiserEncarts();
    return !!ok;
};

// DEV : abandonner le combat du récit (l'arène est rendue, le chat rouvert).
window.abandonnerCombatRP = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const c = etat();
    if (!c || !window.combatRPActif()) return false;
    if (typeof window.confirm === "function" && !window.confirm("Abandonner le combat du récit ? Le récit reprendra sans lui.")) return false;
    // Le plateau se vide de ce combat, puis l'arène retrouve sa carte.
    if (typeof window.reinitialiserCombat === "function") { try { await window.reinitialiserCombat({ rp: true }); } catch (e) { console.error(e); } }
    await rendreLArene();
    const ok = await transaction((data) => (data.Combat_RP && data.Combat_RP.Id === c.Id) ? { maj: { Combat_RP: deleteField() } } : null);
    actualiserTout();
    return !!ok;
};

// =========================================================================
//  4. LA PRÉPARATION (le poste qui prépare)
// =========================================================================
const enCours = new Set();
const faits = new Set();
const echecsEtape = {};
let minuteurBattement = null;

const estCreateur = (c) => !!(c && c.Createur && c.Createur.id === moi());

function battre() {
    const c = etat();
    if (!c || c.Etat !== "preparation" || !estCreateur(c)) {
        if (minuteurBattement) { clearInterval(minuteurBattement); minuteurBattement = null; }
        return;
    }
    if (minuteurBattement) return;
    minuteurBattement = setInterval(() => {
        const x = etat();
        if (!x || x.Etat !== "preparation" || !estCreateur(x)) { clearInterval(minuteurBattement); minuteurBattement = null; return; }
        maj({ "Combat_RP.Createur.t": Date.now() }).catch(() => {});
    }, R.battementMs);
}

// Un poste qui a les clés reprend une préparation abandonnée.
async function verifierRelais(c) {
    if (!c || c.Etat !== "preparation" || estCreateur(c) || !aLesCles()) return;
    const t = Number(c.Createur && c.Createur.t) || 0;
    if (Date.now() - t < R.relaisMs) return;
    const pris = await transaction((data) => {
        const x = data.Combat_RP;
        if (!x || x.Id !== c.Id || x.Etat !== "preparation") return null;
        if (Date.now() - (Number(x.Createur && x.Createur.t) || 0) < R.relaisMs) return null;
        return { maj: { "Combat_RP.Createur": { id: moi(), t: Date.now() } } };
    });
    if (pris) { console.log("⚔️ [Combat du récit] Le poste qui préparait ne répond plus : ce poste reprend."); poursuivre(); }
}

// LA SUITE, d'après ce qui est déjà écrit. Rappelée après chaque étape et à
// chaque nouvelle de la partie ; une étape en cours ne se relance pas.
function poursuivre() {
    const c = etat();
    if (!c || c.Etat !== "preparation" || !estCreateur(c)) return;
    battre();
    const fait = (cle) => faits.has(c.Id + ":" + cle);
    const lancer = (cle, f) => {
        const k = c.Id + ":" + cle;
        if (enCours.has(k) || faits.has(k)) return;
        enCours.add(k);
        Promise.resolve().then(f).then(() => { faits.add(k); delete echecsEtape[k]; })
            .catch(e => {
                // Une étape qui échoue est reprise, de plus en plus tard.
                echecsEtape[k] = (echecsEtape[k] || 0) + 1;
                console.error(`⚔️ [Combat du récit] Étape « ${cle} » (essai ${echecsEtape[k]}) :`, e);
                return attendre(3000 * Math.min(5, echecsEtape[k]));
            })
            .finally(() => { enCours.delete(k); setTimeout(poursuivre, 0); });
    };
    if (!c.Remise && !fait("remise")) return lancer("remise", remettreAZero);
    if (!c.Lieu && !fait("lieu")) return lancer("lieu", decrireLeLieu);
    if (!c.Carte && !fait("carte")) return lancer("carte", dessinerLaCarte);
    if (!c.Ennemis && !fait("ennemis")) lancer("ennemis", composerLesEnnemis);
    else if (c.Ennemis && !pionsPrets(c)) lancer("pions", dessinerLesPions);
    if (!c.Grille) { grilleSansRegleur(c); return; }
    if (!c.Peint && !fait("peinture")) return lancer("peinture", peindreLeTerrain);
    if (c.Ennemis && pionsPrets(c) && c.Peint && !c.Deploye) lancer("deploiement", deployer);
}
window.poursuivreCombatRP = poursuivre;

const pionsPrets = (c) => !!(c && c.Ennemis && Object.keys(c.Ennemis.Visuels || {}).every(k => c.Tokens && c.Tokens[k] !== undefined));

// --- 4.1 LA REMISE À ZÉRO : l'arène de côté, le plateau vidé -------------
const CHAMPS_ARENE = ["URL_Map", "Taille_Hex", "Opacite_Grille", "Tuiles_Supprimees", "Tuiles_Murs", "Tuiles_Difficiles", "Tuiles_Spawn_Ennemis"];
async function remettreAZero() {
    const c = etat();
    const snap = await getDoc(refVTT());
    const vtt = snap && snap.exists() ? snap.data() : {};
    // L'ARÈNE MISE DE CÔTÉ : sa carte, sa grille, ses couches peintes. Le
    // combat du récit prend le plateau ; elle les retrouvera après.
    const arene = vtt.Arene_Sauvegarde || Object.fromEntries(CHAMPS_ARENE.filter(k => vtt[k] !== undefined).map(k => [k, vtt[k]]));
    if (typeof window.reinitialiserCombat === "function") await window.reinitialiserCombat({ rp: true });
    const vide = { Tokens: {}, Tuiles_Supprimees: [], Tuiles_Murs: [], Tuiles_Difficiles: [], Tuiles_Spawn_Ennemis: [], Arene_Sauvegarde: arene, Carte_RP: c.Id };
    if (snap && snap.exists()) await updateDoc(refVTT(), vide);
    else await setDoc(refVTT(), vide);
    window.TOKENS_VTT_DATA = {};
    ["appliquerTuilesSupprimees", "appliquerMurs", "appliquerTerrainDifficile", "appliquerSpawnEnnemis"].forEach(f => {
        if (typeof window[f] === "function") window[f]([]);
    });
    if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT({});
    await maj({ "Combat_RP.Remise": true });
}

// --- 4.2 LE LIEU DU COMBAT (MIA_CHAMP_DE_BATAILLE) ------------------------
const PROMPT_LIEU = `Tu es MIA_CHAMP_DE_BATAILLE, l'IA qui prépare le terrain d'un combat tactique dans un jeu de rôle (Antique Fantastique). Un combat vient d'éclater dans le récit. À partir des derniers messages et de ce que l'on sait du lieu, décris en détail L'ENDROIT EXACT où se déroule le combat, tel qu'on le verrait d'en haut sur une carte de bataille.

Ta description servira à dessiner la carte : sois concret et spatial.
- La forme générale du lieu et sa taille (une salle, une clairière, une rue, un pont, une grotte…).
- Ce qui se trouve où : au nord, au sud, à l'est, à l'ouest, au centre.
- Les obstacles qui bloquent la vue : murs, cloisons, colonnes, rochers, troncs, comptoirs, bâtiments.
- Ce qui empêche de passer sans cacher la vue : eau profonde, gouffres, fosses, lave.
- Les sols difficiles : gravats, boue, broussailles, caisses, escaliers, eau peu profonde.
- Les entrées et sorties : portes, fenêtres, passages, bords ouverts.
- Les matériaux, la végétation, la lumière, l'ambiance.
Reste fidèle au lieu et au récit : n'invente rien qui les contredise. Aucun personnage, aucune créature, aucun texte sur la carte.

Réponds UNIQUEMENT en JSON : {"titre": "nom court du lieu du combat", "description": "8 à 14 phrases", "interieur": true si le combat a lieu à l'intérieur (bâtiment, salle, grotte aménagée), sinon false}`;

async function contexteDuLieu(partie) {
    const lignes = [];
    let env = null;
    if (typeof window.preparerEnvironnementMJ === "function") {
        try { env = await window.preparerEnvironnementMJ(partie.Lieu_Actuel || null); } catch (e) { env = null; }
    }
    if (env && env.details) {
        const d = env.details;
        const champs = ["Nom_Lieu", "Nom_Batiment", "Type_Lieu", "Descriptif", "Description", "Description_Details", "Stigmates", "Ambiance"]
            .filter(k => d[k]).map(k => `${k} : ${sansHtml(d[k])}`);
        lignes.push(`--- LE LIEU ACTUEL (${env.type}) ---`, ...(champs.length ? champs : [JSON.stringify(d).slice(0, 1500)]));
        if (env.listeBatiments && env.listeBatiments.length) lignes.push(`Bâtiments : ${env.listeBatiments.join(", ")}`);
    } else if (typeof window.contexteEnvironnementMJ === "function") {
        try { lignes.push(await window.contexteEnvironnementMJ(partie, { sansAnalyse: true, silencieux: true })); } catch (e) {}
    }
    return { texte: lignes.join("\n"), env };
}

async function decrireLeLieu() {
    const partie = await lirePartie();
    const [messages, lieu] = await Promise.all([lireMessages(R.messagesLieu), contexteDuLieu(partie)]);
    let r = null;
    try {
        r = await demanderJSON({ systeme: PROMPT_LIEU, temperature: 0.7,
            texte: `${lieu.texte || "--- LE LIEU ---\n(aucune fiche : déduis-le du récit)"}\n\n--- LES ${R.messagesLieu} DERNIERS MESSAGES ---\n${messages}` });
    } catch (e) { console.error("[MIA_CHAMP_DE_BATAILLE] Description impossible :", e); }
    const enBatiment = !!(lieu.env && lieu.env.type === "Bâtiment");
    const description = String((r && r.description) || "").trim()
        || `Le lieu où le combat éclate, tel que le récit le décrit :\n${messages.split("\n").slice(-3).join("\n")}`;
    const fiche = { Titre: String((r && r.titre) || "Le champ de bataille").trim(), Description: description,
                    Interieur: enBatiment || !!(r && r.interieur === true) };
    console.log(`🗺️ [MIA_CHAMP_DE_BATAILLE] ${fiche.Titre}${fiche.Interieur ? " (intérieur)" : ""} :\n${fiche.Description}`);
    await maj({ "Combat_RP.Lieu": fiche });
}

// --- 4.3 LA CARTE ---------------------------------------------------------
// LE STYLE, LU PAR SON TITRE dans Paramètres > Instructions IA (Nico : « ne
// le code pas en dur ») : « Style map crea ».
async function lireStyleCarte() {
    try {
        const snap = await getDocs(collection(db, "Cerveau_IA"));
        const toutes = [];
        snap.forEach(d => toutes.push(d.data()));
        const titre = (x) => normaliser(x.Titre_Menu);
        const trouve = toutes.find(x => titre(x) === "style map crea")
            || toutes.find(x => titre(x).includes("style map"))
            || toutes.find(x => titre(x).includes("map") && titre(x).includes("style"));
        if (trouve && trouve.Contenu_Direct) return String(trouve.Contenu_Direct);
    } catch (e) { console.error("Style des cartes de combat :", e); }
    console.warn("⚠️ [Carte de combat] Aucune instruction « Style map crea » dans Paramètres > Instructions IA : la carte suit la seule description.");
    return "Carte de bataille fantastique vue de dessus, pour un jeu de rôle tactique, sans aucun texte, sans grille, sans personnage.";
}
window.lireStyleCarteCombat = lireStyleCarte;
window.promptCarteCombat = (style, lieu) => `${style}\n\n--- LE LIEU DU COMBAT (décrit par le MJ IA) ---\n${lieu && lieu.Titre ? lieu.Titre + " : " : ""}${(lieu && lieu.Description) || ""}`;

async function sha1(message) {
    const buffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(message));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function deposerSurCloudinary(source, dossier) {
    const l = (k) => (localStorage.getItem(k) || "").trim();
    const cloud = l("ivalis_CLOUDINARY_CLOUD_NAME"), cle = l("ivalis_CLOUDINARY_API_KEY"), secret = l("ivalis_CLOUDINARY_API_SECRET");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const form = new FormData();
    form.append("file", source); form.append("api_key", cle); form.append("timestamp", timestamp);
    form.append("signature", await sha1(`folder=${dossier}&timestamp=${timestamp}${secret}`)); form.append("folder", dossier);
    const json = await (await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form })).json();
    if (!json.secure_url) throw new Error("Cloudinary : " + JSON.stringify(json).slice(0, 200));
    return json.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
}

async function genererImageCarte(prompt) {
    const cle = (localStorage.getItem("ivalis_OPENAI_API_KEY") || "").trim();
    if (!cle) throw new Error("Aucune clé OpenAI");
    const delais = [5000, 15000, 30000];
    for (const model of ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"]) {
        for (let tentative = 0; tentative < 3; tentative++) {
            let statut = 0, texte = "";
            try {
                const rep = await fetch("https://api.openai.com/v1/images/generations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cle },
                    body: JSON.stringify({ model, prompt, n: 1, size: R.tailleCarte, quality: R.qualiteCarte, output_format: "png", moderation: "low" })
                });
                statut = rep.status; texte = await rep.text();
            } catch (e) { texte = "error code: 1015"; }
            if (statut === 429 || texte.includes("error code: 1015") || texte.includes("Rate Limited")) { await attendre(delais[tentative]); continue; }
            if (statut === 404 || texte.includes("model_not_found")) break;
            let j = null;
            try { j = JSON.parse(texte); } catch (e) {}
            if (j && j.data && j.data.length) return j.data[0].url || ("data:image/png;base64," + j.data[0].b64_json);
            console.error(`🗺️ [Carte de combat] ${model} → HTTP ${statut}`, texte.slice(0, 300));
            break;
        }
    }
    return null;
}

async function dessinerLaCarte() {
    const c = etat();
    const prompt = window.promptCarteCombat(await lireStyleCarte(), c.Lieu);
    console.log("🗺️ [Carte de combat] Dessin du champ de bataille…");
    let url = "";
    try {
        const image = await genererImageCarte(prompt);
        if (image) url = await deposerSurCloudinary(image, "Combats/Cartes");
    } catch (e) { console.error("🗺️ [Carte de combat] Dessin impossible :", e); }
    // SANS DESSIN, LE COMBAT A LIEU QUAND MÊME : sur la carte de l'arène.
    const arene = ((await getDoc(refVTT())).data() || {}).Arene_Sauvegarde || {};
    if (!url) url = arene.URL_Map || "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789076932/arene_s5qs3e.png";
    const taille = Number(arene.Taille_Hex) || (window.PLATEAU_VTT && window.PLATEAU_VTT.hexSize) || 60;
    const opacite = arene.Opacite_Grille !== undefined ? Number(arene.Opacite_Grille) : 0.8;
    await setDoc(refVTT(), { URL_Map: url, Taille_Hex: taille, Opacite_Grille: opacite,
                             Tuiles_Supprimees: [], Tuiles_Murs: [], Tuiles_Difficiles: [], Tuiles_Spawn_Ennemis: [] }, { merge: true });
    if (typeof window.appliquerTerrain === "function") window.appliquerTerrain(url, taille, opacite);
    await maj({ "Combat_RP.Carte": url, "Combat_RP.Carte_Le": Date.now(), "Combat_RP.Taille_Depart": taille });
}

// --- 4.4 LES ENNEMIS (MIA_ENNEMIS) ---------------------------------------
const PROMPT_ENNEMIS = `Tu es MIA_ENNEMIS, l'IA qui dresse la liste des ennemis d'un combat tactique (Antique Fantastique). Un combat vient d'éclater dans le récit. Lis les messages et dis QUI affronte les héros au moment où le combat commence.

- "nombre" : combien d'adversaires sont engagés contre les héros au début du combat (au moins 1). Une meute, une bande : compte-les si le récit le dit, sinon estime.
- "ennemis" : chacun d'eux (au plus 6), avec un nom et une description physique précise pour dessiner son visage (espèce ou peuple, carrure, visage, coiffe, tenue, arme, signes distinctifs).
- Si l'un d'eux est un des PNJ NOMMÉS listés, recopie son nom EXACT dans "pnj" (sinon laisse vide) et reprends son apparence.
- "renforts" : 2 à 4 idées de renforts plausibles pour CET affrontement (des compagnons de la même bande, des gardes appelés, des bêtes du lieu…), chacune avec un nom et une description physique.

Réponds UNIQUEMENT en JSON : {"nombre": 2, "ennemis": [{"nom": "...", "description_physique": "...", "pnj": ""}], "renforts": [{"nom": "...", "description_physique": "..."}]}`;

const PROMPT_HABILLAGE = `Tu es MIA_ENNEMIS, l'IA qui habille les créatures d'un combat tactique (Antique Fantastique). Le tirage des apparitions a fixé la composition exacte du combat : des créatures numérotées, chacune avec son moment (au départ ou en renfort), son rôle de combat et sa stature. Donne à CHACUNE un nom et une apparence.

RÈGLES :
- Les créatures du DÉPART sont les ennemis du récit, dans l'ordre (le LEADER prend le chef). Garde leur nom et leur apparence ; un PNJ nommé garde son nom EXACT dans "pnj".
- S'il y a plus de créatures au départ que d'ennemis dans le récit, invente des compagnons crédibles.
- Les RENFORTS viennent des idées de renforts (ou de ton imagination) : plausibles dans ce lieu et pour cet affrontement.
- Le rôle de combat oriente l'arme et l'allure (archer, mage, brute au contact, soigneur…) ; la stature donne la taille et la puissance (Petit = mineur, Normal = combattant ordinaire, Boss = légendaire).
- Tous les noms sont différents : 1 à 4 mots, en français, sans chiffre.
- "visuel" : une clé courte, commune aux créatures qui se RESSEMBLENT (trois loups gris identiques partagent la même clé) ; au plus 5 visuels différents. Chaque visuel a une description physique précise de la tête et du haut du corps (elle servira à sculpter un médaillon).

Réponds UNIQUEMENT en JSON : {"creatures": [{"numero": 1, "nom": "...", "visuel": "loup", "pnj": ""}], "visuels": [{"cle": "loup", "description_physique": "..."}]}`;

const ROLES = {
    "DPS CAC": "combattant au contact", "TANK CAC": "brute massive qui encaisse au contact",
    "SOUTIEN": "soigneur ou soutien", "DPS MAGE CAC": "lanceur de sorts au contact",
    "DPS DISTANCE": "tireur à distance (arc, fronde, javelots)", "DPS MAGE DISTANCE": "lanceur de sorts à distance"
};
const momentDe = (m) => m.surReleve ? "renfort (quand le leader se relève)" : m.quandVide ? "renfort (quand le terrain se vide)"
    : Number(m.entreeManche) > 0 ? `renfort (manche ${m.entreeManche})` : "renfort";

async function composerLesEnnemis() {
    const partie = await lirePartie();
    const [messages, lieu] = await Promise.all([lireMessages(R.messagesLieu), contexteDuLieu(partie)]);
    const pnjs = Object.values((lieu.env && lieu.env.pnjsPresents) || {}).filter(x => x && x.Nom_PNJ);
    const listePnj = pnjs.length ? pnjs.map(x => `- ${x.Nom_PNJ} (${x.Race || "?"}, ${x.Occupation || "?"}) : ${x.Description_Physique || ""}`).join("\n") : "(aucun)";
    const c = etat();

    // 1. CEUX DU RÉCIT, ET COMBIEN.
    let analyse = null;
    try {
        analyse = await demanderJSON({ systeme: PROMPT_ENNEMIS, temperature: 0.6,
            texte: `--- CE QUI A DÉCLENCHÉ LE COMBAT ---\n${c.Raison || ""} ${c.Adversaires ? "(adversaires : " + c.Adversaires + ")" : ""}\n\n--- LES PNJ NOMMÉS PRÉSENTS ---\n${listePnj}\n\n--- LES ${R.messagesLieu} DERNIERS MESSAGES ---\n${messages}` });
    } catch (e) { console.error("[MIA_ENNEMIS] Analyse impossible :", e); }
    const apparition = Math.max(1, Math.min(4, Math.round(Number(analyse && analyse.nombre) || 1)));

    // 2. LE CAS, TIRÉ AU SORT SELON LES RÈGLES DES APPARITIONS.
    if (typeof window.chargerGabaritsMonstres === "function") { try { await window.chargerGabaritsMonstres(); } catch (e) {} }
    const tirage = window.tirerApparition(apparition);
    const tous = [...tirage.depart.map(m => ({ m, moment: "départ" })), ...tirage.renforts.map(m => ({ m, moment: momentDe(m) }))];

    // 3. CHACUN HABILLÉ.
    let habits = null;
    if (tous.length) {
        const slots = tous.map((x, i) => `${i + 1}. ${x.moment} — ${ROLES[x.m.archetype] || x.m.archetype} — stature ${x.m.palier}${x.m.leader ? " — LEADER" : ""}`).join("\n");
        try {
            habits = await demanderJSON({ systeme: PROMPT_HABILLAGE, temperature: 0.8,
                texte: `--- LES ENNEMIS DU RÉCIT ---\n${JSON.stringify((analyse && analyse.ennemis) || [])}\n\n--- LES IDÉES DE RENFORTS ---\n${JSON.stringify((analyse && analyse.renforts) || [])}\n\n--- LES PNJ NOMMÉS PRÉSENTS ---\n${listePnj}\n\n--- LA COMPOSITION TIRÉE (${tous.length} créatures) ---\n${slots}` });
        } catch (e) { console.error("[MIA_ENNEMIS] Habillage impossible :", e); }
    }
    const { creatures, visuels } = habiller(tous, habits, analyse, pnjs);
    const ennemis = {
        Apparition: apparition,
        Tirage: { ...tirage, depart: creatures.slice(0, tirage.depart.length), renforts: creatures.slice(tirage.depart.length) },
        Visuels: visuels
    };
    console.log(`🐲 [MIA_ENNEMIS] Apparition ${apparition} : ${creatures.map(x => x.nom).join(", ")} (${Object.keys(visuels).length} pion(s) à dessiner).`);
    await maj({ "Combat_RP.Ennemis": ennemis, "Combat_RP.Tokens": {} });
}

// Le tirage + ce que l'IA a répondu → les créatures nommées, et les visuels
// à dessiner (au plus R.visuelsMax, des clés sûres : v1, v2…).
function habiller(tous, habits, analyse, pnjs) {
    const parNumero = new Map(((habits && habits.creatures) || []).map(x => [Number(x.numero), x]));
    const descriptions = new Map(((habits && habits.visuels) || []).map(v => [String(v.cle || "").trim(), String(v.description_physique || "").trim()]));
    const recit = (analyse && analyse.ennemis) || [];
    const pnjParNom = new Map(pnjs.map(x => [normaliser(x.Nom_PNJ), x]));
    const cles = new Map();
    const visuels = {};
    const pris = new Set();
    const creatures = tous.map((x, i) => {
        const h = parNumero.get(i + 1) || {};
        const r = x.moment === "départ" ? (recit[i] || {}) : {};
        let nom = String(h.nom || r.nom || "").trim() || `${(ROLES[x.m.archetype] || "Créature").split(" ")[0].replace(/^./, l => l.toUpperCase())} ${i + 1}`;
        while (pris.has(normaliser(nom))) nom += " le Second";
        pris.add(normaliser(nom));
        const pnj = pnjParNom.get(normaliser(h.pnj || r.pnj || "")) || (x.moment === "départ" ? pnjParNom.get(normaliser(nom)) : null) || null;
        // LE VISUEL : le PNJ nommé a le sien (son portrait) ; les autres
        // partagent celui que l'IA leur donne, dans la limite des cinq.
        let brute = pnj ? "pnj:" + pnj.Nom_PNJ : String(h.visuel || "").trim() || (r.nom ? "recit:" + r.nom : x.m.archetype + ":" + x.m.palier);
        if (!cles.has(brute)) {
            if (cles.size >= R.visuelsMax) brute = [...cles.keys()][cles.size - 1];
            else {
                const cle = "v" + (cles.size + 1);
                cles.set(brute, cle);
                visuels[cle] = {
                    Description: pnj ? (pnj.Description_Physique || descriptions.get(h.visuel) || "") : (descriptions.get(String(h.visuel || "").trim()) || r.description_physique || `${ROLES[x.m.archetype] || "créature"}, stature ${x.m.palier}`),
                    ...(pnj ? { PNJ: pnj.Nom_PNJ, Portrait: pnj.URL_Cloudinary || "" } : {})
                };
            }
        }
        const cle = cles.get(brute);
        return { ...x.m, nom, visuel: cle, description: visuels[cle] ? visuels[cle].Description : "", ...(pnj ? { pnj: pnj.Nom_PNJ, portrait: pnj.URL_Cloudinary || "" } : {}) };
    });
    return { creatures, visuels };
}
window.habillerEnnemisCombatRP = habiller;

// --- 4.5 LES PIONS --------------------------------------------------------
async function dessinerLesPions() {
    const c = etat();
    const visuels = (c.Ennemis && c.Ennemis.Visuels) || {};
    const restants = Object.keys(visuels).filter(k => !(c.Tokens && c.Tokens[k] !== undefined));
    const file = [...restants];
    const ouvrier = async () => {
        while (file.length) {
            const cle = file.shift();
            const v = visuels[cle] || {};
            let url = "";
            try {
                url = typeof window.fabriquerTokenIA === "function"
                    ? await window.fabriquerTokenIA({ portrait: v.Portrait || "", description: v.Description || "", sujet: v.PNJ ? "character" : "creature" })
                    : "";
            } catch (e) { console.error(`⚔️ [Pion ennemi] ${cle} :`, e); }
            // "" : le pion commun des ennemis le remplacera.
            await maj({ [`Combat_RP.Tokens.${cle}`]: url || "" });
            console.log(`⚔️ [Pion ennemi] ${v.PNJ || cle} ${url ? "prêt" : "— pion commun"}.`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(R.pionsEnParallele, file.length) }, ouvrier));
}

// --- 4.6 LA GRILLE --------------------------------------------------------
// Personne en mode DEV devant la boîte : la grille garde la taille de l'arène.
let minuteurGrille = null;
function grilleSansRegleur(c) {
    if (!c || !c.Carte || c.Grille) return;
    if (!minuteurGrille) minuteurGrille = setTimeout(() => { minuteurGrille = null; poursuivre(); }, Math.min(5000, R.grilleSansRegleurMs));
    if (teneurGrille(c)) return;
    if (Date.now() - (Number(c.Carte_Le) || 0) < R.grilleSansRegleurMs) return;
    const taille = Number(c.Apercu_Grille) || Number(c.Taille_Depart) || (window.PLATEAU_VTT && window.PLATEAU_VTT.hexSize) || 60;
    console.log("⚔️ [Combat du récit] Aucun joueur en mode DEV pour régler la grille : elle garde sa taille.");
    window.validerGrilleCombatRP(taille, { auto: true });
}

function teneurGrille(c) {
    const maintenant = Date.now();
    const frais = Object.entries((c && c.Regleurs) || {}).filter(([, r]) => r && maintenant - (Number(r.t) || 0) < R.regleurFraisMs);
    for (const id of R.prioritaires) if (frais.some(([x]) => x === id)) return id;
    frais.sort((a, b) => (Number(a[1].depuis) || 0) - (Number(b[1].depuis) || 0));
    return frais.length ? frais[0][0] : null;
}
window.teneurGrilleCombatRP = (c) => teneurGrille(c || etat());

window.validerGrilleCombatRP = async function(taille, options) {
    const c = etat();
    if (!c || c.Etat !== "preparation" || c.Grille) return false;
    const t = Math.max(20, Math.min(250, Math.round(Number(taille) || 60)));
    const auto = !!(options && options.auto);
    if (!auto && typeof window.jouerSonClic === "function") window.jouerSonClic();
    await setDoc(refVTT(), { Taille_Hex: t }, { merge: true });
    const ok = await transaction((data) => {
        const x = data.Combat_RP;
        if (!x || x.Id !== c.Id || x.Grille) return null;
        return { maj: { "Combat_RP.Grille": { Taille: t, Par: auto ? "auto" : idJoueur(), Le: Date.now() } } };
    });
    actualiserTout();
    if (ok) setTimeout(poursuivre, 0);
    return !!ok;
};

// --- 4.7 LA GRILLE NUMÉROTÉE ET LES TROIS PEINTURES -------------------------
// La géométrie du plateau (Plateau.js) : hexagones à bord plat, la case (0,0)
// au centre de l'image. Les cases dont le centre tombe dans l'image, numérotées
// de gauche à droite, demi-rangée par demi-rangée.
window.casesGrilleCombatRP = function(largeur, hauteur, taille) {
    const s = Number(taille) || 60;
    const cases = [];
    const rayon = Math.ceil(Math.sqrt(largeur * largeur + hauteur * hauteur) / 2 / s) + 1;
    for (let q = -rayon; q <= rayon; q++) {
        for (let r = -rayon * 2; r <= rayon * 2; r++) {
            const x = s * 1.5 * q + largeur / 2;
            const y = s * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) + hauteur / 2;
            if (x < 0 || x > largeur || y < 0 || y > hauteur) continue;
            cases.push({ q, r, x, y, cle: `${q},${r}` });
        }
    }
    const demi = s * Math.sqrt(3) / 2;
    cases.sort((a, b) => (Math.round(a.y / demi) - Math.round(b.y / demi)) || (a.x - b.x));
    cases.forEach((c, i) => { c.n = i + 1; });
    return cases;
};
const distanceHex = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

function chargerImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}
const urlAffichee = (url) => typeof window.redimensionnerImageCloudinary === "function" ? window.redimensionnerImageCloudinary(url, 2200) : url;

// L'image envoyée aux MIA : la carte, la grille, un petit numéro par case ;
// les cases déjà classées teintées (noir : mur, rouge : infranchissable,
// violet : difficile).
window.imageGrilleNumerotee = function(img, cases, taille, deja) {
    const L = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const toile = document.createElement("canvas");
    toile.width = L; toile.height = H;
    const ctx = toile.getContext("2d");
    ctx.drawImage(img, 0, 0, L, H);
    const s = Number(taille) || 60;
    const d = deja || {};
    const teinte = (cle) => d.murs && d.murs.has(cle) ? "rgba(0,0,0,0.62)"
        : d.inaccessibles && d.inaccessibles.has(cle) ? "rgba(200,20,20,0.5)"
        : d.difficiles && d.difficiles.has(cle) ? "rgba(140,60,190,0.5)" : null;
    cases.forEach(c => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 3 * i;
            const hx = c.x + s * Math.cos(a), hy = c.y + s * Math.sin(a);
            if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        const t = teinte(c.cle);
        if (t) { ctx.fillStyle = t; ctx.fill(); }
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.stroke();
    });
    // Les numéros : petits, pour ne pas masquer le terrain, mais lisibles.
    const police = Math.max(9, Math.round(s * 0.42));
    ctx.font = `bold ${police}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, police / 4);
    ctx.lineJoin = "round"; ctx.miterLimit = 2;
    cases.forEach(c => {
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(String(c.n), c.x, c.y);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(c.n), c.x, c.y);
    });
    return toile.toDataURL("image/jpeg", 0.85).split(",")[1];
};

const PEINTURES = [
    { cle: "murs", champ: "Tuiles_Murs", appliquer: "appliquerMurs", systeme: `Tu es MIA_PEINTURE_MURS. Voici une carte de bataille vue de dessus, couverte d'une grille d'hexagones NUMÉROTÉS.
Donne les numéros des hexagones qui sont des MURS : tout ce qui BLOQUE LA LIGNE DE VUE ET DE TIR — murs, cloisons, colonnes, piliers, gros rochers, troncs épais, falaises, bâtiments, statues massives, meubles hauts.
Un hexagone compte s'il est couvert en majeure partie par l'obstacle. Ne compte ni le sol, ni les ombres, ni les tapis, ni les petits objets.
Les hexagones teintés sont déjà classés : ne les renvoie pas.
Réponds UNIQUEMENT en JSON : {"cases": [12, 13, 47]} (une liste vide s'il n'y en a aucun).` },
    { cle: "inaccessibles", champ: "Tuiles_Supprimees", appliquer: "appliquerTuilesSupprimees", systeme: `Tu es MIA_PEINTURE_INACCESSIBLE. Voici une carte de bataille vue de dessus, couverte d'une grille d'hexagones NUMÉROTÉS.
Donne les numéros des hexagones où l'on ne peut PAS se tenir mais qui NE bloquent PAS la vue : eau profonde, rivière, lac, gouffre, fosse, vide, précipice, lave, marécage profond. Ces hexagones seront retirés de la grille.
Ne compte pas les murs ni les obstacles qui cachent la vue. Les hexagones teintés sont déjà classés : ne les renvoie pas.
Réponds UNIQUEMENT en JSON : {"cases": [3, 4, 5]} (une liste vide s'il n'y en a aucun).` },
    { cle: "difficiles", champ: "Tuiles_Difficiles", appliquer: "appliquerTerrainDifficile", systeme: `Tu es MIA_PEINTURE_DIFFICILE. Voici une carte de bataille vue de dessus, couverte d'une grille d'hexagones NUMÉROTÉS.
Donne les numéros des hexagones de sol praticable mais DIFFICILE : gravats, éboulis, caisses et tonneaux, mobilier renversé, boue, broussailles, ronces, eau peu profonde, escaliers, sol glissant, racines.
Pas les murs, pas les zones infranchissables. Les hexagones teintés sont déjà classés : ne les renvoie pas.
Réponds UNIQUEMENT en JSON : {"cases": [21, 22]} (une liste vide s'il n'y en a aucun).` }
];

const PROMPT_SPAWN = `Tu es MIA_SPAWN. Voici une carte de bataille vue de dessus avec sa grille d'hexagones NUMÉROTÉS ; les hexagones teintés sont des murs (noir), des zones infranchissables (rouge) ou du terrain difficile (violet). Voici aussi les derniers messages du récit.
Place :
- "heros" : l'hexagone où apparaissent les héros ;
- "ennemis" : l'hexagone où apparaissent les premiers ennemis ;
- "renforts" : 2 à 8 hexagones par où entrent les renforts ennemis — portes, fenêtres, passages, ouvertures ; en terrain ouvert, des cases libres sur les bords ou dans les coins de la carte.
Inspire-toi du récit pour les placer au mieux (une embuscade rapproche les ennemis, une charge les met face à face, des héros acculés contre un mur…). Ces hexagones doivent être praticables (jamais teintés en noir ou en rouge) ; héros et ennemis séparés d'au moins 4 hexagones.
Réponds UNIQUEMENT en JSON : {"heros": 31, "ennemis": 88, "renforts": [5, 120], "raison": "une phrase"}`;

async function peindreLeTerrain() {
    const c = etat();
    const taille = Number(c.Grille && c.Grille.Taille) || 60;
    // UNE CARTE ILLISIBLE ICI (ses pixels refusés) : pas de peinture, mais des
    // positions quand même, sur les dimensions du plateau.
    const lue = await chargerImage(urlAffichee(c.Carte));
    const img = lue && lue.naturalWidth ? lue : null;
    if (!img) console.warn("🖌️ [Combat du récit] Carte illisible : pas de peinture, positions par défaut.");
    const L = img ? img.naturalWidth : ((window.PLATEAU_VTT && window.PLATEAU_VTT.largeurLogique) || 1536);
    const H = img ? img.naturalHeight : ((window.PLATEAU_VTT && window.PLATEAU_VTT.hauteurLogique) || 1024);
    const cases = window.casesGrilleCombatRP(L, H, taille);
    const parNumero = new Map(cases.map(x => [x.n, x]));
    const deja = { murs: new Set(), inaccessibles: new Set(), difficiles: new Set() };
    const classee = (cle) => deja.murs.has(cle) || deja.inaccessibles.has(cle) || deja.difficiles.has(cle);
    const compte = {};
    for (const etape of PEINTURES) {
        let numeros = [];
        if (img) try {
            const r = await demanderJSON({ systeme: etape.systeme, temperature: 0.2, image: window.imageGrilleNumerotee(img, cases, taille, deja),
                texte: `La carte compte ${cases.length} hexagones, numérotés de 1 à ${cases.length}.` });
            numeros = Array.isArray(r && r.cases) ? r.cases : [];
        } catch (e) { console.error(`🖌️ [${etape.cle}] Peinture impossible :`, e); }
        let cles = [...new Set(numeros.map(n => parNumero.get(Number(n))).filter(Boolean).map(x => x.cle))].filter(k => !classee(k));
        // Une réponse qui couvrirait presque toute la carte est une erreur.
        if (cles.length > cases.length * 0.75) { console.warn(`🖌️ ${etape.cle} : ${cles.length} cases sur ${cases.length}, réponse écartée.`); cles = []; }
        deja[etape.cle] = new Set(cles);
        compte[etape.cle] = cles.length;
        await setDoc(refVTT(), { [etape.champ]: cles }, { merge: true });
        if (typeof window[etape.appliquer] === "function") window[etape.appliquer](cles);
        await maj({ [`Combat_RP.Peinture.${etape.cle}`]: cles.length });
        console.log(`🖌️ [${etape.cle}] ${cles.length} case(s) peinte(s).`);
    }

    // LES POSITIONS (MIA_SPAWN).
    const praticable = (x) => x && !deja.murs.has(x.cle) && !deja.inaccessibles.has(x.cle);
    let r = null;
    if (img) try {
        r = await demanderJSON({ systeme: PROMPT_SPAWN, temperature: 0.4, image: window.imageGrilleNumerotee(img, cases, taille, deja),
            texte: `La carte compte ${cases.length} hexagones.\n\n--- LES ${R.messagesSpawn} DERNIERS MESSAGES DU RÉCIT ---\n${await lireMessages(R.messagesSpawn)}` });
    } catch (e) { console.error("[MIA_SPAWN] Placement impossible :", e); }
    const libres = cases.filter(praticable);
    const auPlusPres = (cible) => libres.slice().sort((a, b) => Math.hypot(a.x - cible.x, a.y - cible.y) - Math.hypot(b.x - cible.x, b.y - cible.y))[0] || null;
    let heros = parNumero.get(Number(r && r.heros));
    if (!praticable(heros)) heros = auPlusPres(heros || { x: L * 0.22, y: H * 0.5 });
    let ennemis = parNumero.get(Number(r && r.ennemis));
    if (!praticable(ennemis) || (heros && ennemis && distanceHex(heros, ennemis) < 3)) {
        ennemis = auPlusPres(heros && heros.x < L / 2 ? { x: L * 0.78, y: H * 0.5 } : { x: L * 0.22, y: H * 0.5 });
    }
    let renforts = [...new Set(((r && r.renforts) || []).map(n => parNumero.get(Number(n))).filter(praticable))];
    if (renforts.length === 0) {
        // EN TERRAIN OUVERT : les bords, du côté des ennemis d'abord.
        const bord = libres.filter(x => x.x < taille * 1.6 || x.x > L - taille * 1.6 || x.y < taille * 1.6 || x.y > H - taille * 1.6);
        const cote = (x) => ennemis ? Math.hypot(x.x - ennemis.x, x.y - ennemis.y) : 0;
        renforts = bord.sort((a, b) => cote(a) - cote(b)).filter((x, i, l) => l.slice(0, i).every(y => distanceHex(x, y) >= 3)).slice(0, 4);
    }
    const spawns = renforts.map(x => x.cle);
    await setDoc(refVTT(), { Tuiles_Spawn_Ennemis: spawns }, { merge: true });
    if (typeof window.appliquerSpawnEnnemis === "function") window.appliquerSpawnEnnemis(spawns);
    const reperes = {
        ...(heros ? { Spawn_Allies: { q: heros.q, r: heros.r } } : {}),
        ...(ennemis ? { Spawn_Ennemis: { q: ennemis.q, r: ennemis.r } } : {})
    };
    if (window.PARTIE_DATA) Object.assign(window.PARTIE_DATA, reperes);
    console.log(`🚩 [MIA_SPAWN] Héros en ${heros ? heros.n : "?"}, ennemis en ${ennemis ? ennemis.n : "?"}, ${spawns.length} case(s) de renfort. ${(r && r.raison) || ""}`);
    await maj({ ...reperes, "Combat_RP.Peint": true, "Combat_RP.Positions": { Heros: heros ? heros.n : 0, Ennemis: ennemis ? ennemis.n : 0, Renforts: spawns.length } });
}

// --- 4.8 LE DÉPLOIEMENT ---------------------------------------------------
// Le plateau de CE poste doit porter la carte, la grille et ses couches avant
// d'y poser qui que ce soit.
async function plateauPret(c) {
    const vtt = (await getDoc(refVTT())).data() || {};
    if (typeof window.appliquerTerrain === "function") window.appliquerTerrain(vtt.URL_Map || c.Carte, Number(vtt.Taille_Hex) || 60, vtt.Opacite_Grille !== undefined ? vtt.Opacite_Grille : 0.8);
    const img = $("image-map-vtt");
    for (let i = 0; i < 50 && img && !(img.complete && img.naturalWidth > 0); i++) await attendre(100);
    [["Tuiles_Supprimees", "appliquerTuilesSupprimees"], ["Tuiles_Murs", "appliquerMurs"], ["Tuiles_Difficiles", "appliquerTerrainDifficile"], ["Tuiles_Spawn_Ennemis", "appliquerSpawnEnnemis"]]
        .forEach(([champ, f]) => { if (typeof window[f] === "function") window[f](vtt[champ] || []); });
}

async function deployer() {
    const c = etat();
    const partie = await lirePartie();
    window.PARTIE_DATA = { ...(window.PARTIE_DATA || {}), Spawn_Allies: partie.Spawn_Allies, Spawn_Ennemis: partie.Spawn_Ennemis };
    await plateauPret(c);
    // LES HÉROS autour de leur repère…
    if (typeof window.genererTokensCombat === "function") await window.genererTokensCombat();
    // …PUIS LA RENCONTRE, déjà tirée et habillée, chacun avec son pion.
    const pions = c.Tokens || {};
    const vetir = (m) => ({ ...m, token: pions[m.visuel] || "" });
    const tirage = { ...c.Ennemis.Tirage, depart: c.Ennemis.Tirage.depart.map(vetir), renforts: c.Ennemis.Tirage.renforts.map(vetir) };
    await window.genererRencontreMonstres(c.Ennemis.Apparition, { tirage });
    await transaction((data) => {
        const x = data.Combat_RP;
        if (!x || x.Id !== c.Id || x.Etat !== "preparation") return null;
        return { maj: { "Combat_RP.Etat": "en_cours", "Combat_RP.Deploye": true, "Combat_RP.ID_Rencontre": data.ID_Rencontre || "", "Combat_RP.Pret_Le": Date.now() } };
    });
    console.log("⚔️ [Combat du récit] Tout est prêt : le combat commence.");
    actualiserTout();
}

// =========================================================================
//  5. LA FIN : LE RETOUR AU RÉCIT, LE MJ
// =========================================================================
const retours = new Set();
function retourAuRecit(idRencontre) {
    if (!idRencontre || retours.has(idRencontre)) return;
    retours.add(idRencontre);
    const fenetre = $("fenetre-combat");
    if (fenetre && fenetre.style.display === "block" && typeof window.fermerCombat === "function") {
        try { window.fermerCombat(); } catch (e) { console.error(e); }
    }
    const butin = $("fenetre-butin");
    if (butin) butin.style.display = "none";
    const jeu = $("ecran-jeu");
    const chat = $("fenetre-chatbox");
    if (jeu && jeu.style.display !== "none" && typeof window.ouvrirChatbox === "function" && !(chat && chat.style.display === "flex")) {
        try { window.ouvrirChatbox(); } catch (e) { console.error(e); }
    }
    console.log("📜 [Combat du récit] Retour au récit.");
}
window.retourAuRecitCombatRP = retourAuRecit;

// La défaite : chacun revient quand son grand « Défaite » (et ses blessures)
// s'est refermé.
const attentesDefaite = new Set();
function revenirApresDefaite(idRencontre) {
    if (attentesDefaite.has(idRencontre) || retours.has(idRencontre)) return;
    attentesDefaite.add(idRencontre);
    const debut = Date.now();
    const verifier = () => {
        const v = $("fin-combat-voile");
        const visible = v && v.style.display !== "none" && v.innerHTML.trim() !== "";
        if ((!visible && Date.now() - debut > 3500) || Date.now() - debut > 120000) retourAuRecit(idRencontre);
        else setTimeout(verifier, 500);
    };
    setTimeout(verifier, 1500);
}

// LE RÉSUMÉ ENVOYÉ AU MJ (Nico : « on lui envoie si la bataille a été
// remportée ou non, et si non quelles sont les blessures ; si c'est en
// intérieur, le lieu est saccagé ; en cas de défaite, il compose avec les
// blessures et invente une suite s'ils sont encore en vie »).
window.resumeCombatPourMJ = function(c, fin) {
    const victoire = !fin || fin.issue !== "defaite";
    const tirage = (c && c.Ennemis && c.Ennemis.Tirage) || { depart: [], renforts: [] };
    const adversaires = [...(tirage.depart || []), ...(tirage.renforts || [])];
    const lignes = ["--- LE COMBAT QUI VIENT DE S'ACHEVER ---"];
    lignes.push(victoire ? "Issue : les héros ont REMPORTÉ la bataille." : "Issue : les héros ont PERDU la bataille — tous sont tombés.");
    if (c && c.Lieu) lignes.push(`Lieu du combat : ${c.Lieu.Titre || ""}${c.Lieu.Interieur ? " (à l'intérieur)" : ""}.`);
    if (adversaires.length) lignes.push(`Les adversaires : ${adversaires.slice(0, 12).map(m => m.nom + (m.pnj ? " (PNJ nommé)" : "")).join(", ")}${adversaires.length > 12 ? "…" : ""}.`);
    const blessures = Object.values((fin && fin.blessures) || {});
    if (!victoire) {
        if (blessures.length) {
            lignes.push("Les blessures des héros tombés :");
            blessures.forEach(b => {
                const t = (b.tirages || []);
                const mort = t.some(x => x.id === "BLE_MORT");
                lignes.push(`- ${b.nom} : ${mort ? "MORT — il ne se relèvera pas" : t.map(x => `${x.nom} (${x.texte})`).join(" ; ")}`);
            });
        } else lignes.push("Aucune blessure durable n'est à signaler.");
    }
    lignes.push("CONSIGNES ABSOLUES POUR TA RÉPONSE :");
    lignes.push("- Ne rejoue pas le combat coup par coup : raconte la fin de l'affrontement et ce qui suit immédiatement.");
    if (victoire) lignes.push("- Les ennemis sont vaincus (morts, à terre ou en fuite, selon ce qui est crédible) ; les héros reprennent leur souffle.");
    else lignes.push("- Les héros ont perdu : compose avec leurs blessures. Pour ceux qui sont encore en vie, invente une suite crédible (capturés, laissés pour morts, dépouillés, secourus, réveillés plus tard…). Ceux qui sont morts ne reviennent pas.");
    if (c && c.Lieu && c.Lieu.Interieur) lignes.push("- Le combat a eu lieu à l'intérieur : le lieu est SACCAGÉ par la violence des combats (mobilier brisé, objets renversés, traces de lutte et de sang). Décris-le et tiens-en compte dans la suite.");
    return lignes.join("\n");
};

const narrationsVues = new Set();
async function raconterLaFin(c, fin) {
    if (narrationsVues.has(c.Id)) return;
    // Le MJ demande toutes les clés : un poste qui ne les a pas laisse la main.
    if (!aLesCles()) { surveillerFinSansNarrateur(c); return; }
    narrationsVues.add(c.Id);
    const pris = await transaction((data) => {
        const x = data.Combat_RP;
        if (!x || x.Id !== c.Id || x.Etat !== "en_cours") return null;
        return { maj: { "Combat_RP.Etat": "narration", "Combat_RP.Narrateur": moi(), "Combat_RP.Issue": fin.issue, "Combat_RP.Narration_Le": Date.now() } };
    });
    if (!pris) return;
    await attendre((R.narrationApresMs || {})[fin.issue === "defaite" ? "defaite" : "victoire"] || 3000);
    const resume = window.resumeCombatPourMJ(c, fin);
    console.log("📜 [Combat du récit] Le MJ reprend :\n" + resume);
    try {
        const date = window.DATE_EN_JEU_ACTUELLE || {};
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE, ...AUTEUR_DESTIN,
            Texte: fin.issue === "defaite"
                ? "*Le fracas des armes retombe. Les héros gisent au sol.* (Narrateur, raconte ce qu'il advient d'eux.)"
                : "*Le fracas des armes retombe : le dernier ennemi est tombé.* (Narrateur, raconte la fin du combat.)",
            Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
        });
    } catch (e) { console.error("Message de fin de combat :", e); }
    try { if (typeof window.declencherTourIA === "function") await window.declencherTourIA({ issueCombat: resume }); }
    catch (e) { console.error("Le MJ après le combat :", e); }
    await rendreLArene(c);
    await transaction((data) => (data.Combat_RP && data.Combat_RP.Id === c.Id) ? { maj: { Combat_RP: deleteField() } } : null);
    actualiserTout();
}

// PERSONNE NE PEUT RÉVEILLER LE MJ (aucun poste n'a les clés) : le combat du
// récit se clôt quand même, le chat se rouvre.
const finsSansNarrateur = {};
function surveillerFinSansNarrateur(c) {
    if (finsSansNarrateur[c.Id]) return;
    finsSansNarrateur[c.Id] = setTimeout(async () => {
        const ok = await transaction((data) => (data.Combat_RP && data.Combat_RP.Id === c.Id && data.Combat_RP.Etat === "en_cours")
            ? { maj: { Combat_RP: deleteField() } } : null);
        if (ok) { console.warn("📜 [Combat du récit] Aucun poste n'a les clés du MJ : le récit reprend sans lui."); rendreLArene(c); actualiserTout(); }
    }, R.narrationBloqueeMs / 2);
}

// L'ARÈNE RETROUVE SA CARTE, sa grille et ses couches, une fois le plateau
// nettoyé du combat du récit.
async function rendreLArene(c) {
    try {
        const idR = c && c.ID_Rencontre;
        for (let i = 0; i < 60 && idR && (lirePartieVue().ID_Rencontre === idR); i++) await attendre(500);
        const snap = await getDoc(refVTT());
        const vtt = snap && snap.exists() ? snap.data() : {};
        if (!vtt.Arene_Sauvegarde) return;
        await setDoc(refVTT(), { ...vtt.Arene_Sauvegarde, Arene_Sauvegarde: deleteField(), Carte_RP: deleteField() }, { merge: true });
        console.log("🏛️ [Combat du récit] L'arène retrouve sa carte.");
    } catch (e) { console.error("Retour de l'arène :", e); }
}

const debutsAbandon = {};
function suivreLaFin(c, p) {
    const idR = c.ID_Rencontre;
    if (!idR) return;
    const fin = p.Fin_Combat && p.Fin_Combat.idRencontre === idR ? p.Fin_Combat : null;
    if (!fin) {
        // LE COMBAT A DISPARU DU PLATEAU (réinitialisé à la main) : le récit
        // reprend sans lui.
        if (p.ID_Rencontre !== idR && !p.Reinitialisation_En_Cours) {
            debutsAbandon[c.Id] = debutsAbandon[c.Id] || Date.now();
            if (Date.now() - debutsAbandon[c.Id] > R.abandonMs) {
                delete debutsAbandon[c.Id];
                transaction((data) => (data.Combat_RP && data.Combat_RP.Id === c.Id && !(data.Fin_Combat && data.Fin_Combat.idRencontre === idR)) ? { maj: { Combat_RP: deleteField() } } : null)
                    .then(ok => { if (ok) { console.log("⚔️ Le combat du récit a disparu du plateau : le récit reprend."); rendreLArene(); } });
            } else setTimeout(() => suivreLaFin(etat() || c, lirePartieVue()), R.abandonMs + 200);
        } else delete debutsAbandon[c.Id];
        return;
    }
    if (fin.issue === "defaite") {
        revenirApresDefaite(idR);
        raconterLaFin(c, fin);
        return;
    }
    const butin = p.Butin && p.Butin.idRencontre === idR ? p.Butin : null;
    const reparti = !!butin && (butin.etape === "termine" || butin.resolu);
    if (!reparti) return;
    if (butin.ouvert === false) {
        retourAuRecit(idR);
        raconterLaFin(c, fin);
        return;
    }
    // Un butin réparti que personne ne referme : on le referme pour tous.
    if (!vuReparti[idR]) {
        vuReparti[idR] = Date.now();
        setTimeout(() => { const x = etat(); if (x && x.Id === c.Id) suivreLaFin(x, lirePartieVue()); }, R.butinOublieMs + 200);
    }
    if (Date.now() - vuReparti[idR] > R.butinOublieMs && typeof window.fermerFenetreButin === "function") window.fermerFenetreButin();
}
const vuReparti = {};

// LA DERNIÈRE FENÊTRE DE BUTIN, refermée de la croix : ce joueur revient au
// récit (Nico : « quand on ferme la dernière fenêtre de loot »).
const fermerButinLocalementAvant = window.fermerButinLocalement;
if (typeof fermerButinLocalementAvant === "function") {
    window.fermerButinLocalement = function(...args) {
        const r = fermerButinLocalementAvant.apply(this, args);
        const c = etat();
        const butin = lirePartieVue().Butin;
        if (c && c.ID_Rencontre && butin && butin.idRencontre === c.ID_Rencontre && (butin.etape === "termine" || butin.resolu)) {
            retourAuRecit(c.ID_Rencontre);
        }
        return r;
    };
}

// =========================================================================
//  6. CE QUE CHACUN VOIT
// =========================================================================
// --- 6.1 LE PARCHEMIN : « Le destin hésite… », puis COMBATTRE ------------
let recitEnAttente = null;
window.finRecitCombat = function(ts, ctx) {
    const c = etat();
    if (!c || !ts || Number(c.Message) !== Number(ts)) return false;
    if (!["detection", "preparation", "en_cours"].includes(c.Etat)) return false;
    if (c.Etat === "detection" && Date.now() - (Number(c.Le) || 0) > R.attenteVerdictMs * 3) return false;
    recitEnAttente = { ts: Number(ts), fermer: (ctx && ctx.fermer) || (() => {}), debut: Date.now() };
    dessinerFinRecit(c);
    setTimeout(() => {
        const x = etat();
        if (recitEnAttente && recitEnAttente.ts === Number(ts) && (!x || x.Etat === "detection")) fermerRecit();
    }, R.attenteVerdictMs);
    return true;
};
function fermerRecit() {
    const r = recitEnAttente;
    recitEnAttente = null;
    const fin = $("fin-recit-combat");
    if (fin) fin.remove();
    if (r) r.fermer();
}
function dessinerFinRecit(c) {
    const ecran = $("ecran-recit-dynamique");
    if (!ecran || !recitEnAttente) return;
    let fin = $("fin-recit-combat");
    if (!fin) {
        fin = document.createElement("div");
        fin.id = "fin-recit-combat";
        fin.className = "fin-recit-combat";
        fin.addEventListener("click", (e) => e.stopPropagation());
        ecran.appendChild(fin);
    }
    ["contenu-texte-recit", "nom-recit-dynamique", "portrait-recit-dynamique"].forEach(id => { const el = $(id); if (el) el.style.opacity = "0"; });
    const etatFin = c.Etat === "detection" ? "attente" : "combat";
    if (fin.dataset.etat === etatFin) return;
    fin.dataset.etat = etatFin;
    if (etatFin === "attente") {
        fin.innerHTML = `<div class="destin-hesite">Le destin hésite…</div>`;
        return;
    }
    const gouttes = [8, 19, 31, 46, 58, 71, 84, 93].map((x, i) =>
        `<span class="goutte-sang" style="left:${x}%; animation-delay:${(i * 0.37) % 2.2}s; --h:${14 + (i * 7) % 16}px"></span>`).join("");
    fin.innerHTML = `<div class="fin-recit-combat-titre">${echapper(c.Adversaires ? "Face à " + c.Adversaires : "Le combat éclate")}</div>
        <button type="button" class="bouton-combattre" id="bouton-combattre">
            <span class="bouton-combattre-eclats"></span>
            <span class="bouton-combattre-mot">Combattre</span>
            ${gouttes}
        </button>`;
    if (typeof window.jouerSonEvenement === "function") { try { window.jouerSonEvenement("gong-blessure"); } catch (e) {} }
    $("bouton-combattre").onclick = (e) => {
        e.stopPropagation();
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        fermerRecit();
        window.rejoindreCombatRP();
    };
}
function actualiserRecit(c) {
    if (!recitEnAttente) return;
    if (!c || Number(c.Message) !== recitEnAttente.ts || c.Etat === "aucun") { fermerRecit(); return; }
    dessinerFinRecit(c);
}

// --- 6.2 REJOINDRE LE COMBAT ----------------------------------------------
window.rejoindreCombatRP = function() {
    const c = etat();
    if (!c || !["preparation", "en_cours"].includes(c.Etat)) return false;
    if (typeof window.fermerPopupRencontre === "function") { const m = $("modale-pre-combat"); if (m && m.style.display !== "none") window.fermerPopupRencontre(); }
    if (typeof window.ouvrirCombat === "function") window.ouvrirCombat();
    actualiserTout();
    return true;
};

// --- 6.3 LES DEUX ENCARTS (le bouton de combat) ---------------------------
function actualiserEncarts() {
    const c = etat();
    const encart = $("encart-combat-en-cours");
    const texte = $("encart-combat-en-cours-texte");
    const arene = $("encart-arene");
    const dev = $("encart-combat-dev");
    if (!encart) return;
    const actif = window.combatRPActif();
    const rejoignable = !!c && ["preparation", "en_cours"].includes(c.Etat);
    encart.classList.toggle("inactif", !rejoignable);
    encart.classList.toggle("en-preparation", !!c && c.Etat === "preparation");
    if (texte) texte.innerHTML = !c || !actif ? "Aucun combat en cours dans cette partie."
        : c.Etat === "preparation" ? `Le champ de bataille se prépare…${c.Adversaires ? `<br><em>${echapper(c.Adversaires)}</em>` : ""}<br><strong>Rejoindre</strong>`
        : c.Etat === "en_cours" ? `La bataille fait rage${c.Lieu && c.Lieu.Titre ? ` — ${echapper(c.Lieu.Titre)}` : ""}.<br><strong>Rejoindre le combat</strong>`
        : "Le combat s'achève : le récit reprend…";
    if (arene) {
        arene.classList.toggle("inactif", actif);
        const note = arene.querySelector(".encart-combat-note");
        if (note) note.textContent = actif ? "Fermée tant que le combat du récit n'est pas terminé." : "";
    }
    if (dev) {
        dev.style.display = estDev() ? "flex" : "none";
        const forcer = $("btn-forcer-combat-rp"), abandon = $("btn-abandonner-combat-rp");
        if (forcer) forcer.style.display = actif ? "none" : "inline-block";
        if (abandon) abandon.style.display = actif ? "inline-block" : "none";
    }
}
window.actualiserEncartsCombatRP = actualiserEncarts;

// --- 6.4 LE CHAT : « Combat en cours » à la place de la saisie ------------
function actualiserChat() {
    const c = etat();
    const chat = $("fenetre-chatbox");
    const saisie = $("zone-saisie-chat");
    if (!chat || !saisie) return;
    let bandeau = $("bandeau-combat-chat");
    const actif = window.combatRPActif();
    if (!actif) {
        if (bandeau) bandeau.style.display = "none";
        saisie.style.display = "";
        return;
    }
    if (!bandeau) {
        bandeau = document.createElement("div");
        bandeau.id = "bandeau-combat-chat";
        bandeau.className = "bandeau-combat-chat";
        saisie.parentNode.insertBefore(bandeau, saisie);
    }
    bandeau.style.display = "flex";
    saisie.style.display = "none";
    const contenu = c.Etat === "narration"
        ? `<span class="bandeau-combat-mot">⚔️ Le combat s'achève</span><span class="bandeau-combat-sous">Le récit reprend…</span>`
        : `<span class="bandeau-combat-mot">⚔️ Combat en cours</span><span class="bandeau-combat-sous">${c.Etat === "preparation" ? "Le champ de bataille se prépare…" : "La bataille fait rage."}</span>
           <button type="button" class="bandeau-combat-bouton" onclick="window.jouerSonClic && window.jouerSonClic(); window.rejoindreCombatRP()">Rejoindre le combat</button>`;
    if (bandeau.dataset.contenu !== contenu) { bandeau.dataset.contenu = contenu; bandeau.innerHTML = contenu; }
}

// --- 6.5 LA FENÊTRE DE COMBAT PENDANT LA PRÉPARATION -----------------------
const MOTS_ATTENTE = [
    "Les éclaireurs reconnaissent le terrain…",
    "Le sol se dessine sous vos pieds…",
    "Des silhouettes se dessinent dans la pénombre…",
    "Les armes sortent des fourreaux…",
    "Le vent apporte l'odeur du fer…"
];
function etapesPreparation(c) {
    return [
        { nom: "Le champ de bataille", fait: !!c.Carte },
        { nom: "Les ennemis", fait: pionsPrets(c) },
        { nom: "La grille", fait: !!c.Grille },
        { nom: "Le terrain étudié", fait: !!c.Peint },
        { nom: "Les positions", fait: !!c.Deploye }
    ];
}
let voileMontre = false;
function actualiserFenetreCombat() {
    const c = etat();
    const fenetre = $("fenetre-combat");
    if (!fenetre) return;
    let voile = $("voile-combat-rp");
    const ouverte = fenetre.style.display === "block";
    const prep = ouverte && !!c && c.Etat === "preparation";
    if (!prep) {
        // Tout est en place sous les yeux du joueur : le « Tour 1 » qu'on avait
        // retenu pendant la préparation.
        if (voileMontre && ouverte && c && c.Etat === "en_cours" && typeof window.verifierChangementTour === "function") {
            window.DERNIER_TOUR_AFFICHE = 0;
            window.verifierChangementTour(Number(lirePartieVue().Tour_Combat) || 1);
        }
        voileMontre = false;
        if (voile) voile.style.display = "none";
        const boite = $("boite-grille-rp");
        if (boite) boite.style.display = "none";
        arreterRegleur();
        return;
    }
    if (!voile) {
        voile = document.createElement("div");
        voile.id = "voile-combat-rp";
        voile.className = "voile-combat-rp";
        fenetre.appendChild(voile);
    }
    voile.style.display = "flex";
    voileMontre = true;
    voile.classList.toggle("plein", !c.Carte);
    voile.classList.toggle("bandeau", !!c.Carte);
    const mot = MOTS_ATTENTE[Math.floor(Date.now() / 6000) % MOTS_ATTENTE.length];
    const contenu = `<div class="voile-combat-rp-titre">${c.Carte ? "Les ennemis se préparent…" : "Création du champ de bataille en cours…"}</div>
        <div class="voile-combat-rp-sous">${echapper(c.Lieu && c.Lieu.Titre ? c.Lieu.Titre : mot)}</div>
        <div class="voile-combat-rp-etapes">${etapesPreparation(c).map(e => `<span class="${e.fait ? "fait" : ""}">${e.fait ? "✔" : "…"} ${e.nom}</span>`).join("")}</div>`;
    if (voile.dataset.contenu !== contenu) { voile.dataset.contenu = contenu; voile.innerHTML = contenu; }
    actualiserBoiteGrille(c);
}

// --- 6.6 LA BOÎTE DE LA GRILLE (mode DEV) --------------------------------
let minuteurRegleur = null;
let apercuEnvoye = null;
let minuteurApercu = null;
function arreterRegleur() {
    if (minuteurRegleur) { clearInterval(minuteurRegleur); minuteurRegleur = null; }
}
function inscrireRegleur(c) {
    const ecrire = () => {
        const x = etat();
        if (!x || x.Id !== c.Id || x.Grille || !x.Carte) { arreterRegleur(); return; }
        const deja = (x.Regleurs || {})[idJoueur()];
        maj({ [`Combat_RP.Regleurs.${idJoueur()}`]: { nom: nomJoueur(), t: Date.now(), depuis: (deja && deja.depuis) || Date.now() } }).catch(() => {});
    };
    if (minuteurRegleur) return;
    ecrire();
    minuteurRegleur = setInterval(ecrire, Math.max(1000, Math.round(R.regleurFraisMs / 2.5)));
}
function actualiserBoiteGrille(c) {
    let boite = $("boite-grille-rp");
    const montrer = !!c && !!c.Carte && !c.Grille && estDev();
    if (!montrer) { if (boite) boite.style.display = "none"; arreterRegleur(); return; }
    if (!boite) {
        boite = document.createElement("div");
        boite.id = "boite-grille-rp";
        boite.className = "boite-grille-rp";
        boite.innerHTML = `<div class="boite-grille-titre">La grille du champ de bataille</div>
            <div class="boite-grille-aide">Ajuste les hexagones sur le dessin, puis valide : l'IA étudiera ensuite le terrain.</div>
            <div class="boite-grille-reglage">
                <button type="button" data-d="-5">−5</button><button type="button" data-d="-1">−</button>
                <span class="boite-grille-valeur" id="boite-grille-valeur">60</span>
                <button type="button" data-d="1">+</button><button type="button" data-d="5">+5</button>
            </div>
            <div class="boite-grille-qui" id="boite-grille-qui"></div>
            <button type="button" class="boite-grille-valider" id="boite-grille-valider">Valider la grille</button>`;
        boite.addEventListener("click", (e) => e.stopPropagation());
        boite.querySelectorAll("[data-d]").forEach(b => b.onclick = () => changerGrille(Number(b.dataset.d)));
        $("fenetre-combat").appendChild(boite);
        $("boite-grille-valider").onclick = () => window.validerGrilleCombatRP(window.PLATEAU_VTT ? window.PLATEAU_VTT.hexSize : 60);
    }
    boite.style.display = "flex";
    inscrireRegleur(c);
    const teneur = teneurGrille(c);
    const aLaMain = !teneur || teneur === idJoueur();
    boite.classList.toggle("en-lecture", !aLaMain);
    boite.querySelectorAll("button").forEach(b => { b.disabled = !aLaMain; });
    const qui = $("boite-grille-qui");
    if (qui) qui.textContent = aLaMain ? "C'est toi qui règles la grille." : `${((c.Regleurs || {})[teneur] || {}).nom || "Un joueur"} règle la grille…`;
    // Celui qui n'a pas la main voit la grille de celui qui l'a.
    if (!aLaMain && Number(c.Apercu_Grille) > 0 && window.PLATEAU_VTT && window.PLATEAU_VTT.hexSize !== Number(c.Apercu_Grille)) poserTailleLocale(Number(c.Apercu_Grille));
    const valeur = $("boite-grille-valeur");
    if (valeur && window.PLATEAU_VTT) valeur.textContent = String(window.PLATEAU_VTT.hexSize);
}
function poserTailleLocale(t) {
    const P = window.PLATEAU_VTT;
    if (!P) return;
    P.hexSize = t; P.hexWidth = 2 * t; P.hexHeight = Math.sqrt(3) * t;
    const label = $("label-taille-hexa");
    if (label) label.innerText = t;
    P.renderMap();
    if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA || {});
    const valeur = $("boite-grille-valeur");
    if (valeur) valeur.textContent = String(t);
}
function changerGrille(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const P = window.PLATEAU_VTT;
    if (!P) return;
    poserTailleLocale(Math.max(20, Math.min(250, P.hexSize + delta)));
    clearTimeout(minuteurApercu);
    minuteurApercu = setTimeout(() => {
        if (apercuEnvoye === P.hexSize) return;
        apercuEnvoye = P.hexSize;
        maj({ "Combat_RP.Apercu_Grille": P.hexSize }).catch(() => {});
    }, 300);
}
window.changerGrilleCombatRP = changerGrille;

// =========================================================================
//  7. À CHAQUE NOUVELLE DE LA PARTIE (app.js)
// =========================================================================
function actualiserTout() {
    try { actualiserChat(); } catch (e) { console.error("Combat du récit (chat) :", e); }
    try { actualiserEncarts(); } catch (e) { console.error("Combat du récit (encarts) :", e); }
    try { actualiserFenetreCombat(); } catch (e) { console.error("Combat du récit (fenêtre) :", e); }
}
window.actualiserCombatRPAffichage = actualiserTout;

window.appliquerCombatRPDeLaPartie = function(p) {
    partieVue = p || {};
    const c = etat(partieVue);
    actualiserRecit(c);
    actualiserTout();
    if (!c) return;
    if (c.Etat === "preparation") {
        if (estCreateur(c)) poursuivre();
        else verifierRelais(c);
    } else if (c.Etat === "en_cours") {
        suivreLaFin(c, partieVue);
    } else if (c.Etat === "narration" && Date.now() - (Number(c.Narration_Le) || 0) > R.narrationBloqueeMs) {
        transaction((data) => (data.Combat_RP && data.Combat_RP.Id === c.Id && data.Combat_RP.Etat === "narration") ? { maj: { Combat_RP: deleteField() } } : null);
    }
};

// Le texte du bandeau d'attente change de temps en temps.
setInterval(() => { if (window.combatRPEnPreparation()) actualiserFenetreCombat(); }, 6000);
