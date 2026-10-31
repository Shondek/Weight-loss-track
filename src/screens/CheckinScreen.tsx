import { useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import { useWeek } from '../useWeek';
import type { WeeklyCheckin } from '../types';
import { NOTE_MAX } from '../types';
import { emptyCheckin, getCheckin, isFilled, upsertCheckin, withHomeLunchDays } from '../lib/checkins';
import { HOME_LUNCH_MAX } from '../data/config';
import { backupJson, buildChatReport } from '../lib/exportText';
import { buildWeekSummary } from '../lib/weekSummary';
import { buildWeeklySummary, defaultSummaryWeek } from '../lib/weeklySummary';
import { downloadText } from '../platform/download';
import { toLocalISO } from '../lib/date';
import { verifyBackup } from '../lib/backup';
import { activeProfile } from '../data/profile';
import BackupSave from '../components/BackupSave';
import { formatDMY, isSaturday, weekEnd, weekNumber, weekStart } from '../lib/date';
import { programStartWeek } from '../lib/db';
import WeekNav from '../components/WeekNav';
import CopyBlock from '../components/CopyBlock';
import WeekSummary from '../components/WeekSummary';
import { Button, ChipSelect, Num, ScreenHeader, SectionHeader, StatusChip, Stepper, Surface, useToast, type ChipOption } from '../ui';
import { CircleCheck, Circle, FileText } from '../ui/icons';

/** אותם סולמות, אותם ערכים שנשמרים (1–10, 0–7, 0–5). */
const SCALE_1_10: readonly ChipOption<number>[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ value: v, label: v }));
const DAYS_0_7: readonly ChipOption<number>[] = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ value: v, label: v }));
const DAYS_0_5: readonly ChipOption<number>[] = Array.from({ length: HOME_LUNCH_MAX + 1 }, (_, i) => ({ value: i, label: i }));

/** שאלה אחת: תווית בולטת (יש היררכיה בין השאלות, לא ~50 ריבועים באותו גודל) וסולם של 48. */
function Scale({ label, options, value, onChange }: { label: string; options: readonly ChipOption<number>[]; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="checkin-q">
      <ChipSelect label={label} options={options} value={value} onChange={onChange} columns={5} tall />
    </div>
  );
}

