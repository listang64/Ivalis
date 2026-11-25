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
