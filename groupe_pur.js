// =========================================================================
//  IVALIS — LA COMPAGNIE : LES RÈGLES (v418), sans base ni navigateur
// =========================================================================
//  Nico : « des PNJ peuvent nous suivre : on leur demande en RP, le moteur
//  décide (seuils, et un jet de Charisme entre les deux) ; trois au plus ; ils
//  suivent le groupe partout, peuvent partir d'eux-mêmes (après avoir prévenu),
//  être renvoyés, ou laissés quelque part (« attends-nous ici »). »
//
//  Ici, seulement des calculs : groupe.js les lit et écrit la base.
//
//  LA LOYAUTÉ d'un suiveur : la moyenne de son affinité (social_pur.js) envers
//  chaque héros du groupe.
//
//  LE RECRUTEMENT (le héros qui demande) :
//    · déjà suiveur, compagnie complète (3), ou une affinité ≤ −30 envers un
//      autre membre (héros ou suiveur) : non ;
//    · le score = l'affinité envers celui qui demande, + 30 % de sa dette
//      envers lui, + sa loyauté de caractère, − sa prudence, − 15 s'il a des
//      attaches ici (famille, patron, mentor) ;
//    · score ≥ 40 : oui ; score < 10 : non ; entre les deux : un jet de
//      Charisme du héros, contre une difficulté de 17 (score 10) à 11 (score 40).
//
//  LE DÉPART SPONTANÉ : loyauté ≤ −5, il prévient (une fois) ; loyauté ≤ −20
//  après avoir prévenu, il s'en va ; remonté au-dessus de −5, l'avertissement
//  s'oublie.
// =========================================================================

import { affinite, nombre } from "./social_pur.js?v=5";

export const MAX_SUIVEURS = 3;
export const SEUIL_ACCEPTE = 40, SEUIL_REFUSE = 10, SEUIL_VETO = -30;
export const SEUIL_AVERTIR = -5, SEUIL_DEPART = -20;
export const DD_ZONE_GRISE = [17, 11];          // au bas puis au haut de la zone grise
export const ETATS = { avec: "avec nous", laisse: "laissé en arrière", parti: "parti", renvoye: "renvoyé", mort: "mort" };

// Les entrées de la compagnie (Systeme_Parties.Suiveurs), relues proprement.
export function normaliser(liste) {
    return (Array.isArray(liste) ? liste : []).filter(x => x && x.id).map(x => ({
        id: String(x.id), nom: String(x.nom || ""), etat: ETATS[x.etat] ? x.etat : "avec",
        depuis: String(x.depuis || ""), ts: nombre(x.ts), averti: !!x.averti,
        ...(x.lieu ? { lieu: String(x.lieu) } : {}), ...(x.quand ? { quand: String(x.quand) } : {}), ...(x.raison ? { raison: String(x.raison) } : {})
    }));
}
export const actifs = (liste) => normaliser(liste).filter(x => x.etat === "avec");

// La loyauté : la moyenne des affinités envers les héros (liens absents : 0).
export function loyaute(axesVersHeros) {
    const l = (axesVersHeros || []);
    if (!l.length) return 0;
    return Math.round(l.reduce((s, a) => s + affinite(a || {}), 0) / l.length);
}
export function motLoyaute(v) {
    if (v >= 60) return "dévoué";
    if (v >= 25) return "loyal";
    if (v > SEUIL_AVERTIR) return "hésitant";
    if (v > SEUIL_DEPART) return "mécontent";
    return "sur le départ";
}

