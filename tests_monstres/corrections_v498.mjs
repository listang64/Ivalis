// v498 — L'ATTIRANCE QUI GRANDIT AVEC LE TEMPS.
// Nico : « L'attirance doit pouvoir monter aussi. Avec le temps plus les personnages se rapprochent. »
// Au retour d'une expédition (retour_camp.js → camp_pur.js, evolutionAffinites), le temps passé au camp fait grandir
// l'attirance d'autant plus vite que le lien est déjà proche (l'affection de social_pur.js) ; plus vite avec
// l'alchimie de la paire ; jamais avec Thémès.
// Lancer : node tests_monstres/corrections_v498.mjs
import fs from 'fs';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(92)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const CP = await import(path.join(RACINE, 'camp_pur.js'));
const P = await import(path.join(RACINE, 'social_pur.js'));

const loin = { attachement: 5, confiance: 5, familiarite: 10 };
const sympathie = { attachement: 30, confiance: 30, familiarite: 40 };
const proche = { attachement: 75, confiance: 70, familiarite: 70 };

console.log("\nLa règle (camp_pur.js, attiranceDuTemps)");
const t = (axes, j, o) => CP.attiranceDuTemps(axes, j, o);
verifier("deux êtres encore loin l'un de l'autre (sous la sympathie) : rien", t(loin, 15, { alchimie: true, ensemble: true }) === 0);
verifier("le même calcul de proximité que l'affection de social_pur.js", [loin, sympathie, proche].every(a => Math.abs((0.5 * a.attachement + 0.3 * a.confiance + 0.2 * a.familiarite) - P.affection(a)) < 1e-9));
verifier("plus ils sont proches, plus elle monte", t(proche, 9, { alchimie: true, ensemble: true }) > t(sympathie, 9, { alchimie: true, ensemble: true }) && t(sympathie, 9, { alchimie: true, ensemble: true }) > 0,
  `${t(sympathie, 9, { alchimie: true, ensemble: true })} < ${t(proche, 9, { alchimie: true, ensemble: true })}`);
verifier("plus le temps passe, plus elle monte", t(proche, 15, { alchimie: true, ensemble: true }) > t(proche, 5, { alchimie: true, ensemble: true }));
verifier("sans alchimie, elle monte aussi, plus lentement", t(proche, 15, { alchimie: false, ensemble: true }) > 0 && t(proche, 15, { alchimie: false, ensemble: true }) < t(proche, 15, { alchimie: true, ensemble: true }),
  `${t(proche, 15, { alchimie: false, ensemble: true })} / ${t(proche, 15, { alchimie: true, ensemble: true })}`);
verifier("chacun à son poste : deux fois moins vite qu'à la même tâche", t(proche, 15, { alchimie: true, ensemble: false }) === Math.round(t(proche, 15, { alchimie: true, ensemble: true }) / 2));
verifier("une longue expédition (15 jours, très proches, alchimie, même tâche) : +12", t(proche, 15, { alchimie: true, ensemble: true }) === 12);

console.log("\nAu retour au camp (evolutionAffinites, avec les fils invisibles d'avant)");
// Une paire avec alchimie, une sans : la graine est fixe.
const ids = Array.from({ length: 40 }, (_, i) => "PNJ_" + i);
const avec = ids.flatMap(a => ids.map(b => [a, b])).find(([a, b]) => a < b && P.alchimie(a, b));
const sans = ids.flatMap(a => ids.map(b => [a, b])).find(([a, b]) => a < b && !P.alchimie(a, b));
const neutre = { traits: { prudence: 50, impulsivite: 50, loyaute: 50, empathie: 50, orgueil: 50, sociabilite: 50 } };
const evo = (paire, liens, taches) => CP.evolutionAffinites({ presents: paire, jours: 12, taches: taches || { [paire[0]]: "chasser", [paire[1]]: "chasser" },
  psyches: { [paire[0]]: neutre, [paire[1]]: neutre }, moraux: { [paire[0]]: 50, [paire[1]]: 50 }, liens });
