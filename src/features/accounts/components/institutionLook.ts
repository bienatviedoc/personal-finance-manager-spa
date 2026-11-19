import type { ParseKeys } from 'i18next'
import { Building2, Coins, CreditCard, Landmark, PiggyBank, Smartphone, Wallet, type LucideIcon } from 'lucide-react'

/** The logos an institution can have: generic marks, matching the logo keys the API accepts. */
export const logos: { key: string; label: ParseKeys; Icon: LucideIcon }[] = [
  { key: 'bank', label: 'institutions.logos.bank', Icon: Landmark },
  { key: 'building', label: 'institutions.logos.building', Icon: Building2 },
  { key: 'wallet', label: 'institutions.logos.wallet', Icon: Wallet },
  { key: 'card', label: 'institutions.logos.card', Icon: CreditCard },
  { key: 'piggy-bank', label: 'institutions.logos.piggyBank', Icon: PiggyBank },
  { key: 'coins', label: 'institutions.logos.coins', Icon: Coins },
  { key: 'smartphone', label: 'institutions.logos.smartphone', Icon: Smartphone },
]

/** The colours offered for an institution. The API takes any #rrggbb; these are the ones the form offers. */
export const colors: { value: string; label: ParseKeys }[] = [
  { value: '#dc2626', label: 'institutions.colors.red' },
  { value: '#ea580c', label: 'institutions.colors.orange' },
  { value: '#ca8a04', label: 'institutions.colors.yellow' },
  { value: '#16a34a', label: 'institutions.colors.green' },
  { value: '#0d9488', label: 'institutions.colors.teal' },
  { value: '#2563eb', label: 'institutions.colors.blue' },
  { value: '#9333ea', label: 'institutions.colors.purple' },
  { value: '#db2777', label: 'institutions.colors.pink' },
]
