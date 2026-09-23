// node --test dev/notify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { cleanEvent, formatMessage } from '../api/notify.mjs';

const mockRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

test('events: only visit/click, fields cut and stripped of control characters', () => {
  assert.equal(cleanEvent({ type: 'hack' }), null);
  assert.equal(cleanEvent('not json'), null);
  const ev = cleanEvent(JSON.stringify({ type: 'click', label: 'Ella\n\u0000 X', dest: 'https://onlyfans.com/x'.padEnd(900, 'x') }));
  assert.equal(ev.label, 'Ella X');
  assert.equal(ev.dest.length, 300);
});

test('message: click and visit text, geo from Cloudflare first, bots marked', () => {
  const click = formatMessage(cleanEvent({ type: 'click', label: 'Ella', dest: 'https://onlyfans.com/ellablonde', page: '/best' }), {
    'cf-connecting-ip': '1.2.3.4', 'cf-ipcountry': 'UA', 'cf-ipcity': 'Kyiv', 'x-vercel-ip-city': 'Frankfurt',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
  });
  assert.match(click, /Переход на анкету/);
  assert.match(click, /Анкета: Ella/);
  assert.match(click, /🇺🇦 UA/);
  assert.match(click, /Город: Kyiv/);
  assert.doesNotMatch(click, /Frankfurt/, 'behind Cloudflare the Vercel city is its data centre');
  assert.match(click, /Мобильный · iOS/);
  assert.match(click, /Похоже на человека/);

  const visit = formatMessage(cleanEvent({ type: 'visit', page: 'widget ?view=top', host: 'https://script.google.com/' }), {
    'x-vercel-ip-country': 'DE', 'user-agent': 'Googlebot/2.1',
  });
  assert.match(visit, /Заход на faveradar\.xyz/);
  assert.match(visit, /Источник: прямой заход/);
  assert.match(visit, /Виджет встроен на: https:\/\/script\.google\.com\//);
  assert.match(visit, /Похоже на бота/);
});

test('handler: POST only, own origin only, quiet when the bot is not configured', async () => {
  delete process.env.TG_TOKEN;
  delete process.env.TG_CHAT_ID;
  let r = mockRes();
  await handler({ method: 'GET', headers: {} }, r);
  assert.equal(r.code, 405);
  r = mockRes();
  await handler({ method: 'POST', headers: { host: 'www.faveradar.xyz', origin: 'https://evil.example' }, body: '{"type":"visit"}' }, r);
  assert.equal(r.code, 403);
  r = mockRes();
  await handler({ method: 'POST', headers: { host: 'www.faveradar.xyz', origin: 'https://www.faveradar.xyz' }, body: '{"type":"nope"}' }, r);
  assert.equal(r.code, 400);
  r = mockRes();
  await handler({ method: 'POST', headers: { host: 'www.faveradar.xyz', origin: 'https://www.faveradar.xyz' }, body: '{"type":"visit","page":"/best"}' }, r);
  assert.deepEqual([r.code, r.body.error], [200, 'not-configured']);
});
