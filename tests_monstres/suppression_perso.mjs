// SUPPRIMER UN PERSONNAGE DOIT TOUT EMPORTER.
// Effacer un héros ne retirait que sa fiche, ses caractéristiques et ses
// compétences — et sa place dans l'initiative uniquement si une partie était
// ouverte à l'écran. Restaient derrière : son nom dans l'ordre d'initiative,
// son pion sur le plateau, ses illusions, ses zones persistantes.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/app.js','utf-8');
const debut = src.indexOf('async function supprimerPersonnageBDD(idPersonnage) {');
const fin = src.indexOf('\n}\n', src.indexOf('🧹 [Nettoyage] Terminé', debut)) + 3;
const fonction = src.slice(debut, fin);

// LE MÉNAGE DES IMAGES N'EST PAS BOUCHONNÉ : c'est lui qu'on met à l'épreuve.
// On prend donc le VRAI code — la lecture d'identifiant (ia_master.js) et les
// deux fonctions de ménage (loot.js) — et on ne simule que le seul appel qui
// parle vraiment au réseau.
const extraire = (fichier, marqueur, finLigne = '};') => {
  const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
};
const SRC_MENAGE = [
  extraire('ia_master.js', 'const estTransformationCloudinary = (seg) =>',
           "    !seg.includes('.') && seg.split(',').every(part => /^[a-z]{1,3}_[^,/]+$/.test(part));"),
  extraire('ia_master.js', 'function idPublicCloudinary(urlImage) {', '}'),
  'window.idPublicCloudinary = idPublicCloudinary;',
  extraire('loot.js', 'window.imagesEncoreUtilisees = function(options) {'),
  extraire('loot.js', 'window.oublierImages = async function(urls, raison, options) {')
].join('\n\n');

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

// ---- Firestore simulé : des collections, des documents, rien de plus ----
function creerBase() {
  const base = {
    Personnages: {
      // CE HÉROS PORTE TOUT CE QU'UN HÉROS PEUT PORTER : son portrait de
      // référence, son avatar dans l'armure du moment, son pion tactique, et
      // les trois dessins de son équipement. Chacun est un fichier distinct sur
      // Cloudinary, et chacun était abandonné là.
      PERSO_1: { Prenom_Personnage:"Pliors", ID_Partie:"GAME_1", ID_Joueur:"P_01",
                 URL_Cloudinary:"https://res.cloudinary.com/x/upload/v1/portrait.png",
                 URL_Avatar_Equipe:"https://res.cloudinary.com/x/upload/v1/avatar_habille.png",
                 URL_Token:"https://res.cloudinary.com/x/upload/v1/pion.png",
                 Equip_Armure: { uid:"o1", nom:"Cotte", image:"https://res.cloudinary.com/x/upload/v1/cotte.png" },
                 Equip_Main_Droite: { uid:"o2", nom:"Épée", image:"https://res.cloudinary.com/x/upload/v1/epee.png" },
                 Equip_Main_Gauche: { uid:"o3", nom:"Écu", image:"https://res.cloudinary.com/x/upload/v1/ecu.png" } },
      PERSO_2: { Prenom_Personnage:"Jade", ID_Partie:"GAME_1", ID_Joueur:"P_02" },
      ILLUSION_a: { Est_Illusion:true, ID_Lanceur:"PERSO_1", ID_Partie:"GAME_1", Nom_Personnage:"Pliors" },
      ILLUSION_b: { Est_Illusion:true, ID_Lanceur:"PERSO_2", ID_Partie:"GAME_1", Nom_Personnage:"Jade" }
    },
    "Personnages/PERSO_1/Competences": { C1:{Nom:"Mur de feu"}, C2:{Nom:"Traction"} },
    Caracteristiques: { PERSO_1:{ FORCE:3 }, PERSO_2:{ FORCE:2 } },
    Systeme_Parties: { GAME_1: {
      Ordre_Initiative:["PERSO_1","PERSO_2","MONSTRE_1"],
      File_Attente_Combat:[{idPersonnage:"PERSO_1",idCarte:"C1"},{idPersonnage:"PERSO_2",idCarte:"C9"}],
      Phase_Combat:"Preparation" } },
    Combat_VTT: { GAME_1: {
      Tokens: { PERSO_1:{q:0,r:0}, PERSO_2:{q:1,r:0}, ILLUSION_a:{q:2,r:0} },
      Zones_Persistantes: { zp_1:{ id:"zp_1", idLanceur:"PERSO_1" }, zp_2:{ id:"zp_2", idLanceur:"PERSO_2" } } } }
  };
  return base;
}

