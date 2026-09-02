// =========================================================================
//  IVALIS - Logique applicative (Firestore temps reel)
// =========================================================================
//  Ce fichier remplace l'integralite de l'ancienne logique Google Apps Script.
//  TOUS les anciens appels `google.script.run.<fonctionServeur>` ont ete
//  remplaces par des requetes Firestore natives (SDK modulaire v9 via CDN).
//
//  L'affichage des donnees partagees utilise `onSnapshot` : les joueurs voient
//  les modifications (date en jeu, liste des heros...) en TEMPS REEL.
//
//  GENERATION D'IMAGE (projet prive) : gere 100% en front-end. Les cles
//  OpenAI / Cloudinary ne sont PAS ecrites en dur : elles sont saisies par
//  l'utilisateur dans Parametres > Cles API et stockees dans le localStorage
//  du navigateur, puis lues au moment de generer un portrait.
// =========================================================================

import { db } from "./firebase-config.js";
import { playlist } from "./playlist.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteField,
  writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  NOMS DES COLLECTIONS FIRESTORE
// =========================================================================
const COL = {
  PARTIES: "Systeme_Parties",
  JOUEURS: "Joueurs",
  DATE: "Date_En_Jeu",
  MDP: "MDP_Nouvelle_Partie",
  CERVEAU_IA: "Cerveau_IA",
  FACTIONS: "Monde_Factions",
  PERSONNAGES: "Personnages",
  MESSAGES: "Messages_Chat",
  CARACTERISTIQUES: "Caracteristiques" // <-- NOUVEAU
};

// Identifiants des documents uniques (anciennes cellules fixes des Sheets)
const DOC_DATE = "actuelle";
const DOC_CONFIG_MDP = "config";

// =========================================================================
//  VARIABLES GLOBALES (les "badges" de l'ancienne logique)
// =========================================================================
window.ID_PARTIE_COURANTE = null;
window.ID_PARTIE_EN_ATTENTE = null;
window.LISTE_PARTIES_CACHE = [];

// --- NOUVEAU CACHE DES COMPÉTENCES ---
window.CACHE_COMPETENCES_GLOBAL = {};
window.UNSUBSCRIBE_COMPETENCES = {};

// References de desabonnement pour les ecouteurs temps reel
let unsubscribePersonnages = null;
let unsubscribeDate = null;
let unsubscribeJoueurs = null;

// =========================================================================
//  MIXEUR AUDIO GLOBAL
// =========================================================================
window.PARAMETRES_AUDIO = {
    general: parseFloat(localStorage.getItem("ivalis_vol_general") !== null ? localStorage.getItem("ivalis_vol_general") : "1.0"),
    musique: parseFloat(localStorage.getItem("ivalis_vol_musique") !== null ? localStorage.getItem("ivalis_vol_musique") : "0.30"),
    interface: parseFloat(localStorage.getItem("ivalis_vol_interface") !== null ? localStorage.getItem("ivalis_vol_interface") : "0.80")
};

window.appliquerVolumesAudio = function() {
    // 1. Appliquer à la musique d'ambiance
    const musique = document.getElementById("musique-ambiance");
    if (musique) {
        musique.volume = window.PARAMETRES_AUDIO.musique * window.PARAMETRES_AUDIO.general;
    }

    // 2. Mettre à jour visuellement les curseurs
    const inputGen = document.getElementById("vol-general");
    const inputMus = document.getElementById("vol-musique");
    const inputInt = document.getElementById("vol-interface");

    if (inputGen) inputGen.value = window.PARAMETRES_AUDIO.general;
    if (inputMus) inputMus.value = window.PARAMETRES_AUDIO.musique;
    if (inputInt) inputInt.value = window.PARAMETRES_AUDIO.interface;
};

window.changerVolume = function(canal, valeur) {
    window.PARAMETRES_AUDIO[canal] = parseFloat(valeur);
    localStorage.setItem("ivalis_vol_" + canal, valeur);
    window.appliquerVolumesAudio();
};

// =========================================================================
//  HELPERS
// =========================================================================
function nettoyer(valeur) {
  return (valeur === undefined || valeur === null) ? "" : valeur.toString().trim();
}

// Conversion : document Firestore "Personnages" (colonnes CSV) -> objet front-end
function persoDocVersFront(id, d) {
  let esquiveCalc = d.Esquive !== undefined ? d.Esquive : 15;
  let paradeCalc = d.Parade !== undefined ? d.Parade : 0;
  const etatsAlteres = d.Etats_Alteres || [];
  
  // 🔻 NOUVEAU : Application native des malus d'états à la racine ! 🔻
  if (etatsAlteres.some(e => e.nom === "Étourdi")) {
      esquiveCalc -= 20;
      paradeCalc -= 20;
  }

  return {
    idPersonnage: id,
    idPartie: d.ID_Partie || "",
    idJoueur: d.ID_Joueur || "",
    camp: d.Camp || "Allié", 
    deckEquipe: d.Deck_Equipe || [], 
    couleur: d.Couleur || "",
    // À défaut de valeur enregistrée, un combattant démarre plein — donc à son
    // maximum RETOUCHÉ, sinon un héros monté à 110 d'énergie naissait à 100.
    fatigueActuelle: d.Fatigue_Actuelle !== undefined ? d.Fatigue_Actuelle
        : ((d.Fatigue_Max !== undefined ? parseInt(d.Fatigue_Max) || 100 : 100) + (parseInt(d.Dev_Mod_Fatigue) || 0)),
    fatigueMax: d.Fatigue_Max !== undefined ? d.Fatigue_Max : 100,
    prenom: d.Prenom_Personnage || "",
    nom: d.Nom_Personnage || "",
    race: d.Race || "",
    urlCloudinary: d.URL_Cloudinary || "",
    urlToken: d.URL_Token || "", 
    statut: d.Statut || "Vivant",
    age: d.Age_Apparent || "",
    genre: d.Genre || "",
    corpulence: d.Corpulence || "",
    taille: d.Taille || "",
    peau: d.Teint_Peau || "",
    cheveux: d.Coupe_De_Cheveux || "",
    yeux: d.Yeux || "",
    pilosite: d.Pilosite_Faciale || "",
    style: d.Style_Vestimentaire || "",
    couleursDom: d.Couleurs_Dominante || "",
    equipement: d.Equipement_Visible || "",
    signes: d.Signes_Distinctif || "",
    expression: d.Expression_Du_Visage || "",
    idFaction: d.ID_Faction || "",
    PV_Max: d.PV_Max || 0,
    PV_Actuels: d.PV_Actuels !== undefined ? d.PV_Actuels
        : ((parseInt(d.PV_Max) || 0) + (parseInt(d.Dev_Mod_PV) || 0)),
    Fatigue_Max: d.Fatigue_Max !== undefined ? d.Fatigue_Max : 100,
    Regeneration: d.Regeneration !== undefined ? d.Regeneration : 30,
    Esquive: esquiveCalc, // 🔻 Calculé avec le malus
    Parade: paradeCalc,   // 🔻 Calculé avec le malus
    Critique: d.Critique !== undefined ? d.Critique : 10,
    Def_Physique: d.Def_Physique !== undefined ? d.Def_Physique : 0,
    Def_Magique: d.Def_Magique !== undefined ? d.Def_Magique : 0,
    Dev_Mod_PV: d.Dev_Mod_PV || 0,
    Dev_Mod_Fatigue: d.Dev_Mod_Fatigue || 0,
    Dev_Mod_Regen: d.Dev_Mod_Regen || 0,
    Dev_Mod_Esquive: d.Dev_Mod_Esquive || 0,
    Dev_Mod_Parade: d.Dev_Mod_Parade || 0,
    Dev_Mod_Critique: d.Dev_Mod_Critique || 0,
    Dev_Mod_DefPhys: d.Dev_Mod_DefPhys || 0,
    Dev_Mod_DefMag: d.Dev_Mod_DefMag || 0,
    Competences_Max: d.Competences_Max !== undefined ? d.Competences_Max : 6,
    Etats_Alteres: etatsAlteres,
    Bouclier_Max: d.Bouclier_Max || 0,
    Bouclier_Actuel: d.Bouclier_Actuel || 0,
    estIllusion: d.Est_Illusion === true
  };
}

// Partagée avec monstres.js : un monstre doit exposer exactement les mêmes champs
// qu'un personnage pour que tout le moteur de combat le traite sans le savoir.
window.persoDocVersFront = persoDocVersFront;

// =========================================================================
//  LES STATS RÉELLES D'UN COMBATTANT (BASE + RETOUCHES DE LA FICHE)
// =========================================================================
//  Les outils de développement de la fiche perso ne touchent pas aux valeurs
//  de base : ils écrivent leur écart à côté (Dev_Mod_*). La fiche affiche bien
//  la somme, mais le combat lisait la base seule pour l'énergie et la
//  régénération — une Énergie Max portée à 110 retombait à 100 en jeu, et la
//  vitalité maximale servant aux dégâts de poison ignorait sa retouche.
//  Ces lectures sont mutualisées ici, au plus près de la conversion des fiches,
//  pour qu'aucun morceau du moteur ne puisse à nouveau en oublier une.

// =========================================================================
//  UNE SEULE ANIMATION À LA FOIS
// =========================================================================
//  Une notification de la base peut apporter PLUSIEURS actions d'un coup : un
//  déplacement de créature et la carte qu'elle a lancée juste après arrivent
//  dans le même paquet dès que le réseau hoquète — ce qui n'arrive jamais quand
//  un seul navigateur joue, et tout le temps à trois. Lancées ensemble, ces
//  animations se marchent dessus : le trajet d'un pion est interrompu par la
//  suivante, et il se retrouve d'un bond à sa case d'arrivée, à cinq cases de
//  là. On les met donc à la queue leu leu.
window.FILE_ANIMATIONS = Promise.resolve();

// Une animation qui ne rendrait jamais la main bloquerait toutes les suivantes,
// et la table entière avec. Passé vingt secondes — bien au-delà de la plus
// longue (une fuite de Peur dure quelques secondes) — on passe à la suite.
window.DELAI_MAX_ANIMATION_MS = 20000;

window.filerAnimation = function(nom, fn) {
    window.FILE_ANIMATIONS = window.FILE_ANIMATIONS
        .then(() => Promise.race([
            Promise.resolve().then(fn),
            new Promise(resoudre => setTimeout(() => {
                console.warn("Animation « " + nom + " » trop longue : on passe à la suite.");
                resoudre();
            }, window.DELAI_MAX_ANIMATION_MS))
        ]))
        .catch(e => console.error("Animation « " + nom + " » :", e));
    return window.FILE_ANIMATIONS;
};

window.pvMaxCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.PV_Max) || 0) + (parseInt(perso.Dev_Mod_PV) || 0);
};

// Un monstre porte "fatigueMax", un personnage "Fatigue_Max" : les deux noms
// coexistent dans le moteur, la lecture les accepte donc tous les deux.
window.fatigueMaxCombattant = function(perso, defaut = 100) {
    if (!perso) return defaut;
    const socle = (parseInt(perso.Fatigue_Max) || parseInt(perso.fatigueMax) || defaut);
    return socle + (parseInt(perso.Dev_Mod_Fatigue) || 0)
                 + ((window.atoutRace ? window.atoutRace(perso).fatigueMax : 0) || 0);
};

window.regenerationCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.Regeneration) || 0) + (parseInt(perso.Dev_Mod_Regen) || 0);
};

// =========================================================================
//  LES ATOUTS DE RACE
// =========================================================================
//  Chaque peuple apporte son avantage. Comme les retouches de la fiche, ils ne
//  sont PAS recopiés dans les valeurs enregistrées : ils s'ajoutent à la
//  lecture. Un personnage créé avant l'arrivée de ces atouts en profite donc
//  immédiatement, et la valeur de base reste lisible telle qu'elle a été
//  choisie à la création.
//
//  Le bestiaire n'enregistre aucune race : les créatures n'en tirent rien.

window.ATOUTS_RACES = {
    "Gob":     { esquive: 3, competences: 1 },
    "Ankylar": { defPhysique: 10 },
    "Ondari":  { porteeMagique: 1, immunites: ["Brûlé"] },
    "Vargen":  { diviseurDeplacement: 2, esquiveOpportunite: 30 },
    "Ophior":  { defMagique: 10 },
    "Ethéré":  { soinsRecus: 30, immunites: ["Empoisonnement"] },
    "Humain":  { fatigueMax: 10, bonusReposLong: 10 }
};

// La fiche front-end porte "race", le document Firestore porte "Race" : la
// Forge lit l'un, le combat l'autre. On accepte les deux.
window.atoutRace = function(perso) {
    if (!perso || perso.estMonstre) return {};
    return window.ATOUTS_RACES[perso.race] || window.ATOUTS_RACES[perso.Race] || {};
};

window.esquiveCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.Esquive) || 0) + (parseInt(perso.Dev_Mod_Esquive) || 0)
         + (window.atoutRace(perso).esquive || 0);
};

window.paradeCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.Parade) || 0) + (parseInt(perso.Dev_Mod_Parade) || 0)
         + (window.atoutRace(perso).parade || 0);
};

window.defPhysiqueCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.Def_Physique) || 0) + (parseInt(perso.Dev_Mod_DefPhys) || 0)
         + (window.atoutRace(perso).defPhysique || 0);
};

window.defMagiqueCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.Def_Magique) || 0) + (parseInt(perso.Dev_Mod_DefMag) || 0)
         + (window.atoutRace(perso).defMagique || 0);
};

// Une créature ou pas ? Trois indices concordants, parce que la réponse décide
// d'une règle du jeu (les créatures ne font jamais de coup critique) et qu'un
// seul d'entre eux peut manquer sur un poste qui vient de se connecter.
window.estUneCreature = function(perso, idCombattant) {
    const id = idCombattant || (perso && perso.idPersonnage);
    if (typeof window.estMonstre === "function" && id && window.estMonstre(id)) return true;
    if (!perso) return false;
    return !!perso.estMonstre || perso.camp === "Ennemi" || perso.Camp === "Ennemi";
};

window.critiqueCombattant = function(perso) {
    if (!perso) return 0;
    return (parseInt(perso.Critique) || 0) + (parseInt(perso.Dev_Mod_Critique) || 0)
         + (window.atoutRace(perso).critique || 0);
};

// Le nombre de cartes qu'un héros peut mémoriser : six pour tout le monde, sept
// pour un Gob — dès la création, donc aussi une carte de plus à forger.
window.competencesMaxCombattant = function(perso) {
    if (!perso) return 6;
    const base = perso.Competences_Max !== undefined ? (parseInt(perso.Competences_Max) || 0) : 6;
    return base + (window.atoutRace(perso).competences || 0);
};

// Un peuple immunisé n'attrape jamais l'état : ni par une carte, ni par une
// zone laissée au sol.
window.estImmunise = function(perso, nomEtat) {
    const immunites = window.atoutRace(perso).immunites || [];
    return immunites.includes(nomEtat);
};

// Les soins reçus, multipliés par l'atout du peuple (Éthéré : +30 %).
window.multiplicateurSoinsRecus = function(perso) {
    return 1 + ((window.atoutRace(perso).soinsRecus || 0) / 100);
};

// Une action est magique quand son effet de base l'est — même règle que le
// moteur, qui range soins, purifications et boucliers du côté magique. La Forge
// et le combat s'appuient tous deux dessus : c'est ce qui garantit que la carte
// affiche la portée que le sort aura réellement.
window.actionEstMagique = function(nomEffetBase) {
    const n = (nomEffetBase || "").toLowerCase();
    return n.includes("magique") || n.includes("pouvoir") || n.includes("soin")
        || n.includes("guérison") || n.includes("guerison")
        || n.includes("purification") || n.includes("bouclier");
};

// Atout de l'Ondari : une case de plus pour ses sorts magiques lancés à
// distance. Le bonus s'ajoute UNE FOIS à la carte, pas une fois par cran de
// Distance posé dessus — et une action au corps à corps n'y gagne rien.
window.bonusPorteeMagique = function(perso, estMagique, aDeLaDistance) {
    if (!estMagique || !aDeLaDistance) return 0;
    return window.atoutRace(perso).porteeMagique || 0;
};

// Conversion : objet front-end -> document Firestore "Personnages" (colonnes CSV)
function frontVersPersoDoc(donnees, idPersonnage) {
  return {
    ID_Partie: donnees.idPartie || "",
    ID_Joueur: donnees.idJoueur || "",
    Camp: donnees.camp || "Allié", // 🔻 NOUVEAU
    ID_Personnage: idPersonnage,
    Couleur: donnees.couleur || "",
    Prenom_Personnage: donnees.prenom || "",
    Nom_Personnage: donnees.nom || "",
    Race: donnees.race || "",
    URL_Cloudinary: donnees.urlCloudinary || "",
    URL_Token: donnees.urlToken || "", // 🔻 NOUVEAU : Sauvegarde du Token
    Statut: donnees.statut || "Vivant",
    Age_Apparent: donnees.age || "",
    Genre: donnees.genre || "",
    Corpulence: donnees.corpulence || "",
    Taille: donnees.taille || "",
    Teint_Peau: donnees.peau || "",
    Coupe_De_Cheveux: donnees.cheveux || "",
    Yeux: donnees.yeux || "",
    Pilosite_Faciale: donnees.pilosite || "",
    Style_Vestimentaire: donnees.style || "",
    Couleurs_Dominante: donnees.couleursDom || "",
    Equipement_Visible: donnees.equipement || "",
    Signes_Distinctif: donnees.signes || "",
    Expression_Du_Visage: donnees.expression || "",
    ID_Faction: donnees.idFaction || "",
    // 🔻 NOUVEAU : On sauvegarde les états altérés ! 🔻
    Etats_Alteres: donnees.Etats_Alteres || [],
    Bouclier_Max: donnees.Bouclier_Max || 0,
    Bouclier_Actuel: donnees.Bouclier_Actuel || 0
  };
}

// =========================================================================
//  COUCHE DE DONNEES (remplace google.script.run)
// =========================================================================

// --- Mots de passe (ancien MDP_Nouvelle_Partie) ---
async function lireConfigMdp() {
  try {
    const snap = await getDoc(doc(db, COL.MDP, DOC_CONFIG_MDP));
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.error("Lecture config MDP impossible :", e);
    return {};
  }
}

async function verifierMotDePasse(saisieJoueur) {
  const cfg = await lireConfigMdp();
  const vrai = nettoyer(cfg.mdp_nouvelle_partie);
  return nettoyer(saisieJoueur) === vrai && vrai !== "";
}

async function verifierMdpParametresServeur(mdpSaisi) {
  const cfg = await lireConfigMdp();
  const vrai = nettoyer(cfg.mdp_parametres);
  return nettoyer(mdpSaisi) === vrai && vrai !== "";
}

// --- Parties (ancien Systeme_Parties) ---
async function creerNouvellePartie(nomGroupe, mdpGroupe) {
  let nouvelID = "";
  let estUnique = false;

  while (!estUnique) {
    nouvelID = "GAME_" + Math.floor(Math.random() * 100000);
    const snap = await getDoc(doc(db, COL.PARTIES, nouvelID));
    estUnique = !snap.exists();
  }

  await setDoc(doc(db, COL.PARTIES, nouvelID), {
    ID_Partie: nouvelID,
    Mot_De_Passe: mdpGroupe,
    Liste_ID_Personnage: "",
    Nom_Du_Groupe: nomGroupe,
    Statut: "En_cours"
  });

  return nouvelID;
}

async function recupererPartiesEnCours() {
  const q = query(collection(db, COL.PARTIES), where("Statut", "==", "En_cours"));
  const snap = await getDocs(q);
  const parties = [];
  snap.forEach((document) => {
    const d = document.data();
    parties.push({ id: d.ID_Partie || document.id, nom: d.Nom_Du_Groupe || "" });
  });
  return parties;
}

async function verifierMotDePassePartie(idPartie, mdpSaisi) {
  const snap = await getDoc(doc(db, COL.PARTIES, idPartie));
  if (!snap.exists()) return false;
  return nettoyer(snap.data().Mot_De_Passe) === nettoyer(mdpSaisi);
}

// --- Factions (menu deroulant) ---
async function recupererFactionsPourSelect() {
  const snap = await getDocs(collection(db, COL.FACTIONS));
  const factions = [];
  snap.forEach((document) => {
    const d = document.data();
    if (d.Nom_Faction) {
      factions.push({ id: d.ID_Faction || document.id, nom: d.Nom_Faction });
    }
  });
  return factions;
}

// --- Cerveau IA (instructions) ---
async function recupererInstructionsIA() {
  const snap = await getDocs(collection(db, COL.CERVEAU_IA));
  const liste = [];
  snap.forEach((document) => {
    const d = document.data();
    liste.push({
      id: d.ID_Instruction || document.id,
      titre: d.Titre_Menu || "",
      contenu: d.Contenu_Direct || "",
      statut: d.Statut_Actif || "off"
    });
  });
  return liste;
}

async function basculerStatutInstructionIA(idInstruction, nouveauStatut) {
  await updateDoc(doc(db, COL.CERVEAU_IA, idInstruction), { Statut_Actif: nouveauStatut });
  return true;
}

async function sauvegarderInstructionIA(id, titre, contenu) {
  if (id && id !== "") {
    await updateDoc(doc(db, COL.CERVEAU_IA, id), { Titre_Menu: titre, Contenu_Direct: contenu });
  } else {
    const nouvelID = "INST_" + Math.floor(Math.random() * 100000);
    await setDoc(doc(db, COL.CERVEAU_IA, nouvelID), {
      ID_Instruction: nouvelID,
      Titre_Menu: titre,
      Contenu_Direct: contenu,
      Statut_Actif: "on"
    });
  }
  return true;
}

async function supprimerInstructionIA(idInstruction) {
  if (!idInstruction) return false;
  await deleteDoc(doc(db, COL.CERVEAU_IA, idInstruction));
  return true;
}

// --- Personnages (ancien Descriptif_Personnage) ---
async function recupererDetailsPersonnage(idPersonnage) {
  if (!idPersonnage) return null;
  const snap = await getDoc(doc(db, COL.PERSONNAGES, idPersonnage));
  if (!snap.exists()) return null;
  return persoDocVersFront(snap.id, snap.data());
}

async function sauvegarderFichePersonnage(donnees, skipImage = false) {
  let idPersonnage = donnees.idPersonnage;
  const estNouveau = (!idPersonnage || idPersonnage === "");

  if (estNouveau) {
    idPersonnage = "PERSO_" + Math.floor(Math.random() * 1000000);
    donnees.statut = "Vivant";
  }

  if (!skipImage) {
    donnees.urlCloudinary = await genererEtStockerPortrait(donnees);
  } else {
    donnees.urlCloudinary = "";
    console.log("🛠️ [DEV] Génération d'image ignorée avec succès.");
  }

  const docData = frontVersPersoDoc(donnees, idPersonnage);
  await setDoc(doc(db, COL.PERSONNAGES, idPersonnage), docData);

  // =========================================================
  // CORRECTION : AJOUT AUTOMATIQUE À L'INITIATIVE 
  // =========================================================
  if (estNouveau && donnees.idPartie) {
      try {
          const partieRef = doc(db, COL.PARTIES, donnees.idPartie);
          const partieSnap = await getDoc(partieRef);
          if (partieSnap.exists()) {
              const dataPartie = partieSnap.data();
              let ordre = dataPartie.Ordre_Initiative || [];
              if (!ordre.includes(idPersonnage)) {
                  ordre.push(idPersonnage);
                  await updateDoc(partieRef, { Ordre_Initiative: ordre });
                  console.log("✔️ Héros ajouté à l'ordre d'initiative.");
              }
          }
      } catch (e) {
          console.error("Erreur lors de l'ajout à l'initiative:", e);
      }
  }
  // =========================================================

  // 🔻 NOUVEAU : On lance la génération du token top-down en arrière-plan ! 🔻
  // Note : On ne met pas de "await" devant, pour libérer l'écran du joueur tout de suite.
  if (!skipImage && donnees.urlCloudinary !== "") {
      genererEtStockerTokenBackground(donnees, idPersonnage, donnees.urlCloudinary).catch(e => console.error(e));
  }

  return { id: idPersonnage, url: donnees.urlCloudinary || "" };
}

