export type PdfFromHtmlOptions = {
  marginIn?: number;
  scale?: number;
  orientation?: 'portrait' | 'landscape';
  format?: 'letter';
  topBufferPts?: number;
  treatEachSectionAsSinglePage?: boolean;
  imageFormat?: 'jpeg' | 'png';
  jpegQuality?: number;
  fitSafetyScale?: number;
};

async function waitForPrintableAssets(root: HTMLElement) {
  try {
    await (document as any)?.fonts?.ready;
  } catch {
    // ignore
  }

  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (img.complete && img.naturalWidth > 0) {
          if (typeof (img as any).decode === 'function') {
            await (img as any).decode();
          }
          return;
        }
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      } catch {
        // ignore
      }
    })
  );
}

function letterPageSizePts(orientation: 'portrait' | 'landscape') {
  const portrait = { width: 612, height: 792 }; // 8.5in x 11in @ 72pt/in
  if (orientation === 'landscape') {
    return { width: portrait.height, height: portrait.width };
  }
  return portrait;
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('Failed to encode PDF page image.'));
        else resolve(b);
      },
      'image/jpeg',
      quality
    );
  });
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('Failed to encode PDF page image.'));
        else resolve(b);
      },
      'image/png'
    );
  });
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rowInkScore(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  sampleStepPx: number
): number {
  // Sample a few pixels across the row and count "dark" pixels as ink.
  // Lower score => more whitespace => safer page break.
  const w = Math.max(1, width);
  const step = Math.max(8, sampleStepPx);
  const xs: number[] = [];
  for (let x = 0; x < w; x += step) xs.push(x);
  if (xs[xs.length - 1] !== w - 1) xs.push(w - 1);

  let ink = 0;
  for (const x of xs) {
    const img = ctx.getImageData(x, clamp(y, 0, ctx.canvas.height - 1), 1, 1).data;
    const r = img[0] ?? 255;
    const g = img[1] ?? 255;
    const b = img[2] ?? 255;
    const avg = (r + g + b) / 3;
    // Treat anything noticeably darker than white as ink.
    if (avg < 245) ink++;
  }
  return ink / xs.length;
}

function findSafeBreakY(
  ctx: CanvasRenderingContext2D,
  preferredY: number,
  minY: number,
  maxY: number
): number {
  const start = clamp(Math.floor(preferredY) - 80, minY, maxY);
  const end = clamp(Math.floor(preferredY) + 20, minY, maxY);
  const w = ctx.canvas.width;

  let bestY = clamp(Math.floor(preferredY), minY, maxY);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let y = start; y <= end; y++) {
    const s0 = rowInkScore(ctx, y, w, 48);
    const dist = Math.abs(y - preferredY);
    const score = s0 + dist * 0.0005;
    if (score < bestScore) {
      bestScore = score;
      bestY = y;
    }
  }

  if (bestScore > 0.22) {
    return clamp(Math.floor(preferredY), minY, maxY);
  }
  return bestY;
}

type KeepTogetherRange = { top: number; bottom: number; height: number };

