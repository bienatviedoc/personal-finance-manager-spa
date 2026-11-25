import type { Language } from '@/shared/i18n'

/** A change as a percentage of what it changed from, as the API sends it, with its sign: `+12.5%`, `-100%`. */
export function formatChangePercent(percent: number | string, locale: Language): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(Number(percent))
}
