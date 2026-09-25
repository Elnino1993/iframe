// PDF catalogue of the own creators (seo/creators.json) with clickable links:
//   node seo/pdf.mjs                 → dist/faveradar-creators.pdf
//   node seo/pdf.mjs --page <slug>   → only the creators of that SEO page, in its order
// Photo and "View profile" open the creator's page on faveradar.com (PROFILE_SITE= for the OnlyFans link). Uses the light copies in img/c when they exist
// (run the SEO build first), and headless Chrome or Edge to print. Nothing here is published.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, SITE_URL, esc, loadData, creatorsOf, goHref } from './build.mjs';
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
  const tile = (c, i) => {
    const href = esc(goHref(c)); // www.faveradar.xyz/go/<user> → Telegram notice → profile on faveradar.com
    const src = photo(c);
    const pic = src ? `<img src="${esc(src)}" alt="">` : `<span class="ini">${esc(initials(c.name))}</span>`;
    const meta = ['@' + c.username, c.place].filter(Boolean).join(' · ');
    const bio = String(c.bio || '').replace(/\s+/g, ' ').trim();
    return `<li class="tile">
  <a class="shot" href="${href}">${pic}</a>
  <div class="cap">
    <div class="head"><span class="num${i < 3 ? ' top' : ''}">${i + 1}</span>
      <div class="who"><div class="name"><span class="nm">${esc(c.name)}</span>${c.verified ? TICK : ''}</div><div class="meta">${esc(meta)}</div></div></div>
    <p class="bio">${esc(bio)}</p>
    <a class="cta" href="${href}">View profile ${ARROW}</a>
  </div>
</li>`;
  };
  // fixed pages: every A4 sheet is fully dark and holds the same 3 × 4 grid, so rows line up page after page
  const PER_PAGE = 12;
  const sheets = [];
  for (let i = 0; i < Math.max(1, creators.length); i += PER_PAGE) sheets.push(creators.slice(i, i + PER_PAGE).map((c, k) => tile(c, i + k)));
  const date = new Date().toISOString().slice(0, 10);
  const site = `<a class="site" href="${esc(SITE_URL)}/tops">${esc(SITE_URL.replace(/^https:\/\//, ''))}</a>`;
  const pages = sheets.map((tiles, n) => `<section class="sheet">
<header><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${site}</header>
<ol>
${tiles.join('\n')}
</ol>
<footer><span>Tap a photo or "View profile" to open the creator's profile. Not affiliated with OnlyFans.</span><span>${date} · ${n + 1} / ${sheets.length}</span></footer>
</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: 210mm 297mm; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #000; color: #f2f2f2; font: 10pt/1.35 system-ui, 'Segoe UI', Roboto, Arial, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .sheet { width: 210mm; height: 297mm; padding: 12mm 11mm 10mm; display: grid; grid-template-rows: 17mm 1fr 7mm; row-gap: 5mm; overflow: hidden; break-after: page; }
  .sheet:last-child { break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; border-bottom: 0.3mm solid #3a3a3a; padding-bottom: 3mm; }
  h1 { margin: 0; font-size: 20pt; line-height: 1.1; letter-spacing: -0.02em; }
  header p { margin: 1.5mm 0 0; color: #9b9b9b; font-size: 9pt; }
  .site { color: #ff5cc6; white-space: nowrap; font-weight: 600; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(3, 1fr); gap: 6mm 5mm; min-height: 0; }
  .tile { display: grid; grid-template-rows: 1fr auto; row-gap: 2.5mm; min-height: 0; }
  .shot { display: grid; place-items: center; min-height: 0; overflow: hidden; border-radius: 1mm; background: #111; }
  .shot img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 25%; display: block; }
  .ini { color: #9b9b9b; font-size: 24pt; font-weight: 300; }
  .cap { display: grid; grid-template-rows: 9mm 4mm 8mm; row-gap: 1.5mm; }
  .head { display: flex; gap: 2mm; align-items: flex-start; min-width: 0; }
  .num { font-size: 16pt; line-height: 1; font-weight: 300; color: #9b9b9b; min-width: 6mm; flex: none; font-variant-numeric: tabular-nums; }
  .num.top { color: #ff5cc6; font-weight: 400; }
  .who { min-width: 0; flex: 1; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 1mm; min-width: 0; line-height: 1.2; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tick { width: 3.2mm; height: 3.2mm; color: #ff5cc6; flex: none; }
  .meta { color: #9b9b9b; font-size: 8pt; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bio { margin: 0; color: #9b9b9b; font-size: 7.5pt; line-height: 4mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cta { display: flex; align-items: center; justify-content: center; gap: 1.5mm; border-radius: 1mm; background: #fd37b7; color: #000; font-weight: 700; font-size: 9pt; }
  .cta svg { width: 3mm; height: 3mm; }
  footer { border-top: 0.3mm solid #262626; padding-top: 2mm; color: #9b9b9b; font-size: 7.5pt; display: flex; justify-content: space-between; gap: 6mm; }
</style></head>
<body>
${pages}
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
