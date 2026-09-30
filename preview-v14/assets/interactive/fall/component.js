/* LucidWM interactive: the fall scrubber.  Plain JS, no dependencies.  Curves are drawn from fall.json (the page clip's data);
   no value is printed, only steps and whether each readout is above or below its own alarm line. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', MINUS = '−';

  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {                                   // token colours go through style, where var() is valid everywhere
      if (String(attrs[k]).indexOf('var(') === 0) e.style.setProperty(k, attrs[k]); else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function signed(v) { return v > 0 ? '+' + v : v < 0 ? MINUS + (-v) : '0'; }

  function init(root) {
    var base = root.getAttribute('data-base') || 'fall/data/';
    var view = root.querySelector('.lwi-fall__view'), cv = view.querySelector('canvas'), ctx = cv.getContext('2d');
    var bar = root.querySelector('.lwi-fall__load');
    var chart = root.querySelector('.lwi-fall__chart'), svg = chart.querySelector('svg');
    var btn = root.querySelector('.lwi-fall__play'), stateEl = root.querySelector('.lwi-fall__state');
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var D = null, n = 0, i = 0, imgs = [], loaded = 0, shown = -1;
    var G = null, timer = null, playing = false, autoDone = false, seen = false;

    /* ---------- loading: on approach, the current frame first */
    function load() {
      fetch(base + 'fall.json').then(function (r) { return r.json(); }).then(function (d) {
        D = d; n = d.t.length;
        i = reduce ? d.t.indexOf(d.alarm_from) : 0;                  // without motion: the step the alarm is raised
        chart.setAttribute('aria-valuemin', d.t[0]); chart.setAttribute('aria-valuemax', d.t[n - 1]);
        layout(); set(i);
        var order = [i];
        for (var k = 0; k < n; k++) if (k !== i) order.push(k);
        order.forEach(function (k) {
          var im = new Image();
          im.decoding = 'async';
          im.onload = function () {
            loaded++; bar.style.width = (100 * loaded / n) + '%';
            if (loaded === n) { bar.classList.add('is-done'); maybeAutoplay(); }
            if (shown !== i) paint();
          };
          im.onerror = function () { loaded++; };
          im.src = base + 'frames/f' + (k < 10 ? '0' : '') + k + '.webp';
          imgs[k] = im;
        });
      });
    }

    /* ---------- the view */
    function sizeCanvas() {
      var r = window.devicePixelRatio || 1, w = Math.round(view.clientWidth * r);
      if (cv.width !== w) { cv.width = w; cv.height = w; shown = -1; }
    }
    function paint() {
      sizeCanvas();
      var k = i;
      if (!(imgs[k] && imgs[k].complete && imgs[k].naturalWidth)) {        // nearest loaded frame until this one arrives
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

    /* ---------- the chart: doubt band over entropy band, one scale in alarm units, each with its own line at 1 */
    function layout() {
      var W = chart.clientWidth, H = chart.clientHeight;
      if (!W || !H || !D) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var L = 4, R = 76, T = 24, B = 50, gap = 20;
      var yd = D.ylim_doubt, ye = D.ylim_entropy, span = (yd[1] - yd[0]) + (ye[1] - ye[0]);
      var k = (H - T - B - gap) / span;
      var top = { y0: T, lo: yd[0], hi: yd[1] }, bot = { y0: T + (yd[1] - yd[0]) * k + gap, lo: ye[0], hi: ye[1] };
      var X = function (j) { return L + (W - L - R) * j / (n - 1); };
      var Y = function (b, v) { return b.y0 + (b.hi - v) * k; };
      var xr = W - R, yb = bot.y0 + (ye[1] - ye[0]) * k;
      var g = mk('g', {}, svg);

      // red wash: the doubt's stretch above its line that runs into the fall, over the whole stretch as in the page clip
      var j0 = D.alarm_fill.indexOf(1);
      if (j0 > 0) {
        var a = D.doubt[j0 - 1], b = D.doubt[j0], xc = X(j0 - 1) + (X(j0) - X(j0 - 1)) * (1 - a) / (b - a);
        var p = 'M' + xc.toFixed(1) + ',' + Y(top, 1).toFixed(1), j1 = j0;
        for (var j = j0; j < n && D.alarm_fill[j]; j++) { p += 'L' + X(j).toFixed(1) + ',' + Y(top, D.doubt[j]).toFixed(1); j1 = j; }
        p += 'L' + X(j1).toFixed(1) + ',' + Y(top, 1).toFixed(1) + 'Z';
        mk('path', { d: p, fill: 'var(--lwi-alarm)', 'fill-opacity': 'var(--lwi-wash)' }, g);
      }
      // alarm lines, dashed as in the paper, and their labels in the right margin
      [top, bot].forEach(function (bd) {
        mk('line', { x1: L, x2: xr, y1: Y(bd, 1), y2: Y(bd, 1), stroke: 'var(--lwi-ink)', 'stroke-opacity': .55, 'stroke-width': 1, 'stroke-dasharray': '4 4' }, g);
        mk('text', { x: xr + 8, y: Y(bd, 1) + 4 }, g).textContent = 'alarm line';
      });
      // the fall
      var xf = X(D.t.indexOf(0));
      mk('line', { x1: xf, x2: xf, y1: T - 6, y2: yb, stroke: 'var(--lwi-event)', 'stroke-width': 2 }, g);
      mk('text', { x: xf, y: T - 11, 'text-anchor': 'middle', 'class': 'is-event' }, g).textContent = 'fall';
      // curves
      var path = function (arr, bd) {
        return arr.map(function (v, j) { return (j ? 'L' : 'M') + X(j).toFixed(1) + ',' + Y(bd, Math.max(bd.lo, Math.min(bd.hi, v))).toFixed(1); }).join('');
      };
      mk('path', { d: path(D.entropy, bot), fill: 'none', stroke: 'var(--lwi-base)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      mk('path', { d: path(D.doubt, top), fill: 'none', stroke: 'var(--lwi-ours)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      // names at the line ends (text in ink; the line beside it is the key)
      var yEndD = Y(top, D.doubt[n - 1]), yEndE = Y(bot, D.entropy[n - 1]);
      if (Math.abs(yEndD - Y(top, 1)) < 16) yEndD = Y(top, 1) - 16;
      if (Math.abs(yEndE - Y(bot, 1)) < 16) yEndE = Y(bot, 1) + 16;
      mk('text', { x: xr + 8, y: yEndD + 4, 'class': 'is-name' }, g).textContent = 'doubt';
      mk('text', { x: xr + 8, y: yEndE + 4, 'class': 'is-name' }, g).textContent = 'entropy';
      // where the doubt first crosses its line ("reports its doubt eight steps before the fall"); the alarm itself is raised on the
      // third frame above the line, which is when the view turns red
      var jc = D.t.indexOf(D.first_cross), xc8 = X(jc), yc8 = Y(top, D.doubt[jc]);
      mk('circle', { cx: xc8, cy: yc8, r: 4.5, fill: 'var(--lwi-bg)', stroke: 'var(--lwi-ink)', 'stroke-width': 1.5 }, g);
      mk('text', { x: xc8 - 8, y: Y(top, 1) - 10, 'text-anchor': 'end' }, g).textContent = 'crosses its line';

      // scrub track with tick labels (steps relative to the fall): a hairline tick at the first crossing, a red tick where the alarm is raised
      var yt = H - 30;
      mk('line', { x1: L, x2: xr, y1: yt, y2: yt, stroke: 'var(--lwi-hair)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      var fill = mk('line', { x1: L, x2: L, y1: yt, y2: yt, stroke: 'var(--lwi-ink)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      var ja = D.t.indexOf(D.alarm_from);
      mk('line', { x1: xc8, x2: xc8, y1: yt - 4, y2: yt + 4, stroke: 'var(--lwi-ink)', 'stroke-opacity': .5, 'stroke-width': 1 }, g);
      mk('line', { x1: X(ja), x2: X(ja), y1: yt - 5, y2: yt + 5, stroke: 'var(--lwi-alarm)', 'stroke-width': 2 }, g);
      mk('line', { x1: xf, x2: xf, y1: yt - 5, y2: yt + 5, stroke: 'var(--lwi-event)', 'stroke-width': 2 }, g);
      for (var s = -15; s <= 15; s += 5) {
        var js = D.t.indexOf(s); if (js < 0) continue;
        mk('text', { x: X(js), y: H - 6, 'text-anchor': 'middle' }, g).textContent = signed(s);
      }
      // cursor
      var cur = mk('line', { y1: T - 2, y2: yb, stroke: 'var(--lwi-ink)', 'stroke-opacity': .35, 'stroke-width': 1 }, g);
      var dotE = mk('circle', { r: 4, fill: 'var(--lwi-base)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      var dotD = mk('circle', { r: 5, fill: 'var(--lwi-ours)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      var knob = mk('circle', { cy: yt, r: 7, fill: 'var(--lwi-ink)', stroke: 'var(--lwi-bg)', 'stroke-width': 2 }, g);
      G = { X: X, Y: Y, top: top, bot: bot, cur: cur, dotD: dotD, dotE: dotE, knob: knob, fill: fill, L: L, R: R, W: W };
    }

    function set(k) {
      if (!D) return;
      i = Math.max(0, Math.min(n - 1, k));
      var t = D.t[i];
      if (G) {
        var x = G.X(i);
        G.cur.setAttribute('x1', x); G.cur.setAttribute('x2', x);
        G.dotD.setAttribute('cx', x); G.dotD.setAttribute('cy', G.Y(G.top, Math.max(G.top.lo, Math.min(G.top.hi, D.doubt[i]))));
        G.dotE.setAttribute('cx', x); G.dotE.setAttribute('cy', G.Y(G.bot, Math.max(G.bot.lo, Math.min(G.bot.hi, D.entropy[i]))));
        G.knob.setAttribute('cx', x); G.fill.setAttribute('x2', x);
      }
      view.classList.toggle('is-alarm', !!D.alarm[i]);                  // >= 3 smoothed frames above the line, from the third (page clip rule)
      var when = t < 0 ? (-t) + (t === -1 ? ' step' : ' steps') + ' before the fall' : t === 0 ? 'The fall begins' : t + (t === 1 ? ' step' : ' steps') + ' into the fall';
      var s = '<b>' + when + '</b> · doubt ' + (D.doubt_above[i] ? 'above' : 'below') + ' its alarm line · entropy ' +
              (D.entropy_above[i] ? 'above' : 'below') + ' its alarm line';
      stateEl.innerHTML = s;
      chart.setAttribute('aria-valuenow', t);
      chart.setAttribute('aria-valuetext', when + '; doubt ' + (D.doubt_above[i] ? 'above' : 'below') + ' its alarm line');
      paint();
    }

    /* ---------- playback: once on first view, then on demand */
    function stop() {
      if (timer) clearTimeout(timer);
      timer = null; playing = false;
      btn.textContent = i >= n - 1 ? 'Replay' : 'Play';
    }
    function play() {
      if (!D) return;
      if (i >= n - 1) set(0);
      playing = true; btn.textContent = 'Pause';
      (function tick() {
        var t = D.t[i], ms = (t >= -3 && t <= 3) ? 200 : 100;          // the clip's pace: 10 steps/s, the fall's six steps at half speed
        timer = setTimeout(function () {
          if (i >= n - 1) { stop(); return; }
          set(i + 1); tick();
        }, ms);
      })();
    }
    function maybeAutoplay() {
      if (autoDone || reduce || !seen || loaded < n || !D) return;
      autoDone = true; set(0); play();
    }
    btn.addEventListener('click', function () { autoDone = true; if (playing) stop(); else play(); });

    /* ---------- dragging and keys */
    function idxAt(ev) {
      var r = chart.getBoundingClientRect(), x = ev.clientX - r.left;
      if (!G) return i;
      return Math.round((x - G.L) / (G.W - G.L - G.R) * (n - 1));
    }
    // mouse and pen scrub at once; a touch scrubs once it moves sideways (or on a tap), so a vertical swipe still scrolls the page
    var drag = false, pend = null;
    function grab(ev) {
      drag = true; pend = null; autoDone = true; if (playing) stop();
      try { chart.setPointerCapture(ev.pointerId); } catch (e) {}
      set(idxAt(ev)); btn.textContent = i >= n - 1 ? 'Replay' : 'Play';
    }
    chart.addEventListener('pointerdown', function (ev) {
      if (!D) return;
      if (ev.pointerType === 'touch') pend = { x: ev.clientX, y: ev.clientY }; else grab(ev);
    });
    chart.addEventListener('pointermove', function (ev) {
      if (pend && Math.abs(ev.clientX - pend.x) > 6 && Math.abs(ev.clientX - pend.x) > Math.abs(ev.clientY - pend.y)) grab(ev);
      else if (drag) { set(idxAt(ev)); btn.textContent = i >= n - 1 ? 'Replay' : 'Play'; }
    });
    chart.addEventListener('pointerup', function (ev) { if (pend) grab(ev); drag = false; pend = null; });
    ['pointercancel', 'lostpointercapture'].forEach(function (e) { chart.addEventListener(e, function () { drag = false; pend = null; }); });
    chart.addEventListener('keydown', function (ev) {
      if (!D) return;
      var k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[ev.key];
      if (ev.key === 'Home') k = -n; if (ev.key === 'End') k = n;
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); btn.click(); return; }
      if (k === undefined) return;
      ev.preventDefault(); autoDone = true; if (playing) stop();
      set(i + k); btn.textContent = i >= n - 1 ? 'Replay' : 'Play';
    });

    /* ---------- lifecycle */
    if ('IntersectionObserver' in window) {
      var near = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { near.disconnect(); load(); }
      }, { rootMargin: '600px 0px' });
      near.observe(root);
      var vis = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) { seen = true; maybeAutoplay(); }
          else if (!e.isIntersecting && playing) stop();
        });
      }, { threshold: [0, 0.5] });
      vis.observe(root);
    } else { seen = true; load(); }
    if ('ResizeObserver' in window) new ResizeObserver(function () { layout(); if (D) set(i); }).observe(chart);
    else window.addEventListener('resize', function () { layout(); if (D) set(i); });
  }

  function boot() { Array.prototype.forEach.call(document.querySelectorAll('.lwi-fall'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
