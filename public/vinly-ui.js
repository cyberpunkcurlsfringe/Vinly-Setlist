document.addEventListener('DOMContentLoaded', () => {
  const frameBtn = document.getElementById('player-frame-btn');
  const playerShell = document.getElementById('player-shell');
  const lyricsBtn = document.getElementById('lyrics-btn');
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  const closeLyricsBtn = document.getElementById('close-lyrics');

  // -----------------------------
  // Player open/close
  // -----------------------------
  function openPlayer() {
    if (!playerShell) return;
    playerShell.classList.remove('collapsed');
    playerShell.classList.add('open');
    playerShell.setAttribute('aria-hidden', 'false');
  }
  function closePlayer() {
    if (!playerShell) return;
    playerShell.classList.remove('open');
    playerShell.classList.add('collapsed');
    playerShell.setAttribute('aria-hidden', 'true');
  }

  frameBtn?.addEventListener('click', () => {
    const isOpen = playerShell.classList.contains('open');
    isOpen ? closePlayer() : openPlayer();
  });
  document.addEventListener('player:open', openPlayer);

  const labelEl = playerShell?.querySelector('.player-label');
  labelEl?.addEventListener('click', () => {
    const isOpen = playerShell.classList.contains('open');
    isOpen ? closePlayer() : openPlayer();
  });

  // -----------------------------
  // Overlay for folder path input
  // -----------------------------
  function openSetlistOverlay() {
    let overlay = document.getElementById('setlist-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'setlist-overlay';
      overlay.className = 'overlay';
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

      overlay.querySelector('#setlist-cancel').addEventListener('click', () => {
        overlay.style.display = 'none';
      });

      overlay.querySelector('#setlist-confirm').addEventListener('click', async () => {
        const folder = overlay.querySelector('#setlist-input').value.trim();
        if (!folder) return;
        try {
          const addRes = await fetch('/setlist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder })
          });
          if (!addRes.ok) throw new Error('Add failed');

          const res = await fetch('/setlist/current');
          const data = await res.json();

          document.dispatchEvent(new CustomEvent('setlist:load', { detail: data }));
          overlay.style.display = 'none';
        } catch (err) {
          console.error('Error adding setlist:', err);
        }
      });
    }
    overlay.style.display = 'block';
  }

  // -----------------------------
  // Lyrics
  // -----------------------------
  lyricsBtn?.addEventListener('click', (e) => {
    const isOpen = lyricsOverlay.classList.contains('open');
    lyricsOverlay.classList.toggle('open');
    lyricsOverlay.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
    lyricsBtn.classList.toggle('active', !isOpen);
    e.stopPropagation();
  });
  closeLyricsBtn?.addEventListener('click', () => {
    lyricsOverlay.classList.remove('open');
    lyricsOverlay.setAttribute('aria-hidden', 'true');
    lyricsBtn?.classList.remove('active');
  });

  // -----------------------------
  // Scroll tracking (kept intact)
  // -----------------------------
  let lastScrollY = window.scrollY;
  document.addEventListener('scroll', () => {
    const dy = Math.abs(window.scrollY - lastScrollY);
    lastScrollY = window.scrollY;
  });

  // -----------------------------
  // Context menu
  // -----------------------------
document.addEventListener('contextmenu', (e) => {
  const trackEl = e.target.closest('.track-item');
  const albumEl = e.target.closest('.album-card');
  const artistEl = e.target.closest('.artist-card');

  // Suppress clicks inside tracklist panel but not on a track
  if (!trackEl && e.target.closest('#tracks-panel')) {
    return;
  }

  if (!trackEl && !albumEl && !artistEl) return;
  e.preventDefault();

  hideContextMenu();

  if (trackEl) {
    const menuItems = [];
    if (trackEl.dataset.fromSetlist !== "true") {
    menuItems.push({ action: 'addToSetlist', label: 'Add to setlist' });
    }
    menuItems.push({ action: 'deleteFromSetlist', label: 'Delete' });
    showContextMenu(e, menuItems, { track: trackEl.dataset });
  } else if (albumEl) {
    showContextMenu(e, [
      { action: 'setlist-shuffle-album', label: 'Setlist shuffle' }
    ], { artist: albumEl.dataset.artist, album: albumEl.dataset.album });
  } else if (artistEl) {
    showContextMenu(e, [
      { action: 'setlist-shuffle-artist', label: 'Setlist shuffle' }
    ], { artist: artistEl.dataset.artist });
  }
});

  // keep menu anchored across all scroll interactions
  document.addEventListener('scroll', updateMenuPosition, true);
  document.addEventListener('mousedown', updateMenuPosition, true);
  document.addEventListener('wheel', updateMenuPosition, { passive: true, capture: true });
  document.addEventListener('touchmove', updateMenuPosition, { passive: true, capture: true });
  window.addEventListener('resize', updateMenuPosition);

  // optional: close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });
});

// ---------------------------------------------
// Context menu implementation
// ---------------------------------------------
let clickEvent = null;
let menuEl = null;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.querySelector('.context-menu');
  return menuEl;
}

function showContextMenu(e, items, payload) {
  clickEvent = e;
  const menu = ensureMenu();
  if (!menu) return;

  const safeItems = Array.isArray(items) ? items : [items];
  menu.innerHTML = safeItems
    .map(i => `<div class="menu-item" data-action="${i.action}">${i.label}</div>`)
    .join('');

  menu.style.zIndex = '9999';
  menu.style.display = 'flex';
  updateMenuPosition();

  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (evt) => {
      const action = evt.currentTarget.dataset.action;
      hideContextMenu();
      await handleMenuAction(action, payload);
    }, { once: true });
  });
}

function hideContextMenu() {
  const menu = ensureMenu();
  if (menu) {
    menu.style.display = 'none';
    menu.innerHTML = '';
  }
  clickEvent = null;
}

function updateMenuPosition() {
  const menu = ensureMenu();
  if (!clickEvent || !menu || menu.style.display === 'none') return;

  let top = clickEvent.clientY;
  let left = clickEvent.clientX;

  const menuHeight = menu.offsetHeight || 160;
  const viewportH = window.innerHeight;
  if (top + menuHeight > viewportH - 8) {
    top = Math.max(8, viewportH - menuHeight - 8);
  }

  const menuWidth = menu.offsetWidth || 160;
  const viewportW = window.innerWidth;
  if (left + menuWidth > viewportW - 8) {
    left = Math.max(8, viewportW - menuWidth - 8);
  }

  menu.style.position = 'fixed';
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}