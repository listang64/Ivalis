// LES CRÉATURES NE PRENNENT PLUS D'ATTAQUE D'OPPORTUNITÉ POUR RIEN.
//
// Nico : « les monstres sont parfois bêtes et déclenchent des attaques
// d'opportunité bêtement alors qu'il n'y a pas lieu. » Trois trous dans
// choisirPosition (ia_pure.js) :
//   1. l'IA comparait le NOMBRE d'ennemis au contact au départ et à l'arrivée :
//      lâcher un héros pour en coller un autre (un pour un) ne coûtait rien ;
//   2. elle ne regardait pas le CHEMIN : longer un héros puis le quitter
//      déclenche une attaque — invisible pour elle ;
//   3. une brute (eviteAO 0) ne les redoutait pas du tout, même pour un
//      point de hasard.
// Désormais : les attaques sont comptées pas à pas comme le moteur les
// déclenche (opportunitesSurLeChemin), chaque case garde le chemin qui en
// déclenche le moins (casesAccessibles), et chacune coûte au moins
// EVITE_AO_MINIMUM à tout caractère.
import { construireEtatCombat, creerDes, combattant } from '../combat_etat.js';
import { resoudreMouvement, distance } from '../mouvement_pur.js';
import { choisirPosition, opportunitesSurLeChemin, casesAccessibles } from '../ia_pure.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 500, PV_Actuels: 500, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = (positions, personnalite = "brutal") => construireEtatCombat({
  idPartie: "G", cerveau: "P", graine: 7,
  combattants: [fiche("M1", { estMonstre: true, camp: "Ennemi", Personnalite: personnalite }),
                ...Object.keys(positions).filter(k => k !== "M1").map(k => fiche(k, { idJoueur: "P", camp: "Allié" }))],
  positions,
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1"], File_Attente_Combat: [] }
});
const aleatoire = (graine) => { let x = graine * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); };

console.log("\n1. LE COMPTE DE L'IA EST CELUI DU MOTEUR, PAS À PAS");
{
  let accords = 0, essais = 0;
  for (let g = 1; g <= 120; g++) {
    const r = aleatoire(g);
    const pos = { M1: { q: 0, r: 0 } };
    ["H1", "H2", "H3"].forEach(h => { pos[h] = { q: Math.floor(r() * 5) - 2, r: Math.floor(r() * 5) - 2 }; });
    if (Object.values(pos).some((p, i, t) => t.findIndex(o => o.q === p.q && o.r === p.r) !== i)) continue;
    const etat = monde(pos);
    casesAccessibles(etat, "M1", null).forEach(c => {
      if (c.chemin.length === 0) return;
      essais++;
      const moteur = resoudreMouvement(etat, { idLanceur: "M1", chemin: c.chemin }, creerDes(1), null)
        .etapes.filter(e => e.type === "opportunite").length;
      if (moteur === opportunitesSurLeChemin(etat, "M1", c.chemin) && moteur === c.ao) accords++;
    });
  }
  verifier("chaque chemin : autant d'attaques pour l'IA que pour le moteur", accords === essais && essais > 500,
           `${accords}/${essais}`);
}

console.log("\n2. LÂCHER UN HÉROS POUR EN COLLER UN AUTRE N'EST PLUS GRATUIT");
{
  // M1 colle H2 ; sa cible H1 est à deux cases. (1,0) touche H1 ET H2 : aucune
  // attaque. (1,1) touche H1 seul : H2 frappe en partant.
  const etat = monde({ M1: { q: 0, r: 0 }, H2: { q: 1, r: -1 }, H1: { q: 2, r: 0 } });
  let avecAO = 0;
  for (let g = 1; g <= 60; g++) {
    const c = choisirPosition(etat, "M1", combattant(etat, "H1"), { portee: 1, fatigue: 0 }, null, creerDes(g));
    if (opportunitesSurLeChemin(etat, "M1", c.chemin) > 0) avecAO++;
  }
  verifier("une brute ne quitte plus H2 pour rien (60 tirages)", avecAO === 0, `${avecAO}/60 avec attaque`);
}

console.log("\n3. SUR 400 SITUATIONS AU HASARD : AUCUNE ATTAQUE « POUR RIEN »");
{
  // « Pour rien » : la créature en subit une alors qu'une autre case, atteinte
  // sans attaque, la mettait tout autant à portée de sa cible.
  let pourRien = 0, situations = 0, prises = 0;
  for (let g = 1; g <= 400; g++) {
    const r = aleatoire(g + 1000);
    const pos = { M1: { q: 0, r: 0 } };
    ["H1", "H2", "H3"].forEach(h => { pos[h] = { q: Math.floor(r() * 7) - 3, r: Math.floor(r() * 7) - 3 }; });
    if (Object.values(pos).some((p, i, t) => t.findIndex(o => o.q === p.q && o.r === p.r) !== i)) continue;
    for (const perso of ["brutal", "sanguinaire", "prudent"]) {
      const etat = monde(pos, perso);
      const cible = combattant(etat, "H1");
      const c = choisirPosition(etat, "M1", cible, { portee: 1, fatigue: 0 }, null, creerDes(g));
      if (!c) continue;
      situations++;
      const ao = opportunitesSurLeChemin(etat, "M1", c.chemin);
      if (ao > 0) prises++;
      const aPortee = distance(c, cible) <= 1;
      const mieux = casesAccessibles(etat, "M1", null).some(o => o.ao < ao && (!aPortee || distance(o, cible) <= 1));
      if (ao > 0 && mieux) pourRien++;
    }
  }
  verifier("aucune attaque d'opportunité subie sans raison", pourRien === 0, `${pourRien} sur ${situations} (${prises} justifiées)`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
