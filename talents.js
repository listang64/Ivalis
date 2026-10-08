// =========================================================================
//  IVALIS — LES TALENTS
// =========================================================================
//  La liste de Nico (Talents.xlsx) : 27 talents, rangés par caractéristique.
//  Un talent sans caractéristique est « Général ». Un minimum de carac (FOR 12,
//  INT 15…) en est le seul prérequis — valeur BONUS COMPRIS (race, objets).
//
//  LES POINTS (experience.js) : un point de talent aux niveaux 3, 5, 7 et 9 ;
//  plus rien ensuite. Préparer et Formé se prennent deux fois (un point
//  chacun). Un talent pris ne se retire pas — seul l'onglet DEV remet à zéro.
//
//  LE MODIFICATEUR d'une carac est celui du jeu : arrondi inférieur de
//  (carac − 10) ÷ 2, bonus compris ; négatif, il ne donne rien (0).
//
//  CE QU'UN TALENT DONNE passe par le même chemin que la race et la classe :
//  window.atoutTalents rend des atouts, que window.atoutRace (app.js) fusionne
//  avec les autres. Tout le jeu (fiche, Forge, combat) les lit donc sans
//  savoir d'où ils viennent. Les clés déjà connues (esquive, critique,
//  pvMax…) marchent telles quelles ; les nouvelles sont lues là où leur
//  mécanique se joue :
//    degatsPhysiques / degatsMagiques / degatsMotsPouvoir   dégâts plats sur
//        la carte (appliquerEquipementALaCarte, moteur_effets.js)
//    chanceElementaire / chanceEtatsCharisme / chancePoisonPhysique   chance
//        en plus sur les états de la carte (idem), au-delà du plafond
//    testsCarac { cle: n }   jets de carac au d20 (lancerJetDeCaracteristique)
//    fatigueSurKO, inertieMartiale, impactCinetique, elanPartage,
//    bouclierDesSages, degatsIllusoires, etatsRaccourcis   le noyau du combat
//        (combat_etat.js, moteur_pur.js, cerveau_combat.js)
//
//  Ce fichier est un script simple (pas un module) : les bancs le chargent
//  tel quel, comme experience.js.
// =========================================================================

