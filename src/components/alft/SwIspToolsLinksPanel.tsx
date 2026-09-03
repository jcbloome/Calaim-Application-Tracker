'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import {
  DEFAULT_SW_ISP_TOOLS,
  SW_ISP_TOOLS_SETTINGS_DOC,
  activeSwIspTools,
  normalizeSwIspToolsList,
  type SwIspToolItem,
} from '@/lib/sw-isp-tools';
import { fetchSwIspToolsMenu } from '@/lib/sw-isp-tools-client';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  title?: string;
  description?: string;
  /** Prefer Firestore when caller already has admin settings access. */
  preferFirestore?: boolean;
  showManageLink?: boolean;
};

export function SwIspToolsLinksPanel({
  className,
  title = 'SW portal tools & uploads',
  description = 'Same tools and uploaded files available to social workers (Tier Tool, ISP Description, ALFT guidance, etc.).',
  preferFirestore = true,
  showManageLink = true,
}: Props) {
  const firestore = useFirestore();
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SwIspToolItem[]>([...DEFAULT_SW_ISP_TOOLS]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (preferFirestore && firestore) {
          const snap = await getDoc(doc(firestore, 'admin-settings', SW_ISP_TOOLS_SETTINGS_DOC));
          if (!cancelled) {
            setItems(
              snap.exists()
                ? normalizeSwIspToolsList((snap.data() as any)?.items)
                : [...DEFAULT_SW_ISP_TOOLS]
            );
          }
          return;
        }
        const idToken = (await auth?.currentUser?.getIdToken?.()) || '';
        if (!idToken) {
          if (!cancelled) setItems([...DEFAULT_SW_ISP_TOOLS]);
          return;
        }
        const next = await fetchSwIspToolsMenu(idToken);
        if (!cancelled) setItems(next);
      } catch {
        if (!cancelled) setItems([...DEFAULT_SW_ISP_TOOLS]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, firestore, preferFirestore]);

  const active = useMemo(() => activeSwIspTools(items), [items]);

  return (
    <div className={cn('rounded-md border border-sky-200 bg-sky-50/60 p-3 space-y-2 print:hidden', className)}>
      <div>
        <div className="text-sm font-semibold text-sky-950">{title}</div>
        <div className="text-xs text-sky-900/90">{description}</div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tools…
        </div>
      ) : active.length === 0 ? (
        <div className="text-xs text-muted-foreground">No active SW tools configured.</div>
      ) : (
        <ul className="space-y-1.5">
          {active.map((tool) => {
            const isExternal = /^https?:\/\//i.test(tool.href);
            return (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tool.label}</span>
                  {tool.fileName ? (
                    <span className="truncate text-xs font-normal text-muted-foreground">({tool.fileName})</span>
                  ) : null}
                  {isExternal ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {showManageLink ? (
        <div className="pt-1">
          <Link
            href="/admin/tools/isp-sw-tools"
            className="text-[11px] font-medium text-sky-800 hover:underline"
          >
            Manage SW ISP tools uploads
          </Link>
        </div>
      ) : null}
    </div>
  );
}
