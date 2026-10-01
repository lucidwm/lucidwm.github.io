/* v16 prototype (agent snap).
   1. layout=title: the gist folds into Details.
   2. html.paged: the script turns the page (fullpage.js-style) instead of CSS scroll snap. Desktop only; phones scroll natively. */
(function () {
  'use strict';
  var html = document.documentElement;

  if (html.classList.contains('title')) {
    [].forEach.call(document.querySelectorAll('article.clip'), function (c) {
      var g = c.querySelector('.gist'), d = c.querySelector('details');
      if (!g) return;
      if (!d) { d = document.createElement('details'); d.innerHTML = '<summary>Details</summary>'; g.parentNode.appendChild(d); }
      var p = document.createElement('p'); p.innerHTML = g.innerHTML; d.insertBefore(p, d.querySelector('summary').nextSibling); g.hidden = true;
    });
  }

  /* CSS snap modes: a section taller than the screen gets inner resting places (its last block's end, and starts in between),
     so engines that do not honour the spec's "covering" rule for a wheel notch (WebKit) cannot skip its lower part */
  if (html.classList.contains('snap-m') || html.classList.contains('snap-p')) {
    var AREAS = '#top, .intro-screen, article.clip, #results, #idea, #method, #abstract, #bibtex';
    var tallFix = function () {
      var port = innerHeight - (parseFloat(getComputedStyle(html).scrollPaddingTop) || 0);
      [].forEach.call(document.querySelectorAll('.snap-end, .snap-mid'), function (e) { e.classList.remove('snap-end', 'snap-mid'); });
      [].forEach.call(document.querySelectorAll(AREAS), function (a) {
        if (a.offsetHeight <= port + 1) return;
        var box = a; while (box.children.length === 1) box = box.children[0];
        var kids = [].filter.call(box.children, function (k) { return k.offsetHeight > 0 && getComputedStyle(k).position !== 'absolute'; });
        if (!kids.length) return;
        var top = a.getBoundingClientRect().top, covered = port, last = kids[kids.length - 1];
        var endView = last.getBoundingClientRect().bottom - top - port;          /* the end stop shows the last port-height of content */
        last.classList.add('snap-end');
        kids.slice(0, -1).forEach(function (k) {                                 /* starts in between, only where a gap would remain */
          if (covered >= endView) return;
          var r = k.getBoundingClientRect(), t = r.top - top, bt = r.bottom - top;
          if (bt > covered && t > 1) { k.classList.add('snap-mid'); covered = t + port; }
        });
      });
    };
    var tallT = 0, tallLater = function () { clearTimeout(tallT); tallT = setTimeout(tallFix, 120); };
    tallFix(); addEventListener('load', tallFix); addEventListener('resize', tallLater);
    document.addEventListener('toggle', tallLater, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(tallFix);
  }

  if (!html.classList.contains('paged')) return;
  var desk = matchMedia('(min-width: 761px) and (min-height: 540px)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = [].slice.call(document.querySelectorAll('#top, .intro-screen, article.clip, #results, #idea, #method, #abstract, #bibtex'));
  els.forEach(function (e) { e.classList.add('pg-stop'); });
  function barH() { return parseFloat(getComputedStyle(html).getPropertyValue('--bar-h')) || 52; }
  /* each stop: where it starts (under the bar) and, for a section taller than the screen, where its bottom meets the screen's */
  function stops() {
    var max = html.scrollHeight - innerHeight, b = barH(), y0 = scrollY;
    return els.map(function (el, i) {
      var r = el.getBoundingClientRect(), top = r.top + y0;
      var y = i === 0 ? 0 : Math.round(Math.min(max, Math.max(0, top - b)));
      var end = i === els.length - 1 ? max : Math.round(Math.min(max, Math.max(y, top + r.height - innerHeight)));   /* the last one runs to the page's end (the footer) */
      return { y: y, end: Math.max(y, end) };
    });
  }
  function at(S, y) { var i = 0; for (var k = 0; k < S.length; k++) if (S[k].y <= y + 1) i = k; return i; }
  function bez(x1, y1, x2, y2) {
    return function (t) {
      var u = t;
      for (var n = 0; n < 8; n++) {
        var x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
        var dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
        if (Math.abs(dx) < 1e-6) break; u = Math.min(1, Math.max(0, u - x / dx));
      }
      return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    };
  }
  var ease = bez(.2, .7, .2, 1), raf = 0, animating = false, lastWheel = 0, mode = null, acc = 0, settleT = 0;
  function jump(y) { window.scrollTo({ top: y, behavior: 'instant' }); }
  function go(y) {
    cancelAnimationFrame(raf);
    var y0 = scrollY, d = y - y0;
    if (Math.abs(d) < 1) return;
    if (reduce) { jump(y); return; }
    var T = Math.min(820, 520 + Math.abs(d) * 0.12), t0 = performance.now();
    animating = true; html.style.scrollBehavior = 'auto';
    (function step(now) {
      var k = Math.min(1, (now - t0) / T);
      jump(Math.round(y0 + d * ease(k)));
      if (k < 1) raf = requestAnimationFrame(step);
      else { animating = false; html.style.scrollBehavior = ''; }
    })(t0);
  }
  function neighbour(S, i, dir) {
    var j = i + dir;
    while (j >= 0 && j < S.length && Math.abs(S[j].y - S[i].y) < 2) j += dir;   /* stops squeezed together at the end of the page */
    return j >= 0 && j < S.length ? (dir > 0 ? S[j].y : S[j].end) : null;
  }
  function inside(s, y, dir) { return s.end > s.y + 1 && (dir > 0 ? y < s.end - 1 : y > s.y + 1); }

  window.addEventListener('wheel', function (e) {
    if (!desk.matches || e.ctrlKey || document.querySelector('dialog[open]')) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    var dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy) return;
    var now = performance.now();
    if (now - lastWheel > 160) { mode = null; acc = 0; }        /* a pause starts a new gesture; a momentum tail or a spinning wheel is one */
    lastWheel = now;
    var S = stops(), y = scrollY, i = at(S, y), s = S[i], dir = dy > 0 ? 1 : -1;
    if (!animating && mode !== 'flip' && inside(s, y, dir)) {   /* a section taller than the screen scrolls on its own, up to its edge */
      mode = 'native';
      var lim = dir > 0 ? s.end : s.y;
      if ((y + dy - lim) * dir > 0) { e.preventDefault(); go(lim); }
      return;
    }
    e.preventDefault();
    if (animating || mode) return;                                /* one flip per gesture; the edge of a long section holds once */
    acc += dy;
    if (Math.abs(acc) < 24) return;                                /* a trackpad's first small deltas: wait for intent */
    mode = 'flip'; acc = 0;
    var to = neighbour(S, i, dir);
    if (to !== null) go(to);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (!desk.matches || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    var dir = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1, ' ': e.shiftKey ? -1 : 1 }[e.key];
    if (!dir) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable], [role="slider"], [role="tab"]')) return;
    if (e.key === ' ' && t && t.closest && t.closest('button, a, summary')) return;
    var S = stops(), y = scrollY, i = at(S, y), s = S[i];
    if (inside(s, y, dir)) return;
    e.preventDefault();
    if (animating) return;
    var to = neighbour(S, i, dir);
    if (to !== null) go(to);
  });

  /* after any other scroll (scrollbar, Home/End, find in page, a touch screen): come to rest on the nearest stop */
  window.addEventListener('scroll', function () {
    if (animating || !desk.matches) return;
    clearTimeout(settleT);
    settleT = setTimeout(function () {
      if (animating || performance.now() - lastWheel < 150 || document.querySelector('dialog[open]')) return;
      var S = stops(), y = scrollY, best = null, bd = 1e9;
      for (var k = 0; k < S.length; k++) {
        if (y >= S[k].y - 1 && y <= S[k].end + 1) return;          /* at a stop, or inside a long section */
        [S[k].y, S[k].end].forEach(function (c) { var d = Math.abs(c - y); if (d < bd) { bd = d; best = c; } });
      }
      if (best !== null) go(best);
    }, 180);
  }, { passive: true });
})();
