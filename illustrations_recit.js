// =========================================================================
//  IVALIS — MIA_ILLUSTRATEUR : LES CROQUIS DU RÉCIT (v314)
// =========================================================================
//  Nico : « un nouvel agent IA, qui se lance après que le Narrateur a écrit.
//  Il analyse les derniers posts des joueurs et le dernier post du Narrateur,
//  et cherche s'il y a une situation rigolote, dramatique, ou quelque chose de
//  marquant / attachant, pour en faire une petite illustration qui se dessine,
//  de taille aléatoire, dans le livre à la suite du paragraphe en cours. Les
//  mêmes paramètres de qualité que les tokens ; les images des personnages et
//  leurs noms en référence, comme pour les avatars ; un croquis à la plume sur
//  fond violet, détouré comme les avatars. Une scène, ou un personnage en
//  particulier. S'il découvre un PNJ nommé qui n'existe pas dans la base, il
//  crée son image dans ce même style, l'affiche en pleine page sur la
//  prochaine page libre, et range son image dans la base. »
//
//  Le poste qui a fait parler le Narrateur l'appelle (ia_master.js) :
//    1. le texte (Gemini) : y a-t-il un moment à dessiner ? lequel ? quels
//       héros, quels PNJ nommés y apparaissent ?
//    2. l'image (gpt-image, qualité « low » comme les pions) : un croquis à
//       l'encre sur fond magenta, les portraits des héros (et des PNJ connus)
//       en références ; puis le détourage et le dépôt (televerserImageDetouree) ;
//    3. le message du Narrateur reçoit son Illustration (url, proportions,
//       taille au hasard) : le livre la pose après ses paragraphes
//       (grimoire_recit.js) ;
//    4. les PNJ nommés sans portrait : leur croquis en pied, rangé dans leur
//       fiche (Monde_PNJ, créée s'il le faut), et posé en pleine page
//       (Portraits_PNJ du message).
//  Pas à chaque réponse : seulement quand l'IA trouve un vrai moment, et au
//  plus une illustration toutes les deux réponses du Narrateur.
//
//  v315 (Nico : « l'IA n'a pas reçu le design de mes personnages, elle a créé
//  trois personnages inconnus ; utilise le même procédé que pour l'image de
//  référence de l'avatar quand il change d'habit ; l'image est pixelisée ; pas
//  forcément de fond, on ne dessine que ce qui est strictement important ») :
//    · les héros se lisent dans les DEUX listes de la partie (la liste des
//      joueurs pouvait être vide : aucun héros, aucune référence) ; ceux du
//      croquis sont ceux que l'agent nomme, plus ceux dont le prénom est écrit
//      dans sa description ; s'il parle du groupe sans les nommer, ceux que le
//      Narrateur cite ;
//    · comme pour l'avatar rhabillé (objets_ia.js, dessinerAvatarHabille) :
//      chaque portrait de référence (urlPortraitReference, sinon l'avatar),
//      mis en PNG carré sur le magenta (imageVersBlobPng), joint en image[] à
//      /v1/images/edits, dans l'ordre annoncé par le texte, qualité
//      « medium » ; un héros dont le portrait ne se lit pas : pas de croquis
//      (plutôt rien que trois inconnus) ; un héros qui n'a encore aucun
//      portrait : décrit en mots (genre, race, classe) ;
//    · qualité « medium » (au lieu de « low ») et dépôt en q_auto:best ;
//    · le croquis ne montre que l'essentiel : les personnages, et un décor
//      seulement s'il sert ce qu'on raconte.
//
//  v346 (Nico : « les images vont se mettre en pleine double page, en dégradé
//  comme les fonds des classes et des races ; il faut le personnage, et on fait
//  le décor derrière ; on garde le côté cinématographique » ; « reprends le style
//  graphique de la base, celui de la création des avatars » ; « un lieu seul sans
//  personnage si besoin » ; « pour les nouveaux PNJ, le même procédé que l'avatar
//  des personnages joueurs, en pleine page de droite ») :
//    · plus de croquis à l'encre : une illustration de concept art en 16:9, les
//      personnages sur la moitié droite, la moitié gauche calme (le texte du
//      carnet s'y écrit) ; le style est celui de Cerveau_IA/INST_76839 ;
//    · déposée telle quelle (pas de détourage) ; le livre la pose sur une double
//      page (grimoire_recit.js) ;
//    · le portrait d'un PNJ nouveau : ia_master.js (portraitPnjFaconAvatar).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, updateDoc, setDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const R = window.REGLAGES_ILLUSTRATIONS = window.REGLAGES_ILLUSTRATIONS || {
    actif: true,
    ecart: 2,                 // au plus une illustration toutes les N réponses du Narrateur
    qualite: "medium",        // v315 : « low » donnait un trait pixelisé (l'avatar rhabillé : medium)
    portraitsMax: 2,          // portraits pleine page par réponse, au plus
    forcerApres: 3            // (v326) 3 réponses du Narrateur sans croquis : un gros plan d'un héros, d'office
};
if (R.forcerApres === undefined) R.forcerApres = 3;

const lireCles = () => (typeof window.clesApiIvalis === "function" ? window.clesApiIvalis() : {});
const aLesCles = () => { const c = lireCles(); return !!(c.openai && c.cloudName && c.cloudKey && c.cloudSecret) && typeof window.fetchGemini === "function"; };
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// v323 : un nom se reconnaît à ses mots. Le héros « A- Fargus » est « Fargus »
// dans le récit : comparer le premier mot (« a- » contre « fargus ») le perdait,
// aucune image de référence ne partait, et le dessinateur inventait des gens.
const MOTS_VIDES = new Set(["the", "and", "les", "des", "une", "von", "van", "del", "der", "grand", "grande", "petit", "old", "young", "dark", "sir", "dame",
    "maitre", "seigneur", "capitaine", "pretre", "pretresse", "sage", "vieux", "vieille", "pere", "mere", "frere", "soeur", "messire", "sire", "le", "la"]);
