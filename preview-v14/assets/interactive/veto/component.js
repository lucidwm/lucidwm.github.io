/* LucidWM interactive: the veto walk.  Plain JS, no dependencies.  One time axis (step 0..362) drives the two replayed views,
   the map and the readouts.  Views: a small preview sheet is shown while dragging, the full frame once the step settles.
   No value is printed: only steps named in the paper and whether a readout is above its own alarm line. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var PER = 32, COLS = 8, PW = 256, PH = 192, KEEP = 90, INFLIGHT = 6, OPEN = 183;

  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {                                   // token colours go through style, where var() is valid everywhere
      if (String(attrs[k]).indexOf('var(') === 0) e.style.setProperty(k, attrs[k]); else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function pad3(v) { return ('00' + v).slice(-3); }
  function star(cx, cy, r) {
    var p = [];
    for (var k = 0; k < 10; k++) {
      var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return 'M' + p.join('L') + 'Z';
  }

  function init(root) {
    var base = root.getAttribute('data-base') || 'veto/data/';
    var cams = {}, D = null, S = 362, s = OPEN, G = null, M = null, woken = false;
    var chart = root.querySelector('.lwi-veto__chart'), csvg = chart.querySelector('svg');
    var msvg = root.querySelector('.lwi-veto__map svg');
    var btnPlay = root.querySelector('.lwi-veto__play'), stateEl = root.querySelector('.lwi-veto__state');
    var moments = root.querySelectorAll('.lwi-veto__moments button');
    Array.prototype.forEach.call(root.querySelectorAll('.lwi-veto__cam'), function (c) {
      var run = c.getAttribute('data-run'), cv = c.querySelector('canvas');
      cams[run] = { run: run, frame: c.querySelector('.lwi-veto__frame'), cv: cv, ctx: cv.getContext('2d'), bar: c.querySelector('.lwi-veto__load'),
                    step: c.querySelector('.lwi-veto__step'), full: {}, sheets: [], shown: '', T: 0 };
    });

    /* ---------- image loading: a small prioritised queue */
    var queue = [], busy = 0;
    function want(url, cb, front) {
      var job = { url: url, cb: cb };
      if (front) queue.unshift(job); else queue.push(job);
      pump();
    }
    function pump() {
      while (busy < INFLIGHT && queue.length) {
        (function (job) {
          busy++;
          var im = new Image(); im.decoding = 'async';
          im.onload = function () { busy--; job.cb(im); pump(); };
          im.onerror = function () { busy--; pump(); };
          im.src = job.url;
        })(queue.shift());
      }
    }
    function idxOf(c, st) { return Math.min(st, c.T - 1); }
    function needFull(c, k, front) {
      if (c.full[k]) return;
      c.full[k] = 'pending';
      want(base + 'frames/' + c.run + '/' + pad3(k) + '.webp', function (im) {
        c.full[k] = im; trim(c);
        if (idxOf(c, s) === k) paint(c);
      }, front);
    }
    function trim(c) {
      var ks = Object.keys(c.full).filter(function (k) { return c.full[k] !== 'pending'; });
      if (ks.length <= KEEP) return;
      var at = idxOf(c, s), keys = [0, 24, 189, 262, 361];
      ks.sort(function (a, b) { return Math.abs(b - at) - Math.abs(a - at); });
      for (var j = 0; j < ks.length - KEEP; j++) if (keys.indexOf(+ks[j]) < 0) delete c.full[ks[j]];
    }
    function loadSheets() {
      var jobs = [];
      ['base', 'ours'].forEach(function (run) {
        var c = cams[run], nsh = Math.ceil(c.T / PER), at = Math.floor(idxOf(c, s) / PER);
        for (var q = 0; q < nsh; q++) jobs.push({ c: c, q: q, d: Math.abs(q - at) });
      });
      jobs.sort(function (a, b) { return a.d - b.d; });
      jobs.forEach(function (j) {
        want(base + 'preview/' + j.c.run + '_' + ('0' + j.q).slice(-2) + '.webp', function (im) {
          j.c.sheets[j.q] = im; paint(j.c);
        });
      });
    }

    /* ---------- drawing a view */
    function sizeCanvas(c) {
      var r = window.devicePixelRatio || 1, w = Math.round(c.frame.clientWidth * r), h = Math.round(w * 3 / 4);
      if (c.cv.width !== w) { c.cv.width = w; c.cv.height = h; c.shown = ''; }
    }
    function paint(c) {
      if (!D) return;
      sizeCanvas(c);
      var k = idxOf(c, s), im = c.full[k], ctx = c.ctx, key;
      ctx.imageSmoothingQuality = 'high';
      if (im && im !== 'pending') {
        key = 'f' + k;
        if (c.shown !== key) ctx.drawImage(im, 0, 0, c.cv.width, c.cv.height);
      } else {
        var sh = c.sheets[Math.floor(k / PER)];
        if (sh) {
          key = 'p' + k;
          var j = k % PER;
          if (c.shown !== key && c.shown !== 'f' + k) ctx.drawImage(sh, (j % COLS) * PW, Math.floor(j / COLS) * PH, PW, PH, 0, 0, c.cv.width, c.cv.height);
        }
      }
      if (key) c.shown = key;
      // the thin line under the frame: full width while this step's frame is on its way, the preview sheets' progress after a drag
      var nsh = Math.ceil(c.T / PER), got = c.sheets.filter(Boolean).length, sharp = c.shown === 'f' + k;
      c.bar.style.width = (woken ? 100 * got / nsh : 100) + '%';
      c.bar.classList.toggle('is-done', sharp && (!woken || got === nsh));
    }

    /* ---------- map */
    function drawMap() {
      var m = D.map, g = mk('g', {}, msvg);
      m.changed.forEach(function (b) { mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], fill: 'var(--lwi-sand)' }, g); });
      mk('path', { d: m.walls, stroke: 'var(--lwi-ink)', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round', fill: 'none', 'stroke-opacity': .8 }, g);
      function pts(r, upto) {
        var xy = D[r].xy, out = [];
        for (var k = 0; k <= upto; k++) out.push(xy[2 * k] + ',' + xy[2 * k + 1]);
        return out.join(' ');
      }
      var line = { base: { c: 'var(--lwi-base)', w: 3.2 }, ours: { c: 'var(--lwi-ours)', w: 2.4 } };
      ['base', 'ours'].forEach(function (r) {
        mk('polyline', { points: pts(r, D[r].T - 1), fill: 'none', stroke: line[r].c, 'stroke-opacity': .22, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, g);
      });
      var live = {};
      ['base', 'ours'].forEach(function (r) {
        live[r] = mk('polyline', { fill: 'none', stroke: line[r].c, 'stroke-width': line[r].w, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      });
      mk('path', { d: star(m.goal[0], m.goal[1], 30), fill: 'var(--lwi-ink)', stroke: 'var(--lwi-bg)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, g);
      mk('circle', { cx: D.ours.xy[0], cy: D.ours.xy[1], r: 9, fill: 'var(--lwi-ink)' }, g);
      var v = D.moments.veto, e = D.moments.base_leaves;
      mk('circle', { cx: D.ours.xy[2 * v], cy: D.ours.xy[2 * v + 1], r: 30, fill: 'none', stroke: 'var(--lwi-alarm)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, g);
      mk('circle', { cx: D.base.xy[2 * e], cy: D.base.xy[2 * e + 1], r: 30, fill: 'none', stroke: 'var(--lwi-ink)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, g);
      var me = {};
      ['base', 'ours'].forEach(function (r) {
        var gg = mk('g', {}, g);
        me[r] = { g: gg, head: mk('line', { x1: 0, y1: 0, x2: 44, y2: 0, stroke: line[r].c, 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round' }, gg),
                  dot: mk('circle', { r: 17, fill: line[r].c, stroke: 'var(--lwi-bg)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, gg) };
      });
      M = { live: live, me: me, pts: pts };
      msvg.addEventListener('click', function (ev) {         // go to the nearest point of either route
        var r = msvg.getBoundingClientRect(), x = (ev.clientX - r.left) * m.w / r.width, y = (ev.clientY - r.top) * m.h / r.height;
        var best = null;
        ['base', 'ours'].forEach(function (run) {
          var xy = D[run].xy;
          for (var k = 0; k < D[run].T; k++) {
            var d = (xy[2 * k] - x) * (xy[2 * k] - x) + (xy[2 * k + 1] - y) * (xy[2 * k + 1] - y);
            if (!best || d < best.d) best = { d: d, k: k };
          }
        });
        if (best && best.d < 60 * 60) { halt(); set(best.k); settle(); }
      });
    }
    function updateMap() {
      ['base', 'ours'].forEach(function (r) {
        var k = Math.min(s, D[r].T - 1), a = D[r].ang[k] * Math.PI / 180;
        M.live[r].setAttribute('points', M.pts(r, k));
        M.me[r].g.setAttribute('transform', 'translate(' + D[r].xy[2 * k] + ',' + D[r].xy[2 * k + 1] + ')');
        M.me[r].head.setAttribute('x2', (44 * Math.cos(a)).toFixed(1)); M.me[r].head.setAttribute('y2', (-44 * Math.sin(a)).toFixed(1));
        M.me[r].g.style.display = s >= D[r].T ? 'none' : '';
      });
    }

    /* ---------- readouts: ours' doubt and base's entropy, each on its own line (1) */
    function layout() {
      var W = chart.clientWidth, H = chart.clientHeight;
      if (!W || !H || !D) return;
      while (csvg.firstChild) csvg.removeChild(csvg.firstChild);
      var L = 4, R = 10, T = 46, B = 52, lo = -1.15, hi = 2.55;
      var X = function (st) { return L + (W - L - R) * st / S; };
      var Y = function (v) { return T + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (H - T - B); };
      var yb = H - B, g = mk('g', {}, csvg), o = D.ours.doubt, b = D.base.entropy;
      // red wash: ours above its line on the stretch that fires the veto
      var a0 = D.alarm_stretch[0], a1 = D.alarm_stretch[1];
      var xin = X(a0 - 1) + (X(a0) - X(a0 - 1)) * (1 - o[a0 - 1]) / (o[a0] - o[a0 - 1]);
      var xout = X(a1) + (X(a1 + 1) - X(a1)) * (o[a1] - 1) / (o[a1] - o[a1 + 1]);
      var p = 'M' + xin.toFixed(1) + ',' + Y(1).toFixed(1);
      for (var k = a0; k <= a1; k++) p += 'L' + X(k).toFixed(1) + ',' + Y(o[k]).toFixed(1);
      mk('path', { d: p + 'L' + xout.toFixed(1) + ',' + Y(1).toFixed(1) + 'Z', fill: 'var(--lwi-alarm)', 'fill-opacity': 'var(--lwi-wash)' }, g);
      mk('line', { x1: L, x2: W - R, y1: Y(1), y2: Y(1), stroke: 'var(--lwi-ink)', 'stroke-opacity': .55, 'stroke-dasharray': '4 4' }, g);
      mk('text', { x: W - R, y: Y(1) - 6, 'text-anchor': 'end' }, g).textContent = 'alarm line';
      var path = function (arr) { return arr.map(function (v, j) { return (j ? 'L' : 'M') + X(j).toFixed(1) + ',' + Y(v).toFixed(1); }).join(''); };
      mk('path', { d: path(b), fill: 'none', stroke: 'var(--lwi-base)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
      mk('path', { d: path(o), fill: 'none', stroke: 'var(--lwi-ours)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      // legend with line keys, top right
      [['ours, doubt', 'var(--lwi-ours)', 2.5], ['base, entropy', 'var(--lwi-base)', 2]].forEach(function (it, q) {
        var y = 8 + q * 17, t = mk('text', { x: W - R, y: y + 4, 'text-anchor': 'end', 'class': 'is-name' }, g);
        t.textContent = it[0];
        var tw = t.getComputedTextLength ? t.getComputedTextLength() : 80;
        mk('line', { x1: W - R - tw - 26, x2: W - R - tw - 8, y1: y, y2: y, stroke: it[1], 'stroke-width': it[2], 'stroke-linecap': 'round' }, g);
      });
      // circles where ours turns and base leaves (as the paper's figure), stars where each arrives
      var v = D.moments.veto, e = D.moments.base_leaves;
      mk('circle', { cx: X(v), cy: Y(o[v]), r: 7, fill: 'none', stroke: 'var(--lwi-alarm)', 'stroke-width': 2 }, g);
      mk('circle', { cx: X(e), cy: Y(b[e]), r: 7, fill: 'none', stroke: 'var(--lwi-ink)', 'stroke-width': 1.5 }, g);
      [D.moments.ours_arrives, D.moments.base_arrives].forEach(function (st) {
        mk('path', { d: star(X(st), yb - 1, 6), fill: 'var(--lwi-ink)' }, g);
      });
      // scrub track: the named steps as ticks, the veto in red
      var yt = H - 30;
      mk('line', { x1: L, x2: W - R, y1: yt, y2: yt, stroke: 'var(--lwi-hair)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      var fill = mk('line', { x1: L, x2: L, y1: yt, y2: yt, stroke: 'var(--lwi-ink)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      [[0, null], [v, 'var(--lwi-alarm)'], [D.moments.ours_arrives, 'var(--lwi-ink)'], [e, 'var(--lwi-ink)'], [S, 'var(--lwi-ink)']].forEach(function (tk) {
        if (tk[1]) mk('line', { x1: X(tk[0]), x2: X(tk[0]), y1: yt - 5, y2: yt + 5, stroke: tk[1], 'stroke-width': 2 }, g);
        var anchor = tk[0] === 0 ? 'start' : tk[0] === S ? 'end' : 'middle';
        mk('text', { x: X(tk[0]), y: H - 6, 'text-anchor': anchor, 'class': tk[0] === v ? 'is-key' : '' }, g).textContent = String(tk[0]);
      });
      var cur = mk('line', { y1: T - 4, y2: yb, stroke: 'var(--lwi-ink)', 'stroke-opacity': .35 }, g);
      var dB = mk('circle', { r: 4, fill: 'var(--lwi-base)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      var dO = mk('circle', { r: 5, fill: 'var(--lwi-ours)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      var knob = mk('circle', { cy: yt, r: 7, fill: 'var(--lwi-ink)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      G = { X: X, Y: Y, L: L, R: R, W: W, cur: cur, dB: dB, dO: dO, knob: knob, fill: fill };
    }

    /* ---------- one step drives everything.  The status line holds only the two step counts and, at the four steps the paper
       names (Sec. 4.6), the paper's own event; nothing else is described. */
    var EVENTS = {};
    function events() {
      var mo = D.moments;
      EVENTS[mo.veto] = 'The veto fires';
      EVENTS[mo.ours_arrives] = 'Ours reaches the armour';
      EVENTS[mo.base_leaves] = 'Base leaves';
      EVENTS[mo.base_arrives] = 'Base arrives';
    }
    function set(st) {
      if (!D) return;
      s = Math.max(0, Math.min(S, Math.round(st)));
      ['base', 'ours'].forEach(function (r) {
        var c = cams[r];
        c.step.textContent = s >= c.T ? 'arrived, step ' + c.T : 'step ' + s;
        paint(c);
      });
      var al = s >= D.alarm_stretch[0] && s <= D.alarm_stretch[1];
      cams.ours.frame.classList.toggle('is-alarm', al);
      if (G) {
        var x = G.X(s);
        G.cur.setAttribute('x1', x); G.cur.setAttribute('x2', x); G.knob.setAttribute('cx', x); G.fill.setAttribute('x2', x);
        G.dO.style.display = s < D.ours.T ? '' : 'none'; G.dB.style.display = s < D.base.T ? '' : 'none';
        if (s < D.ours.T) { G.dO.setAttribute('cx', x); G.dO.setAttribute('cy', G.Y(D.ours.doubt[s])); }
        if (s < D.base.T) { G.dB.setAttribute('cx', x); G.dB.setAttribute('cy', G.Y(D.base.entropy[s])); }
      }
      if (M) updateMap();
      Array.prototype.forEach.call(moments, function (m) { m.setAttribute('aria-pressed', +m.getAttribute('data-s') === s ? 'true' : 'false'); });
      var counts = 'Base: step ' + Math.min(s, D.base.T) + ' \u00b7 Ours: step ' + Math.min(s, D.ours.T), ev = EVENTS[s];
      stateEl.textContent = counts;
      if (ev) { stateEl.appendChild(document.createTextNode(' \u00b7 ')); var b = document.createElement('b'); b.textContent = ev; stateEl.appendChild(b); }
      chart.setAttribute('aria-valuenow', s);
      chart.setAttribute('aria-valuetext', 'step ' + s + (ev ? ', ' + ev : ''));
    }
    var settleT = null;
    function settle() {                                         // full frames once the step stops moving
      clearTimeout(settleT);
      settleT = setTimeout(function () { ['ours', 'base'].forEach(function (r) { needFull(cams[r], idxOf(cams[r], s), true); }); }, 90);
    }

    /* ---------- play */
    var timer = null, playing = false;
    // playing through fetches the full frames ahead only on a fast connection; otherwise it runs on the preview sheets
    var nc = navigator.connection, rich = !(nc && (nc.saveData || /(^|-)(2g|3g)$/.test(nc.effectiveType || '')));
    function halt() { if (timer) clearTimeout(timer); timer = null; playing = false; btnPlay.textContent = 'Play'; }
    function play() {
      if (s >= S) set(0);
      playing = true; btnPlay.textContent = 'Pause';
      (function tick() {
        var mo = D.moments, ms = 80;
        if (s >= 20 && s < mo.veto) ms = 250;                     // the approach to the veto at a quarter speed, as the clip
        if (s === mo.veto) ms = 1500;
        if (s === mo.ours_arrives || s === mo.base_leaves) ms = 900;
        if (rich) for (var a = 1; a <= 8; a++) ['ours', 'base'].forEach(function (r) { needFull(cams[r], idxOf(cams[r], Math.min(S, s + a)), a < 3); });
        timer = setTimeout(function () {
          if (s >= S) { halt(); btnPlay.textContent = 'Replay'; settle(); return; }
          set(s + 1); tick();
        }, ms);
      })();
    }
    btnPlay.addEventListener('click', function () { wake(); if (playing) { halt(); settle(); } else play(); });
    Array.prototype.forEach.call(moments, function (m) {
      m.addEventListener('click', function () { halt(); set(+m.getAttribute('data-s')); settle(); });
    });

    /* ---------- dragging and keys on the readout (the time axis) */
    function stepAt(ev) {
      var r = chart.getBoundingClientRect();
      return G ? (ev.clientX - r.left - G.L) / (G.W - G.L - G.R) * S : s;
    }
    var drag = false, pend = null;
    function grab(ev) {
      drag = true; pend = null; halt();
      try { chart.setPointerCapture(ev.pointerId); } catch (e) {}
      set(stepAt(ev));
    }
    chart.addEventListener('pointerdown', function (ev) {
      if (!D) return;
      if (ev.pointerType === 'touch') pend = { x: ev.clientX, y: ev.clientY }; else grab(ev);
    });
    chart.addEventListener('pointermove', function (ev) {
      if (pend && Math.abs(ev.clientX - pend.x) > 6 && Math.abs(ev.clientX - pend.x) > Math.abs(ev.clientY - pend.y)) grab(ev);
      else if (drag) set(stepAt(ev));
    });
    chart.addEventListener('pointerup', function (ev) { if (pend) grab(ev); if (drag) settle(); drag = false; pend = null; });
    ['pointercancel', 'lostpointercapture'].forEach(function (e) {
      chart.addEventListener(e, function () { if (drag) settle(); drag = false; pend = null; });
    });
    chart.addEventListener('keydown', function (ev) {
      if (!D) return;
      var k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[ev.key];
      if (ev.key === 'Home') k = -S; if (ev.key === 'End') k = S;
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); btnPlay.click(); return; }
      if (k === undefined) return;
      ev.preventDefault(); halt(); set(s + k); settle();
    });

    /* ---------- lifecycle */
    function load() {
      fetch(base + 'veto.json').then(function (r) { return r.json(); }).then(function (d) {
        D = d; S = d.moments.base_arrives; cams.base.T = d.base.T; cams.ours.T = d.ours.T;
        s = OPEN;                                                  // opens on the paper figure's views, seven steps before ours arrives
        chart.setAttribute('aria-valuemax', S);
        events(); drawMap(); layout(); set(s);
        ['ours', 'base'].forEach(function (r) {                  // the step shown first, then the named steps
          var c = cams[r];
          [s, 0, d.moments.veto, d.moments.ours_arrives, d.moments.base_leaves, S].forEach(function (st, q) { needFull(c, idxOf(c, st), q === 0); });
        });
        if (woken) loadSheets();
      });
    }
    // the preview sheets (for smooth dragging) load once the reader reaches for the component
    function wake() {
      if (woken) return;
      woken = true;
      if (D) loadSheets();
    }
    ['pointerenter', 'pointerdown', 'focusin', 'touchstart'].forEach(function (e) { root.addEventListener(e, wake, { passive: true }); });
    if ('IntersectionObserver' in window) {
      var near = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { near.disconnect(); load(); }
      }, { rootMargin: '500px 0px' });
      near.observe(root);
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting && playing) halt(); }); }).observe(root);
    } else load();
    function relayout() { layout(); if (D) { cams.base.shown = cams.ours.shown = ''; set(s); } }
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(chart); else window.addEventListener('resize', relayout);
  }

  function boot() { Array.prototype.forEach.call(document.querySelectorAll('.lwi-veto'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
