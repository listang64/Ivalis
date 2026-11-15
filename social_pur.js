// =========================================================================
//  LE MOTEUR SOCIAL PUR — « LES FILS INVISIBLES » (v410)
// =========================================================================
//
//  Nico : « plus de profondeur et d'interactions, et qu'ils aient un avis sur
//  chaque personnage ou PNJ, pas sur le groupe en général ».
//
//  CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
//  --------------------------------------
//  Comme moteur_pur.js : il prend un état (les âmes et leurs liens) et des
//  événements, et il rend l'état d'après et la liste de ce qui a changé. Il
//  n'écrit aucun document, n'appelle aucune IA et ne lit aucune variable
//  globale. La même scène donne toujours les mêmes chiffres.
//
//  LES RÈGLES QU'ON NE CASSE JAMAIS
//  --------------------------------
//   1. Seul ce qui se passe dans une scène compte ; seuls les présents en sont
//      touchés (un absent ne change jamais).
//   2. La personnalité d'un PNJ ne bouge pas ; son humeur et ses liens, si.
//      (Celle d'un héros glisse lentement avec ses actes.)
//   3. Chaque chiffre a une cause : l'événement qui l'a produit.
//   4. L'IA ne donne jamais un chiffre : elle nomme une action du catalogue,
//      ses acteurs et sa gravité ; ce moteur calcule.
//   5. Un lien est orienté : « Varos → Kaya » n'est pas « Kaya → Varos ».
//
//  LES CHIFFRES
//  ------------
//  Un lien a six axes : confiance, respect, attachement, dette (−100 à +100),
//  crainte et familiarité (0 à 100). L'affinité vaut 0,40 × confiance +
//  0,25 × respect + 0,35 × attachement. On garde les décimales ; on n'arrondit
//  qu'à l'affichage (arrondi()).
// =========================================================================

export const VERSION_SOCIAL = 1;

export const AXES = ["confiance", "respect", "attachement", "dette", "crainte", "familiarite"];
export const BORNES = {
    confiance: [-100, 100], respect: [-100, 100], attachement: [-100, 100], dette: [-100, 100],
    crainte: [0, 100], familiarite: [0, 100]
};
export const NOMS_AXES = { confiance: "Confiance", respect: "Respect", attachement: "Attachement", dette: "Dette", crainte: "Crainte", familiarite: "Familiarité" };

export const TRAITS = ["prudence", "impulsivite", "loyaute", "empathie", "orgueil", "sociabilite"];
export const NOMS_TRAITS = { prudence: "Prudence", impulsivite: "Impulsivité", loyaute: "Loyauté", empathie: "Empathie", orgueil: "Orgueil", sociabilite: "Sociabilité" };
export const VALEURS = ["honneur", "famille", "liberte", "ordre", "foi", "savoir", "richesse", "pouvoir", "justice", "compassion"];
export const NOMS_VALEURS = { honneur: "l'honneur", famille: "la famille", liberte: "la liberté", ordre: "l'ordre", foi: "la foi", savoir: "le savoir",
    richesse: "la richesse", pouvoir: "le pouvoir", justice: "la justice", compassion: "la compassion" };
export const EMOTIONS = ["calme", "joie", "colere", "peur", "tristesse", "honte", "gratitude", "mefiance"];
export const NOMS_EMOTIONS = { calme: "calme", joie: "joyeux", colere: "en colère", peur: "effrayé", tristesse: "triste", honte: "honteux", gratitude: "reconnaissant", mefiance: "méfiant" };

