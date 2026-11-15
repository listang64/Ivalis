// LE MOTEUR SOCIAL PUR, MIS À L'ÉPREUVE (v410) — « LES FILS INVISIBLES », LOT 1.
//
// Le moteur qui calcule ce que les PNJ (et les héros) pensent les uns des
// autres, sans Firestore, sans navigateur, sans IA. Chaque règle de la refonte
// y a son contrôle : l'asymétrie, la personnalité, les absents, la lassitude,
// la saturation, les plafonds, les morts, les héros qui se révèlent par leurs
// actes, l'humeur, les liens d'avant la rencontre et les envies proposées au MJ.
//
// Lancer : node tests_monstres/social_pur.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const RACINE = process.env.IVALIS_RACINE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(RACINE, 'social_pur.js')).href);
const { appliquerEvenements, affinite, resumeLien, premiereImpression, liensPreexistants, initiatives, humeurActive,
        psycheValide, validerEvenement, cleLien, arrondi, ACTIONS, PLAFOND_GRAVITE } = S;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(80)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = (corps) => { try { corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.stack || e).slice(0, 300)); } };

// LE PETIT MONDE DU BANC.
const psy = (traits, valeurs = [], objectifs = []) => ({ traits, valeurs, objectifs, faille: "", masque: "", style: "" });
const MOYEN = { prudence: 50, impulsivite: 50, loyaute: 50, empathie: 50, orgueil: 50, sociabilite: 50 };
const monde = () => ({
    ames: {
        kaya:   { id: "kaya", type: "heros", nom: "Kaya", psyche: psy({ ...MOYEN }) },
        brann:  { id: "brann", type: "heros", nom: "Brann", psyche: psy({ ...MOYEN }) },
        varos:  { id: "varos", type: "pnj", nom: "Varos", psyche: psy({ ...MOYEN, orgueil: 85, impulsivite: 70 }, ["honneur"]) },
        myrto:  { id: "myrto", type: "pnj", nom: "Myrto", psyche: psy({ ...MOYEN, empathie: 80, orgueil: 20 }, ["compassion"]) },
        doros:  { id: "doros", type: "pnj", nom: "Doros", psyche: psy({ ...MOYEN }) },
        iris:   { id: "iris", type: "pnj", nom: "Iris", psyche: psy({ ...MOYEN }) },
        lys:    { id: "lys", type: "pnj", nom: "Lysandra", psyche: psy({ ...MOYEN, loyaute: 92, prudence: 74, orgueil: 67, empathie: 58, impulsivite: 31 }, ["honneur", "famille"]) },
        garrik: { id: "garrik", type: "pnj", nom: "Garrik", psyche: psy({ ...MOYEN, loyaute: 25, prudence: 30, orgueil: 70 }, ["richesse"]) }
    },
    liens: {}
});
const ax = (etat, de, vers) => (etat.liens[cleLien(de, vers)] || { axes: {} }).axes;
const ecart = (r, de, vers, axe) => r.changements.filter(c => c.de === de && c.vers === vers && c.axe === axe).reduce((s, c) => s + (c.apres - c.avant), 0);
const TOUS = ["kaya", "brann", "varos", "myrto", "doros", "lys", "garrik"];

titre("1. UN LIEN EST ORIENTÉ (A → B N'EST PAS B → A)");
section(() => {
    const r = appliquerEvenements(monde(), [{ type: "aider", acteur: "kaya", cible: "varos", gravite: 2 }], { presents: ["kaya", "varos"] });
    const vk = ax(r.etat, "varos", "kaya"), kv = ax(r.etat, "kaya", "varos");
    verifier("Kaya aide Varos : Varos → Kaya gagne confiance, attachement et dette", vk.confiance > 0 && vk.attachement > 0 && vk.dette > 0, JSON.stringify(vk));
    verifier("…Kaya → Varos est un autre lien, plus faible, sans dette", kv.attachement > 0 && kv.attachement < vk.attachement && !kv.dette && !kv.confiance, JSON.stringify(kv));
    verifier("…et les deux affinités diffèrent", Math.abs(affinite(vk) - affinite(kv)) > 1, `${affinite(vk).toFixed(2)} / ${affinite(kv).toFixed(2)}`);
});

