// LA MISE À JOUR QUI N'OBLIGE PLUS À RÉINSTALLER L'APPLICATION
//
// Sur l'iPad, chaque livraison demandait à Nico de supprimer l'icône de l'écran
// d'accueil et de réinstaller le jeu — puis de retaper ses cinq clés d'API, que
// la désinstallation emportait avec le stockage du site.
//
// LA CAUSE : tous les fichiers du jeu portent un `?v=N` qu'on monte à chaque
// livraison, sauf index.html, qui n'a pas de `?v=` parce qu'il EST l'adresse.
// Tant que l'appareil sert son ancienne copie de index.html, il lit les anciens
// numéros et charge l'ancien jeu en entier. Une webapp d'écran d'accueil a en
// plus son propre cache, que relancer par l'icône ne bouscule pas.
//
// LE REMÈDE, mesuré ici : au chargement, le jeu relit un version.json qu'on
// interdit de mettre en cache, et s'il découvre qu'il tourne sur une vieille
// page, il se recharge sur une adresse que le cache ne connaît pas.
//
// CE QUE CE BANC TIENT :
//   • les deux numéros de version — celui du code et celui de version.json —
//     ne peuvent pas diverger sans que ça se voie ici ;
//   • une version plus récente sur le serveur déclenche UN rechargement, vers
//     une adresse chasse-cache, en gardant les autres paramètres ;
//   • LES CLÉS D'API NE BOUGENT JAMAIS : le localStorage n'est pas touché, dans
//     aucun des cas — c'est tout l'intérêt de la manœuvre ;
//   • aucune boucle : si on a déjà rechargé pour cette version et qu'on lit
//     toujours l'ancienne, on s'arrête ;
//   • à jour, hors ligne, ou fichier illisible : aucun rechargement ;
//   • index.html charge bien le module APRÈS la trace (qui porte le numéro).
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const RACINE = '/home/user/Ivalis';
const SRC = fs.readFileSync(RACINE + '/mise_a_jour.js', 'utf-8');

// =========================================================================
//  UN POSTE DE PAPIER : une adresse, un réseau, un stockage, des caches.
// =========================================================================
//  Tout est faux sauf le module lui-même, et chaque geste est compté : un
//  rechargement, une écriture dans le stockage, un cache vidé.
function poste({ versionPage, versionServeur, adresse = "/index.html", reseau = true, corps,
                protocole = "http:" }) {
    const journal = { rechargements: [], ecrituresStockage: 0, lecturesReseau: [], cachesVides: [] };

    const [chemin, requete] = adresse.split("?");
    const cles = {
        "ivalis_OPENAI_API_KEY": "sk-secrète",
        "ivalis_CLOUDINARY_API_SECRET": "cloud-secrète",
        "ivalis_vol_musique": "0.30"
    };

    const w = {
        VERSION_IVALIS: versionPage,
        location: {
            protocol: protocole,
            pathname: chemin,
            search: requete ? "?" + requete : "",
            hash: "",
            replace: (cible) => { journal.rechargements.push(cible); }
        },
        history: {
            replaceState: (_e, _t, cible) => { journal.adresseNettoyee = cible; }
        },
        localStorage: {
            getItem: (k) => (k in cles ? cles[k] : null),
            setItem: (k, v) => { journal.ecrituresStockage++; cles[k] = v; },
            removeItem: (k) => { journal.ecrituresStockage++; delete cles[k]; },
            clear: () => { journal.ecrituresStockage++; Object.keys(cles).forEach(k => delete cles[k]); }
        },
        caches: {
            keys: async () => ["vieux-cache"],
            delete: async (n) => { journal.cachesVides.push(n); return true; }
        },
        fetch: async (url) => {
            journal.lecturesReseau.push(url);
            if (!reseau) throw new Error("hors ligne");
            return { json: async () => (corps !== undefined ? corps : { version: versionServeur }) };
        }
    };

    const muet = { log: () => {}, warn: () => {}, error: () => {} };
    new Function('window', 'console', SRC)(w, muet);
    return { w, journal, cles, fini: () => w.VERIFICATION_MAJ };
}

