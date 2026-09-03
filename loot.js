// =========================================================================
//  IVALIS - INVENTAIRE, ÉQUIPEMENT ET BUTIN DE FIN DE COMBAT
// =========================================================================
//  Trois choses vivent ici :
//   1. La conversion emplacement <-> icône/libellé, partagée par la fiche
//      perso et les deux fenêtres de butin.
//   2. La détection de victoire (tous les ennemis à terre) et le tirage du
//      butin qui en découle.
//   3. Le déroulé du butin lui-même : fenêtre personnelle (deux objets par
//      héros, à prendre ou laisser) puis fenêtre commune (les objets laissés,
//      sur lesquels les joueurs se placent — tirage au sort en cas d'objets
//      convoités par plusieurs).
//
//  Toute écriture partagée sur le champ "Butin" du document de partie passe
//  par window.modifierPartie (combat.js) : plusieurs joueurs y touchent au
//  même instant, exactement comme la file d'attente du combat.
// =========================================================================

import { db } from "./firebase-config.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  VOCABULAIRE COMMUN DES EMPLACEMENTS
// =========================================================================

window.emplacementVersChampDoc = {
    "Armure": "Equip_Armure",
    "Main_Droite": "Equip_Main_Droite",
    "Main_Gauche": "Equip_Main_Gauche"
};
window.emplacementVersChampFront = {
    "Armure": "equipArmure",
    "Main_Droite": "equipMainDroite",
    "Main_Gauche": "equipMainGauche"
};

window.iconeParEmplacement = function(emplacement) {
    if (emplacement === "Armure") return "🛡️";
    if (emplacement === "Main_Gauche") return "🗡️";
    return "⚔️";
};
window.libelleEmplacement = function(emplacement) {
    if (emplacement === "Armure") return "Armure";
    if (emplacement === "Main_Gauche") return "Main gauche";
    return "Main droite";
};

// Écrit un objet du butin dans l'emplacement du personnage qui l'a remporté —
// que ce soit depuis la fenêtre personnelle ou la résolution du partage.
// L'ancien objet, s'il y en avait un, n'est conservé nulle part : il n'existe
// pas de "sac" dans Ivalis, l'écrasement est définitif et volontaire.
window.equiperObjetButin = async function(idPersonnage, item) {
    const champDoc = window.emplacementVersChampDoc[item.emplacement] || "Equip_Armure";
    const champFront = window.emplacementVersChampFront[item.emplacement] || "equipArmure";
    const valeur = { uid: item.uid, nom: item.nom, emplacement: item.emplacement,
                     effetTexte: item.effetTexte || "", image: item.image || "" };
    try {
        await updateDoc(doc(db, "Personnages", idPersonnage), { [champDoc]: valeur });
        const enRam = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
        if (enRam) enRam[champFront] = valeur;
        // Si la fiche de ce héros est ouverte à l'écran, l'emplacement se
        // redessine tout de suite plutôt que d'attendre une réouverture.
        if (document.getElementById("champ-id-personnage")?.value === idPersonnage
            && typeof window.afficherEmplacementEquipement === "function") {
            const suffixe = item.emplacement === "Armure" ? "armure"
                          : item.emplacement === "Main_Gauche" ? "main-gauche" : "main-droite";
            window.afficherEmplacementEquipement(suffixe, valeur);
        }
    } catch (e) {
        console.error("Équipement du butin :", e);
    }
};

// Deux tirages distincts par héros quand le catalogue le permet ; un
// catalogue trop petit ou vide donne simplement moins d'objets, plutôt que de
// planter la victoire.
window.tirerObjetsAleatoires = function(catalogue, n) {
    const source = [...catalogue];
    const tires = [];
    for (let i = 0; i < n && source.length > 0; i++) {
        const index = Math.floor(Math.random() * source.length);
        const objet = source.splice(index, 1)[0];
        tires.push({
            uid: "loot_" + Math.random().toString(36).slice(2, 10),
            nom: objet.Nom || "Objet mystérieux",
            emplacement: objet.Emplacement || "Armure",
            effetTexte: objet.Effet_Texte || "",
            image: objet.URL_Image || ""
        });
    }
    return tires;
};

