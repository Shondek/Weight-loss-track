/**
 * פס התקדמות מול יעד. הצבע לפי אחוז מהיעד: ≥95% מלא, 75–95% חלקי,
 * פחות — חסר. `floor` — סימון רצפה (למשל 1,850 קק"ל) על הפס, כאחוז מהיעד.
 * הציור עצמו ב-src/ui/ProgressBar.tsx; כאן רק החישוב של הטון.
 */

import UiProgressBar, { type BarTone as UiTone } from '../ui/ProgressBar';

export type BarTone = 'high' | 'mid' | 'low';

export function toneOf(pct: number): BarTone {
  if (pct >= 0.95) return 'high';
  if (pct >= 0.75) return 'mid';
  return 'low';
}

const UI_TONE: Record<BarTone, UiTone> = { high: 'done', mid: 'partial', low: 'missing' };

type Props = {
  value: number;
  target: number;
  floor?: number | undefined;
  label: string;
};

export default function ProgressBar({ value, target, floor, label }: Props) {
  const pct = target > 0 ? value / target : 0;
  const floorFraction = floor !== undefined && target > 0 ? floor / target : undefined;
  return <UiProgressBar fraction={pct} tone={UI_TONE[toneOf(pct)]} floor={floorFraction} label={label} valueNow={value} valueMax={target} />;
}
