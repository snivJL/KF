export type InvoiceRow = Record<string, string | number | null | undefined>;

export type ValidationResult = {
  Row: number;
  Error: string;
};

export type ValidatedInvoice = {
  id: string;
  subject: string;
  invoiceDate: string;
  accountId: string;
  productId: string;
  productCode: string;
  employeeId: string;
  shippingCity: string | null;
  shippingCode: string | null;
  shippingCountry: string | null;
  shippingProvince: string | null;
  shippingStreet: string | null;
  quantity: number;
  discount: number;
  listPrice: number;
  original?: InvoiceRow;
};

export type EnrichedValidatedInvoice = ValidatedInvoice & {
  itemId: number;
};
