// LE HÉROS PORTE VRAIMENT SON ARMURE.
//
// Même méthode que les pions : on n'envoie pas une URL dans le prompt (le
// modèle l'ignore), on envoie les PIXELS. Deux images cette fois — le portrait
// de référence du héros, puis l'armure — et le dessinateur rhabille le premier
// avec la seconde.
//
// Ce que ce banc surveille de près : que le portrait de RÉFÉRENCE ne soit
// jamais écrasé (sans quoi le visage dériverait d'armure en armure, comme une
// photocopie de photocopie), que les armes ne déclenchent rien, et qu'un
// changement d'armure ne lance jamais deux dessins concurrents.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const sansImports = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const SRC_IA = sansImports('objets_ia.js');
const SRC_LOOT = sansImports('loot.js');

function extraire(fichier, marqueur, finLigne = '};') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}
const SRC_CONVERSION = extraire('app.js', 'function persoDocVersFront(id, d) {', '}');
const SRC_DOC = extraire('app.js', 'function frontVersPersoDoc(donnees, idPersonnage) {', '}');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
await p.goto('https://banc.ivalis/');

// =========================================================================
console.log("1. DEUX AVATARS, UN SEUL POINT DE BASCULE");
{
    const res = await p.evaluate(({ srcConv, srcDoc }) => {
        eval(srcConv); eval(srcDoc);
        const base = { Prenom_Personnage: "Pliors", URL_Cloudinary: "REF.png" };
        return {
            sansEquipe: persoDocVersFront("J1", base),
            avecEquipe: persoDocVersFront("J1", { ...base, URL_Avatar_Equipe: "HABILLE.png" }),
            equipeVide: persoDocVersFront("J1", { ...base, URL_Avatar_Equipe: "" }),
            // Ce qui repart en base après un aller-retour complet.
            allerRetour: frontVersPersoDoc(persoDocVersFront("J1", { ...base, URL_Avatar_Equipe: "HABILLE.png" }), "J1"),
            // Une fiche neuve : le portrait tout juste généré devient la référence.
            creation: frontVersPersoDoc({ urlCloudinary: "NEUF.png" }, "J1")
        };
    }, { srcConv: SRC_CONVERSION, srcDoc: SRC_DOC });

    verifier("sans avatar habillé, le jeu affiche le portrait de référence",
             res.sansEquipe.urlCloudinary === "REF.png", `(${res.sansEquipe.urlCloudinary})`);
    verifier("avec un avatar habillé, c'est lui que le jeu affiche",
             res.avecEquipe.urlCloudinary === "HABILLE.png", `(${res.avecEquipe.urlCloudinary})`);
    verifier("la référence reste lisible à part, pour les régénérations",
             res.avecEquipe.urlPortraitReference === "REF.png", `(${res.avecEquipe.urlPortraitReference})`);
    verifier("un avatar habillé vidé fait revenir le portrait d'origine",
             res.equipeVide.urlCloudinary === "REF.png", `(${res.equipeVide.urlCloudinary})`);
    verifier("un aller-retour par la base ne détruit PAS la référence",
             res.allerRetour.URL_Cloudinary === "REF.png"
             && res.allerRetour.URL_Avatar_Equipe === "HABILLE.png",
             `(réf ${res.allerRetour.URL_Cloudinary}, habillé ${res.allerRetour.URL_Avatar_Equipe})`);
    verifier("à la création, le portrait neuf devient la référence",
             res.creation.URL_Cloudinary === "NEUF.png" && res.creation.URL_Avatar_Equipe === "");
}