async function supprimerPersonnageBDD(idPersonnage) {
  if (!idPersonnage) return false;

  console.log(`🧹 [Nettoyage] Effacement total de ${idPersonnage}...`);

  // On lit la fiche AVANT de l'effacer : c'est elle qui porte sa partie et
  // l'adresse de ses images.
  let data = null;
  try {
      const snapPerso = await getDoc(doc(db, COL.PERSONNAGES, idPersonnage));
      if (snapPerso.exists()) data = snapPerso.data();
  } catch (e) {
      console.error("Lecture de la fiche avant suppression :", e);
  }

  // Les parties à nettoyer : celle de la fiche ET celle ouverte à l'écran. Les
  // deux diffèrent quand on efface un héros depuis le menu principal — c'est ce
  // qui laissait son nom dans l'ordre d'initiative d'une partie pour toujours,
  // et les créatures l'attendaient au moment de choisir leurs cartes.
  const parties = new Set();
  if (data && data.ID_Partie) parties.add(data.ID_Partie);
  if (window.ID_PARTIE_COURANTE) parties.add(window.ID_PARTIE_COURANTE);

  for (const idPartie of parties) {
      // 1. Ordre d'initiative et file d'attente du combat.
      try {
          const partieRef = doc(db, COL.PARTIES, idPartie);
          const partieSnap = await getDoc(partieRef);
          if (partieSnap.exists()) {
              const dataPartie = partieSnap.data();
              const ordre = dataPartie.Ordre_Initiative || [];
              const file = dataPartie.File_Attente_Combat || [];

              if (ordre.includes(idPersonnage) || file.some(f => f.idPersonnage === idPersonnage)) {
                  const nouvelOrdre = ordre.filter(id => id !== idPersonnage);
                  const nouvelleFile = file.filter(f => f.idPersonnage !== idPersonnage);
                  let phase = dataPartie.Phase_Combat || "Preparation";

                  const nbRestants = nouvelOrdre.filter(id => {
                      const p = (window.PERSOS_PARTIE || []).find(perso => perso.idPersonnage === id);
                      return p && p.statut !== "Mort";
                  }).length;
                  if (phase === "Preparation" && nouvelleFile.length >= nbRestants && nbRestants > 0) {
                      phase = "Resolution";
                  }

                  await updateDoc(partieRef, {
                      Ordre_Initiative: nouvelOrdre,
                      File_Attente_Combat: nouvelleFile,
                      Phase_Combat: phase
                  });
                  console.log(`   ✔️ Retiré de l'initiative de ${idPartie}.`);
              }
          }
      } catch (e) {
          console.error("Nettoyage de l'initiative :", e);
      }

      // 2. Son pion sur le plateau, et les zones persistantes qu'il a posées :
      //    sans ça son jeton restait à sa case et ses flaques continuaient de
      //    brûler ceux qui passaient dessus.
      try {
          const vttRef = doc(db, "Combat_VTT", idPartie);
          const vttSnap = await getDoc(vttRef);
          if (vttSnap.exists()) {
              const maj = { ["Tokens." + idPersonnage]: deleteField() };
              const zones = vttSnap.data().Zones_Persistantes || {};
              const zonesRestantes = {};
              let zonesRetirees = 0;
              Object.keys(zones).forEach(cle => {
                  if (zones[cle] && zones[cle].idLanceur === idPersonnage) zonesRetirees++;
                  else zonesRestantes[cle] = zones[cle];
              });
              if (zonesRetirees > 0) maj.Zones_Persistantes = zonesRestantes;
              await updateDoc(vttRef, maj);
              if (zonesRetirees > 0) console.log(`   ✔️ ${zonesRetirees} zone(s) persistante(s) effacée(s).`);
              console.log(`   ✔️ Pion retiré du plateau de ${idPartie}.`);
          }
      } catch (e) {
          console.error("Nettoyage du plateau :", e);
      }
  }

  // 3. Ses illusions : ce sont des personnages à part entière en base, qui ne
  //    servent plus à rien une fois leur créateur effacé.
  try {
      const snapIllusions = await getDocs(query(collection(db, COL.PERSONNAGES), where("Est_Illusion", "==", true)));
      const prenom = (data && (data.Prenom_Personnage || "")).trim();
      for (const docIllusion of snapIllusions.docs) {
          const di = docIllusion.data();
          const memeCreateur = di.ID_Lanceur === idPersonnage
              || (!di.ID_Lanceur && prenom && (di.Nom_Personnage || "").trim() === prenom);
          if (!memeCreateur) continue;
          await deleteDoc(doc(db, COL.PERSONNAGES, docIllusion.id)).catch(e => console.error(e));
          if (di.ID_Partie) {
              await updateDoc(doc(db, "Combat_VTT", di.ID_Partie), {
                  ["Tokens." + docIllusion.id]: deleteField()
              }).catch(() => {});
          }
          console.log(`   ✔️ Illusion ${docIllusion.id} effacée.`);
      }
  } catch (e) {
      console.error("Nettoyage des illusions :", e);
  }

  // 4. Sa sous-collection "Competences" : Firestore ne l'emporte PAS avec le
  //    document parent, elle survivrait en orpheline.
  try {
      const snapComp = await getDocs(query(collection(db, COL.PERSONNAGES, idPersonnage, "Competences")));
      if (!snapComp.empty) {
          const lot = writeBatch(db);
          snapComp.forEach(docComp => lot.delete(doc(db, COL.PERSONNAGES, idPersonnage, "Competences", docComp.id)));
          await lot.commit();
          console.log(`   ✔️ ${snapComp.size} compétence(s) effacée(s).`);
      }
  } catch (e) {
      console.error("Nettoyage des compétences :", e);
  }

  // 5. Ses caractéristiques, puis sa fiche.
  try {
      await deleteDoc(doc(db, COL.CARACTERISTIQUES, idPersonnage));
      console.log("   ✔️ Caractéristiques effacées.");
  } catch (e) {
      console.error("Suppression des caractéristiques :", e);
  }

  let ficheEffacee = false;
  try {
      await deleteDoc(doc(db, COL.PERSONNAGES, idPersonnage));
      ficheEffacee = true;
      console.log("   ✔️ Fiche effacée.");
  } catch (e) {
      console.error("Suppression de la fiche :", e);
  }

  // 6. Ses images sur Cloudinary : le portrait et le pion tactique. Sans les
  //    clés Cloudinary en réglages, la fonction ne fait rien — on le dit, plutôt
  //    que de laisser croire que tout est parti.
  if (data && typeof window.supprimerImageCloudinary === "function") {
      const aLesCles = !!localStorage.getItem("ivalis_CLOUDINARY_API_SECRET");
      const images = [data.URL_Cloudinary, data.URL_Token].filter(Boolean);
      if (images.length > 0 && !aLesCles) {
          console.warn("   ⚠️ Images Cloudinary conservées : clés API absentes des réglages.");
      }
      for (const url of images) {
          await window.supprimerImageCloudinary(url).catch(e => console.error(e));
      }
  }

  // 7. Ce qu'il laissait derrière lui dans CE navigateur.
  try {
      localStorage.removeItem("ivalis_perso_" + idPersonnage);
      if (window.SOURCE_COMBATTANTS) delete window.SOURCE_COMBATTANTS[idPersonnage];
      if (window.TOKENS_VTT_DATA) delete window.TOKENS_VTT_DATA[idPersonnage];
      if (window.CACHE_COMPETENCES_GLOBAL) delete window.CACHE_COMPETENCES_GLOBAL[idPersonnage];
      if (Array.isArray(window.PERSOS_PARTIE)) {
          window.PERSOS_PARTIE = window.PERSOS_PARTIE.filter(p => p.idPersonnage !== idPersonnage);
      }
      if (Array.isArray(window.PERSOS_JOUEURS_PARTIE)) {
          window.PERSOS_JOUEURS_PARTIE = window.PERSOS_JOUEURS_PARTIE.filter(p => p.idPersonnage !== idPersonnage);
      }
      if (typeof window.appliquerTokensVTT === "function" && window.TOKENS_VTT_DATA) {
          window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
      }
      if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();
  } catch (e) {
      console.error("Nettoyage local :", e);
  }

  console.log(ficheEffacee ? "🧹 [Nettoyage] Terminé." : "🧹 [Nettoyage] Terminé, mais la fiche n'a pas pu être effacée.");
  return ficheEffacee;
}

// =========================================================================
//  CLES API (stockees dans le localStorage du navigateur - projet prive)
// =========================================================================
const CLES_LS = {
  gemini: "ivalis_GEMINI_API_KEY", // <-- Ajout de Gemini
  openai: "ivalis_OPENAI_API_KEY",
  cloudName: "ivalis_CLOUDINARY_CLOUD_NAME",
  cloudKey: "ivalis_CLOUDINARY_API_KEY",
  cloudSecret: "ivalis_CLOUDINARY_API_SECRET"
};

function lireClesApi() {
  return {
    gemini: (localStorage.getItem(CLES_LS.gemini) || "").trim(),
    openai: (localStorage.getItem(CLES_LS.openai) || "").trim(),
    cloudName: (localStorage.getItem(CLES_LS.cloudName) || "").trim(),
    cloudKey: (localStorage.getItem(CLES_LS.cloudKey) || "").trim(),
    cloudSecret: (localStorage.getItem(CLES_LS.cloudSecret) || "").trim()
  };
}

function prefillClesApi() {
  const cles = lireClesApi();
  document.getElementById("cle-gemini").value = cles.gemini;
  document.getElementById("cle-openai").value = cles.openai;
  document.getElementById("cle-cloud-name").value = cles.cloudName;
  document.getElementById("cle-cloud-key").value = cles.cloudKey;
  document.getElementById("cle-cloud-secret").value = cles.cloudSecret;
}

function ouvrirClesApi(idFenetreSortante) {
  prefillClesApi();
  const msg = document.getElementById("msg-cles-api");
  if (msg) msg.style.opacity = "0";
  if (idFenetreSortante) naviguerFenetre(idFenetreSortante, "etape-cles-api");
}

function sauvegarderClesApi() {
  localStorage.setItem(CLES_LS.gemini, document.getElementById("cle-gemini").value.trim());
  localStorage.setItem(CLES_LS.openai, document.getElementById("cle-openai").value.trim());
  localStorage.setItem(CLES_LS.cloudName, document.getElementById("cle-cloud-name").value.trim());
  localStorage.setItem(CLES_LS.cloudKey, document.getElementById("cle-cloud-key").value.trim());
  localStorage.setItem(CLES_LS.cloudSecret, document.getElementById("cle-cloud-secret").value.trim());

  afficherMessageClesApi("Clés enregistrées dans ce navigateur.", false);
}

function basculerAffichageCles(afficher) {
  const type = afficher ? "text" : "password";
  ["cle-gemini", "cle-openai", "cle-cloud-name", "cle-cloud-key", "cle-cloud-secret"].forEach((id) => {
    document.getElementById(id).type = type;
  });
}

function afficherMessageClesApi(texte, estErreur) {
  const msg = document.getElementById("msg-cles-api");
  if (!msg) return;
  msg.style.color = estErreur ? "#c0392b" : "#1b6e3a";
  msg.innerText = texte;
  msg.style.opacity = "1";
  setTimeout(() => { msg.style.opacity = "0"; }, 3500);
}

// --- IMPORT / EXPORT DES CLES API (fichier JSON local, pratique sur iPad) ---
function creerFichierExempleClesApi() {
  const exemple = {
    GEMINI_API_KEY: "",
    OPENAI_API_KEY: "",
    CLOUDINARY_CLOUD_NAME: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: ""
  };
  const blob = new Blob([JSON.stringify(exemple, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = "ivalis-cles-api.json";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);

  afficherMessageClesApi("Fichier exemple téléchargé.", false);
}

function importerFichierClesApi(evenement) {
  const fichier = evenement.target.files && evenement.target.files[0];
  evenement.target.value = ""; // Permet de réimporter le même fichier plusieurs fois de suite

  if (!fichier) return;

  const lecteur = new FileReader();
  lecteur.onload = () => {
    try {
      const donnees = JSON.parse(lecteur.result);

      document.getElementById("cle-gemini").value = (donnees.GEMINI_API_KEY || "").trim();
      document.getElementById("cle-openai").value = (donnees.OPENAI_API_KEY || "").trim();
      document.getElementById("cle-cloud-name").value = (donnees.CLOUDINARY_CLOUD_NAME || "").trim();
      document.getElementById("cle-cloud-key").value = (donnees.CLOUDINARY_API_KEY || "").trim();
      document.getElementById("cle-cloud-secret").value = (donnees.CLOUDINARY_API_SECRET || "").trim();

      afficherMessageClesApi("Champs remplis depuis le fichier. Vérifie puis clique sur Sauvegarder.", false);
    } catch (e) {
      afficherMessageClesApi("Fichier illisible : vérifie que c'est bien le JSON exporté.", true);
    }
  };
  lecteur.onerror = () => afficherMessageClesApi("Impossible de lire ce fichier.", true);
  lecteur.readAsText(fichier);
}

// --- ALERTE UI : cles manquantes ---
function afficherAlerteCles(message) {
  const txt = document.getElementById("texte-alerte-cles");
  if (txt && message) txt.innerText = message;
  document.getElementById("overlay-alerte-cles").style.display = "block";
  document.getElementById("modale-alerte-cles").style.display = "block";
}

function fermerAlerteCles() {
  document.getElementById("overlay-alerte-cles").style.display = "none";
  document.getElementById("modale-alerte-cles").style.display = "none";
}

function ouvrirParametresDepuisAlerte() {
  fermerAlerteCles();
  if (estPanneauParametresOuvert()) return;
  fermerToutPersonnages(true);
  ouvrirParametres();
}

// =========================================================================
//  GENERATION D'IMAGE 100% FRONT-END (OpenAI -> Cloudinary)
//  Algorithme repris de brouillon_backend_images.js, adapte au navigateur :
//   - cles lues dans le localStorage
//   - signature Cloudinary via l'API Web Crypto (SHA-1)
//   - directive de style lue dans Firestore (Cerveau_IA/INST_76839)
// =========================================================================
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sha1Hex(message) {
  const data = new TextEncoder().encode(message);
  const buffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function recupererInstructionStyle() {
  try {
    const snap = await getDoc(doc(db, COL.CERVEAU_IA, "INST_76839"));
    if (snap.exists()) return snap.data().Contenu_Direct || "";
  } catch (e) {
    console.error("Lecture Cerveau_IA/INST_76839 impossible :", e);
  }
  return "";
}

// =========================================================================
//  OUTIL : DÉTOURAGE MAGIQUE SUR FOND MAGENTA (L'ULTIME COMBO 3 ÉTAPES)
// =========================================================================
async function detourerFondMagenta(imageSource) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Permet de manipuler l'image
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const w = canvas.width;
                const h = canvas.height;
                
                const isBg = new Uint8Array(w * h);
                
                // ===============================================================
                // ÉTAPE 1 : LE POT DE PEINTURE CLASSIQUE (Depuis les bords)
                // ===============================================================
                // Il ronge tout le décor massif en s'arrêtant aux contours du personnage.
                const stack = [];
                for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
                for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + (w - 1)); }
                
                while (stack.length > 0) {
                    const idx = stack.pop();
                    if (isBg[idx] === 1) continue;
                    
                    const p = idx * 4;
                    const r = data[p], g = data[p+1], b = data[p+2];
                    
                    // Assez tolérant car on est sûr d'être à l'extérieur du héros
                    if (r > 120 && b > 120 && r > g * 1.2 && b > g * 1.2) {
                        data[p+3] = 0; 
                        isBg[idx] = 1; 
                        
                        const x = idx % w;
                        const y = Math.floor(idx / w);
                        if (x > 0 && isBg[idx - 1] === 0) stack.push(idx - 1);
                        if (x < w - 1 && isBg[idx + 1] === 0) stack.push(idx + 1);
                        if (y > 0 && isBg[idx - w] === 0) stack.push(idx - w);
                        if (y < h - 1 && isBg[idx + w] === 0) stack.push(idx + w);
                    }
                }
                
                // ===============================================================
                // ÉTAPE 2 : LE POT DE PEINTURE INTERNE (Pour les trous dans les cheveux)
                // ===============================================================
                // C'est ton idée : on scanne l'intérieur et on est très strict.
                for (let idx = 0; idx < w * h; idx++) {
                    if (isBg[idx] === 0) { // On ne regarde que ce que l'étape 1 a laissé
                        const p = idx * 4;
                        const r = data[p], g = data[p+1], b = data[p+2];
                        
                        // Ratio ultra-strict pour protéger la veste violette
                        if (r > 150 && b > 150 && g < 90 && r > g * 1.6 && b > g * 1.6) {
                            data[p+3] = 0;
                            isBg[idx] = 1;
                        }
                    }
                }
                
                // ===============================================================
                // ÉTAPE 3 : ÉROSION ET LISSAGE (Les 4 vagues)
                // ===============================================================
                const alphas = [0, 15, 60, 140, 220];
                
                for (let passe = 1; passe <= 4; passe++) {
                    const nextBg = new Uint8Array(isBg);
                    
                    for (let idx = 0; idx < w * h; idx++) {
                        if (isBg[idx] === 0) { // Si c'est un pixel du personnage
                            const x = idx % w;
                            const y = Math.floor(idx / w);
                            let toucheVide = false;
                            
                            // On cherche si un de ses voisins directs a été effacé
                            if (x > 0 && isBg[idx - 1] === 1) toucheVide = true;
                            else if (x < w - 1 && isBg[idx + 1] === 1) toucheVide = true;
                            else if (y > 0 && isBg[idx - w] === 1) toucheVide = true;
                            else if (y < h - 1 && isBg[idx + w] === 1) toucheVide = true;
                            
                            if (toucheVide) {
                                nextBg[idx] = 2; // Ce pixel servira de frontière à la vague suivante
                                const p = idx * 4;
                                const r = data[p], g = data[p+1], b = data[p+2];
                                
                                // Lissage colorimétrique (on grise le reflet rose)
                                if (r > g * 1.05 && b > g * 1.05) {
                                    data[p] = g;
                                    data[p+2] = g;
                                }
                                
                                // Application de la transparence de la vague en cours
                                data[p+3] = Math.min(data[p+3], alphas[passe]);
                            }
                        }
                    }
                    
                    // La vague avance d'un pixel vers l'intérieur
                    for (let idx = 0; idx < w * h; idx++) {
                        if (nextBg[idx] === 2) isBg[idx] = 1;
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL("image/png"));
                
            } catch (e) {
                console.warn("⚠️ Détourage annulé (blocage de sécurité CORS).");
                resolve(imageSource); 
            }
        };
        img.onerror = () => resolve(imageSource);
        img.src = imageSource;
    });
}

// =========================================================================
//  GÉNÉRATION DU PION TACTIQUE (VUE DE DESSUS) EN ARRIÈRE-PLAN
// =========================================================================

// Réécrit une URL Cloudinary pour forcer une livraison PNG.
// f_auto peut renvoyer de l'AVIF, format refusé par l'API d'édition d'images.
function urlCloudinaryEnPng(url) {
    const marqueur = "/upload/";
    const position = url.indexOf(marqueur);
    if (position === -1) return url;

    const base = url.slice(0, position + marqueur.length);
    const segments = url.slice(position + marqueur.length).split("/");

    const premier = segments[0];
    const estTransformation = segments.length > 1 && premier.includes("_") && !premier.includes(".") && !/^v\d+$/.test(premier);
    if (estTransformation) segments.shift();

    return base + "f_png/" + segments.join("/");
}

// Insère une largeur maximale dans une URL Cloudinary (c_limit ne fait que réduire, jamais
// agrandir). Évite à l'iPad de télécharger/décoder des images bien plus grandes que ce qui
// est réellement affiché à l'écran (portraits, fonds de carte de combat générés en 1024px+).
function redimensionnerImageCloudinary(url, largeurMax) {
    if (!url) return url;
    const marqueur = "/upload/";
    const position = url.indexOf(marqueur);
    if (position === -1) return url;

    const base = url.slice(0, position + marqueur.length);
    const segments = url.slice(position + marqueur.length).split("/");

    const premier = segments[0];
    const estTransformation = segments.length > 1 && premier.includes("_") && !premier.includes(".") && !/^v\d+$/.test(premier);

    if (estTransformation) {
        segments[0] = `w_${largeurMax},c_limit,` + premier;
    } else {
        segments.unshift(`w_${largeurMax},c_limit`);
    }

    return base + segments.join("/");
}
window.redimensionnerImageCloudinary = redimensionnerImageCloudinary;

// Prépare le portrait pour l'envoi binaire : PNG carré de 1024px sur fond magenta.
async function portraitVersBlobPng(urlPortrait) {
    const urlSource = urlCloudinaryEnPng(urlPortrait);

    const blobCanvas = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const cote = 1024;
                const canvas = document.createElement("canvas");
                canvas.width = cote;
                canvas.height = cote;
                const ctx = canvas.getContext("2d");

                ctx.fillStyle = "#FF00FF";
                ctx.fillRect(0, 0, cote, cote);

                const echelle = Math.min(cote / img.width, cote / img.height);
                const largeur = img.width * echelle;
                const hauteur = img.height * echelle;
                ctx.drawImage(img, (cote - largeur) / 2, (cote - hauteur) / 2, largeur, hauteur);

                canvas.toBlob((b) => resolve(b), "image/png");
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = urlSource;
    });

    if (blobCanvas) return blobCanvas;

    try {
        const reponse = await fetch(urlSource);
        return await reponse.blob();
    } catch (e) {
        console.error("🚁 [Token] Téléchargement du portrait impossible :", e);
        return null;
    }
}

// Fonction silencieuse qui tourne en arrière-plan
async function genererEtStockerTokenBackground(donnees, idPersonnage, urlPortrait) {
    console.log("🚁 [Token] Lancement de la génération du pion tactique...");
    const cles = lireClesApi();
    if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return false;

    // L'image de référence est envoyée en binaire : une URL dans le prompt est ignorée par le modèle.
    const blobPortrait = await portraitVersBlobPng(urlPortrait);
    if (!blobPortrait) {
        console.error("🚁 [Token] Échec : portrait de référence illisible.");
        return false;
    }

    const promptText = "A detailed photograph of a circular hand-carved high-relief wooden plaque medallion, featuring only the head of the character from the provided " +
                       "reference image — a close-up head shot, not the bust or full body — rendered in meticulously sculpted detail. The head emerges from the " +
                       "central field with deep undercuts for a powerful three-dimensional effect, matching the exact facial features, head shape and any " +
                       "head-attached details (horns, ears, hair, headwear) of the reference character. The head is fully contained within the medallion's central " +
                       "circular field, filling it closely, never overflowing past its inner border. The outer rim of the medallion carries a fine, delicate thin line of gold gilding traced along its circular edge. " +
                       "The entire piece is crafted from a rich, medium-toned hardwood, like aged walnut, " +
                       "with a tactile, oiled finish. Visible wood grain patterns and fine, authentic chisel marks are present across all surfaces. " +
                       "The head's hair, headwear and specific details (like jewelry or facial textures) are faithfully translated into sculpted wood forms, matching the depth " +
                       "and detail level of the reference. The background is a clean, isolated pure fluorescent magenta (#FF00FF), used as a chroma key backdrop, " +
                       "with absolutely no cast shadows or drop shadows. " +
                       "The lighting is precise, studio-quality, enhancing the forms and textures, identical in quality to the reference image. " +
                       "The image must be in a perfectly square format, with the medallion token scaled as large as possible while leaving a small margin from the edges. " +
                       "The entire medallion, including any protruding details such as horns, ears or headwear, must be fully visible inside the frame — " +
                       "nothing may be cropped or cut off by the image border.";

    // input_fidelity est ignoré par gpt-image-2 (déjà haute fidélité) mais indispensable aux modèles précédents.
    const modelesCandidats = [
        { model: "gpt-image-2" },
        { model: "gpt-image-1.5", input_fidelity: "high" },
        { model: "gpt-image-1", input_fidelity: "high" }
    ];

    let jsonOpenAI = null;
    const delais = [5000, 15000, 30000];

    for (const candidat of modelesCandidats) {
        let tentative = 0;

        while (tentative < 3) {
            const form = new FormData();
            form.append("model", candidat.model);
            form.append("prompt", promptText);
            form.append("image", blobPortrait, "portrait.png");
            form.append("n", "1");
            form.append("size", "1024x1024");
            form.append("quality", "low");
            form.append("output_format", "png");
            if (candidat.input_fidelity) form.append("input_fidelity", candidat.input_fidelity);

            let statut = 0;
            let rawText = "";

            try {
                // Aucun en-tête Content-Type : le navigateur génère lui-même la frontière multipart.
                const reponse = await fetch("https://api.openai.com/v1/images/edits", {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + cles.openai },
                    body: form
                });
                statut = reponse.status;
                rawText = await reponse.text();
            } catch (e) {
                console.error("❌ [Token] Erreur réseau :", e);
                tentative++;
                continue;
            }

            console.log(`🚁 [Token] ${candidat.model} → HTTP ${statut}`);

            if (statut === 429 || rawText.includes("error code: 1015") || rawText.includes("Rate Limited")) {
                console.warn("🚁 [Token] Rate limit. Nouvelle tentative dans " + (delais[tentative] / 1000) + "s...");
                await new Promise(r => setTimeout(r, delais[tentative]));
                tentative++;
                continue;
            }

            if (statut === 404 || rawText.includes("model_not_found") || rawText.includes("does not support")) {
                console.warn(`🚁 [Token] ${candidat.model} indisponible pour l'édition, essai du modèle suivant...`);
                break;
            }

            if (statut < 200 || statut >= 300) {
                console.error("❌ [Token] ERREUR HTTP OPENAI :", statut, rawText);
                break;
            }

            try {
                jsonOpenAI = JSON.parse(rawText);
            } catch (e) {
                console.error("❌ [Token] Réponse illisible :", e);
            }
            break;
        }

        if (jsonOpenAI) break;
    }

    if (!jsonOpenAI || !jsonOpenAI.data || jsonOpenAI.data.length === 0) {
        console.error("🚁 [Token] Échec : Aucune image retournée par l'API.");
        return false;
    }

    // Récupération de l'image (format standard)
    let imageSource = jsonOpenAI.data[0].url || ("data:image/png;base64," + jsonOpenAI.data[0].b64_json);

    // =========================================================================
    // PASSAGE PAR CLOUDINARY (POUR DÉTOURAGE MAGENTA)
    // =========================================================================
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dossier = "Tokens"; 

    let signature1 = await sha1Hex(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);
    let form1 = new FormData();
    form1.append("file", imageSource); form1.append("api_key", cles.cloudKey);
    form1.append("timestamp", timestamp); form1.append("signature", signature1); form1.append("folder", dossier);

    let urlSecurisee = imageSource;
    let publicIdAecraser = null;

    try {
        const res1 = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form1 });
        const json1 = await res1.json();
        if (json1.secure_url) {
            urlSecurisee = json1.secure_url;
            publicIdAecraser = json1.public_id;
        }
    } catch (e) {}

    let imageDetoureeBase64 = await detourerFondMagenta(urlSecurisee);

    let stringToSign2 = publicIdAecraser 
        ? `public_id=${publicIdAecraser}&timestamp=${timestamp}${cles.cloudSecret}`
        : `folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`;
    
    let signature2 = await sha1Hex(stringToSign2);
    let form2 = new FormData();
    form2.append("file", imageDetoureeBase64); form2.append("api_key", cles.cloudKey);
    form2.append("timestamp", timestamp); form2.append("signature", signature2);
    if (publicIdAecraser) form2.append("public_id", publicIdAecraser);
    else form2.append("folder", dossier);

    try {
        const res2 = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form2 });
        const json2 = await res2.json();
        if (json2.secure_url) {
            const finalTokenUrl = json2.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
            console.log("✅ [Token] Pion généré avec succès !");
            
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            await updateDoc(doc(db, "Personnages", idPersonnage), {
                URL_Token: finalTokenUrl
            });
            return true;
        }
    } catch (e) {}
    
    return false;
}

