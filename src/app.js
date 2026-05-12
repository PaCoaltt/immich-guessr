const settingsForm = document.getElementById('settings-form');
const guessForm = document.getElementById('guess-form');
const guessDateLabel = document.getElementById('guess-date-label');
const settingsStatus = document.getElementById('settings-status');
const photoWrapper = document.getElementById('photo-wrapper');
const feedback = document.getElementById('feedback');
const nextPhotoButton = document.getElementById('next-photo');
const includeDateInput = document.getElementById('include-date');
const guessMap = document.getElementById('guess-map');
const guessMapTiles = document.getElementById('guess-map-tiles');
const mapLines = document.getElementById('map-lines');
const mapMarkers = document.getElementById('map-markers');
const mapDistance = document.getElementById('map-distance');
const IMMICH_PAGE_SIZE = 200;
const IMMICH_MAX_PAGES = 200;

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
  resultVisible: false,
  resultDistanceKm: null,
  remainingPhotoIds: [],
  map: {
    zoom: 1,
    center: { latitude: 20, longitude: 0 },
    maxZoom: 5,
    minZoom: 1,
    dragPointerId: null,
    dragStartPoint: null,
    dragStartCenterWorld: null,
    dragMoved: false
  }
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

function firstCoordinateFromSources(sources, keys) {
  for (const source of sources) {
    const coordinate = firstCoordinate(source, keys);
    if (Number.isFinite(coordinate)) {
      return coordinate;
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

function mapSize(zoom) {
  return 256 * (2 ** zoom);
}

function longitudeToWorldX(longitude, zoom) {
  return ((longitude + 180) / 360) * mapSize(zoom);
}

function latitudeToWorldY(latitude, zoom) {
  const clampedLat = clampLatitude(latitude);
  const sinLatitude = Math.sin((clampedLat * Math.PI) / 180);
  const y = 0.5 - (Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI));
  return y * mapSize(zoom);
}

function worldXToLongitude(worldX, zoom) {
  return (worldX / mapSize(zoom)) * 360 - 180;
}

function worldYToLatitude(worldY, zoom) {
  const mercatorY = Math.PI - ((2 * Math.PI * worldY) / mapSize(zoom));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercatorY) - Math.exp(-mercatorY)));
}

function getMapCenterWorld() {
  return {
    x: longitudeToWorldX(state.map.center.longitude, state.map.zoom),
    y: latitudeToWorldY(state.map.center.latitude, state.map.zoom)
  };
}

function setMapCenterFromWorld(worldX, worldY) {
  const worldSize = mapSize(state.map.zoom);
  const wrappedX = ((((worldX % worldSize) + worldSize) % worldSize) + worldSize) % worldSize;
  const clampedY = Math.min(worldSize, Math.max(0, worldY));
  const longitude = worldXToLongitude(wrappedX, state.map.zoom);
  const latitude = worldYToLatitude(clampedY, state.map.zoom);
  const normalized = normalizeCoordinates(latitude, longitude);
  if (!normalized) {
    return;
  }

  state.map.center = normalized;
}

function coordinatesToPoint(latitude, longitude) {
  const rect = guessMap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const centerWorld = getMapCenterWorld();
  const pointWorldX = longitudeToWorldX(longitude, state.map.zoom);
  const pointWorldY = latitudeToWorldY(latitude, state.map.zoom);
  const x = pointWorldX - centerWorld.x + rect.width / 2;
  const y = pointWorldY - centerWorld.y + rect.height / 2;
  return { x, y };
}

