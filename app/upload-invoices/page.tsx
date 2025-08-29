'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function InvoicesApplyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'delete' | 'void'>('delete');
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApply() {
    if (!file) {
      setError('Please choose a file first.');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      const res = await fetch('/api/upload/invoices/apply', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Apply failed');
      setResult(json);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function onPreview() {
    if (!file) {
      setError('Please choose a file first.');
      return;
    }
    setError(null);
    setResult(null);
    setLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      const res = await fetch('/api/upload/invoices/preview', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Preview failed');
      setResult(json);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Import & Upsert Invoices</CardTitle>
          <CardDescription>
            Upload the current-month sales file and apply changes to Zoho CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="file">Sales File (.xlsx)</Label>
            <input
              id="file"
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={cn(
                'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                'file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground',
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label>
              When an existing CRM invoice is missing from this file
            </Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as 'delete' | 'void')}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Choose action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delete">Delete it</SelectItem>
                <SelectItem value="void">Mark as Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={onApply} disabled={!file || loading}>
              {loading ? 'Applying…' : 'Apply changes'}
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={onPreview} disabled={!file || loading}>
              {loadingPreview ? 'Applying…' : 'Preview changes'}
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>

          {result ? (
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-md border bg-muted p-4 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