const motsDuNom = (t) => sansAccent(t).replace(/[^a-z0-9]+/g, " ").split(" ").filter(m => m.length >= 3 && !MOTS_VIDES.has(m));
const memeNom = (a, b) => {
    const x = sansAccent(a), y = sansAccent(b);
    if (!x || !y) return false;
    if (x === y) return true;
    // (v330) Le premier mot seulement s'il n'est pas un titre (« Grand Prêtre Orsin » ≠ « Grand Maître Varos »).
    const px = x.split(/\s+/)[0], py = y.split(/\s+/)[0];
    if (px === py && !MOTS_VIDES.has(px.replace(/[^a-z0-9]/g, ""))) return true;
    if (typeof window.memeNomPNJIvalis === "function" && window.memeNomPNJIvalis(a, b)) return true;   // (les titres : maître, seigneur…)
    const mx = motsDuNom(a), my = new Set(motsDuNom(b));
    return mx.some(m => my.has(m));
};
// (v315 : les deux listes, réunies — PERSOS_JOUEURS_PARTIE peut être un tableau vide.)
function herosDeLaPartie() {
    const vus = new Set();
    return [...(window.PERSOS_JOUEURS_PARTIE || []), ...(window.PERSOS_PARTIE || [])].filter(p => {
        if (!p || p.estIllusion || p.estMonstre || (p.camp && p.camp !== "Allié") || !p.prenom) return false;
        const cle = p.idPersonnage || p.prenom;
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
    });
}
// Le prénom écrit dans un texte, en mot entier (sans accents ni casse).
const nommeDans = (texte, prenom) => {
    const t = " " + sansAccent(texte).replace(/[^a-z0-9]+/g, " ") + " ";
    const n = sansAccent(prenom).replace(/[^a-z0-9]+/g, " ").trim();
    if (!n) return false;
    if (t.includes(" " + n + " ")) return true;
    return motsDuNom(prenom).some(m => t.includes(" " + m + " "));      // (v323) « Fargus » pour « A- Fargus »
};
// LES HÉROS DU CROQUIS : ceux que l'agent nomme, ceux que sa description
// nomme ; s'il parle d'eux sans les nommer (« the heroes », « the group »…),
// ceux que le Narrateur cite.
function herosDuCroquis(avis, texteMJ) {
    const tous = herosDeLaPartie();
    const choisis = tous.filter(h => (avis.heros || []).some(n => memeNom(h.prenom, n)) || nommeDans(avis.description || "", h.prenom));
    if (!choisis.length && /\b(heroes|hero|heroine|adventurers?|companions?|party|group|travell?ers?|friends)\b/i.test(avis.description || "")) {
        return tous.filter(h => nommeDans(texteMJ || "", h.prenom)).slice(0, 4);
    }
    return choisis.slice(0, 4);
}
// LES ACTEURS DU CROQUIS (v323) : la mise en scène de l'agent, figure par
// figure, chaque héros relié à sa fiche (son identifiant H1…, sinon son nom).
// Un héros qu'on ne retrouve pas : `perdus` (le croquis ne part pas : plutôt
// rien qu'un inconnu à sa place).
function acteursDuCroquis(avis, texteMJ) {
    const tous = herosDeLaPartie();
    const liste = Array.isArray(avis.acteurs) ? avis.acteurs.filter(a => a && (a.nom || a.id)) : [];
    const res = { heros: [], pnj: [], autres: [], perdus: [], scene: {} };
    const enScene = (a) => [a.place, a.action, a.expression].map(x => String(x || "").trim()).filter(Boolean).join("; ");
    if (!liste.length) {
        res.heros = herosDuCroquis(avis, texteMJ);
        res.pnj = (avis.pnj_dans_le_croquis || []).filter(Boolean).map(String);
        res.autres = (Array.isArray(avis.autres) ? avis.autres : []).filter(Boolean).map(String).slice(0, 4);
        return res;
    }
    liste.slice(0, 6).forEach(a => {
        const id = String(a.id || "").trim().toUpperCase(), nom = String(a.nom || "").trim();
        const type = String(a.type || "").toLowerCase();
        const parId = /^H\d+$/.test(id) ? tous[Number(id.slice(1)) - 1] : null;
        const h = parId || (type !== "pnj" && type !== "autre" ? tous.find(x => memeNom(x.prenom, nom)) : null);
        if (h) { if (!res.heros.includes(h)) { res.heros.push(h); res.scene[h.prenom] = enScene(a); } return; }
        if (type === "heros" || /^H\d+$/.test(id)) { res.perdus.push(nom || id); return; }
        if (type === "pnj") { res.pnj.push(nom); res.scene[nom] = enScene(a); return; }
        res.autres.push(nom + (enScene(a) ? ` (${enScene(a)})` : ""));
    });
    return res;
}
window.acteursDuCroquisIllustrateur = acteursDuCroquis;   // (pour les bancs)
// LE GROS PLAN FORCÉ (v326) : un héros de la partie qui a son portrait — de
// préférence un que le Narrateur vient de citer —, en gros plan, saisi dans ce
// moment (la phrase du récit qui parle de lui part avec).
function grosPlanForce(texteMJ) {
    const tous = herosDeLaPartie();
    const avecImage = tous.filter(h => h.urlPortraitReference || h.urlCloudinary);
    const cites = avecImage.filter(h => nommeDans(texteMJ || "", h.prenom));
    const choix = cites.length ? cites : avecImage;
    if (!choix.length) return null;
    const h = choix[Math.floor(Math.random() * choix.length)];
    const phrases = String(texteMJ || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?…»])\s+/).filter(Boolean);
    const siennes = phrases.filter(ph => nommeDans(ph, h.prenom));
    const extrait = (siennes.length ? siennes.slice(-2) : phrases.slice(-1)).join(" ").slice(0, 500);
    return {
        illustrer: true, moment: "gros plan", sujet: "personnage", force: true,
        // (v346) Un plan moyen, le héros sur la moitié droite, le décor du moment derrière lui.
        description: `${h.prenom} at this very moment of the story, in the place where it happens: a strong, expressive face and body language reacting to what is happening.`,
        acteurs: [{ id: "H" + (tous.indexOf(h) + 1), nom: h.prenom, type: "heros", place: "right",
                    action: "medium shot, caught in the moment", expression: "the emotion of this moment of the story" }],
        mise_en_scene: "cinematic medium shot, the hero on the right half of the frame, three-quarter view, slightly low angle, strong rim light; the setting of the scene behind, calm and quiet on the left half",
        extrait, pnj_nommes: []
    };
}
window.grosPlanForceIllustrateur = grosPlanForce;   // (pour les bancs)
// (v367) Ce qu'un héros a en main : main droite, main gauche (une arme, un bouclier).
const armesDuHeros = (h) => [h && h.equipMainDroite, h && h.equipMainGauche].filter(o => o && o.nom)
    .map(o => ({ nom: String(o.nom), type: String(o.type || ""), image: String(o.image || "") }));
