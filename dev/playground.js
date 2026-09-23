// Playground: builds a widget URL from the form and shows it in the iframe.
// The state is kept in the page address (#...), so a browser reload keeps your settings.
const FIELDS = [['rank', 'Место'], ['photo', 'Фото'], ['username', '@username'], ['place', 'Город/страна'], ['price', 'Цена'], ['likes', 'Лайки'], ['income', 'Доход'], ['cta', 'Кнопка']];
const SWATCHES = ['#fd37b7', '#ff3b5c', '#ff7a00', '#f5c400', '#22c55e', '#00b3ff', '#6366f1', '#a855f7'];

const form = document.getElementById('f');
const frame = document.getElementById('frame');
const $ = (s) => document.querySelector(s);

$('#fields').innerHTML = FIELDS.map(([k, l]) => `<label class="inline"><input type="checkbox" name="show" value="${k}" ${k === 'income' ? '' : 'checked'} /> ${l}</label>`).join('');
$('#swatches').innerHTML = SWATCHES.map((c) => `<button type="button" class="sw" data-c="${c}" title="${c}" aria-label="${c}"></button>`).join('');
document.querySelectorAll('.sw').forEach((b) => {
  b.style.background = b.dataset.c;
  b.addEventListener('click', () => {
    form.accent.value = b.dataset.c;
    form.useAccent.checked = true;
    update();
  });
});

// fill selects from the demo data itself
const demo = await fetch('/widget-api/data?view=top&count=50&sig=dev').then((r) => r.json());
const unique = (xs) => [...new Set(xs)].sort();
const opt = (v) => `<option value="${v}">${v}</option>`;
form.country.insertAdjacentHTML('beforeend', unique(demo.items.map((c) => c.place.split(', ')[1])).map(opt).join(''));
form.city.insertAdjacentHTML('beforeend', unique(demo.items.map((c) => c.place.split(', ')[0])).map(opt).join(''));
form.u.innerHTML = demo.items.map((c) => `<option value="${c.username}">${c.displayName} (@${c.username})</option>`).join('');

function widgetUrl() {
  const f = form.elements;
  const p = new URLSearchParams({ view: f.view.value });
  if (f.view.value === 'top') {
    p.set('type', f.type.value);
    if (f.country.value) p.set('country', f.country.value);
    if (f.city.value) p.set('city', f.city.value);
  }
  if (f.view.value === 'list') p.set('list', f.list.value);
  if (f.view.value === 'creator') p.set('u', f.u.value);
  if (['top', 'list'].includes(f.view.value)) {
    f.count.disabled = f.countAll.checked;
    p.set('count', f.countAll.checked ? 'all' : f.count.value || '10');
    p.set('layout', f.layout.value);
    const hide = [...form.querySelectorAll('input[name=show]')].filter((x) => !x.checked).map((x) => x.value);
    if (hide.length) p.set('hide', hide.join(','));
    if (!f.photos.checked) p.set('photos', '0');
  }
  p.set('theme', f.theme.value);
  p.set('lang', f.lang.value);
  if (f.useAccent.checked) p.set('accent', f.accent.value.replace('#', ''));
  p.set('sig', 'dev');
  return `/?${p}`;
}

function update() {
  const view = form.elements.view.value;
  document.querySelectorAll('[data-for]').forEach((el) => (el.hidden = !el.dataset.for.split(' ').includes(view)));
  try {
    if (form.age.checked) localStorage.setItem('fr:age', 'true');
    else localStorage.removeItem('fr:age');
  } catch {
    // storage blocked: the 18+ screen will show
  }
  const url = widgetUrl();
  $('#url').textContent = url;
  $('#open').href = url;
  frame.src = url;
  history.replaceState(null, '', `#${new URLSearchParams([...new FormData(form)])}`);
}

// restore the form from the page address
const saved = new URLSearchParams(location.hash.slice(1));
if ([...saved].length) {
  form.querySelectorAll('input[name=show]').forEach((x) => (x.checked = saved.getAll('show').includes(x.value)));
  for (const el of form.elements) {
    if (!el.name || el.name === 'show') continue;
    if (el.type === 'checkbox') el.checked = saved.has(el.name);
    else if (saved.has(el.name)) el.value = saved.get(el.name);
  }
}

form.addEventListener('change', update);
form.addEventListener('input', (e) => e.target.type === 'number' && update());
$('#reload').addEventListener('click', () => {
  frame.src = 'about:blank';
  setTimeout(() => (frame.src = widgetUrl()), 30);
});
document.querySelectorAll('#widths button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#widths button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  frame.style.width = Number(b.dataset.w) ? `${b.dataset.w}px` : '100%';
}));
update();
