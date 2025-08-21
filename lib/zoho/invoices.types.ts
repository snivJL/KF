import { z } from "zod";

export const SyncInvoicesSchema = z.object({
  mode: z.enum(["incremental", "full"]).default("incremental"),
  since: z.iso.datetime().optional(),
  pageLimit: z.number().int().min(1).max(2000).default(2000).optional(),
  maxInvoices: z.number().int().min(1).max(100_000).default(100_000).optional(),
});
export type SyncInvoicesInput = z.infer<typeof SyncInvoicesSchema>;

export type ZohoRef = { id: string; name?: string };

export type ZohoSubformRow = {
  id?: string;
  Product?: ZohoRef | null;
  Quantity?: number | string | null;
  List_Price?: number | string | null;
  Discount?: number | string | null;
  Tax?: number | string | null;
  Amount?: number | string | null;
  Total?: number | string | null;
  Employee?: ZohoRef | null;
  [k: string]: unknown;
};

export type ZohoInvoice = {
  id: string;
  Subject?: string;
  Invoice_Date?: string | null;
  Account_Name?: ZohoRef | null;
  Currency?: string | null;
  Status?: string | null;
  Sub_Total?: number | string | null;
  Discount?: number | string | null;
  Tax?: number | string | null;
  Grand_Total?: number | string | null;
  Invoiced_Item?: ZohoSubformRow[];
  [k: string]: unknown;
};
