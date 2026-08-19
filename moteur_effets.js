import { db } from "./firebase-config.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  IVALIS - MOTEUR DE RÉSOLUTION DES COMBATS (CIBLAGE ET DÉGÂTS)
// =========================================================================

window.ETAT_CIBLAGE = {
    actif: false,
    idCarte: null,
    attaques: [], 
    indexAttaqueEnCours: 0
};

// 1. Lancement du Ciblage quand on clique sur "Appliquer"
window.demarrerCiblage = async function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // Sécurité : Vérifie que le cache des effets BDD est chargé
    if (!window.EFFETS_BDD_CACHE) {
        alert("Le grimoire du moteur n'est pas encore synchronisé.");
        return;
    }

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    const attaquesExtraites = [];

    // Analyse la carte pour trouver les attaques de base
    dataCarte.Composants.actions.forEach(act => {
        const effBase = window.EFFETS_BDD_CACHE[act.baseEffetId];
        if (!effBase) return;
        
        const nomLower = effBase.Nom.toLowerCase();
        const estUneAttaque = nomLower.includes("attaque magique") || 
                              nomLower.includes("attaque légère") || 
                              nomLower.includes("attaque legere") || 
                              nomLower.includes("attaque lourde") || 
                              nomLower.includes("mots de pouvoir") || 
                              nomLower.includes("mot de pouvoir");

        if (estUneAttaque) {
            let typeRes = (nomLower.includes("magique") || nomLower.includes("pouvoir")) ? "Magique" : "Physique";
            let indexUI = dataCarte.Effets_Compiles.findIndex(e => (e.nom || e).toLowerCase() === nomLower);

            attaquesExtraites.push({
                nom: effBase.Nom,
                typeRes: typeRes,
                valeurBrute: (parseFloat(effBase.Valeur) || 0) * (act.count || 1),
                indexUI: indexUI !== -1 ? indexUI : 0,
                cibles: []
            });
        }
    });

    // Si c'est un sort passif ou de mouvement pur (pas de cible requise)
    if (attaquesExtraites.length === 0) {
        window.validerCarteCombat(idCarte, document.getElementById("btn-appliquer-carte"));
        return;
    }

    // Initialisation de la machine à états
    window.ETAT_CIBLAGE = {
        actif: true,
        idCarte: idCarte,
        attaques: attaquesExtraites,
        indexAttaqueEnCours: 0
    };

    // Modification de l'Interface (On cache "Appliquer" et on affiche "Résoudre" en bas)
    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    if (btnAppliquer) btnAppliquer.style.display = "none";

    let btnResoudre = document.getElementById("btn-resoudre-carte");
    if (!btnResoudre) {
        btnResoudre = document.createElement("div");
        btnResoudre.id = "btn-resoudre-carte";
        btnResoudre.style.cssText = "position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%); z-index: 5; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; cursor: pointer; letter-spacing: 2px; text-transform: uppercase; text-shadow: 1px 1px 2px black, 0 0 10px #00ffff; color: #00ffff; transition: transform 0.2s;";
        btnResoudre.onmouseover = () => btnResoudre.style.transform = "translateX(-50%) scale(1.1)";
        btnResoudre.onmouseout = () => btnResoudre.style.transform = "translateX(-50%) scale(1)";
        document.getElementById("apercu-carte-hd-competence").appendChild(btnResoudre);
    }
    
    // Le bouton RÉSOUDRE est cliquable TOUT DE SUITE pour permettre de "Passer" les effets impossibles
    btnResoudre.innerText = "RÉSOUDRE";
    btnResoudre.style.pointerEvents = "auto";
    btnResoudre.onclick = () => window.declencherResolution();

    // 🔻 INJECTION CSS DES ANNEAUX ROUGES DE CIBLAGE 🔻
    if (!document.getElementById("anim-ciblage-vtt")) {
        const style = document.createElement("style");
        style.id = "anim-ciblage-vtt";
        style.innerHTML = `
            @keyframes pulsationCible {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; box-shadow: 0 0 5px #ff4c4c; }
                100% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; box-shadow: 0 0 15px #ff4c4c; }
            }
        `;
        document.head.appendChild(style);
    }

    window.afficherEtapeCiblage();
};

