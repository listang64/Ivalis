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

**La trace du combat.** `trace_combat.js` est chargé avant tout le reste et
écrit dans la console une ligne par chose qui arrive : événement publié, reçu,
retenu par le OK, rejoué, fin de tour, verrou de l'IA — et surtout **chaque
changement de points de vie, avec sa cause** (`[direct]`, `[rejeu]`,
`[calcul IA]`, `[base rendue]`, `[écran retenu]`). C'est le seul moyen de voir
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
