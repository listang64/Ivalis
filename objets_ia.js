// =========================================================================
//  IVALIS - MIA_OBJETS : DE L'OBJET TIRÉ AU DESSIN QUI LE MONTRE
// =========================================================================
//  L'algorithme du butin (objets.js) sort des objets chiffrés : un nom, une
//  rareté, des bonus. Personne ne peut les VOIR. Ce module comble ce trou en
//  trois temps :
//
//    1. MIA_Objets décrit l'objet — une seule requête pour tout un lot, à
//       température tirée au hasard, pour que deux « Épée courte » rares ne se
//       ressemblent jamais.
//    2. gpt-image dessine ce que MIA a décrit, en carré, dans le style
//       graphique de la partie (celui du Cerveau_IA, le même qui habille les
//       portraits de héros).
//    3. Cloudinary héberge, et l'URL part en base : tous les postes la voient.
//
//  Chaque joueur illustre les objets de SES héros. Aucun poste n'attend un
//  autre, et un joueur sans clés d'API ne prive personne : ses objets
//  s'afficheront avec leur icône, comme avant.
// =========================================================================

import { db } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  LES CLÉS, LA SIGNATURE, LE STYLE DE LA PARTIE
// =========================================================================
window.clesApiObjets = function() {
    const lire = (cle) => (localStorage.getItem(cle) || "").trim();
    return {
        gemini: lire("ivalis_GEMINI_API_KEY"),
        openai: lire("ivalis_OPENAI_API_KEY"),
        cloudName: lire("ivalis_CLOUDINARY_CLOUD_NAME"),
        cloudKey: lire("ivalis_CLOUDINARY_API_KEY"),
        cloudSecret: lire("ivalis_CLOUDINARY_API_SECRET")
    };
};

// Sans ces quatre-là, aucune image ne peut naître : autant le savoir avant
// d'infliger un écran d'attente aux joueurs.
window.peutIllustrerLesObjets = function() {
    const c = window.clesApiObjets();
    return !!(c.openai && c.cloudName && c.cloudKey && c.cloudSecret);
};

