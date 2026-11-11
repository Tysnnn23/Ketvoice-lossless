const DEFAULT_TIMEOUT = 45000;

function baseUrl() {
  return String(process.env.TIDAL_API_URL || '').trim().replace(/\/$/, '');
}

async function request(path, params = {}) {
  const base = baseUrl();
  if (!base) throw new Error('TIDAL_API_URL is not configured');
  const url = new URL(path, base + '/');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) throw new Error(`Tidal API ${res.status}: ${data?.detail || text.slice(0, 200)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function coverUrl(id, size = 640) {
  if (!id) return undefined;
  const hex = String(id).split('-');
  if (hex.length !== 5) return undefined;
  return `https://resources.tidal.com/images/${hex[0]}/${hex[1]}/${hex[2]}/${hex[3]}/${hex[4]}/${size}x${size}.jpg`;
}

function mapTrack(t) {
  if (!t) return null;
  const artist = t.artist?.name || t.artists?.[0]?.name || '';
  const album = t.album?.title || '';
  return {
    id: `tidal:${t.id}`,
    title: t.title || '',
    artist,
    album,
    duration: Number(t.duration || 0),
    artworkURL: coverUrl(t.album?.cover || t.artist?.picture),
    format: 'flac',
    audioQuality: String(t.audioQuality || t.mediaMetadata?.tags?.[0] || 'LOSSLESS').toUpperCase(),
    isrc: t.isrc
  };
}

function qualityToTidal(value) {
  const q = String(value || 'lossless').toLowerCase();
  if (q === 'low') return 'LOSSLESS';
  if (q === 'high') return 'HI_RES_LOSSLESS';
  return 'HI_RES_LOSSLESS';
}

function decodeManifest(manifest) {
  if (!manifest) return null;
  try {
    return JSON.parse(Buffer.from(manifest, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function tidalConfigured() {
  return Boolean(baseUrl());
}

export async function tidalSearch(query, limit = 25) {
  const data = await request('/search/', { s: query, limit });
  const items = data?.data?.items || [];
  return items.map(mapTrack).filter(Boolean);
}

export async function tidalResolveStream(id, quality = 'lossless') {
  const rawId = String(id).replace(/^tidal:/, '');
  if (!/^\d+$/.test(rawId)) throw new Error('Invalid track ID');

  const data = await request('/track/', {
    id: rawId,
    quality: 'LOSSLESS'
  });

  const track = data?.data;
  if (!track?.manifest) throw new Error('Missing Tidal manifest');

  if (track.manifestMimeType === 'application/dash+xml') {
    const xml = Buffer.from(track.manifest, 'base64').toString('utf8');

    if (!xml.includes('<MPD') || xml.includes('<ContentProtection')) {
      throw new Error('Unsupported or protected DASH manifest');
    }

    const origin = String(process.env.PUBLIC_BASE_URL || 'http://localhost:8080')
      .replace(/\/$/, '');

    return {
      url: `${origin}/tidal-mpd/${rawId}?quality=low`,
      format: 'dash',
      manifest: 'dash',
      mimeType: 'application/dash+xml',
      codec: 'flac',
      container: 'mp4',
      quality: 'lossless',
      encrypted: false,
      sampleRate: track.sampleRate,
      bitDepth: track.bitDepth
    };
  }

  const decoded = decodeManifest(track.manifest);
  const url = decoded?.urls?.[0];

  if (!url || decoded.encryptionType !== 'NONE') {
    throw new Error('No supported unprotected audio URL');
  }

  return {
    url,
    format: 'flac',
    manifest: 'none',
    codec: 'flac',
    container: 'flac',
    quality: 'lossless',
    encrypted: false,
    sampleRate: track.sampleRate,
    bitDepth: track.bitDepth
  };
}

export async function tidalDashManifest(id) {
  if (!/^\d+$/.test(String(id))) {
    throw new Error('Invalid track ID');
  }

  const data = await request('/track/', {
    id,
    quality: 'LOSSLESS'
  });

  const track = data?.data;
  if (track?.manifestMimeType !== 'application/dash+xml') {
    throw new Error('DASH not available');
  }

  const xml = Buffer.from(track.manifest, 'base64').toString('utf8');

  if (!xml.includes('<MPD') || xml.includes('<ContentProtection')) {
    throw new Error('Unsupported or protected DASH manifest');
  }

  return xml;
}

export async function tidalHealth() {
  if (!tidalConfigured()) return { enabled: false, configured: false };
  try {
    const data = await request('/');
    return { enabled: true, configured: true, ok: true, version: data?.version || undefined };
  } catch (error) {
    return { enabled: true, configured: true, ok: false, error: String(error.message || error) };
  }
}



