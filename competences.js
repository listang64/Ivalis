// =========================================================================
//  IVALIS - MODULE DES COMPÉTENCES DE COMBAT
// =========================================================================
import { db } from "./firebase-config.js";
import { collection, getDocs, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

window.chargerOngletCompetences = async function(idPersonnage, competencesMax = 6) {
    const spanMax = document.getElementById("affichage-competences-max");
    const spanRestantes = document.getElementById("affichage-competences-restantes");
    const btnCreer = document.getElementById("btn-creer-competence");
    const listeDiv = document.getElementById("liste-competences-perso");

    if (spanMax) spanMax.innerText = competencesMax;

    try {
        const colRef = collection(db, "Personnages", idPersonnage, "Competences");
        const snap = await getDocs(colRef);

        const nbCreees = snap.size;
        const nbRestantes = competencesMax - nbCreees;

        if (spanRestantes) {
            spanRestantes.innerText = Math.max(0, nbRestantes);
            spanRestantes.style.color = nbRestantes > 0 ? "#1b6e3a" : "#ff4c4c";
        }

        if (btnCreer) {
            if (nbRestantes > 0) {
                btnCreer.disabled = false;
                btnCreer.style.opacity = "1";
                btnCreer.style.filter = "none";
                btnCreer.style.cursor = "pointer";
            } else {
                btnCreer.disabled = true;
                btnCreer.style.opacity = "0.4";
                btnCreer.style.filter = "grayscale(100%)";
                btnCreer.style.cursor = "not-allowed";
            }
        }

        listeDiv.innerHTML = "";
        if (nbCreees === 0) {
            listeDiv.innerHTML = `<p style="text-align: center; font-style: italic; color: #5c3a21; margin-top: 20px;">Le héros n'a pas encore forgé ses techniques de combat.</p>`;
        } else {
            snap.forEach(docSnap => {
                const data = docSnap.data();
                listeDiv.innerHTML += `
                    <div style="background: rgba(255,255,255,0.6); padding: 12px; border-radius: 6px; border: 1px solid #c2a878;">
                        <strong style="color: #2a1a0f;">${data.Nom || "Technique Inconnue"}</strong>
                    </div>`;
            });
        }
    } catch (e) {
        console.error("Erreur de lecture des compétences :", e);
    }
};

// =========================================================================
//  MOTEUR ALGORITHMIQUE : FORGE DE COMPÉTENCES (ARCHI APP SWIFT)
// =========================================================================

window.forgeState = {
    idPersonnage: null,
    statsPerso: {},
    caracs: {},
    effetsBDD: [],

    actions: [],
    globals: {}
};

const ORDRE_CARACS = ["FORCE", "DEXTÉRITÉ", "CONSTITUTION", "INTELLIGENCE", "SAGESSE", "CHARISME", "AUCUN"];

const LEGACY_TYPE_MAP = {
    Degats: "Action", Soin: "Action", Defense: "Action", Special: "Action",
    Alteration: "Magique", Deplacement: "Spatial", Portee: "Spatial", Bonus: "Global"
};

function normalizeTypeMecanique(type) {
    return LEGACY_TYPE_MAP[type] || type || "Action";
}

function getMaxStacks(effet) {
    if (effet.Pourcent_Base > 0 && effet.Pourcent_Max > 0) return Math.floor(effet.Pourcent_Max / effet.Pourcent_Base);
    if (["Persistance terrain", "Durée +", "Durée étalement dégâts", "DOT", "Illusion"].includes(effet.Nom)) return 1;
    if (effet.Nom === "Initiative +") return 6;
    return 25;
}

function formatterTexteEffet(effet, stacks) {
    let texte = effet.Effet_Base || "";
    if (effet.Valeur > 0) {
        texte = texte.replace(effet.Valeur.toString(), (effet.Valeur * stacks).toString());
    } else if (effet.Pourcent_Base > 0) {
        texte = texte.replace(effet.Pourcent_Base.toString() + "%", (effet.Pourcent_Base * stacks).toString() + "%");
    } else {
        texte += ` (x${stacks})`;
    }
    return texte;
}

window.ouvrirCreationCompetence = async function() {
    window.forgeState.actions = [];
    window.forgeState.globals = {};
    document.getElementById("forge-nom").value = "";
    document.getElementById("forge-element").value = "Aucun";

    const idPerso = document.getElementById("champ-id-personnage").value;
    window.forgeState.idPersonnage = idPerso;

    const snapPerso = await getDoc(doc(db, "Personnages", idPerso));
    if (snapPerso.exists()) window.forgeState.statsPerso = snapPerso.data();

    const snapCaracs = await getDoc(doc(db, "Caracteristiques", idPerso));
    window.forgeState.caracs = snapCaracs.exists() ? snapCaracs.data() : {};

    if (window.forgeState.effetsBDD.length === 0) {
        const snap = await getDocs(collection(db, "Combat_Effets"));
        window.forgeState.effetsBDD = snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data, Type_Mecanique: normalizeTypeMecanique(data.Type_Mecanique) };
        });
    }

    document.getElementById("overlay-jeu-modale").style.display = "block";
    document.getElementById("modale-creation-competence").style.display = "block";
    window.rafraichirForge();
};

