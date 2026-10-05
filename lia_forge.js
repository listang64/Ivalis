// =========================================================================
//  LIA — L'AIDE À LA CRÉATION DE LA FORGE
// =========================================================================
//  Le joueur raconte sa technique (le geste, l'élément, ce qu'elle fait à
//  l'ennemi) et règle deux jauges indicatives : la puissance (le coût en
//  fatigue) et la rapidité (l'initiative). LIA, une IA (Gemini), lit le récit
//  et la liste COMPLÈTE des effets et sous-effets que ce héros peut forger,
//  puis répartit ses points. Elle propose ; c'est l'algorithme qui pose :
//  chaque effet passe par les règles de la Forge elle-même
//  (window.outilsForge, competences.js) — l'arme, les deux caractéristiques,
//  une seule attaque, les sous-effets incompatibles, les crans maximum, le cap
//  de fatigue. Ce qui ne passe pas est écarté ; ce qui dépasse le cap est
//  raboté cran par cran. La Forge est ensuite remplie (nom + effets), et le
//  joueur garde la main pour retoucher avant de valider.
//
//  Sans clé Gemini, ou si LIA échoue, un message clair, et la Forge reste
//  telle qu'elle était.
// =========================================================================

const NOMS_JAUGE = ["Auto", "Faible", "Modéré", "Forte"];

// Les deux types d'arme qu'un héros peut toujours forger, quelle que soit
// l'arme en main (même règle que le menu d'arme de la Forge).
const ARMES_TOUJOURS = ["Magie", "Sans arme / Arme rp"];
const ARMES_PHYSIQUES = ["Arme légère CAC", "Arme lourde CAC", "Arme polyvalente", "Arme légère Distance"];

const outils = () => window.outilsForge;

