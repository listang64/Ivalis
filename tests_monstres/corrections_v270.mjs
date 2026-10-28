// v270 — LE LOT DE NICO :
//   1. Paramètres > Outils > Butin : le tableau des raretés se règle, et
//      s'enregistre au bouton « Mettre à jour » ;
//   2. les déblocages par niveau : talent aux niveaux pairs (2 à 10),
//      compétence aux impairs (3 à 9), puis une compétence par niveau ;
//   3. les chiffres des jauges sous les pions restent DANS leur jauge, le plus
//      grand possible, quel que soit le zoom ;
//   4. étourdi, une technique ratée ne laisse pas sa zone au sol — et coûte
//      sa fatigue ;
//   5. l'Apparition 4 n'a plus de « pas de partage » ;
//   6. chaque monstre naît avec ±5 % sur chacune de ses stats ;
//   7. la piste d'initiative deux fois plus grande ;
//   8. les versions.
//
// Le cerveau (section 4) se lit en Node, avec son vrai code ; tout le reste
// sur la VRAIE page (index.html), Firestore remplacé par une mémoire.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');

// =========================================================================
titre("4. ÉTOURDI : LA TECHNIQUE RATÉE NE LAISSE RIEN AU SOL, ET COÛTE SA FATIGUE (vrai cerveau)");
// =========================================================================
{
  const { construireEtatCombat } = await import(path.join(RACINE, 'combat_etat.js'));
  const { appliquerIntention } = await import(path.join(RACINE, 'cerveau_combat.js'));
  const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  const monde = (graine) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_01", graine,
    combattants: [
      fiche("H1", { idJoueur: "P_01", camp: "Allié", prenom: "Naomi", Etats_Alteres: [{ nom: "Étourdi", duree: 2 }] }),
      fiche("M1", { estMonstre: true, camp: "Ennemi", prenom: "Goule" })
    ],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 2, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [{ idPersonnage: "H1" }, { idPersonnage: "M1" }] }
  });
  const ZONE = [{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 2, r: 1 }];
  const intention = { id: "I1", type: "carte", acteur: "H1", idCarte: "C_FEU", coutFatigue: 20,
    attaques: [{ nom: "Mur de flammes", valeurBrute: 15, typeRes: "Magique", element: "Feu", cibles: ["M1"] }],
    alterations: [], persistanceTerrain: true, zoneHexes: ZONE, zoneVisee: ZONE };
  let ratee = null, reussie = null;
  for (let g = 1; g <= 400 && (!ratee || !reussie); g++) {
    let pas = null;
    try { pas = appliquerIntention(monde(g), intention, null); } catch (e) { pas = null; }
    if (!pas || !pas.etat) continue;
    const etapes = pas.etapes || (pas.entree && pas.entree.etapes) || [];
    const echec = etapes.some(e => e.type === "echec" && e.acteur === "H1");
    if (echec && !ratee) ratee = { pas, etapes };
    if (!echec && !reussie) reussie = { pas, etapes };
  }
  verifier("un lancer étourdi finit par rater (20 %) — et un autre par passer", !!ratee && !!reussie);
  if (ratee) {
    const e = ratee.pas.etat;
    verifier("ratée : aucune zone ne reste au sol", Object.keys(e.zones || {}).length === 0, JSON.stringify(e.zones || {}));
    verifier("ratée : la goule n'a rien pris", e.combattants.M1.pv === 60, String(e.combattants.M1.pv));
    verifier("ratée : la fatigue est payée (100 → 80)", e.combattants.H1.fatigue === 80, String(e.combattants.H1.fatigue));
    verifier("ratée : l'écran le sait (étape fatigue, dépense 20)",
             ratee.etapes.some(x => x.type === "fatigue" && x.cible === "H1" && x.fatigueApres === 80 && x.depense === 20));
  }
  if (reussie) {
    const e = reussie.pas.etat;
    verifier("réussie : la zone reste au sol, et la fatigue est payée",
             Object.keys(e.zones || {}).length === 1 && e.combattants.H1.fatigue === 80, `${Object.keys(e.zones || {}).length} / ${e.combattants.H1.fatigue}`);
  }
}

