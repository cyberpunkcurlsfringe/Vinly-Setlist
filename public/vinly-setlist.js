let currentPlaylist = [];

document.addEventListener('DOMContentLoaded', () => {

  const API = {
    artists: '/api/artists',
    albums: artist => `/api/albums/${encodeURIComponent(artist)}`,
    tracks: (artist, album) => `/api/tracks/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`,
    coverArtist: artist => `/api/cover/${encodeURIComponent(artist)}`,
    coverAlbum: (artist, album) => `/api/cover/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`
  };

  const VinlySetlist = {
    albumDir: (artist, album) => `/Vinly Setlist/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`,
    lyricCandidates: (artist, album, base) => ([
      `${VinlySetlist.albumDir(artist, album)}/${base}.lrc`,
      `${VinlySetlist.albumDir(artist, album)}/${base}.txt`
    ])
  };

  const FETCH_TIMEOUT_MS = 10000;

  // -----------------------------
  // DOM references
  // -----------------------------
  const artistCoverEl = document.getElementById('artist-cover');
  const artistNameEl = document.getElementById('artist-name');
  const prevBtn = document.getElementById('prev-artist');
  const nextBtn = document.getElementById('next-artist');

  const albumsEl = document.getElementById('albums');
  const tracksHeader = document.getElementById('tracks-header');
  const tracksEl = document.getElementById('tracks');

  const playerShell = document.getElementById('player-shell');
  const player = document.getElementById('player');
  const playBtn = document.getElementById('play-btn');
  const trackTitleEl = document.getElementById('player-track-title');
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');

  // -----------------------------
  // State & caches
  // -----------------------------
  const state = {
    artists: [],
    albumsByArtist: new Map(),
    tracksByAlbum: new Map(),
    coverByAlbum: new Map(),
    current: { artistIndex: 0, artist: null, album: null, trackIndex: -1 },
    playlist: []
  };

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Request timeout')), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }
  async function safeJson(url) {
    const res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`Failed: ${res.status} ${res.statusText}`);
    return res.json();
  }
  async function safeText(url) {
    const res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`Failed: ${res.status} ${res.statusText}`);
    return res.text();
  }
  function formatTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function albumKey(artist, album) { return `${artist}:::${album}`; }
  function stripExt(name) { const dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(0, dot) : name; }
  function setText(el, text) { if (el) el.textContent = text; }
  function clear(el) { if (el) el.innerHTML = ''; }

  // -----------------------------
  // Data fetchers
  // -----------------------------

  async function fetchSetlist() {
    const folder = window.activeFolder || null;
    const url = folder
      ? `/setlist/current?folder=${encodeURIComponent(folder)}`
      : `/setlist/current`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    return res.json();
  }

  // -----------------------------
  // Artists
  // -----------------------------
  async function fetchArtists() {
    const data = await fetchSetlist();
    state.artists = data.artists.map(a => a.artist);
    return state.artists;
  }

  // -----------------------------
  // Albums for a given artist
  // -----------------------------
  async function fetchAlbumsForArtist(artist) {
    const data = await fetchSetlist();
    const matches = data.artists.filter(a => a.artist === artist);
    const list = matches.flatMap(a => a.albums.map(al => al.album));
    state.albumsByArtist.set(artist, list);
    return list;
  }

  // -----------------------------
  // Tracks for a given artist
  // -----------------------------
  async function fetchTracksForArtist(artist) {
    const data = await fetchSetlist();
    const matches = data.artists.filter(a => a.artist === artist);
    const allTracks = matches.flatMap(a => a.tracks || []);
    return allTracks.map((t, idx) => ({
      name: t.name,
      url: `/media?path=${encodeURIComponent(t.path)}`,
      realPath: t.path,
      index: idx,
      artist,
      album: null,
      type: t.type || "audio",
      relative: t.relative,
      rootName: t.rootName,
      rootType: t.rootType
    }));
  }

  // -----------------------------
  // Tracks for a given album
  // -----------------------------
  async function fetchTracksForAlbum(artist, album) {
    const key = albumKey(artist, album);
    const data = await fetchSetlist();

    const matches = data.artists.filter(a => a.artist === artist);
    const allAlbums = matches.flatMap(a => a.albums.filter(al => al.album === album));

    const list = allAlbums.flatMap(al =>
      al.tracks.map((t, idx) => ({
        name: t.name,
        url: `/media?path=${encodeURIComponent(t.path)}`,
        realPath: t.path,
        index: idx,
        artist,
        album,
        type: t.type || "audio",
        relative: [artist, album, t.name].join("/"),
        rootName: t.rootName,
        rootType: t.rootType
      }))
    );

    state.tracksByAlbum.set(key, list);
    return list;
  }

  // -----------------------------
  // Covers
  // -----------------------------
  async function fetchCoverForArtist(artist) {
    const data = await fetchSetlist();
    const matches = data.artists.filter(a => a.artist === artist);
    const cover = matches.find(a => a.cover)?.cover;
    return cover ? `/media?path=${encodeURIComponent(cover)}` : null;
  }

  async function fetchCoverForAlbum(artist, album) {
    const key = albumKey(artist, album);
    const data = await fetchSetlist();
    const matches = data.artists.filter(a => a.artist === artist);
    const foundAlbum = matches.flatMap(a => a.albums).find(al => al.album === album);
    if (foundAlbum?.cover) {
      const url = `/media?path=${encodeURIComponent(foundAlbum.cover)}`;
      state.coverByAlbum.set(key, url);
      return url;
    }
    return null;
  }

