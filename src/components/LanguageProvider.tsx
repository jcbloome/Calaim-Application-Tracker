'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type LanguageCode = 'en' | 'es';

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'portal_language';
const textNodeOriginals = new Map<Text, string>();
const attrOriginals = new Map<HTMLElement, { placeholder?: string; title?: string; ariaLabel?: string }>();
const translationCache = new Map<string, string>();

function shouldSkipElement(el: Element | null): boolean {
  if (!el) return true;
  if ((el as HTMLElement).closest('[data-no-translate="true"]')) return true;
  const tag = el.tagName;
  return (
    tag === 'SCRIPT' ||
    tag === 'STYLE' ||
    tag === 'NOSCRIPT' ||
    tag === 'TEXTAREA' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'OPTION' ||
    tag === 'CODE' ||
    tag === 'PRE'
  );
}

function splitWhitespace(value: string): { prefix: string; core: string; suffix: string } {
  const prefixMatch = value.match(/^\s*/)?.[0] ?? '';
  const suffixMatch = value.match(/\s*$/)?.[0] ?? '';
  const core = value.slice(prefixMatch.length, value.length - suffixMatch.length);
  return { prefix: prefixMatch, core, suffix: suffixMatch };
}

async function translateTexts(texts: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!texts.length) return map;

  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, target: 'es', source: 'en' }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    translations?: string[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(String(payload?.error || `Translation API failed: ${response.status}`));
  }

  const translated = Array.isArray(payload?.translations) ? payload.translations : [];
  texts.forEach((source, index) => {
    map.set(source, translated[index] ?? source);
  });
  return map;
}

async function translatePageToSpanish(): Promise<void> {
  if (typeof document === 'undefined') return;

  const root = document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const cores = new Set<string>();

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) continue;

    const value = node.textContent ?? '';
    if (!value.trim()) continue;

    if (!textNodeOriginals.has(node)) {
      textNodeOriginals.set(node, value);
    }

    const original = textNodeOriginals.get(node) ?? value;
    const { core } = splitWhitespace(original);
    if (!core.trim()) continue;

    cores.add(core);
    nodes.push(node);
  }

  const attrsToTranslate: Array<{ el: HTMLElement; key: 'placeholder' | 'title' | 'ariaLabel'; value: string }> = [];
  const elements = root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]');
  elements.forEach((el) => {
    if (shouldSkipElement(el)) return;
    if (!attrOriginals.has(el)) {
      attrOriginals.set(el, {
        placeholder: el.getAttribute('placeholder') ?? undefined,
        title: el.getAttribute('title') ?? undefined,
        ariaLabel: el.getAttribute('aria-label') ?? undefined,
      });
    }
    const original = attrOriginals.get(el);
    if (!original) return;

    if (original.placeholder && original.placeholder.trim()) {
      cores.add(original.placeholder);
      attrsToTranslate.push({ el, key: 'placeholder', value: original.placeholder });
    }
    if (original.title && original.title.trim()) {
      cores.add(original.title);
      attrsToTranslate.push({ el, key: 'title', value: original.title });
    }
    if (original.ariaLabel && original.ariaLabel.trim()) {
      cores.add(original.ariaLabel);
      attrsToTranslate.push({ el, key: 'ariaLabel', value: original.ariaLabel });
    }
  });

  const uncached = [...cores].filter((value) => !translationCache.has(value));
  if (uncached.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < uncached.length; i += chunkSize) {
      const chunk = uncached.slice(i, i + chunkSize);
      const translatedChunk = await translateTexts(chunk);
      translatedChunk.forEach((translated, source) => {
        translationCache.set(source, translated);
      });
    }
  }

  nodes.forEach((node) => {
    if (!node.isConnected) return;
    const original = textNodeOriginals.get(node);
    if (!original) return;
    const { prefix, core, suffix } = splitWhitespace(original);
    if (!core.trim()) return;
    const translated = translationCache.get(core) ?? core;
    node.textContent = `${prefix}${translated}${suffix}`;
  });

  attrsToTranslate.forEach(({ el, key, value }) => {
    if (!el.isConnected) return;
    const translated = translationCache.get(value) ?? value;
    if (key === 'placeholder') el.setAttribute('placeholder', translated);
    if (key === 'title') el.setAttribute('title', translated);
    if (key === 'ariaLabel') el.setAttribute('aria-label', translated);
  });
}

function restoreEnglish(): void {
  textNodeOriginals.forEach((original, node) => {
    if (node.isConnected) node.textContent = original;
  });
  attrOriginals.forEach((original, el) => {
    if (!el.isConnected) return;
    if (original.placeholder != null) el.setAttribute('placeholder', original.placeholder);
    if (original.title != null) el.setAttribute('title', original.title);
    if (original.ariaLabel != null) el.setAttribute('aria-label', original.ariaLabel);
  });
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const observerRef = useRef<MutationObserver | null>(null);
  const translateTimerRef = useRef<number | null>(null);
  const didShowErrorRef = useRef(false);
  const isTranslationEnabledForPath = !String(pathname || '').startsWith('/admin');
  const effectiveLanguage: LanguageCode = isTranslationEnabledForPath ? language : 'en';

  const setLanguage = (next: LanguageCode) => {
    setLanguageState(next);
    if (next === 'es') {
      didShowErrorRef.current = false;
    }
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const queueTranslate = () => {
    if (translateTimerRef.current) {
      window.clearTimeout(translateTimerRef.current);
    }
    translateTimerRef.current = window.setTimeout(() => {
      void translatePageToSpanish().catch((error: any) => {
        console.error('Translation failed:', error);
        if (!didShowErrorRef.current) {
          didShowErrorRef.current = true;
          const message = String(error?.message || 'Translation failed.');
          window.alert(`Spanish translation could not be applied.\n\n${message}`);
        }
      });
    }, 200);
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'es' || stored === 'en') {
        setLanguageState(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = effectiveLanguage === 'es' ? 'es' : 'en';
    }

    if (effectiveLanguage === 'es') {
      queueTranslate();
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new MutationObserver(() => queueTranslate());
      observerRef.current.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } else {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      restoreEnglish();
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      if (translateTimerRef.current) window.clearTimeout(translateTimerRef.current);
    };
  }, [effectiveLanguage]);

  useEffect(() => {
    if (effectiveLanguage === 'es') {
      queueTranslate();
    }
  }, [pathname, effectiveLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