(function () {
    const NIVEAUX_TALENT = [3, 5, 7, 9];

    // Les lignes de la fenêtre, dans l'ordre : Général, puis les six caracs.
    const LIGNES = [
        { cle: null,    nom: "Général",      court: "",    icone: "general" },
        { cle: "force", nom: "Force",        court: "FOR", icone: "force" },
        { cle: "dex",   nom: "Dextérité",    court: "DEX", icone: "dex" },
        { cle: "con",   nom: "Constitution", court: "CON", icone: "con" },
        { cle: "int",   nom: "Intelligence", court: "INT", icone: "int" },
        { cle: "sag",   nom: "Sagesse",      court: "SAG", icone: "sag" },
        { cle: "cha",   nom: "Charisme",     court: "CHA", icone: "cha" }
    ];
    const NOM_CARAC = Object.fromEntries(LIGNES.filter(l => l.cle).map(l => [l.cle, l.nom]));

    const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const plus = (n) => (n >= 0 ? "+" : "") + n;

    // Une main est « vide » pour le Pugiliste si elle ne tient rien, ou une bague.
    const estBague = (o) => !!o && (o.bague === true || /bague/i.test(String(o.modele || o.nom || "")));
    const estBouclier = (o) => !!o && (o.type === "Bouclier" || /bouclier/i.test(String(o.modele || o.type || "")));
    // Une main qu'une blessure rend inutilisable (blessures.js) ne tient rien.
    const utilisable = (perso, o, cote) => !(typeof window.raisonObjetInterditParBlessure === "function"
        && window.raisonObjetInterditParBlessure(perso, o, cote));
    const mains = (perso) => [[perso && perso.equipMainDroite, "droite"], [perso && perso.equipMainGauche, "gauche"]]
        .filter(([o, cote]) => o && o.nom && utilisable(perso, o, cote)).map(([o]) => o);
    const sansArme = (perso) => mains(perso).every(estBague);
    const porteBouclier = (perso) => mains(perso).some(estBouclier);
    const estVampire = (perso) => sansAccent(perso && (perso.classe || perso.Classe)) === "vampire";
    const estVargen = (perso) => sansAccent(perso && (perso.race || perso.Race)) === "vargen";

    // LES 27 TALENTS. `effet(m, perso, rangs)` rend les atouts — m(cle) est le
    // modificateur (≥ 0) ; `resume(m, perso, rangs)` dit ce qu'il donne À CE
    // HÉROS, chiffres compris (la fenêtre et l'encart de l'Aperçu).
    const TALENTS = [
        // --- GÉNÉRAL --------------------------------------------------------
        { id: "TAL_PREPARER", nom: "Préparer", carac: null, min: null, max: 2,
          texte: "+5 d'initiative de base (se prend 2 fois).",
          effet: (m, p, n) => ({ initiative: 5 * n }),
          resume: (m, p, n) => `${plus(5 * n)} d'initiative sur ses compétences` },
        { id: "TAL_FORME", nom: "Formé", carac: null, min: null, max: 2,
          texte: "+1 compétence (se prend 2 fois).",
          effet: (m, p, n) => ({ competences: n }),
          resume: (m, p, n) => `${plus(n)} compétence${n > 1 ? "s" : ""}` },
        { id: "TAL_PERFECTIONNEMENT", nom: "Perfectionnement", carac: null, min: null, max: 1, choixCarac: true,
          texte: "+2 aux tests dans une caractéristique au choix.",
          effet: (m, p, n, choix) => (choix ? { testsCarac: { [choix]: 2 } } : {}),
          resume: (m, p, n, choix) => choix ? `+2 aux tests de ${NOM_CARAC[choix] || choix}` : "+2 aux tests (carac à choisir)" },
        { id: "TAL_PUGILISTE", nom: "Pugiliste", carac: null, min: null, max: 1,
          texte: "Sans arme équipée (ou seulement des bagues) : +1 dégât physique, +5 % d'esquive. "
               + "Vampire : en plus +5 d'initiative et +2 dégâts physiques. Vargen : en plus +15 % de chance d'empoisonner et +6 % de critique.",
          effet: (m, p) => {
              if (!sansArme(p)) return {};
              const a = { degatsPhysiques: 1, esquive: 5 };
              if (estVampire(p)) { a.initiative = 5; a.degatsPhysiques += 2; }
              if (estVargen(p)) { a.chancePoisonPhysique = 15; a.critique = 6; }
              return a;
          },
          resume: (m, p) => {
              if (!sansArme(p)) return "Inactif : une arme est en main";
              const morceaux = [`+${1 + (estVampire(p) ? 2 : 0)} dégât(s) physique(s)`, "+5 % d'esquive"];
              if (estVampire(p)) morceaux.push("+5 d'initiative");
              if (estVargen(p)) morceaux.push("+15 % d'empoisonner", "+6 % de critique");
              return morceaux.join(", ");
          } },
        { id: "TAL_ADRENALINE", nom: "Adrénaline du Bourreau", carac: null, min: null, max: 1,
          texte: "Quand une attaque du personnage met un ennemi à 0 PV, il récupère aussitôt 20 points de fatigue.",
          effet: () => ({ fatigueSurKO: 20 }),
          resume: () => "+20 de fatigue à chaque ennemi abattu" },

        // --- FORCE -----------------------------------------------------------
        { id: "TAL_GUERRIER_IMPLACABLE", nom: "Guerrier implacable", carac: "force", min: null, max: 1,
          texte: "Résistance physique : +2,5 × le modificateur de Force (arrondi supérieur).",
          effet: (m) => ({ defPhysique: Math.ceil(2.5 * m("force")) }),
          resume: (m) => `${plus(Math.ceil(2.5 * m("force")))} % de résistance physique` },
        { id: "TAL_INERTIE_MARTIALE", nom: "Inertie martiale", carac: "force", min: 12, max: 1,
          texte: "Après 4 cases ou plus en ligne droite dans le tour, sa prochaine compétence de mêlée coûte 20 de fatigue en moins.",
          effet: () => ({ inertieMartiale: 20 }),
          resume: () => "−20 de fatigue sur la mêlée après 4 cases en ligne droite" },
        { id: "TAL_IMPACT_CINETIQUE", nom: "Impact cinétique", carac: "force", min: 14, max: 1,
          texte: "Une cible poussée qui percute un obstacle ou une unité subit 30 % des dégâts de la compétence en dégâts bruts ; "
               + "l'unité percutée en subit 15 % (arrondi inférieur).",
          effet: () => ({ impactCinetique: true }),
          resume: () => "Collision : 30 % des dégâts à la cible poussée, 15 % à l'unité percutée" },
        { id: "TAL_TAILLE_GUERRE", nom: "Taillé pour la guerre", carac: "force", min: 14, max: 1,
          texte: "+1 dégât physique.",
          effet: () => ({ degatsPhysiques: 1 }),
          resume: () => "+1 dégât physique" },

        // --- DEXTÉRITÉ -------------------------------------------------------
        { id: "TAL_PRECIS", nom: "Précis", carac: "dex", min: null, max: 1,
          texte: "Critique : +2 × le modificateur de Dextérité.",
          effet: (m) => ({ critique: 2 * m("dex") }),
          resume: (m) => `${plus(2 * m("dex"))} % de critique` },
        { id: "TAL_ART_ESQUIVE", nom: "Art de l'esquive", carac: "dex", min: null, max: 1,
          texte: "Esquive : +2 × le modificateur de Dextérité.",
          effet: (m) => ({ esquive: 2 * m("dex") }),
          resume: (m) => `${plus(2 * m("dex"))} % d'esquive` },

        // --- CONSTITUTION ----------------------------------------------------
        { id: "TAL_ART_PARADE", nom: "Art de la parade", carac: "con", min: null, max: 1,
          texte: "Bouclier équipé : parade +2 × le modificateur de Constitution.",
          effet: (m, p) => (porteBouclier(p) ? { parade: 2 * m("con") } : {}),
          resume: (m, p) => porteBouclier(p) ? `${plus(2 * m("con"))} % de parade` : `Inactif sans bouclier (${plus(2 * m("con"))} % de parade)` },
        // Lu par le jet de blessure (retraitsJetBlessure, blessures.js) :
        // 5 de moins sur le d50, donc une blessure moins grave.
        { id: "TAL_CHANCEUX", nom: "Chanceux", carac: "con", min: 10, max: 1,
          texte: "Réduit la gravité des blessures en combat : −5 au jet sur la table des blessures.",
          effet: () => ({}),
          resume: () => "−5 au jet de blessure" },
        { id: "TAL_MASTODONTE", nom: "Mastodonte", carac: "con", min: 12, max: 1,
          texte: "+10 PV.",
          effet: () => ({ pvMax: 10 }),
          resume: () => "+10 PV maximum" },
        { id: "TAL_IMMUNISE", nom: "Immunisé", carac: "con", min: 16, max: 1,
          texte: "Les états néfastes subis durent 1 tour de moins (un état d'un tour ne prend plus).",
          effet: () => ({ etatsRaccourcis: 1 }),
          resume: () => "États néfastes : −1 tour" },

        // --- INTELLIGENCE ----------------------------------------------------
        { id: "TAL_MAITRE_ELEMENTS", nom: "Maître des éléments", carac: "int", min: null, max: 1,
          texte: "+4 × le modificateur d'Intelligence aux chances de Brûlé, Électrifié et Glacé (au-delà du plafond).",
          effet: (m) => ({ chanceElementaire: 4 * m("int") }),
          resume: (m) => `${plus(4 * m("int"))} % de chance sur les états élémentaires` },
        { id: "TAL_ARCHIMAGE", nom: "Archimage", carac: "int", min: 14, max: 1,
          texte: "+1 dégât magique.",
          effet: () => ({ degatsMagiques: 1 }),
          resume: () => "+1 dégât magique" },
        { id: "TAL_RESERVE_ARCANIQUE", nom: "Réserve arcanique", carac: "int", min: 15, max: 1,
          texte: "+8 de fatigue max.",
          effet: () => ({ fatigueMax: 8 }),
          resume: () => "+8 de fatigue maximum" },

        // --- SAGESSE ---------------------------------------------------------
        { id: "TAL_DEFENSEUR_ARCANIQUE", nom: "Défenseur arcanique", carac: "sag", min: null, max: 1,
          texte: "Résistance magique : +2,5 × le modificateur de Sagesse (arrondi supérieur).",
          effet: (m) => ({ defMagique: Math.ceil(2.5 * m("sag")) }),
          resume: (m) => `${plus(Math.ceil(2.5 * m("sag")))} % de résistance magique` },
        { id: "TAL_BENEDICTION_DIVINE", nom: "Bénédiction divine", carac: "sag", min: null, max: 1,
          texte: "Soins reçus : +9 × le modificateur de Sagesse en %.",
          effet: (m) => ({ soinsRecus: 9 * m("sag") }),
          resume: (m) => `${plus(9 * m("sag"))} % de soins reçus` },
        { id: "TAL_ELAN_PARTAGE", nom: "Élan partagé", carac: "sag", min: 12, max: 1,
          texte: "Quand il soigne un allié, les alliés adjacents au soigneur récupèrent 8 de fatigue (une fois par compétence).",
          effet: () => ({ elanPartage: 8 }),
          resume: () => "+8 de fatigue aux alliés à son contact quand il soigne" },
        { id: "TAL_FORMATION_MEDICUS", nom: "Formation de Medicus", carac: "sag", min: 14, max: 1,
          texte: "+1 soin.",
          effet: () => ({ bonusSoin: 1 }),
          resume: () => "+1 à chacun de ses soins" },
        { id: "TAL_BOUCLIER_SAGES", nom: "Bouclier des Sages", carac: "sag", min: 15, max: 1,
          texte: "Repos long : initiative 100, et +10 % de résistances physique et magique pour le tour.",
          effet: () => ({ bouclierDesSages: 10 }),
          resume: () => "Repos long à l'initiative 100, +10 % de résistances pour le tour" },

        // --- CHARISME --------------------------------------------------------
        { id: "TAL_DIVERSION", nom: "Diversion", carac: "cha", min: null, max: 1,
          texte: "+15 × le modificateur de Charisme en % de chance d'éviter les attaques d'opportunité.",
          effet: (m) => ({ esquiveOpportunite: 15 * m("cha") }),
          resume: (m) => `${plus(15 * m("cha"))} % d'éviter une attaque d'opportunité` },
        { id: "TAL_MAITRE_ILLUSIONNISTE", nom: "Maître illusionniste", carac: "cha", min: null, max: 1,
          texte: "+3 × le modificateur de Charisme aux chances des états de Charisme (Confusion, Peur, Immobilisation).",
          effet: (m) => ({ chanceEtatsCharisme: 3 * m("cha") }),
          resume: (m) => `${plus(3 * m("cha"))} % sur Confusion, Peur et Immobilisation` },
        { id: "TAL_DEGATS_ILLUSOIRES", nom: "Dégâts illusoires", carac: "cha", min: 12, max: 1,
          texte: "Un ennemi qui détruit une de ses illusions subit 2,5 × le modificateur de Charisme en dégâts bruts (arrondi supérieur).",
          effet: (m) => ({ degatsIllusoires: Math.ceil(2.5 * m("cha")) }),
          resume: (m) => `${Math.ceil(2.5 * m("cha"))} dégâts bruts à qui brise une illusion` },
        { id: "TAL_LANGAGE_ARCANIQUE", nom: "Langage arcanique", carac: "cha", min: 14, max: 1,
          texte: "+1 dégât pour les Mots de pouvoir.",
          effet: () => ({ degatsMotsPouvoir: 1 }),
          resume: () => "+1 dégât aux Mots de pouvoir" }
    ];

    // Les états « de Charisme » que le Maître illusionniste renforce.
    const ETATS_CHARISME = ["Confusion", "Peur", "Immobilisation"];

    window.TALENTS = TALENTS;
    window.LIGNES_TALENTS = LIGNES;
    window.NIVEAUX_TALENT = NIVEAUX_TALENT;
    window.ETATS_CHARISME_TALENT = ETATS_CHARISME;
    window.talentParId = (id) => TALENTS.find(t => t.id === id) || null;

    // --- CE QUE LE HÉROS A PRIS ---------------------------------------------
    // { TAL_X: rangs } (fiche front : talents ; document : Talents).
    window.talentsDuPerso = function (perso) {
        const brut = (perso && (perso.talents || perso.Talents)) || {};
        const r = {};
        Object.keys(brut).forEach(id => { const n = parseInt(brut[id]) || 0; if (n > 0 && window.talentParId(id)) r[id] = n; });
        return r;
    };
    window.choixTalentsDuPerso = (perso) => (perso && (perso.talentsChoix || perso.Talents_Choix)) || {};
    window.niveauPourTalents = function (perso) {
        if (typeof window.niveauDuPerso === "function") return window.niveauDuPerso(perso);
        if (typeof window.niveauDepuisXP === "function") return window.niveauDepuisXP(perso && (perso.xp !== undefined ? perso.xp : perso.XP));
        return 1;
    };
    window.pointsTalentsGagnes = (niveau) => NIVEAUX_TALENT.filter(n => (Number(niveau) || 1) >= n).length;
    window.pointsTalentsDepenses = (perso) => Object.values(window.talentsDuPerso(perso)).reduce((a, b) => a + b, 0);
    window.pointsTalentsDisponibles = (perso) => Math.max(0,
        window.pointsTalentsGagnes(window.niveauPourTalents(perso)) - window.pointsTalentsDepenses(perso));

    // --- LES CARACS, BONUS COMPRIS ------------------------------------------
    // Sans passer par atoutRace (qui fusionne… les talents : on bouclerait) :
    // la base, ce que la race et la classe ajoutent, et les objets.
    window.caracsBaseDuPerso = function (perso) {
        if (!perso) return {};
        if (perso.caracs && typeof perso.caracs === "object") return perso.caracs;
        const id = perso.idPersonnage || perso.ID_Personnage || perso.id;
        const partagees = id && (window.CARACS_PARTIE || {})[id];
        if (partagees) return partagees;
        try {
            const brut = id && typeof localStorage !== "undefined" ? localStorage.getItem("ivalis_caracs_" + id) : null;
            return brut ? JSON.parse(brut) : {};
        } catch (e) { return {}; }
    };
    window.caracPourTalents = function (perso, cle) {
        const base = parseInt(window.caracsBaseDuPerso(perso)[cle]);
        const valeur = Number.isFinite(base) ? base : 8;
        const caracsAtout = (src) => ((typeof src === "function" ? src(perso) : {}) || {}).caracs || {};
        // Les blessures aussi (l'Agonie surmontée : −3 partout).
        const atouts = (parseInt(caracsAtout(window.atoutPeuple)[cle]) || 0) + (parseInt(caracsAtout(window.atoutClasse)[cle]) || 0)
            + (parseInt(caracsAtout(window.atoutBlessures)[cle]) || 0);
        const equip = typeof window.bonusEquip === "function" ? (parseInt(window.bonusEquip(perso, cle)) || 0) : 0;
        return valeur + atouts + equip;
    };
    window.caracsConnuesPourTalents = (perso) => Object.keys(window.caracsBaseDuPerso(perso)).length > 0;
    window.modPourTalents = (perso, cle) => Math.max(0, Math.floor((window.caracPourTalents(perso, cle) - 10) / 2));

    // --- PEUT-IL LE PRENDRE ? ------------------------------------------------
    // { ok, raison } — la raison s'affiche sur la case grisée.
    window.etatTalent = function (perso, id) {
        const t = window.talentParId(id);
        if (!t) return { ok: false, raison: "Talent inconnu" };
        const rangs = window.talentsDuPerso(perso)[id] || 0;
        if (t.aVenir) return { ok: false, aVenir: true, raison: "À venir", rangs };
        if (rangs >= t.max) return { ok: false, pris: true, complet: true, raison: "Déjà pris", rangs };
        if (t.min && t.carac) {
            const v = window.caracPourTalents(perso, t.carac);
            if (v < t.min) return { ok: false, verrou: true, raison: `${NOM_CARAC[t.carac]} ${t.min} requise (${v})`, rangs };
        }
        if (window.pointsTalentsDisponibles(perso) <= 0) return { ok: false, sansPoint: true, raison: "Aucun point de talent", rangs };
        return { ok: true, raison: "", rangs };
    };

    // --- CE QUE LES TALENTS DONNENT -----------------------------------------
    const fusionner = (a, b) => {
        const r = { ...a };
        Object.keys(b || {}).forEach(k => {
            const v = b[k];
            if (typeof v === "number") r[k] = (Number(r[k]) || 0) + v;
            else if (v && typeof v === "object" && !Array.isArray(v)) {
                r[k] = { ...(r[k] || {}) };
                Object.keys(v).forEach(s => { r[k][s] = (Number(r[k][s]) || 0) + (Number(v[s]) || 0); });
            } else r[k] = v;
        });
        return r;
    };
    window.atoutTalents = function (perso) {
        if (!perso || perso.estMonstre || perso.estIllusion) return {};
        const pris = window.talentsDuPerso(perso);
        const ids = Object.keys(pris);
        if (ids.length === 0) return {};
        const choix = window.choixTalentsDuPerso(perso);
        const m = (cle) => window.modPourTalents(perso, cle);
        return ids.reduce((acc, id) => {
            const t = window.talentParId(id);
            return t ? fusionner(acc, t.effet(m, perso, pris[id], choix[id]) || {}) : acc;
        }, {});
    };
    // Ce qu'un talent donne à CE héros, en toutes lettres.
    window.resumeTalent = function (perso, id) {
        const t = window.talentParId(id);
        if (!t) return "";
        const n = window.talentsDuPerso(perso)[id] || 1;
        const m = (cle) => window.modPourTalents(perso, cle);
        return t.resume(m, perso, n, window.choixTalentsDuPerso(perso)[id]);
    };
    window.libelleExigenceTalent = function (t) {
        if (!t) return "";
        if (t.carac && t.min) return `${(LIGNES.find(l => l.cle === t.carac) || {}).court} ${t.min}`;
        return "Libre";
    };
})();