// -----------------------------
// Lyrics fetcher
// -----------------------------
async function fetchLyricsForTrack(track) {
  if (!track || !track.realPath) {
    console.warn("[Lyrics] Missing track or realPath:", track);
    return '';
  }

  const url = `/lyrics?realPath=${encodeURIComponent(track.realPath)}`;
  try {
    const text = await safeText(url);

    // Trim and normalize response
    if (text && text.trim().length > 0) {
      return text.trim();
    } else {
      console.warn("[Lyrics] Empty response for:", track.realPath);
      return '';
    }
  } catch (err) {
    console.error("[Lyrics] Failed to fetch:", err);
    return '';
  }
}

// -----------------------------
// Artist render
// -----------------------------
async function renderArtist(index) {
  const artists = await fetchArtists();
  if (!artists.length) return;

  // cycle through artists
  state.current.artistIndex = (index + artists.length) % artists.length;
  const artistEntry = artists[state.current.artistIndex];

  // normalize: artistEntry may be object { artist, cover, ... } or string
  const artistName = typeof artistEntry === 'string' ? artistEntry : artistEntry.artist;
  state.current.artist = artistName;

  // cover lookup
  let coverUrl = await fetchCoverForArtist(artistName);
  if (!coverUrl) {
    try {
      const res = await safeJson(API.coverArtist(artistName));
      if (res.cover) {
        coverUrl = res.cover;
        console.log(`[renderArtist] Fallback cover loaded for ${artistName}`);
      }
    } catch (err) {
      console.warn(`[renderArtist] Failed to fetch fallback cover for ${artistName}:`, err);
    }
  }

  // update cover element
  if (artistCoverEl) {
    artistCoverEl.src = coverUrl || 'https://via.placeholder.com/80?text=No+Cover';
    artistCoverEl.alt = coverUrl ? artistName : 'No cover';
  }

  // update name
  setText(artistNameEl, artistName);

  const itemEl = artistNameEl?.closest('.artist-carousel-item');
  if (!itemEl) return;
  itemEl.style.cursor = 'pointer';

  // activation handler
  async function handleArtistActivate() {
    // render albums first
    await renderAlbums(artistName);

    // then fetch artist-level tracks (audio + video)
    try {
      const artistTracks = await fetchTracksForArtist(artistName);
      if (Array.isArray(artistTracks) && artistTracks.length > 0) {
        console.log(`[renderArtist] appending artist-level tracks for ${artistName}: ${artistTracks.length}`);

        const enriched = artistTracks.map(t => ({
          artist: artistName,
          album: null,
          title: t.name,
          url: t.url,
          realPath: t.realPath,
          type: t.type,        // "audio" or "video"
          relative: t.relative,
          rootName: t.rootName,
          rootType: t.rootType
        }));

        await renderTracks(artistName, null, enriched, { append: true });
      } else {
        console.log(`[renderArtist] no artist-level tracks for ${artistName}`);
      }
    } catch (err) {
      console.error(`[renderArtist] failed to load artist-level tracks for ${artistName}:`, err);
    }
  }

  // click / keyboard / context menu bindings
  itemEl.onclick = (e) => {
    e.preventDefault();
    handleArtistActivate();
  };

  itemEl.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleArtistActivate();
    }
  };

  itemEl.oncontextmenu = (e) => {
    e.preventDefault();
    showMenu(
      [{ label: 'Setlist shuffle', action: 'setlist-shuffle-artist' }],
      e.clientX, e.clientY,
      { artist: artistName }
    );
  };
}

