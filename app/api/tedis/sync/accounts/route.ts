import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/vcrm";
import { prisma } from "@/lib/prisma";
import axios from "axios";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

const BASE_URL = "https://kf.zohoplatform.com";
const POLL_INTERVAL = 10000;
const MAX_ATTEMPTS = 20;

export async function POST() {
  try {
    const accessToken = await getAccessToken();
    const headers = {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    };
    // Step 1: Create bulk read job
    const createRes = await axios.post(
      `${BASE_URL}/crm/bulk/v6/read`,
      {
        query: {
          module: { api_name: "Accounts" },
          fields: ["id", "Code", "Account_Name"],
        },
      },
      { headers }
    );

    const jobId = createRes.data?.data[0]?.details?.id;
    console.log(createRes.data);
    if (!jobId) throw new Error("Failed to create bulk read job");

    // Step 2: Poll for completion
    let state = "IN_PROGRESS";
    let attempts = 0;

    while (state !== "COMPLETED" && attempts < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const stateRes = await axios.get(
        `${BASE_URL}/crm/bulk/v6/read/${jobId}`,
        { headers }
      );
      console.log(stateRes.data?.data[0]);
      // if (stateRes.data?.data[0]?.state === "COMPLETED") {
      //   downloadUrl = stateRes.data?.data[0]?.result?.download_url;
      // }

      state = stateRes.data?.data[0]?.state;
      console.log("Fetching attempt#", attempts, state);
      attempts++;
    }

    // if (state !== "COMPLETED" || !downloadUrl) {
    //   throw new Error(
    //     "Bulk read job did not complete or failed to return a download URL"
    //   );
    // }

    // Step 3: Download the zip
    const resultUrl = `${BASE_URL}/crm/v6/read/${jobId}/result`;

    const zipRes = await axios.get(resultUrl, {
      headers,
      responseType: "arraybuffer",
    });
    console.log("zipRes", zipRes);
    const zip = new AdmZip(zipRes.data);
    const zipEntries = zip.getEntries();
    console.log("zipEntries", zipEntries);
    if (!zipEntries.length) throw new Error("No files found in the zip");

    const csvContent = zipEntries[0].getData().toString("utf-8");
    console.log("csvContent", csvContent);
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });
    console.log("records", records);

    for (const row of records) {
      await prisma.account.upsert({
        where: { id: row.id },
        update: {
          code: row.Code,
          name: row.Account_Name,
          updatedAt: new Date(),
        },
        create: {
          id: row.id,
          code: row.Code,
          name: row.Account_Name,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ synced: records.length });
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
      { error: "Failed to sync accounts." },
      { status: 500 }
    );
  }
}