const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const sansBalises = (t) => String(t || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const borne = (n, min, max) => Math.max(min, Math.min(max, Math.round(Number(n) || 0)));

// -------------------------------------------------------------------------
//  CE QUE LE HÉROS PEUT FORGER
// -------------------------------------------------------------------------

// Les armes que ce héros peut vraiment utiliser : celles qu'il a en main,
// plus la Magie et le Sans arme / Arme rp. Fiche illisible : les quatre.
function armesPermises() {
    const enMain = outils().typesArmesEquipeesPourForge();
    return [...ARMES_PHYSIQUES.filter(a => !enMain || enMain.has(a)), ...ARMES_TOUJOURS];
}

const estEffetDeClasse = (e) => typeof window.effetReserveAUneClasse === "function"
    ? window.effetReserveAUneClasse(e.id, e) : !!e.Classe;

// Les règles qui ne parlent que d'un effet de classe ne sont dites à LIA que
// si le héros a cet effet : on ne lui souffle jamais un nom qu'elle ne peut
// pas poser.
const aEffet = (nom) => window.forgeState.effetsBDD.some(e => sansAccents(e.Nom) === sansAccents(nom));

const estRacine = (e) => e.Type_Mecanique === "Action/Global" || e.Type_Mecanique_2 === "Action/Global";

// Les menus de sous-effets où l'effet apparaît, pour cette arme (la Magie n'a
// pas de menu Physique, comme dans la Forge).
function menusSousEffet(e, arme) {
    if (e.Nom === "Durée +") return [];
    const types = ["Spatial", "Magique", "Duree"].concat(arme === "Magie" ? [] : ["Physique"]);
    return [...new Set([e.Type_Mecanique, e.Type_Mecanique_2].filter(t => types.includes(t)))];
}

// Le bouton ⏳ de la Forge : mêmes exceptions (durées figées par leur mécanique).
function dureeReglable(e, commeSousEffet) {
    const n = (e.Nom || "").toLowerCase();
    if (!(outils().parseFrenchFloat(e.Tours) > 0)) return false;
    if (n.includes("immobil") || n.includes("poison")) return false;
    return !(commeSousEffet && n.includes("persistance"));
}

function effetDureePlus() {
    return window.forgeState.effetsBDD.find(e => e.Nom === "Durée +");
}
function dureeMax() {
    const d = effetDureePlus();
    return d ? outils().getMaxStacks(d) : 1;
}

// Le cap de fatigue de la technique selon la (les) caractéristique(s) qu'elle
// mobilise : la Forge prend la moyenne des deux.
const CLES_CARACS = { "FORCE": "force", "DEXTÉRITÉ": "dex", "CONSTITUTION": "con",
                      "INTELLIGENCE": "int", "SAGESSE": "sag", "CHARISME": "cha" };
function capsParCarac() {
    const caracs = window.forgeState.caracs || {};
    const caps = {};
    Object.keys(CLES_CARACS).forEach(c => {
        caps[c] = window.capFatigueDeCarac(caracs[CLES_CARACS[c]] ?? 8, window.forgeState.statsPerso);
    });
    return caps;
}

// La liste de TOUS les effets et sous-effets accessibles à ce héros, telle que
// LIA la reçoit : ce qu'ils font, leur coût par cran, leurs crans maximum, et
// où ils peuvent se poser.
function catalogueEffets(armes) {
    const O = outils();
    return window.forgeState.effetsBDD
        .filter(e => e.Nom !== "Durée +")
        .map(e => {
            const role = [];
            if (estRacine(e)) role.push("action");
            const menus = [...new Set(armes.flatMap(a => menusSousEffet(e, a)))];
            if (menus.length) role.push("sous-effet");
            const fiche = {
                id: e.id,
                nom: O.nettoyerNomEffet(e.Nom),
                role: role.join(" + ") || "aucun",
                carac: (e.Modificateur || "AUCUN").toUpperCase(),
                fatigue_par_cran: Math.round(O.parseFrenchFloat(e.Cout_PT) * 5 * 10) / 10,
                crans_max: O.getMaxStacks(e),
                effet_par_cran: sansBalises(O.formatterTexteEffet(e, 1))
            };
            if (/\//.test(String(e.Cout_PT || ""))) {
                fiche.fatigue_par_cran = 0;
                fiche.cout_special = "ne coûte rien lui-même : divise le coût des dégâts/soins/Zone/Distance de l'action";
            }
            if (dureeReglable(e, !estRacine(e))) fiche.duree_reglable = true;
            // Un effet de classe (Ténèbres, Lumière, Vampirisme…) : il n'est dans
            // cette liste que parce que le héros l'a débloqué (effetAccessible,
            // à l'ouverture de la Forge). Sa note dit ce qu'il fait vraiment.
            if (estEffetDeClasse(e)) {
                fiche.effet_de_classe = e.Classe || (window.forgeState.statsPerso || {}).Classe || true;
                if (e.Notes) fiche.notes = sansBalises(e.Notes);
            }
            const interdites = armes.filter(a => O.estIncompatibleAvecArme(e.Nom, a));
            if (interdites.length) fiche.armes_interdites = interdites;
            if (menus.length && armes.includes("Magie") && !menusSousEffet(e, "Magie").length) fiche.sous_effet_interdit_avec = "Magie";
            return fiche;
        });
}

// -------------------------------------------------------------------------
//  LA DEMANDE À LIA
// -------------------------------------------------------------------------

function consignePuissance(cran, caps) {
    const valeurs = Object.values(caps);
    const capBas = Math.min(...valeurs), capHaut = Math.max(...valeurs);
    switch (cran) {
        case 1: return `FAIBLE : vise environ 30 % du cap de fatigue de la technique (entre ${Math.round(capBas * 0.3)} et ${Math.round(capHaut * 0.3)} selon les caractéristiques).`;
        case 2: return `MODÉRÉE : vise environ 60 % du cap (entre ${Math.round(capBas * 0.6)} et ${Math.round(capHaut * 0.6)}).`;
        case 3: return "FORTE : vise 90 à 100 % du cap, sans jamais le dépasser.";
        default: return "AUTO : juge toi-même, d'après le récit, combien la technique doit coûter (jamais plus que le cap).";
    }
}
function consigneRapidite(cran) {
    switch (cran) {
        case 1: return "LENTE : une initiative basse est acceptable ; pas d'Initiative +.";
        case 2: return "MODÉRÉE : une initiative moyenne (autour de 50 à 70).";
        case 3: return "RAPIDE : peu de points, ou de l'Initiative + pour partir tôt. Si cela contredit la puissance, à toi de trancher.";
        default: return "AUTO : juge toi-même d'après le récit.";
    }
}

function construireDemandeLIA(recit, jauges) {
    const O = outils();
    const perso = window.forgeState.statsPerso || {};
    const armes = armesPermises();
    const caps = capsParCarac();
    const dureePlus = effetDureePlus();
    const coutDuree = dureePlus ? O.parseFrenchFloat(dureePlus.Cout_PT) * 5 : 25;
    const niveau = typeof window.niveauDuPerso === "function" && typeof window.persoDocVersFront === "function"
        ? (() => { try { return window.niveauDuPerso(window.persoDocVersFront(window.forgeState.idPersonnage, perso)); } catch (e) { return null; } })()
        : null;

    const attaques = ["Attaque légère", "Attaque lourde", "Attaque Magique", "Mots de pouvoirs", "Ténèbres", "Vampirisme"]
        .filter(n => !["Ténèbres", "Vampirisme"].includes(n) || aEffet(n));
    const effetsDeClasse = window.forgeState.effetsBDD.filter(estEffetDeClasse).map(e => O.nettoyerNomEffet(e.Nom));
    const regleLumiere = aEffet("Lumière") ? "\n9. Lumière : seulement sur une action à dégâts magiques." : "";
    const regleClasse = effetsDeClasse.length
        ? `\n- Le héros a débloqué des effets de classe (${effetsDeClasse.join(", ")}) : ce sont ses signatures, utilise-les quand le récit s'y prête (lis leurs notes).`
        : "";

    const systeme = `Tu es LIA, la forgeronne de techniques de combat d'Ivalis (jeu de rôle tactique, plateau hexagonal).
Le joueur te raconte une technique. Tu la traduis en effets de jeu en répartissant des points (des « crans ») dans les effets et sous-effets disponibles, puis tu appelles l'outil forgerTechnique.

COMMENT EST FAITE UNE TECHNIQUE
- Une technique a de 1 à 4 ACTIONS (effets de rôle « action »). Chaque action peut porter des SOUS-EFFETS (rôle « sous-effet »).
- crans = combien de fois l'effet est pris. Sa fatigue = fatigue_par_cran × crans ; ce qu'il fait = effet_par_cran × crans (jusqu'à crans_max).
- Zone : crans = nombre d'hexagones touchés (le premier est gratuit). Distance : crans = portée en hexagones.
- duree = crans ⏳ ajoutés (+1 tour chacun, ${coutDuree} de fatigue chacun), seulement sur un effet marqué duree_reglable. Sinon 0.
- Fatigue totale de la technique = somme de tout. Elle ne doit JAMAIS dépasser le cap.
- Initiative = 100 − fatigue totale (+8 par cran d'Initiative +). Les états (aveuglement, brûlure, peur…) ne retardent pas la technique.

RÈGLES ABSOLUES
1. Une SEULE attaque de base par technique (${attaques.join(", ")}).
2. Deux caractéristiques différentes au plus sur toute la technique (les effets de carac AUCUN ne comptent pas).
3. L'arme est choisie parmi : ${armes.join(", ")}. Un effet dont armes_interdites contient l'arme choisie est impossible. Avec Magie, pas de sous-effet Physique.
4. Empoisonnement exige une attaque sur la technique.
5. Durée étalement dégâts : seulement sur une attaque, un soin, une Zone ou une Distance, et jamais avec Persistance terrain sur la même technique.
6. Persistance terrain : jamais sur un soin.
7. Sur une action Poussée : pas de Zone, de Persistance terrain ni d'étalement. Sur une Illusion : pas de Zone.
8. Distance : seulement avec Arme polyvalente, Arme légère Distance ou Magie — ou sur un soin.${regleLumiere}
10. N'utilise QUE des identifiants (id) de la liste fournie : aucun autre effet n'existe pour ce héros.

TON STYLE
- Reste fidèle au récit : l'élément, le geste, l'effet sur l'ennemi. N'ajoute pas d'effet que le récit ne justifie pas.
- Les jauges du joueur sont des INDICATIONS : garde ton jugement pour coller au récit.${regleClasse}
- Donne un nom de technique évocateur, en français, de 2 à 5 mots.`;

    const fichePerso = {
        classe: perso.Classe || "aucune",
        race: perso.Race || "inconnue",
        niveau: niveau || 1,
        cap_fatigue_selon_carac: caps,
        regle_du_cap: "avec deux caractéristiques, le cap est celui de leur moyenne",
        armes_en_main: [...(outils().typesArmesEquipeesPourForge() || [])],
        armes_permises: armes
    };

    const utilisateur = `RÉCIT DU JOUEUR :
"""${recit}"""

JAUGES DU JOUEUR
- Puissance (coût en fatigue) : ${consignePuissance(jauges.puissance, caps)}
- Rapidité : ${consigneRapidite(jauges.rapidite)}

LE HÉROS
${JSON.stringify(fichePerso)}

LES EFFETS DISPONIBLES (tous, actions et sous-effets)
${JSON.stringify(catalogueEffets(armes))}`;

    const outil = {
        functionDeclarations: [{
            name: "forgerTechnique",
            description: "Forge la technique décrite par le joueur : son nom, son arme, ses actions et leurs sous-effets.",
            parameters: {
                type: "OBJECT",
                properties: {
                    nom: { type: "STRING", description: "Nom de la technique, en français, 2 à 5 mots." },
                    arme: { type: "STRING", enum: armes, description: "L'arme de la technique." },
                    actions: {
                        type: "ARRAY",
                        description: "Les actions de la technique, de 1 à 4.",
                        items: {
                            type: "OBJECT",
                            properties: {
                                effet: { type: "STRING", description: "id d'un effet de rôle « action »." },
                                crans: { type: "INTEGER" },
                                duree: { type: "INTEGER", description: "crans ⏳ ajoutés, 0 sinon" },
                                sous_effets: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            effet: { type: "STRING", description: "id d'un effet de rôle « sous-effet »." },
                                            crans: { type: "INTEGER" },
                                            duree: { type: "INTEGER" }
                                        },
                                        required: ["effet", "crans"]
                                    }
                                }
                            },
                            required: ["effet", "crans"]
                        }
                    },
                    explication: { type: "STRING", description: "Une phrase : pourquoi ces effets." }
                },
                required: ["nom", "arme", "actions"]
            }
        }]
    };

    return { systeme, utilisateur, outil };
}

