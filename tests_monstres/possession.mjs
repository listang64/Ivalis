// LA POSSESSION DU MAUDIT (v364, niveau 9).
// Nico : « Possession — 1 fois par combat, initiative 100, coût en fatigue 80, réserve 80 pendant
// toute la durée du sort, portée 6. Prend le contrôle d'un monstre pendant 3 tours. Les boss et
// les leaders ne peuvent pas être possédés. Pendant la possession, le joueur devient inerte et ne
// peut plus se déplacer ; il contrôle directement le monstre possédé. »
// Ses réponses : les 80 sont la réserve (bloqués, pas dépensés) ; le monstre change de camp et se
// joue comme un héros du joueur ; elle s'arrête si le Maudit ou le monstre tombe ; pas de
// « Relâcher » (3 manches pleines).
//
// Lancer : node tests_monstres/possession.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, creerDes } from '../combat_etat.js';
import { reserveMaintenueDe, finirPossessions, ETAT_POSSEDE, RESERVES_TECHNIQUES } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, prochainPas, ouvrirManche, vieillirLesEtats } from '../cerveau_combat.js';
import { misEnScene, fichesDepuisEtat } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 8: 5200, 9: 6400 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const POS = { D: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 3, r: 0 }, M3: { q: 9, r: 0 }, MB: { q: 1, r: -1 }, A: { q: 0, r: 1 } };
const monde = (niveau = 9) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [fiche("D", { classe: "Maudit", xp: XP[niveau], idJoueur: "J1" }), fiche("M1"), fiche("M2"), fiche("M3"),
                      fiche("MB", { Palier: "Boss" }), fiche("A", { idJoueur: "J2" })] });
    e.ordre = ["D", "M1", "M2", "M3", "MB", "A"]; e.phase = "Resolution";
    e.file = [{ id: "D", carte: "CLASSE_POSSESSION", initiative: 100, pas: 0 }, { id: "M1", carte: "MC", initiative: 50, pas: 0 }, { id: "A", carte: "AC", initiative: 10, pas: 0 }];
    return e;
};
const possession = (cible) => ({ id: "P1", type: "classe", acteur: "D", idCarte: "CLASSE_POSSESSION", cible });

console.log("\n1. LA TECHNIQUE");
{
    const t = w.TECHNIQUES_CLASSE.CLASSE_POSSESSION;
    verifier("niveau 9 ; init 100 ; la carte annonce 80 ; un ennemi à 6 cases, visé sur le plateau",
             JSON.stringify(w.atoutClasse({ classe: "Maudit", race: "Humain", xp: XP[9] }).techniques) === '["CLASSE_VAUDOU","CLASSE_POSSESSION"]'
             && t.Initiative === 100 && t.Fatigue === 80 && t.portee === 6 && t.niveau === 9 && !!w.TECHNIQUES_VISEES.CLASSE_POSSESSION);
    verifier("la réserve : 80, 3 manches, rien de dépensé, sans « Relâcher »", JSON.stringify(RESERVES_TECHNIQUES.CLASSE_POSSESSION)
             === '{"parTour":80,"tours":3,"nom":"Possession (réserve)","sansRelache":true}');
    const e = monde();
    verifier("niveau 9 : acceptée sur M1 ; niveau 8 : non", validerIntention(e, possession("M1")).ok && !validerIntention(monde(8), possession("M1")).ok,
             validerIntention(e, possession("M1")).raison || "");
    verifier("ni un boss, ni un monstre à 9 cases, ni un allié", !validerIntention(e, possession("MB")).ok && !validerIntention(e, possession("M3")).ok
             && !validerIntention(e, possession("A")).ok);
    const leader = monde(); leader.combattants.M1.leader = true;
    verifier("ni un leader", !validerIntention(leader, possession("M1")).ok);
    const pauvre = monde(); pauvre.combattants.D.fatigue = 79;
    verifier("79 d'énergie : refusée (80 à bloquer)", !validerIntention(pauvre, possession("M1")).ok);
}

