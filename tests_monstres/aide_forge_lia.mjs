// LIA, L'AIDE À LA CRÉATION DE LA FORGE.
//
// Nico : « centrer en hauteur le coût en fatigue dans sa petite fenêtre, et à
// sa droite un bouton marteau “aide à la création” : un popup avec un encart
// pour le RP, deux jauges (Coût en Fatigue/puissance, Rapidité : Auto, Faible,
// Modéré, Forte), Annuler ou Créer. Une IA, LIA, place plus ou moins de points
// dans les effets selon le RP, et un algorithme crée la technique dans la
// Forge : le nom, et les effets pré-remplis, que le joueur peut modifier. »
// Puis : l'arme selon le récit, parmi celles que le héros peut manier ; une
// Forge déjà garnie demande confirmation ; le récit part en base avec la
// compétence ; l'algorithme valide tout (cap, 2 caracs, arme, sous-effets
// incompatibles) ; sans clé ou en échec, un message et la Forge intacte.
//
// Ce banc joue la vraie page, avec une réponse de Gemini simulée — et une
// réponse volontairement fautive, pour voir l'algorithme la corriger.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

//  LA VRAIE PAGE
// =========================================================================
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
  export const doc = (_db, ...s) => ({ chemin: s.join("/"), col: s[0], id: s[s.length - 1] });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
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

const PERSO = { "Personnages/P1": { Classe: "Chasseur de mages", XP: 0, Race: "Elfe", Nom: "Aelis" },
                "Caracteristiques/P1": { force: 10, dex: 12, con: 10, int: 15, sag: 14, cha: 9 } };

// Ouvre la Forge sur un héros sans arme en main : il peut forger en Magie et
// en Sans arme / Arme rp, pas en arme lourde.
const ouvrir = async () => p.evaluate(async ({ EFFETS, PERSO }) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.__docs = PERSO; window.__ecrits = [];
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
}, { EFFETS: EFFETS_PAR_ID, PERSO });

// Gemini simulé : on garde la requête, on rend le plan donné.
const simulerGemini = (plan, echec = false) => p.evaluate(({ plan, echec }) => {
  window.__requetes = [];
  window.fetch = async (url, options) => {
    window.__requetes.push({ url, corps: JSON.parse(options.body) });
    if (echec) throw new Error("réseau coupé");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "forgerTechnique", args: plan } }] } }] }),
                        { status: 200, headers: { "Content-Type": "application/json" } });
  };
}, { plan, echec });

const creer = async (recit) => {
  await p.evaluate((recit) => {
    window.ouvrirAideForge();
    document.getElementById("aide-forge-recit").value = recit;
    document.getElementById("aide-forge-creer").click();
  }, recit);
  await p.waitForFunction(() => !window.LIA_EN_COURS, null, { timeout: 5000 });
  await p.waitForTimeout(50);
};

const etatForge = () => p.evaluate(() => ({
  nom: document.getElementById("forge-nom").value,
  arme: window.forgeState.armePrincipale,
  actions: window.forgeState.actions.map(a => ({ nom: a.baseEffet.Nom, count: a.count, baseDuree: a.baseDuree || 0,
    mods: Object.fromEntries(Object.entries(a.mods).map(([id, n]) => [(window.forgeState.effetsBDD.find(e => e.id === id) || {}).Nom, n])),
    zoneHexes: a.zoneHexes || [] })),
  bilan: window.forgeState.bilan, recit: window.forgeState.recitRP,
  popup: document.getElementById("modale-aide-forge").style.display,
  confirmer: document.getElementById("modale-aide-forge-confirmer").style.display,
  statut: document.getElementById("aide-forge-statut").textContent,
  valider: !document.getElementById("btn-valider-forge").disabled
}));

await ouvrir();