// La gravité : 1 mineure, 2 notable, 3 fondatrice. Son multiplicateur et le
// plafond d'un écart, par axe et par événement.
export const MULT_GRAVITE = { 1: 1, 2: 2, 3: 4 };
export const PLAFOND_GRAVITE = { 1: 6, 2: 12, 3: 30 };
// Le rôle de celui dont le lien change : la cible de l'action, un témoin.
export const ROLE = { cible: 1, temoin: 0.5 };
// Ce que l'acte révèle de l'acteur envers sa cible : entier pour un héros (ses
// sentiments se déduisent de ses actes), réduit pour un PNJ (le MJ l'a déjà fait
// agir selon ce qu'il ressent).
export const EXPRESSION = { heros: 1, pnj: 0.3 };
// La même action (même acteur, même cible) répétée récemment : ½, puis ¼…
export const LASSITUDE = 0.5;
export const DUREE_HUMEUR = 3;   // en réponses du MJ

// -------------------------------------------------------------------------
//  LE CATALOGUE DES ACTIONS
// -------------------------------------------------------------------------
// `cible` : ce que l'action change dans le regard de la cible sur l'acteur (par
// point de gravité). `acteur` : ce qu'elle révèle de l'acteur envers sa cible.
// `gmax` : la gravité la plus haute possible (un compliment n'est jamais
// fondateur). `hostile` : un témoin qui déteste la cible l'approuve plutôt.
// `valeur` : la valeur qui rend la cible plus sensible à cette action.
// `emotion` : l'humeur qu'elle laisse à la cible.
export const ACTIONS = {
    echanger:           { nom: "a parlé avec",            cible: { familiarite: 2 },                                   acteur: { familiarite: 2 }, gmax: 1 },
    aider:              { nom: "a aidé",                  cible: { confiance: 4, attachement: 3, dette: 4 },          acteur: { attachement: 2 }, gmax: 2, emotion: "gratitude", valeur: "compassion" },
    sauver:             { nom: "a sauvé",                 cible: { confiance: 5, attachement: 4, dette: 7, respect: 3 }, acteur: { attachement: 3 }, gmax: 3, emotion: "gratitude" },
    soigner:            { nom: "a soigné",                cible: { confiance: 3, attachement: 3, dette: 5 },          acteur: { attachement: 2 }, gmax: 2, emotion: "gratitude", valeur: "compassion" },
    offrir:             { nom: "a offert un présent à",   cible: { attachement: 3, dette: 2 },                        acteur: { attachement: 2 }, gmax: 2, emotion: "joie", valeur: "richesse" },
    tenir_promesse:     { nom: "a tenu sa promesse envers", cible: { confiance: 5, respect: 3 },                      acteur: { respect: 1 }, gmax: 2, valeur: "honneur" },
    rompre_promesse:    { nom: "a rompu sa promesse envers", cible: { confiance: -5, respect: -3 },                   acteur: {}, gmax: 2, hostile: true, emotion: "colere", valeur: "honneur" },
    mentir:             { nom: "a menti à",               cible: { confiance: -5, respect: -2 },                      acteur: {}, gmax: 2, hostile: true, emotion: "mefiance", valeur: "justice" },
    trahir:             { nom: "a trahi",                 cible: { confiance: -5, attachement: -4, respect: -2 },    acteur: { attachement: -3 }, gmax: 3, hostile: true, emotion: "colere", valeur: "honneur" },
    menacer:            { nom: "a menacé",                cible: { crainte: 5, confiance: -3, attachement: -3 },      acteur: { attachement: -2, respect: -1 }, gmax: 2, hostile: true, emotion: "peur" },
    attaquer:           { nom: "a attaqué",               cible: { crainte: 5, confiance: -5, attachement: -4 },      acteur: { attachement: -4 }, gmax: 3, hostile: true, emotion: "colere" },
    humilier:           { nom: "a humilié",               cible: { respect: -4, attachement: -5, confiance: -2 },     acteur: { respect: -3 }, gmax: 2, hostile: true, emotion: "honte" },
    complimenter:       { nom: "a complimenté",           cible: { attachement: 2, respect: 1 },                      acteur: { attachement: 1 }, gmax: 1, emotion: "joie" },
    defendre:           { nom: "a pris la défense de",    cible: { confiance: 5, attachement: 4, respect: 3, dette: 2 }, acteur: { attachement: 2 }, gmax: 2, emotion: "gratitude", valeur: "justice" },
    abandonner:         { nom: "a abandonné",             cible: { confiance: -5, attachement: -4 },                  acteur: { attachement: -2 }, gmax: 2, hostile: true, emotion: "tristesse", valeur: "famille" },
    refuser:            { nom: "a refusé d'aider",        cible: { confiance: -2, attachement: -2 },                  acteur: {}, gmax: 1, hostile: true, emotion: "mefiance" },
    voler:              { nom: "a volé",                  cible: { confiance: -5, respect: -3 },                      acteur: {}, gmax: 2, hostile: true, emotion: "colere", valeur: "ordre" },
    confier_secret:     { nom: "a confié un secret à",    cible: { confiance: 4, attachement: 3, familiarite: 3 },    acteur: { confiance: 3, familiarite: 2 }, gmax: 2 },
    combattre_ensemble: { nom: "a combattu aux côtés de", cible: { respect: 4, attachement: 3, familiarite: 4, confiance: 2 }, acteur: { respect: 3, attachement: 2, familiarite: 4 }, gmax: 2 },
    excuser:            { nom: "s'est excusé auprès de",  cible: { confiance: 3, attachement: 2 },                    acteur: {}, gmax: 1, emotion: "calme" },
    servir:             { nom: "a loyalement servi",      cible: { respect: 3, confiance: 3 },                        acteur: { respect: 2 }, gmax: 2, valeur: "ordre" },
    impressionner:      { nom: "a impressionné",          cible: { respect: 5, crainte: 2 },                          acteur: {}, gmax: 2, valeur: "pouvoir" }
};
export const TYPES_ACTIONS = Object.keys(ACTIONS);