async function signatureCloudinary(message) {
    const data = new TextEncoder().encode(message);
    const buffer = await crypto.subtle.digest("SHA-1", data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Le style graphique de la partie, celui qu'on a réglé une fois pour toutes
// dans les paramètres et qui habille déjà les portraits de héros. Relu une
// seule fois par session : c'est la même phrase pour les dix objets d'un butin.
let styleEnCache = null;
// Le style se règle dans les paramètres du jeu : le cache est vidé au début de
// chaque butin, pour qu'un réglage changé se voie dès le combat suivant sans
// avoir à recharger la page.
window.oublierStyleGraphique = function() { styleEnCache = null; };
window.styleGraphiqueIvalis = async function() {
    if (styleEnCache !== null) return styleEnCache;
    try {
        const snap = await getDoc(doc(db, "Cerveau_IA", "INST_76839"));
        styleEnCache = snap.exists() ? (snap.data().Contenu_Direct || "") : "";
    } catch (e) {
        console.error("[MIA_Objets] Style graphique illisible :", e);
        styleEnCache = "";
    }
    return styleEnCache;
};

// =========================================================================
//  ÉTAPE 1 — MIA_OBJETS DÉCRIT CE QU'ELLE VOIT
// =========================================================================
//  Une seule requête pour tout le lot : dix objets décrits ensemble coûtent le
//  prix d'un, et MIA les différencie mieux en les voyant côte à côte.
//
//  La température est tirée au hasard à chaque lot, comme pour MIA_PNJ : c'est
//  ce qui empêche la deuxième « Hache de guerre commune » d'être le calque de
//  la première. Froide, MIA redonne toujours la même hache.
window.TEMPERATURE_MIA_OBJETS = [0.80, 1.20];

window.decrireObjetsAvecMIA = async function(objets) {
    const descriptions = {};
    if (!objets || objets.length === 0) return descriptions;

    const cleGemini = window.clesApiObjets().gemini;
    if (!cleGemini) {
        console.warn("[MIA_Objets] Pas de clé Gemini : les objets seront dessinés sur leur seul nom.");
        return descriptions;
    }

    const [froid, chaud] = window.TEMPERATURE_MIA_OBJETS;
    const temperature = parseFloat((Math.random() * (chaud - froid) + froid).toFixed(2));
    console.log(`[MIA_Objets] 🎨 ${objets.length} objet(s) à décrire, forge créative à ${temperature}°C...`);

    const fiches = objets.map(o => ({
        uid: o.uid,
        nom: o.nom,
        categorie: o.emplacement === "Armure" ? "Armure ou vêtement" : "Arme ou objet tenu en main",
        type: o.type || "",
        rarete: o.rarete || "Commun",
        deux_mains: !!o.deuxMains,
        pouvoirs: o.effetTexte || ""
    }));

    const promptSysteme = `Tu es MIA_Objets, l'armurière visionnaire d'Ivalis.
On te donne des objets qui viennent d'être trouvés sur un champ de bataille, dans un univers Antique Fantastique (Antiquité magique, mythologie).
L'ÉPOQUE EST UN INTERDIT, PAS UNE AMBIANCE : Grèce hoplitique, Rome, Perse, Égypte, steppes. Bronze, lin lamellé, cuir bouilli, écailles cousues, laine, fer brut, bois et os.
Pour les armures et vêtements : linothorax, cuirasse musclée, lorica, spolas, exômide, chiton, ptéruges, fibules. JAMAIS d'armure de plates médiévale, de cotte de mailles de chevalier, de heaume à visière ni de plastron de fantasy moderne.
UNE ARMURE EST UNE TENUE COMPLÈTE, jamais une pièce isolée : décris le vêtement de dessous, la protection, la ceinture, les ptéruges et les protections de bras et de jambes qui l'accompagnent. Quelqu'un doit pouvoir s'habiller entièrement avec ce que tu décris.
Pour CHACUN, tu écris une description PUREMENT VISUELLE, destinée à un illustrateur qui ne connaît rien du jeu.
Décris : la forme et les proportions exactes, les matières (bois, bronze, fer, cuir, os, pierre, tissu), les ornements et gravures, l'usure, les couleurs dominantes.
La rareté doit se VOIR : un objet commun est simple, usé, sans fioriture ; un objet légendaire ou épique porte des matériaux nobles, des gravures fines et une lueur magique discrète.
Si l'objet a des pouvoirs, fais-les transparaître dans la matière (runes, veines lumineuses, givre, braise) — jamais par du texte écrit sur l'objet.
Ne décris JAMAIS de personne, de main, de mannequin, de décor ni de fond : uniquement l'objet lui-même.
Deux objets du même nom doivent être visiblement différents l'un de l'autre.
Trois à quatre phrases par objet. Utilise l'outil 'decrireObjets'.`;

    const outils = [{
        functionDeclarations: [{
            name: "decrireObjets",
            description: "Donne la description visuelle de chaque objet.",
            parameters: {
                type: "OBJECT",
                properties: {
                    objets: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                uid: { type: "STRING", description: "L'identifiant de l'objet, recopié à l'identique." },
                                apparence: { type: "STRING", description: "Description visuelle de l'objet seul : forme, matières, ornements, usure, couleurs." }
                            }, required: ["uid", "apparence"]
                        }
                    }
                }, required: ["objets"]
            }
        }]
    }];

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: JSON.stringify(fiches) }] }],
                tools: outils,
                toolConfig: { functionCallingConfig: { mode: "ANY" } },
                generationConfig: { temperature }
            })
        });
        const data = await res.json();
        const appel = (data.candidates?.[0]?.content?.parts || []).find(p => p.functionCall)?.functionCall;
        (appel?.args?.objets || []).forEach(o => {
            if (o.uid && o.apparence) descriptions[o.uid] = o.apparence;
        });
        console.log(`[MIA_Objets] ✍️ ${Object.keys(descriptions).length} description(s) reçue(s).`);
    } catch (e) {
        console.error("[MIA_Objets] Description impossible :", e);
    }
    return descriptions;
};