async function demanderALIA(recit, jauges) {
    const cle = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cle) throw new ErreurLIA("LIA a besoin d'une clé Gemini (Paramètres → clés API).");
    const { systeme, utilisateur, outil } = construireDemandeLIA(recit, jauges);
    let data;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cle}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systeme }] },
                contents: [{ role: "user", parts: [{ text: utilisateur }] }],
                tools: [outil],
                toolConfig: { functionCallingConfig: { mode: "ANY" } }
            })
        });
        data = await res.json();
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    } catch (e) {
        throw new ErreurLIA("LIA n'a pas pu être jointe (" + (e.message || e) + ").");
    }
    const appel = data.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
    if (!appel || !appel.args) throw new ErreurLIA("LIA n'a pas rendu de technique.");
    return appel.args;
}

class ErreurLIA extends Error {}

// -------------------------------------------------------------------------
//  L'ALGORITHME : ON POSE CE QUE LA FORGE ACCEPTE, ET RIEN D'AUTRE
// -------------------------------------------------------------------------

function trouverEffet(cle) {
    const effets = window.forgeState.effetsBDD;
    const brut = String(cle || "").trim();
    return effets.find(e => e.id === brut)
        || effets.find(e => sansAccents(e.Nom) === sansAccents(brut))
        || effets.find(e => sansAccents(outils().nettoyerNomEffet(e.Nom)) === sansAccents(brut))
        || null;
}

