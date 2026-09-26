// OÙ VA L'OBJET ? — le choix de la main, et jamais deux boucliers.
//
// Nico a demandé trois choses, que ce banc vérifie d'un vrai doigt, dans un
// vrai navigateur, sur le vrai balisage et le vrai code :
//   1. l'étiquette de chaque objet dit, juste après son type, en petit et en
//      marron, la caractéristique qui le modifie (Dextérité, Force...) ;
//   2. au partage commun, « Se placer » demande d'abord dans quelle main
//      l'objet ira si on le remporte — et c'est bien là qu'il atterrit ;
//      au butin personnel (les deux objets du début), « Prendre » fait de même ;
//   3. un héros ne porte jamais deux boucliers, quelle que soit la porte
//      d'entrée : la fenêtre, le partage, l'équipement automatique.
import fs from 'fs';

const style = fs.readFileSync('/home/user/Ivalis/style.css', 'utf-8');
const html = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');

const extraitEntre = (debut, fin) => {
  const d = html.indexOf(debut), f = html.indexOf(fin, d);
  if (d < 0 || f < 0) throw new Error("balisage introuvable : " + debut);
  return html.slice(d, f) + '</div>';
};
const MARKUP_BUTIN = extraitEntre('<div id="fenetre-butin"', '</div>\n\n<!-- Popup de confirmation');
const MARKUP_POPUP = extraitEntre('<div id="popup-confirmation-equip"', '</div>\n\n<!-- Popup de détail');
const MARKUP_DETAIL = extraitEntre('<div id="popup-detail-objet-equipe"', '</div>\n\n<!-- NOUVEAU : On charge le cerveau IA');
// La carte d'une main de la fiche perso, telle qu'elle est dans la page.
const MARKUP_FICHE = extraitEntre('<div id="emplacement-main-droite-carte"', '<div id="emplacement-main-gauche-carte"');

const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const SRC_LOOT = fs.readFileSync('/home/user/Ivalis/loot.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');

// La fiche perso vit dans app.js : on en extrait la seule fonction qui
// dessine un emplacement d'équipement, telle quelle.
const lignesApp = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8').split('\n');
const debutFiche = lignesApp.findIndex(l => l.startsWith('window.afficherEmplacementEquipement = function'));
const finFiche = lignesApp.findIndex((l, i) => i > debutFiche && l === '};');
if (debutFiche < 0 || finFiche < 0) throw new Error("afficherEmplacementEquipement introuvable dans app.js");
const SRC_FICHE = lignesApp.slice(debutFiche, finFiche + 1).join('\n');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}
:root{--app-h:100vh;}</style></head>
<body style="margin:0;">
<div id="fenetre-combat" style="display:block; position:fixed; inset:0; background:#1a1a1a; z-index:65;"></div>
${MARKUP_BUTIN}
${MARKUP_POPUP}
${MARKUP_DETAIL}
<div id="fiche-banc" style="position:fixed; left:0; bottom:0; width:300px; background:#f4e4bc;">
<input id="champ-id-personnage" value="J1">
${MARKUP_FICHE}
</div>
<script>
${SRC_OBJETS}

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
const updateDoc = async (ref, maj) => { window.__equipements.push({ id: ref.id, maj: JSON.parse(JSON.stringify(maj)) }); };

${SRC_LOOT}
${SRC_FICHE}

// Un objet du catalogue, au nom choisi : le banc sait ce qu'il pose.
window.__objet = (modele, nom) => {
  const o = window.fabriquerObjet(window.MODELES_OBJETS.find(m => m.modele === modele), "Commun");
  o.nom = nom;
  return o;
};
window.__equiper = (droite, gauche) => {
  const j1 = window.PERSOS_PARTIE[0];
  j1.equipMainDroite = droite; j1.equipMainGauche = gauche; j1.equipArmure = null;
};

