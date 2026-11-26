// =========================================================================
//  IVALIS — LES LIENS FORTS : L'AMITIÉ PROFONDE ET L'AMOUR (v497)
// =========================================================================
//  Nico : « un système d'affection, qui peut se transformer en amour ou en amitié profonde entre les personnages ».
//  Les attirances se découvrent en jouant ; plusieurs liens forts possibles ; aucun effet en combat ; l'amour
//  possible entre les héros de deux joueurs (tous deux d'accord) ; Thémès : une amitié, jamais un amour.
//  Les règles : social_pur.js (affection, paliers, evolutionLienFort) ; les écritures : social.js.
//  Ici : les post-its du joueur (ce que ressent son héros ; la déclaration d'un autre joueur), et ce que la fiche, la
//  gestion du camp et le réseau affichent (le cache des liens forts de la partie).
// =========================================================================
const idPartie = () => window.ID_PARTIE_COURANTE || "";
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const S = () => window.SOCIAL || null;
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
export const ICONES = { amour: "❤", amitie: "✦" };

// ---------------------------------------------------------------------
//  LE CACHE DES LIENS FORTS
// ---------------------------------------------------------------------
let forts = [], lus = 0, enLecture = null, noms = {};
export async function lire(force) {
    if (!idPartie() || !S() || !S().lireLiensForts) return forts;
    if (!force && Date.now() - lus < 20000) return forts;
    if (enLecture) return enLecture;
    enLecture = (async () => {
        try {
            forts = await S().lireLiensForts(idPartie()); lus = Date.now();
            const ids = [...new Set(forts.flatMap(l => [l.de, l.vers]))].filter(id => !noms[id]);
            if (ids.length && S().lireAmes) { const ames = await S().lireAmes(idPartie(), ids); Object.values(ames || {}).forEach(a => { if (a && a.id) noms[a.id] = a.nom; }); }
        }
        catch (e) { console.warn("[Liens forts] La lecture :", e); }
        enLecture = null;
        return forts;
    })();
    return enLecture;
}
// Les liens chers d'un personnage : ceux qu'il porte, et ceux qu'on lui porte (réciproques fusionnés).
export function deLui(id) {
    const out = new Map();
    forts.forEach(l => {
        if (l.de !== id && l.vers !== id) return;
        const autre = l.de === id ? l.vers : l.de;
        const x = out.get(autre) || { id: autre, sien: null, envers: null };
        if (l.de === id) x.sien = l; else x.envers = l;
        out.set(autre, x);
    });
    return [...out.values()];
}
// L'icône d'un personnage dans une liste : ❤ s'il aime ou est aimé, ✦ pour une amitié profonde.
export function icone(id) {
    const l = deLui(id);
    if (l.some(x => (x.sien && x.sien.fort.type === "amour") || (x.envers && x.envers.fort.type === "amour"))) return ICONES.amour;
    if (l.length) return ICONES.amitie;
    return "";
}

// ---------------------------------------------------------------------
//  LES POST-ITS DU JOUEUR
// ---------------------------------------------------------------------
function zone() {
    let z = document.getElementById("postits-liens-forts");
    if (z) return z;
    z = document.createElement("div");
    z.id = "postits-liens-forts";
    z.className = "postits-liens-forts";
    document.body.appendChild(z);
    z.addEventListener("click", surClic);
    return z;
}
let signature = "";
export function majPostits() {
    const d = window.PARTIE_DATA || {}, j = moi();
    const props = Object.entries(d.Liens_Proposes || {}).filter(([, x]) => x && x.joueur === j);
    const decl = Object.entries(d.Declarations_Liens || {}).filter(([, x]) => x && x.pour === j);
    const sig = JSON.stringify([props.map(([k]) => k), decl.map(([k]) => k)]);
    if (sig === signature) return;
    signature = sig;
    const z = zone();
    z.innerHTML = props.map(([k, x]) => x.evolution === "amour" ? `<div class="postit-lien-fort" data-cle="${echapper(k)}">
        <div class="titre-postit-lien">${ICONES.amitie} ${echapper(x.nomDe)} et ${echapper(x.nomVers)}</div>
        <p>${x.parce ? `${echapper(x.parce)} ` : ""}${echapper(x.nomDe)} tient profondément à ${echapper(x.nomVers)}… et peut-être plus. Est-ce devenu de l'amour ?</p>
        <div class="boutons-postit-lien">
          <button type="button" data-lf="amour">${ICONES.amour} De l'amour</button>
          <button type="button" data-lf="rien">Rester amis</button>
        </div></div>` : `<div class="postit-lien-fort" data-cle="${echapper(k)}">
        <div class="titre-postit-lien">${echapper(x.nomDe)} et ${echapper(x.nomVers)}</div>
        <p>${x.parce ? `${echapper(x.parce)} ` : ""}${echapper(x.nomDe)} et ${echapper(x.nomVers)} sont devenus très proches. Que ressent ${echapper(x.nomDe)} ?</p>
        <div class="boutons-postit-lien">
          <button type="button" data-lf="amitie">${ICONES.amitie} Une amitié profonde</button>
          ${x.amourPossible ? `<button type="button" data-lf="amour">${ICONES.amour} De l'amour</button>` : ""}
          <button type="button" data-lf="rien">Rien de plus</button>
        </div></div>`).join("")
      + decl.map(([k, x]) => `<div class="postit-lien-fort declaration" data-decl="${echapper(k)}">
        <div class="titre-postit-lien">${x.type === "amour" ? ICONES.amour : ICONES.amitie} ${echapper(x.nomDe)} → ${echapper(x.nomVers)}</div>
        <p>${echapper(x.nomDe)} déclare ${x.type === "amour" ? "son amour" : "une amitié profonde"} à ${echapper(x.nomVers)}. ${echapper(x.nomVers)} l'accepte-t-il·elle ?</p>
        <div class="boutons-postit-lien"><button type="button" data-lf="accepter">Accepter</button><button type="button" data-lf="refuser">Refuser</button></div></div>`).join("");
    z.classList.toggle("visible", !!(props.length || decl.length));
}
async function surClic(ev) {
    const b = ev.target.closest("[data-lf]");
    if (!b || !S()) return;
    son();
    const carte = b.closest(".postit-lien-fort");
    if (!carte) return;
    b.disabled = true;
    try {
        if (carte.dataset.cle) await S().repondreProposition(idPartie(), carte.dataset.cle, b.dataset.lf);
        else if (carte.dataset.decl) await S().repondreDeclaration(idPartie(), carte.dataset.decl, b.dataset.lf === "accepter");
    } catch (e) { console.error("[Liens forts] La réponse :", e); }
    carte.remove();
    lire(true);
}
// Déclarer, depuis la fiche d'un autre héros (grimoire_fiches.js) ; défaire un lien des siens.
export async function declarer(de, vers, type) {
    if (!S() || !idPartie()) return "Pas de partie.";
    const r = await S().declarerLien(idPartie(), de, vers, type);
    return r || "";
}
export async function defaire(de, vers) {
    if (!S() || !idPartie()) return "Pas de partie.";
    await S().defaireLien(idPartie(), de, vers);
    await lire(true);
    return "";
}

setInterval(() => {
    if (document.hidden || !idPartie()) return;
    try { majPostits(); } catch (e) {}
    lire(false);
}, 1500);

export const nom = (id) => noms[id] || id;
window.LIENS_FORTS = { nom, lire, deLui, icone, majPostits, declarer, defaire, ICONES, liste: () => forts.slice() };
