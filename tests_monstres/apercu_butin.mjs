// Vérification VISUELLE de l'onglet Inventaire et des fenêtres de butin : on
// charge le vrai style.css et le vrai balisage d'index.html, on les remplit
// avec les vraies fonctions de rendu (loot.js / app.js), et on capture des
// écrans — Nico a demandé "quelque chose de jolie", ça se contrôle à l'œil.
import fs from 'fs';

const style = fs.readFileSync('/home/user/Ivalis/style.css', 'utf-8');

const html = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');
// Le marqueur de fin sert juste à borner la coupe — il n'est JAMAIS inclus,
// sinon un "<!-- commentaire" ouvert et jamais refermé avale tout le reste du
// document (script compris) aux yeux du parseur HTML.
const extraitEntre = (debutMarqueur, finMarqueur) => {
  const d = html.indexOf(debutMarqueur);
  const f = html.indexOf(finMarqueur, d);
  if (d < 0 || f < 0) throw new Error("balisage introuvable : " + debutMarqueur);
  return html.slice(d, f);
};
const MARKUP_INVENTAIRE = extraitEntre('<div id="onglet-inventaire"', '</div>\n\n    <div id="onglet-dev"') + '</div>';
const MARKUP_BUTIN = extraitEntre('<div id="fenetre-butin"', '</div>\n\n<!-- Popup de confirmation') + '</div>';
const MARKUP_POPUP = extraitEntre('<div id="popup-confirmation-equip"', '</div>\n\n<!-- NOUVEAU : On charge le cerveau IA') + '</div>';

const lignesApp = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8').split('\n');
function fonctionApp(marqueur) {
  const d = lignesApp.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable dans app.js : " + marqueur);
  let f = d; for (let i = d + 1; i < lignesApp.length; i++) { if (lignesApp[i] === '};') { f = i; break; } }
  return lignesApp.slice(d, f + 1).join('\n');
}
const SRC_AFFICHER_EMPLACEMENT = fonctionApp('window.afficherEmplacementEquipement = function');
const SRC_CHARGER_INVENTAIRE = fonctionApp('window.chargerOngletInventaire = function');

const SRC_LOOT = fs.readFileSync('/home/user/Ivalis/loot.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');

// Les objets d'exemple sortent du VRAI catalogue : ce qu'on regarde à l'écran
// est donc exactement ce qu'un joueur trouvera en combat, chiffres compris.
const wCatalogue = {};
new Function('window', SRC_OBJETS)(wCatalogue);
const ITEM = (modeleNom, rarete) => {
  const modele = wCatalogue.MODELES_OBJETS.find(m => m.modele === modeleNom);
  const objet = wCatalogue.fabriquerObjet(modele, rarete);
  objet.uid = "loot_" + modeleNom.slice(0, 6).replace(/\s/g, "");
  return objet;
};

const HEROS = [
  { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié",
    equipArmure: ITEM("Armure lourde", "Rare"),
    equipMainDroite: ITEM("Épée courte", "Commun"),
    equipMainGauche: null },
  { idPersonnage: "J2", prenom: "Jade", idJoueur: "P2", camp: "Allié",
    equipArmure: null, equipMainDroite: null, equipMainGauche: null }
];

