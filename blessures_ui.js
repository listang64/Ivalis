// =========================================================================
//  IVALIS — LES BLESSURES À L'ÉCRAN, ET LA FIN DU COMBAT
// =========================================================================
//  Nico : « un personnage joueur tombé KO pendant un combat reçoit une
//  blessure avant les loot. Une popup s'ouvre avec marqué défaite ou victoire
//  douloureuse, ensuite apparaît en fondu avec un bruit résonnant et en rouge
//  foncé le nom de la blessure, et 2 secondes après le descriptif. Dans
//  l'onglet Aperçu, tout en bas, un encart pour les blessures, avec le nombre
//  de jours / combats restants. »
//
//  LA FIN D'UN COMBAT S'ÉCRIT UNE FOIS. Victoire (loot.js) ou défaite (tous
//  les héros à terre), c'est `cloturerCombat` : les jets se font AVANT la
//  transaction (elle peut se rejouer, un jet doit rester le même), puis la
//  transaction pose `Fin_Combat` sur la partie — une seule fois par rencontre.
//  Le poste qui la gagne écrit les fiches (Blessures, Mort_Definitive).
//
//  CHACUN VOIT SA PROPRE BLESSURE. Tout le monde voit le grand « VICTOIRE » /
//  « DÉFAITE » ; seul le joueur d'un héros blessé voit sa blessure tomber.
//
//  Les règles (table, jet, durées, effets) vivent dans blessures.js.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const echapper = (t) => String(t === undefined || t === null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nomHeros = (p) => String((p && (p.prenom || p.nom || p.Prenom_Personnage)) || "Le héros").trim();
const estKO = (id) => typeof window.estCombattantMort === "function" && window.estCombattantMort(id);

// Les compétences qu'une Amnésie peut faire oublier : le deck du héros, sans
// ses techniques de classe ni le repos ; à défaut, tout ce qu'il a forgé.
function cartesDuHeros(p) {
    const deck = ((p && p.deckEquipe) || []).filter(id => id && !String(id).startsWith("CLASSE_") && id !== "REPOS_LONG");
    if (deck.length > 0) return deck;
    return Object.keys(((window.CACHE_COMPETENCES_GLOBAL || {})[p && p.idPersonnage]) || {});
}

// Tout ce qu'une copie locale doit savoir tout de suite (sans attendre le
// retour de la base) : la fiche ouverte, les listes de la partie.
function appliquerLocalement(id, maj) {
    const listes = [window.PERSOS_JOUEURS_PARTIE, window.PERSOS_PARTIE, window.COMBAT_PERSOS_JOUEUR];
    listes.forEach(l => (l || []).forEach(p => {
        if (!p || p.idPersonnage !== id) return;
        if (maj.Blessures) p.blessures = maj.Blessures.map(b => ({ ...b }));
        if (maj.Mort_Definitive) p.mortDefinitive = true;
        if (maj.PV_Actuels !== undefined) p.PV_Actuels = maj.PV_Actuels;
        if (maj.Fatigue_Actuelle !== undefined) p.fatigueActuelle = maj.Fatigue_Actuelle;
    }));
    const fiche = window.BLESSURES_FICHE;
    if (fiche && fiche.idPersonnage === id) {
        if (maj.Blessures) fiche.blessures = maj.Blessures.map(b => ({ ...b }));
        if (maj.Mort_Definitive) fiche.mortDefinitive = true;
        window.actualiserBlessuresApercu();
    }
}

async function ecrireFiche(id, maj) {
    await updateDoc(doc(db, "Personnages", id), maj);
    appliquerLocalement(id, maj);
}

