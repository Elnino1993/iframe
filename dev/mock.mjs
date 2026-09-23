// Demo data for local widget development. Same response shape as the real server
// (GET /widget-api/data), so widget.js works unchanged. Creators come from seo/creators.json (the own creators of the
// SEO pages, edited in dev/seo.html); their numbers are made up.

import { readFileSync } from 'node:fs';

// Names, OnlyFans links and photos of the own creators (seeded from the StaySlutty page; photos are served by stayslutty.site).
// Stats below (likes, prices, income, places) are generated demo numbers, not real figures.
// Read on every call, so creators added in the SEO editor show up in the sandbox without a restart.
function people() {
  try {
    const list = JSON.parse(readFileSync(new URL('../seo/creators.json', import.meta.url), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
const PLACES = [
  ['Kyiv', 'Ukraine'], ['Warsaw', 'Poland'], ['Prague', 'Czechia'], ['Berlin', 'Germany'], ['Paris', 'France'],
  ['London', 'United Kingdom'], ['Miami', 'United States'], ['Austin', 'United States'], ['Madrid', 'Spain'], ['Seoul', 'South Korea'],
];
const NATIONALITIES = ['Ukrainian', 'Polish', 'Czech', 'German', 'French', 'British', 'American', 'Spanish', 'Korean', 'Brazilian'];
const TAGS = ['fitness', 'cosplay', 'gaming', 'alt', 'yoga', 'dance', 'art', 'travel', 'fashion', 'asmr'];
const TIERS = ['starter', 'rising', 'pro', 'top', 'elite'];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function demoCreators() {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  return people().map((person, i) => {
    const [ownCity, ownCountry] = String(person.place || '').split(',').map((x) => x.trim());
    const [city, country] = ownCountry ? [ownCity, ownCountry] : PLACES[i % PLACES.length];
    const likes = Math.round(2000 * Math.exp(r() * 5.5));
    const price = r() < 0.3 ? 0 : [4.99, 6.99, 9.99, 12.99, 14.99, 19.99][Math.floor(r() * 6)];
    const net = Math.round(likes * (0.05 + r() * 0.1) * (price ? 1 : 0.4));
    return {
      username: person.username,
      displayName: person.name || person.username,
      link: person.link,
      img: person.photo || null,
      isVerified: r() < 0.7 || person.verified === true, // r() first: keeps the demo numbers stable
      city,
      country,
      nationality: NATIONALITIES[i % NATIONALITIES.length],
      tags: [pick(TAGS), pick(TAGS)].filter((t, k, a) => a.indexOf(t) === k),
      bio: person.bio || `${pick(['Daily posts', 'Weekly photo sets', 'Behind the scenes', 'Custom requests open'])}, ${pick(['I reply to every message', 'bundles on the pinned post', 'new drops every Friday'])}.`,
      price,
      promoPrice: price && r() < 0.25 ? Math.round(price * 0.5 * 100) / 100 : null,
      likes,
      posts: Math.round(80 + r() * 900),
      growth30d: Math.round((r() * 40 - 5) * 10) / 10,
      joinedDaysAgo: Math.round(r() * 1400),
      net: { low: Math.round(net * 0.6), mid: net, high: Math.round(net * 1.6) },
      tier: TIERS[Math.min(4, Math.floor(Math.log10(net + 10) - 1))] || 'starter',
    };
  });
}

export const LISTS = {
  lst_demo00000001: { title: 'Top 10 creators this week', subtitle: 'Hand-picked: the most active creators this week.', cta: 'View profile', count: 10 },
  lst_demo00000002: { title: 'Top creators in Kyiv', subtitle: '', cta: 'Open profile', count: 6, city: 'Kyiv' },
};

// ---- accent colours (same maths as the real server: readable text on the theme background)
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const lum = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const mix = (h, t, k) => rgbToHex(hexToRgb(h).map((v, i) => v + (hexToRgb(t)[i] - v) * k));
function ensure(h, bg, ratio = 4.5) {
  const to = lum(bg) < 0.5 ? '#ffffff' : '#000000';
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const c = mix(h, to, k);
    if (contrast(c, bg) >= ratio) return c;
  }
  return to;
}
function accentVars(a, theme) {
  const bg = theme === 'light' ? '#ffffff' : '#000000';
  const [r, g, b] = hexToRgb(a);
  return {
    '--color-accent': a,
    '--color-accent-hover': mix(a, theme === 'light' ? '#000000' : '#ffffff', 0.15),
    '--color-accent-text': ensure(a, bg),
    '--color-accent-soft': `rgba(${r}, ${g}, ${b}, 0.14)`,
    '--color-focus': ensure(a, bg, 3),
    '--color-on-accent': contrast(a, '#000000') >= contrast(a, '#ffffff') ? '#000000' : '#ffffff',
  };
}

const FIELDS = ['rank', 'photo', 'username', 'place', 'price', 'likes', 'income', 'cta'];
const SORTS = {
  popular: (a, b) => b.likes - a.likes,
  earnings: (a, b) => b.net.mid - a.net.mid,
  growth: (a, b) => b.growth30d - a.growth30d,
  value: (a, b) => b.likes / Math.max(1, b.price) - a.likes / Math.max(1, a.price),
  new: (a, b) => a.joinedDaysAgo - b.joinedDaysAgo,
  free: (a, b) => b.likes - a.likes,
};

/** Builds the JSON the widget expects for the given query string (signature is not checked in dev). */
export function widgetData(search, origin) {
  const CREATORS = demoCreators();
  const q = new URLSearchParams(search);
  const view = ['top', 'list', 'geo', 'creator'].includes(q.get('view')) ? q.get('view') : 'top';
  const accent = /^#?[0-9a-f]{6}$/i.test(q.get('accent') || '') ? `#${q.get('accent').replace('#', '').toLowerCase()}` : '';
  // count=all: everybody (the real server caps a top at 500 cards)
  const count = q.get('count') === 'all' ? Infinity : Math.min(50, Math.max(1, Number(q.get('count')) || 10));
  const photos = q.get('photos') !== '0'; // dev only: photos=0 shows the no-picture fallback
  const img = (c) => (photos ? c.img : null);
  const row = (c, i, listId) => ({
    rank: i + 1,
    href: `${origin}/go/${listId}/${encodeURIComponent(c.username)}`,
    avatarUrl: img(c),
    photoUrl: img(c),
    username: c.username,
    displayName: c.displayName,
    isVerified: c.isVerified,
    place: `${c.city}, ${c.country}`,
    price: c.price,
    promoPrice: c.promoPrice,
    likes: c.likes,
    growth30d: c.growth30d,
    net: c.net,
    tier: c.tier,
  });
  const keep = (extra) => {
    const p = new URLSearchParams(q);
    for (const [k, v] of Object.entries(extra)) (v ? p.set(k, v) : p.delete(k));
    p.set('sig', 'dev');
    return `?${p}`;
  };
  const common = {
    view,
    theme: ['dark', 'light', 'auto'].includes(q.get('theme')) ? q.get('theme') : 'dark',
    lang: ['ru', 'en'].includes(q.get('lang')) ? q.get('lang') : 'auto',
    mode: q.get('mode') || 'fullscreen',
    layout: ['cards', 'photos', 'list'].includes(q.get('layout')) ? q.get('layout') : 'cards',
    hide: String(q.get('hide') || '').split(',').filter((f) => FIELDS.includes(f)),
    style: accent ? { dark: accentVars(accent, 'dark'), light: accentVars(accent, 'light') } : null,
    site: 'https://faveradar.com',
    expiresAt: null,
  };

  if (view === 'top') {
    const type = SORTS[q.get('type')] ? q.get('type') : 'popular';
    const filters = { country: q.get('country') || '', city: q.get('city') || '', nationality: q.get('nationality') || '' };
    const items = CREATORS
      .filter((c) => (type !== 'free' || !c.price) && (type !== 'new' || c.joinedDaysAgo < 180))
      .filter((c) => (!filters.country || c.country === filters.country) && (!filters.city || c.city === filters.city)
        && (!filters.nationality || c.nationality === filters.nationality))
      .sort(SORTS[type]).slice(0, count);
    return { status: 200, body: { ...common, type, filters, items: items.map((c, i) => row(c, i, '_top')), hubHref: keep({ view: 'geo', country: '', city: '', nationality: '' }) } };
  }
  if (view === 'list') {
    const l = LISTS[q.get('list')] || LISTS.lst_demo00000001;
    const items = CREATORS.filter((c) => !l.city || c.city === l.city).sort(SORTS.popular).slice(0, Math.min(count, l.count));
    return { status: 200, body: { ...common, title: l.title, subtitle: l.subtitle, cta: l.cta, items: items.map((c, i) => row(c, i, q.get('list') || 'lst_demo00000001')) } };
  }
  if (view === 'geo') {
    const group = (key, extra = () => ({})) => Object.values(CREATORS.reduce((acc, c) => {
      const g = (acc[c[key]] ||= { name: c[key], count: 0, likes: 0, net: 0, maxNet: 0, leader: c.username, ...extra(c) });
      g.count += 1;
      g.likes += c.likes;
      g.net += c.net.mid;
      if (c.net.mid > g.maxNet) { g.maxNet = c.net.mid; g.leader = c.username; }
      return acc;
    }, {})).map((g) => ({ name: g.name, count: g.count, avgLikes: Math.round(g.likes / g.count), avgNet: Math.round(g.net / g.count), maxNet: g.maxNet, leader: g.leader, ...(g.country ? { country: g.country } : {}), href: keep({ view: 'top', country: '', city: '', nationality: '', [key]: g.name }) }))
      .sort((a, b) => b.count - a.count);
    return { status: 200, body: { ...common, groups: { countries: group('country'), cities: group('city', (c) => ({ country: c.country })), nationalities: group('nationality') } } };
  }
  const c = CREATORS.find((x) => x.username === q.get('u')) || CREATORS[0];
  return {
    status: 200,
    body: {
      ...common,
      creator: {
        username: c.username, displayName: c.displayName, avatarUrl: img(c), isVerified: c.isVerified, place: `${c.city}, ${c.country}`,
        bio: c.bio, tags: c.tags, price: c.price, promoPrice: c.promoPrice, likes: c.likes, posts: c.posts, subscribers: null,
        estimate: { net: c.net, yearlyNet: c.net.mid * 12, subscribers: Math.round(c.likes / 40), tier: c.tier, confidence: 55, topPercent: 10 },
      },
    },
  };
}

/** OnlyFans link for the dev click counter (/go/...), like the real server's redirect. */
export function profileUrl(username) {
  const c = demoCreators().find((x) => x.username === username);
  return c ? c.link : null;
}
