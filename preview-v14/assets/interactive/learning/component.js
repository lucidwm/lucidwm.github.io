/* LucidWM interactive: one imagined future at six checkpoints.  Plain JS, no dependencies.  Tiles come from one lossless sheet
   (rows: real, imagined at each checkpoint, pixel error at each checkpoint; columns t = 1, 8, 12, 24).  The only numbers printed are
   the paper's: the doubt values of Fig. 18 and the App. F.7 means at 48k and 180k; the trend is drawn relative to 48k, unlabelled. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', UMAX = 0.23;   // doubt bar scale of the paper's Fig. 18

  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {                                   // token colours go through style, where var() is valid everywhere
      if (String(attrs[k]).indexOf('var(') === 0) e.style.setProperty(k, attrs[k]); else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function kLabel(v) { return Math.round(v / 1000) + 'k'; }

  function init(root) {
    var base = root.getAttribute('data-base') || 'learning/data/';
    var bar = root.querySelector('.lwi-learn__ckpts'), grid = root.querySelector('.lwi-learn__tiles');
    var plot = root.querySelector('.lwi-learn__plot'), svg = plot.querySelector('svg'), tbody = root.querySelector('.lwi-learn__means tbody');
    var D = null, sheet = null, c = 0, btns = [], cells = null, G = null;

    function build() {
      D.ckpt.forEach(function (v, k) {
        var b = h('button', '', bar, kLabel(v));
        b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', kLabel(v) + ' environment steps');
        b.addEventListener('click', function () { set(k); });
        b.addEventListener('keydown', function (ev) {
          var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
          if (ev.key === 'Home') d = -c; if (ev.key === 'End') d = D.ckpt.length - 1 - c;
          if (d === undefined) return;
          ev.preventDefault(); set(Math.max(0, Math.min(D.ckpt.length - 1, c + d))); btns[c].focus();
        });
        btns.push(b);
      });
      // tiles
      h('div', 'h', grid);
      D.t.forEach(function (t, j) {
        var e = h('div', 'h' + (j === D.t.length - 1 ? ' is-late' : ''), grid, 't = ' + t);
        if (j === D.t.length - 1) h('small', '', e, 'never learned');
      });
      cells = {};
      [['real', 'real'], ['imagined', 'imagined'], ['error', 'pixel error']].forEach(function (r) {
        h('div', 'r', grid, r[1]);
        cells[r[0]] = D.t.map(function (t) {
          var cv = h('canvas', r[0] === 'error' ? 'is-map' : '', grid);
          cv.width = cv.height = D.tiles.px;
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
      // means printed in the paper (App. F.7), 48k and 180k only
      var P = D.printed;
      [['doubt', 'var(--lwi-ours)', P.doubt_mean[0], P.doubt_mean[1]], ['entropy', 'var(--lwi-base)', P.entropy_mean[0], P.entropy_mean[1]],
       ['error', 'var(--lwi-ink)', '—', P.error_mean_fold + '-fold lower']].forEach(function (r) {
        var tr = h('tr', '', tbody), td = h('td', '', tr);
        var key = h('i', '', td); key.style.borderTopColor = r[1];
        td.appendChild(document.createTextNode(r[0]));
        h('td', r[2] === '—' ? 'dim' : '', tr, r[2]).setAttribute('data-c', '0');
        h('td', '', tr, r[3]).setAttribute('data-c', String(D.ckpt.length - 1));
      });
    }

    function tile(cv, row, j) {
      if (!sheet) return;
      var px = D.tiles.px, ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, j * px, row * px, px, px, 0, 0, px, px);
    }
    function drawTiles() {
      var n = D.ckpt.length;
      D.t.forEach(function (t, j) {
        tile(cells.real[j], 0, j);
        tile(cells.imagined[j], 1 + c, j);
        tile(cells.error[j], 1 + n + c, j);
      });
    }

    function layout() {
      var W = plot.clientWidth, H = plot.clientHeight;
      if (!W || !H || !D) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var L = 40, R = 64, T = 10, B = 26, ymax = 1.35, n = D.ckpt.length;
      var x0 = D.ckpt[0], x1 = D.ckpt[n - 1];
      var X = function (v) { return L + (W - L - R) * (v - x0) / (x1 - x0); };
      var Y = function (v) { return T + (ymax - v) / ymax * (H - T - B); };
      var g = mk('g', {}, svg);
      [[0, '0'], [0.5, '50%'], [1, '100%']].forEach(function (q) {
        mk('line', { x1: L, x2: W - R, y1: Y(q[0]), y2: Y(q[0]), stroke: 'var(--lwi-hair)', 'stroke-width': 1 }, g);
        mk('text', { x: L - 8, y: Y(q[0]) + 4, 'text-anchor': 'end' }, g).textContent = q[1];
      });
      [0, 2, n - 1].forEach(function (k) {
        mk('text', { x: X(D.ckpt[k]), y: H - 6, 'text-anchor': 'middle' }, g).textContent = kLabel(D.ckpt[k]);
      });
      var sel = mk('line', { y1: T, y2: H - B, stroke: 'var(--lwi-ink)', 'stroke-opacity': .3, 'stroke-width': 1 }, g);
      var series = [['entropy', 'var(--lwi-base)', 1.75], ['error', 'var(--lwi-ink)', 1.75], ['doubt', 'var(--lwi-ours)', 2.5]];
      var big = {}, ends = [];
      series.forEach(function (sr) {
        var v = D.rel[sr[0]];
        mk('path', { d: v.map(function (y, k) { return (k ? 'L' : 'M') + X(D.ckpt[k]).toFixed(1) + ',' + Y(y).toFixed(1); }).join(''),
                     fill: 'none', stroke: sr[1], 'stroke-width': sr[2], 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
        v.forEach(function (y, k) { mk('circle', { cx: X(D.ckpt[k]), cy: Y(y), r: 3, fill: sr[1] }, g); });
        big[sr[0]] = mk('circle', { r: 5.5, fill: sr[1], stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
        ends.push({ name: sr[0], y: Y(v[n - 1]) });
      });
      ends.sort(function (a, b) { return a.y - b.y; });
      for (var q = 1; q < ends.length; q++) if (ends[q].y - ends[q - 1].y < 15) ends[q].y = ends[q - 1].y + 15;
      ends.forEach(function (e) { mk('text', { x: W - R + 10, y: e.y + 4, 'class': 'is-name' }, g).textContent = e.name; });
      G = { X: X, Y: Y, sel: sel, big: big, L: L, R: R, W: W };
    }

    function set(k) {
      c = k;
      btns.forEach(function (b, q) { b.setAttribute('aria-checked', q === c ? 'true' : 'false'); b.tabIndex = q === c ? 0 : -1; });
      if (sheet) drawTiles();
      D.doubt_printed[c].forEach(function (v, j) {
        cells.doubt[j].span.textContent = v;
        cells.doubt[j].b.style.width = Math.min(100, 100 * parseFloat(v) / UMAX) + '%';
      });
      if (G) {
        var x = G.X(D.ckpt[c]);
        G.sel.setAttribute('x1', x); G.sel.setAttribute('x2', x);
        Object.keys(G.big).forEach(function (s) { G.big[s].setAttribute('cx', x); G.big[s].setAttribute('cy', G.Y(D.rel[s][c])); });
      }
      Array.prototype.forEach.call(root.querySelectorAll('.lwi-learn__means [data-c]'), function (e) {
        e.classList.toggle('is-on', +e.getAttribute('data-c') === c);
      });
    }

    // pick a checkpoint on the trend: click, or drag across it
    function pick(ev) {
      if (!G) return;
      var r = plot.getBoundingClientRect(), x = ev.clientX - r.left, best = 0;
      D.ckpt.forEach(function (v, k) { if (Math.abs(G.X(v) - x) < Math.abs(G.X(D.ckpt[best]) - x)) best = k; });
      if (best !== c) set(best);
    }
    var drag = false;
    plot.addEventListener('pointerdown', function (ev) {
      if (!D) return;
      if (ev.pointerType !== 'touch') { drag = true; try { plot.setPointerCapture(ev.pointerId); } catch (e) {} }
      pick(ev);
    });
    plot.addEventListener('pointermove', function (ev) { if (drag) pick(ev); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (e) { plot.addEventListener(e, function () { drag = false; }); });

    function load() {
      fetch(base + 'learning.json').then(function (r) { return r.json(); }).then(function (d) {
        D = d; build(); layout(); set(0);
        var im = new Image();
        im.onload = function () { sheet = im; drawTiles(); };
        im.src = base + 'tiles.webp';
      });
    }
    if ('IntersectionObserver' in window) {
      var near = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { near.disconnect(); load(); }
      }, { rootMargin: '600px 0px' });
      near.observe(root);
    } else load();
    function relayout() { layout(); if (D) set(c); }
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(plot); else window.addEventListener('resize', relayout);
  }

  function boot() { Array.prototype.forEach.call(document.querySelectorAll('.lwi-learn'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
