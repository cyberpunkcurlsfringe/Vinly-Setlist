// -----------------------------
// Playback state
// -----------------------------
let activePlayer = null;
const videoEl = document.getElementById("webtv-video");

// -----------------------------
// Elements
// -----------------------------
const audioPlayer            = document.getElementById("audioPlayer");
const audioFooter            = document.getElementById("audio-footer");
const audioFooterTitle       = document.getElementById("audioFooterTitle");
const webtvFooter            = document.getElementById("webtv-footer");
const webtvFrame             = document.getElementById("webtv-frame");
const webtvVideo             = document.getElementById("webtv-video");

const audioPlayBtn           = document.getElementById("play-btn");
const audioProgressFill      = document.getElementById("progress-fill");
const audioProgressContainer = document.getElementById("progress-container");
const audioTimeCurrent       = document.getElementById("time-current");
const audioTimeTotal         = document.getElementById("time-total");

const webtvPlayBtn           = document.getElementById("webtv-play-btn");
const webtvProgressFill      = document.getElementById("webtv-progress-fill");
const webtvProgressContainer = document.getElementById("webtv-progress-container");
const webtvTimeCurrent       = document.getElementById("webtv-time-current");
const webtvTimeTotal         = document.getElementById("webtv-time-total");

const subtitleBtn            = document.getElementById("subtitle-btn");
const subtitleToggle         = document.getElementById("subtitle-toggle");
const subtitleSizeSlider     = document.getElementById("subtitle-size");
const subtitleOverlay        = document.getElementById("subtitle-overlay");

const canvas                 = document.getElementById("webtv-canvas");
let ctx = canvas ? canvas.getContext("2d") : null;

