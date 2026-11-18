// =========================================================================
//  IVALIS — LES CLANS DES JOUEURS : LEUR NOM, LEUR FANION (v434)
// =========================================================================
//  Nico : « chaque joueur qui n'a pas de clan dans la base : à sa prochaine
//  connexion, une popup de création de son clan, avec le nom de son clan et en
//  dessous la description de sa bannière. Une fois validé, l'IA crée un fanion
//  réaliste avec l'emblème de son clan sur fond blanc sans ombrage, hébergé sur
//  Cloudinary ; un algo supprime le fond blanc (v447 : un fond magenta, détouré comme
//  les personnages), et l'image va sur la page de
//  droite du clan, en grand, collée en haut de page. » « On peut fermer la popup :
//  elle revient à la connexion suivante ; le MJ n'est pas un joueur. » « Un bouton
//  dans les paramètres pour reboot un clan : son nom, sa description et son image
//  partent de la base et de Cloudinary ; à sa prochaine connexion, le joueur
//  refait sa bannière. »
//
//  LA BASE : Clans/{ID_Joueur} — { ID_Joueur, Nom_Clan, Description_Banniere,
//  URL_Banniere, Banniere_En_Cours (l'heure où un poste a commencé à la dessiner),
//  Cree_Le }. (Pas dans Joueurs : ses règles n'y laissent écrire que les admins.)
//
//  LE FANION se dessine sur un poste qui a les clés OpenAI et Cloudinary (gardées
//  dans chaque navigateur) : celui du joueur s'il les a ; sinon le premier poste
//  qui les a et qui ouvre le jeu dessine les fanions en attente. D'ici là, la page
//  du clan montre déjà son nom.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, getDocs, collection, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION = "Clans";
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lireLS = (k) => { try { return (localStorage.getItem(k) || "").trim(); } catch (e) { return ""; } };
const idJoueur = () => lireLS("ID_JOUEUR_COURANT");
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const cles = () => ({ openai: lireLS("ivalis_OPENAI_API_KEY"), cloudName: lireLS("ivalis_CLOUDINARY_CLOUD_NAME"),
                      cloudKey: lireLS("ivalis_CLOUDINARY_API_KEY"), cloudSecret: lireLS("ivalis_CLOUDINARY_API_SECRET") });
const aLesCles = (c = cles()) => !!(c.openai && c.cloudName && c.cloudKey && c.cloudSecret);
export const NOM_MAX = 40, DESCRIPTION_MAX = 600;
const VERROU_MS = 5 * 60 * 1000;      // un fanion « en cours » depuis plus longtemps : un autre poste le reprend

// Les fiches et la page des clans (grimoire_fiches.js) relisent les clans.
const rafraichir = () => { try { if (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.rechargerClans) window.GRIMOIRE_FICHES.rechargerClans(); } catch (e) {} };

export async function lireClan(id) {
    if (!id) return null;
    try { const s = await getDoc(doc(db, COLLECTION, id)); return s.exists() ? s.data() : null; }
    catch (e) { console.warn("Les clans : lecture", e); return null; }
}
export async function listerClans() {
    try { const s = await getDocs(collection(db, COLLECTION)); return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.Nom_Clan); }
    catch (e) { console.warn("Les clans : la liste", e); return []; }
}