window.PARTIE_DATA = { Difficulte_Rencontre: "Normale", ID_Rencontre: "renc_banc" };
window.demarrerButin().then(() => { window.__pret = true; });
</script></body></html>`;
const fichierPage = '/tmp/choix_emplacement_butin.html';
fs.writeFileSync(fichierPage, page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text().slice(0, 160)); });
await p.goto('file://' + fichierPage);
await p.waitForFunction(() => window.__pret === true, null, { timeout: 5000 }).catch(() => {});
verifier("aucune erreur JS au chargement", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

// Les boutons de la fenêtre de choix, tels que le joueur les lit.
const boutonsPopup = () => p.evaluate(() =>
  [...document.querySelectorAll("#actions-confirmation-equip button")].map(b => b.textContent.replace(/\s+/g, " ").trim()));
const popupOuvert = () => p.evaluate(() =>
  document.getElementById("popup-confirmation-equip").style.display === "flex");
const cliquerPopup = async (debut) => {
  const bouton = p.locator("#actions-confirmation-equip button", { hasText: debut }).first();
  await bouton.click();
  await p.waitForTimeout(150);
};
const derniereEcriture = () => p.evaluate(() => {
  const e = window.__equipements[window.__equipements.length - 1];
  return e ? Object.keys(e.maj).map(k => k + "=" + (e.maj[k] ? e.maj[k].nom : "∅")).join(" ") : "";
});

// =========================================================================
console.log("\n1. L'ÉTIQUETTE : LE TYPE, PUIS LA CARAC EN PETIT ET EN MARRON");
{
  // Chaque modèle du catalogue — armes, boucliers, bagues, armures — porte
  // sa carac, et l'étiquette la reprend juste après le type.
  const catalogue = await p.evaluate(() => window.MODELES_OBJETS.map(m => {
    const o = window.fabriquerObjet(m, "Commun");
    const div = document.createElement("div");
    div.innerHTML = window.etiquetteObjetHTML(o);
    const span = div.querySelector(".carac-objet");
    return { modele: m.modele, texte: div.textContent, carac: span ? span.textContent : null,
             // Une armure en affiche plusieurs (« Intelligence ou Charisme ») :
             // c'est window.texteCaracsObjet qui les écrit.
             attendue: window.texteCaracsObjet(m), type: window.libelleTypeObjet(m.type) };
  }));
  const sansCarac = catalogue.filter(c => !c.carac || c.carac !== c.attendue);
  verifier("les " + catalogue.length + " modèles du catalogue affichent leur carac", sansCarac.length === 0,
           sansCarac.map(c => c.modele).join(", "));
  const malPlacees = catalogue.filter(c => !c.texte.includes(c.type + " " + c.carac));
  verifier("la carac suit immédiatement le type", malPlacees.length === 0,
           malPlacees.slice(0, 2).map(c => c.texte).join(" | ") || `(ex. « ${catalogue[0].texte} »)`);
  verifier("« DEXTÉRITÉ » s'écrit « Dextérité »",
           await p.evaluate(() => window.libelleCaracObjet("DEXTÉRITÉ")) === "Dextérité");

  // Le vrai rendu, dans une vraie carte du butin personnel.
  await p.evaluate(() => {
    const bloc = window.PARTIE_DATA.Butin.parPersonnage.J1;
    bloc.items = [window.__objet("Bouclier léger", "Caetra"), window.__objet("Couteau", "Couteau")];
    bloc.decisions = {};
    window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  });
  const rendu = await p.evaluate(() => {
    const etiquette = document.querySelector("#butin-vue-personnel .etiquette-rarete");
    const span = etiquette && etiquette.querySelector(".carac-objet");
    if (!span) return null;
    const s = getComputedStyle(span), e = getComputedStyle(etiquette);
    return { texte: etiquette.textContent, couleur: s.color, couleurEtiquette: e.color,
             taille: parseFloat(s.fontSize), tailleEtiquette: parseFloat(e.fontSize), casse: s.textTransform };
  });
  verifier("la carte du butin montre la carac", !!rendu, rendu ? `(« ${rendu.texte} »)` : "(aucun .carac-objet)");
  if (rendu) {
    verifier("… en marron", rendu.couleur === "rgb(122, 74, 30)", `(${rendu.couleur})`);
    verifier("… et non dans la couleur de la rareté", rendu.couleur !== rendu.couleurEtiquette,
             `(étiquette ${rendu.couleurEtiquette})`);
    verifier("… en plus petit que l'étiquette", rendu.taille < rendu.tailleEtiquette,
             `(${rendu.taille}px < ${rendu.tailleEtiquette}px)`);
    verifier("… sans les majuscules de l'étiquette", rendu.casse === "none", `(${rendu.casse})`);
  }

  // La fiche du héros (app.js) : même étiquette, posée en HTML et non en texte
  // brut — sinon on lirait « <span class=... » à l'écran.
  const fiche = await p.evaluate(() => {
    window.afficherEmplacementEquipement("main-droite", window.__objet("Épée courte", "Glaive"));
    const el = document.getElementById("emplacement-main-droite-rarete");
    const span = el.querySelector(".carac-objet");
    return { texte: el.textContent, carac: span ? span.textContent : null,
             couleur: span ? getComputedStyle(span).color : null };
  });
  verifier("la fiche perso montre la carac de l'arme portée", fiche.carac === "Force",
           `(« ${fiche.texte} »)`);
  verifier("… en marron, elle aussi", fiche.couleur === "rgb(122, 74, 30)", `(${fiche.couleur})`);
  verifier("… et pas de balise lue comme du texte", !fiche.texte.includes("<span"));
}

// =========================================================================
console.log("\n2. LE BUTIN PERSONNEL : « PRENDRE » DEMANDE LA MAIN");
{
  // Pliors porte une Pelta en main gauche, rien en main droite.
  await p.evaluate(() => {
    window.__equiper(null, window.__objet("Bouclier léger", "Pelta"));
    window.__equipements = [];
    window.afficherFenetreButin(window.PARTIE_DATA.Butin);
  });

  // Un second bouclier : il ne peut que remplacer la Pelta.
  await p.locator(".carte-loot", { hasText: "Caetra" }).locator(".btn-loot-mini.prendre").click();
  await p.waitForTimeout(150);
  verifier("« Prendre » ouvre la fenêtre de choix", await popupOuvert());
  const pourBouclier = await boutonsPopup();
  verifier("un 2e bouclier ne propose QUE la main du premier",
           pourBouclier.length === 2 && /^Main gauche/.test(pourBouclier[0]) && /Annuler/.test(pourBouclier[1]),
           `(${pourBouclier.join(" | ")})`);
  verifier("… en disant pourquoi : « un seul bouclier à la fois »",
           /seul bouclier/i.test(await p.evaluate(() => document.getElementById("message-confirmation-equip").innerText)));
  await cliquerPopup("Main gauche");
  verifier("la Caetra remplace la Pelta, en main gauche",
           await derniereEcriture() === "Equip_Main_Gauche=Caetra", `(${await derniereEcriture()})`);

  // Une arme à une main : les deux mains sont proposées, le joueur choisit.
  await p.locator(".carte-loot", { hasText: "Couteau" }).locator(".btn-loot-mini.prendre").click();
  await p.waitForTimeout(150);
  const pourArme = await boutonsPopup();
  verifier("une arme à une main propose les deux mains",
           pourArme.some(t => /^Main droite/.test(t)) && pourArme.some(t => /^Main gauche/.test(t)),
           `(${pourArme.join(" | ")})`);
  verifier("le titre reste « Équiper cet objet ? »",
           await p.evaluate(() => document.getElementById("titre-confirmation-equip").innerText) === "Équiper cet objet ?");
  await cliquerPopup("Main droite");
  verifier("le Couteau va dans la main choisie (droite)",
           await derniereEcriture() === "Equip_Main_Droite=Couteau", `(${await derniereEcriture()})`);
}

// =========================================================================
console.log("\n3. LE PARTAGE COMMUN : « SE PLACER » DEMANDE LA MAIN");
// Le butin passe au partage, avec trois objets sur la table. Pliors tient un
// Glaive à droite et une Pelta à gauche.
const ouvrirPartage = (objets) => p.evaluate((objets) => {
  const b = window.PARTIE_DATA.Butin;
  b.etape = "partage"; b.resolu = false; b.poolValides = [];
  b.participants = ["J1"];
  b.pool = objets.map(([modele, nom]) => ({ ...window.__objet(modele, nom), candidats: [], gagnant: null }));
  window.__equipements = [];
  window.afficherFenetreButin(b);
  return b.pool.map(it => it.uid);
}, objets);
const carte = (nom) => p.locator("#butin-grille-partage .carte-loot", { hasText: nom });
const itemPool = (nom) => p.evaluate((nom) =>
  JSON.parse(JSON.stringify(window.PARTIE_DATA.Butin.pool.find(it => it.nom === nom))), nom);
{
  await p.evaluate(() => window.__equiper(window.__objet("Épée courte", "Glaive"), window.__objet("Bouclier léger", "Pelta")));
  await ouvrirPartage([["Couteau", "Couteau"], ["Armure légère", "Chiton"]]);

  await carte("Couteau").locator("button", { hasText: "Se placer" }).click();
  await p.waitForTimeout(150);
  verifier("« Se placer » sur une arme ouvre la fenêtre de choix", await popupOuvert());
  verifier("… qui dit que tout dépend du tirage",
           /si tu le remportes/i.test(await p.evaluate(() => document.getElementById("titre-confirmation-equip").innerText)));
  const choix = await boutonsPopup();
  verifier("les deux mains sont proposées, avec ce qu'elles remplaceraient",
           choix.some(t => /^Main droite.*Glaive/.test(t)) && choix.some(t => /^Main gauche.*Pelta/.test(t)),
           `(${choix.join(" | ")})`);
  verifier("rien n'est placé tant que le joueur n'a pas choisi",
           (await itemPool("Couteau")).candidats.length === 0);

  await cliquerPopup("Main gauche");
  const couteau = await itemPool("Couteau");
  verifier("choisir « Main gauche » place Pliors sur l'objet",
           couteau.candidats.length === 1 && couteau.candidats[0] === "J1", `(${JSON.stringify(couteau.candidats)})`);
  verifier("… et retient la main voulue", (couteau.mains || {}).J1 === "Gauche", `(${JSON.stringify(couteau.mains)})`);
  verifier("… sans rien équiper avant le tirage", await p.evaluate(() => window.__equipements.length === 0));
  const convoite = await carte("Couteau").locator(".candidats-loot").innerText();
  verifier("la carte dit « Pliors (main gauche) »", /Pliors \(main gauche\)/.test(convoite), `(${convoite})`);

  // Se retirer efface aussi la main retenue.
  await carte("Couteau").locator("button", { hasText: "Se retirer" }).click();
  await p.waitForTimeout(150);
  const retire = await itemPool("Couteau");
  verifier("« Se retirer » reste immédiat et oublie la main",
           !(await popupOuvert()) && retire.candidats.length === 0 && !(retire.mains || {}).J1,
           `(${JSON.stringify(retire)})`.slice(0, 80));
  await carte("Couteau").locator("button", { hasText: "Se placer" }).click();
  await p.waitForTimeout(150);
  await cliquerPopup("Main gauche");

  // Une armure n'a qu'une place : pas de question.
  await carte("Chiton").locator("button", { hasText: "Se placer" }).click();
  await p.waitForTimeout(150);
  verifier("une armure se place sans question (une seule place)",
           !(await popupOuvert()) && (await itemPool("Chiton")).candidats.includes("J1"));

  await p.click("#btn-valider-butin-partage");
  await p.waitForTimeout(300);
  const ecritures = await p.evaluate(() => window.__equipements.map(e => e.maj));
  const couteauEcrit = ecritures.find(m => Object.values(m).some(o => o && o.nom === "Couteau"));
  verifier("gagné, le Couteau part dans la main CHOISIE (gauche)",
           couteauEcrit && Object.keys(couteauEcrit).join() === "Equip_Main_Gauche",
           `(${couteauEcrit ? Object.keys(couteauEcrit).join() : "rien d'écrit"})`);
  verifier("le Glaive, en main droite, n'est pas touché",
           await p.evaluate(() => (window.PERSOS_PARTIE[0].equipMainDroite || {}).nom) === "Glaive");
  const objetEcrit = couteauEcrit ? couteauEcrit.Equip_Main_Gauche : {};
  verifier("la fiche ne reçoit que l'objet (ni candidats, ni mains, ni gagnant)",
           objetEcrit && !("candidats" in objetEcrit) && !("mains" in objetEcrit) && !("gagnant" in objetEcrit),
           `(${Object.keys(objetEcrit || {}).join(",")})`);
  verifier("l'armure est équipée elle aussi",
           ecritures.some(m => m.Equip_Armure && m.Equip_Armure.nom === "Chiton"));
}

// =========================================================================
console.log("\n4. JAMAIS DEUX BOUCLIERS — PAR AUCUNE PORTE");
{
  // Pliors : main droite LIBRE, Pelta à gauche. L'ancien réflexe « la main
  // libre d'abord » aurait posé le second bouclier à droite.
  await p.evaluate(() => window.__equiper(null, window.__objet("Bouclier léger", "Pelta")));
  await ouvrirPartage([["Bouclier intermédiaire", "Aspis"]]);

  await carte("Aspis").locator("button", { hasText: "Se placer" }).click();
  await p.waitForTimeout(150);
  const aspis = await itemPool("Aspis");
  verifier("un 2e bouclier se place sans question : une seule main possible",
           !(await popupOuvert()) && aspis.candidats.includes("J1"));
  verifier("… et c'est la main du premier bouclier qui est retenue",
           (aspis.mains || {}).J1 === "Gauche", `(${JSON.stringify(aspis.mains)})`);
  const convoite = await carte("Aspis").locator(".candidats-loot").innerText();
  verifier("la carte l'annonce : « Pliors (main gauche) »", /Pliors \(main gauche\)/.test(convoite), `(${convoite})`);

  await p.click("#btn-valider-butin-partage");
  await p.waitForTimeout(300);
  const j1 = await p.evaluate(() => ({ d: (window.PERSOS_PARTIE[0].equipMainDroite || {}).nom || null,
                                       g: (window.PERSOS_PARTIE[0].equipMainGauche || {}).nom || null }));
  verifier("gagnée, l'Aspis REMPLACE la Pelta — la main droite reste libre",
           j1.g === "Aspis" && j1.d === null, `(droite=${j1.d}, gauche=${j1.g})`);

  // Une candidature d'avant cette règle (aucune main retenue), ou une main
  // devenue interdite entre-temps : l'équipement se redresse de lui-même.
  const sansMain = await p.evaluate(async () => {
    window.__equiper(null, window.__objet("Bouclier léger", "Pelta"));
    await window.equiperObjetButin("J1", window.__objet("Bouclier lourd", "Scutum"));
    const j = window.PERSOS_PARTIE[0];
    return { d: (j.equipMainDroite || {}).nom || null, g: (j.equipMainGauche || {}).nom || null };
  });
  verifier("sans main retenue, le bouclier gagné remplace le premier",
           sansMain.g === "Scutum" && sansMain.d === null, `(droite=${sansMain.d}, gauche=${sansMain.g})`);

  const mainInterdite = await p.evaluate(async () => {
    window.__equiper(null, window.__objet("Bouclier léger", "Pelta"));
    await window.equiperObjet("J1", window.__objet("Bouclier intermédiaire", "Clipeus"), "Droite");
    const j = window.PERSOS_PARTIE[0];
    return { d: (j.equipMainDroite || {}).nom || null, g: (j.equipMainGauche || {}).nom || null };
  });
  verifier("même en demandant la main droite, equiperObjet refuse le 2e bouclier",
           mainInterdite.g === "Clipeus" && mainInterdite.d === null,
           `(droite=${mainInterdite.d}, gauche=${mainInterdite.g})`);

  // Ce que la règle ne doit PAS empêcher.
  const permis = await p.evaluate(() => {
    const j = window.PERSOS_PARTIE[0];
    const bouclier = window.__objet("Bouclier léger", "Caetra");
    const res = {};
    window.__equiper(null, null);
    res.mainsVides = window.mainsPossibles(j, bouclier).join("+");
    window.__equiper(window.__objet("Épée courte", "Glaive"), null);
    res.aCoteDuneArme = window.mainsPossibles(j, bouclier).join("+");
    window.__equiper(null, window.__objet("Bouclier léger", "Pelta"));
    res.armeAcoteDuBouclier = window.mainsPossibles(j, window.__objet("Couteau", "Couteau")).join("+");
    const deuxMains = window.__objet("Hache à deux mains", "Labrys");
    window.__equiper(deuxMains, deuxMains);
    res.apresDeuxMains = window.mainsPossibles(j, bouclier).join("+");
    return res;
  });
  verifier("mains vides : un bouclier va où l'on veut", permis.mainsVides === "Droite+Gauche", `(${permis.mainsVides})`);
  verifier("à côté d'une arme : les deux mains restent possibles",
           permis.aCoteDuneArme === "Droite+Gauche", `(${permis.aCoteDuneArme})`);
  verifier("une arme à côté d'un bouclier : les deux mains restent possibles",
           permis.armeAcoteDuBouclier === "Droite+Gauche", `(${permis.armeAcoteDuBouclier})`);
  verifier("après une arme à deux mains : un bouclier va où l'on veut",
           permis.apresDeuxMains === "Droite+Gauche", `(${permis.apresDeuxMains})`);
}

verifier("aucune erreur JS pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
