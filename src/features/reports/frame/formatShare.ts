import type { Language } from '@/shared/i18n'

/** A share of a total, a percentage to one decimal as the API sends it, written the locale's way: `62.5%`, `62,5%`. */
export function formatShare(share: number | string, locale: Language): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'percent', maximumFractionDigits: 1 }).format(Number(share))
}

/** A change as a percentage of what it changed from, as the API sends it, with its sign: `+12.5%`, `-100%`. */
export function formatChangePercent(percent: number | string, locale: Language): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(Number(percent))
}
