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

// =========================================================================
//  (v481) LA GESTION DU CAMP (étape 4) : LES TÂCHES, LE BILAN, LE MORAL
// =========================================================================
// « m = modificateur de la caractéristique, calculé comme dans le jeu : (carac − 10) ÷ 2, arrondi vers
// le bas. Pour une tâche à deux caracs, on prend la meilleure. » Les caracs : { force, dex, con, int, sag, cha }.
export const modificateur = (v) => Math.floor(((Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : 10) - 10) / 2);
export const TACHES = {
    cuisiner: { nom: "Cuisiner", caracs: ["int"], max: 2, aide: "Chaque cuisinier fait manger le camp (1 + m) provisions de moins par jour (jamais moins de 1 en tout) ; repas : +2 de moral par jour à tous." },
    chasser: { nom: "Chasser", caracs: ["dex"], max: null, aide: "+(3 + m) provisions par jour (1 au moins), selon la jauge ; parfois une peau (3 drachmes) ; un petit risque de blessure." },
    cueillir: { nom: "Cueillir", caracs: ["int", "force"], max: null, aide: "+(2 + m) provisions par jour (1 au moins), selon la jauge ; sans risque." },
    soigner: { nom: "Soigner", caracs: ["sag"], max: 1, aide: "Si m vaut 1 ou plus : m blessés guérissent deux fois plus vite." },
    forger: { nom: "Forger, réparer", caracs: ["force"], max: 1, aide: "Le déplacement du camp coûte (10 % + 5 % × m) de moins (5 % au moins)." },
    eclaireur: { nom: "Éclaireur", caracs: ["dex"], max: 1, aide: "Chaque jour, une chance (20 % à 40 %) de repérer un lieu intéressant près du camp, à raconter au conseil." },
    commercer: { nom: "Commercer", caracs: ["cha"], max: null, aide: "Achète (3 drachmes) ou vend (1 drachme) des provisions au village le plus proche, ±10 % par point de m ; une fois, jusqu'au prochain conseil." },
    entrainer: { nom: "Entraîner", caracs: ["cha", "sag"], max: 2, aide: "+(20 + 10 × m) XP par jour (10 au moins) à une recrue de niveau inférieur." }
};
export const PLURIEL_TACHES = { cuisiner: "cuisiniers", soigner: "soigneur", forger: "forgeron", eclaireur: "éclaireur", entrainer: "entraîneurs" };
export const mDeTache = (tache, caracs) => {
    const t = TACHES[tache];
    if (!t) return 0;
    return Math.max(...t.caracs.map(c => modificateur((caracs || {})[c])));
};
// Le moral : « 80 ou plus : +1 au m de sa tâche ; 10 à 29 : −1 ; moins de 10 : ne travaille plus » (null).
export function mAvecMoral(m, moral) {
    const v = Number.isFinite(Number(moral)) ? Number(moral) : 60;
    if (v < 10) return null;
    if (v < 30) return m - 1;
    if (v >= 80) return m + 1;
    return m;
}
// « Rendement de la chasse et de la cueillette » selon la jauge.
export function rendementJauge(jauge) {
    const j = Number(jauge) || 0;
    return j >= 60 ? 1 : j >= 30 ? 0.5 : j >= 1 ? 0.25 : 0;
}
export const estThemes = (id, membre) => !!((membre && membre.Narrateur) || String(id || "").startsWith("PNJ_THEMES_"));
// Les membres restés au camp (pas en expédition).
export const presentsAuCampSeulement = (camp, partis) => Object.keys((camp && camp.Membres) || {}).filter(id => !(partis || []).includes(id));

