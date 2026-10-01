/* LucidWM v15: the fall scrubber as the "Step through" view of the fall frame.
   Fork of v14/interactive/fall/component.js.  Changes: no self-start and no autoplay (the clip is the moving view); API for the
   frame; Play and the status line live in the frame's control row; curve names in their curve's colour, the fall in the
   clip's orange (#E08A1E); label sizes closer to the clip's. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', MINUS = '−';
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { if (String(attrs[k]).indexOf('var(') === 0) e.style.setProperty(k, attrs[k]); else e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  function signed(v) { return v > 0 ? '+' + v : v < 0 ? MINUS + (-v) : '0'; }

  function init(root, io) {
    io = io || {};
    var base = root.getAttribute('data-base');
    var view = root.querySelector('.ft__view'), cv = view.querySelector('canvas'), ctx = cv.getContext('2d');
    var bar = root.querySelector('.ft__load');
    var chart = root.querySelector('.ft__chart'), svg = chart.querySelector('svg');
    var btn = io.play, stateEl = io.state;
    var D = null, n = 0, i = -1, want = null, imgs = [], loaded = 0, shown = -1, loading = null, touched = false;
    var G = null, timer = null, playing = false;

    function load() {
      if (loading) return loading;
      loading = fetch(base + 'fall.json').then(function (r) { return r.json(); }).then(function (d) {
        D = d; n = d.t.length;
        chart.setAttribute('aria-valuemin', d.t[0]); chart.setAttribute('aria-valuemax', d.t[n - 1]);
        var i0 = want === null ? d.t.indexOf(d.alarm_from) : want;
        layout(); set(i0);
        var order = [i0];
        for (var k = 0; k < n; k++) if (k !== i0) order.push(k);
        order.forEach(function (k) {
          var im = new Image(); im.decoding = 'async';
          im.onload = function () { loaded++; bar.style.width = (100 * loaded / n) + '%'; if (loaded === n) bar.classList.add('is-done'); if (shown !== i) paint(); };
          im.onerror = function () { loaded++; };
          im.src = base + 'frames/f' + (k < 10 ? '0' : '') + k + '.webp';
          imgs[k] = im;
        });
      });
      return loading;
    }

    function sizeCanvas() { var r = window.devicePixelRatio || 1, w = Math.round(view.clientWidth * r); if (w && cv.width !== w) { cv.width = w; cv.height = w; shown = -1; } }
    function paint() {
      sizeCanvas();
      var k = i;
      if (!(imgs[k] && imgs[k].complete && imgs[k].naturalWidth)) {
        for (var d = 1; d < n; d++) {
          if (imgs[k - d] && imgs[k - d].complete && imgs[k - d].naturalWidth) { k = k - d; break; }
          if (imgs[k + d] && imgs[k + d].complete && imgs[k + d].naturalWidth) { k = k + d; break; }
        }
      }
      if (!(imgs[k] && imgs[k].complete && imgs[k].naturalWidth) || k === shown) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgs[k], 0, 0, cv.width, cv.height);
      shown = k;
    }

    function layout() {
      var W = chart.clientWidth, H = chart.clientHeight;
      if (!W || !H || !D) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var L = 4, R = 92, T = 30, B = 50, gap = 22;
      var yd = D.ylim_doubt, ye = D.ylim_entropy, span = (yd[1] - yd[0]) + (ye[1] - ye[0]);
      var k = (H - T - B - gap) / span;
      var top = { y0: T, lo: yd[0], hi: yd[1] }, bot = { y0: T + (yd[1] - yd[0]) * k + gap, lo: ye[0], hi: ye[1] };
      var X = function (j) { return L + (W - L - R) * j / (n - 1); };
      var Y = function (b, v) { return b.y0 + (b.hi - v) * k; };
      var xr = W - R, yb = bot.y0 + (ye[1] - ye[0]) * k, g = mk('g', {}, svg);
      var j0 = D.alarm_fill.indexOf(1);
      if (j0 > 0) {
        var a = D.doubt[j0 - 1], b = D.doubt[j0], xc = X(j0 - 1) + (X(j0) - X(j0 - 1)) * (1 - a) / (b - a);
        var p = 'M' + xc.toFixed(1) + ',' + Y(top, 1).toFixed(1), j1 = j0;
        for (var j = j0; j < n && D.alarm_fill[j]; j++) { p += 'L' + X(j).toFixed(1) + ',' + Y(top, D.doubt[j]).toFixed(1); j1 = j; }
        p += 'L' + X(j1).toFixed(1) + ',' + Y(top, 1).toFixed(1) + 'Z';
        mk('path', { d: p, fill: 'var(--lwi-alarm)', 'fill-opacity': 'var(--lwi-wash)' }, g);
      }
      [top, bot].forEach(function (bd, q) {
        mk('line', { x1: L, x2: xr, y1: Y(bd, 1), y2: Y(bd, 1), stroke: 'var(--lwi-ink)', 'stroke-opacity': .6, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, g);
        mk('text', { x: xr + 10, y: Y(bd, 1) + 4, 'class': 'is-line' }, g).textContent = 'alarm line';
      });
      var xf = X(D.t.indexOf(0));
      mk('line', { x1: xf, x2: xf, y1: T - 6, y2: yb, stroke: 'var(--lwi-event)', 'stroke-width': 2 }, g);
      mk('text', { x: xf, y: T - 12, 'text-anchor': 'middle', 'class': 'is-event' }, g).textContent = 'fall';
      var path = function (arr, bd) { return arr.map(function (v, j) { return (j ? 'L' : 'M') + X(j).toFixed(1) + ',' + Y(bd, Math.max(bd.lo, Math.min(bd.hi, v))).toFixed(1); }).join(''); };
      mk('path', { d: path(D.entropy, bot), fill: 'none', stroke: 'var(--lwi-base)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      mk('path', { d: path(D.doubt, top), fill: 'none', stroke: 'var(--lwi-ours)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      var yEndD = Y(top, D.doubt[n - 1]), yEndE = Y(bot, D.entropy[n - 1]);
      if (Math.abs(yEndD - Y(top, 1)) < 18) yEndD = Y(top, 1) - 18;
      if (Math.abs(yEndE - Y(bot, 1)) < 18) yEndE = Y(bot, 1) + 18;
      mk('text', { x: xr + 10, y: yEndD + 5, 'class': 'is-name is-ours' }, g).textContent = 'doubt';
      mk('text', { x: xr + 10, y: yEndE + 5, 'class': 'is-name is-base' }, g).textContent = 'entropy';
      var jc = D.t.indexOf(D.first_cross), xc8 = X(jc), yc8 = Y(top, D.doubt[jc]);
      mk('circle', { cx: xc8, cy: yc8, r: 4.5, fill: 'var(--lwi-bg)', stroke: 'var(--lwi-ink)', 'stroke-width': 1.5 }, g);
      var cl = mk('text', { x: xc8 - 8, y: Y(top, 1) - 10, 'text-anchor': 'end' }, g); cl.textContent = 'crosses its line';
      if (cl.getComputedTextLength && xc8 - 8 - cl.getComputedTextLength() < 0) { cl.setAttribute('x', xc8 + 10); cl.setAttribute('y', Y(top, 1) + 18); cl.setAttribute('text-anchor', 'start'); }
      var yt = H - 28;
      mk('line', { x1: L, x2: xr, y1: yt, y2: yt, stroke: 'var(--lwi-hair)', 'stroke-width': 2 }, g);
      var fill = mk('line', { x1: L, x2: L, y1: yt, y2: yt, stroke: 'var(--lwi-ink)', 'stroke-width': 2 }, g);
      var ja = D.t.indexOf(D.alarm_from);
      mk('line', { x1: xc8, x2: xc8, y1: yt - 4, y2: yt + 4, stroke: 'var(--lwi-ink)', 'stroke-opacity': .5, 'stroke-width': 1 }, g);
      mk('line', { x1: X(ja), x2: X(ja), y1: yt - 5, y2: yt + 5, stroke: 'var(--lwi-alarm)', 'stroke-width': 2 }, g);
      mk('line', { x1: xf, x2: xf, y1: yt - 5, y2: yt + 5, stroke: 'var(--lwi-event)', 'stroke-width': 2 }, g);
      for (var s = -15; s <= 15; s += 5) { var js = D.t.indexOf(s); if (js >= 0) mk('text', { x: X(js), y: H - 4, 'text-anchor': 'middle' }, g).textContent = signed(s); }
      var cur = mk('line', { y1: T - 2, y2: yb, stroke: 'var(--lwi-ink)', 'stroke-opacity': .35, 'stroke-width': 1 }, g);
      var dotE = mk('circle', { r: 4, fill: 'var(--lwi-base)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      var dotD = mk('circle', { r: 5, fill: 'var(--lwi-ours)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      var knob = mk('circle', { cy: yt, r: 7, fill: 'var(--lwi-ink)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      G = { X: X, Y: Y, top: top, bot: bot, cur: cur, dotD: dotD, dotE: dotE, knob: knob, fill: fill, L: L, R: R, W: W };
    }

    function label() { if (btn) btn.textContent = playing ? 'Pause' : (D && i >= n - 1) ? 'Replay' : 'Play'; }
    function set(k) {
      if (!D) { want = k; return; }
      i = Math.max(0, Math.min(n - 1, k));
      var t = D.t[i];
      if (G) {
        var x = G.X(i);
        G.cur.setAttribute('x1', x); G.cur.setAttribute('x2', x);
        G.dotD.setAttribute('cx', x); G.dotD.setAttribute('cy', G.Y(G.top, Math.max(G.top.lo, Math.min(G.top.hi, D.doubt[i]))));
        G.dotE.setAttribute('cx', x); G.dotE.setAttribute('cy', G.Y(G.bot, Math.max(G.bot.lo, Math.min(G.bot.hi, D.entropy[i]))));
        G.knob.setAttribute('cx', x); G.fill.setAttribute('x2', x);
      }
      view.classList.toggle('is-alarm', !!D.alarm[i]);
      var when = t < 0 ? (-t) + (t === -1 ? ' step' : ' steps') + ' before the fall' : t === 0 ? 'The fall begins' : t + (t === 1 ? ' step' : ' steps') + ' into the fall';
      if (stateEl) stateEl.innerHTML = '<b>' + when + '</b> · doubt ' + (D.doubt_above[i] ? 'above' : 'below') + ' its alarm line · entropy ' + (D.entropy_above[i] ? 'above' : 'below') + ' its alarm line';
      chart.setAttribute('aria-valuenow', t);
      chart.setAttribute('aria-valuetext', when + '; doubt ' + (D.doubt_above[i] ? 'above' : 'below') + ' its alarm line');
      paint(); label();
    }
    function stop() { if (timer) clearTimeout(timer); timer = null; playing = false; label(); }
    function play() {
      if (!D) return;
      touched = true;
      if (i >= n - 1) set(0);
      playing = true; label();
      (function tick() {
        var t = D.t[i], ms = (t >= -3 && t <= 3) ? 200 : 100;
        timer = setTimeout(function () { if (i >= n - 1) { stop(); return; } set(i + 1); tick(); }, ms);
      })();
    }
    if (btn) btn.addEventListener('click', function () { if (playing) stop(); else play(); });

    function idxAt(ev) { var r = chart.getBoundingClientRect(), x = ev.clientX - r.left; return G ? Math.round((x - G.L) / (G.W - G.L - G.R) * (n - 1)) : i; }
    var drag = false, pend = null;
    function grab(ev) { drag = true; pend = null; touched = true; if (playing) stop(); try { chart.setPointerCapture(ev.pointerId); } catch (e) {} set(idxAt(ev)); }
    chart.addEventListener('pointerdown', function (ev) { if (!D) return; if (ev.pointerType === 'touch') pend = { x: ev.clientX, y: ev.clientY }; else grab(ev); });
    chart.addEventListener('pointermove', function (ev) {
      if (pend && Math.abs(ev.clientX - pend.x) > 6 && Math.abs(ev.clientX - pend.x) > Math.abs(ev.clientY - pend.y)) grab(ev);
      else if (drag) set(idxAt(ev));
    });
    chart.addEventListener('pointerup', function (ev) { if (pend) grab(ev); drag = false; pend = null; });
    ['pointercancel', 'lostpointercapture'].forEach(function (e) { chart.addEventListener(e, function () { drag = false; pend = null; }); });
    chart.addEventListener('keydown', function (ev) {
      if (!D) return;
      var k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[ev.key];
      if (ev.key === 'Home') k = -n; if (ev.key === 'End') k = n;
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); btn.click(); return; }
      if (k === undefined) return;
      ev.preventDefault(); touched = true; if (playing) stop(); set(i + k);
    });
    if ('ResizeObserver' in window) new ResizeObserver(function () { layout(); if (D) { shown = -1; set(i); } }).observe(chart);

    return {
      load: load, halt: stop, play: play, playing: function () { return playing; },
      set: function (k) { set(k); }, get: function () { return D ? i : want; }, n: function () { return n; },
      touched: function () { return touched; }, untouch: function () { touched = false; }
    };
  }
  window.LWI_FALL = init;
})();