function firestore(base) {
  const SUPPR = { __supprimer: true };
  const chemin = (...seg) => seg.slice(1).join("/");
  const doc = (...a) => {
    const parts = a.slice(1);
    return { collection: parts.slice(0, -1).join("/"), id: parts[parts.length - 1] };
  };
  const collection = (...a) => ({ collection: a.slice(1).join("/") });
  const where = (champ, op, val) => ({ champ, val });
  const query = (col, ...filtres) => ({ ...col, filtres });
  const getDoc = async (ref) => {
    const d = (base[ref.collection] || {})[ref.id];
    return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d)) };
  };
  const getDocs = async (q) => {
    const col = base[q.collection] || {};
    let ids = Object.keys(col);
    (q.filtres || []).forEach(f => { ids = ids.filter(id => col[id][f.champ] === f.val); });
    const docs = ids.map(id => ({ id, data: () => col[id] }));
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
  };
  const deleteDoc = async (ref) => { delete (base[ref.collection] || {})[ref.id]; };
  const updateDoc = async (ref, maj) => {
    const d = (base[ref.collection] || {})[ref.id];
    if (!d) throw new Error("document absent");
    Object.entries(maj).forEach(([cle, valeur]) => {
      if (cle.includes(".")) {
        const [champ, sousCle] = cle.split(".");
        if (valeur === SUPPR) { if (d[champ]) delete d[champ][sousCle]; }
        else { d[champ] = d[champ] || {}; d[champ][sousCle] = valeur; }
      } else d[cle] = valeur;
    });
  };
  const writeBatch = () => {
    const ops = [];
    return { delete: (ref) => ops.push(ref), commit: async () => ops.forEach(r => delete (base[r.collection] || {})[r.id]) };
  };
  return { doc, collection, where, query, getDoc, getDocs, deleteDoc, updateDoc, writeBatch,
           deleteField: () => SUPPR, setDoc: async () => {}, addDoc: async () => {}, SUPPR };
}

async function supprimer({ partieOuverte, avecClesCloudinary = true }) {
  const base = creerBase();
  const fs2 = firestore(base);
  const imagesDetruites = [];
  const w = {
    ID_PARTIE_COURANTE: partieOuverte,
    // LE HÉROS EFFACÉ EST ENCORE DANS LA LISTE EN MÉMOIRE au moment du ménage :
    // elle n'est nettoyée qu'à l'étape d'après. C'est tout le piège du garde-fou
    // « ne jamais effacer une image encore utilisée » — sans `saufPersonnage`,
    // ses propres images se protégeraient elles-mêmes et rien ne partirait.
    PERSOS_PARTIE: [
      { idPersonnage:"PERSO_1", statut:"Vivant",
        urlCloudinary:"https://res.cloudinary.com/x/upload/v1/avatar_habille.png",
        urlPortraitReference:"https://res.cloudinary.com/x/upload/v1/portrait.png",
        urlAvatarEquipe:"https://res.cloudinary.com/x/upload/v1/avatar_habille.png",
        urlToken:"https://res.cloudinary.com/x/upload/v1/pion.png",
        equipArmure: { uid:"o1", image:"https://res.cloudinary.com/x/upload/v1/cotte.png" },
        equipMainDroite: { uid:"o2", image:"https://res.cloudinary.com/x/upload/v1/epee.png" },
        equipMainGauche: { uid:"o3", image:"https://res.cloudinary.com/x/upload/v1/ecu.png" } },
      // Un camarade porte son propre matériel : rien de tout cela ne doit
      // partir avec le héros effacé.
      { idPersonnage:"PERSO_2", statut:"Vivant",
        urlCloudinary:"https://res.cloudinary.com/x/upload/v1/portrait_jade.png",
        equipArmure: { uid:"o9", image:"https://res.cloudinary.com/x/upload/v1/robe_jade.png" } }
    ],
    PERSOS_JOUEURS_PARTIE: [], TOKENS_VTT_DATA: {}, SOURCE_COMBATTANTS: {}, CACHE_COMPETENCES_GLOBAL: {},
    RESERVE_CONNUE: {}, PARTIE_DATA: {},
    supprimerImageCloudinary: async (url) => { imagesDetruites.push(url); }
  };
  global.window = w;
  global.localStorage = { getItem: (k) => (k === "ivalis_CLOUDINARY_API_SECRET" && avecClesCloudinary) ? "secret" : null,
                          removeItem: () => {} };
  // Le vrai ménage, posé sur ce window : idPublicCloudinary, imagesEncoreUtilisees
  // et oublierImages tels qu'ils sont dans le jeu. APRÈS localStorage — il le
  // capture à la construction, et il en lit les clés Cloudinary.
  new Function('window', 'localStorage', 'console', SRC_MENAGE)(w, global.localStorage, console);
  const COL = { PERSONNAGES:"Personnages", CARACTERISTIQUES:"Caracteristiques", PARTIES:"Systeme_Parties" };
  const executer = new Function('window','db','COL','doc','getDoc','getDocs','deleteDoc','updateDoc',
                                'query','collection','where','writeBatch','deleteField',
                                fonction + '; return supprimerPersonnageBDD;')(
    w, {}, COL, fs2.doc, fs2.getDoc, fs2.getDocs, fs2.deleteDoc, fs2.updateDoc,
    fs2.query, fs2.collection, fs2.where, fs2.writeBatch, fs2.deleteField);
  const ok = await executer("PERSO_1");
  return { base, imagesDetruites, ok };
}

