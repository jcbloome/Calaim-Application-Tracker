'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type PillItem = {
  title: string;
  message: string;
  kind?: 'note' | 'docs' | 'cs';
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  actionUrl?: string;
};

type PillSummary = {
  count: number;
  title?: string;
  message?: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  actionUrl?: string;
  notes?: PillItem[];
};

const parseMs = (value?: string) => {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
};

export function DesktopPillPreviewOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<'compact' | 'panel'>('compact');
  const [staffSummary, setStaffSummary] = useState<PillSummary | null>(null);
  const [reviewSummary, setReviewSummary] = useState<PillSummary | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onStaff = (event: any) => setStaffSummary(event?.detail || null);
    const onReview = (event: any) => setReviewSummary(event?.detail || null);
    window.addEventListener('devDesktop:pillSummary', onStaff);
    window.addEventListener('devDesktop:reviewSummary', onReview);
    return () => {
      window.removeEventListener('devDesktop:pillSummary', onStaff);
      window.removeEventListener('devDesktop:reviewSummary', onReview);
    };
  }, []);

  const merged = useMemo(() => {
    const staffNotes = (staffSummary?.notes || []).map((n) => ({ ...n, kind: n.kind || 'note' }));
    const reviewNotes = (reviewSummary?.notes || []).map((n) => ({ ...n, kind: n.kind || 'docs' }));
    const combined = [...staffNotes, ...reviewNotes];
    combined.sort((a, b) => parseMs(b.timestamp) - parseMs(a.timestamp));
    return combined;
  }, [staffSummary, reviewSummary]);

  const count = useMemo(() => {
    return Number(staffSummary?.count || 0) + Number(reviewSummary?.count || 0);
  }, [staffSummary, reviewSummary]);

  const active = merged[index] || merged[0] || null;
  const kind = String(active?.kind || 'note');
  const accent =
    kind === 'docs' ? '#16a34a' : kind === 'cs' ? '#f97316' : '#7c3aed';
  const typeLabel = kind === 'docs' ? 'Documents' : kind === 'cs' ? 'CS Summary' : 'Interoffice note';
  const openLabel = kind === 'docs' || kind === 'cs' ? 'Go to Applications' : 'Go to Notes';

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        top: 12,
        zIndex: 9999,
        width: 460,
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        background: '#fff',
        boxShadow: '0 10px 22px rgba(0,0,0,0.16)',
        borderLeft: `6px solid ${accent}`,
        padding: 10,
        fontFamily: '"Segoe UI", Tahoma, sans-serif',
      }}
    >
      {mode === 'compact' ? (
        <div
          role="button"
          onClick={() => setMode('panel')}
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10 }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
              Connections Note <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>({typeLabel})</span>
            </div>
            <div
              title={active ? `${active.title} — ${active.message}` : 'No items yet (waiting for payload)'}
              style={{
                fontSize: 11,
                color: '#334155',
                marginTop: 2,
                overflow: 'hidden',
                // Two-line clamp so the "pill form" doesn't cut off as aggressively.
                display: '-webkit-box',
                WebkitLineClamp: 2 as any,
                WebkitBoxOrient: 'vertical' as any,
                maxWidth: 340,
                lineHeight: 1.25,
              }}
            >
              {active ? `${active.title} — ${active.message}` : 'No items yet (waiting for payload)'}
            </div>
            <div
              title={`From: ${active?.author || '-'} • To: ${active?.recipientName || '-'} • About: ${active?.memberName || '-'} • Sent: ${active?.timestamp || '-'}`}
              style={{ fontSize: 10, color: '#64748b', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}
            >
              From: {active?.author || '-'} · To: {active?.recipientName || '-'} · About: {active?.memberName || '-'} · Sent: {active?.timestamp || '-'}
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
            {count ? `${count} pending` : '—'}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
              Connections Note <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>({typeLabel})</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setMode('compact')} style={btn()}>
                Minimize
              </button>
              <button onClick={() => setOpen(false)} style={btn()}>
                Hide
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
            <Meta label="From" value={active?.author || '-'} />
            <Meta label="To" value={active?.recipientName || '-'} />
            <Meta label="About" value={active?.memberName || '-'} />
            <Meta label="Sent" value={active?.timestamp || '-'} />
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: '#334155', maxHeight: 110, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {active?.message || '(no message yet)'}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
            <button
              onClick={() => {
                const url = active?.actionUrl || (kind === 'docs' ? '/admin/applications?review=docs' : kind === 'cs' ? '/admin/applications?review=cs' : '/admin/my-notes');
                router.push(url);
              }}
              style={btn(true)}
            >
              {openLabel}
            </button>
            {merged.length > 1 ? (
              <>
                <button onClick={() => setIndex((v) => Math.max(0, v - 1))} style={btn()}>
                  Prev
                </button>
                <button onClick={() => setIndex((v) => Math.min(merged.length - 1, v + 1))} style={btn()}>
                  Next
                </button>
                <div style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>
                  {index + 1} / {merged.length}
                </div>
              </>
            ) : null}
          </div>

          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 11, color: '#64748b', cursor: 'pointer' }}>Debug payload</summary>
            <pre style={{ fontSize: 10, maxHeight: 180, overflow: 'auto', background: '#f8fafc', padding: 8, borderRadius: 8 }}>
              {JSON.stringify({ staffSummary, reviewSummary, merged }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function btn(primary = false): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '6px 10px',
    borderRadius: 10,
    border: `1px solid ${primary ? '#2563eb' : '#e2e8f0'}`,
    background: primary ? '#2563eb' : '#f8fafc',
    color: primary ? '#fff' : '#0f172a',
    cursor: 'pointer',
  };
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div
        title={value}
        style={{
          fontSize: 11,
          color: '#0f172a',
          // Let "Sent" show fully; keep others truncated but hoverable.
          overflow: label === 'Sent' ? 'visible' : 'hidden',
          textOverflow: label === 'Sent' ? 'clip' : 'ellipsis',
          whiteSpace: label === 'Sent' ? 'normal' : 'nowrap',
          wordBreak: label === 'Sent' ? 'break-word' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  );
}

