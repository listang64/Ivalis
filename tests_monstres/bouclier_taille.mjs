// LE BOUCLIER MAGIQUE DOIT SE SOUVENIR DE SA TAILLE
//
// Signalé en partie : « j'ai l'impression qu'il ne sauvegarde pas la vie qui lui
// reste : quand il prend des dégâts, au tour d'après il retape dedans et il a
// toute sa vie — du moins c'est l'impression que donne la barre sous mon pion. »
//
// L'impression était juste, la cause pas celle qu'on croit : l'ÉTAT retenait
// parfaitement les points restants. C'est la BARRE qui mentait. Elle prend pour
// référence `bouclierMax` (pont_combat.js) et, faute de mieux, retombe sur le
// bouclier COURANT — donc toujours 100 %, quel qu'il en reste. Un bouclier de 30
// tombé à 5 s'affichait plein, puis retombait à zéro d'un coup.
//
// `bouclierMax` n'était renseigné nulle part dans le régime cerveau. Il l'est
// maintenant à la pose, il s'efface à la casse, et le REJEU le retrouve tout
// seul — il ne voyage pas dans le journal, il se déduit, exactement comme le
// noyau le calcule. Sans ça, la barre serait juste sur le poste qui calcule et
// fausse sur les deux autres.
//
// Ce champ n'est PAS un plafond. Le Math.min qu'il portait ne s'appliquait
// jamais (il valait toujours zéro) ; le garder aurait bridé tout bouclier reposé
// à la taille du premier.
import { resoudreCarte } from '../moteur_pur.js';
import { construireEtatCombat, appliquerEntree } from '../combat_etat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 100, PV_Actuels: 100,
  Fatigue_Max: 100, Fatigue_Actuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [],
  statut: "Vivant", camp: "Allié", ...extra });

const monde = () => construireEtatCombat({
  idPartie: "T", cerveau: "P", graine: 5,
  combattants: [fiche("H1", { idJoueur: "P" }), fiche("M1", { estMonstre: true, camp: "Ennemi" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }] }
});

const poser = (etat, taille) => resoudreCarte(etat, { type: "carte", idLanceur: "H1", idCarte: "C",
  attaques: [{ valeurBrute: taille, isShield: true, cibles: ["H1"] }], alterations: [],
  jets: { parCible: {} } }, null);

const frapper = (etat, degats) => resoudreCarte(etat, { type: "carte", idLanceur: "M1", idCarte: "C2",
  attaques: [{ valeurBrute: degats, cibles: ["H1"] }], alterations: [],
  jets: { parCible: { H1: {} } } }, null);

console.log("\n=========================================================");
console.log("  1. LE BOUCLIER RETIENT SA TAILLE, ET LA PERD EN CASSANT");
console.log("=========================================================");
let etat = monde();
{
  const r = poser(etat, 30);
  etat = r.etat;
  verifier("posé à 30, il vaut 30", etat.combattants.H1.bouclier === 30, String(etat.combattants.H1.bouclier));
  verifier("et sa taille de référence est 30", etat.combattants.H1.bouclierMax === 30,
           String(etat.combattants.H1.bouclierMax));

  etat = frapper(etat, 10).etat;
  verifier("frappé pour 10, il lui reste 20", etat.combattants.H1.bouclier === 20,
           String(etat.combattants.H1.bouclier));
  verifier("SA TAILLE NE BOUGE PAS : elle reste 30", etat.combattants.H1.bouclierMax === 30,
           String(etat.combattants.H1.bouclierMax));

  etat = frapper(etat, 50).etat;
  verifier("brisé, il tombe à zéro", etat.combattants.H1.bouclier === 0);
  verifier("et sa taille s'efface avec lui", etat.combattants.H1.bouclierMax === 0,
           String(etat.combattants.H1.bouclierMax));

  const neuf = poser(etat, 15).etat;
  verifier("un nouveau bouclier de 15 n'est PAS bridé à l'ancienne taille",
           neuf.combattants.H1.bouclier === 15, String(neuf.combattants.H1.bouclier));
  verifier("et il repart sur sa propre taille", neuf.combattants.H1.bouclierMax === 15,
           String(neuf.combattants.H1.bouclierMax));
}

console.log("\n=========================================================");
console.log("  2. LE REJEU RETROUVE LA MÊME TAILLE, SANS LA TRANSPORTER");
console.log("=========================================================");
// Les deux autres postes ne calculent rien : ils rejouent le journal. La taille
// ne voyage pas dedans — elle se déduit. Si les deux ne tombaient pas d'accord,
// la barre serait juste chez l'un et fausse chez les autres.
{
  let rejoue = monde();
  rejoue = appliquerEntree(rejoue, { v: 1, etapes: [
    { type: "degats", cible: "H1", bouclierApres: 30, gainBouclier: 30 }] });
  verifier("après la pose rejouée, la taille est 30", rejoue.combattants.H1.bouclierMax === 30,
           String(rejoue.combattants.H1.bouclierMax));
  rejoue = appliquerEntree(rejoue, { v: 2, etapes: [
    { type: "degats", cible: "H1", bouclierApres: 20, surBouclier: 10 }] });
  verifier("après le coup rejoué, il reste 20 sur 30",
           rejoue.combattants.H1.bouclier === 20 && rejoue.combattants.H1.bouclierMax === 30,
           `(${rejoue.combattants.H1.bouclier}/${rejoue.combattants.H1.bouclierMax})`);
  rejoue = appliquerEntree(rejoue, { v: 3, etapes: [
    { type: "degats", cible: "H1", bouclierApres: 0, surBouclier: 20, bouclierBrise: true }] });
  verifier("brisé en rejeu, la taille s'efface aussi", rejoue.combattants.H1.bouclierMax === 0,
           String(rejoue.combattants.H1.bouclierMax));
}

console.log("\n=========================================================");
console.log("  3. CE QUE LA BARRE SOUS LE PION AFFICHE VRAIMENT");
console.log("=========================================================");
// C'est ici que le défaut se voyait : misEnScene donne à l'animation son `max`.
{
  let e = monde();
  e = poser(e, 30).etat;                       // bouclier 30 / 30
  const apres = frapper(e, 10);

  const etapeCoup = apres.etapes.find(x => x.type === "degats" && x.surBouclier > 0);
  verifier("le coup est bien porté sur le bouclier", !!etapeCoup, JSON.stringify(apres.etapes).slice(0, 140));

  const scene = misEnScene(etapeCoup, e);
  verifier("la barre animée est celle du bouclier", scene.champ === "bouclier", String(scene.champ));
  verifier("elle part de 30", scene.de === 30, String(scene.de));
  verifier("elle descend à 20", scene.vers === 20, String(scene.vers));
  verifier("ET SON MAXIMUM EST 30, pas la valeur du moment",
           scene.max === 30, String(scene.max));

  // Le second coup, sur un bouclier déjà entamé : c'est le cas que le joueur
  // décrivait — « au tour d'après il a toute sa vie ».
  const e2 = apres.etat;
  const apres2 = frapper(e2, 5);
  const coup2 = apres2.etapes.find(x => x.type === "degats" && x.surBouclier > 0);
  const scene2 = misEnScene(coup2, e2);
  verifier("au coup suivant, la barre part de 20 et non de plein",
           scene2.de === 20, String(scene2.de));
  verifier("ET GARDE LE MÊME MAXIMUM : 30", scene2.max === 30, String(scene2.max));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
