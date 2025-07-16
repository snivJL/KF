"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BulkDeleteSchema = z.object({
  moduleApiName: z.string().min(1),
  cvid: z.string().min(1),
  territoryId: z.string().optional(),
  includeChild: z.boolean(),
});

export default function BulkDeletePage() {
  const [form, setForm] = useState({
    moduleApiName: "",
    cvid: "",
    territoryId: "",
    includeChild: false,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    // client-side validation
    const parsed = BulkDeleteSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((z) => z.message).join("; "));
      return;
    }

    setLoading(true);
    try {
      const { moduleApiName, cvid, territoryId, includeChild } = parsed.data;

      const payload: Record<string, unknown> = { moduleApiName, cvid };
      if (territoryId) {
        payload.territory = { id: territoryId, include_child: includeChild };
      }

      const res = await fetch(`/api/tedis/bulk-delete`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      setResult(data);
    } catch (err: unknown) {
      setError(JSON.stringify(err, undefined, 2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-lg mx-auto mt-12">
      <CardHeader>
        <CardTitle>Bulk Delete Records</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="moduleApiName">Module API Name</Label>
            <Input
              id="moduleApiName"
              placeholder="e.g. Leads, Accounts"
              value={form.moduleApiName}
              onChange={(e) =>
                setForm({ ...form, moduleApiName: e.target.value })
              }
              required
            />
          </div>

          <div>
            <Label htmlFor="cvid">Custom View ID</Label>
            <Input
              id="cvid"
              value={form.cvid}
              onChange={(e) => setForm({ ...form, cvid: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="territoryId">Territory ID (optional)</Label>
            <Input
              id="territoryId"
              value={form.territoryId}
              onChange={(e) =>
                setForm({ ...form, territoryId: e.target.value })
              }
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeChild"
              checked={form.includeChild}
              onCheckedChange={(val) =>
                setForm({ ...form, includeChild: val as boolean })
              }
            />
            <Label htmlFor="includeChild">Include Child Territories</Label>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? "Deleting…" : "Start Bulk Delete"}
          </Button>
        </form>

        {error && <p className="mt-4 text-red-600">Error: {error}</p>}

        {!!result && (
          <div className="mt-6">
            <h3 className="font-medium">Response:</h3>
            <pre className="bg-gray-100 p-4 rounded">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
