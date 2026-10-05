// L'ILLUSTRATION DES COMPÉTENCES.
//
// Nico : « quand une compétence vient d'être créée, une IA de base analyse le
// titre, les effets, le texte RP s'il y en a un, la race et le genre du
// personnage, et écrit un prompt pour l'IA d'image (mêmes paramètres que les
// tokens) : qu'on voie le personnage mis en scène en train d'exécuter sa
// technique. On envoie aussi, en binaire, la photo du personnage et ses armes
// (une arme à deux mains une seule fois). L'image se place en haut de la carte.
// Un bouton provisoire dans l'onglet Compétences pour régler la taille et la
// position de l'image, et un bouton pour extraire le code. Si l'IA est
// saturée, mettre en file jusqu'à résolution. »
//
// Ce banc joue la vraie page : Gemini, OpenAI et Cloudinary sont simulés, et
// OpenAI répond d'abord « 429 » pour voir la file tenir bon.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); (window.__docs = window.__docs || {})[ref.chemin] = JSON.parse(JSON.stringify(data)); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); const d = (window.__docs = window.__docs || {}); d[ref.chemin] = { ...(d[ref.chemin] || {}), ...data }; };
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
const HACHE = { nom: "Hache à deux mains", modele: "Hache à deux mains", type: "Arme lourde CAC", uid: "U1",
                deuxMains: true, image: "https://res.cloudinary.com/x/hache.png" };
const PERSO = { Prenom_Personnage: "Aelis", Race: "Elfe", Genre: "Femme", Classe: "Hoplite", XP: 0,
                URL_Cloudinary: "https://res.cloudinary.com/x/ref.png", URL_Avatar_Equipe: "https://res.cloudinary.com/x/avatar.png",
                Equip_Main_Droite: HACHE, Equip_Main_Gauche: HACHE };

// Les trois services simulés, installés avant tout script de la page : la file
// reprend toute seule au démarrage, il faut que les faux soient déjà là.
await p.addInitScript(({ PERSO }) => {
  localStorage.setItem("ivalis_GEMINI_API_KEY", "g"); localStorage.setItem("ivalis_OPENAI_API_KEY", "o");
  localStorage.setItem("ivalis_CLOUDINARY_CLOUD_NAME", "c"); localStorage.setItem("ivalis_CLOUDINARY_API_KEY", "k"); localStorage.setItem("ivalis_CLOUDINARY_API_SECRET", "s");
  window.__faux = { openai: [], gemini: [], cloud: [], blobs: [], statutsOpenAI: [] };
  const vraiFetch = window.fetch.bind(window);
  const repondre = (corps, statut = 200) => new Response(typeof corps === "string" ? corps : JSON.stringify(corps),
                                                         { status: statut, headers: { "Content-Type": "application/json" } });
  window.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes("generativelanguage")) {
      window.__faux.gemini.push(JSON.parse(options.body));
      return repondre({ candidates: [{ content: { parts: [{ functionCall: { name: "ecrirePromptImage",
        args: { prompt: "PROMPT-MIA: the elf warrior from image 1 swings her great axe in a wide arc, shattering the ground." } } }] } }] });
    }
    if (url.includes("api.openai.com")) {
      const form = options.body;
      const entree = { url, statut: 0 };
      if (form instanceof FormData) {
        entree.model = form.get("model"); entree.prompt = form.get("prompt"); entree.size = form.get("size");
        entree.quality = form.get("quality"); entree.format = form.get("output_format");
        entree.images = form.getAll("image[]").map(f => f.name);
      }
      const statut = window.__faux.statutsOpenAI.length ? window.__faux.statutsOpenAI.shift() : 200;
      entree.statut = statut;
      window.__faux.openai.push(entree);
      if (statut !== 200) return repondre({ error: { message: "Rate limit" } }, statut);
      // Un vrai PNG carré 1024 × 1024, comme l'IA le rend : trois bandes
      // (haut bleu, milieu rouge, bas vert) pour voir le recadrage.
      const c = document.createElement("canvas"); c.width = 1024; c.height = 1024;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0000ff"; ctx.fillRect(0, 0, 1024, 1024);
      ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 90, 1024, 844);
      ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 934, 1024, 90);
      return repondre({ data: [{ b64_json: c.toDataURL("image/png").split(",")[1] }] });
    }
    if (url.includes("api.cloudinary.com")) {
      window.__faux.cloud.push({ dossier: options.body.get("folder"), fichier: options.body.get("file") });
      return repondre({ secure_url: "https://res.cloudinary.com/x/image/upload/Competences/illu_" + window.__faux.cloud.length + ".png", public_id: "p" });
    }
    return vraiFetch(url, options);
  };
  // Les images de référence (Cloudinary) ne se lisent pas ici : on garde ce
  // qui est demandé, et on rend un petit PNG.
  const faux = async (url, fond) => { window.__faux.blobs.push({ url, fond }); return new Blob(["png"], { type: "image/png" }); };
  Object.defineProperty(window, "imageVersBlobPng", { get: () => faux, set: () => {}, configurable: true });
  window.__docs = { "Personnages/P1": PERSO, "Caracteristiques/P1": { force: 14, con: 12 },
                    // Le style du jeu, en paramètre (le même que pour la création des persos).
                    "Cerveau_IA/INST_76839": { Contenu_Direct: "STYLE-TEST : gravure à l'encre sépia, hachures fines, aplats de lavis." } };
}, { PERSO });