console.log("1. LE BANDEAU : FATIGUE CENTRÉE, ET LE MARTEAU À DROITE DES MÉDAILLONS");
{
  const m = await p.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const fat = r(".forge-medaillon-fatigue"), ini = r(".forge-medaillon-initiative");
    const bloc = (sel) => { const enfants = [...document.querySelector(sel).children].filter(e => getComputedStyle(e).display !== "none").map(e => e.getBoundingClientRect());
      return { haut: Math.min(...enfants.map(e => e.top)), bas: Math.max(...enfants.map(e => e.bottom)) }; };
    const contenu = bloc(".forge-medaillon-fatigue");
    const btn = document.getElementById("btn-aide-forge"), fermer = document.querySelector(".forge-bandeau-droite .btn-parametres");
    return { hFat: Math.round(fat.height), hIni: Math.round(ini.height),
             ecartHaut: Math.round(contenu.haut - fat.top), ecartBas: Math.round(fat.bottom - contenu.bas),
             texte: btn && btn.textContent.replace(/\s+/g, " ").trim(),
             ordre: btn ? [ini.right <= btn.getBoundingClientRect().left, btn.getBoundingClientRect().right <= fermer.getBoundingClientRect().left] : [] };
  });
  verifier("les deux médaillons ont la même hauteur", m.hFat === m.hIni, `${m.hFat} / ${m.hIni}`);
  verifier("le contenu du médaillon fatigue est centré en hauteur", Math.abs(m.ecartHaut - m.ecartBas) <= 2, `haut ${m.ecartHaut} / bas ${m.ecartBas}`);
  verifier("le bouton « 🔨 Aide à la création » existe", /🔨/.test(m.texte || "") && /Aide à la création/.test(m.texte || ""), m.texte);
  verifier("il est à droite des médaillons, avant Fermer", m.ordre[0] === true && m.ordre[1] === true, JSON.stringify(m.ordre));
}

console.log("\n2. LA FENÊTRE DE LIA");
{
  const f = await p.evaluate(() => {
    window.ouvrirAideForge();
    const fen = document.getElementById("modale-aide-forge");
    const crans = (id) => [...document.getElementById(id).parentElement.querySelectorAll(".aide-forge-crans span")].map(s => s.textContent);
    const actif = (id) => document.getElementById(id).parentElement.querySelector(".aide-forge-crans span.actif").textContent;
    const r = { visible: getComputedStyle(fen).display !== "none", recit: !!document.querySelector("#modale-aide-forge textarea#aide-forge-recit"),
      jauges: [...fen.querySelectorAll(".aide-forge-jauge-titre")].map(e => e.textContent.trim()),
      crans: crans("aide-forge-puissance"), cransR: crans("aide-forge-rapidite"),
      defaut: [document.getElementById("aide-forge-puissance").value, document.getElementById("aide-forge-rapidite").value],
      actif: actif("aide-forge-puissance"),
      boutons: [...fen.querySelectorAll(".aide-forge-pied button")].map(b => b.textContent.trim()) };
    document.getElementById("aide-forge-puissance").value = 3;
    window.majJaugeAideForge(document.getElementById("aide-forge-puissance"));
    r.actifApres = actif("aide-forge-puissance");
    // Un clic sur « Modéré » place le curseur de rapidité sur ce cran, et
    // chaque libellé est sous SON cran.
    document.getElementById("aide-forge-rapidite").parentElement.querySelectorAll(".aide-forge-crans span")[2].click();
    r.clicLibelle = document.getElementById("aide-forge-rapidite").value;
    const c = document.getElementById("aide-forge-rapidite").getBoundingClientRect();
    r.positions = [...document.getElementById("aide-forge-rapidite").parentElement.querySelectorAll(".aide-forge-crans span")]
      .map(s => { const b = s.getBoundingClientRect(); return Math.round(((b.left + b.width / 2) - c.left) / c.width * 100); });
    document.getElementById("aide-forge-rapidite").value = 0;
    window.majJaugeAideForge(document.getElementById("aide-forge-rapidite"));
    document.getElementById("aide-forge-puissance").value = 0;
    window.majJaugeAideForge(document.getElementById("aide-forge-puissance"));
    window.fermerAideForge();
    r.ferme = fen.style.display === "none";
    return r;
  });
  verifier("elle s'ouvre, avec un encart pour le récit", f.visible && f.recit);
  verifier("deux jauges : puissance et rapidité", f.jauges.length === 2 && /Fatigue\s*\/\s*puissance/.test(f.jauges[0]) && /Rapidité/.test(f.jauges[1]), f.jauges.join(" | "));
  verifier("crans Auto / Faible / Modéré / Forte", f.crans.join(",") === "Auto,Faible,Modéré,Forte" && f.cransR.join(",") === f.crans.join(","), f.crans.join(","));
  verifier("par défaut tout à gauche, sur Auto", f.defaut.join() === "0,0" && f.actif === "Auto", f.defaut.join());
  verifier("le cran choisi s'allume", f.actifApres === "Forte", f.actifApres);
  verifier("un clic sur un libellé place le curseur", f.clicLibelle === "2", f.clicLibelle);
  const attendus = [0, 33, 67, 100];
  verifier("chaque libellé est sous son cran", f.positions.every((x, i) => Math.abs(x - attendus[i]) <= 6), f.positions.join(" / "));
  verifier("boutons Annuler et Créer ; Annuler ferme", f.boutons.join(",") === "Annuler,🔨 Créer" && f.ferme, f.boutons.join(","));
}

