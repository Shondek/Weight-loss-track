/**
 * חלונית הכמות (שלב 4): חלונית אחת לכל מקום שבו בוחרים כמות — מועדפים,
 * אחרונים, חיפוש ועריכת רישום. שם המזון, מספר גדול עם −/+ של 56px שהוא גם
 * שדה הקלדה, מעבר גרמים⇄יחידה כשיש למזון יחידה, צ'יפים של כמויות מהנתונים
 * הקיימים (מה שנרשם לאחרונה, יחידות המידה של המזון), שורת חלבון וקלוריות
 * לכמות, הפעולה הראשית במבטא וצ'יפי הארוחה.
 *
 * הערך שיוצא תמיד בגרמים (`FoodEntry.grams`) — התרגום ליחידה הוא תצוגה
 * וקלט בלבד, דרך lib/nutrition/portions.ts, בדיוק כמו בקרת הכמות הקודמת.
 * הרכיב לא נוגע באחסון: ההורה מחליט מה לעשות עם הגרמים.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { FoodRef, MealType } from '../types';
import { MAX_GRAMS, MIN_GRAMS } from '../lib/schema';
import { MEAL_LABELS, MEAL_ORDER } from '../lib/nutrition/entries';
import { kcalText } from '../lib/nutrition/display';
import { gramsFor, qtyFor, type UnitSpec } from '../lib/nutrition/portions';
import { Button, ChipSelect, Icon, Num, QtyStepper, Sheet } from '../ui';
import { Star, Trash2 } from '../ui/icons';

/** צ'יפ כמות: גרמים + הכיתוב שלו. מגיע מהנתונים הקיימים — לא ממציאים מנות. */
export type QtyPreset = { grams: number; label: string };

type Props = {
  title: string;
  /** שורה שקטה מתחת לשם: תכולת מנה, הערה, "ההגדרה השתנתה". */
  note?: ReactNode;
  /** ערכי המקור ל-100 ג׳ (ה-ref שנרשם, או המזון החי) — לשורת החלבון והקלוריות. */
  per100: Pick<FoodRef, 'kcal' | 'protein'>;
  /** יחידת הקלט של המזון (`unitFor`). */
  unit: UnitSpec;
  grams: number;
  onGrams: (grams: number) => void;
  presets: readonly QtyPreset[];
  /**
   * רישום ידני (הערכה): אין כמות — רק הערכים, הארוחה והפעולה. הערכים
   * ב-`per100` הם ליחידה אחת (×100), כמו ב-`newAdhocEntry`.
   */
  adhoc?: boolean | undefined;
  /** הארוחה הנבחרת וצ'יפים לשינוי. בלי `onMeal` הצ'יפים לא מוצגים. */
  meal?: MealType | undefined;
  onMeal?: ((meal: MealType) => void) | undefined;
  primaryLabel: string;
  onPrimary: () => void;
  /** כוכב: סימון/הסרה של מועדף (רק למזון מהמאגר או שלי). */
  favorite?: { on: boolean; toggle: () => void } | undefined;
  /** מחיקת הרישום (עריכה בלבד). */
  onDelete?: (() => void) | undefined;
  onClose: () => void;
};

/** ערכים לכמות: ל-100 ג' × גרמים / 100 — אותה נוסחה כמו entryNutrition. */
function scaled(ref: Pick<FoodRef, 'kcal' | 'protein'>, grams: number): { kcal: number; protein: number } {
  return { kcal: (ref.kcal * grams) / 100, protein: (ref.protein * grams) / 100 };
}

/** האם הגרמים נופלים בדיוק על קפיצה של היחידה (אחרת מתחילים במצב גרמים). */
function onUnitGrid(unit: UnitSpec, grams: number): boolean {
  if (unit.kind === 'grams') return false;
  return Math.abs(gramsFor(unit, qtyFor(unit, grams)) - grams) < 0.05;
}

const GRAMS_STEP = 10;

