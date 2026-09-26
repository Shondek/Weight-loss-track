/**
 * מסך התזונה (שלב 3). עונה על שאלה אחת מהר: מה אכלתי היום וכמה נשאר.
 *
 * מלמעלה למטה: שורת תאריך · גיבור (חלבון וקלוריות, שני מספרים) · "מה שאני
 * אוכל" (מחושב מ-14 הימים האחרונים) · חיפוש · ארוחה בחוץ · הרישומים של
 * היום לפי ארוחה · "סיימתי לרשום היום" וארוחת שישי.
 *
 * ניהול (מזונות שלי, ספריית המנות, היעד) עבר למסך "נתונים". החישוב
 * (lib/nutrition/calc.ts) ומבנה הרישום לא השתנו. בלי ספרות עשרוניות בכלל.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import type { FoodEntry, FoodRef, FridayTier } from '../types';
import { ADHOC_FOOD_ID } from '../types';
import { useFoodIndex } from '../useFoodIndex';
import ProgressBar, { toneOf } from '../components/ProgressBar';
import { addDays, compareISO, formatDM, dayName } from '../lib/date';
import { MAX_GRAMS, MIN_GRAMS } from '../lib/schema';
import { upsertCustomFood, type Food } from '../lib/nutrition/foods';
import { resolveFood, searchFoods } from '../lib/nutrition/index';
import {
  ADHOC_MAX_KCAL,
  ADHOC_MAX_MACRO,
  entriesOn,
  entryName,
  groupByMeal,
  mealForLogging,
  MEAL_LABELS,
  MEAL_ORDER,
  newAdhocEntry,
  newEntry,
  newEntryFromRef,
  normalizeName,
  relogAdhoc,
  removeEntry,
  setEntryGrams,
  setEntryMeal,
  tsForDay,
  upsertEntry,
} from '../lib/nutrition/entries';
import { recentFoods } from '../lib/nutrition/favorites';
import { frequentItems, lastGramsOf, type FrequentItem } from '../lib/nutrition/frequent';
import {
  applyFridayTier,
  FRIDAY_TIER_ORDER,
  FRIDAY_TIERS,
  fridayEstimateOn,
  isFriday,
  removeFridayEstimate,
} from '../lib/nutrition/friday';
import { adhocOccurrences, canSaveAsFood, customFoodFromAdhoc, hasCustomFoodNamed, SAVE_OFFER_MIN } from '../lib/nutrition/adhocSave';
import { dayMeta, setDayClosed, setFridayTier } from '../lib/nutrition/days';
import { KCAL_FLOOR, targetFor } from '../lib/nutrition/targets';
import { daySummary, entryNutrition } from '../lib/nutrition/calc';
import { kcalText } from '../lib/nutrition/display';
import { compositionLine } from '../lib/nutrition/composition';
import { gramsFor, qtyFor, qtyText as unitQtyText, quantityLabel, unitFor, type PortionSource, type UnitSpec } from '../lib/nutrition/portions';

const SEARCH_LIMIT = 12;
const RECENT_LIMIT = 6;
const UNDO_MS = 6000;

/** חותמת זמן ממוינת + אקראיות — אותו מתכון כמו במסך האימון. */
function unique(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function'
    ? c.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

/** שלם להצגה. כל מספר במסך עובר כאן — אין ספרות עשרוניות בטאב. */
const int = (n: number | null | undefined): string => kcalText(n);

function parseGrams(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < MIN_GRAMS || n > MAX_GRAMS) return null;
  return Math.round(n * 10) / 10;
}

/** מספר להזנה ידנית: ריק = null; מחוץ לטווח = undefined (לא תקין). */
function parseAmount(text: string, max: number): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return Math.round(n * 10) / 10;
}