// =========================================================================
//  ÉTAPE 2 — LE PROMPT ENVOYÉ AU DESSINATEUR
// =========================================================================
//  Deux mises en scène, et deux seulement : l'arme est posée à même le sol,
//  l'armure est étalée au sol, dépliée et VIDE. Le reste (style, cadrage) est
//  commun, et le style vient de la partie, pas d'ici.
window.promptImageObjet = function(objet, description, style) {
    const estArmure = objet.emplacement === "Armure";

    const miseEnScene = estArmure
        ? "C'est une TENUE COMPLÈTE, pas une simple pièce de protection : le vêtement de dessous "
        + "(tunique, chiton, exômide ou robe selon la pièce), la protection elle-même, la ceinture, "
        + "les ptéruges, et les protections de bras et de jambes qui vont avec. Tout est posé à plat "
        + "sur le sol, déplié et étalé comme sur un étal, disposé à la place qu'occupe chaque pièce sur "
        + "un corps : le haut en haut, la ceinture au milieu, les jambières en bas. On doit pouvoir "
        + "s'habiller entièrement avec ce qui est montré, sans rien y ajouter. "
        + "L'ensemble est absolument VIDE : aucune personne, aucun corps, aucune tête, aucune main, "
        + "aucun mannequin, aucun buste et aucun portant à l'intérieur ou à côté. "
        + "C'est une tenue abandonnée au sol, rien de plus."
        : "L'objet est posé à même le sol, à plat, vu du dessus, en entier. "
        + "Personne ne le tient : aucune main, aucun bras, aucun personnage dans l'image.";

    // Sans consigne, le dessinateur répond « armure » par une armure de plates
    // de chevalier : c'est ce qu'il a le plus vu. Il faut donc nommer l'époque,
    // les matières et les pièces — et dire explicitement ce qui est proscrit.
    const ancrageAntique = estArmure
        ? " ÉPOQUE OBLIGATOIRE : Antiquité méditerranéenne et proche-orientale — Grèce hoplitique, Rome, "
        + "Perse, Égypte, peuples des steppes. Les matières sont le bronze martelé, le lin lamellé et collé, "
        + "le cuir bouilli, les écailles cousues, la laine teinte et le fer brut. Les pièces sont celles de "
        + "ce monde-là : linothorax, cuirasse musclée, lorica d'écailles ou de lanières, spolas de cuir, "
        + "exômide, chiton, ptéruges (lanières de cuir aux épaules et aux hanches), fibules et lacets. "
        + "IL EST STRICTEMENT INTERDIT de dessiner une armure de plates médiévale, une cotte de mailles "
        + "rivetée de chevalier, un heaume à visière, un plastron gothique, une armure de fantasy moderne "
        + "à pointes ou à plaques articulées : rien de postérieur à l'Antiquité."
        : " ÉPOQUE OBLIGATOIRE : Antiquité méditerranéenne — bronze, fer brut, bois, cuir, os et tendon. "
        + "Aucune forme médiévale ni moderne, aucune garde de rapière, aucun acier poli industriel.";

    let prompt = "Contexte de l'univers : Antique Fantastique (Mythic Ancient Fantasy, Antiquité Magique).\n\n";
    prompt += "--- OBJET UNIQUE À REPRÉSENTER ---\n";
    prompt += `Il s'agit de : ${objet.nom}`;
    if (objet.rarete) prompt += ` (qualité ${objet.rarete})`;
    prompt += ".\n";
    if (description) prompt += description + "\n";
    prompt += "\n";

    if (style) prompt += "Directives de style artistique obligatoires : " + style + "\n\n";

    prompt += "🛑 RÈGLE DE COMPOSITION (PRIORITAIRE SUR TOUT LE RESTE) : " + miseEnScene + ancrageAntique + " "
            + "Le sol est un sol de champ de bataille sobre — terre battue, pierre ou dalles usées — "
            + "et reste discret : l'objet occupe le centre et la majeure partie de l'image. "
            + "Format strictement carré. L'objet est ENTIÈREMENT visible, avec une petite marge : "
            + "aucune partie ne doit être coupée par le bord de l'image. "
            + "Un seul objet dans l'image, jamais deux, jamais une collection. "
            + "N'écris aucun texte, aucun chiffre, aucun cadre, aucune interface, aucune bordure décorative.";

    return prompt;
};