// -------------------------------------------------------------------------
//  LES LIENS QUI EXISTENT AVANT LA RENCONTRE (à la création d'un PNJ)
// -------------------------------------------------------------------------
// `ab` : de A vers B ; `ba` : de B vers A. « A est le patron de B ».
export const LIENS_PREEXISTANTS = {
    famille:   { nom: "famille",        ab: { attachement: 45, confiance: 30, respect: 15, familiarite: 85 }, ba: { attachement: 45, confiance: 30, respect: 15, familiarite: 85 } },
    ami:       { nom: "ami",            ab: { attachement: 35, confiance: 30, respect: 15, familiarite: 65 }, ba: { attachement: 35, confiance: 30, respect: 15, familiarite: 65 } },
    amant:     { nom: "amour",          ab: { attachement: 60, confiance: 35, respect: 15, familiarite: 80 }, ba: { attachement: 55, confiance: 30, respect: 15, familiarite: 80 } },
    patron:    { nom: "patron",         ab: { respect: 5, confiance: 15, attachement: 5, familiarite: 60 },   ba: { respect: 30, crainte: 15, confiance: 10, familiarite: 60 } },
    mentor:    { nom: "mentor",         ab: { attachement: 25, confiance: 20, respect: 10, familiarite: 60 }, ba: { respect: 45, attachement: 25, confiance: 30, dette: 20, familiarite: 60 } },
    rival:     { nom: "rival",          ab: { respect: 10, confiance: -30, attachement: -20, familiarite: 50 }, ba: { respect: 10, confiance: -30, attachement: -20, familiarite: 50 } },
    ennemi:    { nom: "ennemi",         ab: { confiance: -55, attachement: -50, respect: -20, crainte: 10, familiarite: 45 }, ba: { confiance: -55, attachement: -50, respect: -20, crainte: 10, familiarite: 45 } },
    creancier: { nom: "créancier",      ab: { dette: -30, confiance: -5, familiarite: 40 },                   ba: { dette: 30, crainte: 10, familiarite: 40 } },
    voisin:    { nom: "voisin",         ab: { attachement: 5, confiance: 5, familiarite: 40 },                ba: { attachement: 5, confiance: 5, familiarite: 40 } }
};
export const TYPES_LIENS = Object.keys(LIENS_PREEXISTANTS);
// L'étiquette vue depuis l'autre bout (« patron » ↔ « employé »).
export const ETIQUETTE_INVERSE = { patron: "employé", mentor: "élève", creancier: "débiteur" };

