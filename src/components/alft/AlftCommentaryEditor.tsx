'use client';

import { useRef } from 'react';
import { Bold } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseAlftCommentarySegments, toggleAlftCommentaryBold } from '@/lib/alft-commentary-format';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  textareaClassName?: string;
  rows?: number;
  placeholder?: string;
  id?: string;
  /** When true, show rendered bold preview under the editor (edit mode). */
  showLivePreview?: boolean;
};

/** Read-only commentary with **bold** rendered as <strong>. */
export function AlftCommentaryDisplay({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const segments = parseAlftCommentarySegments(value);
  if (!segments.length) {
    return <div className={cn('whitespace-pre-wrap', className)}>{' '}</div>;
  }
  return (
    <div className={cn('whitespace-pre-wrap', className)}>
      {segments.map((seg, i) =>
        seg.type === 'bold' ? (
          <strong key={`b-${i}`} className="font-bold">
            {seg.text}
          </strong>
        ) : (
          <span key={`t-${i}`}>{seg.text}</span>
        )
      )}
    </div>
  );
}

export function AlftCommentaryEditor({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  className,
  textareaClassName,
  rows = 18,
  placeholder,
  id,
  showLivePreview = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const locked = readOnly || disabled;

  const applyBold = () => {
    if (locked) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = toggleAlftCommentaryBold(value, start, end);
    onChange(result.next);
    requestAnimationFrame(() => {
      const nextEl = textareaRef.current;
      if (!nextEl) return;
      nextEl.focus();
      nextEl.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {!locked ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 px-2.5"
            onClick={applyBold}
            title="Bold (Ctrl/Cmd+B) — wraps selection in ** **"
          >
            <Bold className="h-3.5 w-3.5" />
            Bold
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Select text, then Bold. Uses **markers** that print as bold.
          </span>
        </div>
      ) : null}
      {locked ? (
        <AlftCommentaryDisplay
          value={value}
          className={cn(
            'min-h-[120px] rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-zinc-900',
            textareaClassName
          )}
        />
      ) : (
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'b') {
              e.preventDefault();
              applyBold();
            }
          }}
          className={cn(
            'w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm',
            textareaClassName
          )}
        />
      )}
      {showLivePreview && !locked && String(value || '').includes('**') ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 print:hidden">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">
            Bold preview
          </div>
          <AlftCommentaryDisplay value={value} className="text-sm text-slate-900" />
        </div>
      ) : null}
    </div>
  );
}