window.armesDuHerosIllustrateur = armesDuHeros;   // (pour les bancs)
const decrireHeros = (h) => [h.genre ? (/f/i.test(h.genre) ? "a woman" : "a man") : "", h.race, h.classe].filter(Boolean).join(", ");
window.herosDuCroquisIllustrateur = herosDuCroquis;   // (pour les bancs)
// Le chroniqueur (le « je » du Narrateur) n'est jamais dessiné : ses phrases
// sortent de la description (v318).
function sansLeNarrateur(description) {
    const lui = /\b(narrator|chronicler|storyteller|journal[- ]writer|the writer|I|me|my|myself|we|us|our|ourselves)\b/i;
    const phrases = String(description || "").split(/(?<=[.!?])\s+/).filter(Boolean);
    const garde = phrases.filter(ph => !lui.test(ph));
    if (garde.length) return garde.join(" ").trim();
    // Tout parlait de lui : on garde la phrase, sans lui (« the narrator holds a
    // torch behind Kaya » → « Kaya »… le reste de la scène suffit au dessin).
    return phrases.map(ph => ph.replace(/\b(the )?(narrator|chronicler|storyteller)( of the journal)?\b[^,;.]*?\b(behind|beside|next to|near|with|watching|while)\b/gi, "")
        .replace(/\b(the )?(narrator|chronicler|storyteller)\b/gi, "").replace(/\b(I|me|my|we|us|our)\b/gi, "").replace(/\s{2,}/g, " ").trim())
        .filter(Boolean).join(" ");
}
window.sansLeNarrateurBanc = sansLeNarrateur;

// LA CADENCE : les réponses du Narrateur depuis la dernière illustration (par partie).
const cleCadence = () => "ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || "");
const ecrireEcart = (n) => { try { localStorage.setItem(cleCadence(), String(n)); } catch (e) {} };

