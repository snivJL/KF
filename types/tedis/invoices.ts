export type InvoiceRow = Record<string, string | number | null | undefined>;

export type ValidationResult = {
  Row: number;
  Error: string;
};

export type ValidatedInvoice = {
  subject: string;
  invoiceDate: Date;
  accountCode: string;
  productCode: string;
  employeeCode: string;
  quantity: number;
  discount: number;
  listPrice: number;
  original?: InvoiceRow;
};
