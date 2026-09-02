/**
 * Shared PDF parsing utilities
 */

let pdfJsLoaderPromise: Promise<any> | null = null;

export const loadPdfJs = async () => {
  if (pdfJsLoaderPromise) return pdfJsLoaderPromise;
  pdfJsLoaderPromise = (async () => {
    let pdfjs: any = null;
    // Prefer local package so parse does not depend on CDN reachability.
    try {
      const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs = mod?.getDocument ? mod : mod?.default || mod;
    } catch (localError) {
      console.warn('Local pdfjs-dist load failed, trying CDN fallback:', localError);
      try {
        const mod: any = await import(
          /* webpackIgnore: true */
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.min.mjs'
        );
        pdfjs = mod?.getDocument ? mod : mod?.default || mod;
      } catch (cdnError) {
        const localMsg = String((localError as any)?.message || localError || 'local import failed');
        const cdnMsg = String((cdnError as any)?.message || cdnError || 'cdn import failed');
        throw new Error(
          `Could not load PDF parser (${localMsg}; CDN: ${cdnMsg}). Check network/firewall and retry.`
        );
      }
    }

    try {
      if (pdfjs?.GlobalWorkerOptions) {
        // Parsing uses disableWorker: true; still set a valid workerSrc for pdf.js internals.
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.worker.min.mjs';
      }
    } catch (workerError) {
      console.warn('Could not set PDF.js worker source:', workerError);
    }

    if (!pdfjs?.getDocument) {
      throw new Error('PDF.js loaded but getDocument is missing.');
    }

    return pdfjs;
  })();

  return pdfJsLoaderPromise;
};
