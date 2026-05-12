const settingsForm = document.getElementById('settings-form');
const guessForm = document.getElementById('guess-form');
const guessDateLabel = document.getElementById('guess-date-label');
const settingsStatus = document.getElementById('settings-status');
const photoWrapper = document.getElementById('photo-wrapper');
const feedback = document.getElementById('feedback');
const nextPhotoButton = document.getElementById('next-photo');
const includeDateInput = document.getElementById('include-date');
const guessMap = document.getElementById('guess-map');
const mapLines = document.getElementById('map-lines');
const mapMarkers = document.getElementById('map-markers');
const mapDistance = document.getElementById('map-distance');

const demoPhotos = [
  {
    id: 'demo-1',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    country: 'France',
    locationLabel: 'Paris',
    latitude: 48.85837,
    longitude: 2.294481,
    takenAt: '2024-05-11'
  },
  {
    id: 'demo-2',
    imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80',
    country: 'Suisse',
    locationLabel: 'Oeschinensee',
    latitude: 46.49811,
    longitude: 7.72661,
    takenAt: '2023-09-02'
  },
  {
    id: 'demo-3',
    imageUrl: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?auto=format&fit=crop&w=1200&q=80',
    country: 'Japon',
    locationLabel: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
    takenAt: '2022-01-20'
  }
];

const state = {
  photos: [],
  currentPhoto: null,
  includeDate: true,
  apiKey: '',
  activeBlobUrl: '',
  guessCoordinates: null,
  resultVisible: false
};

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function parseCoordinate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
}

function firstCoordinate(source, keys) {
  for (const key of keys) {
    const parsed = parseCoordinate(source?.[key]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return NaN;
}

function clampLatitude(latitude) {
  return Math.min(85.05112878, Math.max(-85.05112878, latitude));
}

function hasCoordinates(photo) {
  return Number.isFinite(photo?.latitude) && Number.isFinite(photo?.longitude);
}

function normalizeCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const lat = clampLatitude(latitude);
  const lng = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return { latitude: lat, longitude: lng };
}

function coordinatesToPoint(latitude, longitude) {
  const rect = guessMap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const clampedLat = clampLatitude(latitude);
  const x = ((longitude + 180) / 360) * rect.width;
  const mercatorY = Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360));
  const y = ((1 - mercatorY / Math.PI) / 2) * rect.height;
  return { x, y };
}

function pointToCoordinates(clientX, clientY) {
  const rect = guessMap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
  const y = Math.min(rect.height, Math.max(0, clientY - rect.top));
  const longitude = (x / rect.width) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * y) / rect.height);
  const latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp(mercatorY)) - Math.PI / 2);
  return normalizeCoordinates(latitude, longitude);
}

function distanceKm(first, second) {
  const earthRadiusKm = 6371;
  const lat1 = (first.latitude * Math.PI) / 180;
  const lat2 = (second.latitude * Math.PI) / 180;
  const deltaLat = ((second.latitude - first.latitude) * Math.PI) / 180;
  const deltaLng = ((second.longitude - first.longitude) * Math.PI) / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function createMarker(point, className, title) {
  const marker = document.createElement('div');
  marker.className = `map-marker ${className}`;
  marker.style.left = `${point.x}px`;
  marker.style.top = `${point.y}px`;
  marker.title = title;
  return marker;
}

function drawMapOverlay() {
  mapLines.replaceChildren();
  mapMarkers.replaceChildren();
  mapDistance.classList.add('hidden');
  mapDistance.textContent = '';
  guessMap.classList.toggle('expanded', state.resultVisible);

  if (!state.currentPhoto || !state.guessCoordinates) {
    return;
  }

  const guessPoint = coordinatesToPoint(state.guessCoordinates.latitude, state.guessCoordinates.longitude);
  if (!guessPoint) {
    return;
  }

  mapMarkers.append(createMarker(guessPoint, 'guess', 'Votre guess'));
  if (!state.resultVisible || !hasCoordinates(state.currentPhoto)) {
    return;
  }

  const realPoint = coordinatesToPoint(state.currentPhoto.latitude, state.currentPhoto.longitude);
  if (!realPoint) {
    return;
  }

  mapMarkers.append(createMarker(realPoint, 'actual', state.currentPhoto.locationLabel || state.currentPhoto.country || 'Lieu réel'));

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'map-line');
  line.setAttribute('x1', String(guessPoint.x));
  line.setAttribute('y1', String(guessPoint.y));
  line.setAttribute('x2', String(realPoint.x));
  line.setAttribute('y2', String(realPoint.y));
  mapLines.append(line);

  const errorDistance = distanceKm(state.guessCoordinates, state.currentPhoto);
  mapDistance.textContent = `Erreur: ${Math.round(errorDistance).toLocaleString('fr-FR')} km`;
  mapDistance.classList.remove('hidden');
}