// =========================================================================
//  DÉTECTION DE VICTOIRE
// =========================================================================
//  Rejouée à chaque changement de la liste des combattants (recomposerCombattants,
//  dans monstres.js) : c'est le seul endroit qui voit à la fois les monstres
//  mourir au combat et la coupe de test les achever d'un coup. Bon marché et
//  protégée par transaction (modifierPartie), donc sans risque à rejouer
//  souvent ni depuis plusieurs postes à la fois.
window.verifierVictoireCombat = function() {
    if (document.getElementById("fenetre-combat")?.style.display !== "block") return;
    if (window.PARTIE_DATA && window.PARTIE_DATA.Butin && window.PARTIE_DATA.Butin.ouvert) return;

    const monstres = window.MONSTRES_PARTIE || [];
    if (monstres.length === 0) return;

    const estMort = (m) => m.estIllusion || m.statut === "Mort"
        || (typeof window.estCombattantMort === "function" && window.estCombattantMort(m.idPersonnage));
    if (!monstres.every(estMort)) return;

    const heroVivant = (window.PERSOS_PARTIE || []).some(p => p.camp === "Allié" && !p.estIllusion && p.actif !== false
        && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)));
    if (!heroVivant) return;

    if (typeof window.demarrerButin === "function") window.demarrerButin();
};

// Pose le butin en base : un jet de deux objets par héros survivant, sous
// transaction pour qu'un seul poste (parmi ceux qui détectent la victoire au
// même instant) l'écrive réellement.
window.demarrerButin = async function() {
    if (!window.ID_PARTIE_COURANTE) return;

    const catalogue = Object.values(window.CACHE_OBJETS || {});
    const participants = (window.PERSOS_PARTIE || [])
        .filter(p => p.camp === "Allié" && !p.estIllusion && p.actif !== false
                  && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)))
        .map(p => p.idPersonnage);
    if (participants.length === 0) return;

    if (catalogue.length === 0) {
        console.warn("Butin : le catalogue d'objets (\"Objets\") est vide — window.seedObjetsExemple() pour le peupler.");
    }

    await window.modifierPartie((data) => {
        if (data.Butin && data.Butin.ouvert) return null; // déjà ouvert par un autre poste

        const parPersonnage = {};
        participants.forEach(id => {
            parPersonnage[id] = { items: window.tirerObjetsAleatoires(catalogue, 2), decisions: {}, valide: false };
        });

        return { maj: { Butin: {
            ouvert: true,
            etape: "personnel",
            participants,
            parPersonnage,
            pool: [],
            poolValides: [],
            resolu: false
        } } };
    });
};

// =========================================================================
//  AFFICHAGE — répartiteur appelé à chaque notification de la partie
// =========================================================================

window.afficherFenetreButin = function(butin) {
    const fenetre = document.getElementById("fenetre-butin");
    if (!fenetre) return;

    if (!butin || !butin.ouvert) {
        fenetre.style.display = "none";
        return;
    }
    fenetre.style.display = "flex";

    const joueurId = localStorage.getItem("ID_JOUEUR_COURANT");
    const mesPersonnages = (butin.participants || [])
        .map(id => (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === id))
        .filter(p => p && p.idJoueur === joueurId);

    window.afficherEquipementActuelButin(mesPersonnages);

    const vuePersonnel = document.getElementById("butin-vue-personnel");
    const vuePartage = document.getElementById("butin-vue-partage");
    const vueFin = document.getElementById("butin-vue-fin");
    const titre = document.getElementById("butin-titre");
    const sousTitre = document.getElementById("butin-sous-titre");
    vuePersonnel.style.display = "none";
    vuePartage.style.display = "none";
    vueFin.style.display = "none";

    if (butin.etape === "personnel") {
        titre.innerText = "Butin de guerre";
        sousTitre.innerText = "Choisis ce que tu gardes — l'objet remplacé est perdu pour de bon.";
        vuePersonnel.style.display = "block";
        window.rendreVuePersonnelleButin(butin, mesPersonnages);
    } else if (butin.etape === "partage") {
        titre.innerText = "Partage du butin";
        sousTitre.innerText = "Place-toi sur un ou plusieurs objets restants. Plusieurs prétendants ? Le sort tranchera.";
        vuePartage.style.display = "block";
        window.rendreVuePartageButin(butin, mesPersonnages.map(p => p.idPersonnage));
    } else if (butin.etape === "termine") {
        titre.innerText = "Butin réparti";
        sousTitre.innerText = "Voici ce que chacun a récupéré.";
        vueFin.style.display = "block";
        window.rendreVueFinButin(butin, mesPersonnages.map(p => p.idPersonnage));
    }
};

