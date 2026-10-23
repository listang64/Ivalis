// =========================================================================
//  LES COMPTES DES JOUEURS (v259)
// =========================================================================
//  Nico : « remplace le "Qui es-tu, étranger ?" par une connexion avec son
//  mail, nom d'utilisateur et mot de passe perso et protégé, sans avoir à se
//  reconnecter à chaque mise à jour ; les boutons qui vont bien sur le menu
//  principal ; enregistre Nico, Ben et Adrien pour que nos persos restent
//  utilisables avec nos anciens noms ; et les nouvelles demandes
//  d'inscription, Nico ou Ben doit les valider. »
//
//  LE COMPTE, C'EST FIREBASE AUTH. L'e-mail et le mot de passe ne passent
//  jamais par nos documents : Firebase les garde (chiffrés) et rend une
//  session qui reste sur l'appareil — une mise à jour du jeu ne la touche pas.
//
//  CE QUE LE JEU EN SAIT (Firestore) :
//    · Comptes/{uid} — Nom, Email, Statut (En_attente, Valide, Refuse), Role
//      (admin pour Nico et Ben, joueur sinon) et ID_Joueur : le numéro de
//      joueur (P_01…) qui porte les personnages. C'est LUI qui devient
//      `ID_JOUEUR_COURANT`, comme quand on touchait son nom : tout le reste du
//      jeu continue de lire ce numéro, sans rien savoir des comptes.
//    · Noms_Utilisateurs/{nom normalisé} — un nom ne sert qu'une fois.
//    · Joueurs/{P_xx} — le joueur, qui reçoit l'Uid de son compte.
//
//  LES ANCIENS JOUEURS : un compte qui prend le nom Nico, Ben ou Adrien, avec
//  la Clé de Rune, reprend P_01, P_02 ou P_03 — et leurs personnages — et il
//  est validé d'emblée. Tout autre compte attend que Nico ou Ben l'accepte
//  (Demandes d'inscription, sur le menu) ; il reçoit alors le numéro suivant.
//
//  LA PORTE (porte_joueur.js) ne s'ouvre qu'à un compte validé : c'est alors
//  seulement que le jeu commence à lire la base. Les règles Firestore
//  (firestore.rules) font respecter tout cela côté serveur.
//
//  LES BANCS servent la page avec un faux Firebase, sans Auth : le module le
//  reconnaît (pas de getApp), ouvre la porte et garde le joueur posé par le
//  banc — la page se comporte comme pour un compte déjà validé.
// =========================================================================
import { db } from "./firebase-config.js?v=2";

const URL_APP = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
const URL_AUTH = "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
const URL_FIRESTORE = "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Les trois joueurs d'avant les comptes. Les règles Firestore portent la même
// table : la modifier ici, c'est la modifier là-bas aussi.
export const ANCIENS_JOUEURS = Object.freeze({
    nico:   Object.freeze({ id: "P_01", nom: "Nico",   role: "admin" }),
    ben:    Object.freeze({ id: "P_02", nom: "Ben",    role: "admin" }),
    adrien: Object.freeze({ id: "P_03", nom: "Adrien", role: "joueur" })
});

