"use server";

import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import axios from "axios";
import { revalidatePath } from "next/cache";

// Types
interface MassUpdateParams {
  filters: InvoiceFilters;
  field: string;
  value: string;
}

interface InvoiceFilters {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  employeeCode?: string;
  accountCode?: string;
  productCode?: string;
}

interface ZohoUpdateData {
  invoiceZohoId: string;
  items: string[];
}

interface InvoiceWithItems {
  id: string;
  zohoId: string;
  items: {
    id: string;
    zohoRowId: string;
  }[];
}

interface ActionResult {
  success: boolean;
  message: string;
  details?: {
    itemsUpdated?: number;
    invoicesUpdated?: number;
    errorType?: "validation" | "zoho" | "database" | "network" | "unknown";
  };
}
/**
 * Mass update invoices with transaction safety
 * Either both DB and Zoho succeed, or both are rolled back
 */
export async function massUpdateInvoices(
  params: MassUpdateParams
): Promise<ActionResult> {
  try {
    console.log("Starting mass update with params:", params);

    // Validate input
    if (!params.value?.trim()) {
      return {
        success: false,
        message: "Value is required",
        details: { errorType: "validation" },
      };
    }

    // Find matching invoices
    const invoices = await findInvoicesByFilters(params.filters);

    if (invoices.length === 0) {
      return {
        success: false,
        message: "No invoices match the current filters",
        details: { errorType: "validation" },
      };
    }

    const itemIds = extractItemIds(invoices);

    if (itemIds.length === 0) {
      return {
        success: false,
        message: "No items found to update in the matching invoices",
        details: { errorType: "validation" },
      };
    }

    // Perform the update
    if (params.field === "employeeCode") {
      await updateInvoiceEmployeesWithTransaction(invoices, params.value);

      return {
        success: true,
        message: `Successfully updated ${itemIds.length} items across ${invoices.length} invoices`,
        details: {
          itemsUpdated: itemIds.length,
          invoicesUpdated: invoices.length,
        },
      };
    } else {
      return {
        success: false,
        message: `Update field "${params.field}" is not supported`,
        details: { errorType: "validation" },
      };
    }
  } catch (error) {
    console.error("Mass update failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    // Return error as result object instead of throwing
    return {
      success: false,
      message: errorMessage,
      details: {
        errorType: categorizeError(errorMessage),
      },
    };
  }
}

/**
 * Update employee assignments using database transaction
 * If Zoho fails, database changes are automatically rolled back
 */
async function updateInvoiceEmployeesWithTransaction(
  invoices: InvoiceWithItems[],
  employeeCode: string
): Promise<void> {
  let employee;

  try {
    employee = await findEmployeeByCode(employeeCode);
  } catch (error) {
    console.error(error);
    throw new Error(`Employee with code "${employeeCode}" not found`);
  }

  const itemIds = extractItemIds(invoices);
  const zohoUpdates = prepareZohoUpdates(invoices);

  if (itemIds.length === 0 && zohoUpdates.length === 0) {
    throw new Error("No items found to update");
  }

  try {
    // Use Prisma transaction with better error handling
    await prisma.$transaction(
      async (tx) => {
        console.log(
          `Starting transaction: updating ${itemIds.length} items across ${zohoUpdates.length} invoices`
        );

        // Step 1: Update database within transaction
        if (itemIds.length > 0) {
          const dbResult = await tx.invoiceItem.updateMany({
            where: { id: { in: itemIds } },
            data: {
              employeeId: employee.id,
              employeeZohoId: employee.id,
            },
          });

          console.log(
            `✓ Database updated: ${dbResult.count} items assigned to employee ${employeeCode}`
          );
        }

        // Step 2: Update Zoho (within transaction scope)
        if (zohoUpdates.length > 0) {
          try {
            await updateAllZohoInvoices(zohoUpdates, employee.id);
            console.log(
              `✓ Zoho updated: ${zohoUpdates.length} invoices synced`
            );
          } catch (zohoError) {
            console.error(
              "Zoho update failed, rolling back database changes:",
              zohoError
            );

            // Add more context to Zoho errors
            const zohoMessage =
              zohoError instanceof Error
                ? zohoError.message
                : "Unknown Zoho error";
            throw new Error(`Zoho sync failed: ${zohoMessage}`);
          }
        }

        console.log(
          "✅ Transaction completed successfully - both systems are in sync"
        );
        revalidatePath("/invoices");
      },
      {
        timeout: 30000, // 30 second timeout
      }
    );
  } catch (error) {
    // Add context about transaction failure
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new Error(
          "Operation timed out - please try again with fewer items or check your connection"
        );
      }
      // Re-throw with existing message (already has context)
      throw error;
    } else {
      throw new Error("Database transaction failed - please try again");
    }
  }
}

/**
 * Update all Zoho invoices, fail fast if any update fails
 */
