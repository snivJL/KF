import AdmZip from "adm-zip";
import { sleep } from "../../helpers";
import axios from "axios";
import { parse } from "csv-parse/sync";

const BASE_URL = process.env.BASE_URL!;
export async function fetchAllInvoicesViaBulkRead(
  token: string
): Promise<{ Id: string; "Owner.id": string }[]> {
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Create bulk read job
  const createJobRes = await axios.post(
    `${BASE_URL}/crm/bulk/v6/read`,
    {
      query: {
        module: { api_name: "Invoices" },
        fields: ["id", "Owner.id"],
        page: 2,
      },
    },
    { headers }
  );

  const jobId = createJobRes.data?.data[0]?.details?.id;
  if (!jobId) throw new Error("Failed to create bulk read job");
  console.log("Bulk read job created:", jobId);

  // 2. Poll for job status
  let status = "IN_PROGRESS";
  let attempts = 0;

  while (status !== "COMPLETED" && attempts < 20) {
    await sleep(5000);
    const stateRes = await axios.get(`${BASE_URL}/crm/bulk/v6/read/${jobId}`, {
      headers,
    });

    status = stateRes.data?.data[0]?.state;

    console.log(`Polling attempt #${attempts + 1}: State = ${status}`);
    attempts++;
  }

  if (status !== "COMPLETED") {
    console.error("Job did not complete in time");
    throw new Error("Bulk read job did not complete");
  }

  // 3. Download ZIP and extract JSON
  const resultUrl = `${BASE_URL}/crm/bulk/v6/read/${jobId}/result`;
  console.log("Downloading result from:", resultUrl);

  const zipRes = await axios.get(resultUrl, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      Accept: "application/zip",
    },
    responseType: "arraybuffer",
  });

  const zip = new AdmZip(zipRes.data);
  const zipEntries = zip.getEntries();

  if (!zipEntries.length) throw new Error("No files found in the zip");

  const csvContent = zipEntries[0]?.getData().toString("utf-8");
  if (!csvContent) throw new Error("No content found in the zip");

  console.log("Parsing CSV content...");
  const invoices = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`Parsed ${invoices.length} invoices from bulk read.`);
  return invoices;
}
