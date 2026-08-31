import { useMemo, useState } from 'react';
import type { ScreenProps } from './types';
import type { WeeklyCheckin } from '../types';
import { NOTE_MAX } from '../types';
import { emptyCheckin, getCheckin, isFilled, upsertCheckin } from '../lib/checkins';
import { backupJson, buildChatReport } from '../lib/exportText';
import { formatDMY, isSaturday, weekEnd, weekNumber, weekStart } from '../lib/date';
import { programStartWeek } from '../lib/db';
import WeekNav from '../components/WeekNav';
import Choice from '../components/Choice';
import Stepper from '../components/Stepper';
import CopyBlock from '../components/CopyBlock';

const SCALE_1_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DAYS_0_7 = [0, 1, 2, 3, 4, 5, 6, 7];

export default function CheckinScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [week, setWeek] = useState(() => weekStart(today));

  const saved = getCheckin(db.checkins, week);
  const value: WeeklyCheckin = saved ?? emptyCheckin(week);
  const start = useMemo(() => programStartWeek(db), [db]);
  const report = useMemo(() => buildChatReport(db, week, today), [db, week, today]);
  const json = useMemo(() => backupJson(db, new Date().toISOString()), [db]);

  const patch = (next: Partial<WeeklyCheckin>) => {
    void store.update('checkins', upsertCheckin(db.checkins, { ...value, ...next }));
  };

  return (
    <div className="stack--loose">
      <section className="section section--first">
        <WeekNav
          week={week}
          onChange={setWeek}
          today={today}
          weekNo={start ? weekNumber(start, week) : null}
        />
        <p className="sub" style={{ margin: 'var(--sp-4) 0 0' }}>
          צ'ק-אין לשבת <span className="num">{formatDMY(weekEnd(week))}</span>
          {isSaturday(today) && week === weekStart(today) ? ' · היום' : ''}
          {isFilled(saved) ? ' · מולא' : ' · לא מולא'}
        </p>
      </section>

      <section className="section">
        <div className="stack--loose">
          <Choice
            label="היצמדות"
            scale
            options={SCALE_1_10}
            value={value.adherence}
            onChange={(adherence) => patch({ adherence })}
          />
          <Choice
            label="רעב"
            scale
            options={SCALE_1_10}
            value={value.hunger}
            onChange={(hunger) => patch({ hunger })}
          />
          <Choice
            label="אנרגיה"
            scale
            options={SCALE_1_10}
            value={value.energy}
            onChange={(energy) => patch({ energy })}
          />
          <Stepper
            label="שינה — ממוצע שעות בלילה"
            value={value.sleepHours}
            onChange={(sleepHours) => patch({ sleepHours })}
            step={0.5}
            min={0}
            max={14}
            decimals={1}
            placeholder="0.0"
          />
          <Choice
            label="ימי נשנוש בלתי מתוכנן"
            scale
            options={DAYS_0_7}
            value={value.unplannedSnackDays}
            onChange={(unplannedSnackDays) => patch({ unplannedSnackDays })}
          />

          <div>
            <label htmlFor="note">הערה קצרה</label>
            <textarea
              id="note"
              value={value.note}
              maxLength={NOTE_MAX}
              onChange={(e) => patch({ note: e.target.value.slice(0, NOTE_MAX) })}
            />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              <span className="num">
                {value.note.length}/{NOTE_MAX}
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>ייצוא</h2>
          <span className="tiny muted">
            <span className="num">{report.length}</span> תווים
          </span>
        </div>
        <div className="stack">
          <CopyBlock text={report} label="העתק לצ'אט" boxLabel="דוח הצ'ק-אין" primary />
          <div>
            <CopyBlock text={json} label="העתק JSON מלא" boxLabel="גיבוי JSON" />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              לגיבוי, לא לצ'אט.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
