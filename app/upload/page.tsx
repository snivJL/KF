"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import axios from "axios";
import { getCookieValue } from "@/lib/cookies";
import { toast } from "sonner";
import type { InvoiceRow, ValidatedInvoice } from "@/types/tedis/invoices";

export default function UploadPage() {
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<ValidatedInvoice[]>([]);
  const [uploadResults, setUploadResults] = useState<
    { subject: string; success: boolean; error?: string }[]
  >([]);
  const [errors, setErrors] = useState<{ Row: number; Error: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      try {
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0] as string;
        const ws = wb.Sheets[wsname] as XLSX.WorkSheet;
        const jsonData = XLSX.utils.sheet_to_json<InvoiceRow>(ws, {
          defval: "",
        });
        const keys =
          jsonData.length > 0 ? Object.keys(jsonData[0] as InvoiceRow) : [];
        setHeaders(keys);
        setData(jsonData);
        setValidRows([]);
        setErrors([]);
        setUploadResults([]);
        toast.success("✅ File loaded. Ready to validate.");
      } catch (err) {
        console.error(err);
        toast.error(
          "❌ Failed to parse the Excel file. Please check the format."
        );
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleValidate = async () => {
    const accessToken = getCookieValue("vcrm_access_token");
    if (!accessToken) {
      toast.error("Missing VCRM token. Please log in.");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post("/api/tedis/invoices/validate", {
        rows: data,
        accessToken,
      });
      setValidRows(res.data.validInvoices);
      setErrors(res.data.errors);
      toast.success("✅ Validation complete.");
    } catch (err) {
      console.error(err);
      toast.error("❌ Validation failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    setLoading(true);
    try {
      const res = await axios.post("/api/tedis/invoices/upload", {
        validatedInvoices: validRows,
      });
      setUploadResults(res.data.results);
      toast.success("Upload complete.");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };
  console.log("validRows", validRows);
  console.log("lala");
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
          <Button onClick={handleValidate} disabled={loading}>
            {loading ? "Validating..." : "Validate"}
          </Button>
          <span className="text-sm text-muted-foreground">
            📄 {data.length} row{data.length !== 1 ? "s" : ""} loaded
          </span>
        </div>
      )}

      {validRows.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">✅ Valid Invoices</h2>
            <Button onClick={handleUpload} disabled={loading}>
              {loading ? "Uploading..." : "Upload to VCRM"}
            </Button>
          </div>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {validRows.map((entry, i) => (
                  <TableRow key={i} className="hover:bg-muted/40">
                    {headers.map((header) => (
                      <TableCell key={header}>
                        {entry.original?.[header]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">❌ Validation Errors</h2>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((err, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/40">
                    <TableCell>{err.Row}</TableCell>
                    <TableCell>{err.Error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {uploadResults.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">🚀 Upload Results</h2>
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
                {uploadResults.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/40">
                    <TableCell>{r.subject}</TableCell>
                    <TableCell>
                      {r.success ? "✅ Success" : "❌ Failed"}
                    </TableCell>
                    <TableCell>{r.error || "-"}</TableCell>
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