async function genererEtStockerPortrait(donnees) {
  // 1. Lecture des cles dans le localStorage
  const cles = lireClesApi();
  if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) {
    afficherAlerteCles("Veuillez renseigner vos clés API dans les paramètres.");
    return donnees.urlCloudinary || "";
  }

  console.log("=== DEBUT DE LA GENERATION (gpt-image) ===");

  // 2. Instruction de style additionnelle (Firestore)
  const instructionSupplementaire = await recupererInstructionStyle();

  // 2.bis Récupération du descriptif physique de la race depuis le Grimoire (Firestore)
  let loreRace = "";
  if (donnees.race !== "Humain") {
      try {
          const qRace = query(collection(db, "Monde_Races"));
          const snapRace = await getDocs(qRace);
          
          // Fonction pour ignorer les majuscules et les accents lors de la recherche
          const normaliser = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const nomCherche = normaliser(donnees.race);

          snapRace.forEach(doc => {
              const dataRace = doc.data();
              if (dataRace.Nom && normaliser(dataRace.Nom).includes(nomCherche)) {
                  loreRace = dataRace.Descriptif_Physique || "";
              }
          });
      } catch (e) {
          console.error("Erreur récupération du lore de la race :", e);
      }
  }

  // 3. Construction des spécificités uniques du Héros
  let descriptionHero = `Il s'agit d'un héros de race ${donnees.race} et de genre ${donnees.genre}, d'âge apparent : ${donnees.age}. `;
  
  if (donnees.corpulence) descriptionHero += `Sa corpulence est ${donnees.corpulence}. `;
  if (donnees.peau) descriptionHero += `Son teint de peau (ou carapace) est ${donnees.peau}. `;
  if (donnees.cheveux) descriptionHero += `Ses cheveux sont ${donnees.cheveux}. `;
  if (donnees.yeux) descriptionHero += `Ses yeux sont ${donnees.yeux}. `;
  if (donnees.pilosite) descriptionHero += `Pilosité faciale : ${donnees.pilosite}. `;
  if (donnees.expression) descriptionHero += `Son visage porte l'expression suivante : ${donnees.expression}. `;
  if (donnees.signes) descriptionHero += `Signes distinctifs et accessoires : ${donnees.signes}. `;
  if (donnees.style) descriptionHero += `Il est vêtu ainsi : ${donnees.style}. `;
  if (donnees.couleursDom) descriptionHero += `Couleurs dominantes de la tenue : ${donnees.couleursDom}. `;
  
  // --- Ajouts des spécificités de race ---
  if (donnees.ecailles) descriptionHero += `Ses écailles sont de couleur ${donnees.ecailles}. `;
  if (donnees.aretes) descriptionHero += `Taille de ses arêtes dorsales : ${donnees.aretes}. `;
  if (donnees.pelage) descriptionHero += `Son pelage est de couleur ${donnees.pelage}. `;
  if (donnees.cornes) descriptionHero += `Taille de ses cornes : ${donnees.cornes}. `;
  if (donnees.champignons) descriptionHero += `Maturité des champignons sur son corps : ${donnees.champignons}. `;
  if (donnees.ecorce) descriptionHero += `Croissance de son écorce corporelle : ${donnees.ecorce}. `;
  if (donnees.peauGob) descriptionHero += `Sa peau est de couleur ${donnees.peauGob}. `;
  if (donnees.oreilles) descriptionHero += `Taille de ses oreilles : ${donnees.oreilles}. `;
  if (donnees.masque) descriptionHero += `Il porte un masque : ${donnees.masque}. `;
  if (donnees.colonne) descriptionHero += `Taille des os apparents de sa colonne vertébrale : ${donnees.colonne}. `;

  // 4. Assemblage final du Prompt pondéré
  let promptOpenAI = "Contexte de l'univers : Antique Fantastique (Mythic Ancient Fantasy, Antiquité Magique).\n\n";
  
  // Si on a trouvé un descriptif dans la base de données, on définit l'anatomie de base
  if (loreRace !== "") {
      promptOpenAI += "--- ANATOMIE DE BASE DE L'ESPÈCE ---\n" +
                      loreRace + "\n\n";
  }

  // On injecte les choix du joueur en lui donnant le statut de priorité absolue
  promptOpenAI += "--- SPÉCIFICITÉS UNIQUES DU PERSONNAGE (TRÈS IMPORTANT, PRIORITAIRE SUR L'ANATOMIE DE BASE) ---\n" +
                  descriptionHero + "\n\n" +
                  "Directives de style artistique obligatoires : " + instructionSupplementaire + "\n\n" +
                  "🛑 RÈGLE TECHNIQUE DÉFINITIVE (PRIORITAIRE SUR TOUT LE RESTE) : " +
                  "Le personnage DOIT ÊTRE PLACÉ SUR UN FOND TOTALEMENT MAGENTA FLUO UNI (#FF00FF). " +
                  "Il est STRICTEMENT INTERDIT de dessiner un décor, un paysage, un intérieur, une ombre au sol ou un dégradé. " +
                  "Même si la description du personnage mentionne un lieu ou des objets environnants, IGNORE LE DÉCOR. " +
                  "Remplis tout l'espace vide autour et derrière le personnage avec du magenta fluo pur. " +
                  "Le personnage doit être vu de trois quart, regardant vers la gauche, cadré en plan américain (coupé aux genoux). Ne dessine aucun texte.";

  // 4. Appel a l'API OpenAI (Retour sur gpt-image-2 sans base64)
  const urlOpenAI = "https://api.openai.com/v1/images/generations";
  const payloadOpenAI = {
    model: "gpt-image-2",
    prompt: promptOpenAI,
    output_format: "png", // On demande du PNG pour la transparence
    n: 1,
    size: "1024x1792",
    quality: "medium",
    moderation: "low"
  };

  const optionsOpenAI = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + cles.openai
    },
    body: JSON.stringify(payloadOpenAI)
  };

  // --- Systeme belier (anti-spam 1015) : 3 tentatives 5s / 15s / 30s ---
  let tentative = 0;
  let succes = false;
  let texteReponseOpenAI = "";
  const delais = [5000, 15000, 30000];

  while (tentative < 3 && !succes) {
    try {
      const responseOpenAI = await fetch(urlOpenAI, optionsOpenAI);
      texteReponseOpenAI = await responseOpenAI.text();
    } catch (erreurReseau) {
      texteReponseOpenAI = "error code: 1015";
    }

    if (texteReponseOpenAI.includes("error code: 1015") || texteReponseOpenAI.includes("Rate Limited")) {
      console.log("Bloque par Cloudflare (Tentative " + (tentative + 1) + "/3). Attente " + (delais[tentative] / 1000) + "s...");
      await new Promise(r => setTimeout(r, delais[tentative])); // Remplacement du sleep
      tentative++;
    } else {
      succes = true;
    }
  }

  // --- Lecture de la reponse OpenAI ---
  let jsonOpenAI;
  try {
    jsonOpenAI = JSON.parse(texteReponseOpenAI);
  } catch (erreur) {
    console.error("ECHEC JSON OpenAI. Reponse brute :", texteReponseOpenAI);
    return donnees.urlCloudinary || "";
  }

  if (jsonOpenAI.error) {
    console.error("ERREUR OPENAI :", jsonOpenAI.error.message);
    return donnees.urlCloudinary || "";
  }
  if (!jsonOpenAI.data || jsonOpenAI.data.length === 0) {
    console.error("ERREUR OPENAI : Aucune image renvoyee.");
    return donnees.urlCloudinary || "";
  }

  let imageSource = jsonOpenAI.data[0].url;
  if (!imageSource && jsonOpenAI.data[0].b64_json) {
    imageSource = "data:image/png;base64," + jsonOpenAI.data[0].b64_json;
  }
  console.log("Image générée par l'IA. Transfert vers Cloudinary pour débloquer la sécurité...");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const dossier = "Accueil/Heros";

  // =========================================================================
  // ÉTAPE 1 : PONT CLOUDINARY (Contourner le blocage de sécurité CORS)
  // =========================================================================
  // Le serveur de l'IA bloque la lecture des pixels. On demande au serveur de 
  // Cloudinary d'aspirer l'image pour nous fournir une version manipulable !
  let signature1 = await sha1Hex("folder=" + dossier + "&timestamp=" + timestamp + cles.cloudSecret);
  
  let form1 = new FormData();
  form1.append("file", imageSource);
  form1.append("api_key", cles.cloudKey);
  form1.append("timestamp", timestamp);
  form1.append("signature", signature1);
  form1.append("folder", dossier);

  let urlSecurisee = imageSource;
  let publicIdAecraser = null;

  try {
    const res1 = await fetch("https://api.cloudinary.com/v1_1/" + cles.cloudName + "/image/upload", { method: "POST", body: form1 });
    const json1 = await res1.json();
    if (json1.secure_url) {
        urlSecurisee = json1.secure_url;
        publicIdAecraser = json1.public_id; // On mémorise l'ID pour écraser cette image ensuite
        console.log("Image sécurisée récupérée. Découpage du fond Magenta...");
    }
  } catch (e) {
    console.error("Échec du pont Cloudinary :", e);
  }

  // =========================================================================
  // ÉTAPE 2 : LE DÉTOURAGE MAGIQUE SUR L'IMAGE SÉCURISÉE
  // =========================================================================
  let imageDetoureeBase64 = await detourerFondMagenta(urlSecurisee);

  // =========================================================================
  // ÉTAPE 3 : UPLOAD FINAL (On écrase l'image temporaire Magenta)
  // =========================================================================
  let stringToSign2 = publicIdAecraser 
      ? "public_id=" + publicIdAecraser + "&timestamp=" + timestamp + cles.cloudSecret
      : "folder=" + dossier + "&timestamp=" + timestamp + cles.cloudSecret;
      
  let signature2 = await sha1Hex(stringToSign2);
  
  let form2 = new FormData();
  form2.append("file", imageDetoureeBase64);
  form2.append("api_key", cles.cloudKey);
  form2.append("timestamp", timestamp);
  form2.append("signature", signature2);
  
  if (publicIdAecraser) {
      form2.append("public_id", publicIdAecraser);
  } else {
      form2.append("folder", dossier);
  }

  try {
    const res2 = await fetch("https://api.cloudinary.com/v1_1/" + cles.cloudName + "/image/upload", { method: "POST", body: form2 });
    const json2 = await res2.json();
    
    if (json2.secure_url) {
        console.log("SUCCES ! Portrait détouré et sauvegardé :", json2.secure_url);
        return json2.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
    }
  } catch (e) {
      console.error("ERREUR RESEAU CLOUDINARY FINAL :", e);
  }

  return urlSecurisee || "";
}

// =========================================================================
//  INTERFACE DE RÉGÉNÉRATION MANUELLE DES TOKENS
// =========================================================================

window.ouvrirRegenerationToken = function() {
    naviguerFenetre('etape-menu-outils', 'etape-regeneration-token');
    
    const conteneur = document.getElementById("liste-html-persos-token");
    const chargement = document.getElementById("chargement-persos-token");
    
    if (!window.PERSOS_PARTIE || window.PERSOS_PARTIE.length === 0) {
        chargement.style.display = "none";
        conteneur.innerHTML = "<p style='text-align:center; padding: 10px;'>Aucun héros lié à l'expédition.</p>";
        conteneur.style.display = "block";
        return;
    }

    conteneur.innerHTML = "";
    
    // On peuple la liste avec les héros actuels
    window.PERSOS_PARTIE.forEach(p => {
        const div = document.createElement("div");
        div.className = "item-perso";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        
        div.innerHTML = `
            <span style="flex-grow: 1;">${p.prenom} ${p.nom}</span> 
            <button class="btn-parametres" style="padding: 4px 12px; font-size: 12px; margin: 0;" 
                    onclick="event.stopPropagation(); window.lancerRegenerationTokenManuelle('${p.idPersonnage}', this)">
                Reforger
            </button>
        `;
        conteneur.appendChild(div);
    });

    chargement.style.display = "none";
    conteneur.style.display = "block";
};

window.lancerRegenerationTokenManuelle = async function(idPersonnage, btnElement) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    const originalText = btnElement.innerText;
    btnElement.innerText = "⏳ En cours...";
    btnElement.disabled = true;

    // Récupération des données du personnage en RAM (Zéro Latence)
    const perso = window.PERSOS_PARTIE.find(p => p.idPersonnage === idPersonnage);
    
    if (!perso || !perso.urlCloudinary) {
        alert("Impossible de trouver le portrait d'origine de ce héros.");
        btnElement.innerText = originalText;
        btnElement.disabled = false;
        return;
    }

    // Lancement de l'algorithme fantôme en forçant l'attente (await)
    const succes = await genererEtStockerTokenBackground(perso, idPersonnage, perso.urlCloudinary);

    // Feedback visuel
    if (succes) {
        btnElement.innerText = "✔️";
        btnElement.style.backgroundColor = "#1b6e3a";
        const msg = document.getElementById("msg-token-succes");
        if (msg) {
            msg.style.opacity = "1";
            setTimeout(() => msg.style.opacity = "0", 3000);
        }
    } else {
        btnElement.innerText = "❌";
        btnElement.style.backgroundColor = "darkred";
    }

    // Réinitialisation du bouton après 3 secondes
    setTimeout(() => {
        btnElement.innerText = originalText;
        btnElement.disabled = false;
        btnElement.style.backgroundColor = "";
    }, 3000);
};

// =========================================================================
//  ECOUTEURS TEMPS REEL (onSnapshot)
// =========================================================================

// Date en jeu : mise à jour live et sauvegarde globale
window.DATE_EN_JEU_ACTUELLE = { jour: "", annee: "" };

function ecouterDateEnJeu() {
  if (unsubscribeDate) unsubscribeDate();
  unsubscribeDate = onSnapshot(doc(db, COL.DATE, DOC_DATE), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    
    // On garde la vérité de la Base de Données en mémoire pour le Chat
    window.DATE_EN_JEU_ACTUELLE.jour = d.Jour ?? "";
    window.DATE_EN_JEU_ACTUELLE.annee = d.Annee ?? "";

    const elJour = document.getElementById("affichage-jour");
    const elAn = document.getElementById("affichage-an");
    if (elJour) elJour.innerText = d.Jour ?? "...";
    if (elAn) elAn.innerText = d.Annee ?? "...";
  }, (err) => console.error("onSnapshot Date_En_Jeu :", err));
}

// Liste des joueurs (ecran d'identification) en temps reel
function ecouterJoueurs() {
  if (unsubscribeJoueurs) unsubscribeJoueurs();
  unsubscribeJoueurs = onSnapshot(collection(db, COL.JOUEURS), (snap) => {
    const joueurs = [];
    snap.forEach((document) => {
      const d = document.data();
      if (d.Nom) joueurs.push({ id: d.ID_Joueur || document.id, nom: d.Nom });
    });
    construireListeJoueurs(joueurs);
  }, (err) => console.error("onSnapshot Joueurs :", err));
}

// Liste des parties pré-chargée en temps réel (pour éviter le temps d'attente)
function ecouterPartiesEnCours() {
  const q = query(collection(db, COL.PARTIES), where("Statut", "==", "En_cours"));
  onSnapshot(q, (snap) => {
    const parties = [];
    snap.forEach((document) => {
      const d = document.data();
      parties.push({ id: d.ID_Partie || document.id, nom: d.Nom_Du_Groupe || "" });
    });
    window.LISTE_PARTIES_CACHE = parties;
  }, (err) => console.error("onSnapshot Parties :", err));
}

// =========================================================================
//  MÉCANIQUES DE CHAT ET INITIATIVE (Temps Réel)
// =========================================================================

let unsubscribePartie = null;
window.unsubscribeMessages = null;
window.PARTIE_DATA = null;
window.PERSOS_PARTIE = null;

// --- Mise à jour de la Bulle Lieu ET du Pion ---
window.LIEU_ACTUEL_NOM = "";
window.LIEU_ACTUEL_IMAGE = "";

window.afficherBulleLieuChat = function() {
    const conteneur = document.getElementById("zone-noms-bulles");
    if (!conteneur) return;

    // On nettoie l'ancienne bulle si elle existe
    const existing = document.getElementById("bulle-lieu-chat");
    if (existing) existing.remove();
    const existingImg = document.getElementById("img-hover-lieu-chat");
    if (existingImg) existingImg.remove();

    if (!window.LIEU_ACTUEL_NOM || window.LIEU_ACTUEL_NOM === "") return;

    // Création de la bulle
    const bulle = document.createElement("div");
    bulle.id = "bulle-lieu-chat";
    bulle.className = "bulle-personnage bulle-lieu";
    bulle.innerText = "📍 " + window.LIEU_ACTUEL_NOM;
    
    // Si une image existe, on gère le survol
    if (window.LIEU_ACTUEL_IMAGE && window.LIEU_ACTUEL_IMAGE !== "") {
        const imgHover = document.createElement("img");
        imgHover.id = "img-hover-lieu-chat";
        imgHover.className = "bulle-image-hover-lieu";
        imgHover.src = window.LIEU_ACTUEL_IMAGE;
        document.getElementById("ecran-jeu").appendChild(imgHover);

        bulle.addEventListener("mouseenter", () => {
            imgHover.style.display = "block";
            if (window.imageTourActive && window.imageTourActive !== imgHover) {
                window.imageTourActive.style.display = "none";
            }
        });
        bulle.addEventListener("mouseleave", () => {
            imgHover.style.display = "none";
            const isChatOpen = document.getElementById("fenetre-chatbox")?.style.display === "flex";
            if (window.imageTourActive && isChatOpen) {
                window.imageTourActive.style.display = "block";
            }
        });
    }
    conteneur.appendChild(bulle);
};