// Rappel discret de ce que portent déjà "mes" héros, visible dans les deux
// fenêtres — c'est ce à quoi le joueur compare avant de choisir.
window.afficherEquipementActuelButin = function(mesPersonnages) {
    const conteneur = document.getElementById("butin-equipement-actuel");
    if (!conteneur) return;
    if (mesPersonnages.length === 0) { conteneur.innerHTML = ""; return; }

    const carre = (objet, icone) => {
        if (objet && objet.nom) {
            const img = objet.image ? `<img src="${objet.image}" alt="${objet.nom}" style="display:block;">` : icone;
            return `<div class="mini-carre-equip" title="${objet.nom} — ${objet.effetTexte || ""}">${img}</div>`;
        }
        return `<div class="mini-carre-equip vide">${icone}</div>`;
    };

    conteneur.innerHTML = mesPersonnages.map(p => `
        <span class="mini-etiquette-perso">${p.prenom}</span>
        ${carre(p.equipArmure, "🛡️")}
        ${carre(p.equipMainDroite, "⚔️")}
        ${carre(p.equipMainGauche, "🗡️")}
    `).join("");
};

// =========================================================================
//  VUE 1 : LE BUTIN PERSONNEL
// =========================================================================

window.rendreVuePersonnelleButin = function(butin, mesPersonnages) {
    const conteneur = document.getElementById("butin-vue-personnel");
    if (!conteneur) return;

    if (mesPersonnages.length === 0) {
        conteneur.innerHTML = `<p class="butin-attente">Tu n'as pas de héros dans ce combat.</p>`;
        return;
    }

    conteneur.innerHTML = mesPersonnages.map(perso => {
        const bloc = butin.parPersonnage[perso.idPersonnage];
        if (!bloc) return "";
        const cartes = bloc.items.map(item => window.rendreCarteLootPersonnel(perso.idPersonnage, item, bloc)).join("");
        const tousDecides = bloc.items.every(it => bloc.decisions && bloc.decisions[it.uid] !== undefined);

        let pied;
        if (bloc.valide) {
            pied = `<p class="butin-attente">✔️ Choix validé pour ${perso.prenom} — en attente des autres...</p>`;
        } else {
            pied = `<div class="butin-actions">
                <button class="btn-parametres" style="background-color:#1b6e3a; border-color:#0f4021;${tousDecides ? "" : " opacity:0.4; cursor:not-allowed;"}"
                        ${tousDecides ? "" : "disabled"}
                        onclick="window.validerButinPersonnel('${perso.idPersonnage}')">Valider mon choix</button>
            </div>`;
        }

        return `<div class="bloc-heros-butin">
            <div class="nom-heros-butin">${perso.prenom}</div>
            <div class="butin-grille">${cartes}</div>
            ${pied}
        </div>`;
    }).join("");
};

window.rendreCarteLootPersonnel = function(idPersonnage, item, bloc) {
    const decision = bloc.decisions ? bloc.decisions[item.uid] : undefined;
    const icone = window.iconeParEmplacement(item.emplacement);
    const image = item.image ? `<img src="${item.image}" alt="${item.nom}" style="display:block;">`
                              : `<div class="icone-emplacement-vide">${icone}</div>`;

    let actions;
    if (decision === true) actions = `<div class="statut-loot pris">✔️ Pris</div>`;
    else if (decision === false) actions = `<div class="statut-loot laisse">Laissé</div>`;
    else if (bloc.valide) actions = `<div class="statut-loot laisse">Non décidé</div>`;
    else actions = `<div class="carte-loot-actions">
        <button class="btn-loot-mini prendre" onclick="window.choisirLootPersonnel('${idPersonnage}','${item.uid}', true)">Prendre</button>
        <button class="btn-loot-mini laisser" onclick="window.choisirLootPersonnel('${idPersonnage}','${item.uid}', false)">Laisser</button>
    </div>`;

    return `<div class="carte-loot">
        <div class="carre-equipement">${image}</div>
        <div class="libelle-emplacement">${window.libelleEmplacement(item.emplacement)}</div>
        <div class="nom-objet-equipe">${item.nom}</div>
        <div class="effet-objet-equipe">${item.effetTexte || ""}</div>
        ${actions}
    </div>`;
};

