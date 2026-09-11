// CE QUI TRAVERSE LE PLATEAU — LA FLÈCHE, LA BOULE BLEUE, LA BOULE VERTE.
//
// Une attaque à distance ne se voyait pas partir. Le lanceur s'élançait d'un
// demi-pas sur place (la ruée), puis les dégâts tombaient chez une cible à
// quatre cases de là. Rien ne reliait les deux : à la table, on voyait un
// chiffre rouge apparaître au loin sans savoir qui avait tiré.
//
// TROIS FORMES, ET C'EST LA CARTE QUI CHOISIT :
//   • une FLÈCHE pour un tir qui n'est pas magique ;
//   • une BOULE BLEUE lumineuse pour un sort offensif lancé de loin ;
//   • la même, VERTE, pour un soin lancé de loin.
//
// CE BANC TIENT LES DEUX BOUTS DE LA CHAÎNE, et c'est tout son intérêt.
//
// EN HAUT, LA VRAIE FORGE. Le choix se décide sur `isRanged` et `typeRes`,
// deux champs que personne n'écrit à la main : ils sortent de l'extracteur
// (sept cents lignes, moteur_effets.js) à partir de ce que Nico a forgé. Un
// banc qui les fabriquerait lui-même ne prouverait rien — il vérifierait que
// mon idée de la carte correspond à mon idée de la carte. Ici on fait tourner
// le VRAI extracteur sur de VRAIES cartes, et on regarde ce qui en sort.
//
// EN BAS, LE VRAI DESSIN. animerProjectile pose un SVG dans #transform-plateau
// et le laisse voler. Trois choses peuvent mal tourner sans qu'on le voie :
// le dessin peut rester collé sur le plateau après l'impact (et s'empiler tir
// après tir), il peut partir d'une case fausse, et l'animation peut rendre la
// main avant d'être arrivée — auquel cas les dégâts tombent avant la flèche.
import fs from 'fs';
import { projectileDe } from '../moteur_pur.js';

const SRC_MOUVEMENT = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const SRC_MOTEUR = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(250);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Le décor commun : un plateau où une case vaut 60 pixels, et rien d'autre.
await p.evaluate(({ srcMouvement }) => {
    // LE PLATEAU DOIT ÊTRE VISIBLE. Sur une page où la fenêtre de combat est
    // encore masquée, un élément en display:none n'anime rien : les transitions
    // CSS ne tournent pas, et le banc mesurait un projectile immobile. Ce n'est
    // pas un détail de banc — c'est aussi ce qui se passe en jeu si on tire
    // avant que le plateau ne soit affiché.
    let noeud = document.getElementById("transform-plateau");
    while (noeud && noeud !== document.body) {
        if (getComputedStyle(noeud).display === "none") noeud.style.display = "block";
        noeud = noeud.parentElement;
    }

    window.PLATEAU_VTT = {
        hexSize: 30,
        hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 }),
        getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false })
    };
    window.VTT_SCALE = 1;
    window.afficherMessageFlottantHex = () => {};
    window.filerAnimation = (n, fn) => (fn ? fn() : null);
    new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField',
                 'collection', 'getDocs', 'query', 'where', srcMouvement)(
        window, {}, () => ({}), async () => {}, async () => {}, async () => {},
        () => ({}), () => ({}), async () => ({ docs: [] }), () => ({}), () => ({}));
}, { srcMouvement: SRC_MOUVEMENT });

console.log("\n=========================================================");
console.log("  LE PROJECTILE — DE LA CARTE FORGÉE AU DESSIN QUI VOLE");
console.log("=========================================================\n");