await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
// L'IMAGE DE LA CARTE, comme la vraie : un cadre opaque (or) percé d'une
// fenêtre transparente en haut (10 → 90 % de large, 12 → 46 % de haut).
// C'est la vraie image de la carte (réduite), donnée par Nico.
const CADRE_CARTE = fs.readFileSync('/home/user/Ivalis/tests_monstres/cadre_carte_competence.png');
await p.route('**competance_carte**', r => r.fulfill({ contentType: 'image/png', headers: {'Access-Control-Allow-Origin':'*'}, body: CADRE_CARTE }));
// Les illustrations : un aplat rouge pur, pour le reconnaître au pixel.
await p.route('**/x/image/upload/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#ff0000"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => { window.DELAIS_ILLUSTRATION = [80, 80, 80]; });

const attendreFileVide = () => p.waitForFunction(() => {
  try { return JSON.parse(localStorage.getItem("ivalis_illustrations_en_attente") || "[]").length === 0; } catch (e) { return false; }
}, null, { timeout: 15000 });

console.log("1. UNE COMPÉTENCE FORGÉE PART EN ILLUSTRATION");
await p.evaluate(async ({ EFFETS }) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.chargerOngletCompetences = async () => {};
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Arme lourde CAC";
  window.ajouterComposantPrincipal("EFF_ATTAQUE_LOURDE");
  window.forgeState.recitRP = "Je fais tournoyer ma hache et fends le sol devant moi.";
  document.getElementById("forge-nom").value = "Fendoir des cimes";
  window.rafraichirForge();
  // Deux 429 d'abord : l'IA d'image est saturée.
  window.__faux.statutsOpenAI = [429, 429];
  await window.sauvegarderCompetence();
}, { EFFETS: EFFETS_PAR_ID });
const enFile = await p.evaluate(() => JSON.parse(localStorage.getItem("ivalis_illustrations_en_attente") || "[]"));
verifier("la compétence est mise en file dès sa création", enFile.length === 1 && enFile[0].idPerso === "P1" && /Fendoir/.test(enFile[0].nom), JSON.stringify(enFile));
await attendreFileVide();
const f = await p.evaluate(() => window.__faux);
const ecrit = await p.evaluate(() => (window.__ecrits || []).find(e => /Competences/.test(e.chemin)));
const idComp = ecrit.chemin.split("/").pop();

console.log("\n2. L'IA DE PROMPT REÇOIT CE QU'IL FAUT");
const g = f.gemini[0];
const texteG = g ? g.contents[0].parts[0].text : "";
verifier("le titre de la compétence", /Fendoir des cimes/.test(texteG));
verifier("ses effets", /Attaque lourde/.test(texteG), texteG.split("\n").find(l => /Attaque/.test(l)));
verifier("le récit RP", /fends le sol/.test(texteG));
verifier("la race et le genre du personnage", /RACE : Elfe/.test(texteG) && /GENRE : Femme/.test(texteG));
verifier("consigne de cadrage : format paysage 5:4, action dans la bande centrale", /5:4/.test(g.systemInstruction.parts[0].text)
         && /bande centrale/.test(g.systemInstruction.parts[0].text));
verifier("consigne : mettre CE personnage en scène, sans texte ni cadre", /exécuter la technique/.test(g.systemInstruction.parts[0].text)
         && /aucun texte/.test(g.systemInstruction.parts[0].text));

