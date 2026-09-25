// PDF catalogue of the own creators (seo/creators.json) with clickable links:
//   node seo/pdf.mjs                 → dist/faveradar-creators.pdf
//   node seo/pdf.mjs --page <slug>   → only the creators of that SEO page, in its order
// Photo and "View profile" open the creator's OnlyFans link. Uses the light copies in img/c when they exist
// (run the SEO build first), and headless Chrome or Edge to print. Nothing here is published.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, SITE_URL, esc, loadData, creatorsOf } from './build.mjs';
import { localImages } from './images.mjs';

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11l6-6M6 5h5v5"/></svg>';
const TICK = '<svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM5.3 8.2l1.8 1.8 3.6-3.9"/></svg>';
const initials = (n) => String(n).split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();
const https = (u) => (/^https:\/\//.test(String(u || '')) ? String(u) : '');

/** photos: Map username → local file (JPEG) to embed; creators without one fall back to their photo URL. */
export function renderPdfHtml({ creators, title, subtitle, photos = new Map() }) {
  const photo = (c) => {
    const file = photos.get(String(c.username).toLowerCase());
    return file ? pathToFileURL(file).href : https(c.photo);
  };
  const tiles = creators.map((c, i) => {
    const href = esc(https(c.link));
    const src = photo(c);
    const pic = src ? `<img src="${esc(src)}" alt="">` : `<span class="ini">${esc(initials(c.name))}</span>`;
    const meta = ['@' + c.username, c.place].filter(Boolean).join(' · ');
    const bio = String(c.bio || '').replace(/\s+/g, ' ').trim();
    return `<li class="tile">
  <a class="shot" href="${href}">${pic}</a>
  <div class="cap">
    <div class="head"><span class="num${i < 3 ? ' top' : ''}">${i + 1}</span>
      <div class="who"><div class="name">${esc(c.name)}${c.verified ? TICK : ''}</div><div class="meta">${esc(meta)}</div></div></div>
    ${bio ? `<p class="bio">${esc(bio.length > 140 ? `${bio.slice(0, 139).trimEnd()}…` : bio)}</p>` : ''}
    <a class="cta" href="${href}">View profile ${ARROW}</a>
  </div>
</li>`;
  }).join('\n');
  const date = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm 11mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #000; color: #f2f2f2; font: 10pt/1.4 system-ui, 'Segoe UI', Roboto, Arial, sans-serif; }
  a { color: inherit; text-decoration: none; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12mm; padding-bottom: 4mm; margin-bottom: 6mm; border-bottom: 0.3mm solid #3a3a3a; }
  h1 { margin: 0; font-size: 22pt; line-height: 1.1; letter-spacing: -0.02em; }
  header p { margin: 2mm 0 0; color: #9b9b9b; }
  .site { color: #ff5cc6; white-space: nowrap; font-weight: 600; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 7mm 5mm; }
  .tile { break-inside: avoid; display: flex; flex-direction: column; gap: 2.5mm; }
  .shot { display: grid; place-items: center; aspect-ratio: 4 / 5; overflow: hidden; border-radius: 1mm; background: #111; }
  .shot img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 25%; display: block; }
  .ini { color: #9b9b9b; font-size: 24pt; font-weight: 300; }
  .cap { display: flex; flex-direction: column; gap: 2mm; flex: 1; }
  .head { display: flex; gap: 2mm; align-items: flex-start; }
  .num { font-size: 16pt; line-height: 1; font-weight: 300; color: #9b9b9b; min-width: 5mm; }
  .num.top { color: #ff5cc6; font-weight: 400; }
  .who { min-width: 0; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 1mm; }
  .tick { width: 3.2mm; height: 3.2mm; color: #ff5cc6; flex: none; }
  .meta { color: #9b9b9b; font-size: 8pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bio { margin: 0; color: #9b9b9b; font-size: 8pt; }
  .cta { margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 1.5mm; height: 8mm; border-radius: 1mm; background: #fd37b7; color: #000; font-weight: 700; font-size: 9pt; }
  .cta svg { width: 3mm; height: 3mm; }
  footer { margin-top: 8mm; padding-top: 3mm; border-top: 0.3mm solid #262626; color: #9b9b9b; font-size: 8pt; display: flex; justify-content: space-between; }
</style></head>
<body>
<header><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><a class="site" href="${esc(SITE_URL)}/tops">${esc(SITE_URL.replace(/^https:\/\//, ''))}</a></header>
<ol>
${tiles}
</ol>
<footer><span>Tap a photo or "View profile" to open the creator's OnlyFans page. Not affiliated with OnlyFans.</span><span>${date}</span></footer>
</body></html>`;
}

function findBrowser() {
  return BROWSERS.find((p) => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  });
}

/** Writes the PDF and returns its path. */
export function makePdf({ root = ROOT, slug = '', out = path.join(root, 'dist', slug ? `faveradar-${slug}.pdf` : 'faveradar-creators.pdf') } = {}) {
  const data = loadData(root);
  let creators = data.creators;
  let title = 'OnlyFans creators';
  let subtitle = `${creators.length} hand-picked profiles`;
  if (slug) {
    const page = data.pages.find((p) => p.slug === slug);
    if (!page) throw new Error(`No page "${slug}" in seo/pages.json`);
    creators = creatorsOf(page, data.creators);
    title = page.h1;
    subtitle = page.description || `${creators.length} profiles`;
  }
  const browser = findBrowser();
  if (!browser) throw new Error('Chrome or Edge not found (set CHROME_PATH)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-pdf-'));
  try {
    const html = path.join(tmp, 'catalogue.html');
    // Chrome embeds JPEG as is but stores WebP losslessly (10x bigger), so print from JPEG copies
    const photos = new Map();
    for (const [user, base] of localImages(root, creators)) {
      const jpg = path.join(tmp, `${photos.size}.jpg`);
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(root, `${base}-640.webp`), '-q:v', '4', jpg]);
      if (r.status === 0) photos.set(user, jpg);
    }
    fs.writeFileSync(html, renderPdfHtml({ creators, title, subtitle, photos }));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(tmp, 'profile')}`,
      '--allow-file-access-from-files', '--no-pdf-header-footer', '--virtual-time-budget=15000',
      `--print-to-pdf=${out}`, pathToFileURL(html).href,
    ], { encoding: 'utf8', timeout: 120000 });
    if (!fs.existsSync(out)) throw new Error(`PDF was not created: ${(r.stderr || '').trim().split('\n').pop()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const i = process.argv.indexOf('--page');
  const out = makePdf({ slug: i > -1 ? process.argv[i + 1] : '' });
  console.log(`[pdf] ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}
