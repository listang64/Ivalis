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

const ITEM = (nom, emplacement, effet) => ({
  uid: "loot_" + nom.slice(0, 4), nom, emplacement, effetTexte: effet, image: ""
});

const HEROS = [
  { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié",
    equipArmure: ITEM("Cuirasse du Rempart", "Armure", "+15% Défense Physique"),
    equipMainDroite: ITEM("Lame Fidèle", "Main_Droite", "+10% Dégâts physiques"),
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
    J1: { items: [ITEM("Marteau des Cimes", "Main_Droite", "+20% Dégâts, -10% Esquive"),
                  ITEM("Focaliseur de Jade", "Main_Gauche", "+15% Magie")], decisions: {}, valide: false },
    J2: { items: [ITEM("Manteau des Ombres", "Armure", "+10% Esquive"),
                  ITEM("Dague du Chuchoteur", "Main_Droite", "+25% Critique")],
          decisions: { ["loot_" + "Mant".slice(0,4)]: true, ["loot_" + "Dagu".slice(0,4)]: false }, valide: true }
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
    { ...ITEM("Bouclier du Veilleur", "Main_Gauche", "+20% Défense"), candidats: ["J1"] },
    { ...ITEM("Plates de l'Aube Ancienne", "Armure", "+30% PV Max"), candidats: ["J1", "J2"] },
    { ...ITEM("Grimoire aux Pages Ternies", "Main_Gauche", "+20% Magie"), candidats: [] }
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
    { ...ITEM("Bouclier du Veilleur", "Main_Gauche", "+20% Défense"), gagnant: "J1" },
    { ...ITEM("Plates de l'Aube Ancienne", "Armure", "+30% PV Max"), gagnant: "J2" },
    { ...ITEM("Grimoire aux Pages Ternies", "Main_Gauche", "+20% Magie"), gagnant: null }
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
${SRC_LOOT}
document.getElementById("popup-confirmation-equip").style.display = "flex";
window.remplirComparaisonEquip(
  ${JSON.stringify(ITEM("Lame Fidèle", "Main_Droite", "+10% Dégâts physiques"))},
  ${JSON.stringify(ITEM("Marteau des Cimes", "Main_Droite", "+20% Dégâts, -10% Esquive"))}
);
</script></body></html>`;
fs.writeFileSync('/tmp/apercu_popup_confirmation.html', pagePopup);

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

await b.close();
console.log(ok ? "\nTOUTES LES CAPTURES SE SONT DÉROULÉES SANS ERREUR JS" : "\nDES ERREURS JS SE SONT PRODUITES");
process.exit(ok ? 0 : 1);
