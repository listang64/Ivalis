// =========================================================================
//  IVALIS — LES APPARITIONS (v268)
// =========================================================================
//  Nico : « Revoir le système d'apparition : je te donne le tableau mis à
//  jour » — quatre apparitions (le nombre d'ennemis engagés dans le récit),
//  chacune ses cas tirés à leurs chances ; « dans Paramètres > Apparitions,
//  fais en sorte qu'on puisse modifier les tours d'apparition des renforts, et
//  changer ou non les compositions de monstres ».
//
//  CE FICHIER DIT LE TABLEAU ET LE TIRE. Il ne pose rien : monstres.js pose le
//  départ, garde les renforts en réserve et les fait entrer à leur heure
//  (entrerRenfortsPrevus), le cerveau joue les fuyards (ia_pure.js) et les
//  pièges (mouvement_pur.js).
//
//  UN CAS :
//    chance       sa part du tirage (en %, relative aux autres cas)
//    leader       qui mène : "force" (un Normal du départ), "deux" (deux
//                 Normaux du départ), "tousDepart" (tout le départ),
//                 "possibleDepart" / "possibleRenforts" / "possibleTous"
//                 (CHANCE_LEADER_COMBAT, 60 %, parmi ceux-là), "aucun"
//    releveEnLeader  la première créature, mise KO, se relève en leader
//    depart       { possibilites, regle, pvPct?, fuyard?, ancre? }
//    renforts     des vagues, chacune { possibilites, regle, … } et UNE heure :
//                   tour            elle entre au début de cette manche
//                   chaqueTours     toutes les N manches à partir de `depuis`,
//                                   `fois` fois (un nombre, ou [min, max])
//                   tantQueVivant   chaque manche tant que l'ANCRE du départ vit
//                                   (au plus `max`)
//                   surReleve       à la relève du leader
//                   quandVide       quand plus aucune créature ne tient debout
//                 et ce qu'elle fait si le terrain se vide avant son heure :
//                   siVide "avance" (elle n'attend pas) ou "annule" (elle ne
//                   vient plus : « ou que tous les monstres soient vaincus »)
//    pieges       { pct, possibilites, pvPct } : des cases piégées (Apparition 2)
//    butin        { parJoueur, xpPct } : butin et expérience changés
//
//  Les compositions : { Normal: n, Petit: p }, l'une d'elles tirée au hasard.
// =========================================================================
(function () {
    const CAC = ["TANK CAC", "DPS CAC", "DPS MAGE CAC"];
    const DISTANCE = ["DPS DISTANCE", "DPS MAGE DISTANCE"];
    const TANK = "TANK CAC", SOUTIEN = "SOUTIEN";
    const tousLesArchetypes = () => window.ARCHETYPES_MONSTRES
        || ["DPS CAC", "TANK CAC", "SOUTIEN", "DPS MAGE CAC", "DPS DISTANCE", "DPS MAGE DISTANCE"];
    const hasard = (t) => t[Math.floor(Math.random() * t.length)];
    const nombre = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const copie = (o) => JSON.parse(JSON.stringify(o));
    // Ceux d'une liste qui ont un gabarit à cette stature — la liste entière si
    // le bestiaire n'est pas encore lu (la pose le relira).
    const avecGabarit = (liste, palier) => {
        const dispo = liste.filter(a => typeof window.gabaritMonstre !== "function" || window.gabaritMonstre(a, palier));
        return dispo.length > 0 ? dispo : liste;
    };

    // Les règles d'archetype d'une vague, et ce qu'en dit la fenêtre.
    window.REGLES_ARCHETYPE = {
        premierAuContact: "la première au contact (tank, combattant ou mage), un soutien au plus",
        tank: "des tanks",
        distance: "des combattants à distance (archer, mage)",
        tankSansSoutien: "un tank, le reste au hasard, sans soutien",
        unSoutien: "un soutien, les autres au hasard",
        auPlusUnSoutien: "au hasard, un soutien au plus",
        sansSoutien: "au hasard, sans soutien",
        niTankNiSoutien: "au hasard, ni tank ni soutien",
        auHasard: "au hasard"
    };
    window.MODES_LEADER = {
        force: "un Normal du départ mène",
        deux: "deux Normaux du départ mènent",
        tousDepart: "tout le départ mène",
        possibleDepart: "leader possible au départ",
        possibleRenforts: "leader possible parmi les renforts",
        possibleTous: "leader possible parmi tous",
        aucun: "pas de leader"
    };
    // « Leader possible » : un jet par rencontre (v267).
    if (window.CHANCE_LEADER_COMBAT === undefined) window.CHANCE_LEADER_COMBAT = 60;

    const P = (normal, petit) => ({ Normal: normal || 0, Petit: petit || 0 });

    // LE TABLEAU DE NICO (v268).
    window.APPARITIONS_DEFAUT = Object.freeze({
        1: { titre: "Apparition 1", aide: "1 ennemi au départ", cas: [
            { chance: 20, nom: "Le chef se met à mener", leader: "force",
              depart: { possibilites: [P(1, 0)], regle: "premierAuContact" },
              renforts: [{ tour: 2, possibilites: [P(0, 4)], regle: "unSoutien", siVide: "avance" }] },
            { chance: 20, nom: "Celui qui ne mène pas", leader: "aucun", releveEnLeader: true,
              depart: { possibilites: [P(1, 0)], regle: "premierAuContact" },
              renforts: [{ surReleve: true, possibilites: [P(1, 2), P(2, 0), P(0, 4)], regle: "auPlusUnSoutien", siVide: "avance" }] },
            { chance: 20, nom: "La meute qui grossit", leader: "possibleTous",
              depart: { possibilites: [P(0, 1), P(1, 0)], regle: "premierAuContact" },
              renforts: [{ chaqueTours: 1, depuis: 2, fois: [5, 6], possibilites: [P(0, 1)], regle: "sansSoutien", siVide: "avance" }] },
            { chance: 20, nom: "Le chef et ses lieutenants", leader: "force",
              depart: { possibilites: [P(1, 0)], regle: "premierAuContact" },
              renforts: [{ tour: 2, possibilites: [P(1, 1)], regle: "sansSoutien", siVide: "avance" },
                         { tour: 4, possibilites: [P(1, 1)], regle: "sansSoutien", siVide: "avance" }] },
            { chance: 20, nom: "Le gardien et sa nichée", leader: "aucun",
              depart: { possibilites: [P(1, 0)], regle: "tank", ancre: true },
              renforts: [{ tantQueVivant: true, depuis: 2, max: 12, possibilites: [P(0, 1)], regle: "auHasard", siVide: "annule" }] }
        ] },
        2: { titre: "Apparition 2", aide: "2 ennemis au départ", cas: [
            { chance: 40, nom: "La patrouille", leader: "possibleRenforts",
              depart: { possibilites: [P(2, 0), P(1, 1)], regle: "tankSansSoutien" },
              renforts: [{ tour: 3, possibilites: [P(1, 1), P(0, 3)], regle: "auPlusUnSoutien", siVide: "avance" }] },
            { chance: 15, nom: "Les éclaireurs qui fuient", leader: "tousDepart",
              depart: { possibilites: [P(0, 2)], regle: "distance", fuyard: { esquiveOpportunite: 70 } },
              renforts: [{ tour: 8, finFuite: true, sansLeader: true, possibilites: [P(4, 0), P(3, 1), P(2, 2), P(0, 5)],
                           regle: "auPlusUnSoutien", siVide: "annule" }] },
            { chance: 15, nom: "Les deux murailles", leader: "possibleTous",
              depart: { possibilites: [P(2, 0)], regle: "tank" },
              renforts: [{ chaqueTours: 2, depuis: 3, fois: 5, possibilites: [P(0, 1)], regle: "niTankNiSoutien", siVide: "annule" }] },
            { chance: 15, nom: "Le terrain piégé", leader: "possibleDepart",
              depart: { possibilites: [P(2, 0)], regle: "distance", fuyard: { esquiveOpportunite: 70 } },
              renforts: [],
              pieges: { pct: 25, possibilites: [P(0, 2)], pvPct: -50 } },
            { chance: 15, nom: "Les vagues", leader: "possibleTous",
              depart: { possibilites: [P(2, 0), P(1, 1), P(0, 2)], regle: "auPlusUnSoutien" },
              renforts: [{ tour: 2, possibilites: [P(1, 1), P(0, 2)], regle: "auPlusUnSoutien", siVide: "avance" },
                         { tour: 4, possibilites: [P(1, 1), P(0, 2)], regle: "auPlusUnSoutien", siVide: "avance" }] }
        ] },
        3: { titre: "Apparition 3", aide: "3 ennemis au départ", cas: [
            { chance: 60, nom: "La bande", leader: "possibleDepart",
              depart: { possibilites: [P(3, 0), P(1, 2), P(2, 1)], regle: "auPlusUnSoutien" },
              renforts: [{ tour: 5, possibilites: [P(1, 1), P(0, 3)], regle: "auPlusUnSoutien", siVide: "avance" }] },
            { chance: 20, nom: "Les deux chefs", leader: "deux",
              depart: { possibilites: [P(3, 0), P(2, 1)], regle: "sansSoutien" },
              renforts: [] },
            { chance: 20, nom: "La horde qui revient", leader: "possibleDepart",
              depart: { possibilites: [P(3, 0), P(2, 1), P(1, 2), P(0, 3)], regle: "auHasard" },
              renforts: [{ chaqueTours: 3, depuis: 4, fois: 5, possibilites: [P(0, 1)], regle: "niTankNiSoutien", siVide: "annule" }] }
        ] },
        4: { titre: "Apparition 4 et plus", aide: "quatre ennemis ou plus au départ", cas: [
            { chance: 40, nom: "L'escouade", leader: "possibleTous",
              depart: { possibilites: [P(4, 0), P(3, 1), P(2, 2), P(0, 5)], regle: "auPlusUnSoutien" },
              renforts: [] },
            { chance: 15, nom: "La relève", leader: "possibleTous",
              depart: { possibilites: [P(0, 4)], regle: "auPlusUnSoutien" },
              renforts: [{ quandVide: true, possibilites: [P(0, 4)], regle: "auPlusUnSoutien" }] },
            { chance: 15, nom: "La cohue (5)", leader: "aucun",
              depart: { possibilites: [P(3, 2)], regle: "auPlusUnSoutien", pvPct: -25 },
              renforts: [], butin: { parJoueur: 2, xpPct: -10 } },
            { chance: 15, nom: "La cohue (6)", leader: "aucun",
              depart: { possibilites: [P(3, 3)], regle: "auPlusUnSoutien", pvPct: -40 },
              renforts: [], butin: { parJoueur: 2, xpPct: -20 } },
            { chance: 15, nom: "La cohue (7)", leader: "aucun",
              depart: { possibilites: [P(3, 4), P(2, 5), P(1, 6), P(0, 7)], regle: "auPlusUnSoutien", pvPct: -50 },
              renforts: [], butin: { parJoueur: 2, xpPct: -30 } }
        ] }
    });
    window.NUMEROS_APPARITION = [1, 2, 3, 4];

    // =====================================================================
    //  LE TABLEAU RÉGLÉ : celui de Nico, retouché dans Paramètres > Apparitions
    // =====================================================================
    //  La forme reste celle du tableau de Nico (les cas, leurs vagues, leurs
    //  mécaniques) : on n'en règle que les VALEURS — chances, tours,
    //  compositions, règles, qui mène, PV, pièges, expérience. Une valeur
    //  absente ou folle reprend celle d'origine.
    const borne = (v, min, max, d) => {
        const n = Math.round(nombre(v, NaN));
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
    };
    function compositions(brut, defaut) {
        const l = (Array.isArray(brut) ? brut : defaut).slice(0, 8)
            .map(c => P(borne(c && c.Normal, 0, 8, 0), borne(c && c.Petit, 0, 8, 0)))
            .filter(c => c.Normal + c.Petit > 0);
        return l.length > 0 ? l : copie(defaut);
    }
    function fois(brut, defaut) {
        if (Array.isArray(brut) && brut.length === 2) {
            const a = borne(brut[0], 1, 20, 1), b = borne(brut[1], 1, 20, a);
            return a === b ? a : [Math.min(a, b), Math.max(a, b)];
        }
        if (brut !== undefined && brut !== null && brut !== "") return borne(brut, 1, 20, 1);
        return copie(defaut);
    }
    function vague(brut, d) {
        const b = brut || {};
        const v = copie(d);
        v.possibilites = compositions(b.possibilites, d.possibilites);
        if (window.REGLES_ARCHETYPE[b.regle]) v.regle = b.regle;
        if (d.tour !== undefined) v.tour = borne(b.tour, 1, 30, d.tour);
        if (d.chaqueTours !== undefined) v.chaqueTours = borne(b.chaqueTours, 1, 10, d.chaqueTours);
        if (d.depuis !== undefined) v.depuis = borne(b.depuis, 1, 30, d.depuis);
        if (d.fois !== undefined) v.fois = fois(b.fois, d.fois);
        if (d.max !== undefined) v.max = borne(b.max, 1, 30, d.max);
        if (d.pvPct !== undefined || b.pvPct !== undefined) v.pvPct = borne(b.pvPct, -90, 200, d.pvPct || 0);
        if (b.siVide === "avance" || b.siVide === "annule") v.siVide = b.siVide;
        return v;
    }
    window.normaliserTableApparitions = function (brut) {
        const table = {};
        window.NUMEROS_APPARITION.forEach(n => {
            const d = window.APPARITIONS_DEFAUT[n];
            const b = (brut && brut[n]) || {};
            table[n] = { titre: d.titre, aide: d.aide, cas: d.cas.map((dc, i) => {
                const bc = (Array.isArray(b.cas) && b.cas[i]) || {};
                const c = copie(dc);
                c.chance = borne(bc.chance, 0, 100, dc.chance);
                if (window.MODES_LEADER[bc.leader]) c.leader = bc.leader;
                c.depart = vague(bc.depart, dc.depart);
                c.renforts = dc.renforts.map((dv, j) => vague(Array.isArray(bc.renforts) ? bc.renforts[j] : null, dv));
                if (dc.pieges) {
                    const bp = bc.pieges || {};
                    c.pieges = { pct: borne(bp.pct, 0, 60, dc.pieges.pct),
                                 possibilites: compositions(bp.possibilites, dc.pieges.possibilites),
                                 pvPct: borne(bp.pvPct, -90, 200, dc.pieges.pvPct) };
                }
                if (dc.butin) {
                    const bb = bc.butin || {};
                    c.butin = { ...copie(dc.butin), xpPct: borne(bb.xpPct, -100, 100, dc.butin.xpPct),
                                parJoueur: borne(bb.parJoueur, 0, 6, dc.butin.parJoueur) };
                }
                return c;
            }) };
        });
        return table;
    };
    window.APPARITIONS = window.normaliserTableApparitions(null);
    // Le réglage lu en base (Monstres_Modeles/_REGLAGES, champ Apparitions).
    window.appliquerTableApparitions = function (brut) {
        window.APPARITIONS = window.normaliserTableApparitions(brut || null);
        const hote = document.getElementById("corps-rencontres-monstres");
        if (hote && hote.offsetParent !== null && !(document.activeElement && hote.contains(document.activeElement))) {
            window.dessinerTableRencontres();
        }
        return window.APPARITIONS;
    };

    // =====================================================================
    //  LE TIRAGE
    // =====================================================================
    // Les créatures d'une vague : une composition au hasard (les Normaux
    // d'abord), puis leurs archetypes selon sa règle.
    function tirerVague(v) {
        const compo = hasard((v && v.possibilites) || [P(1, 0)]);
        const paliers = [];
        for (let i = 0; i < (compo.Normal || 0); i++) paliers.push("Normal");
        for (let i = 0; i < (compo.Petit || 0); i++) paliers.push("Petit");
        if (paliers.length === 0) return [];
        const tous = tousLesArchetypes();
        const sansSoutien = tous.filter(a => a !== SOUTIEN);
        const archetypes = new Array(paliers.length).fill(null);
        const place = Math.floor(Math.random() * paliers.length);
        const regle = v && v.regle;
        if (regle === "premierAuContact") archetypes[0] = hasard(avecGabarit(CAC, paliers[0]));
        else if (regle === "tankSansSoutien") archetypes[place] = TANK;
        else if (regle === "unSoutien") archetypes[place] = SOUTIEN;
        const permis = regle === "tank" ? [TANK]
            : regle === "distance" ? DISTANCE
            : regle === "niTankNiSoutien" ? tous.filter(a => a !== TANK && a !== SOUTIEN)
            : (regle === "sansSoutien" || regle === "tankSansSoutien" || regle === "unSoutien") ? sansSoutien
            : tous;
        const unSoutienAuPlus = regle === "auPlusUnSoutien" || regle === "premierAuContact";
        let soutienPris = archetypes.includes(SOUTIEN);
        paliers.forEach((palier, i) => {
            if (archetypes[i]) return;
            const liste = unSoutienAuPlus && soutienPris ? permis.filter(a => a !== SOUTIEN) : permis;
            archetypes[i] = hasard(avecGabarit(liste.length ? liste : sansSoutien, palier));
            if (archetypes[i] === SOUTIEN) soutienPris = true;
        });
        return paliers.map((palier, i) => ({ archetype: archetypes[i], palier }));
    }
    window.tirerVagueApparition = tirerVague;

    // Le nombre de fois d'une vague récurrente.
    const combienDeFois = (f) => Array.isArray(f) ? f[0] + Math.floor(Math.random() * (f[1] - f[0] + 1)) : nombre(f, 1);

    // Tire une apparition : `choix` vaut 1, 2, 3 ou 4 — n'importe quoi d'autre
    // (« aleatoire ») en tire une des quatre. Rend le départ, les renforts
    // avec leur heure (entreeManche, surReleve, quandVide, tantQueVivant) et
    // ce que le cas change (pièges, butin).
    window.tirerApparition = function (choix) {
        const table = window.APPARITIONS || window.normaliserTableApparitions(null);
        const choisie = window.NUMEROS_APPARITION.includes(Number(choix));
        const numero = choisie ? Number(choix) : hasard(window.NUMEROS_APPARITION);
        const def = table[numero];
        const total = def.cas.reduce((t, c) => t + Math.max(0, c.chance), 0);
        let jet = Math.random() * (total || 1);
        let indexCas = def.cas.length - 1;
        for (let i = 0; i < def.cas.length; i++) {
            if (jet < Math.max(0, def.cas[i].chance)) { indexCas = i; break; }
            jet -= Math.max(0, def.cas[i].chance);
        }
        const cas = def.cas[indexCas];

        const depart = tirerVague(cas.depart).map(m => ({
            ...m,
            ...(nombre(cas.depart.pvPct) ? { pvPct: nombre(cas.depart.pvPct) } : {}),
            ...(cas.depart.ancre ? { ancre: true } : {})
        }));
        if (cas.releveEnLeader && depart[0]) depart[0].releveEnLeader = true;

        // Les renforts, chacun son heure.
        const renforts = [];
        const finFuite = (cas.renforts.find(v => v.finFuite) || {}).tour;
        cas.renforts.forEach(v => {
            const extras = { ...(v.siVide === "annule" ? { annuleSiVide: true } : {}),
                             ...(v.sansLeader ? { sansLeader: true } : {}),
                             ...(nombre(v.pvPct) ? { pvPct: nombre(v.pvPct) } : {}) };
            const poser = (heure) => tirerVague(v).forEach(m => renforts.push({ ...m, ...heure, ...extras }));
            if (v.surReleve) poser({ surReleve: true });
            else if (v.quandVide) poser({ quandVide: true });
            else if (v.tantQueVivant) {
                for (let k = 0; k < nombre(v.max, 12); k++) poser({ entreeManche: nombre(v.depuis, 2) + k, tantQueVivant: true });
            } else if (v.chaqueTours) {
                const n = combienDeFois(v.fois);
                for (let k = 0; k < n; k++) poser({ entreeManche: nombre(v.depuis, 2) + k * nombre(v.chaqueTours, 1) });
            } else poser({ entreeManche: nombre(v.tour, 2), ...(v.finFuite ? { finFuite: true } : {}) });
        });

        // Les fuyards : jusqu'à la vague qui met fin à leur fuite, s'il y en a une.
        if (cas.depart.fuyard) depart.forEach(m => {
            m.fuyard = { esquiveOpportunite: nombre(cas.depart.fuyard.esquiveOpportunite, 70), ...(finFuite ? { jusqua: finFuite } : {}) };
        });

        // Qui mène.
        const avecLeader = Math.random() * 100 < nombre(window.CHANCE_LEADER_COMBAT, 60);
        const normauxDabord = (l) => [...l.filter(m => m.palier === "Normal"), ...l.filter(m => m.palier !== "Normal")];
        const renfortsMenables = renforts.filter(m => !m.sansLeader && !m.surReleve);
        switch (cas.leader) {
            case "force": { const c = normauxDabord(depart)[0]; if (c) c.leader = true; break; }
            case "deux": normauxDabord(depart).slice(0, 2).forEach(m => { m.leader = true; }); break;
            case "tousDepart": depart.forEach(m => { m.leader = true; }); break;
            case "possibleDepart": if (avecLeader && depart.length) hasard(depart).leader = true; break;
            case "possibleRenforts": if (avecLeader && renfortsMenables.length) hasard(renfortsMenables).leader = true; break;
            case "possibleTous": { const l = [...depart, ...renfortsMenables]; if (avecLeader && l.length) hasard(l).leader = true; break; }
            default: break;
        }

        return { apparition: numero, aleatoire: !choisie, cas: indexCas + 1, nomCas: cas.nom || "", depart, renforts,
                 ...(cas.pieges ? { pieges: copie(cas.pieges) } : {}),
                 ...(cas.butin ? { butin: copie(cas.butin) } : {}) };
    };

    // =====================================================================
    //  LA FENÊTRE : Paramètres > Outils > Apparitions, à régler
    // =====================================================================
    const PLURIELS = { Normal: "Normaux", Petit: "Petits" };
    const attr = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const champ = (chemin, valeur, opts = {}) => `<input type="number" inputmode="numeric" class="reglage-monstres-valeur apparition-champ"
        data-chemin="${chemin}" value="${valeur}" ${opts.min !== undefined ? `min="${opts.min}"` : ""} ${opts.max !== undefined ? `max="${opts.max}"` : ""}
        onchange="window.modifierApparition(this.dataset.chemin, this.value)">`;
    const choixListe = (chemin, valeur, options) => `<select class="apparition-choix" data-chemin="${chemin}"
        onchange="window.modifierApparition(this.dataset.chemin, this.value)">${Object.keys(options)
        .map(k => `<option value="${k}"${k === valeur ? " selected" : ""}>${attr(options[k])}</option>`).join("")}</select>`;
    function lesCompositions(chemin, liste) {
        return `<span class="apparition-compos">${liste.map((c, i) => `<span class="apparition-compo">
              ${champ(`${chemin}.${i}.Normal`, c.Normal, { min: 0, max: 8 })}<span class="apparition-unite">N</span>
              ${champ(`${chemin}.${i}.Petit`, c.Petit, { min: 0, max: 8 })}<span class="apparition-unite">P</span>
              ${liste.length > 1 ? `<button type="button" class="apparition-retirer" title="Retirer cette composition"
                  onclick="window.modifierApparition('${chemin}', null, { retirer: ${i} })">✕</button>` : ""}
            </span>`).join(`<em class="apparition-ou">ou</em>`)}
            <button type="button" class="apparition-ajouter" title="Ajouter une composition"
                onclick="window.modifierApparition('${chemin}', null, { ajouter: true })">＋</button></span>`;
    }
    function heureDe(chemin, v) {
        if (v.surReleve) return "À sa relève";
        if (v.quandVide) return "Quand tous sont morts";
        if (v.tantQueVivant) return `Chaque tour dès le tour ${champ(`${chemin}.depuis`, v.depuis, { min: 1, max: 30 })}, tant que le premier vit (au plus ${champ(`${chemin}.max`, v.max, { min: 1, max: 30 })})`;
        if (v.chaqueTours) {
            const f = Array.isArray(v.fois) ? v.fois : [v.fois, v.fois];
            return `Tous les ${champ(`${chemin}.chaqueTours`, v.chaqueTours, { min: 1, max: 10 })} tours dès le tour ${champ(`${chemin}.depuis`, v.depuis, { min: 1, max: 30 })},
                    ${champ(`${chemin}.fois.0`, f[0], { min: 1, max: 20 })} à ${champ(`${chemin}.fois.1`, f[1], { min: 1, max: 20 })} fois`;
        }
        return `Au tour ${champ(`${chemin}.tour`, v.tour, { min: 1, max: 30 })}`;
    }
    window.dessinerTableRencontres = function () {
        const hote = document.getElementById("corps-rencontres-monstres");
        if (!hote) return;
        const table = window.APPARITIONS || window.normaliserTableApparitions(null);
        hote.innerHTML = `<div class="apparition-note-leader">Tout se règle ici : la chance de chaque cas, qui mène, les compositions
              (N = Normaux, P = Petits ; chaque « ou » se tire au hasard) et l'heure des renforts (le tour 2 : à la fin du tour 1).
              « Leader possible » : ${window.CHANCE_LEADER_COMBAT} % de chance.
              <button type="button" class="btn-parametres apparition-retablir" onclick="window.retablirApparitions()">Rétablir le tableau de Nico</button></div>`
            + window.NUMEROS_APPARITION.map(n => {
                const def = table[n];
                const lesCas = def.cas.map((cas, i) => {
                    const c = `${n}.cas.${i}`;
                    const renforts = cas.renforts.length === 0 ? `<li>Pas de renfort.</li>`
                        : cas.renforts.map((v, j) => `<li>${heureDe(`${c}.renforts.${j}`, v)} : ${lesCompositions(`${c}.renforts.${j}.possibilites`, v.possibilites)}
                            <span class="apparition-regle">${choixListe(`${c}.renforts.${j}.regle`, v.regle, window.REGLES_ARCHETYPE)}</span>
                            ${v.siVide === "annule" ? `<span class="apparition-detail">(pas si tous sont vaincus avant)</span>` : v.surReleve || v.quandVide ? "" : `<span class="apparition-detail">(plus tôt si tous sont vaincus)</span>`}
                            ${v.finFuite ? `<span class="apparition-detail">— et les fuyards attaquent</span>` : ""}</li>`).join("");
                    const extras = [
                        cas.releveEnLeader ? `<li>Mise KO, la première se relève en <b>leader</b>, ses PV et son énergie au plein.</li>` : "",
                        cas.depart.ancre ? `<li>Le premier est l'<b>ancre</b> : ses renforts viennent tant qu'il vit.</li>` : "",
                        cas.depart.fuyard ? `<li><b>Fuyards</b> : ils fuient puis tirent (ou se reposent), ${cas.depart.fuyard.esquiveOpportunite} % d'esquive des attaques d'opportunité.</li>` : "",
                        cas.depart.pvPct !== undefined ? `<li>PV du départ : ${champ(`${c}.depart.pvPct`, cas.depart.pvPct, { min: -90, max: 200 })} %</li>` : "",
                        cas.pieges ? `<li><b>Cases piégées</b> : ${champ(`${c}.pieges.pct`, cas.pieges.pct, { min: 0, max: 60 })} % du terrain ; un héros qui y marche fait surgir ${lesCompositions(`${c}.pieges.possibilites`, cas.pieges.possibilites)} à ${champ(`${c}.pieges.pvPct`, cas.pieges.pvPct, { min: -90, max: 200 })} % de PV.</li>` : "",
                        cas.butin ? `<li><b>Butin</b> : ${champ(`${c}.butin.parJoueur`, cas.butin.parJoueur, { min: 0, max: 6 })} objet(s) au hasard par joueur ; expérience ${champ(`${c}.butin.xpPct`, cas.butin.xpPct, { min: -100, max: 100 })} %.</li>` : ""
                    ].join("");
                    return `<div class="apparition-cas" data-apparition="${n}" data-cas="${i}">
                        <div class="apparition-cas-titre">Cas ${i + 1} — ${attr(cas.nom)} ${champ(`${c}.chance`, cas.chance, { min: 0, max: 100 })} %</div>
                        <ul><li>Au départ : ${lesCompositions(`${c}.depart.possibilites`, cas.depart.possibilites)}
                              <span class="apparition-regle">${choixListe(`${c}.depart.regle`, cas.depart.regle, window.REGLES_ARCHETYPE)}</span></li>
                            <li>👑 ${choixListe(`${c}.leader`, cas.leader, window.MODES_LEADER)}</li>
                            ${extras}${renforts}</ul></div>`;
                }).join("");
                return `<div class="bloc-rencontre bloc-apparition" data-apparition="${n}">
                    <div class="reglages-monstres-entete"><span class="reglages-monstres-nom">${def.titre}</span>
                      <span class="reglages-monstres-aide">${def.aide}</span></div>${lesCas}</div>`;
            }).join("");
    };

    // Une valeur changée dans la fenêtre : le tableau réglé, relu, retenu, écrit.
    window.modifierApparition = function (chemin, valeur, action) {
        const table = copie(window.APPARITIONS || window.normaliserTableApparitions(null));
        const cles = String(chemin || "").split(".");
        let parent = table;
        for (let i = 0; i < cles.length - 1; i++) {
            if (parent[cles[i]] === undefined) return null;
            // « 5 fois » qu'on règle « de 5 à 6 fois » : le nombre devient une fourchette.
            if (typeof parent[cles[i]] === "number" && /^[01]$/.test(cles[i + 1])) parent[cles[i]] = [parent[cles[i]], parent[cles[i]]];
            parent = parent[cles[i]];
        }
        const derniere = cles[cles.length - 1];
        if (action && (action.ajouter || action.retirer !== undefined)) {
            const liste = parent[derniere];
            if (!Array.isArray(liste)) return null;
            if (action.ajouter) liste.push(P(0, 1));
            else if (liste.length > 1) liste.splice(nombre(action.retirer), 1);
        } else if (/^(regle|leader)$/.test(derniere)) {
            parent[derniere] = String(valeur);
        } else {
            parent[derniere] = Number(valeur);
        }
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        window.APPARITIONS = window.normaliserTableApparitions(table);
        window.dessinerTableRencontres();
        if (typeof window.enregistrerTableApparitions === "function") {
            Promise.resolve(window.enregistrerTableApparitions(window.APPARITIONS)).catch(e => console.error("Apparitions :", e));
        }
        return window.APPARITIONS;
    };
    window.retablirApparitions = function () {
        if (typeof window.confirm === "function" && !window.confirm("Rétablir le tableau des apparitions de Nico ? Tes réglages d'apparition seront perdus.")) return null;
        window.APPARITIONS = window.normaliserTableApparitions(null);
        window.dessinerTableRencontres();
        if (typeof window.enregistrerTableApparitions === "function") {
            Promise.resolve(window.enregistrerTableApparitions(null)).catch(e => console.error("Apparitions :", e));
        }
        return window.APPARITIONS;
    };
})();
