// =========================================================================
//  IVALIS — LES MISSIONS (v442) — (v477) LE CRÉATEUR D'UNE MISSION ET LA MISSION EN COURS
// =========================================================================
//  (v477) LE CLAN NOMADE (CLAN_NOMADE.md, étape 1) : le Hall de guilde et son tableau des
//  missions disparaissent — plus de six missions renouvelées tous les 30 jours, plus de feuilles,
//  plus de vote d'acceptation, plus de décalage du niveau des créatures. Restent le créateur d'une
//  mission (MIA_MISSIONS, genererMission), son lancement (lancerMission : son lieu, son plan caché,
//  MIA_PLAN_MISSION), son suivi par le narrateur et sa fin : ils serviront aux tâches (étape 10).
//  Ce qui suit est l'histoire du tableau, gardée pour comprendre les champs de la base.
//  Nico : « nous allons pouvoir commencer la création de missions de guilde.
//  (v452 : plus de rangs — des missions normales ou difficiles, voir DIFFICULTES.)
//  Trois niveaux de difficulté : Rang C (le plus faible, des missions facilement
//  réalisables par un groupe de nouveaux joueurs : escorter un PNJ et le protéger,
//  enquêter…), Rang B (pour aventuriers accomplis, mieux préparés), Rang A (les
//  plus dures). Dans les encarts du panneau des missions, une mission générée par
//  une IA pour chaque encart ; si vide, ça se crée après avoir chargé la partie ;
//  les missions se renouvellent tous les 30 jours. » « Un tableau par partie ; des
//  jours en jeu ; les six missions, un peu plus de C, une seule A, deux au plus. »
//  « Le générateur peut utiliser les lieux existants. » « Quand les missions sont
//  remplacées, ça les remplace dans la base. »
//
//  LA BASE : Systeme_Parties/{partie}/Guilde/Tableau — { Missions: [6 missions ou
//  null, dans l'ordre des encarts], Jour_Absolu (le jour en jeu de leur arrivée :
//  an × 365 + jour), Genere_Le, Generation_En_Cours (l'heure où un poste a commencé
//  à les écrire : un verrou de 3 minutes) }. Une mission : { Id, Difficulte, Decalage, Titre,
//  Resume, Region, Region_Nom, Commanditaire, Details, Objectif, Lettre (le mot du
//  commanditaire, à la première personne), Lieu: { Id (un lieu existant) ou null,
//  Nom, Type, Description }, Ecriture (l'écriture de son encart) }.
//
//  LA FEUILLE : un toucher sur un encart fait glisser, du bas de l'écran, une page
//  de parchemin (la texture des pages du livre) avec le détail de la mission ; son
//  bas reste caché sous le bord de l'écran ; en bas, le sceau rouge « Accepter la
//  mission ». Un toucher en dehors la referme. Le bruit d'une page qu'on attrape.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, getDocs, collection, onSnapshot, runTransaction, setDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = (id) => { try { if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement(id); } catch (e) {} };
// (v452) Nico : « pour le panneau des missions, on enlève les Rang A, B et C. Sur le panneau, des missions
// normales ou difficiles (deux au plus). Les niveaux des monstres par rapport au niveau du groupe :
// normale −1 / 0 / +1, difficile +2 / +3 / +4 — tirés au hasard pour chaque mission ; les joueurs ne
// sauront pas le degré de difficulté. Pour les missions difficiles, l'image du sceau en petit sous le
// texte, sur le panneau et sur la feuille qui s'ouvre. » Une mission : Difficulte (« normale » ou
// « difficile ») et Decalage (caché : le niveau des créatures au lieu de la mission, par rapport au groupe).
export const DIFFICULTES = {
    normale: { nom: "normale", consigne: "des missions à la portée du groupe (escorter et protéger un PNJ, enquêter sur une disparition, retrouver un objet, chasser des bêtes, porter un message dangereux, démêler une petite intrigue…). Des combats mesurés, des adversaires à sa taille." },
    difficile: { nom: "difficile", consigne: "des missions dures, tant par leurs tâches que par leurs adversaires (un monstre redoutable, une bande organisée, une conspiration puissante, une expédition au cœur d'un lieu maudit). Des combats très dangereux, des choix lourds." }
};
export const IMAGE_SCEAU_DIFFICILE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795128379/IMG_2294_ghiayl.png";
// La difficulté d'une mission ; une mission d'avant v452 (un rang) : C normale, B et A difficiles.
export const difficulteDe = (m) => (m && (m.Difficulte === "difficile" || m.Difficulte === "normale") ? m.Difficulte : (m && m.Rang && m.Rang !== "C" ? "difficile" : "normale"));
// Les écritures à la main du mot du commanditaire (index.html : Google Fonts).
export const ECRITURES = ["Caveat", "Dancing Script", "Kalam", "Homemade Apple", "Indie Flower", "Satisfy"];

// ---------------------------------------------------------------------
//  LE TEMPS, LA PARTIE
// ---------------------------------------------------------------------
export const jourAbsolu = (d) => {
    const date = d || window.DATE_EN_JEU_ACTUELLE || {};
    const j = parseInt(date.jour, 10), a = parseInt(date.annee, 10);
    return (Number.isFinite(a) ? a : 0) * 365 + (Number.isFinite(j) ? j : 0);
};
const idPartie = () => window.ID_PARTIE_COURANTE || "";

