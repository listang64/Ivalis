// v240 — LES MOTS DE POUVOIR DEVIENNENT LA DISTORSION MENTALE.
//
// Nico : « renommer l'effet de combat Mot de pouvoir par : Distorsion
// mentale. Je veux que tu sois méticuleux et que tu fouilles partout pour
// changer ce nom sans faire bugger tout le jeu. Et tout comme les attaques
// magiques qui sont liées à un élément, la distorsion mentale sera liée à un
// des trois effets d'état du charisme, à savoir : Confusion, Immobilisation et
// Peur, avec les mêmes pourcentages. Je te laisse créer aussi des icônes
// sympas. »
//   1. le noyau : son geste (« mots ») sous le nouveau nom ;
//   2. app.js : le nom, les deux noms reconnus, le grimoire renommé au
//      chargement, les trois états et leurs icônes dessinées ;
//   3. la Forge : la popup des états, l'état offert (5 %), la pastille,
//      la validation, l'enregistrement ; les cartes d'avant affichées sous le
//      nouveau nom ;
//   4. le combat : l'attaque reconnue sous le nouveau nom, l'état offert ;
//   5. les créatures et LIA : un état tiré au sort, ou choisi par le récit.
//
// v260 (Nico : « les distorsions mentales = dégâts bruts qui ne prennent pas
// en compte l'esquive et la parade de la cible ; enlève le choix lié à
// confusion / peur / immobilisation ») : L'ÉTAT DU CHARISME EST RETIRÉ. Ce
// banc garde le renommage (1, 2) et vérifie désormais qu'aucun état n'est plus
// demandé, offert, enregistré ni tiré (3, 4, 5) — corrections_v260.mjs porte
// le reste (brut, ni esquive ni parade).
import fs from 'fs';
import http from 'http';
import path from 'path';
import * as MP from '../moteur_pur.js';
import { construireEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  v240 — LA DISTORSION MENTALE (ex-Mots de pouvoir)");
console.log("=========================================================");

console.log("\n1. LE NOYAU : SON GESTE SOUS LE NOUVEAU NOM");
{
  const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 40, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  const monde = () => construireEtatCombat({ idPartie: "G", cerveau: "P_01", graine: 7,
    combattants: [fiche("H1", { camp: "Allié", prenom: "Naomi" }), fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 2, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] } });
  const coup = (nom) => ({ nom, typeRes: "Magique", valeurBrute: 10, isHeal: false, isShield: false, rangeMax: 1, cibles: ["M1"] });
  const carteDe = (nom) => {
    const r = MP.resoudreCarte(monde(), { type: "carte", idLanceur: "H1", idCarte: "C", alterations: [], jets: { parCible: {} }, attaques: [coup(nom)] });
    return ((r && r.etapes) || []).find(e => e.type === "carte") || {};
  };
  verifier("« Distorsion mentale » : le geste des mots (sort « mots »)", carteDe("Distorsion mentale").sort === "mots", String(carteDe("Distorsion mentale").sort));
  verifier("une carte d'avant (« Mots de pouvoirs ») : le même geste", carteDe("Mots de pouvoirs").sort === "mots");
  verifier("une Attaque Magique sans élément n'a pas ce geste", carteDe("Attaque Magique").sort !== "mots");
}

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n2. app.js : LE NOM, LES DEUX NOMS, LE GRIMOIRE, LES TROIS ÉTATS");
{
  const r = await p.evaluate((EFFETS) => {
    const cache = JSON.parse(JSON.stringify(EFFETS));
    window.completerEffetsDeSecours(cache);
    const maj = (window.MAJ_GRIMOIRE_REGLES || []).find(x => x.id === "EFF_MOTS_DE_POUVOIRS");
    const etats = window.ETATS_DISTORSION || [];
    return {
      nom: window.NOM_DISTORSION,
      reconnu: typeof window.estDistorsionMentale === "function"
        ? ["Distorsion mentale", "DISTORSION MENTALE", "Mots de pouvoirs", "Mot de pouvoir", "Attaque Magique", "Peur"].map(n => window.estDistorsionMentale(n)) : [],
      elementaire: window.estAttaqueElementaire("Distorsion mentale"),
      magique: window.actionEstMagique("Distorsion mentale"),
      renomme: cache.EFF_MOTS_DE_POUVOIRS && cache.EFF_MOTS_DE_POUVOIRS.Nom,
      valeurGardee: cache.EFF_MOTS_DE_POUVOIRS && cache.EFF_MOTS_DE_POUVOIRS.Valeur,
      maj: maj ? maj.champs.Nom : null,
      ancienTexte: typeof window.nomEffetActuel === "function" ? window.nomEffetActuel("• Mots de pouvoirs : 3 dégâts") : null,
      etats: etats.map(e => `${e.id}→${e.etat}:${e.effetId}`).join(", "),
      dessins: etats.map(e => /^<svg[\s\S]*<\/svg>$/.test((e.dessin || "").trim()) && !!e.icone && !!e.couleur && !!e.fond),
      cha: (window.AIDE_CARACS.cha.combat || [])[0],
      talent: window.texteAtout("degatsMotsPouvoir", 1)
    };
  }, EFFETS_PAR_ID);
  verifier("le nom : « Distorsion mentale »", r.nom === "Distorsion mentale", String(r.nom));
  verifier("reconnue sous ses deux noms (et rien d'autre)", JSON.stringify(r.reconnu) === "[true,true,true,true,false,false]", JSON.stringify(r.reconnu));
  verifier("pas d'élément ; une action magique", r.elementaire === false && r.magique === true);
  verifier("le grimoire renommé au chargement (sa Valeur intacte)", r.renomme === "Distorsion mentale" && Number(r.valeurGardee) === 1, `${r.renomme} / ${r.valeurGardee}`);
  verifier("la mise à jour du grimoire (bouton du MJ) porte le nouveau nom", r.maj === "Distorsion mentale", String(r.maj));
  verifier("une phrase d'avant se lit sous le nouveau nom", r.ancienTexte === "• Distorsion mentale : 3 dégâts", String(r.ancienTexte));
  verifier("v260 : plus de table des états du charisme", r.etats === "" && r.dessins.length === 0, r.etats);
  verifier("l'aide des caracs (Charisme) et le talent disent le nouveau nom",
           r.cha === "Distorsion mentale" && /Distorsion mentale/.test(r.talent || ""), `${r.cha} | ${r.talent}`);
}

