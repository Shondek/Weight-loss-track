# docs/design-directions

שלב 1א — כיוון עיצובי ופיצ'רים. תצוגות ותוכנית בלבד; אפס שינויים בקוד האפליקציה.

```
01-soft-minimalism.html   כיוון 1 · נייר — Heebo (עצמאי, offline, RTL)
02-ledger.html            כיוון 2 · פנקס — IBM Plex Sans Hebrew
03-night.html             כיוון 3 · לילה — Rubik, כהה
DIRECTIONS.md             הסבר, פלטות, ניגודיות, F02–F10, המלצה
FEATURES.md               פיצ'רי נוחות מתועדפים
FONTS-LICENSE.md          רישיונות הפונטים המוטמעים (OFL)
compare/                  השוואה לכל מסך — שלושת הכיוונים זה לצד זה
screenshots/              390×844 @2x לכל מסך בכל כיוון (+ עמוד מלא)
tools/                    סקריפט הצילום/המדידה ותוצאותיו (checks.json, contrast.json)
```

## לפתוח אב-טיפוס

כל קובץ HTML נפתח ישירות מהדיסק (`file://`) בלי שרת. ברוחב 390px הוא ממלא את המסך; במסך רחב הוא ממורכז.

מסכים לפי hash: `#today` · `#workout` · `#nutrition` · `#trend` · `#system`. מצבים לצילום: `#workout-timer` (סט רשום + טיימר רץ), `#nutrition-sheet` (חלונית כמות פתוחה), `#today-closed` (יום סגור).

## לצלם מחדש

```bash
# דורש Playwright מותקן גלובלית (בסביבת הענן: /opt/node-tools/node_modules/playwright)
PW_PATH=/opt/node-tools/node_modules/playwright node docs/design-directions/tools/shoot.mjs docs/design-directions /tmp/shots --full
PW_PATH=/opt/node-tools/node_modules/playwright node docs/design-directions/tools/compose.mjs /tmp/shots /tmp/compare
```

`shoot.mjs` גם מודד: `direction`, גלילה אופקית, טעינת הפונט, ואזורי מגע מתחת ל-40px — ושומר `checks.json`.