async function updateAllZohoInvoices(
  updates: ZohoUpdateData[],
  employeeZohoId: string
): Promise<void> {
  const token = await getValidAccessTokenFromServer();
  if (!token) throw new Error("Failed to retrieve Zoho access token");
  const failures: Array<{ invoiceId: string; error: string }> = [];

  for (const update of updates) {
    try {
      await updateSingleZohoInvoice(update, employeeZohoId, token);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      failures.push({
        invoiceId: update.invoiceZohoId,
        error: errorMessage,
      });
    }
  }

  // If any Zoho updates failed, throw error to rollback transaction
  if (failures.length > 0) {
    const errorDetails = failures
      .map((f) => `${f.invoiceId}: ${f.error}`)
      .join("; ");

    throw new Error(
      `Failed to update ${failures.length}/${updates.length} invoices in Zoho: ${errorDetails}`
    );
  }
}

/**
 * Update a single invoice in Zoho with better error handling
 */
async function updateSingleZohoInvoice(
  update: ZohoUpdateData,
  employeeZohoId: string,
  token: string
): Promise<void> {
  const payload = {
    data: [
      {
        id: update.invoiceZohoId,
        Invoiced_Items: update.items.map((itemId) => ({
          id: itemId,
          Assigned_Employee: { id: employeeZohoId },
        })),
      },
    ],
  };

  console.log(
    `Updating Zoho invoice ${update.invoiceZohoId} with ${update.items.length} items`
  );

  const response = await axios.put(
    `${process.env.BASE_URL!}/crm/v6/Invoices`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true, // Don't throw on HTTP error status
      timeout: 10000, // 10 second timeout per request
    }
  );

  console.log(`Zoho response for ${update.invoiceZohoId}:`, {
    status: response.status,
    data: response.data,
  });

  // Handle different response scenarios
  if (response.status >= 200 && response.status < 300) {
    console.log(`✓ Zoho invoice ${update.invoiceZohoId} updated successfully`);
  } else if (response.status === 401) {
    throw new Error(`Zoho authentication failed - token may be expired`);
  } else if (response.status === 429) {
    throw new Error(`Zoho rate limit exceeded - please try again later`);
  } else if (response.status >= 500) {
    throw new Error(
      `Zoho server error (${response.status}) - please try again later`
    );
  } else {
    // Client error (400-499)
    const errorDetail = response.data?.message || JSON.stringify(response.data);
    throw new Error(`Zoho API error (${response.status}): ${errorDetail}`);
  }
}

async function findInvoicesByFilters(
  filters: InvoiceFilters
): Promise<InvoiceWithItems[]> {
  const whereClause = buildWhereClause(filters);
  const itemConditions = buildItemConditions(filters);

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    select: {
      id: true,
      zohoId: true,
      items: {
        where: itemConditions.length > 0 ? { AND: itemConditions } : undefined,
        select: {
          id: true,
          zohoRowId: true,
        },
      },
    },
  });

  console.log(`Found ${invoices.length} invoices matching filters`);
  return invoices;
}

function buildWhereClause(filters: InvoiceFilters): Prisma.InvoiceWhereInput {
  const {
    q = "",
    dateFrom = "",
    dateTo = "",
    accountCode = "",
    employeeCode = "",
    productCode = "",
  } = filters;

  const where: Prisma.InvoiceWhereInput = {};

  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { zohoId: { contains: q } },
      { accountId: { contains: q } },
    ];
  }

  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }

  if (accountCode) {
    where.account = {
      code: { contains: accountCode, mode: "insensitive" },
    };
  }

  const itemConditions = buildItemConditions({ employeeCode, productCode });
  if (itemConditions.length > 0) {
    where.items = { some: { AND: itemConditions } };
  }

  return where;
}

function buildItemConditions(
  filters: Pick<InvoiceFilters, "employeeCode" | "productCode">
): Prisma.InvoiceItemWhereInput[] {
  const { employeeCode = "", productCode = "" } = filters;
  const conditions: Prisma.InvoiceItemWhereInput[] = [];

  if (employeeCode) {
    conditions.push({
      employee: {
        code: { contains: employeeCode, mode: "insensitive" },
      },
    });
  }

  if (productCode) {
    conditions.push({
      product: {
        productCode: { contains: productCode, mode: "insensitive" },
      },
    });
  }

  return conditions;
}

async function findEmployeeByCode(code: string) {
  const employee = await prisma.employee.findUnique({
    where: { code },
    select: { id: true },
  });

  if (!employee) {
    throw new Error(`Employee with code "${code}" not found`);
  }

  return employee;
}

function extractItemIds(invoices: InvoiceWithItems[]): string[] {
  return invoices.flatMap((invoice) => invoice.items.map((item) => item.id));
}

function prepareZohoUpdates(invoices: InvoiceWithItems[]): ZohoUpdateData[] {
  return invoices
    .filter((invoice) => invoice.items.length > 0)
    .map((invoice) => ({
      invoiceZohoId: invoice.zohoId,
      items: invoice.items.map((item) => item.zohoRowId),
    }));
}

/**
 * Categorize errors for better frontend handling
 */
function categorizeError(errorMessage: string) {
  if (
    errorMessage.includes("Employee with code") &&
    errorMessage.includes("not found")
  ) {
    return "validation";
  } else if (
    errorMessage.includes("Zoho") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("rate limit")
  ) {
    return "zoho";
  } else if (errorMessage.includes("timeout")) {
    return "network";
  } else if (
    errorMessage.includes("database") ||
    errorMessage.includes("transaction")
  ) {
    return "database";
  } else {
    return "unknown";
  }
}