console.log("\n2. LE MONSTRE CHANGE DE CAMP ; LE MAUDIT EST INERTE");
const e = monde();
const pas = appliquerIntention(e, possession("M1"));
{
    const c = pas.etat.combattants;
    verifier("M1 passe dans son camp, commandé par son poste ; possédé 3 manches", c.M1.camp === "Allié" && c.M1.joueur === "J1" && c.M1.possedePar === "D"
             && (c.M1.etats || []).some(x => x.nom === ETAT_POSSEDE && x.duree === 3), JSON.stringify({ camp: c.M1.camp, joueur: c.M1.joueur }));
    verifier("le Maudit : rien de dépensé (100), 80 bloqués", c.D.possede === "M1" && c.D.fatigue === 100 && reserveMaintenueDe(c.D) === 80);
    verifier("rejoué depuis le journal : pareil", (r => r.M1.camp === "Allié" && r.M1.possedePar === "D" && r.D.possede === "M1")(appliquerEntree(e, pas.entree).combattants));
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 👁️ Possession »", titre && /Possession/.test(titre.texte));
    // Son tour venu, M1 n'est plus joué par l'IA : on attend son poste.
    verifier("le tour de M1 : le cerveau attend (pas d'IA)", pas.etat.file[0].id === "M1" && prochainPas(pas.etat, [], {}) === null);
    const ordre = { id: "F1", type: "finTour", acteur: "M1", poste: "J1" };
    verifier("le poste du Maudit le commande (fin de tour acceptée) ; un autre poste non",
             validerIntention(pas.etat, ordre).ok && !validerIntention(pas.etat, { ...ordre, poste: "J2" }).ok, validerIntention(pas.etat, ordre).raison || "");
    const coup = { id: "C1", type: "carte", acteur: "M1", poste: "J1", idCarte: "MC", coutFatigue: 0,
                   attaques: [{ nom: "Coup", valeurBrute: 10, typeRes: "Physique", rangeMax: 1, cibles: ["M2"] }], alterations: [] };
    const r = appliquerIntention(pas.etat, coup);
    verifier("il frappe son ancien allié M2", r.etat.combattants.M2.pv < 100, String(r.etat.combattants.M2.pv));
    // Le Maudit inerte : ses intentions sont refusées ; à la manche suivante, il n'a pas de tour.
    const tete = clonerEtat(pas.etat); tete.file = [{ id: "D", carte: "C", initiative: 50, pas: 0 }];
    verifier("le Maudit ne peut ni marcher ni lancer", !validerIntention(tete, { id: "x", type: "mouvement", acteur: "D", poste: "J1", chemin: [{ q: -1, r: 0 }] }).ok
             && !validerIntention(tete, { id: "y", type: "carte", acteur: "D", poste: "J1", idCarte: "C", coutFatigue: 0, attaques: [] }).ok);
    const ouvre = ouvrirManche(Object.assign(clonerEtat(pas.etat), { phase: "Preparation", file: [] }),
        [{ idPersonnage: "D", idCarte: "C", initiative: 90 }, { idPersonnage: "M1", idCarte: "MC", initiative: 50 }, { idPersonnage: "A", idCarte: "AC", initiative: 10 }], creerDes(2));
    verifier("à l'ouverture de la manche suivante : pas de tour pour le Maudit", !ouvre.etat.file.some(f => f.id === "D") && ouvre.etat.file.some(f => f.id === "M1"));
    // La fiche porte tout : le camp, le poste, qui possède qui — et elle se relit.
    const fiches = fichesDepuisEtat(pas.etat, [{ idPersonnage: "M1", estMonstre: true, camp: "Ennemi" }, { idPersonnage: "D", camp: "Allié", idJoueur: "J1" }]);
    verifier("la fiche du monstre : possédé, son camp, son poste ; celle du Maudit : ce qu'il possède",
             fiches[0].possedePar === "D" && fiches[0].camp === "Allié" && fiches[0].joueurPossession === "J1" && fiches[1].possede === "M1");
}

