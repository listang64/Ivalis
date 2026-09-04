// L'ARME ET LA TENUE DU PREMIER JOUR.
//
// À la création, le joueur ne choisit plus une tenue décorative mais deux
// FAMILLES : un type d'arme et un type d'armure. Le jeu en tire un objet commun
// de chaque et les lui met sur le dos immédiatement. Ce banc suit la chaîne
// entière — la liste du formulaire, le tirage, l'écriture en base, ce que le
// combat en lit — sur le VRAI code, et vérifie que les armures restent
// antiques dans les images demandées.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const html = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const SRC_CREATION = fs.readFileSync('/home/user/Ivalis/creation_personnage.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const SRC_IA_OBJETS = fs.readFileSync('/home/user/Ivalis/objets_ia.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

function extraire(fichier, marqueur, finLigne = '}') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}
const SRC_EQUIPER = extraire('app.js', 'function equiperLeHerosDeDepart(donnees) {');
// champsPourObjet vit dans loot.js : c'est la règle unique qui décide dans quels
// emplacements va un objet, armes à deux mains comprises.
const SRC_CHAMPS = extraire('loot.js', 'window.champsPourObjet = function(objet, main) {', '};');
const SRC_DOC = extraire('app.js', 'function frontVersPersoDoc(donnees, idPersonnage) {');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
await p.goto('https://banc.ivalis/');

// =========================================================================
console.log("1. LE FORMULAIRE PROPOSE LES BONNES FAMILLES");
{
    const bloc = html.slice(html.indexOf('id="groupe-type-arme"'), html.indexOf('</div>', html.indexOf('id="groupe-tenue"')) + 6);
    const valeurs = [...bloc.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);

    verifier("l'ancien menu de tenues décoratives a disparu",
             !html.includes('id="champ-style"') && !html.includes("Habits de marchands"));
    verifier("un menu « Type d'arme » existe", html.includes('id="champ-type-arme"'));
    verifier("un menu « Tenue » existe", html.includes('id="champ-tenue"'));
    verifier("les trois armures y sont, de la légère à la lourde",
             ["Armure légère", "Armure intermédiaire", "Armure lourde"].every(v => valeurs.includes(v)),
             `(${valeurs.filter(v => v.startsWith("Armure")).join(", ")})`);
    verifier("« Armure moyenne » est le libellé de l'intermédiaire",
             /value="Armure intermédiaire">Armure moyenne</.test(bloc));

    // Le formulaire ne doit proposer que des familles qui existent réellement.
    const w = {};
    new Function('window', SRC_OBJETS)(w);
    const typesReels = new Set((w.MODELES_OBJETS || []).map(m => m.type));
    const inconnus = valeurs.filter(v => !typesReels.has(v));
    verifier("chaque famille proposée existe dans le catalogue",
             inconnus.length === 0, `(${inconnus.join(", ") || "aucune inconnue"})`);
    verifier("le bouclier n'est pas proposé : ce n'est pas une arme",
             !valeurs.includes("Bouclier"));

    // Et inversement : aucune famille d'arme du jeu ne doit manquer.
    const armesDuJeu = w.TYPES_ARMES_FORGE;
    const manquantes = armesDuJeu.filter(t => !valeurs.includes(t));
    verifier("aucun type d'arme de la Forge ne manque à l'appel",
             manquantes.length === 0, `(${manquantes.join(", ") || "aucun"})`);

    // La bascule par race ne doit plus toucher à ces deux encarts.
    verifier("l'équipement de départ n'est masqué pour aucune race",
             !SRC_CREATION.includes('groupe-style')
             && !SRC_CREATION.includes('"groupe-type-arme"')
             && !SRC_CREATION.includes('"groupe-tenue"'));
}

