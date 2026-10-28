// =========================================================================
//  IVALIS — LA CRÉATION D'UN POINT D'INTÉRÊT (v277, MIA_POI)
// =========================================================================
//  Nico : « dès que les joueurs choisissent tous d'aller vers ce POI, tu
//  lances la création de ce lieu. Base-toi sur ce qui existait (MIA_CARTO).
//  Envoie le descriptif de la région à l'IA générateur de lieu. Donne-lui,
//  comme l'IA qui crée les PNJ, une légère ondulation de température, et des
//  règles de création : pas de trucs farfelus, on reste dans un monde
//  antique fantastique. Ça enregistre le lieu dans la base. L'image qu'on met
//  au-dessus de la carte comme pour les villages : on découpe, on envoie, on
//  dessine au centre du carré le lieu bien intégré. Puis l'IA crée une image
//  du lieu (affichée quand on clique dessus, et dans sa bulle du chat). Et
//  tout ce qu'il faut pour ce lieu dans la base : ça peut être des villages,
//  des camps, plein d'autres choses, un bâtiment comme plusieurs. Juste pas
//  de grosse ville. »
//
//  LE CHEMIN (creerLieuPoi) :
//    1. le terrain du point (MIA_TERRAIN, environnement_mj.js, sans le garder) ;
//    2. la graine tirée dans le catalogue (poi_catalogue.js), selon ce
//       terrain et la région ;
//    3. MIA_POI (Gemini, 0,80 à 1,20 °C au hasard) brode le lieu : nom,
//       description, sécurité, peuple, accroche pour le MJ, bâtiments, ce qu'on
//       dessine sur la carte et l'illustration — sous des règles strictes ;
//    4. la fiche (Monde_Lieux) et ses bâtiments (Monde_Batiment) en base :
//       le lieu existe dès ce moment, le MJ peut parler ;
//    5. EN FOND : le calque sur la carte (comme les villages, v273),
//       l'illustration du lieu (comme MIA_CARTO), puis celles des bâtiments.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const TAILLE_POI = 0.08;          // comme un village : 8 % de la hauteur de la carte
const SECURITES = ["Inconnue", "Faible", "Moyenne", "Élevée", "Cauchemar"];
const MAX_BATIMENTS = 4;

