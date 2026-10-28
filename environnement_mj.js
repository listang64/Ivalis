// =========================================================================
//  IVALIS — OÙ SONT LES HÉROS : CE QUE LE MAÎTRE DU JEU EN SAIT (v276)
// =========================================================================
//  Nico : « un outil IA qui envoie à l'IA MJ dans quel décor se trouvent les
//  héros. S'ils ne sont pas dans un lieu connu, ils sont "dans la nature" : le
//  MJ peut inventer des rencontres, mais pas des bâtiments sortis de nulle
//  part. Dans la nature, on découpe un carré autour d'eux et on l'envoie en
//  image de référence à une IA qui analyse le terrain (forêt, mer, village…),
//  et on l'envoie au MJ narrateur chaque fois qu'il doit répondre — avec le
//  point exact où se trouve le groupe. Un message dans la console avec le
//  descriptif envoyé, pour que je contrôle. On raccorde le descriptif de la
//  région où sont les joueurs. »
//
//  MIA_TERRAIN : le carré (25 % de la hauteur de la carte régionale, centré
//  sur le groupe, rentré dans l'image près des bords), le point rouge cerclé
//  de blanc là où se tient le groupe, les villages dessinés par-dessus comme à
//  l'écran ; Gemini le lit (le nord en haut) et rend le terrain sous le
//  groupe, ses alentours, ce qui s'y voit.
//
//  UNE FOIS PAR POSITION (Nico : « 1. Ok ») : le résultat est gardé dans la
//  partie (Analyse_Terrain, avec la clé de la position) ; il est refait quand
//  le groupe a bougé (camp, arrivée, téléport — voyage_groupe.js le prépare
//  aussitôt), et renvoyé tel quel au MJ à chacune de ses réponses.
//
//  CE QUE REÇOIT LE MJ (contexteEnvironnementMJ, ia_master.js) :
//    · dans la nature : la région, la position, le terrain analysé, les lieux
//      connus à proximité (avec la direction et le temps de marche), et la
//      consigne : des rencontres, oui ; aucun bâtiment inventé ;
//    · dans un lieu connu : la région et le lieu (sa fiche est déjà jointe) ;
//    · dans les deux cas : le descriptif RP de la région et son lore.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COTE_DECOUPE = 0.25;           // le carré, en part de la hauteur de la carte
const COTE_ENVOI_MAX = 768;          // pixels envoyés à l'IA (au plus)
const PROXIMITE_JOURS = 2;           // les lieux connus plus loin ne sont pas cités
const SITUATION_NATURE = "Dans la nature";
const DIRECTIONS = ["à l'est", "au sud-est", "au sud", "au sud-ouest", "à l'ouest", "au nord-ouest", "au nord", "au nord-est"];

const borne = (v, min, max) => Math.max(min, Math.min(max, v));
const arrondi = (v) => Math.round(v * 1000) / 1000;
const refPartie = () => doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
const distanceJour = () => Number(window.DISTANCE_JOUR_VOYAGE) || 0.3;
const aspect = (n) => (typeof window.aspectCarteRegionale === "function" ? window.aspectCarteRegionale(n) : 1.6);
const carte = (n) => (window.CARTES_REGIONALES || {})[n] || null;

// --- OÙ EST LE GROUPE ------------------------------------------------------
// La position (Position_Groupe, ou le village du Lieu_Actuel) et sa place sur
// la carte régionale (le cœur du terrain quand elle n'est pas dite).
function positionDe(partie) {
    const p = partie && partie.Position_Groupe;
    let pos = null;
    if (p && Number(p.Region) > 0) pos = { Region: Number(p.Region), x: p.x, y: p.y };
    else {
        const v = partie && partie.Lieu_Actuel && (window.VILLAGES_REGIONAUX || {})[partie.Lieu_Actuel];
        if (v && v.numero > 0) pos = { Region: v.numero, x: v.x, y: v.y };
    }
    if (!pos) return null;
    if (!(Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) || pos.x === null || pos.y === null) {
        const c = typeof window.centreTerrainRegion === "function" ? window.centreTerrainRegion(pos.Region) : { x: 0.5, y: 0.5 };
        pos.x = c.x; pos.y = c.y;
    }
    pos.x = Number(pos.x); pos.y = Number(pos.y);
    return pos;
}
const dansLaNature = (partie) => !(partie && partie.Lieu_Actuel);
const cleDe = (pos) => `${pos.Region}:${pos.x.toFixed(3)}:${pos.y.toFixed(3)}`;