// =========================================================================
//  1. CLORE LE COMBAT
// =========================================================================
const CLOTURES = new Set();
window.cloturerCombat = async function (issue) {
    const partie = window.PARTIE_DATA || {};
    const idRencontre = partie.ID_Rencontre || "";
    if (!window.ID_PARTIE_COURANTE || !idRencontre) return null;
    if (partie.Fin_Combat && partie.Fin_Combat.idRencontre === idRencontre) return null;
    if (CLOTURES.has(idRencontre)) return null;
    if (typeof window.modifierPartie !== "function" || typeof window.tirerBlessures !== "function") return null;
    CLOTURES.add(idRencontre);

    const heros = (window.PERSOS_PARTIE || []).filter(p => typeof window.estHerosDuButin === "function" && window.estHerosDuButin(p));
    // LES JETS, AVANT LA TRANSACTION. Un héros encore à terre est blessé ; un
    // héros relevé, ou le Profanateur debout grâce à son sursis, ne l'est pas
    // (estCombattantMort les dit debout).
    const tirages = {};
    const blessures = {};
    heros.forEach(p => {
        if (!estKO(p.idPersonnage)) return;
        const t = window.tirerBlessures(p, Math.random);
        tirages[p.idPersonnage] = t;
        blessures[p.idPersonnage] = {
            nom: nomHeros(p),
            idJoueur: p.idJoueur || "",
            tirages: t.tirages.map(x => {
                const b = window.blessureParId(x.id) || {};
                return { id: x.id, nom: b.nom || x.id, texte: b.texte || "", de: x.de, bonus: x.bonus,
                         retraits: x.retraits, score: x.score };
            })
        };
    });

    const fin = {
        id: "fin_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        idRencontre,
        issue: issue === "defaite" ? "defaite" : "victoire",
        ts: Date.now(),
        participants: heros.map(p => p.idPersonnage),
        blessures
    };

    const gagne = await window.modifierPartie((data) => {
        if ((data.ID_Rencontre || "") !== idRencontre) return null;
        if (data.Fin_Combat && data.Fin_Combat.idRencontre === idRencontre) return null;
        if (data.Reinitialisation_En_Cours
            && (Date.now() - data.Reinitialisation_En_Cours) < (window.DELAI_REINIT_MAX_MS || 60000)) return null;
        return { resultat: true, maj: { Fin_Combat: fin } };
    });
    if (!gagne) { CLOTURES.delete(idRencontre); return null; }
    if (window.PARTIE_DATA) window.PARTIE_DATA.Fin_Combat = fin;

    // LE GAGNANT ÉCRIT LES FICHES. Chaque héros du combat : ses anciennes
    // blessures « combats » décomptées, puis les nouvelles s'il est tombé.
    for (const p of heros) {
        const t = tirages[p.idPersonnage] || null;
        if (!t && window.blessuresDuPerso(p).length === 0) continue;
        const maj = window.majBlessuresFinCombat(p, t, cartesDuHeros(p), Math.random);
        if (maj.Mort_Definitive) maj.Statut = "Mort";
        // UN MAXIMUM RABOTÉ (Déchirure, Mutilation, Choc cardiaque, Poumon
        // perforé) : la fiche n'en garde pas plus. Le combat suivant refuserait
        // un héros au-dessus de ses propres bornes — et c'est très bien.
        const apres = { ...p, blessures: maj.Blessures };
        const pvMax = typeof window.pvMaxCombattant === "function" ? window.pvMaxCombattant(apres) : 0;
        if (pvMax > 0 && (parseInt(p.PV_Actuels) || 0) > pvMax) maj.PV_Actuels = pvMax;
        const fatigueMax = typeof window.fatigueMaxCombattant === "function" ? window.fatigueMaxCombattant(apres) : 0;
        const fatigue = p.fatigueActuelle !== undefined ? p.fatigueActuelle : p.Fatigue_Actuelle;
        if (fatigueMax > 0 && fatigue !== undefined && (parseInt(fatigue) || 0) > fatigueMax) maj.Fatigue_Actuelle = fatigueMax;
        try { await ecrireFiche(p.idPersonnage, maj); }
        catch (e) { console.error(`Blessures de ${p.idPersonnage} :`, e); }
    }
    return fin;
};