// =========================================================================
//  ÉTAPE 3 — DESSINER, PUIS HÉBERGER
// =========================================================================
//  15 requêtes d'image par minute chez OpenAI : de la marge pour lancer tout un
//  butin de front. Deux garde-fous quand même — au plus 5 dessins en cours à la
//  fois (au-delà, le navigateur d'un iPad souffre), et un compteur glissant qui
//  refuse la 16ᵉ requête d'une même minute plutôt que de se faire jeter.
window.LIMITE_IMAGES_PAR_MINUTE = 15;
window.LIMITE_IMAGES_SIMULTANEES = 5;
const creneauxUtilises = [];

async function reserverCreneauImage() {
    // Boucle plutôt que test unique : plusieurs dessins peuvent attendre le
    // même créneau, et il n'y en a qu'un à prendre au réveil.
    for (;;) {
        const maintenant = Date.now();
        while (creneauxUtilises.length && maintenant - creneauxUtilises[0] > 60000) creneauxUtilises.shift();
        if (creneauxUtilises.length < window.LIMITE_IMAGES_PAR_MINUTE) {
            creneauxUtilises.push(maintenant);
            return;
        }
        const attente = 60000 - (maintenant - creneauxUtilises[0]) + 250;
        console.log(`[MIA_Objets] ⏳ Quota d'images atteint, reprise dans ${Math.ceil(attente / 1000)}s.`);
        await dormir(attente);
    }
}

// Le dessin lui-même. Mêmes réglages que les pions — gpt-image-2, qualité
// basse, PNG — mais en carré et sans image de référence : l'objet n'existe
// nulle part ailleurs, il n'y a rien à ressembler.
window.dessinerObjet = async function(prompt, cles) {
    const delais = [5000, 15000, 30000];

    for (let tentative = 0; tentative < 3; tentative++) {
        await reserverCreneauImage();

        let statut = 0, brut = "";
        try {
            const reponse = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai },
                body: JSON.stringify({
                    model: "gpt-image-2",
                    prompt,
                    n: 1,
                    size: "1024x1024",
                    quality: "low",
                    output_format: "png",
                    moderation: "low"
                })
            });
            statut = reponse.status;
            brut = await reponse.text();
        } catch (e) {
            console.error("[MIA_Objets] Erreur réseau :", e);
            await dormir(delais[tentative]);
            continue;
        }

        if (statut === 429 || brut.includes("error code: 1015") || brut.includes("Rate Limited")) {
            console.warn(`[MIA_Objets] Débit limité, nouvelle tentative dans ${delais[tentative] / 1000}s...`);
            await dormir(delais[tentative]);
            continue;
        }
        if (statut < 200 || statut >= 300) {
            console.error("[MIA_Objets] Erreur HTTP OpenAI :", statut, brut.slice(0, 400));
            return "";
        }

        try {
            const json = JSON.parse(brut);
            const image = json.data && json.data[0];
            if (!image) return "";
            return image.url || ("data:image/png;base64," + image.b64_json);
        } catch (e) {
            console.error("[MIA_Objets] Réponse illisible :", e);
            return "";
        }
    }
    return "";
};

// Pas de détourage ici : l'image entière part telle quelle, sol compris. Un
// seul aller-retour Cloudinary, donc, contre deux pour les pions.
window.hebergerImageObjet = async function(imageSource, cles) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dossier = "Objets";
    const signature = await signatureCloudinary(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);

    const form = new FormData();
    form.append("file", imageSource);
    form.append("api_key", cles.cloudKey);
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    form.append("folder", dossier);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form });
        const json = await res.json();
        if (json.secure_url) return json.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
        console.error("[MIA_Objets] Cloudinary a refusé l'image :", json.error || json);
    } catch (e) {
        console.error("[MIA_Objets] Hébergement impossible :", e);
    }
    return "";
};

// La chaîne complète pour UN objet.
window.illustrerObjet = async function(objet, description, style, cles) {
    const prompt = window.promptImageObjet(objet, description, style);
    const dessin = await window.dessinerObjet(prompt, cles);
    if (!dessin) return "";
    return await window.hebergerImageObjet(dessin, cles);
};

