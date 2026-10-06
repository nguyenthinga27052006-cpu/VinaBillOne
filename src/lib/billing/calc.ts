export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function asMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

export function computeLine(input: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
}) {
  const qty = Number(input.quantity) || 0;
  const price = Number(input.unitPrice) || 0;
  const discount = Math.min(Math.max(Number(input.discountPercent) || 0, 0), 100);
  const rate = Number(input.taxRate) || 0;
  const net = roundMoney(qty * price * (1 - discount / 100));
  const tax = roundMoney(net * (rate / 100));
  return { net, tax, total: roundMoney(net + tax) };
}

export function computeInvoiceTotals(
  lines: { net: number; tax: number; total: number }[],
) {
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.net, 0));
  const taxAmount = roundMoney(lines.reduce((s, l) => s + l.tax, 0));
  const totalAmount = roundMoney(lines.reduce((s, l) => s + l.total, 0));
  return { subtotal, taxAmount, totalAmount };
}

export function remainingOf(total: number, paid: number): number {
  return roundMoney(Math.max(0, total - paid));
}

export function invoiceStatusAfterPayment(
  current: string,
  total: number,
  paid: number,
  dueDate: string,
  today = todayIso(),
): "issued" | "partial" | "paid" | "overdue" {
  if (paid >= total - 0.001) return "paid";
  if (paid > 0.001) {
    if (dueDate < today) return "overdue";
    return "partial";
  }
  if (dueDate < today) return "overdue";
  return current === "overdue" || current === "partial" || current === "issued"
    ? current === "partial"
      ? "issued"
      : (current as "issued" | "overdue")
    : "issued";
}

export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function formatInvoiceNumber(n: number): string {
  return String(n).padStart(7, "0");
}

export function padInvoiceNumber(raw: string | number | null): string {
  if (raw == null || raw === "") return "—";
  const s = String(raw);
  if (/^\d+$/.test(s)) return s.padStart(7, "0");
  return s;
}
