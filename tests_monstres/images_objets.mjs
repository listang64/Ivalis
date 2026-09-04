// LA CHAÎNE COMPLÈTE : DE L'OBJET TIRÉ AU DESSIN AFFICHÉ.
//
// On joue les VRAIES fonctions de objets_ia.js devant de fausses API (Gemini,
// OpenAI, Cloudinary) et un faux Firestore. Ce qu'on vérifie :
//   - MIA_Objets décrit tout un lot en UNE requête, à température tirée au sort ;
//   - le prompt met bien l'arme au sol et l'armure dépliée et VIDE ;
//   - le style graphique de la partie est injecté, lu une seule fois ;
//   - les images partent en parallèle, sans dépasser 15 requêtes par minute ;
//   - l'URL revient dans le butin en base, sans écraser celle d'un autre poste ;
//   - un objet déjà équipé récupère l'image qu'on vient de payer.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/objets_ia.js', 'utf-8');
// Le module importe Firestore : on retire les imports et on injecte des
// doublures dans la portée de l'eval, comme les autres bancs.
const SRC = src.replace(/^import[\s\S]*?;$/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
// Une page servie sur une vraie origine : about:blank n'a pas de localStorage,
// et le module en lit les clés d'API.
await p.route('**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
await p.goto('https://banc.ivalis/');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async (fnSrc) => {
  const journal = { gemini: [], openai: [], cloudinary: [], styleLu: 0, ecrituresPartie: [], ecrituresPerso: [] };

  // --- Faux Firestore -----------------------------------------------------
  const db = { faux: true };
  const doc = (...a) => ({ chemin: a.slice(1).join("/") });
  const getDoc = async (ref) => {
    if (ref.chemin === "Cerveau_IA/INST_76839") {
      journal.styleLu++;
      return { exists: () => true, data: () => ({ Contenu_Direct: "peinture à l'huile dorée, clair-obscur" }) };
    }
    return { exists: () => false, data: () => ({}) };
  };
  const updateDoc = async (ref, maj) => { journal.ecrituresPerso.push({ chemin: ref.chemin, maj }); };

  // --- Fausses API --------------------------------------------------------
  let enVolMax = 0, enVol = 0;
  window.fetch = async (url, options) => {
    const corps = options && options.body;

    if (String(url).includes("generativelanguage")) {
      const envoye = JSON.parse(corps);
      journal.gemini.push(envoye);
      const demandes = JSON.parse(envoye.contents[0].parts[0].text);
      return { json: async () => ({ candidates: [{ content: { parts: [{ functionCall: {
        name: "decrireObjets",
        args: { objets: demandes.map(o => ({ uid: o.uid, apparence: `Description de ${o.nom}.` })) }
      } }] } }] }) };
    }

    if (String(url).includes("api.openai.com")) {
      enVol++; enVolMax = Math.max(enVolMax, enVol);
      journal.openai.push({ instant: Date.now(), corps: JSON.parse(corps) });
      await new Promise(r => setTimeout(r, 20));
      enVol--;
      return { status: 200, text: async () => JSON.stringify({ data: [{ b64_json: "IMAGE" }] }) };
    }

    if (String(url).includes("api.cloudinary.com")) {
      journal.cloudinary.push(String(url));
      return { json: async () => ({ secure_url: "https://res.cloudinary.com/x/image/upload/v1/Objets/obj.png" }) };
    }
    throw new Error("appel réseau inattendu : " + url);
  };

  // --- Le monde du jeu ----------------------------------------------------
  const stock = {
    "ivalis_GEMINI_API_KEY": "G", "ivalis_OPENAI_API_KEY": "O",
    "ivalis_CLOUDINARY_CLOUD_NAME": "C", "ivalis_CLOUDINARY_API_KEY": "K",
    "ivalis_CLOUDINARY_API_SECRET": "S"
  };
  window.localStorage.clear();
  Object.keys(stock).forEach(k => window.localStorage.setItem(k, stock[k]));

  window.champDocVersFront = {
    "Equip_Armure": "equipArmure",
    "Equip_Main_Droite": "equipMainDroite",
    "Equip_Main_Gauche": "equipMainGauche"
  };

  const arme = { uid: "o1", nom: "Épée courte", emplacement: "Main_Droite", type: "Légère", rarete: "Rare", effetTexte: "+3 Force" };
  const armure = { uid: "o2", nom: "Cotte de mailles", emplacement: "Armure", type: "Armure", rarete: "Commun", effetTexte: "" };
  const autre = { uid: "o3", nom: "Hache lourde", emplacement: "Main_Droite", type: "Lourde", rarete: "Épique", effetTexte: "Allonge" };

  const partie = { Butin: { id: "butin_1", ouvert: true, etape: "personnel", parPersonnage: {
    J1: { items: [JSON.parse(JSON.stringify(arme)), JSON.parse(JSON.stringify(armure))], decisions: {}, valide: false },
    J2: { items: [JSON.parse(JSON.stringify(autre))], decisions: {}, valide: false }
  }, pool: [] } };
  window.PARTIE_DATA = partie;

  window.modifierPartie = async (modifier) => {
    const sortie = modifier(partie);
    if (!sortie) return null;
    if (sortie.maj) {
      journal.ecrituresPartie.push(sortie.maj);
      Object.keys(sortie.maj).forEach(cle => {
        const segments = cle.split(".");
        let noeud = partie;
        for (let i = 0; i < segments.length - 1; i++) noeud = noeud[segments[i]];
        noeud[segments[segments.length - 1]] = sortie.maj[cle];
      });
    }
    return sortie.resultat !== undefined ? sortie.resultat : true;
  };

  // J2 a déjà équipé sa hache pendant que l'image se dessinait.
  window.PERSOS_PARTIE = [
    { idPersonnage: "J1", equipArmure: null, equipMainDroite: null, equipMainGauche: null },
    { idPersonnage: "J2", equipArmure: null, equipMainDroite: JSON.parse(JSON.stringify(autre)), equipMainGauche: null }
  ];
  window.appliquerEquipementEnRam = () => {};

  eval(fnSrc);

  // =======================================================================
  const avantTout = window.avancementImagesButin(partie.Butin, ["J1", "J2"]);
  const aIllustrer = window.objetsAIllustrer(partie.Butin, ["J1", "J2"]).map(o => o.uid);

  let rafraichissements = 0;
  window.rafraichirFouilleButin = () => { rafraichissements++; };

  await window.lancerIllustrationButin(partie.Butin, ["J1", "J2"]);

  // Toutes les mesures du premier lot sont FIGÉES ici : le test du régulateur,
  // plus bas, relance des requêtes et fausserait des compteurs relus à la fin.
  const openaiApres1 = journal.openai.length;
  const geminiApres1 = journal.gemini.length;
  const enVolMaxApres1 = enVolMax;
  const styleLuApres1 = journal.styleLu;
  const styleDansPrompt = journal.openai.every(o => o.corps.prompt.includes("peinture à l'huile dorée"));
  const premiereRequete = journal.openai[0].corps;
  const premierLotGemini = JSON.parse(journal.gemini[0].contents[0].parts[0].text).length;

  // Une deuxième demande sur le MÊME butin ne doit rien relancer.
  await window.lancerIllustrationButin(partie.Butin, ["J1", "J2"]);
  const openaiApresRelance = journal.openai.length;

  const apresTout = window.avancementImagesButin(partie.Butin, ["J1", "J2"]);

  // Prompts hors ligne : mise en scène de l'arme et de l'armure.
  const promptArme = window.promptImageObjet(arme, "Une lame usée.", "STYLE_BDD");
  const promptArmure = window.promptImageObjet(armure, "Des mailles ternies.", "STYLE_BDD");

  // LE RÉGULATEUR DE DÉBIT. Trois créneaux de la minute en cours sont déjà
  // consommés par le butin ci-dessus. On abaisse le plafond à cinq : sur cinq
  // nouveaux dessins demandés d'un coup, exactement DEUX doivent partir tout de
  // suite, les trois autres attendant la minute suivante.
  window.LIMITE_IMAGES_PAR_MINUTE = 5;
  const petits = Array.from({ length: 5 }, (_, i) => ({ uid: "p" + i, nom: "Dague", emplacement: "Main_Droite", rarete: "Commun" }));
  window.illustrerLesObjets(petits, async () => {}).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  const lancesMalgreLePlafond = journal.openai.length - openaiApresRelance;

  return {
    avantTout, apresTout, aIllustrer,
    enVolMax: enVolMaxApres1,
    openaiApres1,
    openaiApresRelance,
    styleLu: styleLuApres1,
    requetesGemini: geminiApres1,
    temperature: journal.gemini[0] && journal.gemini[0].generationConfig.temperature,
    lotDecritEnUneFois: premierLotGemini,
    taille: premiereRequete.size,
    modele: premiereRequete.model,
    styleDansPrompt,
    promptArme, promptArmure,
    imagesEnBase: {
      J1: partie.Butin.parPersonnage.J1.items.map(i => !!i.image),
      J2: partie.Butin.parPersonnage.J2.items.map(i => !!i.image)
    },
    equipementRattrape: journal.ecrituresPerso,
    rafraichissements,
    lancesMalgreLePlafond
  };
}, SRC);

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. MIA_OBJETS DÉCRIT LE LOT");
verifier("les trois objets sans image sont repérés",
         res.aIllustrer.join(",") === "o1,o2,o3", `(${res.aIllustrer.join(",")})`);
verifier("une SEULE requête pour tout le lot", res.requetesGemini === 1, `(${res.requetesGemini})`);
verifier("les trois objets y sont décrits ensemble", res.lotDecritEnUneFois === 3, `(${res.lotDecritEnUneFois})`);
verifier("la température est tirée au hasard entre 0.80 et 1.20",
         res.temperature >= 0.80 && res.temperature <= 1.20, `(${res.temperature})`);

console.log("\n2. LE PROMPT ENVOYÉ AU DESSINATEUR");
verifier("l'arme est posée à même le sol", /posé à même le sol/.test(res.promptArme));
verifier("l'armure est dépliée et étalée au sol", /dépliée et étalée/.test(res.promptArmure));
verifier("et surtout : personne dedans",
         /aucun corps/.test(res.promptArmure) && /aucun mannequin/.test(res.promptArmure));
verifier("le style graphique de la partie est injecté",
         res.promptArme.includes("STYLE_BDD") && res.promptArmure.includes("STYLE_BDD"));
verifier("le cadrage carré est exigé", /Format strictement carré/.test(res.promptArme));
verifier("un seul objet, aucun texte dessiné",
         /Un seul objet/.test(res.promptArme) && /aucun texte/.test(res.promptArme));
verifier("le style n'est relu qu'une fois en base", res.styleLu === 1, `(${res.styleLu} lecture(s))`);
verifier("le style parvient à toutes les images générées", res.styleDansPrompt);

console.log("\n3. LE DESSIN");
verifier("format carré 1024x1024", res.taille === "1024x1024", `(${res.taille})`);
verifier("même modèle que les pions (gpt-image-2)", res.modele === "gpt-image-2", `(${res.modele})`);
verifier("les trois images sont demandées", res.openaiApres1 === 3, `(${res.openaiApres1})`);
verifier("elles partent en parallèle, pas à la queue leu leu",
         res.enVolMax > 1, `(${res.enVolMax} en vol au plus)`);
verifier("sans dépasser la limite de 5 simultanées",
         res.enVolMax <= 5, `(${res.enVolMax})`);
verifier("le quota par minute retient les dessins en trop",
         res.lancesMalgreLePlafond === 2,
         `(${res.lancesMalgreLePlafond} lancée(s) sur 5, plafond à 5 dont 3 déjà pris)`);

console.log("\n4. L'IMAGE REVIENT EN BASE");
verifier("aucun objet illustré au départ", res.avantTout.prets === 0 && res.avantTout.total === 3,
         `(${res.avantTout.prets}/${res.avantTout.total})`);
verifier("les trois le sont à l'arrivée", res.apresTout.prets === 3, `(${res.apresTout.prets}/${res.apresTout.total})`);
verifier("les objets de chaque héros ont leur image",
         res.imagesEnBase.J1.every(Boolean) && res.imagesEnBase.J2.every(Boolean),
         JSON.stringify(res.imagesEnBase));
verifier("la fouille est rafraîchie à chaque trouvaille",
         res.rafraichissements === 3, `(${res.rafraichissements})`);
verifier("un butin déjà illustré ne relance aucune requête",
         res.openaiApresRelance === res.openaiApres1, `(${res.openaiApresRelance} vs ${res.openaiApres1})`);

console.log("\n5. L'OBJET DÉJÀ ÉQUIPÉ N'EST PAS OUBLIÉ");
const rattrape = res.equipementRattrape.find(e => e.chemin === "Personnages/J2");
verifier("la hache portée par J2 reçoit l'image payée pour elle",
         !!rattrape && !!(rattrape.maj.Equip_Main_Droite || {}).image,
         rattrape ? JSON.stringify(rattrape.maj.Equip_Main_Droite) : "(aucune écriture)");
verifier("et J1, qui n'a rien équipé, n'est pas touché",
         !res.equipementRattrape.some(e => e.chemin === "Personnages/J1"));

await b.close();
console.log(echecs === 0 ? "\n✅ La chaîne image tient de bout en bout." : `\n❌ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