console.log("\n3. LA FIN : 3 MANCHES, OU L'UN DES DEUX QUI TOMBE");
{
    const fini = clonerEtat(pas.etat);
    vieillirLesEtats(fini); vieillirLesEtats(fini);
    verifier("après 2 manches : toujours possédé", finirPossessions(fini).length === 0 && fini.combattants.M1.possedePar === "D");
    vieillirLesEtats(fini);
    const etapes = finirPossessions(fini);
    verifier("après la 3e : M1 retrouve son camp, le Maudit sa liberté et ses 80", fini.combattants.M1.camp === "Ennemi" && fini.combattants.M1.joueur === ""
             && !fini.combattants.M1.possedePar && !fini.combattants.D.possede && reserveMaintenueDe(fini.combattants.D) === 0
             && etapes.some(x => x.type === "message" && /Fin de la possession/.test(x.texte)));
    const ko = clonerEtat(pas.etat); ko.combattants.D.aTerre = true; ko.combattants.D.pv = 0;
    finirPossessions(ko);
    verifier("le Maudit tombe : la possession s'arrête", ko.combattants.M1.camp === "Ennemi" && !ko.combattants.M1.possedePar
             && !(ko.combattants.M1.etats || []).some(x => x.nom === ETAT_POSSEDE));
    const mort = clonerEtat(pas.etat); mort.combattants.M1.aTerre = true; mort.combattants.M1.pv = 0;
    finirPossessions(mort);
    verifier("le monstre tombe : le Maudit est libéré, sa réserve revient", !mort.combattants.D.possede && reserveMaintenueDe(mort.combattants.D) === 0
             && mort.combattants.M1.camp === "Ennemi");
    // Par un vrai pas : M2 abat M1 possédé.
    const x = clonerEtat(pas.etat); x.combattants.M1.pv = 5;
    x.file = [{ id: "M2", carte: "MC", initiative: 50, pas: 0 }, { id: "A", carte: "AC", initiative: 10, pas: 0 }];
    const abat = appliquerIntention(x, { id: "K", type: "carte", acteur: "M2", idCarte: "MC", coutFatigue: 0,
        attaques: [{ nom: "Coup", valeurBrute: 30, typeRes: "Physique", rangeMax: 1, cibles: ["M1"] }], alterations: [] });
    verifier("un vrai pas : M1 possédé abattu — le Maudit libéré dans le même pas", abat.etat.combattants.M1.aTerre && !abat.etat.combattants.D.possede
             && reserveMaintenueDe(abat.etat.combattants.D) === 0);
    verifier("rejoué depuis le journal", !appliquerEntree(x, abat.entree).combattants.D.possede);
}

// La vraie page : sa liste de héros, qui on attend, le deck du monstre.
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" }); export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const increment = (n) => n;
  export const serverTimestamp = () => Date.now(); export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n4. LA PAGE : LE JOUEUR JOUE LE MONSTRE");
{
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [
      { idPersonnage: "D", prenom: "Morg", classe: "Maudit", xp: 6400, idJoueur: "J1", camp: "Allié", possede: "M1", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [] },
      { idPersonnage: "A", prenom: "Bran", idJoueur: "J1", camp: "Allié", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [] },
      { idPersonnage: "M1", prenom: "Gnoll", estMonstre: true, camp: "Allié", possedePar: "D", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [] },
      { idPersonnage: "M2", prenom: "Orc", estMonstre: true, camp: "Ennemi", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [] }];
    const liste = window.herosDuJoueur("J1").map(x => x.idPersonnage);
    const autre = window.herosDuJoueur("J2").map(x => x.idPersonnage);
    const attendus = window.combattantsAttendus({ Ordre_Initiative: ["D", "A", "M1", "M2"] });
    // Le deck du monstre possédé : ses compétences.
    document.getElementById("fenetre-combat").style.display = "block";
    window.CACHE_COMPETENCES_GLOBAL = { M1: { MC: { Nom: "Coup de griffe", Initiative: 50, Fatigue: 10, Effets_Compiles: [] } } };
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[2]]; window.COMBAT_INDEX_PERSO = 0;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.chargerCompetencesCombat("M1", "#335");
    const bannieres = [...document.querySelectorAll("#combat-liste-competences .banniere-carte-combat")].map(x => x.dataset.cardId);
    const commande = [window.commandeParMoi(window.PERSOS_PARTIE[2], "J1"), window.commandeParMoi(window.PERSOS_PARTIE[2], "J2"),
                      window.commandeParMoi(window.PERSOS_PARTIE[3], "J1")];
    return { liste, autre, attendus, bannieres, commande };
  });
  verifier("sa liste : Bran et le monstre possédé — plus le Maudit, inerte", JSON.stringify(r.liste) === '["A","M1"]', JSON.stringify(r.liste));
  verifier("un autre joueur ne le voit pas", JSON.stringify(r.autre) === "[]");
  verifier("la préparation n'attend pas la carte du Maudit (le monstre, si)", !r.attendus.includes("D") && r.attendus.includes("M1"), JSON.stringify(r.attendus));
  verifier("le volet du monstre : ses propres compétences", r.bannieres.includes("MC"), JSON.stringify(r.bannieres));
  verifier("son tour, son chemin : le monstre possédé est commandé par J1 (pas J2) ; un autre monstre par personne",
           JSON.stringify(r.commande) === "[true,false,false]", JSON.stringify(r.commande));
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await br.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
