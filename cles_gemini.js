// =========================================================================
//  IVALIS — LES DEUX CLÉS GEMINI (v278)
// =========================================================================
//  Nico : « si tu penses que niveau quota gratuit des clés API ça risque de
//  faire trop pour une seule clé, crée-moi un nouveau champ clé API Gemini 2,
//  et pour ces IA de combat on met une deuxième clé ». Un combat demande une
//  vingtaine d'appels en quelques minutes (la détection, le lieu, la carte,
//  les ennemis, les quatre peintures, les techniques, le butin) en plus du
//  tour du MJ : la première clé y laisserait son quota.
//
//  LE QUOTA GRATUIT EST COMPTÉ PAR PROJET GOOGLE, pas par clé : la seconde
//  doit venir d'un autre projet (ou d'un autre compte), sinon elle partage le
//  même quota et ne sert à rien.
//
//  `usage` : "combat" prend la seconde clé (la première si elle est vide) ;
//  tout le reste prend la première. Une clé refusée pour quota (429) ou
//  indisponible (503) passe la main à l'autre, s'il y en a une autre.
//  Script simple (pas un module) : chargé avant tous les modules.
// =========================================================================
(function () {
    const CLE_1 = "ivalis_GEMINI_API_KEY";
    const CLE_2 = "ivalis_GEMINI_API_KEY_2";
    const MODELE = "gemini-flash-lite-latest";
    const lire = (cle) => { try { return (localStorage.getItem(cle) || "").trim(); } catch (e) { return ""; } };

    window.CLES_GEMINI_LS = { premiere: CLE_1, seconde: CLE_2 };

    // Les clés à essayer, dans l'ordre, sans doublon ni vide.
    window.clesGeminiPour = function (usage) {
        const premiere = lire(CLE_1), seconde = lire(CLE_2);
        const ordre = usage === "combat" ? [seconde, premiere] : [premiere, seconde];
        return [...new Set(ordre.filter(Boolean))];
    };

    // La clé d'un usage ("" s'il n'y en a aucune).
    window.cleGemini = (usage) => window.clesGeminiPour(usage)[0] || "";

    // L'appel lui-même : `corps` est le texte JSON de la requête. Rend la
    // réponse (Response) de la première clé qui n'est pas à court de quota.
    window.fetchGemini = async function (usage, corps, options) {
        const modele = (options && options.modele) || MODELE;
        const cles = window.clesGeminiPour(usage);
        if (cles.length === 0) throw new Error("Aucune clé Gemini");
        let derniere = null;
        for (let i = 0; i < cles.length; i++) {
            const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cles[i]}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: corps
            });
            derniere = reponse;
            if ((reponse.status === 429 || reponse.status === 503) && i < cles.length - 1) {
                console.warn(`[Gemini] Clé ${i + 1} refusée (${reponse.status}) : l'autre clé prend le relais.`);
                continue;
            }
            return reponse;
        }
        return derniere;
    };
})();
