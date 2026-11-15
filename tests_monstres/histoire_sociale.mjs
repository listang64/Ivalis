// L'HISTOIRE DE TEST DES FILS INVISIBLES (v415) — LOT 6 : LE CALIBRAGE.
//
// Le petit monde du plan : six PNJ (Lysandra la capitaine, Maël l'archiviste,
// Elwen la guérisseuse, Garrik le mercenaire, Valen le conseiller, Tessa
// l'éclaireuse) et deux héros (Kaya, Brann), joués sur onze scènes écrites
// d'avance : une promesse tenue, une humiliation, une trahison, un secret
// confié, une vie sauvée, des excuses, une rivalité entre PNJ. Le vrai moteur
// (social_pur.js) calcule ; ce banc juge les histoires qu'il raconte :
//   · des relations nuancées (« le respecte mais ne lui fait pas confiance ») ;
//   · une réconciliation lente après une trahison ;
//   · un conflit entre PNJ qui naît sans qu'un héros le provoque ;
//   · les grandeurs : un petit geste reste petit, un acte fondateur marque ;
//   · une absente (Tessa, partie en mission) ne bouge jamais ;
//   · deux cents scènes au hasard : rien ne sort des bornes, rien n'est NaN.
//
// Lancer : node tests_monstres/histoire_sociale.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const RACINE = process.env.IVALIS_RACINE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(RACINE, 'social_pur.js')).href);
const { appliquerEvenements, affinite, resumeLien, initiatives, liensPreexistants, premiereImpression, cleLien, AXES, BORNES, TYPES_ACTIONS, ACTIONS } = S;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(82)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);

const psy = (traits, valeurs, objectifs) => ({ traits: { prudence: 50, impulsivite: 50, loyaute: 50, empathie: 50, orgueil: 50, sociabilite: 50, ...traits }, valeurs, objectifs: objectifs || [] });
let etat = { ames: {
    lys:    { id: "lys", type: "pnj", nom: "Lysandra", psyche: psy({ loyaute: 92, prudence: 74, orgueil: 67, empathie: 58, impulsivite: 31 }, ["honneur", "famille"], ["Protéger la guilde"]) },
    mael:   { id: "mael", type: "pnj", nom: "Maël", psyche: psy({ prudence: 60, sociabilite: 35, empathie: 70 }, ["savoir"], ["Retrouver l'archive perdue"]) },
    elwen:  { id: "elwen", type: "pnj", nom: "Elwen", psyche: psy({ empathie: 90, impulsivite: 20, orgueil: 20 }, ["compassion"], ["Soigner les blessés de la guilde"]) },
    garrik: { id: "garrik", type: "pnj", nom: "Garrik", psyche: psy({ loyaute: 25, orgueil: 80, impulsivite: 75, prudence: 30 }, ["richesse", "pouvoir"], ["Faire tomber Valen"]) },
    valen:  { id: "valen", type: "pnj", nom: "Valen", psyche: psy({ prudence: 85, sociabilite: 70, loyaute: 35 }, ["pouvoir"], ["Garder sa place au conseil"]) },
    tessa:  { id: "tessa", type: "pnj", nom: "Tessa", psyche: psy({ sociabilite: 80, impulsivite: 60 }, ["liberte"]) },
    kaya:   { id: "kaya", type: "heros", nom: "Kaya", psyche: psy({}) },
    brann:  { id: "brann", type: "heros", nom: "Brann", psyche: psy({}) }
}, liens: {} };
// Les liens d'avant : Lysandra est la mentore de Maël ; Garrik et Valen sont rivaux ; Elwen et Tessa amies.
const relier = (type, a, b) => { const r = liensPreexistants(type, a, b); etat.liens[cleLien(a, b)] = { de: a, vers: b, axes: r.ab, origine: "preexistant", etiquette: r.etiquetteAB }; etat.liens[cleLien(b, a)] = { de: b, vers: a, axes: r.ba, origine: "preexistant", etiquette: r.etiquetteBA }; };
relier("mentor", "lys", "mael"); relier("rival", "garrik", "valen"); relier("ami", "elwen", "tessa");
// La première rencontre avec les héros (le groupe est neutre dans la ville : 0).
["lys", "mael", "elwen", "garrik", "valen"].forEach(p => ["kaya", "brann"].forEach(h => {
    etat.liens[cleLien(p, h)] = { de: p, vers: h, axes: premiereImpression(etat.ames[p].psyche, 0), origine: "rencontre" };
}));
const tessaAvant = JSON.stringify(Object.values(etat.liens).filter(l => l.de === "tessa" || l.vers === "tessa"));
const ax = (de, vers) => (etat.liens[cleLien(de, vers)] || { axes: {} }).axes;
let tour = 0;
const historique = [];
const scene = (presents, evenements) => {
    tour++;
    const r = appliquerEvenements(etat, evenements, { presents, tour, historique: historique.slice(-30), sansLienEntreHeros: true });
    etat = r.etat;
    r.evenements.forEach(e => historique.push({ acteur: e.acteur, cible: e.cible, type: e.type }));
    return r;
};
const ecart = (r, de, vers, axe) => r.changements.filter(c => c.de === de && c.vers === vers && c.axe === axe).reduce((s, c) => s + c.apres - c.avant, 0);

