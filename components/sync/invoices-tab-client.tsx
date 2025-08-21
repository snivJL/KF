// /src/app/admin/invoices/InvoicesTabClient.tsx
"use client";

import { useEffect, useMemo, useState, type JSX } from "react";
import { useActionState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/auth";
import { useFormStatus } from "react-dom";

export type InvoiceRow = {
  id: string; // local UUID
  zohoId: string;
  subject: string | null;
  date: string | null; // ISO
  accountId: string | null; // FK to Account.id
  currency: string | null;
  status: string | null;
  subtotal: string | null; // Decimal as string
  discount: string | null; // Decimal as string
  tax: string | null; // Decimal as string
  grandTotal: string | null; // Decimal as string
  updatedAt: string; // ISO
};

export type SyncState = { ok: boolean; message: string; count?: number };

function SyncButton({ formAction }: { formAction: (f: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" formAction={formAction} disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin h-4 w-4 mr-2" />
      ) : (
        <RefreshCw className="h-4 w-4 mr-2" />
      )}
      Sync Invoices
    </Button>
  );
}

export default function InvoicesTabClient({
  action,
}: {
  action: (prev: SyncState, formData: FormData) => Promise<SyncState>;
}): JSX.Element {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof InvoiceRow>("updatedAt");
  const [sortAsc, setSortAsc] = useState(false);

  const [state, formAction] = useActionState<SyncState, FormData>(action, {
    ok: false,
    message: "",
  });

  const fetchInvoices = async () => {
    const res = await fetchWithAuth("/api/tedis/invoices?take=100");
    const data = (await res.json()) as InvoiceRow[];
    setInvoices(data);
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // react to server action results
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(
        `${state.message}${state.count ? ` — ${state.count} invoices` : ""}`
      );
      fetchInvoices();
    } else {
      toast.error(state.message);
    }
  }, [state]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices
      .filter(
        (inv) =>
          (inv.subject ?? "").toLowerCase().includes(q) ||
          (inv.zohoId ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        return sortAsc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
  }, [invoices, search, sortKey, sortAsc]);

  const handleSort = (key: keyof InvoiceRow) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Invoices</h2>
              <p className="text-sm text-muted-foreground">
                Sync invoice data from VCRM into the local database.
              </p>
            </div>
            <form action={formAction}>
              <SyncButton formAction={formAction} />
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b-1 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Synced invoices from VCRM
            </p>
            <Input
              type="text"
              placeholder="Search by subject or Zoho ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort("subject")}>
                    Subject {sortKey === "subject" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("date")}>
                    Date {sortKey === "date" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("status")}>
                    Status {sortKey === "status" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("currency")}>
                    Currency {sortKey === "currency" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("subtotal")}>
                    Subtotal {sortKey === "subtotal" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("discount")}>
                    Discount {sortKey === "discount" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("tax")}>
                    Tax {sortKey === "tax" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("grandTotal")}>
                    Grand Total{" "}
                    {sortKey === "grandTotal" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("updatedAt")}>
                    Last Synced{" "}
                    {sortKey === "updatedAt" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.subject ?? "—"}</TableCell>
                    <TableCell>
                      {inv.date ? new Date(inv.date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>{inv.status ?? "—"}</TableCell>
                    <TableCell>{inv.currency ?? "—"}</TableCell>
                    <TableCell>{inv.subtotal ?? "—"}</TableCell>
                    <TableCell>{inv.discount ?? "—"}</TableCell>
                    <TableCell>{inv.tax ?? "—"}</TableCell>
                    <TableCell>{inv.grandTotal ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(inv.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