console.log("\n3. L'IA D'IMAGE : MÊMES RÉGLAGES QUE LES PIONS, PORTRAIT ET ARMES EN BINAIRE");
const ok = f.openai.filter(o => o.statut === 200);
const o = ok[0] || {};
verifier("le prompt envoyé contient la scène de l'IA de prompt", /PROMPT-MIA/.test(o.prompt || ""), o.prompt);

console.log("\n3 bis. LE STYLE DES PARAMÈTRES, COMME POUR LA CRÉATION DES PERSOS");
const srcApp = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
verifier("(la création de perso injecte bien « Directives de style artistique obligatoires : »)",
         srcApp.includes('"Directives de style artistique obligatoires : " + instructionSupplementaire'));
verifier("l'IA de prompt connaît le style", /STYLE-TEST : gravure à l'encre sépia/.test(g.systemInstruction.parts[0].text));
verifier("…et l'IA d'image le reçoit MOT POUR MOT, dans les mêmes termes",
         (o.prompt || "").includes("Directives de style artistique obligatoires : STYLE-TEST : gravure à l'encre sépia, hachures fines, aplats de lavis."), o.prompt);
verifier("avec le contexte de l'univers des portraits (Antique Fantastique)", (o.prompt || "").includes("Contexte de l'univers : Antique Fantastique"));
verifier("gpt-image-2, 1024×1024, qualité basse, PNG (comme les pions)", o.model === "gpt-image-2" && o.size === "1024x1024" && o.quality === "low" && o.format === "png",
         `${o.model} ${o.size} ${o.quality} ${o.format}`);
verifier("en édition, avec les images de référence", /images\/edits/.test(o.url || ""));
verifier("le personnage d'abord, puis l'arme : la hache à deux mains UNE fois", JSON.stringify(o.images) === JSON.stringify(["personnage.png", "arme_1.png"]), JSON.stringify(o.images));
verifier("le portrait envoyé est l'avatar équipé, la hache est son image", f.blobs[0].url === "https://res.cloudinary.com/x/avatar.png" && f.blobs[1].url === HACHE.image,
         f.blobs.map(b => b.url).join(" , "));
verifier("sur fond neutre (pas le magenta des pions)", f.blobs.every(b => b.fond && b.fond.toUpperCase() !== "#FF00FF"), f.blobs.map(b => b.fond).join());

console.log("\n4. SATURÉE : LA COMMANDE ATTEND EN FILE, PUIS PASSE");
verifier("deux refus 429, puis la réussite", f.openai.map(x => x.statut).join() === "429,429,200", f.openai.map(x => x.statut).join());
verifier("…sans redemander le prompt ni relire les images à chaque essai", f.gemini.length === 1 && f.blobs.length === 2, `${f.gemini.length} prompt(s), ${f.blobs.length} image(s) lue(s)`);
verifier("une seule image hébergée, dans Competences", f.cloud.length === 1 && f.cloud[0].dossier === "Competences", f.cloud.map(c => c.dossier).join());

console.log("\n4 bis. UN SEUL FORMAT : 1000 × 800 (5:4), CELUI DE LA FENÊTRE DE LA CARTE");
const envoi = await p.evaluate(async (fichier) => {
  const img = new Image(); img.src = fichier; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const couleur = (y) => Array.from(ctx.getImageData(img.width / 2, y, 1, 1).data.slice(0, 3));
  return { l: img.width, h: img.height, type: fichier.slice(5, fichier.indexOf(";")), haut: couleur(5), milieu: couleur(img.height / 2) };
}, f.cloud[0].fichier);
verifier("le carré de l'IA est recadré à 1000 × 800 avant l'envoi", envoi.l === 1000 && envoi.h === 800, `${envoi.l}×${envoi.h} ${envoi.type}`);
verifier("…au centre (la bande du haut est rognée)", envoi.milieu[0] > 200 && envoi.haut[2] < 60, JSON.stringify(envoi));
const docComp = await p.evaluate((id) => window.__docs["Personnages/P1/Competences/" + id], idComp);
verifier("l'adresse est écrite sur la compétence (URL_Image)", /illu_1/.test(docComp.URL_Image || "") && /q_auto,f_auto/.test(docComp.URL_Image), docComp.URL_Image);
verifier("Cloudinary livre toujours en 1000 × 800 (c_fill)", /c_fill,g_center,w_1000,h_800/.test(docComp.URL_Image || ""), docComp.URL_Image);
verifier("avec le prompt qui l'a faite (Prompt_Image), style compris", /PROMPT-MIA/.test(docComp.Prompt_Image || "") && /STYLE-TEST/.test(docComp.Prompt_Image || ""));
verifier("la file est vide, le sceau a disparu", !(await p.evaluate(() => !!document.getElementById("badge-illustrations"))));

console.log("\n5. L'IMAGE EST EN HAUT DE LA CARTE");
const carte = await p.evaluate(async ({ id, data }) => {
  window.COMPETENCES_CACHE[id] = data;
  window.afficherApercuCarteHD(id);
  const c = document.getElementById("apercu-carte-hd-competence");
  const cadre = c.querySelector(".illustration-carte-hd");
  const img = cadre && cadre.querySelector("img");
  const rc = c.getBoundingClientRect(), ri = cadre && cadre.getBoundingClientRect();
  const fond = c.querySelector('img[src*="competance_carte"]');
  return { src: img && img.getAttribute("src"), z: cadre && getComputedStyle(cadre).zIndex, zCadre: fond && getComputedStyle(fond).zIndex,
           avantLeCadre: !!(cadre && fond && (cadre.compareDocumentPosition(fond) & Node.DOCUMENT_POSITION_FOLLOWING)),
           hautRel: ri ? (ri.top - rc.top) / rc.height : null, basRel: ri ? (ri.bottom - rc.top) / rc.height : null };
}, { id: idComp, data: docComp });
verifier("la carte montre l'illustration", carte.src === docComp.URL_Image, carte.src);
verifier("dans la moitié haute de la carte", carte.hautRel >= 0 && carte.basRel <= 0.55, `${carte.hautRel && carte.hautRel.toFixed(2)} → ${carte.basRel && carte.basRel.toFixed(2)}`);
verifier("sous l'image de la carte (z-index et ordre)", Number(carte.z) < Number(carte.zCadre) && carte.avantLeCadre, `${carte.z} < ${carte.zCadre}`);

// LE VRAI TEST : ce que l'œil voit, avec la VRAIE image de la carte.
await p.waitForTimeout(400);
// On compare la capture à la transparence de l'image de la carte elle-même,
// sur une grille qui couvre le haut de la carte : partout où la carte est
// TRANSPARENTE (la fenêtre), on doit voir l'illustration (rouge pur) — aucun
// liseré vide ; partout où elle est OPAQUE (bords, médaillon d'initiative,
// plaque vissée), on doit voir la carte, pas l'illustration.
const grille = await (async () => {
  // Le texte de la carte (titre, initiative, fatigue, effets) est posé
  // par-dessus tout : on le masque le temps de la photo.
  await p.evaluate(() => document.querySelectorAll("#apercu-carte-hd-competence > div").forEach(d => {
    if (getComputedStyle(d).zIndex === "3" && !d.classList.contains("illustration-carte-hd")) d.style.visibility = "hidden"; }));
  const boite = await p.evaluate(() => { const r = document.getElementById("apercu-carte-hd-competence").getBoundingClientRect();
                                         return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const png = (await p.screenshot({ clip: boite })).toString("base64");
  return p.evaluate(async ({ png, cadre }) => {
    const charger = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
    const capture = await charger("data:image/png;base64," + png);
    const W = capture.width, H = capture.height;
    const lire = (img) => { const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; };
    const ecran = lire(capture), carte = lire(await charger("data:image/png;base64," + cadre));
    const a = (x, y) => carte[(y * W + x) * 4 + 3];
    const uniforme = (x, y, val) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (a(x + dx, y + dy) !== val) return false; return true; };
    let fenetre = 0, fenetreRouge = 0, opaque = 0, opaqueIntact = 0;
    const fautes = [];
    for (let fy = 0.04; fy <= 0.56; fy += 0.01) for (let fx = 0.08; fx <= 0.92; fx += 0.01) {
      const x = Math.round(fx * W), y = Math.round(fy * H), i = (y * W + x) * 4;
      const rgb = [ecran[i], ecran[i + 1], ecran[i + 2]];
      if (uniforme(x, y, 0)) {
        fenetre++;
        if (rgb[0] > 220 && rgb[1] < 40 && rgb[2] < 40) fenetreRouge++; else if (fautes.length < 4) fautes.push(["fenêtre", fx.toFixed(2), fy.toFixed(2), rgb]);
      } else if (uniforme(x, y, 255)) {
        opaque++;
        const ecart = Math.abs(rgb[0] - carte[i]) + Math.abs(rgb[1] - carte[i + 1]) + Math.abs(rgb[2] - carte[i + 2]);
        if (ecart < 30) opaqueIntact++; else if (fautes.length < 8) fautes.push(["cadre", fx.toFixed(2), fy.toFixed(2), rgb]);
      }
    }
    return { fenetre, fenetreRouge, opaque, opaqueIntact, fautes };
  }, { png, cadre: CADRE_CARTE.toString("base64") });
})();
verifier("l'illustration remplit TOUTE la fenêtre transparente du haut", grille.fenetre > 500 && grille.fenetreRouge === grille.fenetre,
         `${grille.fenetreRouge}/${grille.fenetre} ${JSON.stringify(grille.fautes.filter(f => f[0] === "fenêtre"))}`);
verifier("la carte (bords, médaillon, plaque) la recouvre partout ailleurs", grille.opaque > 200 && grille.opaqueIntact === grille.opaque,
         `${grille.opaqueIntact}/${grille.opaque} ${JSON.stringify(grille.fautes.filter(f => f[0] === "cadre"))}`);
const ratio = await p.evaluate(() => { const c = document.querySelector("#apercu-carte-hd-competence .illustration-carte-hd").getBoundingClientRect(); return c.width / c.height; });
verifier("la zone de l'image a le format de la fenêtre (≈ 5:4)", Math.abs(ratio - 1.25) < 0.05, ratio.toFixed(3));

console.log("\n6. LE BOUTON PROVISOIRE : RÉGLER, PUIS EXTRAIRE LE CODE");
const reglage = await p.evaluate(async () => {
  const bouton = document.querySelector("#onglet-competences #btn-reglage-illustration");
  bouton.click();
  const panneau = document.getElementById("panneau-reglage-illustration");
  const curseur = (cle) => panneau.querySelector(`input[data-cle="${cle}"]`);
  curseur("haut").value = 15; curseur("haut").dispatchEvent(new Event("input"));
  curseur("hauteur").value = 30; curseur("hauteur").dispatchEvent(new Event("input"));
  curseur("zoom").value = 130; curseur("zoom").dispatchEvent(new Event("input"));
  const cadre = document.querySelector("#apercu-carte-hd-competence .illustration-carte-hd");
  const enDirect = { top: cadre.style.top, height: cadre.style.height, zoom: cadre.querySelector("img").style.transform };
  const devant = { caseExiste: !!panneau.querySelector('input[data-cle="devant"]'), z: cadre.style.zIndex };
  panneau.querySelector('[data-action="extraire"]').click();
  const code = panneau.querySelector(".reglage-illu-code").value;
  return { bouton: !!bouton, ouvert: panneau.style.display === "block", enDirect, devant, code,
           curseurs: [...panneau.querySelectorAll("input[type=range]")].map(i => i.dataset.cle) };
});
verifier("le bouton est dans l'onglet Compétences de la fiche", reglage.bouton && reglage.ouvert);
verifier("curseurs : position, taille, cadrage, zoom, arrondi", ["haut", "gauche", "largeur", "hauteur", "cadrageX", "cadrageY", "zoom", "arrondi"].every(c => reglage.curseurs.includes(c)), reglage.curseurs.join());
verifier("la carte ouverte suit le réglage en direct", reglage.enDirect.top === "15%" && reglage.enDirect.height === "30%" && /1\.3/.test(reglage.enDirect.zoom), JSON.stringify(reglage.enDirect));
verifier("aucun réglage ne fait passer l'image devant la carte", !reglage.devant.caseExiste && reglage.devant.z === "1", JSON.stringify(reglage.devant));
let lu = null;
try { lu = JSON.parse(reglage.code.replace(/^window\.REGLAGE_ILLUSTRATION_DEFAUT = /, "").replace(/;$/, "")); } catch (e) {}
verifier("« Extraire le code » donne le réglage complet, prêt à coller", !!lu && lu.haut === 15 && lu.hauteur === 30 && lu.zoom === 130 && !("devant" in lu), reglage.code);
const ancien = await p.evaluate(() => {
  localStorage.setItem("ivalis_reglage_illustration_carte", JSON.stringify({ haut: 10, devant: true }));
  const z = window.styleIllustrationCarte(window.reglageIllustrationCarte()).cadre.match(/z-index: (\d+)/)[1];
  localStorage.removeItem("ivalis_reglage_illustration_carte");
  return z;
});
verifier("un ancien réglage « devant » est ignoré : l'image reste dessous", ancien === "1", ancien);
const gabarit = await p.evaluate(() => {
  window.COMPETENCES_CACHE["SANS_IMAGE"] = { Nom: "Sans image", Effets_Compiles: [], Composants: { actions: [] } };
  window.afficherApercuCarteHD("SANS_IMAGE");
  const avec = !!document.querySelector("#apercu-carte-hd-competence .illustration-gabarit");
  window.fermerReglageIllustration();
  window.afficherApercuCarteHD("SANS_IMAGE");
  return { avec, sans: !!document.querySelector("#apercu-carte-hd-competence .illustration-carte-hd") };
});
verifier("pendant le réglage, une carte sans image montre la zone (gabarit)", gabarit.avec);
verifier("réglage fermé : rien sur une carte sans image", !gabarit.sans);
await p.evaluate(() => localStorage.removeItem("ivalis_reglage_illustration_carte"));

console.log("\n7. MAGIE ET SANS ARME : PAS D'ARME DE RÉFÉRENCE ; LA FILE SURVIT À UN RECHARGEMENT");
// Deux commandes laissées en file (la page s'est fermée avant), qui reprennent
// toutes seules au démarrage suivant.
await p.evaluate(() => {
  window.__docs["Personnages/P1/Competences/C_MAGIE"] = { Nom: "Rayon", Arme: "Magie", Effets_Compiles: [{ nom: "Attaque Magique", desc: "3 dégâts magique" }] };
  window.__docs["Personnages/P1/Competences/C_POING"] = { Nom: "Coup de coude", Arme: "Sans arme / Arme rp", Effets_Compiles: [] };
  localStorage.setItem("ivalis_illustrations_en_attente", JSON.stringify([
    { idPerso: "P1", idComp: "C_MAGIE", nom: "Rayon" }, { idPerso: "P1", idComp: "C_POING", nom: "Coup de coude" }]));
  localStorage.setItem("__docs_banc", JSON.stringify(window.__docs));
});
await p.addInitScript(() => { try { window.__docs = JSON.parse(localStorage.getItem("__docs_banc") || "null") || window.__docs; } catch (e) {} });
// Et cette fois sans clé Gemini : le prompt de secours, assemblé à la main.
await p.addInitScript(() => localStorage.removeItem("ivalis_GEMINI_API_KEY"));
await p.reload();
await p.waitForTimeout(500);
await attendreFileVide();
const apres = await p.evaluate(() => ({ openai: window.__faux.openai, docs: window.__docs }));
verifier("après rechargement, les deux commandes en file sont traitées", apres.openai.length === 2
         && /illu/.test(apres.docs["Personnages/P1/Competences/C_MAGIE"].URL_Image || "") && /illu/.test(apres.docs["Personnages/P1/Competences/C_POING"].URL_Image || ""),
         `${apres.openai.length} dessins`);
verifier("Magie : seulement le portrait (la hache n'est pas l'arme du sort)", JSON.stringify(apres.openai[0].images) === '["personnage.png"]', JSON.stringify(apres.openai[0].images));
verifier("Sans arme : seulement le portrait", JSON.stringify(apres.openai[1].images) === '["personnage.png"]', JSON.stringify(apres.openai[1].images));
verifier("sans Gemini, le prompt de secours porte le même style mot pour mot",
         apres.openai.every(x => (x.prompt || "").includes("Directives de style artistique obligatoires : STYLE-TEST") && /Rayon|Coup de coude/.test(x.prompt)),
         (apres.openai[0].prompt || "").slice(0, 160));

if (process.env.CAPTURE) {
  await p.route('**/x/image/upload/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><radialGradient id="g"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#3a1d0e"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="512" cy="430" r="120" fill="#2b1a10"/><path d="M380 700 L512 520 L644 700 Z" fill="#2b1a10"/><text x="512" y="900" font-size="60" text-anchor="middle" fill="#fff">ILLUSTRATION SIMULÉE</text></svg>' }));
  await p.evaluate(() => {
    document.getElementById("ecran-jeu") && (document.getElementById("ecran-jeu").style.display = "block");
    window.COMPETENCES_CACHE["C_MAGIE"] = { ...window.__docs["Personnages/P1/Competences/C_MAGIE"], URL_Image: "https://res.cloudinary.com/x/image/upload/capture.svg" };
    window.afficherApercuCarteHD("C_MAGIE");
    window.ouvrirReglageIllustration();
    document.querySelector('#panneau-reglage-illustration [data-action="extraire"]').click();
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: process.env.CAPTURE + "_reglage.png" });
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
