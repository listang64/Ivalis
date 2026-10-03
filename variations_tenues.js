// =========================================================================
//  IVALIS - LES VARIATIONS DE TENUE : DE QUOI NE JAMAIS DESSINER DEUX FOIS
//  LA MÊME ARMURE
// =========================================================================
//  Laissée à elle-même, l'IA dessine toujours la même « tunique de lin » et la
//  même « cuirasse de bronze » : c'est ce qu'elle a le plus vu. Avant de lui
//  demander une tenue, on tire donc au sort, pour chaque armure, une variation
//  dans une liste écrite à la main pour son type (légère, intermédiaire,
//  lourde) — de la Grèce à Rome, de la Perse à l'Égypte, des steppes aux
//  temples de l'Antiquité fantastique — et une palette de couleurs. La
//  variation part à MIA_Objets (qui décrit) et au dessinateur (qui dessine) :
//  objets_ia.js, decrireObjetsAvecMIA et promptImageObjet.
//
//  Le tirage évite les répétitions : jamais deux fois la même variation dans
//  un même lot, et les dernières tirées sur cet appareil passent leur tour.
//
//  Aucune variation ne décrit de casque ni de coiffe (l'équipement de départ
//  d'un héros doit laisser son visage découvert) ni de pièce médiévale.
// =========================================================================

