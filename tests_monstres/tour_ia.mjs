import { chargerIA, creerPlateau, combattant } from './banc_ia.mjs';

const CARTE_CAC = { Nom:"Charge", Fatigue:20, Initiative:80, Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LOURDE", count:3, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };
const CARTE_TIR = { Nom:"Trait",  Fatigue:20, Initiative:80, Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LEGERE", count:2, mods:{ EFF_DISTANCE:4 }, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(50)} ${c?"OK":"ÉCHEC"} ${d}`); };

// Prépare un monde avec le moteur de combat simulé, et journalise la séquence.
function preparer({ distanceCible, carte, fatigue = 120 }) {
  const monde = {
    plateau: creerPlateau(),
    tokens: { M1:{q:0,r:0}, J1:{q:distanceCible,r:0} },
    persos: [ combattant({ idPersonnage:'M1', estMonstre:true, camp:'Ennemi', Personnalite:'brutal', prenom:'Ours', fatigueActuelle:fatigue, deckEquipe:['C1'] }),
              combattant({ idPersonnage:'J1', camp:'Allié', prenom:'Jade' }) ],
    competences: { M1: { C1: carte } }
  };
  const w = chargerIA(monde);
  const journal = [];

  w.afficherDansPanneauGauche = (id) => journal.push("panneau:" + id);
  w.centrerMapSurToken = () => {};
  w.afficherMessageFlottantHex = (q,r,txt) => journal.push("message:" + txt);
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = (q, r) => {
    const chemin = w.calculerCheminVTT(w.CHEMIN_START_NODE, { q, r });
    w.CHEMIN_MOUVEMENT = chemin.map(s => ({ q:s.q, r:s.r, cost:2 }));
    journal.push("trace:" + chemin.length);
  };
  w.validerMouvement = async () => {
    const dernier = w.CHEMIN_MOUVEMENT[w.CHEMIN_MOUVEMENT.length - 1];
    journal.push("deplacement:" + w.CHEMIN_MOUVEMENT.length);
    if (dernier) { w.TOKENS_VTT_DATA.M1 = { q: dernier.q, r: dernier.r }; }
    w.CHEMIN_MOUVEMENT = [];
  };
  w.demarrerCiblage = async (id) => { journal.push("ciblage:" + id); w.ETAT_CIBLAGE = { actif:true, isZone:false }; };
  w.ajouterCibleCiblage = (id) => journal.push("cible:" + id);
  w.declencherResolution = async () => { journal.push("resolution"); w.ETAT_CIBLAGE = { actif:false }; };
  w.finDeTourCombat = async () => journal.push("finDeTour");
  return { w, journal };
}

console.log("A. TOUR COMPLET, CIBLE HORS DE PORTÉE AU DÉPART");
{
  const { w, journal } = preparer({ distanceCible: 3, carte: CARTE_CAC });
  await w.jouerTourMonstre('M1', 'C1');
  console.log("   séquence :", journal.join(" → "));
  verifier("le monstre est affiché dans le panneau", journal[0] === "panneau:M1");
  verifier("il se déplace", journal.some(e => e.startsWith("deplacement:")));
  verifier("il lance sa carte", journal.includes("ciblage:C1") && journal.includes("resolution"));
  verifier("il vise bien le joueur", journal.includes("cible:J1"));
  verifier("il rend la main à la fin", journal[journal.length-1] === "finDeTour");
}

console.log("\nB. CIBLE DÉJÀ À PORTÉE : PAS DE DÉPLACEMENT INUTILE");
{
  const { w, journal } = preparer({ distanceCible: 1, carte: CARTE_CAC });
  await w.jouerTourMonstre('M1', 'C1');
  console.log("   séquence :", journal.join(" → "));
  verifier("aucun déplacement superflu", !journal.some(e => e.startsWith("deplacement:")));
  verifier("la carte est quand même lancée", journal.includes("resolution"));
}

console.log("\nC. CIBLE INATTEIGNABLE : LE TOUR SE TERMINE SANS SORT");
{
  const { w, journal } = preparer({ distanceCible: 10, carte: CARTE_CAC });
  await w.jouerTourMonstre('M1', 'C1');
  console.log("   séquence :", journal.join(" → "));
  verifier("il avance quand même", journal.some(e => e.startsWith("deplacement:")));
  verifier("aucun sort n'est lancé", !journal.includes("resolution"));
  verifier("le joueur est prévenu", journal.some(e => e === "message:Hors de portée"));
  verifier("le tour se termine proprement", journal[journal.length-1] === "finDeTour");
}

console.log("\nD. CARTE OU PION INTROUVABLE : LE COMBAT NE SE FIGE PAS");
{
  const { w, journal } = preparer({ distanceCible: 2, carte: CARTE_CAC });
  await w.jouerTourMonstre('M1', 'CARTE_INEXISTANTE');
  verifier("la main est rendue malgré tout", journal.includes("finDeTour"), `(${journal.join(" → ")})`);
}

console.log("\nE. CHOIX DE CARTE EN PRÉPARATION");
{
  const { w } = preparer({ distanceCible: 2, carte: CARTE_CAC });
  w.CACHE_COMPETENCES_GLOBAL.M1 = { C1: CARTE_CAC, C2: { ...CARTE_TIR, Fatigue: 200, Nom:"Trop chère" } };
  w.PERSOS_PARTIE[0].deckEquipe = ['C1','C2'];
  let choisieTropChere = 0;
  for (let i = 0; i < 200; i++) {
    const c = w.choisirCarteMonstre(w.PERSOS_PARTIE[0]);
    if (c && c.id === 'C2') choisieTropChere++;
  }
  verifier("jamais de carte au-dessus de sa fatigue", choisieTropChere === 0, `(${choisieTropChere}/200)`);

  w.PERSOS_PARTIE[0].fatigueActuelle = 5;
  verifier("épuisé : aucune carte choisie", w.choisirCarteMonstre(w.PERSOS_PARTIE[0]) === null);
}

console.log("\nF. IMMOBILISÉ : IL NE BOUGE PAS MAIS PEUT AGIR");
{
  const { w, journal } = preparer({ distanceCible: 1, carte: CARTE_CAC });
  w.PERSOS_PARTIE[0].Etats_Alteres = [{ nom: "Immobilisation" }];
  await w.jouerTourMonstre('M1', 'C1');
  verifier("aucun déplacement", !journal.some(e => e.startsWith("deplacement:")));
  verifier("il lance sa carte depuis sa case", journal.includes("resolution"));
}

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
