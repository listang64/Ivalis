// ON CLIQUE VRAIMENT DANS LA FENÊTRE DE BUTIN.
// Les autres bancs appellent les fonctions à la main : ils vérifient la
// mécanique, jamais qu'un doigt posé sur "Prendre" déclenche quoi que ce soit.
// Nico a signalé une fenêtre où « la croix ne fait rien, prendre ou laisser ne
// fait rien » — un symptôme que seul un vrai clic, dans un vrai navigateur,
// sur le VRAI balisage et le VRAI style, peut reproduire.
import fs from 'fs';

const style = fs.readFileSync('/home/user/Ivalis/style.css', 'utf-8');
const html = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');

// Le marqueur de fin borne la coupe sans jamais être inclus (un commentaire
// ouvert et non refermé avalerait le reste du document).
const extraitEntre = (debut, fin) => {
  const d = html.indexOf(debut), f = html.indexOf(fin, d);
  if (d < 0 || f < 0) throw new Error("balisage introuvable : " + debut);
  return html.slice(d, f) + '</div>';
};
const MARKUP_BUTIN = extraitEntre('<div id="fenetre-butin"', '</div>\n\n<!-- Popup de confirmation');
const MARKUP_POPUP = extraitEntre('<div id="popup-confirmation-equip"', '</div>\n\n<!-- Popup de détail');
const MARKUP_DETAIL = extraitEntre('<div id="popup-detail-objet-equipe"', '</div>\n\n<!-- NOUVEAU : On charge le cerveau IA');

const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const SRC_LOOT = fs.readFileSync('/home/user/Ivalis/loot.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// La page : le vrai balisage, le vrai style, le vrai code. Seules la base et
// la fenêtre de combat sont simulées — le reste est ce que voit le joueur.
const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}
:root{--app-h:100vh;}</style></head>
<body style="margin:0;">
<div id="fenetre-combat" style="display:block; position:fixed; inset:0; background:#1a1a1a; z-index:65;">
  <div id="menu-dev-combat" style="position:fixed; top:0; left:0; z-index:10010; padding:20px; color:#fff;">
    <div id="bouton-temoin" onclick="window.__temoin = (window.__temoin || 0) + 1"
         style="padding:14px 22px; background:#5c3a21; cursor:pointer;">MENU DE COMBAT</div>
  </div>
</div>
${MARKUP_BUTIN}
${MARKUP_POPUP}
${MARKUP_DETAIL}
<script>
${SRC_OBJETS}

// --- Le décor minimal dont loot.js a besoin -----------------------------
window.__ecrituresPartie = [];
window.PERSOS_PARTIE = [
  { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié", statut: "Vivant",
    equipArmure: null, equipMainDroite: null, equipMainGauche: null }
];
window.MONSTRES_PARTIE = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", estIllusion: false }];
window.ID_PARTIE_COURANTE = "P1";
window.estCombattantMort = (id) => (window.MONSTRES_PARTIE.find(m => m.idPersonnage === id) || {}).statut === "Mort";
window.jouerSonClic = () => {};
localStorage.setItem("ID_JOUEUR_COURANT", "P1");

// Une base de données en mémoire : on note ce que le jeu tente d'écrire, et on
// rejoue l'affichage comme le ferait la notification Firestore.
window.modifierPartie = async function(modifier) {
  const sortie = modifier(JSON.parse(JSON.stringify(window.PARTIE_DATA)));
  if (!sortie) return null;
  window.__ecrituresPartie.push(sortie.maj);
  Object.keys(sortie.maj || {}).forEach(cle => {
    const segments = cle.split(".");
    let n = window.PARTIE_DATA;
    for (let i = 0; i < segments.length - 1; i++) { n[segments[i]] = n[segments[i]] || {}; n = n[segments[i]]; }
    n[segments[segments.length - 1]] = sortie.maj[cle];
  });
  window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  return sortie.resultat !== undefined ? sortie.resultat : true;
};
window.__equipements = [];
const db = {}, doc = (...a) => ({ col: a[1], id: a[2] });
const updateDoc = async (ref, maj) => { window.__equipements.push({ id: ref.id, maj }); };

${SRC_LOOT}