// 2. Mise à jour Visuelle (Texte Doré sur la carte)
window.afficherEtapeCiblage = function() {
    const state = window.ETAT_CIBLAGE;
    if (!state.actif) return;

    // Éteindre toutes les lignes
    document.querySelectorAll("[id^='effet-hd-ligne-']").forEach(div => {
        const titre = div.querySelector('.titre-effet-hd');
        if (titre) {
            titre.style.color = "#e8d5a5"; 
            titre.style.textShadow = "1px 1px 2px black";
        }
    });

    // Allumer en Or la ligne en cours
    const attaqueCourante = state.attaques[state.indexAttaqueEnCours];
    if (attaqueCourante) {
        const divLigne = document.getElementById("effet-hd-ligne-" + attaqueCourante.indexUI);
        if (divLigne) {
            const titre = divLigne.querySelector('.titre-effet-hd');
            if (titre) {
                titre.style.color = "#ffd700";
                titre.style.textShadow = "0 0 10px #ffaa00, 2px 2px 2px black";
            }
        }
    }

    window.dessinerAnneauxCiblage();
};

// 3. Dessine les anneaux autour des cibles valides
window.dessinerAnneauxCiblage = function() {
    // Nettoyer les anciens anneaux
    document.querySelectorAll(".anneau-ciblage").forEach(el => el.remove());

    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) return;

    const persosJoueur = window.COMBAT_PERSOS_JOUEUR;
    if (!persosJoueur || window.COMBAT_INDEX_PERSO === undefined || !persosJoueur[window.COMBAT_INDEX_PERSO]) return;
    const idLanceur = persosJoueur[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    if (!tkLanceur) return;

    // Pour l'instant, Corps-à-Corps (Distance 1 stricte)
    for (let idToken in window.TOKENS_VTT_DATA) {
        if (idToken === idLanceur) continue; 

        const tk = window.TOKENS_VTT_DATA[idToken];
        const dist = (Math.abs(tkLanceur.q - tk.q) + Math.abs(tkLanceur.q + tkLanceur.r - tk.q - tk.r) + Math.abs(tkLanceur.r - tk.r)) / 2;

        if (dist === 1) {
            // 🔻 CORRECTION 3 : On ne regarde QUE l'attaque en cours. Ainsi, si on passe à l'attaque 2, 
            // la cible 1 redeviendra clignotante et pourra être frappée à nouveau !
            const attaqueCourante = window.ETAT_CIBLAGE.attaques[window.ETAT_CIBLAGE.indexAttaqueEnCours];
            const estSelectionne = attaqueCourante ? attaqueCourante.cibles.includes(idToken) : false;

            const anneau = document.createElement("div");
            anneau.className = "anneau-ciblage";
            anneau.style.position = "absolute";
            anneau.style.top = "50%";
            anneau.style.left = "50%";
            anneau.style.width = "110%";
            anneau.style.height = "110%";
            anneau.style.transform = "translate(-50%, -50%)";
            anneau.style.borderRadius = "50%";
            anneau.style.border = estSelectionne ? "4px solid #ff4c4c" : "3px dashed #ff4c4c";
            anneau.style.pointerEvents = "none";
            anneau.style.zIndex = "-1";
            
            // L'anneau clignote tant qu'il n'est pas verrouillé POUR L'ATTAQUE EN COURS
            anneau.style.animation = estSelectionne ? "none" : "pulsationCible 1.2s infinite alternate ease-in-out";

            const divToken = document.getElementById("token-" + idToken);
            if (divToken) divToken.appendChild(anneau);
        }
    }
};

