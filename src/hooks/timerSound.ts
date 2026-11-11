/**
 * צליל ורטט בסיום טיימר. נוגע ב-navigator וב-WebAudio, ולכן מחוץ ל-src/lib.
 *
 * למה לא היה צליל (אבחון שלב 7) — ומה כל אחד מהסעיפים כאן עונה עליו:
 *
 *  1. **מתג השקט באייפון.** WebAudio מתנגן ב-iOS בקטגוריית "ambient", שמתג
 *     השקט משתיק. בחדר כושר הטלפון כמעט תמיד על שקט → `audioSession.type =
 *     'playback'` בזמן הצפצוף בלבד (iOS 16.4+, רק היכן שה-API קיים), ואז
 *     חזרה לסוג הקודם, כדי לא להחזיק את ערוץ השמע של המכשיר בין צפצופים.
 *  2. **AudioContext שנתקע.** הקוד הקודם חידש את ההקשר רק ממצב `suspended`,
 *     בלי לחכות לתוצאה, ולא הכיר את `interrupted` של iOS (אחרי נעילה, שיחה
 *     או מעבר אפליקציה). עכשיו: לפני הצפצוף מחדשים מכל מצב שאינו `running`,
 *     ממתינים, ורק אז מתזמנים את הצלילים.
 *  3. **פתיחת הנעילה (unlock).** ההקשר נפתח רק ב"התחל" של הטיימר. טיימר
 *     ששוחזר אחרי טעינה מחדש מעולם לא עבר מחווה, וההקשר נוצר נעול. עכשיו:
 *     כל נגיעה בזמן שטיימר רץ פותחת אותו (`primeAudio`), כולל ניגון דגימה
 *     שקטה — הדרך המקובלת לפתוח WebAudio ב-iOS.
 *  4. **עוצמה.** סינוס של 0.15 שנ׳ בעוצמה 0.25 נבלע ברעש. עכשיו שלושה
 *     צלילים עולים (כ-0.6 שנ׳) עם הרמוניה, בעוצמה גבוהה פי שניים.
 *  5. **אין רטט ב-iOS.** `navigator.vibrate` לא קיים ב-Safari; באנדרואיד הוא
 *     ממשיך לעבוד (ודפוס ארוך יותר). ב-iOS החיווי הוא הצליל והפס.
 *
 * בלי קובץ שמע: עובד אופליין, לא מוסיף תלות, ולא דורש הורדה.
 */

type AudioSessionLike = { type: string };

let ctx: AudioContext | null = null;
/** ההקשר עבר מחווה של המשתמש לפחות פעם אחת בחיי הדף. */
let unlocked = false;
let releaseTimer: number | null = null;

/** שלושה צלילים עולים: סול5, דו6, מי6. [התחלה בשניות, תדר]. */
const NOTES: readonly (readonly [number, number])[] = [
  [0, 783.99],
  [0.17, 1046.5],
  [0.34, 1318.51],
];
const NOTE_SEC = 0.26;
const ALERT_SEC = 0.34 + NOTE_SEC;
const PEAK = 0.5;
/** כמה מחכים ל-`resume()` לפני שמוותרים על הצפצוף. */
const RESUME_TIMEOUT_MS = 700;

function contextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  const s = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  return s && typeof s.type === 'string' ? s : null;
}

function ensureContext(): AudioContext | null {
  try {
    const Ctor = contextCtor();
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

function cancelRelease(): void {
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

/**
 * פותח את השמע מתוך מחווה של המשתמש (נגיעה/הקשה). זול וחוזר: אפשר לקרוא
 * לו בכל נגיעה. אחרי הקריאה ההקשר רץ (בשקט) עד `releaseAudio` או עד סוף
 * הצפצוף — כך שבסיום הטיימר אין תלות ב-`resume()` מחוץ למחווה.
 */
export function primeAudio(): void {
  const c = ensureContext();
  if (!c) return;
  cancelRelease();
  try {
    if (c.state !== 'running') void c.resume().catch(() => undefined);
    if (!unlocked) {
      // דגימה שקטה אחת: הדרך המקובלת לפתוח WebAudio ב-iOS בתוך מחווה.
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
      unlocked = true;
    }
  } catch {
    /* אין שמע — הטיימר ממשיך לעבוד בלי צליל */
  }
}

/** משחרר את ערוץ השמע כשאין טיימר פעיל. ההקשר נשאר, רק מושהה. */
export function releaseAudio(): void {
  cancelRelease();
  try {
    if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  } catch {
    /* לא קריטי */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), ms))]);
}

