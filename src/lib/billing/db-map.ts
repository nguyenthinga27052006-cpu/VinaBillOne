import { asInt, asMoney } from "./calc";
import type {
  AuditLog,
  Customer,
  InvoiceListItem,
  InvoiceStatus,
  PaymentListItem,
  PaymentStatus,
  Product,
} from "./types";

export function mapInvoiceList(row: Record<string, unknown>): InvoiceListItem {
  return {
    id: asInt(row.id),
    invoiceNumber: row.invoice_number == null ? null : String(row.invoice_number),
    seriesCode: String(row.series_code ?? ""),
    customerId: asInt(row.customer_id),
    customerName: String(row.customer_name ?? ""),
    customerCode: String(row.customer_code ?? ""),
    issueDate: String(row.issue_date ?? ""),
    dueDate: String(row.due_date ?? ""),
    status: String(row.status) as InvoiceStatus,
    subtotal: asMoney(row.subtotal),
    taxAmount: asMoney(row.tax_amount),
    totalAmount: asMoney(row.total_amount),
    paidAmount: asMoney(row.paid_amount),
    currency: String(row.currency ?? "VND"),
    createdByName: String(row.created_by_name ?? ""),
  };
}

export function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: asInt(row.id),
    code: String(row.code),
    name: String(row.name),
    taxCode: row.tax_code == null ? null : String(row.tax_code),
    address: row.address == null ? null : String(row.address),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    customerType: row.customer_type === "individual" ? "individual" : "enterprise",
    paymentTermDays: asInt(row.payment_term_days),
    creditLimit: row.credit_limit == null ? null : asMoney(row.credit_limit),
    groupName: row.group_name == null ? null : String(row.group_name),
    groupId: row.group_id == null ? null : asInt(row.group_id),
    isActive: Boolean(row.is_active),
    outstanding: asMoney(row.outstanding),
    invoiceCount: asInt(row.invoice_count),
  };
}

export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: asInt(row.id),
    code: String(row.code),
    name: String(row.name),
    unit: String(row.unit),
    unitPrice: asMoney(row.unit_price),
    taxRateId: asInt(row.tax_rate_id),
    taxRate: asMoney(row.tax_rate),
    category: String(row.category ?? "Dịch vụ"),
    isActive: Boolean(row.is_active),
  };
}

export function mapPaymentList(row: Record<string, unknown>): PaymentListItem {
  const amount = asMoney(row.amount);
  const allocated = asMoney(row.allocated);
  return {
    id: asInt(row.id),
    customerId: asInt(row.customer_id),
    customerName: String(row.customer_name ?? ""),
    paymentDate: String(row.payment_date ?? ""),
    amount,
    allocated,
    remaining: Math.max(0, amount - allocated),
    methodName: String(row.method_name ?? ""),
    reference: row.reference == null ? null : String(row.reference),
    status: String(row.status) as PaymentStatus,
    notes: row.notes == null ? null : String(row.notes),
    recordedByName: String(row.recorded_by_name ?? ""),
  };
}

export function mapAudit(row: Record<string, unknown>): AuditLog {
  return {
    id: asInt(row.id),
    actorName: String(row.actor_name ?? ""),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: asInt(row.entity_id),
    summary: String(row.summary ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export const INVOICE_FIELDS = `
  i.id, i.invoice_number, s.code as series_code, i.customer_id,
  c.name as customer_name, c.code as customer_code,
  i.issue_date, i.due_date, i.status, i.subtotal, i.tax_amount,
  i.total_amount, i.paid_amount, i.currency, st.full_name as created_by_name
`;

export const INVOICE_FROM = `
  from invoices i
  join invoice_series s on s.id = i.series_id
  join customers c on c.id = i.customer_id
  join staff st on st.id = i.created_by
`;

export const INVOICE_LIST_SQL = `select ${INVOICE_FIELDS} ${INVOICE_FROM}`;
