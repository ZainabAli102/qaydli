import {
  Package,
  Armchair,
  Cpu,
  Boxes,
  Home,
  Users,
  Zap,
  Fuel,
  Truck,
  UtensilsCrossed,
  Megaphone,
  Laptop,
  Briefcase,
  CreditCard,
  Landmark,
  Wrench,
  Stethoscope,
  CircleDot,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '@/lib/domain';

// One lucide icon + colour per category. The circle behind uses the colour at
// low opacity; the glyph uses the colour itself.
export const CATEGORY_ICONS: Record<Category, { Icon: LucideIcon; color: string }> = {
  supplies: { Icon: Package, color: '#0ea5e9' },
  furniture: { Icon: Armchair, color: '#a855f7' },
  equipment_assets: { Icon: Cpu, color: '#6366f1' },
  inventory: { Icon: Boxes, color: '#f59e0b' },
  rent: { Icon: Home, color: '#ef4444' },
  salaries: { Icon: Users, color: '#10b981' },
  utilities: { Icon: Zap, color: '#eab308' },
  fuel: { Icon: Fuel, color: '#f97316' },
  transport: { Icon: Truck, color: '#14b8a6' },
  food_hospitality: { Icon: UtensilsCrossed, color: '#f43f5e' },
  marketing: { Icon: Megaphone, color: '#ec4899' },
  software_subscriptions: { Icon: Laptop, color: '#3b82f6' },
  professional_services: { Icon: Briefcase, color: '#8b5cf6' },
  bank_fees: { Icon: CreditCard, color: '#64748b' },
  taxes_gov_fees: { Icon: Landmark, color: '#0891b2' },
  maintenance: { Icon: Wrench, color: '#78716c' },
  medical_personal: { Icon: Stethoscope, color: '#22c55e' },
  other: { Icon: CircleDot, color: '#94a3b8' },
};

// Income slugs that aren't expense Categories (e.g. invoice sales) still get a
// distinct glyph instead of the generic fallback.
const EXTRA_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  sales: { Icon: Banknote, color: '#16a34a' },
};

/** A category glyph inside a small colored circle, for list rows. */
export function CategoryIcon({
  category,
  size = 20,
}: {
  category: string | null | undefined;
  size?: number;
}) {
  const { Icon, color } =
    (category ? EXTRA_ICONS[category] : undefined) ??
    CATEGORY_ICONS[(category as Category) ?? 'other'] ??
    CATEGORY_ICONS.other;
  const box = size + 14;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: box, height: box, backgroundColor: `${color}22` }}
      aria-hidden
    >
      <Icon size={size} color={color} strokeWidth={2} />
    </span>
  );
}
