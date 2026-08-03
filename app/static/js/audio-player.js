(function () {
  'use strict';
  const body = document.body;
  const lessonId = body.dataset.lesson;
  let current = null;
  let currentBtn = null;

  function telemetry(ev) {
    if (!lessonId) return;
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ lesson_id: lessonId, ts: Date.now() }, ev)),
      });
    } catch (e) { /* best effort */ }
  }

  function stopCurrent() {
    if (current) { current.pause(); current = null; }
    if (currentBtn) { currentBtn.classList.remove('playing'); currentBtn = null; }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.audio-play');
    if (!btn) return;
    const src = btn.dataset.src;
    if (!src) return;

    // Mismo botón: alternar play/pause
    if (current && current.dataset.src === src) {
      if (current.paused) { current.play(); btn.classList.add('playing'); }
      else { current.pause(); btn.classList.remove('playing'); }
      return;
    }

    stopCurrent();

    const audio = new Audio(src);
    audio.dataset.src = src;
    audio.playbackRate = parseFloat(btn.dataset.rate || '1');
    audio.addEventListener('play', () => telemetry({ ev: 'audio', src: src, rate: audio.playbackRate }));
    audio.addEventListener('pause', () => btn.classList.remove('playing'));
    audio.addEventListener('ended', () => { btn.classList.remove('playing'); if (current === audio) { current = null; currentBtn = null; } });
    audio.addEventListener('error', () => btn.classList.remove('playing'));
    audio.play();
    current = audio;
    currentBtn = btn;
    btn.classList.add('playing');
  });
})();
