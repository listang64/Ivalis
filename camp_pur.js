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
