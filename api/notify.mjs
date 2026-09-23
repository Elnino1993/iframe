// Vercel serverless function /api/notify: page visits and profile clicks → a Telegram message.
// The bot token and chat id live only in Vercel environment variables (TG_TOKEN, TG_CHAT_ID),
// never in the pages. Country/city come from the platform headers (Cloudflare first, then Vercel).
// Optional: TG_NOTIFY_VISITS=0 or TG_NOTIFY_CLICKS=0 turns one kind of message off.

const TYPES = ['visit', 'click'];
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const dec = (v) => {
  try { return decodeURIComponent(String(v || '')); } catch { return String(v || ''); }
};

/** Validated event from the page, or null. */
export function cleanEvent(body) {
  let b = body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { return null; }
  }
  if (!b || typeof b !== 'object' || !TYPES.includes(b.type)) return null;
  return {
    type: b.type,
    page: str(b.page, 300),
    referrer: str(b.referrer, 300),
    host: str(b.host, 300), // page that embeds the widget (iframe), if any
    label: str(b.label, 100),
    dest: str(b.dest, 300),
  };
}

/** Plain-text Telegram message for one event (no parse mode: nothing from the page is interpreted). */
export function formatMessage(ev, headers = {}) {
  const h = headers;
  const viaCF = Boolean(h['cf-connecting-ip']);
  const ip = String(h['cf-connecting-ip'] || h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim() || '?';
  let cc = String(h['cf-ipcountry'] || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === 'XX' || cc === 'T1') cc = viaCF ? '' : String(h['x-vercel-ip-country'] || '').toUpperCase();
  const city = dec(h['cf-ipcity'] || (viaCF ? '' : h['x-vercel-ip-city'])) || '?';
  const region = dec(h['cf-region'] || (viaCF ? '' : h['x-vercel-ip-country-region']));
  const ua = str(h['user-agent'] || '?', 300);
  const flag = /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(0x1f1e6 + cc.charCodeAt(0) - 65, 0x1f1e6 + cc.charCodeAt(1) - 65) : '🏳️';
  const os = /windows/i.test(ua) ? 'Windows' : /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS'
    : /mac os|macintosh/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Другое';
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
  let browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /firefox\//i.test(ua) ? 'Firefox'
    : /chrome\/|crios\//i.test(ua) ? 'Chrome' : /safari\//i.test(ua) ? 'Safari' : 'Другой';
  if (/instagram/i.test(ua)) browser = 'Instagram (in-app)';
  else if (/tiktok|musical_ly|bytedance|trill|aweme/i.test(ua)) browser = 'TikTok (in-app)';
  else if (/snapchat/i.test(ua)) browser = 'Snapchat (in-app)';
  else if (/telegram/i.test(ua)) browser = 'Telegram (in-app)';
  const human = !/bot|crawl|spider|headless|lighthouse|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|go-http/i.test(ua);

  const head = ev.type === 'click'
    ? ['💘 Переход на анкету', ev.label ? `Анкета: ${ev.label}` : null, `Ссылка: ${ev.dest || '?'}`, `Со страницы: ${ev.page || '?'}`]
    : ['👁 Заход на faveradar.xyz', `Страница: ${ev.page || '?'}`, `Источник: ${ev.referrer || 'прямой заход'}`];
  return [
    human ? '✅ Похоже на человека' : '🤖 Похоже на бота',
    ...head,
    ev.host ? `Виджет встроен на: ${ev.host}` : null,
    `Страна: ${flag} ${cc || '?'}`,
    `Город: ${city}${region ? `, ${region}` : ''}`,
    `Устройство: ${mobile ? 'Мобильный' : 'Десктоп'} · ${os}`,
    `Браузер: ${browser}`,
    `IP: ${ip}`,
    `UA: ${ua}`,
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const h = req.headers || {};
  // only our own pages may report (the widget posts from its own origin even inside someone's iframe)
  const host = String(h.host || '');
  const origin = String(h.origin || h.referer || '');
  if (origin && host && !origin.includes(host)) return res.status(403).json({ ok: false });

  const ev = cleanEvent(req.body);
  if (!ev) return res.status(400).json({ ok: false });
  const token = process.env.TG_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) return res.status(200).json({ ok: false, error: 'not-configured' });
  if (ev.type === 'visit' && process.env.TG_NOTIFY_VISITS === '0') return res.status(200).json({ ok: true, skipped: true });
  if (ev.type === 'click' && process.env.TG_NOTIFY_CLICKS === '0') return res.status(200).json({ ok: true, skipped: true });

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: formatMessage(ev, h), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // a Telegram hiccup never breaks the page
  }
  return res.status(200).json({ ok: true });
}
