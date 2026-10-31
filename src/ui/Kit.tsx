import { useState } from 'react';
import {
  Button,
  ChipSelect,
  DayDots,
  Disclosure,
  ProgressSegments,
  HeroValue,
  Icon,
  ListRow,
  MetricTile,
  ScreenHeader,
  Notice,
  Num,
  ProgressBar,
  SectionHeader,
  Sheet,
  StatusChip,
  Stepper,
  Surface,
  TabBar,
  Toast,
  type IconComponent,
} from './index';
import * as icons from './icons';

/**
 * דף הערכה — פיתוח בלבד (`import.meta.env.DEV`, נפתח ב-`#kit`).
 * מציג את כל הרכיבים, הפלטה, הטיפוגרפיה והאייקונים של "לילה". לא נכלל
 * ב-build של הייצור (ראו main.tsx), ולא נוגע בשום נתון.
 */

const SWATCHES: { name: string; token: string; text?: string }[] = [
  { name: 'surface-1', token: '--surface-1' },
  { name: 'surface-2', token: '--surface-2' },
  { name: 'surface-3', token: '--surface-3' },
  { name: 'text-primary', token: '--text-primary' },
  { name: 'text-secondary', token: '--text-secondary' },
  { name: 'text-quiet', token: '--text-quiet' },
  { name: 'accent', token: '--accent' },
  { name: 'accent-soft', token: '--accent-soft' },
  { name: 'danger', token: '--danger' },
  { name: 'status-done', token: '--status-done' },
  { name: 'status-partial', token: '--status-partial' },
  { name: 'status-missing', token: '--status-missing' },
];

const PAIRS: { fg: string; bg: string; label: string }[] = [
  { fg: '--text-primary', bg: '--surface-1', label: 'טקסט ראשי על רקע' },
  { fg: '--text-primary', bg: '--surface-2', label: 'טקסט ראשי על פאנל' },
  { fg: '--text-secondary', bg: '--surface-2', label: 'משני על פאנל' },
  { fg: '--text-quiet', bg: '--surface-2', label: 'שקט על פאנל' },
  { fg: '--text-quiet', bg: '--surface-3', label: 'שקט על משטח 3' },
  { fg: '--on-accent', bg: '--accent', label: 'כהה על מבטא' },
  { fg: '--accent', bg: '--surface-2', label: 'מבטא כטקסט' },
  { fg: '--status-done', bg: '--status-done-soft', label: 'מלא על רך' },
  { fg: '--status-partial', bg: '--status-partial-soft', label: 'חלקי על רך' },
  { fg: '--status-missing', bg: '--status-missing-soft', label: 'חסר על רך' },
  { fg: '--danger', bg: '--surface-3', label: 'הרסני על משטח 3' },
  { fg: '--danger', bg: '--danger-soft', label: 'הרסני על רך' },
  { fg: '--toast-text', bg: '--toast-bg', label: 'טוסט' },
];

function hexOf(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}

type KitTab = 'weight' | 'nutrition' | 'workout' | 'checkin' | 'data';

