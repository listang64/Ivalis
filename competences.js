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
    isCapReached: false
};

const ORDRE_CARACS = ["FORCE", "DEXTÉRITÉ", "CONSTITUTION", "INTELLIGENCE", "SAGESSE", "CHARISME", "AUCUN"];

const LEGACY_TYPE_MAP = {
    Degats: "Action/Global", Soin: "Action/Global", Defense: "Action/Global", Special: "Action/Global",
    Action: "Action/Global", Global: "Action/Global",
    Alteration: "Magique", Deplacement: "Spatial", Portee: "Spatial", Bonus: "Action/Global"
};

function normalizeForgeType(type, fallback = "Aucun") {
    if (!type) return fallback;
    return LEGACY_TYPE_MAP[type] || type;
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
    window.forgeState.isCapReached = false;
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
            return {
                id: d.id,
                ...data,
                Type_Mecanique: normalizeForgeType(data.Type_Mecanique, "Action/Global"),
                Type_Mecanique_2: data.Type_Mecanique_2 ? normalizeForgeType(data.Type_Mecanique_2) : "Aucun"
            };
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

    const capAtteint = window.forgeState.isCapReached;

    ORDRE_CARACS.forEach(carac => {
        const effets = window.forgeState.effetsBDD.filter(e => {
            const mod = e.Modificateur ? e.Modificateur.toUpperCase() : "AUCUN";
            const estRacine = e.Type_Mecanique === "Action/Global" || e.Type_Mecanique_2 === "Action/Global";
            return mod === carac && estRacine;
        });

        if (effets.length > 0) {
            let htmlLignes = "";
            effets.forEach(eff => {
                const isLocked = (activeTags.size >= 2 && eff.Modificateur !== "AUCUN" && !activeTags.has(eff.Modificateur.toUpperCase()));
                const isDisabled = isLocked || capAtteint;
                const bgColor = isDisabled ? 'gray' : '#3b82f6';

                htmlLignes += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.05); opacity: ${isDisabled ? 0.4 : 1};">
                        <div style="display: flex; flex-direction: column;">
                            <div>
                                <strong style="color: #2a1a0f;">${eff.Nom}</strong>
                                ${eff.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea; font-weight: bold;">[${eff.Modificateur}]</span>` : ""}
                            </div>
                            <span style="font-size: 11px; color: gray;">${formatterTexteEffet(eff, 1)}</span>
                        </div>
                        <button class="btn-rond-plus" style="width: 30px; height: 30px; background-color: ${bgColor}; color: white; border: none; border-radius: 50%;"
                                onclick="window.ajouterComposantPrincipal('${eff.id}')" ${isDisabled ? "disabled" : ""}>+</button>
                    </div>
                `;
            });

            conteneurMenu.innerHTML += `
                <div style="background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 10px;">
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
    window.forgeState.actions.push({
        idInst: "ACT_" + Math.random().toString(36).substring(2, 9),
        baseEffet: eff, count: 1, mods: {}
    });

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
    if (!modId) return;
    if (window.forgeState.isCapReached) {
        selectElement.value = "";
        return;
    }
    window.modifierModCount(idInst, modId, 1);
    selectElement.value = "";
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
    return tags;
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
    return descriptions;
}

window.rafraichirForge = function() {
    // === ETAPE 1 : CALCUL MATHÉMATIQUE (PC, FATIGUE, INITIATIVE) ===
    let totalPC = 0;
    let initBonusNet = 0;
    const activeTags = getActiveTags();

    window.forgeState.actions.forEach(act => {
        let baseActionCost = (parseFloat(act.baseEffet.Cout_PT) || 0) * act.count;
        let dureeMult = 1.0;
        let coutMods = 0;
        let aDOT = false;

        if (act.baseEffet.Nom === "Initiative +") {
            initBonusNet += act.count * (8 + (parseFloat(act.baseEffet.Cout_PT) || 0) * 5);
        }

        Object.keys(act.mods).forEach(modId => {
            const modCount = act.mods[modId];
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

            if (modEff) {
                if (modEff.Nom === "Initiative +") {
                    initBonusNet += modCount * (8 + (parseFloat(modEff.Cout_PT) || 0) * 5);
                }

                if (modEff.Nom === "Durée +" || modEff.Nom === "Persistance terrain") {
                    dureeMult *= Math.pow(1.5, modCount);
                } else if (modEff.Nom === "Zone") {
                    coutMods += (parseFloat(modEff.Cout_PT) || 0) * Math.max(0, modCount - 1);
                } else if (modEff.Nom === "DOT" || modEff.Nom === "Durée étalement dégâts") {
                    aDOT = true;
                } else {
                    coutMods += (parseFloat(modEff.Cout_PT) || 0) * modCount;
                }
            }
        });

        let coutActionTotale = (baseActionCost + coutMods) * dureeMult;
        if (aDOT) coutActionTotale /= 1.2;
        totalPC += coutActionTotale;
    });

    const caracs = window.forgeState.caracs || {};
    let statsTable = {
        "FORCE": caracs.force ?? 8, "DEXTÉRITÉ": caracs.dex ?? 8,
        "CONSTITUTION": caracs.con ?? 8, "INTELLIGENCE": caracs.int ?? 8,
        "SAGESSE": caracs.sag ?? 8, "CHARISME": caracs.cha ?? 8
    };

    let capFatigue = 30;
    if (activeTags.size > 0) {
        let somme = 0;
        activeTags.forEach(c => { somme += statsTable[c] || 8; });
        capFatigue = (Math.floor(somme / activeTags.size) - 5) * 10;
    }

    const fatigueConsommee = Math.floor(totalPC * 5);
    const initiative = Math.max(0, 100 - fatigueConsommee) + initBonusNet;

    const capDepasse = fatigueConsommee >= capFatigue;
    const capErreur = fatigueConsommee > capFatigue;
    window.forgeState.isCapReached = capDepasse;

    // === ETAPE 2 : MISES À JOUR VISUELLES ===

    const tagsDiv = document.getElementById("forge-active-tags");
    if (tagsDiv) {
        if (activeTags.size === 0) {
            tagsDiv.innerHTML = `<span style="color: gray; font-size: 12px; font-style: italic;">Aucune caractéristique cible</span>`;
        } else {
            tagsDiv.innerHTML = Array.from(activeTags).map(t => `<span style="background: #9333ea; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; letter-spacing: 1px;">[${t}]</span>`).join("");
        }
    }

    const element = document.getElementById("forge-element").value;
    document.getElementById("forge-element-affichage").innerText = element === "Aucun" ? "" : "• " + element.toUpperCase();
    document.getElementById("forge-cout-pc").innerText = totalPC.toFixed(1) + " PC";
    document.getElementById("forge-fatigue-val").innerText = fatigueConsommee;

    document.getElementById("forge-fatigue-val").style.color = capErreur ? "red" : "#d97706";
    document.getElementById("forge-cap-fatigue").innerText = capFatigue;
    document.getElementById("forge-initiative-val").innerText = initiative;

    // === ETAPE 3 : GÉNÉRATION DE L'ARBRE (HTML) ===
    const conteneurCarte = document.getElementById("forge-contenu-carte");
    conteneurCarte.innerHTML = "";

    const renderSelectMenu = (type, label, color, actionId) => {
        let modsDispos = window.forgeState.effetsBDD.filter(e => e.Type_Mecanique === type || e.Type_Mecanique_2 === type);
        let options = `<option value="">+ ${label}</option>`;

        modsDispos.forEach(mod => {
            const isLocked = activeTags.size >= 2 && mod.Modificateur !== "AUCUN" && !activeTags.has(mod.Modificateur.toUpperCase());
            if (!isLocked) {
                options += `<option value="${mod.id}">${mod.Nom} ${mod.Modificateur !== "AUCUN" ? `[${mod.Modificateur}]` : ""}</option>`;
            }
        });
        return `<select ${capDepasse ? "disabled" : ""} style="font-size: 11px; font-weight: bold; color: ${color}; background: transparent; border: none; outline: none; cursor: ${capDepasse ? "not-allowed" : "pointer"}; max-width: 80px; opacity: ${capDepasse ? 0.4 : 1};" onchange="window.attacherModificateur(this, '${actionId}')">${options}</select>`;
    };

    if (window.forgeState.actions.length > 0) {
        window.forgeState.actions.forEach(act => {

            const isActMaxed = act.count >= getMaxStacks(act.baseEffet);
            const btnPlusActDisabled = (isActMaxed || capDepasse) ? `disabled style="opacity: 0.3; cursor: not-allowed; border:none; background:none; font-weight:bold;"` : `style="color: green; cursor: pointer; border:none; background:none; font-weight:bold;"`;

            let htmlMods = "";
            Object.keys(act.mods).forEach(modId => {
                const modCount = act.mods[modId];
                const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

                const isModMaxed = modCount >= getMaxStacks(modEff);
                const btnPlusModDisabled = (isModMaxed || capDepasse) ? `disabled style="opacity: 0.3; cursor: not-allowed; border:none; background:none; font-weight:bold;"` : `style="color: green; cursor: pointer; border:none; background:none; font-weight:bold;"`;

                htmlMods += `
                    <div style="display: flex; justify-content: space-between; margin-left: 20px; padding: 4px 0;">
                        <div>
                            <span style="color: gray;">↳</span> <b>${modEff.Nom}</b>
                            ${modEff.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea;">[${modEff.Modificateur}]</span>` : ""}
                            <div style="font-size: 11px; color: gray; margin-left: 15px;">${formatterTexteEffet(modEff, modCount)}</div>
                        </div>
                        <div style="display: flex; gap: 5px; align-items: flex-start;">
                            <button onclick="window.modifierModCount('${act.idInst}', '${modId}', -1)" style="border:none; background:none; color:red; cursor:pointer; font-weight:bold;">-</button>
                            <b>${modCount}</b>
                            <button onclick="window.modifierModCount('${act.idInst}', '${modId}', 1)" ${btnPlusModDisabled}>+</button>
                        </div>
                    </div>
                `;
            });

            conteneurCarte.innerHTML += `
                <div style="margin-bottom: 15px; background: rgba(0,0,0,0.02); padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <b>• ${act.baseEffet.Nom}</b> ${act.baseEffet.Modificateur !== "AUCUN" ? `<span style="font-size: 10px; color: #9333ea;">[${act.baseEffet.Modificateur}]</span>` : ""}
                            <div style="font-size: 11px; color: gray; margin-left: 10px;">${formatterTexteEffet(act.baseEffet, act.count)}</div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: white; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; padding: 2px 5px;">
                            <button onclick="window.modifierActionCount('${act.idInst}', -1)" style="border:none; background:none; color:red; font-weight:bold; cursor:pointer;">-</button>
                            <b>${act.count}</b>
                            <button onclick="window.modifierActionCount('${act.idInst}', 1)" ${btnPlusActDisabled}>+</button>
                        </div>
                    </div>
                    ${htmlMods}

                    <div style="display: flex; gap: 15px; margin-left: 20px; margin-top: 10px; padding-top: 5px; border-top: 1px dashed rgba(0,0,0,0.1);">
                        ${renderSelectMenu("Spatial", "Spatial", "#3b82f6", act.idInst)}
                        ${renderSelectMenu("Physique", "Physique", "#ef4444", act.idInst)}
                        ${renderSelectMenu("Magique", "Magique", "#a855f7", act.idInst)}
                        ${renderSelectMenu("Duree", "Durée", "#9333ea", act.idInst)}
                    </div>
                </div>
            `;
        });
    }

    const btnValider = document.getElementById("btn-valider-forge");
    const nomSaisi = document.getElementById("forge-nom").value.trim();

    btnValider.disabled = capErreur || fatigueConsommee === 0 || nomSaisi === "";
};

window.sauvegarderCompetence = async function() {
    const nomCompetence = document.getElementById("forge-nom").value.trim();
    const arme = document.getElementById("forge-arme").value;
    const element = document.getElementById("forge-element").value;
    const fatigue = parseInt(document.getElementById("forge-fatigue-val").innerText);
    const initiative = parseInt(document.getElementById("forge-initiative-val").innerText);
    const coutPc = parseFloat(document.getElementById("forge-cout-pc").innerText.replace(" PC", "")) || 0;

    const btn = document.getElementById("btn-valider-forge");
    btn.innerText = "Forge en cours...";
    btn.disabled = true;

    const composantsSerialises = {
        actions: window.forgeState.actions.map(a => ({
            idInst: a.idInst,
            baseEffetId: a.baseEffet.id,
            count: a.count,
            mods: { ...a.mods }
        }))
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
