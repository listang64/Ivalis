# Catalogue des points d'intérêt (POI) — Ivalis

> Tiré automatiquement de `poi_catalogue.js` (v277). Pour changer la liste, on change le fichier JS, puis on régénère ce document :
> `node tests_monstres/_catalogue_poi_md.mjs`.

## Comment un POI naît

1. **La chance** : à chaque journée de marche sur une carte régionale, un POI a une chance d'apparaître (50 % par défaut, réglable en DEV). Au plus un par jour.
2. **La place** : dans un rayon autour du groupe, sur le terrain praticable, hors des nuages, et assez loin des lieux déjà posés (une taille de marge) pour que les dessins ne se touchent pas.
3. **La graine** : quand les joueurs décident d'aller voir, on tire dans ce catalogue — une **famille** (au poids), un **type** (au poids, ×3 si le terrain lu sur la carte lui va, ×0,25 sinon, multiplié par le lore de la région), une **variante**, un **état**, une **ambiance** et une **accroche**.
4. **La broderie** : MIA_POI (Gemini, température tirée entre 0,80 et 1,20) écrit le lieu sur cette graine, avec le descriptif et le lore de la région, le terrain, et des règles strictes (Antique Fantastique, peuples d'Ivalis, jamais de grande ville, rien d'anachronique).

**En chiffres** : 11 familles, 114 types, 470 variantes, 7 états, 28 ambiances, 40 accroches — soit **3 684 800** graines différentes avant même que l'IA ne brode.

## Les familles et leurs types

### Habitats — poids 20

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Hameau** | 8/52 | plaine, colline, forêt, rivière | — | 2 à 4 | de bergers · de charbonniers · de bûcherons · de vignerons · de tisserands · de potiers · de chasseurs de peaux · d'apiculteurs |
| **Ferme isolée** | 6/52 | plaine, colline, rivière | — | 1 à 3 | d'oliviers · de céréales · d'élevage de chèvres · de chevaux · aux mains d'une veuve · fortifiée d'une palissade |
| **Village de pêcheurs** | 6/52 | côte, lac, rivière | — | 2 à 4 | sur pilotis · accroché à une crique · aux filets séchant au soleil · de pêcheurs d'éponges · de ramasseurs de coquillages |
| **Hameau troglodyte** | 4/52 | colline, montagne | — | 1 à 3 | creusé dans la falaise · aux portes peintes · relié par des escaliers taillés · à demi enfoui sous la roche |
| **Village sur pilotis** | 4/52 | marais, lac | — | 2 à 3 | entre les roseaux · relié par des passerelles · de cueilleurs de joncs · noyé de brume |
| **Camp de nomades** | 5/52 | désert, plaine, colline | Le désert d'Etheria ×4 | 0 à 2 | de tentes en peaux · de caravaniers · de bergers transhumants · de marchands de sel · de conteurs itinérants |
| **Bivouac éthéré** | 2/52 | désert | Le désert d'Etheria ×8 | 0 à 2 | autour d'un puits · de guerriers en errance · d'une famille de devins · aux voiles flottant au vent |
| **Colonie de bûcherons** | 4/52 | forêt | — | 1 à 3 | aux troncs empilés · au bord d'un torrent · autour d'une scierie à eau · de résiniers |
| **Village de bergers** | 4/52 | colline, montagne, plaine | — | 1 à 3 | aux bergeries de pierre sèche · au son des cloches · de fromagers · d'estive |
| **Campement de réfugiés** | 3/52 | partout | — | 0 à 2 | fuyant une guerre · chassés par l'Engeance · d'esclaves évadés · d'un village incendié · fuyant une épidémie |
| **Hameau de Gobs** | 2/52 | forêt, marais | La forêt des murmures ×8, La vallée de souffre ×2 | 1 à 3 | dans les racines d'arbres géants · caché sous les fougères · de chapardeurs · de guérisseurs à herbes |
| **Village vargen caché** | 1/52 | forêt, colline | L'île aux marchés ×3, La province d'Aurelya ×8 | 1 à 3 | derrière une cascade · dans un vallon secret · de familles traquées · aux sentinelles muettes |
| **Camp tribal tatoué** | 1/52 | forêt | L'enclave d'argentée ×8 | 1 à 2 | autour d'un arbre-totem · de chasseurs à l'arc · de chamans de la nature · aux huttes de feuillage |
| **Communauté d'ermites** | 2/52 | montagne, désert, forêt | — | 1 à 2 | ascètes silencieux · philosophes exilés · anciens soldats repentis · gardiens d'un secret |