titre("2. LA MÊME SCÈNE, DES RÉACTIONS DIFFÉRENTES");
section(() => {
    const m = monde();
    // Doros déteste Varos ; Myrto l'apprécie.
    m.liens[cleLien("doros", "varos")] = { de: "doros", vers: "varos", axes: { confiance: -70, respect: -60, attachement: -70, dette: 0, crainte: 0, familiarite: 60 } };
    m.liens[cleLien("myrto", "varos")] = { de: "myrto", vers: "varos", axes: { confiance: 40, respect: 30, attachement: 40, dette: 0, crainte: 0, familiarite: 60 } };
    const r = appliquerEvenements(m, [{ type: "menacer", acteur: "kaya", cible: "varos", gravite: 2, resume: "Kaya menace Varos de son glaive." }],
                                  { presents: ["kaya", "varos", "myrto", "doros"] });
    verifier("Kaya menace Varos devant Myrto : Myrto se méfie davantage de Kaya", ecart(r, "myrto", "kaya", "confiance") < 0 && ecart(r, "myrto", "kaya", "attachement") < 0);
    verifier("…Doros, qui déteste Varos, approuve plutôt (son attachement à Kaya monte)", ecart(r, "doros", "kaya", "attachement") > 0, ecart(r, "doros", "kaya", "attachement").toFixed(2));
    verifier("…les deux témoins réagissent moins fort que la cible", Math.abs(ecart(r, "myrto", "kaya", "confiance")) < Math.abs(ecart(r, "varos", "kaya", "confiance")));
    verifier("…un témoin ne prend jamais de dette", ecart(r, "myrto", "kaya", "dette") === 0 && ecart(r, "doros", "kaya", "dette") === 0);
    // Deux cibles menacées : l'orgueilleux plie moins (crainte), l'humble plie plus.
    const r2 = appliquerEvenements(monde(), [{ type: "menacer", acteur: "kaya", cible: "varos", gravite: 2 }, { type: "menacer", acteur: "brann", cible: "myrto", gravite: 2 }],
                                   { presents: ["kaya", "brann", "varos", "myrto"] });
    verifier("Varos (orgueil 85) craint moins sa menace que Myrto (orgueil 20)", ecart(r2, "varos", "kaya", "crainte") < ecart(r2, "myrto", "brann", "crainte"),
             `${ecart(r2, "varos", "kaya", "crainte").toFixed(2)} < ${ecart(r2, "myrto", "brann", "crainte").toFixed(2)}`);
    // Une trahison : la loyale Lysandra (honneur d'abord) la ressent plus que Garrik.
    const r3 = appliquerEvenements(monde(), [{ type: "trahir", acteur: "kaya", cible: "lys", gravite: 2 }, { type: "trahir", acteur: "brann", cible: "garrik", gravite: 2 }],
                                   { presents: ["kaya", "brann", "lys", "garrik"] });
    verifier("une trahison blesse plus Lysandra (loyauté 92, honneur) que Garrik (loyauté 25)", ecart(r3, "lys", "kaya", "confiance") < ecart(r3, "garrik", "brann", "confiance"),
             `${ecart(r3, "lys", "kaya", "confiance").toFixed(2)} < ${ecart(r3, "garrik", "brann", "confiance").toFixed(2)}`);
    verifier("l'humeur de Varos : la peur, jusqu'à 3 réponses du MJ", r.humeurs.some(h => h.ame === "varos" && h.emotion === "peur" && h.jusquA === 3));
});