window.mettreAJourBulleLieu = async function(idLieu) {
    if (!idLieu || idLieu === "") {
        window.LIEU_ACTUEL_NOM = "";
        window.LIEU_ACTUEL_IMAGE = "";
        if (typeof window.afficherBulleLieuChat === "function") window.afficherBulleLieuChat();
        window.placerPionSurHex(""); // On cache le pion
        return;
    }

    let nom = "Lieu Inconnu";
    let urlImage = "";
    let idTuile = "";

    try {
        if (idLieu.startsWith("L")) {
            const snap = await getDoc(doc(db, "Monde_Lieux", idLieu));
            if (snap.exists()) {
                const data = snap.data();
                nom = data.Nom_Du_Lieu || "Lieu sans nom";
                urlImage = data.URL_Cloudinary || "";
                idTuile = data.Tuile_ID || ""; 
            }
        } else if (idLieu.startsWith("B")) {
            const snapBat = await getDoc(doc(db, "Monde_Batiment", idLieu));
            if (snapBat.exists()) {
                const dataBat = snapBat.data();
                nom = dataBat.Nom_Batiment || "Bâtiment sans nom";
                urlImage = dataBat.URL_Cloudinary || "";
                idTuile = dataBat.Tuile_ID || "";
                
                if (idTuile === "" && dataBat.ID_Lieu) {
                    const snapLieu = await getDoc(doc(db, "Monde_Lieux", dataBat.ID_Lieu));
                    if (snapLieu.exists()) {
                        idTuile = snapLieu.data().Tuile_ID || "";
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erreur récupération lieu :", e);
    }

    window.LIEU_ACTUEL_NOM = nom;
    window.LIEU_ACTUEL_IMAGE = urlImage;
    window.TUILE_ACTUELLE = idTuile;

    if (typeof window.afficherBulleLieuChat === "function") window.afficherBulleLieuChat();
    window.placerPionSurHex(idTuile);
}

// 1. Écoute globale (Personnages + Tour + Historique du Chat)
function ecouterPersonnagesDeLaPartie(idPartie) {
  if (unsubscribePersonnages) { unsubscribePersonnages(); unsubscribePersonnages = null; }
  if (unsubscribePartie) { unsubscribePartie(); unsubscribePartie = null; }
  if (window.unsubscribeMessages) { window.unsubscribeMessages(); window.unsubscribeMessages = null; }

  if (!idPartie) {
    afficherListePersonnages([]);
    afficherBullesPersonnages([]);
    if (window.UNSUBSCRIBE_VTT) {
      window.UNSUBSCRIBE_VTT();
      window.UNSUBSCRIBE_VTT = null;
    }
    return;
  }

  // NOUVEAU : On précharge la carte de combat VTT en cache pour l'iPad
  if (typeof window.ecouterTerrainVTT === "function") {
      window.ecouterTerrainVTT();
  }

  // NOUVEAU : Un petit marqueur pour ignorer la première lecture (la sauvegarde historique)
  let estPremierScanPartie = true;

  // A. Écoute du Tour de Parole, du Lieu, DU VERROU IA ET DES VOYAGES
  unsubscribePartie = onSnapshot(doc(db, COL.PARTIES, idPartie), (snap) => {
     if(snap.exists()) {
         const dataPartie = snap.data();
         
         const ancienLieu = window.PARTIE_DATA ? window.PARTIE_DATA.Lieu_Actuel : null;
         if (dataPartie.Lieu_Actuel !== ancienLieu) {
             mettreAJourBulleLieu(dataPartie.Lieu_Actuel);
         }

         if (dataPartie.IA_En_Cours === true) {
             if (typeof window.afficherEcranAttente === "function") window.afficherEcranAttente();
         } else {
             if (typeof window.masquerEcranAttente === "function") window.masquerEcranAttente();
         }

         // =========================================================
         // NOUVEAU : MULTIJOUEUR - POP-UP DE VOYAGE SYNCHRONISÉ
         // =========================================================
         const modaleVoyage = document.getElementById("modale-voyage");
         if (dataPartie.Proposition_Voyage) {
             const prop = dataPartie.Proposition_Voyage;
             document.getElementById("texte-modale-voyage").innerHTML = `Il vous faudra <strong style="color: #ff4c4c; font-size: 24px;">${prop.Jours} jours</strong> pour atteindre votre destination.<br>Êtes-vous prêts à partir ?`;
             document.getElementById("overlay-jeu-modale").style.display = "block";
             if (modaleVoyage) modaleVoyage.style.display = "block";

             document.getElementById("btn-confirmer-voyage").onclick = () => {
                 if (typeof window.jouerSonClic === "function") window.jouerSonClic();
                 updateDoc(doc(db, COL.PARTIES, window.ID_PARTIE_COURANTE), { Proposition_Voyage: deleteField() });
                 window.executerVoyage(prop.Tuile_ID, prop.Jours);
             };
             
             document.getElementById("btn-annuler-voyage").onclick = () => {
                 if (typeof window.jouerSonClic === "function") window.jouerSonClic();
                 updateDoc(doc(db, COL.PARTIES, window.ID_PARTIE_COURANTE), { Proposition_Voyage: deleteField() });
                 
                 // NOUVEAU : On s'assure que la grille disparaît bien à l'annulation
                 window.grilleEstVisible = false;
                 const svg = document.getElementById("grille-hexagonale");
                 if (svg) {
                     svg.style.opacity = "0";
                     svg.style.pointerEvents = "none";
                 }
             };
         } else {
             if (modaleVoyage && modaleVoyage.style.display === "block") {
                 fermerModalesJeu();
             }
         }
         // =========================================================

         // =========================================================
         // LECTURE DE LA PISTE D'INITIATIVE ET DES PHASES DE COMBAT
         // =========================================================
         if (typeof window.afficherPisteInitiative === "function") {
             window.afficherPisteInitiative(dataPartie.File_Attente_Combat || [], dataPartie.Phase_Combat || "Preparation");
         }

         window.PARTIE_DATA = dataPartie;

         // Les repères d'apparition peuvent avoir été posés depuis un autre poste :
         // la demande affichée ici doit alors se refermer d'elle-même.
         if (typeof window.verifierPointsApparition === "function") {
             window.verifierPointsApparition();
         }

         // Les monstres jouent seuls : à chaque changement de la partie (une carte
         // posée, un tour qui passe), l'IA regarde si c'est à eux d'agir.
         if (typeof window.verifierTourIAMonstres === "function") {
             window.verifierTourIAMonstres();
         }

         // NOUVEAU : Met à jour la carte "Lockée" du personnage
         if (typeof window.actualiserEtatCarteCombat === "function") {
             window.actualiserEtatCarteCombat();
         }
         // NOUVEAU : Vérifie si le tour a changé pour lancer l'animation
         if (typeof window.verifierChangementTour === "function") {
             window.verifierChangementTour(dataPartie.Tour_Combat || 1);
         }
         // Sans le filtre, les leurres se mettraient à parler dans les bulles de noms.
         if (window.PERSOS_PARTIE) afficherBullesPersonnages(window.PERSOS_PARTIE.filter(p => !p.estIllusion));

         if (estPremierScanPartie) {
             if (dataPartie.Action_Des) window.DERNIER_JET_DES = dataPartie.Action_Des.timestamp;
             // 🔻 NOUVEAU
             if (dataPartie.Action_Mouvement) window.DERNIER_MOUVEMENT = dataPartie.Action_Mouvement.timestamp;
             
             // 🔻 NOUVEAU
             if (dataPartie.Action_Moteur) window.DERNIER_ACTION_MOTEUR = dataPartie.Action_Moteur.timestamp;

             if (dataPartie.Action_Bond) window.DERNIER_ACTION_BOND = dataPartie.Action_Bond.timestamp;

             if (dataPartie.Action_Poussee) window.DERNIER_ACTION_POUSSEE = dataPartie.Action_Poussee.timestamp;

             if (dataPartie.Action_Traction) window.DERNIER_ACTION_TRACTION = dataPartie.Action_Traction.timestamp;

             if (dataPartie.Action_Peur) window.DERNIER_ACTION_PEUR = dataPartie.Action_Peur.timestamp;

             estPremierScanPartie = false;
         } else {
             if (dataPartie.Action_Des && dataPartie.Action_Des.timestamp !== window.DERNIER_JET_DES) {
                 window.DERNIER_JET_DES = dataPartie.Action_Des.timestamp;
                 jouerAnimationDesGlobal(dataPartie.Action_Des);
             }
             // 🔻 NOUVEAU : On lance l'animation chez tous les joueurs connectés !
             if (dataPartie.Action_Mouvement && dataPartie.Action_Mouvement.timestamp !== window.DERNIER_MOUVEMENT) {
                 window.DERNIER_MOUVEMENT = dataPartie.Action_Mouvement.timestamp;
                 if (typeof window.jouerAnimationMouvement === "function") {
                     const action = dataPartie.Action_Mouvement;
                     window.filerAnimation("mouvement", () => window.jouerAnimationMouvement(action));
                 }
             }
             // 🔻 NOUVEAU : Déclenchement de la résolution d'attaque pour TOUS les joueurs connectés
             if (dataPartie.Action_Moteur && dataPartie.Action_Moteur.timestamp !== window.DERNIER_ACTION_MOTEUR) {
                 window.DERNIER_ACTION_MOTEUR = dataPartie.Action_Moteur.timestamp;
                 if (typeof window.jouerAnimationMoteur === "function") {
                     const action = dataPartie.Action_Moteur;
                     window.filerAnimation("carte", () => window.jouerAnimationMoteur(action));
                 }
             }
             // Bond : la case d'arrivée est déjà validée, on ne fait que rejouer le saut visuellement
             if (dataPartie.Action_Bond && dataPartie.Action_Bond.timestamp !== window.DERNIER_ACTION_BOND) {
                 window.DERNIER_ACTION_BOND = dataPartie.Action_Bond.timestamp;
                 if (typeof window.jouerAnimationBond === "function") {
                     const action = dataPartie.Action_Bond;
                     window.filerAnimation("bond", () => window.jouerAnimationBond(action));
                 }
             }
             // Poussée : le jet et la case d'arrivée sont déjà tranchés par le lanceur, on rejoue juste l'animation
             if (dataPartie.Action_Poussee && dataPartie.Action_Poussee.timestamp !== window.DERNIER_ACTION_POUSSEE) {
                 window.DERNIER_ACTION_POUSSEE = dataPartie.Action_Poussee.timestamp;
                 if (typeof window.jouerAnimationPoussee === "function") {
                     const action = dataPartie.Action_Poussee;
                     window.filerAnimation("poussée", () => window.jouerAnimationPoussee(action));
                 }
             }
             // Traction : même animation que la Poussée (la trajectoire suffit à inverser l'effet)
             if (dataPartie.Action_Traction && dataPartie.Action_Traction.timestamp !== window.DERNIER_ACTION_TRACTION) {
                 window.DERNIER_ACTION_TRACTION = dataPartie.Action_Traction.timestamp;
                 if (typeof window.jouerAnimationPoussee === "function") {
                     const action = dataPartie.Action_Traction;
                     window.filerAnimation("traction", () => window.jouerAnimationPoussee(action));
                 }
             }
             // Peur : chemin et attaques d'opportunité déjà tranchés par le lanceur, on rejoue juste l'animation
             if (dataPartie.Action_Peur && dataPartie.Action_Peur.timestamp !== window.DERNIER_ACTION_PEUR) {
                 window.DERNIER_ACTION_PEUR = dataPartie.Action_Peur.timestamp;
                 if (typeof window.jouerAnimationPeur === "function") {
                     const action = dataPartie.Action_Peur;
                     window.filerAnimation("peur", () => window.jouerAnimationPeur(action));
                 }
             }
         }
     }
  });

  // B. Écoute de l'historique du Chat
  const qMsg = query(collection(db, COL.MESSAGES), where("ID_Partie", "==", idPartie), orderBy("Timestamp", "asc"));
  
  window.INITIAL_CHAT_LOADED = false;
  let timestampChargement = new Date().getTime();

  // 🔻 NOUVEAU : On vide le chat au premier chargement de la partie
  const zoneChat = document.getElementById("zone-messages-chat");
  if (zoneChat) zoneChat.innerHTML = "";

  window.unsubscribeMessages = onSnapshot(qMsg, (snap) => {
      let recitDeclenche = null; 

      // On analyse chirurgicalement chaque changement (Ajout ou Suppression)
      snap.docChanges().forEach(change => {
          let data = change.doc.data();
          data.idDoc = change.doc.id; // On récupère l'ID exact de Firebase

          if (change.type === "added") {
              if (window.INITIAL_CHAT_LOADED && data.Est_Narration_IA && data.Timestamp >= (timestampChargement - 1000)) {
                  recitDeclenche = data.Texte;
              }
              // 🔻 NOUVEAU : On injecte uniquement ce nouveau message !
              ajouterUnSeulMessageChat(data);
          }
          
          if (change.type === "removed") {
              // 🔻 NOUVEAU : On détruit uniquement le message effacé !
              const msgDiv = document.getElementById("msg-" + data.idDoc);
              if (msgDiv) msgDiv.remove();
          }
      });

      window.INITIAL_CHAT_LOADED = true;

      // On descend l'ascenseur du chat s'il y a eu une modification
      if (zoneChat) zoneChat.scrollTop = zoneChat.scrollHeight;

      if (recitDeclenche && typeof window.lancerRecitDynamique === "function") {
          window.lancerRecitDynamique(recitDeclenche);
      }
  });

  // C. Écoute des Personnages
  //    Les monstres ne sont PLUS ici : ils vivent dans leur propre collection
  //    (voir monstres.js). On ne garde donc dans cette liste que les vrais
  //    personnages — c'est ce qui les fait disparaître des fiches perso — et
  //    c'est recomposerCombattants() qui refabrique window.PERSOS_PARTIE en
  //    fusionnant les deux sources pour le moteur de combat.
  if (typeof window.ecouterMonstresPartie === "function") {
    window.ecouterMonstresPartie(idPartie);
  }

  const q = query(collection(db, COL.PERSONNAGES), where("ID_Partie", "==", idPartie));
  unsubscribePersonnages = onSnapshot(q, (snap) => {
    const persos = [];
    snap.forEach((document) => {
      if (window.SOURCE_COMBATTANTS) window.SOURCE_COMBATTANTS[document.id] = "Personnages";
      persos.push(persoDocVersFront(document.id, document.data()));
    });

    window.PERSOS_JOUEURS_PARTIE = persos;
    if (typeof window.recomposerCombattants === "function") {
      window.recomposerCombattants();
    } else {
      window.PERSOS_PARTIE = persos;
    }

    // Les illusions sont de vrais combattants (le moteur doit les voir dans PERSOS_PARTIE),
    // mais ce sont des leurres temporaires : elles n'ont rien à faire dans la liste des
    // fiches de personnages ni dans les bulles de noms.
    const persosReels = persos.filter(p => !p.estIllusion);
    afficherListePersonnages(persosReels);
    afficherBullesPersonnages(persosReels);

    // =========================================================
    // OPTIMISATION IPAD : PRÉCHARGEMENT DES COMPÉTENCES EN CACHE
    // =========================================================
    persos.forEach(p => {
        // On crée un écouteur silencieux pour chaque personnage de la partie
        if (!window.UNSUBSCRIBE_COMPETENCES[p.idPersonnage]) {
            const qComp = collection(db, "Personnages", p.idPersonnage, "Competences");
            window.UNSUBSCRIBE_COMPETENCES[p.idPersonnage] = onSnapshot(qComp, (snapComp) => {
                let comps = {};
                snapComp.forEach(docComp => {
                    comps[docComp.id] = docComp.data();
                });
                
                // On stocke tout dans la RAM de l'iPad
                window.CACHE_COMPETENCES_GLOBAL[p.idPersonnage] = comps;
                
                // Si l'interface de combat est ouverte et qu'on modifie une compétence en direct, ça rafraîchit l'affichage
                const combatOuvert = document.getElementById('fenetre-combat')?.style.display === 'block';
                if (combatOuvert && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === p.idPersonnage) {
                    if (typeof window.afficherPersoCombatActuel === "function") {
                        window.afficherPersoCombatActuel();
                    }
                }
            });
        }
    });
    // =========================================================

  }, (err) => console.error("onSnapshot Personnages :", err));
}

// 2. Affichage des bulles
function afficherBullesPersonnages(persos) {
  const conteneur = document.getElementById("zone-noms-bulles");
  if (!conteneur) return;
  conteneur.innerHTML = "";

  document.querySelectorAll('.bulle-portrait-hover-joueur, .bulle-portrait-hover-mj').forEach(el => el.remove());

  const partie = window.PARTIE_DATA || {};
  const ordre = partie.Ordre_Initiative || [];
  const indexTour = partie.Index_Initiative !== undefined ? partie.Index_Initiative : 999;
  const idPersoActif = ordre[indexTour];

  const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
  let estMonTour = false;
  let nomActif = "MJ";

  // 🔻 NOUVEAU : On vérifie si la fenêtre de chat est bien ouverte avant d'afficher quiconque !
  const isChatOpen = document.getElementById("fenetre-chatbox")?.style.display === "flex";

  persos.forEach((p) => {
    const bulle = document.createElement("div");
    bulle.className = "bulle-personnage";
    bulle.innerText = p.prenom;
    if (p.couleur) bulle.style.setProperty('--couleur-perso', p.couleur);

    let estPersoActif = false; 

    if (p.idPersonnage === idPersoActif) {
        bulle.classList.add("tour-actif");
        nomActif = p.prenom;
        estPersoActif = true;
        if (p.idJoueur === currentUserId) estMonTour = true;
    }

    if (p.urlCloudinary && p.urlCloudinary !== "") {
      const imgHover = document.createElement("img");
      imgHover.className = "bulle-portrait-hover-joueur";
      imgHover.src = p.urlCloudinary;
      
      document.getElementById("ecran-jeu").appendChild(imgHover);

      if (estPersoActif) {
          window.imageTourActive = imgHover;
          if (isChatOpen) imgHover.style.display = "block";
      }

      bulle.addEventListener("mouseenter", () => { 
          if (window.matchMedia("(hover: none)").matches) return; 
          // 🔻 NOUVEAU : On bloque le survol si la fiche perso est ouverte
          if (document.getElementById("fenetre-fiche-perso")?.style.display === "flex") return; 

          if (window.imageTourActive && window.imageTourActive !== imgHover) window.imageTourActive.style.display = "none";
          imgHover.style.display = "block"; 
      });
      
      bulle.addEventListener("mouseleave", () => { 
          if (window.matchMedia("(hover: none)").matches) return; 
          imgHover.style.display = "none"; 
          const isChatOuvert = document.getElementById("fenetre-chatbox")?.style.display === "flex";
          const isFicheOuverte = document.getElementById("fenetre-fiche-perso")?.style.display === "flex";
          
          // 🔻 NOUVEAU : On ne restaure l'image QUE si la fiche est fermée !
          if (window.imageTourActive && isChatOuvert && !isFicheOuverte) {
              window.imageTourActive.style.display = "block"; 
          }
      });
    }

    // NOUVEAU : Un simple clic ouvre la fiche perso directement (Ultra robuste sur iPad)
    bulle.onclick = function() {
      if (typeof window.jouerSonClic === "function") window.jouerSonClic();
      if (typeof window.ouvrirFichePerso === "function") window.ouvrirFichePerso(p.idPersonnage, p.prenom, p.nom, p.couleur);
      const fiche = document.getElementById('fenetre-fiche-perso');
      if (fiche) fiche.style.zIndex = "1500";
      
      // Force l'onglet caractéristiques par défaut
      setTimeout(() => {
        const btnCaracs = document.querySelector("button[onclick*='onglet-caracs']");
        if (btnCaracs) btnCaracs.click();
      }, 10);
    };

    conteneur.appendChild(bulle);
  });

  // --- Bulle MJ ---
  const bulleMJ = document.createElement("div");
  bulleMJ.className = "bulle-personnage bulle-mj";
  bulleMJ.innerText = "MJ";

  const imgHoverMJ = document.createElement("img");
  imgHoverMJ.className = "bulle-portrait-hover-mj";
  imgHoverMJ.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782164835/maitre_du_jeu_kemkf2.png";
  
  document.getElementById("ecran-jeu").appendChild(imgHoverMJ);

  let estMjActif = false;
  if (indexTour === 999 || indexTour >= ordre.length) {
      bulleMJ.classList.add("tour-actif");
      nomActif = "MJ";
      estMjActif = true;
  }

  if (estMjActif) {
      window.imageTourActive = imgHoverMJ;
      if (isChatOpen) imgHoverMJ.style.display = "block";
  }

  bulleMJ.addEventListener("mouseenter", () => { 
      if (window.matchMedia("(hover: none)").matches) return; 
      // 🔻 NOUVEAU : On bloque le survol si la fiche perso est ouverte
      if (document.getElementById("fenetre-fiche-perso")?.style.display === "flex") return;

      if (window.imageTourActive && window.imageTourActive !== imgHoverMJ) window.imageTourActive.style.display = "none";
      imgHoverMJ.style.display = "block"; 
  });
  
  bulleMJ.addEventListener("mouseleave", () => { 
      if (window.matchMedia("(hover: none)").matches) return; 
      imgHoverMJ.style.display = "none"; 
      const isChatOuvert = document.getElementById("fenetre-chatbox")?.style.display === "flex";
      const isFicheOuverte = document.getElementById("fenetre-fiche-perso")?.style.display === "flex";
      
      // 🔻 NOUVEAU : On ne restaure l'image QUE si la fiche est fermée !
      if (window.imageTourActive && isChatOuvert && !isFicheOuverte) {
          window.imageTourActive.style.display = "block";
      }
  });

  if (partie.IA_En_Cours === true) {
      bulleMJ.style.opacity = "0.4";
      bulleMJ.style.pointerEvents = "none";
      bulleMJ.style.filter = "grayscale(100%)";
  } else {
      bulleMJ.onclick = function() {
          if (typeof window.jouerSonClic === "function") window.jouerSonClic();
          if (typeof window.declencherTourIA === "function") {
              window.declencherTourIA();
          }
      };
  }
  conteneur.appendChild(bulleMJ);

  // NOUVEAU : On rajoute la bulle du lieu tout à droite !
  if (typeof window.afficherBulleLieuChat === "function") {
      window.afficherBulleLieuChat();
  }

  // --- Mise à jour de la barre de saisie ---
  const inputChat = document.getElementById("input-chat");
  const btnEnvoyer = document.getElementById("btn-envoyer-chat");

  if (inputChat && btnEnvoyer) {
      inputChat.disabled = false;
      inputChat.style.opacity = "1";

      if (nomActif === "MJ") {
          inputChat.placeholder = "Le MJ écrit... (Préparez votre texte)";
          btnEnvoyer.disabled = true;  
          btnEnvoyer.style.opacity = "0.5";
          btnEnvoyer.style.cursor = "not-allowed";
      } else if (!estMonTour) {
          inputChat.placeholder = "Au tour de " + nomActif + "... (Préparez votre texte)";
          btnEnvoyer.disabled = true; 
          btnEnvoyer.style.opacity = "0.5";
          btnEnvoyer.style.cursor = "not-allowed";
      } else {
          inputChat.placeholder = "C'est à votre tour, " + nomActif + " !";
          btnEnvoyer.disabled = false;
          btnEnvoyer.style.opacity = "1";
          btnEnvoyer.style.cursor = "pointer";
      }
  }

}

// 3. Rendu visuel dans le chat (Injection chirurgicale optimisée)
function ajouterUnSeulMessageChat(m) {
   const zone = document.getElementById("zone-messages-chat");
   if (!zone) return;
   
   // Sécurité anti-doublon (au cas où)
   if (document.getElementById("msg-" + m.idDoc)) return;

   const div = document.createElement("div");
   div.id = "msg-" + m.idDoc; // 🔻 INDISPENSABLE pour pouvoir le supprimer plus tard 🔻
   div.className = "message-chat";
   div.style.setProperty("--couleur-perso", m.Auteur_Couleur);

   const nom = document.createElement("div");
   nom.className = "message-nom-vertical";
   nom.innerText = m.Auteur_Nom;

   const ligne = document.createElement("div");
   ligne.className = "message-separateur";

   const texte = document.createElement("div");
   texte.className = "message-contenu";
   texte.innerHTML = m.Texte;

   const btnSuppr = document.createElement("button");
   btnSuppr.className = "btn-supprimer-msg";
   btnSuppr.innerText = "✖";
   btnSuppr.onclick = async function() {
       if (typeof window.jouerSonClic === "function") window.jouerSonClic();
       // Cela déclenchera le change.type === "removed" chez tous les joueurs instantanément !
       await deleteDoc(doc(db, COL.MESSAGES, m.idDoc)); 
   };

   div.appendChild(nom);
   div.appendChild(ligne);
   div.appendChild(texte);
   div.appendChild(btnSuppr);
   zone.appendChild(div);

   // DÉTECTION DU SURVOL DES PNJ
   const spansPnj = div.querySelectorAll(".pnj-chat-hover");
   spansPnj.forEach(span => {
       span.addEventListener("mouseenter", () => {
           // 🔻 NOUVEAU : On bloque le survol si la fiche perso est ouverte
           if (document.getElementById("fenetre-fiche-perso")?.style.display === "flex") return;
           if (window.imageTourActive) window.imageTourActive.style.display = "none";
       });
       span.addEventListener("mouseleave", () => {
           const isChatOpen = document.getElementById("fenetre-chatbox")?.style.display === "flex";
           const isFicheOuverte = document.getElementById("fenetre-fiche-perso")?.style.display === "flex";
           
           // 🔻 NOUVEAU : On ne restaure l'image QUE si la fiche est fermée !
           if (window.imageTourActive && isChatOpen && !isFicheOuverte) {
               window.imageTourActive.style.display = "block";
           }
       });
   });
}

// 4. Mélange aléatoire
window.relancerInitiativeChat = async function() {
  if (!window.ID_PARTIE_COURANTE || !window.PERSOS_PARTIE || window.PERSOS_PARTIE.length === 0) return;
  let ids = window.PERSOS_PARTIE.map(p => p.idPersonnage);
  ids = ids.sort(() => Math.random() - 0.5);
  await updateDoc(doc(db, COL.PARTIES, window.ID_PARTIE_COURANTE), {
    Ordre_Initiative: ids,
    Index_Initiative: 0
  });
};

// 5. Envoi du message (avec ajout de la Date issue de Firestore et sécurité)
window.envoyerMessageChat = async function() {
   if (window.estEnTrainEcouter && window.recognition) {
       window.recognition.stop();
   }
   window.texteAvantEcoute = "";

   const input = document.getElementById("input-chat");
   const texte = input.value.trim();
   if(texte === "" || !window.ID_PARTIE_COURANTE) return;

   const partie = window.PARTIE_DATA || {};
   const ordre = partie.Ordre_Initiative || [];
   const indexTour = partie.Index_Initiative !== undefined ? partie.Index_Initiative : 999;

   // NOUVEAU : On identifie si c'est bien à moi de parler
   const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
   let estMonTour = false;

   let auteurNom = "MJ";
   let auteurCouleur = "#ffffff";
   let idAuteur = "MJ";

   if (indexTour !== 999 && indexTour < ordre.length && window.PERSOS_PARTIE) {
       const idActif = ordre[indexTour];
       const persoActif = window.PERSOS_PARTIE.find(p => p.idPersonnage === idActif);
       if (persoActif) {
           auteurNom = persoActif.prenom;
           auteurCouleur = persoActif.couleur;
           idAuteur = persoActif.idPersonnage;
           
           // Si c'est mon personnage, j'ai le droit de parler
           if (persoActif.idJoueur === currentUserId) estMonTour = true;
       }
   }

   // --- SÉCURITÉ ANTI-TRICHE CHAT ---
   // Si c'est le tour de l'IA (999) ou si ce n'est pas mon tour, je ne peux rien envoyer !
   if (indexTour === 999 || !estMonTour) {
        const btn = document.getElementById("btn-envoyer-chat");
        if(btn) {
            // Petit effet de tremblement pour indiquer que l'action est refusée
            btn.style.transform = "translateX(5px)";
            setTimeout(() => btn.style.transform = "translateX(-5px)", 50);
            setTimeout(() => btn.style.transform = "translateX(0)", 100);
        }
        return; 
   }

   const jourEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.jour : "";
   const anEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.annee : "";

   const nouveauMsg = {
       ID_Partie: window.ID_PARTIE_COURANTE,
       Auteur_ID: idAuteur,
       Auteur_Nom: auteurNom,
       Auteur_Couleur: auteurCouleur,
       Texte: texte,
       Date_Jour: jourEnJeu, 
       Date_An: anEnJeu,     
       Timestamp: new Date().getTime()
   };

   await addDoc(collection(db, COL.MESSAGES), nouveauMsg);
   input.value = ""; 

   if (indexTour !== 999) {
       let nouvelIndex = indexTour + 1;
       if (nouvelIndex >= ordre.length) nouvelIndex = 999; 
       await updateDoc(doc(db, COL.PARTIES, window.ID_PARTIE_COURANTE), {
           Index_Initiative: nouvelIndex
       });
   }
};

// =========================================================================
//  SCENE 1/2 : ACCUEIL + IDENTIFICATION
// =========================================================================
function construireListeJoueurs(joueurs) {
  const conteneur = document.getElementById("liste-noms-joueurs");
  if (!conteneur) return;
  conteneur.innerHTML = "";

  joueurs.forEach((joueur) => {
    const span = document.createElement("span");
    span.className = "nom-joueur";
    span.innerText = joueur.nom;

    const dureeAleatoire = 2.5 + Math.random() * 2;
    const delaiAleatoire = Math.random() * 2;
    span.style.animationDuration = `${dureeAleatoire}s`;
    span.style.animationDelay = `-${delaiAleatoire}s`;

    span.onclick = function () {
      jouerSonClic();
      validerIdentification(joueur.id);
    };

    conteneur.appendChild(span);
  });
}

function validerIdentification(idJoueur) {
  localStorage.setItem("ID_JOUEUR_COURANT", idJoueur);
  const ecranIdentification = document.getElementById("ecran-identification");
  ecranIdentification.style.opacity = "0";
  setTimeout(() => { ecranIdentification.style.display = "none"; }, 1500);
}

function jouerSonClic() {
  const son = document.getElementById("son-clic");
  if (!son) return;
  son.volume = window.PARAMETRES_AUDIO.interface * window.PARAMETRES_AUDIO.general;
  son.currentTime = 0;
  son.play().catch(() => {});
}

let fileAttenteMusique = [];

function melangerPlaylist(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

function jouerProchaineMusique() {
  const musique = document.getElementById("musique-ambiance");
  if (!musique) return;

  if (fileAttenteMusique.length === 0) {
    if (!playlist || playlist.length === 0) {
      console.warn("La playlist est vide.");
      return;
    }
    fileAttenteMusique = melangerPlaylist(playlist);
  }

  const prochainTitre = fileAttenteMusique.shift();
  musique.src = prochainTitre;
  musique.load();
  musique.play().catch((e) => {
    console.error("Impossible de lire la musique d'ambiance :", e);
    jouerProchaineMusique();
  });
}

function entrerDansLeJeu() {
  const accueil = document.getElementById("ecran-accueil");
  const musique = document.getElementById("musique-ambiance");

  if (musique) {
    window.appliquerVolumesAudio();
    // Événement pour jouer automatiquement la musique suivante quand la piste se termine
    musique.addEventListener("ended", jouerProchaineMusique);
    // Lance la première musique de la playlist
    jouerProchaineMusique();
  }

  const page = document.documentElement;
  if (page.requestFullscreen) { page.requestFullscreen().catch(() => {}); }
  else if (page.webkitRequestFullscreen) { page.webkitRequestFullscreen(); }
  else if (page.msRequestFullscreen) { page.msRequestFullscreen(); }

  accueil.style.opacity = "0";

  setTimeout(() => {
    accueil.style.display = "none";
    document.querySelector(".titre-etranger").classList.add("visible");
    setTimeout(() => {
      document.getElementById("liste-noms-joueurs").classList.add("visible");
    }, 2500);
  }, 1500);
}

// =========================================================================
//  MODALES : NOUVELLE PARTIE / CHARGEMENT
// =========================================================================
function ouvrirModalNouvellePartie() {
  document.getElementById("overlay-modale").style.display = "block";
  document.getElementById("modale-cle").style.display = "block";
  document.getElementById("saisie-cle").value = "";
  document.getElementById("msg-erreur").style.display = "none";
}

function fermerModales() {
  document.getElementById("overlay-modale").style.display = "none";
  document.getElementById("modale-cle").style.display = "none";
  document.getElementById("modale-groupe").style.display = "none";
  document.getElementById("modale-charger").style.display = "none";
  document.getElementById("modale-mdp-partie").style.display = "none";
}

async function validerCle(evenement) {
  const saisie = document.getElementById("saisie-cle").value;
  const btnOuvrir = evenement ? evenement.target : null;
  if (btnOuvrir) btnOuvrir.innerText = "Vérification...";

  const estValide = await verifierMotDePasse(saisie);
  if (btnOuvrir) btnOuvrir.innerText = "Ouvrir";

  if (estValide) {
    document.getElementById("modale-cle").style.display = "none";
    document.getElementById("modale-groupe").style.display = "block";
  } else {
    document.getElementById("msg-erreur").style.display = "block";
  }
}

async function validerCreationGroupe() {
  const nomGroupe = document.getElementById("saisie-nom-groupe").value.trim();
  const mdpGroupe = document.getElementById("saisie-mdp-groupe").value.trim();
  const btnCreer = document.getElementById("btn-creer-groupe");

  if (nomGroupe === "" || mdpGroupe === "") {
    alert("Le Grimoire exige un nom de groupe et un mot de passe valides.");
    return;
  }

  btnCreer.innerText = "Création...";
  btnCreer.disabled = true;

  try {
    const nouvelID = await creerNouvellePartie(nomGroupe, mdpGroupe);
    window.ID_PARTIE_COURANTE = nouvelID;

    fermerModales();
    btnCreer.innerText = "Créer";
    btnCreer.disabled = false;

    document.getElementById("ecran-menu").style.display = "none";
    document.getElementById("ecran-jeu").style.display = "block";
    // NOUVEAU : On trace la grille à la seconde où l'écran s'affiche
    window.dessinerGrilleHexagonale();
    // CORRECTION BUG DRAPEAU : On charge immédiatement les données de la partie pour placer le pion !
    ecouterPersonnagesDeLaPartie(window.ID_PARTIE_COURANTE);
  } catch (e) {
    console.error(e);
    alert("Une erreur est survenue lors de la fondation du groupe.");
    btnCreer.innerText = "Créer";
    btnCreer.disabled = false;
  }
}

function ouvrirModalChargerPartie() {
  document.getElementById("overlay-modale").style.display = "block";
  document.getElementById("modale-charger").style.display = "block";

  // Plus besoin de message de chargement, c'est instantané
  document.getElementById("chargement-parties").style.display = "none";
  document.getElementById("liste-parties").style.display = "none";
  document.getElementById("liste-parties").innerHTML = "";

  // On utilise directement le cache prêt en mémoire
  afficherListeParties(window.LISTE_PARTIES_CACHE);
}

function afficherListeParties(partiesActives) {
  const divChargement = document.getElementById("chargement-parties");
  const ulListe = document.getElementById("liste-parties");

  divChargement.style.display = "none";
  ulListe.style.display = "block";

  if (partiesActives.length === 0) {
    ulListe.innerHTML = '<li style="text-align:center; color: darkred; padding:10px; list-style:none;">Aucune expédition en cours.</li>';
    return;
  }

  partiesActives.forEach((partie) => {
    const li = document.createElement("li");
    li.className = "item-partie";
    li.onclick = function () {
      jouerSonClic();
      demanderMdpPartie(partie.id);
    };
    li.innerHTML = '<span class="item-nom">' + partie.nom + "</span>";
    ulListe.appendChild(li);
  });
}

function demanderMdpPartie(idChoisi) {
  window.ID_PARTIE_EN_ATTENTE = idChoisi;
  document.getElementById("modale-charger").style.display = "none";
  document.getElementById("modale-mdp-partie").style.display = "block";
  document.getElementById("saisie-mdp-partie").value = "";
  document.getElementById("msg-erreur-partie").style.display = "none";
}

async function validerMdpPartie() {
  const saisie = document.getElementById("saisie-mdp-partie").value;
  const btnValider = document.getElementById("btn-valider-mdp-partie");
  const idPartie = window.ID_PARTIE_EN_ATTENTE;

  btnValider.innerText = "Vérification...";
  const estValide = await verifierMotDePassePartie(idPartie, saisie);
  btnValider.innerText = "Déverrouiller";

  if (estValide) {
    document.getElementById("modale-mdp-partie").style.display = "none";
    lancerPartieChargee(idPartie);
  } else {
    document.getElementById("msg-erreur-partie").style.display = "block";
  }
}

function lancerPartieChargee(idChoisi) {
  window.ID_PARTIE_COURANTE = idChoisi;
  fermerModales();
  document.getElementById("ecran-menu").style.display = "none";
  document.getElementById("ecran-jeu").style.display = "block";
  // NOUVEAU : On trace la grille à la seconde où l'écran s'affiche
  window.dessinerGrilleHexagonale();
  // CORRECTION BUG DRAPEAU : On charge immédiatement les données de la partie pour placer le pion !
  ecouterPersonnagesDeLaPartie(window.ID_PARTIE_COURANTE);
}

// =========================================================================
//  ECRAN DE JEU : son, volume, pop-ups
// =========================================================================
function jouerSonSurvolParchemin() {
  const sonParchemin = document.getElementById("audio-survol-parchemin");
  if (sonParchemin && sonParchemin.src.includes("http")) {
    // On garde le multiplicateur 0.5 car ce son spécifique tape très fort
    sonParchemin.volume = (window.PARAMETRES_AUDIO.interface * window.PARAMETRES_AUDIO.general) * 0.5;
    sonParchemin.currentTime = 0;
    sonParchemin.play().catch(() => {});
  }
}

function toggleBulleVolume(evenement) {
  evenement.stopPropagation();
  const bulle = document.getElementById("bulle-volume");

  if (bulle.style.display === "block") {
    bulle.style.display = "none";
  } else {
    bulle.style.display = "block";
    window.appliquerVolumesAudio(); // Force l'actualisation visuelle des curseurs
  }
}

function fermerModalesJeu() {
  document.getElementById("overlay-jeu-modale").style.display = "none";
  document.getElementById("modale-retour-menu").style.display = "none";
  document.getElementById("modale-quitter-jeu").style.display = "none";
  // NOUVEAU : Fermer la modale de voyage
  const modaleVoyage = document.getElementById("modale-voyage");
  if (modaleVoyage) modaleVoyage.style.display = "none";
}

function demanderRetourMenu() {
  if (typeof window.fermerToutesLesFenetres === "function") {
    window.fermerToutesLesFenetres();
  }
  document.getElementById("overlay-jeu-modale").style.display = "block";
  document.getElementById("modale-retour-menu").style.display = "block";
}

function demanderQuitterJeu() {
  if (typeof window.fermerToutesLesFenetres === "function") {
    window.fermerToutesLesFenetres();
  }
  document.getElementById("overlay-jeu-modale").style.display = "block";
  document.getElementById("modale-quitter-jeu").style.display = "block";
}

function confirmerRetourMenu() {
  if (typeof window.fermerToutesLesFenetres === "function") {
    window.fermerToutesLesFenetres();
  }
  fermerModalesJeu();
  document.getElementById("ecran-jeu").style.display = "none";
  document.getElementById("ecran-menu").style.display = "block";
  window.ID_PARTIE_COURANTE = null;
  if (unsubscribePersonnages) { unsubscribePersonnages(); unsubscribePersonnages = null; }
  // NOUVEAU : Nettoyage des écouteurs de compétences
  Object.values(window.UNSUBSCRIBE_COMPETENCES).forEach(unsub => unsub());
  window.UNSUBSCRIBE_COMPETENCES = {};
  window.CACHE_COMPETENCES_GLOBAL = {};
  // NOUVEAU : Nettoyage du VTT
  if (window.UNSUBSCRIBE_VTT) {
      window.UNSUBSCRIBE_VTT();
      window.UNSUBSCRIBE_VTT = null;
  }
}

function confirmerQuitterJeu() {
  if (typeof window.fermerToutesLesFenetres === "function") {
    window.fermerToutesLesFenetres();
  }
  fermerModalesJeu();
  window.close();
  try { window.top.close(); } catch (e) {}
  setTimeout(() => {
    alert("Le parchemin ne peut être refermé automatiquement par magie.\nVeuillez fermer cet onglet manuellement.");
  }, 500);
}

// =========================================================================
//  GESTION DES PANNEAUX LATERAUX (parametres, personnages, futurs boutons)
//  - Recliquer sur le meme bouton ferme le panneau en cours
//  - Ouvrir un autre panneau ferme d'abord celui qui est actif
// =========================================================================
function estPanneauParametresOuvert() {
  const conteneur = document.getElementById("conteneur-parametres");
  return conteneur && conteneur.classList.contains("ouvert");
}

function estPanneauPersonnagesOuvert() {
  const liste = document.getElementById("conteneur-liste-personnages");
  const fiche = document.getElementById("fenetre-fiche-perso");
  const listeOuverte = liste && liste.classList.contains("ouvert");
  const ficheOuverte = fiche && window.getComputedStyle(fiche).display !== "none";
  return listeOuverte || ficheOuverte;
}

function fermerToutPersonnages(immediat) {
  document.getElementById("fenetre-fiche-perso").style.display = "none";
  document.getElementById("voile-suppression-perso").style.display = "none";

  const isChatOuvert = document.getElementById("fenetre-chatbox")?.style.display === "flex";
  if (window.imageTourActive && isChatOuvert) {
      window.imageTourActive.style.display = "block";
  }

  // FORCE LA DÉSÉLECTION ET CACHE LA CARTE HD
  window.CARTE_EN_APERCU = null;
  const hdCard = document.getElementById("apercu-carte-hd-competence");
  if (hdCard) hdCard.style.display = "none";
  document.querySelectorAll('.banniere-carte').forEach(el => el.style.filter = "none");

  const liste = document.getElementById("conteneur-liste-personnages");
  if (!liste) return;

  const fermer = () => {
    liste.classList.remove("ouvert");
    liste.style.display = "none";
  };

  if (liste.classList.contains("ouvert")) {
    if (immediat) { fermer(); return; }
    liste.classList.remove("ouvert");
    setTimeout(fermer, 600);
  }
}

// =========================================================================
//  PARAMETRES / CERVEAU IA
// =========================================================================
function fermerParametres(immediat) {
  const conteneur = document.getElementById("conteneur-parametres");

  const fermer = () => {
    conteneur.classList.remove("ouvert");
    conteneur.style.display = "none";
    
    // NOUVEAU : Sécurité pour restaurer le menu latéral quoiqu'il arrive
    const menuLat = document.getElementById('menu-lateral');
    if (menuLat) menuLat.style.display = 'flex';
  };

  if (immediat) { fermer(); return; }

  conteneur.classList.remove("ouvert");
  setTimeout(fermer, 600);
}

function naviguerFenetre(idFenetreSortante, idFenetreEntrante) {
  const sortante = document.getElementById(idFenetreSortante);
  const entrante = document.getElementById(idFenetreEntrante);

  sortante.style.opacity = "0";
  setTimeout(() => {
    sortante.style.display = "none";
    entrante.style.display = "block";
    setTimeout(() => { entrante.style.opacity = "1"; }, 50);
  }, 400);
}

async function validerMdpParametres() {
  const mdp = document.getElementById("input-secret-parametres").value;
  const msgErreur = document.getElementById("erreur-mdp-parametres");

  msgErreur.style.opacity = "0";
  if (mdp === "") return;

  const btnValider = document.getElementById("btn-valider-mdp");
  btnValider.innerText = "Vérification...";
  btnValider.style.pointerEvents = "none";

  const estValide = await verifierMdpParametresServeur(mdp);
  btnValider.innerText = "Déverrouiller";
  btnValider.style.pointerEvents = "auto";

  if (estValide) {
    naviguerFenetre("etape-mdp-parametres", "etape-menu-parametres");
  } else {
    msgErreur.style.opacity = "1";
    document.getElementById("input-secret-parametres").value = "";
  }
}

async function ouvrirListeInstructions(idFenetreSortante) {
  if (idFenetreSortante) {
    naviguerFenetre(idFenetreSortante, "etape-liste-instructions");
  }
  document.getElementById("chargement-instructions").style.display = "block";
  document.getElementById("conteneur-liste-ia").style.display = "none";

  const instructions = await recupererInstructionsIA();
  afficherListeIA(instructions);
}

function afficherListeIA(instructions) {
  const conteneur = document.getElementById("conteneur-liste-ia");
  conteneur.innerHTML = "";

  instructions.forEach((inst) => {
    const estCoche = inst.statut === "on" ? "checked" : "";

    const div = document.createElement("div");
    div.className = "item-instruction";
    
    // Fonction d'ouverture isolée
    const ouvrirInst = function () {
      jouerSonClic();
      ouvrirEditeurInstruction(inst.id, inst.titre, inst.contenu);
    };
    
    div.ondblclick = ouvrirInst; // Reste valide pour PC

    // MAGIE IPAD : Double-Tap (Corrigé)
    let dernierTouch = 0;
    div.ontouchstart = function(e) {
        // On sécurise l'interrupteur pour ne pas bloquer le clic dessus
        if (e.target.tagName.toLowerCase() === 'input' || e.target.className.includes('curseur-poussoir')) return;
        
        const maintenant = new Date().getTime();
        if (maintenant - dernierTouch < 400) {
            e.preventDefault();
            ouvrirInst();
        }
        dernierTouch = maintenant;
    };

    div.innerHTML = `
      <span class="item-titre">${inst.titre}</span>
      <label class="interrupteur" onclick="event.stopPropagation()">
        <input type="checkbox" ${estCoche} onchange="basculerPoussoirIA('${inst.id}', this.checked)">
        <span class="curseur-poussoir"></span>
      </label>
    `;
    conteneur.appendChild(div);
  });

  document.getElementById("chargement-instructions").style.display = "none";
  conteneur.style.display = "block";
}

function basculerPoussoirIA(id, estActive) {
  const nouveauStatut = estActive ? "on" : "off";
  basculerStatutInstructionIA(id, nouveauStatut).catch((e) => console.error(e));
}

function ouvrirEditeurInstruction(id, titre, contenu) {
  document.getElementById("titre-fenetre-editeur").innerText = id ? "Modifier Instruction" : "Nouvelle Instruction";
  document.getElementById("editeur-id-instruction").value = id || "";
  document.getElementById("editeur-titre").value = titre || "";
  document.getElementById("editeur-contenu").value = contenu || "";

  const btnSupprimer = document.getElementById("btn-supprimer-inst");
  btnSupprimer.style.display = id ? "inline-block" : "none";

  naviguerFenetre("etape-liste-instructions", "etape-editeur-instruction");
}

async function sauvegarderInstruction() {
  const id = document.getElementById("editeur-id-instruction").value;
  const titre = document.getElementById("editeur-titre").value.trim();
  const contenu = document.getElementById("editeur-contenu").value.trim();

  if (titre === "" || contenu === "") {
    alert("Le titre et le contenu ne peuvent pas être vides.");
    return;
  }

  const btnSauvegarder = document.getElementById("btn-sauvegarder-inst");
  btnSauvegarder.innerText = "Gravure...";
  btnSauvegarder.style.pointerEvents = "none";

  await sauvegarderInstructionIA(id, titre, contenu);

  btnSauvegarder.innerText = "Sauvegarder";
  btnSauvegarder.style.pointerEvents = "auto";
  ouvrirListeInstructions("etape-editeur-instruction");
}

function demanderSuppression() {
  naviguerFenetre("etape-editeur-instruction", "etape-confirmation-suppression");
}

function annulerSuppression() {
  naviguerFenetre("etape-confirmation-suppression", "etape-editeur-instruction");
}

async function validerSuppression() {
  const id = document.getElementById("editeur-id-instruction").value;
  if (!id) return;

  const btnConfirmer = document.getElementById("btn-confirmer-destruction");
  btnConfirmer.innerText = "Destruction...";
  btnConfirmer.style.pointerEvents = "none";

  await supprimerInstructionIA(id);

  btnConfirmer.innerText = "Oui, détruire";
  btnConfirmer.style.pointerEvents = "auto";
  ouvrirListeInstructions("etape-confirmation-suppression");
}

// =========================================================================
//  GESTION DES EFFETS DE COMBAT (MOTEUR ALGORITHMIQUE)
// =========================================================================

window.ouvrirGestionEffets = async function() {
    // NOUVEAU : Masque complètement le menu de droite
    const menuLat = document.getElementById('menu-lateral');
    if (menuLat) menuLat.style.display = 'none';

    naviguerFenetre('etape-menu-outils', 'etape-gestion-effets');
    document.getElementById("chargement-effets").style.display = "block";
    document.getElementById("conteneur-table-effets").style.display = "none";
    await window.chargerTableauEffets();
};

// NOUVEAU : Fonction dédiée pour fermer proprement et restaurer le menu
window.fermerGestionEffets = function() {
    const menuLat = document.getElementById('menu-lateral');
    if (menuLat) menuLat.style.display = 'flex';
    naviguerFenetre('etape-gestion-effets', 'etape-menu-outils');
};

window.chargerTableauEffets = async function() {
    const tbody = document.getElementById("tbody-effets");
    tbody.innerHTML = "";
    
    try {
        const q = query(collection(db, "Combat_Effets"));
        const snap = await getDocs(q);
        
        let effetsList = [];
        snap.forEach(docSnap => {
            effetsList.push({ id: docSnap.id, data: docSnap.data() });
        });
        
        // Tri intelligent (Modificateur PUIS Nom)
        effetsList.sort((a, b) => {
            let modA = a.data.Modificateur || "";
            let modB = b.data.Modificateur || "";
            if (modA !== modB) return modA.localeCompare(modB);
            let nomA = a.data.Nom || "";
            let nomB = b.data.Nom || "";
            return nomA.localeCompare(nomB);
        });

        effetsList.forEach(item => {
            window.ajouterLigneEffetHTML(item.id, item.data);
        });

        document.getElementById("chargement-effets").style.display = "none";
        document.getElementById("conteneur-table-effets").style.display = "block";

    } catch (e) {
        console.error("Erreur chargement effets :", e);
        document.getElementById("chargement-effets").innerText = "Interférence magique lors de la lecture.";
    }
};

const LEGACY_TYPE_MAP = {
    Degats: "Action/Global", Soin: "Action/Global", Defense: "Action/Global", Special: "Action/Global",
    Action: "Action/Global", Global: "Action/Global",
    Alteration: "Magique", Deplacement: "Spatial", Portee: "Spatial", Bonus: "Action/Global"
};

function normalizeTypeForEditor(type) {
    return LEGACY_TYPE_MAP[type] || type || "Action/Global";
}

window.ajouterLigneEffetHTML = function(id, data = {}) {
    const d = {
        Nom: data.Nom || "", Cout_PT: data.Cout_PT || "", Modificateur: data.Modificateur || "AUCUN",
        Type_Mecanique: normalizeTypeForEditor(data.Type_Mecanique),
        Type_Mecanique_2: data.Type_Mecanique_2 ? normalizeTypeForEditor(data.Type_Mecanique_2) : "Aucun",
        Cible_Etat: data.Cible_Etat || "",
        Valeur: data.Valeur || 0, Pourcent_Base: data.Pourcent_Base || 0,
        Pourcent_Max: data.Pourcent_Max || 0, Tours: data.Tours || 0,
        Effet_Base: data.Effet_Base || "", Notes: data.Notes || ""
    };

    const tbody = document.getElementById("tbody-effets");
    const tr = document.createElement("tr");
    tr.id = `ligne-effet-${id}`;

    const typesDispos = ["Action/Global", "Spatial", "Physique", "Magique", "Duree", "Aucun"];

    let optionsType1 = typesDispos.map(t => `<option value="${t}" ${d.Type_Mecanique === t ? 'selected' : ''}>${t}</option>`).join("");
    let optionsType2 = typesDispos.map(t => `<option value="${t}" ${d.Type_Mecanique_2 === t ? 'selected' : (t === 'Aucun' && !d.Type_Mecanique_2 ? 'selected' : '')}>${t}</option>`).join("");

    tr.innerHTML = `
        <td><input type="text" id="nom-${id}" value="${d.Nom}"></td>
        <td><input type="text" id="cout-${id}" value="${d.Cout_PT}" style="text-align: center;"></td>
        <td><input type="text" id="mod-${id}" value="${d.Modificateur}" style="text-align: center;"></td>
        <td><select id="type1-${id}">${optionsType1}</select></td>
        <td><select id="type2-${id}">${optionsType2}</select></td>
        <td><input type="text" id="cible-${id}" value="${d.Cible_Etat}" placeholder="ex: poison"></td>
        <td><input type="number" id="val-${id}" value="${d.Valeur}" style="text-align: center;"></td>
        <td><input type="number" id="base-${id}" value="${d.Pourcent_Base}" style="text-align: center;"></td>
        <td><input type="number" id="max-${id}" value="${d.Pourcent_Max}" style="text-align: center;"></td>
        <td><input type="number" id="trs-${id}" value="${d.Tours}" style="text-align: center;"></td>
        <td><textarea id="effet-${id}">${d.Effet_Base}</textarea></td>
        <td><textarea id="notes-${id}">${d.Notes}</textarea></td>
        <td style="text-align: center; vertical-align: middle;">
            <button class="btn-sauver-ligne" onclick="jouerSonClic(); window.sauvegarderEffetLigne('${id}')">💾</button>
            <button class="btn-sauver-ligne" style="background-color: darkred; margin-top:5px; padding:2px;" onclick="jouerSonClic(); window.supprimerEffetLigne('${id}')">🗑️</button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.sauvegarderEffetLigne = async function(id) {
    const btn = document.querySelector(`#ligne-effet-${id} .btn-sauver-ligne`);
    if (btn) btn.innerText = "⏳";

    const newData = {
        Nom: document.getElementById(`nom-${id}`).value.trim(),
        Cout_PT: document.getElementById(`cout-${id}`).value.trim(),
        Modificateur: document.getElementById(`mod-${id}`).value.trim(),
        Type_Mecanique: document.getElementById(`type1-${id}`).value,
        Type_Mecanique_2: document.getElementById(`type2-${id}`).value,
        Cible_Etat: document.getElementById(`cible-${id}`).value.trim(),
        Valeur: parseFloat(document.getElementById(`val-${id}`).value) || 0,
        Pourcent_Base: parseFloat(document.getElementById(`base-${id}`).value) || 0,
        Pourcent_Max: parseFloat(document.getElementById(`max-${id}`).value) || 0,
        Tours: parseFloat(document.getElementById(`trs-${id}`).value) || 0,
        Effet_Base: document.getElementById(`effet-${id}`).value.trim(),
        Notes: document.getElementById(`notes-${id}`).value.trim()
    };

    try {
        await setDoc(doc(db, "Combat_Effets", id), newData, { merge: true });
        if (btn) {
            btn.innerText = "✔️"; btn.style.backgroundColor = "#00ffff"; btn.style.color = "#000";
            setTimeout(() => { btn.innerText = "💾"; btn.style.backgroundColor = "#1b6e3a"; btn.style.color = "white"; }, 1500);
        }
    } catch (e) {
        console.error("Erreur sauvegarde effet :", e);
        if (btn) btn.innerText = "✖️";
    }
};

window.supprimerEffetLigne = async function(id) {
    if(!confirm("Détruire définitivement cette compétence ?")) return;
    try {
        await deleteDoc(doc(db, "Combat_Effets", id));
        document.getElementById(`ligne-effet-${id}`).remove();
    } catch(e) { alert("Échec de la suppression."); }
};

window.ajouterLigneEffetVide = function() {
    const nouvelId = "EFFET_" + Math.random().toString(36).substring(2, 9);
    window.ajouterLigneEffetHTML(nouvelId);
    const conteneur = document.getElementById("conteneur-table-effets");
    conteneur.scrollTop = conteneur.scrollHeight;
};

window.chargerCacheEffetsBDD = async function() {
    try {
        const snap = await getDocs(collection(db, "Combat_Effets"));
        window.EFFETS_BDD_CACHE = {};
        snap.forEach(d => window.EFFETS_BDD_CACHE[d.id] = d.data());
    } catch(e) { console.error("Erreur cache effets :", e); }
};

window.exporterEffetsBDD = async function() {
    const btn = document.querySelector("#etape-gestion-effets button[onclick*='exporterEffetsBDD']");
    if (!btn) return;
    const originalText = btn.innerText;
    btn.innerText = "⏳ Copie en cours...";

    try {
        const q = query(collection(db, "Combat_Effets"));
        const snap = await getDocs(q);
        
        let exportData = [];
        snap.forEach(docSnap => {
            exportData.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        // Transforme le JSON en texte lisible et formaté
        const dataStr = JSON.stringify(exportData, null, 2);
        
        // Copie magique dans le presse-papier
        await navigator.clipboard.writeText(dataStr);
        
        btn.innerText = "✔️ Copié !";
        btn.style.backgroundColor = "#1b6e3a";
        alert("Les effets ont été copiés dans votre presse-papier ! Vous pouvez faire Ctrl+V / Coller pour les envoyer à l'IA.");
        
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = "#9333ea";
        }, 3000);

    } catch (e) {
        console.error("Erreur d'export :", e);
        btn.innerText = "❌ Échec";
        alert("Impossible de copier dans le presse-papier. Assurez-vous que le navigateur autorise l'accès au presse-papier.");
    }
};

// =========================================================================
//  PERSONNAGES / FICHE PERSO
// =========================================================================
function remplirSelectFactions(factions) {
  const select = document.getElementById("champ-faction");
  if (!select) return;
  select.innerHTML = '<option value="">-- Aucune / Indépendant --</option>';
  factions.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.text = f.nom;
    select.appendChild(opt);
  });
}

function fermerMenuPersonnages() {
  fermerToutPersonnages();
}

function afficherListePersonnages(persos) {
  const conteneur = document.getElementById("liste-html-persos");
  if (!conteneur) return;
  conteneur.innerHTML = "";

  if (persos.length === 0) {
    conteneur.innerHTML = "<p style='text-align:center; padding:10px;'>Aucun héros lié à cette partie.</p>";
  } else {
    persos.forEach((p) => {
      const div = document.createElement("div");
      div.className = "item-perso";
      
      // NOUVEAU : Un simple clic ouvre la fiche !
      div.onclick = function () { 
          if (typeof window.jouerSonClic === "function") window.jouerSonClic(); 
          if (typeof window.ouvrirFichePerso === "function") window.ouvrirFichePerso(p.idPersonnage, p.prenom, p.nom, p.couleur); 
      };
      
      div.innerHTML = `<span>${p.prenom} ${p.nom}</span>`;
      conteneur.appendChild(div);
    });
  }

  document.getElementById("chargement-persos").style.display = "none";
  conteneur.style.display = "block";
}

async function ouvrirFichePerso(idPersonnage, prenomPerso, nomPerso, couleurPerso) {
  const fiche = document.getElementById("fenetre-fiche-perso");

  if (window.imageTourActive) window.imageTourActive.style.display = "none";

  fiche.style.display = "flex";
  const fenetreHauteur = fiche.offsetHeight;
  fiche.style.left = "2vw";
  fiche.style.top = (window.innerHeight / 2 - fenetreHauteur / 2 - 60) + "px";

  window.chargerCaracteristiques(idPersonnage);

  // Nettoyage minimal
  document.getElementById("champ-id-personnage").value = idPersonnage;
  document.getElementById("champ-id-joueur-perso").value = localStorage.getItem("ID_JOUEUR_COURANT");
  document.getElementById("image-portrait-perso").src = "";
  document.getElementById("image-portrait-perso").style.display = "none";
  document.getElementById("texte-aucun-portrait").style.display = "block";

  if (couleurPerso) appliquerCouleurTheme(couleurPerso);

  // Ouverture par défaut sur les Caractéristiques
  const btnCaracs = document.querySelector("button[onclick*='onglet-caracs']");
  if (btnCaracs) changerOngletPerso({ currentTarget: btnCaracs }, 'onglet-caracs');

  document.getElementById("titre-nom-personnage").innerText = prenomPerso + " " + nomPerso;

  // 🔻 OPTIMISATION ZÉRO LATENCE : On lit la RAM (onSnapshot) au lieu de Firebase 🔻
  let donneesServeur = null;
  if (window.PERSOS_PARTIE) {
      donneesServeur = window.PERSOS_PARTIE.find(p => p.idPersonnage === idPersonnage);
  }

  // Fallback réseau uniquement si le cache est vide
  if (!donneesServeur) {
      donneesServeur = await recupererDetailsPersonnage(idPersonnage);
  }

  if (donneesServeur) {
      if (donneesServeur.urlCloudinary) {
          document.getElementById("image-portrait-perso").src = donneesServeur.urlCloudinary;
          document.getElementById("image-portrait-perso").style.display = "block";
          document.getElementById("texte-aucun-portrait").style.display = "none";
      }

      if (typeof window.afficherStatsCombat === "function") {
          window.afficherStatsCombat(donneesServeur);
      }

      if (typeof window.chargerOngletCompetences === "function") {
          // Le Gob mémorise une carte de plus que les autres : le compte se lit
          // sur la fiche, atout de race compris.
          window.chargerOngletCompetences(idPersonnage, window.competencesMaxCombattant(donneesServeur));
      }
  }
}

function fermerFichePerso() {
  document.getElementById("fenetre-fiche-perso").style.display = "none";
  document.getElementById("voile-suppression-perso").style.display = "none";

  const isChatOuvert = document.getElementById("fenetre-chatbox")?.style.display === "flex";
  if (window.imageTourActive && isChatOuvert) {
      window.imageTourActive.style.display = "block";
  }

  // FORCE LA DÉSÉLECTION ET CACHE LA CARTE HD
  window.CARTE_EN_APERCU = null;
  const hdCard = document.getElementById("apercu-carte-hd-competence");
  if (hdCard) hdCard.style.display = "none";
  document.querySelectorAll('.banniere-carte').forEach(el => el.style.filter = "none");
}


function ouvrirConfirmationSuppressionPerso() {
  document.getElementById("voile-suppression-perso").style.display = "flex";
}

function annulerSuppressionPerso() {
  document.getElementById("voile-suppression-perso").style.display = "none";
}

async function validerSuppressionPerso() {
  const id = document.getElementById("champ-id-personnage").value;
  if (!id) return;

  const btnConfirmer = document.getElementById("btn-confirmer-suppression-perso");
  btnConfirmer.innerText = "Destruction...";
  btnConfirmer.style.pointerEvents = "none";

  // Tout part d'un seul endroit : fiche, caractéristiques, compétences,
  // illusions, pion sur le plateau, zones persistantes, place dans l'ordre
  // d'initiative, images Cloudinary et traces laissées dans ce navigateur.
  await supprimerPersonnageBDD(id);

  btnConfirmer.innerText = "Oui, détruire";
  btnConfirmer.style.pointerEvents = "auto";
  document.getElementById("voile-suppression-perso").style.display = "none";

  fermerFichePerso();
  // La liste se met à jour automatiquement via onSnapshot (temps réel).
}

function appliquerCouleurTheme(couleurCode) {
  document.getElementById("fenetre-fiche-perso").style.borderColor = couleurCode;
  document.getElementById("encart-portrait-perso").style.borderColor = couleurCode;
  document.getElementById("fiche-perso-header").style.borderBottomColor = couleurCode;
  document.getElementById("fiche-perso-header").style.boxShadow = `inset 0px -10px 20px -10px ${couleurCode}`;
}

function changerOngletPerso(evt, nomOnglet) {
  const contenus = document.getElementsByClassName("contenu-onglet");
  for (let i = 0; i < contenus.length; i++) { contenus[i].classList.remove("actif"); }
  const boutons = document.getElementsByClassName("onglet-btn");
  for (let i = 0; i < boutons.length; i++) { boutons[i].classList.remove("actif"); }
  
  document.getElementById(nomOnglet).classList.add("actif");
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add("actif");
  }

  // FORCE LA DÉSÉLECTION QUAND ON CHANGE D'ONGLET
  window.CARTE_EN_APERCU = null;
  const hdCard = document.getElementById("apercu-carte-hd-competence");
  if (hdCard) hdCard.style.display = "none";
  document.querySelectorAll('.banniere-carte').forEach(el => el.style.filter = "none");
}

function rendreFenetreDeplacable(element) {
  if (!element) return;
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = document.getElementById("fiche-perso-header");
  if (header) { header.onmousedown = glisserSouris; } else { element.onmousedown = glisserSouris; }

  function glisserSouris(e) {
    e = e || window.event; e.preventDefault();
    pos3 = e.clientX; pos4 = e.clientY;
    document.onmouseup = arreterGlisser;
    document.onmousemove = deplacementElement;
  }
  function deplacementElement(e) {
    e = e || window.event; e.preventDefault();
    pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
    pos3 = e.clientX; pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
  }
  function arreterGlisser() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// =========================================================================
//  GESTION GLOBALE DU CLIC (fermeture bulle volume)
// =========================================================================
document.addEventListener("click", function (event) {
  const bulle = document.getElementById("bulle-volume");
  const conteneurVolume = document.querySelector(".conteneur-volume-nav");
  if (bulle && bulle.style.display === "block" && conteneurVolume && !conteneurVolume.contains(event.target)) {
    bulle.style.display = "none";
  }
});

// =========================================================================
//  MOTEUR DE LA CARTE INTERACTIVE (ZOOM & DÉPLACEMENT)
// =========================================================================
let carteZoom = 1;
let cartePanX = 0;
let cartePanY = 0;
let isDraggingCarte = false;
let startDragX = 0;
let startDragY = 0;
let lastMapPinchDist = 0;
let lastMapPinchCenter = { x: 0, y: 0 };

window.recadrerCarte = function() {
  const carte = document.getElementById("carte-fond-jeu");
  if (!carte) return;

  const hauteurEcran = typeof window.hauteurDalle === "function" ? window.hauteurDalle() : window.innerHeight;
  const ratioX = window.innerWidth / 3840;
  const ratioY = hauteurEcran / 2160;

  carteZoom = Math.max(ratioX, ratioY);

  // Bord gauche de la carte collé au bord gauche de l'écran (même logique que la carte de combat)
  cartePanX = 0;
  cartePanY = (hauteurEcran - (2160 * carteZoom)) / 2;

  carte.style.transform = `translate(${cartePanX}px, ${cartePanY}px) scale(${carteZoom})`;
};

function initialiserCarteInteractive() {
  const conteneur = document.getElementById("conteneur-carte-fond");
  if (!conteneur) return;

  // Auto-cadrage au lancement
  window.recadrerCarte();

  // 1. Gérer le Zoom avec la molette PC (Centré sur le curseur)
  conteneur.addEventListener("wheel", function(e) {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * -0.1;
    const zoomFactor = Math.exp(delta);
    
    // Sécurité de blocage pour éviter les décalages infinis
    let nextZoom = carteZoom * zoomFactor;
    if (nextZoom < 0.1) nextZoom = 0.1;
    if (nextZoom > 5) nextZoom = 5;
    const actualZoomFactor = nextZoom / carteZoom;
    
    cartePanX = e.clientX - (e.clientX - cartePanX) * actualZoomFactor;
    cartePanY = e.clientY - (e.clientY - cartePanY) * actualZoomFactor;
    carteZoom = nextZoom;

    const carte = document.getElementById("carte-fond-jeu");
    if (carte) carte.style.transform = `translate(${cartePanX}px, ${cartePanY}px) scale(${carteZoom})`;
  }, { passive: false });

  // 2. Attraper la carte (Souris PC)
  conteneur.addEventListener("mousedown", function(e) {
    if (e.button !== 0) return;
    isDraggingCarte = true;
    startDragX = e.clientX - cartePanX;
    startDragY = e.clientY - cartePanY;
  });

  // 3. Déplacer la carte (Souris PC)
  window.addEventListener("mousemove", function(e) {
    if (!isDraggingCarte) return;
    e.preventDefault();
    cartePanX = e.clientX - startDragX;
    cartePanY = e.clientY - startDragY;

    const carte = document.getElementById("carte-fond-jeu");
    if (carte) carte.style.transform = `translate(${cartePanX}px, ${cartePanY}px) scale(${carteZoom})`;
  });

  // 4. Lâcher la carte (Souris PC)
  window.addEventListener("mouseup", function() { isDraggingCarte = false; });
  window.addEventListener("mouseleave", function() { isDraggingCarte = false; });

  // =========================================================
  // 5. GESTION TACTILE IPAD (PAN & PINCH TO ZOOM)
  // =========================================================
  conteneur.addEventListener("touchstart", function(e) {
      if (e.touches.length === 1) {
          isDraggingCarte = true;
          startDragX = e.touches[0].clientX - cartePanX;
          startDragY = e.touches[0].clientY - cartePanY;
      } else if (e.touches.length === 2) {
          isDraggingCarte = false;
          lastMapPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          lastMapPinchCenter = {
              x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
              y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };
      }
  }, { passive: false });

  conteneur.addEventListener("touchmove", function(e) {
      if (isDraggingCarte || e.touches.length === 2) {
          if (e.cancelable) e.preventDefault();
      }

      const carte = document.getElementById("carte-fond-jeu");
      if (!carte) return;

      if (e.touches.length === 1 && isDraggingCarte) {
          cartePanX = e.touches[0].clientX - startDragX;
          cartePanY = e.touches[0].clientY - startDragY;
          carte.style.transform = `translate(${cartePanX}px, ${cartePanY}px) scale(${carteZoom})`;
          
      } else if (e.touches.length === 2) {
          const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          const currentCenter = {
              x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
              y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };

          if (lastMapPinchDist > 0) {
              const zoomFactor = currentDist / lastMapPinchDist;
              
              // 🔻 CORRECTION : Sécurité anti-dérive quand on atteint le zoom limite
              let nextZoom = carteZoom * zoomFactor;
              if (nextZoom < 0.1) nextZoom = 0.1;
              if (nextZoom > 5) nextZoom = 5;
              const actualZoomFactor = nextZoom / carteZoom;
              
              cartePanX += currentCenter.x - lastMapPinchCenter.x;
              cartePanY += currentCenter.y - lastMapPinchCenter.y;
              
              // Centrage mathématique parfait sous les doigts de l'iPad
              cartePanX = currentCenter.x - (currentCenter.x - cartePanX) * actualZoomFactor;
              cartePanY = currentCenter.y - (currentCenter.y - cartePanY) * actualZoomFactor;
              
              carteZoom = nextZoom;
              carte.style.transform = `translate(${cartePanX}px, ${cartePanY}px) scale(${carteZoom})`;
          }

          lastMapPinchDist = currentDist;
          lastMapPinchCenter = currentCenter;
      }
  }, { passive: false });

  conteneur.addEventListener("touchend", function(e) {
      if (e.touches.length === 1) {
          lastMapPinchDist = 0;
          isDraggingCarte = true;
          startDragX = e.touches[0].clientX - cartePanX;
          startDragY = e.touches[0].clientY - cartePanY;
      } else if (e.touches.length === 0) {
          isDraggingCarte = false;
          lastMapPinchDist = 0;
      }
  });

  window.dessinerIconesCarte();
}

// --- CORRECTION DU BUG PLEIN ÉCRAN ---
// Si l'écran change de taille (ex: passage en plein écran), on attend 200ms
// pour laisser l'animation du navigateur se terminer, puis on recadre la carte !
window.addEventListener("resize", () => {
  if (document.getElementById("ecran-jeu").style.display !== "none") {
    setTimeout(window.recadrerCarte, 200);
  }
});

// =========================================================================
//  GÉNÉRATEUR DE GRILLE HEXAGONALE (TUILES)
// =========================================================================
window.tailleHexActuelle = 102; // Taille gravée

window.TUILES_EXCLUES = [
    "hex-0-0", "hex-1-0", "hex-2-0", "hex-3-0", "hex-4-0", "hex-5-0", "hex-6-0", "hex-7-0", "hex-8-0", "hex-9-0", "hex-10-0", "hex-11-0", "hex-12-0", "hex-13-0", "hex-14-0", "hex-15-0", "hex-16-0", "hex-17-0", "hex-18-0", "hex-19-0", "hex-20-0", "hex-21-0", "hex-22-0", "hex-0-1", "hex-1-1", "hex-2-1", "hex-3-1", "hex-4-1", "hex-5-1", "hex-17-1", "hex-18-1", "hex-19-1", "hex-20-1", "hex-21-1", "hex-0-2", "hex-1-2", "hex-2-2", "hex-19-2", "hex-20-2", "hex-21-2", "hex-22-2", "hex-0-3", "hex-1-3", "hex-7-3", "hex-8-3", "hex-9-3", "hex-19-3", "hex-20-3", "hex-21-3", "hex-0-4", "hex-1-4", "hex-7-4", "hex-8-4", "hex-9-4", "hex-20-4", "hex-21-4", "hex-22-4", "hex-0-5", "hex-1-5", "hex-7-5", "hex-8-5", "hex-20-5", "hex-21-5", "hex-0-6", "hex-1-6", "hex-2-6", "hex-7-6", "hex-8-6", "hex-9-6", "hex-21-6", "hex-22-6", "hex-0-7", "hex-1-7", "hex-2-7", "hex-7-7", "hex-8-7", "hex-21-7", "hex-0-8", "hex-1-8", "hex-2-8", "hex-3-8", "hex-8-8", "hex-22-8", "hex-0-9", "hex-1-9", "hex-2-9", "hex-7-9", "hex-9-9", "hex-21-9", "hex-0-10", "hex-1-10", "hex-2-10", "hex-9-10", "hex-21-10", "hex-22-10", "hex-0-11", "hex-1-11", "hex-10-11", "hex-20-11", "hex-21-11", "hex-0-12", "hex-1-12", "hex-3-12", "hex-10-12", "hex-11-12", "hex-19-12", "hex-20-12", "hex-21-12", "hex-22-12", "hex-0-13", "hex-1-13", "hex-2-13", "hex-3-13", "hex-4-13", "hex-6-13", "hex-17-13", "hex-18-13", "hex-19-13", "hex-20-13", "hex-21-13", "hex-0-14", "hex-1-14", "hex-2-14", "hex-3-14", "hex-4-14", "hex-5-14", "hex-6-14", "hex-7-14", "hex-8-14", "hex-9-14", "hex-10-14", "hex-11-14", "hex-12-14", "hex-13-14", "hex-14-14", "hex-15-14", "hex-16-14", "hex-17-14", "hex-18-14", "hex-19-14", "hex-20-14", "hex-21-14", "hex-22-14"
];

window.dessinerGrilleHexagonale = function() {
    const svg = document.getElementById("grille-hexagonale");
    if (!svg) return;

    const width = 3840;
    const height = 2160;

    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const size = window.tailleHexActuelle;
    const hexWidth = Math.sqrt(3) * size;
    const hexHeight = 2 * size;
    const xOffset = hexWidth;
    const yOffset = (3/4) * hexHeight;

    const cols = Math.ceil(width / hexWidth) + 1;
    const rows = Math.ceil(height / yOffset) + 1;

    let htmlPolygons = "";

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const idHex = `hex-${col}-${row}`;

            if (window.TUILES_EXCLUES.includes(idHex)) {
                continue;
            }

            let x = col * xOffset + (row % 2 === 1 ? hexWidth / 2 : 0);
            let y = row * yOffset;

            let points = "";
            for (let i = 0; i < 6; i++) {
                let angle_deg = 60 * i - 30;
                let angle_rad = Math.PI / 180 * angle_deg;
                let px = x + size * Math.cos(angle_rad);
                let py = y + size * Math.sin(angle_rad);
                points += `${px},${py} `;
            }

            htmlPolygons += `<polygon id="${idHex}" points="${points.trim()}" class="tuile-hex" style="pointer-events: none;"></polygon>`;
        }
    }

    svg.innerHTML = htmlPolygons;
};

// =========================================================================
//  PLACEMENT DU PION SUR LA GRILLE
// =========================================================================
window.placerPionSurHex = function(idHex) {
    const pion = document.getElementById("pion-groupe");
    if (!pion) return;
    pion.style.display = "none";
};

// =========================================================================
//  INITIALISATION (DOMContentLoaded)
// =========================================================================
document.addEventListener("DOMContentLoaded", function () {
  // TEMPS REEL : liste des joueurs (identification) + date en jeu (parchemin)
  ecouterJoueurs();
  ecouterDateEnJeu();
  ecouterPartiesEnCours();

  // 🔻 NOUVEAU : Chargement en cache de tous les effets du jeu au démarrage
  if (typeof window.chargerCacheEffetsBDD === "function") window.chargerCacheEffetsBDD();

  // NOUVEAU : Application des volumes sauvegardés au lancement
  window.appliquerVolumesAudio();

  // NOUVEAU : On active la carte interactive !
  initialiserCarteInteractive();

  // Rendre la fiche de personnage deplacable
  rendreFenetreDeplacable(document.getElementById("fenetre-fiche-perso"));

  // Pre-chargement des factions pour le menu deroulant de la fiche
  recupererFactionsPourSelect()
    .then(remplirSelectFactions)
    .catch((e) => console.error("Chargement des factions :", e));

  // Initialisation Outils IA
  document.getElementById("temp-range").value = localStorage.getItem("ivalis_IA_TEMPERATURE") || "1.0";
  document.getElementById("temp-input").value = localStorage.getItem("ivalis_IA_TEMPERATURE") || "1.0";
  document.getElementById("toggle-tokens").checked = localStorage.getItem("ivalis_SHOW_TOKENS") === "on";
  window.actualiserAffichageTokens();

  // Initialisation du Mode DEV
  const checkboxDev = document.getElementById("toggle-dev-mode");
  if (checkboxDev) checkboxDev.checked = localStorage.getItem("ivalis_DEV_MODE") === "on";
  window.actualiserDevMode();
});

// =========================================================================
// LOGIQUE DE NAVIGATION (INTERRUPTEURS SANS OVERLAY)
// =========================================================================

// 1. Fonction centrale pour tout fermer et nettoyer l'écran instantanément
window.fermerToutesLesFenetres = function() {
  // Fermer le chat
  const chatbox = document.getElementById('fenetre-chatbox');
  if (chatbox) chatbox.style.display = 'none';

  // --- Fermer l'interface de combat et le popup ---
  const fenetreCombat = document.getElementById('fenetre-combat');
  if (fenetreCombat) fenetreCombat.style.display = 'none';

  const popupRencontre = document.getElementById('modale-pre-combat');
  if (popupRencontre) popupRencontre.style.display = 'none';

  document.querySelectorAll('.bulle-portrait-hover-joueur, .bulle-portrait-hover-mj').forEach(img => img.style.display = 'none');

  const menuLat = document.getElementById('menu-lateral');
  const menuNav = document.getElementById('menu-navigation-bas');
  const btnFermerChat = document.getElementById('btn-fermer-chat-nouveau');
  const btnFermerCombat = document.getElementById('btn-fermer-combat');
  if (menuLat) menuLat.style.display = 'flex';
  if (menuNav) menuNav.style.display = 'flex';
  if (btnFermerChat) btnFermerChat.style.display = 'none';
  if (btnFermerCombat) btnFermerCombat.style.display = 'none';

  const btnEngrenageCombat = document.getElementById('btn-engrenage-combat');
  if (btnEngrenageCombat) btnEngrenageCombat.style.display = 'none';
  if (typeof window.fermerMenusCoulissantsCombat === "function") {
      window.fermerMenusCoulissantsCombat();
  }

  // Fermer les personnages
  const menuPerso = document.getElementById('conteneur-liste-personnages');
  if (menuPerso) {
    menuPerso.classList.remove('ouvert');
    menuPerso.style.display = 'none';
  }
  const fichePerso = document.getElementById('fenetre-fiche-perso');
  if (fichePerso) fichePerso.style.display = 'none';
  const voileSuppr = document.getElementById('voile-suppression-perso');
  if (voileSuppr) voileSuppr.style.display = 'none';

  // FORCE LA DÉSÉLECTION ET CACHE LA CARTE HD
  window.CARTE_EN_APERCU = null;
  const hdCard = document.getElementById("apercu-carte-hd-competence");
  if (hdCard) hdCard.style.display = "none";
  document.querySelectorAll('.banniere-carte').forEach(el => el.style.filter = "none");

  // Fermer les paramètres
  const menuParam = document.getElementById('conteneur-parametres');
  if (menuParam) {
    menuParam.classList.remove('ouvert');
    menuParam.style.display = 'none';
  }

  // Fermer le gestionnaire de temps
  const menuDate = document.getElementById('conteneur-gestion-date');
  if (menuDate) {
    menuDate.classList.remove('ouvert');
    menuDate.style.display = 'none';
  }
};

// 2. Boutons Chatbox
window.ouvrirChatbox = function() {
  const chatbox = document.getElementById('fenetre-chatbox');
  const estDejaOuvert = (chatbox.style.display === 'flex');
  
  window.fermerToutesLesFenetres();

  if (!estDejaOuvert) {
    chatbox.style.display = 'flex';

    // 🔻 NOUVEAU : Cacher les menus pour libérer l'écran et afficher le bouton de retour 🔻
    const menuLat = document.getElementById('menu-lateral');
    const menuNav = document.getElementById('menu-navigation-bas');
    const btnFermerChat = document.getElementById('btn-fermer-chat-nouveau');
    if (menuLat) menuLat.style.display = 'none';
    if (menuNav) menuNav.style.display = 'none';
    if (btnFermerChat) btnFermerChat.style.display = 'block';

    if (window.ID_PARTIE_COURANTE) {
      ecouterPersonnagesDeLaPartie(window.ID_PARTIE_COURANTE);
    }
  }
};

window.fermerChatbox = function() {
  // On joue le bruit du parchemin avant de fermer
  if (typeof window.jouerSonSurvolParchemin === "function") {
      window.jouerSonSurvolParchemin();
  }
  
  // Puis on ferme l'interface du chat pour restaurer la carte
  window.fermerToutesLesFenetres();
};

window.afficherMenusDansChat = function() {
  // 1. On joue le bruit du parchemin
  if (typeof window.jouerSonSurvolParchemin === "function") {
      window.jouerSonSurvolParchemin();
  }
  
  // 2. On fait réapparaître les menus sans toucher au chat
  const menuLat = document.getElementById('menu-lateral');
  const menuNav = document.getElementById('menu-navigation-bas');
  if (menuLat) menuLat.style.display = 'flex';
  if (menuNav) menuNav.style.display = 'flex';
  
  // 3. On cache ce bouton puisqu'il a fait son travail
  const btnActuel = document.getElementById('btn-fermer-chat-nouveau');
  if (btnActuel) btnActuel.style.display = 'none';
};

// 3. Bouton Personnages
window.ouvrirMenuPersonnages = function() {
  const menuPerso = document.getElementById('conteneur-liste-personnages');
  const estDejaOuvert = (menuPerso.style.display === 'block' || menuPerso.classList.contains('ouvert'));
  
  window.fermerToutesLesFenetres();

  if (!estDejaOuvert) {
    // La liste est déjà chargée en arrière-plan, on supprime juste le message de chargement !
    document.getElementById("chargement-persos").style.display = "none";
    document.getElementById("liste-html-persos").style.display = "block";
    
    menuPerso.style.display = 'block';
    setTimeout(() => { menuPerso.classList.add('ouvert'); }, 10);
  }
};

// 4. Bouton Paramètres
window.ouvrirParametres = function() {
  const menuParam = document.getElementById('conteneur-parametres');
  const estDejaOuvert = (menuParam.style.display === 'block' || menuParam.classList.contains('ouvert'));
  
  window.fermerToutesLesFenetres();

  if (!estDejaOuvert) {
    // --- ON CACHE TOUTES LES FENÊTRES POSSIBLES ---
    document.getElementById("etape-menu-parametres").style.display = "none";
    document.getElementById("etape-liste-instructions").style.display = "none";
    document.getElementById("etape-editeur-instruction").style.display = "none";
    document.getElementById("etape-confirmation-suppression").style.display = "none";
    document.getElementById("etape-cles-api").style.display = "none";
    document.getElementById("etape-menu-outils").style.display = "none";
    document.getElementById("etape-ia-parametre").style.display = "none";

    // --- ON N'AFFICHE QUE LE MOT DE PASSE ---
    document.getElementById("input-secret-parametres").value = "";
    document.getElementById("erreur-mdp-parametres").style.opacity = "0";

    document.getElementById("etape-mdp-parametres").style.display = "block";
    document.getElementById("etape-mdp-parametres").style.opacity = "1";

    menuParam.style.display = 'block';
    setTimeout(() => { menuParam.classList.add('ouvert'); }, 10);
  }
};

// =========================================================================
//  OUTILS (Température & Tokens)
// =========================================================================

window.syncTemperature = function(source) {
    const range = document.getElementById("temp-range");
    const input = document.getElementById("temp-input");
    if (source === 'range') input.value = range.value;
    if (source === 'input') range.value = input.value;
};

window.sauvegarderTemperature = function() {
    const val = document.getElementById("temp-input").value;
    localStorage.setItem("ivalis_IA_TEMPERATURE", val);
    naviguerFenetre('etape-ia-parametre', 'etape-menu-outils');
};

window.basculerAffichageTokens = function(estActive) {
    localStorage.setItem("ivalis_SHOW_TOKENS", estActive ? "on" : "off");
    window.actualiserAffichageTokens();
};

window.basculerDevMode = function(estActive) {
    localStorage.setItem("ivalis_DEV_MODE", estActive ? "on" : "off");
    window.actualiserDevMode();
};

window.actualiserDevMode = function() {
    const isDev = localStorage.getItem("ivalis_DEV_MODE") === "on";
    
    const btnDevSkip = document.getElementById("btn-dev-skip-creation");
    if (btnDevSkip) btnDevSkip.style.display = isDev ? "inline-block" : "none";
    
    const ongletDev = document.getElementById("onglet-btn-dev");
    if (ongletDev) {
        if (isDev) {
            ongletDev.style.display = "block";
        } else {
            ongletDev.style.display = "none";
            const contenuDev = document.getElementById("onglet-dev");
            if (contenuDev && contenuDev.classList.contains("actif")) {
                const btnCaracs = document.querySelector("button[onclick*='onglet-caracs']");
                if (btnCaracs) changerOngletPerso({ currentTarget: btnCaracs }, 'onglet-caracs');
            }
        }
    }
    
    if (isDev) { console.log("🛠️ Mode Développeur : ACTIVÉ"); } 
    else { console.log("🛠️ Mode Développeur : DÉSACTIVÉ"); }
};

window.actualiserAffichageTokens = function() {
    const affichage = document.getElementById("affichage-tokens");
    const spanTokens = document.getElementById("valeur-tokens");
    if (!affichage || !spanTokens) return;

    const show = localStorage.getItem("ivalis_SHOW_TOKENS") === "on";
    if (show) {
        affichage.style.display = "block";
        const total = parseInt(localStorage.getItem("ivalis_TOTAL_TOKENS") || "0");
        spanTokens.innerText = total.toLocaleString(); // Met des espaces pour les milliers
    } else {
        affichage.style.display = "none";
    }
};

window.ajouterTokens = function(montant) {
    let total = parseInt(localStorage.getItem("ivalis_TOTAL_TOKENS") || "0");
    total += montant;
    localStorage.setItem("ivalis_TOTAL_TOKENS", total);
    window.actualiserAffichageTokens();
};

// =========================================================================
//  MOTEUR DE CARACTÉRISTIQUES (ACHAT DE POINTS 5E)
// =========================================================================

// 🔻 C'EST ICI QUE TU POURRAS CHANGER LE NOMBRE DE POINTS POUR TES TESTS 🔻
window.TOTAL_POINTS_CREATION = 22;

const NOMS_CARACS = [
  { id: "force", nom: "FORCE", desc: "Mesure la puissance physique.", comp: "Athlétisme" },
  { id: "dex", nom: "DEXTÉRITÉ", desc: "Mesure l'agilité, les réflexes et l'équilibre.", comp: "Acrobaties / Escamotage / Discrétion" },
  { id: "con", nom: "CONSTITUTION", desc: "Mesure la santé, l'endurance et la force vitale.", comp: "" },
  { id: "int", nom: "INTELLIGENCE", desc: "Mesure la mémoire et le raisonnement.", comp: "Arcanes / Histoire / Investigation / Nature / Religion" },
  { id: "sag", nom: "SAGESSE", desc: "Mesure l'intuition, la perception et la connexion avec le monde.", comp: "Dressage / Intuition / Médecine / Perception / Survie" },
  { id: "cha", nom: "CHARISME", desc: "Mesure la force de personnalité et l'éloquence.", comp: "Duperie / Intimidation / Performance / Persuasion" }
];

window.statsCreation = { force: 8, dex: 8, con: 8, int: 8, sag: 8, cha: 8 };

function getCoutStat(valeur) {
  const couts = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9, 16: 12 };
  return couts[valeur] || 0;
}

