// UNE ANIMATION QUI CASSE NE DOIT PLUS ARRÊTER LA PARTIE.
//
// LE BUG, VU EN VRAI PENDANT UN COMBAT DE TEST.
//
// Une Poussée sortie du cerveau a produit : « Cannot read properties of
// undefined (reading 'q') » dans jouerAnimationPoussee, et plus une seule
// étape ne s'est rejouée pour le joueur qui regardait ce tour — figé jusqu'au
// rechargement de la page. Deux causes, empilées :
//
//   UN. La traduction de vocabulaire manquait. Le pont dit `de`/`vers`
//       (comme pour un pas ordinaire) ; jouerAnimationPoussee, écrite pour
//       l'ancien monde, lit `depart`/`arrivee`. Le Bond avait déjà eu droit à
//       sa traduction (un aller-retour en pleine partie plus tôt) ; la
//       Poussée, juste à côté, ne l'avait jamais eue — parce que l'un et
//       l'autre l'écrivaient à la main, séparément, au lieu de partager une
//       seule fonction. versAnimationDeSaut (pont_combat.js) referme ce trou
//       pour de bon : il n'existe plus qu'un seul endroit à corriger.
//
//   DEUX. Rien ne rattrapait l'exception. `animer()` (pont_combat.js)
//       appelait chaque geste sans filet : une erreur DANS l'animation
//       remontait telle quelle jusqu'au lecteur du journal, qui ne savait pas
//       la digérer — la promesse restait rejetée, et plus rien ne se jouait
//       après elle sur cet écran. Un bug dans UNE animation ne doit jamais
//       pouvoir geler TOUT le reste du combat pour qui la regarde.
import { creerPont, versAnimationDeSaut } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  LE PONT NE DOIT PLUS SE CASSER SUR UNE ANIMATION EN PANNE");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LA TRADUCTION ELLE-MÊME : de/vers → depart/arrivee");
// =========================================================================
{
    const d = { idToken: "H1", de: { q: 1, r: 0 }, vers: { q: 3, r: 0 } };
    const traduit = versAnimationDeSaut(d);
    verifier("l'identité du pion passe telle quelle", traduit.idToken === "H1");
    verifier("`de` devient `depart`",
             traduit.depart.q === 1 && traduit.depart.r === 0, JSON.stringify(traduit.depart));
    verifier("`vers` devient `arrivee`",
             traduit.arrivee.q === 3 && traduit.arrivee.r === 0, JSON.stringify(traduit.arrivee));
}

// =========================================================================
console.log("\n2. LE CORRECTIF : animer() NE LAISSE PLUS RIEN REMONTER");
// =========================================================================
{
    const appels = [];
    const traces = [];
    const casseeCommeEnVrai = (data) => { appels.push("poussee"); data.arrivee.q; };

    const pont = creerPont({
        poussee: (d) => casseeCommeEnVrai(d),
        pas: async (d) => appels.push(`pas ${d.vers.q}`),
        pause: async () => {},
        tracer: (icone, titre, detail) => traces.push({ icone, titre, detail })
    });

    const etape = { type: "poussee", cible: "H1", acteur: "M1",
                    de: { q: 1, r: 0 }, vers: { q: 3, r: 0 } };

    let leve = false;
    let rendu = null;
    try { rendu = await pont.animer(etape, { combattants: {} }); }
    catch (e) { leve = true; }

    verifier("animer() ne laisse plus rien remonter", !leve);
    verifier("elle rend quand même la scène", !!rendu && rendu.geste === "poussee");
    verifier("et la panne est tracée, pas avalée en silence",
             traces.some(t => /animation.*échec/i.test(t.titre)), JSON.stringify(traces));

    // LA SUITE DU JOURNAL DOIT CONTINUER À SE JOUER — c'est tout le sens du
    // correctif : une étape suivante s'anime normalement après la panne.
    const suite = { type: "pas", acteur: "H1", de: { q: 3, r: 0 }, vers: { q: 4, r: 0 } };
    await pont.animer(suite, { combattants: {} });
    verifier("l'étape suivante s'est bien jouée, la panne ne l'a pas bloquée",
             appels.includes("pas 4"), JSON.stringify(appels));
}

// =========================================================================
console.log("\n3. LE VRAI CÂBLAGE DU JEU (regime_cerveau.js), CORRECTEMENT TRADUIT");
// =========================================================================
//  Ce que fait vraiment le jeu : appliquer versAnimationDeSaut avant de
//  transmettre à jouerAnimationPoussee/jouerAnimationBond. Un cas normal ne
//  doit ni planter, ni être tracé comme une panne.
{
    const appels = [];
    const traces = [];
    // Le câblage réel de regime_cerveau.js : poussee: (d) => jouerAnimationPoussee(versAnimationDeSaut(d))
    const pont = creerPont({
        poussee: (d) => {
            const traduit = versAnimationDeSaut(d);
            appels.push(`poussee vers ${traduit.arrivee.q},${traduit.arrivee.r}`);
        },
        pause: async () => {},
        tracer: (icone, titre) => traces.push(titre)
    });
    await pont.animer({ type: "poussee", cible: "H1", acteur: "M1",
                        de: { q: 1, r: 0 }, vers: { q: 3, r: 0 } }, { combattants: {} });
    verifier("l'animation reçoit bien `arrivee`, traduite depuis `vers`",
             appels.includes("poussee vers 3,0"), JSON.stringify(appels));
    verifier("aucune panne tracée pour un cas normal", traces.length === 0, JSON.stringify(traces));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
