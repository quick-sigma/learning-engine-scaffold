(function () {
  'use strict';
  const body = document.body;
  const lessonId = body.dataset.lesson;
  let current = null;

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

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.audio-play');
    if (!btn) return;
    const src = btn.dataset.src;
    if (!src) return;

    if (current && current.dataset.src === src) {
      if (current.paused) { current.play(); btn.querySelector('span').textContent = '❚❚'; }
      else { current.pause(); btn.querySelector('span').textContent = '▶'; }
      return;
    }

    if (current) {
      current.pause();
      current = null;
    }

    const audio = new Audio(src);
    audio.dataset.src = src;
    audio.playbackRate = parseFloat(btn.dataset.rate || '1');
    audio.addEventListener('play', () => telemetry({ ev: 'audio', src: src, rate: audio.playbackRate }));
    audio.addEventListener('ended', () => { btn.querySelector('span').textContent = '▶'; current = null; });
    audio.play();
    current = audio;
    btn.querySelector('span').textContent = '❚❚';
  });
})();
