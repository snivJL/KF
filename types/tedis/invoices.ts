export type InvoiceRow = Record<string, string | number | null | undefined>;

export type ValidationResult = {
  Row: number;
  Error: string;
};

export type ValidatedInvoice = {
  subject: string;
  invoiceDate: string;
  accountId: string;
  productId: string;
  productCode: string;
  employeeId: string;
  quantity: number;
  discount: number;
  listPrice: number;
  original?: InvoiceRow;
};

export type EnrichedValidatedInvoice = ValidatedInvoice & {
  itemId: number;
};