window.fermerForgeCompetence = function() {
    document.getElementById("modale-creation-competence").style.display = "none";
    document.getElementById("modale-menu-ajout").style.display = "none";
    document.getElementById("overlay-jeu-modale").style.display = "none";
};

window.ouvrirMenuAjoutForge = function() {
    const conteneurMenu = document.getElementById("forge-menu-caracs");
    conteneurMenu.innerHTML = "";

    const activeTags = getActiveTags();
    document.getElementById("forge-tags-count").innerText = `${activeTags.size}/2 Tags`;
    document.getElementById("forge-tags-count").style.color = activeTags.size >= 2 ? "red" : "green";

    ORDRE_CARACS.forEach(carac => {
        const effets = window.forgeState.effetsBDD.filter(e => {
            const mod = e.Modificateur ? e.Modificateur.toUpperCase() : "AUCUN";
            return mod === carac && (e.Type_Mecanique === "Action" || e.Type_Mecanique === "Global");
        });

        if (effets.length > 0) {
            let htmlLignes = "";
            effets.forEach(eff => {
                const isLocked = (activeTags.size >= 2 && eff.Modificateur !== "AUCUN" && !activeTags.has(eff.Modificateur.toUpperCase()));

                htmlLignes += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.05); opacity: ${isLocked ? 0.4 : 1};">
                        <div style="display: flex; flex-direction: column;">
                            <div>
                                <strong style="color: #2a1a0f;">${eff.Nom}</strong>
                                ${eff.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea; font-weight: bold;">[${eff.Modificateur}]</span>` : ""}
                            </div>
                            <span style="font-size: 11px; color: gray;">${formatterTexteEffet(eff, 1)}</span>
                        </div>
                        <button class="btn-rond-plus" style="width: 30px; height: 30px; background-color: ${isLocked ? 'gray' : '#3b82f6'}; color: white; border: none; border-radius: 50%;"
                                onclick="window.ajouterComposantPrincipal('${eff.id}')" ${isLocked ? "disabled" : ""}>+</button>
                    </div>
                `;
            });

            conteneurMenu.innerHTML += `
                <div style="background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); overflow: hidden;">
                    ${htmlLignes}
                </div>
            `;
        }
    });

    document.getElementById("modale-menu-ajout").style.display = "block";
};

window.fermerMenuAjoutForge = function() {
    document.getElementById("modale-menu-ajout").style.display = "none";
};

window.ajouterComposantPrincipal = function(effetId) {
    const eff = window.forgeState.effetsBDD.find(e => e.id === effetId);
    if (eff.Type_Mecanique === "Action") {
        window.forgeState.actions.push({
            idInst: "ACT_" + Math.random().toString(36).substring(2, 9),
            baseEffet: eff, count: 1, mods: {}
        });
    } else {
        window.forgeState.globals[effetId] = (window.forgeState.globals[effetId] || 0) + 1;
    }
    window.fermerMenuAjoutForge();
    window.rafraichirForge();
};

window.modifierActionCount = function(idInst, delta) {
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    act.count += delta;
    if (act.count <= 0) {
        window.forgeState.actions = window.forgeState.actions.filter(a => a.idInst !== idInst);
    } else if (act.count > getMaxStacks(act.baseEffet)) {
        act.count = getMaxStacks(act.baseEffet);
    }
    window.rafraichirForge();
};

window.modifierGlobalCount = function(effetId, delta) {
    window.forgeState.globals[effetId] += delta;
    if (window.forgeState.globals[effetId] <= 0) delete window.forgeState.globals[effetId];
    window.rafraichirForge();
};

window.modifierModCount = function(idInst, modId, delta) {
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    act.mods[modId] = (act.mods[modId] || 0) + delta;

    if (act.mods[modId] <= 0) {
        delete act.mods[modId];
    } else {
        const modEffet = window.forgeState.effetsBDD.find(e => e.id === modId);
        if (act.mods[modId] > getMaxStacks(modEffet)) act.mods[modId] = getMaxStacks(modEffet);
    }
    window.rafraichirForge();
};

window.attacherModificateur = function(selectElement, idInst) {
    const modId = selectElement.value;
    if (modId) {
        window.modifierModCount(idInst, modId, 1);
        selectElement.value = "";
    }
};

function getActiveTags() {
    let tags = new Set();
    window.forgeState.actions.forEach(a => {
        if (a.baseEffet.Modificateur && a.baseEffet.Modificateur !== "AUCUN") tags.add(a.baseEffet.Modificateur.toUpperCase());
        Object.keys(a.mods).forEach(modId => {
            const eff = window.forgeState.effetsBDD.find(e => e.id === modId);
            if (eff && eff.Modificateur && eff.Modificateur !== "AUCUN") tags.add(eff.Modificateur.toUpperCase());
        });
    });
    Object.keys(window.forgeState.globals).forEach(gId => {
        const eff = window.forgeState.effetsBDD.find(e => e.id === gId);
        if (eff && eff.Modificateur && eff.Modificateur !== "AUCUN") tags.add(eff.Modificateur.toUpperCase());
    });
    return tags;
}

function calculerInitBonus() {
    let initBonus = 0;
    Object.keys(window.forgeState.globals).forEach(gId => {
        const eff = window.forgeState.effetsBDD.find(e => e.id === gId);
        if (eff && eff.Nom === "Initiative +") initBonus += (window.forgeState.globals[gId] || 0) * 8;
    });
    window.forgeState.actions.forEach(act => {
        Object.keys(act.mods).forEach(modId => {
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
            if (modEff && modEff.Nom === "Initiative +") initBonus += (act.mods[modId] || 0) * 8;
        });
    });
    return initBonus;
}

function compilerEffetsTexte() {
    let descriptions = [];

    window.forgeState.actions.forEach(act => {
        descriptions.push(`${act.baseEffet.Nom} (x${act.count})`);
        Object.keys(act.mods).forEach(modId => {
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
            if (modEff) descriptions.push(`  ↳ ${modEff.Nom} (x${act.mods[modId]})`);
        });
    });

    Object.keys(window.forgeState.globals).forEach(gId => {
        const eff = window.forgeState.effetsBDD.find(e => e.id === gId);
        if (eff) descriptions.push(`${eff.Nom} (x${window.forgeState.globals[gId]})`);
    });

    return descriptions;
}

window.rafraichirForge = function() {
    const element = document.getElementById("forge-element").value;
    document.getElementById("forge-element-affichage").innerText = element === "Aucun" ? "" : "• " + element.toUpperCase();

    let totalPC = 0;
    const activeTags = getActiveTags();

    const conteneurCarte = document.getElementById("forge-contenu-carte");
    conteneurCarte.innerHTML = "";

    const renderSelectMenu = (type, label, color, actionId, actionName) => {
        let modsDispos = window.forgeState.effetsBDD.filter(e => e.Type_Mecanique === type);

        if (type === "Physique" && !["Attaque légère", "Attaque lourde"].includes(actionName)) return "";
        if (type === "Magique" && actionName !== "Attaque Magique") return "";

        let options = `<option value="">+ ${label}</option>`;
        modsDispos.forEach(mod => {
            const isLocked = activeTags.size >= 2 && mod.Modificateur !== "AUCUN" && !activeTags.has(mod.Modificateur.toUpperCase());
            if (!isLocked) {
                options += `<option value="${mod.id}">${mod.Nom} ${mod.Modificateur !== "AUCUN" ? `[${mod.Modificateur}]` : ""}</option>`;
            }
        });

        return `<select style="font-size: 11px; font-weight: bold; color: ${color}; background: transparent; border: none; outline: none; cursor: pointer; max-width: 80px;" onchange="window.attacherModificateur(this, '${actionId}')">${options}</select>`;
    };

    if (window.forgeState.actions.length > 0) {
        conteneurCarte.innerHTML += `<div style="font-size: 10px; font-weight: bold; color: #2563eb; margin-bottom: 5px;">ACTIONS PRINCIPALES</div>`;

        window.forgeState.actions.forEach(act => {
            let baseActionCost = (parseFloat(act.baseEffet.Cout_PT) || 0) * act.count;
            let dureeMult = 1.0;
            let coutMods = 0;
            let aDOT = false;

            let htmlMods = "";
            Object.keys(act.mods).forEach(modId => {
                const modCount = act.mods[modId];
                const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

                if (modEff.Nom === "Durée +" || modEff.Nom === "Persistance terrain") {
                    dureeMult *= Math.pow(1.5, modCount);
                } else if (modEff.Nom === "Zone") {
                    coutMods += (parseFloat(modEff.Cout_PT) || 0) * Math.max(0, modCount - 1);
                } else if (modEff.Nom === "DOT" || modEff.Nom === "Durée étalement dégâts") {
                    aDOT = true;
                } else {
                    coutMods += (parseFloat(modEff.Cout_PT) || 0) * modCount;
                }

                htmlMods += `
                    <div style="display: flex; justify-content: space-between; margin-left: 20px; padding: 4px 0;">
                        <div>
                            <span style="color: gray;">↳</span> <b>${modEff.Nom}</b>
                            ${modEff.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea;">[${modEff.Modificateur}]</span>` : ""}
                            <div style="font-size: 11px; color: gray; margin-left: 15px;">${formatterTexteEffet(modEff, modCount)}</div>
                        </div>
                        <div style="display: flex; gap: 5px; align-items: flex-start;">
                            <button onclick="window.modifierModCount('${act.idInst}', '${modId}', -1)" style="border:none; background:none; color:red; cursor:pointer;">⛔</button>
                            <b>${modCount}</b>
                            <button onclick="window.modifierModCount('${act.idInst}', '${modId}', 1)" style="border:none; background:none; color:green; cursor:pointer;">⊕</button>
                        </div>
                    </div>
                `;
            });

            let coutActionTotale = (baseActionCost + coutMods) * dureeMult;
            if (aDOT) coutActionTotale /= 1.2;
            totalPC += coutActionTotale;

            conteneurCarte.innerHTML += `
                <div style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <b>• ${act.baseEffet.Nom}</b> ${act.baseEffet.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea;">[${act.baseEffet.Modificateur}]</span>` : ""}
                            <div style="font-size: 11px; color: gray; margin-left: 10px;">${formatterTexteEffet(act.baseEffet, act.count)}</div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.05); border-radius: 12px; padding: 2px 5px;">
                            <button onclick="window.modifierActionCount('${act.idInst}', -1)" style="border:none; background:none; color:red; font-weight:bold; cursor:pointer;">-</button>
                            <b>${act.count}</b>
                            <button onclick="window.modifierActionCount('${act.idInst}', 1)" style="border:none; background:none; color:green; font-weight:bold; cursor:pointer;">+</button>
                        </div>
                    </div>
                    ${htmlMods}

                    <div style="display: flex; gap: 15px; margin-left: 20px; margin-top: 10px; padding-top: 5px; border-top: 1px dashed rgba(0,0,0,0.1);">
                        ${renderSelectMenu("Spatial", "Spatial", "#3b82f6", act.idInst, act.baseEffet.Nom)}
                        ${renderSelectMenu("Physique", "Physique", "#ef4444", act.idInst, act.baseEffet.Nom)}
                        ${renderSelectMenu("Magique", "Magique", "#a855f7", act.idInst, act.baseEffet.Nom)}
                        ${renderSelectMenu("Duree", "Durée", "#9333ea", act.idInst, act.baseEffet.Nom)}
                    </div>
                </div>
            `;
        });
    }

    if (Object.keys(window.forgeState.globals).length > 0) {
        conteneurCarte.innerHTML += `<div style="font-size: 10px; font-weight: bold; color: #2563eb; margin-top: 10px; margin-bottom: 5px;">EFFETS DE SOUTIEN & GLOBAUX</div>`;

        Object.keys(window.forgeState.globals).forEach(gId => {
            const count = window.forgeState.globals[gId];
            const eff = window.forgeState.effetsBDD.find(e => e.id === gId);
            totalPC += (parseFloat(eff.Cout_PT) || 0) * count;

            conteneurCarte.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <b>• ${eff.Nom}</b> ${eff.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea;">[${eff.Modificateur}]</span>` : ""}
                        <div style="font-size: 11px; color: gray; margin-left: 10px;">${formatterTexteEffet(eff, count)}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.05); border-radius: 12px; padding: 2px 5px;">
                        <button onclick="window.modifierGlobalCount('${gId}', -1)" style="border:none; background:none; color:red; font-weight:bold; cursor:pointer;">-</button>
                        <b>${count}</b>
                        <button onclick="window.modifierGlobalCount('${gId}', 1)" style="border:none; background:none; color:green; font-weight:bold; cursor:pointer;">+</button>
                    </div>
                </div>
            `;
        });
    }

    const caracs = window.forgeState.caracs || {};
    let statsTable = {
        "FORCE": caracs.force ?? 8,
        "DEXTÉRITÉ": caracs.dex ?? 8,
        "CONSTITUTION": caracs.con ?? 8,
        "INTELLIGENCE": caracs.int ?? 8,
        "SAGESSE": caracs.sag ?? 8,
        "CHARISME": caracs.cha ?? 8
    };

    let capFatigue = 30;
    if (activeTags.size > 0) {
        let somme = 0;
        activeTags.forEach(c => { somme += statsTable[c] || 8; });
        capFatigue = (Math.floor(somme / activeTags.size) - 5) * 10;
    }

    const fatigueConsommee = Math.floor(totalPC * 5);
    const initBonus = calculerInitBonus();
    const initiative = Math.max(0, 100 - fatigueConsommee) + initBonus;

    document.getElementById("forge-cout-pc").innerText = totalPC.toFixed(1) + " PC";
    document.getElementById("forge-fatigue-val").innerText = fatigueConsommee;
    document.getElementById("forge-cap-fatigue").innerText = capFatigue;
    document.getElementById("forge-initiative-val").innerText = initiative;

    const jauge = document.getElementById("forge-jauge-remplissage");
    const alerte = document.getElementById("forge-alerte-cap");
    const btnValider = document.getElementById("btn-valider-forge");
    const nomSaisi = document.getElementById("forge-nom").value.trim();
    const capDepasse = fatigueConsommee > capFatigue;

    if (jauge) {
        let pourcentage = capFatigue > 0
            ? Math.min(100, (fatigueConsommee / capFatigue) * 100)
            : (fatigueConsommee > 0 ? 100 : 0);
        jauge.style.width = pourcentage + "%";
        jauge.style.backgroundColor = capDepasse ? "darkred" : ((pourcentage >= 90) ? "#d97706" : "#1b6e3a");
    }

    if (alerte) {
        alerte.style.display = capDepasse ? "block" : "none";
    }

    btnValider.disabled = capDepasse || fatigueConsommee === 0 || nomSaisi === "";
};

window.sauvegarderCompetence = async function() {
    const nomCompetence = document.getElementById("forge-nom").value.trim();
    const arme = document.getElementById("forge-arme").value;
    const element = document.getElementById("forge-element").value;
    const fatigue = parseInt(document.getElementById("forge-fatigue-val").innerText);
    const initiative = parseInt(document.getElementById("forge-initiative-val").innerText);
    const coutPc = parseFloat(document.getElementById("forge-cout-pc").innerText);

    const btn = document.getElementById("btn-valider-forge");
    btn.innerText = "Forge en cours...";
    btn.disabled = true;

    const composantsSerialises = {
        actions: window.forgeState.actions.map(a => ({
            idInst: a.idInst,
            baseEffetId: a.baseEffet.id,
            count: a.count,
            mods: { ...a.mods }
        })),
        globals: { ...window.forgeState.globals }
    };

    const dataCompetence = {
        Nom: nomCompetence,
        Arme: arme,
        Element: element,
        Fatigue: fatigue,
        Initiative: initiative,
        Cout_PC: coutPc,
        Effets_Compiles: compilerEffetsTexte(),
        Composants: composantsSerialises,
        Date_Creation: new Date().toISOString()
    };

    try {
        const idPerso = window.forgeState.idPersonnage;
        const idComp = "COMP_" + Math.random().toString(36).substring(2, 9);
        await setDoc(doc(db, "Personnages", idPerso, "Competences", idComp), dataCompetence);

        window.fermerForgeCompetence();

        if (typeof window.chargerOngletCompetences === "function") {
            window.chargerOngletCompetences(idPerso, window.forgeState.statsPerso.Competences_Max || 6);
        }
    } catch (e) {
        console.error("Erreur de sauvegarde :", e);
        alert("Échec de la forge.");
        btn.innerText = "✔️ VALIDER LA COMPÉTENCE";
        btn.disabled = false;
    }
};
