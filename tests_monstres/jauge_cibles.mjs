// LA VIE DES CIBLES PENDANT LE CHOIX.
// Les cibles possibles étaient entourées de rouge, mais rien ne disait ce qu'il
// leur restait de vie : impossible de savoir laquelle on peut achever. Une petite
// jauge s'affiche maintenant sous chacune, le temps du ciblage.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
const moteur = fs.readFileSync('/home/user/Ivalis/moteur_effets.js','utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
function fonction(src, marqueur) {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 3 });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

const resultat = await p.evaluate(({ srcMoteur, srcTokens }) => {
  // La fenêtre de combat est masquée au chargement : sans elle, tout le plateau
  // mesure zéro pixel et aucun contrôle visuel n'a de sens.
  document.documentElement.style.setProperty("--app-h", "600px");
  // Tous les autres écrans (accueil, identification…) recouvrent le plateau :
  // on les écarte pour que la capture d'écran montre vraiment les pions.
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => {
    if (e.id !== "ecran-jeu") e.style.display = "none";
  });
  document.getElementById("ecran-jeu").style.display = "block";
  document.getElementById("fenetre-combat").style.display = "block";

  const dist = (a, b) => Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((-a.q-a.r)-(-b.q-b.r)));
  window.PLATEAU_VTT = {
    hexSize: 30,
    hexToPixel: (q, r) => ({ x: 470 + q*70, y: 200 + r*60 }),
    getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }),
    getHexesInRadius: () => []
  };
  window.VTT_SCALE = 1; window.ZONES_PERSISTANTES = {}; window.TOKEN_SELECTIONNE = null;
  window.positionnerTokenVTT = (div) => {
    const px = window.PLATEAU_VTT.hexToPixel(parseFloat(div.dataset.q), parseFloat(div.dataset.r));
    div.style.left = px.x + "px"; div.style.top = px.y + "px";
    div.style.width = div.dataset.taille + "px"; div.style.height = div.dataset.taille + "px";
  };
  window.estCombattantMort = (id) => {
    const p = (window.PERSOS_PARTIE||[]).find(x => x.idPersonnage === id);
    return !p || p.statut === "Mort" || (p.PV_Max > 0 && p.PV_Actuels <= 0);
  };
  window.afficherMessageFlottantHex = () => {};

  window.PERSOS_PARTIE = [
    { idPersonnage:"J1", prenom:"Pliors", camp:"Allié", PV_Max:42, PV_Actuels:42, Etats_Alteres:[] },
    { idPersonnage:"A1", prenom:"Jade",   camp:"Allié", PV_Max:42, PV_Actuels:20, Etats_Alteres:[] },
    { idPersonnage:"M1", prenom:"Gnoll",  camp:"Ennemi", estMonstre:true, PV_Max:70, PV_Actuels:21, Etats_Alteres:[] },
    { idPersonnage:"M2", prenom:"Ombre",  camp:"Ennemi", estMonstre:true, PV_Max:65, PV_Actuels:65, Etats_Alteres:[] }
  ];
  window.TOKENS_VTT_DATA = { J1:{q:0,r:0,taille:55}, A1:{q:0,r:1,taille:55},
                             M1:{q:2,r:0,taille:55}, M2:{q:3,r:0,taille:55} };
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;

  new Function('window', srcTokens)(window);
  new Function('window','db','doc','updateDoc','setDoc','deleteDoc','deleteField', srcMoteur)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));

  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

  window.ETAT_CIBLAGE = { actif:true, isZone:false, cibleUnique:null,
    attaques:[{ nom:"Attaque légère", isRanged:true, rangeMax:5, isHeal:false, isShield:false, cibles:[] }],
    alterations:[] };
  window.dessinerAnneauxCiblage();

  const lire = (id) => {
    const j = document.querySelector("#token-" + id + " .jauge-cible-ciblage");
    if (!j) return null;
    return { largeur: j.querySelector(".remplissage-jauge-cible").style.width,
             texte: j.querySelector(".texte-jauge-cible").innerText };
  };
  const avant = { M1: lire("M1"), M2: lire("M2"), J1: lire("J1"), A1: lire("A1") };

  // Le chiffre est posé hors de la barre : si un parent le découpe ("overflow"),
  // il est invisible à l'écran alors que le texte existe bien dans le HTML.
  const lisible = (id) => {
    const t = document.querySelector("#token-" + id + " .texte-jauge-cible");
    if (!t) return "aucun texte";
    const rt = t.getBoundingClientRect();
    if (rt.width <= 0 || rt.height <= 0) return "boîte vide";
    let n = t.parentElement;
    while (n && n.id !== "token-" + id) {
      if (getComputedStyle(n).overflow !== "visible") {
        const rn = n.getBoundingClientRect();
        if (rt.top < rn.top - 0.5 || rt.bottom > rn.bottom + 0.5
         || rt.left < rn.left - 0.5 || rt.right > rn.right + 0.5)
          return "rogné par ." + n.className;
      }
      n = n.parentElement;
    }
    return "visible";
  };
  const texteM1 = lisible("M1");

  // La jauge se place SOUS le pion : elle ne doit pas recouvrir le portrait.
  const rToken = document.getElementById("token-M1").getBoundingClientRect();
  const rJauge = document.querySelector("#token-M1 .jauge-cible-ciblage").getBoundingClientRect();
  const sousLePion = rJauge.top >= rToken.bottom - 1;

  // La cible encaisse un coup : la jauge doit suivre au redessin suivant.
  window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1").PV_Actuels = 7;
  window.dessinerAnneauxCiblage();
  const apres = lire("M1");

  return { avant, apres, texteM1, sousLePion,
           debordement: +(rJauge.bottom - rToken.bottom).toFixed(1) };
}, { srcMoteur: moteur, srcTokens: fonction(combat, 'window.appliquerTokensVTT = function') });

