import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import {
  addDays,
  asInt,
  asMoney,
  computeInvoiceTotals,
  computeLine,
  daysBetween,
  formatInvoiceNumber,
  remainingOf,
  roundMoney,
  todayIso,
} from "./calc";
import { INVOICE_FIELDS, INVOICE_FROM, INVOICE_LIST_SQL, mapAudit, mapCustomer, mapInvoiceList, mapPaymentList, mapProduct } from "./db-map";
import { assertCan, ROLE_STAFF_ID, type Action } from "./roles";
import { ensureSeeded } from "./seed";
import type {
  AgingRow,
  AuditLog,
  CompanySettings,
  Customer,
  CustomerStatement,
  DashboardData,
  InvoiceDetail,
  InvoiceLine,
  InvoiceListItem,
  InvoiceSeries,
  InvoiceStatus,
  InvoiceUsageReportItem,
  LineInput,
  PaymentDetail,
  PaymentListItem,
  PaymentMethod,
  Product,
  ReminderLog,
  ReminderRule,
  Role,
  StaffMember,
  StatementTransaction,
  TaxRate,
} from "./types";
import { INVOICE_STATUSES, ROLES } from "./types";
import { formatDate, formatVnd } from "./format";
import { buildInvoiceXml } from "./xml";

const roleZ = z.enum(ROLES);
const actorZ = z.object({ actorRole: roleZ.default("chief") });

async function db(): Promise<Sql> {
  const sql = await getSql();
  await ensureSeeded(sql);
  await refreshOverdue(sql);
  return sql;
}

async function refreshOverdue(sql: Sql) {
  const today = todayIso();
  await sql.query(
    `update invoices
        set status = 'overdue', updated_at = now()
      where status in ('issued','partial')
        and due_date < $1
        and paid_amount < total_amount`,
    [today],
  );
}

function staffId(role: Role): number {
  return ROLE_STAFF_ID[role];
}

async function audit(
  sql: Sql,
  role: Role,
  action: string,
  entityType: string,
  entityId: number,
  summary: string,
) {
  await sql`
    insert into audit_logs (actor_id, action, entity_type, entity_id, summary)
    values (${staffId(role)}, ${action}, ${entityType}, ${entityId}, ${summary})
  `;
}

async function history(
  sql: Sql,
  invoiceId: number,
  from: string | null,
  to: string,
  role: Role,
  note?: string | null,
) {
  await sql`
    insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
    values (${invoiceId}, ${from}, ${to}, ${note ?? null}, ${staffId(role)})
  `;
}

function guard(role: Role, action: Action) {
  assertCan(role, action);
}

const INVOICE_SELECT = INVOICE_LIST_SQL;

async function loadLines(sql: Sql, invoiceId: number): Promise<InvoiceLine[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `select it.id, it.product_id, p.code as product_code, it.description,
            coalesce(p.unit, 'lần') as unit, it.quantity, it.unit_price, it.discount_percent,
            it.tax_rate_id, t.rate as tax_rate, t.name as tax_name,
            it.tax_amount, it.line_total, it.sort_order
       from invoice_items it
       left join products p on p.id = it.product_id
       join tax_rates t on t.id = it.tax_rate_id
      where it.invoice_id = $1
      order by it.sort_order, it.id`,
    [invoiceId],
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    productId: r.product_id == null ? null : asInt(r.product_id),
    productCode: r.product_code == null ? null : String(r.product_code),
    description: String(r.description),
    unit: String(r.unit ?? "lần"),
    quantity: asMoney(r.quantity),
    unitPrice: asMoney(r.unit_price),
    discountPercent: asMoney(r.discount_percent),
    taxRateId: asInt(r.tax_rate_id),
    taxRate: asMoney(r.tax_rate),
    taxName: String(r.tax_name ?? ""),
    taxAmount: asMoney(r.tax_amount),
    lineTotal: asMoney(r.line_total),
    sortOrder: asInt(r.sort_order),
  }));
}

async function computeFromInputs(sql: Sql, items: LineInput[]) {
  if (items.length === 0) throw new Error("Hóa đơn phải có ít nhất một dòng hàng.");
  const taxes = await sql<{ id: number; rate: string }>`select id, rate from tax_rates`;
  const taxMap = new Map(taxes.map((t) => [asInt(t.id), asMoney(t.rate)]));
  const computed = items.map((it, idx) => {
    const rate = taxMap.get(it.taxRateId);
    if (rate == null) throw new Error("Thuế suất không hợp lệ.");
    if (!it.description.trim()) throw new Error("Mô tả hàng hóa không được để trống.");
    if (it.quantity <= 0) throw new Error("Số lượng phải lớn hơn 0.");
    if (it.unitPrice < 0) throw new Error("Đơn giá không hợp lệ.");
    const line = computeLine({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent,
      taxRate: rate,
    });
    return { ...it, ...line, sortOrder: idx + 1 };
  });
  return { computed, totals: computeInvoiceTotals(computed) };
}

async function replaceItems(
  sql: Sql,
  invoiceId: number,
  computed: Awaited<ReturnType<typeof computeFromInputs>>["computed"],
) {
  await sql`delete from invoice_items where invoice_id = ${invoiceId}`;
  for (const line of computed) {
    await sql`
      insert into invoice_items (
        invoice_id, product_id, description, quantity, unit_price, discount_percent,
        tax_rate_id, tax_amount, line_total, sort_order
      ) values (
        ${invoiceId}, ${line.productId}, ${line.description.trim()}, ${line.quantity},
        ${line.unitPrice}, ${line.discountPercent}, ${line.taxRateId}, ${line.tax},
        ${line.total}, ${line.sortOrder}
      )
    `;
  }
}

