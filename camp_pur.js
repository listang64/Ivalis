// =========================================================================
//  IVALIS — LE CAMP DU CLAN NOMADE : SES RÈGLES (v478)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) fait foi. Ce module
//  ne touche ni à la page ni à la base : il dit ce que vaut le camp, et les
//  bancs (tests_monstres/) le vérifient tel quel. camp.js l'écrit dans la partie.
//
//  LA BASE (Systeme_Parties/{partie}) :
//    · Camp — { Position: { Region, x, y }, Caisse (les drachmes de la caisse du
//      groupe), Provisions, Ressources: { Jauge (0 à 100), Terrain, Estimee_Le },
//      Membres: { [id]: { Type: "pnj" | "heros", Nom, Joueur?, Tache, Moral, Narrateur? } },
//      Intendant, Prochaine_Expedition, Reputation_Regions: { [région]: score }, Cree_Le } ;
//    · Bourses_Joueurs — { [idJoueur]: drachmes } : la bourse de chaque joueur (vide
//      pour l'instant) ;
//    · la tâche en cours reste Mission_En_Cours (missions_guilde.js), celle des missions.
// =========================================================================

// « Au début d'une partie, le camp apparaît à un endroit aléatoire de la carte,
// avec 100 drachmes dans la caisse du groupe et 28 provisions. »
export const CAMP_DEPART = { caisse: 100, provisions: 28 };

// « Le moral en chiffres » : PNJ de départ, invité en RP ou héros principal 60 ;
// recruté avec des drachmes 40 ; personnage acheté 100.
export const MORAL_DEPART = { pnj: 60, invite: 60, heros: 60, mercenaire: 40, achete: 100 };
export const MORAL_MAX = 100;

// THÉMÈS : « un vieil homme humain, sage et bienveillant, premier PNJ du clan ; il
// apparaît avec une affection au maximum pour les personnages des joueurs ; il part
// automatiquement en expédition ; ne se bat jamais ; ne peut être ni blessé ni tué ;
// il reste à vie ; il ne peut jamais être l'intendant. »
export const THEMES = {
    nom: "Thémès",
    race: "Humain",
    occupation: "Le narrateur du clan, qui écrit l'histoire de l'ordre d'Ivalis dans son manuscrit",
    physique: "Un vieil homme humain, sage et bienveillant.",
    style: "La voix posée d'un vieux conteur, sage et bienveillant.",
    // Une psyché qui dit « sage et bienveillant », rien de plus.
    psyche: {
        traits: { prudence: 80, impulsivite: 10, loyaute: 90, empathie: 90, orgueil: 10, sociabilite: 70 },
        valeurs: ["savoir", "compassion"],
        objectifs: ["Écrire l'histoire de l'ordre d'Ivalis dans son manuscrit", "Veiller sur le clan"],
        faille: "", masque: "", style: "La voix posée d'un vieux conteur, sage et bienveillant."
    },
    narrateur: true, combat: false, immortel: true, intendantPossible: false, partEnExpedition: true, resteAVie: true
};
// L'identifiant de Thémès dans une partie (Monde_PNJ, ses fils invisibles).
export const idThemes = (partie) => `PNJ_THEMES_${String(partie || "").replace(/[^A-Za-z0-9_]/g, "_")}`;

// « Une affection au maximum pour les personnages des joueurs » : l'affinité des fils
// invisibles (social_pur.js, affinite) vaut 0,40 × confiance + 0,25 × respect +
// 0,35 × attachement — les trois à 100, elle vaut 100.
export const AXES_AFFECTION_MAX = { confiance: 100, respect: 100, attachement: 100, dette: 0, crainte: 0, familiarite: 100 };
export function lienThemesVers(idThemesPartie, idHeros, maintenant = 0) {
    return { de: idThemesPartie, vers: idHeros, axes: { ...AXES_AFFECTION_MAX }, origine: "preexistant",
             etiquette: "affection", histoire: "Thémès écrit leur histoire : il les aime comme ses propres enfants.",
             majLe: maintenant, derniers: [] };
}

