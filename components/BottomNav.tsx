'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';

// Phone-first bottom navigation between the two main screens.
export function BottomNav() {
  const { t } = useLocale();
  const path = usePathname();
  const items = [
    { href: '/dashboard', key: 'nav.dashboard', icon: '📊' },
    { href: '/receipts', key: 'nav.receipts', icon: '🧾' },
    { href: '/scan', key: 'nav.scan', icon: '📷' },
  ];
  return (
    <nav className="sticky bottom-0 z-10 grid grid-cols-3 border-t border-slate-200 bg-white">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + '/');
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              active ? 'text-brand' : 'text-slate-500'
            }`}
          >
            <span className="text-lg" aria-hidden>
              {it.icon}
            </span>
            {t(it.key)}
          </Link>
        );
      })}
    </nav>
  );
}