export default function CheckinScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [week, setWeek] = useWeek(today);

  const saved = getCheckin(db.checkins, week);
  const value: WeeklyCheckin = saved ?? emptyCheckin(week);
  const start = useMemo(() => programStartWeek(db), [db]);
  const report = useMemo(() => buildChatReport(db, week, today), [db, week, today]);
  const summary = useMemo(() => buildWeekSummary(db, week, today), [db, week, today]);
  const json = useMemo(() => backupJson(db, new Date().toISOString(), activeProfile()), [db]);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  /** הקובץ/הלוח נרשמים כגיבוי רק אחרי אימות (שלב 0). */
  const markBackedUp = () => {
    if (db.settings.lastBackup === today) return;
    void store.update('settings', { ...db.settings, lastBackup: today });
  };
  /** שבוע הסיכום לצ'אט (שלב 5): נפרד מהשבוע של הצ'ק-אין. בשבת — השבוע הזה; אחרת השבוע השלם האחרון. */
  const [summaryWeek, setSummaryWeek] = useState<string>(() => defaultSummaryWeek(today));
  const weekly = useMemo(() => buildWeeklySummary(db, summaryWeek), [db, summaryWeek]);
  const summaryWeekNo = start ? weekNumber(start, summaryWeek) : null;

  /**
   * כל שינוי נשמר מיד, כמו קודם. טוסט "נשמר" קצר (שלב 5) — לסולמות
   * ולשינה בכל נגיעה; להערה פעם אחת ביציאה מהשדה, לא בכל תו.
   */
  const toast = useToast();
  const noteDirty = useRef(false);
  const patch = (next: Partial<WeeklyCheckin>, { quiet = false } = {}) => {
    void store.update('checkins', upsertCheckin(db.checkins, { ...value, ...next }));
    if (!quiet) toast.saved();
  };

  const filled = isFilled(saved);
  const isThisSaturday = isSaturday(today) && week === weekStart(today);

  return (
    <div className="stack--loose">
      {/* 1. כותרת: שבת הצ'ק-אין, מצב המילוי, וניווט השבוע כמו היום. */}
      <Surface variant="hero" aria-label="שבוע הצ'ק-אין">
        <WeekNav week={week} onChange={setWeek} today={today} weekNo={start ? weekNumber(start, week) : null} />
        <div className="checkin-head">
          <ScreenHeader
            eyebrow="צ'ק-אין"
            title={
              <>
                שבת · <Num>{formatDMY(weekEnd(week))}</Num>
              </>
            }
            sub={isThisSaturday ? 'היום' : undefined}
          />
          <StatusChip tone={filled ? 'done' : 'partial'} icon={filled ? CircleCheck : Circle}>
            {filled ? 'מולא' : 'לא מולא'}
          </StatusChip>
        </div>
      </Surface>

      {/* 2. הסיכום במסך — אותם נתונים של הדוח, במקטעים. */}
      <Surface aria-label="סיכום השבוע">
        <SectionHeader title="סיכום השבוע" />
        <WeekSummary report={summary} today={today} />
      </Surface>

      {/* 3. השאלות — אותם שדות, אותם סולמות, אותם ערכים שנשמרים. */}
      <Surface aria-label="שאלות הצ'ק-אין">
        <SectionHeader title="איך היה השבוע" aside="נשמר בכל נגיעה" />
        <div className="stack--loose">
          <Scale label="היצמדות" options={SCALE_1_10} value={value.adherence} onChange={(adherence) => patch({ adherence })} />
          <Scale label="רעב" options={SCALE_1_10} value={value.hunger} onChange={(hunger) => patch({ hunger })} />
          <Scale label="אנרגיה" options={SCALE_1_10} value={value.energy} onChange={(energy) => patch({ energy })} />
          <div className="checkin-q">
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
          </div>
          <Scale
            label="ימי נשנוש בלתי מתוכנן"
            options={DAYS_0_7}
            value={value.unplannedSnackDays}
            onChange={(unplannedSnackDays) => patch({ unplannedSnackDays })}
          />
          {/* שלב 2 (1/11/2026): אופציונלי. ניקוי מסיר את השדה מהרשומה — לא כותב null. */}
          <Scale
            label={`צהריים מהבית (0–${HOME_LUNCH_MAX})`}
            options={DAYS_0_5}
            value={value.homeLunchDays ?? null}
            onChange={(homeLunchDays) => {
              void store.update('checkins', upsertCheckin(db.checkins, withHomeLunchDays(value, homeLunchDays)));
              toast.saved();
            }}
          />

          <div className="checkin-q">
            <label htmlFor="note">הערה קצרה</label>
            <textarea
              id="note"
              value={value.note}
              maxLength={NOTE_MAX}
              onChange={(e) => {
                noteDirty.current = true;
                patch({ note: e.target.value.slice(0, NOTE_MAX) }, { quiet: true });
              }}
              onBlur={() => {
                if (!noteDirty.current) return;
                noteDirty.current = false;
                toast.saved();
              }}
            />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              <Num>
                {value.note.length}/{NOTE_MAX}
              </Num>
            </p>
          </div>
        </div>
      </Surface>

      {/* 4. סיכום שבועי לצ'אט: העתק (נשאר), שתף (חדש — אותו טקסט), קובץ טקסט. */}
      <Surface aria-label="סיכום שבועי לצ'אט">
        <SectionHeader
          title="סיכום שבועי לצ'אט"
          aside={
            <>
              <Num>{weekly.length}</Num> תווים
            </>
          }
        />
        <div className="stack">
          <WeekNav week={summaryWeek} onChange={setSummaryWeek} today={today} weekNo={summaryWeekNo} />
          <CopyBlock text={weekly} label="העתק סיכום שבועי" boxLabel="סיכום שבועי לצ'אט" primary share />
          <Button
            variant="ghost"
            block
            icon={FileText}
            onClick={() => downloadText(`fatloss-week-${summaryWeekNo ?? 'x'}-${summaryWeek}.txt`, weekly, 'text/plain')}
          >
            הורד כקובץ טקסט
          </Button>
          <p className="tiny muted" style={{ margin: 0 }}>
            נתונים מחושבים בלבד — משקל, מותניים, אימונים, אירובי, תזונה (ימים סגורים), צ'ק-אין ודגלים.
          </p>
        </div>
      </Surface>

      {/* 5. ייצוא: דוח הצ'ק-אין לצ'אט, וקובץ הגיבוי מאותו מקום. */}
      <Surface aria-label="ייצוא">
        <SectionHeader
          title="ייצוא"
          aside={
            <>
              <Num>{report.length}</Num> תווים
            </>
          }
        />
        <div className="stack">
          <CopyBlock text={report} label="העתק לצ'אט" boxLabel="דוח הצ'ק-אין" primary share />
          <div className="checkin-backup stack--tight">
            <p className="label" style={{ margin: 0 }}>
              גיבוי
            </p>
            <BackupSave json={json} db={db} filename={`fatloss-${toLocalISO(new Date())}.json`} onBackedUp={markBackedUp} />
            <CopyBlock
              text={json}
              label="העתק JSON מלא"
              boxLabel="גיבוי JSON"
              onCopied={() => {
                const v = verifyBackup(json, db);
                if (v.ok) {
                  markBackedUp();
                  setCopyNote(null);
                } else {
                  setCopyNote(`הטקסט הועתק אבל לא עבר אימות: ${v.problems.join(' · ')}`);
                }
              }}
            />
            {copyNote && (
              <p className="small err" role="alert" style={{ margin: 0 }}>
                {copyNote}
              </p>
            )}
            <p className="tiny muted" style={{ margin: 0 }}>
              לגיבוי, לא לצ'אט. קובץ עדיף על הלוח.
            </p>
          </div>
        </div>
      </Surface>
    </div>
  );
}