// =========================================================================
//  L'ORCHESTRE : TOUT UN LOT, EN PARALLÈLE
// =========================================================================
//  surImage est appelé dès qu'une image est prête, pas à la fin : les joueurs
//  voient la fouille avancer objet par objet au lieu de fixer un écran mort.
window.illustrerLesObjets = async function(objets, surImage) {
    if (!objets || objets.length === 0) return 0;
    const cles = window.clesApiObjets();
    if (!window.peutIllustrerLesObjets()) return 0;

    const style = await window.styleGraphiqueIvalis();
    const descriptions = await window.decrireObjetsAvecMIA(objets);

    let reussies = 0;
    const file = objets.slice();

    const ouvrier = async () => {
        for (;;) {
            const objet = file.shift();
            if (!objet) return;
            try {
                const url = await window.illustrerObjet(objet, descriptions[objet.uid] || "", style, cles);
                if (url) {
                    reussies++;
                    objet.image = url;
                    if (typeof surImage === "function") await surImage(objet, url);
                }
            } catch (e) {
                console.error(`[MIA_Objets] ${objet.nom} n'a pas pu être illustré :`, e);
            }
        }
    };

    const ouvriers = Math.min(window.LIMITE_IMAGES_SIMULTANEES, objets.length);
    await Promise.all(Array.from({ length: ouvriers }, ouvrier));
    console.log(`[MIA_Objets] ✅ ${reussies}/${objets.length} objet(s) illustré(s).`);
    return reussies;
};

// =========================================================================
//  BRANCHEMENT SUR LE BUTIN
// =========================================================================

// Les objets d'un butin qui appartiennent à MES héros et n'ont pas d'image.
window.objetsAIllustrer = function(butin, idsPersonnages) {
    if (!butin || !butin.parPersonnage) return [];
    const sortie = [];
    (idsPersonnages || []).forEach(id => {
        const bloc = butin.parPersonnage[id];
        (bloc && bloc.items || []).forEach(item => { if (!item.image) sortie.push(item); });
    });
    return sortie;
};

// Combien d'objets de mes héros sont déjà illustrés — ce que la fouille affiche.
window.avancementImagesButin = function(butin, idsPersonnages) {
    let total = 0, prets = 0;
    if (butin && butin.parPersonnage) {
        (idsPersonnages || []).forEach(id => {
            const bloc = butin.parPersonnage[id];
            (bloc && bloc.items || []).forEach(item => { total++; if (item.image) prets++; });
        });
    }
    return { total, prets };
};

// L'URL rejoint la base : le tableau d'items est réécrit en entier, faute de
// pouvoir viser une case de tableau par un chemin pointé. La transaction de
// modifierPartie garantit qu'aucune décision prise pendant ce temps n'est
// perdue, et l'image n'écrase jamais une image déjà posée par un autre poste.
window.poserImageObjetEnBase = async function(uid, url) {
    if (!uid || !url) return false;

    const pose = await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin) return null;
        const maj = {};

        Object.keys(butin.parPersonnage || {}).forEach(id => {
            const items = (butin.parPersonnage[id] || {}).items || [];
            const cible = items.find(it => it.uid === uid);
            if (!cible || cible.image) return;
            cible.image = url;
            maj[`Butin.parPersonnage.${id}.items`] = items;
        });

        const pool = butin.pool || [];
        const dansPool = pool.find(it => it.uid === uid);
        if (dansPool && !dansPool.image) {
            dansPool.image = url;
            maj["Butin.pool"] = pool;
        }

        if (Object.keys(maj).length === 0) return null;
        return { maj };
    });

    // L'objet a pu être équipé pendant que son image se dessinait : sa copie sur
    // la fiche du héros mérite l'image qu'on vient de payer.
    await illustrerEquipementPorte(uid, url);
    return !!pose;
};

async function illustrerEquipementPorte(uid, url) {
    const champs = ["Equip_Armure", "Equip_Main_Droite", "Equip_Main_Gauche"];
    for (const perso of (window.PERSOS_PARTIE || [])) {
        const maj = {};
        champs.forEach(champ => {
            const porte = perso[window.champDocVersFront[champ]];
            if (porte && porte.uid === uid && !porte.image) {
                maj[champ] = Object.assign({}, porte, { image: url });
            }
        });
        if (Object.keys(maj).length === 0) continue;
        try {
            await updateDoc(doc(db, "Personnages", perso.idPersonnage), maj);
            if (typeof window.appliquerEquipementEnRam === "function") {
                window.appliquerEquipementEnRam(perso.idPersonnage, maj);
            }
        } catch (e) {
            console.error("[MIA_Objets] Image de l'objet porté :", e);
        }
    }
}

