/**
 * מסך התזונה (שלב 4 של תוכנית ה-UI): רישום מהיר ביד אחת.
 *
 * מלמעלה למטה: כותרת (תזונה, תאריך, ניווט ימים, מצב היום) · גיבור (חלבון
 * שנשאר, פס, קלוריות מול היעד והרצפה, מאקרו) · קריאטין · חיפוש ו"בחוץ" ·
 * מועדפים (אריחים) · "מה שאני אוכל" (14 יום) · שייקי חלבון · רישומי היום ·
 * ארוחת שישי וסגירת היום.
 *
 * כל בחירת כמות — מועדף, אחרון, תוצאת חיפוש, עריכת רישום — עוברת דרך
 * חלונית אחת (QtySheet). החישוב (lib/nutrition/calc.ts), מבנה הרישום,
 * המועדפים (`fatloss:favorites`, `{foodId, grams}`) והימים לא השתנו.
 * בלי ספרות עשרוניות בכלל.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import type { CustomFood, FoodEntry, FoodRef, FridayTier, MealType } from '../types';
import { ADHOC_FOOD_ID } from '../types';
import { useFoodIndex } from '../useFoodIndex';
import ProgressBar, { toneOf } from '../components/ProgressBar';
import CustomFoodEditor from './CustomFoodEditor';
import QtySheet, { type QtyPreset } from './QtySheet';
import { Button, Disclosure, HeroValue, Icon, ListRow, Notice, Num, SectionHeader, StatusChip, Surface, Toast, QuickTile } from '../ui';
import { ChevronLeft, ChevronRight, Circle, CircleCheck, Plus, Search, WifiOff, X } from '../ui/icons';
import { addDays, compareISO, formatDM, dayName } from '../lib/date';
import { fromCustom, upsertCustomFood, type Food } from '../lib/nutrition/foods';
import { resolveFood, searchFoods } from '../lib/nutrition/index';
import {
  ADHOC_MAX_KCAL,
  ADHOC_MAX_MACRO,
  entriesOn,
  entryName,
  groupByMeal,
  mealForLogging,
  MEAL_LABELS,
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
import { isFavorite, recentFoods, removeFavorite, upsertFavorite } from '../lib/nutrition/favorites';
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
import { compositionLine, gramsText } from '../lib/nutrition/composition';
import { resolveShakes, shakeEntries, type ShakeCombo } from '../lib/nutrition/shakes';
import { shakesOpenByDefault } from '../data/proteinShakes';
import { CREATINE_DOSE_G, creatineOn, creatineTimeText, toggleCreatine } from '../lib/creatine';
import { toLocalISO } from '../lib/date';
import { MEAL_HOURS } from '../data/config';
import { gramsFor, quantityLabel, unitFor, type PortionSource } from '../lib/nutrition/portions';

const SEARCH_LIMIT = 12;
const RECENT_LIMIT = 6;
/** כמה זמן טוסט הביטול ("נרשם · בטל", "נמחק · בטל", "היום נסגר · בטל") נשאר. */
const UNDO_MS = 6000;
/** כמה צ'יפי כמות לכל היותר בחלונית. */
const PRESET_LIMIT = 5;

