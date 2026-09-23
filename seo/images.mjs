// Light copies of creator photos for the SEO pages, served from our own domain (faveradar.xyz/img/c/…).
// Each photo is downloaded once, cropped to the 4:5 tile and saved as AVIF + WebP in two widths
// (320 px for phones, 640 px for wide/retina screens). The file name carries a hash of the source URL,
// so a changed photo gets a new name and old copies can be cached forever.
// Needs ffmpeg on PATH; without it the pages simply keep the original photo URLs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const IMG_DIR = path.join('img', 'c');
export const WIDTHS = [320, 640];
export const FORMATS = ['avif', 'webp'];

const safeName = (u) => String(u).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40);

/** Public path prefix (without size/extension) of the light copies for one creator photo. */
export function imageBase(username, photo) {
  const hash = crypto.createHash('sha1').update(String(photo)).digest('hex').slice(0, 10);
  return `/img/c/${safeName(username)}-${hash}`;
}

const variants = (base) => WIDTHS.flatMap((w) => FORMATS.map((f) => `${base}-${w}.${f}`));

/** Map username → base path, only for creators whose every light copy exists on disk. */
export function localImages(root, creators) {
  const out = new Map();
  for (const c of creators) {
    if (!/^https:\/\//.test(String(c.photo || ''))) continue;
    const base = imageBase(c.username, c.photo);
    if (variants(base).every((v) => fs.existsSync(path.join(root, v)))) out.set(String(c.username).toLowerCase(), base);
  }
  return out;
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' });
  return r.status === 0;
}

function encode(src, out, width, format) {
  const h = Math.round((width * 5) / 4);
  // fill the 4:5 box, keep the upper part of the frame (faces), like object-position: 50% 25%
  const vf = `scale=${width}:${h}:force_original_aspect_ratio=increase,crop=${width}:${h}:(iw-${width})/2:(ih-${h})*0.25`;
  const codec = format === 'avif'
    ? ['-vf', `${vf},format=yuv420p`, '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '34', '-cpu-used', '6']
    : ['-vf', vf, '-c:v', 'libwebp', '-quality', '72', '-compression_level', '6'];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...codec, '-frames:v', '1', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'ffmpeg failed').trim().split('\n').pop());
}

/**
 * Makes the missing light copies and deletes copies no creator uses any more.
 * @returns {Promise<{ made: string[], failed: string[], removed: string[], skipped?: string }>}
 */
export async function optimizeImages({ root, creators }) {
  const dir = path.join(root, IMG_DIR);
  const result = { made: [], failed: [], removed: [] };
  const wanted = new Map();
  for (const c of creators) {
    if (/^https:\/\//.test(String(c.photo || ''))) wanted.set(imageBase(c.username, c.photo), c);
  }
  fs.mkdirSync(dir, { recursive: true });
  const keep = new Set([...wanted.keys()].flatMap(variants).map((v) => path.basename(v)));
  for (const f of fs.readdirSync(dir)) {
    if (!keep.has(f)) {
      fs.rmSync(path.join(dir, f));
      result.removed.push(`img/c/${f}`);
    }
  }
  if (!hasFfmpeg()) return { ...result, skipped: 'ffmpeg not found: pages keep the original photo URLs' };

  const tmp = fs.mkdtempSync(path.join(root, '.img-tmp-'));
  try {
    for (const [base, c] of wanted) {
      const missing = variants(base).filter((v) => !fs.existsSync(path.join(root, v)));
      if (!missing.length) continue;
      try {
        const res = await fetch(c.photo, { signal: AbortSignal.timeout(20000) });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type}`);
        const src = path.join(tmp, 'src');
        fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
        for (const v of missing) {
          const [, w, f] = v.match(/-(\d+)\.(\w+)$/);
          encode(src, path.join(root, v), Number(w), f);
          result.made.push(v.slice(1));
        }
      } catch (err) {
        result.failed.push(`${c.username}: ${err.message}`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return result;
}
