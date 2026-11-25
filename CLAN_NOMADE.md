# Le clan nomade — suivi du chantier

Le document de référence est « Ivalis — Le clan nomade » (Claude Docs, rédigé avec Nico). **Il fait foi.**
Ce fichier suit sa mise en œuvre étape par étape : ce qui est fait, dans quelle version, et les points
restés ambigus (notés ici plutôt qu'inventés).

## Étape 0 — Inventaire (v477)

Les modules se parlent surtout par `window.*` : le graphe (Graphify) donne les définitions, la recherche
de texte donne les appels croisés. Inventaire fait sur `dev` à la v476 (commit 22d256a).

### Retiré (étape 1)

| Quoi | Où |
|---|---|
| La page « Le village » (Eraldur, image du village, ses lieux cliquables) et son entrée du sommaire | `grimoire.js` : `ENTREES_INDEX`, `pagesVillage`, `pageVillage`, `boiteVillage`, `LIEUX_VILLAGE`, `lieuxDuVillage`, `allerAuVillage`, `IMAGE_VILLAGE*` |
| Eraldur, le village des aventuriers (pastille dorée, création par IA, toucher qui ouvre la page du village) | `villages_regionaux.js` : `TAILLE_ERALDUR`, `poserPastilleEraldur`, `creerEraldur`, `promptEraldur`, `inventerEraldur`, `SUJET_ERALDUR`, `REPUTATION_MIN_ERALDUR`, `dansEraldur`, `groupeDansEraldur`, `villageEraldur` ; `index.html` : les boutons DEV « Placer / Créer Eraldur » |
| Le Hall de guilde (double page, ses salles, l'outil DEV des encarts du tableau) | `grimoire_guilde.js` (fichier entier), `grimoire.js` : `pagesGuilde`, `definirGuilde`, l'action `guilde` |
| Le tableau des missions : les 6 missions renouvelées tous les 30 jours, les feuilles qui glissent, le vote d'acceptation (post-it), les décalages de niveau normale / difficile | `missions_guilde.js` : `NB_MISSIONS`, `DUREE_JOURS`, `tirerDifficultes`, `DECALAGES`, `tirerDecalage`, `decalageDe`, `renouveler`, `aRenouveler`, l'écoute du tableau (`Guilde/Tableau`), `htmlEncart`, `ajusterEncarts`, `ouvrirFeuille`, `fermerFeuille`, `voterMission`, `refuserMission`, `retirerDuTableau`, `majPostit`, `decalageNiveauMission` ; `monstres.js` (lecture du décalage) |
| Le bouton « Les clans », le Livre des clans (fanion, nom du clan, double page par joueur), la fondation d'un clan et sa réinitialisation dans les Paramètres | `grimoire_clans.js` + `grimoire_clans.css` (fichiers entiers), `grimoire_groupe.js` (« Les clans › »), `grimoire_parametres.js` (vue « Les clans »), `grimoire_fiches.js` (`pageBanniereClan`, le fanion, `titreClan`) |

### Réutilisé

| Quoi | Où | Pour |
|---|---|---|
| Le créateur d'une mission (MIA_MISSIONS), son plan caché (MIA_PLAN_MISSION), son lieu (POI), son suivi par le narrateur (MIA_SUIVI_MISSION), sa fin et ses récompenses | `missions_guilde.js` : `promptMissions`, `nettoyerMission`, `installerMission`, `preparerMission`, `promptPlan`, `contexteMissionMJ`, `suivreApresMJ`, `terminerMission`, `ecrireNotes`, `voterAbandon`, `marqueMission` | Les tâches (étape 10) |
| La double page « Mission en cours », le sceau « Quête accomplie » | `grimoire_mission.js`, `grimoire_recit.js` | « Tâche en cours » (étape 10) |
| Le voyage de groupe sur la carte (marche, jours qui défilent, POI, votes, date) | `voyage_groupe.js` | Expéditions (étape 6) et déplacement du camp (étape 11) |
| Le feu de camp et les discussions de la route | `voyage_groupe.js` | Vie du camp, conseil |
| La discussion privée | `discussion_privee.js` | Clic sur un personnage du camp (étape 3) |
| Les fils invisibles (affinités, âme, souvenirs) | `social.js`, `social_pur.js`, `grimoire_liens.js` | Moral, liens entre membres du camp (étapes 4, 8) |
| Le recrutement actuel (demandes détectées dans le RP, suiveurs) | `groupe.js`, `groupe_pur.js` | Recrutement vers le camp (étape 12) |
| Le détourage (génération sur fond magenta, puis détourage) | `app.js` (portraits), `objets_ia.js`, `grimoire_clans.js` (`detourerFanion`, avant son retrait) | Avatars du camp (étape 3) |
| L'outil DEV des encarts (créer, déplacer, redimensionner, sauvegarder des boîtes) | `grimoire_guilde.js` (avant son retrait), `grimoire.js` | Encarts du camp (étape 3) |
| La table des blessures, l'XP, les niveaux | `blessures.js`, `experience.js`, `montee_niveau.js` | Repos, soigneur, entraîneur (étapes 5, 12) |
| Les villages régionaux (lieux qu'on visite) | `villages_regionaux.js` | Commerce, recrutement |
| La réputation des lieux | `social.js`, `villages_regionaux.js` | Réputation par région (étape 13) |

### Modifié

| Quoi | Où | Étape |
|---|---|---|
| Le sommaire : « Le camp » à la place du village ; « Expédition » à la place de « Groupe » ; les chapitres deviennent des expéditions | `grimoire.js`, `grimoire_recit.js`, `grimoire_groupe.js` | 3, 6 |
| Le narrateur « en off » devient Thémès | `ia_master.js`, `combat_rp.js` | 7 |
| L'onglet « Mission » devient « Tâche en cours » | `grimoire_mission.js`, `grimoire.js` | 10 |
| Les recrues rejoignent le camp au lieu de suivre le groupe | `groupe.js`, `social.js` | 12 |
| Les pages de gauche des régions portent la réputation du groupe | `grimoire_regions.js` | 13 |
| La liste des personnages (ex-Livre des clans) : la liste des personnages du joueur, avec « + Un nouvel aventurier » | `grimoire_fiches.js` | 1, puis 6 |

## Avancement

| Étape | Version | État |
|---|---|---|
| 0 — Inventaire | v477 | fait |
| 1 — Nettoyage de l'ancien système | v477 | fait |
| 2 — Le camp, Thémès et les données | v478 | fait |
| (Nico) Plus de clans : le menu « Mon héros principal » | v479 | fait |
| 3 — La page du camp | v480 | fait |
| 4 — Gestion du camp | v481 | fait |
| 5 — Le temps et la journée du camp | v482 | fait |
| 6 — Les expéditions | v483 | fait (sauf : jouer un personnage du camp, voir plus bas) |
| 7 — Thémès dans le récit | v484 | fait |
| 8 — Le retour au camp | v484 | fait |
| 9 — Le conseil | v485 | fait |
| 10 — La tâche en cours | v486 | fait |
| 11 — Le déplacement du camp | v487 | fait |
| 12 — Le recrutement | v488 | fait (sauf : les compétences d'une recrue, voir plus bas) |
| 13 — Réputation et finitions | v489 | fait |

## Points ambigus

- **Étape 1, le Livre des clans — tranché par Nico (v479).** « Les clans et ce système de clan n'existent plus ;
  pour la liste des persos, quelque chose de plus simple, comme une liste déroulante pour sélectionner son héros
  principal. » Les pages de clans sont retirées. Sur la page du Groupe, le bloc **« Mon héros principal »** : un
  menu déroulant de ses propres personnages (dans l'ordre de leur création), « Sa fiche » et « + Nouvel
  aventurier ». Le choix est gardé sur la partie (`Heros_Principaux`) ; le héros principal est aussi le héros
  joué (les autres passent au repos) jusqu'à la page Expédition. Les admins ne changent plus le héros des autres
  joueurs (c'était une case des clans).
- **Étape 2, « le logo du camp sur la carte globale ».** Le document dit aussi que le camp est « représenté
  par le logo qu'on utilise sur la carte globale ». Choix fait : ce logo (celui du pion du groupe sur la
  carte du monde) représente le camp sur la carte régionale, à sa place, et sur la carte du monde, au centre
  de sa région.
- **Étape 2, la tâche en cours.** Le document la range parmi les données du camp ; elle reste le champ
  `Mission_En_Cours` de la partie (celui des missions), pour ne pas tenir deux fois la même chose.
- **Étape 2, la bourse des joueurs.** Rangée sur la partie (`Bourses_Joueurs`, un montant par joueur), vide
  pour l'instant.
- **Étape 2, les membres du clan.** Le bouton DEV y met Thémès et les héros vivants des joueurs (moral 60,
  sans tâche) : « tout personnage de joueur qui n'est pas utilisé en expédition est traité comme un PNJ ».
- **Étape 2, l'affection de Thémès.** « Au maximum » : confiance, respect et attachement à 100 dans ses fils
  invisibles (l'affinité vaut alors 100), et la familiarité aussi à 100.
- **Étape 2, sans « Forêt des Murmures ».** La région se cherche par son nom ; si la partie n'en a pas, le
  bouton DEV ne crée rien et le dit.
- **Étape 3, les encarts.** Des carrés posés en fractions de l'image (x et côté en part de sa largeur, y en
  part de sa hauteur), chacun dans une couche (1 à 9). Sauvés dans `Carte_Livre/Camp_Encarts` (pour toutes les
  parties) ; « Copier le code » donne `ENCARTS_DEFAUT`, à coller dans `camp_scene.js` : il vaut tant que la
  base n'a pas d'encarts. Le bouton « Encarts (DEV) » est sur la page du camp elle-même (en bas à gauche, en
  mode DEV), là où on les pose.
- **Étape 3, qui est « le personnage d'un joueur ».** Pour le clic : le héros principal d'un autre joueur
  (refusé s'il est connecté). Ses autres personnages, non joués, sont « traités comme des PNJ » : on peut
  leur parler. Ses propres personnages, eux, ne s'ouvrent jamais. Un membre sans ses deux images en scène
  n'est pas affiché (le temps qu'elles soient dessinées).
- **Étape 3, les deux images en scène.** Une veille (`camp_avatars.js`) les dessine pour tout le camp, un
  membre à la fois, sur un poste qui a les clés (OpenAI, Cloudinary), avec un verrou de 10 minutes : c'est
  ce qui couvre « à l'arrivée d'un PNJ, à la création ou à l'achat d'un personnage, au changement de héros
  principal ». Un PNJ sans portrait (Thémès au début) est dessiné sans référence, d'après sa description. Le
  gabarit du compagnon (MIA_GABARIT) se fait par la même veille.
- **Étape 3, « au camp ».** Le clan est au camp quand son pion est sur l'icône du camp (même région, à moins
  de la taille de l'icône) et qu'aucune expédition n'est en cours — ou quand le pion n'a pas encore de place.
  Alors la détection du combat ne s'annonce pas, et le narrateur sait qu'au camp un RP ne déclenche jamais de
  combat. « Flâner dans le camp » ramène au livre, sur la page du récit.
- **Étape 3, les boutons qui attendent leur étape.** « Former le conseil » (étape 9) et « Gestion du camp »
  (étape 4) disent qu'ils se préparent ; « Expédition » ouvre la page du Groupe (elle devient la page
  Expédition à l'étape 6) ; « Déplacer le camp » est éteint tant que le conseil ne l'a pas voté (étape 11).
- **Étape 3, le cadrage sur un téléphone en hauteur.** Le document dit « bord à bord » : sur un écran plus
  haut que l'image, le haut reste noir (l'image est collée en bas).
- **Étape 4, les caractéristiques des PNJ.** Les héros ont les leurs (`Caracteristiques`). Les PNJ n'en ont pas
  encore : un PNJ sans `Caracs` dans sa fiche compte 10 partout (m = 0) ; son niveau, `Niveau` (1 sinon). Le
  recrutement (étape 12) pourra leur en donner.
- **Étape 4, Thémès et les tâches.** Il ne prend pas de tâche (il part avec chaque expédition) et ne peut pas
  être intendant ; il mange au camp quand il y est.
- **Étape 4, le bilan du jour.** Production = (chasse + cueillette) × le rendement de la jauge, arrondie vers le
  bas ; consommation = 1 par membre resté au camp, moins (1 + m) par cuisinier, jamais sous 1. C'est l'exemple
  du document : +6 en forêt, +1 sous 60, déficit sous 30. Le moral joue sur le m (80 ou plus : +1 ; 10 à 29 :
  −1 ; sous 10 : ne travaille plus).
- **Étape 4, le commerce.** On choisit d'acheter ou de vendre (le tableau des tâches donne les deux prix), et
  combien ; la caisse doit pouvoir payer un achat, le camp avoir les provisions d'une vente. Le prix est noté
  avec la tâche (`Commerce`), payé au premier jour (étape 5), livré au retour de l'expédition (étape 8).
- **Étape 4, « postes bloqués ».** Pendant une expédition hors du camp (le clan n'est pas « au camp », voir
  l'étape 3), les menus sont figés et la base refuse aussi.
- **Étape 4, le moral dans les fils invisibles.** La jauge et les dernières variations sont sur la page de gauche
  des fils invisibles d'un membre. Chaque variation est gardée (les 12 dernières) ; une variation de 5 points ou
  plus laisse aussi un souvenir (« Mon moral baisse (−10) : la faim ») et une humeur (joyeux ou triste), ce qui
  pèse sur ses relations comme les autres humeurs.
- **Étape 5, qui fait tourner la journée.** Le poste qui fait passer le jour de voyage (`voyage_groupe.js`,
  `jourSuivant`) appelle `journeeDuCamp` ; une clé (voyage et jour) empêche de compter deux fois le même jour.
  En mode DEV, la gestion du camp a un bouton « Faire passer un jour au camp ».
- **Étape 5, la faim.** « Sans autre pénalité chiffrée que le moral » : −10 par jour ; celui qui a faim garde son
  +3 de repos, mais n'a pas le +2 du repas cuisiné. Le manque se compte en parts : il manque N provisions, N
  membres n'ont pas mangé, les derniers dans l'ordre de priorité.
- **Étape 5, la guérison.** Chaque jour compte pour tous : les blessures « jours » des héros (expédition comprise)
  baissent d'un jour, d'un de plus au repos au camp, d'un de plus pour le patient du soigneur. Les blessures de
  chasse (PNJ et héros restés au camp) se gardent dans le camp ; reçue aujourd'hui, elle ne guérit qu'à partir de
  demain. Le malus « −2 aux jets » d'une blessure de chasse joue sur le jet de blessure de la chasse.
- **Étape 5, l'expédition.** Elle mange sur ses propres provisions (`Expedition.Provisions`), moins
  `Economie_Provisions` (les suiveurs de Dextérité, étape 6).
- **Étape 5, l'entraînement.** L'XP va dans la fiche de la recrue (`XP` d'un héros ou d'un PNJ).
- **Étape 5, le commerce.** Payé au premier jour (un achat que la caisse ne peut plus payer échoue) ; une vente
  enlève les provisions tout de suite ; les achats attendent le retour de l'expédition (`A_Livrer`).
- **Étape 6, la page Expédition.** Avec un camp, la double page du Groupe devient celle de l'expédition (sans
  camp, elle reste l'ancienne page du Groupe). Le sommaire dit « Expédition » dans tous les cas.
- **Étape 6, « les personnages du camp libres pour tous ».** La liste les montre, sous ses propres personnages,
  mais on ne peut pas encore les prendre : un PNJ n'a pas de fiche d'aventurier (caractéristiques, compétences,
  équipement) et le héros d'un autre joueur reste commandé par ce joueur. On ne prend une place qu'avec un de
  ses personnages ; il devient son héros principal (le héros joué). À reprendre quand un PNJ du camp pourra
  devenir jouable (recrutement, étape 12 ; mort du héros principal).
- **Étape 6, le départ et le retour.** L'expédition commence quand un voyage part (ou que le pion quitte
  l'icône du camp) ; elle finit quand le pion revient sur l'icône du camp sans voyage en cours. On ne peut pas
  lancer de voyage depuis le camp sans expédition montée, sans personne dedans, ou sans intendant si quelqu'un
  reste. Partis : ils quittent leur tâche (un commerce pas encore payé est annulé ; l'intendant qui part n'est
  plus intendant).
- **Étape 6, le récit.** Avec un camp, le chat n'est plus rangé à chaque départ de voyage : il l'est au retour de
  l'expédition, en chapitre « Expédition N — titre » (le cimetière des PNJ passe à ce moment-là). Le récit fait
  au camp entre deux expéditions ouvre le chapitre de l'expédition suivante.
- **Étape 6, le butin.** Au retour : les provisions qui restent et les achats du commerce rejoignent la réserve.
  Les drachmes, objets et recrues suivent leurs propres chemins (les récompenses des tâches : étape 10 ; les
  recrues : étape 12). « Annuler la tâche en cours » au retour : avec le rapport de l'intendant (étape 8).
- **Étape 6, les bonus des suiveurs.** Dextérité : −1 provision par jour pour l'expédition ; Constitution,
  Intelligence, Sagesse, Charisme : +1 aux jets de cette caractéristique des héros de l'expédition (comme un
  atout) ; Force : « +1 équipement porté », affiché, sans effet chiffré (« détail à définir plus tard »).
- **Étape 6, le mode arène.** Une case « Mode arène (test) » dans la double page des combats ; chacun y choisit
  son combattant parmi ses personnages ; hors combat du récit, c'est lui qui entre dans l'arène (le héros actif
  de l'histoire ne change pas).
- **Étape 7, Thémès.** Dès que le clan a un camp, le narrateur reçoit une consigne qui passe devant « qui tu es
  reste flou » : il est Thémès (nom, âge, caractère, son manuscrit), il parle et agit dans la scène, ne combat
  jamais, ne peut être ni blessé ni tué, et après une défaite il raconte depuis sa cachette. Les parties sans camp
  gardent l'ancien narrateur. Le cerveau de la base (INST_10895), s'il existe, reste la base ; la consigne de
  Thémès s'y ajoute.
- **Étape 8, quand.** Le poste qui clôt l'expédition fait le retour, une fois le récit de l'expédition rangé
  (le rapport ouvre donc la page suivante du livre). Ceux qui sont restés au camp : les membres qui n'étaient pas
  de l'expédition (Thémès à part).
- **Étape 8, les affinités.** Pour chaque paire restée au camp : ceux qui avaient la même tâche gagnent de la
  familiarité (1 par jour, 15 au plus), de l'attachement et de la confiance selon leur compatibilité ; ceux qui
  ont seulement partagé les repas, moitié moins de familiarité et un peu d'attachement. La compatibilité vient de
  la psyché (empathie et sociabilité proches, deux âmes tendres, deux orgueils qui se heurtent, l'impulsivité) et
  du moral. Écrit dans les fils invisibles comme un événement discret « la vie du camp ».
- **Étape 8, les événements.** Par tranche de 3 jours, une chance sur trois : une tempête (2 à 5 provisions
  gâchées), une fièvre (−5 de moral à un membre), une bête qui rôde (−2 à tous, jamais d'attaque), un voyageur qui
  veut rejoindre le clan (un sujet pour le prochain conseil, `Camp.Sujets_Conseil`).
- **Étape 8, le rapport.** Une page de Thémès où l'intendant parle (entre guillemets) : le journal des jours
  écoulés, les événements, les ressources, le moral, et une ou deux petites scènes par tranche de 3 jours. Sans
  clé Gemini, un rapport court à partir du journal. Il est gardé dans `Camp.Dernier_Rapport`. Pas d'intendant
  nommé : le premier membre resté au camp parle.
- **Étape 8, « annuler la tâche en cours ».** Avec la tâche en cours (étape 10).
- **Étape 9, la page.** Par-dessus la page du camp, en fondu : le chat du conseil à gauche (un encart et un petit
  avatar par prise de parole), les post-its à droite (votes des joueurs, bulles des PNJ), « + Proposer un sujet »,
  « ‹ Le camp » pour la quitter (le conseil reste réuni ; on y revient par « Former le conseil »).
- **Étape 9, qui parle.** Un joueur parle par son héros principal. Les PNJ du conseil : les membres restés au camp
  (ni les héros des joueurs, ni Thémès, qui anime). Les messages sont à part
  (`Systeme_Parties/{p}/Conseil_Messages`), jamais dans le récit.
- **Étape 9, l'IA.** Elle répond 6 secondes après la dernière réplique d'un joueur (le temps que d'autres
  parlent), un seul poste à la fois (un verrou d'une minute) ; si un joueur a parlé pendant la réponse, elle
  repart. 1 à 3 répliques à la fois (Thémès ou des PNJ présents, qui peuvent se répondre). Le modèle et la
  réflexion du narrateur. La mémoire : les 5 dernières expéditions (leur titre dans le livre, leurs jours, leurs
  membres) et le dernier rapport de l'intendant.
- **Étape 9, les sujets.** Posés d'office à l'ouverture : le manque de vivres (extraordinaire), le lieu repéré par
  l'éclaireur (il l'annonce aussitôt), les sujets laissés par le retour (un voyageur). Ensuite, un sujet par
  joueur ; un PNJ (par l'IA) seulement si le dernier post-it n'est pas d'un PNJ ; trois au plus.
- **Étape 9, le vote.** Les joueurs connectés (signe de vie de moins de 2 min 30) ; le poste qui constate que tous
  ont voté clôt le conseil. Le résultat : `Camp.Tache_Votee` (la tâche, étape 10), `Deplacement_Vote` (étape 11),
  `Recrutement_Vote` (étape 12) ; le lieu repéré retenu quitte la liste ; le conseil est gardé
  (`Camp.Conseils_Passes`).
- **Étape 9, l'extraordinaire.** Il se réunit tout seul dès que le clan est au camp et que le camp n'a plus de
  provisions, et sa page s'ouvre chez chacun (une fois).
- **Étape 10, le nom.** Dans le livre : « Tâche en cours » (la page, le marque-page, le vote pour l'abandonner, les
  notes). Le code et la base gardent les noms des missions (`Mission_En_Cours`, `Guilde/Mission`).
- **Étape 10, la détection.** Après chaque page du narrateur, tant qu'aucune tâche n'est en cours et que le clan
  a un camp, MIA_TACHE dit si les héros viennent d'ACCEPTER une tâche (pas d'en entendre parler) ; alors le
  créateur de missions l'écrit d'après elle (son titre, son commanditaire, son objectif) et elle devient la tâche
  en cours.
- **Étape 10, après le conseil.** Une fête : écrite par le créateur, au camp, en étapes à jouer en RP ;
  « partager les vivres » et « une autre décision » : une tâche simple, au camp, tirée du sujet ; « trouver des
  vivres », « accepter une mission » : écrites par le créateur, qui choisit le lieu ; « aller voir le lieu
  repéré » : un lieu près du camp (0,08 à 0,2 de lui, dans sa région) ; « déplacer le camp », « recruter » :
  pas de tâche à jouer, leur bouton prend le relais (la page « Tâche en cours » le dit). Chaque fois, la tâche
  d'avant est rangée « remplacée ». Sans clé Gemini, une tâche simple tirée du sujet.
- **Étape 10, les récompenses.** Fixées à la création (au hasard dans la fourchette du document ; une fête :
  100 XP par héros et +10 de moral pour tout le clan) ; versées à la caisse du groupe et à la réserve quand la
  tâche est réussie, une seule fois ; écrites sur le parchemin des récompenses. Les tâches lancées avant la v486
  n'en ont pas.
- **Étape 10, annuler au retour.** Au retour d'une expédition, la gestion du camp propose « Annuler la tâche en
  cours » : c'est le vote d'abandon du groupe (tous les joueurs).
- **Étape 11, la route.** « Déplacer le camp » (après le vote du conseil) met le camp en route et ouvre la carte : le
  voyage se trace comme d'habitude, sans expédition montée. Chaque jour de voyage, la journée du camp devient celle
  du déplacement : tout le clan marche (ni chasse, ni cueillette, ni tâches), il mange 2 provisions par membre moins
  la réduction du forgeron (arrondi au-dessus), la solde des mercenaires court, le camp suit le clan sur la carte, et
  un événement (embuscade, orage, blessé) peut survenir : le Destin l'écrit dans le récit pour qu'on le joue en RP.
  Le forgeron et l'éclaireur gardent leur poste pendant la route pour leur réduction.
- **Étape 11, la faim en route.** Il manque N provisions : ⌈N ÷ 2⌉ membres n'ont pas mangé (l'ordre de priorité), −10
  de moral. À zéro, le voyage s'arrête et le camp se pose là ; le conseil extraordinaire se réunit.
- **Étape 11, l'arrivée.** Le voyage fini, le camp se pose où est le clan, la jauge est réestimée (MIA_RESSOURCES), la
  tâche « Déplacer le camp » est faite. Un déplacement = un voyage.
- **Étape 11, « au camp ».** Pendant la route, le clan n'est pas au camp : un combat est possible, les postes et le
  conseil attendent l'arrivée.
- **Étape 12, le recrutement actuel.** Avec un camp, le PNJ qui accepte (le même calcul qu'avant : affinité,
  psyché, jet de Charisme) rejoint le camp (invité, moral 60) au lieu de suivre la compagnie ; le narrateur le sait.
  Sans camp, rien ne change. Les anciens suiveurs restent des suiveurs.
- **Étape 12, les mercenaires.** MIA_GROUPE relève une nouvelle demande, « engager » (payer un PNJ pour qu'il
  vienne), avec son prix s'il est dit (30 drachmes sinon). La caisse du groupe paie, il rejoint le camp (moral 40) ;
  sa solde (3 par jour) et son départ après 5 jours sans solde viennent de la journée du camp. Sans les drachmes, il
  refuse, et le narrateur le sait.
- **Étape 12, les caracs d'une recrue.** L'achat de points du jeu (22 points, de 8 à 16, les coûts de la création) ;
  MIA_CARACS range ses caractéristiques d'après son métier et son caractère, et les points vont surtout aux premières
  (sans clé : au hasard). Niveau 1, XP 0. La classe : un menu sur sa ligne de la gestion du camp, pour n'importe quel
  joueur. **Ses compétences : pas encore** — il faudrait la Forge pour un PNJ ; à faire quand un PNJ du camp pourra
  être joué (voir l'étape 6).
- **Étape 12, les personnages à 300 drachmes.** Achat : la bourse du joueur paie, la création s'ouvre, le héros créé
  rejoint le camp « acheté » (moral 100, à ce joueur). Pour le groupe : après le vote du conseil, le premier qui clique
  « Créer la recrue votée au conseil » la crée (la caisse paie) ; elle rejoint le camp « recrue du clan », notée libre
  pour tous (la jouer à plusieurs attend la même chose que les PNJ jouables). La bourse est encore vide (la revente
  d'objets viendra) : un bouton DEV y met 300 drachmes.
- **Étape 12, le bouton DEV.** Dans les fils invisibles d'un PNJ qui n'est pas du camp (mode DEV) : « Forcer son
  recrutement dans le camp » — invité, moral 60, niveau 1, ses caracs, son souvenir, comme un recrutement naturel.
- **Étape 13, la réputation par région.** Un score de −100 à +100 par région (`Camp.Reputation_Regions`), 0 au
  départ. Il suit les lieux : quand MIA_REPUTATION change la réputation du groupe dans un lieu (de −10 à +10), la
  région de ce lieu en garde l'écho, trois fois l'écart. Sur la page de gauche de chaque région : le nom du groupe,
  la jauge, un mot (honnis, mal vus, peu connus, bien vus, adulés). Le narrateur reçoit celle de la région où est le
  groupe. Les actes en pleine nature ne la changent pas (MIA_REPUTATION ne juge que les lieux).
- **Étape 13, l'ancien système.** Le narrateur ne parle plus de « mission de guilde » (la tâche du clan). Les noms
  internes (`missions_guilde.js`, `Guilde/Mission`, `Mission_En_Cours`) restent, pour ne pas casser les parties.

## Ce qui reste à faire ou à trancher (pour Nico)

- **Jouer un personnage du camp** (étapes 6 et 12) : un PNJ du camp, ou le héros d'un autre joueur, n'est pas encore
  jouable en expédition ; il faudrait lui donner une fiche d'aventurier (compétences par la Forge) et décider qui le
  commande. Les compétences d'une recrue attendent la même chose.
- **La création automatique du camp** à la création d'une partie : c'est toujours le bouton DEV (le document dit « à
  terme »).
- **Les encarts du camp** : à poser par Nico avec « Encarts (DEV) », puis « Copier le code » dans `camp_scene.js`.
- **Les chiffres à équilibrer** (le document le dit) : coûts, moral, risques, récompenses, les seuils des
  affinités du retour et des événements de l'absence.
- **La bourse des joueurs** reste vide tant que la revente d'objets n'existe pas (un bouton DEV la remplit).
- **Les tests en vrai** : tout est vérifié par les bancs avec une base simulée ; les IA (rapport de l'intendant,
  conseil, MIA_TACHE, MIA_CARACS, MIA_GABARIT, les images en scène) n'ont été essayées qu'avec des réponses simulées.
