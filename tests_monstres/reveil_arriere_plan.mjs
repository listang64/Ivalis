// LE RÉVEIL D'UN ONGLET iPAD — LE POINT SOULEVÉ PAR NICO.
//
// « Sur PC, tout est nickel en temps réel. Sur iPad, ça a sauté le déplacement
// de l'ennemi, et un tour après ça a téléporté l'ennemi. »
//
// Safari (surtout iOS) suspend agressivement les minuteurs et le réseau d'un
// onglet mis en arrière-plan ou l'écran verrouillé — jamais un onglet actif de
// bureau. Une animation de marche gelée en plein trajet pendant ce sommeil ne
// termine jamais sa ligne de nettoyage, et laisse deux verrous coincés à
// "actif" pour de bon :
//   - ANIMATION_VTT_EN_COURS (mouvement.js) bloque alors TOUT redessin du
//     plateau — appliquerTokensVTT s'arrête dessus en tout premier.
//   - PIONS_EN_MOUVEMENT (combat.js) protège CE pion d'une case qui n'est
//     déjà plus la bonne, sans qu'aucune date ne vienne jamais l'expirer.
// Ce banc prouve, sur le VRAI code : (1) qu'une protection trop vieille
// n'aveugle plus positionsProtegees indéfiniment, et (2) que le réveil de
// l'onglet (visibilitychange) lève ces verrous et redessine immédiatement.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const appSrc = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');

function fonction(src, marqueur, finLigne = '};') {
    const lignes = src.split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error("introuvable : " + marqueur);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}
const SRC_PROTEGEES = fonction(combat, 'window.positionsProtegees = function');
const SRC_REVEIL = fonction(appSrc, 'document.addEventListener("visibilitychange"', '});');

console.log("1. UNE PROTECTION TROP VIEILLE N'AVEUGLE PLUS positionsProtegees");
{
    const w = {};
    w.DELAI_MAX_ANIMATION_MS = 20000;
    new Function('window', SRC_PROTEGEES)(w);

    const arrivee = { M1: { q: 9, r: 9 } };
    w.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 } };

    // Une animation "fraîche" (démarrée il y a 1s) protège encore la position locale.
    w.PIONS_EN_MOUVEMENT = { M1: Date.now() - 1000 };
    const recente = w.positionsProtegees(arrivee, null);
    verifier("une protection récente bloque encore la case reçue",
             recente.M1.q === 0, `(q=${recente.M1.q})`);

    // Une animation gelée depuis plus longtemps que la plus longue animation
    // légitime (le cas d'un onglet iPad endormi en plein trajet) ne doit plus
    // bloquer la vraie position, qui a pu avancer entre-temps.
    w.PIONS_EN_MOUVEMENT = { M1: Date.now() - 25000 };
    const vieille = w.positionsProtegees(arrivee, null);
    verifier("une protection trop vieille laisse enfin passer la vraie case",
             vieille.M1.q === 9, `(q=${vieille.M1.q})`);

    // Un ancien test avait posé "true" au lieu d'une date : il ne doit pas se
    // remettre à laisser passer une position par accident (pas de régression
    // de compatibilité sur l'ancien format).
    w.PIONS_EN_MOUVEMENT = { M1: true };
    const booleen = w.positionsProtegees(arrivee, null);
    verifier("l'ancien format (booléen) continue de protéger sans date",
             booleen.M1.q === 0, `(q=${booleen.M1.q})`);
}

