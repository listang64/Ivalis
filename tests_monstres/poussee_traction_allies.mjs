// POUSSÉE ET TRACTION PEUVENT DÉSORMAIS VISER UN ALLIÉ.
// Jusqu'ici, dessinerAnneauxCiblage et ajouterCibleCiblage traitaient toute
// carte SANS soin comme une agression : ennemis uniquement. Une carte de pur
// Poussée/Traction (sans attaque) est pourtant un outil tactique qui a sa
// place sur un allié — l'écarter d'un danger, le ramener vers soi. Une carte
// qui frappe ET pousse reste, elle, une agression réservée aux ennemis.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const moteur = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
function fonction(src, marqueur) {
    const lignes = src.split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const resultat = await p.evaluate(({ srcMoteur, srcTokens }) => {
    document.documentElement.style.setProperty("--app-h", "600px");
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => {
        if (e.id !== "ecran-jeu") e.style.display = "none";
    });
    document.getElementById("ecran-jeu").style.display = "block";
    document.getElementById("fenetre-combat").style.display = "block";

    window.PLATEAU_VTT = {
        hexSize: 30,
        hexToPixel: (q, r) => ({ x: 470 + q * 70, y: 200 + r * 60 }),
        getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
        getHexesInRadius: () => []
    };
    window.VTT_SCALE = 1; window.ZONES_PERSISTANTES = {}; window.TOKEN_SELECTIONNE = null;
    window.positionnerTokenVTT = (div) => {
        const px = window.PLATEAU_VTT.hexToPixel(parseFloat(div.dataset.q), parseFloat(div.dataset.r));
        div.style.left = px.x + "px"; div.style.top = px.y + "px";
        div.style.width = div.dataset.taille + "px"; div.style.height = div.dataset.taille + "px";
    };
    window.estCombattantMort = (id) => {
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
        return !p || p.statut === "Mort" || (p.PV_Max > 0 && p.PV_Actuels <= 0);
    };
    window.afficherMessageFlottantHex = () => {};

    window.PERSOS_PARTIE = [
        { idPersonnage: "J1", prenom: "Pliors", camp: "Allié", PV_Max: 42, PV_Actuels: 42, Etats_Alteres: [] },
        { idPersonnage: "A1", prenom: "Jade", camp: "Allié", PV_Max: 42, PV_Actuels: 20, Etats_Alteres: [] },
        { idPersonnage: "M1", prenom: "Gnoll", camp: "Ennemi", estMonstre: true, PV_Max: 70, PV_Actuels: 70, Etats_Alteres: [] }
    ];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0, taille: 55 }, A1: { q: 0, r: 3, taille: 55 },
                               M1: { q: 3, r: 0, taille: 55 } };
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;

    new Function('window', srcTokens)(window);
    new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', srcMoteur)(
        window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));

    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

    const aUneJauge = (id) => !!document.querySelector("#token-" + id + " .jauge-cible-ciblage");

    // 1. Carte de PURE Poussée (aucune attaque) : l'allié doit devenir ciblable.
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null,
        attaques: [], alterations: [{ nom: "Poussée", isRanged: true, rangeMax: 5, cibles: [], estPoussee: true }] };
    window.dessinerAnneauxCiblage();
    const pousseeSeule = { A1: aUneJauge("A1"), M1: aUneJauge("M1"), J1: aUneJauge("J1") };
    window.nettoyerCiblage();

    // 2. Même chose pour une carte de pure Traction.
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null,
        attaques: [], alterations: [{ nom: "Traction", isRanged: true, rangeMax: 5, cibles: [], estTraction: true }] };
    window.dessinerAnneauxCiblage();
    const tractionSeule = { A1: aUneJauge("A1"), M1: aUneJauge("M1") };
    window.nettoyerCiblage();

    // 3. Le VRAI clic (ajouterCibleCiblage), pas seulement l'anneau affiché.
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null,
        attaques: [], alterations: [{ nom: "Poussée", isRanged: true, rangeMax: 5, cibles: [], estPoussee: true }] };
    window.ajouterCibleCiblage("A1");
    const clicAllie = { cibleUnique: window.ETAT_CIBLAGE.cibleUnique,
                        cibles: [...window.ETAT_CIBLAGE.alterations[0].cibles] };
    window.nettoyerCiblage();

    // 4. Une carte qui FRAPPE ET pousse reste une agression : allié toujours refusé.
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null,
        attaques: [{ nom: "Attaque légère", isRanged: true, rangeMax: 5, isHeal: false, isShield: false, cibles: [] }],
        alterations: [{ nom: "Poussée", isRanged: true, rangeMax: 5, cibles: [], estPoussee: true }] };
    window.dessinerAnneauxCiblage();
    const attaqueEtPoussee = { A1: aUneJauge("A1"), M1: aUneJauge("M1") };
    window.nettoyerCiblage();

    return { pousseeSeule, tractionSeule, clicAllie, attaqueEtPoussee };
}, { srcMoteur: moteur, srcTokens: fonction(combat, 'window.appliquerTokensVTT = function') });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. UNE CARTE DE PURE POUSSÉE PEUT VISER UN ALLIÉ");
verifier("l'allié devient ciblable", resultat.pousseeSeule.A1 === true);
verifier("l'ennemi le reste aussi", resultat.pousseeSeule.M1 === true);
verifier("le lanceur ne peut pas se cibler lui-même", resultat.pousseeSeule.J1 === false);

console.log("\n2. IDEM POUR UNE CARTE DE PURE TRACTION");
verifier("l'allié devient ciblable", resultat.tractionSeule.A1 === true);
verifier("l'ennemi le reste aussi", resultat.tractionSeule.M1 === true);

console.log("\n3. LE CLIC RÉEL (ajouterCibleCiblage) ACCEPTE L'ALLIÉ");
verifier("l'allié est bien retenu comme cible unique", resultat.clicAllie.cibleUnique === "A1");
verifier("il est posé sur l'altération Poussée", resultat.clicAllie.cibles.join() === "A1");

console.log("\n4. UNE CARTE QUI FRAPPE ET POUSSE RESTE UNE AGRESSION");
verifier("l'allié n'est PAS ciblable dès qu'il y a une attaque", resultat.attaqueEtPoussee.A1 === false);
verifier("l'ennemi, lui, reste ciblable", resultat.attaqueEtPoussee.M1 === true);

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