### Lieux sacrés — poids 15

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Sanctuaire de bord de route** | 6/38 | partout | — | 0 à 1 | d'un dieu des voyageurs · couvert d'offrandes · à la flamme jamais éteinte · gardé par une vieille prêtresse |
| **Autel ancien** | 5/38 | colline, montagne, forêt | — | 0 à 1 | taché d'un sang ancien · dédié à un dieu oublié · fendu par la foudre · orné de bas-reliefs effacés |
| **Oracle** | 3/38 | montagne, colline, forêt | — | 1 à 2 | dans une grotte enfumée · aux trois sibylles · qui ne parle qu'en énigmes · au-dessus d'une faille |
| **Source sacrée** | 4/38 | forêt, colline, montagne | — | 0 à 1 | aux eaux guérisseuses · où l'on jette des pièces · gardée par des nymphes de pierre · aux eaux rouges |
| **Bois sacré** | 4/38 | forêt | — | 0 à 1 | aux arbres jamais coupés · suspendu d'ex-voto · où chantent les oiseaux la nuit · interdit aux armes |
| **Cercle de pierres levées** | 3/38 | plaine, colline | — | 0 | qui chantent au vent · aux runes antiques · aligné sur les étoiles · où l'herbe ne pousse pas |
| **Statue colossale** | 3/38 | plaine, colline, côte | — | 0 à 1 | d'un héros oublié · à demi enfouie · décapitée · tournée vers la mer · aux yeux de bronze |
| **Monastère isolé** | 3/38 | montagne, colline | — | 2 à 4 | accroché à un piton · de moines copistes · de guerriers-prêtres · presque abandonné |
| **Temple souterrain** | 2/38 | montagne, colline, désert | — | 1 à 2 | éclairé de lampes à huile · inondé à moitié · aux murs couverts de fresques · à l'entrée dissimulée |
| **Sanctuaire ondari** | 1/38 | lac, côte, rivière | L'île aux marchés ×6, La province d'Aurelya ×6 | 0 à 2 | au bord du lac aux vœux · aux bassins de prière · aux coquillages offerts · gardé par des pèlerins |
| **Chapelle de l'Ordre d'Ivalis** | 2/38 | partout | — | 1 à 2 | tenue par un vieux cadet · délabrée · servant de relais aux frères · aux archives de l'Engeance |
| **Lieu de pèlerinage** | 2/38 | partout | — | 1 à 3 | d'un saint guérisseur · d'une bataille légendaire · où un dieu aurait marché · aux marchands de reliques |