// =========================================================================
console.log("1. LA CARTE FORGÉE DIT ELLE-MÊME CE QU'ELLE ENVOIE");
// =========================================================================
//  On donne à l'extracteur des cartes construites comme la Forge les écrit, et
//  on passe ce qu'il en tire à la règle du noyau. Aucun champ n'est écrit à la
//  main : c'est la seule façon de savoir si un arc donne bien « Physique » et
//  un sort bien « Magique ».
const extraire = (carte) => p.evaluate(async ({ carte, src }) => {
    const tireur = { idPersonnage: "J1", prenom: "Cybile", camp: "Allié",
                     statut: "Vivant", Etats_Alteres: [], race: "Gob" };
    window.PERSOS_PARTIE = [tireur];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [tireur];
    window.COMBAT_INDEX_PERSO = 0;
    window.bonusEquip = () => 0;
    window.bonusPorteeMagique = () => 0;

    // Le grimoire, tel que la Forge le nomme : c'est le NOM de l'effet qui
    // décide s'il est physique ou magique (voir moteur_effets.js), et c'est
    // exactement ce qu'on veut mettre à l'épreuve.
    window.EFFETS_BDD_CACHE = {
        ATT:  { id: "ATT",  Nom: "Attaque", Valeur: 12 },
        POUV: { id: "POUV", Nom: "Pouvoir magique", Valeur: 14 },
        SOIN: { id: "SOIN", Nom: "Soin", Valeur: 10 },
        BOUC: { id: "BOUC", Nom: "Bouclier", Valeur: 15 },
        DIST: { id: "DIST", Nom: "Distance", Valeur: 1 },
        IMMO: { id: "IMMO", Nom: "Immobilisation", Pourcent_Base: 40, Tours: 2 }
    };
    window.COMPETENCES_CACHE = { [carte.id]: carte.data };

    if (!window.__moteurCharge) {
        new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
            window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
        window.__moteurCharge = true;
    }

    const etat = await window.demarrerCiblage(carte.id, { extraire: true, idLanceur: "J1" });
    if (!etat) return null;
    // On pose une cible sur chaque effet, comme le ciblage le fait en jeu :
    // sans cible, rien ne part, et c'est une règle à part qu'on vérifie ailleurs.
    return {
        attaques: (etat.attaques || []).map(a => ({ ...a, cibles: ["M1"] })),
        alterations: (etat.alterations || []).map(a => ({ ...a, cibles: ["M1"] }))
    };
}, { carte, src: SRC_MOTEUR });