// =========================================================================
//  La vraie page.
// =========================================================================
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
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
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ set(){}, update(){}, delete(){}, commit: async () => {} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="#c44"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true;
  window.__ou = (f, repli) => { try { return f(); } catch (e) { return repli; } };
});

// =========================================================================
titre("1. PARAMÈTRES > OUTILS > BUTIN : LE TABLEAU SE RÈGLE, « METTRE À JOUR » L'ENREGISTRE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    const sortie = {};
    sortie.bouton = !!document.querySelector('#etape-menu-outils #btn-table-butin');
    if (typeof window.ouvrirTableButin !== "function") return sortie;
    document.getElementById("etape-menu-outils").style.display = "block";
    window.ouvrirTableButin();
    sortie.cases = document.querySelectorAll('#corps-table-butin .butin-champ').length;
    sortie.majInactif = document.getElementById("btn-maj-table-butin").disabled;
    window.__ecrits = [];
    window.modifierCaseButin("1", "Petit", "Épique", 40);
    sortie.ecritAvantMaj = window.__ecrits.length;
    sortie.majActif = !document.getElementById("btn-maj-table-butin").disabled;
    sortie.totalFaux = /140 %/.test(document.getElementById("corps-table-butin").innerHTML);
    sortie.pasEncoreEnJeu = window.CHANCES_BUTIN_NIVEAU[1].Petit["Épique"] === 0;
    await window.mettreAJourTableButin();
    const ecrit = window.__ecrits.find(e => e.chemin === "Monstres_Modeles/_REGLAGES");
    sortie.ecrit = !!ecrit && !!ecrit.data.Butin_Niveaux && ecrit.options && ecrit.options.merge === true
      && ecrit.data.Butin_Niveaux[1].Petit["Épique"] === 40;
    sortie.enJeu = window.CHANCES_BUTIN_NIVEAU[1].Petit["Épique"] === 40;
    let epiques = 0;
    for (let i = 0; i < 4000; i++) if (window.tirerRareteButin(1, "Petit") === "Épique") epiques++;
    sortie.epiques = epiques / 40;
    sortie.message = document.getElementById("butin-reg-etat").textContent;
    // Un autre poste : le réglage arrive par le document des réglages.
    window.appliquerReglagesMonstres({ Butin_Niveaux: { 2: { Normal: { "Commun": 0, "Rare": 0, "Très rare": 0, "Épique": 100 } } } });
    sortie.autrePoste = window.CHANCES_BUTIN_NIVEAU[2].Normal["Épique"] === 100 && window.CHANCES_BUTIN_NIVEAU[1].Petit["Épique"] === 0;
    window.appliquerReglagesMonstres({ Bonus_Sorts_Pct: 5 });
    sortie.autreFamille = window.CHANCES_BUTIN_NIVEAU[2].Normal["Épique"] === 100;
    sortie.ligneVide = window.normaliserTableButin({ 3: { Petit: { "Commun": 0, "Rare": 0, "Très rare": 0, "Épique": 0 } } })[3].Petit["Commun"] === 75;
    sortie.borne = window.normaliserTableButin({ 3: { Petit: { "Commun": 250, "Rare": -4 } } })[3].Petit;
    window.__ecrits = [];
    await window.retablirTableButin();
    const efface = window.__ecrits.find(e => e.chemin === "Monstres_Modeles/_REGLAGES");
    sortie.retabli = !!efface && efface.data.Butin_Niveaux === "x" && window.CHANCES_BUTIN_NIVEAU[2].Normal["Épique"] === 5;
    window.fermerTableButin();
    return sortie;
  });
  verifier("un bouton « Butin » dans Paramètres > Outils", r.bouton === true);
  verifier("la fenêtre montre 80 cases (10 niveaux × Petit/Normal × 4 raretés)", r.cases === 80, `(${r.cases})`);
  verifier("« Mettre à jour » est grisé tant que rien n'a changé", r.majInactif === true);
  verifier("une case changée : rien n'est écrit, rien ne change en jeu", r.ecritAvantMaj === 0 && r.pasEncoreEnJeu === true);
  verifier("…« Mettre à jour » s'allume, le total faux (140 %) se voit", r.majActif === true && r.totalFaux === true);
  verifier("« Mettre à jour » écrit le tableau (_REGLAGES, Butin_Niveaux, en fusion)", r.ecrit === true);
  verifier("…et le tirage le suit aussitôt (40 / 140 ≈ 29 % d'Épique)", r.enJeu === true && Math.abs(r.epiques - 28.6) < 3, `(${r.epiques} %)`);
  verifier("…la fenêtre le dit", /Mis à jour/.test(r.message || ""), r.message);
  verifier("un autre poste reçoit le tableau par le document des réglages", r.autrePoste === true);
  verifier("un réglage d'une autre famille n'y touche pas", r.autreFamille === true);
  verifier("une ligne toute à zéro reprend celle de Nico", r.ligneVide === true);
  verifier("les cases sont bornées de 0 à 100", !!r.borne && r.borne["Commun"] === 100 && r.borne["Rare"] === 0, JSON.stringify(r.borne));
  verifier("« Rétablir » efface le réglage et revient au tableau de Nico", r.retabli === true);
}

