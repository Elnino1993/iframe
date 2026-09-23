// SEO pages of the widget domain (faveradar.xyz/<slug>): plain static HTML that search engines read
// without running any script. The data lives next to this file and is edited in the local editor
// (dev/seo.html, served by `npm run dev`):
//   seo/creators.json   own creators: name, OnlyFans link, photo, bio, place
//   seo/pages.json      pages: slug, title, description, keywords, h1, texts, creators in order, published
//
//   node seo/build.mjs                       → pages/<slug>.html, pages/tops.html, sitemap.xml, robots.txt
//   SITE_URL=https://other.domain node seo/build.mjs
//
// The site and its data server are not involved: nothing here fetches anything.
// Every value put into the HTML is escaped; photos and links are https only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_URL = (process.env.SITE_URL || 'https://faveradar.xyz').replace(/\/+$/, '');

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = ['dev', 'pages', 'seo', 'tops', 'widget', 'sitemap', 'robots', 'index'];
const USERNAME_RE = /^[a-z0-9._-]{2,40}$/i;
const LIMITS = { h1: 120, title: 70, description: 200, keywords: 300, intro: 4000, outro: 8000 };
const MAX_CREATORS = 500;
const MAX_RELATED = 24;

export class SeoError extends Error {}

// ---------------------------------------------------------------- helpers

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const line = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Multi-line plain text: keeps line breaks, trims trailing spaces, at most one blank line in a row. */
const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/** "Best OnlyFans creators!" → "best-onlyfans-creators" */
export function slugify(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

/** Plain https URL without credentials, or '' when empty. Anything else throws. */
function httpsUrl(value, label) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new SeoError(`${label}: неверная ссылка`);
  }
  if (u.protocol !== 'https:' || u.username || u.password || raw.length > 500) throw new SeoError(`${label}: нужна обычная ссылка https://…`);
  return u.toString();
}

/** Username from an OnlyFans link: the first path segment (https://onlyfans.com/<username>/c123). */
export function usernameFromLink(link) {
  try {
    const u = new URL(String(link ?? '').trim());
    if (u.protocol !== 'https:' || !/(^|\.)onlyfans\.com$/i.test(u.hostname)) return null;
    const name = u.pathname.split('/').filter(Boolean)[0] || '';
    return USERNAME_RE.test(name) ? name : null;
  } catch {
    return null;
  }
}