/** Collect ISP question/signature cards. Only merge cards on the same grid row. */
function collectKeepTogetherRanges(
  section: HTMLElement,
  scale: number,
  pageSliceHeightCanvasPx: number
): KeepTogetherRange[] {
  const rootRect = section.getBoundingClientRect();
  const candidates = Array.from(
    section.querySelectorAll(
      '.question-block, .signature-block, .signature-section, [data-keep-together], .print-keep-together'
    )
  ) as HTMLElement[];

  const ranges: KeepTogetherRange[] = [];
  for (const node of candidates) {
    const rect = node.getBoundingClientRect();
    const cssHeight = Math.max(0, rect.height);
    if (cssHeight < 12) continue;
    if (cssHeight * scale > pageSliceHeightCanvasPx * 0.98) continue;

    const pad = Math.max(1, Math.round(2 * scale));
    const top = Math.max(0, Math.floor((rect.top - rootRect.top) * scale) - pad);
    const bottom = Math.max(top + 1, Math.ceil((rect.bottom - rootRect.top) * scale) + pad);
    ranges.push({ top, bottom, height: bottom - top });
  }

  if (ranges.length <= 1) return ranges;
  ranges.sort((a, b) => a.top - b.top || a.bottom - b.bottom);

  // Merge only same-row cards (tops nearly equal) — never cascade-merge down the page.
  const sameRowSlop = Math.max(4, Math.round(10 * scale));
  const merged: KeepTogetherRange[] = [{ ...ranges[0] }];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = ranges[i];
    if (Math.abs(cur.top - prev.top) <= sameRowSlop) {
      prev.bottom = Math.max(prev.bottom, cur.bottom);
      prev.height = prev.bottom - prev.top;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/**
 * End the slice on a card boundary so labels/answers are never split across pages.
 * Prefer the last card that fully fits; avoid nearly-empty header-only pages.
 */
function chooseSliceEndAtCardBoundary(
  preferredEnd: number,
  sliceStartY: number,
  maxSliceEndY: number,
  keepRanges: KeepTogetherRange[],
  pageSliceHeightCanvasPx: number
): number {
  const hardMax = clamp(Math.floor(maxSliceEndY), sliceStartY + 1, maxSliceEndY);
  const preferred = clamp(Math.floor(preferredEnd), sliceStartY + 1, hardMax);
  const minUseful = sliceStartY + Math.max(120, Math.floor(pageSliceHeightCanvasPx * 0.4));

  const usable = keepRanges
    .filter((r) => r.bottom > sliceStartY + 2 && r.top < hardMax)
    .sort((a, b) => a.top - b.top);

  if (!usable.length) return preferred;

  let lastFullBottom = sliceStartY;
  for (const r of usable) {
    // Card already started above this slice (shouldn't happen with boundary breaks).
    if (r.top < sliceStartY - 2) {
      if (r.bottom <= preferred) lastFullBottom = Math.max(lastFullBottom, Math.min(r.bottom, hardMax));
      continue;
    }

    const fitsFully = r.bottom <= preferred && r.bottom - sliceStartY <= hardMax - sliceStartY;
    if (fitsFully) {
      lastFullBottom = Math.max(lastFullBottom, r.bottom);
      continue;
    }

    // This card would be cut or overflow the preferred end.
    if (lastFullBottom >= minUseful) {
      return clamp(lastFullBottom, sliceStartY + 1, hardMax);
    }

    // Page would be mostly empty — include this card if the whole card fits on the page.
    if (r.bottom - sliceStartY <= hardMax - sliceStartY) {
      return clamp(r.bottom, sliceStartY + 1, hardMax);
    }

    // Oversized card: fall back to preferred (may still clip; rare for question cards).
    return preferred;
  }

  if (lastFullBottom > sliceStartY + 8) {
    return clamp(Math.max(lastFullBottom, Math.min(preferred, hardMax)), sliceStartY + 1, hardMax);
  }
  return preferred;
}

function adjustBreakForKeepTogether(
  breakY: number,
  sliceStartY: number,
  maxSliceEndY: number,
  keepRanges: KeepTogetherRange[],
  pageSliceHeightCanvasPx: number
): number {
  return chooseSliceEndAtCardBoundary(
    breakY,
    sliceStartY,
    maxSliceEndY,
    keepRanges,
    pageSliceHeightCanvasPx
  );
}

export async function generatePdfFromHtmlSections(
  sections: HTMLElement[],
  params: {
    stampPageNumbers?: boolean;
    pageNumberLabel?: (page: number, total: number) => string;
    headerText?: string;
    options?: PdfFromHtmlOptions;
  } = {}
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const html2canvasMod: any = await import('html2canvas');
  const html2canvas: any = html2canvasMod?.default ?? html2canvasMod;
  if (typeof html2canvas !== 'function') {
    throw new Error('Canvas renderer failed to load.');
  }

  const marginIn = params.options?.marginIn ?? 0.5;
  const scale = params.options?.scale ?? 2;
  const orientation = params.options?.orientation ?? 'portrait';
  const format = params.options?.format ?? 'letter';
  const imageFormat = params.options?.imageFormat ?? 'jpeg';
  const jpegQuality = params.options?.jpegQuality ?? 0.92;
  const fitSafetyScale = params.options?.fitSafetyScale ?? 0.999;
  if (format !== 'letter') {
    throw new Error('Only letter format is supported.');
  }

  const pageSize = letterPageSizePts(orientation);
  const marginPts = marginIn * 72;
  const headerBlockPts = params.headerText ? 24 : 0;
  // Extra breathing room above the captured content to prevent any "top clipped" look
  // caused by renderer rounding or tight fit-to-page scaling.
  const topBufferPts = params.options?.topBufferPts ?? 30;
  const contentWidthPts = pageSize.width - marginPts * 2;
  const contentHeightPts = pageSize.height - marginPts * 2 - headerBlockPts - topBufferPts;
  const treatEachSectionAsSinglePage = params.options?.treatEachSectionAsSinglePage === true;

  const finalDoc = await PDFDocument.create();
  const MAX_CANVAS_HEIGHT = 24000;
  const MAX_CANVAS_AREA = 80_000_000;

  for (const section of sections) {
    const sourceWidthPx = Math.max(
      1,
      Math.ceil((section as HTMLElement).scrollWidth || (section as HTMLElement).getBoundingClientRect().width || 1)
    );
    const sourceHeightPx = Math.max(1, Math.ceil((section as HTMLElement).scrollHeight || 1));

    const ptsPerPx = contentWidthPts / sourceWidthPx;
    const pageSliceHeightPx = Math.max(1, Math.floor(contentHeightPts / ptsPerPx));
    const pageSliceHeightCanvasPx = Math.max(1, Math.floor(pageSliceHeightPx * scale));
    let keepTogetherRanges: KeepTogetherRange[] = [];

    // Prefer a single full render of the section, then slice the resulting canvas.
    // This avoids transform/overflow edge cases that can clip content at page boundaries.
    let fullCanvas: HTMLCanvasElement | null = null;
    try {
      await waitForPrintableAssets(section);
      // Force layout to expand to full content before measuring — fixed/off-screen
      // parents can otherwise leave scrollHeight short of the real text height.
      const prevHeight = section.style.height;
      const prevMaxHeight = section.style.maxHeight;
      const prevOverflow = section.style.overflow;
      section.style.height = 'auto';
      section.style.maxHeight = 'none';
      section.style.overflow = 'visible';
      // Force reflow, then measure keep-together after the section is fully expanded.
      void section.offsetHeight;
      keepTogetherRanges = collectKeepTogetherRanges(section, scale, pageSliceHeightCanvasPx);
      const measuredHeightPx = Math.max(
        1,
        Math.ceil(
          Math.max(
            section.scrollHeight || 0,
            section.offsetHeight || 0,
            section.getBoundingClientRect().height || 0
          )
        )
      );
      const measuredWidthPx = Math.max(
        1,
        Math.ceil(
          Math.max(
            section.scrollWidth || 0,
            section.offsetWidth || 0,
            section.getBoundingClientRect().width || 0,
            sourceWidthPx
          )
        )
      );
      const c: HTMLCanvasElement = await html2canvas(section, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: measuredWidthPx,
        height: measuredHeightPx,
        windowWidth: measuredWidthPx,
        windowHeight: measuredHeightPx,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        onclone: (_doc: Document, cloned: HTMLElement) => {
          cloned.style.height = 'auto';
          cloned.style.maxHeight = 'none';
          cloned.style.overflow = 'visible';
          cloned.style.width = `${measuredWidthPx}px`;
          cloned.querySelectorAll<HTMLElement>(
            '.alft-page, .large-commentary-box, .answer-line, .question-block, .alft-question-grid'
          ).forEach((node) => {
            node.style.height = 'auto';
            node.style.maxHeight = 'none';
            node.style.overflow = 'visible';
            node.style.overflowWrap = 'anywhere';
            node.style.wordBreak = 'break-word';
          });
          cloned.querySelectorAll<HTMLElement>('.alft-section-title, .alft-subsection-title').forEach((node) => {
            node.style.textAlign = 'left';
            node.style.width = '100%';
            node.style.display = 'block';
            node.style.background = 'transparent';
            node.style.color = '#18181b';
            node.style.border = 'none';
          });
        },
      });
      section.style.height = prevHeight;
      section.style.maxHeight = prevMaxHeight;
      section.style.overflow = prevOverflow;
      if (
        c &&
        c.width > 0 &&
        c.height > 0 &&
        c.height <= MAX_CANVAS_HEIGHT &&
        c.width * c.height <= MAX_CANVAS_AREA
      ) {
        fullCanvas = c;
      }
    } catch {
      fullCanvas = null;
    }

    if (fullCanvas) {
      if (treatEachSectionAsSinglePage) {
        const image =
          imageFormat === 'png'
            ? await finalDoc.embedPng(await canvasToPngBytes(fullCanvas))
            : await finalDoc.embedJpg(await canvasToJpegBytes(fullCanvas, jpegQuality));

        const page = finalDoc.addPage([pageSize.width, pageSize.height]);
        if (params.headerText) {
          const headerFont = await finalDoc.embedFont(StandardFonts.Helvetica);
          const headerSize = 9;
          const headerY = pageSize.height - marginPts - 12;
          page.drawText(String(params.headerText), {
            x: marginPts,
            y: headerY,
            size: headerSize,
            font: headerFont,
            color: rgb(0.25, 0.25, 0.25),
          });
          page.drawLine({
            start: { x: marginPts, y: pageSize.height - marginPts - 18 },
            end: { x: pageSize.width - marginPts, y: pageSize.height - marginPts - 18 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
          });
        }

        const fitScale = Math.min(contentWidthPts / fullCanvas.width, contentHeightPts / fullCanvas.height) * fitSafetyScale;
        const drawWidth = fullCanvas.width * fitScale;
        const drawHeight = fullCanvas.height * fitScale;
        const x = marginPts;
        const y = marginPts + Math.max(0, contentHeightPts - drawHeight);
        page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
        continue;
      }

      const fullCtx = fullCanvas.getContext('2d');
      let yPx = 0;
      while (yPx < fullCanvas.height) {
        let sliceH = Math.min(pageSliceHeightCanvasPx, fullCanvas.height - yPx);
        if (fullCtx && yPx + sliceH < fullCanvas.height) {
          const preferredBreak = yPx + sliceH;
          const maxBreak = Math.min(fullCanvas.height - 1, yPx + pageSliceHeightCanvasPx);
          // Snap to question-card boundaries so labels/answers never split across pages.
          const keepAwareBreak = adjustBreakForKeepTogether(
            preferredBreak,
            yPx,
            maxBreak,
            keepTogetherRanges,
            pageSliceHeightCanvasPx
          );
          sliceH = Math.max(1, keepAwareBreak - yPx);
        }
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = fullCanvas.width;
        sliceCanvas.height = Math.max(1, sliceH);
        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(fullCanvas, 0, yPx, fullCanvas.width, sliceH, 0, 0, fullCanvas.width, sliceH);
        }

        const image =
          imageFormat === 'png'
            ? await finalDoc.embedPng(await canvasToPngBytes(sliceCanvas))
            : await finalDoc.embedJpg(await canvasToJpegBytes(sliceCanvas, jpegQuality));

        const page = finalDoc.addPage([pageSize.width, pageSize.height]);
        if (params.headerText) {
          const headerFont = await finalDoc.embedFont(StandardFonts.Helvetica);
          const headerSize = 9;
          const headerY = pageSize.height - marginPts - 12;
          page.drawText(String(params.headerText), {
            x: marginPts,
            y: headerY,
            size: headerSize,
            font: headerFont,
            color: rgb(0.25, 0.25, 0.25),
          });
          page.drawLine({
            start: { x: marginPts, y: pageSize.height - marginPts - 18 },
            end: { x: pageSize.width - marginPts, y: pageSize.height - marginPts - 18 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
          });
        }

        const fitScale = Math.min(contentWidthPts / sliceCanvas.width, contentHeightPts / sliceCanvas.height) * fitSafetyScale;
        const drawWidth = sliceCanvas.width * fitScale;
        const drawHeight = sliceCanvas.height * fitScale;
        const x = marginPts;
        const y = marginPts + Math.max(0, contentHeightPts - drawHeight);
        page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });

        if (yPx + sliceH >= fullCanvas.height) break;
        yPx += sliceH;
      }
      continue;
    }

    // Fallback: slice-render via wrapper transforms (for extremely tall sections).
    // Capture with overlap to avoid boundary clipping, then crop off overlap so text never duplicates.
    const overlapPx = Math.min(24, Math.max(10, Math.floor(pageSliceHeightPx * 0.02)));
    const safetyPadPx = 24;

    let offsetY = 0;
    while (offsetY < sourceHeightPx) {
      const desiredSliceHeightPx = Math.min(pageSliceHeightPx, sourceHeightPx - offsetY);
      const captureSliceHeightPx = Math.min(desiredSliceHeightPx + overlapPx, sourceHeightPx - offsetY);

      const wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-100000px';
      wrapper.style.top = '0';
      wrapper.style.width = `${sourceWidthPx}px`;
      wrapper.style.height = `${captureSliceHeightPx + safetyPadPx}px`;
      wrapper.style.overflow = 'hidden';
      wrapper.style.background = '#ffffff';
      wrapper.style.boxSizing = 'border-box';
      wrapper.style.paddingBottom = `${safetyPadPx}px`;

      const clone = section.cloneNode(true) as HTMLElement;
      clone.style.transform = `translateY(-${offsetY}px)`;
      clone.style.transformOrigin = 'top left';
      clone.style.width = `${sourceWidthPx}px`;
      (clone.style as any).maxWidth = 'none';
      wrapper.appendChild(clone);

      document.body.appendChild(wrapper);
      await waitForPrintableAssets(wrapper);

      const canvas: HTMLCanvasElement = await html2canvas(wrapper, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
      });

      wrapper.remove();

      // Skip blank slices defensively.
      if (!canvas.width || !canvas.height) continue;

      // Crop off the captured overlap so content doesn't duplicate across pages.
      let finalCanvas: HTMLCanvasElement = canvas;
      if (captureSliceHeightPx > desiredSliceHeightPx) {
        // Prefer an absolute crop based on the requested html2canvas scale to avoid ratio rounding.
        const cropH = Math.max(1, Math.min(canvas.height, Math.ceil(desiredSliceHeightPx * scale)));
        if (cropH > 0 && cropH < canvas.height) {
          const cropped = document.createElement('canvas');
          cropped.width = canvas.width;
          cropped.height = cropH;
          const ctx = cropped.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, canvas.width, cropH, 0, 0, canvas.width, cropH);
            finalCanvas = cropped;
          }
        }
      }

      const image =
        imageFormat === 'png'
          ? await finalDoc.embedPng(await canvasToPngBytes(finalCanvas))
          : await finalDoc.embedJpg(await canvasToJpegBytes(finalCanvas, jpegQuality));

      const page = finalDoc.addPage([pageSize.width, pageSize.height]);
      if (params.headerText) {
        const headerFont = await finalDoc.embedFont(StandardFonts.Helvetica);
        const headerSize = 9;
        const headerY = pageSize.height - marginPts - 12;
        page.drawText(String(params.headerText), {
          x: marginPts,
          y: headerY,
          size: headerSize,
          font: headerFont,
          color: rgb(0.25, 0.25, 0.25),
        });
        // Thin divider line
        page.drawLine({
          start: { x: marginPts, y: pageSize.height - marginPts - 18 },
          end: { x: pageSize.width - marginPts, y: pageSize.height - marginPts - 18 },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
      }
      // Slightly under-fit to avoid any edge clipping from floating point rounding.
      const fitScale = Math.min(contentWidthPts / finalCanvas.width, contentHeightPts / finalCanvas.height) * fitSafetyScale;
      const drawWidth = finalCanvas.width * fitScale;
      const drawHeight = finalCanvas.height * fitScale;
      const x = marginPts;
      const y = marginPts + Math.max(0, contentHeightPts - drawHeight);
      page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });

      // Advance to next slice.
      if (offsetY + desiredSliceHeightPx >= sourceHeightPx) break;
      offsetY += desiredSliceHeightPx;
    }
  }

  if (params.stampPageNumbers !== false) {
    const total = finalDoc.getPageCount();
    const font = await finalDoc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < total; i++) {
      const page = finalDoc.getPage(i);
      const { width } = page.getSize();
      const label = params.pageNumberLabel
        ? params.pageNumberLabel(i + 1, total)
        : `Page ${i + 1} of ${total}`;
      const size = 9;
      const x = Math.max(18, width - 18 - font.widthOfTextAtSize(label, size));
      const y = 18;
      page.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) });
    }
  }

  return await finalDoc.save();
}