// LE BILAN DU JOUR : production − consommation, au camp (l'expédition mange sur ses propres provisions).
// `infos` : { id: { caracs, indisponible: { chasser: true… } } }. « Rester au camp : 1 provision par membre et
// par jour » ; les cuisiniers la font baisser, jamais sous 1. La production : (chasse + cueillette) × le
// rendement de la jauge, arrondie vers le bas.
export function bilanDuJour(camp, infos, partis) {
    const ici = presentsAuCampSeulement(camp, partis);
    const rendement = rendementJauge(((camp && camp.Ressources) || {}).Jauge);
    let chasse = 0, cueillette = 0, cuisine = 0, ouvriers = 0;
    ici.forEach(id => {
        const mb = camp.Membres[id] || {}, t = mb.Tache, i = (infos || {})[id] || {};
        if (!t || !TACHES[t] || (i.indisponible && i.indisponible[t])) return;
        const m = mAvecMoral(mDeTache(t, i.caracs), mb.Moral);
        if (m === null) return;
        ouvriers++;
        if (t === "chasser") chasse += Math.max(1, 3 + m);
        if (t === "cueillir") cueillette += Math.max(1, 2 + m);
        if (t === "cuisiner") cuisine += Math.max(0, 1 + m);
    });
    const production = Math.floor((chasse + cueillette) * rendement);
    const consommation = ici.length ? Math.max(1, ici.length - cuisine) : 0;
    return { presents: ici.length, ouvriers, rendement, chasse, cueillette, production, cuisine: ici.length ? ici.length - consommation : 0, consommation, net: production - consommation };
}

// LE COMMERCE : « achat d'1 provision : 3 drachmes, vente : 1 drachme ; ±10 % par point de m, appliqué au total
// de la transaction puis arrondi à la drachme la plus proche ; jusqu'à (5 + 2 × m) provisions échangées (3 au moins). »
export const maxCommerce = (m) => Math.max(3, 5 + 2 * m);
export function prixCommerce(sens, quantite, m) {
    const q = Math.max(0, Math.floor(Number(quantite) || 0));
    return sens === "vente" ? Math.round(q * 1 * (1 + 0.1 * m)) : Math.round(q * 3 * (1 - 0.1 * m));
}

// PEUT-ON DONNER CETTE TÂCHE ? Rend "" ou la raison du refus. `o` : { bloque (une expédition est en cours hors du
// camp), infos ({ id: { caracs, niveau } }), recrue, commerce: { sens, quantite } }.
export function peutAssigner(camp, id, tache, o = {}) {
    if (o.bloque) return "Une expédition est en cours : les postes du camp ne changent pas avant son retour.";
    const membres = (camp && camp.Membres) || {};
    if (!membres[id]) return "Ce personnage n'est pas au camp.";
    if (!tache) return "";
    if (!TACHES[tache]) return "Tâche inconnue.";
    if (estThemes(id, membres[id])) return "Thémès ne prend pas de tâche : il part avec chaque expédition.";
    const t = TACHES[tache];
    if (t.max && Object.keys(membres).filter(x => x !== id && membres[x] && membres[x].Tache === tache).length >= t.max)
        return `Pas plus de ${t.max === 1 ? "un" : t.max} ${PLURIEL_TACHES[tache] || t.nom.toLowerCase()} au camp.`;
    const infos = o.infos || {};
    if (tache === "entrainer") {
        const r = o.recrue;
        if (!r || !membres[r] || r === id) return "Choisis la recrue qu'il entraîne.";
        if (estThemes(r, membres[r])) return "Thémès n'a pas besoin d'entraînement.";
        const nE = Number((infos[id] || {}).niveau) || 1, nR = Number((infos[r] || {}).niveau) || 1;
        if (nR >= nE) return "La recrue doit être d'un niveau inférieur à celui de l'entraîneur.";
    }
    if (tache === "commercer") {
        const c = o.commerce || {}, q = Math.floor(Number(c.quantite) || 0), m = mDeTache("commercer", (infos[id] || {}).caracs);
        if (!["achat", "vente"].includes(c.sens)) return "Achat ou vente ?";
        if (q < 1) return "Combien de provisions ?";
        if (q > maxCommerce(m)) return `Il ne peut pas échanger plus de ${maxCommerce(m)} provisions.`;
        const prix = prixCommerce(c.sens, q, m);
        if (c.sens === "achat" && prix > (Number(camp.Caisse) || 0)) return `Pas assez de drachmes dans la caisse (${prix} pour ${q} provisions).`;
        if (c.sens === "vente" && q > (Number(camp.Provisions) || 0)) return "Le camp n'a pas autant de provisions à vendre.";
    }
    return "";
}
// L'INTENDANT : « en plus d'un autre rôle ; obligatoire dès qu'au moins un personnage reste au camp » ; jamais Thémès.
export function peutEtreIntendant(camp, id, partis) {
    const mb = ((camp && camp.Membres) || {})[id];
    if (!mb) return "Ce personnage n'est pas au camp.";
    if (estThemes(id, mb)) return "Thémès ne peut pas être intendant.";
    if ((partis || []).includes(id)) return "Il est parti en expédition.";
    return "";
}
export function intendantManquant(camp, partis) {
    const restent = presentsAuCampSeulement(camp, partis).filter(id => !estThemes(id, camp.Membres[id]));
    if (!restent.length) return false;
    return !camp.Intendant || !restent.includes(camp.Intendant);
}

