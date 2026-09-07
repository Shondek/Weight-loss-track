import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import type { CustomFood, FoodEntry, MealType, NutritionTarget } from '../types';
import { useFoodIndex } from '../useFoodIndex';
import NumberField from '../components/NumberField';
import CustomFoodEditor, { type EditorMode } from './CustomFoodEditor';
import { MEAL_HOURS } from '../data/config';
import { MEAL_MENU, NUT_GRAMS } from '../data/mealMenu';
import { formatDM } from '../lib/date';
import { DASH } from '../lib/format';
import {
  MAX_GRAMS,
  MAX_TARGET_CARBS,
  MAX_TARGET_FAT,
  MAX_TARGET_KCAL,
  MAX_TARGET_PROTEIN,
  MIN_GRAMS,
  MIN_TARGET_KCAL,
} from '../lib/schema';
import { displayValues, fromCustom, removeCustomFood, upsertCustomFood, type Food } from '../lib/nutrition/foods';
import { resolveFood, searchFoods } from '../lib/nutrition/index';
import {
  ADHOC_MAX_KCAL,
  ADHOC_MAX_MACRO,
  defaultMeal,
  entriesOn,
  entryName,
  groupByMeal,
  MACRO_GAP_WARN,
  macroKcalGap,
  MEAL_LABELS,
  MEAL_ORDER,
  newAdhocEntry,
  newEntry,
  removeEntry,
  setEntryGrams,
  upsertEntry,
} from '../lib/nutrition/entries';
import {
  addonFoodIds,
  dishLoggedOn,
  expectedAddonCount,
  menuGroupForHour,
  nutEntriesOn,
  nutFoodIds,
  resolveMenu,
  type MenuGroupKey,
  type ResolvedMenuItem,
} from '../lib/nutrition/menu';
import { libraryFoodId } from '../lib/nutrition/library';
import { KCAL_FLOOR, targetFor, upsertTarget } from '../lib/nutrition/targets';
import { daySummary, entryNutrition } from '../lib/nutrition/calc';
import { gramsWholeText, kcalText, macroText } from '../lib/nutrition/display';

const SEARCH_LIMIT = 20;
const UNDO_MS = 5000;
const NUT_IDS = nutFoodIds(MEAL_MENU);
const ADDON_IDS = addonFoodIds(MEAL_MENU);

