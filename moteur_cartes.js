// =========================================================================
//  IVALIS - MOTEUR DE CARTES (Générateur Procédural & IA)
// =========================================================================

import { db } from "./firebase-config.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  DICTIONNAIRE DES COÛTS ET EFFETS (Le Grand Dictionnaire Étendu)
// =========================================================================

const BUDGET_STANDARD = 3;
const BUDGET_BURN = 6; 
const MAX_CARTES_PERDUES = 4;

const DICTIONNAIRE_CARTES = {
    // --- CATEGORIES PRINCIPALES ---
    "Degats_Melee":    { nom: "Attaque", baseCost: 1 },       
    "Degats_Distance": { nom: "Attaque", baseCost: 1, porteeBase: 3 }, 
    "Degats_Zone":     { nom: "Attaque", baseCost: 1 },
    "Degats_Purs":     { nom: "Subit des dégâts (Ignore Bouclier)", baseCost: 1.5 },
    "Mobilite":        { nom: "Déplacement", baseCost: 1 },   
    "Furtivite_Esquive":{ nom: "Déplacement", baseCost: 1 },
    "Defense_Lourde":  { nom: "Bouclier", baseCost: 1.5 },    
    "Soin":            { nom: "Soin", baseCost: 1 },          
    "Soutien_Tactique":{ nom: "Soutien", baseCost: 1.5 }, 
    "Manipulation":    { nom: "Terrain", baseCost: 1.5 },
    "Controle_Mental": { nom: "Ordre", baseCost: 2 },
    "Pillage":         { nom: "Pillage", baseCost: 2 },
    "Invocations":     { nom: "Invocation", baseCost: 5 },
    "Execution":       { nom: "Éliminez une cible normale", baseCost: 6 }, 

    // --- EFFETS DE DÉGÂTS & ZONES (Nouveau !) ---
    "Zone_Ligne":      { nom: "Zone : Ligne de 3", cout: 2 },
    "Zone_Cible2":     { nom: "Cible : 2 adversaires", cout: 1.5 },
    "Zone_Chemin":     { nom: "Ciblez tous les adversaires sur le chemin", cout: 2.5 },
    "Zone_Explosion":  { nom: "Zone : L'hexagone cible et tous les adjacents", cout: 3 }, // La Boule de Feu !
    "Perforation":     { nom: "Perforation 2", cout: 1 },
    "Avantage":        { nom: "Gagnez Avantage", cout: 1 },

    // --- EFFETS DÉFENSIFS & AURAS ---
    "Invisibilite":    { nom: "Invisibilité", cout: 2.5 }, 
    "Riposte":         { nom: "Riposte 2", cout: 1.5 },
    "Aura_Attaque":    { nom: "Aura : +1 Attaque ce round", cout: 2 }, 

    // --- SOUTIEN & ALLIÉS ---
    "Benediction":     { nom: "Bénédiction", cout: 1.5 },
    "Renforcement":    { nom: "Renforcement", cout: 1.5 },
    "Recup_Carte":     { nom: "Récupérez 1 carte défaussée", cout: 3 },
    "Action_Allie":    { nom: "Un allié adjacent effectue Attaque 2", cout: 2 }, 

    // --- MANIPULATION TERRAIN & POSITION ---
    "Piege_Cree":      { nom: "Créez un Piège (3 Dégâts)", cout: 1.5 },
    "Piege_Desamorce": { nom: "Désamorcez un piège", cout: 1 }, 
    "Obstacle_Cree":   { nom: "Créez 1 Obstacle", cout: 1 }, 
    "Obstacle_Detruit":{ nom: "Détruisez 1 Obstacle", cout: 1 }, 
    "Poussee":         { nom: "Poussée 1", cout: 1 },
    "Traction":        { nom: "Traction 1", cout: 1 },
    "Condition_Allie": { nom: "+2 Attaque si la cible est adjacente à un allié", cout: -1.5 },

    // --- ALTÉRATIONS NÉGATIVES ---
    "Poison":          { nom: "Empoisonnement", cout: 1 },
    "Blessure":        { nom: "Blessure", cout: 1 },
    "Malediction":     { nom: "Malédiction", cout: 1 },
    "Confusion":       { nom: "Confusion", cout: 1 },
    "Desavantage":     { nom: "Imposez Désavantage", cout: 1 }, 
    "Etourdissement":  { nom: "Étourdissement", cout: 3 } 
};