await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.__docs = { "Personnages/P1": { Classe: "", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { Charisme: 16, Intelligence: 12 } };
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Magie";
  window.rafraichirForge();
}, EFFETS_PAR_ID);

console.log("\n3. LA FORGE : LA DISTORSION SE POSE SANS ÉTAT (v260)");
{
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_MOTS_DE_POUVOIRS"));
  await p.waitForTimeout(80);
  const g = await p.evaluate(() => {
    const m = document.getElementById("modale-choix-element");
    const act = window.forgeState.actions[0];
    return { popup: !!m && getComputedStyle(m).display === "block", n: window.forgeState.actions.length,
             etat: act && act.etatMental, element: act && act.element,
             nom: (document.querySelector("#forge-contenu-carte .forge-action .forge-nom-effet") || {}).textContent,
             offert: !!document.querySelector("#forge-contenu-carte .forge-sous-effet-offert"),
             pastille: !!document.querySelector("#forge-contenu-carte .forge-element-pastille"),
             entete: document.getElementById("forge-element-affichage").textContent };
  });
  verifier("poser la Distorsion : posée tout de suite, sans popup d'état", !g.popup && g.n === 1 && !g.etat && !g.element, JSON.stringify(g));
  verifier("dans la Forge, l'effet s'appelle « Distorsion mentale »", /Distorsion mentale/.test(g.nom || ""), String(g.nom));
  verifier("ni sous-effet offert, ni pastille, ni état dans l'en-tête", !g.offert && !g.pastille && !/PEUR|CONFUSION|IMMOBILISATION/.test(g.entete), g.entete);

  // L'Attaque Magique garde SA popup, et son titre.
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE"));
  const am = await p.evaluate(() => ({ titre: document.querySelector("#modale-choix-element h3").textContent,
    ronds: [...document.querySelectorAll("#modale-choix-element .forge-element-rond")].map(x => x.dataset.element).join(",") }));
  verifier("l'Attaque Magique, ensuite : « Élément du sort », Feu, Foudre, Glace", am.titre === "Élément du sort" && am.ronds === "Feu,Foudre,Glace", JSON.stringify(am));
  await p.evaluate(() => window.fermerChoixElement());

  // Enregistrer : aucun état ne part avec la technique, même d'une carte d'avant.
  const enr = await p.evaluate(async () => {
    window.forgeState.actions[0].etatMental = "Confusion";   // une carte d'avant la v260
    document.getElementById("forge-nom").value = "Murmure dément";
    window.rafraichirForge();
    const eteint = document.getElementById("btn-valider-forge").disabled;
    window.__ecrits = [];
    await window.sauvegarderCompetence();
    const e = window.__ecrits.find(x => /Competences/.test(x.chemin));
    return e ? { eteint, Element: e.data.Element, action: e.data.Composants.actions[0], effets: e.data.Effets_Compiles } : { eteint };
  });
  verifier("enregistrée sans etatMental (même s'il en restait un), Element « Aucun »",
           enr && !enr.eteint && enr.action && !enr.action.etatMental && !enr.action.element && enr.Element === "Aucun", JSON.stringify(enr && enr.action));
  verifier("la carte dit « Distorsion mentale », sans état", enr.effets && enr.effets[0].nom === "Distorsion mentale" && !/Confusion|Peur|Immobilisation/.test(enr.effets[0].desc),
           JSON.stringify(enr.effets && enr.effets[0]));

  const regles = await p.evaluate(() => {
    const O = window.outilsForge;
    return { base: O.estUneAttaqueDeBase("Distorsion mentale"), sansArme: O.estIncompatibleAvecArme("Distorsion mentale", "Sans arme / Arme rp"),
             magie: O.estIncompatibleAvecArme("Distorsion mentale", "Magie") };
  });
  verifier("une attaque de base ; interdite sans arme (comme avant), permise en Magie",
           regles.base && regles.sansArme && !regles.magie, JSON.stringify(regles));

  // Une carte forgée avant le renommage : affichée sous le nouveau nom.
  const vieille = await p.evaluate(() => {
    window.COMPETENCES_CACHE = { VIEILLE: { Nom: "Ancienne", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Effets_Compiles: [{ nom: "Mots de pouvoirs", desc: "3 dégâts", isMod: false }], Composants: { actions: [] } } };
    window.afficherApercuCarteHD("VIEILLE");
    const hd = (document.getElementById("apercu-carte-hd-competence") || {}).textContent || "";
    const encart = window.ligneEffetsCarte(window.COMPETENCES_CACHE.VIEILLE, null);
    return { hd: /Distorsion mentale/.test(hd) && !/Mots de pouvoirs/.test(hd), encart: /Distorsion mentale/.test(encart) && !/Mots de pouvoirs/.test(encart) };
  });
  verifier("une carte d'avant : la carte en grand et l'encart disent « Distorsion mentale »", vieille.hd && vieille.encart, JSON.stringify(vieille));
}