// ---------------------------------------------------------------------
//  LA POPUP : à la connexion d'un joueur sans clan (une fois par connexion).
// ---------------------------------------------------------------------
let proposee = false;
function connecte() {
    const c = window.COMPTE_JOUEUR;
    // (un vrai compte : Firebase Auth lui donne un uid ; le MJ n'est pas un joueur)
    return !!(c && c.uid && idJoueur() && idJoueur() !== "MJ");
}
async function verifier() {
    if (proposee || !connecte()) return;
    const grimoire = document.getElementById("ecran-grimoire");
    if (!grimoire || getComputedStyle(grimoire).display === "none") return;
    proposee = true;
    const c = await lireClan(idJoueur());
    if (!c || !String(c.Nom_Clan || "").trim()) ouvrirPopup();
}
export function ouvrirPopup() {
    if (document.getElementById("popup-clan")) return;
    const voile = document.createElement("div");
    voile.id = "popup-clan";
    voile.className = "voile-clan";
    voile.innerHTML = `<form class="parchemin-clan" novalidate>
        <button type="button" class="fermer-clan" data-clan="fermer" aria-label="Plus tard">✕</button>
        <div class="titre-popup-clan">Fonde ton clan</div>
        <p class="texte-popup-clan">Chaque aventurier d'Ivalis porte les couleurs de son clan. Donne-lui un nom, puis décris sa bannière : l'emblème qu'on brodera sur son fanion.</p>
        <label class="champ-clan">Le nom de ton clan
          <span class="ligne-nom-clan"><span class="prefixe-clan" aria-hidden="true">Clan</span><input type="text" id="clan-nom" class="input-parchemin" maxlength="${NOM_MAX}" autocomplete="off" placeholder="des Loups d'Argent"></span>
        </label>
        <label class="champ-clan">La bannière de ton clan
          <textarea id="clan-description" class="input-parchemin" maxlength="${DESCRIPTION_MAX}" rows="4" placeholder="Un loup d'argent hurlant sous un croissant de lune, sur un fond bleu nuit bordé d'or."></textarea>
        </label>
        <p class="message-clan" id="clan-message"></p>
        <button type="submit" class="valider-clan" data-clan="valider">Fonder mon clan</button>
      </form>`;
    document.body.appendChild(voile);
    voile.addEventListener("click", (e) => { if (e.target.closest('[data-clan="fermer"]')) { son(); fermerPopup(); } });
    voile.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); valider(); });
    setTimeout(() => { const i = document.getElementById("clan-nom"); if (i) i.focus(); }, 50);
}
export function fermerPopup() { const v = document.getElementById("popup-clan"); if (v) v.remove(); }
async function valider() {
    // (v435) « Clan » est déjà écrit devant le champ (il s'affichera ainsi) : tapé quand même, il ne compte pas deux fois.
    const nom = (document.getElementById("clan-nom").value || "").trim().replace(/\s+/g, " ").replace(/^clan\s+/i, "");
    const description = (document.getElementById("clan-description").value || "").trim();
    const msg = document.getElementById("clan-message");
    if (nom.length < 2) { msg.textContent = "Donne un nom à ton clan."; return; }
    if (description.length < 5) { msg.textContent = "Décris la bannière de ton clan."; return; }
    son();
    const bouton = document.querySelector(".valider-clan");
    if (bouton) bouton.disabled = true;
    const ok = await fonderClan(idJoueur(), nom, description);
    if (!ok) { msg.textContent = "Le clan n'a pas pu être enregistré. Réessaie."; if (bouton) bouton.disabled = false; return; }
    fermerPopup();
}
export async function fonderClan(id, nom, description) {
    if (!id || id === "MJ") return false;
    try {
        await setDoc(doc(db, COLLECTION, id), { ID_Joueur: id, Nom_Clan: nom, Description_Banniere: description, URL_Banniere: "", Cree_Le: Date.now() }, { merge: true });
    } catch (e) { console.error("Les clans : création", e); return false; }
    rafraichir();
    if (aLesCles()) dessinerFanion(id);   // sans attendre : la page montre déjà le nom
    return true;
}

