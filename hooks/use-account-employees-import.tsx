"use client";

import useBatchProcessor from "./use-batch-processor";

export type MappingRow = {
  repCode: string;
  accountCode: string;
};

export type RowResult = { id: string; success: boolean; message?: string };

export type Progress = {
  total: number;
  current: number;
  successes: number;
  failures: number;
};

export type UseAccountsEmployeesImportResult = {
  progress: Progress;
  results: RowResult[];
  running: boolean;
  startImport: () => void;
};

/**
 * Hook to import account-employee mappings one by one using useBatchProcessor.
 * @param rows Array of mapping rows with repCode and accountCode.
 */
export function useAccountsEmployeesImport(
  rows: MappingRow[]
): UseAccountsEmployeesImportResult {
  // Define how to process a single row
  const processFn = async (row: MappingRow): Promise<RowResult> => {
    console.log("Handling row:", row);
    const formData = new FormData();
    formData.append("repCode", row.repCode);
    formData.append("accountCode", row.accountCode);

    const response = await fetch("/api/tedis/accounts-employees", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      const detail = payload?.message || response.statusText;
      return { id: row.repCode, success: false, message: detail };
    }

    return { id: row.repCode, success: true };
  };

  // Leverage the existing useBatchProcessor hook (process sequentially by default)
  const { progress, results, running, start } = useBatchProcessor<MappingRow>(
    rows,
    processFn
  );

  return {
    progress,
    results,
    running,
    startImport: start,
  };
}