function getModificateur(valeur) {
  const mod = Math.floor((valeur - 10) / 2);
  return mod; // Sécurisé (renvoie un chiffre pur)
}

function calculerPointsRestants() {
  let depenses = 0;
  for (let key in window.statsCreation) {
    depenses += getCoutStat(window.statsCreation[key]);
  }
  // 🔻 On utilise notre nouvelle variable ici !
  return window.TOTAL_POINTS_CREATION - depenses;
}

// 1. Chargement depuis Firebase (et Cache)
window.chargerCaracteristiques = async function(idPersonnage) {
  const divVide = document.getElementById("caracs-vide");
  const divAffiche = document.getElementById("caracs-affiche");
  const btnCreer = document.getElementById("btn-creer-caracs");
  const msgErreur = document.getElementById("msg-sauvegarde-requise");

  divVide.style.display = "none";
  divAffiche.style.display = "none";
  msgErreur.style.display = "none";

  if (!idPersonnage || idPersonnage === "") {
    divVide.style.display = "block";
    btnCreer.style.display = "none";
    msgErreur.style.display = "block";
    return;
  }

  const proprioId = document.getElementById("champ-id-joueur-perso").value;
  const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
  const estProprietaire = (proprioId === currentUserId) || (proprioId === "");

  // 🔻 NOUVEAU : 1. LECTURE DU CACHE IMMÉDIATE 🔻
  const cleCacheCaracs = "ivalis_caracs_" + idPersonnage;
  const memoireCaracs = localStorage.getItem(cleCacheCaracs);
  
  if (memoireCaracs) {
      afficherStatsFinales(JSON.parse(memoireCaracs));
      divAffiche.style.display = "block";
  }

  // 🔻 NOUVEAU : 2. REQUÊTE SILENCIEUSE EN ARRIÈRE-PLAN 🔻
  try {
    const snap = await getDoc(doc(db, COL.CARACTERISTIQUES, idPersonnage));
    if (snap.exists()) {
      const data = snap.data();
      localStorage.setItem(cleCacheCaracs, JSON.stringify(data)); // Mise à jour du cache
      afficherStatsFinales(data);
      divAffiche.style.display = "block";
    } else if (!memoireCaracs) {
      divVide.style.display = "block";
      btnCreer.style.display = estProprietaire ? "inline-block" : "none";
    }
  } catch (e) {
    console.error("Erreur lecture caracs:", e);
  }
};