// ---------------------------------------------------------------------
//  LE GÉNÉRATEUR (MIA_MISSIONS)
// ---------------------------------------------------------------------
function regionsConnues() {
    const cartes = window.CARTES_REGIONALES || {};
    return Object.keys(cartes).map(Number).filter(n => n > 0).sort((a, b) => a - b).map(n => {
        const c = cartes[n] || {};
        let lore = "";
        try { lore = typeof window.loreDeLaRegion === "function" ? String(window.loreDeLaRegion(n) || "") : ""; } catch (e) {}
        return { numero: n, nom: c.nom || `Région ${n}`, texte: (String(c.description || "") + " " + lore).replace(/\s+/g, " ").trim().slice(0, 600) };
    });
}
function lieuxConnus() {
    return Object.values(window.VILLAGES_REGIONAUX || {}).filter(v => v && v.id && v.nom)
        .map(v => ({ id: v.id, nom: v.nom, type: v.type || "Lieu", region: v.numero })).slice(0, 80);
}
export function promptMissions(difficultes, contexte) {
    const regions = contexte.regions.map(r => `- Région ${r.numero} « ${r.nom} » : ${r.texte || "(pas de description)"}`).join("\n");
    const lieux = contexte.lieux.length ? contexte.lieux.map(l => `- ${l.id} : ${l.nom} (${l.type}, région ${l.region})`).join("\n") : "(aucun lieu connu pour l'instant)";
    return `Tu es MIA_MISSIONS, le scribe d'Ivalis : tu rédiges les missions qu'un clan nomade d'aventuriers peut entendre et accepter.
Le monde : Ivalis, un monde antique fantastique (mythologie, Antiquité magique). Rien d'anachronique, rien de farfelu ; pas de technologie moderne.

LA DIFFICULTÉ :
- normale : ${DIFFICULTES.normale.consigne}
- difficile : ${DIFFICULTES.difficile.consigne}
N'écris jamais la difficulté, un rang ni un niveau dans les textes : on la devine seulement à la mission elle-même.

LES RÉGIONS (une mission se passe toujours dans l'une d'elles) :
${regions || "- Région 1"}

LES LIEUX QUI EXISTENT DÉJÀ (tu peux y placer une mission, en donnant son identifiant) :
${lieux}

Le groupe d'aventuriers est de niveau ${contexte.niveau}. Nous sommes le jour ${contexte.jour || "?"} du calendrier.

Écris EXACTEMENT ${difficultes.length} missions, toutes différentes (sujets, régions, commanditaires variés), dans cet ordre de difficultés : ${difficultes.join(", ")}.
Réponds UNIQUEMENT par un tableau JSON de ${difficultes.length} objets, chacun ainsi :
{
  "difficulte": "normale" | "difficile" (celle demandée à cette place),
  "titre": "un titre court et évocateur (6 mots au plus)",
  "resume": "une phrase très courte pour l'affiche (20 mots au plus)",
  "region": numéro de la région,
  "commanditaire": "qui confie la mission (nom et qualité)",
  "details": "le détail de la mission, ce que l'on sait (3 à 5 phrases)",
  "objectif": "l'objectif de la mission, clair et vérifiable (1 phrase)",
  "lettre": "le mot laissé par le commanditaire aux aventuriers, écrit à la première personne, avec sa voix (3 à 6 phrases)",
  "lieu": { "id_existant": "l'identifiant d'un lieu de la liste, ou null", "nom": "le nom du lieu de la mission", "type": "son type (ruine, grotte, camp, village, sanctuaire…)", "description": "à quoi il ressemble (2 phrases)" }
}`;
}
function nettoyerMission(m, difficulte, i, contexte, ecriture) {
    const regions = new Map(contexte.regions.map(r => [r.numero, r.nom]));
    const lieux = new Map(contexte.lieux.map(l => [l.id, l]));
    const texte = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
    let region = Number(m && m.region);
    if (!regions.has(region)) region = contexte.regions.length ? contexte.regions[i % contexte.regions.length].numero : 1;
    const l = (m && m.lieu) || {};
    const existant = l.id_existant && lieux.get(String(l.id_existant)) ? lieux.get(String(l.id_existant)) : null;
    if (existant) region = existant.region;
    return {
        Id: `M_${Date.now().toString(36)}_${i}_${Math.floor(Math.random() * 1e5).toString(36)}`,
        Difficulte: difficulte, Titre: texte(m && m.titre, 80) || "Une mission", Resume: texte(m && m.resume, 200),
        Region: region, Region_Nom: regions.get(region) || `Région ${region}`,
        Commanditaire: texte(m && m.commanditaire, 120), Details: texte(m && m.details, 1200), Objectif: texte(m && m.objectif, 300),
        Lettre: String((m && m.lettre) || "").trim().slice(0, 1500),
        Lieu: existant ? { Id: existant.id, Nom: existant.nom, Type: existant.type, Description: texte(l.description, 400) }
                       : { Id: null, Nom: texte(l.nom, 80) || "Un lieu sans nom", Type: texte(l.type, 40) || "Lieu", Description: texte(l.description, 400) },
        Ecriture: ecriture
    };
}
// (v477) `difficultes` : la difficulté de chaque mission voulue, dans l'ordre (« normale », « difficile »).
export async function genererMissions(difficultes) {
    if (typeof window.fetchGemini !== "function" || !window.cleGemini || !window.cleGemini("missions")) throw new Error("Aucune clé Gemini");
    const contexte = { regions: regionsConnues(), lieux: lieuxConnus(), niveau: window.NIVEAU_GROUPE || 1, jour: jourAbsolu() };
    const corps = JSON.stringify({
        systemInstruction: { parts: [{ text: promptMissions(difficultes, contexte) }] },
        contents: [{ role: "user", parts: [{ text: "Rédige les missions." }] }],
        generationConfig: { temperature: 1.0, responseMimeType: "application/json" }
    });
    const rep = await window.fetchGemini("missions", corps);
    const json = await rep.json();
    if (!rep.ok || json.error) throw new Error((json.error && json.error.message) || `Gemini ${rep.status}`);
    let liste = JSON.parse(json.candidates[0].content.parts[0].text);
    if (!Array.isArray(liste)) liste = Array.isArray(liste && liste.missions) ? liste.missions : [];
    if (liste.length < difficultes.length) throw new Error(`MIA_MISSIONS n'a rendu que ${liste.length} missions`);
    const ecritures = ECRITURES.slice().sort(() => Math.random() - 0.5);
    return difficultes.map((r, i) => nettoyerMission(liste[i], r, i, contexte, ecritures[i % ecritures.length]));
}
// Une seule mission, de cette difficulté.
export const genererMission = async (difficulte) => (await genererMissions([difficulte === "difficile" ? "difficile" : "normale"]))[0];

