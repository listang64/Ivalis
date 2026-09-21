// =========================================================================
//  IVALIS - LA MISE À JOUR QUI N'OBLIGE PLUS À RÉINSTALLER L'APPLICATION
// =========================================================================
//  LE PROBLÈME, EN UNE PHRASE : tous les fichiers du jeu portent un `?v=N`
//  qu'on monte à chaque livraison, et se rafraîchissent donc tout seuls — tous
//  SAUF index.html, qui n'a pas de `?v=` parce qu'il EST l'adresse. Tant que
//  l'iPad sert son ancienne copie de index.html, il lit les anciens numéros de
//  version, et charge donc l'ancien jeu en entier.
//
//  Sur l'écran d'accueil d'un iPad, c'est pire qu'un onglet : la webapp a son
//  propre cache, séparé de Safari, et relancer par l'icône ne le bouscule pas.
//  D'où la seule manœuvre qui marchait jusqu'ici — supprimer l'icône et
//  réinstaller. Et comme supprimer l'icône efface le stockage du site, les clés
//  d'API partaient avec, à retaper une par une.
//
//  CE QUE FAIT CE MODULE. Au chargement, et au chargement seulement, il
//  demande au serveur un tout petit fichier — version.json — en lui interdisant
//  de passer par le cache. Si le numéro qu'il y lit ne correspond pas à celui
//  de la page en train de tourner, c'est que cette page est périmée : il
//  recharge sur une ADRESSE QUE LE CACHE NE CONNAÎT PAS (index.html?maj=98).
//  Une adresse inconnue oblige à aller chercher sur le réseau, la page qui
//  revient est fraîche, ses `?v=` sont les nouveaux, et tout le jeu suit.
//
//  ET LES CLÉS RESTENT. C'est le point : un rechargement ne touche pas au
//  localStorage. Les clés d'API, les volumes, le mode développeur survivent —
//  on ne perdait tout que parce qu'on supprimait l'icône.
//
//  DEUX PRÉCAUTIONS, ET ELLES COMPTENT :
//
//   1. JAMAIS DE BOUCLE. Si on a déjà rechargé POUR CETTE VERSION-LÀ et qu'on
//      lit encore l'ancien numéro, c'est que le serveur, lui, n'a pas suivi :
//      on s'arrête et on le dit en console, plutôt que de recharger à l'infini
//      un appareil qui ne peut pas s'en sortir. L'adresse porte la version
//      visée, c'est elle qui sert de mémoire — rien n'est écrit nulle part.
//
//   2. JAMAIS EN PLEIN COMBAT. La vérification n'a lieu qu'au chargement de la
//      page, avant que le premier écran soit franchi. Pas de contrôle en
//      arrière-plan, pas de retour d'application qui recharge : une livraison
//      pendant une partie ne coupera jamais un tour en cours. Le jeu se mettra
//      à jour au prochain démarrage, ce qui est exactement le moment où on le
//      lance depuis l'icône.
//
//  UN RÉSEAU ABSENT NE CASSE RIEN : si version.json est injoignable, on joue
//  avec ce qu'on a, sans un mot de plus qu'une ligne en console.
// =========================================================================

// Le nom du paramètre qui sert à la fois de chasse-cache et de mémoire de
// tentative. Un seul endroit pour le lire et pour l'écrire.
window.CLE_MAJ = "maj";

// Le fichier de version, à la racine, à côté de index.html. Il tient en une
// ligne et ne contient QUE le numéro : c'est ce qui permet de le relire à
// chaque démarrage sans que ça coûte quoi que ce soit.
window.FICHIER_VERSION = "version.json";

// Le résultat de la dernière vérification, pour la console et pour les bancs :
//   « a-jour »       — rien à faire ;
//   « rechargement » — la page périmée s'en va, une fraîche arrive ;
//   « bloquee »      — on a déjà essayé pour cette version, le serveur n'a pas
//                      suivi, on ne boucle pas ;
//   « injoignable »  — pas de réseau, on joue avec ce qu'on a ;
//   « illisible »    — le fichier existe mais ne dit pas de version.
window.ETAT_MISE_A_JOUR = null;