// 4. Lorsqu'on clique sur un pion pendant le ciblage
window.ajouterCibleCiblage = function(idCible) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const persosJoueur = window.COMBAT_PERSOS_JOUEUR;
    if (!persosJoueur || window.COMBAT_INDEX_PERSO === undefined || !persosJoueur[window.COMBAT_INDEX_PERSO]) return;
    const state = window.ETAT_CIBLAGE;
    const attaqueEnCours = state.attaques[state.indexAttaqueEnCours];
    
    const idLanceur = persosJoueur[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const tkCible = window.TOKENS_VTT_DATA[idCible];

    if (!tkLanceur || !tkCible) return;
    
    const dist = (Math.abs(tkLanceur.q - tkCible.q) + Math.abs(tkLanceur.q + tkLanceur.r - tkCible.q - tkCible.r) + Math.abs(tkLanceur.r - tkCible.r)) / 2;

    if (dist > 1) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Hors de portée", "#aaaaaa");
        return;
    }

    // Assigne la cible
    attaqueEnCours.cibles = [idCible]; 

    const toutCible = state.attaques.every(a => a.cibles.length > 0);
    const btnResoudre = document.getElementById("btn-resoudre-carte");

    // 🔻 CORRECTION 4 : Avance à la prochaine attaque et rafraîchit
    if (state.indexAttaqueEnCours < state.attaques.length - 1) {
        state.indexAttaqueEnCours++;
        window.afficherEtapeCiblage(); // Remet les anneaux en pointillé pour la nouvelle attaque
    } else {
        window.dessinerAnneauxCiblage(); // Fige le dernier anneau en rouge solide
    }

    if (toutCible && btnResoudre) {
        btnResoudre.innerText = "RÉSOUDRE";
        btnResoudre.style.color = "#00ffff"; // Devient cliquable et bien visible !
        btnResoudre.style.pointerEvents = "auto";
    }
};

// 5. Nettoyage si on clique dans le vide ou si on annule
window.nettoyerCiblage = function() {
    window.ETAT_CIBLAGE.actif = false;
    document.querySelectorAll(".anneau-ciblage").forEach(el => el.remove());
    
    // Remettre les titres en normal
    document.querySelectorAll("[id^='effet-hd-ligne-']").forEach(div => {
        const titre = div.querySelector('.titre-effet-hd');
        if (titre) {
            titre.style.color = "#e8d5a5"; 
            titre.style.textShadow = "1px 1px 2px black";
        }
    });

    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    const btnResoudre = document.getElementById("btn-resoudre-carte");
    if (btnAppliquer) btnAppliquer.style.display = "block";
    if (btnResoudre) btnResoudre.remove();
};

// 6. Envoi de l'action de Dégâts à Firebase
window.declencherResolution = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;

    const btnResoudre = document.getElementById("btn-resoudre-carte");
    if (btnResoudre) {
        btnResoudre.innerText = "Frappe...";
        btnResoudre.style.pointerEvents = "none";
    }

    const actionData = {
        type: "ATTAQUES",
        idLanceur: window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage,
        idCarte: state.idCarte,
        attaques: state.attaques,
        timestamp: new Date().getTime()
    };

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Moteur: actionData
        });
        window.nettoyerCiblage();
    } catch (e) {
        console.error("Erreur résolution :", e);
        alert("Interférence magique, impossible de frapper.");
    }
};

// =========================================================================
//  MOTEUR D'ANIMATION (Se joue chez TOUS les joueurs en même temps)
// =========================================================================

