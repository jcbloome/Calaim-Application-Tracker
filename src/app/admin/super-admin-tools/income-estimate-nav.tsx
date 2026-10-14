'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const INCOME_ESTIMATE_PAGES = [
  { href: '/admin/super-admin-tools/kaiser-income-estimate', label: 'Kaiser income' },
  { href: '/admin/super-admin-tools/health-net-income', label: 'Health Net income' },
  { href: '/admin/super-admin-tools/consolidated-income', label: 'Consolidated (taxes & cash balance)' },
];

export function IncomeEstimateNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {INCOME_ESTIMATE_PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
