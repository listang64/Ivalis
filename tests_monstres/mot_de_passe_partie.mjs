// LE MOT DE PASSE D'UNE PARTIE : VÉRIFIÉ SANS RIEN DEMANDER À PERSONNE
//
// « Des fois, sur iPad uniquement, j'ai un temps de chargement très long quand
// je fais charger une partie et qu'il vérifie le mot de passe. »
//
// LA CAUSE. Vérifier un mot de passe, c'est comparer deux chaînes — mais la
// fonction allait d'abord redemander à Firestore le document de la partie. Or
// ce document est DÉJÀ LÀ : `ecouterPartiesEnCours` écoute la collection depuis
// l'ouverture de la page, bien avant que le joueur tape quoi que ce soit, et
// chaque document livré par cette écoute porte tous ses champs, mot de passe
// compris. On n'en gardait que le nom et l'identifiant.
//
// Et un `getDoc` sur un document déjà connu n'est pas gratuit : il part quand
// même au serveur — il ne se rabat sur le cache local que hors ligne. Sur une
// connexion qui se dégrade, il attend. C'est là que passait la minute.
//
// CE BANC SERT LA VRAIE PAGE, avec un Firestore de papier dont le `getDoc` est
// COMPTÉ et LENT À DESSEIN (une seconde et demie). Si quelqu'un remet un
// aller-retour réseau sur ce chemin, l'écran mettra une seconde et demie à
// s'ouvrir au lieu de quelques millisecondes, et le banc le dira.
//
// Il tient aussi ce qui va avec :
//   • un mauvais mot de passe reste refusé, évidemment ;
//   • si l'écoute n'a rien livré (première ouverture, réseau coupé au
//     démarrage), l'ancien chemin réseau sert encore de filet ;
//   • et si la base ne répond pas du tout, le joueur n'attend pas
//     indéfiniment devant « Vérification... » : on le lui dit, et on ne lui
//     annonce surtout pas un mot de passe incorrect, qui serait un mensonge.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

const FAUX_APP = `export const initializeApp = () => ({});`;

