import { useState } from 'react';
import type { NutritionTarget } from '../types';
import NumberField from './NumberField';
import { MAX_TARGET_CARBS, MAX_TARGET_FAT, MAX_TARGET_KCAL, MAX_TARGET_PROTEIN, MIN_TARGET_KCAL } from '../lib/schema';

type Props = {
  current: NutritionTarget | null;
  today: string;
  onSave: (t: NutritionTarget) => void;
  onCancel: () => void;
};

/**
 * טופס יעד יומי (שלב 3: עבר ממסך התזונה למסך הנתונים). יעד חדש נכנס
 * בתוקף מהיום; היעד הקודם נשאר בהיסטוריה כדי שסיכומים ישנים לא ישתנו.
 */
export default function TargetForm({ current, today, onSave, onCancel }: Props) {
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
