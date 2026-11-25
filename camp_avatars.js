// =========================================================================
//  IVALIS — LES AVATARS DU CAMP (v480)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 3) :
//    « Chaque personnage du camp, héros principaux compris, a deux images de lui
//    en scène, en train de faire quelque chose. » On les crée à l'arrivée d'un
//    PNJ dans le camp, à la création ou à l'achat d'un personnage, et au
//    changement de héros principal s'il n'en a pas encore ; on les refait si
//    l'armure change. « On réutilise l'image actuelle du personnage comme
//    référence ; on donne aussi la référence de son armure, bas compris ; le
//    personnage en entier, des pieds à la tête ; le même outil de découpe que
//    l'avatar (fond magenta puis détourage) ; deux poses différentes, tirées au
//    hasard dans la liste. »
//
//  Une veille s'en charge pour tout le camp : un membre à la fois, sur un poste
//  qui a les clés (OpenAI, Cloudinary), avec un verrou de 10 minutes dans sa
//  fiche (Images_Camp_En_Cours) pour que deux postes ne dessinent pas le même.
//  Le résultat : Images_Camp: [{ url, pose }, { url, pose }] et
//  Images_Camp_Armure (l'uid de l'armure qu'elles montrent), dans la fiche du
//  héros (Personnages) ou du PNJ (Monde_PNJ).
//
//  « À la création du compagnon, une IA détermine s'il est au sol (gros ou
//  petit gabarit) ou dans les airs » : Compagnon_Gabarit (MIA_GABARIT), fait
//  par la même veille pour un compagnon qui ne l'a pas encore.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=3";

const VERROU_MS = 10 * 60 * 1000;
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const peutDessiner = () => typeof window.peutIllustrerLesObjets === "function" && window.peutIllustrerLesObjets()
    && typeof window.hebergerDetoure === "function";

// LE PROMPT : le personnage entier, des pieds à la tête, dans une pose, sur fond magenta.
export function promptImageCamp(nom, pose, avecReference, description) {
    return [
        avecReference
            ? `La première image de référence est le personnage « ${nom} » : redessine-le À L'IDENTIQUE (même visage, même silhouette, même race, même couleur de peau, même coiffure). S'il y a une seconde image, c'est son armure : il la porte, bas compris.`
            : `Dessine le personnage « ${nom} » : ${description || "un habitant du clan"}.`,
        `Le personnage est EN ENTIER, DES PIEDS À LA TÊTE (on voit ses pieds), dans une scène de la vie d'un camp nomade : il est en train de ${pose}.`,
        "Contexte de l'univers : Antique Fantastique (Antiquité magique, mythologie méditerranéenne). Lumière naturelle d'un soleil, chaude et franche.",
        "🛑 RÈGLE TECHNIQUE DÉFINITIVE (PRIORITAIRE) : le personnage DOIT ÊTRE PLACÉ SUR UN FOND TOTALEMENT MAGENTA FLUO UNI (#FF00FF). Aucun décor, aucun sol, aucune ombre portée, aucun dégradé. Les objets de sa pose (une bûche, un seau, une chope…) restent tenus ou posés contre lui. Le fond magenta n'éclaire rien : aucun reflet rose ou violacé sur le personnage. Aucun texte."
    ].join("\n");
}

// Un dessin sans référence (un PNJ qui n'a pas encore de portrait, comme Thémès au début).
async function dessinerSansReference(prompt) {
    const cles = window.clesApiObjets();
    for (const model of ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"]) {
        try {
            const rep = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai },
                body: JSON.stringify({ model, prompt, n: 1, size: "1024x1536", quality: "medium", output_format: "png" })
            });
            const texte = await rep.text();
            if (rep.status === 404 || texte.includes("model_not_found")) continue;
            const j = JSON.parse(texte);
            const image = j && j.data && j.data[0];
            if (image) return image.url || ("data:image/png;base64," + image.b64_json);
        } catch (e) { console.warn("[Camp] Dessin sans référence :", e); }
    }
    return "";
}

// LES DEUX IMAGES D'UN MEMBRE. `m` : { id, nom, collection ("Personnages" | "Monde_PNJ"),
// reference (url), armure ({ uid, image } ou null), description }. Rend les deux images, ou null.
export async function dessinerImagesCamp(m, alea = Math.random) {
    const poses = CP.deuxPoses(alea);
    let blobPerso = null, blobArmure = null;
    if (m.reference && typeof window.imageVersBlobPng === "function") blobPerso = await window.imageVersBlobPng(m.reference);
    if (blobPerso && m.armure && m.armure.image) blobArmure = await window.imageVersBlobPng(m.armure.image);
    const images = [];
    for (const pose of poses) {
        const prompt = promptImageCamp(m.nom, pose, !!blobPerso, m.description);
        const dessin = blobPerso ? await window.dessinerAvecReferences(blobPerso, blobArmure, prompt) : await dessinerSansReference(prompt);
        if (!dessin) return null;
        const url = await window.hebergerDetoure(dessin);
        if (!url) return null;
        images.push({ url, pose });
    }
    return images;
}

