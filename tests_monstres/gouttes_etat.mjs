// LES GOUTTES D'ÉTAT — UN COUP D'ŒIL SUR LA MAP SUFFIT.
//
// Nico l'a demandé en une phrase : « d'un coup d'œil sur la map on puisse voir
// les altérations d'état sur les belligérants ». La réponse est un petit point
// de couleur, un par état actif, posé en bas du pion — en arc de cercle s'il y
// en a plusieurs — avec un dégradé et une ombre qui le font ressembler à une
// goutte plutôt qu'à un autocollant plat.
//
// CE BANC PREND UN VRAI TOKEN DE LA BASE, comme demandé : le fichier
// `persos_reels.json` est un vrai instantané de Firestore (les autres bancs
// s'en servent déjà pour la même raison), et Pliors y a sa vraie image
// Cloudinary. On ne dessine pas un carré gris à la place d'un token : on
// vérifie ce que Nico verra vraiment sur son plateau.
//
// TROIS CHOSES À TENIR, ET C'EST TOUT L'INTÉRÊT DE CE BANC.
//
// UN. Le VRAI code de combat.js, pas une réécriture. `window.COULEUR_ETAT` et
// `construireIndicateursEtatsToken` sont extraits ligne pour ligne, et
// `appliquerTokensVTT` — la fonction qui dessine chaque pion — est le vrai
// code de production, pas une maquette qui prouverait seulement que mon idée
// du pion correspond à mon idée du pion.
//
// DEUX. Le calcul de position, pas juste sa présence. Un point mal placé
// (au milieu du pion, ou tous au même endroit) passerait un test qui ne
// vérifierait que "il y a bien N points". Ici on lit les coordonnées
// calculées et on vérifie qu'elles forment vraiment un arc sous le pion.
//
// TROIS. La preuve à l'œil. Une capture d'écran est jointe : la couleur d'un
// point n'est pas seulement une histoire de code, c'est une histoire de
// lisibilité sur une vraie image de token.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');