### Ruines — poids 14

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Villa effondrée** | 5/33 | plaine, colline, côte | — | 0 à 2 | aux mosaïques intactes · envahie de vigne sauvage · brûlée · squattée par des vagabonds |
| **Forteresse en ruine** | 4/33 | colline, montagne | — | 1 à 2 | aux remparts éventrés · d'un ancien roi · repaire d'oiseaux · aux souterrains condamnés |
| **Amphithéâtre envahi** | 3/33 | plaine, colline | — | 0 à 1 | par la forêt · par les eaux · par des nomades · aux gradins effondrés |
| **Aqueduc brisé** | 3/33 | plaine, colline, rivière | — | 0 à 1 | enjambant un vallon · dont un tronçon coule encore · aux arches couvertes de lierre · écroulé dans une rivière |
| **Tour écroulée** | 4/33 | partout | — | 0 à 1 | d'un mage disparu · de guet · au sommet encore debout · à l'escalier sans fin |
| **Cité engloutie** | 2/33 | lac, côte, marais | — | 0 à 2 | dont émergent des toits · visible à marée basse · aux colonnes sous l'eau · hantée de reflets |
| **Colonnade isolée** | 3/33 | plaine, désert, colline | — | 0 | sans temple · à moitié ensablée · aux chapiteaux sculptés · plantée au milieu de rien |
| **Temple en ruine** | 4/33 | partout | — | 0 à 2 | d'un dieu de la guerre · au toit effondré · aux statues renversées · réoccupé par un culte |
| **Champ de bataille ancien** | 2/33 | plaine, colline | — | 0 à 1 | jonché d'armes rouillées · aux tertres alignés · où l'on entend des cris la nuit · aux étendards en lambeaux |
| **Palais oublié** | 1/33 | forêt, désert, colline | — | 1 à 3 | sous les racines · sous le sable · aux jardins redevenus sauvages · d'une reine sans nom |
| **Phare éteint** | 2/33 | côte | — | 0 à 1 | sur un promontoire · dont le feu se rallume seul · aux naufrageurs · à demi effondré |

### Lieux funéraires — poids 8

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Tumulus** | 4/19 | plaine, colline | — | 0 | d'un chef de guerre · ouvert par des pillards · couronné d'un chêne · aux pierres gravées |
| **Nécropole** | 3/19 | colline, désert, montagne | — | 0 à 2 | taillée dans la roche · aux tombes alignées · des anciens rois · gardée par des statues |
| **Mausolée** | 3/19 | partout | — | 0 à 1 | d'une famille noble · scellé · pillé · aux lampes éternelles |
| **Entrée de catacombes** | 2/19 | colline, plaine | — | 0 à 1 | sous un temple · sous une ferme · aux ossements rangés · inondées |
| **Cimetière abandonné** | 3/19 | partout | — | 0 à 1 | d'un village disparu · aux stèles renversées · envahi de cyprès · où rôdent des pilleurs |
| **Bûcher funéraire** | 2/19 | plaine, colline, côte | — | 0 | encore fumant · prêt pour un héros · aux offrandes calcinées · veillé par des pleureuses |
| **Tombe d'un héros** | 2/19 | partout | — | 0 à 1 | dont l'arme est plantée · visitée par des pèlerins · profanée · dont le nom a été effacé |

### Nature remarquable — poids 14

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Grotte** | 6/36 | colline, montagne, forêt, côte | — | 0 | aux cristaux · aux peintures anciennes · d'où souffle un vent chaud · habitée par des chauves-souris · marine |
| **Cascade** | 4/36 | forêt, montagne, colline, rivière | — | 0 à 1 | cachant une caverne · aux arcs-en-ciel · glacée · où l'on se baigne pour se purifier |
| **Arbre millénaire** | 4/36 | forêt, plaine | — | 0 | creux · aux branches chargées d'offrandes · foudroyé mais vivant · où nichent des oiseaux étranges |
| **Source chaude** | 3/36 | montagne, colline | La vallée de souffre ×3, Le mont Pletia ×3 | 0 à 1 | sulfureuse · aux bassins naturels · fréquentée par des malades · fumante dans le froid |
| **Gouffre** | 3/36 | montagne, colline, désert | — | 0 | sans fond · d'où monte un chant · enjambé d'un pont de corde · où l'on jette les condamnés |
| **Clairière enchantée** | 3/36 | forêt | — | 0 | aux fleurs lumineuses · où le temps semble suspendu · au cercle de champignons · aux statues de mousse |
| **Arche de pierre naturelle** | 2/36 | désert, côte, montagne | — | 0 | sculptée par le vent · au-dessus de la mer · gravée de noms · qu'on dit être une porte |
| **Champ de fumerolles** | 2/36 | montagne, colline, désert | La vallée de souffre ×5, Le mont Pletia ×3 | 0 | aux cristaux de soufre · aux vapeurs prophétiques · brûlant · où travaillent des ramasseurs de soufre |
| **Oasis** | 3/36 | désert | Le désert d'Etheria ×4 | 0 à 2 | aux palmiers · disputée par deux clans · presque tarie · au bassin de pierre ancien |
| **Forêt pétrifiée** | 1/36 | désert, colline, plaine | — | 0 | aux troncs de pierre · maudite, dit-on · aux reflets d'agate · où rien ne vit |
| **Lac de cristal** | 2/36 | montagne, forêt, lac | — | 0 à 1 | aux eaux transparentes · gelé en toute saison · aux reflets d'étoiles · où dorment des épaves |
| **Geyser** | 1/36 | montagne, colline | La vallée de souffre ×3, Le mont Pletia ×3 | 0 | régulier comme un sablier · qu'on vénère · aux terrasses blanches · capricieux |
| **Récif** | 2/36 | côte | La crique du Pendu ×4, Les îlots maudits ×3 | 0 | aux épaves · visible à marée basse · où chantent les vagues · aux coraux rouges |