// `o` : { axesDemandeur, affAutres: [nombres], traits: { loyaute, prudence },
//         attache: bool, nbSuiveurs, dejaSuiveur, jet: { total } | null }.
// Rend { verdict: "oui" | "non" | "jet" | "deja", score, dd?, raison }.
export function deciderRecrutement(o) {
    const x = o || {};
    if (x.dejaSuiveur) return { verdict: "deja", score: 0, raison: "il suit déjà la compagnie" };
    if (nombre(x.nbSuiveurs) >= MAX_SUIVEURS) return { verdict: "non", score: 0, raison: `la compagnie est complète (${MAX_SUIVEURS} suiveurs au plus)` };
    const veto = (x.affAutres || []).map(v => nombre(v)).filter(v => v <= SEUIL_VETO);
    if (veto.length) return { verdict: "non", score: 0, raison: "il ne supporte pas un membre de la compagnie" };
    const axes = x.axesDemandeur || {};
    const t = x.traits || {};
    const score = Math.round(affinite(axes) + 0.3 * Math.max(0, nombre(axes.dette))
        + 0.1 * (nombre(t.loyaute, 50) - 50) - 0.1 * (nombre(t.prudence, 50) - 50) - (x.attache ? 15 : 0));
    if (score >= SEUIL_ACCEPTE) return { verdict: "oui", score, raison: "il tient assez au héros pour le suivre" };
    if (score < SEUIL_REFUSE) return { verdict: "non", score, raison: x.attache ? "ses attaches le retiennent ici, et il ne tient pas assez au héros" : "il ne tient pas assez au héros pour tout quitter" };
    const [bas, haut] = DD_ZONE_GRISE;
    const dd = Math.round(bas - (score - SEUIL_REFUSE) / (SEUIL_ACCEPTE - SEUIL_REFUSE) * (bas - haut));
    if (!x.jet || !Number.isFinite(Number(x.jet.total))) return { verdict: "jet", score, dd, raison: "il hésite : au héros de le convaincre" };
    const ok = Number(x.jet.total) >= dd;
    return { verdict: ok ? "oui" : "non", score, dd, raison: ok ? `il se laisse convaincre (Charisme ${x.jet.total} contre ${dd})` : `il n'est pas convaincu (Charisme ${x.jet.total} contre ${dd})` };
}
// La difficulté dite en mots (pour l'Arbitre des dés).
export function motDifficulte(dd) {
    const v = nombre(dd);
    return v >= 16 ? "difficile" : v >= 13 ? "moyenne" : "facile";
}

// `o` : { loyaute, averti }. Rend "rester" | "avertir" | "partir" | "apaise".
export function verdictDepart(o) {
    const v = nombre(o && o.loyaute), averti = !!(o && o.averti);
    if (v <= SEUIL_DEPART && averti) return "partir";
    if (v <= SEUIL_AVERTIR && !averti) return "avertir";
    if (v > SEUIL_AVERTIR && averti) return "apaise";
    return "rester";
}

