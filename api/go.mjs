// Vercel serverless function behind www.faveradar.xyz/go/<username> (vercel.json rewrite → /api/go?u=<username>):
// sends a Telegram click notice, then redirects to the creator's page on the FaveRadar site, which links on to
// OnlyFans. Works from the SEO pages and from the PDF alike (no script needed on the visitor's side).
// The target is always PROFILE_SITE + a validated username, so this can never become an open redirect.
import { sendNotice } from './notify.mjs';

export const PROFILE_SITE = (process.env.PROFILE_SITE || 'https://www.faveradar.com').replace(/\/+$/, '');
const USERNAME_RE = /^[a-z0-9._-]{2,40}$/i;

/** Where /go/<username> leads, or null for an invalid username. */
export function goTarget(username, profileSite = PROFILE_SITE) {
  const u = String(username || '').trim();
  if (!USERNAME_RE.test(u)) return null;
  return `${profileSite}/#/c/${encodeURIComponent(u)}`;
}

/** Click event for the Telegram notice; the page the visitor came from is the Referer (none from a PDF). */
export function goEvent(username, target, headers = {}) {
  const from = String(headers.referer || '');
  return {
    type: 'click',
    page: from ? from.slice(0, 300) : 'PDF или прямая ссылка',
    label: `@${username}`,
    dest: target,
    referrer: '',
    host: '',
  };
}

export default async function handler(req, res) {
  const u = String((req.query && req.query.u) || '');
  const target = goTarget(u);
  if (!target) {
    res.statusCode = 302;
    res.setHeader('Location', '/home');
    return res.end();
  }
  const h = req.headers || {};
  // link previews (Telegram, WhatsApp…) open links too: no notice for obvious bots
  const bot = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slurp|curl|wget/i.test(String(h['user-agent'] || ''));
  if (!bot) await sendNotice(goEvent(u, target, h), h, 1500); // short wait: the visitor is waiting for the redirect
  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-store'); // every click must reach this function
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res.end();
}

