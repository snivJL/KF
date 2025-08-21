// /src/lib/zoho/invoices.bulk.ts
import AdmZip from "adm-zip";
import axios from "axios";
import { parse } from "csv-parse/sync";

const BASE_URL = process.env.BASE_URL as string;
if (!BASE_URL) throw new Error("Missing BASE_URL");

// Lightweight sleep to poll job status (kept local to avoid importing more utils)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type BulkInvoiceCsv = Record<string, string>;

// Generic bulk-read for invoice HEADERS (CSV), with selectable fields.
// NOTE: Zoho Bulk Read returns flat CSV and (typically) does NOT include subform rows.
// We use it to fetch all invoice IDs (and useful header fields) efficiently.
export async function fetchAllInvoicesViaBulkRead(
  token: string,
  fields: string[] = ["id", "Subject", "Invoice_Date", "Account_Name.id"]
): Promise<BulkInvoiceCsv[]> {
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  };
  console.log("Fetching all invoices via Bulk Read...");
  // 1) Create job
  const createJobRes = await axios.post(
    `${BASE_URL}/crm/bulk/v6/read`,
    {
      query: {
        module: { api_name: "Invoices" },
        fields,
        page: 1,
      },
    },
    { headers }
  );
  console.log("Created job:", createJobRes.data);
  const jobId: string | undefined = createJobRes.data?.data?.[0]?.details?.id;
  if (!jobId) throw new Error("Failed to create bulk read job for Invoices");

  // 2) Poll status
  let state = "IN_PROGRESS";
  for (let i = 0; i < 60 && state === "IN_PROGRESS"; i++) {
    await sleep(5000);
    const st = await axios.get(`${BASE_URL}/crm/bulk/v6/read/${jobId}`, {
      headers,
    });
    state = st.data?.data?.[0]?.state ?? "IN_PROGRESS";
    if (state === "FAILED")
      throw new Error(`Bulk read failed: ${JSON.stringify(st.data)}`);
  }
  if (state !== "COMPLETED")
    throw new Error("Bulk read did not complete in time");

  // 3) Download result ZIP (CSV)
  const zipRes = await axios.get(
    `${BASE_URL}/crm/bulk/v6/read/${jobId}/result`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        Accept: "application/zip",
      },
      responseType: "arraybuffer",
    }
  );

  const zip = new AdmZip(zipRes.data);
  const entries = zip.getEntries();
  if (!entries.length) throw new Error("No files found in Bulk Read ZIP");

  const csvContent = entries[0]!.getData().toString("utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as BulkInvoiceCsv[];
  return rows;
}
