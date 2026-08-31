import { useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from './useDb';
import { useToday } from './useToday';
import { weekStart } from './lib/date';
import { needsCheckin } from './lib/checkins';
import { firstDataDate } from './lib/db';
import { KEY_LABELS } from './lib/store';
import { onAppUpdate } from './platform/appUpdate';
import WeightScreen from './screens/WeightScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import CheckinScreen from './screens/CheckinScreen';
import DataScreen from './screens/DataScreen';

type TabId = 'weight' | 'workout' | 'checkin' | 'data';

const TABS: { id: TabId; label: string }[] = [
  { id: 'weight', label: 'משקל' },
  { id: 'workout', label: 'אימונים' },
  { id: 'checkin', label: "צ'ק-אין" },
  { id: 'data', label: 'נתונים' },
];

export default function App() {
  const store = useDb();
  const today = useToday();
  const [tab, setTab] = useState<TabId>('weight');
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onAppUpdate(() => setUpdateReady(true)), []);
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

  const checkinDue = useMemo(
    () => needsCheckin(store.db.checkins, today, firstDataDate(store.db)),
    [store.db, today],
  );

  // צ'ק-אין נפתח מעצמו רק בשבת, או אם השבוע הקודם נסגר בלי צ'ק-אין.
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (store.loading || autoOpened) return;
    setAutoOpened(true);
    if (checkinDue) setTab('checkin');
  }, [store.loading, autoOpened, checkinDue]);

  if (store.loading) {
    return (
      <div className="app">
        <main className="app__main">
          <p className="muted">טוען…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {/* main נשאר landmark; role="tabpanel" יושב על div פנימי, כי
          ARIA לא מרשה להחליף את התפקיד של <main>. */}
      <main className="app__main">
        <h1 className="visually-hidden">
          {TABS.find((t) => t.id === tab)?.label} — מדידה
        </h1>
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          tabIndex={-1}
        >
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
          <div className="banner stack--tight" style={{ marginBottom: 'var(--sp-4)' }}>
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

          {tab === 'weight' && <WeightScreen store={store} today={today} />}
          {tab === 'workout' && <WorkoutScreen store={store} today={today} />}
          {tab === 'checkin' && <CheckinScreen store={store} today={today} />}
          {tab === 'data' && <DataScreen store={store} today={today} />}
        </div>
      </main>

      <nav className="tabs" aria-label="ניווט ראשי">
        <div
          className="tabs__inner"
          role="tablist"
          aria-label="מסכים"
          onKeyDown={onTabKey}
        >
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                className="tab"
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                // רק הטאב הפעיל בסדר ה-Tab; החצים מזיזים בין הטאבים.
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'checkin' && checkinDue && (
                  <>
                    <span className="tab__dot" aria-hidden="true" />
                    <span className="visually-hidden">ממתין</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <span className="visually-hidden" aria-live="polite">
        שבוע נוכחי מתחיל ב-{thisWeek}
      </span>
    </div>
  );
}