export default function Kit() {
  const [val, setVal] = useState<number | null>(94.4);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<KitTab>('workout');
  const iconEntries = Object.entries(icons) as [string, IconComponent][];

  return (
    <div className="kit">
      <h1>ערכה · לילה</h1>
      <p className="sub">Rubik · Lucide קו 2 · ריווח 4/8 · רדיוסים 16/12/10/8 · אפס צל · אזור מגע 48</p>

      <SectionHeader title="פלטה" aside="tokens.css" />
      <div className="kit__grid">
        {SWATCHES.map((s) => (
          <div key={s.name} className="kit__swatch">
            <div className="kit__swatch-chip" style={{ background: `var(${s.token})` }} />
            <span className="kit__swatch-name">{s.name}</span>
            <Num>{hexOf(s.token)}</Num>
          </div>
        ))}
      </div>

      <SectionHeader title="ניגודיות (מחושב מה-tokens)" aside="AA ≥ 4.5" />
      <table className="kit__table">
        <thead>
          <tr>
            <th>זוג</th>
            <th>דוגמה</th>
            <th>יחס</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map((p) => {
            const r = ratio(hexOf(p.fg), hexOf(p.bg));
            return (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td>
                  <span className="kit__pair" style={{ color: `var(${p.fg})`, background: `var(${p.bg})` }}>
                    94.4 ק״ג
                  </span>
                </td>
                <td>
                  <Num>{r.toFixed(2)}</Num> {r >= 4.5 ? '✓' : '✗'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <SectionHeader title="טיפוגרפיה" />
      <Surface>
        <p className="hero" style={{ margin: 0 }}>
          <Num>94.40</Num>
        </p>
        <h1>כותרת h1 · 24/500</h1>
        <p style={{ margin: 0, fontSize: 'var(--t-num)' }}>
          <Num>170</Num> ג׳ חלבון · num 28
        </p>
        <p style={{ margin: 0 }}>גוף 16 — שקילת בוקר, רישום לאורך היום.</p>
        <p className="sub" style={{ margin: 0 }}>
          משני 14 — <Num>5</Num> מתוך <Num>7</Num> שקילות
        </p>
        <h2>תווית 13/500</h2>
        <p className="tiny muted" style={{ margin: 0 }}>
          זעיר 12 — הזמן זורם מימין לשמאל
        </p>
      </Surface>

      <SectionHeader title="Surface" />
      <Surface>פאנל — משטח 2, רדיוס 16</Surface>
      <Surface variant="sunk">שקוע — משטח 3</Surface>

      <SectionHeader title="Button" />
      <div className="kit__row">
        <Button variant="accent">שמור שקילה</Button>
        <Button>משני</Button>
        <Button variant="ghost">רפאים</Button>
        <Button variant="danger">מחק</Button>
        <Button variant="accent" icon={icons.Check}>
          רשום
        </Button>
        <Button disabled>מושבת</Button>
      </div>
      <Button variant="accent" block tall>
        רשום סט · <Num>12</Num>
      </Button>

      <SectionHeader title="StatusChip" />
      <div className="kit__row">
        <StatusChip tone="done" icon={icons.Check}>
          שבוע מלא
        </StatusChip>
        <StatusChip tone="partial">חלקי <Num>5/7</Num></StatusChip>
        <StatusChip tone="missing">חסר — רביעי</StatusChip>
        <StatusChip tone="neutral">כולל הערכות</StatusChip>
        <StatusChip tone="accent">הבא בתור</StatusChip>
      </div>

      <SectionHeader title="Stepper" aside="−/+ 48px" />
      <Surface>
        <Stepper label="משקל" unit='ק"ג' value={val} onChange={setVal} step={0.1} min={30} max={300} decimals={1} hint="אחרון: 94.5 · 30/10" />
        <div style={{ marginTop: 'var(--sp-3)' }}>
          <Stepper label="שיפוע" unit="%" value={2.5} onChange={() => undefined} step={0.5} min={0} max={15} decimals={1} compact />
        </div>
      </Surface>

      <SectionHeader title="Num" />
      <p style={{ margin: 0 }}>
        שבוע <Num>8</Num> · <Num>25/10–31/10</Num> · ירידה <Num>0.40</Num> ק״ג (<Num>0.42%</Num>)
      </p>

      <SectionHeader title="ProgressBar" />
      <Surface>
        <div className="stack">
          <ProgressBar fraction={0.68} label="חלבון" valueNow={116} valueMax={170} />
          <ProgressBar fraction={0.97} tone="done" label="מלא" valueNow={165} valueMax={170} />
          <ProgressBar fraction={0.8} tone="partial" floor={0.9} label="חלקי עם רצפה" valueNow={1520} valueMax={1900} />
          <ProgressBar fraction={0.3} tone="missing" label="נמוך" valueNow={50} valueMax={170} />
        </div>
      </Surface>

      <SectionHeader title="Notice" />
      <Notice action={<Button variant="ghost">ייצא</Button>}>
        גיבוי: עברו <Num>12</Num> ימים מהגיבוי האחרון.
      </Notice>
      <Notice tone="info">מותניים: יום רביעי — מדידת בוקר.</Notice>
      <Notice tone="danger" icon={icons.TriangleAlert}>
        הריצה נחתכה בזמן שתוכנן.
      </Notice>

      <SectionHeader title="Toast" />
      <Toast placement="static" actionLabel="בטל" onAction={() => undefined}>
        יוגורט יווני · <Num>200</Num> ג׳ · נרשם
      </Toast>

      <SectionHeader title="Sheet" />
      <Button onClick={() => setSheet(true)}>פתח חלונית</Button>
      {sheet && (
        <Sheet title="כמות" onClose={() => setSheet(false)}>
          <Stepper label="גרמים" value={200} onChange={() => undefined} step={10} min={0} max={2000} decimals={0} />
          <Button variant="accent" block tall onClick={() => setSheet(false)}>
            רשום
          </Button>
        </Sheet>
      )}
      <Sheet title="חלונית (סטטית, לתצוגה)" onClose={() => undefined} placement="static">
        <p style={{ margin: 0 }}>ידית · כותרת · סגירה · תוכן.</p>
      </Sheet>

      <SectionHeader title="SectionHeader + ListRow" />
      <Surface>
        <SectionHeader title="שקילות אחרונות" aside="10 אחרונות" />
        <div>
          <ListRow lead={icons.Scale} title="30/10 · שישי" sub="שקילת בוקר" end={<Num className="strong">94.5</Num>} onTap={() => undefined} />
          <ListRow lead={icons.Ruler} title="מותניים · 28/10" end={<StatusChip tone="done">נמדד</StatusChip>} />
          <ListRow lead={icons.Footprints} title="צעדים · אתמול" sub="יעד 8,000" end={<Num>9,120</Num>} />
        </div>
      </Surface>

      <SectionHeader title="ScreenHeader + HeroValue + DayDots" aside="מסך היום" />
      <Surface variant="hero">
        <ScreenHeader title="יום רביעי" sub={<><Num>28/10/2026</Num> · שבוע <Num>8</Num></>} />
        <div className="stack" style={{ marginTop: 'var(--sp-4)' }}>
          <HeroValue value="94.40" unit='ק"ג' state="dim" aside={<><Num>3/7</Num><StatusChip tone="partial">חלקי</StatusChip></>} />
          <DayDots
            label="שקילות השבוע"
            days={[
              { key: 'a', letter: 'א', state: 'done', label: 'ראשון: נשקל' },
              { key: 'b', letter: 'ב', state: 'done', label: 'שני: נשקל' },
              { key: 'c', letter: 'ג', state: 'missing', label: 'שלישי: חסר' },
              { key: 'd', letter: 'ד', state: 'done', today: true, label: 'רביעי: נשקל (היום)' },
              { key: 'e', letter: 'ה', state: 'future', label: 'חמישי: עדיין לא' },
              { key: 'f', letter: 'ו', state: 'future', label: 'שישי: עדיין לא' },
              { key: 'g', letter: 'ש', state: 'future', label: 'שבת: עדיין לא' },
            ]}
          />
          <HeroValue value="94.12" unit='ק"ג' state="full" aside={<><Num>7/7</Num><StatusChip tone="done">שבוע מלא</StatusChip></>} />
        </div>
      </Surface>

      <SectionHeader title="MetricTile" aside="שניים בשורה" />
      <div className="tiles">
        <MetricTile label="מותניים" icon={icons.Ruler} value={<Num>96.5</Num>} unit='ס"מ' chip={<StatusChip tone="done">נמדד · רביעי <Num>28/10</Num></StatusChip>} sub={<>קודם <Num>97.0</Num> · <Num>21/10</Num></>} onTap={() => undefined} tapLabel="מותניים — לטופס" />
        <MetricTile label="חלבון היום" icon={icons.Utensils} value={<Num>116</Num>} unit={<Num>/ 170</Num>} bar={<ProgressBar fraction={116 / 170} tone="partial" label="חלבון מול היעד" valueNow={116} valueMax={170} />} sub={<>חסר <Num>54</Num> ג׳</>} />
        <MetricTile label="מותניים" icon={icons.Ruler} value={<Num>97.0</Num>} unit='ס"מ' dim chip={<StatusChip tone="partial">חסר — למדוד היום</StatusChip>} sub={<>אחרון <Num>21/10</Num></>} />
        <MetricTile label="מותניים" icon={icons.Ruler} value={<Num>97.0</Num>} unit='ס"מ' dim chip={<StatusChip tone="missing">הוחמץ השבוע</StatusChip>} sub={<>אחרון <Num>21/10</Num></>} />
      </div>

      <SectionHeader title="Disclosure + ProgressSegments + ChipSelect" aside="מסך האימון" />
      <ProgressSegments
        label="התקדמות האימון"
        items={[
          { key: '1', state: 'done', label: 'לג-פרס — נרשם' },
          { key: '2', state: 'done', label: 'בנץ׳ — נרשם' },
          { key: '3', state: 'current', label: 'פולי עליון — במוקד' },
          { key: '4', state: 'pending', label: 'פשיטת ברכיים — ממתין' },
          { key: '5', state: 'upcoming', label: 'כפיפת ברכיים — עוד לא' },
          { key: '6', state: 'upcoming', label: 'סיום' },
        ]}
      />
      <Surface as="div" className="surface--row">
        <Disclosure lead={icons.Timer} title="חימום" summary="אופניים · 10 דק׳ · לא נרשם">
          <p className="small" style={{ margin: 0 }}>
            תוכן השורה נפתח כאן.
          </p>
        </Disclosure>
      </Surface>
      <div className="stack--tight">
        <ChipSelect<number> label="חזרות ברזרבה בסט האחרון" options={[0, 1, 2, 3].map((v) => ({ value: v, label: String(v) })).concat({ value: 4, label: '4+' })} value={2} onChange={() => undefined} />
        <ChipSelect<number> label="כאב ברך" options={Array.from({ length: 11 }, (_, v) => ({ value: v, label: String(v) }))} value={null} onChange={() => undefined} columns={6} />
      </div>

      <SectionHeader title="אייקונים" aside="Lucide · קו 2" />
      <div className="kit__icons">
        {iconEntries.map(([name, I]) => (
          <div key={name} className="kit__icon">
            <Icon icon={I} />
            <span>{name}</span>
          </div>
        ))}
      </div>

      <SectionHeader title="TabBar" />
      <p className="tiny muted" style={{ margin: 0 }}>
        הניווט למטה הוא הרכיב עצמו (קבוע לתחתית המסך).
      </p>
      <TabBar<KitTab>
        tabs={[
          { id: 'weight', label: 'משקל', icon: icons.Scale },
          { id: 'nutrition', label: 'תזונה', icon: icons.Utensils },
          { id: 'workout', label: 'אימונים', icon: icons.Dumbbell },
          { id: 'checkin', label: "צ'ק-אין", icon: icons.ClipboardCheck, dot: true },
          { id: 'data', label: 'נתונים', icon: icons.Database },
        ]}
        selected={tab}
        onSelect={setTab}
        navLabel="ניווט (ערכה)"
        listLabel="מסכים"
        panelId={(id) => `kit-panel-${id}`}
        tabId={(id) => `kit-tab-${id}`}
      />
    </div>
  );
}