// --------------------------------------------------------------------------
// Page 1 : l'onglet Inventaire — un héros équipé, puis un héros tout neuf.
// --------------------------------------------------------------------------
function pageInventaire(idPersonnage, or) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}</style>
  <style>body{background:#1b120a;padding:40px;font-family:'Almendra',serif;}
  .demo-fiche{background:#e8d5a5;border-radius:14px;padding:24px;width:360px;}</style></head>
  <body>
  <div class="demo-fiche">${MARKUP_INVENTAIRE.replace('class="contenu-onglet"', 'class="contenu-onglet actif"')}</div>
  <script>
  window.PERSOS_PARTIE = ${JSON.stringify(HEROS)};
  ${SRC_AFFICHER_EMPLACEMENT}
  ${SRC_CHARGER_INVENTAIRE}
  window.chargerOngletInventaire(${JSON.stringify(idPersonnage)},
    window.PERSOS_PARTIE.find(p => p.idPersonnage === ${JSON.stringify(idPersonnage)}));
  document.getElementById("champ-or-perso").value = ${or};
  </script></body></html>`;
}
fs.writeFileSync('/tmp/apercu_inventaire_equipe.html', pageInventaire("J1", 340));
fs.writeFileSync('/tmp/apercu_inventaire_vide.html', pageInventaire("J2", 0));

// --------------------------------------------------------------------------
// Page 2 : la fenêtre de butin — vue personnelle, vue partage, vue fin.
// --------------------------------------------------------------------------
function pageButin(etape, mesPersonnages) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}
  :root{--app-h:100vh;}</style></head>
  <body style="margin:0;">
  ${MARKUP_BUTIN}
  ${MARKUP_POPUP}
  <script>
  window.PERSOS_PARTIE = ${JSON.stringify(HEROS)};
  ${SRC_OBJETS}
  ${SRC_LOOT}
  document.getElementById("fenetre-butin").style.display = "flex";
  document.getElementById("butin-titre").innerText = ${JSON.stringify(etape.titre)};
  document.getElementById("butin-sous-titre").innerText = ${JSON.stringify(etape.sousTitre)};
  window.afficherEquipementActuelButin(${JSON.stringify(mesPersonnages)});
  document.getElementById("${etape.vue}").style.display = "block";
  ${etape.rendu}
  </script></body></html>`;
}

const butinPersonnel = {
  parPersonnage: {
    J1: { items: [ITEM("Hache", "Très rare"),
                  ITEM("Bagues DPS", "Rare")], decisions: {}, valide: false },
    J2: { items: [ITEM("Armure légère", "Rare"),
                  ITEM("Dague", "Épique")],
          decisions: { ["loot_Armure"]: true, ["loot_Dague"]: false }, valide: true }
  }
};
const pagePersonnel = pageButin(
  { titre: "Butin de guerre", sousTitre: "Choisis ce que tu gardes — l'objet remplacé est perdu pour de bon.",
    vue: "butin-vue-personnel",
    rendu: `window.rendreVuePersonnelleButin(${JSON.stringify(butinPersonnel)}, window.PERSOS_PARTIE);` },
  HEROS);
fs.writeFileSync('/tmp/apercu_butin_personnel.html', pagePersonnel);

const butinPartage = {
  pool: [
    { ...ITEM("Bouclier lourd", "Rare"), candidats: ["J1"] },
    { ...ITEM("Hache à deux mains", "Épique"), candidats: ["J1", "J2"] },
    { ...ITEM("Fronde", "Très rare"), candidats: [] }
  ],
  participants: ["J1", "J2"], poolValides: ["J2"]
};
const pagePartage = pageButin(
  { titre: "Partage du butin", sousTitre: "Place-toi sur un ou plusieurs objets restants. Plusieurs prétendants ? Le sort tranchera.",
    vue: "butin-vue-partage",
    rendu: `window.rendreVuePartageButin(${JSON.stringify(butinPartage)}, ["J1"]);` },
  HEROS);
fs.writeFileSync('/tmp/apercu_butin_partage.html', pagePartage);

const butinFin = {
  pool: [
    { ...ITEM("Bouclier lourd", "Rare"), gagnant: "J1" },
    { ...ITEM("Hache à deux mains", "Épique"), gagnant: "J2" },
    { ...ITEM("Fronde", "Très rare"), gagnant: null }
  ]
};
const pageFin = pageButin(
  { titre: "Butin réparti", sousTitre: "Voici ce que chacun a récupéré.",
    vue: "butin-vue-fin",
    rendu: `window.rendreVueFinButin(${JSON.stringify(butinFin)}, ["J1"]);` },
  HEROS);
fs.writeFileSync('/tmp/apercu_butin_fin.html', pageFin);

// --------------------------------------------------------------------------
// Page 3 : le popup de confirmation avant/après.
// --------------------------------------------------------------------------
const pagePopup = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}
:root{--app-h:100vh;}</style></head>
<body style="margin:0;">
${MARKUP_POPUP}
<script>
${SRC_OBJETS}
${SRC_LOOT}
document.getElementById("popup-confirmation-equip").style.display = "flex";
window.remplirComparaisonEquip(
  ${JSON.stringify(ITEM("Épée courte", "Commun"))},
  ${JSON.stringify(ITEM("Hache", "Très rare"))}
);
</script></body></html>`;
fs.writeFileSync('/tmp/apercu_popup_confirmation.html', pagePopup);

// Le cas le plus délicat : une arme à deux mains détruit CE QUE PORTENT LES
// DEUX MAINS. Le joueur doit voir les deux objets sacrifiés d'un coup.
const pagePopupDeuxMains = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}
:root{--app-h:100vh;}</style></head>
<body style="margin:0;">
${MARKUP_POPUP}
<script>
${SRC_OBJETS}
${SRC_LOOT}
document.getElementById("popup-confirmation-equip").style.display = "flex";
document.getElementById("actions-confirmation-equip").innerHTML =
  '<button class="btn-parametres" style="background-color:#1b6e3a; border-color:#0f4021;">Équiper à deux mains (remplace Glaive et Scutum)</button>'
  + '<button class="btn-parametres">Annuler</button>';
window.remplirComparaisonEquip(
  [${JSON.stringify(ITEM("Épée courte", "Commun"))}, ${JSON.stringify(ITEM("Bouclier lourd", "Rare"))}],
  ${JSON.stringify(ITEM("Hache à deux mains", "Épique"))}
);
</script></body></html>`;
fs.writeFileSync('/tmp/apercu_popup_deux_mains.html', pagePopupDeuxMains);