// ---------------------------------------------------------------------
//  1. LE REGARD : Y A-T-IL UN MOMENT À DESSINER ?
// ---------------------------------------------------------------------
const PROMPT_AGENT = `Tu es MIA_ILLUSTRATEUR, l'illustrateur du carnet de voyage d'un groupe d'aventuriers (jeu de rôle, Antiquité fantastique). Après chaque réponse du Narrateur, tu lis les dernières actions des joueurs et cette réponse, et tu décides s'il y a UN moment qui mérite une illustration cinématographique en double page dans le carnet.

QUAND DESSINER : seulement un moment qui marque — drôle (une maladresse, une réplique, une situation absurde), dramatique (un danger, une perte, un affrontement, une révélation), ou attachant (un geste tendre, une rencontre, un instant de camaraderie), ou un lieu saisissant. Une réponse banale (on marche, on parle de la route, on achète du pain) : NE DESSINE PAS. Dans le doute, ne dessine pas.

LE MOMENT PRÉCIS (v325) : pas un résumé de la réponse — UN instant, le plus fort, figé comme une photo : celui où tout bascule (le pied qui heurte la jambière du héros camouflé, la lame qui sort du fourreau, le regard qui croise un autre). Reste FIDÈLE au texte : qui fait quoi à qui, avec quoi ; qui est caché, camouflé, couché, debout ; qui voit qui. Un héros caché ou déguisé se dessine caché ou déguisé. Recopie dans "extrait" la ou les phrases exactes du texte qui racontent cet instant (en français, 1 à 3 phrases).

QUOI DESSINER : soit une SCÈNE (les personnages en action), soit UN PERSONNAGE en particulier (un héros, un PNJ) — toujours DANS LE DÉCOR du moment, derrière eux (le lieu où la scène se passe, tel que le texte le décrit) ; soit, seulement si le moment n'a personne à montrer, UN LIEU saisissant seul, sans aucun personnage ("sujet": "lieu"). L'illustration est une image de cinéma, en paysage 16:9 : les personnages TOUJOURS sur la MOITIÉ DROITE de l'image ; la moitié gauche reste un décor sobre, calme et peu détaillé (le texte du carnet s'y écrira). Décris concrètement ce que montre l'image, en anglais, en une ou deux phrases (qui, quoi, l'attitude, le décor) — pas d'abstraction, pas de texte dans l'image.

LE NARRATEUR N'APPARAÎT JAMAIS : la réponse est écrite à la première personne par le chroniqueur du groupe (le « je », le « nous »). Ce chroniqueur ne se dessine JAMAIS : ne le décris pas, ne le compte pas, n'écris jamais « the narrator », « I », « me », « we » ni « us » dans la description. « Nous » ne désigne que les héros présents.

PERSONNE D'AUTRE : le croquis ne montre QUE les héros que tu cites, les PNJ que tu cites et, seulement s'ils sont indispensables et décrits dans la réponse, des êtres sans nom (« a wolf », « two guards ») que tu listes dans "autres". Aucun figurant, aucune foule, aucun témoin, aucune silhouette au loin. Indique le nombre total de personnages et de créatures dessinés dans "nombre".

LES HÉROS : cite TOUS ceux qui apparaissent DANS le croquis (leur prénom exact, dans la liste fournie), et dans la description, désigne chacun par son prénom exact (jamais « a warrior », « the adventurers » : « Kaya », « Thorin »). N'ajoute AUCUN personnage anonyme qui ne serait pas dans la réponse du Narrateur.

LA MISE EN SCÈNE : chaque héros de la liste a un identifiant (H1, H2…). Dans "acteurs", liste CHAQUE figure du croquis, une par une, dans l'ordre de gauche à droite : un héros par son identifiant ("id": "H1") et son prénom, un PNJ par son nom ("type": "pnj"), un être sans nom par ce qu'il est ("type": "autre", "nom": "a wolf"). Pour chacune, en anglais : "place" (toujours dans la moitié droite : center-right, right, far right, foreground right, background right), "action" (ce qu'elle fait, sa posture : debout, accroupie, en mouvement, assise…), "expression" (son visage, son émotion). Puis "mise_en_scene", en anglais, comme un directeur artistique de cinéma : le cadrage et l'angle (plan large, plan moyen, contre-plongée, par-dessus l'épaule…), le point focal (où l'œil va d'abord), qui est au premier plan et qui au fond, comment les figures se tiennent l'une par rapport à l'autre, l'objet clé, le décor derrière elles, et la lumière qui donne de la force à l'image (contre-jour, lumière qui accroche les contours…). Une image lisible d'un coup d'œil. Le dessinateur reçoit le portrait de chaque héros et de chaque PNJ connu : il dessine la scène telle que tu la mets en scène.
LES PNJ NOMMÉS : liste les personnages non-joueurs PRÉSENTS dans la scène (v330 : physiquement là, que les héros voient ou à qui ils parlent ; mets "present": true) et désignés par un VRAI nom propre dans la réponse du Narrateur — jamais un nom lu sur un parchemin, une lettre, un sceau ou une inscription, ni entendu dans une rumeur ou un souvenir (alors "present": false) ; un personnage déjà connu sous un autre titre (« Maître Valerius » pour « Valerius ») garde son nom connu (pas les héros, pas « l'aubergiste », pas un nom inventé par un héros pour bluffer), avec leur race (parmi celles du monde, Humain par défaut) et une description physique précise tirée du texte (ou plausible). Indique aussi ceux qui apparaissent dans le croquis.

Réponds UNIQUEMENT en JSON :
{"illustrer": true, "moment": "drôle|dramatique|attachant|lieu", "sujet": "scene|personnage|lieu", "description": "...", "acteurs": [{"id": "H1", "nom": "Kaya", "type": "heros", "place": "center-right", "action": "crouching behind a fallen trunk, one hand raised to stop the others", "expression": "tense, eyes wide"}, {"nom": "Varos", "type": "pnj", "place": "right", "action": "...", "expression": "..."}], "mise_en_scene": "medium shot, slightly low angle; Kaya in the foreground right turned toward Varos, the tavern behind them…", "extrait": "Varos éclate de rire quand Kaya glisse sur l'amphore.", "heros": ["Kaya"], "pnj_dans_le_croquis": ["Varos"], "autres": [], "nombre": 2, "pnj_nommes": [{"nom": "Varos", "present": true, "race": "Humain", "description_physique": "..."}]}
ou {"illustrer": false, "pnj_nommes": [...]}`;

async function demanderAgent(texteJoueurs, texteMJ) {
    const heros = herosDeLaPartie().map((h, i) => `H${i + 1} = ${h.prenom}${h.genre ? ` (${/f/i.test(h.genre) ? "femme" : "homme"})` : ""}${h.race ? ", " + h.race : ""}${h.classe ? ", " + h.classe : ""}`).join(" ; ");
    const corps = JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT_AGENT }] },
        contents: [{ role: "user", parts: [{ text: `--- LES HÉROS ---\n${heros || "(aucun)"}\n\n--- LES DERNIERS MESSAGES DES JOUEURS ---\n${texteJoueurs || "(rien)"}\n\n--- LA RÉPONSE DU NARRATEUR ---\n${texteMJ}` }] }],
        generationConfig: { temperature: 0.5, responseMimeType: "application/json" }
    });
    const rep = await window.fetchGemini("illustrateur", corps);
    if (!rep || !rep.ok) throw new Error("MIA_ILLUSTRATEUR : HTTP " + (rep && rep.status));
    const j = await rep.json();
    const texte = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("") || "";
    const debut = texte.indexOf("{"), fin = texte.lastIndexOf("}");
    return JSON.parse(debut >= 0 ? texte.slice(debut, fin + 1) : "{}");
}

// ---------------------------------------------------------------------
//  2. L'ILLUSTRATION : gpt-image, un concept art en 16:9 (v346)
// ---------------------------------------------------------------------
// v346 — Nico : « les images vont se mettre en pleine double page ; il faut le
// personnage, et on fait le décor derrière ; on garde le côté cinématographique » ;
// la composition, la zone de texte, la qualité et les contraintes sont les siennes ;
// le style, celui de la base (Cerveau_IA/INST_76839, la création des avatars) — le
// sien en secours si la base ne répond pas.
const STYLE_SECOURS = "Bande dessinée européenne moderne et esthétique d'animation 2D haut de gamme (type Fortiche ou Studio Mir), concept art stylisé dans un univers d'Antiquité fantastique. "
    + "TRAIT : lignes nettes, tranchantes et assurées avec des épaisseurs variées ; contours encrés sombres et marqués pour les sujets au premier plan. "
    + "RENDU ET OMBRAGE : cel-shading sophistiqué combiné à de douces transitions en dégradé ; ombres nettes, géométriques et stylisées ; aplats de couleurs denses et lisses sans bruit visuel. "
    + "ÉCLAIRAGE : éclairage cinématographique très contrasté, fort rim lighting, lumière ambiante diffuse ; séparation très distincte et lisible des plans de profondeur grâce aux valeurs lumineuses. "
    + "FORMES ET DESIGN : réalisme stylisé, proportions anatomiques crédibles et traits du visage très expressifs ; géométrie anguleuse et tranchante dans la découpe des vêtements, des armures, des accessoires et des plis de tissu.";
