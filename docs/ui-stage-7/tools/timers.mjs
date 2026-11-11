/**
 * בדיקה ידנית-בדפדפן של הצליל ושל הטיימר הצף (שלב 7), על build אחד.
 *
 *   PW_PATH=<playwright> node docs/ui-stage-7/tools/timers.mjs <dist-dir> <out-dir> <out-json>
 *
 * Chromium בלבד (Playwright, headless) — **לא טלפון אמיתי**. מה שנבדק כאן הוא
 * שהקוד עושה את מה שהוא אמור: מתזמן את הצלילים על AudioContext שרץ, עובר
 * ל-audioSession "playback" סביב הצפצוף וחוזר (על stub — ב-Chromium ה-API לא
 * קיים), מרטיט, משחרר את ההקשר אחרי הצפצוף, ופותח חלון picture-in-picture
 * שהתוכן שלו מתעדכן. מה שנשמע בפועל באייפון/אנדרואיד לא נבדק כאן.
 */
import fs from 'node:fs';
import path from 'node:path';
import { advance, launch, openSeeded, phone, serve, settle, tab } from './lib.mjs';

const [, , dist, outDir, outJson] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const SCENARIO = { today: '2026-11-11', time: '08:05:00' };

/** נטען לפני האפליקציה: רושם כל מה שנוגע לשמע, לרטט ול-audioSession. */
const PROBE = () => {
  const log = (window.__audio = { contexts: 0, starts: [], states: [], vibrate: [], session: [] });
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a);
      log.contexts++;
      window.__ctx = this;
      this.addEventListener('statechange', () => log.states.push(this.state));
    }
  };
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) {
    log.starts.push({ ctx: this.context.state, freq: Math.round(this.frequency.value), session: navigator.audioSession?.type ?? null });
    return start.apply(this, a);
  };
  navigator.vibrate = (p) => {
    log.vibrate.push(p);
    return true;
  };
  // Chromium לא מממש את Audio Session API — stub שרושם כל שינוי סוג.
  let type = 'auto';
  Object.defineProperty(navigator, 'audioSession', {
    configurable: true,
    value: {
      get type() {
        return type;
      },
      set type(v) {
        type = v;
        log.session.push(v);
      },
    },
  });
};
const audio = (page) => page.evaluate(() => ({ ...window.__audio, state: window.__ctx?.state ?? null, sessionNow: navigator.audioSession.type }));

/** מדליק/מכבה את הצליל ב-IndexedDB לפני הטעינה (הזריעה שומרת soundEnabled: false). */
const setSound = (page, on) =>
  page.evaluate(
    (value) =>
      new Promise((res) => {
        const r = indexedDB.open('keyval-store');
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('keyval', 'readwrite');
          const st = tx.objectStore('keyval');
          const g = st.get('fatloss:settings');
          g.onsuccess = () => st.put({ ...g.result, soundEnabled: value }, 'fatloss:settings');
          tx.oncomplete = () => {
            db.close();
            res(true);
          };
        };
      }),
    on,
  );

async function openWith(ctx, url, sound) {
  const page = await openSeeded(ctx, url, SCENARIO, { init: PROBE });
  await setSound(page, sound);
  await page.reload();
  await page.waitForSelector('nav.tabs');
  await settle(page, 400);
  return page;
}
const startRest = async (page) => {
  await tab(page, 'אימונים');
  await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
  await settle(page, 300);
  await page.getByRole('button', { name: /^רשום סט 1/ }).click();
  await settle(page, 300);
};