// 2. Interface de la Modale de Création
window.ouvrirModaleCreationCaracs = function() {
  window.statsCreation = { force: 8, dex: 8, con: 8, int: 8, sag: 8, cha: 8 };
  actualiserModaleCaracs();
  document.getElementById("modale-creation-caracs").style.display = "block";
};

window.fermerModaleCreationCaracs = function() {
  document.getElementById("modale-creation-caracs").style.display = "none";
};

window.actualiserModaleCaracs = function() {
  const conteneur = document.getElementById("grille-creation-caracs");
  conteneur.innerHTML = "";
  
  const pointsRestants = calculerPointsRestants();
  const spanPoints = document.getElementById("points-restants");
  spanPoints.innerText = pointsRestants;
  spanPoints.style.color = pointsRestants === 0 ? "#1b6e3a" : (pointsRestants < 0 ? "#ff4c4c" : "#5c3a21");

  // =========================================================
  // MISE À JOUR EN TEMPS RÉEL DE LA PRÉVISUALISATION
  // =========================================================
  const rawModCon = Math.floor((window.statsCreation.con - 10) / 2);

  const spanPv = document.getElementById("creation-pv-max");
  if (spanPv) spanPv.innerText = 50 + (8 * rawModCon);
  // =========================================================

  // NOUVEAU : On scanne si le joueur a déjà une stat à 16
  const aUneStatA16 = Object.values(window.statsCreation).some(val => val >= 16);

  NOMS_CARACS.forEach(c => {
    const val = window.statsCreation[c.id];
    const mod = getModificateur(val);
    const modAff = mod >= 0 ? "+" + mod : mod;
    const coutSuivant = getCoutStat(val + 1) - getCoutStat(val);
    
    // Logique de blocage du bouton "-"
    const btnMoinsDisabled = val <= 8 ? "disabled" : "";
    
    // Logique de blocage du bouton "+" avec la nouvelle règle stricte
    // Bloqué si : on est déjà à 16, OU (quelqu'un est à 16 et on est à 15), OU pas assez de points.
    const limiteAtteinte = (val >= 16) || (aUneStatA16 && val >= 15);
    const btnPlusDisabled = (limiteAtteinte || pointsRestants < coutSuivant) ? "disabled" : "";

    const html = `
      <div class="ligne-creation-carac">
        <div class="nom-carac-creation">${c.nom}</div>
        <div class="controle-carac">
          <button class="btn-plus-moins" ${btnMoinsDisabled} onclick="modifierStat('${c.id}', -1)">-</button>
          <div class="valeur-carac-creation">${val}</div>
          <button class="btn-plus-moins" ${btnPlusDisabled} onclick="modifierStat('${c.id}', 1)">+</button>
          <div class="modif-carac-creation">(${modAff})</div>
        </div>
      </div>
    `;
    conteneur.insertAdjacentHTML('beforeend', html);
  });

  const btnValider = document.getElementById("btn-valider-caracs");
  if (pointsRestants === 0) {
    btnValider.style.opacity = "1";
    btnValider.style.pointerEvents = "auto";
  } else {
    btnValider.style.opacity = "0.5";
    btnValider.style.pointerEvents = "none";
  }
};