async function fetchInvoice(sql: Sql, id: number): Promise<InvoiceDetail> {
  const rows = await sql.query<Record<string, unknown>>(
    `select ${INVOICE_FIELDS},
            i.notes, i.e_invoice_id, i.created_at, i.issued_at, i.cancelled_at,
            i.cancel_reason, i.adjusted_from_id, c.tax_code as customer_tax_code,
            c.address as customer_address, c.email as customer_email,
            c.phone as customer_phone, c.customer_type, i.series_id
     ${INVOICE_FROM}
      where i.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error("Không tìm thấy hóa đơn.");
  const base = mapInvoiceList(row);
  const items = await loadLines(sql, id);
  const hist = await sql.query<Record<string, unknown>>(
    `select h.id, h.from_status, h.to_status, h.note, st.full_name as actor_name, h.created_at
       from invoice_status_history h
       join staff st on st.id = h.actor_id
      where h.invoice_id = $1
      order by h.created_at, h.id`,
    [id],
  );
  const alloc = await sql.query<Record<string, unknown>>(
    `select pa.id, pa.payment_id, pa.allocated_amount, p.payment_date, m.name as method_name,
            p.reference, p.status
       from payment_allocations pa
       join payments p on p.id = pa.payment_id
       join payment_methods m on m.id = p.payment_method_id
      where pa.invoice_id = $1 and p.status <> 'reversed'
      order by p.payment_date, pa.id`,
    [id],
  );
  const reminders = await sql.query<Record<string, unknown>>(
    `select r.id, r.invoice_id, i.invoice_number, c.name as customer_name, r.reminder_type,
            r.status, r.sent_at, r.content_snapshot, r.retry_count, r.created_at,
            i.due_date
       from reminder_logs r
       join invoices i on i.id = r.invoice_id
       join customers c on c.id = i.customer_id
      where r.invoice_id = $1
      order by r.created_at desc`,
    [id],
  );
  return {
    ...base,
    notes: row.notes == null ? null : String(row.notes),
    eInvoiceId: row.e_invoice_id == null ? null : String(row.e_invoice_id),
    createdAt: String(row.created_at ?? ""),
    issuedAt: row.issued_at == null ? null : String(row.issued_at),
    cancelledAt: row.cancelled_at == null ? null : String(row.cancelled_at),
    cancelReason: row.cancel_reason == null ? null : String(row.cancel_reason),
    adjustedFromId: row.adjusted_from_id == null ? null : asInt(row.adjusted_from_id),
    customerTaxCode: row.customer_tax_code == null ? null : String(row.customer_tax_code),
    customerAddress: row.customer_address == null ? null : String(row.customer_address),
    customerEmail: row.customer_email == null ? null : String(row.customer_email),
    customerPhone: row.customer_phone == null ? null : String(row.customer_phone),
    customerType: row.customer_type === "individual" ? "individual" : "enterprise",
    seriesId: asInt(row.series_id),
    items,
    history: hist.map((h) => ({
      id: asInt(h.id),
      fromStatus: h.from_status == null ? null : String(h.from_status),
      toStatus: String(h.to_status),
      note: h.note == null ? null : String(h.note),
      actorName: String(h.actor_name ?? ""),
      createdAt: String(h.created_at ?? ""),
    })),
    allocations: alloc.map((a) => ({
      id: asInt(a.id),
      paymentId: asInt(a.payment_id),
      allocatedAmount: asMoney(a.allocated_amount),
      paymentDate: String(a.payment_date ?? ""),
      methodName: String(a.method_name ?? ""),
      reference: a.reference == null ? null : String(a.reference),
      status: a.status as PaymentDetail["status"],
    })),
    reminders: reminders.map(mapReminder),
  };
}

function mapReminder(r: Record<string, unknown>): ReminderLog {
  const due = String(r.due_date ?? "");
  return {
    id: asInt(r.id),
    invoiceId: asInt(r.invoice_id),
    invoiceNumber: String(r.invoice_number ?? "—"),
    customerName: String(r.customer_name ?? ""),
    reminderType: String(r.reminder_type ?? "email"),
    status: String(r.status ?? ""),
    sentAt: r.sent_at == null ? null : String(r.sent_at),
    contentSnapshot: r.content_snapshot == null ? null : String(r.content_snapshot),
    retryCount: asInt(r.retry_count),
    createdAt: String(r.created_at ?? ""),
    dueDate: due,
    daysOverdue: due ? Math.max(0, daysBetween(due, todayIso())) : 0,
  };
}

export const bootstrapApp = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const companyRows = await sql<{ key: string; value: string }>`select key, value from system_settings`;
  const company = Object.fromEntries(companyRows.map((r) => [r.key, r.value])) as CompanySettings;
  return { company };
});

export const getLookups = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const [tax, series, methods, groups, products] = await Promise.all([
    sql<{ id: number; name: string; rate: string; is_active: boolean }>`select id, name, rate, is_active from tax_rates order by rate`,
    sql<{ id: number; code: string; name: string; prefix: string; current_number: number; year: number; is_active: boolean }>`select * from invoice_series order by year desc`,
    sql<{ id: number; code: string; name: string }>`select id, code, name from payment_methods order by id`,
    sql<{ id: number; name: string; discount_percent: string }>`select id, name, discount_percent from customer_groups order by id`,
    sql.query<Record<string, unknown>>(
      `select p.*, t.rate as tax_rate from products p join tax_rates t on t.id = p.tax_rate_id where p.is_active = true order by p.code`,
    ),
  ]);
  return {
    taxRates: tax.map((t) => ({
      id: asInt(t.id),
      name: t.name,
      rate: asMoney(t.rate),
      isActive: Boolean(t.is_active),
    })) satisfies TaxRate[],
    series: series.map((s) => ({
      id: asInt(s.id),
      code: s.code,
      name: s.name,
      prefix: s.prefix,
      currentNumber: asInt(s.current_number),
      year: asInt(s.year),
      isActive: Boolean(s.is_active),
    })) satisfies InvoiceSeries[],
    methods: methods.map((m) => ({
      id: asInt(m.id),
      code: m.code,
      name: m.name,
    })) satisfies PaymentMethod[],
    groups: groups.map((g) => ({
      id: asInt(g.id),
      name: g.name,
      discountPercent: asMoney(g.discount_percent),
    })),
    products: products.map(mapProduct),
  };
});

export const getDashboard = createServerFn({ method: "GET" }).handler(async (): Promise<DashboardData> => {
  const sql = await db();
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [kpiRows, monthly, breakdown, agingRows, dueSoon, overdue, recentPay] = await Promise.all([
    sql.query<Record<string, unknown>>(
      `select
         count(*) filter (where issue_date >= $1 and status not in ('cancelled','draft'))::int as invoices_this_month,
         coalesce(sum(total_amount) filter (where issue_date >= $1 and status not in ('cancelled','draft')),0) as revenue_this_month,
         coalesce(sum(total_amount - paid_amount) filter (where status in ('issued','partial','overdue')),0) as outstanding,
         count(*) filter (where status = 'overdue')::int as overdue_count,
         coalesce(sum(total_amount - paid_amount) filter (where status = 'overdue'),0) as overdue_amount,
         count(*) filter (where status = 'draft')::int as draft_count,
         count(*) filter (where status = 'pending')::int as pending_count,
         coalesce(sum(paid_amount) filter (where status not in ('cancelled','draft')),0) as collected,
         coalesce(sum(total_amount) filter (where status not in ('cancelled','draft')),0) as billed
       from invoices`,
      [monthStart],
    ),
    sql.query<{ month: string; revenue: string; collected: string }>(
      `select to_char(issue_date, 'YYYY-MM') as month,
              coalesce(sum(total_amount),0) as revenue,
              coalesce(sum(paid_amount),0) as collected
         from invoices
        where status not in ('cancelled','draft')
          and issue_date >= ($1::date - interval '11 months')
        group by 1
        order by 1`,
      [monthStart],
    ),
    sql.query<{ status: InvoiceStatus; count: number; amount: string }>(
      `select status, count(*)::int as count, coalesce(sum(total_amount),0) as amount
         from invoices
        group by status`,
    ),
    sql.query<{ bucket: string; count: number; amount: string }>(
      `select bucket, count(*)::int as count, coalesce(sum(remain),0) as amount from (
         select case
                  when due_date >= $1 then 'current'
                  when due_date >= $1::date - 30 then '1-30'
                  when due_date >= $1::date - 60 then '31-60'
                  when due_date >= $1::date - 90 then '61-90'
                  else '90+'
                end as bucket,
                (total_amount - paid_amount) as remain
           from invoices
          where status in ('issued','partial','overdue')
            and total_amount > paid_amount
       ) t group by bucket`,
      [today],
    ),
    sql.query<Record<string, unknown>>(
      `${INVOICE_SELECT}
        where i.status in ('issued','partial')
          and i.due_date >= $1 and i.due_date <= $2
        order by i.due_date
        limit 6`,
      [today, addDays(today, 14)],
    ),
    sql.query<Record<string, unknown>>(
      `${INVOICE_SELECT}
        where i.status = 'overdue'
        order by i.due_date
        limit 6`,
    ),
    sql.query<Record<string, unknown>>(
      `select p.id, p.customer_id, c.name as customer_name, p.payment_date, p.amount,
              coalesce((select sum(allocated_amount) from payment_allocations a where a.payment_id = p.id),0) as allocated,
              m.name as method_name, p.reference, p.status, p.notes, st.full_name as recorded_by_name
         from payments p
         join customers c on c.id = p.customer_id
         join payment_methods m on m.id = p.payment_method_id
         join staff st on st.id = p.recorded_by
        where p.status = 'confirmed'
        order by p.payment_date desc, p.id desc
        limit 5`,
    ),
  ]);

  const k = kpiRows[0] ?? {};
  const billed = asMoney(k.billed);
  const collected = asMoney(k.collected);

  const monthMap = new Map(monthly.map((m) => [m.month, m]));
  const months: DashboardData["monthlyRevenue"] = [];
  const cursor = new Date(`${monthStart}T00:00:00Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() - 11);
  for (let i = 0; i < 12; i++) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = monthMap.get(key);
    months.push({
      month: key,
      revenue: row ? asMoney(row.revenue) : 0,
      collected: row ? asMoney(row.collected) : 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const agingOrder = ["current", "1-30", "31-60", "61-90", "90+"];
  const agingMap = new Map(agingRows.map((a) => [a.bucket, a]));

  return {
    kpis: {
      invoicesThisMonth: asInt(k.invoices_this_month),
      revenueThisMonth: asMoney(k.revenue_this_month),
      outstanding: asMoney(k.outstanding),
      overdueCount: asInt(k.overdue_count),
      overdueAmount: asMoney(k.overdue_amount),
      collectionRate: billed > 0 ? roundMoney((collected / billed) * 100) : 0,
      draftCount: asInt(k.draft_count),
      pendingCount: asInt(k.pending_count),
    },
    monthlyRevenue: months,
    statusBreakdown: breakdown.map((b) => ({
      status: b.status,
      count: asInt(b.count),
      amount: asMoney(b.amount),
    })),
    aging: agingOrder.map((bucket) => ({
      bucket,
      count: asInt(agingMap.get(bucket)?.count),
      amount: asMoney(agingMap.get(bucket)?.amount),
    })),
    dueSoon: dueSoon.map(mapInvoiceList),
    overdue: overdue.map(mapInvoiceList),
    recentPayments: recentPay.map(mapPaymentList),
  };
});

const listInvoicesInput = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  q: z.string().optional(),
  customerId: z.number().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const listInvoices = createServerFn({ method: "GET" })
  .validator(listInvoicesInput)
  .handler(async ({ data }): Promise<InvoiceListItem[]> => {
    const sql = await db();
    const clauses: string[] = ["1=1"];
    const params: unknown[] = [];
    if (data.status) {
      params.push(data.status);
      clauses.push(`i.status = $${params.length}`);
    }
    if (data.customerId) {
      params.push(data.customerId);
      clauses.push(`i.customer_id = $${params.length}`);
    }
    if (data.fromDate) {
      params.push(data.fromDate);
      clauses.push(`i.issue_date >= $${params.length}`);
    }
    if (data.toDate) {
      params.push(data.toDate);
      clauses.push(`i.issue_date <= $${params.length}`);
    }
    if (data.q && data.q.trim()) {
      params.push(`%${data.q.trim()}%`);
      const p = `$${params.length}`;
      clauses.push(`(c.name ilike ${p} or c.code ilike ${p} or coalesce(i.invoice_number,'') ilike ${p})`);
    }
    const rows = await sql.query<Record<string, unknown>>(
      `${INVOICE_SELECT} where ${clauses.join(" and ")} order by i.created_at desc, i.id desc`,
      params,
    );
    return rows.map(mapInvoiceList);
  });

export const getInvoice = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const sql = await db();
    return fetchInvoice(sql, data.id);
  });