titre("1. ONZE SCÈNES (Tessa est partie en mission : elle n'y est jamais)");
const TOUS = ["lys", "mael", "elwen", "garrik", "valen", "kaya", "brann"];
// 1. Kaya promet à Lysandra de retrouver l'archive, et tient parole.
const s1 = scene(TOUS, [{ type: "tenir_promesse", acteur: "kaya", cible: "lys", gravite: 2, resume: "Kaya a rapporté l'archive comme promis." }]);
// 2. Brann humilie Maël devant tout le monde.
const s2 = scene(TOUS, [{ type: "humilier", acteur: "brann", cible: "mael", gravite: 2, resume: "Brann s'est moqué de Maël en plein conseil." }]);
// 3. Garrik méprise Valen en public (une rivalité entre PNJ, sans héros).
const s3 = scene(["garrik", "valen", "lys", "kaya"], [{ type: "humilier", acteur: "garrik", cible: "valen", gravite: 2, resume: "Garrik a traité Valen de lâche." }]);
// 4. Kaya trahit Lysandra : elle vend le secret de la guilde (fondateur).
const s4 = scene(TOUS, [{ type: "trahir", acteur: "kaya", cible: "lys", gravite: 3, resume: "Kaya a vendu le secret de la guilde." }]);
// 5. Elwen soigne Brann ; Brann la remercie d'un présent.
const s5 = scene(["elwen", "brann"], [{ type: "soigner", acteur: "elwen", cible: "brann", gravite: 2 }, { type: "offrir", acteur: "brann", cible: "elwen", gravite: 1 }]);
// 6. Maël confie à Elwen qu'il a menti au conseil (discret).
const s6 = scene(["mael", "elwen", "garrik"], [{ type: "confier_secret", acteur: "mael", cible: "elwen", gravite: 2, discret: true }]);
// 7. Kaya sauve la vie de Lysandra (fondateur).
const s7 = scene(TOUS, [{ type: "sauver", acteur: "kaya", cible: "lys", gravite: 3, resume: "Kaya a tiré Lysandra des flammes." }]);
// 8-10. Kaya s'excuse, trois fois.
const excuses = [8, 9, 10].map(() => scene(["kaya", "lys"], [{ type: "excuser", acteur: "kaya", cible: "lys", gravite: 1 }]));
// 11. Brann complimente Maël, encore et encore (cinq fois dans la scène).
const s11 = scene(["brann", "mael"], Array.from({ length: 5 }, () => ({ type: "complimenter", acteur: "brann", cible: "mael", gravite: 1 })));
verifier("onze scènes jouées, aucun événement rejeté", [s1, s2, s3, s4, s5, s6, s7, ...excuses, s11].every(r => r.rejets.length === 0));

titre("2. DES RELATIONS NUANCÉES (le premier indicateur du plan)");
{
    const lk = ax("lys", "kaya");
    const mots = resumeLien(lk);
    verifier("Lysandra → Kaya, trahie puis sauvée : elle lui doit la vie mais ne lui fait pas confiance", lk.dette > 20 && lk.confiance < 0 && / mais /.test(mots), `${mots} ${JSON.stringify(lk)}`);
    const mb = ax("mael", "brann");
    verifier("Maël → Brann : l'humiliation pèse plus que cinq compliments", affinite(mb) < 0, `affinité ${affinite(mb).toFixed(1)}`);
    // (Elwen a vu Brann humilier Maël à la scène 2 : elle reste réservée, mais les soins et le présent la rapprochent.)
    const eb = s5.changements.filter(c => c.de === "elwen" && c.vers === "brann").reduce((t, c) => t + (c.axe === "attachement" ? 0.35 : c.axe === "confiance" ? 0.4 : c.axe === "respect" ? 0.25 : 0) * (c.apres - c.avant), 0);
    verifier("Elwen → Brann : témoin de l'humiliation de Maël, puis soins et présent la rapprochent", eb > 0 && affinite(ax("elwen", "brann")) < affinite(ax("lys", "kaya")) + 100, eb.toFixed(2));
    const asym = Object.values(etat.liens).filter(l => etat.liens[cleLien(l.vers, l.de)]).filter(l => Math.abs(affinite(l.axes) - affinite(etat.liens[cleLien(l.vers, l.de)].axes)) > 3).length;
    verifier("la plupart des liens réciproques sont asymétriques", asym >= 8, `${asym} liens`);
}

