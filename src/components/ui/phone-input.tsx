
'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const formatPhoneNumber = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
};

const PhoneInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>((
  { className, onChange, ...props },
  ref
) => {

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhoneNumber = formatPhoneNumber(event.target.value);
    event.target.value = formattedPhoneNumber;
    if (onChange) {
        onChange(event);
    }
  };

  return (
    <Input
      type="tel"
      className={cn(className)}
      onChange={handleInputChange}
      ref={ref}
      {...props}
    />
  );
});
PhoneInput.displayName = 'PhoneInput';

export { PhoneInput };