// =========================================================================
titre("2. LES DÉBLOCAGES PAR NIVEAU (experience.js, talents.js)");
// =========================================================================
{
  const r = await p.evaluate(() => ({
    gains: Array.from({ length: 13 }, (_, i) => window.gainDuNiveau(i + 1)),
    comp: Array.from({ length: 13 }, (_, i) => window.competencesDeNiveau(i + 1)),
    talents: Array.from({ length: 13 }, (_, i) => window.pointsTalentsGagnes(i + 1)),
    niveaux: window.NIVEAUX_TALENT
  }));
  verifier("niveau 1 : la création du personnage", /cr[ée]ation/i.test(r.gains[0]), r.gains[0]);
  verifier("talent aux niveaux 2, 4, 6, 8, 10", [2, 4, 6, 8, 10].every(n => /talent/i.test(r.gains[n - 1])), JSON.stringify(r.gains));
  verifier("compétence aux niveaux 3, 5, 7, 9, puis 11, 12, 13", [3, 5, 7, 9, 11, 12, 13].every(n => /comp[ée]tence/i.test(r.gains[n - 1])));
  verifier("les compétences à créer suivent : 0,0,1,1,2,2,3,3,4,4,5,6,7", JSON.stringify(r.comp) === "[0,0,1,1,2,2,3,3,4,4,5,6,7]", JSON.stringify(r.comp));
  verifier("les points de talent suivent : 0,1,1,2,2,3,3,4,4,5,5,5,5", JSON.stringify(r.talents) === "[0,1,1,2,2,3,3,4,4,5,5,5,5]", JSON.stringify(r.talents));
  verifier("la fenêtre des talents annonce les niveaux 2, 4, 6, 8 et 10", /niveaux 2, 4, 6, 8 et 10/.test(lire('talents_ui.js')));
}