// Le point d'entrée du butin : appelé à chaque notification de partie, il ne
// travaille qu'une fois par butin. Le drapeau porte la signature du butin, si
// bien qu'une nouvelle victoire relance bel et bien la fouille.
window.BUTIN_ILLUSTRE_EN_COURS = null;

window.lancerIllustrationButin = async function(butin, idsPersonnages) {
    if (!butin || !butin.ouvert) return;
    const signature = butin.id || "";
    if (window.BUTIN_ILLUSTRE_EN_COURS === signature) return;

    const objets = window.objetsAIllustrer(butin, idsPersonnages);
    if (objets.length === 0) return;
    if (!window.peutIllustrerLesObjets()) {
        console.warn("[MIA_Objets] Clés d'API absentes : le butin s'affichera sans images.");
        return;
    }

    window.BUTIN_ILLUSTRE_EN_COURS = signature;
    window.oublierStyleGraphique();
    console.log(`[MIA_Objets] 🕯️ Fouille des cadavres : ${objets.length} objet(s) à identifier.`);

    try {
        await window.illustrerLesObjets(objets, async (objet, url) => {
            await window.poserImageObjetEnBase(objet.uid, url);
            if (typeof window.rafraichirFouilleButin === "function") window.rafraichirFouilleButin();
        });
    } catch (e) {
        console.error("[MIA_Objets] La fouille a été interrompue :", e);
    }
};

// =========================================================================
//  L'AVATAR QUI PORTE VRAIMENT SON ARMURE
// =========================================================================
//  Même méthode que les pions : on n'envoie pas une URL dans le prompt (le
//  modèle l'ignore), on envoie les PIXELS. Deux images en binaire cette fois —
//  le portrait de référence du héros d'abord, l'image de l'armure ensuite — et
//  le dessinateur rhabille le premier avec la seconde.
//
//  Le portrait de référence ne bouge JAMAIS (URL_Cloudinary). Repartir d'un
//  avatar déjà habillé ferait dériver le visage d'armure en armure, comme une
//  photocopie de photocopie. On repart donc toujours de l'original.
//
//  Les armes ne comptent pas : elles ne se voient pas sur l'avatar.

window.PROMPT_AVATAR_ARMURE =
    "Deux images de référence te sont fournies. La PREMIÈRE est le personnage : "
  + "son visage, sa silhouette, sa race, sa couleur de peau, sa coiffure et tous ses signes "
  + "distinctifs doivent être reproduits À L'IDENTIQUE, sans la moindre variation. C'est la même "
  + "personne, ni un frère, ni un cousin. La SECONDE image est une pièce d'équipement posée au sol : "
  + "l'armure ou le vêtement que ce personnage doit désormais porter.\n\n"
  + "Redessine le personnage de la première image en train de PORTER l'armure de la seconde. "
  + "Reprends fidèlement ses matières, ses couleurs, ses ornements et sa coupe, ajustés au corps du "
  + "personnage. Tout ce que portait le personnage sur le buste et le torse est remplacé par cette "
  + "armure ; ses armes, en revanche, ne doivent PAS apparaître.\n\n"
  + "Contexte de l'univers : Antique Fantastique (Antiquité magique, mythologie méditerranéenne).\n"
  + "🛑 RÈGLE TECHNIQUE DÉFINITIVE (PRIORITAIRE SUR TOUT LE RESTE) : "
  + "Le personnage DOIT ÊTRE PLACÉ SUR UN FOND TOTALEMENT MAGENTA FLUO UNI (#FF00FF). "
  + "Il est STRICTEMENT INTERDIT de dessiner un décor, un paysage, un intérieur, une ombre au sol ou "
  + "un dégradé. Remplis tout l'espace autour et derrière le personnage avec du magenta fluo pur. "
  + "Le personnage est vu de trois quarts, regardant vers la gauche, cadré en plan américain (coupé "
  + "aux genoux), exactement comme sur l'image de référence. Ne dessine aucun texte.";