### Passages et routes — poids 10

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Pont ancien** | 4/26 | rivière, forêt, montagne | — | 0 à 1 | de pierre à trois arches · de bois branlant · gardé par un péager · à moitié emporté par les crues |
| **Gué** | 3/26 | rivière, marais | — | 0 à 1 | aux pierres glissantes · gardé par une famille de passeurs · où l'on a vu des noyés · marqué de bornes sculptées |
| **Col** | 3/26 | montagne, colline | — | 0 à 1 | balayé par le vent · aux cairns · d'un péage oublié · enneigé |
| **Tour de guet** | 4/26 | partout | — | 1 | encore gardée · abandonnée · aux feux de signaux · surveillant une route commerciale |
| **Relais de route** | 4/26 | plaine, route, colline | — | 1 à 3 | avec une auberge · de messagers · aux écuries pleines · tenu par un ancien gladiateur |
| **Borne milliaire** | 2/26 | route, plaine | — | 0 | indiquant une cité disparue · couverte de messages gravés · renversée · où l'on laisse des offrandes |
| **Bac de passeur** | 2/26 | rivière, lac | — | 0 à 1 | tiré par une corde · d'un vieux passeur bavard · réclamant un prix étrange · fréquenté par des contrebandiers |
| **Carrefour à la statue** | 2/26 | plaine, route | — | 0 à 1 | d'un dieu à trois visages · aux pendus · où l'on vend de tout · aux chemins disparus |
| **Poste de péage** | 2/26 | route, colline, rivière | — | 1 à 2 | légal · tenu par des bandits · d'un seigneur local · abandonné à la hâte |

### Activités et commerce — poids 11

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Mine** | 4/30 | montagne, colline | — | 1 à 3 | de cuivre · d'argent · de sel · d'étain · abandonnée · aux esclaves enchaînés |
| **Carrière de marbre** | 3/30 | colline, montagne | — | 1 à 2 | blanc · veiné de rouge · où dort une statue inachevée · aux ouvriers en grève |
| **Comptoir de commerce** | 3/30 | côte, rivière, route, plaine | — | 1 à 3 | de marchands ondari · d'épices · de fourrures · fortifié |
| **Marché itinérant** | 3/30 | plaine, route, désert | — | 0 à 2 | de bestiaux · d'esclaves · de curiosités · de remèdes · de nomades |
| **Saline** | 2/30 | côte, désert, marais | — | 1 à 2 | aux bassins miroitants · de travailleurs gobs · convoitée · aux montagnes de sel |
| **Forge isolée** | 3/30 | montagne, colline, forêt | La vallée de souffre ×4, Le mont Pletia ×3 | 1 à 2 | d'un forgeron ankylar · aux armes ornées · secrète · au feu de soufre |
| **Atelier de potiers** | 2/30 | rivière, plaine | — | 1 à 2 | aux amphores peintes · aux fours à flanc de colline · de lampes à huile · familial |
| **Rucher** | 2/30 | colline, plaine, forêt | — | 0 à 1 | de miel sacré · aux abeilles agressives · d'une vieille herboriste · aux ruches de terre cuite |
| **Chantier naval** | 2/30 | côte, lac | L'île aux marchés ×3, La crique du Pendu ×3 | 1 à 2 | de galères · de barques de pêche · abandonné · de pirates |
| **Herboristerie** | 2/30 | forêt, marais, colline | — | 1 | d'une guérisseuse · aux plantes rares · de poisons · tenue par un Ophior |
| **Vignoble** | 2/30 | colline, plaine | — | 1 à 2 | aux vendanges · réputé · ravagé · aux pressoirs de pierre |
| **Haras** | 2/30 | plaine | — | 1 à 2 | de chevaux de guerre · volé récemment · d'une famille noble · de bêtes étranges |