// -----------------------------
// Albums render
// -----------------------------
async function renderAlbums(artist) {
  const albums = await fetchAlbumsForArtist(artist);
  const row = albumsEl.querySelector('.album-row');
  if (!row) return;
  row.innerHTML = '';

  if (!albums.length) {
    clear(tracksEl);
    state.current.album = null;
    return;
  }

  for (const album of albums) {
    let coverURL = await fetchCoverForAlbum(artist, album);

    // Fallback: ask backend to fetch from iTunes
    if (!coverURL) {
      try {
        const res = await safeJson(API.coverAlbum(artist, album));
        if (res.cover) {
          coverURL = res.cover;
          console.log(`[renderAlbums] Fallback cover loaded for ${artist} - ${album}`);
        }
      } catch (err) {
        console.warn(`[renderAlbums] Failed to fetch fallback cover for ${artist} - ${album}:`, err);
      }
    }

    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `
      <img src="${coverURL || 'https://via.placeholder.com/128x120?text=No+Cover'}" alt="${album}">
      <div class="album-card-title">${album}</div>
    `;

    card.addEventListener('click', async () => {
      state.current.album = album;

      // ⭐ Fetch tracks for this album
      const albumTracks = await fetchTracksForAlbum(artist, album);

      if (Array.isArray(albumTracks) && albumTracks.length > 0) {
        // ⭐ Enrich with raw + cleaned names before rendering
        const enriched = albumTracks.map(t => {
          const rawFile = t.file || t.name || "";
          return {
            artist,
            album,
            file: rawFile,                     // ✅ always preserve raw filename
            name: rawFile,                     // ✅ raw for detection
            title: stripExt(rawFile),          // ✅ cleaned for display (extension only removed)
            url: t.url,
            realPath: t.realPath,
            type: t.type,
            relative: t.relative,
            rootName: t.rootName,
            rootType: t.rootType
          };
        });

        await renderTracks(artist, album, enriched);
      }
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(
        [{ label: 'Setlist shuffle', action: 'setlist-shuffle-album' }],
        e.clientX, e.clientY,
        { artist, album }
      );
    });

    row.appendChild(card);
  }
}

