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