const lineZ = z.object({
  productId: z.number().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountPercent: z.number().default(0),
  taxRateId: z.number(),
});

const saveInvoiceZ = actorZ.extend({
  id: z.number().optional(),
  customerId: z.number(),
  seriesId: z.number(),
  issueDate: z.string(),
  dueDate: z.string(),
  notes: z.string().nullable().optional(),
  items: z.array(lineZ).min(1),
});

export const saveInvoice = createServerFn({ method: "POST" })
  .validator(saveInvoiceZ)
  .handler(async ({ data }) => {
    guard(data.actorRole, data.id ? "invoice.edit" : "invoice.create");
    const sql = await db();
    const customer = await sql.query<{ customer_type: string; tax_code: string | null; name: string }>(
      `select customer_type, tax_code, name from customers where id = $1`,
      [data.customerId],
    );
    const c = customer[0];
    if (!c) throw new Error("Không tìm thấy khách hàng.");
    if (c.customer_type === "enterprise" && !c.tax_code) {
      throw new Error("Khách hàng doanh nghiệp bắt buộc phải có mã số thuế.");
    }
    const { computed, totals } = await computeFromInputs(sql, data.items);
    const actor = staffId(data.actorRole);

    if (data.id) {
      const current = await sql.query<{ status: string }>(`select status from invoices where id = $1`, [data.id]);
      if (!current[0]) throw new Error("Không tìm thấy hóa đơn.");
      if (!["draft", "pending"].includes(current[0].status)) {
        throw new Error("Chỉ được sửa hóa đơn ở trạng thái Nháp hoặc Chờ duyệt.");
      }
      await sql`
        update invoices set
          customer_id = ${data.customerId},
          series_id = ${data.seriesId},
          issue_date = ${data.issueDate},
          due_date = ${data.dueDate},
          notes = ${data.notes ?? null},
          subtotal = ${totals.subtotal},
          tax_amount = ${totals.taxAmount},
          total_amount = ${totals.totalAmount},
          updated_at = now()
        where id = ${data.id}
      `;
      await replaceItems(sql, data.id, computed);
      await audit(sql, data.actorRole, "invoice.update", "invoice", data.id, `Cập nhật hóa đơn ${c.name}`);
      return { id: data.id };
    }

    const inserted = await sql<{ id: number }>`
      insert into invoices (
        series_id, customer_id, issue_date, due_date, status,
        subtotal, tax_amount, total_amount, notes, created_by
      ) values (
        ${data.seriesId}, ${data.customerId}, ${data.issueDate}, ${data.dueDate}, 'draft',
        ${totals.subtotal}, ${totals.taxAmount}, ${totals.totalAmount}, ${data.notes ?? null}, ${actor}
      ) returning id
    `;
    const id = asInt(inserted[0]?.id);
    await replaceItems(sql, id, computed);
    await history(sql, id, null, "draft", data.actorRole, "Tạo hóa đơn nháp");
    await audit(sql, data.actorRole, "invoice.create", "invoice", id, `Tạo nháp cho ${c.name}`);
    return { id };
  });

export const submitInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.submit");
    const sql = await db();
    const row = await sql.query<{ status: string }>(`select status from invoices where id = $1`, [data.id]);
    if (!row[0]) throw new Error("Không tìm thấy hóa đơn.");
    if (row[0].status !== "draft") throw new Error("Chỉ gửi duyệt hóa đơn nháp.");
    await sql`update invoices set status = 'pending', updated_at = now() where id = ${data.id}`;
    await history(sql, data.id, "draft", "pending", data.actorRole, "Gửi duyệt");
    await audit(sql, data.actorRole, "invoice.submit", "invoice", data.id, "Gửi duyệt hóa đơn");
    return { ok: true };
  });

export const rejectInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number(), reason: z.string() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.issue");
    const sql = await db();
    const row = await sql.query<{ status: string }>(`select status from invoices where id = $1`, [data.id]);
    if (!row[0] || row[0].status !== "pending") throw new Error("Chỉ từ chối hóa đơn đang chờ duyệt.");
    await sql`update invoices set status = 'draft', updated_at = now() where id = ${data.id}`;
    await history(sql, data.id, "pending", "draft", data.actorRole, data.reason);
    await audit(sql, data.actorRole, "invoice.reject", "invoice", data.id, `Từ chối: ${data.reason}`);
    return { ok: true };
  });

export const issueInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.issue");
    const sql = await db();
    const inv = await fetchInvoice(sql, data.id);
    if (inv.status !== "pending") throw new Error("Chỉ phát hành hóa đơn đang chờ duyệt.");
    if (inv.items.length === 0) throw new Error("Hóa đơn chưa có dòng hàng.");
    if (inv.customerType === "enterprise" && !inv.customerTaxCode) {
      throw new Error("Khách hàng doanh nghiệp bắt buộc phải có MST trước khi phát hành.");
    }
    const seriesRows = await sql.query<{ current_number: number; code: string }>(
      `select current_number, code from invoice_series where id = $1`,
      [inv.seriesId],
    );
    const series = seriesRows[0];
    if (!series) throw new Error("Không tìm thấy ký hiệu hóa đơn.");
    const next = asInt(series.current_number) + 1;
    const number = formatInvoiceNumber(next);
    const eId = `CQT-2026-${series.code}${String(next).padStart(6, "0")}`;
    await sql`
      update invoice_series set current_number = ${next} where id = ${inv.seriesId}
    `;
    await sql`
      update invoices set
        status = 'issued',
        invoice_number = ${number},
        e_invoice_id = ${eId},
        issued_at = now(),
        updated_at = now()
      where id = ${data.id}
    `;
    await history(sql, data.id, "pending", "issued", data.actorRole, `Phát hành số ${series.code}${number}`);
    await audit(sql, data.actorRole, "invoice.issue", "invoice", data.id, `Phát hành ${series.code}${number}`);
    const companyRows = await sql<{ key: string; value: string }>`select key, value from system_settings`;
    const company = Object.fromEntries(companyRows.map((r) => [r.key, r.value])) as CompanySettings;
    const fresh = await fetchInvoice(sql, data.id);
    const xml = buildInvoiceXml(fresh, company);
    await sql`update invoices set xml_body = ${xml} where id = ${data.id}`;
    return { id: data.id, invoiceNumber: number, eInvoiceId: eId };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number(), reason: z.string().min(3) }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.cancel");
    const sql = await db();
    const row = await sql.query<{ status: string; paid_amount: string }>(
      `select status, paid_amount from invoices where id = $1`,
      [data.id],
    );
    if (!row[0]) throw new Error("Không tìm thấy hóa đơn.");
    if (["cancelled", "adjusted", "paid"].includes(row[0].status)) {
      throw new Error("Không thể hủy hóa đơn ở trạng thái hiện tại.");
    }
    if (asMoney(row[0].paid_amount) > 0) {
      throw new Error("Hóa đơn đã có thanh toán. Hãy đảo ngược thanh toán trước khi hủy.");
    }
    const from = row[0].status;
    await sql`
      update invoices set status = 'cancelled', cancelled_at = now(), cancel_reason = ${data.reason}, updated_at = now()
      where id = ${data.id}
    `;
    await history(sql, data.id, from, "cancelled", data.actorRole, data.reason);
    await audit(sql, data.actorRole, "invoice.cancel", "invoice", data.id, data.reason);
    return { ok: true };
  });

export const adjustInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.adjust");
    const sql = await db();
    const src = await fetchInvoice(sql, data.id);
    if (!["issued", "partial", "paid", "overdue"].includes(src.status)) {
      throw new Error("Chỉ điều chỉnh hóa đơn đã phát hành.");
    }
    const inserted = await sql<{ id: number }>`
      insert into invoices (
        series_id, customer_id, issue_date, due_date, status,
        subtotal, tax_amount, total_amount, notes, created_by, adjusted_from_id
      ) values (
        ${src.seriesId}, ${src.customerId}, ${todayIso()}, ${src.dueDate}, 'draft',
        ${src.subtotal}, ${src.taxAmount}, ${src.totalAmount},
        ${`Điều chỉnh từ ${src.seriesCode}${src.invoiceNumber ?? ""}`},
        ${staffId(data.actorRole)}, ${src.id}
      ) returning id
    `;
    const newId = asInt(inserted[0]?.id);
    await replaceItems(
      sql,
      newId,
      src.items.map((it, idx) => ({
        productId: it.productId,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent,
        taxRateId: it.taxRateId,
        net: roundMoney(it.lineTotal - it.taxAmount),
        tax: it.taxAmount,
        total: it.lineTotal,
        sortOrder: idx + 1,
      })),
    );
    await sql`update invoices set status = 'adjusted', updated_at = now() where id = ${src.id}`;
    await history(sql, src.id, src.status, "adjusted", data.actorRole, `Tạo HĐ điều chỉnh #${newId}`);
    await history(sql, newId, null, "draft", data.actorRole, `Điều chỉnh từ HĐ ${src.id}`);
    await audit(sql, data.actorRole, "invoice.adjust", "invoice", newId, `Điều chỉnh HĐ ${src.invoiceNumber}`);
    return { id: newId };
  });

