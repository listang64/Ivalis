// LA FOUILLE DES CADAVRES : L'ÉCRAN QUI FAIT PATIENTER, ET SES PORTES DE SORTIE.
//
// Un écran d'attente est le pire endroit où coincer un joueur : si l'image
// n'arrive jamais — clé refusée, quota épuisé, réseau coupé — il ne doit PAS
// rester devant des squelettes pour l'éternité. Ce banc joue la vraie fenêtre,
// avec le vrai balisage et le vrai style, et vérifie les trois sorties : le
// bouton, le délai maximum, et l'absence de clés qui saute l'étape d'emblée.
import fs from 'fs';

const style = fs.readFileSync('/home/user/Ivalis/style.css', 'utf-8');
const html = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');

const extraitEntre = (debut, fin) => {
  const d = html.indexOf(debut), f = html.indexOf(fin, d);
  if (d < 0 || f < 0) throw new Error("balisage introuvable : " + debut);
  return html.slice(d, f) + '</div>';
};
const MARKUP_BUTIN = extraitEntre('<div id="fenetre-butin"', '</div>\n\n<!-- Popup de confirmation');
const MARKUP_POPUP = extraitEntre('<div id="popup-confirmation-equip"', '</div>\n\n<!-- NOUVEAU : On charge le cerveau IA');

const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const sansImports = (f) => fs.readFileSync(f, 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');
const SRC_IA = sansImports('/home/user/Ivalis/objets_ia.js');
const SRC_LOOT = sansImports('/home/user/Ivalis/loot.js');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}
:root{--app-h:100vh;}</style></head>
<body style="margin:0;">
<div id="fenetre-combat" style="display:block; position:fixed; top:0; right:0; bottom:0; left:0; background:#1a1a1a; z-index:65;"></div>
${MARKUP_BUTIN}
${MARKUP_POPUP}
<script>
${SRC_OBJETS}

// --- Le décor -----------------------------------------------------------
window.PERSOS_PARTIE = [
  { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié", statut: "Vivant",
    equipArmure: null, equipMainDroite: null, equipMainGauche: null }
];
window.MONSTRES_PARTIE = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort" }];
window.ID_PARTIE_COURANTE = "P1";
window.estCombattantMort = (id) => (window.MONSTRES_PARTIE.find(m => m.idPersonnage === id) || {}).statut === "Mort";
window.jouerSonClic = () => {};
localStorage.setItem("ID_JOUEUR_COURANT", "P1");
["ivalis_GEMINI_API_KEY","ivalis_OPENAI_API_KEY","ivalis_CLOUDINARY_CLOUD_NAME",
 "ivalis_CLOUDINARY_API_KEY","ivalis_CLOUDINARY_API_SECRET"].forEach(c => localStorage.setItem(c, "x"));

window.modifierPartie = async function(modifier) {
  const sortie = modifier(window.PARTIE_DATA);
  if (!sortie) return null;
  Object.keys(sortie.maj || {}).forEach(cle => {
    const segments = cle.split(".");
    let n = window.PARTIE_DATA;
    for (let i = 0; i < segments.length - 1; i++) { n[segments[i]] = n[segments[i]] || {}; n = n[segments[i]]; }
    n[segments[segments.length - 1]] = sortie.maj[cle];
  });
  window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  return sortie.resultat !== undefined ? sortie.resultat : true;
};
const db = {}, doc = (...a) => ({ chemin: a.slice(1).join("/") });
const updateDoc = async () => {};
const getDoc = async () => ({ exists: () => true, data: () => ({ Contenu_Direct: "style de test" }) });

// Aucune requête réseau ne part d'ici : la génération est pilotée à la main,
// image par image, pour observer l'écran de fouille à chaque étape.
window.fetch = async () => { throw new Error("le banc ne doit appeler aucune API"); };

${SRC_IA}
${SRC_LOOT}