// -----------------------------
// Track item helper
// -----------------------------
function createTrackItem(trackObj, index, sourceType = 'Setlist', sourceName = '') {
  const div = document.createElement('div');
  div.className = 'track-item';
  div.dataset.index = index;
  div.dataset.path = trackObj.realPath;

  // ✅ Infer type from extension if not provided
  const inferType = (url) => {
    const ext = (url || '').split('.').pop()?.toLowerCase();
    if (['mp4', 'webm', 'mkv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
    return trackObj.type || 'audio';
  };
  const type = trackObj.type || inferType(trackObj.url || trackObj.realPath);
  trackObj.type = type;

  div.dataset.type = type;
  div.dataset.url = trackObj.url || '';
  div.classList.add(type === 'video' ? 'track-video' : 'track-audio');

  // ✅ Title span: always use cleaned title, fallback to raw name
  const titleSpan = document.createElement('span');
  titleSpan.className = 'track-title';
  titleSpan.textContent = trackObj.title || trackObj.name || "";
  div.appendChild(titleSpan);

  // ✅ Index pill
  const numSpan = document.createElement('span');
  numSpan.className = 'track-index-pill';
  numSpan.textContent = index + 1;
  div.appendChild(numSpan);

  // ✅ Click handler
  div.addEventListener('click', () => {
    const cpItem = currentPlaylist[index];
    if (cpItem) {
      if (!cpItem.type) cpItem.type = div.dataset.type;
      if (!cpItem.url && div.dataset.url) cpItem.url = div.dataset.url;
      if (!cpItem.realPath && div.dataset.path) cpItem.realPath = div.dataset.path;
    }
    playFromPlaylist(index);
  });

  trackObj._el = div;

  // ✅ Context menu
  div.addEventListener('contextmenu', e => {
    e.preventDefault();

    const payloadCommon = {
      artist: trackObj.artist,
      album: trackObj.album,
      track: { ...trackObj, type }, // ensure type is included
      sourceType,
      sourceName
    };

    if (trackObj.fromSetlist) {
      showMenu(
        [{ label: 'Delete', action: 'deleteFromSetlist', className: 'delete' }],
        e.pageX,
        e.pageY,
        { ...payloadCommon, sourceFile: trackObj.sourceFile }
      );
    } else {
      showMenu(
        [{ label: 'Add to Setlist', action: 'addToSetlist' }],
        e.pageX,
        e.pageY,
        payloadCommon
      );
    }
  });

  return div;
}

function stripExt(name) {
  if (typeof name !== "string") return "";
  return name.replace(/\.[^/.]+$/, ""); // remove extension only
}

// -----------------------------
// Tracks render 
// -----------------------------
function stripExt(name) {
  if (typeof name !== "string") return "";
  // ✅ Only remove the extension, preserve prefixes like 01-, 01., 01 , 01 -
  return name.replace(/\.[^/.]+$/, "");
}

async function renderTracks(artist, album, preloadedTracks) {
  let tracks = [];

  if (Array.isArray(preloadedTracks)) {
    tracks = preloadedTracks;
  } else if (album) {
    tracks = await fetchTracksForAlbum(artist, album);
  } else {
    tracks = await fetchTracksForArtist(artist);
  }

  tracksEl.innerHTML = '';

  const h2 = tracksHeader?.querySelector('h2');
  if (h2) {
    h2.textContent = album
      ? `${artist} — ${album}`
      : `${artist} — Tracks`;
  }

  if (!tracks.length) {
    tracksEl.innerHTML = '<div class="info">No tracks found.</div>';
    state.playlist = [];
    state.current.trackIndex = -1;
    return;
  }

  // ⭐ Build enriched track objects with safe defaults
  state.playlist = tracks.map((tr, i) => {
    const rawName = tr.name || tr.title || "";
    return {
      artist,
      album: album || null,
      name: rawName,                  // ✅ keep original filename
      title: stripExt(rawName),       // ✅ cleaned for display (extension only removed)
      url: tr.url,
      realPath: tr.realPath,
      index: i,
      fromSetlist: false,
      type: tr.type || "audio",
      relative: tr.relative || `${artist}/${album || ""}/${rawName}`,
      rootName: tr.rootName || "Vinly Setlist",
      rootType: tr.rootType || "Add setlist"
    };
  });

  currentPlaylist = state.playlist.slice();
  state.current.trackIndex = 0;

  state.playlist.forEach((trackObj, i) => {
    const trackDiv = createTrackItem(trackObj, i, artist, album || null);

    trackDiv.dataset.type = trackObj.type;
    trackDiv.classList.add(
      trackObj.type === "video" ? "track-video" : "track-audio"
    );

    trackDiv.addEventListener("click", () => {
      playFromPlaylist(i);
    });

    tracksEl.appendChild(trackDiv);
  });
}

// -----------------------------
// Shuffle helpers
// -----------------------------
async function setlistShuffleArtist(artist) {
  const albums = await fetchAlbumsForArtist(artist);
  let combined = [];
  for (const album of albums) {
    const tracks = await fetchTracksForAlbum(artist, album);
    for (const t of tracks) {
      combined.push({
        artist,
        album,
        title: t.name,
        url: t.url,
        realPath: t.realPath
      });
    }
  }
  if (!combined.length) return;

  // Shuffle and update state
  currentPlaylist = shuffle(combined);
  state.playlist = currentPlaylist.slice();
  state.current.trackIndex = 0;

  //Refresh tracklist DOM
  tracksEl.innerHTML = '';
  currentPlaylist.forEach((track, i) => {
    const trackDiv = createTrackItem(track, i, 'Artist', artist);
    tracksEl.appendChild(trackDiv);
  });

  // Update header
  const h2 = tracksHeader.querySelector('h2');
  if (h2) h2.textContent = `Setlist (Artist: ${artist})`;

  // Start playback
  playFromPlaylist(0);
}

async function setlistShuffleAlbum(artist, album) {
  const tracks = await fetchTracksForAlbum(artist, album);
  if (!tracks.length) return;

  const shuffled = shuffle(
    tracks.map((t, idx) => ({
      artist,
      album,
      title: t.name,
      url: t.url,
      realPath: t.realPath,
      index: idx
    }))
  );

  // Shuffle and update state
  state.playlist = shuffled;
  currentPlaylist = state.playlist.slice();
  state.current.album = album;
  state.current.trackIndex = 0;

  //Refresh tracklist DOM
  tracksEl.innerHTML = '';
  shuffled.forEach((track, i) => {
    const trackDiv = createTrackItem(track, i, 'Album', album);
    tracksEl.appendChild(trackDiv);
  });

  // Update header
  const h2 = tracksHeader.querySelector('h2');
  if (h2) h2.textContent = `Setlist (Album: ${album})`;

  // Start playback
  playFromPlaylist(0);
}

// -----------------------------
// Context menu
// -----------------------------
let contextMenuEl = null;
function ensureContextMenu() {
  if (contextMenuEl) return contextMenuEl;
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'context-menu';
  contextMenuEl.style.position = 'fixed';
  contextMenuEl.style.display = 'none';
  contextMenuEl.style.zIndex = '9999';
  document.body.appendChild(contextMenuEl);
  document.addEventListener('click', () => hideMenu());
  window.addEventListener('blur', () => hideMenu());
  return contextMenuEl;
}
function showMenu(items, x, y, payload) {
  window.__menuPayload = payload || null;
  const menu = ensureContextMenu();
  menu.innerHTML = items.map(i => `<div class="menu-item" data-action="${i.action}">${i.label}</div>`).join('');
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'block';
  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const action = e.currentTarget.dataset.action;
      hideMenu();
      await handleMenuAction(action);
    });
  });
}
function hideMenu() { if (contextMenuEl) contextMenuEl.style.display = 'none'; }

