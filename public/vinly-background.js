const IMAGE_EXTS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.tif', '.tiff', '.webp', '.ico', '.svg'
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay() {
  return Math.floor(Math.random() * (10 * 60 * 1000)); // ms
}

async function fetchImages(folderName) {
  try {
    const res = await fetch(`/api/backgrounds/${encodeURIComponent(folderName)}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Background fetch failed:", err);
    return [];
  }
}

// Build a safe URL for static files in /public (encode each segment)
function buildImageUrl(folderName, fileName) {
  const safeFolder = encodeURIComponent(folderName);
  const safeFile = encodeURIComponent(fileName);
  return `/${safeFolder}/${safeFile}`;
}

// Preload image; resolve only when it’s ready
function preload(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });
}

// -------------------------------------------
// Artist carousel
// -------------------------------------------
function setCarouselBackground(elementId, folderName) {
  fetchImages(folderName).then(images => {
    if (!images || images.length === 0) return;

    const chosen = pickRandom(images);
    const url = buildImageUrl(folderName, chosen);
    const el = document.getElementById(elementId);
    if (!el) return;

    el.style.transition = "opacity 1.0s ease";
    el.style.opacity = 0;

    preload(url).then(() => {
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
      el.style.opacity = 1;
    }).catch(err => {
      console.error("Carousel background failed to load:", url, err);
      el.style.opacity = 1;
    });

    setTimeout(() => setCarouselBackground(elementId, folderName), randomDelay());
  });
}

// -------------------------------------------
// Page background
// -------------------------------------------
function setBackgroundByClass(className, folderName) {
  fetchImages(folderName).then(images => {
    if (!images || images.length === 0) return;

    const chosen = pickRandom(images);
    const url = buildImageUrl(folderName, chosen);
    const els = document.getElementsByClassName(className);
    if (!els || els.length === 0) return;

    preload(url).then(() => {
      Array.from(els).forEach(el => {
        el.style.transition = "opacity 1.0s ease";
        el.style.opacity = 0;
        setTimeout(() => {
          el.style.backgroundImage = `url("${url}")`;
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
          el.style.backgroundRepeat = "no-repeat";
          el.style.opacity = 1;
        }, 300);
      });
    }).catch(err => {
      console.error("Page background failed to load:", url, err);
      Array.from(els).forEach(el => (el.style.opacity = 1));
    });

    setTimeout(() => setBackgroundByClass(className, folderName), randomDelay());
  });
}

// -------------------------------------------
// Lyrics overlay
// -------------------------------------------
function setLyricsOverlay(folderName) {
  fetchImages(folderName).then(images => {
    if (!images || images.length === 0) return;

    const chosen = pickRandom(images);
    const url = buildImageUrl(folderName, chosen);
    const overlay = document.getElementById("lyrics-overlay");
    if (!overlay) return;

    preload(url).then(() => {
      overlay.style.backgroundImage = `url("${url}")`;
      overlay.style.backgroundSize = "cover";
      overlay.style.backgroundPosition = "center";
      overlay.style.backgroundRepeat = "no-repeat";
    }).catch(err => {
      console.error("Lyrics overlay failed to load:", url, err);
    });

    setTimeout(() => setLyricsOverlay(folderName), randomDelay());
  });
}

// -------------------------------------------
// Init
// -------------------------------------------
function initVinlyBackgrounds() {
  setCarouselBackground("artist-carousel", "Vinly Setlist Background");  // header backdrop
  setBackgroundByClass("page-shell", "Vinly Background");                // page background
  setLyricsOverlay("Vinly Lyrics Background");                           // lyrics drawer background
}

function initLyricsOverlayToggle() {
  const overlay = document.getElementById("lyrics-overlay");
  const openBtn = document.getElementById("lyrics-btn");
  const closeBtn = document.getElementById("close-lyrics");

  if (openBtn && overlay) {
    openBtn.addEventListener("click", () => {
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
    });
  }

  if (closeBtn && overlay) {
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initVinlyBackgrounds();
  initLyricsOverlayToggle();
});