// =========================================================================
titre("3. LES CHIFFRES DES JAUGES : DANS LEUR JAUGE, LE PLUS GRAND POSSIBLE, À TOUT ZOOM");
// =========================================================================
{
  const mesures = [];
  await p.evaluate(() => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
    document.getElementById('fenetre-combat').style.display = 'block';
    window.initialiserPlateau();
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 1250, PV_Actuels: 1234, Fatigue_Max: 120, fatigueActuelle: 87, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 4, r: 3, taille: 55 } };
  });
  for (const echelle of [0.5, 1, 2.5]) {
    mesures.push(await p.evaluate(async (echelle) => {
      window.VTT_SCALE = echelle; window.appliquerTransformPlateau();
      window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
      window.selectionnerEtCentrerPerso("H1");
      await new Promise(r => setTimeout(r, 300));
      window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
      await new Promise(r => setTimeout(r, 200));
      return [...document.querySelectorAll('.jauge-selection-chiffre')].map(x => {
        const rg = document.createRange(); rg.selectNodeContents(x); const t = rg.getBoundingClientRect();
        const jauge = x.parentElement, j = jauge.getBoundingClientRect();
        // La place utile : l'intérieur de la barre, sans sa bordure (1 px, qui
        // ne grandit pas avec le zoom).
        const utileH = j.height * (jauge.clientHeight / Math.max(1, jauge.offsetHeight));
        const utileL = j.width * (jauge.clientWidth / Math.max(1, jauge.offsetWidth));
        return { echelle, texteL: t.width, texteH: t.height, jaugeL: j.width, jaugeH: j.height, utileH, utileL,
                 enLigne: x.style.fontSize, car: x.style.getPropertyValue("--nb-car") };
      });
    }, echelle));
  }
  const toutes = mesures.flat();
  verifier("deux chiffres par pion, à chaque zoom", toutes.length === 6, `(${toutes.length})`);
  verifier("à chaque zoom, le texte tient dans sa jauge (largeur et hauteur)",
           toutes.length > 0 && toutes.every(m => m.texteL <= m.jaugeL + 0.5 && m.texteH <= m.jaugeH + 0.5),
           toutes.map(m => `${m.echelle}:${m.texteL.toFixed(0)}/${m.jaugeL.toFixed(0)}×${m.texteH.toFixed(1)}/${m.jaugeH.toFixed(1)}`).join(" "));
  // (À 0,5×, la barre ne fait que 4 px de haut, dont 2 de bordure : on juge
  // la place utile aux zooms où il y en a.)
  const lisibles = toutes.filter(m => m.echelle >= 1);
  verifier("…et il en occupe l'essentiel (≥ 80 % de la hauteur utile, ou ≥ 85 % de sa largeur)",
           lisibles.length === 4 && lisibles.every(m => m.texteH >= 0.8 * m.utileH || m.texteL >= 0.85 * m.utileL),
           lisibles.map(m => `${m.echelle}:${(m.texteH / m.utileH * 100).toFixed(0)} %`).join(" "));
  const vie = mesures.map(l => l[0] || {});
  verifier("il grandit avec la jauge quand on zoome (même proportion de la place utile)",
           vie.length === 3 && vie[2].texteH > vie[1].texteH && vie[1].texteH >= vie[0].texteH
           && Math.abs(vie[2].texteH / vie[2].utileH - vie[1].texteH / vie[1].utileH) < 0.12,
           vie.map(m => (m.texteH / m.utileH).toFixed(2)).join(" / "));
  verifier("plus de taille en dur : la feuille de style la tire de la jauge", toutes.every(m => !m.enLigne && Number(m.car) > 0)
           && /container-type:\s*size/.test(lire('style.css')) && /cqh/.test(lire('style.css')));
}

// =========================================================================
titre("5. L'APPARITION 4 N'A PLUS DE « PAS DE PARTAGE »");
// =========================================================================
{
  const r = await p.evaluate(() => {
    const t = window.normaliserTableApparitions(null);
    const butins = (t[4].cas || []).filter(c => c.butin).map(c => c.butin);
    const ancien = window.normaliserTableApparitions({ 4: { cas: [{}, {}, { butin: { parJoueur: 2, partage: false, xpPct: -10 } }] } });
    const host = document.getElementById("corps-rencontres-monstres");
    window.dessinerTableRencontres();
    const plan = window.composerButin({ creatures: Array.from({ length: 7 }, (_, i) => ({ id: "M" + i, stature: "Petit", leader: i === 0 })),
                                        participants: ["J1", "J2", "J3"], parHeros: 2, niveau: 1 });
    return { butins, ancienPartage: "partage" in (((ancien[4].cas || [])[2] || {}).butin || {}),
             texte: host ? host.textContent : "", commun: plan.commun.length };
  });
  verifier("les trois cohues gardent 2 objets par joueur et leur −10/−20/−30 % d'XP",
           r.butins.length === 3 && r.butins.every(x => x.parJoueur === 2) && JSON.stringify(r.butins.map(x => x.xpPct)) === "[-10,-20,-30]");
  verifier("…sans plus aucun « partage » dans le tableau", r.butins.every(x => !("partage" in x)));
  verifier("un ancien réglage enregistré avec « partage: false » le perd", r.ancienPartage === false);
  verifier("le menu Apparitions ne dit plus « pas de partage »", r.texte.length > 0 && !/pas de partage/i.test(r.texte));
  verifier("le code non plus (apparitions.js, loot.js)", !/partage/.test(lire('apparitions.js')) && !/sansPartage|partage === false/.test(lire('loot.js')));
  verifier("une cohue de 7 créatures avec un leader : surplus + bonus à la mise en commun", r.commun === 2, `(${r.commun})`);
}