export const duplicateInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.create");
    const sql = await db();
    const src = await fetchInvoice(sql, data.id);
    const inserted = await sql<{ id: number }>`
      insert into invoices (
        series_id, customer_id, issue_date, due_date, status,
        subtotal, tax_amount, total_amount, notes, created_by
      ) values (
        ${src.seriesId}, ${src.customerId}, ${todayIso()}, ${addDays(todayIso(), 30)}, 'draft',
        ${src.subtotal}, ${src.taxAmount}, ${src.totalAmount}, ${src.notes}, ${staffId(data.actorRole)}
      ) returning id
    `;
    const newId = asInt(inserted[0]?.id);
    await replaceItems(
      sql,
      newId,
      src.items.map((it, idx) => ({
        productId: it.productId,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent,
        taxRateId: it.taxRateId,
        net: roundMoney(it.lineTotal - it.taxAmount),
        tax: it.taxAmount,
        total: it.lineTotal,
        sortOrder: idx + 1,
      })),
    );
    await history(sql, newId, null, "draft", data.actorRole, `Sao chép từ HĐ ${src.id}`);
    return { id: newId };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.delete");
    const sql = await db();
    const rows = await sql.query<{ status: string; invoice_number: string | null }>(
      `select status, invoice_number from invoices where id = $1`,
      [data.id],
    );
    const inv = rows[0];
    if (!inv) throw new Error("Không tìm thấy hóa đơn.");
    if (inv.status !== "draft") {
      throw new Error("Chỉ được phép xóa hóa đơn ở trạng thái Nháp.");
    }
    await sql`delete from invoice_items where invoice_id = ${data.id}`;
    await sql`delete from invoice_status_history where invoice_id = ${data.id}`;
    await sql`delete from invoices where id = ${data.id}`;
    await audit(sql, data.actorRole, "invoice.delete", "invoice", data.id, `Xóa hóa đơn nháp #${data.id}`);
    return { success: true };
  });

export const replaceInvoice = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number(), reason: z.string().optional() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "invoice.adjust");
    const sql = await db();
    const src = await fetchInvoice(sql, data.id);
    if (!["issued", "partial", "paid", "overdue"].includes(src.status)) {
      throw new Error("Chỉ thay thế hóa đơn đã phát hành.");
    }
    const reasonText = data.reason?.trim() || "Sai sót thông tin hóa đơn";
    const inserted = await sql<{ id: number }>`
      insert into invoices (
        series_id, customer_id, issue_date, due_date, status,
        subtotal, tax_amount, total_amount, notes, created_by, adjusted_from_id
      ) values (
        ${src.seriesId}, ${src.customerId}, ${todayIso()}, ${src.dueDate}, 'draft',
        ${src.subtotal}, ${src.taxAmount}, ${src.totalAmount},
        ${`Thay thế cho HĐ số ${src.invoiceNumber ?? ""} ký hiệu ${src.seriesCode}. Lý do: ${reasonText}`},
        ${staffId(data.actorRole)}, ${src.id}
      ) returning id
    `;
    const newId = asInt(inserted[0]?.id);
    await replaceItems(
      sql,
      newId,
      src.items.map((it, idx) => ({
        productId: it.productId,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent,
        taxRateId: it.taxRateId,
        net: roundMoney(it.lineTotal - it.taxAmount),
        tax: it.taxAmount,
        total: it.lineTotal,
        sortOrder: idx + 1,
      })),
    );
    await sql`update invoices set status = 'cancelled', cancel_reason = ${`Bị thay thế bởi HĐ mới #${newId}`}, cancelled_at = now(), updated_at = now() where id = ${src.id}`;
    await history(sql, src.id, src.status, "cancelled", data.actorRole, `Bị thay thế bởi HĐ mới #${newId}`);
    await history(sql, newId, null, "draft", data.actorRole, `Hóa đơn thay thế cho HĐ ${src.invoiceNumber ?? src.id}`);
    await audit(sql, data.actorRole, "invoice.replace", "invoice", newId, `Lập HĐ thay thế cho HĐ ${src.invoiceNumber ?? src.id}`);
    return { id: newId };
  });

export const quickPayInvoice = createServerFn({ method: "POST" })
  .validator(
    actorZ.extend({
      invoiceId: z.number(),
      amount: z.number().positive(),
      methodId: z.number(),
      paymentDate: z.string().default(todayIso),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    guard(data.actorRole, "payment.record");
    const sql = await db();
    const inv = await fetchInvoice(sql, data.invoiceId);
    const remaining = remainingOf(inv.totalAmount, inv.paidAmount);
    if (remaining <= 0) throw new Error("Hóa đơn đã được thanh toán đầy đủ.");
    const payAmount = Math.min(data.amount, remaining);

    const pRes = await sql<{ id: number }>`
      insert into payments (
        customer_id, payment_date, amount, payment_method_id, reference, notes, recorded_by, status
      ) values (
        ${inv.customerId}, ${data.paymentDate}, ${data.amount}, ${data.methodId},
        ${data.reference || `TT HĐ ${inv.invoiceNumber ?? inv.id}`},
        ${data.notes || `Thanh toán trực tiếp cho HĐ ${inv.invoiceNumber ?? inv.id}`},
        ${staffId(data.actorRole)}, 'confirmed'
      ) returning id
    `;
    const paymentId = asInt(pRes[0]?.id);

    await sql`
      insert into payment_allocations (payment_id, invoice_id, allocated_amount)
      values (${paymentId}, ${inv.id}, ${payAmount})
    `;

    const newPaid = roundMoney(inv.paidAmount + payAmount);
    const newStatus = newPaid >= inv.totalAmount - 0.001 ? "paid" : "partial";
    await sql`update invoices set paid_amount = ${newPaid}, status = ${newStatus}, updated_at = now() where id = ${inv.id}`;
    await history(sql, inv.id, inv.status, newStatus, data.actorRole, `Thu tiền ${formatVnd(payAmount)} qua phiếu #${paymentId}`);
    await audit(sql, data.actorRole, "payment.record", "payment", paymentId, `Ghi nhận thu tiền HĐ ${inv.invoiceNumber}: ${payAmount}`);

    return { paymentId, newStatus, paidAmount: newPaid };
  });

export const sendInvoiceReminder = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ invoiceId: z.number(), note: z.string().optional() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "reminder.run");
    const sql = await db();
    const inv = await fetchInvoice(sql, data.invoiceId);
    const remaining = remainingOf(inv.totalAmount, inv.paidAmount);
    const snapshot = `Kính gửi ${inv.customerName}, Hóa đơn ${inv.seriesCode}${inv.invoiceNumber ?? ""} ngày ${formatDate(inv.issueDate)} còn nợ ${formatVnd(remaining)}. Vui lòng thanh toán sớm. ${data.note ?? ""}`.trim();

    await sql`
      insert into reminder_logs (
        invoice_id, reminder_type, status, sent_at, content_snapshot
      ) values (
        ${inv.id}, 'email', 'sent', now(), ${snapshot}
      )
    `;
    await audit(sql, data.actorRole, "reminder.send", "invoice", inv.id, `Gửi nhắc nợ trực tiếp cho KH ${inv.customerName}`);
    return { success: true, snapshot };
  });


export const getInvoiceXml = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql.query<{ xml_body: string | null }>(`select xml_body from invoices where id = $1`, [
      data.id,
    ]);
    if (rows[0]?.xml_body) return { xml: rows[0].xml_body };
    const companyRows = await sql<{ key: string; value: string }>`select key, value from system_settings`;
    const company = Object.fromEntries(companyRows.map((r) => [r.key, r.value])) as CompanySettings;
    const inv = await fetchInvoice(sql, data.id);
    return { xml: buildInvoiceXml(inv, company) };
  });

export const listCustomers = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().optional() }))
  .handler(async ({ data }): Promise<Customer[]> => {
    const sql = await db();
    const params: unknown[] = [];
    let where = "1=1";
    if (data.q && data.q.trim()) {
      params.push(`%${data.q.trim()}%`);
      where = `(c.name ilike $1 or c.code ilike $1 or coalesce(c.tax_code,'') ilike $1)`;
    }
    const rows = await sql.query<Record<string, unknown>>(
      `select c.*, g.name as group_name,
              coalesce((select sum(total_amount - paid_amount) from invoices i
                         where i.customer_id = c.id and i.status in ('issued','partial','overdue')),0) as outstanding,
              coalesce((select count(*) from invoices i where i.customer_id = c.id),0)::int as invoice_count
         from customers c
         left join customer_groups g on g.id = c.group_id
        where ${where}
        order by c.code`,
      params,
    );
    return rows.map(mapCustomer);
  });