// -----------------------------
// Context menu action handler
// -----------------------------
async function handleMenuAction(action) {
  // Context menu payload is set when you right-click
  const payload = window.__menuPayload || {};

  // Fallback to current state if payload missing
  const artist = payload.artist || state.current.artist;
  const album  = payload.album  || state.current.album;
  const track  = payload.track;
  const setlistFile = payload.sourceFile; // file name passed for setlist-loaded tracks

  switch (action) {
    case 'setlist-shuffle-artist':
      if (artist) {
        await setlistShuffleArtist(artist);
      } else {
        console.warn('No artist available for shuffle');
      }
      break;

    case 'setlist-shuffle-album':
      if (artist && album) {
        await setlistShuffleAlbum(artist, album);
      } else {
        console.warn('No artist/album available for shuffle');
      }
      break;

    case 'addToSetlist':
      if (track) {
        new AddToSetlistOverlay(track.realPath).show();
      } else {
        console.warn('No track provided for AddToSetlist');
      }
      break;
  
case 'deleteFromSetlist': {
  const { track } = payload;
  const setlistFile = payload.sourceFile;
  if (!track || !setlistFile) {
    console.warn('Delete action missing track or setlist file');
    break;
  }

  try {
    const res = await fetch('/setlist/deleteTrack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: setlistFile,
        trackPath: track.realPath
      })
    });
    if (!res.ok) throw new Error('Delete failed');

    // 1) Prefer direct DOM reference
    if (track._el && track._el.parentNode) {
      track._el.remove();
    } else {
      // 2) Fallback: find by dataset.path safely
      const items = document.querySelectorAll('.track-item');
      for (const item of items) {
        if (item.dataset.path === track.realPath) {
          item.remove();
          break;
        }
      }
    }

    // 3) Update playlist state
    state.playlist = state.playlist.filter(t => t.realPath !== track.realPath);

    // 4) Adjust current index if needed
    if (state.current.trackIndex >= state.playlist.length) {
      state.current.trackIndex = 0;
    }
  } catch (err) {
    console.error('Error deleting track:', err);
  }
  break;
}
    case 'load-setlist':
      new LoadSetlistOverlay().show();
      break;

    default:
      console.warn(`Unknown menu action: ${action}`);
      break;
  }
}

