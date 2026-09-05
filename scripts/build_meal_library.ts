/**
 * בונה את קובץ הייבוא של ספריית המנות v2:
 *
 *   node scripts/build_meal_library.ts [--out library/meal-library-v2.json]
 *
 * הפלט הוא קובץ בפורמט הגיבוי של האפליקציה (v: 2, רק customFoods), שנטען
 * דרך מסך "נתונים" → ייבוא → מיזוג. לא חלק מה-build ולא נטען אוטומטית.
 * מזהים דטרמיניסטיים: ייבוא חוזר מעדכן, לא משכפל.
 *
 * מדפיס טבלת אימות: לכל מנה ובלוק, קק"ל וחלבון שחושבו מול המסמך.
 * פער מעל 5% מסומן. לא מתקן — מראה.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MohFoodFile } from '../src/lib/nutrition/foodDb.ts';
import { buildFoodIndex, resolveFood } from '../src/lib/nutrition/index.ts';
import type { Food } from '../src/lib/nutrition/foods.ts';
import { BLOCKS, buildMealLibrary, DISHES, libId } from './meal-library-v2.ts';

/** אותה נוסחה כמו entryNutrition: ל-100 ג' × גרמים / 100. */
const scaled = (f: Food, grams: number) => ({ kcal: (f.kcal * grams) / 100, protein: (f.protein * grams) / 100 });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOH_PATH = join(ROOT, 'public', 'nutrition', 'moh-foods.json');
const DEFAULT_OUT = join(ROOT, 'library', 'meal-library-v2.json');
const FLAG_PCT = 5;

const outArg = process.argv.indexOf('--out');
const out = outArg !== -1 ? (process.argv[outArg + 1] ?? DEFAULT_OUT) : DEFAULT_OUT;

const moh = JSON.parse(readFileSync(MOH_PATH, 'utf8')) as MohFoodFile;
const mohIndex = buildFoodIndex(moh.foods, []);
const foods = buildMealLibrary(mohIndex);
const index = buildFoodIndex(moh.foods, foods);

// ---------- כתיבה ----------

const file = {
  v: 2,
  exported: '2026-09-05T00:00:00.000Z', // קבוע — הקובץ דטרמיניסטי
  source: 'meal-library-v2.md · scripts/build_meal_library.ts',
  customFoods: foods,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
console.log(`נכתב ${out}: ${foods.length} מזונות (${foods.filter((f) => f.recipe).length} מנות)\n`);

// ---------- אימות ----------

const pct = (calc: number, doc: number) => (doc === 0 ? 0 : ((calc - doc) / doc) * 100);
const fmt = (n: number) => (Math.abs(n) < 0.05 ? '0' : n.toFixed(1));
const flag = (a: number, b: number) => (Math.abs(a) > FLAG_PCT || Math.abs(b) > FLAG_PCT ? ' 🚩' : '');

console.log('מנה                                    | מחושב kcal/P    | מסמך kcal/P   | פער kcal / P');
console.log('---------------------------------------|-----------------|---------------|----------------');
for (const d of DISHES) {
  const food = resolveFood(index, libId(d.slug));
  if (!food) throw new Error(`${d.name} לא נבנתה`);
  const grams = d.items.reduce((n, i) => n + i.grams, 0); // המנה כולה כפי שהוגדרה
  const n = scaled(food, grams);
  const pk = pct(n.kcal, d.doc.kcal);
  const pp = pct(n.protein, d.doc.protein);
  console.log(
    `${d.name.padEnd(38)} | ${fmt(n.kcal).padStart(6)} / ${fmt(n.protein).padStart(5)} | ${String(d.doc.kcal).padStart(5)} / ${String(d.doc.protein).padStart(4)} | ${fmt(pk).padStart(6)}% / ${fmt(pp).padStart(6)}%${flag(pk, pp)}`,
  );
}
console.log('\nבלוק                                   | מחושב kcal/P    | מסמך kcal/P   | פער kcal / P');
console.log('---------------------------------------|-----------------|---------------|----------------');
for (const b of BLOCKS) {
  const food = resolveFood(index, b.foodId);
  if (!food) throw new Error(`${b.label}: ${b.foodId} לא נמצא`);
  const n = scaled(food, b.grams);
  const pk = pct(n.kcal, b.doc.kcal);
  const pp = pct(n.protein, b.doc.protein);
  console.log(
    `${b.label.padEnd(38)} | ${fmt(n.kcal).padStart(6)} / ${fmt(n.protein).padStart(5)} | ${String(b.doc.kcal).padStart(5)} / ${String(b.doc.protein).padStart(4)} | ${fmt(pk).padStart(6)}% / ${fmt(pp).padStart(6)}%${flag(pk, pp)}`,
  );
}

console.log('\nפירוט מרכיבים למנות עם דגל:');
for (const d of DISHES) {
  const food = resolveFood(index, libId(d.slug))!;
  const grams = d.items.reduce((n, i) => n + i.grams, 0);
  const n = scaled(food, grams);
  if (Math.abs(pct(n.kcal, d.doc.kcal)) <= FLAG_PCT && Math.abs(pct(n.protein, d.doc.protein)) <= FLAG_PCT) continue;
  console.log(`\n  ${d.name}`);
  for (const i of d.items) {
    const f = resolveFood(index, i.foodId)!;
    const k = i.grams / 100;
    console.log(`    ${f.name.slice(0, 44).padEnd(44)} ${String(i.grams).padStart(7)} ג'  ${fmt(f.kcal * k).padStart(6)} kcal  ${fmt(f.protein * k).padStart(5)} P${f.source === 'custom' ? '  (שלי)' : ''}`);
  }
}
