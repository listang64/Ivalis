// ANNULER LE CIBLAGE POUR REPRENDRE LA MAIN SUR SON PION.
// Une fois le ciblage démarré, le clic sur N'IMPORTE QUEL pion (y compris le
// sien) partait vers ajouterCibleCiblage — impossible de se re-sélectionner.
// Le mode zone avait déjà un ✖ pour s'en sortir (bulle-validation-zone) ; le
// ciblage à une seule cible n'en avait aucun, d'où le premier ANNULER
// flottant (voir git log, tâche « Bouton annuler ciblage »).
//
// REFONTE DU BOUTON FIN DE TOUR : ce ANNULER-là ne bouge pas (le ciblage se
// déroule comme avant), mais il a maintenant un voisin qu'il ne faut pas
// confondre avec lui — pendant le ciblage, le bouton fin de tour affiche
// « fin de tour » et TERMINE le tour sans dépenser la carte, là où ANNULER
// referme seulement le ciblage et rend la main pour continuer à se déplacer.
// Ce banc vérifie donc, sur le VRAI code : (1) qu'ANNULER est bien câblé et
// que l'ouverture/fermeture du ciblage rafraîchit le bouton fin de tour,
// (2) que nettoyerCiblage retire les deux boutons et lève le verrou, et
// (3) que le clic sur son propre pion redevient une sélection de mouvement
// une fois le ciblage annulé.
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

    // L'ancien bouton doré « Appliquer » (qui démarrait le ciblage) est parti :
    // c'est le bouton fin de tour, sous son image « lancer », qui le remplace.
    verifier("l'ancien bouton Appliquer n'est plus posé nulle part",
             !moteur.includes('btn-appliquer-carte'));
    // Et l'ouverture du ciblage doit rafraîchir le bouton fin de tour, qui
    // passe alors sur « fin de tour » : renoncer à sa carte sans la dépenser.
    const ouverture = moteur.slice(moteur.indexOf('window.demarrerCiblage = async function'),
                                   moteur.indexOf('window.validerZoneAoE = function'));
    verifier("l'ouverture du ciblage rafraîchit le bouton fin de tour",
             ouverture.includes('window.actualiserBoutonFinTour()'));
}

