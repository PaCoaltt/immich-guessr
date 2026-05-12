# Immich Guessr (extension navigateur)

Prototype d'extension navigateur qui ouvre **Immich Guessr** en pleine page, avec une UI brutaliste.

## Fonctionnalités

- Ouverture en plein écran applicatif via l'icône de l'extension (nouvel onglet)
- Style brutaliste inspiré des jeux type `rentguessr.fun`
- Paramètres de partie:
  - Filtre par pays
  - Mode lieu seul / lieu + date
- Chargement des photos depuis Immich (URL + clé API), avec mode démo en fallback

## Installation (Chrome/Chromium)

1. Ouvrir `chrome://extensions`
2. Activer le mode développeur
3. Cliquer sur **Load unpacked**
4. Sélectionner le dossier racine de ce dépôt (le dossier qui contient `manifest.json`)
5. Cliquer sur l'icône de l'extension pour ouvrir le jeu

## Notes

- L'interface est actuellement en français (`lang="fr"`).
- Aucune internationalisation n'est encore implémentée (le prototype cible d'abord le français).
- Le prototype tente plusieurs endpoints Immich pour rester compatible selon versions.
- Le chargement Immich est limité aux 200 premiers assets récupérés.
- Les permissions hôtes larges sont déclarées en **optionnel** et ne sont demandées qu'au moment où vous lancez une partie avec votre URL Immich.
- L'extension demandera l'autorisation d'accéder au domaine Immich renseigné.
- Si le chargement Immich échoue, des photos de démonstration sont utilisées.
