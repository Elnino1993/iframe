// node --test dev/seo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SeoError, slugify, usernameFromLink, validatePage, validateCreator, paragraphs, renderPage, build, writeJsonAtomic,
} from '../seo/build.mjs';

const SITE = 'https://faveradar.xyz';
const creators = [
  validateCreator({ link: 'https://onlyfans.com/alice_x/c12', name: 'Alice', photo: 'https://img.example.com/a.jpg', bio: 'Hi <there>', place: 'Kyiv, Ukraine', verified: true }),
  validateCreator({ link: 'https://onlyfans.com/bob.y', name: 'Bob' }),
];
const page = (extra = {}) => validatePage({ slug: 'best-creators', h1: 'Best creators', creators: ['alice_x', 'bob.y'], published: true, ...extra }, [], creators);

test('slugs: slugify, format, length, reserved, unique', () => {
  assert.equal(slugify('Best OnlyFans creators — Zürich!'), 'best-onlyfans-creators-zurich');
  for (const bad of ['Bad Slug', 'a', 'double--dash', '-start', 'end-', 'x'.repeat(81), 'кириллица']) {
    assert.throws(() => page({ slug: bad }), SeoError, bad);
  }
  for (const reserved of ['tops', 'home', 'dev', 'pages', 'seo', 'sitemap', 'robots', 'index', 'widget', 'api', 'img']) {
    assert.throws(() => page({ slug: reserved }), /служебн/, reserved);
  }
  const existing = [page()];
  assert.throws(() => validatePage({ slug: 'best-creators', h1: 'Other' }, existing, creators), /уже есть/);
  assert.equal(validatePage({ slug: 'best-creators', h1: 'Same page' }, existing, creators, 'best-creators').slug, 'best-creators');
  assert.throws(() => page({ h1: '   ' }), /H1/);
  assert.throws(() => page({ title: 'x'.repeat(71) }), SeoError);
  assert.throws(() => page({ creators: ['nobody'] }), /Нет такой анкеты/);
  assert.deepEqual(page({ creators: ['ALICE_X', 'alice_x', 'bob.y'] }).creators, ['alice_x', 'bob.y'], 'known usernames, deduped');
});

test('creators: OnlyFans https links only, https photos only', () => {
  assert.equal(usernameFromLink('https://onlyfans.com/alice_x/c12?ref=1'), 'alice_x');
  assert.equal(usernameFromLink('http://onlyfans.com/alice_x'), null);
  assert.equal(usernameFromLink('https://fans.example.com/alice_x'), null);
  assert.equal(creators[0].username, 'alice_x');
  assert.equal(creators[0].link, 'https://onlyfans.com/alice_x/c12');
  assert.equal(creators[1].name, 'Bob');
  assert.equal(creators[1].photo, '');
  assert.throws(() => validateCreator({ link: 'https://example.com/alice' }), SeoError);
  assert.throws(() => validateCreator({ link: 'http://onlyfans.com/alice' }), SeoError);
  assert.throws(() => validateCreator({ link: 'https://onlyfans.com/alice', photo: 'http://img.example.com/a.jpg' }), /Фото/);
  assert.throws(() => validateCreator({ link: 'https://onlyfans.com/alice', photo: 'javascript:alert(1)' }), SeoError);
});

test('"## " blocks: heading, then the rest of the block as a paragraph', () => {
  assert.equal(paragraphs('## Why\nBecause.\nReally.\n\nPlain one\nline two'), '<h2>Why</h2><p>Because.<br>Really.</p>\n<p>Plain one<br>line two</p>');
  assert.equal(paragraphs('## Only a heading'), '<h2>Only a heading</h2>');
  assert.equal(paragraphs('## <b>x</b>'), '<h2>&lt;b&gt;x&lt;/b&gt;</h2>');
});

test('rendering: meta, canonical, JSON-LD, tiles link to the creator profile, everything escaped', () => {
  const evil = '</script><script>alert(1)</script> & "q"';
  const html = renderPage(page({ h1: evil, title: 'T <i>', description: '"><img src=x onerror=alert(1)>', keywords: 'a, b', intro: evil, outro: `## ${evil}\n${evil}` }), { pages: [], creators, siteUrl: SITE });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /<h1>&lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;<\/h1>/);
  assert.match(html, /\\u003c\/script>/, 'JSON-LD cannot close its script tag');
  assert.match(html, /<link rel="canonical" href="https:\/\/faveradar\.xyz\/best-creators">/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<link rel="stylesheet" href="\/widget\.css">/);
  assert.match(html, /<script src="\/seo\.js" defer><\/script>/);
  assert.match(html, /<nav class="crumbs"[^>]*><a href="\/tops">Tops<\/a>/);
  const tiles = html.match(/<li class="tile">[\s\S]*?<\/li>/g);
  assert.equal(tiles.length, 2);
  assert.match(tiles[0], /href="https:\/\/faveradar\.xyz\/go\/alice_x" target="_blank" rel="nofollow noopener"/, 'through our /go redirect');
  const direct = renderPage(page(), { creators, siteUrl: SITE, profileSite: '' });
  assert.match(direct, /href="https:\/\/onlyfans\.com\/alice_x\/c12" target="_blank" rel="nofollow sponsored noopener"/, 'PROFILE_SITE empty → OnlyFans');
  assert.match(tiles[0], /alt="Alice OnlyFans"/);
  assert.match(tiles[0], /class="tick"/);
  assert.match(tiles[0], /<p class="bio-short">Hi &lt;there&gt;<\/p>/);
  assert.match(tiles[0], /@alice_x · Kyiv, Ukraine/);
  assert.doesNotMatch(html, /class="spec"/, 'own creators have no numbers');
  assert.match(tiles[1], /<span class="shot-initials">B<\/span>/, 'no photo → initials');
  const lds = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(lds.map((x) => x['@type']), ['BreadcrumbList', 'ItemList']);
  assert.equal(lds[1].itemListElement[0].url, 'https://www.faveradar.com/#/c/alice_x');
});

