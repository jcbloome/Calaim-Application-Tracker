/**
 * Lightweight bold markup for ALFT commentary (`p13_commentary_section`).
 * Uses Markdown-style **bold** so the value stays a plain string in Firestore.
 */

/** Plain text length (ignores ** markers) for required-field checks. */
export function stripAlftCommentaryMarkup(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .trim();
}

/**
 * Wrap the current textarea selection in **…**.
 * If the selection is already wrapped, unwrap it.
 * If nothing is selected, insert ** ** and place the caret between.
 */
export function toggleAlftCommentaryBold(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { next: string; selectionStart: number; selectionEnd: number } {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const selected = text.slice(start, end);

  if (!selected) {
    const insert = '****';
    const next = `${text.slice(0, start)}${insert}${text.slice(end)}`;
    const caret = start + 2;
    return { next, selectionStart: caret, selectionEnd: caret };
  }

  const before = text.slice(Math.max(0, start - 2), start);
  const after = text.slice(end, Math.min(text.length, end + 2));
  if (before === '**' && after === '**') {
    const next = `${text.slice(0, start - 2)}${selected}${text.slice(end + 2)}`;
    return {
      next,
      selectionStart: start - 2,
      selectionEnd: start - 2 + selected.length,
    };
  }

  if (selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) {
    const inner = selected.slice(2, -2);
    const next = `${text.slice(0, start)}${inner}${text.slice(end)}`;
    return {
      next,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  const wrapped = `**${selected}**`;
  const next = `${text.slice(0, start)}${wrapped}${text.slice(end)}`;
  return {
    next,
    selectionStart: start,
    selectionEnd: start + wrapped.length,
  };
}

export type AlftCommentarySegment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string };

/** Split commentary into plain + bold segments for display (does not interpret other markdown). */
export function parseAlftCommentarySegments(raw: unknown): AlftCommentarySegment[] {
  const input = String(raw ?? '');
  if (!input) return [];
  const segments: AlftCommentarySegment[] = [];
  let lastIndex = 0;
  const re = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) != null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: input.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'bold', text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < input.length) {
    segments.push({ type: 'text', text: input.slice(lastIndex) });
  }
  return segments;
}
