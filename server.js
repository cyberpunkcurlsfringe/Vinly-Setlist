const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = 3000;

// Enable JSON parsing globally
app.use(express.json());

// Root public folder
const PUBLIC = path.join(__dirname, 'public');
const ROOT = path.join(PUBLIC, 'Vinly Setlist');

app.use('/lyrics', express.static(path.join(__dirname, 'public/lyrics')));


// Ensure required folders exist
[PUBLIC, ROOT, path.join(__dirname, 'public', 'Setlist')].forEach(folder => {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const setlistDir = path.join(__dirname, 'public', 'Setlist');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff', '.webp', '.ico', '.svg'];
const AUDIO_EXTS = ['.mp3', '.wav', '.wma', '.aac', '.flac', '.ogg', '.m4a', '.mid', '.midi', '.aiff', '.au'];
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv']; 

function isMediaFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}

// Background folders
[
  "Vinly Setlist Background",
  "Vinly Background",
  "Vinly Lyrics Background"
].forEach(name => {
  const folder = path.join(__dirname, "public", name);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

// Helpers
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function normalizeWin(p) { try { return path.win32.normalize(p); } catch { return p.replace(/\\+/g, '\\'); } }

function getArtists() {
  return fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isDirectory());
}
function getAlbums(artist) {
  const artistPath = path.join(ROOT, artist);
  return fs.readdirSync(artistPath).filter(f => fs.statSync(path.join(artistPath, f)).isDirectory());
}
function getTracks(artist, album) {
  const albumPath = path.join(ROOT, artist, album);
  return fs.readdirSync(albumPath).filter(f => AUDIO_EXTS.includes(path.extname(f).toLowerCase()));
}
function getAlbumCover(artist, album) {
  const albumPath = path.join(ROOT, artist, album);
  if (!fs.existsSync(albumPath)) return null;
  const files = fs.readdirSync(albumPath);
  return files.find(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase())) || null;
}
function getArtistCover(artist) {
  const artistPath = path.join(ROOT, artist);
  if (!fs.existsSync(artistPath)) return null;
  const files = fs.readdirSync(artistPath);
  return files.find(f => {
    const base = path.parse(f).name.toLowerCase();
    return base === artist.toLowerCase() && IMAGE_EXTS.includes(path.extname(f).toLowerCase());
  }) || null;
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/&/g, 'and')      // normalize ampersand
    .replace(/[-–—]/g, '-')    // normalize dashes
    .replace(/['’]/g, "'")     // normalize apostrophes
    .replace(/\s+/g, ' ')      // collapse spaces
    .trim();
}

async function fetchITunesJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Vinly Deck', 'Accept': 'application/json' } }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function getArtistTracks(artist) {
  const base = (activeRoots && activeRoots.length > 0) ? activeRoots[0] : ROOT;

  const folders = fs.readdirSync(base).filter(f => isDir(path.join(base, f)));
  const match = folders.find(f => f.toLowerCase() === artist.toLowerCase());
  if (!match) {
    console.warn(`[getArtistTracks] No folder match for artist: ${artist} in base: ${base}`);
    return [];
  }

  const artistPath = path.join(base, match);

  return fs.readdirSync(artistPath)
    .filter(f => /\.(mp3|m4a|wav|flac|mp4|mkv|avi)$/i.test(f))
    .map(f => {
      const fullPath = path.join(artistPath, f);
      const relativePath = path.join(match, f).replace(/\\/g, "/");
      const rootName = path.basename(base || ROOT) || "Vinly Setlist";
      const type = /\.(mp4|mkv|avi)$/i.test(f) ? "video" : "audio";

      return {
        name: f,
        url: `/media?path=${encodeURIComponent(fullPath)}`,
        realPath: fullPath,
        type,
        relative: relativePath,
        rootName,
        rootType: "Add setlist"
      };
    });
}

app.get('/api/artist-tracks/:artist', (req, res) => {
  const { artist } = req.params;
  const tracks = getArtistTracks(artist);
  res.json(tracks);
});

app.get('/api/tracks/:artist/:album', (req, res) => {
  const { artist, album } = req.params;
  const base = (activeRoots && activeRoots.length > 0) ? activeRoots[0] : ROOT;

  // normalize artist folder name if needed
  const artistFolders = fs.readdirSync(base).filter(f => isDir(path.join(base, f)));
  const matchArtist = artistFolders.find(f => f.toLowerCase() === artist.toLowerCase());
  if (!matchArtist) {
    console.warn(`[API] Artist folder not found: ${artist} in base: ${base}`);
    return res.json([]);
  }

  const albumPath = path.join(base, matchArtist, album);
  if (!fs.existsSync(albumPath)) {
    console.warn(`[API] Album path not found: ${albumPath}`);
    return res.json([]);
  }

  const rootName = path.basename(base || ROOT) || "Vinly Setlist";

  const tracks = fs.readdirSync(albumPath)
    .filter(f => isMediaFile(f))
    .map(f => {
      const fullPath = path.join(albumPath, f);
      const relativePath = path.join(matchArtist, album, f).replace(/\\/g, "/");
      const type = isMediaFile(f);

      return {
        name: f,
        url: `/media?path=${encodeURIComponent(fullPath)}`,
        realPath: fullPath,
        type,                  
        relative: relativePath, 
        rootName,               
        rootType: "Add setlist" 
      };
    });

  res.json(tracks);
});

app.get('/lyrics', (req, res) => {
  const { realPath } = req.query;
  if (!realPath) return res.status(400).send("Missing realPath");

  const normalized = normalizeWin(realPath);
  const txtPath = normalized.replace(/\.(mp3|wav|wma|aac|flac|ogg|m4a|mid|midi|aiff|au)$/i, ".txt");
  const lrcPath = normalized.replace(/\.(mp3|wav|wma|aac|flac|ogg|m4a|mid|midi|aiff|au)$/i, ".lrc");

  if (fs.existsSync(txtPath)) return res.sendFile(txtPath);
  if (fs.existsSync(lrcPath)) return res.sendFile(lrcPath);

  return res.status(404).send("Lyrics not found");
});

async function getITunesArtworkURL(term, artist, album, entity = 'album') {
  const endpoint = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=50&country=US`;
  console.log('[getITunesArtworkURL] endpoint:', endpoint);

  const data = await fetchITunesJSON(endpoint);
  const results = Array.isArray(data.results) ? data.results : [];
  console.log('[getITunesArtworkURL] results:', results.length);

  if (!results.length) return null;

  const targetArtist = normalize(artist);
  const targetAlbum  = album ? normalize(album) : null;

  // Exact artist + album first
  let chosen = results.find(r =>
    r.artworkUrl100 &&
    normalize(r.artistName) === targetArtist &&
    (!targetAlbum || normalize(r.collectionName) === targetAlbum)
  );

  // Contains album with exact artist
  if (!chosen && targetAlbum) {
    chosen = results.find(r =>
      r.artworkUrl100 &&
      normalize(r.artistName) === targetArtist &&
      normalize(r.collectionName).includes(targetAlbum)
    );
  }

  // Fallback: any exact artist (no random other artists)
  if (!chosen) {
    chosen = results.find(r =>
      r.artworkUrl100 && normalize(r.artistName) === targetArtist
    ) || null;
  }

  if (!chosen) return null;

  const base = chosen.artworkUrl100 || chosen.artworkUrl60 || chosen.artworkUrl30 || null;
  if (!base) return null;

  // Upgrade size
  return base.replace(/\/\d+x\d+bb\./, '/425x425bb.');
}

async function downloadImage(url, dest) {
  console.log('[downloadImage] url:', url, 'dest:', dest);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Vinly Deck)' } }, response => {
      const status = response.statusCode || 0;
      console.log('[downloadImage] status:', status);
      if (status !== 200) {
        file.close(() => fs.existsSync(dest) && fs.unlinkSync(dest));
        return reject(new Error(`HTTP ${status}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => {
      file.close(() => fs.existsSync(dest) && fs.unlinkSync(dest));
      reject(err);
    });
  });
}

