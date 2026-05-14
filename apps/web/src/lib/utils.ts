import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The shadcn/ui `cn` helper. Combines clsx for conditional class strings with
 * tailwind-merge for resolving conflicts (e.g. p-2 and p-4 together).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
