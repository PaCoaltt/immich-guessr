const settingsForm = document.getElementById('settings-form');
const guessForm = document.getElementById('guess-form');
const guessDateLabel = document.getElementById('guess-date-label');
const settingsStatus = document.getElementById('settings-status');
const photoWrapper = document.getElementById('photo-wrapper');
const feedback = document.getElementById('feedback');
const nextPhotoButton = document.getElementById('next-photo');
const includeDateInput = document.getElementById('include-date');

const demoPhotos = [
  {
    id: 'demo-1',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    country: 'France',
    takenAt: '2024-05-11'
  },
  {
    id: 'demo-2',
    imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80',
    country: 'Suisse',
    takenAt: '2023-09-02'
  },
  {
    id: 'demo-3',
    imageUrl: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?auto=format&fit=crop&w=1200&q=80',
    country: 'Japon',
    takenAt: '2022-01-20'
  }
];

const state = {
  photos: [],
  currentPhoto: null,
  includeDate: true,
  apiKey: '',
  activeBlobUrl: ''
};

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function setPhotoPlaceholder(message) {
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
    throw new Error(`HTTP ${response.status}`);
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
    setPhotoPlaceholder('Impossible de charger cette photo Immich.');
  }
}

function getRandomPhoto() {
  if (!state.photos.length) {
    return null;
  }

  const index = Math.floor(Math.random() * state.photos.length);
  return state.photos[index];
}

async function showCurrentPhoto() {
  state.currentPhoto = getRandomPhoto();
  if (!state.currentPhoto) {
    setPhotoPlaceholder('Aucune photo disponible avec ces paramètres.');
    guessForm.classList.add('hidden');
    nextPhotoButton.classList.add('hidden');
    return;
  }

  await renderPhoto(state.currentPhoto);
  feedback.textContent = '';
  guessForm.reset();
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
  const country = asset?.exifInfo?.country || asset?.exifInfo?.city || '';
  const takenAtRaw = asset?.fileCreatedAt || asset?.localDateTime;
  const takenAt = takenAtRaw ? takenAtRaw.slice(0, 10) : '';
  return {
    id: safeId,
    imageUrl: `${serverUrl}/api/assets/${safeId}/thumbnail`,
    source: 'immich',
    country,
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
            ? data.assets.items
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
  state.apiKey = '';

  if (serverUrl && apiKey) {
    try {
      const hasPermission = await ensureHostPermission(serverUrl);
      if (!hasPermission) {
        throw new Error('Accès au domaine Immich refusé');
      }

      photos = await fetchImmichPhotos(serverUrl, apiKey);
      state.apiKey = apiKey;
      settingsStatus.textContent = `Photos chargées depuis Immich: ${photos.length}`;
    } catch (error) {
      settingsStatus.textContent = `Échec du chargement Immich (${error.message}). Vérifie l'URL, la clé API et les droits.`;
    }
  } else {
    photos = [...demoPhotos];
    settingsStatus.textContent = 'Mode démo actif (renseigne URL + clé API pour Immich).';
  }

  const normalizedFilter = normalize(countryFilter);
  state.photos = normalizedFilter
    ? photos.filter((photo) => normalize(photo.country) === normalizedFilter)
    : photos;

  showCurrentPhoto();
});

guessForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!state.currentPhoto) {
    return;
  }

  const guessedCountry = normalize(document.getElementById('guess-country').value);
  const guessedDate = document.getElementById('guess-date').value;

  const countryOk = guessedCountry === normalize(state.currentPhoto.country);
  const dateOk = !state.includeDate || guessedDate === state.currentPhoto.takenAt;

  const locationText = countryOk ? 'Lieu correct' : `Lieu faux. Réponse: ${state.currentPhoto.country || 'inconnu'}`;
  const dateText = state.includeDate
    ? dateOk
      ? 'Date correcte'
      : `Date fausse. Réponse: ${state.currentPhoto.takenAt || 'inconnue'}`
    : '';

  feedback.textContent = `${locationText}${dateText ? ` • ${dateText}` : ''}`;
  nextPhotoButton.classList.remove('hidden');
});

nextPhotoButton.addEventListener('click', () => {
  showCurrentPhoto();
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