/** חותמת זמן ממוינת + אקראיות — אותו מתכון כמו במסך האימון. */
function unique(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function'
    ? c.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

/** שלם להצגה. כל מספר במסך עובר כאן — אין ספרות עשרוניות בטאב. */
const int = (n: number | null | undefined): string => kcalText(n);

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

/**
 * מה החלונית פתוחה עליו. `add` — רישום חדש של מזון (ממועדף, מאחרונים,
 * מחיפוש, ממזון שלי שנוצר הרגע); `adhoc` — רישום חוזר של הערכה ידנית;
 * `edit` — רישום קיים של היום.
 */
type SheetState =
  | { kind: 'add'; foodId: string; name: string; ref: FoodRef; grams: number; meal: MealType }
  | { kind: 'adhoc'; name: string; ref: FoodRef; meal: MealType }
  | { kind: 'edit'; entryId: string; grams: number };

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

  // ---------- טוסטים: ביטול רישום/מחיקה, "היום נסגר" ----------
  type Pending =
    | { kind: 'deleted'; entry: FoodEntry; text: string }
    | { kind: 'added'; ids: string[]; text: string }
    | { kind: 'closed'; text: string };
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

  // ---------- סגירת יום וארוחת שישי ----------
  /** "סגור יום" / "פתח מחדש" / "בטל" בטוסט — כולם אותה פונקציה, אותה כתיבה. */
  const toggleClosed = () => {
    void store.update('days', setDayClosed(db.days, day, !closed, new Date().toISOString()));
    // הטוסט מופיע אחרי סגירה; פתיחה מחדש (גם דרך "בטל") מורידה אותו.
    armUndo(closed ? null : { kind: 'closed', text: 'היום נסגר' });
  };

  const restore = () => {
    if (!undo) return;
    if (undo.kind === 'deleted') void store.update('entries', upsertEntry(db.entries, undo.entry));
    else if (undo.kind === 'added') {
      let list = db.entries;
      for (const id of undo.ids) list = removeEntry(list, id);
      void store.update('entries', list);
    } else {
      toggleClosed();
      return;
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

  // ---------- חלונית הכמות ----------
  const [sheet, setSheet] = useState<SheetState | null>(null);

  /** הכמות הראשונית למזון: האחרונה שנרשמה; אחרת יחידה אחת של המזון, או 100 ג׳. */
  const portionOf = (f: Food): number => {
    const last = lastGramsOf(db.entries, f.id);
    if (last !== null) return last;
    const unit = unitFor(sourceOf(f.id) ?? { portions: f.portions, unitFood: f.unitFood });
    return unit.kind === 'grams' ? 100 : gramsFor(unit, 1);
  };

  /** פתיחת חלונית לרישום מזון חי. */
  const openFood = (f: Food, grams = portionOf(f)) => {
    setSheet({ kind: 'add', foodId: f.id, name: f.name, ref: { name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, ...(f.unitFood ? { unitFood: true as const } : {}) }, grams, meal: mealNow() });
  };

  /** פתיחת חלונית לפריט מ"מה שאני אוכל" — גם כשהמזון החי נעלם (אז לפי ה-ref). */
  const openFrequent = (item: FrequentItem) => {
    if (item.kind === 'adhoc') {
      setSheet({ kind: 'adhoc', name: item.name, ref: item.ref, meal: mealNow() });
      return;
    }
    const live = resolve(item.foodId);
    if (live) openFood(live, item.lastGrams);
    else setSheet({ kind: 'add', foodId: item.foodId, name: item.name, ref: item.ref, grams: item.lastGrams, meal: mealNow() });
  };

  /**
   * צ'יפי כמות לחלונית, מהנתונים הקיימים בלבד: הכמויות שנרשמו לאחרונה למזון
   * (עד 3, בלי כפילויות), ואז יחידה אחת מכל יחידת מידה של המזון ("כף · 40 ג׳")
   * והמנה המורכבת ("מנה · 250 ג׳"). עד חמישה.
   */
  const presetsFor = (foodId: string, source: PortionSource | null): QtyPreset[] => {
    const out: QtyPreset[] = [];
    const seen = new Set<number>();
    const push = (grams: number, label: string) => {
      const g = Math.round(grams * 10) / 10;
      if (!(g > 0) || seen.has(g) || out.length >= PRESET_LIMIT) return;
      seen.add(g);
      out.push({ grams: g, label });
    };
    const logged = db.entries.filter((e) => e.foodId === foodId).sort((a, b) => b.ts - a.ts);
    let n = 0;
    for (const e of logged) {
      if (n >= 3) break;
      const before = out.length;
      push(e.grams, quantityLabel(source ?? { portions: [], unitFood: e.ref.unitFood === true }, e.grams));
      if (out.length > before) n++;
    }
    if (source?.recipe && source.recipe.finalGrams > 0) push(source.recipe.finalGrams, `מנה · ${gramsText(source.recipe.finalGrams)} ג׳`);
    for (const p of source?.portions ?? []) push(p.g, `${p.u} · ${gramsText(p.g)} ג׳`);
    return out;
  };

  /** "הוסף לרישום" מחלונית של מזון. */
  const addFromSheet = () => {
    if (!sheet || sheet.kind === 'edit') return;
    const ts = nowTs();
    if (sheet.kind === 'adhoc') {
      commit(relogAdhoc(sheet.ref, sheet.name, sheet.meal, ts, unique()), sheet.name);
      setSheet(null);
      return;
    }
    const live = resolve(sheet.foodId);
    const entry = live
      ? newEntry(live, sheet.grams, sheet.meal, ts, unique())
      : newEntryFromRef(sheet.foodId, sheet.ref, sheet.grams, sheet.meal, ts, unique());
    commit(entry, `${sheet.name} ${quantityLabel(sourceOf(sheet.foodId) ?? { portions: [], unitFood: sheet.ref.unitFood === true }, sheet.grams)}`);
    setSheet(null);
    setQuery('');
  };

  /** כוכב: סימון/הסרה במפתח המועדפים הקיים, באותו מבנה (`{foodId, grams}`). */
  const toggleFavorite = (foodId: string, grams: number) => {
    void store.update(
      'favorites',
      isFavorite(db.favorites, foodId) ? removeFavorite(db.favorites, foodId) : upsertFavorite(db.favorites, { foodId, grams }),
    );
  };

  // ---------- "מה שאני אוכל" ----------
  const frequent = useMemo(() => frequentItems(db.entries, today), [db.entries, today]);

  // ---------- מועדפים ----------
  const favorites = useMemo(
    () =>
      db.favorites
        .map((f) => {
          const food = resolve(f.foodId);
          if (!food) return null;
          const grams = f.grams ?? portionOf(food);
          return { food, grams };
        })
        .filter((x): x is { food: Food; grams: number } => x !== null),
    [db.favorites, db.entries, foodIndex.index], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------- קריאטין ----------
  const creatineToday = creatineOn(db.creatine, day);
  const creatineTime = creatineToday && toLocalISO(new Date(creatineToday.at)) === day ? creatineTimeText(creatineToday.at) : null;
  const toggleCreatineDay = () => {
    void store.update('creatine', toggleCreatine(db.creatine, day, new Date().toISOString()));
  };

  // ---------- שייקי חלבון ----------
  const shakes = useMemo(() => resolveShakes(resolve), [foodIndex.index]); // eslint-disable-line react-hooks/exhaustive-deps
  const shakesMissing = shakes.every((p) => p.powder === null);
  /** פתוח כברירת מחדל לפני הצהריים ואחרי הביניים — כמו "בלוקים"; טאפ משנה. */
  const [shakesOpen, setShakesOpen] = useState(() => shakesOpenByDefault(new Date().getHours(), MEAL_HOURS));
  const [openShake, setOpenShake] = useState<string | null>(null);

  /** שילוב = רישום מיידי: שורה אחת במים, שתיים בחלב; "בטל" מסיר את כולן. */
  const logShake = (combo: ShakeCombo) => {
    const entries = shakeEntries(combo, mealNow(), nowTs(), () => unique());
    let list = db.entries;
    for (const e of entries) list = upsertEntry(list, e);
    void store.update('entries', list);
    armUndo({
      kind: 'added',
      ids: entries.map((e) => e.id),
      text: `${combo.shake.label} · ${combo.label} · ${int(combo.kcal)} קק"ל · ${int(combo.protein)} חלבון`,
    });
  };

  // ---------- חיפוש ----------
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const blurTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (blurTimer.current !== undefined) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  const recent = useMemo(
    () =>
      recentFoods(db.entries.filter((e) => e.foodId !== ADHOC_FOOD_ID), [], RECENT_LIMIT)
        .map((r) => resolve(r.foodId))
        .filter((f): f is Food => f !== null),
    [db.entries, foodIndex.index], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hasQuery = query.trim() !== '';
  const results = useMemo(
    () => (hasQuery ? searchFoods(foodIndex.index, query, SEARCH_LIMIT) : searchFocused ? recent : []),
    [foodIndex.index, query, hasQuery, searchFocused, recent],
  );

  // ---------- עורך מזון שלי (מהתווית) — מתוך "לא נמצא" ----------
  const [editor, setEditor] = useState<{ name: string } | null>(null);

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

  // ---------- נגזרות תצוגה ----------
  const proteinLeft = target ? target.protein - summary.protein : null;
  const kcalLeft = target ? target.kcal - summary.kcal : null;
  const proteinPct = target && target.protein > 0 ? summary.protein / target.protein : 0;
  const kcalPct = target && target.kcal > 0 ? summary.kcal / target.kcal : 0;

  // ---------- עורך מזון שלי: אותו רכיב כמו במסך "נתונים" ----------
  if (editor) {
    return (
      <CustomFoodEditor
        index={foodIndex.index}
        existing={null}
        initialName={editor.name}
        initialMode="label"
        onSave={(food: CustomFood) => {
          void store.update('customFoods', upsertCustomFood(db.customFoods, food));
          setEditor(null);
          setQuery('');
          // המזון החדש נפתח מיד לרישום — בשביל זה חיפשו אותו.
          openFood(fromCustom(food));
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  // ---------- החלונית הפתוחה ----------
  let sheetNode: React.ReactNode = null;
  if (sheet?.kind === 'add') {
    const source = sourceOf(sheet.foodId) ?? { portions: [], unitFood: sheet.ref.unitFood === true };
    const live = resolve(sheet.foodId);
    const notes = [compositionOf(sheet.foodId), customOf(sheet.foodId)?.note ?? null, live?.suspect ? 'ערך חשוד במאגר' : null, !live ? 'המזון נמחק — לפי הערכים שנרשמו בפעם הקודמת' : null].filter((x): x is string => x !== null && x !== '');
    sheetNode = (
      <QtySheet
        title={sheet.name}
        note={notes.length > 0 ? notes.join(' · ') : undefined}
        per100={live ?? sheet.ref}
        unit={unitFor(source, lastGramsOf(db.entries, sheet.foodId))}
        grams={sheet.grams}
        onGrams={(g) => setSheet({ ...sheet, grams: g })}
        presets={presetsFor(sheet.foodId, sourceOf(sheet.foodId))}
        meal={sheet.meal}
        onMeal={(m) => setSheet({ ...sheet, meal: m })}
        primaryLabel="הוסף לרישום"
        onPrimary={addFromSheet}
        favorite={live ? { on: isFavorite(db.favorites, sheet.foodId), toggle: () => toggleFavorite(sheet.foodId, sheet.grams) } : undefined}
        onClose={() => setSheet(null)}
      />
    );
  } else if (sheet?.kind === 'adhoc') {
    sheetNode = (
      <QtySheet
        title={sheet.name}
        note="הערכה — רישום חוזר של ההזנה הידנית, באותם ערכים"
        per100={sheet.ref}
        unit={{ kind: 'grams' }}
        grams={1}
        onGrams={() => undefined}
        presets={[]}
        adhoc
        meal={sheet.meal}
        onMeal={(m) => setSheet({ ...sheet, meal: m })}
        primaryLabel="הוסף לרישום"
        onPrimary={addFromSheet}
        onClose={() => setSheet(null)}
      />
    );
  } else if (sheet?.kind === 'edit') {
    const e = db.entries.find((x) => x.id === sheet.entryId) ?? null;
    if (e) {
      const live = resolve(e.foodId);
      const n = entryNutrition(e, live);
      const notes = [compositionOf(e.foodId), customOf(e.foodId)?.note ?? null, n.live === 'differs' ? 'ההגדרה השתנתה מאז הרישום — הערכים לפי מה שנרשם' : null, n.live === 'missing' && !n.adhoc ? 'המזון נמחק — הערכים לפי מה שנרשם' : null].filter((x): x is string => x !== null && x !== '');
      sheetNode = (
        <QtySheet
          title={entryName(e, live?.name ?? null)}
          note={notes.length > 0 ? notes.join(' · ') : undefined}
          per100={e.ref}
          unit={unitFor(sourceOf(e.foodId) ?? { portions: [], unitFood: e.ref.unitFood === true }, e.grams)}
          grams={sheet.grams}
          onGrams={(g) => setSheet({ ...sheet, grams: g })}
          presets={presetsFor(e.foodId, sourceOf(e.foodId))}
          adhoc={n.adhoc}
          meal={e.meal}
          onMeal={(m) => void store.update('entries', setEntryMeal(db.entries, e.id, m))}
          primaryLabel="שמור"
          onPrimary={() => {
            if (!n.adhoc && Math.abs(sheet.grams - e.grams) >= 0.05) void store.update('entries', setEntryGrams(db.entries, e.id, sheet.grams));
            setSheet(null);
          }}
          onDelete={() => {
            setSheet(null);
            del(e);
          }}
          onClose={() => setSheet(null)}
        />
      );
    }
  }

  return (
    <div className="nut stack--loose">
      {/* ---------- כותרת: תזונה, תאריך, מצב היום ---------- */}
      <header className="top nut-top">
        <div className="grow">
          <p className="top__eyebrow">
            {isToday ? 'היום' : dayName(day)} · <Num>{formatDM(day)}</Num>
          </p>
          <p className="top__title">תזונה</p>
        </div>
        <div className="nut-top__state">
          <StatusChip tone={closed ? 'done' : 'neutral'} icon={closed ? CircleCheck : Circle}>
            {closed ? 'נסגר' : 'פתוח'}
          </StatusChip>
          {closed ? (
            <Button variant="ghost" onClick={toggleClosed}>
              פתח מחדש
            </Button>
          ) : (
            <Button onClick={toggleClosed}>סגור יום</Button>
          )}
        </div>
      </header>

      {/* ---------- ניווט ימים (כמו היום) ---------- */}
      <nav className="nut-daybar" aria-label="יום">
        {/* RTL: "קודם" יושב מימין ומצביע ימינה, "הבא" משמאל ומצביע שמאלה. */}
        <Button variant="ghost" aria-label="יום קודם" onClick={() => setDay(addDays(day, -1))}>
          <Icon icon={ChevronRight} />
        </Button>
        <div className="nut-daybar__label">
          <span className="strong">{isToday ? 'היום' : dayName(day)}</span>
          {' · '}
          <Num>{formatDM(day)}</Num>
          {estimated && (
            <>
              {' '}
              <StatusChip tone="neutral">כולל הערכות</StatusChip>
            </>
          )}
        </div>
        <Button variant="ghost" aria-label="יום הבא" disabled={isToday} onClick={() => setDay(addDays(day, 1))}>
          <Icon icon={ChevronLeft} />
        </Button>
      </nav>

      {/* ---------- גיבור: חלבון שנשאר, קלוריות מול היעד והרצפה, מאקרו ---------- */}
      <Surface variant="hero" className={`nut-hero${closed ? ' is-closed' : ''}`} aria-label="סיכום היום">
        <p className="nut-hero__label">{target ? 'חלבון שנשאר להיום' : 'חלבון היום'}</p>
        <HeroValue
          value={int(target && proteinLeft !== null ? Math.max(0, proteinLeft) : summary.protein)}
          unit="ג׳"
          aside={target && proteinLeft !== null && proteinLeft <= 0 ? <StatusChip tone="done">היעד הושלם</StatusChip> : undefined}
          label={target && proteinLeft !== null ? `חלבון שנשאר להיום ${int(Math.max(0, proteinLeft))} גרם` : `חלבון היום ${int(summary.protein)} גרם`}
        />
        {target ? (
          <>
            <ProgressBar value={summary.protein} target={target.protein} label="חלבון מול היעד" />
            <div className="nut-hero__meta">
              <span className={`nut-tone--${toneOf(proteinPct)}`}>
                <Num>{int(summary.protein)}</Num> / <Num>{int(target.protein)}</Num> ג׳ חלבון
              </span>
              <span className="muted">
                <Num>{int(summary.kcal)}</Num> / <Num>{int(target.kcal)}</Num> קק״ל
              </span>
            </div>
            <div className="nut-hero__kcal">
              <div className="nut-hero__head">
                <span className="nut-hero__label">קלוריות</span>
                <span className={`nut-hero__kcalval num nut-tone--${toneOf(kcalPct)}`}>
                  {kcalLeft !== null && kcalLeft >= 0 ? (
                    <>
                      <span className="nut-hero__unit">נשארו </span>
                      {int(kcalLeft)}
                    </>
                  ) : (
                    <>
                      {int(-(kcalLeft ?? 0))}
                      <span className="nut-hero__unit"> מעל היעד</span>
                    </>
                  )}
                </span>
              </div>
              <ProgressBar value={summary.kcal} target={target.kcal} floor={KCAL_FLOOR} label="קלוריות מול היעד" />
              <p className="nut-hero__note tiny muted">
                יעד <Num>{int(target.kcal)}</Num> · רצפה <Num>{int(KCAL_FLOOR)}</Num>
              </p>
            </div>
          </>
        ) : (
          <p className="nut-hero__note tiny muted">
            אין יעד מוגדר — במסך "נתונים" · <Num>{int(summary.kcal)}</Num> קק״ל היום
          </p>
        )}
        <p className="nut-macros tiny muted">
          פחמימה{' '}
          <Num>
            {summary.carbsUnknownGrams > 0 ? '≥' : ''}
            {int(summary.carbs)}
          </Num>
          {target && (
            <>
              /<Num>{int(target.carbs)}</Num>
            </>
          )}
          {' · '}שומן{' '}
          <Num>
            {summary.fatUnknownGrams > 0 ? '≥' : ''}
            {int(summary.fat)}
          </Num>
          {target && (
            <>
              /<Num>{int(target.fat)}</Num>
            </>
          )}
          {' · '}סיבים{' '}
          <Num>
            {summary.fiberUnknownGrams > 0 ? '≥' : ''}
            {int(summary.fiber)}
          </Num>
          {' · '}
          <Num>{summary.count}</Num> {summary.count === 1 ? 'רישום' : 'רישומים'}
        </p>
      </Surface>

      {saveOffer && (
        <Notice
          tone="reminder"
          action={
            <>
              <Button variant="ghost" onClick={saveAsFood}>
                שמור
              </Button>
              <Button variant="ghost" aria-label="לא עכשיו" onClick={() => setSaveOffer(null)}>
                <Icon icon={X} size={18} />
              </Button>
            </>
          }
        >
          "{saveOffer.name}" חוזר על עצמו. לשמור כמזון קבוע?
        </Notice>
      )}

      {/* ---------- קריאטין: שורה אחת, נגיעה מחליפה מצב ליום המוצג. לא מזון, 0 קק״ל. ---------- */}
      <Surface className="surface--row nut-creatine" aria-label="קריאטין">
        <ListRow
          onTap={toggleCreatineDay}
          aria-pressed={creatineToday !== null}
          lead={creatineToday ? CircleCheck : Circle}
          className={creatineToday ? 'is-on' : undefined}
          title={
            <>
              קריאטין <Num>{CREATINE_DOSE_G}</Num> גר׳
            </>
          }
          end={<span className="tiny muted num">{creatineToday ? (creatineTime ?? 'סומן') : 'לא סומן'}</span>}
        />
      </Surface>

      {/* ---------- חיפוש במאגר ו"בחוץ" ---------- */}
      <Surface className="nut-searchcard" aria-label="חיפוש">
        <div className="nut-searchrow">
          <label htmlFor="food-search" className="visually-hidden">
            חיפוש מזון
          </label>
          <div className="nut-search__wrap">
            <Icon icon={Search} className="nut-search__icon" />
            <input
              id="food-search"
              className="nut-search"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder={foodIndex.status === 'loading' ? 'טוען מאגר…' : foodIndex.status === 'offline' ? 'חיפוש במזונות שלי' : 'חיפוש במאגר או במזונות שלי'}
              value={query}
              onFocus={() => {
                if (blurTimer.current !== undefined) window.clearTimeout(blurTimer.current);
                setSearchFocused(true);
              }}
              onBlur={() => {
                // "אחרונים" נשארים רגע אחרי היציאה מהשדה, כדי שנגיעה בתוצאה תיתפס.
                blurTimer.current = window.setTimeout(() => setSearchFocused(false), 200);
              }}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant={outOpen ? 'secondary' : 'ghost'} aria-expanded={outOpen} onClick={() => setOutOpen((v) => !v)}>
            בחוץ
          </Button>
        </div>

        {foodIndex.status === 'offline' && (
          <Notice
            tone="info"
            icon={WifiOff}
            className="nut-offline"
            action={
              <Button variant="ghost" onClick={foodIndex.retry}>
                נסה שוב
              </Button>
            }
          >
            מאגר המזון עוד לא נשמר במכשיר. פתח את האפליקציה פעם אחת עם חיבור — המזונות שלי זמינים גם עכשיו.
          </Notice>
        )}
        {foodIndex.status === 'error' && (
          <Notice
            tone="danger"
            className="nut-offline"
            action={
              <Button variant="ghost" onClick={foodIndex.retry}>
                נסה שוב
              </Button>
            }
          >
            מאגר המזון לא נטען{foodIndex.error ? ` (${foodIndex.error})` : ''}.
          </Notice>
        )}

        {outOpen && (
          <div className="stack nut-out">
            <SectionHeader title="ארוחה בחוץ" aside="הערכה לארוחה שלמה" />
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
                <input id="out-kcal" type="number" inputMode="numeric" min={0} max={ADHOC_MAX_KCAL} value={out.kcal} onChange={(e) => setOut({ ...out, kcal: e.target.value })} />
              </div>
              <div>
                <label htmlFor="out-protein">חלבון ג׳</label>
                <input id="out-protein" type="number" inputMode="numeric" min={0} max={ADHOC_MAX_MACRO} value={out.protein} onChange={(e) => setOut({ ...out, protein: e.target.value })} />
              </div>
            </div>
            {outMore ? (
              <div className="nut-two">
                <div>
                  <label htmlFor="out-carbs">פחמימה ג׳</label>
                  <input id="out-carbs" type="number" inputMode="numeric" min={0} max={ADHOC_MAX_MACRO} value={out.carbs} onChange={(e) => setOut({ ...out, carbs: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="out-fat">שומן ג׳</label>
                  <input id="out-fat" type="number" inputMode="numeric" min={0} max={ADHOC_MAX_MACRO} value={out.fat} onChange={(e) => setOut({ ...out, fat: e.target.value })} />
                </div>
              </div>
            ) : (
              <Button variant="ghost" style={{ justifySelf: 'start' }} onClick={() => setOutMore(true)}>
                עוד — פחמימה ושומן
              </Button>
            )}
            <div className="row">
              <Button variant="accent" block disabled={!outValid} onClick={saveOut}>
                רשום
              </Button>
              <Button onClick={() => setOutOpen(false)}>ביטול</Button>
            </div>
          </div>
        )}

        {!outOpen && results.length > 0 && (
          <>
            {!hasQuery && <p className="tiny muted nut-results__title">אחרונים</p>}
            <ul className="nut-results" role="listbox" aria-label={hasQuery ? 'תוצאות חיפוש' : 'מזונות אחרונים'}>
              {results.map((f) => {
                const p = portionOf(f);
                const v = scaled(f, p);
                return (
                  <li key={f.id} role="option" aria-selected={false}>
                    <ListRow
                      wrap
                      onTap={() => openFood(f, p)}
                      title={
                        <>
                          {f.name}
                          {f.source === 'custom' && !f.isRecipe && <span className="tiny muted"> · שלי</span>}
                          {f.isRecipe && <span className="tiny muted"> · מנה</span>}
                          {f.suspect && <span className="tiny err"> · ערך חשוד</span>}
                        </>
                      }
                      sub={
                        <>
                          {compositionOf(f.id) && <span className="nut-comp">{compositionOf(f.id)}</span>}
                          <Num>{quantityLabel(sourceOf(f.id) ?? { portions: f.portions, unitFood: f.unitFood }, p)}</Num> · <Num>{int(v.kcal)}</Num> קק"ל · <Num>{int(v.protein)}</Num> חלבון
                        </>
                      }
                      end={<Icon icon={Plus} className="nut-plus" />}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {!outOpen && hasQuery && results.length === 0 && foodIndex.status !== 'loading' && (
          <div className="nut-noresults">
            <p className="tiny muted" style={{ margin: 0 }}>
              לא נמצא.{foodIndex.status === 'offline' ? ' המאגר עוד לא במכשיר — רק המזונות שלי נבדקו.' : ''}
            </p>
            <Button variant="ghost" onClick={() => setEditor({ name: query.trim() })}>
              <Icon icon={Plus} size={18} />
              הוסף מזון מהתווית
            </Button>
          </div>
        )}
      </Surface>

      {/* ---------- מועדפים ---------- */}
      <Surface aria-label="מועדפים">
        <SectionHeader title="מועדפים" aside={favorites.length > 0 ? 'נגיעה = כמות' : undefined} />
        {favorites.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            אין מועדפים עדיין. בחלונית הכמות של מזון — "הוסף למועדפים".
          </p>
        ) : (
          <div className="qtiles">
            {favorites.map(({ food, grams }) => {
              const v = scaled(food, grams);
              const qty = quantityLabel(sourceOf(food.id) ?? { portions: food.portions, unitFood: food.unitFood }, grams);
              return (
                <QuickTile
                  key={food.id}
                  value={int(v.protein)}
                  unit="ג׳"
                  title={food.name}
                  sub={
                    <>
                      <Num>{qty}</Num> · <Num>{int(v.kcal)}</Num> קק״ל
                    </>
                  }
                  onTap={() => openFood(food, grams)}
                  tapLabel={`${food.name} — ${qty}, ${int(v.protein)} גרם חלבון. כמות ורישום`}
                />
              );
            })}
          </div>
        )}
      </Surface>

      {/* ---------- מה שאני אוכל ---------- */}
      <Surface aria-label="מה שאני אוכל">
        <SectionHeader
          title="מה שאני אוכל"
          aside={
            <>
              <Num>14</Num> ימים אחרונים · נגיעה = כמות
            </>
          }
        />
        {frequent.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            עוד אין מספיק רישומים. חפש מזון למעלה — מה שיחזור על עצמו יופיע כאן.
          </p>
        ) : (
          <ul className="nut-list" role="list">
            {frequent.map((item) => {
              const live = item.kind === 'food' ? resolve(item.foodId) : null;
              const base = live ?? item.ref;
              const v = item.kind === 'adhoc' ? scaled(item.ref, 1) : scaled(base, item.lastGrams);
              const qty = item.kind === 'adhoc' ? 'הערכה' : quantityLabel(sourceOf(item.foodId) ?? { portions: [], unitFood: item.unitFood }, item.lastGrams);
              return (
                <li key={item.key}>
                  <ListRow
                    wrap
                    onTap={() => openFrequent(item)}
                    title={item.name}
                    sub={
                      <>
                        {item.kind === 'food' && compositionOf(item.foodId) && <span className="nut-comp">{compositionOf(item.foodId)}</span>}
                        <Num>{qty}</Num> · <Num>{int(v.kcal)}</Num> קק"ל · <Num>{item.days}</Num> ימים
                      </>
                    }
                    end={
                      <>
                        <span className="nut-protein">
                          <Num>{int(v.protein)}</Num> <span className="tiny muted">ג׳</span>
                        </span>
                        <Icon icon={Plus} className="nut-plus" />
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      {/* ---------- שייקי חלבון: קבוצה מתקפלת, 4 מוצרים × 4 שילובים, טאפ = רישום ---------- */}
      <Surface aria-label="שייקי חלבון" className="surface--row">
        <Disclosure title="שייקי חלבון" summary="סקופ · מים / חלב 3% · נגיעה = רישום" open={shakesOpen} onToggle={() => setShakesOpen((v) => !v)}>
          {shakesMissing ? (
            <p className="small muted" style={{ margin: 0 }}>
              האבקות עוד לא בספרייה — במסך "נתונים" לחץ "טען את ספריית המנות".
            </p>
          ) : (
            <div className="nut-shakes">
              {shakes.map((p) => {
                const open = openShake === p.shake.slug;
                return (
                  <Disclosure
                    key={p.shake.slug}
                    title={p.shake.label}
                    summary={
                      <>
                        סקופ <Num>{p.shake.scoopGrams}</Num> ג׳
                      </>
                    }
                    open={open}
                    onToggle={() => setOpenShake(open ? null : p.shake.slug)}
                  >
                    {p.combos.length === 0 ? (
                      <p className="tiny muted" style={{ margin: 0 }}>
                        הפריט לא בספרייה — טען את ספריית המנות במסך "נתונים".
                      </p>
                    ) : (
                      <ul className="nut-list" role="list">
                        {p.combos.map((c) => (
                          <li key={`${c.scoops}-${c.liquid}`}>
                            <ListRow
                              onTap={() => logShake(c)}
                              title={c.label}
                              end={
                                <span className="tiny muted num">
                                  {int(c.kcal)} קק״ל · {int(c.protein)} ח
                                </span>
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Disclosure>
                );
              })}
            </div>
          )}
        </Disclosure>
      </Surface>

      {/* ---------- הרישומים של היום ---------- */}
      <Surface aria-label="מה אכלתי">
        <SectionHeader title={isToday ? 'מה אכלתי היום' : `מה אכלתי · ${formatDM(day)}`} aside="נגיעה = עריכה" />
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
              <ul className="nut-list" role="list">
                {g.entries.map((e) => {
                  const live = resolve(e.foodId);
                  const n = entryNutrition(e, live);
                  return (
                    <li key={e.id}>
                      <ListRow
                        wrap
                        className={n.adhoc ? 'is-adhoc' : undefined}
                        onTap={() => setSheet({ kind: 'edit', entryId: e.id, grams: e.grams })}
                        title={entryName(e, live?.name ?? null)}
                        sub={
                          <>
                            {compositionOf(e.foodId) && <span className="nut-comp">{compositionOf(e.foodId)}</span>}
                            <Num>{entryQtyText(e, sourceOf(e.foodId))}</Num> · <Num>{timeText(e.ts)}</Num>
                            {n.live === 'differs' && ' · ההגדרה השתנתה'}
                            {n.live === 'missing' && !n.adhoc && ' · המזון נמחק'}
                          </>
                        }
                        end={
                          <span className="nut-rownums num">
                            {int(n.kcal)} <span className="tiny muted">קק"ל</span> · {int(n.protein)} <span className="tiny muted">ח</span>
                          </span>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </Surface>

      {/* ---------- ארוחת שישי · סגירת יום ---------- */}
      <Surface className={`nut-close${closed ? ' is-closed' : ''}`} aria-label="סגירת היום">
        {friday && (
          <div className="nut-friday">
            <p className="small" style={{ margin: 0 }}>
              ארוחת שישי — הערכה
              {fridayEntry && (
                <span className="tiny muted">
                  {' '}
                  · נרשמה: <Num>{int(fridayEntry.ref.kcal / 100)}</Num> קק"ל
                </span>
              )}
            </p>
            <div className="nut-chips" role="group" aria-label="גודל ארוחת שישי">
              {FRIDAY_TIER_ORDER.map((tier) => (
                <button key={tier} type="button" className="nut-chip nut-chip--tier" aria-pressed={meta?.fridayTier === tier} onClick={() => chooseTier(tier)}>
                  {FRIDAY_TIERS[tier].label}
                  <span className="tiny num"> {FRIDAY_TIERS[tier].kcal}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {closed ? (
          <div className="nut-close__state">
            <Icon icon={CircleCheck} />
            <span className="grow">
              היום נסגר
              {meta?.closedAt && (
                <span className="tiny muted">
                  {' '}
                  · <Num>{timeText(Date.parse(meta.closedAt))}</Num>
                </span>
              )}
              <span className="tiny muted"> · אפשר עדיין לערוך</span>
            </span>
            <Button variant="ghost" onClick={toggleClosed}>
              פתח מחדש
            </Button>
          </div>
        ) : (
          <Button variant="accent" block onClick={toggleClosed}>
            סיימתי לרשום {isToday ? 'היום' : 'ביום הזה'}
          </Button>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>
          יום שלא נסגר אינו מלא, ולא מסיקים ממנו על קלוריות.
        </p>
      </Surface>

      {/* ---------- טוסט: "נרשם · בטל", "נמחק · בטל", "היום נסגר · בטל" (6 שניות) ---------- */}
      {undo && (undo.kind !== 'closed' || closed) && (
        <Toast actionLabel="בטל" onAction={restore}>
          {undo.text}
        </Toast>
      )}

      {sheetNode}
    </div>
  );
}
