import type { Sql } from "@/lib/db";
import {
  addDays,
  asInt,
  computeInvoiceTotals,
  computeLine,
  formatInvoiceNumber,
  roundMoney,
  todayIso,
} from "./calc";

type SeedLine = {
  productId: number;
  qty: number;
  discount?: number;
  price?: number;
};

type SeedInvoice = {
  id: number;
  customerId: number;
  issueOffset: number;
  dueOffset?: number;
  status: string;
  paid?: number;
  notes?: string;
  items: SeedLine[];
  createdBy?: number;
};

const COMPANY = {
  name: "Công ty TNHH Giải pháp Số An Tâm",
  taxCode: "0318765432",
  address: "Tầng 8, 125 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
  email: "ke-toan@antam.vn",
  phone: "028 3822 1900",
  bankName: "Vietcombank – CN TP.HCM",
  bankAccount: "0071000888888",
  legalRep: "Nguyễn Hoàng Nam",
};

export async function ensureSeeded(sql: Sql): Promise<void> {
  const existing = await sql<{ id: number }>`select id from seed_meta where id = 1`;
  if (existing.length > 0) return;

  await sql`
    insert into staff (id, full_name, email, role) values
      (1, 'Lê Minh Quân', 'quan.admin@antam.vn', 'admin'),
      (2, 'Phạm Thu Hà', 'ha.ketoantruong@antam.vn', 'chief'),
      (3, 'Ngô Thanh Tùng', 'tung.ketoan@antam.vn', 'accountant'),
      (4, 'Đặng Mai Chi', 'chi.xem@antam.vn', 'viewer')
    on conflict do nothing
  `;

  await sql`
    insert into customer_groups (id, name, discount_percent) values
      (1, 'VIP', 5),
      (2, 'Doanh nghiệp', 0),
      (3, 'Cá nhân', 0),
      (4, 'Rủi ro', 0)
    on conflict do nothing
  `;

  await sql`
    insert into tax_rates (id, name, rate, is_active) values
      (1, 'Không chịu thuế 0%', 0, true),
      (2, 'GTGT 5%', 5, true),
      (3, 'GTGT 8%', 8, true),
      (4, 'GTGT 10%', 10, true)
    on conflict do nothing
  `;

  await sql`
    insert into invoice_series (id, code, name, prefix, current_number, year, is_active) values
      (1, 'C26T', 'Hóa đơn GTGT 2026', 'C26T', 0, 2026, true),
      (2, 'C25T', 'Hóa đơn GTGT 2025', 'C25T', 18, 2025, false)
    on conflict do nothing
  `;

  await sql`
    insert into payment_methods (id, code, name) values
      (1, 'cash', 'Tiền mặt'),
      (2, 'transfer', 'Chuyển khoản'),
      (3, 'card', 'Thẻ'),
      (4, 'ewallet', 'Ví điện tử')
    on conflict do nothing
  `;

  await sql`
    insert into reminder_rules (id, name, days_overdue, channel, template, is_active) values
      (1, 'Nhắc lần 1 — quá 3 ngày', 3, 'email',
        'Kính gửi {customer}, hóa đơn {number} đã quá hạn 3 ngày. Số tiền còn lại: {amount}. Vui lòng thanh toán giúp An Tâm.', true),
      (2, 'Nhắc lần 2 — quá 7 ngày', 7, 'email',
        'Kính gửi {customer}, hóa đơn {number} đã quá hạn 7 ngày. Số dư: {amount}. Đề nghị thanh toán trong 3 ngày làm việc.', true),
      (3, 'Nhắc lần 3 — quá 15 ngày', 15, 'email',
        'Thông báo công nợ: hóa đơn {number} quá hạn 15 ngày. Số tiền {amount}. Chúng tôi sẽ tạm dừng dịch vụ nếu chưa nhận được thanh toán.', true)
    on conflict do nothing
  `;

  await sql`
    insert into customers (
      id, code, name, tax_code, address, email, phone, customer_type,
      payment_term_days, credit_limit, group_id, is_active
    ) values
      (1, 'KH001', 'Công ty TNHH Thương mại Minh Phát', '0308123456',
        '48 Lê Lợi, Quận 1, TP. Hồ Chí Minh', 'ketoan@minhphat.vn', '028 3821 1100',
        'enterprise', 30, 200000000, 1, true),
      (2, 'KH002', 'Công ty CP Công nghệ Sao Việt', '0109876543',
        'Tòa nhà Vincom, 191 Bà Triệu, Hai Bà Trưng, Hà Nội', 'finance@saoviet.tech', '024 3974 2200',
        'enterprise', 15, 150000000, 2, true),
      (3, 'KH003', 'Công ty TNHH Dệt may Hồng Hà', '3605566778',
        'KCN Biên Hòa 2, Đồng Nai', 'acc@hongha-textile.vn', '0251 3833 4455',
        'enterprise', 45, 300000000, 2, true),
      (4, 'KH004', 'Công ty TNHH Logistics Đông Á', '0312233445',
        'Cảng Cát Lái, TP. Thủ Đức, TP.HCM', 'billing@donga-log.vn', '028 3742 8899',
        'enterprise', 21, 120000000, 1, true),
      (5, 'KH005', 'Nguyễn Thị Mai', null,
        '22 Trưng Nữ Vương, Hải Châu, Đà Nẵng', 'mai.nguyen@gmail.com', '0903 221 118',
        'individual', 7, 20000000, 3, true),
      (6, 'KH006', 'Công ty CP Xây dựng Hòa Bình', '0301998877',
        '236 Nam Kỳ Khởi Nghĩa, Quận 3, TP.HCM', 'ketoan@hoabinh-xd.vn', '028 3930 7777',
        'enterprise', 30, 250000000, 2, true),
      (7, 'KH007', 'Trần Văn Khoa', null,
        '15 Hoàng Diệu, Phú Nhuận, TP.HCM', 'khoa.tran@outlook.com', '0912 445 667',
        'individual', 14, 15000000, 3, true),
      (8, 'KH008', 'Công ty TNHH Thực phẩm Sạch Đà Lạt', '5803344556',
        '12 Trần Phú, Đà Lạt, Lâm Đồng', 'order@dalatfresh.vn', '0263 3822 001',
        'enterprise', 30, 80000000, 2, true),
      (9, 'KH009', 'Công ty CP Giáo dục Tri Thức', '0106677889',
        '88 Láng Hạ, Đống Đa, Hà Nội', 'admin@trithuc.edu.vn', '024 3514 9090',
        'enterprise', 30, 100000000, 1, true),
      (10, 'KH010', 'Công ty TNHH Nội thất Gỗ Việt', '0314455667',
        'KCN Tân Bình, TP.HCM', 'sales@goviet.vn', '028 3842 3344',
        'enterprise', 45, 90000000, 4, true),
      (11, 'KH011', 'Công ty TNHH Dược phẩm Phương Đông', '0407788990',
        'Lô B3, KCN Đà Nẵng', 'finance@phuongdong-pharma.vn', '0236 3655 212',
        'enterprise', 30, 180000000, 2, true),
      (12, 'KH012', 'Lê Hoàng Anh', null,
        '9 Pasteur, Ninh Kiều, Cần Thơ', 'hoanganh.le@yahoo.com', '0939 118 226',
        'individual', 7, 10000000, 3, true)
    on conflict do nothing
  `;

  await sql`
    insert into products (id, code, name, unit, unit_price, tax_rate_id, category, is_active) values
      (1, 'DV-CLOUD', 'Gói phần mềm kế toán Cloud', 'tháng', 2500000, 4, 'Phần mềm', true),
      (2, 'DV-EINV', 'Tư vấn triển khai hóa đơn điện tử', 'gói', 18000000, 4, 'Tư vấn', true),
      (3, 'DV-STORE', 'Lưu trữ hóa đơn điện tử 10 năm', 'năm', 4500000, 4, 'Dịch vụ', true),
      (4, 'DV-MAINT', 'Bảo trì hệ thống định kỳ', 'tháng', 3200000, 3, 'Bảo trì', true),
      (5, 'DV-TRAIN', 'Đào tạo người dùng cuối', 'khóa', 8500000, 4, 'Đào tạo', true),
      (6, 'DV-PAY', 'Tích hợp cổng thanh toán', 'gói', 12000000, 4, 'Tích hợp', true),
      (7, 'DV-TMPL', 'Thiết kế mẫu hóa đơn theo thương hiệu', 'mẫu', 3500000, 4, 'Thiết kế', true),
      (8, 'DV-RPT', 'Module báo cáo nâng cao', 'license', 15000000, 4, 'Phần mềm', true),
      (9, 'DV-HOST', 'Hạ tầng máy chủ cloud', 'tháng', 6800000, 3, 'Hạ tầng', true),
      (10, 'DV-SUP', 'Gói hỗ trợ kỹ thuật 24/7', 'tháng', 4200000, 3, 'Hỗ trợ', true),
      (11, 'DV-AUDIT', 'Rà soát tuân thủ hóa đơn điện tử', 'lần', 22000000, 4, 'Tư vấn', true),
      (12, 'DV-MIG', 'Di chuyển dữ liệu từ Excel/phần mềm cũ', 'gói', 16000000, 4, 'Tích hợp', true)
    on conflict do nothing
  `;

  for (const [k, v] of Object.entries(COMPANY)) {
    await sql`insert into system_settings (key, value) values (${k}, ${v}) on conflict (key) do nothing`;
  }

  const products = await sql<{
    id: number;
    unit_price: string;
    tax_rate_id: number;
    name: string;
    code: string;
  }>`
    select p.id, p.unit_price, p.tax_rate_id, p.name, p.code
    from products p
  `;
  const tax = await sql<{ id: number; rate: string }>`select id, rate from tax_rates`;
  const taxById = new Map(tax.map((t) => [asInt(t.id), Number(t.rate)]));
  const prodById = new Map(
    products.map((p) => [
      asInt(p.id),
      { ...p, id: asInt(p.id), unit_price: Number(p.unit_price), tax_rate_id: asInt(p.tax_rate_id) },
    ]),
  );

  const today = todayIso();
  const invoices: SeedInvoice[] = [
    { id: 1, customerId: 1, issueOffset: -8, status: "draft", items: [{ productId: 1, qty: 6 }, { productId: 10, qty: 6 }], notes: "Gia hạn gói Cloud Q4" },
    { id: 2, customerId: 2, issueOffset: -3, status: "pending", items: [{ productId: 8, qty: 1 }, { productId: 5, qty: 2 }], notes: "Chờ kế toán trưởng duyệt" },
    { id: 3, customerId: 9, issueOffset: -2, status: "pending", items: [{ productId: 2, qty: 1 }, { productId: 7, qty: 2 }] },
    { id: 4, customerId: 1, issueOffset: -18, status: "issued", items: [{ productId: 4, qty: 3 }, { productId: 9, qty: 3 }] },
    { id: 5, customerId: 4, issueOffset: -12, status: "issued", items: [{ productId: 6, qty: 1 }, { productId: 1, qty: 12, discount: 5 }] },
    { id: 6, customerId: 5, issueOffset: -20, dueOffset: -13, status: "overdue", items: [{ productId: 7, qty: 1 }] },
    { id: 7, customerId: 10, issueOffset: -40, dueOffset: -10, status: "overdue", items: [{ productId: 11, qty: 1 }, { productId: 3, qty: 1 }] },
    { id: 8, customerId: 3, issueOffset: -55, dueOffset: -10, status: "overdue", items: [{ productId: 9, qty: 6 }, { productId: 4, qty: 6 }] },
    { id: 9, customerId: 6, issueOffset: -25, status: "partial", paid: 30000000, items: [{ productId: 12, qty: 1 }, { productId: 2, qty: 1 }, { productId: 5, qty: 1 }] },
    { id: 10, customerId: 8, issueOffset: -22, status: "partial", paid: 8000000, items: [{ productId: 1, qty: 12 }, { productId: 10, qty: 12 }] },
    { id: 11, customerId: 11, issueOffset: -16, status: "issued", items: [{ productId: 8, qty: 1 }, { productId: 3, qty: 2 }] },
    { id: 12, customerId: 2, issueOffset: -60, status: "paid", items: [{ productId: 2, qty: 1 }, { productId: 5, qty: 3 }] },
    { id: 13, customerId: 1, issueOffset: -90, status: "paid", items: [{ productId: 1, qty: 12 }, { productId: 4, qty: 12, discount: 5 }] },
    { id: 14, customerId: 9, issueOffset: -75, status: "paid", items: [{ productId: 8, qty: 1 }, { productId: 7, qty: 3 }] },
    { id: 15, customerId: 4, issueOffset: -110, status: "paid", items: [{ productId: 6, qty: 1 }, { productId: 12, qty: 1 }] },
    { id: 16, customerId: 3, issueOffset: -140, status: "paid", items: [{ productId: 11, qty: 1 }] },
    { id: 17, customerId: 6, issueOffset: -160, status: "paid", items: [{ productId: 9, qty: 6 }, { productId: 10, qty: 6 }] },
    { id: 18, customerId: 8, issueOffset: -200, status: "paid", items: [{ productId: 1, qty: 12 }] },
    { id: 19, customerId: 11, issueOffset: -230, status: "paid", items: [{ productId: 2, qty: 1 }, { productId: 3, qty: 1 }] },
    { id: 20, customerId: 2, issueOffset: -250, status: "paid", items: [{ productId: 4, qty: 6 }] },
    { id: 21, customerId: 1, issueOffset: -280, status: "paid", items: [{ productId: 8, qty: 1 }, { productId: 6, qty: 1 }] },
    { id: 22, customerId: 9, issueOffset: -310, status: "paid", items: [{ productId: 5, qty: 4 }] },
    { id: 23, customerId: 7, issueOffset: -14, dueOffset: 0, status: "issued", items: [{ productId: 7, qty: 1 }] },
    { id: 24, customerId: 12, issueOffset: -5, status: "draft", items: [{ productId: 5, qty: 1 }] },
    { id: 25, customerId: 4, issueOffset: -35, status: "paid", items: [{ productId: 10, qty: 3 }, { productId: 4, qty: 3 }] },
    { id: 26, customerId: 3, issueOffset: -48, status: "issued", items: [{ productId: 12, qty: 1 }, { productId: 7, qty: 2 }] },
    { id: 27, customerId: 10, issueOffset: -6, status: "pending", items: [{ productId: 2, qty: 1 }] },
    { id: 28, customerId: 6, issueOffset: -95, status: "cancelled", items: [{ productId: 11, qty: 1 }], notes: "Khách hủy dự án" },
    { id: 29, customerId: 1, issueOffset: -170, status: "paid", items: [{ productId: 9, qty: 3 }, { productId: 10, qty: 3 }] },
    { id: 30, customerId: 11, issueOffset: -45, dueOffset: -15, status: "overdue", items: [{ productId: 4, qty: 4 }, { productId: 9, qty: 4 }] },
  ];

  const terms = new Map<number, number>([
    [1, 30], [2, 15], [3, 45], [4, 21], [5, 7], [6, 30],
    [7, 14], [8, 30], [9, 30], [10, 45], [11, 30], [12, 7],
  ]);

  let issuedSeq = 0;
  const openBalances: { invoiceId: number; remaining: number; customerId: number }[] = [];

  for (const inv of invoices) {
    const issueDate = addDays(today, inv.issueOffset);
    const dueDate =
      inv.dueOffset != null
        ? addDays(today, inv.dueOffset)
        : addDays(issueDate, terms.get(inv.customerId) ?? 30);

    const computed = inv.items.map((it, idx) => {
      const p = prodById.get(it.productId);
      if (!p) throw new Error(`missing product ${it.productId}`);
      const taxRate = taxById.get(p.tax_rate_id) ?? 0;
      const price = it.price ?? p.unit_price;
      const line = computeLine({
        quantity: it.qty,
        unitPrice: price,
        discountPercent: it.discount ?? 0,
        taxRate,
      });
      return {
        ...it,
        ...line,
        taxRateId: p.tax_rate_id,
        description: p.name,
        sort: idx + 1,
        unitPrice: price,
      };
    });
    const totals = computeInvoiceTotals(computed);

    const numbered = !["draft", "pending"].includes(inv.status);
    if (numbered) issuedSeq += 1;
    const invoiceNumber = numbered ? formatInvoiceNumber(issuedSeq) : null;
    const paidAmount =
      inv.status === "paid"
        ? totals.totalAmount
        : roundMoney(inv.paid ?? 0);
    const createdBy = inv.createdBy ?? (inv.status === "draft" ? 3 : 2);
    const issuedAt = numbered ? `${issueDate}T09:15:00+07:00` : null;
    const cancelledAt = inv.status === "cancelled" ? `${issueDate}T16:00:00+07:00` : null;
    const eInvoiceId = numbered && inv.status !== "cancelled" ? `CQT-2026-C26T${issuedSeq.toString().padStart(6, "0")}` : null;

    await sql`
      insert into invoices (
        id, invoice_number, series_id, customer_id, issue_date, due_date, status,
        subtotal, tax_amount, total_amount, paid_amount, notes, e_invoice_id,
        created_by, issued_at, cancelled_at, cancel_reason
      ) values (
        ${inv.id}, ${invoiceNumber}, 1, ${inv.customerId}, ${issueDate}, ${dueDate}, ${inv.status},
        ${totals.subtotal}, ${totals.taxAmount}, ${totals.totalAmount}, ${paidAmount},
        ${inv.notes ?? null}, ${eInvoiceId}, ${createdBy}, ${issuedAt}, ${cancelledAt},
        ${inv.status === "cancelled" ? "Khách hàng hủy dự án" : null}
      )
    `;

    for (const line of computed) {
      await sql`
        insert into invoice_items (
          invoice_id, product_id, description, quantity, unit_price, discount_percent,
          tax_rate_id, tax_amount, line_total, sort_order
        ) values (
          ${inv.id}, ${line.productId}, ${line.description}, ${line.qty}, ${line.unitPrice},
          ${line.discount ?? 0}, ${line.taxRateId}, ${line.tax}, ${line.total}, ${line.sort}
        )
      `;
    }

    await sql`
      insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
      values (${inv.id}, null, 'draft', 'Tạo hóa đơn', ${createdBy})
    `;
    if (inv.status !== "draft") {
      await sql`
        insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
        values (${inv.id}, 'draft', 'pending', 'Gửi duyệt', 3)
      `;
    }
    if (numbered) {
      await sql`
        insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
        values (${inv.id}, 'pending', ${inv.status === "cancelled" ? "issued" : inv.status === "adjusted" ? "issued" : inv.status === "paid" || inv.status === "partial" || inv.status === "overdue" ? "issued" : inv.status}, 'Phát hành hóa đơn', 2)
      `;
    }
    if (inv.status === "partial" || inv.status === "paid" || inv.status === "overdue") {
      if (inv.status !== "overdue" || paidAmount > 0) {
        await sql`
          insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
          values (${inv.id}, 'issued', ${inv.status}, null, 2)
        `;
      } else {
        await sql`
          insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
          values (${inv.id}, 'issued', 'overdue', 'Quá hạn thanh toán', 2)
        `;
      }
    }
    if (inv.status === "cancelled") {
      await sql`
        insert into invoice_status_history (invoice_id, from_status, to_status, note, actor_id)
        values (${inv.id}, 'issued', 'cancelled', 'Khách hàng hủy dự án', 2)
      `;
    }

    const remaining = roundMoney(totals.totalAmount - paidAmount);
    if (remaining > 0 && ["issued", "partial", "overdue"].includes(inv.status)) {
      openBalances.push({ invoiceId: inv.id, remaining, customerId: inv.customerId });
    }
  }

  await sql`update invoice_series set current_number = ${issuedSeq} where id = 1`;

  // Payments for paid + partial invoices
  let paymentId = 0;
  const paidInvoices = invoices.filter((i) => i.status === "paid" || i.status === "partial");
  for (const inv of paidInvoices) {
    const totalsRow = await sql<{ total_amount: string; paid_amount: string; issue_date: string }>`
      select total_amount, paid_amount, issue_date from invoices where id = ${inv.id}
    `;
    const row = totalsRow[0];
    if (!row) continue;
    const amount = Number(row.paid_amount);
    if (amount <= 0) continue;
    paymentId += 1;
    const payDate = addDays(String(row.issue_date), inv.status === "paid" ? 12 : 8);
    const method = inv.customerId % 2 === 0 ? 2 : 1;
    await sql`
      insert into payments (id, customer_id, payment_date, amount, payment_method_id, reference, status, notes, recorded_by)
      values (
        ${paymentId}, ${inv.customerId}, ${payDate}, ${amount}, ${method},
        ${method === 2 ? `VCB-${20260000 + paymentId}` : null},
        'confirmed', ${inv.status === "partial" ? "Thanh toán đợt 1" : "Thanh toán đủ"}, 3
      )
    `;
    await sql`
      insert into payment_allocations (payment_id, invoice_id, allocated_amount)
      values (${paymentId}, ${inv.id}, ${amount})
    `;
  }

  // Reminders for overdue
  const overdue = invoices.filter((i) => i.status === "overdue");
  for (const inv of overdue) {
    const info = await sql<{ invoice_number: string; due_date: string; total_amount: string; paid_amount: string; name: string }>`
      select i.invoice_number, i.due_date, i.total_amount, i.paid_amount, c.name
      from invoices i join customers c on c.id = i.customer_id where i.id = ${inv.id}
    `;
    const r = info[0];
    if (!r) continue;
    const remaining = roundMoney(Number(r.total_amount) - Number(r.paid_amount));
    const content = `Kính gửi ${r.name}, hóa đơn ${r.invoice_number} đã quá hạn. Số tiền còn lại ${remaining.toLocaleString("vi-VN")} ₫.`;
    await sql`
      insert into reminder_logs (invoice_id, rule_id, reminder_type, status, sent_at, content_snapshot, retry_count)
      values (${inv.id}, 1, 'email', 'sent', ${addDays(String(r.due_date), 3) + "T00:30:00+07:00"}, ${content}, 0)
    `;
  }

  await sql`
    insert into audit_logs (actor_id, action, entity_type, entity_id, summary) values
      (3, 'invoice.create', 'invoice', 1, 'Tạo hóa đơn nháp cho Minh Phát'),
      (3, 'invoice.submit', 'invoice', 2, 'Gửi duyệt hóa đơn Sao Việt'),
      (2, 'invoice.issue', 'invoice', 4, 'Phát hành hóa đơn C26T'),
      (3, 'payment.record', 'payment', 1, 'Ghi nhận thanh toán chuyển khoản'),
      (2, 'invoice.cancel', 'invoice', 28, 'Hủy hóa đơn theo yêu cầu khách hàng')
  `;

  await resetSeq(sql, "staff");
  await resetSeq(sql, "customer_groups");
  await resetSeq(sql, "customers");
  await resetSeq(sql, "tax_rates");
  await resetSeq(sql, "products");
  await resetSeq(sql, "invoice_series");
  await resetSeq(sql, "invoices");
  await resetSeq(sql, "invoice_items");
  await resetSeq(sql, "payment_methods");
  await resetSeq(sql, "payments");
  await resetSeq(sql, "payment_allocations");
  await resetSeq(sql, "reminder_rules");
  await resetSeq(sql, "reminder_logs");
  await resetSeq(sql, "audit_logs");

  await sql`insert into seed_meta (id) values (1) on conflict do nothing`;
}

async function resetSeq(sql: Sql, table: string) {
  await sql.query(
    `select setval(pg_get_serial_sequence($1, 'id'), coalesce((select max(id) from ${table}), 1))`,
    [table],
  );
}
