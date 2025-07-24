import { NextResponse } from "next/server";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import axios from "axios";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

const BASE_URL = "https://kf.zohoplatform.com";
const POLL_INTERVAL = 10000;
const MAX_ATTEMPTS = 20;

export async function POST() {
  try {
    const accessToken = await getValidAccessTokenFromServer();
    const headers = {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    };

    // Step 1: Create bulk read job
    console.log("Creating bulk read job...");
    const createRes = await axios.post(
      `${BASE_URL}/crm/bulk/v6/read`,
      {
        query: {
          module: { api_name: "Contacts" },
          fields: ["Code", "First_Name", "Last_Name", "Workflow_Trigger__C"],
        },
      },
      { headers }
    );

    console.log("Bulk read job creation response:", createRes.data);
    const jobId = createRes.data?.data[0]?.details?.id;
    if (!jobId) throw new Error("Failed to create bulk read job");

    // Step 2: Poll for completion
    console.log("Polling for job completion...");
    let state = "IN_PROGRESS";
    let attempts = 0;

    while (state !== "COMPLETED" && attempts < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const stateRes = await axios.get(
        `${BASE_URL}/crm/bulk/v6/read/${jobId}`,
        { headers }
      );

      state = stateRes.data?.data[0]?.state;
      console.log(`Polling attempt #${attempts + 1}: State = ${state}`);
      attempts++;
    }

    if (state !== "COMPLETED") {
      console.error("Job did not complete in time");
      throw new Error("Bulk read job did not complete");
    }

    // Step 3: Download the zip
    const resultUrl = `${BASE_URL}/crm/bulk/v6/read/${jobId}/result`;

    console.log("Downloading result from:", resultUrl);

    const zipRes = await axios.get(resultUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: "application/zip",
      },
      responseType: "arraybuffer",
    });

    console.log("First bytes of ZIP:", zipRes.data.slice(0, 4));

    const zip = new AdmZip(zipRes.data);
    const zipEntries = zip.getEntries();
    console.log(
      "Zip entries found:",
      zipEntries.map((e) => e.entryName)
    );

    if (!zipEntries.length) throw new Error("No files found in the zip");

    const csvContent = zipEntries[0]?.getData().toString("utf-8");
    if (!csvContent) throw new Error("No content found in the zip");

    console.log("Parsing CSV content...");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`Parsed ${records.length} records.`);

    const failedUpserts: { id: string; reason: string }[] = [];

    for (const row of records) {
      console.log("Upserting contact:", row);
      try {
        await prisma.contact.upsert({
          where: { id: row["Id"] },
          update: {
            code: row.Code,
            firstName: row.First_Name,
            lastName: row.Last_Name,
            trigger: row.Workflow_Trigger__C === "true",
            updatedAt: new Date(),
          },
          create: {
            id: row["Id"],
            code: row.Code,
            firstName: row.First_Name,
            lastName: row.Last_Name,
            trigger: row.Workflow_Trigger__C === "true",
            updatedAt: new Date(),
          },
        });
      } catch (upsertError) {
        console.error(`Failed to upsert contact ID ${row["Id"]}:`, upsertError);
        failedUpserts.push({
          id: row["Id"],
          reason: (upsertError as Error)?.message ?? "Unknown error",
        });
      }
    }

    console.log(
      `Sync completed: ${records.length - failedUpserts.length} succeeded, ${
        failedUpserts.length
      } failed.`
    );

    return NextResponse.json({
      synced: records.length - failedUpserts.length,
      failed: failedUpserts,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("Zoho API Error:");
      console.error("Status:", err.response?.status);
      console.error("Data:", err.response?.data);
      console.error("URL:", err.config?.url);
      console.error("Headers:", err.config?.headers);
    } else {
      console.error("Unexpected error:", err);
    }

    return NextResponse.json(
      { error: "Failed to sync contacts." },
      { status: 500 }
    );
  }
}