{
    // UN ARC. « Attaque » + « Distance » : physique, et ça porte.
    const arc = await extraire({ id: "C_ARC", data: {
        Nom: "Tir tendu", Fatigue: 15, Arme: "Arc",
        Composants: { actions: [{ baseEffetId: "ATT", mods: { DIST: 3 } }] }
    }});
    verifier("l'arc est bien extrait comme un tir",
             !!arc && arc.attaques[0].isRanged === true && arc.attaques[0].typeRes === "Physique",
             arc && JSON.stringify({ r: arc.attaques[0].isRanged, t: arc.attaques[0].typeRes }));
    verifier("UN TIR NON MAGIQUE ENVOIE UNE FLÈCHE", projectileDe(arc) === "fleche",
             String(projectileDe(arc)));

    // UN SORT OFFENSIF. « Pouvoir magique » + « Distance ».
    const sort = await extraire({ id: "C_SORT", data: {
        Nom: "Trait de force", Fatigue: 20, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "POUV", mods: { DIST: 4 } }] }
    }});
    verifier("le sort est extrait comme magique",
             !!sort && sort.attaques[0].typeRes === "Magique",
             sort && sort.attaques[0].typeRes);
    verifier("UN SORT À DISTANCE ENVOIE UNE BOULE BLEUE", projectileDe(sort) === "magie",
             String(projectileDe(sort)));

    // UN SOIN LANCÉ DE LOIN.
    const soin = await extraire({ id: "C_SOIN", data: {
        Nom: "Main guérisseuse", Fatigue: 12, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "SOIN", mods: { DIST: 2 } }] }
    }});
    verifier("UN SOIN À DISTANCE ENVOIE LA MÊME, EN VERT", projectileDe(soin) === "soin",
             String(projectileDe(soin)));

    // UNE ÉPÉE. Aucune distance : rien ne traverse, la ruée du lanceur raconte
    // déjà le coup.
    const epee = await extraire({ id: "C_EPEE", data: {
        Nom: "Taille", Fatigue: 10, Arme: "Épée",
        Composants: { actions: [{ baseEffetId: "ATT", mods: {} }] }
    }});
    verifier("l'épée n'est pas un tir", !!epee && epee.attaques[0].isRanged === false);
    verifier("ET LE CORPS À CORPS N'ENVOIE RIEN", projectileDe(epee) === null,
             String(projectileDe(epee)));

    // UN SOIN AU CONTACT non plus : on soigne en posant la main.
    const soinCac = await extraire({ id: "C_SOIN_CAC", data: {
        Nom: "Imposition", Fatigue: 8, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "SOIN", mods: {} }] }
    }});
    verifier("un soin au contact non plus", projectileDe(soinCac) === null,
             String(projectileDe(soinCac)));

    // UN BOUCLIER JETÉ DE LOIN. Ce n'est pas un soin : c'est un sort, il part
    // en bleu. La distinction compte, parce que isHeal couvre les deux dans
    // l'extracteur — un banc qui ne la vérifierait pas laisserait passer un
    // bouclier vert.
    const bouclier = await extraire({ id: "C_BOUC", data: {
        Nom: "Égide lointaine", Fatigue: 18, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "BOUC", mods: { DIST: 2 } }] }
    }});
    verifier("un bouclier posé de loin part en bleu, pas en vert",
             projectileDe(bouclier) === "magie", String(projectileDe(bouclier)));

    // UN ÉTAT JETÉ DE LOIN, sans la moindre attaque : une immobilisation à
    // trois cases traverse quand même le plateau.
    const immo = await extraire({ id: "C_IMMO", data: {
        Nom: "Racines", Fatigue: 16, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "IMMO", mods: { DIST: 3 } }] }
    }});
    verifier("l'état est bien extrait comme une altération à distance",
             !!immo && immo.attaques.length === 0 && immo.alterations.length > 0
             && immo.alterations[0].isRanged === true,
             immo && JSON.stringify({ a: immo.attaques.length, al: immo.alterations.length }));
    verifier("un état jeté de loin traverse aussi, en bleu",
             projectileDe(immo) === "magie", String(projectileDe(immo)));

    // UNE CARTE QUI FRAPPE ET QUI SOIGNE. On regarde le coup, pas le soin.
    const mixte = await extraire({ id: "C_MIXTE", data: {
        Nom: "Vampirisme", Fatigue: 25, Arme: "Magie",
        Composants: { actions: [
            { baseEffetId: "SOIN", mods: { DIST: 3 } },
            { baseEffetId: "ATT", mods: { DIST: 3 } }
        ] }
    }});
    verifier("frapper l'emporte sur soigner", projectileDe(mixte) === "fleche",
             String(projectileDe(mixte)));
}

