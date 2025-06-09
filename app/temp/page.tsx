"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { startInvoiceEmployeeSync } from "./action";

type InvoiceResult = {
  id: string;
  status: "updated" | "failed";
  error?: string;
};

export default function TriggerInvoiceSyncPage() {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<InvoiceResult[] | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = () => {
    if (!file) {
      toast("Please select a file first");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await startInvoiceEmployeeSync(formData);
        setResults(res.results);
        toast("Sync complete");
      } catch (err) {
        toast("Error during sync");
        console.error("Sync error:", err);
      }
    });
  };

  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Invoice Employee Sync</h1>

      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Running..." : "Start Sync"}
      </Button>

      {results && (
        <div className="mt-4 border rounded-md p-4 bg-muted">
          <h2 className="font-medium mb-2">Results:</h2>
          <ul className="text-sm max-h-64 overflow-auto space-y-1">
            {results.map((r) => (
              <li key={r.id}>
                <span
                  className={
                    r.status === "updated" ? "text-green-600" : "text-red-600"
                  }
                >
                  {r.status.toUpperCase()}
                </span>{" "}
                - {r.id}
                {r.error && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    ({r.error})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