// Capture cadrée sur les pions : contrôle visuel de la jauge à sa taille réelle.
const cadre = await p.evaluate(() => {
  // Les portraits des pions viennent du réseau, coupé pendant le test : sans un
  // disque de remplacement, la capture ne montrerait que du noir.
  document.querySelectorAll(".token-vtt").forEach(t => {
    t.style.backgroundColor = "#4a4038";
    t.style.border = "2px solid #c2a878";
  });
  document.getElementById("fenetre-combat").style.backgroundColor = "#2b2b2b";
  // Le menu de jeu et le panneau de gauche recouvrent le plateau : on les écarte
  // le temps de la capture, sinon ils masquent les pions photographiés.
  document.querySelectorAll("#panneau-combat-gauche, #menu-lateral, #ecran-menu, #menu-navigation-bas, #conteneur-icones-carte")
    .forEach(e => e.style.display = "none");
  const r = document.getElementById("token-M1").getBoundingClientRect();
  return { x: Math.max(0, r.left - 45), y: Math.max(0, r.top - 25),
           width: 220, height: 130 };
});
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/jauge_cibles.png', clip: cadre });
const restantes = await p.evaluate(() => {
  window.nettoyerCiblage();
  return document.querySelectorAll(".jauge-cible-ciblage").length;
});

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log(`     ennemi blessé : ${resultat.avant.M1 ? resultat.avant.M1.texte + " (" + resultat.avant.M1.largeur + ")" : "aucune jauge"}`);
console.log(`     ennemi intact : ${resultat.avant.M2 ? resultat.avant.M2.texte + " (" + resultat.avant.M2.largeur + ")" : "aucune jauge"}`);

verifier("une jauge apparaît sous chaque ennemi visable", !!resultat.avant.M1 && !!resultat.avant.M2);
verifier("elle donne les points de vie exacts", resultat.avant.M1.texte === "21 / 70", `(${resultat.avant.M1.texte})`);
verifier("sa longueur suit la vie restante", resultat.avant.M1.largeur === "30%", `(${resultat.avant.M1.largeur})`);
verifier("un ennemi intact a une jauge pleine", resultat.avant.M2.largeur === "100%", `(${resultat.avant.M2.largeur})`);
verifier("le lanceur n'en a pas", resultat.avant.J1 === null);
verifier("un allié non ciblable non plus", resultat.avant.A1 === null);
verifier("elle se met à jour après un coup encaissé",
         resultat.apres && resultat.apres.texte === "7 / 70" && resultat.apres.largeur === "10%",
         resultat.apres ? `(${resultat.apres.texte} → ${resultat.apres.largeur})` : "(disparue)");
verifier("le chiffre des PV est réellement visible", resultat.texteM1 === "visible", `(${resultat.texteM1})`);
verifier("la jauge se pose sous le pion, sans le masquer", resultat.sousLePion,
         `(${resultat.debordement}px sous le bord bas)`);
verifier("tout disparaît à la fin du ciblage", restantes === 0, `(${restantes})`);

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