// Une forme de zone compacte et connectée, dans la grille de l'éditeur
// (rayon 2). Au corps à corps elle s'ouvre en éventail devant le lanceur ;
// à distance, c'est une tache centrée sur le point visé.
function formeZone(taille, aDistance) {
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const centre = { q: 0, r: 0 }, devant = { q: 0, r: -2 };
    const cases = [];
    for (let q = -2; q <= 2; q++) {
        for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
            if (!aDistance && q === 0 && r === 0) continue;
            cases.push({ q, r });
        }
    }
    cases.sort((a, b) => dist(a, centre) - dist(b, centre) || dist(a, devant) - dist(b, devant)
                         || a.q - b.q || a.r - b.r);
    return cases.slice(0, borne(taille, 1, 15));
}

function idInstance() {
    return "ACT_" + Math.random().toString(36).substring(2, 9);
}

// Le choix d'arme : celle de LIA si le héros peut la manier ; sinon celle qui
// garde le plus d'actions prévues (en cas d'égalité : l'arme en main d'abord).
function choisirArme(armeDemandee, racines, notes) {
    const permises = armesPermises();
    if (permises.includes(armeDemandee)) return armeDemandee;
    const O = outils();
    let meilleure = permises[0], perdues = Infinity;
    permises.forEach(a => {
        const n = racines.filter(e => O.estIncompatibleAvecArme(e.Nom, a)).length;
        if (n < perdues) { perdues = n; meilleure = a; }
    });
    if (armeDemandee) notes.push(`arme « ${armeDemandee} » impossible pour ce héros : ${meilleure}`);
    return meilleure;
}