/** Photo/link attribute value: https only, else ''. */
function safeHttps(u) {
  try {
    return new URL(u).protocol === 'https:' ? String(u) : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- validation (used by the editor's API)

export function validateCreator(input = {}) {
  const link = httpsUrl(input.link, 'Ссылка OnlyFans');
  const username = usernameFromLink(link);
  if (!username) throw new SeoError('Ссылка должна вести на профиль: https://onlyfans.com/username');
  if (String(input.bio ?? '').trim().length > 1000) throw new SeoError('Описание слишком длинное (до 1000 символов)');
  return {
    username,
    name: line(input.name, 80) || username,
    link,
    photo: httpsUrl(input.photo, 'Фото'),
    bio: text(input.bio, 1000),
    place: line(input.place, 80),
    verified: input.verified === true,
  };
}

/**
 * @param {object} input page from the editor
 * @param {object[]} pages all stored pages
 * @param {object[]} creators all own creators
 * @param {string} [originalSlug] slug of the page being edited (so it may keep its own slug)
 */
export function validatePage(input = {}, pages = [], creators = [], originalSlug = '') {
  const slug = String(input.slug ?? '').trim();
  if (slug.length < 2 || slug.length > 80 || !SLUG_RE.test(slug)) {
    throw new SeoError('Адрес: 2–80 символов, строчные латинские буквы и цифры, слова через один дефис (например best-onlyfans-creators)');
  }
  if (RESERVED_SLUGS.includes(slug)) throw new SeoError(`Адрес «${slug}» занят служебными файлами, выберите другой`);
  if (slug !== originalSlug && pages.some((p) => p.slug === slug)) throw new SeoError(`Адрес «${slug}» уже есть у другой страницы`);
  for (const [k, max] of Object.entries(LIMITS)) {
    if (String(input[k] ?? '').trim().length > max) throw new SeoError(`Поле ${k} слишком длинное (до ${max} символов)`);
  }
  const h1 = line(input.h1, LIMITS.h1);
  if (!h1) throw new SeoError('Нужен заголовок H1');
  const known = new Map(creators.map((c) => [c.username.toLowerCase(), c.username]));
  const list = [];
  for (const raw of Array.isArray(input.creators) ? input.creators : []) {
    const u = known.get(String(raw ?? '').replace(/^@/, '').toLowerCase());
    if (!u) throw new SeoError(`Нет такой анкеты: ${String(raw).slice(0, 40)}`);
    if (!list.includes(u)) list.push(u);
  }
  if (list.length > MAX_CREATORS) throw new SeoError(`Не больше ${MAX_CREATORS} анкет на странице`);
  return {
    slug,
    title: line(input.title, LIMITS.title),
    description: line(input.description, LIMITS.description),
    keywords: String(input.keywords ?? '').split(',').map((k) => line(k, 80)).filter(Boolean).join(', ').slice(0, LIMITS.keywords),
    h1,
    intro: text(input.intro, LIMITS.intro),
    outro: text(input.outro, LIMITS.outro),
    creators: list,
    published: input.published === true,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- data files

export const dataPath = (root, name) => path.join(root, 'seo', name);

export function loadData(root = ROOT) {
  const read = (name) => {
    try {
      const v = JSON.parse(fs.readFileSync(dataPath(root, name), 'utf8'));
      return Array.isArray(v) ? v : [];
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  };
  return { pages: read('pages.json'), creators: read('creators.json') };
}

/** Pretty JSON, written to a temp file first and then renamed, so a crash never leaves half a file. */
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------- rendering

const SVG_ATTRS = 'viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const TICK = `<svg class="tick" ${SVG_ATTRS} role="img" aria-label="Verified"><path d="M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM5.3 8.2l1.8 1.8 3.6-3.9"/></svg>`;
const ARROW = `<svg ${SVG_ATTRS} aria-hidden="true"><path d="M5 11l6-6M6 5h5v5"/></svg>`;
const FOOTER = '<footer class="foot"><span>Data from public profiles. Not affiliated with OnlyFans.</span><span>Data: FaveRadar</span></footer>';

/**
 * Blank lines separate blocks. A block whose first line starts with "## " is a subheading; the rest of
 * that block (if any) becomes a paragraph under it. Other blocks: paragraphs, single newlines → <br>.
 */
export function paragraphs(value) {
  const para = (lines) => (lines.length ? `<p>${lines.map(esc).join('<br>')}</p>` : '');
  return String(value || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lines = b.split('\n').map((l) => l.trim());
    if (lines[0].startsWith('## ')) {
      const heading = lines[0].slice(3).trim();
      return (heading ? `<h2>${esc(heading)}</h2>` : '') + para(lines.slice(1).filter(Boolean));
    }
    return para(lines);
  }).join('\n');
}

const initials = (name) => String(name).split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function head({ title, description, keywords, url, image, ld, robots = 'index,follow' }) {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : '',
    keywords ? `<meta name="keywords" content="${esc(keywords)}">` : '',
    `<meta name="robots" content="${esc(robots)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : '',
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    '<link rel="stylesheet" href="/widget.css">',
    '<script src="/seo.js" defer></script>',
    ...ld.map(jsonLd),
  ].filter(Boolean).join('\n');
}

function doc(headHtml, bodyHtml) {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
${headHtml}
</head>
<body data-theme="dark">
<main>
${bodyHtml}
</main>
</body>
</html>
`;
}

function tile(c, i) {
  const href = safeHttps(c.link);
  const photo = safeHttps(c.photo);
  const rel = 'nofollow sponsored noopener';
  const shot = photo
    ? `<img src="${esc(photo)}" alt="${esc(`${c.name} OnlyFans`)}" width="400" height="500"${i < 4 ? '' : ' loading="lazy"'} referrerpolicy="no-referrer">`
    : `<span class="shot-initials">${esc(initials(c.name))}</span>`;
  const meta = ['@' + c.username, c.place].filter(Boolean).join(' · ');
  const bio = String(c.bio || '').replace(/\s+/g, ' ').trim();
  const bioShort = bio ? `<p class="bio-short">${esc(bio.length > 200 ? `${bio.slice(0, 199).trimEnd()}…` : bio)}</p>` : '';
  return `<li class="tile"><a class="shot" href="${esc(href)}" target="_blank" rel="${rel}" tabindex="-1" aria-hidden="true">${shot}</a>`
    + `<div class="cap"><div class="cap-head"><span class="num${i < 3 ? ' top3' : ''}">${i + 1}</span>`
    + `<div class="who"><span class="name"><span class="name-text">${esc(c.name)}</span>${c.verified ? TICK : ''}</span>`
    + `<div class="meta">${esc(meta)}</div></div></div>${bioShort}`
    + `<a class="cta" href="${esc(href)}" target="_blank" rel="${rel}" aria-label="${esc(`View profile: ${c.name}`)}"><span>View profile</span>${ARROW}</a></div></li>`;
}

/** Creators of a page in its order; unknown usernames and creators without a valid link are skipped. */
export function creatorsOf(page, creators) {
  const byName = new Map(creators.map((c) => [String(c.username).toLowerCase(), c]));
  return (page.creators || []).map((u) => byName.get(String(u).toLowerCase())).filter((c) => c && safeHttps(c.link));
}

/** One page as HTML (published or not: the editor previews drafts too). */
export function renderPage(page, { pages = [], creators = [], siteUrl = SITE_URL } = {}) {
  const items = creatorsOf(page, creators);
  const url = `${siteUrl}/${page.slug}`;
  const title = page.title || page.h1;
  const image = items.map((c) => safeHttps(c.photo)).find(Boolean) || '';
  const related = pages.filter((p) => p.published && p.slug !== page.slug).slice(0, MAX_RELATED);
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tops', item: `${siteUrl}/tops` },
        { '@type': 'ListItem', position: 2, name: page.h1, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: page.h1,
      numberOfItems: items.length,
      itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, url: safeHttps(c.link) })),
    },
  ];
  const grid = items.length
    ? `<ol class="grid" aria-label="${esc(page.h1)}">\n${items.map(tile).join('\n')}\n</ol>`
    : '<p class="state">Nobody here yet.</p>';
  const relatedHtml = related.length
    ? `<section class="related" aria-labelledby="related-t"><h2 id="related-t">More tops</h2><ul>${related.map((p) => `<li><a href="/${esc(p.slug)}">${esc(p.h1)}</a></li>`).join('')}</ul></section>`
    : '';
  const body = `<header class="head"><div class="head-text">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/tops">Tops</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(page.h1)}</span></nav>
<h1>${esc(page.h1)}</h1>
${page.intro ? `<div class="intro">${paragraphs(page.intro)}</div>` : ''}
</div></header>
${grid}
${page.outro ? `<section class="seo-text">${paragraphs(page.outro)}</section>` : ''}
${relatedHtml}
${FOOTER}`;
  return doc(head({ title, description: page.description, keywords: page.keywords, url, image, ld }), body);
}

/** The /tops index: every published page. */
export function renderIndex({ pages = [], creators = [], siteUrl = SITE_URL } = {}) {
  const pub = pages.filter((p) => p.published);
  const url = `${siteUrl}/tops`;
  const title = 'OnlyFans creator tops';
  const description = 'Hand-picked tops of OnlyFans creators: popular, new and trending profiles, updated regularly.';
  const ld = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    numberOfItems: pub.length,
    itemListElement: pub.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.h1, url: `${siteUrl}/${p.slug}` })),
  }];
  const count = (p) => creatorsOf(p, creators).length;
  const list = pub.length
    ? `<section class="related" aria-label="${esc(title)}"><ul>${pub.map((p) => `<li><a href="/${esc(p.slug)}">${esc(p.h1)} <span class="muted">· ${count(p)}</span></a></li>`).join('')}</ul></section>`
    : '<p class="state">Nothing here yet.</p>';
  const body = `<header class="head"><div class="head-text">
<h1>${esc(title)}</h1>
<div class="intro"><p>${esc(description)}</p></div>
</div></header>
${list}
${FOOTER}`;
  return doc(head({ title, description, url, ld }), body);
}

