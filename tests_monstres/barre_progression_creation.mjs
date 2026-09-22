// LA BARRE DE PROGRESSION DE L'ÉCRAN DE CRÉATION.
// Nico voulait de quoi faire patienter les joueurs pendant la création d'un
// héros (les appels IA n'ont pas de durée prévisible) : une barre qui avance,
// et des phrases humoristiques sur le JDR qui tournent. Ce banc charge le VRAI
// creation_personnage.js et pilote lui-même les minuteurs (aucune attente
// réelle) pour vérifier le mécanisme de bout en bout.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const srcBrut = fs.readFileSync('/home/user/Ivalis/creation_personnage.js', 'utf-8');
const src = srcBrut.replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

function elementFactice() {
    return { style: {}, innerText: "" };
}

function poste() {
    const w = {};
    const elements = {
        "barre-progression-creation": elementFactice(),
        "barre-progression-creation-remplissage": elementFactice(),
        "phrase-humoristique-creation": elementFactice()
    };
    Object.values(elements).forEach(el => el.style.display = "none");

    const document = { getElementById: (id) => elements[id] || null };

    // De faux minuteurs, pilotés à la main : aucune attente réelle, et le banc
    // décide exactement quand chaque tic se produit. Le délai demandé (ms) est
    // gardé à côté de chaque fonction : c'est ce qui permet de vérifier que la
    // rotation d'une phrase attend bien plus longtemps qu'une autre plus courte,
    // sans avoir à espionner Date.now().
    let prochainId = 1;
    const intervalles = new Map();
    const delais = new Map();
    const setInterval = (fn) => { const id = prochainId++; intervalles.set(id, fn); return id; };
    const clearInterval = (id) => intervalles.delete(id);
    const setTimeout = (fn, ms) => { const id = prochainId++; delais.set(id, { fn, ms }); return id; };
    const clearTimeout = (id) => delais.delete(id);

    new Function('window', 'document', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', src)(
        w, document, setInterval, clearInterval, setTimeout, clearTimeout);

    return {
        w, elements,
        // Déclenche TOUS les setInterval actuellement actifs, une fois.
        ticInterval: () => intervalles.forEach(fn => fn()),
        // Déclenche TOUS les setTimeout en attente, une fois (et les vide).
        ticTimeout: () => { const appels = [...delais.values()]; delais.clear(); appels.forEach(({ fn }) => fn()); },
        // Les délais actuellement en attente, SANS les déclencher : c'est ce
        // qui laisse lire « combien de temps la prochaine phrase va-t-elle
        // rester affichée ? » avant de la faire tourner pour de vrai.
        delaisEnAttente: () => [...delais.values()].map(({ ms }) => ms),
        // Un SEUL setTimeout, le plus ancien en attente — pas tous à la fois.
        // C'est ce qui sépare le fondu d'entrée (200ms) de la rotation qui le
        // suit (plusieurs secondes) : les déclencher ensemble les confondrait.
        ticUnSeulTimeout: () => {
            const it = delais.entries().next();
            if (it.done) return false;
            const [id, { fn }] = it.value;
            delais.delete(id);
            fn();
            return true;
        }
    };
}

console.log("1. LA BARRE ET LA PHRASE SONT CACHÉES PAR DÉFAUT");
{
    const p = poste();
    verifier("la barre est cachée avant tout démarrage",
             p.elements["barre-progression-creation"].style.display === "none");
    verifier("la phrase aussi",
             p.elements["phrase-humoristique-creation"].style.display === "none");
}

console.log("\n2. DÉMARRER AFFICHE LA BARRE ET UNE PREMIÈRE PHRASE");
{
    const p = poste();
    p.w.demarrerBarreProgressionCreation();
    p.ticTimeout(); // la phrase est posée après un court fondu (setTimeout 400ms)

    verifier("la barre s'affiche", p.elements["barre-progression-creation"].style.display === "block");
    verifier("la phrase s'affiche", p.elements["phrase-humoristique-creation"].style.display === "block");
    verifier("une phrase non vide est posée",
             typeof p.elements["phrase-humoristique-creation"].innerText === "string"
             && p.elements["phrase-humoristique-creation"].innerText.length > 0,
             `(« ${p.elements["phrase-humoristique-creation"].innerText} »)`);
    verifier("la barre part de 0%",
             p.elements["barre-progression-creation-remplissage"].style.width === "0%");
}

console.log("\n3. LA BARRE AVANCE EN RALENTISSANT, SANS JAMAIS DÉPASSER 90% SEULE");
{
    const p = poste();
    p.w.demarrerBarreProgressionCreation();
    const remplissage = p.elements["barre-progression-creation-remplissage"];

    const largeurs = [];
    for (let i = 0; i < 40; i++) {
        p.ticInterval();
        largeurs.push(parseFloat(remplissage.style.width));
    }

    verifier("la barre progresse (elle n'est pas restée à 0)", largeurs[largeurs.length - 1] > 0);
    verifier("elle est croissante (jamais de recul)",
             largeurs.every((v, i) => i === 0 || v >= largeurs[i - 1]));
    verifier("elle ralentit en s'approchant de 90% (jamais atteint tout seul)",
             largeurs[largeurs.length - 1] <= 90 && largeurs[largeurs.length - 1] > 80,
             `(${largeurs[largeurs.length - 1].toFixed(1)}%)`);
}

