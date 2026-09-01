// LE LANCEUR D'UN SORT DE MONSTRE.
// Le moteur identifie le lanceur par le combattant affiché dans le panneau
// gauche. Le tour d'une créature dure quelques secondes ; si un joueur touche
// l'écran pendant ce temps, le panneau basculait sur SON personnage, et la carte
// de la créature partait au nom du joueur : le moteur voyait alors un lanceur et
// une cible du même camp et affichait "Cible invalide" sur le personnage.
// Ce banc rejoue exactement ça, avec les VRAIES fonctions de panneau.
import fs from 'fs';
import { chargerIA, creerPlateau, combattant, activer } from './banc_ia.mjs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
function bloc(marqueur) {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
const fnsPanneau = [
  bloc('function panneauVerrouilleParIA').replace(/^function/, 'function'),
  bloc('window.afficherDansPanneauGauche = function'),
  bloc('window.restaurerPanneauGauche = function')
].join('\n');

const CARTE = { Nom:"Estoc", Fatigue:20, Initiative:80, Composants:{ actions:[
  { baseEffetId:"EFF_ATTAQUE_LEGERE", count:6, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

// Monde complet : une créature, un joueur, et les vraies fonctions de panneau.
function preparer({ tapotePendantLeTour }) {
  const monstre = combattant({ idPersonnage:'M1', estMonstre:true, camp:'Ennemi', Personnalite:'brutal',
                               prenom:'Gnoll', fatigueActuelle:120, deckEquipe:['C1'] });
  const joueur  = combattant({ idPersonnage:'J1', camp:'Allié', prenom:'Pliors' });
  const w = activer(chargerIA({ plateau: creerPlateau(),
    tokens:{ M1:{q:0,r:0}, J1:{q:2,r:0} }, persos:[monstre, joueur], competences:{ M1:{ C1: CARTE } } }));

  // Le panneau est sur le personnage du joueur, comme en début de tour.
  w.COMBAT_PERSOS_JOUEUR = [joueur];
  w.COMBAT_INDEX_PERSO = 0;
  w.COMBAT_PERSOS_JOUEUR_BACKUP = null;
  w.afficherPersoCombatActuel = () => {};
  new Function('window', fnsPanneau)(w);

  const journal = [];
  w.centrerMapSurToken = () => {};
  w.afficherMessageFlottantHex = (q,r,t) => journal.push("message:" + t);
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = (q,r) => {
    const ch = w.calculerCheminVTT(w.CHEMIN_START_NODE, {q,r});
    w.CHEMIN_MOUVEMENT = ch.map(st => ({ q:st.q, r:st.r, cost:2 }));
  };
  w.validerMouvement = async () => {
    const d = w.CHEMIN_MOUVEMENT[w.CHEMIN_MOUVEMENT.length-1];
    if (d) w.TOKENS_VTT_DATA.M1 = { q:d.q, r:d.r };
    w.CHEMIN_MOUVEMENT = [];
    // C'est ici, au milieu du tour, que le joueur touche son écran.
    if (tapotePendantLeTour) {
      w.restaurerPanneauGauche();
      w.afficherDansPanneauGauche('J1');
      journal.push("tapote");
    }
  };
  // Le moteur lit le lanceur ICI, au moment de résoudre.
  w.demarrerCiblage = async () => {
    const affiche = w.COMBAT_PERSOS_JOUEUR[w.COMBAT_INDEX_PERSO];
    journal.push("lanceur:" + (affiche ? affiche.idPersonnage : "aucun"));
    w.ETAT_CIBLAGE = { actif:true, isZone:false };
  };
  w.ajouterCibleCiblage = (id) => journal.push("cible:" + id);
  w.declencherResolution = async () => { journal.push("resolution"); w.ETAT_CIBLAGE = { actif:false }; };
  w.finDeTourCombat = async () => journal.push("finDeTour");
  return { w, journal, joueur };
}

console.log("1. TOUR NORMAL : LA CRÉATURE EST BIEN LE LANCEUR");
{
  const { w, journal } = preparer({ tapotePendantLeTour:false });
  w.IA_MONSTRE_EN_COURS = true;          // comme verifierTourIAMonstres le fait
  await w.jouerTourMonstre('M1','C1');
  w.IA_MONSTRE_EN_COURS = false;
  console.log("   séquence :", journal.join(" → "));
  verifier("le sort part au nom de la créature", journal.includes("lanceur:M1"));
  verifier("il vise bien le joueur", journal.includes("cible:J1"));
}

console.log("\n2. LE JOUEUR TAPOTE PENDANT LE TOUR DE LA CRÉATURE");
{
  const { w, journal } = preparer({ tapotePendantLeTour:true });
  w.IA_MONSTRE_EN_COURS = true;
  await w.jouerTourMonstre('M1','C1');
  w.IA_MONSTRE_EN_COURS = false;
  console.log("   séquence :", journal.join(" → "));
  verifier("le joueur a bien tenté de reprendre le panneau", journal.includes("tapote"));
  verifier("le lanceur reste la créature", journal.includes("lanceur:M1"),
           `(${journal.filter(e => e.startsWith("lanceur:")).join(", ")})`);
  verifier("aucun sort lancé au nom du joueur", !journal.includes("lanceur:J1"));
  verifier("le sort est bien résolu", journal.includes("resolution"));
}

console.log("\n3. HORS TOUR DE CRÉATURE, LE PANNEAU REDEVIENT LIBRE");
{
  const { w, joueur } = preparer({ tapotePendantLeTour:false });
  const monstre = w.PERSOS_PARTIE.find(p => p.estMonstre);
  w.IA_MONSTRE_EN_COURS = false; w.IA_MONSTRE_ACTEUR = null;
  w.afficherDansPanneauGauche('M1');
  verifier("on peut consulter une créature entre deux tours",
    w.COMBAT_PERSOS_JOUEUR[w.COMBAT_INDEX_PERSO].idPersonnage === 'M1');
  w.restaurerPanneauGauche();
  verifier("et revenir sur son personnage",
    w.COMBAT_PERSOS_JOUEUR[w.COMBAT_INDEX_PERSO].idPersonnage === 'J1');

  // Verrou actif : plus rien ne bouge.
  w.IA_MONSTRE_EN_COURS = true; w.IA_MONSTRE_ACTEUR = 'M1';
  w.afficherDansPanneauGauche('M1');
  w.afficherDansPanneauGauche('J1');
  verifier("pendant un tour de créature, le panneau ne lâche pas la créature",
    w.COMBAT_PERSOS_JOUEUR[w.COMBAT_INDEX_PERSO].idPersonnage === 'M1');
  w.restaurerPanneauGauche();
  verifier("et le retour au personnage est refusé lui aussi",
    w.COMBAT_PERSOS_JOUEUR[w.COMBAT_INDEX_PERSO].idPersonnage === 'M1');
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
