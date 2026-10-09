# Banc d'essai du générateur de techniques des monstres

Ces scripts vérifient `monstres_competences.js` **sur la vraie base Firestore**,
avec l'IA débranchée : ils n'exercent que l'algorithme.

## Utilisation

```sh
cd tests_monstres
node tirer_effets.mjs Combat_Effets    effets_reels.json
node tirer_effets.mjs Monstres_Modeles gabarits_reels.json

node verif_reelle.mjs    # 18 contrôles de validité, ~5500 cartes
node cout_reel.mjs       # recalcule les coûts avec le VRAI code de la Forge
node qualite_reelle.mjs  # variété, richesse, usage de la palette, progression
```

## Ce que chacun garantit

- **verif_reelle.mjs** — les cartes respectent les règles de la Forge, en
  réutilisant ses propres fonctions extraites de `competences.js`
  (`getMaxStacks`, `estUneAttaqueDeBase`, `estIncompatibleAvecArme`,
  `isConnectedToCenter`) : tranche de fatigue, 2 caractéristiques maximum, une
  seule attaque de base, compatibilité avec l'arme, plafonds d'empilement,
  zones connectées au lanceur, cohérence des compteurs ⏳, champs du document.

- **cout_reel.mjs** — rejoue le calcul de coût de `rafraichirForge()` sur chaque
  carte générée. Fatigue, initiative et coût en PC doivent être **identiques** à
  ce que la Forge calculerait. C'est le filet de sécurité principal : si une
  règle de coût change dans `competences.js`, ce test le détecte aussitôt.

- **qualite_reelle.mjs** — mesures d'équilibre, sans notion de réussite ou
  d'échec : à lire pour juger si les techniques restent variées et organiques.

⚠️ `tirer_effets.mjs` lit la base en HTTP via la clé publique du client. Si les
règles de sécurité Firestore passent en lecture authentifiée, ces scripts
cesseront de fonctionner — c'est normal et sans effet sur le jeu.

## Bancs de l'IA de combat (chapitre 3)

```sh
node comportements_ia.mjs   # personnalités, déplacement, ciblage, murs, fatigue
node tour_ia.mjs            # enchaînement d'un tour complet
node repos_et_variete.mjs   # repos long, variété et pertinence des cartes
node renforts.mjs           # un renfort entre bien à la mort d'un monstre
node combat_complet.mjs     # 24 combats entiers : cherche les blocages
node cas_limites.mjs        # emmuré, sans cible, données abîmées
node verrou.mjs             # concurrence entre plusieurs navigateurs
node reseau_trois_postes.mjs # trois postes sur la même partie : file, tours, dés partagés
node combat_reseau_complet.mjs # un combat ENTIER joué sur trois appareils, tour par tour
node reveil_ia.mjs          # l'IA se réveille seule, et joue après les joueurs
node lanceur_ia.mjs         # le sort part au nom de la créature, pas du joueur
node enchainement_ia.mjs    # une créature attend la fin de sa carte avant de passer
node hors_combat.mjs        # rien ne s'affiche quand la fenêtre de combat est fermée
node suppression_perso.mjs  # effacer un héros emporte tout ce qui lui est lié, images comprises
node occupation_cases.mjs   # qui occupe vraiment une case (morts et fantômes exclus)
node zone_assombrissement.mjs # où l'on peut poser une zone à distance, et l'écran noirci
node zones_ia.mjs           # les zones sont posées, orientées et bien placées
node piste_initiative.mjs   # la piste tient en haut de l'écran, bulles réduites
node fenetre_tour.mjs       # la fenêtre de tour : nom coloré, effets détaillés, zone dessinée
node sequence_tour.mjs      # le journal d'événements : ordre, trous, rattrapage
node etat_combat.mjs        # LE NOYAU PUR : dés à graine, état du combat, invariants (sans réseau)
node moteur_pur.mjs         # la chaîne de dégâts, maillon par maillon (10 000 cartes au hasard)
node cap_fatigue.mjs        # le CAP de fatigue d'une compétence, table de Nico + atout humain
node gouttes_etat.mjs       # les gouttes de couleur sous un pion, un vrai token de la base, capture à l'appui
node equipement_cerveau.mjs # percer une armure, l'élan, la bénédiction, le pas de retraite — reliés au cerveau
node durees_etats.mjs       # la durée d'un état, de la Forge (⏳ Durée +) jusqu'à sa dernière manche
node migration_effets.mjs     # plus de bouton d'installation : Ténèbres et Lumière vivent en copie locale, la version de la base l'emporte toujours
node mouvement_pur.mjs      # chemin, coût des cases, attaques d'opportunité (1 000 trajets)
node confusion_cerveau.mjs  # les quatre bandes du dé, la dissipation, et le mot qui prévient le joueur
node zones_cerveau.mjs      # une nappe au sol : elle naît dans l'état, elle brûle, elle vieillit, elle meurt
node bond_cerveau.mjs       # le saut passe par le cerveau au lieu d'écrire en base tout seul
node illusion_cerveau.mjs   # le leurre entre vraiment dans le combat : visable, frappable, effaçable
node plateau_vtt_fige.mjs   # Combat_VTT ne fait plus sauter les pions en arrière ni ressusciter un leurre
node rejeu_deplacements_imposes.mjs  # une Poussée ou une Traction rejouée déplace la cible, jamais le lanceur
node traction_peur_cerveau.mjs  # Traction (déterministe) et Peur (fuite, opportunités, fatigue) dans le cerveau
node fiches_figees.mjs      # Personnages/Monstres ne font plus reculer les PV en plein combat
node pont_resilience.mjs    # une animation en panne ne fige plus le reste du journal, et la Poussée est traduite
node tokens_ne_traversent_pas.mjs  # marche, Poussée, Traction, Peur, Bond, Illusion : jamais deux vivants sur une case
node mots_de_pouvoir_armure.mjs  # l'attaque magique ignore l'armure physique, preuve par les chiffres
node extraction_ne_pend_pas.mjs  # préparer la carte d'une créature (Bond en tête) n'ouvre plus un ciblage qui pend
node ia_pure.mjs            # qui viser, où se mettre : les cinq caractères, sans variable globale
node cerveau_combat.mjs     # LE CERVEAU : intentions validées, un seul écrivain, un combat entier
node spectateur_combat.mjs  # LE SPECTATEUR : le rejeu à l'écran, dans l'ordre, sans trou ni doublon
node depot_firestore.mjs    # LE DÉPÔT : un pas = un lot, et un lot qui rate ne laisse rien
node pont_combat.mjs        # LE PONT : de l'étape à ce qu'on voit, sans jamais recalculer
node regime_cerveau.mjs     # TROIS POSTES, UN CERVEAU : un combat entier, trois écrans identiques
node drapeau_regime.mjs     # LE DRAPEAU : chaque redirection est gardée, l'ancien chemin est intact
node journal_firestore.mjs  # la plomberie du journal face aux règles d'index de Firestore
node deplacement_journal.mjs # un hexagone = un numéro : publication, ordre, absence de chevauchement
node illusion_opportunite.mjs # une illusion ne porte aucune attaque d'opportunité
node file_bousculee.mjs     # le tour sauté et les dégâts en double : écritures concurrentes
node deplacement_repris.mjs # repartir en cours de tour, sans remise à zéro du barème
node croix_deplacement_legere.mjs # valider/annuler un déplacement n'attend plus un redessin complet du plateau
node ciblage_soutien_bond.mjs # attaque puis soin : deux ciblages ; bond puis zone : la zone part de l'arrivée
node points_apparition.mjs  # les deux repères d'apparition, et la dispersion des pions
node reinit_plateau.mjs     # la réinitialisation vide le plateau, puis enchaîne le déploiement
node ecriture_pions.mjs     # les pions écrits en base atterrissent bien dans la carte Tokens
node fin_de_tour.mjs        # un document introuvable ne fait plus tomber tout le round
node regeneration_fin_de_tour.mjs # la régénération ne tombe qu'au passage au tour suivant, jamais avant
node titres_bannieres.mjs   # les noms de carte rétrécissent au lieu d'être coupés
node bouton_forge.mjs       # le + de la Forge devient un sablier pendant l'attente
node forge_arme_equipee.mjs # le menu « Type d'Attaque » ne propose que l'arme vraiment équipée
node croix_suppression.mjs  # la croix rouge du mode dev efface une technique partout
node mise_de_cote.mjs       # la case à cocher qui retire un héros du jeu, sans l'effacer
node ecran_chargement.mjs   # le sceau, le préchargement, et le transport Firestore
node compteurs_combattant.mjs # vitalité et énergie du combattant suivi, à chaque étape
node hud_heros.mjs          # l'anneau vie/énergie, l'avatar, le nom du héros et son ombre
node pas_de_visionneuse.mjs # rien ne peut plus détourner « qui joue ? » vers une créature
node stats_fiche.mjs        # les retouches de la fiche perso suivies jusqu'au combat
node coup_critique.mjs      # le jet de critique, ses dégâts doublés et ses effets imposés
node atouts_races.mjs       # les sept peuples et leurs avantages, mesurés un par un
node ecran_choix_race.mjs   # le titre de l'étape, le nom de la race, et rien qui se chevauche
node jauge_token.mjs        # la jauge sous le pion survit à un redessin
node jauge_cibles.mjs       # la vie restante des cibles s'affiche pendant le ciblage
node butin_loot.mjs         # butin de fin de combat : détection, personnel, partage, tirage au sort
node images_objets.mjs      # MIA_Objets décrit, gpt-image dessine, Cloudinary héberge, la base reçoit
node fouille_butin.mjs      # la fouille des cadavres et ses trois portes de sortie
node campagne_complete.mjs  # trois combats entiers sur trois postes : reset, rencontre, butin, équipement
node equipement_depart.mjs  # l'arme et la tenue choisies à la création, et leur style antique
node avatar_armure.mjs      # le héros redessiné dans l'armure qu'il vient d'équiper
node creation_equipee.mjs   # l'équipement dessiné AVANT le héros, et joint à son portrait
node tour_synchronise.mjs   # le passage en résolution, identique sur les trois écrans
node affichage_temps_reel.mjs # les jauges qui suivent la base, le tic, et le pion qui ne se téléporte plus
node objets_tableau.mjs     # le catalogue d'équipement, confronté au tableau de Nico
node equipement_combat.mjs  # ce que les objets font une fois portés, en combat
node apercu_butin.mjs       # onglet Inventaire et fenêtres de butin, capturés à l'écran
node objets_sans_undefined.mjs  # aucun objet fabriqué ne contient de valeur undefined (Firestore la refuse)
node bouclier_absorption_contre.mjs  # bouclier en % des PV restants, Absorption magique, Contre physique, soin de zone au contact
node poussee_forge_avatar.mjs  # la Forge annonce toujours 2 cases de Poussée ; l'avatar du bouton de fin de tour grandit
node encart_fige.mjs        # le OK sous la piste d'initiative ; l'encart de tour figé aux nombres de Nico, sans bouton « ⚙ HUD »
node purification.mjs       # la Purification du grimoire : 1 état néfaste retiré à coup sûr, sans soin
node repli.mjs              # le Repli : frapper puis marcher 3 cases, 60 % d'éviter chaque opportunité
node bond_apres_attaque.mjs  # un Bond placé après l'attaque saute enfin (il part avec la carte)
node aveuglement.mjs        # l'Aveuglement : 3 cases de noir fixes, ciblage interdit (sauf zones), brouillard chez l'aveuglé
node equilibrage_base.mjs    # la vraie base : Contre physique / Absorption magique, plafonds de chance du grimoire
node persistance_soin.mjs    # pas de Persistance terrain sur un soin (la Zone, oui) ni sur une carte étalée (DOT) — Forge, moteur, monstres
node traction_en_tete.mjs    # Traction écrite avant l'attaque : on vise à 3 cases, le cerveau tire PUIS frappe (joueurs et monstres)
node initiative_hors_effets.mjs  # Contre, Aveuglement, Brûlure, Poison, Glacé, Électrifié, Peur, Confusion ne retardent pas la carte ; l'étalement ne remise que zone, dégâts et distance
node traction_monstres.mjs   # pas de Traction sur une technique de monstre qui frappe au contact
node cerveau_destitue.mjs    # un cerveau qui a perdu le réseau n'écrase plus ce que le nouveau cerveau a publié
node ia_opportunites.mjs     # les créatures ne prennent plus d'attaque d'opportunité pour rien
node tir_monstre_contact.mjs # une créature qui tire au contact perd 30 % (portée = mod Distance)
node zones_geometrie.mjs     # les zones des sorts ont la forme des hexagones de la map
node dev_reinit_caracs.mjs   # onglet DEV : réinitialiser les caractéristiques d'un héros
node choix_classe.mjs        # le choix de classe après la race : grille de tarots, fiche, retour, validation, base ; pleine largeur, cartes collées, titre à gauche, q_auto,f_auto
node illusions_multiples.mjs # deux Illusions sur une carte : deux leurres, sur deux cases choisies l'une après l'autre
node engagement_tombe.mjs    # un ennemi à terre ne tient plus au corps-à-corps ; une ZONE n'est plus soumise à l'engagement du tout
node soin_et_poussee.mjs     # soin + poussée : le ciblage envoie les deux, le cerveau pousse quand le jet passe (15 % par cran)
node marche_anticipee.mjs    # le pion part dès la validation sur l'écran de celui qui joue ; le journal confirme ou corrige
node fiche_race_classe.mjs   # race et classe dans l'onglet Statistiques ; portraits au soleil, sans reflet violacé
node jet_d20.mjs            # la scène du d20 : fondu, avatar, défilement qui ralentit, modificateur égrené, lueurs, rouge/violet ; chez tous les joueurs ; sons ; pas de monstres dans les bulles du chat
node fabrique_sons.mjs      # Paramètres → La Fabrique : dix « ding » rendus et comparés ; le ding perle remplace le parchemin dans tout le jeu
node experience.mjs          # l'expérience : grille des niveaux, jauge de la fiche, flèches de triche (DEV), compétences à créer par niveau (la main ne bouge pas), XP de la victoire à chaque héros
node necromancien.mjs        # Ténèbres (énergie puis PV ×1,5) et le sursis (moteur dormant, plus aucune classe ne le donne) ; Forge, extraction, fiche de classe du Sorcier
node surpuissance.mjs        # la surpuissance : ×1,25 dès 70 de fatigue, ×1,35 dès 100 (dégâts et soins, pas les boucliers) ; extraction, Forge, carte
node armes_et_zones.mjs      # persistance posée comme une zone d'une case ; Distance réservée (polyvalente, distance, magie, soin) ; arme qui bloque des techniques : alerte, grisées, retirées du deck
node tableaux_nico.mjs        # les cellules rouges des deux tableaux : brûlure 8 % PV max physique, poison 10 % énergie + 8 % PV magique, Contre/Absorption jusqu'à 30 %, armes et effets bonus
node hoplite.mjs              # 🛡️ le Protecteur (ex-Hoplite) : +7 parade et 15 % de provocation (niv. 1), Rempart (niv. 5), Résonance du bouclier (niv. 10) ; le Mur de bouclier, dormant ; fiche, volet de combat
node assassin.mjs             # la classe Assassin : Instinct du tueur (+15 critique 2 manches sur tout KO), Assaut mortel (zone de 2 au contact, 10 phys + poison même esquivé), Maître des poisons (18 % énergie + 10 % PV par manche, 2 manches)
node medicus.mjs              # la classe Médicus : +5 % régénération de fatigue et +1 compétence, Soin d'urgence (12 PV à tous les alliés), Prise en charge (relève un allié KO adjacent à 30 %, repousse les ennemis), fantômes des alliés KO pour le seul Médicus ; +1 à chacun de ses soins
node chasseur_de_mages.mjs    # ☀️ le Chasseur de mages : +10 rés. magique et Lumière (8 % d'aveugler sa cible) au niv. 1, Bouclier anti-magie (niv. 5, renvoi des sorts), Appel de la lumière (niv. 10)
node tenues_variees.mjs        # les skins d'armure : 34 tenues antiques par type tirées au sort (+ 16 palettes), sans répétition, envoyées à MIA et au dessinateur ; le gris est simple mais propre
node versions_modules.mjs      # la carte des imports : chaque module du moteur chargé une seule fois, à la version de sa balise (fin du moteur périmé après un déploiement)
node couvre_chef.mjs           # le couvre-chef des armures : 30 casques/chapeaux/coiffes par type tirés avec la tenue, dessinés sur l'armure (jamais sur celle de départ), choix « avec / tête nue » à l'équipement, le portrait suit
node bonus_race_classe.mjs     # l'onglet Statistiques : l'encart des bonus de race et de classe, chaque atout en toutes lettres, paliers à venir grisés
node intention_confirmee.mjs    # le cerveau joue tout de suite les intentions de son propre poste, même marquées « en route » par Firestore
node jauges_selection.mjs       # le pion sélectionné montre vie et fatigue sous lui ; mon pion les replie en fondu quand il marche
node assaut_cible_tombee.mjs    # l'Assaut mortel ignore une cible déjà à terre ; un refus du cerveau revient au poste qui a demandé (plus de partie figée)
node techniques_nouveau_combat.mjs # enchaîner les combats sans recharger : une technique de classe jouée avant redevient disponible
node vampire.mjs              # la classe Vampire : +10 rés. physique, feu aggravé, première case gratuite, Vampirisme (70 % de la carte en soin), Nuée de chauve-souris (esquive ≥ 50 %, 2 manches), interdit aux Vargens
node tenebres_brut.mjs        # Ténèbres sans armure (×1,5 sur la vie sans énergie) ; le malus de tir seulement sur la cible au contact
node valeurs_decimales.mjs    # 1,5 par cran : le demi-point compte, arrondi au plus proche (dégâts, soins, boucliers), écrit à la française dans la Forge
node liste_fleches.mjs         # flèches haut/bas sur une liste de héros qui défile ; la portée de l'arme lue sur le propriétaire de la carte
node forge_design.mjs         # la Forge aux couleurs du jeu (aucun bleu « appli »), descriptions alignées à gauche sous leur nom
node aide_forge_lia.mjs         # 🔨 LIA, l'aide à la création : popup récit + jauges, Gemini simulé, plan fautif corrigé par les règles de la Forge, cap, Recit_RP
node illustration_competence.mjs  # 🎨 illustration des compétences : IA de prompt + IA d'image (portrait + armes en binaire), file sur IA saturée, image en haut de la carte, outil de réglage provisoire
node jauge_energie_carte.mjs     # ⚡ énergie sous la carte en combat (perte rouge clignotante, reste) ; encart du repos long (gain vert)
node saignement.mjs             # 🩸 Saignement (8 % physique par manche, +2 par case), et le bouton qui met le grimoire à jour des nouvelles règles
node sorcier.mjs               # 🔮 le Sorcier (ex-Nécromancien) : Ténèbres + 1 case de portée + pas de malus au contact (niv. 1), Charme fratricide (niv. 5), Transfert (niv. 10) ; plus d'Ensorceleur
node oracle.mjs                # ⏳ l'Oracle : +10 d'initiative (niv. 1), Arrêt du temps (niv. 5 : voir la file, rejouer une compétence à l'initiative choisie), Retour arrière (niv. 10 : repos long puis compétence)
node sentinelle.mjs            # 🛡️ la Sentinelle : +6 aux attaques d'opportunité et +20 % de soins (niv. 1), Défenseur 30 % et zone de 2 cases avec allonge (niv. 5), Fureur de la sentinelle (niv. 10)
node classes_feminin.mjs        # ♀ les noms de classe au féminin pour une héroïne (Pisteuse, Sorcière, Protectrice…) : grille, fiche de classe, statistiques ; la fiche garde le nom de la classe
node profanateur.mjs           # 🧟 le Profanateur : DOT ×1,3, +1 compétence, +5 PV (niv. 1), ses zombies (niv. 5 : 15 PV, morsure de 7, 2 cases, en dernier) et leur pion grignoté sans IA, le sursis (niv. 10)
node pisteur.mjs               # 🐾 le Pisteur : son compagnon (25 PV, 15 % d'esquive, 6 bruts, 3 cases, juste après lui), +1 aux tirs, Tir précis (niv. 5), Lien de sang (niv. 10), la fenêtre du compagnon et son image
node geomancien.mjs            # 🪨 le Géomancien : 5e case de zone offerte et +10 init (niv. 1), Mur de terre (murs de 10 PV, poussée, gravats), ses passifs (niv. 5), le dessin des murs sans IA
node renommer_dev.mjs            # ✏️ renommer un héros depuis l'onglet DEV de sa fiche (Prenom_Personnage)
node proprio_dev.mjs             # 🤝 confier un héros à un autre joueur depuis l'onglet DEV (ID_Joueur)
node bagues_dps.mjs              # 💍 les bagues de dégâts : Intelligence ou Charisme (la meilleure), bonus sur le magique ou le brut
node compagnon_attaque.mjs        # 🐾 le compagnon du Pisteur : le nom RP de son attaque, trouvé par Gemini et gardé sur la fiche
node aide_caracs.mjs              # 📜 la répartition des caractéristiques : effets de combat (Codex) et usages RP sous chacune
node forge_bulles.mjs             # 💬 la Forge : bulle d'explication des effets (survol, appui 2 s), menus de sous-effets maison, barres de défilement
node interrupteur_illustration.mjs # 🖼️ l'interrupteur des Paramètres : couper / rallumer la génération des images des cartes
node ecritures_combat.mjs   # un seul poste écrit le résultat d'une carte, créature comprise
node cent_combats.mjs       # 100 combats à 3 joueurs, ratio de victoires
node zone_persistante_soin.mjs # une carte de soin laisse une zone verte qui soigne sans dépasser les PV max
node provocation.mjs        # l'effet Provocation (portée moteur), réservé aux joueurs
node barre_progression_creation.mjs # la barre de progression et les phrases humoristiques à la création
node reveil_arriere_plan.mjs # un onglet iPad endormi en pleine animation ne bloque plus la sync pour de bon
node poussee_traction_allies.mjs # Poussée/Traction peuvent viser un allié, sauf combinées à une attaque
node etalement_sans_degats.mjs # l'étalement ne se pose que sur une attaque, un soin, une Zone ou une Distance
node etalement_tours.mjs    # l'étalement divise dégâts ET soins par son nombre de tours, ⏳ compris
node carte_sans_trou.mjs    # une arme qui porte un état n'ajoute plus de champ undefined à la carte
node ouverture_inventaire.mjs # un héros tout juste créé ouvre sa fiche sur l'Inventaire
node zone_soin_verte_carte.mjs # la zone persistante de soin se dessine en vert, jamais en rouge
node annuler_ciblage.mjs # un bouton ANNULER reprend la main sur le déplacement en plein ciblage
node carte_grisee_sans_message.mjs # cliquer une carte trop chère l'affiche sans message d'erreur
node portee_zone.mjs        # une zone lancée à distance emporte bien la distance posée sur la carte
node butin_avance.mjs       # le butin tiré et dessiné dès le début du combat, gardé si le combat est perdu
node manche_suivante.mjs    # DEUX manches d'affilée : le cerveau rend la main à la préparation
node projectile.mjs         # flèche, boule bleue, boule verte : ce qui traverse le plateau

## Le journal d'événements du combat (le gros changement d'architecture)

Le combat ne se diffuse plus « action par action » dans le document de la
partie, où rien ne garantissait ni l'ordre ni la complétude. Tout ce qui se
passe devient un **événement numéroté**, écrit dans sa propre collection :

    Evenements_Combat/{partie}_000152   { n: 152, type: "carte", ... }

1. **Le poste qui joue calcule et publie.** Dés, dégâts, états, cases : tout est
   tranché chez lui, puis publié — 152 la goule se déplace, 153 elle frappe
   Pliors pour 18, 154 au tour de Jade. Le numéro est attribué sous transaction
   sur le compteur de la partie : deux postes ne peuvent pas tomber sur le même.
2. **Tous les appareils écoutent le journal.**
3. **Chacun rejoue les événements dans l'ordre de leur numéro**, un par un,
   chacun attendant que le précédent ait vraiment fini, avec un temps de
   respiration entre deux (`DELAI_ENTRE_ETAPES_MS`). L'animation n'est plus
   « temps réel » : c'est la représentation locale d'un événement déjà tranché,
   et chaque écran la joue pour lui, à son rythme.
4. **Un numéro manquant se voit immédiatement** — on attend 153 et 154 arrive —
   et se rattrape par une lecture directe. Aucun poste ne saute une étape, même
   après une mise en veille de plusieurs tours.

Firebase ne synchronise pas l'animation : il synchronise l'ÉVÉNEMENT. Deux
appareils qui ont lu les mêmes numéros sont forcément au même point.

**Le OK d'ouverture de tour.** Le premier événement d'un tour n'est pas joué
tout de suite : la fenêtre sombre annonce le combattant, ses états, sa technique
et sa zone, et le gros OK doré clignote. Le joueur a le temps de LIRE ce qui va
se dérouler sous ses yeux ; le tour ne commence qu'au toucher, et un seul OK
ouvre tout le tour. Cette attente est **purement locale** : personne n'attend le
doigt d'un autre poste, chacun ouvre son tour quand il veut et rattrape ensuite
les numéros accumulés. C'est ce qui distingue ce OK de l'ancien, décalé d'un
appareil à l'autre parce qu'il attendait tout le monde. Le tour d'un joueur
n'est jamais mis en pose chez lui : il sait déjà ce qu'il a choisi.

Ce qui a disparu avec ce modèle : les « Check » échangés entre postes et la file
retenue en attendant tout le monde. C'est ce qui pouvait figer la table.

**La requête refusée.** Le piège le plus coûteux, et celui qu'aucun banc ne
pouvait voir : ils simulent le réseau avec des documents rangés dans une carte,
et ne connaissent donc rien des règles de Firestore. Or Firestore REFUSE une
requête qui filtre par égalité sur un champ et borne ou trie sur un AUTRE champ,
tant qu'un index composite n'a pas été créé à la main dans la console. La
première version du journal faisait exactement cela — `where("ID_Partie","==") +
where("n",">") + orderBy("n")`. L'écoute était refusée, l'erreur partait dans la
console, et plus aucun événement n'était livré à personne : la fenêtre sombre
annonçait un tour qui ne se jouait jamais, sans bouton et sans animation, pendant
que la file passait au combattant suivant. Le journal vit désormais SOUS la
partie — `Systeme_Parties/{id}/Evenements_Combat/{n}` — où le filtre et le tri
portent sur le seul champ `n` : l'index automatique suffit, et il n'y aura jamais
rien à créer. `journal_firestore.mjs` charge le vrai code d'app.js et lui présente
un Firestore qui applique cette règle-là. Il vérifie aussi le filet de sécurité :
si le journal tombe pour une autre raison — droits, réseau —, la fenêtre s'efface
et les animations reprennent leur ancien chemin, plutôt qu'un plateau figé.

**Le tour sauté, et les dégâts en double — la même cause.** Un document
Firestore n'encaisse qu'une poignée d'écritures par seconde, et une transaction
doublée par une écriture concurrente rend `failed-precondition`. Le document de
la partie est le plus sollicité du jeu (file d'initiative, verrou de l'IA,
`Action_*`) et portait en plus le compteur du journal, qui avance **à chaque
hexagone parcouru**. Un tour de créature se calculant sans pauses, tout partait
en même temps : c'est la transaction de fin de tour qui perdait. `modifierPartie`
rendait alors `null` — exactement ce qu'elle rend quand il n'y a *rien à faire* —
et `finDeTourCombat` prenait l'échec pour un « un autre poste s'en est chargé ».
La file ne bougeait pas, la créature restait en tête, la notification suivante
rappelait l'IA, le verrou répondait « oui, c'est toi qui l'as », et **la créature
rejouait son tour du début** : deuxième déplacement, deuxième coup.

Trois corrections, une seule cause : le compteur a son propre document
(`Systeme_Parties/{id}/Journal_Combat/compteur`), que rien d'autre ne touche ;
`modifierPartieOuEchec` rend `{ ok, resultat }`, retente une écriture bousculée
avec une attente qui s'allonge, et distingue enfin l'échec du « rien à faire »,
sur quoi `finDeTourCombat` revient à la charge au lieu de s'en aller ; et le
verrou de l'IA refuse un tour DÉJÀ JOUÉ, même à celui qui le détient — la marque
périme au bout du délai du verrou, pour qu'un combat vraiment bloqué puisse
repartir. `file_bousculee.mjs` pose les trois devant le vrai code.

**Un tour joué par DEUX postes à la fois.** La trace suivante a montré deux
événements `carte` pour un seul tour de créature, dont un publié par l'autre
appareil : les deux avaient joué le tour. Trois trous, tous bouchés. (a) Le
verrou de l'IA jugeait son ancienneté avec l'heure inscrite dedans — celle de
l'horloge de l'AUTRE appareil : un iPad en avance trouvait périmé un verrou posé
à l'instant et le volait. L'ancienneté se mesure désormais depuis le moment où
CE poste a vu ce verrou pour la première fois, sans qu'aucune horloge étrangère
n'entre dans la décision. (b) L'écriture du verrou se faisait elle aussi
bousculer (`failed-precondition` sur `Verrou_IA`, dans la trace) et le poste
renonçait à jouer : elle est retentée. (c) Ceinture de sécurité côté lecture :
deux événements racontant exactement la même chose — même acteur, même manche,
même nature, mêmes données, les dés compris — mais **signés par deux postes
différents** ne sont pas deux coups, c'est le même raconté deux fois ; le
curseur avance, l'animation ne se rejoue pas. Chapitres 6 à 8 de
`file_bousculee.mjs`.

**Une créature qui joue DEUX tours, un sur chaque appareil.** Le plus vilain des
trois, et le seul que la ceinture de sécurité ci-dessus ne pouvait pas rattraper :
ce n'étaient pas deux copies d'un même récit, c'étaient deux récits. Dans la
trace, `MONSTRE_c1lxn01` publie un trajet et une carte depuis P_03, puis un AUTRE
trajet (parti d'une autre case) et une AUTRE carte (sur une autre cible) depuis
P_01. Deux trous : (a) la clé du verrou se fabriquait avec l'horodatage de
l'entrée dans la file — deux postes qui n'avaient pas exactement la même file
sous les yeux fabriquaient DEUX clés, prenaient chacun « son » verrou, et
jouaient tous les deux ; elle porte désormais la MANCHE, que les deux lisent
identique dans la partie. (b) « ce tour est joué » n'était su que du poste qui
l'avait joué ; le drapeau `fini` est maintenant écrit dans le verrou, donc
partagé — un poste qui arrive après coup le lit et renonce, verrou périmé ou pas.
Le verrou lui-même a quitté le document de la partie pour
`Systeme_Parties/{id}/Journal_Combat/verrou`, où rien d'autre n'écrit ; le ménage
de fin de combat l'efface avec le journal. Chapitres 9 et 10 de
`file_bousculee.mjs`.

## La nouvelle architecture — étape 1 : le noyau pur

`combat_etat.js` est le socle de la refonte, et le premier fichier du projet qui
ne connaît **ni Firebase, ni le navigateur, ni le temps qui passe**. Il fournit
trois choses : la FORME de l'état du combat (un seul objet, donc un seul document
Firestore, donc jamais d'état incohérent écrit) ; les DÉS À GRAINE, qui font
voyager le hasard *dans* l'état et rendent tout combat rejouable à l'identique ;
et les INVARIANTS — ce qui doit être vrai de tout état à tout instant.

`etat_combat.mjs` le met à l'épreuve sans rien simuler : il importe le vrai
fichier et l'appelle. Cinquante contrôles en quarante millisecondes, dont mille
pas au hasard sans un seul état incohérent. C'est le premier banc du projet qui
n'a besoin ni de faux Firestore, ni de faux navigateur, ni de trois postes à
orchestrer — et c'est tout l'objet de la migration.

En jeu : `voirEtat()` dans la console affiche le combat en cours sous cette
forme, avec la liste de ce qui cloche dedans. Deux appareils qui n'affichent pas
le même tableau, c'est une désynchronisation prise sur le fait.

## Étape 2 : le moteur devient une fonction pure

`moteur_pur.js` et `mouvement_pur.js` prennent un état et une action, et rendent
l'état d'après plus la liste de ce qui s'est passé. Rien d'autre : aucune
écriture, aucune animation, aucune attente, aucune variable globale.

**L'ordre des règles EST la règle du jeu**, et chaque maillon a son contrôle.
Pour les dégâts : le brut doublé par un critique à la source, les trente pour
cent perdus par une arme de jet au contact, l'absorption qui draine avant que le
reste ne frappe, la résistance (annulée par une armure percée), l'étalement qui
coupe APRÈS les résistances, le bouclier avant les points de vie. Pour le
déplacement : le barème 2/4/6 selon la case, le terrain difficile qui double, le
Glacé qui double aussi, l'atout du Vargen qui divise APRÈS les deux, l'équipement
qui ajuste sans jamais descendre sous 1. Changer cet ordre change l'équilibre —
et maintenant ça se voit.

Les formules de défense et les atouts de race ne sont pas recopiés : leur
RÉSULTAT est figé dans l'état au début du combat, en appelant les vraies
fonctions d'`app.js`. Une formule écrite à deux endroits finit toujours par
diverger.

L'IA des créatures suit (`ia_pure.js`) : faire jouer un monstre, c'est répondre à
deux questions — QUI viser, OÙ se mettre. Ces réponses se prenaient en lisant
quatre variables globales (fiches, pions, zones, plateau), chacune pouvant être
en retard d'une notification : deux postes qui faisaient jouer la même créature
au même instant n'avaient donc pas le même plateau sous les yeux, et prenaient
deux décisions différentes. C'est très exactement ce que montrait la trace de
Nico. Désormais la décision ne dépend que de l'état passé et de la graine.

## Étape 3 : le cerveau

`cerveau_combat.js` est la boucle qui tient l'architecture : il lit les
intentions (« je veux bouger là », « je lance cette carte », « j'ai fini »), les
VALIDE, appelle le moteur pur, et écrit l'état, l'entrée de journal et le
marquage de l'intention **dans un seul writeBatch**. Tout ou rien.

C'est ce marquage qui rend le doublon impossible : l'intention est refermée dans
le batch qui applique son effet. S'il échoue, elle reste en attente et sera
reprise ; s'il réussit, elle ne peut plus l'être. Il n'existe aucun instant où
les deux états coexistent — contrairement au verrou d'avant, qui vivait dans un
document séparé de celui qu'il protégeait.

Un poste ne demande jamais un RÉSULTAT, il demande une ACTION : les dés sont
tirés par le cerveau, jamais par le client. Et un refus dit toujours POURQUOI
(« c'est au tour de H1 », « chemin discontinu », « il faut 40 d'énergie, il en
reste 1 »), pour que l'écran l'affiche au lieu de rester muet.

Le dépôt est injecté : le vrai parle à Firestore, celui du banc range dans une
carte en mémoire — et sait rater ses écritures. Ce qu'on vérifie alors : après
un échec, rien n'a bougé, le journal est vide, et l'intention est reprise UNE
seule fois.

Les six bancs du noyau tournent en trois secondes, dix mille cartes, mille
trajets au hasard et un combat entier de cinq manches compris. Le test de propriété a déjà trouvé un vrai bug qu'aucun
banc précédent ne pouvait voir : une valeur brute négative posait un bouclier
négatif. Et le banc du cerveau en a trouvé un second, plus grave : une créature
ne refermait pas son propre tour, alors le cerveau le rejouait sans fin — quarante
pas publiés pour un seul déplacement. Un tour entier de créature tient désormais
dans UNE entrée, close par le même batch qui l'a écrite.

## Étape 4 : le spectateur

`spectateur_combat.js` est l'autre bout du fil : le cerveau écrit, le spectateur
regarde. C'est **la seule chose qui déclenche une animation** dans la nouvelle
architecture. Il n'écrit rien, jamais.

Trois règles, et tout le reste en découle.

*On anime d'abord, on applique ensuite.* L'animation reçoit l'état **d'avant**
l'étape — c'est ce qui lui permet de montrer les 60 points de vie descendre vers
48. L'état n'avance qu'une fois l'animation finie. L'inverse (appliquer puis
animer) est exactement ce qui faisait sauter les pions d'une case à l'autre.

*On ne saute jamais un numéro.* Si le n°4 arrive avant le n°3, on ne joue pas le
4 : on attend, et au bout de 800 ms on va chercher le 3 directement en base. Tant
qu'il manque, rien n'avance et la trace le dit (`🔍 il manque le n°3`). Un
journal reçu à l'envers se rejoue dans l'ordre.

*Un tour = un OK.* La fenêtre sombre s'ouvre une fois par tour, pas une fois par
étape : la clé d'un tour est `acteur|manche`. Un déplacement de trois cases suivi
d'une carte et de ses dégâts, c'est un seul clic.

Le chapitre 6 du banc est celui qui compte. Il fait tourner le **vrai** cerveau,
récupère son journal, puis le donne à **trois spectateurs qui n'ont pas le même
rythme** : un qui suit tout en direct, un qui dort et reçoit les entrées à
l'envers au réveil, un qui ne clique jamais et rattrape sans animer. À la fin,
les trois ont **le même état, au même numéro** — et celui qui rattrapait n'a joué
aucune animation. C'est la garantie qu'on cherchait depuis le début : l'écran
peut prendre du retard, il ne peut pas diverger.

Ce qui protège du rejeu en double, le chapitre 7 le mesure : deux lectures qui
arrivent en même temps ne se chevauchent jamais, une seule animation tourne à la
fois. Et le chapitre 8 vérifie qu'on peut **rejoindre un combat déjà commencé**
sans rejouer les vingt tours passés : on part de l'état publié, tel quel, et on
s'anime à partir de la suite.

## Étape 5 : le branchement

Trois pièces, et elles ferment la boucle.

`depot_firestore.js` **écrit**. Un pas = un seul `writeBatch`, et il porte
l'état, l'entrée de journal et la fermeture des intentions. Firestore applique
un lot en entier ou pas du tout : il n'existe donc aucun instant où l'état a
avancé sans son entrée, ni où une intention a produit son effet sans être
refermée. Le banc met le lot en échec et vérifie ce qui reste — l'état d'avant
intact, le journal vide, l'intention toujours en attente, donc reprise, et
refaisant exactement le même calcul puisque la graine n'a pas avancé non plus.

**Ce qui disparaît en arrivant là : le compteur d'événements, et sa
transaction.** Ce n'était pas un détail — ce compteur était le point de
contention le plus chaud du jeu et la cause directe du `failed-precondition`
qui faisait rejouer des tours entiers. Il n'existait que parce que trois postes
publiaient dans le même journal. Un seul écrit maintenant, et le numéro d'une
entrée EST la version de l'état qu'elle produit. Plus rien à réserver, donc plus
rien à arbitrer, donc plus aucune transaction : le banc vérifie qu'il n'en est
demandé nulle part.

`pont_combat.js` **montre**. Il existe parce que les animations du jeu ont été
écrites en même temps que le calcul : `jouerAnimationMoteur` ne montre pas une
attaque, elle la RÉSOUT. La rejouer telle quelle sur trois appareils, c'est le
mécanisme des dégâts doublés remis en marche. Ici, le calcul est déjà fait —
`misEnScene` est pure, lit l'étape et l'état d'AVANT, et rend ce qu'on doit
voir. Le banc vérifie qu'aucun type d'étape que le noyau sait appliquer n'est
laissé sans mise en scène : pas ceux auxquels on a pensé, tous.

`regime_cerveau.js` **branche**, et c'est tout ce qu'il fait. Il est le seul
fichier qui voie toutes les pièces. Le drapeau `REGIME_CERVEAU` est éteint par
défaut : tant qu'il l'est, le combat tourne exactement comme avant. Un
basculement qui ne se défait pas en une ligne est un basculement qu'on n'ose pas
essayer un soir de partie.

### Le banc qui décide si on peut jouer

`regime_cerveau.mjs` fait tourner **trois régimes complets côte à côte** sur un
même Firestore de banc, avec de vraies conditions : notifications livrées à la
demande, dans le désordre, et un poste mis en veille au milieu. Nico suit tout,
Ben clique en retard, la tablette dort et reçoit tout d'un coup au réveil.

Ce qu'il établit :

- **Un seul poste écrit.** Ce n'est pas supposé : chaque poste a son propre
  accès à la base, et le banc regarde ce que chacun a réellement écrit. Ben n'a
  écrit que des intentions, la tablette rien du tout.
- **Les trois écrans finissent identiques** — le même état, au même numéro,
  combattant par combattant — et ils ont vu **la même suite d'animations**, dans
  le même ordre, celui qui rattrapait compris.
- **Un poste qui arrive en cours de route** part de l'état publié sans rejouer
  les tours passés, puis s'anime à partir de la suite.
- **Un poste qui n'a pas rechargé sa page ne joue pas.** Il refuse un format
  qu'il ne connaît pas au lieu de faire semblant — le bug des deux verrous qui
  ne se voyaient pas, rendu impossible.
- **Une demande illégitime ne peut rien abîmer.** Jouer le héros d'un autre,
  téléporter son pion, donner un ordre à une créature : les trois sont refusées
  avec leur raison, l'état ne bouge pas, et le combat n'est pas bloqué pour
  autant.

Deux bugs trouvés par ce banc, et le premier est joli : un minuteur de battement
de cœur qui se replanifiait sans jamais attendre faisait tourner une boucle à
pleine vitesse. Un battement nul est maintenant un vrai réglage — « pas de
battement » — au lieu d'un « battement infiniment rapide ».

### Le branchement lui-même

Cinq points d'appel redirigés, tous derrière la même garde :

| Ce que fait le joueur | Avant | Maintenant |
|---|---|---|
| Fin de tour | transaction sur la file, arbitrage du combattant attendu, relances | `demanderFinDeTour` |
| Déplacement validé | opportunités tranchées ici, zones franchies, coût déduit, position écrite | `demanderMouvement(chemin)` |
| Carte lancée | dés, critique, esquives, dégâts, états, écriture en base | `demanderCarte(carte)` |
| OK de la fenêtre sombre | curseur du journal d'événements | `regime.ok()` |
| Notification de la partie | séquence de tour + IA des monstres | `regimeSuivreLaPartie` |

**Le déplacement est le cas le plus parlant.** Avant, le poste qui bougeait
tranchait lui-même les attaques d'opportunité, les zones franchies et le coût,
puis écrivait la position d'arrivée. Maintenant il envoie **le chemin, et rien
d'autre** : le cerveau calcule tout le reste, une fois, pour les trois écrans.
Le pion ne bouge même pas chez celui qui l'a demandé — il bougera au rythme du
journal, un hexagone à la fois, comme chez les autres.

**Et la carte tue les dégâts doublés à la racine.** Le point de coupure est
choisi : la carte est enrichie par l'équipement et ses cibles sont arrêtées,
mais aucun dé n'est encore tombé. Il n'y a donc plus de « poste auteur » à
distinguer d'un poste qui rejoue, plus de `RESOLUTIONS_LOCALES`, plus de
timestamp à reconnaître. Personne ne résout deux fois, parce qu'un seul résout.

`drapeau_regime.mjs` ne fait tourner aucun combat : il **lit le code du jeu** et
vérifie que chaque redirection est gardée, que l'ancien chemin est intact, et
que le régime n'écrit jamais dans l'ancien monde (ni `Action_*`, ni
`modifierPartie`, ni Firestore en direct). C'est un banc de structure, et il
attrape la classe d'erreur qu'aucun test de combat ne peut voir : un oubli de
garde ne se verrait qu'en jeu, un soir, au milieu d'un combat.

### Ce que les premiers vrais essais ont appris

Trois choses, et aucune n'était visible depuis un banc. Elles sont toutes les
trois épinglées par un contrôle maintenant.

**Les maxima sont des formules, pas des champs.** Le premier combat ouvert en
nouveau régime a été refusé par les invariants : « 110 d'énergie pour un maximum
de 100 ». Le héros n'avait rien d'anormal — il était Humain, et l'atout de son
peuple donne +10 d'énergie maximale. La fiche porte 100, le jeu calcule 110, et
lire le champ brut fabriquait un combattant hors de ses propres bornes avant même
le premier tour. Les bornes viennent désormais des formules du jeu, injectées
comme les défenses.

**Un refus d'ouvrir ne doit jamais laisser la table sans rien.** C'est le piège
que ce même essai a révélé, et il était de ma fabrication : refuser de publier un
état incohérent est la bonne décision, mais l'ancien rejeu étant éteint sous le
nouveau régime, la table s'est retrouvée sans cerveau ET sans ancien monde. Un
plateau qui n'avance plus, deux joueurs devant leurs cartes. L'échec rebascule
maintenant sur l'ancien régime immédiatement, décoche la case, et laisse la
raison écrite dans la trace pour qu'on la corrige à froid.

**Une fonction peut avoir deux métiers.** `verifierTourIAMonstres` fait choisir
leur technique aux créatures pendant la préparation, et leur fait jouer leur tour
pendant la résolution. Seul le second appartient au cerveau. En la coupant
entière, les créatures ne posaient plus jamais leur carte : la file restait
incomplète, la phase ne passait jamais en résolution, et la piste d'initiative ne
se lançait pas — sans que rien ne dise pourquoi.

Et la leçon commune aux trois : **une trace qui ne dit pas dans quel monde elle
se trouve fait perdre une soirée.** Le tout premier essai a tourné entièrement en
ancien régime sans que rien ne l'annonce ; il a fallu relire la trace ligne à
ligne pour comprendre que le drapeau n'était pas allumé. Le régime s'annonce
maintenant au début de chaque combat, allumé ou non — c'est précisément quand il
est éteint que l'information manque.

### L'ouverture est une réclamation, pas une décision locale

Le bug qui a figé le deuxième écran, et il était de conception. Chaque poste
voyait la phase passer en résolution et **ouvrait de son côté** : le dernier
faisait table rase du journal des autres, et un poste dont le curseur était déjà
à 2 attendait pour toujours une entrée n°3 qui n'existait plus. Écran figé sur
« le tour se prépare », et rien dans la trace pour le dire.

Deux corrections, et elles se complètent.

**L'ouverture est atomique.** Elle passe par une transaction sur le document
d'état : si la rencontre est déjà ouverte, on abandonne et on regarde. Pas de
vote, pas d'horodatage, pas de comparaison d'horloges — un compare-et-pose, et
la base tranche. C'est la **seule** transaction de tout le nouveau régime, et
`depot_firestore.mjs` le compte : une pour tout un combat, là où le compteur
d'avant en faisait une par hexagone parcouru.

**Chaque entrée porte l'identité de sa rencontre** (`ID_Rencontre`, posé par le
jeu quand les créatures sont générées, donc lu identique par les trois postes).
Un écran n'a alors aucune chance de rejouer le journal du combat d'avant : il ne
reconnaît pas l'identité et l'écarte — sans l'attendre. Le ménage du vieux
journal devient de l'hygiène au lieu d'être de la correction, et toute la
famille « curseur resté sur un journal purgé » disparaît.

Et une conséquence qu'il fallait voir : **la file de la partie ne veut plus rien
dire**. Le cerveau écrit l'état, pas le document de la partie, où
`File_Attente_Combat` reste figée sur ce que la préparation y a posé. La fenêtre
sombre lit donc maintenant l'état AFFICHÉ par le spectateur — celui que cet écran
montre vraiment, pas celui que la base annonce. Un poste en retard raconte son
propre retard, ce qui est exactement ce qu'on veut.

### La question qu'on pose avant d'ouvrir

Une seule question mal posée a coûté un essai entier. On demandait **« y a-t-il
un état publié ? »** pour décider s'il fallait ouvrir. Or l'état de la rencontre
précédente survivait à la réinitialisation — `fermerCombat` gardait
délibérément l'état « parce qu'il dit qui a gagné ». La réponse était donc oui,
personne n'ouvrait le nouveau combat, et le plateau ne démarrait pas. Aucune
trace, aucune erreur, aucun `❌` : juste un silence complet après
`⚙️ combat en régime CERVEAU`.

La bonne question est **« cet état parle-t-il de CETTE rencontre ? »**. Un état
qui parle d'une autre n'a plus cours, et il faut ouvrir par-dessus.

Deux hygiènes s'ajoutent :

- **Une réinitialisation n'épargne plus l'état.** Elle efface tout — journal,
  intentions, état — et le fait même quand aucun régime n'est branché, puisque
  c'est justement quand un état périmé traîne qu'il bloque la suite.
- **La projection déplace les pions, elle n'en invente pas.** Elle créait
  l'entrée manquante avec seulement `q` et `r` ; le plateau la redessinait
  aussitôt sans image ni nom, d'où une volée de `GET .../undefined 404` et des
  pions fantômes. Un combattant que le plateau ne connaît pas encore n'est pas à
  nous de le créer.

### Celui qui perd la réclamation ne perd pas sa place

Trois postes ouvrent, un gagne — c'était acquis. Ce qui ne l'était pas : **ce
que devient celui qui perd**.

Il se rebranchait. Or se rebrancher, c'est débrancher d'abord — donc remettre le
curseur et la file des entrées reçues à zéro. Les entrées déjà arrivées et la
fenêtre qui attendait le OK disparaissaient d'un coup, et le joueur cliquait
dans le vide pendant que le combat avançait sans lui. La trace le disait presque
mot pour mot :

```
📥 1, 2, 3 reçues     ⏸️ fenêtre en attente du OK, n°1
🤝 un autre poste a ouvert ce combat
📚 journal branché (à partir de 3)     ← tout est effacé
👆 OK dans le vide
```

Deux corrections. **Se brancher est idempotent** : déjà branché, rien à refaire
et tout à perdre. Et **le point de départ suit l'identité du combat**, pas « la
première fois qu'on voit un état » — repartir n'a de sens qu'à un vrai
changement de rencontre.

**Et une relecture, une seule.** L'état et le journal sont deux documents, donc
deux écoutes : rien ne garantit leur ordre d'arrivée. Les entrées d'un combat
qu'on ne connaissait pas encore ont pu être écartées à la porte — c'est voulu —
mais une écoute ne renotifie que lorsqu'un document bouge. Sans relecture après
un changement de combat, ces entrées ne reviendraient jamais.

Le banc ne voyait rien de tout ça parce qu'il **pilotait** l'ouverture au lieu de
la laisser courir, et parce que sa file commençait par un héros : le cerveau
n'avait donc jamais rien à publier avant qu'un joueur clique. Il existe
maintenant une seconde rencontre de banc où **une créature ouvre la manche** —
le cas courant en jeu, l'initiative ne triant pas les camps, et le seul où le
cerveau publie avant le moindre clic.

### La file doit redescendre là où le jeu la lit

Le combat s'ouvrait, jouait le tour de la première créature… et s'arrêtait. Pas
parce que le cerveau était bloqué : **parce que le joueur ne pouvait rien
faire**.

Le cerveau écrit l'état ; le document de la partie, lui, garde la file que la
préparation y a posée et n'en bouge plus. Or **une douzaine d'endroits du jeu la
lisent encore** — le bouton « fin de tour », le panneau des cartes, la piste
d'initiative, la fenêtre sombre. Tous croyaient donc que c'était toujours à la
créature de jouer.

Plutôt que de réécrire ces douze lecteurs, on leur donne la vérité : la file de
l'état redescend dans `PARTIE_DATA`, **en mémoire seulement**, et ils la lisent
comme ils l'ont toujours fait. Rien ne remonte en base — c'est une projection,
pas une écriture, et le banc du drapeau le vérifie : deux écrivains, et toute
l'architecture tomberait.

Deux moitiés, et les deux comptent. Une notification de la partie **remplace**
`PARTIE_DATA` en entier ; sans repose, l'interface repart aussitôt sur la file
périmée. La projection se redépose donc après chaque notification.

Et le cerveau **dit qui il attend** quand il ne publie rien : `⌛ le cerveau
attend PERSO_250418 (au joueur P_03)`. Neuf fois sur dix c'est normal — un
joueur réfléchit — mais « rien ne se passe » sans explication est précisément ce
qui a coûté le plus de temps depuis le début.

### Une carte termine le tour

La règle du jeu depuis toujours : `validerCarteCombat` enchaîne sur
`finDeTourCombat`. Le cerveau ne le faisait pas, et ça se voyait de deux façons
à la table — le tour ne se finissait pas après l'attaque, et **on pouvait lancer
la même carte plusieurs fois de suite**.

La clôture règle les deux d'un coup : le lanceur quitte la tête de file, donc une
seconde carte est refusée d'elle-même (« c'est au tour de X »). Il n'y a pas de
compteur à tenir, juste une règle à dire.

Deux conséquences qu'il fallait suivre. **Un refus n'est pas une fin** : le
« fin de tour » qu'un joueur envoie juste après son attaque arrive trop tard,
il est refusé — et la boucle s'arrêtait dessus, sans faire jouer les créatures
qui suivaient. Mais **un refus qui revient est un mur** : si l'intention n'a pas
pu être refermée (un dépôt sans `refuser`, une écriture perdue), on repasserait
dessus indéfiniment. La boucle continue sur un refus, et s'arrête franchement
sur le même refus deux fois.

### La carte d'une créature passe par l'extracteur du jeu

Les créatures lançaient une carte **vide** : elles marchaient, « renonçaient »,
et on ne voyait ni animation ni dégât. La cause tenait à un champ qui n'existe
pas — je lisais `data.attaques`, alors que la Forge écrit `Composants.actions`,
et qu'il faut **sept cents lignes d'extraction** pour en tirer des attaques, des
altérations, une zone, un bond.

Réécrire cet extracteur en pur, ce serait le dupliquer, donc le laisser dériver.
On lui ouvre une porte : `demarrerCiblage(idCarte, { extraire: true, idLanceur })`
fait tout le travail et rend la carte **sans toucher à l'écran ni au ciblage**.
Le point de coupe est net — juste après la construction de la carte, avant la
première ligne d'interface.

Quatre références au panneau gauche devenaient un obstacle (« qui lance ? ») :
elles passent par un `persoLanceur` résolu une fois, nommé par l'appelant ou lu
dans le panneau comme avant.

Et parce que **le cerveau est synchrone** alors que l'extraction ne l'est pas,
les cartes des créatures sont lues **à l'avance**, à l'ouverture du combat et de
chaque manche, puis rangées. Ce n'est pas une optimisation : c'est la seule façon
de lui donner une carte complète sans dupliquer l'extracteur. Et c'est cohérent
avec les règles — la technique d'une créature est choisie pendant la préparation
et ne change plus pendant la manche.

### Le nouveau régime est le régime

Il était éteint par défaut le temps de l'essayer ; il ne l'est plus. Et **un
échec ne rebascule plus sur l'ancien** : une version intermédiaire le faisait
« pour ne pas laisser la table sans rien », mais l'ancien régime est cassé, et le
rendre à la table sans prévenir au milieu d'une rencontre, c'est offrir une
soirée de bugs à la place d'un message clair.

Un combat qui ne peut pas s'ouvrir **s'arrête**, franchement, et le dit à
l'écran. Mieux vaut un combat qui refuse de commencer qu'un combat qui commence
mal. Perdre la réclamation d'ouverture n'est pas un échec, en revanche : c'est
un autre poste qui tient le cerveau, et on le suit.

### Deux coutures assumées

Elles sont écrites dans le code, à l'endroit exact où elles se trouvent :

- **L'enrichissement par l'équipement** reste côté client. Il ne dépend que de
  la fiche du joueur qui joue sa propre carte, un seul poste l'exécute, il ne
  peut donc pas diverger — mais il a sa place dans le noyau.
- **La dissipation de la Confusion** (bande 41-50) n'est pas encore portée par
  une intention. Plutôt que d'écrire à moitié — retirer l'état de la fiche mais
  pas de l'état du combat, donc le voir revenir au rafraîchissement suivant —,
  on ne dissipe pas : la Confusion tient un tour de plus. Une différence petite,
  bornée et visible, là où l'écriture à moitié serait une divergence entre les
  écrans.

**Un tour appartient à UN SEUL poste, et c'est le journal qui tranche.** Quatrième
trace : P_03 prend le verrou de `MONSTRE_13sb8te`, le joue, publie l'événement 1
— et l'événement 2 arrive « de P_01 », la même carte sur la même cible. L'autre
poste a joué le tour **sans avoir le verrou**. Un verrou est une pièce à part :
un appareil dont la page n'a pas été rechargée, une écriture bousculée, un
plateau désynchronisé peuvent le prendre en défaut. Deux réponses.

*La dernière ligne.* Il existe un point de passage obligé, où une seule
transaction fait déjà autorité : la réservation des numéros du journal. On y
inscrit désormais **à qui appartient le tour** (acteur + manche, trente entrées
de mémoire). Un second poste qui tente de publier le même tour n'obtient pas de
numéros, et son récit ne part jamais — quel que soit l'état du verrou, quelle que
soit la version d'en face. Le ménage de fin de combat libère les tours avec le
reste. Chapitres 7 et 8 de `journal_firestore.mjs`.

*La passerelle de version.* Le verrou avait déménagé dans son propre document
sans passerelle : un poste resté sur l'ancienne version écrivait toujours dans
celui de la partie, et **les deux verrous ne se voyaient pas**. Il est maintenant
lu et écrit **aux deux emplacements dans la même transaction**, tant qu'un
appareil peut être en retard d'une version.

*Et pour le voir.* `window.VERSION_IVALIS` (dans `trace_combat.js`, à monter avec
les `?v=` d'`index.html`) voyage avec chaque événement publié : la trace affiche
`📥 2 carte M1 [de P_01 v24]`. Une ligne suffit alors à repérer l'appareil qui
n'a pas rechargé.

**La trace du combat.** `trace_combat.js` est chargé avant tout le reste et
écrit dans la console une ligne par chose qui arrive : événement publié, reçu,
retenu par le OK, rejoué, fin de tour, verrou de l'IA — et surtout **chaque
changement de points de vie, avec sa cause** (`[direct]`, `[rejeu]`,
`[calcul IA]`, `[base]`, `[base rendue]`, `[écran retenu]`). Chaque événement reçu ou
rejoué porte **le poste qui l'a publié** (`[de iPad-Ben]`) : c'est ce qui permet
de voir en une ligne que deux appareils ont joué le même tour. C'est le seul moyen de voir
un dégât appliqué deux fois : la même cible, le même nombre, deux lignes. En
jeu : `effacerTrace()` avant de reproduire, `copierTrace()` après. Elle ne garde
que les 500 dernières lignes et se coupe avec `TRACE_COMBAT_ACTIVE = false`.

**La fenêtre sombre se pose dès le début du tour**, ennemi comme allié, sans
attendre le moindre événement. Le tour d'un autre ne nous appartient pas : on ne
doit ni le voir se préparer, ni voir des points de vie bouger avant l'animation.
Elle se lève quand le tour se rejoue — et à ce moment-là seulement.

**Ce qui est déjà montré ne recule pas, ce qui ne l'est pas encore n'avance
pas.** Les points de vie voyagent dans la fiche du combattant, pas dans le
journal : ils arrivent donc chez tout le monde dès que l'auteur a tranché,
c'est-à-dire AVANT que l'écran n'ait rejoué le tour. On voyait la vie d'un héros
se retirer derrière la fenêtre sombre, plusieurs secondes avant le coup qui la
lui prend. Même principe que pour la case d'un pion : un combattant qu'un
événement en attente NOMME garde à l'affichage ses valeurs d'avant, et les deux
se rejoignent dès que le tour est rejoué ici.

**Le spectacle appartient à la relecture.** Faire jouer une créature, c'est la
faire viser : le moteur allume les anneaux de ciblage, pose l'emprise de la
zone, la fait tourner, la montre un instant, puis valide. Tout cela est du
CALCUL — mais ça se voyait, et ça se voyait AVANT que le tour ne soit rejoué.
Sur le poste qui fait tourner l'IA, on assistait donc deux fois au même tour :
d'abord la créature qui vise en coulisses, puis l'animation pour de vrai.
Pendant le calcul, les tracés de ciblage se taisent (`CALCUL_IA_SILENCIEUX`) et
les temps de pose tombent à zéro — personne ne les regarde. Même principe pour
les zones persistantes : elles sont écrites en base dès que la carte se résout
chez son auteur, et se dessinaient donc plusieurs secondes avant l'animation qui
les crée ; elles attendent maintenant que le journal soit à jour.

**La marche, et son petit bond.** Découper le trajet en un événement par
hexagone avait coûté l'animation : à la fin de chaque case on remettait la
transition à « none » et l'échelle à zéro, si bien que le pas suivant partait
sans transition — le pion sautait de case en case, tout bêtement. Pire, on
redessinait le plateau après chaque case, ce qui DÉTRUISAIT l'élément en train
d'être animé. Les réglages sont maintenant posés une fois, avec un reflow avant
le déplacement, et rien n'est remis à zéro entre deux pas : le pas suivant
enchaîne. Le journal ne marque plus non plus de temps de respiration entre deux
pas d'un même trajet — une marche ne s'arrête pas un tiers de seconde à chaque
case.

**Rien de ce qui DÉCIDE ne dépend de ce qui S'AFFICHE.** C'est la règle, et
c'est celle qui manquait. Un poste peut être en retard de plusieurs tours à
l'écran — sa fenêtre sombre attend un doigt qui ne vient pas — et rester
pourtant celui qui fait jouer les créatures : il calcule et fait avancer la
partie, tout seul, en arrière-plan. `combat_reseau_complet.mjs` joue désormais
TOUT le combat avec un poste MUET, qui ne touche pas une seule fois son écran, et
lui fait mener un round complet à lui seul pendant que les deux autres ont fermé
leur fenêtre de combat.

**Les verrous d'animation ne peuvent plus rester coincés.** Trois drapeaux disent
« une animation tourne » et suffisent, à eux seuls, à faire taire l'IA des
créatures et à empêcher tout redessin du plateau. Un seul resté levé — une
animation qui casse en chemin, un onglet iPad endormi en pleine marche, une
exception avant la ligne qui le rabaisse — et le combat se figeait POUR DE BON
sur ce poste : plus aucune créature ne jouait, le bouton de fin de tour restait
éteint chez les humains, et rien ne réveillait personne. On note maintenant
l'INSTANT où chaque drapeau se lève ; passé le temps qu'une telle animation peut
durer, il ne compte plus. Aucun autre fichier n'a à le savoir.

**La fenêtre sombre ne se pose que pour annoncer un tour.** Elle restait
autrefois là dès que ce n'était pas notre héros — c'est-à-dire presque tout le
temps —, et le moindre grain de sable ailleurs laissait un écran noir figé sur un
tour qui ne venait pas. Elle s'ouvre désormais pour présenter le combattant et sa
technique, se lève au toucher, et le reste du temps le plateau est visible. Un
plateau visible ne peut pas se bloquer.

**Un hexagone, un numéro.** Un trajet entier tenait au départ dans UN seul
événement, et c'était fragile de bout en bout : un poste qui le rejouait en
retard partait d'une case qui n'était plus la bonne, une animation coupée en son
milieu laissait le pion nulle part, et rien ne disait où il en était. Chaque
**pas** est maintenant son propre numéro, avec sa case de départ ET sa case
d'arrivée — donc une position ABSOLUE : le rejouer deux fois donne le même
résultat, et un poste qui reprend au milieu d'un trajet reprend au bon hexagone.
Les pas partent dans le journal AVANT que la case d'arrivée ne soit écrite sur le
plateau, si bien que personne ne peut voir le pion arrivé sans avoir de quoi l'y
amener à pied. Le lecteur les joue un par un et n'entame jamais le suivant avant
la fin du précédent (`deplacement_journal.mjs`).

**Où est le pion, vraiment ?** Deux choses différentes, et c'est tout le point :
`TOKENS_VTT_DATA` porte la VÉRITÉ DE LA BASE — c'est elle que lisent les portées,
les cases occupées, le calcul de chemin ; l'ÉCRAN, lui, garde le pion là où il
est tant que le journal ne l'a pas fait marcher ici. L'ancienne version rangeait
la position PROTÉGÉE dans `TOKENS_VTT_DATA` : la case d'arrivée n'était alors
notée nulle part, et le pion revenait à son point de départ sitôt le trajet
rejoué, avant de resauter en avant à la notification suivante. C'était ça, le
pion qui « se déplace n'importe où ». La position d'écran se lit désormais sur
l'élément lui-même (`data-q` / `data-r`), et le seul redessin autorisé passe par
`redessinerPions()`, qui applique la protection — appeler `appliquerTokensVTT`
avec les cases brutes reposait chaque pion là où la base le croyait.

**La liste des pions retenus ne se tient plus à la main** : elle se DÉDUIT des
événements reçus et pas encore rejoués. Une liste tenue à la main finit toujours
par mentir — on oublie d'y inscrire un pion, ou de l'en retirer.

**Le journal se vide à la fin du combat** (victoire) et à la réinitialisation,
documents et compteur dans la même opération : sans quoi la rencontre suivante
démarrerait avec des centaines de numéros derrière elle, et un poste qui rejoint
rejouerait une bataille qui n'existe plus.

Cinq pièges refermés en chemin, tous vérifiés par `sequence_tour.mjs` :

- **Le rejeu qui efface ce que la base a dit entre-temps.** Le plus gros. Le
  moteur écrit le résultat dans la fiche locale du combattant ; un poste qui
  rejoue en retard y écrivait une valeur du PASSÉ — d'après l'attaque, mais
  d'avant la brûlure et la régénération qui ont suivi — et il y restait jusqu'à
  ce que la fiche rebouge. D'où des points de vie qui ne concordaient pas d'un
  écran à l'autre pendant plusieurs tours. L'événement sert désormais de MOT DE
  PASSE : si la fiche locale est encore exactement au point de départ qu'il
  annonce, la base n'a pas appliqué la suite et le rejeu a le droit d'écrire ;
  sinon la base est passée devant, l'animation se joue pour l'œil et le
  combattant retrouve ensuite la dernière parole de la base (`VERITE_BASE`,
  notée par `persoDocVersFront`, seul passage obligé de tout ce que la base
  raconte d'un combattant). Une chaîne d'événements du même tour se recolle
  d'elle-même : ce que le rejeu d'un événement écrit est, par construction, le
  point de départ du suivant.
- **Les deux coups de la même carte.** Une carte peut frapper deux fois la même
  cible ; le moteur retranche alors le second coup de ce que le premier vient
  d'écrire. La valeur d'avant, servie à chaque demande, cassait cette chaîne :
  les deux coups repartaient du même chiffre, seul le dernier comptait, et le
  spectateur voyait moitié moins de dégâts que l'auteur. Elle n'est plus servie
  qu'à la PREMIÈRE demande pour un combattant et un champ donnés.

- **La relecture qui frappe deux fois.** Le moteur applique les dégâts en
  retranchant ce qu'il lit ; une relecture démarre forcément après que l'auteur
  a écrit son résultat. Chaque événement porte donc les points de vie et le
  bouclier **d'avant** des seuls combattants qu'il nomme. Rien n'est réécrit
  dans les combattants : ce que la base a livré entre-temps sur d'autres — le
  tic d'une brûlure, l'énergie dépensée ailleurs — reste intact. Et pendant une
  relecture, personne n'est l'auteur : le moteur ne réécrit rien en base et ne
  redéclenche aucun sous-effet, qui sont déjà des événements à part entière.
- **Les animations derrière la fenêtre.** Un poste qui regarde ignore les
  `Action_*` de la partie : il ne connaîtra ce tour que par le journal. Une
  seule exception, chez le poste qui CALCULE : l'animation de sa carte, qui
  n'est pas une animation mais le moteur de résolution lui-même.
- **Le trajet à l'envers.** Une relecture démarre longtemps après le
  déplacement : le pion est déjà arrivé, et la marche repartait de sa case
  d'arrivée. La case de DÉPART voyage maintenant avec le trajet, et le pion y
  est reposé avant de se mettre en marche (même chose pour le bond, la poussée
  et la traction).

## La suppression du panneau latéral gauche

Le panneau qui occupait le bord gauche de l'écran de combat a été supprimé en
entier : sa mécanique d'ouverture, son contenu, et surtout **sa visionneuse**.

Il portait le nom et le portrait d'un combattant, ses deux jauges et son deck.
Cliquer sur un portrait de la piste d'initiative ou sur un pion du plateau y
installait ce combattant-là, créature comprise — et pour cela
`afficherDansPanneauGauche` **remplaçait `COMBAT_PERSOS_JOUEUR` par [lui]**, en
mettant la vraie liste de côté dans `COMBAT_PERSOS_JOUEUR_BACKUP`.

C'était une visionneuse qui se faisait passer pour une autorité, et elle a coûté
**trois défauts distincts, signalés trois fois en partie** : le bouton de fin de
tour éteint, la carte qui refusait de se lancer, et le combat qu'on ne pouvait
plus démarrer. À chaque fois, du code demandait « qui joue ? » ou « à qui est
cette carte ? » à un affichage.

Ce que le panneau montrait vit ailleurs depuis : les jauges et le nom sur le
bouton de fin de tour, les états sur leur piste à sa gauche, le deck sous la
lanière de cuir, et le combattant qui joue dans l'encart de tour.

Trois retouches de fond accompagnent la suppression, parce que trois gardes
posées CONTRE la visionneuse s'appuyaient sur elle sans qu'on l'ait vu :

- **`herosDuPoste()` n'a plus de repli.** Le `|| miens[0]` existait pour avoir
  quelque chose à afficher quand la liste avait été remplacée par [une créature].
  Sans panneau, ce repli montrerait la vie d'un gnoll au joueur comme si c'était
  la sienne. Aucun héros, aucune réponse — le bloc s'efface.
- **`herosPourCarte()` rend le propriétaire de la carte, même quand ce n'est pas
  un des miens.** Son repli rendait « le combattant affiché » : quand la
  visionneuse montrait la créature dont on venait d'ouvrir la technique, il
  tombait juste par accident. Le panneau parti, la technique d'un gnoll
  redevenait choisissable. Le repli ne sert plus qu'au cas qu'il visait : une
  carte dont le cache ne connaît pas encore le propriétaire.
- **`combattantDuPanneau()` s'appelle `combattantCourant()`.** Elle ne répondait
  déjà plus sur un panneau.

Deux bancs changent de nom avec leur sujet :

```sh
node pas_de_visionneuse.mjs   # (ex panneau_visionneuse) prouvait que le moteur
                              # savait se défendre contre elle ; prouve maintenant
                              # qu'elle n'existe plus, et qu'un clic sur le
                              # portrait d'un ennemi ne change rien
node compteurs_combattant.mjs # (ex jauges_panneau) mesurait la largeur de deux
                              # barres ; mesure maintenant les globales
                              # COMBAT_PV_* / COMBAT_FATIGUE_* que ces deux
                              # fonctions de jauge tiennent à jour, et que tout
                              # le moteur lit
```

## Le chargement sur iPad, et le sceau qui le couvre

« Sur iPad et que sur iPad, au moment où je rentre le mot de passe pour charger
une partie, ça met toujours au moins une minute avant de charger la page du
jeu ; sur PC c'est instantané. »

Trois causes, et elles s'additionnaient.

**Le transport de Firestore.** Le client parle par défaut en WebChannel, un flux
permanent. Quand ce flux ne peut pas s'établir — Safari sur iOS, un réseau
mobile, un routeur qui coupe les connexions longues — il **ne renonce pas tout
de suite** : il attend l'expiration du délai avant de retomber sur le long
polling, qui, lui, passe partout. Cette attente-là, c'est la minute, et elle ne
se voit pas sur PC où le flux s'établit du premier coup.
`experimentalAutoDetectLongPolling` inverse l'ordre : le client SONDE la
connexion et bascule tout de suite sur le transport qui marche. C'est ce que
Firebase a fini par adopter par défaut dans les versions suivantes du SDK.

**La playlist, en boucle.** Le repli de la musique tenait en une ligne : si
`play()` est refusé, on passe au titre suivant. Aucun compteur, et la file se
remplit toute seule quand elle se vide — un refus enchaînait donc les titres
indéfiniment, et chaque essai appelle `load()`, qui va **chercher** le fichier.
Mesuré dans un navigateur où la lecture ne peut pas aboutir : **2443 requêtes
audio en neuf secondes**. Sur iOS, `play()` est refusé dès que le navigateur ne
reconnaît pas de geste de l'utilisateur — et ce refus tombe pile au clic qui
fait entrer dans le jeu. La salve partait donc en même temps que la connexion à
la base et les images de la table. Après correction : 13.

**Le fichier de configuration n'était pas versionné.** Les scripts de la page
portent un numéro depuis toujours, mais pas ce qu'ILS importent : un module
chargé par `import` est rangé sous son URL. Une tablette qui a déjà ouvert le
jeu aurait continué de servir l'ancien `firebase-config.js` — le réglage
ci-dessus ne serait jamais arrivé sur l'appareil pour lequel il a été écrit.

**Et le reste du temps, on le déplace.** Il reste, sur une tablette, une
trentaine d'images à décoder dont une carte de 2400 pixels de large. On ne peut
pas les rendre gratuites ; on peut les décoder ailleurs que devant un joueur qui
attend. Le **sceau d'Ivalis** — un écran noir au logo centré, cinq secondes en
fondu, entre le clic d'accueil et l'écran de sélection du joueur — est le seul
moment du lancement où personne n'attend rien. Les images y sont tirées, et la
table des effets y trouve sa seconde chance si son premier tirage a échoué.

Le bestiaire, lui, **n'est pas** préchargé : sa lecture amorce les gabarits
manquants, donc elle écrit. Trois postes qui démarrent ensemble déclencheraient
trois salves d'écritures à chaque lancement, pour un besoin qui ne se présente
qu'au combat.

Enfin, trois jalons chronométrés s'affichent dans la console — mot de passe
vérifié, table de jeu dessinée, premières fiches reçues. Si la minute revient,
ils disent où elle passe sans qu'on ait à brancher l'iPad sur un ordinateur.

```sh
node ecran_chargement.mjs   # le transport, le sceau, le préchargement, la playlist
```

## L'outil de réglage a fait son travail, et il est parti

La boîte de réglage du bloc du héros (`reglages_hud.js`) est supprimée : ses
flèches, sa poignée, sa mémoire en `localStorage`, son bouton « Figer » et son
extracteur de code. Les nombres qu'elle a servi à trouver sont arrêtés.

Ce qui reste vit dans `hud_disposition.js` — 383 lignes au lieu de 739 — et n'a
rien de provisoire : **la mise à l'échelle**. Le bandeau du bouton de fin de
tour ne fait pas la même largeur partout (`style.css` le passe de 450 à 380 px
sur tablette), et toutes les mesures du bloc sont des pixels. Sans ces trois
fonctions, le bloc serait juste sur un écran et faux sur tous les autres.

## Marcher en deux fois ne coûte pas moins cher que d'une traite

Signalé en partie : « quand je me déplace et que ensuite je refais un
déplacement, il ne prend pas en compte le déplacement déjà effectué pour le
calcul du coût suivant ».

Le barème monte avec la distance — 2 ⚡ pour les trois premières cases, 4
jusqu'à la sixième, 6 ensuite — et c'est ce qui rend une longue course
épuisante. Mais un personnage peut repartir tant qu'il n'a pas lancé sa carte,
et le compteur repartait de zéro à chaque reprise : six cases en deux fois
revenaient à 12 ⚡ au lieu de 18. Il suffisait de valider trois fois pour
marcher au tarif du débutant toute la partie.

**Le compteur avait existé.** Il a disparu avec l'ancien moteur de déplacement,
lors de la grande suppression : il vivait dans la branche morte. Plus rien
n'écrivait ni `pasParcourus` ni sa copie locale, les deux valaient donc zéro
pour toujours. Le banc, lui, restait vert — il posait ce compteur **à la main**
pour mesurer le barème, et ne vérifiait nulle part que la production le posait
encore. C'est la leçon la plus coûteuse de ce commit : un banc qui simule
l'étape qu'il devrait surveiller ne surveille rien.

Le compteur vit maintenant **en tête de la file du cerveau**, comme avant, mais
du bon côté de la frontière :

- il est **tenu par l'étape**, pas par le cerveau — le poste qui écrit et celui
  qui rejoue le journal arrivent au même nombre, avec la même fonction
  (`compterPasMarche`, écrite une fois et appelée des deux côtés) ;
- il **meurt avec le tour** : l'entrée de file disparaît, donc il n'y a aucune
  remise à zéro à écrire, donc aucune à oublier ;
- une **poussée, une traction, un bond** ne le font pas avancer (on a été
  déplacé, on n'a pas marché), ni la **fuite d'une Peur** (elle déplace la
  cible, qui n'est pas en tête de file) ;
- il **redescend par le pont** jusqu'à l'écran, pour que le prix annoncé soit
  celui qui sera pris.

## Une croix rouge pour sortir du ciblage

« Quand on lance une compétence et que ça se met en mode ciblage, on ne peut
plus faire de déplacement. » C'était vrai : le seul renoncement offert était le
bouton « ANNULER » posé à côté de « RÉSOUDRE », et celui-là n'apparaît qu'une
fois une cible choisie. Tant qu'on n'avait visé personne, il n'y avait aucune
sortie, sauf finir son tour pour de bon.

Une croix rouge apparaît donc sous le pion du **lanceur** dès que le ciblage
s'ouvre : même dessin, même place que celle du déplacement. Les deux ne
s'affichent jamais ensemble — deux croix identiques côte à côte, on ne saurait
plus laquelle appuie sur quoi.

Deux pièges, tous deux tenus par le banc : le pion tout entier est une boîte de
clic qui envoie vers `ajouterCibleCiblage` (sans `stopPropagation`, appuyer sur
la croix se viserait soi-même), et `VTT_CIBLAGE_CLICK` court en phase de
**capture**, avant tout le monde, en arrêtant net tout clic tombé dans le
plateau — la croix y est, il lui faut donc une exception nommée.

## On tire sur la lanière, et le volet descend

Le volet des compétences remontait ENTIÈREMENT hors champ : rien ne disait plus
qu'il existait, et le seul moyen de le rappeler était le petit bouton rond du
bandeau. La pointe de la lanière de cuir pend maintenant en haut de l'écran, et
c'est elle qu'on attrape — le geste que l'objet appelle. Les deux coexistent :
l'un se trouve du regard, l'autre se connaît.

**Combien remonter ne peut pas s'écrire en dur.** La lanière n'a qu'une largeur
écrite ; sa hauteur suit ses proportions, et un chiffre serait faux le jour où
l'image change. Elle est donc mesurée à l'écran, et le décalage posé en variable
CSS — parce que c'est une *animation* qui s'en sert, avec ses rebonds, et qu'une
animation ne se calcule pas en JavaScript sans perdre justement ces rebonds. Le
`-115%` d'origine reste écrit derrière comme secours : un moteur qui ne saurait
pas lire une variable dans une image-clé retrouve l'ancien repli complet, pas un
volet coincé à mi-hauteur.

Et la lanière ne prend les clics que **repliée** : déployée, elle passe au-dessus
de la première bannière et lui volerait son clic.

## Le bandeau rouge ne sort qu'en mode développeur

Le rapporteur d'erreurs existe parce que le jeu se joue sur iPad, où il n'y a
aucune console : une erreur au chargement d'un module y est invisible. Mais à
une table de jeu, un bandeau rouge en travers de l'écran, c'est le jeu qui a
l'air cassé — et la plupart de ce qu'il rapporte est sans conséquence pour la
partie en cours.

**Il écoute toujours**, en revanche, et c'est tout le sujet : les pannes qu'on
cherche arrivent au chargement, bien avant qu'on pense à cocher quoi que ce
soit. Un rapporteur qui ne commencerait à écouter qu'une fois coché ne servirait
à rien. Les erreurs sont donc gardées de côté, et cocher le mode développeur les
fait apparaître d'un coup, celles d'avant comprises.

```sh
node bandeau_erreurs.mjs    # il se tait, il retient, et il déverse quand on coche
```

## Un seul état qui ronge par technique de créature

Brûlé, Glacé, Électrifié, Empoisonnement : ce sont quatre façons de dire la même
chose — un effet qui s'installe sur la cible et la grignote tour après tour. Les
empiler ne rend pas la technique plus dangereuse, seulement plus confuse, et
dépense tout le budget de la carte à dire quatre fois la même phrase.

La règle existait déjà pour les trois premiers ; **l'empoisonnement y manquait**,
et se retrouvait donc en plus de n'importe lequel des autres. Mesuré sur 5520
cartes réelles : **325 cartes, soit 5,89 %**, cumulaient deux de ces états —
« Attaque Magique×13 + Zone×6 + Persistance terrain + Électrifié×2 +
Empoisonnement×2 ». Elles ont disparu.

La règle porte maintenant sur tous les rôles, pas seulement sur les
modificateurs : la question « en ai-je déjà un ? » ne dépend pas de la place que
l'effet occupe sur la carte.

## Le ménage des images abandonnées

Chaque objet du jeu est dessiné, et chaque dessin est hébergé sur Cloudinary.
Un objet lâché, écrasé par un meilleur, ou qu'aucun héros n'a voulu au partage,
s'en va de la base — mais son image y restait pour toujours. Même chose pour
l'avatar habillé, redessiné à **chaque** changement d'armure. Et un personnage
effacé n'emportait que son portrait et son pion : son avatar habillé et les
dessins des trois objets qu'il portait restaient derrière lui.

Cinq fuites, une seule porte de sortie : `oublierImages`.

**On ne supprime jamais une image encore utilisée**, et c'est toute la
difficulté. Une URL peut être portée par plus d'un endroit à la fois : une arme
à deux mains occupe les DEUX mains avec le même dessin, un objet du butin est à
la fois dans le lot d'un héros et à l'écran, un objet resté en réserve attend la
rencontre suivante. Effacer l'un, c'est laisser un carré vide ailleurs — un
défaut visible, là où une image orpheline ne se voit pas. En cas de doute, on
garde : le ménage manqué se rattrape, pas l'image effacée.

Deux pièges que le banc a fait remonter, et qu'aucune relecture n'aurait vus :

- **Le garde-fou se retournait contre la suppression d'un personnage.** Au
  moment du ménage, le héros est encore dans la liste en mémoire — elle n'est
  nettoyée qu'à l'étape suivante — et ses propres images se protégeaient donc
  elles-mêmes. D'où `saufPersonnage`.
- **La lecture de l'identifiant Cloudinary était fausse depuis toujours.** Elle
  ne reconnaissait une transformation qu'à sa VIRGULE : `q_auto,f_auto` était
  bien écarté, mais `q_auto` seul se retrouvait dans le chemin, et l'identifiant
  devenait « q_auto/mon_image ». La suppression ne trouvait alors rien à
  effacer, en silence. Ça ne s'était jamais vu parce que le jeu écrit toujours
  ses URL avec les deux transformations à la fois — le ménage, lui, compare des
  URL venues d'un peu partout. Corrigée en ne retirant que les segments de
  TÊTE : une URL Cloudinary s'écrit `/upload/<transformations>/<version>/<id>`,
  et les transformations ne viennent jamais après. Un filtre appliqué à tous les
  segments mangeait `avatar_habille.png`, qui a exactement la forme d'une
  transformation.

```sh
node menage_images.mjs      # les cinq chemins qui abandonnent une image
node suppression_perso.mjs  # effacer un héros emporte TOUTES ses images
```

## Les créatures bondissent-elles comme les héros ?

Question de Nico : « les ennemis, quand ils se déplacent, ont-ils aussi
l'animation de saut comme les joueurs ? »

**Oui — mesuré, pas déduit, et rien n'a eu besoin d'être ajouté.** Les deux
passent par la même `jouerAnimationPas`, qui grossit l'image du pion de 12 % à
chaque case. Profil relevé dans le navigateur, image par image :

```
héros    : 1.00 1.04 1.07 1.09 1.11 1.12 1.12 1.12 1.12 1.10 1.06 1.03 1.01 1.00
créature : 1.02 1.06 1.09 1.11 1.12 1.12 1.12 1.12 1.12 1.08 1.05 1.02 1.01 1.00
```

**Mais la question méritait un banc**, parce que la réponse ne se lisait pas
dans le code : l'animation agit sur `.token-img-main`, et les pions de créature
sont construits par une AUTRE branche d'`appliquerTokensVTT` que ceux des
joueurs — celle qui pose l'image commune des ennemis à la place du portrait.
Une branche qui aurait oublié cette classe, ou l'aurait nommée autrement, et la
créature glisserait sans bondir pendant que les héros sautillent. Aucun test de
logique ne l'aurait vu.

```sh
node saut_deplacement.mjs   # le héros bondit, la créature bondit autant
```

Le banc construit de VRAIS pions avec le VRAI code, lance un pas sur chacun, et
lit l'échelle CALCULÉE par le navigateur pendant l'animation — pas le style
écrit, qui dirait « scale(1.12) » même si rien ne bougeait à l'écran.

⚠️ Un piège rencontré en l'écrivant, noté ici parce qu'il se reproduira : un
pion tire son image de **son entrée dans `TOKENS_VTT_DATA`** (`data.url`), pas
de la fiche du personnage. Sans elle, l'image part sur `src="undefined"`, son
`onerror` la passe en `display:none` — et une image cachée n'a pas d'échelle
calculée. Le banc a d'abord annoncé que le héros ne bondissait pas : il ne
bondissait pas parce qu'il n'était pas là.

Le reste de la chaîne est tenu ailleurs : `cerveau_combat.mjs` vérifie qu'un
tour de créature émet bien une étape « pas » par case, et `pont_combat.mjs`
qu'une étape « pas » appelle l'animation quel que soit le pion.

## Une seule ligne pour la portée, et l'arme ne prête rien aux mains nues

**Deux nombres pour une seule chose.** La carte affichait la portée à deux
endroits : sa ligne « Distance », gravée par la Forge le jour de sa création, et
une ligne bleue ajoutée au-dessus — « ◆ Portée : 4 cases » — qui annonçait la
portée vraie, arme comprise. Le joueur choisissait laquelle croire.

Il n'y en a plus qu'une. La ligne existante est **réécrite** avec la portée
réelle, en gardant sa formulation mot pour mot (seul le nombre change) et en
disant ce que l'arme y ajoute. Et quand la carte n'a pas de ligne de Distance
alors qu'elle porte loin — c'est l'arme qui le fait — la ligne est **ajoutée**,
par la même fabrique de ligne que les vraies : même puce, mêmes couleurs, même
taille, et la formulation prise dans la base plutôt qu'écrite en dur.

La règle vit dans `moteur_effets.js` (`distanceAAfficher`, `texteDistanceReelle`,
`gabaritTexteDistance`) et sert aux **deux** lecteurs : la carte en grand et
l'encart de tour. Deux écrans à un mètre l'un de l'autre qui annoncent deux
portées différentes, c'est pire que pas de portée du tout.

**L'arme ne prête RIEN aux techniques « Sans arme / Arme rp ».** Une technique de
cette catégorie se joue à mains nues ou à la dague de ceinture, quelle que soit
l'arme équipée — c'est tout son intérêt, et c'est pour ça qu'elle reste jouable
quand les autres sont bloquées. Elle héritait pourtant de tout : le +1 de portée
de l'arc (elle devenait un tir, et encaissait au passage le malus de tir à bout
portant — un coup de coude qui porte à deux cases et perd trente pour cent au
contact), les dégâts plats de l'épée, et jusqu'à l'état que le gourdin inflige
en frappant.

La règle vit dans `objets.js`, qui est le seul module à savoir ce qu'est une
**arme tenue en main** — par opposition à une bague, un bouclier ou une armure :

- `objetsPourLaCarte(perso, armeDeLaCarte)` — les objets dont la carte profite ;
- `bonusEquipPourCarte(perso, cle, armeDeLaCarte)` — le total de `bonusEquip`,
  amputé de ce que les armes en main apportent quand la carte ne s'en sert pas.
  On **soustrait** plutôt que de recalculer : `bonusEquip` additionne aussi les
  bonus portés par les états (élan d'initiative, bénédictions), et ceux-là ne
  doivent jamais être perdus en chemin ;
- `etatsEquipementPourCarte(perso, armeDeLaCarte)` — l'étourdissement du
  gourdin, mais seulement pour qui s'en sert.

Ce qui reste, donc : l'armure, le bouclier, **les bagues** et les états du
personnage. Une bague n'est pas l'arme dont on ne se sert pas.

⚠️ La catégorie d'arme doit **voyager avec l'état de ciblage**
(`ETAT_CIBLAGE.armeDeLaCarte`) : au moment de la résolution, il n'y a plus de
`dataCarte` sous la main, et c'est pourtant là que l'équipement enrichit la
carte. C'est exactement le même piège que le coût en énergie, une section plus
bas.

```sh
node cout_et_tir.mjs        # une seule ligne de portée, et le coup de coude reste au contact
```

Le banc joue trois cartes sur un héros qui porte **de vrais objets** — un arc
(+1 portée, +3 dégâts, étourdissement) et une bague (+2 dégâts) — et non un
`bonusEquip` bouchonné : la règle ne se vérifie qu'avec des objets qu'on peut
tenir. Une carte au contact (qui gagne sa ligne de portée), une à distance (dont
la ligne passe de 3 à 4 hexagones), et une « Sans arme / Arme rp » qui n'en
gagne aucune, reste à une case, prend 10 + 2 de dégâts au lieu de 10 + 3 + 2, et
n'étourdit personne. La chaîne entière est jouée jusqu'à ce que le cerveau
reçoit, parce que c'est le seul chiffre qui compte vraiment.

Il compare aussi la ligne de portée ajoutée à une vraie ligne d'effet **sur le
rendu** — couleur, taille, graisse — parce que « le même format » ne se vérifie
pas en relisant deux feuilles de style.

## Le mot de passe d'une partie était relu sur le réseau

« Des fois, sur iPad uniquement, j'ai un temps de chargement très long quand je
fais charger une partie et qu'il vérifie le mot de passe. »

Vérifier un mot de passe, c'est comparer deux chaînes. Mais la fonction allait
d'abord **redemander à Firestore le document de la partie** — alors que ce
document était déjà là : `ecouterPartiesEnCours` écoute la collection depuis
l'ouverture de la page, bien avant que le joueur tape quoi que ce soit, et
chaque document livré par cette écoute porte TOUS ses champs, mot de passe
compris. On n'en gardait que le nom et l'identifiant, et on jetait le reste pour
aller le rechercher au moment précis où quelqu'un attend.

Et un `getDoc` sur un document déjà connu n'est pas gratuit : il part quand même
au serveur — il ne se rabat sur le cache local que hors ligne. Sur une connexion
qui se dégrade, il attend. C'est là que passait le temps.

Le mot de passe est donc retenu au passage, dans une table qui ne vit qu'en
mémoire et qui n'est pas posée sur `window`. L'écoute étant permanente, un mot
de passe changé depuis un autre poste arrive de lui-même. Le `getDoc` reste en
filet pour le cas où l'écoute n'a rien livré (première ouverture, réseau coupé
au démarrage) — mais avec une limite de patience : au-delà de huit secondes, on
rend la main au joueur en lui disant que la base ne répond pas, au lieu de le
laisser devant « Vérification... ». Et surtout pas « mot de passe incorrect »,
qui serait un mensonge coûteux.

```sh
node mot_de_passe_partie.mjs   # vérifié en mémoire, et jamais figé
```

Le banc sert la vraie page devant un Firestore de papier dont le `getDoc` est
**compté et lent à dessein** (une seconde et demie) : si quelqu'un remet un
aller-retour réseau sur ce chemin, l'écran met une seconde et demie à s'ouvrir
au lieu de quarante millisecondes, et le contrôle tombe. Mesuré avant/après sur
le même banc : **1523 ms → 39 ms**.

## La mise à jour qui n'oblige plus à réinstaller l'application

Sur l'iPad, chaque livraison demandait à Nico de supprimer l'icône de l'écran
d'accueil et de réinstaller le jeu — puis de retaper ses cinq clés d'API, que la
désinstallation emportait avec le stockage du site.

**La cause tient en une phrase :** tous les fichiers du jeu portent un `?v=N`
qu'on monte à chaque livraison, et se rafraîchissent donc tout seuls — tous sauf
`index.html`, qui n'a pas de `?v=` parce qu'il EST l'adresse. Tant que
l'appareil sert son ancienne copie de `index.html`, il lit les anciens numéros
et charge l'ancien jeu en entier. Une webapp d'écran d'accueil a en plus son
propre cache, séparé de Safari, que relancer par l'icône ne bouscule pas. Et le
jeu est servi par GitHub Pages, qui ne laisse pas régler les en-têtes de cache :
le remède ne pouvait être que dans le code.

`mise_a_jour.js` relit donc, au chargement, un `version.json` d'une ligne qu'on
interdit de mettre en cache (`no-store` **et** un paramètre unique — sur iOS
l'en-tête seul ne suffit pas toujours, une adresse jamais demandée, si). Si le
numéro ne correspond pas à celui de la page en train de tourner, la page est
périmée : elle se recharge sur une adresse que le cache ne connaît pas
(`index.html?maj=98`). L'adresse inconnue force le réseau, la page qui revient
est fraîche, ses `?v=` sont les nouveaux, et tout le jeu suit.

**Le localStorage n'est jamais touché** : les clés d'API, les volumes et le mode
développeur survivent. On ne perdait tout que parce qu'on supprimait l'icône.

Deux précautions qui comptent :

- **jamais de boucle** — si on a déjà rechargé POUR CETTE VERSION-LÀ et qu'on
  lit encore l'ancien numéro, c'est le serveur qui n'a pas suivi : on s'arrête
  et on le dit en console. C'est l'adresse elle-même qui sert de mémoire, rien
  n'est écrit nulle part ;
- **jamais en plein combat** — la vérification n'a lieu qu'au chargement de la
  page. Pas de contrôle en arrière-plan, pas de retour d'application qui
  recharge : une livraison pendant une partie ne coupera jamais un tour.

```sh
node mise_a_jour.mjs        # un rechargement, un seul, et les clés intactes
```

⚠️ **Le numéro vit à DEUX endroits** : `window.VERSION_IVALIS` (trace_combat.js)
et `version.json`. C'est en les comparant que le jeu sait qu'un appareil est
périmé ; les laisser diverger, c'est soit un rechargement qui ne vient jamais,
soit un appareil qui se recharge sans raison à chaque démarrage. Le banc les
compare et refuse le désaccord.

## La lanière pend plus bas, et le voile de la piste s'efface

Deux retouches d'écran, demandées sur l'iPad, mesurées au pixel.

**La pointe de la lanière** ne dépassait que de 26 px : sur une tablette, on ne
distinguait pas qu'il pendait quelque chose en haut de l'écran, et le geste — la
tirer pour ouvrir les compétences — ne venait à personne. Elle en laisse voir 72
(`window.POINTE_LANIERE_VISIBLE`, combat.js), ce qui reste bien moins qu'un quart
de sa longueur : on voit un bout de cuir, pas les bannières.

**Le voile sous la piste d'initiative** était un rectangle noir à 62 %, à coins
arrondis, creusé d'une ombre interne, doublé d'une tache radiale à 92 % de noir.
Sur l'iPad, ça se lisait comme une masse opaque coupée net — et les chiffres le
disaient : 5/255 sur blanc au plus sombre, 40 niveaux de gris entre deux pixels
voisins sous les portraits, **186** sur le côté, c'est-à-dire un bord franc.

Le bandeau est devenu un dégradé radial, comme l'ombre qu'il porte : il s'éteint
complètement avant le bord de sa boîte, dans toutes les directions — d'où une
boîte élargie de 110 px de chaque côté et descendue sous la piste, qui est la
place qu'il lui faut pour s'effacer au lieu de se couper. La tache, elle, est
passée de 92 % à 26 % de noir, et ses rayons sont désormais écrits (`50% 50%`) :
sans eux le dégradé prenait l'étendue par défaut — jusqu'au coin le plus
lointain — et se retrouvait encore à 30 % de noir en atteignant le bas de sa
boîte, ce qui faisait une coupure de 19 niveaux que personne n'avait vue.

Après : 130/255 au plus sombre, 7 niveaux de marche au pire en descendant, 3 sur
le côté, éteint en 43 px.

```sh
node volet_competences.mjs  # la pointe dépasse franchement, et c'est elle qu'on tire
node piste_initiative.mjs   # le voile est léger, diffus, et sans un seul bord
```

Le banc de la piste photographie deux traits d'un pixel — une colonne sous les
portraits, une ligne vers le vide à droite — après avoir effacé tout le reste de
l'écran de combat, et refuse : un voile trop sombre, la moindre marche, un
retour en arrière, ou une épaisseur qui s'étale au-delà de 60 px.

## Le style des paramètres, et le nom de la race

Deux demandes de Nico, deux écrans.

**Le butin rendait des objets photoréalistes** alors qu'un style est réglé une
fois pour toutes dans les paramètres (onglet Cerveau IA, instruction
`INST_76839` — le même texte qui habille les portraits de héros). La source
était pourtant la bonne : le butin lit ce document-là. Le défaut était dans la
FORME du prompt. Le style y était glissé au milieu, juste avant un bloc annoncé
« 🛑 RÈGLE DE COMPOSITION (PRIORITAIRE SUR TOUT LE RESTE) » : le dessinateur
lisait la consigne des paramètres, puis s'entendait dire de passer outre. Et
quand les paramètres étaient vides — document absent, champ effacé, base
illisible — **aucune** directive de style ne partait du tout, ce qu'un modèle
d'image interprète toujours de la même façon : une photo.

Désormais le style OUVRE le prompt, c'est lui qui porte la mention de priorité,
la règle de composition ne prime plus que sur la description de l'objet, et un
réglage vide laisse quand même partir une consigne d'illustration dessinée qui
nomme explicitement ce qui est proscrit (photo, rendu 3D, photoréalisme). La
phrase d'adresse qu'on laisse parfois traîner en tête de la consigne (« Tu fera
ce dessin dans ce style : ») est retirée, comme le fait déjà la carte du monde.

**L'écran de choix de race** annonçait la race en grand titre (« LES HUMAINS »)
et son descriptif, au milieu de l'écran, ne disait pas de qui il parlait. Le
grand titre annonce maintenant l'ÉTAPE (« Choix de Race ») et ne bouge plus ; le
nom de la race est descendu juste au-dessus de son descriptif, dans le même
encart. Au passage, l'encart a cessé d'être centré sur l'ÉCRAN : libre de
grandir dans les deux sens selon la longueur du lore, il passait déjà — avant
même cette retouche — par-dessus le grand titre et par-dessus les deux symboles
de genre (60 px pour les Ophiors, les plus bavards). Il est tenu dans une BANDE
entre les deux, et se centre là-dedans.

```sh
node images_objets.mjs      # le style ouvre le prompt, et ne manque jamais
node ecran_choix_race.mjs   # le titre de l'étape, le nom de la race, et rien qui se chevauche
```

`ecran_choix_race.mjs` mesure les sept races sur les DEUX feuilles de style —
celle du bureau et la branche tactile de l'iPad, qui ne se ressemblent pas — et
vérifie les pixels : le nom au-dessus du descriptif et non en dessous, centré
sur lui, plus gros que le texte qu'il annonce, et zéro chevauchement entre les
onglets, le titre, l'encart et les boutons de genre.

## Fidélité à la Forge

```sh
node cout_reel.mjs          # fatigue, initiative et coût PC recalculés par la Forge
node textes_reels.mjs       # les descriptions, mot pour mot comme la Forge
```

## Puissance des frappes

```sh
node degats_cartes.mjs      # combien de dégâts font vraiment les cartes
node apercu_jeu.mjs         # les 6 cartes de trois créatures, lisibles à l'œil
node calibrage_degats.mjs   # A/B du plafond de puissance sur 40 combats
```

Le curseur est `window.PART_PV_PAR_COUP` en tête de `monstres_competences.js` :
la part des points de vie d'un personnage qu'une seule frappe a le droit
d'emporter, par palier. `calibrage_degats.mjs` le surcharge par la variable
d'environnement `PLAFOND_COUP` (ou `PLAFOND_COUP=OFF` pour revenir au socle à un
seul exemplaire).

## Liaison avec le bestiaire

```sh
node gabarit_relie.mjs      # le générateur suit-il le Fatigue_Max du tableau ?
```

Ce banc modifie la fatigue max d'un gabarit (60, 100, 150, 240) et vérifie que
les six tranches de coût suivent proportionnellement, puis contrôle que sur tout
le bestiaire réel aucune carte ne sort de sa tranche.

## Butin, équipement et tableau des armes

```sh
node butin_loot.mjs         # détection de victoire, fenêtre personnelle, partage, tirage au sort
node clics_butin.mjs        # on clique VRAIMENT dans la fenêtre : croix, prendre, laisser
node choix_emplacement_butin.mjs  # la carac sur l'étiquette, le choix de la main, jamais deux boucliers
node demarrage_reel.mjs     # la VRAIE page se charge-t-elle ? (les 12 modules, le parcours complet)
node objets_tableau.mjs     # le catalogue d'équipement, confronté au tableau de Nico
node equipement_combat.mjs  # ce que les objets font une fois portés, en combat
node apercu_butin.mjs       # onglet Inventaire et fenêtres de butin, capturés à l'écran
```

`butin_loot.mjs` rejoue le vrai code de `loot.js` et de `window.modifierPartie`
(combat.js) à plusieurs postes à la fois, sur un faux Firestore transactionnel
qui fusionne les chemins pointés à profondeur quelconque (`Butin.parPersonnage.
J1.decisions.xxx`) — les autres bancs réseau n'avaient jamais eu besoin d'aller
au-delà d'un seul niveau. Il couvre : la coupe de test (🏆) qui tue les ennemis
sans passer par les renforts, les gardes-fous de `verifierVictoireCombat`, la
création atomique du butin quand plusieurs postes détectent la victoire en même
temps, le choix personnel (prendre/laisser, équipement, décision verrouillée
après validation), l'enchaînement des fenêtres — chaque héros a la SIENNE, et un
joueur qui en mène deux les traite l'un après l'autre avant de rejoindre le
partage —, la construction du pool par le DERNIER héros à valider, le
placement dans le partage commun, et sa résolution (tirage au sort déterministe
via `Math.random` forcé) par le DERNIER joueur à valider — avec vérification
qu'un seul poste effectue réellement l'écriture d'équipement du gagnant.
C'est ce banc qui a détecté un vrai bug avant qu'il n'atteigne le jeu :
`validerButinPool` plantait (`for...of` sur `true`) dès qu'un joueur validait
sans être le dernier, faute de `resultat` explicite dans ce cas.

Il garde aussi la trace du bug du 03/09, remonté par le frère de Nico : la
fenêtre de butin s'ouvrait au simple CHARGEMENT de la partie, vide et sans
aucun bouton — un calque plein écran sans issue. Trois causes se combinaient,
et les trois sont couvertes ici : l'affichage ne dépendait que de
`Butin.ouvert` en base, sans vérifier qu'un combat était à l'écran ; aucune
vue n'avait de fermeture (seule la dernière avait son bouton) ; et surtout un
butin resté ouvert bloquait DÉFINITIVEMENT tous les butins suivants, puisque
`demarrerButin` refusait de tirer tant que le drapeau était levé. Le banc
vérifie donc que la fenêtre se tait hors combat, que la croix ne ferme que
chez celui qui clique (une croix de travers ne doit priver personne de son
loot) sans empêcher l'étape suivante de s'afficher, et qu'un butin périmé —
autre rencontre, déjà résolu, ou simplement vieux d'une minute — se laisse
remplacer, tout en résistant à la double détection de la même victoire.

Le même bug avait une seconde moitié, découverte deux jours après : les boutons
PION et RENCONTRE du menu de combat « ne faisaient plus rien ». Le calque du
butin est à `z-index: 20000` — au-dessus du bandeau des points d'apparition
(10020) et de la fenêtre de rencontre (5000). Un butin resté ouvert les
recouvrait donc tous les deux ET avalait les clics sur le plateau : impossible
de poser un repère, donc `pointApparition()` renvoyait `null`, et les deux
boutons qui en dépendent échouaient en silence. La règle est maintenant
explicite et vérifiée ici : **un combat en cours passe toujours avant un
butin**. Dès qu'un ennemi est debout, la fenêtre s'efface d'elle-même (sans
rien perdre : le butin reste en base et revient une fois ce combat gagné). Les
illusions ne comptent pas comme ennemis, et c'est la MÊME fonction
(`ennemisEncoreDebout`) qui sert à l'affichage et à la détection de victoire,
pour que les deux ne puissent pas diverger.

Et une troisième couche, la plus grave, découverte quand Nico a rapporté que
« le mode combat est complètement bugué » après une réinitialisation :
`afficherFenetreButin` tourne au TOUT DÉBUT du traitement de chaque
notification de partie, et **150 lignes de combat la suivent** — points
d'apparition, tour de l'IA, changement de tour, bulles, animations. Une seule
exception dans l'affichage du butin les emportait toutes, à chaque
notification. Or plusieurs `getElementById` y étaient utilisés sans garde, et
`index.html` est le seul fichier sans `?v=` : une page servie depuis le cache
du navigateur suffisait à faire manquer un élément. Trois verrous désormais :
plus aucun accès DOM sans garde dans loot.js, un `try/catch` autour de l'appel
dans app.js (le butin est la dernière chose dont la panne doit coûter la
partie), et l'écouteur Échap sous garde — il s'exécute au chargement du module,
donc une exception y aurait empêché loot.js entier de se charger.

`clics_butin.mjs` est le seul banc qui CLIQUE pour de vrai : il monte le vrai
balisage et le vrai style dans un navigateur, et se sert de `elementFromPoint`
pour vérifier que chaque bouton est bien ce qui se trouve sous le doigt — c'est
ainsi qu'on attrape un calque qui avale les clics, symptôme impossible à voir
en appelant les fonctions à la main. Il joue la séquence complète (laisser,
prendre, confirmer, équiper, refermer), vérifie que le menu de combat
redevient cliquable une fois la fenêtre fermée, et surtout qu'un DOM incomplet
ne fait plus tomber le reste du combat.

`choix_emplacement_butin.mjs` clique lui aussi pour de vrai, sur trois demandes
de Nico. **L'étiquette d'un objet dit sa carac** : juste après le type, en petit
et en marron, la caractéristique qui modifie l'objet (« Commun · Arme légère
(corps à corps) Dextérité »). Une seule fonction la fabrique,
`etiquetteObjetHTML` (objets.js), pour la fiche du héros comme pour les trois
vues du butin et la fenêtre de comparaison ; le banc la lit sur les 23 modèles
du catalogue, puis mesure le vrai rendu — couleur marron et non celle de la
rareté, taille plus petite que l'étiquette, pas de majuscules — et vérifie que
la fiche (app.js) la pose en HTML : en `innerText`, on lisait la balise à
l'écran. **Se placer, c'est choisir sa main** : au partage commun, « Se placer »
sur un objet qui peut aller dans l'une ou l'autre main ouvre la fenêtre de
comparaison du butin personnel, titrée « Dans quelle main, si tu le
remportes ? », avec ce que chaque main remplacerait. Rien n'est équipé avant le
tirage : la main voyage avec la candidature (`pool[i].mains`), s'affiche sur la
carte (« Pliors (main gauche) »), s'efface avec « Se retirer », et c'est là que
l'objet atterrit une fois gagné — la fiche ne reçoit que l'objet, sans les
candidats ni le gagnant qui s'y glissaient jusqu'ici. Une armure, une arme à
deux mains n'ont qu'une place : pas de question. Au butin personnel (les deux
objets du début), « Prendre » posait déjà la question ; le banc le vérifie d'un
vrai clic. **Jamais deux boucliers** : un bouclier ne peut aller que dans une
main dont la voisine n'en tient pas déjà un — un second bouclier ne peut que
remplacer le premier (`mainsPossibles`, loot.js). La règle tient à toutes les
portes : la fenêtre ne propose que cette main et dit pourquoi, le partage la
retient d'office, l'équipement automatique (une vieille candidature sans main)
ne prend plus « la main libre d'abord », et `equiperObjet` lui-même redresse
une main interdite. Le banc vérifie aussi ce que la règle ne doit PAS gêner :
un bouclier à côté d'une arme, après une arme à deux mains, une arme à côté
d'un bouclier. Chaque correctif a été retiré à tour de rôle : chaque fois, au
moins un contrôle tombe.

`demarrage_reel.mjs` répond à la question que AUCUN autre banc ne posait : est-ce
que le jeu **démarre** ? Tous les autres découpent une fonction et la font
tourner à part ; celui-ci sert la vraie `index.html` en HTTP (les modules ES
refusent `file://`), remplace les deux modules Firebase du CDN par des
doublures, et laisse **tout le reste se charger pour de vrai**. Il vérifie
qu'une fonction représentative de chacun des huit modules existe — car il
suffit qu'UN module lève à son chargement pour que toutes ses fonctions
disparaissent d'un coup, sans le moindre message : des boutons sans rapport
cessent alors de répondre, et le jeu paraît « complètement cassé ». Il rejoue
ensuite le parcours exact de Nico : butin oublié en base, réinitialisation,
pose des deux repères, déploiement, ouverture de la fenêtre de difficulté (en
vérifiant qu'elle est bien cliquable, donc que rien ne la recouvre), puis les
boutons PION et RENCONTRE.

⚠️ **L'ordre des routes Playwright compte** : c'est la DERNIÈRE posée qui
gagne. Le filtre général (`'**'`) doit donc venir AVANT les doublures Firebase,
sans quoi il les coupe et plus rien ne se charge — le banc accuse alors le jeu
d'une panne qui vient de lui-même.

Enfin, `index.html` porte un **rapporteur d'erreurs à l'écran**, en clair et
hors module, avant le premier `<script type="module">`. Le jeu se joue sur
iPad, où il n'existe aucune console : une erreur y était totalement muette. Le
bandeau rouge nomme désormais l'erreur, son fichier et sa ligne — et un module
qui ne se charge pas est nommé explicitement. Une capture d'écran suffit à
rapporter la panne.

`objets_tableau.mjs` relit les deux classeurs de Nico (figés dans
`tableau_objets.json`, extraits des `.xlsx` d'origine) et confronte le catalogue
d'`objets.js` à leur contenu : les 23 lignes dans le même ordre, le type et la
caractéristique de chacune, puis **les chiffres de chaque cellule de palier, un
par un** (92 cellules), le nombre d'effets de rareté et leur réservoir, le
doublement des épiques, les trois colonnes d'effets, les prérequis, et enfin les
chances de rareté — vérifiées à la fois sur la table et sur 20 000 tirages
réels. C'est le garde-fou contre la faute de frappe : une arme épique plus
faible qu'une très rare ne se voit pas en jouant, elle se voit ici.

`equipement_combat.mjs` regarde ce que les objets FONT une fois portés, sur le
vrai code du moteur : bonus qui remontent dans les stats, arme à deux mains qui
ne compte qu'une fois malgré ses deux emplacements, techniques interdites par
l'arme en main (et le sort qui exige une main libre, qu'une bague ne ferme pas),
dégâts plats greffés sur la carte, états de l'arme injectés dans les altérations
(sans doublon quand la carte les inflige déjà), jets de percée d'armure tirés
une seule fois pour tous les postes, prérequis en caractéristique, provocation
qui aveugle une créature, et états temporaires (élan, bénédictions) qui
empruntent les mêmes canaux de stats que l'équipement.

Il sépare aussi soigneusement **portée** et **allonge**, qui se ressemblent mais
ne font pas la même chose. Une arme qui TIRE (fronde, arc) rend l'attaque à
distance même sur une technique sans portée — c'est un désavantage autant qu'un
atout, puisqu'un tir au contact perd 30% de ses dégâts — et sa portée s'ajoute à
celle que le joueur a posée sur la carte. L'allonge, elle, ne transforme rien :
l'attaque reste au contact, elle atteint simplement une case de plus. Le banc
mesure les deux, malus de tir à bout portant compris.

`portee_zone.mjs` traque un désaccord entre la Forge et le moteur. Dans la
Forge, une carte gagne sa portée de DEUX façons : l'effet **Distance** posé
comme action à part entière, ou la même Distance greffée en modificateur sur
une attaque. `competences.js` reconnaît les deux (`actionHasDistance`) et
affiche fièrement « portée 3 » sur la carte ; le moteur, lui, ne lisait que le
modificateur. Une carte de soin de zone dont la distance était posée comme
action partait donc en combat avec une portée de 1 — et une zone à portée 1 se
pose sur le lanceur, ce qui donne exactement le symptôme observé : « il ne prend
pas en compte la distance mise sur la capacité ».

Le banc injecte le vrai `moteur_effets.js` et fait tourner le vrai extracteur
(`demarrerCiblage(idCarte, { extraire: true })`) sur cinq formes de carte : la
distance en modificateur (ce qui marchait déjà), la distance en action séparée
(ce qui était ignoré), une zone sans aucune distance (elle doit rester collée au
lanceur), deux sources de distance sur la même action (la plus longue gagne, on
ne les additionne pas), et une carte sans zone (que la correction ne doit pas
toucher).

`manche_suivante.mjs` fait tourner le VRAI `regime_cerveau.js`, couche fenêtre
comprise (`window.regimeSuivreLaPartie`), sur un Firestore en mémoire, et joue
**deux manches d'affilée**. C'est le chaînon qui manquait, et il a coûté une
soirée de test : en fin de manche, le cerveau vide sa file et repasse sa phase à
« Preparation » — mais le DOCUMENT DE LA PARTIE, lui, restait en « Resolution »
avec la file de la manche écoulée. Or c'est lui que la préparation lit. Plus
personne ne pouvait choisir de carte, et le passage Preparation → Resolution — le
seul qui ouvre une manche — ne pouvait plus jamais se produire : le combat jouait
sa première manche, puis répétait « la file est vide » toutes les cinq secondes.

Ouvrir une manche appartient aux joueurs et se passe encore dans l'ancien monde ;
c'est un choix, pas un oubli. Mais quelqu'un doit LEUR RENDRE LA MAIN, et ce ne
peut être que le cerveau : lui seul sait que la manche est finie. Le banc vérifie
qu'il l'écrit, qu'il ne l'écrit qu'une fois, que la préparation garde ensuite la
parole sur la file (la projection ne doit pas reposer sa file vide par-dessus les
cartes que les joueurs viennent de choisir), que la manche 2 s'ouvre toute seule,
et que l'énergie remonte au passage — la régénération de fin de manche, que
l'ancien monde faisait dans `finDeTourCombat`, un chemin que le nouveau régime ne
traverse plus.

Le chapitre « UN TOUR QUI NE FRAPPE RIEN COMPTE QUAND MÊME » de
`cerveau_combat.mjs` couvre deux trous trouvés en vrai combat, tous les deux dans
la même couture : ce qui se passe quand un tour se termine SANS attaque.

Le **repos long** n'existait nulle part dans le cerveau. Un joueur qui
choisissait de souffler envoyait une fin de tour toute nue : son tour se fermait
en une étape et il ne récupérait pas un point d'énergie. Le calcul vivait dans
l'ancien `finDeTourCombat`, un chemin que le nouveau régime ne traverse plus.
Trois manches plus tard, plus personne n'a de quoi lancer quoi que ce soit et le
combat s'éteint tout seul.

Une **carte sans cible** ne coûtait rien. Un lanceur paralysé, une Illusion
seule, un Bond seul : ces cartes sortent par `validerCarteCombat`, qui déduisait
l'énergie EN LOCAL (mémoire *et* base) puis envoyait une fin de tour nue. Le
cerveau fermait donc le tour sans savoir qu'une carte avait été jouée, son état
gardait l'énergie intacte, et la projection suivante effaçait la déduction
locale. La carte ne coûtait rien et ne faisait rien — une étape, et le tour est
fini. C'est précisément ce que la trace montrait : `pas 3 publié PERSO_250418`,
une seule étape.

Le chapitre 14 de `drapeau_regime.mjs`, « PLUS UNE SEULE PANNE MUETTE », interdit
les silences qui ont coûté trois soirées d'essai. Le pire était sous
`catch (e) {}` dans la projection : `actualiserEtatCarteCombat` est ce qui fait
apparaître le bouton « Appliquer », le SEUL chemin par lequel un joueur lance sa
carte pendant son tour. Un plantage là-dedans laissait le joueur cliquer dans le
vide, sans un mot dans la trace. Les autres silences fermés : un refus qui ne
disait pas ce qu'il refusait (« c'est au tour de X », sans dire si le joueur
avait tenté sa carte, un déplacement ou une fin de tour), un pas publié qui ne
disait pas que le tour s'était fermé sans qu'aucune carte ne parte, et quatre
sorties muettes dans le choix d'une carte.

S'y ajoute une ligne de diagnostic qui tranche la question au lieu de la poser :
quand c'est au tour d'un de MES héros, le régime regarde si le bouton
« Appliquer » est réellement dans la page et le dit — `🎯 à moi de jouer` ou
`🧊 à moi de jouer mais RIEN À CLIQUER`, avec la raison (carte absente, bouton
absent, fenêtre sombre encore levée).

### Le cerveau peut mourir, et la table doit pouvoir reprendre

Un seul navigateur écrit le combat. S'il ferme son onglet, part en veille ou perd
le réseau, la table entière s'arrête — et jusqu'ici rien ne le disait, ni ne
permettait d'en sortir. C'était le dernier endroit où une soirée pouvait mourir
sans un mot.

**Le piège était de regarder l'heure.** Le battement de cœur est écrit par
l'horloge du poste qui tient le cerveau, et relu par celle d'un AUTRE appareil :
deux montres décalées de trente secondes, et un cerveau en pleine forme paraît
mort. Personne ne règle sa tablette à la seconde près. On ne regarde donc pas
l'heure du battement, **on regarde s'il CHANGE** — le décompte se fait alors
entièrement sur sa propre montre, et aucune comparaison entre appareils n'a plus
lieu (`suivreBattement` / `cerveauSilencieux`, purs et benchés sous horloge
délirante).

**La reprise est volontaire** : une bannière, un bouton, jamais une élection
automatique — un wifi qui hoquette ne doit pas faire changer de cerveau en plein
tour. Mais **la prise est atomique**, par la même mécanique que l'ouverture d'un
combat : une transaction sur le document d'état lui-même. Trois postes peuvent
cliquer à la même seconde, Firestore n'en laisse passer qu'un ; il n'y a ni
élection, ni négociation, ni verrou à côté.

⚠️ Le guet a besoin de **son propre minuteur**. Quand le cerveau meurt, plus rien
ne bouge : ni l'état, ni le journal, ni le document de la partie. Il n'arrive
donc aucune notification pour réveiller quoi que ce soit — c'est le silence
lui-même qu'il faut mesurer.

Le chapitre 15 de `regime_cerveau.mjs` tue le cerveau pour de bon, fait vieillir
les montres des deux autres, les fait cliquer à la même seconde, vérifie qu'un
seul prend — **et que le combat repart sous la nouvelle main**. Il vérifie aussi
qu'on ne vole jamais la main d'un cerveau vivant : c'est ce banc qui a attrapé ce
trou, la garde manquait.

### Les tics de fin de manche

Ils vivaient tous dans l'ancien `finDeTourCombat`, un chemin que le nouveau
régime ne traverse plus : un empoisonnement ne mordait jamais, une immobilisation
ne coûtait rien, un étalement ne portait jamais son second coup. Ils sont
maintenant dans le cerveau, avec la règle du jeu mot pour mot — l'immobilisation
puise 20 d'énergie à chaque manche où elle dure, le poison prend 15 d'énergie et
8% des points de vie maximum **une seule fois** (`tickFait` voyage avec l'état),
l'étalement porte son reste sur le bouclier en priorité. **L'ordre compte**, et
c'est celui de l'ancien monde : régénération, puis les tics, puis le
vieillissement. Chaque étape porte le RÉSULTAT, comme toutes les autres.

### Une esquive a deux moitiés

Le mot qui monte (« Esquivé 💨 » ou « Paré 🛡️ ») **et le pion qui se dérobe**, un
pas en arrière puis retour. Le pont ne transmettait que la première : à l'écran,
une créature qui esquivait ne bougeait pas d'un pixel, et on croyait qu'il ne
s'était rien passé. Le recul a besoin de la case de l'ATTAQUANT pour savoir de
quel côté se dérober — elle se lit dans l'état d'AVANT le coup, celui que le
spectateur donne exprès au pont. Au passage, le noyau dit enfin LAQUELLE des deux
défenses a sauvé la mise, sans tirer un dé de plus : « Paré » quand c'est la
parade. Chapitre « 1 bis » de `pont_combat.mjs`.

### La zone prend la distance de la CARTE, pas d'une action

Deuxième étage du même désaccord. `afficherApercuCarteHD` détache la zone du
lanceur dès qu'un effet « Distance » apparaît N'IMPORTE OÙ dans la carte — c'est
ce que le joueur voit dessus. L'extraction, elle, ne regardait que l'action qui
DESSINE la zone. Une carte « soin à distance 3 + persistance terrain », où la
distance vit sur l'action de soin et la zone sur l'action de persistance, ne
pouvait donc se poser qu'au corps-à-corps. Chapitre 5 de `portee_zone.mjs`.

### Une demande en vol ferme le tour tout de suite

Entre le moment où le joueur applique sa carte et celui où le cerveau publie le
pas, il s'écoule un aller-retour réseau. Pendant ce temps la file projetée le
montre TOUJOURS en tête : le bouton « Appliquer » restait là, et on pouvait
relancer la même carte. Le cerveau refusait bien la seconde (« c'est au tour de
X »), mais le ciblage était déjà reparti sous les yeux du joueur. Un repère local
— « j'ai demandé pour CE combattant, à CETTE manche » — ferme le bouton dès
l'envoi et tombe dès que la file avance.

### L'ouverture d'une manche n'est pas un tour

La fenêtre sombre s'ouvrait dessus — `fenêtre : null (manche 2), en attente du
OK` — et retenait derrière elle TOUT le rejeu de la manche : les tours se
publiaient, personne ne les voyait, et le combat semblait figé pour la seconde
fois au même endroit. L'entrée qui ouvre une manche installe la nouvelle file et
n'appartient à personne : elle n'a pas d'acteur, donc elle ne se retient jamais.
Chapitre 1 de `spectateur_combat.mjs`.

### Un seul vocabulaire pour les états altérés

Tout le jeu — les fiches, la Forge, le panneau, la piste — dit `duree`. Le noyau
pur disait `tours`, et lisait `alt.tours` sur une altération qui porte `duree` :
**chaque état posé par le cerveau durait donc UN tour au lieu du sien**. Et comme
il ne gardait que le nom, l'icône et la description disparaissaient en chemin :
la piste d'initiative dessinait `<img src="undefined">` sous le portrait du
héros, ce qui donnait un rectangle d'image cassée à l'écran et un
`GET .../undefined 404` en boucle dans la console, plusieurs fois par seconde.

Deux corrections, et une ceinture : le noyau parle le mot du jeu et l'état
emporte de quoi être montré (chapitre 4 de `moteur_pur.mjs`) ; et les trois
endroits qui dessinent une icône passent par `window.imageEtat`, qui ne dessine
rien plutôt qu'une image cassée — un état sans visage existe (l'Étalement en est
un). `piste_initiative.mjs` le vérifie sur le vrai rendu, en relisant les `src`
réellement posés dans la page.

Les états **vieillissent** aussi d'une manche à l'autre : le décompte vivait
dans l'ancien `finDeTourCombat`, un chemin que le nouveau régime ne traverse
plus, si bien qu'un Étourdi posé au premier tour durait tout le combat.
⚠️ Ce qui est porté, c'est le DÉCOMPTE seul. Les tics propres à certains états —
les 20 d'énergie de l'Immobilisation, le second tic de l'Empoisonnement, la
Brûlure — vivent encore dans l'ancien monde et ne sont pas repris.

### Ce que la fenêtre sombre montre, et quand elle se lève

Deux défauts vus à la table, dans la même fenêtre, et les deux tenaient à une
information que le nouveau régime ne transmettait plus.

**« Technique inconnue de ce poste »**, à chaque tour. La fenêtre recevait
l'acteur et le numéro de l'entrée, jamais la carte : elle n'avait aucun moyen de
la nommer. La technique annoncée pour le tour voyage maintenant avec l'entrée de
journal — prise dans la file d'AVANT le pas, celle qui dit ce que ce combattant a
annoncé.

**Un second écran noir par-dessus l'animation.** Après le OK, la fenêtre se
refermait — puis revenait aussitôt, puisque le combattant en tête de file est
encore celui dont le tour s'anime. L'animation se déroulait donc derrière un
voile, sans OK et sans clic possible : on ne voyait rien. L'ancien monde avait
pourtant la réponse — `EVENEMENT_EN_COURS`, que `etatSequenceTour` lit pour lever
la fenêtre pendant la relecture — mais le nouveau régime ne le renseignait plus.
Le spectateur annonce désormais ce qu'il rejoue (`surRejeu`), et la fenêtre se
lève pendant l'animation puis se repose au tour suivant. Le chapitre « 1 ter » de
`manche_suivante.mjs` enregistre ce que la fenêtre lit à chaque appel et vérifie
les deux.

### Le cerveau rend la main sans attendre une notification

Le premier essai du retour à la préparation était branché sur les notifications
du document de la partie. Or, une fois le combat ouvert, **plus rien n'écrit dans
ce document** : le cerveau n'écrit que son propre état. Le retour n'était donc
jamais déclenché, et la manche 2 ne démarrait pas — « la file est vide » toutes
les cinq secondes, indéfiniment. C'est la PUBLICATION du cerveau qui le réveille
maintenant. Le chapitre 2 de `manche_suivante.mjs` ne notifie plus la partie du
tout : c'est précisément ce qu'il vérifie.

### La fenêtre sombre ne doit enfermer personne

Un iPad est resté figé derrière la fenêtre sombre, sur la technique d'un tour
d'une rencontre déjà terminée. Rien ne pouvait plus arriver, taper l'écran ne
faisait rien, et la seule sortie — une croix rouge de débogage — se trouvait en
haut à DROITE du voile, c'est-à-dire exactement sous le bouton du menu (position
fixe en haut à droite, z-index 9000 contre 12 pour le voile), qui la recouvrait
entièrement. Sur l'appareil qui n'a pas de console, c'était un blocage sans
issue. Quatre verrous ont sauté, et chacun a son contrôle :

1. **La disparition de l'état était avalée.** `ecouterCombat` faisait
   `if (data) surEtat(data)` : la nouvelle la plus importante que ce document
   puisse porter — « ce combat n'existe plus », ce qu'écrit la réinitialisation —
   n'arrivait jamais. Le `null` passe maintenant, et le régime éteint l'écran.
2. **Repartir de zéro ne suffisait pas.** L'état et le journal sont deux
   documents : rien ne garantit l'ordre de leur effacement, et le spectateur
   rejouait les entrées de l'ancien combat depuis le début — la fenêtre se
   relevait aussitôt. `spectateur.oublier()` l'éteint franchement : ni entrée, ni
   rejeu, jusqu'au prochain vrai combat. Le chapitre 6 de `manche_suivante.mjs`
   vérifie les deux, ET qu'une rencontre suivante repart bien (ce n'est pas un
   interrupteur définitif).
3. **Un état d'une autre rencontre n'annonce plus de tour.** Même règle qu'à
   l'ouverture du combat : ce qui ne parle pas de CETTE rencontre est inerte.
   Chapitre 13 de `sequence_tour.mjs`.
4. **Taper l'écran lève le voile quand il n'y a rien à ouvrir.** Le spectateur
   rend désormais `false` quand aucun tour n'attendait, et le clic dégage le
   plateau au lieu de ne rien faire.

Et la croix rouge est passée à gauche. `fenetre_tour.mjs` ne vérifie pas des
coordonnées : il demande au navigateur, par `elementFromPoint`, QUI reçoit
vraiment le clic au centre de la croix — la seule question qui compte.

`butin_avance.mjs` couvre la réserve de butin. Tirer les objets ne coûte rien ;
les DESSINER prend une quinzaine de secondes par lot, et ce temps se payait
jusqu'ici en pleine fouille des cadavres, jauge à l'écran. Le tirage part
maintenant dès l'ouverture du combat, en arrière-plan, et à la victoire le butin
est déjà illustré. Un combat perdu ne jette pas son lot : il le garde en
réserve, RANGÉE PAR DIFFICULTÉ (les raretés ne sortent pas de la même ligne du
tableau d'équipement selon la rencontre), pour le prochain combat de cette
difficulté-là.

⚠️ La réserve a son PROPRE document (`Systeme_Parties/{partie}/Combat_Butin/…`),
et c'est la leçon du premier essai. La première version la rangeait dans le
document de la partie : chaque image posée y réécrivait le lot entier, plusieurs
kilo-octets, sur le document le plus disputé du jeu — celui de la file
d'initiative, des verrous et des tours. Résultat en vrai combat :
« failed-precondition », verrou de préparation abandonné, deux minutes perdues
avant le premier tour, et une carte qui refusait de se laisser choisir sur
l'iPad. Le butin est FROID, personne ne l'attend pendant le combat : il vit
maintenant dans son coin. Le chapitre 11 du banc est là pour ça — il compte les
écritures sur le document de la partie et exige **zéro** pendant toute la
préparation, la seule permise étant le butin lui-même, à la victoire.

Le banc surveille aussi ce qui se paie : à trois postes lancés ensemble, un
seul lot est tiré et **un seul appareil commande les images**. Il vérifie aussi
qu'une préparation rejouée trente fois n'écrit plus rien, qu'un héros de plus est
complété à la volée et un héros de moins rend ses objets à la réserve, qu'un
poste sans clés d'API ne revendique pas un dessin qu'il ne peut pas faire, et
qu'une revendication abandonnée en route (onglet fermé) se périme au lieu de
condamner la réserve.

`projectile.mjs` tient les deux bouts d'une chaîne qu'un banc ordinaire couperait
en son milieu. Une attaque à distance ne se voyait pas partir : le lanceur
s'élançait d'un demi-pas sur place, puis les dégâts tombaient chez une cible à
quatre cases de là, sans rien entre les deux. Il y a maintenant une flèche pour
un tir qui n'est pas magique, une boule bleue lumineuse pour un sort offensif, la
même en vert pour un soin lancé de loin.

**En haut, la vraie Forge.** Le choix se décide sur `isRanged` et `typeRes`, deux
champs que personne n'écrit à la main : ils sortent des sept cents lignes
d'extraction de `moteur_effets.js`. Un banc qui les fabriquerait lui-même
vérifierait que mon idée de la carte correspond à mon idée de la carte. Celui-ci
fait tourner le VRAI extracteur sur de VRAIES cartes (un arc, un « Pouvoir
magique », un soin, une épée, un bouclier jeté de loin, une immobilisation sans
la moindre attaque) et regarde ce qui en sort.

**Au milieu, une règle du jeu, pas un détail d'affichage.** `projectileDe`
(`moteur_pur.js`) décide, et le résultat voyage sur l'étape « carte » comme tout
le reste. Si chaque écran choisissait de son côté, une flèche chez l'un serait
une boule chez l'autre — exactement le mal qu'on a passé six étapes à soigner.

**En bas, le vrai dessin.** `animerProjectile` pose un SVG dans
`#transform-plateau`, comme le voile des zones : il hérite du pan et du zoom sans
un seul recalcul en JavaScript. Trois choses pouvaient mal tourner sans se voir —
le calque restant collé au plateau après l'impact et s'empilant tir après tir, un
départ pris sur la mauvaise case, et l'animation rendant la main avant d'être
arrivée (auquel cas le chiffre rouge s'affiche avant que la flèche ne touche).

⚠️ Et une leçon de banc, qui a coûté deux essais. Le style inline porte
l'ARRIVÉE dès la première frame : c'est la transition CSS qui fait le voyage.
Lire `g.style.transform`, c'est donc lire la destination — et croire qu'un
projectile téléporté vole très bien. Le banc lit la matrice CALCULÉE, deux fois,
à vingt puis cent quarante millisecondes : au départ près du lanceur, ensuite
plus loin, jamais au-delà de la cible. Encore faut-il que le plateau soit
VISIBLE : sur un élément en `display:none`, aucune transition ne tourne, et le
banc mesurait un projectile parfaitement immobile.

Les chapitres 14 et 15 de `moteur_pur.mjs` couvrent deux choses posées le même
jour, et la seconde n'existerait pas sans la première.

**Chapitre 14 : la triche des créatures.** Une créature inflige et soigne un
peu plus qu'un héros à carte égale — Petit +3, Normal +4, Élite +5, Boss +6 —
selon sa stature (`palier`, posé sur la fiche par le bestiaire). C'est un
réglage brut assumé comme tel (`bonusMonstreDe`, `moteur_pur.js`), pas une règle
qui se justifie par l'équipement ou les caractéristiques. Le bonus s'ajoute AU
BRUT, avant la chaîne de dégâts : il traverse donc le malus à bout portant et
les résistances comme un dégât ordinaire, il ne les contourne pas. Il ne
s'applique jamais à un héros, ni à un gain de bouclier (ni dégât, ni soin). Le
`palier` devait d'abord apprendre à voyager de la fiche à l'état de combat —
ajouté dans `combattantBrut` (`combat_etat.js`), et vérifié à part dans
`etat_combat.mjs`.

**Chapitre 15 : le bouclier qui se prenait pour un soin.** En écrivant le
bonus sur la branche "soin" de `resoudreCarte`, un vieux défaut est apparu :
l'extraction réelle (`moteur_effets.js`) pose `isHeal: true` ET `isShield: true`
sur un effet « Bouclier », pour que la Forge le range dans les mêmes menus
qu'un soin. Le noyau, lui, vérifiait `isHeal` EN PREMIER — la branche bouclier
n'était donc jamais atteinte pour une vraie carte de bouclier, et celle-ci
soignait des points de vie invisibles au lieu de poser un bouclier. Aucun banc
ne l'avait vu, parce que le chapitre 7 (SOIN, BOUCLIER, PURIFICATION) teste
`isShield: true` SEUL — jamais la combinaison que le jeu envoie réellement. Le
chapitre 15 la reproduit telle quelle et vérifie qu'un bouclier reste un
bouclier ; l'ordre des deux `if`, dans `resoudreCarte`, est maintenant inversé.

**Chapitres 16 et 17 : les immunités de peuple avaient disparu sous le nouveau
régime, sans que rien ne le montre.** En révisant l'Ankylar (immunisé à
l'Étourdi, en plus de sa résistance) et l'Ophior (des PV repris chaque manche,
en plus de la sienne), il est apparu que `window.estImmunise` — le mécanisme
qui protège déjà l'Ondari du feu et l'Éthéré du poison — n'existe QUE dans le
vieux moteur (`moteur_effets.js`). Le noyau pur (`moteur_pur.js`,
`cerveau_combat.js`) ne le connaît pas du tout : sous le régime du cerveau, qui
tourne par défaut depuis l'étape 5, ces deux immunités ne protégeaient plus
personne. Aucun banc ne pouvait le voir, puisqu'aucun ne testait l'immunité
dans le nouveau moteur — seulement dans l'ancien (`atouts_races.mjs`, via
`jouerAnimationMoteur`).

Le palier d'un monstre (chapitre 14) avait déjà dû apprendre à voyager de la
fiche à l'état de combat ; les immunités et le nouveau soin de race suivent la
même route (`atouts.immunites`, `atouts.regenPv`, `combattantDepuisFiche` dans
`combat_etat.js`, vérifiés à part dans `etat_combat.mjs`). Le chapitre 16 de
`moteur_pur.mjs` pose la vraie question : le jet d'un état (tiré une fois pour
tout le monde, à graine égale) tombe-t-il toujours le même nombre de fois, que
la cible soit immunisée ou pas ? Il fallait vérifier que l'immunité bloque
l'APPLICATION et jamais le TIRAGE — sans quoi deux cibles consommeraient un
nombre différent de dés, et le rejeu diverger. Le chapitre 17 vérifie que
la triche du monstre (chapitre 14) et l'immunité d'un héros ne se marchent
jamais dessus, sur deux combattants de la même carte.

`cap_fatigue.mjs` couvre le CAP de fatigue d'une compétence — combien une
technique peut coûter, selon la caractéristique qu'elle mobilise. C'était une
droite, `(carac-5) × 10` : chaque point valait toujours dix de plus. La vraie
table que Nico a donnée n'en est pas une — le pas de 14 à 15 vaut +15 (75 →
90), celui de 15 à 16 ne reprend que +10 (90 → 100) — elle est donc figée telle
quelle (`window.TABLE_CAP_FATIGUE`, `competences.js`) plutôt que devinée par une
formule qui retomberait dessus par hasard.

L'écart humain que Nico note lui-même (« 16 = 100, ou 110 pour les humains »)
n'est PAS un cas à part codé dans cette table : il vient tout seul de l'atout
de race déjà existant (`ATOUTS_RACES.Humain.fatigueMax = 10`, posé bien avant
dans `app.js`), rajouté par-dessus la table exactement comme il l'est déjà sur
le reste de la fatigue d'un personnage. Le banc le prouve en vérifiant l'écart
à PLUSIEURS paliers (pas seulement à 16) et avec un peuple sans ce bonus (Gob).
Il charge le vrai bloc de `competences.js` par découpage de source (comme
`cout_reel.mjs` le fait déjà pour le coût d'une carte), pas une réécriture de
la table dans le banc.

`gouttes_etat.mjs` couvre le repère demandé pour voir « d'un coup d'œil sur la
map » qui subit quoi : un petit point de couleur en bas du pion, un par état
actif, en arc de cercle s'il y en a plusieurs. Trois choix comptent, et le banc
les vérifie chacun.

Le CHOIX D'UN VRAI TOKEN, comme demandé : le pion est celui de Pliors, tiré de
`persos_reels.json` (un vrai instantané de Firestore, comme les autres bancs
qui s'en servent déjà) — sa vraie image Cloudinary, pas un carré gris. La
COULEUR de chaque état (`window.COULEUR_ETAT`, `combat.js`) est une table
fixe, une par état persistant du jeu (Étourdi, Poison, Brûlure, Gel…), avec un
gris neutre pour tout ce qui n'y figure pas encore — un état sans couleur
connue prend ce gris plutôt que de disparaître. Et le CALCUL DE POSITION
(`construireIndicateursEtatsToken`) est vérifié sur ses coordonnées, pas
seulement sur le nombre de points : un test qui ne compterait que "il y a bien
trois points" laisserait passer trois points empilés au même endroit. Le banc
lit les pourcentages posés en `left`/`top` et vérifie que trois états forment
un arc bombé (celui du milieu plus bas que les deux côtés), pas une pile ni une
ligne droite.

⚠️ Une capture accompagne ce banc (`/tmp/gouttes_etat.png`), et sa légende
mérite d'être lue avant de la regarder : la politique réseau de CETTE session
bloque `res.cloudinary.com` (403 côté proxy agent), donc le vrai portrait de
Pliors ne charge pas dans la capture — on n'y voit que l'ombre du pion sous les
gouttes de couleur. Le mécanisme ne regarde jamais d'où vient l'image : sur un
poste avec un accès réseau normal (le jeu, en vrai), le portrait s'affiche
sous les mêmes gouttes, sans rien à changer.

`equipement_cerveau.mjs` répond à une question précise de Nico : « les armes et
armures qui augmentent les statistiques sont-elles bien reliées au nouveau
cerveau ? ». La réponse était oui pour tout ce qui est PERMANENT — résistances,
parade, critique, dégâts plats, portée, coût de déplacement — parce que
`combattantDepuisFiche` (`combat_etat.js`) les fige déjà via les vraies
formules du jeu, et parce que `appliquerEquipementALaCarte` (moteur_effets.js)
enrichit une carte AVANT de la confier au cerveau. Elle était NON pour tout ce
qu'un objet ne fait qu'EN RÉACTION à une carte jouée : percer une armure ou une
résistance (un jet par cible), gagner de l'élan en frappant, bénir qui vient
d'être soigné, s'offrir un pas de retraite après un coup. Ces quatre choses ne
vivaient QUE dans `tirerLesDesDeLaCarte` / `appliquerSuitesEquipement`
(`moteur_effets.js`), un chemin que le régime du cerveau — le régime par
défaut depuis l'étape 5 — ne traverse jamais. Une arme perce-armure, un sabre
qui donne de l'élan, une bague de bénédiction ne faisaient donc RIEN sous le
régime courant, et rien ne le montrait : aucun banc ne les avait suivis
jusque dans le nouveau moteur.

Portés dans le noyau : `combat_etat.js` gèle les valeurs réactives d'un
combattant dans `equip` (`ignoreArmure`, `ignoreResistances`,
`hexApresAttaque`, `effetsSpeciaux`) au lieu de les laisser dans le seul monde
de l'ancien moteur ; `tirerDesCarte` (`moteur_pur.js`) y tire les jets qui
manquaient — percée par cible, chance d'élan — dans le MÊME ordre que
l'ancien moteur, pour que le rejeu consomme les dés pareil des deux côtés ;
`resoudreCarte` pose les états qui en résultent (Élan, Béni, Repli) avec la
même règle de renouvellement que toute autre altération.

⚠️ Une correction est passée avec : `hexApresAttaque` était gelé dans `mod`
comme un modificateur de déplacement PERMANENT — copié à l'identique de
`coutDeplacement`, sans remarquer que ce n'est pas la même sorte de bonus.
Une arme "offre un pas de retraite après une attaque" ne doit jamais donner
de mouvement gratuit à CHAQUE tour : ce n'est un cadeau que le tour où l'on
vient de frapper, posé comme l'état "Repli" d'un seul tour. Le chapitre 1 du
banc vérifie que `mod.hexApresAttaque` n'existe plus, et le chapitre 9 boucle
la preuve jusqu'à `mouvement_pur.js` : l'état posé par `resoudreCarte` doit
vraiment rendre les premières cases du PROCHAIN trajet gratuites.

Le banc charge le vrai `objets.js` (aucun import, donc directement évaluable)
et le vrai `window.bonusEquip` (`app.js`) — des objets à sa forme exacte
(`.bonus`, `.effets`), pas une réécriture — et un dé truqué à file fixe plutôt
que la graine du jeu, pour poser des cas précis (percé / pas percé, élan
réussi / raté) sans deviner une suite pseudo-aléatoire. Il vérifie aussi ce
qui ne doit PAS changer : « frappe » regarde le TYPE de la carte, pas si le
coup a atterri (l'Élan part même sur une cible qui esquive, comme avant), un
combattant à terre ne reçoit aucune suite, et sans objet réactif, aucun dé
n'est même tiré (pas de gaspillage) et rien ne se pose sur le lanceur.

Nico a aussi demandé de vérifier le menu de triche de la fiche personnage
(`onglet-dev`, les huit champs `Dev_Mod_*`). Il l'était déjà : ces champs
passent par `CHAMPS_STATS` (`combat_etat.js`) et par les mêmes formules du
jeu (`pvMaxCombattant`, `esquiveCombattant`, etc.) que tout le reste — la
preuve tenait déjà dans `atouts_races.mjs` (l'atout s'ajoute à la retouche de
la fiche) et dans le détecteur de `stats_fiche.mjs` (aucune stat lue sans sa
retouche dans tout le moteur). Rien à réparer là ; seulement à confirmer.

`durees_etats.mjs` répond à une question de Nico : « les durées sont-elles bien
implantées dans le cerveau, y compris durée+ ? ». Cette durée traverse quatre
mondes avant de compter — la Forge la compose (les `Tours` de l'effet en base,
plus les crans du bouton ⏳, rangés à part dans `act.baseDuree`), l'extracteur
l'additionne, le noyau la pose sur la cible, la fin de manche la décompte. Un
maillon cassé, et l'état dure un tour au lieu de quatre, ou pour toujours —
c'est arrivé une fois, quand le noyau lisait `tours` là où la Forge écrit
`duree`. Le banc tient la chaîne entière : le vrai extracteur d'un côté (dans un
navigateur, avec les VRAIES valeurs de `effets_reels.json`), le vrai
vieillissement de l'autre, et au milieu le noyau. Il vérifie aussi ce qui ne
doit PAS bouger : l'Immobilisation et l'Empoisonnement gardent leurs deux tours
même si une vieille carte porte des crans de ⏳.

`migration_effets.mjs` couvre le bouton « Mettre la BDD à jour » (écran des
effets). Un effet vit à DEUX endroits — sa mécanique dans le moteur, sa fiche
dans `Combat_Effets` (chiffres, texte lu par le joueur, coût) — et quand une
règle change, les deux doivent bouger ensemble, sans quoi la Forge annonce une
chose et le combat en fait une autre. Le banc fait tourner le vrai code sur un
Firestore de papier, à partir du VRAI instantané de la base, et tient trois
choses : la migration vise les bons effets avec les bonnes valeurs ; elle est
sans danger à relancer (le second passage n'écrit pas une seule fois — un bouton
qu'on n'ose pas cliquer deux fois n'est pas un outil) ; et une panne réseau ou
un effet manquant n'emporte pas le reste et ne se tait pas.

`apercu_butin.mjs` charge le vrai `style.css` et le vrai balisage
d'`index.html`, remplit l'onglet Inventaire et les trois vues du butin avec les
vraies fonctions de rendu et de VRAIS objets tirés du catalogue, et capture des
écrans (`/tmp/apercu_*.png`) — utile pour juger le rendu à l'œil sans ouvrir le
jeu.

⚠️ `combat_complet.mjs` ramène à zéro la DURÉE des pauses de l'IA. Ne pas
remplacer `setTimeout` par un appel synchrone : au bout de quelques dizaines
d'enchaînements, la chaîne de promesses se bloque et le test paraît figé alors
que le code va bien.

⚠️ `global.window` est unique. Pour comparer deux situations, réactiver le bon
monde avec `activer(w)` avant chaque mesure, sinon les deux mesures portent sur
le même monde et donnent évidemment le même résultat.

`coupe_circuit_partie.mjs` répond à un combat qui s'est mis à bug d'un coup :
la console montrait `Systeme_Parties/<id>` recevoir, à la même poignée de
secondes et depuis le MÊME poste, des écritures venues de `modifierPartieOuEchec`
(une carte jouée, un repos long) ET de `reclamerVerrouIA` (le verrou qui
autorise l'IA à jouer un monstre) — pendant que Firestore rendait
`resource-exhausted` (quota d'écritures dépassé, HTTP 429, pas une simple
transaction doublée). Les deux boucles de retente ne se voyaient pas : chacune
retentait de son côté avec sa propre attente, courte et pensée pour un
« failed-precondition » ordinaire, et la rafale ne s'est jamais calmée — le
combat est resté planté plus d'une minute. Les deux fonctions posent maintenant
un coupe-circuit PARTAGÉ (`window.PAUSE_ECRITURE_PARTIE`, `window.
attendreCoupeCircuitPartie()`) : dès que l'une des deux voit un
resource-exhausted, elle lève une pause de plusieurs secondes, et TOUT LE MONDE
— elle-même au prochain essai, l'autre fonction si elle s'y prend en même temps
— l'attend avant de retaper le document, plutôt que d'ajouter une écriture de
plus à un quota qui déborde déjà. Le banc rejoue les deux vraies fonctions sur
le même faux Firestore scripté (un `resource-exhausted` puis des succès) et
vérifie qu'aucun essai — ni de la carte, ni du verrou — ne tape le document
avant la fin du coupe-circuit levé par l'autre. Note pour les autres bancs qui
extraient `window.modifierPartieOuEchec` directement dans `combat.js`
(`transaction_partie.mjs`, `tour_synchronise.mjs`, `campagne_complete.mjs`) :
ils doivent désormais embarquer aussi le bloc du coupe-circuit
(`window.PAUSE_ECRITURE_PARTIE = ...` jusqu'à `leverCoupeCircuitPartie`), sans
quoi `modifierPartieOuEchec` plante dès son premier essai avec un
`TypeError: window.attendreCoupeCircuitPartie is not a function`.

`titre_preparation.mjs` couvre le gros titre posé devant la piste
d'initiative pendant la préparation : « Sélectionner une compétence » tant
que CE poste n'a pas retenu la carte d'un de ses héros, « En attente des
joueurs » une fois que c'est fait mais que la manche n'est pas bouclée, et
rien du tout en résolution ou une fois que tout le monde a joué
(`window.actualiserTitrePreparation`, appelée depuis `afficherPisteInitiative`
dans combat.js). L'élément est volontairement posé À CÔTÉ de
`#piste-initiative`, jamais dedans : celle-ci porte déjà `.piste-fond` et
`.piste-ombre-sol`, deux éléments à z-index négatif qu'un `backdrop-filter`
voisin fait disparaître (voir le commentaire dans style.css) — le nouveau
titre, lui, peut porter son propre flou sans risque puisqu'il n'a pas ce
genre de voisin. Le banc sert la vraie page en HTTP (comme
`piste_initiative.mjs`) et vérifie les deux textes, leur bascule selon
`Ont_Joue_Ce_Round`/`File_Attente_Combat`/`Combattants_Hors_Jeu`, la
disparition en résolution, et que le bandeau est bien devant la piste
(z-index) avec un `backdrop-filter` posé. Mordant vérifié en retirant l'appel
à `actualiserTitrePreparation` dans `afficherPisteInitiative`.

`pas_de_visionneuse.mjs`, section 8 : Nico voulait être sûr que le petit
bouton rond « compétences » (à côté du bouton fin de tour,
`#btn-hud-competences`) n'ouvre jamais que le deck de SON PROPRE héros —
l'ancienne visionneuse installait n'importe quel combattant cliqué dans
`COMBAT_PERSOS_JOUEUR`, et si un chemin de ce genre revenait, le volet
afficherait la technique d'un ennemi. Le banc rejoue le geste exact de
l'ancien bug (cliquer le portrait de l'ennemi dans la piste ET sur le
plateau), clique ensuite le VRAI bouton `#btn-hud-competences` (pas un appel
direct à `toggleVoletCompetences`), et vérifie que `#combat-liste-competences`
ne contient que la carte du héros du poste, jamais celle de l'ennemi. Mordant
vérifié en appelant temporairement `chargerCompetencesCombat("M1", ...)`
juste avant le clic, pour simuler la régression.

`piste_initiative.mjs`, section 14 : le petit cercle qui porte le chiffre
d'initiative prend maintenant la couleur du palier d'une créature — Petit en
gris, Normal en blanc, Élite en jaune, Boss en rouge
(`window.COULEURS_PALIER_INITIATIVE`, lu depuis `perso.Palier` dans
`contenuTuilePiste`, combat.js) — pour repérer un Boss d'un coup d'œil sans
lire son nom. Un héros n'a pas de palier et garde l'or d'origine. Le banc lit
la couleur RÉELLEMENT calculée par le navigateur (`getComputedStyle`, pas le
CSS écrit en dur) sur la bordure du cercle et sur le texte, pour les quatre
paliers plus un héros. Mordant vérifié en fixant temporairement la couleur à
l'or d'origine dans `contenuTuilePiste`.

`barre_progression_creation.mjs`, section 8 : Nico signalait que les phrases
humoristiques de l'écran de création « défilent trop vite, on n'a pas le
temps de les lire, et certaines paraissent tronquées ». La cause : un rythme
FIXE (3200 ms pour toutes) qui reprenait les phrases longues avant la fin de
leur lecture — d'où l'impression de troncature, une phrase de 72 caractères
n'ayant pas plus de temps qu'une de 50. Chaque phrase programme désormais
elle-même sa prochaine rotation, proportionnelle à sa longueur (~90 ms par
caractère, plancher à 4 s). Le banc pilote les minuteurs à la main (aucune
attente réelle), lit le délai RÉELLEMENT demandé par le code pour chaque
phrase tirée, et vérifie qu'il colle pile à la formule pour les seize
phrases du vrai pool — pas seulement qu'il « semble plus long ». Mordant
vérifié en remettant temporairement le délai fixe à 3200 ms.

`constitution_pv.mjs` couvre l'écran de création des caractéristiques
(app.js, achat de points 5e) : les PV max suivent maintenant la Constitution
POINT PAR POINT. L'ancienne formule (50 + 8 × le modificateur 5e, qui vaut
floor((con-10)/2)) ne bougeait qu'une fois sur deux — Constitution 8 → 9 ne
changeait rien, floor((8-10)/2) et floor((9-10)/2) valant tous deux -1 — et
Nico venait de dépenser un point pour rien à l'écran. La nouvelle formule
(`pvMaxDepuisConstitution`, app.js) est linéaire, 50 + 4 × (con - 10), et
reste rigoureusement cohérente avec l'ancienne échelle : les deux donnaient
déjà 42 PV à Constitution 8 et 74 PV à Constitution 16 (32 PV sur 8 points,
soit 4 PV par point) — seules les valeurs impaires, jusque-là ignorées,
changent quelque chose de plus. Le banc sert la vraie page en HTTP, clique le
vrai bouton « + » de la ligne Constitution, appelle le vrai
`validerCreationCaracs()` (avec un `updateDoc` qui garde la trace de ce qui
est écrit, pour vérifier la valeur SAUVEGARDÉE et pas seulement prévisualisée)
et le vrai `afficherStatsFinales()` (l'affichage d'un héros déjà créé).
Mordant vérifié en remettant temporairement l'ancienne formule.

`drapeau_regime.mjs` a changé de sujet en même temps que le jeu : il
s'appelait « le drapeau, et la promesse de retour arrière » et vérifiait que
`window.REGIME_CERVEAU` (éteint par défaut) gardait intact, derrière lui,
tout l'ancien moteur de synchronisation (verrous, Action_*), au cas où il
faille y revenir après une soirée ratée. Nico a tranché : « le nouveau
cerveau doit être le seul et unique solution possible ». Le drapeau, la case
« Combat : nouveau régime (un seul cerveau) » des paramètres, la fabrique
console `regimeCerveau(true)`, et tous les blocs `if (!window.
REGIME_CERVEAU)` (ancienne synchro rejouée dans app.js, anciens moteurs de
combat/déplacement/carte/fin de tour dans combat.js/mouvement.js/
moteur_effets.js qui retombaient sur une alerte « active le régime cerveau »)
ont été supprimés pour de bon — pas débranchés, supprimés. Le banc vérifie
maintenant l'inverse de ce qu'il vérifiait avant : que REGIME_CERVEAU,
basculerRegimeCerveau, regimeCerveau et la case à cocher ont bien disparu de
CHAQUE fichier de production, qu'aucune redirection vers `regimeDemande`
n'est restée sans sa garde (`window.regimeDemande && window.regimeDemande.
actif()`, simplifiée puisqu'il n'y a plus qu'un régime à distinguer), et que
tout ce que le cerveau garde de son ancienne cohabitation (transactions,
projection, gestion des pannes, reprise après un cerveau mort) reste intact —
supprimer une chose ne devait pas en abîmer une autre. `fenetre_tour.mjs` a
dû apprendre à fournir son propre `window.regimeDuJeu` minimal (reflétant
simplement `PARTIE_DATA`) : `acteurCourantCombat` (sequence_tour.js) ne lit
plus jamais `PARTIE_DATA.File_Attente_Combat` directement, et ce banc n'a
pas de vrai cerveau à côté de lui.

`piste_initiative.mjs`, section 3 renommée : le héros portait un hexagone
doré tiré du portrait de sa fiche (`perso.urlCloudinary`) dans la piste
d'initiative, pendant que les créatures portaient déjà un médaillon rond. Il
porte maintenant le même médaillon rond, avec l'image de son TOKEN de
plateau (`TOKENS_VTT_DATA[id].url`, celle qu'on reconnaît déjà sur la carte)
— pas le portrait de sa fiche, qui reste une image différente. Le monde du
banc donne à H1 un token ET un portrait de fiche volontairement différents,
pour vérifier que c'est bien le premier qui apparaît dans la piste. Mordant
vérifié en remettant temporairement l'hexagone d'origine.

`volet_competences.mjs` : la pointe de la lanière de cuir, repliée, dépasse
maintenant de 100 px au lieu de 72 — Nico la voulait un peu plus visible.
Les deux contrôles qui mesuraient sa hauteur exacte repliée (`>= 55 && <=
95`) ont suivi (`>= 80 && <= 120`). Mordant vérifié en remettant
temporairement `window.POINTE_LANIERE_VISIBLE` à 72.

`reveler_terrain.mjs` (nouveau) couvre l'œil d'or : un petit bouton doré,
collé au bord droit de l'écran juste au-dessus du bandeau de fin de tour, qui
révèle les murs et le terrain difficile déjà posés sur le plateau tant qu'on
le maintient enfoncé. Le piège à éviter était de réutiliser VTT_MODE_MURS ou
VTT_MODE_DIFFICILE pour ça : ces deux drapeaux ne servent pas qu'à
l'affichage, ils arment AUSSI le pinceau de peinture des murs/du terrain
difficile (un tap sur l'hexagone bascule son état) — les allumer pendant tout
un appui de « juste regarder » aurait exposé n'importe quel joueur curieux au
risque de modifier la carte par erreur. Un troisième drapeau, purement
d'affichage (`window.VTT_REVELER_TERRAIN`), a donc été ajouté : `drawHex`
(Plateau.js) l'ajoute en OU à ses deux conditions de rendu, sans jamais le
lire ailleurs, et `activerRevelationTerrain`/`desactiverRevelationTerrain`
(combat.js) ne font rien d'autre que le poser et redessiner. Le banc sert la
vraie page, instancie le vrai `Plateau`, pose un vrai mur et une vraie case
difficile, puis appuie et relâche le VRAI bouton du DOM (souris, avec un
passage par « la souris quitte le bouton en cours d'appui ») — jamais un
appel direct aux fonctions. Il vérifie que rien n'est visible relâché, que
tout apparaît pendant l'appui SANS que VTT_MODE_MURS ni VTT_MODE_DIFFICILE ne
s'allument, que tout redisparaît au relâchement, et que le bouton est bien
petit, discret, collé à droite et posé au-dessus du bandeau — pas dessus.
Mordant vérifié deux fois : une fois en retirant `isRevealMode` des deux
conditions de `drawHex` (les remplissages disparaissent, échec), une fois en
faisant réutiliser `VTT_MODE_MURS` par `activerRevelationTerrain` (le
contrôle « le pinceau des murs reste éteint » échoue).

`combat_complet.mjs` (nouveau) et `firestore_partage.mjs` (son Firestore)
répondent enfin à la question que tous les autres bancs laissaient ouverte :
« trois appareils ouvrent la même rencontre, chacun choisit sa carte — le
combat se lance-t-il ? ». Nico l'a posée après une soirée où, justement, il ne
se lançait pas, en soupçonnant la suppression du drapeau REGIME_CERVEAU. Le
banc ouvre TROIS vraies pages du jeu (Nico, Ben, Adrien), chacune dans son
propre navigateur — donc sa propre identité — branchées sur UN SEUL Firestore
tenu par Node : un faux SDK servi à la place de firebase-firestore.js, qui
parle exactement la langue du vrai (setDoc et son merge, updateDoc et ses
chemins pointés, writeBatch tout-ou-rien, runTransaction en concurrence
optimiste, onSnapshot avec une latence propre à chaque page, les requêtes
triées qui écartent les documents sans le champ du tri). Rien du jeu n'est
découpé : on rejoint la partie par le mot de passe, on ouvre la fenêtre de
combat, le MJ génère la rencontre (créatures, techniques forgées), chacun
touche sa bannière puis le bouton de fin de tour, on tape l'écran pour
lancer chaque tour annoncé, on vise, on résout — trois manches de bout en
bout. Verdict : la suppression du drapeau n'y est pour rien, le combat se
lance et se joue. En revanche, la base réelle répondait ce jour-là « Quota
exceeded » (RESOURCE_EXHAUSTED) : le quota gratuit du jour était épuisé, et
Firestore refusait TOUTES les écritures. Le banc compte donc aussi la facture
exactement comme Firebase (une lecture par document rendu, une par document
ajouté ou modifié dans une écoute, une écriture par document), par manche et
à l'arrêt. Mesure avant correction : à l'arrêt, sans que personne ne joue,
8 640 lectures et 720 écritures PAR HEURE au bout de trois manches — et ça
grossissait à chaque intention. Après : 1 440 lectures et 360 écritures, et
ça ne grossit plus. Le banc vérifie ce plafond, puis épuise le quota exprès
(toute écriture refusée en « resource-exhausted ») : le joueur qui choisit sa
carte doit voir le bandeau « quota épuisé » avec l'heure du retour (9 h, heure
de Paris), son deck doit se rouvrir au lieu de faire semblant que la carte
est partie, rien ne doit entrer dans la file — et le même geste doit
fonctionner dès que le quota revient. Mordant vérifié en retirant le contrôle
`if (!ecriture.ok)` de jouerCarteCombat : le volet reste fermé, échec.

`quota_cerveau.mjs` (nouveau) isole la cause de l'épuisement, en quelques
secondes, sur le VRAI régime (creerRegime) et un Firestore qui facture : le
cerveau écrit un battement de cœur, l'écho de ce battement le faisait
TOURNER, et chaque tour relisait la collection ENTIÈRE des intentions —
chaque pas, chaque carte, chaque fin de tour de la rencontre, jamais
retirés avant la fin. Plus le combat durait, plus chaque battement coûtait.
Trois corrections, trois contrôles, trois morsures vérifiées : l'écho d'un
battement (même combat, même version) ne relance plus le cerveau (morsure :
5 lectures par battement au lieu de 3) ; les intentions ne se lisent plus
que lorsqu'elles sont EN ATTENTE, par une égalité seule sur `traitee` — pas
d'index composite, le tri par arrivée se fait en mémoire (morsure : 300
intentions traitées relues à chaque battement) ; le cerveau ÉCOUTE les
intentions en attente au lieu de les sonder au battement, et traite une fin
de tour en quelques millisecondes même avec un battement d'une minute
(morsure : jamais traitée). Le battement lui-même passe de cinq à dix
secondes (trois tiennent encore dans les trente secondes du délai « cerveau
perdu »). `depot_firestore.mjs` vérifiait l'inverse — « les intentions ne
filtrent rien du tout, la collection est minuscule » — et a changé de
contrôle en conséquence. Deux économies de plus, hors du cerveau : l'écoute
de la liste des parties (utile au seul menu) est coupée quand on entre dans
une partie, et le choix d'une carte ou d'un repos long passe par
`modifierPartieOuEchec`, qui dit si l'écriture a eu lieu.

`reveler_terrain.mjs`, chapitres 6 à 9 : Nico a signalé que l'œil d'or
« ne montre pas tous les murs et terrains difficiles, il en oublie ». Quatre
raisons, chacune couverte et mordante. Une case GOMMÉE est infranchissable
comme un mur (le cerveau la refuse au même titre) mais restait invisible à
l'œil — et un mur ou un terrain difficile peint PAR-DESSUS une case gommée
aussi, alors que l'outil de peinture les montrait : l'œil les dessine
maintenant, en noir comme un mur (lu au pixel près sur le vrai canvas). Un
pion posé sur une case difficile la cachait : pendant l'appui, les pions
passent à 35 % d'opacité. Un instantané de Combat_VTT (un pion qui bouge sur
un autre appareil) rapportait la liste des murs ENREGISTRÉE et remettait
toute la couche à zéro, effaçant le mur que le MJ était en train de peindre :
tant que son pinceau est en main, la couche qu'il peint n'est plus
réécrasée. Enfin, fermer la fenêtre de combat pinceau en main reposait
l'outil « sans sauvegarder », mais laissait les cases peintes dans la
mémoire du seul appareil du MJ — invisibles, jamais envoyées aux autres,
mais bloquantes pour les chemins calculés là, et pour le cerveau s'il y
tourne : des murs que l'œil des joueurs ne pouvait pas montrer. L'appareil
revient désormais au terrain enregistré. Le faux Firestore du banc garde ses
écoutes pour livrer lui-même un instantané de Combat_VTT.

### Une arme qui brûle ne doit pas empêcher de jouer

Nico a posé sa zone, et plus rien. La console disait tout : « WriteBatch.set()
called with invalid data. Unsupported field value: undefined ». Firestore
refuse la moindre valeur `undefined`, et c'est l'intention ENTIÈRE de la carte
qui tombait : la technique n'arrivait jamais au cerveau, le tour restait figé.
Le trou venait de l'arme. Quand elle porte un état (brûler, geler, étourdir…),
`appliquerEquipementALaCarte` l'ajoute aux cibles de la carte — et y posait
`idProvocateur: undefined` dès que l'état n'était pas une Provocation. Le champ
n'existe plus que pour la Provocation. `carte_sans_trou.mjs` passe chacun des
neuf états qu'une arme peut porter dans le vrai code, et fouille le résultat
jusqu'au fond des tableaux (morsure : huit états sur neuf troués). Et parce
qu'un champ vide ne doit plus jamais coûter une technique, le régime retire
toute valeur `undefined` d'une intention avant de l'envoyer, et la trace dit
laquelle (🧹). Le chapitre « un champ vide ne coûte jamais une technique » de
`regime_cerveau.mjs` rejoue la carte de Nico avec une base aussi stricte que la
vraie : l'intention part, la cible prend le coup, la file avance (morsure :
intention refusée, cible intacte, file bloquée). Pourquoi aucun banc ne l'avait
vu : leurs faux Firestore acceptaient `undefined`. Celui de `regime_cerveau.mjs`
et celui de `firestore_partage.mjs` le refusent désormais avec le message exact
du SDK — `combat_complet.mjs` joue donc un combat entier sous cette règle.

### L'étalement divise par le nombre de tours — dégâts et soins, jamais un état

Nico : « 10 dégâts étalés sur 2 tours, c'est 5 dégâts sur chacun de ces
tours », et l'étalement « ne doit pas s'appliquer sur les effets, uniquement
sur les dégâts, les soins, la distance, les zones ». Trois étages bougent.
**La Forge** (`etalement_sans_degats.mjs`) offre l'étalement sur une attaque,
un SOIN, une Zone ou une Distance, et le grise sur un état ou un bouclier ; une
carte qui ne fait que soigner peut désormais étaler son soin. Le bouton ⏳ est
offert sur l'étalement : chaque cran ajoute un tour, donc un diviseur de plus,
et le texte le dit (« divisés par 3 … pendant 3 tours ») — le générateur de
monstres écrit le même texte, `textes_reels.mjs` y veille. **L'extraction**
(`moteur_effets.js`) lit le nombre de tours (colonne Tours, 2, plus les crans
⏳) ; posé sur une Distance ou une Zone, l'étalement gagne les dégâts et les
soins de toute la carte ; posé sur un état, il n'étale rien. **Le noyau**
(`partsEtalees`, `moteur_pur.js`) divise le montant final en N parts entières
qui font exactement le total (10 sur 3 tours : 4, 3, 3) ; rien au lancement,
une part par fin de manche, et l'état s'en va avec la dernière. Un second
étalement s'ajoute part à part à ce qui reste au lieu de s'allonger au bout de
la file. Un soin étalé pose « Soin étalé » (vert sur le pion), que le cerveau
rend une part par manche sans dépasser la vie maximum. `etalement_tours.mjs`
tient les trois étages ; treize morsures, une par règle, font chacune tomber au
moins un contrôle.

### Un héros qui vient de naître se découvre par ce qu'il porte

À la validation des caractéristiques, la fiche du nouveau héros s'ouvre sur
l'onglet Inventaire — son arme et sa tenue de départ — ou y bascule si elle
était déjà ouverte. Une fiche ouverte depuis la liste des héros garde les
Caractéristiques. `ouverture_inventaire.mjs` charge la vraie page, valide la
création pour de vrai et lit l'onglet allumé (morsures : fiche neuve sur les
Caractéristiques ; fiche déjà ouverte qui ne bascule pas).

### Le nom du héros porte enfin une ombre nette

Nico : « rajouter une ombre sous le nom du personnage au-dessus du bouton fin
de tour ». Le nom vit dans un `<span>` en `background-clip: text` — un dégradé
clair qui se fond dans un fond clair sans un relief net dessous. Une seule
ombre large et floue y était déjà posée (`filter: drop-shadow`), mais trop
diffuse pour se lire comme une ombre PORTÉE. Un second `drop-shadow`, quasi
sans flou et collé aux lettres, s'empile sur le premier — les deux tiennent
dans le même `filter`, l'un n'efface pas l'autre. Le chapitre 12 de
`hud_heros.mjs` lit le `filter` calculé par le navigateur et vérifie les deux
ombres (morsure : sans la nouvelle, une seule reste, l'ombre nette manque).

### La Forge ne propose que l'arme qu'on tient vraiment en main

Nico : dans le menu « Type d'Attaque », les quatre armes physiques (légère
CAC, lourde CAC, polyvalente, légère Distance) ne doivent montrer que celle
qui correspond à l'arme réellement équipée ; Magie et Sans arme restent
proposées en toutes circonstances, l'une ne dépendant d'aucune arme, l'autre
étant justement faite pour s'en passer. `window.ouvrirMenuArme` (competences.js)
lit désormais l'équipement du héros (`armesEnMain`, via `persoDocVersFront` sur
la fiche chargée à l'ouverture de la Forge) et masque les boutons des trois
autres types. Une arme à deux mains ne compte qu'une fois (même identifiant
dans les deux mains) ; deux armes d'une main de types différents montrent
les deux ; un bouclier seul, ou toute autre absence d'arme physique, masque
les quatre. Une fiche introuvable ne bloque rien : les quatre restent
proposées plutôt que d'empêcher de forger une technique de corps à corps ou
de tir — même principe que `window.peutEquiper`. `forge_arme_equipee.mjs`
charge la vraie page (Firebase remplacé par des doublures) et vérifie chaque
cas ; retirer le filtre ou la détection fait tomber les mêmes contrôles.

### Le sablier du repos long ne restait pas toujours sur sa case

Nico : « quand on fait repos long y'a encore les traces de texte avec sablier
sur le côté gauche de l'écran qu'il faut virer ». Le sablier flottant («
Repos Long — Concentration et souffle ») est un `<div>` posé à gauche de
l'écran (`apercu-repos-long-ui`), montré tant que ce héros reste en tête de
file avec sa carte « REPOS_LONG », et refermé sinon — mais seulement dans les
branches d'`actualiserEtatCarteCombat` qui exigent un `persoActuel`. Le moindre
trou (la liste des héros du poste vidée puis reconstruite entre deux
combats, un index qui pointe un instant dans le vide) faisait sortir la
fonction AVANT ces branches, sans y toucher — et le sablier d'un repos déjà
résolu restait affiché, parfois jusqu'au combat suivant. Il se referme
maintenant dès l'entrée de la fonction, avant tout retour anticipé. Vérifié
en rejouant le trou dans un vrai navigateur (morsure : sans le correctif, le
sablier reste à l'opacité 1 après le trou).

### Le déplacement met moins de temps à démarrer, surtout sur iPad

Nico : « quand on valide le déplacement d'un perso il met un peu de temps
avant de lancer l'animation — sur iPad, pas sur PC ». Valider (et annuler) un
déplacement appelait `appliquerTokensVTT` : un redessin ENTIER de tous les
pions du plateau — ombre, halo de sélection, halo de bouclier magique (des
filtres SVG animés) pour chacun — dans le seul but d'effacer la petite croix
rouge d'annulation d'UN SEUL pion. Ce redessin s'exécutait juste avant
d'envoyer le chemin au cerveau, donc avant tout le reste ; et Safari met bien
plus de temps que les autres moteurs à reconstruire des filtres SVG (le même
constat avait déjà fait choisir un dégradé plutôt qu'un flou pour l'ombre au
sol des pions). `window.retirerCroixDeplacement` retire directement la croix
du seul pion concerné, sans reconstruire quoi que ce soit d'autre — les
autres redessins, déclenchés par de vrais changements venus de Firestore,
continuent comme avant. `croix_deplacement_legere.mjs` vérifie, sur le vrai
DOM, qu'aucun redessin complet n'a lieu et que le reste du pion (son halo) ne
bouge pas — même référence DOM avant et après (morsure : sans le correctif,
la croix reste et un redessin est compté).

### Une carte qui frappe et soigne se vise en deux temps

Nico : « quand on met un soin sur une compétence après une attaque, il soigne
la cible de l'attaque ; ça devrait soigner soi-même ou un allié ». Le ciblage
n'avait qu'une cible pour toute la carte : viser l'ennemi la posait sur
l'attaque ET sur le soin. Il a désormais deux phases. La première vise ce qui
frappe (attaques, états) ; au moment de résoudre, si la carte porte aussi un
soutien (soin, bouclier, absorption) resté sans cible, `passerAuCiblageDuSoutien`
démonte le ciblage de l'attaque — zone comprise — et ouvre celui du soutien :
« Qui reçoit le soin ? Toi-même ou un allié. », le lanceur présélectionné (un
tap sur ✔ suffit), un allié au choix, un ennemi refusé. Une seule carte part
ensuite au cerveau, chaque effet avec sa propre cible. Un soin posé DANS la
zone ne demande pas de second geste : la zone blesse ce qu'elle couvre et ne
soigne que les alliés qu'elle couvre (`validerZoneAoE` trie désormais par
effet). Chaque effet extrait retient pour cela si son action porte la zone
(`enZone`). Une carte qui ne fait que frapper, ou que soigner, n'a qu'une
phase, comme avant. Même règle chez les créatures (`jouerCreature`) : le soin
d'une carte mixte revient à la créature, jamais à sa victime.

### Après un Bond, le sort part de la case d'arrivée

Nico : « une compétence avec bond puis une zone : la sélection de zone s'est
faite sur mon emplacement d'avant le bond ». Le Bond est une demande au
cerveau : le pion ne rejoint sa case qu'une fois le cerveau revenu (sur iPad,
bien après les 750 ms d'attente), et tout le ciblage se mesurait depuis le
pion. `resoudreBondInteractif` rend maintenant la case d'atterrissage, que le
ciblage retient (`origineLanceur`) ; `positionCiblage` la sert pour le lanceur
partout — zone collée à lui, cases où poser une zone à distance, portée,
ligne de vue, anneaux, soin sur soi. `ciblage_soutien_bond.mjs` joue les deux
signalements sur le vrai moteur_effets.js, du premier clic à l'intention
envoyée, plus le cas des créatures dans le cerveau ; sept morsures, une par
correctif, font chacune tomber au moins un contrôle.

### Le soin de zone porte à deux cases même au contact d'un ennemi

Nico : « j'ai un soin à distance deux, mais la sélection ne se fait qu'autour
de moi ». Le soin à cible unique portait déjà à deux cases ; c'était la ZONE de
soin qui se trouvait ramenée à une case par la règle de l'engagement (un
lanceur collé à un ennemi ne pose ses zones qu'à son contact). Cette règle
empêche de bombarder de loin quand on est au corps à corps : elle n'a pas de
sens pour un soin. `casesPosablesZone` et les deux gestes de la souris (survol
et clic) laissent désormais un soin de zone à sa pleine portée, engagé ou non ;
une zone offensive engagée reste, elle, collée au lanceur.

### Bouclier, Absorption, Contre : des pourcentages, chacun sur sa nature de dégâts

Le grimoire dit « créer un bouclier de 25 % des PV restants de la cible » ; le
code lisait la Valeur comme des POINTS, d'où un bouclier de 30 PV tout rond. La
Valeur est maintenant un pourcentage des PV actuels de la cible, par cran,
plafonné par le Pourcentage max du grimoire (un bouclier posé sur une cible à
40 PV en donne 10). La migration de la base (bouton « Mettre la BDD à jour »)
passe la Valeur de EFF_BOUCLIER_MAGIQUE de 30 à 25 ; les anciennes cartes qui
ne portent que des points gardent leur comportement.

L'Absorption était bien un pourcentage, mais elle rognait TOUS les dégâts : elle
ne touche plus que les dégâts magiques, comme le dit son texte, et son plafond
est lu dans le grimoire. Le Contre, lui, n'existait tout simplement pas : il
est désormais extrait des cartes, posé comme état sur l'allié visé, et annule
sa part des dégâts PHYSIQUES en renvoyant 10 % de la frappe à l'attaquant
(bouclier de l'attaquant d'abord, chute s'il tombe à zéro). Un effet de soutien
ne peut plus être « esquivé » par celui qui le reçoit. `bouclier_absorption_contre.mjs`
joue tout cela sur le vrai moteur_pur.js et le vrai moteur_effets.js ; huit
morsures font chacune tomber au moins un contrôle.

### Un objet à bénédiction de soin cassait la réserve de butin

En faisant tourner la suite, `combat_complet.mjs` a une fois échoué sur
« WriteBatch.set() called with invalid data. Unsupported field value: undefined
(… Combat_Butin/reserve_normale … items[1].effets[0].buffSoi) ». Un objet Très
rare ou Épique qui tirait une bénédiction de soin recopiait aussi « buff »,
« buffSoi » et « chance » — vides — et Firestore refuse alors le document
ENTIER : la réserve de butin préparée à l'avance ne s'écrivait pas.
`fabriquerObjet` ne recopie plus que les champs présents.
`objets_sans_undefined.mjs` fabrique des milliers d'objets, sur chaque modèle
et chaque rareté, et les fouille jusqu'au fond (morsure : l'ancien code tombe
dès le premier tirage à bénédiction).

### La Poussée reste à deux cases, quel que soit le nombre de points

Nico : « dans la Forge, mettre des points à Pousser augmente le pourcentage ET
le nombre d'hexagones ». Le moteur a toujours poussé de 2 cases ; c'est le
texte de la Forge qui mentait. `formatterTexteEffet` multiplie la Valeur du
grimoire par le nombre de points — juste pour des dégâts, faux pour la Poussée,
dont la Valeur (2) est une DISTANCE : 4 points annonçaient « 8 hexagones ».
Même travers pour la Traction (3 cases, « 9 hexagones » à 3 points). Pour ces
deux effets, la Valeur n'est plus multipliée : seul le pourcentage grimpe.
Les cartes des monstres (`texteEffet`, monstres_competences.js) écrivaient
le même mensonge et suivent la même règle ; `textes_reels.mjs` ne se contente
plus d'afficher « le piège » : il échoue si la distance grandit.

Au passage, le plafond de chance de la Poussée côté moteur était écrit en dur
à 50 %, alors que le grimoire dit 60 % et que la Forge laisse monter jusque-là :
il est maintenant lu dans le grimoire (50 % si la base n'en donne pas). La note
de EFF_POUSSEE dans la migration dit désormais que la distance est fixe. Rien
d'autre à changer dans la base.

### L'avatar au-dessus du bouton de fin de tour, un peu plus grand

`REGLAGES_HUD.avatar` passe de 376 à 410 px de haut (environ +9 %, à l'échelle
du bandeau comme tout le reste). Son pied ne bouge pas : il grandit vers le
haut, et son bord droit recule de 10 px pour qu'il reste centré sur le bouton.

`poussee_forge_avatar.mjs` vérifie le texte de la Forge (vrai competences.js),
ce que la carte extrait (vrai moteur_effets.js) et la taille posée sur la page
(vrai hud_disposition.js) ; chacun des trois fichiers d'avant fait tomber au
moins un contrôle.

### Le bouton OK, petit, sous la piste d'initiative

Nico : « le bouton OK pour voir l'animation du personnage en cours, fais-le plus
petit et mets-le en dessous de la barre d'initiative ». Il n'avait aucune
position à lui : posé dans le voile sans ancrage, il tombait dans le coin
haut-gauche, sous la croix rouge, en police de 30. Il est maintenant centré,
en police de 15, et `rafraichirVoileTour` lui donne son `top` au moment de
l'afficher, d'après le bas RÉEL de `#piste-initiative` plus 10 px : la piste
change de hauteur selon l'écran, un nombre appris par cœur aurait fini dessus
ou loin d'elle. Le banc donne à la piste une hauteur inhabituelle (150 px) pour
s'assurer que le bouton la suit vraiment.

### L'outil provisoire « ⚙ HUD » revient, pour l'encart de tour

Nico veut régler lui-même, à l'écran, la plaque qui montre la technique qui va
être lancée, « de l'image de fond au texte ». `reglage_encart.js` — un fichier
à part, avec sa propre ligne dans index.html, pour partir d'un seul coup quand
les nombres seront recopiés — ajoute en combat une poignée « ⚙ HUD » (à gauche,
à mi-hauteur) qui ouvre une boîte de flèches : plaque entière, image de fond
seule, médaillon, avatar en pied, états, nom du combattant, nom de la
technique, détail de l'attaque, ligne d'attente. Chaque ligne a ses quatre
flèches et ses boutons de taille ; un appui long répète (sur iPad, taper vingt
fois serait interminable). « Figer » garde l'encart à l'écran avec un exemple,
« Portrait » bascule le portrait affiché entre avatar en pied et médaillon —
les deux formes n'ont pas les mêmes mesures —, « ⇄ » change la boîte de côté,
« Défaut » revient aux valeurs du code, et « 📋 Extraire le code » affiche (et
copie) un bloc prêt à recopier dans `REGLAGES_HUD`.

L'outil ne pose rien lui-même : il modifie `window.REGLAGES_HUD` et redemande
la pose à `hud_disposition.js`. Ce qui se voit pendant le réglage est donc
exactement ce que le jeu fera avec les mêmes nombres. Seul ajout permanent :
`encartFond` { x, y, echelle }, qui déplace et agrandit l'image de fond SEULE
par `transform` — sans toucher à la boîte, donc sans rien décaler de ce qui se
mesure en pourcentage d'elle. Ses valeurs par défaut ne changent rien.

`reglage_encart.mjs` sert la vraie page : chaque flèche est cliquée et on
mesure à l'écran que l'élément visé bouge dans le bon sens, et lui seul ; le
code extrait est relu comme du JavaScript ; un rechargement garde les
réglages ; hors combat, poignée et boîte disparaissent. Morsures : l'ancien
combat.js (bouton non recalé sur la piste), l'ancien style.css (gros, dans le
coin), l'ancien hud_disposition.js (le fond ne bouge pas) et la page sans
l'outil font chacun tomber des contrôles.

### La triche des créatures, revue à la baisse, et +8 % de Peur et d'Étourdi

Nico a revu le bonus fixe que les créatures ajoutent à ce qu'elles infligent
et soignent : Petit 0, Normal 1, Élite 2, Boss 3 (au lieu de 3, 4, 5, 6). Le
tableau `TABLE_BONUS_MONSTRE` (moteur_pur.js) reste le seul endroit à toucher ;
le bonus s'ajoute toujours au brut de la carte, avant les résistances.

Nouvelle triche, sur deux états seulement : la Peur et l'Étourdi lancés par une
créature prennent 8 points de chance de plus, quelle que soit sa stature,
plafonnés à 100 (`chanceEtatDe`). Le bonus vaut au jet de la carte
(`tirerDesCarte`) comme pour une zone persistante, dont la chance est figée
au lancement (`creerZonePure`). Un héros n'y a jamais droit, et aucun autre
état ne bouge.

`moteur_pur.mjs` (chapitres 14, 14 bis et 17) vérifie le tableau, les dégâts
et les soins réels, et le jet sur un dé fixe (45 contre une Peur à 40 % : la
créature la pose, le héros la manque). Le contrôle du soin partait jusqu'ici
d'une créature presque à son maximum : l'ancien et le nouveau bonus butaient
tous deux sur le plafond de 70 PV, et le test ne mesurait rien. Il part
maintenant de 40 PV.

### La Purification : un état en moins, à coup sûr

Nico a changé la fiche dans le grimoire : « Enlève un état aléatoire sur la
cible », Valeur 1, Pourcentage de base 0, Pourcentage max 1, coût fixe de 6.
Avant : « 50 % de chance d'enlever tous les effets négatifs ». Lue par l'ancien
code, la nouvelle fiche donnait une purification qui ne se déclenchait JAMAIS
(la chance était le Pourcentage de base, désormais 0) et qui soignait 1 PV (la
Valeur lue comme un montant de soin).

L'extraction (moteur_effets.js) lit maintenant la Valeur comme un NOMBRE
d'états (`purifNombre`) et fixe la chance à 100 % — un Pourcentage de base
encore renseigné resterait lu comme une chance. Une Purification ne soigne
rien ; posée en modificateur d'un Soin, elle laisse le Soin soigner.

Le noyau (moteur_pur.js) retire un état NÉFASTE tiré au hasard, et plus toute
la liste : l'ancien code effaçait aussi l'Absorption, le Contre, l'Élan et les
bénédictions — purifier un allié lui ôtait ses protections. `estEtatNefaste`
épargne ces états-là (et tout ce que l'équipement pose). Le dé du choix est
tiré avec les autres (`purifJet`, dans tirerDesCarte) : tous les postes
retirent le même. L'écran dit ce qui est parti : « ✨ Purifié : Glacé »
(pont_combat.js).

`purification.mjs` passe la vraie fiche au vrai moteur_effets.js, puis vérifie
le jet, la résolution et le message ; les anciens moteur_effets.js,
moteur_pur.js et pont_combat.js y font chacun tomber des contrôles.
`moteur_pur.mjs` (chapitre 7) vérifie le choix au dé, les états épargnés et
une carte qui en retire deux.

### Le Repli : frapper, puis décrocher

Nouvel effet demandé par Nico : « Repli — coût 6 — Dextérité — se déplace de 3
cases après avoir attaqué, avec 60 % de chance d'éviter les attaques
d'opportunité ». Il existe maintenant partout.

**La base.** La migration (« Mettre la BDD à jour ») sait désormais CRÉER un
effet (`creer: true`) : EFF_REPLI est écrit en entier la première fois, puis
jamais réécrit, pour que les réglages faits à la main dans le grimoire tiennent.
Valeur 3 = cases de marche ; Pourcentage de base 60 = chance d'éviter ; un seul
cran (Pourcentage max 60). La fenêtre des effets (Paramètres) et la Forge le
lisent comme les autres : c'est une action « Action/Global », comme le Bond.

**La règle** (mouvement_pur.js, `resoudreRepli`). Une MARCHE, pas un saut : ni
mur, ni vivant traversé (`cheminsDeRepli`, un parcours en largeur de 3 pas au
plus, la seule définition des cases atteignables — pour l'écran, pour l'IA et
pour le cerveau). Elle est gratuite (la carte l'a payée). Chaque ennemi quitté
porte son attaque d'opportunité, mais le repli tire d'abord un dé à lui : 60 %
et le coup est évité (« Repli 💨 »), sinon la défense ordinaire joue. Immobilisé
ou à terre, on ne se replie pas.

**Pourquoi la case part AVEC la carte.** Dans le cerveau, une carte clôt le
tour de son lanceur ; une demande de déplacement envoyée après elle serait
refusée (« c'est au tour de X »). Le joueur choisit donc sa case de repli juste
après avoir visé (`choisirCaseRepli`, même écran assombri que le Bond ; taper
son propre pion = rester), la case voyage dans l'intention de carte, et le
cerveau joue l'attaque, puis la marche de repli, puis la clôture — dans la même
entrée de journal. La portée et la chance reçues sont bornées (6 cases, 100 %).

**Les créatures.** Leur carte transporte son repli (regime_cerveau.js) ; après
avoir frappé, `choisirRepli` (ia_pure.js) les emmène vers la case la plus
éloignée de l'adversaire le plus proche, en évitant le contact et les zones
qui brûlent. Le générateur (monstres_competences.js) donne une affinité au
Repli selon l'archétype (8 pour un tireur ou un soutien, 1 pour un tank) et pose
parfois, chez ceux qui gardent leurs distances, un Repli juste après l'attaque.

**L'écran.** « ↩️ Repli ! » s'annonce, puis les pas du repli filent plus vite,
sans petit bond, en laissant sur chaque case quittée une ombre du pion qui
s'efface (mouvement.js, `laisserTraceRepli`). Une opportunité évitée dit
maintenant CE qui l'a évitée (le repli, la dérobade du Vargen, la parade…).

`repli.mjs` suit tout cela sur le vrai code — noyau, cerveau, IA, extraction
réelle de la carte, parcours du joueur jusqu'à l'intention envoyée (vrai clic),
écran, générateur — ; `migration_effets.mjs` vérifie la création de la fiche et
qu'un Repli réglé à la main n'est jamais écrasé. Morsures : chacun des fichiers
d'avant (mouvement_pur, cerveau_combat, ia_pure, moteur_effets, pont_combat,
monstres_competences, mouvement, regime_cerveau) fait tomber des contrôles.

### Le Bond placé après l'attaque saute enfin

Trouvé en construisant le Repli, qui avait le même problème. Une carte
« Attaque, puis Bond » visait, envoyait la carte au cerveau, PUIS demandait le
saut. Mais la carte clôt le tour de son lanceur : la demande de saut arrivait
sur un tour déjà passé, le cerveau la refusait (« c'est au tour de X ») et le
pion ne sautait jamais. Même remède que le Repli : la case d'atterrissage se
choisit avant l'envoi (`resoudreBondInteractif` avec `choisirSeulement`), voyage
dans l'intention de carte (`bond: { vers, portee }`), et le cerveau joue
l'attaque, le saut (`resoudreBond`, même géométrie qu'avant), puis la clôture.
Avec un Repli sur la même carte, le repli part de la case d'atterrissage. Le
Bond EN TÊTE de carte ne change pas : il se joue avant, pendant que le tour est
encore ouvert. `bond_apres_attaque.mjs` montre l'ancien refus, puis le nouveau
chemin dans le cerveau et dans le vrai parcours du joueur ; les anciens
cerveau_combat.js, moteur_effets.js et regime_cerveau.js y échouent.

### L'Aveuglement : quatre cases de noir

Deuxième effet demandé par Nico : « Aveuglement — coût 1 — Dextérité — 10 % de
chance (max 70 %) d'aveugler la cible, sur 2 tours. 4 hexagones autour de la
cible sont dans le noir : impossible d'y cibler un ennemi. » Précisions : les
4 cases sont tirées au hasard ; un monstre aveuglé ne choisit pas ce qui s'y
tient ; un joueur aveuglé voit un brouillard noir sur ces cases — lui seul — et
ne peut y viser ni ennemi ni allié ; une zone les touche quand même ; l'effet
dure son temps.

**La base.** EFF_AVEUGLEMENT est créé par la migration (`creer`), comme le
Repli : état « Physique », crans de 10 %, plafond 70 %, 2 tours. La Forge le
range avec les autres états (bouton ⏳ compris).

**La règle** (moteur_pur.js). L'état s'appelle « Aveuglé ». Quand il prend,
`tirerDesCarte` tire 4 directions parmi les 6 voisines (`tirerDirectionsAveugle`),
avec les autres dés : tous les postes voient le même noir, et les cartes sans
Aveuglement gardent exactement leur suite de dés. L'état retient des
DIRECTIONS, pas des cases : le noir suit l'aveuglé quand il bouge — c'est sa vue
qui est atteinte, pas le sol. Aveuglé de nouveau, le nouveau coup choisit un
nouveau noir. `casesDansLeNoir` / `estDansLeNoir` disent ce qui est caché.
C'est un état néfaste : la Purification peut l'ôter.

**Le joueur aveuglé** (moteur_effets.js). `ajouterCibleCiblage` refuse toute
cible — ennemi comme allié, attaque comme soin — qui se tient dans son noir
(« Dans le noir 🌫️ »), et aucun anneau de ciblage ne s'y dessine. Une zone,
elle, passe par `validerZoneAoE` et frappe ce qu'elle couvre. Le brouillard
(`dessinerBrouillardAveuglement`) n'est dessiné QUE pour les héros de l'appareil
(`COMBAT_PERSOS_JOUEUR`) : un noir épais qui ondule (turbulence SVG animée et
volutes), posé au-dessus des pions (z-index 20 contre 10), qui suit le pion et
s'efface avec l'état. Tout le monde lit « Aveuglé 🌫️ » quand l'état prend.

**Les créatures.** `choisirPosition` (ia_pure.js) pénalise les cases d'où sa
cible serait dans son noir (sauf carte de zone) ; `jouerCreature` refuse de
lancer une carte à cible unique sur ce qui est dans le noir et le dit
(« aveuglée : sa cible est dans le noir »). Le générateur range l'Aveuglement
parmi les états (limite de deux altérations par carte comprise) avec une
affinité de 7 pour les tireurs et les combattants au contact ; l'IA le compte
parmi les altérations (une illusion le refuse).

`aveuglement.mjs` suit tout cela sur le vrai code : tirage et pose, noir qui
suit, renouvellement, créature immobile qui renonce, créature libre qui se
place pour voir (vingt tirages sur vingt), zone qui frappe quand même,
extraction réelle (crans, plafond 70 %, ⏳), ciblage refusé (ennemi et allié),
anneaux, zone, brouillard chez l'aveuglé et pas ailleurs, générateur. Morsures
sur moteur_pur, moteur_effets, ia_pure, cerveau_combat, pont_combat,
monstres_competences et monstres_ia.

### L'Aveuglement revu : trois cases, fixes, point noir

Nico a tranché après le premier essai : le noir RESTE sur les cases de départ
(il ne suit plus l'aveuglé), il ne couvre que 3 cases, et le point de l'état
sur le pion est noir (#000000, libre jusque-là). L'icône de l'état sera fournie
plus tard : l'œil barré dessiné en SVG tient la place en attendant.

L'état « Aveuglé » ne retient donc plus des directions mais des CASES
(`casesDuNoir`, calculées autour de la case de la cible au moment où il prend) ;
`casesDansLeNoir` / `estDansLeNoir` ne dépendent plus de là où se tient
l'aveuglé, et le brouillard ne bouge plus quand il s'éloigne. Aveuglé de
nouveau, le nouveau noir se tire autour de sa nouvelle case.

Conséquence pour les créatures : puisque le noir ne se déplace plus avec elles,
changer de case ne rend pas visible une cible qui s'y tient. `choisirCible`
(ia_pure.js) écarte donc d'emblée tout ce qui est dans le noir (sauf carte de
zone) : la créature va vers ce qu'elle voit. La garde de `jouerCreature`
(cerveau_combat.js) reste en second rideau.

La migration sait maintenant remettre à jour une fiche déjà créée
(`majSiPresent`) : si le bouton avait déjà été pressé avec l'ancienne règle,
seules les Notes d'EFF_AVEUGLEMENT passent à « 3 hexagones… fixés » ; un
pourcentage réglé à la main dans le grimoire n'est pas touché.
`aveuglement.mjs` et `migration_effets.mjs` le vérifient (vingt tirages sur
vingt : Naomi, dans le noir, n'est jamais visée et la goule marche vers Ben) ;
morsures sur moteur_pur, moteur_effets, ia_pure, combat.js et app.js.

### Le rééquilibrage de Nico, suivi partout — y compris par les monstres

Nico a rééquilibré les techniques dans le grimoire : attaques et soins à 3 pour
2 PC, Absorption et Contre à 6 PC plafonnés à 60 %, Confusion 6 %/48 %,
Immobilisation 10 %/50 %, Peur 10 %, Poussée 15 %/60 %, Provocation plafonnée à
60 %, Étalement « Cout / 1.2 »… La base est lue en direct par la Forge ET par le
générateur de monstres ; ce qui ne suivait pas, c'était ce que le code écrivait
en dur :

- **les plafonds de chance** des états dans l'extraction de carte
  (moteur_effets.js) : Immobilisation, Confusion et Provocation restaient
  bloquées à 40 % en combat alors que la Forge annonçait 50, 48 et 60. Chaque
  plafond vient maintenant du Pourcentage max du grimoire
  (`plafondDuGrimoire`), l'ancien chiffre ne servant plus que de secours ;
- **la ristourne de l'Étalement** : la Forge (competences.js) et le générateur
  (monstres_competences.js) divisaient toujours par 1,3. Elle se lit dans le coût
  au grimoire (« Cout / 1.2 ») — `diviseurEtalement`, secours à 1,3.

**Le bouton « Mettre la BDD à jour » n'écrase plus l'équilibrage.** Sa règle
remettait le coût de l'Étalement à « Cout / 1.3 » et la Valeur du Bouclier à 25 :
ces deux champs ne sont plus touchés (seuls les textes et notes le sont).

**Contre et Absorption, vérifiés sur la vraie base** : chaque attaque réelle part
avec le bon type (légère et lourde en physique, magique et mots de pouvoir en
magique) ; le Contre annule sa part des dégâts physiques et renvoie 10 %, sans
toucher à la magie ; l'Absorption annule sa part des dégâts magiques et soigne de
10 %, sans toucher au physique ; un cran vaut la Valeur du grimoire (20 %),
plafonné à son Pourcentage max (60 %).

L'instantané de la base utilisé par les bancs (effets_reels.json) a été relu
depuis Firestore, en lecture seule. Sur 4 140 cartes de monstres générées avec,
le coût (fatigue, initiative, PC) est identique à celui de la vraie Forge —
`cout_reel.mjs`, qui fait désormais tomber la suite en cas d'écart (il ne
faisait que l'afficher). À budget égal, une technique de monstre frappe un peu
moins fort qu'avant (Normal : 7,9 → 6,4 dégâts de socle par carte ; Boss :
9,3 → 8,1) : c'est l'équilibrage voulu — une attaque rend 1,5 dégât par PC au
lieu de 2 —, le même pour les joueurs.

Bancs mis à jour pour la nouvelle base : `cout_et_tir.mjs` (valeur de l'attaque
lourde lue dans la base), `provocation.mjs` (le vrai `plafondDuGrimoire`, et un
grimoire à 60 %), `migration_effets.mjs` (Paralysie déjà partie, coût de
l'Étalement et Bouclier intacts). Morsures : l'ancien moteur_effets.js rebloque
trois plafonds à 40 % ; un générateur resté à 1,3 fait diverger 484 cartes.

### Pas de Persistance terrain sur un soin

Nico : « fais en sorte qu'on ne puisse pas mettre de persistance sur les soins.
Zone oui, mais grise la persistance. » C'est le contraire d'une règle posée
plus tôt (la nappe verte qui soigne), et il faut qu'elle tienne partout :

- **la Forge** (competences.js) : sur une action de Soin (ou Guérison),
  « Persistance terrain » apparaît grisée « (non compatible) » ; la Zone reste
  disponible, et rien ne change sur une attaque ;
- **le moteur** (moteur_pur.js, `creerZonePure`) : une nappe ne porte plus
  jamais de soin. Sans cela, une carte « Attaque + Persistance » avec un Soin sur
  une autre action laissait quand même une zone… qui soignait — l'ancien noyau
  donnait même la priorité au soin sur les dégâts pour le type de la zone. Une
  ancienne carte qui portait une persistance sur un soin ne laisse donc plus
  rien au sol ;
- **les monstres** (monstres_competences.js, `effetAutorise`) : le générateur ne
  pose pas de Persistance sur une action de soin.

`persistance_soin.mjs` rejoue le vrai bloc du menu de la Forge et le
générateur ; `zones_cerveau.mjs` (section 8) vérifie qu'un soin ne laisse pas de
nappe et qu'une carte attaque + soin ne garde au sol que ses dégâts. Morsures :
l'ancienne Forge laisse la persistance sélectionnable, l'ancien noyau crée une
nappe de soin.

### Pas de Persistance terrain sur un DOT

Nico, juste après : « Et fais aussi pas de persistance pour les dot. » Le DOT,
c'est l'Étalement (le mod « Durée étalement dégâts », que la Forge appelle aussi
DOT) : des dégâts qui ne tombent plus d'un coup mais en parts, une à chaque fin
de manche. Les reposer en plus en nappe au sol faisait payer deux fois la même
frappe, étalée dans le temps ET dans l'espace. Désormais une carte choisit :

- **la Forge** (competences.js) : dès qu'un Étalement est posé quelque part sur
  la carte, « Persistance terrain » apparaît grisée « (non compatible) » ; et
  dans l'autre sens, dès qu'une Persistance est posée, l'Étalement (DOT) est
  grisé. La règle regarde toute la carte, pas seulement l'action courante,
  parce que la persistance est un drapeau de carte et qu'un Étalement posé sur
  la Zone ou la Distance s'étend à tous les dégâts de la carte. La Zone, elle,
  reste disponible ;
- **le moteur** (moteur_pur.js, `creerZonePure`) : des dégâts étalés
  (`estEtalement`) n'entrent jamais dans une nappe. Une ancienne carte qui
  portait les deux ne laisse au sol que son état élémentaire, s'il y en a un —
  sinon rien ;
- **les monstres** (monstres_competences.js, `effetAutorise`) : le générateur
  refuse la Persistance sur une carte déjà étalée, et l'Étalement sur une carte
  déjà persistante.

`persistance_soin.mjs` (sections 5 à 7) rejoue le vrai bloc du menu de la Forge,
avec cette fois l'inventaire réel de la carte qui le précède, puis la vraie
fonction `effetAutorise` du générateur sur des chantiers construits à la main
(la génération aléatoire croise trop rarement les deux pour mordre à coup sûr) et
sur 30 fournées de Boss mages. `zones_cerveau.mjs` (section 8) vérifie qu'un DOT
ne laisse pas de nappe et qu'un DOT avec un état ne garde au sol que l'état.
`etalement_sans_degats.mjs` extrait le même inventaire. Morsures, fix par fix :
l'ancienne Forge laisse les deux sélectionnables (6 échecs), l'ancien noyau pose
une nappe de dégâts étalés (2 échecs), l'ancien générateur accepte les deux
(2 échecs).

### L'encart de tour figé, le bouton « ⚙ HUD » retiré

Nico a réglé l'encart à l'écran avec l'outil provisoire, sur une plaque de
740 px de large (écran 1366×1024), puis a renvoyé le code extrait : « c'est bon,
tu peux figer ça et virer le bouton HUD ». Ses nombres sont recopiés tels quels
dans `REGLAGES_HUD` (hud_disposition.js) : plaque 740 px ; fond décalé
(-1,5 ; 16) et ramené à 68 % ; médaillon plus grand (41 %) ; nom du combattant
passé en bas à gauche (-5 ; 85) ; technique au milieu (33 ; 46, police 3,6) ;
détail juste dessous (40 ; 53, police 2,1) ; ligne d'attente en bas
(39,5 ; 90, police 2,5).

L'outil part comme prévu d'un seul coup : `reglage_encart.js` et sa ligne dans
index.html sont supprimés. Les réglages qu'il gardait dans le localStorage de
l'appareil ne sont plus lus par personne : c'est le code qui fait foi.

`reglage_encart.mjs` devient `encart_fige.mjs` : il garde les contrôles du bouton
OK (petit, centré, sous la piste), vérifie que les neuf groupes du code sont
exactement ceux de Nico, puis MESURE à l'écran, en 1366×1024, que la plaque fait
740 px et que le nom, la technique, le détail et la ligne d'attente tombent à
leurs pourcentages ; enfin, qu'il n'y a plus ni poignée, ni boîte, ni fonction,
ni fichier, ni ligne dans index.html. Morsures : les anciens nombres font tomber
15 contrôles, l'outil remis en place en fait tomber 4. `hud_heros.mjs`, qui
rétrécit la plaque pour vérifier les proportions, la rend désormais à la
largeur réglée dans le code au lieu de 760 px écrits en dur.

### Glacé physique, œil d'or à 50 %, Traction en tête, repos long sans sablier, initiative

Six demandes de Nico d'un coup.

**Électrifié : vérifié.** Le noyau (`chaineDeDegats`, moteur_pur.js) ajoutait
déjà 20 % aux seuls dégâts MAGIQUES encaissés par une cible électrifiée ; rien
à changer.

**Glacé : +20 % sur le PHYSIQUE seulement.** La ligne de `REGLES_ETATS` passe
de `degatsSubis` (tous types) à une nouvelle clé `degatsPhysiquesSubis`, lue
uniquement pour un coup non magique. Gelé ET électrifié, un coup ne prend donc
plus jamais les deux : +20 % en physique par la glace, +20 % en magique par la
foudre. Les deux descriptions de l'état (moteur_effets.js) et la note de la
migration de la base (EFF_GLACE, app.js — à appliquer par le bouton, la base
n'est jamais écrite depuis ici) le disent. `moteur_pur.mjs` (section 18) et
`migration_effets.mjs` suivent ; morsure : l'ancien noyau fait 24 sur un sort
contre un corps gelé, et 28 gelé-électrifié.

**L'œil d'or à 50 %.** Les murs révélés passaient en noir à 85 % et cachaient
le décor. Ils sont maintenant à 50 %, comme le terrain difficile
(`OPACITE_REVELATION`, Plateau.js). Le pinceau du MJ garde son noir presque
plein, pour qu'on voie ce qu'on peint. `reveler_terrain.mjs` mesure les deux
(alpha 128 à l'œil, 0.85 au pinceau).

**Traction en premier, puis des dégâts.** Nico ne pouvait pas viser une cible
à 3 cases avec une carte « Traction, puis attaque » sans Distance. Deux trous :
le ciblage prenait comme « portée de la Traction » la portée de l'action (1 case
sans Distance), et le cerveau jouait de toute façon les attaques AVANT les états
— le drapeau `tractionAvantAttaque` était calculé et lu par personne. Désormais :
- l'extraction (moteur_effets.js) marque l'altération Traction `avantAttaque`
  (et `coupAPortee` hors zone) quand elle précède la première attaque, lui donne
  ses `cases` (Valeur du grimoire, 3), et la carte vise jusqu'à 3 cases ;
- le cerveau (resoudreCarte, moteur_pur.js) joue cette Traction EN TÊTE : il
  tire, puis frappe. Si le jet de traction rate ou que le chemin est bloqué, le
  coup de contact ne part pas à 3 cases (« Hors de portée ») ;
- l'IA des monstres (`analyserCarteMonstre`, monstres_ia.js) lit la même
  portée pour une carte qui tire en tête.
Traction APRÈS l'attaque (ou en sous-effet de l'attaque) : rien ne change, la
portée reste celle du coup. `traction_en_tete.mjs` vérifie le cerveau, le vrai
ciblage (3 cases oui, 4 non) et l'IA ; chaque fichier retiré fait tomber ses
contrôles (cerveau 2, extraction 3, IA 1).

**Repos long : plus de grand sablier à gauche.** Le panneau
`apercu-repos-long-ui` (sablier géant, « Repos Long », texte) est supprimé de
combat.js : la piste d'initiative affiche déjà ⏳ pour ce tour. La bannière du
repos long dans le volet des compétences, elle, reste.
`volet_competences.mjs` (section 5) vérifie qu'une fois le repos long retenu,
aucun sablier ni texte « Repos Long » n'est visible hors du volet.

**Initiative.** L'initiative d'une carte est ce qui reste de 100 après la
fatigue. L'Absorption était déjà « remboursée » ; la liste s'étend au Contre, à
l'Aveuglement, à la Brûlure, à l'Empoisonnement, au Glacé, à l'Électrifié, à la
Peur et à la Confusion (`window.MOTS_HORS_INITIATIVE`, competences.js ; même
liste dans `initiativeChantier`, monstres_competences.js). Ils coûtent toujours
leur fatigue, mais ne retardent plus la carte. `initiative_hors_effets.mjs` le
mesure sur la vraie Forge et sur le vrai générateur (morsures : 10 et 7
échecs), et `cout_reel.mjs` confirme que Forge et monstres tombent d'accord sur
4140 cartes. Les cartes déjà forgées gardent l'initiative écrite en base
jusqu'à ce qu'on les réenregistre dans la Forge.

### Monstres sans Traction au contact, encart sans état fantôme, opportunités à 6

**Pas de Traction sur une technique de monstre qui frappe au contact.** Règle de
Nico, posée dans `effetAutorise` (monstres_competences.js), dans les deux sens :
une carte « au contact » (ni Distance, ni arme qui tire — l'arc d'un archer
donne déjà sa portée) refuse la Traction si elle frappe déjà, et refuse
l'attaque si elle porte déjà une Traction. Une carte de pure Traction, ou une
carte à distance, garde le droit de tirer. `traction_monstres.mjs` vérifie la
règle à la main puis sur 1656 cartes du vrai générateur : 0 fautive, alors que
l'ancien générateur en fabriquait 127 (Estocade, Fracasse…), et il reste 72
Tractions légitimes. Les créatures déjà en base gardent leurs cartes jusqu'à
leur prochaine génération.

**Les états sous le portrait de l'encart.** Nico voyait son héros « en feu »
sous son portrait alors qu'il n'avait plus aucun état. La base, relue en
lecture seule, ne porte aucun état fantôme sur les personnages ; la cause
exacte n'a pas été reproduite. Deux choses sont corrigées côté écran : les
icônes passent par une seule fonction, `actualiserEtatsEncart` (combat.js),
relancée à chaque redessin du combat et à chaque mise à jour de la piste des
états du héros — l'encart et la piste lisent donc la même fiche au même
instant ; et un même état n'y compte qu'une fois (deux Brûlé donnaient deux
flammes). `encart_fige.mjs` (section 5) : une seule flamme pour deux Brûlé, et
elle disparaît dès que la fiche n'a plus d'état, sans rouvrir le tour.

**Les attaques d'opportunité tombent à 6 dégâts bruts** (10 avant) :
`DEGATS_OPPORTUNITE` (mouvement_pur.js), toujours sans armure, toujours arrêtés
par une esquive, une parade ou un bouclier. `mouvement_pur.mjs` (sections 6 et
8) et `repli.mjs` suivent.

### Les attaques d'opportunité deviennent 8 dégâts physiques, armure comprise

Nouvelle règle de Nico, qui remplace les 6 dégâts bruts : « 8 dégâts physiques
fixes (ne prend pas en compte les armes) — du coup l'armure rentre en compte ».
`DEGATS_OPPORTUNITE` vaut 8 et `degatsOpportuniteContre(cible)` (mouvement_pur.js)
applique la résistance PHYSIQUE de la cible, avec la même formule qu'un coup
physique ordinaire (pourcentage, arrondi). Ni l'arme ni les compétences de
l'attaquant n'y ajoutent rien ; la résistance magique n'y change rien ;
l'esquive, la parade et le bouclier jouent comme avant. `mouvement_pur.mjs`
(section 6) : 8 sans armure, 6 à 25 % d'armure, 0 à 100 %, 8 malgré 50 % de
résistance magique ; section 8 et `repli.mjs` suivent (60 → 52). Morsure :
l'ancien calcul fait tomber les contrôles de l'armure.

### Désynchronisation PC / iPads : le cerveau destitué écrasait le journal

Trace du PC (P_01) à la table : erreurs `ERR_QUIC_PROTOCOL_ERROR` sur les canaux
Listen et Write de Firestore, puis « 📥 29 MONSTRE_z6024he (20 étapes) »…
et « ▶️ 29 MONSTRE_z6024he (8 étapes) ». La même entrée n°29 a changé de contenu
entre sa réception et son rejeu : DEUX postes l'avaient publiée.

La mécanique : `publier` (depot_firestore.js) écrivait l'état et l'entrée par un
writeBatch « à l'aveugle ». Un poste qui perd le réseau continue de lire son
cache — qui le dit toujours cerveau —, calcule son pas et publie ; le SDK met le
lot EN ATTENTE et l'applique à la reconnexion. Entre-temps un iPad a constaté le
silence, repris la main et publié son propre n°29. À la reconnexion, le lot en
attente écrase l'entrée ET l'état (qui redit « le cerveau, c'est le PC ») : les
écrans ont rejoué deux n°29 différents, et la suite divergeait.

La correction : `publier` passe par `io.lotSousCondition` (app.js, sur
runTransaction), qui relit le document d'état AU MOMENT D'ÉCRIRE et n'écrit que
si ce poste tient encore le cerveau et que la base est exactement à la version
dont le pas est parti (v − 1). Une transaction ne se met jamais en attente hors
ligne : elle échoue, rien ne bouge, et le poste redevient spectateur dès que
l'écoute lui montre le nouveau cerveau. Le battement de cœur suit la même règle
(il ne bat plus au nom d'un cerveau destitué). Les autres bancs, dont l'accès
de test n'a pas `lotSousCondition`, gardent le lot simple.

`cerveau_destitue.mjs` simule deux postes sur une même base, dont un qui perd le
réseau comme le vrai SDK (cache, lots en attente, transactions refusées) : sans
la condition, la scène de la table se reproduit (entrée n°1 écrasée, état rendu
au PC) ; avec, le PC échoue proprement, l'entrée et l'état restent ceux de
l'iPad ; une publication depuis un état périmé, un numéro republié et un
battement d'ancien cerveau sont refusés. Morsure : l'ancien dépôt fait tomber 7
contrôles.

L'erreur `400 … documents:commit … failed-precondition` sur `Verrou_IA` dans la
même trace est autre chose, et sans gravité : c'est la réclamation du verrou de
préparation des créatures qui a perdu la course contre un autre poste ; la
transaction se relance d'elle-même (monstres_ia.js, `reclamerVerrouIA`).

### Zones à la forme de la map, créatures plus fines, opportunité propre, triche +1

**Les zones ont la forme des hexagones de la map.** La map (Plateau.js,
`hexToPixel`) pose des hexagones à bord plat en haut ; la carte en grand et le
choix de zone de la Forge (competences.js) et l'encart du tour
(`dessinZoneCarte`, combat.js) les dessinaient pointe en haut, avec l'autre
formule axiale : mêmes coordonnées, autre dessin. Les trois utilisent
désormais la formule de la map. `zones_geometrie.mjs` compare, sur la vraie
page, chaque hexagone dessiné au `hexToPixel` de la map (6 morsures).

**Pas d'Étalement des dégâts chez les créatures.** `effetAutorise` le refuse
toujours, et le patron « etalement » quitte les plans des archetypes (remplacé
par une frappe ou un état). `traction_monstres.mjs` (section 3) : 0 carte étalée
sur 1656 (194 avant).

**L'attaque d'opportunité : « -7 undefined ».** Le pont passait `montant` à
`jouerAnimationOpportunite`, qui lisait `degats` ; et l'étape de dégâts qui suit
affichait déjà « -7 ⚔️ ». L'annonce ne fait plus que l'annonce
(`annonceSeule`), et part enfin du bon pion (`attaquant`, pas `acteur`). Pas de
critique possible : `resoudreOpportunite` ne tire aucun dé de critique
(`mouvement_pur.mjs` le vérifie à 100 % de critique). Le « -7 » vu à la table
est bien 8 réduit par l'armure de la cible.

**Les créatures ne prennent plus d'attaque d'opportunité pour rien.**
`choisirPosition` (ia_pure.js) ne comparait que le NOMBRE d'ennemis au contact au
départ et à l'arrivée : ni le héros longé puis quitté en chemin, ni l'adversaire
lâché pour en coller un autre n'étaient vus, et une brute les ignorait tout à
fait. Désormais `opportunitesSurLeChemin` les compte pas à pas comme le moteur,
`casesAccessibles` garde pour chaque case le chemin qui en déclenche le moins,
et chacune coûte au moins `EVITE_AO_MINIMUM` (0,6) à tout caractère.
`ia_opportunites.mjs` : compte identique au moteur sur 2783 chemins, et 0
attaque « pour rien » sur 1080 situations (40 avec le plancher à zéro).

**Le malus de tir au contact des créatures : vérifié.** `tir_monstre_contact.mjs`
prépare une carte de créature comme le cerveau (vrai moteur_effets.js, grimoire
réel) : avec Distance, elle perd 30 % au contact. Découverte au passage : l'arc
d'un archer ne donne AUCUNE portée à une créature (la portée d'arme vient de
l'équipement porté) — sans Distance, sa carte est une attaque de contact. La
règle « pas de Traction au contact » ne fait donc plus d'exception pour les
archers.

**Les résistances et les états : vérifié.** La chance d'un état ne dépend que de
la carte (et du bonus des créatures) ; l'armure et les résistances ne jouent que
sur les dégâts. `moteur_pur.mjs` (section 30) : 100 % de résistances, mêmes
états posés jet pour jet sur 200 graines.

**La triche des créatures, +1 partout** (demande de Nico) : Petit 1, Normal 2,
Élite 3, Boss 4 (`TABLE_BONUS_MONSTRE`, moteur_pur.js). `moteur_pur.mjs`
(section 14) suit.

### Combat bloqué : le cerveau relisait l'état d'avant sa propre publication

Trace de la table : « 🧠 pas 62 publié », puis 70 ms plus tard « ❌ publication
du n°62 refusée » ; même chose au n°63 ; et après le n°65 (la carte d'un héros),
plus rien — la créature suivante ne jouait jamais.

C'est la conséquence de la correction précédente (la publication par
transaction, pour qu'un cerveau destitué n'écrase plus rien). Une transaction,
contrairement à un writeBatch, N'EST PAS recopiée dans le cache local : elle n'y
arrive qu'au retour de l'écoute. Le cerveau enchaîne ses pas sans attendre ; il
relisait donc l'état d'AVANT, recalculait le même pas et se le faisait refuser.
Et le blocage venait d'un second défaut, plus ancien : si l'état publié revenait
PENDANT que la boucle tournait encore, `tourner()` (regime_cerveau.js) ignorait ce
réveil ; la boucle finissait sur sa lecture en retard (« rien à faire »), et
personne ne la relançait — le battement ne relance qu'après une erreur.

Deux corrections, qui tiennent l'une sans l'autre :
- le dépôt (depot_firestore.js) garde en mémoire le dernier état qu'il a publié
  et les intentions qu'il a fermées. Une lecture qui rend une version plus
  ANCIENNE du même combat est simplement en retard : on lui préfère ce qu'on
  sait. À version égale, la base l'emporte toujours (c'est elle qui dit si un
  autre poste a repris la main) ;
- un réveil arrivé pendant un tour est noté (`reveilEnAttente`) et la boucle
  repasse dès qu'elle a fini, au lieu d'être jeté.

`cerveau_destitue.mjs` (sections 4 bis et 4 ter) simule un poste dont le cache
ne suit une transaction qu'à la livraison de l'écoute : le cerveau enchaîne
maintenant mouvement, fin de tour et tour de la créature (3 pas, aucun refus) ;
l'ancien dépôt se fait refuser dès le deuxième pas, comme à la table (4
morsures).

### La coupe du butin, et la réinitialisation des caractéristiques

**La coupe.** Nico : « quand le combat est gagné, mets une coupe sur le côté
gauche de l'écran ; un clic ramène aux fenêtres de butin en cours — si on les
quitte sans faire exprès, on peut y revenir. » La croix, Échap et le clic sur le
fond referment la fenêtre de butin pour ce poste seulement (le butin reste en
base) ; seul l'événement suivant la rouvrait. Une coupe 🏆 (loot.js,
`actualiserCoupeButin`) se montre dans la fenêtre de combat, à gauche, dès que
le combat est gagné, qu'un butin est ouvert et que sa fenêtre n'est pas à
l'écran ; un clic (`rouvrirButin`) lève le masquage local et rouvre l'étape en
cours. Elle se met à jour à chaque affichage du butin, à chaque fermeture locale
et à chaque redessin du combat. `clics_butin.mjs` (section 6 bis) la clique pour
de vrai : elle apparaît à la croix, tient à une notification, rouvre la fenêtre,
disparaît tant qu'un ennemi est debout et quand le butin est clos.

**Réinitialiser les caractéristiques.** Un bouton dans l'onglet DEV de la fiche
(`reinitialiserCaracsDev`, creation_personnage.js) retire, après confirmation,
le document Caracteristiques/<id> du héros et vide les caches qui le gardaient
(celui de la fiche, `CARACS_PARTIE`) : la fiche repropose « Créer les
caractéristiques », avec tous les points de départ. La nouvelle répartition
réécrit elle-même ce qui en découle (PV max, objets portables).
`dev_reinit_caracs.mjs` le vérifie sur la vraie page avec un Firestore bouchonné.

### Confusion en quatre jets, Électrifié fixe, butin 75/25, nouveaux prérequis

**La Confusion : quatre effets indépendants, chacun à 30 %** (règle de Nico).
Quand un confus lance une technique, quatre jets, dans cet ordre : il s'attaque
lui-même ; il attaque au hasard autour de lui (quelqu'un d'autre à portée de la
carte) ; il s'enfuit comme sous la Peur ; en fin de boucle, il n'est plus
confus. Les deux premiers peuvent sortir ensemble — la carte touche alors le
confus ET sa cible de hasard. Avant, un seul dé choisissait une seule bande
(20 % soi, 20 % hasard, 10 % dissipation).
- `appliquerConfusion` (moteur_pur.js) tire les quatre jets, détourne les
  cibles et note fuite et dissipation ; `resoudreCarte` annonce ce qui est
  détourné. Une carte sans attaque, ou sans personne à portée, revient sur le
  confus ; une poussée ne se retourne jamais sur lui.
- `suitesDeConfusion` (cerveau_combat.js) joue, après la carte, la fuite
  (`resoudrePeur`, loin de l'ennemi le plus proche ; tout ennemi quitté frappe,
  option `exempte: null`) puis la dissipation (`dissiperConfusion`) — pour un
  joueur comme pour une créature.
- Les dés ne sont tirés que si le lanceur est confus. La note de la base
  (EFF_CONFUSION) et la description de l'état suivent.
`confusion_cerveau.mjs` est réécrit : jets forcés, 6000 cartes (≈ 30 % chacun,
≈ 9 % pour deux à la fois : ils sont indépendants), cas particuliers, et le vrai
cerveau (la carte, la fuite, puis la dissipation, dans cet ordre ; une créature
confuse s'enfuit aussi).

**Électrifié : l'initiative retirée est fixe.** Le combat retirait déjà 35,
quelle que soit la mise ; c'est la Forge qui multipliait le chiffre par les
crans (« -105 » à 3 points). `formatterTexteEffet` le traite désormais comme la
distance de la Poussée : seule la chance monte (competences.js, et le même texte
côté créatures). `poussee_forge_avatar.mjs` le vérifie.

**Butin : 75 % d'armes, 25 % d'armures ou boucliers** (`PART_ARMES_BUTIN`,
objets.js ; c'était 60/40). `butin_loot.mjs` le mesure sur 3000 objets.

**Prérequis d'équipement** (objets.js) :
- 10 / 11 / 12 / 13 selon la rareté (c'était 0 / 10 / 12 / 12) ;
- une armure accepte plusieurs caractéristiques et UNE SEULE au prérequis suffit :
  légère = Intelligence ou Charisme, intermédiaire = Dextérité ou Sagesse,
  lourde = Force (`CARACS_ARMURE`, lu par type : les armures déjà portées suivent) ;
- l'équipement de départ n'a aucun prérequis (armes comprises, pour qu'un héros
  puisse porter ce qu'on lui donne), et l'armure de départ prend le plus bas de
  chacune de ses fourchettes.
Les messages de prérequis (fiche, butin) écrivent « Intelligence ou Charisme ».
Les objets déjà en jeu gardent le prérequis écrit à leur création.
`objets_tableau.mjs` (sections 5 et 7) le vérifie.

### Le choix de classe, après la race (architecture et base)

Nico : après le choix de la race, un panneau « Choix de Classe ». Pour
l'instant l'architecture et le lien avec la base ; les effets des classes
viendront après. Une condition de code : `object-fit: cover`, jamais `fill`.

- **Le parcours** : races → genre → **grille des classes** → **fiche de la
  classe** → « Choisir cette classe » → fenêtre d'identité, comme avant.
  `validerRaceEtGenre` (creation_personnage.js) ouvre désormais le choix de
  classe ; l'ancienne suite est devenue `ouvrirEtapeIdentite`, que la validation
  de la classe appelle. Si classes.js manquait (page en cache), la création
  passe directement à l'identité plutôt que de bloquer.
- **La grille** (classes.js, style.css) : 14 cartes de tarot au format 7:12,
  bordure dorée, rangées de 4 (2 sur un écran de téléphone), le nom en bas de
  chaque carte, le titre « Choix de Classe » en haut ; défilement vertical si
  l'écran est court.
- **La fiche** : l'image de fond de la classe en plein écran, un grand titre
  doré, le bouton de validation. Le bouton rond à la flèche coudée, coin haut
  gauche : de la fiche à la grille, de la grille à l'écran des races.
- **Les images** sont toutes en `object-fit: cover`. L'écran des races, qui
  étirait ses fonds (`fill`), passe aussi en `cover`.
- **La base** : collection « Classes » (Nom, Image_Tarot, Image_Fond, Ordre ;
  les effets s'y ajouteront). L'écran lit la base et, si elle est vide ou
  illisible, affiche la liste écrite dans classes.js — il ne dépend jamais du
  réseau pour exister. Le bouton « Installer les classes » des Paramètres
  recopie cette liste dans la base en fusion (rien d'ajouté à la main n'est
  écrasé). Le héros garde sa classe dans le champ « Classe » de sa fiche
  (`frontVersPersoDoc` / `persoDocVersFront`, app.js), transmis par la création
  complète et la création rapide.

`choix_classe.mjs` joue tout le parcours sur la vraie page : format 7:12,
rangées de 4, bordure, `cover`, nom en bas, fiche et fond, retour en deux temps,
validation vers l'identité avec la classe retenue, installation en base (14
documents, en fusion).

### Les cartes de classe sur toute la largeur, et l'étalement qui ne remise plus les effets associés

Nico : « que ça prenne toute la largeur de la page, les cartes quasiment
collées, les bordures un peu plus sombres, la barre de défilement invisible ;
le titre de la fiche au milieu de la partie gauche de l'image ; q_auto,f_auto
dans les liens des classes ; et l'Étalement des dégâts : la réduction de
fatigue seulement sur zone, dégâts, distance — pas les effets associés. »

- **La grille** (style.css) : plus de largeur maximale — 4 colonnes qui
  suivent la largeur de l'écran, 4 px de marge sur les côtés, 3 px entre deux
  cartes. La bordure passe de l'or vif (#d4af37) à un or plus sombre
  (#a8841f). Au survol la carte ne grossit plus (elle déborderait sur ses
  voisines désormais collées) : elle se soulève et s'illumine. Le nom en bas
  grandit avec la carte.
- **La barre de défilement** de la grille est masquée (`scrollbar-width: none`
  et `::-webkit-scrollbar`) ; le défilement au doigt et à la molette reste.
- **La fiche** : le titre est centré sur la moitié gauche de l'image (46 % de
  large, il passe à la ligne au besoin — « Chasseur de mages »). Le voile
  s'assombrit un peu à gauche pour qu'il reste lisible sur un fond clair.
- **Les images** : `q_auto,f_auto/` inséré juste après `/image/upload/` dans les
  28 liens de classes.js (Cloudinary choisit alors le format et la qualité selon
  l'appareil). Une classe DÉJÀ installée en base garde son ancien lien : la
  lecture (`classeDepuisDocument` → `optimiserImageClasse`) l'ajoute à la volée,
  sans toucher un lien qui l'a déjà. Recliquer « Installer les classes »
  réécrit de toute façon les liens propres. L'écran des races était déjà en
  `cover`, avec des liens optimisés.
- **L'étalement** (Forge, `rafraichirForge` ; générateur, `coutPCChantier`) :
  la division de la fatigue ne porte plus que sur l'attaque de base, la Zone et
  la Distance (avec leurs crans de durée). Les effets associés (états, Soin,
  Bouclier, Poussée…) se paient plein pot. Exemple : Attaque légère ×2 +
  Étalement + Brûlé ×2 coûtait 5,0 PC ; c'est 4 / 1,2 + 2 ≈ 5,3 PC.

`initiative_hors_effets.mjs` (section 1 bis) le mesure sur la vraie Forge ;
`choix_classe.mjs` vérifie la pleine largeur, l'écart ≤ 4 px, la teinte plus
sombre, l'absence de barre, le titre au centre de la moitié gauche et les liens
`q_auto,f_auto` (y compris un lien ancien relu depuis la base). Les nouveaux
contrôles échouent tous sur la version précédente.

### Illusions multiples, engagement fantôme, marche immédiate, triche baissée

Huit remarques de Nico après une partie.

- **Deux Illusions, deux endroits.** « Une compétence avec deux fois Illusion :
  il ne s'en est fait qu'une, ou deux au même endroit. » L'extraction ne
  retenait qu'un drapeau `isIllusion` : une seule pose, quel que soit le nombre
  d'Illusions. Elle compte désormais les leurres (`nbIllusions` : chaque action
  Illusion et chaque Illusion posée en mod), et `poserIllusions` les pose l'un
  après l'autre. Entre deux poses, la case du leurre tout juste posé n'est plus
  proposée : son pion n'est pas encore dans `PERSOS_PARTIE` (il arrive par
  l'écouteur), la case passait pour libre, le second leurre s'y posait et le
  cerveau le refusait. `illusions_multiples.mjs`.
- **La zone à distance 2 collée au lanceur.** La portée extraite était juste ;
  c'est la règle de l'ENGAGEMENT (un lanceur au contact d'un ennemi ne frappe
  qu'au contact) qui la ramenait à une case. Elle ne regardait que le statut
  « Mort ». Or un combattant tombé sous le cerveau est « Inconscient », à 0 PV,
  et son pion reste dans `TOKENS_VTT_DATA` — invisible, puisque le plateau ne
  dessine plus les tombés. Le monstre qu'on venait d'abattre au contact tenait
  donc encore le lanceur, sans qu'on voie pourquoi. Les cinq copies de la règle
  (cases posables, survol, clic, anneaux, cible unique) passent par une seule,
  `estEngageAuContact`, qui lit la même chose que la case occupée :
  `estCombattantMort` (statut Mort OU 0 PV). `engagement_tombe.mjs`.
- **Soin + Poussée.** Vérifié de bout en bout sans trouver de perte : le ciblage
  vise la Poussée puis le soin, l'intention porte les deux, le cerveau pousse
  quand le jet passe. Ce jet est de 15 % par cran (grimoire : Pourcent_Base 15,
  plafond 60), et une cible ennemie peut encore l'esquiver — à un cran, la
  Poussée échoue presque six fois sur sept (« Poussée résisté »).
  `soin_et_poussee.mjs` fige ce comportement.
- **Le déplacement démarre tout de suite sur iPad.** Le pion attendait le
  journal : demande en base, lecture par le cerveau (souvent un autre
  appareil), transaction, retour du journal — trois ou quatre allers-retours,
  plus lents encore sur Safari. `anticiperMarche` (mouvement.js) fait partir le
  pion dès la validation, sur l'écran de celui qui joue, pour les pas SÛRS :
  aucun ennemi debout au contact de la case quittée (pas d'attaque
  d'opportunité possible), aucune zone au sol sur la case d'arrivée, pas
  d'Immobilisation. Le cerveau reste seul juge : quand son journal arrive,
  chaque pas identique est reconnu et n'est pas rejoué (`consommerPasAnticipe`) ;
  au premier pas qui diffère, l'anticipation s'arrête et le journal reprend la
  main. En fin d'entrée (`surRejeu(null)`), ou au bout de dix secondes sans
  journal (demande refusée), le pion est remis sur la case que la base lui
  donne s'il n'y est pas. Les autres écrans rejouent le journal comme avant.
  `marche_anticipee.mjs`.
- **Dégâts des monstres et armures.** L'armure est bien lue (`defPhysiqueCombattant`,
  équipement compris, injectée au cerveau) ; mais c'est un POURCENTAGE, appliqué
  au brut triche comprise puis arrondi — sur un petit coup, il s'efface : 3 + 1
  de triche = 4, moins 5 % d'une armure légère = 3,8, arrondi à 4. D'où
  l'impression d'une armure ignorée. La triche baisse d'un cran partout, comme
  demandé : Petit 0, Normal 1, Élite 2, Boss 3 (`TABLE_BONUS_MONSTRE`).
- **Race et classe** en tête de l'onglet Statistiques de la fiche (deux
  tuiles), lues sur la fiche convertie ou le document brut ; un tiret pour un
  héros d'avant les classes.
- **Portraits au soleil.** Les prompts qui demandent le fond magenta (portrait
  du héros, PNJ, avatar habillé, pion) disent désormais que ce fond n'est qu'un
  cache technique qui n'éclaire rien, interdisent tout reflet, liseré, halo ou
  teinte violacé, rose ou magenta sur le personnage, et posent la lumière d'un
  soleil. `fiche_race_classe.mjs`.

### Une zone à distance se pose à sa pleine portée, même au contact

Nico, capture à l'appui : « tu n'as pas réglé le problème de distance sur une
attaque en zone : j'ai 3 de distance et je ne peux lancer qu'au cac ». Sa
lanceuse avait un orc DEBOUT au contact. Le correctif précédent n'écartait de
la règle de l'engagement que les ennemis tombés ; or c'est la règle elle-même
qui gênait : au contact d'un ennemi, elle ramenait toute zone offensive à une
case. Elle ne s'applique plus aux zones — ni chez les héros
(`casesPosablesZone`, survol et clic), ni chez les créatures (`choisirZone`,
ia_pure.js), pour que les deux camps jouent la même règle. Elle reste pour une
cible unique (anneaux, `ajouterCibleCiblage`), avec son malus de tir au
contact. `engagement_tombe.mjs` rejoue la carte de la partie (Attaque Magique,
Distance 3, zone de 7 cases, orc au contact) du clic à la zone posée à 3 cases ;
`zone_assombrissement.mjs` et `ia_pure.mjs` suivent la nouvelle règle.

### Le jet de d20 devient une scène

Nico : « la fenêtre s'assombrit en fondu pour tous les joueurs, avec l'avatar
en grand côté droit par-dessus tout ; un dé 20 au milieu de l'écran, des
chiffres qui défilent et s'arrêtent sur le bon, de moins en moins vite ; un
modificateur (+3) s'affiche en doré juste à côté et s'égrène — +2, le dé
grossit légèrement dans une lueur dorée et s'incrémente de 1 — pour tous les
+ ; enfin le résultat, avec des lueurs dorées qui dansent autour et sous le
dé. Un 1 : dé, chiffre et lueur en rouge ; un 20 (résultat initial) : tout en
violet. » Ses réponses : dé dessiné en code, rouge sur un 1 NATUREL, un malus
descend de la même façon, fermeture au toucher.

- **Le déclenchement ne change pas** : le clic sur le d20 d'une caractéristique
  écrit le jet dans la partie (`Action_Des`), et chaque poste joue la même
  scène avec la même valeur. Le jet porte maintenant `idPerso`, pour retrouver
  à coup sûr l'avatar du lanceur (repli sur le nom pour un jet ancien).
- **La scène** (`jet_d20.js`, style « LA SCÈNE DU D20 ») : voile en fondu,
  avatar (le portrait de la fiche) en grand à droite, au-dessus de tout
  (z-index 30000) ; au centre, un icosaèdre vu de face dessiné en SVG. Les
  chiffres défilent sur 22 intervalles qui s'allongent (38 → 368 ms, environ
  3 s), le dé tangue de moins en moins, puis se pose avec un rebond sur le
  résultat tiré. Le modificateur apparaît à côté : doré pour un bonus, gris-bleu
  pour un malus ; à chaque cran, l'étiquette perd 1, le dé grossit (ou rétrécit)
  dans une lueur puis reprend sa taille, et son chiffre gagne (ou perd) 1 ; au
  dernier cran, l'étiquette s'efface. Au résultat final, sept lueurs tournent
  autour du dé et une nappe de lumière pulse dessous.
- **Les thèmes** : tout (faces, chiffre, lueurs, modificateur) suit des
  variables CSS — or par défaut, rouge dès que le dé se pose sur un 1 naturel,
  violet sur un 20 naturel. Un 20 obtenu grâce au modificateur reste doré.
- **La fin** : un toucher ferme la scène une fois le résultat affiché (un
  toucher pendant le roulement ne coupe rien) ; sinon elle se ferme seule au
  bout de dix secondes. Le message du chat part au résultat final, depuis le
  seul poste qui a lancé (`posterJetDansLeChat`, app.js). L'ancien parchemin
  (rouleau, flash, leurs styles) est retiré.

`jet_d20.mjs` joue la scène dans la vraie page : fondu, avatar à droite, dé au
centre, chiffres qui défilent puis s'arrêtent, +3 égrené (12 → 13 → 14 → 15, le
dé grossit), −2 égrené (7 → 6 → 5, le dé rétrécit), lueurs finales, rouge sur
un 1 avec +2, violet sur un 20, doré sur un 20 obtenu par le bonus, fermeture
au toucher et d'elle-même, message du chat posté une seule fois et seulement par
le lanceur, et `idPerso` écrit par le lancer depuis la fiche.

Au passage : les copies locales de la base (`effets_reels.json`,
`gabarits_reels.json`, `persos_reels.json`, `joueurs.json` — non versionnées)
avaient disparu avec l'ancien conteneur. Elles ont été reprises en lecture
seule (`node tirer_effets.mjs <Collection> <fichier>` : Combat_Effets,
Monstres_Modeles, Personnages, Joueurs ; la clé de chaque effet est recopiée
dans son champ `id`). Deux bancs supposaient l'ancienne copie :
`gouttes_etat.mjs` (le héros Pliors n'est plus en base : il prend le premier
héros réel qui a une image) et `migration_effets.mjs` (la base est déjà migrée :
il repart d'une base sans Repli ni Aveuglement, et sa panne simulée tombe sur la
création du Repli, une écriture qui a forcément lieu).

### Le d20 chez tous les joueurs, ses sons, et les monstres hors des bulles du chat

- **Chez tous les joueurs** : c'était déjà le cas — le jet est écrit dans le
  document de la partie (`Action_Des`), que chaque poste écoute, et chaque
  poste joue la scène dès qu'un nouveau jet y paraît. `jet_d20.mjs` le prouve
  désormais : il ouvre l'écoute de la partie sur un poste qui N'A PAS lancé
  (`ouvrirChatbox`), lui livre le jet d'un autre poste, et la scène s'y ouvre
  et se déroule jusqu'au total — sans que ce poste-là poste le message du chat.
- **Les sons**, fabriqués sur place avec Web Audio (aucun fichier à héberger,
  `SONS_D20` dans jet_d20.js) : un « tic » sec à chaque chiffre qui défile,
  jamais tout à fait le même ; un coup sourd quand le dé se pose ; une note de
  cloche à chaque cran du modificateur (grave pour un malus) ; un accord au
  résultat — doré, sombre sur un 1 naturel, plus étrange sur un 20. Le volume
  suit « Interface » × « Général ». Safari n'ouvre le son qu'après un geste :
  le contexte audio se réveille au premier toucher dans le jeu, pour être prêt
  chez les joueurs qui n'ont pas lancé. L'ancienne boucle (`audio-roulette`) est
  retirée.
- **Les monstres dans les bulles du chat** : pendant un combat, la liste des
  combattants de la partie contient les créatures, et l'écoute de la partie la
  passait telle quelle à `afficherBullesPersonnages` — seuls les leurres étaient
  écartés. Le filtre vit maintenant dans la fonction elle-même, pour tous les
  appelants : ni créature, ni leurre, ni leur portrait au survol.

### L'Humain perd son bonus de repos long (et le garde sur sa jauge)

Nico : « enlève le bonus humain uniquement sur le bonus repos long, et dans le
jeu et dans la créa perso ». L'atout Humain ne porte plus que sa jauge plus
grande (`fatigueMax: 10`, soit 110 au lieu de 100) ; le `bonusReposLong: 10`
est retiré de `ATOUTS_RACES` (app.js). Comme l'Humain était le seul à s'en
servir, tout le mécanisme part avec lui : le champ ne voyage plus dans l'état
du combat (combat_etat.js) et `reposLongDuTour` (cerveau_combat.js) n'y ajoute
plus rien — un Humain récupère 35 % de sa jauge comme tout le monde, soit 38
sur 110 au lieu de 48. L'écran de création ne dit plus « +10 de fatigue
récupérée par repos long » ni que sa réserve « se renforce avec le repos » :
l'atout affiché est « Fatigue de base : 110 ».

`atouts_races.mjs` (section 7) joue le repos long d'un Humain et d'un Gob avec
la vraie table des atouts, le vrai état de combat et le vrai cerveau (30 → 68
et 30 → 65), et lit le texte de l'écran de création ; `cerveau_combat.mjs`
vérifie qu'un ancien `bonusReposLong` resté dans un état publié n'ajoute plus
rien ; `drapeau_regime.mjs` qu'aucun atout de race ne rejoint plus le repos
long. Les trois échouent sur l'ancien code.

### La Fabrique : dix sons d'interface dans les Paramètres

Nico : « dans les paramètres, crée-moi un bouton qu'on va appeler la Fabrique.
Dedans, dix boutons qui jouent un son quand on appuie — dix sons différents,
qui iraient bien pour les boutons de menu du jeu, les validations, etc. »

- **Le bouton** « La Fabrique » rejoint le menu des Paramètres (après Outils) ;
  il ouvre l'étape `etape-fabrique`, avec un bouton Retour vers le menu.
- **Les dix sons** (`fabrique_sons.js`, `SONS_FABRIQUE`), fabriqués sur place
  en Web Audio — aucun fichier à héberger : 1. Clic de menu (un petit coup de
  bois), 2. Effleurement (le survol), 3. Validation (deux notes qui montent),
  4. Grande validation (un arpège doré), 5. Retour (deux notes qui
  redescendent), 6. Refus (deux bourdonnements graves), 7. Ouverture de
  fenêtre (un souffle qui monte), 8. Fermeture (le même, qui redescend),
  9. Page de parchemin (le papier qu'on tourne), 10. Pièce d'or (deux
  tintements métalliques). Chaque bouton dit à quoi le son pourrait servir et
  s'illumine quand il joue. Le volume suit « Interface » × « Général » ; à
  zéro, l'écran le dit au lieu de rester muet sans explication.
- **Chaque son est une fonction (ctx, sortie)** : le même code joue en vrai et
  se rend hors ligne. Les boutons sont construits à partir de la liste ; en
  ajouter un, c'est ajouter une entrée. `jouerSonFabrique(n)` (1 à 10, ou
  l'identifiant) permettra de les poser ensuite sur les vrais boutons du jeu.

`fabrique_sons.mjs` ouvre la Fabrique dans la vraie page (depuis le menu des
Paramètres, dans l'écran de jeu), vérifie qu'elle se voit vraiment, clique les
dix boutons, puis REND chaque son hors ligne (OfflineAudioContext) : aucun
n'est muet, aucun ne sature, tous durent moins d'une seconde, aucun ne
ressemble à un autre (durée, hauteur mesurée sur les tranches audibles, force,
direction), la validation et l'ouverture montent, le retour et la fermeture
descendent, le refus est grave et la pièce d'or aiguë. Il vérifie aussi le
volume à zéro et le retour au menu.

### La Fabrique : dix « ding » de clic de menu

Nico, après écoute : « ça ne va pas, remplace tous ces sons par des exemples de
clic de menu sur un bouton — un léger ding, et des variations pour les dix
boutons ». Les dix sons de la première version (validation, refus, fenêtres,
parchemin, pièce…) sont remplacés par dix variations d'un même geste, bâties
sur une seule fonction `ding` (fabrique_sons.js) : une attaque minuscule (le
doigt qui touche) et une note claire qui s'éteint vite, dont les partiels
décident le timbre. 1. Ding clair (mi, le clic de base), 2. Ding doux (la,
rond, sans pointe), 3. Ding cristal (partiels de verre), 4. Ding boisé (court
et mat), 5. Ding double (do puis sol), 6. Ding feutré (le plus grave, étouffé),
7. Ding perle (le plus aigu, minuscule), 8. Ding clochette (qui tinte un peu
plus), 9. Ding écho (le ding puis son écho), 10. Ding scintillant (deux voix à
peine décalées qui miroitent).

`fabrique_sons.mjs` vérifie désormais que ce sont bien des dings : tous brefs
(moins d'une demi-seconde), légers (crête sous 0,5), qui frappent tout de suite
(crête dans les 80 premières millisecondes), avec une note entre 600 et 3 000 Hz,
tous différents ; le ding double monte (≈ 1 050 → 1 560 Hz, mesuré après
l'attaque), la perle est le plus aigu, le feutré le plus grave, la clochette
tinte plus longtemps que la perle.

### Le ding perle remplace le bruit de parchemin dans tout le jeu

Nico : « je choisis le ding perle ; remplace tous les bruits de parchemin
actuels dans le jeu par ce ding perle ». Le parchemin était un seul fichier,
`clik_bouton_aniy88.mp3`, chargé par deux lecteurs (`son-clic` et
`audio-survol-parchemin`, index.html) et joué par deux fonctions d'app.js :
`jouerSonClic` (tous les boutons du jeu, plus de deux cents appels) et
`jouerSonSurvolParchemin` (survol du menu latéral, ouverture et fermeture du
chat, fermeture du combat). Les deux jouent désormais le ding perle de la
Fabrique (`jouerSonFabrique`) ; le survol garde sa moitié de volume. Les deux
lecteurs et le fichier ne sont plus chargés. Le son du jeu tient dans une seule
ligne, `window.SON_CLIC_JEU = "ding-perle"` (fabrique_sons.js) : en changer,
c'est la changer. `jouerSonFabrique` accepte un facteur de volume, et le
contexte audio se réveille au premier geste pour qu'un survol sonne ensuite.

`fabrique_sons.mjs` (section 5) vérifie que le fichier n'est plus chargé, que
jouerSonClic et jouerSonSurvolParchemin jouent le ding perle (plein et
mi-volume), qu'un vrai bouton de la page et un vrai bouton du menu latéral
survolé le déclenchent, et qu'un volume nul le fait taire.

### L'expérience et les niveaux

Nico a donné la grille : niveau 2 à 700 XP, 3 à 1 200, 4 à 1 800, 5 à 2 500,
6 à 3 300, 7 à 4 200, 8 à 5 200, 9 à 6 400, 10 à 7 900, puis 1 500 de plus par
niveau. Les niveaux pairs (et tous ceux après le 10) donnent « +1 compétence »,
les 3, 5 et 7 un talent mineur, le 9 un talent majeur — les talents viendront
plus tard, la grille les annonce déjà dans la jauge.

Tout tient dans `experience.js` (script classique, chargé avant les modules) :
`xpPourNiveau`, `niveauDepuisXP`, `competencesDeNiveau`, `progressionXP`,
`xpDeLaCreature`, `afficherJaugeXP`. Le héros ne garde qu'un chiffre, son XP
TOTALE (champ `XP` de sa fiche Personnages) ; le niveau s'en déduit toujours,
jamais écrit à part : deux chiffres qui pourraient se contredire, c'est un de
trop.

**La jauge.** Sous l'en-tête de la fiche perso, au-dessus des onglets : le
niveau en grand, la jauge dorée (reflet qui passe) avec « 1 450 / 1 800 XP »,
et dessous ce qui attend au niveau suivant (« Niveau 4 dans 350 XP : +1
compétence »). Elle se remplit sur la tranche du niveau en cours, pas depuis
zéro. Elle se met à jour d'elle-même quand la fiche change en base (victoire,
triche).

**La triche (onglet DEV).** Deux flèches ▲ ▼ autour de « Niveau N » : elles
posent l'XP exacte du niveau voisin (jamais sous le niveau 1) et recomptent
les compétences à créer.

**Une compétence gagnée, c'est une compétence de plus à créer.** La Forge
permettait autant de créations que la limite en main (6, 7 pour un gobelin) ;
elle en permet désormais `CREATIONS_MAX_PERSO` = la main + les compétences de
niveau (« dont 2 gagnées au niveau 4 »). La limite en main, elle
(`CARTES_MAX_PERSO`, le « en combat »), ne bouge pas : on choisit ses cartes
parmi plus de techniques, on n'en tient pas plus.

**L'XP de la victoire.** La seconde image de Nico : chaque créature tombée
rapporte à CHAQUE membre de l'équipe son « XP pour le groupe » — Petit 40,
Normal 100, Élite 240, Boss 800, tous types confondus. Le bestiaire porte déjà
ce chiffre (`XP_Groupe`) ; à défaut, la grille selon le palier. Les leurres
(illusions) ne rapportent rien. Le total se calcule dans `demarrerButin` et
voyage DANS la transaction du butin (`Butin.xp`) : seul le poste qui l'écrit
distribue (`increment` sur le champ XP de chaque participant), le poste qui
perd la course n'ajoute rien — pas de double XP. Les participants sont ceux du
butin : les héros de l'équipe, y compris ceux tombés au combat. La fenêtre du
butin l'annonce : « ✨ +380 XP pour chaque héros ».

`experience.mjs` vérifie la grille (seuils, niveaux 11 et 12, compétences
gagnées), la jauge (niveau, 41,67 % pour 1 450 XP, texte, prochain gain, place
entre l'en-tête et les onglets, capture), les flèches (▲ 1 800, ▼ jusqu'à 0,
jamais sous le niveau 1, écriture sur la bonne fiche), la Forge (niveau 1 : 0
à créer ; niveau 4 : 2 ; niveau 11 : 6 ; la main reste à 6) et la victoire
(40 + 240 + 100 = 380, leurre exclu, chaque héros y compris le tombé, le poste
perdant n'écrit rien, la ligne du butin).

### La classe Nécromancien

Première classe à porter des effets. Nico : « Lvl1 : devient insensible au Gel
/ +1 compétence / +5 PV. Lvl5 : SKILL Ténèbres. Lvl10 : sa jauge de vie une
fois atteint 0 est bloquée et il dispose de deux tours avant d'être mis KO. »
Et, dans la fiche de la classe à la création, une brève présentation puis les
paliers.

**Les atouts de classe.** Ils vivent dans `app.js` (`ATOUTS_CLASSES`), palier
par palier, à côté des atouts de race, et s'ajoutent à la lecture comme eux :
rien n'est recopié dans la fiche. Le niveau vient de l'XP (`experience.js`).
Tout le jeu lisait déjà `atoutRace` (défenses, immunités, cartes en main,
combat) : c'est donc là que peuple et classe se rejoignent (`atoutPeuple` pour
le peuple seul, `atoutClasse` pour la classe seule). Les nombres s'additionnent,
les listes se rejoignent : un Gob nécromancien a 8 cartes, un Ondari
nécromancien est immunisé au feu ET au gel.

- **Niveau 1** : immunité au Glacé (le chemin de l'Ondari et du feu), +1
  compétence (en main et à forger, comme le Gob), +5 PV (`pvMaxCombattant`, par
  où passent désormais toutes les lectures de PV max de combat.js et de
  l'ancien moteur).
- **Niveau 5 : Ténèbres.** Un effet de base comme l'Attaque Magique (2 pts,
  Intelligence, 3 dégâts magiques). La défense magique réduit d'abord ; les
  dégâts vont ensuite à l'énergie (la jauge de fatigue) ; ce que l'énergie ne
  peut plus boire frappe les PV ×1,5, arrondi à l'inférieur
  (`partageTenebres`, moteur_pur.js). Le bouclier ne protège pas l'énergie, il
  n'absorbe que ce surplus. Étalée, ses parts attendent dans leur propre état
  (« Ténèbres étalées ») et suivent la même règle en fin de manche. À l'écran :
  « -3 ⚡🌑 » pour l'énergie bue, « -6 🌑 » pour le surplus.
  La fiche de l'effet (`EFF_TENEBRES`) est dans `MIGRATION_EFFETS` : le bouton
  « Installer Ténèbres » des Paramètres (l'ancien « Mettre la BDD à jour ») la
  crée une fois, sans jamais l'écraser ensuite. En attendant, le jeu en garde une copie en mémoire
  (`secoursLocal`). Elle porte `Classe` et `Niveau_Requis` : la Forge ne la
  propose qu'au Nécromancien de niveau 5 et plus (`effetAccessible`), et le
  générateur de monstres ne la pioche jamais.
- **Niveau 10 : le sursis.** Toutes les façons de perdre ses derniers PV (carte,
  renvoi du Contre, zone, attaque d'opportunité, poison, brûlure, étalement)
  passent désormais par une seule fonction, `tomber` (combat_etat.js). Un
  Nécromancien de niveau 10 qui n'a pas encore usé son sursis ne tombe pas :
  sa vie reste bloquée à 0, il reste debout, joue normalement, les coups sont
  ignorés (« Sursis 💀 ») et aucun soin ne le relève. Le sursis se décompte à
  la fin de chacun de ses tours (`cloturerTour`) ; au bout du second, il est
  mis KO. Un sursis entamé pendant son propre tour ne compte pas ce tour-là.
  Une seule fois par combat. Les étapes (`sursis`, puis `chute`) portent le
  résultat : le journal se rejoue à l'identique. La fiche porte le sursis
  (`estCombattantMort` ne le croit pas mort), et les créatures préfèrent une
  autre cible tant qu'elles en ont une.

Au passage : `fichesDepuisEtat` (pont_combat.js) recopiait le maximum CALCULÉ
dans `PV_Max`, qui était ensuite relu avec ses bonus : la retouche DEV (et
maintenant les +5 du Nécromancien) comptait deux fois. La fiche garde désormais
sa valeur de base.

**La fiche de la classe.** Quand une classe a un descriptif
(`DESCRIPTIFS_CLASSES`, classes.js), le titre monte sous le bouton retour, et
la moitié gauche reçoit la présentation puis les paliers (Niv. 1, 5, 10), sur
un voile plus sombre. Sur téléphone, le texte prend toute la largeur (marges de
16 px) et le bouton « Choisir cette classe » tient sur une ligne. Les autres
classes gardent leur fiche d'avant.

`necromancien.mjs` vérifie les paliers (niveaux 1, 4, 5, 9, 10), la fusion avec
les races, les PV et les cartes, l'immunité même sur un critique, chaque cas de
Ténèbres (énergie, surplus ×1,5, arrondi, bouclier, défense magique, rejeu,
étalement, affichage), le sursis (debout à 0, coups et soins ignorés, deux
tours puis KO, tour entamé, une seule fois, niveau 9, tics, rejeu), puis dans
la vraie page : le secours local, la Forge (niveau 5 oui, 4 non, autre classe
non), la palette des monstres, l'extraction d'une carte forgée, la fiche de
classe (placement, téléphone, captures) et la fiche en sursis.

### « Installer Ténèbres » : le bouton ne sait plus que créer

Nico : « Mettre la BDD à jour, j'ai modifié des trucs manuellement, ça va pas
m'écraser tous mes changements ? Fais en sorte que ça marche que sur
Ténèbres. » Il avait raison : le bouton réécrivait encore, s'ils différaient,
les textes de huit effets (Étourdi, Glacé, Électrifié, Confusion, Brûlé,
Poussée, Étalement, Bouclier), supprimait la Paralysie et remettait la note de
l'Aveuglement. Relu en lecture seule le 30 septembre, la base réelle aurait
perdu la note de la Brûlure retouchée à la main (« 8% de dégâts physiques des
PV max ») et vu celle de la Confusion remplie.

Ces anciennes réécritures (faites depuis longtemps) sont retirées. La table ne
contient plus que Ténèbres, et `appliquerMigrationEffets` ne sait plus que
CRÉER un effet absent : plus de suppression, plus de fusion dans un effet
existant. Un Ténèbres déjà en base — même retouché — est laissé tel quel. Le
bouton s'appelle désormais « Installer Ténèbres ».

`migration_effets.mjs` est réécrit pour le prouver sur une base qui porte des
retouches faites à la main : une seule écriture (Ténèbres), aucune suppression,
la base d'après égale à celle d'avant plus Ténèbres au caractère près, un
Ténèbres retouché jamais réécrit, un second passage qui n'écrit rien, une panne
qui se dit sans rien casser.

### Mise en page : le nom au centre, le niveau plus gros, les paliers centrés

Nico : « dans la fiche personnage, le nom du personnage en haut au milieu de la
fenêtre et un peu plus gros ; le niveau X un peu plus gros. Dans la création de
personnage, classe : le Niv. 1, 5 et 10 centré au-dessus, au milieu du
descriptif, et chaque boîte en mode centré. »

- En-tête de la fiche : le nom est centré (24 px au lieu de 18), coupé par des
  points de suspension s'il est trop long ; la croix sort du flux et reste
  dans le coin droit, pour ne pas décentrer le nom.
- Bandeau d'XP : « NIVEAU » passe à 16 px, le chiffre à 32 px.
- Fiche de classe : chaque palier est une boîte centrée (bordure dorée fine,
  liseré en haut), le badge « Niv. N » au-dessus, au milieu, puis le titre et
  les lignes, centrés, sans puces.

`experience.mjs` (section 2) mesure le nom (centré à 2 px près, 24 px) et le
niveau (32 / 16 px) ; `necromancien.mjs` (section 7) mesure chaque badge au
milieu de sa boîte, au-dessus du descriptif, et le texte centré.

### La surpuissance : une technique coûteuse frappe et soigne plus fort

Nico : « pour la création de compétence, un boost pour les dégâts et soins en
fonction du montant en fatigue : 70+ → ×1,25 ; 100+ → ×1,35 ».

La règle vit dans `app.js` (`PALIERS_SURPUISSANCE`, `multiplicateurSurpuissance`) :
70 de fatigue et plus donne ×1,25, 100 et plus ×1,35 (à la place, pas en plus).
Elle s'applique à l'extraction de la carte (`demarrerCiblage`, moteur_effets.js),
sur la valeur de la carte avant ce que l'équipement y ajoute, arrondie au plus
proche : dégâts (Ténèbres compris) et soins, jamais un bouclier ni une
purification. Les techniques des héros seulement : les créatures ne forgent pas
leurs cartes. Elle se lit sur la fatigue de la carte, donc une technique forgée
avant la règle en profite aussi.

À l'écran : la Forge annonce le palier sous la fatigue (« 💥 Surpuissance ×1,25 :
dégâts et soins (×1,35 dès 100) », ou le seuil à atteindre), et écrit sous
chaque dégât ou soin la valeur réelle (« → 26 de dégâts avec la surpuissance »).
La carte en grand ajoute une ligne « Surpuissance ×1,25 ». Le texte enregistré de
la carte garde la valeur de base : la ligne de surpuissance dit le reste.

`surpuissance.mjs` vérifie les paliers (69, 70, 99, 100), l'extraction (attaque,
soin, arrondi, bouclier inchangé, créature exclue), la Forge (annonce, valeur
réelle, capture) et la carte en grand.

### « No document to update » : une intention traitée avant d'être en base

Vu à la table (poste P_03, qui tenait aussi le cerveau) : un gros temps mort
après le choix d'une carte, et dans la console `RPC 'Commit' … not-found` puis
« le cerveau n'a pas pu publier — No document to update : …/Combat_Intentions/… ».

Firestore montre tout de suite à un poste ce qu'il vient d'écrire, avant que
la base ne l'ait reçu (compensation de latence). L'intention « carte » de P_03
est donc apparue dans son propre cache, et le cerveau — sur ce même poste — l'a
traitée aussitôt. Sa publication la marque « traitée » dans le MÊME lot que
l'état : l'intention n'existant pas encore en base, tout le lot a été refusé.
Le cerveau a réussi au passage suivant, une fois l'intention arrivée (environ
5 s plus tard ce soir-là : c'est la lenteur du réseau qui a fait le temps mort,
l'erreur n'en était qu'une conséquence).

Désormais l'adaptateur Firestore (app.js, `documentDuDepot`) marque un document
qui n'existe encore que dans le cache (`__pasEncoreEnBase`, d'après
`metadata.hasPendingWrites`), et `enAttente` (depot_firestore.js) l'écarte : le
cerveau attend que la base ait l'intention, puis `demander` le relance
aussitôt. Plus de publication ratée ni de message d'erreur. Le délai du réseau,
lui, reste le même.

`depot_firestore.mjs` (dernière section) vérifie le filtre, la lecture du dépôt
avant et après l'arrivée en base, et le drapeau posé par le vrai adaptateur.

### Persistance en zone, Distance réservée, armes qui bloquent des techniques

Trois demandes de Nico.

**La Persistance de terrain se pose comme une zone.** « Une compétence avec
par exemple 8 dégâts et persistance terrain doit pouvoir se lancer où on veut
au cac, sans faire de ciblage. » Sans mod Zone, une telle carte visait une
créature et la nappe naissait sous elle. À l'extraction (moteur_effets.js),
une carte de héros qui porte une Persistance sans Zone devient une zone d'UNE
case : au contact, l'une des six cases voisines (on tourne autour du lanceur,
comme une zone de mêlée) ; avec de la Distance, n'importe quelle case à
portée. Ce qui s'y trouve est frappé, et la nappe reste même sur une case vide.
Les créatures gardent leur façon de viser.

**Le sous-effet Distance** ne se pose plus que sur une technique d'arme
polyvalente, d'arme à distance ou de magie — ou, quelle que soit l'arme, sur
une action de soin (`armePermetDistance`, competences.js). Ailleurs il est
proposé grisé « (non compatible) ». Changer l'arme de la technique retire une
Distance devenue interdite (sauf sur un soin). Les techniques déjà forgées ne
sont pas modifiées.

**Une nouvelle arme peut bloquer des techniques.** La règle est celle du combat
(`raisonBlocageCarte`, objets.js) : `competencesBloqueesParArme` liste ce que
les armes en main empêchent. Après `equiperObjet` (loot.js) :
- une alerte nomme les techniques qui DEVIENNENT inutilisables (au joueur du
  héros seulement) ;
- elles sortent des compétences mémorisées (`retirerCartesBloqueesDuDeck`,
  écrit en base) ;
- la fiche ouverte se redessine : leurs bannières prennent le cadre grisé du
  combat (`banniere-epuisee`), la raison au survol, et on ne peut plus les
  remettre en main (« Arme inadaptée »).
Lâcher l'arme redessine la fiche : ce qu'elle bloquait redevient jouable.

`armes_et_zones.mjs` vérifie les trois : zone d'une case au contact et à
distance, nappe posée sur une case vide, cartes sans persistance et créatures
inchangées ; Distance proposée ou grisée selon l'arme et le soin, retirée au
changement d'arme ; l'alerte, le cadre grisé, le deck réécrit, le refus de la
remettre en main, et le dégrisage quand on lâche l'arme.

### Les deux tableaux de Nico (octobre) : ce qui était en rouge

Nico a envoyé ses deux classeurs (effets de combat ; armes et armures) avec en
rouge ce qu'il fallait changer. Ses réponses aux questions : l'armure réduit la
brûlure ; le poison passe en magique avec réductions ; le renvoi du Contre et
le soin de l'Absorption montent jusqu'à 30 % ; l'Illusion reste comme elle est.

**Effets de combat.**
- **Brûlé** (moteur_pur.js `REGLES_ETATS`, cerveau_combat.js) : -50 % de soins
  reçus et 8 % des PV max en dégâts PHYSIQUES à chaque fin de manche, armure
  puis bouclier appliqués. Elle faisait 3 dégâts du type du coup qui l'avait
  allumée ; elle ne retient plus ce type.
- **Empoisonnement** (`POISON`) : 10 % de l'énergie MAXIMUM et 8 % des PV max
  en dégâts MAGIQUES (défense magique, absorption, bouclier appliqués), une
  fois. Il prenait 15 d'énergie fixes et 8 % des PV droit dans la vie.
- **Contre / Absorption** (`partRendue`) : la part renvoyée (ou soignée) est la
  moitié de ce qui est annulé, plafonnée à 30 % : 20 % annulés → 10 %, 40 → 20,
  60 → 30. Elle était toujours de 10 %. Calculée avant l'armure, comme avant.
  Les cartes l'annoncent.

**Armes** (objets.js). Lance courte commune : +5 parade au lieu d'un dégât ;
Hache à deux mains très rare : +5 dégâts (l'épique garde +6). Le Gourdin (10 /
15 / 20 / 20 % d'étourdissement) et les Javelots épiques (15 % d'ignorer
l'armure), en rouge aussi, avaient déjà ces valeurs. Dans les effets bonus (les
colonnes K, L, M du classeur sont les réserves A, B et C, pas des effets
propres à chaque arme) : Poussée, Provocation et Traction à 15 %, initiative
+5 ; l'effet de soin « +10 % d'ignorer les résistances » est supprimé. Ces
valeurs valent pour les objets tirés désormais ; ceux déjà portés gardent les
leurs.

`tableau_objets.json` (la copie figée du classeur que relit
`objets_tableau.mjs`) porte ces cellules rouges ; `cerveau_combat.mjs` et
`moteur_pur.mjs` vérifient les nouvelles brûlure et empoisonnement ;
`tableaux_nico.mjs` vérifie chaque cellule rouge.

## La classe Hoplite (version 155)

L'Hoplite tient la ligne : il pare mieux, encaisse mieux, et à partir du
niveau 5 il gagne des techniques de classe qui s'ajoutent au deck du joueur
sans compter dans sa limite de compétences mémorisées.

**Paliers** (app.js `ATOUTS_CLASSES`, classes.js `DESCRIPTIFS_CLASSES`).
- Niveau 1 : +5 % de parade et +5 % de résistance physique.
- Niveau 5 : technique **Mur de bouclier**.
- Niveau 10 : technique **Rempart**.

**Techniques de classe** (app.js `TECHNIQUES_CLASSE`, `carteTechniqueClasse`,
`techniquesDeClasse`). Ce sont des cartes synthétiques (`CLASSE_MUR_BOUCLIER`,
`CLASSE_REMPART`), sans fatigue, utilisables une fois par combat. En combat
elles apparaissent après le deck, avant le Repos long, et se choisissent comme
une carte (elles prennent leur place dans la file à leur initiative : 100 et
105). Au moment de les lancer, elles remplacent le tour. Une fois servies,
leur bannière est grisée et le serveur les refuse (`c.techniquesUtilisees`,
étape `techniqueClasse`, intention `type: "classe"` dans cerveau_combat.js).

- **Mur de bouclier** : +60 % de parade sur l'Hoplite jusqu'à la fin de la
  manche où il est lancé (état « Mur de bouclier », durée 1).
- **Rempart** : sur un allié adjacent, pour 3 manches (état « Rempart » qui
  retient `idProtecteur`). Chaque coup qui touche cet allié (carte, zone,
  attaque d'opportunité) est coupé en deux attaques indépendantes : l'Hoplite
  prend la moitié arrondie au supérieur, l'allié le reste, chacun avec ses
  propres défenses (armure, bouclier…). L'Hoplite n'a pas de jet de parade
  sur sa moitié ; les altérations d'état ne touchent que l'allié. Les tics de
  fin de manche (brûlure, poison…) et les zones au sol ne sont pas partagés.
  Le Rempart dort quand les deux ne sont plus adjacents et se réveille dès
  qu'ils le redeviennent ; il s'arrête si l'Hoplite tombe
  (`protecteurRempart` dans moteur_pur.js, `infligerOpportunite` dans
  mouvement_pur.js). Au lancement, une petite fenêtre propose les alliés
  adjacents vivants.

**Fiche personnage** (competences.js `htmlTechniquesDeClasse`). Sous le
grimoire, un séparateur « Techniques de classe » liste les techniques de la
classe : celles acquises, et celles encore verrouillées (« Niveau N requis »).
Elles sont là pour information, on ne les sélectionne pas.

`hoplite.mjs` vérifie les paliers, les deux techniques (validation, durée,
usage unique, rejeu), le partage des coups (pair, impair, armure, critique,
états, éloignement, chute de l'Hoplite, opportunité, brûlure non partagée),
la section de la fiche, les bannières du volet de combat et le descriptif.

## Techniques de classe : les bannières des joueurs (version 156)

Les techniques de classe portent maintenant exactement les mêmes bannières
que les compétences forgées par le joueur, au lieu d'une carte dorée à part.

- **Fiche perso** (competences.js `htmlTechniquesDeClasse`) : sous la
  séparation « Techniques de classe », chaque technique est une bannière
  `banniere-carte` : cadre normal, couleur du héros, initiative et titre au
  même endroit. Une technique d'un palier pas encore atteint prend le cadre
  épuisé (grisé) et annonce « Niveau N requis » au survol. Un clic la met en
  avant et ouvre la carte en grand (`window.apercuTechniqueClasse`) ; le
  second clic, qui mémorise une technique forgée, n'existe pas pour elle.
- **En combat** (combat.js) : le titre n'a plus le bouclier 🛡️ ni la couleur
  dorée, il est identique à celui des autres bannières. Une fois servie, la
  technique garde le cadre épuisé.

Les styles `.technique-classe*` de l'ancienne carte sont retirés de
style.css. `hoplite.mjs` vérifie le cadre, la couleur et le nom des
bannières de classe, et qu'un double clic dans la fiche ne la mémorise pas.

## L'étalement remise aussi les soins (version 157)

Un soin pouvait déjà porter le sous-effet « Durée étalement dégâts » dans la
Forge, et le combat le jouait bien en « Soin étalé » (une part rendue par fin
de manche). Mais la ristourne de fatigue de l'étalement (« Cout / 1.2 ») ne
valait que pour les dégâts, la Zone et la Distance : un soin étalé coûtait
autant qu'un soin qui tombe d'un coup. Elle vaut maintenant aussi pour les
soins (competences.js `rafraichirForge`, `estPartEtalable` ; même règle
recopiée dans monstres_competences.js). Un bouclier n'est pas un soin et ne
s'étale pas ; les états posés à côté se paient toujours plein pot.

`initiative_hors_effets.mjs` vérifie : Soin ×2 = 4 PC, étalé 4/1,2 ;
étalé avec Brûlé ×2 : 4/1,2 + 2.

## La classe Assassin (version 158)

**Paliers** (app.js `ATOUTS_CLASSES`, classes.js `DESCRIPTIFS_CLASSES`).
- Niveau 1 : **Instinct du tueur** (`critiqueSurKO: 15`).
- Niveau 5 : technique **Assaut mortel**.
- Niveau 10 : **Maître des poisons** (`maitrePoisons`).

**Instinct du tueur** (combat_etat.js `tomber`, `recompenserLeTueur`). Quand
l'Assassin met un ennemi KO, il gagne l'état « Instinct du tueur » : +15 de
critique (`bonusEquip.critique`, lu par `critiqueDe`) pour 2 manches, celle du
KO et la suivante. Sans cumul : un nouveau KO relance la durée. Tout KO
compte : ses cartes, l'Assaut mortel, ses attaques d'opportunité, et les tics
de fin de manche de son poison, de sa brûlure ou de son étalement. Pour ça,
ces états retiennent qui les a posés (`idSource`, posé par `resoudreCarte` et
`empilerEtalement`), et `infligerTic` (cerveau_combat.js) le passe à `tomber`.
Un KO au tic arrive juste avant que les états vieillissent : l'état y naît
avec une manche de plus, pour valoir encore les 2 manches qui viennent. Un
allié abattu ou une illusion ne comptent pas.

**Maître des poisons** (moteur_pur.js `POISON_MAITRE`, cerveau_combat.js
`ticsDeFinDeManche`). Le poison posé par un Assassin de niveau 10 porte
`maitre: true` et dure 2 manches. Il remplace le poison ordinaire (10 % de
l'énergie max + 8 % des PV max, une seule fois) : 18 % de l'énergie max et
10 % des PV max à CHAQUE fin de manche, les 2 manches. La part des PV reste
des dégâts magiques (défense magique, absorption, bouclier). Il vaut pour tous
ses empoisonnements, cartes forgées et Assaut mortel.

**Assaut mortel** (technique `CLASSE_ASSAUT_MORTEL` : initiative 100, fatigue
0, une fois par combat). Il se vise comme une zone de deux cases au contact,
qu'on fait tourner autour de l'Assassin (`demarrerCiblage`, moteur_effets.js).
À la validation (`validerZoneAoE`), seuls les ennemis de la zone partent au
cerveau, en intention `classe` avec `cibles` ; une zone vide le dit et reste
ouverte. Le cerveau vérifie : un ou deux ennemis debout, au contact, côte à
côte s'ils sont deux. Puis il fabrique lui-même l'attaque à partir des seules
cibles (`actionAssautMortel`) : 10 dégâts physiques à chacun (esquive,
parade, armure et critique comme un coup ordinaire) et l'empoisonnement à
coup sûr, même sur une cible qui a esquivé (`malgreEsquive`). Des dégâts
trafiqués envoyés par un poste sont ignorés.

`assassin.mjs` vérifie les paliers, l'Instinct (coup, poison, étalement,
opportunité, durée, sans cumul, ni allié ni autre héros), le poison du maître
(chiffres, 2 morsures, défense magique, niveau 9 ordinaire), l'Assaut mortel
(validation, dégâts, poison malgré l'esquive, armure, niveau 10, rejeu), la
demande envoyée avec ses cibles, le ciblage de zone dans la vraie page, la
fiche perso et le descriptif.

## La classe Médicus (version 159)

**Paliers** (app.js `ATOUTS_CLASSES`, classes.js `DESCRIPTIFS_CLASSES`).
- Niveau 1 : **Régénération naturelle** : +5 % de régénération de fatigue en
  fin de manche (`regenFatigue`, lu par `regenerationCombattant` pour la fiche
  et par `regenerationDe` dans cerveau_combat.js), et +1 compétence comme le
  Nécromancien (`competences: 1`).
- Niveau 5 : technique **Soin d'urgence** (initiative 70, fatigue 0).
- Niveau 10 : technique **Prise en charge par Médicus** (initiative 0, fatigue 0).

**Soin d'urgence** (moteur_pur.js `resoudreTechniqueClasse`, `SOIN_URGENCE`).
12 PV à chaque allié debout, où qu'il soit, le Médicus compris. Les règles de
tout soin s'appliquent : l'Ethéré en tire 30 % de plus, une brûlure en mange
la moitié, jamais au-delà des PV max. Rien pour les KO, les illusions, ni pour
un Nécromancien en sursis.

**Prise en charge**. Le Médicus choisit (fenêtre du Rempart, combat.js
`lancerTechniqueClasse`, cible « allieKO ») un allié KO sur une case voisine.
Le cerveau vérifie qu'il est bien à terre, de son camp et adjacent. L'allié se
relève (étape `reanimation`, applicateur dans combat_etat.js) avec 30 % de ses
PV max arrondis au-dessus, ses états effacés, sur sa case, ou sur la case
libre la plus proche si quelqu'un s'y tient (un KO libère sa case). Puis
chaque ennemi qui l'entoure recule d'une case à l'opposé, comme une Poussée :
un mur ou un pion l'arrête (« Poussée bloquée »), une nappe au sol s'applique.
Sans allié KO à côté, rien ne part : la technique n'est pas consommée.

**Retour dans le jeu**. Un KO entre dans `Combattants_Hors_Jeu` (qui décide
qui doit choisir sa carte en préparation). `synchroniserCombattantsHorsJeu`
reçoit maintenant aussi les combattants que le cerveau dit debout
(regime_cerveau.js) et les en retire : l'allié relevé choisit sa carte et
rejoue à la manche suivante, même si la fiche locale le dit encore à zéro.

**Les fantômes** (combat.js `voitLeFantome`, `fantomeAllieKO`). Le pion d'un
KO disparaît du plateau, pour tout le monde. Seul le poste qui commande un
Médicus voit, sur leur case, les alliés tombés de son camp, à 20 % d'opacité,
en gris, impossibles à cliquer : c'est là qu'il doit aller pour les relever.

`medicus.mjs` vérifie les paliers et la régénération, le Soin d'urgence
(brûlure, Ethéré, plafond, sursis, KO, ennemis, rejeu), la Prise en charge
(validation, 30 % arrondi, états, recul, mur, case occupée, rejeu), la
fenêtre de choix, les fantômes, le retour hors des hors-jeu, la fiche et le
descriptif.

## La classe Chasseur de mages, et plus de boutons d'installation (version 160)

**Paliers** (app.js `ATOUTS_CLASSES`, classes.js `DESCRIPTIFS_CLASSES`).
- Niveau 1 : **Peau de traqueur**, +10 % de résistance magique (`defMagique`).
- Niveau 5 : l'effet de combat **Lumière** dans la Forge (`effets: ["EFF_LUMIERE"]`).
- Niveau 10 : **Éclat aveuglant** (`lumiereAveugle: 30`).

**Lumière** (`EFF_LUMIERE`, copie locale dans app.js `MIGRATION_EFFETS`). Un
sous-effet rangé dans les menus Magique et Physique de la Forge : 1 pt,
Intelligence, 15 % par cran, 60 % au plus. Réservé au Chasseur de mages dès le
niveau 5, jamais pioché par les monstres. Il ne se pose que sur une action à
dégâts magiques (Attaque Magique, Mots de pouvoir, Ténèbres) ; ailleurs, il est
grisé « non compatible » (competences.js `actionADegatsMagiques`).
L'extraction (moteur_effets.js) donne à l'attaque magique sa
`chanceLumiere`. Au lancement, `tirerDesCarte` (moteur_pur.js) tire un jet par
cible (un critique l'impose) ; s'il prend, ce sort passe outre la défense
magique de la cible (`percee`) : bouclier et absorption comptent toujours. Une
carte sans Lumière ne tire pas un dé de plus.

**Éclat aveuglant**. Pour un Chasseur de niveau 10, chaque cible d'un sort de
lumière tire aussi un jet de 30 %. S'il prend, et si la cible est touchée
(pas d'esquive), elle est aveuglée, ainsi que tous les ENNEMIS qui la touchent
(pas les alliés, pas le Chasseur). C'est l'Aveuglement normal : 2 manches,
3 cases de noir tirées autour de chacun avec les autres dés, immunités
comprises. L'écran dit « ☀️ Éblouis ! ».

**Plus de boutons d'installation.** Les boutons « Installer les effets de
classe » et « Installer les classes » sont retirés des Paramètres, avec
`appliquerMigrationEffets` et `installerClasses`. Le jeu n'écrit plus rien dans
le grimoire ni dans la collection Classes. Ténèbres et Lumière vivent en copie
locale (`completerEffetsDeSecours`) : si la base en a une version, même
retouchée à la main, c'est elle qui compte.

`chasseur_de_mages.mjs` vérifie les paliers, Lumière (défense ignorée, jet
raté, critique, coup physique, aucun dé de plus), l'aveuglement (cible et
ennemis voisins, pas l'allié, jet raté, esquive, immunité, niveau 9), la Forge
(classe, niveau, menus, compatibilité, extraction, plafond) et le descriptif.
`migration_effets.mjs` vérifie que les boutons sont partis et que la copie
locale ne remplace jamais la base.

## Des tenues variées pour les skins d'armure (version 161)

L'IA d'images dessinait toujours la même « tunique de lin » et la même
« cuirasse de bronze ». Avant chaque illustration, une tenue est maintenant
tirée au sort pour chaque armure (variations_tenues.js) :

- **Les listes** (`VARIATIONS_TENUES`) : 34 tenues par type d'armure (légère,
  intermédiaire, lourde), écrites à la main. On y trouve la Grèce et Rome, la
  Perse, l'Égypte, les steppes scythes et sarmates, les Étrusques, les
  Phéniciens, Carthage, Babylone, les Hittites, les Gaulois… et l'Antiquité
  fantastique (Atlantide, Tartare, champions d'Héphaïstos ou de Poséidon).
  Chacune décrit une tenue complète : culture, coupe, pièces, ornements.
  Aucune ne porte de casque ni de coiffe (l'équipement de départ garde le
  visage découvert) ni de pièce médiévale.
- **Les palettes** (`PALETTES_TENUES`) : 16 accords de couleurs, tirés en plus
  de la tenue, pour que la même tenue ne revienne jamais sous les mêmes teintes.
- **Le tirage** (`tirerVariationsTenues`) : jamais deux fois la même tenue dans
  un lot ; les 12 dernières tirées sur l'appareil, par type, passent leur tour
  (`localStorage`, sans risque s'il est indisponible). Une armure qui a déjà
  sa tenue la garde ; les armes n'en reçoivent pas.
- **L'envoi** (objets_ia.js) : `illustrerLesObjets` tire les tenues avant tout.
  La tenue part à MIA_Objets (`variation_imposee`, qu'elle doit suivre
  fidèlement) et directement au dessinateur (« DIRECTION ARTISTIQUE DE CETTE
  TENUE »), même si MIA n'a rien pu décrire.
- **Le gris (Commun)** : une armure commune est simple et sobre, mais propre,
  entière et bien entretenue, jamais déchirée, rapiécée ni miteuse. C'est dit
  à MIA (qui écrivait « simple, usé ») et au dessinateur.

Ça vaut pour le butin, l'équipement de départ et toute armure illustrée.
`tenues_variees.mjs` vérifie les listes, le tirage et ce qui part aux deux IA.

## Le moteur périmé après un déploiement : la carte des imports (version 162)

**Le symptôme.** « Assaut mortel n'a rien fait du tout », « Soin d'urgence non
plus ». La trace montrait la technique acceptée par le cerveau et notée comme
jouée, puis… rien : 2 étapes (la technique, la fin du tour), là où le moteur
actuel en produit une dizaine.

**La cause.** index.html charge `regime_cerveau.js?v=33`, mais celui-ci
importe `./cerveau_combat.js`, qui importe `./moteur_pur.js`, etc. SANS numéro
de version. Le navigateur chargeait donc chaque module du moteur DEUX fois :
une fois par sa balise (`?v=`), une fois par l'import (sans `?v=`), et c'est
le second exemplaire que le cerveau utilisait. Cette adresse sans version
restait en cache après un déploiement. Comme la page se recharge toute seule
dès qu'une version sort (mise_a_jour.js), on obtenait l'interface neuve avec
un moteur ancien : des techniques connues de l'interface mais pas du moteur.
C'est aussi un candidat sérieux pour « sur PC ça bloque, sur iPad non ».

**La correction.** Une carte des imports (`<script type="importmap">`, dans
index.html, avant tout module) renvoie chaque import interne vers la même
adresse versionnée que sa balise `<script>`. Un seul exemplaire de chaque
module, toujours à jour. **À chaque montée de `?v=` d'un module du moteur,
monter aussi son entrée dans la carte** : `versions_modules.mjs` vérifie
qu'elles sont identiques, que tout import interne y figure, et, dans la vraie
page, qu'aucun module n'est demandé sans `?v=` ni chargé deux fois.

**Aussi dans cette version.**
- Une technique de classe jouée se grise dans le volet même s'il était déjà
  ouvert : `actualiserBannieresEpuisees` (combat.js) relit
  `techniquesUtilisees` sur la fiche à chaque rafraîchissement, au lieu de
  ne le lire qu'au dessin du volet.
- Le bandeau « Sélectionner une compétence / En attente des joueurs » descend
  en bas de la fenêtre (`bottom: 24px`), il ne couvre plus la piste
  d'initiative (titre_preparation.mjs).

## Le couvre-chef des armures, et le récapitulatif des caractéristiques (version 163)

**Le couvre-chef** (variations_tenues.js `COUVRE_CHEFS`). 30 couvre-chefs par
type d'armure : casques (corinthien, attique, béotien, galea, cataphracte…),
chapeaux (pétase, tholia, kausia…) et coiffes (bonnet phrygien, némès, tiare
perse, couronnes de laurier ou d'asphodèles…). Le tirage des tenues
(`tirerVariationsTenues`) en donne un à chaque armure du butin (`casque`),
jamais deux fois le même dans un lot, et jamais à l'armure de départ d'un
héros (option `sansCasque`). Un casque qui couvre le visage se porte relevé.
- **Dessiné sur l'armure** : MIA_Objets le décrit (`couvre_chef_impose`) et le
  dessinateur le pose au sol avec la tenue, vide (`promptImageObjet`).
- **Gardé sur l'objet** : il est écrit avec l'image dans le butin, la réserve
  ou l'armure portée (`extraImageObjet`, `poserImageObjetEnBase`,
  `poserImageDansLaReserve`), pour que la question puisse être posée plus tard.
- **À l'équipement** (loot.js `equiperObjet`, `demanderCasque`), dans le butin
  comme ailleurs : une fenêtre demande « Avec le couvre-chef » ou « Tête
  nue ». Le choix part avec l'armure équipée (`casquePorte`).
- **Le portrait** (objets_ia.js `promptAvatarArmure`) : il repart toujours du
  portrait de référence, tête nue, et ajoute le couvre-chef seulement si le
  joueur l'a choisi, visage visible ; sinon la tête reste nue, même si l'image
  de l'armure montre un casque.

**L'onglet Caractéristiques** (app.js `afficherStatsFinales`). Le bandeau des
PV max est remplacé par le récapitulatif des six caractéristiques, avec leur
modificateur. Les PV restent dans l'onglet Statistiques. `caracAvecBonus`
ajoute à la base les bonus de race ou de classe (atout `caracs`) et
d'équipement (bonus de même clé : `force`, `dex`…), et le récap affiche
« dont +N » quand il y en a. Aujourd'hui aucun atout ni objet n'en donne :
la valeur affichée est la base.

## Le couvre-chef : la question à chaque armure (version 164)

Précision de Nico : chaque armure est dessinée avec son couvre-chef, et la
question se pose au moment d'équiper, c'est tout. `equiperObjet` (loot.js)
ouvre donc la fenêtre pour TOUTE armure, même une ancienne sans couvre-chef
enregistré sur l'objet (le texte devient alors « équiper aussi son
couvre-chef (casque, chapeau, bandeau…) ? »). Les armes ne demandent rien.
`promptAvatarArmure` ne regarde plus que le choix (`casquePorte === true`) :
« Tête nue », ou l'armure de départ qui n'a pas de choix, donne un portrait
explicitement SANS couvre-chef.

## Les bonus de race et de classe, dans l'onglet Statistiques (version 165)

Sous la grille des statistiques, un encart à part détaille ce que la race et
la classe du héros lui donnent (`htmlBonusRaceClasse`, app.js, rempli par
`afficherStatsCombat`, creation_personnage.js) :
- **la race**, d'un bloc (`atoutPeuple`) ;
- **la classe**, palier par palier (`paliersDeClasse`), avec son niveau ; un
  palier pas encore atteint est grisé et marqué « à venir ».

Chaque atout est écrit en clair par `texteAtout` (« +3 % d'esquive »,
« Insensible : Glacé », « Technique : Mur de bouclier », « Effet de combat :
Ténèbres », « Instinct du tueur : … »). Un atout inconnu se montre tel quel
(« clé : valeur ») plutôt que d'être caché ; `bonus_race_classe.mjs` vérifie
qu'aucun des atouts existants n'en est réduit là.

## Le bandeau de préparation, un peu à gauche (version 166)

« Sélectionner une compétence / En attente des joueurs » reste en bas de la
fenêtre, mais centré sur les 78 % de gauche de l'écran (`right: 22%` sur
#titre-preparation-zone, index.html) : il s'éloigne de la jauge en bas à
droite. titre_preparation.mjs vérifie que son milieu est avant celui de
l'écran.

## Le cerveau voit ses propres intentions (version 167)

Le bug de la table : le joueur qui tenait le cerveau déplaçait son héros, le
pion avançait puis revenait à sa case (« téléporté ») ; le second déplacement
débloquait le premier puis était refusé (« chemin discontinu »), et la
technique choisie ensuite n'était jamais jouée — combat figé.

Une intention écrite par un poste arrive dans SON cache marquée « pas encore
en base » (`hasPendingWrites` → `__pasEncoreEnBase`), et `enAttente` l'écarte.
Mais Firestore garde ce marqueur après avoir accusé réception, et l'écoute
n'était pas prévenue quand seul ce marqueur changeait. Trois chemins, désormais :
- `demander` (regime_cerveau.js) appelle `depot.confirmer(id)` dès que `lot`
  est résolu : l'écriture est en base, le marqueur ne compte plus pour elle
  (`marquerConfirmees`, depot_firestore.js) ;
- l'écoute des intentions demande les changements de métadonnées
  (`ecouterCollection(..., { metadonnees: true })` → `includeMetadataChanges`,
  app.js) : quand le marqueur tombe, le cerveau repart ;
- le battement compte aussi les intentions encore « en route » dans
  `intentionsEnAttente`, et relance le cerveau si les deux premiers ratent.

intention_confirmee.mjs le rejoue avec un Firestore de banc qui garde le
marqueur après `lot`, et ne prévient que les écoutes « métadonnées comprises ».

## Les jauges du pion sélectionné (version 168)

Un pion sélectionné sur le plateau montre, juste sous lui, sa vie (rouge) et
sa fatigue (jaune), aux teintes des jauges du bandeau (`poserJaugesSelection`,
combat.js ; style `.jauges-selection-token`). Tout est en % du pion : elles
suivent le zoom sans calcul. Elles sont gardées d'un redessin à l'autre (même
élément) : la barre glisse vers sa nouvelle valeur.

Le pion de CE poste les replie en fondu (0,45 s) dès son premier pas
(`replierJaugesSelection`, appelé par `jouerAnimationPas`, mouvement.js) ;
elles restent repliées jusqu'à ce qu'on le sélectionne de nouveau. Le pion
d'un autre (une créature surveillée) les garde et les emmène avec lui.
jauges_selection.mjs le vérifie sur la vraie page.

## L'Assaut mortel sur la case d'un mort, et les refus rendus au joueur (version 168)

Le bug de la table : la zone de l'Assaut mortel couvrait un ennemi vivant ET la
case d'une créature tombée plus tôt (pion plus dessiné, case encore dans les
Tokens). Le cerveau refusait tout (« … n'est pas un ennemi valable ») et la
partie restait figée : le repère « demande en cours » du poste ne tombait
jamais, puisque la file n'avançait pas.
- la boucle de zone (moteur_effets.js) écarte `estCombattantMort` ;
- le cerveau retire les combattants à terre ou disparus des cibles de
  l'Assaut (`ciblesDeLAssaut`, cerveau_combat.js) et joue le reste ;
- le poste qui envoie une intention l'écoute jusqu'à ce qu'elle soit traitée
  (`suivreLaReponse`, regime_cerveau.js) ; refusée, `surRefus` fait tomber le
  repère (`regimeAnnulerDemande`) et `surRefusIntention` (combat.js) affiche
  la raison au-dessus du pion et redessine le bouton de fin de tour.
assaut_cible_tombee.mjs le vérifie.

## Enchaîner les combats sans recharger : les techniques de classe reviennent (version 169)

Signalé : l'Assaut mortel, joué au combat d'avant, restait grisé pendant tout
le combat suivant (page non rechargée). Les techniques jouées descendent sur
les fiches en mémoire (`techniquesUtilisees`, fichesDepuisEtat) et y restaient.
- `techniqueClasseUtilisee` (combat.js) lit d'abord l'état du combat en cours
  (`regimeDemande.etat()`, regime_cerveau.js) ; un état d'une autre rencontre
  (`etat.combat` ≠ `PARTIE_DATA.ID_Rencontre`) n'a rien joué de celle-ci. Le
  volet (chargerCompetencesCombat) passe par la même lecture.
- `oublierLeCombatSurLesFiches` vide techniques jouées et sursis des fiches ;
  appelé par `regimeFermerLeCombat` (réinitialisation) et à l'ouverture d'une
  nouvelle rencontre.
techniques_nouveau_combat.mjs le vérifie sur la vraie page.

## La classe Vampire (version 170)

Paliers (ATOUTS_CLASSES["Vampire"], app.js) :
- **Niveau 1** : `defPhysique: 10` ; `brulureAggravee` — brûlé, il perd
  -60 % de soins reçus et 18 % de ses PV max par manche au lieu de -50 % et
  8 % (`BRULURE_AGGRAVEE` ajoutée par `regleDesEtats`, moteur_pur.js ; le tic
  de fin de manche lit `regleDesEtats(c, "pvMaxParTour")`) ;
  `premierPasGratuit` — la première case de chacun de ses tours ne coûte rien,
  même sur sol difficile ou Glacé, et compte dans le barème (`coutDuPas`,
  mouvement_pur.js ; même règle dans l'aperçu de mouvement.js).
- **Niveau 5** : l'effet **Vampirisme** (EFF_VAMPIRISME, MIGRATION_EFFETS) —
  une action de base comme Ténèbres : 1 pt, Intelligence, 1 dégât magique par
  cran, sans plafond (`estEffetVampirisme`, `estSortDeClasse`). L'attaque
  extraite porte `vampirisme: 70` ; `resoudreCarte` soigne le lanceur de 70 %
  (arrondi à l'inférieur) de tout ce que la carte inflige aux ennemis — PV
  réellement perdus + bouclier entamé, cumulé sur toutes les cibles —, puis
  applique ses soins reçus (brûlé : -60 %). Rien sur une esquive, ni sur ce
  que Ténèbres boit en énergie ou ce qu'un étalement remet à plus tard. Étape
  `soin` marquée `drain`/`vampirisme` (« +N 🩸 »).
- **Niveau 10** : **Nuée de chauve-souris** (CLASSE_NUEE_CHAUVES_SOURIS, init
  100, 0 fatigue, sur soi, une fois par combat) : état `Nuée de chauve-souris`
  (2 manches, `esquiveMin: 50`). `esquiveDe` prend le plus haut de l'esquive
  calculée et du plancher : plus haute, elle le reste ; malus compris, elle ne
  descend pas sous 50. État bienfaisant (une purification ne l'enlève pas).

Les Vargens ne peuvent pas être Vampire (`CLASSES_INTERDITES`,
`classeInterditeA`, app.js) : la carte est grisée dans la grille, un clic le
dit au lieu d'ouvrir la fiche, la validation le refuse, et un Vampire déjà
choisi tombe si l'on revient choisir Vargen (`changerRaceSelection`).
vampire.mjs vérifie le tout.

## Retouches de combat (version 172)

- **Ténèbres frappe brut** : aucune armure (résistance) ne s'applique
  (`attaque.versEnergie` met la résistance à zéro dans `chaineDeDegats`). Elle
  boit l'énergie d'abord ; plus d'énergie, le reste frappe les PV ×1,5
  (`partageTenebres`, arrondi à l'inférieur). tenebres_brut.mjs.
- **Un tir, engagé au contact, vise plus loin** : la règle d'engagement (on ne
  frappe qu'au contact) ne s'applique plus à une attaque à distance
  (`configSort.isRanged`, anneaux et clic dans moteur_effets.js). Le malus de
  30 % ne vaut que pour la cible au contact (distance à la CIBLE,
  `chaineDeDegats`). engagement_tombe.mjs, section 3.
- **Le Médicus sait où aller** : sur la case d'un allié tombé, une tête de mort
  légère (SVG, opacité 0,6), pour le seul Médicus et seulement tant que sa Prise
  en charge est disponible (`priseEnChargeDisponible`, `fantomeAllieKO`,
  combat.js). La pâleur (0,2) n'est plus que sur le portrait. medicus.mjs §5.
- **Le brouillard de l'aveuglé passe enfin devant les pions** : les pions
  vivent hors du calque zoomé (z-index 3) ; le brouillard a désormais son calque
  (#calque-brouillard-vtt, z-index 4, transform synchronisé par
  `appliquerTransformPlateau`). aveuglement.mjs mesure ce qu'on voit au centre
  d'un pion caché.

## Les valeurs à virgule (version 173)

Le grimoire peut donner « 1,5 » de dégâts par cran. La Forge calculait juste
(3 crans → 4,5) mais le moteur lisait `valeurBrute` en entier (`nombre`,
parseInt) : le demi-point tombait avant les défenses. `decimal` (moteur_pur.js)
la garde telle quelle — dégâts, soins, boucliers, nappes au sol, part du
Rempart, triche des créatures — et l'arrondi se fait une fois, AU PLUS
PROCHE, là où le moteur arrondissait déjà : 1,5 → 2, 4,5 → 5 ; un critique
double avant (1,5 → 3). La Forge écrit la valeur à la française, sans
décimales parasites (`formatterTexteEffet`, competences.js : « 4,5 », « 3,3 »).
valeurs_decimales.mjs.

## Bouton provisoire « Ajouter les effets de classe » (versions 174-175)

Retiré en version 175, une fois Lumière et Vampirisme ajoutés à la base.

Dans Paramètres → Gestion des effets. Les effets de classe (Ténèbres, Lumière,
Vampirisme) ne vivaient qu'en copie locale (MIGRATION_EFFETS) et n'apparaissaient
pas dans la liste. `installerEffetsDeClasse` (app.js) crée dans Combat_Effets
ceux qui y MANQUENT, avec les champs du jeu ; un effet déjà présent n'est
jamais réécrit, aucun autre effet n'est touché ; puis le cache de la Forge et
la liste sont rechargés. bouton_effets_classe.mjs.

## Les flèches des listes, et la portée d'arme du bon personnage (version 176)

- Une liste de héros plus longue que sa fenêtre (`.liste-persos` : liste des
  héros, choix d'un pion) montre une petite flèche en bas s'il y en a encore en
  dessous, en haut s'il y en a au-dessus ; un clic fait défiler
  (`installerFlechesDefilement`, app.js — recalculées au défilement, quand la
  liste change ou s'affiche, et au redimensionnement).
- La carte en grand calculait la portée que l'arme donne avec le héros de CE
  poste : un joueur à l'arc voyait une Distance sur les cartes des autres.
  `porteurPourApercu` (competences.js) prend le propriétaire de la carte (cache
  des compétences), sinon le personnage de la fiche ouverte, sinon le héros
  affiché en combat ; introuvable, aucune portée d'arme.
liste_fleches.mjs.

## La carte ne s'ouvre plus au lancement (version 177)

Cliquer « lancer » ouvrait la carte en grand, le temps de porter RÉSOUDRE et
ANNULER, puis elle disparaissait à la résolution. Elle ne s'ouvre plus (une
carte restée ouverte se referme) ; les deux boutons ont leur barre en bas de
l'écran (`barreCiblageResolution`, moteur_effets.js), retirée avec eux.
bouton_fintour.mjs, section 11.

## La Forge aux couleurs du jeu (version 178)

La Forge et son grimoire quittent le blanc et le bleu « appli » : parchemin,
cuir et or comme les autres fenêtres. Bandeau de cuir avec le cap et deux
médaillons (fatigue, initiative), parchemin bordé d'or, l'arme en sceau de cuir,
les caractéristiques en petits cachets, chaque action en bloc avec un liseré
d'or, ses sous-effets indentés sous « ↳ », compteurs −/+ en pastilles, menus des
sous-effets en pastilles colorées, gros bouton + de cuir, Valider en vert.
Toute la mise en page vit dans style.css (`.forge-*`) ; competences.js ne pose
plus que des classes (mêmes identifiants, mêmes actions).
Les « espaces bizarres » : les descriptions héritaient le centrage de
.modale-parchemin-jeu et flottaient au milieu de la ligne ; elles s'alignent à
gauche, sous leur nom. forge_design.mjs.

## LIA, l'aide à la création de la Forge (version 179)

Dans le bandeau de la Forge, les deux médaillons ont la même hauteur et leur
chiffre est centré dedans ; à leur droite, un bouton 🔨 « Aide à la création »
ouvre la fenêtre de LIA (lia_forge.js) : un encart pour le récit RP de la
technique, deux jauges (⚡ Coût en Fatigue / puissance, ⏱ Rapidité : Auto,
Faible, Modéré, Forte — Auto par défaut), Annuler et Créer.
LIA (Gemini, outil `forgerTechnique` imposé) reçoit le récit, les jauges (en
indications : Faible ≈ 30 % du cap, Modéré ≈ 60 %, Forte 90–100 % ; rapidité
forte = peu de points ou Initiative +), la fiche du héros (classe, race,
niveau, cap selon chaque caractéristique, armes en main) et la liste de TOUS
les effets et sous-effets qu'il peut forger (rôle, carac, fatigue par cran,
crans max, ce que fait un cran, durée réglable, armes interdites). Elle rend
un nom, une arme et des actions avec leurs sous-effets.
L'algorithme ne pose que ce que la Forge accepte, avec SES règles
(`window.outilsForge`, competences.js — dont `etatSousEffet`, désormais au
niveau du module, que les menus de sous-effets utilisent aussi) : une arme que
le héros peut manier (en main, Magie, Sans arme / Arme rp ; sinon celle qui
garde le plus d'actions), une seule attaque, deux caractéristiques au plus,
aucun sous-effet incompatible, crans et durées bornés, une forme de zone
compacte (en éventail au contact, centrée à distance), puis un rabot cran par
cran (durées d'abord, puis le poste le plus coûteux au total) jusqu'à tenir
sous le cap. La Forge est remplie (nom + effets), le joueur retouche et valide.
Une Forge déjà garnie demande « Remplacer ? ». Sans clé Gemini, LIA injoignable
ou plan sans action forgeable : un message, la Forge intacte.
Le récit part en base avec la compétence (`Recit_RP`), pour en dessiner
l'image plus tard ; une technique forgée à la main n'en a pas.
etalement_sans_degats.mjs et persistance_soin.mjs lisent maintenant les règles
dans `etatSousEffet`. aide_forge_lia.mjs.

## LIA et les effets de classe (version 180)

La liste que LIA reçoit est celle de la Forge du héros : un effet de classe
(Lumière, Ténèbres, Vampirisme…) n'y figure que si sa classe l'a débloqué à son
niveau (`effetAccessible`, à l'ouverture de la Forge). Il y est marqué
`effet_de_classe`, avec sa note, et LIA est invitée à l'utiliser quand le récit
s'y prête. Les règles qui nomment un effet de classe (la liste des attaques,
la règle de Lumière) ne sont dites que si le héros l'a ; un effet verrouillé
demandé quand même est refusé par l'algorithme.
Au passage : en Magie, `purgerIncompatibilitesArme` retirait tout sous-effet
rangé AUSSI en Physique (Lumière, Confusion, Peur, Empoisonnement…), alors que
le menu Magique les propose ; seuls les sous-effets purement physiques
tombent maintenant (`estSeulementPhysique`). aide_forge_lia.mjs, sections 8 et 9.

## L'illustration des compétences (version 181)

Une compétence forgée part en file d'illustration (illustration_competence.js) :
1. MIA_ILLUSTRATION (Gemini) lit le titre, les effets, le récit RP s'il y en a
   un, la race, le genre et la classe du héros, et la liste des images de
   référence ; elle écrit en anglais le prompt d'une scène — le héros en train
   d'exécuter sa technique, ou ce que fait la technique — dans le style des
   portraits du jeu (Cerveau_IA). Sans Gemini : un prompt assemblé à la main.
2. L'IA d'image prend les réglages des pions (gpt-image-2 puis 1.5 et 1,
   1024×1024, qualité basse, PNG) et reçoit en binaire l'avatar du héros (en
   armure) puis ses armes : celles du type de la technique (une arme à deux
   mains une seule fois), son focaliseur pour la Magie, aucune pour Sans arme.
   Les références sont posées sur un gris neutre, pas le magenta des pions.
3. Cloudinary (dossier Competences), puis `URL_Image` et `Prompt_Image` sur la
   compétence ; les caches et la carte ouverte suivent tout de suite.
La file (localStorage) tient une IA saturée (429, 5xx, « overloaded ») :
nouvel essai après 5 s, 15 s, 30 s, 1 min, puis toutes les 2 min, jusqu'à
réussite, sans redemander le prompt ni relire les images déjà acquises. Elle
survit à un rechargement et reprend au démarrage. Un sceau en bas à gauche dit
ce qui attend. Une erreur définitive (clés absentes, refus d'OpenAI, compétence
supprimée) retire la commande.
Sur la carte HD, l'image se pose sous le cadre de la carte (`htmlIllustrationCarte`),
à la place réglée par `REGLAGE_ILLUSTRATION_DEFAUT`. PROVISOIRE : le bouton
« 🖼️ Réglage image » de l'onglet Compétences ouvre des curseurs (haut, gauche,
largeur, hauteur, cadrage X/Y, zoom, arrondi, devant/sous le cadre) appliqués en
direct à la carte ouverte (gabarit hachuré si elle n'a pas d'image),
« Extraire le code » donne la ligne à recopier, « Illustrer la carte ouverte »
met une compétence existante en file. illustration_competence.mjs.

## L'illustration toujours SOUS l'image de la carte (version 182)

L'illustration se pose entre le fond de couleur de la carte et l'image de la
carte (z-index 1, sous le cadre à 2) : elle ne se voit que par la fenêtre
transparente du cadre, qui la borde. L'option « par-dessus le cadre » de l'outil
de réglage est retirée, et un ancien réglage `devant` resté en mémoire est
ignoré. illustration_competence.mjs, section 5, le vérifie au pixel : un cadre
opaque percé d'une fenêtre, une illustration rouge — rouge par la fenêtre, or
partout où l'image passe sous le cadre.

## L'illustration au format de la fenêtre de la carte (version 183)

L'image de la carte (competance_carte, 879 × 1216) a une fenêtre transparente
en haut : x 129 → 748, y 116 → 612 (14,7 → 85,2 % de large, 9,5 → 50,4 % de
haut), entre le médaillon d'initiative et la plaque vissée. Le réglage par
défaut la couvre en la débordant d'un point de chaque côté, sous le cadre
(haut 8,5, gauche 13,7, largeur 72,5, hauteur 42,9 %, sans arrondi).
UN SEUL FORMAT pour toutes les illustrations : 1000 × 800 (5:4). L'IA dessine
en carré (réglages des pions) avec la consigne de garder l'action dans la
bande centrale ; l'image est recadrée au centre en 1000 × 800 avant l'envoi,
et Cloudinary la livre en `c_fill,g_center,w_1000,h_800` quoi qu'il arrive.
illustration_competence.mjs (4 bis, 5) le vérifie avec la vraie image de la
carte (cadre_carte_competence.png, réduite) : la capture est comparée à la
transparence de la carte sur une grille — illustration visible partout où la
carte est transparente, carte intacte partout où elle est opaque.

## L'illustration suit le style des paramètres (version 184)

Le style du jeu (Cerveau_IA/INST_76839, celui de la création des personnages)
n'était donné qu'à Gemini, qui le reformulait dans sa scène. Il est maintenant
recopié MOT POUR MOT dans le prompt de l'IA d'image, dans les termes du
portrait (`assemblerPromptImage`) : « Contexte de l'univers : Antique
Fantastique… », « Directives de style artistique obligatoires : <style> »,
puis la scène de Gemini. Gemini le connaît toujours pour imaginer la scène ;
le prompt de secours (sans Gemini) passe par le même assemblage.
illustration_competence.mjs, section 3 bis.

## Cadrage figé, récit vidé après la forge, noms de LIA (version 185)

- L'outil provisoire de réglage de l'image est retiré (bouton, panneau, styles,
  gabarit) : le cadrage validé par Nico est figé dans
  `REGLAGE_ILLUSTRATION_CARTE`, et un ancien réglage local est effacé et ignoré.
  illustration_competence.mjs, section 6.
- Une technique forgée vide l'encart du récit de LIA et remet ses jauges sur
  Auto : la suivante part d'une page blanche.
- Le bouton de la Forge restait sur « Forge en cours... » après une forge
  réussie, et la Forge rouverte l'affichait encore. Il dit maintenant
  « ✔️ Forger cette compétence », au repos, après la forge et à chaque
  ouverture ; « ⏳ Forge en cours… » ne dure que le temps de l'écriture.
- LIA nomme court et parlant : 1 à 3 mots (4 max), ce que fait la technique
  (« Taille croisée », « Flèche de givre »), sans titres pompeux ni
  « de la… du… » en cascade. `nomDeTechnique` remet son nom au propre
  (guillemets, point final, article en tête, Majuscules Partout) et le coupe
  entre deux mots au-delà de 32 caractères. aide_forge_lia.mjs, sections 7 et 10.

## Illustrations nettes et vrais plans de cinéma (version 186)

Les illustrations sortaient floues : la cause principale était la génération
en qualité « low » (le réglage des pions, pensé pour un médaillon minuscule) ;
la compression ajoutait sa part (JPEG 0,92 avant l'envoi, puis q_auto).
Elles sont maintenant dessinées en paysage 1536 × 1024 (le format d'un plan de
cinéma, à peine rogné pour la fenêtre 5:4) et en qualité moyenne
(`DESSIN_ILLUSTRATION`), recadrées en 1250 × 1000 et envoyées en PNG sans
perte, livrées en `q_auto:best`. Les images déjà faites gardent leur netteté
d'origine.
MIA_ILLUSTRATION compose un vrai plan : gros plan, plan rapproché, plan
américain, contre-plongée, plongée, par-dessus l'épaule ; plan large seulement
pour une zone. Le corps entier et l'arme ne sont plus obligatoires (l'arme
n'apparaît que si le geste la montre). Le prompt décrit le plan, l'angle, la
focale, la profondeur de champ, le mouvement figé, la lumière et la
composition. illustration_competence.mjs, sections 2 bis, 3 et 4 bis.

## L'énergie sous la carte, et l'encart du repos long (version 187)

En combat, quand on choisit une compétence, la jauge d'énergie du héros
s'affiche sous la carte (`htmlJaugeEnergieApercu`, competences.js) : l'énergie
actuelle, la dépense (la carte + le trajet déjà tracé) en rouge clignotant, et
le chiffre qui restera (« il manque N » si la carte est trop chère ; le message
« Énergie insuffisante » descend sous la jauge). Pas de jauge sur une carte
retenue, pendant la résolution, sur une carte de créature ni hors combat.
Le repos long affiche, à la place de la carte, un encart « 🌙 Repos long » qui
dit combien il rend (`gainReposLong` : la règle du cerveau, Repos_Long du
combattant ou 35 % de la jauge, sans dépasser le plein), avec la même jauge et
le gain en vert clignotant (`afficherApercuReposLong`). jauge_energie_carte.mjs.

## Une compétence effacée emporte son image (version 188)

Le bouton MJ d'effacement (`supprimerCompetencePerso`) lit l'adresse de
l'illustration (cache, sinon la base) AVANT d'effacer le document, puis la
détruit sur Cloudinary (`supprimerImageCloudinary`, ia_master.js), sans faire
attendre le MJ. Si l'illustration était encore en file, sa commande est retirée
(`annulerIllustration`) ; si elle attendait une IA saturée, elle s'arrête au
prochain essai ; si elle était en plein dessin, l'image arrivée est aussitôt
détruite et rien n'est écrit sur la compétence effacée.
illustration_competence.mjs, section 8.

## Rééquilibrage des effets et des classes (version 189)

- EMPOISONNEMENT : la part des PV (8 % des PV max ; 10 % pour le poison du
  maître) frappe en dégâts BRUTS (`POISON.brut`) — ni défense, ni absorption,
  ni vulnérabilité ; seul le bouclier encaisse d'abord. L'énergie (10 % / 18 %)
  ne change pas. `chaineDeDegats` connaît désormais `attaque.brut`.
- BRÛLURE : 8 % des PV max (18 % pour un Vampire) en dégâts MAGIQUES, réduits
  par la défense magique (et l'absorption) — ils étaient physiques.
- VAMPIRE : la première case gratuite est retirée ; il devient insensible au
  gel (jamais Glacé). Le Vampirisme quitte la Forge (plus personne ne l'a ; les
  cartes déjà forgées gardent leur soin) : au niveau 5, le BAISER DU VAMPIRE,
  technique de classe (aucune fatigue, une fois par combat, initiative 100,
  sur un ennemi au contact choisi dans une petite fenêtre) : 25 % de ses PV max
  (arrondi au-dessus) en dégâts bruts, à coup sûr (ni esquive, ni critique),
  et le Vampire se soigne de 60 % de ce qu'il a infligé (bouclier compris ;
  brûlé, -60 %). La Nuée de chauve-souris descend à 40 % d'esquive.
- NÉCROMANCIEN : plus d'insensibilité au gel ; +8 PV au lieu de +5.
- CHASSEUR DE MAGES : +13 % de résistance magique au lieu de +10.
Descriptifs de classe et textes des états à jour. Bancs : vampire (1, 3, 4 bis,
5, 6, 8), necromancien, chasseur_de_mages, tableaux_nico, assassin,
cerveau_combat, moteur_pur, bonus_race_classe, aide_forge_lia.

## Saignement, Confusion, Aveuglement, Repli, poison du maître (version 190)

- MAÎTRE DES POISONS (Assassin niv. 10) : 9 % des PV max (au lieu de 10).
- CONFUSION : un seul jet sur 100 à chaque technique du confus, et une seule
  issue — 1–40 la carte part de travers (moitié sur lui, moitié sur un ALLIÉ au
  hasard à portée ; personne → sur lui ; une carte sans attaque revient sur
  lui), 41–60 il s'enfuit après la carte (comme la Peur), 61–80 il n'est plus
  confus en fin de boucle, 81–100 rien. (Avant : quatre jets de 30 %.)
- SAIGNEMENT (nouvel effet, copie locale EFF_SAIGNEMENT, réservé à personne) :
  sous-effet Physique, 1 pt, Force, 15 % par cran (max 75 %), 2 tours. 8 % des
  PV max en dégâts physiques à chaque fin de manche (armure appliquée,
  bouclier d'abord), et +2 de fatigue par case de déplacement, après les
  doublements et la division du Vargen (coutDuPas, et l'aperçu de mouvement.js).
- AVEUGLEMENT : 4 cases de noir (au lieu de 3).
- REPLI : évite TOUTES les attaques d'opportunité, sans jet (plus de 60 %).
- LE GRIMOIRE (Combat_Effets) : le jeu n'y écrit jamais seul. Un bouton
  PROVISOIRE « 🔄 Mettre à jour les règles » dans l'écran du Grimoire du moteur
  propose au MJ d'y recopier les textes changés (Empoisonnement, Brûlé,
  Confusion, Aveuglement, Repli, Vampirisme retiré) et d'y ajouter le
  Saignement s'il n'y est pas ; la liste s'affiche, rien ne part sans
  confirmation, seuls ces champs sont touchés (merge).
saignement.mjs ; confusion_cerveau, aveuglement, repli, assassin,
chasseur_de_mages et migration_effets mis à jour.

## Le Sorcier remplace le Nécromancien, l'Ensorceleur disparaît (version 191)

- RENOMMAGE : le Nécromancien s'appelle désormais SORCIER. La base garde ses
  documents (Classes/CLASSE_NECROMANCIEN) : le jeu les lit sous le nom Sorcier
  (id CLASSE_SORCIER, mêmes images), et un héros dont la fiche porte encore
  « Nécromancien » est lu comme Sorcier (CLASSES_RENOMMEES, nomActuelClasse).
- L'ENSORCELEUR n'est plus proposé (CLASSES_RETIREES), même s'il est en base.
- NIV. 1 : Ténèbres dans la Forge (dès le niveau 1) ; +1 case de portée de
  BASE sur tous ses sorts, même au contact (un sort sans Distance porte à 2
  cases et se vise comme un tir) ; aucune réduction ×0,7 au contact pour ses
  sorts tirés (attaques magiques seulement). Plus de +8 PV, de +1 compétence
  ni de sursis (le code du sursis reste, dormant).
- NIV. 5 : CHARME FRATRICIDE — init 105, 0 fatigue, une fois par combat, un
  ennemi à 3 cases. Il est « Charmé » (2 manches au plus) : sa prochaine
  compétence part sur l'un de SES alliés, au hasard, à portée de la carte et en
  vue ; personne à portée → la carte se perd. Le charme s'use sur cette carte.
- NIV. 10 : TRANSFERT — init 100, 0 fatigue, une fois par combat, un ennemi à
  5 cases, MÊME HORS DE VUE (derrière un mur) : le Sorcier se téléporte à sa
  place, l'ennemi prend la sienne (deux bonds, aucune attaque d'opportunité),
  puis il se soigne de 10 PV (réduits comme tout soin : Brûlé…).
- Fenêtre de ciblage des techniques : ennemis à portée pour les deux.
- Grimoire : le bouton provisoire du MJ recopie aussi la Classe (Sorcier) et le
  niveau requis (1) de Ténèbres.
sorcier.mjs ; necromancien, bonus_race_classe, choix_classe (13 classes),
aide_forge_lia, migration_effets, saignement et hoplite mis à jour.

## Médicus, Chasseur de mages, le Protecteur (ex-Hoplite) (version 192)

- MÉDICUS niv. 1 : +1 à chacun de ses soins (bonusSoin), ajouté à la carte
  avec les bonus d'équipement (appliquerEquipementALaCarte) — ni aux coups,
  ni aux boucliers.
- CHASSEUR DE MAGES niv. 1 : +10 % de résistance magique (au lieu de 13) et
  Lumière dans la Forge dès le niveau 1 ; un sort de lumière a 8 % de chance
  d'aveugler SA CIBLE (plus ses voisins ; l'ancien 30 % du niveau 10 n'existe
  plus).
  Niv. 5 : BOUCLIER ANTI-MAGIE — init 200, 0 fatigue, une fois par combat,
  la manche en cours et la suivante : tout coup magique qui le frappe repart
  en entier sur son lanceur (encaissé avec les défenses de ce dernier) ; lui
  n'en prend rien. Un coup renvoyé ne se renvoie plus. Les états du sort le
  touchent quand même (seuls les dégâts repartent).
  Niv. 10 : APPEL DE LA LUMIÈRE — 0 fatigue, une fois par combat : tous les
  autres combattants debout du plateau, ALLIÉS COMPRIS, sont Aveuglés 2
  manches (noir tiré par le cerveau pour chacun ; immunisés épargnés).
- L'HOPLITE s'appelle désormais PROTECTEUR (document CLASSE_HOPLITE lu en
  CLASSE_PROTECTEUR, mêmes images ; fiches « Hoplite » lues « Protecteur »).
  Niv. 1 : +7 % de parade (plus de +5 de résistance physique) et 15 % de
  chance de provoquer les ennemis que frappe chacune de ses attaques
  (provocationAttaques ; une carte qui provoquait garde la meilleure chance).
  Niv. 5 : le Rempart (au lieu du niveau 10). Le Mur de bouclier n'est plus
  donné (le moteur le sait toujours jouer).
  Niv. 10 : RÉSONANCE DU BOUCLIER — init 100, 0 fatigue, une fois par combat :
  chaque ennemi au contact est Étourdi (2 manches) et prend 5 % de ses PV max
  en dégâts physiques (armure appliquée), à coup sûr. Refusée (non gâchée)
  sans ennemi au contact.
- Grimoire : le bouton provisoire du MJ recopie aussi la Lumière (Classe,
  niveau 1, texte avec les 8 %).
hoplite, chasseur_de_mages, medicus ; bonus_race_classe, choix_classe,
aide_forge_lia, migration_effets, saignement, sorcier mis à jour.

## Appel de la lumière et Transfert : sur tout le monde (version 193)

Nico : « Appel de la lumière aveugle tout le monde sur le champ de bataille.
Transfert marche idem sur tout le monde. »
- APPEL DE LA LUMIÈRE : tous les combattants debout sont Aveuglés 2 manches,
  alliés ET Chasseur de mages compris (chacun son noir ; immunisés épargnés).
- TRANSFERT : n'importe quel autre combattant debout à 5 cases, allié ou
  ennemi, toujours sans ligne de vue ; la fenêtre de ciblage les propose tous.
sorcier et chasseur_de_mages mis à jour.

## L'Oracle (version 194)

- NIV. 1 : +10 d'initiative sur ses compétences FORGÉES (jouerCarteCombat ;
  pas sur ses techniques de classe, ni le repos long).
- NIV. 5 : ARRÊT DU TEMPS — init 200, 0 fatigue, une fois par combat. Son tour
  venu, une fenêtre montre la file de la manche (initiative, nom, compétence
  de chacun, créatures comprises) et ses compétences mémorisées (grisées si
  trop chères pour son énergie ou interdites par son arme). Il en choisit une
  et fixe son initiative (0 à 199 ; proposée : celle de la carte, +10). Le
  cerveau valide (une compétence forgée, ni technique de classe ni repos long,
  initiative entière de 0 à 199) et insère une seconde entrée dans la file,
  derrière ceux qui ont autant ou plus (resoudreTechniqueClasse) : il joue
  donc deux fois dans la manche ; la compétence coûte sa fatigue normale.
- NIV. 10 : RETOUR ARRIÈRE — 0 fatigue, une fois par combat. En préparation,
  il le choisit (rien n'est inscrit, sa bannière se surligne ; le rechoisir
  l'annule), puis une compétence forgée : le repos à venir compte déjà pour ce
  qu'il peut se payer (bannières, aperçu, jauge). Ni repos long, ni autre
  technique de classe avec lui. La file reçoit la compétence, à son initiative
  (+10), marquée `retourArriere`. Au DÉBUT de son tour (ouverture de manche ou
  clôture du tour d'avant), le cerveau prend le repos long (même rendement que
  le repos ordinaire) et consomme la technique (reposDuRetourArriere,
  combat_etat.js) : il bouge et lance avec la fatigue remise à jour.
- Les bancs qui prenaient l'Oracle pour « une classe sans rien » prennent
  maintenant le Pisteur.
oracle.mjs ; bonus_race_classe, hoplite, necromancien mis à jour.

## La Sentinelle (version 195)

- NIV. 1 : +6 aux dégâts de TOUTES ses attaques d'opportunité (8 → 14 avant
  l'armure ; le Rempart partage les 14) et +20 % de soins reçus (soinsRecus,
  comme l'Éthéré).
- NIV. 5 : DÉFENSEUR — un ennemi qui ENTRE de lui-même dans sa zone (marche,
  Bond, fuite de la Peur) : un jet de 30 %, puis l'attaque d'opportunité se
  joue normalement (esquive ou parade). Un seul jet par ennemi et par
  déplacement. Un Repli s'en dérobe sans dé ; une Poussée, une Traction ou un
  Transfert n'en déclenchent pas. Sa ZONE DE MENACE (porteeDeMenace,
  mouvement_pur.js) passe à 2 cases avec une arme à allonge (lance lourde) :
  pour le Défenseur ET pour l'attaque d'opportunité classique (qui quitte ses
  2 cases). L'allonge de l'équipement est retenue dans l'état (mod.allonge).
- NIV. 10 : FUREUR DE LA SENTINELLE — init 20, 0 fatigue, une fois par combat :
  chaque ENNEMI adjacent reçoit une attaque d'opportunité (dés du cerveau,
  esquive ou parade possible), puis ceux qui tiennent debout sont repoussés
  d'une case (un mur ou un pion l'arrête ; le feu où l'on atterrit brûle).
  Refusée, non consommée, sans ennemi au contact.
sentinelle.mjs.

## Les noms de classe au féminin (version 196)

Pour une héroïne (genre « Femelle »), le nom de la classe s'affiche au féminin
quand il en a un : Pisteuse, Assassine, Chasseuse de mages, Profanatrice,
Géomancienne, Protectrice, Sorcière. Sans féminin d'usage, inchangées :
Sentinelle, Oracle, Vampire, Mage du chaos, Médicus, Élémentariste.
AFFICHAGE SEULEMENT (window.nomClasseGenre, app.js) : la grille et la fiche du
choix de classe (selon le genre choisi juste avant), l'en-tête et l'encart des
statistiques, et la classe donnée à l'IA qui illustre les compétences. La
fiche du personnage garde le nom de la classe (« Sorcier ») : toutes les
règles le lisent ainsi. Les anciens noms suivent (Nécromancien → Sorcière,
Hoplite → Protectrice).
classes_feminin.mjs.

## Assassin pour les deux sexes ; Mage du chaos et Élémentariste « Arrive bientôt » (version 197)

- L'Assassin garde son nom pour une héroïne (plus d'« Assassine »).
- Le MAGE DU CHAOS et l'ÉLÉMENTARISTE (CLASSES_BIENTOT, classes.js) restent
  dans la grille, l'image voilée (opacité 35 %) et « Arrive bientôt » écrit
  par-dessus ; un clic ne les ouvre pas, un message le dit.
classes_feminin.mjs mis à jour.

## Le Profanateur (version 198)

- NIV. 1 : ses dégâts sur la durée font 30 % de plus, arrondis à l'inférieur
  (dotBonus) : poison (PV et énergie), brûlure et saignement au tic de fin de
  manche (l'auteur est l'`idSource` de l'état — le Saignement le retient
  désormais aussi), dégâts étalés et Ténèbres étalées dès la pose. +1
  compétence, +5 PV.
- NIV. 5 : LES ZOMBIES (combat_etat.js, zombifier, appelé par `tomber`) : une
  CRÉATURE ennemie tuée par lui (même par son poison, de loin), ou qui tombe
  sur une case adjacente à lui (quel que soit le tueur), se relève aussitôt
  dans son camp : 15 / 15 PV, plus d'esquive ni de parade, ses résistances
  gardées, ses états effacés. Étape « zombie » dans le journal (rejouée à
  l'identique), son tour de la manche en cours retiré de la file. Les boss
  aussi ; pas les héros, ni les illusions ; un zombie retué ne revient pas.
  SON TOUR (jouerZombie, cerveau_combat.js) : pas de carte ; jusqu'à 2 cases
  vers l'ennemi le plus proche, sans fatigue (coutDuPas), puis une morsure de
  7 physiques (armure de la cible, esquive/parade de la cible possibles).
  En préparation, l'IA l'inscrit à l'initiative 0 (monstres_ia.js). La
  victoire ne l'attend pas et son XP compte une fois (loot.js).
  SON PION (zombie_token.js, sans IA) : l'image du pion passée dans un canvas
  — chair vert-gris, taches de pourriture, morsures en dents de scie au bord,
  ourlées de sang, éclaboussures et coulures — tirée de l'id de la créature
  (le même zombie sur tous les écrans), gardée en cache.
- NIV. 10 : le SURSIS de l'ancien Nécromancien (2 tours debout à 0 PV, coups
  ignorés, aucun soin, une fois par combat).
profanateur.mjs.

## Les renforts : à la fin du tour, et pour un zombie aussi (version 199)

Nico : « un adversaire mort et qui se transforme en zombie : s'il y a des
ennemis en attente, ils spawn. Les renforts n'apparaissent pas direct à la
mort d'un ennemi mais à la fin du tour. »
- Une créature passée zombie libère sa place dans la réserve comme une
  créature tuée, et ne compte plus parmi les créatures debout
  (entrerRenfortMonstre, monstres.js). Une seule place par créature : le
  zombie retué ne rappelle personne.
- Le renfort entre à la FIN DU TOUR où la créature est tombée (renfortsDuTour,
  pont_combat.js, fonction pure ; appelée par le cerveau dans regime_cerveau.js) :
  une chute en plein tour (attaque d'opportunité pendant une marche) attend
  que la tête de file change ; une chute dans l'entrée qui clôt le tour entre
  aussitôt. marquerMonstreMort marque toujours la mort tout de suite, sans
  plus appeler le renfort lui-même ({ sansRenfort: true }).
profanateur.mjs (section 5 bis).

## Le Pisteur (version 200)

Nico : « un compagnon animal indépendant en combat (25 PV, 15 % d'esquive, 6
dégâts bruts), arme à distance +1 dégât ; niveau 5 Tir précis ; niveau 10
Lien de sang. Après le choix de la classe, une fenêtre demande à quoi
ressemble le compagnon (pas plus grand qu'un cheval) ; à la création du perso,
son image est créée aussi, et il a son propre pion en combat. Il apparaît avec
les joueurs. »
- NIV. 1 — LE COMPAGNON (ATOUTS_CLASSES « Pisteur » : compagnon, app.js).
  C'est un document Monstres DE SON CAMP, COMPAGNON_<héros>
  (poserCompagnonSurTerrain, monstres.js), posé au contact de son maître quand
  les héros se déploient (genererTokensCombat, combat.js) : 25 PV, 15 %
  d'esquive, parade 0, aucune résistance, mêmes chiffres à tous les niveaux.
  En combat il porte `compagnon: { idMaitre }` (combattantDepuisFiche).
  SON TOUR (jouerCompagnon, cerveau_combat.js — le même tour que le zombie,
  jouerServiteur) : 3 cases vers l'ennemi le plus proche sans fatigue
  (coutDuPas), puis 6 dégâts BRUTS au contact (aucune armure ; l'esquive et la
  parade de la cible comptent). Il joue JUSTE APRÈS SON MAÎTRE : ouvrirManche
  repose son entrée derrière celle du maître, avec la même initiative
  (placerCompagnons, combat_etat.js) ; maître KO, il garde sa place et se bat
  toujours. Les créatures le visent comme n'importe quel héros. KO, il reste
  à terre jusqu'à la fin du combat (sans renfort ni mort de la réserve :
  renfortsDuTour), et la réinitialisation efface son document — il revient
  avec 25 PV au combat suivant. Il n'empêche pas la victoire, ne la fait pas
  seul sur le plateau, et ne rapporte pas d'XP (loot.js).
- NIV. 1 — +1 dégât à chaque attaque d'une compétence à arme à distance
  (bonusDistance, appliquerEquipementALaCarte, moteur_effets.js).
- NIV. 5 — TIR PRÉCIS (CLASSE_TIR_PRECIS, init 100, 0 fatigue, une fois par
  combat) : un ennemi à 5 cases, EN VUE (le cerveau vérifie la ligne de vue
  avec le plateau), immobilisé à coup sûr pendant 2 manches.
- NIV. 10 — LIEN DE SANG (CLASSE_LIEN_DE_SANG, init 100, 0 fatigue, une fois
  par combat) : son compagnon au contact retrouve tous ses PV ; KO, il se
  relève plein (étape « reanimation ») et rejoue à la manche suivante. Un
  compagnon indemne, ou loin : la technique est refusée, pas gâchée.
- LA CRÉATION : choisir le Pisteur ouvre la fenêtre du compagnon (son nom, à
  quoi il ressemble ; classes.js), gardée dans COMPAGNON_TEMP puis jointe au
  héros (Compagnon_Nom, Compagnon_Description). Juste après le héros, en
  arrière-plan (genererCompagnonEnArrierePlan, app.js) : une image en paysage
  1536×1024, au style des portraits, fond magenta détouré, la taille d'un
  cheval au plus (promptCompagnon) → Compagnon_Image ; puis son pion rond,
  par le même chemin que celui d'un héros (sujet « animal companion ») →
  Compagnon_Token. Sur le plateau, le pion du compagnon est son image à lui,
  d'une seule case.
pisteur.mjs.

## Le Géomancien (version 201)

Nico : « Géomancien. Niv. 1 : à partir de quatre zones payantes placées, la 5e
ne coûte rien (dans la Forge) ; +10 init pour les sorts avec une zone. Niv. 5 :
Mur de terre (20 fatigue par mur, init 80, portée 5) — mur à 10 PV,
infranchissable s'il n'est pas cassé, qui casse la ligne de vue ; qui est
dessus est repoussé d'un côté et prend 3 dégâts bruts. Ses zones ne le
blessent pas, le terrain difficile ne le ralentit pas, il traverse ses murs.
Murs dessinés vus de dessus, un peu iso, en piliers de roche, parfois des
gravats à côté ; cassés, des gravats sur la case, qui devient difficile. »
- NIV. 1 : dans la Forge, la première case de zone reste offerte et, pour lui,
  la 5e case PAYANTE aussi (casesZonePayantes, app.js ; competences.js) ; ses
  compétences à Zone ont +10 d'initiative quand il les joue
  (bonusInitiativeClasse — qui porte aussi le +10 de l'Oracle).
- NIV. 5 — MUR DE TERRE (CLASSE_MUR_DE_TERRE, init 80, pas une fois par
  combat) : le joueur touche les cases sur le plateau (murs_terre.js,
  ouvrirPoseMursTerre), 20 ⚡ par mur, à 5 cases, en vue ; la seule limite est
  sa fatigue. Le cerveau lève les murs (leverMursDeTerre, cerveau_combat.js) :
  qui se tient sur une case est repoussé sur une case libre au hasard tout
  autour (3 dégâts bruts) — sans place, il reste là, sur des gravats, pas de
  mur, et prend 6.
- LES MURS vivent dans l'état (etat.murs, etat.gravats ; étape « mur ») ; le
  noyau les ajoute au terrain du plateau (plateauDeCombat, combat_etat.js) :
  un mur est une case bloquée (infranchissable, opaque), des gravats une case
  difficile. 10 PV, aucune défense : on les vise comme un ennemi (un clic sur
  la case pendant le ciblage), les zones les touchent ; leurs coups sont
  retirés de la carte avant les dés et portés après (separerMurs,
  frapperMurs). Cassé : des gravats jusqu'à la fin du combat. Une créature
  que des murs enferment (plus aucun ennemi joignable à pied,
  ennemiAtteignable, ia_pure.js) frappe le mur qu'elle touche. La
  réinitialisation du combat les efface (un nouvel état n'en a pas).
- PASSIFS (niv. 5) : ses nappes ne le touchent pas (traverserZones), le
  terrain difficile — gravats compris — lui coûte le prix normal (coutDuPas),
  il traverse SES murs sans s'y arrêter (franchissablePour, trouverChemin,
  planifierTrajet recule hors du mur, la validation refuse d'y finir). Le mur
  lui coupe la vue comme à tout le monde.
- L'ÉCRAN : window.MURS_TERRE / GRAVATS_TERRE (projetés de l'état),
  etatCaseCombat (déplacement, ligne de vue, cases d'arrivée), et le DESSIN
  sans IA : piliers de roche grise à facettes (strates, éclats, fissures),
  vus de dessus un peu en perspective, parfois des cailloux au pied ; les
  gravats en éclats sur une tache de terre. Tiré d'une graine (l'id du mur) :
  le même sur tous les écrans.
geomancien.mjs.

## Les murs de terre qui se suivent (version 202)

Nico : « quand le Géomancien crée des murs sur des hexagones adjacents, que ça
crée visuellement un mur de pierre qui se suit ; quand un morceau est pété en
bout ou entre, que ça redessine un bout pété ; que ça suive la direction et la
perspective du mur — toujours sans déborder sur les autres hexagones. »
- Chaque case de mur se dessine selon ses 6 voisines (voisinsDuMur,
  murs_terre.js) : un cœur de roche, et un BRAS vers chaque voisine murée,
  jusqu'au milieu de leur bord commun — même largeur, même hauteur, même
  teinte (celle du Géomancien qui les a levés) des deux côtés : les deux
  moitiés se rejoignent sur la frontière, dans les 6 directions, et la
  perspective suit (la roche monte vers le haut de l'écran). Trois murs qui
  se touchent deux à deux remplissent leur coin commun ; un carrefour a un
  cœur plus large.
- Vers une voisine CASSÉE (des gravats) : un moignon déchiqueté, plus bas, et
  des éclats tombés de son côté. Le mur se redessine dès que sa voisine casse.
- Rien ne sort de la case au sol ; seule la hauteur de la roche monte vers la
  case du dessus (comme avant). Un mur seul garde son pilier.
- Tous les murs sont peints ENSEMBLE dans un seul canvas
  (.murs-terre-ensemble) : une image par mur laissait un fil sombre à chaque
  raccord (le bord transparent d'une image agrandie fonce un peu). Chaque mur
  garde une balise sur sa case (nom, PV, visé) ; le mur visé est entouré de
  rouge dans le canvas.
geomancien.mjs (section 9 bis).

## Les murs de terre : au-dessus des pions, sans ombre, plus rocheux (version 203)

Nico : « les murs > l'image des tokens en dessous de l'image des murs. Enlever
l'ombre sous la roche, pour donner plus l'impression qu'ils sortent du sol. Et
dessiner plus de détails aléatoires sur les murs, qu'ils paraissent moins
lisses et plus rocheux, et plus de gravats à leur base. »
- LES MURS PASSENT DEVANT LES PIONS : un calque à eux (#calque-murs-vtt /
  #transform-murs, index.html), placé après les pions au même z-index, sous le
  brouillard de l'aveuglé, zoomé comme le plateau (appliquerTransformPlateau,
  combat.js). Un pion qui se tient derrière un mur est caché par sa roche. Les
  gravats d'un mur cassé restent au sol, sous les pions (#calque-murs-terre).
- PLUS D'OMBRE PORTÉE (ni sous les murs, ni sous le pilier seul, ni sous les
  éclats) : à la place, de la terre soulevée au pied — la roche vient de
  percer le sol (terreSoulevee).
- LA ROCHE MOINS LISSE (detaillerFace) : sur chaque face, des taches, des
  blocs fendus, des bosses en relief (éclairées en haut, ombrées en bas), des
  fissures ramifiées, des ébréchures au bord du haut et du grain ; une crête
  plus inégale, des flancs bosselés, un éclairage qui varie d'une facette à
  l'autre ; sur le dessus, des taches, des trous et plus de fissures. (Un
  défaut corrigé au passage : les strates des faces ne se dessinaient plus —
  le découpage se faisait sur le dernier trait, pas sur la face.)
- PLUS DE GRAVATS AU PIED, devant (gravatsAuPied), toujours dans la case, et
  jamais du côté d'une voisine murée (ils ressortiraient sur sa roche).
geomancien.mjs (sections 9 bis et 10).

## Renommer un héros, couper les images des cartes, la pierre des murs (version 204)

Nico : « dans l'onglet dev des fiches perso, fais-moi un champ pour changer
les noms des personnages » ; « mets dans Paramètres un bouton poussoir pour
activer ou désactiver la génération de photo dans les cartes de compétence » ;
« le dessus des murs est trop lisse, fais comme si c'était de la roche — plus
réaliste que ces traits bizarres ».
- RENOMMER (onglet DEV de la fiche, index.html) : un champ « Nom du héros »,
  rempli à l'ouverture de la fiche (afficherStatsCombat), et « Renommer » (ou
  Entrée) — renommerPersoDev (creation_personnage.js) écrit Prenom_Personnage
  sur sa fiche, puis met à jour le titre de la fiche et les listes en mémoire.
  Un nom vide est refusé ; une écriture qui échoue ne change rien à l'écran.
  renommer_dev.mjs.
- L'INTERRUPTEUR DES IMAGES DES CARTES (menu Paramètres) : allumé par défaut,
  gardé dans ce navigateur (ivalis_illustration_cartes). Coupé, une compétence
  forgée ne part pas en illustration et la file en attente se met en pause
  (illustration_competence.js) ; rallumé, elle repart. Les images déjà faites
  restent affichées. interrupteur_illustration.mjs.
- LE DESSUS DES MURS EN PIERRE (texturePierre, murs_terre.js) : plus de
  facettes ni de traits — une texture calculée pixel par pixel : un bruit
  fractal (des bosses de toutes tailles) éclairé du haut à gauche pour le
  relief, un grain fin et un réseau de fissures qui suit les creux d'un second
  bruit. Le motif est lu dans les coordonnées du plateau : deux murs voisins
  continuent la même pierre. Le pilier seul a la même pierre sur son dessus.
  geomancien.mjs (« pas un aplat » : la teinte la plus fréquente du dessus en
  couvre moins de 5 % — 83 % avec l'ancien dessus).

## La piste d'initiative : des ronds pleins (version 205)

Nico : « pour les ronds avec l'initiative dans la barre d'initiative, plutôt
que mettre la couleur sur le bord du rond en fonction du niveau du monstre,
mettre la couleur partout dans le rond, et idem pour les joueurs ».
- LE ROND EST REMPLI de la couleur du palier (contenuTuilePiste, combat.js) :
  gris pour un Petit, blanc pour un Normal, jaune pour un Élite, rouge pour un
  Boss, et l'or d'origine pour un héros. Le liseré devient un fin trait sombre,
  avec un léger relief (reflet en haut, ombre en bas).
- LE CHIFFRE RESTE LISIBLE : texteSurCouleur choisit, du sombre ou du blanc,
  celui qui contraste le plus avec le fond (luminance du WCAG). Sur les cinq
  teintes actuelles c'est le sombre — même sur le rouge du Boss (4,5 contre
  4,2 pour le blanc) ; une teinte foncée ajoutée un jour passerait en blanc.
piste_initiative.mjs (section 14 : fond de chaque palier, bord neutre, chiffre
sombre, contraste d'au moins 4 partout).

## Zombies, Retour arrière, arme et bouclier, héros confié (version 206)

Nico : « quand un token est transformé en zombie, il doit aussi apparaître
zombie dans la piste d'initiative » ; « lors de son tour, le zombie ne s'est
pas déplacé pour attaquer » ; « pour l'Oracle, la technique Retour arrière bug
un peu : on peut sélectionner une autre compétence mais après tout se grise,
on n'a pas le temps » ; « à la création, pour l'arme et bouclier, faire le
choix entre arme légère et bouclier ou arme lourde et bouclier » ; « dans le
panneau dev de la fiche perso, un encart de sélection pour changer
l'appartenance d'un personnage à un autre joueur ».
- LE ZOMBIE DANS LA PISTE (combat.js, imagePionCreature) : la piste et la
  fenêtre de tour reprennent l'image du PION — le pion grignoté de
  zombie_token.js, sous le filtre cadavérique tant qu'il se dessine, puis la
  piste se redessine seule. Le compagnon du Pisteur y montre aussi son pion.
  piste_initiative.mjs, section 15.
- LE ZOMBIE QUI NE BOUGEAIT PAS : relu dans le journal de la partie
  (Combat_Journal, lecture seule) — manche 4, « zombie : hors de portée » sans
  un pas. Il visait l'ennemi le plus proche à vol d'oiseau ; celui-là était
  cerné, aucune case n'en rapprochait, et il restait planté alors qu'un autre
  ennemi à la même distance l'attendait à un pas. Le serviteur (zombie et
  compagnon) compte maintenant les pas À PIED jusqu'au contact de n'importe
  quel ennemi (pasJusquAuContact, ia_pure.js ; jouerServiteur,
  cerveau_combat.js) : une case d'où mordre d'abord, la plus proche du contact
  sinon ; au contact de plusieurs, le plus proche puis le plus entamé. Rejoué
  sur la position réelle : un pas en (2,-2), puis la morsure.
  profanateur.mjs, section 4 bis.
- LE RETOUR ARRIÈRE QUI SE REGRISAIT : le volet était dessiné avec l'énergie
  d'après le repos, mais le rafraîchissement suivant (à chaque nouvelle de la
  partie) regrisait les bannières et désélectionnait la carte en aperçu avec
  l'énergie d'avant. actualiserBannieresEpuisees et actualiserEtatCarteCombat
  comptent maintenant le repos en attente (bonusRetourArriere). Au passage,
  ce même rafraîchissement rallumait une carte que l'arme interdit : elle reste
  grisée. oracle.mjs, section 4.
- ARME ET BOUCLIER (index.html, objets.js) : « Arme légère + Bouclier »
  (dague, couteau, épée courbée) ou « Arme lourde + Bouclier » (épée courte,
  hache, gourdin, masse, lance courte), toujours à une main ; l'ancien choix
  sans famille reste compris. equipement_depart.mjs.
- CONFIER UN HÉROS (onglet DEV, creation_personnage.js) : une liste des
  joueurs (collection Joueurs, lue une fois), le joueur actuel présélectionné,
  « Confier » après confirmation — seul ID_Joueur est écrit sur la fiche, les
  listes en mémoire suivent. Un propriétaire hors liste (le MJ) reste affiché.
  proprio_dev.mjs.

## Profanateur corrigé, Géomancien niveau 10, bagues de dégâts (version 207)

Nico : « pour le Profanateur, il y a une erreur, tu as mis ×1,3 dégâts, ce
n'est pas du tout ça. C'est étalé : la fatigue est de base divisée par 1,2,
sauf pour le Profanateur, le coût en fatigue est divisé par 1,3 » ; « Géomancien
lvl 10 : les zones persistantes durent un tour de plus » ; « les bagues qui font
des dégâts en plus : à la fois pour l'intelligence et le charisme, la plus
grande des deux pour l'équiper, et les dégâts rajoutés au brut ou au magique ».
- LE PROFANATEUR (app.js, competences.js) : plus aucun ×1,3 sur ses poisons,
  brûlures, saignements ni étalements (cerveau_combat.js, moteur_pur.js : ils
  sont ceux de tout le monde). Son atout du niveau 1 devient
  `diviseurEtalement: 1.3` : à la Forge, la part étalable de la compétence
  est divisée par 1,3 au lieu du 1,2 du grimoire (diviseurEtalement prend le
  plus avantageux des deux). Le secours, si le grimoire ne dit rien de
  lisible, passe de 1,3 à 1,2. initiative_hors_effets.mjs (1 ter),
  profanateur.mjs.
- LE GÉOMANCIEN, NIVEAU 10 (« Terre tenace ») : atout `zonesProlongees: 1`,
  porté en combat ; ses zones persistantes naissent avec 4 tours au lieu de 3
  (creerZonePure, moteur_pur.js). Celles des autres ne changent pas.
  geomancien.mjs (1 bis).
- LES BAGUES DE DÉGÂTS (objets.js, moteur_effets.js) : CARACS_MODELE ouvre
  « Bagues DPS » à l'Intelligence OU au Charisme — la meilleure des deux,
  comme une armure légère, bagues déjà trouvées comprises. Leur bonus
  (degatsMag) s'ajoute aux attaques magiques et aux attaques brutes ; une
  brute physique garde aussi les dégâts physiques de l'arme. La bague de soin
  reste à la Sagesse. bagues_dps.mjs.

## Le compagnon du Pisteur dans la fenêtre de tour (version 208)

Nico : « pour le compagnon du Pisteur, dans le descriptif de combat, on voit
l'image de son token et non de son image de personnage. De plus, dans le
descriptif de l'attaque, c'est marqué TECHNIQUE et technique inconnue de ce
poste. Fais en sorte qu'une IA crée un nom RP à cette attaque quand on crée le
compagnon. »
- SON IMAGE (combat.js, rafraichirVoileTour) : le compagnon montre son image
  de personnage en entier, comme un héros, et plus son pion rond. Elle est en
  paysage : hud_disposition.js la cale à gauche du nom de l'attaque, sans
  passer dessous.
- SON ATTAQUE A UNE CARTE (carteServiteur, combat.js) : le compagnon et le
  zombie jouent un geste fixe, sans carte — d'où « Technique inconnue de ce
  poste ». La fenêtre lit désormais une carte de lecture : le nom RP de
  l'attaque (à défaut « Attaque de <nom> »), « 6 dégâts bruts » et sa course
  de 3 cases ; le zombie, « Morsure », 7 dégâts physiques, 2 cases.
- LE NOM RP (app.js, nommerAttaqueCompagnon) : Gemini le tire de la
  description de la bête à la création du compagnon (2 à 4 mots, nettoyés),
  écrit sur la fiche du maître (Compagnon_Attaque) puis recopié sur le
  document du compagnon (Nom_Attaque → nomAttaque). Un compagnon d'avant en
  reçoit un à son prochain déploiement (poserCompagnonSurTerrain) ; l'IA
  muette, rien n'est écrit et on retentera.
fenetre_tour.mjs (le compagnon, le zombie), compagnon_attaque.mjs.

## Tir précis sur le plateau, le butin sans compagnon ni zombies (version 209)

Nico : « pour le Tir précis du Pisteur, plutôt qu'une fenêtre avec les noms de
la cible, faire cibler comme normalement sur la map » ; « le compagnon est pris
en compte dans l'attente des joueurs pour le loot ; le compagnon et les zombies
n'ont pas de loot ».
- LE TIR PRÉCIS (combat.js, moteur_effets.js) : il ouvre le ciblage du plateau,
  comme l'Assaut mortel. demarrerCiblage lui prête une Immobilisation à
  distance (5 cases) pour l'aperçu ; les refus sont ceux de tout tir (hors de
  portée, allié, vue obstruée). À la validation
  (declencherResolutionAvecBondEventuel), la cible part au cerveau comme
  technique de classe, qui pose l'état lui-même — rien d'autre ne change.
  pisteur.mjs (13).
- LE BUTIN (loot.js, estHerosDuButin) : le compagnon du Pisteur et les zombies
  du Profanateur sont du camp « Allié » mais ce sont des créatures : ils ne
  sont plus participants (ni lot, ni part de la réserve, ni XP), le butin ne
  les attend plus, et seuls debout ils ne valent pas une victoire de héros.
  butin_loot.mjs (16).

## À quoi sert chaque caractéristique (version 210)

Nico : « dans le panneau pour créer les caractéristiques d'un nouveau perso,
rajoute sous chaque carac chaque effet de combat lié, que l'on sache dans quoi
placer les points. Quelque chose de discret et joli. Et sur une ligne en
dessous, ce pour quoi cette carac pourra être jouée en RP. »
- AIDE_CARACS (app.js) : sous chaque compteur de la fenêtre « Répartition »,
  les effets de combat en petites étiquettes — ceux du Codex (feuille
  CRÉA COMP), vérifiés contre le grimoire en ligne en lecture seule ; la
  Constitution, qui n'en module aucun, affiche ses points de vie — puis une
  ligne « RP : » en italique (pour la Dextérité : saut, adresse, acrobaties…).
  Les effets de classe (Ténèbres, Lumière, Vampirisme) n'y sont pas.
- La fenêtre s'élargit un peu (520 px au plus) et défile si l'écran est trop
  bas. aide_caracs.mjs.

## Le bouton « Lever les murs », les bulles de la Forge, les barres de défilement (version 211)

Nico : « je joue mon Géomancien, j'ai posé des murs au sol mais rien ne se
passe quand je veux valider avec le bouton Lever les murs » ; « dans la Forge,
pour tous les sous-effets listés : au survol (PC) une petite bulle explique le
détail de l'effet ; sur iPad, doigt posé 2 secondes, et elle disparaît si on
appuie ailleurs » ; « les barres de défilement sont toutes grises et moches » ;
« les compétences de classe n'apparaissent dans la fiche qu'une fois une
première compétence créée ».
- LEVER LES MURS (combat.js, armerClicFrancPlateau) : pendant la pose, le
  clic franc du plateau arrête tous les clics de la page (pour qu'un toucher
  sur une case ne sélectionne pas aussi un pion) — il n'épargnait que le
  bandeau de placement des héros. Les boutons du bandeau des murs ne
  recevaient donc jamais leur clic. Exemptés. Aucune intention n'arrivait au
  cerveau (Combat_Intentions vide, relu en lecture seule). geomancien.mjs
  valide désormais d'un vrai clic.
- LES BULLES (competences.js, installerBullesEffets) : tout élément qui porte
  data-bulle-effet en a une — les sous-effets des menus, les effets posés sur
  la carte, le grimoire d'ajout. Elle dit le texte de l'effet, ses Notes du
  grimoire (le détail de l'état) et son coût. Souris : au survol. Doigt :
  2 s sans bouger (DELAI_APPUI_LONG_BULLE), sans choisir l'effet ; un appui
  ailleurs la ferme ; un toucher court choisit l'effet comme avant.
  Les menus de sous-effets ne sont plus des <select> (une option native n'a
  pas de survol et ouvre la roue d'iOS) : un menu maison dont la liste s'ouvre
  sur la page elle-même (la carte la coupait, et la Forge, centrée par un
  transform, retient le position: fixed).
- LES BARRES DE DÉFILEMENT (style.css) : une règle pour toute la page, fine,
  curseur de bronze sur rail de parchemin (scrollbar-color pour Chrome, Edge,
  Firefox ; ::-webkit-scrollbar pour Safari). Les zones qui cachaient leur
  barre la gardent cachée.
- LES TECHNIQUES DE CLASSE (competences.js) : sans compétence forgée,
  l'onglet n'affiche que l'invitation à forger. hoplite.mjs.
forge_bulles.mjs.

## Feu sans cadre ; les créatures cassent les murs trop longs à contourner ; murs plus foncés, pied caillouteux (version 212)

Nico : « pour l'effet de feu en persistance terrain, enlève juste le cadre
orange autour du bord de l'hexagone » ; « pour les murs du Géomancien, si les
contourner est trop long, les ennemis préfèrent péter les murs — 6 cases de
détour c'est ok, plus ils les pètent » ; « les murs sont moins foncés que les
piliers » ; « à la base des murs, plein de cailloux de différentes tailles pour
masquer la ligne au sol ».
- LE FEU (combat.js, dessinerHexZonePersistante) : plus de liseré autour de
  ses cases ; les autres nappes gardent le leur. zone_soin_verte_carte.mjs.
- LE DÉTOUR (ia_pure.js, detourDesMurs ; cerveau_combat.js) : le chemin à pied
  jusqu'au contact d'un ennemi, moins ce même chemin murs ôtés. Au-delà de
  DETOUR_MAX_MURS (6), une créature dont la carte ne part pas ce tour-ci
  marche droit vers le mur qui lui barre la route, et le frappe (murAFrapper :
  celui qui la rapproche le plus de l'ennemi, murs ôtés). 6 cases ou moins :
  elle contourne, comme avant. Enfermée, elle frappe toujours.
  geomancien.mjs (8 bis : muraille de 3 contournée, de 21 frappée).
- LA TEINTE (murs_terre.js, ASSOMBRIR_MUR_TERRE = 11) : à roche égale, un mur
  relié sortait nettement plus clair qu'un pilier seul (115 contre 91 de
  clarté moyenne sur douze tirages) ; sa roche est descendue d'autant.
- LE PIED (gravatsAuPied) : bien plus de cailloux, de trois tailles (quelques
  gros blocs, des moyens, beaucoup de petits), à cheval sur la ligne du pied ;
  ils vont maintenant jusqu'à 90 % du bras vers une case voisine (la terre,
  elle, garde ses 30 %) : le pied d'un mur n'est plus nu entre deux cases.
  geomancien.mjs (9 ter : clarté à 5 % près, 12 cailloux au moins au pied
  d'une case de milieu — 48 au moins mesurés).

## Les éléments des sorts, les résistances des créatures ; Profanateur 10 : zombies à 2 cases ; cailloux sur les murs (version 213)

Nico : « Une attaque magique (hors Mot de pouvoir) sera toujours liée à un
élément ; au moment où l'on sélectionne Attaque magique, une popup s'ouvre
avec un élément au choix — de beaux boutons ronds. L'attaque se met dans la
Forge avec en sous-effet gratuit 5 % de chance de brûler, électrifier, glacer
selon l'élément, qu'on peut monter comme un sous-effet classique. Si un
personnage ou un ennemi est insensible au gel, à la brûlure ou à l'électrique,
un sort de la même nature lui fait −20 % de dégâts. Une résistance aléatoire
pour chaque ennemi à partir de Normal : 1, les Élites 2, les Boss 3. » Et :
« Profanateur niveau 10 : il crée ses zombies une case plus loin (2 cases
autour de lui) » ; « pour les murs de pierre, quelques cailloux sur le
dessus, tu peux en mettre plus ».
- LA TABLE (app.js, ELEMENTS_MAGIQUES) : Feu → Brûlé, Foudre → Électrifié,
  Glace → Glacé. estAttaqueElementaire : l'Attaque Magique seule (un Mot de
  pouvoir n'a pas d'élément).
- LA FORGE (competences.js) : poser une Attaque Magique ouvre
  #modale-choix-element (trois disques) ; Annuler ne pose rien. L'action garde
  `element` ; sa pastille (un toucher pour en changer) et l'en-tête le disent.
  L'état de l'élément s'affiche en ligne « OFFERT » à 0 cran, sans coût ; son
  « + » le monte comme un sous-effet (15 % par cran + 5 % offerts, plafond du
  grimoire). Sans élément (technique d'avant), le bouton Forger s'éteint et
  la pastille demande « Choisir un élément ». Enregistré : `element` sur
  l'action, Element sur la technique, l'état offert dans Effets_Compiles.
- LIA (lia_forge.js) : champ element dans son plan ; sinon déduit du récit
  (éclair, givre…), sinon Feu. Les créatures (monstres_competences.js) : un
  élément tiré au sort sur leurs Attaques Magiques.
- LE COMBAT (moteur_effets.js) : +5 % sur l'état de l'élément (durée du
  grimoire), et l'attaque emporte element / etatElement. Le noyau
  (moteur_pur.js, chaineDeDegats 2 ter) retire REDUCTION_SORT_RESISTE (20 %)
  si la cible a cet état dans ses immunités, avant l'armure ; message
  « 🔥 Résiste au feu ». Pas sur des dégâts bruts.
- LES CRÉATURES (monstres.js) : Resistances_Elementaires tirées à la création
  selon le palier (Petit 0, Normal 1, Élite 2, Boss 3) ; une créature plus
  ancienne reçoit les siennes de son identifiant (resistancesParDefaut, même
  tirage sur tous les écrans, rien n'est écrit). atoutCreature les verse
  dans les immunités (atoutRace) : résister = être insensible à l'état, et
  −20 % de ses sorts. Ni le compagnon du Pisteur ni les héros. L'encart du
  tour (combat.js) les montre en petits ronds pointillés.
- texteAtout : « Insensible : Brûlé (−20 % des sorts de Feu) ».
  elements_magiques.mjs, bonus_race_classe.mjs.
- LE PROFANATEUR, NIVEAU 10 (app.js, rayonZombies: 2 ; combat_etat.js,
  profanateurPourZombie) : un ennemi qui meurt à 2 cases de lui (et plus
  seulement au contact) se relève en zombie. profanateur.mjs (4 ter).
- LES CAILLOUX SUR LE DESSUS (murs_terre.js) : 3 à 6 par case de mur, et un
  semis sur chaque bloc assez grand d'un pilier (canvas.nbCaillouxDessus).
  geomancien.mjs (9 ter : 8 au moins sur un mur relié, 6 sur un pilier ; la
  clarté reste à 5 % près).

## L'onglet « Aperçu » (ex-Statistiques) ; l'empoisonnement sur l'énergie max (version 215)

Nico : « vérifie que pour l'empoisonnement, la baisse de fatigue se fait bien
sur la fatigue max de la cible et non actuelle » ; « une refonte graphique
propre de l'onglet Statistiques de la fiche perso, renommé Aperçu, plus jolie
et plus lisible ; l'encart des effets de race et de classe, tu peux le
laisser, le reste change ».
- L'EMPOISONNEMENT (cerveau_combat.js, ticsDeFinDeManche) : c'était déjà
  juste — 10 % de fatigueMax (18 % pour le poison du maître). Un banc le
  fixe avec une énergie max différente de 100 et une cible presque à vide
  (150 max, 30 restants : −15, pas −3). poison_fatigue_max.mjs.
- L'APERÇU (index.html, style.css, afficherStatsCombat) : un en-tête sombre
  (blason à l'initiale, nom, puces Race / Classe / Niveau) ; « Vitalité » en
  trois tuiles (PV, fatigue max, régénération) ; « Réflexes » (esquive,
  parade, critique) et « Résistances » (défenses) en lignes avec une phrase
  d'aide et une jauge sur 100 ; une valeur nulle se grise. Plus de style en
  ligne : tout vit dans la feuille. Les tailles suivent la largeur de
  l'onglet (container queries), pas celle de l'écran : la fiche peut être
  étroite. Les identifiants stat-* sont gardés. L'encart race/classe ne
  bouge pas. apercu.mjs, fiche_race_classe.mjs, bonus_race_classe.mjs.
- LA TRACTION ×3 : vérifiée, une carte vise UNE cible (hors zone) ; trois
  crans de Traction magique font 45 % de chance (15 % par cran, plafond 60 %
  du grimoire), pas trois cibles. En attente d'une décision de Nico.

## La résistance se partage entre les éléments d'un sort (version 216)

Nico : « pour les faiblesses élémentaires, si plusieurs éléments sur une
attaque : −20 % × (insensibilités ÷ éléments) — 1 sur 3 éléments de la
technique, −6,66 % ». (La formule écrite donnait (total − insensibilités) ÷
total ; c'est l'exemple, 1/3 → 6,66 %, qui a été suivi.)
- LES ÉLÉMENTS D'UN SORT (moteur_effets.js) : l'élément choisi pour
  l'Attaque Magique, plus chaque état élémentaire que la carte pose aussi
  (Brûlé → Feu, Électrifié → Foudre, Glacé → Glace). Une Attaque de Feu
  avec Glacé et Électrifié en sous-effets est Feu, Glace et Foudre. Ils
  voyagent sur l'attaque : etatsElements / elements.
- LE NOYAU (moteur_pur.js, chaineDeDegats 2 ter) : −20 % × insensibles ÷
  éléments. Un élément : −20 % (« 🔥 Résiste au feu ») ; trois éléments dont
  un résisté : −6,67 % (« 🔥 Résiste −6,7 % »). Une attaque qui ne porte que
  etatElement (carte d'avant) se lit comme un seul élément.
- LA FORGE (competences.js, elementsDeLaCarte) : l'en-tête montre tous les
  éléments du sort (❄️ GLACE ⚡ FOUDRE).
  elements_magiques.mjs (2 bis, 4, 5).

## La Traction répartie : plusieurs crans, plusieurs cibles (version 217)

Nico : « si je mets 3 tractions magiques sur une compétence, vérifie que je
peux cibler trois cibles différentes » ; « au choix du joueur » ; « s'il y a
une attaque après les tractions, ça tape la première cible ».
- L'EXTRACTION (moteur_effets.js) : la Traction garde ses crans (crans),
  la chance d'un cran (chanceParCran, 15 % au grimoire) et le plafond
  (plafond, 60 %). Sa chance d'ensemble reste celle d'avant (45 % pour 3).
- LE CIBLAGE (cransTractionCiblage, repartirTractionCiblage) : avec plus
  d'un cran et sans zone, chaque toucher pose un cran sur la cible ;
  retoucher une cible tirée lui en ajoute un tant qu'il en reste, puis la
  retire ; une cible de trop est refusée (« Plus de traction à poser »).
  La PREMIÈRE cible porte l'attaque de la carte (cibleUnique) ; un badge
  « 🧲 30 % » (« ⚔️ » sur celle qui prend l'attaque) dit la part de chacune.
  Un seul cran : rien ne change (cible unique).
- L'ENVOI (eclaterTractionRepartie, au début de declencherResolution) : une
  Traction par cible, chance = crans × 15 % (plafond 60 %).
- LE NOYAU (moteur_pur.js) : chaque Traction tire sa cible ; une cible
  seulement tirée qui esquive voit son esquive dite (direEsquiveHorsAttaque).
- Les créatures gardent une cible unique (leur carte ne passe pas par ce
  ciblage). traction_repartie.mjs.

## Les talents (version 218)

Nico : « Dans l'onglet Aperçu, en haut, un bouton pour accéder aux talents du
joueur, avec le nombre de talents à attribuer ; en bas, sous les effets de
race, le rappel des talents pris. Le bouton ouvre une fenêtre inspirée de
l'image : séparée par carac, avec la carac requise ; case grisée quand on n'a
pas la carac ; sous le nom des caracs, le compteur des talents pris ; chaque
ligne défile à gauche et à droite (molette, doigt), avec une flèche tant qu'on
n'est pas au bout. Le talent qui réduit les blessures, plus tard, en rouge. »
Ses réponses : un point aux niveaux 3, 5, 7, 9, rien après ; seule la carac
requise compte (bonus compris) ; une ligne « Général » ; pas de retrait (une
confirmation, et une remise à zéro en DEV) ; modificateur = ⌊(carac − 10) ÷ 2⌋,
jamais négatif ; Pugiliste sans arme ou bagues seulement, Vampire/Vargen en
plus ; Impact sur les dégâts de la compétence ; Bouclier des Sages sur les
deux résistances ; Immunisé : un état d'un tour ne prend plus ; Maître des
éléments au-delà du plafond ; Dégâts illusoires sur le modificateur ; Élan
partagé aux alliés au contact du soigneur ; Diversion s'ajoute au Vargen.
- LES RÈGLES (talents.js, script simple) : les 27 talents de Talents.xlsx,
  rangés par ligne (Général, FOR, DEX, CON, INT, SAG, CHA) et par exigence ;
  pointsTalentsGagnes / Disponibles, etatTalent (prenable, verrou + raison,
  à venir, complet, plus de point), caracPourTalents (base + race/classe +
  objets, sans repasser par atoutRace), modPourTalents, resumeTalent.
- CE QU'ILS DONNENT : window.atoutTalents, fusionné dans atoutRace (app.js)
  comme la race, la classe et la créature. Clés connues (initiative,
  competences, esquive, critique, parade, defPhysique, defMagique, pvMax,
  fatigueMax, soinsRecus, bonusSoin, esquiveOpportunite) et nouvelles :
  degatsPhysiques / degatsMagiques / degatsMotsPouvoir, chanceElementaire,
  chanceEtatsCharisme, chancePoisonPhysique (appliquerEquipementALaCarte,
  moteur_effets.js) ; testsCarac (jets au d20) ; fatigueSurKO, inertieMartiale,
  impactCinetique, elanPartage, bouclierDesSages, degatsIllusoires,
  etatsRaccourcis (combat_etat.js : atouts, tomber, compterPasMarche,
  reductionInertie ; moteur_pur.js : poussée, états, fatigue ; cerveau :
  reposLongDuTour). La fiche porte Talents { id: rangs } et Talents_Choix.
- LA FENÊTRE (talents_ui.js, style.css) : parchemin, sept médaillons dessinés
  en SVG (écu, poing, aile, cœur, livre, œil, étoile à huit branches), le
  compteur pris/possible sous chaque nom, des cases à étiquette de carac
  requise ; pistes à défilement horizontal (molette tant que la ligne n'est
  pas au bout, doigt natif, flèches ‹ › seulement s'il reste à voir) ;
  confirmation « définitif » (choix de carac pour Perfectionnement) ;
  Chanceux en rouge, « à venir ». Bouton « ✦ Talents · n à attribuer » dans
  l'en-tête de l'Aperçu, rappel des talents (chiffres de CE héros) sous
  l'encart race/classe, « Remettre les talents à zéro » dans l'onglet DEV.
  talents.mjs.

## La table des blessures, la victoire et la défaite (version 220)

Nico : « Un personnage joueur tombé KO pendant un combat (sauf le Profanateur
debout grâce à son sursis) reçoit une blessure avant les loot. Une popup
s'ouvre avec marqué défaite ou victoire douloureuse, puis apparaît en fondu,
avec un bruit résonnant et en rouge foncé, le nom de la blessure, et 2 secondes
après le descriptif. Un jet de dé sur le tableau ; le talent qui baisse la
gravité retranche au jet. Dans l'Aperçu, tout en bas, un encart pour les
blessures, avec les jours / combats restants. »
Ses réponses : 1d50, les deux bouts (Égratignure 1-5, Mort 46-50) couvrent
cinq faces ; on retranche le modificateur de CON (jamais négatif) et Chanceux
(5) ; le 16 à pile ou face ; Veinard : −7 au prochain jet seulement ; les
relances (Commotion sévère +4, Estropié) AJOUTENT une blessure ; un héros
relevé n'a rien, une blessure par combat ; un gros popup Victoire / Défaite
pour tous, pas de butin à la défaite ; chacun ne voit que la blessure de ses
héros ; « jours » quand le MJ avance le temps, « combats » à chaque fin (une
réinitialisation compte) ; Soigner en DEV pour les soins en ville ; Tympan
crevé définitif −5 SAG ; Mort : il ne combat plus ; inconscient : indisponible,
décompte dans la fiche ; Amputation de la main = celle du bras ; Amnésie : 2
compétences grisées 2 combats ; « 3 déplacements » = 3 cases par tour ; Choc
cardiaque : régénération fixe à 30 ; Agonie : −3 aux six caracs.
- LES RÈGLES (blessures.js, script simple) : TABLE_BLESSURES (43 lignes, la
  table de Table_des_blessures.xlsx), retraitsJetBlessure, tirerBlessures
  (le jet et ses relances), entreeBlessure (ce que la fiche retient : combats,
  jours, soins, definitif, prochainJet, cartes oubliées), blessuresApresCombat
  / ApresJours / ApresSoins, majBlessuresFinCombat (décompte, Veinard
  consommé, nouvelles blessures, Mort_Definitive), estIndisponible,
  resteBlessure. La fiche porte Blessures [{ uid, id, … }] et Mort_Definitive.
- CE QU'ELLES FONT : window.atoutBlessures, fusionné dans atoutRace (app.js)
  après les talents — fusionnerAtouts additionne désormais les tables de
  nombres clé par clé (testsCarac, caracs). Clés : testsCarac, caracs (aussi
  dans caracPourTalents), esquive, initiative, fatigueMax, pvMaxPct /
  fatigueMaxPct (pvMaxCombattant, fatigueMaxCombattant), soinsRecus ;
  maxCasesParTour (planifierTrajet + aperçu de mouvement.js),
  coutDeplacementMult (coutDuPas), perteParCase (resoudreMouvement :
  Hémorragie), regenFixe (regenererFinDeManche), reposLongTaux /
  reposLongMoins (gainReposLong, combat_etat.js, partagé avec l'Oracle et
  l'encart du repos), fatigueDebutCombat et saignementDebut (payés à l'entrée
  dans combattantDepuisFiche, option debutCombat — un combat repris au tour
  3 ne les repaie pas ; état « Plaie rouverte », tics de fin de manche),
  degatsMelee (appliquerEquipementALaCarte), porteeDistance (porteeAvecArme,
  jamais sous 2), coutCarteMagieDistance (coutFatigueCarte, lu par le volet,
  la carte, le choix et le cerveau), interditDeuxMains / Bouclier /
  ArmureLourde / MainGauche (objetsEquipes : l'objet reste porté mais ne sert
  plus ; l'inventaire dit pourquoi ; les mains des talents aussi),
  cartesOubliees (raisonBlocageCarte, avec l'identifiant de la carte). Les PV
  et l'énergie d'une fiche au-dessus du nouveau maximum y sont ramenés.
- LA FIN DU COMBAT (blessures_ui.js) : cloturerCombat("victoire" | "defaite")
  tire les jets AVANT la transaction, pose Fin_Combat { id, idRencontre,
  issue, participants, blessures } une fois par rencontre (modifierPartie),
  et le poste gagnant écrit les fiches. La victoire (loot.js) l'appelle avant
  le butin ; verifierDefaiteCombat (rejouée avec la victoire, monstres.js)
  quand tous les héros sont à terre — pas de butin. Une réinitialisation d'un
  combat non clos décompte les combats (majBlessuresReinitialisation) ; le MJ
  qui avance le temps décompte les jours (decompterJoursBlessures). Un héros
  mort ou inconscient n'est plus « actif » (persoDocVersFront).
- L'ÉCRAN : le grand « VICTOIRE » / « DÉFAITE » pour tous (au-dessus du
  butin), puis, pour le seul joueur du héros blessé, « Victoire douloureuse »
  ou « Défaite », le nom en rouge foncé en fondu avec un gong (fabrique_sons.js,
  SONS_EVENEMENTS, à part des dix clics), le descriptif 2 s après, le jet,
  « Continuer ». Une fois par poste. L'encart « Blessures » au bas de
  l'Aperçu (reste : jours, combats, soins, définitif) ; « Blessures : soins en
  ville » dans l'onglet DEV. Chanceux devient prenable (−5 au jet).
  blessures.mjs ; talents.mjs mis à jour (Chanceux).

## La Fabrique adoucie ; le Studio d'animation (version 221)

Nico : « Dans les paramètres, la Fabrique de sons : remplace les sons
existants par dix autres plus doux et légers, certains qui s'effacent en
graduation. Ensuite, toujours dans les paramètres, un bouton Studio
d'animation : une fenêtre avec, à gauche, la réplique de la map actuelle du
mode combat, le token du joueur posé sur un hexagone central et à côté un
token ennemi inerte ; à droite la liste des futures animations de combat
que nous allons créer. Un clic sur une animation la joue en direct sur mon
token, et pour chaque animation une petite case à cocher pour me rappeler si
elle est intégrée ou non. »
- LA FABRIQUE (fabrique_sons.js) : dix nouveaux sons sans souffle d'attaque,
  à l'attaque lente et filtrée (`doux`) — Goutte de rosée, Plume, Bulle,
  Souffle de verre, Écho qui s'efface, Carillon lointain, Harpe feutrée,
  Pétale, Brume, Pluie de notes. Quatre s'effacent par paliers (`paliers` :
  la même note, ou une suite de notes, chaque reprise plus faible), deux en
  un long fondu. Le ding perle des boutons du jeu (SON_CLIC_JEU) est gardé à
  part (SONS_JEU) : il sonne toujours tant que Nico n'en choisit pas un autre.
  fabrique_sons.mjs (section 3 réécrite : légèreté, absence de « tac »,
  hauteur, paliers, fondus, dix sons distincts).
- LE CATALOGUE (animations_combat.js, script simple) : ANIMATIONS_COMBAT, une
  entrée par animation — `jouer({ lanceur, cible, calque })` rend une
  promesse, sur des pions posés par leur centre (`translate(-50%, -50%)`,
  comme les `.token-vtt` du plateau) : le jour où une animation est intégrée,
  le combat l'appelle sur ses vrais pions avec le même code
  (jouerAnimationCombat). Dix pour commencer : Coup d'épée, Coup reçu, Soin,
  Bouclier magique, Boule de feu, Esquive, Gel, Poison, Coup critique, Mise à
  terre. Chacune nettoie ce qu'elle pose.
- LE STUDIO (studio_animation.js, style.css) : bouton « Studio d'animation »
  sous la Fabrique. À gauche, la réplique de la carte du combat — la même
  image, la même taille d'hexagone, la même opacité, les mêmes cases gommées
  (une instance Plateau à lui, le plateau du combat n'est jamais touché) ;
  le pion du héros de ce poste (au choix s'il en a plusieurs) sur la case
  libre la plus proche du centre, l'ennemi au pion commun juste à côté ;
  glisser, molette, pincer, −/+, Recentrer. À droite, la liste numérotée :
  un clic joue l'animation (la ligne s'allume), la case « Intégrée » s'écrit
  dans Studio_Animations/etat (Firestore, fusion — l'iPad et le PC voient la
  même chose) et dans ce navigateur ; un compteur « n / 10 intégrées ».
  studio_animation.mjs.

## Le Studio : pions mobiles, sons, tout part du héros vers l'ennemi (version 222)

Nico : « Tu me feras un bouton pour bouger le token joueur et l'ennemi. Quand
on jouera une animation il y aura du son aussi. Et l'animation sera toujours
sur le token joueur et en direction de l'ennemi. »
- DÉPLACER LES PIONS (studio_animation.js) : le bouton « ✥ Déplacer les
  pions » arme le glisser (les pions s'illuminent, « Glisse un pion sur une
  case libre ») ; un pion suit le doigt ou la souris et se pose au centre de
  la case la plus proche — une case de la carte (ni gommée, ni mur) qui n'est
  pas celle de l'autre pion ; sinon il revient. Bouton éteint, glisser fait
  glisser la carte. Jouer une animation désarme le déplacement.
- TOUJOURS LE HÉROS, VERS L'ENNEMI (animations_combat.js) : chaque animation
  porte son `sens` (« vers l'ennemi » / « sur soi ») et calcule tout sur
  l'axe héros → ennemi au moment de jouer (axe). L'élan au corps à corps est
  borné (un ennemi loin ne fait pas traverser la carte) ; le Gel et le Poison
  partent désormais du héros (trait de glace, fiole) ; le coup reçu le fait
  reculer à l'opposé de l'ennemi, la chute aussi ; le bouclier brille côté
  ennemi ; l'esquive s'écarte perpendiculairement, le coup traverse la case.
- LES SONS (fabrique_sons.js, SONS_COMBAT, jouerSonCombat) : quinze sons
  fabriqués sur place, au volume du jeu — lame (souffle, impact), coup sourd,
  soin, bouclier, feu (départ, explosion), esquive, gel (départ, impact),
  poison (départ, bulles), critique (charge, impact), chute. Les attaques ont
  deux temps : l'élan, puis l'impact.
- UNE LECTURE À LA FOIS : les outils d'une animation (poser, son, attendre…)
  sont liés à sa lecture ; une autre animation lancée, ou le studio fermé
  (annulerAnimationsCombat), et la première se tait — plus de son en
  attente, plus d'effet posé.
  studio_animation.mjs (sections 8 à 10 : glisser, cases refusées, axe à
  l'ouest puis à l'est, sons de chaque animation, rendu des quinze sons,
  volume, coupure).

## Le Studio : les textes flottants du combat (version 223)

Nico : « Et faut aussi pour l'animation les textes flottants comme en combat
au-dessus des tokens. »
- LE MÊME DESSIN QUE LE COMBAT, PAS UNE COPIE : afficherMessageFlottantHex
  (mouvement.js) accepte `options.ecran` ({ conteneur, x, y, cle }) pour poser
  son message ailleurs que sur le plateau, et rend le message ;
  afficherFlashDegatToken (moteur_effets.js) accepte `options.pion` (l'éclat
  et la petite barre sous CE pion). Sans ces options, rien ne change en combat
  (message_flottant_taille.mjs, jauge_token.mjs inchangés).
- LES OUTILS DES ANIMATIONS (animations_combat.js) : `texte` (un mot au-dessus
  d'un pion) et `jauge` (le chiffre + l'éclat + la barre qui se vide), aux
  couleurs du combat (COULEURS de pont_combat.js ; l'état posé en violet,
  comme les zones persistantes). Épée « -12 » sur l'ennemi ; coup reçu
  « -12 » ; soin « +15 » vert ; bouclier « +12 🛡️ » cyan ; boule de feu
  « -14 » puis « Brûlé ! » ; gel « -9 » puis « Glacé ! » ; poison « -5 » puis
  « Empoisonnement ! » ; esquive « Esquivé 💨 » ; critique « Critique ! » en
  grand sur le héros AVANT le coup (comme pont_combat.js), puis « -24 ! » ;
  mise à terre « -30 » puis « À terre ! ». Ils montent et s'effacent seuls
  (2,2 s) ; une lecture interrompue les efface (classe anim-message).
  studio_animation.mjs, section 11.

## Piste d'initiative : qui a choisi ; deux sorts sur une carte ; la bulle au doigt ; le pion dans l'Aperçu (version 224)

Nico : « Dans les bulles d'initiative, quand on attend que les joueurs
choisissent une compétence : un sablier pour ceux qui n'ont pas choisi, une
coche verte pour ceux qui ont choisi. — Je ne peux pas mettre deux attaques
magiques différentes sur une même compétence. — Sur iPad, quand je laisse le
doigt sur un sous-effet dans la Forge, ça ne me met pas de bulle. — Dans
l'Aperçu, à la place du rond jaune à l'initiale, pour exactement la même
taille, l'image du token du joueur. »
- LA PISTE (combat.js, afficherPisteInitiative / badgeChoixPiste) : pendant
  la préparation, chaque héros porte en haut à droite de son portrait un
  sablier (qui se retourne) ou une coche verte. La règle est celle du titre
  « En attente des joueurs » : on a choisi dès qu'on est dans la file de la
  manche ou dans Ont_Joue_Ce_Round. Rien sur une créature (monstre, compagnon,
  zombie, illusion — estJoueurDeLaPiste), rien sur un héros hors jeu, rien en
  résolution. La coche ne rebondit qu'à son apparition (tuile.dataset.choix),
  pas à chaque notification. piste_choix.mjs.
- DEUX ATTAQUES MAGIQUES (competences.js, attaqueEncorePermise) : une carte
  ne porte toujours qu'une attaque de base, sauf l'Attaque Magique, qui peut
  s'y poser une deuxième fois (MAX_ATTAQUES_MAGIQUES = 2) dans un AUTRE
  élément. La popup des éléments grise celui que la carte a déjà (« déjà sur
  la carte »), à la pose comme au changement par la pastille. Seulement entre
  Attaques Magiques : un Mot de pouvoir ou une Attaque légère restent seuls.
  Au combat (moteur_effets.js), chaque attaque garde SON élément : l'état
  qu'une autre Attaque Magique de la carte pose (son offert, ses crans) est à
  elle ; un état élémentaire posé par une action à part reste à toute la
  carte, comme avant. Une créature insensible au gel n'encaisse donc moins
  que l'éclat de glace, pas la boule de feu. deux_attaques_magiques.mjs.
- LA BULLE AU DOIGT (competences.js, installerBullesEffets) : Safari
  abandonne le pointeur au bout d'une demi-seconde de doigt immobile
  (sélection de texte, glisser-déposer) et envoie `pointercancel`, qui tuait
  le minuteur des 2 s. Sur un écran tactile, ce sont maintenant les
  événements « touch » qui décident : touchmove au-delà de 10 px (défilement)
  ou touchend/touchcancel annulent, un deuxième doigt aussi ; pointercancel
  seul n'annule plus. Et plus rien ne se sélectionne sous le doigt
  ([data-bulle-effet] : user-select et touch-callout à none).
  forge_bulle_ipad.mjs (navigateur tactile : la séquence d'iOS rejouée, et un
  vrai appui long par le protocole du navigateur) ; forge_bulles.mjs inchangé.
- LE PION DANS L'APERÇU (creation_personnage.js, remplirBlasonApercu) : le
  blason porte l'image du pion (urlToken / URL_Token), rognée en cercle dans
  le même rond de 62 px et le même cadre doré (68 px en tout, avant comme
  après). Pas de pion, ou un pion qui ne se charge pas : l'initiale revient.
  apercu_pion.mjs ; apercu.mjs inchangé.

## La Fabrique, en sobre : dix sons à la manière d'Apple (version 225)

Nico : « Les sons que tu as faits dans la Fabrique, ça ne va pas. J'aimerais
quelque chose de plus sobre, un peu comme les bruits Apple. Refais-moi des
propositions de sons. »
- DIX NOUVEAUX SONS (fabrique_sons.js, SONS) : Tic (une touche de clavier),
  Tac (un petit coup de bois), Bascule (un interrupteur : deux clics serrés),
  Pop (une bulle qui éclate), Goutte (un « plic » qui remonte), Tinte (un
  tintement de métal), Verre (un verre effleuré), Validation (deux notes qui
  montent), Retour (deux notes qui redescendent), Envoi (un souffle qui file
  vers l'aigu). Très courts, très propres, une seule idée par son.
- TROIS MATIÈRES : le clic (un souffle de quelques millisecondes sur une note
  très brève), la note qui glisse (pop, goutte), la cloche FM (une note dont
  l'éclat s'éteint avant elle : le timbre « verre poli »). Les anciennes
  briques douces (doux, paliers) sont parties avec la série d'avant.
- Le ding perle des boutons du jeu (SONS_JEU), les sons d'événement et ceux
  du combat ne changent pas.
  fabrique_sons.mjs, section 3 : dix sons nouveaux, crête sous 0,3, aucun
  au-delà de 0,8 s, au moins cinq sous 0,2 s, la moitié de la crête en moins
  de 15 ms (sauf le souffle de l'Envoi), deux attaques au plus, dix sons
  vraiment différents.

## La Goutte, son de tous les menus (version 226)

Nico : « Ok, remplace tous les sons menu par : la goutte. »
- UNE SEULE LIGNE (fabrique_sons.js) : SON_CLIC_JEU = "goutte", la n° 5 de la
  Fabrique. Elle joue à chaque clic de bouton (jouerSonClic) et, à mi-volume,
  au survol des menus et à l'ouverture du chat ou du combat
  (jouerSonSurvolParchemin, app.js) — les deux seules portes du son des
  menus.
- LE DING PERLE S'EN VA : il n'était plus que le son des menus ; SONS_JEU
  disparaît avec lui, et jouerSonFabrique ne cherche plus que dans les dix
  sons de la Fabrique. Les sons d'événement (victoire, défaite, blessure) et
  ceux du combat ne changent pas.
  fabrique_sons.mjs, section 5 : clic, survol, vrai bouton de la page, vrai
  bouton du menu latéral — tous la Goutte ; plus aucune trace du ding perle.

## Le Studio d'animation : tout le catalogue, avec ses sons (version 227)

Nico : « Tu vas m'intégrer et me créer une animation dans le Studio
d'animation de tous ces effets que je vais te donner (certains sont déjà dans
le Studio). Pour rappel, la vue du token est une vue de haut sur la map. Tu
vas me créer l'animation et le son qui vont bien. » Suivait sa liste en neuf
sections : 142 entrées, dont les dix premières.
- LE CATALOGUE (animations_catalogue.js) : 132 nouvelles animations, dans
  l'ordre exact de la liste (ORDRE_ANIMATIONS_COMBAT), rangées en sections
  (1. Déplacements … 9. Talents) et, pour les classes, en sous-sections
  (Sorcier, Protecteur, Assassin, Médicus, Chasseur de mages, Profanateur,
  Pisteur, Géomancien, Sentinelle, Oracle, Vampire). Les dix premières y
  prennent leur place ; Empoisonnement gagne son tic (énergie puis PV), Glacé
  sa présence (le sol reste gelé), comme la liste les décrit.
- VUE DE DESSUS : ce qui s'élève grossit (le bond, à 1,42), son ombre reste
  au sol ; ce qui tombe du ciel rapetisse jusqu'à sa case (un renfort, le
  déploiement) ; un mur de terre surgit en grossissant.
- LA GRILLE (scene.grille, fournie par le Studio ; le combat fournira la
  sienne) : la marche va de centre d'hexagone en centre d'hexagone, une zone
  couvre des hexagones entiers (sauf une case gommée), un allié, un renfort,
  un zombie, un compagnon se posent sur une vraie case voisine libre.
- LE MOTEUR (animations_combat.js) : la vitesse de lecture
  (VITESSE_ANIMATIONS) passe par toutes les durées ; tout ce qu'une lecture
  pose ou anime est suivi et nettoyé à la fin (les pions reviennent tels
  quels) ; de nouveaux outils communs : chemin, parcourir/rentrer, figurant,
  icône, aura, rayon, éclair, hexagone, lien, filer, étoiles, voile,
  brouillard, mur, gravats, ombre, énergie.
- LES SONS (fabrique_sons.js, SONS_COMBAT) : 84 sons de plus (99 en tout),
  fabriqués sur place — pas, bond, réception, tir, foudre, mots de pouvoir,
  lumière, parade, bris de verre, chaînes, étourdi, zones, mur de terre,
  zombie, téléport, nuée… ; chaque animation joue les siens.
- LE STUDIO (studio_animation.js) : la liste en sections, des puces 1 à 9
  pour sauter d'une section à l'autre, un bouton 🐢 Ralenti (×0,4).
  studio_catalogue_1.mjs (la liste, la grille, le ralenti, sections 1 à 4)
  et studio_catalogue_2.mjs (vue de dessus, figurants, Transfert, Mur de
  terre, sections 5 à 9), avec _studio_commun.mjs ; studio_animation.mjs
  suit toujours de près les dix premières.

## Le Studio en vraies conditions : les déplacements restent (version 228)

Nico : « Assure-toi que, pour tester les animations qui font bouger le pion,
ça fasse bouger le pion, qu'on puisse voir l'animation dans de vraies
conditions. » Et : le Studio est à part, pour tester, puis décider de
l'intégrer ou non — rien du jeu réel n'est touché (murs de terre,
persistance des effets de terrain, mouvement, combat : aucun de ces fichiers
ne change, et seul le Studio appelle ces animations).
- UN DÉPLACEMENT RESTE (animations_combat.js, o.arriver) : un pion qui marche,
  bondit, se replie, fuit, est poussé, attiré, éjecté par un mur… finit sur sa
  nouvelle case, comme en combat. La scène la lui donne (scene.poserPion) et
  l'animation qui l'y a mené s'efface au même instant : pas de saut, pas de
  retour au départ. L'animation suivante part de là. Le Transfert échange
  vraiment les deux cases (scene.echangerPions).
- EN VRAIES CONDITIONS, la Traction attire un ennemi lointain jusqu'au
  contact (3 cases au plus) et l'Inertie martiale fait charger le héros
  jusqu'à lui ; au contact, elles gardent leur démonstration.
- LE STUDIO (studio_animation.js) : un bouton « ⟲ Replacer » ramène les pions
  sur leurs cases de départ (celles qu'on a choisies avec « ✥ Déplacer ») ;
  un pion sorti du cadre fait recentrer la caméra.
  studio_catalogue_1.mjs / _2.mjs (_studio_commun.mjs : DEPLACENT_HEROS,
  DEPLACENT_ENNEMI) : chaque animation qui déplace laisse le pion sur une
  autre case, posé net ; les autres ne bougent personne ; « Replacer » ramène
  toujours la scène ; Traction et Inertie à trois cases.

## Le Studio : le ciblage à la main, et le terrain du jeu (version 229)

Nico : « Assure-toi que pour des sorts style persistance de terrain et
autres, genre murs de pierre, on puisse cliquer sur les hexagones à cibler.
Et pour ceux-là, mets dans le Studio les mêmes que ceux qu'on a implantés
dans le jeu actuellement. On pourra les retravailler en partant de ça. »
- LE CIBLAGE (studio_animation.js) : dix animations portent `ciblage` et un
  🎯 dans la liste — Attaque de zone, Aperçu d'une zone ciblée, les quatre
  zones persistantes, Gravats, Mur de terre, Mur sous un combattant, Mur
  effondré. Les toucher ouvre un bandeau (comme la pose des murs au combat) ;
  chaque touche sur la carte prend une case ou la rend (un glissé déplace
  toujours la carte) ; une case gommée, un mur sur son propre pion… sont
  refusés, avec la raison ; « Lancer » joue l'animation sur ces cases-là,
  « Annuler » ne pose rien. Les cases visées se voient comme au combat : la
  zone teintée de rouge et cernée (dessinerHexesZoneCiblage, sorti de
  dessinerZoneAoE dans moteur_effets.js, dessin inchangé), les piliers à demi
  transparents des murs à venir, le mur à abattre cerné de rouge. Jouée sans
  cases (« jouer » direct, les bancs), chaque animation garde les siennes.
- LES DESSINS DU JEU, À L'IDENTIQUE. Les nappes : dessinerHexZonePersistante
  et ses <defs> (combat.js), exposés tels quels (RENDU_ZONES_PERSISTANTES) ;
  le Studio passe seulement le centre de la case et un suffixe d'identifiants
  (« -studio ») — le combat, lui, dessine au caractère près ce qu'il dessinait.
  Les murs : la roche de dessinerMurTerre (murs_terre.js), reliée à ses
  voisines et composée en un seul canvas au-dessus des pions, comme
  appliquerMursTerre (mêmes mesures : GEOMETRIE_MURS_TERRE). Les gravats : le
  tas de dessinerGravatsTerre. Le moteur (animations_combat.js) prend ces
  dessins quand la scène les donne (scene.terrain) : o.mur fait sortir la
  roche de terre, o.gravats pose le tas, o.nappe la nappe ; o.effondrer
  enfonce la roche ; sans terrain, les dessins d'avant.
- LE TERRAIN RESTE sur la carte du Studio, comme en combat : les zones, les
  murs (qui bloquent leur case : ni pion posé, ni marche au travers), les
  gravats. Un mur levé sur la case de l'ennemi l'éjecte sur une case voisine
  libre ; un mur qui s'effondre laisse ses gravats, et ses voisins se
  redessinent avec leur moignon cassé. « ⟲ Replacer » efface tout le terrain.
  studio_terrain.mjs : le dessin des nappes identique au jeu (6 types), le
  plateau du combat qui dessine toujours les siennes ; le ciblage à la souris
  (prendre, rendre, refuser, Lancer, Annuler) ; la zone de feu posée sur les
  cases touchées avec la nappe du jeu ; trois murs reliés qui restent,
  bloquent, et partent avec Replacer ; un héros encerclé qui ne peut plus
  marcher ; l'ennemi repoussé ; l'effondrement en gravats ; les dix
  animations ciblées jouées sans cases. studio_catalogue_1/_2 comptent
  maintenant les nappes et la roche du jeu.
  Au passage : l'aide « Glisse un pion sur une case libre » du bouton
  « ✥ Déplacer » suit la carte par `~` (le bandeau de ciblage s'est glissé
  entre la carte et la barre) ; zone_soin_verte_carte.mjs lit la nouvelle
  signature de dessinerHexZonePersistante.

## Le Studio retouché, et dix animations implantées en jeu (version 230)

Nico, à propos de la taille des pions : « on est d'accord que les animations
sont liées aux tokens, donc si on réduit la taille des hexagones ça ne
changera rien aux animations ? » — Les effets (éclats, gouttes, icônes) se
règlent sur la taille du PION à l'écran ; les déplacements, eux, vont de
centre de case à centre de case. Réduire les hexagones raccourcit donc les pas
(toujours une case pile), sans changer la taille des effets autour du pion.
La différence vue dans le Studio venait de lui : sans pion de combat pour le
héros, il prenait 92 % du rayon de case. Chaque pion du Studio prend
maintenant la taille de son pion de combat (celle du héros, celle d'une
créature posée sur la carte pour l'ennemi, 55 par défaut comme
appliquerTokensVTT), dans la même proportion qu'au combat.

Les retouches du Studio (animations_catalogue.js, animations_combat.js) :
- MARCHE : de petits sauts case par case (o.parcourir, `saut` : il grossit en
  quittant le sol, retombe un peu tassé, se redresse), un pas sur l'herbe et la
  terre (son « pas-herbe »), la fatigue garde son « -1 ⚡ ».
- TERRAIN DIFFICILE : plus de cailloux qui pop ; la même marche, plus lente,
  « -2 ⚡ », les pas lourds.
- MARCHE GELÉE : plus de teinte sur le pion ; la même marche, quelques
  cristaux de givre qui poussent sous le pion à chaque pas, la glace qui
  craque (« pas-glace »).
- REPLI : plus de logo bleu ↩️ ; FUITE SOUS LA PEUR : plus de smiley ;
  ENTRÉE DANS UNE ZONE : un vrai bruitage électrique (« decharge ») dans la
  zone électrique. Trois sons neufs (fabrique_sons.js) : 102 sons de combat.

Implantées en jeu (animations_jeu.js, nouveau ; le catalogue en garde les
gestes, « En jeu », découpés au pas) : Marche du Vargen, Bond, Repli, Pas de
retraite offert par l'arme, Fuite sous la Peur, Fuite sous la Confusion,
Hémorragie interne, Arrivée d'un renfort, Apparition d'une Illusion,
Déploiement des pions.
- LE MOTEUR joue désormais aussi des lectures « jeu »
  (jouerAnimationJeu) : plusieurs à la fois, sans couper le Studio, et leur
  ménage attend que poussière et silhouettes aient fini de s'effacer.
- LA SCÈNE DU COMBAT (sceneDeCombat) : les vrais pions, la grille du plateau
  (VTT_POS + case × VTT_SCALE), le calque des pions ; un pion arrivé est posé
  par positionnerTokenVTT.
- LE NOYAU dit la manière d'un pas : `fuite: "peur" | "confusion"`
  (resoudrePeur, et le confus de suitesDeConfusion), `offert` (la case d'un pas
  de retraite, resoudreMouvement). Le pont la transmet (pont_combat.js), avec
  le `transfert` d'un bond, la case qui saigne (`tic` Hémorragie interne →
  `hemorragie`), l'illusion qui arrive ; l'annonce du repli devient un geste
  (« Repli : sans opportunité », sans icône) ; regime_cerveau.js donne les
  effets (repli, hemorragie, arrivee).
- LES PAS (jouerAnimationPas, mouvement.js) : repli, fuite, case offerte,
  foulée du Vargen (son atout de race) passent par le Studio ; ce qui ne se
  dit qu'une fois (« Foulée du Vargen : ½ ⚡ », « Peur : il s'enfuit ! ») au
  premier pas du trajet ; la fuite garde sa teinte le temps de la fuite. Les
  autres pas gardent la marche d'avant ; l'écran qui anticipe sa marche
  marque lui aussi les cases offertes.
- LE BOND (jouerAnimationBond) : l'envol, l'ombre, la réception — le
  Transfert garde son saut.
- LES ENTRÉES EN SCÈNE : renfort et illusion annoncés par le journal, et le
  déploiement (un pion qui paraît avant que la première manche ne se joue,
  pas au chargement de la page, pas en plein combat). Le vrai pion reste caché
  (.pion-en-entree, reposée par appliquerTokensVTT) pendant que sa copie
  descend ; appliquerTokensVTT garde les effets en cours au redessin.
  animations_en_jeu.mjs : le noyau et le pont (fuite, offert, transfert,
  hémorragie, illusion), puis le vrai plateau — chaque pas son geste, ses
  sons, ses mots une seule fois, posé net sur sa case ; un humain et le
  Transfert inchangés ; renfort, illusion, déploiement, un redessin en pleine
  entrée, pas de déploiement en plein combat. studio_deplacements.mjs : les
  retouches du Studio, les sons neufs, la taille des pions. repli.mjs lit la
  nouvelle annonce ; studio_animation.mjs compte 102 sons.