// =========================================================================
console.log("\n2. LE DESSIN PART DU LANCEUR ET ARRIVE SUR LA CIBLE");
// =========================================================================
//  Les coordonnées sont celles du PLATEAU, pas celles de l'écran : le SVG est
//  posé dans #transform-plateau, qui porte déjà le pan et le zoom. C'est le
//  même choix que le voile des zones persistantes, et il évite tout recalcul en
//  JavaScript — un recalcul qui serait faux dès que Nico déplace la carte.
{
    const r = await p.evaluate(async () => {
        // Le x lu dans la matrice CALCULÉE, pas dans le style écrit. La nuance a
        // fait échouer ce banc au premier essai, et elle est intéressante : le
        // style inline porte l'ARRIVÉE dès la première frame — c'est la
        // transition CSS qui fait le voyage. Lire le style, c'est donc lire la
        // destination, et croire qu'un projectile téléporté vole très bien.
        const xCalcule = (g) => {
            const m = new DOMMatrixReadOnly(getComputedStyle(g).transform);
            return m.m41;
        };

        const vol = window.animerProjectile({ de: { q: 0, r: 0 },
                                              vers: [{ q: 4, r: 0 }], sorte: "fleche" });
        await new Promise(r => setTimeout(r, 20));
        const svg = document.querySelector("#transform-plateau svg.projectile-combat");
        const g = svg ? svg.querySelector("g[class^='tir-']") : null;
        const dansLePlateau = svg ? svg.parentElement.id : null;
        const vise = g ? g.style.transform : "";
        const tot = g ? xCalcule(g) : -1;
        await new Promise(r => setTimeout(r, 120));
        const milieu = g ? xCalcule(g) : -1;
        await vol;
        return {
            dansLePlateau, vise, tot, milieu,
            restant: document.querySelectorAll("#transform-plateau svg.projectile-combat").length
        };
    });

    verifier("le dessin est posé DANS le plateau", r.dansLePlateau === "transform-plateau",
             String(r.dansLePlateau));
    verifier("il vise la case de la cible", /translate\(240px,\s*0px\)/.test(r.vise), r.vise);
    // LA PREUVE QU'IL VOLE : au début il est encore près du lanceur, plus tard
    // il est plus loin, et jamais au-delà de sa cible. Un projectile qui
    // apparaîtrait directement sur la cible passerait tous les autres contrôles.
    verifier("au départ il est encore près du lanceur", r.tot >= 0 && r.tot < 120,
             `x = ${Math.round(r.tot)}`);
    verifier("puis il a avancé, sans dépasser sa cible",
             r.milieu > r.tot && r.milieu <= 240, `x = ${Math.round(r.milieu)}`);
    verifier("APRÈS L'IMPACT, IL NE RESTE RIEN SUR LE PLATEAU", r.restant === 0,
             `(${r.restant} calque(s))`);
}

// =========================================================================
console.log("\n3. L'ANIMATION NE REND PAS LA MAIN AVANT D'ÊTRE ARRIVÉE");
// =========================================================================
//  C'est la seule chose qui compte vraiment pour le rythme du combat : le
//  spectateur n'applique l'étape qu'au retour, et les dégâts tombent juste
//  après. Une animation qui rend la main trop tôt, c'est un chiffre rouge qui
//  s'affiche avant que la flèche ne touche.
{
    const r = await p.evaluate(async () => {
        const t0 = performance.now();
        await window.animerProjectile({ de: { q: 0, r: 0 }, vers: [{ q: 5, r: 0 }],
                                        sorte: "magie" });
        const mis = performance.now() - t0;
        // La durée suit la distance, mais elle est bornée des deux côtés : ni un
        // clignement sur une case, ni une attente sur huit.
        return { mis,
                 courte: window.dureeProjectile(30),
                 longue: window.dureeProjectile(3000) };
    });
    verifier("un tir de cinq cases prend le temps de traverser", r.mis >= 300,
             `${Math.round(r.mis)} ms`);
    verifier("mais jamais plus qu'un battement de combat", r.mis < 1200,
             `${Math.round(r.mis)} ms`);
    verifier("un tir court reste visible", r.courte >= 220, `${r.courte} ms`);
    verifier("un tir long ne fait pas attendre", r.longue <= 560, `${r.longue} ms`);
}