// =========================================================================
console.log("\n2. LE TIRAGE : UN OBJET COMMUN DE CHAQUE FAMILLE");
const res = await p.evaluate(({ srcObjets, srcEquiper, srcDoc, srcChamps }) => {
    eval(srcObjets);
    eval(srcChamps);
    eval(srcEquiper);
    eval(srcDoc);

    // Le bouclier n'est pas une arme : il ne figure pas dans le menu de départ.
    const familles = ["Arme légère CAC", "Arme lourde CAC", "Arme polyvalente",
                      "Arme légère Distance", "Magie"];
    const armures = ["Armure légère", "Armure intermédiaire", "Armure lourde"];

    // 200 tirages par famille : on veut voir la variété ET les invariants.
    const parFamille = {};
    familles.concat(armures).forEach(f => {
        const tires = [];
        for (let i = 0; i < 200; i++) {
            const o = window.objetDeDepart(f);
            if (o) tires.push(o);
        }
        parFamille[f] = {
            nombre: tires.length,
            raretes: [...new Set(tires.map(o => o.rarete))],
            types: [...new Set(tires.map(o => o.type))],
            modeles: [...new Set(tires.map(o => o.modele))],
            noms: [...new Set(tires.map(o => o.nom))].length,
            emplacements: [...new Set(tires.map(o => o.emplacement))],
            deuxMains: tires.filter(o => o.deuxMains).length,
            sansUid: tires.filter(o => !o.uid).length,
            sansTexte: tires.filter(o => !o.effetTexte).length,
            uidsUniques: new Set(tires.map(o => o.uid)).size
        };
    });

    // Une famille inconnue ne doit rien casser.
    const inexistant = window.objetDeDepart("Épée laser");
    const partiel = window.equipementDeDepart("Arme lourde CAC", "");

    // La fiche complète, telle qu'elle part en base.
    const fiches = [];
    for (let i = 0; i < 40; i++) {
        const donnees = { prenom: "Test", typeArme: familles[i % familles.length], typeArmure: armures[i % 3] };
        equiperLeHerosDeDepart(donnees);
        fiches.push({
            style: donnees.style,
            doc: frontVersPersoDoc(donnees, "PERSO_1")
        });
    }

    // Ce que le combat lit de cette fiche : bonus et stats.
    const exemple = { prenom: "Test", typeArme: "Armure lourde", typeArmure: "Armure lourde" };
    const perso = { prenom: "Test", typeArme: "Arme lourde CAC", typeArmure: "Armure lourde" };
    equiperLeHerosDeDepart(perso);
    const front = {
        equipArmure: perso.equipArmure,
        equipMainDroite: perso.equipMainDroite,
        equipMainGauche: perso.equipMainGauche
    };
    const bonus = window.bonusEquipement(front);
    const portes = window.objetsEquipes(front);

    return { parFamille, inexistant, partiel, fiches, bonus, portes,
             cles: window.CLES_BONUS };
}, { srcObjets: SRC_OBJETS, srcEquiper: SRC_EQUIPER, srcDoc: SRC_DOC, srcChamps: SRC_CHAMPS });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

Object.entries(res.parFamille).forEach(([famille, r]) => {
    console.log(`     ${famille.padEnd(22)} ${r.modeles.length} modèle(s), ${r.noms} nom(s) : ${r.modeles.join(", ")}`);
});

verifier("chaque famille sait tirer un objet",
         Object.values(res.parFamille).every(r => r.nombre === 200),
         Object.entries(res.parFamille).filter(([, r]) => r.nombre !== 200).map(([f]) => f).join(","));
verifier("toujours en qualité commune, jamais mieux",
         Object.values(res.parFamille).every(r => r.raretes.length === 1 && r.raretes[0] === "Commun"),
         [...new Set(Object.values(res.parFamille).flatMap(r => r.raretes))].join(","));
verifier("l'objet tiré appartient bien à la famille demandée",
         Object.entries(res.parFamille).every(([f, r]) => r.types.length === 1 && r.types[0] === f));
// Le tirage ne doit pas être figé sur un seul objet. Deux bagues portent le même
// nom dans le catalogue (« Bague ») : c'est le modèle qui les distingue.
verifier("le tirage n'est jamais figé sur un seul objet",
         Object.values(res.parFamille).every(r => r.modeles.length > 1 || r.noms > 1),
         Object.entries(res.parFamille).filter(([, r]) => r.modeles.length <= 1 && r.noms <= 1)
               .map(([f]) => f).join(",") || "");
verifier("chaque objet a son identifiant unique et sa description",
         Object.values(res.parFamille).every(r => r.sansUid === 0 && r.sansTexte === 0
                                               && r.uidsUniques === r.nombre));
verifier("les armures vont bien à l'emplacement Armure",
         ["Armure légère", "Armure intermédiaire", "Armure lourde"]
             .every(a => res.parFamille[a].emplacements.join() === "Armure"));
verifier("une famille inconnue ne casse rien", res.inexistant === null);
verifier("un choix incomplet donne quand même l'autre moitié",
         !!res.partiel.arme && res.partiel.armure === null);