const att = (r, de, vers) => ((r.find(x => x.de === de && x.vers === vers) || {}).axes || {}).attirance || 0;
const [A, B] = sans;
const r0 = evo(sans, {});
verifier("sans alchimie ni lien d'avant : pas d'attirance (comme en v497)", att(r0, A, B) === 0 && att(r0, B, A) === 0);
const r1 = evo(sans, { [`${A}~${B}`]: { axes: proche }, [`${B}~${A}`]: { axes: loin } });
verifier("A, très proche de B : son attirance grandit ; B, encore loin : la sienne non (chaque sens à part)", att(r1, A, B) > 0 && att(r1, B, A) === 0, `${att(r1, A, B)} / ${att(r1, B, A)}`);
const [C, D] = avec;
const r2 = evo(avec, { [`${C}~${D}`]: { axes: proche }, [`${D}~${C}`]: { axes: proche } });
const r2b = evo(avec, {});
verifier("avec l'alchimie : la découverte (v497) et le temps s'additionnent", att(r2, C, D) > att(r2b, C, D) && att(r2, C, D) === att(r2b, C, D) + CP.attiranceDuTemps(proche, 12, { alchimie: true, ensemble: true }),
  `${att(r2b, C, D)} + temps = ${att(r2, C, D)}`);
const T = "PNJ_THEMES_P1";
const r3 = CP.evolutionAffinites({ presents: [A, T], jours: 12, taches: { [A]: "chasser", [T]: "chasser" }, psyches: {}, moraux: {}, liens: { [`${A}~${T}`]: { axes: proche }, [`${T}~${A}`]: { axes: proche } } });
verifier("jamais envers Thémès, ni de Thémès", att(r3, A, T) === 0 && att(r3, T, A) === 0 && r3.length === 2);
const r4 = evo(sans, { [`${A}~${B}`]: { axes: proche } }, { [A]: "chasser", [B]: "cuisiner" });
verifier("chacun à son poste, au camp ensemble : elle grandit quand même", att(r4, A, B) > 0 && att(r4, A, B) < att(r1, A, B), `${att(r4, A, B)} < ${att(r1, A, B)}`);
verifier("la familiarité et l'attachement d'avant ne changent pas (mêmes écarts que v497)", JSON.stringify({ ...r1[0].axes, attirance: 0 }) === JSON.stringify({ ...r0[0].axes, attirance: 0 }));

console.log("\nLe retour au camp lit les fils invisibles d'avant");
const rc = fs.readFileSync(path.join(RACINE, 'retour_camp.js'), 'utf-8');
verifier("retour_camp.js : SOCIAL.lireLiens(présents) passé à evolutionAffinites", /SOCIAL\.lireLiens\(p, presents\)/.test(rc) && /membres: camp\.Membres, liens \}/.test(rc));
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf-8');
const v = JSON.parse(fs.readFileSync(path.join(RACINE, 'version.json'), 'utf-8')).version;
verifier("la version 498", v === 498 && /VERSION_IVALIS = 498/.test(fs.readFileSync(path.join(RACINE, 'trace_combat.js'), 'utf-8')));
const imp = fs.readdirSync(RACINE).filter(f => f.endsWith('.js')).filter(f => /camp_pur\.js\?v=/.test(fs.readFileSync(path.join(RACINE, f), 'utf-8')));
verifier("tous les modules importent camp_pur.js?v=19", imp.length > 0 && imp.every(f => /camp_pur\.js\?v=19"/.test(fs.readFileSync(path.join(RACINE, f), 'utf-8'))), imp.join(" "));
verifier("index.html : retour_camp.js?v=13", /retour_camp\.js\?v=13"/.test(html));

console.log("\n" + (echecs ? `${echecs} CONTRÔLE(S) EN ÉCHEC` : "TOUT EST BON"));
process.exit(echecs ? 1 : 0);
