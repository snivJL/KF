import { syncInvoicesFromZoho } from "@/app/sync/action";
import InvoicesTabClient from "./invoices-tab-client";

export async function runInvoiceSync(
  _: { ok: boolean; message: string; count?: number },
  __: FormData
) {
  "use server";
  try {
    const res = await syncInvoicesFromZoho({ mode: "incremental" });
    return {
      ok: true,
      message: "Sync complete",
      count: res.syncedInvoices,
    } as const;
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Sync failed" } as const;
  }
}

export default async function InvoicesPage() {
  return <InvoicesTabClient action={runInvoiceSync} />;
}
