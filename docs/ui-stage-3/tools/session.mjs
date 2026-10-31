/**
 * התסריט המשותף: סשן A מלא, באותם ערכים, דרך נהג (drive.mjs).
 * כולל: סט שמשנים בו חזרות, "דלג ואחזור", "החלף", RIR בכל תרגיל ותרגיל אחד
 * בלי RIR, כאב, A6 במשקל גוף, A8 פלאנק, אירובי סיום.
 *
 * ההצעות (מהזריעה): A1 לג-פרס 130×10 (R1), A2 בנץ׳ 45×8 (R1, בלי RIR → "אשר
 * בעצמך"), A3 פולי עליון — כיול, A4 פשיטת ברכיים R1, A5 כפיפת ברכיים R1 →
 * מוחלף בחלופה בלי היסטוריה, A6 פשיטת ירך — משקל גוף, A7 הרחקת כתפיים R1,
 * A8 פלאנק 60×3 שימור.
 */
export const SESSION = {
  type: 'A',
  warmup: true,
  exercises: [
    // [מס׳ תרגיל (סדר ביצוע נוכחי), פעולה]
    { n: 1, sets: [{ v: 10 }, { v: 10 }, { v: 10 }], rir: 2 }, // A1: ההצעה כמו שהיא
    { n: 2, sets: [{ v: 8 }, { v: 7 }, { v: 8 }], rir: 1 }, // A2: סט 2 שונה מההצעה (8 → 7)
    { n: 3, weight: 50, sets: [{ v: 10 }, { v: 10 }, { v: 9 }], rir: 2 }, // A3: כיול — חייבים להזין
    { n: 4, skip: true }, // A4: דלג ואחזור → עובר לסוף
    { n: 4, swap: 'כפיפת ברכיים במכונה על הבטן', weight: 30, sets: [{ v: 12 }, { v: 12 }], rir: 3 }, // A5 (עכשיו במקום 4): החלף
    { n: 5, sets: [{ v: 17 }, { v: 17 }, { v: 17 }], rir: 2 }, // A6: משקל גוף
    { n: 6, sets: [{ v: 15 }, { v: 15 }, { v: 15 }], noRir: true }, // A7: בלי RIR
    { n: 7, sets: [{ v: 60 }, { v: 60 }, { v: 60 }], rir: 2 }, // A8: פלאנק
    { n: 8, sets: [{ v: 15 }, { v: 15 }], rir: 2 }, // A4 שחזר לסוף
  ],
  pain: { knee: 2, shoulder: 0 },
  finisher: { mode: 'אופניים', minutes: 30, incline: 2, speed: 5.5, elapsed: 20 },
};

/** מריץ את הסשן. `log` אוסף מה נעשה לכל תרגיל (שם + ערכים). */
export async function runSession(d, s = SESSION, log = []) {
  await d.openTab();
  await d.start(s.type);
  if (s.warmup) {
    await d.goTo(0);
    await d.warmupStart();
  }
  for (const step of s.exercises) {
    await d.goTo(step.n);
    const name = await d.exerciseName();
    if (step.skip) {
      await d.skip();
      log.push({ n: step.n, name, action: 'skip' });
      continue;
    }
    if (step.swap) {
      await d.swapTo(step.swap);
    }
    await d.useSuggestion();
    if (step.weight !== undefined) await d.setWeight(step.weight);
    for (const [i, set] of step.sets.entries()) await d.logSet(i + 1, set.v);
    if (step.noRir) await d.nextWithoutRir();
    else {
      await d.setRir(step.rir);
      await d.next();
    }
    log.push({ n: step.n, name: step.swap ? `${name} → ${step.swap}` : name, sets: step.sets.map((x) => x.v), rir: step.noRir ? null : step.rir });
  }
  await d.pain(s.pain.knee, s.pain.shoulder);
  await d.finisher(s.finisher);
  await d.finish();
  return log;
}