titre("3. LES ABSENTS NE CHANGENT JAMAIS");
section(() => {
    const m = monde();
    const r = appliquerEvenements(m, [{ type: "humilier", acteur: "kaya", cible: "varos", gravite: 2 }, { type: "aider", acteur: "kaya", cible: "iris", gravite: 1 }],
                                  { presents: ["kaya", "varos", "myrto"] });
    verifier("Iris, absente, ne bouge pas (ni comme témoin, ni comme cible)", !r.changements.some(c => c.de === "iris" || c.vers === "iris"));
    verifier("…l'événement qui la vise est rejeté (« cible absente »)", r.rejets.length === 1 && /absente/.test(r.rejets[0].raison), JSON.stringify(r.rejets.map(x => x.raison)));
    verifier("…un nom inconnu aussi", appliquerEvenements(m, [{ type: "aider", acteur: "kaya", cible: "zeus" }], { presents: TOUS }).rejets.length === 1);
    verifier("…une action hors catalogue aussi", appliquerEvenements(m, [{ type: "seduire", acteur: "kaya", cible: "varos" }], { presents: TOUS }).rejets.length === 1);
    verifier("un geste discret n'a pas de témoins", !appliquerEvenements(m, [{ type: "voler", acteur: "kaya", cible: "varos", discret: true }], { presents: TOUS }).changements.some(c => c.de === "myrto"));
});

titre("4. LA RÉPÉTITION LASSE, LA SATURATION FREINE, LES PLAFONDS TIENNENT");
section(() => {
    const ev = { type: "complimenter", acteur: "kaya", cible: "myrto", gravite: 1 };
    const historique = [];
    let etat = monde();
    const gains = [];
    for (let i = 0; i < 3; i++) {
        const r = appliquerEvenements(etat, [ev], { presents: ["kaya", "myrto"], historique: historique.slice() });
        gains.push(ecart(r, "myrto", "kaya", "attachement"));
        historique.push({ acteur: "kaya", cible: "myrto", type: "complimenter" });
        etat = r.etat;
    }
    verifier("trois compliments d'affilée : chacun compte moins (½ puis ¼)", gains[1] < gains[0] * 0.6 && gains[2] < gains[1] * 0.6, gains.map(g => g.toFixed(2)).join(" → "));
    const haut = monde();
    haut.liens[cleLien("myrto", "kaya")] = { de: "myrto", vers: "kaya", axes: { confiance: 90, respect: 0, attachement: 0, dette: 0, crainte: 0, familiarite: 50 } };
    const gainHaut = ecart(appliquerEvenements(haut, [{ type: "tenir_promesse", acteur: "kaya", cible: "myrto", gravite: 2 }], { presents: ["kaya", "myrto"] }), "myrto", "kaya", "confiance");
    const gainBas = ecart(appliquerEvenements(monde(), [{ type: "tenir_promesse", acteur: "kaya", cible: "myrto", gravite: 2 }], { presents: ["kaya", "myrto"] }), "myrto", "kaya", "confiance");
    verifier("à 90 de confiance, une promesse tenue rapporte bien moins qu'à 0", gainHaut < gainBas * 0.2, `${gainHaut.toFixed(2)} contre ${gainBas.toFixed(2)}`);
    const perte = ecart(appliquerEvenements(haut, [{ type: "mentir", acteur: "kaya", cible: "myrto", gravite: 2 }], { presents: ["kaya", "myrto"] }), "myrto", "kaya", "confiance");
    verifier("…mais un mensonge la fait chuter sans frein (la confiance se perd vite)", perte <= -8 && perte < -5 * Math.abs(gainHaut), perte.toFixed(2));
    const r1 = appliquerEvenements(monde(), [{ type: "trahir", acteur: "kaya", cible: "lys", gravite: 1 }], { presents: ["kaya", "lys"] });
    verifier("une action mineure ne dépasse jamais ±6 par axe", r1.changements.every(c => Math.abs(c.apres - c.avant) <= PLAFOND_GRAVITE[1] + 1e-9));
    const r3 = appliquerEvenements(monde(), [{ type: "trahir", acteur: "kaya", cible: "lys", gravite: 3 }], { presents: ["kaya", "lys"] });
    const chute = ecart(r3, "lys", "kaya", "confiance");
    verifier("une trahison fondatrice dépasse le plafond notable (12) sans passer 30", chute < -12 && chute >= -30, chute.toFixed(2));
});