// -----------------------------
// Utility
// -----------------------------
function formatTime(seconds) {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
function setText(el, txt) { if (el) el.textContent = txt; }
function clamp01(x) { return Math.min(Math.max(x, 0), 1); }

// -----------------------------
// Playback controls
// -----------------------------
function playWebtvVideo() {
  if (!webtvVideo.videoEl) return;
  webtvVideo.videoEl.muted = false;
  webtvVideo.paused = false;
  webtvVideo.videoEl.play().then(loopRender).catch(err => {
    console.error("Video play failed:", err);
    webtvVideo.videoEl.muted = true;
    webtvVideo.videoEl.play().then(() => { webtvVideo.videoEl.muted = false; loopRender(); });
  });
}

// -----------------------------
// Play/Pause
// -----------------------------
function updatePlayButton() {
  const isAudio = activePlayer === audioPlayer;
  const btn = isAudio ? audioPlayBtn : webtvPlayBtn;
  if (!btn || !activePlayer) return;

  const paused = activePlayer.paused;
  btn.innerHTML = paused
    ? `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>` // play
    : `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6zm8-14v14h4V5h-4z"/></svg>`; // pause
}

// Bind audio button + UI events
if (audioPlayBtn) {
  audioPlayBtn.onclick = () => {
    activePlayer = audioPlayer;
    if (audioPlayer.paused) {
      audioPlayer.play().catch(console.error);
    } else {
      audioPlayer.pause();
    }
  };
}
audioPlayer.addEventListener('play', updatePlayButton);
audioPlayer.addEventListener('pause', updatePlayButton);

// -----------------------------
// Progress UI helpers
// -----------------------------

// Bind audio progress to native events
audioPlayer.addEventListener('timeupdate', () => {
  updateAudioUI(audioPlayer.duration || 0, audioPlayer.currentTime || 0);
});
audioPlayer.addEventListener('durationchange', () => {
  updateAudioUI(audioPlayer.duration || 0, audioPlayer.currentTime || 0);
});

function bindScrub(container, getDur, getCur, setTime) {
  if (!container) return;
  let scrubbing = false;

  const onPos = e => {
    const rect = container.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const percent = clamp01(x / rect.width);
    const dur = getDur();
    if (isFinite(dur) && dur > 0) setTime(percent * dur);
  };

  container.addEventListener('pointerdown', e => {
    scrubbing = true;
    container.setPointerCapture(e.pointerId);
    onPos(e);
  });
  container.addEventListener('pointermove', e => {
    if (!scrubbing) return;
    onPos(e);
  });
  container.addEventListener('pointerup', e => {
    if (!scrubbing) return;
    scrubbing = false;
    try { container.releasePointerCapture(e.pointerId); } catch {}
  });

  container.addEventListener('keydown', e => {
    const dur = getDur();
    if (!isFinite(dur) || dur <= 0) return;
    const cur = getCur();
    const step = 5;
    if (e.key === 'ArrowRight') setTime(Math.min(cur + step, dur));
    if (e.key === 'ArrowLeft')  setTime(Math.max(cur - step, 0));
  });
  container.tabIndex = 0;
}

// Wire audio scrub
bindScrub(
  audioProgressContainer,
  () => audioPlayer.duration || 0,
  () => audioPlayer.currentTime || 0,
  t => { audioPlayer.currentTime = t; }
);

// Wire video scrub (bound after video element exists as well, see loader below)
function bindVideoScrub(videoEl) {
  bindScrub(
    webtvProgressContainer,
    () => (videoEl ? videoEl.duration || 0 : 0),
    () => (videoEl ? videoEl.currentTime || 0 : 0),
    t => { if (videoEl) videoEl.currentTime = t; }
  );
}

// -----------------------------
// Bind video button + progress events to a specific element
// -----------------------------
function bindVideoButton(videoEl) {
  if (!webtvPlayBtn || !videoEl) return;

  webtvPlayBtn.onclick = () => {
    activePlayer = videoEl;
    videoEl.muted = false;
    if (videoEl.paused) {
      videoEl.play().catch(err => console.error("Video play failed:", err));
    } else {
      videoEl.pause();
    }
  };

  videoEl.addEventListener('play', updatePlayButton);
  videoEl.addEventListener('pause', updatePlayButton);
}

// -----------------------------
// Floating WebTV video loader
// -----------------------------
async function loadUniversalVideo(item) {
  const videoEl = document.getElementById("webtv-video");
  if (!videoEl) {
    console.error("No #webtv-video element found");
    return;
  }

  try { videoEl.pause(); } catch {}
  videoEl.removeAttribute("src");
  videoEl.load();

  videoEl.src = item.url;
  videoEl.preload = "none";

  return new Promise(resolve => {
    videoEl.onloadedmetadata = async () => {
      webtvVideo.videoEl = videoEl;
      webtvVideo.duration = videoEl.duration || 0;
      activePlayer = videoEl;

      const displayTitle = (item.name || "").replace(/\.[^.]+$/, "");

      const webtvFooterTitle = document.getElementById("webtv-track-title");
      if (webtvFooterTitle) webtvFooterTitle.textContent = displayTitle;

      const frameTitleEl = document.querySelector(".webtv-frame-title");
      if (frameTitleEl) frameTitleEl.textContent = "Now Playing: " + displayTitle;

      // Subtitles handling
      const vttUrl = item.url.replace(/\.[^.]+$/, ".vtt");
      try {
        const res = await fetch(vttUrl);
        if (res.ok) {
          const vttText = await res.text();
          subtitleData = parseVTT(vttText);
          bindSubtitleOverlay(videoEl);
        } else {
          subtitleData = [];
        }
      } catch {
        console.log("No matching VTT file found for", item.url);
        subtitleData = [];
      }

      bindVideoButton(videoEl);
      bindVideoProgress(videoEl);
      bindVideoScrub(videoEl);

      videoEl.play()
        .then(() => {
          updatePlayButton();
          resolve(videoEl);
        })
        .catch(err => {
          console.error("Video play failed:", err);
          videoEl.muted = true;
          videoEl.play().then(() => {
            updatePlayButton();
            videoEl.muted = false;
            resolve(videoEl);
          });
        });

      const webtvFooter = document.getElementById("webtv-footer");
      if (webtvFooter) {
        webtvFooter.classList.remove("collapsed");
        webtvFooter.classList.add("open");
        webtvFooter.setAttribute("aria-hidden", "false");
        webtvFooter.style.display = "block";
      }
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  let hideCursorTimeout;

  function enableAutoHideCursor() {
    const body = document.body;

    function showCursor() {
      body.style.cursor = 'default';
      clearTimeout(hideCursorTimeout);
      hideCursorTimeout = setTimeout(() => {
        body.style.cursor = 'none';
      }, 3000); 
    }

    document.addEventListener('mousemove', showCursor);
    showCursor(); // initialize
  }

  function disableAutoHideCursor() {
    document.body.style.cursor = 'default';
    document.removeEventListener('mousemove', null);
    clearTimeout(hideCursorTimeout);
  }

  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      enableAutoHideCursor();
    } else {
      disableAutoHideCursor();
    }
  });
});

