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
  onSnapshot
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
  MESSAGES: "Messages_Chat"
};

// Identifiants des documents uniques (anciennes cellules fixes des Sheets)
const DOC_DATE = "actuelle";
const DOC_CONFIG_MDP = "config";

// =========================================================================
//  VARIABLES GLOBALES (les "badges" de l'ancienne logique)
// =========================================================================
window.ID_PARTIE_COURANTE = null;
window.ID_PARTIE_EN_ATTENTE = null;

// References de desabonnement pour les ecouteurs temps reel
let unsubscribePersonnages = null;
let unsubscribeDate = null;
let unsubscribeJoueurs = null;

// =========================================================================
//  HELPERS
// =========================================================================
function nettoyer(valeur) {
  return (valeur === undefined || valeur === null) ? "" : valeur.toString().trim();
}

// Conversion : document Firestore "Personnages" (colonnes CSV) -> objet front-end
function persoDocVersFront(id, d) {
  return {
    idPersonnage: id,
    idPartie: d.ID_Partie || "",
    idJoueur: d.ID_Joueur || "",
    couleur: d.Couleur || "",
    prenom: d.Prenom_Personnage || "",
    nom: d.Nom_Personnage || "",
    race: d.Race || "",
    urlCloudinary: d.URL_Cloudinary || "",
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
    idFaction: d.ID_Faction || ""
  };
}