// =========================================================================
//  2. LA DÉFAITE : TOUS LES HÉROS À TERRE
// =========================================================================
//  Rejouée avec la victoire (recomposerCombattants, monstres.js) : bon marché,
//  et la transaction de cloturerCombat tranche entre les postes.
window.verifierDefaiteCombat = function () {
    if (document.getElementById("fenetre-combat")?.style.display !== "block") return false;
    const partie = window.PARTIE_DATA || {};
    if (!partie.ID_Rencontre) return false;
    if (partie.Fin_Combat && partie.Fin_Combat.idRencontre === partie.ID_Rencontre) return false;
    if (partie.Reinitialisation_En_Cours
        && (Date.now() - partie.Reinitialisation_En_Cours) < (window.DELAI_REINIT_MAX_MS || 60000)) return false;
    if (window.REINITIALISATION_COMBAT_EN_COURS) return false;
    // Des ennemis à combattre : sans eux, ce n'est pas un combat.
    if (!(window.MONSTRES_PARTIE || []).some(m => m && !m.compagnonDe && !m.zombie)) return false;
    const heros = (window.PERSOS_PARTIE || []).filter(p => typeof window.estHerosDuButin === "function" && window.estHerosDuButin(p));
    if (heros.length === 0 || heros.some(p => !estKO(p.idPersonnage))) return false;
    window.cloturerCombat("defaite");
    return true;
};

// =========================================================================
//  3. LE TEMPS QUI PASSE
// =========================================================================
// Une réinitialisation d'un combat qui n'a pas été clos compte comme un combat
// fini : les blessures « combats » des héros qui y étaient se décomptent.
// Rend la mise à jour à ajouter à l'écriture de la fiche (ou null).
window.majBlessuresReinitialisation = function (perso, combatNonClos) {
    if (!combatNonClos || !perso || typeof window.blessuresDuPerso !== "function") return null;
    const avant = window.blessuresDuPerso(perso);
    if (!avant.some(b => (b.combats || 0) > 0)) return null;
    return { Blessures: window.blessuresApresCombat(avant) };
};

// Le MJ avance le temps : les blessures « jours » de tous les héros de la
// partie (même mis de côté, même inconscients) se décomptent.
window.decompterJoursBlessures = async function (jours) {
    const n = Math.max(0, parseInt(jours) || 0);
    if (n <= 0) return 0;
    let ecrits = 0;
    for (const p of (window.PERSOS_JOUEURS_PARTIE || [])) {
        if (!p || p.estIllusion) continue;
        const avant = window.blessuresDuPerso(p);
        if (!avant.some(b => (b.jours || 0) > 0)) continue;
        try { await ecrireFiche(p.idPersonnage, { Blessures: window.blessuresApresJours(avant, n) }); ecrits++; }
        catch (e) { console.error(`Blessures (jours) de ${p.idPersonnage} :`, e); }
    }
    return ecrits;
};

// LES SOINS EN VILLE (onglet DEV) : la blessure perd ce qui attendait les soins.
window.soignerBlessureDev = async function (uid) {
    const fiche = window.BLESSURES_FICHE;
    if (!fiche || !fiche.idPersonnage) { alert("Ouvrez d'abord la fiche d'un héros existant."); return; }
    const inst = window.blessuresDuPerso(fiche).find(b => b.uid === uid);
    if (!inst) return;
    const b = window.blessureParId(inst.id) || {};
    if (!confirm(`Soigner « ${b.nom} » (soins avancés en ville) ?`)) return;
    try {
        await ecrireFiche(fiche.idPersonnage, { Blessures: window.blessuresApresSoins(window.blessuresDuPerso(fiche), uid) });
        if (typeof window.afficherMessageFlottant === "function") window.afficherMessageFlottant("Blessure soignée");
        if (typeof window.afficherStatsCombat === "function") window.afficherStatsCombat(fiche);
    } catch (e) {
        console.error("Soigner la blessure :", e);
        alert("Échec des soins.");
    }
};