const makeArtistVariants = (s) => {
  const base = s || '';
  const dashToSpace = base.replace(/[-–—]/g, ' ');
  const noDashes = base.replace(/[-–—]/g, '');
  const noSpaces = base.replace(/\s+/g, '');
  const swapAmp = base.replace(/&/g, 'and');
  const swapAmpBack = base.replace(/and/gi, '&');
  const normQuotes = base.replace(/[’]/g, "'");
  const unique = new Set([base, dashToSpace, noDashes, noSpaces, swapAmp, swapAmpBack, normQuotes]);
  return Array.from(unique).filter(v => v.trim().length > 0);
};

// Serve static files
app.use(express.static(PUBLIC));
app.use('/Vinly Setlist', express.static(ROOT));

// Root route → index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ------------------------------
// Library API routes
// ------------------------------
app.get('/api/artists', (req, res) => res.json(getArtists()));

app.get('/api/albums/:artist', (req, res) => res.json(getAlbums(req.params.artist)));

app.get('/api/cover/:artist', async (req, res) => {
  const cover = await getArtistCover(req.params.artist);
  res.json({ cover: cover ? `/Vinly Setlist/${req.params.artist}/${cover}` : null });
});

app.get('/api/cover/:artist/:album', async (req, res) => {
  const cover = await getAlbumCover(req.params.artist, req.params.album);
  res.json({ cover: cover ? `/Vinly Setlist/${req.params.artist}/${req.params.album}/${cover}` : null });
});

