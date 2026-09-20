// =========================================================================
//  IVALIS - Configuration Firebase (SDK modulaire v9 via CDN gstatic)
// =========================================================================
//  CE FICHIER EST IMPORTÉ AVEC UN NUMÉRO DE VERSION : « ./firebase-config.js?v=N ».
//
//  Les scripts de la page en portent un depuis toujours (index.html), mais pas
//  ce qu'ILS importent : un module chargé par `import` est rangé sous son URL,
//  et sans numéro, une tablette qui a déjà ouvert le jeu une fois continue de
//  servir l'ancien fichier. C'est particulièrement fâcheux ici, où le réglage
//  ci-dessous existe justement POUR les tablettes.
//
//  À CHAQUE MODIFICATION DE CE FICHIER, LE NUMÉRO SE BOUMPE PARTOUT EN MÊME
//  TEMPS. Une douzaine de fichiers l'importent ; deux numéros différents, et
//  deux instances de Firestore coexisteraient dans la même page, chacune avec
//  ses écouteurs. Le banc ecran_chargement.mjs vérifie qu'ils sont d'accord.
// =========================================================================
//  Ce fichier initialise Firebase et expose la base de donnees Firestore (db).
//  Aucune cle PRIVEE (OpenAI / Cloudinary) ne doit JAMAIS apparaitre ici :
//  les valeurs ci-dessous sont les cles PUBLIQUES de configuration web Firebase,
//  qui sont concues pour etre exposees cote client (la securite reelle passe
//  par les "Firestore Security Rules" dans la console Firebase).
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Configuration du projet web Ivalis
const firebaseConfig = {
  apiKey: "AIzaSyCSHF4isennPJEqBRNlrthOu8OaS_7cur4",
  authDomain: "ivalis-b8373.firebaseapp.com",
  projectId: "ivalis-b8373",
  storageBucket: "ivalis-b8373.firebasestorage.app",
  messagingSenderId: "250721808501",
  appId: "1:250721808501:web:c72472bc04b03d2145c83c",
  measurementId: "G-LW9CVDJKCV"
};

// Initialisation de l'application Firebase
const app = initializeApp(firebaseConfig);

// Base de donnees Firestore, partagee dans toute l'application.
//
// LE TRANSPORT EST CHOISI À L'ESSAI, ET C'EST TOUT LE SUJET DE L'IPAD.
//
// Signalé en partie : « sur iPad et que sur iPad, au moment où je rentre le mot
// de passe pour charger une partie, ça met toujours au moins une minute avant de
// charger la page du jeu ; sur PC c'est instantané ».
//
// Firestore parle par défaut en WebChannel, un flux permanent. Quand ce flux ne
// peut pas s'établir — et Safari sur iOS, un réseau mobile ou un routeur qui
// coupe les connexions longues suffisent — le client NE RENONCE PAS TOUT DE
// SUITE : il attend l'expiration du délai avant de retomber sur le long polling,
// qui, lui, passe partout. Ce délai, c'est la minute. Elle ne se voit pas sur
// PC, où le flux s'établit du premier coup.
//
// `experimentalAutoDetectLongPolling` inverse l'ordre : le client SONDE la
// connexion, et bascule tout de suite sur le transport qui marche au lieu
// d'attendre que l'autre échoue. C'est le réglage que Firebase a fini par
// adopter par défaut dans les versions suivantes du SDK ; on l'allume ici parce
// que la 9.23 ne le fait pas.
//
// Il doit être posé AVANT toute autre utilisation de Firestore : c'est pour ça
// que l'instance se fabrique ici, et nulle part ailleurs.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