// LA JAUGE DES RESSOURCES NATURELLES (0 à 100), selon le terrain lu sur la carte :
// « Forêt ou rivière 80 à 100 ; Plaine 60 à 80 ; Colline ou montagne 40 à 60 ;
// Marais 30 à 50 ; Désert ou neige 10 à 30. »
export const BAREME_TERRAINS = [
    { cle: "foret_riviere", nom: "Forêt ou rivière", min: 80, max: 100, mots: ["foret", "bois", "riviere", "fleuve", "ruisseau", "lac", "jungle", "sylve"] },
    { cle: "plaine", nom: "Plaine", min: 60, max: 80, mots: ["plaine", "prairie", "champ", "pre", "steppe", "lande", "vallee", "cote", "plage", "route"] },
    { cle: "colline_montagne", nom: "Colline ou montagne", min: 40, max: 60, mots: ["colline", "montagne", "mont", "rocher", "falaise", "escarpe", "plateau", "pic"] },
    { cle: "marais", nom: "Marais", min: 30, max: 50, mots: ["marais", "marecage", "tourbiere", "fange", "bourbier"] },
    { cle: "desert_neige", nom: "Désert ou neige", min: 10, max: 30, mots: ["desert", "dune", "neige", "glace", "toundra", "sable", "aride"] }
];
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// La catégorie d'un terrain : la première du barème dont un mot apparaît (une clé
// rendue telle quelle par l'IA, « foret_riviere », compte aussi). Inconnu : null.
export function categorieTerrain(terrain) {
    const t = sansAccent(terrain);
    if (!t) return null;
    return BAREME_TERRAINS.find(c => t === c.cle || c.mots.some(m => t.includes(m))) || null;
}
// La jauge d'un terrain : la valeur de l'IA, ramenée dans la fourchette de sa
// catégorie (le milieu si l'IA n'a pas donné de nombre) ; sans catégorie, la valeur
// bornée entre 0 et 100 (50 sans valeur).
export function jaugeDuTerrain(terrain, valeur) {
    const v = Number(valeur);
    const c = categorieTerrain(terrain);
    if (!c) return Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : 50;
    if (!Number.isFinite(v)) return Math.round((c.min + c.max) / 2);
    return Math.round(Math.max(c.min, Math.min(c.max, v)));
}

// LE CAMP D'UNE NOUVELLE PARTIE. `membres` : les héros des joueurs ({ id, nom,
// joueur }) ; Thémès en est toujours, en premier.
export function campInitial({ partie, position, jauge, terrain, membres, maintenant = 0 }) {
    const idT = idThemes(partie);
    const m = { [idT]: { Type: "pnj", Nom: THEMES.nom, Tache: null, Moral: MORAL_DEPART.pnj, Narrateur: true } };
    (membres || []).forEach(h => {
        if (!h || !h.id || m[h.id]) return;
        m[h.id] = { Type: "heros", Nom: String(h.nom || ""), Joueur: String(h.joueur || ""), Tache: null, Moral: MORAL_DEPART.heros };
    });
    return {
        Position: { Region: Number(position.Region), x: Number(position.x), y: Number(position.y) },
        Caisse: CAMP_DEPART.caisse, Provisions: CAMP_DEPART.provisions,
        Ressources: { Jauge: jauge === null || jauge === undefined ? null : Number(jauge), Terrain: String(terrain || ""), Estimee_Le: maintenant },
        Membres: m, Intendant: null, Prochaine_Expedition: 1, Reputation_Regions: {}, Cree_Le: maintenant
    };
}

// La région qui porte ce nom (sans casse ni accents), parmi les cartes régionales
// ({ numéro: { nom } }) : son numéro, ou 0.
export function regionNommee(cartes, nom) {
    const voulu = sansAccent(nom);
    const n = Object.keys(cartes || {}).map(Number).filter(k => k > 0)
        .find(k => sansAccent((cartes[k] || {}).nom).includes(voulu));
    return n || 0;
}

