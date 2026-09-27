// LA SCÈNE DU D20 (jet_d20.js).
//
// Nico : « la fenêtre s'assombrit en fondu pour tous les joueurs, avec
// l'avatar en grand côté droit par-dessus tout. Un dé 20 au milieu de l'écran
// avec des chiffres qui défilent et s'arrêtent sur le bon chiffre, de moins en
// moins vite. Un modificateur (+3) s'affiche en doré juste à côté ; la petite
// animation le fait passer à +2, le dé grossit légèrement avant de reprendre
// sa taille dans une lueur dorée, et s'incrémente de 1 — pour tous les +.
// Puis le résultat final, avec des lueurs dorées dansantes autour et sous le
// dé. Un 1 : le dé, le chiffre et la lueur deviennent rouges. Un 20 (résultat
// initial) : tout devient violet. » Ses réponses : dé dessiné en code, rouge
// sur un 1 NATUREL, un malus descend de la même façon, fermeture au toucher.
//
// Ce banc charge la VRAIE page (Firebase remplacé par un faux qui enregistre
// les écritures) et joue la scène comme la table la voit.
import fs from 'fs';
import http from 'http';
import path from 'path';

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

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async (col, data) => { (window.__messages = window.__messages || []).push(data); return { id: "n" }; };
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = (ref, cb) => { (window.__ecoutes = window.__ecoutes || []).push({ ref, cb }); return () => {}; };
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1200"><rect width="700" height="1200" fill="#553311"/></svg>' }));
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));

// Les images du décor sont injoignables depuis le bac à sable. On sert un
// rectangle connu à la place : l'avatar doit avoir une taille pour qu'on puisse
// dire s'il dépasse du bouton, et le bandeau une hauteur pour que la boîte de
// l'anneau se pose quelque part.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);


const R_DEFAUT = await p.evaluate(() => ({ ...window.RYTHME_D20, intervalles: window.intervallesDefilementD20() }));
// On accélère la scène pour le banc (les proportions restent les mêmes).
await p.evaluate(() => Object.assign(window.RYTHME_D20,
  { entree: 120, tics: 10, ticMin: 12, ticMax: 60, pauseAvantMod: 120, cran: 260, fermetureAuto: 60000 }));