window.VARIATIONS_TENUES = {
    "Armure légère": [
        { titre: "Philosophe d'Athènes", description: "Himation de laine écrue drapé en diagonale sur un chiton long, bordure tissée de méandres grecs, ceinture de cordelette nouée, sandales lacées jusqu'aux mollets." },
        { titre: "Pythie de Delphes", description: "Péplos à plis fins tombant aux chevilles, étole légère sur les épaules, ceinture de feuilles de laurier en bronze, fins brassards ciselés, sandales à lanières." },
        { titre: "Savant d'Alexandrie", description: "Tunique de lin fin à manches courtes, manteau de voyage roulé sur les épaules, large ceinture de cuir à étuis de calames, bracelets de cuivre." },
        { titre: "Prêtre d'Isis", description: "Robe de lin blanc plissé, large collier ousekh de faïence bleue et de cornaline sur les épaules, ceinture à pan tombant brodé de scarabées, sandales de papyrus tressé." },
        { titre: "Mage de Médie", description: "Robe longue à manches, pantalon ample serré aux chevilles, kandys (manteau à fausses manches pendantes) bordé de galons, ceinture à plaques d'or." },
        { titre: "Mystagogue d'Éleusis", description: "Manteau de laine sombre jeté sur un chiton long, bordures brodées d'épis de blé, ceinture de cordons tressés, sandales fines." },
        { titre: "Chamane scythe", description: "Caftan de feutre croisé couvert d'appliques de cerfs et de griffons découpés, pantalon de cuir souple, bottes basses, ceinture à plaques d'or de style animalier." },
        { titre: "Haruspice étrusque", description: "Tébenne arrondie à large bordure brodée sur une tunique longue, ceinture à fermoir ouvragé, bracelets à amulettes, chaussures à bout relevé." },
        { titre: "Navigateur phénicien", description: "Tunique longue rayée de pourpre, manteau à franges noué sur l'épaule, ceinture de lin à plusieurs tours, sandales de cuir." },
        { titre: "Astrologue de Babylone", description: "Robe à volants frangés superposés, châle enroulé en spirale autour du corps, étoiles brodées au fil d'or, large ceinture tissée." },
        { titre: "Druide des forêts gauloises", description: "Longue tunique de laine, cape sagum à carreaux agrafée d'une grande fibule de bronze, torque torsadé au cou, ceinture de cuir à pendeloques." },
        { titre: "Aède voyageur", description: "Chiton court teint, chlamyde agrafée à l'épaule droite, ceinture fine, besace de cuir en bandoulière, sandales lacées." },
        { titre: "Sénateur romain", description: "Toge à bande pourpre drapée sur une tunique blanche, ceinture cachée, bottines calcei de cuir rouge." },
        { titre: "Vestale", description: "Stola blanche longue, palla drapée sur les épaules, cingulum noué à la taille, sandales fermées." },
        { titre: "Caravanier nabatéen", description: "Robe ample couleur sable, manteau de laine rayée, large ceinture de cuir clouté de cuivre, sandales épaisses, écharpe nouée au cou." },
        { titre: "Prêtresse minoenne", description: "Jupe longue à volants superposés, corsage ajusté à manches courtes fermé sur la poitrine, ceinture de métal serrée, motifs peints de vagues et de lys." },
        { titre: "Sage de l'empire Maurya", description: "Dhoti drapé et noué, étole uttariya jetée sur les épaules, ceinture brodée, bracelets de bras et de poignets." },
        { titre: "Noble thrace", description: "Zeira (long manteau aux motifs géométriques) sur une tunique ceinturée, bottes en peau de faon à revers, fibule en arc." },
        { titre: "Marchand de Lydie", description: "Tunique brodée de fils d'or, manteau léger drapé, ceinture à bourse de cuir, chaussures souples." },
        { titre: "Disciple de Pythagore", description: "Chiton blanc impeccable, manteau de lin blanc, ceinture de lin tressé, sandales simples, aucune teinture animale." },
        { titre: "Nécromancienne du Tartare", description: "Robe noire à reflets violets, manteau brodé d'asphodèles d'argent, ceinture d'osselets polis enfilés, brassards de cuir sombre." },
        { titre: "Oracle de Séléné", description: "Robe bleu nuit semée d'étoiles d'argent, cape légère presque transparente, fibules en croissant de lune, ceinture de perles." },
        { titre: "Enchanteresse de Colchide", description: "Robe longue rouge sombre brodée de toisons dorées, châle de laine fine, ceinture tressée de fils d'or, bracelets de serpent enroulés." },
        { titre: "Initié de Samothrace", description: "Manteau pourpre sur tunique sombre, cordon rouge noué à la taille, fibule en forme d'anneau de fer, sandales lacées." },
        { titre: "Fileuse des Moires", description: "Robe gris perle parcourue de fils d'argent entrelacés, écharpe longue, ceinture à petits fuseaux d'ivoire suspendus." },
        { titre: "Sibylle de Cumes", description: "Robe safran à plis lourds, étole d'épaule, ceinture de feuilles de chêne en bronze, sandales à hautes lanières." },
        { titre: "Nymphe des sources", description: "Chiton vert d'eau aux plis ondulants comme des vagues, ceinture de coquillages enfilés, brassards de nacre, sandales fines." },
        { titre: "Hiérophante de Dionysos", description: "Chiton long pourpre, nébride (peau de faon) nouée sur une épaule, ceinture de lierre tressé, bottines à revers." },
        { titre: "Hiérodule d'Ishtar", description: "Robe frangée bleu profond, châle drapé, ceinture et bracelets de lapis-lazuli et d'or, sandales à boucles." },
        { titre: "Archimage d'Atlantide", description: "Robe turquoise et blanche à motifs de cercles concentriques, ceinture et fermoirs d'orichalque rougeoyant, manteau léger à bordure ondulée." },
        { titre: "Mystique de Mithra", description: "Tunique à manches longues, manteau rouge agrafé sur l'épaule, pantalon perse ample, ceinture de cuir à soleil rayonnant." },
        { titre: "Marchand de Carthage", description: "Longue tunique à manches, écharpe rayée enroulée en diagonale, ceinture de lin à pompons, sandales de cuir rouge." },
        { titre: "Conteur des steppes sogdiennes", description: "Caftan de soie croisé à revers brodés, pantalon serré, bottes souples, ceinture à petites plaques d'argent." },
        { titre: "Prêtre d'Hélios", description: "Chiton blanc à bordure dorée en rayons, manteau couleur d'aube, ceinture à disque solaire de bronze poli, sandales." }
    ],
    "Armure intermédiaire": [
        { titre: "Linothorax macédonien", description: "Corselet de lin collé blanc, épaulières rabattues et lacées sur la poitrine, deux rangs de ptéruges, chiton rouge en dessous, brassards de cuir." },
        { titre: "Spolas béotienne", description: "Corselet de cuir épais teint en ocre, ptéruges de cuir à franges, brassards de cuir lacés, jambières de feutre." },
        { titre: "Peltaste thrace", description: "Tunique à motifs géométriques, plastron de cuir sur le torse, manteau zeira roulé à la ceinture, bottes en peau de faon." },
        { titre: "Archer crétois", description: "Tunique courte, plastron de cuir clouté de bronze, brassard d'archer lacé à l'avant-bras gauche, ceinture à rabat, jambières de cuir." },
        { titre: "Cavalier numide", description: "Tunique légère sans manches, gilet de cuir souple à lacets, large ceinture tressée, jambières de cuir jusqu'aux genoux." },
        { titre: "Archer scythe", description: "Caftan de cuir couvert de petites écailles d'os cousues, pantalon à motifs, bottes souples, ceinture à plaques animalières." },
        { titre: "Caetratus ibère", description: "Tunique blanche à bordure pourpre, pectoral de cuir portant un disque de bronze, large ceinture à boucle ajourée, jambières de cuir." },
        { titre: "Éclaireur parthe", description: "Tunique croisée, gilet lamellaire de cuir laqué, pantalon bouffant, ceinture à plaques, bottes de cavalier." },
        { titre: "Amazone de Thémiscyre", description: "Tunique courte à motifs de losanges, pantalon moulant à motifs, plastron de cuir moulé, cape courte, bottes à lacets." },
        { titre: "Rétiaire de l'arène", description: "Manica de cuir et de lin matelassé au bras, épaulière de bronze, pagne et large ceinture de cuir (balteus), jambières de lin matelassé." },
        { titre: "Gladiateur thrace", description: "Manica matelassée, hautes jambières de lin matelassé, ceinture de cuir large, tunique courte à bandes, brassard de bronze." },
        { titre: "Guerrier dace", description: "Tunique longue à manches, manteau agrafé, plastron d'écailles de corne cousues sur cuir, pantalon et bottes." },
        { titre: "Garde nabatéen", description: "Corselet de cuir bouilli teint, écharpe de lin croisée sur la poitrine, ptéruges courts, bottes de désert." },
        { titre: "Chasseur d'Arcadie", description: "Exômide de laine, pèlerine en peau de loup sur les épaules, brassards de cuir, ceinture de chasse à boucle de corne." },
        { titre: "Garde ptolémaïque", description: "Linothorax de lin collé avec un panneau d'écailles de bronze sur le flanc, ptéruges teints en bleu, chiton blanc." },
        { titre: "Hippeus thessalien", description: "Chlamyde agrafée, corselet de cuir moulé, ceinture large, hautes bottes de cavalier lacées." },
        { titre: "Archer d'Égypte", description: "Corselet de lin matelassé à lanières croisées, pagne shendyt plissé, brassard de cuir, ceinture à pan tombant." },
        { titre: "Conducteur de char hittite", description: "Longue tunique lamellaire de cuir teint, ceinture à franges, brassards de cuir, bottes à bout relevé." },
        { titre: "Archer assyrien", description: "Corselet lamellaire court de cuir sur une longue tunique à franges, ceinture large, brassards lacés." },
        { titre: "Pirate cilicien", description: "Tunique rayée, corselet de cuir clouté, écharpe nouée à la taille, brassards de cuir, jambières courtes." },
        { titre: "Mercenaire galate", description: "Tunique à carreaux, braies, pèlerine de cuir, ceinture de chaînette de bronze, torque au cou." },
        { titre: "Frondeur des Baléares", description: "Tunique de lin, gilet de cuir épais, ceinture à lanières multiples, jambières de cuir souple." },
        { titre: "Guerrier samnite", description: "Pectoral carré de bronze sur une tunique de lin, large ceinture de bronze, ptéruges de cuir, jambières de cuir." },
        { titre: "Veneur perse", description: "Kandys de cuir, gilet matelassé brodé, pantalon anaxyrides, ceinture à plaques, bottes souples." },
        { titre: "Garde du temple de Delphes", description: "Linothorax blanc à liserés dorés, ptéruges à franges, chiton bleu, brassards de cuir clair." },
        { titre: "Rôdeuse d'Artémis", description: "Corselet de cuir vert sombre ciselé de croissants de lune, cape légère, brassards de chasse, jambières lacées." },
        { titre: "Messager d'Hermès", description: "Linothorax léger orné d'ailes peintes, chlamyde courte, jambières de cuir souple à petites ailes ciselées." },
        { titre: "Éclaireur des Enfers", description: "Cuir noir bouilli gravé d'asphodèles, cape couleur de fumée, brassards sombres, ceinture à boucle d'argent terni." },
        { titre: "Danseuse-guerrière de Cnossos", description: "Corselet de cuir peint de spirales, jupe courte à lanières, brassards et jambières de cuir à motifs de taureaux." },
        { titre: "Myrmidon éclaireur", description: "Linothorax noir à liserés rouges, ptéruges noirs, ceinture large, brassards de cuir brun." },
        { titre: "Cavalier sarmate", description: "Caftan d'écailles de corne cousues, pantalon serré, bottes hautes, ceinture à plaques d'argent." },
        { titre: "Gardien de la Toison", description: "Corselet de cuir brun à motifs de bélier doré, ptéruges à franges dorées, chiton pourpre, jambières lacées." },
        { titre: "Lancier ibère", description: "Corselet de cuir à rivets de bronze, ceinture large à crochets ajourés, tunique écrue, jambières de cuir." },
        { titre: "Garde de Pétra", description: "Cuirasse de cuir teinte rose sable, écharpe de lin rouge, ptéruges, sandales montantes." }
    ],
    "Armure lourde": [
        { titre: "Hoplite de Sparte", description: "Cuirasse musclée de bronze, épaulières, ptéruges de cuir, chiton écarlate, cnémides de bronze moulées sur les jambes." },
        { titre: "Légionnaire", description: "Lorica segmentata de bandes de fer, tunique rouge, cingulum à pendants de cuir clouté, jambières de cuir." },
        { titre: "Centurion", description: "Lorica squamata d'écailles de bronze, phalères de décoration sur la poitrine, tunique blanche, ptéruges, jambières de bronze." },
        { titre: "Cataphracte parthe", description: "Écailles de fer du cou aux genoux, manches lamellaires articulées, jambières d'écailles, ceinture à plaques." },
        { titre: "Immortel perse", description: "Cuirasse d'écailles dorées sous une robe longue brodée, manches couvertes d'écailles, ceinture à plaques d'or, pantalon serré." },
        { titre: "Garde prétorien", description: "Cuirasse musclée ornée d'une tête de gorgone, ptéruges à franges, tunique pourpre, cingulum d'argent." },
        { titre: "Lamellaire assyrien", description: "Longue cotte lamellaire de bronze jusqu'aux chevilles, ceinture large, brassards de bronze." },
        { titre: "Héros de Mycènes", description: "Panoplie de bronze à grands anneaux superposés autour du torse, épaulières en coquille, col haut, jambières de bronze." },
        { titre: "Champion samnite", description: "Cuirasse à trois disques de bronze, large ceinture de bronze, tunique courte, jambière de bronze unique." },
        { titre: "Argyraspide", description: "Thorax couvert de lames d'argent poli, ptéruges, chiton blanc, cnémides argentées." },
        { titre: "Bande sacrée de Carthage", description: "Cuirasse musclée de bronze à palmettes ciselées, tunique pourpre, cnémides, ceinture de cuir clouté." },
        { titre: "Champion celtibère", description: "Cuirasse de bronze à deux pectoraux ronds reliés de chaînettes, tunique de laine, ceinture à crochets, jambières." },
        { titre: "Archer de char égyptien", description: "Corselet d'écailles de bronze cousues sur cuir, pagne plissé, brassards de bronze, ceinture à pan tombant." },
        { titre: "Garde hittite", description: "Longue robe couverte d'écailles de bronze, ceinture large, bottes à bout relevé." },
        { titre: "Hoplite archaïque", description: "Cuirasse en cloche de bronze à bord évasé, ptéruges, chiton, cnémides." },
        { titre: "Noble étrusque", description: "Cuirasse de lin renforcée de plaques de bronze, ceinture ornée, ptéruges, jambières de bronze." },
        { titre: "Murmillon", description: "Manica d'écailles sur lin matelassé, large balteus de cuir, pagne, ocrea de bronze sur une jambe." },
        { titre: "Clibanaire de Palmyre", description: "Écailles de fer sous un manteau de soie brodé, manches lamellaires, jambières d'écailles." },
        { titre: "Hypaspiste", description: "Cuirasse composite de bronze et de lin, ptéruges, chiton rouge, cnémides." },
        { titre: "Champion d'Ourartou", description: "Cuirasse d'écailles de bronze gravées de lions, ceinture de bronze ciselée, brassards." },
        { titre: "Champion d'Héphaïstos", description: "Bronze noirci parcouru de veines de braise, ptéruges de cuir roussi, cnémides martelées." },
        { titre: "Gardien du Labyrinthe", description: "Cuirasse gravée de méandres en labyrinthe et de têtes de taureaux, ptéruges, cnémides de bronze." },
        { titre: "Champion de Poséidon", description: "Écailles nacrées bleu-vert comme celles d'un poisson, lanières vert d'eau, ceinture de bronze ornée de vagues." },
        { titre: "Myrmidon d'Achille", description: "Cuirasse musclée noire rehaussée d'or, ptéruges noirs, cnémides dorées." },
        { titre: "Gardien d'Hadès", description: "Bronze sombre patiné, motifs de grenades et d'asphodèles, ptéruges noirs, cnémides sombres." },
        { titre: "Héritier de Talos", description: "Bronze poli rivé comme un automate, jointures et rivets apparents, ptéruges de bronze articulés." },
        { titre: "Champion d'Arès", description: "Bronze rouge sang gravé de lances et de chiens de guerre, ptéruges écarlates, cnémides." },
        { titre: "Garde d'Atlantide", description: "Écailles d'orichalque rougeoyant, ceinture à motifs de cercles concentriques, jambières d'orichalque." },
        { titre: "Lorica plumata", description: "Écailles en forme de plumes, chacune nervurée, tunique blanche, ptéruges, jambières de bronze." },
        { titre: "Roi de Macédoine", description: "Cuirasse anatomique de fer à appliques d'or, ptéruges dorés, manteau pourpre." },
        { titre: "Cataphracte sarmate", description: "Écailles de corne et de fer, pantalon d'écailles, ceinture à plaques d'argent, bottes hautes." },
        { titre: "Légat romain", description: "Cuirasse musclée argentée à lambrequins, cingulum noué, paludamentum rouge sur les épaules." },
        { titre: "Champion de Babylone", description: "Cuirasse lamellaire de bronze émaillé de bleu, longue tunique frangée, brassards de bronze." },
        { titre: "Gardien du Soleil de Rhodes", description: "Cuirasse musclée de bronze doré gravée de rayons, ptéruges blancs, cnémides polies." }
    ]
};