console.log("\n3. SANS CLÉ GEMINI : UN MESSAGE, LA FORGE INTACTE");
{
  await simulerGemini({ nom: "X", arme: "Magie", actions: [] });
  await p.evaluate(() => localStorage.removeItem("ivalis_GEMINI_API_KEY"));
  await creer("Une boule de feu qui explose sur les ennemis.");
  const e = await etatForge();
  const n = await p.evaluate(() => window.__requetes.length);
  verifier("aucune requête envoyée", n === 0, `${n}`);
  verifier("un message clair parle de la clé", /clé Gemini/.test(e.statut) && /pas été touchée/.test(e.statut), e.statut);
  verifier("la Forge est vide comme avant", e.actions.length === 0 && e.nom === "");
  await p.evaluate(() => window.fermerAideForge());
}

// Un plan VOLONTAIREMENT fautif : une arme que le héros n'a pas, une seconde
// attaque, une attaque physique en Magie, un sous-effet Physique en Magie, une
// 3e caractéristique, des crans bien au-delà du cap, un effet inventé.
const PLAN = {
  nom: "Tempête de cendres", arme: "Arme lourde CAC", explication: "feu et zone",
  actions: [
    { effet: "EFF_ATTAQUE_MAGIQUE", crans: 25, duree: 0, sous_effets: [
        { effet: "EFF_BRULE", crans: 3, duree: 1 },
        { effet: "EFF_ZONE", crans: 4 },
        { effet: "EFF_ETOURDIT", crans: 2 },          // Physique : pas en Magie
        { effet: "EFF_INVENTE", crans: 1 } ] },
    { effet: "Attaque lourde", crans: 3 },              // seconde attaque, et physique
    { effet: "EFF_AVEUGLEMENT", crans: 2 },             // DEXTÉRITÉ : 2e carac
    { effet: "EFF_BOUCLIER_MAGIQUE", crans: 1 }         // SAGESSE : 3e carac (INT + DEX déjà)
  ]
};