// =========================================================================
console.log("\n2. LE RHABILLAGE : DEUX IMAGES EN BINAIRE");
const res = await p.evaluate(({ srcObjets, srcIA, srcLoot }) => {
    const journal = { openai: [], cloudinary: [], ecritures: [], blobs: [] };

    // --- Doublures ------------------------------------------------------
    const base = { "Personnages/J1": { Equip_Armure: null } };
    const db = {};
    const doc = (...a) => ({ chemin: a.slice(1).join("/"), id: a[2] });
    const getDoc = async (ref) => ({ exists: () => !!base[ref.chemin],
                                     data: () => JSON.parse(JSON.stringify(base[ref.chemin])) });
    const updateDoc = async (ref, maj) => {
        journal.ecritures.push({ chemin: ref.chemin, maj: JSON.parse(JSON.stringify(maj)) });
        Object.assign(base[ref.chemin] = base[ref.chemin] || {}, maj);
    };

    window.fetch = async (url, options) => {
        const u = String(url);
        if (u.includes("generativelanguage")) {
            const envoye = JSON.parse(options.body);
            const demandes = JSON.parse(envoye.contents[0].parts[0].text);
            return { json: async () => ({ candidates: [{ content: { parts: [{ functionCall: {
                name: "decrireObjets",
                args: { objets: demandes.map(o => ({ uid: o.uid, apparence: "Description." })) } } }] } }] }) };
        }
        if (u.includes("api.openai.com")) {
            // Deux formes de corps coexistent : le multipart de l'édition
            // (images jointes) et le JSON de la génération pure.
            const corps = options.body;
            if (typeof corps === "string") {
                const json = JSON.parse(corps);
                journal.openai.push({ url: u, modele: json.model, prompt: json.prompt,
                                      taille: json.size, nbImages: 0, nomsImages: [] });
            } else {
                const images = corps.getAll("image[]");
                journal.openai.push({
                    url: u, modele: corps.get("model"), prompt: corps.get("prompt"),
                    taille: corps.get("size"), nbImages: images.length,
                    nomsImages: images.map(f => f.name),
                    // Une seule image jointe = l'ancienne méthode, à une image.
                    aussiImageSimple: !!corps.get("image")
                });
            }
            return { status: 200, text: async () => JSON.stringify({ data: [{ b64_json: "AVATAR" }] }) };
        }
        if (u.includes("api.cloudinary.com")) {
            const form = options.body;
            journal.cloudinary.push({ dossier: form.get("folder"), publicId: form.get("public_id"),
                                      fichier: String(form.get("file")).slice(0, 40) });
            return { json: async () => ({ secure_url: "https://res.cloudinary.com/x/image/upload/v1/Accueil/Heros/av.png",
                                          public_id: "Accueil/Heros/av" }) };
        }
        throw new Error("appel réseau inattendu : " + u);
    };

    // Les outils partagés d'app.js, doublés : on note ce qu'on leur donne.
    window.imageVersBlobPng = async (url) => { journal.blobs.push(url); return new Blob(["px"], { type: "image/png" }); };
    window.detourerFondMagenta = async (url) => "data:image/png;base64,DETOURE";
    window.signatureCloudinaryIvalis = async () => "sig";

    ["ivalis_GEMINI_API_KEY", "ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME",
     "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(c => localStorage.setItem(c, "x"));

    window.PERSOS_PARTIE = [{ idPersonnage: "J1", prenom: "Pliors",
                              urlPortraitReference: "REF.png", urlCloudinary: "REF.png",
                              equipArmure: null, equipMainDroite: null, equipMainGauche: null }];
    window.jouerSonClic = () => {};
    window.modifierPartie = async () => null;
    window.champDocVersFront = { "Equip_Armure": "equipArmure",
                                 "Equip_Main_Droite": "equipMainDroite",
                                 "Equip_Main_Gauche": "equipMainGauche" };

    eval(srcObjets);
    eval(srcIA);
    eval(srcLoot);
    window.LIMITE_IMAGES_PAR_MINUTE = 60;

    return (async () => {
        const armure = { uid: "arm1", nom: "Linothorax", emplacement: "Armure", type: "Armure légère",
                         rarete: "Commun", image: "ARMURE.png", bonus: { resMag: 20 }, etats: [], effets: [] };
        const arme = { uid: "ep1", nom: "Glaive", emplacement: "Main_Droite", type: "Arme lourde CAC",
                       rarete: "Commun", image: "ARME.png", bonus: { degatsPhys: 2 }, etats: [], effets: [] };

        // --- Équiper une ARMURE : le héros est rhabillé -------------------
        await window.equiperObjet("J1", armure, "Droite");
        await new Promise(r => setTimeout(r, 300));
        const apresArmure = { openai: journal.openai.length, ecritures: [...journal.ecritures] };

        // --- Équiper une ARME : rien ne doit être redessiné ---------------
        const avantArme = journal.openai.length;
        await window.equiperObjet("J1", arme, "Droite");
        await new Promise(r => setTimeout(r, 250));
        const apresArme = journal.openai.length - avantArme;

        // --- Deux armures coup sur coup : un seul dessin à la fois --------
        const avantDouble = journal.openai.length;
        const armure2 = { ...armure, uid: "arm2", nom: "Spolas", image: "ARMURE2.png" };
        await Promise.all([
            window.rhabillerAvatar("J1", armure2),
            window.rhabillerAvatar("J1", armure2)
        ]);
        const doubles = journal.openai.length - avantDouble;

        // --- Lâcher l'armure : retour au portrait d'origine, sans dessin ---
        window.PERSOS_PARTIE[0].equipArmure = armure;
        const avantLacher = journal.openai.length;
        await window.lacherObjet("J1", "Equip_Armure");
        await new Promise(r => setTimeout(r, 150));
        const lacher = { dessins: journal.openai.length - avantLacher,
                         derniere: journal.ecritures[journal.ecritures.length - 1] };

        // --- Une armure SANS image est illustrée d'abord -------------------
        base["Personnages/J1"].Equip_Armure = { uid: "arm3", nom: "Lorica", image: "" };
        const avantSansImage = journal.openai.length;
        const nue = { uid: "arm3", nom: "Lorica", emplacement: "Armure", type: "Armure lourde",
                      rarete: "Commun", image: "", bonus: {}, etats: [], effets: [] };
        await window.suivreArmureEquipee("J1", nue);
        const sansImage = { appels: journal.openai.length - avantSansImage,
                            urls: journal.openai.slice(avantSansImage).map(o => o.url) };

        // --- Sans clés d'API : silence complet -----------------------------
        localStorage.removeItem("ivalis_OPENAI_API_KEY");
        const avantSansCles = journal.openai.length;
        await window.rhabillerAvatar("J1", armure);
        const sansCles = journal.openai.length - avantSansCles;

        return { apresArmure, apresArme, doubles, lacher, sansImage, sansCles,
                 openai: journal.openai, cloudinary: journal.cloudinary,
                 ecritures: journal.ecritures, blobs: journal.blobs };
    })();
}, { srcObjets: SRC_OBJETS, srcIA: SRC_IA, srcLoot: SRC_LOOT });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

const edits = res.openai.filter(o => o.url.includes("/images/edits"));
const premier = edits[0] || {};

verifier("équiper une armure déclenche un rhabillage", edits.length > 0, `(${edits.length} appel(s))`);
verifier("il passe par l'endpoint d'ÉDITION, pas de génération",
         premier.url && premier.url.includes("/v1/images/edits"), `(${premier.url})`);
verifier("deux images sont jointes en binaire", premier.nbImages === 2, `(${premier.nbImages})`);
verifier("le personnage EN PREMIER, l'armure ensuite",
         (premier.nomsImages || []).join(",") === "personnage.png,armure.png",
         `(${(premier.nomsImages || []).join(", ")})`);
verifier("les pixels des deux références sont bien lus",
         res.blobs.includes("REF.png") && res.blobs.includes("ARMURE.png"),
         `(${res.blobs.join(", ")})`);
verifier("c'est le portrait de RÉFÉRENCE qu'on renvoie, jamais l'avatar habillé",
         !res.blobs.includes("https://res.cloudinary.com/x/image/upload/v1/Accueil/Heros/av.png"));
verifier("le même modèle que les pions", premier.modele === "gpt-image-2", `(${premier.modele})`);
verifier("format portrait, comme l'avatar d'origine", premier.taille === "1024x1536", `(${premier.taille})`);

console.log("\n3. CE QUE LE PROMPT EXIGE");
{
    const t = premier.prompt || "";
    verifier("la première image est désignée comme le personnage", /PREMIÈRE est le personnage/.test(t));
    verifier("la seconde comme l'armure à porter", /SECONDE image est une pièce d'équipement/.test(t));
    verifier("le visage doit rester identique, pas « un frère »",
             /À L'IDENTIQUE/.test(t) && /ni un frère/.test(t));
    verifier("les armes ne doivent PAS apparaître", /armes, en revanche, ne doivent PAS apparaître/.test(t));
    verifier("le fond magenta est imposé, pour le détourage", /MAGENTA FLUO UNI \(#FF00FF\)/.test(t));
    verifier("le cadrage reprend celui du portrait d'origine",
             /plan américain/.test(t) && /trois quarts/.test(t));
}

console.log("\n4. HÉBERGEMENT ET ÉCRITURE EN BASE");
{
    const deuxUploads = res.cloudinary.slice(0, 2);
    verifier("l'image passe par Cloudinary avant d'être détourée",
             deuxUploads.length === 2 && deuxUploads[0].dossier === "Accueil/Heros",
             `(${deuxUploads.map(c => c.dossier || c.publicId).join(" → ")})`);
    verifier("le détourage écrase la même image, sans en créer une seconde",
             deuxUploads[1] && deuxUploads[1].publicId === "Accueil/Heros/av"
             && deuxUploads[1].fichier.includes("DETOURE"),
             `(${deuxUploads[1] ? deuxUploads[1].publicId : "aucun"})`);

    const avatars = res.ecritures.filter(e => "URL_Avatar_Equipe" in e.maj);
    verifier("seul l'avatar habillé est écrit en base", avatars.length > 0);
    verifier("le portrait de référence n'est JAMAIS réécrit",
             !res.ecritures.some(e => "URL_Cloudinary" in e.maj),
             res.ecritures.filter(e => "URL_Cloudinary" in e.maj).length + " écriture(s) fautive(s)");
}

console.log("\n5. CE QUI NE DOIT RIEN DÉCLENCHER");
{
    verifier("équiper une ARME ne redessine pas l'avatar", res.apresArme === 0, `(${res.apresArme} appel(s))`);
    verifier("deux rhabillages simultanés n'en font qu'un", res.doubles === 1, `(${res.doubles} dessin(s))`);
    verifier("lâcher l'armure ne coûte aucune image", res.lacher.dessins === 0);
    verifier("et remet le portrait d'origine",
             res.lacher.derniere && res.lacher.derniere.maj.URL_Avatar_Equipe === "",
             JSON.stringify(res.lacher.derniere && res.lacher.derniere.maj));
    verifier("sans clé d'API, rien ne part et rien ne casse", res.sansCles === 0);
}

console.log("\n6. UNE ARMURE SANS IMAGE EST DESSINÉE D'ABORD");
{
    verifier("deux appels : l'armure, puis l'avatar qui la porte",
             res.sansImage.appels === 2, `(${res.sansImage.appels})`);
    verifier("d'abord une génération, ensuite une édition",
             res.sansImage.urls.length === 2
             && res.sansImage.urls[0].includes("/images/generations")
             && res.sansImage.urls[1].includes("/images/edits"),
             res.sansImage.urls.map(u => u.split("/v1/")[1]).join(" → "));
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
