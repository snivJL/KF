export function currencyFormat(n: number | null, currency?: string | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: currency ? "currency" : "decimal",
    currency: currency ?? undefined,
    maximumFractionDigits: 2,
  }).format(n);
}

export function dateFormat(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString();
}
