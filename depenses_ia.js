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
//  Les appels de la seconde clé (les IA du combat) ne comptent pas : ce ne
//  sont pas des dépenses du MJ.
//
//  Le coût est calculé aux tarifs publiés (dollars par million de tokens,
//  la réflexion facturée comme la sortie), puis converti en euros au taux du
//  jour de la BCE (api.frankfurter.dev), relevé au moment du tour. Le relevé
//  vit dans ce navigateur (localStorage), 300 tours au plus.
//  Script simple (pas un module) : chargé avant tous les modules.
// =========================================================================
(function () {
    const CLE_RELEVES = "ivalis_DEPENSES_MJ";
    const CLE_TAUX = "ivalis_TAUX_USD_EUR";
    const MAX_RELEVES = 300;
    const TAUX_SECOURS = 0.87;              // si la BCE ne répond pas
    const FRAICHEUR_TAUX_MS = 12 * 3600 * 1000;

    // LES TARIFS ($ par million de tokens), relevés le 01/11/2026 sur les
    // pages de Google. Une période sans `jusqua` vaut ensuite.
    const TARIFS_GEMINI = [
        { motif: /^gemini-3\.8-flash/, periodes: [{ jusqua: "2026-12-31", entree: 0.75, sortie: 3.75 }, { entree: 1.50, sortie: 7.50 }] },
        { motif: /^gemini-4-argon/,    periodes: [{ jusqua: "2026-11-30", entree: 2.00, sortie: 10.00 }, { entree: 4.00, sortie: 20.00 }] },
        { motif: /flash-lite/,         periodes: [{ entree: 0.30, sortie: 2.50 }] }
    ];
    // Les images d'OpenAI (gpt-image-2) : le prix d'une image 1024 × 1024 selon
    // la qualité, au prorata de la surface pour les autres tailles (estimation).
    const PRIX_IMAGE_1024 = { low: 0.006, medium: 0.053, high: 0.211 };

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

    window.coutGeminiUSD = function (modele, usage, date) {
        const t = window.tarifGemini(modele, date);
        if (!t) return null;
        const u = usage && "envoyes" in usage ? usage : lireUsage(usage);
        return (u.envoyes * t.entree + (u.recus + u.reflexion) * t.sortie) / 1e6;
    };

    window.coutImageUSD = function (qualite, taille) {
        const base = PRIX_IMAGE_1024[qualite] != null ? PRIX_IMAGE_1024[qualite] : PRIX_IMAGE_1024.medium;
        const m = String(taille || "1024x1024").match(/(\d+)\s*x\s*(\d+)/);
        const surface = m ? (Number(m[1]) * Number(m[2])) / (1024 * 1024) : 1;
        return base * surface;
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
    window.lireDepensesMJ = function () {
        try { const l = JSON.parse(localStorage.getItem(CLE_RELEVES) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    };
    const ecrireReleves = (liste) => {
        try { localStorage.setItem(CLE_RELEVES, JSON.stringify(liste.slice(-MAX_RELEVES))); } catch (e) { console.warn("[Dépenses] Relevé non gardé :", e); }
    };

    const ouverts = [];
    let compteur = 0;
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
                             narrateur: [], aides: [], images: [], enAttente: [] };
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
        async finTour(releve, extra) {
            const i = ouverts.indexOf(releve);
            if (i < 0) return null;
            ouverts.splice(i, 1);
            clearTimeout(releve.minuteur);
            await Promise.allSettled(releve.enAttente);
            const date = new Date(releve.debut);
            const somme = (liste) => liste.reduce((a, x) => {
                const cout = window.coutGeminiUSD(x.modele, x, date);
                a.envoyes += x.envoyes; a.recus += x.recus; a.reflexion += x.reflexion; a.cache += x.cache; a.appels++;
                if (cout == null) a.inconnus.push(x.modele); else a.coutUSD += cout;
                return a;
            }, { appels: 0, envoyes: 0, recus: 0, reflexion: 0, cache: 0, coutUSD: 0, inconnus: [] });
            const narrateur = somme(releve.narrateur), aides = somme(releve.aides);
            const images = { nombre: releve.images.length, coutUSD: releve.images.reduce((a, x) => a + x.coutUSD, 0), detail: releve.images.map(x => `${x.qualite} ${x.taille}`) };
            if (!narrateur.appels && !aides.appels && !images.nombre) return null;
            const taux = await window.rafraichirTauxDollarEuro();
            const totalUSD = narrateur.coutUSD + aides.coutUSD + images.coutUSD;
            const ligne = {
                id: releve.id, date: date.toISOString(), modele: releve.modele, reflexion: releve.reflexion,
                extrait: String((extra && extra.extrait) || "").replace(/\s+/g, " ").trim().slice(0, 90),
                narrateur, aides, images, totalUSD, taux: taux.taux, tauxDate: taux.date || "", tauxSecours: !!taux.secours,
                totalEUR: totalUSD * taux.taux
            };
            const liste = window.lireDepensesMJ();
            liste.push(ligne);
            ecrireReleves(liste);
            console.log(`[Dépenses] Tour du MJ : ${narrateur.envoyes + aides.envoyes} tokens envoyés, ${(ligne.totalEUR).toFixed(4)} €.`);
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
            if (typeof b === "string") { const j = JSON.parse(b); return { qualite: j.quality || "medium", taille: j.size || "1024x1024" }; }
            if (b && typeof b.get === "function") return { qualite: b.get("quality") || "medium", taille: b.get("size") || "1024x1024" };
        } catch (e) {}
        return { qualite: "medium", taille: "1024x1024" };
    };
    window.fetch = async function (entree, options) {
        const reponse = await vraiFetch(entree, options);
        try {
            const releve = ouverts[ouverts.length - 1];
            const url = typeof entree === "string" ? entree : (entree && entree.url) || "";
            if (releve && reponse && reponse.ok) {
                if (/generativelanguage\.googleapis\.com\/.*:generateContent/.test(url)) {
                    const cle = (url.match(/[?&]key=([^&]+)/) || [])[1] || "";
                    const combat = cleCombat();
                    if (!(combat && decodeURIComponent(cle) === combat)) {
                        const modele = (url.match(/models\/([^:]+):/) || [])[1] || "";
                        releve.enAttente.push(reponse.clone().json().then(d => {
                            if (d && d.usageMetadata) releve.aides.push({ modele, ...lireUsage(d.usageMetadata) });
                        }).catch(() => {}));
                    }
                } else if (/api\.openai\.com\/v1\/images\//.test(url)) {
                    const { qualite, taille } = lireOptionsImage(options);
                    releve.images.push({ qualite, taille, coutUSD: window.coutImageUSD(qualite, taille) });
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

    window.afficherDepensesMJ = function () {
        const zone = document.getElementById("depenses-mj-contenu");
        if (!zone) return;
        const liste = window.lireDepensesMJ().slice().reverse();
        const maintenant = Date.now();
        const aujourdhui = jour();
        const cumul = (filtre) => liste.filter(filtre).reduce((a, l) => ({ eur: a.eur + (l.totalEUR || 0), tokens: a.tokens + (l.narrateur.envoyes + l.aides.envoyes), tours: a.tours + 1 }), { eur: 0, tokens: 0, tours: 0 });
        const carte = (titre, c) => `<div class="depenses-carte"><div class="depenses-carte-titre">${titre}</div><div class="depenses-carte-euros">${euros(c.eur)}</div>`
            + `<div class="depenses-carte-detail">${c.tours} réponse${c.tours > 1 ? "s" : ""} · ${nb(c.tokens)} tokens envoyés (en tout)</div></div>`;
        const derniere = liste[0];
        let html = `<div class="depenses-cartes">`
            + carte("Dernière réponse", derniere ? { eur: derniere.totalEUR, tokens: derniere.narrateur.envoyes + derniere.aides.envoyes, tours: 1 } : { eur: 0, tokens: 0, tours: 0 })
            + carte("Aujourd'hui", cumul(l => jour(l.date) === aujourdhui))
            + carte("30 derniers jours", cumul(l => maintenant - new Date(l.date).getTime() < 30 * 86400000))
            + carte("Depuis le début", cumul(() => true))
            + `</div>`;
        if (!liste.length) {
            html += `<p class="depenses-vide">Aucune réponse du MJ relevée sur cet appareil pour l'instant.</p>`;
        } else {
            html += `<div class="depenses-tableau-cadre"><table class="depenses-tableau"><thead><tr>`
                + `<th>Date</th><th>Modèle</th><th>Tokens envoyés<br><small>(narrateur)</small></th><th>Tokens reçus<br><small>(narrateur, dont réflexion)</small></th><th>IA d'appoint</th><th>Images</th><th>Coût du tour</th>`
                + `</tr></thead><tbody>`;
            liste.forEach(l => {
                const d = new Date(l.date);
                const quand = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const inconnus = [...new Set([...(l.narrateur.inconnus || []), ...(l.aides.inconnus || [])])];
                html += `<tr class="depenses-ligne" data-id="${echapper(l.id)}" onclick="this.nextElementSibling.classList.toggle('ouvert')">`
                    + `<td>${quand}</td><td>${echapper(nomModele(l.modele))}${reflexionFr(l.reflexion) ? `<br><small>réflexion ${reflexionFr(l.reflexion)}</small>` : ""}</td>`
                    + `<td class="depenses-nombre">${nb(l.narrateur.envoyes)}</td>`
                    + `<td class="depenses-nombre">${nb(l.narrateur.recus + l.narrateur.reflexion)}${l.narrateur.reflexion ? `<br><small>(${nb(l.narrateur.reflexion)})</small>` : ""}</td>`
                    + `<td class="depenses-nombre">${l.aides.appels} appel${l.aides.appels > 1 ? "s" : ""}<br><small>${nb(l.aides.envoyes + l.aides.recus + l.aides.reflexion)} tokens</small></td>`
                    + `<td class="depenses-nombre">${l.images.nombre}</td>`
                    + `<td class="depenses-cout">${euros(l.totalEUR)}</td></tr>`
                    + `<tr class="depenses-detail"><td colspan="7">`
                    + (l.extrait ? `<div class="depenses-extrait">« ${echapper(l.extrait)}… »</div>` : "")
                    + `<div>Narrateur : ${nb(l.narrateur.envoyes)} envoyés, ${nb(l.narrateur.recus)} reçus, ${nb(l.narrateur.reflexion)} de réflexion${l.narrateur.cache ? ` (${nb(l.narrateur.cache)} déjà en cache)` : ""} → ${euros(l.narrateur.coutUSD * l.taux)} (${dollars(l.narrateur.coutUSD)})</div>`
                    + `<div>IA d'appoint (casting, PNJ, bâtiments, réputation…) : ${l.aides.appels} appel(s), ${nb(l.aides.envoyes)} envoyés, ${nb(l.aides.recus + l.aides.reflexion)} reçus → ${euros(l.aides.coutUSD * l.taux)} (${dollars(l.aides.coutUSD)})</div>`
                    + `<div>Images OpenAI : ${l.images.nombre}${l.images.nombre ? ` (${echapper(l.images.detail.join(", "))})` : ""} → ${euros(l.images.coutUSD * l.taux)} (${dollars(l.images.coutUSD)}, estimation)</div>`
                    + (inconnus.length ? `<div class="depenses-alerte">Tarif inconnu pour : ${echapper(inconnus.join(", "))} (tokens comptés, coût non compté).</div>` : "")
                    + `<div class="depenses-taux">1 $ = ${String(l.taux).replace(".", ",")} €${l.tauxSecours ? " (taux de secours, la BCE n'a pas répondu)" : l.tauxDate ? ` (BCE, ${l.tauxDate})` : ""}</div>`
                    + `</td></tr>`;
            });
            html += `</tbody></table></div>`;
        }
        const t = window.tauxDollarEuro();
        html += `<p class="depenses-note">Coûts calculés aux tarifs publiés de Google (Gemini) et d'OpenAI (images, estimation selon la qualité et la taille), convertis au taux de la BCE `
            + `(aujourd'hui 1 $ = ${String(t.taux).replace(".", ",")} €${t.secours ? ", taux de secours" : t.date ? `, ${t.date}` : ""}). Historique de cet appareil seulement. Touchez une ligne pour le détail.</p>`;
        zone.innerHTML = html;
    };

    window.effacerDepensesMJ = function () {
        if (!window.confirm("Effacer tout l'historique des dépenses du MJ sur cet appareil ?")) return;
        ecrireReleves([]);
        window.afficherDepensesMJ();
    };
})();
