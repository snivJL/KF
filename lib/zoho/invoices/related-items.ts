import axios from "axios";

const BASE_URL = process.env.BASE_URL!;

export async function getInvoiceDetails(invoiceId: string, token: string) {
  const res = await fetch(`${BASE_URL}/crm/v6/Invoices/${invoiceId}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to fetch invoice items");
  return json.data ?? [];
}

export async function updateInvoiceItem(
  employeeId: string,
  userId: string,
  invoiceId: string,
  invoicedItems: unknown[],
  token: string
) {
  console.log(`[updateInvoiceItem] Updating invoice ${invoiceId}`);
  console.log(
    `[updateInvoiceItem] employeeId: ${employeeId}, userId: ${userId}`
  );
  console.log(`[updateInvoiceItem] Number of items: ${invoicedItems.length}`);

  const payload = {
    data: [
      {
        Assigned_Users: [{ Assigned_Users: { id: userId } }],
        Invoiced_Items: invoicedItems.map((item) => ({
          ...(item as Record<string, unknown>),
          Assigned_Employee: employeeId,
        })),
      },
    ],
  };

  console.log(
    `[updateInvoiceItem] Assigning employee ${employeeId} to invoice ${invoiceId} for user ${userId}`
  );

  try {
    const res = await axios.put(
      `${BASE_URL}/crm/v6/Invoices/${invoiceId}`,
      payload,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `[updateInvoiceItem] Update successful for invoice ${invoiceId}`
    );
    return res.data;
  } catch (error: unknown) {
    console.error(
      `[updateInvoiceItem] Error updating invoice ${invoiceId}`,
      error
    );
    throw new Error(
      `Failed to update invoice item: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