const nettoyerId = (nom) => String(nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
const nouvelIdLieu = (nom) => `L_${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}_${nettoyerId(nom)}`;
const nouvelIdBatiment = () => "B-" + Math.floor(Math.random() * 1000000);
window.TAILLE_POI = TAILLE_POI;

function cles() {
    const l = (k) => { try { return (localStorage.getItem(k) || "").trim(); } catch (e) { return ""; } };
    return { gemini: l("ivalis_GEMINI_API_KEY"), openai: l("ivalis_OPENAI_API_KEY"), cloudName: l("ivalis_CLOUDINARY_CLOUD_NAME"),
             cloudKey: l("ivalis_CLOUDINARY_API_KEY"), cloudSecret: l("ivalis_CLOUDINARY_API_SECRET") };
}
// Ce poste peut-il créer un lieu (les cinq clés) ?
window.peutCreerPoi = () => { const c = cles(); return !!(c.gemini && c.openai && c.cloudName && c.cloudKey && c.cloudSecret); };

// LES RÈGLES DE CRÉATION (Nico : « qu'il ne me sorte pas des trucs farfelus »).
const REGLES = `RÈGLES DE CRÉATION (absolues) :
1. UNIVERS : Antique Fantastique — mythologie, Antiquité magique. Pierre, marbre, bronze, terre cuite, bois, toile ; colonnes, autels, amphores, mosaïques, chitons et capes ; oracles, dieux et esprits. La magie existe mais reste rare, ancienne et chère payée.
2. PEUPLES : uniquement ceux d'Ivalis — Humains, Gobs (et Gobs géants), Ankylars, Éthérés, Ophiors, Ondari, Vargens ; et la menace de l'Engeance. Pas d'elfes, de nains, d'orques, de dragons de conte ni de créatures d'autres univers.
3. TAILLE : au plus un hameau, un petit village, un camp, un sanctuaire ou une ruine. JAMAIS de ville, de cité, de port important ni de forteresse peuplée de milliers d'âmes.
4. INTERDITS : aucune technologie anachronique (poudre, armes à feu, horloge mécanique, imprimerie, vapeur, verre à vitre moderne), aucun humour de parodie, aucun clin d'œil au monde réel, aucun nom moderne, aucun jeu de mots.
5. COHÉRENCE : avec le terrain (pas de port dans le désert, pas de mine dans un marais), avec la région et son lore (qui y vit, qui y domine, ce qui y est interdit), avec le niveau de danger. L'ambiance et l'accroche tirées sont des pistes : adapte-les avec bon sens à ce type de lieu.
6. NOMS : sonorités antiques (grecques, latines ou inventées dans cet esprit), courts, prononçables, sans article superflu.
7. ORIGINALITÉ : un lieu différent de ceux qui existent déjà (autre nom, autre identité).
8. SOBRIÉTÉ : du concret, des détails sensoriels, des gens crédibles ; du mystère, oui, mais du mystère qui tient debout.`;

function promptLieu(region, graine, terrain, nomsExistants, lieuxProches) {
    const carte = (window.CARTES_REGIONALES || {})[region] || {};
    const lore = typeof window.loreDeLaRegion === "function" ? window.loreDeLaRegion(region) : "";
    const descriptif = typeof window.descriptifRegion === "function" ? window.descriptifRegion(region).texte : (carte.description || "");
    const t = terrain ? [terrain.terrain, terrain.sous_le_groupe, terrain.resume_mj].filter(Boolean).join(" — ") : "inconnu";
    return `Tu es MIA_POI, l'IA qui fait naître les lieux que les héros découvrent en voyage dans le monde d'Ivalis.

LA RÉGION : « ${carte.nom || "région inconnue"} ».
${descriptif ? `Descriptif de la région : ${descriptif}\n` : ""}LE LORE (à respecter scrupuleusement) :
${lore}

LE TERRAIN à cet endroit (lu sur la carte) : ${t}.
${lieuxProches && lieuxProches.length ? `Lieux connus non loin : ${lieuxProches.join(" ; ")}.\n` : ""}Les lieux qui existent déjà sur cette carte : ${JSON.stringify(nomsExistants)}.

LA GRAINE tirée au sort (brode le lieu dessus) :
- Type : ${graine.typeNom} (${graine.familleNom}), ${graine.variante}.
- État : ${graine.etat}. Ambiance : ${graine.ambiance}.
- Accroche : ${graine.accroche}.
- Bâtiments nommés à créer : ${graine.batiments} (0 = un lieu à ciel ouvert, sans bâtiment où l'on entre).

${REGLES}

Réponds OBLIGATOIREMENT avec un JSON valide, exactement dans ce format :
{
  "nom": "Le nom du lieu",
  "type_lieu": "Son type en quelques mots (ex. Hameau de charbonniers, Sanctuaire en ruine)",
  "description": "Une description riche et concrète : l'atmosphère, l'architecture ou le paysage, qui vit là (ou plus personne), ce qu'on y voit, entend et sent, ce qui s'y passe en ce moment.",
  "securite": "Moyenne",
  "peuple": "Le peuple qui vit là (ou « Aucun »)",
  "accroche_mj": "Pour le Maître du Jeu seulement : ce qui se trame ici, qui peut entrer en scène, ce que les héros peuvent y gagner ou y perdre.",
  "stigmates": "L'atmosphère en une phrase courte (odeurs, bruits, lumière)",
  "batiments": [ { "nom": "…", "description": "L'intérieur, ce qu'on y trouve, qui s'y tient", "stigmates": "…", "prompt_image": "ENGLISH, physical elements of the interior only" } ],
  "visuel_carte": "A very short ENGLISH description of this place seen from above on a map: its shape, materials and one notable feature. Physical elements only, no style words.",
  "prompt_image": "An ENGLISH description of the place as a landscape illustration (physical elements only, no characters, no style words)."
}
« securite » est un de : ${SECURITES.join(", ")}. « batiments » contient exactement ${graine.batiments} élément(s).`;
}

// LA FORGE : MIA_POI, à une température qui ondule (comme MIA_PNJ).
async function inventerLieu(c, region, graine, terrain, nomsExistants, lieuxProches) {
    const temperature = parseFloat((Math.random() * (1.20 - 0.80) + 0.80).toFixed(2));
    console.log(`[MIA_POI] 🎲 ${graine.typeNom} ${graine.variante} — forge créative à ${temperature}°C…`);
    const rep = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${c.gemini}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: promptLieu(region, graine, terrain, nomsExistants, lieuxProches) }] },
            contents: [{ role: "user", parts: [{ text: "Fais naître ce lieu." }] }],
            generationConfig: { temperature, responseMimeType: "application/json" }
        })
    });
    const json = await rep.json();
    if (!rep.ok || json.error) throw new Error((json.error && json.error.message) || `Gemini ${rep.status}`);
    const l = JSON.parse(json.candidates[0].content.parts[0].text);
    if (!l || !l.nom) throw new Error("MIA_POI n'a pas rendu de lieu");
    const batiments = (Array.isArray(l.batiments) ? l.batiments : []).filter(b => b && b.nom).slice(0, MAX_BATIMENTS);
    return {
        nom: String(l.nom).trim(), type: String(l.type_lieu || graine.typeNom).trim(), description: String(l.description || "").trim(),
        securite: SECURITES.includes(l.securite) ? l.securite : "Inconnue", peuple: String(l.peuple || "").trim(),
        accroche: String(l.accroche_mj || "").trim(), stigmates: String(l.stigmates || "").trim(),
        batiments: batiments.map(b => ({ nom: String(b.nom).trim(), description: String(b.description || "").trim(),
                                         stigmates: String(b.stigmates || "").trim(), prompt: String(b.prompt_image || b.nom).trim() })),
        visuel: String(l.visuel_carte || graine.typeNom).trim(), prompt: String(l.prompt_image || l.nom).trim(), temperature
    };
}

