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
4. Sélectionner ce dossier:
   - `/home/runner/work/immich-guessr-exp/immich-guessr-exp`
5. Cliquer sur l'icône de l'extension pour ouvrir le jeu

## Notes

- Le prototype tente plusieurs endpoints Immich pour rester compatible selon versions.
- Si le chargement Immich échoue, des photos de démonstration sont utilisées.