export default function QtySheet({ title, note, per100, unit, grams, onGrams, presets, adhoc, meal, onMeal, primaryLabel, onPrimary, favorite, onDelete, onClose }: Props) {
  const startInGrams = () => unit.kind === 'grams' || (unit.kind !== 'unit' && !onUnitGrid(unit, grams));
  const [gramsMode, setGramsMode] = useState(startInGrams);
  /**
   * היחידה יכולה להשתנות אחרי הרינדור הראשון — מאגר המזון נטען אחרי המסך,
   * ועד אז כל מזון נפתר ל"גרמים". כשהיחידה מתחלפת, מצב הגרמים נקבע מחדש.
   */
  const unitKey = unit.kind === 'grams' || unit.kind === 'unit' ? unit.kind : `${unit.kind}:${unit.label}:${unit.g}`;
  useEffect(() => {
    setGramsMode(startInGrams());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitKey]);

  const v = adhoc ? scaled(per100, 1) : scaled(per100, grams);
  const canToggle = unit.kind === 'serving' || unit.kind === 'portion';

  const pickPreset = (p: QtyPreset) => {
    onGrams(p.grams);
    if (canToggle) setGramsMode(!onUnitGrid(unit, p.grams));
  };

  let stepper: ReactNode = null;
  if (!adhoc) {
    if (unit.kind === 'unit') {
      stepper = (
        <QtyStepper
          label={`כמות — ${title}`}
          value={Math.max(unit.min, Math.min(unit.max, Math.round(grams)))}
          onChange={(n) => onGrams(n)}
          step={unit.step}
          min={unit.min}
          max={unit.max}
          decimals={0}
          unit="יח׳"
          inputMode="numeric"
        />
      );
    } else if (unit.kind === 'grams' || gramsMode) {
      stepper = (
        <QtyStepper
          label={`גרמים — ${title}`}
          value={grams}
          onChange={onGrams}
          step={GRAMS_STEP}
          min={MIN_GRAMS}
          max={MAX_GRAMS}
          decimals={1}
          unit="ג׳"
          inputMode="decimal"
        />
      );
    } else {
      stepper = (
        <QtyStepper
          label={`${unit.label} — ${title}`}
          value={Math.max(unit.min, Math.min(unit.max, qtyFor(unit, grams)))}
          onChange={(q) => onGrams(gramsFor(unit, q))}
          step={unit.step}
          min={unit.min}
          max={unit.max}
          decimals={1}
          unit={unit.label}
          inputMode="decimal"
        />
      );
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {note && <p className="sheet__note tiny muted">{note}</p>}
      {stepper}
      {canToggle && (
        <div className="chips chips--center" role="group" aria-label="יחידת הכמות">
          <button
            type="button"
            className="chipbtn"
            aria-pressed={!gramsMode}
            onClick={() => {
              if (!gramsMode) return;
              setGramsMode(false);
              onGrams(gramsFor(unit, Math.max(unit.min, qtyFor(unit, grams))));
            }}
          >
            {unit.label}
          </button>
          <button type="button" className="chipbtn" aria-pressed={gramsMode} onClick={() => setGramsMode(true)}>
            גרמים
          </button>
        </div>
      )}
      {!adhoc && presets.length > 0 && (
        <div className="chips chips--center" role="group" aria-label="כמויות נפוצות">
          {presets.map((p) => (
            <button key={p.grams} type="button" className="chipbtn" aria-pressed={Math.abs(p.grams - grams) < 0.05} onClick={() => pickPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <p className="sheet__calc">
        {adhoc && <span className="muted">הערכה · </span>}
        <Num>{kcalText(v.kcal)}</Num> קק״ל · <Num>{kcalText(v.protein)}</Num> חלבון
      </p>
      {meal && onMeal && (
        <ChipSelect<MealType>
          label="ארוחה"
          options={MEAL_ORDER.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
          value={meal}
          onChange={(m) => {
            if (m) onMeal(m);
          }}
          clearable={false}
        />
      )}
      <Button variant="accent" block tall onClick={onPrimary}>
        {primaryLabel}
      </Button>
      {(favorite || onDelete) && (
        <div className="sheet__row">
          {favorite && (
            <Button variant="ghost" aria-pressed={favorite.on} onClick={favorite.toggle} className={favorite.on ? 'is-on' : undefined}>
              <Icon icon={Star} size={18} className={favorite.on ? 'ic--filled' : undefined} />
              {favorite.on ? 'במועדפים · הסר' : 'הוסף למועדפים'}
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" className="err" onClick={onDelete}>
              <Icon icon={Trash2} size={18} />
              מחק
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