### Lieux militaires — poids 9

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Avant-poste** | 4/19 | partout | — | 1 à 3 | de frontière · de la garde de la cité · mal ravitaillé · en alerte |
| **Camp de mercenaires** | 3/19 | plaine, colline | — | 0 à 2 | entre deux contrats · recrutant · aux bannières bariolées · rançonnant les voyageurs |
| **Fortin frontalier** | 3/19 | colline, montagne, rivière | — | 1 à 3 | de bois · de pierre · assiégé · à la garnison réduite |
| **Camp de soldats en marche** | 2/19 | plaine, route | — | 0 à 2 | d'Arcaï · de Volcanisse · d'un seigneur local · rentrant de bataille |
| **Poste de l'Ordre d'Ivalis** | 2/19 | partout | — | 1 à 2 | tenu par un frère et deux cadets · presque oublié · traquant une piste de l'Engeance · servant de refuge |
| **Tour de signaux** | 2/19 | colline, montagne, côte | — | 1 | aux miroirs de bronze · aux feux · silencieuse depuis des jours · aux pigeons messagers |
| **Palissade abandonnée** | 2/19 | forêt, plaine | — | 0 à 1 | d'un camp disparu · aux traces de combat · réoccupée · brûlée |
| **Camp d'entraînement** | 1/19 | plaine, colline | — | 1 à 2 | de gladiateurs · d'orphelins de l'Ordre · d'archers · secret |

### Dangers et hors-la-loi — poids 10

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Repaire de bandits** | 5/23 | forêt, colline, montagne | — | 0 à 2 | dans une grotte · dans des ruines · d'anciens soldats · d'une bande d'enfants perdus |
| **Camp d'esclavagistes** | 2/23 | forêt, plaine | La forêt des murmures ×6, La pointe des sentinelles ×3 | 0 à 2 | chassant les Gobs · en route vers Arcaï · aux cages pleines · dissimulé en caravane |
| **Repaire de contrebandiers** | 3/23 | côte, forêt, marais | La forêt des murmures ×3, La crique du Pendu ×3 | 0 à 2 | dans une crique · sous une ferme · aux tonneaux cachés · aux signaux de lanternes |
| **Antre d'une bête** | 4/23 | forêt, montagne, marais, colline | — | 0 | jonché d'os · d'une bête mythique · d'un prédateur blessé · qu'on croit vide |
| **Nid de créatures** | 3/23 | marais, forêt, désert, montagne | — | 0 | ailées · venimeuses · des profondeurs · inconnues des savants |
| **Campement de pirates** | 1/23 | côte | L'île aux marchés ×3, La crique du Pendu ×8 | 0 à 2 | sur une plage · partageant un butin · réparant un navire · aux prisonniers |
| **Camp de déserteurs** | 2/23 | forêt, colline | — | 0 à 1 | affamés · armés jusqu'aux dents · cherchant un passage · rongés de remords |
| **Tanière de sorcière** | 2/23 | marais, forêt | — | 1 | aux fioles · aux os suspendus · qui reçoit les désespérés · fuyant Volcanisse |
| **Territoire de Gobs géants** | 1/23 | forêt, colline | La forêt des murmures ×8 | 0 | aux arbres arrachés · aux traces immenses · au repas abandonné · gardé par des totems |

