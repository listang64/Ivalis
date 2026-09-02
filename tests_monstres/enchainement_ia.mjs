// L'ENCHAÎNEMENT DES TOURS.
// Lancer une carte ne suffit pas à la faire finir : le moteur rejoue la
// résolution de son côté, cible par cible, et c'est là que tombent les dégâts et
// les déplacements forcés (une fuite de Peur dure plusieurs secondes). L'IA
// n'attendait que sa propre pause et rendait la main trop tôt : la créature
// suivante se déplaçait sur des positions périmées et récoltait une attaque
// d'opportunité d'un joueur qui, à l'écran, avait déjà fui.
import { chargerIA, creerPlateau, combattant, activer } from './banc_ia.mjs';

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

const CARTE_PEUR = { Nom:"Hurlement", Fatigue:20, Initiative:70, Composants:{ actions:[
  { baseEffetId:"EFF_ATTAQUE_LOURDE", count:4, mods:{ EFF_PEUR:6 }, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };

function monde() {
  const w = activer(chargerIA({ plateau: creerPlateau(),
    tokens:{ M1:{q:0,r:0}, J1:{q:1,r:0} },
    persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi', Personnalite:'brutal',
                         prenom:'Gnoll', fatigueActuelle:120, deckEquipe:['C1'] }),
             combattant({idPersonnage:'J1', camp:'Allié', prenom:'Pliors'}) ],
    competences:{ M1:{ C1: CARTE_PEUR } } }));

  const journal = [];
  w.afficherDansPanneauGauche = () => {}; w.centrerMapSurToken = () => {};
  w.afficherMessageFlottantHex = () => {};
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = () => {};
  w.validerMouvement = async () => {};
  w.ajouterCibleCiblage = () => {};
  w.demarrerCiblage = async () => { w.ETAT_CIBLAGE = { actif:true, isZone:false }; };

  // Le moteur : la carte est diffusée tout de suite, mais elle met 2,6 s à
  // s'appliquer — l'ordre de grandeur d'une vraie fuite de Peur, avec son
  // animation case par case et ses attaques d'opportunité. C'est à la fin que le
  // joueur terrorisé change de case.
  w.RESOLUTIONS_LOCALES = [];
  w.declencherResolution = async () => {
    const marqueur = Date.now() + Math.random();
    w.RESOLUTIONS_LOCALES.push(marqueur);
    journal.push("carteLancee");
    (async () => {
      w.ANIMATION_MOTEUR_EN_COURS = true;
      await new Promise(r => setTimeout(r, 2600));
      w.TOKENS_VTT_DATA.J1 = { q: 5, r: 0 };        // il fuit à l'autre bout
      journal.push("joueurAFui");
      w.ANIMATION_MOTEUR_EN_COURS = false;
      w.DERNIERE_RESOLUTION_TERMINEE = marqueur;
    })();
  };
  w.finDeTourCombat = async () => {
    journal.push("finDeTour@J1=" + w.TOKENS_VTT_DATA.J1.q);
  };
  return { w, journal };
}

console.log("1. LA CRÉATURE NE REND PAS LA MAIN AVANT LA FIN DE SA CARTE");
{
  const { w, journal } = monde();
  await w.jouerTourMonstre('M1','C1');
  console.log("   séquence :", journal.join(" → "));
  verifier("la carte a bien été lancée", journal.includes("carteLancee"));
  verifier("la fuite du joueur est résolue AVANT la fin de tour",
    journal.indexOf("joueurAFui") < journal.indexOf("finDeTour@J1=5"),
    `(${journal.join(" → ")})`);
  verifier("la case du joueur est à jour au moment de rendre la main",
    journal.some(e => e === "finDeTour@J1=5"));
}

console.log("\n2. L'IA NE DÉMARRE RIEN PENDANT QU'UNE CARTE S'APPLIQUE");
{
  const { w, journal } = monde();
  w.ID_PARTIE_COURANTE = "P1";
  w.PARTIE_DATA = { Phase_Combat:"Resolution", Ordre_Initiative:["M1","J1"],
    File_Attente_Combat:[{ idPersonnage:"M1", idCarte:"C1", initiative:70, timestamp:1 }] };
  const joues = [];
  w.jouerTourMonstre = async (id) => { joues.push(id); };
  w.ANIMATION_MOTEUR_EN_COURS = true;          // une carte est encore en cours
  await w.verifierTourIAMonstres();
  verifier("aucun tour lancé pendant la résolution", joues.length === 0, `(${joues.length})`);
  verifier("mais un rappel est programmé", !!w.RAPPEL_IA_MONSTRES);
  if (w.RAPPEL_IA_MONSTRES) clearTimeout(w.RAPPEL_IA_MONSTRES);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
