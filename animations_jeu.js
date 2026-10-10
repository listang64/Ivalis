// =========================================================================
//  IVALIS — LES ANIMATIONS DU STUDIO, EN JEU
// =========================================================================
//  Nico, dans le Studio d'animation : « Marche du Vargen, Bond, Repli, Pas de
//  retraite offert par l'arme, Fuite sous la Peur, Fuite sous la Confusion,
//  Hémorragie interne, Arrivée d'un combattant ou d'un renfort, Apparition
//  d'une Illusion, Déploiement des pions en début de combat : tu peux les
//  implanter en jeu. » Puis : « Marche case par case, marche en terrain
//  difficile, marche gelée, entrée dans les zones persistantes, attaque de
//  zone, attaque d'un zombie, échec de technique (Étourdi), compétence lancée
//  sur soi : c'est bon, tu peux intégrer. » Et : « Coup d'épée au corps à
//  corps, attaque légère, attaque lourde, attaque à distance, attaque magique
//  feu : tu peux implanter. »
//
//  Les gestes sont ceux du Studio (animations_catalogue.js, la section « En
//  jeu »), joués par le même moteur (animations_combat.js) ; ce fichier leur
//  donne la SCÈNE DU COMBAT — les vrais pions, la vraie grille, le calque des
//  pions — et les branche là où le combat se joue :
//
//    • un pas (jouerAnimationPas, mouvement.js) : selon sa manière — repli,
//      fuite, case offerte, foulée de Vargen, marche gelée, terrain difficile,
//      sinon la marche case par case (son petit saut, ce que coûte la case) ;
//    • une zone persistante où l'on pose le pied, une attaque de zone, la
//      griffe d'un zombie, l'échec d'un Étourdi, une carte que la Confusion
//      retourne contre son lanceur (pont_combat.js / regime_cerveau.js) ;
//    • un bond (jouerAnimationBond) — pas le Transfert, qui garde la sienne ;
//    • l'annonce du repli, une case qui saigne, un combattant qui arrive
//      (le pont du combat, pont_combat.js / regime_cerveau.js) ;
//    • un pion qui apparaît sur le plateau en début de combat
//      (appliquerTokensVTT, combat.js) : le déploiement.
//
//  Rien ici ne décide : le cerveau a tranché, le journal raconte, on montre.
// =========================================================================
(function () {
    const memeCase = (a, b) => !!a && !!b && Number(a.q) === Number(b.q) && Number(a.r) === Number(b.r);
    const pionDe = (id) => (id ? document.getElementById("token-" + id) : null);

    // --- LA SCÈNE DU COMBAT -----------------------------------------------
    //  Les pions vivent en pixels d'écran dans #conteneur-tokens-vtt, posés à
    //  VTT_POS + case × VTT_SCALE (positionnerTokenVTT, combat.js) : les
    //  effets s'y posent aussi, entre le sol et les pions comme au Studio.
    function grilleDuCombat() {
        const P = window.PLATEAU_VTT;
        if (!P || typeof P.hexToPixel !== "function") return null;
        const occupee = (q, r) => Object.keys(window.TOKENS_VTT_DATA || {}).some(id => {
            const t = window.TOKENS_VTT_DATA[id];
            return t && Number(t.q) === q && Number(t.r) === r
                && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(id));
        });
        return {
            pixel: (q, r) => {
                const px = P.hexToPixel(q, r), e = window.VTT_SCALE || 1;
                return { x: (window.VTT_POS_X || 0) + px.x * e, y: (window.VTT_POS_Y || 0) + px.y * e };
            },
            caseDe: (el) => (el && el.dataset && el.dataset.q !== undefined && el.dataset.q !== "")
                ? { q: parseFloat(el.dataset.q), r: parseFloat(el.dataset.r) } : null,
            existe: (q, r) => !((P.getCaseState && P.getCaseState(q, r)) || {}).isDeleted,
            libre: (q, r) => {
                const e = typeof window.etatCaseCombat === "function" ? window.etatCaseCombat(q, r) : ((P.getCaseState && P.getCaseState(q, r)) || {});
                return !e.isDeleted && !e.isBlocked && !occupee(q, r);
            }
        };
    }
    // Un pion qui arrive pour de bon : sa case, sans glisser (positionnerTokenVTT).
    function poserPion(el, q, r) {
        if (!el || typeof window.positionnerTokenVTT !== "function") return false;
        el.style.transition = "none";
        el.dataset.q = q;
        el.dataset.r = r;
        window.positionnerTokenVTT(el, true);
        return true;
    }
    window.sceneDeCombat = function (idLanceur, idCible, plus) {
        const lanceur = pionDe(idLanceur), calque = document.getElementById("conteneur-tokens-vtt");
        if (!lanceur || !calque || typeof window.jouerAnimationJeu !== "function") return null;
        // `grace` : le ménage d'une lecture attend que ses effets (gouttes,
        // poussière, silhouettes) aient fini de s'effacer d'eux-mêmes.
        return { lanceur, cible: pionDe(idCible), calque, grille: grilleDuCombat(), poserPion, grace: 2000, ...(plus || {}) };
    };

    // --- LES PAS --------------------------------------------------------------
    //  La manière de marcher, d'après le pas (le cerveau la porte : repli,
    //  fuite, case offerte, Glacé, terrain difficile) ou d'après le marcheur
    //  (le Vargen et son atout de race). Rien de tout ça : la marche case par
    //  case. Sans le Studio chargé : la marche d'avant (null).
    window.sortePasDeCombat = function (pas) {
        if (!pas || typeof window.jouerAnimationJeu !== "function") return null;
        if (pas.repli) return "repli";
        if (pas.fuite === "peur" || pas.fuite === "confusion") return pas.fuite;
        if (pas.offert) return "offert";
        const p = (window.PERSOS_PARTIE || []).find(x => x && x.idPersonnage === pas.idToken);
        const atout = (p && typeof window.atoutRace === "function") ? (window.atoutRace(p) || {}) : {};
        if (Number(atout.diviseurDeplacement) >= 2) return "vargen";
        if (pas.glace) return "gelee";
        if (pas.difficile) return "difficile";
        return "marche";
    };
    const ANIMATION_DU_PAS = { repli: "jeu-pas-repli", peur: "jeu-pas-peur", confusion: "jeu-pas-confusion",
                               offert: "jeu-pas-offert", vargen: "jeu-pas-vargen",
                               gelee: "jeu-pas-gelee", difficile: "jeu-pas-difficile", marche: "jeu-pas-marche" };
    // Le premier pas d'un trajet (ce qui ne se dit qu'une fois) : le pas d'avant
    // de ce pion, de la même manière, finissait-il là où celui-ci commence ?
    const derniers = {};
    function ouvreLeTrajet(id, sorte, de) {
        const d = derniers[id];
        return !(d && d.sorte === sorte && memeCase(d.vers, de) && Date.now() - d.quand < 5000);
    }
    window.animerPasDeCombat = async function (pas, sorte) {
        const scene = window.sceneDeCombat(pas.idToken, null, { de: pas.de, vers: pas.vers,
                                                               cout: Number(pas.cout) || 0, difficile: !!pas.difficile });
        if (!scene || !scene.grille || !ANIMATION_DU_PAS[sorte]) return false;
        scene.premier = ouvreLeTrajet(pas.idToken, sorte, pas.de || scene.grille.caseDe(scene.lanceur));
        await window.jouerAnimationJeu(ANIMATION_DU_PAS[sorte], scene);
        derniers[pas.idToken] = { sorte, vers: pas.vers, quand: Date.now() };
        // Quoi qu'il arrive, le pion finit sur sa case.
        const el = pionDe(pas.idToken);
        if (el && !memeCase({ q: el.dataset.q, r: el.dataset.r }, pas.vers)) poserPion(el, pas.vers.q, pas.vers.r);
        return true;
    };

    // --- LE BOND (pas le Transfert : il garde son geste) ------------------------
    window.animerBondDeCombat = async function (data) {
        if (!data || data.transfert || !data.arrivee) return false;
        const scene = window.sceneDeCombat(data.idToken, null, { de: data.depart, vers: data.arrivee });
        if (!scene || !scene.grille) return false;
        await window.jouerAnimationJeu("jeu-bond", scene);
        const el = pionDe(data.idToken);
        if (el && !memeCase({ q: el.dataset.q, r: el.dataset.r }, data.arrivee)) poserPion(el, data.arrivee.q, data.arrivee.r);
        return true;
    };

    // --- L'ANNONCE DU REPLI, UNE CASE QUI SAIGNE ---------------------------------
    window.annoncerRepliCombat = async function ({ pion, texte, couleur }) {
        const scene = window.sceneDeCombat(pion, null, { texte, couleur, grace: 1500 });
        if (scene) return window.jouerAnimationJeu("jeu-annonce-repli", scene);
        const tk = (window.TOKENS_VTT_DATA || {})[pion];
        if (tk && typeof window.afficherMessageFlottantHex === "function") window.afficherMessageFlottantHex(tk.q, tk.r, texte, couleur);
        await new Promise(r => setTimeout(r, 450));
    };
    const saignements = {};
    window.animerHemorragieCombat = async function ({ pion }) {
        const scene = window.sceneDeCombat(pion);
        if (!scene) return;
        scene.premier = !(saignements[pion] && Date.now() - saignements[pion] < 5000);
        saignements[pion] = Date.now();
        await window.jouerAnimationJeu("jeu-hemorragie", scene);
    };

    // --- UNE ZONE PERSISTANTE OÙ L'ON POSE LE PIED ----------------------------------
    //  Le cerveau dit ce qu'elle a fait (des dégâts, un état), étape par étape ;
    //  la case réagit UNE fois par entrée — au premier de ces mots —, l'état
    //  posé se dit ensuite.
    const entrees = {};
    window.animerEntreeZoneCombat = async function ({ pion, zone, etat }) {
        const el = pionDe(pion);
        if (!el || !zone) return;
        const cle = `${pion}|${zone.id}|${el.dataset.q},${el.dataset.r}`;
        const deja = entrees[cle] && Date.now() - entrees[cle] < 4000;
        entrees[cle] = Date.now();
        const scene = window.sceneDeCombat(pion, null, { type: zone.type || "neutre", etat: etat || null, deja, grace: 1500 });
        if (scene) await window.jouerAnimationJeu("jeu-entree-zone", scene);
    };

    // --- UNE ATTAQUE DE ZONE : SES CASES ROUGEOIENT, PUIS EXPLOSENT -----------------
    window.animerAttaqueZoneCombat = async function ({ pion, cases, cibles }) {
        const scene = window.sceneDeCombat(pion, null, { cases: cases || [], cibles: cibles || [], grace: 900 });
        if (scene && scene.grille && (cases || []).length) await window.jouerAnimationJeu("jeu-attaque-zone", scene);
    };

    // --- LA GRIFFE D'UN ZOMBIE --------------------------------------------------------
    //  Il titube, s'élance et griffe de trois traits pâles. Le coup lui-même
    //  (le chiffre, ou l'esquive) vient à l'étape suivante.
    window.animerAttaqueZombieCombat = async function ({ pion, cible }) {
        const scene = window.sceneDeCombat(pion, cible);
        if (scene && scene.cible) return window.jouerAnimationJeu("jeu-attaque-zombie", scene);
        if (typeof window.jouerRueeCarte === "function") return window.jouerRueeCarte({ pion, cibles: cible ? [cible] : [] });
    };

    // --- L'ÉCHEC D'UN ÉTOURDI ----------------------------------------------------------
    window.animerEchecCombat = async function ({ pion, texte, couleur }) {
        const scene = window.sceneDeCombat(pion, null, { texte, couleur, grace: 1200 });
        if (scene) return window.jouerAnimationJeu("jeu-echec-etourdi", scene);
        const tk = (window.TOKENS_VTT_DATA || {})[pion];
        if (tk && typeof window.afficherMessageFlottantHex === "function") window.afficherMessageFlottantHex(tk.q, tk.r, texte, couleur);
        await new Promise(r => setTimeout(r, 900));
    };

    // --- LA CARTE QUE LA CONFUSION RETOURNE CONTRE SON LANCEUR -------------------------
    //  Elle part vers l'ennemi le plus proche, fait demi-tour en l'air et revient
    //  le frapper (« Confus : s'inflige sa propre compétence ! » suit).
    window.animerCarteSurSoiCombat = async function ({ pion }) {
        const moi = (window.TOKENS_VTT_DATA || {})[pion];
        const fiche = (window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === pion) || {};
        const campDe = (p) => (p && (p.estMonstre ? "Ennemi" : (p.camp || "Allié")));
        let proche = null, mieux = Infinity;
        Object.keys(window.TOKENS_VTT_DATA || {}).forEach(id => {
            if (id === pion || !moi) return;
            const p = (window.PERSOS_PARTIE || []).find(x => x && x.idPersonnage === id);
            if (!p || campDe(p) === campDe(fiche)) return;
            if (typeof window.estCombattantMort === "function" && window.estCombattantMort(id)) return;
            const t = window.TOKENS_VTT_DATA[id];
            const d = (Math.abs(t.q - moi.q) + Math.abs(t.q + t.r - moi.q - moi.r) + Math.abs(t.r - moi.r)) / 2;
            if (d < mieux) { mieux = d; proche = id; }
        });
        const scene = window.sceneDeCombat(pion, proche, { grace: 1200 });
        if (scene) return window.jouerAnimationJeu("jeu-carte-sur-soi", scene);
    };

    // --- LES ATTAQUES : COUP D'ÉPÉE, LÉGÈRE, LOURDE, TIR, BOULE DE FEU ----------------
    //  Le noyau dit la manière de frapper d'une attaque physique (`frappe` :
    //  légère, lourde, sinon le coup d'épée), l'élément d'un sort, et qui est
    //  vraiment touché (`touches`) : le coup reçu (le recul, le sang, la chair)
    //  ne tombe que sur eux ; le chiffre suit, une fois, à l'étape des dégâts,
    //  l'esquive à la sienne. Un geste qui ne convient pas (un soin, un autre
    //  sort, une technique de classe, le compagnon, un journal d'avant) rend
    //  false : la ruée d'avant prend le relais.
    //  Puis (Nico : « attaque magique foudre, glace, multi-élémentaire, mots
    //  de pouvoir, lumière : tu peux intégrer ») : le sort a son geste selon
    //  son élément (Feu, Foudre, Glace) ou sa nature (`sort` : les Mots de
    //  pouvoir, plusieurs éléments, la Lumière) — au contact comme à distance.
    const GESTE_DE_FRAPPE = { legere: "jeu-attaque-legere", lourde: "jeu-attaque-lourde", epee: "jeu-coup-epee" };
    const GESTE_D_ELEMENT = { Feu: "jeu-boule-de-feu", Foudre: "jeu-attaque-foudre", Glace: "jeu-attaque-glace" };
    const GESTE_DE_SORT = { mots: "jeu-mots-de-pouvoir", multi: "jeu-attaque-multi", lumiere: "jeu-lumiere" };
    window.gesteAttaqueCombat = function ({ projectile, frappe, element, sort, carte, touches }) {
        if (!Array.isArray(touches) || /^(CLASSE_|COMPAGNON_|ZOMBIE_)/.test(String(carte || ""))) return null;
        if (sort && GESTE_DE_SORT[sort]) return GESTE_DE_SORT[sort];
        if (element && GESTE_D_ELEMENT[element]) return GESTE_D_ELEMENT[element];
        if (!projectile) return GESTE_DE_FRAPPE[frappe] || null;
        if (projectile === "fleche" && frappe) return "jeu-attaque-distance";
        return null;
    };
    // Qui vient de recevoir le coup d'un geste du Studio : son coup reçu est
    // déjà montré, l'étape des dégâts qui suit n'en remet pas un second.
    const frappesRecentes = {};
    const noterFrappe = (ids) => (ids || []).forEach(id => { if (id) frappesRecentes[id] = Date.now(); });
    const dejaFrappe = (id) => !!frappesRecentes[id] && Date.now() - frappesRecentes[id] < 4000;
    window.animerAttaqueCombat = async function (d) {
        const geste = window.gesteAttaqueCombat(d || {});
        const cibles = ((d && d.cibles) || []).filter(id => id && id !== d.pion && pionDe(id));
        if (!geste || !cibles.length) return false;
        const touchees = cibles.filter(id => d.touches.includes(id));
        const scene = window.sceneDeCombat(d.pion, cibles[0], { cibles: cibles.map(pionDe),
                                                               touchees: touchees.map(pionDe), grace: 1500 });
        if (!scene) return false;
        noterFrappe(touchees);
        await window.jouerAnimationJeu(geste, scene);
        return true;
    };

    // --- LES RÉACTIONS : CE QUI ARRIVE AU PION -------------------------------------
    //  Le pont (pont_combat.js) dit, étape par étape, ce qui arrive : un coup
    //  reçu (physique, magique, brut), une esquive ou une parade, un Contre, une
    //  Absorption, le bouclier qui encaisse, se brise ou se pose, une mise à
    //  terre, une illusion brisée, un soin (simple, de zone, étalé), une
    //  purification, une bénédiction, le repos long, la régénération et la
    //  dépense d'énergie, le coup d'opportunité, la frappe d'un mur, le coup
    //  critique annoncé. Le chiffre, lui, reste à l'étape (sa jauge).
    const GESTE_DE_REACTION = {
        "coup-physique": "jeu-coup-recu-physique", "coup-magique": "jeu-coup-recu-magique", "coup-brut": "jeu-coup-recu-brut",
        esquive: "jeu-esquive", parade: "jeu-parade", contre: "jeu-contre", absorption: "jeu-absorption",
        "bouclier-encaisse": "jeu-bouclier-encaisse", "bouclier-brise": "jeu-bouclier-brise", "bouclier-cree": "jeu-bouclier-cree",
        ko: "jeu-mise-a-terre", "illusion-brisee": "jeu-illusion-brisee",
        soin: "jeu-soin", "soin-tic": "jeu-soin-tic", "soin-zone": "jeu-soin-zone", "soin-etale": "jeu-soin-etale",
        purification: "jeu-purification", "benediction-magique": "jeu-benediction-magique",
        "benediction-physique": "jeu-benediction-physique", "benediction-offensive": "jeu-benediction-offensive",
        repos: "jeu-repos-long", regen: "jeu-regen-energie", depense: "jeu-depense-energie",
        opportunite: "jeu-attaque-opportunite", "frappe-mur": "jeu-frappe-mur", critique: "jeu-critique"
    };
    window.animerReactionCombat = async function (d) {
        const geste = d && GESTE_DE_REACTION[d.sorte];
        if (!geste || typeof window.jouerAnimationJeu !== "function" || !pionDe(d.pion)) return false;
        // Le coup reçu d'un geste d'attaque du Studio est déjà montré : fait.
        if (/^coup-/.test(d.sorte) && dejaFrappe(d.pion)) return true;
        const plus = { grace: 1500, sorte: d.sorte };
        if (d.caseDepuis) plus.caseDepuis = d.caseDepuis;
        if (d.texte) plus.texte = d.texte;
        if (d.mur) plus.mur = d.mur;
        if (Array.isArray(d.cases)) plus.cases = d.cases;
        if (Array.isArray(d.cibles)) plus.cibles = d.cibles.map(pionDe).filter(Boolean);
        if (d.max !== undefined) Object.assign(plus, { de: d.de, vers: d.vers, max: d.max });
        const scene = window.sceneDeCombat(d.pion, d.depuis && pionDe(d.depuis) ? d.depuis : null, plus);
        if (!scene) return false;
        // Le coup d'opportunité porte : la cible a reçu son coup.
        if (d.sorte === "opportunite" && d.depuis) noterFrappe([d.depuis]);
        await window.jouerAnimationJeu(geste, scene);
        return true;
    };

    // --- UN PION QUI ENTRE EN SCÈNE ------------------------------------------------
    //  Le vrai pion reste caché (.pion-en-entree, reposée par appliquerTokensVTT
    //  à chaque redessin) pendant que sa copie fait l'entrée ; il réapparaît
    //  dessous à la fin. Un redessin du plateau en pleine entrée ne coupe donc
    //  rien.
    window.PIONS_EN_ENTREE = window.PIONS_EN_ENTREE || {};
    const ANIMATION_D_ENTREE = { renfort: "jeu-arrivee-renfort", illusion: "jeu-apparition-illusion", deploiement: "jeu-deploiement" };
    function montrer(id) {
        delete window.PIONS_EN_ENTREE[id];
        const el = pionDe(id);
        if (el) el.classList.remove("pion-en-entree");
    }
    function entrer(id, sorte, plus) {
        const el = pionDe(id);
        // Pas de grâce ici : la copie doit partir dès que le vrai pion est revenu.
        const scene = el ? window.sceneDeCombat(id, null, { montrer: () => montrer(id), grace: 250, ...(plus || {}) }) : null;
        if (!scene) { montrer(id); return Promise.resolve(false); }
        window.PIONS_EN_ENTREE[id] = true;
        el.classList.add("pion-en-entree");
        // Un filet : une entrée qui ne finirait jamais rendrait le pion invisible pour de bon.
        const filet = setTimeout(() => montrer(id), 6000 + ((plus && plus.retard) || 0));
        return window.jouerAnimationJeu(ANIMATION_D_ENTREE[sorte], scene)
            .finally(() => { clearTimeout(filet); montrer(id); });
    }
    // L'ARRIVÉE, annoncée par le journal (un renfort, une illusion). Son pion est
    // souvent dessiné juste APRÈS l'étape (l'état descend ensuite) : on la note,
    // et appliquerTokensVTT la lance quand il paraît.
    const arrivees = {};
    window.annoncerArriveeCombat = async function ({ pion, illusion }) {
        if (!pion) return;
        const sorte = illusion ? "illusion" : "renfort";
        if (pionDe(pion)) { entrer(pion, sorte); return; }
        arrivees[pion] = { sorte, quand: Date.now() };
        window.PIONS_EN_ENTREE[pion] = true;
        setTimeout(() => { if (arrivees[pion]) { delete arrivees[pion]; montrer(pion); } }, 10000);
    };

    // LE DÉPLOIEMENT EN DÉBUT DE COMBAT : un pion qui paraît sur le plateau avant
    // que la première manche ne se joue (les héros autour de leur repère, les
    // créatures de la rencontre, le compagnon du Pisteur) y descend. Pas au
    // chargement de la page (tout y paraît d'un coup), pas en plein combat (un
    // renfort a son entrée à lui).
    const DEBUT_PAGE = Date.now();
    let connus = null;
    const auDebutDuCombat = () => {
        const partie = window.PARTIE_DATA || {};
        return (Number(partie.Tour_Combat) || 1) <= 1 && (partie.Phase_Combat || "Preparation") === "Preparation";
    };
    const estAllie = (id) => {
        const p = (window.PERSOS_PARTIE || []).find(x => x && x.idPersonnage === id);
        return !!p && !p.estMonstre && (p.camp || "Allié") !== "Ennemi";
    };
    window.animerNouveauxPions = function (ids) {
        const avant = connus;
        connus = new Set(ids || []);
        // Les arrivées annoncées par le journal, enfin dessinées.
        (ids || []).forEach(id => {
            const a = arrivees[id];
            if (!a) return;
            delete arrivees[id];
            entrer(id, a.sorte);
        });
        if (!avant || Date.now() - DEBUT_PAGE < (window.DELAI_DEPLOIEMENT_MS === undefined ? 6000 : window.DELAI_DEPLOIEMENT_MS)) return;
        if (!auDebutDuCombat()) return;
        const nouveaux = (ids || []).filter(id => !avant.has(id) && !window.PIONS_EN_ENTREE[id]);
        nouveaux.forEach((id, i) => entrer(id, "deploiement", { retard: i * 140, allie: estAllie(id), sonne: i === 0, texte: i === 0 }));
    };
})();
