document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // Fallback cover generator
  // -----------------------------
  function generateFallbackCover(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const colors = ['#0ff', '#f0f', '#0f0', '#ff0', '#09f', '#f90'];
    const hash = [...label].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const bgColor = colors[hash % colors.length];

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#111';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎵', canvas.width / 2, canvas.height / 2);

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, canvas.width / 2, canvas.height - 20);

    return canvas.toDataURL('image/png');
  }

  // -----------------------------
  // Overlay for adding setlist folder
  // -----------------------------
  function openSetlistOverlay() {
    let overlay = document.getElementById('setlist-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'setlist-overlay';
      overlay.innerHTML = `
        <div class="overlay-card">
          <h3>Add Setlist Folder</h3>
          <input id="setlist-input" type="text" placeholder="Paste server folder path here" />
          <div class="row">
            <button id="setlist-confirm">Confirm</button>
            <button id="setlist-cancel">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Cancel button
      overlay.querySelector('#setlist-cancel').addEventListener('click', () => {
        overlay.classList.remove('show');
      });

      // Confirm button
      overlay.querySelector('#setlist-confirm').addEventListener('click', async () => {
        const folder = overlay.querySelector('#setlist-input').value.trim();
        if (!folder) return;
        try {
          // Add new root (no caching)
          const addRes = await fetch('/setlist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ folder })
          });
          if (!addRes.ok) throw new Error('Add failed');

          // Reload fresh structure from disk, passing folder explicitly
          const res = await fetch(`/setlist/current?folder=${encodeURIComponent(folder)}&forceReload=true`, {
            headers: { 'Cache-Control': 'no-store' },
            cache: 'no-store'
          });
          const data = await res.json();

          // Dispatch normalized payload
          document.dispatchEvent(new CustomEvent('setlist:load', {
            detail: {
              success: data.success,
              roots: data.roots,
              artists: data.artists.map(a => ({
                ...a,
                rootName: data.rootName || folder,   // ⭐ preserve rootName
                rootType: "Add setlist"
              })),
              folder
            }
          }));

          // Store globally for fetchSetlist()
          window.activeFolder = folder;

          overlay.classList.remove('show');
        } catch (err) {
          console.error('Error adding setlist:', err);
        }
      });

      // Click outside closes
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    }

    overlay.classList.add('show');
  }

  // -----------------------------
  // Context menu (Add/Load/Delete Setlist)
  // -----------------------------
  let menuEl;
  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.className = 'context-menu';
    menuEl.style.display = 'none';
    document.body.appendChild(menuEl);
    document.addEventListener('click', hideMenu);
    window.addEventListener('blur', hideMenu);
    return menuEl;
  }

  function showMenu(x, y) {
    const menu = ensureMenu();
    menu.innerHTML = `
      <div class="menu-item" data-action="setlist">Add Setlist</div>
      <div class="menu-item" data-action="load-setlist">Load Setlist</div>
      <div class="menu-item" data-action="delete-setlist">Delete Setlist</div>
    `;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';

    menu.querySelector('[data-action="setlist"]')?.addEventListener('click', () => {
      hideMenu();
      openSetlistOverlay();
    });

    menu.querySelector('[data-action="load-setlist"]')?.addEventListener('click', () => {
      hideMenu();
      new LoadSetlistOverlay().show();
    });

    menu.querySelector('[data-action="delete-setlist"]')?.addEventListener('click', () => {
      hideMenu();
      if (!window.__deleteOverlay) {
        window.__deleteOverlay = new DeleteSetlistOverlay();
      }
      window.__deleteOverlay.show();
    });
  }

  function hideMenu() {
    if (menuEl) menuEl.style.display = 'none';
  }

  document.addEventListener('contextmenu', (e) => {
    const excludedSelectors = ['.album-card', '.track-item', '.artist-carousel-item'];
    if (excludedSelectors.some(sel => e.target.closest(sel))) return;
    e.preventDefault();
    showMenu(e.pageX, e.pageY);
  });
document.addEventListener('setlist:load', (e) => {
  const { artists } = e.detail;
  artists.forEach(a => {
    if (!a.cover) {
      a.cover = generateFallbackCover(a.artist);
    }
    a.albums.forEach(al => {
      if (!al.cover) {
        al.cover = generateFallbackCover(al.album);
      }
      // ✅ Normalize tracks inside each album
      if (al.tracks) {
        al.tracks.forEach(t => {
          // Always prefer existing title, fallback to cleaned name
          t.title = t.title || (t.name ? t.name.replace(/\.[^.]+$/, "") : "");
        });
      }
    });
  });
});

});

// -----------------------------
// Overlay for deleting a setlist
// -----------------------------
class DeleteSetlistOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'delete-setlist-overlay';
    this.el.innerHTML = `
      <div class="overlay-card">
        <h3>Delete Setlist</h3>
        <select id="delete-setlist-select"></select>
        <div class="row">
          <button id="delete-setlist-confirm">Delete</button>
          <button id="delete-setlist-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector('#delete-setlist-cancel').addEventListener('click', () => {
      this.el.classList.remove('show');
    });

    this.el.querySelector('#delete-setlist-confirm').addEventListener('click', async () => {
      const filename = this.el.querySelector('#delete-setlist-select').value;
      if (!filename) return;
      try {
        const res = await fetch(`/setlist/deleteSetlist?file=${encodeURIComponent(filename)}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed');

        if (state.current.loadedSetlist === filename) {
          // clear tracklist completely
          tracksEl.innerHTML = '';
          state.playlist = [];
          state.current.trackIndex = -1;
          state.current.loadedSetlist = null;

          const h2 = tracksHeader?.querySelector('h2');
          if (h2) h2.remove();
        }

        this.el.classList.remove('show');
      } catch (err) {
        console.error('Error deleting setlist:', err);
      }
    });
  }

  async show() {
    try {
      const res = await fetch('/setlist/list');
      const files = await res.json();
      const select = this.el.querySelector('#delete-setlist-select');
      select.innerHTML = files.map(f => `<option value="${f}">${f}</option>`).join('');
    } catch (err) {
      console.error('Error fetching setlists:', err);
    }
    this.el.classList.add('show');
  }
}