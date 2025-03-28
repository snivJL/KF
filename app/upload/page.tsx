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

type InvoiceRow = Record<string, string | number>;

type ValidatedInvoice = {
  subject: string;
  invoiceDate: Date;
  accountId: string;
  productId: string;
  employeeId: string;
  quantity: number;
  discount: number;
  original: InvoiceRow;
};

export default function UploadPage() {
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<ValidatedInvoice[]>([]);
  const [uploadResults, setUploadResults] = useState<
    { subject: string; success: boolean; error?: string }[]
  >([]);
  const [errors, setErrors] = useState<{ Row: number; Error: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      try {
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json<InvoiceRow>(ws, {
          defval: "",
        });
        const keys = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
        setHeaders(keys);
        setData(jsonData);
        setError(null);
        setValidRows([]);
        setErrors([]);
      } catch (err) {
        console.error(err);
        setError("Failed to parse the Excel file. Please check the format.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleValidate = async () => {
    const accessToken = getCookieValue("vcrm_access_token");
    if (!accessToken) {
      setError("Missing VCRM token. Please log in.");
      return;
    }
    try {
      const res = await axios.post("/api/tedis/invoices/validate", {
        rows: data,
        accessToken,
      });
      setValidRows(res.data.validInvoices);
      setErrors(res.data.errors);
    } catch (err) {
      console.error(err);
      setError("Validation failed. Check console for details.");
    }
  };

  const handleUpload = async () => {
    try {
      const res = await axios.post("/api/tedis/invoices/upload", {
        validatedInvoices: validRows,
      });
      setUploadResults(res.data.results);
    } catch (err) {
      console.error(err);
      setError("Upload failed. Check console for details.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Upload Invoices</h1>

      <Input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />

      {data.length > 0 && (
        <Button className="mt-4" onClick={handleValidate}>
          Validate
        </Button>
      )}

      {error && <p className="text-red-500 mt-2">{error}</p>}

      {validRows.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">✅ Valid Invoices</h2>
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
                  <TableRow key={i}>
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
                  <TableRow key={idx}>
                    <TableCell>{err.Row}</TableCell>
                    <TableCell>{err.Error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <Button className="mt-4" onClick={handleUpload}>
        Upload to VCRM
      </Button>
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
                  <TableRow key={i}>
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
