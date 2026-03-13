// Global playback state
// -----------------------------
const state = {
  playlist: [],
  current: {
    album: null,
    artist: null,
    trackIndex: 0
  }
};

// global references to containers
const tracksEl = document.getElementById('tracks');   // tracklist container
const tracksHeader = document.getElementById('tracks-header'); // header container

// -----------------------------
// Utility: strip file extension
// -----------------------------
function stripExt(filename) {
  if (!filename) return '';
  return filename.replace(/\.[^/.]+$/, ''); // remove last dot + extension
}

// -----------------------------
// Utility: create a track item element
// -----------------------------
function createTrackItem(trackObj, index, sourceType = 'Setlist', sourceName = '') {
  const div = document.createElement('div');
  div.className = 'track-item';
  div.dataset.index = index;
  div.dataset.path = trackObj.realPath;

  // title
  const span = document.createElement('span');
  span.textContent = trackObj.title;
  div.appendChild(span);

// click handler: play track
div.addEventListener('click', () => {
  playFromPlaylist(index); // ✅ use existing playback system
});

  return div;
}

// -----------------------------
// Utility: play a track by path
// -----------------------------
function playTrack(path) {
  // assume you have a global <audio> element
  const audioEl = document.getElementById('player');
  if (!audioEl) {
    console.error('No audio player element found');
    return;
  }

  audioEl.src = `/media?path=${encodeURIComponent(path)}`;
  audioEl.play()
    .then(() => console.log('Playing:', path))
    .catch(err => console.error('Error playing track:', err));
}


// -----------------------------
// Backend helpers for setlists
// -----------------------------
async function listSetlists() {
  const res = await fetch('/setlist/list');
  if (!res.ok) return [];
  return res.json();
}

async function appendTrackToSetlist(setlist, trackPath) {
  console.log('[appendTrackToSetlist] sending', { setlist, track: trackPath });
  try {
    const res = await fetch('/setlist/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setlist, track: trackPath })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[appendTrackToSetlist] failed', res.status, errText);
      return false;
    }

    const data = await res.json();
    if (data && data.success) {
      console.log('[appendTrackToSetlist] success response from backend');
      return true;   // overlay will close
    } else {
      console.error('[appendTrackToSetlist] backend did not return success', data);
      return false;
    }
  } catch (err) {
    console.error('[appendTrackToSetlist] error', err);
    return false;
  }
}

async function createSetlist(name) {
  await fetch('/setlist/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
}

async function readSetlist(name) {
  const res = await fetch(`/setlist/read?name=${encodeURIComponent(name)}`);
  if (!res.ok) return [];
  return res.json();
}

// -----------------------------
// Overlay UI for adding tracks
// -----------------------------
class AddToSetlistOverlay {
  constructor(trackPath) {
    this.trackPath = trackPath;
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';

    const box = document.createElement('div');
    box.className = 'overlay-box';

    const title = document.createElement('h3');
    title.textContent = 'Add to Setlist';
    box.appendChild(title);

    // Dropdown of setlists
    this.listbox = document.createElement('select');
    box.appendChild(this.listbox);

    this.refreshListbox();

    // OK button
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.onclick = async () => {
      const chosen = this.listbox.value;
      const ok = await appendTrackToSetlist(chosen, this.trackPath);
      if (ok) this.close();
    };
    box.appendChild(okBtn);

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => this.close();
    box.appendChild(cancelBtn);

    // Create new setlist button
    const newBtn = document.createElement('button');
    newBtn.textContent = 'Create New Setlist';
    newBtn.onclick = () => {
      // hide instead of remove
      this.overlay.classList.remove('show');
      new CreateSetlistOverlay(this).show();
    };
    box.appendChild(newBtn);

    this.overlay.appendChild(box);
  }

  async refreshListbox() {
    try {
      const files = await listSetlists();
      this.listbox.innerHTML = '';
      files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        this.listbox.appendChild(opt);
      });
    } catch (err) {
      console.error('Error fetching setlists:', err);
    }
  }

  show() {
    this.overlay.classList.add('show');
    document.body.appendChild(this.overlay);
  }

  close() {
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}

// -----------------------------
// Overlay UI for creating new setlist
// -----------------------------
class CreateSetlistOverlay {
  constructor(parentOverlay) {
    this.parentOverlay = parentOverlay;
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';

    const box = document.createElement('div');
    box.className = 'overlay-box';

    const title = document.createElement('h3');
    title.textContent = 'Create New Setlist';
    box.appendChild(title);

    // Textbox for new setlist title
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Enter setlist title';
    box.appendChild(this.input);

    // OK button
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.onclick = async () => {
      const name = this.input.value.trim();
      if (!name) return;
      try {
        await createSetlist(name);
        this.close();
        // Refresh parent overlay listbox
        await this.parentOverlay.refreshListbox();
        this.parentOverlay.show();
      } catch (err) {
        console.error('Error creating setlist:', err);
      }
    };
    box.appendChild(okBtn);

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      this.close();
      this.parentOverlay.show();
    };
    box.appendChild(cancelBtn);

    this.overlay.appendChild(box);
  }

  show() {
    this.overlay.classList.add('show');   // ensure CSS fade-in
    document.body.appendChild(this.overlay);
  }

  close() {
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}



