const settingsForm = document.getElementById('settings-form');
const guessForm = document.getElementById('guess-form');
const guessSubmitButton = document.getElementById('guess-submit');
const guessDateLabel = document.getElementById('guess-date-label');
const settingsStatus = document.getElementById('settings-status');
const photoWrapper = document.getElementById('photo-wrapper');
const feedback = document.getElementById('feedback');
const roundTimerInput = document.getElementById('round-timer-seconds');
const roundTimerStatus = document.getElementById('round-timer-status');
const includeDateInput = document.getElementById('include-date');
const guessMap = document.getElementById('guess-map');
const guessMapTiles = document.getElementById('guess-map-tiles');
const mapLines = document.getElementById('map-lines');
const mapMarkers = document.getElementById('map-markers');
const mapDistance = document.getElementById('map-distance');
const IMMICH_PAGE_SIZE = 200;
const IMMICH_MAX_PAGES = 200;
const MAX_UINT32 = 2 ** 32;
const MAP_DRAG_THRESHOLD_PX = 2;
const MAP_MAX_ZOOM = 19;
const MAP_MAX_REVEAL_ZOOM = 6;
const MAP_REVEAL_PADDING_PX = 28;
const MAP_REVEAL_ANIMATION_MS = 900;
const MAP_WHEEL_COOLDOWN_MS = 70;
const MAP_WHEEL_STEP_DELTA = 120;

