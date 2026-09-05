import { useId, useMemo, useRef, useState } from 'react';
import type { CustomFood, FoodId } from '../types';
import ConfirmButton from '../components/ConfirmButton';
import { CATEGORY_LABELS, type FoodCategory } from '../lib/nutrition/foodDb';
import { makeCustomFoodId, type Food } from '../lib/nutrition/foods';
import { resolveFood, searchFoods, type FoodIndex } from '../lib/nutrition/index';
import {
  buildRecipeFood,
  concentration,
  recipePer100,
  recipeProblems,
  recipeTotals,
  type RecipeItem,
} from '../lib/nutrition/recipe';
import { kcalText, macroText } from '../lib/nutrition/display';
import { DASH } from '../lib/format';
import { FOOD_NOTE_MAX } from '../types';
import {
  FOOD_NAME_MAX,
  MAX_GRAMS,
  MAX_KCAL_PER_100G,
  MAX_MACRO_PER_100G,
  MIN_GRAMS,
} from '../lib/schema';

export type EditorMode = 'label' | 'recipe';

type Props = {
  index: FoodIndex;
  /** מזון קיים לעריכה, או null ליצירה. */
  existing: CustomFood | null;
  initialName?: string | undefined;
  initialMode?: EditorMode | undefined;
  onSave: (food: CustomFood) => void;
  onDelete?: (() => void) | undefined;
  onCancel: () => void;
};

const SEARCH_LIMIT = 12;

