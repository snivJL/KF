"use client";

import { useState } from "react";

interface Progress {
  total: number;
  current: number;
  successes: number;
  failures: number;
}

type RowResult = { id: string; success: boolean; message?: string };

type ProcessFn<T> = (row: T) => Promise<RowResult>;

function useBatchProcessor<T>(rows: T[], processFn: ProcessFn<T>) {
  const [progress, setProgress] = useState<Progress>({
    total: rows.length,
    current: 0,
    successes: 0,
    failures: 0,
  });
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);

  const start = async () => {
    setRunning(true);
    setProgress({ total: rows.length, current: 0, successes: 0, failures: 0 });
    setResults([]);

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const result = await processFn(row!);
        setResults((prev) => [...prev, result]);
        if (result.success) successes++;
        else failures++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(row, message);
        // const id = typeof row === "string" ? row : row?.id || "No ID";
        // const result: RowResult = { id, success: false, message };
        // setResults((prev) => [...prev, result]);
        failures++;
      } finally {
        setProgress({
          total: rows.length,
          current: i + 1,
          successes,
          failures,
        });
      }
    }

    setRunning(false);
  };

  return { progress, results, running, start };
}

export default useBatchProcessor;