// LE FILTRE DES MOTS : une action de héros qui PARLE de suivre, rejoindre,
// attendre, renvoyer… mérite qu'on la lise (sinon, pas d'appel à l'IA).
// (v420) Nico : « mets plein de mots différents, pas que suivre : suis, viens,
// rejoins… pour ne pas passer à côté de la façon dont on l'a écrit ». Le texte
// est lu sans accents, en minuscules, les traits d'union et apostrophes comme
// des espaces ; le filtre ratisse large (MIA_GROUPE tranche ensuite).
const MOTS_GROUPE = new RegExp("\\b(" + [
    // — VENIR AVEC NOUS, SUIVRE, REJOINDRE —
    "suivr\\w*", "sui[st]\\b", "suiv(e|es|ent|ez|ons|ions|iez|rai\\w*|ra\\w*)\\b", "suiveur\\w*", "suis moi", "suis nous", "suivez (moi|nous)",
    "vien(s|t|nent|ne|nes|drai\\w*|dra\\w*|dr\\w*)\\b", "venez\\b", "venons\\b", "venir\\b", "veni\\w*", "ramene\\w* avec", "amene\\w* avec",
    "rejo[iu]\\w*", "rejoign\\w*", "rejoind\\w*", "rejoint\\w*", "rjoin\\w*", "joindr\\w*", "join[st]\\b", "joign\\w*", "se joindre",
    "accompagn\\w*", "acompagn\\w*", "escort\\w*", "emmen\\w*", "emmene\\w*", "embarqu\\w*", "on t emmene", "on te prend", "te prendre avec",
    "avec nous", "avec moi", "parmi nous", "des notres", "l un des notres", "l une des notres", "un des notres", "une des notres",
    "fai(s|re|tes) partie", "fais en partie", "faire route", "fai(s|tes) route", "fais la route", "en route avec", "prendre la route avec",
    "voyag\\w* avec", "partir avec", "pars avec", "partez avec", "aventure avec", "l aventure", "nos aventures", "chemin avec", "nous suivre",
    "compagn(e|on|ons|ie|ies|onne|onnes)\\b", "compagnie", "notre groupe", "le groupe", "du groupe", "au groupe", "la troupe", "notre bande", "l equipe", "notre equipe",
    "engag\\w*", "recrut\\w*", "enrol\\w*", "embauch\\w*", "a notre service", "a nos cotes", "a mes cotes", "a nos services", "allie\\w*", "rallie\\w*", "s unir", "unir nos",
    "tu viens", "vous venez", "tu nous suis", "vous nous suivez", "on y va ensemble", "ensemble",
    // — ATTENDRE ICI, RESTER EN ARRIÈRE —
    "attend\\w*", "patiente\\w*", "reste ici", "reste la", "reste en arriere", "reste derriere", "reste avec", "restez\\b", "rester ici", "rester la", "rester en arriere", "restes ici",
    "ne bouge pas", "bouge pas", "ne bougez pas", "garde (la|le|les|ce|cette|l endroit|la place|le camp)", "surveille\\w*", "monte la garde",
    "on revient", "on reviendra", "nous reviendrons", "je reviens", "je reviendrai", "reviens", "revenons", "on se retrouve", "retrouv\\w*", "rendez vous",
    "on te laisse", "je te laisse", "nous te laissons", "on vous laisse", "je vous laisse", "te laisser", "vous laisser", "laisse nous", "laissons (le|la|les)\\b",
    // — PARTIR, RENVOYER, SE SÉPARER —
    "renvo\\w*", "congedi\\w*", "separ\\w*", "quitt\\w*", "quite\\w*", "adieu\\w*", "au revoir", "a la prochaine", "bonne route", "bon vent",
    "va t en", "vas t en", "va ten", "allez vous en", "allez ven", "pars\\b", "partez\\b", "partir\\b", "part\\b", "s en aller", "t en aller", "va t en",
    "degag\\w*", "fiche le camp", "fous le camp", "foutez le camp", "file\\b", "filez\\b", "ouste", "dehors", "du balai", "disparai\\w*", "disparais",
    "plus besoin", "n avons plus besoin", "n ai plus besoin", "plus de toi", "plus de vous", "nos (chemins|routes)", "chemins se separent", "routes se separent",
    "tu es libre", "vous etes libre", "libre de partir", "libere\\w*", "liberer", "rentre chez", "rentrez chez", "retourne\\w* chez", "rentre\\w* (a|au|dans)",
    "chass\\w*", "vire\\w*", "exclu\\w*", "banni\\w*", "abandonn\\w*", "lach\\w*", "fin de (la )?route", "ici que (nos|ton|votre)", "s arrete ici", "s arrete la"
].join("|") + ")");
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’`'\-]/g, " ").replace(/\s+/g, " ");
export const parleDuGroupe = (texte) => MOTS_GROUPE.test(" " + sansAccent(texte) + " ");

// UN JET DE DÉ DU CHAT : « 🎲 Jet de **Charisme** pour **Lyra** : Résultat : 14 +2 = **16** ».
export function lireJet(texte) {
    const t = String(texte || "").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const m = t.match(/^🎲 Jet de (.+?) pour (.+?) :.*?=\s*(-?\d+)\s*$/);
    return m ? { carac: m[1].trim(), nom: m[2].trim(), total: Number(m[3]) } : null;
}

// LES CHANGEMENTS de la compagnie (purs) : `action` = { type: "recruter" |
// "renvoyer" | "laisser" | "partir" | "mort", id, nom, depuis, lieu, quand, ts, raison }.
export function appliquer(liste, action) {
    const l = normaliser(liste), a = action || {};
    if (!a.id) return l;
    const i = l.findIndex(x => x.id === a.id);
    if (a.type === "recruter") {
        const entree = { id: a.id, nom: a.nom || (i >= 0 ? l[i].nom : ""), etat: "avec", depuis: a.depuis || "", ts: nombre(a.ts), averti: false };
        if (i >= 0) l[i] = entree; else l.push(entree);
        return l;
    }
    if (i < 0) return l;
    const etat = { renvoyer: "renvoye", laisser: "laisse", partir: "parti", mort: "mort" }[a.type];
    if (!etat) return l;
    l[i] = { ...l[i], etat, averti: false, ...(a.lieu ? { lieu: a.lieu } : {}), ...(a.quand ? { quand: a.quand } : {}), ...(a.raison ? { raison: a.raison } : {}) };
    return l;
}
export const avertir = (liste, id, oui) => normaliser(liste).map(x => x.id === id ? { ...x, averti: !!oui } : x);