// ---------------------------------------------------------------------
//  LE COMPAGNON : SON GABARIT (MIA_GABARIT)
// ---------------------------------------------------------------------
export async function gabaritDuCompagnon(compagnon) {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("missions")) return "";
    const consigne = `Tu es MIA_GABARIT. Voici le compagnon animal d'un pisteur : « ${compagnon.nom || ""} » — ${compagnon.description || ""}.
Dis s'il se tient au sol et de GROS gabarit (loup, ours, sanglier, grand félin…), au sol et de PETIT gabarit (renard, chat, furet, chien de petite taille…), ou s'il vit dans les AIRS (rapace, corbeau, chouette…).
Réponds en JSON seul : { "gabarit": "sol_gros" | "sol_petit" | "air" }`;
    const corps = JSON.stringify({ contents: [{ role: "user", parts: [{ text: consigne }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } });
    const rep = await window.fetchGemini("missions", corps);
    const j = await rep.json();
    const g = JSON.parse(j.candidates[0].content.parts[0].text || "{}").gabarit;
    return ["sol_gros", "sol_petit", "air"].includes(g) ? g : "";
}

// ---------------------------------------------------------------------
//  LA VEILLE : un membre du camp à la fois
// ---------------------------------------------------------------------
// Les membres du camp (héros et PNJ) avec de quoi décider s'il faut les dessiner.
async function membresADessiner() {
    const camp = window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null;
    if (!camp) return [];
    const persos = window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [];
    const out = [];
    for (const id of Object.keys(camp.Membres || {})) {
        const h = persos.find(x => x.idPersonnage === id);
        if (h) {
            const armure = h.equipArmure && h.equipArmure.nom ? h.equipArmure : null;
            out.push({ id, nom: h.prenom || camp.Membres[id].Nom || "", collection: "Personnages", reference: h.urlPortraitReference || h.urlCloudinary || "",
                       armure, images: h.imagesCamp, armureFaite: h.imagesCampArmure, armureActuelle: armure ? (armure.uid || armure.nom) : "", compagnon: h.compagnon || null });
            continue;
        }
        const f = await lirePnj(id);
        if (!f) continue;
        out.push({ id, nom: f.Nom_PNJ || camp.Membres[id].Nom || "", collection: "Monde_PNJ", reference: f.URL_Cloudinary || "", armure: null,
                   description: [f.Race, f.Occupation, f.Description_Physique].filter(Boolean).join(", "),
                   images: f.Images_Camp, armureFaite: f.Images_Camp_Armure || "", armureActuelle: "", enCours: f.Images_Camp_En_Cours });
    }
    return out;
}
const cachePnj = new Map();
async function lirePnj(id) {
    const c = cachePnj.get(id);
    if (c && Date.now() - c.le < 30000) return c.f;
    try { const s = await getDoc(doc(db, "Monde_PNJ", id)); const f = s.exists() ? s.data() : null; cachePnj.set(id, { f, le: Date.now() }); return f; }
    catch (e) { return null; }
}
export const oublierPnj = (id) => cachePnj.delete(id);

let occupe = false;
export async function veiller() {
    if (occupe || document.hidden || !idPartie() || !peutDessiner()) return false;
    occupe = true;
    try {
        const membres = await membresADessiner();
        // Le gabarit d'un compagnon qui ne l'a pas encore (un appel de texte, vite fait).
        const sansGabarit = membres.find(m => m.compagnon && !m.compagnon.mort && (m.compagnon.nom || m.compagnon.description) && !m.compagnon.gabarit);
        if (sansGabarit) {
            const g = await gabaritDuCompagnon(sansGabarit.compagnon).catch(() => "");
            if (g) { await updateDoc(doc(db, "Personnages", sansGabarit.id), { Compagnon_Gabarit: g }); sansGabarit.compagnon.gabarit = g; }
        }
        const m = membres.find(x => CP.imagesCampAFaire(x.images, x.armureFaite, x.armureActuelle) && !(x.enCours && Date.now() - Number(x.enCours) < VERROU_MS));
        if (!m) return false;
        const ref = doc(db, m.collection, m.id);
        // Le verrou : relu juste avant, pour ne pas dessiner deux fois le même membre.
        const s = await getDoc(ref);
        const d = s.exists() ? s.data() : {};
        if (d.Images_Camp_En_Cours && Date.now() - Number(d.Images_Camp_En_Cours) < VERROU_MS) return false;
        await updateDoc(ref, { Images_Camp_En_Cours: Date.now() });
        const anciennes = (Array.isArray(m.images) ? m.images : []).map(i => i && i.url).filter(Boolean);
        console.log(`🏕️ [Camp] Les deux images en scène de ${m.nom}…`);
        const images = await dessinerImagesCamp(m);
        if (!images) { await updateDoc(ref, { Images_Camp_En_Cours: 0 }); return false; }
        await updateDoc(ref, { Images_Camp: images, Images_Camp_Armure: m.armureActuelle || "", Images_Camp_En_Cours: 0 });
        oublierPnj(m.id);
        // Les anciennes (une armure changée) : effacées.
        if (anciennes.length && typeof window.oublierImages === "function") Promise.resolve(window.oublierImages(anciennes, "images du camp refaites")).catch(() => {});
        console.log(`✅ [Camp] ${m.nom} : ${images.map(i => i.pose).join(" ; ")}.`);
        return true;
    } catch (e) { console.error("[Camp] Les images en scène :", e); return false; }
    finally { occupe = false; }
}
setInterval(() => { veiller(); }, 20000);

window.CAMP_AVATARS = { veiller, dessinerImagesCamp, promptImageCamp, gabaritDuCompagnon, oublierPnj };
