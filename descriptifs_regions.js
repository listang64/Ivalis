// =========================================================================
//  IVALIS — LES DESCRIPTIFS RP DES RÉGIONS (v274)
// =========================================================================
//  Nico : « une base pour le descriptif RP des régions, que l'on enverra plus
//  tard à l'IA maître du jeu : toutes les infos de la région où sont les
//  joueurs. Dans l'outil DEV rouge, sur la map globale, un bouton pour éditer
//  les descriptifs ; pour indiquer qu'on est dans ce mode, un contour rouge
//  tout autour de l'écran ; les autres modes DEV sont désactivés quand on
//  l'active. Dans ce mode, un clic sur une région n'ouvre pas la map, mais une
//  fenêtre pleine page : en haut le titre de la région, en dessous une grosse
//  zone de texte reliée à la base, et un bouton pour fermer. »
//
//  LA BASE : la fiche de la carte régionale, Cartes_Regionales/{numéro de la
//  boîte}, champ Description (cartes_regionales.js, enregistrerDescriptifRegion
//  et descriptifRPRegionPourMJ, ce que le maître du jeu lira).
//
//  L'ENREGISTREMENT : automatique, un instant après la dernière frappe, et à
//  la fermeture. Un descriptif changé sur un autre poste arrive dans la
//  fenêtre — sauf si on est en train d'y écrire (on ne perd jamais sa frappe).
//
//  LE MODE : DEV seulement, sur ce poste, le temps de la séance. L'activer
//  arrête l'édition des boîtes ; « Afficher les boîtes » ou la sortie du DEV
//  l'arrêtent.
// =========================================================================
const DELAI_ENREGISTREMENT_MS = 900;
const $ = (id) => document.getElementById(id);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const clic = () => { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); };

let actif = false;
const fenetre = { numero: null, modifie: false, minuteur: null, enregistrement: Promise.resolve() };

window.modeDescriptifRegions = () => actif && estDev();

// --- LE MODE ET SON CADRE ROUGE ------------------------------------------------
function cadre() {
    let el = $("cadre-mode-descriptifs");
    if (!el) {
        el = document.createElement("div");
        el.id = "cadre-mode-descriptifs";
        el.className = "cadre-mode-descriptifs";
        el.innerHTML = `<span class="cadre-mode-descriptifs-etiquette">Descriptifs des régions</span>`;
        document.body.appendChild(el);
    }
    return el;
}
function actualiser() {
    const on = window.modeDescriptifRegions();
    cadre().style.display = on ? "block" : "none";
    const bouton = $("btn-mode-descriptifs");
    if (bouton) {
        bouton.classList.toggle("actif", on);
        bouton.setAttribute("aria-pressed", on ? "true" : "false");
        bouton.textContent = on ? "✎ Quitter les descriptifs" : "✎ Éditer les descriptifs de région";
    }
    if (typeof window.dessinerRegions === "function") window.dessinerRegions();
    if (typeof window.actualiserPopupRegions === "function") window.actualiserPopupRegions();
}
window.basculerModeDescriptifRegions = function(oui) {
    const voulu = (typeof oui === "boolean" ? oui : !actif) && estDev();
    if (voulu === actif) { actualiser(); return actif; }
    actif = voulu;
    // Un seul mode DEV à la fois : les boîtes repassent en jeu.
    if (actif && typeof window.afficherRegionsDev === "function") window.afficherRegionsDev(false);
    if (!actif && fenetre.numero !== null) window.fermerDescriptifRegion();
    actualiser();
    return actif;
};