window.verifierMiseAJour = async function() {
    const loc = window.location;
    const ici = String(window.VERSION_IVALIS || "");

    // UNE PAGE OUVERTE DEPUIS UN FICHIER N'A PAS DE SERVEUR à interroger : les
    // bancs d'essai ouvrent le jeu en file:// par dizaines, et une requête
    // lancée là ne peut que se faire refuser par le navigateur — en salissant
    // la console d'une erreur que les bancs comptent, à raison, comme une
    // erreur JS. Il n'y a de toute façon rien à mettre à jour hors ligne.
    if (loc.protocol === "file:") {
        window.ETAT_MISE_A_JOUR = { etat: "local", ici };
        return window.ETAT_MISE_A_JOUR;
    }

    let versionServeur = "";
    try {
        // `no-store` ET un paramètre unique : la consigne d'en-tête seule ne
        // suffit pas toujours sur iOS, le paramètre, lui, ne ment jamais — une
        // adresse jamais demandée ne peut pas sortir d'un cache.
        const reponse = await window.fetch(
            window.FICHIER_VERSION + "?t=" + Date.now(), { cache: "no-store" });
        const donnees = await reponse.json();
        versionServeur = String((donnees && donnees.version) || "");
    } catch (e) {
        window.ETAT_MISE_A_JOUR = { etat: "injoignable", ici };
        console.log("[MàJ] version.json injoignable : on joue avec la version " + ici + ".");
        return window.ETAT_MISE_A_JOUR;
    }

    if (!versionServeur) {
        window.ETAT_MISE_A_JOUR = { etat: "illisible", ici };
        console.warn("[MàJ] version.json ne contient aucun numéro de version.");
        return window.ETAT_MISE_A_JOUR;
    }

    const params = new URLSearchParams(loc.search || "");
    const dejaTente = params.get(window.CLE_MAJ);

    if (versionServeur === ici) {
        // À jour. Si l'adresse traîne encore le paramètre du rechargement
        // précédent, on la nettoie : elle est redevenue une adresse ordinaire,
        // et c'est celle-là qu'on veut voir partagée ou mise en favori.
        if (dejaTente && window.history && window.history.replaceState) {
            params.delete(window.CLE_MAJ);
            const reste = params.toString();
            window.history.replaceState({}, "", loc.pathname + (reste ? "?" + reste : "") + (loc.hash || ""));
        }
        window.ETAT_MISE_A_JOUR = { etat: "a-jour", ici, serveur: versionServeur };
        console.log("[MàJ] Ivalis est à jour (version " + ici + ").");
        return window.ETAT_MISE_A_JOUR;
    }

    if (dejaTente === versionServeur) {
        // On a déjà rechargé en visant cette version-là, et on lit toujours
        // l'ancienne : le serveur sert encore l'ancien index.html. Recharger
        // encore ne ferait que tourner en rond.
        window.ETAT_MISE_A_JOUR = { etat: "bloquee", ici, serveur: versionServeur };
        console.warn("[MàJ] Rechargement déjà tenté pour la version " + versionServeur
                   + ", et la page reste en " + ici + " : le serveur n'a pas encore livré. "
                   + "Rien de plus à faire ici — réessaie dans quelques minutes.");
        return window.ETAT_MISE_A_JOUR;
    }

    // Les caches de l'API Cache, s'il y en a un jour (aucun aujourd'hui) : on
    // les vide avant de repartir. Le localStorage, LUI, N'EST PAS TOUCHÉ —
    // c'est là que vivent les clés d'API, et c'est tout l'intérêt.
    try {
        if (window.caches && typeof window.caches.keys === "function") {
            const noms = await window.caches.keys();
            await Promise.all(noms.map(n => window.caches.delete(n)));
        }
    } catch (e) {
        console.warn("[MàJ] Vidage des caches impossible (sans conséquence) :", e);
    }

    params.set(window.CLE_MAJ, versionServeur);
    const cible = loc.pathname + "?" + params.toString() + (loc.hash || "");
    window.ETAT_MISE_A_JOUR = { etat: "rechargement", ici, serveur: versionServeur, cible };
    console.log("[MàJ] Version " + versionServeur + " disponible (ici : " + ici
              + ") — rechargement sur " + cible + ". Tes clés d'API ne bougent pas.");
    // `replace` et pas `assign` : la page périmée ne doit pas rester dans
    // l'historique, sinon un retour en arrière y ramène.
    loc.replace(cible);
    return window.ETAT_MISE_A_JOUR;
};

// Lancée tout de suite, et sa promesse est gardée : les bancs l'attendent, et
// la console peut la consulter. C'est le seul appel automatique du module.
window.VERIFICATION_MAJ = window.verifierMiseAJour();