// Une palette de couleurs tirée en plus de la variation : la même tenue ne
// revient jamais deux fois sous les mêmes teintes.
window.PALETTES_TENUES = [
    "bronze chaud et rouge écarlate", "blanc cassé et bleu égéen", "noir profond et or",
    "ocre et terre de Sienne", "vert olive et laiton", "pourpre de Tyr et argent",
    "sable et turquoise", "gris ardoise et cuivre", "safran et brun",
    "bleu nuit et argent", "vert profond et bronze patiné", "lin naturel et rouge brique",
    "ivoire et lapis-lazuli", "rouille et noir", "blanc et or", "cramoisi et ivoire"
];

// Combien de variations récentes passent leur tour, par type d'armure.
window.MEMOIRE_VARIATIONS_TENUES = 12;
const CLE_RECENTES = "ivalis_variations_tenues_recentes";

const lireRecentes = () => {
    try { return JSON.parse(localStorage.getItem(CLE_RECENTES) || "{}") || {}; } catch (e) { return {}; }
};
const ecrireRecentes = (r) => {
    try { localStorage.setItem(CLE_RECENTES, JSON.stringify(r)); } catch (e) { /* stockage indisponible */ }
};

// Le type d'armure d'un objet (son `type`, sinon son modèle).
window.typeTenue = function(objet) {
    const t = (objet && (objet.type || objet.modele)) || "";
    return window.VARIATIONS_TENUES[t] ? t : null;
};