function consigneIllustration(style, lieu) {
    const compo = lieu
        ? "COMPOSITION ET CADRAGE :\nImage horizontale, format paysage 16:9.\nAucun personnage : le lieu lui-même. Son élément principal est placé sur la moitié droite de l'image, en laissant une large zone libre sur la moitié gauche.\n"
        : "COMPOSITION ET CADRAGE :\nImage horizontale, format paysage 16:9.\n"
          + "Le ou les personnages principaux doivent être positionnés exclusivement sur la moitié droite de l'image, en laissant une large zone libre sur la moitié gauche.\n"
          + "Les personnages peuvent être représentés dans différentes postures naturelles et dynamiques : debout, accroupis, en mouvement, assis ou dans une mise en scène particulière.\n"
          + "Si plusieurs personnages sont présents, les disposer harmonieusement sur la partie droite, sans qu'ils se chevauchent excessivement.\n"
          + "Les personnages doivent être suffisamment grands et détaillés pour être clairement identifiables.\n"
          + "Le décor du moment se tient derrière eux.\n";
    return "Créer une illustration de concept art dans un univers d'Antiquité fantastique (Mythic Ancient Fantasy : Antiquité gréco-romaine et magie — bronze, cuir et lin, casques à cimier, chitons et capes ; jamais d'armure de plates médiévale, jamais d'arbalète ni d'arme à feu).\n\n"
        + compo
        + "Conserver une marge de sécurité sur les quatre côtés de l'image. Aucun élément important ne doit être coupé par les bords.\n\n"
        + "ZONE DE TEXTE :\nLa moitié gauche de l'image doit rester largement dégagée, avec un arrière-plan sobre, peu détaillé et visuellement calme.\n"
        + "Cette zone est destinée à accueillir ultérieurement du texte descriptif.\n"
        + "Éviter les éléments visuels trop contrastés ou complexes dans cette partie. Le décor peut légèrement se prolonger derrière " + (lieu ? "l'élément principal" : "les personnages") + ", mais doit rester discret à gauche.\n\n"
        + "STYLE ARTISTIQUE (directives obligatoires) :\n" + (String(style || "").trim() || STYLE_SECOURS) + "\n\n"
        + "QUALITÉ :\nIllustration de concept art professionnelle, finition soignée, silhouettes lisibles, détails maîtrisés et cohérence visuelle entre " + (lieu ? "les éléments du lieu" : "les personnages et leur environnement") + ".\n\n"
        + "CONTRAINTES :\n"
        + (lieu ? "- Respecter la composition avec l'élément principal à droite.\n" : "- Respecter la composition avec les personnages à droite.\n")
        + "- Conserver une grande zone libre à gauche.\n- Aucun texte, titre, logo ou inscription.\n- Aucun élément important coupé par les bords.\n"
        + "- Conserver une marge périphérique.\n- Format paysage 16:9.\n- Ne pas utiliser de rendu photoréaliste ou de photographie.\n- Conserver une esthétique d'animation 2D haut de gamme.\n\n";
}
window.consigneIllustrationRecit = consigneIllustration;   // (pour les bancs)

// 16:9 pour gpt-image-2 (la taille des bâtiments, ia_master.js) ; les modèles de
// secours n'ont que le 3:2. Le livre cadre l'image sur la double page.
const TAILLES = { "gpt-image-2": "1792x1024" };
const ratioDe = (taille) => { const [w, h] = taille.split("x").map(Number); return +(w / h).toFixed(4); };

