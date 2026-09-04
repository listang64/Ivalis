// LE HÉROS NAÎT DÉJÀ HABILLÉ.
//
// Nico l'a vu en jouant : son personnage se créait, puis se redessinait tout
// seul quelques secondes plus tard avec son armure — deux images, et un visage
// qui change sous les yeux du joueur. Et son arme n'était jamais illustrée.
//
// L'ordre est donc renversé : l'équipement d'abord, le héros ensuite, avec
// l'image de la tenue jointe en binaire au portrait. Ce banc verrouille CET
// ORDRE, appel réseau par appel réseau, sur le vrai code d'app.js.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

function extraire(fichier, marqueur, finLigne = '}') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

const SRC_APP = ['function equiperLeHerosDeDepart(donnees) {',
                 'async function illustrerEquipementDeDepart(donnees) {',
                 'function annoncerEtapeCreation(texte) {',
                 'function frontVersPersoDoc(donnees, idPersonnage) {',
                 'async function genererEtStockerPortrait(donnees) {',
                 'async function sauvegarderFichePersonnage(donnees, skipImage = false) {']
    .map(m => extraire('app.js', m)).join('\n\n');
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const SRC_IA = fs.readFileSync('/home/user/Ivalis/objets_ia.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
await p.goto('https://banc.ivalis/');

const res = await p.evaluate(({ srcObjets, srcIA, srcApp }) => {
    const journal = { appels: [], ecritures: [], etapes: [], blobs: [] };

    // --- Firestore de façade -------------------------------------------
    const base = {};
    const db = {};
    const COL = { PERSONNAGES: "Personnages", PARTIES: "Systeme_Parties",
                  CERVEAU_IA: "Cerveau_IA", CARACTERISTIQUES: "Caracteristiques" };
    const doc = (...a) => ({ chemin: a.slice(1).join("/"), id: a[2] });
    const collection = (_db, col) => ({ col });
    const query = (...a) => a[0];
    const where = () => ({});
    const getDocs = async () => ({ forEach: () => {} });
    const getDoc = async (ref) => ({ exists: () => !!base[ref.chemin],
                                     data: () => base[ref.chemin] });
    const setDoc = async (ref, data) => { journal.ecritures.push({ chemin: ref.chemin, data });
                                          base[ref.chemin] = JSON.parse(JSON.stringify(data)); };
    const updateDoc = async (ref, maj) => { journal.ecritures.push({ chemin: ref.chemin, maj }); };

    // --- Les fausses API, qui notent l'ordre exact ----------------------
    window.fetch = async (url, options) => {
        const u = String(url);
        if (u.includes("generativelanguage")) {
            const envoye = JSON.parse(options.body);
            const demandes = JSON.parse(envoye.contents[0].parts[0].text);
            journal.appels.push({ quoi: "MIA décrit", objets: demandes.map(o => o.nom) });
            return { json: async () => ({ candidates: [{ content: { parts: [{ functionCall: {
                name: "decrireObjets",
                args: { objets: demandes.map(o => ({ uid: o.uid, apparence: "Description." })) } } }] } }] }) };
        }
        if (u.includes("api.openai.com")) {
            const corps = options.body;
            if (typeof corps === "string") {
                const json = JSON.parse(corps);
                journal.appels.push({ quoi: "génération", endpoint: "generations",
                                      prompt: json.prompt, taille: json.size, images: 0 });
            } else {
                const images = corps.getAll("image[]").concat(corps.getAll("image"));
                journal.appels.push({ quoi: "édition", endpoint: u.includes("/edits") ? "edits" : "generations",
                                      prompt: corps.get("prompt"), taille: corps.get("size"),
                                      images: images.length, noms: images.map(f => f.name) });
            }
            return { status: 200, ok: true, text: async () => JSON.stringify({ data: [{ b64_json: "IMG" }] }) };
        }
        if (u.includes("api.cloudinary.com")) {
            return { json: async () => ({ secure_url: "https://res.cloudinary.com/x/image/upload/v1/img" + journal.appels.length + ".png",
                                          public_id: "pid" }) };
        }
        throw new Error("appel réseau inattendu : " + u);
    };

    // --- Le minimum d'app.js dont dépendent les fonctions chargées -------
    const CLES_LS = { gemini: "ivalis_GEMINI_API_KEY", openai: "ivalis_OPENAI_API_KEY",
                      cloudName: "ivalis_CLOUDINARY_CLOUD_NAME", cloudKey: "ivalis_CLOUDINARY_API_KEY",
                      cloudSecret: "ivalis_CLOUDINARY_API_SECRET" };
    Object.values(CLES_LS).forEach(c => localStorage.setItem(c, "x"));
    const lireClesApi = () => ({ gemini: "x", openai: "x", cloudName: "x", cloudKey: "x", cloudSecret: "x" });
    const afficherAlerteCles = () => {};
    const recupererInstructionStyle = async () => "STYLE_DE_LA_PARTIE";
    const sha1Hex = async () => "sig";
    const detourerFondMagenta = async () => "data:image/png;base64,DETOURE";
    const genererEtStockerTokenBackground = async () => { journal.appels.push({ quoi: "token" }); return true; };

    window.imageVersBlobPng = async (url) => { journal.blobs.push(url); return new Blob(["px"], { type: "image/png" }); };
    window.detourerFondMagenta = detourerFondMagenta;
    window.signatureCloudinaryIvalis = sha1Hex;
    window.PERSOS_PARTIE = [];

    // Le titre de l'écran de chargement, pour vérifier ce que voit le joueur.
    const titre = { innerText: "" };
    document.getElementById = (id) => id === "titre-chargement-ia" ? titre : null;
    const vraiSet = Object.getOwnPropertyDescriptor(titre, "innerText");
    Object.defineProperty(titre, "innerText", {
        get: () => titre.__t || "",
        set: (v) => { titre.__t = v; journal.etapes.push(v); }
    });

    eval(srcObjets);
    eval(srcIA);
    eval(srcApp);
    window.LIMITE_IMAGES_PAR_MINUTE = 60;
    // Les fonctions évaluées ici ne survivent pas d'un evaluate à l'autre :
    // on garde une poignée pour le second scénario.
    window.__sauvegarder = sauvegarderFichePersonnage;
    window.__journal = journal;

    return (async () => {
        const donnees = {
            idPartie: "PARTIE", idJoueur: "P1", idPersonnage: "", prenom: "Pliors",
            race: "Humain", genre: "Homme", age: "30",
            typeArme: "Arme lourde CAC", typeArmure: "Armure intermédiaire"
        };
        const resultat = await sauvegarderFichePersonnage(donnees);

        const fiche = journal.ecritures.find(e => e.chemin.startsWith("Personnages/"));
        return {
            appels: journal.appels, etapes: journal.etapes, blobs: journal.blobs,
            resultat, fiche: fiche ? fiche.data : null,
            ecrituresApres: journal.ecritures.filter(e => e.maj).map(e => Object.keys(e.maj).join(","))
        };
    })();
}, { srcObjets: SRC_OBJETS, srcIA: SRC_IA, srcApp: SRC_APP });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log("\n     déroulé réel :");
res.appels.forEach((a, i) => console.log(`       ${i + 1}. ${a.quoi}${a.endpoint ? " (" + a.endpoint + ", " + a.images + " image(s) jointe(s))" : ""}${a.objets ? " : " + a.objets.join(", ") : ""}`));

// =========================================================================
console.log("\n1. L'ÉQUIPEMENT EST DESSINÉ AVANT LE HÉROS");
{
    const mia = res.appels.findIndex(a => a.quoi === "MIA décrit");
    const objets = res.appels.map((a, i) => ({ ...a, i })).filter(a => a.quoi === "génération");
    const portrait = res.appels.findIndex(a => a.quoi === "édition");

    verifier("MIA_Objets décrit l'équipement en premier", mia === 0, `(position ${mia + 1})`);
    verifier("l'arme ET la tenue sont illustrées, pas seulement la tenue",
             objets.length === 2, `(${objets.length} objet(s) dessiné(s))`);
    verifier("les deux passent bien par MIA",
             (res.appels[0].objets || []).length === 2, `(${(res.appels[0].objets || []).join(", ")})`);
    verifier("le portrait vient APRÈS les deux objets",
             portrait > 0 && objets.every(o => o.i < portrait),
             `(objets en ${objets.map(o => o.i + 1).join(",")}, portrait en ${portrait + 1})`);
    verifier("un seul portrait est dessiné, pas deux",
             res.appels.filter(a => a.quoi === "édition").length === 1);
    verifier("aucun rhabillage ne suit la création",
             res.appels.filter(a => a.endpoint === "edits").length === 1,
             `(${res.appels.filter(a => a.endpoint === "edits").length} édition(s))`);
}

console.log("\n2. LA TENUE EST JOINTE AU PORTRAIT, EN BINAIRE");
{
    const portrait = res.appels.find(a => a.quoi === "édition") || {};
    verifier("le portrait passe par l'endpoint d'ÉDITION",
             portrait.endpoint === "edits", `(${portrait.endpoint})`);
    verifier("une image lui est jointe", portrait.images === 1, `(${portrait.images})`);
    verifier("c'est bien la tenue", (portrait.noms || []).join() === "tenue.png", `(${(portrait.noms || []).join()})`);
    verifier("ses pixels sont réellement lus",
             res.blobs.length === 1 && res.blobs[0].includes("img"), `(${res.blobs.join(", ")})`);
    verifier("le prompt dit de recopier la tenue de l'image, pas de l'inventer",
             /tenue montrée sur l'image de référence jointe/.test(portrait.prompt || ""));
    verifier("le style de la partie est toujours injecté",
             (portrait.prompt || "").includes("STYLE_DE_LA_PARTIE"));
    verifier("et le fond magenta toujours exigé",
             /MAGENTA FLUO UNI/.test(portrait.prompt || ""));
    // Tous les héros existants sont dans ce format : en changer ferait
    // cohabiter deux silhouettes sur la même fiche de partie.
    verifier("le portrait garde le format des héros déjà créés",
             portrait.taille === "1024x1792", `(${portrait.taille})`);
}

console.log("\n3. CE QUI PART EN BASE");
{
    const f = res.fiche || {};
    verifier("la fiche porte l'armure ET son image",
             !!(f.Equip_Armure && f.Equip_Armure.image), `(${(f.Equip_Armure || {}).nom})`);
    verifier("elle porte aussi l'arme ET son image",
             !!(f.Equip_Main_Droite && f.Equip_Main_Droite.image)
             || !!(f.Equip_Main_Gauche && f.Equip_Main_Gauche.image),
             `(${(f.Equip_Main_Droite || f.Equip_Main_Gauche || {}).nom})`);
    verifier("le portrait devient la référence, l'avatar habillé reste vide",
             !!f.URL_Cloudinary && f.URL_Avatar_Equipe === "",
             `(réf ${f.URL_Cloudinary}, habillé « ${f.URL_Avatar_Equipe} »)`);
    verifier("aucune écriture d'avatar ne suit la création",
             !res.ecrituresApres.some(c => c.includes("URL_Avatar_Equipe")),
             res.ecrituresApres.join(" | ") || "(aucune)");
}

console.log("\n4. CE QUE LE JOUEUR VOIT PENDANT L'ATTENTE");
{
    verifier("l'écran annonce d'abord la forge de l'équipement",
             (res.etapes[0] || "").includes("Forge de l'équipement"), `(« ${res.etapes[0]} »)`);
    verifier("puis la création du personnage",
             (res.etapes[1] || "").includes("Création de personnage"), `(« ${res.etapes[1]} »)`);
}

console.log("\n5. LA TENUE EST COMPLÈTE, PAS UN SIMPLE PLASTRON");
{
    const w = {};
    new Function('window', SRC_OBJETS)(w);
    const w2 = { localStorage: { getItem: () => "" } };
    new Function('window', 'db', 'doc', 'getDoc', 'updateDoc', SRC_IA)(w2, {}, () => ({}), async () => ({}), async () => ({}));
    const armure = w.objetDeDepart("Armure intermédiaire");
    const prompt = w2.promptImageObjet(armure, "Du cuir bouilli.", "STYLE");

    verifier("le dessin demande une TENUE COMPLÈTE", /TENUE COMPLÈTE/.test(prompt));
    verifier("le vêtement de dessous en fait partie",
             /vêtement de dessous/.test(prompt) && /tunique/.test(prompt));
    verifier("la ceinture, les ptéruges et les jambières aussi",
             /ceinture/.test(prompt) && /ptéruges/.test(prompt) && /jambes/.test(prompt));
    verifier("on doit pouvoir s'habiller entièrement avec",
             /s'habiller entièrement/.test(prompt));
    verifier("elle reste étalée au sol et vide",
             /déplié et étalé/.test(prompt) && /aucun mannequin/.test(prompt));
    verifier("MIA_Objets reçoit la même consigne",
             SRC_IA.includes("UNE ARMURE EST UNE TENUE COMPLÈTE"));
}

// =========================================================================
console.log("\n6. SI L'API REFUSE CE FORMAT, LE HÉROS NAÎT QUAND MÊME");
{
    const repli = await p.evaluate(() => {
        // On rejoue la même création, mais l'API rejette la première taille.
        const vues = [];
        const vraiFetch = window.fetch;
        window.fetch = async (url, options) => {
            const u = String(url);
            if (u.includes("api.openai.com") && typeof options.body !== "string") {
                const taille = options.body.get("size");
                vues.push(taille);
                if (taille === "1024x1792") {
                    return { status: 400, ok: false, text: async () =>
                        JSON.stringify({ error: { message: "Invalid value for 'size'." } }) };
                }
            }
            return vraiFetch(url, options);
        };
        const donnees = { idPartie: "PARTIE", idJoueur: "P1", idPersonnage: "", prenom: "Nadja",
                          race: "Humain", genre: "Femme", age: "28",
                          typeArme: "Arme légère CAC", typeArmure: "Armure légère" };
        return window.__sauvegarder(donnees).then(r => ({ tailles: vues, url: r.url }));
    });
    verifier("le format refusé est réessayé dans l'autre format portrait",
             repli.tailles.includes("1024x1792") && repli.tailles.includes("1024x1536"),
             `(${repli.tailles.join(" → ")})`);
    verifier("et la création aboutit malgré tout", !!repli.url, `(${repli.url})`);
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