console.log("\n4. LIA REMPLIT LA FORGE — ET L'ALGORITHME LA TIENT DANS LES RÈGLES");
{
  await p.evaluate(() => localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-de-test"));
  await simulerGemini(PLAN);
  await creer("Je lève mon bâton, une tempête de cendres brûlantes s'abat autour de ma cible, puis un voile protecteur m'entoure.");
  const e = await etatForge();
  const req = await p.evaluate(() => window.__requetes[0] && window.__requetes[0].corps);
  console.log("   forge :", JSON.stringify(e.actions), "bilan", JSON.stringify(e.bilan));
  verifier("la requête part vers Gemini, outil forgerTechnique imposé",
           !!req && req.toolConfig.functionCallingConfig.mode === "ANY" && req.tools[0].functionDeclarations[0].name === "forgerTechnique");
  verifier("elle porte le récit et les jauges", /tempête de cendres/.test(req.contents[0].parts[0].text) && /Puissance/.test(req.contents[0].parts[0].text));
  const ids = await p.evaluate(() => window.forgeState.effetsBDD.filter(e => e.Nom !== "Durée +").map(e => e.id));
  const manquants = ids.filter(id => !req.contents[0].parts[0].text.includes(`"${id}"`));
  verifier("…et la liste de TOUS les effets et sous-effets du héros", manquants.length === 0 && ids.length > 20, `${ids.length} effets, manquants : ${manquants.join(",")}`);
  verifier("les armes proposées sont celles qu'il peut manier", JSON.stringify(req.tools[0].functionDeclarations[0].parameters.properties.arme.enum) === JSON.stringify(["Magie", "Sans arme / Arme rp"]),
           JSON.stringify(req.tools[0].functionDeclarations[0].parameters.properties.arme.enum));
  verifier("la fenêtre se ferme", e.popup === "none");
  verifier("le nom de la technique est posé", e.nom === "Tempête de cendres", e.nom);
  verifier("arme impossible remplacée par une arme maniable (Magie)", e.arme === "Magie", e.arme);
  const noms = e.actions.map(a => a.nom);
  verifier("l'Attaque Magique est posée", noms[0] === "Attaque Magique", noms.join(","));
  verifier("pas de seconde attaque (Attaque lourde écartée)", !noms.includes("Attaque lourde"));
  verifier("l'Aveuglement (DEXTÉRITÉ, 2e carac) est gardé", noms.includes("Aveuglement"), noms.join(","));
  verifier("pas de 3e caractéristique (Bouclier magique, SAGESSE, écarté)", !noms.includes("Bouclier magique"), noms.join(","));
  const am = e.actions[0] || { mods: {} };
  verifier("Brûlé posé en sous-effet", (am.mods["Brûlé"] || 0) >= 1, JSON.stringify(am.mods));
  verifier("pas d'Étourdit (Physique) sur une technique en Magie", !am.mods["Étourdit"]);
  verifier("effet inventé ignoré", !Object.keys(am.mods).some(n => n === undefined || n === "undefined"));
  const zone = am.zoneHexes;
  const connexe = zone.every(h => !(h.q === 0 && h.r === 0)) && zone.length === (am.mods["Zone"] || 0);
  verifier("la Zone a sa forme (au contact, sans la case du lanceur)", !am.mods["Zone"] || connexe, JSON.stringify(zone));
  verifier("le cap de fatigue est respecté (crans rabotés)", e.bilan.fatigue <= e.bilan.cap && am.count < 25, `${e.bilan.fatigue}/${e.bilan.cap}, ${am.count} crans`);
  // Le rabot prend sur le poste qui coûte le plus au total : l'attaque garde
  // de la force au lieu de tomber à 1 cran pour sauver tout le reste.
  verifier("le rabot répartit : l'attaque garde plusieurs crans", am.count >= 2, `${am.count} crans`);
  verifier("la technique se valide telle quelle", e.valider);
  verifier("le récit est gardé pour la sauvegarde", /tempête de cendres/.test(e.recit || ""));
}

console.log("\n5. UNE FORGE DÉJÀ GARNIE : LIA DEMANDE AVANT DE REMPLACER");
{
  await simulerGemini({ nom: "Onde de soin", arme: "Magie", actions: [{ effet: "EFF_SOIN", crans: 3, sous_effets: [{ effet: "EFF_DISTANCE", crans: 2 }] }] });
  await creer("Une onde de lumière apaisante soigne un allié au loin.");
  let e = await etatForge();
  let n = await p.evaluate(() => window.__requetes.length);
  verifier("la confirmation s'affiche, rien n'est encore demandé", e.confirmer === "block" && n === 0, `${e.confirmer} ${n}`);
  await p.evaluate(() => window.confirmerRemplacementLIA(false));
  e = await etatForge();
  verifier("« Garder » : la Forge ne bouge pas", e.nom === "Tempête de cendres" && e.actions[0].nom === "Attaque Magique");
  await p.evaluate(() => document.getElementById("aide-forge-creer").click());
  await p.evaluate(() => document.getElementById("aide-forge-remplacer").click());
  await p.waitForFunction(() => !window.LIA_EN_COURS, null, { timeout: 5000 });
  e = await etatForge();
  verifier("« Remplacer » : la nouvelle technique prend la place", e.nom === "Onde de soin" && e.actions.length === 1 && e.actions[0].nom === "Soin", JSON.stringify(e.actions));
  verifier("Distance posée sur le soin", e.actions[0].mods["Distance"] === 2, JSON.stringify(e.actions[0].mods));
}

console.log("\n6. LIA EN ÉCHEC : UN MESSAGE, LA FORGE INTACTE");
{
  const avant = await etatForge();
  await simulerGemini(null, true);
  await p.evaluate(() => { window.ouvrirAideForge(); document.getElementById("aide-forge-creer").click(); });
  await p.evaluate(() => { const c = document.getElementById("modale-aide-forge-confirmer"); if (c.style.display === "block") document.getElementById("aide-forge-remplacer").click(); });
  await p.waitForFunction(() => !window.LIA_EN_COURS, null, { timeout: 5000 });
  const e = await etatForge();
  verifier("message d'erreur, Forge non touchée", /pas été touchée/.test(e.statut), e.statut);
  verifier("la technique d'avant est toujours là", JSON.stringify(e.actions) === JSON.stringify(avant.actions) && e.nom === avant.nom);
  verifier("la fenêtre reste ouverte pour réessayer", e.popup === "block");
  // Un plan sans aucune action forgeable : la Forge est rendue telle quelle.
  await simulerGemini({ nom: "Rien", arme: "Magie", actions: [{ effet: "Attaque lourde", crans: 2 }] });
  await p.evaluate(() => { document.getElementById("aide-forge-creer").click(); document.getElementById("aide-forge-remplacer").click(); });
  await p.waitForFunction(() => !window.LIA_EN_COURS, null, { timeout: 5000 });
  const e2 = await etatForge();
  verifier("plan impossible : message, et la Forge d'avant revient", /pas été touchée/.test(e2.statut)
           && JSON.stringify(e2.actions) === JSON.stringify(avant.actions) && e2.nom === avant.nom, e2.statut);
  await p.evaluate(() => window.fermerAideForge());
}

console.log("\n7. LE RÉCIT PART EN BASE AVEC LA COMPÉTENCE");
{
  await p.evaluate(async () => { window.chargerOngletCompetences = async () => {}; await window.sauvegarderCompetence(); });
  const ecrit = await p.evaluate(() => (window.__ecrits || []).find(e => /Competences/.test(e.chemin)));
  verifier("la compétence est écrite", !!ecrit, ecrit && ecrit.chemin);
  verifier("avec son récit (Recit_RP)", !!ecrit && /onde de lumière apaisante/.test(ecrit.data.Recit_RP || ""), ecrit && ecrit.data.Recit_RP);
  // Nico : « enlève ce qu'il y a dans la description RP quand la technique a
  // été forgée ». Et le bouton ne reste plus sur « Forge en cours... ».
  const apres = await p.evaluate(() => {
    window.ouvrirAideForge();
    const r = { recit: document.getElementById("aide-forge-recit").value, etat: window.forgeState.recitRP,
                jauges: [document.getElementById("aide-forge-puissance").value, document.getElementById("aide-forge-rapidite").value],
                bouton: document.getElementById("btn-valider-forge").innerText.trim() };
    window.fermerAideForge();
    return r;
  });
  verifier("forgée : l'encart du récit est vidé", apres.recit === "" && apres.etat === "", JSON.stringify(apres.recit));
  verifier("…et les jauges reviennent sur Auto", apres.jauges.join() === "0,0", apres.jauges.join());
  verifier("le bouton dit « Forger cette compétence » (plus « Forge en cours »)", /Forger cette compétence/.test(apres.bouton) && !/en cours/i.test(apres.bouton), apres.bouton);
  // Une technique forgée à la main n'a pas de récit.
  await ouvrir();
  const sansRecit = await p.evaluate(async () => {
    window.forgeState.armePrincipale = "Magie";
    window.ajouterComposantPrincipal("EFF_SOIN");
    document.getElementById("forge-nom").value = "Main";
    window.rafraichirForge();
    await window.sauvegarderCompetence();
    const e = window.__ecrits.find(x => /Competences/.test(x.chemin));
    return e && ("Recit_RP" in e.data);
  });
  verifier("forgée à la main : pas de champ Recit_RP", sansRecit === false);
  const libelle = await p.evaluate(async () => {
    document.getElementById("btn-valider-forge").innerText = "⏳ Forge en cours…";   // un reste d'avant
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    return document.getElementById("btn-valider-forge").textContent.trim();
  });
  verifier("une Forge rouverte repart sur « Forger cette compétence »", libelle === "✔️ Forger cette compétence", libelle);
}

console.log("\n8. LES EFFETS DE CLASSE : DANS LA LISTE DE LIA SEULEMENT S'ILS SONT DÉBLOQUÉS");
// Lumière (Chasseur de mages) et Ténèbres (Sorcier, ex-Nécromancien) : dès
// le niveau 1. Avant, ou dans une autre classe, LIA ne les voit pas — ni dans la
// liste, ni dans ses règles — et l'algorithme refuse de les poser même si elle
// les demande.
{
  // (Le Vampirisme a été retiré de la Forge : remplacé par le Baiser du
  // vampire, une technique de classe. Plus personne ne l'a — voir plus bas.)
  // [classe, effet, XP qui le débloque, XP trop tôt (aucun : dès le niveau 1)]
  const CLASSE = { "Lumière": ["Chasseur de mages", "EFF_LUMIERE", 0, null], "Ténèbres": ["Sorcier", "EFF_TENEBRES", 0, null] };
  const demande = async (fiche, plan) => {
    await p.evaluate(async ({ EFFETS, fiche }) => {
      window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
      window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
      window.__docs = { "Personnages/P1": fiche, "Caracteristiques/P1": { int: 15, sag: 14, dex: 12 } };
      document.getElementById("champ-id-personnage").value = "P1";
      window.OUVERTURE_FORGE_EN_COURS = false;
      await window.ouvrirCreationCompetence();
    }, { EFFETS: EFFETS_PAR_ID, fiche });
    await simulerGemini(plan);
    await creer("Un sort sombre jaillit de mes mains et ronge l'ennemi, une lumière aveuglante le transperce.");
    const req = await p.evaluate(() => window.__requetes[0] && window.__requetes[0].corps);
    const texte = req ? req.systemInstruction.parts[0].text + "\n" + req.contents[0].parts[0].text : "";
    const liste = JSON.parse(texte.slice(texte.indexOf("LES EFFETS DISPONIBLES")).replace(/^[^\n]*\n/, ""));
    return { texte, ids: liste.map(e => e.id), fiches: liste, forge: await etatForge() };
  };
  const planAvec = (id) => ({ nom: "Essai", arme: "Magie",
    actions: id === "EFF_LUMIERE" ? [{ effet: "EFF_ATTAQUE_MAGIQUE", crans: 2, sous_effets: [{ effet: id, crans: 2 }] }]
                                  : [{ effet: id, crans: 2 }, { effet: "EFF_SOIN", crans: 1 }] });
  for (const [nom, [classe, id, xpOk, xpTot]] of Object.entries(CLASSE)) {
    const debloque = await demande({ Classe: classe, XP: xpOk, Race: "Humain" }, planAvec(id));
    const fiche = debloque.fiches.find(f => f.id === id);
    verifier(`${classe} niv. ${xpOk ? 5 : 1} : ${nom} est dans la liste de LIA`, !!fiche, debloque.ids.length);
    verifier(`…marqué effet de classe, avec sa note`, !!fiche && !!fiche.effet_de_classe && !!fiche.notes, fiche && fiche.effet_de_classe);
    const pose = debloque.forge.actions.some(a => a.nom === nom || a.mods[nom]);
    verifier(`…et LIA peut le poser`, pose, JSON.stringify(debloque.forge.actions.map(a => [a.nom, a.mods])));

    if (xpTot !== null) {
      const tropTot = await demande({ Classe: classe, XP: xpTot, Race: "Humain" }, planAvec(id));
      verifier(`${classe} niv. 4 : ${nom} absent de la liste ET des règles`, !tropTot.ids.includes(id) && !tropTot.texte.includes(nom), tropTot.ids.length);
      const refuse = !tropTot.forge.actions.some(a => a.nom === nom || a.mods[nom]);
      verifier(`…et refusé s'il est demandé quand même`, refuse);
    }

    const autre = await demande({ Classe: "Hoplite", XP: 7900, Race: "Humain" }, planAvec(id));
    verifier(`Hoplite niv. 10 : pas de ${nom}`, !autre.ids.includes(id) && !autre.texte.includes(nom)
             && !autre.forge.actions.some(a => a.nom === nom || a.mods[nom]));
  }
}

{
  // Le Vampirisme : plus dans la liste de LIA, même pour un Vampire niveau 10.
  const ids = await p.evaluate(async ({ EFFETS }) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    window.__docs = { "Personnages/P1": { Classe: "Vampire", XP: 7900, Race: "Humain" }, "Caracteristiques/P1": { int: 15 } };
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    return window.LIA.catalogueEffets(window.LIA.armesPermises()).map(e => e.id);
  }, { EFFETS: EFFETS_PAR_ID });
  verifier("Vampire niv. 10 : plus de Vampirisme dans la liste de LIA (remplacé par le Baiser)", !ids.includes("EFF_VAMPIRISME"), ids.length);
}

