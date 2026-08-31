/**
 * מייצר את אייקוני ה-PWA. מריצים ידנית: `node scripts/make-icons.mjs`.
 * בלי תלויות — קידוד PNG מינימלי מעל zlib של Node.
 *
 * הסימן: קו מגמה יורד מימין לשמאל (כיוון הזמן ב-RTL). בלי גרדיאנטים
 * ובלי צבע — אותה פלטה של האפליקציה.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const PAPER = [0xfa, 0xf9, 0xf7];
const INK = [0x16, 0x15, 0x0f];

// נקודות הקו במרחב [0,1] של תיבת התוכן. x=1 הוא ימין (הנקודה המוקדמת ב-RTL).
const POINTS = [
  [1.0, 0.24],
  [0.75, 0.4],
  [0.5, 0.35],
  [0.25, 0.6],
  [0.0, 0.72],
];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgb: Uint8Array באורך w*h*3 */
function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * @param size גודל התמונה בפיקסלים
 * @param inset שיעור השוליים סביב הסימן (0.5 עבור maskable, 0.22 רגיל)
 */
function render(size, inset) {
  const rgb = new Uint8Array(size * size * 3);
  const pad = size * inset;
  const box = size - pad * 2;
  const pts = POINTS.map(([x, y]) => [pad + x * box, pad + y * box]);
  const halfW = size * 0.052;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dd = distToSegment(px, py, a[0], a[1], b[0], b[1]);
        if (dd < d) d = dd;
      }
      const cov = Math.max(0, Math.min(1, halfW + 0.5 - d));
      const o = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) {
        rgb[o + c] = Math.round(PAPER[c] * (1 - cov) + INK[c] * cov);
      }
    }
  }
  return encodePng(size, size, rgb);
}

mkdirSync(OUT, { recursive: true });

const files = [
  ['icon-192.png', 192, 0.22],
  ['icon-512.png', 512, 0.22],
  // maskable: כל התוכן בתוך 40% המרכזיים כדי לשרוד חיתוך עגול
  ['icon-maskable-512.png', 512, 0.3],
  ['apple-touch-icon.png', 180, 0.2],
];

for (const [name, size, inset] of files) {
  const png = render(size, inset);
  writeFileSync(join(OUT, name), png);
  console.log(`${name}  ${size}×${size}  ${png.length} bytes`);
}