const ELEMENTS_LISTE = ["Feu", "Glace", "Terre", "Air", "Lumière", "Ténèbres"];

// =========================================================================
//  L'USINE À CARTES (Générateur Procédural)
// =========================================================================

function choisirCategoriePonderee(poidsActions) {
    let total = 0;
    for (let key in poidsActions) total += poidsActions[key];
    if (total === 0) return "Degats_Melee";
    
    let rand = Math.random() * total;
    for (let key in poidsActions) {
        if (rand < poidsActions[key]) return key;
        rand -= poidsActions[key];
    }
    return "Degats_Melee";
}

// NOUVEAU PARAMÈTRE : elementInterdit (pour empêcher les clones Haut/Bas)
function forgerAction(categorieForcee, profilJson, compteurs, isBurnForce, elemDeck, elementInterdit = "") {
    let action = { nom: "", valeur: 0, effets: [], portee: 0, xp: 0, isBurn: isBurnForce, element: "" };
    
    // Fallback sécurisé : Si la catégorie n'est pas forcée, on pioche en ignorant les poids à 0
    let cat = categorieForcee || choisirCategoriePonderee(profilJson.Poids_Actions);
    
    // =================================================================
    // NOUVEAU : LIMITES DYNAMIQUES & STRICTES
    // =================================================================
    
    // 1. Calcul du quota d'Invocations (10 pts = 1, 20 pts = 2, 30+ pts = 3)
    let pointsInvoc = profilJson.Poids_Actions?.Invocations || 0;
    let maxInvocations = 0;
    
    if (pointsInvoc >= 30) maxInvocations = 3;
    else if (pointsInvoc >= 20) maxInvocations = 2;
    else if (pointsInvoc > 0) maxInvocations = 1; // Au moins 1 si la stat est présente (ex: 10)

    // Censure si le quota d'invocations est atteint
    if (cat === "Invocations" && compteurs.invocations >= maxInvocations) { 
        // Si l'invocateur a trop de sbires, on le force à attaquer à distance (sortilège) plutôt qu'au corps-à-corps
        cat = "Degats_Distance"; 
    }

    // 2. Censure des Exécutions (Toujours limité à 1 maximum par deck pour l'équilibrage Niveau 1)
    if (cat === "Execution" && compteurs.executions >= 1) { 
        cat = "Degats_Distance"; 
    }
    
    let dictBase = DICTIONNAIRE_CARTES[cat] || DICTIONNAIRE_CARTES["Degats_Melee"];
    action.nom = dictBase.nom;
    if (dictBase.porteeBase) action.portee = dictBase.porteeBase;

    let budget = isBurnForce ? BUDGET_BURN : BUDGET_STANDARD;
    let coutEffets = 0;

    // =================================================================
    // 1. LES MÉCANIQUES AVANCÉES (Toutes connectées au dictionnaire !)
    // =================================================================
    if (cat === "Execution") {
        action.valeur = 0; 
        action.isBurn = true;
        action.xp = 2; 
        compteurs.executions++;
        return action;
    }
    else if (cat === "Controle_Mental") {
        action.nom = "Domination";
        let isAllie = Math.random() < 0.5;
        action.effets.push(isAllie ? DICTIONNAIRE_CARTES["Action_Allie"].nom : "Forcez un adversaire à portée 3 à effectuer Attaque 2");
        coutEffets += 2.5; 
    }
    else if (cat === "Degats_Purs") {
        action.portee = 3;
        coutEffets += 1; 
    }
    else if (cat === "Invocations") {
        let pv = Math.floor(Math.random() * 4) + 2;
        let mvt = Math.floor(Math.random() * 3) + 1;
        let att = Math.floor(Math.random() * 3) + 1;
        action.effets.push(`Stats (PV: ${pv}, MVT: ${mvt}, ATT: ${att})`);
        action.isBurn = true;
        action.xp = 2;
        compteurs.invocations++;
        return action;
    }
    else if (cat === "Degats_Zone") {
        // NOUVEAU : On tire parmi les 4 zones disponibles (Ligne, Cible2, Chemin, Explosion)
        let zonesDispos = ["Zone_Ligne", "Zone_Cible2", "Zone_Chemin", "Zone_Explosion"];
        let aoeChoisie = zonesDispos[Math.floor(Math.random() * zonesDispos.length)];
        
        action.effets.push(DICTIONNAIRE_CARTES[aoeChoisie].nom);
        coutEffets += DICTIONNAIRE_CARTES[aoeChoisie].cout;
        
        // Forcer de la portée pour les sorts qui en ont logiquement besoin
        if (aoeChoisie === "Zone_Chemin" || aoeChoisie === "Zone_Explosion") {
            action.portee = Math.max(3, action.portee);
        }
    } 
    else if (cat === "Furtivite_Esquive") {
        action.effets.push(DICTIONNAIRE_CARTES["Invisibilite"].nom);
        coutEffets += DICTIONNAIRE_CARTES["Invisibilite"].cout;
    }
    else if (cat === "Soutien_Tactique") {
        let soutiensDispos = ["Benediction", "Renforcement", "Aura_Attaque", "Recup_Carte"];
        let buffChoisi = soutiensDispos[Math.floor(Math.random() * soutiensDispos.length)];
        action.effets.push(DICTIONNAIRE_CARTES[buffChoisi].nom);
        coutEffets += DICTIONNAIRE_CARTES[buffChoisi].cout;
        if (buffChoisi === "Recup_Carte") action.isBurn = true;
    }
    else if (cat === "Manipulation") {
        action.nom = Math.random() < 0.5 ? "Attaque" : "Déplacement"; 
        let manipOptions = ["Piege_Cree", "Piege_Desamorce", "Obstacle_Cree", "Obstacle_Detruit"];
        let tirageManip = manipOptions[Math.floor(Math.random() * manipOptions.length)];
        action.effets.push(DICTIONNAIRE_CARTES[tirageManip].nom);
        coutEffets += DICTIONNAIRE_CARTES[tirageManip].cout;
    }
    else if (cat === "Defense_Lourde") {
        if (Math.random() < 0.5) {
            action.nom = "Riposte"; 
            action.valeur = 2; 
            coutEffets += DICTIONNAIRE_CARTES["Riposte"].cout;
        } else {
            action.nom = "Bouclier";
            action.valeur = 1;
        }
    }
    else if (cat === "Soin") {
        // Soin d'équipe forcé avec de la portée pour éviter l'égoïsme
        if (Math.random() < 0.70) { 
            action.portee = 3; 
            coutEffets += 1; 
        } else if (Math.random() < 0.90) {
            action.effets.push("Affecte tous les alliés adjacents");
            coutEffets += 1.5; 
        } else {
            action.effets.push("Sur vous-même");
        }
    }

    // =================================================================
    // 2. GESTION DES ÉLÉMENTS (Anti-Clone Strict)
    // =================================================================
    if (Math.random() < 0.25 || (isBurnForce && Math.random() < 0.5)) {
        if (compteurs.elementsCrees > compteurs.elementsConsommes && Math.random() < 0.6) {
            let texteBonus = (cat === "Degats_Melee" || cat === "Degats_Distance" || cat === "Degats_Zone") ? "+1 Dégât" : `+1 ${dictBase.nom}`;
            action.element = `Consomme : ${elemDeck} (${texteBonus}, +1 XP)`;
            compteurs.elementsConsommes++;
            coutEffets -= 1.5; 
        } else {
            let tentativeGeniere = `Génère : ${elemDeck}`;
            if (tentativeGeniere !== elementInterdit) {
                action.element = tentativeGeniere;
                compteurs.elementsCrees++;
                coutEffets += 1; 
            }
        }
    }

    // =================================================================
    // 3. EFFETS SECONDAIRES ALÉATOIRES
    // =================================================================
    if (cat === "Degats_Melee" || cat === "Degats_Distance") {
        let alt = profilJson.Alterations_Dominantes?.[0];
        // 25% de chance d'appliquer l'altération de la classe
        if (alt && DICTIONNAIRE_CARTES[alt] && Math.random() < 0.25) {
            action.effets.push(DICTIONNAIRE_CARTES[alt].nom);
            coutEffets += DICTIONNAIRE_CARTES[alt].cout;
        } 
        else if (Math.random() < 0.20) {
            // Piocher dans le reste des effets de position/contrôle
            let effetsSupDispos = ["Poussee", "Traction", "Perforation", "Avantage", "Condition_Allie"];
            let effChoisi = effetsSupDispos[Math.floor(Math.random() * effetsSupDispos.length)];
            
            // Sécurité : On ne met pas Condition_Allie sur du tir à distance
            if (effChoisi === "Condition_Allie" && cat !== "Degats_Melee") {
                effChoisi = "Avantage";
            }
            action.effets.push(DICTIONNAIRE_CARTES[effChoisi].nom);
            coutEffets += DICTIONNAIRE_CARTES[effChoisi].cout;
        }
    }

    // =================================================================
    // 4. LE COUPERET DU BUDGET ET CORRECTIONS
    // =================================================================
    let budgetRestant = budget - coutEffets;
    action.valeur = Math.floor(budgetRestant / dictBase.baseCost);

    if (cat === "Pillage") {
        action.valeur = isBurnForce ? 2 : 1;
    } else if (cat !== "Degats_Purs") {
        if (action.valeur < 2 && !isBurnForce && cat !== "Degats_Zone") action.valeur = 2; 
        if (action.valeur < 1) action.valeur = 1; // Un effet coûteux comme la Boule de feu baisse les dégâts à 1 minimum

        // ANTI-VANILLA : Interdiction des cartes génériques
        if (action.effets.length === 0 && action.element === "") {
            if (action.valeur > 2) action.valeur -= 1; 
            if (action.nom === "Attaque") {
                action.effets.push(DICTIONNAIRE_CARTES["Perforation"].nom);
            } else if (action.nom === "Déplacement") {
                action.effets.push("Saut");
            } else if (action.nom === "Soin" || action.nom === "Bouclier") {
                action.valeur += 1; 
            }
        }
    }

    // BURN SECURITY & PLAFOND NIVEAU 1
    if (action.isBurn) {
        if (action.xp === 0) action.xp = 1;
        if (action.valeur < 4 && ["Degats_Melee", "Degats_Distance"].includes(cat)) {
            action.valeur = 4;
        }
    } else {
        // PLAFOND NIVEAU 1 : Pas d'attaque de base surpuissante non-perdue
        if (action.valeur > 3 && cat !== "Defense_Lourde") {
            action.valeur = 3;
        }
    }

    return action;
}

