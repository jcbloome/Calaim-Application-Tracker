/** Render a typed name as a PNG data URL for electronic signature storage/PDF embed. */
export function createTypedSignaturePngDataUrl(name: string): string {
  if (typeof document === 'undefined') return '';
  const signedName = String(name || '').trim();
  if (!signedName) return '';

  const canvas = document.createElement('canvas');
  canvas.width = 700;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#111827';
  ctx.font = 'italic 40px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(signedName.slice(0, 60), 28, canvas.height / 2 - 8);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Electronically signed', 28, canvas.height - 28);

  return canvas.toDataURL('image/png');
}
