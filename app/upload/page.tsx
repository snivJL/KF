'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import axios from 'axios';
import { getCookieValue } from '@/lib/cookies';
import { toast } from 'sonner';
import type { InvoiceRow, ValidatedInvoice } from '@/types/tedis/invoices';
import { Loader2 } from 'lucide-react';
import { getCurrentCounter, updateCounter } from '@/lib/tedis/invoiceCounter';
import { groupConsecutively, parseInvoiceExcel } from '@/lib/invoices';

type UploadProgress = {
  total: number;
  current: number;
  successes: number;
  failures: number;
};

type UploadResult = { subject: string; success: boolean; error?: string };

export default function UploadPage() {
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [validRows, setValidRows] = useState<ValidatedInvoice[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [errors, setErrors] = useState<{ Row: number; Error: string }[]>([]);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { data: json, headers } = await parseInvoiceExcel(file);
      setData(json);
      setHeaders(headers);
      setValidRows([]);
      setErrors([]);
      setUploadResults([]);
      setProgress(null);
      toast.success('File loaded. Ready to validate.');
    } catch (err) {
      console.error('Excel parsing error:', err);
      toast.error('Failed to parse the Excel file.');
    }
  };

  const handleValidate = async () => {
    const accessToken = getCookieValue('vcrm_access_token');
    if (!accessToken) return toast.error('Missing VCRM token. Please log in.');

    setValidating(true);
    try {
      const res = await axios.post('/api/tedis/invoices/validate', {
        rows: data,
        accessToken,
      });
      setValidRows(res.data.validInvoices);
      setErrors(res.data.errors);
      toast.success('Validation complete.');
    } catch (err) {
      console.error(err);
      toast.error('Validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async () => {
    const groups = groupConsecutively(validRows);
    const startingId = await getCurrentCounter();

    if (!startingId) {
      return;
    }
    let currentId = startingId;
    let successes = 0;
    let failures = 0;

    setUploading(true);
    setProgress({ total: groups.length, current: 0, successes, failures });

    const results: UploadResult[] = [];

    for (let i = 0; i < groups.length; i++) {
      try {
        const res = await axios.post('/api/tedis/invoices/upload-group', {
          group: groups[i],
        });
        results.push({ subject: res.data.subject, success: true });
        successes++;
      } catch (err) {
        const message = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : 'Unknown error';
        results.push({
          subject: groups[i]?.[0]?.subject || 'undefined',
          success: false,
          error: message,
        });
        failures++;
      } finally {
        setProgress({
          total: groups.length,
          current: i + 1,
          successes,
          failures,
        });
        currentId++;
      }
    }

    await updateCounter(currentId);
    setUploading(false);
    setUploadResults(results);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">📥 Upload Invoices</h1>

      <div className="border border-dashed rounded-lg p-6 text-center mb-6 hover:bg-muted cursor-pointer transition-colors">
        <Input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer block text-sm text-muted-foreground"
        >
          Click or drag an Excel file here to upload
        </label>
      </div>

      {data.length > 0 && (
        <div className="flex items-center gap-4 mb-4">
          <Button onClick={handleValidate} disabled={validating}>
            {validating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {validating ? 'Validating...' : 'Validate'}
          </Button>
          <span className="text-sm text-muted-foreground">
            📄 {data.length} row{data.length !== 1 ? 's' : ''} loaded
          </span>
        </div>
      )}

      <Accordion type="multiple" className="mt-6 space-y-4">
        {validRows.length > 0 && (
          <AccordionItem value="valid">
            <AccordionTrigger>
              <h2 className="text-xl">✅ Validated Invoices</h2>
            </AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto border rounded-md mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validRows.map((row) => (
                      <TableRow key={row.id}>
                        {headers.map((h) => (
                          <TableCell key={h}>{row.original?.[h]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {errors.length > 0 && (
          <AccordionItem value="errors">
            <AccordionTrigger>❌ Validation Errors</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto border rounded-md mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errors.map((e) => (
                      <TableRow key={e.Row}>
                        <TableCell>{e.Row}</TableCell>
                        <TableCell>{e.Error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      {validRows.length > 0 && (
        <div className="mt-6 border rounded-lg p-6 shadow-sm bg-background">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Upload to VCRM</h2>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>

          {progress && (
            <>
              <div className="mb-1 text-sm text-muted-foreground">
                Uploading {progress.current} / {progress.total} grouped invoices
                ({validRows.length} total invoice items)
              </div>
              <div className="w-full bg-muted rounded-full h-5">
                <div
                  className="bg-primary h-5 rounded-full transition-all duration-300 ease-in-out"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ✅ {progress.successes} | ❌ {progress.failures}
              </div>
            </>
          )}
        </div>
      )}

      {uploadResults.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">📦 Upload Results</h2>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploadResults.map((r) => (
                  <TableRow key={r.subject}>
                    <TableCell>{r.subject}</TableCell>
                    <TableCell>
                      {r.success ? '✅ Success' : '❌ Failed'}
                    </TableCell>
                    <TableCell>{r.error || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