window.jouerAnimationMoteur = async function(action) {
    if (action.type !== "ATTAQUES") return;

    const lanceur = action.idLanceur;

    // On séquence les animations des attaques
    for (let attaque of action.attaques) {
        
        // Si le joueur a passé cette attaque sans cible, on l'ignore (skip automatique)
        if (attaque.cibles.length === 0) continue;

        for (let idCible of attaque.cibles) {
            
            // 1. Récupérer les stats fraîches de la cible (Via RAM onSnapshot)
            const cibleData = window.PERSOS_PARTIE.find(p => p.idPersonnage === idCible);
            if (!cibleData) continue;

            const tkLanceur = window.TOKENS_VTT_DATA[lanceur];
            const tkCible = window.TOKENS_VTT_DATA[idCible];

            // 2. 🔻 ROTATION DU LANCEUR VERS SA CIBLE 🔻
            if (tkLanceur && tkCible) {
                const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
                const pxCible = window.PLATEAU_VTT.hexToPixel(tkCible.q, tkCible.r);
                const dx = pxCible.x - pxLanceur.x;
                const dy = pxCible.y - pxLanceur.y;
                
                // Formule trigonométrique pour trouver l'angle (Face à la cible)
                const angle = Math.atan2(dy, dx) * (180 / Math.PI) - 90;
                
                tkLanceur.angle = angle;
                window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
                
                // Pousse la rotation dans Firebase (seulement si c'est nous qui attaquons pour ne pas faire de requêtes en double)
                const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
                if (lanceurData && lanceurData.idJoueur === currentUserId) {
                    updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
                        [`Tokens.${lanceur}.angle`]: angle
                    }).catch(e => console.error(e));
                }
                
                // Petite pause pour laisser le temps au pion de tourner avant l'impact
                await new Promise(r => setTimeout(r, 200)); 
            }

            // 3. Jet d'esquive / Parade (Le plus haut des deux)
            const esquive = (parseInt(cibleData.Esquive) || 0) + (parseInt(cibleData.Dev_Mod_Esquive) || 0);
            const parade = (parseInt(cibleData.Parade) || 0) + (parseInt(cibleData.Dev_Mod_Parade) || 0);
            
            const jetDef = Math.floor(Math.random() * 100) + 1;
            const statDef = Math.max(esquive, parade);
            const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";

            if (jetDef <= statDef) {
                // Échec de l'attaque : C'est esquivé ou paré !
                if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, motDef, "#cccccc");
                await new Promise(r => setTimeout(r, 1000));
                continue; 
            }

            // 4. Calcul des Dégâts avec les Résistances
            const defPhys = (parseInt(cibleData.Def_Physique) || 0) + (parseInt(cibleData.Dev_Mod_DefPhys) || 0);
            const defMag = (parseInt(cibleData.Def_Magique) || 0) + (parseInt(cibleData.Dev_Mod_DefMag) || 0);

            let degats = attaque.valeurBrute;
            let resistance = attaque.typeRes === "Magique" ? defMag : defPhys;
            
            // Réduction des dégâts en pourcentage (max 100% de réduction)
            // Si la résistance est négative (ex: -50), ça ajoute des dégâts (+50%) = Faiblesse !
            let reduction = resistance / 100;
            if (reduction > 1) reduction = 1; 
            
            let degatsFinaux = Math.round(degats * (1 - reduction));
            if (degatsFinaux < 0) degatsFinaux = 0;

            cibleData.PV_Actuels = (parseInt(cibleData.PV_Actuels) || 0) - degatsFinaux;

            // 5. Animations Visuelles de l'impact
            if (tkCible) {
                // Le texte flottant des dégâts
                window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `-${degatsFinaux} 🩸`, "#ff4c4c");

                // Le Flash Sanglant du pion touché
                const tokenDiv = document.getElementById("token-" + idCible);
                if (tokenDiv) {
                    tokenDiv.style.transition = "filter 0.1s";
                    tokenDiv.style.filter = "sepia(1) hue-rotate(-50deg) saturate(5) brightness(1.2)";
                    setTimeout(() => { tokenDiv.style.filter = ""; }, 300);
                }
            }

            // 6. Le Lanceur est le SEUL à écrire les dégâts dans la Base de Données (Évite les conflits)
            const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
            const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
            
            if (lanceurData && lanceurData.idJoueur === currentUserId) {
                const refPerso = doc(db, "Personnages", idCible);
                updateDoc(refPerso, { PV_Actuels: cibleData.PV_Actuels }).catch(e => console.error(e));
            }

            // Si le joueur actif regarde la fiche de la victime, on met à jour la barre de vie UI en direct
            if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR.length > 0 && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                window.COMBAT_PV_ACTUELS = cibleData.PV_Actuels;
                if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
            }

            // Pause pour laisser l'impact respirer avant la prochaine attaque
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    // 7. Fin de la Séquence : On déduit la fatigue et on passe le tour (uniquement par le lanceur)
    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
    const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
    
    if (lanceurData && lanceurData.idJoueur === currentUserId) {
        window.validerCarteCombat(action.idCarte, null);
    }
};
