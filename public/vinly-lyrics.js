document.addEventListener('DOMContentLoaded', () => {
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  const closeLyricsBtn = document.getElementById('close-lyrics');
  const openLyricsBtn = document.getElementById('open-lyrics');

  const metaEl   = document.querySelector('#lyrics-content .lyrics-meta');
  const titleEl  = document.querySelector('#lyrics-content .lyrics-title');
  const linesEl  = document.querySelector('#lyrics-content .lyrics-lines');

  // Simple in-memory cache: realPath -> text
  const lyricsCache = new Map();

  function openOverlay() {
    lyricsOverlay?.classList.add('open');
    lyricsOverlay?.setAttribute('aria-hidden', 'false');
  }

  function closeOverlay() {
    lyricsOverlay?.classList.remove('open');
    lyricsOverlay?.setAttribute('aria-hidden', 'true');
  }

  openLyricsBtn?.addEventListener('click', openOverlay);
  closeLyricsBtn?.addEventListener('click', closeOverlay);

  document.addEventListener('lyrics:update', (e) => {
    const { text, artist, album, title } = e.detail || {};
    let safeText = (text || '')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();

    if (metaEl) {
      metaEl.textContent =
        `${artist ? artist : ''}${album ? ' — ' + album : ''}${title ? ' — ' + title : ''}`;
    }

    if (titleEl) {
      titleEl.textContent = '';
    }

    if (linesEl) {
      let body = safeText.replace(/\n/g, '<br>');
      if (title) {
        const pattern = new RegExp(`^\\d+\\s*-\\s*${title}`, 'i');
        body = body.replace(pattern, '').trim();
      }
      linesEl.innerHTML = body || 'No lyrics available.';
    }
  });

  // Expose loadLyrics globally
  window.loadLyrics = async function(trackObj) {
    if (!trackObj.realPath) {
      console.warn("[loadLyrics] Missing realPath for track:", trackObj);
      return;
    }

    // Check cache first
    if (lyricsCache.has(trackObj.realPath)) {
      const cachedText = lyricsCache.get(trackObj.realPath);
      document.dispatchEvent(new CustomEvent("lyrics:update", {
        detail: {
          text: cachedText,
          artist: trackObj.artist,
          album: trackObj.album,
          title: trackObj.name || trackObj.title
        }
      }));
      return;
    }

    const url = `/lyrics?realPath=${encodeURIComponent(trackObj.realPath)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("[loadLyrics] Lyrics not found:", url);
        return;
      }
      const text = await res.text();

      // Cache result
      lyricsCache.set(trackObj.realPath, text);

      document.dispatchEvent(new CustomEvent("lyrics:update", {
        detail: {
          text,
          artist: trackObj.artist,
          album: trackObj.album,
          title: trackObj.name || trackObj.title
        }
      }));

    } catch (err) {
      console.error("[loadLyrics] Error fetching lyrics:", err);
    }
  };
});