// Un nom tel qu'on le compare : sans accents, en minuscules, les espaces tassés.
export function normaliserNom(nom) {
    return String(nom || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().trim().replace(/\s+/g, " ");
}

// Ce qui ne va pas dans un nom d'utilisateur ("" s'il convient).
export function verifierNom(nom) {
    const brut = String(nom || "").trim();
    if (brut.length < 2) return "Ton nom d'utilisateur doit faire au moins 2 caractères.";
    if (brut.length > 20) return "Ton nom d'utilisateur ne doit pas dépasser 20 caractères.";
    if (!/^[a-z0-9 _'-]+$/.test(normaliserNom(brut))) {
        return "Ton nom d'utilisateur : lettres, chiffres, espaces, tirets et apostrophes seulement.";
    }
    return "";
}

// Les erreurs de Firebase, dites en français.
const MESSAGES = {
    "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
    "auth/missing-email": "Entre ton adresse e-mail.",
    "auth/missing-password": "Entre ton mot de passe.",
    "auth/user-not-found": "E-mail ou mot de passe incorrect.",
    "auth/wrong-password": "E-mail ou mot de passe incorrect.",
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail : connecte-toi plutôt.",
    "auth/weak-password": "Le mot de passe doit faire au moins 6 caractères.",
    "auth/too-many-requests": "Trop d'essais d'affilée. Attends un peu avant de réessayer.",
    "auth/network-request-failed": "Pas de connexion internet.",
    "auth/user-disabled": "Ce compte a été désactivé.",
    "auth/requires-recent-login": "Par sécurité, reconnecte-toi avant de changer ton mot de passe.",
    "permission-denied": "La base a refusé l'opération.",
    "unavailable": "La base ne répond pas : vérifie ta connexion internet."
};
class ErreurTexte extends Error {}
export function messageErreur(e) {
    if (e instanceof ErreurTexte) return e.message;
    const code = (e && e.code) || "";
    return MESSAGES[code] || ("Une erreur est survenue" + (code ? " (" + code + ")" : "") + ".");
}

const echapper = (t) => String(t === undefined || t === null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const porte = () => window.PorteJoueur;

// =========================================================================
//  L'ÉTAT
// =========================================================================
//  phase : chargement · deconnecte · creation · incomplet · attente · refuse
//          · valide · indisponible · banc
const etat = {
    phase: "chargement",
    vue: "connexion",            // l'onglet de l'écran : connexion ou inscription
    user: null,
    compte: null,
    ecranDemande: false,         // le sceau est passé : l'écran de connexion est attendu
    inscriptionEnCours: false,
    demandes: [],
    message: "",
    messageOk: false
};
let sdk = null;                  // { auth, fa, fs }
let arretCompte = null, arretDemandes = null;
let essaisCompte = 0;

window.COMPTE_JOUEUR = null;

function passerA(phase) {
    const change = etat.phase !== phase;
    etat.phase = phase;
    if (change) { etat.message = ""; rendrePanneau(); }
    rendreBarre();
    if ((phase === "valide" || phase === "banc") && etat.ecranDemande) accueillir();
}

// =========================================================================
//  LE DÉMARRAGE
// =========================================================================
async function demarrer() {
    let modApp;
    try {
        modApp = await import(URL_APP);
    } catch (e) {
        console.error("Comptes : Firebase introuvable", e);
        passerA("indisponible");
        return;
    }
    // Un banc : un faux Firebase, sans Auth (pas de getApp, ou un banc qui le
    // dit). La page se comporte comme pour un joueur déjà validé, celui que le
    // banc a posé.
    if (typeof modApp.getApp !== "function" || modApp.BANC_IVALIS === true) {
        porte() && porte().ouvrir();
        passerA("banc");
        return;
    }
    try {
        const [fa, fs] = await Promise.all([import(URL_AUTH), import(URL_FIRESTORE)]);
        const auth = fa.getAuth(modApp.getApp());
        auth.languageCode = "fr";
        const emu = window.__EMULATEURS_IVALIS;
        if (emu && emu.auth) fa.connectAuthEmulator(auth, emu.auth, { disableWarnings: true });
        sdk = { auth, fa, fs };
    } catch (e) {
        console.error("Comptes : connexion impossible", e);
        passerA("indisponible");
        return;
    }
    sdk.fa.onAuthStateChanged(sdk.auth, surChangementDeSession);
}

function surChangementDeSession(user) {
    if (arretCompte) { arretCompte(); arretCompte = null; }
    etat.user = user || null;
    if (!user) {
        etat.compte = null;
        window.COMPTE_JOUEUR = null;
        // Plus de nom à toucher : sans compte, pas de joueur courant.
        if (!(porte() && porte().ouverte)) {
            try { localStorage.removeItem("ID_JOUEUR_COURANT"); } catch (e) {}
        }
        passerA("deconnecte");
        return;
    }
    passerA(etat.inscriptionEnCours ? "creation" : "chargement");
    essaisCompte = 0;
    ecouterCompte(user);
}

// Le document du compte, écouté : c'est lui qui dit « en attente », puis
// « validé » le jour où Nico ou Ben accepte — la page s'ouvre alors d'elle-même.
//
// ON N'OUVRE QUE SUR CE QUE LA BASE A ENREGISTRÉ. Juste après une inscription,
// Firestore montre d'abord sa copie locale du compte (« en attente
// d'écriture ») : la base, elle, ne l'a pas encore — et ses règles refusent
// alors toutes les lectures du jeu. Ouvrir la porte sur cette copie-là, c'était
// lancer tous les écouteurs du jeu une fraction de seconde trop tôt, et les
// perdre (un écouteur refusé ne se relève pas). On attend donc la confirmation
// (includeMetadataChanges : la même image, revenue « enregistrée »).
function ecouterCompte(user) {
    const { fs } = sdk;
    arretCompte = fs.onSnapshot(fs.doc(db, "Comptes", user.uid), { includeMetadataChanges: true }, (snap) => {
        essaisCompte = 0;
        if (snap.metadata && snap.metadata.hasPendingWrites) {
            if (etat.phase !== "creation") passerA("creation");
            return;
        }
        if (!snap.exists()) {
            etat.compte = null;
            passerA(etat.inscriptionEnCours ? "creation" : "incomplet");
            return;
        }
        const c = snap.data();
        etat.compte = c;
        if (c.Statut === "Valide" && c.ID_Joueur) {
            reconnaitre(user, c);
            passerA("valide");
        } else if (c.Statut === "Refuse") {
            passerA("refuse");
        } else {
            passerA("attente");
        }
    }, (err) => {
        // Juste après la connexion, la base peut n'avoir pas encore reçu le
        // jeton du compte : un refus ici se retente, deux fois.
        if (arretCompte) { arretCompte(); arretCompte = null; }
        if (essaisCompte < 2 && etat.user === user) {
            essaisCompte++;
            setTimeout(() => { if (etat.user === user && !arretCompte) ecouterCompte(user); }, 600 * essaisCompte);
            return;
        }
        console.error("Comptes : lecture du compte", err);
        etat.message = messageErreur(err);
        passerA("indisponible");
    });
}

// Un compte validé : le joueur courant, la porte, et (pour Nico et Ben) les demandes.
function reconnaitre(user, c) {
    window.COMPTE_JOUEUR = {
        uid: user.uid, email: user.email || c.Email || "", nom: c.Nom || "",
        idJoueur: c.ID_Joueur, role: c.Role || "joueur", admin: c.Role === "admin"
    };
    try { localStorage.setItem("ID_JOUEUR_COURANT", c.ID_Joueur); } catch (e) {}
    porte() && porte().ouvrir();
    if (c.Role === "admin") ecouterDemandes();
}

// =========================================================================
//  L'ÉCRAN DE CONNEXION
// =========================================================================
//  Appelé quand le sceau s'efface (app.js). Un compte déjà reconnu est salué
//  et passe au menu ; sinon, le formulaire.
window.afficherEcranConnexion = function () {
    etat.ecranDemande = true;
    const titre = document.querySelector("#ecran-identification .titre-etranger");
    const panneau = document.getElementById("panneau-connexion");
    rendrePanneau();
    if (titre) titre.classList.add("visible");
    if (etat.phase === "valide" || etat.phase === "banc") { accueillir(); return; }
    setTimeout(() => { if (panneau) panneau.classList.add("visible"); }, 900);
};

let accueilFait = false;
function accueillir() {
    if (accueilFait) return;
    accueilFait = true;
    rendreTitre();
    const ecran = document.getElementById("ecran-identification");
    const panneau = document.getElementById("panneau-connexion");
    if (panneau) panneau.classList.remove("visible");
    if (!ecran) return;
    // Le temps de lire « Bienvenue », puis le menu.
    setTimeout(() => {
        ecran.style.opacity = "0";
        setTimeout(() => { ecran.style.display = "none"; }, 1500);
    }, 1400);
}

function rendreTitre() {
    const titre = document.querySelector("#ecran-identification .titre-etranger");
    if (!titre) return;
    const nom = window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom;
    titre.textContent = (etat.phase === "valide" || etat.phase === "banc")
        ? (nom ? "BIENVENUE, " + nom.toUpperCase() : "BIENVENUE")
        : "PRÉSENTE-TOI, VOYAGEUR";
}

const lienDeconnexion = `<button type="button" class="lien-connexion" data-action="deconnecter">Se déconnecter</button>`;

function champCle(visible) {
    return `<label class="champ-connexion champ-cle"${visible ? "" : " hidden"}>Clé de Rune
              <input type="password" id="inscription-cle" class="input-parchemin" autocomplete="off">
            </label>`;
}

function vueInscription(incomplet) {
    const user = etat.user;
    return `
      <form id="form-inscription" class="form-connexion" novalidate>
        ${incomplet
            ? `<p class="texte-connexion">Ton compte <b>${echapper(user && user.email)}</b> existe, mais il lui manque encore un nom.</p>`
            : `<label class="champ-connexion">E-mail
                 <input type="email" id="inscription-email" class="input-parchemin" autocomplete="email" inputmode="email">
               </label>`}
        <label class="champ-connexion">Nom d'utilisateur
          <input type="text" id="inscription-nom" class="input-parchemin" autocomplete="nickname" maxlength="20" autocapitalize="words">
        </label>
        ${incomplet ? "" : `
        <label class="champ-connexion">Mot de passe
          <input type="password" id="inscription-mdp" class="input-parchemin" autocomplete="new-password">
        </label>
        <label class="champ-connexion">Confirme le mot de passe
          <input type="password" id="inscription-mdp2" class="input-parchemin" autocomplete="new-password">
        </label>`}
        ${champCle(false)}
        <p class="note-connexion" id="note-inscription">Nico ou Ben validera ta demande.</p>
        <button type="submit" class="btn-modale">${incomplet ? "Terminer l'inscription" : "Créer mon compte"}</button>
        ${incomplet ? lienDeconnexion : ""}
      </form>`;
}

function rendrePanneau() {
    const panneau = document.getElementById("panneau-connexion");
    if (!panneau) return;
    rendreTitre();
    let html = "";
    switch (etat.phase) {
        case "deconnecte":
            html = `
              <div class="onglets-connexion">
                <button type="button" class="onglet-connexion${etat.vue === "connexion" ? " actif" : ""}" data-vue="connexion">Se connecter</button>
                <button type="button" class="onglet-connexion${etat.vue === "inscription" ? " actif" : ""}" data-vue="inscription">Créer un compte</button>
              </div>
              ${etat.vue === "connexion" ? `
              <form id="form-connexion" class="form-connexion" novalidate>
                <label class="champ-connexion">E-mail
                  <input type="email" id="connexion-email" class="input-parchemin" autocomplete="username" inputmode="email">
                </label>
                <label class="champ-connexion">Mot de passe
                  <input type="password" id="connexion-mdp" class="input-parchemin" autocomplete="current-password">
                </label>
                <button type="submit" class="btn-modale">Entrer dans Ivalis</button>
                <button type="button" class="lien-connexion" data-action="mdp-oublie">Mot de passe oublié ?</button>
              </form>` : vueInscription(false)}`;
            break;
        case "incomplet":
            html = vueInscription(true);
            break;
        case "creation":
            html = `<p class="texte-connexion">Création de ton compte…</p>`;
            break;
        case "attente":
            html = `<p class="texte-connexion">Ta demande d'inscription est envoyée,
                      <b>${echapper(etat.compte && etat.compte.Nom)}</b>.</p>
                    <p class="texte-connexion">Nico ou Ben doit l'accepter : cette page s'ouvrira d'elle-même.</p>
                    ${lienDeconnexion}`;
            break;
        case "refuse":
            html = `<p class="texte-connexion">Ta demande d'inscription a été refusée.</p>${lienDeconnexion}`;
            break;
        case "indisponible":
            html = `<p class="texte-connexion">Le service de connexion ne répond pas. Vérifie ta connexion internet.</p>
                    <button type="button" class="btn-modale" data-action="recharger">Réessayer</button>`;
            break;
        case "valide":
        case "banc":
            html = "";
            break;
        default:
            html = `<p class="texte-connexion">Le sceau s'ouvre…</p>`;
    }
    panneau.innerHTML = `<div class="carte-connexion">${html}
        <p class="message-connexion${etat.messageOk ? " ok" : ""}" id="message-connexion">${echapper(etat.message)}</p></div>`;
    brancherPanneau(panneau);
}

function direMessage(texte, ok) {
    etat.message = texte || "";
    etat.messageOk = !!ok;
    const el = document.getElementById("message-connexion");
    if (el) { el.textContent = etat.message; el.classList.toggle("ok", etat.messageOk); }
}

function occupe(form, oui) {
    if (!form) return;
    form.querySelectorAll("button, input").forEach(el => { el.disabled = oui; });
    form.classList.toggle("occupe", oui);
}

const valeur = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };

function brancherPanneau(panneau) {
    panneau.querySelectorAll("[data-vue]").forEach(b => b.addEventListener("click", () => {
        jouerClic();
        etat.vue = b.dataset.vue;
        etat.message = "";
        rendrePanneau();
    }));
    panneau.querySelectorAll("[data-action]").forEach(b => b.addEventListener("click", () => {
        jouerClic();
        const a = b.dataset.action;
        if (a === "deconnecter") window.seDeconnecter();
        else if (a === "recharger") location.reload();
        else if (a === "mdp-oublie") motDePasseOublie();
    }));
    const formConnexion = panneau.querySelector("#form-connexion");
    if (formConnexion) formConnexion.addEventListener("submit", (ev) => { ev.preventDefault(); seConnecter(formConnexion); });
    const formInscription = panneau.querySelector("#form-inscription");
    if (formInscription) {
        formInscription.addEventListener("submit", (ev) => { ev.preventDefault(); sInscrire(formInscription); });
        // Le nom d'un ancien joueur fait paraître la Clé de Rune.
        const nom = formInscription.querySelector("#inscription-nom");
        const montrerCle = () => {
            const ancien = ANCIENS_JOUEURS[normaliserNom(nom.value)];
            const champ = formInscription.querySelector(".champ-cle");
            const note = formInscription.querySelector("#note-inscription");
            if (champ) champ.hidden = !ancien;
            if (note) note.textContent = ancien
                ? `Tu reprends ${ancien.nom} et ses personnages : entre la Clé de Rune.`
                : "Nico ou Ben validera ta demande.";
        };
        nom.addEventListener("input", montrerCle);
        montrerCle();
    }
}

function jouerClic() { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); }

// =========================================================================
//  LES GESTES : SE CONNECTER, S'INSCRIRE, L'OUBLI, SE DÉCONNECTER
// =========================================================================
async function seConnecter(form) {
    if (!sdk) return;
    const email = valeur("connexion-email").trim(), mdp = valeur("connexion-mdp");
    if (!email) { direMessage("Entre ton adresse e-mail."); return; }
    if (!mdp) { direMessage("Entre ton mot de passe."); return; }
    occupe(form, true);
    direMessage("Ouverture du sceau…", true);
    try {
        await sdk.fa.signInWithEmailAndPassword(sdk.auth, email, mdp);
    } catch (e) {
        occupe(form, false);
        direMessage(messageErreur(e));
    }
}

async function motDePasseOublie() {
    if (!sdk) return;
    const email = valeur("connexion-email").trim();
    if (!email) { direMessage("Entre d'abord ton adresse e-mail, puis touche « Mot de passe oublié ? »."); return; }
    try {
        await sdk.fa.sendPasswordResetEmail(sdk.auth, email);
        direMessage("Si un compte existe pour cette adresse, un e-mail vient de partir pour choisir un nouveau mot de passe (pense à regarder les spams).", true);
    } catch (e) {
        if (e && e.code === "auth/user-not-found") {
            direMessage("Si un compte existe pour cette adresse, un e-mail vient de partir pour choisir un nouveau mot de passe (pense à regarder les spams).", true);
        } else {
            direMessage(messageErreur(e));
        }
    }
}

// Le nom est-il libre ? (Les règles laissent lire un nom, pas la liste.)
async function verifierNomLibre(norm) {
    const { fs } = sdk;
    const pris = await fs.getDoc(fs.doc(db, "Noms_Utilisateurs", norm));
    if (pris.exists()) {
        const ancien = ANCIENS_JOUEURS[norm];
        throw new ErreurTexte(ancien ? `${ancien.nom} a déjà été repris par un compte.` : "Ce nom d'utilisateur est déjà pris.");
    }
}

// La Clé de Rune, vérifiée ici quand la base la laisse lire. Une fois les
// règles posées, elle ne la laisse plus lire : ce sont alors les règles qui
// la vérifient, sans jamais la montrer.
async function verifierCleSiLisible(cle) {
    const { fs } = sdk;
    let cfg = null;
    try {
        const snap = await fs.getDoc(fs.doc(db, "MDP_Nouvelle_Partie", "config"));
        cfg = snap.exists() ? snap.data() : null;
    } catch (e) { return; }
    const vraie = cfg ? String(cfg.mdp_nouvelle_partie === undefined || cfg.mdp_nouvelle_partie === null ? "" : cfg.mdp_nouvelle_partie).trim() : "";
    if (vraie && vraie !== String(cle || "").trim()) throw new ErreurTexte("La Clé de Rune est incorrecte.");
}

function lireInscription(incomplet) {
    const nom = valeur("inscription-nom").trim();
    const cle = valeur("inscription-cle");
    const erreurNom = verifierNom(nom);
    if (erreurNom) throw new ErreurTexte(erreurNom);
    const norm = normaliserNom(nom);
    const ancien = ANCIENS_JOUEURS[norm] || null;
    if (ancien && !cle.trim()) throw new ErreurTexte(`Pour reprendre ${ancien.nom}, entre la Clé de Rune.`);
    if (incomplet) return { nom, norm, ancien, cle };
    const email = valeur("inscription-email").trim();
    const mdp = valeur("inscription-mdp"), mdp2 = valeur("inscription-mdp2");
    if (!email) throw new ErreurTexte("Entre ton adresse e-mail.");
    if (mdp.length < 6) throw new ErreurTexte("Le mot de passe doit faire au moins 6 caractères.");
    if (mdp !== mdp2) throw new ErreurTexte("Les deux mots de passe ne sont pas identiques.");
    return { nom, norm, ancien, cle, email, mdp };
}

async function sInscrire(form) {
    if (!sdk) return;
    const incomplet = etat.phase === "incomplet";
    let saisie;
    try { saisie = lireInscription(incomplet); }
    catch (e) { direMessage(messageErreur(e)); return; }
    occupe(form, true);
    direMessage("Vérification…", true);
    try {
        await verifierNomLibre(saisie.norm);
        if (saisie.ancien) await verifierCleSiLisible(saisie.cle);
        let user = sdk.auth.currentUser;
        if (!incomplet) {
            etat.inscriptionEnCours = true;
            const cred = await sdk.fa.createUserWithEmailAndPassword(sdk.auth, saisie.email, saisie.mdp);
            user = cred.user;
        }
        await creerProfil(user, saisie);
        etat.inscriptionEnCours = false;
    } catch (e) {
        const avait = etat.inscriptionEnCours;
        etat.inscriptionEnCours = false;
        console.warn("Comptes : inscription", e);
        // Le compte Firebase existe déjà (créé juste avant) : on reste sur
        // « il manque un nom », pour réessayer sans tout ressaisir.
        if (avait && sdk.auth.currentUser && etat.phase !== "incomplet") passerA("incomplet");
        const f = document.getElementById("form-inscription");
        occupe(f, false);
        const nomChamp = document.getElementById("inscription-nom");
        if (nomChamp && !nomChamp.value) {
            nomChamp.value = saisie.nom;
            // (Le champ de la Clé suit la saisie : on la lui signale.)
            nomChamp.dispatchEvent(new Event("input"));
        }
        direMessage(e && e.code === "permission-denied"
            ? (saisie.ancien ? "La Clé de Rune est incorrecte, ou ce nom vient d'être repris." : "Ce nom vient d'être pris : choisis-en un autre.")
            : messageErreur(e));
    }
}

// Le profil, en un seul lot : le nom réservé, le compte, et pour un ancien
// joueur, son numéro qui reçoit l'Uid.
async function creerProfil(user, { nom, norm, ancien, cle }) {
    const { fs } = sdk;
    const nomAffiche = ancien ? ancien.nom : nom.trim().replace(/\s+/g, " ");
    const lot = fs.writeBatch(db);
    lot.set(fs.doc(db, "Noms_Utilisateurs", norm), { Uid: user.uid, Nom: nomAffiche });
    lot.set(fs.doc(db, "Comptes", user.uid), {
        Uid: user.uid,
        Email: user.email || "",
        Nom: nomAffiche,
        Nom_Normalise: norm,
        Cree_Le: fs.serverTimestamp(),
        ...(ancien
            ? { Statut: "Valide", Role: ancien.role, ID_Joueur: ancien.id, Cle: String(cle || "").trim() }
            : { Statut: "En_attente", Role: "joueur", ID_Joueur: "" })
    });
    if (ancien) lot.update(fs.doc(db, "Joueurs", ancien.id), { Uid: user.uid });
    await lot.commit();
}

// Se déconnecter : la session s'en va, et la page repart de zéro (aucun
// écouteur ne doit survivre au joueur qui part).
window.seDeconnecter = async function () {
    try { if (sdk) await sdk.fa.signOut(sdk.auth); } catch (e) { console.error("Comptes : déconnexion", e); }
    try { localStorage.removeItem("ID_JOUEUR_COURANT"); } catch (e) {}
    location.reload();
};

// =========================================================================
//  LE MENU : LE JOUEUR CONNECTÉ, SON COMPTE, LES DEMANDES
// =========================================================================
function rendreBarre() {
    const barre = document.getElementById("barre-compte");
    if (!barre) return;
    const c = window.COMPTE_JOUEUR;
    barre.style.display = (etat.phase === "valide" && c) ? "flex" : "none";
    if (!c) return;
    const nom = document.getElementById("barre-compte-nom");
    if (nom) nom.textContent = c.nom;
    const btn = document.getElementById("btn-demandes");
    if (btn) btn.style.display = c.admin ? "" : "none";
    const pastille = document.getElementById("pastille-demandes");
    if (pastille) {
        pastille.textContent = String(etat.demandes.length);
        pastille.style.display = etat.demandes.length ? "" : "none";
    }
}

function ouvrirModale(id) {
    const overlay = document.getElementById("overlay-modale");
    if (overlay) overlay.style.display = "block";
    const m = document.getElementById(id);
    if (m) m.style.display = "block";
}
window.fermerModalesCompte = function () {
    ["modale-compte", "modale-demandes"].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.style.display = "none";
    });
    const overlay = document.getElementById("overlay-modale");
    if (overlay) overlay.style.display = "none";
};