// (v452) Le sceau des missions difficiles, en petit sous le texte (la page de la mission).
export function htmlSceauDifficile(classe) {
    return `<img class="sceau-difficile ${classe || ""}" src="${IMAGE_SCEAU_DIFFICILE}" alt="Mission difficile" title="Mission difficile" draggable="false">`;
}
// (v445) Nico : « refais le dessin du sceau en bas de page : un sceau de cire réaliste ». La cire
// coulée, au bord irrégulier (deux petites coulures), bombée par la lumière (un éclairage spéculaire
// sur son épaisseur) et grenue ; au milieu, le creux du cachet, son biseau ; en relief dans le creux,
// « ACCEPTER · LA MISSION » en arc autour de deux épées croisées (ombre et reflet décalés).
const SCEAU_CIRE = `<svg class="dessin-sceau" viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <radialGradient id="sceau-cire" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="#e2574a"/><stop offset="0.35" stop-color="#b8261c"/><stop offset="0.75" stop-color="#7d110b"/><stop offset="1" stop-color="#4f0805"/></radialGradient>
    <radialGradient id="sceau-creux" cx="58%" cy="62%" r="70%"><stop offset="0" stop-color="#a51e15"/><stop offset="0.7" stop-color="#8a150e"/><stop offset="1" stop-color="#5f0b07"/></radialGradient>
    <linearGradient id="sceau-biseau" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="#3c0503"/><stop offset="0.5" stop-color="#7d120c"/><stop offset="1" stop-color="#f08a7c"/></linearGradient>
    <filter id="sceau-relief" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="flou"/>
      <feSpecularLighting in="flou" surfaceScale="6" specularConstant="0.85" specularExponent="24" lighting-color="#ffd9cc" result="eclat"><fePointLight x="55" y="35" z="150"/></feSpecularLighting>
      <feComposite in="eclat" in2="SourceAlpha" operator="in" result="eclatCire"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="11" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.02  0 0 0 0 0.01  0 0 0 0.22 0" result="grainTeinte"/>
      <feComposite in="grainTeinte" in2="SourceAlpha" operator="in" result="grainCire"/>
      <feComposite in="SourceGraphic" in2="eclatCire" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0" result="avecEclat"/>
      <feMerge><feMergeNode in="avecEclat"/><feMergeNode in="grainCire"/></feMerge>
    </filter>
    <path id="sceau-arc-haut" d="M 55.8 83.9 A 47 47 0 0 1 144.2 83.9"/>
    <path id="sceau-arc-bas" d="M 46.4 119.5 A 57 57 0 0 0 153.6 119.5"/>
    <g id="sceau-motif">
      <text class="lettres-sceau" font-size="16.5"><textPath href="#sceau-arc-haut" startOffset="50%" text-anchor="middle">ACCEPTER</textPath></text>
      <text class="lettres-sceau" font-size="14.5"><textPath href="#sceau-arc-bas" startOffset="50%" text-anchor="middle">LA MISSION</textPath></text>
      <circle cx="58" cy="100" r="2.2"/><circle cx="142" cy="100" r="2.2"/>
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 80 120 L 118 78" stroke-width="4.2"/><path d="M 118 78 L 123 73" stroke-width="2.4"/>
        <path d="M 120 120 L 82 78" stroke-width="4.2"/><path d="M 82 78 L 77 73" stroke-width="2.4"/>
        <path d="M 74 114 L 86 126 M 126 114 L 114 126" stroke-width="3.2"/>
        <path d="M 76 124 L 71 129 M 124 124 L 129 129" stroke-width="3.6"/>
      </g>
      <circle cx="69.5" cy="131.5" r="3.3"/><circle cx="130.5" cy="131.5" r="3.3"/>
    </g>
  </defs>
  <path class="cire-sceau" d="M 187.1 100.0 C 187.5 102.5 186.7 105.1 186.0 107.5 C 185.3 110.0 183.8 112.3 182.7 114.6 C 181.7 116.9 180.8 119.2 179.7 121.4 C 178.6 123.5 177.1 125.5 176.2 127.7 C 175.4 130.0 175.2 132.4 174.7 134.8 C 174.2 137.2 174.4 140.2 173.2 142.2 C 171.9 144.3 169.4 145.7 167.3 147.1 C 165.2 148.6 162.5 149.3 160.7 150.9 C 159.0 152.6 158.1 154.8 156.9 156.9 C 155.6 158.9 154.4 161.0 153.0 163.2 C 151.7 165.3 150.3 167.5 148.8 169.7 C 147.3 171.9 146.0 174.7 144.1 176.4 C 142.2 178.1 139.6 178.9 137.2 179.8 C 134.8 180.7 132.2 180.9 129.8 181.9 C 127.5 183.0 125.5 185.3 123.1 186.2 C 120.7 187.1 118.0 187.7 115.4 187.3 C 112.8 186.9 109.9 184.7 107.3 183.9 C 104.8 183.0 102.4 182.6 100.0 182.3 C 97.6 181.9 95.2 182.2 92.8 181.7 C 90.5 181.3 88.3 180.2 86.0 179.5 C 83.7 178.9 81.4 178.5 79.1 177.9 C 76.9 177.2 74.6 176.6 72.5 175.6 C 70.4 174.6 68.6 172.8 66.5 171.9 C 64.3 170.9 61.9 170.7 59.6 169.9 C 57.4 169.1 54.7 168.7 53.0 167.2 C 51.2 165.7 50.4 162.7 49.0 160.8 C 47.5 158.9 46.5 156.9 44.2 155.8 C 41.9 154.7 38.2 155.0 35.2 154.3 C 32.2 153.7 28.6 153.1 26.2 151.7 C 23.8 150.3 22.1 148.0 20.8 145.7 C 19.6 143.4 19.0 140.6 18.8 137.9 C 18.5 135.1 19.3 132.0 19.5 129.3 C 19.7 126.6 20.0 124.0 19.8 121.5 C 19.6 119.0 18.2 116.8 18.2 114.4 C 18.2 112.0 19.0 109.4 19.8 107.0 C 20.6 104.6 22.6 102.3 23.1 100.0 C 23.5 97.7 22.9 95.5 22.6 93.2 C 22.3 90.9 21.4 88.5 21.2 86.1 C 21.0 83.7 21.1 81.3 21.3 78.9 C 21.4 76.5 21.3 73.9 22.1 71.7 C 22.9 69.4 24.5 67.4 26.0 65.5 C 27.5 63.6 30.0 62.3 31.1 60.2 C 32.3 58.2 32.3 55.5 32.9 53.0 C 33.6 50.6 33.7 47.5 34.9 45.4 C 36.1 43.3 38.4 41.9 40.2 40.2 C 41.9 38.4 43.6 36.7 45.4 34.9 C 47.2 33.2 48.7 31.0 50.7 29.6 C 52.7 28.1 55.2 27.4 57.5 26.4 C 59.8 25.4 62.0 24.3 64.3 23.4 C 66.6 22.5 68.7 21.0 71.2 21.0 C 73.8 21.0 76.9 22.9 79.5 23.5 C 82.1 24.0 84.4 25.0 86.7 24.5 C 88.9 24.0 90.8 21.4 93.0 20.4 C 95.3 19.3 97.6 18.6 100.0 18.2 C 102.4 17.9 104.7 18.4 107.1 18.4 C 109.6 18.3 112.0 17.9 114.5 18.0 C 116.9 18.2 119.2 18.9 121.6 19.5 C 123.9 20.0 126.2 20.8 128.6 21.5 C 131.0 22.1 133.6 22.2 135.8 23.2 C 138.0 24.3 139.8 26.3 141.6 27.9 C 143.5 29.5 144.9 31.6 147.0 32.8 C 149.2 34.0 152.2 34.0 154.5 35.1 C 156.8 36.2 159.3 37.3 160.8 39.2 C 162.3 41.2 162.7 44.3 163.4 46.8 C 164.2 49.3 164.7 51.8 165.3 54.3 C 165.9 56.7 166.4 59.1 167.0 61.3 C 167.6 63.6 167.8 65.9 169.0 67.8 C 170.1 69.8 172.4 71.2 173.9 73.1 C 175.4 75.0 177.3 76.9 178.2 79.0 C 179.2 81.2 178.9 83.7 179.7 85.9 C 180.6 88.2 182.0 90.4 183.2 92.7 C 184.4 95.1 186.6 97.5 187.1 100.0 Z" fill="url(#sceau-cire)" filter="url(#sceau-relief)"/>
  <circle cx="100" cy="100" r="64" fill="url(#sceau-creux)"/>
  <circle cx="100" cy="100" r="64" fill="none" stroke="url(#sceau-biseau)" stroke-width="5"/>
  <circle cx="100" cy="100" r="61" fill="none" stroke="rgba(40, 3, 2, 0.35)" stroke-width="1.2"/>
  <use href="#sceau-motif" transform="translate(1 1.3)" style="color:#3a0402" fill="#3a0402"/>
  <use href="#sceau-motif" transform="translate(-0.8 -0.9)" style="color:#f6a89b" fill="#f6a89b" opacity="0.75"/>
  <use href="#sceau-motif" style="color:#a51d14" fill="#a51d14"/>
</svg>`;
// (v457) Le même cachet de cire, à d'autres mots (« QUÊTE · ACCOMPLIE », le récit et la page de la
// mission) : ses identifiants SVG préfixés, pour ne pas se mêler à ceux d'un autre sceau affiché.
export function sceauCire(haut, bas, prefixe) {
    return SCEAU_CIRE.replace(/sceau-(cire|creux|biseau|relief|arc-haut|arc-bas|motif)/g, `${prefixe}-$1`)
        .replace(">ACCEPTER<", `>${echapper(haut)}<`).replace(">LA MISSION<", `>${echapper(bas)}<`);
}
// =========================================================================
//  v443 — UNE MISSION LANCÉE : LE PLAN, LE LIEU, LE MJ — (v477) sans vote ni tableau : lancerMission
// =========================================================================
//  Nico : « oui vote : quand un joueur valide le choix d'une mission, c'est en attente des
//  autres, un post-it apparaît sur le livre des autres joueurs, avec le lien qui fait
//  apparaître la page de mission par le bas pour qu'ils puissent valider ; s'ils refusent,
//  le vote disparaît. Une mission à la fois. » « Quand une mission est validée, ça la place
//  dans un autre endroit de la base (celle du groupe), avec les tenants et aboutissants. Une
//  IA intelligente (comme le narrateur) crée tout le plan de mission. Sur la map régionale
//  où se passe la mission, un point d'interrogation doré : le lieu de la mission, créé comme
//  un POI. » « Le niveau des monstres : (v452) normale −1/0/+1, difficile +2/+3/+4 — juste au lieu
//  de la mission. » « C'est le narrateur qui valide ou fait échouer la mission. »
//
//  LA BASE :
//    · Systeme_Parties/{partie}.Mission_En_Cours — { Id, Titre, Difficulte, Lieu_Id, Region, Le } ;
//    · Systeme_Parties/{partie}/Guilde/Mission — { Mission, Statut, Accepte_Le, Jour_Accepte,
//      Votants, Heros, Lieu_Id, Lieu_Position: { Region, x, y }, Plan, Avancement: { Etapes,
//      Journal } } (les verrous Plan_En_Cours, Lieu_En_Creation : 5 minutes) ;
//    · fini : Systeme_Parties/{partie}/Missions_Terminees/{mission} (Statut, Fin_Le, Heros).
// =========================================================================
const VERROU_PREPARATION_MS = 5 * 60 * 1000;
const refPartie = (id) => doc(db, "Systeme_Parties", id);
const refMission = (id) => doc(db, "Systeme_Parties", id, "Guilde", "Mission");
const idJoueur = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || "INVITE"; } catch (e) { return "INVITE"; } };
function votantsGroupe() {
    if (typeof window.votantsVoyageGroupe === "function") { try { const l = window.votantsVoyageGroupe(); if (l && l.length) return l; } catch (e) {} }
    return [{ id: idJoueur(), nom: (window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom) || "Un joueur" }];
}
const herosDuGroupe = () => ((window.PERSOS_JOUEURS_PARTIE && window.PERSOS_JOUEURS_PARTIE.length ? window.PERSOS_JOUEURS_PARTIE : window.PERSOS_PARTIE) || [])
    .filter(h => h && h.idPersonnage && h.actif !== false && !h.estMonstre && !h.estIllusion).map(h => h.idPersonnage);