export function renderSitemap({ pages = [], siteUrl = SITE_URL } = {}) {
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pub = pages.filter((p) => p.published);
  const day = (p) => String(p.updatedAt || new Date().toISOString()).slice(0, 10);
  const latest = pub.map(day).sort().pop();
  const urls = [
    ...(pub.length ? [`  <url><loc>${xml(`${siteUrl}/tops`)}</loc><lastmod>${latest}</lastmod></url>`] : []),
    ...pub.map((p) => `  <url><loc>${xml(`${siteUrl}/${p.slug}`)}</loc><lastmod>${day(p)}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `${u}\n`).join('')}</urlset>\n`;
}

export function renderRobots({ siteUrl = SITE_URL } = {}) {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

// ---------------------------------------------------------------- build

/**
 * Writes pages/<slug>.html for every published page, pages/tops.html, sitemap.xml and robots.txt into
 * `root`, and deletes pages/*.html that no longer belong to a published page.
 * @returns {{ written: string[], removed: string[] }} paths relative to root
 */
export function build({ root = ROOT, siteUrl = SITE_URL, data = loadData(root) } = {}) {
  const { pages, creators } = data;
  const dir = path.join(root, 'pages');
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  const put = (rel, content) => {
    fs.writeFileSync(path.join(root, rel), content);
    written.push(rel.replace(/\\/g, '/'));
  };
  const keep = new Set(['tops.html']);
  for (const p of pages) {
    if (!p.published || !SLUG_RE.test(p.slug) || RESERVED_SLUGS.includes(p.slug)) continue;
    keep.add(`${p.slug}.html`);
    put(path.join('pages', `${p.slug}.html`), renderPage(p, { pages, creators, siteUrl }));
  }
  put(path.join('pages', 'tops.html'), renderIndex({ pages, creators, siteUrl }));
  put('sitemap.xml', renderSitemap({ pages, siteUrl }));
  put('robots.txt', renderRobots({ siteUrl }));
  const removed = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.html') && !keep.has(f)) {
      fs.rmSync(path.join(dir, f));
      removed.push(`pages/${f}`);
    }
  }
  return { written, removed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { written, removed } = build();
  console.log(`[seo] ${SITE_URL}: written ${written.length} file(s)${removed.length ? `, removed ${removed.join(', ')}` : ''}`);
  for (const f of written) console.log(`  ${f}`);
}
