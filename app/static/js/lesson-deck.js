(function () {
  'use strict';
  const body = document.body;
  const lessonId = body.dataset.lesson;

  function telemetry(ev) {
    if (!lessonId) return;
    const payload = Object.assign({ lesson_id: lessonId, ts: Date.now() }, ev);
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) { /* best effort */ }
  }

  const deck = new Reveal({
    hash: true,
    controls: true,
    progress: true,
    center: false,
    transition: 'slide',
    width: '100%',
    height: '100%',
    margin: 0,
  });

  let lastH = null;
  deck.on('ready', () => telemetry({ ev: 'ready' }));
  deck.on('slidechanged', (e) => {
    const slideId = String((deck.getCurrentSlide() && deck.getCurrentSlide().dataset.id) || e.indexh);
    telemetry({ ev: 'time_on_slide', slide: slideId, ms: Date.now() - (window.__slideStart || Date.now()) });
    window.__slideStart = Date.now();
    telemetry({ ev: 'slidechange', indexh: e.indexh, indexv: e.indexv });
    if (lastH !== null && e.indexh < lastH) {
      telemetry({ ev: 'revisit', slide: slideId });
    }
    lastH = e.indexh;
  });
  deck.on('fragmentshown', (e) => {
    telemetry({ ev: 'fragment', id: (e.fragment && e.fragment.id) || '' });
  });

  window.__slideStart = Date.now();
  deck.initialize();
})();
