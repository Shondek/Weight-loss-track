# פונטים מוטמעים באב-הטיפוס

כל הפונטים מוטמעים כ-base64 בתוך קובצי ה-HTML (תתי-קבוצות hebrew + latin, WOFF2) כדי שהקבצים יעבדו offline מ-`file://`. כולם ברישיון **SIL Open Font License 1.1**.

| פונט | כיוון | מקור | משקלים | רישיון |
|---|---|---|---|---|
| Heebo | 1 · נייר | `src/fonts/heebo-*.woff2` (כבר בריפו, `src/fonts/LICENSE.txt`) | variable 100–900 | OFL 1.1 |
| IBM Plex Sans Hebrew | 2 · פנקס | Google Fonts (IBM) | 300, 400, 500, 600 | OFL 1.1 |
| Rubik | 3 · לילה | Google Fonts (Hubert & Fischer, Meir Sadan, Cyreal) | variable 300–900 | OFL 1.1 |

אייקונים: Lucide (ISC License), path data מוטמע ב-JS של כל קובץ.

אם ייבחר כיוון 2 או 3, קובצי הפונט יתווספו ל-`src/fonts/` עם קובץ הרישיון שלהם, באותו מנגנון `@font-face` + `unicode-range` שכבר משמש את Heebo. באב-הטיפוס הם לא נוספו ל-`src/`.