function pointToCoordinates(clientX, clientY) {
  const rect = guessMap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
  const y = Math.min(rect.height, Math.max(0, clientY - rect.top));
  const centerWorld = getMapCenterWorld();
  const worldX = centerWorld.x - rect.width / 2 + x;
  const worldY = centerWorld.y - rect.height / 2 + y;
  const longitude = worldXToLongitude(worldX, state.map.zoom);
  const latitude = worldYToLatitude(worldY, state.map.zoom);
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

function renderMapTiles() {
  const rect = guessMap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const centerWorld = getMapCenterWorld();
  const topLeftWorldX = centerWorld.x - rect.width / 2;
  const topLeftWorldY = centerWorld.y - rect.height / 2;
  const tileSize = 256;
  const tileCount = 2 ** state.map.zoom;
  const minTileX = Math.floor(topLeftWorldX / tileSize);
  const maxTileX = Math.floor((topLeftWorldX + rect.width) / tileSize);
  const minTileY = Math.floor(topLeftWorldY / tileSize);
  const maxTileY = Math.floor((topLeftWorldY + rect.height) / tileSize);
  const fragment = document.createDocumentFragment();

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) {
        continue;
      }

      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      const tile = document.createElement('img');
      tile.src = `https://tile.openstreetmap.org/${state.map.zoom}/${wrappedTileX}/${tileY}.png`;
      tile.alt = '';
      tile.decoding = 'async';
      tile.draggable = false;
      tile.style.width = `${tileSize}px`;
      tile.style.height = `${tileSize}px`;
      tile.style.left = `${tileX * tileSize - topLeftWorldX}px`;
      tile.style.top = `${tileY * tileSize - topLeftWorldY}px`;
      fragment.append(tile);
    }
  }

  guessMapTiles.replaceChildren(fragment);
}