### Mystère et magie — poids 9

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Tour de mage** | 3/17 | partout | La vallée de souffre ×0.2, Arcaï ×3, La pointe des sentinelles ×3 | 1 à 2 | habitée · scellée · en exil · aux fenêtres de cristal |
| **Puits sans fond** | 2/17 | plaine, colline, désert | — | 0 | qui murmure · où tombent des étoiles · aux margelles gravées · gardé par un vieillard |
| **Portail ancien** | 1/17 | montagne, désert, forêt | — | 0 | sans mur autour · aux symboles inconnus · qui s'ouvre aux équinoxes · brisé en deux |
| **Statue qui pleure** | 2/17 | partout | — | 0 à 1 | de l'eau · du sang · de l'huile parfumée · seulement la nuit |
| **Laboratoire d'alchimiste** | 2/17 | forêt, colline, marais | — | 1 | abandonné en hâte · aux expériences ratées · dissimulé · aux fumées colorées |
| **Cratère d'étoile tombée** | 1/17 | plaine, désert, colline | — | 0 | encore chaud · au métal céleste · vénéré · pillé |
| **Bibliothèque oubliée** | 1/17 | montagne, forêt, désert | — | 1 | sous la terre · d'un ordre éteint · gardée par un scribe immortel · aux rouleaux interdits |
| **Épave loin de la mer** | 1/17 | plaine, désert, forêt | — | 0 | d'une galère · plantée dans un arbre · à la coque gravée · dont nul ne sait l'origine |
| **Trace de l'Engeance** | 2/17 | partout | — | 0 | une terre noircie · des bêtes mortes en cercle · un village vidé · un symbole gravé dans la roche |
| **Sanctuaire de la Concordia** | 1/17 | plaine, colline | La vallée de souffre ×0, Arcaï ×6, La pointe des sentinelles ×6 | 1 à 2 | aux mages en retraite · aux esclaves silencieux · aux cristaux d'étude · fermé aux non-humains |
| **Cellule de la Confrérie de la Cendre** | 1/17 | montagne, colline | La vallée de souffre ×6, Le mont Pletia ×3, Arcaï ×0, La pointe des sentinelles ×0 | 1 à 2 | traquant un mage · aux bûchers prêts · déguisée en ferme · aux armes de forge |

### Haltes et rassemblements — poids 8

| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |
|---|---|---|---|---|---|
| **Caravane arrêtée** | 4/17 | plaine, désert, route | Le désert d'Etheria ×2 | 0 | à l'essieu brisé · de marchands d'épices · attaquée récemment · qui attend une escorte |
| **Troupe de comédiens** | 2/17 | plaine, route, colline | — | 0 à 1 | répétant une tragédie · aux masques peints · de musiciens · fuyant un seigneur vexé |
| **Campement de pèlerins** | 3/17 | partout | — | 0 | vers un oracle · aux pieds nus · malades · suivis par un prophète |
| **Marchand ambulant** | 3/17 | partout | — | 0 | de reliques douteuses · d'armes · de cartes · de remèdes miracles |
| **Noce champêtre** | 1/17 | plaine, colline, forêt | — | 0 à 1 | entre deux clans rivaux · joyeuse · forcée · interrompue |
| **Foire aux bestiaux** | 1/17 | plaine | — | 0 à 2 | annuelle · aux bêtes rares · aux combats d'animaux · au concours de lutte |
| **Funérailles en plein air** | 1/17 | partout | — | 0 | d'un chef · d'un enfant · d'un inconnu · suspectes |
| **Bivouac de chasseurs de primes** | 2/17 | partout | — | 0 | sur une piste · avec un prisonnier · rivaux entre eux · cherchant un guide |

## Les états

- intact
- vieilli
- délabré
- en partie détruit
- récemment construit
- en travaux
- à moitié englouti par la nature

## Les ambiances

