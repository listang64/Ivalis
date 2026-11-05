// =========================================================================
//  IVALIS — LES DÉPENSES DU MJ (v293)
// =========================================================================
//  Nico : « dans paramètre outils j'aimerais un bouton pour voir toutes les
//  dépenses à chaque réponse de mon IA MJ : le nombre de tokens envoyés, et
//  si possible le coût en euros de cet envoi ».
//
//  Chaque tour du MJ (ia_master.js, declencherTourIA) ouvre un relevé :
//  - le narrateur note lui-même ses tokens (sa réponse arrive en flux) ;
//  - les IA d'appoint du tour (MIA_CASTING, Mia, bâtiments, PNJ, réputation…)
//    sont relevées au passage, sur la réponse de Gemini (`usageMetadata`) ;
//  - les images (portraits, bâtiments) sont comptées sur leur demande à
//    OpenAI (qualité, taille).
//  Les appels des IA du combat ne comptent pas : ce ne sont pas des dépenses
//  du MJ. (v305 : elles partagent la clé du Narrateur depuis la v304 ; c'est
//  l'usage « combat », porté par la requête de fetchGemini, qui les écarte —
//  la seconde clé reste écartée aussi.)
//
//  Le coût est calculé aux tarifs publiés (dollars par million de tokens,
//  la réflexion facturée comme la sortie), puis converti en euros au taux du
//  jour de la BCE (api.frankfurter.dev), relevé au moment du tour.
//
//  LE MÊME COMPTEUR POUR TOUT LE MONDE (v294). Nico : « il faut que les coûts
//  soient pour tout le monde peu importe qui clique sur MJ ». Chaque tour est
//  rangé dans Firestore (Depenses_MJ, avec qui l'a lancé) et ajouté au
//  compteur commun (Depenses_MJ_Compteur/global) ; la fenêtre lit les deux.
//  Le dépôt Firestore est fourni par ia_master.js (DEPOT_DEPENSES_MJ). Un
//  tour qui n'a pas pu être rangé attend sur l'appareil et repart au suivant.
//  Script simple (pas un module) : chargé avant tous les modules.
// =========================================================================
(function () {
    const CLE_ATTENTE = "ivalis_DEPENSES_MJ_ATTENTE";  // tours pas encore rangés dans Firestore
    const CLE_TAUX = "ivalis_TAUX_USD_EUR";
    const MAX_LIGNES = 300;                 // lignes affichées (les plus récentes)
    const TAUX_SECOURS = 0.87;              // si la BCE ne répond pas
    const FRAICHEUR_TAUX_MS = 12 * 3600 * 1000;

    // LES TARIFS ($ par million de tokens), relevés le 01/11/2026 sur les
    // pages de Google. Une période sans `jusqua` vaut ensuite.
    const TARIFS_GEMINI = [
        { motif: /^gemini-3\.8-flash/, periodes: [{ jusqua: "2026-12-31", entree: 0.75, sortie: 3.75 }, { entree: 1.50, sortie: 7.50 }] },
        { motif: /^gemini-4-argon/,    periodes: [{ jusqua: "2026-11-30", entree: 2.00, sortie: 10.00 }, { entree: 4.00, sortie: 20.00 }] },
        { motif: /flash-lite/,         periodes: [{ entree: 0.30, sortie: 2.50 }] }
    ];
    // LES IMAGES D'OPENAI (v318, relevé le 05/11/2026). Nico : « le coût en
    // euros n'est pas tout à fait juste, je paie un peu plus ; mets-moi les coûts
    // des images ». gpt-image est facturé en tokens : le texte envoyé (5 $ le
    // million), les images jointes en référence (8 $), l'image produite (30 $).
    // La réponse d'OpenAI dit ses tokens (usage) : c'est elle qui compte. Sans
    // usage, la grille d'OpenAI (prix d'une image produite, par qualité et par
    // format) plus une estimation des références jointes.
    const TARIFS_IMAGE = {
        "gpt-image-2":   { texte: 5, imageEntree: 8,  imageSortie: 30 },
        "gpt-image-1.5": { texte: 5, imageEntree: 8,  imageSortie: 32 },
        "gpt-image-1":   { texte: 5, imageEntree: 10, imageSortie: 40 }
    };
    const GRILLE_IMAGE = {
        "1024x1024": { low: 0.006, medium: 0.053, high: 0.211 },
        "1024x1536": { low: 0.005, medium: 0.041, high: 0.165 },
        "1536x1024": { low: 0.005, medium: 0.041, high: 0.165 }
    };
    const TOKENS_PAR_REFERENCE = 1600;   // une image jointe (fidélité haute), estimation
    // LA TVA (v318) : les factures de Google et d'OpenAI d'un particulier en
    // France portent 20 % de TVA ; une case dans la fenêtre l'ajoute (cochée).
    const CLE_TVA = "ivalis_DEPENSES_TVA";
    window.tvaDepenses = () => { try { return localStorage.getItem(CLE_TVA) === "non" ? 0 : 0.20; } catch (e) { return 0.20; } };
    window.basculerTvaDepenses = (avec) => { try { localStorage.setItem(CLE_TVA, avec ? "oui" : "non"); } catch (e) {} window.afficherDepensesMJ && window.afficherDepensesMJ(); };

    const jour = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);

    window.tarifGemini = function (modele, date) {
        const fiche = TARIFS_GEMINI.find(t => t.motif.test(String(modele || "")));
        if (!fiche) return null;
        const j = jour(date);
        return fiche.periodes.find(p => !p.jusqua || j <= p.jusqua) || fiche.periodes[fiche.periodes.length - 1];
    };

    // Les tokens d'une réponse de Gemini : envoyés (la consigne et
    // l'historique), reçus (le texte), réflexion (facturée comme reçue).
    const lireUsage = (u) => ({
        envoyes: Number((u && u.promptTokenCount) || 0),
        recus: Number((u && u.candidatesTokenCount) || 0),
        reflexion: Number((u && u.thoughtsTokenCount) || 0),
        cache: Number((u && u.cachedContentTokenCount) || 0)
    });

    // (v318) Les tokens déjà en cache chez Google coûtent 10 % du prix d'entrée.
    window.coutGeminiUSD = function (modele, usage, date) {
        const t = window.tarifGemini(modele, date);
        if (!t) return null;
        const u = usage && "envoyes" in usage ? usage : lireUsage(usage);
        const cache = Math.min(u.cache || 0, u.envoyes);
        return ((u.envoyes - cache) * t.entree + cache * t.entree * 0.1 + (u.recus + u.reflexion) * t.sortie) / 1e6;
    };

    // Une image : `usage` (la réponse d'OpenAI) si on l'a ; sinon la grille, et
    // les références jointes estimées.
    window.coutImageUSD = function (qualite, taille, modele, usage, references) {
        const tarif = TARIFS_IMAGE[String(modele || "").replace(/-\d{4}-\d{2}-\d{2}$/, "")] || TARIFS_IMAGE["gpt-image-2"];
        if (usage && (usage.input_tokens != null || usage.output_tokens != null)) {
            const d = usage.input_tokens_details || {};
            const imagesIn = Number(d.image_tokens || 0);
            const texteIn = d.text_tokens != null ? Number(d.text_tokens) : Math.max(0, Number(usage.input_tokens || 0) - imagesIn);
            return (texteIn * tarif.texte + imagesIn * tarif.imageEntree + Number(usage.output_tokens || 0) * tarif.imageSortie) / 1e6;
        }
        // (un format hors de la grille suit son orientation : portrait, paysage, carré)
        const format = String(taille || "1024x1024").replace(/\s/g, "");
        const [w, h] = (format.match(/(\d+)x(\d+)/) || [0, 1024, 1024]).slice(1).map(Number);
        const grille = GRILLE_IMAGE[format] || GRILLE_IMAGE[h > w ? "1024x1536" : w > h ? "1536x1024" : "1024x1024"];
        const base = grille[qualite] != null ? grille[qualite] : grille.medium;
        return base + (Number(references) || 0) * TOKENS_PAR_REFERENCE * tarif.imageEntree / 1e6 + 400 * tarif.texte / 1e6;
    };

    // ---------------------------------------------------------------------
    //  LE TAUX DU DOLLAR EN EUROS (BCE)
    // ---------------------------------------------------------------------
    const lireTaux = () => {
        try { const t = JSON.parse(localStorage.getItem(CLE_TAUX) || "null"); if (t && t.taux > 0) return t; } catch (e) {}
        return null;
    };
    window.tauxDollarEuro = function () {
        const t = lireTaux();
        return t ? t : { taux: TAUX_SECOURS, date: "", secours: true };
    };
    let rafraichissement = null;
    window.rafraichirTauxDollarEuro = function (force) {
        const t = lireTaux();
        if (!force && t && Date.now() - (t.releve || 0) < FRAICHEUR_TAUX_MS) return Promise.resolve(t);
        if (rafraichissement) return rafraichissement;
        rafraichissement = vraiFetch("https://api.frankfurter.dev/v2/rate/USD/EUR")
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && Number(d.rate) > 0) {
                    const nouveau = { taux: Number(d.rate), date: d.date || jour(), releve: Date.now() };
                    try { localStorage.setItem(CLE_TAUX, JSON.stringify(nouveau)); } catch (e) {}
                    return nouveau;
                }
                return window.tauxDollarEuro();
            })
            .catch(() => window.tauxDollarEuro())
            .finally(() => { rafraichissement = null; });
        return rafraichissement;
    };

    // ---------------------------------------------------------------------
    //  LES RELEVÉS
    // ---------------------------------------------------------------------
    const lireAttente = () => { try { const l = JSON.parse(localStorage.getItem(CLE_ATTENTE) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
    const ecrireAttente = (l) => { try { localStorage.setItem(CLE_ATTENTE, JSON.stringify(l.slice(-MAX_LIGNES))); } catch (e) {} };
    const depot = () => window.DEPOT_DEPENSES_MJ || null;

    // Range un tour (et ceux restés en attente) dans Firestore.
    async function ranger(ligne) {
        const aRanger = [...lireAttente(), ...(ligne ? [ligne] : [])];
        if (!aRanger.length) return;
        const restants = [];
        for (const l of aRanger) {
            try { if (!depot()) throw new Error("dépôt absent"); await depot().ecrire(l); }
            catch (e) { console.warn("[Dépenses] Tour gardé sur l'appareil, il repartira au prochain :", e && e.message || e); restants.push(l); }
        }
        ecrireAttente(restants);
    }

    // Les dépenses de tout le monde : les lignes les plus récentes et le
    // compteur commun. Sans Firestore, ce qui attend sur l'appareil.
    window.lireDepensesMJ = async function () {
        const attente = lireAttente();
        try {
            if (!depot()) throw new Error("dépôt absent");
            const { lignes, compteur } = await depot().lire(MAX_LIGNES);
            const ids = new Set(lignes.map(l => l.id));
            const toutes = [...lignes, ...attente.filter(l => !ids.has(l.id))].sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
            return { lignes: toutes, compteur, commun: true };
        } catch (e) {
            console.warn("[Dépenses] Lecture du compteur commun impossible :", e && e.message || e);
            return { lignes: attente, compteur: null, commun: false };
        }
    };

    const ouverts = [];
    let compteur = 0;
    // (v318) HORS DES TOURS DU MJ : les images (avatars, pions, cartes du combat,
    // croquis, portraits) et les IA (combat, illustrateur…) qui travaillent en
    // dehors d'un tour se rangent dans un relevé « hors MJ », refermé après une
    // minute et demie de calme.
    let horsTour = null;
    const CALME_HORS_TOUR_MS = 90 * 1000;
    function releveHorsTour() {
        if (!horsTour) {
            horsTour = { id: "H" + Date.now() + "_" + (++compteur), debut: Date.now(), modele: "", reflexion: "", horsTour: true,
                         narrateur: [], aides: [], combat: [], images: [], enAttente: [] };
        }
        clearTimeout(horsTour.minuteur);
        const r = horsTour;
        r.minuteur = setTimeout(() => { if (horsTour === r) horsTour = null; window.DEPENSES_IA.finTour(r, {}, true); }, CALME_HORS_TOUR_MS);
        return r;
    }
    window.DEPENSES_HORS_TOUR = { ouvert: () => horsTour, fermer: () => { const r = horsTour; horsTour = null; if (r) { clearTimeout(r.minuteur); return window.DEPENSES_IA.finTour(r, {}, true); } return null; } };
    const cleCombat = () => {
        try {
            const c1 = (localStorage.getItem("ivalis_GEMINI_API_KEY") || "").trim(), c2 = (localStorage.getItem("ivalis_GEMINI_API_KEY_2") || "").trim();
            return c2 && c2 !== c1 ? c2 : "";
        } catch (e) { return ""; }
    };

    window.DEPENSES_IA = {
        // Un tour commence : `info.modele`, `info.reflexion` (les réglages du narrateur).
        debutTour(info) {
            const releve = { id: "T" + Date.now() + "_" + (++compteur), debut: Date.now(), modele: (info && info.modele) || "", reflexion: (info && info.reflexion) || "",
                             narrateur: [], aides: [], combat: [], images: [], enAttente: [] };
            ouverts.push(releve);
            window.rafraichirTauxDollarEuro();
            // Un tour qui ne se referme jamais (erreur) se referme seul.
            releve.minuteur = setTimeout(() => window.DEPENSES_IA.finTour(releve), 4 * 60 * 1000);
            return releve;
        },
        // Le narrateur note sa réponse (son usage arrive avec le dernier morceau du flux).
        noterNarrateur(releve, modele, usage) {
            const r = releve || ouverts[ouverts.length - 1];
            if (r && usage) r.narrateur.push({ modele, ...lireUsage(usage) });
        },
        // Le tour est fini (IA d'arrière-plan comprises) : le relevé est rangé.
        async finTour(releve, extra, horsDuTour) {
            const i = ouverts.indexOf(releve);
            if (i < 0 && !horsDuTour) return null;
            if (i >= 0) ouverts.splice(i, 1);
            clearTimeout(releve.minuteur);
            await Promise.allSettled(releve.enAttente);
            const date = new Date(releve.debut);
            const somme = (liste) => liste.reduce((a, x) => {
                const cout = window.coutGeminiUSD(x.modele, x, date);
                a.envoyes += x.envoyes; a.recus += x.recus; a.reflexion += x.reflexion; a.cache += x.cache; a.appels++;
                if (cout == null) a.inconnus.push(x.modele); else a.coutUSD += cout;
                return a;
            }, { appels: 0, envoyes: 0, recus: 0, reflexion: 0, cache: 0, coutUSD: 0, inconnus: [] });
            const narrateur = somme(releve.narrateur), aides = somme(releve.aides), combat = somme(releve.combat || []);
            const images = { nombre: releve.images.length, coutUSD: releve.images.reduce((a, x) => a + x.coutUSD, 0),
                             detail: releve.images.map(x => `${x.quoi ? x.quoi + " " : ""}${x.qualite} ${x.taille}${x.exact ? "" : " ~"}`) };
            if (!narrateur.appels && !aides.appels && !combat.appels && !images.nombre) return null;
            const taux = await window.rafraichirTauxDollarEuro();
            const totalUSD = narrateur.coutUSD + aides.coutUSD + combat.coutUSD + images.coutUSD;
            const compte = window.COMPTE_JOUEUR || {};
            let joueur = "";
            try { joueur = localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) {}
            const ligne = {
                id: releve.id, date: date.toISOString(), Timestamp: releve.debut, modele: releve.modele, reflexion: releve.reflexion,
                ID_Partie: window.ID_PARTIE_COURANTE || "", lancePar: compte.nom || joueur || "?",
                extrait: String((extra && extra.extrait) || "").replace(/\s+/g, " ").trim().slice(0, 90),
                narrateur, aides, combat, images, totalUSD, taux: taux.taux, tauxDate: taux.date || "", tauxSecours: !!taux.secours,
                ...(releve.horsTour ? { horsTour: true } : {}),
                totalEUR: totalUSD * taux.taux
            };
            await ranger(ligne);
            console.log(`[Dépenses] ${releve.horsTour ? "Hors MJ" : "Tour du MJ"} : ${narrateur.envoyes + aides.envoyes + combat.envoyes} tokens envoyés, ${images.nombre} image(s), ${(ligne.totalEUR).toFixed(4)} € HT.`);
            if (document.getElementById("etape-depenses-mj")?.style.display === "block") window.afficherDepensesMJ();
            return ligne;
        },
        releveOuvert: () => ouverts[ouverts.length - 1] || null
    };

    // ---------------------------------------------------------------------
    //  LE RELEVÉ AU PASSAGE : les réponses de Gemini et les demandes d'images
    //  faites pendant un tour ouvert.
    // ---------------------------------------------------------------------
    const vraiFetch = window.fetch.bind(window);
    const lireOptionsImage = (options) => {
        const b = options && options.body;
        try {
            if (typeof b === "string") { const j = JSON.parse(b); return { qualite: j.quality || "medium", taille: j.size || "1024x1024", modele: j.model || "", references: 0 }; }
            if (b && typeof b.get === "function") return { qualite: b.get("quality") || "medium", taille: b.get("size") || "1024x1024", modele: b.get("model") || "",
                references: typeof b.getAll === "function" ? (b.getAll("image[]").length || b.getAll("image").length) : 0 };
        } catch (e) {}
        return { qualite: "medium", taille: "1024x1024", modele: "", references: 0 };
    };
    // (v318) Tout compte : pendant un tour du MJ, dans son relevé (les IA du
    // combat à part) ; en dehors, dans le relevé « hors MJ ».
    window.fetch = async function (entree, options) {
        const reponse = await vraiFetch(entree, options);
        try {
            const url = typeof entree === "string" ? entree : (entree && entree.url) || "";
            const gemini = /generativelanguage\.googleapis\.com\/.*:generateContent/.test(url);
            const image = /api\.openai\.com\/v1\/images\//.test(url);
            if ((gemini || image) && reponse && reponse.ok) {
                const releve = ouverts[ouverts.length - 1] || releveHorsTour();
                if (gemini) {
                    const cle = (url.match(/[?&]key=([^&]+)/) || [])[1] || "";
                    const combat = cleCombat();
                    const duCombat = (options && options.ivalisUsage === "combat") || (combat && decodeURIComponent(cle) === combat);
                    const modele = (url.match(/models\/([^:]+):/) || [])[1] || "";
                    releve.enAttente.push(reponse.clone().json().then(d => {
                        if (d && d.usageMetadata) (duCombat ? releve.combat : releve.aides).push({ modele, ...lireUsage(d.usageMetadata) });
                    }).catch(() => {}));
                } else {
                    const { qualite, taille, modele, references } = lireOptionsImage(options);
                    const ligne = { qualite, taille, modele, coutUSD: window.coutImageUSD(qualite, taille, modele, null, references), exact: false };
                    releve.images.push(ligne);
                    // La réponse dit ses tokens : le coût exact remplace l'estimation.
                    releve.enAttente.push(reponse.clone().json().then(d => {
                        if (d && d.usage) { ligne.coutUSD = window.coutImageUSD(qualite, taille, modele, d.usage); ligne.exact = true; }
                    }).catch(() => {}));
                }
            }
        } catch (e) {}
        return reponse;
    };

    // ---------------------------------------------------------------------
    //  LA FENÊTRE (Paramètres > Outils > Dépenses du MJ)
    // ---------------------------------------------------------------------
    const nb = (n) => Math.round(n || 0).toLocaleString("fr-FR");
    const euros = (v) => {
        const x = Number(v || 0);
        const decimales = x === 0 ? 2 : x < 0.01 ? 4 : x < 1 ? 3 : 2;
        return x.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + " €";
    };
    const dollars = (v) => "$" + Number(v || 0).toFixed(4);
    const nomModele = (m) => ({ "gemini-3.8-flash": "Gemini 3.8 Flash", "gemini-4-argon": "Gemini 4 Argon", "gemini-flash-lite-latest": "Flash-Lite" }[m] || m || "?");
    const reflexionFr = (r) => r === "low" ? "basse" : r === "medium" ? "moyenne" : "";
    const echapper = (t) => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    window.ouvrirDepensesMJ = function () {
        if (typeof window.naviguerFenetre === "function") window.naviguerFenetre("etape-menu-outils", "etape-depenses-mj");
        else { const f = document.getElementById("etape-depenses-mj"); if (f) { f.style.display = "block"; f.style.opacity = "1"; } }
        window.afficherDepensesMJ();
        window.rafraichirTauxDollarEuro().then(() => window.afficherDepensesMJ());
    };

    let affichage = 0;
    window.afficherDepensesMJ = async function () {
        const zone = document.getElementById("depenses-mj-contenu");
        if (!zone) return;
        const numero = ++affichage;
        if (!zone.innerHTML) zone.innerHTML = `<p class="depenses-vide">Lecture du compteur commun…</p>`;
        const { lignes, compteur, commun } = await window.lireDepensesMJ();
        if (numero !== affichage) return;   // un affichage plus récent est parti
        const liste = lignes.slice().reverse();
        const maintenant = Date.now();
        const aujourdhui = jour();
        // (v318) La TVA (20 %), si la case est cochée : ajoutée à l'affichage.
        const tva = window.tvaDepenses(), ttc = (eur) => (eur || 0) * (1 + tva);
        const envoyesDe = (l) => (l.narrateur.envoyes || 0) + (l.aides.envoyes || 0) + ((l.combat && l.combat.envoyes) || 0);
        const cumul = (filtre) => liste.filter(filtre).reduce((a, l) => ({ eur: a.eur + (l.totalEUR || 0), tokens: a.tokens + envoyesDe(l), tours: a.tours + 1,
            images: a.images + ((l.images && l.images.nombre) || 0) }), { eur: 0, tokens: 0, tours: 0, images: 0 });
        const carte = (titre, c) => `<div class="depenses-carte"><div class="depenses-carte-titre">${titre}</div><div class="depenses-carte-euros">${euros(ttc(c.eur))}</div>`
            + `<div class="depenses-carte-detail">${c.tours} relevé${c.tours > 1 ? "s" : ""} · ${nb(c.tokens)} tokens envoyés${c.images != null ? ` · ${c.images} image${c.images > 1 ? "s" : ""}` : ""}</div></div>`;
        const derniere = liste[0];
        let html = `<div class="depenses-cartes">`
            + carte("Dernier relevé", derniere ? { eur: derniere.totalEUR, tokens: envoyesDe(derniere), tours: 1, images: (derniere.images && derniere.images.nombre) || 0 } : { eur: 0, tokens: 0, tours: 0, images: 0 })
            + carte("Aujourd'hui", cumul(l => jour(l.date) === aujourdhui))
            + carte("30 derniers jours", cumul(l => maintenant - new Date(l.date).getTime() < 30 * 86400000))
            + carte("Depuis le début", compteur ? { eur: compteur.totalEUR || 0, tokens: compteur.tokensEnvoyes || 0, tours: compteur.tours || 0, images: compteur.images || 0 } : cumul(() => true))
            + `</div>`
            + `<label class="depenses-tva"><input type="checkbox" id="depenses-tva" ${tva ? "checked" : ""} onchange="basculerTvaDepenses(this.checked)"> Compter la TVA (20 %) : les prix affichés sont ${tva ? "TTC" : "hors taxes"}</label>`;
        if (!commun) html += `<p class="depenses-alerte">Le compteur commun n'a pas pu être lu : seuls les tours gardés sur cet appareil s'affichent.</p>`;
        if (!liste.length) {
            html += `<p class="depenses-vide">Aucune réponse du MJ relevée sur cet appareil pour l'instant.</p>`;
        } else {
            html += `<div class="depenses-tableau-cadre"><table class="depenses-tableau"><thead><tr>`
                + `<th>Date</th><th>Lancé par</th><th>Modèle</th><th>Tokens envoyés<br><small>(narrateur)</small></th><th>Tokens reçus<br><small>(narrateur, dont réflexion)</small></th><th>IA d'appoint</th><th>Images</th><th>Coût du tour</th>`
                + `</tr></thead><tbody>`;
            liste.forEach(l => {
                const d = new Date(l.date);
                const quand = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const inconnus = [...new Set([...(l.narrateur.inconnus || []), ...(l.aides.inconnus || [])])];
                const combat = l.combat || { appels: 0, envoyes: 0, recus: 0, reflexion: 0, coutUSD: 0 };
                html += `<tr class="depenses-ligne${l.horsTour ? " hors-tour" : ""}" data-id="${echapper(l.id)}" onclick="this.nextElementSibling.classList.toggle('ouvert')">`
                    + `<td>${quand}</td><td>${echapper(l.lancePar || "?")}</td><td>${l.horsTour ? "<b>Hors MJ</b><br><small>images, combat…</small>" : echapper(nomModele(l.modele)) + (reflexionFr(l.reflexion) ? `<br><small>réflexion ${reflexionFr(l.reflexion)}</small>` : "")}</td>`
                    + `<td class="depenses-nombre">${nb(l.narrateur.envoyes)}</td>`
                    + `<td class="depenses-nombre">${nb(l.narrateur.recus + l.narrateur.reflexion)}${l.narrateur.reflexion ? `<br><small>(${nb(l.narrateur.reflexion)})</small>` : ""}</td>`
                    + `<td class="depenses-nombre">${l.aides.appels + combat.appels} appel${l.aides.appels + combat.appels > 1 ? "s" : ""}<br><small>${nb(l.aides.envoyes + l.aides.recus + l.aides.reflexion + combat.envoyes + combat.recus + combat.reflexion)} tokens</small></td>`
                    + `<td class="depenses-nombre">${l.images.nombre}${l.images.nombre ? `<br><small>${euros(ttc(l.images.coutUSD * l.taux))}</small>` : ""}</td>`
                    + `<td class="depenses-cout">${euros(ttc(l.totalEUR))}</td></tr>`
                    + `<tr class="depenses-detail"><td colspan="8">`
                    + (l.extrait ? `<div class="depenses-extrait">« ${echapper(l.extrait)}… »</div>` : "")
                    + `<div>Narrateur : ${nb(l.narrateur.envoyes)} envoyés, ${nb(l.narrateur.recus)} reçus, ${nb(l.narrateur.reflexion)} de réflexion${l.narrateur.cache ? ` (${nb(l.narrateur.cache)} déjà en cache)` : ""} → ${euros(l.narrateur.coutUSD * l.taux)} (${dollars(l.narrateur.coutUSD)})</div>`
                    + `<div>IA d'appoint (casting, PNJ, bâtiments, réputation…) : ${l.aides.appels} appel(s), ${nb(l.aides.envoyes)} envoyés, ${nb(l.aides.recus + l.aides.reflexion)} reçus → ${euros(l.aides.coutUSD * l.taux)} (${dollars(l.aides.coutUSD)})</div>`
                    + (combat.appels ? `<div>IA du combat : ${combat.appels} appel(s), ${nb(combat.envoyes)} envoyés, ${nb(combat.recus + combat.reflexion)} reçus → ${euros(combat.coutUSD * l.taux)} (${dollars(combat.coutUSD)})</div>` : "")
                    + `<div>Images OpenAI : ${l.images.nombre}${l.images.nombre ? ` (${echapper(l.images.detail.join(", "))})` : ""} → ${euros(l.images.coutUSD * l.taux)} (${dollars(l.images.coutUSD)}${(l.images.detail || []).some(d => / ~$/.test(d)) ? ", en partie estimé" : ""})</div>`
                    + (tva ? `<div>TVA 20 % : ${euros(l.totalEUR * tva)} — total TTC ${euros(ttc(l.totalEUR))}</div>` : "")
                    + (inconnus.length ? `<div class="depenses-alerte">Tarif inconnu pour : ${echapper(inconnus.join(", "))} (tokens comptés, coût non compté).</div>` : "")
                    + `<div class="depenses-taux">1 $ = ${String(l.taux).replace(".", ",")} €${l.tauxSecours ? " (taux de secours, la BCE n'a pas répondu)" : l.tauxDate ? ` (BCE, ${l.tauxDate})` : ""}</div>`
                    + `</td></tr>`;
            });
            html += `</tbody></table></div>`;
        }
        const t = window.tauxDollarEuro();
        html += `<p class="depenses-note">Tout compte : chaque réponse du MJ (le narrateur et ses IA d'appoint), et, hors des réponses, les images (avatars, pions, cartes du combat, croquis, portraits) et les IA du combat (lignes « Hors MJ »). `
            + `Tarifs publiés de Google (Gemini 3.8 Flash : 0,75 $ / 3,75 $ le million de tokens jusqu'au 31/12/2026, puis 1,50 $ / 7,50 $) et d'OpenAI (images : le coût exact lu dans la réponse — texte envoyé, images de référence, image produite —, sinon la grille de prix). Convertis au taux de la BCE `
            + `(aujourd'hui 1 $ = ${String(t.taux).replace(".", ",")} €${t.secours ? ", taux de secours" : t.date ? `, ${t.date}` : ""}). Le même compteur pour toute la table, quel que soit celui qui lance le MJ. Touchez une ligne pour le détail.</p>`;
        zone.innerHTML = html;
    };

    window.effacerDepensesMJ = async function () {
        if (!window.confirm("Effacer l'historique des dépenses du MJ POUR TOUT LE MONDE (et remettre le compteur commun à zéro) ?")) return;
        ecrireAttente([]);
        try { if (depot()) await depot().effacer(); } catch (e) { console.error("[Dépenses] Effacement :", e); }
        await window.afficherDepensesMJ();
    };
})();