function setPhotoPlaceholder(message) {
  clearActiveBlobUrl();
  photoWrapper.replaceChildren();
  const text = document.createElement('p');
  text.className = 'placeholder';
  text.textContent = message;
  photoWrapper.append(text);
}

function sanitizeImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.href;
  } catch (error) {
    return '';
  }
}

function clearActiveBlobUrl() {
  if (!state.activeBlobUrl) {
    return;
  }

  URL.revokeObjectURL(state.activeBlobUrl);
  state.activeBlobUrl = '';
}

async function getRenderableImageUrl(photo) {
  const safeImageUrl = sanitizeImageUrl(photo.imageUrl);
  if (!safeImageUrl) {
    return '';
  }

  if (photo.source !== 'immich') {
    clearActiveBlobUrl();
    return safeImageUrl;
  }

  const response = await fetch(safeImageUrl, {
    headers: {
      Accept: 'image/*',
      'x-api-key': state.apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Réponse non image (${contentType || 'type inconnu'})`);
  }

  clearActiveBlobUrl();
  state.activeBlobUrl = URL.createObjectURL(await response.blob());
  return state.activeBlobUrl;
}

async function renderPhoto(photo) {
  try {
    const imageUrl = await getRenderableImageUrl(photo);
    if (!imageUrl) {
      setPhotoPlaceholder('Photo non affichable.');
      return;
    }

    photoWrapper.replaceChildren();
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = 'Photo à deviner';
    photoWrapper.append(image);
  } catch (error) {
    const details = error?.message ? `: ${error.message}` : '';
    const message = photo.source === 'immich'
      ? `Impossible de charger cette photo Immich${details}`
      : 'Photo non affichable.';
    setPhotoPlaceholder(message);
  }
}

function getRandomPhoto() {
  const playablePhotos = state.photos.filter(hasCoordinates);
  if (!playablePhotos.length) {
    return null;
  }

  const index = Math.floor(Math.random() * playablePhotos.length);
  return playablePhotos[index];
}

async function showCurrentPhoto() {
  state.currentPhoto = getRandomPhoto();
  if (!state.currentPhoto) {
    setPhotoPlaceholder('Aucune photo géolocalisée disponible avec ces paramètres.');
    guessForm.classList.add('hidden');
    nextPhotoButton.classList.add('hidden');
    return;
  }

  await renderPhoto(state.currentPhoto);
  feedback.textContent = '';
  guessForm.reset();
  state.guessCoordinates = null;
  state.resultVisible = false;
  drawMapOverlay();
  includeDateInput.checked = state.includeDate;
  guessDateLabel.classList.toggle('hidden', !state.includeDate);
  guessForm.classList.remove('hidden');
  nextPhotoButton.classList.add('hidden');
}

function parseImmichPhoto(serverUrl, asset) {
  const rawId = asset?.id;
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
    return null;
  }

  const safeId = encodeURIComponent(String(rawId));
  const exif = asset?.exifInfo || {};
  const country = exif.country || exif.state || exif.city || '';
  const locationLabel = exif.city || exif.state || exif.country || asset?.address || '';
  const latitude = firstCoordinate(exif, ['latitude', 'lat', 'gpsLatitude']);
  const longitude = firstCoordinate(exif, ['longitude', 'long', 'lon', 'lng', 'gpsLongitude']);
  const normalizedCoordinates = normalizeCoordinates(latitude, longitude);
  const takenAtRaw = asset?.fileCreatedAt || asset?.localDateTime;
  const takenAt = takenAtRaw ? takenAtRaw.slice(0, 10) : '';
  return {
    id: safeId,
    imageUrl: `${serverUrl}/api/assets/${safeId}/thumbnail`,
    source: 'immich',
    country,
    locationLabel,
    latitude: normalizedCoordinates?.latitude ?? NaN,
    longitude: normalizedCoordinates?.longitude ?? NaN,
    takenAt
  };
}

async function ensureHostPermission(serverUrl) {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) {
    return true;
  }

  const origin = new URL(serverUrl).origin;
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

async function fetchImmichPhotos(serverUrl, apiKey) {
  const cleanServerUrl = serverUrl.replace(/\/$/, '');
  const requests = [
    {
      endpoint: `${cleanServerUrl}/api/search/metadata`,
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          page: 1,
          size: 200
        })
      }
    },
    {
      endpoint: `${cleanServerUrl}/api/assets?page=1&size=200`,
      init: {
        headers: {
          Accept: 'application/json',
          'x-api-key': apiKey
        }
      }
    },
    {
      endpoint: `${cleanServerUrl}/api/assets?take=200`,
      init: {
        headers: {
          Accept: 'application/json',
          'x-api-key': apiKey
        }
      }
    }
  ];

  let lastError = null;

  for (const request of requests) {
    try {
      const response = await fetch(request.endpoint, request.init);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const assets = Array.isArray(data)
        ? data
        : Array.isArray(data?.assets)
          ? data.assets
          : Array.isArray(data?.assets?.items)
            ? data?.assets?.items
            : Array.isArray(data?.items)
              ? data.items
              : [];

      return assets.map((asset) => parseImmichPhoto(cleanServerUrl, asset)).filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }

  const details = lastError?.message ? ` (${lastError.message})` : '';
  throw new Error(`Impossible de charger les photos Immich${details}.`);
}

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedback.textContent = '';
  settingsStatus.textContent = 'Chargement en cours...';

  const serverUrl = document.getElementById('server-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const countryFilter = document.getElementById('country-filter').value.trim();
  state.includeDate = includeDateInput.checked;

  let photos = [];

  if (serverUrl && apiKey) {
    try {
      const hasPermission = await ensureHostPermission(serverUrl);
      if (!hasPermission) {
        throw new Error('Accès au domaine Immich refusé');
      }

      photos = await fetchImmichPhotos(serverUrl, apiKey);
      state.apiKey = apiKey;
      const geoCount = photos.filter(hasCoordinates).length;
      settingsStatus.textContent = `Photos chargées depuis Immich: ${photos.length} (${geoCount} géolocalisées)`;
    } catch (error) {
      state.apiKey = '';
      settingsStatus.textContent = `Échec du chargement Immich (${error.message}). Vérifiez l'URL, la clé API et les droits.`;
    }
  } else {
    photos = [...demoPhotos];
    state.apiKey = '';
    settingsStatus.textContent = 'Mode démo actif (renseigne URL + clé API pour Immich).';
  }

  const normalizedFilter = normalize(countryFilter);
  state.photos = normalizedFilter
    ? photos.filter((photo) => normalize(photo.country) === normalizedFilter)
    : photos;

  if (state.photos.length && !state.photos.some(hasCoordinates)) {
    settingsStatus.textContent = `${settingsStatus.textContent} • Aucune photo avec coordonnées GPS`;
  }

  showCurrentPhoto();
});

