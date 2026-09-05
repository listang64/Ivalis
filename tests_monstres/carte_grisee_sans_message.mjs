// UNE CARTE GRISÉE RESTE CONSULTABLE, SANS MESSAGE D'ERREUR.
// Cliquer une carte trop chère affichait une alerte ("Vous n'avez pas assez
// d'énergie...") et bloquait le clic avant même d'ouvrir son aperçu. Nico
// veut qu'elle s'ouvre normalement — juste sans le bouton "Choisir" en
// dessous, que competences.js retire déjà tout seul (boutonChoisirHtml).
// Ce banc vérifie le VRAI gererClicCarteCombat (combat.js) : plus d'alerte,
// plus de blocage, et le coût n'est pas réservé pour une carte qu'on ne peut
// de toute façon pas lancer.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const competences = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');

function fonction(src, marqueur, finLigne = '};') {
    const lignes = src.split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error("introuvable : " + marqueur);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}
const SRC_CLIC = fonction(combat, 'window.gererClicCarteCombat = function(idCarte) {');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

function poste({ fatigueActuelle, mouvementCoutTotal = 0, coutCarte }) {
    const alertes = [];
    const w = {
        alert: (msg) => alertes.push(msg),
        COMBAT_PERSOS_JOUEUR: [{ idPersonnage: "J1", fatigueActuelle }],
        COMBAT_INDEX_PERSO: 0,
        COMBAT_FATIGUE_ACTUELLE: fatigueActuelle,
        MOUVEMENT_COUT_TOTAL: mouvementCoutTotal,
        COMPETENCES_CACHE: { C1: { Fatigue: coutCarte } },
        CARTE_EN_APERCU: null,
        COUT_COMPETENCE_SELECTIONNEE: 0,
        fatigueMaxCombattant: () => 100,
        mettreAJourJaugeFatigue: () => {},
        appelsApercu: [],
    };
    w.appelsMasquer = 0;
    w.afficherApercuCarteHD = (id) => w.appelsApercu.push(id);
    w.masquerApercuCarteHD = () => { w.appelsMasquer++; };
    w.actualiserBannieresEpuisees = () => {};
    const document = {
        querySelectorAll: () => [],
        getElementById: () => null
    };
    new Function('window', 'document', SRC_CLIC)(w, document);
    return { w, alertes };
}

console.log("1. UNE CARTE TROP CHÈRE (« GRISÉE ») S'OUVRE SANS MESSAGE");
{
    const { w, alertes } = poste({ fatigueActuelle: 20, coutCarte: 40 });
    w.gererClicCarteCombat("C1");
    verifier("aucune alerte n'est déclenchée", alertes.length === 0, JSON.stringify(alertes));
    verifier("l'aperçu de la carte s'ouvre quand même", w.appelsApercu.join() === "C1");
    verifier("son coût n'est pas réservé (elle ne peut pas être lancée)",
             w.COUT_COMPETENCE_SELECTIONNEE === 0);
    verifier("elle reste bien la carte affichée", w.CARTE_EN_APERCU === "C1");
}

console.log("\n2. AFFORDABLE SEULE, MAIS PAS AVEC LE TRAJET DÉJÀ TRACÉ : MÊME CHOSE");
{
    const { w, alertes } = poste({ fatigueActuelle: 50, mouvementCoutTotal: 20, coutCarte: 40 });
    w.gererClicCarteCombat("C1");
    verifier("toujours aucune alerte", alertes.length === 0);
    verifier("l'aperçu s'ouvre normalement", w.appelsApercu.join() === "C1");
    verifier("son coût n'est pas réservé non plus", w.COUT_COMPETENCE_SELECTIONNEE === 0);
}

console.log("\n3. UNE CARTE ABORDABLE CONTINUE DE FONCTIONNER COMME AVANT");
{
    const { w, alertes } = poste({ fatigueActuelle: 50, coutCarte: 30 });
    w.gererClicCarteCombat("C1");
    verifier("aucune alerte", alertes.length === 0);
    verifier("l'aperçu s'ouvre", w.appelsApercu.join() === "C1");
    verifier("son coût EST réservé, elle peut être lancée", w.COUT_COMPETENCE_SELECTIONNEE === 30);
}

console.log("\n4. RECLIQUER LA MÊME CARTE LA REFERME TOUJOURS, SANS ALERTE");
{
    const { w, alertes } = poste({ fatigueActuelle: 20, coutCarte: 40 });
    w.gererClicCarteCombat("C1");
    w.gererClicCarteCombat("C1");
    verifier("aucune alerte sur les deux clics", alertes.length === 0);
    verifier("le deuxième clic masque bien l'aperçu (bascule normale)", w.appelsMasquer === 1);
}

console.log("\n5. LE MESSAGE D'ERREUR N'EXISTE PLUS DU TOUT DANS LE CODE");
verifier("l'ancienne alerte a bien été retirée de gererClicCarteCombat",
         !SRC_CLIC.includes("Vous n'avez pas assez d'énergie"));

console.log("\n6. « CHOISIR » DISPARAÎT AUSSI QUAND SEUL LE TRAJET RACLE LE BUDGET");
{
    // boutonChoisirHtml (competences.js) doit désormais compter le trajet déjà
    // tracé, exactement comme gererClicCarteCombat : sinon "Choisir" resterait
    // affiché sur une carte que gererClicCarteCombat refuse pourtant de réserver.
    const debut = competences.indexOf('let estEpuise = false;');
    const bloc = competences.slice(debut, debut + 900);
    verifier("le calcul d'épuisement inclut MOUVEMENT_COUT_TOTAL",
             /parseInt\(fatigue\) \+ \(window\.MOUVEMENT_COUT_TOTAL \|\| 0\) > fatiguePerso/.test(bloc));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
