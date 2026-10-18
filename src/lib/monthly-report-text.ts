/**
 * How the monthly report words a comparison. In words, not signs: a "+" or "−" next to a number drifts
 * to the wrong side in right-to-left text. Shared by the screen and the PDF so both read the same.
 */
import type { Change } from '@/lib/monthly-report';
import { arabicCount } from '@/lib/utils';

/** which direction is good news: more revenue is, more expense is not */
export type Polarity = 'up-is-good' | 'down-is-good';
export type Tone = 'good' | 'bad' | 'neutral';

export const pctText = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

export function changePhrase(c: Change, prevName: string, polarity: Polarity): { text: string; tone: Tone } {
  if (c.amount === 0) return { text: `مثل ${prevName}`, tone: 'neutral' };
  const up = c.amount > 0;
  const tone: Tone = up === (polarity === 'up-is-good') ? 'good' : 'bad';
  if (c.pct == null) return { text: `لا مقارنة: لا حركة في ${prevName}`, tone: 'neutral' };
  return { text: `${up ? 'أعلى' : 'أدنى'} بنسبة ${pctText(Math.abs(c.pct))} من ${prevName}`, tone };
}

/** "سبتمبر" from "سبتمبر 2026": enough to name the month before in a sentence */
export const monthName = (label: string) => label.split(' ')[0];

/** points of collection rate: "أعلى بـ 5 نقاط" */
export function ratePhrase(points: number | null, prevName: string): { text: string; tone: Tone } | null {
  if (points == null) return null;
  if (Math.abs(points) < 0.05) return { text: `مثل ${prevName}`, tone: 'neutral' };
  const abs = Math.round(Math.abs(points) * 10) / 10;
  // a whole number agrees with its noun (5 نقاط); a fraction takes the singular (71.7 نقطة)
  const unit = Number.isInteger(abs) ? arabicCount(abs, ['نقطة واحدة', 'نقطتين', 'نقاط', 'نقطة']) : `${abs} نقطة`;
  // "بـ 5 نقاط" before a numeral, "بنقطة واحدة" before a word
  const by = /^\d/.test(unit) ? 'بـ ' : 'ب';
  return { text: `${points > 0 ? 'أعلى' : 'أدنى'} ${by}${unit} من ${prevName}`, tone: points > 0 ? 'good' : 'bad' };
}