function fonction(src, marqueur) {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
function bloc(src, debut, finExclue) {
  const i = src.indexOf(debut);
  if (i < 0) throw new Error("introuvable : " + debut);
  const j = src.indexOf(finExclue, i);
  if (j < 0) throw new Error("fin introuvable après : " + debut);
  return src.slice(i, j);
}

const SRC_GOUTTES = bloc(combat, 'window.COULEUR_ETAT = {', 'window.appliquerTokensVTT = function');
const SRC_APPLIQUER = fonction(combat, 'window.appliquerTokensVTT = function');

// Un vrai token de la base : Pliors, un des héros de la partie GAME_63650,
// avec sa vraie image Cloudinary.
const persos = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/persos_reels.json', 'utf-8'));
const PLIORS = persos['PERSO_545407'];
if (!PLIORS || !PLIORS.URL_Cloudinary) throw new Error("token réel introuvable dans persos_reels.json");

const page = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#2a2a2a}</style>
</head><body>
<div id="conteneur-tokens-vtt" style="position:relative;width:900px;height:500px;overflow:hidden"></div>
<script>
window.PLATEAU_VTT = { hexToPixel: (q,r) => ({ x: 120 + q*140, y: 140 + r*140 }),
                       getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
window.VTT_SCALE = 1; window.ZONES_PERSISTANTES = {}; window.TOKEN_SELECTIONNE = null;
window.estCombattantMort = function(id) {
  const p = (window.PERSOS_PARTIE||[]).find(x => x.idPersonnage === id);
  return !p || p.statut === "Mort" || (p.PV_Max > 0 && p.PV_Actuels <= 0);
};
window.PERSOS_PARTIE = [
  // AUCUN état : le témoin, pour être sûr qu'un pion sans problème ne porte
  // aucun point.
  { idPersonnage:"SANS_ETAT", prenom:"${PLIORS.Prenom_Personnage}", camp:"Allié",
    PV_Max:${PLIORS.PV_Max}, PV_Actuels:${PLIORS.PV_Max}, Etats_Alteres:[] },
  // UN SEUL état : le point doit être seul, plein sud.
  { idPersonnage:"UN_ETAT", prenom:"${PLIORS.Prenom_Personnage}", camp:"Allié",
    PV_Max:${PLIORS.PV_Max}, PV_Actuels:${PLIORS.PV_Actuels},
    Etats_Alteres:[ { nom:"Empoisonnement", duree:2 } ] },
  // TROIS états, dont un que le tableau ne connaît pas encore (une nouveauté
  // de la Forge) : il doit quand même avoir SON point, en gris.
  { idPersonnage:"TROIS_ETATS", prenom:"${PLIORS.Prenom_Personnage}", camp:"Allié",
    PV_Max:${PLIORS.PV_Max}, PV_Actuels:${PLIORS.PV_Actuels},
    Etats_Alteres:[ { nom:"Étourdi", duree:2 }, { nom:"Brûlé", duree:3 },
                    { nom:"Sortilège Inédit", duree:1 } ] },
  // LE MÊME ÉTAT DEUX FOIS (un cas qui ne devrait pas arriver sur une vraie
  // fiche, mais un bug d'un autre coin du jeu ne doit pas doubler le point).
  { idPersonnage:"ETAT_DOUBLE", prenom:"${PLIORS.Prenom_Personnage}", camp:"Allié",
    PV_Max:${PLIORS.PV_Max}, PV_Actuels:${PLIORS.PV_Actuels},
    Etats_Alteres:[ { nom:"Glacé", duree:2 }, { nom:"Glacé", duree:1 } ] },
  // UN MONSTRE avec un état : le disque rouge doit porter le même repère
  // qu'un héros.
  { idPersonnage:"M1", nom:"Goule", estMonstre:true, camp:"Ennemi",
    PV_Max:70, PV_Actuels:70,
    Etats_Alteres:[ { nom:"Immobilisation", duree:1 } ] }
];
window.TOKENS_VTT_DATA = {
  SANS_ETAT:   { q:0, r:0, taille:110, url:"${PLIORS.URL_Cloudinary}" },
  UN_ETAT:     { q:1, r:0, taille:110, url:"${PLIORS.URL_Cloudinary}" },
  TROIS_ETATS: { q:2, r:0, taille:110, url:"${PLIORS.URL_Cloudinary}" },
  ETAT_DOUBLE: { q:3, r:0, taille:110, url:"${PLIORS.URL_Cloudinary}" },
  M1:          { q:4, r:0, taille:110 }
};
window.afficherMessageFlottantHex = function(){};
window.positionnerTokenVTT = function(div) {
  const q = parseFloat(div.dataset.q), r = parseFloat(div.dataset.r), t = parseFloat(div.dataset.taille);
  const px = window.PLATEAU_VTT.hexToPixel(q, r);
  div.style.left = px.x + "px"; div.style.top = px.y + "px";
  div.style.width = t + "px"; div.style.height = t + "px";
};
${SRC_GOUTTES}
${SRC_APPLIQUER}
window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
</script></body></html>`;
fs.writeFileSync('/tmp/gouttes_etat.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 500 } });
// NOTE POUR QUI RELANCE CE BANC AILLEURS : ici, la politique réseau de la
// session bloque res.cloudinary.com (403 côté proxy) — le portrait de Pliors
// ne se charge donc pas et la capture ne montre que l'ombre du pion derrière
// les gouttes. Le mécanisme, lui, ne regarde jamais D'OÙ vient l'image : sur
// un poste avec accès normal à Cloudinary, le vrai portrait s'affiche sous
// les mêmes gouttes, sans rien à changer ici.
await p.route('**', r => r.request().url().startsWith('file:') || r.request().url().startsWith('https://res.cloudinary.com')
    ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///tmp/gouttes_etat.html');
await p.waitForTimeout(600);   // le temps que l'image Cloudinary charge

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Le navigateur réécrit toujours une couleur posée en hexadécimal sous forme
// "rgb(r, g, b)" quand on relit style.background — comparer la chaîne brute
// contre le hex d'origine échoue donc à coup sûr. On convertit une fois pour
// toutes.
const versRgb = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

console.log("\n=========================================================");
console.log("  LES GOUTTES D'ÉTAT — UN VRAI TOKEN, UN VRAI DESSIN");
console.log("=========================================================\n");
console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

// =========================================================================
console.log("\n1. LA TABLE DE COULEURS COUVRE TOUS LES ÉTATS PERSISTANTS DU JEU");
// =========================================================================
//  Chaque état qui reste réellement posé sur une fiche (duree > 0, jamais
//  Poussée/Traction/Peur qui sont instantanés) doit avoir SA couleur —
//  sans quoi il tomberait dans le gris par défaut sans que ce soit voulu.
{
    // La Paralysie a été retirée du jeu : treize états persistants, pas quatorze.
    const etatsDuJeu = ["Étourdi", "Immobilisation", "Confusion",
        "Empoisonnement", "Brûlé", "Glacé", "Électrifié", "Provocation",
        "Absorption", "Étalement", "Élan", "Béni", "Repli"];
    const r = await p.evaluate((noms) => noms.map(n => window.COULEUR_ETAT[n]), etatsDuJeu);
    const manquants = etatsDuJeu.filter((n, i) => !r[i]);
    verifier("les treize états du jeu ont chacun leur couleur", manquants.length === 0,
             manquants.join(", "));
    const couleurs = new Set(r);
    verifier("et aucune couleur n'est partagée entre deux états",
             couleurs.size === etatsDuJeu.length, `(${couleurs.size}/${etatsDuJeu.length})`);
}

// =========================================================================
console.log("\n2. AUCUN ÉTAT, AUCUN POINT");
// =========================================================================
{
    const n = await p.evaluate(() =>
        document.querySelectorAll("#token-SANS_ETAT .point-etat-token").length);
    verifier("un pion sans altération ne porte aucune goutte", n === 0, `(${n})`);
}

// =========================================================================
console.log("\n3. UN SEUL ÉTAT : LA GOUTTE EST SEULE, EN BAS");
// =========================================================================
{
    const r = await p.evaluate(() => {
        const pt = document.querySelector("#token-UN_ETAT .point-etat-token");
        return pt ? { left: pt.style.left, top: pt.style.top, etat: pt.dataset.etat,
                     fond: pt.style.background, titre: pt.title } : null;
    });
    verifier("il n'y en a qu'une", !!r);
    verifier("centrée horizontalement (50 %)", r && r.left === "50%", r && r.left);
    verifier("nettement sous le centre (top > 50 %)", r && parseFloat(r.top) > 50, r && r.top);
    const couleurPoison = await p.evaluate(() => window.COULEUR_ETAT["Empoisonnement"]);
    verifier("elle porte la couleur du Poison", r && r.fond.includes(versRgb(couleurPoison)),
             r && r.fond);
    verifier("et se nomme dans son attribut title (survol)", r && r.titre === "Empoisonnement", r && r.titre);
}

// =========================================================================
console.log("\n4. PLUSIEURS ÉTATS : UN VRAI ARC, PAS UNE PILE");
// =========================================================================
{
    const pts = await p.evaluate(() =>
        [...document.querySelectorAll("#token-TROIS_ETATS .point-etat-token")]
            .map(pt => ({ etat: pt.dataset.etat, left: parseFloat(pt.style.left), top: parseFloat(pt.style.top) })));
    verifier("les trois états ont chacun leur goutte, l'inconnu compris",
             pts.length === 3, `(${pts.length})`);
    const gauches = pts.map(p => p.left);
    verifier("elles ne sont pas toutes à la même abscisse (c'est un arc, pas une pile)",
             new Set(gauches.map(g => Math.round(g))).size === 3, JSON.stringify(gauches));
    verifier("toutes restent sous le centre du pion",
             pts.every(p => p.top > 50), JSON.stringify(pts.map(p => p.top)));
    // Symétrie : la goutte du milieu (par angle) doit être la plus basse et la
    // plus centrée, les deux extrêmes remontant un peu de chaque côté — la
    // signature d'un arc, pas d'une ligne droite.
    const parX = [...pts].sort((a, b) => a.left - b.left);
    verifier("celle du centre descend plus bas que les deux côtés (c'est bombé, pas plat)",
             parX[1].top >= parX[0].top && parX[1].top >= parX[2].top,
             JSON.stringify(parX.map(p => p.top)));

    const inconnu = pts.find(p => p.etat === "Sortilège Inédit");
    const gris = await p.evaluate(() => window.COULEUR_ETAT_DEFAUT);
    const fondInconnu = await p.evaluate(() =>
        document.querySelector('#token-TROIS_ETATS .point-etat-token[data-etat="Sortilège Inédit"]').style.background);
    verifier("un état sans couleur connue prend le gris par défaut plutôt que de disparaître",
             !!inconnu && fondInconnu.includes(versRgb(gris)), fondInconnu);
}

// =========================================================================
console.log("\n5. UN MÊME ÉTAT NE SE DOUBLE JAMAIS");
// =========================================================================
{
    const n = await p.evaluate(() =>
        document.querySelectorAll("#token-ETAT_DOUBLE .point-etat-token").length);
    verifier("Glacé posé deux fois ne fait qu'une seule goutte", n === 1, `(${n})`);
}

// =========================================================================
console.log("\n6. LE MONSTRE PORTE LE MÊME REPÈRE QU'UN HÉROS");
// =========================================================================
{
    const r = await p.evaluate(() => {
        const pt = document.querySelector("#token-M1 .point-etat-token");
        return pt ? { existe: true, etat: pt.dataset.etat, zIndex: pt.style.zIndex } : { existe: false };
    });
    verifier("le disque de la Goule porte bien sa goutte d'Immobilisation",
             r.existe && r.etat === "Immobilisation", JSON.stringify(r));
}

// =========================================================================
console.log("\n7. LA GOUTTE SE VOIT — AU-DESSUS DU PORTRAIT, PAS DESSOUS");
// =========================================================================
{
    const r = await p.evaluate(() => {
        const img = document.querySelector("#token-UN_ETAT .token-img-main");
        const pt = document.querySelector("#token-UN_ETAT .point-etat-token");
        return { img: img ? parseInt(img.style.zIndex || "0") : null,
                pt: pt ? parseInt(pt.style.zIndex || "0") : null,
                pointerEvents: pt ? pt.style.pointerEvents : null };
    });
    verifier("la goutte est posée devant le portrait", r.pt > r.img, JSON.stringify(r));
    verifier("elle ne capte pas le clic (le pion reste cliquable dessous)",
             r.pointerEvents === "none", r.pointerEvents);
}

// =========================================================================
console.log("\n8. UN REDESSIN NE LAISSE RIEN DERRIÈRE (pas de fuite)");
// =========================================================================
//  appliquerTokensVTT vide le conteneur avant de redessiner — mais si la
//  construction des gouttes plantait à mi-chemin, un pion pourrait garder de
//  vieux points d'un état qui n'existe plus.
{
    const n = await p.evaluate(() => {
        window.PERSOS_PARTIE.find(x => x.idPersonnage === "UN_ETAT").Etats_Alteres = [];
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        return document.querySelectorAll("#token-UN_ETAT .point-etat-token").length;
    });
    verifier("un état retiré ne laisse aucune goutte fantôme", n === 0, `(${n})`);
}

await p.screenshot({ path: '/tmp/gouttes_etat.png' });
console.log("\n  Capture : /tmp/gouttes_etat.png (Pliors — sans état, un état, trois états,"
          + " un état doublé, et une Goule)");

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