console.log("\n2. nettoyerCiblage RETIRE LES BOUTONS, LÈVE LE VERROU ET REND LA MAIN");
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
        window.rafraichirVoileTour = () => { window.__voileRafraichi = true; };
        window.actualiserBoutonFinTour = () => { window.__boutonRafraichi = true; };
        window.VTT_CIBLAGE_MOUSEMOVE = () => {}; window.VTT_CIBLAGE_WHEEL = () => {};
        window.VTT_CIBLAGE_CLICK = () => {}; window.VTT_CIBLAGE_TOUCHSTART = () => {};
        window.VTT_CIBLAGE_TOUCHMOVE = () => {};

        const btnResoudre = document.createElement("div"); btnResoudre.id = "btn-resoudre-carte";
        const btnAnnuler = document.createElement("div"); btnAnnuler.id = "btn-annuler-ciblage";
        document.body.append(btnResoudre, btnAnnuler);

        eval(src);
        window.nettoyerCiblage();

        return {
            actif: window.ETAT_CIBLAGE.actif,
            resoudrePresent: !!document.getElementById("btn-resoudre-carte"),
            annulerPresent: !!document.getElementById("btn-annuler-ciblage"),
            voileRafraichi: window.__voileRafraichi,
            boutonRafraichi: window.__boutonRafraichi
        };
    }, SRC_NETTOIE);

    verifier("le ciblage n'est plus actif", res.actif === false);
    verifier("le bouton RÉSOUDRE a disparu", !res.resoudrePresent);
    verifier("le bouton ANNULER a disparu aussi", !res.annulerPresent);
    verifier("la fenêtre de tour est rafraîchie (la compétence redevient lançable)", res.voileRafraichi === true);
    verifier("le bouton fin de tour repasse sur « lancer »", res.boutonRafraichi === true);

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
// Le panneau latéral a été supprimé, et afficherDansPanneauGauche avec lui :
// cliquer sur un pion le SÉLECTIONNE, sans plus rien installer nulle part.
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
// Le lanceur du ciblage : c'est SON pion qui porte la croix rouge, pas celui
// qu'on est en train de viser.
window.lanceurDuCiblage = function() {
  return (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.idLanceur) || null;
};
window.NETTOYAGES = 0;
window.nettoyerCiblage = function() { window.NETTOYAGES++; window.ETAT_CIBLAGE = { actif: false }; };
window.ANNULATIONS_MOUVEMENT = 0;
window.annulerMouvement = function() { window.ANNULATIONS_MOUVEMENT++; };
window.CHEMIN_MOUVEMENT = [];
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
                 selectionne: window.TOKEN_SELECTIONNE };
    });
    verifier("après annulation, le même clic redevient une sélection de mouvement",
             apresAnnulation.cibles.length === 0 && apresAnnulation.selection === "J1");
    verifier("et le pion redevient celui qu'on a sélectionné",
             apresAnnulation.selectionne === "J1", String(apresAnnulation.selectionne));

    // =====================================================================
    console.log("\n4. UNE CROIX ROUGE SOUS LE PION POUR SORTIR DU CIBLAGE");
    // =====================================================================
    //  SIGNALÉ EN PARTIE : « quand on lance une compétence et que ça se met en
    //  mode ciblage, on ne peut plus faire de déplacement ».
    //
    //  C'était vrai. Le seul renoncement offert était le bouton « ANNULER »
    //  posé à côté de « RÉSOUDRE » — et celui-là n'apparaît qu'une fois une
    //  cible choisie. Tant qu'on n'avait visé personne, il n'y avait aucune
    //  sortie, sauf finir son tour pour de bon.
    //
    //  La croix est le même dessin que celle du déplacement, au même endroit
    //  sous le pion : c'est le geste que le joueur connaît déjà.
    const croix = (id) => p.evaluate((i) => {
        const t = document.getElementById("token-" + i);
        const c = t && t.querySelector(".croix-annuler-ciblage");
        const m = t && t.querySelector(".croix-annuler-deplacement");
        const dessin = (el) => el ? { texte: el.innerText,
                                      rouge: /d32f2f|211, 47, 47/.test(el.style.background || ""),
                                      titre: el.title } : null;
        return { ciblage: dessin(c), deplacement: dessin(m) };
    }, id);

    // Le décor : deux pions, et c'est J1 qui vise.
    await p.evaluate(() => {
        window.PERSOS_PARTIE.push({ idPersonnage: "M1", prenom: "Gnoll", camp: "Ennemi",
            estMonstre: true, PV_Max: 30, PV_Actuels: 30, Etats_Alteres: [] });
        window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0, taille: 55 }, M1: { q: 2, r: 0, taille: 55 } };
        window.TOKEN_SELECTIONNE = "J1";
        window.CHEMIN_MOUVEMENT = [];
        window.ETAT_CIBLAGE = { actif: true, idLanceur: "J1" };
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    });
    const enCiblage = await croix("J1");
    const surLaCible = await croix("M1");
    verifier("LA CROIX EST LÀ DÈS QUE LE CIBLAGE S'OUVRE", !!enCiblage.ciblage,
             JSON.stringify(enCiblage.ciblage));
    verifier("rouge, avec le même ✖ que celle du déplacement",
             !!enCiblage.ciblage && enCiblage.ciblage.texte === "✖" && enCiblage.ciblage.rouge,
             JSON.stringify(enCiblage.ciblage));
    verifier("elle dit ce qu'elle annule", !!enCiblage.ciblage && /ciblage/i.test(enCiblage.ciblage.titre),
             enCiblage.ciblage ? enCiblage.ciblage.titre : "—");
    verifier("ELLE EST SUR LE PION DU LANCEUR, PAS SUR CELUI QU'ON VISE",
             !surLaCible.ciblage);

    // LE CLIC DOIT ANNULER LE CIBLAGE, PAS VISER LE LANCEUR. Le pion tout
    // entier est une boîte de clic qui envoie vers ajouterCibleCiblage : sans
    // stopPropagation, appuyer sur la croix se viserait soi-même.
    const clic = await p.evaluate(() => {
        window.CIBLES_AJOUTEES = [];
        document.querySelector("#token-J1 .croix-annuler-ciblage").click();
        return { nettoyages: window.NETTOYAGES, cibles: [...window.CIBLES_AJOUTEES],
                 actif: !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) };
    });
    verifier("LE CLIC REFERME LE CIBLAGE", clic.nettoyages === 1 && clic.actif === false,
             `${clic.nettoyages} nettoyage(s), actif ${clic.actif}`);
    verifier("et il ne vise personne au passage", clic.cibles.length === 0,
             clic.cibles.join());

    // Une fois le ciblage refermé, les pions redessinés ne la portent plus.
    await p.evaluate(() => window.appliquerTokensVTT(window.TOKENS_VTT_DATA));
    const apresCroix = await croix("J1");
    verifier("elle s'en va avec le ciblage", !apresCroix.ciblage);

    // ET LA CROIX DU DÉPLACEMENT REPREND SA PLACE. Les deux ne s'affichent
    // jamais ensemble : deux croix identiques côte à côte, on ne saurait plus
    // laquelle appuie sur quoi.
    await p.evaluate(() => {
        window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0, cost: 2 }];
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    });
    const enDeplacement = await croix("J1");
    verifier("la croix du déplacement revient quand un chemin est tracé",
             !!enDeplacement.deplacement && !enDeplacement.ciblage,
             JSON.stringify(enDeplacement));

    const clicMouvement = await p.evaluate(() => {
        document.querySelector("#token-J1 .croix-annuler-deplacement").click();
        return window.ANNULATIONS_MOUVEMENT;
    });
    verifier("et elle annule bien le déplacement", clicMouvement === 1, String(clicMouvement));

    // LES DEUX ENSEMBLE : le ciblage passe devant. On peut avoir un chemin
    // tracé ET ouvrir une carte — c'est même le cas courant.
    await p.evaluate(() => {
        window.ETAT_CIBLAGE = { actif: true, idLanceur: "J1" };
        window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0, cost: 2 }];
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    });
    const lesDeux = await croix("J1");
    verifier("UNE SEULE CROIX À LA FOIS, et c'est celle du ciblage",
             !!lesDeux.ciblage && !lesDeux.deplacement, JSON.stringify(lesDeux));

    // =====================================================================
    console.log("\n5. LE GUETTEUR DU CIBLAGE DE ZONE LAISSE PASSER LA CROIX");
    // =====================================================================
    //  VTT_CIBLAGE_CLICK court en phase de CAPTURE, avant tout le monde, et
    //  arrête net tout clic tombé dans le plateau — c'est ce qui permet de
    //  poser le centre d'une zone n'importe où. La croix est posée sur le pion
    //  du lanceur, donc DANS le plateau : sans exception nommée, son clic
    //  serait avalé et la seule sortie d'un ciblage de zone resterait la fin
    //  du tour.
    {
        const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
        const bloc = src.slice(src.indexOf("window.VTT_CIBLAGE_CLICK = function"),
                               src.indexOf("window.VTT_CIBLAGE_TOUCHSTART"));
        verifier("le guetteur nomme la croix et la laisse passer",
                 /croix-annuler-ciblage/.test(bloc));
        // Et il le fait AVANT de couper le clic, sinon l'exception ne sert à rien.
        verifier("et il le fait avant d'arrêter la propagation",
                 bloc.indexOf("croix-annuler-ciblage") < bloc.indexOf("e.stopPropagation()"));

        // L'ouverture et la fermeture du ciblage redessinent les pions : sans
        // ça, la croix ne naîtrait jamais et ne partirait jamais.
        verifier("l'ouverture du ciblage redessine les pions",
                 /window\.ETAT_CIBLAGE = carteConstruite;[\s\S]{0,600}?appliquerTokensVTT/.test(src));
        const nettoyage = src.slice(src.indexOf("window.nettoyerCiblage = function"),
                                    src.indexOf("window.nettoyerCiblage = function") + 2500);
        verifier("et sa fermeture aussi", /appliquerTokensVTT/.test(nettoyage));
    }

    await b.close();
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