titre("3. UNE RÉCONCILIATION LENTE");
{
    const trahison = ecart(s4, "lys", "kaya", "confiance");
    const pardon = excuses.reduce((s, r) => s + ecart(r, "lys", "kaya", "confiance"), 0);
    verifier("trois excuses ne rachètent pas une trahison (moins d'un tiers de la confiance perdue)", pardon > 0 && pardon < Math.abs(trahison) / 3, `−${Math.abs(trahison).toFixed(1)} puis +${pardon.toFixed(1)}`);
    verifier("…et chacune compte moins que la précédente", ecart(excuses[1], "lys", "kaya", "confiance") < ecart(excuses[0], "lys", "kaya", "confiance") && ecart(excuses[2], "lys", "kaya", "confiance") < ecart(excuses[1], "lys", "kaya", "confiance"));
    verifier("le souvenir de la trahison reste dans le lien (la confiance n'est pas revenue)", ax("lys", "kaya").confiance < -10, ax("lys", "kaya").confiance.toFixed(1));
    const sauveConf = ecart(s7, "lys", "kaya", "confiance");
    verifier("la rancune freine : sauver Lysandra ne lui rend presque pas sa confiance", sauveConf > 0 && sauveConf < 6 && etat.liens[cleLien("lys", "kaya")].rancune > 20, `+${sauveConf.toFixed(1)}, rancune ${(etat.liens[cleLien("lys", "kaya")].rancune || 0).toFixed(1)}`);
}

titre("4. UN CONFLIT ENTRE PNJ, SANS HÉROS (le troisième indicateur)");
{
    const e = initiatives(etat, ["garrik", "valen", "elwen", "kaya", "brann"], { tour });
    verifier("Valen, humilié par son rival Garrik, pourrait lui chercher querelle (ou Garrik à lui)", e.some(x => (x.ame === "valen" && x.vers === "garrik") || (x.ame === "garrik" && x.vers === "valen")), e.map(x => x.texte).join(" | "));
    verifier("Lysandra, présente pendant l'humiliation de Valen, s'en souvient (témoin) ; Tessa non", (s3.changements.some(c => c.de === "lys")) && !s3.changements.some(c => c.de === "tessa"));
    verifier("le secret confié en douce : Garrik, présent mais sans rien voir, ne change pas", !s6.changements.some(c => c.de === "garrik"));
}

titre("5. LES GRANDEURS (le calibrage)");
{
    const petit = ecart(s11, "mael", "brann", "attachement");
    verifier("cinq compliments d'affilée : moins de 5 points d'attachement en tout", petit > 0 && petit < 5, petit.toFixed(2));
    const tenue = ecart(s1, "lys", "kaya", "confiance");
    verifier("une promesse tenue (notable) : de 5 à 12 points de confiance", tenue >= 5 && tenue <= 12, tenue.toFixed(2));
    const sauve = ecart(s7, "lys", "kaya", "dette");
    verifier("une vie sauvée (fondatrice) : une dette de 15 à 30", sauve >= 15 && sauve <= 30, sauve.toFixed(2));
    const humil = ecart(s2, "mael", "brann", "attachement");
    verifier("une humiliation (notable) : de −5 à −12 d'attachement", humil <= -5 && humil >= -12, humil.toFixed(2));
    const temoin = ecart(s2, "lys", "brann", "attachement");
    verifier("un témoin la ressent environ à moitié", temoin < 0 && Math.abs(temoin) < Math.abs(humil) * 0.75, temoin.toFixed(2));
}

titre("6. L'ABSENTE, LES BORNES, DEUX CENTS SCÈNES AU HASARD");
{
    verifier("Tessa (jamais présente) : pas un lien n'a bougé", JSON.stringify(Object.values(etat.liens).filter(l => l.de === "tessa" || l.vers === "tessa")) === tessaAvant);
    let graine = 7;
    const hasard = (n) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % n; };
    const ids = Object.keys(etat.ames);
    for (let i = 0; i < 200; i++) {
        const presents = ids.filter(() => hasard(3) > 0);
        const evs = Array.from({ length: 1 + hasard(4) }, () => ({ type: TYPES_ACTIONS[hasard(TYPES_ACTIONS.length)], acteur: ids[hasard(ids.length)], cible: ids[hasard(ids.length)], gravite: 1 + hasard(3), discret: hasard(5) === 0 }));
        scene(presents, evs);
    }
    const valeurs = Object.values(etat.liens).flatMap(l => AXES.map(a => [a, l.axes[a]]));
    verifier("après deux cents scènes, chaque axe reste dans ses bornes et rien n'est NaN", valeurs.every(([a, v]) => Number.isFinite(v) && v >= BORNES[a][0] && v <= BORNES[a][1]), `${valeurs.length} valeurs`);
    verifier("aucun lien d'un héros vers un autre héros", !etat.liens[cleLien("kaya", "brann")] && !etat.liens[cleLien("brann", "kaya")]);
    verifier("les personnalités des PNJ n'ont pas bougé", etat.ames.lys.psyche.traits.loyaute === 92 && etat.ames.garrik.psyche.traits.orgueil === 80);
}

console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
