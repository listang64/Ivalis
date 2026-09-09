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
node suppression_perso.mjs  # effacer un héros emporte tout ce qui lui est lié
node occupation_cases.mjs   # qui occupe vraiment une case (morts et fantômes exclus)
node zone_assombrissement.mjs # où l'on peut poser une zone à distance, et l'écran noirci
node zones_ia.mjs           # les zones sont posées, orientées et bien placées
node piste_initiative.mjs   # la piste tient à droite du panneau, bulles réduites
node fenetre_tour.mjs       # la fenêtre de tour : nom coloré, effets détaillés, zone dessinée
node sequence_tour.mjs      # le journal d'événements : ordre, trous, rattrapage
node etat_combat.mjs        # LE NOYAU PUR : dés à graine, état du combat, invariants (sans réseau)
node moteur_pur.mjs         # la chaîne de dégâts, maillon par maillon (10 000 cartes au hasard)
node mouvement_pur.mjs      # chemin, coût des cases, attaques d'opportunité (1 000 trajets)
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
node jauges_panneau.mjs     # vitalité et énergie du panneau gauche, à chaque étape
node stats_fiche.mjs        # les retouches de la fiche perso suivies jusqu'au combat
node coup_critique.mjs      # le jet de critique, ses dégâts doublés et ses effets imposés
node atouts_races.mjs       # les sept peuples et leurs avantages, mesurés un par un
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