// L'appel au dessinateur, avec DEUX images jointes. La même cascade de modèles
// que les pions : gpt-image-2 d'abord, les précédents en repli.
async function dessinerAvatarHabille(blobPersonnage, blobArmure, cles) {
    const modeles = [
        { model: "gpt-image-2" },
        { model: "gpt-image-1.5", input_fidelity: "high" },
        { model: "gpt-image-1", input_fidelity: "high" }
    ];
    const delais = [5000, 15000, 30000];

    for (const candidat of modeles) {
        for (let tentative = 0; tentative < 3; tentative++) {
            await reserverCreneauImage();

            const form = new FormData();
            form.append("model", candidat.model);
            form.append("prompt", window.PROMPT_AVATAR_ARMURE);
            // L'ordre compte : le personnage EN PREMIER. C'est sur lui que
            // portent les retouches, l'armure n'est qu'une référence de style.
            form.append("image[]", blobPersonnage, "personnage.png");
            form.append("image[]", blobArmure, "armure.png");
            form.append("n", "1");
            form.append("size", "1024x1536");
            form.append("quality", "medium");
            form.append("output_format", "png");
            if (candidat.input_fidelity) form.append("input_fidelity", candidat.input_fidelity);

            let statut = 0, brut = "";
            try {
                // Aucun en-tête Content-Type : le navigateur pose lui-même la frontière multipart.
                const reponse = await fetch("https://api.openai.com/v1/images/edits", {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + cles.openai },
                    body: form
                });
                statut = reponse.status;
                brut = await reponse.text();
            } catch (e) {
                console.error("[Avatar] Erreur réseau :", e);
                await dormir(delais[tentative]);
                continue;
            }

            if (statut === 429 || brut.includes("error code: 1015") || brut.includes("Rate Limited")) {
                console.warn(`[Avatar] Débit limité, reprise dans ${delais[tentative] / 1000}s...`);
                await dormir(delais[tentative]);
                continue;
            }
            if (statut === 404 || brut.includes("model_not_found") || brut.includes("does not support")) {
                console.warn(`[Avatar] ${candidat.model} indisponible, essai du modèle suivant...`);
                break;
            }
            if (statut < 200 || statut >= 300) {
                console.error("[Avatar] Erreur HTTP OpenAI :", statut, brut.slice(0, 400));
                break;
            }

            try {
                const json = JSON.parse(brut);
                const image = json.data && json.data[0];
                if (!image) return "";
                return image.url || ("data:image/png;base64," + image.b64_json);
            } catch (e) {
                console.error("[Avatar] Réponse illisible :", e);
                return "";
            }
        }
    }
    return "";
}