guessMap.addEventListener('click', (event) => {
  if (!state.currentPhoto || state.resultVisible) {
    return;
  }

  const coordinates = pointToCoordinates(event.clientX, event.clientY);
  if (!coordinates) {
    return;
  }

  state.guessCoordinates = coordinates;
  drawMapOverlay();
  feedback.textContent = `Guess placé: ${coordinates.latitude.toFixed(3)}, ${coordinates.longitude.toFixed(3)}`;
});

guessForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!state.currentPhoto) {
    return;
  }

  const guessedDate = document.getElementById('guess-date').value;
  if (!state.guessCoordinates) {
    feedback.textContent = 'Clique sur la carte pour poser ton guess.';
    return;
  }

  const dateOk = !state.includeDate || guessedDate === state.currentPhoto.takenAt;
  const distance = distanceKm(state.guessCoordinates, state.currentPhoto);
  const location = state.currentPhoto.locationLabel || state.currentPhoto.country || 'lieu inconnu';
  const locationText = `Lieu réel: ${location} • Erreur: ${Math.round(distance).toLocaleString('fr-FR')} km`;
  const dateText = state.includeDate
    ? dateOk
      ? 'Date correcte'
      : `Date fausse. Réponse: ${state.currentPhoto.takenAt || 'inconnue'}`
    : '';

  feedback.textContent = `${locationText}${dateText ? ` • ${dateText}` : ''}`;
  state.resultVisible = true;
  drawMapOverlay();
  nextPhotoButton.classList.remove('hidden');
});

nextPhotoButton.addEventListener('click', () => {
  showCurrentPhoto();
});

window.addEventListener('resize', () => {
  if (!state.currentPhoto) {
    return;
  }

  if (state.guessCoordinates || state.resultVisible) {
    drawMapOverlay();
  }
});

(async function restoreSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  const values = await chrome.storage.local.get(['serverUrl', 'apiKey', 'countryFilter', 'includeDate']);
  document.getElementById('server-url').value = values.serverUrl || '';
  document.getElementById('api-key').value = values.apiKey || '';
  document.getElementById('country-filter').value = values.countryFilter || '';
  includeDateInput.checked = values.includeDate ?? true;

  settingsForm.addEventListener('change', async () => {
    await chrome.storage.local.set({
      serverUrl: document.getElementById('server-url').value.trim(),
      apiKey: document.getElementById('api-key').value.trim(),
      countryFilter: document.getElementById('country-filter').value.trim(),
      includeDate: includeDateInput.checked
    });
  });
})();