// =========================================================================
titre("6. CHAQUE MONSTRE NAÎT AVEC ±5 % SUR CHACUNE DE SES STATS");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.NIVEAU_GROUPE = 1;
    window.ID_PARTIE_COURANTE = "P1";
    const gabarit = { Cle: "dps_cac__normal", Archetype: "DPS CAC", Palier: "Normal", PV: 200, Res_Physique: 40, Res_Magique: 60,
                      Parade_Esquive: 40, Fatigue_Max: 120, Regeneration: 30, Repos_Long: 90, Nombre_Actions: 1, XP_Groupe: 100 };
    const fiches = [];
    for (let i = 0; i < 60; i++) {
      const d = await window.creerMonstreDepuisGabarit("MONSTRE_T" + i, gabarit, { Initiative: 100, Critique: 20 });
      if (d) fiches.push(d);
    }
    const leader = await window.creerMonstreDepuisGabarit("MONSTRE_L", gabarit, { ...window.champsLeader(gabarit), Initiative: 100, Critique: 20 });
    return { fiches, leader, triche: window.tricheMonstresActuelle(), pvLeaderBase: window.champsLeader(gabarit).PV_Max };
  });
  const base = { PV_Max: 200 + r.triche, Fatigue_Max: 120, Def_Physique: 40, Def_Magique: 60, Esquive: 40, Parade: 40,
                 Regeneration: 30, Repos_Long: 90, Initiative: 100, Critique: 20 };
  const dansLaFourchette = (v, b) => v >= Math.floor(b * 0.95) && v <= Math.ceil(b * 1.05);
  const horsFourchette = [];
  r.fiches.forEach(f => Object.keys(base).forEach(k => { if (!dansLaFourchette(f[k], base[k])) horsFourchette.push(`${k}=${f[k]}`); }));
  verifier("60 créatures : chaque stat reste entre −5 % et +5 %", r.fiches.length === 60 && horsFourchette.length === 0, horsFourchette.slice(0, 4).join(" "));
  const variees = Object.keys(base).filter(k => new Set(r.fiches.map(f => f[k])).size > 2);
  verifier("…et chacune varie vraiment d'une créature à l'autre", variees.length === Object.keys(base).length, variees.join(","));
  const independantes = r.fiches.filter(f => f.Def_Physique / 40 !== f.Def_Magique / 60).length;
  verifier("…chaque stat tire son propre écart", independantes > 20, `(${independantes}/60)`);
  verifier("elle entre en pleine forme (PV et énergie au plein)", r.fiches.every(f => f.PV_Actuels === f.PV_Max && f.Fatigue_Actuelle === f.Fatigue_Max));
  verifier("son XP et son nombre d'actions ne bougent pas", r.fiches.every(f => f.XP_Groupe === 100 && f.Nombre_Actions === 1));
  verifier("les écarts tirés restent sur la fiche (Variation_Stats, en %)",
           r.fiches.every(f => f.Variation_Stats && Object.values(f.Variation_Stats).every(v => Math.abs(v) <= 5)));
  verifier("un leader aussi, sur ses PV de leader", !!r.leader && dansLaFourchette(r.leader.PV_Max, r.pvLeaderBase) && !!r.leader.Variation_Stats,
           r.leader ? `${r.leader.PV_Max} pour ${r.pvLeaderBase}` : "");
}