// Les sons : on les compte, sans les jouer (le banc n'a pas de haut-parleur).
await p.evaluate(() => {
  window.__sons = { tic: 0, pose: 0, cran: [], final: [] };
  window.SONS_D20.tic = () => { window.__sons.tic++; };
  window.SONS_D20.pose = () => { window.__sons.pose++; };
  window.SONS_D20.cran = (bonus) => { window.__sons.cran.push(bonus); };
  window.SONS_D20.final = (theme) => { window.__sons.final.push(theme); };
});
await p.evaluate(() => {
  window.PERSOS_PARTIE = [{ idPersonnage: "P1", prenom: "Cybile", nom: "Ardente", couleur: "#c2a878",
                            urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1/portrait_cybile.png" }];
  window.ID_MON_LANCER = "L1";
});

// Joue une scène jusqu'au résultat final, en relevant tout ce qui s'affiche.
const jouer = (donnees) => p.evaluate(async (donnees) => {
  window.__messages = [];
  const h = document.getElementById("overlay-jet-des");
  const releve = { chiffres: [], mods: [], echelleMax: 1, echelleMin: 1 };
  let obs = null, mo = null, tourne = true;
  const promesse = window.jouerAnimationDesGlobal(donnees);
  await new Promise(r => setTimeout(r, 0));
  const texte = h.querySelector(".d20-chiffre");
  const mod = h.querySelector(".scene-d20-mod");
  obs = new MutationObserver(() => {
    const t = texte.textContent;
    if (releve.chiffres[releve.chiffres.length - 1] !== t) releve.chiffres.push(t);
  });
  obs.observe(texte, { childList: true, characterData: true, subtree: true });
  mo = new MutationObserver(() => {
    const t = mod.textContent;
    if (t && releve.mods[releve.mods.length - 1] !== t) releve.mods.push(t);
  });
  mo.observe(mod, { childList: true, characterData: true, subtree: true });
  const de = h.querySelector(".scene-d20-de");
  (function mesurer() {
    if (!tourne) return;
    const m = getComputedStyle(de).transform;
    if (m && m !== "none") {
      const v = m.match(/matrix\(([^,]+),([^,]+)/);
      if (v) { const sc = Math.hypot(parseFloat(v[1]), parseFloat(v[2]));
               releve.echelleMax = Math.max(releve.echelleMax, sc); releve.echelleMin = Math.min(releve.echelleMin, sc); }
    }
    requestAnimationFrame(mesurer);
  })();
  await promesse;
  tourne = false; obs.disconnect(); mo.disconnect();
  await new Promise(r => setTimeout(r, 900));   // les lueurs s'allument
  const fill = (sel) => getComputedStyle(h.querySelector(sel)).fill;
  const av = h.querySelector(".scene-d20-avatar").getBoundingClientRect();
  const r = h.querySelector(".scene-d20-piste").getBoundingClientRect();
  return {
    releve, final: texte.textContent, classes: h.className,
    modClasses: mod.className, modCouleur: getComputedStyle(mod).color,
    voile: getComputedStyle(h.querySelector(".scene-d20-voile")).opacity,
    zIndex: getComputedStyle(h).zIndex, affiche: getComputedStyle(h).display,
    lueurs: getComputedStyle(h.querySelector(".scene-d20-lueurs")).opacity,
    sol: getComputedStyle(h.querySelector(".scene-d20-sol")).opacity,
    centre: fill(".d20-centre"), chiffreFill: getComputedStyle(texte).fill,
    avatar: { src: h.querySelector(".scene-d20-avatar").getAttribute("src"),
              droite: innerWidth - av.right, gauche: av.left, hauteur: av.height / innerHeight,
              visible: getComputedStyle(h.querySelector(".scene-d20-avatar")).opacity },
    de: { cx: (r.left + r.right) / 2 - innerWidth / 2, cy: (r.top + r.bottom) / 2 - innerHeight / 2 },
    messages: window.__messages.map(m => m.Texte)
  };
}, donnees);
const rgb = (c) => (c.match(/\d+/g) || []).map(Number);

console.log("\n1. LE DÉFILEMENT RALENTIT JUSQU'À L'ARRÊT");
{
  const iv = R_DEFAUT.intervalles;
  verifier("les intervalles ne font que s'allonger", iv.every((v, i) => i === 0 || v >= iv[i - 1]), iv.join(","));
  verifier("le dernier est bien plus long que le premier", iv[iv.length - 1] > 5 * iv[0], `${iv[0]} → ${iv[iv.length - 1]} ms`);
  const total = iv.reduce((a, b) => a + b, 0);
  verifier("le dé roule entre 2 et 4 secondes", total >= 2000 && total <= 4000, `${total} ms`);
}

console.log("\n2. UN JET DE 12 AVEC +3 : FONDU, AVATAR, DÉ, MODIFICATEUR, FINAL");
{
  await p.evaluate(() => { window.__sons = { tic: 0, pose: 0, cran: [], final: [] }; });
  const r = await jouer({ idLancer: "L1", idPerso: "P1", nomPerso: "Cybile Ardente", caract: "Force",
                          resultatBrut: 12, modificateur: 3, totalFinal: 15, timestamp: 1 });
  await p.screenshot({ path: "/tmp/claude-0/d20_final.png" });
  verifier("l'écran s'est assombri en fondu", parseFloat(r.voile) > 0.99, r.voile);
  verifier("par-dessus tout le jeu (z-index 30000)", r.zIndex === "30000", r.zIndex);
  verifier("l'avatar du lanceur est là, en grand, collé à droite",
           /portrait_cybile/.test(r.avatar.src) && r.avatar.droite < 2 && r.avatar.hauteur > 0.85
           && r.avatar.gauche > 0 && parseFloat(r.avatar.visible) > 0.99, JSON.stringify(r.avatar));
  verifier("le dé est au milieu de l'écran", Math.abs(r.de.cx) < 3 && Math.abs(r.de.cy) < 120, JSON.stringify(r.de));
  const c = r.releve.chiffres;
  const iAtterri = c.lastIndexOf("12");
  verifier("des chiffres ont défilé avant l'arrêt", new Set(c.slice(0, iAtterri)).size >= 5, c.join(" "));
  verifier("le dé s'arrête sur 12, puis monte un par un jusqu'à 15",
           JSON.stringify(c.slice(iAtterri)) === '["12","13","14","15"]', c.slice(iAtterri).join(" "));
  verifier("le +3 s'égrène : +3, +2, +1, puis s'efface",
           JSON.stringify(r.releve.mods) === '["+3","+2","+1"]' && /d20-mod-epuise/.test(r.modClasses),
           JSON.stringify(r.releve.mods));
  verifier("il est doré (bonus)", /d20-mod-bonus/.test(r.modClasses));
  verifier("à chaque cran le dé grossit un peu", r.releve.echelleMax > 1.08, r.releve.echelleMax.toFixed(3));
  verifier("résultat final : 15", r.final === "15" && /d20-final/.test(r.classes));
  verifier("les lueurs dansent autour et sous le dé", parseFloat(r.lueurs) > 0.95 && parseFloat(r.sol) > 0.5,
           `${r.lueurs} / ${r.sol}`);
  const [cr, cg, cb] = rgb(r.centre);
  verifier("le dé est doré", cr > 200 && cg > 150 && cb < 120 && /theme-or/.test(r.classes), r.centre);
  const sons = await p.evaluate(() => ({ ...window.__sons, attendus: window.intervallesDefilementD20().length - 1 }));
  verifier("un « tic » à chaque chiffre qui défile", sons.tic === sons.attendus && sons.tic > 0, `${sons.tic}/${sons.attendus}`);
  verifier("un coup sourd quand il se pose", sons.pose === 1, String(sons.pose));
  verifier("une note à chacun des trois crans (aiguë : bonus)", JSON.stringify(sons.cran) === "[true,true,true]", JSON.stringify(sons.cran));
  verifier("et un accord doré au résultat", JSON.stringify(sons.final) === '["or"]', JSON.stringify(sons.final));
  verifier("le message part dans le chat, une fois, depuis le lanceur",
           r.messages.length === 1 && /Résultat : 12 \+3 = \*\*15\*\*/.test(r.messages[0]), JSON.stringify(r.messages));
}

console.log("\n3. FERMER AU TOUCHER");
{
  const r = await p.evaluate(async () => {
    const h = document.getElementById("overlay-jet-des");
    h.click();
    await new Promise(r => setTimeout(r, 750));
    return { visible: h.classList.contains("d20-visible"), display: getComputedStyle(h).display };
  });
  verifier("un toucher après le résultat ferme la scène", !r.visible && r.display === "none", JSON.stringify(r));
  const r2 = await p.evaluate(async () => {
    window.ID_MON_LANCER = "";
    window.__messages = [];
    const h = document.getElementById("overlay-jet-des");
    const fin = window.jouerAnimationDesGlobal({ idLancer: "AUTRE", nomPerso: "Cybile Ardente", caract: "Sagesse",
                                                 resultatBrut: 9, modificateur: 0, totalFinal: 9 });
    await new Promise(r => setTimeout(r, 200));
    h.click();                                          // en plein roulement
    const pendant = h.classList.contains("d20-visible");
    await fin;
    return { pendant, messages: (window.__messages || []).length };
  });
  verifier("un toucher pendant que le dé roule ne coupe rien", r2.pendant === true);
  verifier("un autre poste ne poste pas le message", r2.messages === 0, String(r2.messages));
  const r3 = await p.evaluate(async () => {
    window.RYTHME_D20.fermetureAuto = 400;
    await window.jouerAnimationDesGlobal({ idLancer: "X", nomPerso: "?", caract: "Force", resultatBrut: 5, modificateur: 0, totalFinal: 5 });
    await new Promise(r => setTimeout(r, 1200));
    const h = document.getElementById("overlay-jet-des");
    window.RYTHME_D20.fermetureAuto = 60000;
    return { visible: h.classList.contains("d20-visible"), mod: h.querySelector(".scene-d20-mod").className };
  });
  verifier("sans toucher, elle se ferme d'elle-même", r3.visible === false);
  verifier("sans modificateur, aucune étiquette", !/d20-mod-visible/.test(r3.mod), r3.mod);
}

console.log("\n4. UN 1 NATUREL : TOUT AU ROUGE ; UN 20 NATUREL : TOUT AU VIOLET");
{
  const r1 = await jouer({ idLancer: "X", idPerso: "P1", nomPerso: "Cybile Ardente", caract: "Dextérité",
                           resultatBrut: 1, modificateur: 2, totalFinal: 3 });
  await p.screenshot({ path: "/tmp/claude-0/d20_rouge.png" });
  const [r, g, b] = rgb(r1.centre);
  verifier("un 1 (même avec +2) : thème rouge", /theme-rouge/.test(r1.classes) && r > 180 && g < 110 && b < 110, r1.centre);
  verifier("le chiffre suit (clair sur rouge)", rgb(r1.chiffreFill)[0] > 240, r1.chiffreFill);
  verifier("le total s'affiche quand même : 3", r1.final === "3");
  await p.evaluate(() => window.fermerJetD20());
  const r20 = await jouer({ idLancer: "X", idPerso: "P1", nomPerso: "Cybile Ardente", caract: "Charisme",
                            resultatBrut: 20, modificateur: -1, totalFinal: 19 });
  await p.screenshot({ path: "/tmp/claude-0/d20_violet.png" });
  const [vr, vg, vb] = rgb(r20.centre);
  verifier("un 20 naturel : thème violet", /theme-violet/.test(r20.classes) && vb > vg + 60 && vr > vg, r20.centre);
  await p.evaluate(() => window.fermerJetD20());
  const r15 = await jouer({ idLancer: "X", nomPerso: "?", caract: "Force", resultatBrut: 13, modificateur: 7, totalFinal: 20 });
  verifier("un 20 obtenu grâce au modificateur reste doré", /theme-or/.test(r15.classes), r15.classes);
  await p.evaluate(() => window.fermerJetD20());
}

console.log("\n5. UN MALUS DESCEND DE LA MÊME FAÇON");
{
  const r = await jouer({ idLancer: "X", idPerso: "P1", nomPerso: "Cybile Ardente", caract: "Force",
                          resultatBrut: 7, modificateur: -2, totalFinal: 5 });
  await p.screenshot({ path: "/tmp/claude-0/d20_malus.png" });
  const c = r.releve.chiffres;
  verifier("7, puis 6, puis 5", JSON.stringify(c.slice(c.lastIndexOf("7"))) === '["7","6","5"]', c.slice(-4).join(" "));
  verifier("l'étiquette : −2, −1, puis s'efface", JSON.stringify(r.releve.mods) === '["−2","−1"]', JSON.stringify(r.releve.mods));
  verifier("sans dorure (gris-bleu)", /d20-mod-malus/.test(r.modClasses) && rgb(r.modCouleur)[2] > rgb(r.modCouleur)[0], r.modCouleur);
  verifier("le dé rétrécit à chaque cran", r.releve.echelleMin < 0.93, r.releve.echelleMin.toFixed(3));
  await p.evaluate(() => window.fermerJetD20());
}

console.log("\n6. LE LANCER DEPUIS LA FICHE DIT QUI LANCE");
{
  const r = await p.evaluate(async () => {
    window.__majs = [];
    window.ID_PARTIE_COURANTE = "PARTIE_1";
    window.PARTIE_DATA = { Ordre_Initiative: ["P1"], Index_Initiative: 0 };
    document.getElementById("champ-id-personnage").value = "P1";
    document.getElementById("titre-nom-personnage").innerText = "Cybile Ardente";
    window.fermerFichePerso = () => {};
    await window.lancerJetDeCaracteristique("for", "Force", 16, 3);
    return (window.__majs[0] || {}).data;
  });
  const a = r && r.Action_Des;
  verifier("Action_Des porte l'identifiant du lanceur", a && a.idPerso === "P1", JSON.stringify(a));
  verifier("et un jet cohérent", a && a.totalFinal === a.resultatBrut + 3 && a.resultatBrut >= 1 && a.resultatBrut <= 20);
}

console.log("\n6 bis. LA SCÈNE SE JOUE CHEZ TOUS LES JOUEURS — ET LES MONSTRES RESTENT HORS DES BULLES");
{
  // Un poste qui N'A PAS lancé : il écoute la partie (ouvrirChatbox → écoute
  // du document de la partie), et c'est ce document qui porte le jet.
  const r = await p.evaluate(async () => {
    window.fermerJetD20();
    await new Promise(r => setTimeout(r, 700));
    window.ID_MON_LANCER = "";
    window.__messages = [];
    window.__ecoutes = [];
    window.ID_PARTIE_COURANTE = "PARTIE_X";
    document.getElementById("fenetre-chatbox").style.display = "none";
    window.ouvrirChatbox();
    const ecoute = (window.__ecoutes || []).find(e => e.ref && e.ref.chemin === "Systeme_Parties/PARTIE_X");
    if (!ecoute) return { ecoute: false };
    // Pendant un combat : les monstres sont dans la liste des combattants.
    window.PERSOS_PARTIE = [
      { idPersonnage: "P1", prenom: "Cybile", camp: "Allié", couleur: "#c2a878", urlCloudinary: "" },
      { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, urlCloudinary: "https://exemple/goule.png" },
      { idPersonnage: "ILL", prenom: "Illusion de", camp: "Allié", estIllusion: true }
    ];
    const snap = (data) => ({ exists: () => true, data: () => data, id: "PARTIE_X" });
    const base = { Ordre_Initiative: ["P1"], Index_Initiative: 0, Tour_Combat: 1 };
    let erreur = null;
    try { ecoute.cb(snap(base)); } catch (e) { erreur = "scan 1 : " + e.message; }
    const bulles = [...document.querySelectorAll("#zone-noms-bulles .bulle-personnage")].map(b => b.innerText);
    const portraits = [...document.querySelectorAll(".bulle-portrait-hover-joueur")].map(i => i.getAttribute("src"));
    try {
      ecoute.cb(snap({ ...base, Action_Des: { idLancer: "UN_AUTRE_POSTE", idPerso: "P1", nomPerso: "Cybile",
        caract: "Force", resultatBrut: 8, modificateur: 2, totalFinal: 10, timestamp: 12345 } }));
    } catch (e) { erreur = "scan 2 : " + e.message; }
    const h = document.getElementById("overlay-jet-des");
    await new Promise(r => setTimeout(r, 200));
    const ouverte = h.classList.contains("d20-visible");
    for (let i = 0; i < 60 && !h.classList.contains("d20-final"); i++) await new Promise(r => setTimeout(r, 100));
    return { ecoute: true, erreur, bulles, portraits, ouverte,
             final: h.querySelector(".d20-chiffre").textContent, messages: window.__messages.length };
  });
  verifier("ce poste écoute bien la partie", r.ecoute === true);
  verifier("sans erreur dans l'écoute", !r.erreur, r.erreur || "");
  verifier("le jet d'un AUTRE poste ouvre la scène ici aussi", r.ouverte === true);
  verifier("et la déroule jusqu'au résultat (8 + 2 = 10)", r.final === "10", r.final);
  verifier("ce poste ne poste pas le message (ce n'est pas lui qui a lancé)", r.messages === 0, String(r.messages));
  verifier("les bulles du chat : les héros (et le MJ), pas le monstre ni le leurre",
           JSON.stringify(r.bulles.filter(n => n !== "MJ")) === '["Cybile"]',
           JSON.stringify(r.bulles));
  verifier("ni son portrait au survol", !r.portraits.some(u => /goule/.test(u || "")), JSON.stringify(r.portraits));
  await p.evaluate(() => window.fermerJetD20());
}

console.log("\n7. L'ANCIEN PARCHEMIN EST PARTI");
{
  const html = fs.readFileSync(`${RACINE}/index.html`, "utf-8");
  const app = fs.readFileSync(`${RACINE}/app.js`, "utf-8");
  verifier("plus de rouleau ni de flash dans la page", !/rouleau-parchemin|flash-resultat-des/.test(html));
  verifier("app.js ne définit plus sa propre animation", !/window\.jouerAnimationDesGlobal\s*=/.test(app));
  verifier("ni la boucle audio de la roulette (les sons sont fabriqués sur place)", !/audio-roulette/.test(html));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