// -----------------------------
// Hook into menu actions
// -----------------------------
function handleMenuAction(action, trackPath) {
  if (action === 'addToSetlist') {
    new AddToSetlistOverlay(trackPath).show();
  }
  if (action === 'loadSetlist') {
    new LoadSetlistOverlay().show();
  }
}

class LoadSetlistOverlay {
  constructor() {
    // Prevent duplicate overlays
    const existing = document.getElementById('loadsetlist-overlay');
    if (existing) {
      this.el = existing;
      return;
    }

    this.el = document.createElement('div');
    this.el.id = 'loadsetlist-overlay';
    this.el.className = 'overlay'; // ensure CSS targets this
    this.el.innerHTML = `
      <div class="overlay-card">
        <h3>Load Setlist</h3>
        <select id="setlist-select"></select>
        <div class="row">
          <button id="setlist-load-confirm">Load</button>
          <button id="setlist-load-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector('#setlist-load-cancel')?.addEventListener('click', () => {
      this.el.classList.remove('show');
    });

    this.el.querySelector('#setlist-load-confirm')?.addEventListener('click', async () => {
      const setlistFilename = this.el.querySelector('#setlist-select')?.value;
      if (!setlistFilename) return;

      try {
        const res = await fetch(`/setlist/readLoadFile?file=${encodeURIComponent(setlistFilename)}`);
        const data = await res.json();
        const lines = Array.isArray(data) ? data : data.lines;

        if (!lines || !lines.length) {
          tracksEl.innerHTML = '';
          state.playlist = [];
          state.current.trackIndex = -1;
          state.current.loadedSetlist = null;
          const h2 = tracksHeader?.querySelector('h2');
          if (h2) h2.textContent = '';
          return;
        }

        tracksEl.innerHTML = '';
        state.playlist = lines.map((line, i) => {
          const parts = line.split(/[\\/]/);
          const trackFilename = parts.at(-1) || 'Unknown.mp3';
          const artist = parts.at(-3) || 'Unknown Artist';
          const album = parts.at(-2) || 'Unknown Album';
          const cleanTitle = trackFilename.replace(/\.(mp3|wav|flac)$/i, '');
          const trackObj = {
            title: cleanTitle,
            realPath: line,
            url: `/media?path=${encodeURIComponent(line)}`,
            artist,
            album,
            index: i,
            fromSetlist: true,
            sourceFile: setlistFilename
          };

          const trackDiv = createTrackItem(trackObj, i, 'Setlist', trackFilename);
          trackDiv.setAttribute('draggable', 'true');
          trackDiv.dataset.realPath = line;
          trackDiv.dataset.fromSetlist = "true";
          tracksEl.appendChild(trackDiv);

          return trackObj;
        });

        currentPlaylist = state.playlist.slice();
        state.current.trackIndex = 0;
        state.current.loadedSetlist = setlistFilename;

        const h2 = tracksHeader?.querySelector('h2');
        if (h2) {
          const baseName = setlistFilename.replace(/\.[^/.]+$/, '');
          h2.textContent = baseName;
        }

        this.attachDragHandlers();
        this.el.classList.remove('show');
      } catch (err) {
        console.error('Error loading setlist:', err);
      }
    });
  }

  async show() {
    try {
      const res = await fetch('/setlist/list');
      const files = await res.json();
      const select = this.el.querySelector('#setlist-select');
      if (select) {
        select.innerHTML = files.map(f => `<option value="${f}">${f}</option>`).join('');
      }
      this.el.classList.add('show');
    } catch (err) {
      console.error('Error fetching setlists:', err);
    }
  }

  attachDragHandlers() {
    let draggingEl = null;

    tracksEl.addEventListener('dragstart', e => {
      if (e.target.classList.contains('track-item') && e.target.dataset.fromSetlist === "true") {
        draggingEl = e.target;
        e.target.style.opacity = '0.5';
      }
    });

    tracksEl.addEventListener('dragend', e => {
      if (e.target.dataset.fromSetlist === "true") {
        e.target.style.opacity = '';
        draggingEl = null;
        this.updateTrackNumbers();
        this.syncSetlistOrder();
      }
    });

    tracksEl.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('.track-item');
      if (draggingEl && target && draggingEl !== target && target.dataset.fromSetlist === "true") {
        const rect = target.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        if (offset > rect.height / 2) {
          target.after(draggingEl);
        } else {
          target.before(draggingEl);
        }
      }
    });
  }

  updateTrackNumbers() {
    const items = tracksEl.querySelectorAll('.track-item[data-from-setlist="true"]');
    items.forEach((item, i) => {
      const pill = item.querySelector('.track-index-pill');
      if (pill) pill.textContent = i + 1;
      item.dataset.index = i;
    });
  }

  syncSetlistOrder() {
    const items = tracksEl.querySelectorAll('.track-item[data-from-setlist="true"]');
    const orderedPaths = Array.from(items).map(item => item.dataset.realPath);

    state.playlist = orderedPaths.map((line, i) => ({
      ...state.playlist[i],
      realPath: line,
      index: i
    }));

    fetch('/setlist/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setlist: state.current.loadedSetlist,
        tracks: orderedPaths
      })
    })
    .then(res => res.json())
    .then(data => console.log('[reorder] saved:', data))
    .catch(err => console.error('[reorder] error:', err));
  }
}