export const getCustomer = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql.query<Record<string, unknown>>(
      `select c.*, g.name as group_name,
              coalesce((select sum(total_amount - paid_amount) from invoices i
                         where i.customer_id = c.id and i.status in ('issued','partial','overdue')),0) as outstanding,
              coalesce((select count(*) from invoices i where i.customer_id = c.id),0)::int as invoice_count
         from customers c
         left join customer_groups g on g.id = c.group_id
        where c.id = $1`,
      [data.id],
    );
    if (!rows[0]) throw new Error("Không tìm thấy khách hàng.");
    const invoices = await sql.query<Record<string, unknown>>(
      `${INVOICE_SELECT} where i.customer_id = $1 order by i.issue_date desc`,
      [data.id],
    );
    const payments = await sql.query<Record<string, unknown>>(
      `select p.id, p.customer_id, c.name as customer_name, p.payment_date, p.amount,
              coalesce((select sum(allocated_amount) from payment_allocations a where a.payment_id = p.id),0) as allocated,
              m.name as method_name, p.reference, p.status, p.notes, st.full_name as recorded_by_name
         from payments p
         join customers c on c.id = p.customer_id
         join payment_methods m on m.id = p.payment_method_id
         join staff st on st.id = p.recorded_by
        where p.customer_id = $1
        order by p.payment_date desc`,
      [data.id],
    );
    return {
      customer: mapCustomer(rows[0]),
      invoices: invoices.map(mapInvoiceList),
      payments: payments.map(mapPaymentList),
    };
  });

const customerZ = actorZ.extend({
  id: z.number().optional(),
  code: z.string().min(2),
  name: z.string().min(2),
  taxCode: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  customerType: z.enum(["enterprise", "individual"]),
  paymentTermDays: z.number().int().min(0),
  creditLimit: z.number().nullable().optional(),
  groupId: z.number().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const saveCustomer = createServerFn({ method: "POST" })
  .validator(customerZ)
  .handler(async ({ data }) => {
    guard(data.actorRole, "customer.write");
    if (data.customerType === "enterprise" && !data.taxCode) {
      throw new Error("Doanh nghiệp bắt buộc phải có mã số thuế.");
    }
    const sql = await db();
    if (data.id) {
      await sql`
        update customers set
          code = ${data.code.trim()}, name = ${data.name.trim()}, tax_code = ${data.taxCode || null},
          address = ${data.address || null}, email = ${data.email || null}, phone = ${data.phone || null},
          customer_type = ${data.customerType}, payment_term_days = ${data.paymentTermDays},
          credit_limit = ${data.creditLimit}, group_id = ${data.groupId}, is_active = ${data.isActive},
          updated_at = now()
        where id = ${data.id}
      `;
      await audit(sql, data.actorRole, "customer.update", "customer", data.id, `Cập nhật ${data.name}`);
      return { id: data.id };
    }
    const inserted = await sql<{ id: number }>`
      insert into customers (
        code, name, tax_code, address, email, phone, customer_type,
        payment_term_days, credit_limit, group_id, is_active
      ) values (
        ${data.code.trim()}, ${data.name.trim()}, ${data.taxCode || null}, ${data.address || null},
        ${data.email || null}, ${data.phone || null}, ${data.customerType}, ${data.paymentTermDays},
        ${data.creditLimit}, ${data.groupId}, ${data.isActive}
      ) returning id
    `;
    const id = asInt(inserted[0]?.id);
    await audit(sql, data.actorRole, "customer.create", "customer", id, `Thêm ${data.name}`);
    return { id };
  });

export const listProducts = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().optional() }))
  .handler(async ({ data }): Promise<Product[]> => {
    const sql = await db();
    const params: unknown[] = [];
    let where = "1=1";
    if (data.q && data.q.trim()) {
      params.push(`%${data.q.trim()}%`);
      where = `(p.name ilike $1 or p.code ilike $1)`;
    }
    const rows = await sql.query<Record<string, unknown>>(
      `select p.*, t.rate as tax_rate
         from products p join tax_rates t on t.id = p.tax_rate_id
        where ${where}
        order by p.code`,
      params,
    );
    return rows.map(mapProduct);
  });

const productZ = actorZ.extend({
  id: z.number().optional(),
  code: z.string().min(2),
  name: z.string().min(2),
  unit: z.string().min(1),
  unitPrice: z.number().min(0),
  taxRateId: z.number(),
  category: z.string().default("Dịch vụ"),
  isActive: z.boolean().default(true),
});

export const saveProduct = createServerFn({ method: "POST" })
  .validator(productZ)
  .handler(async ({ data }) => {
    guard(data.actorRole, "product.write");
    const sql = await db();
    if (data.id) {
      await sql`
        update products set
          code = ${data.code.trim()}, name = ${data.name.trim()}, unit = ${data.unit},
          unit_price = ${data.unitPrice}, tax_rate_id = ${data.taxRateId},
          category = ${data.category}, is_active = ${data.isActive}, updated_at = now()
        where id = ${data.id}
      `;
      return { id: data.id };
    }
    const inserted = await sql<{ id: number }>`
      insert into products (code, name, unit, unit_price, tax_rate_id, category, is_active)
      values (${data.code.trim()}, ${data.name.trim()}, ${data.unit}, ${data.unitPrice}, ${data.taxRateId}, ${data.category}, ${data.isActive})
      returning id
    `;
    return { id: asInt(inserted[0]?.id) };
  });

const listPaymentsInput = z
  .object({
    customerId: z.number().optional(),
    methodId: z.number().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    q: z.string().optional(),
  })
  .optional();

export const listPayments = createServerFn({ method: "GET" })
  .validator(listPaymentsInput)
  .handler(async ({ data }): Promise<PaymentListItem[]> => {
    const sql = await db();
    const clauses: string[] = ["1=1"];
    const params: unknown[] = [];
    if (data?.customerId) {
      params.push(data.customerId);
      clauses.push(`p.customer_id = $${params.length}`);
    }
    if (data?.methodId) {
      params.push(data.methodId);
      clauses.push(`p.payment_method_id = $${params.length}`);
    }
    if (data?.fromDate) {
      params.push(data.fromDate);
      clauses.push(`p.payment_date >= $${params.length}`);
    }
    if (data?.toDate) {
      params.push(data.toDate);
      clauses.push(`p.payment_date <= $${params.length}`);
    }
    if (data?.q && data.q.trim()) {
      params.push(`%${data.q.trim()}%`);
      const p = `$${params.length}`;
      clauses.push(`(c.name ilike ${p} or coalesce(p.reference, '') ilike ${p} or coalesce(p.notes, '') ilike ${p})`);
    }
    const rows = await sql.query<Record<string, unknown>>(
      `select p.id, p.customer_id, c.name as customer_name, p.payment_date, p.amount,
              coalesce((select sum(allocated_amount) from payment_allocations a where a.payment_id = p.id),0) as allocated,
              m.name as method_name, p.reference, p.status, p.notes, st.full_name as recorded_by_name
         from payments p
         join customers c on c.id = p.customer_id
         join payment_methods m on m.id = p.payment_method_id
         join staff st on st.id = p.recorded_by
        where ${clauses.join(" and ")}
        order by p.payment_date desc, p.id desc`,
      params,
    );
    return rows.map(mapPaymentList);
  });

export const getPayment = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .handler(async ({ data }): Promise<PaymentDetail> => {
    const sql = await db();
    const rows = await sql.query<Record<string, unknown>>(
      `select p.id, p.customer_id, c.name as customer_name, p.payment_date, p.amount,
              coalesce((select sum(allocated_amount) from payment_allocations a where a.payment_id = p.id),0) as allocated,
              m.name as method_name, p.reference, p.status, p.notes, st.full_name as recorded_by_name,
              p.payment_method_id as method_id
         from payments p
         join customers c on c.id = p.customer_id
         join payment_methods m on m.id = p.payment_method_id
         join staff st on st.id = p.recorded_by
        where p.id = $1`,
      [data.id],
    );
    if (!rows[0]) throw new Error("Không tìm thấy thanh toán.");
    const alloc = await sql.query<Record<string, unknown>>(
      `select pa.invoice_id, i.invoice_number, pa.allocated_amount, i.total_amount, i.paid_amount, i.status
         from payment_allocations pa
         join invoices i on i.id = pa.invoice_id
        where pa.payment_id = $1`,
      [data.id],
    );
    return {
      ...mapPaymentList(rows[0]),
      methodId: asInt(rows[0].method_id),
      allocations: alloc.map((a) => ({
        invoiceId: asInt(a.invoice_id),
        invoiceNumber: String(a.invoice_number ?? "—"),
        allocatedAmount: asMoney(a.allocated_amount),
        invoiceTotal: asMoney(a.total_amount),
        invoicePaid: asMoney(a.paid_amount),
        invoiceStatus: String(a.status) as InvoiceStatus,
      })),
    };
  });

export const openInvoicesForCustomer = createServerFn({ method: "GET" })
  .validator(z.object({ customerId: z.number() }))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql.query<Record<string, unknown>>(
      `${INVOICE_SELECT}
        where i.customer_id = $1
          and i.status in ('issued','partial','overdue')
          and i.total_amount > i.paid_amount
        order by i.due_date, i.id`,
      [data.customerId],
    );
    return rows.map(mapInvoiceList);
  });