/** חותמת זמן ממוינת + אקראיות — אותו מתכון כמו במסך האימון. */
function unique(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function'
    ? c.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

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

export default function NutritionScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const foodIndex = useFoodIndex(db.customFoods);
  const resolve = (id: string) => resolveFood(foodIndex.index, id);

  // ---------- סיכום היום ----------
  const todayEntries = useMemo(() => entriesOn(db.entries, today), [db.entries, today]);
  const summary = useMemo(
    () => daySummary(todayEntries, today, (id) => resolveFood(foodIndex.index, id), ADDON_IDS),
    [todayEntries, today, foodIndex.index],
  );
  const expectedAddons = useMemo(() => expectedAddonCount(todayEntries, today, MEAL_MENU), [todayEntries, today]);
  const target = useMemo(() => targetFor(db.targets, today), [db.targets, today]);
  /** מעל היעד: עובדה בלבד, בלי צבע. מתחת ליעד לא נאמר דבר — "נשאר" מתגמל תת-אכילה. */
  const overTarget = target ? Math.max(0, summary.kcal - target.kcal) : 0;
  const groups = useMemo(() => groupByMeal(todayEntries), [todayEntries]);

  // ---------- הוספת רישום ----------
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [gramsText, setGramsText] = useState('');
  const [meal, setMeal] = useState<MealType>(() => defaultMeal(new Date().getHours(), MEAL_HOURS));
  const [mealTouched, setMealTouched] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const gramsRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => (selected ? [] : searchFoods(foodIndex.index, query, SEARCH_LIMIT)),
    [foodIndex.index, query, selected],
  );
  const grams = parseGrams(gramsText);
  const canAdd = selected !== null && grams !== null;

  const pick = (food: Food) => {
    setSelected(food);
    setQuery(food.name);
    // בתוך מחוות המשתמש — כך iOS פותח את המקלדת. השדה תמיד קיים ב-DOM.
    gramsRef.current?.focus();
  };

  const clearPick = () => {
    setSelected(null);
    setQuery('');
    setGramsText('');
    searchRef.current?.focus();
  };

  const add = () => {
    if (!selected || grams === null) return;
    const ts = Date.now();
    const entry = newEntry(selected, grams, meal, ts, unique());
    void store.update('entries', upsertEntry(db.entries, entry));
    // איפוס לרישום הבא מאותה ארוחה; הארוחה נשארת.
    setSelected(null);
    setQuery('');
    setGramsText('');
    searchRef.current?.focus();
  };

  // ארוחת ברירת המחדל עוקבת אחרי השעה עד שנוגעים בה ידנית.
  useEffect(() => {
    if (mealTouched) return;
    const id = window.setInterval(() => {
      setMeal(defaultMeal(new Date().getHours(), MEAL_HOURS));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [mealTouched]);

  // ---------- undo: מחיקה מהרשימה, או רישום בלחיצה מהתפריט ----------
  /** 'added' יכול להיות קבוצה: מנה + ברירות המחדל שלה. "בטל" מסיר את כולן. */
  type Pending = { kind: 'deleted'; entry: FoodEntry; text: string } | { kind: 'added'; entries: FoodEntry[]; text: string };
  const [undo, setUndo] = useState<Pending | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  const armUndo = (pending: Pending | null) => {
    if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current);
    setUndo(pending);
    if (pending) undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };

  // מעבר מסך מפרק את הקומפוננטה — ה-undo נעלם איתה, וזה בכוונה.
  useEffect(
    () => () => {
      if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const del = (entry: FoodEntry) => {
    void store.update('entries', removeEntry(db.entries, entry.id));
    armUndo({ kind: 'deleted', entry, text: `נמחק: ${entry.ref.name} · ${entry.grams} ג׳` });
  };

  const restore = () => {
    if (!undo) return;
    if (undo.kind === 'deleted') void store.update('entries', upsertEntry(db.entries, undo.entry));
    else {
      let list = db.entries;
      for (const e of undo.entries) list = removeEntry(list, e.id);
      void store.update('entries', list);
    }
    armUndo(null);
  };

  // ---------- "התפריט שלי": רישום בלחיצה אחת ----------
  const menu = useMemo(
    () =>
      resolveMenu(
        MEAL_MENU,
        (id) => resolveFood(foodIndex.index, id),
        (id) => db.customFoods.find((f) => f.id === id)?.recipe ?? null,
      ),
    [foodIndex.index, db.customFoods],
  );
  const menuEmpty = menu.every((g) => g.items.length === 0);
  // הקבוצה הפתוחה לפי השעה בכניסה למסך; לא נשמרת.
  const [openGroup, setOpenGroup] = useState<MenuGroupKey | null>(() => menuGroupForHour(new Date().getHours(), MEAL_HOURS));
  const nutsToday = useMemo(() => nutEntriesOn(db.entries, today, NUT_IDS), [db.entries, today]);

  const logMenuItem = (r: ResolvedMenuItem) => {
    const ts = Date.now();
    // הארוחה לפי השעה עכשיו — לא לפי הבחירה בטופס החיפוש.
    const mealNow = defaultMeal(new Date(ts).getHours(), MEAL_HOURS);
    const entries = [newEntry(r.food, r.grams, mealNow, ts, unique())];
    const labels = [r.item.label];
    let kcal = r.kcal;
    // ברירות המחדל — רישומים נפרדים, פעם אחת ביום לכל מנה: אם המנה כבר נרשמה
    // היום, לא נוצרות שוב (תוסף שנמחק לא חוזר).
    if (r.item.defaults && !dishLoggedOn(db.entries, today, r.food.id)) {
      for (const d of r.item.defaults) {
        const food = resolve(libraryFoodId(d.slug));
        if (!food) continue;
        entries.push(newEntry(food, d.grams, mealNow, ts, unique()));
        labels.push(d.label);
        kcal += (food.kcal * d.grams) / 100;
      }
    }
    let list = db.entries;
    for (const e of entries) list = upsertEntry(list, e);
    void store.update('entries', list);
    // אזהרה רכה: אגוז שני היום. נרשם בכל מקרה.
    const nutNow = r.item.nut || entries.some((e) => NUT_IDS.has(e.foodId));
    const nutAgain = nutNow && nutsToday.length > 0 ? ' · כבר נרשם אגוז היום' : '';
    armUndo({ kind: 'added', entries, text: `${labels.join(' + ')} · ${kcalText(kcal)} קק"ל${nutAgain}` });
  };

  // ---------- הזנה ידנית: אוכל בחוץ, ערכים לארוחה שלמה ----------
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhoc, setAdhoc] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const adhocKcal = parseAmount(adhoc.kcal, ADHOC_MAX_KCAL);
  const adhocProtein = parseAmount(adhoc.protein, ADHOC_MAX_MACRO);
  const adhocCarbs = parseAmount(adhoc.carbs, ADHOC_MAX_MACRO);
  const adhocFat = parseAmount(adhoc.fat, ADHOC_MAX_MACRO);
  const adhocValid =
    adhoc.name.trim() !== '' &&
    typeof adhocKcal === 'number' &&
    typeof adhocProtein === 'number' &&
    adhocCarbs !== undefined &&
    adhocFat !== undefined;
  const adhocGap =
    typeof adhocKcal === 'number' && typeof adhocProtein === 'number' && typeof adhocCarbs === 'number' && typeof adhocFat === 'number'
      ? macroKcalGap(adhocKcal, adhocProtein, adhocCarbs, adhocFat)
      : null;

  const saveAdhoc = () => {
    if (!adhocValid || typeof adhocKcal !== 'number' || typeof adhocProtein !== 'number') return;
    const ts = Date.now();
    const entry = newAdhocEntry(
      { name: adhoc.name, kcal: adhocKcal, protein: adhocProtein, carbs: adhocCarbs ?? null, fat: adhocFat ?? null },
      meal,
      ts,
      unique(),
    );
    void store.update('entries', upsertEntry(db.entries, entry));
    setAdhoc({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
    setAdhocOpen(false);
  };

  // ---------- עריכת גרמים בשורת היום ----------
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const commitGrams = () => {
    if (!editing) return;
    const g = parseGrams(editing.text);
    if (g !== null) void store.update('entries', setEntryGrams(db.entries, editing.id, g));
    setEditing(null);
  };

  // ---------- יעד ----------
  const [editingTarget, setEditingTarget] = useState(false);

  // ---------- מזונות שלי ----------
  const [editor, setEditor] = useState<{ existing: CustomFood | null; name?: string; mode?: EditorMode } | null>(null);

  const saveCustom = (food: CustomFood) => {
    void store.update('customFoods', upsertCustomFood(db.customFoods, food));
    setEditor(null);
    // מזון שנוצר מתוך החיפוש נבחר מיד לרישום — ממשיכים מאיפה שעצרנו.
    if (!editor?.existing) {
      setSelected(fromCustom(food));
      setQuery(food.name);
      setGramsText('');
    }
  };

  if (editor) {
    return (
      <CustomFoodEditor
        index={foodIndex.index}
        existing={editor.existing}
        initialName={editor.name}
        initialMode={editor.mode}
        onSave={saveCustom}
        onCancel={() => setEditor(null)}
        onDelete={
          editor.existing
            ? () => {
                void store.update('customFoods', removeCustomFood(db.customFoods, editor.existing!.id));
                setEditor(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="stack--loose">
      <section className="section section--first">
        <p className="sub" style={{ margin: 0 }}>
          היום · <span className="num">{formatDM(today)}</span> · חלבון
        </p>
        {/* חלבון הוא היעד היחיד שלא נחתך, ולכן הוא המספר הגדול. יום ריק מושתק. */}
        <p className={`hero${summary.count === 0 ? ' hero--empty' : ''}`} style={{ margin: 0 }}>
          <span className="num">{gramsWholeText(summary.protein)}</span>
        </p>
        <p className="sub" style={{ margin: '6px 0 0' }}>
          {target ? (
            <>
              ג׳ מתוך <span className="num">{gramsWholeText(target.protein)}</span>
            </>
          ) : (
            <>ג׳ · אין יעד מוגדר</>
          )}
        </p>

        {/* המאקרו המשני: אריחים קטנים מהאריח הרגיל — רמה שנייה, לא שווה לחלבון. */}
        <div className="macros" style={{ marginTop: 'var(--sp-3)' }} role="list">
          {(
            [
              ['פחמימה', summary.carbs, target?.carbs, summary.carbsUnknownGrams > 0],
              ['שומן', summary.fat, target?.fat, summary.fatUnknownGrams > 0],
              ['סיבים', summary.fiber, undefined, summary.fiberUnknownGrams > 0],
            ] as const
          ).map(([label, consumed, goal, atLeast]) => (
            <div className="stat stat--small" role="listitem" key={label}>
              <span className="stat__label">{label}</span>
              <span className="stat__value">
                {atLeast && <span className="tiny muted">לפחות </span>}
                <span className="num">{macroText(consumed)}</span>
              </span>
              <span className="stat__note num">
                {goal === undefined ? 'ג׳' : `/ ${macroText(goal)}`}
              </span>
            </div>
          ))}
        </div>

        {/* קלוריות: נתון, יעד ורצפה באותה שורה. בלי "נשאר", בלי צבע. */}
        <p className="sub" style={{ margin: 'var(--sp-3) 0 0' }}>
          קלוריות <span className="num">{kcalText(summary.kcal)}</span>
          {target ? (
            <>
              {' '}· יעד <span className="num">{kcalText(target.kcal)}</span>
            </>
          ) : (
            ' · אין יעד מוגדר'
          )}
          {' '}· רצפה <span className="num">{kcalText(KCAL_FLOOR)}</span>
          {overTarget > 0 && (
            <>
              {' '}· מעל היעד ב-<span className="num">{kcalText(overTarget)}</span>
            </>
          )}
        </p>
        {(expectedAddons > 0 || summary.addonCount > 0) &&
          (summary.addonCount === 0 ? (
            <p className="tiny err" style={{ margin: '6px 0 0' }} role="status">
              לא נרשמו תוספים היום
            </p>
          ) : (
            <p className="tiny muted" style={{ margin: '6px 0 0' }} role="status">
              תוספים: <span className="num">{summary.addonCount}</span>
              {expectedAddons > 0 && (
                <>
                  {' '}
                  מתוך <span className="num">{expectedAddons}</span> צפויים
                </>
              )}{' '}
              · <span className="num">{kcalText(summary.addonKcal)}</span> קק"ל
            </p>
          ))}
        {summary.adhocCount > 0 && (
          <p className="tiny adhoc-note" style={{ margin: '6px 0 0' }}>
            מתוכן <span className="num">{kcalText(summary.adhocKcal)}</span> קק"ל בהזנה ידנית (הערכה) ·{' '}
            <span className="num">{summary.adhocCount}</span> {summary.adhocCount === 1 ? 'רישום' : 'רישומים'}
          </p>
        )}
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          סיבים {summary.fiberUnknownGrams > 0 ? 'לפחות ' : ''}
          <span className="num">{macroText(summary.fiber)}</span> ג׳
          {summary.count > 0 && (
            <>
              {' '}
              · <span className="num">{summary.count}</span> רישומים
            </>
          )}
        </p>

        {!editingTarget && (
          <button
            type="button"
            className="btn btn--quiet"
            style={{ marginTop: 'var(--sp-2)', marginInlineStart: 'calc(-1 * var(--sp-2))' }}
            onClick={() => setEditingTarget(true)}
          >
            {target ? 'שנה יעד' : 'הגדר יעד'}
          </button>
        )}
        {editingTarget && (
          <TargetForm
            current={target}
            today={today}
            onCancel={() => setEditingTarget(false)}
            onSave={(t) => {
              void store.update('targets', upsertTarget(db.targets, t));
              setEditingTarget(false);
            }}
          />
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>התפריט שלי</h2>
          <span className="tiny muted">לחיצה = רישום</span>
        </div>
        {menuEmpty ? (
          <p className="small muted" style={{ margin: 0 }}>
            {foodIndex.status === 'ready'
              ? 'ספריית המנות לא נטענה. במסך "נתונים" → "טען את ספריית המנות".'
              : 'טוען מאגר…'}
          </p>
        ) : (
          <div className="menu">
            {menu.map((g) => {
              const open = openGroup === g.group.key;
              return (
                <div className="menu__group" key={g.group.key}>
                  <button
                    type="button"
                    className="menu__head"
                    aria-expanded={open}
                    onClick={() => setOpenGroup(open ? null : g.group.key)}
                  >
                    <span className="grow">{g.group.label}</span>
                    {g.group.key === 'extras' && (
                      <span className="tiny muted">
                        אגוז = <span className="num">{NUT_GRAMS}</span> ג׳
                      </span>
                    )}
                    <span className="tiny muted num">{g.items.length}</span>
                    <span className="muted" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                  </button>
                  {open && (
                    <ul className="menu__items">
                      {g.items.map((r) => (
                        <li key={r.item.slug}>
                          <button type="button" className="menu__btn" onClick={() => logMenuItem(r)}>
                            <span className="grow">
                              {r.item.label}
                              {r.ingredients && (g.group.key === 'lunch' || g.group.key === 'dinner') && (
                                <span className="menu__ingredients">{r.ingredients}</span>
                              )}
                            </span>
                            <span className="muted small">
                              <span className="num">{kcalText(r.kcal)}</span> · <span className="num">{kcalText(r.protein)}</span>ח
                            </span>
                          </button>
                        </li>
                      ))}
                      {g.group.key === 'extras' && nutsToday.length > 0 && (
                        <li className="tiny muted" style={{ padding: 'var(--sp-1) var(--sp-3) var(--sp-2)' }} role="note">
                          כבר נרשם אגוז היום: {nutsToday.map((e) => resolve(e.foodId)?.name ?? e.ref.name).join(', ')}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {undo?.kind === 'added' && (
          <div className="undo" role="status" style={{ marginTop: 'var(--sp-3)' }}>
            <span className="grow">{undo.text}</span>
            <button type="button" className="btn" onClick={restore}>
              בטל
            </button>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>הוספה</h2>
          <span className="tiny muted">
            {foodIndex.status === 'loading' && 'טוען מאגר…'}
            {foodIndex.status === 'error' && <span className="err">מאגר המזון לא נטען</span>}
            {foodIndex.status === 'ready' && (
              <>
                <span className="num">{foodIndex.index.all.length}</span> מזונות
              </>
            )}
          </span>
        </div>
        {adhocOpen ? (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>
              אוכל בחוץ או בלי תווית: הערכה לארוחה שלמה, לא ל-100 ג׳. נרשם כהערכה ומסומן בהיסטוריה.
            </p>
            <div>
              <label htmlFor="adhoc-name">שם</label>
              <input
                id="adhoc-name"
                type="text"
                autoComplete="off"
                placeholder="המבורגר, מסעדה"
                value={adhoc.name}
                onChange={(e) => setAdhoc({ ...adhoc, name: e.target.value })}
              />
            </div>
            <div className="macros">
              {(
                [
                  ['adhoc-kcal', 'קלוריות', 'kcal', ADHOC_MAX_KCAL, true],
                  ['adhoc-protein', 'חלבון ג׳', 'protein', ADHOC_MAX_MACRO, true],
                  ['adhoc-carbs', 'פחמימה ג׳', 'carbs', ADHOC_MAX_MACRO, false],
                  ['adhoc-fat', 'שומן ג׳', 'fat', ADHOC_MAX_MACRO, false],
                ] as const
              ).map(([id, label, key, max, required]) => (
                <div key={id}>
                  <label htmlFor={id}>
                    {label}
                    {!required && <span className="muted"> (לא חובה)</span>}
                  </label>
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={0}
                    max={max}
                    value={adhoc[key]}
                    onChange={(e) => setAdhoc({ ...adhoc, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            {adhocGap !== null && adhocGap > MACRO_GAP_WARN && (
              <p className="notice" style={{ margin: 0 }}>
                המאקרו מסתכם ל-
                <span className="num">{kcalText(4 * (adhocProtein as number) + 4 * (adhocCarbs as number) + 9 * (adhocFat as number))}</span> קק"ל,
                פער של <span className="num">{Math.round(adhocGap * 100)}%</span> מהקלוריות שהוזנו. אפשר לשמור בכל מקרה.
              </p>
            )}
            <div role="group" aria-label="ארוחה">
              <span className="label">ארוחה</span>
              <div className="choice">
                {MEAL_ORDER.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="choice__btn"
                    aria-pressed={meal === m}
                    onClick={() => {
                      setMeal(m);
                      setMealTouched(true);
                    }}
                  >
                    {MEAL_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn btn--primary btn--block" disabled={!adhocValid} onClick={saveAdhoc}>
                שמור הזנה ידנית
              </button>
              <button type="button" className="btn" onClick={() => setAdhocOpen(false)}>
                ביטול
              </button>
            </div>
          </div>
        ) : (
        <div className="stack">
          <div>
            <label htmlFor="food-search">מזון</label>
            <input
              id="food-search"
              ref={searchRef}
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="חיפוש במאגר…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected) setSelected(null);
              }}
            />
            {results.length > 0 && (
              <ul className="results" role="listbox" aria-label="תוצאות חיפוש">
                {results.map((f) => (
                  <li key={f.id} role="option" aria-selected={false}>
                    <button type="button" className="results__btn" onClick={() => pick(f)}>
                      <span className="grow">
                        {f.name}
                        {f.isRecipe && <span className="tiny muted"> · מנה</span>}
                        {f.source === 'custom' && !f.isRecipe && <span className="tiny muted"> · שלי</span>}
                        {f.suspect && <span className="tiny err"> · ערך חשוד במאגר</span>}
                      </span>
                      <span className="num muted small">{kcalText(displayValues(f).kcal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!selected && query.trim() !== '' && results.length === 0 && foodIndex.status === 'ready' && (
              <div className="row row--wrap" style={{ marginTop: 'var(--sp-2)' }}>
                <span className="tiny muted">לא נמצא במאגר.</span>
                <button type="button" className="btn btn--quiet" onClick={() => setEditor({ existing: null, name: query.trim(), mode: 'label' })}>
                  הוסף מהתווית
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setEditor({ existing: null, name: query.trim(), mode: 'recipe' })}>
                  בנה מנה
                </button>
              </div>
            )}
            {selected && (
              <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                <span className="num">{kcalText(displayValues(selected).kcal)}</span> קק"ל ·{' '}
                <span className="num">{macroText(displayValues(selected).protein)}</span> חלבון ·{' '}
                <span className="num">{displayValues(selected).carbs === null ? DASH : macroText(displayValues(selected).carbs!)}</span> פחמימה ·{' '}
                <span className="num">{displayValues(selected).fat === null ? DASH : macroText(displayValues(selected).fat!)}</span> שומן · {displayValues(selected).per}
                {selected.suspect && <span className="err"> · ערך חשוד במאגר</span>}
                {' '}
                <button type="button" className="btn btn--quiet tiny" onClick={clearPick} style={{ minHeight: 0 }}>
                  נקה
                </button>
              </p>
            )}
          </div>

          <div className="grams">
            <label htmlFor="food-grams">גרמים</label>
            <input
              id="food-grams"
              ref={gramsRef}
              type="number"
              inputMode="decimal"
              step={0.1}
              min={MIN_GRAMS}
              max={MAX_GRAMS}
              placeholder="0"
              enterKeyHint="done"
              value={gramsText}
              onChange={(e) => setGramsText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd) add();
              }}
            />
          </div>

          <div role="group" aria-label="ארוחה">
            <span className="label">ארוחה</span>
            <div className="choice">
              {MEAL_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="choice__btn"
                  aria-pressed={meal === m}
                  onClick={() => {
                    setMeal(m);
                    setMealTouched(true);
                  }}
                >
                  {MEAL_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn--primary btn--block" disabled={!canAdd} onClick={add}>
            הוסף
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            style={{ marginInlineStart: 'calc(-1 * var(--sp-2))' }}
            onClick={() => setAdhocOpen(true)}
          >
            הזנה ידנית — אוכל בחוץ, בלי תווית
          </button>
        </div>
        )}
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>מה אכלתי היום</h2>
        {undo?.kind === 'deleted' && (
          <div className="undo" role="status" style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="grow">{undo.text}</span>
            <button type="button" className="btn" onClick={restore}>
              בטל
            </button>
          </div>
        )}
        {groups.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            עדיין לא נרשם דבר היום.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.meal} style={{ marginTop: 'var(--sp-3)' }}>
              <h3 className="sub" style={{ marginBottom: 'var(--sp-1)' }}>
                {MEAL_LABELS[g.meal]}
              </h3>
              <ul className="list">
                {g.entries.map((e) => {
                  const live = resolve(e.foodId);
                  const n = entryNutrition(e, live);
                  return (
                    <li key={e.id} className={n.adhoc ? 'is-adhoc' : undefined}>
                      <span className="grow">
                        {entryName(e, live?.name ?? null)}
                        <span className="tiny muted">
                          {n.adhoc ? (
                            <>
                              {' '}
                              · <span className="adhoc-note">הזנה ידנית · הערכה</span> ·{' '}
                              <span className="num">{macroText(n.protein)}</span> חלבון
                            </>
                          ) : (
                            <>
                          {' '}
                          ·{' '}
                          {editing?.id === e.id ? (
                            <input
                              className="list__grams"
                              type="number"
                              inputMode="decimal"
                              step={0.1}
                              min={MIN_GRAMS}
                              max={MAX_GRAMS}
                              aria-label={`גרמים — ${e.ref.name}`}
                              autoFocus
                              value={editing.text}
                              onChange={(ev) => setEditing({ id: e.id, text: ev.target.value })}
                              onBlur={commitGrams}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter') commitGrams();
                                if (ev.key === 'Escape') setEditing(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="btn btn--quiet tiny"
                              style={{ minHeight: 0, padding: '0 2px' }}
                              aria-label={`שנה גרמים — ${e.ref.name}`}
                              onClick={() => setEditing({ id: e.id, text: String(e.grams) })}
                            >
                              <span className="num">{e.grams}</span> ג׳
                            </button>
                          )}
                            </>
                          )}{' '}
                          · <span className="num">{timeText(e.ts)}</span>
                          {live?.isRecipe && ' · מנה'}
                          {n.live === 'differs' && ' · ההגדרה השתנתה מאז הרישום'}
                          {n.live === 'missing' && !n.adhoc && ' · המזון נמחק'}
                          {live?.suspect && <span className="err"> · ערך חשוד</span>}
                        </span>
                      </span>
                      <span className="num strong">{kcalText(n.kcal)}</span>
                      <button
                        type="button"
                        className="btn btn--quiet"
                        aria-label={`מחק ${e.ref.name}`}
                        onClick={() => del(e)}
                      >
                        מחק
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>מזונות שלי</h2>
          <span className="tiny muted">
            <span className="num">{db.customFoods.length}</span>
          </span>
        </div>
        {db.customFoods.length > 0 && (
          <ul className="list" style={{ marginBottom: 'var(--sp-3)' }}>
            {db.customFoods.map((f) => (
              <li key={f.id}>
                <span className="grow">
                  {f.name}
                  <span className="tiny muted">
                    {f.archived && ' · בארכיון'}
                    {f.recipe ? ' · מנה' : ' · מהתווית'} ·{' '}
                    <span className="num">{kcalText(displayValues(fromCustom(f)).kcal)}</span> קק"ל {displayValues(fromCustom(f)).per}
                    {f.note ? ` · ${f.note}` : ''}
                  </span>
                </span>
                <button type="button" className="btn btn--quiet" aria-label={`ערוך ${f.name}`} onClick={() => setEditor({ existing: f })}>
                  ערוך
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="btn btn--block" onClick={() => setEditor({ existing: null, mode: 'label' })}>
            מזון מהתווית
          </button>
          <button type="button" className="btn btn--block" onClick={() => setEditor({ existing: null, mode: 'recipe' })}>
            מנה ממרכיבים
          </button>
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          מנה: בונים פעם אחת ממרכיבים, שוקלים את הצלחת ומזינים גרמים כמו בכל מזון.
        </p>
      </section>

      <p className="tiny muted" style={{ margin: 0 }}>
        הערכים ל-100 ג׳ מהמאגר הלאומי של משרד הבריאות
        {foodIndex.fetchedAt ? (
          <>
            {' '}
            (נמשך <span className="num">{foodIndex.fetchedAt.slice(0, 10)}</span>)
          </>
        ) : null}
        . קלוריות מהמאגר, לא מחושבות מהמאקרו.
      </p>
    </div>
  );
}

// ---------- טופס יעד ----------

type TargetFormProps = {
  current: NutritionTarget | null;
  today: string;
  onSave: (t: NutritionTarget) => void;
  onCancel: () => void;
};

/**
 * יעד חדש נכנס בתוקף מהיום; היעד הקודם נשאר בהיסטוריה כדי שסיכומים
 * ישנים לא ישתנו.
 */
function TargetForm({ current, today, onSave, onCancel }: TargetFormProps) {
  const [kcal, setKcal] = useState<number | null>(current?.kcal ?? null);
  const [protein, setProtein] = useState<number | null>(current?.protein ?? null);
  const [carbs, setCarbs] = useState<number | null>(current?.carbs ?? null);
  const [fat, setFat] = useState<number | null>(current?.fat ?? null);
  const valid = kcal !== null && kcal >= MIN_TARGET_KCAL && protein !== null && carbs !== null && fat !== null;

  return (
    <div className="stack" style={{ marginTop: 'var(--sp-3)' }}>
      <NumberField label="קלוריות ליום" value={kcal} onChange={setKcal} min={MIN_TARGET_KCAL} max={MAX_TARGET_KCAL} />
      <div className="macros">
        <NumberField label="חלבון" suffix="ג׳" value={protein} onChange={setProtein} min={0} max={MAX_TARGET_PROTEIN} />
        <NumberField label="פחמימה" suffix="ג׳" value={carbs} onChange={setCarbs} min={0} max={MAX_TARGET_CARBS} />
        <NumberField label="שומן" suffix="ג׳" value={fat} onChange={setFat} min={0} max={MAX_TARGET_FAT} />
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!valid}
          onClick={() => {
            if (!valid) return;
            onSave({ from: today, kcal, protein, carbs, fat });
          }}
        >
          {current ? 'עדכן יעד מהיום' : 'שמור יעד'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          ביטול
        </button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        קלוריות <span className="num">{MIN_TARGET_KCAL}</span>–<span className="num">{MAX_TARGET_KCAL}</span>.
        יעד קודם נשמר בהיסטוריה — סיכומים של ימים קודמים לא משתנים.
      </p>
    </div>
  );
}