// =========================================================================
console.log("\n1. LES DEUX NUMÉROS DE VERSION NE PEUVENT PAS DIVERGER");
// =========================================================================
// Le code annonce sa version dans trace_combat.js, le serveur la sienne dans
// version.json. C'est en les COMPARANT que le jeu sait qu'un appareil est
// périmé : les laisser se désaccorder, c'est soit un rechargement qui ne vient
// jamais, soit un appareil qui se recharge sans raison à chaque démarrage.
{
    const trace = fs.readFileSync(RACINE + '/trace_combat.js', 'utf-8');
    const trouve = trace.match(/window\.VERSION_IVALIS\s*=\s*(\d+)\s*;/);
    verifier("le code annonce bien une version", !!trouve, trouve ? trouve[1] : "(introuvable)");

    let fichier = null, erreur = "";
    try { fichier = JSON.parse(fs.readFileSync(RACINE + '/version.json', 'utf-8')); }
    catch (e) { erreur = e.message; }
    verifier("version.json existe et se lit", !!fichier, erreur);
    verifier("il ne contient qu'un numéro, et c'est un nombre",
             !!fichier && typeof fichier.version === "number", JSON.stringify(fichier));
    verifier("ET C'EST EXACTEMENT CELUI DU CODE",
             !!fichier && !!trouve && String(fichier.version) === trouve[1],
             `version.json ${fichier && fichier.version} contre trace_combat ${trouve && trouve[1]}`);
}

// =========================================================================
console.log("\n2. UNE VERSION PLUS RÉCENTE : UN RECHARGEMENT, ET UN SEUL");
// =========================================================================
{
    const p = poste({ versionPage: 97, versionServeur: 98 });
    const bilan = await p.fini();

    verifier("le jeu constate qu'il est périmé", bilan.etat === "rechargement", bilan.etat);
    verifier("IL RECHARGE, UNE FOIS", p.journal.rechargements.length === 1,
             JSON.stringify(p.journal.rechargements));
    verifier("sur une adresse que le cache ne connaît pas",
             p.journal.rechargements[0] === "/index.html?maj=98", p.journal.rechargements[0]);
    verifier("le fichier de version est demandé hors cache",
             /version\.json\?t=\d+/.test(p.journal.lecturesReseau[0] || ""), p.journal.lecturesReseau[0]);
    verifier("les caches de l'appareil sont vidés au passage",
             p.journal.cachesVides.length === 1, JSON.stringify(p.journal.cachesVides));

    // LE POINT DE TOUTE L'AFFAIRE.
    verifier("ET LES CLÉS D'API NE BOUGENT PAS D'UN OCTET",
             p.journal.ecrituresStockage === 0 && p.cles["ivalis_OPENAI_API_KEY"] === "sk-secrète",
             `${p.journal.ecrituresStockage} écriture(s) dans le stockage`);
}

// =========================================================================
console.log("\n3. LES AUTRES PARAMÈTRES DE L'ADRESSE SURVIVENT");
// =========================================================================
{
    const p = poste({ versionPage: 97, versionServeur: 98, adresse: "/index.html?partie=42" });
    await p.fini();
    verifier("le paramètre d'origine est toujours là, avec le chasse-cache en plus",
             p.journal.rechargements[0] === "/index.html?partie=42&maj=98",
             p.journal.rechargements[0]);
}

// =========================================================================
console.log("\n4. JAMAIS DE BOUCLE DE RECHARGEMENT");
// =========================================================================
// Le cas qui transformerait la trouvaille en piège : on a déjà rechargé en
// visant la 98, et le serveur sert TOUJOURS l'ancienne page. Recharger encore
// ne ferait que tourner en rond, sur un appareil qui ne peut pas s'en sortir.
{
    const p = poste({ versionPage: 97, versionServeur: 98, adresse: "/index.html?maj=98" });
    const bilan = await p.fini();
    verifier("le jeu voit qu'il a déjà essayé pour cette version",
             bilan.etat === "bloquee", bilan.etat);
    verifier("ET IL NE RECHARGE PAS UNE SECONDE FOIS",
             p.journal.rechargements.length === 0, JSON.stringify(p.journal.rechargements));
    verifier("le stockage reste intact là aussi", p.journal.ecrituresStockage === 0);

    // En revanche, une version ENCORE plus récente n'est pas la tentative
    // précédente : celle-là doit bien déclencher un rechargement.
    const q = poste({ versionPage: 97, versionServeur: 99, adresse: "/index.html?maj=98" });
    await q.fini();
    verifier("mais une version encore plus récente relance bien la manœuvre",
             q.journal.rechargements[0] === "/index.html?maj=99", q.journal.rechargements[0]);
}