// Retire UN cran, du plus coûteux au moins essentiel : d'abord les durées
// ajoutées, puis un cran du poste qui coûte le plus AU TOTAL (l'attaque à 25
// crans maigrit avant la brûlure à 3 : la technique garde sa forme au lieu de
// tout perdre sur un seul poste), puis un sous-effet entier, puis une action
// (jamais la première).
function raboterUnCran() {
    const fs = window.forgeState, O = outils();
    const cout = (e) => O.parseFrenchFloat(e && e.Cout_PT);

    let duree = null;
    fs.actions.forEach(act => {
        if ((act.baseDuree || 0) > 0 && (!duree || act.baseDuree > duree.n)) duree = { n: act.baseDuree, faire: () => act.baseDuree-- };
        Object.keys(act.modsDuree || {}).forEach(id => {
            const n = act.modsDuree[id] || 0;
            if (n > 0 && (!duree || n > duree.n)) duree = { n, faire: () => act.modsDuree[id]-- };
        });
    });
    if (duree) { duree.faire(); return true; }

    let compteur = null;
    const proposer = (total, n, faire) => {
        if (n > 1 && (!compteur || total > compteur.total)) compteur = { total, n, faire };
    };
    fs.actions.forEach(act => {
        proposer(cout(act.baseEffet) * act.count, act.count, () => act.count--);
        Object.keys(act.mods).forEach(id => {
            const eff = fs.effetsBDD.find(e => e.id === id);
            if (!eff || /\//.test(String(eff.Cout_PT || ""))) return;
            // La Zone : son premier hexagone est gratuit.
            const payes = eff.Nom === "Zone" ? act.mods[id] - 1 : act.mods[id];
            proposer(cout(eff) * payes, act.mods[id], () => {
                act.mods[id]--;
                if (eff.Nom === "Zone") act.zoneHexes = formeZone(act.mods[id], O.actionHasDistance(act));
            });
        });
    });
    if (compteur) { compteur.faire(); return true; }

    for (let i = fs.actions.length - 1; i >= 0; i--) {
        const act = fs.actions[i];
        const ids = Object.keys(act.mods);
        if (ids.length) {
            const id = ids.sort((a, b) => cout(fs.effetsBDD.find(e => e.id === b)) - cout(fs.effetsBDD.find(e => e.id === a)))[0];
            const eff = fs.effetsBDD.find(e => e.id === id);
            delete act.mods[id];
            if (act.modsDuree) delete act.modsDuree[id];
            if (eff && eff.Nom === "Zone") act.zoneHexes = [];
            return true;
        }
    }
    if (fs.actions.length > 1) { fs.actions.pop(); return true; }
    return false;
}

// Pose le plan de LIA dans la Forge. Rend { ok, notes, message }. Sur un
// échec, la Forge est remise exactement comme avant.
function appliquerPlanLIA(plan, recit) {
    const fs = window.forgeState, O = outils();
    const notes = [];
    const avant = { actions: fs.actions, arme: fs.armePrincipale, recit: fs.recitRP,
                    nom: (document.getElementById("forge-nom") || {}).value };
    const restaurer = (message) => {
        fs.actions = avant.actions; fs.armePrincipale = avant.arme; fs.recitRP = avant.recit;
        const champ = document.getElementById("forge-nom");
        if (champ) champ.value = avant.nom || "";
        window.rafraichirForge();
        return { ok: false, notes, message };
    };

    const prevues = (Array.isArray(plan && plan.actions) ? plan.actions : []).slice(0, 4);
    const racines = prevues.map(a => trouverEffet(a && a.effet)).filter(e => e && estRacine(e));
    const arme = choisirArme(plan && plan.arme, racines, notes);

    fs.armePrincipale = arme;
    fs.actions = [];
    const max = dureeMax();
    const aUneAttaque = () => fs.actions.some(a => O.estUneAttaqueDeBase(a.baseEffet.Nom));

    // 1) Les actions, avec les verrous du grimoire.
    const posees = [];
    prevues.forEach(pa => {
        const eff = trouverEffet(pa && pa.effet);
        if (!eff) { notes.push(`effet inconnu « ${pa && pa.effet} » écarté`); return; }
        const nom = O.nettoyerNomEffet(eff.Nom);
        if (!estRacine(eff)) { notes.push(`${nom} n'est pas une action : écarté`); return; }
        if (O.estIncompatibleAvecArme(eff.Nom, arme)) { notes.push(`${nom} impossible avec ${arme}`); return; }
        if (O.estUneAttaqueDeBase(eff.Nom) && aUneAttaque()) { notes.push(`${nom} : une seule attaque par technique`); return; }
        if ((eff.Nom || "").toLowerCase().includes("poison") && !aUneAttaque()) { notes.push(`${nom} exige une attaque`); return; }
        const act = { idInst: idInstance(), baseEffet: eff, count: borne(pa.crans, 1, O.getMaxStacks(eff)),
                      mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} };
        fs.actions.push(act);
        if (O.getActiveTags().size > 2) { fs.actions.pop(); notes.push(`${nom} : une 3e caractéristique, écarté`); return; }
        if (dureeReglable(eff, false)) act.baseDuree = borne(pa.duree, 0, max);
        posees.push({ act, plan: pa });
    });

    if (fs.actions.length === 0) return restaurer("LIA n'a proposé aucune action que ce héros puisse forger.");

    // 2) Les sous-effets, une fois toutes les actions en place (l'Empoisonnement
    //    ou l'étalement dépendent de l'attaque posée ailleurs sur la carte).
    posees.forEach(({ act, plan: pa }) => {
        (Array.isArray(pa.sous_effets) ? pa.sous_effets : []).forEach(ps => {
            const mod = trouverEffet(ps && ps.effet);
            if (!mod) { notes.push(`sous-effet inconnu « ${ps && ps.effet} » écarté`); return; }
            const nom = O.nettoyerNomEffet(mod.Nom);
            if (!menusSousEffet(mod, arme).length) { notes.push(`${nom} ne se pose pas en sous-effet ici`); return; }
            if (act.mods[mod.id]) return;
            if (O.etatSousEffet(mod, act, O.getActiveTags()) !== "ok") {
                notes.push(`${nom} incompatible avec ${O.nettoyerNomEffet(act.baseEffet.Nom)}`); return;
            }
            act.mods[mod.id] = borne(ps.crans, 1, O.getMaxStacks(mod));
            if (O.getActiveTags().size > 2) {
                delete act.mods[mod.id]; notes.push(`${nom} : une 3e caractéristique, écarté`); return;
            }
            if (dureeReglable(mod, true)) {
                const d = borne(ps.duree, 0, max);
                if (d > 0) act.modsDuree[mod.id] = d;
            }
        });
    });

    // 3) Les zones prennent forme (Distance comprise, quel que soit l'ordre).
    const formerZones = () => fs.actions.forEach(act => {
        const idZone = Object.keys(act.mods).find(id => (fs.effetsBDD.find(e => e.id === id) || {}).Nom === "Zone");
        if (idZone) {
            act.zoneHexes = formeZone(act.mods[idZone], O.actionHasDistance(act));
            act.mods[idZone] = act.zoneHexes.length;
        }
    });
    formerZones();
    O.purgerIncompatibilitesArme();
    if (fs.actions.length === 0) return restaurer("LIA n'a proposé aucune action que ce héros puisse forger.");

    // 4) Le nom, le récit, et le cap : on rabote jusqu'à tenir dessous.
    const champ = document.getElementById("forge-nom");
    if (champ) champ.value = String((plan && plan.nom) || "Technique de LIA").trim().slice(0, 40);
    fs.recitRP = recit;
    window.rafraichirForge();
    let garde = 300, rabote = 0;
    while (fs.bilan && fs.bilan.fatigue > fs.bilan.cap && garde-- > 0) {
        if (!raboterUnCran()) break;
        rabote++;
        window.rafraichirForge();
    }
    if (fs.bilan && fs.bilan.fatigue > fs.bilan.cap) {
        return restaurer("La technique de LIA dépasse le cap de fatigue de ce héros, même réduite au minimum.");
    }
    if (rabote) notes.push(`${rabote} cran(s) retiré(s) pour tenir sous le cap`);
    return { ok: true, notes, message: "" };
}