console.log("\n4. LE COMBAT : L'ATTAQUE RECONNUE, L'ÉTAT OFFERT");
{
  const ex = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", prenom: "Ilda", classe: "", race: "Humain", xp: 0,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    const carte = (actions) => ({ Nom: "Sort", Arme: "Magie", Fatigue: 10, Initiative: 50, Composants: { actions } });
    const d = (extra) => ({ baseEffetId: "EFF_MOTS_DE_POUVOIRS", count: 2, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, ...extra });
    window.COMPETENCES_CACHE = {
      PEUR: carte([d({ etatMental: "Peur" })]),
      CONF: carte([d({ etatMental: "Confusion" })]),
      IMMO: carte([d({ etatMental: "Immobilisation" })]),
      CONF1: carte([d({ etatMental: "Confusion", mods: { EFF_CONFUSION: 1 } })]),
      ANCIENNE: carte([d({})]),
      FAUX: carte([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, element: "Feu", etatMental: "Peur" }])
    };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    const out = {};
    for (const id of Object.keys(window.COMPETENCES_CACHE)) {
      const r = (await window.demarrerCiblage(id, { extraire: true, idLanceur: "H1" })) || {};
      const att = (r.attaques || [])[0] || {};
      out[id] = { n: (r.attaques || []).length, nom: att.nom, typeRes: att.typeRes, valeur: att.valeurBrute, element: att.element || null,
                  brut: att.brut === true, distorsion: att.distorsion === true,
                  alt: (r.alterations || []).map(x => `${x.nom}:${x.chance}:${x.duree}`) };
    }
    return out;
  });
  verifier("sous son nouveau nom, la Distorsion frappe : 2 crans = 2 dégâts, brute (v260)",
           ex.PEUR.n === 1 && ex.PEUR.nom === "Distorsion mentale" && ex.PEUR.typeRes === "Magique" && ex.PEUR.valeur === 2 && !ex.PEUR.element
           && ex.PEUR.brut === true && ex.PEUR.distorsion === true, JSON.stringify(ex.PEUR));
  verifier("v260 : un état d'avant (Peur, Confusion, Immobilisation) n'offre plus rien",
           ex.PEUR.alt.length === 0 && ex.CONF.alt.length === 0 && ex.IMMO.alt.length === 0, JSON.stringify([ex.PEUR.alt, ex.CONF.alt, ex.IMMO.alt]));
  verifier("Confusion posée en sous-effet (1 cran) : 6 %, sans les 5 offerts", JSON.stringify(ex.CONF1.alt) === '["Confusion:6:2"]', JSON.stringify(ex.CONF1.alt));
  verifier("une Distorsion d'avant (sans état) : rien d'offert, elle frappe quand même", ex.ANCIENNE.alt.length === 0 && ex.ANCIENNE.n === 1, JSON.stringify(ex.ANCIENNE));
  verifier("un état du charisme sur une Attaque Magique ne compte pas (seul son élément)",
           JSON.stringify(ex.FAUX.alt) === '["Brûlé:5:2"]', JSON.stringify(ex.FAUX.alt));
}