const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];

async function fetchTracksForAlbum(artist, album) {
  const key = albumKey(artist, album);
  const data = await fetchSetlist();

  const foundArtist = data.artists.find(a => a.artist === artist);
  const foundAlbum = foundArtist?.albums.find(al => al.album === album);

  const list = foundAlbum
    ? foundAlbum.tracks.map((t, idx) => {
        const ext = t.path ? t.path.toLowerCase() : '';
        const isVideo = VIDEO_EXTS.some(v => ext.endsWith(v));

        return {
          name: t.name,
          url: `/media?path=${encodeURIComponent(t.path)}`,
          lyrics: t.lyrics || '',
          realPath: t.path,
          index: idx,
          artist,
          album,
          type: isVideo ? 'video' : 'audio'
        };
      })
    : [];

  state.tracksByAlbum.set(key, list);
  return list;
}

function renderShuffledPlaylistUI(label) {
  const tracksContainer = tracksEl;
  if (!tracksContainer) return;

  // Update header
  const h2 = tracksHeader?.querySelector('h2');
  if (h2) h2.textContent = `${label} — Shuffled Setlist`;

  // Clear container
  tracksContainer.innerHTML = '';

  // Prefer state.playlist, fall back to currentPlaylist
  const playlist = (state.playlist && state.playlist.length) ? state.playlist : currentPlaylist;

  playlist.forEach((trackObj, i) => {
    // Try to use your helper (preserves context menu)
    let trackDiv;
    try {
      trackDiv = createTrackItem(trackObj, i, 'Shuffled', label);
    } catch (e) {
      trackDiv = null;
    }

    // Fallback: manual element if helper not available
    if (!trackDiv) {
      const displayTitle = stripExt(trackObj.title || trackObj.name);
      trackDiv = document.createElement('div');
      trackDiv.className = 'track-item';
      trackDiv.innerHTML = `
        <span class="track-title">${displayTitle}</span>
        <span class="track-index-pill">${i + 1}</span>
      `;
      trackDiv.addEventListener('click', () => playFromPlaylist(i));
    }

    tracksContainer.appendChild(trackDiv);
  });
}

async function setlistShuffleArtist(artist) {
  const albums = await fetchAlbumsForArtist(artist);
  let combined = [];
  for (const album of albums) {
    const tracks = await fetchTracksForAlbum(artist, album);
    for (const t of tracks) {
      combined.push({
        artist,
        album,
        title: t.name,
        url: t.url,
        realPath: t.realPath
      });
    }
  }
  if (!combined.length) return;

  const shuffled = shuffle(combined);

  state.playlist = shuffled;
  currentPlaylist = shuffled.slice();
  state.current.trackIndex = 0;

  renderShuffledPlaylistUI(artist);
  playFromPlaylist(0);
}