titre("5. L'IA NE DONNE PAS LES CHIFFRES");
section(() => {
    const r = appliquerEvenements(monde(), [{ type: "complimenter", acteur: "kaya", cible: "myrto", gravite: 3, deltas: { confiance: 30 }, confiance: 30 }], { presents: ["kaya", "myrto"] });
    verifier("un compliment « fondateur » redevient mineur (gravité max 1)", r.evenements[0].gravite === 1);
    verifier("…et les chiffres glissés par l'IA sont ignorés (pas de confiance +30)", !(ax(r.etat, "myrto", "kaya").confiance > 0), JSON.stringify(ax(r.etat, "myrto", "kaya")));
    const v = validerEvenement({ type: "attaquer", acteur: "kaya", cible: "varos", gravite: 9 }, ["kaya", "varos"], {});
    verifier("une gravité 9 est ramenée à 3", v.gravite === 3);
});

titre("6. LES DÉCIMALES, L'AFFINITÉ, LE MOT JUSTE");
section(() => {
    const r = appliquerEvenements(monde(), [{ type: "aider", acteur: "kaya", cible: "lys", gravite: 2 }], { presents: ["kaya", "lys"] });
    const a = ax(r.etat, "lys", "kaya");
    verifier("les valeurs gardent leurs décimales (arrondi seulement à l'affichage)", Object.values(a).some(v => v !== Math.round(v)), JSON.stringify(a));
    verifier("affinité = 0,40 confiance + 0,25 respect + 0,35 attachement", Math.abs(affinite({ confiance: 89, respect: 76, attachement: 78 }) - 81.9) < 1e-9 && arrondi(81.9) === 82);
    verifier("« le respecte mais ne lui fait pas confiance »", resumeLien({ confiance: -40, respect: 60, attachement: 0, familiarite: 50 }) === "le respecte mais ne lui fait pas confiance",
             resumeLien({ confiance: -40, respect: 60, attachement: 0, familiarite: 50 }));
    const m = monde(); const avant = JSON.stringify(m);
    appliquerEvenements(m, [{ type: "attaquer", acteur: "kaya", cible: "varos", gravite: 3 }], { presents: TOUS });
    verifier("le moteur ne touche jamais l'état qu'on lui donne", JSON.stringify(m) === avant);
    const p = psycheValide({ traits: { orgueil: 140, prudence: -5 }, valeurs: ["Liberté", "argent", "honneur", "foi", "savoir"] });
    verifier("une psyché proposée est bornée et nettoyée (valeurs connues, trois au plus)", p.traits.orgueil === 100 && p.traits.prudence === 0 && p.traits.empathie === 50
             && JSON.stringify(p.valeurs) === '["liberte","honneur","foi"]', JSON.stringify(p.valeurs));
});

titre("7. LES MORTS, LES HÉROS QUI SE RÉVÈLENT PAR LEURS ACTES");
section(() => {
    const m = monde(); m.ames.varos.statut = "mort";
    const r = appliquerEvenements(m, [{ type: "attaquer", acteur: "varos", cible: "kaya" }, { type: "aider", acteur: "kaya", cible: "varos" }], { presents: ["kaya", "varos", "myrto"] });
    verifier("un mort n'agit plus", r.rejets.some(x => /mort/.test(x.raison)));
    verifier("…et son propre regard ne change plus", !r.changements.some(c => c.de === "varos"));
    const h = appliquerEvenements(monde(), [{ type: "attaquer", acteur: "kaya", cible: "varos", gravite: 2 }], { presents: ["kaya", "varos"] });
    verifier("Kaya (héros) attaque : son empathie baisse, son impulsivité monte", h.derives.some(d => d.trait === "empathie" && d.apres < d.avant) && h.derives.some(d => d.trait === "impulsivite" && d.apres > d.avant));
    const p = appliquerEvenements(monde(), [{ type: "attaquer", acteur: "garrik", cible: "varos", gravite: 2 }], { presents: ["garrik", "varos"] });
    verifier("…la personnalité d'un PNJ, elle, ne bouge pas", p.derives.length === 0);
    const kh = ecart(appliquerEvenements(monde(), [{ type: "aider", acteur: "kaya", cible: "myrto", gravite: 2 }], { presents: ["kaya", "myrto"] }), "kaya", "myrto", "attachement");
    const gp = ecart(appliquerEvenements(monde(), [{ type: "aider", acteur: "garrik", cible: "myrto", gravite: 2 }], { presents: ["garrik", "myrto"] }), "garrik", "myrto", "attachement");
    verifier("ce que l'acte révèle : entier pour un héros, réduit (×0,3) pour un PNJ", kh > 0 && gp > 0 && Math.abs(gp / kh - 0.3) < 0.05, `${kh.toFixed(2)} / ${gp.toFixed(2)}`);
});

