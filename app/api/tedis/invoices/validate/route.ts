import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type {
  InvoiceRow,
  ValidatedInvoice,
  ValidationResult,
} from "@/types/tedis/invoices";
import axios from "axios";
import { format } from "date-fns";

const BASE_URL = process.env.BASE_URL || "https://kf.zohoplatform.com";

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
    Accounts: accounts,
    Products: products,
    Employees: employees,
  };
}

export async function POST(req: NextRequest) {
  console.log("Starting invoice validation...");
  const body = await req.json();
  const rows: InvoiceRow[] = body.rows || [];
  const accessToken: string = body.accessToken;
  if (!Array.isArray(rows) || !accessToken) {
    console.warn("Validation failed: Missing data or token.");
    return Response.json({ error: "Missing data or token." }, { status: 400 });
  }

  const entities = await fetchEntitiesFromDB();
  const accountDict = Object.fromEntries(
    entities.Accounts.map((a) => [a.code, a])
  );
  const productDict = Object.fromEntries(
    entities.Products.map((p) => [p.productCode, p])
  );
  const employeeDict = Object.fromEntries(
    entities.Employees.map((e) => [e.code, e])
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

    try {
      const searchURL = `${BASE_URL}/crm/v6/Invoices/search?criteria=Subject:equals:${encodeURIComponent(
        subject
      )}&fields=Id,Subject`;
      const res = await axios.get(searchURL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      });

      if (res.status === 200 && res.data?.data?.length) {
        console.warn(`Row ${rowNum}: Invoice ${subject} already exists.`);
        errors.push({
          Row: rowNum,
          Error: `Invoice ${subject} already exists.`,
        });
        continue;
      } else if (res.status !== 204 && res.status !== 200) {
        console.warn(`Row ${rowNum}: Zoho error ${res.status}`);
        errors.push({ Row: rowNum, Error: `Zoho error: ${res.status}` });
        continue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `Row ${rowNum}: Zoho search failed with error - ${message}`
      );
      errors.push({ Row: rowNum, Error: `Search failed: ${message}` });
      continue;
    }
    console.log(row["Invoice Date"]);
    // const invoiceDate = new Date(row["Invoice Date"] as string);
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
    console.log(invoiceDate, format(invoiceDate, "yyyy-MM-dd"));
    validInvoices.push({
      subject,
      invoiceDate: format(invoiceDate, "yyyy-MM-dd"),
      accountId: account.id,
      productId: product.id,
      productCode: product.productCode,
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
