"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Result {
  id: string;
  success: boolean;
  message?: string;
}

export default function TerritoriesTriggerPage() {
  const [prescriberFile, setPrescriberFile] = useState<File | null>(null);
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [prescriberResults, setPrescriberResults] = useState<Result[]>([]);
  const [customerResults, setCustomerResults] = useState<Result[]>([]);
  const [error, setError] = useState<string>();

  function handleFileChange(
    e: ChangeEvent<HTMLInputElement>,
    type: "prescriber" | "customer"
  ) {
    const file = e.target.files?.[0] || null;
    setError(undefined);
    if (type === "prescriber") {
      setPrescriberFile(file);
      setPrescriberResults([]);
    } else {
      setCustomerFile(file);
      setCustomerResults([]);
    }
  }

  async function handleSubmit(e: FormEvent, type: "prescriber" | "customer") {
    e.preventDefault();
    const file = type === "prescriber" ? prescriberFile : customerFile;
    if (!file) {
      setError("Please select an Excel file to upload.");
      return;
    }

    setLoading(true);
    setError(undefined);
    if (type === "prescriber") setPrescriberResults([]);
    else setCustomerResults([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint =
        type === "prescriber"
          ? "/api/tedis/territories/prescribers"
          : "/api/tedis/territories/customers";

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Upload failed");
      }

      const data: { results: Result[] } = await res.json();
      console.log(data.results);
      if (type === "prescriber") setPrescriberResults(data.results);
      else setCustomerResults(data.results);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Territories Workflow Triggers</CardTitle>
          <CardDescription>
            Upload Excel files to trigger workflows for Prescribers or Customers
            in Zoho CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="prescriber">
            <TabsList>
              <TabsTrigger value="prescriber">Prescribers</TabsTrigger>
              <TabsTrigger value="customer">Customers</TabsTrigger>
            </TabsList>

            <TabsContent value="prescriber">
              <form
                onSubmit={(e) => handleSubmit(e, "prescriber")}
                className="space-y-4"
              >
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleFileChange(e, "prescriber")}
                  aria-label="Prescribers Excel file"
                />
                <Button disabled={loading} className="w-full">
                  {loading ? "Processing…" : "Upload & Trigger"}
                </Button>
              </form>

              {error && <p className="mt-2 text-destructive">{error}</p>}

              {prescriberResults.length > 0 && (
                <table className="w-full mt-4 text-sm table-fixed">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left">Code</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescriberResults.map((r) => (
                      <tr key={r.id} className={r.success ? "" : "bg-red-50"}>
                        <td className="px-2 py-1">{r.id}</td>
                        <td className="px-2 py-1">{r.success ? "✅" : "❌"}</td>
                        <td className="px-2 py-1">{r.message || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>

            <TabsContent value="customer">
              <form
                onSubmit={(e) => handleSubmit(e, "customer")}
                className="space-y-4"
              >
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleFileChange(e, "customer")}
                  aria-label="Customers Excel file"
                />
                <Button disabled={loading} className="w-full">
                  {loading ? "Processing…" : "Upload & Trigger"}
                </Button>
              </form>

              {error && <p className="mt-2 text-destructive">{error}</p>}

              {customerResults.length > 0 && (
                <table className="w-full mt-4 text-sm table-fixed">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left">Customer ID</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerResults.map((r) => (
                      <tr key={r.id} className={r.success ? "" : "bg-red-50"}>
                        <td className="px-2 py-1">{r.id}</td>
                        <td className="px-2 py-1">{r.success ? "✅" : "❌"}</td>
                        <td className="px-2 py-1">{r.message || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