app.get("/api/backgrounds/:folder", (req, res) => {
  const folderPath = path.join(__dirname, "public", req.params.folder);
  if (!fs.existsSync(folderPath)) return res.json([]);
  const files = fs.readdirSync(folderPath).filter(file => IMAGE_EXTS.includes(path.extname(file).toLowerCase()));
  res.json(files);
});

// ------------------------------
// Merged structure logic
// ------------------------------
function findCover(dir, folderName) {
  try {
    const files = fs.readdirSync(dir);
    const lower = new Map(files.map(f => [f.toLowerCase(), f]));
    const candidates = [`${folderName.toLowerCase()}.jpg`, 'cover.jpg', 'folder.jpg', 'front.jpg'];
    for (const c of candidates) if (lower.has(c)) return path.join(dir, lower.get(c));
    return null;
  } catch { return null; }
}

let activeRoots = [ROOT];

// ------------------------------
// Setlist routes
// ------------------------------
app.post('/setlist/select', (req, res) => {
  let { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'Missing folder path' });
  folder = normalizeWin(folder);
  if (!fs.existsSync(folder)) return res.status(404).json({ error: 'Folder not found', folder });
  if (!isDir(folder)) return res.status(400).json({ error: 'Path is not a directory', folder });
  activeRoots = [folder];
  console.log('[select] root:', activeRoots[0]);
  res.json({ ok: true, roots: activeRoots });
});