console.log("\n9. LA MAGIE NE FAIT PLUS TOMBER LES SOUS-EFFETS DU MENU MAGIQUE");
// purgerIncompatibilitesArme retirait, en Magie, tout sous-effet rangé AUSSI en
// Physique : Lumière, Confusion, Peur, Empoisonnement… alors que le menu
// Magique les propose. Seuls les sous-effets purement physiques tombent.
{
  const r = await p.evaluate(async ({ EFFETS }) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    window.__docs = { "Personnages/P1": { Classe: "Chasseur de mages", XP: 2500, Race: "Humain" }, "Caracteristiques/P1": { int: 15 } };
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Arme polyvalente";
    window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE");
    window.forgeState.actions[0].mods = { EFF_LUMIERE: 1, EFF_CONFUSION: 1, EFF_ETOURDIT: 1 };
    window.selectionnerArme("Magie");
    window.fermerMenuAjoutForge();
    return Object.keys(window.forgeState.actions[0].mods);
  }, { EFFETS: EFFETS_PAR_ID });
  verifier("Lumière et Confusion (aussi Magique) restent en Magie", r.includes("EFF_LUMIERE") && r.includes("EFF_CONFUSION"), r.join(","));
  verifier("Étourdit (seulement Physique) tombe", !r.includes("EFF_ETOURDIT"), r.join(","));
}