console.log("\n5. LES CRÉATURES, LIA");
{
  const mc = fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8');
  verifier("v260 : une créature ne tire plus d'état pour sa Distorsion", !/act\.etatMental =/.test(mc) && !/etatMental: act\.etatMental/.test(mc));
  verifier("…et la reconnaît sous ses deux noms (attaque de base, sans arme)",
           /attaque:\s+\["attaque", "distorsion"/.test(mc) && /estDistorsionMonstre\(nom\) \|\| legere/.test(mc));
  const ia = fs.readFileSync('/home/user/Ivalis/monstres_ia.js', 'utf-8');
  verifier("l'IA des créatures compte ses dégâts sous le nouveau nom", /nomBase\.includes\("distorsion"\)/.test(ia));
  const lia = fs.readFileSync('/home/user/Ivalis/lia_forge.js', 'utf-8');
  verifier("LIA : « Distorsion mentale » dans ses attaques ; v260 : plus d'état dans le schéma",
           /"Attaque Magique", "Distorsion mentale"/.test(lia) && !/etat_mental/.test(lia));
  verifier("LIA ne pose plus d'état ; elle sait la Distorsion brute, sans esquive ni parade",
           !/etatMentalPourLIA/.test(lia) && /ni élément ni état lié : ce sont des dégâts bruts mentaux/.test(lia));
}

verifier("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
