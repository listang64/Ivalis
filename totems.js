// =========================================================================
//  IVALIS — LES TOTEMS DU CHAMAN, À L'ÉCRAN (v368)
// =========================================================================
//  Nico : « À la création d'un totem, une page avec le choix entre ses totems. »
//  1. La fenêtre des douze effets, par caractéristique : ceux d'une
//     caractéristique sous 14 sont grisés (les caractéristiques ne vivent pas
//     dans l'état du combat : c'est ici qu'on les lit).
//  2. La case : on la touche sur le plateau (2 cases au plus, en vue, libre).
//  3. Le totem naît comme le leurre de l'Illusion : sa fiche et son pion d'abord
//     (que les écouteurs propagent à tous), puis la demande au cerveau, qui le
//     fait entrer dans le combat (totems_pur.js).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const EFFETS = [
    ["cha", "cha_peur", "Peur", "40 %"], ["cha", "cha_confusion", "Confusion", "40 %"],
    ["cha", "cha_immobilisation", "Immobilisation", "40 % · rayon 2"], ["cha", "cha_poison", "Empoisonnement", "60 %"],
    ["sag", "sag_saignement", "Saignement", "60 %"], ["sag", "sag_purification", "Purification", "60 % · alliés : retire un état"],
    ["sag", "sag_soin", "Soin", "+3 PV par manche · alliés"], ["sag", "sag_repousser", "Repousser", "60 %"],
    ["int", "int_brulure", "Brûlure", "60 %"], ["int", "int_gel", "Gel", "60 %"],
    ["int", "int_electrifie", "Électrifié", "60 %"], ["int", "int_attirer", "Attirer", "60 % · rayon 2"]
];
const CARACS = { cha: "Charisme", sag: "Sagesse", int: "Intelligence" };
const COULEURS = { cha: "#9a5cd0", sag: "#3f9a4a", int: "#3a7bd5" };
const CARAC_MIN = 14, PORTEE = 2;
window.EFFETS_TOTEM_ECRAN = EFFETS;

const echapper = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const persoDe = (id) => (window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === id) || null;
// Les caractéristiques du héros (Caracteristiques/<id>, en mémoire ou en cache).
function caracsDe(id) {
    const p = (window.CARACS_PARTIE || {})[id];
    if (p && Object.keys(p).length) return p;
    try { const m = localStorage.getItem("ivalis_caracs_" + id); if (m) return JSON.parse(m); } catch (e) {}
    return {};
}
window.caracsTotemDe = caracsDe;
const distance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

// LE PION DU TOTEM : un mât sculpté, trois visages empilés, aux couleurs de sa caractéristique.
export function imageTotem(carac) {
    const c = COULEURS[carac] || "#3f9a4a";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="47" fill="#2a1d12" stroke="${c}" stroke-width="5"/>
      <circle cx="50" cy="50" r="40" fill="${c}" opacity="0.25"/>
      <path d="M20 26 Q50 12 80 26 L72 32 Q50 24 28 32 Z" fill="${c}"/>
      <rect x="36" y="28" width="28" height="56" rx="4" fill="#8a5a2b" stroke="#3a2210" stroke-width="2"/>
      <g fill="#3a2210"><circle cx="44" cy="38" r="3"/><circle cx="56" cy="38" r="3"/><rect x="44" y="44" width="12" height="3" rx="1"/>
      <circle cx="44" cy="56" r="3"/><circle cx="56" cy="56" r="3"/><path d="M43 62 Q50 67 57 62" stroke="#3a2210" stroke-width="2.5" fill="none"/>
      <circle cx="44" cy="73" r="3"/><circle cx="56" cy="73" r="3"/><rect x="45" y="78" width="10" height="3" rx="1"/></g>
      <rect x="36" y="49" width="28" height="2" fill="${c}"/><rect x="36" y="66" width="28" height="2" fill="${c}"/>
    </svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg.replace(/\s+/g, " "));
}
window.imageTotem = imageTotem;

