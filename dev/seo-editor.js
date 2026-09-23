// SEO pages editor (local only). Reads and writes seo/pages.json and seo/creators.json through the dev server
// (/dev-api/seo/*), previews pages from the current data and runs the build (pages/*.html, sitemap.xml, robots.txt).
// Every value from the data is escaped before it goes into the HTML of this page.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = ['dev', 'pages', 'seo', 'tops', 'widget', 'sitemap', 'robots', 'index'];
const COUNTERS = { title: 60, description: 160 };
const $ = (s, root = document) => root.querySelector(s);

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugify = (v) => String(v ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
const httpsOnly = (u) => {
  try {
    return new URL(u).protocol === 'https:' ? u : '';
  } catch {
    return '';
  }
};
function usernameFromLink(link) {
  try {
    const u = new URL(String(link).trim());
    if (u.protocol !== 'https:' || !/(^|\.)onlyfans\.com$/i.test(u.hostname)) return '';
    const name = u.pathname.split('/').filter(Boolean)[0] || '';
    return /^[a-z0-9._-]{2,40}$/i.test(name) ? name : '';
  } catch {
    return '';
  }
}
/** "angel_roxie.x" → "Angel Roxie X" (a starting point for the name field). */
const nameFromUsername = (u) => String(u).split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

let toastTimer = 0;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', err);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

let pages = [];
let creators = [];

async function reload() {
  [pages, creators] = await Promise.all([api('/dev-api/seo/pages').then((d) => d.pages), api('/dev-api/seo/creators').then((d) => d.creators)]);
}
const creatorBy = (u) => creators.find((c) => c.username.toLowerCase() === String(u).toLowerCase());

// ================================================================= pages tab

const pagesPanel = $('#panel-pages');
let draft = null; // page being edited, plus originalSlug
let slugTouched = false;
let pickQuery = '';

function pagesTable() {
  if (!pages.length) return '<p class="muted">Страниц пока нет.</p>';
  return `<table><thead><tr><th>Заголовок</th><th>Адрес</th><th>Анкет</th><th>Статус</th><th></th></tr></thead><tbody>
    ${pages.map((p) => `<tr>
      <td><b>${esc(p.h1)}</b></td>
      <td><code>/${esc(p.slug)}</code></td>
      <td>${(p.creators || []).length}</td>
      <td><span class="badge${p.published ? ' on' : ''}">${p.published ? 'опубликована' : 'черновик'}</span></td>
      <td class="actions">
        <a href="/dev/preview/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Превью ↗</a>
        <button type="button" data-edit="${esc(p.slug)}">Изменить</button>
        <button type="button" class="btn-danger" data-del="${esc(p.slug)}">Удалить</button>
      </td></tr>`).join('')}
    </tbody></table>`;
}

const counter = (key) => {
  const n = String(draft[key] || '').length;
  return `<span class="count${n > COUNTERS[key] ? ' over' : ''}" id="pf-${key}-n">${n} / ${COUNTERS[key]}</span>`;
};

function slugProblem(slug) {
  if (!slug) return 'Нужен адрес';
  if (slug.length < 2 || slug.length > 80 || !SLUG_RE.test(slug)) return 'Только строчные латинские буквы и цифры, слова через один дефис, 2–80 символов';
  if (RESERVED.includes(slug)) return `«${slug}» — служебный адрес, выберите другой`;
  if (slug !== draft.originalSlug && pages.some((p) => p.slug === slug)) return `Адрес «${slug}» уже есть у другой страницы`;
  return '';
}

function pickerHtml() {
  const chosen = new Set(draft.creators.map((u) => u.toLowerCase()));
  const q = pickQuery.trim().toLowerCase();
  const found = creators.filter((c) => !q || c.username.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.place || '').toLowerCase().includes(q));
  const all = found.map((c) => `<li class="${chosen.has(c.username.toLowerCase()) ? 'added' : ''}">
      ${httpsOnly(c.photo) ? `<img class="thumb" src="${esc(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="thumb"></span>'}
      <span class="who"><b>${esc(c.name)}</b> <span class="muted">@${esc(c.username)}</span></span>
      <button type="button" data-pick="${esc(c.username)}" ${chosen.has(c.username.toLowerCase()) ? 'disabled' : ''} aria-label="Добавить @${esc(c.username)}">+</button></li>`).join('');
  const sel = draft.creators.map((u, i) => {
    const c = creatorBy(u);
    return `<li><span class="n">${i + 1}</span>
      <span class="who"><b>${esc(c ? c.name : u)}</b> <span class="muted">@${esc(u)}</span>${c ? '' : ' <span class="badge">нет в анкетах</span>'}</span>
      <button type="button" data-move="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Выше @${esc(u)}">↑</button>
      <button type="button" data-move="${i}:1" ${i === draft.creators.length - 1 ? 'disabled' : ''} aria-label="Ниже @${esc(u)}">↓</button>
      <button type="button" data-unpick="${i}" aria-label="Убрать @${esc(u)}">✕</button></li>`;
  }).join('');
  return `<div class="picker">
    <div class="box">
      <div class="row-between"><b>Все анкеты (${creators.length})</b>
        <span class="row"><button type="button" id="pick-all">Добавить всех</button></span></div>
      <input type="search" id="pick-q" placeholder="Поиск: имя, @username, город" value="${esc(pickQuery)}" aria-label="Поиск анкет">
      <ul class="pick-list">${all || '<li class="muted">Ничего не найдено</li>'}</ul>
    </div>
    <div class="box">
      <div class="row-between"><b>На странице, по порядку (${draft.creators.length})</b>
        <button type="button" id="pick-clear" ${draft.creators.length ? '' : 'disabled'}>Очистить</button></div>
      <ul class="pick-list">${sel || '<li class="muted">Добавьте анкеты слева</li>'}</ul>
    </div></div>`;
}

function pageFormHtml() {
  if (!draft) return '';
  const problem = slugProblem(draft.slug);
  return `<form class="box" id="page-form" novalidate>
    <div class="row-between"><h2>${draft.originalSlug ? `Страница /${esc(draft.originalSlug)}` : 'Новая страница'}</h2>
      ${draft.originalSlug ? `<a href="/dev/preview/${encodeURIComponent(draft.originalSlug)}" target="_blank" rel="noopener">Превью сохранённой версии ↗</a>` : ''}</div>
    <div class="seo-grid">
      <div class="box">
        <label>Заголовок H1 <input type="text" id="pf-h1" maxlength="120" value="${esc(draft.h1)}" placeholder="Best OnlyFans creators"></label>
        <label>Адрес страницы
          <span class="row"><input type="text" id="pf-slug" maxlength="80" spellcheck="false" autocomplete="off" value="${esc(draft.slug)}" aria-describedby="pf-slug-h" ${problem ? 'aria-invalid="true"' : ''}>
          <button type="button" id="pf-slug-auto">Из заголовка</button></span>
          <span class="hint" id="pf-slug-h">faveradar.xyz/<b id="pf-slug-show">${esc(draft.slug)}</b>${problem ? ` — <span class="error">${esc(problem)}</span>` : ''}</span></label>
        <label>Title (вкладка браузера и заголовок в Google) <input type="text" id="pf-title" maxlength="70" value="${esc(draft.title)}">
          <span class="row"><span class="hint">Лучше до 60 символов. Пусто — берётся H1.</span>${counter('title')}</span></label>
        <label>Description (текст под ссылкой в Google) <textarea id="pf-description" maxlength="200" rows="3">${esc(draft.description)}</textarea>
          <span class="row"><span class="hint">Лучше до 160 символов.</span>${counter('description')}</span></label>
        <label>Ключевые слова, через запятую <input type="text" id="pf-keywords" maxlength="300" value="${esc(draft.keywords)}" placeholder="best onlyfans creators, top onlyfans"></label>
        <label class="inline"><input type="checkbox" id="pf-published" ${draft.published ? 'checked' : ''}> Опубликована (попадёт в сборку и sitemap)</label>
      </div>
      <div class="box">
        <label>Текст над анкетами <textarea id="pf-intro" maxlength="4000" rows="6">${esc(draft.intro)}</textarea>
          <span class="hint">Обычный текст на английском. Пустая строка — новый абзац.</span></label>
        <label>Текст под анкетами <textarea id="pf-outro" maxlength="8000" rows="10">${esc(draft.outro)}</textarea>
          <span class="hint">Пустая строка — новый абзац. Строка «## Заголовок» в начале абзаца — подзаголовок, строки под ней — текст к нему.</span></label>
      </div>
    </div>
    <div id="picker">${pickerHtml()}</div>
    <p class="error" id="pf-err" role="alert"></p>
    <div class="row"><button type="submit" class="primary">Сохранить</button>
      <button type="button" id="pf-cancel">Отмена</button>
      <span class="hint">После сохранения нажмите «Собрать страницы», чтобы обновить файлы для Vercel.</span></div>
  </form>`;
}

function renderPages() {
  pagesPanel.innerHTML = `<div class="box">
      <div class="row-between"><h2>Страницы (${pages.length})</h2><button type="button" id="page-new" class="primary">Новая страница</button></div>
      ${pagesTable()}
    </div>
    <div class="mt">${pageFormHtml()}</div>`;
  wirePages();
}

function renderPicker() {
  const box = $('#picker', pagesPanel);
  const hadFocus = document.activeElement?.id === 'pick-q';
  const pos = hadFocus ? document.activeElement.selectionStart : 0;
  box.innerHTML = pickerHtml();
  if (hadFocus) {
    const q = $('#pick-q', box);
    q.focus();
    q.setSelectionRange(pos, pos);
  }
}

function openPage(slug) {
  const p = pages.find((x) => x.slug === slug);
  draft = p
    ? { ...JSON.parse(JSON.stringify(p)), originalSlug: p.slug }
    : { originalSlug: '', slug: '', title: '', description: '', keywords: '', h1: '', intro: '', outro: '', creators: [], published: false };
  draft.creators ||= [];
  slugTouched = Boolean(p);
  pickQuery = '';
  renderPages();
  $('#page-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#pf-h1').focus({ preventScroll: true });
}

function wirePages() {
  $('#page-new', pagesPanel).addEventListener('click', () => openPage(''));
  pagesPanel.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openPage(b.dataset.edit)));
  pagesPanel.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Удалить страницу /${b.dataset.del}? После сборки её адрес перестанет работать.`)) return;
    try {
      await api('/dev-api/seo/pages/delete', { slug: b.dataset.del });
      if (draft?.originalSlug === b.dataset.del) draft = null;
      await reload();
      renderPages();
      toast('Страница удалена. Не забудьте собрать страницы.');
    } catch (err) {
      toast(err.message, true);
    }
  }));

  const form = $('#page-form', pagesPanel);
  if (!form) return;
  const field = (id, key, after) => form.querySelector(id).addEventListener('input', (e) => {
    draft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    after?.(e);
  });
  const showSlug = () => {
    const slug = $('#pf-slug', form);
    const problem = slugProblem(draft.slug);
    if (problem) slug.setAttribute('aria-invalid', 'true');
    else slug.removeAttribute('aria-invalid');
    $('#pf-slug-h', form).innerHTML = `faveradar.xyz/<b id="pf-slug-show">${esc(draft.slug)}</b>${problem ? ` — <span class="error">${esc(problem)}</span>` : ''}`;
  };
  field('#pf-h1', 'h1', () => {
    if (slugTouched) return;
    draft.slug = slugify(draft.h1);
    $('#pf-slug', form).value = draft.slug;
    showSlug();
  });
  field('#pf-slug', 'slug', () => {
    slugTouched = true;
    showSlug();
  });
  $('#pf-slug-auto', form).addEventListener('click', () => {
    slugTouched = false;
    draft.slug = slugify(draft.h1);
    $('#pf-slug', form).value = draft.slug;
    showSlug();
  });
  for (const key of ['title', 'description']) {
    field(`#pf-${key}`, key, () => {
      const n = draft[key].length;
      const el = $(`#pf-${key}-n`, form);
      el.textContent = `${n} / ${COUNTERS[key]}`;
      el.classList.toggle('over', n > COUNTERS[key]);
    });
  }
  field('#pf-keywords', 'keywords');
  field('#pf-intro', 'intro');
  field('#pf-outro', 'outro');
  form.querySelector('#pf-published').addEventListener('change', (e) => (draft.published = e.target.checked));

  // creators picker (delegated: its HTML is redrawn on every change)
  const picker = $('#picker', form);
  picker.addEventListener('input', (e) => {
    if (e.target.id !== 'pick-q') return;
    pickQuery = e.target.value;
    renderPicker();
  });
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pick) draft.creators.push(b.dataset.pick);
    else if (b.dataset.unpick) draft.creators.splice(Number(b.dataset.unpick), 1);
    else if (b.dataset.move) {
      const [i, d] = b.dataset.move.split(':').map(Number);
      [draft.creators[i], draft.creators[i + d]] = [draft.creators[i + d], draft.creators[i]];
    } else if (b.id === 'pick-all') {
      const have = new Set(draft.creators.map((u) => u.toLowerCase()));
      for (const c of creators) if (!have.has(c.username.toLowerCase())) draft.creators.push(c.username);
    } else if (b.id === 'pick-clear') {
      if (!confirm('Убрать все анкеты с этой страницы?')) return;
      draft.creators = [];
    } else return;
    renderPicker();
  });

  $('#pf-cancel', form).addEventListener('click', () => {
    draft = null;
    renderPages();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pf-err', form);
    const problem = slugProblem(draft.slug);
    if (problem) {
      err.textContent = problem;
      $('#pf-slug', form).focus();
      return;
    }
    try {
      const { originalSlug, ...page } = draft;
      const saved = (await api('/dev-api/seo/pages/save', { page, originalSlug })).page;
      await reload();
      toast('Страница сохранена. Для Vercel нажмите «Собрать страницы».');
      openPage(saved.slug);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

// ================================================================= creators tab

const creatorsPanel = $('#panel-creators');
let cdraft = null; // creator being edited, plus originalUsername
let nameTouched = false;
let creatorQuery = '';

function usedIn(username) {
  const u = username.toLowerCase();
  return pages.filter((p) => (p.creators || []).some((x) => x.toLowerCase() === u)).length;
}

function creatorsRows() {
  const q = creatorQuery.trim().toLowerCase();
  const list = creators.filter((c) => !q || c.username.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.place || '').toLowerCase().includes(q));
  if (!list.length) return '<tr><td colspan="5" class="muted">Ничего не найдено</td></tr>';
  return list.map((c) => `<tr>
    <td>${httpsOnly(c.photo) ? `<img class="thumb" src="${esc(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="thumb"></span>'}</td>
    <td><b>${esc(c.name)}</b>${c.verified ? ' <span class="badge on">✓</span>' : ''}<div class="muted small">@${esc(c.username)}${c.place ? ` · ${esc(c.place)}` : ''}</div></td>
    <td class="small">${c.bio ? esc(c.bio.slice(0, 80)) + (c.bio.length > 80 ? '…' : '') : '<span class="muted">—</span>'}</td>
    <td class="small">${usedIn(c.username)}</td>
    <td class="actions">
      <a href="${esc(httpsOnly(c.link))}" target="_blank" rel="noopener noreferrer">OnlyFans ↗</a>
      <button type="button" data-cedit="${esc(c.username)}">Изменить</button>
      <button type="button" class="btn-danger" data-cdel="${esc(c.username)}">Удалить</button>
    </td></tr>`).join('');
}

function creatorFormHtml() {
  if (!cdraft) return '';
  const username = usernameFromLink(cdraft.link);
  const photo = httpsOnly(cdraft.photo);
  return `<form class="box" id="creator-form" novalidate>
    <h2>${cdraft.originalUsername ? `Анкета @${esc(cdraft.originalUsername)}` : 'Новая анкета'}</h2>
    <div class="seo-grid">
      <div class="box">
        <label>Ссылка на OnlyFans <input type="url" id="cf-link" inputmode="url" value="${esc(cdraft.link)}" placeholder="https://onlyfans.com/username/c123" aria-describedby="cf-link-h">
          <span class="hint" id="cf-link-h">${username ? `username: <b>@${esc(username)}</b>` : 'Только https://onlyfans.com/username (можно со ссылкой-трекером /c123)'}</span></label>
        <label>Имя <input type="text" id="cf-name" maxlength="80" value="${esc(cdraft.name)}"></label>
        <label>Город, страна (необязательно) <input type="text" id="cf-place" maxlength="80" value="${esc(cdraft.place)}" placeholder="Kyiv, Ukraine"></label>
        <label>Коротко о себе (необязательно, на английском) <textarea id="cf-bio" maxlength="1000" rows="4">${esc(cdraft.bio)}</textarea></label>
        <label class="inline"><input type="checkbox" id="cf-verified" ${cdraft.verified ? 'checked' : ''}> Верифицирована (галочка у имени)</label>
      </div>
      <div class="box">
        <label>Ссылка на фото (https) <input type="url" id="cf-photo" inputmode="url" value="${esc(cdraft.photo)}" placeholder="https://…/photo.jpg"></label>
        <div id="cf-thumb">${photo ? `<img class="thumb-lg" src="${esc(photo)}" alt="Превью фото" referrerpolicy="no-referrer">` : '<span class="hint">Превью появится здесь (только https).</span>'}</div>
      </div>
    </div>
    <p class="error" id="cf-err" role="alert"></p>
    <div class="row"><button type="submit" class="primary">Сохранить анкету</button><button type="button" id="cf-cancel">Отмена</button></div>
  </form>`;
}

function renderCreators() {
  creatorsPanel.innerHTML = `<div class="box">
      <div class="row-between"><h2>Свои анкеты (${creators.length})</h2><button type="button" id="creator-new" class="primary">Добавить анкету</button></div>
      <input type="search" id="creator-q" placeholder="Поиск: имя, @username, город" value="${esc(creatorQuery)}" aria-label="Поиск анкет">
      <table><thead><tr><th></th><th>Анкета</th><th>Описание</th><th>Страниц</th><th></th></tr></thead><tbody id="creator-rows">${creatorsRows()}</tbody></table>
    </div>
    <div class="mt">${creatorFormHtml()}</div>`;
  wireCreators();
}

function openCreator(username) {
  const c = username ? creatorBy(username) : null;
  cdraft = c ? { ...c, originalUsername: c.username } : { originalUsername: '', link: '', name: '', photo: '', bio: '', place: '', verified: false };
  nameTouched = Boolean(c);
  renderCreators();
  $('#creator-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#cf-link').focus({ preventScroll: true });
}

// delegated once: the table is redrawn on every change
creatorsPanel.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cedit], [data-cdel]');
  if (!b) return;
  if (b.dataset.cedit) return openCreator(b.dataset.cedit);
  const u = b.dataset.cdel;
  const n = usedIn(u);
  if (!confirm(`Удалить анкету @${u}?${n ? ` Она будет убрана со страниц: ${n}.` : ''}`)) return;
  try {
    await api('/dev-api/seo/creators/delete', { username: u });
    if (cdraft?.originalUsername === u) cdraft = null;
    await reload();
    renderCreators();
    toast('Анкета удалена');
  } catch (err) {
    toast(err.message, true);
  }
});

function wireCreators() {
  $('#creator-new', creatorsPanel).addEventListener('click', () => openCreator(''));
  $('#creator-q', creatorsPanel).addEventListener('input', (e) => {
    creatorQuery = e.target.value;
    $('#creator-rows', creatorsPanel).innerHTML = creatorsRows();
  });
  const form = $('#creator-form', creatorsPanel);
  if (!form) return;
  form.addEventListener('input', (e) => {
    const map = { 'cf-link': 'link', 'cf-name': 'name', 'cf-place': 'place', 'cf-bio': 'bio', 'cf-photo': 'photo', 'cf-verified': 'verified' };
    const key = map[e.target.id];
    if (!key) return;
    cdraft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (key === 'name') nameTouched = Boolean(cdraft.name.trim());
    if (key === 'link') {
      const u = usernameFromLink(cdraft.link);
      $('#cf-link-h', form).innerHTML = u ? `username: <b>@${esc(u)}</b>` : 'Только https://onlyfans.com/username (можно со ссылкой-трекером /c123)';
      if (u && !nameTouched) {
        cdraft.name = nameFromUsername(u);
        $('#cf-name', form).value = cdraft.name;
      }
    }
    if (key === 'photo') {
      const photo = httpsOnly(cdraft.photo.trim());
      $('#cf-thumb', form).innerHTML = photo
        ? `<img class="thumb-lg" src="${esc(photo)}" alt="Превью фото" referrerpolicy="no-referrer">`
        : `<span class="hint">${cdraft.photo.trim() ? 'Нужна ссылка https://' : 'Превью появится здесь (только https).'}</span>`;
    }
  });
  form.querySelector('#cf-verified').addEventListener('change', (e) => (cdraft.verified = e.target.checked));
  $('#cf-cancel', form).addEventListener('click', () => {
    cdraft = null;
    renderCreators();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#cf-err', form);
    try {
      const { originalUsername, ...creator } = cdraft;
      const out = await api('/dev-api/seo/creators/save', { creator, originalUsername });
      await reload();
      cdraft = null;
      renderCreators();
      toast(out.created ? `Анкета @${out.creator.username} добавлена` : `Анкета @${out.creator.username} сохранена`);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

// ================================================================= tabs, build

const tabs = [$('#tab-pages'), $('#tab-creators')];
function selectTab(tab, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
  }
  if (focus) tab.focus();
  // other tab may have changed the data (creators used by pages, counts)
  if (tab.id === 'tab-pages') {
    if (!draft) renderPages();
    else renderPicker();
  } else if (!cdraft) renderCreators();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    selectTab(tabs[(i + d + tabs.length) % tabs.length], true);
  });
});

$('#build').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const out = $('#build-out');
  btn.disabled = true;
  try {
    const r = await api('/dev-api/seo/build', {});
    out.classList.remove('err');
    out.innerHTML = `<b>Собрано файлов: ${r.written.length}</b>${r.removed.length ? ` · удалено устаревших: ${r.removed.length}` : ''}
      <ul>${[...r.written.map((f) => `<li><a href="/${esc(f === 'pages/tops.html' ? 'tops' : f.replace(/^pages\/(.*)\.html$/, '$1'))}" target="_blank" rel="noopener">${esc(f)}</a></li>`),
        ...r.removed.map((f) => `<li class="muted">удалён ${esc(f)}</li>`)].join('')}</ul>
      <span class="hint">Теперь выложите папку на Vercel — страницы появятся на faveradar.xyz.</span>`;
  } catch (err) {
    out.classList.add('err');
    out.textContent = `Не удалось собрать: ${err.message}`;
  }
  out.hidden = false;
  btn.disabled = false;
});

try {
  await reload();
  renderPages();
  renderCreators();
} catch (err) {
  pagesPanel.innerHTML = `<p class="error" role="alert">Не удалось загрузить данные: ${esc(err.message)}. Запущен ли npm run dev?</p>`;
}