console.log("1. AVEC LA PARTIE OUVERTE À L'ÉCRAN");
{
  const { base, imagesDetruites, ok } = await supprimer({ partieOuverte: "GAME_1" });
  const partie = base.Systeme_Parties.GAME_1, vtt = base.Combat_VTT.GAME_1;
  verifier("la fonction rend la main sans erreur", ok === true);
  verifier("la fiche est effacée", !base.Personnages.PERSO_1);
  verifier("ses caractéristiques aussi", !base.Caracteristiques.PERSO_1);
  verifier("ses compétences aussi", Object.keys(base["Personnages/PERSO_1/Competences"]).length === 0);
  verifier("son illusion est effacée", !base.Personnages.ILLUSION_a);
  verifier("celle d'un autre héros est épargnée", !!base.Personnages.ILLUSION_b);
  verifier("il quitte l'ordre d'initiative", !partie.Ordre_Initiative.includes("PERSO_1"),
           `(${partie.Ordre_Initiative.join(", ")})`);
  verifier("et la file d'attente", !partie.File_Attente_Combat.some(f => f.idPersonnage === "PERSO_1"));
  verifier("son pion quitte le plateau", !vtt.Tokens.PERSO_1, `(${Object.keys(vtt.Tokens).join(", ")})`);
  verifier("le pion de son illusion aussi", !vtt.Tokens.ILLUSION_a);
  verifier("les autres pions restent", !!vtt.Tokens.PERSO_2);
  verifier("ses zones persistantes disparaissent", !vtt.Zones_Persistantes.zp_1);
  verifier("celles des autres restent", !!vtt.Zones_Persistantes.zp_2);
  // SIX IMAGES, PAS DEUX. Le portrait et le pion partaient déjà ; l'avatar
  // habillé (redessiné à chaque armure équipée) et les trois dessins de son
  // équipement restaient sur Cloudinary pour toujours.
  const nomsPartis = imagesDetruites.map(u => u.split("/").pop());
  verifier("TOUTES SES IMAGES SONT DÉTRUITES, pas seulement son portrait",
           imagesDetruites.length === 6, `(${imagesDetruites.length} : ${nomsPartis.join(", ")})`);
  ["portrait.png", "avatar_habille.png", "pion.png", "cotte.png", "epee.png", "ecu.png"]
    .forEach(nom => verifier("  · " + nom, nomsPartis.includes(nom)));
  verifier("ET RIEN DE CE QUE PORTE UN AUTRE HÉROS",
           !nomsPartis.some(n => /jade/.test(n)), nomsPartis.join(", "));
  verifier("le personnage épargné garde tout", !!base.Personnages.PERSO_2 && !!base.Caracteristiques.PERSO_2);
}

console.log("\n2. DEPUIS LE MENU PRINCIPAL, AUCUNE PARTIE OUVERTE");
{
  // C'est le cas qui laissait le héros dans l'ordre d'initiative pour toujours :
  // le nettoyage ne se faisait que sur la partie affichée à l'écran.
  const { base } = await supprimer({ partieOuverte: null });
  const partie = base.Systeme_Parties.GAME_1;
  verifier("il quitte quand même l'ordre d'initiative", !partie.Ordre_Initiative.includes("PERSO_1"),
           `(${partie.Ordre_Initiative.join(", ")})`);
  verifier("et son pion quitte le plateau", !base.Combat_VTT.GAME_1.Tokens.PERSO_1);
}