// -------------------------------------------------------------------------
//  OUTILS
// -------------------------------------------------------------------------
export const borner = (axe, v) => Math.max(BORNES[axe][0], Math.min(BORNES[axe][1], v));
export const nombre = (v, defaut = 0) => { const n = Number(v); return Number.isFinite(n) ? n : defaut; };
export const arrondi = (v) => Math.round(nombre(v));
export const cleLien = (de, vers) => `${de}~${vers}`;
export const axesVides = () => Object.fromEntries(AXES.map(a => [a, 0]));
const cloner = (x) => JSON.parse(JSON.stringify(x));
// Un petit hasard déterministe (FNV-1a) : le même couple donne toujours la même nuance.
export function graine(texte) {
    let h = 2166136261;
    for (const c of String(texte)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
}

export function affinite(axes) {
    const a = axes || {};
    return Math.max(-100, Math.min(100, 0.40 * nombre(a.confiance) + 0.25 * nombre(a.respect) + 0.35 * nombre(a.attachement)));
}

// Une psyché complète et bornée (ce que l'IA propose est toujours relu ici).
export function psycheValide(p) {
    const x = p || {};
    const traits = Object.fromEntries(TRAITS.map(t => [t, Math.max(0, Math.min(100, nombre((x.traits || {})[t], 50)))]));
    const valeurs = [...new Set((Array.isArray(x.valeurs) ? x.valeurs : []).map(v => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")).filter(v => VALEURS.includes(v)))].slice(0, 3);
    const texte = (v, n = 200) => String(v || "").trim().slice(0, n);
    return {
        traits, valeurs,
        objectifs: (Array.isArray(x.objectifs) ? x.objectifs : [x.objectifs]).map(o => texte(o)).filter(Boolean).slice(0, 3),
        faille: texte(x.faille), masque: texte(x.masque), style: texte(x.style)
    };
}

// -------------------------------------------------------------------------
//  LES MOTS D'UN LIEN (pour le MJ et pour le livre)
// -------------------------------------------------------------------------
export function motAffinite(a) {
    const v = nombre(a);
    if (v >= 60) return "très attaché";
    if (v >= 20) return "bienveillant";
    if (v > -10) return "neutre";
    if (v > -50) return "méfiant";
    return "hostile";
}
// « le respecte mais ne lui fait pas confiance » : les axes marqués, en mots.
export function resumeLien(axes) {
    const a = axes || {};
    const pos = [], neg = [];
    const marque = (axe, seuil = 25) => Math.abs(nombre(a[axe])) >= seuil;
    if (marque("confiance")) (a.confiance > 0 ? pos : neg).push(a.confiance > 0 ? "lui fait confiance" : "ne lui fait pas confiance");
    if (marque("respect")) (a.respect > 0 ? pos : neg).push(a.respect > 0 ? "le respecte" : "le méprise");
    if (marque("attachement")) (a.attachement > 0 ? pos : neg).push(a.attachement > 0 ? "tient à lui" : "ne le supporte pas");
    if (marque("dette")) pos.push(a.dette > 0 ? "se sent redevable" : "estime qu'on lui doit quelque chose");
    if (nombre(a.crainte) >= 40) neg.push("le craint");
    if (nombre(a.familiarite) < 15) neg.push("le connaît à peine");
    if (!pos.length && !neg.length) return "n'a pas d'avis tranché";
    if (pos.length && neg.length) return `${pos.join(", ")} mais ${neg.join(", ")}`;
    return [...pos, ...neg].join(", ");
}

// -------------------------------------------------------------------------
//  LA SENSIBILITÉ : la personnalité de celui dont le lien change
// -------------------------------------------------------------------------
// Rend le facteur appliqué à l'écart `delta` sur `axe`, pour l'action `type`.
export function sensibilite(psyche, type, axe, delta) {
    const p = psycheValide(psyche), t = p.traits, act = ACTIONS[type] || {};
    const f = (x) => t[x] / 100;
    let k = 1;
    // Une valeur touchée : la première de ses valeurs compte plus.
    if (act.valeur && p.valeurs.includes(act.valeur)) k *= p.valeurs[0] === act.valeur ? 1.7 : 1.4;
    if (delta < 0) k *= 0.85 + 0.3 * f("impulsivite");                         // l'impulsif réagit plus fort au mal
    if (["humilier", "menacer"].includes(type) && ["respect", "attachement"].includes(axe) && delta < 0) k *= 0.7 + 0.6 * f("orgueil");
    if (type === "menacer" && axe === "crainte") k *= 1.3 - 0.6 * f("orgueil");   // l'orgueilleux plie moins
    if (["aider", "soigner", "sauver", "defendre"].includes(type) && delta > 0) k *= 0.8 + 0.4 * f("empathie");
    if (["trahir", "rompre_promesse", "tenir_promesse", "abandonner"].includes(type)) k *= 0.8 + 0.6 * f("loyaute");
    if (axe === "confiance" && delta > 0) k *= 1.2 - 0.5 * f("prudence");      // le prudent accorde lentement sa confiance
    if (axe === "familiarite" && delta > 0) k *= 0.7 + 0.6 * f("sociabilite");
    return k;
}

// Plus un axe approche de sa borne, moins il monte ; la confiance se perd
// plus vite qu'elle ne se gagne (une baisse depuis le positif n'est pas freinée).
export function saturation(axe, valeur, delta) {
    const [min, max] = BORNES[axe], v = nombre(valeur);
    if (min < 0) return delta > 0 ? Math.min(1, (max - v) / 100) : Math.min(1, (v - min) / 100);
    return delta > 0 ? Math.min(1, (max - v) / 50) : Math.min(1, (v - min) / 50);
}

// -------------------------------------------------------------------------
//  LA VALIDATION D'UN ÉVÉNEMENT (ce que l'IA propose)
// -------------------------------------------------------------------------
// `ev` : { type, acteur, cible, gravite, discret, resume }. `presents` : les
// identifiants des âmes de la scène. Rend l'événement propre, ou { rejet }.
export function validerEvenement(ev, presents, ames) {
    const e = ev || {};
    const type = String(e.type || "").toLowerCase().trim();
    if (!ACTIONS[type]) return { rejet: `action inconnue : ${e.type}` };
    const ici = new Set(presents || []);
    if (!ici.has(e.acteur)) return { rejet: `acteur absent de la scène : ${e.acteur}` };
    if (!ici.has(e.cible)) return { rejet: `cible absente de la scène : ${e.cible}` };
    if (e.acteur === e.cible) return { rejet: "acteur et cible confondus" };
    const ame = (ames || {})[e.acteur];
    if (ame && ame.statut === "mort") return { rejet: `un mort n'agit plus : ${e.acteur}` };
    const gravite = Math.max(1, Math.min(ACTIONS[type].gmax, Math.round(nombre(e.gravite, 1)) || 1));
    return { type, acteur: e.acteur, cible: e.cible, gravite, discret: e.discret === true, resume: String(e.resume || "").slice(0, 240) };
}

// -------------------------------------------------------------------------
//  L'APPLICATION DES ÉVÉNEMENTS
// -------------------------------------------------------------------------
// `etat` : { ames: { id: { id, type: "pnj"|"heros", nom, psyche, humeur, statut } },
//            liens: { "a~b": { de, vers, axes, origine, etiquette } } }.
// `evenements` : ce que l'IA a proposé (validés ici). `ctx` : { presents, tour,
// historique: [{ acteur, cible, type }] (les événements récents, pour la lassitude),
// sansLienEntreHeros (v412 : jamais de lien chiffré d'un héros à un autre) }.
// Rend { etat, evenements (validés), changements, humeurs, derives, rejets }.
export function appliquerEvenements(etatAvant, evenements, ctx) {
    const etat = cloner(etatAvant || { ames: {}, liens: {} });
    etat.ames = etat.ames || {}; etat.liens = etat.liens || {};
    const c = ctx || {};
    const presents = (c.presents || []).filter(id => etat.ames[id]);
    const historique = (c.historique || []).slice();
    const valides = [], changements = [], humeurs = [], derives = [], rejets = [];

    const lien = (de, vers) => {
        const k = cleLien(de, vers);
        if (!etat.liens[k]) etat.liens[k] = { de, vers, axes: axesVides(), origine: "rencontre", etiquette: "" };
        etat.liens[k].axes = Object.assign(axesVides(), etat.liens[k].axes || {});
        return etat.liens[k];
    };
    // Un écart sur un axe : sensibilité, saturation, plafond, bornes.
    const changer = (n, de, vers, axe, brut, gravite) => {
        const ame = etat.ames[de];
        if (!ame || ame.statut === "mort" || !brut) return;
        if (c.sansLienEntreHeros && ame.type === "heros" && (etat.ames[vers] || {}).type === "heros") return;
        const l = lien(de, vers), avant = nombre(l.axes[axe]);
        let d = brut * sensibilite(ame.psyche, valides[n].type, axe, brut) * saturation(axe, avant, brut);
        const plafond = PLAFOND_GRAVITE[gravite];
        d = Math.max(-plafond, Math.min(plafond, d));
        const apres = borner(axe, avant + d);
        if (Math.abs(apres - avant) < 0.01) return;
        l.axes[axe] = Math.round(apres * 100) / 100;
        changements.push({ evenement: n, de, vers, axe, avant, apres: l.axes[axe] });
    };

    (evenements || []).forEach(brut => {
        const ev = validerEvenement(brut, presents, etat.ames);
        if (ev.rejet) { rejets.push({ evenement: brut, raison: ev.rejet }); return; }
        const n = valides.length;
        valides.push(ev);
        const act = ACTIONS[ev.type];
        const repetitions = Math.min(3, historique.filter(h => h.acteur === ev.acteur && h.cible === ev.cible && h.type === ev.type).length);
        const k = MULT_GRAVITE[ev.gravite] * Math.pow(LASSITUDE, repetitions);
        // 1. La cible : son regard sur l'acteur.
        Object.entries(act.cible).forEach(([axe, v]) => changer(n, ev.cible, ev.acteur, axe, v * k * ROLE.cible, ev.gravite));
        // 2. Ce que l'acte révèle de l'acteur envers sa cible.
        const typeActeur = (etat.ames[ev.acteur] || {}).type === "heros" ? "heros" : "pnj";
        Object.entries(act.acteur || {}).forEach(([axe, v]) => changer(n, ev.acteur, ev.cible, axe, v * k * EXPRESSION[typeActeur], ev.gravite));
        // 3. Les témoins (pas pour un geste discret) : leur regard sur l'acteur, à
        //    moitié ; jamais de dette. Un témoin qui déteste la cible approuve
        //    plutôt une action hostile (un peu).
        if (!ev.discret) presents.filter(id => id !== ev.acteur && id !== ev.cible).forEach(t => {
            const versCible = etat.liens[cleLien(t, ev.cible)];
            const approuve = act.hostile && versCible && affinite(versCible.axes) <= -40;
            Object.entries(act.cible).forEach(([axe, v]) => {
                if (axe === "dette") return;
                const sens = approuve && axe !== "crainte" ? -0.6 : 1;
                changer(n, t, ev.acteur, axe, v * k * ROLE.temoin * sens, ev.gravite);
            });
        });
        // 4. Se côtoyer : un peu de familiarité, des deux côtés.
        changer(n, ev.cible, ev.acteur, "familiarite", 1, ev.gravite);
        changer(n, ev.acteur, ev.cible, "familiarite", 1, ev.gravite);
        // 5. L'humeur de la cible.
        if (act.emotion && etat.ames[ev.cible] && etat.ames[ev.cible].statut !== "mort") {
            const t = psycheValide(etat.ames[ev.cible].psyche).traits;
            const intensite = Math.min(3, ev.gravite + (t.impulsivite >= 65 ? 1 : 0));
            const h = { emotion: act.emotion, intensite, cause: ev.resume || `${act.nom} ${ev.acteur}`, jusquA: nombre(c.tour) + DUREE_HUMEUR };
            etat.ames[ev.cible].humeur = h;
            humeurs.push({ ame: ev.cible, ...h, evenement: n });
        }
        // 6. Un héros se révèle par ses actes : sa personnalité glisse, lentement.
        const acteur = etat.ames[ev.acteur];
        if (acteur && acteur.type === "heros") {
            const derive = DERIVE_TRAITS[ev.type] || {};
            Object.entries(derive).forEach(([trait, v]) => {
                const p = psycheValide(acteur.psyche);
                const avant = p.traits[trait], apres = Math.max(0, Math.min(100, avant + v * ev.gravite * 0.5));
                if (apres === avant) return;
                acteur.psyche = { ...p, traits: { ...p.traits, [trait]: apres } };
                derives.push({ ame: ev.acteur, trait, avant, apres, evenement: n });
            });
        }
        historique.push({ acteur: ev.acteur, cible: ev.cible, type: ev.type });
    });
    return { etat, evenements: valides, changements, humeurs, derives, rejets };
}
// Ce que les actes d'un héros disent de lui (points par gravité, divisés par deux).
export const DERIVE_TRAITS = {
    aider: { empathie: 1 }, soigner: { empathie: 1 }, sauver: { empathie: 1, loyaute: 1 }, defendre: { loyaute: 1 },
    tenir_promesse: { loyaute: 1 }, rompre_promesse: { loyaute: -2 }, trahir: { loyaute: -3 }, mentir: { loyaute: -1 },
    menacer: { empathie: -1, impulsivite: 1 }, attaquer: { empathie: -1, impulsivite: 1 }, humilier: { empathie: -1, orgueil: 1 },
    impressionner: { orgueil: 1 }, echanger: { sociabilite: 1 }, confier_secret: { sociabilite: 1 }, abandonner: { loyaute: -2 }
};

// -------------------------------------------------------------------------
//  LA PREMIÈRE RENCONTRE ET LES LIENS D'AVANT
// -------------------------------------------------------------------------
// Ce qu'un PNJ pense d'un héros qu'il découvre : la réputation du groupe dans le
// lieu (−10 à +10) et sa personnalité. Familiarité 5.
export function premiereImpression(psyche, reputation) {
    const t = psycheValide(psyche).traits, r = Math.max(-10, Math.min(10, nombre(reputation)));
    const axes = axesVides();
    axes.confiance = borner("confiance", r * (1 - 0.5 * t.prudence / 100) + (t.sociabilite - 50) / 10);
    axes.respect = borner("respect", r * 0.8);
    axes.attachement = borner("attachement", r * 0.5 * (0.5 + t.sociabilite / 100));
    axes.crainte = borner("crainte", r < 0 ? -r * (0.5 + t.prudence / 100) : 0);
    axes.familiarite = 5;
    return axes;
}
// Ce qu'un héros pense d'un PNJ qu'il découvre : rien encore, sinon l'avoir vu.
export const impressionHeros = () => ({ ...axesVides(), familiarite: 5 });

// Deux âmes liées avant la rencontre (« A est le patron de B ») : { ab, ba } selon le type, nuancés de ±10 %
// (le même couple donne toujours la même nuance) et par leur personnalité.
export function liensPreexistants(type, idA, idB) {
    const modele = LIENS_PREEXISTANTS[type];
    if (!modele) return null;
    const nuance = (axes, cle) => Object.fromEntries(AXES.map(a => {
        const base = nombre(axes[a]);
        return [a, borner(a, Math.round(base * (0.9 + 0.2 * graine(cle + a)) * 100) / 100)];
    }));
    // L'étiquette d'un lien « de → vers » dit ce que `vers` est pour `de` :
    // « Myrto → Koré : patron » (Koré est sa patronne).
    return { ab: nuance(modele.ab, idA + idB), ba: nuance(modele.ba, idB + idA),
             etiquetteAB: ETIQUETTE_INVERSE[type] || modele.nom, etiquetteBA: modele.nom };
}

// -------------------------------------------------------------------------
//  L'HUMEUR
// -------------------------------------------------------------------------
export function humeurActive(ame, tour) {
    const h = ame && ame.humeur;
    if (!h || !h.emotion || h.emotion === "calme") return null;
    if (nombre(h.jusquA, -1) < nombre(tour)) return null;
    return h;
}

// -------------------------------------------------------------------------
//  LES ENVIES ET LES TENSIONS (les initiatives proposées au MJ)
// -------------------------------------------------------------------------
// Parmi les PNJ présents, au plus `max` envies, les plus fortes d'abord ; un PNJ
// qui a eu son initiative au tour précédent laisse la place (`dernieres`).
export function initiatives(etat, presents, options) {
    const o = options || {}, max = o.max || 2, dernieres = new Set(o.dernieres || []);
    const ames = (etat && etat.ames) || {}, liens = (etat && etat.liens) || {};
    const ici = (presents || []).filter(id => ames[id] && ames[id].statut !== "mort");
    const nom = (id) => (ames[id] && ames[id].nom) || id;
    const envies = [];
    ici.filter(id => ames[id].type === "pnj" && !dernieres.has(id)).forEach(id => {
        const humeur = humeurActive(ames[id], o.tour);
        ici.filter(x => x !== id).forEach(autre => {
            const l = liens[cleLien(id, autre)];
            if (!l) return;
            const a = l.axes || {}, aff = affinite(a);
            if (nombre(a.dette) >= 30) envies.push({ ame: id, vers: autre, force: nombre(a.dette), texte: `${nom(id)} se sent redevable envers ${nom(autre)} et cherche à s'acquitter de sa dette.` });
            if (aff <= -45 && nombre(a.crainte) < 50) envies.push({ ame: id, vers: autre, force: -aff, texte: `${nom(id)} ne supporte pas ${nom(autre)} et pourrait lui chercher querelle.` });
            if (aff <= -30 && nombre(a.crainte) >= 50) envies.push({ ame: id, vers: autre, force: nombre(a.crainte), texte: `${nom(id)} craint ${nom(autre)} et cherche à l'éviter ou à se protéger.` });
            if (nombre(a.confiance) <= -40 && aff > -45) envies.push({ ame: id, vers: autre, force: -nombre(a.confiance) * 0.8, texte: `${nom(id)} se méfie de ${nom(autre)} et le surveille.` });
            if (nombre(a.attachement) >= 55 && humeur && ["peur", "tristesse", "honte"].includes(humeur.emotion))
                envies.push({ ame: id, vers: autre, force: nombre(a.attachement), texte: `${nom(id)}, ${NOMS_EMOTIONS[humeur.emotion]}, voudrait se confier à ${nom(autre)}.` });
        });
        const p = psycheValide(ames[id].psyche);
        p.objectifs.forEach(obj => {
            const vise = ici.find(x => x !== id && ames[x].nom && obj.toLowerCase().includes(String(ames[x].nom).toLowerCase().split(/\s+/)[0]));
            if (vise) envies.push({ ame: id, vers: vise, force: 45, texte: `${nom(id)} poursuit son but (« ${obj} ») et ${nom(vise)} est là.` });
        });
    });
    envies.sort((a, b) => b.force - a.force);
    const choisies = [], prises = new Set();
    for (const e of envies) { if (prises.has(e.ame)) continue; choisies.push(e); prises.add(e.ame); if (choisies.length >= max) break; }
    return choisies;
}