async function dessiner(prompt, references, sujet, options) {
    const o = options || {};
    const cles = lireCles();
    // LES RÉFÉRENCES, comme l'avatar rhabillé : le portrait mis en PNG carré sur
    // le blanc (v325 ; imageVersBlobPng), joint dans l'ordre que le texte annonce.
    // (v367) Les personnages d'abord (4 au plus), puis les armes des héros (4 au plus).
    const blobs = [];
    const refs = [...(references || []).filter(r => !r.arme), ...(references || []).filter(r => r.arme)];
    for (const r of refs) {
        if (!r.url || typeof window.imageVersBlobPng !== "function") continue;
        if (blobs.filter(b => !!b.arme === !!r.arme).length >= 4) continue;
        const b = await window.imageVersBlobPng(r.url, "#FFFFFF").catch(() => null);
        if (b) blobs.push({ ...r, blob: b });
        else console.warn(`[MIA_ILLUSTRATEUR] ${r.arme ? "L'image de l'arme" : "Le portrait"} de ${r.nom} est illisible (${r.url}).`);
    }
    // Des héros sans leur image : on ne dessine pas des inconnus à leur place.
    if (o.herosAttendus && blobs.filter(b => b.heros).length < o.herosAttendus) {
        throw new Error(`MIA_ILLUSTRATEUR : ${o.herosAttendus} héros attendus, ${blobs.filter(b => b.heros).length} référence(s) lisible(s) — pas d'illustration`);
    }
    console.log(`🖋️ [MIA_ILLUSTRATEUR] ${blobs.length} référence(s) jointe(s)${blobs.length ? " : " + blobs.map(b => b.nom).join(", ") : ""}.`);
    const persos = blobs.filter(b => !b.arme), armes = blobs.filter(b => b.arme);
    const refsTexte = (persos.length ? ` The first ${persos.length} attached reference image${persos.length > 1 ? "s show" : " shows"} the EXACT character${persos.length > 1 ? "s" : ""} to draw, in this order: `
        + persos.map((b, i) => `image ${i + 1} is ${b.nom}${b.qui ? " (" + b.qui + ")" : ""}${b.scene ? " — in the scene: " + b.scene : ""}`).join("; ")
        + ". Each of them must be clearly recognisable as the person in their reference image: same face, hairstyle, hair colour, beard or not, build, "
        + "age, clothing, colours and equipment — in the illustration's style. Do not copy the references' backgrounds or poses: "
        + "pose them as the staging says. "
        + "Do not add any other person than those named here and in the description." : "")
        // (v367, Nico : « rajouter les armes dans la génération des images du RP, donne
        // les armes en référence ») : l'arme de chaque héros, telle qu'en jeu.
        + (armes.length ? ` The next ${armes.length} reference image${armes.length > 1 ? "s are" : " is"} the heroes' WEAPONS, in this order: `
        + armes.map((b, i) => `image ${persos.length + i + 1} is ${b.nom}`).join("; ")
        + ". Each hero carries exactly their own weapon (same shape, materials and colours), held or worn naturally at the right hand-held scale; never draw a weapon as a separate object lying around, and never swap weapons between heroes." : "");
    const mise = (o.miseEnScene ? ` STAGING: ${o.miseEnScene}.` : "")
        + (o.extrait ? ` The moment, exactly as the journal tells it (French; its writer, the "je"/"nous", is never drawn): « ${o.extrait} ». Stay faithful to it: who does what to whom, who hides, who sees whom.` : "");
    const style = typeof window.instructionStyleIvalis === "function" ? await window.instructionStyleIvalis().catch(() => "") : "";
    const entete = consigneIllustration(style, sujet === "lieu");
    const texte = `${entete}THE ILLUSTRATION SHOWS: ${prompt}${refsTexte}${mise}`;
    console.log(`🖋️ [MIA_ILLUSTRATEUR] La consigne du dessinateur : ${texte.slice(entete.length).trim()}`);
    const modeles = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];
    const delais = [5000, 15000, 30000];
    let json = null, taille = "";
    for (const model of modeles) {
        taille = TAILLES[model] || "1536x1024";
        for (let essai = 0; essai < 3 && !json; essai++) {
            let statut = 0, rep = "";
            try {
                let r;
                if (blobs.length) {
                    const form = new FormData();
                    form.append("model", model);
                    form.append("prompt", texte);
                    blobs.forEach((b, i) => form.append("image[]", b.blob, `ref${i + 1}.png`));
                    form.append("n", "1"); form.append("size", TAILLES[model] || "1536x1024"); form.append("quality", R.qualite); form.append("output_format", "png");
                    if (model !== "gpt-image-2") form.append("input_fidelity", "high");
                    r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": "Bearer " + cles.openai }, body: form });
                } else {
                    r = await fetch("https://api.openai.com/v1/images/generations", {
                        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai },
                        body: JSON.stringify({ model, prompt: texte, n: 1, size: TAILLES[model] || "1536x1024", quality: R.qualite, output_format: "png", moderation: "low" })
                    });
                }
                statut = r.status; rep = await r.text();
            } catch (e) { rep = "error code: 1015"; }
            if (statut === 429 || rep.includes("error code: 1015") || rep.includes("Rate Limited")) { await new Promise(ok => setTimeout(ok, delais[essai])); continue; }
            if (statut === 404 || rep.includes("model_not_found") || rep.includes("does not support")) break;
            try { const j = JSON.parse(rep); if (j && j.data && j.data.length) json = j; } catch (e) {}
            break;
        }
        if (json) break;
    }
    if (!json) throw new Error("MIA_ILLUSTRATEUR : aucune image");
    const source = json.data[0].url || ("data:image/png;base64," + json.data[0].b64_json);
    // (v346) Une image pleine, avec son décor : déposée telle quelle.
    const url = typeof window.televerserImageDetoureeIvalis === "function"
        ? await window.televerserImageDetoureeIvalis(source, "Recit/Illustrations", cles, { fond: "aucun" }) : "";
    if (!url) throw new Error("MIA_ILLUSTRATEUR : dépôt impossible");
    return { url, ratio: ratioDe(taille), references: blobs.map(b => b.nom), consigne: texte.slice(entete.length).trim() };
}

