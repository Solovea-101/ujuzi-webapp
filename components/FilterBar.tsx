'use client';

import { useMemo, useRef, useState } from 'react';
import { formatCategoryShort } from '@/lib/formatters';
import { CATEGORIES } from '@/lib/db/types';
import { KENYA_COUNTIES } from '@/lib/validation';
import { TradeIcon } from './TradeIcon';
import { buttonClass } from './ui';

type Filterable = { category: string; county: string };

const chip = (selected: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-sm font-semibold ${
    selected ? 'border-line-strong bg-brand text-on-brand shadow-tactile-sm' : 'border-line-strong bg-surface text-ink hover:bg-subtle'
  }`;

/**
 * Trade chips on one row, the counties that have courses on the next, and a searchable sheet for all 47. The counts
 * come from the courses already loaded, so choosing a filter never waits for the network.
 */
export function FilterBar({
  courses, category, county, onCategory, onCounty,
}: { courses: Filterable[]; category: string; county: string; onCategory: (value: string) => void; onCounty: (value: string) => void }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');

  const inCounty = courses.filter((c) => !county || c.county === county);
  const inCategory = courses.filter((c) => !category || c.category === category);
  const byCategory = (code: string) => inCounty.filter((c) => c.category === code).length;
  const byCounty = (name: string) => inCategory.filter((c) => c.county === name).length;

  const activeCounties = useMemo(() => {
    const names = new Set(courses.map((c) => c.county));
    if (county) names.add(county);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [courses, county]);

  const matching = KENYA_COUNTIES.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Trade" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" className={chip(category === '')} aria-pressed={category === ''} onClick={() => onCategory('')}>
          All trades <span className="font-mono text-xs">({inCounty.length})</span>
        </button>
        {CATEGORIES.map((code) => (
          <button key={code} type="button" className={chip(category === code)} aria-pressed={category === code} onClick={() => onCategory(category === code ? '' : code)}>
            <TradeIcon category={code} size={16} />
            {formatCategoryShort(code)} <span className="font-mono text-xs">({byCategory(code)})</span>
          </button>
        ))}
      </div>

      <div role="group" aria-label="County" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" className={chip(county === '')} aria-pressed={county === ''} onClick={() => onCounty('')}>All counties</button>
        {activeCounties.map((name) => (
          <button key={name} type="button" className={chip(county === name)} aria-pressed={county === name} onClick={() => onCounty(county === name ? '' : name)}>
            {name} <span className="font-mono text-xs">({byCounty(name)})</span>
          </button>
        ))}
        <button type="button" className={buttonClass({ tone: 'plain' })} onClick={() => { setQuery(''); sheet.current?.showModal(); }}>
          Other counties ({KENYA_COUNTIES.length})
        </button>
      </div>

      <dialog
        ref={sheet}
        aria-label="Choose a county"
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[80vh] w-full max-w-none flex-col rounded-t-md border-2 border-line-strong bg-surface p-0 text-ink open:flex backdrop:bg-black/50 sm:inset-auto sm:m-auto sm:max-w-md sm:rounded-md"
        onClick={(event) => { if (event.target === sheet.current) sheet.current?.close(); }}
      >
        <div className="flex items-center gap-2 border-b border-line p-3">
          <label className="flex-1 text-sm font-semibold">
            <span className="sr-only">Type a county name</span>
            <input
              className="block min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-base"
              placeholder="Type a county name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className={buttonClass({ tone: 'plain' })} onClick={() => sheet.current?.close()}>Close</button>
        </div>
        <ul className="overflow-y-auto p-2">
          {matching.length === 0 && <li className="p-3 text-sm text-ink-secondary">No county by that name.</li>}
          {matching.map((name) => {
            const count = byCounty(name);
            return (
              <li key={name}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between rounded-sm px-3 text-left text-sm font-semibold hover:bg-subtle"
                  aria-pressed={county === name}
                  onClick={() => { onCounty(name); sheet.current?.close(); }}
                >
                  <span>{name}</span>
                  <span className={`font-mono text-xs ${count === 0 ? 'text-ink-muted' : 'text-brand'}`}>{count} {count === 1 ? 'course' : 'courses'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </dialog>
    </div>
  );
}
