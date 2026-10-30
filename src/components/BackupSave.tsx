import { useMemo, useState } from 'react';
import type { DB } from '../types';
import { verifyBackup } from '../lib/backup';
import { canShareFile, downloadText, shareTextFile } from '../platform/download';

type Props = {
  /** ה-JSON המלא, כפי שייכתב לקובץ. */
  json: string;
  /** בסיס הנתונים שממנו נוצר — לאימות הקובץ אחרי היצירה. */
  db: DB;
  filename: string;
  primary?: boolean | undefined;
  /** נקרא רק אחרי שהקובץ נוצר **ועבר אימות** — זה מה שמעדכן את "גיבוי אחרון". */
  onBackedUp: () => void;
};

type Status =
  | { kind: 'ok'; records: number; how: 'download' | 'share' }
  | { kind: 'error'; problems: string[] }
  | { kind: 'cancelled' };

/**
 * שמירת גיבוי כקובץ (שלב 0 — אמינות גיבוי): הורדה, ושיתוף כשהדפדפן תומך
 * (ב-iOS גיליון השיתוף מציע "שמור בקבצים"). אחרי יצירת הקובץ ולפני הודעת
 * ההצלחה הטקסט נקרא חזרה דרך הפרסר של הייבוא ומספר הרשומות בכל מפתח
 * מושווה למסד — רק גיבוי שעבר נרשם כ"גיבוי אחרון".
 */
export default function BackupSave({ json, db, filename, primary, onBackedUp }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const shareable = useMemo(() => canShareFile(filename, json), [filename, json]);

  const verified = (how: 'download' | 'share') => {
    const v = verifyBackup(json, db);
    if (v.ok) {
      onBackedUp();
      setStatus({ kind: 'ok', records: v.records, how });
    } else {
      setStatus({ kind: 'error', problems: v.problems });
    }
  };

  const download = () => {
    if (!downloadText(filename, json)) {
      setStatus({ kind: 'error', problems: ['ההורדה נחסמה. נסה "שתף קובץ" או "העתק JSON מלא".'] });
      return;
    }
    verified('download');
  };

  const share = async () => {
    const r = await shareTextFile(filename, json);
    if (r === 'shared') verified('share');
    else if (r === 'cancelled') setStatus({ kind: 'cancelled' });
    else setStatus({ kind: 'error', problems: ['השיתוף נכשל. נסה "הורד קובץ גיבוי".'] });
  };

  return (
    <div className="stack--tight">
      <div className="row">
        <button type="button" className={`btn btn--block${primary ? ' btn--primary' : ''}`} onClick={download}>
          הורד קובץ גיבוי
        </button>
        {shareable && (
          <button type="button" className="btn" onClick={() => void share()}>
            שתף קובץ
          </button>
        )}
      </div>
      {status?.kind === 'ok' && (
        <p className="tiny backup-save__ok" role="status" style={{ margin: 0 }}>
          {status.how === 'share' ? 'הקובץ שותף' : 'הקובץ ירד'} ואומת: <span className="num">{status.records}</span> רשומות, כמו במכשיר.
        </p>
      )}
      {status?.kind === 'cancelled' && (
        <p className="tiny muted" role="status" style={{ margin: 0 }}>
          השיתוף בוטל — לא נרשם כגיבוי.
        </p>
      )}
      {status?.kind === 'error' && (
        <div className="banner banner--error stack--tight" role="alert">
          <p className="strong" style={{ margin: 0 }}>
            הגיבוי לא אומת — אל תסמוך עליו. "גיבוי אחרון" לא עודכן.
          </p>
          {status.problems.map((p) => (
            <p key={p} style={{ margin: 0 }}>
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
