import { useEffect, useMemo, useState } from 'react';
import { useDb } from './useDb';
import { useToday } from './useToday';
import { weekStart } from './lib/date';
import { needsCheckin } from './lib/checkins';
import { firstDataDate } from './lib/db';
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
  const thisWeek = weekStart(today);

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
      <main className="app__main" id="main">
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
      </main>

      <nav className="tabs" aria-label="ניווט ראשי">
        <div className="tabs__inner" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
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
          ))}
        </div>
      </nav>

      <span className="visually-hidden" aria-live="polite">
        שבוע נוכחי מתחיל ב-{thisWeek}
      </span>
    </div>
  );
}