test('build: published pages, /tops, sitemap of published pages only, robots, stale pages removed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-seo-'));
  try {
    const pages = [page(), page({ slug: 'draft-page', h1: 'Draft', published: false }), page({ slug: 'second-top', h1: 'Second top' })];
    writeJsonAtomic(path.join(root, 'seo', 'pages.json'), pages);
    writeJsonAtomic(path.join(root, 'seo', 'creators.json'), creators);
    fs.mkdirSync(path.join(root, 'pages'));
    fs.writeFileSync(path.join(root, 'pages', 'old-page.html'), 'stale');

    const out = build({ root, siteUrl: SITE });
    assert.deepEqual(out.written.sort(), ['404.html', 'pages/best-creators.html', 'pages/home.html', 'pages/second-top.html', 'pages/tops.html', 'robots.txt', 'sitemap.xml']);
    // /home and every unknown address (404.html) show all creators; only /home is indexable
    const home = fs.readFileSync(path.join(root, 'pages', 'home.html'), 'utf8');
    const missing = fs.readFileSync(path.join(root, '404.html'), 'utf8');
    for (const html of [home, missing]) {
      assert.match(html, />Alice</);
      assert.match(html, />Bob</);
      assert.match(html, /rel="canonical" href="https:\/\/faveradar\.xyz\/home"/);
    }
    assert.match(home, /name="robots" content="index,follow"/);
    assert.match(missing, /name="robots" content="noindex,follow"/);
    assert.deepEqual(out.removed, ['pages/old-page.html']);
    assert.ok(!fs.existsSync(path.join(root, 'pages', 'draft-page.html')));

    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/faveradar\.xyz\/best-creators<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.match(sitemap, /<loc>https:\/\/faveradar\.xyz\/tops<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/faveradar\.xyz\/home<\/loc>/);
    assert.doesNotMatch(sitemap, /draft-page/);
    assert.equal(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\nSitemap: https://faveradar.xyz/sitemap.xml\n');

    const tops = fs.readFileSync(path.join(root, 'pages', 'tops.html'), 'utf8');
    assert.match(tops, /<link rel="canonical" href="https:\/\/faveradar\.xyz\/tops">/);
    assert.match(tops, /href="\/best-creators">Best creators/);
    assert.doesNotMatch(tops, /draft-page/);
    const first = fs.readFileSync(path.join(root, 'pages', 'best-creators.html'), 'utf8');
    assert.match(first, /<section class="related"[\s\S]*href="\/second-top">Second top<\/a>/, 'other published pages are linked');
    assert.doesNotMatch(first, /draft-page/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('seed data is valid', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const own = JSON.parse(fs.readFileSync(path.join(root, 'seo', 'creators.json'), 'utf8'));
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'seo', 'pages.json'), 'utf8'));
  for (const c of own) assert.deepEqual(validateCreator(c), c, c.username);
  for (const p of pages) validatePage(p, [], own);
});

test('photos: light AVIF/WebP copies when built, original URL otherwise; first row eager', async () => {
  const { imageBase } = await import('../seo/images.mjs');
  const base = imageBase('alice_x', 'https://img.example.com/a.jpg');
  assert.match(base, /^\/img\/c\/alice_x-[0-9a-f]{10}$/);
  assert.notEqual(base, imageBase('alice_x', 'https://img.example.com/other.jpg'), 'new photo, new file name');

  const withCopies = renderPage(page(), { creators, siteUrl: SITE, images: new Map([['alice_x', base]]) });
  assert.match(withCopies, new RegExp(`<source type="image/avif" srcset="${base}-320\.avif 320w, ${base}-640\.avif 640w"`));
  assert.match(withCopies, new RegExp(`<img src="${base}-640\.webp"[^>]*fetchpriority="high"`));
  assert.doesNotMatch(withCopies, /img\.example\.com\/a\.jpg"[^>]*decoding/, 'no original URL in the tile once copies exist');

  const plain = renderPage(page(), { creators, siteUrl: SITE });
  assert.match(plain, /<img src="https:\/\/img\.example\.com\/a\.jpg"[^>]*decoding="async"/);
  assert.doesNotMatch(plain, /loading="lazy"/, 'first row is not lazy');
});