// ---------------------------------------------------------------------
//  LES PNJ : ceux de la base, ceux qui manquent
// ---------------------------------------------------------------------
async function fichesPnj(noms, connus) {
    const trouves = {};
    // (ceux qui ont déjà leur portrait suffisent ; les autres, on cherche leur fiche pour la compléter)
    Object.values(connus || {}).forEach(p => { if (p && p.Nom_PNJ && p.URL_Cloudinary) noms.forEach(n => { if (memeNom(n, p.Nom_PNJ)) trouves[n] = { ...p }; }); });
    let restent = noms.filter(n => !trouves[n]);
    // (v330) « Maître Valerius » est Valerius : on le cherche par le cœur de son nom.
    if (restent.length && typeof window.pnjExistantIvalis === "function") {
        const vus = await Promise.all(restent.map(n => window.pnjExistantIvalis(n).catch(() => null)));
        vus.forEach((f, i) => { if (f) trouves[restent[i]] = { ...f }; });
        restent = restent.filter(n => !trouves[n]);
    }
    if (restent.length) {
        try {
            // (le nom exact ; les PNJ de la scène, eux, arrivent par `connus`)
            const snap = await getDocs(query(collection(db, "Monde_PNJ"), where("Nom_PNJ", "in", restent.slice(0, 10))));
            snap.forEach(d => { const x = d.data() || {}; restent.forEach(n => { if (memeNom(n, x.Nom_PNJ)) trouves[n] = { ...x, __id: d.id }; }); });
        } catch (e) { console.warn("[MIA_ILLUSTRATEUR] Lecture des PNJ :", e); }
    }
    return trouves;
}
// Un PNJ nommé sans portrait : son portrait, rangé dans sa fiche (créée s'il le faut).
// (v346) Le procédé de l'avatar des héros (ia_master.js : le style de la base, le
// fond magenta détouré, 1024 × 1792) ; le livre le pose en pleine page de droite.
async function portraitDuPnj(p, fiche) {
    const description = (fiche && fiche.Description_Physique) || p.description_physique || "";
    const race = (fiche && fiche.Race) || p.race || "Humain";
    const url = typeof window.portraitPnjFaconAvatar === "function" ? await window.portraitPnjFaconAvatar(description, race) : "";
    // (Un dépôt manqué rend l'image brute, en data: : elle ne va pas dans la fiche.)
    if (!url || String(url).startsWith("data:")) throw new Error("MIA_ILLUSTRATEUR : pas de portrait");
    const img = { url, ratio: ratioDe("1024x1792") };
    let id = fiche && fiche.__id;
    try {
        if (id) await updateDoc(doc(db, "Monde_PNJ", id), { URL_Cloudinary: img.url });
        else {
            id = `PNJ_${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}_${p.nom.replace(/[^a-zA-Z0-9]/g, "_")}`;
            await setDoc(doc(db, "Monde_PNJ", id), {
                Nom_PNJ: p.nom, Race: race, Description_Physique: description, URL_Cloudinary: img.url,
                Statut: "Vivant", Occupation: "", Secret_Mental: "", Style_De_Parole: "", ID_Lieu: "", ID_Batiment: "",
                Origine: "MIA_ILLUSTRATEUR", ID_Partie: window.ID_PARTIE_COURANTE || "", Cree_Le: Date.now()
            });
        }
    } catch (e) { console.error("[MIA_ILLUSTRATEUR] La fiche du PNJ :", e); }
    return { Nom: p.nom, Url: img.url, Ratio: img.ratio, Format: "avatar" };
}

