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

## Points ambigus

- **Étape 1, le Livre des clans.** Il sert aujourd'hui aussi à choisir le héros actif, à ouvrir une fiche et
  à créer un personnage. Le document le retire à l'étape 1, mais la liste des personnages jouables n'arrive
  qu'avec la page Expédition (étape 6), et le document parle encore d'une « liste des personnages » où l'on
  clique sur « Créer ». Choix fait : l'identité de clan disparaît (fanion, nom de clan, fondation,
  réinitialisation, bouton « Les clans »), la page de gauche reste comme **liste des personnages** du
  joueur (case du héros actif, fiche, « + Un nouvel aventurier ») jusqu'à l'étape 6.
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
