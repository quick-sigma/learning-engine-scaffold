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
    var transcript = root.querySelector('[data-debate]');
    var feedback = root.querySelector('[data-debate-feedback]');
    var ti = 0;

    function addAgent(text) {
      var m = document.createElement('div');
      m.setAttribute('class', 'debate-msg agent');
      var role = document.createElement('div');
      role.setAttribute('class', 'debate-role agent');
      role.textContent = 'Contrincante';
      var p = document.createElement('div');
      p.textContent = text;
      m.appendChild(role); m.appendChild(p);
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
        addAgent('Fin del debate. Vuelve a la Reflection y anota lo que cambió en tu posición.');
        feedback.textContent = '✓ Debate completado.';
        feedback.className = 'widget-feedback ok';
        saveWidget(lessonId, widgetId, 'debate', { complete: true }, function () {});
        return;
      }
      var turn = turns[ti];
      var wrap = document.createElement('div');
      wrap.setAttribute('class', 'debate-turn');

      if (turn.agent) {
        addAgent(turn.agent);
        var prompts = Array.isArray(turn.options) ? turn.options
          : Array.isArray(turn.responses) ? turn.responses.map(function (r) { return r.text; }) : [];
        if (prompts.length) {
          var box = document.createElement('div');
          box.setAttribute('class', 'debate-options');
          prompts.forEach(function (opt, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('class', 'debate-opt');
            b.textContent = opt;
            b.addEventListener('click', function () {
              addStudent(opt);
              telemetry({ lesson_id: lessonId, ev: 'debate_response', widget: widgetId, turn: ti, option: i, text: opt });
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

  /* ------------------------------------------------------------------
     Arranque: solo cuando reveal.js está listo (deck montado en DOM)
  ------------------------------------------------------------------ */
  function initAll() {
    document.querySelectorAll('[data-widget="canvas"]').forEach(initCanvas);
    document.querySelectorAll('[data-widget="logic_truth"]').forEach(initTruth);
    document.querySelectorAll('[data-widget="debate"]').forEach(initDebate);
    document.querySelectorAll('[data-widget="hefferline"]').forEach(initHefferline);
  }

  if (window.Reveal) {
    Reveal.on('ready', initAll);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAll);
    } else {
      initAll();
    }
  }
})();