app.get('/setlist/current', async (req, res) => {
  if (!activeRoots.length) return res.status(404).json({ error: 'No setlist roots selected' });
  try {
    const artists = await mergedStructure(activeRoots);
    res.json({ roots: activeRoots, artists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/setlist/shuffle', (req, res) => {
  try {
    const artists = mergedStructure(activeRoots);
    const all = [];
    const base = activeRoots && activeRoots.length > 0 ? activeRoots[0] : ROOT;
    const rootName = path.basename(base || ROOT) || "Vinly Setlist";

    artists.forEach(a =>
      a.albums.forEach(al =>
        al.tracks.forEach(t => {
          const relativePath = path.join(a.artist, al.album, t.name).replace(/\\/g, "/");
          all.push({
            artist: a.artist,
            album: al.album,
            title: stripExt(t.name),
            url: `/media?path=${encodeURIComponent(t.path)}`,
            realPath: t.path,
            type: isMediaFile(t.name),
            relative: relativePath,
            rootName,
            rootType: "Add setlist"
          });
        })
      )
    );

    // Fisher–Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// Media route
// ------------------------------
app.get('/media', (req, res) => {
  let filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });
  filePath = normalizeWin(filePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found', path: filePath });
  res.sendFile(path.resolve(filePath));
});

// ------------------------------
// Setlist management
// ------------------------------
app.get('/setlist/list', (req, res) => {
  try {
    const files = fs.readdirSync(setlistDir)
      .filter(f => f.endsWith('.txt')); // no roots.txt anymore
    res.json(files);
  } catch (err) {
    console.error('[list] error:', err);
    res.status(500).json({ error: 'Failed to list setlists' });
  }
});

app.get('/setlist/read', (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'Missing setlist name' });
  const filename = name.endsWith('.txt') ? name : `${name}.txt`;
  const filePath = path.join(setlistDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Setlist not found' });
  const content = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  res.json(content);
});

app.post('/setlist/create', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing setlist name' });
  const safeName = name.replace(/[<>:"/\\|?*]+/g, '');
  const filename = safeName.endsWith('.txt') ? safeName : `${safeName}.txt`;
  const filePath = path.join(setlistDir, filename);
  if (fs.existsSync(filePath)) return res.status(400).json({ error: 'Setlist already exists' });
  fs.writeFileSync(filePath, '');
  res.json({ success: true, filename });
});

// -----------------------------
// Add Setlist
// -----------------------------
app.post('/setlist/add', (req, res) => {
  let { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'Missing folder path' });
  folder = normalizeWin(folder);
  if (!fs.existsSync(folder)) return res.status(404).json({ error: 'Folder not found', folder });
  if (!isDir(folder)) return res.status(400).json({ error: 'Path is not a directory', folder });

  try {
    const resolved = path.resolve(folder);
    if (!activeRoots.find(r => path.resolve(r) === resolved)) {
      activeRoots.push(folder);
    }
    console.log('[add] roots:', activeRoots);
    res.json({ success: true, roots: activeRoots });
  } catch (err) {
    console.error('[add] error:', err);
    res.status(500).json({ error: 'Failed to add setlist folder' });
  }
});

// -----------------------------
// Append track to setlist
// -----------------------------
app.post('/setlist/append', (req, res) => {
  const { setlist, track } = req.body;
  console.log('[append] received:', { setlist, track });
  if (!setlist || !track) return res.status(400).json({ error: 'Missing parameters' });

  const filename = setlist.endsWith('.txt') ? setlist : `${setlist}.txt`;
  const filePath = path.join(setlistDir, filename);

  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '');

  try {
    const normalizedTrack = track.replace(/\\\\/g, '\\');

    let content = fs.readFileSync(filePath, 'utf8');

    if (content.length > 0 && !content.endsWith('\n')) {
      fs.appendFileSync(filePath, '\n', 'utf8');
    }

    fs.appendFileSync(filePath, normalizedTrack + '\n', 'utf8');

    console.log('[append] wrote to', filename, 'track=', normalizedTrack);
    res.json({ success: true });
  } catch (err) {
    console.error('[append] error writing file:', err);
    res.status(500).json({ error: 'Failed to append track' });
  }
});

// -----------------------------
// Read a setlist file
// -----------------------------
app.get('/setlist/readLoadFile', (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'Missing file parameter' });

  const filePath = path.join(setlistDir, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found', file });
  }

  try {
    const lines = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(l => l.trim().length > 0);

    res.json({ lines }); // object with lines for overlay
  } catch (err) {
    console.error('[readLoadFile] error:', err);
    res.status(500).json({ error: 'Failed to read setlist' });
  }
});

// Delete track from a setlist file (.txt format)
app.post('/setlist/deleteTrack', (req, res) => {
  const { file, trackPath } = req.body;

  if (!file || !trackPath) {
    return res.status(400).json({ error: 'Missing file or trackPath' });
  }

  const filename = file.endsWith('.txt') ? file : `${file}.txt`;
  const filePath = path.join(setlistDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Setlist file not found' });
  }

  try {
    // Read all lines
    const lines = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(l => l.trim().length > 0);

    // Remove the track
    const updated = lines.filter(line => line !== trackPath);

    // Write back to file
    fs.writeFileSync(filePath, updated.join('\n'), 'utf8');

    return res.json({ success: true, removed: trackPath });
  } catch (err) {
    console.error('[deleteTrack] error:', err); 
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// -----------------------------
// Delete entire setlist file
// -----------------------------
app.delete('/setlist/deleteSetlist', (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).json({ error: 'Missing file' });

  const filename = file.endsWith('.txt') ? file : `${file}.txt`;
  const filePath = path.join(setlistDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Setlist file not found' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, deleted: filename });
  } catch (err) {
    console.error('[deleteSetlist] error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// -----------------------------
// Reorder setlist
// -----------------------------
app.post('/setlist/reorder', (req, res) => {
  const { setlist, tracks } = req.body;
  if (!setlist || !Array.isArray(tracks)) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const filename = setlist.endsWith('.txt') ? setlist : `${setlist}.txt`;
  const filePath = path.join(setlistDir, filename);

  try {
    const content = tracks.join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[reorder] saved new order to', filename);
    res.json({ success: true });
  } catch (err) {
    console.error('[reorder] error writing file:', err);
    res.status(500).json({ error: 'Failed to reorder setlist' });
  }
});

const structureCache = new Map();

function stripExt(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function normalizeCoverPath(basePath, fallback) {
  if (!fallback) return null;
  if (path.isAbsolute(fallback) || fallback.includes(path.sep)) {
    return fallback;
  }
   return path.join(basePath, fallback);
}

async function readStructure(base, { forceReload = false } = {}) {
  const cacheKey = path.resolve(base);

  if (!forceReload && structureCache.has(cacheKey)) {
    return structureCache.get(cacheKey);
  }

  const rootName = path.basename(base);
  const rootType = "Add setlist";

  const artists = fs.readdirSync(base).filter(f => isDir(path.join(base, f)));

  const struct = await Promise.all(
    artists.map(async artistFolder => {
      const artistPath = path.join(base, artistFolder);

      // cover lookup
      let artistCover = findCover(artistPath, artistFolder);
      if (!artistCover) {
        try {
          const fallback = await getArtistCover(base, artistFolder);
          artistCover = normalizeCoverPath(artistPath, fallback);
        } catch {}
      }

      // direct artist-level tracks (audio + video)
      const artistTracks = fs.readdirSync(artistPath)
        .map(trackName => {
          const type = isMediaFile(trackName);
          if (!type) return null;

          const baseName = stripExt(trackName);
          const title = baseName.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
          const fullPath = path.join(artistPath, trackName);

          let rel = path.relative(base, fullPath).replace(/\\/g, "/");
          // normalize relative path so it works for custom roots too
          rel = rel.replace(/^Vinly Setlist\//i, "");

          return {
            name: title || baseName,
            file: trackName,
            path: fullPath,
            relative: rel,
            type,
            rootName,
            rootType
          };
        })
        .filter(Boolean);

      // albums under artist
      const albums = fs.readdirSync(artistPath).filter(f => isDir(path.join(artistPath, f)));

      const albumData = await Promise.all(
        albums.map(async albumFolder => {
          const albumPath = path.join(artistPath, albumFolder);

          let albumCover = findCover(albumPath, albumFolder);
          if (!albumCover) {
            try {
              const fallback = await getAlbumCover(base, artistFolder, albumFolder);
              albumCover = normalizeCoverPath(albumPath, fallback);
            } catch {}
          }

          const tracks = fs.readdirSync(albumPath)
            .map(trackName => {
              const type = isMediaFile(trackName);
              if (!type) return null;

              const baseName = stripExt(trackName);
              const title = baseName.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
              const fullPath = path.join(albumPath, trackName);

              let rel = path.relative(base, fullPath).replace(/\\/g, "/");
              rel = rel.replace(/^Vinly Setlist\//i, "");

              return {
                name: title || baseName,
                file: trackName,
                path: fullPath,
                relative: rel,
                type,
                rootName,
                rootType
              };
            })
            .filter(Boolean);

          return { album: albumFolder, cover: albumCover, tracks };
        })
      );

      return {
        artist: artistFolder,
        cover: artistCover,
        tracks: artistTracks,
        albums: albumData
      };
    })
  );

  structureCache.set(cacheKey, struct);
  return struct;
}

async function mergedStructure(roots, opts = {}) {
  const artistsMap = new Map();

  for (const root of roots) {
    let struct;
    try {
      struct = await readStructure(root, opts);
    } catch {
      continue;
    }

    for (const a of struct) {
      const aKey = a.artist.toLowerCase();

      if (!artistsMap.has(aKey)) {
        artistsMap.set(aKey, {
          artist: a.artist,
          cover: a.cover || null,
          tracks: [...(a.tracks || [])], // include artist-level tracks
          albums: new Map()
        });
      } else {
        const entry = artistsMap.get(aKey);
        if (!entry.cover && a.cover) entry.cover = a.cover;

        // merge artist-level tracks
        const existing = new Set(entry.tracks.map(t => (t.path || "").toLowerCase()));
        for (const t of a.tracks || []) {
          const p = (t.path || "").toLowerCase();
          if (!existing.has(p)) {
            entry.tracks.push(t);
            existing.add(p);
          }
        }
      }

      const entry = artistsMap.get(aKey);
      const albumsMap = entry.albums;

      // merge albums
      for (const al of a.albums) {
        const alKey = al.album.toLowerCase();

        if (!albumsMap.has(alKey)) {
          albumsMap.set(alKey, {
            album: al.album,
            cover: al.cover || null,
            tracks: [...al.tracks]
          });
        } else {
          const existing = albumsMap.get(alKey);
          if (!existing.cover && al.cover) existing.cover = al.cover;

          const names = new Set(existing.tracks.map(t => (t.file || "").toLowerCase()));
          for (const t of al.tracks) {
            const key = (t.file || "").toLowerCase();
            if (!names.has(key)) {
              existing.tracks.push(t);
              names.add(key);
            }
          }
        }
      }
    }
  }

  return Array.from(artistsMap.values()).map(a => ({
    artist: a.artist,
    cover: a.cover,
    tracks: a.tracks, // artist-level tracks preserved
    albums: Array.from(a.albums.values())
  }));
}

// -----------------------------
// Artist cover 
// -----------------------------
async function getArtistCover(artist) {
  if (!artist) {
    console.warn('[getArtistCover] Missing artist');
    return null;
  }

  // Use the first active root
  const base = activeRoots[0];
  const artistPath = path.join(base, artist);

  if (!fs.existsSync(artistPath)) {
    return null;
  }

  // Look for local cover first
  const files = fs.readdirSync(artistPath);
  const localCover = files.find(f =>
    path.parse(f).name.toLowerCase() === artist.toLowerCase() &&
    IMAGE_EXTS.includes(path.extname(f).toLowerCase())
  );

  if (localCover) {
    return path.relative(PUBLIC, path.join(artistPath, localCover));
  }

  // iTunes fallback
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=album&limit=50&country=US`;
    const data = await fetchITunesJSON(url);
    const results = Array.isArray(data.results) ? data.results : [];

    const normalizedArtist = normalize(artist);
    const match = results.find(r => normalize(r.artistName) === normalizedArtist);

    if (!match || !match.artworkUrl100) return null;

    const imageUrl = match.artworkUrl100.replace('100x100bb', '425x425bb');
    const ext = path.extname(new URL(imageUrl).pathname.split('/').pop()) || '.jpg';
    const filename = `${artist}${ext}`;
    const dest = path.join(artistPath, filename);

    await downloadImage(imageUrl, dest);
    return path.relative(PUBLIC, dest);
  } catch (err) {
    console.error('[getArtistCover] error:', err);
    return null;
  }
}

// -----------------------------
// Album cover
// -----------------------------
async function getAlbumCover(artist, album) {
  if (!artist || !album) {
    console.warn('[getAlbumCover] Missing artist or album:', { artist, album });
    return null;
  }

  const base = activeRoots[0];
  const albumPath = path.join(base, artist, album);

  if (!fs.existsSync(albumPath)) {
    return null;
  }

  // Local cover first
  const files = fs.readdirSync(albumPath);
  const coverFile = files.find(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));

  if (coverFile) {
    return path.relative(PUBLIC, path.join(albumPath, coverFile));
  }

  // iTunes fallback
  try {
    const query = `${artist} ${album}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=50&country=US`;
    const data = await fetchITunesJSON(url);
    const results = Array.isArray(data.results) ? data.results : [];

    const normalizedArtist = normalize(artist);
    const normalizedAlbum = normalize(album);

    const match = results.find(r =>
      normalize(r.artistName) === normalizedArtist &&
      normalize(r.collectionName) === normalizedAlbum
    );

    if (!match || !match.artworkUrl100) return null;

    const imageUrl = match.artworkUrl100.replace('100x100bb', '425x425bb');
    const ext = path.extname(new URL(imageUrl).pathname.split('/').pop()) || '.jpg';
    const filename = `${album}${ext}`;
    const dest = path.join(albumPath, filename);

    await downloadImage(imageUrl, dest);
    return path.relative(PUBLIC, dest);
  } catch (err) {
    console.error('[getAlbumCover] error:', err);
    return null;
  }
}

// ------------------------------
// Start server
// ------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});