// --- 1. LA FENÊTRE DES EFFETS ----------------------------------------------
window.ouvrirPoseTotem = function (idLanceur) {
    window.fermerPoseTotem();
    const caracs = caracsDe(idLanceur);
    const fenetre = document.createElement("div");
    fenetre.id = "fenetre-choix-totem";
    fenetre.className = "fenetre-choix-totem";
    const colonne = (k) => {
        const valeur = Number(caracs[k]) || 0;
        const ouvert = valeur >= CARAC_MIN;
        return `<div class="totem-colonne${ouvert ? "" : " fermee"}" style="--teinte:${COULEURS[k]}">
            <div class="totem-carac">${k === "int" ? "Totem d'intelligence" : "Totem de " + CARACS[k].toLowerCase()} <small>${CARACS[k]} ${valeur || "?"}${ouvert ? "" : ` · ${CARAC_MIN} requis`}</small></div>
            ${EFFETS.filter(e => e[0] === k).map(([, id, nom, detail]) => `
                <button type="button" class="totem-effet" data-effet="${id}" ${ouvert ? "" : "disabled"}>
                    <b>${echapper(nom)}</b><span>${echapper(detail)}</span></button>`).join("")}
        </div>`;
    };
    fenetre.innerHTML = `
        <div class="totem-titre">🗿 Quel totem planter ?</div>
        <div class="totem-texte">Son effet touche tout le monde à 1 case autour de lui, à l'entrée et en fin de manche ; deux totems reliés le transmettent à qui traverse leur faisceau.</div>
        <div class="totem-colonnes">${["cha", "sag", "int"].map(colonne).join("")}</div>
        <button type="button" class="totem-annuler">Annuler</button>`;
    document.body.appendChild(fenetre);
    fenetre.querySelector(".totem-annuler").addEventListener("click", () => window.fermerPoseTotem());
    fenetre.querySelectorAll(".totem-effet:not([disabled])").forEach(b => b.addEventListener("click", () => {
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        choisirCase(idLanceur, b.dataset.effet);
    }));
};
window.fermerPoseTotem = function () {
    const f = document.getElementById("fenetre-choix-totem");
    if (f) f.remove();
    const pose = window.POSE_TOTEM;
    if (pose && pose.nettoyer) try { pose.nettoyer(); } catch (e) {}
    window.POSE_TOTEM = null;
    const b = document.getElementById("bandeau-pose-totem");
    if (b) b.remove();
};

// --- 2. LA CASE ------------------------------------------------------------
// Pourquoi on ne peut pas planter ici (null : on peut).
window.casePourTotem = function (idLanceur, hex) {
    const ici = (window.TOKENS_VTT_DATA || {})[idLanceur];
    if (!ici || !hex) return "Case invalide";
    const d = distance(ici, hex);
    if (d < 1) return "Pas sur vous";
    if (d > PORTEE) return "Hors de portée (2 cases)";
    const e = typeof window.etatCaseCombat === "function" ? window.etatCaseCombat(hex.q, hex.r) : {};
    if (e.isBlocked || e.isDeleted) return "Case impraticable";
    if (typeof window.murEnCase === "function" && window.murEnCase(hex.q, hex.r)) return "Il y a un mur";
    const occupe = Object.entries(window.TOKENS_VTT_DATA || {}).some(([id, t]) => t && t.q === hex.q && t.r === hex.r
        && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(id)));
    if (occupe) return "Case occupée";
    if (typeof window.verifierLigneDeVueVTT === "function" && !window.verifierLigneDeVueVTT(ici, hex)) return "Vue obstruée";
    return null;
};
function choisirCase(idLanceur, effet) {
    const f = document.getElementById("fenetre-choix-totem");
    if (f) f.remove();
    const nom = (EFFETS.find(e => e[1] === effet) || [])[2] || "Totem";
    window.POSE_TOTEM = { idLanceur, effet, nettoyer: null };
    const bandeau = document.createElement("div");
    bandeau.id = "bandeau-pose-totem";
    bandeau.className = "bandeau-pose-murs bandeau-pose-totem";
    bandeau.innerHTML = `
        <div class="pose-murs-titre">🗿 Totem : ${echapper(nom)}</div>
        <div class="pose-murs-texte">Touchez la case où le planter (à ${PORTEE} cases, en vue, libre).</div>
        <div class="pose-murs-boutons"><button type="button" class="pose-murs-annuler">Annuler</button></div>`;
    document.body.appendChild(bandeau);
    bandeau.querySelector(".pose-murs-annuler").addEventListener("click", () => window.fermerPoseTotem());
    if (typeof window.armerClicFrancPlateau === "function") {
        window.POSE_TOTEM.nettoyer = window.armerClicFrancPlateau((x, y) => {
            if (!window.PLATEAU_VTT) return;
            const hex = window.PLATEAU_VTT.pixelToHex((x - window.VTT_POS_X) / window.VTT_SCALE, (y - window.VTT_POS_Y) / window.VTT_SCALE);
            window.toucherCaseTotem(hex);
        });
    }
}
window.toucherCaseTotem = function (hex) {
    const pose = window.POSE_TOTEM;
    if (!pose || !hex) return;
    const raison = window.casePourTotem(pose.idLanceur, hex);
    if (raison) {
        if (typeof window.afficherMessageFlottantHex === "function") window.afficherMessageFlottantHex(hex.q, hex.r, raison, "#aaaaaa");
        return;
    }
    const { idLanceur, effet } = pose;
    window.fermerPoseTotem();
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    return window.planterTotem(idLanceur, effet, { q: hex.q, r: hex.r });
};

