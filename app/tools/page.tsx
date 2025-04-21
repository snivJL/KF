"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function FieldIdLookupPage() {
  const [fieldId, setFieldId] = useState("");
  const [result, setResult] = useState(null);

  const handleLookup = async () => {
    const res = await fetch("/api/tedis/tools/field-id-lookup", {
      method: "POST",
      body: JSON.stringify({ fieldId }),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    setResult(data);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Field ID Lookup</h1>
      <Input
        value={fieldId}
        onChange={(e) => setFieldId(e.target.value)}
        placeholder="Enter Field ID"
      />
      <Button onClick={handleLookup}>Get API Name</Button>

      {result && (
        <div className="border p-4 rounded-xl bg-muted">
          <p>
            <strong>API Name:</strong> {result.api_name}
          </p>
          <p>
            <strong>Label:</strong> {result.label}
          </p>
          <p>
            <strong>Module:</strong> {result.module}
          </p>
          <p>
            <strong>Type:</strong> {result.type}
          </p>
        </div>
      )}
    </div>
  );
}