// -----------------------------
// Frame controls
// -----------------------------
const closeBtn = document.getElementById("webtv-close");
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    stopWebtvVideo();
    webtvFrame.style.display = "none";
    webtvFrame.setAttribute('aria-hidden', 'true');
  });
}

function stopWebtvVideo() {
  const videoEl = document.getElementById("webtv-video");
  if (videoEl) {
    try { videoEl.pause(); } catch {}
    videoEl.removeAttribute("src");
    videoEl.load(); // fully unload
  }
}
document.addEventListener("fullscreenchange", () => {
  const frame  = document.getElementById("webtv-frame");
  const header = document.getElementById("webtv-frame-header");
  const videoEl= document.getElementById("webtv-video");

  if (!frame || !header || !videoEl) return;

  if (document.fullscreenElement === frame) {
    // Remove header from layout initially
    header.style.display = "none";

    // Click on video toggles header back on
    videoEl.onclick = () => {
      if (header.style.display === "none") {
        header.style.display = "flex"; // restore header
      } else {
        header.style.display = "none"; // hide again
      }
    };
  } else {
    // Exit fullscreen: always show header
    header.style.display = "flex";
    videoEl.onclick = null;
  }
});

const fullscreenBtn= document.getElementById("webtv-fullscreen");

let prevState = null;

// Button click → toggle fullscreen on frame
if (fullscreenBtn && webtvFrame) {
  fullscreenBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      prevState = {
        left: webtvFrame.style.left,
        top: webtvFrame.style.top,
        width: webtvFrame.style.width,
        height: webtvFrame.style.height
      };
      webtvFrame.requestFullscreen().catch(err => console.error("Fullscreen failed:", err));
    }
  });
}

// Double-click video → also toggle fullscreen on frame (not video)
if (videoEl && webtvFrame) {
  videoEl.addEventListener("dblclick", e => {
    e.preventDefault(); // stop native video fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      webtvFrame.requestFullscreen().catch(err => console.error("Fullscreen failed:", err));
    }
  });
}

// Ensure initial position is set once
(function ensureInitialFramePosition() {
  const frame = document.getElementById("webtv-frame");
  if (!frame) return;
  const cs = getComputedStyle(frame);
  if (cs.position !== "fixed") frame.style.position = "fixed";
  if (!cs.left || cs.left === "auto") frame.style.left = frame.style.left || "50px";
  if (!cs.top  || cs.top  === "auto") frame.style.top  = frame.style.top  || "100px";
  // Avoid transforms that break left/top dragging
  frame.style.transform = "";
})();

// Dragging logic (pointer events)
(function enableDrag() {
  const frame = document.getElementById("webtv-frame");
  const header = document.getElementById("webtv-frame-header");
  if (!frame || !header) return;

  let dragging = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;

  header.style.touchAction = "none";     // allow pointer drag
  header.style.userSelect = "none";      // prevent text selection
  header.addEventListener("pointerdown", e => {
    // Do not drag in fullscreen
    if (document.fullscreenElement === frame || frame.classList.contains("no-drag")) return;
    // Ignore clicks on control buttons
    const id = e.target.id;
    if (id === "webtv-fullscreen" || id === "webtv-minimize" || id === "webtv-close") return;

    dragging = true;
    try { header.setPointerCapture(e.pointerId); } catch {}
    const cs = getComputedStyle(frame);
    // Snapshot current position
    origLeft = parseFloat(cs.left) || 0;
    origTop  = parseFloat(cs.top)  || 0;
    startX = e.clientX;
    startY = e.clientY;
  });

  header.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    frame.style.left = `${origLeft + dx}px`;
    frame.style.top  = `${origTop + dy}px`;
  });

  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch {}
  };
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
})();

// Keep “no-drag” consistent with fullscreen changes
document.addEventListener("fullscreenchange", () => {
  const frame = document.getElementById("webtv-frame");
  if (!frame) return;
  if (document.fullscreenElement === frame) {
    frame.classList.add("no-drag");
  } else {
    frame.classList.remove("no-drag");
  }
});

