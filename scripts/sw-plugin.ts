/**
 * תוסף Vite קטן שמייצר service worker עם רשימת precache מדויקת של קבצי
 * הבנייה. הכתובת של כל קובץ JS/CSS כוללת hash, ולכן אסטרטגיית cache-first
 * בטוחה: כל שינוי בתוכן מייצר כתובת חדשה וגרסת cache חדשה.
 *
 * נכתב ידנית במקום workbox כדי לא לגרור תלות בנייה נוספת.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

const SW_TEMPLATE = (version: string, urls: string[]) => `/* נוצר אוטומטית ע"י scripts/sw-plugin.ts — אין לערוך ידנית. */
const CACHE = 'fatloss-${version}';
const PRECACHE = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll נכשל כולו אם קובץ אחד נכשל; מוסיפים אחד-אחד כדי להיות עמידים.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('fatloss-') && n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ניווט: תמיד מגישים את מעטפת האפליקציה. אין ראוטינג בצד שרת.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const shell =
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await cache.match(new URL('./index.html', self.location.href).href));
        if (shell) return shell;
        try {
          return await fetch(req);
        } catch {
          return new Response(
            '<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">האפליקציה אינה זמינה אופליין עדיין. פתח אותה פעם אחת עם חיבור.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 },
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: false });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone()).catch(() => undefined);
        }
        return res;
      } catch (err) {
        const fallback = await cache.match(req, { ignoreSearch: true });
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
`;

export function serviceWorker(): Plugin {
  let publicDir = '';
  let root = '';

  return {
    name: 'fatloss-service-worker',
    apply: 'build',

    configResolved(config) {
      publicDir = config.publicDir;
      root = config.root;
    },

    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      // index.html אינו חלק מה-bundle ב-Vite, לכן מוסיפים אותו במפורש
      // (וגם './' עבור שרתים שמגישים אותו מהתיקייה).
      const urls = new Set<string>(['./', './index.html']);
      try {
        hash.update(readFileSync(join(root, 'index.html')));
      } catch {
        /* אין index.html בשורש — נדיר, לא קריטי */
      }

      for (const fileName of Object.keys(bundle).sort()) {
        if (fileName === 'sw.js') continue;
        const chunk = bundle[fileName];
        if (!chunk) continue;
        urls.add(`./${fileName}`);
        hash.update(fileName);
        if (chunk.type === 'chunk') hash.update(chunk.code);
        else if (typeof chunk.source === 'string') hash.update(chunk.source);
        else hash.update(Buffer.from(chunk.source));
      }

      if (publicDir) {
        for (const full of walk(publicDir).sort()) {
          const rel = relative(publicDir, full).split(sep).join('/');
          if (rel === 'sw.js') continue;
          urls.add(`./${rel}`);
          hash.update(rel);
          hash.update(readFileSync(full));
        }
      }

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: SW_TEMPLATE(hash.digest('hex').slice(0, 12), [...urls]),
      });
    },
  };
}
