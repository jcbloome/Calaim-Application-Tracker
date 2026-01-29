'use client';

import React from 'react';
import { acronyms } from '@/lib/data';

export function PrintableGlossaryContent() {
    return (
        <div className="printable-monochrome">
            <form>
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Acronym Glossary</h1>
                    <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">A list of common acronyms used throughout the CalAIM application process.</p>
                </div>
                <div className="space-y-4">
                    <dl className="p-4 border rounded-lg">
                        {acronyms.map((item, index) => (
                        <div key={item.term}>
                            <div className="flex items-baseline gap-4 py-3">
                            <dt className="w-20 text-right font-bold text-primary shrink-0">{item.term}</dt>
                            <dd className="text-muted-foreground">{item.definition}</dd>
                            </div>
                            {index < acronyms.length - 1 && <hr />}
                        </div>
                        ))}
                    </dl>
                </div>
              </form>
            <style jsx global>{`
              .printable-monochrome,
              .printable-monochrome * {
                color: #000 !important;
                border-color: #000 !important;
                box-shadow: none !important;
                background: transparent !important;
              }

              .printable-monochrome {
                background: #fff !important;
              }
            `}</style>
        </div>
    )
}
