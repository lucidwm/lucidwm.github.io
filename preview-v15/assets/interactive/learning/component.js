/* LucidWM v15: six checkpoints as the "Step through" view of the learning frame.
   Fork of v14/interactive/learning/component.js.  Changes: the checkpoint switch lives in the frame's control row (with Play,
   one checkpoint a second, as the clip's dot); the model's 64 px frames are drawn at a whole number of device pixels per model
   pixel (k = floor(room x dpr / 64); canvas 64k, CSS 64k / dpr); t = 24 marked by one sand band down its column. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', UMAX = 0.23;
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { if (String(attrs[k]).indexOf('var(') === 0) e.style.setProperty(k, attrs[k]); else e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, cls, parent, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; }
  function kLabel(v) { return Math.round(v / 1000) + 'k'; }

  function init(root, io) {
    io = io || {};
    var base = root.getAttribute('data-base');
    var bar = io.ckpts, btnPlay = io.play;
    var grid = root.querySelector('.lt__tiles'), plot = root.querySelector('.lt__plot'), svg = plot.querySelector('svg'), tbody = root.querySelector('.lt__means tbody');
    var D = null, sheet = null, c = 0, want = null, btns = [], cells = null, G = null, loading = null, touched = false, timer = null, playing = false;

    function build() {
      D.ckpt.forEach(function (v, k) {
        var b = h('button', '', bar, kLabel(v));
        b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', kLabel(v) + ' environment steps');
        b.addEventListener('click', function () { halt(); touched = true; set(k); });
        b.addEventListener('keydown', function (ev) {
          var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
          if (ev.key === 'Home') d = -c; if (ev.key === 'End') d = D.ckpt.length - 1 - c;
          if (d === undefined) return;
          ev.preventDefault(); halt(); touched = true; set(Math.max(0, Math.min(D.ckpt.length - 1, c + d))); btns[c].focus();
        });
        btns.push(b);
      });
      h('div', 'h', grid);
      D.t.forEach(function (t, j) {
        var late = j === D.t.length - 1, e = h('div', 'h' + (late ? ' is-late' : ''), grid, 't = ' + t);
        if (late) h('small', '', e, 'never learned');
      });
      cells = {};
      [['real', 'real'], ['imagined', 'imagined'], ['error', 'pixel error']].forEach(function (r) {
        h('div', 'r', grid, r[1]);
        cells[r[0]] = D.t.map(function (t, j) {
          var wrap = h('div', 'c' + (j === D.t.length - 1 ? ' is-late' : ''), grid), cv = h('canvas', r[0] === 'error' ? 'is-map' : '', wrap);
          cv.setAttribute('role', 'img');
          cv.setAttribute('aria-label', (r[0] === 'real' ? 'Real frame' : r[0] === 'imagined' ? 'Imagined frame' : 'Pixel error, dark right, bright wrong') + ' at t = ' + t);
          return cv;
        });
      });
      h('div', 'r', grid, 'doubt');
      cells.doubt = D.t.map(function (t, j) {
        var d = h('div', 'd' + (j === D.t.length - 1 ? ' is-late' : ''), grid), span = h('span', '', d), i = h('i', '', d);
        return { span: span, b: h('b', '', i) };
      });
      var P = D.printed;
      [['doubt', 'var(--lwi-ours)', P.doubt_mean[0], P.doubt_mean[1]], ['entropy', 'var(--lwi-base)', P.entropy_mean[0], P.entropy_mean[1]],
       ['error', 'var(--lwi-ink)', '—', P.error_mean_fold + '-fold lower']].forEach(function (r) {
        var tr = h('tr', '', tbody), td = h('td', '', tr), key = h('i', '', td);
        key.style.borderTopColor = r[1];
        td.appendChild(document.createTextNode(r[0]));
        h('td', r[2] === '—' ? 'dim' : '', tr, r[2]).setAttribute('data-c', '0');
        h('td', '', tr, r[3]).setAttribute('data-c', String(D.ckpt.length - 1));
      });
    }

    /* whole device pixels per model pixel */
    var tilePx = 64, dprNow = 1;
    function sizeTiles() {
      var dpr = window.devicePixelRatio || 1, W = grid.clientWidth || grid.parentNode.clientWidth;
      var cs = getComputedStyle(grid), lab = parseFloat(cs.getPropertyValue('--lab')) || 64, gap = parseFloat(cs.columnGap) || 8;
      var room = (W - lab - 4 * gap) / 4, cap = parseFloat(cs.getPropertyValue('--tile-max')) || 1e9;
      room = Math.min(room, cap);
      var k = Math.max(1, Math.floor(room * dpr / 64));
      tilePx = 64 * k; dprNow = dpr;
      grid.style.setProperty('--tile', (tilePx / dpr) + 'px');
      root.setAttribute('data-k', k + ' device px per model px');
    }
    function tile(cv, row, j) {
      if (!sheet) return;
      if (cv.width !== tilePx) { cv.width = cv.height = tilePx; }
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, j * 64, row * 64, 64, 64, 0, 0, tilePx, tilePx);
    }
    function drawTiles() {
      var n = D.ckpt.length;
      D.t.forEach(function (t, j) { tile(cells.real[j], 0, j); tile(cells.imagined[j], 1 + c, j); tile(cells.error[j], 1 + n + c, j); });
    }

    function layout() {
      var W = plot.clientWidth, H = plot.clientHeight;
      if (!W || !H || !D) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var L = 40, R = 70, T = 10, B = 26, ymax = 1.35, n = D.ckpt.length;
      var x0 = D.ckpt[0], x1 = D.ckpt[n - 1];
      var X = function (v) { return L + (W - L - R) * (v - x0) / (x1 - x0); };
      var Y = function (v) { return T + (ymax - v) / ymax * (H - T - B); };
      var g = mk('g', {}, svg);
      [[0, '0'], [0.5, '50%'], [1, '100%']].forEach(function (q) {
        mk('line', { x1: L, x2: W - R, y1: Y(q[0]), y2: Y(q[0]), stroke: 'var(--lwi-hair)', 'stroke-width': 1 }, g);
        mk('text', { x: L - 8, y: Y(q[0]) + 4, 'text-anchor': 'end' }, g).textContent = q[1];
      });
      [0, 2, n - 1].forEach(function (k) { mk('text', { x: X(D.ckpt[k]), y: H - 6, 'text-anchor': 'middle' }, g).textContent = kLabel(D.ckpt[k]); });
      var sel = mk('line', { y1: T, y2: H - B, stroke: 'var(--lwi-ink)', 'stroke-opacity': .3, 'stroke-width': 1 }, g);
      var series = [['entropy', 'var(--lwi-base)', 1.75, 'is-base'], ['error', 'var(--lwi-ink)', 1.75, ''], ['doubt', 'var(--lwi-ours)', 2.5, 'is-ours']];
      var big = {}, ends = [];
      series.forEach(function (sr) {
        var v = D.rel[sr[0]];
        mk('path', { d: v.map(function (y, k) { return (k ? 'L' : 'M') + X(D.ckpt[k]).toFixed(1) + ',' + Y(y).toFixed(1); }).join(''),
                     fill: 'none', stroke: sr[1], 'stroke-width': sr[2], 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
        v.forEach(function (y, k) { mk('circle', { cx: X(D.ckpt[k]), cy: Y(y), r: 3, fill: sr[1] }, g); });
        big[sr[0]] = mk('circle', { r: 5.5, fill: sr[1], stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
        ends.push({ name: sr[0], cls: sr[3], y: Y(v[n - 1]) });
      });
      ends.sort(function (a, b) { return a.y - b.y; });
      for (var q = 1; q < ends.length; q++) if (ends[q].y - ends[q - 1].y < 16) ends[q].y = ends[q - 1].y + 16;
      ends.forEach(function (e) { mk('text', { x: W - R + 10, y: e.y + 5, 'class': 'is-name ' + e.cls }, g).textContent = e.name; });
      G = { X: X, Y: Y, sel: sel, big: big };
    }

    function set(k) {
      if (!D) { want = k; return; }
      c = Math.max(0, Math.min(D.ckpt.length - 1, k));
      btns.forEach(function (b, q) { b.setAttribute('aria-checked', q === c ? 'true' : 'false'); b.tabIndex = q === c ? 0 : -1; });
      if (sheet) drawTiles();
      D.doubt_printed[c].forEach(function (v, j) { cells.doubt[j].span.textContent = v; cells.doubt[j].b.style.width = Math.min(100, 100 * parseFloat(v) / UMAX) + '%'; });
      if (G) {
        var x = G.X(D.ckpt[c]);
        G.sel.setAttribute('x1', x); G.sel.setAttribute('x2', x);
        Object.keys(G.big).forEach(function (s) { G.big[s].setAttribute('cx', x); G.big[s].setAttribute('cy', G.Y(D.rel[s][c])); });
      }
      Array.prototype.forEach.call(root.querySelectorAll('.lt__means [data-c]'), function (e) { e.classList.toggle('is-on', +e.getAttribute('data-c') === c); });
    }
    function label() { if (btnPlay) btnPlay.textContent = playing ? 'Pause' : 'Play'; }
    function halt() { if (timer) clearTimeout(timer); timer = null; playing = false; label(); }
    function play() {
      if (!D) return;
      touched = true;
      if (c >= D.ckpt.length - 1) set(0);
      playing = true; label();
      (function tick() { timer = setTimeout(function () { if (c >= D.ckpt.length - 1) { halt(); return; } set(c + 1); tick(); }, 1000); })();
    }
    if (btnPlay) btnPlay.addEventListener('click', function () { if (playing) halt(); else play(); });

    function pick(ev) {
      if (!G) return;
      var r = plot.getBoundingClientRect(), x = ev.clientX - r.left, best = 0;
      D.ckpt.forEach(function (v, k) { if (Math.abs(G.X(v) - x) < Math.abs(G.X(D.ckpt[best]) - x)) best = k; });
      if (best !== c) { touched = true; set(best); }
    }
    var drag = false;
    plot.addEventListener('pointerdown', function (ev) { if (!D) return; halt(); if (ev.pointerType !== 'touch') { drag = true; try { plot.setPointerCapture(ev.pointerId); } catch (e) {} } pick(ev); });
    plot.addEventListener('pointermove', function (ev) { if (drag) pick(ev); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (e) { plot.addEventListener(e, function () { drag = false; }); });

    function load() {
      if (loading) return loading;
      loading = fetch(base + 'learning.json').then(function (r) { return r.json(); }).then(function (d) {
        D = d; build(); sizeTiles(); layout(); set(want === null ? 0 : want); label();
        return new Promise(function (res) {
          var im = new Image();
          im.onload = function () { sheet = im; drawTiles(); res(); };
          im.onerror = res;
          im.src = base + 'tiles.webp';
        });
      });
      return loading;
    }
    function relayout() { if (!D) return; sizeTiles(); layout(); if (sheet) drawTiles(); set(c); }
    if ('ResizeObserver' in window) { new ResizeObserver(relayout).observe(plot); new ResizeObserver(relayout).observe(grid.parentNode); }
    if (window.matchMedia) { try { matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)').addEventListener('change', relayout); } catch (e) {} }

    return {
      load: load, halt: halt, play: play, playing: function () { return playing; },
      set: function (k) { set(k); }, get: function () { return D ? c : want; },
      touched: function () { return touched; }, untouch: function () { touched = false; },
      tile: function () { return { cssPx: tilePx / dprNow, devicePx: tilePx, k: tilePx / 64, dpr: dprNow }; }
    };
  }
  window.LWI_LEARN = init;
})();
