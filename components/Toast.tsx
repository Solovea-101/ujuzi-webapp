'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: Kind; text: string };
type Push = (text: string, kind?: Kind) => void;

const ToastContext = createContext<Push>(() => undefined);

/** Short messages for things that just happened (copied, enrolled, issued). They go away by themselves after 4 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const push = useCallback<Push>((text, kind = 'success') => {
    const id = next.current++;
    setItems((current) => [...current.slice(-2), { id, kind, text }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);

  const looks: Record<Kind, string> = {
    success: 'border-ok-border bg-ok-bg text-ok-text',
    error: 'border-bad-border bg-bad-bg text-bad-text',
    info: 'border-info-border bg-info-bg text-info-text',
  };
  const icons: Record<Kind, string> = { success: '✓', error: '!', info: 'i' };
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:items-end">
        {items.map((item) => (
          <p key={item.id} role="status" className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-sm border px-3 py-2 text-sm font-semibold shadow-tactile-sm ${looks[item.kind]}`}>
            <span aria-hidden="true" className="font-mono">{icons[item.kind]}</span>
            <span>{item.text}</span>
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = (): Push => useContext(ToastContext);
