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

  photoFallbacks();
})();
