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

export interface ZohoInvoiceItem {
  Product_Name: { id: string };
  Product_Code: string;
  Assigned_Employee: { id: string };
  Quantity: number;
  Discount: number;
  List_Price: number;
}

export interface ZohoInvoicePayload {
  Subject: string;
  Invoice_Date: string; // yyyy-MM-dd
  Billing_Street: string | null;
  Billing_City: string | null;
  Billing_Code: string | null;
  Billing_Country: string | null;
  Billing_State: string | null;
  Account_Name: { id: string };
  Invoiced_Items: ZohoInvoiceItem[];
}
