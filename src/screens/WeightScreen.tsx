/**
 * מסך "היום" (שלב 2 של תוכנית ה-UI). המזהה הפנימי של הטאב נשאר `weight`,
 * וכל מה שהיה במסך המשקל עדיין כאן — השתנו הסדר, ההיררכיה והמראה.
 *
 * מלמעלה למטה: כותרת (יום, תאריך, שבוע) · שקילת בוקר (טופס כשאין, שורה
 * קומפקטית כשיש) · גיבור הממוצע השבועי עם שבע נקודות · שני אריחי החלטה
 * (מותניים, חלבון) · מצב היום (פתוח/סגור) · האימון הבא · ואז צעדים,
 * טופס מותניים, גרף והיסטוריה — כמו קודם.
 *
 * כלל ברזל: כל מספר כאן מגיע מפונקציה קיימת ב-src/lib. אין חישוב חדש.
 * לוגיקת התצוגה (סטטוס מותניים, נקודות) ב-./todayView.ts, עם בדיקות.
 */

import { useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import type { TabId } from '../lib/profile';
import { useWeek } from '../useWeek';
import Stepper from '../components/Stepper';
import DateField from '../components/DateField';
import WeekNav from '../components/WeekNav';
import WeeklyChart from '../components/WeeklyChart';
import NumberField from '../components/NumberField';
import ProgressBar from '../components/ProgressBar';
import { addDays, dayLetter, dayName, formatDM, formatDMY, weekNumber, weekStart } from '../lib/date';
import { addCardioSteps, canStepForward, cardioStepsOn, defaultStepsDate, recentSteps, stepsGoalFor, stepsStatus } from '../lib/steps';
import { dayMeta, setDayClosed, setDaySteps, stepsOn, upsertDay } from '../lib/nutrition/days';
import { entriesOn } from '../lib/nutrition/entries';
import { daySummary } from '../lib/nutrition/calc';
import { targetFor } from '../lib/nutrition/targets';
import { kcalText } from '../lib/nutrition/display';
import { nextType } from '../lib/workouts';
import {
  lastWaist,
  lastWeight,
  removeWaist,
  removeWeight,
  sortWeights,
  summarizeWeek,
  upsertWaist,
  upsertWeight,
  waistBeforeWeek,
  waistInWeek,
  weekChange,
  weeklyAverages,
  WEEK_LENGTH,
} from '../lib/weights';
import { MAX_DAY_STEPS, MAX_WAIST, MAX_WEIGHT, MIN_WAIST, MIN_WEIGHT } from '../lib/schema';
import { programStartWeek } from '../lib/db';
import { DASH } from '../lib/format';
import { confidenceOf } from '../components/confidence';
import { Button, DayDots, HeroValue, Icon, ListRow, MetricTile, Num, ScreenHeader, SectionHeader, StatusChip, Surface, useToast } from '../ui';
import { ChevronLeft, Circle, CircleCheck, Dumbbell, Pencil, Ruler, Utensils } from '../ui/icons';
import { waistStatus, weekDots } from './todayView';

const RECENT_COUNT = 10;
/** מלאות השבוע → טון הצ'יפ: 7/7 מלא, 4–6 חלקי, פחות — חסר. */
const CHIP_TONE = { high: 'done', mid: 'partial', low: 'missing' } as const;
const MIN_FULL_WEEKS_FOR_CHART = 3;

type Props = ScreenProps & {
  /** מעבר לטאב אחר (אימונים, תזונה). אותו `setTab` של App. */
  onNavigate?: ((tab: TabId) => void) | undefined;
};

/** "06:40" משעת ISO. אותו פורמט כמו במסך התזונה. */
function timeText(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function WeightScreen({ store, today, onNavigate }: Props) {
  const { db } = store;
  const [week, setWeek] = useWeek(today);
  const [entryDate, setEntryDate] = useState(today);
  const [draft, setDraft] = useState<number | null>(null);
  /** "ערוך" בשורת הבוקר פותח את טופס השקילה גם כשכבר נשקלו היום. */
  const [editOpen, setEditOpen] = useState(false);
  const [waistDate, setWaistDate] = useState(today);
  const [waistDraft, setWaistDraft] = useState<number | null>(null);
  /** צעדים (שלב 6): מוזנים בבוקר על אתמול, יחד עם השקילה. */
  const [stepsDate, setStepsDate] = useState(() => defaultStepsDate(today));
  const [stepsDraft, setStepsDraft] = useState<number | null>(null);
  /** צעדי הליכון מהאירובי כבר נוספו לשדה (לתאריך הזה). לעולם לא אוטומטית. */
  const [cardioAddedFor, setCardioAddedFor] = useState<string | null>(null);
  /** שורת שקילה פתוחה ב"שקילות אחרונות" — רק בה מוצג כפתור המחיקה. */
  const [openRecent, setOpenRecent] = useState<string | null>(null);
  /** טופס המותניים, יעד הנגיעה באריח. */
  const waistForm = useRef<HTMLElement>(null);
  /**
   * טוסט אחד לכל האפליקציה (שלב 5): "נשמר" אחרי שמירה, "נמחק · בטל" אחרי
   * מחיקה. "בטל" מחזיר דרך אותן פונקציות שמוסיפות (upsert) על ה-DB העדכני.
   */
  const toast = useToast();

  const weeks = useMemo(() => weeklyAverages(db.weights), [db.weights]);
  const current = useMemo(() => summarizeWeek(db.weights, week), [db.weights, week]);
  const previous = useMemo(
    () => summarizeWeek(db.weights, addDays(week, -7)),
    [db.weights, week],
  );
  const change = useMemo(() => weekChange(current, previous), [current, previous]);
  const start = useMemo(() => programStartWeek(db), [db]);
  const last = useMemo(() => lastWeight(db.weights), [db.weights]);
  const todayWeekNo = start ? weekNumber(start, today) : null;

  // ברירת המחדל של השדה היא השקילה האחרונה: לאשר או לשנות, לא להקליד מחדש.
  const existing = db.weights.find((e) => e.d === entryDate) ?? null;
  const weightValue = draft ?? existing?.w ?? last?.w ?? null;
  const todayEntry = db.weights.find((e) => e.d === today) ?? null;

  const stepsExisting = stepsOn(db.days, stepsDate);
  const stepsValue = stepsDraft ?? stepsExisting;
  const stepsGoal = stepsGoalFor(stepsDate);
  const stepsRecent = useMemo(() => recentSteps(db.days, stepsDate), [db.days, stepsDate]);
  const cardioSteps = useMemo(() => cardioStepsOn(db, stepsDate), [db, stepsDate]);
  const cardioAdded = cardioAddedFor === stepsDate;
  const stepsLabel =
    stepsDate === addDays(today, -1) ? 'צעדים אתמול' : stepsDate === today ? 'צעדים היום' : `צעדים · יום ${dayName(stepsDate)}`;

  const moveStepsDate = (d: string) => {
    setStepsDate(d);
    setStepsDraft(null);
    setCardioAddedFor(null);
  };

  /** מוסיף את צעדי האירובי לשדה בלבד — נשמר רק בלחיצה על שמור/עדכן. פעם אחת לתאריך. */
  const addCardio = () => {
    if (cardioAdded || cardioSteps <= 0) return;
    setStepsDraft(addCardioSteps(stepsValue, cardioSteps));
    setCardioAddedFor(stepsDate);
  };

  const saveSteps = () => {
    if (stepsValue === null) return;
    void store.update('days', setDaySteps(db.days, stepsDate, stepsValue));
    setStepsDraft(null);
    toast.saved();
  };

  /** מחיקת צעדים: מיידית, "בטל" מחזיר את רשומת היום בדיוק (אותו אובייקט). */
  const deleteSteps = () => {
    const meta = dayMeta(db.days, stepsDate);
    if (!meta || meta.steps === undefined) return;
    void store.update('days', setDaySteps(db.days, stepsDate, null));
    setStepsDraft(null);
    toast.undo(
      <>
        נמחק · צעדים <Num>{formatDMY(stepsDate)}</Num> · <Num>{meta.steps.toLocaleString('en-US')}</Num>
      </>,
      () => void store.update('days', upsertDay(store.latest().days, meta)),
    );
  };

  const waistLast = useMemo(() => lastWaist(db.waist), [db.waist]);
  const waistExisting = db.waist.find((e) => e.d === waistDate) ?? null;
  const waistValue = waistDraft ?? waistExisting?.cm ?? waistLast?.cm ?? null;
  const waistThisWeek = useMemo(() => waistInWeek(db.waist, week), [db.waist, week]);
  const waistPrev = useMemo(() => waistBeforeWeek(db.waist, week), [db.waist, week]);
  /** אריח המותניים: תמיד על השבוע של היום, לא על השבוע המנווט. */
  const waist = useMemo(() => waistStatus(db.waist, today), [db.waist, today]);

  // ---- חלבון היום: אותו סיכום של מסך התזונה. ה-ref שברישום קובע, ולכן
  // אין צורך במאגר המזון כדי לקבל את אותו מספר. היעד מההגדרות הקיימות.
  const todayEntries = useMemo(() => entriesOn(db.entries, today), [db.entries, today]);
  const protein = useMemo(() => daySummary(todayEntries, today, () => null).protein, [todayEntries, today]);
  const target = useMemo(() => targetFor(db.targets, today), [db.targets, today]);
  const proteinLeft = target ? target.protein - protein : null;

  // ---- מצב היום: אותה פונקציה בדיוק של "סיימתי לרשום" במסך התזונה.
  const todayMeta = dayMeta(db.days, today);
  const dayClosed = todayMeta?.closed === true;
  const toggleClosed = () => {
    void store.update('days', setDayClosed(db.days, today, !dayClosed, new Date().toISOString()));
    // סגירה מציגה טוסט "היום נסגר · בטל"; פתיחה מהכפתור מורידה אותו.
    // "בטל" = אותה פונקציה, פתיחה, על ה-DB העדכני.
    if (dayClosed) toast.dismiss();
    else toast.undo('היום נסגר', () => void store.update('days', setDayClosed(store.latest().days, today, false, new Date().toISOString())));
  };

  const upNext = useMemo(() => nextType(db.workouts), [db.workouts]);

  const fullWeeks = weeks.filter((w) => w.complete).length;
  const recent = useMemo(() => sortWeights(db.weights).slice(-RECENT_COUNT).reverse(), [db.weights]);
  const missing = WEEK_LENGTH - current.count;
  const dots = useMemo(() => weekDots(week, current.days, today), [week, current.days, today]);
  const atCurrentWeek = week === weekStart(today);

  const saveWeight = () => {
    if (weightValue === null) return;
    void store.update('weights', upsertWeight(db.weights, { d: entryDate, w: weightValue }));
    setDraft(null);
    setEditOpen(false);
    toast.saved();
  };

  const saveWaist = () => {
    if (waistValue === null) return;
    void store.update('waist', upsertWaist(db.waist, { d: waistDate, cm: waistValue }));
    setWaistDraft(null);
    toast.saved();
  };

  /** מחיקת מדידת מותניים: מיידית, "בטל" מחזיר את אותה רשומה. */
  const deleteWaist = () => {
    const entry = waistExisting;
    if (!entry) return;
    void store.update('waist', removeWaist(db.waist, entry.d));
    setWaistDraft(null);
    toast.undo(
      <>
        נמחק · מותניים <Num>{formatDMY(entry.d)}</Num> · <Num>{entry.cm.toFixed(1)}</Num>
      </>,
      () => void store.update('waist', upsertWaist(store.latest().waist, entry)),
    );
  };

  /** מחיקת שקילה מ"שקילות אחרונות": מיידית, "בטל" מחזיר את אותה רשומה. */
  const deleteWeight = (entry: { d: string; w: number }) => {
    void store.update('weights', removeWeight(db.weights, entry.d));
    setOpenRecent(null);
    toast.undo(
      <>
        נמחק · שקילה <Num>{formatDMY(entry.d)}</Num> · <Num>{entry.w.toFixed(1)}</Num>
      </>,
      () => void store.update('weights', upsertWeight(store.latest().weights, entry)),
    );
  };

  const scrollToWaist = () => {
    waistForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---- אריח המותניים: ערך, צ'יפ ושורה שקטה לפי הסטטוס ----
  const prevText = waist.previous ? (
    <>
      קודם <Num>{waist.previous.cm.toFixed(1)}</Num> · <Num>{formatDM(waist.previous.d)}</Num>
    </>
  ) : (
    'אין מדידה קודמת'
  );
  const lastText = waist.previous ? (
    <>
      אחרון <Num>{formatDM(waist.previous.d)}</Num>
    </>
  ) : (
    'אין מדידות עדיין'
  );
  const waistTile = (() => {
    switch (waist.kind) {
      case 'measured':
        return {
          value: waist.inWeek!.cm.toFixed(1),
          dim: false,
          chip: (
            <StatusChip tone="done">
              נמדד · {waist.measuredDay} <Num>{formatDM(waist.inWeek!.d)}</Num>
            </StatusChip>
          ),
          sub: prevText,
        };
      case 'measured-other':
        // לא ביום המדידה: ערך אמיתי, אבל לא "תקין" — ניטרלי.
        return {
          value: waist.inWeek!.cm.toFixed(1),
          dim: false,
          chip: <StatusChip tone="neutral">נמדד ב{waist.measuredDay}</StatusChip>,
          sub: prevText,
        };
      case 'upcoming':
        return {
          value: waist.previous ? waist.previous.cm.toFixed(1) : DASH,
          dim: true,
          chip: <StatusChip tone="neutral">הבא: רביעי</StatusChip>,
          sub: lastText,
        };
      case 'due':
        return {
          value: waist.previous ? waist.previous.cm.toFixed(1) : DASH,
          dim: true,
          chip: <StatusChip tone="partial">חסר — למדוד היום</StatusChip>,
          sub: lastText,
        };
      case 'missed':
        // לא מבקשים למדוד: המדידה של השבוע היא ברביעי, בבוקר.
        return {
          value: waist.previous ? waist.previous.cm.toFixed(1) : DASH,
          dim: true,
          chip: <StatusChip tone="missing">הוחמץ השבוע</StatusChip>,
          sub: lastText,
        };
    }
  })();

  return (
    <div className="stack--loose">
      {/* תזכורת הגיבוי עברה ל-App.tsx — מוצגת בכל טאב ובכל פרופיל (שלב 0). */}

      {/* 1. כותרת: יום, תאריך, ושבוע התוכנית כשהוא ידוע. */}
      <ScreenHeader
        title={`יום ${dayName(today)}`}
        sub={
          <>
            <Num>{formatDMY(today)}</Num>
            {todayWeekNo !== null && (
              <>
                {' · '}שבוע <Num>{todayWeekNo}</Num>
              </>
            )}
          </>
        }
      />

      {/* 2. שקילת בוקר: הטופס ראשון כשאין שקילה היום — בלי גלילה.
          כשיש — שורה קומפקטית, ו"ערוך" פותח את אותו טופס. */}
      {todayEntry && !editOpen ? (
        <Surface as="div" className="surface--row" aria-label="שקילת הבוקר">
          <ListRow
            title={
              <>
                הבוקר <Num className="strong">{todayEntry.w.toFixed(1)}</Num> ק"ג
              </>
            }
            sub="נרשם היום"
            end={
              <Button
                variant="ghost"
                icon={Pencil}
                onClick={() => {
                  setEntryDate(today);
                  setDraft(null);
                  setEditOpen(true);
                }}
              >
                ערוך
              </Button>
            }
          />
        </Surface>
      ) : (
        <Surface aria-label="שקילה">
          <SectionHeader
            title={todayEntry && entryDate === today ? 'שקילת הבוקר — עריכה' : 'שקילת בוקר'}
            aside={existing ? 'נרשם כבר — שמירה תעדכן' : undefined}
          />
          <div className="stack">
            {/* כמעט תמיד "היום": שורה אחת, כדי ששדה המשקל וכפתור השמירה יעלו. */}
            <DateField
              label="תאריך השקילה"
              value={entryDate}
              max={today}
              collapsible
              today={today}
              onChange={(d) => {
                setEntryDate(d);
                setDraft(null);
              }}
            />
            <Stepper
              label="משקל"
              unit='ק"ג'
              value={weightValue}
              onChange={setDraft}
              step={0.1}
              min={MIN_WEIGHT}
              max={MAX_WEIGHT}
              decimals={1}
              placeholder="0.0"
              hint={last ? `אחרון: ${last.w.toFixed(1)} · ${formatDM(last.d)}` : undefined}
            />
            <div className="row">
              <Button variant="accent" block disabled={weightValue === null} onClick={saveWeight}>
                {existing ? 'עדכן שקילה' : 'שמור שקילה'}
              </Button>
              {todayEntry && editOpen && (
                <Button variant="ghost" onClick={() => setEditOpen(false)}>
                  בטל
                </Button>
              )}
            </div>
          </div>
        </Surface>
      )}

      {/* 3. גיבור: הממוצע השבועי. ממוצע מ-7/7 חשוב משקילה בודדת. */}
      <Surface variant="hero" aria-label="ממוצע שבועי">
        <WeekNav
          week={week}
          onChange={setWeek}
          today={today}
          weekNo={start ? weekNumber(start, week) : null}
        />
        <div className="stack" style={{ marginTop: 'var(--sp-4)' }}>
          <div>
            <h2 style={{ marginBottom: 'var(--sp-2)' }}>ממוצע שבועי</h2>
            <HeroValue
              value={current.avg === null ? DASH : current.avg.toFixed(2)}
              unit={current.avg === null ? undefined : 'ק"ג'}
              state={current.avg === null ? 'empty' : current.complete ? 'full' : 'dim'}
              label={`ממוצע שבועי ${current.avg === null ? 'אין' : current.avg.toFixed(2)}, ${current.count} מתוך ${WEEK_LENGTH} שקילות`}
              aside={
                <>
                  <Num>
                    {current.count}/{WEEK_LENGTH}
                  </Num>
                  {/* הצבע מקודד מלאות בלבד, לא כיוון. */}
                  <StatusChip tone={CHIP_TONE[confidenceOf(current.count)]}>
                    {current.complete ? 'שבוע מלא' : current.count === 0 ? 'אין שקילות' : 'חלקי'}
                  </StatusChip>
                </>
              }
            />
          </div>

          {/* שבע נקודות: נשקל / חסר / עתיד. בלי מספרים — השקילה היומית היא רעש. */}
          <DayDots days={dots} label={`שקילות השבוע${atCurrentWeek ? '' : ` של ${formatDM(week)}`}`} />

          <div className="stack--tight">
            {current.complete ? (
              <>
                <p className="sub" style={{ margin: 0 }}>
                  שבוע קודם{' '}
                  <Num>{previous.avg === null ? DASH : previous.avg.toFixed(2)}</Num> ·{' '}
                  <Num>
                    {previous.count}/{WEEK_LENGTH}
                  </Num>
                </p>
                <p style={{ margin: 0 }}>
                  {change ? (
                    <>
                      {change.direction === 'same'
                        ? 'ללא שינוי'
                        : `${change.direction === 'down' ? 'ירידה' : 'עלייה'} `}
                      {change.direction !== 'same' && (
                        <>
                          <Num>{change.drop.toFixed(2)}</Num> ק"ג (<Num>{change.pct.toFixed(2)}%</Num>)
                        </>
                      )}
                    </>
                  ) : (
                    <span className="muted">
                      השבוע הקודם חלקי (<Num>{previous.count}/{WEEK_LENGTH}</Num>) — אין השוואה
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="sub" style={{ margin: 0 }}>
                שבוע קודם <Num>{previous.avg === null ? DASH : previous.avg.toFixed(2)}</Num> ·{' '}
                <Num>
                  {previous.count}/{WEEK_LENGTH}
                </Num>
                <span className="muted">
                  {' '}
                  · חסרות <Num>{missing}</Num> {missing === 1 ? 'שקילה' : 'שקילות'} להשוואה
                </span>
              </p>
            )}
          </div>
        </div>
      </Surface>

      {/* 4. שורת מדדי ההחלטה: מותניים חשובים ממשקל, חלבון מול היעד הוא המדד המרכזי. */}
      <div className="tiles" role="group" aria-label="מדדי החלטה">
        <MetricTile
          label="מותניים"
          icon={Ruler}
          value={<Num>{waistTile.value}</Num>}
          unit={waistTile.value === DASH ? undefined : 'ס"מ'}
          dim={waistTile.dim}
          chip={waistTile.chip}
          sub={waistTile.sub}
          onTap={scrollToWaist}
          tapLabel="מותניים — לטופס המדידה"
        />
        <MetricTile
          label="חלבון היום"
          icon={Utensils}
          value={<Num>{kcalText(protein)}</Num>}
          unit={target ? <Num>/ {kcalText(target.protein)}</Num> : 'ג׳'}
          bar={target ? <ProgressBar value={protein} target={target.protein} label="חלבון מול היעד" /> : undefined}
          sub={
            target ? (
              proteinLeft !== null && proteinLeft > 0 ? (
                <>
                  חסר <Num>{kcalText(proteinLeft)}</Num> ג׳
                </>
              ) : (
                'היעד הושלם'
              )
            ) : (
              'אין יעד — במסך "נתונים"'
            )
          }
          onTap={onNavigate ? () => onNavigate('nutrition') : undefined}
          tapLabel="חלבון היום — למסך התזונה"
        />
      </div>

      {/* 5. מצב היום: יום לא סגור לא נכנס לחישובים. אותה סגירה של מסך התזונה. */}
      <Surface as="div" className="surface--row" aria-label="מצב היום">
        <ListRow
          lead={dayClosed ? CircleCheck : Circle}
          title={
            <>
              {dayClosed ? 'היום סגור' : 'היום פתוח'}{' '}
              {dayClosed ? <StatusChip tone="done">סגור</StatusChip> : <StatusChip tone="missing">פתוח</StatusChip>}
            </>
          }
          sub={
            dayClosed ? (
              <>
                {todayMeta?.closedAt && (
                  <>
                    נסגר <Num>{timeText(todayMeta.closedAt)}</Num> ·{' '}
                  </>
                )}
                נכנס לחישובים · אפשר עדיין לערוך
              </>
            ) : (
              'לא נכנס לחישובים עד הסגירה'
            )
          }
          end={
            dayClosed ? (
              <Button variant="ghost" onClick={toggleClosed}>
                פתח מחדש
              </Button>
            ) : (
              <Button onClick={toggleClosed}>סגור יום</Button>
            )
          }
        />
      </Surface>

      {/* "בטל" = אותה פונקציה של "פתח מחדש". צף מעל הניווט, 6 שניות. */}

      {/* 6. אימון: הבא בסבב, כפי שמסך האימונים כבר מחשב. נגיעה מעבירה לשם. */}
      <Surface as="div" className="surface--row" aria-label="אימון">
        <ListRow
          lead={Dumbbell}
          title={
            <>
              הבא בתור: <span className="strong">{upNext}</span>
            </>
          }
          sub="אימונים"
          end={<Icon icon={ChevronLeft} />}
          onTap={() => onNavigate?.('workout')}
          aria-label={`אימון — הבא בתור ${upNext}. למסך האימונים`}
        />
      </Surface>

      {/* 7. מתחת לכל זה: צעדים, מותניים, גרף והיסטוריה — כמו במסך המשקל. */}

      {/* צעדים (שלב 6): כרטיס קומפקטי — אתמול כברירת מחדל, דפדוף אחורה, לא אל העתיד. */}
      <section className="section">
        <div className="section__head">
          <h2>צעדים</h2>
          {stepsGoal !== null ? (
            <span className="tiny muted">
              יעד <span className="num">{stepsGoal.toLocaleString('en-US')}</span>
            </span>
          ) : (
            <span className="tiny muted">הזנה ידנית, בבוקר</span>
          )}
        </div>
        <div className="stack--tight">
          <div className="weeknav">
            <button
              type="button"
              className="btn btn--step"
              aria-label="יום קודם"
              onClick={() => moveStepsDate(addDays(stepsDate, -1))}
            >
              ›
            </button>
            <div className="weeknav__label">
              {stepsLabel} · <span className="num">{formatDM(stepsDate)}</span>
            </div>
            <button
              type="button"
              className="btn btn--step"
              aria-label="יום הבא"
              disabled={!canStepForward(stepsDate, today)}
              onClick={() => canStepForward(stepsDate, today) && moveStepsDate(addDays(stepsDate, 1))}
            >
              ‹
            </button>
          </div>
          <div className="row">
            <div className="grow">
              <NumberField
                label={`צעדים — ${formatDMY(stepsDate)}`}
                hideLabel
                value={stepsValue}
                onChange={setStepsDraft}
                min={0}
                max={MAX_DAY_STEPS}
                placeholder="צעדים"
              />
            </div>
            <button type="button" className="btn" disabled={stepsValue === null} onClick={saveSteps}>
              {stepsExisting !== null ? 'עדכן' : 'שמור'}
            </button>
            {stepsExisting !== null && (
              <button
                type="button"
                className="btn btn--danger"
                aria-label={`מחק צעדים של ${formatDMY(stepsDate)}`}
                onClick={deleteSteps}
              >
                מחק
              </button>
            )}
          </div>
          {cardioSteps > 0 && (
            <div className="row steps-cardio">
              <span className="tiny muted grow">
                באירובי נרשמו <span className="num">{cardioSteps.toLocaleString('en-US')}</span> צעדים
              </span>
              {cardioAdded ? (
                <span className="tiny steps-cardio__done" role="status">
                  נוסף ✓
                </span>
              ) : (
                <button type="button" className="btn btn--quiet btn--outlined" onClick={addCardio}>
                  הוסף לספירה
                </button>
              )}
            </div>
          )}
          <div className="steps-row" role="list" aria-label="צעדים בשבעת הימים האחרונים">
            {stepsRecent.map(({ d, steps }) => {
              const status = steps === null ? null : stepsStatus(steps, d);
              return (
                <div key={d} role="listitem" className={`steps-day${d === stepsDate ? ' is-current' : ''}`}>
                  <span className="tiny muted">{dayLetter(d)}</span>
                  <span className={`num steps-val${status ? ` steps-val--${status}` : ''}`}>
                    {steps === null ? DASH : steps.toLocaleString('en-US')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" ref={waistForm} tabIndex={-1} aria-label="מותניים — טופס">
        <div className="section__head">
          <h2>מותניים</h2>
          <span className="tiny muted">בוקר, בטבור, פעם בשבוע</span>
        </div>
        <div className="stack">
          {/* אותם ערכים של הדוח: המדידה בשבוע המנווט והאחרונה שלפניו. בלי כיוון. */}
          <p className="sub" style={{ margin: 0 }}>
            {atCurrentWeek ? 'השבוע' : `שבוע ${formatDM(week)}`}:{' '}
            <span className="num">
              {waistThisWeek ? waistThisWeek.cm.toFixed(1) : DASH}
            </span>
            {waistPrev && (
              <>
                {' '}
                · קודם <span className="num">{waistPrev.cm.toFixed(1)}</span> (
                <span className="num">{formatDM(waistPrev.d)}</span>)
              </>
            )}
          </p>
          <DateField
            label="תאריך"
            value={waistDate}
            max={today}
            onChange={(d) => {
              setWaistDate(d);
              setWaistDraft(null);
            }}
          />
          <Stepper
            label="היקף מותניים"
            unit={'ס"מ'}
            value={waistValue}
            onChange={setWaistDraft}
            step={0.5}
            min={MIN_WAIST}
            max={MAX_WAIST}
            decimals={1}
            placeholder="0.0"
          />
          <div className="row">
            <button
              type="button"
              className="btn btn--block"
              disabled={waistValue === null}
              onClick={saveWaist}
            >
              {waistExisting ? 'עדכן מדידה' : 'שמור מדידה'}
            </button>
            {waistExisting && (
              <button
                type="button"
                className="btn btn--danger"
                aria-label={`מחק מדידת מותניים של ${formatDMY(waistDate)}`}
                onClick={deleteWaist}
              >
                מחק
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>ממוצעים שבועיים</h2>
          <span className="tiny muted">
            <span className="num">{fullWeeks}</span> שבועות מלאים
          </span>
        </div>
        {fullWeeks >= MIN_FULL_WEEKS_FOR_CHART ? (
          <>
            <WeeklyChart weeks={weeks} />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              נקודה חלולה = שבוע חלקי.
            </p>
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            הגרף נפתח אחרי <span className="num">{MIN_FULL_WEEKS_FOR_CHART}</span> שבועות
            מלאים. יש <span className="num">{fullWeeks}</span>.
          </p>
        )}
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>שקילות אחרונות</h2>
        {recent.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            אין שקילות.
          </p>
        ) : (
          <ul className="list">
            {/* המחיקה מוסתרת עד פתיחת שורה, כמו במסך האימונים — עשרה
                כפתורי "מחק" ליד המספרים היו רעש. נגיעה אחת מוחקת; "בטל" בטוסט. */}
            {recent.map((e) => {
              const isOpen = openRecent === e.d;
              return (
                <li key={e.d}>
                  <button
                    type="button"
                    className="btn btn--quiet grow"
                    style={{ justifyContent: 'flex-start', textAlign: 'start' }}
                    aria-expanded={isOpen}
                    onClick={() => setOpenRecent(isOpen ? null : e.d)}
                  >
                    <span className="grow">
                      <span className="num">{formatDMY(e.d)}</span>{' '}
                      <span className="muted small">{dayLetter(e.d)}</span>
                    </span>
                    <span className="num strong">{e.w.toFixed(1)}</span>
                  </button>
                  {isOpen && (
                    <button
                      type="button"
                      className="btn btn--quiet err"
                      aria-label={`מחק שקילה של ${formatDMY(e.d)}`}
                      onClick={() => deleteWeight(e)}
                    >
                      מחק
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
