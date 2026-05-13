# Immich Guessr

Immich Guessr est une extension navigateur qui transforme ta photothèque Immich en jeu de géolocalisation.
Le principe est simple : une photo s’affiche, tu observes les indices visuels, puis tu places ton estimation sur la carte.

## Concept

Le projet reprend l’esprit d’un jeu “guessr”, mais avec tes propres souvenirs :

- les images sont chargées depuis ton serveur Immich ;
- seules les photos avec coordonnées GPS sont jouables ;
- tu peux comparer ton intuition à la position réelle après validation.

Résultat : un jeu rapide, personnel, et idéal pour redécouvrir sa bibliothèque photo autrement.

## Fonctionnement

1. Ouvre l’extension depuis l’icône du navigateur.
2. Renseigne l’URL de ton instance Immich et ta clé API (ou utilise le mode démo).
3. Lance une partie : une image apparaît.
4. Clique sur la carte pour poser ta réponse.
5. Valide pour voir l’écart entre ton choix et la vraie position.

## Installation rapide (Chrome / Chromium)

1. Va sur `chrome://extensions`.
2. Active le **Mode développeur**.
3. Clique sur **Charger l’extension non empaquetée**.
4. Sélectionne le dossier du projet (celui avec `manifest.json`).

## État du projet

Prototype fonctionnel, orienté expérimentation produit/UX :

- interface en français ;
- chargement Immich compatible avec plusieurs endpoints ;
- permissions d’accès demandées uniquement pour le domaine Immich configuré.
