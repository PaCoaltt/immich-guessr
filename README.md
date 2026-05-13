# Immich Guessr (browser extension)

Browser extension prototype that opens **Immich Guessr** in full-page mode, with a brutalist UI.

## Features

- Full-application view opened from the extension icon (new tab)
- Brutalist style inspired by games like `rentguessr.fun`
- Game settings:
  - Country filter
  - Place-only mode / place + date mode
- Photo loading from Immich (URL + API key), with demo mode as fallback
- Location guessing by clicking on a world map
- After validation: displays the guess and the real location connected by a dotted line with error distance

## Installation (Chrome/Chromium)

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select this repository's root folder (the folder that contains `manifest.json`)
5. Click the extension icon to open the game

## Notes

- The interface is currently in French (`lang="fr"`).
- Internationalization is not implemented yet (the prototype currently targets French first).
- The prototype tries multiple Immich endpoints to stay compatible across versions.
- Immich loading is limited to the first 200 retrieved assets.
- Only photos with GPS coordinates are playable.
- Broad host permissions are declared as **optional** and are requested only when you start a game with your Immich URL.
- The extension will ask permission to access the configured Immich domain.
- If Immich loading fails with URL + API key, demo mode is not enabled automatically (to avoid confusion).