// Le pont Cloudinary puis le détourage, exactement comme pour le portrait de
// base : le serveur de l'IA interdit la lecture des pixels depuis le navigateur,
// il faut donc d'abord faire aspirer l'image par Cloudinary.
async function hebergerAvatarDetoure(imageSource, cles) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dossier = "Accueil/Heros";

    const envoyer = async (fichier, publicId) => {
        const aSigner = publicId
            ? `public_id=${publicId}&timestamp=${timestamp}${cles.cloudSecret}`
            : `folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`;
        const form = new FormData();
        form.append("file", fichier);
        form.append("api_key", cles.cloudKey);
        form.append("timestamp", timestamp);
        form.append("signature", await window.signatureCloudinaryIvalis(aSigner));
        if (publicId) form.append("public_id", publicId);
        else form.append("folder", dossier);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`,
                                { method: "POST", body: form });
        return await res.json();
    };

    try {
        const premier = await envoyer(imageSource, null);
        if (!premier.secure_url) {
            console.error("[Avatar] Cloudinary a refusé l'image :", premier.error || premier);
            return "";
        }
        const detouree = await window.detourerFondMagenta(premier.secure_url);
        const second = await envoyer(detouree, premier.public_id);
        if (second.secure_url) return second.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
        console.error("[Avatar] Détourage non enregistré :", second.error || second);
    } catch (e) {
        console.error("[Avatar] Hébergement impossible :", e);
    }
    return "";
}

// Un seul rhabillage à la fois par héros : équiper trois armures d'affilée ne
// doit pas lancer trois dessins concurrents dont le dernier arrivé gagne.
window.AVATARS_EN_COURS = window.AVATARS_EN_COURS || {};

// LE POINT D'ENTRÉE. Appelé quand un héros équipe une armure, et à la création
// une fois l'armure de départ illustrée.
window.rhabillerAvatar = async function(idPersonnage, armure, urlReference) {
    if (!idPersonnage || !armure || !armure.image) return "";
    if (window.AVATARS_EN_COURS[idPersonnage]) return "";
    if (!window.peutIllustrerLesObjets()) return "";

    // La référence peut être donnée d'office : à la création, le héros vient
    // d'être écrit en base et n'est pas encore arrivé dans PERSOS_PARTIE.
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    const reference = urlReference || (perso && (perso.urlPortraitReference || perso.urlCloudinary));
    if (!reference) {
        console.warn("[Avatar] Pas de portrait de référence pour " + idPersonnage + " : rien à rhabiller.");
        return "";
    }

    window.AVATARS_EN_COURS[idPersonnage] = armure.uid;
    const cles = window.clesApiObjets();
    const nom = (perso && perso.prenom) || idPersonnage;
    console.log(`👗 [Avatar] ${nom} enfile ${armure.nom}...`);

    try {
        const [blobPerso, blobArmure] = await Promise.all([
            window.imageVersBlobPng(reference),
            window.imageVersBlobPng(armure.image)
        ]);
        if (!blobPerso || !blobArmure) {
            console.error("[Avatar] Une des deux images de référence est illisible.");
            return "";
        }

        const dessin = await dessinerAvatarHabille(blobPerso, blobArmure, cles);
        if (!dessin) return "";

        const url = await hebergerAvatarDetoure(dessin, cles);
        if (!url) return "";

        await window.poserAvatarEquipe(idPersonnage, url);
        console.log(`✅ [Avatar] ${nom} porte désormais ${armure.nom}.`);
        return url;
    } catch (e) {
        console.error("[Avatar] Rhabillage interrompu :", e);
        return "";
    } finally {
        delete window.AVATARS_EN_COURS[idPersonnage];
    }
};

// Écrit (ou efface) l'avatar habillé. Le portrait de référence n'est jamais
// touché : c'est lui qui repartira au prochain changement d'armure.
window.poserAvatarEquipe = async function(idPersonnage, url) {
    try {
        await updateDoc(doc(db, "Personnages", idPersonnage), { URL_Avatar_Equipe: url || "" });
    } catch (e) {
        console.error("[Avatar] Écriture de l'avatar :", e);
        return;
    }
    // Miroir en mémoire : la fiche et le panneau de combat suivent sans
    // attendre l'aller-retour de la base.
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    if (perso) {
        perso.urlAvatarEquipe = url || "";
        perso.urlCloudinary = url || perso.urlPortraitReference || "";
    }
};

// Le héros vient d'équiper quelque chose : si c'est une armure, on le rhabille.
// L'image de l'armure peut manquer (butin passé « sans attendre ») : on la fait
// alors dessiner d'abord, puisqu'il la faut en référence.
window.suivreArmureEquipee = async function(idPersonnage, objet, urlReference) {
    if (!objet || objet.emplacement !== "Armure") return "";
    if (!window.peutIllustrerLesObjets()) return "";

    const armure = objet;
    if (!armure.image) {
        // illustrerLesObjets pose l'URL sur l'objet lui-même ; on l'écrit
        // ensuite là où elle doit vivre — dans le butin s'il est encore ouvert,
        // et sur la fiche du héros qui la porte.
        await window.illustrerLesObjets([armure], async (o, url) => {
            if (typeof window.poserImageObjetEnBase === "function") {
                await window.poserImageObjetEnBase(o.uid, url);
            }
            await poserImageArmurePortee(idPersonnage, o.uid, url);
        });
        if (!armure.image) return "";
    }
    return await window.rhabillerAvatar(idPersonnage, armure, urlReference);
};

// L'image de l'armure rejoint la fiche du porteur. poserImageObjetEnBase ne
// couvre que les héros déjà dans PERSOS_PARTIE : à la création, le nouveau venu
// n'y est pas encore, et son armure resterait sans dessin.
async function poserImageArmurePortee(idPersonnage, uid, url) {
    try {
        const ref = doc(db, "Personnages", idPersonnage);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const portee = snap.data().Equip_Armure;
        if (!portee || portee.uid !== uid || portee.image) return;
        await updateDoc(ref, { Equip_Armure: Object.assign({}, portee, { image: url }) });
    } catch (e) {
        console.error("[Avatar] Image de l'armure portée :", e);
    }
}