window.ouvrirMonCompte = function () {
    const c = window.COMPTE_JOUEUR;
    if (!c) return;
    const poser = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    poser("compte-nom", c.nom);
    poser("compte-email", c.email);
    poser("compte-role", c.admin ? "Valide les inscriptions" : "Joueur");
    ["compte-mdp-actuel", "compte-mdp-nouveau", "compte-mdp-confirmer"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
    });
    poser("message-compte", "");
    ouvrirModale("modale-compte");
};

async function changerMotDePasse(form) {
    const msg = document.getElementById("message-compte");
    const dire = (t, ok) => { if (msg) { msg.textContent = t; msg.classList.toggle("ok", !!ok); } };
    if (!sdk || !sdk.auth.currentUser) return;
    const actuel = valeur("compte-mdp-actuel"), nouveau = valeur("compte-mdp-nouveau"), confirme = valeur("compte-mdp-confirmer");
    if (!actuel) { dire("Entre ton mot de passe actuel."); return; }
    if (nouveau.length < 6) { dire("Le nouveau mot de passe doit faire au moins 6 caractères."); return; }
    if (nouveau !== confirme) { dire("Les deux nouveaux mots de passe ne sont pas identiques."); return; }
    occupe(form, true);
    try {
        const user = sdk.auth.currentUser;
        await sdk.fa.reauthenticateWithCredential(user, sdk.fa.EmailAuthProvider.credential(user.email, actuel));
        await sdk.fa.updatePassword(user, nouveau);
        form.reset();
        dire("Ton mot de passe est changé.", true);
    } catch (e) {
        dire(e && (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential" || e.code === "auth/invalid-login-credentials")
            ? "Ton mot de passe actuel est incorrect." : messageErreur(e));
    } finally {
        occupe(form, false);
    }
}

// Nico et Ben : les demandes en attente, écoutées tant que le compte est ouvert.
function ecouterDemandes() {
    if (arretDemandes || !sdk) return;
    const { fs } = sdk;
    const q = fs.query(fs.collection(db, "Comptes"), fs.where("Statut", "==", "En_attente"));
    arretDemandes = fs.onSnapshot(q, (snap) => {
        const liste = [];
        snap.forEach(d => liste.push({ uid: d.id, ...d.data() }));
        const quand = (x) => (x.Cree_Le && typeof x.Cree_Le.toMillis === "function") ? x.Cree_Le.toMillis() : 0;
        liste.sort((a, b) => quand(a) - quand(b));
        etat.demandes = liste;
        rendreBarre();
        rendreDemandes();
    }, (err) => console.error("Comptes : demandes d'inscription", err));
}

window.ouvrirDemandesInscription = function () {
    if (!(window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.admin)) return;
    const msg = document.getElementById("message-demandes");
    if (msg) msg.textContent = "";
    rendreDemandes();
    ouvrirModale("modale-demandes");
};

function rendreDemandes() {
    const liste = document.getElementById("liste-demandes");
    if (!liste) return;
    if (!etat.demandes.length) {
        liste.innerHTML = `<p class="texte-demandes">Aucune demande en attente.</p>`;
        return;
    }
    const date = (x) => (x.Cree_Le && typeof x.Cree_Le.toDate === "function")
        ? x.Cree_Le.toDate().toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
    liste.innerHTML = etat.demandes.map(d => `
        <div class="demande-inscription" data-uid="${echapper(d.uid)}">
          <div class="demande-qui"><b>${echapper(d.Nom)}</b><span>${echapper(d.Email)}</span>${date(d) ? `<i>le ${echapper(date(d))}</i>` : ""}</div>
          <div class="demande-boutons">
            <button type="button" class="btn-modale btn-accepter" data-decision="accepter">Accepter</button>
            <button type="button" class="btn-modale btn-refuser" data-decision="refuser">Refuser</button>
          </div>
        </div>`).join("");
    liste.querySelectorAll("[data-decision]").forEach(b => b.addEventListener("click", async () => {
        jouerClic();
        const ligne = b.closest(".demande-inscription");
        const uid = ligne && ligne.dataset.uid;
        const demande = etat.demandes.find(d => d.uid === uid);
        if (!demande) return;
        const msg = document.getElementById("message-demandes");
        ligne.querySelectorAll("button").forEach(x => { x.disabled = true; });
        try {
            if (b.dataset.decision === "accepter") {
                const id = await accepterDemande(uid);
                if (msg) msg.textContent = `${demande.Nom} est accepté (joueur ${id}).`;
            } else {
                if (!confirm(`Refuser la demande de ${demande.Nom} ?`)) {
                    ligne.querySelectorAll("button").forEach(x => { x.disabled = false; });
                    return;
                }
                await refuserDemande(uid);
                if (msg) msg.textContent = `La demande de ${demande.Nom} est refusée.`;
            }
        } catch (e) {
            console.error("Comptes : décision", e);
            ligne.querySelectorAll("button").forEach(x => { x.disabled = false; });
            if (msg) msg.textContent = messageErreur(e);
        }
    }));
}

// Accepter : le numéro de joueur suivant (P_04, P_05…), le joueur créé et le
// compte validé, dans la même transaction — deux validations simultanées ne
// prennent jamais le même numéro.
export async function accepterDemande(uid) {
    const { fs } = sdk;
    const joueurs = await fs.getDocs(fs.collection(db, "Joueurs"));
    let max = 0;
    joueurs.forEach(d => {
        const m = /^P_(\d+)$/.exec(d.id);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    for (let n = max + 1; n <= max + 20; n++) {
        const id = "P_" + String(n).padStart(2, "0");
        const libre = await fs.runTransaction(db, async (t) => {
            const refJoueur = fs.doc(db, "Joueurs", id), refCompte = fs.doc(db, "Comptes", uid);
            const j = await t.get(refJoueur);
            if (j.exists()) return false;
            const c = await t.get(refCompte);
            if (!c.exists() || c.data().Statut !== "En_attente") throw new ErreurTexte("Cette demande a déjà été traitée.");
            t.set(refJoueur, { ID_Joueur: id, Nom: c.data().Nom, Uid: uid });
            t.update(refCompte, { Statut: "Valide", ID_Joueur: id, Valide_Par: sdk.auth.currentUser.uid, Valide_Le: fs.serverTimestamp() });
            return true;
        });
        if (libre) return id;
    }
    throw new ErreurTexte("Aucun numéro de joueur libre.");
}

export async function refuserDemande(uid) {
    const { fs } = sdk;
    await fs.updateDoc(fs.doc(db, "Comptes", uid), {
        Statut: "Refuse", Valide_Par: sdk.auth.currentUser.uid, Valide_Le: fs.serverTimestamp()
    });
}

// =========================================================================
//  BRANCHEMENTS
// =========================================================================
function brancherMenu() {
    const form = document.getElementById("form-changer-mdp");
    if (form) form.addEventListener("submit", (ev) => { ev.preventDefault(); changerMotDePasse(form); });
    rendrePanneau();
    rendreBarre();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", brancherMenu);
else brancherMenu();

// Pour les bancs : l'état, sans rien à modifier.
window.ComptesIvalis = {
    get phase() { return etat.phase; },
    get demandes() { return etat.demandes.map(d => ({ ...d })); },
    normaliserNom, verifierNom, messageErreur, ANCIENS_JOUEURS
};

demarrer();