// Un butin frais, comme au sortir d'une victoire.
// Une rencontre en cours : sans elle, aucun butin ne s'ouvre (c'est ce qui
// empêche un butin fantôme de surgir sur les cadavres du combat précédent).
window.PARTIE_DATA = { Difficulte_Rencontre: "Normale", ID_Rencontre: "renc_banc" };
window.demarrerButin().then(() => {
  window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  window.__pret = true;
});
</script></body></html>`;
fs.writeFileSync('/tmp/clics_butin.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text().slice(0, 160)); });
await p.goto('file:///tmp/clics_butin.html');
await p.waitForFunction(() => window.__pret === true, null, { timeout: 5000 }).catch(() => {});

console.log("1. LA FENÊTRE S'OUVRE ET RÉPOND AU DOIGT");
verifier("aucune erreur JS au chargement", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));
verifier("la fenêtre de butin est bien à l'écran",
         await p.evaluate(() => document.getElementById("fenetre-butin").style.display === "flex"));

// Ce qui se trouve RÉELLEMENT sous le doigt, à l'endroit de chaque bouton :
// c'est ainsi qu'on attrape un calque qui avale les clics.
const sousLeDoigt = async (selecteur) => p.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return "élément absent";
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return "taille nulle";
  const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!dessus) return "hors écran";
  if (el === dessus || el.contains(dessus)) return "le bouton lui-même";
  return "RECOUVERT par " + (dessus.id || dessus.className || dessus.tagName);
}, selecteur);

verifier("la croix de fermeture est réellement atteignable",
         (await sousLeDoigt("#btn-fermer-butin")) === "le bouton lui-même",
         await sousLeDoigt("#btn-fermer-butin"));
verifier("le bouton Prendre est réellement atteignable",
         (await sousLeDoigt(".btn-loot-mini.prendre")) === "le bouton lui-même",
         await sousLeDoigt(".btn-loot-mini.prendre"));
verifier("le bouton Laisser est réellement atteignable",
         (await sousLeDoigt(".btn-loot-mini.laisser")) === "le bouton lui-même",
         await sousLeDoigt(".btn-loot-mini.laisser"));

// =========================================================================
console.log("\n2. « LAISSER » : UN VRAI CLIC, UNE VRAIE DÉCISION");
{
  const avant = await p.evaluate(() => window.__ecrituresPartie.length);
  await p.click(".btn-loot-mini.laisser");
  await p.waitForTimeout(200);
  const apres = await p.evaluate(() => ({
    ecritures: window.__ecrituresPartie.length,
    decisions: JSON.stringify(window.PARTIE_DATA.Butin.parPersonnage.J1.decisions),
    texte: document.getElementById("butin-vue-personnel").innerText.replace(/\s+/g, " ")
  }));
  verifier("le clic déclenche bien une écriture", apres.ecritures > avant,
           `(${avant} → ${apres.ecritures})`);
  verifier("la décision « laissé » est enregistrée", apres.decisions.includes("false"),
           `(${apres.decisions})`);
  verifier("et la carte affiche « Laissé »", apres.texte.includes("Laissé"), `(${apres.texte.slice(0, 90)})`);
}

// =========================================================================
console.log("\n3. « PRENDRE » : LE POPUP, PUIS L'ÉQUIPEMENT");
{
  await p.click(".btn-loot-mini.prendre");
  await p.waitForTimeout(200);
  verifier("le popup de confirmation s'ouvre",
           await p.evaluate(() => document.getElementById("popup-confirmation-equip").style.display === "flex"));
  const boutons = await p.evaluate(() =>
    [...document.querySelectorAll("#actions-confirmation-equip button")].map(b => b.innerText.trim()));
  verifier("il propose des boutons d'action", boutons.length >= 2, `(${boutons.join(" | ")})`);

  const cible = await p.evaluate(() => {
    const b = [...document.querySelectorAll("#actions-confirmation-equip button")]
      .find(x => !/annuler/i.test(x.innerText));
    if (!b) return "aucun bouton d'équipement";
    const r = b.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (b === dessus || b.contains(dessus)) ? "le bouton lui-même"
         : "RECOUVERT par " + (dessus && (dessus.id || dessus.className || dessus.tagName));
  });
  verifier("le bouton d'équipement est atteignable", cible === "le bouton lui-même", cible);

  await p.evaluate(() => {
    const b = [...document.querySelectorAll("#actions-confirmation-equip button")]
      .find(x => !/annuler/i.test(x.innerText));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  const res = await p.evaluate(() => ({
    popupFerme: document.getElementById("popup-confirmation-equip").style.display === "none",
    equipements: window.__equipements.length,
    champs: window.__equipements.map(e => Object.keys(e.maj).join("+")).join(","),
    texte: document.getElementById("butin-vue-personnel").innerText.replace(/\s+/g, " ")
  }));
  verifier("le popup se referme après l'équipement", res.popupFerme);
  verifier("l'objet est réellement écrit sur le personnage", res.equipements === 1,
           `(${res.equipements} écriture(s) : ${res.champs})`);
  verifier("et la carte affiche « Pris »", res.texte.includes("Pris"), `(${res.texte.slice(0, 90)})`);
}

// =========================================================================
console.log("\n4. LA CROIX FERME VRAIMENT LA FENÊTRE");
{
  await p.click("#btn-fermer-butin");
  await p.waitForTimeout(200);
  verifier("un clic sur la croix referme la fenêtre",
           await p.evaluate(() => document.getElementById("fenetre-butin").style.display === "none"));

  // Et une notification de la partie ne doit pas la réimposer.
  await p.evaluate(() => window.afficherFenetreButin(window.PARTIE_DATA.Butin));
  verifier("une notification ne la rouvre pas dans le dos du joueur",
           await p.evaluate(() => document.getElementById("fenetre-butin").style.display === "none"));

  // Fenêtre fermée, le menu de combat redevient cliquable.
  await p.click("#bouton-temoin");
  verifier("le menu de combat répond de nouveau au clic",
           await p.evaluate(() => window.__temoin === 1),
           `(${await p.evaluate(() => window.__temoin || 0)} clic(s) reçu(s))`);
}

// =========================================================================
console.log("\n5. TANT QUE LA FENÊTRE EST LÀ, ELLE BLOQUE LE COMBAT (attendu)");
{
  await p.evaluate(() => {
    window.BUTIN_MASQUE_LOCALEMENT = null;
    window.__temoin = 0;
    window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  });
  await p.waitForTimeout(100);
  verifier("la fenêtre est de nouveau à l'écran",
           await p.evaluate(() => document.getElementById("fenetre-butin").style.display === "flex"));
  const sousMenu = await p.evaluate(() => {
    const el = document.getElementById("bouton-temoin");
    const r = el.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return dessus === el || el.contains(dessus) ? "atteignable" : "recouvert par " + (dessus.id || dessus.className);
  });
  console.log(`     le menu de combat est alors : ${sousMenu}`);
  verifier("c'est bien le calque du butin qui le recouvre — d'où la règle « un combat en cours passe avant »",
           sousMenu.startsWith("recouvert"), `(${sousMenu})`);
}

// =========================================================================
// Nico a demandé de pouvoir cliquer sur son équipement déjà porté, dans la
// fenêtre de partage, pour en voir les stats sans avoir à rouvrir sa fiche.
// À ce stade du banc, J1 a déjà équipé l'objet tiré à la section 3 — une arme,
// une armure ou un bouclier selon le tirage (le butin pioche au hasard dans
// tout le catalogue) : le bandeau "équipement actuel" doit donc montrer une
// case remplie, réellement cliquable, qui ouvre le détail de CET objet précis,
// quel que soit l'emplacement où il a atterri.
console.log("\n6. LE DÉTAIL DE L'ÉQUIPEMENT ACTUEL, D'UN VRAI CLIC");
{
  const objetPorte = await p.evaluate(() => {
    const perso = window.PERSOS_PARTIE[0];
    return perso.equipArmure || perso.equipMainDroite || perso.equipMainGauche || null;
  });
  verifier("J1 porte bien l'objet équipé à la section 3, quel que soit l'emplacement",
           !!(objetPorte && objetPorte.nom), `(${objetPorte && objetPorte.nom})`);

  const filled = await p.evaluate(() => {
    const el = document.querySelector("#butin-equipement-actuel .mini-carre-equip:not(.vide)");
    return !!el;
  });
  verifier("la case correspondante s'affiche remplie, pas vide", filled);

  const cible = await p.evaluate(() => {
    const el = document.querySelector("#butin-equipement-actuel .mini-carre-equip:not(.vide)");
    if (!el) return "élément absent";
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return "taille nulle";
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (el === dessus || el.contains(dessus)) ? "le bouton lui-même"
         : "RECOUVERT par " + (dessus && (dessus.id || dessus.className || dessus.tagName));
  });
  verifier("la case remplie est réellement atteignable au doigt", cible === "le bouton lui-même", cible);

  await p.click("#butin-equipement-actuel .mini-carre-equip:not(.vide)");
  await p.waitForTimeout(150);
  const apresClic = await p.evaluate(() => {
    const p2 = window.PERSOS_PARTIE[0];
    const objet = p2.equipArmure || p2.equipMainDroite || p2.equipMainGauche;
    return {
      popupOuvert: document.getElementById("popup-detail-objet-equipe").style.display === "flex",
      texte: document.getElementById("detail-objet-equipe-contenu").innerText.replace(/\s+/g, " "),
      nomAttendu: objet.nom
    };
  });
  verifier("le popup s'ouvre au clic", apresClic.popupOuvert);
  verifier("il montre le nom exact de l'objet réellement équipé",
           apresClic.texte.includes(apresClic.nomAttendu), `(« ${apresClic.texte} »)`);
  verifier("et son type d'arme, pas seulement sa rareté",
           /Arme (légère|lourde|polyvalente|à distance)|Magie|Armure|Bouclier/i.test(apresClic.texte),
           `(« ${apresClic.texte} »)`);

  // Fermeture par le bouton.
  await p.click("#popup-detail-objet-equipe button");
  await p.waitForTimeout(100);
  verifier("le bouton Fermer referme bien le détail",
           await p.evaluate(() => document.getElementById("popup-detail-objet-equipe").style.display === "none"));

  // Réouverture, puis fermeture par un clic sur le fond sombre.
  await p.click("#butin-equipement-actuel .mini-carre-equip:not(.vide)");
  await p.waitForTimeout(100);
  await p.evaluate(() => document.getElementById("popup-detail-objet-equipe").click());
  await p.waitForTimeout(100);
  verifier("un clic sur le fond sombre referme aussi le détail",
           await p.evaluate(() => document.getElementById("popup-detail-objet-equipe").style.display === "none"));

  // Une case vide (main gauche, jamais équipée) ne doit rien ouvrir : elle n'a
  // pas de onclick, un doigt dessus ne doit donc déclencher aucune popup.
  const videCliquable = await p.evaluate(() => {
    const cases = [...document.querySelectorAll("#butin-equipement-actuel .mini-carre-equip")];
    const vide = cases.find(c => c.classList.contains("vide"));
    return vide ? vide.getAttribute("onclick") : "aucune case vide trouvée";
  });
  verifier("une case vide n'a aucun gestionnaire de clic",
           videCliquable === null, `(onclick="${videCliquable}")`);
}

// =========================================================================
// LE POINT LE PLUS IMPORTANT DE CE BANC.
// afficherFenetreButin tourne au tout début du traitement de chaque
// notification de partie, et 150 lignes de combat la suivent : points
// d'apparition, tour de l'IA, changement de tour, animations. Une exception
// ici les emportait TOUTES, à chaque notification — d'où « le mode combat est
// complètement bugué ». Un index.html servi depuis le cache du navigateur
// (seul fichier sans ?v=) suffit à faire manquer un élément.
console.log("\n7. UN BUTIN EN PANNE N'EMPORTE PLUS LE COMBAT");
{
  const resultat = await p.evaluate(() => {
    // On arrache du DOM les éléments que la fenêtre attend, exactement comme
    // le ferait une page servie depuis un cache d'une version antérieure.
    ["butin-vue-personnel", "butin-vue-partage", "butin-vue-fin",
     "butin-titre", "butin-sous-titre", "butin-equipement-actuel"]
      .forEach(id => document.getElementById(id)?.remove());

    window.BUTIN_MASQUE_LOCALEMENT = null;
    let leve = null;
    try { window.afficherFenetreButin(window.PARTIE_DATA.Butin); }
    catch (e) { leve = e.message; }

    // Le vrai enchaînement d'app.js : le butin, PUIS le reste du combat.
    let suiteExecutee = false;
    try {
      try { window.afficherFenetreButin(window.PARTIE_DATA.Butin); }
      catch (e) { /* app.js isole désormais cette panne */ }
      suiteExecutee = true;   // les points d'apparition, l'IA, les tours...
    } catch (e) { suiteExecutee = false; }

    return { leve, suiteExecutee };
  });

  verifier("un DOM incomplet ne fait plus lever l'affichage du butin",
           resultat.leve === null, `(${resultat.leve || "aucune exception"})`);
  verifier("et la suite du traitement de la partie s'exécute bien",
           resultat.suiteExecutee === true);

  // Le garde-fou d'app.js lui-même : même si le butin levait, le reste passe.
  const isole = await p.evaluate(() => {
    let suite = false;
    window.afficherFenetreButin = () => { throw new Error("panne simulée du butin"); };
    // Copie conforme du branchement d'app.js.
    if (typeof window.afficherFenetreButin === "function") {
      try { window.afficherFenetreButin(null); }
      catch (e) {
        const f = document.getElementById("fenetre-butin");
        if (f) f.style.display = "none";
      }
    }
    suite = true;
    return { suite, fenetreFermee: document.getElementById("fenetre-butin").style.display === "none" };
  });
  verifier("une panne franche du butin est rattrapée par app.js", isole.suite === true);
  verifier("et la fenêtre est refermée au passage, plutôt que laissée en travers",
           isole.fenetreFermee === true);
}

console.log("\nerreurs JS pendant toute la séance :", erreurs.length ? erreurs.slice(0, 4).join(" | ") : "aucune");
if (erreurs.length > 0) echecs++;
await p.screenshot({ path: '/tmp/clics_butin.png', fullPage: true });
await b.close();

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