// =========================================================================
//  CONSTRUCTEUR DU DECK COMPLET
// =========================================================================

window.genererDeckComplet = function(profilJson) {
    let deck = [];
    let compteurs = { burns: 0, elementsCrees: 0, elementsConsommes: 0, invocations: 0, executions: 0, actionsCrees: 0 };
    let elemDeck = profilJson.Elements?.Genere?.[0] || ELEMENTS_LISTE[Math.floor(Math.random() * ELEMENTS_LISTE.length)];

    for (let i = 0; i < 11; i++) {
        deck.push({
            id: "CARTE_" + (i + 1),
            initiative: Math.floor(Math.random() * 85) + 10,
            haut: null,
            bas: null
        });
    }

    // --- CONSTRUCTION DU BAS (Bottoms) ---
    // On génère le Bas en premier sans interdiction d'élément.
    deck[0].bas = forgerAction("Pillage", profilJson, compteurs, false, elemDeck, ""); 
    deck[1].bas = forgerAction("Pillage", profilJson, compteurs, false, elemDeck, ""); 
    for (let i = 2; i < 8; i++) deck[i].bas = forgerAction("Mobilite", profilJson, compteurs, false, elemDeck, ""); 
    for (let i = 8; i < 11; i++) deck[i].bas = forgerAction(null, profilJson, compteurs, false, elemDeck, ""); 

    // --- CONSTRUCTION DU HAUT (Tops) ---
    // SÉCURITÉ ANTI-CLONE : On passe l'élément créé en Bas comme 'elementInterdit' pour le Haut !
    deck[0].haut = forgerAction("Soin", profilJson, compteurs, false, elemDeck, deck[0].bas.element); 
    
    for (let i = 1; i < 11; i++) {
        let forcerEpique = (i === 1 || i === 2 || i === 3); 
        let elementInterditDuBas = deck[i].bas.element; // On regarde ce qu'a généré l'action du bas de cette carte
        deck[i].haut = forgerAction(null, profilJson, compteurs, forcerEpique, elemDeck, elementInterditDuBas); 
    }

    return deck;
};