// --- LA FENÊTRE PLEINE PAGE ------------------------------------------------------
function construire() {
    let el = $("fenetre-descriptif-region");
    if (el) return el;
    el = document.createElement("div");
    el.id = "fenetre-descriptif-region";
    el.className = "fenetre-descriptif-region";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.style.display = "none";
    el.innerHTML = `
        <div class="descriptif-region-tete">
          <h1 id="descriptif-region-titre" class="descriptif-region-titre"></h1>
          <button type="button" id="btn-fermer-descriptif" class="descriptif-region-fermer" title="Fermer" aria-label="Fermer">✕</button>
        </div>
        <textarea id="descriptif-region-texte" class="descriptif-region-texte" spellcheck="true"
                  placeholder="Le descriptif RP de la région : ses peuples, ses lieux, son histoire, ses tensions, ce que le maître du jeu doit savoir quand les joueurs y sont…"></textarea>
        <div class="descriptif-region-pied">
          <span id="descriptif-region-etat" class="descriptif-region-etat"></span>
          <span id="descriptif-region-compte" class="descriptif-region-compte"></span>
          <button type="button" id="btn-fermer-descriptif-bas" class="descriptif-region-bouton">Fermer</button>
        </div>`;
    document.body.appendChild(el);
    const zone = el.querySelector("#descriptif-region-texte");
    zone.addEventListener("input", () => {
        fenetre.modifie = true;
        etat("Modifications en cours…");
        compter();
        clearTimeout(fenetre.minuteur);
        fenetre.minuteur = setTimeout(() => { enregistrer(); }, DELAI_ENREGISTREMENT_MS);
    });
    el.querySelector("#btn-fermer-descriptif").addEventListener("click", () => { clic(); window.fermerDescriptifRegion(); });
    el.querySelector("#btn-fermer-descriptif-bas").addEventListener("click", () => { clic(); window.fermerDescriptifRegion(); });
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); window.fermerDescriptifRegion(); } });
    return el;
}
const etat = (texte) => { const e = $("descriptif-region-etat"); if (e) e.textContent = texte || ""; };
function compter() {
    const zone = $("descriptif-region-texte"), compte = $("descriptif-region-compte");
    if (!zone || !compte) return;
    const mots = (zone.value.trim().match(/\S+/g) || []).length;
    compte.textContent = `${mots} mot${mots > 1 ? "s" : ""}`;
}
// L'enregistrement : à la suite des précédents, jamais deux à la fois.
function enregistrer() {
    clearTimeout(fenetre.minuteur);
    if (fenetre.numero === null || !fenetre.modifie) return fenetre.enregistrement;
    const numero = fenetre.numero, texte = $("descriptif-region-texte").value;
    fenetre.modifie = false;
    etat("Enregistrement…");
    fenetre.enregistrement = fenetre.enregistrement.then(async () => {
        const ok = typeof window.enregistrerDescriptifRegion === "function" && await window.enregistrerDescriptifRegion(numero, texte);
        if (fenetre.numero === numero && !fenetre.modifie) etat(ok ? "✔️ Enregistré" : "⚠️ Non enregistré (connexion ?)");
        if (!ok && fenetre.numero === numero) fenetre.modifie = true;
        return ok;
    });
    return fenetre.enregistrement;
}

window.ouvrirDescriptifRegion = function(numero) {
    if (!window.modeDescriptifRegions()) return false;
    const n = Number(numero);
    if (!(n > 0) || typeof window.descriptifRegion !== "function") return false;
    const el = construire();
    const d = window.descriptifRegion(n);
    fenetre.numero = n;
    fenetre.modifie = false;
    $("descriptif-region-titre").textContent = d.nom;
    const zone = $("descriptif-region-texte");
    zone.value = d.texte || "";
    etat(d.texte ? "" : "Aucun descriptif pour l'instant");
    compter();
    el.style.display = "flex";
    clic();
    setTimeout(() => { try { zone.focus(); } catch (e) { /* pas de clavier */ } }, 30);
    return true;
};
window.fermerDescriptifRegion = async function() {
    const el = $("fenetre-descriptif-region");
    if (!el || fenetre.numero === null) return false;
    await enregistrer();
    fenetre.numero = null;
    el.style.display = "none";
    if (typeof window.masquerTooltipLieu === "function") window.masquerTooltipLieu();
    return true;
};
window.descriptifRegionOuvert = () => fenetre.numero;

// --- AU CHARGEMENT ---------------------------------------------------------------
(function demarrer() {
    // Un autre poste a changé le descriptif ouvert : on le reprend, sauf si on
    // est en train d'y écrire.
    window.addEventListener("cartes-regionales-maj", () => {
        if (fenetre.numero === null || fenetre.modifie) return;
        const d = window.descriptifRegion(fenetre.numero), zone = $("descriptif-region-texte");
        if (zone && zone.value !== d.texte) { zone.value = d.texte || ""; compter(); etat("Mis à jour depuis un autre poste"); }
        const titre = $("descriptif-region-titre");
        if (titre) titre.textContent = d.nom;
    });
    // Le DEV s'éteint : le mode s'arrête avec lui.
    const lancer = () => {
        const avant = window.actualiserRegionsDev;
        if (typeof avant === "function" && !avant.__descriptifs) {
            const enveloppe = function() {
                const r = avant.apply(this, arguments);
                if (actif && !estDev()) window.basculerModeDescriptifRegions(false);
                else actualiser();
                return r;
            };
            enveloppe.__descriptifs = true;
            window.actualiserRegionsDev = enveloppe;
        }
        actualiser();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();