let partie = {}, missionEnCours = null, missionLue = "";
// La partie, comme la base la relaie (app.js, l'écoute de la partie).
window.appliquerMissionDeLaPartie = function(data) {
    partie = data || {};
    ecouterMission(idPartie(), !!(partie.Mission_En_Cours && partie.Mission_En_Cours.Id));
    // (v457) Une mission accomplie sur un autre poste : sa fiche rangée, relue ici.
    const a = partie.Mission_Accomplie;
    if (a && a.Id && termineesDe === idPartie() && !terminees.some(t => t && t.Mission && t.Mission.Id === a.Id)) lireTerminees(true);
    else if (a && a.Id && termineesDe !== idPartie()) lireTerminees();
};

// (v477) LANCER UNE MISSION (le créateur la donne, genererMission) : elle devient la mission en cours
// de la partie (une seule à la fois), puis sa fiche s'installe. Plus de vote : c'est ce qui la
// décide (le RP, le conseil — étapes 9 et 10) qui l'appelle. Rend vrai si elle a été lancée.
export async function lancerMission(m) {
    const id = idPartie();
    if (!id || !m || !m.Id) return false;
    const enCours = { Id: m.Id, Titre: m.Titre, Difficulte: difficulteDe(m), Lieu_Id: (m.Lieu && m.Lieu.Id) || null, Region: m.Region, Le: Date.now() };
    try {
        const pris = await runTransaction(db, async (tx) => {
            const s = await tx.get(refPartie(id)), d = s.exists() ? s.data() : {};
            if (d.Mission_En_Cours && d.Mission_En_Cours.Id) return false;
            // (v457) Une autre mission choisie : le sceau « Quête accomplie » de la précédente s'efface.
            tx.set(refPartie(id), { Mission_En_Cours: enCours, Mission_Accomplie: deleteField() }, { merge: true });
            return true;
        });
        if (!pris) return false;
    } catch (e) { console.error("Missions : le lancement", e); return false; }
    son("page-tourne");
    await installerMission(m, { votants: votantsGroupe() });
    return true;
}
// La mission lancée : sa fiche du groupe, la place de son lieu ; puis, en fond, son plan et son lieu
// (sur ce poste s'il a les clés, sinon sur un autre).
async function installerMission(m, r) {
    const id = idPartie();
    const existant = m.Lieu && m.Lieu.Id ? (window.VILLAGES_REGIONAUX || {})[m.Lieu.Id] : null;
    const position = existant ? { Region: existant.numero, x: existant.x, y: existant.y } : placeDuLieu(m.Region);
    try {
        await setDoc(refMission(id), { Mission: m, Statut: "en_cours", Accepte_Le: Date.now(), Jour_Accepte: jourAbsolu(), Votants: r.votants || [], Heros: herosDuGroupe(),
            Lieu_Id: (m.Lieu && m.Lieu.Id) || null, Lieu_Position: position, Plan: null, Avancement: { Etapes: {}, Journal: [] } });
    } catch (e) { console.error("Missions : la fiche de la mission", e); }
    await relireMission(id);
    preparerMission();
}
// Une place pour un lieu nouveau, dans sa région : sur le terrain, loin des autres lieux.
function placeDuLieu(region) {
    const n = Number(region) || 1;
    for (let essai = 0; essai < 200; essai++) {
        const x = 0.12 + Math.random() * 0.76, y = 0.12 + Math.random() * 0.76;
        if (typeof window.placePoiValable !== "function" || window.placePoiValable(n, x, y)) return { Region: n, x: Math.round(x * 1e5) / 1e5, y: Math.round(y * 1e5) / 1e5 };
    }
    return { Region: n, x: 0.5, y: 0.5 };
}