// [La suite du fichier avec analyserStyleCombatRP et genererProfilDeck reste strictement identique]

async function analyserStyleCombatRP(texteRP) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) throw new Error("Clé Gemini manquante. Veuillez vérifier vos paramètres.");

    const promptSysteme = `Tu es le Moteur d'Analyse Tactique d'Ivalis. Ton rôle est de lire la description roleplay du style de combat d'un joueur et de la traduire en données mathématiques pour le générateur de deck procédural.

Tu dois impérativement respecter le schéma JSON ci-dessous. Ne génère aucun texte en dehors du JSON.

RÈGLES DE RÉPARTITION :
1. Répartis exactement 100 points dans l'objet "Poids_Actions" en fonction du texte du joueur. Si un aspect n'est pas mentionné, mets 0.
2. Dans "Alterations_Dominantes", choisis un maximum de 2 altérations parmi : [Poison, Blessure, Malediction, Confusion]. Sinon laisse [].
3. Dans "Elements", identifie un maximum de 2 éléments parmi : [Feu, Glace, Terre, Air, Lumiere, Tenebres]. Sinon laisse [].

SCHÉMA JSON ATTENDU :
{
  "Theme_Identifie": "Un titre court",
  "Poids_Actions": {
    "Degats_Melee": 0, "Degats_Distance": 0, "Degats_Zone": 0, "Degats_Purs": 0,
    "Mobilite": 0, "Furtivite_Esquive": 0, "Defense_Lourde": 0,
    "Soin": 0, "Soutien_Tactique": 0, "Controle_Mental": 0, 
    "Manipulation": 0, "Pillage": 0, "Invocations": 0, "Execution": 0
  },
  "Alterations_Dominantes": [],
  "Elements": { "Genere": [], "Consomme": [] }
}`;

    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: texteRP }] }],
        generationConfig: { 
            temperature: 0.2, 
            responseMimeType: "application/json" 
        }
    };

    const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyRequete)
    });

    const data = await reponse.json();
    if (data.error) throw new Error(data.error.message);

    const jsonTexte = data.candidates[0].content.parts[0].text;
    return JSON.parse(jsonTexte);
}