console.log("\n4. LES PHRASES TOURNENT, SANS SE RÉPÉTER D'AFFILÉE");
{
    const p = poste();
    p.w.demarrerBarreProgressionCreation();
    p.ticTimeout();
    const phraseEl = p.elements["phrase-humoristique-creation"];

    const vues = [phraseEl.innerText];
    for (let i = 0; i < 15; i++) {
        p.ticInterval();   // déclenche aussi le tic de rotation des phrases
        p.ticTimeout();    // pose la nouvelle phrase après son fondu
        vues.push(phraseEl.innerText);
    }

    verifier("plusieurs phrases différentes sont vues sur 16 tirages",
             new Set(vues).size > 1, `(${new Set(vues).size} distinctes)`);
    verifier("jamais deux fois DE SUITE la même phrase",
             vues.every((v, i) => i === 0 || v !== vues[i - 1]));
    verifier("il existe un vrai pool de phrases (au moins 10)",
             new Set(vues).size >= 3); // au moins 3 vues sur un petit tirage garanti un pool > quelques-unes
}

console.log("\n5. ARRÊTER SAUTE À 100%, PUIS CACHE TOUT");
{
    const p = poste();
    p.w.demarrerBarreProgressionCreation();
    p.ticInterval(); p.ticInterval();

    p.w.arreterBarreProgressionCreation();
    verifier("la barre saute immédiatement à 100%",
             p.elements["barre-progression-creation-remplissage"].style.width === "100%");
    verifier("la barre reste visible le temps du dernier coup d'œil",
             p.elements["barre-progression-creation"].style.display === "block");

    p.ticTimeout(); // le délai de 500ms avant de tout cacher

    verifier("puis la barre se cache", p.elements["barre-progression-creation"].style.display === "none");
    verifier("et la phrase aussi", p.elements["phrase-humoristique-creation"].style.display === "none");
    verifier("la largeur est remise à 0% pour la prochaine création",
             p.elements["barre-progression-creation-remplissage"].style.width === "0%");
}

console.log("\n6. LE POOL DE PHRASES EST BIEN AXÉ JDR, ET SUFFISAMMENT GARNI");
{
    const match = src.match(/const PHRASES_ATTENTE_CREATION = \[([\s\S]*?)\];/);
    verifier("le tableau de phrases existe dans le vrai code", !!match);
    const phrases = match ? [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]) : [];
    verifier("au moins 10 phrases différentes tournent", phrases.length >= 10, `(${phrases.length})`);
    verifier("aucune n'est vide ou dupliquée",
             phrases.every(p => p.trim().length > 0) && new Set(phrases).size === phrases.length);
}

console.log("\n7. LA CRÉATION COMPLÈTE DÉMARRE ET ARRÊTE BIEN LA BARRE");
{
    verifier("validerEtapeDescriptif démarre la barre avant l'appel serveur",
             /demarrerBarreProgressionCreation[\s\S]*?sauvegarderFichePersonnage\(donnees\)/.test(src));
    verifier("elle s'arrête au succès",
             /resultatServeur = await window\.sauvegarderFichePersonnage\(donnees\);[\s\S]{0,400}arreterBarreProgressionCreation/.test(src));
    verifier("et aussi en cas d'échec (catch)",
             /catch \(e\) \{[\s\S]{0,300}arreterBarreProgressionCreation/.test(src));
}

console.log("\n8. LA DURÉE D'AFFICHAGE SUIT LA LONGUEUR DE LA PHRASE");
// Nico : « les textes rigolos défilent trop vite, on n'a pas le temps de les
// lire, et certains paraissent tronqués » — un rythme fixe (3200 ms pour
// toutes) coupait les phrases longues avant la fin de leur lecture. Chaque
// phrase programme désormais elle-même sa propre durée, proportionnelle à sa
// longueur, avec un plancher pour les plus courtes.
{
    const p = poste();
    p.w.demarrerBarreProgressionCreation();
    const phraseEl = p.elements["phrase-humoristique-creation"];

    const releves = [];
    for (let i = 0; i < 20; i++) {
        p.ticUnSeulTimeout();                 // le fondu d'entrée : le texte apparaît
        const texte = phraseEl.innerText;
        const attentes = p.delaisEnAttente();  // une seule attente en cours : la rotation
        releves.push({ texte, duree: attentes[0] });
        p.ticUnSeulTimeout();                 // la rotation : programme la phrase suivante
    }

    verifier("chaque phrase affichée a bien une seule attente de rotation en cours",
             releves.every(x => x.duree !== undefined));
    verifier("AUCUNE PHRASE N'EST EXPÉDIÉE EN MOINS DE 4 SECONDES",
             releves.every(x => x.duree >= 4000),
             JSON.stringify(releves.map(x => x.duree)));
    // Pas une simple tendance : CHAQUE durée observée doit coller pile à la
    // formule (90 ms/caractère, plancher 4 s) — un contrôle déterministe,
    // pas soumis au hasard des 20 tirages.
    verifier("chaque durée colle exactement à la formule (90 ms/caractère, plancher 4 s)",
             releves.every(x => x.duree === Math.max(4000, x.texte.length * 90)),
             releves.map(x => `${x.texte.length}c→${x.duree}ms (attendu ${Math.max(4000, x.texte.length * 90)}ms)`).join(", "));
    // Et donc, mécaniquement : deux phrases de longueurs différentes n'ont
    // jamais la même durée, ni la plus courte plus longtemps que la plus longue.
    const paireDifferente = releves.find((a, i) => releves.slice(i + 1).some(b => a.texte.length !== b.texte.length));
    if (paireDifferente) {
        const autre = releves.find(b => b.texte.length !== paireDifferente.texte.length);
        verifier("une phrase plus longue reste affichée plus longtemps",
                 (paireDifferente.texte.length > autre.texte.length) === (paireDifferente.duree > autre.duree),
                 `${paireDifferente.texte.length}c→${paireDifferente.duree}ms vs ${autre.texte.length}c→${autre.duree}ms`);
    }
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
