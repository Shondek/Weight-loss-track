/**
 * צילום גרף "ממוצעים שבועיים" במסך היום + אימות כיוון הזמן מתוך ה-DOM.
 *
 *   node docs/charts-rtl/tools/shoot-chart.mjs <dist> <out-png> <label> <port>
 *
 * אותה זריעה של שלב 2 (docs/ui-stage-2/tools/seed.mjs): שקילות מ-06/09/2026,
 * היום רביעי 28/10/2026. מדפיס את x של תווית התאריך הישנה והחדשה בגרף,
 * ואת x של הנקודה הראשונה והאחרונה בקו.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checks, launch, openSeeded, phone, serve, settle } from '../../ui-stage-2/tools/lib.mjs';

const [, , dist, outPng, label, portArg] = process.argv;
fs.mkdirSync(path.dirname(outPng), { recursive: true });
const server = await serve(dist, Number(portArg || 4330));
const browser = await launch();
try {
  const ctx = await phone(browser);
  const page = await openSeeded(ctx, server.url, { today: '2026-10-28', time: '08:05:00', weighToday: true });
  const section = page.locator('section', { has: page.locator('svg.chart') }).first();
  await section.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 300);
  const info = await page.evaluate(() => {
    const svg = document.querySelector('svg.chart');
    const texts = [...svg.querySelectorAll('text')].map((t) => ({ text: t.textContent.trim(), x: Math.round(+t.getAttribute('x')), anchor: t.getAttribute('text-anchor') }));
    const dates = texts.filter((t) => /^\d\d\/\d\d$/.test(t.text));
    const pts = svg.querySelector('polyline').getAttribute('points').split(' ').map((p) => +p.split(',')[0]);
    const caption = svg.parentElement.parentElement.innerText.split('\n').filter((l) => l.includes('נקודה חלולה'))[0] ?? '';
    return { width: +svg.getAttribute('width'), dates, firstPointX: Math.round(pts[0]), lastPointX: Math.round(pts[pts.length - 1]), caption };
  });
  const m = await checks(page);
  await section.screenshot({ path: outPng });
  const toDate = (s) => {
    const [d, mo] = s.split('/').map(Number);
    return mo * 100 + d;
  };
  const sorted = [...info.dates].sort((a, b) => toDate(a.text) - toDate(b.text));
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  const rtl = newest.x < oldest.x && info.lastPointX < info.firstPointX;
  console.log(JSON.stringify({ label, width: info.width, oldestLabel: oldest, newestLabel: newest, firstPointX: info.firstPointX, lastPointX: info.lastPointX, timeFlows: rtl ? 'right-to-left (old right, new left)' : 'left-to-right', caption: info.caption, hscroll: m.hscroll, smallTargets: m.smallTargets, contrastMin: m.contrastMin }, null, 1));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