window.genererProfilDeck = async function() {
    const idPersonnage = document.getElementById("champ-id-personnage").value;
    const texteRP = document.getElementById("champ-rp-deck").value.trim();
    const btn = document.getElementById("btn-generer-profil-deck");
    const divResultat = document.getElementById("resultat-profil-deck");

    if (!idPersonnage || idPersonnage === "") {
        alert("Il faut d'abord enregistrer le personnage (onglet Descriptif) avant d'analyser son style.");
        return;
    }
    if (texteRP === "") {
        alert("Le grimoire a besoin d'une description pour tisser le style de combat.");
        return;
    }

    btn.innerText = "Création du Deck en cours...";
    btn.style.pointerEvents = "none";
    divResultat.style.display = "none";

    try {
        const profilJson = await analyserStyleCombatRP(texteRP);
        const deckProcedural = window.genererDeckComplet(profilJson);

        await setDoc(doc(db, "Cartes_Profils", idPersonnage), {
            ID_Personnage: idPersonnage,
            Texte_RP_Original: texteRP,
            Donnees_IA: profilJson,
            Deck_Mathematique: deckProcedural,
            Timestamp: new Date().getTime()
        });

        document.getElementById("titre-theme-deck").innerText = profilJson.Theme_Identifie || "Deck Généré";
        
        let texteAffichage = "=== ADN DU HÉROS (Répartition IA) ===\n";
        texteAffichage += JSON.stringify(profilJson, null, 2) + "\n\n";
        texteAffichage += "=== 11 CARTES GÉNÉRÉES (Deck Mathématique) ===\n";
        texteAffichage += JSON.stringify(deckProcedural, null, 2);
        
        document.getElementById("json-affichage-deck").innerText = texteAffichage;
        
        divResultat.style.display = "block";
        document.getElementById("champ-rp-deck").value = ""; 

    } catch (erreur) {
        console.error("Erreur lors de la génération du profil :", erreur);
        alert("L'analyse a échoué. Vérifiez vos clés d'API.");
    } finally {
        btn.innerText = "Analyser le style";
        btn.style.pointerEvents = "auto";
    }
};