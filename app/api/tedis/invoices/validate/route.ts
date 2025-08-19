import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type {
  InvoiceRow,
  ValidatedInvoice,
  ValidationResult,
} from "@/types/tedis/invoices";
import { format } from "date-fns";
import { assertN8NApiKey } from "@/lib/auth";

const safeFloat = (value: unknown, def = 0.0): number => {
  try {
    return parseFloat(String(value).replace(",", "."));
  } catch {
    return def;
  }
};

const safeInt = (value: unknown, def = 0): number => {
  try {
    return parseInt(String(parseFloat(String(value))));
  } catch {
    return def;
  }
};

function excelDateToJSDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

async function fetchEntitiesFromDB() {
  console.log(
    "Fetching accounts, products, and employees from local database..."
  );
  const [accounts, products, employees] = await Promise.all([
    prisma.account.findMany(),
    prisma.product.findMany(),
    prisma.employee.findMany(),
  ]);
  console.log(
    `Fetched ${accounts.length} accounts, ${products.length} products, ${employees.length} employees.`
  );
  return {
    accounts,
    products,
    employees,
  };
}

export async function POST(req: NextRequest) {
  console.log("Starting invoice validation...");
  const body = await req.json();
  const rows: InvoiceRow[] = body.rows || [];
  assertN8NApiKey(req.headers);

  if (!Array.isArray(rows)) {
    console.warn("Validation failed: Missing data .");
    return Response.json({ error: "Missing data." }, { status: 400 });
  }

  const { accounts, products, employees } = await fetchEntitiesFromDB();
  const accountDict = Object.fromEntries(
    accounts.map((a: (typeof accounts)[0]) => [a.code, a])
  );
  const productDict = Object.fromEntries(
    products.map((p: (typeof products)[0]) => [p.productCode, p])
  );
  const employeeDict = Object.fromEntries(
    employees.map((e: (typeof employees)[0]) => [e.code, e])
  );

  const validInvoices: ValidatedInvoice[] = [];
  const errors: ValidationResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) {
      throw new Error("Invalid row");
    }
    const rowNum = i + 2;
    const subject = String(row["Invoice D. ID"] || "").trim();

    if (!subject) {
      console.warn(`Row ${rowNum}: Missing Invoice D. ID.`);
      errors.push({ Row: rowNum, Error: "Missing Invoice D. ID." });
      continue;
    }

    const rawDate = row["Invoice Date"] as string;
    const invoiceDate =
      typeof rawDate === "number"
        ? excelDateToJSDate(rawDate)
        : new Date(rawDate);

    if (isNaN(invoiceDate.getTime())) {
      console.warn(
        `Row ${rowNum}: Invalid date format '${row["Invoice Date"]}'`
      );
      errors.push({
        Row: rowNum,
        Error: `Invalid date format: ${row["Invoice Date"]}`,
      });
      continue;
    }

    const account = accountDict[String(row["Account Code"] || "").trim()];
    const product = productDict[String(row["Product Code"] || "").trim()];
    const employee = employeeDict[String(row["Employee Code"] || "").trim()];

    if (!account) {
      console.warn(`Row ${rowNum}: Account ${row["Account Code"]} not found.`);
      errors.push({
        Row: rowNum,
        Error: `Account ${row["Account Code"]} not found.`,
      });
    }
    if (!product) {
      console.warn(`Row ${rowNum}: Product ${row["Product Code"]} not found.`);
      errors.push({
        Row: rowNum,
        Error: `Product ${row["Product Code"]} not found.`,
      });
    }
    if (!employee) {
      console.warn(
        `Row ${rowNum}: Employee ${row["Employee Code"]} not found.`
      );
      errors.push({
        Row: rowNum,
        Error: `Employee ${row["Employee Code"]} not found.`,
      });
    }
    if (!account || !product || !employee) continue;

    validInvoices.push({
      subject,
      invoiceDate: format(invoiceDate, "yyyy-MM-dd"),
      accountId: account.id,
      productId: product.id,
      productCode: product.productCode,
      shippingCity: account.shippingCity,
      shippingCode: account.shippingCode,
      shippingCountry: account.shippingCountry,
      shippingProvince: account.shippingProvince,
      shippingStreet: account.shippingStreet,
      employeeId: employee.id,
      quantity: safeInt(row["Quantity"]),
      discount: safeFloat(row["Total Discount on item"]),
      listPrice: Math.round(safeFloat(row["List Price per unit (-VAT)"])),
      original: { ...row, "Invoice Date": format(invoiceDate, "yyyy-MM-dd") },
    });
  }

  console.log(
    `Validation complete. ${validInvoices.length} valid, ${errors.length} errors.`
  );
  return Response.json({ validInvoices, errors });
}