const recordPaymentZ = actorZ.extend({
  customerId: z.number(),
  paymentDate: z.string(),
  amount: z.number().positive(),
  methodId: z.number(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  allocations: z.array(z.object({ invoiceId: z.number(), amount: z.number().positive() })).default([]),
});

async function applyInvoicePaid(sql: Sql, invoiceId: number, role: Role) {
  const row = await sql.query<{
    total_amount: string;
    paid_amount: string;
    status: string;
    due_date: string;
  }>(`select total_amount, paid_amount, status, due_date from invoices where id = $1`, [invoiceId]);
  const inv = row[0];
  if (!inv) return;
  const total = asMoney(inv.total_amount);
  const paid = asMoney(inv.paid_amount);
  const today = todayIso();
  let next: string = inv.status;
  if (paid >= total - 0.001) next = "paid";
  else if (paid > 0.001) next = inv.due_date < today ? "overdue" : "partial";
  else next = inv.due_date < today ? "overdue" : "issued";
  if (next !== inv.status) {
    await sql`update invoices set status = ${next}, updated_at = now() where id = ${invoiceId}`;
    await history(sql, invoiceId, inv.status, next, role, "Cập nhật theo thanh toán");
  }
  if (next === "paid") {
    await sql`
      update reminder_logs set status = 'cancelled'
      where invoice_id = ${invoiceId} and status in ('scheduled','sending','failed')
    `;
  }
}

export const recordPayment = createServerFn({ method: "POST" })
  .validator(recordPaymentZ)
  .handler(async ({ data }) => {
    guard(data.actorRole, "payment.record");
    const sql = await db();
    const allocSum = roundMoney(data.allocations.reduce((s, a) => s + a.amount, 0));
    if (allocSum - data.amount > 0.001) {
      throw new Error("Tổng phân bổ không được vượt số tiền thanh toán.");
    }
    const inserted = await sql<{ id: number }>`
      insert into payments (customer_id, payment_date, amount, payment_method_id, reference, status, notes, recorded_by)
      values (
        ${data.customerId}, ${data.paymentDate}, ${data.amount}, ${data.methodId},
        ${data.reference || null}, 'confirmed', ${data.notes || null}, ${staffId(data.actorRole)}
      ) returning id
    `;
    const id = asInt(inserted[0]?.id);
    for (const a of data.allocations) {
      const inv = await sql.query<{ total_amount: string; paid_amount: string; customer_id: number }>(
        `select total_amount, paid_amount, customer_id from invoices where id = $1`,
        [a.invoiceId],
      );
      const row = inv[0];
      if (!row) throw new Error("Hóa đơn phân bổ không tồn tại.");
      if (asInt(row.customer_id) !== data.customerId) throw new Error("Hóa đơn không thuộc khách hàng này.");
      const remain = remainingOf(asMoney(row.total_amount), asMoney(row.paid_amount));
      if (a.amount - remain > 0.001) throw new Error("Không được phân bổ vượt số còn lại của hóa đơn.");
      await sql`
        insert into payment_allocations (payment_id, invoice_id, allocated_amount)
        values (${id}, ${a.invoiceId}, ${a.amount})
      `;
      await sql`
        update invoices set paid_amount = paid_amount + ${a.amount}, updated_at = now() where id = ${a.invoiceId}
      `;
      await applyInvoicePaid(sql, a.invoiceId, data.actorRole);
    }
    await audit(sql, data.actorRole, "payment.record", "payment", id, `Ghi nhận ${data.amount.toLocaleString("vi-VN")} ₫`);
    return { id };
  });

export const allocatePayment = createServerFn({ method: "POST" })
  .validator(
    actorZ.extend({
      paymentId: z.number(),
      allocations: z.array(z.object({ invoiceId: z.number(), amount: z.number().positive() })),
    }),
  )
  .handler(async ({ data }) => {
    guard(data.actorRole, "payment.allocate");
    const sql = await db();
    const pay = await sql.query<{ amount: string; status: string; customer_id: number }>(
      `select amount, status, customer_id from payments where id = $1`,
      [data.paymentId],
    );
    if (!pay[0] || pay[0].status !== "confirmed") throw new Error("Chỉ phân bổ thanh toán đã xác nhận.");
    const already = await sql.query<{ s: string }>(
      `select coalesce(sum(allocated_amount),0) as s from payment_allocations where payment_id = $1`,
      [data.paymentId],
    );
    const used = asMoney(already[0]?.s);
    const add = roundMoney(data.allocations.reduce((s, a) => s + a.amount, 0));
    if (used + add - asMoney(pay[0].amount) > 0.001) {
      throw new Error("Tổng phân bổ vượt số tiền thanh toán.");
    }
    for (const a of data.allocations) {
      const inv = await sql.query<{ total_amount: string; paid_amount: string; customer_id: number }>(
        `select total_amount, paid_amount, customer_id from invoices where id = $1`,
        [a.invoiceId],
      );
      const row = inv[0];
      if (!row) throw new Error("Hóa đơn không tồn tại.");
      if (asInt(row.customer_id) !== asInt(pay[0].customer_id)) {
        throw new Error("Hóa đơn không thuộc khách hàng của khoản thanh toán.");
      }
      const remain = remainingOf(asMoney(row.total_amount), asMoney(row.paid_amount));
      if (a.amount - remain > 0.001) throw new Error("Vượt số còn lại của hóa đơn.");
      await sql.query(
        `insert into payment_allocations (payment_id, invoice_id, allocated_amount)
         values ($1,$2,$3)
         on conflict (payment_id, invoice_id)
         do update set allocated_amount = payment_allocations.allocated_amount + excluded.allocated_amount`,
        [data.paymentId, a.invoiceId, a.amount],
      );
      await sql`update invoices set paid_amount = paid_amount + ${a.amount}, updated_at = now() where id = ${a.invoiceId}`;
      await applyInvoicePaid(sql, a.invoiceId, data.actorRole);
    }
    return { ok: true };
  });

export const reversePayment = createServerFn({ method: "POST" })
  .validator(actorZ.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    guard(data.actorRole, "payment.reverse");
    const sql = await db();
    const pay = await sql.query<{ status: string }>(`select status from payments where id = $1`, [data.id]);
    if (!pay[0] || pay[0].status !== "confirmed") throw new Error("Không thể đảo ngược khoản này.");
    const alloc = await sql.query<{ invoice_id: number; allocated_amount: string }>(
      `select invoice_id, allocated_amount from payment_allocations where payment_id = $1`,
      [data.id],
    );
    for (const a of alloc) {
      await sql`
        update invoices set paid_amount = paid_amount - ${asMoney(a.allocated_amount)}, updated_at = now()
        where id = ${asInt(a.invoice_id)}
      `;
      await applyInvoicePaid(sql, asInt(a.invoice_id), data.actorRole);
    }
    await sql`delete from payment_allocations where payment_id = ${data.id}`;
    await sql`update payments set status = 'reversed' where id = ${data.id}`;
    await audit(sql, data.actorRole, "payment.reverse", "payment", data.id, "Đảo ngược thanh toán");
    return { ok: true };
  });

export const listReminders = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const logs = await sql.query<Record<string, unknown>>(
    `select r.id, r.invoice_id, i.invoice_number, c.name as customer_name, r.reminder_type,
            r.status, r.sent_at, r.content_snapshot, r.retry_count, r.created_at, i.due_date
       from reminder_logs r
       join invoices i on i.id = r.invoice_id
       join customers c on c.id = i.customer_id
      order by r.created_at desc
      limit 80`,
  );
  const rules = await sql<{
    id: number;
    name: string;
    days_overdue: number;
    channel: string;
    is_active: boolean;
  }>`select id, name, days_overdue, channel, is_active from reminder_rules order by days_overdue`;
  return {
    logs: logs.map(mapReminder),
    rules: rules.map(
      (r) =>
        ({
          id: asInt(r.id),
          name: r.name,
          daysOverdue: asInt(r.days_overdue),
          channel: r.channel,
          isActive: Boolean(r.is_active),
        }) satisfies ReminderRule,
    ),
  };
});

export const runReminders = createServerFn({ method: "POST" })
  .validator(actorZ)
  .handler(async ({ data }) => {
    guard(data.actorRole, "reminder.run");
    const sql = await db();
    const today = todayIso();
    const rules = await sql<{
      id: number;
      name: string;
      days_overdue: number;
      channel: string;
      template: string;
    }>`select id, name, days_overdue, channel, template from reminder_rules where is_active = true`;
    const invoices = await sql.query<Record<string, unknown>>(
      `select i.id, i.invoice_number, i.due_date, i.total_amount, i.paid_amount, c.name, c.email
         from invoices i
         join customers c on c.id = i.customer_id
        where i.status in ('issued','partial','overdue')
          and i.due_date < $1
          and i.total_amount > i.paid_amount`,
      [today],
    );
    let created = 0;
    for (const inv of invoices) {
      const days = daysBetween(String(inv.due_date), today);
      for (const rule of rules) {
        if (days < asInt(rule.days_overdue)) continue;
        const exists = await sql.query<{ id: number }>(
          `select id from reminder_logs where invoice_id = $1 and rule_id = $2 and status = 'sent' limit 1`,
          [asInt(inv.id), asInt(rule.id)],
        );
        if (exists.length) continue;
        const remain = remainingOf(asMoney(inv.total_amount), asMoney(inv.paid_amount));
        const content = rule.template
          .replaceAll("{customer}", String(inv.name))
          .replaceAll("{number}", String(inv.invoice_number ?? "—"))
          .replaceAll("{amount}", remain.toLocaleString("vi-VN") + " ₫");
        await sql`
          insert into reminder_logs (invoice_id, rule_id, reminder_type, status, sent_at, content_snapshot)
          values (${asInt(inv.id)}, ${asInt(rule.id)}, ${rule.channel}, 'sent', now(), ${content})
        `;
        created += 1;
      }
    }
    await audit(sql, data.actorRole, "reminder.run", "reminder", 0, `Đã gửi ${created} nhắc nợ`);
    return { created };
  });

