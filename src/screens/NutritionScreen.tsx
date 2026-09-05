import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import type { CustomFood, FoodEntry, MealType, NutritionTarget } from '../types';
import { useFoodIndex } from '../useFoodIndex';
import NumberField from '../components/NumberField';
import CustomFoodEditor, { type EditorMode } from './CustomFoodEditor';
import { MEAL_HOURS } from '../data/config';
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
import { fromCustom, removeCustomFood, upsertCustomFood, type Food } from '../lib/nutrition/foods';
import { resolveFood, searchFoods } from '../lib/nutrition/index';
import {
  defaultMeal,
  entriesOn,
  groupByMeal,
  MEAL_LABELS,
  MEAL_ORDER,
  newEntry,
  removeEntry,
  upsertEntry,
} from '../lib/nutrition/entries';
import { targetFor, upsertTarget } from '../lib/nutrition/targets';
import { daySummary, entryNutrition, remaining } from '../lib/nutrition/calc';
import { kcalText, macroText } from '../lib/nutrition/display';

const SEARCH_LIMIT = 20;
const UNDO_MS = 5000;

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
    () => daySummary(todayEntries, today, (id) => resolveFood(foodIndex.index, id)),
    [todayEntries, today, foodIndex.index],
  );
  const target = useMemo(() => targetFor(db.targets, today), [db.targets, today]);
  const left = remaining(target, summary);
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

  // ---------- מחיקה עם undo ----------
  const [undo, setUndo] = useState<FoodEntry | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  const armUndo = (entry: FoodEntry | null) => {
    if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current);
    setUndo(entry);
    if (entry) undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
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
    armUndo(entry);
  };

  const restore = () => {
    if (!undo) return;
    void store.update('entries', upsertEntry(db.entries, undo));
    armUndo(null);
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
          היום · <span className="num">{formatDM(today)}</span>
          {target ? ' · נשאר' : ' · נצרך'}
        </p>
        <p className={`hero${summary.count === 0 && !target ? ' hero--empty' : ''}`} style={{ margin: 0 }}>
          <span className="num">{target && left ? kcalText(left.kcal) : kcalText(summary.kcal)}</span>
        </p>
        <p className="sub" style={{ margin: '6px 0 0' }}>
          {target && left ? (
            <>
              נצרך <span className="num">{kcalText(summary.kcal)}</span> מתוך{' '}
              <span className="num">{kcalText(target.kcal)}</span>
              {left.kcal < 0 ? ' · חריגה' : ''}
            </>
          ) : (
            <>קק"ל נצרכו · אין יעד מוגדר</>
          )}
        </p>

        <div className="macros" style={{ marginTop: 'var(--sp-3)' }} role="list">
          {(
            [
              ['חלבון', summary.protein, target?.protein],
              ['פחמימה', summary.carbs, target?.carbs],
              ['שומן', summary.fat, target?.fat],
            ] as const
          ).map(([label, consumed, goal]) => (
            <div className="stat" role="listitem" key={label}>
              <span className="stat__label">{label}</span>
              <span className="stat__value num">{macroText(consumed)}</span>
              <span className="stat__note num">
                {goal === undefined ? DASH : `/ ${macroText(goal)}`}
              </span>
            </div>
          ))}
        </div>
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
                      <span className="num muted small">{kcalText(f.kcal)}</span>
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
                <span className="num">{kcalText(selected.kcal)}</span> קק"ל ·{' '}
                <span className="num">{macroText(selected.protein)}</span> חלבון ·{' '}
                <span className="num">{selected.carbs === null ? DASH : macroText(selected.carbs)}</span> פחמימה ·{' '}
                <span className="num">{macroText(selected.fat)}</span> שומן · ל-100 ג׳
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
        </div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>מה אכלתי היום</h2>
        {undo && (
          <div className="undo" role="status" style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="grow">
              נמחק: {undo.ref.name} · <span className="num">{undo.grams}</span> ג׳
            </span>
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
                    <li key={e.id}>
                      <span className="grow">
                        {live ? live.name : e.ref.name}
                        <span className="tiny muted">
                          {' '}
                          · <span className="num">{e.grams}</span> ג׳ ·{' '}
                          <span className="num">{timeText(e.ts)}</span>
                          {live?.isRecipe && ' · מנה'}
                          {n.fromRef && ' · מהרישום'}
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
                    {f.recipe ? ' · מנה' : ' · מהתווית'} · <span className="num">{kcalText(f.kcal)}</span> קק"ל ל-100 ג׳
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