// =========================================================================
console.log("\n5. À JOUR : ON NE TOUCHE À RIEN, ET ON RANGE L'ADRESSE");
// =========================================================================
{
    const p = poste({ versionPage: 98, versionServeur: 98 });
    const bilan = await p.fini();
    verifier("le jeu se sait à jour", bilan.etat === "a-jour", bilan.etat);
    verifier("aucun rechargement", p.journal.rechargements.length === 0);
    verifier("aucun cache vidé", p.journal.cachesVides.length === 0);

    // Après un rechargement réussi, l'adresse traîne encore le paramètre : on la
    // nettoie, pour qu'elle redevienne une adresse ordinaire.
    const q = poste({ versionPage: 98, versionServeur: 98, adresse: "/index.html?maj=98" });
    await q.fini();
    verifier("et le chasse-cache de la fois d'avant est retiré de l'adresse",
             q.journal.adresseNettoyee === "/index.html", String(q.journal.adresseNettoyee));
    verifier("sans recharger pour autant", q.journal.rechargements.length === 0);
}

// =========================================================================
console.log("\n6. PAS DE RÉSEAU, OU UN FICHIER ILLISIBLE : ON JOUE QUAND MÊME");
// =========================================================================
{
    const p = poste({ versionPage: 97, versionServeur: 98, reseau: false });
    const bilan = await p.fini();
    verifier("hors ligne, le jeu le note et continue", bilan.etat === "injoignable", bilan.etat);
    verifier("sans recharger", p.journal.rechargements.length === 0);

    const q = poste({ versionPage: 97, versionServeur: 98, corps: { rien: true } });
    const bilanQ = await q.fini();
    verifier("un version.json sans numéro ne déclenche rien non plus",
             bilanQ.etat === "illisible" && q.journal.rechargements.length === 0, bilanQ.etat);
}

// =========================================================================
console.log("\n7. UNE PAGE OUVERTE EN file:// NE DEMANDE RIEN À PERSONNE");
// =========================================================================
// Les bancs ouvrent le jeu en file:// par dizaines. Une requête lancée là ne
// peut que se faire refuser par le navigateur, en salissant la console d'une
// erreur que ces bancs comptent — à raison — comme une erreur JS. Et il n'y a
// de toute façon aucun serveur à interroger.
{
    const p = poste({ versionPage: 97, versionServeur: 98, protocole: "file:" });
    const bilan = await p.fini();
    verifier("le module se tait devant un fichier local", bilan.etat === "local", bilan.etat);
    verifier("ET NE LANCE AUCUNE REQUÊTE", p.journal.lecturesReseau.length === 0,
             JSON.stringify(p.journal.lecturesReseau));
    verifier("ni aucun rechargement", p.journal.rechargements.length === 0);
}

// =========================================================================
console.log("\n8. LE MODULE EST BRANCHÉ, ET AU BON ENDROIT");
// =========================================================================
// Il lit window.VERSION_IVALIS, que trace_combat.js pose : chargé avant elle,
// il comparerait à « undefined » et rechargerait l'appareil à chaque démarrage.
{
    const html = fs.readFileSync(RACINE + '/index.html', 'utf-8');
    const posTrace = html.indexOf('src="trace_combat.js');
    const posMaj = html.indexOf('src="mise_a_jour.js');
    verifier("index.html charge bien mise_a_jour.js", posMaj > 0, `position ${posMaj}`);
    verifier("APRÈS trace_combat.js, qui porte le numéro de version",
             posMaj > posTrace, `trace ${posTrace}, màj ${posMaj}`);
    // Avant les modules : inutile de charger tout le jeu pour le jeter ensuite.
    const posPremierModule = html.indexOf('<script type="module" src=');
    verifier("et avant les modules du jeu", posMaj < posPremierModule,
             `màj ${posMaj}, premier module ${posPremierModule}`);
    verifier("il porte un ?v=, comme tous les autres fichiers",
             /src="mise_a_jour\.js\?v=\d+"/.test(html));
}

console.log(echecs === 0
  ? "\n✅ Une page périmée se remplace toute seule, une seule fois, sans toucher aux clés."
  : `\n❌ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