const demoPhotos = [
  {
    id: 'demo-1',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=2400&q=100',
    country: 'France',
    locationLabel: 'Paris',
    latitude: 48.85837,
    longitude: 2.294481,
    takenAt: '2024-05-11'
  },
  {
    id: 'demo-2',
    imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2400&q=100',
    country: 'Suisse',
    locationLabel: 'Oeschinensee',
    latitude: 46.49811,
    longitude: 7.72661,
    takenAt: '2023-09-02'
  },
  {
    id: 'demo-3',
    imageUrl: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?auto=format&fit=crop&w=2400&q=100',
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
  roundTimerSeconds: 0,
  timerIntervalId: null,
  timerDeadline: 0,
  map: {
    zoom: 1,
    center: { latitude: 20, longitude: 0 },
    maxZoom: MAP_MAX_ZOOM,
    minZoom: 1,
    dragPointerId: null,
    dragStartPoint: null,
    dragStartCenterWorld: null,
    dragMoved: false,
    revealAnimationFrame: null,
    wheelAccumulator: 0,
    lastWheelZoomAt: 0
  }
};

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

function normalizeLongitude(longitude) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function shortestLongitudeDelta(fromLongitude, toLongitude) {
  return normalizeLongitude(toLongitude - fromLongitude);
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

  if (!state.currentPhoto) {
    return;
  }

  let guessPoint = null;
  if (state.guessCoordinates) {
    guessPoint = coordinatesToPoint(state.guessCoordinates.latitude, state.guessCoordinates.longitude);
    if (guessPoint) {
      mapMarkers.append(createMarker(guessPoint, 'guess', 'Your guess'));
    }
  }

  if (!state.resultVisible || !hasCoordinates(state.currentPhoto)) {
    return;
  }

  const realPoint = coordinatesToPoint(state.currentPhoto.latitude, state.currentPhoto.longitude);
  if (!realPoint) {
    return;
  }

  mapMarkers.append(createMarker(realPoint, 'actual', state.currentPhoto.locationLabel || state.currentPhoto.country || 'Actual location'));

  if (guessPoint && state.guessCoordinates) {
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
    mapDistance.textContent = `Distance: ${Math.round(shownDistance).toLocaleString('en-US')} km`;
    mapDistance.classList.remove('hidden');
  }
}

function cancelRevealAnimation() {
  if (state.map.revealAnimationFrame === null) {
    return;
  }
  cancelAnimationFrame(state.map.revealAnimationFrame);
  state.map.revealAnimationFrame = null;
}

function animateMapViewTo(targetZoom, targetCenter) {
  cancelRevealAnimation();
  const clampedTargetZoom = Math.min(state.map.maxZoom, Math.max(state.map.minZoom, targetZoom));
  const normalizedTargetCenter = normalizeCoordinates(targetCenter.latitude, targetCenter.longitude);
  if (!normalizedTargetCenter) {
    drawMapOverlay();
    return;
  }

  const startZoom = state.map.zoom;
  const startCenter = {
    latitude: state.map.center.latitude,
    longitude: state.map.center.longitude
  };
  const zoomDelta = clampedTargetZoom - startZoom;
  const latitudeDelta = normalizedTargetCenter.latitude - startCenter.latitude;
  const longitudeDelta = shortestLongitudeDelta(startCenter.longitude, normalizedTargetCenter.longitude);
  const hasMovement = zoomDelta !== 0
    || Math.abs(latitudeDelta) > Number.EPSILON
    || Math.abs(longitudeDelta) > Number.EPSILON;

  if (!hasMovement) {
    drawMapOverlay();
    return;
  }

  const startedAt = performance.now();
  const step = (now) => {
    const elapsed = now - startedAt;
    const progress = Math.min(1, elapsed / MAP_REVEAL_ANIMATION_MS);
    const eased = 1 - ((1 - progress) ** 3);
    const nextZoom = Math.round(startZoom + zoomDelta * eased);
    const nextCenter = normalizeCoordinates(
      startCenter.latitude + latitudeDelta * eased,
      startCenter.longitude + longitudeDelta * eased
    );
    state.map.zoom = Math.min(state.map.maxZoom, Math.max(state.map.minZoom, nextZoom));
    if (nextCenter) {
      state.map.center = nextCenter;
    }
    drawMapOverlay();

    if (progress >= 1) {
      state.map.zoom = clampedTargetZoom;
      state.map.center = normalizedTargetCenter;
      state.map.revealAnimationFrame = null;
      drawMapOverlay();
      return;
    }

    state.map.revealAnimationFrame = requestAnimationFrame(step);
  };

  state.map.revealAnimationFrame = requestAnimationFrame(step);
}

function fitMapForReveal(guessCoordinates, actualCoordinates) {
  const normalizedGuess = normalizeCoordinates(guessCoordinates?.latitude, guessCoordinates?.longitude);
  const normalizedActual = normalizeCoordinates(actualCoordinates?.latitude, actualCoordinates?.longitude);
  if (!normalizedGuess || !normalizedActual) {
    drawMapOverlay();
    return;
  }

  const rect = guessMap.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    drawMapOverlay();
    return;
  }

  const usableWidth = Math.max(1, rect.width - (MAP_REVEAL_PADDING_PX * 2));
  const usableHeight = Math.max(1, rect.height - (MAP_REVEAL_PADDING_PX * 2));
  let fittedZoom = state.map.minZoom;
  let fittedCenterWorld = null;

  for (let zoom = state.map.maxZoom; zoom >= state.map.minZoom; zoom -= 1) {
    const worldSize = mapSize(zoom);
    const guessX = longitudeToWorldX(normalizedGuess.longitude, zoom);
    const guessY = latitudeToWorldY(normalizedGuess.latitude, zoom);
    const actualX = longitudeToWorldX(normalizedActual.longitude, zoom);
    const actualY = latitudeToWorldY(normalizedActual.latitude, zoom);
    let deltaX = actualX - guessX;
    if (deltaX > worldSize / 2) {
      deltaX -= worldSize;
    } else if (deltaX < -worldSize / 2) {
      deltaX += worldSize;
    }
    const deltaY = actualY - guessY;
    const spanX = Math.abs(deltaX);
    const spanY = Math.abs(deltaY);

    if (spanX <= usableWidth && spanY <= usableHeight) {
      fittedZoom = zoom;
      fittedCenterWorld = {
        x: guessX + (deltaX / 2),
        y: guessY + (deltaY / 2)
      };
      break;
    }
  }

  if (!fittedCenterWorld) {
    const zoom = state.map.minZoom;
    const worldSize = mapSize(zoom);
    const guessX = longitudeToWorldX(normalizedGuess.longitude, zoom);
    const guessY = latitudeToWorldY(normalizedGuess.latitude, zoom);
    const actualX = longitudeToWorldX(normalizedActual.longitude, zoom);
    const actualY = latitudeToWorldY(normalizedActual.latitude, zoom);
    let deltaX = actualX - guessX;
    if (deltaX > worldSize / 2) {
      deltaX -= worldSize;
    } else if (deltaX < -worldSize / 2) {
      deltaX += worldSize;
    }
    fittedCenterWorld = {
      x: guessX + (deltaX / 2),
      y: guessY + ((actualY - guessY) / 2)
    };
  }

  const targetCenter = {
    latitude: worldYToLatitude(fittedCenterWorld.y, fittedZoom),
    longitude: worldXToLongitude(fittedCenterWorld.x, fittedZoom)
  };
  animateMapViewTo(Math.min(MAP_MAX_REVEAL_ZOOM, fittedZoom), targetCenter);
}

