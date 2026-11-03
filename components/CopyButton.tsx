'use client';

import { useToast } from './Toast';
import { buttonClass } from './ui';

/** Copies a value (an enrolment or certificate number) and says so. If the browser refuses, it says that instead. */
export function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast(done);
    } catch {
      toast(`Could not copy. Select the number and copy it by hand: ${value}`, 'error');
    }
  }
  return (
    <button type="button" onClick={copy} className={buttonClass({ tone: 'plain', size: 'sm' })}>
      {label}
    </button>
  );
}