// LE MORAL : borné entre 0 et 100 ; « chaque variation est inscrite dans son fil invisible et pèse sur son
// humeur » : une hausse le rend joyeux, une baisse triste (5 points au moins pour toucher l'humeur).
export const MORAL_HISTORIQUE = 12;
export const moralBorne = (v) => Math.max(0, Math.min(MORAL_MAX, Math.round(Number(v) || 0)));
export function humeurDuMoral(delta) {
    const d = Number(delta) || 0;
    if (Math.abs(d) < 5) return null;
    return { emotion: d > 0 ? "joie" : "tristesse", intensite: Math.abs(d) >= 15 ? 3 : Math.abs(d) >= 10 ? 2 : 1 };
}
export function effetDuMoral(moral) {
    const v = Number(moral);
    return v >= 80 ? "+1 au m de sa tâche" : v >= 30 ? "normal" : v >= 10 ? "−1 au m de sa tâche" : "ne travaille plus";
}

// =========================================================================
//  (v482) LA JOURNÉE DU CAMP (étape 5) : à chaque jour de voyage, dans l'ordre du document
// =========================================================================
// « Table des blessures de chasse (d10, jamais de mort). »
export const BLESSURES_CHASSE = [
    { min: 1, max: 4, nom: "Égratignure de ronces", effet: "aucun effet", jours: 0 },
    { min: 5, max: 6, nom: "Cheville foulée", effet: "ne peut plus chasser pendant 2 jours", jours: 2, interdit: "chasser" },
    { min: 7, max: 7, nom: "Coup de corne", effet: "−2 aux jets de Dextérité pendant 3 jours", jours: 3, malus: { dex: -2 } },
    { min: 8, max: 8, nom: "Morsure", effet: "ne peut plus chasser pendant 3 jours", jours: 3, interdit: "chasser" },
    { min: 9, max: 9, nom: "Chute dans un ravin", effet: "repos forcé pendant 4 jours", jours: 4, interdit: "tout" },
    { min: 10, max: 10, nom: "Griffure profonde d'une bête", effet: "−2 aux jets de Force et de Dextérité pendant 5 jours", jours: 5, malus: { force: -2, dex: -2 } }
];
export const blessureChasse = (d10) => BLESSURES_CHASSE.find(b => d10 >= b.min && d10 <= b.max) || BLESSURES_CHASSE[0];
// L'éclaireur : 20 % (m −1), 25 % (m 0), 30 % (m +1), 35 % (m +2), 40 % (m +3).
export const chanceEclaireur = (m) => [20, 25, 30, 35, 40][Math.max(-1, Math.min(3, Math.round(Number(m) || 0))) + 1] / 100;
export const SOLDE_MERCENAIRE = 3, JOURS_SANS_SOLDE_MAX = 5, JOURS_MORAL_ZERO_MAX = 8, PRIX_PEAU = 3, CHANCE_PEAU = 0.25, JOURNAL_JOURS = 60;
export const MORAL_JOUR = { repos: 3, repas: 2, repasMauvais: 1, faim: -10, sansSolde: -5 };

