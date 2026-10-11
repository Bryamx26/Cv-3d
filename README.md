# Chambre virtuelle (Three.js + Kenney Furniture Kit)

![Aperçu](apercu.png)

Une chambre 3D interactive pour présenter tes projets : 5 posters cliquables (un par projet),
un écran et une tour de PC qui ouvrent une fiche « à propos ».

## Lancer
Les modules ES ne marchent pas en ouvrant le fichier directement (file://). Lance un petit serveur dans ce dossier :

    npx serve .
    # ou : python3 -m http.server 8000

puis ouvre l'adresse affichée. Dans VS Code, l'extension Live Server fait la même chose.

## Personnaliser
- `projects.js` : ton nom, ta présentation, tes liens et tes 5 projets (titre, description, tags, lien, couleur, image optionnelle).
- `main.js` : `buildFurniture()` place les meubles (positions en mètres), `buildPosters()` place les posters.
- `models/` : modèles GLB du Kenney Furniture Kit. Le kit complet (140 meubles) : https://kenney.nl/assets/furniture-kit

## Structure
- `index.html` : page + styles
- `main.js` : scène Three.js
- `lib/` : Three.js r169 (copie locale, aucune dépendance CDN)

## Licences
- Modèles 3D : Kenney Furniture Kit, CC0 (domaine public, crédit facultatif), https://kenney.nl
- Three.js : MIT