// LE HÉROS PRINCIPAL D'UN JOUEUR (v479) : « le premier personnage d'un joueur est son héros
// principal » ; il peut en changer, « parmi les personnages qui appartiennent uniquement au
// joueur ». `persos` : les personnages de la partie ({ idPersonnage, idJoueur, creeLe, statut,
// estIllusion }) ; `choix` : Heros_Principaux de la partie ({ idJoueur: idPersonnage }).
export function personnagesDuJoueur(joueur, persos) {
    return (persos || []).map((h, i) => ({ h, i }))
        .filter(({ h }) => h && h.idPersonnage && joueur && h.idJoueur === joueur && !h.estIllusion && !h.estMonstre && h.statut !== "Mort")
        .sort((a, b) => ((a.h.creeLe || Infinity) - (b.h.creeLe || Infinity)) || (a.i - b.i))
        .map(x => x.h);
}
export function herosPrincipal(joueur, persos, choix) {
    const siens = personnagesDuJoueur(joueur, persos);
    const voulu = choix && choix[joueur];
    const h = siens.find(x => x.idPersonnage === voulu) || siens[0];
    return h ? h.idPersonnage : null;
}

// =========================================================================
//  (v480) LA PAGE DU CAMP (étape 3) : SES RÈGLES
// =========================================================================
// « Liste des poses possibles » — pour chacune des deux images en scène d'un personnage, une pose
// tirée au hasard, jamais deux fois la même pour un même personnage.
export const POSES_CAMP = [
    "regarder en l'air, les yeux dans les nuages", "s'étirer après une longue nuit", "bâiller en se frottant les yeux", "réchauffer ses mains",
    "goûter un plat du bout de la cuillère", "éplucher des légumes, assis sur un tabouret", "porter un fagot de bois sur l'épaule", "fendre une bûche à la hache",
    "aiguiser une lame", "huiler ou réparer une pièce d'armure", "recoudre un vêtement déchiré", "tendre une corde d'arc", "empenner des flèches",
    "dépecer un gibier", "porter un seau d'eau", "se laver le visage dans une bassine", "secouer un drap", "lire un vieux livre", "écrire dans un carnet",
    "étudier une carte dépliée", "compter des pièces dans une bourse", "jouer d'un instrument", "chantonner, les mains dans le dos",
    "rire, une main sur le ventre", "boire dans une chope", "croquer dans une pomme", "fumer la pipe", "s'asseoir sur une caisse, pensif",
    "somnoler, assis contre un sac", "faire les cent pas", "observer l'horizon, une main en visière", "s'entraîner seul à l'épée", "faire des étirements",
    "méditer, les yeux fermés", "prier à genoux", "caresser un animal du camp", "trier des herbes ou des racines", "planter un piquet de tente",
    "ranger des caisses de vivres", "se gratter la tête, perplexe", "faire un signe de la main à quelqu'un", "raconter une histoire en gesticulant",
    "ronchonner, les bras croisés", "sculpter un morceau de bois au couteau"
];
export function deuxPoses(alea = Math.random) {
    const a = Math.floor(alea() * POSES_CAMP.length) % POSES_CAMP.length;
    let b = Math.floor(alea() * (POSES_CAMP.length - 1)) % (POSES_CAMP.length - 1);
    if (b >= a) b++;
    return [POSES_CAMP[a], POSES_CAMP[b]];
}
// Les deux images d'un personnage sont à (re)faire : il n'en a pas deux, ou son armure a changé
// (« si un personnage change d'armure, on efface ses deux images et on en crée deux nouvelles »).
export function imagesCampAFaire(images, armureFaite, armureActuelle) {
    const ok = Array.isArray(images) && images.filter(i => i && i.url).length >= 2;
    if (!ok) return true;
    return String(armureFaite || "") !== String(armureActuelle || "");
}