export const getAgingReport = createServerFn({ method: "GET" }).handler(async (): Promise<AgingRow[]> => {
  const sql = await db();
  const today = todayIso();
  const rows = await sql.query<Record<string, unknown>>(
    `select c.id as customer_id, c.name as customer_name,
            coalesce(sum(case when i.due_date >= $1 then i.total_amount - i.paid_amount else 0 end),0) as current,
            coalesce(sum(case when i.due_date < $1 and i.due_date >= $1::date - 30 then i.total_amount - i.paid_amount else 0 end),0) as d30,
            coalesce(sum(case when i.due_date < $1::date - 30 and i.due_date >= $1::date - 60 then i.total_amount - i.paid_amount else 0 end),0) as d60,
            coalesce(sum(case when i.due_date < $1::date - 60 and i.due_date >= $1::date - 90 then i.total_amount - i.paid_amount else 0 end),0) as d90,
            coalesce(sum(case when i.due_date < $1::date - 90 then i.total_amount - i.paid_amount else 0 end),0) as d90plus
       from customers c
       join invoices i on i.customer_id = c.id
      where i.status in ('issued','partial','overdue')
        and i.total_amount > i.paid_amount
      group by c.id, c.name
      order by 7 desc`,
    [today],
  );
  return rows.map((r) => {
    const current = asMoney(r.current);
    const d30 = asMoney(r.d30);
    const d60 = asMoney(r.d60);
    const d90 = asMoney(r.d90);
    const d90plus = asMoney(r.d90plus);
    return {
      customerId: asInt(r.customer_id),
      customerName: String(r.customer_name),
      current,
      d30,
      d60,
      d90,
      d90plus,
      total: roundMoney(current + d30 + d60 + d90 + d90plus),
    };
  });
});

export const getRevenueReport = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const byMonth = await sql.query<{ month: string; revenue: string; tax: string; count: number }>(
    `select to_char(issue_date,'YYYY-MM') as month,
            coalesce(sum(total_amount),0) as revenue,
            coalesce(sum(tax_amount),0) as tax,
            count(*)::int as count
       from invoices
      where status not in ('cancelled','draft')
      group by 1 order by 1`,
  );
  const byCustomer = await sql.query<{ name: string; revenue: string; count: number }>(
    `select c.name, coalesce(sum(i.total_amount),0) as revenue, count(*)::int as count
       from invoices i join customers c on c.id = i.customer_id
      where i.status not in ('cancelled','draft')
      group by c.name
      order by 2 desc
      limit 8`,
  );
  const byProduct = await sql.query<{ name: string; revenue: string; qty: string }>(
    `select it.description as name, coalesce(sum(it.line_total),0) as revenue, coalesce(sum(it.quantity),0) as qty
       from invoice_items it
       join invoices i on i.id = it.invoice_id
      where i.status not in ('cancelled','draft')
      group by it.description
      order by 2 desc
      limit 8`,
  );
  return {
    byMonth: byMonth.map((r) => ({
      month: r.month,
      revenue: asMoney(r.revenue),
      tax: asMoney(r.tax),
      count: asInt(r.count),
    })),
    byCustomer: byCustomer.map((r) => ({
      name: r.name,
      revenue: asMoney(r.revenue),
      count: asInt(r.count),
    })),
    byProduct: byProduct.map((r) => ({
      name: r.name,
      revenue: asMoney(r.revenue),
      qty: asMoney(r.qty),
    })),
  };
});

export const getTaxReport = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql.query<{ rate: string; name: string; net: string; tax: string }>(
    `select t.rate, t.name,
            coalesce(sum(it.line_total - it.tax_amount),0) as net,
            coalesce(sum(it.tax_amount),0) as tax
       from invoice_items it
       join invoices i on i.id = it.invoice_id
       join tax_rates t on t.id = it.tax_rate_id
      where i.status not in ('cancelled','draft')
      group by t.rate, t.name
      order by t.rate`,
  );
  return rows.map((r) => ({
    rate: asMoney(r.rate),
    name: r.name,
    net: asMoney(r.net),
    tax: asMoney(r.tax),
  }));
});

export const listAudit = createServerFn({ method: "GET" }).handler(async (): Promise<AuditLog[]> => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select a.id, st.full_name as actor_name, a.action, a.entity_type, a.entity_id, a.summary, a.created_at
       from audit_logs a join staff st on st.id = a.actor_id
      order by a.created_at desc, a.id desc
      limit 100`,
  );
  return rows.map(mapAudit);
});

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const companyRows = await sql<{ key: string; value: string }>`select key, value from system_settings`;
  const series = await sql<{
    id: number;
    code: string;
    name: string;
    prefix: string;
    current_number: number;
    year: number;
    is_active: boolean;
  }>`select * from invoice_series order by year desc, id desc`;
  const tax = await sql<{ id: number; name: string; rate: string; is_active: boolean }>`select * from tax_rates order by rate`;
  const staffRows = await sql<{
    id: number;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    created_at: string;
  }>`select id, full_name, email, role, is_active, created_at from staff order by id asc`;
  const ruleRows = await sql<{
    id: number;
    name: string;
    days_overdue: number;
    channel: string;
    template: string;
    is_active: boolean;
  }>`select id, name, days_overdue, channel, template, is_active from reminder_rules order by days_overdue asc`;

  return {
    company: Object.fromEntries(companyRows.map((r) => [r.key, r.value])) as CompanySettings,
    series: series.map((s) => ({
      id: asInt(s.id),
      code: s.code,
      name: s.name,
      prefix: s.prefix,
      currentNumber: asInt(s.current_number),
      year: asInt(s.year),
      isActive: Boolean(s.is_active),
    })),
    taxRates: tax.map((t) => ({
      id: asInt(t.id),
      name: t.name,
      rate: asMoney(t.rate),
      isActive: Boolean(t.is_active),
    })),
    staff: staffRows.map((st) => ({
      id: asInt(st.id),
      fullName: String(st.full_name),
      email: String(st.email),
      role: st.role as Role,
      isActive: Boolean(st.is_active),
      createdAt: String(st.created_at ?? ""),
    })),
    rules: ruleRows.map((ru) => ({
      id: asInt(ru.id),
      name: String(ru.name),
      daysOverdue: asInt(ru.days_overdue),
      channel: String(ru.channel),
      template: String(ru.template),
      isActive: Boolean(ru.is_active),
    })),
  };
});

export const saveSettings = createServerFn({ method: "POST" })
  .validator(
    actorZ.extend({
      company: z.object({
        name: z.string(),
        taxCode: z.string(),
        address: z.string(),
        email: z.string(),
        phone: z.string(),
        bankName: z.string(),
        bankAccount: z.string(),
        legalRep: z.string(),
      }),
    }),
  )
  .handler(async ({ data }) => {
    guard(data.actorRole, "settings.write");
    const sql = await db();
    for (const [k, v] of Object.entries(data.company)) {
      await sql`
        insert into system_settings (key, value) values (${k}, ${v})
        on conflict (key) do update set value = excluded.value
      `;
    }
    await audit(sql, data.actorRole, "settings.update", "settings", 0, "Cập nhật thông tin công ty");
    return { ok: true };
  });

export const saveInvoiceSeries = createServerFn({ method: "POST" })
  .validator(
    actorZ.extend({
      series: z.object({
        id: z.number().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        prefix: z.string().default(""),
        year: z.number().int(),
        isActive: z.boolean().default(true),
      }),
    }),
  )
  .handler(async ({ data }) => {
    guard(data.actorRole, "settings.write");
    const sql = await db();
    const s = data.series;
    if (s.id) {
      await sql`
        update invoice_series
           set code = ${s.code.trim().toUpperCase()},
               name = ${s.name.trim()},
               prefix = ${s.prefix.trim()},
               year = ${s.year},
               is_active = ${s.isActive}
         where id = ${s.id}
      `;
      await audit(sql, data.actorRole, "series.update", "series", s.id, `Cập nhật dải ký hiệu ${s.code}`);
      return { id: s.id };
    } else {
      const inserted = await sql<{ id: number }>`
        insert into invoice_series (code, name, prefix, year, is_active, current_number)
        values (${s.code.trim().toUpperCase()}, ${s.name.trim()}, ${s.prefix.trim()}, ${s.year}, ${s.isActive}, 0)
        returning id
      `;
      const newId = asInt(inserted[0]?.id);
      await audit(sql, data.actorRole, "series.create", "series", newId, `Thêm dải ký hiệu ${s.code}`);
      return { id: newId };
    }
  });

export const listStaff = createServerFn({ method: "GET" }).handler(async (): Promise<StaffMember[]> => {
  const sql = await db();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, full_name, email, role, is_active, created_at from staff order by id asc`,
  );
  return rows.map((r) => ({
    id: asInt(r.id),
    fullName: String(r.full_name),
    email: String(r.email),
    role: r.role as Role,
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at ?? ""),
  }));
});

