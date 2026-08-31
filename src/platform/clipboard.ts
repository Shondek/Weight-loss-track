/**
 * העתקה ללוח. לא מודול טהור — נוגע ב-DOM, ולכן יושב מחוץ ל-src/lib.
 *
 * navigator.clipboard נכשל בשקט בחלק מגרסאות iOS (הקשר לא מאובטח, או
 * קריאה שלא ישירות מתוך מחווה של המשתמש). לכן יש נפילה ל-execCommand,
 * ואם גם היא נכשלת מחזירים false והממשק מציג טקסט מסומן להעתקה ידנית.
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ממשיכים לנפילה */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** מסמן את כל הטקסט בשדה, כדי שהעתקה ידנית תהיה לחיצה אחת. */
export function selectAll(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.focus();
  el.select();
  el.setSelectionRange(0, el.value.length);
}