function unique(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseDecimal(text: string, min: number, max: number): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function toText(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(Math.round(n * 100) / 100);
}

/** שדה עשרוני קטן, בלי כפתורים, מקלדת עשרונית. ריק = null. */
function DecimalField({
  label,
  value,
  onChange,
  min,
  max,
  optional,
  big,
  inputRef,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  min: number;
  max: number;
  optional?: boolean | undefined;
  big?: boolean | undefined;
  inputRef?: React.RefObject<HTMLInputElement> | undefined;
  onEnter?: (() => void) | undefined;
}) {
  const id = useId();
  const parsed = parseDecimal(value, min, max);
  const invalid = value.trim() !== '' && parsed === null;
  return (
    <div className={big ? 'grams' : undefined}>
      <label htmlFor={id} className="tiny">
        {label}
        {optional ? <span className="muted"> (לא חובה)</span> : ''}
      </label>
      <input
        id={id}
        ref={inputRef}
        type="number"
        inputMode="decimal"
        step={0.1}
        min={min}
        max={max}
        value={value}
        placeholder={optional ? DASH : '0'}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
      />
      {invalid && (
        <p className="tiny err" style={{ margin: '2px 0 0' }}>
          טווח <span className="num">{min}</span>–<span className="num">{max}</span>
        </p>
      )}
    </div>
  );
}

/**
 * הוספה ועריכה של מזון שלי: מהתווית (ערכים ל-100 ג׳), או מנה ממרכיבים
 * שהערכים שלה מחושבים. מנה נשמרת עם המתכון כדי לערוך אותה אחר כך; רישומים
 * ישנים לא משתנים כי ה-ref שלהם הוקפא בזמן הרישום.
 */
export default function CustomFoodEditor({
  index,
  existing,
  initialName,
  initialMode,
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const [mode] = useState<EditorMode>(existing ? (existing.recipe ? 'recipe' : 'label') : (initialMode ?? 'label'));
  const [name, setName] = useState(existing?.name ?? initialName ?? '');
  const [cat, setCat] = useState<number | null>(existing?.cat ?? null);
  const [note, setNote] = useState(existing?.note ?? '');

  // ---------- מהתווית ----------
  const [kcal, setKcal] = useState(toText(existing?.recipe ? null : existing?.kcal));
  const [protein, setProtein] = useState(toText(existing?.recipe ? null : existing?.protein));
  const [carbs, setCarbs] = useState(toText(existing?.recipe ? null : existing?.carbs));
  const [fat, setFat] = useState(toText(existing?.recipe ? null : existing?.fat));
  const [fiber, setFiber] = useState(toText(existing?.recipe ? null : existing?.fiber));

  // ---------- מנה ----------
  const [items, setItems] = useState<RecipeItem[]>(existing?.recipe?.items.map((i) => ({ ...i })) ?? []);
  const [finalText, setFinalText] = useState(existing?.recipe ? String(existing.recipe.finalGrams) : '');
  const [finalTouched, setFinalTouched] = useState(existing?.recipe !== undefined);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Food | null>(null);
  const [pendingGrams, setPendingGrams] = useState('');
  const pendingRef = useRef<HTMLInputElement>(null!);
  const searchRef = useRef<HTMLInputElement>(null);

  const resolve = (id: FoodId) => resolveFood(index, id);
  const results = useMemo(
    () => (pending ? [] : searchFoods(index, query, SEARCH_LIMIT)),
    [index, query, pending],
  );
  const totals = useMemo(() => recipeTotals(items, resolve), [items, index]); 
  const finalGrams = finalTouched ? parseDecimal(finalText, MIN_GRAMS, MAX_GRAMS * 10) : totals.sumGrams;
  const finalDisplay = finalTouched ? finalText : totals.sumGrams > 0 ? toText(totals.sumGrams) : '';
  const problems = useMemo(() => recipeProblems(items, finalGrams, resolve), [items, finalGrams, index]); 
  const preview = finalGrams !== null && finalGrams > 0 && items.length > 0 ? recipePer100(totals, finalGrams) : null;
  const ratio = finalGrams !== null && finalGrams > 0 ? concentration(totals.sumGrams, finalGrams) : 1;

  const addItem = () => {
    const grams = parseDecimal(pendingGrams, MIN_GRAMS, MAX_GRAMS);
    if (!pending || grams === null) return;
    setItems((list) => {
      const i = list.findIndex((x) => x.foodId === pending.id);
      if (i === -1) return [...list, { foodId: pending.id, grams }];
      return list.map((x, j) => (j === i ? { foodId: x.foodId, grams: x.grams + grams } : x));
    });
    setPending(null);
    setPendingGrams('');
    setQuery('');
    searchRef.current?.focus();
  };

  // ---------- שמירה ----------
  const cleanName = name.split(/\s+/).filter((w) => w !== '').join(' ').slice(0, FOOD_NAME_MAX);
  const labelValues =
    mode === 'label'
      ? {
          kcal: parseDecimal(kcal, 0, MAX_KCAL_PER_100G),
          protein: parseDecimal(protein, 0, MAX_MACRO_PER_100G),
          carbs: carbs.trim() === '' ? null : parseDecimal(carbs, 0, MAX_MACRO_PER_100G),
          fat: fat.trim() === '' ? null : parseDecimal(fat, 0, MAX_MACRO_PER_100G),
          fiber: fiber.trim() === '' ? null : parseDecimal(fiber, 0, MAX_MACRO_PER_100G),
        }
      : null;
  const labelValid =
    labelValues !== null &&
    labelValues.kcal !== null &&
    labelValues.protein !== null &&
    (carbs.trim() === '' || labelValues.carbs !== null) &&
    (fat.trim() === '' || labelValues.fat !== null) &&
    (fiber.trim() === '' || labelValues.fiber !== null);
  const canSave = cleanName !== '' && (mode === 'label' ? labelValid : problems.length === 0);

  const save = () => {
    if (!canSave) return;
    const base = {
      id: existing?.id ?? makeCustomFoodId(unique()),
      name: cleanName,
      cat,
      portions: existing?.portions ?? [],
      barcode: existing?.barcode ?? null,
      ...(note.trim() === '' ? {} : { note: note.trim().slice(0, FOOD_NOTE_MAX) }),
    };
    if (mode === 'label' && labelValues && labelValid) {
      onSave({
        ...base,
        kcal: labelValues.kcal!,
        protein: labelValues.protein!,
        carbs: labelValues.carbs,
        fat: labelValues.fat,
        fiber: labelValues.fiber,
      });
    } else if (mode === 'recipe' && finalGrams !== null) {
      onSave(buildRecipeFood(base, items, finalGrams, resolve));
    }
  };

  const nameId = useId();
  const catId = useId();
  const noteId = useId();

  return (
    <div className="stack--loose">
      <section className="section section--first">
        <div className="section__head">
          <h2>
            {existing ? 'עריכת ' : ''}
            {mode === 'recipe' ? 'מנה ממרכיבים' : 'מזון מהתווית'}
          </h2>
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            ביטול
          </button>
        </div>
        <div className="stack">
          <div>
            <label htmlFor={nameId}>שם</label>
            <input
              id={nameId}
              type="text"
              value={name}
              maxLength={FOOD_NAME_MAX}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={catId}>
              קטגוריה <span className="muted">(לא חובה)</span>
            </label>
            <select id={catId} value={cat ?? ''} onChange={(e) => setCat(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">ללא</option>
              {(Object.keys(CATEGORY_LABELS).map(Number) as FoodCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={noteId}>
              הערה <span className="muted">(לא חובה)</span>
            </label>
            <input
              id={noteId}
              type="text"
              value={note}
              maxLength={FOOD_NOTE_MAX}
              autoComplete="off"
              placeholder="מקור הערכים, מה טרם אומת…"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </section>

      {mode === 'label' && (
        <section className="section">
          <div className="section__head">
            <h2>ערכים ל-100 ג׳</h2>
            <span className="tiny muted">מהתווית, כמו שהם</span>
          </div>
          <div className="stack">
            <DecimalField label="קלוריות" value={kcal} onChange={setKcal} min={0} max={MAX_KCAL_PER_100G} big />
            <div className="macros">
              <DecimalField label="חלבון" value={protein} onChange={setProtein} min={0} max={MAX_MACRO_PER_100G} />
              <DecimalField label="פחמימה" value={carbs} onChange={setCarbs} min={0} max={MAX_MACRO_PER_100G} optional />
              <DecimalField label="שומן" value={fat} onChange={setFat} min={0} max={MAX_MACRO_PER_100G} optional />
            </div>
            <DecimalField label="סיבים" value={fiber} onChange={setFiber} min={0} max={MAX_MACRO_PER_100G} optional />
            <p className="tiny muted" style={{ margin: 0 }}>
              פחמימה, שומן וסיבים שלא בתווית נשארים ריקים ומוצגים כמקף — לא כאפס.
              ערכי יחידה בלי משקל אריזה: הזן אותם כ"ל-1 ג'" והזן 1 ברישום — עד שתשקול.
            </p>
          </div>
        </section>
      )}

      {mode === 'recipe' && (
        <>
          <section className="section">
            <div className="section__head">
              <h2>מרכיבים</h2>
              <span className="tiny muted">
                <span className="num">{items.length}</span> · סה"כ <span className="num">{toText(totals.sumGrams)}</span> ג׳
              </span>
            </div>
            {items.length > 0 && (
              <ul className="list" style={{ marginBottom: 'var(--sp-3)' }}>
                {items.map((i) => {
                  const f = resolve(i.foodId);
                  return (
                    <li key={i.foodId}>
                      <span className="grow">
                        {f ? f.name : <span className="err">מרכיב חסר</span>}
                        {f?.isRecipe && <span className="tiny err"> · מנה — לא ניתן לקנן</span>}
                        <span className="tiny muted">
                          {' '}
                          · <span className="num">{i.grams}</span> ג׳
                          {f && (
                            <>
                              {' '}
                              · <span className="num">{kcalText((f.kcal * i.grams) / 100)}</span> קק"ל
                            </>
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn--quiet"
                        aria-label={`הסר ${f?.name ?? i.foodId}`}
                        onClick={() => setItems((list) => list.filter((x) => x.foodId !== i.foodId))}
                      >
                        הסר
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="stack">
              <div>
                <label htmlFor="ing-search">הוסף מרכיב</label>
                <input
                  id="ing-search"
                  ref={searchRef}
                  type="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="חיפוש במאגר ובמזונות שלי…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (pending) setPending(null);
                  }}
                />
                {results.length > 0 && (
                  <ul className="results" role="listbox" aria-label="תוצאות חיפוש">
                    {results.map((f) => (
                      <li key={f.id} role="option" aria-selected={false}>
                        <button
                          type="button"
                          className="results__btn"
                          disabled={f.isRecipe}
                          onClick={() => {
                            setPending(f);
                            setQuery(f.name);
                            pendingRef.current?.focus();
                          }}
                        >
                          <span className="grow">
                            {f.name}
                            {f.source === 'custom' && !f.isRecipe && <span className="tiny muted"> · שלי</span>}
                            {f.isRecipe && <span className="tiny muted"> · מנה — לא ניתן לקנן</span>}
                          </span>
                          <span className="num muted small">{kcalText(f.kcal)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="row">
                <div className="grow">
                  <DecimalField
                    label={pending ? `גרמים של ${pending.name}` : 'גרמים'}
                    value={pendingGrams}
                    onChange={setPendingGrams}
                    min={MIN_GRAMS}
                    max={MAX_GRAMS}
                    big
                    inputRef={pendingRef}
                    onEnter={addItem}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ alignSelf: 'flex-end', minHeight: 52 }}
                  disabled={!pending || parseDecimal(pendingGrams, MIN_GRAMS, MAX_GRAMS) === null}
                  onClick={addItem}
                >
                  הוסף מרכיב
                </button>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h2>משקל המנה המוגמרת</h2>
              <span className="tiny muted">אחרי בישול, על המשקל</span>
            </div>
            <div className="stack">
              <DecimalField
                label="גרמים"
                value={finalDisplay}
                onChange={(t) => {
                  setFinalTouched(true);
                  setFinalText(t);
                }}
                min={MIN_GRAMS}
                max={MAX_GRAMS * 10}
                big
              />
              {finalTouched && totals.sumGrams > 0 && (
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => {
                    setFinalTouched(false);
                    setFinalText('');
                  }}
                >
                  חזרה לסכום המרכיבים (<span className="num">{toText(totals.sumGrams)}</span>)
                </button>
              )}
              {finalGrams !== null && finalGrams > 0 && totals.sumGrams > 0 && (
                <p className="small" style={{ margin: 0 }}>
                  {ratio > 1.001 ? (
                    <>
                      ריכוז <span className="num">×{ratio.toFixed(2)}</span> — המנה איבדה{' '}
                      <span className="num">{toText(totals.sumGrams - finalGrams)}</span> ג׳ במהלך ההכנה.
                    </>
                  ) : ratio < 0.999 ? (
                    <span className="err">
                      המשקל הסופי גדול מסכום המרכיבים ב-
                      <span className="num">{toText(finalGrams - totals.sumGrams)}</span> ג׳. נכון אם הוספת מים; אחרת בדוק.
                    </span>
                  ) : (
                    <span className="muted">בלי איבוד משקל — כמו בסלט קר.</span>
                  )}
                </p>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h2>ערכים ל-100 ג׳ של המנה</h2>
              <span className="tiny muted">מחושב</span>
            </div>
            {preview ? (
              <div className="stats" role="list">
                <div className="stat" role="listitem">
                  <span className="stat__label">קלוריות</span>
                  <span className="stat__value num">{kcalText(preview.kcal)}</span>
                </div>
                <div className="stat" role="listitem">
                  <span className="stat__label">חלבון</span>
                  <span className="stat__value num">{macroText(preview.protein)}</span>
                </div>
                <div className="stat" role="listitem">
                  <span className="stat__label">פחמימה</span>
                  <span className="stat__value num">{preview.carbs === null ? DASH : macroText(preview.carbs)}</span>
                  {preview.carbs === null && <span className="stat__note">לא ידוע במרכיב</span>}
                </div>
                <div className="stat" role="listitem">
                  <span className="stat__label">שומן</span>
                  <span className="stat__value num">{preview.fat === null ? DASH : macroText(preview.fat)}</span>
                  {preview.fat === null && <span className="stat__note">לא ידוע במרכיב</span>}
                </div>
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                הוסף מרכיבים כדי לראות את הערכים.
              </p>
            )}
            {preview && (
              <p className="tiny muted" style={{ margin: '6px 0 0' }}>
                סיבים <span className="num">{preview.fiber === null ? DASH : macroText(preview.fiber)}</span> ג׳
                {preview.fiber === null ? ' · לא ידוע במרכיב' : ''}
                {' · '}כל המנה <span className="num">{kcalText(totals.kcal)}</span> קק"ל
              </p>
            )}
            {problems.some((p) => p.kind === 'nested') && (
              <p className="small err" style={{ margin: '6px 0 0' }}>
                מנה בתוך מנה לא נתמכת. הסר את המנה מהמרכיבים.
              </p>
            )}
            {problems.some((p) => p.kind === 'missing') && (
              <p className="small err" style={{ margin: '6px 0 0' }}>
                מרכיב שלא נמצא במאגר ולא במזונות שלי. הסר אותו.
              </p>
            )}
          </section>
        </>
      )}

      <section className="section">
        <div className="stack">
          <button type="button" className="btn btn--primary btn--block" disabled={!canSave} onClick={save}>
            {existing ? 'שמור שינויים' : mode === 'recipe' ? 'שמור מנה' : 'שמור מזון'}
          </button>
          {existing && (
            <p className="tiny muted" style={{ margin: 0 }}>
              רישומים קודמים של המזון הזה לא משתנים — הערכים שלהם הוקפאו בזמן הרישום.
            </p>
          )}
          {existing && onDelete && (
            <ConfirmButton
              className="btn btn--danger btn--block"
              label="מחק מזון"
              confirmLabel="אישור מחיקה — רישומים קודמים נשארים"
              onConfirm={onDelete}
            />
          )}
        </div>
      </section>
    </div>
  );
}
