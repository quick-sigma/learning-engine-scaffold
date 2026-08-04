(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Utilidades compartidas
  ------------------------------------------------------------------ */
  function el(id) { return document.getElementById(id); }

  function telemetry(payload) {
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) { /* best effort */ }
  }

  function saveWidget(lessonId, widgetId, ev, state, cb) {
    try {
      fetch('/api/widget/' + encodeURIComponent(lessonId) + '/' + encodeURIComponent(widgetId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ev: ev, state: state }),
      }).then(function (r) { if (cb) cb(r.ok); }).catch(function () { if (cb) cb(false); });
    } catch (e) { if (cb) cb(false); }
  }

  /* ----------------------------------------------------------------
     Engagement de widgets: el deck (lesson-deck.js) pregunta si hubo
     interacción antes de abandonar una slide con widget. Si NO la hubo,
     emite `widget_ignore` → señal para probar OTRO widget (§8.8 SKILL.md).
  ---------------------------------------------------------------- */
  window.__widgetEngaged = window.__widgetEngaged || {};
  function engage(root) {
    var id = root && root.dataset.widgetId;
    if (id) window.__widgetEngaged[id] = true;
  }

  /* ==================================================================
     Widget 1: Lienzo de conceptos (SVG arrastrable con aristas tipadas)
     ================================================================== */
  var RELATION_COLORS = {
    implica: '#93c5fd',
    contradice: '#f87171',
    presupone: '#fbbf24',
    'es caso de': '#86efac',
    objeta: '#c084fc',
    apoya: '#4ade80',
  };
  var RELATION_LABELS = Object.keys(RELATION_COLORS);

  function initCanvas(widget) {
    var root = widget;
    var svg = root.querySelector('[data-canvas-svg]');
    var wrap = root.querySelector('[data-canvas-wrap]');
    var feedback = root.querySelector('[data-canvas-feedback]');
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;

    var NS = 'http://www.w3.org/2000/svg';
    var state = { nodes: [], edges: [] };
    var nextNodeId = 1;
    var view = { x: 0, y: 0, scale: 1 };
    var selectedNode = null;
    var connectFrom = null;
    var menu = null;
    var drag = null;
    var saved = false;

    function svgNS(name) { return document.createElementNS(NS, name); }

    function toScreen(n) {
      return { x: n.x * view.scale + view.x, y: n.y * view.scale + view.y };
    }
    function toWorld(sx, sy) {
      var rect = svg.getBoundingClientRect();
      return {
        x: (sx - rect.left - view.x) / view.scale,
        y: (sy - rect.top - view.y) / view.scale,
      };
    }

    function findNodeAt(sx, sy) {
      var w = toWorld(sx, sy);
      for (var i = state.nodes.length - 1; i >= 0; i--) {
        var n = state.nodes[i];
        var s = toScreen(n);
        if (Math.hypot(w.x - n.x, w.y - n.y) < 40 / view.scale) return n;
      }
      return null;
    }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var g = svgNS('g');
      g.setAttribute('transform', 'translate(' + view.x + ',' + view.y + ') scale(' + view.scale + ')');

      state.edges.forEach(function (e) {
        var a = state.nodes.find(function (n) { return n.id === e.from; });
        var b = state.nodes.find(function (n) { return n.id === e.to; });
        if (!a || !b) return;
        var line = svgNS('line');
        line.setAttribute('class', 'canvas-edge');
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        line.setAttribute('stroke', RELATION_COLORS[e.relation] || '#7c8794');
        g.appendChild(line);

        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var label = svgNS('text');
        label.setAttribute('class', 'canvas-edge-label');
        label.setAttribute('x', mx); label.setAttribute('y', my - 6);
        label.setAttribute('fill', RELATION_COLORS[e.relation] || '#9aa4af');
        label.textContent = e.relation;
        g.appendChild(label);
      });

      state.nodes.forEach(function (n) {
        var s = toScreen(n);
        var gnode = svgNS('g');
        gnode.setAttribute('class', 'canvas-node' + (n === selectedNode ? ' selected' : ''));
        gnode.setAttribute('data-node-id', n.id);
        gnode.setAttribute('tabindex', '0');

        var circle = svgNS('circle');
        circle.setAttribute('r', 34);
        circle.setAttribute('cx', n.x); circle.setAttribute('cy', n.y);
        circle.setAttribute('fill', 'rgba(96,165,250,0.14)');
        circle.setAttribute('stroke', n === selectedNode ? '#60a5fa' : '#3a434f');
        circle.setAttribute('stroke-width', 2);
        gnode.appendChild(circle);

        var lines = n.label.split('\n').slice(0, 3);
        lines.forEach(function (ln, i) {
          var t = svgNS('text');
          t.setAttribute('x', n.x);
          t.setAttribute('y', n.y + (i - (lines.length - 1) / 2) * 14);
          t.textContent = ln.length > 22 ? ln.slice(0, 21) + '…' : ln;
          gnode.appendChild(t);
        });

        g.appendChild(gnode);
        wireNode(gnode, n);
      });
    }

    function wireNode(gnode, n) {
      gnode.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        svg.setPointerCapture(ev.pointerId);
        drag = { node: n, startX: ev.clientX, startY: ev.clientY, ox: n.x, oy: n.y };
        selectedNode = n;
        render();
        telemetry({ lesson_id: lessonId, ev: 'canvas_node_select', node: n.id });
      });
      gnode.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openNodeMenu(ev, n);
      });
      gnode.addEventListener('keydown', function (ev) {
        if (ev.key === 'Delete' || ev.key === 'Backspace') { removeNode(n); }
      });
    }

    function openNodeMenu(ev, n) {
      closeMenu();
      menu = document.createElement('div');
      menu.setAttribute('class', 'canvas-menu');
      var rect = wrap.getBoundingClientRect();
      menu.style.left = (ev.clientX - rect.left) + 'px';
      menu.style.top = (ev.clientY - rect.top) + 'px';

      RELATION_LABELS.forEach(function (rel) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '→ ' + rel;
        b.addEventListener('click', function () {
          if (connectFrom && connectFrom.id !== n.id) {
            addEdge(connectFrom, n, rel);
            connectFrom = null;
          } else {
            connectFrom = n;
            feedback.textContent = 'Ahora haz clic en el segundo nodo.';
            feedback.className = 'widget-feedback';
          }
          closeMenu();
        });
        menu.appendChild(b);
      });

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = 'Eliminar nodo';
      del.addEventListener('click', function () { removeNode(n); closeMenu(); });
      menu.appendChild(del);

      wrap.appendChild(menu);
    }

    function closeMenu() { if (menu && menu.parentNode) menu.parentNode.removeChild(menu); menu = null; }

    function addNode(label) {
      if (!label || !label.trim()) return;
      var n = { id: 'n' + nextNodeId++, label: label.trim(), x: 60 + Math.random() * 120, y: 60 + Math.random() * 120 };
      state.nodes.push(n);
      saved = false;
      render();
      telemetry({ lesson_id: lessonId, ev: 'canvas_node_add', node: n.id, label: n.label });
    }

    function addEdge(from, to, relation) {
      var exists = state.edges.find(function (e) {
        return (e.from === from.id && e.to === to.id) || (e.from === to.id && e.to === from.id);
      });
      if (exists) {
        feedback.textContent = 'Ya existe una conexión entre esos nodos.';
        feedback.className = 'widget-feedback ko';
        return;
      }
      state.edges.push({ from: from.id, to: to.id, relation: relation });
      saved = false;
      render();
      feedback.textContent = '';
      feedback.className = 'widget-feedback';
      telemetry({ lesson_id: lessonId, ev: 'canvas_edge_add', from: from.id, to: to.id, relation: relation });
    }

    function removeNode(n) {
      state.nodes = state.nodes.filter(function (x) { return x.id !== n.id; });
      state.edges = state.edges.filter(function (e) { return e.from !== n.id && e.to !== n.id; });
      if (connectFrom === n) connectFrom = null;
      selectedNode = null;
      saved = false;
      render();
      telemetry({ lesson_id: lessonId, ev: 'canvas_node_remove', node: n.id });
    }

    function parseInitial() {
      var concepts = JSON.parse(root.dataset.concepts || '[]');
      var initial = JSON.parse(root.dataset.initial || 'null');
      if (initial && initial.nodes) {
        state.nodes = initial.nodes;
        state.edges = initial.edges || [];
        nextNodeId = state.nodes.length + 1;
        return;
      }
      var w = 260, h = 180;
      concepts.forEach(function (c, i) {
        var cols = Math.max(1, Math.ceil(Math.sqrt(concepts.length)));
        var row = Math.floor(i / cols), col = i % cols;
        state.nodes.push({
          id: 'n' + nextNodeId++,
          label: c,
          x: 40 + col * (w / cols) + Math.random() * 12,
          y: 30 + row * (h / Math.ceil(concepts.length / cols)) + Math.random() * 12,
        });
      });
    }

    parseInitial();
    render();

    svg.addEventListener('pointerdown', function (ev) {
      if (ev.target === svg) {
        svg.setPointerCapture(ev.pointerId);
        drag = { pan: true, startX: ev.clientX, startY: ev.clientY, ox: view.x, oy: view.y };
        selectedNode = null;
        closeMenu();
        render();
      }
    });

    svg.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      if (drag.pan) {
        view.x = drag.ox + (ev.clientX - drag.startX);
        view.y = drag.oy + (ev.clientY - drag.startY);
      } else {
        var w = toWorld(ev.clientX, ev.clientY);
        drag.node.x = drag.ox + (w.x - toWorld(drag.startX, drag.startY).x);
        drag.node.y = drag.oy + (w.y - toWorld(drag.startY, drag.startY).y);
      }
      render();
    });

    svg.addEventListener('pointerup', function () { drag = null; });
    svg.addEventListener('pointercancel', function () { drag = null; });

    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      var cx = (ev.clientX - rect.left - view.x) / view.scale;
      var cy = (ev.clientY - rect.top - view.y) / view.scale;
      var factor = ev.deltaY < 0 ? 1.1 : 0.9;
      view.scale = Math.min(3, Math.max(0.4, view.scale * factor));
      view.x = ev.clientX - rect.left - cx * view.scale;
      view.y = ev.clientY - rect.top - cy * view.scale;
      render();
    });

    root.querySelector('[data-canvas-add]').addEventListener('click', function () {
      var label = window.prompt('Nombre del concepto:');
      addNode(label);
    });

    root.querySelector('[data-canvas-clear]').addEventListener('click', function () {
      state = { nodes: [], edges: [] };
      selectedNode = null; connectFrom = null;
      saved = false;
      render();
      feedback.textContent = 'Lienzo vaciado.';
      feedback.className = 'widget-feedback';
    });

    root.querySelector('[data-canvas-save]').addEventListener('click', function () {
      saveWidget(lessonId, widgetId, 'canvas', state, function (ok) {
        saved = ok;
        feedback.textContent = ok ? '✓ Lienzo guardado.' : 'No se pudo guardar el lienzo.';
        feedback.className = 'widget-feedback' + (ok ? ' ok' : ' ko');
      });
    });
  }

  /* ==================================================================
     Widget 2: Tabla de verdad (evaluador de lógica proposicional)
     ================================================================== */
  function tokenize(expr) {
    return expr.replace(/\s+/g, '')
      .replace(/¬/g, '!').replace(/∧/g, '&').replace(/∨/g, '|')
      .replace(/→/g, '>').replace(/↔/g, '=')
      .replace(/[A-Za-z]+/g, ' $& ').replace(/[!&|>=()]/g, ' $& ')
      .trim().split(/\s+/);
  }

  function shuntingYard(tokens) {
    var prec = { '!': 4, '&': 3, '|': 2, '>': 1, '=': 1 };
    var out = [], ops = [];
    tokens.forEach(function (t) {
      if (/^[A-Za-z]+$/.test(t)) out.push(t);
      else if (t === '(') ops.push(t);
      else if (t === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
        ops.pop();
      } else if (t in prec) {
        while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop());
        ops.push(t);
      }
    });
    while (ops.length) out.push(ops.pop());
    return out;
  }

  function evalRPN(rpn, assign) {
    var stack = [];
    rpn.forEach(function (t) {
      if (/^[A-Za-z]+$/.test(t)) stack.push(!!assign[t]);
      else if (t === '!') stack.push(!stack.pop());
      else {
        var b = stack.pop(), a = stack.pop();
        if (t === '&') stack.push(a && b);
        else if (t === '|') stack.push(a || b);
        else if (t === '>') stack.push(!a || b);
        else if (t === '=') stack.push(a === b);
      }
    });
    return stack[0];
  }

  function initTruth(widget) {
    var root = widget;
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;
    var variables = JSON.parse(root.dataset.variables || '[]');
    var solution = JSON.parse(root.dataset.solution || 'null');
    var body = root.querySelector('[data-truth-body]');
    var scoreEl = root.querySelector('[data-logic-score]');
    var feedback = root.querySelector('[data-logic-feedback]');

    var rpn = shuntingYard(tokenize(root.dataset.formula || ''));
    var cells = Array.prototype.slice.call(body.querySelectorAll('.truth-toggle'));

    function assignments() {
      var n = variables.length;
      var out = [];
      for (var i = 0; i < Math.pow(2, n); i++) {
        var assign = {};
        for (var j = 0; j < n; j++) assign[variables[j]] = !!(i & (1 << (n - 1 - j)));
        out.push(assign);
      }
      return out;
    }
    var truth = assignments().map(function (a) { return evalRPN(rpn, a); });

    function mark() {
      var correct = 0;
      cells.forEach(function (c, i) {
        var val = c.dataset.val;
        c.classList.remove('correct', 'incorrect');
        if (val === '') return;
        var expected = truth[i] ? 'T' : 'F';
        if (val === expected) { c.classList.add('correct'); correct++; }
        else c.classList.add('incorrect');
      });
      return correct;
    }

    cells.forEach(function (c) {
      c.addEventListener('click', function () {
        var order = ['', 'T', 'F'];
        var next = order[(order.indexOf(c.dataset.val) + 1) % order.length];
        c.dataset.val = next;
        c.textContent = next === '' ? '·' : next;
        c.classList.remove('correct', 'incorrect');
      });
    });

    root.querySelector('[data-logic-check]').addEventListener('click', function () {
      var correct = mark();
      var total = cells.length;
      var filled = cells.filter(function (c) { return c.dataset.val !== ''; }).length;
      if (filled < total) {
        feedback.textContent = 'Completa la columna ' + root.dataset.formula + ' antes de comprobar.';
        feedback.className = 'widget-feedback';
        return;
      }
      var pct = Math.round(100 * correct / total);
      scoreEl.textContent = correct + '/' + total + ' correctas (' + pct + '%)';
      saveWidget(lessonId, widgetId, 'logic_truth',
        { correct: correct, total: total, pct: pct }, function () {});
      if (correct === total) {
        feedback.textContent = '✓ Tabla correcta.';
        feedback.className = 'widget-feedback ok';
      } else {
        feedback.textContent = 'Revisa las celdas marcadas en rojo.';
        feedback.className = 'widget-feedback ko';
      }
    });

    root.querySelector('[data-logic-hint]').addEventListener('click', function () {
      var i = cells.findIndex(function (c) { return c.dataset.val === ''; });
      if (i === -1) i = 0;
      cells[i].dataset.val = truth[i] ? 'T' : 'F';
      cells[i].textContent = truth[i] ? 'T' : 'F';
    });

    root.querySelector('[data-logic-reset]').addEventListener('click', function () {
      cells.forEach(function (c) {
        c.dataset.val = '';
        c.textContent = '·';
        c.classList.remove('correct', 'incorrect');
      });
      scoreEl.textContent = '';
      feedback.textContent = '';
    });

    if (solution) {
      var opts = root.querySelectorAll('.truth-toggle');
      var idx = 0;
      solution.forEach(function (rowVal) {
        if (typeof rowVal === 'string' && rowVal.length === 1 && rowVal.match(/[TF]/)) {
          opts[idx].dataset.val = rowVal;
          opts[idx].textContent = rowVal;
          idx++;
        }
      });
    }
  }

  /* ==================================================================
     Widget 3: Debate socrático (turnos agente ↔ estudiante)
     ================================================================== */
  function initDebate(widget) {
    var root = widget;
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;
    var turns = JSON.parse(root.dataset.turns || '[]');
    var widgetAudio = JSON.parse(root.dataset.audio || '{}'); // mapa audio §6.5
    var transcript = root.querySelector('[data-debate]');
    var feedback = root.querySelector('[data-debate-feedback]');
    var ti = 0;

    function audioButton(src) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('class', 'audio-play audio-play-sm');
      b.setAttribute('data-src', src);
      b.setAttribute('aria-label', 'Reproducir narración');
      var play = document.createElement('span');
      play.setAttribute('class', 'play-ico');
      play.setAttribute('aria-hidden', 'true');
      play.textContent = '▶';
      var eq = document.createElement('span');
      eq.setAttribute('class', 'eq');
      eq.setAttribute('aria-hidden', 'true');
      eq.innerHTML = '<i></i><i></i><i></i>';
      var label = document.createElement('span');
      label.textContent = 'Narrar';
      b.appendChild(play); b.appendChild(eq); b.appendChild(label);
      return b;
    }

    function addAgent(text, audioSrc) {
      var m = document.createElement('div');
      m.setAttribute('class', 'debate-msg agent');
      var role = document.createElement('div');
      role.setAttribute('class', 'debate-role agent');
      role.textContent = 'Contrincante';
      var p = document.createElement('div');
      p.textContent = text;
      m.appendChild(role); m.appendChild(p);
      if (audioSrc) m.appendChild(audioButton(audioSrc));
      transcript.appendChild(m);
      transcript.scrollTop = transcript.scrollHeight;
    }

    function addStudent(text) {
      var m = document.createElement('div');
      m.setAttribute('class', 'debate-msg student');
      var role = document.createElement('div');
      role.setAttribute('class', 'debate-role student');
      role.textContent = 'Tú';
      var p = document.createElement('div');
      p.textContent = text;
      m.appendChild(role); m.appendChild(p);
      transcript.appendChild(m);
      transcript.scrollTop = transcript.scrollHeight;
    }

    function renderTurn() {
      if (ti >= turns.length) {
        addAgent('Fin del debate. Vuelve a la Reflection y anota lo que cambió en tu posición.',
          widgetAudio.end);
        feedback.textContent = '✓ Debate completado.';
        feedback.className = 'widget-feedback ok';
        saveWidget(lessonId, widgetId, 'debate', { complete: true }, function () {});
        return;
      }
      var turn = turns[ti];
      var turnAudio = widgetAudio.turns ? widgetAudio.turns[ti] : null;
      var turnOptsAudio = widgetAudio.turns_options ? widgetAudio.turns_options[ti] : [];
      var wrap = document.createElement('div');
      wrap.setAttribute('class', 'debate-turn');

      if (turn.agent) {
        addAgent(turn.agent, turnAudio);
        var prompts = Array.isArray(turn.options) ? turn.options
          : Array.isArray(turn.responses) ? turn.responses.map(function (r) { return r.text; }) : [];
        if (prompts.length) {
          var box = document.createElement('div');
          box.setAttribute('class', 'debate-options');
          prompts.forEach(function (opt, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('class', 'debate-opt');
            var bText = document.createElement('span');
            bText.textContent = opt;
            b.appendChild(bText);
            if (turnOptsAudio && turnOptsAudio[i]) b.appendChild(audioButton(turnOptsAudio[i]));
            b.addEventListener('click', function () {
              addStudent(bText.textContent);
              telemetry({ lesson_id: lessonId, ev: 'debate_response', widget: widgetId, turn: ti, option: i, text: bText.textContent });
              var resp = Array.isArray(turn.responses) ? turn.responses[i] : { next: i };
              ti = (resp && typeof resp.next === 'number') ? resp.next : ti + 1;
              renderTurn();
            });
            box.appendChild(b);
          });
          wrap.appendChild(box);
        } else {
          var free = document.createElement('div');
          free.setAttribute('class', 'debate-free');
          var ta = document.createElement('textarea');
          ta.rows = 2;
          ta.setAttribute('aria-label', 'Tu argumento');
          var row = document.createElement('div');
          row.setAttribute('class', 'debate-reply');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('class', 'btn btn-sm');
          btn.textContent = 'Enviar';
          btn.addEventListener('click', function () {
            var v = ta.value.trim();
            if (!v) return;
            addStudent(v);
            telemetry({ lesson_id: lessonId, ev: 'debate_response', widget: widgetId, turn: ti, text: v });
            ti += 1;
            renderTurn();
          });
          row.appendChild(ta); row.appendChild(btn);
          free.appendChild(row);
          wrap.appendChild(free);
        }
      } else {
        ti += 1;
      }

      transcript.appendChild(wrap);
      transcript.scrollTop = transcript.scrollHeight;
    }

    renderTurn();
  }

  /* ==================================================================
     Widget 4: Hefferline — silenciar un «ruido» con un control M-1
     cuyo efecto el estudiante desconoce (recrea el experimento de
     Hefferline: contracciones no sentidas que silencian un ruido).
     ================================================================== */
  function initHefferline(widget) {
    var root = widget;
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;
    var slider = root.querySelector('[data-hef-slider]');
    var noise = root.querySelector('[data-hef-noise]');
    var status = root.querySelector('[data-hef-status]');
    var explain = root.querySelector('[data-hef-explain]');
    var text = root.querySelector('[data-hef-text]');
    var feedback = root.querySelector('[data-hef-feedback]');

    var min = 0, max = 100;
    var band = { lo: 62, hi: 74 };       // rango oculto que silencia el ruido
    var silenced = false;
    var attempts = 0;

    function rnd(a, b) { return Math.round(a + Math.random() * (b - a)); }

    function resetBand() {
      band.lo = rnd(30, 70);
      band.hi = Math.min(95, band.lo + rnd(5, 12));
      silenced = false;
      attempts = 0;
      slider.value = 0;
      explain.hidden = true;
      text.value = '';
      noise.classList.remove('hef-quiet');
      status.textContent = 'El ruido está sonando.';
      status.className = 'hef-status hef-on';
      feedback.textContent = '';
      telemetry({ lesson_id: lessonId, ev: 'hefferline_reset', widget: widgetId, band: [band.lo, band.hi] });
    }

    function check() {
      var v = parseInt(slider.value, 10);
      attempts++;
      if (v >= band.lo && v <= band.hi) {
        if (!silenced) {
          silenced = true;
          noise.classList.add('hef-quiet');
          status.textContent = '¡El ruido se ha silenciado!';
          status.className = 'hef-status hef-off';
          explain.hidden = false;
          telemetry({ lesson_id: lessonId, ev: 'hefferline_silenced', widget: widgetId, attempts: attempts, value: v });
          saveWidget(lessonId, widgetId, 'hefferline', { silenced: true, attempts: attempts, band: [band.lo, band.hi] }, function () {});
        }
      } else {
        if (silenced) {
          silenced = false;
          noise.classList.remove('hef-quiet');
          status.textContent = 'El ruido volvió a sonar.';
          status.className = 'hef-status hef-on';
          explain.hidden = true;
          telemetry({ lesson_id: lessonId, ev: 'hefferline_reversed', widget: widgetId });
        }
      }
    }

    slider.addEventListener('input', check);

    root.querySelector('[data-hef-reset]').addEventListener('click', function () {
      resetBand();
    });

    root.querySelector('[data-hef-save]').addEventListener('click', function () {
      var v = text.value.trim();
      if (!v) { feedback.textContent = 'Escribe tu explicación antes de guardar.'; feedback.className = 'widget-feedback'; return; }
      saveWidget(lessonId, widgetId, 'hefferline_explain', { text: v }, function () {});
      telemetry({ lesson_id: lessonId, ev: 'hefferline_explain', widget: widgetId, text: v });
      feedback.textContent = '✓ Explicación guardada. Ahora sabes que silenciaste el ruido, pero ¿podrías decir qué es exactamente el control M-1?';
      feedback.className = 'widget-feedback ok';
    });

    resetBand();
  }

  /* ==================================================================
     Widget 5: Sonda — sentir un objeto oculto con la punta de una
     herramienta virtual. El contacto se percibe en el extremo distal
     (la punta), no en la mano (el término proximal): enacta la
     incorporación de la herramienta al cuerpo de Polanyi.
     ================================================================== */
  function initProbe(widget) {
    var root = widget;
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;
    var canvas = root.querySelector('[data-probe-canvas]');
    var status = root.querySelector('[data-probe-status]');
    var question = root.querySelector('[data-probe-question]');
    var feedback = root.querySelector('[data-probe-feedback]');
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var hand = { x: 52, y: H - 44 };
    var tip = { x: W - 60, y: H - 44 };
    var object = null;
    var contacts = 0;
    var touching = false;
    var revealed = false;
    var keys = {};

    function rnd(a, b) { return a + Math.random() * (b - a); }

    function newObject() {
      var cx = rnd(W * 0.3, W * 0.72);
      var cy = rnd(H * 0.22, H * 0.62);
      var rw = rnd(34, 60);
      var rh = rnd(26, 48);
      var angle = rnd(-0.6, 0.6);
      // elipse oculta (orientada)
      object = { cx: cx, cy: cy, rw: rw, rh: rh, angle: angle };
    }

    function pointInEllipse(px, py) {
      if (!object) return false;
      var dx = px - object.cx, dy = py - object.cy;
      var ca = Math.cos(-object.angle), sa = Math.sin(-object.angle);
      var rx = dx * ca - dy * sa;
      var ry = dx * sa + dy * ca;
      var a = object.rw, b = object.rh;
      return (rx * rx) / (a * a) + (ry * ry) / (b * b) <= 1;
    }

    function drawGrid() {
      ctx.strokeStyle = 'rgba(148,163,184,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (var y = 0; y <= H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }

    function drawObject(show) {
      if (!object || !show) return;
      ctx.save();
      ctx.translate(object.cx, object.cy);
      ctx.rotate(object.angle);
      ctx.fillStyle = 'rgba(74,222,128,0.22)';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, object.rw, object.rh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'center';
      ctx.fillText('El objeto oculto', object.cx, object.cy + object.rh + 16);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawGrid();
      drawObject(revealed);

      // varilla de la sonda
      ctx.strokeStyle = touching ? '#fbbf24' : '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      // mano (término proximal): apagada, sin feedback de contacto
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('tu mano', hand.x, hand.y + 24);

      // punta (término distal): aquí se siente el contacto
      if (touching) {
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('¡contacto!', tip.x, tip.y - 16);
      } else {
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function setTip(x, y) {
      var r = canvas.getBoundingClientRect();
      tip.x = Math.max(0, Math.min(W, (x - r.left) * (W / r.width)));
      tip.y = Math.max(0, Math.min(H, (y - r.top) * (H / r.height)));
      var wasTouching = touching;
      touching = pointInEllipse(tip.x, tip.y);
      if (touching && !wasTouching && !revealed) {
        contacts++;
        status.textContent = '¡La punta tocó algo! El contacto se siente aquí, en la punta. Sigue barriendo para mapear el objeto.';
        status.className = 'probe-status probe-on';
        telemetry({ lesson_id: lessonId, ev: 'probe_contact', widget: widgetId, contact: contacts });
      } else if (!touching && wasTouching) {
        status.textContent = 'La punta salió del objeto. Sigue barriendo.';
        status.className = 'probe-status';
      }
      draw();
    }

    canvas.addEventListener('pointermove', function (e) { setTip(e.clientX, e.clientY); });
    canvas.addEventListener('pointerdown', function (e) { setTip(e.clientX, e.clientY); });
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('keydown', function (e) {
      var step = 8;
      var dx = 0, dy = 0;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowDown') dy = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (dx || dy) {
        e.preventDefault();
        var r = canvas.getBoundingClientRect();
        setTip(r.left + (tip.x + dx) * (r.width / W), r.top + (tip.y + dy) * (r.height / H));
      }
    });

    root.querySelector('[data-probe-reveal]').addEventListener('click', function () {
      if (contacts === 0) {
        feedback.textContent = 'Aún no has tocado el objeto con la punta: barre el campo hasta notar el contacto.';
        feedback.className = 'widget-feedback';
        return;
      }
      revealed = true;
      question.hidden = false;
      status.textContent = 'Ahí estaba el objeto oculto. Lo sentiste con la punta de la sonda, no con tu mano. Ahora responde: ¿dónde sentiste el contacto?';
      status.className = 'probe-status probe-off';
      draw();
      telemetry({ lesson_id: lessonId, ev: 'probe_reveal', widget: widgetId, contacts: contacts });
      saveWidget(lessonId, widgetId, 'probe', { contacts: contacts, revealed: true }, function () {});
    });

    root.querySelector('[data-probe-reset]').addEventListener('click', function () {
      newObject();
      contacts = 0;
      touching = false;
      revealed = false;
      question.hidden = true;
      tip.x = W - 60; tip.y = H - 44;
      status.textContent = 'Hay un objeto nuevo oculto en el campo. Barre con la sonda para encontrarlo.';
      status.className = 'probe-status';
      feedback.textContent = '';
      draw();
      telemetry({ lesson_id: lessonId, ev: 'probe_reset', widget: widgetId });
    });

    root.querySelector('[data-probe-save]').addEventListener('click', function () {
      var sel = question.querySelector('input[name="probe-where"]:checked');
      if (!sel) {
        feedback.textContent = 'Elige una de las tres opciones antes de guardar.';
        feedback.className = 'widget-feedback';
        return;
      }
      saveWidget(lessonId, widgetId, 'probe_answer', { where: sel.value, contacts: contacts }, function () {});
      telemetry({ lesson_id: lessonId, ev: 'probe_answer', widget: widgetId, where: sel.value });
      if (sel.value === 'punta') {
        feedback.textContent = '✓ Exacto. Sentiste el contacto en la punta de la sonda, no en tu mano: la herramienta se incorporó a tu cuerpo.';
        feedback.className = 'widget-feedback ok';
      } else {
        feedback.textContent = 'Piénsalo de nuevo: tu mano no recibió ningún golpe; toda la información llegó a través del extremo de la sonda. Vuelve a barre el campo y observa dónde se ilumina el contacto.';
        feedback.className = 'widget-feedback';
      }
    });

    newObject();
    draw();
  }

  /* ==================================================================
     Widget 6: Saturación semántica — repetir una palabra hasta que
     pierde su significado, y recuperarla al ponerla en contexto.
     Enacta la «lucidez destructiva» de Polanyi: atender a las
     particularidades borra el significado; reintegrar lo restaura.
     ================================================================== */
  function initSatiation(widget) {
    var root = widget;
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;
    var words = [];
    try { words = JSON.parse(root.dataset.words || '[]'); } catch (e) { words = []; }
    var wordEl = root.querySelector('[data-sat-word]');
    var status = root.querySelector('[data-sat-status]');
    var countEl = root.querySelector('[data-sat-count]');
    var question = root.querySelector('[data-sat-question]');
    var feedback = root.querySelector('[data-sat-feedback]');
    var btnRepeat = root.querySelector('[data-sat-repeat]');
    var btnContext = root.querySelector('[data-sat-context]');
    var btnNext = root.querySelector('[data-sat-next]');

    var idx = 0;
    var count = 0;
    var lostMeaning = false;
    var audio = null;

    function stopAudio() {
      if (audio) { audio.pause(); audio.currentTime = 0; }
    }

    function playFile(name, cb) {
      if (!name) { if (cb) cb(); return; }
      stopAudio();
      audio = new Audio('/lessons/' + lessonId + '/audio/' + name);
      audio.addEventListener('ended', function () { if (cb) cb(); }, { once: true });
      audio.addEventListener('error', function () { if (cb) cb(); }, { once: true });
      audio.play().catch(function () { if (cb) cb(); });
      telemetry({ lesson_id: lessonId, ev: 'satiation_audio', widget: widgetId, file: name });
    }

    function renderWord() {
      var w = words[idx];
      wordEl.textContent = w ? w.word : '—';
      count = 0;
      countEl.textContent = '0';
      lostMeaning = false;
      question.hidden = true;
      btnContext.hidden = true;
      btnNext.hidden = true;
      btnRepeat.hidden = false;
      btnRepeat.textContent = 'Repetir palabra';
      status.textContent = w
        ? 'Pulsa «Repetir palabra» y di la palabra mentalmente cada vez que la oigas. Fíjate en lo que le pasa al significado.'
        : 'No hay palabras cargadas para este experimento.';
      status.className = 'sat-status';
      feedback.textContent = '';
      telemetry({ lesson_id: lessonId, ev: 'satiation_word', widget: widgetId, idx: idx, word: w ? w.word : '' });
    }

    btnRepeat.addEventListener('click', function () {
      var w = words[idx];
      if (!w) return;
      count++;
      countEl.textContent = String(count);
      playFile(w.wordAudio, function () {});
      if (count >= 8 && !lostMeaning) {
        lostMeaning = true;
        status.textContent = 'Sigue repitiéndola unas cuantas veces más. Cuando lo hayas hecho, responde: ¿qué le ha pasado a la palabra?';
        status.className = 'sat-status sat-on';
        question.hidden = false;
        btnRepeat.textContent = 'Seguir repitiendo';
        btnContext.hidden = true;
        telemetry({ lesson_id: lessonId, ev: 'satiation_threshold', widget: widgetId, count: count });
      }
    });

    btnContext.addEventListener('click', function () {
      var w = words[idx];
      if (!w) return;
      status.textContent = 'Ahora, en su contexto: «' + w.context + '». Escúchala y dime: ¿volvió el significado?';
      status.className = 'sat-status sat-off';
      playFile(w.contextAudio, function () {});
      feedback.textContent = 'El significado volvió: al usarla en una frase, la palabra recupera su sentido.';
      feedback.className = 'widget-feedback ok';
      telemetry({ lesson_id: lessonId, ev: 'satiation_context', widget: widgetId, idx: idx });
      btnContext.hidden = true;
    });

    btnNext.addEventListener('click', function () {
      idx = (idx + 1) % words.length;
      renderWord();
    });

    root.querySelector('[data-sat-save]').addEventListener('click', function () {
      var sel = question.querySelector('input[name="sat-what"]:checked');
      if (!sel) {
        feedback.textContent = 'Elige una de las dos opciones antes de guardar.';
        feedback.className = 'widget-feedback';
        return;
      }
      var val = sel.value;
      saveWidget(lessonId, widgetId, 'satiation', { idx: idx, word: words[idx] ? words[idx].word : '', count: count, lost: val === 'perdida' }, function () {});
      telemetry({ lesson_id: lessonId, ev: 'satiation_answer', widget: widgetId, val: val, count: count });
      if (val === 'perdida') {
        feedback.textContent = '✓ Exacto: repetir la palabra hizo que perdiera su significado. Atender a su sonido destruyó lo que significaba. Ahora pulsa «Ponerla en contexto».';
        feedback.className = 'widget-feedback ok';
        btnContext.hidden = false;
      } else {
        feedback.textContent = 'Piénsalo de nuevo: escúchala una vez más y responde con sinceridad. Si te parece rara o sin sentido, esa es la señal.';
        feedback.className = 'widget-feedback';
      }
      btnNext.hidden = words.length > 1;
    });

    renderWord();
  }

  /* ==================================================================
     Widget 7: Editor de código vivo (programación e IA). Textarea con
     resaltado de sintaxis Python (pre detrás), ejecución en el sandbox
     de lib/runner.py vía /api/run_code y comprobación automática contra
     una salida esperada (check.mode: contains | equals | empty | exit_zero).
     ================================================================== */
  function initCodeEditor(widget) {
    var root = widget;
    var lessonId = root.dataset.lesson;
    var widgetId = root.dataset.widgetId;
    var starter = root.dataset.starter || '';
    var expected = root.dataset.expected || '';
    var check = {};
    try { check = JSON.parse(root.dataset.check || '{}'); } catch (e) { check = {}; }
    var audio = {};
    try { audio = JSON.parse(root.dataset.audio || '{}'); } catch (e) { audio = {}; }
    var ta = root.querySelector('[data-code-input]');
    var hl = root.querySelector('.code-hl');
    var outBox = root.querySelector('[data-code-output]');
    var stdoutEl = root.querySelector('[data-code-stdout]');
    var stderrEl = root.querySelector('[data-code-stderr]');
    var feedback = root.querySelector('[data-code-feedback]');
    var hintBox = root.querySelector('[data-code-hintbox]');
    var promptBox = root.querySelector('[data-code-prompt]');

    var lastOutput = '';
    var lastRunOk = false;
    var ran = false;

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function pyHighlight(src) {
      var out = '';
      var last = 0;
      var re = /(#.*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|lambda|pass|break|continue|in|is|not|and|or|True|False|None|print|range|len|int|str|float|bool|list|dict|set|tuple|yield|raise|input|sum|min|max|abs|round|sorted|enumerate|zip|map|filter|any|all|type|isinstance)\b|\b(\d+(?:\.\d+)?)\b|(\b[A-Za-z_]\w*)(?=\s*\()/g;
      var m;
      while ((m = re.exec(src))) {
        out += esc(src.slice(last, m.index));
        if (m[1]) out += '<span class="tok-comment">' + esc(m[1]) + '</span>';
        else if (m[2]) out += '<span class="tok-str">' + esc(m[2]) + '</span>';
        else if (m[3]) out += '<span class="tok-kw">' + esc(m[3]) + '</span>';
        else if (m[4]) out += '<span class="tok-num">' + esc(m[4]) + '</span>';
        else if (m[5]) out += '<span class="tok-fn">' + esc(m[5]) + '</span>';
        last = re.lastIndex;
      }
      out += esc(src.slice(last));
      return out;
    }

    function syncHighlight() {
      if (hl) hl.innerHTML = pyHighlight(ta.value);
    }

    function syncScroll() {
      if (hl) { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; }
    }

    function playFile(name) {
      if (!name) return;
      var a = new Audio('/lessons/' + lessonId + '/audio/' + name);
      a.play().catch(function () {});
      telemetry({ lesson_id: lessonId, ev: 'code_audio', widget: widgetId, file: name });
    }

    function showRun(res) {
      ran = true;
      lastOutput = (res && res.stdout) || '';
      lastRunOk = !!(res && res.ok && !res.timeout);
      stdoutEl.textContent = lastOutput || '(sin salida)';
      stdoutEl.hidden = false;
      if (res && res.timeout) {
        stderrEl.textContent = '⏱ ' + (res.error || 'se agotó el tiempo');
        stderrEl.hidden = false;
        outBox.hidden = false;
        feedback.textContent = 'El programa tardó demasiado. Añade un caso base que termine.';
        feedback.className = 'widget-feedback ko';
      } else if (res && !res.ok) {
        stderrEl.textContent = (res.error ? 'Error: ' + res.error : '') || (res.stderr || 'Error de ejecución');
        stderrEl.hidden = false;
        outBox.hidden = false;
        feedback.textContent = 'Tu código falló al ejecutarse. Lee el error y corrígelo.';
        feedback.className = 'widget-feedback ko';
      } else {
        stderrEl.hidden = true;
        outBox.hidden = false;
        feedback.textContent = '✓ Ejecutado sin errores. Compara la salida y pulsa «Comprobar».';
        feedback.className = 'widget-feedback ok';
      }
    }

    function runCode(cb) {
      ta.disabled = true;
      feedback.textContent = 'Ejecutando…';
      feedback.className = 'widget-feedback';
      try {
        fetch('/api/run_code/' + encodeURIComponent(lessonId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lesson_id: lessonId,
            widget: widgetId,
            slide: root.dataset.widgetId,
            language: root.dataset.language || 'python',
            code: ta.value,
          }),
        }).then(function (r) { return r.json(); }).then(function (res) {
          ta.disabled = false;
          showRun(res);
          if (cb) cb(res);
        }).catch(function () {
          ta.disabled = false;
          feedback.textContent = 'No se pudo ejecutar (¿servidor disponible?).';
          feedback.className = 'widget-feedback ko';
          if (cb) cb({ ok: false, stdout: '' });
        });
      } catch (e) {
        ta.disabled = false;
        if (cb) cb({ ok: false, stdout: '' });
      }
    }

    function grade() {
      var mode = check.mode || 'exit_zero';
      var want = (check.expected !== undefined) ? String(check.expected) : String(expected);
      var ok;
      if (mode === 'exit_zero') ok = lastRunOk;
      else if (mode === 'empty') ok = lastOutput.trim() === '';
      else if (mode === 'equals') ok = lastOutput.trim() === want.trim();
      else ok = lastOutput.indexOf(want) !== -1;
      telemetry({ lesson_id: lessonId, ev: 'code_check', widget: widgetId, ok: ok, mode: mode });
      saveWidget(lessonId, widgetId, 'code_editor',
        { passed: ok, code: ta.value, last_output: lastOutput }, function () {});
      if (ok) {
        feedback.textContent = check.feedback_ok || '✓ ¡Correcto! La salida es la esperada.';
        feedback.className = 'widget-feedback ok';
        playFile(audio.feedback_ok);
        if (promptBox) promptBox.hidden = false;
      } else {
        feedback.textContent = check.feedback_ko || 'Aún no: compara tu salida con la esperada y vuelve a intentarlo.';
        feedback.className = 'widget-feedback ko';
        playFile(audio.feedback_ko);
      }
    }

    function doCheck() {
      if (!ran) {
        runCode(function (res) { showRun(res); grade(); });
      } else {
        grade();
      }
    }

    root.querySelector('[data-code-run]').addEventListener('click', function () {
      runCode(function () {});
    });

    root.querySelector('[data-code-check]').addEventListener('click', function () {
      doCheck();
    });

    root.querySelector('[data-code-hint]').addEventListener('click', function () {
      hintBox.hidden = !hintBox.hidden;
      if (!hintBox.hidden) playFile(audio.hint);
      telemetry({ lesson_id: lessonId, ev: 'code_hint', widget: widgetId });
    });

    root.querySelector('[data-code-save]').addEventListener('click', function () {
      saveWidget(lessonId, widgetId, 'code_editor',
        { code: ta.value, last_output: lastOutput }, function (ok) {
          feedback.textContent = ok ? '✓ Código guardado.' : 'No se pudo guardar el código.';
          feedback.className = 'widget-feedback' + (ok ? ' ok' : ' ko');
        });
    });

    root.querySelector('[data-code-reset]').addEventListener('click', function () {
      ta.value = starter;
      ran = false;
      lastOutput = '';
      lastRunOk = false;
      stdoutEl.textContent = '';
      stderrEl.textContent = '';
      stderrEl.hidden = true;
      outBox.hidden = true;
      hintBox.hidden = true;
      if (promptBox) promptBox.hidden = true;
      feedback.textContent = 'Código reiniciado al estado inicial.';
      feedback.className = 'widget-feedback';
      syncHighlight();
    });

    var promptSave = root.querySelector('[data-code-prompt-save]');
    if (promptSave && promptBox) {
      promptSave.addEventListener('click', function () {
        var sel = promptBox.querySelector('input[name="code-answer"]:checked');
        if (!sel) {
          feedback.textContent = 'Elige una de las opciones antes de continuar.';
          feedback.className = 'widget-feedback';
          return;
        }
        var idx = parseInt(sel.value, 10);
        var correctIdx = parseInt(root.dataset.promptCorrect || '-1', 10);
        var ok = idx === correctIdx;
        saveWidget(lessonId, widgetId, 'code_editor_prompt', { answer: idx, correct: ok }, function () {});
        telemetry({ lesson_id: lessonId, ev: 'code_prompt', widget: widgetId, answer: idx, correct: ok });
        if (ok) {
          feedback.textContent = '✓ ¡Exacto! Has cerrado el ejercicio.';
          feedback.className = 'widget-feedback ok';
          playFile(audio.prompt_ok);
        } else {
          feedback.textContent = 'Piénsalo de nuevo: observa la salida y responde.';
          feedback.className = 'widget-feedback ko';
          playFile(audio.prompt_ko);
        }
      });
    }

    ta.value = starter;
    ta.addEventListener('input', syncHighlight);
    ta.addEventListener('scroll', syncScroll);
    syncHighlight();
  }

  /* ------------------------------------------------------------------
     Arranque: los widgets viven dentro del deck reveal.js, pero el evento
     'ready' puede haberse disparado antes de que este script (defer) corra.
     Se detecta por la clase 'ready' del wrapper del deck (fiable) y como
     respaldo por el evento 'ready' y DOMContentLoaded.
  ------------------------------------------------------------------ */
  function deckReady() {
    var r = document.querySelector('.reveal');
    return !!(r && r.classList.contains('ready'));
  }

  function initAll() {
    function once(sel, init) {
      document.querySelectorAll(sel).forEach(function (w) {
        if (w.dataset.widgetInit) return;
        w.dataset.widgetInit = '1';
        init(w);
        // Cualquier interacción real dentro del widget (clic, teclado,
        // escritura) marca el engagement que el deck lee al abandonar la
        // slide (widget_engage vs widget_ignore, §8.8 SKILL.md).
        ['pointerdown', 'keydown', 'input'].forEach(function (type) {
          w.addEventListener(type, function () { engage(w); });
        });
      });
    }
    once('[data-widget="canvas"]', initCanvas);
    once('[data-widget="logic_truth"]', initTruth);
    once('[data-widget="debate"]', initDebate);
    once('[data-widget="hefferline"]', initHefferline);
    once('[data-widget="probe"]', initProbe);
    once('[data-widget="satiation"]', initSatiation);
    once('[data-widget="code_editor"]', initCodeEditor);
  }

  function boot() {
    if (deckReady()) { initAll(); return true; }
    return false;
  }

  if (window.Reveal) {
    if (!boot()) {
      Reveal.on('ready', initAll);
      document.addEventListener('DOMContentLoaded', boot);
      setTimeout(boot, 800);
    }
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAll);
    } else {
      initAll();
    }
  }
})();