// =========================================================================
//  4. L'ENCART DE L'APERÇU (et le bloc de l'onglet DEV)
// =========================================================================
const ICONE_BLESSURE = `<svg viewBox="0 0 40 40" class="blessure-icone" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="#2a0808" stroke="#8a6a2a" stroke-width="2"/>
    <path d="M20 8 C20 8 11 20 11 25 a9 9 0 0 0 18 0 C29 20 20 8 20 8 Z" fill="#8b0000"/>
    <path d="M16 24 a4 4 0 0 0 3.5 4" stroke="#ff8a8a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;

window.actualiserBlessuresApercu = function (perso) {
    if (perso) window.BLESSURES_FICHE = perso;
    perso = window.BLESSURES_FICHE;
    const encart = document.getElementById("encart-blessures");
    const dev = document.getElementById("dev-blessures-liste");
    if (!perso || typeof window.blessuresDuPerso !== "function") {
        if (encart) encart.innerHTML = "";
        return;
    }
    const liste = window.blessuresDuPerso(perso);
    const mort = window.estMortDefinitivement(perso);

    if (encart) {
        if (liste.length === 0 && !mort) { encart.innerHTML = ""; }
        else {
            const lignes = liste.map(inst => {
                const b = window.blessureParId(inst.id);
                const reste = window.resteBlessure(inst);
                const permanente = window.blessurePermanente(inst);
                const indispo = b.indisponible && (inst.jours || 0) > 0;
                const oubliees = (inst.cartes || []).map(id => (((window.CACHE_COMPETENCES_GLOBAL || {})[perso.idPersonnage] || {})[id] || {}).Nom || (window.COMPETENCES_CACHE || {})[id]?.Nom || "").filter(Boolean);
                return `<div class="blessure-ligne${permanente ? " permanente" : ""}${indispo ? " indisponible" : ""}" data-blessure="${echapper(inst.id)}">
                    ${ICONE_BLESSURE}
                    <span class="blessure-texte">
                        <b class="blessure-nom">${echapper(b.nom)}</b>
                        <span class="blessure-effet">${echapper(b.texte)}${oubliees.length ? ` <i>(${echapper(oubliees.join(", "))})</i>` : ""}</span>
                    </span>
                    <span class="blessure-reste${permanente ? " a-vie" : ""}">${permanente ? "⛓ " : "⏳ "}${echapper(reste)}</span>
                </div>`;
            }).join("");
            encart.innerHTML = `<div class="blessures-titre">Blessures</div>
                ${mort ? `<div class="blessure-mort">✝ ${echapper(nomHeros(perso))} a succombé à ses blessures. Il ne peut plus combattre.</div>` : ""}
                ${lignes ? `<div class="blessures-liste">${lignes}</div>` : ""}`;
        }
    }

    // L'onglet DEV : les blessures qui attendent des soins en ville.
    if (dev) {
        const aSoigner = liste.filter(inst => inst.soins);
        dev.innerHTML = aSoigner.length === 0
            ? `<p class="dev-blessures-vide">Aucune blessure n'attend de soins en ville.</p>`
            : aSoigner.map(inst => `<div class="dev-blessure-ligne"><span>${echapper((window.blessureParId(inst.id) || {}).nom)}</span>
                <button class="btn-parametres" style="background-color: #5c1e16; border-color: #ff4c4c;"
                        onclick="jouerSonClic(); window.soignerBlessureDev('${echapper(inst.uid)}')">Soigner</button></div>`).join("");
    }
};

// =========================================================================
//  5. LES POPUPS DE FIN DE COMBAT
// =========================================================================
//  Montrées une fois par poste (la marque reste dans le navigateur), et pas
//  pour une fin trop ancienne (un poste qui se reconnecte le lendemain).
const CLE_VUE = "ivalis_fin_combat_vue";
const AGE_MAX_MS = 3 * 3600 * 1000;
const PAUSE_DESCRIPTIF_MS = 2000;
let finAffichee = null;

function dejaVue(id) {
    try { return localStorage.getItem(CLE_VUE) === id; } catch (e) { return finAffichee === id; }
}
function marquerVue(id) {
    finAffichee = id;
    try { localStorage.setItem(CLE_VUE, id); } catch (e) {}
}

function voile() {
    let v = document.getElementById("fin-combat-voile");
    if (!v) {
        v = document.createElement("div");
        v.id = "fin-combat-voile";
        v.className = "fin-combat-voile";
        document.body.appendChild(v);
    }
    return v;
}
function fermer() {
    const v = document.getElementById("fin-combat-voile");
    if (!v) return;
    v.classList.add("se-ferme");
    setTimeout(() => { v.style.display = "none"; v.classList.remove("se-ferme"); v.innerHTML = ""; }, 450);
}
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

// Les blessures que CE poste doit voir : celles de ses propres héros.
window.blessuresDuPoste = function (fin) {
    const moi = (() => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } })();
    if (!fin || !fin.blessures || !moi) return [];
    return Object.keys(fin.blessures)
        .map(id => ({ idPersonnage: id, ...fin.blessures[id] }))
        .filter(b => b.idJoueur === moi && Array.isArray(b.tirages) && b.tirages.length > 0);
};