export const saveStaff = createServerFn({ method: "POST" })
  .validator(
    actorZ.extend({
      staff: z.object({
        id: z.number().optional(),
        fullName: z.string().min(2),
        email: z.string().email(),
        role: roleZ,
        isActive: z.boolean().default(true),
      }),
    }),
  )
  .handler(async ({ data }) => {
    guard(data.actorRole, "settings.write");
    const sql = await db();
    const s = data.staff;
    if (s.id) {
      await sql`
        update staff
           set full_name = ${s.fullName.trim()},
               email = ${s.email.trim()},
               role = ${s.role},
               is_active = ${s.isActive}
         where id = ${s.id}
      `;
      await audit(sql, data.actorRole, "staff.update", "staff", s.id, `Cập nhật nhân viên ${s.fullName}`);
      return { id: s.id };
    } else {
      const ins = await sql<{ id: number }>`
        insert into staff (full_name, email, role, is_active)
        values (${s.fullName.trim()}, ${s.email.trim()}, ${s.role}, ${s.isActive})
        returning id
      `;
      const newId = asInt(ins[0]?.id);
      await audit(sql, data.actorRole, "staff.create", "staff", newId, `Thêm nhân viên ${s.fullName}`);
      return { id: newId };
    }
  });

export const saveReminderRule = createServerFn({ method: "POST" })
  .validator(
    actorZ.extend({
      rule: z.object({
        id: z.number().optional(),
        name: z.string().min(2),
        daysOverdue: z.number().int(),
        channel: z.string().default("email"),
        template: z.string().min(5),
        isActive: z.boolean().default(true),
      }),
    }),
  )
  .handler(async ({ data }) => {
    guard(data.actorRole, "reminder.run");
    const sql = await db();
    const r = data.rule;
    if (r.id) {
      await sql`
        update reminder_rules
           set name = ${r.name.trim()},
               days_overdue = ${r.daysOverdue},
               channel = ${r.channel},
               template = ${r.template.trim()},
               is_active = ${r.isActive}
         where id = ${r.id}
      `;
      await audit(sql, data.actorRole, "reminder_rule.update", "rule", r.id, `Cập nhật quy tắc nhắc nợ ${r.name}`);
      return { id: r.id };
    } else {
      const ins = await sql<{ id: number }>`
        insert into reminder_rules (name, days_overdue, channel, template, is_active)
        values (${r.name.trim()}, ${r.daysOverdue}, ${r.channel}, ${r.template.trim()}, ${r.isActive})
        returning id
      `;
      const newId = asInt(ins[0]?.id);
      await audit(sql, data.actorRole, "reminder_rule.create", "rule", newId, `Thêm quy tắc nhắc nợ ${r.name}`);
      return { id: newId };
    }
  });

export const getCustomerStatement = createServerFn({ method: "GET" })
  .validator(
    z.object({
      customerId: z.number(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<CustomerStatement> => {
    const sql = await db();
    const cRows = await sql.query<Record<string, unknown>>(
      `select c.id, c.code, c.name, c.tax_code, c.address, c.email, c.phone,
              c.customer_type, c.payment_term_days, c.credit_limit, c.group_id, c.is_active,
              g.name as group_name,
              coalesce((select sum(i.total_amount - i.paid_amount)
                          from invoices i
                         where i.customer_id = c.id
                           and i.status in ('issued','partial','overdue')),0) as outstanding,
              (select count(*) from invoices i where i.customer_id = c.id) as invoice_count
         from customers c
         left join customer_groups g on g.id = c.group_id
        where c.id = $1`,
      [data.customerId],
    );
    if (!cRows[0]) throw new Error("Không tìm thấy khách hàng.");
    const customer = mapCustomer(cRows[0]);

    let openingBalance = 0;
    if (data.fromDate) {
      const opInv = await sql.query<{ sum: string }>(
        `select coalesce(sum(total_amount), 0) as sum from invoices where customer_id = $1 and issue_date < $2 and status not in ('draft', 'cancelled')`,
        [data.customerId, data.fromDate],
      );
      const opPay = await sql.query<{ sum: string }>(
        `select coalesce(sum(amount), 0) as sum from payments where customer_id = $1 and payment_date < $2 and status = 'confirmed'`,
        [data.customerId, data.fromDate],
      );
      openingBalance = asMoney(opInv[0]?.sum) - asMoney(opPay[0]?.sum);
    }

    const invClauses = [`customer_id = $1`, `status not in ('draft', 'cancelled')`];
    const invParams: unknown[] = [data.customerId];
    if (data.fromDate) {
      invParams.push(data.fromDate);
      invClauses.push(`issue_date >= $${invParams.length}`);
    }
    if (data.toDate) {
      invParams.push(data.toDate);
      invClauses.push(`issue_date <= $${invParams.length}`);
    }

    const invs = await sql.query<Record<string, unknown>>(
      `select id, invoice_number, issue_date, total_amount, notes,
              (select code from invoice_series where id = series_id) as series_code
         from invoices
        where ${invClauses.join(" and ")}
        order by issue_date asc, id asc`,
      invParams,
    );

    const payClauses = [`customer_id = $1`, `status = 'confirmed'`];
    const payParams: unknown[] = [data.customerId];
    if (data.fromDate) {
      payParams.push(data.fromDate);
      payClauses.push(`payment_date >= $${payParams.length}`);
    }
    if (data.toDate) {
      payParams.push(data.toDate);
      payClauses.push(`payment_date <= $${payParams.length}`);
    }

    const pays = await sql.query<Record<string, unknown>>(
      `select id, payment_date, amount, reference, notes
         from payments
        where ${payClauses.join(" and ")}
        order by payment_date asc, id asc`,
      payParams,
    );

    type RawTx = {
      id: number;
      date: string;
      type: "invoice" | "payment";
      ref: string;
      description: string;
      debit: number;
      credit: number;
    };

    const rawTx: RawTx[] = [
      ...invs.map((i) => ({
        id: asInt(i.id),
        date: String(i.issue_date),
        type: "invoice" as const,
        ref: `${i.series_code || ""}${i.invoice_number ? String(i.invoice_number).padStart(7, "0") : `HĐ#${i.id}`}`,
        description: String(i.notes || "Hóa đơn giá trị gia tăng"),
        debit: asMoney(i.total_amount),
        credit: 0,
      })),
      ...pays.map((p) => ({
        id: asInt(p.id),
        date: String(p.payment_date),
        type: "payment" as const,
        ref: p.reference ? String(p.reference) : `PT#${p.id}`,
        description: String(p.notes || "Thu tiền bán hàng"),
        debit: 0,
        credit: asMoney(p.amount),
      })),
    ];

    rawTx.sort((a, b) => (a.date === b.date ? (a.type === "invoice" ? -1 : 1) : a.date.localeCompare(b.date)));

    let running = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;
    const transactions = rawTx.map((t) => {
      running = roundMoney(running + t.debit - t.credit);
      totalDebit = roundMoney(totalDebit + t.debit);
      totalCredit = roundMoney(totalCredit + t.credit);
      return {
        ...t,
        runningBalance: running,
      };
    });

    return {
      customer,
      fromDate: data.fromDate,
      toDate: data.toDate,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance: running,
      transactions,
    };
  });

export const lookupInvoice = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().min(1) }))
  .handler(async ({ data }): Promise<InvoiceListItem[]> => {
    const sql = await db();
    const term = `%${data.q.trim()}%`;
    const rows = await sql.query<Record<string, unknown>>(
      `${INVOICE_SELECT}
        where (coalesce(i.invoice_number, '') ilike $1
           or coalesce(i.e_invoice_id, '') ilike $1
           or coalesce(c.tax_code, '') ilike $1
           or c.name ilike $1
           or concat(s.code, coalesce(i.invoice_number, '')) ilike $1)
          and i.status not in ('draft')
        order by i.issue_date desc, i.id desc
        limit 25`,
      [term],
    );
    return rows.map(mapInvoiceList);
  });

export const getInvoiceUsageReport = createServerFn({ method: "GET" })
  .handler(async (): Promise<InvoiceUsageReportItem[]> => {
    const sql = await db();
    const seriesRows = await sql.query<Record<string, unknown>>(
      `select s.id, s.code, s.name, s.year, s.current_number,
              count(i.id) filter (where i.status in ('issued','partial','paid','overdue')) as issued_count,
              count(i.id) filter (where i.status = 'cancelled') as cancelled_count,
              count(i.id) filter (where i.status = 'adjusted') as adjusted_count
         from invoice_series s
         left join invoices i on i.series_id = s.id
        group by s.id, s.code, s.name, s.year, s.current_number
        order by s.year desc, s.code asc`,
    );
    return seriesRows.map((r) => {
      const cur = asInt(r.current_number);
      const issued = asInt(r.issued_count);
      const cancelled = asInt(r.cancelled_count);
      const adjusted = asInt(r.adjusted_count);
      const totalUsed = issued + cancelled + adjusted;
      return {
        seriesId: asInt(r.id),
        seriesCode: String(r.code),
        seriesName: String(r.name),
        year: asInt(r.year),
        currentNumber: cur,
        issuedCount: issued,
        cancelledCount: cancelled,
        adjustedCount: adjusted,
        totalUsed,
        remainingQuota: Math.max(0, 10000 - cur),
      };
    });
  });