function drawMapOverlay() {
  mapLines.replaceChildren();
  mapMarkers.replaceChildren();
  mapDistance.classList.add('hidden');
  mapDistance.textContent = '';
  renderMapTiles();

  const rect = guessMap.getBoundingClientRect();
  mapLines.setAttribute('viewBox', `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);

  if (!state.currentPhoto || !state.guessCoordinates) {
    return;
  }

  const guessPoint = coordinatesToPoint(state.guessCoordinates.latitude, state.guessCoordinates.longitude);
  if (!guessPoint) {
    return;
  }

  mapMarkers.append(createMarker(guessPoint, 'guess', 'Votre supposition'));
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

  const shownDistance = Number.isFinite(state.resultDistanceKm)
    ? state.resultDistanceKm
    : distanceKm(state.guessCoordinates, state.currentPhoto);
  mapDistance.textContent = `Distance: ${Math.round(shownDistance).toLocaleString('fr-FR')} km`;
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

function getRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    return 0;
  }

  if (globalThis.crypto?.getRandomValues) {
    const randomValues = new Uint32Array(1);
    const maxUint32 = 2 ** 32;
    const limit = Math.floor(maxUint32 / maxExclusive) * maxExclusive;
    let randomValue = 0;
    do {
      globalThis.crypto.getRandomValues(randomValues);
      randomValue = randomValues[0];
    } while (randomValue >= limit);
    return randomValue % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

function refillRandomPhotoQueue() {
  const geotaggedPhotoIds = state.photos.filter(hasCoordinates).map((photo) => photo.id);
  for (let index = geotaggedPhotoIds.length - 1; index > 0; index -= 1) {
    const randomIndex = getRandomInt(index + 1);
    [geotaggedPhotoIds[index], geotaggedPhotoIds[randomIndex]] = [geotaggedPhotoIds[randomIndex], geotaggedPhotoIds[index]];
  }
  state.remainingPhotoIds = geotaggedPhotoIds;
}

function getRandomPhoto() {
  if (!state.remainingPhotoIds.length) {
    refillRandomPhotoQueue();
  }

  const nextPhotoId = state.remainingPhotoIds.pop();
  if (!nextPhotoId) {
    return null;
  }

  return state.photos.find((photo) => photo.id === nextPhotoId) || null;
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
  state.map.zoom = 1;
  state.map.center = { latitude: 20, longitude: 0 };
  state.guessCoordinates = null;
  state.resultVisible = false;
  state.resultDistanceKm = null;
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
  const exif = asset?.exifInfo || asset?.exif || asset?.exifData || {};
  const exifGps = exif?.gps || {};
  const exifLocation = exif?.location || {};
  const assetLocation = asset?.location || {};
  const coordinateSources = [exif, exifGps, exifLocation, assetLocation, asset];
  const country = exif.country || exif.state || exif.city || '';
  const locationLabel = exif.city || exif.state || exif.country || asset?.address || '';
  const latitude = firstCoordinateFromSources(coordinateSources, ['latitude', 'lat', 'gpsLatitude']);
  const longitude = firstCoordinateFromSources(coordinateSources, ['longitude', 'long', 'lon', 'lng', 'gpsLongitude']);
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

function extractAssetsFromResponse(data) {
  return Array.isArray(data)
    ? data
    : Array.isArray(data?.assets)
      ? data.assets
      : Array.isArray(data?.assets?.items)
        ? data.assets.items
        : Array.isArray(data?.items)
          ? data.items
          : [];
}

function hasMorePages(data, assetsLength, pageSize, page) {
  const total = Number(data?.total ?? data?.assets?.total ?? data?.count ?? data?.assets?.count);
  if (Number.isFinite(total)) {
    return page * pageSize < total;
  }

  const totalPages = Number(data?.totalPages ?? data?.assets?.totalPages ?? data?.pages ?? data?.assets?.pages);
  if (Number.isFinite(totalPages)) {
    return page < totalPages;
  }

  if (typeof data?.nextPage === 'boolean') {
    return data.nextPage;
  }
  if (typeof data?.assets?.nextPage === 'boolean') {
    return data.assets.nextPage;
  }
  if (typeof data?.hasNextPage === 'boolean') {
    return data.hasNextPage;
  }
  if (typeof data?.assets?.hasNextPage === 'boolean') {
    return data.assets.hasNextPage;
  }

  return assetsLength >= pageSize;
}

async function loadAllPages({ makeRequest, pageSize }) {
  const collected = [];

  for (let page = 1; page <= IMMICH_MAX_PAGES; page += 1) {
    const response = await makeRequest(page);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const assets = extractAssetsFromResponse(data);
    if (!assets.length) {
      break;
    }

    collected.push(...assets);
    if (!hasMorePages(data, assets.length, pageSize, page)) {
      break;
    }
  }

  return collected;
}

async function fetchImmichPhotos(serverUrl, apiKey) {
  const cleanServerUrl = serverUrl.replace(/\/$/, '');
  const headers = {
    Accept: 'application/json',
    'x-api-key': apiKey
  };

  const loaders = [
    () => loadAllPages({
      pageSize: IMMICH_PAGE_SIZE,
      makeRequest: (page) => fetch(`${cleanServerUrl}/api/search/metadata`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          page,
          size: IMMICH_PAGE_SIZE,
          withExif: true
        })
      })
    }),
    () => loadAllPages({
      pageSize: IMMICH_PAGE_SIZE,
      makeRequest: (page) => fetch(`${cleanServerUrl}/api/assets?page=${page}&size=${IMMICH_PAGE_SIZE}&withExif=true`, { headers })
    }),
    () => loadAllPages({
      pageSize: IMMICH_PAGE_SIZE,
      makeRequest: (page) => {
        const skip = (page - 1) * IMMICH_PAGE_SIZE;
        return fetch(`${cleanServerUrl}/api/assets?take=${IMMICH_PAGE_SIZE}&skip=${skip}&withExif=true`, { headers });
      }
    })
  ];

  let lastError = null;

  for (const loader of loaders) {
    try {
      const assets = await loader();
      if (!assets.length) {
        continue;
      }
      return assets.map((asset) => parseImmichPhoto(cleanServerUrl, asset)).filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }

  const details = lastError?.message ? ` (${lastError.message})` : '';
  throw new Error(`Impossible de charger les photos Immich${details}.`);
}

function setGuessAtPoint(clientX, clientY) {
  if (!state.currentPhoto || state.resultVisible) {
    return;
  }

  const coordinates = pointToCoordinates(clientX, clientY);
  if (!coordinates) {
    return;
  }

  state.guessCoordinates = coordinates;
  state.resultDistanceKm = null;
  drawMapOverlay();
  feedback.textContent = `Supposition placée: ${coordinates.latitude.toFixed(3)}, ${coordinates.longitude.toFixed(3)}`;
}

function setMapZoom(nextZoom, anchorClientX, anchorClientY) {
  const clampedZoom = Math.min(state.map.maxZoom, Math.max(state.map.minZoom, nextZoom));
  if (clampedZoom === state.map.zoom) {
    return;
  }

  const anchorCoordinates = pointToCoordinates(anchorClientX, anchorClientY);
  state.map.zoom = clampedZoom;
  if (anchorCoordinates) {
    const rect = guessMap.getBoundingClientRect();
    const anchorX = Math.min(rect.width, Math.max(0, anchorClientX - rect.left));
    const anchorY = Math.min(rect.height, Math.max(0, anchorClientY - rect.top));
    const anchorWorldX = longitudeToWorldX(anchorCoordinates.longitude, state.map.zoom);
    const anchorWorldY = latitudeToWorldY(anchorCoordinates.latitude, state.map.zoom);
    const centerWorldX = anchorWorldX - (anchorX - rect.width / 2);
    const centerWorldY = anchorWorldY - (anchorY - rect.height / 2);
    setMapCenterFromWorld(centerWorldX, centerWorldY);
  }

  drawMapOverlay();
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
  state.remainingPhotoIds = [];

  if (state.photos.length && !state.photos.some(hasCoordinates)) {
    settingsStatus.textContent = `${settingsStatus.textContent} • Aucune photo avec coordonnées GPS`;
  }

  showCurrentPhoto();
});

guessMap.addEventListener('wheel', (event) => {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  const nextZoom = state.map.zoom + direction;
  setMapZoom(nextZoom, event.clientX, event.clientY);
}, { passive: false });

guessMap.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) {
    return;
  }

  state.map.dragPointerId = event.pointerId;
  state.map.dragStartPoint = { x: event.clientX, y: event.clientY };
  state.map.dragStartCenterWorld = getMapCenterWorld();
  state.map.dragMoved = false;
  guessMap.setPointerCapture(event.pointerId);
});

guessMap.addEventListener('pointermove', (event) => {
  if (state.map.dragPointerId !== event.pointerId || !state.map.dragStartPoint || !state.map.dragStartCenterWorld) {
    return;
  }

  const deltaX = event.clientX - state.map.dragStartPoint.x;
  const deltaY = event.clientY - state.map.dragStartPoint.y;
  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    state.map.dragMoved = true;
  }
  const centerWorldX = state.map.dragStartCenterWorld.x - deltaX;
  const centerWorldY = state.map.dragStartCenterWorld.y - deltaY;
  setMapCenterFromWorld(centerWorldX, centerWorldY);
  drawMapOverlay();
});

guessMap.addEventListener('pointerup', (event) => {
  if (state.map.dragPointerId !== event.pointerId) {
    return;
  }

  const hasDragged = state.map.dragMoved;
  state.map.dragPointerId = null;
  state.map.dragStartPoint = null;
  state.map.dragStartCenterWorld = null;
  state.map.dragMoved = false;

  if (!hasDragged) {
    setGuessAtPoint(event.clientX, event.clientY);
  }
});

guessMap.addEventListener('pointercancel', () => {
  state.map.dragPointerId = null;
  state.map.dragStartPoint = null;
  state.map.dragStartCenterWorld = null;
  state.map.dragMoved = false;
});

guessForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!state.currentPhoto) {
    return;
  }

  const guessedDate = document.getElementById('guess-date').value;
  if (!state.guessCoordinates) {
    feedback.textContent = 'Cliquez sur la carte pour poser votre supposition.';
    return;
  }

  const dateOk = !state.includeDate || guessedDate === state.currentPhoto.takenAt;
  const distance = distanceKm(state.guessCoordinates, state.currentPhoto);
  state.resultDistanceKm = distance;
  const location = state.currentPhoto.locationLabel || state.currentPhoto.country || 'lieu inconnu';
  const locationText = `Lieu réel: ${location} • Distance: ${Math.round(distance).toLocaleString('fr-FR')} km`;
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
  if (guessForm.classList.contains('hidden')) {
    return;
  }

  drawMapOverlay();
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