function bindAudioProgress(audioEl) {
  if (!audioEl) return;

  audioEl.addEventListener("timeupdate", () => {
    // Update progress bar
    const percent = (audioEl.currentTime / audioEl.duration) * 100;
    const progressFill = document.getElementById("progress-fill");
    const timeCurrent  = document.getElementById("time-current");
    const timeTotal    = document.getElementById("time-total");

    if (progressFill) progressFill.style.width = `${percent}%`;
    if (timeCurrent)  timeCurrent.textContent  = formatTime(audioEl.currentTime);
    if (timeTotal)    timeTotal.textContent    = formatTime(audioEl.duration);
  });

  audioEl.addEventListener("ended", () => {
    const progressFill = document.getElementById("progress-fill");
    const timeCurrent  = document.getElementById("time-current");
    const timeTotal    = document.getElementById("time-total");

    if (progressFill) progressFill.style.width = "0%";
    if (timeCurrent)  timeCurrent.textContent  = "0:00";
    if (timeTotal)    timeTotal.textContent    = formatTime(audioEl.duration);
  });
}

// -----------------------------
// Subtitle Manager
// -----------------------------
let subtitlesEnabled = false;
let subtitleData = [];


const subtitleSize    = document.getElementById("subtitle-size");

// Toggle button
if (subtitleBtn) {
  subtitleBtn.addEventListener("click", () => {
    subtitlesEnabled = !subtitlesEnabled;
    subtitleOverlay.style.display = subtitlesEnabled ? "block" : "none";
  });
}

// Font size slider
if (subtitleSize) {
  subtitleSize.addEventListener("input", e => {
    subtitleOverlay.style.fontSize = e.target.value + "px";
  });
}

// Parse VTT file into cues
function parseVTT(vttText) {
  const cues = [];
  const lines = vttText.split("\n");
  let cue = null;

  for (const line of lines) {
    if (line.includes("-->")) {
      const [start, end] = line.split("-->").map(t => parseTime(t.trim()));
      cue = { start, end, text: "" };
    } else if (line.trim() === "") {
      if (cue) cues.push(cue);
      cue = null;
    } else if (cue) {
      cue.text += (cue.text ? "\n" : "") + line;
    }
  }
  return cues;
}

function parseTime(t) {
  const parts = t.split(":");
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s.replace(",", "."));
}

// Render subtitles on timeupdate
function bindSubtitleOverlay(videoEl) {
  videoEl.addEventListener("timeupdate", () => {
    if (!subtitlesEnabled || !subtitleData.length) {
      subtitleOverlay.textContent = "";
      return;
    }
    const cur = videoEl.currentTime;
    const cue = subtitleData.find(c => cur >= c.start && cur <= c.end);
    subtitleOverlay.textContent = cue ? cue.text : "";
  });
}
// Helper: clean track title from item
function getCleanTitle(item) {
  let base = "";

  if (item && item.name) {
    base = item.name;
  } else if (item && item.url) {
    const raw     = item.url.split("/").pop();     // last segment
    const noQuery = raw.split("?")[0];             // remove ?path=...
    base = decodeURIComponent(noQuery);
  }

  // Remove extension
  base = base.replace(/\.[^.]+$/, "");

  // Remove leading track numbers like "01 - " or "01."
  base = base.replace(/^\d+\s*[-._]\s*/, "");

  return base.trim() || "Unknown Title";
}

// Helper: format seconds into mm:ss
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateAudioUI() {
  if (state.current.trackIndex >= 0 && currentPlaylist[state.current.trackIndex]) {
    const track = currentPlaylist[state.current.trackIndex];
     if (audioFooterTitle) {
    audioFooterTitle.textContent = track.title || track.name || "";
    }
  }

  // Progress bar + time
  const progressFill = document.getElementById("progress-fill");
  const timeCurrent  = document.getElementById("time-current");
  const timeTotal    = document.getElementById("time-total");

  if (progressFill && activePlayer && activePlayer.duration) {
    const percent = (activePlayer.currentTime / activePlayer.duration) * 100;
    progressFill.style.width = `${percent}%`;
  }
  if (timeCurrent && activePlayer) timeCurrent.textContent = formatTime(activePlayer.currentTime);
  if (timeTotal && activePlayer)   timeTotal.textContent   = formatTime(activePlayer.duration);
}

window.webtvVideo         = webtvVideo;
window.loadUniversalVideo = loadUniversalVideo;