// QUI EST AU CAMP : ses membres, les héros principaux des joueurs aussi ; « seuls les membres partis
// en expédition ne sont pas affichés ». `partis` : les identifiants en expédition.
export function presentsAuCamp(camp, herosPrincipaux, partis) {
    const out = new Set(Object.keys((camp && camp.Membres) || {}));
    (herosPrincipaux || []).forEach(id => { if (id) out.add(id); });
    (partis || []).forEach(id => out.delete(id));
    return [...out];
}

// LE PLACEMENT : « les images des personnages présents au camp dans les encarts, de manière
// aléatoire, à chaque fois qu'on revient sur la fenêtre du camp ; s'il y a plus de personnages que
// d'encarts, on en choisit au hasard ». Le compagnon du pisteur va dans l'encart de son gabarit
// (« sol_gros », « sol_petit » ou « air »). `encarts` : { n: { type } } ; `personnages` : [{ id,
// images: [url…] }] ; `compagnons` : [{ id, gabarit, image }]. Rend { n: { id, image } }.
export const TYPE_ENCART_GABARIT = { sol_gros: "compagnon_gros", sol_petit: "compagnon_petit", air: "compagnon_air" };
function melanger(liste, alea) {
    const l = liste.slice();
    for (let i = l.length - 1; i > 0; i--) { const k = Math.floor(alea() * (i + 1)); [l[i], l[k]] = [l[k], l[i]]; }
    return l;
}
export function placerAuCamp(encarts, personnages, compagnons, alea = Math.random) {
    const out = {};
    const ids = (type) => melanger(Object.keys(encarts || {}).filter(n => ((encarts[n] || {}).type || "perso") === type), alea);
    const places = ids("perso");
    melanger((personnages || []).filter(p => p && p.id && (p.images || []).length), alea).slice(0, places.length).forEach((p, i) => {
        out[places[i]] = { id: p.id, image: p.images[Math.floor(alea() * p.images.length) % p.images.length] };
    });
    const libres = {};
    Object.values(TYPE_ENCART_GABARIT).forEach(t => { libres[t] = ids(t); });
    (compagnons || []).forEach(c => {
        const t = TYPE_ENCART_GABARIT[c && c.gabarit];
        if (!t || !c.image || !libres[t].length) return;
        out[libres[t].shift()] = { id: c.id, image: c.image, compagnon: true };
    });
    return out;
}

// CLIQUER SUR UN PERSONNAGE DU CAMP : la discussion privée, « sauf sur son propre personnage, et sauf
// sur le personnage d'un autre joueur si ce joueur est connecté ».
export function peutDiscuterAuCamp(perso, moi, connectes) {
    if (!perso || !perso.id) return false;
    if (perso.joueur && perso.joueur === moi) return false;
    if (perso.joueur && connectes && connectes.has(perso.joueur)) return false;
    return true;
}
// Un joueur connecté : il a donné signe de vie il y a moins de 2 min 30.
export const PRESENCE_MS = 150000;
export const estConnecte = (le, maintenant) => Number.isFinite(Number(le)) && maintenant - Number(le) < PRESENCE_MS;

// LE CLAN EST-IL AU CAMP ? « Début de l'expédition quand le groupe quitte la case du camp ; fin
// quand il y revient » (étape 6) — et « un RP dans le camp ne déclenche jamais de combat ».
// Le groupe est au camp s'il n'est pas en expédition et que son pion est sur l'icône du camp
// (même région, à moins de `rayon` — la taille de l'icône — en fraction de la carte régionale),
// ou s'il n'a pas encore de place.
export function groupeAuCamp(camp, position, expedition, rayon = 0.06) {
    if (!camp || !camp.Position) return false;
    if (expedition && expedition.En_Cours) return false;
    if (!position || position.x == null || position.y == null) return true;
    if (Number(position.Region) !== Number(camp.Position.Region)) return false;
    return Math.hypot(Number(position.x) - Number(camp.Position.x), Number(position.y) - Number(camp.Position.y)) <= rayon;
}