function stopRoundTimer() {
  if (state.timerIntervalId !== null) {
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
  state.timerDeadline = 0;
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerDisplay(secondsLeft) {
  if (secondsLeft <= 0) {
    roundTimerStatus.textContent = '';
    roundTimerStatus.classList.add('hidden');
    return;
  }

  roundTimerStatus.textContent = `Time left: ${formatSeconds(secondsLeft)}`;
  roundTimerStatus.classList.remove('hidden');
}

function startRoundTimer() {
  stopRoundTimer();
  if (!Number.isFinite(state.roundTimerSeconds) || state.roundTimerSeconds <= 0) {
    updateTimerDisplay(0);
    return;
  }

  state.timerDeadline = performance.now() + (state.roundTimerSeconds * 1000);
  updateTimerDisplay(state.roundTimerSeconds);
  const tick = () => {
    if (state.resultVisible) {
      stopRoundTimer();
      return;
    }

    const remainingMs = state.timerDeadline - performance.now();
    const secondsLeft = Math.max(0, Math.floor(remainingMs / 1000));
    updateTimerDisplay(secondsLeft);
    if (secondsLeft <= 0) {
      stopRoundTimer();
      revealRound(true);
    }
  };

  state.timerIntervalId = setInterval(tick, 1000);
}

function revealRound(timeExpired = false) {
  if (!state.currentPhoto || state.resultVisible) {
    return;
  }

  const guessedDate = document.getElementById('guess-date').value;
  const location = state.currentPhoto.locationLabel || state.currentPhoto.country || 'unknown location';
  let locationText = `Actual location: ${location}`;
  let dateText = '';
  state.resultVisible = true;

  if (state.guessCoordinates) {
    const distance = distanceKm(state.guessCoordinates, state.currentPhoto);
    state.resultDistanceKm = distance;
    locationText = `${locationText} • Distance: ${Math.round(distance).toLocaleString('en-US')} km`;
    const dateOk = !state.includeDate || guessedDate === state.currentPhoto.takenAt;
    dateText = state.includeDate
      ? dateOk
        ? 'Date correct'
        : `Wrong date. Answer: ${state.currentPhoto.takenAt || 'unknown'}`
      : '';
    fitMapForReveal(state.guessCoordinates, state.currentPhoto);
  } else {
    state.resultDistanceKm = null;
    dateText = timeExpired
      ? 'Time expired (no guess)'
      : 'No guess';
    animateMapViewTo(Math.min(MAP_MAX_REVEAL_ZOOM, 4), state.currentPhoto);
  }

  feedback.textContent = `${locationText}${dateText ? ` • ${dateText}` : ''}`;
  stopRoundTimer();
  guessSubmitButton.textContent = 'NEXT ROUND';
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
  if (photo.source !== 'immich') {
    const safeImageUrl = sanitizeImageUrl(photo.imageUrl);
    if (!safeImageUrl) {
      return '';
    }
    clearActiveBlobUrl();
    return safeImageUrl;
  }

  const candidateUrls = Array.isArray(photo.imageUrls)
    ? photo.imageUrls
    : [photo.imageUrl];
  let lastError = null;

  for (const candidateUrl of candidateUrls) {
    const safeImageUrl = sanitizeImageUrl(candidateUrl);
    if (!safeImageUrl) {
      continue;
    }

    try {
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
        throw new Error(`Non-image response (${contentType || 'unknown type'})`);
      }

      clearActiveBlobUrl();
      state.activeBlobUrl = URL.createObjectURL(await response.blob());
      return state.activeBlobUrl;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return '';
}

async function renderPhoto(photo) {
  try {
    const imageUrl = await getRenderableImageUrl(photo);
    if (!imageUrl) {
      setPhotoPlaceholder('Photo cannot be displayed.');
      return;
    }

    photoWrapper.replaceChildren();
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = 'Photo to guess';
    photoWrapper.append(image);
  } catch (error) {
    const details = error?.message ? `: ${error.message}` : '';
    const message = photo.source === 'immich'
      ? `Unable to load this Immich photo${details}`
      : 'Photo cannot be displayed.';
    setPhotoPlaceholder(message);
  }
}

function getRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    return 0;
  }

  if (globalThis.crypto?.getRandomValues) {
    const randomValues = new Uint32Array(1);
    const limit = Math.floor(MAX_UINT32 / maxExclusive) * maxExclusive;
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
  cancelRevealAnimation();
  stopRoundTimer();
  state.currentPhoto = getRandomPhoto();
  if (!state.currentPhoto) {
    setPhotoPlaceholder('No geotagged photo available with these settings.');
    guessForm.classList.add('hidden');
    updateTimerDisplay(0);
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
  guessSubmitButton.textContent = 'SUBMIT';
  guessForm.classList.remove('hidden');
  startRoundTimer();
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
    imageUrl: `${serverUrl}/api/assets/${safeId}/original`,
    imageUrls: [
      `${serverUrl}/api/assets/${safeId}/original`,
      `${serverUrl}/api/assets/${safeId}/thumbnail`
    ],
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
  throw new Error(`Unable to load Immich photos${details}.`);
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
  feedback.textContent = `Guess placed: ${coordinates.latitude.toFixed(3)}, ${coordinates.longitude.toFixed(3)}`;
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
  settingsStatus.textContent = 'Loading...';

  const serverUrl = document.getElementById('server-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const timerSeconds = Number.parseInt(roundTimerInput.value.trim(), 10);
  state.includeDate = includeDateInput.checked;
  state.roundTimerSeconds = Number.isFinite(timerSeconds) && timerSeconds > 0 ? timerSeconds : 0;

  let photos = [];

  if (serverUrl && apiKey) {
    try {
      const hasPermission = await ensureHostPermission(serverUrl);
      if (!hasPermission) {
        throw new Error('Access to Immich domain denied');
      }

      photos = await fetchImmichPhotos(serverUrl, apiKey);
      state.apiKey = apiKey;
      const geoCount = photos.filter(hasCoordinates).length;
      settingsStatus.textContent = `Photos loaded from Immich: ${photos.length} (${geoCount} geotagged)`;
    } catch (error) {
      state.apiKey = '';
      settingsStatus.textContent = `Immich loading failed (${error.message}). Check the URL, API key, and permissions.`;
    }
  } else {
    photos = [...demoPhotos];
    state.apiKey = '';
    settingsStatus.textContent = 'Demo mode active (provide URL + API key for Immich).';
  }

  state.photos = photos;
  state.remainingPhotoIds = [];

  if (state.photos.length && !state.photos.some(hasCoordinates)) {
    settingsStatus.textContent = `${settingsStatus.textContent} • No photo with GPS coordinates`;
  }

  showCurrentPhoto();
});

guessMap.addEventListener('wheel', (event) => {
  event.preventDefault();
  const deltaMultiplier = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 256 : 1);
  state.map.wheelAccumulator += event.deltaY * deltaMultiplier;

  const now = performance.now();
  if (now - state.map.lastWheelZoomAt < MAP_WHEEL_COOLDOWN_MS) {
    return;
  }

  if (Math.abs(state.map.wheelAccumulator) < MAP_WHEEL_STEP_DELTA) {
    return;
  }

  const direction = state.map.wheelAccumulator > 0 ? -1 : 1;
  state.map.wheelAccumulator = 0;
  state.map.lastWheelZoomAt = now;
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
  if (Math.abs(deltaX) > MAP_DRAG_THRESHOLD_PX || Math.abs(deltaY) > MAP_DRAG_THRESHOLD_PX) {
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

  if (state.resultVisible) {
    showCurrentPhoto();
    return;
  }

  if (!state.guessCoordinates) {
    feedback.textContent = 'Cliquez sur la carte pour poser votre supposition.';
    return;
  }

  revealRound(false);
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

  const values = await chrome.storage.local.get(['serverUrl', 'apiKey', 'roundTimerSeconds', 'includeDate']);
  document.getElementById('server-url').value = values.serverUrl || '';
  document.getElementById('api-key').value = values.apiKey || '';
  roundTimerInput.value = values.roundTimerSeconds || '';
  includeDateInput.checked = values.includeDate ?? true;
  updateTimerDisplay(0);

  settingsForm.addEventListener('change', async () => {
    const parsedTimer = Number.parseInt(roundTimerInput.value.trim(), 10);
    await chrome.storage.local.set({
      serverUrl: document.getElementById('server-url').value.trim(),
      apiKey: document.getElementById('api-key').value.trim(),
      roundTimerSeconds: Number.isFinite(parsedTimer) && parsedTimer > 0 ? parsedTimer : 0,
      includeDate: includeDateInput.checked
    });
  });
})();
