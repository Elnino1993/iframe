// FaveRadar standalone widget block. Host these files on any domain and open it with an admin-issued link:
//   https://your-domain/?view=top&country=Ukraine&sig=...
// Data comes from the FaveRadar server set in config.js; the signed query is the only permission it needs.
(function () {
  'use strict';

  var cfg = window.FAVERADAR_WIDGET || {};
  var API = String(cfg.api || location.origin).replace(/\/+$/, '');
  var app = document.getElementById('app');

  var T = {
    en: {
      types: { popular: 'Most popular', earnings: 'Top earners', growth: 'Trending', value: 'Best value', new: 'New creators', free: 'Top free' },
      perMonth: '/mo', estimate: 'est. income / mo', free: 'Free', likes: 'likes', posts: 'posts', subscribers: 'subscribers',
      hub: 'Tops by place', countries: 'Countries', cities: 'Cities', nationalities: 'Nationalities', creators: 'creators',
      avg: 'avg', allPlaces: 'All tops by place', back: '← Tops by place',
      yearly: 'per year', topPct: 'Top {p}%', confidence: 'Confidence',
      natNote: 'Nationality as creators describe themselves.',
      disclaimer: 'Data from public profiles. Not affiliated with OnlyFans.',
      powered: 'Data: FaveRadar', loading: 'Loading…', empty: 'Nobody here yet.',
      invalid: 'This link is not valid. Ask the site administrator for a working link.',
      expired: 'This link has expired. Ask the site administrator for a new one.',
      failed: 'Could not load data.', retry: 'Try again', expires: 'Link valid until {d}',
      cta: 'View profile', listTitle: 'Top creators', subscription: 'per month',
      priceLabel: 'Subscription', likesLabel: 'Likes', incomeLabel: 'Income / mo', postsLabel: 'Posts',
      subsLabel: 'Subscribers', verified: 'Verified',
    },
    ru: {
      types: { popular: 'Самые популярные', earnings: 'Топ по доходу', growth: 'Набирают популярность', value: 'Самые выгодные', new: 'Новые креаторы', free: 'Топ бесплатных' },
      perMonth: '/мес', estimate: 'доход / мес (оценка)', free: 'Бесплатно', likes: 'лайков', posts: 'постов', subscribers: 'подписчиков',
      hub: 'Топы по месту', countries: 'Страны', cities: 'Города', nationalities: 'Национальности', creators: 'креаторов',
      avg: 'в среднем', allPlaces: 'Все топы по месту', back: '← Топы по месту',
      yearly: 'в год', topPct: 'Топ {p}%', confidence: 'Точность',
      natNote: 'Национальность — со слов самих креаторов.',
      disclaimer: 'Данные из открытых профилей. Не связано с OnlyFans.',
      powered: 'Данные: FaveRadar', loading: 'Загрузка…', empty: 'Пока никого нет.',
      invalid: 'Ссылка недействительна. Попросите у администратора рабочую ссылку.',
      expired: 'Срок действия ссылки истёк. Попросите у администратора новую.',
      failed: 'Не удалось загрузить данные.', retry: 'Повторить', expires: 'Ссылка действует до {d}',
      cta: 'Смотреть профиль', listTitle: 'Топ анкет', subscription: 'в месяц',
      priceLabel: 'Подписка', likesLabel: 'Лайки', incomeLabel: 'Доход / мес', postsLabel: 'Посты',
      subsLabel: 'Подписчики', verified: 'Верифицирован',
    },
  };
  var TIERS = {
    en: { starter: 'Starter', rising: 'Rising', pro: 'Pro', top: 'Top', elite: 'Elite' },
    ru: { starter: 'Старт', rising: 'Растущий', pro: 'Про', top: 'Топ', elite: 'Элита' },
  };

  var params = new URLSearchParams(location.search);
  var lang = pickLang(params.get('lang'));
  var t = T[lang];

  function pickLang(value) {
    // English everywhere; Russian only when the link asks for it explicitly
    return value === 'ru' ? 'ru' : 'en';
  }

  // ---------- tiny DOM helpers (textContent only: server data is never parsed as HTML)
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function money(v, compact) {
    var n = Number(v) || 0;
    var opts = compact && n >= 10000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 0 };
    return '$' + new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', opts).format(n);
  }
  function num(v) {
    var n = Number(v) || 0;
    return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
  }
  function priceText(p, promo) {
    if (!p) return t.free;
    var shown = promo != null && promo < p ? promo : p;
    return '$' + Number(shown).toFixed(shown % 1 ? 2 : 0) + t.perMonth;
  }
  function priceShort(p, promo) {
    if (!p) return t.free;
    var shown = promo != null && promo < p ? promo : p;
    return '$' + Number(shown).toFixed(shown % 1 ? 2 : 0);
  }
  function initials(name, username) {
    return String(name || username).split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function safeImg(url) {
    return url && /^https:\/\//.test(url) ? url : '';
  }
  function avatar(name, username, url) {
    if (safeImg(url)) {
      var img = el('img', 'avatar');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () { img.replaceWith(avatar(name, username)); });
      return img;
    }
    var a = el('span', 'avatar', initials(name, username));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  // ---------- drawn icons (static path data, no server input)
  var SVG = 'http://www.w3.org/2000/svg';
  function icon(cls, d, label) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', cls);
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    if (label) {
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', label);
    } else {
      s.setAttribute('aria-hidden', 'true');
    }
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }
  function tick() {
    return icon('tick', 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM5.3 8.2l1.8 1.8 3.6-3.9', t.verified);
  }
  function arrow() {
    return icon('', 'M5 11l6-6M6 5h5v5');
  }
  /** Creator name with the drawn verified mark (text stays textContent). */
  function nameEl(tag, cls, c) {
    var n = el(tag, cls);
    n.appendChild(el('span', 'name-text', c.displayName));
    if (c.isVerified) n.appendChild(tick());
    return n;
  }
  function profileLink(site, username, child) {
    if (!site) return child;
    var a = el('a');
    a.href = site + '/#/c/' + encodeURIComponent(username);
    a.target = '_blank';
    a.rel = 'noopener';
    a.appendChild(child);
    return a;
  }

  /** Outbound button: goes through the FaveRadar click counter to the configured target. */
  function ctaButton(href, label, name) {
    var a = el('a', 'cta');
    a.appendChild(el('span', null, label));
    a.appendChild(arrow());
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener sponsored';
    a.setAttribute('aria-label', label + ': ' + name);
    return a;
  }

  // ---------- look & feel from the signed link
  function applyStyle(data) {
    var theme = data.theme === 'auto'
      ? (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : (data.theme || 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    var vars = data.style && data.style[theme];
    if (vars) Object.keys(vars).forEach(function (k) { document.documentElement.style.setProperty(k, vars[k]); });
  }

  // ---------- auto height (host page resizes the iframe; the host snippet checks our origin)
  function reportHeight() {
    if (params.get('autoheight') !== '1' || window.parent === window) return;
    var last = 0;
    var send = function () {
      var h = Math.ceil(document.documentElement.scrollHeight);
      if (Math.abs(h - last) < 2) return;
      last = h;
      window.parent.postMessage({ type: 'faveradar:height', height: h }, '*');
    };
    if (window.ResizeObserver) new ResizeObserver(send).observe(document.body);
    send();
  }

  // ---------- renderers
  // Profile cards for tops and curated lists. The signed link picks the layout
  // (cards | photos | list) and which fields to hide.
  function shown(data, field) {
    return (data.hide || []).indexOf(field) === -1;
  }
  function metaLine(data, c) {
    var parts = [];
    if (shown(data, 'username')) parts.push('@' + c.username);
    if (shown(data, 'place') && c.place) parts.push(c.place);
    return parts.join(' · ');
  }
  /** Comp-card figures: [label, value, crossed-out full price when a promo is running]. */
  function specList(data, c) {
    var out = [];
    if (shown(data, 'price')) {
      var promo = c.price && c.promoPrice != null && c.promoPrice < c.price;
      out.push([t.priceLabel, priceText(c.price, c.promoPrice), promo ? priceShort(c.price) : '']);
    }
    if (shown(data, 'likes')) out.push([t.likesLabel, num(c.likes)]);
    if (shown(data, 'income')) out.push([t.incomeLabel, '≈ ' + money(c.net.mid, true)]);
    return out;
  }
  function specNode(rows) {
    var dl = el('dl', 'spec');
    rows.forEach(function (s) {
      var row = el('div');
      row.appendChild(el('dt', null, s[0]));
      var dd = el('dd');
      if (s[2]) dd.appendChild(el('s', null, s[2]));
      dd.appendChild(document.createTextNode(s[1]));
      row.appendChild(dd);
      dl.appendChild(row);
    });
    return dl;
  }
  function nameNode(data, c, ctaLabel) {
    var name = nameEl('span', 'name', c);
    // without a button the name itself leads to the profile (through the click counter)
    if (!shown(data, 'cta') && c.href) {
      var a = el('a', 'name-link');
      a.href = c.href;
      a.target = '_blank';
      a.rel = 'noopener sponsored';
      a.setAttribute('aria-label', ctaLabel + ': ' + c.displayName);
      a.appendChild(name);
      return a;
    }
    return name;
  }
  function rankNode(data, c) {
    if (!shown(data, 'rank')) return null;
    return el('span', 'num' + (c.rank <= 3 ? ' top3' : ''), String(c.rank));
  }

  /** The picture is the card; the whole picture is clickable, quiet initials stand in when it is missing. */
  function shot(c, url) {
    var box = c.href ? el('a', 'shot') : el('div', 'shot');
    if (c.href) {
      box.href = c.href;
      box.target = '_blank';
      box.rel = 'noopener sponsored';
      box.tabIndex = -1; // the button/name is the keyboard target; avoid a duplicate tab stop
      box.setAttribute('aria-hidden', 'true');
    }
    var fallback = function () {
      box.textContent = '';
      box.appendChild(el('span', 'shot-initials', initials(c.displayName, c.username)));
    };
    if (safeImg(url)) {
      var img = el('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', fallback);
      box.appendChild(img);
    } else {
      fallback();
    }
    return box;
  }

  /** Catalog tile. cards: portrait crop of the profile picture; photos: the wide picture chosen for the block. */
  function tile(data, c, ctaLabel, wide) {
    var li = el('li', 'tile' + (wide ? ' wide' : ''));
    if (shown(data, 'photo')) {
      li.appendChild(shot(c, wide ? c.photoUrl : safeImg(c.avatarUrl) || c.photoUrl));
    }
    var cap = el('div', 'cap');
    var head = el('div', 'cap-head');
    var rank = rankNode(data, c);
    if (rank) head.appendChild(rank);
    var who = el('div', 'who');
    who.appendChild(nameNode(data, c, ctaLabel));
    var meta = metaLine(data, c);
    if (meta) who.appendChild(el('div', 'meta', meta));
    head.appendChild(who);
    cap.appendChild(head);
    var spec = specList(data, c);
    if (spec.length) cap.appendChild(specNode(spec));
    if (shown(data, 'cta') && c.href) cap.appendChild(ctaButton(c.href, ctaLabel, c.displayName));
    li.appendChild(cap);
    return li;
  }
  function portraitTile(data, c, ctaLabel) {
    return tile(data, c, ctaLabel, false);
  }
  function wideTile(data, c, ctaLabel) {
    return tile(data, c, ctaLabel, true);
  }

  function rowCard(data, c, ctaLabel) {
    var li = el('li', 'item');
    if (!shown(data, 'rank')) li.classList.add('no-rank');
    if (!shown(data, 'photo')) li.classList.add('no-photo');
    var rank = rankNode(data, c);
    if (rank) li.appendChild(rank);
    if (shown(data, 'photo')) li.appendChild(avatar(c.displayName, c.username, c.avatarUrl));
    var who = el('div', 'who');
    who.appendChild(nameNode(data, c, ctaLabel));
    var bits = [metaLine(data, c)];
    if (shown(data, 'price')) bits.push(priceText(c.price, c.promoPrice));
    if (shown(data, 'likes')) bits.push(num(c.likes) + ' ' + t.likes);
    var meta = bits.filter(Boolean).join(' · ');
    if (meta) who.appendChild(el('div', 'meta', meta));
    li.appendChild(who);
    var earn = el('div', 'earn');
    if (shown(data, 'income')) {
      var fig = el('div');
      fig.appendChild(el('b', null, '≈ ' + money(c.net.mid, true)));
      fig.appendChild(el('div', 'meta', t.estimate));
      earn.appendChild(fig);
    }
    if (shown(data, 'cta') && c.href) earn.appendChild(ctaButton(c.href, ctaLabel, c.displayName));
    if (earn.firstChild) li.appendChild(earn);
    return li;
  }

  function renderItems(data, label, ctaLabel) {
    if (!data.items.length) {
      app.appendChild(el('p', 'state', t.empty));
      return;
    }
    var layout = data.layout || 'cards';
    var wrap = el('ol', layout === 'photos' ? 'grid wide' : layout === 'list' ? 'rows' : 'grid');
    wrap.setAttribute('aria-label', label);
    var make = layout === 'photos' ? wideTile : layout === 'list' ? rowCard : portraitTile;
    data.items.forEach(function (c) { wrap.appendChild(make(data, c, ctaLabel)); });
    app.appendChild(wrap);
  }

  function renderTop(data) {
    var place = [data.filters.city, data.filters.country, data.filters.nationality].filter(Boolean).join(', ');
    var head = el('header', 'head');
    var h1 = el('h1', null, t.types[data.type] || t.types.popular);
    if (place) {
      h1.appendChild(document.createTextNode(' · '));
      h1.appendChild(el('span', 'place', place));
    }
    head.appendChild(h1);
    if (data.hubHref) {
      var hub = el('a', 'small', t.allPlaces);
      hub.href = data.hubHref;
      head.appendChild(hub);
    }
    app.appendChild(head);
    if (data.filters.nationality) app.appendChild(el('p', 'muted small note', t.natNote));
    renderItems(data, h1.textContent, t.cta);
  }

  /** Curated list: title and optional subtitle, then the chosen layout with a call-to-action. */
  function renderList(data) {
    var head = el('header', 'head');
    var text = el('div', 'head-text');
    text.appendChild(el('h1', null, data.title || t.listTitle));
    if (data.subtitle) text.appendChild(el('p', 'muted', data.subtitle));
    head.appendChild(text);
    app.appendChild(head);
    renderItems(data, data.title || t.listTitle, data.cta || t.cta);
  }

  function renderGeo(data) {
    var head = el('header', 'head');
    head.appendChild(el('h1', null, t.hub));
    app.appendChild(head);
    var wrap = el('div', 'groups');
    [['countries', t.countries], ['cities', t.cities], ['nationalities', t.nationalities]].forEach(function (pair) {
      var items = data.groups[pair[0]] || [];
      var box = el('section', 'group');
      var h2 = el('h2', null, pair[1]);
      h2.appendChild(el('span', null, String(items.length)));
      box.appendChild(h2);
      if (pair[0] === 'nationalities') box.appendChild(el('p', 'muted small', t.natNote));
      var ul = el('ul');
      items.forEach(function (g) {
        var li = el('li');
        var a = el('a');
        a.href = g.href;
        a.appendChild(el('span', null, g.name + (g.country && pair[0] === 'cities' ? ', ' + g.country : '')));
        a.appendChild(el('span', 'muted small', num(g.count) + ' ' + t.creators + (g.avgLikes != null ? ' · ' + t.avg + ' ' + num(g.avgLikes) + ' ' + t.likes : '')));
        li.appendChild(a);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      wrap.appendChild(box);
    });
    app.appendChild(wrap);
  }

  function renderCreator(data) {
    var c = data.creator;
    var e = c.estimate;
    var card = el('article', 'card');
    card.appendChild(shot({ displayName: c.displayName, username: c.username }, c.avatarUrl));
    var body = el('div', 'card-body');
    var who = el('div', 'who');
    who.appendChild(profileLink(data.site, c.username, nameEl('h1', null, c)));
    who.appendChild(el('div', 'meta', '@' + c.username + (c.place ? ' · ' + c.place : '')));
    body.appendChild(who);
    body.appendChild(el('span', 'tier', (TIERS[lang][e.tier] || e.tier)));
    var big = el('div', 'big', '≈ ' + money(e.net.mid));
    big.appendChild(el('small', null, ' ' + t.perMonth));
    body.appendChild(big);
    body.appendChild(el('div', 'muted small', money(e.net.low) + ' – ' + money(e.net.high) + ' · ' + money(e.yearlyNet) + ' ' + t.yearly
      + (e.topPercent != null ? ' · ' + t.topPct.replace('{p}', e.topPercent) : '')));
    var promo = c.price && c.promoPrice != null && c.promoPrice < c.price;
    body.appendChild(specNode([
      [t.priceLabel, priceText(c.price, c.promoPrice), promo ? priceShort(c.price) : ''],
      [t.likesLabel, num(c.likes)],
      [t.postsLabel, num(c.posts)],
      [t.subsLabel, num(c.subscribers != null ? c.subscribers : e.subscribers)],
    ]));
    if (c.bio) body.appendChild(el('p', 'muted small bio', c.bio));
    card.appendChild(body);
    app.appendChild(card);
  }

  function renderFooter(data) {
    var foot = el('footer', 'foot');
    foot.appendChild(el('span', null, t.disclaimer));
    var right = el('span');
    if (data && data.site) {
      var a = el('a', null, t.powered);
      a.href = data.site;
      a.target = '_blank';
      a.rel = 'noopener';
      right.appendChild(a);
    } else {
      right.textContent = t.powered;
    }
    foot.appendChild(right);
    app.appendChild(foot);
  }

  function showError(message, canRetry) {
    app.innerHTML = '';
    var box = el('div', 'state');
    box.setAttribute('role', 'alert');
    box.appendChild(el('p', null, message));
    if (canRetry) {
      var b = el('button', 'btn', t.retry);
      b.type = 'button';
      b.addEventListener('click', load);
      box.appendChild(b);
    }
    app.appendChild(box);
    app.setAttribute('aria-busy', 'false');
  }

  function load() {
    app.innerHTML = '';
    app.setAttribute('aria-busy', 'true');
    // placeholders in the shape of the layout the link asks for
    var lay = params.get('layout');
    var sk = el('div', 'sk-grid' + (lay === 'photos' ? ' wide' : lay === 'list' ? ' rows' : ''));
    sk.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 6; i++) sk.appendChild(el('div', 'skeleton'));
    app.appendChild(sk);
    if (!params.get('sig')) return showError(t.invalid, false);

    fetch(API + '/widget-api/data' + location.search, { credentials: 'omit' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (r) {
        if (r.status === 403) return showError(r.body.error === 'expired' ? t.expired : t.invalid, false);
        if (r.status !== 200) return showError(t.failed, true);
        var data = r.body;
        applyStyle(data);
        app.innerHTML = '';
        if (data.view === 'geo') renderGeo(data);
        else if (data.view === 'creator') renderCreator(data);
        else if (data.view === 'list') renderList(data);
        else renderTop(data);
        renderFooter(data);
        app.setAttribute('aria-busy', 'false');
      })
      .catch(function () { showError(t.failed, true); });
  }

  document.documentElement.lang = lang;
  // theme from the link right away, so the loading skeleton already matches it
  var earlyTheme = params.get('theme');
  if (earlyTheme === 'light' || earlyTheme === 'dark') document.documentElement.dataset.theme = earlyTheme;
  else if (earlyTheme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.dataset.theme = 'light';
  reportHeight();
  load();
})();
