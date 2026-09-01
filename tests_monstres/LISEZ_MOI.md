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