console.log("\n3. SANS LES CLÉS CLOUDINARY : LE RESTE PART QUAND MÊME");
{
  const { base, ok, imagesDetruites } = await supprimer({ partieOuverte: "GAME_1", avecClesCloudinary: false });
  verifier("la fiche est effacée malgré tout", ok === true && !base.Personnages.PERSO_1);
  verifier("et aucune image n'est touchée : on ne peut pas signer la demande",
           imagesDetruites.length === 0, `(${imagesDetruites.length})`);
}

console.log("\n4. ON N'EFFACE JAMAIS UNE IMAGE ENCORE UTILISÉE");
// =========================================================================
//  C'est la règle qui protège tout le reste, et la seule façon de se tromper
//  ici laisse un carré vide à l'écran — un défaut visible, là où une image
//  orpheline ne se voit pas. En cas de doute, on garde.
{
  const imagesDetruites = [];
  const w = {
    PERSOS_PARTIE: [
      { idPersonnage:"H1",
        // Une arme à DEUX MAINS occupe les deux emplacements avec le même
        // dessin : le relever deux fois ne doit pas l'effacer deux fois.
        equipMainDroite: { uid:"d", image:"https://res.cloudinary.com/x/upload/v1/hache.png" },
        equipMainGauche: { uid:"d", image:"https://res.cloudinary.com/x/upload/v1/hache.png" } }
    ],
    // Un objet du butin encore ouvert est à l'écran ; un objet resté en réserve
    // attend la rencontre suivante. Ni l'un ni l'autre n'est perdu.
    PARTIE_DATA: { Butin: { pool: [{ uid:"p", image:"https://res.cloudinary.com/x/upload/v1/pool.png" }],
                            parPersonnage: { H1: { items: [{ uid:"i", image:"https://res.cloudinary.com/x/upload/v1/lot.png" }] } } } },
    RESERVE_CONNUE: { facile: { items: [{ uid:"r", image:"https://res.cloudinary.com/x/upload/v1/reserve.png" }] } },
    supprimerImageCloudinary: async (url) => { imagesDetruites.push(url); }
  };
  global.window = w;
  global.localStorage = { getItem: (k) => k === "ivalis_CLOUDINARY_API_SECRET" ? "secret" : null };
  new Function('window', 'localStorage', 'console', SRC_MENAGE)(w, global.localStorage, console);

  const essayer = async (url) => { imagesDetruites.length = 0;
                                   await w.oublierImages(url, "essai"); return imagesDetruites.length; };

  verifier("une arme encore en main est épargnée",
           await essayer("https://res.cloudinary.com/x/upload/v1/hache.png") === 0);
  verifier("un objet du butin à l'écran aussi",
           await essayer("https://res.cloudinary.com/x/upload/v1/pool.png") === 0);
  verifier("un objet du lot d'un héros aussi",
           await essayer("https://res.cloudinary.com/x/upload/v1/lot.png") === 0);
  verifier("un objet gardé en réserve aussi",
           await essayer("https://res.cloudinary.com/x/upload/v1/reserve.png") === 0);
  verifier("mais un dessin que plus personne ne porte s'en va",
           await essayer("https://res.cloudinary.com/x/upload/v1/orphelin.png") === 1);

  // LA MÊME IMAGE SOUS DEUX URL. Cloudinary sert le même fichier avec ou sans
  // transformations, avec ou sans numéro de version : comparer les URL brutes
  // aurait laissé passer une image encore portée.
  verifier("LA MÊME IMAGE SOUS UNE AUTRE URL EST RECONNUE",
           await essayer("https://res.cloudinary.com/x/upload/q_auto,f_auto/v1789/hache.png") === 0);

  // Le butin qu'on referme ne protège plus ses objets : sinon chaque image du
  // lot se protégerait elle-même, et rien ne partirait jamais.
  imagesDetruites.length = 0;
  await w.oublierImages("https://res.cloudinary.com/x/upload/v1/pool.png",
                        "butin refermé", { avecButin: false });
  verifier("UNE FOIS LE BUTIN REFERMÉ, SES LAISSÉS-POUR-COMPTE PARTENT",
           imagesDetruites.length === 1, `(${imagesDetruites.length})`);

  // Deux fois la même URL dans un seul appel : une seule demande part.
  imagesDetruites.length = 0;
  await w.oublierImages(["https://res.cloudinary.com/x/upload/v1/double.png",
                         "https://res.cloudinary.com/x/upload/q_auto/v1/double.png"], "doublon");
  verifier("et un doublon ne se demande qu'une fois", imagesDetruites.length === 1,
           `(${imagesDetruites.length})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