// "Laisser" est immédiat (rien à confirmer) ; "Prendre" ouvre la comparaison
// avant/après, et n'écrit la décision qu'une fois confirmé.
window.choisirLootPersonnel = function(idPersonnage, uid, prendre) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!prendre) {
        window.enregistrerDecisionButin(idPersonnage, uid, false);
        return;
    }

    const butin = (window.PARTIE_DATA || {}).Butin;
    const bloc = butin && butin.parPersonnage[idPersonnage];
    const item = bloc && bloc.items.find(it => it.uid === uid);
    if (!item) return;

    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    const champFront = window.emplacementVersChampFront[item.emplacement] || "equipArmure";
    const actuel = perso ? perso[champFront] : null;

    window.BUTIN_CHOIX_EN_ATTENTE = { idPersonnage, uid, item };
    window.remplirComparaisonEquip(actuel, item);
    document.getElementById("popup-confirmation-equip").style.display = "flex";
};

window.remplirComparaisonEquip = function(actuel, nouveau) {
    const rendre = (objet) => {
        if (!objet || !objet.nom) {
            return `<div class="carre-equipement"><div class="icone-emplacement-vide">—</div></div>
                    <div class="nom-objet-equipe">Rien d'équipé</div>`;
        }
        const icone = window.iconeParEmplacement(objet.emplacement);
        const image = objet.image ? `<img src="${objet.image}" alt="${objet.nom}" style="display:block;">`
                                   : `<div class="icone-emplacement-vide">${icone}</div>`;
        return `<div class="carre-equipement">${image}</div>
                <div class="nom-objet-equipe">${objet.nom}</div>
                <div class="effet-objet-equipe">${objet.effetTexte || ""}</div>`;
    };
    document.getElementById("comparaison-actuel").innerHTML = rendre(actuel);
    document.getElementById("comparaison-nouveau").innerHTML = rendre(nouveau);
};

window.confirmerChoixButin = async function(confirme) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    document.getElementById("popup-confirmation-equip").style.display = "none";
    const attente = window.BUTIN_CHOIX_EN_ATTENTE;
    window.BUTIN_CHOIX_EN_ATTENTE = null;
    if (!attente) return;

    if (confirme) {
        await window.equiperObjetButin(attente.idPersonnage, attente.item);
        await window.enregistrerDecisionButin(attente.idPersonnage, attente.uid, true);
    }
    // Annulé : la décision reste ouverte, le joueur peut recliquer Prendre ou Laisser.
};

window.enregistrerDecisionButin = async function(idPersonnage, uid, prendre) {
    await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "personnel") return null;
        const bloc = butin.parPersonnage[idPersonnage];
        if (!bloc || bloc.valide) return null; // déjà validé : trop tard pour changer d'avis
        return { maj: { [`Butin.parPersonnage.${idPersonnage}.decisions.${uid}`]: prendre } };
    });
};

// Valide les deux choix d'un héros. Si c'est le DERNIER héros à valider, le
// pool du partage commun est construit ici même, dans la même transaction :
// la bascule est atomique, aucune autre écriture ne peut se glisser entre les
// deux (cf. window.modifierPartie).
window.validerButinPersonnel = async function(idPersonnage) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "personnel") return null;
        const bloc = butin.parPersonnage[idPersonnage];
        if (!bloc || bloc.valide) return null;

        const tousDecides = bloc.items.every(it => bloc.decisions && bloc.decisions[it.uid] !== undefined);
        if (!tousDecides) return null;

        const maj = { [`Butin.parPersonnage.${idPersonnage}.valide`]: true };

        const dejaValides = new Set(Object.keys(butin.parPersonnage).filter(id => butin.parPersonnage[id].valide));
        dejaValides.add(idPersonnage);
        const tousValides = butin.participants.every(id => dejaValides.has(id));

        if (tousValides) {
            const pool = [];
            butin.participants.forEach(id => {
                const b = butin.parPersonnage[id];
                const decisions = id === idPersonnage ? (bloc.decisions || {}) : (b.decisions || {});
                (b.items || []).forEach(item => {
                    if (decisions[item.uid] === false) pool.push({ ...item, candidats: [], gagnant: null });
                });
            });
            maj["Butin.pool"] = pool;
            maj["Butin.etape"] = "partage";
        }

        return { maj };
    });
};