// LE FIRESTORE DE PAPIER. Son `getDoc` est lent — c'est lui, le chronomètre du
// banc : tout chemin qui y passe se voit immédiatement dans les millisecondes.
const FAUX_FIRESTORE = `
  const scenario = () => globalThis.__SCENARIO || {};
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => {
    const chemin = (ref && ref.chemin) || "";
    globalThis.__GETDOC = (globalThis.__GETDOC || []).concat(chemin);
    if ((ref && ref.col) === "Systeme_Parties") {
      // La base muette : elle ne répondra jamais.
      if (scenario().baseMuette) return new Promise(() => {});
      // Sinon elle répond, mais LENTEMENT : c'est tout l'objet du banc.
      await new Promise(r => setTimeout(r, scenario().lenteurReseau || 1500));
      const partie = (scenario().parties || []).find(p => p.ID_Partie === (ref && ref.id));
      return { exists: () => !!partie, data: () => partie || {} };
    }
    return { exists: () => false, data: () => ({}) };
  };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a }); export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
  // L'écoute des parties en cours : c'est elle qui apporte les documents, mot
  // de passe compris, bien avant que le joueur tape quoi que ce soit.
  const livrer = (surDonnees) => surDonnees({
    forEach: (f) => (scenario().parties || []).forEach(d => f({ id: d.ID_Partie, data: () => d }))
  });
  export const onSnapshot = (ref, surDonnees) => {
    // UNE REQUÊTE, PAS UN DOCUMENT. query(...) rend { a: [...] }, doc(...)
    // rend { col, id } : le jeu écoute AUSSI le document de la partie en cours,
    // et lui servir un instantané de collection le ferait tomber sur un
    // snap.exists() qui n'existe pas. Les autres écoutes ne reçoivent rien ici :
    // ce banc ne parle que du mot de passe.
    const requete = ref && ref.a && ref.a[0];
    const cible = (requete && requete.col) || "";
    if (cible === "Systeme_Parties" && !scenario().ecouteMuette) {
      // La livraison est rejouable à la demande : c'est ainsi qu'on imite un
      // document modifié depuis un autre poste, sans recharger la page.
      globalThis.__REJOUER_PARTIES = () => livrer(surDonnees);
      setTimeout(() => livrer(surDonnees), 10);
    }
    return () => {};
  };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();

const PARTIES = [
  { ID_Partie: "GAME_1", Nom_Du_Groupe: "Les Errants", Mot_De_Passe: "cybile", Statut: "En_cours" },
  { ID_Partie: "GAME_2", Nom_Du_Groupe: "La Meute", Mot_De_Passe: "gnoll", Statut: "En_cours" }
];

// Un poste neuf par situation : l'écoute part au chargement de la page, il faut
// donc rouvrir la page pour changer ce qu'elle apporte.
async function poste(scenario) {
  const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
  await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
  await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
  await p.addInitScript((sc) => { globalThis.__SCENARIO = sc; globalThis.__GETDOC = []; },
                        Object.assign({ parties: PARTIES }, scenario));
  await p.goto(base + '/index.html');
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.jouerSonClic = () => {}; });
  return p;
}

// Le geste réel : on choisit la partie, on tape, on déverrouille, et on
// chronomètre ce que le joueur, lui, passe à attendre.
async function deverrouiller(p, idPartie, motDePasse) {
  return await p.evaluate(async ({ idPartie, motDePasse }) => {
    window.demanderMdpPartie(idPartie);
    document.getElementById("saisie-mdp-partie").value = motDePasse;
    const depart = Date.now();
    await window.validerMdpPartie();
    const ms = Date.now() - depart;
    const message = document.getElementById("msg-erreur-partie");
    return {
      ms,
      entre: document.getElementById("ecran-jeu").style.display === "block",
      partieCourante: window.ID_PARTIE_COURANTE || "",
      erreurVisible: message.style.display === "block",
      erreurTexte: (message.innerText || "").trim(),
      bouton: document.getElementById("btn-valider-mdp-partie").innerText,
      lecturesParties: (globalThis.__GETDOC || []).filter(c => c.startsWith("Systeme_Parties/"))
    };
  }, { idPartie, motDePasse });
}

// =========================================================================
console.log("\n1. LE BON MOT DE PASSE : AUCUN ALLER-RETOUR, ET L'ÉCRAN S'OUVRE");
// =========================================================================
// Le `getDoc` du banc met une seconde et demie. Si ce chemin y passe encore,
// c'est le joueur qui attend — et le chronomètre le dit.
{
  const p = await poste({});
  const r = await deverrouiller(p, "GAME_1", "cybile");

  verifier("AUCUNE LECTURE RÉSEAU DE LA PARTIE",
           r.lecturesParties.length === 0, JSON.stringify(r.lecturesParties));
  verifier("LA VÉRIFICATION EST IMMÉDIATE", r.ms < 300, `${r.ms} ms`);
  verifier("la table de jeu s'ouvre", r.entre === true);
  verifier("sur la bonne partie", r.partieCourante === "GAME_1", r.partieCourante);
  verifier("et rien ne s'affiche en rouge", r.erreurVisible === false);
  console.log(`     mesuré : ${r.ms} ms, ${r.lecturesParties.length} lecture(s) réseau`);
  await p.close();
}

// =========================================================================
console.log("\n2. LE MAUVAIS MOT DE PASSE RESTE REFUSÉ");
// =========================================================================
{
  const p = await poste({});
  const r = await deverrouiller(p, "GAME_1", "pas-le-bon");
  verifier("la porte reste fermée", r.entre === false);
  verifier("le refus est annoncé", r.erreurVisible === true);
  verifier("et il dit la vérité : mot de passe incorrect",
           /incorrect/i.test(r.erreurTexte), r.erreurTexte);
  verifier("sans aller le redemander au serveur", r.lecturesParties.length === 0);

  // Et la partie voisine a bien son propre mot de passe.
  const r2 = await deverrouiller(p, "GAME_2", "cybile");
  verifier("le mot de passe d'une partie ne déverrouille pas l'autre", r2.entre === false);
  const r3 = await deverrouiller(p, "GAME_2", "gnoll");
  verifier("chacune s'ouvre avec le sien", r3.entre === true && r3.partieCourante === "GAME_2",
           r3.partieCourante);
  await p.close();
}

// =========================================================================
console.log("\n3. SI L'ÉCOUTE N'A RIEN LIVRÉ, LE RÉSEAU SERT ENCORE DE FILET");
// =========================================================================
// Première ouverture, réseau coupé au démarrage : la table en mémoire est vide.
// Le jeu doit alors faire ce qu'il faisait avant — et cette fois, y passer du
// temps est normal.
{
  const p = await poste({ ecouteMuette: true, lenteurReseau: 300 });
  const r = await deverrouiller(p, "GAME_1", "cybile");
  verifier("le document est bien demandé au serveur",
           r.lecturesParties.length === 1, JSON.stringify(r.lecturesParties));
  verifier("ET LA PARTIE S'OUVRE QUAND MÊME", r.entre === true);
  verifier("sur la bonne partie", r.partieCourante === "GAME_1", r.partieCourante);
  await p.close();
}

// =========================================================================
console.log("\n4. UNE BASE MUETTE NE FIGE PLUS LE BOUTON — ET NE MENT PAS");
// =========================================================================
// Le pire cas : l'écoute n'a rien apporté ET le serveur ne répond pas. Avant,
// le bouton restait sur « Vérification... » aussi longtemps que Firestore
// voulait bien attendre. Maintenant on s'arrête, et on dit ce qui se passe —
// surtout pas « mot de passe incorrect », qui serait faux.
{
  const p = await poste({ ecouteMuette: true, baseMuette: true });
  await p.evaluate(() => { window.PATIENCE_LECTURE_PARTIE = 400; });
  const r = await deverrouiller(p, "GAME_1", "cybile");

  verifier("ON N'ATTEND PAS INDÉFINIMENT", r.ms < 2000, `${r.ms} ms`);
  // innerText rend le texte tel qu'il s'affiche, et la feuille de style le met
  // en capitales : on compare sans se soucier de la casse.
  verifier("le bouton est rendu au joueur",
           (r.bouton || "").toLowerCase() === "déverrouiller", r.bouton);
  verifier("le message parle de la connexion, pas du mot de passe",
           /ne répond pas|connexion/i.test(r.erreurTexte) && !/incorrect/i.test(r.erreurTexte),
           r.erreurTexte);
  verifier("et on n'entre évidemment pas dans la partie", r.entre === false);
  await p.close();
}

// =========================================================================
console.log("\n5. UN MOT DE PASSE CHANGÉ AILLEURS ARRIVE TOUT SEUL");
// =========================================================================
// L'écoute est permanente : quand un autre poste change le mot de passe, la
// table en mémoire doit suivre, sinon on aurait troqué une lenteur contre une
// porte qui refuse le bon mot de passe. On rejoue donc la livraison de l'écoute
// avec un document modifié — exactement ce que fait le SDK quand la base bouge.
{
  const p = await poste({});
  const avant = await deverrouiller(p, "GAME_1", "cybile");
  verifier("l'ancien mot de passe ouvre, pour commencer", avant.entre === true);

  await p.evaluate(async () => {
    globalThis.__SCENARIO.parties = [
      { ID_Partie: "GAME_1", Nom_Du_Groupe: "Les Errants", Mot_De_Passe: "nouveau", Statut: "En_cours" }
    ];
    globalThis.__REJOUER_PARTIES();
    // On ressort de la partie : l'écran de jeu est ouvert depuis l'essai d'avant.
    document.getElementById("ecran-jeu").style.display = "none";
    window.ID_PARTIE_COURANTE = "";
  });

  const ancien = await deverrouiller(p, "GAME_1", "cybile");
  verifier("après le changement, l'ancien ne passe plus", ancien.entre === false);
  await p.evaluate(() => {
    document.getElementById("ecran-jeu").style.display = "none";
    window.ID_PARTIE_COURANTE = "";
  });
  const nouveau = await deverrouiller(p, "GAME_1", "nouveau");
  verifier("LE NOUVEAU PASSE, ET TOUJOURS SANS RÉSEAU",
           nouveau.entre === true && nouveau.lecturesParties.length === 0,
           `${nouveau.lecturesParties.length} lecture(s) réseau`);
  await p.close();
}

await b.close();
serveur.close();
console.log(echecs === 0
  ? "\n✅ Le mot de passe se vérifie en mémoire, et la base muette ne fige plus personne."
  : `\n❌ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
