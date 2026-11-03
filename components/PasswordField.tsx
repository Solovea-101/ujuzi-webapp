'use client';

import { useId, useState } from 'react';
import { inputClass } from './ui';

/** A password box with a Show/Hide button, so a phone keyboard typo can be seen and fixed. */
export function PasswordField({
  label, value, onChange, autoComplete, hint, minLength,
}: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; hint?: string; minLength?: number }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`${inputClass} pr-20 font-mono`}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={128}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          className="absolute inset-y-1 right-1 mt-1 rounded-xs border border-line-strong bg-subtle px-2 font-mono text-xs font-bold text-ink hover:bg-line"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