// -------------------------------------------------------------------------
//  LA FENÊTRE
// -------------------------------------------------------------------------

const el = (id) => document.getElementById(id);

window.majJaugeAideForge = function(curseur) {
    const crans = curseur.parentElement.querySelectorAll(".aide-forge-crans span");
    crans.forEach((s, i) => s.classList.toggle("actif", i === Number(curseur.value)));
};

window.ouvrirAideForge = function() {
    const fenetre = el("modale-aide-forge");
    if (!fenetre) return;
    // Un clic sur un libellé (Auto, Faible…) place le curseur sur ce cran.
    fenetre.querySelectorAll(".aide-forge-crans span").forEach((span, i) => {
        span.onclick = () => {
            const curseur = span.parentElement.parentElement.querySelector("input[type=range]");
            curseur.value = i % 4;
            window.majJaugeAideForge(curseur);
        };
    });
    el("aide-forge-recit").value = window.forgeState.recitRP || el("aide-forge-recit").value || "";
    ["aide-forge-puissance", "aide-forge-rapidite"].forEach(id => window.majJaugeAideForge(el(id)));
    afficherStatut("");
    attente(false);
    fenetre.style.display = "block";
    el("aide-forge-recit").focus();
};

window.fermerAideForge = function() {
    if (window.LIA_EN_COURS) return;
    el("modale-aide-forge").style.display = "none";
    el("modale-aide-forge-confirmer").style.display = "none";
};