async function setlistShuffleAlbum(artist, album) {
  const tracks = await fetchTracksForAlbum(artist, album);
  if (!tracks.length) return;

  const shuffled = shuffle(
    tracks.map((t, idx) => ({
      artist,
      album,
      title: t.name,
      url: t.url,
      realPath: t.realPath,
      index: idx
    }))
  );

  state.playlist = shuffled;
  currentPlaylist = state.playlist.slice();
  state.current.album = album;
  state.current.trackIndex = 0;

  const h2 = tracksHeader?.querySelector('h2');
  if (h2) h2.textContent = `${artist} — ${album} — Shuffled Setlist`;

  tracksEl.innerHTML = '';
  currentPlaylist.forEach((t, i) => {
    tracksEl.appendChild(createTrackItem(t, i, artist, album)); //reuse helper
  });

  playFromPlaylist(0);
}

// -----------------------------
// Play from playlist
// -----------------------------
async function playFromPlaylist(index) {
  if (!currentPlaylist.length || index < 0 || index >= currentPlaylist.length) return;
  state.current.trackIndex = index;

  const item = currentPlaylist[index];
  // ✅ Always prefer normalized title, fallback to cleaned name
  const displayTitle = item.title || (item.name ? item.name.replace(/\.[^.]+$/, "") : "");

  if (item.type === "video") {
    // Stop audio if playing
    if (!audioPlayer.paused) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
    const aFooter = document.getElementById("audio-footer");
    if (aFooter) {
      aFooter.classList.add("collapsed");
      aFooter.classList.remove("open");
      aFooter.setAttribute("aria-hidden", "true");
      aFooter.style.display = "none";
    }

    // Update WebTV footer + frame header
    const videoTitleEl = document.getElementById("webtv-track-title");
    if (videoTitleEl) videoTitleEl.textContent = displayTitle;

    const frameTitleEl = document.querySelector(".webtv-frame-title");
    if (frameTitleEl) frameTitleEl.textContent = "Now Playing: " + displayTitle;

    // Show WebTV footer
    const vFooter = document.getElementById("webtv-footer");
    if (vFooter) {
      vFooter.classList.remove("collapsed");
      vFooter.classList.add("open");
      vFooter.setAttribute("aria-hidden", "false");
      vFooter.style.display = "block";
    }

    // Load video
    showWebtvFrame(item);
    await loadUniversalVideo(item);

    activePlayer = webtvVideo.videoEl;
    webtvVideo.videoEl.play().catch(err => console.error("Video play failed:", err));

    webtvVideo.videoEl.onended = () => playFromPlaylist(index + 1);

    // Lyrics for video
    try {
      const lyrics = await fetchLyricsForTrack(item);
      document.dispatchEvent(new CustomEvent("lyrics:update", {
        detail: { text: lyrics || "No lyrics available", artist: item.artist, album: item.album, title: displayTitle }
      }));
    } catch {
      document.dispatchEvent(new CustomEvent("lyrics:update", {
        detail: { text: "No lyrics available", artist: item.artist, album: item.album, title: displayTitle }
      }));
    }

  } else {
    // Stop video if playing
    if (webtvVideo.videoEl && !webtvVideo.videoEl.paused) {
      webtvVideo.videoEl.pause();
      webtvVideo.videoEl.currentTime = 0;
    }
    hideWebtvFrame();
    const vFooter = document.getElementById("webtv-footer");
    if (vFooter) {
      vFooter.classList.add("collapsed");
      vFooter.classList.remove("open");
      vFooter.setAttribute("aria-hidden", "true");
      vFooter.style.display = "none";
    }

    // Wire audio element
    audioPlayer.src = item.url;
    audioPlayer.load();

    // Show audio footer
    const aFooter = document.getElementById("audio-footer");
    if (aFooter) {
      aFooter.classList.remove("collapsed");
      aFooter.classList.add("open");
      aFooter.setAttribute("aria-hidden", "false");
      aFooter.style.display = "block";
    }

    // Update Audio footer title
    const audioTitleEl = document.getElementById("player-track-title");
    if (audioTitleEl) audioTitleEl.textContent = displayTitle;

    activePlayer = audioPlayer;

    audioPlayer.onloadedmetadata = () => {
      audioPlayer.play().catch(err => console.error("Playback failed:", err));
      updateAudioUI();
    };

    audioPlayer.onended = () => playFromPlaylist(index + 1);

    bindAudioProgress(audioPlayer);

    // Lyrics for audio
    try {
      const lyrics = await fetchLyricsForTrack(item);
      document.dispatchEvent(new CustomEvent("lyrics:update", {
        detail: { text: lyrics || "No lyrics available", artist: item.artist, album: item.album, title: displayTitle }
      }));
    } catch {
      document.dispatchEvent(new CustomEvent("lyrics:update", {
        detail: { text: "No lyrics available", artist: item.artist, album: item.album, title: displayTitle }
      }));
    }
  }
}