// LA MISSION EN COURS, écoutée.
let arretMission = null;
const abonnesMission = new Set();
export const surMission = (f) => { abonnesMission.add(f); return () => abonnesMission.delete(f); };
export const lireMission = () => missionEnCours;
function prevenirMission() {
    abonnesMission.forEach(f => { try { f(missionEnCours); } catch (e) {} });
    if (typeof window.dessinerVillagesRegion === "function") { try { window.dessinerVillagesRegion(); } catch (e) {} }
    // (les pages des régions du livre portent une copie des lieux : elles se refont aussi)
    if (window.GRIMOIRE_REGIONS && typeof window.GRIMOIRE_REGIONS.veiller === "function") { try { window.GRIMOIRE_REGIONS.veiller(); } catch (e) {} }
    try { window.dispatchEvent(new CustomEvent("mission-guilde", { detail: { mission: missionEnCours } })); } catch (e) {}
}
function ecouterMission(id, active) {
    const cle = id && active ? id : "";
    if (missionLue === cle) return;
    if (arretMission) { try { arretMission(); } catch (e) {} arretMission = null; }
    missionLue = cle; missionEnCours = null;
    if (!cle) { prevenirMission(); return; }
    relireMission(id);
    try { arretMission = onSnapshot(refMission(id), (s) => { if (missionLue !== id) return; missionEnCours = s.exists() ? s.data() : null; prevenirMission(); }, () => {}); } catch (e) {}
}
async function relireMission(id) {
    try { const s = await getDoc(refMission(id)); if (missionLue === id) { missionEnCours = s.exists() ? s.data() : null; prevenirMission(); } }
    catch (e) { console.warn("Missions : la lecture de la mission", e); }
}
export const relireLaMission = () => relireMission(idPartie());

// LE PLAN (MIA_PLAN_MISSION) : ce que le Narrateur saura, et ce qu'il gardera pour lui.
export function promptPlan(m, lieu) {
    let lore = "";
    try { lore = typeof window.loreDeLaRegion === "function" ? String(window.loreDeLaRegion(m.Region) || "") : ""; } catch (e) {}
    return `Tu es MIA_PLAN_MISSION, le stratège qui prépare les missions de la guilde d'Ivalis pour le Maître du Jeu (le Narrateur). Le monde : antique fantastique (mythologie, Antiquité magique), rien d'anachronique.
La mission que le groupe vient d'accepter :
- Mission ${difficulteDe(m)} (${DIFFICULTES[difficulteDe(m)].consigne})
- Titre : ${m.Titre}
- Région : ${m.Region_Nom}. ${lore.slice(0, 900)}
- Lieu : ${(lieu && lieu.Nom) || (m.Lieu && m.Lieu.Nom) || "à préciser"} (${(m.Lieu && m.Lieu.Type) || "lieu"}) — ${(m.Lieu && m.Lieu.Description) || ""}
- Commanditaire : ${m.Commanditaire}
- Ce qu'on en sait : ${m.Details}
- Objectif : ${m.Objectif}
- Le mot du commanditaire : ${m.Lettre}

Prépare le plan complet de cette mission : une intrigue cohérente, jouable, à la hauteur de sa difficulté, avec ses secrets. Réponds UNIQUEMENT en JSON :
{
  "connu_des_joueurs": "ce que les héros savent au départ (2 à 3 phrases)",
  "verite_cachee": "ce qui se passe vraiment, qui est derrière, ce que le commanditaire tait (3 à 5 phrases)",
  "etapes": [ { "numero": 1, "titre": "…", "description": "ce qui doit se passer", "validation": "ce qui la rend accomplie" } ] (3 à 5 étapes, la dernière accomplit l'objectif),
  "personnages": [ { "nom": "…", "role": "…", "sait": "…", "secret": "…", "attitude": "…" } ],
  "lieux": [ { "nom": "…", "description": "…", "ce_qu_on_y_trouve": "…" } ],
  "indices": [ { "nom": "…", "ou": "…", "revele": "…", "necessaire": true } ],
  "rencontres": [ { "quoi": "créatures ou dangers (adaptés à la difficulté)", "ou": "…", "danger": "faible | moyen | élevé" } ],
  "rebondissements": [ "…" ],
  "a_ne_pas_reveler": [ "ce que le MJ ne doit jamais dire directement" ],
  "issues": { "reussite": "…", "reussite_partielle": "…", "echec": "…" }
}`;
}
async function appelJson(prompt, consigne, modele) {
    const corps = JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: consigne }] }],
                                   generationConfig: { temperature: 0.9, responseMimeType: "application/json" } });
    let rep = await window.fetchGemini("missions", corps, modele ? { modele } : undefined);
    if (!rep.ok && modele) rep = await window.fetchGemini("missions", corps);          // le modèle du Narrateur refusé : le modèle léger
    const json = await rep.json();
    if (!rep.ok || json.error) throw new Error((json.error && json.error.message) || `Gemini ${rep.status}`);
    return JSON.parse(json.candidates[0].content.parts[0].text);
}
const modeleNarrateur = () => { try { return (window.reglagesNarrateur && window.reglagesNarrateur().modele) || ""; } catch (e) { return ""; } };
// Prendre une tâche de préparation (le plan, le lieu) : un seul poste, 5 minutes.
async function prendre(champ) {
    const id = idPartie();
    try {
        return await runTransaction(db, async (tx) => {
            const s = await tx.get(refMission(id)); if (!s.exists()) return false;
            const d = s.data();
            if (d.Statut !== "en_cours" || (champ === "Plan_En_Cours" ? d.Plan : d.Lieu_Id)) return false;
            if (d[champ] && Date.now() - Number(d[champ]) < VERROU_PREPARATION_MS) return false;
            tx.set(refMission(id), { [champ]: Date.now() }, { merge: true });
            return true;
        });
    } catch (e) { return false; }
}
let preparation = false;
export async function preparerMission() {
    const id = idPartie(), d = missionEnCours;
    if (!id || !d || d.Statut !== "en_cours" || preparation) return;
    preparation = true;
    try {
        // Le lieu : un nouveau lieu (comme un POI), au nom de la mission.
        if (!d.Lieu_Id && typeof window.creerLieuPoi === "function" && typeof window.peutCreerPoi === "function" && window.peutCreerPoi() && await prendre("Lieu_En_Creation")) {
            const p = d.Lieu_Position || placeDuLieu(d.Mission.Region), m = d.Mission;
            try {
                const lieu = await window.creerLieuPoi({ region: p.Region, x: p.x, y: p.y,
                    impose: { nom: m.Lieu.Nom, type: m.Lieu.Type, description: m.Lieu.Description, mission: `${m.Titre} — ${m.Objectif}`, missionId: m.Id } });
                if (lieu && lieu.id) {
                    await setDoc(refMission(id), { Lieu_Id: lieu.id, Lieu_En_Creation: deleteField() }, { merge: true });
                    await setDoc(refPartie(id), { Mission_En_Cours: { Lieu_Id: lieu.id } }, { merge: true });
                }
            } catch (e) { console.error("Missions : le lieu de la mission", e); await setDoc(refMission(id), { Lieu_En_Creation: deleteField() }, { merge: true }); }
        }
        // Le plan.
        if (!(missionEnCours && missionEnCours.Plan) && window.cleGemini && window.cleGemini("missions") && await prendre("Plan_En_Cours")) {
            try {
                const plan = await appelJson(promptPlan(d.Mission, d.Mission.Lieu), "Prépare le plan de cette mission.", modeleNarrateur());
                await setDoc(refMission(id), { Plan: plan, Plan_En_Cours: deleteField() }, { merge: true });
            } catch (e) { console.error("MIA_PLAN_MISSION :", e); await setDoc(refMission(id), { Plan_En_Cours: deleteField() }, { merge: true }); }
        }
        await relireMission(id);
    } finally { preparation = false; }
}