// LA CRÉATION : rend { id, nom } dès que le lieu est en base ; les images
// suivent en fond (la promesse `images`).
window.creerLieuPoi = async function(options) {
    const o = options || {};
    const region = Number(o.region), x = Number(o.x), y = Number(o.y);
    const c = cles();
    if (!c.gemini) throw new Error("clé Gemini manquante");
    // 1. Le terrain du point.
    let terrain = null;
    if (typeof window.lireTerrainA === "function") {
        try { terrain = await window.lireTerrainA({ Region: region, x, y }); }
        catch (e) { console.warn("[MIA_POI] Terrain illisible :", e); }
    }
    // 2. La graine.
    const texteTerrain = terrain ? [terrain.terrain, terrain.sous_le_groupe, terrain.resume_mj].join(" ") : "";
    const graine = window.tirerGrainePoi({ terrains: window.motsTerrainPoi(texteTerrain), region });
    // 3. MIA_POI.
    const surCarte = Object.values(window.VILLAGES_REGIONAUX || {}).filter(v => v.numero === region);
    const proches = typeof window.lieuxProchesDuGroupe === "function"
        ? window.lieuxProchesDuGroupe({ Position_Groupe: { Region: region, x, y }, Lieu_Actuel: "" }).map(l => l.texte) : [];
    const lieu = await inventerLieu(c, region, graine, terrain, surCarte.map(v => v.nom), proches);
    // 4. La fiche et les bâtiments.
    const id = nouvelIdLieu(lieu.nom);
    const fiche = {
        Nom_Du_Lieu: lieu.nom, Description_Global: lieu.description, Niveau_De_Securite: lieu.securite,
        Peuple_Dominant: lieu.peuple, Type_Lieu: lieu.type, Famille_POI: graine.familleNom, Graine_POI: graine,
        Accroche_MJ: lieu.accroche, Visuel_Village: lieu.visuel, Prompt_Image: lieu.prompt,
        Reputations: {}, Stigmates: lieu.stigmates, URL_Cloudinary: "", URL_Calque_Region: "",
        Carte_Regionale: region, Position_Region: { x: Math.round(x * 1e5) / 1e5, y: Math.round(y * 1e5) / 1e5, taille: TAILLE_POI },
        Origine: "POI", Decouvert_Par: window.ID_PARTIE_COURANTE || "", Cree_Le: Date.now()
    };
    await setDoc(doc(db, "Monde_Lieux", id), fiche);
    const batiments = [];
    for (const b of lieu.batiments) {
        const idB = nouvelIdBatiment();
        await setDoc(doc(db, "Monde_Batiment", idB), { ID_Batiment: idB, ID_Lieu: id, Nom_Batiment: b.nom, Description_Details: b.description,
                                                       Stigmates: b.stigmates, URL_Cloudinary: "" });
        batiments.push({ id: idB, prompt: b.prompt });
    }
    // Tout de suite sur la carte (le calque viendra).
    if (window.VILLAGES_REGIONAUX && typeof window.appliquerLieuLocal === "function") window.appliquerLieuLocal(id, fiche);
    console.log(`[MIA_POI] 🏛️ « ${lieu.nom} » (${lieu.type}) est né : ${batiments.length} bâtiment(s).`);
    // 5. Les images, en fond.
    const images = (async () => {
        const maj = {};
        try {
            if (typeof window.fabriquerCalqueLieu === "function") {
                maj.URL_Calque_Region = await window.fabriquerCalqueLieu({ region, x, y, taille: TAILLE_POI }, lieu.visuel, "this small landmark");
                await updateDoc(doc(db, "Monde_Lieux", id), { URL_Calque_Region: maj.URL_Calque_Region });
                if (typeof window.appliquerLieuLocal === "function") window.appliquerLieuLocal(id, { ...fiche, ...maj });
            }
        } catch (e) { console.error("[MIA_POI] Le calque n'a pas abouti :", e); }
        try {
            if (typeof window.genererImageLieu === "function") {
                const url = await window.genererImageLieu(`${lieu.nom} — ${lieu.prompt}`);
                if (url) {
                    maj.URL_Cloudinary = url;
                    await updateDoc(doc(db, "Monde_Lieux", id), { URL_Cloudinary: url });
                    if (typeof window.appliquerLieuLocal === "function") window.appliquerLieuLocal(id, { ...fiche, ...maj });
                    if (typeof window.mettreAJourBulleLieu === "function" && window.PARTIE_DATA && window.PARTIE_DATA.Lieu_Actuel === id) window.mettreAJourBulleLieu(id);
                }
            }
        } catch (e) { console.error("[MIA_POI] L'illustration n'a pas abouti :", e); }
        for (const b of batiments) {
            try {
                if (typeof window.genererImageBatiment !== "function") break;
                const url = await window.genererImageBatiment(b.prompt);
                if (url) await updateDoc(doc(db, "Monde_Batiment", b.id), { URL_Cloudinary: url });
            } catch (e) { console.error("[MIA_POI] Image de bâtiment :", e); }
        }
        return maj;
    })();
    return { id, nom: lieu.nom, type: lieu.type, fiche, graine, batiments, images };
};
