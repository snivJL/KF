"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsImporting(true);
    setErrors([]);

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch("/api/import", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      setErrors([err]);
      setIsImporting(false);
      return;
    }

    // Poll progress
    const interval = setInterval(async () => {
      const res = await fetch("/api/import/progress");
      const data = await res.json();
      setProgress(data.progress);
      setErrors(data.errors || []);
      if (data.done) {
        clearInterval(interval);
        setIsImporting(false);
      }
    }, 1000);
  };

  const handleAbort = async () => {
    await fetch("/api/import/abort", { method: "DELETE" });
    setIsImporting(false);
    setProgress(0);
  };

  const handleExportErrors = () => {
    const blob = new Blob([errors.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Invoice Import</h1>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <Input type="file" accept=".xlsx,.csv" onChange={handleFileChange} />
          <div className="flex gap-2">
            <Button onClick={handleUpload} disabled={!file || isImporting}>
              {isImporting ? "Importing..." : "Start Import"}
            </Button>
            <Button onClick={handleAbort} variant="destructive" disabled={!isImporting}>
              Abort
            </Button>
            {errors.length > 0 && (
              <Button onClick={handleExportErrors} variant="outline">
                <Download className="w-4 h-4 mr-2" /> Export Errors
              </Button>
            )}
          </div>
          {isImporting && <Progress value={progress} />}
          {errors.length > 0 && (
            <div className="text-sm text-red-600">
              {errors.slice(0, 5).map((err, idx) => (
                <div key={idx}>{err}</div>
              ))}
              {errors.length > 5 && <div>+{errors.length - 5} more...</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