// LE TIRAGE. Chaque armure du lot reçoit `variationTenue` = { titre,
// description, palette } — sauf celle qui en a déjà une. Pas deux fois la
// même dans le lot ; les plus récentes (sur cet appareil) passent leur tour
// tant qu'il en reste d'autres.
window.tirerVariationsTenues = function(objets, hasard) {
    const tirer = typeof hasard === "function" ? hasard : Math.random;
    const recentes = lireRecentes();
    const prises = {};
    (objets || []).forEach(o => {
        if (!o || o.emplacement !== "Armure" || o.variationTenue) return;
        const type = window.typeTenue(o);
        if (!type) return;
        const liste = window.VARIATIONS_TENUES[type];
        const dejaLot = prises[type] || (prises[type] = []);
        const dejaVues = new Set([...(recentes[type] || []), ...dejaLot]);
        let choix = liste.filter(v => !dejaVues.has(v.titre));
        if (choix.length === 0) choix = liste.filter(v => !dejaLot.includes(v.titre));
        if (choix.length === 0) choix = liste;
        const v = choix[Math.min(choix.length - 1, Math.floor(tirer() * choix.length))];
        const palettes = window.PALETTES_TENUES;
        const palette = palettes[Math.min(palettes.length - 1, Math.floor(tirer() * palettes.length))];
        o.variationTenue = { titre: v.titre, description: v.description, palette };
        dejaLot.push(v.titre);
        recentes[type] = [...(recentes[type] || []).filter(t => t !== v.titre), v.titre]
            .slice(-window.MEMOIRE_VARIATIONS_TENUES);
    });
    ecrireRecentes(recentes);
    return objets;
};

// La variation en une phrase, telle qu'elle part aux deux IA.
window.texteVariationTenue = function(v) {
    if (!v) return "";
    return `${v.titre} — ${v.description}` + (v.palette ? ` Couleurs dominantes : ${v.palette}.` : "");
};