// --------------------------------------------------------------------------
// Captures.
// --------------------------------------------------------------------------
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();

async function capturer(fichier, sortie, taille) {
  const p = await b.newPage({ viewport: taille || { width: 900, height: 800 } });
  const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto('file://' + fichier);
  await p.waitForTimeout(300);
  await p.screenshot({ path: sortie, fullPage: true });
  console.log(`  ${sortie.padEnd(45)} erreurs JS : ${erreurs.length ? erreurs.join(" | ") : "aucune"}`);
  await p.close();
  return erreurs.length === 0;
}

let ok = true;
console.log("Capture des écrans (onglet Inventaire, fenêtres de butin, popup) :");
ok = await capturer('/tmp/apercu_inventaire_equipe.html', '/tmp/apercu_inventaire_equipe.png', { width: 460, height: 1000 }) && ok;
ok = await capturer('/tmp/apercu_inventaire_vide.html', '/tmp/apercu_inventaire_vide.png', { width: 460, height: 1000 }) && ok;
ok = await capturer('/tmp/apercu_butin_personnel.html', '/tmp/apercu_butin_personnel.png', { width: 700, height: 900 }) && ok;
ok = await capturer('/tmp/apercu_butin_partage.html', '/tmp/apercu_butin_partage.png', { width: 700, height: 900 }) && ok;
ok = await capturer('/tmp/apercu_butin_fin.html', '/tmp/apercu_butin_fin.png', { width: 700, height: 900 }) && ok;
ok = await capturer('/tmp/apercu_popup_confirmation.html', '/tmp/apercu_popup_confirmation.png', { width: 700, height: 600 }) && ok;
ok = await capturer('/tmp/apercu_popup_deux_mains.html', '/tmp/apercu_popup_deux_mains.png', { width: 760, height: 760 }) && ok;

await b.close();
console.log(ok ? "\nTOUTES LES CAPTURES SE SONT DÉROULÉES SANS ERREUR JS" : "\nDES ERREURS JS SE SONT PRODUITES");
process.exit(ok ? 0 : 1);