console.log("\n10. DES NOMS COURTS, RÉALISTES ET PARLANTS");
{
  const n = await p.evaluate(() => {
    const { systeme, outil } = window.LIA.construireDemandeLIA("Je fends l'air d'un revers.", { puissance: 0, rapidite: 0 });
    const nom = window.LIA.nomDeTechnique;
    return { systeme, descNom: outil.functionDeclarations[0].parameters.properties.nom.description,
             cas: [nom("La Fureur Éternelle Des Cendres"), nom("« Flèche de givre. »"), nom("Taille croisée"),
                   nom("Le coup de bouclier du vieux gardien des portes de l'ouest"), nom(""), nom("Lame de Morgoth")] };
  });
  verifier("consigne : 1 à 3 mots (4 max), concret, ce que fait la technique", /1 à 3 mots/.test(n.systeme) && /4 au grand maximum/.test(n.systeme) && /Parlant et concret/.test(n.systeme));
  verifier("avec de bons exemples et les noms pompeux à éviter", /Taille croisée/.test(n.systeme) && /Fureur Éternelle/.test(n.systeme) && /pompeux/.test(n.systeme));
  verifier("le schéma de l'outil le redit (1 à 3 mots)", /1 à 3 mots/.test(n.descNom), n.descNom);
  verifier("Majuscules Partout et article retirés : « Fureur éternelle des cendres »", n.cas[0] === "Fureur éternelle des cendres", n.cas[0]);
  verifier("guillemets et point final retirés", n.cas[1] === "Flèche de givre", n.cas[1]);
  verifier("un bon nom reste tel quel", n.cas[2] === "Taille croisée", n.cas[2]);
  verifier("un nom à rallonge est coupé entre deux mots (≤ 32 car.)", n.cas[3].length <= 32 && !/\s(de|du|des)$/.test(n.cas[3]) && /^Coup de bouclier/.test(n.cas[3]), n.cas[3]);
  verifier("un nom vide ne laisse pas la Forge sans nom", n.cas[4].length > 0, n.cas[4]);
}

if (process.env.CAPTURE) {
  await ouvrir();
  await p.evaluate(() => { window.ouvrirAideForge(); document.getElementById("aide-forge-recit").value = "Je lève mon bâton, une tempête de cendres brûlantes s'abat autour de ma cible."; });
  await p.screenshot({ path: process.env.CAPTURE + "_popup.png" });
  await simulerGemini(PLAN);
  await p.evaluate(() => window.fermerAideForge());
  await creer("Je lève mon bâton, une tempête de cendres brûlantes s'abat autour de ma cible, puis un voile protecteur m'entoure.");
  await p.screenshot({ path: process.env.CAPTURE + "_forge.png" });
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
