// SEO pages (faveradar.xyz/<slug>): swaps a broken creator photo for quiet initials, as the widget does.
// No inline onerror because the page CSP forbids inline scripts.
(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Broken photo → quiet initials, as in the widget (no inline onerror: the page's CSP forbids it). */
  function photoFallbacks() {
    var imgs = document.querySelectorAll('.shot img');
    Array.prototype.forEach.call(imgs, function (img) {
      var fallback = function () {
        var box = img.closest('.shot') || img.parentNode;
        var tile = box && box.closest ? box.closest('.tile') : null;
        var nameNode = tile && tile.querySelector('.name-text');
        var name = nameNode ? nameNode.textContent : '';
        var initials = name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        box.textContent = '';
        box.appendChild(el('span', 'shot-initials', initials));
      };
      if (img.complete && !img.naturalWidth) fallback();
      else img.addEventListener('error', fallback);
    });
  }


  // ---------- Telegram notices (visits and profile clicks) via /api/notify on this domain
  // sendBeacon survives the navigation to the profile; plain-text body avoids a CORS preflight.
  function report(ev) {
    var body = JSON.stringify(ev);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/notify', body)) return;
    } catch (e) { /* fall through */ }
    try {
      fetch('/api/notify', { method: 'POST', body: body, keepalive: true, credentials: 'omit' }).catch(function () {});
    } catch (e) { /* never break the page */ }
  }
  var framed = window.top !== window;
  // inside an iframe document.referrer is the page that embeds us, not where the visitor came from
  var origin = { referrer: framed ? '' : document.referrer, host: framed ? document.referrer : '' };
  function reportVisit(page) {
    var key = 'fr:seen:' + page;
    try {
      if (sessionStorage.getItem(key)) return; // one notice per page per browser session
      sessionStorage.setItem(key, '1');
    } catch (e) { /* storage blocked: still report */ }
    report({ type: 'visit', page: page, referrer: origin.referrer, host: origin.host });
  }
  function watchClicks(scope, page, selector) {
    var onClick = function (e) {
      if (e.type === 'auxclick' && e.button !== 1) return;
      var a = e.target.closest && e.target.closest(selector);
      if (!a || !scope.contains(a)) return;
      var card = a.closest('.tile, .item');
      var name = card && card.querySelector('.name-text');
      report({ type: 'click', page: page, label: name ? name.textContent : '', dest: a.href, host: origin.host });
    };
    scope.addEventListener('click', onClick);
    scope.addEventListener('auxclick', onClick); // middle-click opens a new tab too
  }

  photoFallbacks();
  reportVisit(location.pathname);
  watchClicks(document, location.pathname, 'a.cta, a.shot');
})();