// =========================================================================
//  VUE 2 : LE PARTAGE COMMUN
// =========================================================================

window.rendreVuePartageButin = function(butin, mesIds) {
    const conteneur = document.getElementById("butin-grille-partage");
    const attente = document.getElementById("butin-attente-partage");
    const btnValider = document.getElementById("btn-valider-butin-partage");
    if (!conteneur) return;

    const dejaValide = mesIds.length > 0 && mesIds.every(id => (butin.poolValides || []).includes(id));

    if ((butin.pool || []).length === 0) {
        conteneur.innerHTML = `<p class="butin-attente">Personne n'a laissé d'objet cette fois-ci.</p>`;
    } else {
        conteneur.innerHTML = butin.pool.map(item => window.rendreCarteLootPool(item, mesIds, dejaValide)).join("");
    }

    if (btnValider) {
        btnValider.style.display = dejaValide ? "none" : "inline-block";
        btnValider.disabled = mesIds.length === 0;
    }
    if (attente) {
        const nbValides = (butin.poolValides || []).length;
        const total = (butin.participants || []).length;
        attente.innerText = dejaValide ? `En attente des autres joueurs (${nbValides}/${total} prêts)...` : "";
    }
};

window.rendreCarteLootPool = function(item, mesIds, dejaValide) {
    const icone = window.iconeParEmplacement(item.emplacement);
    const image = item.image ? `<img src="${item.image}" alt="${item.nom}" style="display:block;">`
                              : `<div class="icone-emplacement-vide">${icone}</div>`;
    const candidats = item.candidats || [];
    const jeSuisDedans = mesIds.some(id => candidats.includes(id));
    const nomsCandidats = candidats.map(id => {
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
        return p ? p.prenom : id;
    });

    let actions;
    if (dejaValide) {
        actions = jeSuisDedans ? `<div class="statut-loot pris">En lice</div>` : "";
    } else {
        actions = `<div class="carte-loot-actions">` + mesIds.map(id => {
            const dedans = candidats.includes(id);
            const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
            const suffixeNom = mesIds.length > 1 ? ` (${p ? p.prenom : id})` : "";
            return `<button class="btn-loot-mini ${dedans ? "retirer" : "place"}"
                onclick="window.togglePlacementPool('${id}','${item.uid}')">${dedans ? "Se retirer" : "Se placer"}${suffixeNom}</button>`;
        }).join("") + `</div>`;
    }

    return `<div class="carte-loot">
        <div class="carre-equipement">${image}</div>
        <div class="libelle-emplacement">${window.libelleEmplacement(item.emplacement)}</div>
        <div class="nom-objet-equipe">${item.nom}</div>
        <div class="effet-objet-equipe">${item.effetTexte || ""}</div>
        <div class="candidats-loot">${nomsCandidats.length ? "Convoité par : " + nomsCandidats.join(", ") : "Personne pour l'instant"}</div>
        ${actions}
    </div>`;
};

// Un héros peut se placer sur PLUSIEURS objets à la fois (bascule simple par
// objet), et changer d'avis librement tant que le partage n'est pas résolu.
window.togglePlacementPool = async function(idPersonnage, uid) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "partage" || butin.resolu) return null;
        const pool = (butin.pool || []).map(item => {
            if (item.uid !== uid) return item;
            const candidats = item.candidats || [];
            const dedans = candidats.includes(idPersonnage);
            return { ...item, candidats: dedans ? candidats.filter(id => id !== idPersonnage) : [...candidats, idPersonnage] };
        });
        return { maj: { "Butin.pool": pool } };
    });
};