// ---------------------------------------------------------------------
//  LE FANION : l'IA le peint sur fond magenta, le magenta s'en va, Cloudinary le garde.
// ---------------------------------------------------------------------
// (v447) Nico : « que l'image se fasse sur fond magenta fluo et que l'algo vire toute cette couleur,
// comme pour les personnages, ce sera plus efficace » (le blanc du fond se confondait avec le
// blanc du tissu et des emblèmes). Le fond magenta (#FF00FF), sans reflet magenta sur le fanion ;
// le détourage des personnages (app.js, detourerFondMagenta) ; puis le recadrage sur le fanion.
export function promptFanion(nom, description) {
    return `A single realistic heraldic pennant (a fanion: a hanging cloth banner) for a fantasy clan of adventurers called "${nom}".
The emblem of the clan, embroidered and painted on the fabric: ${description}
The pennant hangs vertically from a short horizontal wooden pole, seen from the front, fully visible and centered, with a natural cloth texture, stitched borders and a pointed or swallow-tailed bottom.
Realistic, detailed, rich colors, lit by natural warm daylight.
TECHNICAL RULE (overrides everything): the background is a totally flat, uniform FLUORESCENT MAGENTA (#FF00FF), filling all the empty space around and behind the pennant: no shadow, no drop shadow, no ground, no wall, no scenery, no gradient, no frame.
The magenta background is only a technical mask and lights NOTHING: no magenta, pink or purple reflections, rims or halos on the pennant, its pole or its fabric (unless the emblem described is itself of these colors).
No text, no letters, no words anywhere on the image.`;
}
// Le recadrage : l'image détourée, réduite à la boîte du fanion (ce qui reste visible), pour
// qu'il se colle au haut de la page.
export function boiteVisible(data, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? { x: 0, y: 0, l: w, h } : { x: x0, y: y0, l: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function recadrer(source) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
                const ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                const boite = boiteVisible(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
                const r = document.createElement("canvas");
                r.width = boite.l; r.height = boite.h;
                r.getContext("2d").drawImage(c, boite.x, boite.y, boite.l, boite.h, 0, 0, boite.l, boite.h);
                resolve(r.toDataURL("image/png"));
            } catch (e) { console.warn("Le fanion : le recadrage", e); resolve(source); }
        };
        img.onerror = () => resolve(source);
        img.src = source;
    });
}
export async function detourerFanion(source) {
    const detouree = typeof window.detourerFondMagenta === "function" ? await window.detourerFondMagenta(source) : source;
    return recadrer(detouree || source);
}
async function signature(message) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(message));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function deposer(source, c) {
    const timestamp = Math.floor(Date.now() / 1000).toString(), dossier = "Clans";
    const f = new FormData();
    f.append("file", source); f.append("api_key", c.cloudKey); f.append("timestamp", timestamp);
    f.append("folder", dossier); f.append("signature", await signature(`folder=${dossier}&timestamp=${timestamp}${c.cloudSecret}`));
    const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`, { method: "POST", body: f });
    const j = await r.json();
    if (!j.secure_url) throw new Error("Cloudinary : " + JSON.stringify(j.error || j).slice(0, 200));
    return j.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
}
const enCours = new Set();
export async function dessinerFanion(id) {
    const c = cles();
    if (!aLesCles(c) || !id || enCours.has(id)) return "";
    const clan = await lireClan(id);
    if (!clan || !clan.Nom_Clan || !clan.Description_Banniere || clan.URL_Banniere) return "";
    if (clan.Banniere_En_Cours && Date.now() - Number(clan.Banniere_En_Cours) < VERROU_MS) return "";
    enCours.add(id);
    try {
        await setDoc(doc(db, COLLECTION, id), { Banniere_En_Cours: Date.now() }, { merge: true });
        const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.openai },
            body: JSON.stringify({ model: "gpt-image-2", prompt: promptFanion(clan.Nom_Clan, clan.Description_Banniere), n: 1, size: "1024x1536", quality: "medium", output_format: "png", moderation: "low" })
        });
        const j = await res.json();
        const d = j && j.data && j.data[0];
        if (!d) throw new Error("OpenAI : " + JSON.stringify((j && j.error) || j).slice(0, 200));
        const brute = d.b64_json ? "data:image/png;base64," + d.b64_json : d.url;
        const detouree = await detourerFanion(brute);
        const url = await deposer(detouree, c);
        // Le clan a pu être réinitialisé entre-temps : on ne réécrit pas un clan effacé.
        const encore = await lireClan(id);
        if (!encore || encore.Nom_Clan !== clan.Nom_Clan) { if (window.supprimerImageCloudinary) window.supprimerImageCloudinary(url); return ""; }
        await setDoc(doc(db, COLLECTION, id), { URL_Banniere: url, Banniere_En_Cours: deleteField() }, { merge: true });
        rafraichir();
        return url;
    } catch (e) {
        console.error("Le fanion du clan " + id + " :", e);
        try { await setDoc(doc(db, COLLECTION, id), { Banniere_En_Cours: deleteField() }, { merge: true }); } catch (e2) {}
        return "";
    } finally { enCours.delete(id); }
}
// Les fanions en attente (des clans fondés sur un poste sans clés) : ce poste-ci les dessine.
export async function dessinerEnAttente() {
    if (!aLesCles()) return 0;
    let n = 0;
    for (const c of await listerClans()) {
        if (c.URL_Banniere || !c.Description_Banniere) continue;
        if (c.Banniere_En_Cours && Date.now() - Number(c.Banniere_En_Cours) < VERROU_MS) continue;
        if (await dessinerFanion(c.id)) n++;
    }
    return n;
}

// ---------------------------------------------------------------------
//  RÉINITIALISER UN CLAN (Paramètres) : nom, description et fanion effacés.
// ---------------------------------------------------------------------
export async function reinitialiserClan(id) {
    if (!id) return false;
    const clan = await lireClan(id);
    if (clan && clan.URL_Banniere && typeof window.supprimerImageCloudinary === "function") {
        try { await window.supprimerImageCloudinary(clan.URL_Banniere); } catch (e) { console.warn("Le fanion sur Cloudinary", e); }
    }
    try {
        await setDoc(doc(db, COLLECTION, id), { Nom_Clan: deleteField(), Description_Banniere: deleteField(), URL_Banniere: deleteField(), Banniere_En_Cours: deleteField(), Cree_Le: deleteField() }, { merge: true });
    } catch (e) { console.error("Les clans : réinitialisation", e); return false; }
    rafraichir();
    return true;
}

// La veille : la popup à la connexion ; les fanions en attente, de temps en temps.
let derniereAttente = 0;
setInterval(() => {
    if (document.hidden) return;
    verifier();
    if (connecte() && aLesCles() && Date.now() - derniereAttente > 5 * 60 * 1000) { derniereAttente = Date.now(); dessinerEnAttente(); }
}, 1500);

window.CLANS_IVALIS = { lireClan, listerClans, ouvrirPopup, fermerPopup, fonderClan, dessinerFanion, dessinerEnAttente, reinitialiserClan,
                        promptFanion, detourerFanion, boiteVisible, NOM_MAX, DESCRIPTION_MAX };