window.modifierStat = function(idStat, delta) {
  if (typeof window.jouerSonClic === "function") window.jouerSonClic();
  window.statsCreation[idStat] += delta;
  actualiserModaleCaracs();
};

window.validerCreationCaracs = async function() {
  const pointsRestants = calculerPointsRestants();
  if (pointsRestants !== 0) return;

  const idPersonnage = document.getElementById("champ-id-personnage").value;
  if (!idPersonnage) return;

  const btnValider = document.getElementById("btn-valider-caracs");
  btnValider.innerText = "Création...";
  btnValider.style.pointerEvents = "none";

  try {
    // =========================================================
    // CALCUL ET SAUVEGARDE SÉCURISÉE SUR LA FICHE PERSONNAGE
    // =========================================================
    const rawModCon = Math.floor((window.statsCreation.con - 10) / 2);
    const rawModForce = Math.floor((window.statsCreation.force - 10) / 2);

    // NOUVELLE FORMULE :
    const pvMax = 50 + (8 * rawModCon);
    const objetsMax = 3 + rawModForce;

    await updateDoc(doc(db, "Personnages", idPersonnage), {
        PV_Max: pvMax,
        Objets_Max: objetsMax,
        Fatigue_Max: 100,
        Regeneration: 30,
        Esquive: 15,
        Parade: 0,
        Critique: 10,
        Def_Physique: 0,
        Def_Magique: 0,
        Competences_Max: 6
    });

    await setDoc(doc(db, COL.CARACTERISTIQUES, idPersonnage), window.statsCreation);
    
    // 🔻 NOUVEAU : Sauvegarde immédiate dans le cache local 🔻
    localStorage.setItem("ivalis_caracs_" + idPersonnage, JSON.stringify(window.statsCreation));
    
    window.fermerModaleCreationCaracs();
    window.chargerCaracteristiques(idPersonnage);

    // =========================================================
    // NOUVEAU : PASSAGE À L'ÉTAPE 3 (OUVERTURE DE LA FICHE)
    // Si la fiche n'est pas déjà ouverte, on l'ouvre !
    // =========================================================
    const fiche = document.getElementById("fenetre-fiche-perso");
    if (fiche.style.display === "none" || fiche.style.display === "") {
        const prenomNom = document.getElementById("titre-nom-personnage").innerText;
        const prenom = prenomNom.split(" ")[0] || "";
        const nom = prenomNom.substring(prenom.length).trim() || "";
        const couleur = document.getElementById("champ-couleur-token").value || "#2a1a0f";
        
        window.ouvrirFichePerso(idPersonnage, prenom, nom, couleur);
    }
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la création des caractéristiques.");
  }

  btnValider.innerText = "Valider";
  btnValider.style.pointerEvents = "auto";
};

// 3. Rendu Final (Texte exact demandé)
window.afficherStatsFinales = function(dataStats) {
  const conteneur = document.getElementById("conteneur-stats-affichage");
  conteneur.innerHTML = "";

  // =========================================================
  // MISE À JOUR DU BANDEAU FINAL SUR LA FICHE
  // =========================================================
  const rawModConFiche = Math.floor(((dataStats.con || 8) - 10) / 2);

  const affPv = document.getElementById("affichage-pv-max");
  // NOUVELLE FORMULE :
  if (affPv) affPv.innerText = 50 + (8 * rawModConFiche);
  // =========================================================

  NOMS_CARACS.forEach(c => {
    const val = dataStats[c.id] || 8;
    const mod = getModificateur(val);
    const modAff = mod >= 0 ? "+" + mod : mod;
    
    // NOUVEAU : Structure avec l'image du D20 à gauche
    let html = `
      <div class="bloc-stat-final" style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
        
        <img src="https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782422251/IMG_1714_l0bco5.png" class="icone-d20-stat" alt="D20" onclick="jouerSonClic(); lancerJetDeCaracteristique('${c.id}', '${c.nom}', ${val}, ${mod})">
        
        <div>
            <div class="titre-stat-final" style="margin-bottom: 4px;">${c.nom} (${val}) - (${modAff}) : <span style="font-weight: normal; color: #4a2e1b;">${c.desc}</span></div>
    `;
    
    if (c.comp !== "") {
      html += `<div class="comp-stat-final">${c.comp}</div>`;
    }
    
    html += `</div></div>`; // Fermeture du bloc texte et du bloc flex parent
    conteneur.insertAdjacentHTML('beforeend', html);
  });
};

// =========================================================================
//  GESTION DE LA DATE EN JEU (AVANCER LE TEMPS)
// =========================================================================

window.joursAAjouter = 0;

window.ouvrirGestionDate = function() {
    const menuDate = document.getElementById('conteneur-gestion-date');
    const estDejaOuvert = (menuDate.style.display === 'block' || menuDate.classList.contains('ouvert'));
    
    // La commande de fermeture globale a été retirée d'ici pour laisser le chat ouvert !

    if (!estDejaOuvert) {
        // Mise à jour de l'affichage local avec les données de Firebase
        document.getElementById('gestion-date-jour').innerText = window.DATE_EN_JEU_ACTUELLE.jour || "...";
        document.getElementById('gestion-date-an').innerText = window.DATE_EN_JEU_ACTUELLE.annee || "...";
        
        window.joursAAjouter = 0;
        document.getElementById('affichage-jours-plus').innerText = "0";

        menuDate.style.display = 'block';
        setTimeout(() => { menuDate.classList.add('ouvert'); }, 10);
    }
};

window.fermerGestionDate = function() {
    const menuDate = document.getElementById('conteneur-gestion-date');
    menuDate.classList.remove('ouvert');
    setTimeout(() => { menuDate.style.display = 'none'; }, 600);
};

window.modifierJoursAAjouter = function(delta) {
    window.joursAAjouter += delta;
    if (window.joursAAjouter < 0) window.joursAAjouter = 0; // Bloque en dessous de 0
    document.getElementById('affichage-jours-plus').innerText = window.joursAAjouter;
};

// =========================================================================
//  NOUVEAU : ACCÉLÉRATION DU DÉFILEMENT (Clic prolongé)
// =========================================================================

window.timerDefilementJours = null;
window.vitesseDefilement = 300; // Vitesse de départ (en millisecondes)

window.demarrerDefilementJours = function(delta) {
    // 1. On fait l'action une première fois immédiatement (pour un clic normal)
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    window.modifierJoursAAjouter(delta);

    // 2. On réinitialise la vitesse au cas où on avait cliqué frénétiquement avant
    window.vitesseDefilement = 300;

    // 3. La boucle qui va s'accélérer
    const boucleDefilement = () => {
        window.modifierJoursAAjouter(delta);
        
        // On réduit le délai de 20% à chaque tour (sans descendre en dessous de 30ms pour ne pas crasher)
        if (window.vitesseDefilement > 30) {
            window.vitesseDefilement = Math.floor(window.vitesseDefilement * 0.8);
        }
        
        window.timerDefilementJours = setTimeout(boucleDefilement, window.vitesseDefilement);
    };

    // On attend 500ms avant de déclencher le mode "défilement continu"
    window.timerDefilementJours = setTimeout(boucleDefilement, 500);
};

window.arreterDefilementJours = function() {
    if (window.timerDefilementJours) {
        clearTimeout(window.timerDefilementJours);
        window.timerDefilementJours = null;
    }
};

window.validerChangementDate = async function() {
    if (window.joursAAjouter === 0) {
        window.fermerGestionDate();
        return;
    }

    const btnValider = document.getElementById("btn-valider-temps");
    btnValider.innerText = "Calcul...";
    btnValider.style.pointerEvents = "none";

    let jourActuel = parseInt(window.DATE_EN_JEU_ACTUELLE.jour) || 1;
    let anneeActuelle = parseInt(window.DATE_EN_JEU_ACTUELLE.annee) || 1;

    // On mémorise le nombre de jours passés avant de l'ajouter
    const joursEcoules = window.joursAAjouter; 
    jourActuel += window.joursAAjouter;

    // --- LOGIQUE DE CALENDRIER ---
    const JOURS_PAR_AN = 365; 

    while (jourActuel > JOURS_PAR_AN) {
        jourActuel -= JOURS_PAR_AN;
        anneeActuelle += 1;
    }

    try {
        // 1. Mise à jour de la date dans la base de données
        await updateDoc(doc(db, COL.DATE, DOC_DATE), {
            Jour: jourActuel.toString(),
            Annee: anneeActuelle.toString()
        });

        // =========================================================
        // NOUVEAU : Message automatique du Maître du Temps
        // =========================================================
        if (window.ID_PARTIE_COURANTE) {
            // Petite condition pour le singulier / pluriel
            let texteAnnonce = joursEcoules > 1 
                ? `${joursEcoules} jours se sont écoulés...` 
                : `1 jour s'est écoulé...`;
            
            const msgTemps = {
                ID_Partie: window.ID_PARTIE_COURANTE,
                Auteur_ID: "SYSTEME_TEMPS", 
                Auteur_Nom: "Maître du Temps",
                Auteur_Couleur: "#c2a878", // Un joli doré/sable pour le liseret du message
                Texte: `⏳ *${texteAnnonce}*`, // En italique avec un petit sablier
                Date_Jour: jourActuel.toString(), // On utilise la nouvelle date pour l'entête
                Date_An: anneeActuelle.toString(),
                Timestamp: new Date().getTime()
            };
            
            // Envoi furtif dans l'historique du chat
            await addDoc(collection(db, COL.MESSAGES), msgTemps);
        }
        // =========================================================

        window.fermerGestionDate();
    } catch (e) {
        console.error("Erreur lors du changement de date :", e);
        alert("Le parchemin refuse de se réécrire (Erreur réseau).");
    } finally {
        btnValider.innerText = "Avancer le temps";
        btnValider.style.pointerEvents = "auto";
    }
};

// =========================================================================
//  MÉCANIQUE DE JET DE DÉS (SYNCHRONISÉE)
// =========================================================================

window.DERNIER_JET_DES = 0;
window.ID_MON_LANCER = "";

window.lancerJetDeCaracteristique = async function(idCarac, nomCarac, valeurCarac, modCarac) {
    if (!window.ID_PARTIE_COURANTE) return;

    // =========================================================
    //  SÉCURITÉ ANTI-TRICHE (TOUR DE PAROLE)
    // =========================================================
    const partie = window.PARTIE_DATA || {};
    const ordre = partie.Ordre_Initiative || [];
    const indexTour = partie.Index_Initiative !== undefined ? partie.Index_Initiative : 999;
    
    const idPersoActif = ordre[indexTour]; 
    const idPersonnageFiche = document.getElementById("champ-id-personnage").value; 

    if (idPersonnageFiche !== idPersoActif) {
        let nomActif = "au Maître du Jeu";
        
        if (idPersoActif && window.PERSOS_PARTIE) {
            const persoInfo = window.PERSOS_PARTIE.find(p => p.idPersonnage === idPersoActif);
            if (persoInfo) nomActif = `à ${persoInfo.prenom}`;
        }
        
        // --- NOUVEAU : Le message immersif au lieu du alert() ---
        const fiche = document.getElementById("fenetre-fiche-perso");
        let msgErreur = document.getElementById("erreur-jet-immersif");

        // Si le bloc n'existe pas encore, on le crée
        if (!msgErreur) {
            msgErreur = document.createElement("div");
            msgErreur.id = "erreur-jet-immersif";
            msgErreur.style.cssText = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(40, 10, 10, 0.95); color: #ff4c4c; padding: 20px 40px; border: 2px solid #ff4c4c; border-radius: 12px; font-weight: bold; font-size: 24px; text-shadow: 0 0 10px red; box-shadow: 0 0 40px rgba(255, 0, 0, 0.9); z-index: 2000; text-align: center; pointer-events: none; opacity: 0; transition: opacity 0.3s ease;";
            fiche.appendChild(msgErreur);
        }

        // On injecte le texte et on l'affiche
        if (typeof window.jouerSonClic === "function") window.jouerSonClic(); // Petit bruit d'erreur optionnel
        msgErreur.innerHTML = `Action impossible<br><span style="font-size: 18px; color: #e8d5a5;">C'est ${nomActif} de parler.</span>`;
        msgErreur.style.opacity = "1";

        // On le fait disparaître en fondu 2.5 secondes plus tard
        setTimeout(() => { 
            if (msgErreur) msgErreur.style.opacity = "0"; 
        }, 2500);

        return; // On bloque le jet de dé
    }
    // =========================================================

    // Si la sécurité est passée, on lance le dé normalement
    const nomPersonnage = document.getElementById("titre-nom-personnage").innerText;
    
    const resultatD20 = Math.floor(Math.random() * 20) + 1;
    const total = resultatD20 + modCarac;
    
    window.ID_MON_LANCER = Math.random().toString(36).substring(2, 10);

    await updateDoc(doc(db, COL.PARTIES, window.ID_PARTIE_COURANTE), {
        Action_Des: {
            idLancer: window.ID_MON_LANCER,
            nomPerso: nomPersonnage,
            caract: nomCarac,
            resultatBrut: resultatD20,
            modificateur: modCarac,
            totalFinal: total,
            timestamp: new Date().getTime()
        }
    });
    
    fermerFichePerso();
};