function updatePlayButtonForCurrent() {
  const playBtn = document.getElementById("play-btn");
  if (!activePlayer || !playBtn) return;
  playBtn.textContent = activePlayer.paused ? "Play" : "Pause";
}

// -----------------------------
// Carousel navigation
// -----------------------------
prevBtn?.addEventListener('click', () => renderArtist(state.current.artistIndex - 1));
nextBtn?.addEventListener('click', () => renderArtist(state.current.artistIndex + 1));

// -----------------------------
// Init
// -----------------------------
(async () => {
  try {
    await fetchArtists();
    if (!state.artists.length) { clear(albumsEl); clear(tracksEl); return; }
    await renderArtist(0);
    initPlayerEvents();
  } catch (_) {}
})();

// -----------------------------
// Setlist integration
// -----------------------------
document.addEventListener('setlist:load', (e) => {
  const { roots, artists } = e.detail;
  console.log('[setlist.js] New roots:', roots);

  state.artists = artists.map(a => a.artist);
  renderArtist(0);

  currentPlaylist = state.playlist.slice();
});

document.addEventListener('setlist:reorder', () => {
  currentPlaylist = state.playlist.slice();
});

// -----------------------------
// Player events
// -----------------------------
function initPlayerEvents() {
  const lyricsBtn = document.getElementById('lyrics-btn');
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  const closeLyrics = document.getElementById('close-lyrics');

  if (lyricsBtn && lyricsOverlay) {
    lyricsBtn.onclick = () => {
      lyricsOverlay.style.display = 'flex';
      lyricsOverlay.setAttribute('aria-hidden', 'false');
    };
  }

  if (closeLyrics && lyricsOverlay) {
    closeLyrics.onclick = () => {
      lyricsOverlay.style.display = 'none';
      lyricsOverlay.setAttribute('aria-hidden', 'true');
    };
  }
}

// -----------------------------
// Floating WebTV frame helpers
// -----------------------------
function showWebtvFrame(item) {
  const frameTitle = document.querySelector('.webtv-frame-title');
  const frameEl    = document.getElementById('webtv-frame');

  const displayTitle = (item.name || "").replace(/\.[^.]+$/, "");

  if (frameTitle) frameTitle.textContent = "Now Playing: " + displayTitle;
  if (frameEl) {
    frameEl.style.display = 'flex';
    frameEl.setAttribute('aria-hidden', 'false');
  }
}

function hideWebtvFrame() {
  const frameEl = document.getElementById('webtv-frame');
  if (frameEl) {
    frameEl.style.display = 'none';
    frameEl.setAttribute('aria-hidden', 'true');
  }
  if (typeof stopWebtvVideo === 'function') stopWebtvVideo();
}

function playNextInPlaylist() {
  const nextIndex = state.current.trackIndex + 1;
  if (nextIndex < currentPlaylist.length) {
    playFromPlaylist(nextIndex);
  } else {
    console.log("[WebTV] Playlist finished");
    // Optional loop:
    // playFromPlaylist(0);
  }
}

window.playFromPlaylist = playFromPlaylist;
window.showMenu = showMenu;
window.hideMenu = hideMenu;
window.handleMenuAction = handleMenuAction;
window.createTrackItem = createTrackItem;
});