// =========================================================================
console.log("\n3. LE HÉROS PART ÉQUIPÉ, ET LA BASE LE SAIT");
{
    const avecBague = res.fiches.filter(f => (f.doc.Equip_Main_Gauche || {}).bague);
    const sansBague = res.fiches.filter(f => !(f.doc.Equip_Main_Gauche || {}).bague);

    verifier("toutes les fiches partent avec une armure",
             res.fiches.every(f => f.doc.Equip_Armure && f.doc.Equip_Armure.uid),
             `(${res.fiches.filter(f => !f.doc.Equip_Armure).length} sans armure)`);
    verifier("et toutes avec une arme en main",
             res.fiches.every(f => (f.doc.Equip_Main_Droite && f.doc.Equip_Main_Droite.uid)
                                || (f.doc.Equip_Main_Gauche && f.doc.Equip_Main_Gauche.uid)));
    verifier("une bague part au doigt gauche, laissant la droite libre",
             avecBague.length > 0 && avecBague.every(f => !f.doc.Equip_Main_Droite),
             `(${avecBague.length} bague(s))`);
    const deuxMains = sansBague.filter(f => (f.doc.Equip_Main_Droite || {}).deuxMains);
    const uneMain = sansBague.filter(f => !(f.doc.Equip_Main_Droite || {}).deuxMains);
    verifier("une arme à une main va en main droite, l'autre reste libre",
             uneMain.every(f => !!f.doc.Equip_Main_Droite && !f.doc.Equip_Main_Gauche));
    verifier("une arme à deux mains occupe bien les DEUX mains, même identifiant",
             deuxMains.every(f => f.doc.Equip_Main_Gauche
                               && f.doc.Equip_Main_Gauche.uid === f.doc.Equip_Main_Droite.uid),
             `(${deuxMains.length} arme(s) à deux mains tirée(s))`);
    verifier("le portrait décrira l'armure réellement portée",
             res.fiches.every(f => f.style && f.style === f.doc.Equip_Armure.nom),
             `(ex. « ${res.fiches[0].style} »)`);

    console.log(`     bonus lus par le combat : ${JSON.stringify(
        Object.fromEntries(Object.entries(res.bonus).filter(([, v]) => v !== 0)))}`);
    verifier("le combat voit les deux objets portés", res.portes.length === 2,
             `(${res.portes.map(o => o.nom).join(", ")})`);
    verifier("et leurs bonus sont non nuls",
             res.cles.some(c => res.bonus[c] > 0));
}

// =========================================================================
console.log("\n4. LES ARMURES RESTENT ANTIQUES");
{
    const w = {};
    new Function('window', SRC_OBJETS)(w);
    // objets_ia.js n'a besoin que de son propre code pour construire un prompt.
    const w2 = { localStorage: { getItem: () => "" } };
    new Function('window', 'db', 'doc', 'getDoc', 'updateDoc',
                 SRC_IA_OBJETS)(w2, {}, () => ({}), async () => ({}), async () => ({}));

    const armure = w.objetDeDepart("Armure lourde");
    const arme = w.objetDeDepart("Arme lourde CAC");
    const promptArmure = w2.promptImageObjet(armure, "Des écailles de bronze.", "STYLE");
    const promptArme = w2.promptImageObjet(arme, "Une lame de bronze.", "STYLE");

    verifier("l'époque est imposée au dessin de l'armure",
             /Antiquité méditerranéenne/.test(promptArmure));
    verifier("les pièces antiques sont nommées",
             ["linothorax", "cuirasse musclée", "ptéruges"].every(m => promptArmure.includes(m)),
             promptArmure.includes("linothorax") ? "" : "(linothorax absent)");
    verifier("l'armure de plates médiévale est explicitement proscrite",
             /INTERDIT de dessiner une armure de plates médiévale/.test(promptArmure));
    verifier("la cotte de mailles de chevalier et le heaume aussi",
             /cotte de mailles/.test(promptArmure) && /heaume/.test(promptArmure));
    verifier("les armes aussi sont tenues à l'époque",
             /Antiquité méditerranéenne/.test(promptArme) && /Aucune forme médiévale/.test(promptArme));
    verifier("l'armure reste dépliée, étalée et vide",
             /dépliée et étalée/.test(promptArmure) && /aucun mannequin/.test(promptArmure));

    // MIA_Objets, qui écrit les descriptions, reçoit la même contrainte.
    verifier("MIA_Objets reçoit elle aussi l'interdit d'époque",
             SRC_IA_OBJETS.includes("L'ÉPOQUE EST UN INTERDIT")
             && SRC_IA_OBJETS.includes("JAMAIS d'armure de plates médiévale"));

    // Et le portrait du héros, qui porte l'armure de départ.
    const srcPortrait = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
    verifier("le portrait du héros porte l'armure, à la bonne époque",
             srcPortrait.includes("Antiquité méditerranéenne")
             && srcPortrait.includes("Aucune armure de plates médiévale"));

    // Les noms du catalogue, eux, n'ont pas bougé : ce sont ceux du tableau.
    const nomsArmures = w.MODELES_OBJETS.filter(m => m.emplacement === "Armure")
                                        .flatMap(m => m.noms);
    console.log(`     noms d'armures du catalogue : ${nomsArmures.join(", ")}`);
    verifier("le catalogue d'armures est intact (aucun nom inventé)",
             nomsArmures.length === 15, `(${nomsArmures.length} noms)`);
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