// --- 3. LE TOTEM NAÎT -------------------------------------------------------
window.planterTotem = async function (idLanceur, effet, hex) {
    const lanceur = persoDe(idLanceur);
    if (!lanceur || !window.ID_PARTIE_COURANTE) return null;
    const carac = String(effet || "").slice(0, 3);
    const nom = (EFFETS.find(e => e[1] === effet) || [])[2] || "Totem";
    // Un nom propre, tiré une fois par le seul poste qui plante (pas un dé).
    const id = "TOTEM_" + Math.random().toString(36).substring(2, 9);
    const image = imageTotem(carac);
    const taille = ((window.TOKENS_VTT_DATA || {})[idLanceur] || {}).taille || 55;
    const fiche = {
        ID_Partie: window.ID_PARTIE_COURANTE, ID_Joueur: lanceur.idJoueur || "MJ", ID_Lanceur: idLanceur,
        Camp: lanceur.camp || "Allié", Prenom_Personnage: "Totem", Nom_Personnage: `(${nom})`,
        Statut: "Vivant", PV_Max: 15, PV_Actuels: 15, Fatigue_Max: 0, Fatigue_Actuelle: 0,
        URL_Cloudinary: image, URL_Token: image, Couleur: COULEURS[carac] || "#3f9a4a",
        Initiative: 0, Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Competences_Max: 0,
        // Sans tour, comme un leurre ; un totem, pour l'écran.
        Est_Illusion: true, Est_Totem: true, Totem_Effet: effet
    };
    try {
        await setDoc(doc(db, "Personnages", id), fiche);
        window.TOKENS_VTT_DATA[id] = { q: hex.q, r: hex.r, url: image, taille };
        if (typeof window.enregistrerPionsVTT === "function") await window.enregistrerPionsVTT(id);
        const demande = window.regimeDemande;
        if (demande && typeof demande.techniqueClasse === "function") {
            demande.techniqueClasse(idLanceur, "CLASSE_TOTEM", null, undefined, { totem: { id, q: hex.q, r: hex.r, effet } });
        }
        // Refusé par le cerveau (plus assez d'énergie…) : pas de totem fantôme.
        setTimeout(() => {
            const etat = demande && typeof demande.etat === "function" ? demande.etat() : null;
            if (etat && etat.combattants && !etat.combattants[id] && typeof window.detruireIllusion === "function") window.detruireIllusion(id);
        }, 8000);
        return id;
    } catch (e) {
        console.error("Le totem :", e);
        return null;
    }
};
