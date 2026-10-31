/**
 * התסריט המשותף: יום תזונה מלא, באותם ערכים, דרך נהג (drive.mjs).
 * מכסה: קריאטין · רישום מאחרונים כמו שהוא · שינוי כמות ביחידה (+½) ·
 * רישום ממועדף במעבר גרמים⇄יחידה והקלדה · רישום מחיפוש עם +2 יחידות ·
 * עריכת רישום (כמות וארוחה) · מחיקה · סימון והסרה של מועדף · מזון שלי
 * חדש מהתווית ורישומו · "בחוץ" · דרגת שישי · סגירת יום.
 *
 * הזריעה: שישי 30/10/2026 08:05, קוטג׳ בגביע כבר נרשם ב-07:10.
 */
export const CUSTOM = { name: 'חטיף חלבון ביתי', kcal: 350, protein: 30 };
export const OUT = { name: 'פלאפל במנה', kcal: 650, protein: 20 };

/** מריץ את היום. `log` אוסף מה נעשה. */
export async function runDay(d, log = []) {
  await d.openTab();

  await d.creatine();
  log.push('קריאטין סומן');

  // 1. מאחרונים, כמו שהוא: PRO 40 (מזון-יחידה, ×1).
  await d.logFrequent('PRO 40');
  log.push('PRO 40 ×1 מאחרונים');

  // 2. שינוי כמות ביחידה: טחינה — כף מפולסת ×1 → ×1½ (קפיצה של חצי יחידה).
  await d.logFrequent('טחינה גולמית', (q) => q.plus(1));
  log.push('טחינה כף מפולסת ×1½ (+½)');

  // 3. ממועדף, מעבר גרמים⇄יחידה והקלדה: קוטג׳ — גביע ×1 → 200 ג׳.
  await d.logFavorite("קוטג'", async (q) => {
    await q.toGrams();
    await q.typeGrams(200);
  });
  log.push('קוטג׳ 200 ג׳ ממועדף (מעבר לגרמים + הקלדה)');

  // 4. מחיפוש: ביצה — "יחידה קטנה" ×1 → ×2 (+½ פעמיים).
  await d.search('ביצה שלמה בלי');
  await d.pickResult('ביצה שלמה בלי קליפה', (q) => q.plus(2));
  log.push('ביצה שלמה בלי קליפה — יחידה קטנה ×2 מחיפוש');

  // 5. עריכת רישום: הקוטג׳ של 07:10 — גביע ×1 → 300 ג׳, וארוחה → ביניים.
  await d.editEntry("קוטג'", {
    adjust: async (q) => {
      await q.toGrams();
      await q.typeGrams(300);
    },
    meal: 'ביניים',
  });
  log.push('עריכה: קוטג׳ 07:10 → 300 ג׳, ביניים');

  // 6. מחיקה: ה-PRO 40 שנרשם בשלב 1.
  await d.deleteEntry('PRO 40');
  log.push('מחיקה: PRO 40');

  // 7. מועדף: סימון השקדים והסרה (נטו אפס — אין ממשק בגרסה הישנה).
  const marked = await d.markFavorite('שקדים');
  if (marked) await d.unmarkFavorite('שקדים');
  log.push(marked ? 'מועדף: שקדים סומן והוסר' : 'מועדף: אין ממשק (דולג)');

  // 8. מזון שלי חדש מהתווית, ורישום 100 ג׳.
  await d.newCustomFood(CUSTOM, 100);
  log.push(`מזון שלי חדש: ${CUSTOM.name} · 100 ג׳`);

  // 9. "בחוץ".
  await d.out(OUT);
  log.push(`בחוץ: ${OUT.name}`);

  // 10. דרגת שישי.
  await d.friday('רגילה');
  log.push('ארוחת שישי: רגילה');

  // 11. סגירת היום.
  await d.closeDay();
  log.push('היום נסגר');
  return log;
}