- paisible
- prospère
- misérable
- abandonné
- inquiétant
- festif
- en deuil
- sous tension
- assiégé
- superstitieux
- accueillant
- méfiant
- en reconstruction
- frappé par la maladie
- hanté selon les rumeurs
- sur le départ
- en pleine récolte
- déchiré par une querelle
- hors du temps
- sous la coupe d'un tyran local
- protégé par un culte
- ravagé récemment
- en fête religieuse
- silencieux
- plein de voyageurs
- affamé
- fier et austère
- endetté

## Les accroches (pour le MJ)

- quelqu'un a disparu depuis trois jours
- un étranger blessé y est soigné et refuse de dire son nom
- on parle d'un trésor enfoui tout près
- une bête rôde la nuit et a déjà tué
- une dette impayée envenime tout
- un mariage arrangé est contesté
- une statue aurait bougé
- le puits est empoisonné
- des marchands d'esclaves sont de passage
- une relique a été volée
- un vieil homme connaît l'Ordre d'Ivalis
- un enfant fait des rêves prophétiques
- une querelle d'eau oppose deux familles
- un mercenaire cherche du travail
- un culte se réunit en secret
- une carte ancienne circule
- on a vu des traces de l'Engeance
- une fête cache un sacrifice
- un collecteur d'impôts brutal arrive
- une épidémie commence
- un artisan prodige fabrique un objet unique
- un déserteur se cache ici
- un oracle a annoncé la venue d'étrangers
- les morts ne restent pas en terre
- un duel est prévu à l'aube
- une caravane n'est jamais arrivée
- un noble en fuite paie cher le silence
- une source s'est tarie du jour au lendemain
- on attend un messager qui ne vient pas
- un trésor de guerre aurait été caché par des soldats
- un monstre est vénéré comme un dieu
- une prisonnière demande de l'aide
- des pierres tombent du ciel la nuit
- les animaux fuient le lieu
- un Gob s'est réfugié ici et on veut le livrer
- un mage se cache de la Confrérie de la Cendre
- deux factions se disputent le lieu
- un ancien héros vit là, oublié
- un rituel doit être accompli avant la pleine lune
- quelqu'un vend des secrets sur Arcaï

## Les règles données à MIA_POI

**RÈGLES DE CRÉATION (absolues) :**

1. UNIVERS : Antique Fantastique — mythologie, Antiquité magique. Pierre, marbre, bronze, terre cuite, bois, toile ; colonnes, autels, amphores, mosaïques, chitons et capes ; oracles, dieux et esprits. La magie existe mais reste rare, ancienne et chère payée.
2. PEUPLES : uniquement ceux d'Ivalis — Humains, Gobs (et Gobs géants), Ankylars, Éthérés, Ophiors, Ondari, Vargens ; et la menace de l'Engeance. Pas d'elfes, de nains, d'orques, de dragons de conte ni de créatures d'autres univers.
3. TAILLE : au plus un hameau, un petit village, un camp, un sanctuaire ou une ruine. JAMAIS de ville, de cité, de port important ni de forteresse peuplée de milliers d'âmes.
4. INTERDITS : aucune technologie anachronique (poudre, armes à feu, horloge mécanique, imprimerie, vapeur, verre à vitre moderne), aucun humour de parodie, aucun clin d'œil au monde réel, aucun nom moderne, aucun jeu de mots.
5. COHÉRENCE : avec le terrain (pas de port dans le désert, pas de mine dans un marais), avec la région et son lore (qui y vit, qui y domine, ce qui y est interdit), avec le niveau de danger. L'ambiance et l'accroche tirées sont des pistes : adapte-les avec bon sens à ce type de lieu.
6. NOMS : sonorités antiques (grecques, latines ou inventées dans cet esprit), courts, prononçables, sans article superflu.
7. ORIGINALITÉ : un lieu différent de ceux qui existent déjà (autre nom, autre identité).
8. SOBRIÉTÉ : du concret, des détails sensoriels, des gens crédibles ; du mystère, oui, mais du mystère qui tient debout.
