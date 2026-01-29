'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PrintableFieldProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'textarea' | 'checkbox' | 'radio' | 'date' | 'select';
  options?: string[];
  className?: string;
  width?: 'full' | 'half' | 'third' | 'quarter';
  rows?: number;
}

export function PrintableField({
  label,
  placeholder = '',
  required = false,
  type = 'text',
  options = [],
  className = '',
  width = 'full',
  rows = 3
}: PrintableFieldProps) {
  const widthClasses = {
    full: 'w-full',
    half: 'w-full sm:w-1/2',
    third: 'w-full sm:w-1/3',
    quarter: 'w-full sm:w-1/4'
  };

  const renderField = () => {
    switch (type) {
      case 'textarea':
        const textareaHeight = `${rows * 24}px`; // Approximate line height
        return (
          <div
            className="w-full border border-gray-400 print:border-black bg-white p-2"
            style={{ minHeight: textareaHeight }}
          />
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 border border-gray-400 print:border-black rounded-sm"></div>
                <span className="print:text-black">{option}</span>
              </div>
            ))}
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 border border-gray-400 print:border-black rounded-full"></div>
                <span className="print:text-black">{option}</span>
              </div>
            ))}
          </div>
        );

      case 'select':
        return (
          <div className="w-full border border-gray-400 print:border-black bg-white p-2 h-10 flex items-center" />
        );

      case 'date':
        return (
          <div className="w-full border border-gray-400 print:border-black bg-white p-2 h-10 flex items-center" />
        );

      default:
        return (
          <div className="w-full border-b-2 border-gray-400 print:border-black h-10 flex items-end pb-2" />
        );
    }
  };

  return (
    <div className={cn(widthClasses[width], 'mb-4 print:mb-6', className)}>
      <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
        {label}
        {required && <span className="text-red-500 print:text-black ml-1">*</span>}
      </label>
      {renderField()}
    </div>
  );
}

interface PrintableFormSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function PrintableFormSection({ title, children, className = '' }: PrintableFormSectionProps) {
  return (
    <div className={cn('mb-8 print:mb-10', className)}>
      <h2 className="text-xl print:text-lg font-semibold text-gray-900 print:text-black mb-4 print:mb-6 pb-2 border-b border-gray-200 print:border-black">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-6">
        {children}
      </div>
    </div>
  );
}

interface PrintableFormRowProps {
  children: React.ReactNode;
  className?: string;
}

export function PrintableFormRow({ children, className = '' }: PrintableFormRowProps) {
  return (
    <div className={cn('col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-6', className)}>
      {children}
    </div>
  );
}

interface PrintableSignatureBlockProps {
  title: string;
  subtitle?: string;
  showDate?: boolean;
  className?: string;
}

export function PrintableSignatureBlock({ 
  title, 
  subtitle, 
  showDate = true, 
  className = '' 
}: PrintableSignatureBlockProps) {
  return (
    <div className={cn('mt-8 print:mt-12 p-4 print:p-6 border border-gray-300 print:border-black', className)}>
      <h3 className="text-lg print:text-base font-semibold text-gray-900 print:text-black mb-4">
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-4">
          {subtitle}
        </p>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
            Signature
          </label>
          <div className="h-16 border-b-2 border-gray-400 print:border-black"></div>
        </div>
        
        {showDate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Date
            </label>
            <div className="h-16 border-b-2 border-gray-400 print:border-black"></div>
          </div>
        )}
      </div>
      
      <div className="mt-6 print:mt-8">
        <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
          Print Name
        </label>
        <div className="h-12 border-b-2 border-gray-400 print:border-black"></div>
      </div>
    </div>
  );
}