/** "08:05" */
function timeText(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ערכים לכמות: ל-100 ג' × גרמים / 100 — אותה נוסחה כמו entryNutrition. */
function scaled(ref: Pick<FoodRef, 'kcal' | 'protein'>, grams: number): { kcal: number; protein: number } {
  return { kcal: (ref.kcal * grams) / 100, protein: (ref.protein * grams) / 100 };
}

/** "כף מפולסת ×2" / "מנה ×½" / "×3" / "150 ג׳", ו"הערכה" לידני. */
function entryQtyText(e: FoodEntry, source: PortionSource | null): string {
  if (e.adhoc) return 'הערכה';
  return quantityLabel(source ?? { portions: [], unitFood: e.ref.unitFood === true }, e.grams);
}

/** האם הגרמים נופלים בדיוק על קפיצה של היחידה (אחרת מתחילים במצב גרמים). */
function onUnitGrid(unit: UnitSpec, grams: number): boolean {
  if (unit.kind === 'grams') return false;
  return Math.abs(gramsFor(unit, qtyFor(unit, grams)) - grams) < 0.05;
}

// ---------- בקרת כמות ----------

type QtyProps = {
  unit: UnitSpec;
  grams: number;
  onChange: (grams: number) => void;
  label: string;
};

/**
 * בקרת כמות לפי יחידת המזון (lib/nutrition/portions.ts): מנה ×0.5…×3,
 * יחידת מידה ×0.5…×10 (עם מעבר לגרמים), מזון-יחידה ×1…×10, או גרמים.
 * הערך שיוצא תמיד בגרמים — זה מה שנשמר.
 */
function QtyControl({ unit, grams, onChange, label }: QtyProps) {
  const startInGrams = () => unit.kind === 'grams' || (unit.kind !== 'unit' && !onUnitGrid(unit, grams));
  const [gramsMode, setGramsMode] = useState(startInGrams);
  const [text, setText] = useState(String(grams));
  useEffect(() => setText(String(grams)), [grams]);
  /**
   * היחידה יכולה להשתנות אחרי הרינדור הראשון — מאגר המזון נטען אחרי המסך,
   * ועד אז כל מזון נפתר ל"גרמים". כשהיחידה מתחלפת, מצב הגרמים נקבע מחדש;
   * בחירה ידנית של המשתמש (המעבר "ג׳") נשמרת כל עוד היחידה אותה יחידה.
   */
  const unitKey = unit.kind === 'grams' || unit.kind === 'unit' ? unit.kind : `${unit.kind}:${unit.label}:${unit.g}`;
  useEffect(() => {
    setGramsMode(startInGrams());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitKey]);

  if (unit.kind === 'unit') {
    const n = Math.max(unit.min, Math.min(unit.max, Math.round(grams)));
    return (
      <div className="nut-qty" role="group" aria-label={`כמות — ${label}`}>
        <button type="button" className="btn btn--step" aria-label="פחות" disabled={n <= unit.min} onClick={() => onChange(n - 1)}>
          −
        </button>
        <span className="nut-qty__value num" aria-live="polite">
          ×{n}
        </span>
        <button type="button" className="btn btn--step" aria-label="יותר" disabled={n >= unit.max} onClick={() => onChange(n + 1)}>
          +
        </button>
      </div>
    );
  }

  if (unit.kind === 'grams' || gramsMode) {
    return (
      <div className="nut-qty nut-qty--grams">
        <input
          className="nut-qty__input num"
          type="number"
          inputMode="decimal"
          min={MIN_GRAMS}
          max={MAX_GRAMS}
          step={1}
          aria-label={`גרמים — ${label}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const g = parseGrams(e.target.value);
            if (g !== null) onChange(g);
          }}
        />
        <span className="tiny muted">ג׳</span>
        {unit.kind !== 'grams' && (
          <button
            type="button"
            className="nut-qty__toggle"
            aria-label={`חזרה ליחידה ${unit.label}`}
            onClick={() => {
              setGramsMode(false);
              onChange(gramsFor(unit, Math.max(unit.min, qtyFor(unit, grams))));
            }}
          >
            {unit.label}
          </button>
        )}
      </div>
    );
  }

  const q = Math.max(unit.min, Math.min(unit.max, qtyFor(unit, grams)));
  return (
    <div className="nut-qty" role="group" aria-label={`כמות — ${label}`}>
      <button type="button" className="btn btn--step" aria-label="פחות" disabled={q <= unit.min} onClick={() => onChange(gramsFor(unit, q - unit.step))}>
        −
      </button>
      <span className="nut-qty__value nut-qty__value--unit" aria-live="polite">
        <span className="num">×{unitQtyText(q)}</span>
        <span className="nut-qty__unit">{unit.label}</span>
      </span>
      <button type="button" className="btn btn--step" aria-label="יותר" disabled={q >= unit.max} onClick={() => onChange(gramsFor(unit, q + unit.step))}>
        +
      </button>
      <button type="button" className="nut-qty__toggle" aria-label="מעבר לגרמים" onClick={() => setGramsMode(true)}>
        ג׳
      </button>
    </div>
  );
}

// ---------- המסך ----------

export default function NutritionScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const foodIndex = useFoodIndex(db.customFoods);
  const resolve = (id: string) => resolveFood(foodIndex.index, id);
  /** המזון שלי לפי מזהה — למתכון ולהערה. מזון שנמחק → null, ואין שורה. */
  const customOf = (id: string) => db.customFoods.find((f) => f.id === id) ?? null;
  /** שורת התכולה של מנה מורכבת, או null. */
  const compositionOf = (id: string) => compositionLine(customOf(id)?.recipe, (i) => resolve(i)?.name ?? null);
  /** יחידות המידה, המתכון ודגל היחידה של מזון — לתרגום גרמים ליחידה. null כשהמזון נעלם. */
  const sourceOf = (id: string): PortionSource | null => {
    const live = resolve(id);
    if (!live) return null;
    return { portions: live.portions, unitFood: live.unitFood, recipe: customOf(id)?.recipe ?? null };
  };

  // ---------- היום המוצג ----------
  const [day, setDay] = useState(today);
  // חצות עברה בזמן שהמסך פתוח: יום "מהעתיד" חוזר להיום.
  useEffect(() => {
    if (compareISO(day, today) > 0) setDay(today);
  }, [day, today]);
  const isToday = day === today;

  const dayEntries = useMemo(() => entriesOn(db.entries, day), [db.entries, day]);
  const summary = useMemo(() => daySummary(dayEntries, day, resolve), [dayEntries, day, foodIndex.index]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = useMemo(() => targetFor(db.targets, day), [db.targets, day]);
  const groups = useMemo(() => groupByMeal(dayEntries), [dayEntries]);
  const meta = dayMeta(db.days, day);
  const closed = meta?.closed === true;
  const friday = isFriday(day);
  const fridayEntry = fridayEstimateOn(db.entries, day);
  const estimated = summary.adhocCount > 0;

  const nowTs = () => tsForDay(day, today, Date.now());
  const mealNow = () => mealForLogging(day, today, new Date());

  // ---------- undo ----------
  type Pending = { kind: 'deleted'; entry: FoodEntry; text: string } | { kind: 'added'; ids: string[]; text: string };
  const [undo, setUndo] = useState<Pending | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const armUndo = (pending: Pending | null) => {
    if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current);
    setUndo(pending);
    if (pending) undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };
  useEffect(
    () => () => {
      if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current);
    },
    [],
  );
  const restore = () => {
    if (!undo) return;
    if (undo.kind === 'deleted') void store.update('entries', upsertEntry(db.entries, undo.entry));
    else {
      let list = db.entries;
      for (const id of undo.ids) list = removeEntry(list, id);
      void store.update('entries', list);
    }
    armUndo(null);
  };

  /** רישום אחד + טוסט. השם והערכים לטוסט מחושבים מהרשומה עצמה. */
  const commit = (entry: FoodEntry, label: string) => {
    void store.update('entries', upsertEntry(db.entries, entry));
    const n = entryNutrition(entry, resolve(entry.foodId));
    armUndo({ kind: 'added', ids: [entry.id], text: `${label} · ${int(n.kcal)} קק"ל · ${int(n.protein)} חלבון` });
  };

  const del = (entry: FoodEntry) => {
    void store.update('entries', removeEntry(db.entries, entry.id));
    armUndo({ kind: 'deleted', entry, text: `נמחק: ${entryName(entry, resolve(entry.foodId)?.name ?? null)}` });
  };

  // ---------- "מה שאני אוכל" ----------
  const frequent = useMemo(() => frequentItems(db.entries, today), [db.entries, today]);
  /** כמות לכל פריט, מאותחלת לאחרונה שנרשמה. מפתח = FrequentItem.key. */
  const [qty, setQty] = useState<Record<string, number>>({});
  const qtyOf = (item: FrequentItem) => qty[item.key] ?? item.lastGrams;

  const logFrequent = (item: FrequentItem) => {
    const grams = qtyOf(item);
    const ts = nowTs();
    const meal = mealNow();
    if (item.kind === 'adhoc') {
      commit(relogAdhoc(item.ref, item.name, meal, ts, unique()), item.name);
      return;
    }
    const live = resolve(item.foodId);
    const entry = live
      ? newEntry(live, grams, meal, ts, unique())
      : newEntryFromRef(item.foodId, item.ref, grams, meal, ts, unique());
    commit(entry, `${item.name} ${quantityLabel(sourceOf(item.foodId) ?? { portions: [], unitFood: item.unitFood }, grams)}`);
  };

  // ---------- חיפוש ----------
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [selGrams, setSelGrams] = useState<number>(100);
  const searchRef = useRef<HTMLInputElement>(null);

  const recent = useMemo(
    () =>
      recentFoods(db.entries.filter((e) => e.foodId !== ADHOC_FOOD_ID), [], RECENT_LIMIT)
        .map((r) => resolve(r.foodId))
        .filter((f): f is Food => f !== null),
    [db.entries, foodIndex.index], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const results = useMemo(
    () => (query.trim() === '' ? recent : searchFoods(foodIndex.index, query, SEARCH_LIMIT)),
    [foodIndex.index, query, recent],
  );
  /** הכמות שמוצגת לתוצאה: האחרונה שנרשמה; אחרת יחידה אחת של המזון (מנה / יחידת מידה / יחידה), או 100 ג׳. */
  const portionOf = (f: Food): number => {
    const last = lastGramsOf(db.entries, f.id);
    if (last !== null) return last;
    const unit = unitFor(sourceOf(f.id) ?? { portions: f.portions, unitFood: f.unitFood });
    return unit.kind === 'grams' ? 100 : gramsFor(unit, 1);
  };

  const pick = (f: Food) => {
    setSelected(f);
    setSelGrams(portionOf(f));
  };
  const addSelected = () => {
    if (!selected) return;
    commit(newEntry(selected, selGrams, mealNow(), nowTs(), unique()), `${selected.name} ${quantityLabel(sourceOf(selected.id), selGrams)}`);
    setSelected(null);
    setQuery('');
  };

  // ---------- ארוחה בחוץ ----------
  const [outOpen, setOutOpen] = useState(false);
  const [outMore, setOutMore] = useState(false);
  const [out, setOut] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const outKcal = parseAmount(out.kcal, ADHOC_MAX_KCAL);
  const outProtein = parseAmount(out.protein, ADHOC_MAX_MACRO);
  const outCarbs = parseAmount(out.carbs, ADHOC_MAX_MACRO);
  const outFat = parseAmount(out.fat, ADHOC_MAX_MACRO);
  const outValid =
    normalizeName(out.name) !== '' && typeof outKcal === 'number' && typeof outProtein === 'number' && outCarbs !== undefined && outFat !== undefined;
  /** "לשמור כמזון קבוע?" — מוצע אחרי שמירה כשהשם חזר ≥2 פעמים ב-14 יום. */
  const [saveOffer, setSaveOffer] = useState<{ name: string; ref: FoodRef } | null>(null);

  const saveOut = () => {
    if (!outValid || typeof outKcal !== 'number' || typeof outProtein !== 'number') return;
    const name = normalizeName(out.name);
    const entry = newAdhocEntry(
      { name, kcal: outKcal, protein: outProtein, carbs: outCarbs ?? null, fat: outFat ?? null },
      mealNow(),
      nowTs(),
      unique(),
    );
    commit(entry, name);
    const occurrences = adhocOccurrences(db.entries, name, today) + 1;
    if (occurrences >= SAVE_OFFER_MIN && !hasCustomFoodNamed(db.customFoods, name) && canSaveAsFood(entry.ref)) {
      setSaveOffer({ name, ref: entry.ref });
    }
    setOut({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
    setOutMore(false);
    setOutOpen(false);
  };

  const saveAsFood = () => {
    if (!saveOffer) return;
    void store.update('customFoods', upsertCustomFood(db.customFoods, customFoodFromAdhoc(saveOffer.ref, saveOffer.name, unique())));
    setSaveOffer(null);
  };

  // ---------- עריכת שורה ----------
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  // ---------- סגירת יום וארוחת שישי ----------
  const toggleClosed = () => {
    void store.update('days', setDayClosed(db.days, day, !closed, new Date().toISOString()));
  };

  const chooseTier = (tier: FridayTier) => {
    const current = meta?.fridayTier ?? null;
    if (current === tier) {
      // לחיצה חוזרת על הדרגה הנבחרת מסירה את ההערכה.
      void store.update('entries', removeFridayEstimate(db.entries, day));
      void store.update('days', setFridayTier(db.days, day, null));
      return;
    }
    // רשומה אחת בלבד: הקיימת מוסרת, החדשה נכנסת.
    void store.update('entries', applyFridayTier(db.entries, day, tier, nowTs(), unique()));
    void store.update('days', setFridayTier(db.days, day, tier));
  };

  // ---------- נגזרות תצוגה ----------
  const proteinLeft = target ? target.protein - summary.protein : null;
  const kcalLeft = target ? target.kcal - summary.kcal : null;
  const proteinPct = target && target.protein > 0 ? summary.protein / target.protein : 0;
  const kcalPct = target && target.kcal > 0 ? summary.kcal / target.kcal : 0;

  return (
    <div className="nut stack--loose">
      {/* ---------- שורת תאריך ---------- */}
      <section className="nut-daybar" aria-label="יום">
        {/* RTL: "קודם" יושב מימין ומצביע ימינה, "הבא" משמאל ומצביע שמאלה. */}
        <button type="button" className="btn btn--quiet" aria-label="יום קודם" onClick={() => setDay(addDays(day, -1))}>
          ›
        </button>
        <div className="nut-daybar__label">
          <span className="strong">{isToday ? 'היום' : dayName(day)}</span>
          {' · '}
          <span className="num">{formatDM(day)}</span>
          {closed && <span className="nut-badge nut-badge--closed"> נסגר</span>}
          {estimated && <span className="nut-badge"> כולל הערכות</span>}
        </div>
        <button type="button" className="btn btn--quiet" aria-label="יום הבא" disabled={isToday} onClick={() => setDay(addDays(day, 1))}>
          ‹
        </button>
      </section>

      {/* ---------- גיבור ---------- */}
      <section className={`nut-card nut-hero${closed ? ' is-closed' : ''}`} aria-label="סיכום היום">
        <div className="nut-hero__row">
          <div className="nut-hero__head">
            <span className="nut-hero__label">חלבון</span>
            <span className="nut-hero__value num">
              {int(summary.protein)}
              {target && <span className="nut-hero__target"> / {int(target.protein)}</span>}
              <span className="nut-hero__unit"> ג׳</span>
            </span>
          </div>
          {target ? (
            <>
              <ProgressBar value={summary.protein} target={target.protein} label="חלבון מול היעד" />
              <p className={`nut-hero__note nut-tone--${toneOf(proteinPct)}`}>
                {proteinLeft !== null && proteinLeft > 0 ? (
                  <>
                    חסרים <span className="num">{int(proteinLeft)}</span>
                  </>
                ) : (
                  'היעד הושלם'
                )}
              </p>
            </>
          ) : (
            <p className="nut-hero__note muted">אין יעד מוגדר — במסך "נתונים"</p>
          )}
        </div>

        <div className="nut-hero__row">
          <div className="nut-hero__head">
            <span className="nut-hero__label">קלוריות</span>
            <span className="nut-hero__value num">
              {kcalLeft === null ? (
                int(summary.kcal)
              ) : kcalLeft >= 0 ? (
                <>
                  <span className="nut-hero__unit">נשארו </span>
                  {int(kcalLeft)}
                </>
              ) : (
                <>
                  {int(-kcalLeft)}
                  <span className="nut-hero__unit"> מעל היעד</span>
                </>
              )}
            </span>
          </div>
          {target ? (
            <>
              <ProgressBar value={summary.kcal} target={target.kcal} floor={KCAL_FLOOR} label="קלוריות מול היעד" />
              <p className={`nut-hero__note nut-tone--${toneOf(kcalPct)}`}>
                <span className="num">{int(summary.kcal)}</span> מתוך <span className="num">{int(target.kcal)}</span>
                <span className="muted">
                  {' '}
                  · רצפה <span className="num">{int(KCAL_FLOOR)}</span>
                </span>
              </p>
            </>
          ) : null}
        </div>

        <p className="nut-macros tiny muted">
          פחמימה{' '}
          <span className="num">
            {summary.carbsUnknownGrams > 0 ? '≥' : ''}
            {int(summary.carbs)}
          </span>
          {target && (
            <>
              /<span className="num">{int(target.carbs)}</span>
            </>
          )}
          {' · '}שומן{' '}
          <span className="num">
            {summary.fatUnknownGrams > 0 ? '≥' : ''}
            {int(summary.fat)}
          </span>
          {target && (
            <>
              /<span className="num">{int(target.fat)}</span>
            </>
          )}
          {' · '}סיבים{' '}
          <span className="num">
            {summary.fiberUnknownGrams > 0 ? '≥' : ''}
            {int(summary.fiber)}
          </span>
          {' · '}
          <span className="num">{summary.count}</span> {summary.count === 1 ? 'רישום' : 'רישומים'}
        </p>
      </section>

      {undo && (
        <div className="nut-toast" role="status">
          <span className="grow">{undo.text}</span>
          <button type="button" className="btn btn--quiet" onClick={restore}>
            בטל
          </button>
        </div>
      )}

      {saveOffer && (
        <div className="nut-toast nut-toast--offer" role="status">
          <span className="grow">
            "{saveOffer.name}" חוזר על עצמו. לשמור כמזון קבוע?
          </span>
          <button type="button" className="btn btn--quiet" onClick={saveAsFood}>
            שמור
          </button>
          <button type="button" className="btn btn--quiet" aria-label="לא עכשיו" onClick={() => setSaveOffer(null)}>
            ✕
          </button>
        </div>
      )}

      {/* ---------- מה שאני אוכל ---------- */}
      <section className="nut-card" aria-label="מה שאני אוכל">
        <div className="section__head">
          <h2>מה שאני אוכל</h2>
          <span className="tiny muted">
            <span className="num">14</span> ימים אחרונים · טאפ = רישום
          </span>
        </div>
        {frequent.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            עוד אין מספיק רישומים. חפש מזון למטה — מה שיחזור על עצמו יופיע כאן.
          </p>
        ) : (
          <ul className="nut-quick" role="list">
            {frequent.map((item) => {
              const grams = qtyOf(item);
              const live = item.kind === 'food' ? resolve(item.foodId) : null;
              const base = live ?? item.ref;
              const v = item.kind === 'adhoc' ? scaled(item.ref, 1) : scaled(base, grams);
              return (
                <li key={item.key} className="nut-quick__item">
                  <button type="button" className="nut-quick__tap" onClick={() => logFrequent(item)}>
                    <span className="nut-quick__name">
                      {item.name}
                      {item.kind === 'adhoc' && <span className="tiny muted"> · הערכה</span>}
                    </span>
                    {item.kind === 'food' && compositionOf(item.foodId) && (
                      <span className="nut-comp">{compositionOf(item.foodId)}</span>
                    )}
                    <span className="nut-quick__nums tiny muted">
                      <span className="num">{int(v.kcal)}</span> קק"ל · <span className="num">{int(v.protein)}</span> חלבון ·{' '}
                      <span className="num">{item.days}</span> ימים
                    </span>
                  </button>
                  {item.kind === 'food' && (
                    <QtyControl
                      unit={unitFor(sourceOf(item.foodId) ?? { portions: [], unitFood: item.unitFood }, item.lastGrams)}
                      grams={grams}
                      label={item.name}
                      onChange={(g) => setQty({ ...qty, [item.key]: g })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- חיפוש ---------- */}
      <section className="nut-card" aria-label="חיפוש">
        <label htmlFor="food-search" className="visually-hidden">
          חיפוש מזון
        </label>
        <input
          id="food-search"
          ref={searchRef}
          className="nut-search"
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={foodIndex.status === 'loading' ? 'טוען מאגר…' : 'חיפוש במאגר או במזונות שלי'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) setSelected(null);
          }}
        />
        {foodIndex.status === 'error' && <p className="tiny err">מאגר המזון לא נטען.</p>}

        {selected ? (
          <div className="nut-selected">
            <div className="nut-selected__head">
              <span className="grow">
                {selected.name}
                {selected.source === 'custom' && !selected.isRecipe && <span className="tiny muted"> · שלי</span>}
                {selected.isRecipe && <span className="tiny muted"> · מנה</span>}
                {selected.suspect && <span className="tiny err"> · ערך חשוד</span>}
              </span>
              <button type="button" className="btn btn--quiet" aria-label="נקה בחירה" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            {compositionOf(selected.id) && <span className="nut-comp nut-comp--full">{compositionOf(selected.id)}</span>}
            <div className="nut-selected__row">
              <QtyControl
                key={selected.id}
                unit={unitFor(sourceOf(selected.id) ?? { portions: selected.portions, unitFood: selected.unitFood }, lastGramsOf(db.entries, selected.id))}
                grams={selGrams}
                label={selected.name}
                onChange={setSelGrams}
              />
              <span className="tiny muted grow">
                <span className="num">{int(scaled(selected, selGrams).kcal)}</span> קק"ל ·{' '}
                <span className="num">{int(scaled(selected, selGrams).protein)}</span> חלבון
              </span>
              <button type="button" className="btn btn--primary" onClick={addSelected}>
                הוסף
              </button>
            </div>
          </div>
        ) : (
          <>
            {query.trim() === '' && results.length > 0 && <p className="tiny muted nut-results__title">אחרונים</p>}
            {results.length > 0 && (
              <ul className="results" role="listbox" aria-label={query.trim() === '' ? 'מזונות אחרונים' : 'תוצאות חיפוש'}>
                {results.map((f) => {
                  const p = portionOf(f);
                  const v = scaled(f, p);
                  return (
                    <li key={f.id} role="option" aria-selected={false}>
                      <button type="button" className="results__btn" onClick={() => pick(f)}>
                        <span className="grow nut-result">
                          {f.name}
                          {f.source === 'custom' && !f.isRecipe && <span className="tiny muted"> · שלי</span>}
                          {f.isRecipe && <span className="tiny muted"> · מנה</span>}
                          {compositionOf(f.id) && <span className="nut-comp">{compositionOf(f.id)}</span>}
                        </span>
                        <span className="tiny muted num">
                          {quantityLabel(sourceOf(f.id) ?? { portions: f.portions, unitFood: f.unitFood }, p)} · {int(v.kcal)} קק"ל · {int(v.protein)} ח
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {query.trim() !== '' && results.length === 0 && foodIndex.status === 'ready' && (
              <p className="tiny muted" style={{ margin: 'var(--sp-2) 0 0' }}>
                לא נמצא. מזון מהתווית מוסיפים במסך "נתונים" → "מזונות שלי".
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------- ארוחה בחוץ ---------- */}
      <section className="nut-card" aria-label="ארוחה בחוץ">
        {!outOpen ? (
          <button type="button" className="btn btn--quiet disclosure" aria-expanded={false} onClick={() => setOutOpen(true)}>
            <span className="grow">ארוחה בחוץ — הערכה</span>
            <span className="muted" aria-hidden="true">
              ▸
            </span>
          </button>
        ) : (
          <div className="stack">
            <div className="section__head">
              <h2>ארוחה בחוץ</h2>
              <span className="tiny muted">הערכה לארוחה שלמה</span>
            </div>
            <div>
              <label htmlFor="out-name">מה</label>
              <input
                id="out-name"
                type="text"
                autoComplete="off"
                placeholder="המבורגר, מסעדה"
                value={out.name}
                onChange={(e) => setOut({ ...out, name: e.target.value })}
              />
            </div>
            <div className="nut-two">
              <div>
                <label htmlFor="out-kcal">קלוריות</label>
                <input
                  id="out-kcal"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={ADHOC_MAX_KCAL}
                  value={out.kcal}
                  onChange={(e) => setOut({ ...out, kcal: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="out-protein">חלבון ג׳</label>
                <input
                  id="out-protein"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={ADHOC_MAX_MACRO}
                  value={out.protein}
                  onChange={(e) => setOut({ ...out, protein: e.target.value })}
                />
              </div>
            </div>
            {outMore ? (
              <div className="nut-two">
                <div>
                  <label htmlFor="out-carbs">פחמימה ג׳</label>
                  <input
                    id="out-carbs"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={ADHOC_MAX_MACRO}
                    value={out.carbs}
                    onChange={(e) => setOut({ ...out, carbs: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="out-fat">שומן ג׳</label>
                  <input
                    id="out-fat"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={ADHOC_MAX_MACRO}
                    value={out.fat}
                    onChange={(e) => setOut({ ...out, fat: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn--quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setOutMore(true)}>
                עוד — פחמימה ושומן
              </button>
            )}
            <div className="row">
              <button type="button" className="btn btn--primary btn--block" disabled={!outValid} onClick={saveOut}>
                רשום
              </button>
              <button type="button" className="btn" onClick={() => setOutOpen(false)}>
                ביטול
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------- הרישומים של היום ---------- */}
      <section className="nut-card" aria-label="מה אכלתי">
        <div className="section__head">
          <h2>{isToday ? 'מה אכלתי היום' : `מה אכלתי · ${formatDM(day)}`}</h2>
          <span className="tiny muted">טאפ על שורה לעריכה</span>
        </div>
        {groups.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            עדיין לא נרשם דבר.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.meal} className="nut-meal">
              <h3 className="nut-meal__title">
                {MEAL_LABELS[g.meal]}
                <span className="tiny muted num">
                  {' '}
                  {int(g.entries.reduce((s, e) => s + entryNutrition(e, resolve(e.foodId)).kcal, 0))} קק"ל
                </span>
              </h3>
              <ul className="nut-log" role="list">
                {g.entries.map((e) => {
                  const live = resolve(e.foodId);
                  const n = entryNutrition(e, live);
                  const isOpen = openEntry === e.id;
                  return (
                    <li key={e.id} className={`nut-row${isOpen ? ' is-open' : ''}${n.adhoc ? ' is-adhoc' : ''}`}>
                      <button
                        type="button"
                        className="nut-row__tap"
                        aria-expanded={isOpen}
                        onClick={() => setOpenEntry(isOpen ? null : e.id)}
                      >
                        <span className="nut-row__name">
                          {entryName(e, live?.name ?? null)}
                          <span className="tiny muted">
                            {' '}
                            · <span className="num">{entryQtyText(e, sourceOf(e.foodId))}</span> · <span className="num">{timeText(e.ts)}</span>
                            {n.live === 'differs' && ' · ההגדרה השתנתה'}
                            {n.live === 'missing' && !n.adhoc && ' · המזון נמחק'}
                          </span>
                          {!isOpen && compositionOf(e.foodId) && <span className="nut-comp">{compositionOf(e.foodId)}</span>}
                        </span>
                        <span className="nut-row__nums num">
                          {int(n.kcal)} <span className="tiny muted">קק"ל</span> · {int(n.protein)} <span className="tiny muted">ח</span>
                        </span>
                      </button>
                      {isOpen && (
                        <div className="nut-row__edit">
                          {(compositionOf(e.foodId) || customOf(e.foodId)?.note) && (
                            <p className="nut-row__about tiny muted">
                              {compositionOf(e.foodId) && <span className="nut-comp nut-comp--full">{compositionOf(e.foodId)}</span>}
                              {customOf(e.foodId)?.note && <span className="nut-comp nut-comp--full">{customOf(e.foodId)?.note}</span>}
                            </p>
                          )}
                          {!n.adhoc && (
                            <QtyControl
                              unit={unitFor(sourceOf(e.foodId) ?? { portions: [], unitFood: e.ref.unitFood === true }, e.grams)}
                              grams={e.grams}
                              label={entryName(e, live?.name ?? null)}
                              onChange={(g) => void store.update('entries', setEntryGrams(db.entries, e.id, g))}
                            />
                          )}
                          <div className="nut-chips" role="group" aria-label="ארוחה">
                            {MEAL_ORDER.map((m) => (
                              <button
                                key={m}
                                type="button"
                                className="nut-chip"
                                aria-pressed={e.meal === m}
                                onClick={() => void store.update('entries', setEntryMeal(db.entries, e.id, m))}
                              >
                                {MEAL_LABELS[m]}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="btn btn--quiet err"
                            aria-label={`מחק ${entryName(e, live?.name ?? null)}`}
                            onClick={() => {
                              setOpenEntry(null);
                              del(e);
                            }}
                          >
                            מחק
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* ---------- סגירת יום · ארוחת שישי ---------- */}
      <section className={`nut-card nut-close${closed ? ' is-closed' : ''}`} aria-label="סגירת היום">
        {friday && (
          <div className="nut-friday">
            <p className="small" style={{ margin: 0 }}>
              ארוחת שישי — הערכה
              {fridayEntry && (
                <span className="tiny muted">
                  {' '}
                  · נרשמה: <span className="num">{int(fridayEntry.ref.kcal / 100)}</span> קק"ל
                </span>
              )}
            </p>
            <div className="nut-chips" role="group" aria-label="גודל ארוחת שישי">
              {FRIDAY_TIER_ORDER.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className="nut-chip nut-chip--tier"
                  aria-pressed={meta?.fridayTier === tier}
                  onClick={() => chooseTier(tier)}
                >
                  {FRIDAY_TIERS[tier].label}
                  <span className="tiny num"> {FRIDAY_TIERS[tier].kcal}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {closed ? (
          <div className="nut-close__state">
            <span className="grow">
              היום נסגר
              {meta?.closedAt && (
                <span className="tiny muted">
                  {' '}
                  · <span className="num">{timeText(Date.parse(meta.closedAt))}</span>
                </span>
              )}
              <span className="tiny muted"> · אפשר עדיין לערוך</span>
            </span>
            <button type="button" className="btn btn--quiet" onClick={toggleClosed}>
              פתח מחדש
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--primary btn--block" onClick={toggleClosed}>
            סיימתי לרשום {isToday ? 'היום' : 'ביום הזה'}
          </button>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>
          יום שלא נסגר אינו מלא, ולא מסיקים ממנו על קלוריות.
        </p>
      </section>
    </div>
  );
}