// =========================================================================
console.log("\n4. TROIS FORMES, TROIS COULEURS, ET ON LES RECONNAÎT");
// =========================================================================
//  Nico a demandé une flèche, une boule bleue et la même en vert. Si les trois
//  se dessinaient pareil, personne ne verrait la différence entre un coup et un
//  soin — et c'est précisément l'information qu'un joueur cherche à l'écran.
{
    const r = await p.evaluate(async () => {
        const lire = async (sorte) => {
            const vol = window.animerProjectile({ de: { q: 0, r: 0 },
                                                  vers: [{ q: 3, r: 0 }], sorte });
            await new Promise(r => setTimeout(r, 30));
            const svg = document.querySelector("#transform-plateau svg.projectile-combat");
            const html = svg ? svg.innerHTML : "";
            await vol;
            return html;
        };
        return { fleche: await lire("fleche"), magie: await lire("magie"),
                 soin: await lire("soin"), teintes: window.TEINTES_PROJECTILE };
    });

    verifier("la flèche est dessinée comme une flèche",
             r.fleche.includes("<polygon") && !r.fleche.includes("<circle"));
    verifier("la boule est dessinée comme une boule",
             r.magie.includes("<circle") && !r.magie.includes("<polygon"));
    verifier("le tir magique est bleu", r.magie.includes(r.teintes.magie.corps),
             r.teintes.magie.corps);
    verifier("le soin est vert", r.soin.includes(r.teintes.soin.corps),
             r.teintes.soin.corps);
    verifier("et les deux boules ne se confondent pas",
             r.teintes.magie.corps !== r.teintes.soin.corps);
    verifier("chaque tir a sa lueur", r.magie.includes("feGaussianBlur"));
}

// =========================================================================
console.log("\n5. CE QUI N'A NULLE PART OÙ ALLER NE DESSINE RIEN");
// =========================================================================
//  Un soin sur soi-même, une zone posée sous ses pieds : le départ et l'arrivée
//  sont la même case. Un projectile de longueur nulle est un point immobile
//  posé sur le plateau — et s'il n'est pas retiré, il s'y empile. On préfère ne
//  rien dessiner du tout.
{
    const r = await p.evaluate(async () => {
        await window.animerProjectile({ de: { q: 2, r: 2 }, vers: [{ q: 2, r: 2 }],
                                        sorte: "soin" });
        const surSoi = document.querySelectorAll("#transform-plateau svg.projectile-combat").length;

        // Et les cas dégénérés, qui arrivent pour de vrai : une carte sans
        // cible lisible, un plateau pas encore dessiné.
        await window.animerProjectile({ de: { q: 0, r: 0 }, vers: [], sorte: "fleche" });
        await window.animerProjectile({ de: null, vers: [{ q: 1, r: 0 }], sorte: "fleche" });
        await window.animerProjectile({});
        return { surSoi,
                 restant: document.querySelectorAll("#transform-plateau svg.projectile-combat").length };
    });
    verifier("un tir sur soi-même ne pose aucun dessin", r.surSoi === 0, `(${r.surSoi})`);
    verifier("et sans cible, rien n'est posé non plus", r.restant === 0, `(${r.restant})`);
}

// =========================================================================
console.log("\n6. UNE ZONE TOUCHE PLUSIEURS CIBLES : AUTANT DE TIRS");
// =========================================================================
//  Une boule de feu lancée sur trois ennemis ne part pas trois fois : elle part
//  une fois, vers chacun, dans le même souffle. Et tout repart ensemble — un
//  seul calque à poser, un seul à retirer.
{
    const r = await p.evaluate(async () => {
        const vol = window.animerProjectile({
            de: { q: 0, r: 0 },
            vers: [{ q: 3, r: 0 }, { q: 0, r: 3 }, { q: 2, r: 2 }], sorte: "magie" });
        await new Promise(r => setTimeout(r, 30));
        const svg = document.querySelector("#transform-plateau svg.projectile-combat");
        const tirs = svg ? svg.querySelectorAll("g[class^='tir-']").length : 0;
        const calques = document.querySelectorAll("#transform-plateau svg.projectile-combat").length;
        await vol;
        return { tirs, calques,
                 restant: document.querySelectorAll("#transform-plateau svg.projectile-combat").length };
    });
    verifier("trois cibles, trois tirs", r.tirs === 3, `(${r.tirs})`);
    verifier("dans un seul calque", r.calques === 1, `(${r.calques})`);
    verifier("et le plateau est rendu propre", r.restant === 0, `(${r.restant})`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
