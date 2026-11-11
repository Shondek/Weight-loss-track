/**
 * טיימר צף (ניסיוני): הטיימר בחלון picture-in-picture, כדי לראות אותו גם
 * מחוץ לאפליקציה. canvas → captureStream → video → requestPictureInPicture.
 *
 * למה כך: ל-PWA אין חלון צף משלו. חלון ה-PiP של וידאו הוא החלון היחיד
 * שהמערכת מרשה להשאיר מעל אפליקציות אחרות, ולכן מציירים את הטיימר על
 * canvas ומזרימים אותו כווידאו שקט.
 *
 * מה חשוב לדעת:
 *  - הפתיחה דורשת נגיעה של המשתמש. לא נפתח לבד ביציאה מהאפליקציה.
 *  - זיהוי יכולת בלבד (`floatingSupported`). בלי תמיכה הכפתור לא מוצג.
 *  - הווידאו מוכן מראש (`prepare`) ברגע שיש טיימר, כדי שהנגיעה תפתח את
 *    החלון מיד — `requestPictureInPicture` נכשל אם הווידאו עוד לא נטען.
 *  - כשהדף ברקע הדפדפן מאט את הטיימרים של הדף. לכן, כל עוד החלון פתוח,
 *    הפעימה מגיעה מ-Web Worker (שלא מואט), והציור מחושב מזמן הסיום — לא
 *    נספר. אם ה-Worker לא זמין — setInterval רגיל.
 *  - אין מפתח אחסון ואין נתון: הכול בזיכרון, ונעלם כשהחלון נסגר.
 */

import { floatingContent, type FloatingContent, type TimerCore } from './timerCore';

export type FloatingModel = { core: TimerCore; next: string };

type PipVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

const W = 480;
const H = 270;
const BEAT_MS = 500;

/** האם הדפדפן יודע להציג canvas כווידאו בחלון צף. בדיקת יכולת בלבד. */
export function floatingSupported(): boolean {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return false;
  try {
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;
    const v = document.createElement('video') as PipVideo;
    const standard = document.pictureInPictureEnabled === true && typeof v.requestPictureInPicture === 'function';
    const webkit =
      typeof v.webkitSupportsPresentationMode === 'function' &&
      typeof v.webkitSetPresentationMode === 'function' &&
      v.webkitSupportsPresentationMode('picture-in-picture');
    return standard || webkit;
  } catch {
    return false;
  }
}