window.jouerAnimationDesGlobal = function(donnees) {
    const overlay = document.getElementById("overlay-jet-des");
    const rouleau = document.getElementById("rouleau-parchemin");
    const titre = document.getElementById("titre-jet-des");
    const flash = document.getElementById("flash-resultat-des");
    const audio = document.getElementById("audio-roulette");
    
    titre.innerText = `Jet de ${donnees.caract} pour ${donnees.nomPerso}`;
    flash.classList.remove("flash-des-actif");
    rouleau.innerHTML = "";
    
    // 1. CRÉATION DU PARCHEMIN PHYSIQUE
    let sequence = [];
    
    for (let i = 0; i < 4; i++) { sequence.push(""); }
    for (let i = 20; i >= 1; i--) { sequence.push(i); }
    for (let i = 0; i < 2; i++) { sequence.push(""); }
    
    // On dessine tout ça dans le HTML
    sequence.forEach((num) => {
        if (num === "") {
            // Espace vierge
            rouleau.insertAdjacentHTML('beforeend', `<div class="chiffre-roulette"></div>`);
        } else if (num === 20) {
            // NOUVEAU : Le 20 en doré avec un bel effet de brillance
            rouleau.insertAdjacentHTML('beforeend', `<div class="chiffre-roulette" style="color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 1px 1px 2px #5c3a21;">${num}</div>`);
        } else if (num === 1) {
            // NOUVEAU : Le 1 en rouge sang
            rouleau.insertAdjacentHTML('beforeend', `<div class="chiffre-roulette" style="color: #d32f2f; text-shadow: 0 0 5px rgba(211, 47, 47, 0.5);">${num}</div>`);
        } else {
            // Les autres chiffres normaux
            rouleau.insertAdjacentHTML('beforeend', `<div class="chiffre-roulette">${num}</div>`);
        }
    });

    // 2. MATHÉMATIQUES D'ALIGNEMENT
    const hauteurChiffre = 70;
    const offsetFleche = 110; 
    
    const indexDepart = sequence.length - 2; 
    const positionDepart = offsetFleche - (indexDepart * hauteurChiffre);
    
    const indexFin = sequence.indexOf(donnees.resultatBrut);
    const positionFin = offsetFleche - (indexFin * hauteurChiffre);

    const distanceParcourue = indexDepart - indexFin;
    const dureeAnimation = 1.5 + (distanceParcourue * 0.18); 

    // 3. INITIALISATION VISUELLE
    rouleau.style.transition = "none";
    rouleau.style.transform = `translateY(${positionDepart}px)`;
    
    overlay.style.display = "flex";
    
    // Lancement de l'audio en boucle
    if (audio) { 
        audio.volume = window.PARAMETRES_AUDIO.interface * window.PARAMETRES_AUDIO.general;
        audio.currentTime = 0; 
        audio.play().catch(()=>{}); 
    }

    void rouleau.offsetWidth;

    // 4. L'ANIMATION À VITESSE CONSTANTE ("linear")
    rouleau.style.transition = `transform ${dureeAnimation}s linear`;
    rouleau.style.transform = `translateY(${positionFin}px)`;

    // 5. LA FIN DU SPECTACLE
    setTimeout(() => {
        // Coupure de l'audio
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        
        // NOUVEAU : Application des couleurs sur l'explosion du résultat
        if (donnees.resultatBrut === 20) {
            flash.style.color = "#ffd700"; // Doré
            flash.style.textShadow = "0 0 20px #ffd700, 0 0 40px #ffaa00, 2px 2px 10px black";
        } else if (donnees.resultatBrut === 1) {
            flash.style.color = "#ff4c4c"; // Rouge vif
            flash.style.textShadow = "0 0 20px #ff4c4c, 0 0 40px #8b0000, 2px 2px 10px black";
        } else {
            flash.style.color = "white"; // Normal
            flash.style.textShadow = "0 0 20px white, 0 0 40px #00ffff, 2px 2px 10px black";
        }

        flash.innerText = donnees.resultatBrut;
        flash.classList.add("flash-des-actif");

        setTimeout(() => {
            overlay.style.display = "none";
            
            if (donnees.idLancer === window.ID_MON_LANCER) {
                const chatInput = document.getElementById("input-chat");
                const modTexte = donnees.modificateur >= 0 ? `+${donnees.modificateur}` : donnees.modificateur;
                
                // Le message dans le chat
                const texteFormatte = `🎲 Jet de **${donnees.caract}** pour **${donnees.nomPerso}** : Résultat : ${donnees.resultatBrut} ${modTexte} = **${donnees.totalFinal}**`;
                
                const jourEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.jour : "";
                const anEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.annee : "";
                
                let auteurCouleur = "#ffffff";
                let idAuteur = "MJ";
                
                if (window.PERSOS_PARTIE) {
                    const persoTrouve = window.PERSOS_PARTIE.find(p => `${p.prenom} ${p.nom}`.trim() === donnees.nomPerso.trim() || p.prenom === donnees.nomPerso);
                    if (persoTrouve) {
                        auteurCouleur = persoTrouve.couleur;
                        idAuteur = persoTrouve.idPersonnage;
                    }
                }

                const nouveauMsgDes = {
                    ID_Partie: window.ID_PARTIE_COURANTE,
                    Auteur_ID: idAuteur,
                    Auteur_Nom: donnees.nomPerso,
                    Auteur_Couleur: auteurCouleur,
                    Texte: texteFormatte,
                    Date_Jour: jourEnJeu,
                    Date_An: anEnJeu,
                    Timestamp: new Date().getTime()
                };

                try {
                    addDoc(collection(db, COL.MESSAGES), nouveauMsgDes);
                } catch (e) {
                    console.error("Erreur lors de l'envoi automatique du dé :", e);
                }
                
                window.ID_MON_LANCER = ""; 
                if (chatInput) chatInput.focus();
            }
        }, 2500);

    }, dureeAnimation * 1000);
};

// =========================================================================
//  DICTÉE VOCALE (MICROPHONE)
// =========================================================================
window.recognition = null;
window.estEnTrainEcouter = false;
window.texteAvantEcoute = "";

window.toggleMicro = function() {
    const btn = document.getElementById("btn-micro");
    const input = document.getElementById("input-chat");

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        const zone = document.getElementById("zone-messages-chat");
        zone.insertAdjacentHTML('beforeend', `<div style="color: #ff4c4c; text-align: center; margin: 10px; font-weight: bold;">Ton navigateur ne supporte pas la magie de la voix (Utilise Google Chrome ou Microsoft Edge).</div>`);
        zone.scrollTop = zone.scrollHeight;
        return;
    }

    if (!window.estEnTrainEcouter) {
        // NOUVEAU : On recrée l'objet à chaque fois pour forcer l'iPad à ouvrir/fermer le canal proprement
        if (window.recognition) {
            window.recognition.abort();
            window.recognition = null;
        }

        window.recognition = new SpeechRecognition();
        window.recognition.lang = 'fr-FR';
        window.recognition.interimResults = true;
        window.recognition.continuous = true;

        window.recognition.onresult = (event) => {
            let transcriptTemp = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcriptTemp += event.results[i][0].transcript;
            }
            
            let separateur = (window.texteAvantEcoute.length > 0 && !window.texteAvantEcoute.endsWith(" ")) ? " " : "";
            input.value = window.texteAvantEcoute + separateur + transcriptTemp;
        };

        window.recognition.onend = () => {
            window.estEnTrainEcouter = false;
            if(btn) {
                btn.style.color = "white"; 
                btn.innerHTML = "🎤";
                btn.style.textShadow = "none";
            }
            
            // NOUVEAU : On force l'application à recharger le volume du jeu 0.5s après la fermeture du micro
            // pour dire à l'iPad "La communication est finie, remets la musique fort"
            setTimeout(() => {
                if (typeof window.appliquerVolumesAudio === "function") {
                    window.appliquerVolumesAudio();
                }
            }, 500);
        };

        window.texteAvantEcoute = input.value; 
        window.estEnTrainEcouter = true;
        window.recognition.start();
        
        btn.style.color = "#ff4c4c"; 
        btn.innerHTML = "🔴";
        btn.style.textShadow = "0 0 10px red";
        
    } else {
        // NOUVEAU : On utilise abort() au lieu de stop() pour forcer la coupure matérielle
        if (window.recognition) {
            window.recognition.abort();
        }
    }
};

// =========================================================================
//  INTERRUPTEUR GRILLE TACTIQUE (Lié au Fanion)
// =========================================================================
window.grilleEstVisible = false;

window.toggleGrille = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    const svg = document.getElementById("grille-hexagonale");
    if (!svg) return;
    
    window.grilleEstVisible = !window.grilleEstVisible;
    
    if (window.grilleEstVisible) {
        svg.style.opacity = "1";
    } else {
        svg.style.opacity = "0";
    }
};

// =========================================================================
//  MOUVEMENT DU PION ET DÉCOUVERTE DU MONDE (BDD + IA + DISTANCE)
// =========================================================================

// 1. Mathématiques : Convertit la grille pour calculer la distance exacte
window.calculerDistanceHex = function(hexA, hexB) {
    if (!hexA || !hexB || hexA === "" || hexB === "") return 0;
    
    const parseHex = (id) => {
        const parts = id.split('-');
        if (parts.length !== 3) return null;
        return { col: parseInt(parts[1]), row: parseInt(parts[2]) };
    };
    
    const a = parseHex(hexA);
    const b = parseHex(hexB);
    if (!a || !b) return 0;
    
    // Algorithme de conversion vers "Cube Coordinates" pour calculer la distance
    const toCube = (hex) => {
        let q = hex.col - Math.floor(hex.row / 2);
        let r = hex.row;
        return { q: q, r: r, s: -q - r };
    };
    
    const cA = toCube(a);
    const cB = toCube(b);
    
    return Math.max(Math.abs(cA.q - cB.q), Math.abs(cA.r - cB.r), Math.abs(cA.s - cB.s));
};

// 2. Outil automatisé pour avancer la date d'un coup
window.avancerTempsAuto = async function(joursDeVoyage) {
    if (joursDeVoyage <= 0) return;
    
    let jourActuel = parseInt(window.DATE_EN_JEU_ACTUELLE.jour) || 1;
    let anneeActuelle = parseInt(window.DATE_EN_JEU_ACTUELLE.annee) || 1;
    
    jourActuel += joursDeVoyage;
    const JOURS_PAR_AN = 365; 
    while (jourActuel > JOURS_PAR_AN) {
        jourActuel -= JOURS_PAR_AN;
        anneeActuelle += 1;
    }
    
    await updateDoc(doc(db, "Date_En_Jeu", "actuelle"), {
        Jour: jourActuel.toString(),
        Annee: anneeActuelle.toString()
    });

    if (window.ID_PARTIE_COURANTE) {
        let texteAnnonce = joursDeVoyage > 1 ? `${joursDeVoyage} jours de voyage se sont écoulés...` : `1 jour de voyage s'est écoulé...`;
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE,
            Auteur_ID: "SYSTEME_TEMPS", 
            Auteur_Nom: "Maître du Temps",
            Auteur_Couleur: "#c2a878",
            Texte: `⏳ *${texteAnnonce}*`,
            Date_Jour: jourActuel.toString(),
            Date_An: anneeActuelle.toString(),
            Timestamp: new Date().getTime()
        });
    }
};

// =========================================================================
//  DESSINATEUR D'ICÔNES DE CARTE & INFOBULLES
// =========================================================================
window.dessinerIconesCarte = async function() {
    const conteneur = document.getElementById("conteneur-icones-carte");
    if (!conteneur) return;
    conteneur.innerHTML = "";

    const q = query(collection(db, "Monde_Lieux"));
    const snap = await getDocs(q);

    const size = window.tailleHexActuelle;
    const hexWidth = Math.sqrt(3) * size;
    const hexHeight = 2 * size;
    const xOffset = hexWidth;
    const yOffset = (3/4) * hexHeight;

    const decalageX_icone = 0;  
    const decalageY_icone = -100;  

    snap.forEach(doc => {
        const data = doc.data();
        if (data.URL_Icone_Carte && data.Tuile_ID) {
            const parts = data.Tuile_ID.split('-');
            if (parts.length === 3) {
                const col = parseInt(parts[1]);
                const row = parseInt(parts[2]);
                
                let x = col * xOffset + (row % 2 === 1 ? hexWidth / 2 : 0);
                let y = row * yOffset + size; 

                const img = document.createElement("img");
                img.src = data.URL_Icone_Carte;
                img.className = "icone-carte-lieu";
                img.draggable = false; // Empêche l'image de rester "collée" si on drag la carte
                
                img.style.left = `${x + decalageX_icone}px`;
                img.style.top = `${y + decalageY_icone}px`;
                
                // --- NOUVEAU : LA GESTION DE LA SOURIS ---
                
                // Si on clique sur l'icône, on voyage directement
                img.onclick = function(e) {
                    e.stopPropagation(); 
                    window.masquerTooltipLieu();
                    window.deplacerPionVers(data.Tuile_ID);
                };

                // Si on entre sur l'icône
                img.onmouseenter = function(e) {
                    window.afficherTooltipLieu(data.Nom_Du_Lieu, data.URL_Cloudinary, e);
                };
                
                // Si on bouge la souris SUR l'icône, la bulle suit le curseur
                img.onmousemove = function(e) {
                    window.deplacerTooltipLieu(e);
                };
                
                // Si on quitte l'icône
                img.onmouseleave = function() {
                    window.masquerTooltipLieu();
                };

                conteneur.appendChild(img);
            }
        }
    });
};

// --- FONCTIONS DE L'INFOBULLE ---

window.afficherTooltipLieu = function(nom, urlImage, evenement) {
    let tooltip = document.getElementById("tooltip-lieu-map");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "tooltip-lieu-map";
        tooltip.innerHTML = `
            <img id="tooltip-lieu-image" src="" alt="Lieu">
            <div class="voile-assombrissant"></div>
            <div id="tooltip-lieu-nom"></div>
        `;
        document.body.appendChild(tooltip);
    }
    
    document.getElementById("tooltip-lieu-nom").innerText = nom;
    
    const imgEl = document.getElementById("tooltip-lieu-image");
    if (urlImage && urlImage !== "") {
        imgEl.src = urlImage;
        imgEl.style.display = "block";
    } else {
        imgEl.style.display = "none";
    }
    
    tooltip.style.display = "block";
    window.deplacerTooltipLieu(evenement);
};

window.deplacerTooltipLieu = function(evenement) {
    const tooltip = document.getElementById("tooltip-lieu-map");
    if (!tooltip || tooltip.style.display === "none") return;
    
    // Décalage pour que la bulle soit en bas à droite du curseur
    let x = evenement.clientX + 20;
    let y = evenement.clientY + 20;
    
    // Système anti-débordement d'écran (pour les icônes très à droite/en bas)
    if (x + 300 > window.innerWidth) x = evenement.clientX - 320;
    if (y + 180 > window.innerHeight) y = evenement.clientY - 200;
    
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
};

window.masquerTooltipLieu = function() {
    const tooltip = document.getElementById("tooltip-lieu-map");
    if (tooltip) tooltip.style.display = "none";
};

// 3. Le déclencheur au clic sur la carte (POUSSE VERS FIREBASE)
window.deplacerPionVers = async function(idHex) {
    return;
};

// 4. L'exécution finale (Gestion du temps, IA, BDD)
window.executerVoyage = async function(idHex, joursDeVoyage) {
    
    // A. LE GRAND NETTOYAGE (Pour TOUS les voyages)
    if (joursDeVoyage > 0 && typeof window.processusArchivageChat === "function") {
        console.log("🧹 [Voyage] Départ imminent : Archivage et nettoyage du chat...");
        // On archive les PNJ du lieu qu'on est en train de QUITTER avant même de commencer
        await window.processusArchivageChat();
    }

    // B. Avancer le calendrier (S'affiche dans le chat propre)
    if (joursDeVoyage > 0) {
        await window.avancerTempsAuto(joursDeVoyage);
    }

    // C. Vérifier le terrain et invoquer la magie
    const qLieu = query(collection(db, "Monde_Lieux"), where("Tuile_ID", "==", idHex));
    const snapLieux = await getDocs(qLieu);

    let idLieuCible = null;
    let nomDuLieu = "leur destination";

    if (!snapLieux.empty) {
        idLieuCible = snapLieux.docs[0].id;
        nomDuLieu = snapLieux.docs[0].data().Nom_Du_Lieu || "ce lieu";
        console.log("🗺️ Lieu connu détecté :", idLieuCible);
    } else {
        console.log("🌫️ Zone vierge ! Invocation de MIA_CARTO...");
        const ecranCharge = document.getElementById("ecran-chargement-ia");
        const titreCharge = document.getElementById("titre-chargement-ia");
        const imageCharge = document.getElementById("image-chargement-ia");

        if (ecranCharge && titreCharge && imageCharge) {
            titreCharge.innerText = "Voyage en cours ...";
            imageCharge.dataset.oldSrc = imageCharge.src;
            imageCharge.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782857488/voyage_yhokpd.png";
            ecranCharge.style.display = "flex";
        }

        if (typeof window.creerNouveauLieu === "function") {
            const resultatCarto = await window.creerNouveauLieu(idHex);
            if (resultatCarto) {
                idLieuCible = resultatCarto.id;
                nomDuLieu = resultatCarto.nom;
            }
        }

        if (ecranCharge) ecranCharge.style.display = "none";
        if (titreCharge) titreCharge.innerText = "Création de personnage en cours ...";
        if (imageCharge && imageCharge.dataset.oldSrc) imageCharge.src = imageCharge.dataset.oldSrc;
    }

    // D. Téléporter les joueurs et écrire le message final
    if (idLieuCible && window.ID_PARTIE_COURANTE) {
        // Mise à jour de la position dans la base de données
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Lieu_Actuel: idLieuCible
        });

        // Le message d'arrivée silencieux pour le MJ
        let texteArrivee = joursDeVoyage > 0 
            ? `*Après ${joursDeVoyage} jour(s) de voyage, le groupe arrive à ${nomDuLieu}.* (Narrateur, décris de manière immersive notre arrivée, l'atmosphère des lieux et ce que l'on voit en premier)`
            : `*Le groupe observe ${nomDuLieu}.* (Narrateur, décris de manière immersive l'atmosphère de ce lieu et ce que l'on y voit en premier)`;

        const jourEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.jour : "";
        const anEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.annee : "";

        // Envoi dans la chatbox
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE,
            Auteur_ID: "DESTIN", 
            Auteur_Nom: "Destin",
            Auteur_Couleur: "#c2a878", 
            Texte: texteArrivee,
            Date_Jour: jourEnJeu,
            Date_An: anEnJeu,
            Timestamp: new Date().getTime()
        });

        // E. Réveil du Narrateur
        if (typeof window.declencherTourIA === "function") {
            setTimeout(() => {
                window.declencherTourIA();
            }, 1500); 
        }
    }
};

// =========================================================================
//  GESTION DES RACES DU MONDE
// =========================================================================

window.ouvrirGestionRaces = async function() {
    const menuLat = document.getElementById('menu-lateral');
    if (menuLat) menuLat.style.display = 'none';

    naviguerFenetre('etape-menu-outils', 'etape-gestion-races');
    document.getElementById("chargement-races").style.display = "block";
    document.getElementById("conteneur-table-races").style.display = "none";
    await window.chargerTableauRaces();
};

window.fermerGestionRaces = function() {
    const menuLat = document.getElementById('menu-lateral');
    if (menuLat) menuLat.style.display = 'flex';
    naviguerFenetre('etape-gestion-races', 'etape-menu-outils');
};

window.chargerTableauRaces = async function() {
    const tbody = document.getElementById("tbody-races");
    tbody.innerHTML = "";
    
    try {
        const q = query(collection(db, "Monde_Races"));
        const snap = await getDocs(q);
        
        let racesList = [];
        snap.forEach(docSnap => {
            racesList.push({ id: docSnap.id, data: docSnap.data() });
        });
        
        // Tri alphabétique sur le nom
        racesList.sort((a, b) => {
            let nomA = a.data.Nom || "";
            let nomB = b.data.Nom || "";
            return nomA.localeCompare(nomB);
        });

        racesList.forEach(item => {
            window.ajouterLigneRaceHTML(item.id, item.data);
        });

        document.getElementById("chargement-races").style.display = "none";
        document.getElementById("conteneur-table-races").style.display = "block";

    } catch (e) {
        console.error("Erreur chargement races :", e);
        document.getElementById("chargement-races").innerText = "Interférence magique lors de la lecture.";
    }
};

window.ajouterLigneRaceHTML = function(id, data = {}) {
    const d = {
        Nom: data.Nom || "",
        Descriptif_Physique: data.Descriptif_Physique || "",
        Place_Monde: data.Place_Monde || ""
    };

    const tbody = document.getElementById("tbody-races");
    const tr = document.createElement("tr");
    tr.id = `ligne-race-${id}`;

    // Note : On utilise textarea pour permettre de rédiger du lore tranquillement
    tr.innerHTML = `
        <td><input type="text" id="race-nom-${id}" value="${d.Nom.replace(/"/g, '&quot;')}" placeholder="Nom de la race"></td>
        <td><textarea id="race-phys-${id}" placeholder="Physiologie, durée de vie...">${d.Descriptif_Physique}</textarea></td>
        <td><textarea id="race-place-${id}" placeholder="Culture, royaumes majeurs...">${d.Place_Monde}</textarea></td>
        <td style="text-align: center; vertical-align: middle;">
            <button class="btn-sauver-ligne" onclick="jouerSonClic(); window.sauvegarderRaceLigne('${id}')">💾</button>
            <button class="btn-sauver-ligne" style="background-color: darkred; margin-top:5px; padding:2px;" onclick="jouerSonClic(); window.supprimerRaceLigne('${id}')">🗑️</button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.sauvegarderRaceLigne = async function(id) {
    const btn = document.querySelector(`#ligne-race-${id} .btn-sauver-ligne`);
    if (btn) btn.innerText = "⏳";

    const newData = {
        Nom: document.getElementById(`race-nom-${id}`).value.trim(),
        Descriptif_Physique: document.getElementById(`race-phys-${id}`).value.trim(),
        Place_Monde: document.getElementById(`race-place-${id}`).value.trim()
    };

    try {
        await setDoc(doc(db, "Monde_Races", id), newData, { merge: true });
        if (btn) {
            btn.innerText = "✔️"; btn.style.backgroundColor = "#00ffff"; btn.style.color = "#000";
            setTimeout(() => { btn.innerText = "💾"; btn.style.backgroundColor = "#1b6e3a"; btn.style.color = "white"; }, 1500);
        }
    } catch (e) {
        console.error("Erreur sauvegarde race :", e);
        if (btn) btn.innerText = "✖️";
    }
};

window.supprimerRaceLigne = async function(id) {
    if(!confirm("Détruire définitivement cette race de l'univers d'Ivalis ?")) return;
    try {
        await deleteDoc(doc(db, "Monde_Races", id));
        document.getElementById(`ligne-race-${id}`).remove();
    } catch(e) { alert("Échec de la suppression."); }
};

window.ajouterLigneRaceVide = function() {
    const nouvelId = "RACE_" + Math.random().toString(36).substring(2, 9);
    window.ajouterLigneRaceHTML(nouvelId);
    const conteneur = document.getElementById("conteneur-table-races");
    conteneur.scrollTop = conteneur.scrollHeight;
};

// =========================================================================
//  EXPOSITION DES FONCTIONS AU SCOPE GLOBAL
//  (necessaire car index.html utilise des handlers inline onclick="...",
//   or un <script type="module"> a sa propre portee.)
// =========================================================================
Object.assign(window, {
  // Accueil / identification
  entrerDansLeJeu, jouerSonClic, validerIdentification,
  // Modales nouvelle partie / chargement
  ouvrirModalNouvellePartie, fermerModales, validerCle, validerCreationGroupe,
  ouvrirModalChargerPartie, demanderMdpPartie, validerMdpPartie,
  // Ecran de jeu
  jouerSonSurvolParchemin, toggleBulleVolume,
  afficherMenusDansChat: window.afficherMenusDansChat,
  fermerModalesJeu, demanderRetourMenu, demanderQuitterJeu,
  confirmerRetourMenu, confirmerQuitterJeu, recadrerCarte: window.recadrerCarte,
  // Parametres / Cerveau IA
  fermerParametres, naviguerFenetre, validerMdpParametres,
  ouvrirListeInstructions, basculerPoussoirIA, ouvrirEditeurInstruction,
  sauvegarderInstruction, demanderSuppression, annulerSuppression, validerSuppression,
  // Personnages / fiche perso
  fermerMenuPersonnages, ouvrirFichePerso, fermerFichePerso,
  sauvegarderFichePersonnage: sauvegarderFichePersonnage, // Expose pour creation_personnage.js
  ouvrirConfirmationSuppressionPerso,
  annulerSuppressionPerso, validerSuppressionPerso, appliquerCouleurTheme, changerOngletPerso,
  // Caracteristiques
  chargerCaracteristiques, ouvrirModaleCreationCaracs, fermerModaleCreationCaracs,
  modifierStat, validerCreationCaracs, lancerJetDeCaracteristique,
  // Cles API + generation d'image (front-end)
  ouvrirClesApi, sauvegarderClesApi, basculerAffichageCles,
  creerFichierExempleClesApi, importerFichierClesApi,
  afficherAlerteCles, fermerAlerteCles, ouvrirParametresDepuisAlerte,
  // Outils
  syncTemperature, sauvegarderTemperature, basculerAffichageTokens, basculerDevMode: window.basculerDevMode, toggleMicro,
  ouvrirRegenerationToken: window.ouvrirRegenerationToken,
  lancerRegenerationTokenManuelle: window.lancerRegenerationTokenManuelle,
  // Gestion Effets de Combat
  ouvrirGestionEffets: window.ouvrirGestionEffets,
  exporterEffetsBDD: window.exporterEffetsBDD, // 🔻 NOUVELLE LIGNE
  fermerGestionEffets: window.fermerGestionEffets,
  chargerTableauEffets: window.chargerTableauEffets,
  ajouterLigneEffetHTML: window.ajouterLigneEffetHTML,
  sauvegarderEffetLigne: window.sauvegarderEffetLigne,
  ajouterLigneEffetVide: window.ajouterLigneEffetVide,
  supprimerEffetLigne: window.supprimerEffetLigne,
  // Gestion des Races
  ouvrirGestionRaces: window.ouvrirGestionRaces,
  fermerGestionRaces: window.fermerGestionRaces,
  chargerTableauRaces: window.chargerTableauRaces,
  ajouterLigneRaceHTML: window.ajouterLigneRaceHTML,
  sauvegarderRaceLigne: window.sauvegarderRaceLigne,
  ajouterLigneRaceVide: window.ajouterLigneRaceVide,
  supprimerRaceLigne: window.supprimerRaceLigne,
  // Gestion de la Date
  ouvrirGestionDate, fermerGestionDate, modifierJoursAAjouter, validerChangementDate, demarrerDefilementJours, arreterDefilementJours,
  // Grille Hexagonale & Pion
  dessinerGrilleHexagonale: window.dessinerGrilleHexagonale,
  placerPionSurHex: window.placerPionSurHex,
  toggleGrille: window.toggleGrille,
  deplacerPionVers: window.deplacerPionVers,
  calculerDistanceHex: window.calculerDistanceHex,
  avancerTempsAuto: window.avancerTempsAuto,
  executerVoyage: window.executerVoyage,
  ecouterTerrainVTT: window.ecouterTerrainVTT,
  dessinerIconesCarte: window.dessinerIconesCarte,
});

// =========================================================================
//  BLOCAGE DU ZOOM NATIF APPLE (IPAD / IOS)
// =========================================================================
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});
document.addEventListener('gesturechange', function(e) {
    e.preventDefault();
});
document.addEventListener('gestureend', function(e) {
    e.preventDefault();
});
