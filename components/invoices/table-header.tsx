"use client";
import { Search, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export default function Header({ q, total }: { q: string; total: number }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <span className="text-sm text-muted-foreground">
          {total.toLocaleString()} total
        </span>
      </div>
      <div className="flex items-center gap-2 w-full md:w-auto">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                startTransition(() => {
                  const url = new URL(window.location.href);
                  if (value) url.searchParams.set("q", value);
                  else url.searchParams.delete("q");
                  url.searchParams.set("page", "1");
                  router.push(url.toString());
                });
              }
            }}
            placeholder="Search subject / zohoId / accountId"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            // Export current page as CSV (client-side)
            const table = document.getElementById(
              "invoice-table"
            ) as HTMLTableElement | null;
            if (!table) return;
            const rows = Array.from(table.querySelectorAll("tr"));
            const csv = rows
              .map((tr) =>
                Array.from(tr.querySelectorAll("th,td"))
                  .map(
                    (c) => '"' + (c.textContent ?? "").replace(/"/g, '""') + '"'
                  )
                  .join(",")
              )
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "invoices_page.csv";
            a.click();
          }}
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>
    </div>
  );
}