// LE « ? » DORÉ : la place du lieu de la mission (villages_regionaux.js le dessine).
export function marqueMission() {
    const d = missionEnCours;
    if (!d || d.Statut !== "en_cours") return null;
    const v = d.Lieu_Id ? (window.VILLAGES_REGIONAUX || {})[d.Lieu_Id] : null;
    // (le « ? » une fois et demie plus grand que la place du lieu)
    if (v) return { Region: v.numero, x: v.x, y: v.y, taille: 1.5 * (v.taille || 0.05), lieu: d.Lieu_Id };
    return d.Lieu_Position ? { ...d.Lieu_Position, taille: 0.075, lieu: null } : null;
}

// LE NARRATEUR : un rappel partout ; au lieu de la mission, le plan (ses secrets gardés).
// (v451) Nico : « le narrateur fait avancer trop vite le déroulé de la mission : en secret il y a un
// traître, et en deux tours du Narrateur on sait qui c'est ; pas de suspens, pas de possibilité de
// faire avancer plus tranquillement le récit ». Le Narrateur ne reçoit plus tout le plan d'un coup :
//   · l'étape en cours seulement (les suivantes restent cachées, même à lui) ;
//   · les personnages sans leurs secrets, et la vérité cachée, seulement à la dernière étape ;
//   · un rythme : un nombre de tours minimum par étape (selon la difficulté), un indice au plus par
//     passage, et seulement si les héros cherchent.
// MIA_SUIVI_MISSION tient le même rythme : une étape au plus par tour, jamais avant ce minimum.
export const TOURS_MIN_ETAPE = { normale: 3, difficile: 4 };
const toursMin = (m) => TOURS_MIN_ETAPE[difficulteDe(m)] || 3;
const liste = (l, f) => (Array.isArray(l) ? l : []).map(f).filter(Boolean).join("\n");
// (v458) Nico : « quand une mission vient d'être accomplie, dis au Narrateur en off de ne pas enchaîner
// de suite sur un truc intéressant, un combat ou une action nouvelle : laisser les joueurs respirer ».
// Les REPIT_APRES_MISSION passages qui suivent la réussite (Mission_Accomplie.Repit, compté par suivreApresMJ),
// (v459) ou jusqu'à ce que le groupe se mette en route.
export const REPIT_APRES_MISSION = 3;
function contexteRepit(dataPartie) {
    const p = dataPartie || partie, a = p && p.Mission_Accomplie;
    if (!a || !a.Id || (p.Mission_En_Cours && p.Mission_En_Cours.Id)) return "";
    const fait = Number(a.Repit) || 0;
    if (fait >= REPIT_APRES_MISSION) return "";
    // (v459) « …ou quand le groupe se déplace » : le répit s'achève dès que le groupe se met en route.
    const v = p.Voyage_Groupe, fin = p.Voyage_Termine;
    if (v && v.Id && v.Etat && v.Etat !== "vote") return "";
    if (fin && fin.Id && !fin.Annule && Number(fin.Le) > Number(a.Le)) return "";
    return ["--- LA MISSION VIENT D'ÊTRE ACCOMPLIE (CONSIGNE EN OFF, POUR TOI SEUL) ---",
        `Les héros viennent d'accomplir la mission « ${a.Titre || "?"} ». Laisse-les respirer : n'enchaîne pas de suite sur un nouvel événement marquant, un combat, une menace, une révélation ou une action nouvelle.`,
        "Raconte le calme qui suit : la fatigue, le soulagement, les remerciements, les blessures qu'on panse, la route ou le lieu qui s'apaise. Laisse les joueurs mener la suite à leur rythme ; n'introduis un nouvel enjeu que s'ils le provoquent eux-mêmes.",
        `(Encore ${REPIT_APRES_MISSION - fait} passage${REPIT_APRES_MISSION - fait > 1 ? "s" : ""} de répit.)`].join("\n");
}
export function contexteMissionMJ(dataPartie, lieuActuel) {
    const d = missionEnCours;
    if (!d || d.Statut !== "en_cours" || !d.Mission) return contexteRepit(dataPartie);
    const m = d.Mission, plan = d.Plan || {}, av = d.Avancement || {}, faites = av.Etapes || {};
    const etapes = Array.isArray(plan.etapes) ? plan.etapes : [];
    const courante = etapes.find(e => !faites[String(e.numero)]);
    const derniere = !!courante && courante === etapes[etapes.length - 1];
    const tours = Number(av.Tours_Etape) || 0, min = toursMin(m);
    const lignes = ["--- MISSION DE GUILDE EN COURS ---",
        `Mission ${difficulteDe(m)} — « ${m.Titre} », confiée par ${m.Commanditaire}.`,
        `Objectif : ${m.Objectif}`,
        `Lieu de la mission : ${(m.Lieu && m.Lieu.Nom) || "?"} (${m.Region_Nom}).`];
    if (courante) lignes.push(`Étape en cours : ${courante.numero}. ${courante.titre}.`);
    const ici = lieuActuel && d.Lieu_Id && lieuActuel === d.Lieu_Id;
    if (ici && d.Plan) {
        const passees = etapes.filter(e => faites[String(e.numero)]);
        const restent = courante ? etapes.length - etapes.indexOf(courante) - 1 : 0;
        lignes.push("", "--- LE PLAN DE LA MISSION (POUR TOI SEUL, MJ) ---",
            "Les héros sont sur le lieu de la mission. Tu ne connais du plan que ce dont tu as besoin maintenant : la suite te sera donnée quand les héros y arriveront.",
            `Ce que les héros savent : ${plan.connu_des_joueurs || ""}`);
        if (passees.length) lignes.push("Déjà accompli :", liste(passees, e => `  ${e.numero}. ${e.titre}`));
        if (courante) lignes.push(`L'étape à jouer maintenant : ${courante.numero}. ${courante.titre} — ${courante.description} (accomplie quand : ${courante.validation})`,
            restent ? `(Encore ${restent} étape${restent > 1 ? "s" : ""} après celle-ci : tu ne les connais pas encore, ne les devance pas.)` : "(C'est la dernière étape : celle qui accomplit l'objectif.)");
        lignes.push("Les personnages :", liste(plan.personnages, p => `  - ${p.nom} (${p.role}) : sait « ${p.sait} » ; ${p.attitude}${derniere ? ` ; secret « ${p.secret} »` : ""}`),
            "Les lieux :", liste(plan.lieux, l => `  - ${l.nom} : ${l.description} (on y trouve : ${l.ce_qu_on_y_trouve})`),
            "Les indices (un au plus par passage, et seulement si les héros cherchent activement à cet endroit) :", liste(plan.indices, x => `  - ${x.nom} : ${x.ou} → ${x.revele}${x.necessaire ? " (nécessaire)" : ""}`),
            "Les rencontres :", liste(plan.rencontres, x => `  - ${x.quoi} (${x.ou}, danger ${x.danger})`));
        if (passees.length && Array.isArray(plan.rebondissements) && plan.rebondissements.length) lignes.push("Un rebondissement possible, à amener quand le moment s'y prête :", `  - ${plan.rebondissements[Math.min(passees.length - 1, plan.rebondissements.length - 1)]}`);
        if (derniere) lignes.push(`La vérité cachée (à ne dévoiler que par ce que les héros découvrent ou prouvent eux-mêmes) : ${plan.verite_cachee || ""}`,
            `Les issues : réussite — ${(plan.issues || {}).reussite || ""} ; réussite partielle — ${(plan.issues || {}).reussite_partielle || ""} ; échec — ${(plan.issues || {}).echec || ""}`);
        else lignes.push("Il existe une vérité cachée derrière cette mission : tu la connaîtras à la dernière étape. D'ici là, ne désigne aucun coupable, aucun traître : sème seulement des détails ambigus, des fausses pistes, des silences.");
        lignes.push("À NE JAMAIS RÉVÉLER DIRECTEMENT :", liste(plan.a_ne_pas_reveler, x => `  - ${x}`));
        lignes.push("", "--- LE RYTHME DE LA MISSION ---",
            `Prends ton temps : une étape se joue sur au moins ${min} de tes passages (celle-ci en est à ${tours}). ${tours < min ? "Ne la conclus pas encore : installe l'ambiance, fais parler les personnages, laisse les héros chercher, douter, se tromper." : "Elle peut se conclure si les héros font ce qu'il faut."}`,
            "Ne fais jamais avancer l'intrigue à la place des héros : c'est leurs actions qui la font avancer. Une révélation à la fois, jamais deux dans le même passage.",
            "Garde le suspens : ne résous pas un mystère dès qu'il apparaît, ne fais pas avouer un personnage sans preuve ni pression des héros.");
    }
    lignes.push("Quand les héros accomplissent l'objectif de la mission, ou qu'ils échouent sans retour possible, dis-le clairement dans ton récit.");
    return lignes.join("\n");
}
window.contexteMissionMJ = contexteMissionMJ;

