/** הורדת קובץ. נוגע ב-DOM, ולכן מחוץ ל-src/lib. */

export function downloadText(filename: string, text: string, mime = 'application/json'): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // מרווח קצר לפני שחרור, אחרת ספארי מבטל את ההורדה
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    fr.readAsText(file);
  });
}

/**
 * שיתוף קובץ דרך Web Share (iOS: גיליון השיתוף → "שמור בקבצים"). ב-PWA
 * שמותקן במסך הבית ב-iOS, `a[download]` לא תמיד מציע שמירה, ולכן זו דרך
 * שנייה לקבל קובץ ולא רק לוח. `canShareFile` אומר אם הכפתור בכלל מוצג.
 */
export function canShareFile(filename: string, text: string, mime = 'application/json'): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    const file = new File([text], filename, { type: mime });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed';

export async function shareTextFile(filename: string, text: string, mime = 'application/json'): Promise<ShareResult> {
  try {
    const file = new File([text], filename, { type: mime });
    await navigator.share({ files: [file], title: filename });
    return 'shared';
  } catch (err) {
    // המשתמש סגר את הגיליון — לא שגיאה, אבל גם לא גיבוי.
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}