// =========================================================================
titre("7. LA PISTE D'INITIATIVE, DEUX FOIS PLUS GRANDE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    const h = (id, camp) => ({ idPersonnage: id, prenom: id, camp, PV_Max: 60, PV_Actuels: 41, Fatigue_Max: 100, fatigueActuelle: 70, Etats_Alteres: [], statut: "Vivant" });
    window.PERSOS_PARTIE = [h("H1", "Allié"), h("H2", "Allié"), h("M1", "Ennemi")];
    window.PARTIE_DATA = Object.assign(window.PARTIE_DATA || {}, { Tour_Combat: 2, Phase_Combat: "Preparation", Ordre_Initiative: ["H1", "M1", "H2"], File_Attente_Combat: [] });
    window.PISTE_MANCHE = { manche: 0, ordre: [] };
    window.afficherPisteInitiative([], "Preparation");
    await new Promise(r => setTimeout(r, 600));
    const piste = document.getElementById("piste-initiative");
    const tuile = piste.querySelector(".piste-tuile").getBoundingClientRect();
    const boite = piste.getBoundingClientRect();
    const sortie = { echelle: window.ECHELLE_PISTE_INITIATIVE, tuileL: tuile.width, tuileH: tuile.height,
                     largeurDessin: parseFloat(piste.style.width), largeurEcran: boite.width, gauche: boite.left, droite: boite.right };
    // Beaucoup de monde : elle se resserre, et ne sort jamais de l'écran.
    window.PERSOS_PARTIE = Array.from({ length: 14 }, (_, i) => h("X" + i, i % 2 ? "Allié" : "Ennemi"));
    window.PARTIE_DATA.Ordre_Initiative = window.PERSOS_PARTIE.map(x => x.idPersonnage);
    window.PISTE_MANCHE = { manche: 0, ordre: [] };
    window.afficherPisteInitiative([], "Preparation");
    await new Promise(r => setTimeout(r, 600));
    const pleine = piste.getBoundingClientRect();
    sortie.pleineGauche = pleine.left; sortie.pleineDroite = pleine.right; sortie.largeurFenetre = window.innerWidth;
    return sortie;
  });
  verifier("l'échelle de la piste est 2", r.echelle === 2);
  verifier("un portrait mesure 136 × 156 à l'écran (68 × 78 avant)", Math.abs(r.tuileL - 136) < 1 && Math.abs(r.tuileH - 156) < 1, `${r.tuileL} × ${r.tuileH}`);
  verifier("la piste entière double à l'écran", Math.abs(r.largeurEcran - 2 * r.largeurDessin) < 1, `${r.largeurEcran} pour ${r.largeurDessin}`);
  verifier("à 14 combattants, elle se resserre et reste dans l'écran", r.pleineGauche >= 0 && r.pleineDroite <= r.largeurFenetre,
           `${r.pleineGauche.toFixed(0)} → ${r.pleineDroite.toFixed(0)} / ${r.largeurFenetre}`);
}

// =========================================================================
titre("8. LES VERSIONS");
// =========================================================================
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json')).version;
  verifier("version 270 ou plus (trace_combat.js, version.json)", vTrace >= 270 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (nom) => Number((html.match(new RegExp('[/"]' + nom.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  const attendu = { "combat.js": 154, "cerveau_combat.js": 62, "moteur_pur.js": 69, "monstres.js": 42, "loot.js": 31, "objets.js": 20,
                    "apparitions.js": 2, "experience.js": 3, "talents.js": 5, "talents_ui.js": 2 };
  const enRetard = Object.keys(attendu).filter(f => !(v(f) >= attendu[f]));
  verifier("chaque fichier touché a changé de version", enRetard.length === 0, enRetard.join(", "));
  verifier("style.css aussi", /style\.css\?v=(\d+)/.test(html) && Number(html.match(/style\.css\?v=(\d+)/)[1]) >= 101);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
