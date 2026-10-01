/* v16 prototype (agent snap): an in-page link goes straight to its place through a short crossfade, instead of scrolling
   past every screen in between. The bar stays put (it is captured on its own) so only the content changes.
   ?jt=dip (default: the content fades to the page colour and back, the bar stays) | vt (a View Transitions crossfade) | cut | off
   ?jd=<ms>  crossfade length (default 240). prefers-reduced-motion: always a cut. */
(function () {
  'use strict';
  var html = document.documentElement, q = new URLSearchParams(location.search);
  var MODE = q.get('jt') || 'dip';
  if (MODE === 'off') return;
  var DUR = Math.max(0, Math.min(1200, parseInt(q.get('jd'), 10) || 240));
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var ua = navigator.userAgent;
  /* WebKit on Linux (WPE/GTK, GStreamer video) crashed in our tests when a page with <video> takes a View Transition; Safari is not affected
     by this switch. Those engines get the veil instead. */
  var linuxWebKit = /AppleWebKit/.test(ua) && /Linux/.test(navigator.platform + ' ' + ua) && !/Chrome|Chromium|Edg|Firefox|Android/.test(ua);
  var vtOK = typeof document.startViewTransition === 'function' && !linuxWebKit;
  html.classList.add('jump-on');
  html.style.setProperty('--jd', DUR + 'ms');
  var SNAP = '#top, .intro-screen, #videos, .group > h3.clip-group, article.clip, #results, #idea, #method, #abstract, #bibtex';
  var log = window.__jumpLog = [];

  /* where the page comes to rest for this target: the snap position of the screen that holds it */
  function restY(el) {
    var max = html.scrollHeight - innerHeight, pad = parseFloat(getComputedStyle(html).scrollPaddingTop) || 0;
    var clampY = function (y) { return Math.round(Math.max(0, Math.min(max, y))); };
    var own = function (e) { return e.getBoundingClientRect().top + scrollY - pad - (parseFloat(getComputedStyle(e).scrollMarginTop) || 0); };
    if (el.id === 'top') return 0;
    var area = snapArea(el);
    if (!area) return clampY(own(el));
    var a = area.getBoundingClientRect(), top = clampY(own(area));
    if (a.height <= innerHeight - pad + 1 || area === el) return top;        /* a screen that fits: its own start */
    var end = clampY(a.top + scrollY + a.height - innerHeight);                  /* a long section: the target itself, kept inside it */
    return Math.max(top, Math.min(end, clampY(own(el))));
  }
  function snaps(e) { return e.classList.contains('pg-stop') || getComputedStyle(e).scrollSnapAlign.indexOf('start') >= 0; }
  function snapArea(el) {                                                       /* the innermost snap area that holds the target */
    for (var e = el; e && e !== html; e = e.parentElement) if (e.matches(SNAP) && snaps(e)) return e;
    var inner = el.querySelector && el.querySelector(SNAP);
    if (inner && snaps(inner)) return inner;
    if (el.matches('article.clip')) {                                            /* option B: a group's first clip rests on the group's heading */
      var h = el.parentNode.querySelector('h3.clip-group');
      if (h && snaps(h) && el.parentNode.querySelector('article.clip') === el) return h;
    }
    return null;
  }
  function focusOn(el) {
    var f = /^(SECTION|ARTICLE|HEADER|MAIN|DIV)$/.test(el.tagName) ? (el.querySelector('h2, h3, h4') || el) : el;
    if (!f.matches('a[href], button, input, select, textarea, [tabindex]')) { f.setAttribute('tabindex', '-1'); f.classList.add('jump-focus'); }
    try { f.focus({ preventScroll: true }); } catch (e) {}
  }
  function to(y) { window.scrollTo({ top: y, behavior: 'instant' }); }

  var veil = document.createElement('div'); veil.className = 'jump-veil'; veil.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veil);
  function swap(change, why) {
    var rec = { why: why, t0: performance.now(), y0: Math.round(scrollY), mode: null }; log.push(rec);
    var done = function () { change(); rec.tSwap = performance.now(); rec.y1 = Math.round(scrollY); };
    if (reduce.matches || MODE === 'cut') { rec.mode = 'cut'; done(); rec.tEnd = rec.tSwap; return; }
    if (MODE === 'vt' && vtOK) {
      rec.mode = 'vt';
      var vt = document.startViewTransition(done);
      vt.finished.then(function () { rec.tEnd = performance.now(); }, function () { rec.tEnd = performance.now(); rec.err = 1; });
      return;
    }
    rec.mode = 'dip';                                                            /* no View Transitions: a veil fades in, the page moves, the veil fades out */
    var half = Math.round(DUR * 0.45);
    veil.style.transition = 'opacity ' + half + 'ms cubic-bezier(.4, 0, 1, 1)'; veil.classList.add('on');
    setTimeout(function () {
      done();
      requestAnimationFrame(function () {
        veil.style.transition = 'opacity ' + (DUR - half) + 'ms cubic-bezier(0, 0, .2, 1)'; veil.classList.remove('on');
        setTimeout(function () { rec.tEnd = performance.now(); }, DUR - half);
      });
    }, half);
  }

  /* history: each jump is a step back can undo; the page restores the place itself, with the same crossfade */
  try { history.scrollRestoration = 'manual'; } catch (e) {}
  function remember() { try { history.replaceState(Object.assign({}, history.state, { lwmY: Math.round(scrollY) }), ''); } catch (e) {} }
  var memoT = 0;
  addEventListener('scroll', function () { clearTimeout(memoT); memoT = setTimeout(remember, 400); }, { passive: true });
  addEventListener('pagehide', function () { try { sessionStorage.setItem('lwmY:' + location.pathname, String(Math.round(scrollY))); } catch (e) {} });
  (function restoreOnReload() {                                                  /* manual restoration would lose the place on reload; keep it */
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!nav || nav.type !== 'reload' || location.hash) return;
    var y = null; try { y = parseFloat(sessionStorage.getItem('lwmY:' + location.pathname)); } catch (e) {}
    if (y > 0) addEventListener('load', function () { to(y); });
  })();

  function go(el, hash) {
    var y = restY(el);
    remember();
    swap(function () {
      to(y);
      if (hash && hash !== location.hash) history.pushState({ lwmY: y }, '', hash); else remember();
      focusOn(el);
    }, hash);
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest('dialog')) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1)), el = id ? document.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    go(el, '#' + id);
  });
  /* Home and End: the same cut, not a fast scroll through every screen (WebKit with snapping even stops after one screen) */
  document.addEventListener('keydown', function (e) {
    if ((e.key !== 'Home' && e.key !== 'End') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || document.querySelector('dialog[open]')) return;
    var t = e.target; if (t && t.closest && t.closest('input, textarea, select, [contenteditable], [role="slider"], [role="tab"], [role="radiogroup"]')) return;
    e.preventDefault();
    var y = e.key === 'Home' ? 0 : html.scrollHeight - innerHeight;
    remember(); swap(function () { to(y); remember(); }, e.key);
  });
  addEventListener('popstate', function (e) {
    var st = e.state, y = st && typeof st.lwmY === 'number' ? st.lwmY : null;
    if (y === null) { var el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); y = el ? restY(el) : 0; }
    swap(function () { to(y); }, 'popstate');
  });
  window.__lwmRestY = restY;
})();