function token(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** מקצר טקסט עם "…" עד שהוא נכנס לרוחב. */
function fit(g: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (g.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && g.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** מצייר את תוכן החלון. גופנים גדולים: החלון עצמו קטן (כ-240 נקודות רוחב). */
export function drawFloating(g: CanvasRenderingContext2D, c: FloatingContent): void {
  const bg = token('--surface-1', '#161614');
  const primary = token('--text-primary', '#f3efe6');
  const secondary = token('--text-secondary', '#c2bdb1');
  const accent = token('--accent', '#8fb9d8');
  const done = token('--status-done', '#a9c99a');
  const track = token('--surface-3', '#2a2a26');
  const font = token('--font', "'Rubik', system-ui, sans-serif");

  g.save();
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  g.fillStyle = c.tone === 'finished' ? done : secondary;
  g.font = `500 34px ${font}`;
  g.fillText(fit(g, c.title, W - 40), W / 2, c.big ? 44 : H / 2 - 24);

  if (c.big) {
    g.direction = 'ltr';
    g.fillStyle = c.tone === 'paused' ? secondary : primary;
    g.font = `300 132px ${font}`;
    g.fillText(c.big, W / 2, 138);
    g.direction = 'rtl';
  }

  if (c.sub) {
    g.fillStyle = secondary;
    g.font = `400 30px ${font}`;
    g.fillText(fit(g, c.sub, W - 40), W / 2, c.big ? 228 : H / 2 + 28);
  }

  // פס התקדמות בתחתית: כמה נשאר.
  g.fillStyle = track;
  g.fillRect(0, H - 10, W, 10);
  if (c.fraction > 0) {
    g.fillStyle = accent;
    // RTL: הפס מתרוקן לכיוון ימין, כמו בפס הטיימר במסך.
    g.fillRect(W - W * c.fraction, H - 10, W * c.fraction, 10);
  }
  g.restore();
}

type Listener = (open: boolean) => void;

class FloatingTimer {
  private canvas: HTMLCanvasElement | null = null;
  private video: PipVideo | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private interval: number | null = null;
  private getModel: (() => FloatingModel) | null = null;
  private onBeat: (() => void) | null = null;
  private opened = false;
  private listeners = new Set<Listener>();

  get isOpen(): boolean {
    return this.opened;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setOpen(open: boolean): void {
    if (this.opened === open) return;
    this.opened = open;
    if (open) this.startBeat();
    else this.stopBeat();
    for (const fn of this.listeners) fn(open);
  }

  private draw = (): void => {
    const g = this.canvas?.getContext('2d');
    if (!g || !this.getModel) return;
    const m = this.getModel();
    drawFloating(g, floatingContent(m.core, m.next, Date.now()));
  };

  private beat = (): void => {
    // קודם מסנכרנים את הטיימר (זיהוי סיום וצליל גם כשהדף ברקע), ואז מציירים.
    this.onBeat?.();
    this.draw();
    // הווידאו נעצר לפעמים כשהדף יורד לרקע — ממשיכים לנגן כדי שהחלון לא יקפא.
    const v = this.video;
    if (v && v.paused) void v.play().catch(() => undefined);
  };

  private startBeat(): void {
    this.stopBeat();
    try {
      const src = `let i=setInterval(()=>postMessage(0),${BEAT_MS});onmessage=()=>{clearInterval(i);close()}`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = this.beat;
      w.onerror = () => {
        // ה-Worker נחסם (מדיניות אבטחה) — נופלים לאינטרוול רגיל.
        this.worker = null;
        if (this.opened && this.interval === null) this.interval = window.setInterval(this.beat, BEAT_MS);
      };
      this.worker = w;
    } catch {
      this.interval = window.setInterval(this.beat, BEAT_MS);
    }
  }

  private stopBeat(): void {
    if (this.worker) {
      try {
        this.worker.postMessage(0);
        this.worker.terminate();
      } catch {
        /* כבר נסגר */
      }
      this.worker = null;
    }
    if (this.interval !== null) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * מכין את ה-canvas ואת הווידאו מראש. נקרא כשיש טיימר במסך, לפני שהמשתמש
   * נוגע בכפתור — כך שהנגיעה עצמה רק מבקשת את החלון.
   */
  prepare(getModel: () => FloatingModel, onBeat: () => void): void {
    this.getModel = getModel;
    this.onBeat = onBeat;
    if (this.video || !floatingSupported()) {
      this.draw();
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      this.canvas = canvas;
      this.draw();
      const stream = canvas.captureStream(10);
      const video = document.createElement('video') as PipVideo;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute('aria-hidden', 'true');
      video.tabIndex = -1;
      // לא display:none — חלק מהדפדפנים מסרבים לפתוח PiP לווידאו שאינו מוצג.
      video.style.cssText = 'position:fixed;bottom:0;inset-inline-start:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
      video.srcObject = stream;
      video.addEventListener('enterpictureinpicture', () => this.setOpen(true));
      video.addEventListener('leavepictureinpicture', () => this.setOpen(false));
      video.addEventListener('webkitpresentationmodechanged', () => this.setOpen(video.webkitPresentationMode === 'picture-in-picture'));
      document.body.appendChild(video);
      this.stream = stream;
      this.video = video;
      void video.play().catch(() => undefined);
      // פריים נוסף אחרי שהזרם התחיל — כדי שלווידאו יהיו מידות (metadata).
      window.setTimeout(this.draw, 60);
    } catch {
      this.dispose();
    }
  }

  /** פותח את החלון הצף. חייב להיקרא מתוך נגיעה של המשתמש. */
  async open(): Promise<boolean> {
    const v = this.video;
    if (!v) return false;
    try {
      this.draw();
      if (v.paused) void v.play().catch(() => undefined);
      if (typeof v.requestPictureInPicture === 'function' && document.pictureInPictureEnabled) {
        if (v.readyState < 1) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            v.addEventListener('loadedmetadata', done, { once: true });
            window.setTimeout(done, 800);
          });
        }
        await v.requestPictureInPicture();
        this.setOpen(true);
        return true;
      }
      if (typeof v.webkitSetPresentationMode === 'function') {
        v.webkitSetPresentationMode('picture-in-picture');
        this.setOpen(v.webkitPresentationMode === 'picture-in-picture');
        return this.opened;
      }
    } catch {
      /* הדפדפן סירב (אין נגיעה, אין תמיכה בזרם canvas) */
    }
    this.setOpen(false);
    return false;
  }

  close(): void {
    const v = this.video;
    try {
      if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
        void document.exitPictureInPicture().catch(() => undefined);
      } else if (v && v.webkitPresentationMode === 'picture-in-picture') {
        v.webkitSetPresentationMode?.('inline');
      }
    } catch {
      /* כבר סגור */
    }
    this.setOpen(false);
  }

  /** משחרר הכול: הזרם, הווידאו והפעימה. נקרא כשאין טיימר והחלון סגור. */
  dispose(): void {
    if (this.opened) return;
    this.stopBeat();
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.video?.remove();
    } catch {
      /* לא קריטי */
    }
    this.stream = null;
    this.video = null;
    this.canvas = null;
  }
}

/** מופע אחד לכל האפליקציה — יש חלון צף אחד לכל היותר. */
export const floatingTimer = new FloatingTimer();