// « Quand il n'y a pas assez de provisions pour tout le monde, on les distribue dans cet ordre de priorité (au
// hasard à l'intérieur d'un même rang) : Thémès > PNJ > mercenaires > personnages achetés par les joueurs >
// héros principaux des joueurs. » Un héros qui n'est le héros principal de personne est « traité comme un PNJ ».
export function rangProvisions(id, mb, principaux) {
    if (estThemes(id, mb)) return 0;
    if ((principaux || []).includes(id)) return 4;
    if (mb && mb.Type === "achete") return 3;
    if (mb && mb.Type === "mercenaire") return 2;
    return 1;
}
export function distribuer(ids, parts, rang, alea = Math.random) {
    const groupes = {};
    (ids || []).forEach(id => { const r = rang(id); (groupes[r] = groupes[r] || []).push(id); });
    const ordre = Object.keys(groupes).map(Number).sort((a, b) => a - b).flatMap(r => melanger(groupes[r], alea));
    const n = Math.max(0, Math.min(ordre.length, Math.floor(Number(parts) || 0)));
    return { mangent: ordre.slice(0, n), affames: ordre.slice(n) };
}

// LA JOURNÉE. `e` : { camp, infos ({ id: { nom, caracs, niveau, heros, convalescence } }), partis (les membres de
// l'expédition), expedition ({ Provisions, Economie_Provisions } ou null), principaux (les héros principaux),
// jour, dateJeu }. Rend { camp, expedition, journal, moraux, xp, soinsHeros, departs, evenements } ; ne touche pas
// à ses arguments.
export function journeeDuCamp(e, alea = Math.random) {
    const copie = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
    const camp = copie(e.camp) || {};
    const membres = camp.Membres = camp.Membres || {};
    const infos = e.infos || {}, principaux = e.principaux || [];
    const partis = (e.partis || []).slice();
    const exp = copie(e.expedition) || null;
    const journal = [], deltas = {}, xp = [], soinsHeros = {}, departs = [];
    const ev = { production: 0, peaux: 0, blessures: [], lieuRepere: false, conseilExtraordinaire: false, arret: false, expeditionAffamee: false, commerce: [], affames: [] };
    const nom = (id) => (infos[id] && infos[id].nom) || (membres[id] && membres[id].Nom) || id;
    const liste = (ids) => ids.map(nom).join(", ");
    const de = (n) => 1 + Math.floor(alea() * n);
    const bouger = (id, delta, raison) => { if (delta && membres[id]) (deltas[id] = deltas[id] || []).push({ delta, raison }); };
    camp.Provisions = Math.max(0, Number(camp.Provisions) || 0);
    camp.Caisse = Math.max(0, Number(camp.Caisse) || 0);
    const provisionsAvant = camp.Provisions;
    const ici = presentsAuCampSeulement(camp, partis);
    const rendement = rendementJauge((camp.Ressources || {}).Jauge);

    // Qui travaille aujourd'hui, et à quel m (le moral compris). Une blessure de chasse peut l'en empêcher.
    const travail = {};
    ici.forEach(id => {
        const mb = membres[id], t = mb.Tache, b = mb.Blessure_Chasse;
        if (!t || !TACHES[t] || estThemes(id, mb)) return;
        if (b && b.Jours > 0 && (b.Interdit === "tout" || b.Interdit === t)) return;
        const m = mAvecMoral(mDeTache(t, (infos[id] || {}).caracs), mb.Moral);
        if (m === null) return;
        travail[id] = { tache: t, m };
    });
    const qui = (t) => Object.keys(travail).filter(id => travail[id].tache === t);
    const auRepos = (id) => { const mb = membres[id], b = mb.Blessure_Chasse; return !mb.Tache || !TACHES[mb.Tache] || !!(b && b.Jours > 0 && b.Interdit === "tout"); };

    // 1. LA PRODUCTION DES TÂCHES.
    let chasse = 0, cueillette = 0;
    qui("chasser").forEach(id => { chasse += Math.max(1, 3 + travail[id].m); });
    qui("cueillir").forEach(id => { cueillette += Math.max(1, 2 + travail[id].m); });
    ev.production = Math.floor((chasse + cueillette) * rendement);
    camp.Provisions += ev.production;
    if (ev.production) journal.push(`La chasse et la cueillette rapportent ${ev.production} provision${ev.production > 1 ? "s" : ""}.`);
    else if (chasse + cueillette) journal.push("Les alentours sont épuisés : la chasse et la cueillette ne rapportent plus rien.");
    // Le commerce : une fois, payé au premier jour ; les achats arrivent au retour de l'expédition.
    qui("commercer").forEach(id => {
        const c = membres[id].Commerce;
        if (!c || c.Paye) return;
        const q = Math.max(0, Math.floor(Number(c.Quantite) || 0)), prix = Math.max(0, Math.round(Number(c.Prix) || 0));
        c.Paye = true;
        if (c.Sens === "vente") {
            const vendu = Math.min(q, camp.Provisions), gain = q ? Math.round(prix * vendu / q) : 0;
            camp.Provisions -= vendu; camp.Caisse += gain; c.Quantite = vendu; c.Prix = gain;
            journal.push(`${nom(id)} vend ${vendu} provision${vendu > 1 ? "s" : ""} au village : +${gain} drachmes.`);
        } else if (camp.Caisse >= prix) {
            camp.Caisse -= prix; c.A_Livrer = q;
            journal.push(`${nom(id)} achète ${q} provision${q > 1 ? "s" : ""} au village (−${prix} drachmes) : elles arriveront au camp au retour de l'expédition.`);
        } else {
            c.Echec = true;
            journal.push(`${nom(id)} n'a pas pu payer ses achats au village : la caisse est vide.`);
        }
        ev.commerce.push(id);
    });
    const cuisiniers = qui("cuisiner");
    const cuisine = cuisiniers.reduce((s, id) => s + Math.max(0, 1 + travail[id].m), 0);

    // 2. LA CONSOMMATION : le camp, puis l'expédition sur ses propres provisions.
    const affames = new Set();
    if (ici.length) {
        const besoin = Math.max(1, ici.length - cuisine);
        if (camp.Provisions >= besoin) camp.Provisions -= besoin;
        else {
            const manque = besoin - camp.Provisions;
            camp.Provisions = 0;
            const r = distribuer(ici, ici.length - manque, (id) => rangProvisions(id, membres[id], principaux), alea);
            r.affames.forEach(id => affames.add(id));
            if (r.affames.length) journal.push(`Il n'y a pas assez à manger au camp : ${liste(r.affames)} ${r.affames.length > 1 ? "ont" : "a"} faim.`);
        }
    }
    if (exp && partis.length) {
        const besoin = Math.max(0, partis.length - Math.max(0, Number(exp.Economie_Provisions) || 0));
        const avant = Math.max(0, Number(exp.Provisions) || 0);
        if (avant >= besoin) exp.Provisions = avant - besoin;
        else {
            exp.Provisions = 0;
            const r = distribuer(partis, partis.length - (besoin - avant), (id) => rangProvisions(id, membres[id], principaux), alea);
            r.affames.forEach(id => affames.add(id));
            ev.expeditionAffamee = true;
            journal.push(`L'expédition n'a plus assez de vivres${r.affames.length ? ` : ${liste(r.affames)} ${r.affames.length > 1 ? "ont" : "a"} faim` : ""}.`);
        }
    }
    ev.affames = [...affames];

    // 3. L'USURE DE LA JAUGE : −1 pour le camp, −1 par chasseur ou cueilleur.
    if (camp.Ressources) {
        const usure = 1 + qui("chasser").length + qui("cueillir").length;
        camp.Ressources.Jauge = Math.max(0, (Number(camp.Ressources.Jauge) || 0) - usure);
    }

    // 4. LA SOLDE DES MERCENAIRES : 3 drachmes par jour ; ils partent après 5 jours sans solde.
    let solde = 0;
    Object.keys(membres).filter(id => membres[id].Type === "mercenaire").forEach(id => {
        const mb = membres[id];
        if (camp.Caisse >= SOLDE_MERCENAIRE) { camp.Caisse -= SOLDE_MERCENAIRE; solde += SOLDE_MERCENAIRE; mb.Jours_Sans_Solde = 0; return; }
        mb.Jours_Sans_Solde = (Number(mb.Jours_Sans_Solde) || 0) + 1;
        bouger(id, MORAL_JOUR.sansSolde, "sa solde n'est pas payée");
        if (mb.Jours_Sans_Solde >= JOURS_SANS_SOLDE_MAX) departs.push({ id, raison: `sans solde depuis ${JOURS_SANS_SOLDE_MAX} jours` });
    });
    if (solde) journal.push(`La solde des mercenaires : −${solde} drachmes.`);

    // 5. LE MORAL : repos, repas cuisiné (pour ceux qui ont mangé), faim (« sans autre pénalité chiffrée que le moral »).
    ici.forEach(id => { if (auRepos(id)) bouger(id, MORAL_JOUR.repos, "le repos"); });
    if (cuisiniers.length) {
        const gain = cuisiniers.length === 1 && travail[cuisiniers[0]].m === -1 ? MORAL_JOUR.repasMauvais : MORAL_JOUR.repas;
        ici.forEach(id => { if (!affames.has(id)) bouger(id, gain, "un repas cuisiné"); });
    }
    affames.forEach(id => bouger(id, MORAL_JOUR.faim, "la faim"));
    const moraux = [];
    Object.keys(deltas).forEach(id => {
        const mb = membres[id], avant = Number.isFinite(Number(mb.Moral)) ? Number(mb.Moral) : 60;
        const total = deltas[id].reduce((s, d) => s + d.delta, 0), apres = moralBorne(avant + total);
        const raison = deltas[id].map(d => d.raison).join(", ");
        mb.Moral = apres;
        if (apres !== avant) {
            mb.Moral_Historique = (Array.isArray(mb.Moral_Historique) ? mb.Moral_Historique : []).concat([{ Delta: apres - avant, Raison: raison, Date_Jeu: e.dateJeu || "", Jour: e.jour || 0 }]).slice(-MORAL_HISTORIQUE);
            moraux.push({ id, avant, apres, delta: apres - avant, raison });
        }
    });
    Object.keys(membres).forEach(id => {
        const mb = membres[id];
        mb.Jours_Moral_Zero = Number(mb.Moral) === 0 ? (Number(mb.Jours_Moral_Zero) || 0) + 1 : 0;
        if (mb.Jours_Moral_Zero >= JOURS_MORAL_ZERO_MAX && !estThemes(id, mb) && !(infos[id] || {}).heros && !departs.some(d => d.id === id))
            departs.push({ id, raison: `son moral est à zéro depuis ${JOURS_MORAL_ZERO_MAX} jours` });
    });

    // 6. LES JETS : la blessure de chasse (d20 + m ≤ 2, puis d10), la peau (1 chance sur 4, 3 drachmes),
    // le lieu repéré par l'éclaireur ; l'entraînement.
    qui("chasser").forEach(id => {
        if (alea() < CHANCE_PEAU) { camp.Caisse += PRIX_PEAU; ev.peaux++; }
        const b0 = membres[id].Blessure_Chasse, malus = b0 && b0.Jours > 0 && b0.Malus ? Number(b0.Malus.dex) || 0 : 0;
        if (de(20) + travail[id].m + malus <= 2) {
            const b = blessureChasse(de(10));
            ev.blessures.push({ id, nom: b.nom });
            journal.push(`${nom(id)} se blesse à la chasse : ${b.nom.toLowerCase()} (${b.effet}).`);
            if (b.jours) membres[id].Blessure_Chasse = { Nom: b.nom, Effet: b.effet, Jours: b.jours, Interdit: b.interdit || null, Malus: b.malus || null };
        }
    });
    if (ev.peaux) journal.push(`${ev.peaux === 1 ? "Une peau vendue" : ev.peaux + " peaux vendues"} : +${ev.peaux * PRIX_PEAU} drachmes.`);
    qui("eclaireur").forEach(id => {
        if (alea() >= chanceEclaireur(travail[id].m)) return;
        ev.lieuRepere = true;
        camp.Lieux_Reperes = (camp.Lieux_Reperes || []).concat([{ Par: id, Jour: e.jour || 0, Date_Jeu: e.dateJeu || "" }]);
        journal.push(`${nom(id)} a repéré un lieu intéressant près du camp : il en parlera au prochain conseil.`);
    });
    qui("entrainer").forEach(id => {
        const r = membres[id].Recrue;
        if (!r || !membres[r] || partis.includes(r) || (Number((infos[r] || {}).niveau) || 1) >= (Number((infos[id] || {}).niveau) || 1)) return;
        const g = Math.max(10, 20 + 10 * travail[id].m);
        xp.push({ id: r, xp: g, par: id });
        journal.push(`${nom(id)} entraîne ${nom(r)} : +${g} XP.`);
    });

    // 7. LA GUÉRISON : le temps (1 jour), le repos (1 de plus), le soigneur (1 de plus pour m patients, ceux qui
    // ont le plus de jours de convalescence d'abord ; rien si son m vaut 0 ou moins).
    const convalescence = (id) => Math.max(Number(((membres[id] || {}).Blessure_Chasse || {}).Jours) || 0, Number((infos[id] || {}).convalescence) || 0);
    const soignes = new Set();
    const soigneur = qui("soigner")[0];
    if (soigneur && travail[soigneur].m >= 1) {
        ici.filter(id => id !== soigneur && convalescence(id) > 0).sort((a, b) => convalescence(b) - convalescence(a))
            .slice(0, travail[soigneur].m).forEach(id => soignes.add(id));
        if (soignes.size) journal.push(`${nom(soigneur)} soigne ${liste([...soignes])}.`);
    }
    Object.keys(membres).forEach(id => {
        const present = ici.includes(id);
        const jours = 1 + (present && auRepos(id) ? 1 : 0) + (soignes.has(id) ? 1 : 0);
        const b = membres[id].Blessure_Chasse;
        // Une blessure reçue aujourd'hui ne commence à guérir que demain.
        if (b && b.Jours > 0 && !ev.blessures.some(x => x.id === id)) {
            b.Jours = Math.max(0, b.Jours - jours);
            if (!b.Jours) { delete membres[id].Blessure_Chasse; journal.push(`${nom(id)} est remis de sa blessure de chasse.`); }
        }
        if ((infos[id] || {}).heros) soinsHeros[id] = jours;
    });

    // Ceux qui quittent le clan.
    departs.forEach(d => {
        if (!membres[d.id]) return;
        journal.push(`${nom(d.id)} quitte le clan : ${d.raison}.`);
        delete membres[d.id];
        if (camp.Intendant === d.id) camp.Intendant = null;
    });

    // 8. LE CAMP À ZÉRO : un conseil extraordinaire, et l'arrêt s'il est en déplacement.
    if (ici.length && camp.Provisions === 0) {
        if (camp.Deplacement && camp.Deplacement.En_Cours) { ev.arret = true; journal.push("Le camp n'a plus de provisions : il s'arrête là où il est."); }
        if (!camp.Conseil_Extraordinaire) {
            camp.Conseil_Extraordinaire = { Raison: "Le camp n'a plus de provisions.", Jour: e.jour || 0, Date_Jeu: e.dateJeu || "" };
            ev.conseilExtraordinaire = true;
            journal.push("Le camp n'a plus de provisions : un conseil extraordinaire doit se réunir.");
        }
    }

    // 9. LE JOURNAL de la journée (le rapport de l'intendant, les petits récits).
    if (!journal.length) journal.push(provisionsAvant === camp.Provisions ? "Une journée calme au camp." : "Une journée ordinaire au camp.");
    camp.Journal = (Array.isArray(camp.Journal) ? camp.Journal : []).concat([{ Jour: e.jour || 0, Date_Jeu: e.dateJeu || "", Lignes: journal.slice() }]).slice(-JOURNAL_JOURS);
    camp.Jours_Ecoules = (Number(camp.Jours_Ecoules) || 0) + 1;
    return { camp, expedition: exp, journal, moraux, xp, soinsHeros, departs, evenements: ev };
}
