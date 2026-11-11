/**
 * נהג אחד לשתי הגרסאות — "לפני" (הבסיס, PR #37) ו"אחרי" (שלב 7). אותן
 * פעולות ואותם ערכים; ההבדלים בממשק מרוכזים כאן:
 *   - רשימת התרגילים: ב"אחרי" השורה הראשונה היא "חימום".
 *   - חימום: ב"אחרי" הדקות בצ'יפים (6–10 / "אחר"), והשורה נסגרת לבד אחרי "התחל".
 *   - צעדים: ב"אחרי" יש גם שדה "צעדים אתמול" בראש מסך "היום".
 * מונה נגיעות: כל click נספר; הקלדה בשדה = click (מיקוד) + typed.
 * כלי עבודה בלבד — לא חלק מה-build.
 */
import { advance, settle, tab } from './lib.mjs';

class Counter {
  constructor() {
    this.clicks = 0;
    this.typed = 0;
  }
  reset() {
    this.clicks = 0;
    this.typed = 0;
  }
  get() {
    return { clicks: this.clicks, typed: this.typed };
  }
}

export function driverFor(page, version) {
  const before = version === 'before';
  const c = new Counter();

  const click = async (loc) => {
    await loc.scrollIntoViewIfNeeded();
    await loc.click();
    c.clicks++;
  };
  const type = async (loc, value) => {
    await loc.scrollIntoViewIfNeeded();
    await loc.click();
    await loc.fill(String(value));
    await loc.blur();
    c.clicks++;
    c.typed++;
  };
  /** "מחק" של ConfirmButton: נגיעה ראשונה מבקשת אישור, שנייה מבצעת. */
  const confirmDelete = async (loc) => {
    await click(loc);
    await settle(page, 150);
    await click(loc);
    await settle(page, 250);
  };
  const warmupHead = () => page.locator('.disc__head', { hasText: 'חימום' });

  return {
    version,
    page,
    counter: c,

    async openTab(name) {
      await tab(page, name);
    },

    // ---------- אימון ----------
    async start(t) {
      await click(page.getByRole('button', { name: new RegExp(`^התחל אימון ${t}`) }));
      await settle(page, 300);
    },
    /** תרגיל כוח מספר n (1..N) לפי סדר הביצוע; 'finish' = שלב הסיום. */
    async goTo(n) {
      await click(page.locator('.wk-head__title'));
      await settle(page, 150);
      const rows = page.locator('.sheet .listrow');
      if (n === 'finish') await click(rows.last());
      else await click(rows.nth(before ? n - 1 : n));
      await settle(page, 250);
    },
    /** חימום: פתיחה, דקות, "התחל". מחזיר כמה נגיעות והקלדות זה לקח. */
    async warmup(minutes) {
      const start = c.get();
      if ((await warmupHead().getAttribute('aria-expanded')) !== 'true') await click(warmupHead());
      await settle(page, 200);
      if (before) {
        const field = page.getByLabel('דקות — חימום');
        if ((await field.inputValue()) !== String(minutes)) await type(field, minutes);
      } else {
        const group = page.getByRole('group', { name: 'דקות — חימום' });
        const chip = group.getByRole('button', { name: String(minutes), exact: true });
        if ((await chip.count()) > 0) {
          if ((await chip.getAttribute('aria-pressed')) !== 'true') await click(chip);
        } else {
          await click(group.getByRole('button', { name: 'אחר' }));
          await type(page.getByLabel('דקות אחרות — חימום'), minutes);
        }
      }
      await click(page.getByRole('button', { name: 'התחל', exact: true }).first());
      await settle(page, 250);
      // "לפני": השורה נשארת פתוחה וצריך לסגור אותה ביד. "אחרי": נסגרת לבד.
      if (before) {
        await click(warmupHead());
        await settle(page, 150);
      }
      return { clicks: c.clicks - start.clicks, typed: c.typed - start.typed };
    },
    exerciseName: async () => (await page.locator('.focus__name').first().textContent())?.trim(),
    async setWeight(w) {
      await type(page.getByLabel(/^משקל — /), w);
    },
    /** רישום סט i: אם הערך שונה ממה שמוצג — הקלדה, ואז "רשום". */
    async logSet(i, value) {
      const input = page.getByLabel(new RegExp(`^(חזרות|שניות), סט ${i} — `));
      if (value !== undefined && String(value) !== (await input.inputValue())) await type(input, value);
      await click(page.getByRole('button', { name: new RegExp(`^רשום סט ${i}`) }));
      await settle(page, 150);
    },
    /** רישום סט בנגיעה "אמיתית" — בלי הגלילה האוטומטית של Playwright (למדידת הקפל). */
    async logSetNoScroll(i) {
      await page.getByRole('button', { name: new RegExp(`^רשום סט ${i}`) }).dispatchEvent('click');
      c.clicks++;
      await settle(page, 900);
    },
    async setRir(v) {
      await click(page.getByRole('group', { name: 'חזרות ברזרבה בסט האחרון' }).getByRole('button', { name: v === 4 ? '4+' : String(v), exact: true }));
    },
    async next() {
      await click(page.getByRole('button', { name: /^(התרגיל הבא|לסיום)$/ }));
      await settle(page, 250);
    },
    async nextWithoutRir() {
      await click(page.getByRole('button', { name: 'המשך בלי RIR' }));
      await settle(page, 250);
    },
    async skip() {
      await click(page.getByRole('button', { name: 'דלג ואחזור' }));
      await settle(page, 250);
    },
    async swapTo(name) {
      await click(page.getByRole('button', { name: 'החלף', exact: true }));
      await settle(page, 150);
      await click(page.locator('.sheet .listrow', { hasText: name }));
      await settle(page, 250);
    },
    async pain(knee, shoulder) {
      const change = page.locator('.wk-pain').getByRole('button', { name: 'שנה' });
      if ((await change.count()) > 0) {
        await click(change);
        await settle(page, 150);
      }
      if (knee !== null) await click(page.getByRole('group', { name: 'כאב ברך' }).getByRole('button', { name: String(knee), exact: true }));
      if (shoulder !== null) await click(page.getByRole('group', { name: 'כאב כתף' }).getByRole('button', { name: String(shoulder), exact: true }));
      await settle(page, 150);
    },
    /** אירובי סיום בספירה לאחור: מכשיר, דקות, שיפוע, מהירות → התחל → זמן → סיים → שמור. */
    async finisher({ mode, minutes, incline, speed, elapsed }) {
      await this.goTo('finish');
      const region = page.getByRole('region', { name: 'סיום האימון' });
      await region.getByRole('group', { name: /^מכשיר — אירובי/ }).getByRole('button', { name: mode }).click();
      await settle(page, 150);
      const min = region.getByLabel(/^דקות — אירובי/);
      await min.fill(String(minutes));
      await min.blur();
      const inc = region.getByLabel(/^שיפוע/).first();
      await inc.fill(String(incline));
      await inc.blur();
      const sp = region.getByLabel(/^מהירות/).first();
      await sp.fill(String(speed));
      await sp.blur();
      await settle(page, 150);
      await region.getByRole('button', { name: 'התחל', exact: true }).click();
      await settle(page, 200);
      await advance(page, elapsed * 60 * 1000);
      await region.locator('.focus').getByRole('button', { name: 'סיים', exact: true }).click();
      await settle(page, 300);
      await page.getByRole('button', { name: 'שמור', exact: true }).click();
      await settle(page, 300);
    },
    async finish() {
      if ((await page.getByRole('button', { name: 'סיים אימון' }).count()) === 0) await this.goTo('finish');
      await click(page.getByRole('button', { name: 'סיים אימון' }));
      await settle(page, 300);
    },
    async close() {
      await click(page.getByRole('button', { name: 'סגור', exact: true }).first());
      await settle(page, 300);
    },
    /** "ערוך" של אימון לפי dd/mm (מהשורה הראשונה שמתאימה — השבוע או ההיסטוריה). */
    async editWorkout(dm) {
      const row = page.locator('li', { has: page.locator('.num', { hasText: dm }) }).first();
      await click(row.getByRole('button', { name: 'ערוך' }));
      await settle(page, 300);
    },
    /** שמות השורות ברשימת התרגילים (בלי "חימום" ו"סיום") — מה שהעורך מציג לאימון. */
    async listRows() {
      await page.locator('.wk-head__title').click();
      await settle(page, 200);
      const titles = await page.locator('.sheet .listrow .listrow__title').allInnerTexts();
      await page.keyboard.press('Escape');
      await settle(page, 200);
      if ((await page.locator('.sheet').count()) > 0) await page.locator('.sheet').getByRole('button', { name: /סגור/ }).first().click().catch(() => undefined);
      await settle(page, 150);
      return titles.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== 'חימום' && t !== 'סיום');
    },
    /** שורת "דולגו" של אימון ברשימה (dd/mm), אחרי פתיחת השורה. */
    async skippedLine(dm) {
      await tab(page, 'אימונים');
      const history = page.locator('section', { has: page.getByRole('heading', { name: 'היסטוריה' }) });
      const toggle = history.getByRole('button', { name: new RegExp(`^${dm.replace(/\//g, '\\/')}`) }).first();
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await settle(page, 200);
      const li = history.locator('li', { has: toggle });
      const text = (await li.innerText()).replace(/\s+/g, ' ');
      await toggle.click();
      const m = text.match(/דולגו: ([^כ]*?)(?= כאב:|$)/);
      return m ? m[1].trim() : null;
    },

    // ---------- מחיקות ו"בטל" ----------
    async deleteWeight(dmy) {
      await tab(page, 'היום');
      const section = page.locator('section', { has: page.getByRole('heading', { name: 'שקילות אחרונות' }) });
      await click(section.getByRole('button', { name: new RegExp(dmy.replace(/\//g, '\\/')) }).first());
      await settle(page, 150);
      await click(section.getByRole('button', { name: `מחק שקילה של ${dmy}` }));
      await settle(page, 250);
    },
    async deleteWaist(iso, dmy) {
      await tab(page, 'היום');
      const form = page.getByRole('region', { name: 'מותניים — טופס' });
      await form.scrollIntoViewIfNeeded();
      await form.getByLabel('תאריך').fill(iso);
      await settle(page, 200);
      await click(form.getByRole('button', { name: `מחק מדידת מותניים של ${dmy}` }));
      await settle(page, 250);
    },
    async deleteSteps(dmy) {
      await tab(page, 'היום');
      await click(page.getByRole('button', { name: `מחק צעדים של ${dmy}` }));
      await settle(page, 250);
    },
    async deleteEntry(name) {
      await tab(page, 'תזונה');
      const row = page.getByRole('region', { name: /^מה אכלתי/ }).locator('.listrow', { hasText: name }).first();
      await click(row);
      await settle(page, 200);
      await click(page.locator('.sheet').getByRole('button', { name: 'מחק' }));
      await settle(page, 250);
    },
    async deleteStandalone() {
      await tab(page, 'אימונים');
      const row = page.locator('li', { hasText: 'אירובי' }).filter({ has: page.getByRole('button', { name: 'ערוך' }) }).first();
      await click(row.getByRole('button', { name: 'ערוך' }));
      await settle(page, 250);
      await click(page.getByRole('button', { name: /^מחק — אירובי/ }));
      await settle(page, 250);
    },
    async deleteWorkout(dm) {
      await tab(page, 'אימונים');
      const history = page.locator('section', { has: page.getByRole('heading', { name: 'היסטוריה' }) });
      await click(history.getByRole('button', { name: new RegExp(`^${dm.replace(/\//g, '\\/')}`) }).first());
      await settle(page, 200);
      await confirmDelete(history.getByRole('button', { name: /^מחק אימון/ }));
    },
    async deleteCustomFood(name) {
      await tab(page, 'נתונים');
      const list = page.getByRole('button', { name: /^הרשימה/ }).first();
      if ((await list.getAttribute('aria-expanded')) !== 'true') await click(list);
      await settle(page, 150);
      await click(page.getByRole('button', { name: `ערוך ${name}` }));
      await settle(page, 250);
      await confirmDelete(page.getByRole('button', { name: /^(מחק מזון|אישור מחיקה)/ }));
    },

    // ---------- היום: שקילה וצעדים ----------
    /** שקילת בוקר: הערך ממולא מהשקילה האחרונה — "שמור שקילה". */
    async saveWeight() {
      await tab(page, 'היום');
      await click(page.getByRole('button', { name: 'שמור שקילה' }));
      await settle(page, 250);
    },
    /**
     * צעדי אתמול. "לפני": השדה בכרטיס הצעדים, מתחת לקפל. "אחרי": השדה בראש
     * המסך. מחזיר נגיעות, הקלדות, והאם השדה היה בתוך המסך בלי גלילה.
     */
    async saveStepsYesterday(steps) {
      await tab(page, 'היום');
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 200);
      const start = c.get();
      const field = before ? page.getByLabel(/^צעדים — /) : page.getByLabel(/^צעדים אתמול — /);
      const box = await field.boundingBox();
      const inView = box !== null && box.y >= 0 && box.y + box.height <= 844 - 64;
      await type(field, steps);
      await click(before ? page.getByRole('button', { name: 'שמור', exact: true }) : page.getByRole('button', { name: 'שמור צעדים של אתמול' }));
      await settle(page, 250);
      return { clicks: c.clicks - start.clicks, typed: c.typed - start.typed, fieldInViewWithoutScroll: inView, fieldTop: box ? Math.round(box.y) : null };
    },

    // ---------- טוסט ----------
    toast() {
      return page.locator('.toast:not(.toast--static)');
    },
    async toastText() {
      const t = this.toast();
      return (await t.count()) ? (await t.first().innerText()).replace(/\s+/g, ' ').trim() : null;
    },
    async undo() {
      await click(this.toast().getByRole('button', { name: /בטל/ }));
      await settle(page, 250);
    },
    async letToastExpire() {
      await advance(page, 6500);
    },

    // ---------- נתונים ----------
    async export() {
      await tab(page, 'נתונים');
      await settle(page, 400);
      const btn = page.getByRole('button', { name: 'הורד קובץ גיבוי' });
      await btn.scrollIntoViewIfNeeded();
      for (let attempt = 0; attempt < 3; attempt++) {
        const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await btn.click();
        const download = await dl;
        if (download) return download.path();
      }
      throw new Error('export: no download event after 3 attempts');
    },
    /** ייבוא במיזוג מהדבקה ("או הדבק JSON" בקבוצת הגיבוי). מחזיר את שורת "מוזג: …". */
    async importMerge(jsonText) {
      await tab(page, 'נתונים');
      const disc = page.getByRole('button', { name: /^או הדבק JSON/ }).first();
      if ((await disc.getAttribute('aria-expanded')) !== 'true') await click(disc);
      await settle(page, 150);
      const ta = page.locator('#import-text');
      await ta.scrollIntoViewIfNeeded();
      await ta.fill(jsonText);
      await click(page.getByRole('button', { name: 'ייבא מהטקסט' }));
      await page.getByText(/^מוזג:/).waitFor({ timeout: 15000 });
      await settle(page, 300);
      return (await page.getByText(/^מוזג:/).innerText()).replace(/\s+/g, ' ').trim();
    },
    /** "העתק סיכום שבועי" — הטקסט שנשלח ללוח (stub). */
    async copyWeeklySummary() {
      await tab(page, "צ'ק-אין");
      await page.evaluate(() => {
        window.__copied = null;
      });
      const btn = page.getByRole('button', { name: 'העתק סיכום שבועי' });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await settle(page, 300);
      return page.evaluate(() => window.__copied);
    },
    /** "העתק לצ'אט" — דוח הצ'ק-אין. */
    async copyChatReport() {
      await tab(page, "צ'ק-אין");
      await page.evaluate(() => {
        window.__copied = null;
      });
      const btn = page.getByRole('button', { name: "העתק לצ'אט" });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await settle(page, 300);
      return page.evaluate(() => window.__copied);
    },
  };
}

/** מחליף את הלוח ב-stub שרושם מה נשלח. נטען לפני האפליקציה. */
export const CLIPBOARD_STUB = () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (t) => {
        window.__copied = t;
        return Promise.resolve();
      },
    },
  });
};
