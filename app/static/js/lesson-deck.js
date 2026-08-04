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
  let currentWidget = null;

  function widgetInfoOf(slide) {
    if (!slide) return null;
    const w = slide.querySelector('[data-widget]');
    if (!w) return null;
    return { type: w.dataset.widget, slideId: slide.dataset.id || '', entered: Date.now() };
  }

  function leaveWidget(slide) {
    if (!slide) return;
    const info = widgetInfoOf(slide);
    if (!info) return;
    const engaged = !!(window.__widgetEngaged && window.__widgetEngaged[info.slideId]);
    const ms = Date.now() - info.entered;
    // Señal de adaptación (§8.8 SKILL.md): un widget ignorado (sin interacción
    // al abandonar la slide) invita a probar OTRO widget que pueda agradar.
    telemetry({ ev: engaged ? 'widget_engage' : 'widget_ignore', widget: info.type, slide: info.slideId, ms });
    if (window.__widgetEngaged) delete window.__widgetEngaged[info.slideId];
  }

  deck.on('ready', () => {
    telemetry({ ev: 'ready' });
    currentWidget = widgetInfoOf(deck.getCurrentSlide());
    if (currentWidget) {
      telemetry({ ev: 'widget_view', widget: currentWidget.type, slide: currentWidget.slideId });
    }
  });
  deck.on('slidechanged', (e) => {
    leaveWidget(e.previousSlide || deck.getCurrentSlide());
    currentWidget = widgetInfoOf(e.currentSlide);
    if (currentWidget) {
      telemetry({ ev: 'widget_view', widget: currentWidget.type, slide: currentWidget.slideId });
    }
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
