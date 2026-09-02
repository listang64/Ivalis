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

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

// ---- Firestore simulé : des collections, des documents, rien de plus ----
function creerBase() {
  const base = {
    Personnages: {
      PERSO_1: { Prenom_Personnage:"Pliors", ID_Partie:"GAME_1", ID_Joueur:"P_01",
                 URL_Cloudinary:"https://res.cloudinary.com/x/upload/v1/portrait.png",
                 URL_Token:"https://res.cloudinary.com/x/upload/v1/pion.png" },
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
    PERSOS_PARTIE: [{ idPersonnage:"PERSO_2", statut:"Vivant" }],
    PERSOS_JOUEURS_PARTIE: [], TOKENS_VTT_DATA: {}, SOURCE_COMBATTANTS: {}, CACHE_COMPETENCES_GLOBAL: {},
    supprimerImageCloudinary: async (url) => { imagesDetruites.push(url); }
  };
  global.window = w;
  global.localStorage = { getItem: (k) => (k === "ivalis_CLOUDINARY_API_SECRET" && avecClesCloudinary) ? "secret" : null,
                          removeItem: () => {} };
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
  verifier("ses deux images Cloudinary sont détruites", imagesDetruites.length === 2,
           `(${imagesDetruites.length})`);
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
  const { base, ok } = await supprimer({ partieOuverte: "GAME_1", avecClesCloudinary: false });
  verifier("la fiche est effacée malgré tout", ok === true && !base.Personnages.PERSO_1);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