// LE SUIVI (MIA_SUIVI_MISSION) : après chaque tour du Narrateur, les étapes accomplies ;
// la mission réussie ou échouée quand le récit le dit (v452 : plus d'indices relevés).
export async function suivreApresMJ(texteMJ, idMessage) {
    const d = missionEnCours, id = idPartie();
    // (v458) Le répit après une mission accomplie : un passage du Narrateur de plus (pas celui qui l'a dite).
    const a = partie.Mission_Accomplie;
    if (!d && id && a && a.Id && !(partie.Mission_En_Cours && partie.Mission_En_Cours.Id) && (!idMessage || idMessage !== a.Message) && (Number(a.Repit) || 0) < REPIT_APRES_MISSION) {
        const repit = (Number(a.Repit) || 0) + 1;
        partie = { ...partie, Mission_Accomplie: { ...a, Repit: repit } };
        try { await setDoc(refPartie(id), { Mission_Accomplie: { Repit: repit } }, { merge: true }); } catch (e) { console.warn("Missions : le répit", e); }
        return null;
    }
    if (!d || d.Statut !== "en_cours" || !d.Mission || !texteMJ || !window.cleGemini || !window.cleGemini("missions")) return null;
    const m = d.Mission, etapes = Array.isArray((d.Plan || {}).etapes) ? d.Plan.etapes : [];
    const faites = (d.Avancement && d.Avancement.Etapes) || {};
    const prompt = `Tu es MIA_SUIVI_MISSION : tu suis l'avancement d'une mission de guilde dans le récit du Narrateur.
La mission : « ${m.Titre} » — objectif : ${m.Objectif}
Ses étapes : ${etapes.map(e => `${e.numero}. ${e.titre} (accomplie quand : ${e.validation})${faites[String(e.numero)] ? " [déjà accomplie]" : ""}`).join(" ; ") || "(pas encore de plan)"}
Lis le dernier passage du Narrateur et dis seulement ce qu'il établit clairement (rien de supposé).
Réponds en JSON : { "etapes_accomplies": [numéros], "statut": "en_cours" | "reussie" | "echouee", "resume": "une phrase sur ce qui vient de se passer pour la mission (ou \"\")" }
"reussie" seulement si l'objectif est accompli ; "echouee" seulement si la mission est perdue sans retour possible.`;
    let r;
    try { r = await appelJson(prompt, `Le passage du Narrateur :\n${String(texteMJ).slice(0, 6000)}`); } catch (e) { console.warn("MIA_SUIVI_MISSION :", e); return null; }
    // (v451) Le rythme : une étape au plus par tour — celle en cours —, et pas avant son nombre de tours minimum.
    const av = d.Avancement || { Etapes: {}, Journal: [] };
    const tours = (Number(av.Tours_Etape) || 0) + 1;
    const courante = etapes.find(e => !faites[String(e.numero)]);
    const dites = (Array.isArray(r.etapes_accomplies) ? r.etapes_accomplies : []).map(String);
    const nouvelles = courante && tours >= toursMin(m) && dites.includes(String(courante.numero)) ? [String(courante.numero)] : [];
    // (v452) Plus d'indices relevés (Nico : « vire les indices et leurs créations »).
    const maj = { Avancement: { Etapes: { ...(av.Etapes || {}) }, Journal: [...(av.Journal || [])],
                                Tours_Etape: nouvelles.length ? 0 : tours } };
    nouvelles.forEach(n => { maj.Avancement.Etapes[n] = true; });
    // « Réussie » : seulement toutes les étapes accomplies (sans plan, le Narrateur fait foi).
    const toutesFaites = etapes.every(e => maj.Avancement.Etapes[String(e.numero)]);
    if (r.statut === "reussie" && !toutesFaites) r.statut = "en_cours";
    if (r.resume) maj.Avancement.Journal = [...maj.Avancement.Journal, { Le: Date.now(), Jour: jourAbsolu(), Texte: String(r.resume).slice(0, 300) }].slice(-60);
    try { await setDoc(refMission(id), maj, { merge: true }); } catch (e) { console.warn("Missions : l'avancement", e); }
    await relireMission(id);
    if (r.statut === "reussie" || r.statut === "echouee") await terminerMission(r.statut === "reussie" ? "reussie" : "echouee", r.resume || "", idMessage);
    return r;
}
// La fin d'une mission : rangée avec les missions terminées (ses héros) ; plus de mission en cours.
// (v457) Nico : « quand une mission est validée, dessine à la suite du texte un sceau rouge "Quête
// accomplie" » : réussie, la partie garde Mission_Accomplie { Id, Titre, Le, Message } (la narration
// qui l'a dite), jusqu'à la mission suivante.
export async function terminerMission(statut, resume, idMessage) {
    const id = idPartie(), d = missionEnCours;
    if (!id || !d || !d.Mission) return false;
    try {
        await setDoc(doc(db, "Systeme_Parties", id, "Missions_Terminees", d.Mission.Id), { ...d, Statut: statut, Fin_Le: Date.now(), Jour_Fin: jourAbsolu(), Resume_Fin: resume || "" });
        await deleteDoc(refMission(id));
        const accomplie = statut === "reussie" ? { Id: d.Mission.Id, Titre: d.Mission.Titre || "", Le: Date.now(), Message: idMessage || null } : null;
        await setDoc(refPartie(id), { Mission_En_Cours: deleteField(), Mission_Accomplie: accomplie || deleteField() }, { merge: true });
        partie = { ...partie, Mission_Accomplie: accomplie };
    } catch (e) { console.error("Missions : la fin de la mission", e); return false; }
    missionEnCours = null; missionLue = "";
    partie = { ...partie, Mission_En_Cours: null };
    prevenirMission();
    lireTerminees(true);
    return true;
}

