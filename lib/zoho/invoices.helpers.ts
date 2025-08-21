import crypto from "crypto";
import { AxiosError } from "axios";
import type { ZohoRef } from "./invoices.types";
import { prisma } from "../prisma";

export const sha = (v: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

export const asDecimal = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n.toFixed(6) : null;
};

export function formatZohoAxiosError(err: unknown): {
  status: number;
  message: string;
} {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 500;
    const message =
      typeof err.response?.data === "string" ? err.response.data : err.message;
    return {
      status,
      message: JSON.stringify(err.response?.data ?? { message }),
    };
  }
  return { status: 500, message: (err as Error).message ?? "Unknown error" };
}

export async function upsertAccounts(refs: ZohoRef[]) {
  if (!refs.length) return;
  await prisma.$transaction(
    refs.map((a) =>
      prisma.account.upsert({
        where: { id: a.id },
        create: { id: a.id, code: a.id, name: a.name ?? "Unknown" },
        update: { name: a.name ?? undefined },
      })
    )
  );
}

export async function upsertProducts(refs: ZohoRef[]) {
  if (!refs.length) return;
  await prisma.$transaction(
    refs.map((p) =>
      prisma.product.upsert({
        where: { id: p.id },
        create: { id: p.id, productCode: p.id, name: p.name ?? "Unknown" },
        update: { name: p.name ?? undefined },
      })
    )
  );
}

export async function upsertEmployees(refs: ZohoRef[]) {
  if (!refs.length) return;
  await prisma.$transaction(
    refs.map((e) =>
      prisma.employee.upsert({
        where: { id: e.id },
        create: { id: e.id, code: e.id, name: e.name ?? "Unknown" },
        update: { name: e.name ?? undefined },
      })
    )
  );
}

export function dedupeRefs(refs: ZohoRef[]): ZohoRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
