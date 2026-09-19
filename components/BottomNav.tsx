'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BarChart3, Images, ScanLine, type LucideIcon } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';

// Phone-first bottom navigation. Active item is brand teal on a soft pill;
// inactive items are muted.
export function BottomNav() {
  const { t } = useLocale();
  const path = usePathname();
  const items: Array<{ href: string; key: string; Icon: LucideIcon }> = [
    { href: '/dashboard', key: 'nav.dashboard', Icon: LayoutDashboard },
    { href: '/insights', key: 'nav.insights', Icon: BarChart3 },
    { href: '/receipts', key: 'nav.receipts', Icon: Images },
    { href: '/scan', key: 'nav.scan', Icon: ScanLine },
  ];
  return (
    <nav className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-slate-200 bg-white">
      {items.map(({ href, key, Icon }) => {
        const active = path === href || path.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium ${
              active ? 'text-brand' : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-9 w-14 items-center justify-center rounded-full ${
                active ? 'bg-brand/10' : ''
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.4 : 2} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
            </span>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
