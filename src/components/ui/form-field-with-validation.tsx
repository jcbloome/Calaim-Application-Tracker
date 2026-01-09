'use client';

import React from 'react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BaseFieldProps {
  control: any;
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

interface InputFieldProps extends BaseFieldProps {
  type?: 'text' | 'email' | 'tel' | 'number' | 'password';
  placeholder?: string;
}

interface TextareaFieldProps extends BaseFieldProps {
  placeholder?: string;
  rows?: number;
}

interface SelectFieldProps extends BaseFieldProps {
  placeholder?: string;
  options: { value: string; label: string }[];
}

export function InputFieldWithValidation({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
  type = 'text',
  placeholder,
  className
}: InputFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel className="flex items-center gap-2">
            {label}
            {required && <span className="text-destructive">*</span>}
            {fieldState.isDirty && !fieldState.error && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            {fieldState.error && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
          </FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                fieldState.error && "border-destructive focus-visible:ring-destructive",
                fieldState.isDirty && !fieldState.error && "border-green-500 focus-visible:ring-green-500"
              )}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextareaFieldWithValidation({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
  placeholder,
  rows = 3,
  className
}: TextareaFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel className="flex items-center gap-2">
            {label}
            {required && <span className="text-destructive">*</span>}
            {fieldState.isDirty && !fieldState.error && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            {fieldState.error && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
          </FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              disabled={disabled}
              rows={rows}
              className={cn(
                fieldState.error && "border-destructive focus-visible:ring-destructive",
                fieldState.isDirty && !fieldState.error && "border-green-500 focus-visible:ring-green-500"
              )}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectFieldWithValidation({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
  placeholder,
  options,
  className
}: SelectFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel className="flex items-center gap-2">
            {label}
            {required && <span className="text-destructive">*</span>}
            {fieldState.isDirty && !fieldState.error && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            {fieldState.error && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
          </FormLabel>
          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={disabled}>
            <FormControl>
              <SelectTrigger
                className={cn(
                  fieldState.error && "border-destructive focus:ring-destructive",
                  fieldState.isDirty && !fieldState.error && "border-green-500 focus:ring-green-500"
                )}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}