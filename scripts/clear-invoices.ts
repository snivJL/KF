// /scripts/clearInvoices.ts
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("🗑️ Deleting all invoice items...");
  await prisma.invoiceItem.deleteMany();
  console.log("✅ Invoice items deleted.");

  console.log("🗑️ Deleting all invoices...");
  await prisma.invoice.deleteMany();
  console.log("✅ Invoices deleted.");
}

main()
  .catch((err) => {
    console.error("❌ Clear failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
