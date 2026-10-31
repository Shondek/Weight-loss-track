import { useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from './useDb';
import { useToday } from './useToday';
import { weekStart } from './lib/date';
import { needsCheckin } from './lib/checkins';
import { firstDataDate } from './lib/db';
import { KEY_LABELS } from './lib/store';
import { daysSinceBackup, needsBackupReminder } from './lib/backup';
import { activeProfile } from './data/profile';
import { defaultTab, visibleTabs, type TabId } from './lib/profile';
import { onAppUpdate } from './platform/appUpdate';
import { requestPersistentStorage } from './platform/storagePersist';
import { useRestTimer } from './hooks/useRestTimer';
import RestTimerBar from './components/RestTimerBar';
import { Notice, TabBar, type IconComponent } from './ui';
import { ClipboardCheck, Database, Dumbbell, House, Utensils } from './ui/icons';
import WeightScreen from './screens/WeightScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import CheckinScreen from './screens/CheckinScreen';
import DataScreen from './screens/DataScreen';
import NutritionScreen from './screens/NutritionScreen';

/**
 * שלב 2: הטאב הראשון נקרא "היום" (היה "משקל") — המסך מציג את מדדי ההחלטה
 * של הבוקר, לא רק משקל. המזהה הפנימי `weight` וכל מה שנשמר באחסון לא השתנו.
 */
const TAB_LABELS: Record<TabId, string> = {
  weight: 'היום',
  nutrition: 'תזונה',
  workout: 'אימונים',
  checkin: "צ'ק-אין",
  data: 'נתונים',
};

/** אייקון לכל טאב (Lucide, ui/icons.ts). אותם טאבים, אותו סדר; "היום" עם בית. */
const TAB_ICONS: Record<TabId, IconComponent> = {
  weight: House,
  nutrition: Utensils,
  workout: Dumbbell,
  checkin: ClipboardCheck,
  data: Database,
};

/**
 * הלשוניות לפי פרופיל המכשיר (lib/profile.ts). בלי פרופיל — כל החמש, כמו
 * היום. בת הזוג: אימונים ונתונים בלבד. אין ניתוב לפי כתובת — הלשונית היא
 * מצב בזיכרון, ולכן מסך שאינו ברשימה אינו נגיש בשום דרך.
 */
const PROFILE = activeProfile();
const TABS: { id: TabId; label: string; icon: IconComponent }[] = visibleTabs(PROFILE).map((id) => ({
  id,
  label: TAB_LABELS[id],
  icon: TAB_ICONS[id],
}));

export default function App() {
  const store = useDb();
  const today = useToday();
  const [tab, setTab] = useState<TabId>(defaultTab(PROFILE));
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onAppUpdate(() => setUpdateReady(true)), []);
  // בקשה לאחסון קבוע בכל טעינה (סיכון #5). התוצאה מוצגת במסך "נתונים".
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  /**
   * הטיימר חי כאן ולא בתוך מסך האימון. המסכים מוחלפים בהחלפת טאב,
   * וטיימר שיושב בתוכם היה נהרג בלחיצה מקרית באמצע אימון.
   */
  const timer = useRestTimer(store.db.settings.soundEnabled);
  const timerVisible = timer.running || timer.justFinished;
  const thisWeek = weekStart(today);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  /** ניווט בחצים בין הטאבים. ב-RTL החץ הימני מוביל אחורה. */
  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta =
      e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      delta === -99
        ? 0
        : delta === 99
          ? TABS.length - 1
          : (i + delta + TABS.length) % TABS.length;
    const id = TABS[next]?.id;
    if (!id) return;
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  /**
   * תזכורת גיבוי (שלב 0): הנתונים קיימים רק במכשיר, ולכן היא מוצגת בכל
   * טאב ובכל פרופיל — גם בת הזוג, שאין לה טאב "משקל". קומפקטית, לא חוסמת.
   */
  const backupDue = useMemo(() => needsBackupReminder(store.db, today), [store.db, today]);
  const sinceBackup = daysSinceBackup(store.db.settings, today);

  const checkinDue = useMemo(
    () => needsCheckin(store.db.checkins, today, firstDataDate(store.db)),
    [store.db, today],
  );

  // צ'ק-אין ממתין מסומן בנקודה על הטאב בלבד. האפליקציה לא מחליפה מסך
  // מעצמה: שבת בבוקר היא קודם כול יום שקילה ומדידת מותניים.

  if (store.loading) {
    return (
      <div className="app">
        <main className={`app__main${timerVisible ? ' app__main--timer' : ''}`}>
          <p className="muted">טוען…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {/* main נשאר landmark; role="tabpanel" יושב על div פנימי, כי
          ARIA לא מרשה להחליף את התפקיד של <main>. */}
      <main className={`app__main${timerVisible ? ' app__main--timer' : ''}`}>
        <h1 className="visually-hidden">
          {TABS.find((t) => t.id === tab)?.label} — מדידה
        </h1>
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          tabIndex={-1}
        >
        {backupDue && (
          <Notice
            className="notice--row"
            action={
              tab !== 'data' ? (
                <button type="button" className="btn btn--quiet" onClick={() => setTab('data')}>
                  ייצא
                </button>
              ) : undefined
            }
          >
            {sinceBackup === null ? (
              'גיבוי: אין עדיין. הנתונים קיימים רק במכשיר הזה.'
            ) : (
              <>
                גיבוי: עברו <span className="num">{sinceBackup}</span> ימים מהגיבוי האחרון.
              </>
            )}
          </Notice>
        )}

        {updateReady && (
          <div className="banner stack--tight" role="status">
            <p style={{ margin: 0 }}>גרסה חדשה של האפליקציה מוכנה.</p>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              רענן
            </button>
          </div>
        )}

        {store.missingKeys.length > 0 && (
          // חוסם ולא ניתן לסגירה: המפתחות האלה היו באחסון ונעלמו. שום דבר לא
          // נשמר מעליהם עד שחזור מגיבוי במסך "נתונים" (סיכון #4).
          <div className="banner banner--error banner--blocking stack--tight" role="alert">
            <p className="strong" style={{ margin: 0 }}>
              נתונים חסרים באחסון — שחזר מגיבוי לפני שממשיכים
            </p>
            <p style={{ margin: 0 }}>
              חסר: {store.missingKeys.map((k) => KEY_LABELS[k]).join(' · ')}. המפתחות האלה היו
              במכשיר ואינם עוד. הם נטענו ריקים ולא יישמרו עד שתייבא גיבוי במסך "נתונים".
            </p>
          </div>
        )}

        {store.dirtyKeys.length > 0 && (
          <div className="banner banner--error stack--tight" role="alert">
            <p className="strong" style={{ margin: 0 }}>
              נתונים לא נשמרו במכשיר:{' '}
              {store.dirtyKeys.map((k) => KEY_LABELS[k]).join(' · ')}
            </p>
            <p style={{ margin: 0 }}>
              הם עדיין על המסך וייכללו בייצוא, אבל ייעלמו בסגירת האפליקציה.
              ייצא גיבוי ממסך "נתונים".
            </p>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void store.retrySave()}
            >
              נסה לשמור שוב
            </button>
          </div>
        )}

        {store.errors.length > 0 && (
          <div className="banner banner--error stack--tight" role="alert">
            {store.errors.map((e) => (
              <p key={e} style={{ margin: 0 }}>
                {e}
              </p>
            ))}
            <button type="button" className="btn btn--quiet err" onClick={store.dismissErrors}>
              סגור
            </button>
          </div>
        )}

        {store.notices.length > 0 && (
          <div className="banner stack--tight" role="status">
            {store.notices.map((n) => (
              <p key={n} style={{ margin: 0 }}>
                {n}
              </p>
            ))}
            <button type="button" className="btn btn--quiet" onClick={store.dismissNotices}>
              הבנתי
            </button>
          </div>
        )}

          {tab === 'weight' && <WeightScreen store={store} today={today} onNavigate={setTab} />}
          {tab === 'nutrition' && <NutritionScreen store={store} today={today} />}
          {tab === 'workout' && (
            <WorkoutScreen store={store} today={today} timer={timer} />
          )}
          {tab === 'checkin' && <CheckinScreen store={store} today={today} />}
          {tab === 'data' && <DataScreen store={store} today={today} />}
        </div>
      </main>

      <RestTimerBar
        timer={timer}
        soundEnabled={store.db.settings.soundEnabled}
        onToggleSound={(soundEnabled) =>
          void store.update('settings', { ...store.db.settings, soundEnabled })
        }
      />

      {/* צ'ק-אין ממתין מסומן בנקודה על הטאב בלבד (ראו למעלה). */}
      <TabBar<TabId>
        tabs={TABS.map((t) => ({ ...t, dot: t.id === 'checkin' && checkinDue, dotLabel: 'ממתין' }))}
        selected={tab}
        onSelect={setTab}
        tabRef={(id, el) => {
          tabRefs.current[id] = el;
        }}
        onKeyDown={onTabKey}
        navLabel="ניווט ראשי"
        listLabel="מסכים"
      />

      <span className="visually-hidden" aria-live="polite">
        שבוע נוכחי מתחיל ב-{thisWeek}
      </span>
    </div>
  );
}