const server = await serve(dist, 4730);
const browser = await launch();
const out = { note: 'Chromium headless (Playwright). Not a real phone.', errors: [] };
try {
  const ctx = await phone(browser);

  // ---- 1. צליל פועל: מנוחה מסתיימת כשהאפליקציה פתוחה ----
  {
    const page = await openWith(ctx, server.url, true);
    page.on('pageerror', (e) => out.errors.push(String(e.message)));
    await startRest(page);
    const armed = await audio(page);
    await advance(page, 60500);
    await settle(page, 400);
    const atEnd = await audio(page);
    await settle(page, 1500);
    const after = await audio(page);
    out.soundOn = {
      contextRunningWhileCounting: armed.state === 'running',
      oscillators: atEnd.starts.length,
      frequencies: [...new Set(atEnd.starts.map((s) => s.freq))],
      allOnRunningContext: atEnd.starts.every((s) => s.ctx === 'running'),
      sessionDuringAlert: [...new Set(atEnd.starts.map((s) => s.session))],
      sessionTransitions: after.session,
      sessionAfter: after.sessionNow,
      vibrate: atEnd.vibrate,
      contextAfterAlert: after.state,
      bar: await page.locator('.resttimer').innerText().then((t) => t.replace(/\s+/g, ' ').trim()),
    };
    await page.close();
  }

  // ---- 2. צליל כבוי: רטט בלבד, בלי AudioContext ----
  {
    const page = await openWith(ctx, server.url, false);
    await startRest(page);
    await advance(page, 60500);
    await settle(page, 400);
    const a = await audio(page);
    out.soundOff = { contexts: a.contexts, oscillators: a.starts.length, vibrate: a.vibrate, sessionTransitions: a.session };
    // נגיעה במתג: מדליקה, ומנגנת את הצליל מיד (בדיקה עצמית).
    await page.getByRole('button', { name: /^רשום סט 2/ }).click();
    await settle(page, 300);
    await page.getByRole('button', { name: 'צליל כבוי — הפעל' }).click();
    await settle(page, 500);
    const b = await audio(page);
    out.soundToggle = { oscillatorsAfterTurnOn: b.starts.length, pressed: await page.getByRole('button', { name: 'צליל פועל — כבה' }).getAttribute('aria-pressed') };
    await page.close();
  }

  // ---- 3. סיום ברקע: 100 שניות בלי טיקים — בלי צליל, "נגמרה לפני 40 שניות" ----
  {
    const page = await openWith(ctx, server.url, true);
    await startRest(page);
    await page.clock.fastForward(100_000);
    await settle(page, 500);
    const a = await audio(page);
    out.endedInBackground = { oscillators: a.starts.length, vibrate: a.vibrate.length, bar: (await page.locator('.resttimer').innerText()).replace(/\s+/g, ' ').trim() };
    // טעינה מחדש של הדף אחרי שהסתיים: עדיין יודע לפני כמה זמן.
    await page.reload();
    await page.waitForSelector('nav.tabs');
    await settle(page, 500);
    out.endedThenReload = { bar: (await page.locator('.resttimer').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(), tab: await page.getByRole('tab', { selected: true }).innerText() };
    await page.close();
  }

  // ---- 4. חזרה מהרקע באמצע ספירה: דקה בלי טיקים — הזמן שנשאר נכון ----
  {
    const page = await openWith(ctx, server.url, true);
    await tab(page, 'אימונים');
    await page.getByRole('button', { name: /^התחל אימון/ }).first().click();
    await settle(page, 300);
    await page.locator('.disc__head', { hasText: 'חימום' }).click();
    await settle(page, 200);
    await page.getByRole('button', { name: 'התחל', exact: true }).first().click();
    await settle(page, 300);
    const before = (await page.locator('.resttimer__count').innerText()).trim();
    await page.clock.fastForward(60_000);
    await settle(page, 400);
    out.backgroundMinute = { before, afterOneMinute: (await page.locator('.resttimer__count').innerText()).trim() };
    await page.close();
  }

  // ---- 5. טיימר צף ----
  {
    const page = await openWith(ctx, server.url, true);
    page.on('pageerror', (e) => out.errors.push(String(e.message)));
    await startRest(page);
    await advance(page, 17000);
    const frame = async (name) => {
      const data = await page.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return null;
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 480;
        c.height = v.videoHeight || 270;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return { url: c.toDataURL('image/png'), w: v.videoWidth, h: v.videoHeight, pip: document.pictureInPictureElement === v, muted: v.muted };
      });
      if (!data) return null;
      fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data.url.split(',')[1], 'base64'));
      return { w: data.w, h: data.h, pip: data.pip, muted: data.muted };
    };
    const supported = await page.evaluate(() => document.pictureInPictureEnabled === true && typeof HTMLCanvasElement.prototype.captureStream === 'function');
    const button = page.getByRole('button', { name: 'טיימר צף' });
    const visible = (await button.count()) > 0;
    await button.click();
    await settle(page, 900);
    const rest = await frame('40-floating-rest');
    await page.screenshot({ path: path.join(outDir, '41-floating-button--crop.png'), clip: { x: 0, y: 844 - 230, width: 390, height: 230 } });
    const pressed = await page.getByRole('button', { name: 'סגור טיימר צף' }).getAttribute('aria-pressed');
    await advance(page, 45000);
    await settle(page, 900);
    const finished = await frame('42-floating-finished');
    await page.getByRole('button', { name: 'סגור טיימר צף' }).click();
    await settle(page, 500);
    out.floating = { supported, buttonVisible: visible, pressed, rest, finished, closed: await page.evaluate(() => document.pictureInPictureElement === null) };
    await page.close();
  }

  // ---- 6. בלי תמיכה ב-PiP: הכפתור לא מוצג ----
  {
    const page = await openSeeded(ctx, server.url, SCENARIO, {
      init: () => {
        Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, get: () => false });
      },
    });
    await startRest(page);
    out.floatingUnsupported = { buttonCount: await page.getByRole('button', { name: 'טיימר צף' }).count(), barStillThere: (await page.locator('.resttimer').count()) === 1 };
    await page.close();
  }
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
