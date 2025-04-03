import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/vcrm";
import axios from "axios";

export async function POST() {
  const job = await prisma.syncJob.create({
    data: {
      module: "products",
      status: "queued",
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
          status: "success",
          synced,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "error",
          error: err.message ?? "Unknown error",
        },
      });
    }
  }, 0); // async fire-and-forget
}

async function performProductSync(): Promise<number> {
  const accessToken = await getAccessToken();
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
