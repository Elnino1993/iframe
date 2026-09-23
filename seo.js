// 18+ confirmation for the SEO pages (faveradar.xyz/<slug>). The page content is already in the HTML
// (rendered by the FaveRadar server, so search engines read it); this only covers it with the same
// overlay as the widget until the visitor confirms. The answer is shared with the widget ('fr:age').
(function () {
  'use strict';

  var t = {
    gateTitle: 'Adults only',
    gateText: 'This page lists adult content creators. Confirm that you are 18 or older.',
    gateYes: 'I am 18 or older',
    gateNo: 'Leave',
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function ageConfirmed() {
    try { return localStorage.getItem('fr:age') === 'true'; } catch (e) { return false; }
  }

  function gate() {
    var main = document.querySelector('main');
    var g = el('div', 'gate');
    var card = el('div', 'gate-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'gate-title');
    card.appendChild(el('span', 'age', '18+'));
    // not an h1: the page already has its own headline
    var h = el('p', 'gate-title', t.gateTitle);
    h.id = 'gate-title';
    card.appendChild(h);
    card.appendChild(el('p', 'muted', t.gateText));
    var actions = el('div', 'gate-actions');
    var yes = el('button', 'btn primary', t.gateYes);
    yes.type = 'button';
    var no = el('button', 'btn', t.gateNo);
    no.type = 'button';
    actions.appendChild(yes);
    actions.appendChild(no);
    card.appendChild(actions);
    g.appendChild(card);
    // the page behind the overlay is out of reach for keyboard and screen readers until confirmed
    if (main) main.setAttribute('inert', '');
    document.body.appendChild(g);
    yes.focus();
    g.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      (document.activeElement === yes ? no : yes).focus();
    });
    yes.addEventListener('click', function () {
      try { localStorage.setItem('fr:age', 'true'); } catch (e) { /* private mode: ask again next time */ }
      if (main) main.removeAttribute('inert');
      g.remove();
    });
    no.addEventListener('click', function () {
      // like the widget: the content goes away
      if (main) main.remove();
      g.remove();
    });
  }

  /** Broken photo → quiet initials, as in the widget (no inline onerror: the page's CSP forbids it). */
  function photoFallbacks() {
    var imgs = document.querySelectorAll('.shot img');
    Array.prototype.forEach.call(imgs, function (img) {
      var fallback = function () {
        var box = img.parentNode;
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
  if (!ageConfirmed()) gate();
})();