titre("8. LA PREMIÈRE RENCONTRE ET LES LIENS D'AVANT");
section(() => {
    const ami = premiereImpression(psy({ ...MOYEN }), 10), hostile = premiereImpression(psy({ ...MOYEN }), -10);
    verifier("un groupe adulé (+10) est bien accueilli, un groupe honni (−10) craint et méprisé", ami.confiance > 0 && ami.respect > 0 && hostile.confiance < 0 && hostile.crainte > 0 && ami.familiarite === 5);
    const prudent = premiereImpression(psy({ ...MOYEN, prudence: 95 }), 10);
    verifier("…le prudent accorde moins vite sa confiance", prudent.confiance < ami.confiance);
    const l = liensPreexistants("patron", "PNJ_A", "PNJ_B"), l2 = liensPreexistants("patron", "PNJ_A", "PNJ_B");
    verifier("« A est le patron de B » : A → B « employé », B → A « patron » ; B respecte et craint A", l.etiquetteAB === "employé" && l.etiquetteBA === "patron" && l.ba.respect > l.ab.respect && l.ba.crainte > 0);
    verifier("…le même couple donne toujours la même nuance", JSON.stringify(l) === JSON.stringify(l2));
    verifier("…un type inconnu ne crée rien", liensPreexistants("cousin_eloigne", "A", "B") === null);
});

titre("9. LES ENVIES PROPOSÉES AU MJ");
section(() => {
    const m = monde();
    m.liens[cleLien("varos", "kaya")] = { de: "varos", vers: "kaya", axes: { confiance: 10, respect: 20, attachement: 10, dette: 45, crainte: 0, familiarite: 40 } };
    m.liens[cleLien("doros", "garrik")] = { de: "doros", vers: "garrik", axes: { confiance: -70, respect: -50, attachement: -80, dette: 0, crainte: 10, familiarite: 50 } };
    m.liens[cleLien("kaya", "doros")] = { de: "kaya", vers: "doros", axes: { confiance: -90, respect: -90, attachement: -90, dette: 0, crainte: 0, familiarite: 50 } };
    const e = initiatives(m, ["kaya", "varos", "doros", "garrik", "iris"], { tour: 1 });
    verifier("deux envies au plus, les plus fortes d'abord", e.length === 2 && e[0].force >= e[1].force, e.map(x => x.texte).join(" | "));
    verifier("…Doros cherche querelle à Garrik ; Varos veut s'acquitter de sa dette envers Kaya", e.some(x => x.ame === "doros" && x.vers === "garrik") && e.some(x => x.ame === "varos" && /dette/.test(x.texte)));
    verifier("…jamais un héros", !e.some(x => x.ame === "kaya"));
    const e2 = initiatives(m, ["kaya", "varos", "doros", "garrik"], { tour: 2, dernieres: ["doros"] });
    verifier("…Doros, qui a eu son initiative au tour d'avant, laisse la place", !e2.some(x => x.ame === "doros"));
    verifier("…personne de présent, aucune envie", initiatives(m, ["varos"], {}).length === 0);
    verifier("l'humeur s'efface au bout de 3 réponses du MJ", !!humeurActive({ humeur: { emotion: "peur", jusquA: 3 } }, 3) && !humeurActive({ humeur: { emotion: "peur", jusquA: 3 } }, 4));
});

titre("10. LE CATALOGUE");
section(() => {
    verifier("vingt-deux actions, chacune avec un effet sur la cible et une gravité max", Object.keys(ACTIONS).length === 22 && Object.values(ACTIONS).every(a => a.cible && Object.keys(a.cible).length && [1, 2, 3].includes(a.gmax)));
    const v = JSON.parse(fs.readFileSync(path.join(RACINE, "version.json"), "utf-8")).version;
    verifier("version ≥ 410", v >= 410, String(v));
});

console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