// ---------------------------------------------------------------------
//  L'APPEL (ia_master.js, après la réponse du Narrateur)
// ---------------------------------------------------------------------
// `options` : { idMessage, texteMJ, texteJoueurs, pnjConnus }.
window.illustrerLeRecit = async function (options) {
    const o = options || {};
    if (!R.actif || !o.idMessage || !o.texteMJ || !aLesCles()) return null;
    // (v326) Les réponses du Narrateur sans croquis, comptées dans les messages de la
    // partie (ia_master.js) : le même compte sur tous les postes. Sinon, ce poste-ci.
    // (Sans compte enregistré sur ce poste : le croquis est permis, mais rien n'est
    // encore forcé — le premier passage compte pour un.)
    const brut = (() => { try { return localStorage.getItem(cleCadence()); } catch (e) { return null; } })();
    const partage = Number.isFinite(o.narrationsSansCroquis);
    const ecart = partage ? o.narrationsSansCroquis + 1 : (brut === null ? 99 : (Number(brut) || 0) + 1);
    const ecartForce = partage ? ecart : (brut === null ? 1 : (Number(brut) || 0) + 1);
    ecrireEcart(ecartForce);
    let avis;
    try { avis = await demanderAgent(o.texteJoueurs || "", o.texteMJ); }
    catch (e) { console.warn("[MIA_ILLUSTRATEUR]", e); avis = { illustrer: false, pnj_nommes: [] }; }
    avis = avis && typeof avis === "object" ? avis : { illustrer: false };
    const ref = doc(db, "Messages_Chat", o.idMessage);
    const resultat = { illustration: null, portraits: [] };

    // LES PNJ NOMMÉS SANS PORTRAIT : en pleine page (au plus deux).
    // (v330) Seulement ceux qui sont LÀ : un nom lu sur un parchemin ne fait pas de portrait.
    const nommes = (Array.isArray(avis.pnj_nommes) ? avis.pnj_nommes : []).filter(p => p && p.nom && p.present === true
        && !herosDeLaPartie().some(h => memeNom(h.prenom, p.nom)));
    const fiches = nommes.length ? await fichesPnj(nommes.map(p => p.nom), o.pnjConnus) : {};
    const sansPortrait = nommes.filter(p => !(fiches[p.nom] && fiches[p.nom].URL_Cloudinary)).slice(0, R.portraitsMax);
    const promessesPortraits = sansPortrait.map(p => portraitDuPnj(p, fiches[p.nom]).catch(e => { console.warn("[MIA_ILLUSTRATEUR] Portrait de " + p.nom, e); return null; }));

    // LE CROQUIS DU MOMENT.
    const croquer = async (a, force) => {
        // (v318) Le chroniqueur du carnet ne se dessine jamais : les phrases de la
        // description qui parlent de lui (ou d'un « I/me/we ») sont retirées.
        a.description = sansLeNarrateur(a.description);
        const refs = [];
        // (v346) Un lieu seul : personne dans l'image.
        const lieu = a.sujet === "lieu";
        const sujet = lieu ? "lieu" : a.sujet === "personnage" ? "personnage" : "scene";
        const acteurs = lieu ? { heros: [], pnj: [], autres: [], perdus: [], scene: {} } : acteursDuCroquis(a, o.texteMJ);
        // (v326) Un héros qu'on ne retrouve pas n'est pas dessiné — ni personne à sa
        // place ; les autres le sont (avant, tout le croquis tombait).
        if (acteurs.perdus.length) console.warn(`[MIA_ILLUSTRATEUR] Héros introuvable(s) dans la partie, laissé(s) hors du croquis : ${acteurs.perdus.join(", ")}.`);
        const heros = acteurs.heros;
        if (acteurs.perdus.length && !heros.length && !acteurs.pnj.length && !acteurs.autres.length) {
            console.warn("[MIA_ILLUSTRATEUR] Plus personne à dessiner : pas de croquis.");
            return null;
        }
        heros.forEach(h => refs.push({ nom: h.prenom, qui: decrireHeros(h), url: h.urlPortraitReference || h.urlCloudinary || "", heros: true, scene: acteurs.scene[h.prenom] || "" }));
        // (v367) Leurs armes : en image quand l'objet en a une, sinon en mots.
        const enMots = [];
        heros.forEach(h => armesDuHeros(h).forEach(o => {
            if (o.image) refs.push({ nom: `${h.prenom}'s weapon (${o.nom})`, url: o.image, arme: true });
            else enMots.push(`${h.prenom} carries ${o.nom}${o.type ? " (" + o.type + ")" : ""}.`);
        }));
        if (enMots.length) a.description += " " + enMots.join(" ");
        // (v367) Les ennemis du combat, s'ils sont dans l'image : comme sur leurs pions.
        const ennemis = typeof window.ennemisDecritsCombatRP === "function" ? window.ennemisDecritsCombatRP() : [];
        if (ennemis.length && !lieu) {
            const scene = [a.description, a.extrait, ...(acteurs.autres || [])].join(" ");
            let montres = ennemis.filter(x => x.noms.some(n => nommeDans(scene, n)));
            if (!montres.length && (acteurs.autres || []).length) montres = ennemis;
            if (montres.length) a.description += " The enemies in this scene look exactly like this (the same creatures as on the battle map tokens): "
                + montres.slice(0, 3).map(x => `${x.noms.length ? x.noms.join(", ") + ": " : ""}${String(x.description).slice(0, 700)}`).join(" | ");
        }
        // Les héros du croquis se nomment dans la description (le dessinateur
        // relie ainsi chaque prénom à son image).
        const manquants = heros.filter(h => !nommeDans(a.description, h.prenom)).map(h => h.prenom);
        if (manquants.length) a.description += ` (With ${manquants.join(" and ")}.)`;
        acteurs.pnj.forEach(n => { const f = Object.values(fiches).find(x => memeNom(x.Nom_PNJ, n)); if (f && f.URL_Cloudinary) refs.push({ nom: f.Nom_PNJ, qui: f.Race || "", url: f.URL_Cloudinary, scene: acteurs.scene[n] || "" }); });
        try {
            // (Un héros qui n'a encore aucun portrait se dit en mots ; celui dont le
            // portrait existe mais ne se lit pas arrête le croquis.)
            const sansImage = heros.filter(h => !(h.urlPortraitReference || h.urlCloudinary));
            if (sansImage.length) a.description += " " + sansImage.map(h => `${h.prenom} is ${decrireHeros(h) || "an adventurer"}.`).join(" ");
            // (v318) Qui est dessiné, et combien : personne d'autre.
            const noms = [...heros.map(h => h.prenom), ...acteurs.pnj];
            const autres = acteurs.autres.slice(0, 4);
            const nombre = noms.length + autres.length;
            const qui = nombre
                ? ` EXACTLY ${nombre} figure${nombre > 1 ? "s" : ""} in the whole drawing: ${[...noms, ...autres].join(", ")}. No other person or creature anywhere: no narrator, no chronicler, no onlooker, no crowd, no figure in the distance.`
                : " No person at all in the drawing: no narrator, no onlooker, no figure in the distance.";
            const miseEnScene = String(a.mise_en_scene || "").trim();
            const extrait = String(a.extrait || "").replace(/\s+/g, " ").trim().slice(0, 600);
            const img = await dessiner(a.description + qui, refs, sujet, { herosAttendus: heros.length - sansImage.length, miseEnScene, extrait });
            // (v346) Format « double-page » : le livre la pose en fond d'une double page.
            const illustration = { Url: img.url, Ratio: img.ratio, Format: "double-page", Moment: String(a.moment || ""), Sujet: sujet, Le: Date.now(),
                // (v323) Pour vérifier après coup : les portraits joints, la consigne envoyée.
                References: img.references || [], Consigne: String(img.consigne || "").slice(0, 1800), ...(force ? { Force: true } : {}) };
            await updateDoc(ref, { Illustration: illustration });
            ecrireEcart(0);
            console.log(`🖋️ [MIA_ILLUSTRATEUR] Un croquis${force ? " forcé (gros plan)" : ""} (${illustration.Moment}) : ${a.description}`);
            return illustration;
        } catch (e) { console.warn("[MIA_ILLUSTRATEUR] Le croquis :", e); return null; }
    };
    if (avis.illustrer && avis.description && ecart >= R.ecart) resultat.illustration = await croquer(avis, false);
    else console.log(`🖋️ [MIA_ILLUSTRATEUR] Pas de croquis cette fois (${!avis.illustrer ? "l'agent n'a pas vu de moment" : ecart < R.ecart ? "le dernier est trop récent" : "sans description"}) — ${ecartForce} réponse(s) du Narrateur sans croquis.`);
    // (v326) Nico : « s'il n'y a pas eu de dessin après 3 réponses du MJ, ça force le
    // dessin, sur un gros plan d'un des aventuriers ».
    if (!resultat.illustration && R.forcerApres > 0 && ecartForce >= R.forcerApres) {
        const gros = grosPlanForce(o.texteMJ);
        if (gros) resultat.illustration = await croquer(gros, true);
    }
    resultat.portraits = (await Promise.all(promessesPortraits)).filter(Boolean);
    if (resultat.portraits.length) {
        try { await updateDoc(ref, { Portraits_PNJ: resultat.portraits }); } catch (e) { console.error("[MIA_ILLUSTRATEUR] Les portraits :", e); }
        console.log(`🖋️ [MIA_ILLUSTRATEUR] ${resultat.portraits.length} portrait(s) en pleine page : ${resultat.portraits.map(p => p.Nom).join(", ")}`);
    }
    return resultat;
};
