import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";
import { SyncModule, SyncStatus } from "@prisma/client";
import { getAccessTokenFromServer } from "@/lib/auth-server";

export async function POST() {
  const job = await prisma.syncJob.create({
    data: {
      module: SyncModule.accounts,
      status: SyncStatus.queued,
    },
  });

  // Start background task without waiting
  syncProductsInBackground(job.id);

  return NextResponse.json({ jobId: job.id });
}

async function syncProductsInBackground(jobId: string) {
  // Run in background without blocking
  setTimeout(async () => {
    try {
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: "processing" },
      });

      const synced = await performProductSync();
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: SyncStatus.success,
          synced,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: SyncStatus.error,
          error: err.message ?? "Unknown error",
        },
      });
    }
  }, 0); // async fire-and-forget
}

async function performProductSync(): Promise<number> {
  const accessToken = await getAccessTokenFromServer();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const response = await axios.get(
    `${process.env.BASE_URL}/crm/v6/Products?fields=id,Product_Code,Product_Name`,
    { headers }
  );

  const products = response.data?.data || [];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        productCode: p.Product_Code,
        name: p.Product_Name,
        updatedAt: new Date(),
      },
      create: {
        id: p.id,
        productCode: p.Product_Code,
        name: p.Product_Name,
        updatedAt: new Date(),
      },
    });
  }

  return products.length;
}

async function updateMeetingProductPicklistOptions(activeProducts: any[]) {
  const accessToken = await getAccessTokenFromServer();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // 1. Build the new picklist values
  const picklistValues = activeProducts.map((p) => ({
    display_value: `${p.Product_Code} - ${p.Product_Name}`,
    actual_value: `${p.Product_Code} - ${p.Product_Name}`,
  }));

  // 2. Patch the Meetings field "Product(s)"
  // First, fetch the field ID dynamically (optional), or hardcode if known
  const fieldApiName = "Products"; // Assuming your Meetings field is named "Products"

  await axios.put(
    `${process.env.BASE_URL}/crm/v6/settings/fields?module=Meetings`,
    {
      fields: [
        {
          api_name: fieldApiName,
          pick_list_values: picklistValues,
        },
      ],
    },
    { headers }
  );
}