window.afficherFinCombat = function (fin, options) {
    if (!fin || !fin.id) return false;
    const force = options && options.force;
    if (!force) {
        if (dejaVue(fin.id) || finAffichee === fin.id) return false;
        if (fin.ts && (Date.now() - fin.ts) > AGE_MAX_MS) return false;
    }
    marquerVue(fin.id);
    derouler(fin).catch(e => console.error("Fin de combat :", e));
    return true;
};

async function derouler(fin) {
    const v = voile();
    const victoire = fin.issue !== "defaite";
    v.style.display = "flex";
    v.classList.toggle("defaite", !victoire);

    // LE GRAND BANDEAU, pour tout le monde.
    v.innerHTML = `<div class="fin-combat-bandeau ${victoire ? "victoire" : "defaite"}">
        <div class="fin-combat-ornement">✦ ✦ ✦</div>
        <div class="fin-combat-mot">${victoire ? "Victoire" : "Défaite"}</div>
        <div class="fin-combat-sous">${victoire ? "Les ennemis sont tombés" : "Vos héros sont tombés"}</div>
    </div>`;
    if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement(victoire ? "victoire" : "defaite");

    const miennes = window.blessuresDuPoste(fin);
    if (miennes.length === 0) {
        // Rien à révéler ici : le bandeau s'efface tout seul (ou d'un toucher).
        let ferme = false;
        const finir = () => { if (!ferme) { ferme = true; fermer(); } };
        v.onclick = finir;
        await attendre(3200);
        finir();
        return;
    }
    v.onclick = null;
    await attendre(2200);

    // LA BLESSURE QUI TOMBE, pour son seul joueur — une après l'autre (une
    // relance en ajoute une seconde).
    for (const heros of miennes) {
        for (let i = 0; i < heros.tirages.length; i++) {
            await revelerBlessure(v, fin, heros, heros.tirages[i], i > 0);
        }
    }
    fermer();
}

function revelerBlessure(v, fin, heros, tirage, relance) {
    return new Promise(resolve => {
        const victoire = fin.issue !== "defaite";
        const titre = victoire ? "Victoire douloureuse" : "Défaite";
        const mort = tirage.id === "BLE_MORT";
        const retraits = Number(tirage.retraits) || 0;
        const bonus = Number(tirage.bonus) || 0;
        const calcul = `Jet de blessure (d50) : ${tirage.de}${bonus ? ` + ${bonus}` : ""}${retraits ? ` − ${retraits}` : ""}`
            + ((bonus || retraits) ? ` = ${tirage.score}` : "");
        v.innerHTML = `<div class="blessure-revelation${mort ? " mort" : ""}">
            <div class="blessure-revelation-titre">${titre}</div>
            <div class="blessure-revelation-heros">${echapper(heros.nom)} ${relance ? "est encore touché…" : "est tombé au combat…"}</div>
            <div class="blessure-revelation-nom">${echapper(tirage.nom)}</div>
            <div class="blessure-revelation-texte">${echapper(tirage.texte)}</div>
            <div class="blessure-revelation-jet">${echapper(calcul)}</div>
            <button type="button" class="blessure-revelation-continuer">Continuer</button>
        </div>`;
        const carte = v.querySelector(".blessure-revelation");
        const nom = v.querySelector(".blessure-revelation-nom");
        const texte = v.querySelector(".blessure-revelation-texte");
        const jet = v.querySelector(".blessure-revelation-jet");
        const bouton = v.querySelector(".blessure-revelation-continuer");
        requestAnimationFrame(() => carte.classList.add("visible"));
        // Le nom, en fondu, avec le gong ; le descriptif deux secondes après.
        setTimeout(() => {
            nom.classList.add("visible");
            if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement("gong-blessure");
        }, 700);
        setTimeout(() => { texte.classList.add("visible"); jet.classList.add("visible"); }, 700 + PAUSE_DESCRIPTIF_MS);
        setTimeout(() => bouton.classList.add("visible"), 700 + PAUSE_DESCRIPTIF_MS + 600);
        bouton.onclick = () => {
            if (typeof window.jouerSonClic === "function") window.jouerSonClic();
            resolve();
        };
    });
}
