// =========================================================================
//  IVALIS - Configuration Firebase (SDK modulaire v9 via CDN gstatic)
// =========================================================================
//  Ce fichier initialise Firebase et expose la base de donnees Firestore (db).
//  Aucune cle PRIVEE (OpenAI / Cloudinary) ne doit JAMAIS apparaitre ici :
//  les valeurs ci-dessous sont les cles PUBLIQUES de configuration web Firebase,
//  qui sont concues pour etre exposees cote client (la securite reelle passe
//  par les "Firestore Security Rules" dans la console Firebase).
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

// Base de donnees Firestore, partagee dans toute l'application
export const db = getFirestore(app);
