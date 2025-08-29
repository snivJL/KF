'use client';

import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import * as xlsx from 'xlsx';
import {
  useContactsEmployeesImport,
  type MappingRow,
} from '@/hooks/use-contacts-employees-import';

export default function ContactsEmployeesImportPage() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  // Initialize batch import hook
  const { progress, results, running, startImport } =
    useContactsEmployeesImport(rows);

  // File handler
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(undefined);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0] as string;
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json<Record<string, unknown>>(
        worksheet!,
        { defval: '' },
      );
      // Map rows to MappingRow
      const parsed: MappingRow[] = data.map((row) => {
        const repCode = String(row['Rep Code'] || row['repCode'] || '').trim();
        const contactCode = String(
          row['Contact Code'] || row['contactCode'] || '',
        ).trim();
        return { repCode, contactCode };
      });

      setRows(parsed);
    } catch (err) {
      console.error(err);
      setError('Failed to parse Excel file.');
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Contact-Employee Mappings</CardTitle>
          <CardDescription>
            Upload an Excel file with columns “Rep Code” and “Contact Code”.
            Mappings will be sent one-by-one to Zoho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            aria-label="Upload mappings file"
            className="mb-4"
          />

          {rows.length > 0 && !running && (
            <Button onClick={startImport} className="mb-4">
              Start Import ({rows.length} rows)
            </Button>
          )}

          {running && (
            <div className="mb-4">
              <Button disabled>
                <Loader2 className="size-4 animate-spin mr-2" /> Processing...
              </Button>
              <div className="text-sm mt-2">
                {progress.current} / {progress.total}
              </div>
              <div className="w-full bg-muted rounded-full h-3 mt-1">
                <div
                  className="bg-primary h-3 rounded-full transition-all"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
              <div className="text-xs mt-1">
                ✅ {progress.successes} | ❌ {progress.failures}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <table className="w-full mt-4 text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1">Rep Code</th>
                  <th className="px-2 py-1">Contact Code</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Message</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx} className={r.success ? '' : 'bg-red-50'}>
                    <td className="px-2 py-1">{rows[idx]?.repCode}</td>
                    <td className="px-2 py-1">{rows[idx]?.contactCode}</td>
                    <td className="px-2 py-1">{r.success ? '✅' : '❌'}</td>
                    <td className="px-2 py-1">{r.message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && (
            <p className="mt-4 text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
