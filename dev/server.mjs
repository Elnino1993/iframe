// Local development server for the widget: no dependencies, no FaveRadar server needed.
//   npm run dev            → http://localhost:5173/dev/        (widget playground with every option)
//                            http://localhost:5173/dev/seo.html (SEO pages and own creators editor)
//   PORT=8080 npm run dev  → another port
//
// Serves the real widget files from this folder, answers /widget-api/data with demo data (dev/mock.mjs)
// and replaces config.js with a local one, so your production config.js is never touched.
// SEO pages: /dev-api/seo/* reads and writes seo/*.json (from this computer only), /dev/preview/<slug> shows a
// page from the current data (drafts too), and /<slug>, /tops, /sitemap.xml, /robots.txt serve the built files
// the way Vercel does (vercel.json rewrites).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { widgetData, profileUrl } from './mock.mjs';
import {
  SLUG_RE, SeoError, loadData, writeJsonAtomic, dataPath, validatePage, validateCreator, renderPage, renderIndex, build,
} from '../seo/build.mjs';
import { optimizeImages, localImages } from '../seo/images.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');

function sendFile(res, file) {
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

// ---------------------------------------------------------------- SEO editor API (this computer only)

const isLoopback = (ip) => /^(127\.|::1$|::ffff:127\.)/.test(String(ip || ''));

async function readBody(req, max = 256 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new SeoError('Слишком большой запрос');
    chunks.push(c);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch {
    throw new SeoError('Нужен JSON-объект');
  }
}

const savePages = (pages) => writeJsonAtomic(dataPath(ROOT, 'pages.json'), pages);
const saveCreators = (creators) => writeJsonAtomic(dataPath(ROOT, 'creators.json'), creators);

async function seoApi(req, res, p) {
  // writes only from this machine, and only from our own pages: JSON bodies force a CORS preflight that this
  // server never answers, and the Origin (when sent) must be this server
  if (!isLoopback(req.socket.remoteAddress)) return sendJson(res, 403, { error: 'Редактор доступен только с этого компьютера' });
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: 'Чужой сайт' });
  if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) {
    return sendJson(res, 415, { error: 'Нужен Content-Type: application/json' });
  }

  const data = loadData(ROOT);
  if (req.method === 'GET' && p === '/dev-api/seo/pages') return sendJson(res, 200, { pages: data.pages });
  if (req.method === 'GET' && p === '/dev-api/seo/creators') return sendJson(res, 200, { creators: data.creators });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const body = await readBody(req);
  if (p === '/dev-api/seo/pages/save') {
    const original = String(body.originalSlug || '');
    const page = validatePage(body.page, data.pages, data.creators, original);
    const i = original ? data.pages.findIndex((x) => x.slug === original) : -1;
    if (original && i === -1) return sendJson(res, 404, { error: 'Страница не найдена' });
    if (i === -1) data.pages.push(page);
    else data.pages[i] = page;
    savePages(data.pages);
    return sendJson(res, 200, { page });
  }
  if (p === '/dev-api/seo/pages/delete') {
    const next = data.pages.filter((x) => x.slug !== body.slug);
    if (next.length === data.pages.length) return sendJson(res, 404, { error: 'Страница не найдена' });
    savePages(next);
    return sendJson(res, 200, { ok: true });
  }
  if (p === '/dev-api/seo/creators/save') {
    const creator = validateCreator(body.creator);
    const original = String(body.originalUsername || '').toLowerCase();
    const i = data.creators.findIndex((c) => c.username.toLowerCase() === (original || creator.username.toLowerCase()));
    const clash = data.creators.findIndex((c) => c.username.toLowerCase() === creator.username.toLowerCase());
    if (clash !== -1 && clash !== i) return sendJson(res, 409, { error: `Анкета @${creator.username} уже есть` });
    if (original && i === -1) return sendJson(res, 404, { error: 'Анкета не найдена' });
    if (i === -1) {
      data.creators.push(creator);
    } else {
      const old = data.creators[i].username;
      data.creators[i] = creator;
      // the link now points at another username: keep the pages that showed this creator
      if (old !== creator.username) {
        for (const pg of data.pages) pg.creators = (pg.creators || []).map((u) => (u === old ? creator.username : u));
        savePages(data.pages);
      }
    }
    saveCreators(data.creators);
    return sendJson(res, 200, { creator, created: i === -1 });
  }
  if (p === '/dev-api/seo/creators/delete') {
    const u = String(body.username || '').toLowerCase();
    const next = data.creators.filter((c) => c.username.toLowerCase() !== u);
    if (next.length === data.creators.length) return sendJson(res, 404, { error: 'Анкета не найдена' });
    let pagesTouched = 0;
    for (const pg of data.pages) {
      const before = (pg.creators || []).length;
      pg.creators = (pg.creators || []).filter((x) => x.toLowerCase() !== u);
      if (pg.creators.length !== before) pagesTouched += 1;
    }
    if (pagesTouched) savePages(data.pages);
    saveCreators(next);
    return sendJson(res, 200, { ok: true, pagesTouched });
  }
  if (p === '/dev-api/seo/build') {
    // light photo copies first (downloads only new photos), then the HTML that points at them
    const images = await optimizeImages({ root: ROOT, creators: data.creators });
    return sendJson(res, 200, { ...build({ root: ROOT, data }), images });
  }
  return sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }

  if (p.startsWith('/dev-api/seo/')) {
    try {
      return await seoApi(req, res, p);
    } catch (err) {
      if (err instanceof SeoError) return sendJson(res, 400, { error: err.message });
      console.error(err);
      return sendJson(res, 500, { error: err.message });
    }
  }
  if (p === '/widget-api/data') {
    const out = widgetData(url.search, `http://${req.headers.host}`);
    return send(res, out.status, JSON.stringify(out.body), 'application/json; charset=utf-8');
  }
  if (p === '/config.js') {
    return send(res, 200, '// dev: data from this local server (dev/mock.mjs)\nwindow.FAVERADAR_WIDGET = { api: "" };\n', TYPES['.js']);
  }
  const go = p.match(/^\/go\/([^/]+)\/([^/]+)$/);
  if (go) {
    // like the real counter: straight on to the creator's OnlyFans link
    const target = profileUrl(go[2]);
    if (target) return send(res, 302, '', undefined, { Location: target });
    return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Click</title><body style="font:16px system-ui;background:#000;color:#fff;padding:24px">
      <p>Клик по анкете <b>@${go[2].replace(/[<>&"]/g, '')}</b> (${go[1].replace(/[<>&"]/g, '')}).</p>
      <p style="color:#a3a3ad">В рабочем виджете здесь сервер засчитывает клик и перенаправляет на ссылку анкеты.</p>`, TYPES['.html']);
  }
  if (p === '/' && !url.searchParams.has('sig')) {
    return send(res, 302, '', undefined, { Location: '/dev/' });
  }

  // SEO page from the current data, drafts included (not built yet)
  const preview = p.match(/^\/dev\/preview\/([a-z0-9-]+)$/);
  if (preview) {
    const data = loadData(ROOT);
    if (preview[1] === 'tops') return send(res, 200, renderIndex(data), TYPES['.html']);
    const page = data.pages.find((x) => x.slug === preview[1]);
    return page ? send(res, 200, renderPage(page, { ...data, images: localImages(ROOT, data.creators) }), TYPES['.html']) : send(res, 404, 'Такой страницы нет в seo/pages.json');
  }
  // built SEO pages, like the vercel.json rewrites: /tops and /<slug> → pages/<slug>.html
  if (p === '/tops') return sendFile(res, path.join(ROOT, 'pages', 'tops.html'));
  const slug = p.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (slug && SLUG_RE.test(slug[1]) && !fs.existsSync(path.join(ROOT, slug[1]))) {
    return sendFile(res, path.join(ROOT, 'pages', `${slug[1]}.html`));
  }

  let rel = p === '/' ? '/index.html' : p;
  if (rel.endsWith('/')) rel += 'index.html';
  return sendFile(res, path.normalize(path.join(ROOT, rel)));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy: the dev server is probably already running. Open http://localhost:${PORT}/dev/`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Widget dev server: http://localhost:${PORT}/dev/`);
  console.log(`SEO pages editor:  http://localhost:${PORT}/dev/seo.html`);
  console.log('Edit widget.js / widget.css and reload the page. Stop: Ctrl+C');
});
