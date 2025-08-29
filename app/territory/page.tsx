'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useBatchProcessor from '@/hooks/use-batch-processor';
import { parseIdsFromFile } from '@/lib/helpers';
import { Loader2 } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';

export default function TerritoriesTriggerPage() {
  const [prescriberIds, setPrescriberIds] = useState<string[]>([]);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [type, setType] = useState<'prescriber' | 'customer'>('prescriber');
  const [error, setError] = useState<string>();

  // Define process functions
  const processPrescriber = async (id: string) => {
    const form = new FormData();
    form.append('id', id);
    const res = await fetch('/api/tedis/territories/prescribers', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    return { id, success: res.ok, message: data.error || '' };
  };

  const processCustomer = async (id: string) => {
    const form = new FormData();
    form.append('id', id);
    const res = await fetch('/api/tedis/territories/customers', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    return { id, success: res.ok, message: data.error || '' };
  };

  // Initialize batch processors
  const {
    progress: prescriberProgress,
    results: prescriberResults,
    running: prescriberRunning,
    start: startPrescribers,
  } = useBatchProcessor(prescriberIds, processPrescriber);

  const {
    progress: customerProgress,
    results: customerResults,
    running: customerRunning,
    start: startCustomers,
  } = useBatchProcessor(customerIds, processCustomer);
  console.log(type);
  // Handlers
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(undefined);
    const file = e.target.files?.[0] || null;
    if (!file) return;
    try {
      const ids = await parseIdsFromFile(file);
      if (type === 'prescriber') setPrescriberIds(ids);
      else setCustomerIds(ids);
    } catch (err) {
      console.error(err);
      setError('Failed to parse Excel file.');
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Territories Workflow Triggers</CardTitle>
          <CardDescription>
            Select a tab, upload an Excel, and trigger workflows row-by-row with
            live progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="prescriber">
            <TabsList>
              <TabsTrigger
                value="prescriber"
                onClick={() => setType('prescriber')}
              >
                Prescribers
              </TabsTrigger>
              <TabsTrigger value="customer" onClick={() => setType('customer')}>
                Customers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prescriber">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFile(e)}
                aria-label="Upload prescriber codes"
                className="mb-4"
              />
              {prescriberIds.length > 0 && (
                <Button
                  onClick={startPrescribers}
                  disabled={prescriberRunning}
                  className="mb-4"
                >
                  {prescriberRunning ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    'Start Prescribers'
                  )}
                </Button>
              )}
              {prescriberRunning && (
                <div>
                  <div className="text-sm mb-1">
                    {prescriberProgress.current} / {prescriberProgress.total}
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 mb-2">
                    <div
                      className="bg-primary h-3 rounded-full transition-all"
                      style={{
                        width: `${
                          (prescriberProgress.current /
                            prescriberProgress.total) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="text-xs">
                    ✅ {prescriberProgress.successes} | ❌{' '}
                    {prescriberProgress.failures}
                  </div>
                </div>
              )}
              {prescriberResults.length > 0 && (
                <table className="w-full mt-4 text-sm">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Msg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescriberResults.map((r) => (
                      <tr key={r.id} className={r.success ? '' : 'bg-red-50'}>
                        <td className="px-2 py-1">{r.id}</td>
                        <td className="px-2 py-1">{r.success ? '✅' : '❌'}</td>
                        <td className="px-2 py-1">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>

            <TabsContent value="customer">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFile(e)}
                aria-label="Upload customer IDs"
                className="mb-4"
              />
              {customerIds.length > 0 && (
                <Button
                  onClick={startCustomers}
                  disabled={customerRunning}
                  className="mb-4"
                >
                  {customerRunning ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    'Start Customers'
                  )}
                </Button>
              )}
              {customerRunning && (
                <div>
                  <div className="text-sm mb-1">
                    {customerProgress.current} / {customerProgress.total}
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 mb-2">
                    <div
                      className="bg-primary h-3 rounded-full transition-all"
                      style={{
                        width: `${
                          (customerProgress.current / customerProgress.total) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="text-xs">
                    ✅ {customerProgress.successes} | ❌{' '}
                    {customerProgress.failures}
                  </div>
                </div>
              )}
              {customerResults.length > 0 && (
                <table className="w-full mt-4 text-sm">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Msg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerResults.map((r) => (
                      <tr key={r.id} className={r.success ? '' : 'bg-red-50'}>
                        <td className="px-2 py-1">{r.id}</td>
                        <td className="px-2 py-1">{r.success ? '✅' : '❌'}</td>
                        <td className="px-2 py-1">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      {error && <p className="mt-4 text-destructive text-center">{error}</p>}
    </div>
  );
}
