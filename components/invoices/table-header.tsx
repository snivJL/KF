'use client';
import { Search, Download, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import MassUpdateDialog from './mass-update-dialog';

export default function Header({
  q,
  total,
  filters,
}: {
  q: string;
  total: number;
  filters: Record<string, string>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [, startTransition] = useTransition();

  const clearSearch = () => {
    setValue('');
    startTransition(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('q');
      url.searchParams.set('page', '1');
      router.push(url.toString());
    });
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Manage and track your invoices • {total.toLocaleString()} total
        </p>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 size-4 text-muted-foreground -translate-y-1/2" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                startTransition(() => {
                  const url = new URL(window.location.href);
                  if (value) url.searchParams.set('q', value);
                  else url.searchParams.delete('q');
                  url.searchParams.set('page', '1');
                  router.push(url.toString());
                });
              }
            }}
            placeholder="Search invoices..."
            className="px-10 h-10"
          />
          {/* Added clear search button */}
          {value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 h-8 w-8 p-0 -translate-y-1/2 hover:bg-muted"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <MassUpdateDialog filters={filters} />
        <Button
          variant="outline"
          size="default"
          className="h-10 px-4 bg-transparent"
          onClick={() => {
            // Export current page as CSV (client-side)
            const table = document.getElementById(
              'invoice-table',
            ) as HTMLTableElement | null;
            if (!table) return;
            const rows = Array.from(table.querySelectorAll('tr'));
            const csv = rows
              .map((tr) =>
                Array.from(tr.querySelectorAll('th,td'))
                  .map((c) => `"${(c.textContent ?? '').replace(/"/g, '""')}"`)
                  .join(','),
              )
              .join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'invoices_page.csv';
            a.click();
          }}
        >
          <Download className="mr-2 size-4" />
          Export
        </Button>
      </div>
    </div>
  );
}