// =========================================================================
//  v444 — LES NOTES DU GROUPE, L'ABANDON, LES MISSIONS RÉUSSIES DE CHAQUE HÉROS
// =========================================================================
//  Nico : « page de droite, la possibilité pour les joueurs d'écrire eux-mêmes (partagé par le
//  groupe) des notes sur la mission en cours » ; « dans les pages missions, la possibilité de
//  voter pour mettre fin à la mission en cours : si tous les joueurs sont OK, la mission est
//  abandonnée » ; « dans la fiche de personnage, en bas à gauche, en petit : Missions réussies :
//  2 Rang B, 1 Rang C — en rapport avec leurs vraies stats ».
//    · les notes : Guilde/Mission.Notes (le texte, Notes_Par, Notes_Le) ;
//    · l'abandon : Guilde/Mission.Vote_Abandon — { Initiateur, Votants, Votes } ;
//    · les réussites : les missions terminées « reussie » où le héros était (Heros).
export async function ecrireNotes(texte) {
    const id = idPartie();
    if (!id || !missionEnCours) return false;
    const t = String(texte == null ? "" : texte).slice(0, 8000);
    try { await setDoc(refMission(id), { Notes: t, Notes_Par: idJoueur(), Notes_Le: Date.now() }, { merge: true }); }
    catch (e) { console.warn("Missions : les notes", e); return false; }
    if (missionEnCours) missionEnCours = { ...missionEnCours, Notes: t, Notes_Par: idJoueur(), Notes_Le: Date.now() };
    return true;
}
// « oui » : demander l'abandon (ou s'y joindre) ; « non » : le vote disparaît. Tous oui : abandonnée.
export async function voterAbandon(reponse) {
    const id = idPartie();
    if (!id || !missionEnCours) return null;
    const moi = idJoueur(), votants = votantsGroupe();
    let r;
    try {
        r = await runTransaction(db, async (tx) => {
            const s = await tx.get(refMission(id)); if (!s.exists()) return null;
            const d = s.data(); let v = d.Vote_Abandon;
            if (reponse === "non") { if (v) tx.set(refMission(id), { Vote_Abandon: deleteField() }, { merge: true }); return { refuse: true }; }
            if (!v || !v.Votants) v = { Initiateur: { id: moi, nom: (votants.find(x => x.id === moi) || {}).nom || "Un joueur" }, Votants: votants, Votes: {}, Le: Date.now() };
            const votes = { ...(v.Votes || {}), [moi]: "oui" };
            const tous = (v.Votants || []).every(x => votes[x.id] === "oui");
            tx.set(refMission(id), { Vote_Abandon: { ...v, Votes: votes } }, { merge: true });
            return tous ? { abandon: true } : { vote: true };
        });
    } catch (e) { console.error("Missions : le vote d'abandon", e); return null; }
    son("page-tourne");
    await relireMission(id);
    if (r && r.abandon) await terminerMission("abandonnee", "Le groupe a abandonné la mission.");
    return r;
}
let terminees = [], termineesDe = "";
async function lireTerminees(forcer) {
    const id = idPartie();
    if (!id) { terminees = []; termineesDe = ""; return terminees; }
    if (!forcer && termineesDe === id) return terminees;
    termineesDe = id;
    try { const s = await getDocs(collection(db, "Systeme_Parties", id, "Missions_Terminees")); terminees = s.docs.map(d => d.data()); }
    catch (e) { console.warn("Missions : les missions terminées", e); terminees = []; }
    try { window.dispatchEvent(new CustomEvent("missions-terminees")); } catch (e) {}
    return terminees;
}
export const relireTerminees = () => lireTerminees(true);
// (v457) La mission accomplie (tant qu'aucune autre n'est choisie) : sa fiche rangée, notes comprises.
export function missionAccomplie() {
    const a = partie.Mission_Accomplie;
    if (!a || !a.Id || (partie.Mission_En_Cours && partie.Mission_En_Cours.Id)) return null;
    return terminees.find(t => t && t.Mission && t.Mission.Id === a.Id && t.Statut === "reussie") || null;
}
// Les missions réussies d'un héros : (v452) { normale, difficile } (lues une fois par partie ; celles
// d'avant, à rang : C normale, B et A difficiles).
export function missionsReussies(idHeros) {
    if (termineesDe !== idPartie()) lireTerminees();
    const n = { normale: 0, difficile: 0 };
    terminees.forEach(t => { if (t && t.Statut === "reussie" && Array.isArray(t.Heros) && t.Heros.includes(idHeros) && t.Mission) n[difficulteDe(t.Mission)]++; });
    return n;
}

// LA VEILLE : la mission lancée sur un poste sans clés se prépare sur un poste qui les a.
setInterval(async () => {
    if (document.hidden) return;
    const id = idPartie(), mc = partie.Mission_En_Cours;
    if (!id || !mc || !mc.Id || missionLue !== id || !missionEnCours) return;
    if (missionEnCours.Statut === "en_cours" && (!missionEnCours.Plan || !missionEnCours.Lieu_Id)) preparerMission();
}, 5000);

window.MISSIONS_GUILDE = { DIFFICULTES, IMAGE_SCEAU_DIFFICILE, difficulteDe, htmlSceauDifficile, ECRITURES, TOURS_MIN_ETAPE, jourAbsolu,
                          promptMissions, genererMissions, genererMission, lancerMission,
                          lireMission, relireLaMission, surMission, preparerMission, promptPlan, marqueMission,
                          contexteMissionMJ, suivreApresMJ, terminerMission, partie: () => partie,
                          ecrireNotes, voterAbandon, missionsReussies, relireTerminees, missionAccomplie, sceauCire, REPIT_APRES_MISSION, idJoueur };