// Conversion : objet front-end -> document Firestore "Personnages" (colonnes CSV)
function frontVersPersoDoc(donnees, idPersonnage) {
  return {
    ID_Partie: donnees.idPartie || "",
    ID_Joueur: donnees.idJoueur || "",
    ID_Personnage: idPersonnage,
    Couleur: donnees.couleur || "",
    Prenom_Personnage: donnees.prenom || "",
    Nom_Personnage: donnees.nom || "",
    Race: donnees.race || "",
    URL_Cloudinary: donnees.urlCloudinary || "",
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
    ID_Faction: donnees.idFaction || ""
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

async function sauvegarderFichePersonnage(donnees) {
  let idPersonnage = donnees.idPersonnage;
  const estNouveau = (!idPersonnage || idPersonnage === "");

  if (estNouveau) {
    idPersonnage = "PERSO_" + Math.floor(Math.random() * 1000000);
    donnees.statut = "Vivant";
  }

  // -----------------------------------------------------------------
  //  GENERATION D'IMAGE 100% FRONT-END (projet prive) :
  //  on genere TOUJOURS un nouveau portrait a chaque enregistrement, comme
  //  dans l'ancienne logique. Les cles sont lues dans le localStorage.
  //  Si une cle manque, genererEtStockerPortrait affiche l'alerte UI et
  //  renvoie l'URL existante (le heros est tout de meme sauvegarde).
  // -----------------------------------------------------------------
  donnees.urlCloudinary = await genererEtStockerPortrait(donnees);

  const docData = frontVersPersoDoc(donnees, idPersonnage);
  await setDoc(doc(db, COL.PERSONNAGES, idPersonnage), docData);

  return { id: idPersonnage, url: donnees.urlCloudinary || "" };
}

async function supprimerPersonnageBDD(idPersonnage) {
  if (!idPersonnage) return false;
  await deleteDoc(doc(db, COL.PERSONNAGES, idPersonnage));
  return true;
}

// =========================================================================
//  CLES API (stockees dans le localStorage du navigateur - projet prive)
// =========================================================================
const CLES_LS = {
  openai: "ivalis_OPENAI_API_KEY",
  cloudName: "ivalis_CLOUDINARY_CLOUD_NAME",
  cloudKey: "ivalis_CLOUDINARY_API_KEY",
  cloudSecret: "ivalis_CLOUDINARY_API_SECRET"
};

function lireClesApi() {
  return {
    openai: (localStorage.getItem(CLES_LS.openai) || "").trim(),
    cloudName: (localStorage.getItem(CLES_LS.cloudName) || "").trim(),
    cloudKey: (localStorage.getItem(CLES_LS.cloudKey) || "").trim(),
    cloudSecret: (localStorage.getItem(CLES_LS.cloudSecret) || "").trim()
  };
}

// Pre-remplit les champs avec les valeurs deja enregistrees
function prefillClesApi() {
  const cles = lireClesApi();
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
  localStorage.setItem(CLES_LS.openai, document.getElementById("cle-openai").value.trim());
  localStorage.setItem(CLES_LS.cloudName, document.getElementById("cle-cloud-name").value.trim());
  localStorage.setItem(CLES_LS.cloudKey, document.getElementById("cle-cloud-key").value.trim());
  localStorage.setItem(CLES_LS.cloudSecret, document.getElementById("cle-cloud-secret").value.trim());

  const msg = document.getElementById("msg-cles-api");
  msg.style.color = "#1b6e3a";
  msg.innerText = "Clés enregistrées dans ce navigateur.";
  msg.style.opacity = "1";
  setTimeout(() => { msg.style.opacity = "0"; }, 2500);
}

function basculerAffichageCles(afficher) {
  const type = afficher ? "text" : "password";
  ["cle-openai", "cle-cloud-name", "cle-cloud-key", "cle-cloud-secret"].forEach((id) => {
    document.getElementById(id).type = type;
  });
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

  // 3. Construction du prompt (identique a l'original)
  const promptOpenAI =
    "Crée un digital painting croquis pour un portrait de personnage de jeu de rôle heroic fantasy. " +
    "L'esthétique globale doit être avec un éclairage dramatique mais lumineux, des coups de pinceau gestuels et des textures très tactiles sur les matériaux, comme un dessin préparatoire. " +
    "Ne dessine absolument aucun texte ou lettrage sur l'image.\n\n" +
    "Description du personnage :\n" +
    "Il s'agit d'un héros de genre " + donnees.genre + ", ayant environ " + donnees.age + " ans. " +
    "Sa corpulence est " + donnees.corpulence + " et sa taille est " + donnees.taille + ". " +
    "Son teint de peau est " + donnees.peau + ". Ses cheveux sont " + donnees.cheveux + " et il a les yeux " + donnees.yeux + ". " +
    "Pilosité faciale : " + donnees.pilosite + ". " +
    "Son visage porte l'expression suivante : " + donnees.expression + ", et on remarque ces signes distinctifs : " + donnees.signes + ".\n" +
    "Il est vêtu ainsi : " + donnees.style + " avec une palette de couleurs dominantes " + donnees.couleursDom + ". " +
    "Il porte l'équipement visible suivant : " + donnees.equipement + ".\n\n" +
    "Directives de lore et de style additionnelles : " + instructionSupplementaire;

  // 4. Appel a l'API OpenAI
  const urlOpenAI = "https://api.openai.com/v1/images/generations";
  const payloadOpenAI = {
    model: "gpt-image-2",
    prompt: promptOpenAI,
    output_format: "webp",
    n: 1,
    size: "1024x1792",
    quality: "low"
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
      await dormir(delais[tentative]);
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
  console.log("Image generee par OpenAI.");

  // 5. Envoi sur Cloudinary (upload signe)
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const dossier = "Accueil/Heros";
  const stringToSign = "folder=" + dossier + "&timestamp=" + timestamp + cles.cloudSecret;
  const signature = await sha1Hex(stringToSign);

  const formCloudinary = new FormData();
  formCloudinary.append("file", imageSource);
  formCloudinary.append("api_key", cles.cloudKey);
  formCloudinary.append("timestamp", timestamp);
  formCloudinary.append("signature", signature);
  formCloudinary.append("folder", dossier);

  let texteReponseCloudinary = "";
  try {
    const responseCloudinary = await fetch(
      "https://api.cloudinary.com/v1_1/" + cles.cloudName + "/image/upload",
      { method: "POST", body: formCloudinary }
    );
    texteReponseCloudinary = await responseCloudinary.text();
  } catch (erreur) {
    console.error("ERREUR RESEAU CLOUDINARY :", erreur);
    return donnees.urlCloudinary || "";
  }

  let jsonCloudinary;
  try {
    jsonCloudinary = JSON.parse(texteReponseCloudinary);
  } catch (erreur) {
    console.error("ERREUR LECTURE CLOUDINARY :", texteReponseCloudinary);
    return donnees.urlCloudinary || "";
  }

  if (jsonCloudinary.secure_url) {
    console.log("SUCCES ! Image Cloudinary :", jsonCloudinary.secure_url);
    return jsonCloudinary.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
  }

  console.error("ERREUR CLOUDINARY :", texteReponseCloudinary);
  return donnees.urlCloudinary || "";
}

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

// =========================================================================
//  MÉCANIQUES DE CHAT ET INITIATIVE (Temps Réel)
// =========================================================================

let unsubscribePartie = null;
window.unsubscribeMessages = null;
window.PARTIE_DATA = null;
window.PERSOS_PARTIE = null;

// 1. Écoute globale (Personnages + Tour + Historique du Chat)
function ecouterPersonnagesDeLaPartie(idPartie) {
  if (unsubscribePersonnages) { unsubscribePersonnages(); unsubscribePersonnages = null; }
  if (unsubscribePartie) { unsubscribePartie(); unsubscribePartie = null; }
  if (window.unsubscribeMessages) { window.unsubscribeMessages(); window.unsubscribeMessages = null; }

  if (!idPartie) {
    afficherListePersonnages([]);
    afficherBullesPersonnages([]);
    return;
  }

  // A. Écoute du Tour de Parole
  unsubscribePartie = onSnapshot(doc(db, COL.PARTIES, idPartie), (snap) => {
     if(snap.exists()) {
         window.PARTIE_DATA = snap.data();
         if (window.PERSOS_PARTIE) afficherBullesPersonnages(window.PERSOS_PARTIE);
     }
  });

  // B. Écoute de l'historique du Chat
  const qMsg = query(collection(db, COL.MESSAGES), where("ID_Partie", "==", idPartie));
  window.unsubscribeMessages = onSnapshot(qMsg, (snap) => {
      let msgs = [];
      snap.forEach(document => {
          let data = document.data();
          data.idDoc = document.id; // On sauvegarde l'identifiant unique du document
          msgs.push(data);
      });
      msgs.sort((a, b) => a.Timestamp - b.Timestamp);
      dessinerMessagesChat(msgs);
  });

  // C. Écoute des Personnages
  const q = query(collection(db, COL.PERSONNAGES), where("ID_Partie", "==", idPartie));
  unsubscribePersonnages = onSnapshot(q, (snap) => {
    const persos = [];
    snap.forEach((document) => persos.push(persoDocVersFront(document.id, document.data())));

    window.PERSOS_PARTIE = persos; 
    afficherListePersonnages(persos);
    afficherBullesPersonnages(persos);
  }, (err) => console.error("onSnapshot Personnages :", err));
}

// 2. Affichage des bulles
function afficherBullesPersonnages(persos) {
  const conteneur = document.getElementById("zone-noms-bulles");
  if (!conteneur) return;
  conteneur.innerHTML = "";

  const partie = window.PARTIE_DATA || {};
  const ordre = partie.Ordre_Initiative || [];
  const indexTour = partie.Index_Initiative !== undefined ? partie.Index_Initiative : 999;
  const idPersoActif = ordre[indexTour];

  let nomActif = "MJ";

  persos.forEach((p) => {
    const bulle = document.createElement("div");
    bulle.className = "bulle-personnage";
    bulle.innerText = p.prenom;
    if (p.couleur) bulle.style.setProperty('--couleur-perso', p.couleur);

    if (p.idPersonnage === idPersoActif) {
        bulle.classList.add("tour-actif");
        nomActif = p.prenom;
    }

    if (p.urlCloudinary && p.urlCloudinary !== "") {
      const imgHover = document.createElement("img");
      imgHover.className = "bulle-portrait-hover";
      imgHover.src = p.urlCloudinary;
      bulle.appendChild(imgHover);
    }

    bulle.ondblclick = function() {
      if (typeof window.jouerSonClic === "function") window.jouerSonClic();
      if (typeof window.ouvrirFichePerso === "function") window.ouvrirFichePerso(p.idPersonnage, p.prenom, p.nom, p.couleur);
      const fiche = document.getElementById('fenetre-fiche-perso');
      if (fiche) fiche.style.zIndex = "1500";
      setTimeout(() => {
        const btnCaracs = document.querySelector("button[onclick*='onglet-caracs']");
        if (btnCaracs) btnCaracs.click();
      }, 10);
    };

    conteneur.appendChild(bulle);
  });

  // Bulle MJ
  const bulleMJ = document.createElement("div");
  bulleMJ.className = "bulle-personnage bulle-mj";
  bulleMJ.innerText = "MJ";

  if (indexTour === 999 || indexTour >= ordre.length) {
      bulleMJ.classList.add("tour-actif");
      nomActif = "MJ";
  }

  bulleMJ.onclick = function() {
      jouerSonClic();
      window.relancerInitiativeChat(); 
  };
  conteneur.appendChild(bulleMJ);

  const inputChat = document.getElementById("input-chat");
  const btnEnvoyer = document.getElementById("btn-envoyer-chat");

  if (inputChat && btnEnvoyer) {
      if (nomActif === "MJ") {
          inputChat.placeholder = "Le MJ prépare sa réponse...";
          inputChat.disabled = true;  // Verrouille la barre de saisie
          btnEnvoyer.disabled = true; // Verrouille le bouton
          inputChat.style.opacity = "0.5";
          btnEnvoyer.style.opacity = "0.5";
      } else {
          inputChat.placeholder = "C'est au tour de " + nomActif + " de parler...";
          inputChat.disabled = false; // Déverrouille
          btnEnvoyer.disabled = false;
          inputChat.style.opacity = "1";
          btnEnvoyer.style.opacity = "1";
      }
  }
}

// 3. Rendu visuel dans le chat (avec injection de couleur pour le biseau)
function dessinerMessagesChat(msgs) {
   const zone = document.getElementById("zone-messages-chat");
   if (!zone) return;
   zone.innerHTML = "";

   msgs.forEach(m => {
       const div = document.createElement("div");
       div.className = "message-chat";
       
       // On donne la couleur du perso au bloc entier pour que le biseau (CSS ::after) l'utilise
       div.style.setProperty("--couleur-perso", m.Auteur_Couleur);

       const nom = document.createElement("div");
       nom.className = "message-nom-vertical";
       nom.innerText = m.Auteur_Nom;

       const ligne = document.createElement("div");
       ligne.className = "message-separateur";

       const texte = document.createElement("div");
       texte.className = "message-contenu";
       texte.innerText = m.Texte;

       // La petite croix de suppression rouge
       const btnSuppr = document.createElement("button");
       btnSuppr.className = "btn-supprimer-msg";
       btnSuppr.innerText = "✖";
       btnSuppr.onclick = async function() {
           if (typeof window.jouerSonClic === "function") window.jouerSonClic();
           await deleteDoc(doc(db, COL.MESSAGES, m.idDoc)); // Destruction en BDD !
       };

       div.appendChild(nom);
       div.appendChild(ligne);
       div.appendChild(texte);
       div.appendChild(btnSuppr);
       zone.appendChild(div);
   });
   zone.scrollTop = zone.scrollHeight;
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

// 5. Envoi du message (avec ajout de la Date issue de Firestore)
window.envoyerMessageChat = async function() {
   const input = document.getElementById("input-chat");
   const texte = input.value.trim();
   if(texte === "" || !window.ID_PARTIE_COURANTE) return;

   const partie = window.PARTIE_DATA || {};
   const ordre = partie.Ordre_Initiative || [];
   const indexTour = partie.Index_Initiative !== undefined ? partie.Index_Initiative : 999;

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
       }
   }

   // On récupère la date fraîche depuis notre mémoire globale (Issue de Firebase)
   const jourEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.jour : "";
   const anEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.annee : "";

   const nouveauMsg = {
       ID_Partie: window.ID_PARTIE_COURANTE,
       Auteur_ID: idAuteur,
       Auteur_Nom: auteurNom,
       Auteur_Couleur: auteurCouleur,
       Texte: texte,
       Date_Jour: jourEnJeu, // Ajouté dans le payload
       Date_An: anEnJeu,     // Ajouté dans le payload
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
    musique.volume = 0.20;
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
  } catch (e) {
    console.error(e);
    alert("Une erreur est survenue lors de la fondation du groupe.");
    btnCreer.innerText = "Créer";
    btnCreer.disabled = false;
  }
}

async function ouvrirModalChargerPartie() {
  document.getElementById("overlay-modale").style.display = "block";
  document.getElementById("modale-charger").style.display = "block";

  document.getElementById("chargement-parties").style.display = "block";
  document.getElementById("liste-parties").style.display = "none";
  document.getElementById("liste-parties").innerHTML = "";

  const partiesActives = await recupererPartiesEnCours();
  afficherListeParties(partiesActives);
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
}

// =========================================================================
//  ECRAN DE JEU : son, volume, pop-ups
// =========================================================================
function jouerSonSurvolParchemin() {
  const sonParchemin = document.getElementById("audio-survol-parchemin");
  if (sonParchemin && sonParchemin.src.includes("http")) {
    sonParchemin.volume = 0.5;
    sonParchemin.currentTime = 0;
    sonParchemin.play().catch(() => {});
  }
}

function toggleBulleVolume(evenement) {
  evenement.stopPropagation();
  const bulle = document.getElementById("bulle-volume");
  const curseur = document.getElementById("curseur-volume");
  const musique = document.getElementById("musique-ambiance");

  if (bulle.style.display === "block") {
    bulle.style.display = "none";
  } else {
    bulle.style.display = "block";
    if (musique) curseur.value = musique.volume;
  }
}

function ajusterVolume(valeur) {
  const musique = document.getElementById("musique-ambiance");
  if (musique) musique.volume = valeur;
}

function fermerModalesJeu() {
  document.getElementById("overlay-jeu-modale").style.display = "none";
  document.getElementById("modale-retour-menu").style.display = "none";
  document.getElementById("modale-quitter-jeu").style.display = "none";
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
    div.ondblclick = function () {
      jouerSonClic();
      ouvrirEditeurInstruction(inst.id, inst.titre, inst.contenu);
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
//  PERSONNAGES / FICHE PERSO
// =========================================================================
function remplirSelectFactions(factions) {
  const select = document.getElementById("champ-faction");
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
      div.ondblclick = function () { jouerSonClic(); ouvrirFichePerso(p.idPersonnage, p.prenom, p.nom, p.couleur); };
      div.innerHTML = `<span>${p.prenom} ${p.nom}</span>`;
      conteneur.appendChild(div);
    });
  }

  document.getElementById("chargement-persos").style.display = "none";
  conteneur.style.display = "block";
}

async function ouvrirFichePerso(idPersonnage, prenomPerso, nomPerso, couleurPerso) {
  const fiche = document.getElementById("fenetre-fiche-perso");
  const btnSupprimer = document.getElementById("btn-supprimer-perso");
  const btnSauvegarder = document.getElementById("btn-sauvegarder-perso");

  document.getElementById("champ-id-personnage").value = "";
  document.getElementById("champ-statut-personnage").value = "Vivant";
  document.getElementById("champ-id-personnage").setAttribute("data-url", "");

  document.getElementById("image-portrait-perso").src = "";
  document.getElementById("image-portrait-perso").style.display = "none";
  document.getElementById("texte-aucun-portrait").style.display = "block";

  const inputs = fiche.querySelectorAll(".input-perso");
  inputs.forEach((input) => { if (input.type === "text") input.value = ""; });

  document.getElementById("champ-race").value = "";
  document.getElementById("champ-genre").value = "";
  document.getElementById("champ-corpulence").value = "";
  document.getElementById("champ-taille").value = "";
  document.getElementById("champ-faction").value = "";

  const couleurParDefaut = "#2a1a0f";
  document.getElementById("champ-couleur-token").value = couleurParDefaut;
  appliquerCouleurTheme(couleurParDefaut);

  if (idPersonnage) {
    document.getElementById("titre-nom-personnage").innerText = prenomPerso + " " + nomPerso;
    btnSupprimer.style.display = "block";
    document.getElementById("champ-id-personnage").value = idPersonnage;

    if (couleurPerso) {
      document.getElementById("champ-couleur-token").value = couleurPerso;
      appliquerCouleurTheme(couleurPerso);
    }

    const cleCache = "ivalis_perso_" + idPersonnage;
    const memoireLocale = localStorage.getItem(cleCache);

    if (memoireLocale) {
      remplirFormulairePerso(JSON.parse(memoireLocale));
      btnSauvegarder.innerText = "Synchronisation...";
      btnSauvegarder.style.pointerEvents = "none";
    } else {
      btnSauvegarder.innerText = "Chargement...";
      btnSauvegarder.style.pointerEvents = "none";
    }

    const donneesServeur = await recupererDetailsPersonnage(idPersonnage);
    if (donneesServeur) {
      localStorage.setItem(cleCache, JSON.stringify(donneesServeur));
      remplirFormulairePerso(donneesServeur);
    }
  } else {
    document.getElementById("titre-nom-personnage").innerText = "Nouveau Personnage";
    btnSupprimer.style.display = "none";
    btnSauvegarder.innerText = "Enregistrer";
    btnSauvegarder.style.pointerEvents = "auto";
  }

  // --- NOUVEAU : On force l'ouverture sur l'onglet Caractéristiques ---
  const btnCaracs = document.querySelector("button[onclick*='onglet-caracs']");
  if (btnCaracs) {
    changerOngletPerso({ currentTarget: btnCaracs }, 'onglet-caracs');
  }

  fiche.style.display = "flex";
  const fenetreLargeur = fiche.offsetWidth;
  const fenetreHauteur = fiche.offsetHeight;
  fiche.style.left = (window.innerWidth / 2 - fenetreLargeur / 2) + "px";
  fiche.style.top = (window.innerHeight / 2 - fenetreHauteur / 2) + "px";
}

function remplirFormulairePerso(donnees) {
  if (!donnees) return;

  const imgPortrait = document.getElementById("image-portrait-perso");
  const txtPortrait = document.getElementById("texte-aucun-portrait");
  document.getElementById("champ-id-personnage").setAttribute("data-url", donnees.urlCloudinary || "");

  if (donnees.urlCloudinary && donnees.urlCloudinary !== "") {
    imgPortrait.src = donnees.urlCloudinary;
    imgPortrait.style.display = "block";
    txtPortrait.style.display = "none";
  } else {
    imgPortrait.src = "";
    imgPortrait.style.display = "none";
    txtPortrait.style.display = "block";
  }

  document.getElementById("champ-statut-personnage").value = donnees.statut || "Vivant";
  document.getElementById("champ-prenom").value = donnees.prenom || "";
  document.getElementById("champ-nom").value = donnees.nom || "";
  document.getElementById("champ-age").value = donnees.age || "";
  document.getElementById("champ-race").value = donnees.race || "";
  document.getElementById("champ-genre").value = donnees.genre || "";
  document.getElementById("champ-cheveux").value = donnees.cheveux || "";
  document.getElementById("champ-yeux").value = donnees.yeux || "";
  document.getElementById("champ-pilosite").value = donnees.pilosite || "";
  document.getElementById("champ-signes").value = donnees.signes || "";
  document.getElementById("champ-expression").value = donnees.expression || "";
  document.getElementById("champ-corpulence").value = donnees.corpulence || "";
  document.getElementById("champ-taille").value = donnees.taille || "";
  document.getElementById("champ-peau").value = donnees.peau || "";
  document.getElementById("champ-style").value = donnees.style || "";
  document.getElementById("champ-couleurs").value = donnees.couleursDom || "";
  document.getElementById("champ-equipement").value = donnees.equipement || "";
  document.getElementById("champ-faction").value = donnees.idFaction || "";

  const btnSauvegarder = document.getElementById("btn-sauvegarder-perso");
  btnSauvegarder.innerText = "Enregistrer";
  btnSauvegarder.style.pointerEvents = "auto";
}

function fermerFichePerso() {
  document.getElementById("fenetre-fiche-perso").style.display = "none";
  document.getElementById("voile-suppression-perso").style.display = "none";
}

async function sauvegarderDescriptifPerso() {
  const prenom = document.getElementById("champ-prenom").value.trim();
  if (prenom === "") { alert("Le héros doit au moins posséder un prénom."); return; }

  document.getElementById("ecran-chargement-ia").style.display = "flex";

  const btn = document.getElementById("btn-sauvegarder-perso");
  btn.innerText = "Génération...";
  btn.style.pointerEvents = "none";

  const urlExistante = document.getElementById("champ-id-personnage").getAttribute("data-url") || "";

  const donnees = {
    idPartie: window.ID_PARTIE_COURANTE,
    idJoueur: localStorage.getItem("ID_JOUEUR_COURANT"),
    idPersonnage: document.getElementById("champ-id-personnage").value,
    statut: document.getElementById("champ-statut-personnage").value,
    urlCloudinary: urlExistante,
    prenom: prenom,
    nom: document.getElementById("champ-nom").value.trim(),
    age: document.getElementById("champ-age").value.trim(),
    race: document.getElementById("champ-race").value,
    genre: document.getElementById("champ-genre").value,
    cheveux: document.getElementById("champ-cheveux").value.trim(),
    yeux: document.getElementById("champ-yeux").value.trim(),
    pilosite: document.getElementById("champ-pilosite").value.trim(),
    signes: document.getElementById("champ-signes").value.trim(),
    expression: document.getElementById("champ-expression").value.trim(),
    corpulence: document.getElementById("champ-corpulence").value,
    taille: document.getElementById("champ-taille").value,
    peau: document.getElementById("champ-peau").value.trim(),
    style: document.getElementById("champ-style").value.trim(),
    couleursDom: document.getElementById("champ-couleurs").value.trim(),
    equipement: document.getElementById("champ-equipement").value.trim(),
    couleur: document.getElementById("champ-couleur-token").value,
    idFaction: document.getElementById("champ-faction").value
  };

  try {
    const resultatServeur = await sauvegarderFichePersonnage(donnees);

    document.getElementById("ecran-chargement-ia").style.display = "none";
    btn.innerText = "Enregistrer";
    btn.style.pointerEvents = "auto";

    document.getElementById("champ-id-personnage").value = resultatServeur.id;
    document.getElementById("champ-id-personnage").setAttribute("data-url", resultatServeur.url);
    donnees.idPersonnage = resultatServeur.id;
    donnees.urlCloudinary = resultatServeur.url;

    if (resultatServeur.url !== "") {
      document.getElementById("image-portrait-perso").src = resultatServeur.url;
      document.getElementById("image-portrait-perso").style.display = "block";
      document.getElementById("texte-aucun-portrait").style.display = "none";
    }

    document.getElementById("titre-nom-personnage").innerText = donnees.prenom + " " + donnees.nom;
    document.getElementById("btn-supprimer-perso").style.display = "block";

    localStorage.setItem("ivalis_perso_" + resultatServeur.id, JSON.stringify(donnees));
    // La liste se met a jour automatiquement via onSnapshot (temps reel).
  } catch (e) {
    console.error(e);
    document.getElementById("ecran-chargement-ia").style.display = "none";
    btn.innerText = "Enregistrer";
    btn.style.pointerEvents = "auto";
    alert("Une erreur est survenue lors de l'enregistrement du héros.");
  }
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

  await supprimerPersonnageBDD(id);

  btnConfirmer.innerText = "Oui, détruire";
  btnConfirmer.style.pointerEvents = "auto";
  document.getElementById("voile-suppression-perso").style.display = "none";

  localStorage.removeItem("ivalis_perso_" + id);
  fermerFichePerso();
  // La liste se met a jour automatiquement via onSnapshot (temps reel).
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

  // --- NOUVEAU : Masquer/Afficher le bouton Supprimer ---
  const btnSupprimer = document.getElementById("btn-supprimer-perso");
  const idPersonnage = document.getElementById("champ-id-personnage").value;

  // On affiche le bouton SEULEMENT si on est sur le Descriptif ET que le perso existe déjà
  if (nomOnglet === 'onglet-descriptif' && idPersonnage !== "") {
    btnSupprimer.style.display = "block";
  } else {
    btnSupprimer.style.display = "none";
  }
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
//  INITIALISATION (DOMContentLoaded)
// =========================================================================
document.addEventListener("DOMContentLoaded", function () {
  // TEMPS REEL : liste des joueurs (identification) + date en jeu (parchemin)
  ecouterJoueurs();
  ecouterDateEnJeu();

  // Rendre la fiche de personnage deplacable
  rendreFenetreDeplacable(document.getElementById("fenetre-fiche-perso"));

  // Pre-chargement des factions pour le menu deroulant de la fiche
  recupererFactionsPourSelect()
    .then(remplirSelectFactions)
    .catch((e) => console.error("Chargement des factions :", e));
});

// =========================================================================
// LOGIQUE DE NAVIGATION (INTERRUPTEURS SANS OVERLAY)
// =========================================================================

// 1. Fonction centrale pour tout fermer et nettoyer l'écran instantanément
window.fermerToutesLesFenetres = function() {
  // Fermer le chat
  const chatbox = document.getElementById('fenetre-chatbox');
  if (chatbox) chatbox.style.display = 'none';

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

  // Fermer les paramètres
  const menuParam = document.getElementById('conteneur-parametres');
  if (menuParam) {
    menuParam.classList.remove('ouvert');
    menuParam.style.display = 'none';
  }
};

// 2. Boutons Chatbox
window.ouvrirChatbox = function() {
  const chatbox = document.getElementById('fenetre-chatbox');
  const estDejaOuvert = (chatbox.style.display === 'flex');
  
  window.fermerToutesLesFenetres();

  if (!estDejaOuvert) {
    chatbox.style.display = 'flex';
    // CORRECTION : On demande à l'application de récupérer les personnages pour les bulles !
    if (window.ID_PARTIE_COURANTE) {
      ecouterPersonnagesDeLaPartie(window.ID_PARTIE_COURANTE);
    }
  }
};

window.fermerChatbox = function() {
  const chatbox = document.getElementById('fenetre-chatbox');
  if (chatbox) chatbox.style.display = 'none';
};

// 3. Bouton Personnages
window.ouvrirMenuPersonnages = function() {
  const menuPerso = document.getElementById('conteneur-liste-personnages');
  const estDejaOuvert = (menuPerso.style.display === 'block' || menuPerso.classList.contains('ouvert'));
  
  window.fermerToutesLesFenetres();

  if (!estDejaOuvert) {
    menuPerso.style.display = 'block';
    setTimeout(() => { menuPerso.classList.add('ouvert'); }, 10);

    document.getElementById("chargement-persos").style.display = "block";
    document.getElementById("liste-html-persos").style.display = "none";
    ecouterPersonnagesDeLaPartie(window.ID_PARTIE_COURANTE);
  }
};

// 4. Bouton Paramètres
window.ouvrirParametres = function() {
  const menuParam = document.getElementById('conteneur-parametres');
  const estDejaOuvert = (menuParam.style.display === 'block' || menuParam.classList.contains('ouvert'));
  
  window.fermerToutesLesFenetres();

  if (!estDejaOuvert) {
    document.getElementById("etape-menu-parametres").style.display = "none";
    document.getElementById("etape-liste-instructions").style.display = "none";
    document.getElementById("etape-editeur-instruction").style.display = "none";
    document.getElementById("etape-confirmation-suppression").style.display = "none";
    document.getElementById("etape-cles-api").style.display = "none";

    document.getElementById("input-secret-parametres").value = "";
    document.getElementById("erreur-mdp-parametres").style.opacity = "0";

    document.getElementById("etape-mdp-parametres").style.display = "block";
    document.getElementById("etape-mdp-parametres").style.opacity = "1";

    menuParam.style.display = 'block';
    setTimeout(() => { menuParam.classList.add('ouvert'); }, 10);
  }
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
  jouerSonSurvolParchemin, toggleBulleVolume, ajusterVolume,
  fermerModalesJeu, demanderRetourMenu, demanderQuitterJeu,
  confirmerRetourMenu, confirmerQuitterJeu,
  // Parametres / Cerveau IA
  fermerParametres, naviguerFenetre, validerMdpParametres,
  ouvrirListeInstructions, basculerPoussoirIA, ouvrirEditeurInstruction,
  sauvegarderInstruction, demanderSuppression, annulerSuppression, validerSuppression,
  // Personnages / fiche perso
  fermerMenuPersonnages, ouvrirFichePerso, fermerFichePerso,
  sauvegarderDescriptifPerso, ouvrirConfirmationSuppressionPerso,
  annulerSuppressionPerso, validerSuppressionPerso, appliquerCouleurTheme, changerOngletPerso,
  // Cles API + generation d'image (front-end)
  ouvrirClesApi, sauvegarderClesApi, basculerAffichageCles,
  fermerAlerteCles, ouvrirParametresDepuisAlerte
});