// Valide TOUS les héros de ce joueur d'un coup. Si c'est le dernier joueur à
// valider, la résolution (tirage au sort compris) a lieu ici même, dans la
// transaction : un seul appel, parmi tous ceux qui arrivent en même temps,
// obtient un résultat non nul — c'est lui, et lui seul, qui équipe ensuite
// les gagnants (même principe que "jeSuisLAuteur" dans le moteur d'effets).
window.validerButinPool = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const joueurId = localStorage.getItem("ID_JOUEUR_COURANT");
    const butinLocal = (window.PARTIE_DATA || {}).Butin;
    if (!butinLocal) return;
    const mesPersonnages = (butinLocal.participants || [])
        .filter(id => {
            const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
            return p && p.idJoueur === joueurId;
        });
    if (mesPersonnages.length === 0) return;

    const resolution = await window.modifierPartie((data) => {
        const butin = data.Butin;
        if (!butin || butin.etape !== "partage" || butin.resolu) return null;

        const poolValides = new Set(butin.poolValides || []);
        mesPersonnages.forEach(id => poolValides.add(id));
        const tousValides = (butin.participants || []).every(id => poolValides.has(id));

        if (!tousValides) {
            // resultat explicite (et non "undefined") : sinon modifierPartie
            // renverrait true par défaut, et le for..of plus bas plante dessus.
            return { maj: { "Butin.poolValides": [...poolValides] }, resultat: null };
        }

        const pool = (butin.pool || []).map(item => {
            const candidats = item.candidats || [];
            let gagnant = null;
            if (candidats.length === 1) gagnant = candidats[0];
            else if (candidats.length > 1) gagnant = candidats[Math.floor(Math.random() * candidats.length)];
            return { ...item, gagnant };
        });

        return {
            maj: { "Butin.poolValides": [...poolValides], "Butin.pool": pool, "Butin.resolu": true, "Butin.etape": "termine" },
            resultat: pool
        };
    });

    if (resolution) {
        for (const item of resolution) {
            if (item.gagnant) await window.equiperObjetButin(item.gagnant, item);
        }
    }
};

// =========================================================================
//  VUE 3 : LE RÉSULTAT
// =========================================================================

window.rendreVueFinButin = function(butin, mesIds) {
    const conteneur = document.getElementById("butin-resultats");
    if (!conteneur) return;
    if ((butin.pool || []).length === 0) {
        conteneur.innerHTML = `<p class="butin-attente">Rien n'était à partager cette fois-ci.</p>`;
        return;
    }
    conteneur.innerHTML = butin.pool.map(item => {
        const icone = window.iconeParEmplacement(item.emplacement);
        const image = item.image ? `<img src="${item.image}" alt="${item.nom}" style="display:block;">`
                                  : `<div class="icone-emplacement-vide">${icone}</div>`;
        const gagnantPerso = item.gagnant ? (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === item.gagnant) : null;
        const statut = gagnantPerso
            ? `<div class="statut-loot gagne">🏆 ${gagnantPerso.prenom}</div>`
            : `<div class="statut-loot perdu">Personne ne l'a pris</div>`;
        // Un objet remporté par un autre joueur s'assombrit : ce qui reste en
        // pleine lumière est ce qui a un rapport avec MES héros.
        const inaccessible = item.gagnant && !mesIds.includes(item.gagnant);

        return `<div class="carte-loot${inaccessible ? " loot-inaccessible" : ""}">
            <div class="carre-equipement">${image}</div>
            <div class="libelle-emplacement">${window.libelleEmplacement(item.emplacement)}</div>
            <div class="nom-objet-equipe">${item.nom}</div>
            <div class="effet-objet-equipe">${item.effetTexte || ""}</div>
            ${statut}
        </div>`;
    }).join("");
};

// Referme le butin pour tout le monde d'un coup — n'importe quel joueur peut
// le faire une fois la répartition terminée.
window.fermerFenetreButin = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await window.modifierPartie((data) => {
        if (!data.Butin || !data.Butin.ouvert) return null;
        return { maj: { "Butin.ouvert": false } };
    });
};