console.log("\n2. LE RÉVEIL DE L'ONGLET LÈVE LES VERROUS ET REDESSINE");
{
    const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="conteneur-tokens-vtt" style="position:relative;width:600px;height:400px;overflow:hidden"></div>
<script>
window.PLATEAU_VTT = { hexToPixel: (q,r) => ({ x: 100 + q*60, y: 100 + r*60 }),
                       getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
window.VTT_SCALE = 1; window.ZONES_PERSISTANTES = {}; window.TOKEN_SELECTIONNE = null;
window.DELAI_MAX_ANIMATION_MS = 20000;
window.estCombattantMort = function(id) {
  const p = (window.PERSOS_PARTIE||[]).find(x => x.idPersonnage === id);
  return !p || p.statut === "Mort" || (p.PV_Max > 0 && p.PV_Actuels <= 0);
};
window.PERSOS_PARTIE = [
  { idPersonnage:"M1", prenom:"Gnoll", estMonstre:true, camp:"Ennemi", PV_Max:90, PV_Actuels:90,
    Fatigue_Max:120, fatigueActuelle:120, couleur:"#ff4c4c", Etats_Alteres:[] }
];
window.TOKENS_VTT_DATA = { M1: { q: 5, r: 5, taille: 55 } };
window.afficherMessageFlottantHex = function(){};
window.positionnerTokenVTT = function(div) {
  const q = parseFloat(div.dataset.q), r = parseFloat(div.dataset.r), t = parseFloat(div.dataset.taille);
  const px = window.PLATEAU_VTT.hexToPixel(q, r);
  div.style.left = px.x + "px"; div.style.top = px.y + "px";
  div.style.width = t + "px"; div.style.height = t + "px";
};
${fonction(combat, 'window.appliquerTokensVTT = function')}

// L'état simulant un onglet réveillé après une animation gelée en plein vol :
// les deux verrous sont coincés "actifs", la file d'animations est bloquée.
window.ANIMATION_VTT_EN_COURS = true;
window.PIONS_EN_MOUVEMENT = { M1: Date.now() - 999999 };
window.FILE_ANIMATIONS = new Promise(() => {}); // ne se résout jamais : figée

${SRC_REVEIL}
</script></body></html>`;
    fs.writeFileSync('/tmp/reveil_arriere_plan.html', page);

    const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 640, height: 480 } });
    await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
    await p.goto('file:///tmp/reveil_arriere_plan.html');
    await p.waitForTimeout(100);
    console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

    // Pendant que l'onglet est encore caché, rien ne doit bouger : ce n'est
    // qu'un aller-retour furtif entre deux onglets, pas un vrai réveil.
    const pendantCache = await p.evaluate(() => {
        Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        return { anim: window.ANIMATION_VTT_EN_COURS, pions: { ...window.PIONS_EN_MOUVEMENT } };
    });
    verifier("tant que l'onglet reste caché, les verrous restent posés",
             pendantCache.anim === true && Object.keys(pendantCache.pions).length === 1);

    // Le vrai réveil : l'onglet redevient visible.
    const auReveil = await p.evaluate(async () => {
        const fileAvant = window.FILE_ANIMATIONS;
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(r => setTimeout(r, 50));
        const div = document.getElementById('token-M1');
        return {
            anim: window.ANIMATION_VTT_EN_COURS,
            pions: Object.keys(window.PIONS_EN_MOUVEMENT || {}).length,
            fileChangee: window.FILE_ANIMATIONS !== fileAvant,
            fileResolue: await Promise.race([window.FILE_ANIMATIONS.then(() => true), new Promise(r => setTimeout(() => r(false), 200))]),
            positionAffichee: div ? { left: div.style.left, top: div.style.top } : null
        };
    });
    verifier("ANIMATION_VTT_EN_COURS est levé au réveil", auReveil.anim === false);
    verifier("PIONS_EN_MOUVEMENT est vidé au réveil", auReveil.pions === 0);
    verifier("la file d'animations bloquée est abandonnée pour une neuve",
             auReveil.fileChangee);
    verifier("...et cette nouvelle file n'est plus bloquée, elle se résout",
             auReveil.fileResolue === true);
    verifier("le plateau a bien été redessiné à la position connue (5,5)",
             !!auReveil.positionAffichee && auReveil.positionAffichee.left === "400px",
             JSON.stringify(auReveil.positionAffichee));

    await b.close();
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
