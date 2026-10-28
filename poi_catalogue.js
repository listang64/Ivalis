// =========================================================================
//  IVALIS — LE CATALOGUE DES POINTS D'INTÉRÊT (v277)
// =========================================================================
//  Nico : « un algo avec plein, plein de possibilités et de variantes de lieux
//  / points d'intérêt ; l'IA prend dedans et crée des rencontres brodées
//  dessus. Tu me donneras le document avec la liste de tous les trucs
//  possibles. »
//
//  LE TIRAGE (tirerGrainePoi) : une famille (au poids), un type de la
//  famille (au poids, multiplié par l'accord avec le terrain et la région),
//  une variante, une ambiance, une accroche, un état. L'IA (poi_creation.js)
//  reçoit cette graine et brode le lieu dessus.
//
//  LES POIDS : `poids` de base ; `terrains` : les terrains où le type va de
//  soi (×3 s'il y est, ×0,25 s'il n'y est pas ; "partout" : ×1 partout) ;
//  `regions` : { numéro de la carte régionale : multiplicateur } (le lore).
//  `batiments` : [min, max] de bâtiments nommés que l'IA crée avec le lieu.
//
//  LES TERRAINS : foret, plaine, colline, montagne, marais, desert, cote,
//  riviere, lac, route (lus dans l'analyse du terrain, motsTerrain).
//
//  Script simple (pas un module) : les bancs le chargent tel quel, et
//  CATALOGUE_POI.md en est tiré (node tests_monstres/_catalogue_poi_md.mjs).
// =========================================================================
(function () {
    const T = (...t) => t;
    const FAMILLES = [
        { id: "habitat", nom: "Habitats", poids: 20, types: [
            { id: "hameau", nom: "Hameau", poids: 8, terrains: T("plaine", "colline", "foret", "riviere"), batiments: [2, 4],
              variantes: ["de bergers", "de charbonniers", "de bûcherons", "de vignerons", "de tisserands", "de potiers", "de chasseurs de peaux", "d'apiculteurs"] },
            { id: "ferme_isolee", nom: "Ferme isolée", poids: 6, terrains: T("plaine", "colline", "riviere"), batiments: [1, 3],
              variantes: ["d'oliviers", "de céréales", "d'élevage de chèvres", "de chevaux", "aux mains d'une veuve", "fortifiée d'une palissade"] },
            { id: "village_pecheurs", nom: "Village de pêcheurs", poids: 6, terrains: T("cote", "lac", "riviere"), batiments: [2, 4],
              variantes: ["sur pilotis", "accroché à une crique", "aux filets séchant au soleil", "de pêcheurs d'éponges", "de ramasseurs de coquillages"] },
            { id: "hameau_troglodyte", nom: "Hameau troglodyte", poids: 4, terrains: T("colline", "montagne"), batiments: [1, 3],
              variantes: ["creusé dans la falaise", "aux portes peintes", "relié par des escaliers taillés", "à demi enfoui sous la roche"] },
            { id: "village_pilotis", nom: "Village sur pilotis", poids: 4, terrains: T("marais", "lac"), batiments: [2, 3],
              variantes: ["entre les roseaux", "relié par des passerelles", "de cueilleurs de joncs", "noyé de brume"] },
            { id: "camp_nomades", nom: "Camp de nomades", poids: 5, terrains: T("desert", "plaine", "colline"), regions: { 5: 4 }, batiments: [0, 2],
              variantes: ["de tentes en peaux", "de caravaniers", "de bergers transhumants", "de marchands de sel", "de conteurs itinérants"] },
            { id: "bivouac_ethere", nom: "Bivouac éthéré", poids: 2, terrains: T("desert"), regions: { 5: 8 }, batiments: [0, 2],
              variantes: ["autour d'un puits", "de guerriers en errance", "d'une famille de devins", "aux voiles flottant au vent"] },
            { id: "colonie_bucherons", nom: "Colonie de bûcherons", poids: 4, terrains: T("foret"), batiments: [1, 3],
              variantes: ["aux troncs empilés", "au bord d'un torrent", "autour d'une scierie à eau", "de résiniers"] },
            { id: "village_bergers", nom: "Village de bergers", poids: 4, terrains: T("colline", "montagne", "plaine"), batiments: [1, 3],
              variantes: ["aux bergeries de pierre sèche", "au son des cloches", "de fromagers", "d'estive"] },
            { id: "campement_refugies", nom: "Campement de réfugiés", poids: 3, terrains: T("partout"), batiments: [0, 2],
              variantes: ["fuyant une guerre", "chassés par l'Engeance", "d'esclaves évadés", "d'un village incendié", "fuyant une épidémie"] },
            { id: "hameau_gobs", nom: "Hameau de Gobs", poids: 2, terrains: T("foret", "marais"), regions: { 1: 8, 2: 2 }, batiments: [1, 3],
              variantes: ["dans les racines d'arbres géants", "caché sous les fougères", "de chapardeurs", "de guérisseurs à herbes"] },
            { id: "village_vargen", nom: "Village vargen caché", poids: 1, terrains: T("foret", "colline"), regions: { 11: 8, 7: 3 }, batiments: [1, 3],
              variantes: ["derrière une cascade", "dans un vallon secret", "de familles traquées", "aux sentinelles muettes"] },
            { id: "camp_tribal", nom: "Camp tribal tatoué", poids: 1, terrains: T("foret"), regions: { 6: 8 }, batiments: [1, 2],
              variantes: ["autour d'un arbre-totem", "de chasseurs à l'arc", "de chamans de la nature", "aux huttes de feuillage"] },
            { id: "communaute_ermites", nom: "Communauté d'ermites", poids: 2, terrains: T("montagne", "desert", "foret"), batiments: [1, 2],
              variantes: ["ascètes silencieux", "philosophes exilés", "anciens soldats repentis", "gardiens d'un secret"] }
        ] },
        { id: "sacre", nom: "Lieux sacrés", poids: 15, types: [
            { id: "sanctuaire_route", nom: "Sanctuaire de bord de route", poids: 6, terrains: T("partout"), batiments: [0, 1],
              variantes: ["d'un dieu des voyageurs", "couvert d'offrandes", "à la flamme jamais éteinte", "gardé par une vieille prêtresse"] },
            { id: "autel_ancien", nom: "Autel ancien", poids: 5, terrains: T("colline", "montagne", "foret"), batiments: [0, 1],
              variantes: ["taché d'un sang ancien", "dédié à un dieu oublié", "fendu par la foudre", "orné de bas-reliefs effacés"] },
            { id: "oracle", nom: "Oracle", poids: 3, terrains: T("montagne", "colline", "foret"), batiments: [1, 2],
              variantes: ["dans une grotte enfumée", "aux trois sibylles", "qui ne parle qu'en énigmes", "au-dessus d'une faille"] },
            { id: "source_sacree", nom: "Source sacrée", poids: 4, terrains: T("foret", "colline", "montagne"), batiments: [0, 1],
              variantes: ["aux eaux guérisseuses", "où l'on jette des pièces", "gardée par des nymphes de pierre", "aux eaux rouges"] },
            { id: "bois_sacre", nom: "Bois sacré", poids: 4, terrains: T("foret"), batiments: [0, 1],
              variantes: ["aux arbres jamais coupés", "suspendu d'ex-voto", "où chantent les oiseaux la nuit", "interdit aux armes"] },
            { id: "cercle_pierres", nom: "Cercle de pierres levées", poids: 3, terrains: T("plaine", "colline"), batiments: [0, 0],
              variantes: ["qui chantent au vent", "aux runes antiques", "aligné sur les étoiles", "où l'herbe ne pousse pas"] },
            { id: "statue_colossale", nom: "Statue colossale", poids: 3, terrains: T("plaine", "colline", "cote"), batiments: [0, 1],
              variantes: ["d'un héros oublié", "à demi enfouie", "décapitée", "tournée vers la mer", "aux yeux de bronze"] },
            { id: "monastere", nom: "Monastère isolé", poids: 3, terrains: T("montagne", "colline"), batiments: [2, 4],
              variantes: ["accroché à un piton", "de moines copistes", "de guerriers-prêtres", "presque abandonné"] },
            { id: "temple_souterrain", nom: "Temple souterrain", poids: 2, terrains: T("montagne", "colline", "desert"), batiments: [1, 2],
              variantes: ["éclairé de lampes à huile", "inondé à moitié", "aux murs couverts de fresques", "à l'entrée dissimulée"] },
            { id: "sanctuaire_ondari", nom: "Sanctuaire ondari", poids: 1, terrains: T("lac", "cote", "riviere"), regions: { 7: 6, 11: 6 }, batiments: [0, 2],
              variantes: ["au bord du lac aux vœux", "aux bassins de prière", "aux coquillages offerts", "gardé par des pèlerins"] },
            { id: "chapelle_ordre", nom: "Chapelle de l'Ordre d'Ivalis", poids: 2, terrains: T("partout"), batiments: [1, 2],
              variantes: ["tenue par un vieux cadet", "délabrée", "servant de relais aux frères", "aux archives de l'Engeance"] },
            { id: "lieu_pelerinage", nom: "Lieu de pèlerinage", poids: 2, terrains: T("partout"), batiments: [1, 3],
              variantes: ["d'un saint guérisseur", "d'une bataille légendaire", "où un dieu aurait marché", "aux marchands de reliques"] }
        ] },
        { id: "ruines", nom: "Ruines", poids: 14, types: [
            { id: "villa_effondree", nom: "Villa effondrée", poids: 5, terrains: T("plaine", "colline", "cote"), batiments: [0, 2],
              variantes: ["aux mosaïques intactes", "envahie de vigne sauvage", "brûlée", "squattée par des vagabonds"] },
            { id: "forteresse_ruine", nom: "Forteresse en ruine", poids: 4, terrains: T("colline", "montagne"), batiments: [1, 2],
              variantes: ["aux remparts éventrés", "d'un ancien roi", "repaire d'oiseaux", "aux souterrains condamnés"] },
            { id: "amphitheatre", nom: "Amphithéâtre envahi", poids: 3, terrains: T("plaine", "colline"), batiments: [0, 1],
              variantes: ["par la forêt", "par les eaux", "par des nomades", "aux gradins effondrés"] },
            { id: "aqueduc", nom: "Aqueduc brisé", poids: 3, terrains: T("plaine", "colline", "riviere"), batiments: [0, 1],
              variantes: ["enjambant un vallon", "dont un tronçon coule encore", "aux arches couvertes de lierre", "écroulé dans une rivière"] },
            { id: "tour_ecroulee", nom: "Tour écroulée", poids: 4, terrains: T("partout"), batiments: [0, 1],
              variantes: ["d'un mage disparu", "de guet", "au sommet encore debout", "à l'escalier sans fin"] },
            { id: "cite_engloutie", nom: "Cité engloutie", poids: 2, terrains: T("lac", "cote", "marais"), batiments: [0, 2],
              variantes: ["dont émergent des toits", "visible à marée basse", "aux colonnes sous l'eau", "hantée de reflets"] },
            { id: "colonnade", nom: "Colonnade isolée", poids: 3, terrains: T("plaine", "desert", "colline"), batiments: [0, 0],
              variantes: ["sans temple", "à moitié ensablée", "aux chapiteaux sculptés", "plantée au milieu de rien"] },
            { id: "temple_ruine", nom: "Temple en ruine", poids: 4, terrains: T("partout"), batiments: [0, 2],
              variantes: ["d'un dieu de la guerre", "au toit effondré", "aux statues renversées", "réoccupé par un culte"] },
            { id: "champ_bataille", nom: "Champ de bataille ancien", poids: 2, terrains: T("plaine", "colline"), batiments: [0, 1],
              variantes: ["jonché d'armes rouillées", "aux tertres alignés", "où l'on entend des cris la nuit", "aux étendards en lambeaux"] },
            { id: "palais_oublie", nom: "Palais oublié", poids: 1, terrains: T("foret", "desert", "colline"), batiments: [1, 3],
              variantes: ["sous les racines", "sous le sable", "aux jardins redevenus sauvages", "d'une reine sans nom"] },
            { id: "phare_eteint", nom: "Phare éteint", poids: 2, terrains: T("cote"), batiments: [0, 1],
              variantes: ["sur un promontoire", "dont le feu se rallume seul", "aux naufrageurs", "à demi effondré"] }
        ] },
        { id: "funeraire", nom: "Lieux funéraires", poids: 8, types: [
            { id: "tumulus", nom: "Tumulus", poids: 4, terrains: T("plaine", "colline"), batiments: [0, 0],
              variantes: ["d'un chef de guerre", "ouvert par des pillards", "couronné d'un chêne", "aux pierres gravées"] },
            { id: "necropole", nom: "Nécropole", poids: 3, terrains: T("colline", "desert", "montagne"), batiments: [0, 2],
              variantes: ["taillée dans la roche", "aux tombes alignées", "des anciens rois", "gardée par des statues"] },
            { id: "mausolee", nom: "Mausolée", poids: 3, terrains: T("partout"), batiments: [0, 1],
              variantes: ["d'une famille noble", "scellé", "pillé", "aux lampes éternelles"] },
            { id: "catacombes", nom: "Entrée de catacombes", poids: 2, terrains: T("colline", "plaine"), batiments: [0, 1],
              variantes: ["sous un temple", "sous une ferme", "aux ossements rangés", "inondées"] },
            { id: "cimetiere_abandonne", nom: "Cimetière abandonné", poids: 3, terrains: T("partout"), batiments: [0, 1],
              variantes: ["d'un village disparu", "aux stèles renversées", "envahi de cyprès", "où rôdent des pilleurs"] },
            { id: "bucher_funeraire", nom: "Bûcher funéraire", poids: 2, terrains: T("plaine", "colline", "cote"), batiments: [0, 0],
              variantes: ["encore fumant", "prêt pour un héros", "aux offrandes calcinées", "veillé par des pleureuses"] },
            { id: "tombe_heros", nom: "Tombe d'un héros", poids: 2, terrains: T("partout"), batiments: [0, 1],
              variantes: ["dont l'arme est plantée", "visitée par des pèlerins", "profanée", "dont le nom a été effacé"] }
        ] },
        { id: "nature", nom: "Nature remarquable", poids: 14, types: [
            { id: "grotte", nom: "Grotte", poids: 6, terrains: T("colline", "montagne", "foret", "cote"), batiments: [0, 0],
              variantes: ["aux cristaux", "aux peintures anciennes", "d'où souffle un vent chaud", "habitée par des chauves-souris", "marine"] },
            { id: "cascade", nom: "Cascade", poids: 4, terrains: T("foret", "montagne", "colline", "riviere"), batiments: [0, 1],
              variantes: ["cachant une caverne", "aux arcs-en-ciel", "glacée", "où l'on se baigne pour se purifier"] },
            { id: "arbre_millenaire", nom: "Arbre millénaire", poids: 4, terrains: T("foret", "plaine"), batiments: [0, 0],
              variantes: ["creux", "aux branches chargées d'offrandes", "foudroyé mais vivant", "où nichent des oiseaux étranges"] },
            { id: "source_chaude", nom: "Source chaude", poids: 3, terrains: T("montagne", "colline"), regions: { 2: 3, 3: 3 }, batiments: [0, 1],
              variantes: ["sulfureuse", "aux bassins naturels", "fréquentée par des malades", "fumante dans le froid"] },
            { id: "gouffre", nom: "Gouffre", poids: 3, terrains: T("montagne", "colline", "desert"), batiments: [0, 0],
              variantes: ["sans fond", "d'où monte un chant", "enjambé d'un pont de corde", "où l'on jette les condamnés"] },
            { id: "clairiere", nom: "Clairière enchantée", poids: 3, terrains: T("foret"), batiments: [0, 0],
              variantes: ["aux fleurs lumineuses", "où le temps semble suspendu", "au cercle de champignons", "aux statues de mousse"] },
            { id: "arche_pierre", nom: "Arche de pierre naturelle", poids: 2, terrains: T("desert", "cote", "montagne"), batiments: [0, 0],
              variantes: ["sculptée par le vent", "au-dessus de la mer", "gravée de noms", "qu'on dit être une porte"] },
            { id: "fumerolles", nom: "Champ de fumerolles", poids: 2, terrains: T("montagne", "colline", "desert"), regions: { 2: 5, 3: 3 }, batiments: [0, 0],
              variantes: ["aux cristaux de soufre", "aux vapeurs prophétiques", "brûlant", "où travaillent des ramasseurs de soufre"] },
            { id: "oasis", nom: "Oasis", poids: 3, terrains: T("desert"), regions: { 5: 4 }, batiments: [0, 2],
              variantes: ["aux palmiers", "disputée par deux clans", "presque tarie", "au bassin de pierre ancien"] },
            { id: "foret_petrifiee", nom: "Forêt pétrifiée", poids: 1, terrains: T("desert", "colline", "plaine"), batiments: [0, 0],
              variantes: ["aux troncs de pierre", "maudite, dit-on", "aux reflets d'agate", "où rien ne vit"] },
            { id: "lac_cristal", nom: "Lac de cristal", poids: 2, terrains: T("montagne", "foret", "lac"), batiments: [0, 1],
              variantes: ["aux eaux transparentes", "gelé en toute saison", "aux reflets d'étoiles", "où dorment des épaves"] },
            { id: "geyser", nom: "Geyser", poids: 1, terrains: T("montagne", "colline"), regions: { 2: 3, 3: 3 }, batiments: [0, 0],
              variantes: ["régulier comme un sablier", "qu'on vénère", "aux terrasses blanches", "capricieux"] },
            { id: "recif", nom: "Récif", poids: 2, terrains: T("cote"), regions: { 12: 4, 13: 3 }, batiments: [0, 0],
              variantes: ["aux épaves", "visible à marée basse", "où chantent les vagues", "aux coraux rouges"] }
        ] },
        { id: "passage", nom: "Passages et routes", poids: 10, types: [
            { id: "pont_ancien", nom: "Pont ancien", poids: 4, terrains: T("riviere", "foret", "montagne"), batiments: [0, 1],
              variantes: ["de pierre à trois arches", "de bois branlant", "gardé par un péager", "à moitié emporté par les crues"] },
            { id: "gue", nom: "Gué", poids: 3, terrains: T("riviere", "marais"), batiments: [0, 1],
              variantes: ["aux pierres glissantes", "gardé par une famille de passeurs", "où l'on a vu des noyés", "marqué de bornes sculptées"] },
            { id: "col", nom: "Col", poids: 3, terrains: T("montagne", "colline"), batiments: [0, 1],
              variantes: ["balayé par le vent", "aux cairns", "d'un péage oublié", "enneigé"] },
            { id: "tour_guet", nom: "Tour de guet", poids: 4, terrains: T("partout"), batiments: [1, 1],
              variantes: ["encore gardée", "abandonnée", "aux feux de signaux", "surveillant une route commerciale"] },
            { id: "relais_route", nom: "Relais de route", poids: 4, terrains: T("plaine", "route", "colline"), batiments: [1, 3],
              variantes: ["avec une auberge", "de messagers", "aux écuries pleines", "tenu par un ancien gladiateur"] },
            { id: "borne_milliaire", nom: "Borne milliaire", poids: 2, terrains: T("route", "plaine"), batiments: [0, 0],
              variantes: ["indiquant une cité disparue", "couverte de messages gravés", "renversée", "où l'on laisse des offrandes"] },
            { id: "bac_passeur", nom: "Bac de passeur", poids: 2, terrains: T("riviere", "lac"), batiments: [0, 1],
              variantes: ["tiré par une corde", "d'un vieux passeur bavard", "réclamant un prix étrange", "fréquenté par des contrebandiers"] },
            { id: "carrefour_statue", nom: "Carrefour à la statue", poids: 2, terrains: T("plaine", "route"), batiments: [0, 1],
              variantes: ["d'un dieu à trois visages", "aux pendus", "où l'on vend de tout", "aux chemins disparus"] },
            { id: "peage", nom: "Poste de péage", poids: 2, terrains: T("route", "colline", "riviere"), batiments: [1, 2],
              variantes: ["légal", "tenu par des bandits", "d'un seigneur local", "abandonné à la hâte"] }
        ] },
        { id: "activite", nom: "Activités et commerce", poids: 11, types: [
            { id: "mine", nom: "Mine", poids: 4, terrains: T("montagne", "colline"), batiments: [1, 3],
              variantes: ["de cuivre", "d'argent", "de sel", "d'étain", "abandonnée", "aux esclaves enchaînés"] },
            { id: "carriere", nom: "Carrière de marbre", poids: 3, terrains: T("colline", "montagne"), batiments: [1, 2],
              variantes: ["blanc", "veiné de rouge", "où dort une statue inachevée", "aux ouvriers en grève"] },
            { id: "comptoir", nom: "Comptoir de commerce", poids: 3, terrains: T("cote", "riviere", "route", "plaine"), batiments: [1, 3],
              variantes: ["de marchands ondari", "d'épices", "de fourrures", "fortifié"] },
            { id: "marche_itinerant", nom: "Marché itinérant", poids: 3, terrains: T("plaine", "route", "desert"), batiments: [0, 2],
              variantes: ["de bestiaux", "d'esclaves", "de curiosités", "de remèdes", "de nomades"] },
            { id: "saline", nom: "Saline", poids: 2, terrains: T("cote", "desert", "marais"), batiments: [1, 2],
              variantes: ["aux bassins miroitants", "de travailleurs gobs", "convoitée", "aux montagnes de sel"] },
            { id: "forge_isolee", nom: "Forge isolée", poids: 3, terrains: T("montagne", "colline", "foret"), regions: { 2: 4, 3: 3 }, batiments: [1, 2],
              variantes: ["d'un forgeron ankylar", "aux armes ornées", "secrète", "au feu de soufre"] },
            { id: "potiers", nom: "Atelier de potiers", poids: 2, terrains: T("riviere", "plaine"), batiments: [1, 2],
              variantes: ["aux amphores peintes", "aux fours à flanc de colline", "de lampes à huile", "familial"] },
            { id: "apiculteurs", nom: "Rucher", poids: 2, terrains: T("colline", "plaine", "foret"), batiments: [0, 1],
              variantes: ["de miel sacré", "aux abeilles agressives", "d'une vieille herboriste", "aux ruches de terre cuite"] },
            { id: "chantier_naval", nom: "Chantier naval", poids: 2, terrains: T("cote", "lac"), regions: { 7: 3, 12: 3 }, batiments: [1, 2],
              variantes: ["de galères", "de barques de pêche", "abandonné", "de pirates"] },
            { id: "herboristerie", nom: "Herboristerie", poids: 2, terrains: T("foret", "marais", "colline"), batiments: [1, 1],
              variantes: ["d'une guérisseuse", "aux plantes rares", "de poisons", "tenue par un Ophior"] },
            { id: "vignoble", nom: "Vignoble", poids: 2, terrains: T("colline", "plaine"), batiments: [1, 2],
              variantes: ["aux vendanges", "réputé", "ravagé", "aux pressoirs de pierre"] },
            { id: "haras", nom: "Haras", poids: 2, terrains: T("plaine"), batiments: [1, 2],
              variantes: ["de chevaux de guerre", "volé récemment", "d'une famille noble", "de bêtes étranges"] }
        ] },
        { id: "militaire", nom: "Lieux militaires", poids: 9, types: [
            { id: "avant_poste", nom: "Avant-poste", poids: 4, terrains: T("partout"), batiments: [1, 3],
              variantes: ["de frontière", "de la garde de la cité", "mal ravitaillé", "en alerte"] },
            { id: "camp_mercenaires", nom: "Camp de mercenaires", poids: 3, terrains: T("plaine", "colline"), batiments: [0, 2],
              variantes: ["entre deux contrats", "recrutant", "aux bannières bariolées", "rançonnant les voyageurs"] },
            { id: "fortin", nom: "Fortin frontalier", poids: 3, terrains: T("colline", "montagne", "riviere"), batiments: [1, 3],
              variantes: ["de bois", "de pierre", "assiégé", "à la garnison réduite"] },
            { id: "camp_legion", nom: "Camp de soldats en marche", poids: 2, terrains: T("plaine", "route"), batiments: [0, 2],
              variantes: ["d'Arcaï", "de Volcanisse", "d'un seigneur local", "rentrant de bataille"] },
            { id: "poste_ordre", nom: "Poste de l'Ordre d'Ivalis", poids: 2, terrains: T("partout"), batiments: [1, 2],
              variantes: ["tenu par un frère et deux cadets", "presque oublié", "traquant une piste de l'Engeance", "servant de refuge"] },
            { id: "tour_signaux", nom: "Tour de signaux", poids: 2, terrains: T("colline", "montagne", "cote"), batiments: [1, 1],
              variantes: ["aux miroirs de bronze", "aux feux", "silencieuse depuis des jours", "aux pigeons messagers"] },
            { id: "palissade", nom: "Palissade abandonnée", poids: 2, terrains: T("foret", "plaine"), batiments: [0, 1],
              variantes: ["d'un camp disparu", "aux traces de combat", "réoccupée", "brûlée"] },
            { id: "camp_entrainement", nom: "Camp d'entraînement", poids: 1, terrains: T("plaine", "colline"), batiments: [1, 2],
              variantes: ["de gladiateurs", "d'orphelins de l'Ordre", "d'archers", "secret"] }
        ] },
        { id: "danger", nom: "Dangers et hors-la-loi", poids: 10, types: [
            { id: "repaire_bandits", nom: "Repaire de bandits", poids: 5, terrains: T("foret", "colline", "montagne"), batiments: [0, 2],
              variantes: ["dans une grotte", "dans des ruines", "d'anciens soldats", "d'une bande d'enfants perdus"] },
            { id: "camp_esclavagistes", nom: "Camp d'esclavagistes", poids: 2, terrains: T("foret", "plaine"), regions: { 1: 6, 10: 3 }, batiments: [0, 2],
              variantes: ["chassant les Gobs", "en route vers Arcaï", "aux cages pleines", "dissimulé en caravane"] },
            { id: "repaire_contrebandiers", nom: "Repaire de contrebandiers", poids: 3, terrains: T("cote", "foret", "marais"), regions: { 1: 3, 12: 3 }, batiments: [0, 2],
              variantes: ["dans une crique", "sous une ferme", "aux tonneaux cachés", "aux signaux de lanternes"] },
            { id: "antre_bete", nom: "Antre d'une bête", poids: 4, terrains: T("foret", "montagne", "marais", "colline"), batiments: [0, 0],
              variantes: ["jonché d'os", "d'une bête mythique", "d'un prédateur blessé", "qu'on croit vide"] },
            { id: "nid_creatures", nom: "Nid de créatures", poids: 3, terrains: T("marais", "foret", "desert", "montagne"), batiments: [0, 0],
              variantes: ["ailées", "venimeuses", "des profondeurs", "inconnues des savants"] },
            { id: "camp_pirates", nom: "Campement de pirates", poids: 1, terrains: T("cote"), regions: { 12: 8, 7: 3 }, batiments: [0, 2],
              variantes: ["sur une plage", "partageant un butin", "réparant un navire", "aux prisonniers"] },
            { id: "camp_deserteurs", nom: "Camp de déserteurs", poids: 2, terrains: T("foret", "colline"), batiments: [0, 1],
              variantes: ["affamés", "armés jusqu'aux dents", "cherchant un passage", "rongés de remords"] },
            { id: "tanière_sorciere", nom: "Tanière de sorcière", poids: 2, terrains: T("marais", "foret"), batiments: [1, 1],
              variantes: ["aux fioles", "aux os suspendus", "qui reçoit les désespérés", "fuyant Volcanisse"] },
            { id: "territoire_geants", nom: "Territoire de Gobs géants", poids: 1, terrains: T("foret", "colline"), regions: { 1: 8 }, batiments: [0, 0],
              variantes: ["aux arbres arrachés", "aux traces immenses", "au repas abandonné", "gardé par des totems"] }
        ] },
        { id: "mystere", nom: "Mystère et magie", poids: 9, types: [
            { id: "tour_mage", nom: "Tour de mage", poids: 3, terrains: T("partout"), regions: { 9: 3, 10: 3, 2: 0.2 }, batiments: [1, 2],
              variantes: ["habitée", "scellée", "en exil", "aux fenêtres de cristal"] },
            { id: "puits_sans_fond", nom: "Puits sans fond", poids: 2, terrains: T("plaine", "colline", "desert"), batiments: [0, 0],
              variantes: ["qui murmure", "où tombent des étoiles", "aux margelles gravées", "gardé par un vieillard"] },
            { id: "portail_ancien", nom: "Portail ancien", poids: 1, terrains: T("montagne", "desert", "foret"), batiments: [0, 0],
              variantes: ["sans mur autour", "aux symboles inconnus", "qui s'ouvre aux équinoxes", "brisé en deux"] },
            { id: "statue_pleure", nom: "Statue qui pleure", poids: 2, terrains: T("partout"), batiments: [0, 1],
              variantes: ["de l'eau", "du sang", "de l'huile parfumée", "seulement la nuit"] },
            { id: "laboratoire", nom: "Laboratoire d'alchimiste", poids: 2, terrains: T("foret", "colline", "marais"), batiments: [1, 1],
              variantes: ["abandonné en hâte", "aux expériences ratées", "dissimulé", "aux fumées colorées"] },
            { id: "cratere", nom: "Cratère d'étoile tombée", poids: 1, terrains: T("plaine", "desert", "colline"), batiments: [0, 0],
              variantes: ["encore chaud", "au métal céleste", "vénéré", "pillé"] },
            { id: "bibliotheque", nom: "Bibliothèque oubliée", poids: 1, terrains: T("montagne", "foret", "desert"), batiments: [1, 1],
              variantes: ["sous la terre", "d'un ordre éteint", "gardée par un scribe immortel", "aux rouleaux interdits"] },
            { id: "epave_terre", nom: "Épave loin de la mer", poids: 1, terrains: T("plaine", "desert", "foret"), batiments: [0, 0],
              variantes: ["d'une galère", "plantée dans un arbre", "à la coque gravée", "dont nul ne sait l'origine"] },
            { id: "trace_engeance", nom: "Trace de l'Engeance", poids: 2, terrains: T("partout"), batiments: [0, 0],
              variantes: ["une terre noircie", "des bêtes mortes en cercle", "un village vidé", "un symbole gravé dans la roche"] },
            { id: "sanctuaire_concordia", nom: "Sanctuaire de la Concordia", poids: 1, terrains: T("plaine", "colline"), regions: { 9: 6, 10: 6, 2: 0 }, batiments: [1, 2],
              variantes: ["aux mages en retraite", "aux esclaves silencieux", "aux cristaux d'étude", "fermé aux non-humains"] },
            { id: "cellule_cendre", nom: "Cellule de la Confrérie de la Cendre", poids: 1, terrains: T("montagne", "colline"), regions: { 2: 6, 3: 3, 9: 0, 10: 0 }, batiments: [1, 2],
              variantes: ["traquant un mage", "aux bûchers prêts", "déguisée en ferme", "aux armes de forge"] }
        ] },
        { id: "rencontre", nom: "Haltes et rassemblements", poids: 8, types: [
            { id: "caravane", nom: "Caravane arrêtée", poids: 4, terrains: T("plaine", "desert", "route"), regions: { 5: 2 }, batiments: [0, 0],
              variantes: ["à l'essieu brisé", "de marchands d'épices", "attaquée récemment", "qui attend une escorte"] },
            { id: "troupe_comediens", nom: "Troupe de comédiens", poids: 2, terrains: T("plaine", "route", "colline"), batiments: [0, 1],
              variantes: ["répétant une tragédie", "aux masques peints", "de musiciens", "fuyant un seigneur vexé"] },
            { id: "pelerins", nom: "Campement de pèlerins", poids: 3, terrains: T("partout"), batiments: [0, 0],
              variantes: ["vers un oracle", "aux pieds nus", "malades", "suivis par un prophète"] },
            { id: "marchand_ambulant", nom: "Marchand ambulant", poids: 3, terrains: T("partout"), batiments: [0, 0],
              variantes: ["de reliques douteuses", "d'armes", "de cartes", "de remèdes miracles"] },
            { id: "noce", nom: "Noce champêtre", poids: 1, terrains: T("plaine", "colline", "foret"), batiments: [0, 1],
              variantes: ["entre deux clans rivaux", "joyeuse", "forcée", "interrompue"] },
            { id: "foire", nom: "Foire aux bestiaux", poids: 1, terrains: T("plaine"), batiments: [0, 2],
              variantes: ["annuelle", "aux bêtes rares", "aux combats d'animaux", "au concours de lutte"] },
            { id: "funerailles", nom: "Funérailles en plein air", poids: 1, terrains: T("partout"), batiments: [0, 0],
              variantes: ["d'un chef", "d'un enfant", "d'un inconnu", "suspectes"] },
            { id: "chasseurs_primes", nom: "Bivouac de chasseurs de primes", poids: 2, terrains: T("partout"), batiments: [0, 0],
              variantes: ["sur une piste", "avec un prisonnier", "rivaux entre eux", "cherchant un guide"] }
        ] }
    ];
    const AMBIANCES = ["paisible", "prospère", "misérable", "abandonné", "inquiétant", "festif", "en deuil", "sous tension", "assiégé",
        "superstitieux", "accueillant", "méfiant", "en reconstruction", "frappé par la maladie", "hanté selon les rumeurs", "sur le départ",
        "en pleine récolte", "déchiré par une querelle", "hors du temps", "sous la coupe d'un tyran local", "protégé par un culte",
        "ravagé récemment", "en fête religieuse", "silencieux", "plein de voyageurs", "affamé", "fier et austère", "endetté"];
    const ACCROCHES = ["quelqu'un a disparu depuis trois jours", "un étranger blessé y est soigné et refuse de dire son nom",
        "on parle d'un trésor enfoui tout près", "une bête rôde la nuit et a déjà tué", "une dette impayée envenime tout",
        "un mariage arrangé est contesté", "une statue aurait bougé", "le puits est empoisonné", "des marchands d'esclaves sont de passage",
        "une relique a été volée", "un vieil homme connaît l'Ordre d'Ivalis", "un enfant fait des rêves prophétiques",
        "une querelle d'eau oppose deux familles", "un mercenaire cherche du travail", "un culte se réunit en secret",
        "une carte ancienne circule", "on a vu des traces de l'Engeance", "une fête cache un sacrifice", "un collecteur d'impôts brutal arrive",
        "une épidémie commence", "un artisan prodige fabrique un objet unique", "un déserteur se cache ici", "un oracle a annoncé la venue d'étrangers",
        "les morts ne restent pas en terre", "un duel est prévu à l'aube", "une caravane n'est jamais arrivée", "un noble en fuite paie cher le silence",
        "une source s'est tarie du jour au lendemain", "on attend un messager qui ne vient pas", "un trésor de guerre aurait été caché par des soldats",
        "un monstre est vénéré comme un dieu", "une prisonnière demande de l'aide", "des pierres tombent du ciel la nuit", "les animaux fuient le lieu",
        "un Gob s'est réfugié ici et on veut le livrer", "un mage se cache de la Confrérie de la Cendre", "deux factions se disputent le lieu",
        "un ancien héros vit là, oublié", "un rituel doit être accompli avant la pleine lune", "quelqu'un vend des secrets sur Arcaï"];
    const ETATS = ["intact", "vieilli", "délabré", "en partie détruit", "récemment construit", "en travaux", "à moitié englouti par la nature"];

    window.CATALOGUE_POI = { familles: FAMILLES, ambiances: AMBIANCES, accroches: ACCROCHES, etats: ETATS };

    // LES TERRAINS, lus dans l'analyse (MIA_TERRAIN) : des mots-clés.
    const MOTS = {
        foret: /for[êe]t|bois|pin|chêne|arbre|sylv|bosquet|futaie|jungle/i,
        plaine: /plaine|prairie|pr[ée]|champ|steppe|lande|herbe/i,
        colline: /colline|coteau|butte|vallon|relief|mamelon/i,
        montagne: /montagne|mont|pic|falaise|roche|rocher|escarp|massif|sommet|crête|volcan/i,
        marais: /marais|marécage|tourbi|vase|roseau|bourbier|lagune/i,
        desert: /d[ée]sert|dune|sable|aride|erg|reg/i,
        cote: /c[ôo]te|mer|plage|rivage|littoral|crique|falaise maritime|océan|baie|golfe/i,
        riviere: /rivi[èe]re|fleuve|ruisseau|torrent|cours d'eau|berge/i,
        lac: /lac|étang|bassin|lagon/i,
        route: /route|chemin|piste|sentier|voie/i
    };
    window.motsTerrainPoi = function(texte) {
        const t = String(texte || "");
        return Object.keys(MOTS).filter(k => MOTS[k].test(t));
    };

    const auPoids = (liste, poids, hasard) => {
        const total = liste.reduce((s, x) => s + Math.max(0, poids(x)), 0);
        if (!(total > 0)) return liste[Math.floor(hasard() * liste.length)];
        let r = hasard() * total;
        for (const x of liste) { r -= Math.max(0, poids(x)); if (r <= 0) return x; }
        return liste[liste.length - 1];
    };
    const accordTerrain = (type, terrains) => {
        if (!type.terrains || type.terrains.includes("partout") || !terrains || !terrains.length) return 1;
        return type.terrains.some(t => terrains.includes(t)) ? 3 : 0.25;
    };
    const accordRegion = (type, region) => {
        const m = type.regions && type.regions[region];
        return m === undefined ? 1 : m;
    };
    // LE POIDS D'UN TYPE, ici (lu par les bancs et le document).
    window.poidsTypePoi = (type, famille, terrains, region) => famille.poids * type.poids * accordTerrain(type, terrains) * accordRegion(type, region)
        / famille.types.reduce((s, t) => s + t.poids, 0);

    // LA GRAINE : ce que l'IA brodera.
    window.tirerGrainePoi = function(options) {
        const o = options || {};
        const hasard = typeof o.hasard === "function" ? o.hasard : Math.random;
        const terrains = o.terrains || [];
        const region = Number(o.region) || 0;
        const couples = [];
        FAMILLES.forEach(f => f.types.forEach(t => couples.push({ f, t, p: window.poidsTypePoi(t, f, terrains, region) })));
        const { f, t } = auPoids(couples, c => c.p, hasard);
        const choisir = (liste) => liste[Math.floor(hasard() * liste.length)];
        const [bmin, bmax] = t.batiments || [0, 1];
        return {
            famille: f.id, familleNom: f.nom, type: t.id, typeNom: t.nom,
            variante: choisir(t.variantes), ambiance: choisir(AMBIANCES), accroche: choisir(ACCROCHES), etat: choisir(ETATS),
            batiments: bmin + Math.floor(hasard() * (bmax - bmin + 1)), terrains
        };
    };
    window.nombreCombinaisonsPoi = () => FAMILLES.reduce((s, f) => s + f.types.reduce((u, t) => u + t.variantes.length, 0), 0)
        * AMBIANCES.length * ACCROCHES.length * ETATS.length;
})();
