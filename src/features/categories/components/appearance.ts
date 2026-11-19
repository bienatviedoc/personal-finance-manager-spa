import type { ParseKeys } from 'i18next'
import {
  Award, Baby, BookOpen, Briefcase, Bus, Car, CarTaxiFront, ChartPie, CircleParking, Clapperboard, Coffee, Droplet,
  Dumbbell, Ellipsis, FileText, Fuel, Gamepad2, Gift, GraduationCap, HeartHandshake, HeartPulse, House, KeyRound,
  Landmark, Music, PawPrint, PiggyBank, Pill, Pizza, Plane, Receipt, Repeat, School, Shield, Shirt, ShoppingBag,
  ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Tag, Ticket, TrendingUp, Users, Utensils, Wallet, Wifi, Zap,
  type LucideIcon,
} from 'lucide-react'

export type CategoryIcon = { key: string; Icon: LucideIcon; label: ParseKeys }

/** The icons a category can have, by the key the API stores. Covers every icon in the default set. */
export const categoryIcons: CategoryIcon[] = [
  { key: 'utensils', Icon: Utensils, label: 'categories.icons.utensils' },
  { key: 'shopping-cart', Icon: ShoppingCart, label: 'categories.icons.shoppingCart' },
  { key: 'coffee', Icon: Coffee, label: 'categories.icons.coffee' },
  { key: 'pizza', Icon: Pizza, label: 'categories.icons.pizza' },
  { key: 'car', Icon: Car, label: 'categories.icons.car' },
  { key: 'fuel', Icon: Fuel, label: 'categories.icons.fuel' },
  { key: 'circle-parking', Icon: CircleParking, label: 'categories.icons.parking' },
  { key: 'car-taxi-front', Icon: CarTaxiFront, label: 'categories.icons.taxi' },
  { key: 'bus', Icon: Bus, label: 'categories.icons.bus' },
  { key: 'plane', Icon: Plane, label: 'categories.icons.plane' },
  { key: 'house', Icon: House, label: 'categories.icons.house' },
  { key: 'key-round', Icon: KeyRound, label: 'categories.icons.key' },
  { key: 'zap', Icon: Zap, label: 'categories.icons.lightning' },
  { key: 'droplet', Icon: Droplet, label: 'categories.icons.waterDrop' },
  { key: 'wifi', Icon: Wifi, label: 'categories.icons.wifi' },
  { key: 'shopping-bag', Icon: ShoppingBag, label: 'categories.icons.shoppingBag' },
  { key: 'shirt', Icon: Shirt, label: 'categories.icons.shirt' },
  { key: 'smartphone', Icon: Smartphone, label: 'categories.icons.phone' },
  { key: 'sofa', Icon: Sofa, label: 'categories.icons.sofa' },
  { key: 'heart-pulse', Icon: HeartPulse, label: 'categories.icons.heartbeat' },
  { key: 'stethoscope', Icon: Stethoscope, label: 'categories.icons.stethoscope' },
  { key: 'pill', Icon: Pill, label: 'categories.icons.pill' },
  { key: 'shield', Icon: Shield, label: 'categories.icons.shield' },
  { key: 'dumbbell', Icon: Dumbbell, label: 'categories.icons.dumbbell' },
  { key: 'clapperboard', Icon: Clapperboard, label: 'categories.icons.clapperboard' },
  { key: 'ticket', Icon: Ticket, label: 'categories.icons.ticket' },
  { key: 'repeat', Icon: Repeat, label: 'categories.icons.repeat' },
  { key: 'music', Icon: Music, label: 'categories.icons.music' },
  { key: 'gamepad-2', Icon: Gamepad2, label: 'categories.icons.gameController' },
  { key: 'graduation-cap', Icon: GraduationCap, label: 'categories.icons.graduationCap' },
  { key: 'school', Icon: School, label: 'categories.icons.school' },
  { key: 'book-open', Icon: BookOpen, label: 'categories.icons.book' },
  { key: 'users', Icon: Users, label: 'categories.icons.people' },
  { key: 'baby', Icon: Baby, label: 'categories.icons.baby' },
  { key: 'heart-handshake', Icon: HeartHandshake, label: 'categories.icons.helpingHand' },
  { key: 'paw-print', Icon: PawPrint, label: 'categories.icons.pawPrint' },
  { key: 'gift', Icon: Gift, label: 'categories.icons.gift' },
  { key: 'sparkles', Icon: Sparkles, label: 'categories.icons.sparkles' },
  { key: 'receipt', Icon: Receipt, label: 'categories.icons.receipt' },
  { key: 'landmark', Icon: Landmark, label: 'categories.icons.bank' },
  { key: 'file-text', Icon: FileText, label: 'categories.icons.document' },
  { key: 'wallet', Icon: Wallet, label: 'categories.icons.wallet' },
  { key: 'award', Icon: Award, label: 'categories.icons.award' },
  { key: 'briefcase', Icon: Briefcase, label: 'categories.icons.briefcase' },
  { key: 'trending-up', Icon: TrendingUp, label: 'categories.icons.risingChart' },
  { key: 'piggy-bank', Icon: PiggyBank, label: 'categories.icons.piggyBank' },
  { key: 'chart-pie', Icon: ChartPie, label: 'categories.icons.pieChart' },
  { key: 'tag', Icon: Tag, label: 'categories.icons.tag' },
  { key: 'ellipsis', Icon: Ellipsis, label: 'categories.icons.more' },
]

/** The icon for a key; a plain tag for a key this app version does not know. */
export function iconFor(key: string): LucideIcon {
  return categoryIcons.find((icon) => icon.key === key)?.Icon ?? Tag
}