/**
 * מנגן את צליל הסיום. מחזיר true אם הצלילים תוזמנו על הקשר שרץ; false אם
 * השמע חסום (לא הייתה מחווה, או שהדפדפן סירב לחדש את ההקשר).
 *
 * `hold` — להשאיר את ההקשר רץ אחרי הצפצוף (יש עוד טיימר פעיל).
 */
export async function playAlert(hold = false): Promise<boolean> {
  const c = ensureContext();
  if (!c) return false;
  cancelRelease();

  // iOS: "playback" לא מושתק במתג השקט. רק סביב הצפצוף, ורק אם ה-API קיים.
  const session = audioSession();
  let previousType: string | null = null;
  try {
    if (session && session.type !== 'playback') {
      previousType = session.type;
      session.type = 'playback';
    }
  } catch {
    previousType = null;
  }
  const restoreSession = () => {
    try {
      if (session && previousType !== null) session.type = previousType;
    } catch {
      /* לא קריטי */
    }
  };

  try {
    // כל מצב שאינו running: suspended (ברירת מחדל), interrupted (iOS אחרי רקע).
    if (c.state !== 'running') await withTimeout(c.resume(), RESUME_TIMEOUT_MS);
  } catch {
    /* נבדק מיד למטה */
  }
  if (c.state !== 'running') {
    restoreSession();
    return false;
  }

  try {
    const t0 = c.currentTime + 0.03;
    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    for (const [at, freq] of NOTES) {
      // יסוד + אוקטבה שקטה: נשמע ברור יותר ברמקול קטן וברעש.
      for (const [mult, level] of [
        [1, PEAK],
        [2, PEAK * 0.3],
      ] as const) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(level, t0 + at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + NOTE_SEC);
        osc.connect(gain).connect(master);
        osc.start(t0 + at);
        osc.stop(t0 + at + NOTE_SEC + 0.02);
      }
    }
  } catch {
    restoreSession();
    return false;
  }

  // אחרי הצפצוף: מחזירים את סוג הערוץ, ומשהים את ההקשר אם אין טיימר נוסף —
  // כדי שהדף לא יחזיק ערוץ שמע פעיל בין מנוחות.
  releaseTimer = window.setTimeout(
    () => {
      releaseTimer = null;
      restoreSession();
      if (!hold) releaseAudio();
    },
    Math.ceil((ALERT_SEC + 0.25) * 1000),
  );
  return true;
}

/** רטט (אנדרואיד). ב-iOS אין `navigator.vibrate` — לא קורה כלום. */
export function vibrateAlert(): void {
  try {
    navigator.vibrate?.([180, 90, 180, 90, 260]);
  } catch {
    /* לא נתמך — לא קריטי */
  }
}

/**
 * כל נגיעה בזמן שטיימר רץ פותחת את השמע — מכסה טיימר ששוחזר אחרי טעינה
 * מחדש (שלא עבר "התחל" בדף הזה). מחזיר פונקציית ניתוק.
 */
export function installAudioUnlock(enabled: () => boolean): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onGesture = () => {
    if (enabled()) primeAudio();
  };
  const opts = { capture: true, passive: true } as const;
  document.addEventListener('pointerdown', onGesture, opts);
  document.addEventListener('touchend', onGesture, opts);
  document.addEventListener('keydown', onGesture, opts);
  return () => {
    document.removeEventListener('pointerdown', onGesture, opts);
    document.removeEventListener('touchend', onGesture, opts);
    document.removeEventListener('keydown', onGesture, opts);
  };
}
