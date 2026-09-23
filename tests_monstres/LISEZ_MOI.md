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
node migration_effets.mjs   # la mise à jour de la base des effets : bonne cible, sans danger à relancer
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
node points_apparition.mjs  # les deux repères d'apparition, et la dispersion des pions
node reinit_plateau.mjs     # la réinitialisation vide le plateau, puis enchaîne le déploiement
node ecriture_pions.mjs     # les pions écrits en base atterrissent bien dans la carte Tokens
node fin_de_tour.mjs        # un document introuvable ne fait plus tomber tout le round
node regeneration_fin_de_tour.mjs # la régénération ne tombe qu'au passage au tour suivant, jamais avant
node titres_bannieres.mjs   # les noms de carte rétrécissent au lieu d'être coupés
node bouton_forge.mjs       # le + de la Forge devient un sablier pendant l'attente
node croix_suppression.mjs  # la croix rouge du mode dev efface une technique partout
node mise_de_cote.mjs       # la case à cocher qui retire un héros du jeu, sans l'effacer
node ecran_chargement.mjs   # le sceau, le préchargement, et le transport Firestore
node compteurs_combattant.mjs # vitalité et énergie du combattant suivi, à chaque étape
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
node ecritures_combat.mjs   # un seul poste écrit le résultat d'une carte, créature comprise
node cent_combats.mjs       # 100 combats à 3 joueurs, ratio de victoires
node zone_persistante_soin.mjs # une carte de soin laisse une zone verte qui soigne sans dépasser les PV max
node provocation.mjs        # l'effet Provocation (portée moteur), réservé aux joueurs
node barre_progression_creation.mjs # la barre de progression et les phrases humoristiques à la création
node reveil_arriere_plan.mjs # un onglet iPad endormi en pleine animation ne bloque plus la sync pour de bon
node poussee_traction_allies.mjs # Poussée/Traction peuvent viser un allié, sauf combinées à une attaque
node etalement_sans_degats.mjs # Durée étalement dégâts grisée sur une carte sans attaque
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