// La position en mots : où, dans la région.
function positionEnMots(pos) {
    const h = pos.y < 0.34 ? "nord" : pos.y > 0.66 ? "sud" : "";
    const l = pos.x < 0.34 ? "ouest" : pos.x > 0.66 ? "est" : "";
    if (!h && !l) return "au cœur de la région";
    if (h && l) return `dans le ${h}-${l} de la région`;
    return `dans le ${h || l} de la région`;
}
// Une direction (le nord en haut de la carte) et un temps de marche.
function direction(dx, dy) {
    const a = Math.atan2(dy, dx);                 // y vers le bas : le sud
    return DIRECTIONS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
function tempsDeMarche(jours) {
    if (jours < 0.12) return "à quelques pas";
    if (jours < 0.3) return "à moins de deux heures de marche";
    if (jours < 0.6) return "à quelques heures de marche";
    if (jours < 1.1) return "à environ une journée de marche";
    return `à environ ${Math.round(jours * 2) / 2} jours de marche`.replace(".", ",");
}
// Les lieux connus de la carte, autour du groupe (les plus proches d'abord).
function lieuxProches(pos) {
    const asp = aspect(pos.Region);
    return Object.values(window.VILLAGES_REGIONAUX || {})
        .filter(v => v.numero === pos.Region && Number.isFinite(v.x) && Number.isFinite(v.y))
        .map(v => {
            const dx = (v.x - pos.x) * asp, dy = v.y - pos.y;
            return { v, jours: Math.hypot(dx, dy) / distanceJour(), dx, dy };
        })
        .filter(o => o.jours <= PROXIMITE_JOURS)
        .sort((a, b) => a.jours - b.jours)
        .map(o => ({ id: o.v.id, nom: o.v.nom, type: o.v.type || "Village", jours: o.jours,
                     texte: `${o.v.nom} (${(o.v.type || "village").toLowerCase()}), ${tempsDeMarche(o.jours)} ${direction(o.dx, o.dy)}` }));
}
window.lieuxProchesDuGroupe = (partie) => { const pos = positionDe(partie || window.PARTIE_DATA || {}); return pos ? lieuxProches(pos) : []; };

// --- LE CARRÉ DÉCOUPÉ (avec le point du groupe) -------------------------------
async function chargerImage(url) {
    if (!url) return null;
    if (typeof window.chargerImageCarteRegionale === "function") return window.chargerImageCarteRegionale(url);
    return new Promise((r) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => r(i); i.onerror = () => r(null); i.src = url; });
}
// Le carré : sa place dans l'image (en pixels) et le point du groupe dedans.
function cadreDecoupe(pos, largeur, hauteur) {
    const cote = Math.min(Math.round(COTE_DECOUPE * hauteur), largeur, hauteur);
    const cx = pos.x * largeur, cy = pos.y * hauteur;
    const gauche = Math.round(borne(cx - cote / 2, 0, largeur - cote)), haut = Math.round(borne(cy - cote / 2, 0, hauteur - cote));
    return { gauche, haut, cote, point: { x: cx - gauche, y: cy - haut } };
}
window.cadreDecoupeTerrain = cadreDecoupe;
// La toile envoyée : la carte, les villages dessinés dessus (comme à l'écran),
// puis le point rouge cerclé de blanc.
async function decouper(pos) {
    const fiche = carte(pos.Region);
    if (!fiche || !fiche.image) return null;
    const url = typeof window.urlImageCarteRegionale === "function" ? window.urlImageCarteRegionale(fiche.image) : fiche.image;
    const img = await chargerImage(url);
    if (!img || !img.naturalWidth) return null;
    const L = img.naturalWidth, H = img.naturalHeight;
    const cadre = cadreDecoupe(pos, L, H);
    const sortie = Math.min(COTE_ENVOI_MAX, cadre.cote);
    const k = sortie / cadre.cote;
    const toile = document.createElement("canvas");
    toile.width = sortie; toile.height = sortie;
    const ctx = toile.getContext("2d");
    ctx.drawImage(img, cadre.gauche, cadre.haut, cadre.cote, cadre.cote, 0, 0, sortie, sortie);
    // Les villages (leurs calques) qui tombent dans le carré.
    const villages = Object.values(window.VILLAGES_REGIONAUX || {}).filter(v => v.numero === pos.Region && v.calque);
    for (const v of villages) {
        const c = v.taille * H, gx = v.x * L - c / 2 - cadre.gauche, gy = v.y * H - c / 2 - cadre.haut;
        if (gx > cadre.cote || gy > cadre.cote || gx + c < 0 || gy + c < 0) continue;
        const calque = await chargerImage(v.calque);
        if (calque) { try { ctx.drawImage(calque, gx * k, gy * k, c * k, c * k); } catch (e) { /* calque sans CORS */ } }
    }
    const px = cadre.point.x * k, py = cadre.point.y * k, r = Math.max(6, sortie * 0.018);
    ctx.lineWidth = r * 0.55;
    ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(px, py, r * 1.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#e01b1b"; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, r * 0.25); ctx.stroke();
    let donnees;
    try { donnees = toile.toDataURL("image/jpeg", 0.88); } catch (e) { console.warn("[MIA_Terrain] Carte sans CORS : pas d'image à envoyer.", e); return null; }
    return { donnees, base64: donnees.split(",")[1], cadre, sortie, point: { x: px, y: py } };
}
window.decouperTerrainGroupe = async (partie) => { const pos = positionDe(partie || {}); return pos ? decouper(pos) : null; };

// --- MIA_TERRAIN -----------------------------------------------------------
function promptTerrain(pos, lieux) {
    const nom = (carte(pos.Region) || {}).nom || `Région ${pos.Region}`;
    const largeurJour = COTE_DECOUPE / distanceJour();
    return `Tu es MIA_TERRAIN, l'éclaireur d'Ivalis (un monde d'Antique Fantastique : mythologie, Antiquité magique).
Voici un extrait de la carte dessinée de la région « ${nom} ». Le nord est en HAUT de l'image.
Le POINT ROUGE cerclé de blanc marque l'endroit EXACT où se tient le groupe des héros.
L'extrait couvre environ ${String(Math.round(largeurJour * 10) / 10).replace(".", ",")} journée(s) de marche d'un bord à l'autre.
${lieux.length ? `Lieux connus dessinés près d'eux : ${lieux.map(l => l.texte).join(" ; ")}.` : "Aucun lieu connu tout près."}

Ta mission : lis la carte et décris le terrain, sans rien inventer qui ne soit pas sur l'image.
- Le terrain EXACT sous le point rouge (forêt, plaine, prairie, colline, montagne, marais, désert, dunes, côte, plage, rivière, lac, mer, route, champs, ruines…).
- Ce qui l'entoure, direction par direction (nord, est, sud, ouest), et à quelle distance environ.
- Les éléments notables visibles (cours d'eau, ponts, routes, reliefs, villages dessinés, ruines).

Réponds OBLIGATOIREMENT avec un JSON valide, exactement de cette forme :
{
  "terrain": "le type de terrain sous le groupe, en quelques mots",
  "sous_le_groupe": "une phrase : ce que le groupe a sous les pieds et tout autour de lui",
  "alentours": { "nord": "…", "est": "…", "sud": "…", "ouest": "…" },
  "elements_notables": ["…"],
  "resume_mj": "3 à 4 phrases factuelles et évocatrices pour le Maître du Jeu : où se trouve le groupe et ce qui l'entoure"
}`;
}
async function demanderTerrain(decoupe, pos, lieux) {
    const cle = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cle) return null;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cle}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: promptTerrain(pos, lieux) }, { inline_data: { mime_type: "image/jpeg", data: decoupe.base64 } }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error((data.error && data.error.message) || `Gemini ${res.status}`);
    const texte = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (typeof window.ajouterTokens === "function" && data.usageMetadata) window.ajouterTokens(data.usageMetadata.totalTokenCount || 0);
    return JSON.parse(texte);
}
function texteAnalyse(a) {
    if (!a) return "";
    const al = a.alentours || {};
    const lignes = [];
    if (a.resume_mj) lignes.push(a.resume_mj);
    if (a.terrain) lignes.push(`Terrain : ${a.terrain}.`);
    if (a.sous_le_groupe) lignes.push(`Sous leurs pieds : ${a.sous_le_groupe}`);
    const dirs = ["nord", "est", "sud", "ouest"].filter(d => al[d]).map(d => `au ${d}, ${al[d]}`);
    if (dirs.length) lignes.push(`Alentours : ${dirs.join(" ; ")}.`);
    if (Array.isArray(a.elements_notables) && a.elements_notables.length) lignes.push(`Éléments notables : ${a.elements_notables.join(", ")}.`);
    return lignes.join("\n");
}

// LE TERRAIN D'UN POINT QUELCONQUE (v277 : là où naît un POI) — sans le garder.
window.lireTerrainA = async function(pos) {
    const p = { Region: Number(pos.Region), x: Number(pos.x), y: Number(pos.y) };
    const decoupe = await decouper(p);
    if (!decoupe) return null;
    return demanderTerrain(decoupe, p, lieuxProches(p));
};

// L'ANALYSE, UNE FOIS PAR POSITION : refaite seulement si le groupe a bougé
// (ou `forcer`). Rend la fiche gardée dans la partie.
window.analyserTerrainGroupe = async function(options) {
    if (!window.ID_PARTIE_COURANTE) return null;
    const opts = options || {};
    let partie = opts.partie;
    if (!partie) {
        const snap = await getDoc(refPartie());
        partie = snap && snap.exists() ? snap.data() : {};
    }
    if (!dansLaNature(partie)) return null;
    const pos = positionDe(partie);
    if (!pos) return null;
    const cle = cleDe(pos);
    const deja = partie.Analyse_Terrain;
    if (!opts.forcer && deja && deja.Cle === cle && deja.Descriptif) return deja;
    const lieux = lieuxProches(pos);
    const decoupe = await decouper(pos);
    if (!decoupe) return null;
    let analyse = null;
    try { analyse = await demanderTerrain(decoupe, pos, lieux); }
    catch (e) { console.error("[MIA_Terrain] L'analyse a échoué :", e); return null; }
    if (!analyse) return null;
    const fiche = { Cle: cle, Region: pos.Region, x: arrondi(pos.x), y: arrondi(pos.y), Terrain: String(analyse.terrain || ""),
                    Descriptif: texteAnalyse(analyse), Le: Date.now() };
    console.log(`🗺️ [MIA_Terrain] ${(carte(pos.Region) || {}).nom || pos.Region} (${fiche.x}, ${fiche.y}) :\n${fiche.Descriptif}`);
    try { await updateDoc(refPartie(), { Analyse_Terrain: fiche }); }
    catch (e) { console.error("[MIA_Terrain] Enregistrement :", e); }
    return fiche;
};

// --- LE BLOC POUR LE MAÎTRE DU JEU -----------------------------------------
// `partie` : la partie telle que le MJ la lit à l'instant (ia_master.js).
window.contexteEnvironnementMJ = async function(partie, options) {
    const p = partie || {};
    const pos = positionDe(p);
    const lignes = ["--- OÙ SE TROUVE LE GROUPE ---"];
    if (!pos) {
        lignes.push("Position inconnue sur la carte.");
    } else {
        const fiche = carte(pos.Region) || {};
        const nomRegion = fiche.nom || `Région ${pos.Region}`;
        if (dansLaNature(p)) {
            lignes.push(`Région : ${nomRegion}. Le groupe est DANS LA NATURE, ${positionEnMots(pos)} (aucun lieu connu à l'endroit où il se tient).`);
            lignes.push(`Position exacte sur la carte de la région : x = ${arrondi(pos.x)}, y = ${arrondi(pos.y)} (de 0 à 1, le nord en haut).`);
            let analyse = p.Analyse_Terrain && p.Analyse_Terrain.Cle === cleDe(pos) ? p.Analyse_Terrain : null;
            if (!analyse && !(options && options.sansAnalyse)) analyse = await window.analyserTerrainGroupe({ partie: p });
            lignes.push(analyse && analyse.Descriptif ? `Le terrain (lu sur la carte) :\n${analyse.Descriptif}` : "Le terrain : inconnu (la carte n'a pas pu être lue).");
            const lieux = lieuxProches(pos);
            lignes.push(lieux.length ? `Lieux connus à proximité : ${lieux.map(l => l.texte).join(" ; ")}.` : "Aucun lieu connu à proximité.");
            lignes.push("CONSIGNE ABSOLUE : le groupe est en pleine nature. Tu peux faire surgir des rencontres (voyageurs, patrouilles, bêtes, créatures, phénomènes, traces), mais tu n'inventes AUCUN bâtiment, village, ruine ni lieu construit qui ne soit pas cité ici : le décor est celui décrit ci-dessus.");
        } else {
            const v = (window.VILLAGES_REGIONAUX || {})[p.Lieu_Actuel];
            lignes.push(`Région : ${nomRegion}. Le groupe se trouve dans un lieu connu${v ? ` : ${v.nom}` : ""} (sa description est donnée ci-dessus).`);
        }
        lignes.push("", "--- LA RÉGION ---");
        const descriptif = typeof window.descriptifRegion === "function" ? window.descriptifRegion(pos.Region).texte : fiche.description;
        lignes.push(descriptif ? `Descriptif de ${nomRegion} : ${descriptif}` : `Descriptif de ${nomRegion} : (pas encore écrit).`);
        if (typeof window.loreDeLaRegion === "function") lignes.push(window.loreDeLaRegion(pos.Region));
    }
    const texte = lignes.join("\n");
    // Nico : « un message dans la console avec le descriptif envoyé ».
    // (`silencieux` : c'est une autre IA qui le lit, v278.)
    if (!(options && options.silencieux)) console.log("🧭 [MJ] Environnement envoyé au maître du jeu :\n" + texte);
    return texte;
};

// DEV : analyser ici, tout de suite (et voir dans la console ce que le MJ recevrait).
window.testerEnvironnementMJ = async function() {
    if (!window.ID_PARTIE_COURANTE) return null;
    const snap = await getDoc(refPartie());
    const partie = snap && snap.exists() ? snap.data() : {};
    if (dansLaNature(partie)) partie.Analyse_Terrain = await window.analyserTerrainGroupe({ partie, forcer: true }) || partie.Analyse_Terrain;
    return window.contexteEnvironnementMJ(partie, { sansAnalyse: true });
};
window.SITUATION_NATURE = SITUATION_NATURE;