// On neutralise la génération réelle : ce banc regarde l'ÉCRAN, pas l'API.
window.lancerIllustrationButin = async () => {};

// Un butin frais, comme au sortir d'une victoire.
window.PARTIE_DATA = { Difficulte_Rencontre: "Normale" };
window.demarrerButin().then(() => {
  window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  window.__pret = true;
});

// Pose une image sur le n-ième objet du héros, comme le ferait MIA_Objets.
window.__illustrer = (n) => {
  const items = window.PARTIE_DATA.Butin.parPersonnage.J1.items;
  if (items[n]) items[n].image = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  window.afficherFenetreButin(window.PARTIE_DATA.Butin);
};
</script></body></html>`;
fs.writeFileSync('/tmp/fouille_butin.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text().slice(0, 160)); });
await p.goto('file:///tmp/fouille_butin.html');
await p.waitForFunction(() => window.__pret === true, null, { timeout: 5000 }).catch(() => {});

const vue = () => p.evaluate(() => ({
  fenetre: document.getElementById("fenetre-butin").style.display,
  fouille: document.getElementById("butin-vue-fouille").style.display,
  personnel: document.getElementById("butin-vue-personnel").style.display,
  titre: document.getElementById("butin-titre").innerText,
  compteur: document.getElementById("fouille-compteur").innerText,
  jauge: document.getElementById("fouille-jauge-remplie").style.width
}));

console.log("1. LA VICTOIRE OUVRE LA FOUILLE, PAS LE BUTIN");
verifier("aucune erreur JS au chargement", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));
{
  const v = await vue();
  verifier("la fenêtre est à l'écran", v.fenetre === "flex", `(${v.fenetre})`);
  verifier("c'est la fouille qu'on voit", v.fouille === "block", `(${v.fouille})`);
  verifier("et surtout pas encore le butin", v.personnel === "none", `(${v.personnel})`);
  // Le style met les titres en majuscules : on compare sans la casse.
  verifier("le titre annonce la fouille",
           v.titre.toLowerCase() === "fouille des cadavres", `(${v.titre})`);
  verifier("le compteur part de zéro", v.compteur.includes("Rien d'identifié"), `(${v.compteur})`);
  verifier("la jauge est vide", v.jauge === "0%", `(${v.jauge})`);
}

console.log("\n2. LA JAUGE SUIT LES TROUVAILLES");
{
  await p.evaluate(() => window.__illustrer(0));
  const v = await vue();
  verifier("une trouvaille identifiée sur deux", v.compteur.includes("1 trouvaille") && v.compteur.includes("sur 2"),
           `(${v.compteur})`);
  verifier("la jauge est à la moitié", v.jauge === "50%", `(${v.jauge})`);
  verifier("on fouille toujours", v.fouille === "block");
}

console.log("\n3. LA DERNIÈRE IMAGE LAISSE PLACE AU BUTIN, TOUTE SEULE");
{
  await p.evaluate(() => window.__illustrer(1));
  const v = await vue();
  verifier("la fouille se referme", v.fouille === "none", `(${v.fouille})`);
  verifier("le butin personnel prend le relais", v.personnel === "block", `(${v.personnel})`);
  verifier("le titre redevient celui du héros",
           v.titre.toLowerCase().includes("pliors"), `(${v.titre})`);
  const images = await p.evaluate(() => document.querySelectorAll("#butin-vue-personnel .carre-equipement img").length);
  verifier("les deux cartes montrent leur image", images === 2, `(${images} image(s))`);
}

console.log("\n4. LE BANDEAU D'IMAGE EST CARRÉ");
{
  const forme = await p.evaluate(() => {
    const el = document.querySelector("#butin-vue-personnel .carre-equipement");
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.width), h: Math.round(r.height) };
  });
  verifier("largeur et hauteur sont égales, bordure comprise",
           Math.abs(forme.l - forme.h) <= 1, `(${forme.l}x${forme.h})`);
}

// =========================================================================
console.log("\n5. LE BOUTON « SANS ATTENDRE » EST UNE VRAIE PORTE DE SORTIE");
{
  // On repart d'un butin neuf, sans aucune image.
  await p.evaluate(() => {
    window.FOUILLE_PASSEE = null; window.FOUILLE_DEBUT = {};
    window.PARTIE_DATA.Butin.id = "butin_2";
    window.PARTIE_DATA.Butin.parPersonnage.J1.items.forEach(it => it.image = "");
    window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  });
  verifier("on est bien retourné à la fouille", (await vue()).fouille === "block");

  const sousLeDoigt = await p.evaluate(() => {
    const el = [...document.querySelectorAll("#butin-vue-fouille button")]
      .find(b => b.innerText.toLowerCase().includes("sans attendre"));
    if (!el) return "bouton absent";
    const r = el.getBoundingClientRect();
    if (r.width === 0) return "taille nulle";
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (el === dessus || el.contains(dessus)) ? "le bouton lui-même"
         : "RECOUVERT par " + (dessus ? (dessus.id || dessus.className) : "rien");
  });
  verifier("il est réellement atteignable au doigt", sousLeDoigt === "le bouton lui-même", sousLeDoigt);

  await p.click("#butin-vue-fouille button");
  await p.waitForTimeout(150);
  const v = await vue();
  verifier("un clic fait passer au butin", v.personnel === "block" && v.fouille === "none",
           `(fouille ${v.fouille}, butin ${v.personnel})`);
  const iconesSansImage = await p.evaluate(() =>
    document.querySelectorAll("#butin-vue-personnel .icone-emplacement-vide").length);
  verifier("les objets pas encore dessinés gardent leur icône", iconesSansImage === 2, `(${iconesSansImage})`);
}

console.log("\n6. LE DÉLAI MAXIMUM DÉBLOQUE L'ÉCRAN TOUT SEUL");
{
  const bloque = await p.evaluate(async () => {
    window.FOUILLE_PASSEE = null; window.FOUILLE_DEBUT = {};
    window.PARTIE_DATA.Butin.id = "butin_3";
    window.DELAI_FOUILLE_MAX_MS = 300;   // 5 minutes compressées en 3 dixièmes
    window.afficherFenetreButin(window.PARTIE_DATA.Butin);
    const pendant = document.getElementById("butin-vue-fouille").style.display;
    await new Promise(r => setTimeout(r, 3500));  // le battement interne est de 3 s
    return { pendant, apres: document.getElementById("butin-vue-fouille").style.display,
             butin: document.getElementById("butin-vue-personnel").style.display };
  });
  verifier("la fouille démarre bien", bloque.pendant === "block", `(${bloque.pendant})`);
  verifier("puis expire d'elle-même, sans clic", bloque.apres === "none", `(${bloque.apres})`);
  verifier("et le butin s'ouvre malgré les images manquantes", bloque.butin === "block", `(${bloque.butin})`);
}

console.log("\n7. SANS CLÉS D'API, AUCUNE FOUILLE N'EST INFLIGÉE");
{
  const direct = await p.evaluate(() => {
    localStorage.removeItem("ivalis_OPENAI_API_KEY");
    window.FOUILLE_PASSEE = null; window.FOUILLE_DEBUT = {};
    window.DELAI_FOUILLE_MAX_MS = 120000;
    window.PARTIE_DATA.Butin.id = "butin_4";
    window.afficherFenetreButin(window.PARTIE_DATA.Butin);
    return { fouille: document.getElementById("butin-vue-fouille").style.display,
             butin: document.getElementById("butin-vue-personnel").style.display };
  });
  verifier("on va droit au butin", direct.fouille === "none" && direct.butin === "block",
           `(fouille ${direct.fouille}, butin ${direct.butin})`);
}

console.log("\nerreurs JS pendant toute la séance :", erreurs.length ? erreurs : "aucune");
if (erreurs.length) echecs++;

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