function afficherStatut(texte, erreur) {
    const s = el("aide-forge-statut");
    if (!s) return;
    s.textContent = texte;
    s.classList.toggle("erreur", !!erreur);
}

function attente(oui) {
    window.LIA_EN_COURS = oui;
    const b = el("aide-forge-creer");
    if (b) { b.disabled = oui; b.textContent = oui ? "⏳ LIA forge…" : "🔨 Créer"; }
    const annuler = el("aide-forge-annuler");
    if (annuler) annuler.disabled = oui;
}

const jaugesChoisies = () => ({ puissance: Number(el("aide-forge-puissance").value) || 0,
                                rapidite: Number(el("aide-forge-rapidite").value) || 0 });

// Créer : un récit d'abord ; une Forge déjà garnie demande confirmation.
window.creerAvecLIA = function() {
    if (window.LIA_EN_COURS) return;
    const recit = el("aide-forge-recit").value.trim();
    if (recit.length < 10) { afficherStatut("Raconte ta technique en quelques phrases.", true); return; }
    if (!localStorage.getItem("ivalis_GEMINI_API_KEY")) {
        afficherStatut("LIA a besoin d'une clé Gemini (Paramètres → clés API). La Forge n'a pas été touchée.", true);
        return;
    }
    if (window.forgeState.actions.length > 0) { el("modale-aide-forge-confirmer").style.display = "block"; return; }
    lancerLIA();
};

window.confirmerRemplacementLIA = function(oui) {
    el("modale-aide-forge-confirmer").style.display = "none";
    if (oui) lancerLIA();
};

async function lancerLIA() {
    const recit = el("aide-forge-recit").value.trim();
    attente(true);
    afficherStatut("LIA lit ton récit et choisit ses effets…");
    try {
        const plan = await demanderALIA(recit, jaugesChoisies());
        const resultat = appliquerPlanLIA(plan, recit);
        attente(false);
        if (!resultat.ok) { afficherStatut(resultat.message + " La Forge n'a pas été touchée.", true); return; }
        if (resultat.notes.length) console.log("[LIA] ajustements :", resultat.notes.join(" ; "));
        el("modale-aide-forge").style.display = "none";
    } catch (e) {
        attente(false);
        console.error("[LIA]", e);
        const message = e instanceof ErreurLIA ? e.message : "LIA a rencontré une erreur.";
        afficherStatut(message + " La Forge n'a pas été touchée.", true);
    }
}

// Pour les bancs.
window.LIA = { armesPermises, catalogueEffets, construireDemandeLIA, appliquerPlanLIA, formeZone, NOMS_JAUGE };
