// =========================================================================
//  IVALIS — LE LORE DU MONDE (v273)
// =========================================================================
//  Le classeur de Nico (LORE_IVALIS), rangé par carte régionale : le numéro
//  est celui de la boîte cliquable de la carte du monde (cartes_regionales.js).
//  Les deux grandes cités (Volcanisse, Arcaï) et l'Ordre d'Ivalis ont leur
//  propre fiche : on les joint aux régions qui en parlent.
//
//  Lu par les IA qui inventent le monde (MIA_VILLAGE, villages_regionaux.js) :
//  un village de la forêt des murmures doit sentir les Gobs et les
//  contrebandiers, pas les Éthérés du désert.
//
//  Script simple (pas un module) : les bancs le chargent tel quel.
// =========================================================================
(function () {
    const ORDRE = [
        "L'Ordre d'Ivalis a été créé il y a 1000 ans pour combattre l'Engeance.",
        "Son influence a perdu de sa splendeur : les gens ne croient plus en l'Ordre, et doutent même de l'existence de l'Engeance.",
        "Pour survivre, l'Ordre joue les mercenaires.",
        "L'Ordre prend les orphelins sous son aile pour les entraîner et en faire des gardiens de l'Ordre.",
        "L'Ordre a plusieurs sièges : Arcaï, Volcanisse, la Crique du Pendu, l'île aux marchés, et un petit village au sud de Volcanisse.",
        "Hiérarchie de l'Ordre : Patriarche > Aînés > Frères > Cadets. Les patriarches se réunissent chaque année en conseil."
    ];
    const VOLCANISSE = [
        "Volcanisse est dirigée par les humains et les Ankylars. Les autres races y affluent de partout, surtout les Gobs, qui y ont une liberté relative, mais une liberté quand même.",
        "Les humains dirigeants font partie du groupe fanatique de la Confrérie de la Cendre, et utilisent la force et les techniques de forge des Ankylars pour diriger la cité d'une main de fer.",
        "Ils détestent la magie : toute utilisation de magie dans la ville est punie de mort, les mages y sont traqués.",
        "Ils haïssent les Arcaïens depuis toujours."
    ];
    const ARCAI = [
        "Arcaï est dirigée par le Concordia magique, un groupe d'humains profondément raciste envers les autres races.",
        "Le bien-être des humains est au centre de leurs préoccupations ; ils utilisent abondamment l'esclavage pour les basses besognes.",
        "La magie est au cœur de leur culture et de leur quotidien ; quatre archimages prennent les décisions de la cité.",
        "L'école de magie est obligatoire pour tous les humains dès leur plus jeune âge.",
        "Ils éprouvent un profond dégoût envers la cité de Volcanisse."
    ];
    const REGIONS = {
        1: { nom: "La forêt des murmures", lignes: [
            "Région berceau des Gobs.",
            "On y croise beaucoup de contrebandiers et d'esclavagistes, qui viennent enlever les Gobs pour les revendre à Arcaï.",
            "On y croise aussi des Gobs géants : de véritables créatures massives, beaucoup moins intelligentes que leurs homologues de petite taille."
        ] },
        2: { nom: "La vallée de souffre", lignes: [
            "Dans cette région se trouve la ville de Volcanisse, dirigée par les Ankylars : une ville ouverte aux autres races mais très restreinte en termes de liberté, découpée en enclaves.",
            "Les humains sont présents dans la région.",
            "On croise dans la région plein de petits villages."
        ], cite: "Volcanisse" },
        3: { nom: "Le mont Pletia", lignes: [] },
        4: { nom: "Volcanisse", lignes: [], cite: "Volcanisse" },
        5: { nom: "Le désert d'Etheria", lignes: [
            "Une majorité de plaines désertiques : sable et sécheresse.",
            "La race des Éthérés vit en abondance dans ces déserts.",
            "On trouve plein de petits villages de tribus nomades, principalement éthérées : de petits bivouacs. Les Éthérés vivent principalement en nomades itinérants.",
            "Les humains parcourent eux aussi les déserts mortels d'Etheria. Ils vivent en nomades et font la guerre aux Éthérés depuis des siècles pour le contrôle de la région."
        ] },
        6: { nom: "L'enclave d'argentée", lignes: [
            "Berceau des Ophiors. Une forêt abondante.",
            "Les humains de la zone vivent en tribus, tatoués, peu avancés technologiquement, mais usent d'un peu de magie de la nature.",
            "De petits camps forestiers primitifs, à travers la forêt."
        ] },
        7: { nom: "L'île aux marchés", lignes: [
            "L'île est de réputation neutre, et n'a aucune allégeance aux factions majeures des continents.",
            "De nombreux villages portuaires avec une abondance de marchés et de ressources diverses : un véritable carrefour commercial en biens, services et esclaves.",
            "La race des Ondari y vit en abondance et contrôle l'île.",
            "Beaucoup de Vargens aussi, car ici ils ne sont pas pourchassés par les humains."
        ] },
        8: { nom: "Les doigts d'Atrium", lignes: [] },
        9: { nom: "Arcaï", lignes: [], cite: "Arcaï" },
        10: { nom: "La pointe des sentinelles", lignes: [
            "La ville d'Arcaï est la plus grosse cité de la région.",
            "La race humaine domine la région et y est en abondance.",
            "Une région agricole, avec beaucoup de champs, où travaillent des esclaves Gobs et Ankylars."
        ], cite: "Arcaï" },
        11: { nom: "La province d'Aurelya", lignes: [
            "Beaucoup d'humains peuplent cette région ; on y trouve plein de villages florissants.",
            "Les autres races qu'humaines y sont mal vues.",
            "On y trouve le lac aux vœux, lieu de recueillement et de pèlerinage pour les Ondari.",
            "La race des Vargens y est en abondance : ils se cachent, car traqués par les humains."
        ] },
        12: { nom: "La crique du Pendu", lignes: [
            "Repaire de pirates de toutes races confondues, traqués par les flottes de galères d'Arcaï et de Volcanisse.",
            "Très dure d'accès, avec énormément de récifs."
        ] },
        13: { nom: "Les îlots maudits", lignes: [] }
    };
    const CITES = { "Volcanisse": VOLCANISSE, "Arcaï": ARCAI };

    // LES PEUPLES D'ELYRIA (v287, d'après la création des personnages) : les
    // IA qui inventent des ennemis les tirent d'ici, selon la région et le récit.
    const PEUPLES = {
        "Humains": "le peuple le plus répandu d'Elyria, présent partout. Ils dirigent Arcaï (le Concordia magique, raciste envers les autres races) et, avec les Ankylars, Volcanisse (la Confrérie de la Cendre, fanatique).",
        "Ankylars": "humanoïdes reptiliens robustes, à la peau écailleuse ; guerriers endurants et maîtres de la forge, peuple dominant de Volcanisse ; honneur, discipline, combat martial ; ils rejettent la magie.",
        "Gobs": "petits, agiles, ingénieux, bricoleurs et inventeurs ; méprisés, souvent réduits en esclavage ; leur berceau est la forêt des murmures. Il existe aussi des Gobs géants, massifs et peu intelligents.",
        "Vargens": "peuple bestial et puissant (des traits de bête), qui vit en clans ; méfiants, adeptes de la force brute ; traqués par les humains.",
        "Ondaris": "peuple aquatique des mers, des îles et des côtes ; navigateurs et marchands, plus rusés que forts.",
        "Ophiors": "humanoïdes vivant en symbiose avec les champignons et la forêt, fascinants et inquiétants ; pacifiques, mais ils se défendent.",
        "Éthérés": "nomades aveugles du désert d'Etheria, aux sens extrêmement aiguisés ; silencieux, précis, en clans."
    };
    // L'ANTIQUITÉ, pour habiller qui que ce soit (v287, Nico : « que ça soit
    // bien dans un monde antique »).
    const ANTIQUITE = "Le monde est ANTIQUE FANTASTIQUE (mythologie, Antiquité magique), pas médiéval : armes et tenues de l'Antiquité — lances, glaives, sabres courbes, haches de bronze, javelots, arcs, frondes, boucliers ronds ou de hoplite, casques à cimier ou à nasal, cuirasses de bronze ou de lin, tuniques, chitons, pagnes, capes, sandales, bijoux de bronze et d'or. Jamais de chevalier en armure de plaques, d'arbalète, d'arme à feu, de heaume médiéval ni de château. Les bêtes et les monstres viennent de la mythologie (chimères, harpies, serpents géants, bêtes des marais ou du désert…) ou de la faune de la région.";

    window.LORE_IVALIS = { ordre: ORDRE, regions: REGIONS, cites: CITES, peuples: PEUPLES, antiquite: ANTIQUITE,
        univers: "Antique Fantastique : mythologie, Antiquité magique." };

    // CE QU'UNE IA DOIT SAVOIR POUR INVENTER DES ENNEMIS (v287) : l'Antiquité,
    // les peuples, et la région où l'on se trouve (s'il y en a une).
    window.contexteEnnemisIvalis = function (numeroRegion) {
        const morceaux = [ANTIQUITE, "Les peuples d'Elyria :\n" + Object.entries(PEUPLES).map(([n, d]) => `- ${n} : ${d}`).join("\n")];
        if (Number(numeroRegion) > 0) morceaux.push(window.loreDeLaRegion(numeroRegion));
        else morceaux.push("L'Ordre d'Ivalis :\n- " + ORDRE.join("\n- "));
        return morceaux.join("\n\n");
    };

    // Le lore d'une carte régionale, prêt à glisser dans un prompt : la région,
    // la cité qu'elle abrite s'il y en a une, et l'Ordre d'Ivalis.
    window.loreDeLaRegion = function (numero) {
        const r = REGIONS[Number(numero)] || { nom: "", lignes: [] };
        const morceaux = [`Univers : ${window.LORE_IVALIS.univers}`];
        morceaux.push(`Région : ${r.nom || "inconnue"}.` + (r.lignes.length ? "\n- " + r.lignes.join("\n- ") : "\n- (Pas encore de lore écrit pour cette région : reste cohérent avec le reste du monde.)"));
        if (r.cite && CITES[r.cite]) morceaux.push(`La cité de ${r.cite} :\n- ` + CITES[r.cite].join("\n- "));
        morceaux.push("L'Ordre d'Ivalis :\n- " + ORDRE.join("\n- "));
        return morceaux.join("\n\n");
    };
})();
