// ANNULER LE CIBLAGE POUR REPRENDRE SON DÉPLACEMENT.
// Une fois "Appliquer" cliqué, le clic sur N'IMPORTE QUEL pion (y compris le
// sien) partait vers ajouterCibleCiblage — impossible de se re-sélectionner
// pour continuer à marcher. Le mode zone avait déjà un ✖ pour s'en sortir
// (bulle-validation-zone) ; le ciblage à une seule cible n'en avait aucun.
// Ce banc vérifie, sur le VRAI code : (1) que nettoyerCiblage lève bien le
// verrou et retire les boutons de ciblage, (2) que le clic sur son propre
// pion redevient une sélection de mouvement une fois le ciblage annulé, et
// (3) que demarrerCiblage câble réellement le nouveau bouton ANNULER.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const moteur = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
const moteurSansImport = moteur.replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

function fonction(src, marqueur, finLigne = '};') {
    const lignes = src.split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error("introuvable : " + marqueur);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("1. LE CODE CÂBLE BIEN UN BOUTON ANNULER EN MODE CIBLE UNIQUE");
{
    const debut = moteur.indexOf('let btnResoudre = document.getElementById("btn-resoudre-carte");');
    verifier("le bloc du bouton RÉSOUDRE (ciblage à une cible) est repérable", debut > 0);
    const bloc = moteur.slice(debut, debut + 3000);
    verifier("un bouton « btn-annuler-ciblage » y est créé", bloc.includes('btn-annuler-ciblage'));
    verifier("son texte est bien ANNULER", /btnAnnuler\.innerText = "ANNULER"/.test(bloc));
    verifier("il appelle nettoyerCiblage (pas une simple fermeture visuelle)",
             /btnAnnuler\.onclick = \(\) => window\.nettoyerCiblage\(\)/.test(bloc));
}

console.log("\n2. nettoyerCiblage RETIRE BIEN LE BOUTON ET LÈVE LE VERROU");
{
    const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.route('**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await p.goto('https://banc.ivalis/');

    const SRC_NETTOIE = fonction(moteurSansImport, 'window.nettoyerCiblage = function() {');

    const res = await p.evaluate((src) => {
        window.ETAT_CIBLAGE = { actif: true };
        window.surlignerEffetCarteActif = () => {};
        window.retirerAssombrissement = () => {};
        window.actualiserBandeauAction = () => { window.__bandeauRafraichi = true; };
        window.VTT_CIBLAGE_MOUSEMOVE = () => {}; window.VTT_CIBLAGE_WHEEL = () => {};
        window.VTT_CIBLAGE_CLICK = () => {}; window.VTT_CIBLAGE_TOUCHSTART = () => {};
        window.VTT_CIBLAGE_TOUCHMOVE = () => {};

        const btnAppliquer = document.createElement("div");
        btnAppliquer.id = "btn-appliquer-carte"; btnAppliquer.style.display = "none";
        const btnResoudre = document.createElement("div"); btnResoudre.id = "btn-resoudre-carte";
        const btnAnnuler = document.createElement("div"); btnAnnuler.id = "btn-annuler-ciblage";
        document.body.append(btnAppliquer, btnResoudre, btnAnnuler);

        eval(src);
        window.nettoyerCiblage();

        return {
            actif: window.ETAT_CIBLAGE.actif,
            resoudrePresent: !!document.getElementById("btn-resoudre-carte"),
            annulerPresent: !!document.getElementById("btn-annuler-ciblage"),
            appliquerVisible: document.getElementById("btn-appliquer-carte").style.display,
            bandeauRafraichi: window.__bandeauRafraichi
        };
    }, SRC_NETTOIE);

    verifier("le ciblage n'est plus actif", res.actif === false);
    verifier("le bouton RÉSOUDRE a disparu", !res.resoudrePresent);
    verifier("le bouton ANNULER a disparu aussi", !res.annulerPresent);
    verifier("le bouton APPLIQUER redevient visible", res.appliquerVisible === "block");
    verifier("le bandeau du bas est rafraîchi (la compétence redevient lançable)", res.bandeauRafraichi === true);

    await b.close();
}

console.log("\n3. LE CLIC SUR SON PROPRE PION REPREND LA MAIN APRÈS L'ANNULATION");
{
    const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="conteneur-tokens-vtt" style="position:relative;width:600px;height:400px;overflow:hidden"></div>
<script>
window.PLATEAU_VTT = { hexToPixel: (q,r) => ({ x: 100 + q*60, y: 100 + r*60 }),
                       getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
window.VTT_SCALE = 1; window.ZONES_PERSISTANTES = {}; window.TOKEN_SELECTIONNE = null;
window.estCombattantMort = function(id) {
  const p = (window.PERSOS_PARTIE||[]).find(x => x.idPersonnage === id);
  return !p || p.statut === "Mort" || (p.PV_Max > 0 && p.PV_Actuels <= 0);
};
window.PERSOS_PARTIE = [
  { idPersonnage:"J1", prenom:"Pliors", camp:"Allié", PV_Max:42, PV_Actuels:42,
    Fatigue_Max:100, fatigueActuelle:100, couleur:"#4a1c1c", Etats_Alteres:[] }
];
window.TOKENS_VTT_DATA = { J1:{q:0,r:0,taille:55} };
window.afficherMessageFlottantHex = function(){};
window.afficherDansPanneauGauche = function(){ window.__panneauOuvertPour = arguments[0]; };
// Le halo du pion sélectionné (construireHaloVTT) n'est pas ce que ce banc
// vérifie : un simple élément vide suffit à ne pas interrompre le clic.
window.construireHaloVTT = function() { return document.createElement("div"); };
window.positionnerTokenVTT = function(div) {
  const q = parseFloat(div.dataset.q), r = parseFloat(div.dataset.r), t = parseFloat(div.dataset.taille);
  const px = window.PLATEAU_VTT.hexToPixel(q, r);
  div.style.left = px.x + "px"; div.style.top = px.y + "px";
  div.style.width = t + "px"; div.style.height = t + "px";
};
window.CIBLES_AJOUTEES = [];
window.ajouterCibleCiblage = function(id) { window.CIBLES_AJOUTEES.push(id); };
${fonction(combat, 'window.appliquerTokensVTT = function')}
window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
</script></body></html>`;
    fs.writeFileSync('/tmp/annuler_ciblage.html', page);

    const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 640, height: 480 } });
    await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
    await p.goto('file:///tmp/annuler_ciblage.html');
    await p.waitForTimeout(100);
    console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

    const pendantCiblage = await p.evaluate(() => {
        window.ETAT_CIBLAGE = { actif: true };
        window.TOKEN_SELECTIONNE = null;
        document.getElementById("token-J1").click();
        return { cibles: [...window.CIBLES_AJOUTEES], selection: window.TOKEN_SELECTIONNE };
    });
    verifier("pendant le ciblage, cliquer son pion vise une cible, ne le sélectionne pas",
             pendantCiblage.cibles.join() === "J1" && pendantCiblage.selection === null);

    const apresAnnulation = await p.evaluate(() => {
        window.ETAT_CIBLAGE = { actif: false }; // ce que nettoyerCiblage vient de poser
        window.CIBLES_AJOUTEES = [];
        document.getElementById("token-J1").click();
        return { cibles: [...window.CIBLES_AJOUTEES], selection: window.TOKEN_SELECTIONNE,
                 panneauOuvert: window.__panneauOuvertPour };
    });
    verifier("après annulation, le même clic redevient une sélection de mouvement",
             apresAnnulation.cibles.length === 0 && apresAnnulation.selection === "J1");
    verifier("le panneau gauche s'ouvre bien sur ce pion (comme un vrai choix de déplacement)",
             apresAnnulation.panneauOuvert === "J1");

    await b.close();
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
